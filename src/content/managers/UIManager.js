// A:/Tools n Programs/SD-GrokScripts/grok-video-prompter-extension/src/content/managers/UIManager.js







window.UIManager = class UIManager {



    constructor(stateManager, reactAutomation, advancedRawInputManager, multiVideoManager, imageProjectManager, sentenceFormatter, arrayFieldManager) {



        this.stateManager = stateManager;



        this.reactAutomation = reactAutomation;



        this.advancedRawInputManager = advancedRawInputManager;



        this.multiVideoManager = multiVideoManager;



        this.imageProjectManager = imageProjectManager;



        this.sentenceFormatter = sentenceFormatter || window.SentenceFormatter;



        this.arrayFieldManager = arrayFieldManager;



        this.shadowHost = null;



        this.shadowRoot = null;



        this.launcherElement = null;



        this.launcherQuickJsonBtn = null;



        this.launcherQuickRawBtn = null;



        this.launcherGenerateJsonBtn = null;



        this.launcherGenerateRawBtn = null;



        this.launcherSpicyBtn = null;



        this.launcherSilentBtn = null;



        this.launcherUploadBtn = null;



        this.launcherQuoteBtn = null;

        this.launcherUpscaleBtn = null;



        this.launcherAuroraBtn = null;



        this.isOpen = false;



        this.drawerExpanded = false;



        this._galleryWatcherInstalled = false;







        // Store helper references



        this.uiHelpers = new window.UIHelpers();



        this.uiConstants = window.uiConstants;







        // Sub-managers will be instantiated after shadowRoot is created



        this.uiStatusManager = null;



        this.uiTabManager = null;



        this.uiModalManager = null;



        this.uiSettingsManager = null;



        this.uiHistoryManager = null;



        this.uiGenerationsManager = null;



        this.uiRawInputManager = null;



        this.uiFormManager = null;



        this.uiUploadManager = null;



        this.uiPlaylistManager = null;

        // Generation Rail Manager (for Quick Raw mode monitoring)
        this.uiGenerationRailManager = null;

        // UI Automation Manager
        this.uiUpscaleAutomationManager = new window.UIUpscaleAutomationManager(this.stateManager);







        // Upload automation manager (set from content.js)



        this.uploadAutomationManager = null;







        this._promptHistoryCache = [];



        this._promptHistoryMeta = null;



        this._lastResolvedImageId = null;



        this._galleryOriginContext = this._determineGalleryOrigin(document.referrer || window.location.href);
        this._nativeSpicyAutomationActive = false;



        this._historyFeatureEnabled = true;



        this._multiGenHistoryState = {



            sortMode: 'success-desc', // Default to most successful videos first



            prioritizeActive: false,  // Don't prioritize active by default



            root: null,



            cardContainer: null,



            summary: null,



            sortSelect: null,



            activeToggle: null,

            // v1.21.45: Lazy loading
            thumbnailObserver: null

        };



        this._multiGenHistoryListener = null;



        this._multiGenPromptModal = null;



        this._multiGenImageModal = null;



        this._uploadModeChangeHandler = (event) => {



            const enabled = typeof event?.detail?.enabled === 'boolean'



                ? event.detail.enabled



                : this.stateManager?.isUploadAutomationEnabled?.();



            this._syncUploadModeButton(enabled);







            // Show/hide upload panel



            if (this.uiUploadManager) {



                if (enabled) {



                    this.uiUploadManager.showUploadPanel();



                } else {



                    this.uiUploadManager.hideUploadPanel();



                }



            }



        };



        window.addEventListener('gvp:upload-mode-changed', this._uploadModeChangeHandler);



        this._wrapModeChangeHandler = (event) => {



            const enabled = typeof event?.detail?.enabled === 'boolean'



                ? event.detail.enabled



                : !!this.stateManager?.getState?.().settings?.wrapInQuotes;



            this._syncQuoteWrapButton(enabled);



        };



        window.addEventListener('gvp:wrap-mode-changed', this._wrapModeChangeHandler);



        this._auroraModeChangeHandler = (event) => {



            const enabled = typeof event?.detail?.enabled === 'boolean'



                ? event.detail.enabled



                : !!this.stateManager?.getState?.().settings?.auroraEnabled;



            this._syncAuroraButton(enabled);



        };



        window.addEventListener('gvp:aurora-mode-changed', this._auroraModeChangeHandler);



    }







    _initializeSubManagers() {



        // Instantiate all sub-managers now that shadowRoot exists



        this.uiStatusManager = new window.UIStatusManager(this.stateManager, this.shadowRoot);



        this.uiTabManager = new window.UITabManager(this.shadowRoot, this);



        this.uiModalManager = new window.UIModalManager(this.stateManager, this.shadowRoot, this.sentenceFormatter);



        this.uiSettingsManager = new window.UISettingsManager(this.stateManager, this.shadowRoot, this, this.networkInterceptor, this.imageProjectManager);



        this.uiHistoryManager = null;



        this.uiGenerationsManager = null;



        this.uiRawInputManager = new window.UIRawInputManager(this.stateManager, this.advancedRawInputManager, this.reactAutomation, this.shadowRoot, this.uiHelpers, this.uiModalManager);



        this.uiFormManager = new window.UIFormManager(this.stateManager, this.arrayFieldManager, this.sentenceFormatter, this.reactAutomation, this.shadowRoot);







        // Initialize upload manager if available



        if (window.UIUploadManager && this.uploadAutomationManager) {



            this.uiUploadManager = new window.UIUploadManager(this.stateManager, this.shadowRoot, this.uploadAutomationManager, this);



            window.Logger.debug('UI', 'UIUploadManager initialized');



        }







        // Initialize playlist manager



        if (window.UIPlaylistManager) {



            this.uiPlaylistManager = new window.UIPlaylistManager(this.stateManager, this.shadowRoot, this.reactAutomation, this.uiModalManager, this.networkInterceptor);



            window.Logger.debug('UI', 'UIPlaylistManager initialized');



        }

        // Initialize Generation Rail Manager (for Quick Raw mode monitoring)
        if (window.UIGenerationRailManager) {
            this.uiGenerationRailManager = new window.UIGenerationRailManager(this);
            window.Logger.debug('UI', 'UIGenerationRailManager initialized');
        }





        // Set back-reference for UITabManager to access sub-managers



        this.uiTabManager.uiManager = this;







        if (this.imageProjectManager) {



            // Legacy project callbacks are disabled while the merged history tab is rebuilt.



            this.imageProjectManager.onProjectUpdated = null;



        }







        // Toast system



        this.toastContainer = null;



        this.activeToasts = new Set();



    }







    // Toast notification system



    _ensureToastContainer() {



        if (!this.toastContainer) {



            this.toastContainer = document.createElement('div');



            this.toastContainer.className = 'gvp-toast-container';



            this.shadowRoot.appendChild(this.toastContainer);



        }



        return this.toastContainer;



    }







    showToast(message, type = 'info', duration = 3000) {



        const container = this._ensureToastContainer();







        const toast = document.createElement('div');



        toast.className = `gvp-toast gvp-toast-${type}`;







        const messageEl = document.createElement('span');



        messageEl.className = 'gvp-toast-message';



        messageEl.textContent = message;



        toast.appendChild(messageEl);







        container.appendChild(toast);



        this.activeToasts.add(toast);







        // Animate in



        setTimeout(() => toast.classList.add('show'), 10);







        // Auto-remove



        if (duration > 0) {



            setTimeout(() => this._removeToast(toast), duration);



        }







        return toast;



    }







    showConfirmToast(message, onConfirm, onCancel) {



        const container = this._ensureToastContainer();







        const toast = document.createElement('div');



        toast.className = 'gvp-toast gvp-toast-confirm';







        const messageEl = document.createElement('span');



        messageEl.className = 'gvp-toast-message';



        messageEl.textContent = message;



        toast.appendChild(messageEl);







        const actions = document.createElement('div');



        actions.className = 'gvp-toast-actions';







        const confirmBtn = document.createElement('button');



        confirmBtn.className = 'gvp-toast-btn gvp-toast-btn-confirm';



        confirmBtn.textContent = 'Yes';



        confirmBtn.addEventListener('click', () => {



            this._removeToast(toast);



            if (onConfirm) onConfirm();



        });







        const cancelBtn = document.createElement('button');



        cancelBtn.className = 'gvp-toast-btn gvp-toast-btn-cancel';



        cancelBtn.textContent = 'No';



        cancelBtn.addEventListener('click', () => {



            this._removeToast(toast);



            if (onCancel) onCancel();



        });







        actions.appendChild(confirmBtn);



        actions.appendChild(cancelBtn);



        toast.appendChild(actions);







        container.appendChild(toast);



        this.activeToasts.add(toast);







        // Animate in



        setTimeout(() => toast.classList.add('show'), 10);







        return toast;



    }







    showUndoToast(message, onUndo, duration = 5000) {



        const container = this._ensureToastContainer();







        const toast = document.createElement('div');



        toast.className = 'gvp-toast gvp-toast-undo';







        const messageEl = document.createElement('span');



        messageEl.className = 'gvp-toast-message';



        messageEl.textContent = message;



        toast.appendChild(messageEl);







        const undoBtn = document.createElement('button');



        undoBtn.className = 'gvp-toast-btn gvp-toast-btn-undo';



        undoBtn.textContent = 'Undo';



        undoBtn.addEventListener('click', () => {



            this._removeToast(toast);



            if (onUndo) onUndo();



        });



        toast.appendChild(undoBtn);







        container.appendChild(toast);



        this.activeToasts.add(toast);







        // Animate in



        setTimeout(() => toast.classList.add('show'), 10);







        // Auto-remove



        if (duration > 0) {



            setTimeout(() => this._removeToast(toast), duration);



        }







        return toast;



    }







    _removeToast(toast) {



        if (!toast || !this.activeToasts.has(toast)) return;







        toast.classList.remove('show');



        this.activeToasts.delete(toast);







        setTimeout(() => {



            if (toast.parentNode) {



                toast.parentNode.removeChild(toast);



            }



        }, 300); // Match CSS transition duration



    }







    createUI() {



        try {



            this._createShadowDOM();



            this._createBackdrop();



            const shell = document.createElement('div');



            shell.id = 'gvp-shell';







            const drawer = this._createDrawer();



            const launcher = this._createLauncher();







            shell.appendChild(drawer);



            shell.appendChild(launcher);







            this.shadowRoot.appendChild(shell);



            this.uiModalManager._createFullscreenModal();



            this.uiModalManager._createViewJsonModal();



            this.uiModalManager._createSavedPromptModal();



            this.uiModalManager._createImportJsonModal();







            // Create upload queue panel modal overlay



            if (this.uiUploadManager) {



                const uploadPanel = this.uiUploadManager.createUploadPanel();



                this.shadowRoot.appendChild(uploadPanel);



                window.Logger.debug('UI', 'Upload queue modal overlay created');



            }







            window.Logger.info('UI', 'UI created');



            const silentEnabled = !!this.stateManager?.getState()?.settings?.silentMode;



            if (silentEnabled) {



                this.setSilentMode(true, { from: 'init', persist: false, force: true });



            } else {



                this.updateVoiceOnlyIndicator(false);



                if (this.uiSettingsManager && typeof this.uiSettingsManager.syncSilentModeUI === 'function') {



                    this.uiSettingsManager.syncSilentModeUI(false);



                }



                if (this.launcherSilentBtn) {



                    this.launcherSilentBtn.classList.remove('active');



                    this.launcherSilentBtn.setAttribute('aria-pressed', 'false');



                }



            }



            this._updateQuickLaunchButtons();



            const spicyEnabled = !!this.stateManager?.getState()?.generation?.useSpicy;



            if (this.launcherSpicyBtn) {



                this.launcherSpicyBtn.classList.toggle('active', spicyEnabled);



                this.launcherSpicyBtn.setAttribute('aria-pressed', spicyEnabled ? 'true' : 'false');



            }







            // NEW: Initialize gallery watcher for spicy mode auto-detection



            this._initGalleryWatcher();



        } catch (error) {



            window.Logger.error('UI', 'UI creation failed:', error);



            throw error;



        }



    }







    _createShadowDOM() {



        this.shadowHost = document.createElement('div');



        this.shadowHost.id = 'gvp-shadow-host';



        document.body.appendChild(this.shadowHost);



        this.shadowRoot = this.shadowHost.attachShadow({ mode: 'open', delegatesFocus: false });



        const style = document.createElement('style');




        const themeStyles = `:host { 
            ${window.GVP_THEME_VARIABLES || ''} 
        }`;
        style.textContent = themeStyles + '\n' + (window.GVP_STYLESHEET || '');



        this.shadowRoot.appendChild(style);







        // Initialize sub-managers now that shadowRoot exists



        this._initializeSubManagers();







        // Update shadowRoot for all managers that need it.



        this.uiStatusManager.shadowRoot = this.shadowRoot;



        this.uiTabManager.shadowRoot = this.shadowRoot;



        this.uiModalManager.shadowRoot = this.shadowRoot;



        this.uiSettingsManager.shadowRoot = this.shadowRoot;



        this.uiRawInputManager.shadowRoot = this.shadowRoot;



        this.uiFormManager.shadowRoot = this.shadowRoot;











        // CRITICAL: Prevent external focus capture



        this.shadowHost.addEventListener('focusin', (e) => {



            // Allow focus within shadow DOM



            e.stopPropagation();



        }, { capture: true });







        this.shadowHost.addEventListener('focusout', (e) => {



            // Prevent external focus theft



            const relatedTarget = e.relatedTarget;



            if (relatedTarget && !this.shadowRoot.contains(relatedTarget)) {



                e.stopPropagation();



            }



        }, { capture: true });



    }











    _createBackdrop() {



        const backdrop = document.createElement('div');



        backdrop.id = 'gvp-backdrop';



        this.shadowRoot.appendChild(backdrop);



    }







    _createLauncher() {



        const createLauncherButton = ({ id, label, title, variant, onClick }) => {



            const btn = document.createElement('button');



            btn.type = 'button';



            btn.id = id;



            btn.className = `gvp-launcher-tab${variant ? ` ${variant}` : ''}`;



            btn.innerHTML = label;



            btn.title = title;



            btn.addEventListener('click', (event) => {



                event.preventDefault();



                event.stopPropagation();



                onClick();



            });



            return btn;



        };







        const topStack = document.createElement('div');



        topStack.id = 'gvp-launcher-stack-top';



        topStack.className = 'gvp-launcher-group top';







        this.launcherSilentBtn = createLauncherButton({



            id: 'gvp-launcher-silent-btn',



            label: '🔇',



            title: 'Toggle Voice-only Mode',



            variant: 'square',



            onClick: () => {
                const current = !!this.stateManager?.getState?.().settings?.silentMode;
                const newState = !current;
                this.setSilentMode(newState, { from: 'launcher' });
                this.showToast(newState ? '🔇 Silent Mode Enabled' : '🔊 Silent Mode Disabled');
            }



        });



        this.launcherSilentBtn.setAttribute('aria-pressed', 'false');



        topStack.appendChild(this.launcherSilentBtn);







        this.launcherSpicyBtn = createLauncherButton({



            id: 'gvp-launcher-spicy-btn',



            label: '🌶️',



            title: 'Toggle Spicy Mode',



            variant: 'square',



            onClick: () => {
                const newState = this.toggleSpicyMode();
                this.showToast(newState ? '🌶️ Spicy Mode Enabled' : '🌶️ Spicy Mode Disabled');
            }



        });



        this.launcherSpicyBtn.setAttribute('aria-pressed', 'false');



        topStack.appendChild(this.launcherSpicyBtn);







        // === Generation Rail Toggle (v1.21.48) ===
        this.launcherRailBtn = createLauncherButton({
            id: 'gvp-launcher-rail-btn',
            label: '🚂',
            title: 'Toggle Generation Rail',
            variant: 'square',
            onClick: () => {
                const newState = this.toggleGenerationRail();
                this.showToast(newState ? '🚂 Generation Rail ON' : '🚂 Generation Rail OFF');
            }
        });
        this.launcherRailBtn.setAttribute('aria-pressed', 'false');
        topStack.appendChild(this.launcherRailBtn);

        // Quote Wrap Deprecated
        /*
        this.launcherQuoteBtn = createLauncherButton({
            id: 'gvp-launcher-quote-wrap',
            label: '❝',
            title: 'Toggle Quote Wrap Mode',
            variant: 'square',
            onClick: () => {
                const current = !!this.stateManager?.getState?.().settings?.wrapInQuotes;
                const newState = !current;
                this.setQuoteWrapMode(newState, { from: 'launcher' });
                this.showToast(newState ? '💬 Quote Wrap Enabled' : '💬 Quote Wrap Disabled');
            }
        });
        this.launcherQuoteBtn.setAttribute('aria-pressed', 'false');
        topStack.appendChild(this.launcherQuoteBtn);
        */

        // === Upscale Automation Toggle ===
        this.launcherUpscaleBtn = createLauncherButton({
            id: 'gvp-launcher-upscale-btn',
            label: '⬆️',
            title: 'Toggle UI Upscale Automation Mode',
            variant: 'square',
            onClick: () => {
                if (this.uiUpscaleAutomationManager) {
                    const newState = this.uiUpscaleAutomationManager.toggle();
                    this._syncUpscaleButton(newState);
                    // Toast handled by manager
                }
            }
        });
        // Set initial state
        if (this.uiUpscaleAutomationManager && this.uiUpscaleAutomationManager.isActive) {
            this.launcherUpscaleBtn.classList.add('active');
            this.launcherUpscaleBtn.setAttribute('aria-pressed', 'true');
        } else {
            this.launcherUpscaleBtn.setAttribute('aria-pressed', 'false');
        }
        topStack.appendChild(this.launcherUpscaleBtn);


        // Aurora Mode Deprecated
        /*
        this.launcherAuroraBtn = createLauncherButton({

            id: 'gvp-launcher-aurora-mode',

            label: '🌌',

            title: 'Toggle Aurora Auto-Injection',

            variant: 'square',

            onClick: () => {
                const newState = this.toggleAuroraMode();
                this.showToast(newState ? '🌌 Aurora Mode Enabled' : '🌌 Aurora Mode Disabled');
            }

        });

        this.launcherAuroraBtn.setAttribute('aria-pressed', 'false');

        // NOTE: Aurora tab removed from UI - kept for legacy use
        // topStack.appendChild(this.launcherAuroraBtn);
        */



        this.launcherUploadBtn = createLauncherButton({



            id: 'gvp-launcher-upload-mode',



            label: '📤',



            title: 'Toggle Upload Mode (auto-return to gallery after generation)',



            variant: 'square',



            onClick: () => this.toggleUploadMode()



        });



        this.launcherUploadBtn.setAttribute('aria-pressed', 'false');


        topStack.appendChild(this.launcherUploadBtn);

        // === Spacer: Mode toggles -> ImgEdit ===
        const imgEditSpacer = document.createElement('div');
        imgEditSpacer.className = 'gvp-launcher-spacer';
        imgEditSpacer.style.cssText = 'height: 16px; flex-shrink: 0;';
        topStack.appendChild(imgEditSpacer);

        // === Quick Edit (Image Edit) Toggle Button ===
        this.launcherQuickEditBtn = createLauncherButton({
            id: 'gvp-launcher-quick-edit',
            label: '🖼 ImgEdit',
            onClick: () => {
                const isEdit = this.getQuickLaunchMode() === 'edit';
                // Toggle: if edit, turn off (null), if not edit, turn on ('edit')
                const newMode = isEdit ? null : 'edit';
                this.setQuickLaunchMode(newMode);
                this.showToast(newMode === 'edit' ? 'Image Edit AutoPrompter Enabled' : 'Image Edit AutoPrompter Disabled');
            }
        });
        this.launcherQuickEditBtn.setAttribute('aria-pressed', 'false');
        topStack.appendChild(this.launcherQuickEditBtn);

        // === ImgEdit Action Buttons (visible only when edit mode is active) ===
        this.imgEditActionsContainer = document.createElement('div');
        this.imgEditActionsContainer.id = 'gvp-imgedit-actions';
        this.imgEditActionsContainer.style.cssText = 'display: none; flex-direction: column; gap: 0;';

        // Re-edit button - uses same createLauncherButton pattern as other tabs
        this.imgEditReEditBtn = createLauncherButton({
            id: 'gvp-imgedit-reedit',
            label: '🔄',
            title: 'Re-edit: Enter RAW prompt (or existing prompt) and submit',
            variant: 'square',
            onClick: async () => {
                window.Logger.debug('UI', 'Re-edit button clicked!');
                this.showToast('Trying new edit with raw tabs prompt.', 'info', 2000); // GVP Toast
                try {
                    // First try RAW tab prompt
                    let promptText = this.uiRawInputManager?.buildRawPrompt?.() || '';
                    window.Logger.debug('UI', 'RAW tab prompt:', promptText ? promptText.substring(0, 50) + '...' : '(empty)');

                    // If RAW is empty, try to get existing prompt from host page
                    // NOTE: We're in shadow DOM, so use window.document to search Grok page
                    if (!promptText.trim()) {
                        window.Logger.debug('UI', 'RAW empty, checking for existing prompt on Grok page...');

                        // Log what's on the page for debugging
                        const allDivs = window.document.querySelectorAll('div.bg-surface-l1');
                        window.Logger.debug('UI', `Found ${allDivs.length} div.bg-surface-l1 on page`);

                        // Look for collapsed edit div with truncated prompt text  
                        // It has: div.bg-surface-l1.truncate.rounded-full containing brush icon and span with text
                        const collapsedDiv = window.document.querySelector('div.bg-surface-l1.truncate.rounded-full span');
                        window.Logger.debug('UI', 'Collapsed div span:', collapsedDiv);
                        if (collapsedDiv) {
                            promptText = collapsedDiv.textContent?.trim() || '';
                            window.Logger.debug('UI', 'Found existing prompt in collapsed div:', promptText.substring(0, 50) + '...');
                        }

                        // Also check for textarea with existing prompt
                        if (!promptText.trim()) {
                            const existingTextarea = window.document.querySelector('textarea[aria-label="Image prompt"]');
                            window.Logger.debug('UI', 'Image prompt textarea:', existingTextarea);
                            if (existingTextarea) {
                                promptText = existingTextarea.value?.trim() || '';
                                window.Logger.debug('UI', 'Found existing prompt in textarea:', promptText.substring(0, 50) + '...');
                            }
                        }

                        // Also try "Type to edit image" textarea
                        if (!promptText.trim()) {
                            const editTextarea = window.document.querySelector('textarea[aria-label="Type to edit image..."]');
                            window.Logger.debug('UI', 'Edit textarea:', editTextarea);
                            if (editTextarea) {
                                promptText = editTextarea.value?.trim() || '';
                                window.Logger.debug('UI', 'Found prompt in edit textarea:', promptText.substring(0, 50) + '...');
                            }
                        }
                    }

                    if (!promptText.trim()) {
                        window.Logger.warn('UI', 'No prompt found (RAW tab empty and no existing prompt on page)');
                        alert('No prompt found! Enter a prompt in the RAW tab first.');
                        return;
                    }

                    window.Logger.debug('UI', 'Sending to image edit with prompt:', promptText.substring(0, 50) + '...');
                    if (window.gvpReactAutomation?.sendToImageEdit) {
                        await window.gvpReactAutomation.sendToImageEdit(promptText);
                    } else {
                        window.Logger.error('UI', 'ReactAutomation not available!');
                    }
                } catch (error) {
                    window.Logger.error('UI', 'Re-edit failed:', error);
                }
            }
        });
        this.imgEditActionsContainer.appendChild(this.imgEditReEditBtn);

        // Go Back button - uses same createLauncherButton pattern as other tabs
        this.imgEditGoBackBtn = createLauncherButton({
            id: 'gvp-imgedit-goback',
            label: '↩',
            title: 'Go Back: Return to favorites gallery',
            variant: 'square',
            onClick: () => {
                this.showToast('Returning to Gallery', 'info', 2000); // GVP Toast
                const targetUrl = `${window.location.origin}/imagine/favorites`;
                try {
                    window.history.replaceState(null, '', targetUrl);
                    window.dispatchEvent(new PopStateEvent('popstate'));
                    setTimeout(() => {
                        if (!window.location.href.includes('/imagine/favorites')) {
                            window.location.assign(targetUrl);
                        }
                    }, 150);
                } catch (error) {
                    window.Logger.error('UI', 'Navigation failed:', error);
                    window.location.assign(targetUrl);
                }
            }
        });
        this.imgEditActionsContainer.appendChild(this.imgEditGoBackBtn);

        // Quick Video toggle - when ON, clicking edited image thumbnails triggers video generation
        this.imgEditQuickVideoBtn = createLauncherButton({
            id: 'gvp-imgedit-quickvideo',
            label: '🎥',
            title: 'Quick Video from Edit: Toggle ON, then click edited images to generate videos and return here',
            variant: 'square',
            onClick: () => {
                this._toggleQuickVideoFromEdit();
            }
        });
        this.imgEditActionsContainer.appendChild(this.imgEditQuickVideoBtn);

        topStack.appendChild(this.imgEditActionsContainer);

        // === Spacer: ImgEdit -> Quick Launch ===
        const quickSectionSpacer = document.createElement('div');
        quickSectionSpacer.className = 'gvp-launcher-spacer';
        quickSectionSpacer.style.cssText = 'height: 16px; flex-shrink: 0;';
        topStack.appendChild(quickSectionSpacer);

        this.launcherQuickJsonBtn = createLauncherButton({
            id: 'gvp-launcher-quick-json',
            label: '⚡ JSON',
            title: 'Toggle Quick JSON Mode',
            onClick: () => {
                const currentMode = this.getQuickLaunchMode();
                const newMode = currentMode === 'json' ? null : 'json';
                this.setQuickLaunchMode(newMode);
                this.showToast(newMode === 'json' ? 'Enabled Quick JSON AutoPrompt' : 'Disabled Quick JSON AutoPrompt', 'info', 2000);
            }
        });
        this.launcherQuickJsonBtn.setAttribute('aria-pressed', 'false');
        topStack.appendChild(this.launcherQuickJsonBtn);

        this.launcherQuickRawBtn = createLauncherButton({
            id: 'gvp-launcher-quick-raw',
            label: '⚡ RAW',
            title: 'Toggle Quick Raw Mode',
            onClick: () => {
                const currentMode = this.getQuickLaunchMode();
                const newMode = currentMode === 'raw' ? null : 'raw';
                this.setQuickLaunchMode(newMode);
                this.showToast(newMode === 'raw' ? 'Enabled Quick Raw AutoPrompt' : 'Disabled Quick Raw AutoPrompt', 'info', 2000);
            }
        });
        this.launcherQuickRawBtn.setAttribute('aria-pressed', 'false');
        topStack.appendChild(this.launcherQuickRawBtn);

        // === Spacer: Quick Launch -> Open UI button ===
        const bottomSpacer = document.createElement('div');
        bottomSpacer.className = 'gvp-launcher-spacer';
        bottomSpacer.style.cssText = 'height: 16px; flex-shrink: 0;';
        topStack.appendChild(bottomSpacer);


        const launcher = document.createElement('div');



        launcher.id = 'gvp-launcher';







        const inner = document.createElement('div');



        inner.className = 'gvp-launcher-inner';







        const primaryBtn = document.createElement('button');



        primaryBtn.className = 'gvp-launcher-btn primary';



        primaryBtn.innerHTML = '<span class="gvp-launcher-open">Open UI</span><span class="gvp-launcher-close">Close UI</span>';



        primaryBtn.addEventListener('click', (event) => {



            event.preventDefault();



            event.stopPropagation();



            this.toggleDrawer();



        });



        inner.appendChild(primaryBtn);







        launcher.appendChild(inner);


        this.launcherElement = launcher;

        // bottomStack removed - Generate JSON/RAW buttons now only in main drawer UI

        const wrapper = document.createElement('div');
        wrapper.id = 'gvp-launcher-stack-wrapper';
        wrapper.appendChild(topStack);
        wrapper.appendChild(launcher);


        this._syncQuoteWrapButton();



        this._syncAuroraButton();



        this._syncUploadModeButton();







        return wrapper;



    }







    _createDrawer() {



        const drawer = document.createElement('div');



        drawer.id = 'gvp-drawer';







        const header = this._createHeader();



        const tabs = this.uiTabManager._createTabs();



        const tabContent = this.uiTabManager._createTabContent();







        // Add status badges to header left container



        const statusBadgesContainer = header.querySelector('#gvp-status-badges-container');



        if (statusBadgesContainer) {



            const statusDisplay = this.uiStatusManager.createStatusDisplay();



            statusDisplay.style.display = 'flex';



            statusDisplay.style.gap = '8px';



            statusDisplay.style.alignItems = 'center';



            statusBadgesContainer.appendChild(statusDisplay);



        }







        drawer.appendChild(header);



        drawer.appendChild(tabs);



        drawer.appendChild(tabContent);



        drawer.appendChild(this._createBottomBar());







        return drawer;



    }







    _createHeader() {



        const header = document.createElement('div');



        header.id = 'gvp-header';







        // Left container removed - indicators moved to sidebar launchers







        // Center - Title



        const title = document.createElement('div');



        title.id = 'gvp-title';



        title.textContent = window.GVP_APP_VERSION



            ? `GVP v${window.GVP_APP_VERSION}`



            : 'GVP';



        header.appendChild(title);







        // Right container - Settings & Minimize



        const rightContainer = document.createElement('div');



        rightContainer.className = 'gvp-header-right';







        // Settings button



        const settingsBtn = document.createElement('button');



        settingsBtn.className = 'gvp-header-btn gvp-emoji-btn';



        settingsBtn.innerHTML = '⚙️';



        settingsBtn.title = 'Settings';



        settingsBtn.addEventListener('click', () => {



            if (this.uiSettingsManager && typeof this.uiSettingsManager.openSettingsPanel === 'function') {



                this.uiSettingsManager.openSettingsPanel();



            } else if (this.uiTabManager) {



                this.uiTabManager.switchTab('JSON');



                window.Logger.warn('UI', 'Settings panel unavailable; staying on JSON tab.');



            }



        });



        rightContainer.appendChild(settingsBtn);







        // Playlist button



        const playlistBtn = document.createElement('button');



        playlistBtn.className = 'gvp-header-btn gvp-emoji-btn gvp-playlist-header-btn';



        playlistBtn.innerHTML = '▶';



        playlistBtn.title = 'Play All Videos';



        playlistBtn.addEventListener('click', async () => {



            if (!this.uiPlaylistManager) {



                window.Logger.error('UI', 'Playlist manager not available');



                return;



            }







            // Detect if on favorites page



            const isFavorites = window.location.pathname.includes('/imagine/favorites');







            if (isFavorites) {



                // Auto-scroll and scrape favorites



                await this.uiPlaylistManager.playFromFavorites();



            } else {



                // Use multi-gen history



                const sortMode = this._multiGenHistoryState?.sortMode || 'success-desc';



                this.uiPlaylistManager.play(sortMode);



            }



        });



        rightContainer.appendChild(playlistBtn);







        // Minimize button



        const minimizeBtn = document.createElement('button');



        minimizeBtn.className = 'gvp-header-btn gvp-emoji-btn';



        minimizeBtn.innerHTML = '−';



        minimizeBtn.title = 'Minimize';



        minimizeBtn.addEventListener('click', () => this.closeDrawer());



        rightContainer.appendChild(minimizeBtn);







        header.appendChild(rightContainer);







        return header;



    }







    _createBottomBar() {



        const bottomBar = document.createElement('div');



        bottomBar.id = 'gvp-bottom-bar';







        const topRow = document.createElement('div');



        topRow.className = 'gvp-bottom-row top';







        const quickJsonToggle = document.createElement('button');



        quickJsonToggle.className = 'gvp-button gvp-quick-toggle gvp-quick-json-btn';



        quickJsonToggle.innerHTML = '⏩ Quick JSON';



        quickJsonToggle.addEventListener('click', () => {



            const currentMode = this.getQuickLaunchMode();



            const newMode = currentMode === 'json' ? null : 'json';



            this.setQuickLaunchMode(newMode);



            this.showToast(newMode === 'json' ? 'Enabled Quick JSON AutoPrompt' : 'Disabled Quick JSON AutoPrompt', 'info', 2000);



        });







        const viewJsonBtn = document.createElement('button');



        viewJsonBtn.className = 'gvp-button';



        viewJsonBtn.innerHTML = '👁️ View Current JSON';



        viewJsonBtn.addEventListener('click', () => this.uiModalManager.showViewJsonModal());







        const quickRawToggle = document.createElement('button');



        quickRawToggle.className = 'gvp-button gvp-quick-toggle gvp-quick-raw-btn';



        quickRawToggle.innerHTML = '⏩ Quick Raw';



        quickRawToggle.addEventListener('click', () => {



            const currentMode = this.getQuickLaunchMode();



            const newMode = currentMode === 'raw' ? null : 'raw';



            this.setQuickLaunchMode(newMode);



            this.showToast(newMode === 'raw' ? 'Enabled Quick Raw AutoPrompt' : 'Disabled Quick Raw AutoPrompt', 'info', 2000);



        });







        topRow.appendChild(quickJsonToggle);



        topRow.appendChild(viewJsonBtn);



        topRow.appendChild(quickRawToggle);



        this.quickJsonToggle = quickJsonToggle;



        this.quickRawToggle = quickRawToggle;







        const bottomRow = document.createElement('div');



        bottomRow.className = 'gvp-bottom-row bottom';







        const generateJsonBtn = document.createElement('button');



        generateJsonBtn.className = 'gvp-button primary gvp-generate-json-btn';



        generateJsonBtn.innerHTML = '📄 Generate JSON';



        generateJsonBtn.addEventListener('click', () => this.uiFormManager.handleGenerateJson());







        const generateRawBtn = document.createElement('button');



        generateRawBtn.className = 'gvp-button gvp-generate-raw-btn';



        generateRawBtn.innerHTML = '📝 Generate Raw';



        generateRawBtn.addEventListener('click', () => this.uiRawInputManager.handleGenerateRaw());







        const spicyBtn = document.createElement('button');



        spicyBtn.id = 'gvp-bottom-spicy-btn';



        spicyBtn.className = 'gvp-button gvp-spicy-mode-btn';



        spicyBtn.innerHTML = '🌶️ Spicy Mode';



        spicyBtn.addEventListener('click', () => this.toggleSpicyMode());







        const state = this.stateManager.getState();



        if (state.generation.useSpicy) {



            spicyBtn.classList.add('active');



        }







        bottomRow.appendChild(generateJsonBtn);



        bottomRow.appendChild(spicyBtn);



        bottomRow.appendChild(generateRawBtn);







        bottomBar.appendChild(topRow);



        bottomBar.appendChild(bottomRow);







        this._updateQuickLaunchButtons();







        return bottomBar;



    }











    _setDrawerState(shouldOpen) {



        const drawer = this.shadowRoot.getElementById('gvp-drawer');



        const shell = this.shadowRoot.getElementById('gvp-shell');



        const backdrop = this.shadowRoot.getElementById('gvp-backdrop');



        const bottomBar = this.shadowRoot.getElementById('gvp-bottom-bar');







        if (!drawer || !backdrop || !bottomBar || !shell) {



            window.Logger.error('UI', 'Missing UI elements:', { drawer: !!drawer, shell: !!shell, backdrop: !!backdrop, bottomBar: !!bottomBar });



            return;



        }



        this.isOpen = !!shouldOpen;



        drawer.classList.toggle('open', this.isOpen);



        shell.classList.toggle('open', this.isOpen);



        backdrop.classList.toggle('visible', this.isOpen);



        bottomBar.style.display = this.isOpen ? 'flex' : 'none';







        // Close upload queue panel when main drawer closes



        if (!this.isOpen && this.uiUploadManager) {



            this.uiUploadManager.hideUploadPanel();



        }







        window.Logger.debug('UI', 'Drawer state:', this.isOpen ? 'OPEN' : 'CLOSED');



        if (this.isOpen) {



            this._updateQuickLaunchButtons();



        }



    }







    toggleDrawer() {



        this._setDrawerState(!this.isOpen);



    }







    openDrawer() {



        this._setDrawerState(true);



    }







    closeDrawer() {



        this._setDrawerState(false);



    }











    setQuickLaunchMode(mode) {



        const normalized = mode === 'json' ? 'json' : mode === 'raw' ? 'raw' : mode === 'edit' ? 'edit' : null;



        const state = this.stateManager?.getState?.();



        if (!state || state.ui.quickLaunchMode === normalized) {



            this._updateQuickLaunchButtons();



            return;



        }







        state.ui.quickLaunchMode = normalized;



        this._updateQuickLaunchButtons();







        document.dispatchEvent(new CustomEvent('gvp:quick-launch-mode-changed', {



            detail: { mode: normalized }



        }));







        window.Logger.debug('UI', 'Quick launch mode ->', normalized ?? 'off');



    }







    getQuickLaunchMode() {



        const state = this.stateManager?.getState?.();



        return state?.ui?.quickLaunchMode ?? null;



    }







    _updateQuickLaunchButtons() {



        const mode = this.getQuickLaunchMode();



        if (this.quickJsonToggle) {



            const isJson = mode === 'json';



            this.quickJsonToggle.classList.toggle('active', isJson);



            this.quickJsonToggle.setAttribute('aria-pressed', isJson ? 'true' : 'false');



        }



        if (this.quickRawToggle) {



            const isRaw = mode === 'raw';



            this.quickRawToggle.classList.toggle('active', isRaw);



            this.quickRawToggle.setAttribute('aria-pressed', isRaw ? 'true' : 'false');



        }



        if (this.launcherQuickJsonBtn) {



            const isJson = mode === 'json';



            this.launcherQuickJsonBtn.classList.toggle('active', isJson);



            this.launcherQuickJsonBtn.setAttribute('aria-pressed', isJson ? 'true' : 'false');



        }



        if (this.launcherQuickRawBtn) {



            const isRaw = mode === 'raw';



            this.launcherQuickRawBtn.classList.toggle('active', isRaw);



            this.launcherQuickRawBtn.setAttribute('aria-pressed', isRaw ? 'true' : 'false');



        }

        // Quick Edit (Image Edit) button sync
        if (this.launcherQuickEditBtn) {
            const isEdit = mode === 'edit';
            this.launcherQuickEditBtn.classList.toggle('active', isEdit);
            this.launcherQuickEditBtn.setAttribute('aria-pressed', isEdit ? 'true' : 'false');

            // Toggle visibility of action buttons (Re-edit, Go Back, Quick Video)
            if (this.imgEditActionsContainer) {
                this.imgEditActionsContainer.style.display = isEdit ? 'flex' : 'none';
            }
        }

        // Quick Video from Edit button sync
        if (this.imgEditQuickVideoBtn) {
            const currentState = this.stateManager?.getState?.();
            const isQuickVideo = !!currentState?.ui?.quickVideoFromEdit;
            this.imgEditQuickVideoBtn.classList.toggle('active', isQuickVideo);
            this.imgEditQuickVideoBtn.setAttribute('aria-pressed', isQuickVideo ? 'true' : 'false');
        }


        this._syncQuoteWrapButton();



        this._syncAuroraButton();



        this._syncUploadModeButton();



    }

    /**
     * Toggle Quick Video from Edit mode.
     * When enabled, clicking edited image thumbnails on image post pages
     * will navigate to that image, enter the RAW prompt, submit video, and return.
     */
    _toggleQuickVideoFromEdit() {
        const state = this.stateManager?.getState?.();
        if (!state || !state.ui) {
            window.Logger.warn('UI', 'Cannot toggle Quick Video from Edit: state unavailable');
            return;
        }

        const newValue = !state.ui.quickVideoFromEdit;
        state.ui.quickVideoFromEdit = newValue;

        window.Logger.debug('UI', 'Quick Video from Edit toggled:', newValue);

        // Update button visual
        this._updateQuickLaunchButtons();

        // Dispatch event so content.js can attach/detach click listener
        window.dispatchEvent(new CustomEvent('gvp:quick-video-from-edit-changed', {
            detail: { enabled: newValue }
        }));
    }

    /**
     * Get Quick Video from Edit state
     */
    getQuickVideoFromEdit() {
        const state = this.stateManager?.getState?.();
        return !!state?.ui?.quickVideoFromEdit;
    }


    _setQuickLaunchSuppressed(active, reason = 'unspecified') {



        const state = this.stateManager?.getState?.();



        if (!state || !state.ui) {



            return;



        }



        const next = !!active;



        if (state.ui.quickLaunchSuppressed === next) {



            return;



        }



        state.ui.quickLaunchSuppressed = next;



        document.dispatchEvent(new CustomEvent('gvp:quick-launch-suppressed', {



            detail: { active: next, reason }



        }));



        window.Logger.debug('UI', 'Suppression ->', next ? 'ON' : 'OFF', reason);



    }







    toggleUploadMode() {



        if (!this.stateManager?.setUploadAutomationEnabled) {



            window.Logger.warn('UI', 'Upload automation toggle unavailable');



            return;



        }







        const current = this.stateManager.isUploadAutomationEnabled();



        const newState = !current;







        window.Logger.info('UI', 'Toggling upload mode:', current, '→', newState);







        // Update state



        this.stateManager.setUploadAutomationEnabled(newState);



        this._syncUploadModeButton(newState);







        // Toggle panel UI



        if (this.uiUploadManager) {



            if (newState) {



                this.uiUploadManager.showUploadPanel();



            } else {



                this.uiUploadManager.hideUploadPanel();



            }



        }







        window.Logger.info('UI', 'Upload automation mode →', newState ? 'ENABLED' : 'DISABLED');



    }







    _syncUploadModeButton(forcedValue) {



        if (!this.launcherUploadBtn) {



            return;



        }



        const enabled = typeof forcedValue === 'boolean'



            ? forcedValue



            : this.stateManager?.isUploadAutomationEnabled?.();



        this.launcherUploadBtn.classList.toggle('active', !!enabled);



        this.launcherUploadBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');



    }







    _syncQuoteWrapButton(forcedValue) {



        if (!this.launcherQuoteBtn) {



            return;



        }



        const enabled = typeof forcedValue === 'boolean'



            ? forcedValue



            : !!this.stateManager?.getState?.().settings?.wrapInQuotes;



        this.launcherQuoteBtn.classList.toggle('active', !!enabled);



        this.launcherQuoteBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');



    }







    _syncAuroraButton(forcedValue) {



        if (!this.launcherAuroraBtn) {



            return;



        }



        const enabled = typeof forcedValue === 'boolean'



            ? forcedValue



            : !!this.stateManager?.getState?.().settings?.auroraEnabled;



        this.launcherAuroraBtn.classList.toggle('active', !!enabled);



        this.launcherAuroraBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');



    }







    toggleSpicyMode() {



        const state = this.stateManager.getState();



        state.generation.useSpicy = !state.generation.useSpicy;







        window.Logger.info('UI', '🌶️ Spicy mode toggled:', state.generation.useSpicy ? 'ENABLED' : 'DISABLED');



        window.Logger.info('UI', 'Next generation will use mode:', state.generation.useSpicy ? 'extremely-spicy-or-crazy' : 'default');







        // NEW: Scan for native spicy button if enabling (only on image pages)



        if (state.generation.useSpicy && window.location.pathname.includes('/imagine/post/')) {



            setTimeout(async () => {



                await this._detectNativeSpicyButton({ autoClick: true });



            }, 100);



        } else {



            state.generation.useNativeSpicy = false; // Reset flag



        }







        // Update header spicy indicator



        const spicyIndicator = this.shadowRoot.getElementById('gvp-spicy-indicator');



        if (spicyIndicator) {



            spicyIndicator.classList.toggle('active', state.generation.useSpicy);



        }



        if (this.launcherSpicyBtn) {



            this.launcherSpicyBtn.classList.toggle('active', state.generation.useSpicy);



            this.launcherSpicyBtn.setAttribute('aria-pressed', state.generation.useSpicy ? 'true' : 'false');



        }







        // Update bottom bar spicy button state



        const spicyBtn = this.shadowRoot.getElementById('gvp-bottom-spicy-btn');



        if (spicyBtn) {



            spicyBtn.classList.toggle('active', state.generation.useSpicy);



        }







        // Update mode indicator if status display exists



        this.uiStatusManager.updateModeIndicator();







        const appInstance = window.gvpAppInstance;



        if (appInstance && typeof appInstance.notifySpicyState === 'function') {



            appInstance.notifySpicyState('ui-toggle', true);



        }
        return state.generation.useSpicy;



    }







    /**
     * Toggle Generation Rail visibility (v1.21.48)
     * Rail shows real-time progress for ALL video generations from any source
     * @returns {boolean} New state
     */
    toggleGenerationRail() {
        const state = this.stateManager.getState();
        state.generation.showGenerationRail = !state.generation.showGenerationRail;

        window.Logger.info('UI', '🚂 Rail toggled:', state.generation.showGenerationRail ? 'ON' : 'OFF');

        // Dispatch event for UIGenerationRailManager
        window.dispatchEvent(new CustomEvent('gvp:rail-toggle-changed', {
            detail: { enabled: state.generation.showGenerationRail }
        }));

        // Sync button state
        this._syncRailButton(state.generation.showGenerationRail);

        return state.generation.showGenerationRail;
    }

    _syncRailButton(forcedValue) {
        if (!this.launcherRailBtn) return;
        const enabled = typeof forcedValue === 'boolean'
            ? forcedValue
            : !!this.stateManager?.getState()?.generation?.showGenerationRail;
        this.launcherRailBtn.classList.toggle('active', enabled);
        this.launcherRailBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }

    async _triggerStandardVideoGeneration(origin) {
        window.Logger.debug('UI', 'Triggering standard video generation for Quick Mode. Origin:', origin);

        // Find the trigger button (using same logic as native spicy but we just want to open the menu/modal)
        // We'll use a helper for this shared logic
        const triggerButton = await this._findVideoTriggerButton();

        if (!triggerButton) {
            window.Logger.warn('UI', 'Standard video trigger button not found');
            this._setQuickLaunchSuppressed(false, 'standard-trigger-missing');
            return;
        }

        window.Logger.debug('UI', 'Clicking standard trigger button');
        triggerButton.click();

        // Wait for modal/menu to open
        // content.js usually handles the rest (filling prompt etc) once the modal appears
        // But if it's a dropdown menu, we might need to select "Create" or similar.
        // For now, let's assume clicking the trigger opens the video creation interface directly OR 
        // opens a menu where the default action is clear.
        // Given Grok's UI, "Video Presets" usually opens a menu.
        // We might need to click the "Video" or "Create" option if it exists.
        // Let's wait and see if "Video" or "Standard" option appears and click it.

        await this._waitForElement(() => document.querySelector('[role="menu"]'), 1000);

        // If menu is open, try to find a standard option (non-spicy)
        const menuItems = document.querySelectorAll('[role="menuitem"]');
        if (menuItems.length > 0) {
            // Priority: "Standard", "Video", "Create", or just the first one that isn't Spicy?
            const standardOption = Array.from(menuItems).find(item => {
                const txt = (item.textContent || '').trim().toLowerCase();
                return !txt.includes('spicy') && (txt.includes('standard') || txt.includes('video') || txt.includes('create') || txt.includes('v2'));
            });

            if (standardOption) {
                window.Logger.debug('UI', 'Clicking standard menu option:', standardOption.textContent);
                standardOption.click();
            } else if (menuItems.length > 0) {
                // Fallback: Click first item if not spicy?
                // CAREFUL: Might be "Delete" or something.
                // Safer to look for specific keywords.
                // If we can't find a clear standard option, maybe just clicking the trigger was enough 
                // (e.g. if it wasn't actually a menu but a modal toggle).
                window.Logger.warn('UI', 'No clear standard option found in menu. Leaving menu open for manual selection or assuming trigger was enough.');

            }
        }
    }

    async _findVideoTriggerButton() {
        // Shared logic to find the button that opens video options
        const sidebarSelector = 'nav, aside, [role="navigation"], [data-testid="sidebar"], [class*="sidebar" i], [data-testid="left-nav"], [data-testid="project-list"]';

        // v1.21.1: Common selectors for video trigger buttons
        const triggerSelectors = [
            'button[aria-label="Video Presets"]',
            'button[aria-label="Video Options"]',
            'button[aria-label="Make video"]',
            'button[aria-label="Make a video"]',
            'button[data-testid="video-generator-submit"]'
        ].join(', ');

        const allowSidebarBypass = (el) => {
            if (!el || typeof el.matches !== 'function') return false;
            const hasFilmIcon = el.querySelector && el.querySelector('svg[class*="lucide-film"]');
            if (hasFilmIcon) return true;
            return el.matches(triggerSelectors);
        };

        // Try SVG icon detection first (Method 1)
        const filmIconButtons = document.querySelectorAll('button');
        let triggerButton = null;
        for (const btn of filmIconButtons) {
            const hasFilmIcon = btn.querySelector('svg[class*="lucide-film"]');
            const hasChevron = btn.querySelector('svg[class*="lucide-chevron"]');
            // v1.21.1: Relaxed check - Chevron is redundant if label is explicit
            if (hasFilmIcon && (hasChevron || btn.matches(triggerSelectors))) {
                triggerButton = btn;
                break;
            }
        }

        // Method 2: Fallback to explicit selectors
        if (!triggerButton) {
            triggerButton = document.querySelector(triggerSelectors);
        }

        // Method 3: Wait and retry
        if (!triggerButton) {
            triggerButton = await this._waitForElement(() => {
                const buttons = document.querySelectorAll('button');
                for (const btn of buttons) {
                    const hasFilmIcon = btn.querySelector('svg[class*="lucide-film"]');
                    const hasChevron = btn.querySelector('svg[class*="lucide-chevron"]');
                    if (hasFilmIcon && (hasChevron || btn.matches(triggerSelectors))) return btn;
                }
                return document.querySelector(triggerSelectors);
            }, 3200, 150);
        }

        if (triggerButton && triggerButton.closest(sidebarSelector) && !allowSidebarBypass(triggerButton)) {
            return null;
        }

        return triggerButton;
    }

    /**
     * Detect and open native Grok spicy mode menu
     * @returns {Promise<Object>} { found: boolean, element: HTMLElement|null, menuButton: HTMLElement|null }
     */
    async _detectNativeSpicyButton(options = {}) {



        const { autoClick = false } = options || {};

        let autoClicked = false;



        const state = this.stateManager.getState();







        // Skip if spicy mode off



        if (!state.generation.useSpicy) {



            return { found: false, element: null, menuButton: null, autoClicked: false };



        }







        // First, check if menu is already open



        const sidebarSelector = 'nav, aside, [role="navigation"], [data-testid="sidebar"], [class*="sidebar" i], [data-testid="left-nav"], [data-testid="project-list"]';



        const allowSidebarBypass = (el) => {
            if (!el || typeof el.matches !== 'function') {
                return false;
            }
            // v1.20.1: Also allow buttons with lucide-film icon (new Grok UI)
            const hasFilmIcon = el.querySelector && el.querySelector('svg[class*="lucide-film"]');
            if (hasFilmIcon) return true;
            return el.matches('button[aria-label="Video Presets"], button[aria-label="Video Options"], button[aria-label="Favorites"]');
        };



        let menuItems = document.querySelectorAll('[role="menuitem"], [data-radix-collection-item], [data-testid="dropdown-item"], [data-orientation="vertical"] [role="menuitem"]');



        menuItems = Array.from(menuItems).filter(item => !item.closest(sidebarSelector));



        let spicyButton = Array.from(menuItems).find(item => {



            const txt = (item.textContent || '').trim().toLowerCase();



            return txt === 'spicy' || txt.includes('spicy');



        });







        if (spicyButton) {



            window.Logger.debug('UI', '✅ Native spicy button found (menu already open)');



            this._showSpicyDetectedToast();



            return { found: true, element: spicyButton, menuButton: null, autoClicked };



        }







        // Menu not open - find and click the trigger button
        // Button has: film icon SVG, aria-label="Video Presets", chevron icon
        window.Logger.debug('UI', '🔍 Searching for trigger button...');

        let triggerButton = await this._findVideoTriggerButton();



        if (triggerButton && triggerButton.closest(sidebarSelector) && !allowSidebarBypass(triggerButton)) {



            triggerButton = null;



        }



        if (triggerButton) {



            window.Logger.debug('UI', '🎯 Using explicit Video Presets selector');



        }







        if (!triggerButton) {



            triggerButton = Array.from(allButtons).find(btn => {



                if (btn.closest(sidebarSelector) && !allowSidebarBypass(btn)) return false;



                const isVisible = (el) => !!(el.offsetParent || (el.getClientRects && el.getClientRects().length));



                if (!isVisible(btn)) return false;



                const aria = (btn.getAttribute('aria-label') || '').toLowerCase();



                const hasPresetLabel = aria.includes('preset');



                const hasLabel = aria === 'video presets' || hasPresetLabel;



                // v1.20.1: Use attribute selector for space-separated classes
                const hasFilm = !!btn.querySelector('svg[class*="lucide-film"]');



                const hasChevron = !!btn.querySelector('svg[class*="lucide-chevron"]');



                const hasMenuPopup = (btn.getAttribute('aria-haspopup') || '').toLowerCase() === 'menu';







                const videoCue = hasFilm || hasLabel;



                const eligible = videoCue || (hasMenuPopup && hasChevron);



                if (eligible) {



                    window.Logger.debug('UI', '✅ Found match:', {



                        hasLabel,



                        hasFilm: !!hasFilm,



                        hasChevron: !!hasChevron,



                        ariaLabel: btn.getAttribute('aria-label')



                    });



                    return true;



                }



                return false;



            });



        }







        if (!triggerButton) {



            const sampleButtons = Array.from(allButtons).slice(0, 5).map(b => ({



                label: b.getAttribute('aria-label'),



                text: b.textContent?.substring(0, 30)



            }));



            window.Logger.warn('UI', '⚠️ Video preset trigger button not found');



            window.Logger.debug('UI', '🔎 Sample buttons:', sampleButtons);



            this._reportSpicySelectorGap('video-presets-trigger-missing', {



                buttonCount: allButtons.length,



                samples: sampleButtons



            });



            return { found: false, element: null, menuButton: null };



        }







        window.Logger.debug('UI', '🎬 Opening video preset menu...');



        window.Logger.debug('UI', '📊 Button state before click:', {



            'aria-expanded': triggerButton.getAttribute('aria-expanded'),



            'data-state': triggerButton.getAttribute('data-state'),



            'aria-haspopup': triggerButton.getAttribute('aria-haspopup')



        });








        // Use ReactAutomation's reactClick for consistent React-compatible clicking
        if (window.gvpReactAutomation?.reactClick) {
            window.gvpReactAutomation.reactClick(triggerButton, 'Native Spicy Button');
        } else {
            window.Logger.warn('UI', 'ReactAutomation not available, using native click');
            triggerButton.click();
        }

























        // Check if menu actually opened (check aria-expanded attribute)



        window.Logger.debug('UI', '⏳ Waiting for menu to open...');



        let menuOpened = false;



        for (let i = 0; i < 10; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const isExpanded = triggerButton.getAttribute('aria-expanded') === 'true';
            window.Logger.debug('UI', `Check ${i + 1}: aria-expanded="${triggerButton.getAttribute('aria-expanded')}"`);

            if (isExpanded) {
                menuOpened = true;
                window.Logger.debug('UI', '✅ Menu opened successfully');
                break;
            }

            // Only warn and retry on the last attempt
            if (i === 9 && !menuOpened) {
                window.Logger.warn('UI', '⚠️ Menu did not open after 10 attempts');
                this._reportSpicySelectorGap('presets-menu-did-not-open', {
                    ariaExpanded: triggerButton.getAttribute('aria-expanded')
                });
                window.Logger.debug('UI', '🔧 Trying one more direct click...');
                triggerButton.click();
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }







        // Now find the Spicy option



        window.Logger.debug('UI', '🔍 Searching for menu items...');



        menuItems = document.querySelectorAll('[role="menuitem"], [data-radix-collection-item], [data-testid="dropdown-item"], [data-orientation="vertical"] [role="menuitem"]');



        menuItems = Array.from(menuItems).filter(item => !item.closest(sidebarSelector));



        window.Logger.debug('UI', '📊 Found', menuItems.length, 'menu items');







        if (menuItems.length > 0) {



            const menuTexts = Array.from(menuItems).map(item => item.textContent.trim());



            window.Logger.debug('Spicy', '📋 Menu items:', menuTexts);



        }







        const explicitSpicyItem = Array.from(document.querySelectorAll('div[role="menuitem"]'))



            .find(item => (item.textContent || '').trim().toLowerCase() === 'spicy');



        if (explicitSpicyItem && !explicitSpicyItem.closest(sidebarSelector)) {



            spicyButton = explicitSpicyItem;



            window.Logger.debug('UI', '🎯 Using explicit Spicy menu selector');



        }







        if (!spicyButton) {



            spicyButton = Array.from(menuItems).find(item => {



                const txt = (item.textContent || '').trim().toLowerCase();



                return txt === 'spicy' || txt.includes('spicy');



            });



        }







        if (!spicyButton) {



            const waitedSpicy = await this._waitForElement(() => {



                const items = Array.from(document.querySelectorAll('[role="menuitem"], [data-radix-collection-item], [data-testid="dropdown-item"], [data-orientation="vertical"] [role="menuitem"]'))



                    .filter(item => !item.closest(sidebarSelector));



                return items.find(item => {



                    const txt = (item.textContent || '').trim().toLowerCase();



                    return txt === 'spicy' || txt.includes('spicy');



                }) || null;



            }, 2000, 150);



            if (waitedSpicy) {



                spicyButton = waitedSpicy;



                window.Logger.debug('UI', '⏱️ Spicy option appeared after wait');



            }



        }







        if (spicyButton) {





            window.Logger.debug('UI', '✅ Native spicy button detected after menu open');





            this._showSpicyDetectedToast();





            if (autoClick) {





                window.Logger.debug('UI', '🖱️ Clicking spicy option with multiple methods...');





                // Use multiple click methods for reliability





                spicyButton.click();





                ['mousedown', 'mouseup', 'click'].forEach(type => {





                    const evt = new MouseEvent(type, {





                        bubbles: true,





                        cancelable: true,





                        composed: true,





                        view: window





                    });





                    spicyButton.dispatchEvent(evt);





                });





                autoClicked = true;



                if (state?.generation) {



                    state.generation.useNativeSpicy = true;



                }




            }





            return { found: true, element: spicyButton, menuButton: triggerButton, autoClicked };
        }

        return { found: true, element: spicyButton, menuButton: triggerButton, autoClicked: false };
    }



















    /**
     
     
     
     * Show toast notification when native spicy detected
     
     
     
     */



    _showSpicyDetectedToast() {



        // Show standard toast
        this.showToast('🌶️ Native Spicy Detected', 'info', 2000);



        // Remove any existing toast first



        const existingToast = document.getElementById('gvp-spicy-toast');



        if (existingToast) {



            existingToast.remove();



        }




    }







    _reportSpicySelectorGap(reason, extra = {}) {



        const quickMode = this.stateManager?.getState?.().ui?.quickLaunchMode || null;



        const detail = {



            reason,



            url: window.location?.pathname || '',



            quickMode,



            timestamp: Date.now(),



            ...extra



        };



        window.Logger.warn('UI', '?? Selector gap detected', detail);



        try {



            window.dispatchEvent(new CustomEvent('gvp:spicy-selector-gap', { detail }));



        } catch (error) {



            window.Logger.warn('UI', 'Failed to dispatch selector gap event', error);



        }



    }







    _determineGalleryOrigin(url) {



        if (!url || typeof url !== 'string') {



            return null;



        }



        try {



            const normalized = url.toLowerCase();



            if (normalized.includes('/imagine/post/')) {



                return null;



            }



            if (normalized.includes('/imagine/favorites')) {



                return 'favorites';



            }



            if (normalized.includes('/imagine')) {



                return 'imagine';



            }



        } catch (error) {



            window.Logger.warn('UI', 'Failed to determine gallery origin from url', url, error);



        }



        return null;



    }







    /**



     * Click native spicy button and mark as used



     * @returns {Promise<boolean>} True if clicked successfully



     */



    async _activateNativeSpicyMode() {



        const { found, element, menuButton, autoClicked } = await this._detectNativeSpicyButton();







        if (!found) {



            window.Logger.debug('UI', 'No native button found, using tag injection');



            return false;



        }







        // Click the native button



        if (!autoClicked && element) {



            // Use React-compatible click for Grok's native button
            if (window.gvpReactAutomation?.reactClick) {
                window.gvpReactAutomation.reactClick(element, 'Native spicy button');
            } else {
                element.click();
            }

            window.Logger.info('UI', '🌶️ Clicked native spicy button');



        } else if (autoClicked) {



            window.Logger.debug('UI', '🌶️ Native spicy button already clicked during detection');



        }







        // Mark that we're using native mode



        const state = this.stateManager.getState();



        state.generation.useNativeSpicy = true;







        return true;



    }







    /**
     
     
     
     * Initialize gallery image click watcher
     
     
     
     * Detects image clicks on /imagine pages for spicy auto-generation
     
     
     
     */



    _initGalleryWatcher() {



        if (this._galleryWatcherInstalled) {



            return;



        }



        this._galleryWatcherInstalled = true;



        window.Logger.debug('UI', '👁️ Initializing gallery watcher');







        // Watch for image clicks



        document.addEventListener('click', (e) => {



            const state = this.stateManager.getState();







            // Skip if spicy mode is off



            // Skip if neither spicy mode nor quick launch is active
            const quickMode = state.ui?.quickLaunchMode;
            if (!state.generation.useSpicy && !quickMode) {
                return;
            }







            // Detect image card clicks (various selectors for different Grok layouts)



            const imageCard = e.target.closest('[data-testid="image-card"]') ||



                e.target.closest('.gallery-image') ||



                e.target.closest('a[href*="/imagine/post/"]') ||



                e.target.closest('img[src*="grok.com"], img[src*="assets"]')?.parentElement;







            if (!imageCard) return;







            window.Logger.debug('UI', 'Image clicked, spicy mode active');



            const currentOrigin = this._determineGalleryOrigin(window.location.href);



            if (currentOrigin) {



                this._galleryOriginContext = currentOrigin;



            }







            // Wait for image detail page to load



            setTimeout(() => {



                this._handleGalleryImageOpened();



            }, 800);



        }, true);







        // Watch for URL changes (SPA navigation)



        let lastUrl = location.href;



        new MutationObserver(() => {



            const url = location.href;



            if (url !== lastUrl) {



                const previousUrl = lastUrl;



                lastUrl = url;



                if (url.includes('/imagine/post/')) {



                    const origin = this._determineGalleryOrigin(previousUrl) || this._galleryOriginContext;



                    if (origin) {



                        window.Logger.debug('UI', 'Origin context set to', origin);



                    }



                    this._galleryOriginContext = origin;



                    window.Logger.debug('UI', '?? Navigated to image post');



                    setTimeout(() => {



                        this._handleGalleryImageOpened();



                    }, 500);



                } else {



                    this._galleryOriginContext = this._determineGalleryOrigin(url) || this._galleryOriginContext;



                }



            }



        }).observe(document, { subtree: true, childList: true });



    }







    /**



     * Handle gallery image opened - check for spicy button and quick mode



     */



    async _handleGalleryImageOpened() {
        const state = this.stateManager.getState();

        // v1.21.13: Guard - only run on actual image post pages, not gallery pages
        // This prevents re-triggering after ESC returns to gallery
        const currentPath = window.location.pathname || '';
        if (!currentPath.includes('/imagine/post/')) {
            window.Logger.debug('UI', 'Not on image post page, skipping automation. Path:', currentPath);
            return;
        }

        // v1.21.28: Quick Raw/JSON modes are handled EXCLUSIVELY by content.js QuickLaunchManager
        // UIManager._handleGalleryImageOpened now ONLY handles Spicy Mode (native button clicking)
        // This removes the duplicate automation that was causing double video generation.

        // v1.21.30: Skip Spicy if Quick Mode is active - Quick Mode takes precedence
        const quickMode = state.ui?.quickLaunchMode;
        if (quickMode === 'raw' || quickMode === 'json' || quickMode === 'edit') {
            window.Logger.debug('UI', 'Quick mode active, skipping Spicy automation. Mode:', quickMode);
            return;
        }

        // Spicy Mode (Native Automation) - the only automation UIManager handles
        if (!state.generation.useSpicy) {
            return;
        }

        const origin = this._galleryOriginContext ||
            this._determineGalleryOrigin(document.referrer || window.location.href);

        // Expanded Automation: Allow running on any origin (e.g. favorites or imagine)
        // Previously: if (origin !== 'imagine') { ... }

        if (this._nativeSpicyAutomationActive) {

            window.Logger.debug('UI', 'Native spicy automation already running; skipping duplicate trigger');

            return;

        }

        this._nativeSpicyAutomationActive = true;

        this._setQuickLaunchSuppressed(true, 'imagine-native-spicy');

        const { found, element, autoClicked } = await this._detectNativeSpicyButton();

        if (!found) {

            window.Logger.warn('UI', 'No native spicy button found');

            this._reportSpicySelectorGap('native-spicy-missing', { origin });

            this._setQuickLaunchSuppressed(false, 'native-spicy-missing');

            this._nativeSpicyAutomationActive = false;

            return;

        }

        try {

            window.sessionStorage.removeItem('gvp-quick-launch-request');

        } catch (error) {

            window.Logger.warn('UI', 'Unable to clear pending quick payload:', error);

        }

        if (!autoClicked) {



            try {



                // Use React-compatible click for Grok's native button
                if (window.gvpReactAutomation?.reactClick) {
                    window.gvpReactAutomation.reactClick(element, 'Native spicy button');
                } else {
                    element.click();
                }

            } catch (error) {

                window.Logger.error('UI', 'Failed to click native spicy button', error);



                this._setQuickLaunchSuppressed(false, 'native-spicy-click-error');



                this._nativeSpicyAutomationActive = false;



                return;



            }



            window.Logger.info('UI', '🌶️ Clicked native spicy button (imagine origin)');



        } else {



            window.Logger.debug('UI', '🌶️ Native spicy button already auto-clicked during detection');



        }

        state.generation.useNativeSpicy = true;

        this._returnToGallery({ reason: 'native-spicy' });

    }



    async _returnToGallery(options = {}) {

        const { delay = 600, reason = 'auto-return' } = options || {};

        let origin = this._galleryOriginContext;

        if (!origin && document.referrer) {
            origin = this._determineGalleryOrigin(document.referrer);
        }

        // v1.21.2: For spicy mode and quick launch, always attempt to return
        // even if we can't determine the exact gallery origin
        const isAutomationReturn = (reason === 'quick-launch' || reason === 'native-spicy');

        if (!origin && window.location?.pathname?.includes('/imagine/post/')) {
            // Default to 'imagine' if we're on a post page
            origin = 'imagine';
        }

        // Log origin detection for debugging
        window.Logger.debug('UI', 'Return logic:', { origin, reason, isAutomationReturn, referrer: document.referrer });

        // For automation returns, always proceed. For manual returns, check origin.
        if (!isAutomationReturn && origin !== 'imagine' && origin !== 'favorites') {
            window.Logger.debug('UI', 'Skipping auto-return (' + reason + ') because origin=' + (origin || 'unknown'));
            this._setQuickLaunchSuppressed(false, 'origin-' + (origin || 'unknown'));
            this._nativeSpicyAutomationActive = false;
            return;
        }
        setTimeout(async () => {
            // v1.21.13: For quick-launch, use ESC directly for reliable gallery return
            // Button detection was causing wrong navigation (e.g., /imagine instead of /imagine/favorites)
            if (reason === 'quick-launch') {
                window.Logger.debug('UI', '⎋ Using ESC for quick-launch return (simplified)');
                this._simulateEscapeToGallery(reason);
            } else {
                // For other reasons (native-spicy), try button first, then fallback to ESC
                const closed = await this._attemptImageDetailClose(reason);
                if (!closed) {
                    window.Logger.warn('UI', 'Back button not found; using Escape fallback');
                    this._simulateEscapeToGallery(reason);
                }
            }



            this._galleryOriginContext = null;



            this._nativeSpicyAutomationActive = false;



            this._setQuickLaunchSuppressed(false, 'native-spicy-finished');



        }, delay);



    }







    async _attemptImageDetailClose(reason) {



        const selectors = [



            'button[aria-label="Back"]',



            'button[aria-label="Back to gallery"]',



            'button[aria-label="Back to Gallery"]',



            'button[aria-label="Close"]',



            'button[aria-label="Close detail"]',



            '[data-testid="gallery-back-button"]',



            '[data-testid="detail-close-button"]'



        ];



        const findButton = () => this._findFirstMatchingElement(selectors);



        let closeButton = findButton();



        if (!closeButton) {



            closeButton = await this._waitForElement(findButton, 1500, 100, '[GVP Gallery]');



        }



        if (!closeButton) {



            return false;



        }







        window.Logger.debug('UI', '🔙 Clicking image detail back button (' + reason + ')');



        ['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'click'].forEach(type => {



            const evt = new MouseEvent(type, {



                bubbles: true,



                cancelable: true,



                composed: true,



                view: window



            });



            closeButton.dispatchEvent(evt);



        });



        return true;



    }







    _simulateEscapeToGallery(reason) {



        try {



            ['keydown', 'keyup'].forEach(type => {



                const evt = new KeyboardEvent(type, {



                    key: 'Escape',



                    code: 'Escape',



                    keyCode: 27,



                    which: 27,



                    bubbles: true



                });



                document.dispatchEvent(evt);



            });



            window.Logger.debug('UI', '⎋ Sent Escape to exit detail view (' + reason + ')');



            return true;



        } catch (error) {



            window.Logger.warn('UI', 'Failed to dispatch Escape key', error);



            return false;



        }



    }







    _findFirstMatchingElement(selectors = []) {



        for (const selector of selectors) {



            if (!selector) {



                continue;



            }



            const element = document.querySelector(selector);



            if (element) {



                return element;



            }



        }



        return null;



    }







    /**
     
     
     
     * Trigger generation based on active quick mode
     
     
     
     */



    async _triggerQuickGeneration() {
        const state = this.stateManager.getState();
        const mode = state.ui.quickLaunchMode;
        let generationPromise = null;

        if (mode === 'json') {
            window.Logger.debug('UI', '📄 Triggering Quick JSON generation');
            if (this.uiFormManager && typeof this.uiFormManager.handleGenerateJson === 'function') {
                generationPromise = this.uiFormManager.handleGenerateJson({ allowEmpty: false });
            }
        } else if (mode === 'raw') {
            window.Logger.debug('UI', '📝 Triggering Quick Raw generation');
            if (this.uiRawInputManager && typeof this.uiRawInputManager.handleGenerateRaw === 'function') {
                generationPromise = this.uiRawInputManager.handleGenerateRaw({ allowEmpty: false });
            }
        }

        // If generation started, wait for it then return to gallery
        if (generationPromise) {
            try {
                window.Logger.debug('UI', 'Waiting for generation submission...');
                await generationPromise;
                window.Logger.debug('UI', 'Generation submitted. Returning to gallery...');

                // Use the standardized return logic
                await this._returnToGallery({ reason: 'quick-launch' });

                // Clear suppression/flags
                this._setQuickLaunchSuppressed(false, 'quick-launch-complete');

            } catch (error) {
                window.Logger.error('UI', 'Quick generation failed:', error);
                this._setQuickLaunchSuppressed(false, 'quick-launch-error');
            }
        } else {
            window.Logger.debug('UI', 'No generation triggered (managers missing or conditions not met)');
        }
    }







    async _waitForElement(selector, timeout = 3000, interval = 100, contextLabel = '[GVP Spicy]') {



        const start = Date.now();



        const label = typeof selector === 'string' ? selector : 'custom-selector';



        window.Logger.debug('UI', `${contextLabel} ⏳ Waiting for ${label} (timeout ${timeout}ms)`);



        while (Date.now() - start < timeout) {



            const element = typeof selector === 'function'



                ? selector()



                : document.querySelector(selector);



            if (element) {



                window.Logger.debug('UI', `${contextLabel} ✅ Found ${label} after ${Date.now() - start}ms`);



                return element;



            }



            await new Promise(resolve => setTimeout(resolve, interval));



        }



        window.Logger.warn('UI', `${contextLabel} ⚠️ Timed out waiting for ${label} after ${timeout}ms`);



        return null;



    }







    toggleQuoteWrapMode() {



        const state = this.stateManager.getState();



        const next = !state.settings.wrapInQuotes;



        if (typeof this.stateManager.setWrapInQuotes === 'function') {



            this.stateManager.setWrapInQuotes(next);



        } else {



            state.settings.wrapInQuotes = next;



            state.ui.wrapInQuotes = next;



            this.stateManager.saveSettings();



        }



        this._syncQuoteWrapButton(next);



        window.Logger.info('UI', 'Quote Wrap Mode ->', next ? 'ENABLED' : 'DISABLED');



    }







    toggleAuroraMode() {



        const state = this.stateManager.getState();



        const next = !state.settings.auroraEnabled;



        if (typeof this.stateManager.setAuroraEnabled === 'function') {



            this.stateManager.setAuroraEnabled(next);



        } else {



            state.settings.auroraEnabled = next;



            this.stateManager.saveSettings();



        }



        this._syncAuroraButton(next);



        window.Logger.info('Aurora', 'Auto-injection ->', next ? 'ENABLED' : 'DISABLED');



    }







    _updateBottomBar() {



        const bottomBar = this.shadowRoot.getElementById('gvp-bottom-bar');



        const state = this.stateManager.getState();



        if (state.ui.drawerExpanded) {



            bottomBar.classList.add('expanded');



        } else {



            bottomBar.classList.remove('expanded');



        }



    }







    // Delegation methods for sub-managers



    switchTab(tabName) {



        if (this.uiTabManager) {



            this.uiTabManager.switchTab(tabName);



        }



    }







    expandCategory(categoryName) {



        if (this.uiFormManager) {



            this.uiFormManager.expandCategory(categoryName);



        }



    }







    collapseToGrid() {



        if (this.uiFormManager) {



            this.uiFormManager.collapseToGrid();



        }



    }







    selectTemplate(templateName) {



        if (this.uiRawInputManager) {



            this.uiRawInputManager.selectTemplate(templateName);



        }



    }







    loadRecentPrompt(prompt) {



        if (this.uiRawInputManager) {



            this.uiRawInputManager.loadRecentPrompt(prompt);



        }



    }







    createStatusDisplay() {



        if (this.uiStatusManager) {



            return this.uiStatusManager.createStatusDisplay();



        }



        return document.createElement('div');



    }







    _createJsonEditorTab() {



        if (this.uiFormManager) {



            return this.uiFormManager._createJsonEditorTab();



        }



        return document.createElement('div');



    }







    _createRawInputTab() {



        if (this.uiRawInputManager) {



            return this.uiRawInputManager._createRawInputTab();



        }



        return document.createElement('div');



    }







    _createHistoryTab() {



        // Force rebuild if cached (for UI updates)



        // Remove this check to always rebuild fresh
        // if (this._multiGenHistoryState.root) {
        //     return this._multiGenHistoryState.root;
        // }

        const root = document.createElement('div');
        root.className = 'gvp-mg-root';



        window.Logger.debug('UI', 'Creating Multi-Gen history tab');







        const header = document.createElement('div');



        header.className = 'gvp-mg-header';







        // Title row: title on left, controls on right



        const titleRow = document.createElement('div');



        titleRow.className = 'gvp-mg-title-row';







        const title = document.createElement('h3');



        title.className = 'gvp-mg-title';



        title.textContent = 'Multi-Generation Tracker';







        const controls = document.createElement('div');



        controls.className = 'gvp-mg-controls';







        const sortLabel = document.createElement('label');



        sortLabel.className = 'gvp-mg-control';







        const sortSelect = document.createElement('select');



        sortSelect.className = 'gvp-mg-select';



        sortSelect.innerHTML = `
            <option value="default">Default order</option>
            <option value="updated-desc">Recently updated</option>
            <option value="success-desc">Recent successes</option>
            <option value="success-asc">Oldest successes</option>
            <option value="moderated-desc">Recent moderated</option>
            <option value="moderated-asc">Oldest moderated</option>
        `;

        sortSelect.value = this._multiGenHistoryState.sortMode;

        // v1.21.45: Debounce sort changes to prevent rapid re-renders
        const debouncedRender = window.gvpDebounce ?
            window.gvpDebounce(() => this._renderMultiGenHistory(), 200) :
            () => this._renderMultiGenHistory();

        sortSelect.addEventListener('change', () => {
            this._multiGenHistoryState.sortMode = sortSelect.value;
            window.Logger.debug('UI', 'History sort changed', this._multiGenHistoryState.sortMode);
            debouncedRender();
        });

        sortLabel.appendChild(sortSelect);
        controls.appendChild(sortLabel);

        titleRow.appendChild(title);
        titleRow.appendChild(controls);

        // Summary: Account ID line
        const summaryAccount = document.createElement('div');
        summaryAccount.className = 'gvp-mg-summary-account';
        const initialAccount = this.stateManager?.getActiveMultiGenAccount?.();
        summaryAccount.textContent = initialAccount
            ? `Account: ${initialAccount}`
            : 'No active account';

        // Summary: Stats line
        const summaryStats = document.createElement('div');
        summaryStats.className = 'gvp-mg-summary-stats';
        summaryStats.textContent = 'No generations tracked yet';

        header.appendChild(titleRow);
        header.appendChild(summaryAccount);
        header.appendChild(summaryStats);

        const cardContainer = document.createElement('div');
        cardContainer.className = 'gvp-mg-cards';

        root.appendChild(header);
        root.appendChild(cardContainer);

        this._multiGenHistoryState = {
            ...this._multiGenHistoryState,
            root,
            header,
            summaryAccount,
            summaryStats,
            cardContainer,
            sortSelect,
        };

        this._registerMultiGenHistoryListener();
        this._renderMultiGenHistory();
        window.Logger.debug('UI', 'Multi-Gen history tab initial render complete');

        return root;
    }

    _registerMultiGenHistoryListener() {
        if (this._multiGenHistoryListener) {
            return;
        }

        this._multiGenHistoryListener = (event) => {
            const detail = event.detail;
            window.Logger.debug('UI', '👂 History update received:', detail?.imageId, detail?.status);
            if (!detail || !detail.imageId) return;

            // STRICT THROTTLING: Prevent DOM thrashing
            // Only allow one update per second per card, unless it's a final state
            const now = Date.now();
            const lastUpdate = this._updateThrottleMap?.get(detail.imageId) || 0;
            const finalStatuses = new Set(['completed', 'success', 'failed', 'moderated']);
            const isFinal = finalStatuses.has(detail.status) || (typeof detail.type === 'string' && detail.type.includes('final'));

            if (!isFinal && (now - lastUpdate < 1000)) {
                return; // Skip update
            }

            // Initialize throttle map if needed
            if (!this._updateThrottleMap) {
                this._updateThrottleMap = new Map();
            }
            this._updateThrottleMap.set(detail.imageId, now);

            // Use requestAnimationFrame to batch DOM updates
            requestAnimationFrame(() => {
                const handled = this._updateMultiGenProgressUI(detail);
                // Final states or unhandled updates trigger a full re-render to refresh cards/sorting
                if (isFinal || !handled) {
                    this._renderMultiGenHistory();
                }
            });
        };

        window.addEventListener('gvp:multi-gen-history-update', this._multiGenHistoryListener);
        window.Logger.debug('UI', 'Registered multi-gen history update listener (Throttled)');
    }

    _renderMultiGenHistory(limit = 50, append = false) {
        // window.Logger.debug('UI', '🎨 _renderMultiGenHistory called', { limit, append });
        const state = this._multiGenHistoryState;

        if (!state?.cardContainer || !this.stateManager?.getMultiGenHistoryEntries) {
            window.Logger.debug('UI', 'Skipping history render: container/state missing');
            return;
        }

        const activeAccount = this.stateManager?.getActiveMultiGenAccount?.() || null;

        // Get ALL entries to calculate stats
        let allEntries = this.stateManager.getMultiGenHistoryEntries({
            clone: true,
            sortMode: state.sortMode || 'default'
        }) || [];

        // Apply sorting
        allEntries = this._getSortedMultiGenEntries(allEntries);

        // Calculate stats (on full dataset)
        const imageCount = allEntries.length;
        const totalAttempts = allEntries.reduce((acc, entry) => acc + (entry.attempts?.length || 0), 0);
        const activeImages = allEntries.filter(e => e.attempts?.some(a => a.status === 'pending')).length;
        const moderatedImages = allEntries.filter(e => e.moderated || e.attempts?.some(a => a.status === 'moderated')).length;

        const parts = [
            `${imageCount} image${imageCount === 1 ? '' : 's'}`,
            `${totalAttempts} attempt${totalAttempts === 1 ? '' : 's'}`
        ];

        if (moderatedImages) {
            parts.push(`${moderatedImages} moderated`);
        }

        state.summaryStats.textContent = parts.join(' · ');

        // Update account display
        if (activeAccount) {
            state.summaryAccount.textContent = `Account: ${activeAccount.substring(0, 8)}...`;
            state.summaryAccount.style.display = '';
        } else {
            state.summaryAccount.textContent = 'No active account';
            state.summaryAccount.style.display = '';
        }

        // Pagination Logic
        state.currentLimit = append ? (state.currentLimit || 50) + limit : limit;
        const entriesToRender = allEntries.slice(0, state.currentLimit);
        const hasMore = state.currentLimit < allEntries.length;

        // Build cards
        const fragment = document.createDocumentFragment();

        for (const entry of entriesToRender) {
            const card = this._buildMultiGenCard(entry);
            if (card) {
                fragment.appendChild(card);
            }
        }

        // Add "Load More" button if needed
        if (hasMore) {
            const loadMoreBtn = document.createElement('div');
            loadMoreBtn.className = 'gvp-history-load-more';
            loadMoreBtn.textContent = `Load More (${allEntries.length - state.currentLimit} remaining)`;
            loadMoreBtn.style.cssText = `
                padding: 12px;
                text-align: center;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                cursor: pointer;
                margin-top: 10px;
                color: #aaa;
                font-size: 13px;
            `;
            loadMoreBtn.onclick = () => {
                this._renderMultiGenHistory(50, true);
            };
            fragment.appendChild(loadMoreBtn);
        }

        // Render
        state.cardContainer.innerHTML = '';
        state.cardContainer.appendChild(fragment);

        // v1.21.45: Setup lazy loading observer after DOM is populated
        this._setupThumbnailLazyLoading();
    }







    _createGenerationsTab() {



        return this._createHistoryTab();



    }







    /**
     * v1.21.45: Setup IntersectionObserver for lazy-loading thumbnails
     * Thumbnails use data-src attribute until they enter the viewport
     */
    _setupThumbnailLazyLoading() {
        const state = this._multiGenHistoryState;

        // Disconnect existing observer if any
        if (state.thumbnailObserver) {
            state.thumbnailObserver.disconnect();
        }

        // Create new observer
        state.thumbnailObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const thumb = entry.target;
                    const src = thumb.dataset.src;
                    if (src && !thumb.dataset.loaded) {
                        // Load the image
                        thumb.style.backgroundImage = `url("${src}")`;
                        thumb.dataset.loaded = 'true';
                        thumb.classList.remove('gvp-thumb-loading');
                        thumb.classList.add('gvp-thumb-loaded');
                    }
                    // Stop observing once loaded
                    state.thumbnailObserver.unobserve(thumb);
                }
            });
        }, {
            root: state.cardContainer, // Observe within the card container
            rootMargin: '100px', // Load 100px before entering viewport
            threshold: 0.01
        });

        // Observe all unloaded thumbnails
        const unloadedThumbs = state.cardContainer?.querySelectorAll('.gvp-mg-thumb[data-src]:not([data-loaded])');
        if (unloadedThumbs) {
            unloadedThumbs.forEach(thumb => state.thumbnailObserver.observe(thumb));
            window.Logger.debug('UI', `👁️ Observing ${unloadedThumbs.length} thumbnails for lazy loading`);
        }
    }

    _createFullscreenModal() {



        if (this.uiModalManager) {



            this.uiModalManager._createFullscreenModal();



        }



    }







    _createViewJsonModal() {



        if (this.uiModalManager) {



            this.uiModalManager._createViewJsonModal();



        }



    }







    attachRawInputEventListeners() {



        if (this.uiRawInputManager) {



            this.uiRawInputManager.attachRawInputEventListeners();



        }



    }







    // Status management delegation



    updateGenerationStatus(status, data = {}) {



        if (this.uiStatusManager && typeof this.uiStatusManager.updateGenerationStatus === 'function') {



            this.uiStatusManager.updateGenerationStatus(status, data);



        }



    }







    updateProgressBar(progress) {



        if (this.uiStatusManager && typeof this.uiStatusManager.updateProgressBar === 'function') {



            this.uiStatusManager.updateProgressBar(progress);



        }



    }







    updateSpicyModeButton(isActive) {



        if (this.uiStatusManager && typeof this.uiStatusManager.updateSpicyModeButton === 'function') {



            this.uiStatusManager.updateSpicyModeButton(isActive);



        }



    }







    updateGenerationButtonState(isGenerating) {



        const genBtn = this.shadowRoot.getElementById('gvp-gen-btn');



        if (genBtn) {



            if (isGenerating) {



                genBtn.classList.add('generating');



            } else {



                genBtn.classList.remove('generating');



            }



        }



    }







    setSilentMode(isEnabled, { from = 'ui', persist = true, force = false } = {}) {



        if (!this.stateManager || typeof this.stateManager.getState !== 'function') {



            return;



        }



        const state = this.stateManager.getState();



        if (!state?.settings) {



            return;



        }



        const next = !!isEnabled;



        const current = !!state.settings.silentMode;



        const shouldUpdateSetting = force || current !== next;



        if (shouldUpdateSetting) {



            state.settings.silentMode = next;



        }



        if (next && typeof this.stateManager.applySilentModeAudioDefaults === 'function') {



            this.stateManager.applySilentModeAudioDefaults();



        }



        if (persist && typeof this.stateManager.saveSettings === 'function') {



            this.stateManager.saveSettings();



        }



        this.updateVoiceOnlyIndicator(next);



        if (this.uiSettingsManager && typeof this.uiSettingsManager.syncSilentModeUI === 'function') {



            this.uiSettingsManager.syncSilentModeUI(next);



        }



        if (this.launcherSilentBtn) {



            this.launcherSilentBtn.classList.toggle('active', next);



            this.launcherSilentBtn.setAttribute('aria-pressed', next ? 'true' : 'false');



        }



        if (this.uiFormManager && typeof this.uiFormManager.refreshCurrentView === 'function') {



            this.uiFormManager.refreshCurrentView();



        }



        if (shouldUpdateSetting || force) {



            window.Logger.info('UI', `Silent mode ${next ? 'enabled' : 'disabled'} (${from})`);



        }



    }







    updateVoiceOnlyIndicator(isEnabled) {



        const voiceIndicator = this.shadowRoot && this.shadowRoot.getElementById('gvp-voice-indicator');



        if (voiceIndicator) {



            voiceIndicator.classList.toggle('active', !!isEnabled);



        }



    }







    updateWordCount(count) {
        if (this.uiModalManager && typeof this.uiModalManager.updateWordCount === 'function') {
            this.uiModalManager.updateWordCount(count);
        }
    }

    async updateTemplateContentFromFullscreen(templateId, role, content) {
        window.Logger.debug('UI', 'UIManager.updateTemplateContentFromFullscreen', templateId, role);
        if (this.uiRawInputManager && typeof this.uiRawInputManager.updateTemplateContentFromFullscreen === 'function') {
            await this.uiRawInputManager.updateTemplateContentFromFullscreen(templateId, role, content);
        } else {
            window.Logger.warn('UI', 'UIRawInputManager not available for template update');
        }
    }

    // JSON data persistence - update UI when state changes

    refreshJsonDisplay() {



        if (this.uiFormManager && typeof this.uiFormManager.refreshCurrentView === 'function') {



            this.uiFormManager.refreshCurrentView();



        }



    }







    // Get current JSON state



    getCurrentJson() {



        if (this.uiFormManager) {



            return this.uiFormManager.getCurrentJson();



        }



        return this.stateManager.getState().promptData;



    }







    /**
     
     
     
     * Update promptData from a videoPrompt string (from API response)
     
     
     
     * @param {string} videoPromptString - The stringified videoPrompt from API
     
     
     
     */



    updatePromptFromVideoPrompt(videoPromptString) {



        const success = this.stateManager.updatePromptDataFromVideoPrompt(videoPromptString);



        if (success && this.uiFormManager) {



            // Refresh the UI to show the updated data



            this.uiFormManager.refreshCurrentView();



            window.Logger.info('UI', '✅ UI updated with new videoPrompt data');



        }



        if (success) {



            this.refreshHistoryTab(true);



        }



        return success;



    }







    async _handleFetchLatestPrompt(event) {



        if (!this._historyFeatureEnabled) {



            window.Logger.info('UI', 'History fetch ignored; feature disabled.');



            return;



        }



        if (!this.uiHistoryManager) {



            window.Logger.info('UI', 'Legacy prompt fetch skipped; merged history view active.');



            return;



        }



        const button = event?.currentTarget;



        if (!button || button.dataset.loading === 'true') {



            return;



        }







        const imageId = this._resolveActiveImageId();



        if (!imageId) {



            window.Logger.warn('UI', '⚠️ Unable to determine active image id for prompt fetch');



            return;



        }







        button.dataset.loading = 'true';



        const originalLabel = button.innerHTML;



        button.innerHTML = '⏳ Fetching...';



        button.disabled = true;







        try {



            const payload = await this._fetchPostPayload(imageId);



            if (!payload) {



                return;



            }



            this._processFetchedPostPayload(payload, { imageId, source: 'manual-button' });



        } catch (error) {



            window.Logger.error('UI', '❌ Failed fetching latest prompt:', error);



        } finally {



            button.dataset.loading = 'false';



            button.innerHTML = originalLabel;



            button.disabled = false;



        }



    }







    async refreshHistoryTab(forceReload = false) { // eslint-disable-line no-unused-vars



        if (!this._historyFeatureEnabled) {



            return;



        }



        this._renderMultiGenHistory();



    }








    _registerMultiGenHistoryListener() {
        if (this._multiGenHistoryListener) {
            return;
        }

        this._multiGenHistoryListener = (event) => {
            const detail = event.detail;
            window.Logger.debug('UI', '👂 History update received:', detail?.imageId, detail?.status);
            if (!detail || !detail.imageId) return;

            // STRICT THROTTLING: Prevent DOM thrashing
            // Only allow one update per second per card, unless it's a final state
            const now = Date.now();
            const lastUpdate = this._updateThrottleMap?.get(detail.imageId) || 0;
            const isFinal = detail.status === 'completed' || detail.status === 'failed' || detail.status === 'moderated';

            if (!isFinal && (now - lastUpdate < 1000)) {
                return; // Skip update
            }

            // Initialize throttle map if needed
            if (!this._updateThrottleMap) {
                this._updateThrottleMap = new Map();
            }
            this._updateThrottleMap.set(detail.imageId, now);

            // Use requestAnimationFrame to batch DOM updates
            requestAnimationFrame(() => {
                const handled = this._updateMultiGenProgressUI(detail);
                if (!handled && isFinal) {
                    // If we couldn't update in-place and it's a final state, 
                    // we might need to refresh the list, but let's be careful not to re-render everything
                    // For now, just log it.
                    // window.Logger.debug('UI', 'Could not incrementally update history card for final state', detail.imageId);
                }
            });
        };






        window.addEventListener('gvp:multi-gen-history-update', this._multiGenHistoryListener);
        window.Logger.info('UI', 'Registered multi-gen history update listener (Throttled)');
    }

    _getSortedMultiGenEntries(entries) {



        const state = this._multiGenHistoryState;



        const sorted = entries.slice();



        const mode = state.sortMode || 'default';







        const coerceTime = (value) => {



            if (!value) return 0;



            const ts = typeof value === 'number' ? value : Date.parse(value);



            return Number.isFinite(ts) ? ts : 0;



        };







        const entryUpdated = entry => coerceTime(entry.updatedAt || entry.createdAt);



        const entrySuccess = entry => coerceTime(entry.lastSuccessAt);



        const entryModerated = entry => coerceTime(entry.lastModeratedAt);







        switch (mode) {



            case 'updated-desc':



                sorted.sort((a, b) => entryUpdated(b) - entryUpdated(a));



                break;



            case 'success-desc':



                sorted.sort((a, b) => entrySuccess(b) - entrySuccess(a));



                break;



            case 'success-asc':



                sorted.sort((a, b) => entrySuccess(a) - entrySuccess(b));



                break;



            case 'moderated-desc':



                sorted.sort((a, b) => entryModerated(b) - entryModerated(a));



                break;



            case 'moderated-asc':



                sorted.sort((a, b) => entryModerated(a) - entryModerated(b));



                break;



            default:



                break; // state order already preserved by clone



        }









        return sorted;
    }

    _buildMultiGenCard(entry) {



        const card = document.createElement('article');



        card.className = 'gvp-mg-card';



        card.dataset.imageId = entry.imageId;
        // VIDEO-CENTRIC FIX: Use virtualId for unique card identification
        if (entry.virtualId) {
            card.dataset.cardId = entry.virtualId;
        } else {
            card.dataset.cardId = entry.imageId;
        }



        if (entry.expanded) {



            card.classList.add('expanded');



        }







        const hasPending = entry.attempts.some(attempt => attempt.status === 'pending');



        if (hasPending) {



            card.classList.add('has-active');



        }







        const headerButton = document.createElement('button');



        headerButton.type = 'button';



        headerButton.className = 'gvp-mg-card-header';







        const thumb = document.createElement('div');



        thumb.className = 'gvp-mg-thumb';



        // ✅ FIX: Check all possible thumbnail fields
        // v1.21.45: Use data-src for lazy loading
        const thumbUrl = entry.thumbnailUrl || entry.imageUrl || entry.imageThumbnailUrl;
        if (thumbUrl) {



            // Lazy load: set data-src, not background-image directly
            thumb.dataset.src = thumbUrl;
            thumb.classList.add('gvp-thumb-loading');



            thumb.title = 'Open image preview';



            thumb.setAttribute('role', 'button');



            thumb.setAttribute('tabindex', '0');



            const openPreview = (event) => {



                event.stopPropagation();



                this._openMultiGenImageModal(thumbUrl, entry.imageId);



            };



            thumb.addEventListener('click', openPreview);



            thumb.addEventListener('keydown', (event) => {



                if (event.key === 'Enter' || event.key === ' ') {



                    event.preventDefault();



                    openPreview(event);



                }



            });



        } else {



            thumb.classList.add('placeholder');



            thumb.textContent = 'IMG';



        }







        // Main content area (horizontal layout)



        const content = document.createElement('div');



        content.className = 'gvp-mg-card-content';







        // Left section: Progress text + inline emoji buttons



        const leftActions = document.createElement('div');



        leftActions.className = 'gvp-mg-left-actions';







        // Progress text with inline buttons



        const progressTextWrapper = document.createElement('div');



        progressTextWrapper.className = 'gvp-mg-progress-text-wrapper';







        const progressText = document.createElement('span');



        progressText.className = 'gvp-mg-progress-text';



        const activeAttempt = entry.attempts.find(attempt => attempt.status === 'pending');



        // ✅ FIX: Calculate latest timestamps dynamically
        const successAttempts = entry.attempts.filter(a => a.status === 'success');
        const latestSuccessTime = successAttempts.length > 0
            ? Math.max(...successAttempts.map(a => new Date(a.finishedAt || a.timestamp || 0).getTime()))
            : 0;

        const moderatedAttempts = entry.attempts.filter(a => a.status === 'moderated');
        const latestModeratedTime = moderatedAttempts.length > 0
            ? Math.max(...moderatedAttempts.map(a => new Date(a.finishedAt || a.timestamp || 0).getTime()))
            : 0;

        if (activeAttempt) {
            const activeProgressValue = this._getLatestAttemptProgress(activeAttempt);
            if (activeProgressValue != null) {
                progressText.textContent = `${activeProgressValue}% `;
            } else {
                progressText.textContent = 'starting...';
            }
        } else if (latestSuccessTime > 0) {
            progressText.textContent = `Last success ${this._formatRelativeTime(new Date(latestSuccessTime).toISOString())} `;
        } else if (latestModeratedTime > 0) {
            const latestModeratedAttempt = moderatedAttempts.find(a =>
                new Date(a.finishedAt || a.timestamp || 0).getTime() === latestModeratedTime
            );
            const moderatedProgress = latestModeratedAttempt
                ? this._getLatestAttemptProgress(latestModeratedAttempt)
                : null;
            if (moderatedProgress !== null && moderatedProgress !== undefined) {
                progressText.textContent = `Moderated (${moderatedProgress}%) ${this._formatRelativeTime(new Date(latestModeratedTime).toISOString())} `;
            } else {
                progressText.textContent = `Last moderated ${this._formatRelativeTime(new Date(latestModeratedTime).toISOString())} `;
            }
        } else {
            progressText.textContent = `Updated ${this._formatRelativeTime(entry.updatedAt || entry.createdAt)} `;
        }



        progressTextWrapper.appendChild(progressText);







        // Inline emoji buttons



        const inlineActions = document.createElement('div');



        inlineActions.className = 'gvp-mg-inline-actions';







        const promptBtn = document.createElement('button');



        promptBtn.type = 'button';



        promptBtn.className = 'gvp-mg-micro-btn';
        promptBtn.textContent = '📝';
        promptBtn.title = 'View prompt';



        promptBtn.addEventListener('click', (e) => {



            e.stopPropagation();



            this._openPromptViewer(entry);



        });



        inlineActions.appendChild(promptBtn);







        const imageBtn = document.createElement('button');



        imageBtn.type = 'button';



        imageBtn.className = 'gvp-mg-micro-btn';



        imageBtn.textContent = '🖼️';



        imageBtn.title = 'Open image page';



        imageBtn.addEventListener('click', (e) => {



            e.stopPropagation();



            const targetPath = `/imagine/post/${entry.imageId}`;
            const fullUrl = `https://grok.com${targetPath}`;

            try {
                // God Mode Snap: Instant navigation without reload
                window.history.pushState({}, '', targetPath);
                window.dispatchEvent(new PopStateEvent('popstate'));
                window.Logger.info('UI', '⚡ Snap navigation to:', targetPath);
            } catch (snapError) {
                window.Logger.warn('UI', 'Snap failed, using location.assign', snapError);
                window.location.assign(fullUrl);
            }



        });



        inlineActions.appendChild(imageBtn);







        // Video button - find last successful video



        const lastSuccessAttempt = entry.attempts.find(a => a.status === 'success' && a.videoUrl);



        if (lastSuccessAttempt) {



            const videoBtn = document.createElement('button');



            videoBtn.type = 'button';



            videoBtn.className = 'gvp-mg-micro-btn';



            videoBtn.textContent = '🎥';



            videoBtn.title = 'Open last successful video';



            videoBtn.addEventListener('click', (e) => {



                e.stopPropagation();



                window.open(lastSuccessAttempt.videoUrl, '_blank', 'noopener');



            });



            inlineActions.appendChild(videoBtn);



        }







        progressTextWrapper.appendChild(inlineActions);



        leftActions.appendChild(progressTextWrapper);







        // Progress bar below text



        const progressBar = document.createElement('div');



        progressBar.className = 'gvp-mg-inline-progress-bar';



        const barFill = document.createElement('div');



        barFill.className = 'gvp-mg-progress-fill';



        if (activeAttempt) {



            const activeProgressValue = this._getLatestAttemptProgress(activeAttempt);



            barFill.style.width = activeProgressValue != null ? `${activeProgressValue}%` : '0%';



        } else {



            barFill.style.width = '0%';



        }



        progressBar.appendChild(barFill);



        leftActions.appendChild(progressBar);







        // Right section: Status lights (vertically stacked)



        const statusLights = document.createElement('div');



        statusLights.className = 'gvp-mg-status-lights-stack';







        const pendingCount = entry.attempts.filter(attempt => attempt.status === 'pending').length;



        // ✅ FIX: Calculate success count dynamically from attempts
        const successCount = entry.attempts.filter(attempt => attempt.status === 'success').length;



        const moderatedCount = entry.attempts.filter(attempt => attempt.status === 'moderated').length;



        const lastStatus = entry.attempts.length > 0 ? entry.attempts[0].status : null;







        // Pending light (yellow)



        if (pendingCount > 0) {



            const pendingLight = document.createElement('span');



            pendingLight.className = 'gvp-mg-status-light-small pending' + (lastStatus === 'pending' ? ' active' : '');



            pendingLight.textContent = pendingCount;



            pendingLight.title = `${pendingCount} pending`;



            statusLights.appendChild(pendingLight);



        }







        // Success light (green)



        const successLight = document.createElement('span');



        successLight.className = 'gvp-mg-status-light-small success' + (lastStatus === 'success' ? ' active' : '');



        successLight.textContent = successCount;



        successLight.title = `${successCount} successful`;



        statusLights.appendChild(successLight);







        // Moderated light (red)



        const moderatedLight = document.createElement('span');



        moderatedLight.className = 'gvp-mg-status-light-small moderated' + (lastStatus === 'moderated' ? ' active' : '');



        moderatedLight.textContent = moderatedCount;



        moderatedLight.title = `${moderatedCount} moderated`;



        statusLights.appendChild(moderatedLight);







        // Delete button (top-right corner)



        const deleteBtn = document.createElement('button');



        deleteBtn.type = 'button';



        deleteBtn.className = 'gvp-mg-delete-btn';



        deleteBtn.textContent = 'X';



        deleteBtn.title = 'Delete this image and all attempts';



        deleteBtn.addEventListener('click', (e) => {



            e.stopPropagation();



            this._deleteMultiGenImage(entry.imageId);



        });







        content.appendChild(leftActions);



        content.appendChild(statusLights);



        content.appendChild(deleteBtn);







        headerButton.appendChild(thumb);



        headerButton.appendChild(content);







        headerButton.addEventListener('click', () => {



            const next = !card.classList.contains('expanded');



            card.classList.toggle('expanded', next);



            body.hidden = !next;



            if (typeof this.stateManager?.setMultiGenImageExpanded === 'function') {



                this.stateManager.setMultiGenImageExpanded(entry.imageId, next);



            }



        });







        const body = document.createElement('div');



        body.className = 'gvp-mg-card-body';



        body.hidden = !entry.expanded;







        if (!entry.attempts.length) {



            const empty = document.createElement('div');



            empty.className = 'gvp-mg-attempt-empty';



            empty.textContent = 'No generations recorded yet for this image.';



            body.appendChild(empty);



        } else {



            entry.attempts.forEach((attempt) => {



                body.appendChild(this._buildMultiGenAttempt(entry, attempt));



            });



        }







        card.appendChild(headerButton);



        card.appendChild(body);



        return card;



    }







    _updateMultiGenProgressUI(detail = {}) {



        const state = this._multiGenHistoryState;

        if (!state?.cardContainer || typeof this.stateManager?.getMultiGenHistoryEntry !== 'function') {
            return false;
        }

        const imageId = typeof detail.imageId === 'string' ? detail.imageId : '';
        if (!imageId) {
            return false;
        }

        // DEBUG: Trace progress updates
        window.Logger.debug('UI', 'Updating progress for:', imageId, detail.status);

        let selectorId = imageId;
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
            selectorId = CSS.escape(imageId);
        } else {
            selectorId = imageId.replace(/"/g, '\\"');
        }

        // VIDEO-CENTRIC FIX: Try to find specific video card first
        let existingCard = null;
        if (detail.attemptId) {
            const virtualId = `${imageId}_${detail.attemptId}`;
            // Escape virtualId if needed
            let safeVirtualId = virtualId;
            if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
                safeVirtualId = CSS.escape(virtualId);
            }
            existingCard = state.cardContainer.querySelector(`.gvp-mg-card[data-card-id="${safeVirtualId}"]`);
        }

        // Fallback to image ID if specific card not found (legacy mode or image-level update)
        if (!existingCard) {
            existingCard = state.cardContainer.querySelector(`.gvp-mg-card[data-image-id="${selectorId}"]`);
        }
        const entry = this.stateManager.getMultiGenHistoryEntry(imageId, { clone: true });

        if (!entry) {
            return false;
        }

        // OPTIMIZATION: If card is missing, create and prepend it instead of failing (which triggers full re-render)
        if (!existingCard) {
            const newCard = this._buildMultiGenCard(entry);
            // Insert after the "empty" message if it exists, or at the top
            const emptyMsg = state.cardContainer.querySelector('.gvp-mg-empty');
            if (emptyMsg) {
                emptyMsg.remove();
            }

            if (state.cardContainer.firstChild) {
                state.cardContainer.insertBefore(newCard, state.cardContainer.firstChild);
            } else {
                state.cardContainer.appendChild(newCard);
            }
            return true;
        }

        // OPTIMIZATION: Update existing card in-place (fine-grained updates)
        // This avoids destroying the DOM node and rebuilding it, which is expensive

        // 1. Update status class if needed
        const hasPending = entry.attempts.some(attempt => attempt.status === 'pending');
        if (hasPending) {
            existingCard.classList.add('has-active');
        } else {
            existingCard.classList.remove('has-active');
        }

        // 2. Update progress text
        const progressText = existingCard.querySelector('.gvp-mg-progress-text');
        if (progressText) {
            const activeAttempt = entry.attempts.find(attempt => attempt.status === 'pending');

            // Recalculate timestamps
            const successAttempts = entry.attempts.filter(a => a.status === 'success');
            const latestSuccessTime = successAttempts.length > 0
                ? Math.max(...successAttempts.map(a => new Date(a.finishedAt || a.timestamp || 0).getTime()))
                : 0;

            const moderatedAttempts = entry.attempts.filter(a => a.status === 'moderated');
            const latestModeratedTime = moderatedAttempts.length > 0
                ? Math.max(...moderatedAttempts.map(a => new Date(a.finishedAt || a.timestamp || 0).getTime()))
                : 0;

            if (activeAttempt) {
                const activeProgressValue = this._getLatestAttemptProgress(activeAttempt);
                if (activeProgressValue != null) {
                    progressText.textContent = `${activeProgressValue}%`;
                } else {
                    progressText.textContent = 'starting...';
                }
            } else if (latestSuccessTime > 0) {
                progressText.textContent = `Last success ${this._formatRelativeTime(new Date(latestSuccessTime).toISOString())}`;
            } else if (latestModeratedTime > 0) {
                progressText.textContent = `Last moderated ${this._formatRelativeTime(new Date(latestModeratedTime).toISOString())}`;
                existingCard.classList.add('gvp-mg-card-moderated');
            } else {
                progressText.textContent = `Updated ${this._formatRelativeTime(entry.updatedAt || entry.createdAt)}`;
            }
        }

        // 3. Update progress bar width
        const progressBar = existingCard.querySelector('.gvp-mg-progress-fill');
        if (progressBar) {
            const activeAttempt = entry.attempts.find(attempt => attempt.status === 'pending');
            if (activeAttempt) {
                const activeProgressValue = this._getLatestAttemptProgress(activeAttempt) || 0;
                progressBar.style.width = `${activeProgressValue}%`;
            } else {
                progressBar.style.width = '0%';
            }
        }
        // 4. Update status of existing attempt elements
        const attemptsContainer = existingCard.querySelector('.gvp-mg-attempts');
        if (attemptsContainer) {
            entry.attempts.forEach(attempt => {
                const attemptEl = attemptsContainer.querySelector(`.gvp-mg-attempt-compact[data-attempt-id="${attempt.id}"]`);
                if (attemptEl) {
                    const statusBadge = attemptEl.querySelector('.gvp-mg-status-badge');
                    if (statusBadge) {
                        statusBadge.className = `gvp-mg-status-badge gvp-mg-status-${attempt.status || 'pending'}`;
                        statusBadge.textContent = (attempt.status || 'pending').toUpperCase();
                    }
                }
            });
        }

        return true;
    }







    _buildMultiGenAttempt(entry, attempt) {



        const attemptEl = document.createElement('section');



        attemptEl.className = 'gvp-mg-attempt-compact';



        attemptEl.dataset.attemptId = attempt.id;







        // Header row: Status badge + timestamp + delete button



        const header = document.createElement('div');



        header.className = 'gvp-mg-attempt-header-compact';







        const status = document.createElement('span');



        status.className = `gvp-mg-status-badge gvp-mg-status-${attempt.status || 'pending'}`;



        status.textContent = (attempt.status || 'pending').toUpperCase();



        header.appendChild(status);







        const timestamp = document.createElement('span');



        timestamp.className = 'gvp-mg-timestamp';



        timestamp.textContent = this._formatRelativeTime(attempt.startedAt || attempt.createdAt);



        header.appendChild(timestamp);







        const deleteBtn = document.createElement('button');



        deleteBtn.type = 'button';



        deleteBtn.className = 'gvp-mg-attempt-delete';



        deleteBtn.textContent = 'X';



        deleteBtn.title = 'Delete this attempt';



        deleteBtn.addEventListener('click', (event) => {



            event.stopPropagation();



            this.showConfirmToast(



                'Remove this generation attempt?',



                () => {



                    this.stateManager.deleteMultiGenAttempt(entry.imageId, attempt.id);



                    this.showToast('Attempt deleted', 'success', 2000);



                }



            );



        });



        header.appendChild(deleteBtn);







        // Button row: ALWAYS 3 buttons for alignment



        const actions = document.createElement('div');



        actions.className = 'gvp-mg-attempt-button-row';







        // Image button (🖼️)



        const imageBtn = document.createElement('button');



        imageBtn.type = 'button';



        imageBtn.className = 'gvp-mg-micro-btn';



        imageBtn.textContent = '🖼️';



        imageBtn.title = 'Open image';



        imageBtn.addEventListener('click', (e) => {



            e.stopPropagation();



            const url = `https://grok.com/imagine/post/${entry.imageId}`;



            try {



                window.location.assign(url);



            } catch (navigationError) {



                window.Logger.warn('UI', 'Navigation fallback to new tab', navigationError);



                window.open(url, '_self');



            }



        });



        actions.appendChild(imageBtn);







        // Prompt button (📝)



        const promptBtn = document.createElement('button');



        promptBtn.type = 'button';



        promptBtn.className = 'gvp-mg-micro-btn';



        promptBtn.textContent = '📝';



        promptBtn.title = 'View prompt';



        promptBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._openPromptViewer({ imageId: entry.imageId, attempts: [attempt] });
        });



        actions.appendChild(promptBtn);







        // Video button (🎥) - ALWAYS render for alignment, disable if no URL



        const videoBtn = document.createElement('button');



        videoBtn.type = 'button';



        videoBtn.className = 'gvp-mg-micro-btn';



        videoBtn.textContent = '🎥';



        if (attempt.videoUrl) {



            videoBtn.title = 'Open video';



            videoBtn.addEventListener('click', (e) => {



                e.stopPropagation();



                window.open(attempt.videoUrl, '_blank', 'noopener');



            });



        } else {



            videoBtn.title = 'No video available';



            videoBtn.disabled = true;



            videoBtn.classList.add('disabled');



        }



        actions.appendChild(videoBtn);







        // Progress bar (RED if moderated, GREEN if success) - FULL WIDTH



        const progressBar = document.createElement('div');



        progressBar.className = 'gvp-mg-attempt-progress-bar';







        const isModerated = attempt.status === 'moderated' || attempt.moderated;



        const isSuccess = attempt.status === 'success';







        if (isModerated) {



            progressBar.classList.add('moderated');



        } else if (isSuccess) {



            progressBar.classList.add('success');



        }







        const latestProgress = this._getLatestAttemptProgress(attempt);



        const progressValue = latestProgress != null ? latestProgress : (isSuccess ? 100 : 0);







        const barFill = document.createElement('div');



        barFill.className = 'gvp-mg-attempt-progress-fill';



        barFill.style.width = `${Math.min(progressValue, 100)}%`;



        progressBar.appendChild(barFill);







        attemptEl.appendChild(header);



        attemptEl.appendChild(actions);



        attemptEl.appendChild(progressBar);



        return attemptEl;



    }







    _getLatestAttemptProgress(attempt = {}) {



        if (!attempt) {



            return null;



        }



        const clampProgress = (value) => Math.max(0, Math.min(100, Number(value)));



        const progressEvents = Array.isArray(attempt.progressEvents) ? attempt.progressEvents : [];



        const isModerated = attempt.status === 'moderated' || attempt.moderated;



        if (isModerated) {



            let moderatedProgress = null;



            if (Number.isFinite(attempt.moderatedAtProgress)) {



                moderatedProgress = attempt.moderatedAtProgress;



            } else if (Number.isFinite(attempt.lastCleanProgress)) {



                moderatedProgress = attempt.lastCleanProgress;



            }



            if (moderatedProgress === null && progressEvents.length) {



                for (let i = progressEvents.length - 1; i >= 0; i -= 1) {



                    const evt = progressEvents[i];



                    if (evt && evt.moderated === false && Number.isFinite(evt.progress)) {



                        moderatedProgress = evt.progress;



                        break;



                    }



                }



            }



            if (moderatedProgress !== null && moderatedProgress !== undefined) {



                return clampProgress(moderatedProgress);



            }



        }



        if (progressEvents.length) {



            const lastEvent = progressEvents[progressEvents.length - 1];



            if (lastEvent && Number.isFinite(lastEvent.progress)) {



                return clampProgress(lastEvent.progress);



            }



        }



        if (Number.isFinite(attempt.currentProgress) && attempt.currentProgress > 0) {



            return clampProgress(attempt.currentProgress);



        }



        return null;



    }







    _formatRelativeTime(timestamp) {



        if (!timestamp) {



            return 'recently';



        }



        const ts = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp);



        if (!Number.isFinite(ts)) {



            return 'recently';



        }



        const diff = Date.now() - ts;



        return this.uiHelpers.formatTimeDiff(diff);



    }







    _openMultiGenPromptModal(entry, attempt) {



        this._ensureMultiGenPromptModal();



        const modal = this._multiGenPromptModal;



        if (!modal) {



            return;



        }







        const sections = [];



        if (attempt.prompt) {



            sections.push({ label: 'Initial Prompt', value: attempt.prompt });



        }



        if (attempt.videoPrompt && attempt.videoPrompt !== attempt.prompt) {



            sections.push({ label: 'Video Prompt', value: attempt.videoPrompt });



        }



        if (attempt.finalMessage) {



            sections.push({ label: 'Model Message', value: attempt.finalMessage });



        }



        const content = sections.length



            ? sections.map(section => `--- ${section.label} ---\n${section.value}`).join('\n\n')



            : '(No prompt captured)';







        modal.title.textContent = `Prompt · Image ${entry.imageId}`;



        modal.textarea.value = content;



        modal.info.textContent = `Attempt ${attempt.status || 'pending'} • Started ${this._formatRelativeTime(attempt.startedAt)}`;







        modal.modal.classList.add('visible');



    }







    _ensureMultiGenPromptModal() {



        if (this._multiGenPromptModal) {



            return;



        }



        const modal = document.createElement('div');



        modal.id = 'gvp-mg-prompt-modal';



        modal.className = 'gvp-mg-modal';







        const backdrop = document.createElement('div');



        backdrop.className = 'gvp-mg-modal-backdrop';







        const content = document.createElement('div');



        content.className = 'gvp-mg-modal-content';







        const header = document.createElement('div');



        header.className = 'gvp-mg-modal-header';



        const title = document.createElement('div');



        title.className = 'gvp-mg-modal-title';



        title.textContent = 'Prompt';



        const closeBtn = document.createElement('button');



        closeBtn.type = 'button';



        closeBtn.className = 'gvp-mg-modal-close';



        closeBtn.textContent = '×';



        closeBtn.addEventListener('click', () => this._closeMultiGenPromptModal());



        header.appendChild(title);



        header.appendChild(closeBtn);







        const info = document.createElement('div');



        info.className = 'gvp-mg-modal-info';







        const textarea = document.createElement('textarea');



        textarea.className = 'gvp-mg-modal-textarea';



        textarea.readOnly = true;







        const footer = document.createElement('div');



        footer.className = 'gvp-mg-modal-footer';



        const copyBtn = document.createElement('button');



        copyBtn.type = 'button';



        copyBtn.className = 'gvp-mg-button';



        copyBtn.textContent = 'Copy';



        copyBtn.addEventListener('click', async () => {



            try {



                await navigator.clipboard.writeText(textarea.value || '');



            } catch (error) {



                window.Logger.warn('UI', 'Clipboard copy failed', error);



            }



        });



        const closeBtnFooter = document.createElement('button');



        closeBtnFooter.type = 'button';



        closeBtnFooter.className = 'gvp-mg-button';



        closeBtnFooter.textContent = 'Close';



        closeBtnFooter.addEventListener('click', () => this._closeMultiGenPromptModal());







        footer.appendChild(copyBtn);



        footer.appendChild(closeBtnFooter);







        content.appendChild(header);



        content.appendChild(info);



        content.appendChild(textarea);



        content.appendChild(footer);







        modal.appendChild(backdrop);



        modal.appendChild(content);







        backdrop.addEventListener('click', () => this._closeMultiGenPromptModal());







        this.shadowRoot.appendChild(modal);



        this._multiGenPromptModal = {



            modal,



            title,



            textarea,



            info



        };



    }







    _closeMultiGenPromptModal() {



        if (this._multiGenPromptModal?.modal) {



            this._multiGenPromptModal.modal.classList.remove('visible');



        }



    }







    _openMultiGenImageModal(url, imageId) {



        if (!url) {



            return;



        }



        this._ensureMultiGenImageModal();



        const modal = this._multiGenImageModal;



        modal.img.src = url;



        modal.caption.textContent = imageId ? `Image ${imageId}` : 'Image preview';



        modal.modal.classList.add('visible');



    }







    _ensureMultiGenImageModal() {



        if (this._multiGenImageModal) {



            return;



        }



        const modal = document.createElement('div');



        modal.id = 'gvp-mg-image-modal';



        modal.className = 'gvp-mg-modal';







        const backdrop = document.createElement('div');



        backdrop.className = 'gvp-mg-modal-backdrop';







        const content = document.createElement('div');



        content.className = 'gvp-mg-image-content';







        const closeBtn = document.createElement('button');



        closeBtn.type = 'button';



        closeBtn.className = 'gvp-mg-modal-close';



        closeBtn.textContent = '×';



        closeBtn.addEventListener('click', () => this._closeMultiGenImageModal());







        const img = document.createElement('img');



        img.alt = 'Image preview';







        const caption = document.createElement('div');



        caption.className = 'gvp-mg-image-caption';







        content.appendChild(closeBtn);



        content.appendChild(img);



        content.appendChild(caption);







        modal.appendChild(backdrop);



        modal.appendChild(content);







        backdrop.addEventListener('click', () => this._closeMultiGenImageModal());







        this.shadowRoot.appendChild(modal);



        this._multiGenImageModal = {



            modal,



            img,



            caption



        };



    }







    _closeMultiGenImageModal() {



        if (this._multiGenImageModal?.modal) {



            this._multiGenImageModal.modal.classList.remove('visible');



        }



    }







    _processFetchedPostPayload(payload, meta = {}) {



        if (!this._historyFeatureEnabled) {



            return;



        }



        if (!this.uiHistoryManager) {



            return;



        }



        if (!payload || typeof payload !== 'object') {



            window.Logger.warn('UI', 'Invalid /post/get payload');



            return;



        }







        const post = this._extractPrimaryPost(payload);



        if (!post) {



            window.Logger.warn('UI', 'No post entity discovered in payload', meta);



            return;



        }







        const candidates = this._collectPromptCandidates(post);



        if (!candidates.length) {



            window.Logger.warn('UI', 'No prompt candidates found for post', meta);



            return;



        }







        const [latest] = candidates;



        const prompt = latest.prompt?.trim();



        if (!prompt) {



            window.Logger.warn('UI', 'Latest prompt candidate was empty');



            return;



        }







        const looksJson = prompt.startsWith('{') || prompt.startsWith('[');



        if (looksJson) {



            const success = this.updatePromptFromVideoPrompt(prompt);



            if (!success) {



                window.Logger.warn('UI', 'Parsed JSON prompt could not update state; falling back to raw view');



                this._applyRawPrompt(prompt);



            } else {



                this._recordHistoryPrompt(prompt, {



                    imageId: meta.imageId || null,



                    candidate: latest,



                    source: meta.source || 'manual-fetch'



                });



            }



        } else {



            window.Logger.info('UI', 'Skipping auto-fill of raw prompt for non-JSON payload.');



        }







        window.Logger.info('Main', '✅ Fetched latest prompt', {



            imageId: meta.imageId,



            timestamp: latest.timestamp,



            source: meta.source,



            isJson: looksJson



        });



    }







    _recordHistoryPrompt(prompt, { imageId = null, candidate = null, source = 'manual-fetch' } = {}) {



        if (!this._historyFeatureEnabled) {



            return;



        }



        if (!this.uiHistoryManager) {



            return;



        }



        if (!this.imageProjectManager || !prompt) {



            return;



        }







        const trimmed = typeof prompt === 'string' ? prompt.trim() : '';



        if (!trimmed) {



            return;



        }







        const resolvedCtx = this.imageProjectManager.ensureActiveContext({ imageId });



        const accountId = resolvedCtx?.accountId || this.imageProjectManager.getActiveAccount() || 'account:unknown';



        const resolvedImageId = resolvedCtx?.imageId || imageId;







        if (!resolvedImageId) {



            window.Logger.warn('UI', 'Unable to resolve imageId for history prompt recording');



            return;



        }







        const alreadyLogged = Array.isArray(this._promptHistoryCache)



            && this._promptHistoryCache.some(entry => entry && typeof entry.prompt === 'string' && entry.prompt.trim() === trimmed);



        if (alreadyLogged) {



            return;



        }







        const timestamp = candidate?.timestamp || Date.now();



        const node = candidate?.node || null;



        const inferredModel = candidate?.modelName



            || node?.modelName



            || node?.model



            || node?.model_name



            || node?.model_name



            || null;



        const inferredMode = candidate?.source



            || candidate?.mode



            || node?.mode



            || node?.modeLabel



            || node?.modeName



            || node?.modeType



            || null;







        try {



            this.imageProjectManager.setActiveAccount(accountId);



            this.imageProjectManager.registerImageProject(



                accountId,



                resolvedImageId,



                {



                    type: 'json',



                    prompt: trimmed,



                    modelName: inferredModel,



                    mode: inferredMode,



                    moderated: Boolean(candidate?.moderated || node?.moderated || node?.isModerated),



                    timestamp,



                    source,



                    videoId: node?.videoId || candidate?.videoId || null,



                    videoUrl: candidate?.videoUrl || node?.videoUrl || node?.mediaUrl || null,



                    assetId: candidate?.assetId || node?.assetId || node?.mediaAssetId || null,



                    imageReference: node?.imageReference || null



                }



            );



            this.refreshHistoryTab(true);



        } catch (error) {



            window.Logger.error('UI', 'Failed to record manual prompt into history:', error);



        }



    }







    async _fetchPostPayload(imageId) {



        try {



            const response = await fetch('/rest/media/post/get', {



                method: 'POST',



                headers: {



                    'Content-Type': 'application/json',



                    'Accept': 'application/json'



                },



                body: JSON.stringify({ id: imageId })



            });







            if (!response.ok) {



                throw new Error(`Fetch failed with status ${response.status}`);



            }







            return await response.json();



        } catch (error) {



            window.Logger.error('UI', 'Error fetching /post/get payload:', error);



            return null;



        }



    }







    _extractPrimaryPost(payload) {



        const direct = payload?.post



            || payload?.result?.post



            || payload?.data?.post



            || payload?.result?.data?.post



            || null;



        if (direct) {



            return direct;



        }







        if (Array.isArray(payload?.posts) && payload.posts.length) {



            return payload.posts[0];



        }







        return null;



    }







    _collectPromptCandidates(post) {



        const candidates = [];



        const includeNode = (node) => {



            if (!node || typeof node !== 'object') {



                return;



            }







            const promptValue = (node.originalPrompt ?? node.videoPrompt ?? node.prompt ?? '').trim();



            if (!promptValue) {



                return;



            }







            const timestamp = this._normalizeTimestamp(



                node.createTime ||



                node.completedAt ||



                node.finishedAt ||



                node.updatedAt ||



                node.lastUpdated ||



                node.timestamp



            );







            candidates.push({



                prompt: promptValue,



                timestamp: timestamp || Date.now(),



                node,



                isJson: promptValue.startsWith('{') || promptValue.startsWith('['),



                moderated: Boolean(node?.moderated || node?.isModerated),



                source: node?.mode || node?.modeLabel || node?.modeName || node?.modeType || null



            });



        };







        includeNode(post);



        if (Array.isArray(post.childPosts)) {



            post.childPosts.forEach(includeNode);



        }







        return candidates



            .filter(entry => entry && typeof entry.prompt === 'string' && entry.prompt.trim().length)



            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));



    }







    _normalizeTimestamp(value) {



        if (!value) return null;



        if (typeof value === 'number') return value;



        const parsed = Date.parse(value);



        return Number.isNaN(parsed) ? null : parsed;



    }







    applyRawPrompt(rawPrompt) {



        this._applyRawPrompt(rawPrompt);



    }







    showSavedPromptModal(details, callbacks) {



        if (this.uiModalManager && typeof this.uiModalManager.showSavedPromptModal === 'function') {



            this.uiModalManager.showSavedPromptModal(details, callbacks);



        }



    }







    _applyRawPrompt(rawPrompt) {



        const trimmed = typeof rawPrompt === 'string' ? rawPrompt.trim() : '';



        if (!trimmed) {



            return;



        }







        if (this.uiRawInputManager && typeof this.uiRawInputManager.loadRecentPrompt === 'function') {



            this.uiRawInputManager.loadRecentPrompt(trimmed);



        }







        if (this.advancedRawInputManager && typeof this.advancedRawInputManager.addRecentPrompt === 'function') {



            this.advancedRawInputManager.addRecentPrompt(trimmed);



        }







        const state = this.stateManager.getState();



        state.generation.lastPrompt = trimmed;



        // DEBUG: Trace raw prompt application\n        window.Logger.info('UI', 'Applied raw prompt to editor');



    }







    _deleteMultiGenImage(imageId) {



        this.showConfirmToast(



            'Delete this image and all attempts?',



            () => {



                if (typeof this.stateManager?.deleteMultiGenImage === 'function') {



                    this.stateManager.deleteMultiGenImage(imageId);



                    this.showToast('Image deleted', 'success', 2000);



                } else {



                    window.Logger.error('UI', 'deleteMultiGenImage method not found on StateManager');



                    this.showToast('Delete failed', 'error', 3000);



                }



            }



        );



    }







    applyPromptFromHistory(indexOrImageId) {
        const applyPromptString = (prompt, meta = {}) => {
            const trimmed = typeof prompt === 'string' ? prompt.trim() : '';
            if (!trimmed) {
                window.Logger.warn('UI', 'Prompt history entry missing prompt text', meta);
                return;
            }
            const looksJson = meta.isJson || trimmed.startsWith('{') || trimmed.startsWith('[');
            if (looksJson) {
                const success = this.updatePromptFromVideoPrompt(trimmed);
                if (!success) {
                    window.Logger.warn('UI', 'Failed applying JSON prompt from history; falling back to raw', meta);
                    this._applyRawPrompt(trimmed);
                }
            } else {
                this._applyRawPrompt(trimmed);
            }
            window.Logger.info('UI', 'Applied prompt from history', meta);
        };

        if (typeof indexOrImageId === 'string') {
            const entry = this.stateManager?.getMultiGenHistoryEntry?.(indexOrImageId, { clone: true });
            if (!entry) {
                window.Logger.warn('UI', 'Prompt history entry not found for imageId', indexOrImageId);
                return;
            }
            const attempts = Array.isArray(entry.attempts) ? entry.attempts : [];
            const attemptWithPrompt = attempts.find(a => a && a.prompt) || attempts.find(a => a && a.videoPrompt);
            const prompt = attemptWithPrompt?.prompt || attemptWithPrompt?.videoPrompt;
            applyPromptString(prompt, { imageId: indexOrImageId, attemptId: attemptWithPrompt?.id, isJson: attemptWithPrompt?.isJson });
            return;
        }

        if (typeof indexOrImageId !== 'number' || indexOrImageId < 0 || indexOrImageId >= this._promptHistoryCache.length) {
            window.Logger.warn('UI', 'Prompt history index out of range:', indexOrImageId);
            return;
        }

        const entry = this._promptHistoryCache[indexOrImageId];
        if (!entry || !entry.prompt) {
            window.Logger.warn('UI', 'Prompt history entry missing prompt at index', indexOrImageId);
            return;
        }

        applyPromptString(entry.prompt, { index: indexOrImageId, isJson: entry.isJson });
    }

    _selectBestAttemptForPrompt(entry = {}) {
        const attempts = Array.isArray(entry.attempts) ? entry.attempts : [];
        const byStatus = (status) => attempts.find(a => a && a.status === status && (a.prompt || a.videoPrompt));
        return (
            byStatus('success') ||
            byStatus('moderated') ||
            attempts.find(a => a && (a.prompt || a.videoPrompt)) ||
            attempts[0] ||
            null
        );
    }

    _openPromptViewer(entry) {
        if (!entry) return;
        const attempt = this._selectBestAttemptForPrompt(entry);
        const promptText = attempt?.prompt || attempt?.videoPrompt || 'No prompt available for this attempt.';
        const statusLabel = attempt?.status || 'pending';
        const videoUrl = attempt?.videoUrl || null;
        const imageUrl = entry?.imageId ? `https://grok.com/imagine/post/${entry.imageId}` : null;

        const existing = this.shadowRoot.querySelector('#gvp-prompt-viewer');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'gvp-prompt-viewer';
        Object.assign(overlay.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(0,0,0,0.8)',
            zIndex: '10050',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            background: 'var(--gvp-bg-deep)',
            border: '1px solid var(--gvp-border)',
            borderRadius: '10px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
            maxWidth: '720px',
            width: '100%',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column'
        });

        const header = document.createElement('div');
        Object.assign(header.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid var(--gvp-bg-tertiary)'
        });

        const title = document.createElement('div');
        Object.assign(title.style, {
            color: 'var(--gvp-text-primary)',
            fontSize: '14px',
            fontWeight: '700'
        });
        title.textContent = `Prompt • ${statusLabel.toUpperCase()}`;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        Object.assign(closeBtn.style, {
            background: 'transparent',
            color: 'var(--gvp-text-secondary)',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer'
        });
        closeBtn.addEventListener('click', () => overlay.remove());

        header.appendChild(title);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        Object.assign(body.style, {
            padding: '14px 16px',
            overflowY: 'auto',
            flex: '1',
            whiteSpace: 'pre-wrap',
            color: 'var(--gvp-text-primary)',
            fontSize: '12px'
        });
        body.textContent = promptText;

        const footer = document.createElement('div');
        Object.assign(footer.style, {
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            padding: '12px 16px',
            borderTop: '1px solid var(--gvp-bg-tertiary)'
        });

        const makeBtn = (label, handler, disabled = false) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            Object.assign(btn.style, {
                background: 'var(--gvp-bg-secondary)',
                color: 'var(--gvp-text-primary)',
                border: '1px solid var(--gvp-border)',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '12px',
                cursor: disabled ? 'not-allowed' : 'pointer'
            });
            btn.disabled = disabled;
            if (!disabled) {
                btn.addEventListener('click', handler);
            }
            return btn;
        };

        const copyBtn = makeBtn('Copy prompt', async () => {
            try {
                await navigator.clipboard.writeText(promptText);
                this.uiHelpers?.showToast?.('Prompt copied', 'success', 2000);
            } catch (err) {
                window.Logger.warn('UI', 'Failed to copy prompt', err);
            }
        });

        const sendToRawBtn = makeBtn('Send to RAW tab', () => {
            this._applyRawPrompt(promptText);
            this._selectTab?.('raw');
            this.uiHelpers?.showToast?.('Prompt sent to RAW tab', 'success', 2000);
        }, !promptText || promptText === 'No prompt available for this attempt.');

        const openVideoBtn = makeBtn('Open video', () => {
            window.open(videoUrl, '_blank', 'noopener');
        }, !videoUrl);

        const openImageBtn = makeBtn('Open image page', () => {
            window.open(imageUrl, '_blank', 'noopener');
        }, !imageUrl);

        footer.append(copyBtn, sendToRawBtn, openVideoBtn, openImageBtn);

        modal.append(header, body, footer);
        overlay.appendChild(modal);

        overlay.addEventListener('click', (evt) => {
            if (evt.target === overlay) {
                overlay.remove();
            }
        });

        this.shadowRoot.appendChild(overlay);
    }

    _resolveActiveImageId() {



        const pathname = window.location?.pathname || '';



        const pathMatch = pathname.match(/\/imagine\/post\/([^\/?#]+)/i);



        if (pathMatch && pathMatch[1]) {



            this._lastResolvedImageId = pathMatch[1];



            if (this.imageProjectManager) {



                this.imageProjectManager.ensureActiveContext({ imageId: pathMatch[1] });



            }



            return pathMatch[1];



        }







        const activeTile = document.querySelector('[data-post-id].is-active, [data-post-id][aria-current="page"]');



        if (activeTile && activeTile.getAttribute('data-post-id')) {



            const tileId = activeTile.getAttribute('data-post-id');



            this._lastResolvedImageId = tileId;



            if (this.imageProjectManager) {



                this.imageProjectManager.ensureActiveContext({ imageId: tileId });



            }



            return tileId;



        }







        const openLink = document.querySelector('a[href*="/imagine/post/"][aria-current="page"]');



        if (openLink) {



            const hrefMatch = openLink.href.match(/\/imagine\/post\/([^\/?#]+)/i);



            if (hrefMatch && hrefMatch[1]) {



                this._lastResolvedImageId = hrefMatch[1];



                if (this.imageProjectManager) {



                    this.imageProjectManager.ensureActiveContext({ imageId: hrefMatch[1] });



                }



                return hrefMatch[1];



            }



        }







        if (this._lastResolvedImageId) {



            if (this.imageProjectManager) {



                this.imageProjectManager.ensureActiveContext({ imageId: this._lastResolvedImageId });



            }



            return this._lastResolvedImageId;



        }







        if (this.imageProjectManager) {



            const { imageId } = this.imageProjectManager.ensureActiveContext();



            if (imageId) {



                this._lastResolvedImageId = imageId;



                return imageId;



            }



        }







        return null;



    }



    _syncUpscaleButton(active) {
        if (!this.launcherUpscaleBtn) return;
        if (active) {
            this.launcherUpscaleBtn.classList.add('active');
            this.launcherUpscaleBtn.setAttribute('aria-pressed', 'true');
        } else {
            this.launcherUpscaleBtn.classList.remove('active');
            this.launcherUpscaleBtn.setAttribute('aria-pressed', 'false');
        }
    }
};



