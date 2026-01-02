// a:/Tools n Programs/SD-GrokScripts/grok-video-prompter-extension/src/content/managers/AuroraManager.js
// Manages Aurora auto-injection functionality.
// Dependencies: StateManager

window.AuroraManager = class AuroraManager {
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.CACHE_KEYS = {
            portrait: 'gvp_aurora_file_id_portrait',
            landscape: 'gvp_aurora_file_id_landscape',
            square: 'gvp_aurora_file_id_square'
        };
    }

    /**
     * Get cached file ID for aspect ratio
     * @param {string} type - 'portrait', 'landscape', or 'square'
     * @returns {string|null} Cached file ID or null
     */
    getCachedFileId(type) {
        window.Logger.debug('Aurora', `🔍 getCachedFileId called for type: ${type}`);
        window.Logger.debug('Aurora', `🔑 Cache key: ${this.CACHE_KEYS[type]}`);

        // Use Chrome storage instead of localStorage
        return new Promise((resolve) => {
            chrome.storage.local.get([this.CACHE_KEYS[type]], (result) => {
                try {
                    window.Logger.debug('Aurora', `📥 Storage result for ${type}:`, result);
                    const cached = result[this.CACHE_KEYS[type]];

                    if (cached) {
                        const { id, timestamp } = cached;
                        const settings = this.stateManager.getState().settings;
                        const expiryTime = settings.auroraCacheExpiry || 30 * 60 * 1000;
                        const age = Date.now() - timestamp;

                        window.Logger.debug('Aurora', `📦 Found cached entry:`, {
                            id,
                            timestamp: new Date(timestamp).toISOString(),
                            age: `${Math.floor(age / 1000)}s`,
                            expiryTime: `${Math.floor(expiryTime / 1000)}s`,
                            isExpired: age >= expiryTime
                        });

                        if (age < expiryTime) {
                            window.Logger.info('Aurora', `✅ Using cached ${type} file ID:`, id);
                            resolve(id);
                            return;
                        } else {
                            window.Logger.debug('Aurora', `⏰ Cache expired for ${type}, will re-upload`);
                        }
                    } else {
                        window.Logger.debug('Aurora', `📭 No cached entry found for ${type}`);
                    }
                    resolve(null);
                } catch (error) {
                    window.Logger.error('Aurora', '❌ Cache retrieval error', error);
                    resolve(null);
                }
            });
        });
    }

    /**
     * Cache file ID for aspect ratio
     * @param {string} type - 'portrait', 'landscape', or 'square'
     * @param {string} id - File ID to cache
     */
    cacheFileId(type, id) {
        try {
            const data = { id, timestamp: Date.now() };
            chrome.storage.local.set({ [this.CACHE_KEYS[type]]: data }, () => {
                if (chrome.runtime.lastError) {
                    window.Logger.error('Aurora', 'Cache storage error', chrome.runtime.lastError);
                } else {
                    window.Logger.debug('Aurora', `Cached ${type} file ID:`, id);
                }
            });
        } catch (error) {
            window.Logger.error('Aurora', 'Cache storage error', error);
        }
    }

    /**
     * Generate UUID for request headers
     * @returns {string} UUID v4
     */
    generateUuid() {
        return crypto.randomUUID();
    }

    /**
     * Upload blank PNG to Grok
     * @param {string} type - 'portrait', 'landscape', or 'square'
     * @param {object} commonHeaders - Common HTTP headers
     * @returns {Promise<string|null>} File ID or null on failure
     */
    async uploadBlankPNG(type, commonHeaders = {}) {
        window.Logger.debug('Aurora', `🔼 uploadBlankPNG called for type: ${type}`);
        const settings = this.stateManager.getState().settings;

        // Get base64 from settings
        let base64;
        switch (type) {
            case 'portrait':
                base64 = settings.auroraBlankPngPortrait;
                break;
            case 'landscape':
                base64 = settings.auroraBlankPngLandscape;
                break;
            default:
                base64 = settings.auroraBlankPngSquare;
        }

        window.Logger.debug('Aurora', `📄 Base64 PNG for ${type}:`, {
            hasBase64: !!base64,
            length: base64?.length || 0,
            preview: base64 ? base64.substring(0, 50) + '...' : 'none'
        });

        if (!base64) {
            window.Logger.error('Aurora', `❌ No base64 configured for ${type} - cannot upload`);
            return null;
        }

        window.Logger.info('Aurora', `🔼 Starting ${type} blank PNG upload`);

        const uploadHeaders = {
            'Content-Type': 'application/json',
            'x-xai-request-id': this.generateUuid(),
            ...commonHeaders
        };

        // Upload attempt with retry
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const response = await fetch('https://grok.com/rest/app-chat/upload-file', {
                    method: 'POST',
                    headers: uploadHeaders,
                    body: JSON.stringify({
                        fileName: `blank_${type}.png`,
                        fileMimeType: 'image/png',
                        content: base64
                    })
                });

                if (!response.ok) {
                    throw new Error(`Upload failed: ${response.status}`);
                }

                const result = await response.json();
                const fileId = result.fileMetadataId;

                window.Logger.info('Aurora', `✅ Upload success, ${type} file ID:`, fileId);
                this.cacheFileId(type, fileId);
                return fileId;

            } catch (error) {
                window.Logger.error('Aurora', `Upload attempt ${attempt + 1} failed for ${type}`, error);
                if (attempt === 1) {
                    return null; // Final attempt failed
                }
            }
        }

        return null;
    }

    /**
     * Detect aspect ratio from message content
     * Only auto-detects when selectedType is 'square'
     * @param {string} message - User message
     * @returns {string} Detected aspect ratio
     */
    detectAspectRatio(message) {
        const settings = this.stateManager.getState().settings;
        let type = settings.auroraAspectRatio || 'square';

        window.Logger.debug('Aurora', '🔍 detectAspectRatio - Initial type from settings:', type);

        // Only auto-detect if user selected 'square' (neutral default)
        if (type === 'square') {
            const lowerMessage = message.toLowerCase();
            window.Logger.debug('Aurora', '🔍 Auto-detecting from message (type is square)');

            if (lowerMessage.includes('portrait') || lowerMessage.includes('vertical')) {
                type = 'portrait';
                window.Logger.info('Aurora', '📐 Auto-detected: portrait (found "portrait" or "vertical")');
            } else if (lowerMessage.includes('landscape') || lowerMessage.includes('horizontal')) {
                type = 'landscape';
                window.Logger.info('Aurora', '📐 Auto-detected: landscape (found "landscape" or "horizontal")');
            } else {
                window.Logger.debug('Aurora', '📐 No keywords found, staying with square');
            }
        } else {
            window.Logger.debug('Aurora', '📐 User explicitly selected:', type, '- respecting choice (no auto-detect)');
        }

        return type;
    }

    /**
     * Inject Aurora file attachment into request body
     * Only injects when enableImageGeneration is already true
     * @param {object} body - Request body
     * @param {object} commonHeaders - Common headers for upload
     * @returns {Promise<object>} Modified body or original on failure
     */
    async injectAuroraAttachment(body, commonHeaders) {
        window.Logger.debug('Aurora', '🔍 injectAuroraAttachment called');
        window.Logger.debug('Aurora', '📦 Request body:', JSON.stringify(body, null, 2));

        const settings = this.stateManager.getState().settings;
        window.Logger.debug('Aurora', '⚙️ Settings:', {
            auroraEnabled: settings.auroraEnabled,
            auroraAspectRatio: settings.auroraAspectRatio,
            hasPortraitPng: !!settings.auroraBlankPngPortrait,
            hasLandscapePng: !!settings.auroraBlankPngLandscape,
            hasSquarePng: !!settings.auroraBlankPngSquare
        });

        // Check if Aurora is enabled
        if (!settings.auroraEnabled) {
            window.Logger.info('Aurora', '❌ Aurora disabled in settings');
            return body;
        }

        // Only inject when enableImageGeneration is ALREADY true AND no existing attachments
        window.Logger.debug('Aurora', '🔍 Checking conditions:', {
            enableImageGeneration: body.enableImageGeneration,
            hasFileAttachments: body.fileAttachments && body.fileAttachments.length > 0,
            fileAttachmentsCount: body.fileAttachments?.length || 0
        });

        if (!body.enableImageGeneration || (body.fileAttachments && body.fileAttachments.length > 0)) {
            window.Logger.info('Aurora', '⏭️ Skipping injection - conditions not met');
            return body;
        }

        window.Logger.info('Aurora', '🎨 Injecting Aurora file attachment');

        // Detect aspect ratio (auto-detects only if type is 'square')
        window.Logger.debug('Aurora', '🔍 Detecting aspect ratio from message:', body.message);
        const aspectType = this.detectAspectRatio(body.message);
        window.Logger.debug('Aurora', `📐 Selected aspect: ${aspectType}`);

        // Get or upload file ID
        window.Logger.debug('Aurora', `🔍 Looking for cached file ID for ${aspectType}...`);
        let fileId = await this.getCachedFileId(aspectType);

        if (!fileId) {
            window.Logger.info('Aurora', `⚠️ No cached file ID found, uploading new ${aspectType} PNG...`);
            fileId = await this.uploadBlankPNG(aspectType, commonHeaders);
        } else {
            window.Logger.info('Aurora', `✅ Using cached file ID: ${fileId}`);
        }

        if (!fileId) {
            window.Logger.error('Aurora', '❌ Failed to obtain file ID - Aurora injection aborted');
            return body;
        }

        // Inject file attachment
        window.Logger.debug('Aurora', `💉 Injecting file attachment: ${fileId}`);
        body.fileAttachments = [fileId];

        // Always add edit intent prefix unless message already contains edit keywords
        const lowerMessage = body.message.toLowerCase();
        const hasEditIntent = lowerMessage.includes('edit') ||
            lowerMessage.includes('modify') ||
            lowerMessage.includes('change');

        window.Logger.debug('Aurora', '🔍 Checking for edit intent keywords:', { hasEditIntent });

        if (!hasEditIntent) {
            const originalMessage = body.message;
            body.message = `Edit this image to show: ${body.message}`;
            window.Logger.info('Aurora', '✏️ Added edit intent prefix', {
                original: originalMessage,
                modified: body.message
            });
        } else {
            window.Logger.debug('Aurora', 'ℹ️ Message already has edit intent, no prefix needed');
        }

        window.Logger.info('Aurora', '✅ Aurora injection complete');
        window.Logger.debug('Aurora', '📦 Modified body:', JSON.stringify(body, null, 2));
        return body;
    }

    /**
     * Clear all cached file IDs
     */
    clearCache() {
        Object.values(this.CACHE_KEYS).forEach(key => {
            chrome.storage.local.remove([key], () => {
                if (chrome.runtime.lastError) {
                    window.Logger.error('Aurora', 'Cache clear error', chrome.runtime.lastError);
                }
            });
        });
        window.Logger.info('Aurora', 'Cache cleared');
    }
};
