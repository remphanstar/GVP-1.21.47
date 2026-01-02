// UploadAutomationManager.NEW.js - Complete rewrite for image paste automation
// Handles: Multi-file selection → Queue → Clipboard copy → Paste → Navigation → Loop

window.UploadAutomationManager = class UploadAutomationManager {
    constructor(stateManager, uiManager = null) {
        this.stateManager = stateManager;
        this.uiManager = uiManager;
        this._enabled = false;

        // Queue management
        this._queue = [];
        this._activeItem = null;
        this._failedItems = [];
        this._processedCount = 0;

        // State tracking
        this._isProcessing = false;
        this._currentImageId = null;
        this._waitingForGeneration = false;

        // Use centralized selectors with fallbacks
        this.TEXTAREA_SELECTORS = window.GROK_SELECTORS?.TEXTAREA?.VIDEO || [
            'textarea[aria-label="Make a video"]',
            'textarea[aria-label="Create a video"]',
            'textarea[placeholder*="video"]',
            'div[contenteditable="true"][role="textbox"]'
        ];

        this.GALLERY_PATHS = window.GROK_SELECTORS?.PATHS?.GALLERY || ['/imagine/favorites', '/imagine'];
        this.FAVORITES_BUTTON_SELECTOR = window.GROK_SELECTORS?.BUTTON?.FAVORITES || 'button[aria-label="Favorites"]';

        // Bind handlers
        this._boundModeChange = this._handleModeChange.bind(this);
        this._boundPathChange = this._handlePathChange.bind(this);
        this._boundNewRequest = this._handleNewRequest.bind(this);

        // Listen for mode changes
        window.addEventListener('gvp:upload-mode-changed', this._boundModeChange);

        window.Logger.debug('Upload', '🤖 UploadAutomationManager.js file loaded');

        // Ensure Logger is available
        if (!window.Logger) {
            window.Logger = {
                debug: (...args) => { },
                info: (...args) => { },
                warn: (...args) => { },
                error: console.error // Keep error fallback just in case
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // FIX v1.21.40: Robust UI accessor for when uiManager was not injected
    // ═══════════════════════════════════════════════════════════════════
    get _ui() {
        return this.uiManager || window.gvpUIManager || null;
    }

    // ═══════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════

    start() {
        if (this._enabled) return;

        this._enabled = this.stateManager?.isUploadAutomationEnabled?.() ?? false;

        if (!this._enabled) {
            window.Logger.info('Upload', 'Not starting - mode disabled');
            return;
        }

        window.Logger.info('Upload', '🚀 Starting upload automation');
        this._installPathObserver();
        this._installNetworkObserver();
        this._startModerationWatcher(); // DOM fallback for moderation detection

        // If we have queued items, start processing
        if (this._queue.length > 0 && !this._isProcessing) {
            this._processQueue('start');
        }
    }

    destroy() {
        window.Logger.info('Upload', 'Destroying upload automation');
        this._enabled = false;
        this._isProcessing = false;
        this._queue = [];
        this._activeItem = null;
        this._currentImageId = null;
        this._waitingForGeneration = false;
        this._stopModerationWatcher(); // Stop DOM watcher

        window.removeEventListener('gvp:upload-mode-changed', this._boundModeChange);
    }

    /**
     * Pause processing - halts current activity but preserves queue
     * Use this when toggling off to allow resume later
     */
    pause() {
        if (!this._enabled) {
            window.Logger.debug('[GVP Upload] Already paused/disabled');
            return;
        }

        window.Logger.info('[GVP Upload] ⏸️ PAUSING - queue preserved with', this._queue.length, 'items');

        // Stop processing flag
        this._enabled = false;
        this._isProcessing = false;

        // Return active item to front of queue if one exists
        if (this._activeItem) {
            window.Logger.info('[GVP Upload] 📦 Returning active item to queue:', this._activeItem.name);
            this._queue.unshift(this._activeItem);
            this._activeItem = null;
        }

        // Clear transient state but keep queue
        this._currentImageId = null;
        this._waitingForGeneration = false;
        this._moderationTriggered = false;
        this._stopModerationWatcher();

        // Show toast
        if (this.uiManager?.showToast) {
            this.uiManager.showToast(`⏸️ Upload paused - ${this._queue.length} items in queue`, 'info', 3000);
        }
    }

    isEnabled() {
        return this._enabled;
    }

    /**
     * Add files to the queue
     * @param {FileList|File[]} files - Files to process
     */
    enqueueFiles(files) {
        // Sync _enabled state with StateManager (in case events didn't fire)
        const stateEnabled = this.stateManager?.isUploadAutomationEnabled?.() ?? false;
        if (!stateEnabled) {
            window.Logger.warn('[GVP Upload] Cannot enqueue - mode disabled in StateManager');
            return 0;
        }

        // Also update local flag if out of sync
        if (!this._enabled && stateEnabled) {
            window.Logger.info('[GVP Upload] ⚠️ Syncing _enabled flag with StateManager');
            this._enabled = true;
            this.start();
        }

        // Handle both old format (FileList/File[]) and new format (with options)
        let itemsToQueue = [];

        if (files instanceof FileList || (Array.isArray(files) && files[0] instanceof File)) {
            // Old format: just files
            const fileArray = files instanceof FileList ? Array.from(files) : files;
            itemsToQueue = fileArray
                .filter(file => file instanceof File && file.type.startsWith('image/'))
                .map(file => ({
                    file: file,
                    options: { useJson: false, useRaw: false, useToggles: false }
                }));
        } else if (Array.isArray(files) && files[0]?.file instanceof File) {
            // New format: {file, options}
            itemsToQueue = files.filter(item =>
                item.file instanceof File && item.file.type.startsWith('image/')
            );
        }

        if (itemsToQueue.length === 0) {
            window.Logger.warn('[GVP Upload] No valid image files to enqueue');
            return 0;
        }

        // Add to queue with metadata
        itemsToQueue.forEach(item => {
            const id = crypto.randomUUID();
            this._queue.push({
                id: id,
                file: item.file,
                name: item.file.name,
                size: item.file.size,
                type: item.file.type,
                queuedAt: Date.now(),
                attempts: 0,
                status: 'pending',
                options: item.options || { useJson: false, useRaw: false, useToggles: false }
            });
        });

        window.Logger.info('[GVP Upload] ✅ Queued files:', {
            added: itemsToQueue.length,
            total: this._queue.length,
            names: itemsToQueue.map(item => item.file.name)
        });

        // DON'T auto-start - user controls with Play button
        window.Logger.info('[GVP Upload] Files queued. Click Play to start processing.');

        return itemsToQueue.length;
    }

    /**
     * Get checkbox states for a specific item
     * Reads from queue item first (persistent), then UI (ephemeral)
     */
    getCheckboxStates(itemId) {
        // First try to get from queue item (persisted)
        const queueItem = this._queue.find(item => item.id === itemId);
        if (queueItem && queueItem.checkboxes) {
            return queueItem.checkboxes;
        }

        // FIX v1.21.40: Use this._ui instead of this.uiManager (handles null injection)
        if (this._ui?.uiUploadManager?._queueItemCheckboxes) {
            const states = this._ui.uiUploadManager._queueItemCheckboxes.get(itemId);
            if (states) return states;
        }

        return { json: false, raw: false, toggles: false };
    }

    /**
     * Get current status for UI display
     */
    getStatus() {
        return {
            queueLength: this._queue.length,
            processed: this._processedCount,
            failed: this._failedItems.length,
            processing: this._isProcessing,
            activeItem: this._activeItem?.name || null
        };
    }

    /**
     * Clear the entire queue
     */
    clearQueue() {
        const count = this._queue.length;
        this._queue = [];
        this._failedItems = [];
        window.Logger.info(`[GVP Upload] 🗑️ Queue cleared (${count} items removed)`);
        return count;
    }

    /**
     * Cancel current processing
     */
    cancelProcessing() {
        if (!this._isProcessing) {
            window.Logger.info('[GVP Upload] Nothing to cancel - not processing');
            return false;
        }

        window.Logger.info('[GVP Upload] ❌ Cancelling current processing...');
        this._isProcessing = false;
        this._activeItem = null;
        this._currentImageId = null;
        this._waitingForGeneration = false;

        // Clear any pending waits
        if (this._generationStartResolve) {
            this._generationStartResolve();
            this._generationStartResolve = null;
        }
        if (this._pathChangeResolve) {
            this._pathChangeResolve();
            this._pathChangeResolve = null;
        }

        window.Logger.info('[GVP Upload] ✅ Processing cancelled');
        return true;
    }

    /**
     * Handle moderation detection - clear UI and auto-resume
     * Uses step-by-step sequential flow with delays
     * @param {Object} data - Moderation event data
     */
    async handleModerationDetected(data = {}) {
        window.Logger.debug('Upload', '🚨 MODERATION DETECTED - Starting recovery flow', { data });
        window.Logger.debug('Upload', 'Current state:', {
            activeItem: this._activeItem?.name || 'null',
            queueLength: this._queue.length,
            isProcessing: this._isProcessing,
            enabled: this._enabled
        });
        window.Logger.warn('[GVP Upload] ⚠️ STEP 1: Moderation detected!', data);

        // Capture filename BEFORE nullifying activeItem
        const moderatedFilename = this._activeItem?.name || data?.itemName || 'Unknown';
        window.Logger.debug('Upload', 'Captured filename for toast:', moderatedFilename);

        // STEP 1: Set flag to cancel any pending operations
        this._moderationTriggered = true;
        this._isProcessing = false;
        window.Logger.debug('Upload', 'Set _moderationTriggered=true, _isProcessing=false');

        // STEP 2: Mark current item as moderated
        if (this._activeItem) {
            this._activeItem.status = 'moderated';
            this._activeItem.moderatedAt = Date.now();
            this._failedItems.push(this._activeItem);
            window.Logger.info('[GVP Upload] 📋 STEP 2: Marked item as moderated:', this._activeItem.name);
            window.Logger.debug('Upload', 'Added to failedItems. Total failed:', this._failedItems.length);
            this._activeItem = null;
        } else {
            window.Logger.debug('Upload', 'No activeItem to mark as moderated');
        }

        // 1 second delay before clearing
        window.Logger.debug('Upload', '⏳ Waiting 1000ms before clearing card...');
        window.Logger.info('[GVP Upload] ⏳ Waiting 1 second before clearing moderated card...');
        await this._delay(1000);

        // STEP 3: Clear the moderated image card from UI
        window.Logger.debug('Upload', '🧹 STEP 3: Calling _clearModeratedImageCard()...');
        window.Logger.info('[GVP Upload] 🧹 STEP 3: Clearing moderated image card...');
        const cleared = await this._clearModeratedImageCard();
        window.Logger.debug('Upload', 'Card cleared result:', cleared);

        // STEP 4: Show toast notification with filename (FIXED: was using undefined 'item')
        if (this.uiManager?.showToast) {
            window.Logger.debug('Upload', 'Showing toast for:', moderatedFilename);
            this.uiManager.showToast(`⚠️ Moderated: ${moderatedFilename}`, 'warning', 3000);
        }

        // STEP 5: Dispatch status event for UI update
        window.dispatchEvent(new CustomEvent('gvp:upload-queue-status-changed', {
            detail: {
                reason: 'moderation',
                queueLength: this._queue.length,
                processed: this._processedCount,
                failed: this._failedItems.length,
                cleared: cleared
            }
        }));

        // v1.21.43: REMOVED the pause-on-fail logic - just log and continue
        // The card either cleared successfully or was already cleared by Grok's UI
        if (!cleared) {
            window.Logger.debug('Upload', 'Card not found to clear - likely already cleared by Grok, continuing...');
            window.Logger.info('[GVP Upload] ℹ️ Card already cleared or dismissed, continuing to next image...');
        }

        // 1 second delay before processing next
        if (this._queue.length > 0 && this._enabled) {
            window.Logger.info('[GVP Upload] ⏳ STEP 6: Waiting 1 second before next image...');
            await this._delay(1000);

            window.Logger.info('[GVP Upload] 🔄 STEP 7: Getting next image from queue...');
            this._processQueue('moderation-recovery');
        } else {
            window.Logger.info('[GVP Upload] ✅ Queue complete after moderation.');
        }
    }

    /**
     * Clear moderated image card from chat textarea
     * Finds and clicks the Remove button on the moderated image chip
     * @returns {boolean} True if cleared successfully
     */
    async _clearModeratedImageCard() {
        window.Logger.debug('Upload', '🧹 _clearModeratedImageCard() called');
        window.Logger.info('[GVP Upload] 🧹 Looking for moderated image card to clear...');

        const maxAttempts = 5;
        const delayBetweenAttempts = 300;

        // Log what we're searching for
        window.Logger.debug('Upload', 'Searching for moderation indicators...', {
            alertCount,
            removeCount
        });

        // FIX v1.21.43: If no moderated card exists AT ALL, that means it's already been cleared
        // (either by Grok's UI auto-dismiss or another process). This is SUCCESS, not failure!
        if (alertCount === 0) {
            window.Logger.debug('Upload', '✅ No moderated card found - already cleared!');
            window.Logger.info('[GVP Upload] ✅ No moderated card present - already cleared, continuing...');
            return true; // Card is gone = success
        }

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            window.Logger.debug('Upload', `Attempt ${attempt + 1}/${maxAttempts}`);
            // Strategy 1: Look for the error/warning icon (triangle-alert)
            const alertIcons = document.querySelectorAll('svg.lucide-triangle-alert, svg[role="alert"]');

            for (const icon of alertIcons) {
                // Navigate up to find the chip container
                const chip = icon.closest('div[data-state="closed"]') ||
                    icon.closest('.flex.flex-row.items-center');

                if (chip) {
                    // Find the Remove button within this chip
                    const removeBtn = chip.querySelector('button[aria-label="Remove"]');

                    if (removeBtn) {
                        window.Logger.debug('Upload', '✅ Strategy 1 SUCCESS: Found Remove button via alert icon');
                        window.Logger.info('[GVP Upload] ✅ Found Remove button (via alert icon), clicking...');
                        removeBtn.click();
                        await this._delay(200);
                        window.Logger.debug('Upload', 'Clicked! Verifying removal...');
                        window.Logger.info('[GVP Upload] 🧹 Moderated image card cleared!');
                        return true;
                    } else {
                        window.Logger.debug('Upload', 'Strategy 1: Found chip but no Remove button inside');
                    }
                } else {
                    window.Logger.debug('Upload', 'Strategy 1: Alert icon found but could not find parent chip');
                }
            }

            // Strategy 2: Look via wrapper structure containing error icon
            const wrappers = document.querySelectorAll('div.max-w-full');
            for (const wrapper of wrappers) {
                const hasAlert = wrapper.querySelector('svg.lucide-triangle-alert, svg[role="alert"]');
                if (hasAlert) {
                    const removeBtn = wrapper.querySelector('button[aria-label="Remove"]');
                    if (removeBtn) {
                        window.Logger.debug('Upload', '✅ Strategy 2 SUCCESS: Found Remove button via wrapper');
                        window.Logger.info('[GVP Upload] ✅ Found Remove button (via wrapper), clicking...');
                        removeBtn.click();
                        await this._delay(200);
                        window.Logger.debug('Upload', 'Clicked via Strategy 2!');
                        window.Logger.info('[GVP Upload] 🧹 Moderated image card cleared!');
                        return true;
                    } else {
                        window.Logger.debug('Upload', 'Strategy 2: Wrapper has alert but no Remove button');
                    }
                }
            }

            // Strategy 3: Any chip with Remove button that also has an error state
            const allChips = document.querySelectorAll('.flex.flex-row.items-center.text-sm');
            for (const chip of allChips) {
                const hasErrorIcon = chip.querySelector('svg path[d*="21.73 18"]'); // Triangle alert path
                const removeBtn = chip.querySelector('button[aria-label="Remove"]');
                if (hasErrorIcon && removeBtn) {
                    window.Logger.debug('Upload', '✅ Strategy 3 SUCCESS: Found via SVG path match');
                    window.Logger.info('[GVP Upload] ✅ Found Remove button (via path match), clicking...');
                    removeBtn.click();
                    await this._delay(200);
                    window.Logger.debug('Upload', 'Clicked via Strategy 3!');
                    window.Logger.info('[GVP Upload] 🧹 Moderated image card cleared!');
                    return true;
                }
            }

            // FIX v1.21.43: Re-check if card disappeared during our attempts
            const alertsNow = document.querySelectorAll('svg.lucide-triangle-alert, svg[role="alert"]').length;
            if (alertsNow === 0) {
                window.Logger.debug('Upload', '✅ Card disappeared during attempts - already cleared!');
                window.Logger.info('[GVP Upload] ✅ Card cleared externally, continuing...');
                return true;
            }

            if (attempt < maxAttempts - 1) {
                window.Logger.debug(`[GVP Upload] Attempt ${attempt + 1}/${maxAttempts} - waiting...`);
                await this._delay(delayBetweenAttempts);
            }
        }

        window.Logger.error('Upload', '❌ FAILED: All 5 attempts exhausted, could not find moderated card');
        window.Logger.warn('[GVP Upload] ⚠️ Could not find moderated image card to clear');
        return false;
    }

    /**
     * Start watching DOM for moderated image cards (fallback detection)
     * This catches moderation even when network response parsing fails
     * FIX v1.21.43: Only watch INPUT area, not entire page (prevents false positives from video gen moderation)
     */
    _startModerationWatcher() {
        if (this._moderationObserver) {
            return; // Already watching
        }

        window.Logger.info('[GVP Upload] 👁️ Starting DOM moderation watcher...');

        this._moderationObserver = new MutationObserver((mutations) => {
            // Don't check if we're not processing
            if (!this._isProcessing) return;
            // Don't check if we're already handling moderation
            if (this._handlingModeration) return;

            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Check if this contains a moderation error indicator
                            const hasErrorIcon = node.querySelector?.('svg.lucide-triangle-alert') ||
                                node.querySelector?.('svg[role="alert"]') ||
                                node.querySelector?.('svg path[d*="21.73 18"]');

                            // Also check for error text
                            const textContent = node.textContent?.toLowerCase() || '';
                            const hasErrorText = textContent.includes('moderated') ||
                                textContent.includes('content policy') ||
                                textContent.includes('cannot be');

                            // FIX v1.21.43: Also verify this is near the input area (has a Remove button)
                            // Video gen moderation in chat doesn't have a Remove button
                            const hasRemoveButton = node.querySelector?.('button[aria-label="Remove"]') ||
                                node.closest?.('form')?.querySelector('button[aria-label="Remove"]');

                            if ((hasErrorIcon || hasErrorText) && hasRemoveButton) {
                                window.Logger.warn('[GVP Upload] 🚨 DOM detected moderated image card!');
                                this._handleDomModerationDetected();
                                return; // Stop checking this batch
                            }
                        }
                    }
                }
            }
        });

        // Watch the input form area specifically, or fallback to body
        const inputForm = document.querySelector('form[data-testid="chat-input-form"]') ||
            document.querySelector('form') ||
            document.body;

        this._moderationObserver.observe(inputForm, {
            childList: true,
            subtree: true
        });

        window.Logger.debug('Upload', 'Moderation watcher observing:', inputForm.tagName, inputForm.id || inputForm.className);
    }

    /**
     * Stop the moderation watcher
     */
    _stopModerationWatcher() {
        if (this._moderationObserver) {
            this._moderationObserver.disconnect();
            this._moderationObserver = null;
            window.Logger.debug('[GVP Upload] 👁️ Moderation watcher stopped');
        }
    }

    /**
     * Handle moderation detected via DOM observation
     */
    async _handleDomModerationDetected() {
        // Prevent duplicate handling
        if (this._handlingModeration) return;
        this._handlingModeration = true;

        window.Logger.warn('[GVP Upload] ⚠️ Moderation detected via DOM!');

        // Give UI a moment to fully render
        await this._delay(200);

        // Use the existing handler
        await this.handleModerationDetected({
            source: 'dom-observer',
            timestamp: Date.now()
        });

        this._handlingModeration = false;
    }

    // ═══════════════════════════════════════════════════════════════════
    // QUEUE PROCESSING
    // ═══════════════════════════════════════════════════════════════════

    async _processQueue(trigger = 'unknown') {
        window.Logger.debug('Upload', '🟢 processQueue started', {
            trigger: trigger,
            enabled: this._enabled,
            isProcessing: this._isProcessing,
            queueLength: this._queue.length,
            activeItem: this._activeItem?.name || 'null',
            failedCount: this._failedItems.length,
            processedCount: this._processedCount,
            currentPath: window.location.pathname,
            isOnGallery: this._isOnGalleryPage()
        });
        window.Logger.debug('Upload', 'Queue items:', this._queue.map(i => ({ name: i.name, status: i.status, attempts: i.attempts })));

        if (!this._enabled) {
            window.Logger.debug('Upload', '⛔ EXIT: mode disabled');
            window.Logger.info('[GVP Upload] Processing stopped - mode disabled');
            return;
        }

        // 🔧 FIX v1.21.35: Quick Mode Priority Guard
        // Upload Mode defers when Quick Raw/JSON/Edit modes are active to prevent conflicts
        const state = this.stateManager?.getState?.();
        const quickLaunchMode = state?.ui?.quickLaunchMode;
        window.Logger.debug('Upload', 'Quick Launch Mode check:', quickLaunchMode);
        if (quickLaunchMode && ['raw', 'json', 'edit'].includes(quickLaunchMode)) {
            window.Logger.debug('Upload', '⏸️ DEFERRING: Quick mode active, will retry in 2s');
            window.Logger.info(`[GVP Upload] ⏸️ Deferring - Quick ${quickLaunchMode.toUpperCase()} mode is active`);
            // Retry after 2 seconds in case Quick Mode finishes
            setTimeout(() => this._processQueue('quick-mode-defer'), 2000);
            return;
        }

        if (this._isProcessing) {
            window.Logger.debug('Upload', '⛔ EXIT: already processing');
            window.Logger.info('[GVP Upload] Already processing queue');
            return;
        }

        if (this._queue.length === 0) {
            window.Logger.debug('Upload', '✅ Queue empty - auto-disabling');
            window.Logger.info('[GVP Upload] ✅ Queue empty - all files processed');
            this._isProcessing = false;
            this._activeItem = null;

            // Auto-disable upload mode when done
            window.Logger.info('[GVP Upload] 🔄 Auto-disabling upload mode (queue complete)');
            if (this._stateManager && this._stateManager.setUploadAutomationEnabled) {
                this._stateManager.setUploadAutomationEnabled(false);
            }

            return;
        }

        // Ensure we're on the gallery page
        if (!this._isOnGalleryPage()) {
            window.Logger.info('[GVP Upload] Not on gallery page, navigating back...');
            await this._navigateToGallery();

            // FIX v1.21.39: Doubled wait for page to settle
            await this._delay(1000);

            if (!this._isOnGalleryPage()) {
                window.Logger.error('[GVP Upload] Failed to navigate to gallery page');
                // Retry after delay
                setTimeout(() => this._processQueue('gallery-retry'), 2000);
                return;
            }
        }

        // Get next item
        const item = this._queue.shift();
        this._activeItem = item;
        this._isProcessing = true;
        this._moderationTriggered = false; // Reset for new item

        window.Logger.debug('Upload', '📤 DEQUEUED ITEM - Starting processing', {
            id: item.id,
            name: item.name,
            size: item.size,
            type: item.type,
            attempts: item.attempts,
            status: item.status,
            options: item.options
        });
        window.Logger.debug('Upload', 'Remaining in queue:', this._queue.length);

        // Ensure DOM watcher is active
        this._startModerationWatcher();

        item.attempts += 1;
        item.status = 'processing';

        window.Logger.info('[GVP Upload] 📤 Processing image:', {
            name: item.name,
            attempt: item.attempts,
            remaining: this._queue.length,
            trigger
        });

        // TOAST: Starting to process this image
        if (this.uiManager?.showToast) {
            this.uiManager.showToast(`📤 Uploading: ${item.name}`, 'info', 2000);
        }

        try {
            // STEP 1: Set up uploadPrompt BEFORE file injection so NetworkInterceptor can inject it
            // Grok auto-generates ~1s after image upload - we need prompt ready in advance!
            const checkboxStates = this.getCheckboxStates(item.id);
            window.Logger.debug('Upload', 'STEP 1: Pre-setting uploadPrompt for injection...');
            window.Logger.debug('Upload', 'Checkbox states:', checkboxStates);

            let promptToQueue = '';
            let useSilentMode = false;

            // Get prompt from JSON or Raw textarea
            if (checkboxStates.json) {
                const state = this.stateManager?.getState?.();
                if (state?.promptData) {
                    promptToQueue = JSON.stringify(state.promptData, null, 2);
                    window.Logger.debug('Upload', '📄 Using JSON prompt (', promptToQueue.length, 'chars)');
                }
            } else if (checkboxStates.raw) {
                // FIX v1.21.40: Read from StateManager first (reliable), DOM fallback
                const state = this.stateManager?.getState?.();
                window.Logger.debug('Upload', 'Raw checkbox checked. StateManager rawInput:', state?.rawInput ? `"${state.rawInput.substring(0, 50)}..."` : 'EMPTY');
                window.Logger.debug('Upload', 'UI Manager Available:', !!this._ui);

                if (state?.rawInput?.trim()) {
                    promptToQueue = state.rawInput.trim();
                    window.Logger.debug('Upload', '📝 Retrieved Raw prompt from StateManager (', promptToQueue.length, 'chars)');
                } else {
                    // Fallback to DOM (legacy path)
                    const rawTextarea = this._ui?.shadowRoot?.getElementById('gvp-raw-input-textarea');
                    if (rawTextarea?.value?.trim()) {
                        promptToQueue = rawTextarea.value.trim();
                        window.Logger.debug('Upload', '📝 Using Raw prompt from DOM fallback (', promptToQueue.length, 'chars)');
                    } else {
                        window.Logger.warn('Upload', '⚠️ Raw checkbox checked but prompt is empty (checked State and DOM)');
                    }
                }
            }

            // Check toggles for silent mode
            if (checkboxStates.toggles) {
                const state = this.stateManager?.getState?.();
                useSilentMode = state?.settings?.silentMode || false;
            }

            // Apply silent mode audio block if needed
            if (useSilentMode) {
                const silentModeAudioBlock = [
                    'Motion Level: high',
                    'Music: none',
                    'Ambient Sounds: none',
                    'Sound Effects: heavy breathing',
                    'Mix Level: dialogue slightly louder than sound_effects no music no ambient sounds'
                ].join('\n');

                const normalizedPrompt = promptToQueue.toLowerCase();
                if (!normalizedPrompt.includes('music: none') || !normalizedPrompt.includes('ambient sounds: none')) {
                    promptToQueue = (promptToQueue.trimEnd() + '\n\n' + silentModeAudioBlock).trim();
                    window.Logger.debug('Upload', '🔇 Applied silent mode audio block');
                }
            }

            // Queue the prompt for NetworkInterceptor to inject into Grok's auto-gen request
            if (promptToQueue || checkboxStates.toggles) {
                const state = this.stateManager?.getState?.();
                if (state?.generation) {
                    state.generation.uploadPrompt = promptToQueue;
                    window.Logger.debug('Upload', '📦 Queued uploadPrompt for injection:', promptToQueue.substring(0, 80) + '...');
                    window.Logger.info('[GVP Upload] ✅ Prompt queued for payload injection (', promptToQueue.length, 'chars)');

                    // CRITICAL: Bridge the prompt to the injected page script via postMessage
                    // The gvpFetchInterceptor.js runs in page context and can only receive prompts this way
                    try {
                        window.postMessage({
                            source: 'gvp-extension',
                            type: 'GVP_PROMPT_STATE',
                            payload: {
                                promptText: promptToQueue,
                                isRaw: checkboxStates.raw || false,
                                timestamp: Date.now()
                            }
                        }, '*');
                        window.Logger.debug('Upload', '📡 Posted prompt to page context via GVP_PROMPT_STATE');

                        // FIX v1.21.39: Wait for prompt to propagate to page context
                        // The gvpFetchInterceptor.js needs time to receive and store the prompt
                        await this._delay(500);
                        window.Logger.debug('Upload', '⏳ Waited 500ms for prompt to propagate to page context');
                    } catch (e) {
                        window.Logger.error('Upload', 'Failed to post prompt to page:', e);
                    }
                }

            } else {
                window.Logger.debug('Upload', '⏭️ No prompt to queue (no checkboxes enabled)');
            }

            // STEP 2: Now inject file - Grok's auto-gen will pick up our queued prompt
            window.Logger.debug('Upload', 'STEP 2: Injecting file into input...');
            const success = await this._injectFileIntoInput(item.file);
            window.Logger.debug('Upload', 'File injection result:', success);
            if (!success) {
                throw new Error('Failed to inject file into input');
            }
            window.Logger.info('[GVP Upload] ✅ Image injected:', item.name);

            // Check if cancelled after injection
            if (!this._isProcessing) {
                // FIX v1.21.42: Check if this was due to moderation - DON'T re-queue moderated items!
                if (this._moderationTriggered || item.status === 'moderated') {
                    window.Logger.debug('Upload', 'Item moderated - NOT re-queuing, exiting _processQueue');
                    window.Logger.info('[GVP Upload] 🛑 Item moderated after injection - NOT re-queuing');
                    this._activeItem = null;
                    return;
                }

                window.Logger.info('[GVP Upload] ⏸️ Processing cancelled after injection, stopping...');
                item.status = 'pending'; // Reset to pending so it can be resumed
                this._queue.unshift(item); // Put back at front
                this._activeItem = null;
                return;
            }


            // STEP 3: Wait for Grok's auto-generation to fire
            // The prompt was already queued in state.generation.uploadPrompt (Step 1)
            // NetworkInterceptor will inject it into the /new request automatically
            window.Logger.debug('Upload', 'STEP 3: Waiting for Grok auto-generation (prompt already queued)...');

            // Check if we queued a prompt
            const promptWasQueued = !!(checkboxStates.json || checkboxStates.raw || checkboxStates.toggles);
            if (promptWasQueued) {
                window.Logger.info('[GVP Upload] ⏳ Prompt queued, waiting for Grok auto-gen to use it...');
                // TOAST: Generation starting
                if (this.uiManager?.showToast) {
                    this.uiManager.showToast(`🎬 Generating: ${item.name}`, 'success', 2000);
                }
            } else {
                window.Logger.info('[GVP Upload] ⏳ No prompt queued, Grok will auto-generate...');
            }

            // Step 4: Wait for generation to start
            // FIX v1.21.39: Doubled wait to ensure Grok's auto-gen completes with our prompt
            window.Logger.debug('Upload', 'STEP 4: Waiting 4000ms for Grok auto-generation...');
            window.Logger.info('[GVP Upload] ⏳ Waiting 4 seconds for Grok auto-generation...');
            await this._delay(4000);

            // CHECK: Moderation may have triggered during delay
            window.Logger.debug('Upload', 'Checking moderation after generation wait...');
            window.Logger.debug('Upload', '_moderationTriggered =', this._moderationTriggered);
            if (this._moderationTriggered) {
                window.Logger.debug('Upload', '🛑 MODERATION TRIGGERED after gen wait - Exiting');
                window.Logger.info('[GVP Upload] 🛑 Moderation triggered during generation wait, stopping processQueue...');
                return; // Moderation handler takes over
            }

            // Check if cancelled during delay (user action)
            if (!this._isProcessing) {
                // FIX v1.21.42: Don't re-queue moderated items
                if (this._moderationTriggered || item.status === 'moderated') {
                    window.Logger.debug('Upload', 'Item moderated during wait - NOT re-queuing');
                    this._activeItem = null;
                    return;
                }

                window.Logger.debug('Upload', 'Processing cancelled by user during generation wait');
                window.Logger.info('[GVP Upload] ⏸️ Processing cancelled during generation wait, stopping...');
                item.status = 'pending'; // Reset to pending
                this._queue.unshift(item); // Put back at front
                this._activeItem = null;
                return;
            }

            // Step 5: Navigate back to gallery
            window.Logger.debug('Upload', 'STEP 5: Navigating back to gallery...');
            window.Logger.debug('Upload', 'Current path before nav:', window.location.pathname);
            await this._navigateToGalleryViaButton();
            window.Logger.debug('Upload', 'Path after nav:', window.location.pathname);

            // CHECK: Moderation may have triggered during navigation
            window.Logger.debug('Upload', 'Checking moderation after navigation...');
            if (this._moderationTriggered) {
                window.Logger.debug('Upload', '🛑 MODERATION TRIGGERED after nav - Exiting');
                window.Logger.info('[GVP Upload] 🛑 Moderation triggered during navigation, stopping processQueue...');
                return; // Moderation handler takes over
            }

            // Check if cancelled after navigation (user action)
            if (!this._isProcessing) {
                // FIX v1.21.42: Don't re-queue moderated items
                if (this._moderationTriggered || item.status === 'moderated') {
                    window.Logger.debug('Upload', 'Item moderated after nav - NOT re-queuing');
                    this._activeItem = null;
                    return;
                }

                window.Logger.debug('Upload', 'Processing cancelled by user after navigation');
                window.Logger.info('[GVP Upload] ⏸️ Processing cancelled after navigation, stopping...');
                item.status = 'pending'; // Reset to pending
                this._queue.unshift(item); // Put back at front
                this._activeItem = null;
                return;
            }

            // Mark as completed
            item.status = 'completed';
            this._processedCount += 1;

            window.Logger.debug('Upload', '✅ ITEM COMPLETED');
            window.Logger.debug('Upload', 'Completed item:', item.name);
            window.Logger.debug('Upload', 'Total processed:', this._processedCount);
            window.Logger.debug('Upload', 'Remaining in queue:', this._queue.length);
            window.Logger.info('[GVP Upload] ✅ Completed:', {
                name: item.name,
                processed: this._processedCount,
                remaining: this._queue.length
            });

            // TOAST: Completed successfully
            if (this.uiManager?.showToast) {
                this.uiManager.showToast(`✅ Done: ${item.name}`, 'success', 2000);
            }

            // Clean up
            this._activeItem = null;
            this._currentImageId = null;
            this._waitingForGeneration = false;
            this._isProcessing = false;

            // FIX v1.21.39: Doubled delay before next item for full state reset
            window.Logger.info('[GVP Upload] ⏳ Waiting 2 seconds before next image...');
            await this._delay(2000);

            // Process next item
            this._processQueue('completed');

        } catch (error) {
            window.Logger.error('[GVP Upload] ❌ Failed to process image:', error);

            // Check if this was a moderation event - DON'T retry moderated items
            if (this._moderationTriggered || item.status === 'moderated') {
                window.Logger.info('[GVP Upload] 🛑 Item was moderated - NOT retrying');
                // Clean up
                this._activeItem = null;
                this._currentImageId = null;
                this._waitingForGeneration = false;
                this._isProcessing = false;
                // Moderation handler will take care of queue continuation
                return;
            }

            // Retry logic - only for non-moderated errors, max 3 attempts
            // CRITICAL: Double-check item isn't already failed/moderated to prevent duplicate processing
            const alreadyFailed = this._failedItems.some(f => f.id === item.id);
            const isModerated = item.status === 'moderated' || this._moderationTriggered;

            if (alreadyFailed || isModerated) {
                window.Logger.info('[GVP Upload] 🛑 Item already failed/moderated - NOT retrying:', item.name);
                window.Logger.debug('Upload', 'Skipping retry - already in failedItems or moderated');
            } else if (item.attempts < 3) {
                window.Logger.info('[GVP Upload] 🔄 Retrying:', item.name, `(attempt ${item.attempts + 1}/3)`);
                this._queue.unshift(item); // Put back at front
            } else {
                window.Logger.error('[GVP Upload] ❌ Max retries reached for:', item.name);
                item.status = 'failed';
                item.error = error.message;
                this._failedItems.push(item);
            }

            // Clean up
            this._activeItem = null;
            this._currentImageId = null;
            this._waitingForGeneration = false;
            this._isProcessing = false;

            // If queue is empty and we have failures, auto-disable
            if (this._queue.length === 0 && this._failedItems.length > 0) {
                window.Logger.info('[GVP Upload] 🔄 All items failed - auto-disabling upload mode');
                if (this._stateManager && this._stateManager.setUploadAutomationEnabled) {
                    this._stateManager.setUploadAutomationEnabled(false);
                }
                return;
            }

            // Try next item after delay
            await this._delay(1000);
            this._processQueue('error-retry');
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // FILE INPUT INJECTION
    // ═══════════════════════════════════════════════════════════════════

    async _injectFileIntoInput(file) {
        window.Logger.debug('Uploading file...', file.name);

        try {
            // Find the hidden file input
            const fileInput = document.querySelector('input[type="file"][accept="image/*"][name="files"]');

            if (!fileInput) {
                window.Logger.error('[GVP Upload] Hidden file input not found');
                return false;
            }

            window.Logger.info('[GVP Upload] ✅ Found hidden file input');

            // Create DataTransfer to hold the file
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);

            // Set files to the input
            fileInput.files = dataTransfer.files;

            // Dispatch change event
            const changeEvent = new Event('change', { bubbles: true });
            fileInput.dispatchEvent(changeEvent);

            // Also dispatch input event for React
            const inputEvent = new Event('input', { bubbles: true });
            fileInput.dispatchEvent(inputEvent);

            window.Logger.info('[GVP Upload] ✅ File injected and events dispatched');

            // FIX v1.21.39: Doubled delay to let React fully process file injection
            await this._delay(1000);

            return true;

        } catch (error) {
            window.Logger.error('[GVP Upload] File injection failed:', error);
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // NAVIGATION & PATH MONITORING
    // ═══════════════════════════════════════════════════════════════════

    _installPathObserver() {
        if (this._pathObserverInstalled) return;

        // Watch for path changes using MutationObserver and interval fallback
        let lastPath = window.location.pathname;

        this._pathCheckInterval = setInterval(() => {
            const currentPath = window.location.pathname;
            if (currentPath !== lastPath) {
                lastPath = currentPath;
                this._boundPathChange(currentPath);
            }
        }, 200);

        // Also listen for popstate events
        window.addEventListener('popstate', () => {
            this._boundPathChange(window.location.pathname);
        });

        this._pathObserverInstalled = true;
        window.Logger.debug('Upload', 'Path observer installed');
    }

    _handlePathChange(path) {
        window.Logger.debug('Upload', '🔀 Path changed:', path);

        // Check if we're waiting for post page
        if (this._isProcessing && !this._waitingForGeneration) {
            const imageId = this._extractImageIdFromPath(path);
            if (imageId && this._postPageResolver) {
                this._postPageResolver(imageId);
                this._postPageResolver = null;
            }
        }
    }

    _isOnGalleryPage() {
        const path = window.location.pathname;
        // Must be exact match to favorites or just /imagine (not /imagine/post/...)
        return path === '/imagine/favorites' || path === '/imagine' || path === '/imagine/';
    }

    _extractImageIdFromPath(path) {
        // Extract from /imagine/post/{imageId}
        const match = path.match(/\/imagine\/post\/([a-f0-9\-]+)/i);
        return match ? match[1] : null;
    }

    async _waitForPostPage(timeout = 10000) {
        window.Logger.debug('Upload', '⏳ Waiting for post page...');

        return new Promise((resolve, reject) => {
            // Check if already on post page
            const currentImageId = this._extractImageIdFromPath(window.location.pathname);
            if (currentImageId) {
                window.Logger.debug('Upload', 'Already on post page:', currentImageId);
                resolve(currentImageId);
                return;
            }

            // Set up resolver
            this._postPageResolver = resolve;

            // Timeout
            setTimeout(() => {
                if (this._postPageResolver === resolve) {
                    this._postPageResolver = null;
                    reject(new Error('Timeout waiting for post page'));
                }
            }, timeout);
        });
    }

    /**
     * Navigate to main imagine gallery (/imagine)
     */
    async _navigateToGalleryViaButton() {
        const currentPath = window.location.pathname;
        window.Logger.debug('Upload', '🏠 Navigating to main imagine gallery...', { currentPath });

        // Already on main gallery?
        if (currentPath === '/imagine' || currentPath === '/imagine/') {
            window.Logger.debug('Upload', '✅ Already on main gallery page');
            return;
        }

        // Try to find and click the "Imagine" link in navigation
        const imagineLink = document.querySelector('a[href="/imagine"]');
        if (imagineLink) {
            window.Logger.debug('Upload', '🔗 Found Imagine link, clicking...');
            imagineLink.click();
            await this._delay(1000);

            if (window.location.pathname === '/imagine' || window.location.pathname === '/imagine/') {
                window.Logger.debug('Upload', '✅ Navigation successful via Imagine link');
                return;
            }
        }

        // Fallback: Use history.pushState for SPA navigation
        window.Logger.debug('Upload', 'Using history.pushState to navigate to /imagine');
        window.history.pushState({}, '', '/imagine');

        // Trigger popstate event to make SPA framework react
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));

        await this._delay(1000);

        const newPath = window.location.pathname;
        window.Logger.debug('Upload', 'Path after navigation:', { before: currentPath, after: newPath });

        if (newPath === '/imagine' || newPath === '/imagine/') {
            window.Logger.debug('Upload', '✅ Navigation successful to main gallery');
            return;
        }

        // If all else fails, try traditional fallback methods
        window.Logger.warn('Upload', '⚠️ Navigation attempts failed, using ESC fallback');
        await this._navigateToGallery();
    }

    async _navigateToGallery() {
        window.Logger.debug('Upload', '🏠 Navigating to gallery...');

        const currentPath = window.location.pathname;

        // Already on gallery?
        if (this._isOnGalleryPage()) {
            window.Logger.debug('Upload', 'Already on gallery page');
            return;
        }

        // Try ESC key first (most reliable for Grok)
        await this._sendEscapeKey();
        await this._delay(300);

        if (this._isOnGalleryPage()) {
            window.Logger.debug('Upload', '✅ ESC key worked');
            return;
        }

        // Try back button click
        const backButton = document.querySelector('[data-testid="modal-close-button"], button[aria-label="Close"], button[aria-label="Back"]');
        if (backButton) {
            backButton.click();
            await this._delay(300);

            if (this._isOnGalleryPage()) {
                window.Logger.debug('Upload', '✅ Back button worked');
                return;
            }
        }

        // Try history.back()
        if (window.history.length > 1) {
            window.history.back();
            await this._delay(300);

            if (this._isOnGalleryPage()) {
                window.Logger.debug('Upload', '✅ history.back() worked');
                return;
            }
        }

        // Last resort: Direct navigation using SPA routing
        const galleryPath = '/imagine/favorites';
        window.Logger.debug('Upload', 'Using direct SPA navigation to:', galleryPath);

        window.history.pushState({}, '', galleryPath);
        window.dispatchEvent(new PopStateEvent('popstate'));

        await this._delay(500);
    }

    async _sendEscapeKey() {
        const escEvent = new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            which: 27,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(escEvent);
    }

    // ═══════════════════════════════════════════════════════════════════
    // NETWORK MONITORING
    // ═══════════════════════════════════════════════════════════════════

    _installNetworkObserver() {
        if (this._networkObserverInstalled) return;

        // This will be called by NetworkInterceptor when /new is detected
        // Set up a global handler
        window.addEventListener('gvp:generation-new-detected', this._boundNewRequest);

        this._networkObserverInstalled = true;
        window.Logger.debug('Upload', 'Network observer installed');
    }

    _handleNewRequest(event) {
        if (!this._waitingForGeneration) return;

        const { imageId, requestId } = event.detail || {};

        window.Logger.debug('Upload', '🎬 /new request detected:', { imageId, requestId });

        // Resolve the generation wait promise
        if (this._generationStartResolve) {
            this._generationStartResolve();
            this._generationStartResolve = null;
        }

        this._waitingForGeneration = false;
    }

    async _waitForGenerationStart(timeout = 10000) {
        window.Logger.debug('Upload', '⏳ Waiting for generation to start... (timeout: 10s)');

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                window.Logger.warn('Upload', '⏱️ Timeout - no /new request detected (Grok auto-generate may be OFF)');
                window.Logger.debug('Upload', '📋 Skipping to next image...');
                this._generationStartResolve = null;
                // Resolve (don't reject) to allow continuing to next image
                resolve({ skipped: true, reason: 'no-generation-request' });
            }, timeout);

            this._generationStartResolve = () => {
                clearTimeout(timer);
                this._generationStartResolve = null;
                window.Logger.debug('Upload', '✅ Generation started');
                resolve({ skipped: false });
            };
        });
    }

    async _findTextarea(timeout = 5000) {
        window.Logger.debug('Upload', '🔍 Finding textarea...');

        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            // Check if moderation was triggered - cancel search
            if (this._moderationTriggered) {
                window.Logger.debug('Upload', '⏹️ Textarea search cancelled (moderation triggered)');
                return null;
            }

            for (const selector of this.TEXTAREA_SELECTORS) {
                const element = document.querySelector(selector);
                if (element) {
                    window.Logger.debug('Upload', '✅ Found textarea:', selector);
                    return element;
                }
            }

            await this._delay(200);
        }

        window.Logger.error('Upload', '❌ Textarea not found after', timeout, 'ms');
        return null;
    }

    async _injectPromptAndGenerate(prompt, useSpicy = false, useSilentMode = false) {
        window.Logger.debug('Upload', '💉 Injecting prompt and triggering generation...');

        // Find the textarea
        const textarea = await this._findTextarea();
        if (!textarea) {
            throw new Error('Textarea not found');
        }

        // Apply silent mode audio block if enabled (text-based suffix)
        let finalPrompt = prompt;
        if (useSilentMode) {
            const silentModeAudioBlock = [
                'Motion Level: high',
                'Music: none',
                'Ambient Sounds: none',
                'Sound Effects: heavy breathing',
                'Mix Level: dialogue slightly louder than sound_effects no music no ambient sounds'
            ].join('\n');

            // Only add if not already present
            const normalizedPrompt = prompt.toLowerCase();
            if (!normalizedPrompt.includes('music: none') ||
                !normalizedPrompt.includes('ambient sounds: none')) {
                finalPrompt = prompt.trimEnd() + '\n\n' + silentModeAudioBlock;
                window.Logger.debug('Upload', '🔇 Applied silent mode audio block');
            }
        }

        // NOTE: Spicy mode is NOT added as text - NetworkInterceptor handles it
        // by injecting --mode=extremely-spicy-or-crazy into the payload when
        // state.generation.useSpicy is true. We just log the status here.
        if (useSpicy) {
            window.Logger.debug('Upload', '🌶️ Spicy mode active - NetworkInterceptor will inject mode tag into payload');
        }

        // Clear and inject prompt
        textarea.textContent = '';
        textarea.innerText = '';
        textarea.textContent = finalPrompt;
        textarea.innerText = finalPrompt;

        // Trigger input event
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        window.Logger.debug('Upload', '✅ Prompt injected:', finalPrompt.substring(0, 100) + '...');

        // Wait 2 seconds for UI to process the prompt (was 1.5s, user requested +0.5s more)
        window.Logger.debug('Upload', '⏳ Waiting 2 seconds before clicking Make video button...');
        await this._delay(2000);

        // Find and click "Make video" button
        const makeVideoButton = document.querySelector('button[aria-label="Make video"]');
        if (!makeVideoButton) {
            window.Logger.warn('Upload', '⚠️ Make video button not found, trying fallback selectors...');

            // Fallback selectors
            const fallbackButton = document.querySelector('button[aria-label*="Generate"], button[type="submit"]');
            if (fallbackButton) {
                window.Logger.debug('Upload', '🎬 Clicking fallback generate button...');
                fallbackButton.click();
                return;
            }

            window.Logger.warn('Upload', '⚠️ No generate button found, relying on auto-generation');
            return;
        }

        window.Logger.debug('Upload', '🎬 Clicking "Make video" button...');
        makeVideoButton.click();
        window.Logger.debug('Upload', '✅ Generation triggered with custom prompt');
    }

    _handleModeChange(event) {
        const enabled = event?.detail?.enabled ?? false;
        window.Logger.debug('Upload', 'Mode changed:', enabled);

        if (enabled && !this._enabled) {
            // ENABLE: Start or resume processing
            this._enabled = true;
            this.start();

            // Show resume toast if queue has items
            if (this._queue.length > 0 && this.uiManager?.showToast) {
                this.uiManager.showToast(`▶️ Upload resumed - ${this._queue.length} items in queue`, 'success', 3000);
            }
        } else if (!enabled && this._enabled) {
            // DISABLE: Pause processing but keep queue
            this.pause();
        }
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ═══════════════════════════════════════════════════════════════════
    // EXTERNAL INTEGRATION POINTS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Called by NetworkInterceptor when generation is detected
     * @deprecated Use event listener instead
     */
    notifyGenerationStarted(meta) {
        // Dispatch event for consistency
        window.dispatchEvent(new CustomEvent('gvp:generation-new-detected', {
            detail: meta
        }));
    }

    /**
     * Called by NetworkInterceptor on success
     * Not needed for this workflow but kept for compatibility
     */
    handleGenerationSuccess(meta) {
        window.Logger.debug('Upload', 'Generation success:', meta);
    }

    /**
     * Called by NetworkInterceptor on failure
     * Not needed for this workflow but kept for compatibility
     */
    notifyUploadFailure(meta) {
        window.Logger.warn('Upload', 'Upload failure:', meta);
    }
};
