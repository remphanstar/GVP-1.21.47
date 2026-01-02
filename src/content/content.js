// src/content/content.js - Grok Video Prompter Extension
// Main entry point - initializes the application


(function () {
    'use strict';

    const APP_VERSION = chrome.runtime.getManifest().version;
    window.GVP_APP_VERSION = APP_VERSION;

    // Storage helper for Chrome extension
    const StorageHelper = {
        async setData(key, value) {
            return new Promise((resolve) => {
                chrome.storage.local.set({ [key]: value }, resolve);
            });
        },
        async getData(key) {
            return new Promise((resolve) => {
                chrome.storage.local.get([key], (result) => {
                    resolve(result[key]);
                });
            });
        },
        async setSettings(settings) {
            return new Promise((resolve) => {
                chrome.storage.local.set({ 'gvp-settings': settings }, resolve);
            });
        },
        async getSettings() {
            return new Promise((resolve) => {
                chrome.storage.local.get(['gvp-settings'], (result) => {
                    resolve(result['gvp-settings'] || {});
                });
            });
        }
    };

    class QuickLaunchManager {
        constructor(stateManager, uiManager, reactAutomation) {
            this.stateManager = stateManager;
            this.uiManager = uiManager;
            this.reactAutomation = reactAutomation;
            this.storageKey = 'gvp-quick-launch-request';
            this._favoritesListenerAttached = false;
            this._imagePostListenerAttached = false;  // NEW: for Quick Video from Edit
            this._isProcessing = false;
            this._initialized = false;
            this._navObserverInstalled = false;
            this._navMonitorTimer = null;
            this._resumeTimers = [];
            this._isRailNavigation = false; // v1.21.xx: rail navigation guard
            this._favoritesClickHandler = this._handleFavoritesClick.bind(this);
            this._editedImageClickHandler = this._handleEditedImageClick.bind(this);  // NEW
            this._modeChangeHandler = this._handleQuickModeChange.bind(this);
            this._suppressionHandler = (event) => {
                const active = !!event?.detail?.active;
                this._quickLaunchSuppressed = active;
                if (active) {
                    if (window.Logger.isDebugEnabled()) {
                        window.Logger.debug('QuickLaunch', 'Suppressed via event -> clearing payload');
                    }
                    this._clearPendingPayload('suppressed-event');
                }
            };
            // v1.21.36: derive _debugQuickLaunch from central Logger
            this._debugQuickLaunch = window.Logger.isDebugEnabled();
        }

        setUIManager(uiManager) {
            this.uiManager = uiManager;
        }

        initialize() {
            window.Logger.debug('QuickLaunch', 'initialize() called');
            if (this._initialized) {
                window.Logger.debug('QuickLaunch', 'Already initialized, re-attaching listeners');
                this._attachFavoritesListener();
                this._attachImagePostListener();  // NEW: for Quick Video from Edit
                this._ensureQuickControls();
                this._maybeResumePendingLaunch();
                this._installNavigationObserver();
                return;
            }
            this._initialized = true;
            window.Logger.debug('QuickLaunch', 'Performing first-time initialization');
            document.addEventListener('gvp:quick-launch-mode-changed', this._modeChangeHandler);
            document.addEventListener('gvp:quick-launch-suppressed', this._suppressionHandler);
            // v1.21.xx: Rail navigation guard - temporarily block Quick Raw when rail item is clicked
            document.addEventListener('gvp:rail-navigation', (event) => {
                this._isRailNavigation = true;
                window.Logger.debug('QuickLaunch', '🚂 Rail navigation detected, blocking Quick Raw', event?.detail);
                // Reset after navigation completes
                setTimeout(() => {
                    this._isRailNavigation = false;
                }, 500);
            });
            // NEW: Listen for Quick Video from Edit toggle
            window.addEventListener('gvp:quick-video-from-edit-changed', (event) => {
                window.Logger.debug('Quick Video', '🎥 EVENT RECEIVED: gvp:quick-video-from-edit-changed', event?.detail);
                this._attachImagePostListener();
            });
            this._attachFavoritesListener();
            this._attachImagePostListener();  // NEW
            this._ensureQuickControls();
            this._maybeResumePendingLaunch();
            this._installNavigationObserver();
        }

        _handleQuickModeChange() {
            this._attachFavoritesListener();
            if (!this._getActiveMode()) {
                if (window.Logger.isDebugEnabled()) {
                    window.Logger.debug('QuickLaunch', 'Mode switched off → clearing pending payload');
                }
                this._clearPendingPayload();
            }
            this._ensureQuickControls();
            this._syncQuickButtons();
            if (window.Logger.isDebugEnabled()) {
                window.Logger.debug('QuickLaunch', 'Mode change handled; current mode =', this._getActiveMode() ?? 'off');
            }
        }

        _installNavigationObserver() {
            if (this._navObserverInstalled) {
                return;
            }

            const notify = (trigger = 'unknown') => {
                if (window.Logger.isDebugEnabled()) {
                    window.Logger.debug('QuickLaunch', 'Navigation observer notified via', trigger, '→', window.location.pathname);
                }
                this._attachFavoritesListener();
                this._attachImagePostListener();  // NEW: Quick Video from Edit
                window.requestAnimationFrame(() => this._maybeResumePendingLaunch());
            };

            try {
                const originalPushState = window.history.pushState;
                window.history.pushState = function pushStateWrapper(...args) {
                    const result = originalPushState.apply(this, args);
                    notify('pushState');
                    return result;
                };

                const originalReplaceState = window.history.replaceState;
                window.history.replaceState = function replaceStateWrapper(...args) {
                    const result = originalReplaceState.apply(this, args);
                    notify('replaceState');
                    return result;
                };

                window.addEventListener('popstate', () => notify('popstate'), true);
                this._navObserverInstalled = true;
                window.Logger.debug('QuickLaunch', 'Navigation observer installed');
            } catch (error) {
                window.Logger.error('QuickLaunch', 'Failed to install navigation observer:', error);
            }
            this._startNavigationMonitor();
        }

        _startNavigationMonitor() {
            if (this._navMonitorTimer) {
                return;
            }

            let lastPath = window.location.pathname;
            this._navMonitorTimer = window.setInterval(() => {
                const currentPath = window.location.pathname;
                if (currentPath !== lastPath) {
                    lastPath = currentPath;
                    if (window.Logger.isDebugEnabled()) {
                        window.Logger.debug('QuickLaunch', 'Navigation monitor detected new path', currentPath);
                    }
                    this._attachFavoritesListener();
                    window.requestAnimationFrame(() => this._maybeResumePendingLaunch());
                }
            }, 150);

            if (window.Logger.isDebugEnabled()) {
                window.Logger.debug('QuickLaunch', 'Navigation monitor started (150ms interval)');
            }
        }

        _stopNavigationMonitor() {
            if (this._navMonitorTimer) {
                window.clearInterval(this._navMonitorTimer);
                this._navMonitorTimer = null;
                if (window.Logger.isDebugEnabled()) {
                    window.Logger.debug('QuickLaunch', 'Navigation monitor stopped');
                }
            }
        }

        _scheduleNavigationFallback(favoriteTarget) {
            if (!favoriteTarget) {
                return;
            }

            const startHref = window.location.href;
            if (window.Logger.isDebugEnabled()) {
                window.Logger.debug('QuickLaunch', 'Scheduling navigation fallback', {
                    from: startHref,
                    favoriteHref: favoriteTarget.href,
                    favoritePath: favoriteTarget.path
                });
            }
            window.setTimeout(() => {
                if (window.location.href !== startHref) {
                    if (window.Logger.isDebugEnabled()) {
                        window.Logger.debug('QuickLaunch', 'Navigation fallback skipped; page already navigated', {
                            from: startHref,
                            to: window.location.href
                        });
                    }
                    window.requestAnimationFrame(() => this._maybeResumePendingLaunch());
                    return;
                }

                if (window.Logger.isDebugEnabled()) {
                    window.Logger.debug('QuickLaunch', 'Navigation fallback engaged — forcing route to favorite target', {
                        href: favoriteTarget.href,
                        path: favoriteTarget.path
                    });
                }
                const navigated = this._navigateToFavoriteTarget(favoriteTarget);
                if (!navigated && window.Logger.isDebugEnabled()) {
                    window.Logger.warn('QuickLaunch', 'Unable to auto-navigate to favorite target; manual action may be required', favoriteTarget);
                }
            }, 80);
        }

        _navigateToFavoriteTarget(favoriteTarget) {
            const attempt = (value) => {
                if (!value) {
                    return false;
                }
                try {
                    // Parse to get clean path for snap navigation
                    let targetPath;
                    if (value.includes('://')) {
                        const parsed = new URL(value);
                        targetPath = parsed.pathname;
                    } else if (value.startsWith('/')) {
                        targetPath = value;
                    } else {
                        targetPath = new URL(value, window.location.origin).pathname;
                    }

                    if (window.location.pathname === targetPath) {
                        if (window.Logger.isDebugEnabled()) {
                            window.Logger.debug('QuickLaunch', 'Navigation fallback found target already active', targetPath);
                        }
                        return true;
                    }

                    // God Mode Snap - instant navigation without full page reload
                    try {
                        window.history.pushState({}, '', targetPath);
                        window.dispatchEvent(new PopStateEvent('popstate'));
                        window.Logger.info('QuickLaunch', '⚡ Snap navigation to:', targetPath);
                        return true;
                    } catch (snapError) {
                        // Fallback to full navigation if pushState fails
                        window.Logger.warn('QuickLaunch', 'Snap failed, using location.assign', snapError);
                        window.location.assign(value.includes('://') ? value : `${window.location.origin}${targetPath}`);
                        return true;
                    }
                } catch (_) {
                    return false;
                }
            };

            if (attempt(favoriteTarget.href)) {
                return true;
            }
            if (attempt(favoriteTarget.path)) {
                return true;
            }

            if (favoriteTarget.element && typeof favoriteTarget.element.closest === 'function') {
                const anchor = favoriteTarget.element.closest('a[href], button[data-navigation-target], button[data-href]');
                if (anchor) {
                    if (attempt(anchor.getAttribute('href') || anchor.getAttribute('data-href') || anchor.getAttribute('data-navigation-target'))) {
                        return true;
                    }
                }
            }

            return false;
        }

        _isFavoritesPage() {
            try {
                const path = window.location.pathname;
                // Expanded Automation: Allow Quick Launch on both favorites and main imagine feed
                return path.startsWith('/imagine/favorites') || path === '/imagine' || path === '/imagine/';
            } catch (error) {
                window.Logger.error('QuickLaunch', 'Failed to determine favorites/gallery page:', error);
                return false;
            }
        }

        _attachFavoritesListener() {
            if (!this._isFavoritesPage()) {
                if (this._favoritesListenerAttached) {
                    document.removeEventListener('click', this._favoritesClickHandler, true);
                    this._favoritesListenerAttached = false;
                    if (window.Logger.isDebugEnabled()) {
                        window.Logger.debug('QuickLaunch', 'Favorites listener removed (left favorites page)');
                    }
                }
                return;
            }
            if (!this._favoritesListenerAttached) {
                document.addEventListener('click', this._favoritesClickHandler, true);
                this._favoritesListenerAttached = true;
                window.Logger.debug('QuickLaunch', 'Favorites listener attached for gallery automation');
            }
        }

        // ==================== Quick Video from Edit ====================

        /**
         * Check if we're on an image post page (where edited images are displayed)
         * URL pattern: /imagine/post/{imageId} (UUID only, not containing -image-edit-)
         */
        _isImagePostPage() {
            try {
                const path = window.location.pathname;
                // Must be on /imagine/post/ but NOT on an edited image page
                const result = path.startsWith('/imagine/post/') && !path.includes('-image-edit-');
                window.Logger.debug('Quick Video', '_isImagePostPage:', result, 'path:', path);
                return result;
            } catch (error) {
                window.Logger.error('QuickLaunch', 'Failed to determine image post page:', error);
                return false;
            }
        }

        /**
         * Get Quick Video from Edit state from UIManager or StateManager
         */
        _getQuickVideoFromEdit() {
            try {
                const state = this.stateManager?.getState?.();
                const result = !!state?.ui?.quickVideoFromEdit;
                window.Logger.debug('Quick Video', '_getQuickVideoFromEdit:', result);
                return result;
            } catch (error) {
                window.Logger.error('Quick Video', 'Error getting state:', error);
                return false;
            }
        }

        /**
         * Attach/detach click listener for image post pages (Quick Video from Edit)
         */
        _attachImagePostListener() {
            const isPostPage = this._isImagePostPage();
            const isToggleOn = this._getQuickVideoFromEdit();
            const shouldListen = isPostPage && isToggleOn;

            window.Logger.debug('Quick Video', '_attachImagePostListener:', {
                isPostPage,
                isToggleOn,
                shouldListen,
                currentlyAttached: this._imagePostListenerAttached
            });

            if (!shouldListen) {
                if (this._imagePostListenerAttached) {
                    document.removeEventListener('click', this._editedImageClickHandler, true);
                    this._imagePostListenerAttached = false;
                    window.Logger.debug('Quick Video', 'Listener REMOVED');
                }
                return;
            }

            if (!this._imagePostListenerAttached) {
                document.addEventListener('click', this._editedImageClickHandler, true);
                this._imagePostListenerAttached = true;
                window.Logger.debug('Quick Video', '🎥 Listener ATTACHED for edited image clicks');
            }
        }

        /**
         * Handle clicks on edited image thumbnails when Quick Video from Edit is enabled
         */
        _handleEditedImageClick(event) {
            window.Logger.debug('Quick Video', '🖱️ _handleEditedImageClick TRIGGERED', {
                target: event?.target?.tagName,
                targetClass: event?.target?.className,
                button: event?.button
            });

            if (!event || event.defaultPrevented) {
                window.Logger.debug('Quick Video', '❌ Early exit: no event or defaultPrevented');
                return;
            }
            if (event.button !== 0) {
                window.Logger.debug('Quick Video', '❌ Early exit: not left click');
                return;
            }
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                window.Logger.debug('Quick Video', '❌ Early exit: modifier key pressed');
                return;
            }

            // Ignore clicks inside our own UI
            const root = this.uiManager?.shadowRoot;
            if (root && root.contains(event.target)) {
                window.Logger.debug('QuickLaunch', '❌ Early exit: click inside shadow DOM');
                return;
            }

            // Only proceed if Quick Video from Edit is enabled
            if (!this._getQuickVideoFromEdit()) {
                window.Logger.debug('QuickLaunch', '❌ Early exit: toggle not enabled', { enabled: this._getQuickVideoFromEdit() });
                return;
            }

            // Grok uses React navigation - the -image-edit- URL is NOT in the DOM,
            // it's constructed when clicked. We detect edited image thumbnails by their src pattern.
            // Edited images have src like: https://assets.grok.com/.../generated/{uuid}/image.jpg

            // Find the clicked image
            let img = event.target.tagName === 'IMG' ? event.target : null;
            if (!img) {
                // Check if we clicked on a container that has an IMG child
                const container = event.target.closest('.group\\/media-post-masonry-card, [class*="masonry"]');
                if (container) {
                    img = container.querySelector('img');
                }
            }

            if (!img?.src) {
                window.Logger.debug('QuickLaunch', '❌ No image found in click target');
                return;
            }

            window.Logger.info('QuickLaunch', '📷 Clicked image src:', img.src);

            // Check if this is an edited image (has /generated/ in the src path)
            if (!img.src.includes('/generated/')) {
                window.Logger.debug('QuickLaunch', '❌ Not an edited image (no /generated/ in src)');
                return;
            }

            window.Logger.info('QuickLaunch', '✅ Detected edited image click!');

            // Build the RAW prompt now (before navigation changes the page)
            const prompt = this._buildPrompt('raw');
            window.Logger.debug('QuickLaunch', 'RAW prompt:', prompt ? `${prompt.length} chars` : 'null');

            if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
                window.Logger.warn('QuickLaunch', '❌ No RAW prompt available');
                return;
            }

            // Store payload for resumption - navigation will happen via React, 
            // and _maybeResumePendingLaunch will pick this up on the target page
            const sourceUrl = window.location.href;  // Original image page to return to
            const payload = {
                id: `quick-video-edit-${Date.now()}`,
                mode: 'raw',  // Always use RAW mode for Quick Video from Edit
                isRaw: true,
                prompt: prompt,
                spicy: !!(this.stateManager?.getState?.()?.generation?.useSpicy),
                sourceUrl: sourceUrl,  // Return here after video generation
                targetPath: null,  // Will be determined after navigation
                pendingVideoFromEdit: true,  // Flag to indicate this is Quick Video from Edit
                timestamp: Date.now()
            };

            window.Logger.info('QuickLaunch', '📦 Storing payload (waiting for navigation):', {
                sourceUrl,
                promptLength: prompt.length
            });

            try {
                window.sessionStorage.setItem(this.storageKey, JSON.stringify(payload));
                window.Logger.info('QuickLaunch', '✅ Payload stored, waiting for navigation...');
            } catch (error) {
                window.Logger.error('QuickLaunch', 'Failed to store payload', error);
                return;
            }

            // Don't prevent default - let React navigate naturally
            // The navigation observer and _maybeResumePendingLaunch will handle the rest
            this._queueResumeProbes();
        }

        /**
         * Simulate Escape key press to navigate back without page refresh.
         * This preserves extension state and allows background operations to continue.
         */
        _simulateEscape() {
            try {
                ['keydown', 'keyup'].forEach(type => {
                    const evt = new KeyboardEvent(type, {
                        key: 'Escape',
                        code: 'Escape',
                        keyCode: 27,
                        which: 27,
                        bubbles: true,
                        cancelable: true
                    });
                    document.dispatchEvent(evt);
                });
                window.Logger.info('QuickLaunch', '⎋ Sent Escape key to navigate back');
                return true;
            } catch (error) {
                window.Logger.warn('QuickLaunch', 'Failed to dispatch Escape key', error);
                return false;
            }
        }

        // ==================== End Quick Video from Edit ====================

        _handleFavoritesClick(event) {
            if (!event || event.defaultPrevented) {
                return;
            }
            if (event.button !== 0) {
                return;
            }
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                return;
            }
            // v1.21.xx: Rail navigation guard - ignore clicks during rail navigation
            if (this._isRailNavigation) {
                window.Logger.debug('QuickLaunch', 'Click ignored - rail navigation in progress');
                return;
            }

            const composedPath = typeof event.composedPath === 'function' ? event.composedPath() : null;

            const root = this.uiManager?.shadowRoot;
            if (root) {
                if (Array.isArray(composedPath) && composedPath.includes(root)) {
                    window.Logger.debug('QuickLaunch', 'Click ignored - originated inside GVP UI');
                    return;
                }
                if (root.contains(event.target)) {
                    window.Logger.debug('QuickLaunch', 'Click ignored - target within GVP UI');
                    return;
                }
            }

            if (!this._isFavoritesPage()) {
                window.Logger.debug('QuickLaunch', 'Click ignored - not on favorites gallery');
                return;
            }

            if (Array.isArray(composedPath)) {
                const radixMenuHit = composedPath.some(node => {
                    if (!node || typeof node !== 'object') {
                        return false;
                    }
                    const id = node.id || '';
                    if (typeof id === 'string' && id.startsWith('radix-')) {
                        return true;
                    }
                    if (node.getAttribute && typeof node.getAttribute === 'function') {
                        const radixAttr = node.getAttribute('data-radix-popper-content')
                            || node.getAttribute('data-radix-menu');
                        if (radixAttr !== null) {
                            return true;
                        }
                    }
                    return false;
                });
                if (radixMenuHit) {
                    window.Logger.debug('QuickLaunch', 'Click ignored - inside Radix dropdown');
                    return;
                }
            }

            const makeVideoButton = event.target.closest('button[aria-label="Make video"], button[aria-label="Make a video"], button[data-testid*="make-video"], button[data-testid*="video-generator-submit"], div[data-testid*="quick-launch-overlay"] button');
            if (makeVideoButton) {
                window.Logger.debug('QuickLaunch', 'Click ignored - detected favorites overlay Make Video button');
                return;
            }

            // FIX v1.21.43: Ignore clicks on Remove buttons (used by Upload Mode to clear moderated cards)
            const removeButton = event.target.closest('button[aria-label="Remove"]');
            if (removeButton) {
                window.Logger.debug('QuickLaunch', 'Click ignored - Remove button (Upload Mode card clearing)');
                return;
            }

            window.Logger.debug('QuickLaunch', 'About to call _resolveFavoriteTarget', { target: event.target?.tagName, path: window.location.pathname });
            const favoriteTarget = this._resolveFavoriteTarget(event, composedPath);
            window.Logger.debug('QuickLaunch', '_resolveFavoriteTarget returned', favoriteTarget);

            if (!favoriteTarget) {
                window.Logger.debug('QuickLaunch', 'Click ignored - no favorite target detected', {
                    target: event.target,
                    path: typeof event.composedPath === 'function' ? event.composedPath() : 'no-path'
                });
                return;
            }

            const mode = this._getActiveMode();
            if (!mode) {
                window.Logger.debug('QuickLaunch', 'Click on favorite ignored because quick mode is off');
                return;
            }

            if (this._isSuppressed()) {
                window.Logger.debug('QuickLaunch', 'Click ignored - quick launch currently suppressed');
                return;
            }

            window.Logger.debug('QuickLaunch', 'Favorite clicked → preparing payload for mode', mode, {
                href: favoriteTarget.href,
                path: favoriteTarget.path
            });

            const prompt = this._buildPrompt(mode);

            window.Logger.debug('QuickLaunch', 'Built prompt for mode', mode, 'length:', typeof prompt === 'string' ? prompt.length : 'n/a');

            const state = this.stateManager?.getState?.();
            const targetHref = favoriteTarget.href;
            const target = targetHref ? new URL(targetHref, window.location.href) : null;
            const fallbackPath = favoriteTarget.path || null;
            const payload = {
                id: `quick-${Date.now()}`,
                mode,
                isRaw: mode === 'raw',
                prompt: typeof prompt === 'string' ? prompt : '',
                spicy: !!(state?.generation?.useSpicy),
                sourceUrl: window.location.href,
                targetPath: target?.pathname || fallbackPath,
                imageId: this._extractImageId(targetHref || fallbackPath),
                timestamp: Date.now()
            };

            try {
                window.sessionStorage.setItem(this.storageKey, JSON.stringify(payload));
                window.Logger.info('QuickLaunch', 'Queued quick-launch payload for', payload.imageId || payload.targetPath || '[unknown-target]');
            } catch (error) {
                window.Logger.error('QuickLaunch', 'Failed to persist quick-launch payload', error);
            }

            window.Logger.debug('QuickLaunch', 'Payload stored, scheduling navigation fallback', payload);
            this._scheduleNavigationFallback(favoriteTarget);
            this._queueResumeProbes();
        }

        _resolveFavoriteTarget(event) {
            const log = (level, ...args) => {
                const method = level === 'log' ? 'debug' : level;
                if (window.Logger && typeof window.Logger[method] === 'function') {
                    window.Logger[method]('QuickLaunch', 'Target scan:', ...args);
                }
            };

            const candidateAttributes = ['href', 'data-href', 'data-navigation-target'];
            const idAttributes = [
                'data-id',
                'data-media-id',
                'data-media-post-id',
                'data-post-id',
                'data-asset-id',
                'data-item-id',
                'data-guid',
                'data-uuid'
            ];
            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const embeddedUuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

            const ensurePostPath = (value) => {
                if (!value) {
                    return null;
                }
                const trimmed = `${value}`.trim();
                if (!trimmed) {
                    return null;
                }
                if (trimmed.includes('/imagine/post/')) {
                    const match = trimmed.match(/\/imagine\/post\/[0-9a-z\-]+/i);
                    if (match && !trimmed.startsWith('/imagine/post/')) {
                        return match[0];
                    }
                    return trimmed;
                }

                // For asset URLs with /users/{accountId}/{imageId}/filename pattern
                // Extract the IMAGE ID (second UUID), not the account ID (first UUID)
                if (trimmed.includes('/users/')) {
                    const globalUuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
                    const allMatches = trimmed.match(globalUuidPattern);
                    if (allMatches && allMatches.length >= 2) {
                        // Second UUID is the image/content ID
                        return `/imagine/post/${allMatches[1]}`;
                    }
                }

                // Fallback: use last UUID found (more likely to be content ID than account ID)
                const globalUuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
                const allMatches = trimmed.match(globalUuidPattern);
                if (allMatches && allMatches.length > 0) {
                    return `/imagine/post/${allMatches[allMatches.length - 1]}`;
                }
                return null;
            };


            const extractIdPath = (node) => {
                if (!node || typeof node.getAttribute !== 'function') {
                    return null;
                }

                for (const attr of idAttributes) {
                    const raw = node.getAttribute(attr);
                    const path = ensurePostPath(raw);
                    if (path) {
                        return path;
                    }
                }

                if (node.dataset) {
                    for (const [key, value] of Object.entries(node.dataset)) {
                        if (!value) {
                            continue;
                        }
                        const keyLower = key.toLowerCase();
                        if (keyLower.includes('id') || keyLower.includes('post') || keyLower.includes('media')) {
                            const path = ensurePostPath(value);
                            if (path) {
                                return path;
                            }
                        }
                    }
                }

                const elementId = node.getAttribute('id');
                if (elementId) {
                    const match = elementId.match(embeddedUuidPattern);
                    if (match) {
                        return `/imagine/post/${match[0]}`;
                    }
                }

                return null;
            };

            const extractUrlFromStyle = (styleValue = '') => {
                if (typeof styleValue !== 'string' || !styleValue) {
                    return null;
                }
                const match = styleValue.match(/url\((?:"|')?(.*?)(?:"|')?\)/i);
                return match ? match[1] : null;
            };

            const collectMediaCandidates = (node) => {
                if (!node) {
                    return [];
                }
                const values = new Set();

                const mediaAttributes = [
                    'src',
                    'data-src',
                    'data-source',
                    'data-url',
                    'data-image',
                    'data-preview',
                    'data-thumb',
                    'data-thumbnail',
                    'data-media',
                    'data-media-url',
                    'data-asset-url',
                    'data-asset',
                    'data-content-url',
                    'data-large-image',
                    'data-original'
                ];

                if (typeof node.getAttribute === 'function') {
                    for (const attr of mediaAttributes) {
                        const val = node.getAttribute(attr);
                        if (val) {
                            values.add(val);
                        }
                    }
                }

                if (typeof node.src === 'string' && node.src) {
                    values.add(node.src);
                }
                if (typeof node.currentSrc === 'string' && node.currentSrc) {
                    values.add(node.currentSrc);
                }
                if (typeof node.poster === 'string' && node.poster) {
                    values.add(node.poster);
                }

                if (node.dataset) {
                    for (const value of Object.values(node.dataset)) {
                        if (value) {
                            values.add(value);
                        }
                    }
                }

                try {
                    if (node.style && typeof node.style.backgroundImage === 'string' && node.style.backgroundImage) {
                        const bg = extractUrlFromStyle(node.style.backgroundImage);
                        if (bg) {
                            values.add(bg);
                        }
                    } else if (window.getComputedStyle) {
                        const computed = window.getComputedStyle(node);
                        const bg = extractUrlFromStyle(computed?.backgroundImage || '');
                        if (bg) {
                            values.add(bg);
                        }
                    }
                } catch (_) {
                    // Ignore style access errors (e.g., detached nodes)
                }

                return Array.from(values).filter(Boolean);
            };

            const getMediaPathFromNode = (node) => {
                const candidates = collectMediaCandidates(node);
                window.Logger.debug('QuickLaunch', 'getMediaPathFromNode:', {
                    nodeTag: node?.tagName,
                    nodeSrc: node?.src,
                    nodeDataset: node?.dataset ? JSON.stringify(node.dataset) : null,
                    candidatesFound: candidates.length,
                    candidates: candidates.slice(0, 5) // Log first 5 candidates
                });

                // Check if we're on a gallery page where Quick Raw/JSON should work
                const isGalleryPage = /^\/(imagine|imagine\/favorites)(\/|$)/i.test(window.location.pathname);

                for (const candidate of candidates) {
                    // On gallery pages, accept data: URLs directly for Quick Raw/JSON
                    // These modes don't need post paths - they just trigger generation
                    if (isGalleryPage && typeof candidate === 'string' && candidate.startsWith('data:image')) {
                        window.Logger.debug('QuickLaunch', 'Gallery page: accepting data URL as valid media path');
                        return candidate; // Return data URL as the "path" - it just needs to be truthy
                    }

                    const path = ensurePostPath(candidate);
                    window.Logger.debug('QuickLaunch', 'ensurePostPath candidate:', {
                        input: candidate?.substring(0, 120),
                        output: path
                    });
                    if (path) {
                        return path;
                    }
                }
                return null;
            };

            const climbForIdPath = (node, maxDepth = 6) => {
                let current = node;
                let depth = 0;
                while (current && depth < maxDepth) {
                    const path = extractIdPath(current) || getMediaPathFromNode(current);
                    if (path) {
                        return path;
                    }
                    current = current.parentElement || current.host || null;
                    depth += 1;
                }
                return null;
            };

            const extractHref = (node) => {
                if (!node) {
                    return null;
                }
                if (node instanceof window.DocumentFragment) {
                    return null;
                }
                if (node && typeof node.matches === 'function') {
                    if (node.matches('button[data-navigation-target], button[data-href]')) {
                        const attrVal = node.getAttribute('data-navigation-target') || node.getAttribute('data-href');
                        if (attrVal && attrVal.includes('/imagine/post/')) {
                            return attrVal;
                        }
                    }
                }
                if (typeof node.getAttribute === 'function') {
                    for (const attr of candidateAttributes) {
                        const raw = node.getAttribute(attr);
                        if (raw && raw.includes('/imagine/post/')) {
                            return raw;
                        }
                    }
                }
                const dataset = node.dataset;
                if (dataset) {
                    const potentials = [dataset.href, dataset.navigationTarget, dataset.link];
                    for (const potential of potentials) {
                        if (potential && potential.includes('/imagine/post/')) {
                            return potential;
                        }
                    }
                }
                const navTarget = node?.ariaLabel || node?.getAttribute?.('aria-label') || '';
                if (navTarget && navTarget.includes('/imagine/post/')) {
                    return navTarget;
                }
                return null;
            };

            const getPath = (node) => {
                if (!node) {
                    return null;
                }
                const hrefVal = extractHref(node);
                window.Logger.debug('QuickLaunch', 'getPath - extractHref:', hrefVal);
                const hrefPath = ensurePostPath(hrefVal);
                window.Logger.debug('QuickLaunch', 'getPath - ensurePostPath(href):', hrefPath);
                if (hrefPath) {
                    return hrefPath;
                }
                const localIdPath = extractIdPath(node);
                window.Logger.debug('QuickLaunch', 'getPath - extractIdPath:', localIdPath);
                if (localIdPath) {
                    return localIdPath;
                }
                const mediaPath = getMediaPathFromNode(node);
                window.Logger.debug('QuickLaunch', 'getPath - getMediaPathFromNode:', mediaPath);
                if (mediaPath) {
                    return mediaPath;
                }
                const climbPath = climbForIdPath(node);
                window.Logger.debug('QuickLaunch', 'getPath - climbForIdPath:', climbPath);
                return climbPath;
            };

            const buildResult = (node, from) => {
                const href = extractHref(node);
                const path = getPath(node);
                if (href || path) {
                    log('debug', `resolved via ${from}`, { node, href, path });
                    return {
                        element: node,
                        href,
                        path
                    };
                }
                if (node && node.matches?.('button[aria-label], button[aria-labelledby], button[data-testid]')) {
                    const ariaLabel = node.getAttribute('aria-label') || '';
                    const labelledBy = node.getAttribute('aria-labelledby') || '';
                    const dataTestId = node.getAttribute('data-testid') || '';
                    const combined = `${ariaLabel} ${labelledBy} ${dataTestId}`.toLowerCase();
                    if (combined.includes('make video')) {
                        const fallbackPath = climbForIdPath(node, 8);
                        if (fallbackPath) {
                            log('debug', `button fallback (${from})`, { node, fallbackPath });
                            return {
                                element: node,
                                href: null,
                                path: fallbackPath
                            };
                        }
                    }
                }
                return null;
            };

            const direct = buildResult(event.target, 'event.target');
            if (direct) {
                return direct;
            }

            if (typeof event.target?.closest === 'function') {
                const closestSelector = [
                    'a[href*="/imagine/post/"]',
                    '[data-href*="/imagine/post/"]',
                    '[data-navigation-target*="/imagine/post/"]',
                    'button[data-navigation-target*="/imagine/post/"]',
                    'button[data-href*="/imagine/post/"]',
                    'button[aria-label*="make video" i]',
                    'button[data-testid*="make-video" i]',
                    'div[data-id]',
                    'div[data-media-id]',
                    'div[data-media-post-id]',
                    'div[data-post-id]'
                ].join(', ');

                const closest = event.target.closest(closestSelector);
                if (closest) {
                    const resolved = buildResult(closest, 'closest');
                    if (resolved) {
                        return resolved;
                    }
                }
            }

            if (typeof event.composedPath === 'function') {
                const path = event.composedPath();
                for (const node of path) {
                    const resolved = buildResult(node, 'composedPath');
                    if (resolved) {
                        return resolved;
                    }
                }
            }

            if (event.target && typeof event.target.querySelector === 'function') {
                const nested = event.target.querySelector('a[href*="/imagine/post/"]');
                if (nested) {
                    const resolved = buildResult(nested, 'nested');
                    if (resolved) {
                        return resolved;
                    }
                }
            }

            if (window.Logger.isDebugEnabled() && typeof event.composedPath === 'function') {
                const summary = event.composedPath()
                    .map((node) => {
                        if (!node) {
                            return '[null]';
                        }
                        if (node === window) {
                            return '[window]';
                        }
                        if (node === document) {
                            return '[document]';
                        }
                        const tag = node.tagName ? node.tagName.toLowerCase() : (node.nodeName || '[unknown]').toLowerCase();
                        const id = node.id ? `#${node.id}` : '';
                        const classList = node.classList ? `.${Array.from(node.classList).join('.')}` : '';
                        const attrs = [];
                        if (typeof node.getAttribute === 'function') {
                            ['data-id', 'data-media-id', 'data-post-id', 'aria-label', 'href'].forEach((attr) => {
                                const val = node.getAttribute(attr);
                                if (val) {
                                    attrs.push(`${attr}=${val}`);
                                }
                            });
                        }
                        return `${tag}${id}${classList}${attrs.length ? ` (${attrs.join(', ')})` : ''}`;
                    })
                    .slice(0, 14);
                log('warn', 'composedPath summary', summary);
            }

            log('warn', 'unable to resolve favorite target', { target: event.target });
            return null;
        }

        _getActiveMode() {
            try {
                const state = this.stateManager?.getState();
                const mode = state?.ui?.quickLaunchMode;
                return mode === 'json' || mode === 'raw' || mode === 'edit' ? mode : null;
            } catch (error) {
                window.Logger.error('QuickLaunch', 'Unable to read quick-launch mode:', error);
                return null;
            }
        }

        _isSuppressed() {
            try {
                const state = this.stateManager?.getState();
                return !!state?.ui?.quickLaunchSuppressed;
            } catch (error) {
                return false;
            }
        }

        _buildPrompt(mode) {
            if (!this.uiManager) {
                return null;
            }
            try {
                if (window.Logger.isDebugEnabled()) {
                    window.Logger.debug('QuickLaunch', 'Building prompt for mode', mode);
                }
                if (mode === 'json' && this.uiManager.uiFormManager?.buildJsonPrompt) {
                    const prompt = this.uiManager.uiFormManager.buildJsonPrompt();
                    return typeof prompt === 'string' ? prompt : '';
                }
                if ((mode === 'raw' || mode === 'edit') && this.uiManager.uiRawInputManager?.buildRawPrompt) {
                    const prompt = this.uiManager.uiRawInputManager.buildRawPrompt();
                    return typeof prompt === 'string' ? prompt : '';
                }
            } catch (error) {
                window.Logger.error('QuickLaunch', 'Prompt builder failed:', error);
            }
            return null;
        }

        _extractImageId(pathnameOrHref) {
            if (!pathnameOrHref) {
                return null;
            }
            try {
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

                // If input contains /imagine/post/, extract the UUID from there
                const postMatch = pathnameOrHref.match(/\/imagine\/post\/([0-9a-f-]+)/i);
                if (postMatch && postMatch[1] && uuidRegex.test(postMatch[1])) {
                    return postMatch[1];
                }

                const path = pathnameOrHref.includes('://')
                    ? new URL(pathnameOrHref, window.location.href).pathname
                    : pathnameOrHref;
                const parts = path.split('/').filter(Boolean);

                // For Grok asset URLs: /users/{accountId}/{imageId}/filename.webp
                // We want the imageId (second UUID), not the accountId (first UUID) or filename
                if (parts.includes('users') && parts.length >= 3) {
                    const userIdx = parts.indexOf('users');
                    // After 'users' we have: accountId, imageId, filename
                    // The imageId is at userIdx + 2
                    const imageIdCandidate = parts[userIdx + 2];
                    if (imageIdCandidate && uuidRegex.test(imageIdCandidate)) {
                        return imageIdCandidate;
                    }
                }

                // Fallback: find any valid UUID in the path (prefer last matching UUID)
                const allUuids = parts.filter(part => uuidRegex.test(part));
                if (allUuids.length > 0) {
                    // Return the last UUID found (most likely the content/image ID)
                    return allUuids[allUuids.length - 1];
                }

                // Final fallback: return last non-empty part
                return parts.length ? parts[parts.length - 1] : null;
            } catch (error) {
                return null;
            }
        }


        _maybeResumePendingLaunch() {
            let rawPayload = null;
            try {
                rawPayload = window.sessionStorage.getItem(this.storageKey);
            } catch (error) {
                window.Logger.error('QuickLaunch', 'Unable to access sessionStorage:', error);
                return;
            }

            if (!rawPayload) {
                if (window.Logger.isDebugEnabled()) {
                    window.Logger.debug('QuickLaunch', 'Resume check: no pending payload found');
                }
                return;
            }

            let payload;
            try {
                payload = JSON.parse(rawPayload);
                if (window.Logger.isDebugEnabled()) {
                    window.Logger.debug('QuickLaunch', 'Pending payload restored', payload);
                }
            } catch (error) {
                window.Logger.error('QuickLaunch', 'Stored quick-launch payload is malformed:', error);
                this._clearPendingPayload();
                return;
            }

            if (this._isSuppressed()) {
                window.Logger.info('QuickLaunch', 'Pending payload discarded due to suppression');
                this._clearPendingPayload('suppressed');
                return;
            }

            if (!payload || typeof payload.prompt !== 'string') {
                if (window.Logger.isDebugEnabled()) {
                    window.Logger.debug('QuickLaunch', 'Resume check: payload missing prompt', payload);
                }
                this._clearPendingPayload();
                return;
            }

            if (typeof payload.timestamp === 'number' && Date.now() - payload.timestamp > 120000) {
                window.Logger.warn('QuickLaunch', 'Discarding stale quick-launch payload');
                this._clearPendingPayload();
                return;
            }

            const currentPath = window.location.pathname;
            const matchesPath = !payload.targetPath
                || currentPath === payload.targetPath
                || currentPath.startsWith(payload.targetPath);
            const matchesImage = payload.imageId && currentPath.includes(payload.imageId);
            const isImagePage = currentPath.startsWith('/imagine/post/');
            const shouldForceResume = isImagePage && !matchesPath && !matchesImage;

            if (window.Logger.isDebugEnabled()) {
                window.Logger.debug('QuickLaunch', 'Resume check payload', {
                    currentPath,
                    targetPath: payload.targetPath,
                    imageId: payload.imageId,
                    matchesPath,
                    matchesImage,
                    isImagePage,
                    shouldForceResume
                });
            }

            if (!matchesPath && !matchesImage && !shouldForceResume) {
                if (window.Logger.isDebugEnabled()) {
                    window.Logger.debug('QuickLaunch', 'Resume check: navigation not yet at target path', {
                        currentPath,
                        targetPath: payload.targetPath,
                        imageId: payload.imageId
                    });
                }
                return;
            }

            if (shouldForceResume) {
                if (window.Logger.isDebugEnabled()) {
                    window.Logger.debug('QuickLaunch', 'Forcing resume on active image page despite payload mismatch');
                }
                payload.targetPath = currentPath;
                payload.imageId = this._extractImageId(currentPath) || payload.imageId || null;
                try {
                    window.sessionStorage.setItem(this.storageKey, JSON.stringify(payload));
                } catch (persistError) {
                    window.Logger.warn('QuickLaunch', 'Unable to update payload targetPath during forced resume:', persistError);
                }
            }

            if (window.Logger.isDebugEnabled()) {
                window.Logger.debug('QuickLaunch', 'Target image detected - beginning prompt automation', {
                    currentPath,
                    payloadId: payload.id,
                    mode: payload.mode,
                    promptLength: typeof payload.prompt === 'string' ? payload.prompt.length : 'n/a'
                });
            }
            window.Logger.info('QuickLaunch', 'Resuming queued quick-launch payload for path', currentPath);
            this._processPendingPayload(payload);
        }

        async _processPendingPayload(payload) {
            if (this._isProcessing) {
                window.Logger.debug('QuickLaunch', 'Ignoring payload resume; already processing another payload');
                return;
            }
            this._clearResumeProbes();
            if (this._isSuppressed()) {
                window.Logger.info('QuickLaunch', 'Payload processing skipped due to suppression');
                this._clearPendingPayload('suppressed');
                return;
            }

            // v1.21.25: Suppress UIManager automation while content.js handles this
            if (this.uiManager?._setQuickLaunchSuppressed) {
                this.uiManager._setQuickLaunchSuppressed(true, 'content-js-processing');
            }

            this._isProcessing = true;
            try {
                this.uiManager?.showToast?.('Inserting and sending prompt', 'info', 2000); // GVP Toast
                const normalizedPrompt = typeof payload.prompt === 'string' ? payload.prompt : '';

                window.Logger.info('QuickLaunch', 'Processing payload', {
                    id: payload.id,
                    mode: payload.mode,
                    isRaw: payload.isRaw,
                    spicy: payload.spicy,
                    promptLength: normalizedPrompt.length,
                    imageId: payload.imageId,
                    sourceUrl: payload.sourceUrl
                });

                if (typeof payload.spicy === 'boolean' && this.uiManager?.setSpicyMode) {
                    window.Logger.debug('QuickLaunch', 'Syncing spicy mode to', payload.spicy);
                    this.uiManager.setSpicyMode(payload.spicy);
                }

                if (this.uiManager?.stateManager?.setLastPrompt) {
                    try {
                        this.uiManager.stateManager.setLastPrompt(normalizedPrompt);
                        window.Logger.debug('QuickLaunch', 'Recorded last prompt for resume');
                    } catch (promptError) {
                        window.Logger.warn('QuickLaunch', 'Unable to record last prompt:', promptError);
                    }
                }

                let sendPromise = null;

                window.Logger.debug('QuickLaunch', 'Building send plan', {
                    hasJsonHandler: !!this.uiManager?.uiFormManager?.handleGenerateJson,
                    hasRawHandler: !!this.uiManager?.uiRawInputManager?.handleGenerateRaw,
                    hasImageEditHandler: !!this.reactAutomation?.sendToImageEdit,
                    hasVideoGenerator: !!this.reactAutomation?.sendToGenerator,
                    hasAutomation: !!this.reactAutomation,
                    mode: payload.mode,
                    pendingVideoFromEdit: payload.pendingVideoFromEdit,
                    promptLength: normalizedPrompt.length
                });

                // NEW: Handle Quick Video from Edit - uses sendToGenerator for video, then returns to source
                if (payload.pendingVideoFromEdit && this.reactAutomation?.sendToGenerator) {
                    this.uiManager?.showToast?.('Creating Video Form Edited Image', 'info', 2000); // GVP Toast
                    window.Logger.info('Quick Video', '🎬 Processing Quick Video from Edit payload');
                    window.Logger.debug('Quick Video', 'Using sendToGenerator for video generation');

                    try {
                        sendPromise = this.reactAutomation.sendToGenerator(normalizedPrompt, true);
                        await sendPromise;
                        window.Logger.info('Quick Video', '✅ Video generation initiated');

                        // Clear payload before navigation
                        this._clearPendingPayload();

                        // Navigate back using Escape key (preserves page state, doesn't cause refresh)
                        // This allows video generation to continue in background and preserves edited images
                        window.Logger.info('Quick Video', '🔙 Using Escape key to return (no page refresh)');
                        setTimeout(() => {
                            this._simulateEscape();
                        }, 500);
                        return; // Exit early - we've handled this payload
                    } catch (error) {
                        window.Logger.error('Quick Video', '❌ Video generation failed:', error);
                        this._clearPendingPayload();
                        return;
                    }
                }

                // Handle 'edit' mode for image editing
                if (payload.mode === 'edit' && this.reactAutomation?.sendToImageEdit) {
                    window.Logger.debug('QuickLaunch', 'Delegating to sendToImageEdit for image edit automation');
                    sendPromise = this.reactAutomation.sendToImageEdit(normalizedPrompt);
                } else if (!payload.isRaw && this.uiManager?.uiFormManager?.handleGenerateJson) {
                    window.Logger.debug('QuickLaunch', 'Delegating to handleGenerateJson (allowEmpty=true)');
                    sendPromise = this.uiManager.uiFormManager.handleGenerateJson({
                        allowEmpty: true,
                        promptOverride: normalizedPrompt,
                        source: 'quick'
                    });
                } else if (payload.isRaw && this.uiManager?.uiRawInputManager?.handleGenerateRaw) {
                    window.Logger.debug('QuickLaunch', 'Delegating to handleGenerateRaw (allowEmpty=true)');
                    sendPromise = this.uiManager.uiRawInputManager.handleGenerateRaw({
                        allowEmpty: true,
                        promptOverride: normalizedPrompt,
                        source: 'quick'
                    });
                }

                if (!sendPromise && this.reactAutomation) {
                    window.Logger.debug('QuickLaunch', 'Falling back to direct ReactAutomation send');
                    sendPromise = this.reactAutomation.sendToGenerator(normalizedPrompt, !!payload.isRaw);
                }

                if (!sendPromise) {
                    throw new Error('No automation path available for quick-launch submission');
                }

                window.Logger.debug('QuickLaunch', 'Awaiting send promise resolution');
                await sendPromise;

                window.Logger.debug('QuickLaunch', 'Submission promise resolved');

                if (payload.imageId && this.stateManager?.updateGeneration) {
                    try {
                        const state = this.stateManager.getState?.();
                        const currentGen = state?.generation?.currentGenerationId;
                        if (currentGen) {
                            this.stateManager.updateGeneration(currentGen, { imageId: payload.imageId });
                        }
                        if (this.uiManager) {
                            this.uiManager._lastResolvedImageId = payload.imageId;
                        }
                    } catch (updateError) {
                        window.Logger.warn('QuickLaunch', 'Unable to record imageId for generation:', updateError);
                    }
                }

                window.Logger.info('QuickLaunch', 'Quick-launch prompt submitted');
                this._clearPendingPayload();

                // Skip navigation for 'edit' mode - user stays on page to continue editing
                if (payload.mode === 'edit') {
                    window.Logger.debug('QuickLaunch', 'Edit mode: Staying on page (no gallery navigation)');
                } else {
                    window.Logger.debug('QuickLaunch', 'Scheduling navigation back to favorites');
                    this.uiManager?.showToast?.('Returning to gallery', 'info', 2000); // GVP Toast
                    // v1.21.28: No suppression needed - UIManager no longer handles quick-launch
                    setTimeout(() => this._returnToFavorites(payload), 120);
                }
            } catch (error) {
                window.Logger.error('QuickLaunch', 'Failed to process quick-launch payload:', error);
                this._clearPendingPayload();
            } finally {
                window.Logger.debug('QuickLaunch', 'Resetting processing state');
                this._isProcessing = false;

                // v1.21.29: Clear suppression after processing complete
                if (this.uiManager?._setQuickLaunchSuppressed) {
                    this.uiManager._setQuickLaunchSuppressed(false, 'content-js-complete');
                }
            }
        }

        _computeFavoritesHref(payload) {
            if (payload?.sourceUrl) {
                window.Logger.debug('QuickLaunch', 'Returning to source URL', payload.sourceUrl);
                return payload.sourceUrl;
            }
            if (payload?.targetPath) {
                try {
                    window.Logger.debug('QuickLaunch', 'Reconstructing URL from targetPath', payload.targetPath);
                    return new URL(payload.targetPath, window.location.origin).href;
                } catch (_) {
                    return `${window.location.origin}/imagine/favorites`;
                }
            }
            return `${window.location.origin}/imagine/favorites`;
        }

        _returnToFavorites(payload) {
            const href = this._computeFavoritesHref(payload);
            if (!href) {
                window.Logger.warn('QuickLaunch', 'No favorites URL computed; skipping navigation');
                return;
            }

            try {
                const targetUrl = new URL(href, window.location.origin);
                if (window.location.href === targetUrl.href) {
                    if (window.Logger.isDebugEnabled()) {
                        window.Logger.debug('QuickLaunch', 'Already on favorites; no navigation needed');
                    }
                    return;
                }

                if (window.Logger.isDebugEnabled()) {
                    window.Logger.debug('QuickLaunch', 'Returning to favorites', targetUrl.href);
                }

                window.history.replaceState(null, '', targetUrl.href);
                window.dispatchEvent(new PopStateEvent('popstate'));

                setTimeout(() => {
                    if (window.location.href !== targetUrl.href) {
                        window.Logger.debug('QuickLaunch', 'Popstate did not navigate, forcing location.assign');
                        try {
                            window.location.assign(targetUrl.href);
                        } catch (navError) {
                            window.Logger.error('QuickLaunch', 'Fallback navigation to favorites failed:', navError);
                        }
                    }
                }, 150);
            } catch (error) {
                window.Logger.error('QuickLaunch', 'Failed to compute favorites navigation target:', error);
                try {
                    window.location.assign('/imagine/favorites');
                } catch (fallbackError) {
                    window.Logger.error('QuickLaunch', 'Secondary fallback navigation failed:', fallbackError);
                }
            }
        }

        _ensureQuickControls(attempt = 0) {
            const MAX_ATTEMPTS = 20;
            if (!this.uiManager || !this.uiManager.shadowRoot) {
                if (attempt < MAX_ATTEMPTS) {
                    setTimeout(() => this._ensureQuickControls(attempt + 1), 200);
                }
                return;
            }

            const root = this.uiManager.shadowRoot;
            const bottomBar = root.querySelector('#gvp-bottom-bar');
            if (!bottomBar) {
                if (attempt < MAX_ATTEMPTS) {
                    setTimeout(() => this._ensureQuickControls(attempt + 1), 200);
                }
                return;
            }

            const topRow = bottomBar.querySelector('.gvp-bottom-row.top');
            if (!topRow) {
                if (attempt < MAX_ATTEMPTS) {
                    setTimeout(() => this._ensureQuickControls(attempt + 1), 200);
                }
                return;
            }

            let jsonBtn = topRow.querySelector('.gvp-quick-json-btn');
            let rawBtn = topRow.querySelector('.gvp-quick-raw-btn');
            const viewBtn = topRow.querySelector('.gvp-button:not(.gvp-quick-toggle)');

            if (!jsonBtn) {
                jsonBtn = this._createQuickButton('json', '⏩ Quick JSON');
                if (jsonBtn) {
                    topRow.insertBefore(jsonBtn, viewBtn || topRow.firstChild);
                }
            }

            if (!rawBtn) {
                rawBtn = this._createQuickButton('raw', '⏩ Quick Raw');
                if (rawBtn) {
                    if (viewBtn && viewBtn.nextSibling) {
                        topRow.insertBefore(rawBtn, viewBtn.nextSibling);
                    } else {
                        topRow.appendChild(rawBtn);
                    }
                }
            }

            this._syncQuickButtons();
        }

        _createQuickButton(mode, label) {
            if (!this.uiManager || !this.uiManager.shadowRoot) {
                return null;
            }

            const button = this.uiManager.shadowRoot.ownerDocument.createElement('button');
            button.type = 'button';
            button.className = `gvp-button gvp-quick-toggle gvp-quick-${mode}-btn`;
            button.innerHTML = label;
            button.dataset.quickMode = mode;
            button.addEventListener('click', () => {
                const currentMode = this._getActiveMode();
                const nextMode = currentMode === mode ? null : mode;
                if (typeof this.uiManager?.setQuickLaunchMode === 'function') {
                    this.uiManager.setQuickLaunchMode(nextMode);
                }
                this._syncQuickButtons();
            });
            return button;
        }

        _syncQuickButtons() {
            if (!this.uiManager || !this.uiManager.shadowRoot) {
                return;
            }

            const mode = this._getActiveMode();
            const root = this.uiManager.shadowRoot;
            const jsonBtn = root.querySelector('.gvp-quick-json-btn');
            const rawBtn = root.querySelector('.gvp-quick-raw-btn');

            if (jsonBtn) {
                const isJson = mode === 'json';
                jsonBtn.classList.toggle('active', isJson);
                jsonBtn.setAttribute('aria-pressed', isJson ? 'true' : 'false');
            }

            if (rawBtn) {
                const isRaw = mode === 'raw';
                rawBtn.classList.toggle('active', isRaw);
                rawBtn.setAttribute('aria-pressed', isRaw ? 'true' : 'false');
            }
        }

        _clearPendingPayload(reason) {
            if (window.Logger.isDebugEnabled() && reason) {
                window.Logger.debug('QuickLaunch', 'Clearing pending payload', reason);
            }
            try {
                window.sessionStorage.removeItem(this.storageKey);
            } catch (error) {
                window.Logger.error('QuickLaunch', 'Unable to clear quick-launch payload:', error);
            }
            this._clearResumeProbes();
        }

        _queueResumeProbes() {
            if (this._isSuppressed()) {
                if (window.Logger.isDebugEnabled()) {
                    window.Logger.debug('QuickLaunch', 'Suppressed - skipping resume probes');
                }
                return;
            }
            this._clearResumeProbes();

            // AGGRESSIVE POLLING FIX:
            // Instead of sparse checks (120, 280...), we poll every 100ms for 3 seconds.
            // This ensures we catch the page load immediately, eliminating the 2s lag.
            const POLL_INTERVAL = 100;
            const MAX_DURATION = 3000;
            const MAX_CHECKS = MAX_DURATION / POLL_INTERVAL;

            if (window.Logger.isDebugEnabled()) {
                window.Logger.debug('QuickLaunch', `Starting aggressive resume polling (${POLL_INTERVAL}ms interval for ${MAX_DURATION}ms)`);
            }

            let checks = 0;
            const pollTimer = window.setInterval(() => {
                checks++;
                if (checks > MAX_CHECKS) {
                    this._clearResumeProbes();
                    if (window.Logger.isDebugEnabled()) {
                        window.Logger.debug('QuickLaunch', 'Aggressive polling timed out');
                    }
                    return;
                }

                // If we successfully resume, _maybeResumePendingLaunch will call _clearResumeProbes
                // which clears this interval.
                this._maybeResumePendingLaunch();

            }, POLL_INTERVAL);

            this._resumeTimers.push(pollTimer);
        }

        _clearResumeProbes() {
            if (!Array.isArray(this._resumeTimers) || !this._resumeTimers.length) {
                return;
            }
            this._resumeTimers.forEach(timerId => window.clearTimeout(timerId));
            this._resumeTimers = [];
        }
    }
    // Main application class
    class GrokVideoPrompterApp {
        constructor() {
            // Guard against legacy bridge instances that might still be present
            if (window.gvpBridge) {
                window.Logger.debug('Init', 'Legacy bridge found, disabling...');
                window.gvpBridge = null;
            }

            // Restore clean fetch
            if (window.fetch && window.fetch.toString().includes('[original]')) {
                delete window.fetch;
                window.Logger.debug('Init', 'Restored native fetch');
            }

            // Initialize IndexedDBManager for unlimited storage (NEW in v1.15.67)
            this.indexedDBManager = window.IndexedDBManager ? new window.IndexedDBManager() : null;
            window.gvpIndexedDB = this.indexedDBManager; // Global reference for debugging

            // Initialize StateManager with IndexedDB support
            this.stateManager = window.StateManager ? new window.StateManager(this.indexedDBManager) : null;
            if (window.UploadAutomationManager) {
                try {
                    this.uploadAutomationManager = new window.UploadAutomationManager(this.stateManager);
                    window.Logger.debug('Init', '✅ UploadAutomationManager initialized');
                } catch (error) {
                    window.Logger.error('Init', 'UploadAutomationManager failed to initialize:', error);
                    this.uploadAutomationManager = null;
                }
            } else {
                this.uploadAutomationManager = null;
                window.Logger.warn('Init', 'UploadAutomationManager unavailable on window');
            }
            this.reactAutomation = window.ReactAutomation ? new window.ReactAutomation(this.stateManager) : null;
            this.networkInterceptor = window.NetworkInterceptor
                ? new window.NetworkInterceptor(this.stateManager, this.reactAutomation, this.uploadAutomationManager)
                : null;
            this.advancedRawInputManager = window.AdvancedRawInputManager ? new window.AdvancedRawInputManager(this.stateManager) : null;
            this.rawInputManager = window.RawInputManager ? new window.RawInputManager(this.stateManager) : null;
            const multiVideoEnabled = window.__GVP_ENABLE_MULTI_VIDEO__ === true;
            this._multiVideoEnabled = multiVideoEnabled;
            this.multiVideoManager = (multiVideoEnabled && window.MultiVideoManager)
                ? new window.MultiVideoManager(this.stateManager, this.reactAutomation)
                : null;
            if (!this.multiVideoManager) {
                window.Logger.debug('Init', 'Multi-video manager disabled (feature flag)');
            }
            this.imageProjectManager = window.ImageProjectManager ? new window.ImageProjectManager(this.stateManager) : null;
            this.progressAPI = window.UIProgressAPI ? new window.UIProgressAPI(this.stateManager, null) : null;
            this.quickLaunchManager = null;
            this._lastSpicyStateSent = null;
            this._bridgeListener = null;
            this._bridgeListenerInstalled = false;

            // Explicit manager boot order with logging
            // Explicit manager boot order with logging
            window.Logger.info('Init', 'Manager boot sequence started...');
            window.gvpStorageManager = window.StorageManager ? new window.StorageManager() : null;
            if (window.gvpStorageManager) {
                window.Logger.debug('Init', '✅ StorageManager initialized');
            }

            if (this.stateManager) {
                window.Logger.debug('Init', '✅ StateManager initialized');
            }

            window.gvpAppInstance = this;
            this._installBridgeListener();
            window.gvpStateManager = this.stateManager;
            window.gvpUIGenerationsManager = null; // Will be set when UI initializes
            if (this.uploadAutomationManager) {
                window.gvpUploadAutomationManager = this.uploadAutomationManager;
            }

            // Initialize UIManager with all dependencies
            if (window.UIManager) {
                this.uiManager = new window.UIManager(
                    this.stateManager,
                    this.reactAutomation,
                    this.advancedRawInputManager
                );
                this.uiManager.multiVideoManager = this.multiVideoManager;
                this.uiManager.imageProjectManager = this.imageProjectManager;
                this.uiManager.networkInterceptor = this.networkInterceptor;
                this.uiManager.uploadAutomationManager = this.uploadAutomationManager;

                // Set UIManager reference back to UploadAutomationManager for checkbox access
                if (this.uploadAutomationManager) {
                    this.uploadAutomationManager.uiManager = this.uiManager;
                }

                // Expose globally
                window.gvpUIManager = this.uiManager;
            }

            if (this.imageProjectManager) {
                window.gvpImageProjectManager = this.imageProjectManager;
            }
        }

        async initialize() {
            try {
                window.Logger.info('Init', '🚀 ============================================');
                window.Logger.info('Init', '🚀 Initializing Grok Video Prompter Extension');
                window.Logger.info('Init', '🚀 ============================================');

                // STEP 1: Initialize IndexedDB first (NEW in v1.15.67)
                if (this.indexedDBManager) {
                    window.Logger.info('Init', '📦 STEP 1: Initializing IndexedDB...');
                    const dbInit = await this.indexedDBManager.initialize();
                    if (dbInit) {
                        window.Logger.info('Init', '✅ IndexedDB initialized successfully');

                        // Run migration from chrome.storage if needed
                        const migrated = await this.indexedDBManager.migrateFromChromeStorage();
                        if (migrated) {
                            window.Logger.info('Init', '✅ Data migration complete');
                        }
                    } else {
                        window.Logger.warn('Init', '⚠️ IndexedDB initialization failed, will use chrome.storage fallback');
                    }
                }

                // STEP 2: Initialize StateManager (waits for ALL IndexedDB data to load)
                window.Logger.info('Init', '⏳ STEP 2: Loading all settings and IndexedDB data...');
                if (this.stateManager && typeof this.stateManager.initialize === 'function') {
                    await this.stateManager.initialize();
                    window.Logger.info('Init', '✅ StateManager initialized - ALL IndexedDB data loaded');
                }

                // STEP 3: Initialize persistent storage
                if (this.stateManager && typeof this.stateManager.initializeStorage === 'function') {
                    await this.stateManager.initializeStorage();
                    window.Logger.info('Init', `✅ Storage manager initialized (v${APP_VERSION})`);
                }

                // STEP 4: Load recent prompts
                if (this.advancedRawInputManager) {
                    this.advancedRawInputManager.loadRecentPrompts();
                    this.advancedRawInputManager.startAutoSave();
                }
                if (this.rawInputManager) {
                    this.rawInputManager.loadRecentPrompts();
                }

                // Initialize UI managers (generation tracker disabled during merge)
                // Initialize UI managers (generation tracker disabled during merge)
                window.gvpUIGenerationsManager = null;
                window.Logger.info('Init', 'UIGenerationsManager disabled while merged history tab is rebuilt.');

                // STEP 5: Create UI (NOW it's safe - all data is loaded!)
                window.Logger.info('Init', '🎨 STEP 5: Creating UI with loaded data...');
                if (this.uiManager && typeof this.uiManager.createUI === 'function') {
                    this.uiManager.createUI();
                    if (typeof this.uiManager.openDrawer === 'function') {
                        this.uiManager.openDrawer();
                    }
                    window.Logger.info('Init', '✅ UI created successfully');

                }

                if (!this.quickLaunchManager && this.reactAutomation) {
                    this.quickLaunchManager = new QuickLaunchManager(this.stateManager, this.uiManager, this.reactAutomation);
                    window.gvpQuickLaunchManager = this.quickLaunchManager;
                } else if (this.quickLaunchManager) {
                    this.quickLaunchManager.setUIManager(this.uiManager);
                }

                this._injectPageInterceptor();
                this._broadcastSpicyState('post-injection', true);
                this.broadcastAuroraState();

                // Setup toolbar icon listener
                this._setupToolbarIconListener();

                // Start network interceptor
                if (this.networkInterceptor && typeof this.networkInterceptor.start === 'function') {
                    this.networkInterceptor.start();
                    window.Logger.info('Init', 'Network interceptor started');
                }

                // Initialize React automation
                if (this.reactAutomation && typeof this.reactAutomation.init === 'function') {
                    this.reactAutomation.init();
                    window.Logger.info('Init', 'React automation initialized');
                }

                // Start monitoring multi-video generations
                if (this.multiVideoManager && typeof this.multiVideoManager.monitorActiveGenerations === 'function') {
                    this.multiVideoManager.monitorActiveGenerations();
                    window.Logger.info('Init', 'Generation monitoring started');
                } else {
                    window.Logger.debug('Init', 'Generation monitoring skipped (multi-video disabled)');
                }

                // Load image projects
                if (this.imageProjectManager && typeof this.imageProjectManager.initialize === 'function') {
                    this.imageProjectManager.initialize();
                    window.Logger.info('Init', 'Image project manager initialized');
                }

                // Start API progress monitoring
                if (this.progressAPI && typeof this.progressAPI.startMonitoring === 'function') {
                    // Set UIManager reference if available
                    if (this.uiManager && typeof this.progressAPI.setUIManager === 'function') {
                        this.progressAPI.setUIManager(this.uiManager);
                    }
                    this.progressAPI.startMonitoring();
                    window.Logger.info('Init', 'API progress monitoring started');
                    window.gvpProgressAPI = this.progressAPI;
                    window.gvpUIProgressAPI = this.progressAPI;
                }

                if (this.quickLaunchManager) {
                    this.quickLaunchManager.initialize();
                }

                // Listen for Aurora state changes
                window.addEventListener('gvp:aurora-mode-changed', () => {
                    window.Logger.debug('Init', 'Aurora mode changed, broadcasting to page');
                    this.broadcastAuroraState();
                });

                // Expose global instance for debugging/cleanup
                window.GrokVideoPrompter = this;

                window.Logger.info('Init', `✨ Grok Video Prompter Extension (v${APP_VERSION}) initialized successfully!`, { color: '#00FF00', fontWeight: 'bold' });
                this._broadcastSpicyState('post-initialize', true);
                this.broadcastAuroraState();

                // Direct bulk sync trigger (bypasses interceptor bridge message)
                setTimeout(() => {
                    const accountId = this.stateManager?.getActiveMultiGenAccount?.();
                    if (accountId && this.networkInterceptor?.triggerBulkGallerySync) {
                        window.Logger.info('Init', '🚀 Triggering startup bulk gallery sync for account:', accountId.slice(0, 8) + '...');
                        this.networkInterceptor.triggerBulkGallerySync(accountId, 'favorites')
                            .then(result => window.Logger.debug('Init', 'Startup bulk sync result:', result))
                            .catch(err => window.Logger.error('Init', 'Startup bulk sync error:', err));
                    } else {
                        window.Logger.debug('Init', 'Skipping startup bulk sync - no account ID or networkInterceptor');
                    }
                }, 2000); // Delay to ensure account ID is detected from DOM/network
            } catch (error) {
                window.Logger.error('Init', 'Initialization failed:', error);
                window.Logger.error('Init', 'Stack trace:', error.stack);
            }
        }

        _setupToolbarIconListener() {
            try {
                chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                    if (!this.uiManager) {
                        sendResponse?.({ success: false, error: 'UIManager not available' });
                        return;
                    }

                    if (request.action === 'openGVPUI') {
                        if (typeof this.uiManager.openDrawer === 'function') {
                            this.uiManager.openDrawer();
                            sendResponse?.({ success: true, status: 'UI opened' });
                        } else {
                            sendResponse?.({ success: false, error: 'openDrawer not available' });
                        }
                    } else if (request.action === 'toggleDrawer') {
                        if (typeof this.uiManager.toggleDrawer === 'function') {
                            this.uiManager.toggleDrawer();
                            sendResponse?.({ success: true, status: 'UI toggled' });
                        } else {
                            sendResponse?.({ success: false, error: 'toggleDrawer not available' });
                        }
                    }
                });
                window.Logger.debug('Init', 'Toolbar icon listener setup complete');
            } catch (error) {
                window.Logger.error('Init', 'Failed to setup toolbar icon listener:', error);
            }
        }

        _injectPageInterceptor() {
            try {
                const existing = document.querySelector('script[data-gvp-fetch-interceptor]');
                if (existing) {
                    const existingVersion = existing.dataset.gvpFetchInterceptorVersion || 'unknown';
                    if (existingVersion === APP_VERSION) {
                        window.Logger.debug('Init', 'Page fetch interceptor already present (up-to-date)');
                        return;
                    }
                    window.Logger.debug('Init', 'Replacing outdated fetch interceptor', { existingVersion, targetVersion: APP_VERSION });
                    existing.remove();
                }

                const scriptUrl = chrome.runtime.getURL('public/injected/gvpFetchInterceptor.js');
                if (!scriptUrl) {
                    window.Logger.warn('Init', 'Unable to resolve fetch interceptor URL');
                    return;
                }

                const scriptEl = document.createElement('script');
                scriptEl.src = scriptUrl;
                scriptEl.async = false;
                scriptEl.type = 'text/javascript';
                scriptEl.dataset.gvpFetchInterceptor = 'true';
                scriptEl.dataset.gvpFetchInterceptorVersion = APP_VERSION;

                scriptEl.onload = () => {
                    window.Logger.debug('Init', 'Page fetch interceptor injected successfully');
                    scriptEl.remove();
                };
                scriptEl.onerror = (event) => {
                    window.Logger.error('Init', 'Page fetch interceptor failed to load:', event?.message || event);
                    scriptEl.remove();
                };

                const parent = document.documentElement || document.head;
                if (!parent) {
                    window.Logger.warn('Init', 'Unable to inject fetch interceptor - no document root');
                    return;
                }
                parent.appendChild(scriptEl);
            } catch (error) {
                window.Logger.error('Init', 'Failed to inject page interceptor:', error);
            }
        }

        _installBridgeListener() {
            if (this._bridgeListenerInstalled) {
                return;
            }

            try {
                const handler = (event) => {
                    if (!event || event.source !== window || !event.data) {
                        return;
                    }

                    const { source, type, payload } = event.data;
                    if (source !== 'gvp-fetch-interceptor' || !type) {
                        return;
                    }

                    switch (type) {
                        case 'GVP_FETCH_READY':
                            window.Logger.debug('Bridge', 'Page fetch interceptor reported ready');
                            if (this.networkInterceptor && typeof this.networkInterceptor.setPageInterceptorActive === 'function') {
                                this.networkInterceptor.setPageInterceptorActive(true, { source: 'bridge-ready' });
                            }
                            this._broadcastSpicyState('bridge-ready', true);
                            this.broadcastAuroraState();
                            break;
                        case 'GVP_FETCH_STATE_REQUEST':
                            this._broadcastSpicyState(payload?.reason || 'bridge-request', true);
                            this.broadcastAuroraState();
                            break;
                        case 'GVP_FETCH_CONTENT_REQUEST':
                            if (this.networkInterceptor && typeof this.networkInterceptor.setPageInterceptorActive === 'function') {
                                this.networkInterceptor.setPageInterceptorActive(true, { source: 'bridge-content' });
                            }
                            if (this.networkInterceptor && typeof this.networkInterceptor.handleBridgeContentRequest === 'function') {
                                try {
                                    this.networkInterceptor.handleBridgeContentRequest(payload || {});
                                } catch (contentError) {
                                    window.Logger.error('Bridge', 'Failed handling bridge content request event:', contentError);
                                }
                            }
                            break;
                        case 'GVP_FETCH_CONVERSATION_REQUEST':
                            if (this.networkInterceptor && typeof this.networkInterceptor.setPageInterceptorActive === 'function') {
                                this.networkInterceptor.setPageInterceptorActive(true, { source: 'bridge-conversation' });
                            }
                            if (this.networkInterceptor && typeof this.networkInterceptor.handleBridgeConversationRequest === 'function') {
                                Promise.resolve(this.networkInterceptor.handleBridgeConversationRequest(payload || {}))
                                    .catch(error => window.Logger.error('Bridge', 'Failed handling bridge conversation request event:', error));
                            }
                            break;
                        case 'GVP_FETCH_CONVERSATION_RESPONSE':
                            if (this.networkInterceptor && typeof this.networkInterceptor.setPageInterceptorActive === 'function') {
                                this.networkInterceptor.setPageInterceptorActive(true, { source: 'bridge-conversation-response' });
                            }
                            if (this.networkInterceptor && typeof this.networkInterceptor.handleBridgeConversationResponse === 'function') {
                                Promise.resolve(this.networkInterceptor.handleBridgeConversationResponse(payload || {}))
                                    .catch(error => window.Logger.error('Bridge', 'Failed handling bridge conversation response event:', error));
                            }
                            break;
                        case 'GVP_FETCH_PROGRESS':
                            if (this.networkInterceptor && typeof this.networkInterceptor.setPageInterceptorActive === 'function') {
                                this.networkInterceptor.setPageInterceptorActive(true, { source: 'bridge-progress' });
                            }
                            if (this.networkInterceptor && typeof this.networkInterceptor.handleBridgeProgress === 'function') {
                                Promise.resolve(this.networkInterceptor.handleBridgeProgress(payload || {}))
                                    .catch(error => window.Logger.error('Bridge', 'Failed handling bridge progress event:', error));
                            }
                            break;
                        case 'GVP_FETCH_VIDEO_PROMPT':
                            if (this.networkInterceptor && typeof this.networkInterceptor.setPageInterceptorActive === 'function') {
                                this.networkInterceptor.setPageInterceptorActive(true, { source: 'bridge-video-prompt' });
                            }
                            if (this.networkInterceptor && typeof this.networkInterceptor.handleBridgeVideoPrompt === 'function') {
                                Promise.resolve(this.networkInterceptor.handleBridgeVideoPrompt(payload || {}))
                                    .catch(error => window.Logger.error('Bridge', 'Failed handling bridge video prompt event:', error));
                            }
                            break;
                        case 'GVP_FETCH_GALLERY_DATA':
                            if (this.networkInterceptor && typeof this.networkInterceptor.ingestGalleryPayloadFromPage === 'function') {
                                try {
                                    const galleryPayload = payload?.payload;
                                    if (galleryPayload) {
                                        this.networkInterceptor.ingestGalleryPayloadFromPage(galleryPayload, {
                                            url: payload?.url || null,
                                            method: payload?.method || null,
                                            length: payload?.length || 0,
                                            source: 'bridge'
                                        });
                                    }
                                } catch (galleryError) {
                                    window.Logger.error('Bridge', 'Failed ingesting gallery payload from bridge:', galleryError);
                                }
                            }
                            break;
                        case 'GVP_FETCH_REQUEST_MODIFIED':
                            window.Logger.debug('Bridge', 'Page interceptor modified request mode:', payload?.mode || 'unknown', payload);
                            break;
                        case 'GVP_FETCH_LOG': {
                            const level = typeof payload?.level === 'string' ? payload.level.toLowerCase() : 'log';
                            // Map 'log' -> 'debug' for consistency, others stay same if valid
                            const method = level === 'log' ? 'debug' : level;
                            const extras = payload?.extras || {};
                            if (window.Logger && typeof window.Logger[method] === 'function') {
                                window.Logger[method]('Bridge', payload?.message || '', extras);
                            }
                            break;
                        }
                        case 'GVP_SYSTEM_PROMPT_LIST':
                            // System prompt list detected - trigger bulk gallery sync
                            window.Logger.info('Bridge', '🔔 System prompt list detected, triggering bulk gallery sync');
                            if (this.networkInterceptor && typeof this.networkInterceptor.triggerBulkGallerySync === 'function') {
                                const accountId = this.stateManager?.getActiveMultiGenAccount?.();
                                if (accountId) {
                                    // Fire and forget - don't block the bridge
                                    this.networkInterceptor.triggerBulkGallerySync(accountId, 'favorites')
                                        .then(result => {
                                            if (result.success && result.count > 0) {
                                                window.Logger.info('Bridge', `✅ Bulk sync completed: ${result.count} posts ingested`);
                                            }
                                        })
                                        .catch(error => window.Logger.error('Bridge', 'Bulk sync error:', error));
                                } else {
                                    window.Logger.debug('Bridge', '⏳ No account ID yet, bulk sync will trigger later');
                                }
                            }
                            break;
                        case 'GVP_TRIGGER_BULK_SYNC':
                            // Fallback trigger from first gallery /list call
                            window.Logger.info('Bridge', '🔔 Bulk sync trigger received from gallery /list');

                            // Helper function to attempt bulk sync with retries
                            const attemptBulkSync = (attempt = 1) => {
                                const accountId = this.stateManager?.getActiveMultiGenAccount?.();
                                window.Logger.debug('Bridge', `Bulk sync attempt ${attempt}, account ID:`, accountId ? accountId.slice(0, 8) + '...' : 'NONE');

                                if (accountId && this.networkInterceptor?.triggerBulkGallerySync) {
                                    this.networkInterceptor.triggerBulkGallerySync(accountId, 'favorites')
                                        .then(result => window.Logger.info('Bridge', '✅ Bulk sync result:', result))
                                        .catch(error => window.Logger.error('Bridge', 'Bulk sync error:', error));
                                } else if (attempt < 3) {
                                    // Retry in 2 seconds
                                    window.Logger.debug('Bridge', `⏳ No account ID yet, retrying in 2s (attempt ${attempt}/3)`);
                                    setTimeout(() => attemptBulkSync(attempt + 1), 2000);
                                } else {
                                    window.Logger.warn('Bridge', '⚠️ Bulk sync failed - no account ID after 3 attempts');
                                }
                            };

                            attemptBulkSync();
                            break;
                        default:
                            window.Logger.debug('Bridge', 'Unhandled bridge message:', type, payload);
                    }
                };

                window.addEventListener('message', handler, false);
                this._bridgeListener = handler;
                this._bridgeListenerInstalled = true;
                window.Logger.info('Init', '✅ Bridge listener installed');
            } catch (error) {
                window.Logger.error('Init', 'Failed to install bridge listener:', error);
            }
        }

        _getSpicyState() {
            try {
                const state = this.stateManager && typeof this.stateManager.getState === 'function'
                    ? this.stateManager.getState()
                    : null;
                return !!(state && state.generation && state.generation.useSpicy);
            } catch (error) {
                window.Logger.error('Init', 'Failed to read spicy state:', error);
                return false;
            }
        }

        _postStateToPage(type, reason = 'unspecified', force = false) {
            if (typeof window === 'undefined' || typeof window.postMessage !== 'function') {
                return;
            }

            const useSpicy = this._getSpicyState();
            if (!force && type === 'GVP_STATE_UPDATE' && this._lastSpicyStateSent === useSpicy) {
                return;
            }

            try {
                window.postMessage({
                    source: 'gvp-extension',
                    type,
                    payload: {
                        useSpicy,
                        reason,
                        timestamp: Date.now()
                    }
                }, '*');
                this._lastSpicyStateSent = useSpicy;
                window.Logger.debug('Init', `Sent spicy state to page (${type}) →`, useSpicy);
            } catch (error) {
                window.Logger.error('Init', 'Failed to post spicy state to page:', error);
            }
        }

        _broadcastSpicyState(reason = 'broadcast', force = false) {
            this._postStateToPage('GVP_STATE_BROADCAST', reason, force);
        }

        notifySpicyState(reason = 'update', force = false) {
            this._postStateToPage('GVP_STATE_UPDATE', reason, force);
        }

        _postAuroraStateToPage() {
            if (typeof window === 'undefined' || typeof window.postMessage !== 'function') {
                return;
            }

            try {
                const settings = this.stateManager?.getState?.().settings || {};
                const payload = {
                    enabled: Boolean(settings.auroraEnabled),
                    aspectRatio: settings.auroraAspectRatio || 'square',
                    imageMode: settings.auroraImageMode || 'blank',
                    blankPngs: {
                        portrait: settings.auroraBlankPngPortrait || '',
                        landscape: settings.auroraBlankPngLandscape || '',
                        square: settings.auroraBlankPngSquare || ''
                    },
                    customImages: {
                        portrait: settings.auroraCustomImagePortrait || '',
                        landscape: settings.auroraCustomImageLandscape || '',
                        square: settings.auroraCustomImageSquare || ''
                    }
                };
                window.postMessage({
                    source: 'gvp-extension',
                    type: 'GVP_AURORA_STATE',
                    payload
                }, '*');
                window.Logger.debug('Init', '📡 Broadcasting Aurora state to page:', {
                    enabled: payload.enabled,
                    aspectRatio: payload.aspectRatio,
                    imageMode: payload.imageMode,
                    hasBlankSquare: !!payload.blankPngs.square,
                    hasBlankPortrait: !!payload.blankPngs.portrait,
                    hasBlankLandscape: !!payload.blankPngs.landscape,
                    hasCustomSquare: !!payload.customImages.square,
                    hasCustomPortrait: !!payload.customImages.portrait,
                    hasCustomLandscape: !!payload.customImages.landscape
                });
            } catch (error) {
                window.Logger.error('Init', 'Failed to post Aurora state to page:', error);
            }
        }

        broadcastAuroraState() {
            this._postAuroraStateToPage();
        }
    }

    // Global fullscreen editor function
    window.gvpOpenFullscreen = function (label, value, category, field, options = {}) {
        const uiManager = window.gvpUIManager;
        if (!uiManager || !uiManager.shadowRoot) {
            console.error('[GVP] UIManager not available for fullscreen');
            return;
        }

        try {
            const modal = uiManager.shadowRoot.getElementById('gvp-fullscreen-modal');
            const title = uiManager.shadowRoot.getElementById('gvp-fullscreen-title');
            const textarea = uiManager.shadowRoot.getElementById('gvp-fullscreen-textarea');
            const state = uiManager.stateManager.getState();

            if (!modal || !title || !textarea) {
                window.Logger.error('UI', 'Fullscreen modal elements not found');
                return;
            }

            // Store fullscreen context
            state.fullscreenContent = {
                category: category,
                subArray: field,
                value: value || '',
                formattedValue: window.SentenceFormatter ? window.SentenceFormatter.toDisplay(value || '') : value || '',
                ...options
            };

            title.textContent = `${category} → ${label} - Full Screen Editor`;
            textarea.value = state.fullscreenContent.formattedValue;
            modal.classList.add('visible');
            textarea.focus();

            if (typeof uiManager.updateWordCount === 'function') {
                uiManager.updateWordCount(textarea.value);
            }
        } catch (error) {
            window.Logger.error('UI', 'Error opening fullscreen editor:', error);
        }
    };

    // Wait for DOM and initialize
    const cleanupLegacyArtifacts = () => {
        try {
            const legacyHost = document.getElementById('gvp-shadow-host');
            if (legacyHost) {
                legacyHost.remove();
                window.Logger.debug('Init', 'Removed legacy shadow host prior to re-init');
            }

            const orphanBottomBar = document.getElementById('gvp-bottom-bar');
            if (orphanBottomBar && !orphanBottomBar.closest('#gvp-shadow-host')) {
                orphanBottomBar.remove();
                window.Logger.debug('Init', 'Removed orphaned bottom bar prior to re-init');
            }
        } catch (error) {
            window.Logger.warn('Init', 'Cleanup step failed:', error);
        }
    };

    const waitForDOM = () => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                window.Logger.info('Init', 'DOM ready, initializing app...');
                cleanupLegacyArtifacts();
                const app = new GrokVideoPrompterApp();
                app.initialize();
            });
        } else {
            window.Logger.info('Init', 'DOM already ready, initializing app...');
            cleanupLegacyArtifacts();
            const app = new GrokVideoPrompterApp();
            app.initialize();
        }
    };

    // Start initialization
    waitForDOM();

})();
