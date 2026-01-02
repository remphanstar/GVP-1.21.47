// a:\Tools n Programs\SD-GrokScripts\grok-video-prompter-extension\src\content\managers\ui\UIGenerationRailManager.js
// Manages the Generation Rail UI for monitoring ALL video generations in real-time.
// Dependencies: UIManager (parent), StateManager (thumbnail lookup)

/**
 * UIGenerationRailManager (v1.21.48 - Standalone Toggle)
 * 
 * Displays a horizontal rail at the top of the page when Rail toggle is enabled.
 * Each generation is represented by a thumbnail with a colored border indicating status.
 * Now monitors ALL video generations from any source (Spicy, Upload, Generate Raw/JSON).
 */
class UIGenerationRailManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.stateManager = uiManager?.stateManager || window.gvpStateManager;

        /** @type {HTMLElement|null} */
        this.railContainer = null;

        /** @type {Map<string, HTMLElement>} videoId -> rail item element */
        this.railItems = new Map();

        /** @type {boolean} */
        this.isVisible = false;

        this._boundHandleRailToggle = this._handleRailToggle.bind(this);
        this._boundHandleRailProgress = this._handleRailProgress.bind(this);

        this._init();
    }

    _init() {
        this._createRailContainer();
        this._attachEventListeners();
        // Reduced logging - only log once on init
        console.log('[GVP Rail] UIGenerationRailManager initialized');
    }

    _createRailContainer() {
        // Create the rail container (fixed at top, full width)
        this.railContainer = document.createElement('div');
        this.railContainer.id = 'gvp-generation-rail';
        this.railContainer.className = 'gvp-generation-rail';

        // Apply inline styles for now (will be moved to stylesheet.js)
        // z-index 9999 puts rail BEHIND GVP extension (which uses 999999+) but ABOVE Grok page
        Object.assign(this.railContainer.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            zIndex: '9999', // Lower than GVP extension - rail appears behind buttons
            display: 'none', // Hidden by default
            flexWrap: 'wrap',
            gap: '8px',
            padding: '8px 12px',
            background: 'linear-gradient(180deg, rgba(20,20,20,0.95) 0%, rgba(20,20,20,0.85) 100%)',
            borderBottom: '1px solid #333',
            backdropFilter: 'blur(8px)',
            minHeight: '56px',
            alignItems: 'center'
        });

        document.body.appendChild(this.railContainer);
    }

    _attachEventListeners() {
        // Listen for Rail toggle changes (v1.21.48 - decoupled from Quick Mode)
        window.addEventListener('gvp:rail-toggle-changed', this._boundHandleRailToggle);

        // Listen for rail progress updates from NetworkInterceptor
        window.addEventListener('gvp:rail-progress', this._boundHandleRailProgress);
    }

    /**
     * Handle Rail toggle state change (v1.21.48)
     * @param {CustomEvent} event - Contains { enabled: boolean }
     */
    _handleRailToggle(event) {
        const enabled = event.detail?.enabled;
        console.log('[GVP Rail] Toggle changed:', enabled);

        if (enabled) {
            this.show();
        } else {
            this.hide();
            // Note: Items are preserved when toggle is disabled (per user preference)
        }
    }

    _handleRailProgress(event) {
        const { videoId, imageId, parentPostId, progress, moderated, thumbnailUrl } = event.detail || {};

        // Debug: log every event received
        console.log('[GVP Rail] 📡 Progress event received:', {
            videoId,
            imageId,
            parentPostId,
            progress,
            moderated,
            thumbnailUrl: thumbnailUrl?.substring(0, 50) + '...',
            isRailVisible: this.isVisible,
            railItemCount: this.railItems.size
        });

        if (!videoId) {
            console.warn('[GVP Rail] Received progress event without videoId');
            return;
        }

        // Create or update rail item
        let item = this.railItems.get(videoId);
        if (!item) {
            console.log('[GVP Rail] ✨ Creating new rail item for:', videoId);
            // Pass parentPostId for navigation
            item = this._createRailItem(videoId, imageId, parentPostId, thumbnailUrl);
            this.railItems.set(videoId, item);
            this.railContainer.appendChild(item);
        }

        // Update status border
        this._updateItemStatus(item, progress, moderated);
    }

    _createRailItem(videoId, imageId, parentPostId, thumbnailUrl) {
        const item = document.createElement('div');
        item.className = 'gvp-rail-item';
        item.dataset.videoId = videoId;
        item.dataset.imageId = imageId || '';
        // Store parentPostId for navigation (this is the correct ID for /imagine/post/{id})
        item.dataset.parentPostId = parentPostId || imageId || '';

        // Apply inline styles
        Object.assign(item.style, {
            width: '48px',
            height: '48px',
            borderRadius: '6px',
            border: '3px solid #555', // Grey = pending
            overflow: 'hidden',
            cursor: 'pointer',
            transition: 'border-color 0.3s ease, transform 0.1s ease',
            background: '#222'
        });

        // Create thumbnail image
        const img = document.createElement('img');
        img.className = 'gvp-rail-thumb';
        Object.assign(img.style, {
            width: '100%',
            height: '100%',
            objectFit: 'cover'
        });

        // Resolve thumbnail URL
        const resolvedUrl = this._resolveThumbnailUrl(thumbnailUrl, imageId);
        if (resolvedUrl) {
            img.src = resolvedUrl;
        } else {
            // Grey placeholder
            img.style.background = '#444';
        }

        img.onerror = () => {
            img.style.display = 'none';
            item.style.background = '#444';
        };

        item.appendChild(img);

        // Click handler - navigate to post (with stopPropagation to prevent Quick Raw trigger)
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            // Use parentPostId for /imagine/post/{id} navigation (same as History tab)
            const navId = item.dataset.parentPostId || item.dataset.imageId || videoId;
            this._snapToPost(navId);
        });

        // Hover effect
        item.addEventListener('mouseenter', () => {
            item.style.transform = 'scale(1.1)';
        });
        item.addEventListener('mouseleave', () => {
            item.style.transform = 'scale(1)';
        });

        return item;
    }

    _resolveThumbnailUrl(providedUrl, imageId) {
        // 1. Use provided URL if available
        if (providedUrl && typeof providedUrl === 'string' && providedUrl.startsWith('http')) {
            return providedUrl;
        }

        // 2. Try to get from unifiedVideoHistory via StateManager
        if (imageId && this.stateManager) {
            try {
                const entry = this.stateManager.getUnifiedHistoryEntry?.(imageId);
                if (entry?.thumbnailUrl) {
                    return entry.thumbnailUrl;
                }
            } catch (e) {
                console.debug('[GVP Rail] Failed to get thumbnail from history:', e);
            }
        }

        // 3. Fallback: null (will show grey placeholder)
        return null;
    }

    _updateItemStatus(item, progress, moderated) {
        if (!item) return;

        // Status border logic:
        // Grey: progress < 100 (generating)
        // Green: progress === 100 && moderated === false (success)
        // Red: moderated === true (flagged, regardless of progress)

        if (moderated === true) {
            item.style.borderColor = '#ef4444'; // Red - moderated
        } else if (progress >= 100) {
            item.style.borderColor = '#22c55e'; // Green - success
        } else {
            item.style.borderColor = '#555'; // Grey - pending
        }
    }

    _snapToPost(postId) {
        if (!postId) return;

        const targetUrl = `/imagine/post/${postId}`;
        console.log('[GVP Rail] Snapping to:', targetUrl);

        // Dispatch event to temporarily disable Quick Raw/JSON before navigation
        // This prevents the click from triggering a new video generation
        document.dispatchEvent(new CustomEvent('gvp:rail-navigation', {
            detail: { postId, url: targetUrl }
        }));

        // Small delay to allow listeners to process before navigation
        setTimeout(() => {
            // Use history.pushState + popstate event for SPA navigation
            window.history.pushState({}, '', targetUrl);
            window.dispatchEvent(new PopStateEvent('popstate'));
        }, 50);
    }

    show() {
        if (this.isVisible) return;
        this.isVisible = true;
        this.railContainer.style.display = 'flex';
        // Reduced logging
    }

    hide() {
        if (!this.isVisible) return;
        this.isVisible = false;
        this.railContainer.style.display = 'none';
        // Reduced logging
    }

    /**
     * Clear all items from the rail (useful when mode changes)
     */
    clear() {
        this.railItems.forEach((item) => item.remove());
        this.railItems.clear();
        console.log('[GVP Rail] Rail cleared');
    }

    /**
     * Cleanup method
     */
    destroy() {
        window.removeEventListener('gvp:rail-toggle-changed', this._boundHandleRailToggle);
        window.removeEventListener('gvp:rail-progress', this._boundHandleRailProgress);
        this.railContainer?.remove();
        this.railItems.clear();
        console.log('[GVP Rail] UIGenerationRailManager destroyed');
    }
}

// Export for use in UIManager
window.UIGenerationRailManager = UIGenerationRailManager;
