
// a:/Tools n Programs/SD-GrokScripts/grok-video-prompter-extension/src/content/managers/NetworkInterceptor.js
// Intercepts network requests to inject data and monitor responses.
// Dependencies: StateManager, ReactAutomation, AutomaticRetryManager, AuroraManager, ModerationDetector

window.NetworkInterceptor = class NetworkInterceptor {
    constructor(stateManager, reactAutomation, uploadAutomationManager) {
        // GVP MODIFICATION: Enhanced lifecycle logging
        window.Logger.debug('NetworkInterceptor', '🚀 Constructor fired');

        this.stateManager = stateManager;
        this.reactAutomation = reactAutomation;
        this.uploadAutomationManager = uploadAutomationManager || null;
        this.originalFetch = null;
        // Initialize retry manager
        this.retryManager = new AutomaticRetryManager(stateManager, reactAutomation);
        // NEW: Initialize Aurora manager
        this.auroraManager = new AuroraManager(stateManager);
        this.commonHeaders = {}; // Track headers for Aurora uploads
        this._hasLoggedGallerySchema = false;
        this._pageInterceptorActive = false;
        this._bridgeMetadataByVideoId = new Map();
        this._bridgeRequestsById = new Map();
        this._pendingUpload = null;

        // GVP MODIFICATION: Track initialization state
        this._isInitialized = false;
        this._multiGenHistoryEnabled = typeof this.stateManager?.createMultiGenAttempt === 'function';
        this._multiGenRequestSequence = 0;
        this._fetchWrapper = null;
        this._fetchOverrideInstalled = false;
        window.Logger.debug('NetworkInterceptor', '✅ Constructor completed');
    }

    // GVP MODIFICATION: Explicit initialize method with verification
    initialize() {
        window.Logger.debug('NetworkInterceptor', '🔧 Starting initialization...');

        // Enhanced fetch override installation
        this._installFetchOverride();
        this._isInitialized = true;

        window.Logger.debug('NetworkInterceptor', '✅ Initialization complete - fetch override installed');
        return true;
    }

    /**
     * Proactively fetch ALL gallery/favorites data in one bulk API call
     * Uses limit:5000 to get everything at once, avoiding repeated scroll-based fetches
     * @param {string} accountId - The account ID to sync
     * @param {string} source - 'favorites' or 'gallery' (determines filter type)
     * @returns {Promise<{success: boolean, count: number, error?: string}>}
     */
    async triggerBulkGallerySync(accountId, source = 'favorites') {
        if (!accountId) {
            window.Logger.error('BulkSync', 'No accountId provided');
            return { success: false, count: 0, error: 'No accountId' };
        }

        // Skip if already synced
        if (this.stateManager?.isAccountSyncComplete?.(accountId)) {
            window.Logger.info('BulkSync', `Account ${accountId.slice(0, 8)}... already synced, skipping`);
            return { success: true, count: 0, error: 'Already synced' };
        }

        window.Logger.info('BulkSync', `🚀 Starting bulk gallery sync for ${accountId.slice(0, 8)}...`);

        // Build the filter based on source
        const filter = source === 'favorites'
            ? { source: 'MEDIA_POST_SOURCE_LIKED' }
            : { source: 'MEDIA_POST_SOURCE_OWNED' };

        const requestBody = {
            limit: 5000,  // Fetch ALL posts at once
            filter: filter
        };

        try {
            // Use originalFetch to bypass interceptor - we handle the response here directly
            const fetchFn = this.originalFetch || fetch;
            const response = await fetchFn.call(window, 'https://grok.com/rest/media/post/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
                credentials: 'include' // Include cookies for auth
            });

            if (!response.ok) {
                window.Logger.error('BulkSync', `API returned ${response.status}`);
                return { success: false, count: 0, error: `HTTP ${response.status}` };
            }

            const data = await response.json();
            const posts = data?.posts || data?.result?.posts || [];

            if (!Array.isArray(posts)) {
                window.Logger.error('BulkSync', 'Invalid response structure');
                return { success: false, count: 0, error: 'Invalid response' };
            }

            window.Logger.info('BulkSync', `📦 Received ${posts.length} posts, ingesting...`);

            // Ingest into unified history
            if (posts.length > 0) {
                await this._ingestListToUnified(posts);
            }

            // Mark sync as complete for this account (with counts for debugging)
            this.stateManager?.markAccountSyncComplete?.(accountId, posts.length, 0);

            window.Logger.info('BulkSync', `✅ Bulk sync complete: ${posts.length} posts ingested`);
            return { success: true, count: posts.length };

        } catch (error) {
            window.Logger.error('BulkSync', 'Fetch error', error);
            return { success: false, count: 0, error: error.message };
        }
    }

    _extractUuid(value) {
        if (!value || typeof value !== 'string') {
            return null;
        }
        const match = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        return match ? match[0] : null;
    }

    _getNested(obj, path = []) {
        let current = obj;
        for (const key of path) {
            if (!current || typeof current !== 'object') {
                return null;
            }
            current = current[key];
        }
        return current;
    }

    _extractUrlFromString(str) {
        if (!str || typeof str !== 'string') {
            return null;
        }
        const matches = str.match(/https?:\/\/[^\s"'<>]+/gi);
        if (!matches || !matches.length) {
            return null;
        }
        const preferred = matches.find(url => /\/content\b/i.test(url)) ||
            matches.find(url => /assets\.grok\.com/i.test(url)) ||
            matches.find(url => /imagine-public\./i.test(url));
        return preferred || matches[0];
    }

    _extractThumbnailUrl(payload) {
        if (!payload) {
            return null;
        }

        if (typeof payload === 'string') {
            return this._extractUrlFromString(payload);
        }

        const candidates = new Set();
        const consider = (value) => {
            if (!value) return;
            if (typeof value === 'string') {
                const url = this._extractUrlFromString(value) || value;
                if (url && typeof url === 'string') {
                    candidates.add(url.trim());
                }
            }
        };

        consider(payload.thumbnailUrl);
        consider(payload.imageUrl);
        consider(payload.mediaUrl);
        consider(payload.previewUrl);
        consider(payload.contentUrl);
        consider(payload.url);
        consider(payload.referenceUrl);

        if (typeof payload.message === 'string') {
            consider(payload.message);
        }
        if (typeof payload.prompt === 'string') {
            consider(payload.prompt);
        }

        consider(this._getNested(payload, [
            'responseMetadata',
            'modelConfigOverride',
            'modelMap',
            'videoGenModelConfig',
            'imageReference'
        ]));

        const arraySources = [
            payload.imageUrls,
            payload.mediaUrls,
            payload.previewUrls,
            payload.fileAttachments,
            payload.fileUris,
            payload.attachments
        ];

        arraySources.forEach((collection) => {
            if (!Array.isArray(collection)) {
                return;
            }
            collection.forEach((item) => {
                if (typeof item === 'string') {
                    consider(item);
                } else if (item && typeof item === 'object') {
                    consider(item.url || item.uri || item.href || '');
                }
            });
        });

        if (!candidates.size) {
            return null;
        }

        const ordered = Array.from(candidates);
        const preferred = ordered.find(url => /\/content\b/i.test(url)) ||
            ordered.find(url => /assets\.grok\.com/i.test(url)) ||
            ordered.find(url => /imagine-public\./i.test(url));
        return preferred || ordered[0] || null;
    }

    _extractImageIdFromPayload(payload) {
        if (!payload) {
            return null;
        }

        if (typeof payload === 'string') {
            return this._extractUuid(payload);
        }

        const candidatePaths = [
            ['responseMetadata', 'modelConfigOverride', 'modelMap', 'videoGenModelConfig', 'parentPostId'],
            ['responseMetadata', 'modelConfigOverride', 'modelMap', 'videoGenModelConfig', 'inputImagePostId'],
            ['responseMetadata', 'modelConfigOverride', 'modelMap', 'videoGenModelConfig', 'imagePostId'],
            ['responseMetadata', 'modelConfigOverride', 'modelMap', 'videoGenModelConfig', 'assetId'],
            ['responseMetadata', 'modelConfigOverride', 'modelMap', 'videoGenModelConfig', 'sourcePostId'],
            ['responseMetadata', 'modelConfigOverride', 'imagePostId'],
            ['responseMetadata', 'parentPostId'],
            ['modelConfigOverride', 'modelMap', 'videoGenModelConfig', 'parentPostId'],
            ['modelConfigOverride', 'videoGenModelConfig', 'parentPostId'],
            ['modelConfigOverride', 'videoGenModelConfig', 'imagePostId'],
            ['modelConfigOverride', 'parentPostId'],
            ['parentPostId'],
            ['imageId'],
            ['assetId'],
            ['originalPostId'],
            ['postId'],
            ['selectedImageId']
        ];

        for (const path of candidatePaths) {
            const value = this._getNested(payload, path);
            const uuid = this._extractUuid(value);
            if (uuid) {
                return uuid;
            }
        }

        const attachments = [
            payload.fileAttachments,
            payload.fileAttachmentsMetadata,
            payload.imageReferences,
            payload.attachments
        ];

        for (const list of attachments) {
            if (!Array.isArray(list)) continue;
            for (const entry of list) {
                if (typeof entry === 'string') {
                    const uuid = this._extractUuid(entry);
                    if (uuid) return uuid;
                } else if (entry && typeof entry === 'object') {
                    const uuid = this._extractUuid(entry.id) ||
                        this._extractUuid(entry.postId) ||
                        this._extractUuid(entry.assetId) ||
                        this._extractUuid(entry.imageId) ||
                        this._extractUuid(entry.url) ||
                        this._extractUuid(entry.uri);
                    if (uuid) return uuid;
                }
            }
        }

        const textFields = [
            payload.message,
            payload.prompt,
            payload.input,
            payload.body,
            payload.query
        ];

        for (const field of textFields) {
            const uuid = this._extractUuid(field);
            if (uuid) {
                return uuid;
            }
        }

        return null;
    }

    _cleanupPromptText(raw) {
        if (!raw || typeof raw !== 'string') {
            return '';
        }
        let text = raw.trim();
        if (!text) {
            return '';
        }
        const urls = text.match(/https?:\/\/[^\s"'<>]+/gi);
        if (urls) {
            urls.forEach((url) => {
                text = text.replace(url, ' ');
            });
        }
        return text.replace(/\s{2,}/g, ' ').trim();
    }

    _extractPromptText(payload, fallback = '') {
        if (!payload) {
            return fallback;
        }

        if (typeof payload === 'string') {
            const cleaned = this._cleanupPromptText(payload);
            return cleaned || fallback;
        }

        if (typeof payload.message === 'string') {
            const cleaned = this._cleanupPromptText(payload.message);
            if (cleaned) return cleaned;
        }

        if (Array.isArray(payload.messages)) {
            for (let index = payload.messages.length - 1; index >= 0; index -= 1) {
                const message = payload.messages[index];
                if (typeof message === 'string') {
                    const cleaned = this._cleanupPromptText(message);
                    if (cleaned) return cleaned;
                } else if (message && typeof message === 'object' && typeof message.content === 'string') {
                    const cleaned = this._cleanupPromptText(message.content);
                    if (cleaned) return cleaned;
                }
            }
        }

        if (typeof payload.prompt === 'string') {
            const cleaned = this._cleanupPromptText(payload.prompt);
            if (cleaned) return cleaned;
        }

        if (typeof payload.input === 'string') {
            const cleaned = this._cleanupPromptText(payload.input);
            if (cleaned) return cleaned;
        }

        return fallback;
    }

    _normalizeAssetUrl(url) {
        if (!url || typeof url !== 'string') {
            return null;
        }
        const trimmed = url.trim();
        if (!trimmed) {
            return null;
        }
        if (/^https?:\/\//i.test(trimmed)) {
            return trimmed;
        }
        return `https://assets.grok.com/${trimmed.replace(/^\/+/, '')}`;
    }

    _coerceProgressValue(rawValue) {
        if (rawValue === null || rawValue === undefined) {
            return null;
        }

        if (typeof rawValue === 'number') {
            return Number.isFinite(rawValue) ? Math.max(0, Math.min(100, rawValue)) : null;
        }

        if (typeof rawValue === 'string') {
            const trimmed = rawValue.trim();
            if (!trimmed) {
                return null;
            }
            const withoutPercent = trimmed.endsWith('%') ? trimmed.slice(0, -1) : trimmed;
            const normalized = withoutPercent.replace(/[^0-9.+-]/g, '');
            if (!normalized) {
                return null;
            }
            const parsed = parseFloat(normalized);
            if (!Number.isFinite(parsed)) {
                return null;
            }
            return Math.max(0, Math.min(100, parsed));
        }

        if (typeof rawValue === 'object' && rawValue !== null) {
            if (typeof rawValue.progress === 'number' || typeof rawValue.value === 'number') {
                return this._coerceProgressValue(rawValue.progress ?? rawValue.value);
            }
            if (typeof rawValue.progress === 'string' || typeof rawValue.value === 'string') {
                return this._coerceProgressValue(rawValue.progress ?? rawValue.value);
            }
        }

        return null;
    }

    _generateRequestId(prefix = 'req') {
        this._multiGenRequestSequence += 1;
        return `${prefix}_${Date.now()}_${this._multiGenRequestSequence.toString(16)}`;
    }

    _handleImageContentRequest(requestUrl) {
        if (!this._multiGenHistoryEnabled || !requestUrl || typeof requestUrl !== 'string') {
            return;
        }

        const match = requestUrl.match(/\/users\/([0-9a-f-]+)\/([0-9a-f-]+)\/content/i);
        if (!match) {
            return;
        }

        const [, accountId, imageId] = match;
        const thumbnailUrl = requestUrl.split('?')[0];

        try {
            if (accountId) {
                this._setActiveAccount(accountId, 'image-content');
            }
            this.stateManager.ensureMultiGenImageEntry(accountId, imageId, thumbnailUrl);
            this.stateManager.setLastMultiGenImage(accountId, imageId);
        } catch (error) {
            window.Logger.error('Interceptor', 'Failed to track image content request', {
                accountId,
                imageId,
                error
            });
        }
    }

    _safeParseJson(text) {
        if (!text || typeof text !== 'string') {
            return null;
        }
        try {
            return JSON.parse(text);
        } catch (error) {
            window.Logger.debug('Interceptor', 'Failed to parse JSON text', error);
            return null;
        }
    }

    _safeStringify(data) {
        if (!data) {
            return null;
        }
        try {
            return JSON.stringify(data);
        } catch (error) {
            window.Logger.debug('Interceptor', 'Failed to stringify snapshot', error);
            return null;
        }
    }

    async _readRequestPayload(requestInfo, requestInit = {}) {
        const result = {
            rawText: null,
            json: null
        };

        try {
            if (typeof requestInit.body === 'string') {
                result.rawText = requestInit.body;
            } else if (requestInit.body instanceof URLSearchParams) {
                result.rawText = requestInit.body.toString();
            } else if (requestInit.body && typeof requestInit.body === 'object' && typeof requestInit.body.text === 'function') {
                result.rawText = await requestInit.body.text();
            } else if (requestInfo instanceof Request) {
                try {
                    const clone = requestInfo.clone();
                    result.rawText = await clone.text();
                } catch (cloneError) {
                    window.Logger.debug('Interceptor', 'Unable to clone request for payload extraction', cloneError);
                }
            }
        } catch (error) {
            window.Logger.warn('Interceptor', 'Failed reading request payload', error);
        }

        if (result.rawText && result.rawText.trim()) {
            const parsed = this._safeParseJson(result.rawText.trim());
            if (parsed && typeof parsed === 'object') {
                result.json = parsed;
            }
        }

        return result;
    }

    _captureMultiGenRequestContext({ requestUrl, method, payloadInfo, headers, requestId: requestIdOverride }) {
        window.Logger.debug('Interceptor', '🕵️ _captureMultiGenRequestContext checking...', { requestUrl, method, enabled: this._multiGenHistoryEnabled });
        if (!this._multiGenHistoryEnabled) {
            return null;
        }
        if (method !== 'POST' || !requestUrl || typeof requestUrl !== 'string') {
            return null;
        }
        if (!requestUrl.includes('/rest/app-chat/conversations/new')) {
            return null;
        }

        const payload = payloadInfo?.json || this._safeParseJson(payloadInfo?.rawText || '') || null;
        if (!payload) {
            window.Logger.warn('Interceptor', 'Multi-gen capture proceeding without parsed payload');
        }

        let accountId = this._extractAccountIdFromPayload(payload);
        if (!accountId && typeof payloadInfo?.rawText === 'string') {
            accountId = this._extractAccountIdFromString(payloadInfo.rawText);
        }
        let thumbnailUrl = this._extractThumbnailUrl(payload);
        if (!accountId && thumbnailUrl) {
            accountId = this._extractAccountIdFromString(thumbnailUrl);
        }
        const pendingUpload = this._pendingUpload || null;
        if (pendingUpload) {
            this._pendingUpload = null;
        }
        if (!accountId && pendingUpload?.accountId) {
            accountId = pendingUpload.accountId;
        }
        if (!thumbnailUrl && pendingUpload?.fileUri) {
            thumbnailUrl = this._normalizeAssetUrl(pendingUpload.fileUri);
        }

        // FALLBACK: Try to get active account from StateManager if extraction failed
        if (!accountId && this.stateManager?.getActiveMultiGenAccount) {
            accountId = this.stateManager.getActiveMultiGenAccount();
            if (accountId) {
                window.Logger.info('Interceptor', 'ℹ️ Using active account from StateManager as fallback', accountId);
            }
        }

        if (!accountId) {
            window.Logger.error('Interceptor', '❌ ACCOUNT ID EXTRACTION FAILED', {
                requestUrl,
                hasPayload: !!payload,
                hasThumbnail: !!thumbnailUrl,
                thumbnailUrl: thumbnailUrl,
                payloadPreview: typeof payloadInfo?.rawText === 'string' ? payloadInfo.rawText.substring(0, 300) : 'NO PAYLOAD',
                pendingUpload: pendingUpload,
                stateManagerActive: this.stateManager?.getActiveMultiGenAccount?.()
            });
            return null;
        }
        this._setActiveAccount(accountId, 'conversation-request');

        let imageId = this._extractImageIdFromPayload(payload);
        if (!imageId && accountId) {
            imageId = this.stateManager.getLastMultiGenImage(accountId);
        }
        if (!imageId && pendingUpload?.imageId) {
            imageId = pendingUpload.imageId;
        }

        // FALLBACK: Extract from current page URL for Image Edit mode
        // URLs like /imagine/post/{imageId} contain the imageId
        if (!imageId) {
            const currentUrl = window.location.href;
            const postMatch = currentUrl.match(/\/imagine\/post\/([a-f0-9-]{36})/i);
            if (postMatch && postMatch[1]) {
                imageId = postMatch[1];
                window.Logger.info('Interceptor', 'ℹ️ Extracted imageId from page URL:', imageId);
            }
        }

        if (!imageId) {
            window.Logger.warn('Interceptor', 'Multi-gen capture skipped: unable to resolve image id');
            return null;
        }

        const requestId = requestIdOverride || this._generateRequestId('multigen');
        const prompt = this._extractPromptText(payload, '');
        const payloadSnapshot = payloadInfo?.rawText || this._safeStringify(payload) || null;

        try {
            if (accountId) {
                this._setActiveAccount(accountId, 'multigen-request');
            }
            this.stateManager.ensureMultiGenImageEntry(accountId, imageId, thumbnailUrl || undefined);
            this.stateManager.setLastMultiGenImage(accountId, imageId);
        } catch (error) {
            window.Logger.error('Interceptor', 'Failed ensuring multi-gen image entry', error);
        }

        let attempt = null;
        try {
            attempt = this.stateManager.createMultiGenAttempt(accountId, imageId, {
                prompt: prompt || null,
                thumbnailUrl: thumbnailUrl || undefined,
                payloadSnapshot,
                responseId: requestId
            });
            if (attempt) {
                window.Logger.info('Interceptor', 'Multi-gen attempt created', {
                    requestId,
                    imageId,
                    attemptId: attempt.id,
                    accountId
                });
            }
        } catch (error) {
            window.Logger.error('Interceptor', 'Failed creating multi-gen attempt', error);
        }

        if (!attempt) {
            this.stateManager.disarmMultiGenRequest(requestId);
            return null;
        }

        try {
            this.stateManager.armMultiGenRequest(requestId, {
                accountId,
                imageId,
                attemptId: attempt.id,
                requestUrl,
                headers: { ...(headers || {}) },
                createdAt: new Date().toISOString()
            });
        } catch (error) {
            window.Logger.error('Interceptor', 'Failed arming multi-gen request', error);
        }

        const imageReference = thumbnailUrl || this._extractUrlFromString(payload?.message || '') || null;

        const context = {
            requestId,
            accountId,
            imageId,
            attemptId: attempt.id,
            prompt: attempt.prompt || prompt || null,
            thumbnailUrl: thumbnailUrl || null,
            payloadSnapshot,
            imageReference: imageReference || null,
            lastProgress: 0,
            moderated: false,
            moderationReason: null,
            videoUrl: null,
            videoId: null,
            videoPrompt: null,
            finalMessage: null,
            rawChunks: [],
            timeoutId: null,
            lastEventAt: Date.now(),
            completed: false
        };
        this._scheduleMultiGenGuard(context, 60000);
        return context;
    }

    handleBridgeContentRequest(payload = {}) {
        if (!this._multiGenHistoryEnabled) {
            return;
        }
        try {
            const url = typeof payload?.url === 'string' ? payload.url : '';
            if (!url || !url.includes('/content')) {
                return;
            }
            this._handleImageContentRequest(url);
        } catch (error) {
            window.Logger.warn('Interceptor', 'Failed handling bridge content request', error, payload);
        }
    }

    handleBridgeConversationRequest(payload = {}) {
        if (!this._multiGenHistoryEnabled) {
            return;
        }

        try {
            const requestId = typeof payload?.id === 'string' ? payload.id : null;
            if (requestId && this._bridgeRequestsById.has(requestId)) {
                return;
            }

            const requestUrl = typeof payload?.url === 'string' ? payload.url : '';
            if (!requestUrl || !requestUrl.includes('/rest/app-chat/conversations/new')) {
                return;
            }

            const method = (payload?.method || 'POST').toUpperCase();
            const bodyString = typeof payload?.body === 'string' ? payload.body : null;
            const payloadInfo = bodyString ? {
                rawText: bodyString,
                json: this._safeParseJson(bodyString)
            } : { rawText: null, json: null };

            const context = this._captureMultiGenRequestContext({
                requestUrl,
                method,
                payloadInfo,
                headers: payload?.headers || {},
                requestId: requestId || undefined
            });

            if (!context) {
                return;
            }

            this._bridgeRequestsById.set(context.requestId, context);
            window.Logger.info('Interceptor', 'Bridge conversation captured', {
                requestId: context.requestId,
                imageId: context.imageId
            });

            if (this.uploadAutomationManager &&
                typeof this.uploadAutomationManager.notifyGenerationStarted === 'function') {
                try {
                    this.uploadAutomationManager.notifyGenerationStarted({
                        stage: 'bridge-request',
                        requestId: context.requestId,
                        imageId: context.imageId,
                        accountId: context.accountId || null,
                        url: requestUrl
                    });
                } catch (notifyError) {
                    window.Logger.warn('Upload', 'notifyGenerationStarted (bridge-request) failed', notifyError);
                }
            }

            // Dispatch event for upload automation
            window.dispatchEvent(new CustomEvent('gvp:generation-new-detected', {
                detail: {
                    stage: 'bridge-request',
                    requestId: context.requestId,
                    imageId: context.imageId,
                    accountId: context.accountId || null,
                    timestamp: Date.now()
                }
            }));
        } catch (error) {
            window.Logger.error('Interceptor', 'Failed handling bridge conversation request', error, payload);
        }
    }

    handleBridgeConversationResponse(payload = {}) {
        try {
            const requestId = typeof payload?.id === 'string' ? payload.id : null;
            if (requestId) {
                const context = this._bridgeRequestsById.get(requestId) || null;
                if (context) {
                    if (this.uploadAutomationManager &&
                        typeof this.uploadAutomationManager.notifyGenerationStarted === 'function') {
                        try {
                            this.uploadAutomationManager.notifyGenerationStarted({
                                stage: 'bridge-response',
                                requestId,
                                imageId: context.imageId || null,
                                accountId: context.accountId || null,
                                status: payload?.status ?? null
                            });
                        } catch (notifyError) {
                            window.Logger.warn('Upload', 'notifyGenerationStarted (bridge-response) failed', notifyError);
                        }
                    }

                    // Dispatch event for upload automation
                    window.dispatchEvent(new CustomEvent('gvp:generation-new-detected', {
                        detail: {
                            stage: 'bridge-response',
                            requestId,
                            imageId: context.imageId || null,
                            accountId: context.accountId || null,
                            timestamp: Date.now()
                        }
                    }));
                    if (this.uploadAutomationManager &&
                        typeof this.uploadAutomationManager.notifyUploadFailure === 'function' &&
                        payload?.ok === false) {
                        try {
                            this.uploadAutomationManager.notifyUploadFailure({
                                stage: 'bridge-response',
                                requestId,
                                status: payload?.status ?? null,
                                ok: false,
                                url: context.requestUrl || null
                            });
                        } catch (failureError) {
                            console.warn('[GVP Upload] notifyUploadFailure (bridge-response) failed', failureError);
                        }
                    }
                }
            }
        } catch (error) {
            console.warn('[GVP][Interceptor] Failed handling bridge conversation response', error, payload);
        }
    }

    _scheduleMultiGenGuard(context, delayMs = 60000) {
        if (!context || typeof window === 'undefined' || typeof window.setTimeout !== 'function') {
            return;
        }
        if (context.timeoutId) {
            window.clearTimeout(context.timeoutId);
        }
        context.timeoutId = window.setTimeout(() => {
            context.timeoutId = null;
            if (context.completed) {
                return;
            }
            const reason = 'No progress updates received within timeout window';
            console.warn('[GVP][Interceptor] Multi-gen attempt timed out', {
                requestId: context.requestId,
                imageId: context.imageId,
                attemptId: context.attemptId
            });
            const shouldForceSuccess = (context.lastProgress ?? 0) >= 99 || !!context.videoUrl;
            const meta = shouldForceSuccess
                ? { status: 'success' }
                : context.moderated
                    ? { moderated: true, status: 'failed', error: reason }
                    : { status: 'failed', error: reason };
            this._finalizeMultiGenStream({ multiGen: context }, meta);
            if (context.requestId) {
                this._bridgeRequestsById.delete(context.requestId);
            }
        }, Math.max(15000, delayMs));
    }

    _handlePostGenerationAutomation(context, attempt) {
        if (!context || !attempt) {
            return;
        }
        if (attempt.status !== 'success') {
            return;
        }
        if (!this.uploadAutomationManager || !this.uploadAutomationManager.isEnabled()) {
            return;
        }
        Promise.resolve(this.uploadAutomationManager.handleGenerationSuccess({
            accountId: context.accountId || null,
            imageId: context.imageId || null,
            requestId: context.requestId || null
        })).catch((error) => {
            console.error('[GVP Upload] Generation automation failed', error);
        });
    }


    _handleMultiGenStreamPayload(payload, requestMetadata) {
        if (!this._multiGenHistoryEnabled || !payload) {
            return;
        }

        const meta = requestMetadata || {};
        const multiGen = meta.multiGen;
        if (!multiGen || !multiGen.imageId || !multiGen.attemptId) {
            return;
        }

        const imageId = multiGen.imageId;
        const attemptId = multiGen.attemptId;

        if (multiGen.accountId) {
            this._setActiveAccount(multiGen.accountId, 'stream-context');
        }

        const streaming = payload?.result?.response?.streamingVideoGenerationResponse ||
            payload?.streamingVideoGenerationResponse ||
            payload?.result?.streamingVideoGenerationResponse;

        if (streaming) {
            const progressRaw = streaming.progress ??
                streaming.progressValue ??
                streaming.progressPercent ??
                streaming.progress_percentage ??
                streaming.percentage ??
                streaming.percent ??
                (typeof streaming.status === 'object' ? streaming.status?.progress : null);
            const progressValue = this._coerceProgressValue(progressRaw);
            const moderated = streaming.moderated === true;
            const normalizedUrl = this._normalizeAssetUrl(streaming.videoUrl);

            if (progressValue !== null) {
                if (multiGen.lastProgress !== progressValue || moderated) {
                    this.stateManager.appendMultiGenProgress(imageId, attemptId, progressValue, {
                        moderated,
                        videoUrl: normalizedUrl || undefined,
                        videoId: streaming.videoId || undefined,
                        videoPrompt: streaming.videoPrompt,
                        timestamp: new Date().toISOString(),
                        moderationReason: streaming.moderationReason || null
                    });
                    multiGen.lastProgress = progressValue;
                }
                multiGen.lastEventAt = Date.now();
                const guardDelay = progressValue >= 95 ? 150000 : progressValue >= 75 ? 120000 : 90000;
                this._scheduleMultiGenGuard(multiGen, guardDelay);

                if (!multiGen.completed && progressValue >= 100) {
                    const finalizeMeta = moderated
                        ? { moderated: true }
                        : { status: 'success' };
                    this._finalizeMultiGenStream({ multiGen }, finalizeMeta);
                    if (multiGen.requestId) {
                        this._bridgeRequestsById.delete(multiGen.requestId);
                    }
                }
            }

            if (moderated) {
                multiGen.moderated = true;
                multiGen.moderationReason = streaming.moderationReason || multiGen.moderationReason || null;
            }

            if (normalizedUrl) {
                multiGen.videoUrl = normalizedUrl;
                this.stateManager.updateMultiGenAttempt(imageId, attemptId, { videoUrl: normalizedUrl });
                const accountFromUrl = this._extractAccountIdFromVideoUrl(normalizedUrl);
                if (accountFromUrl) {
                    this._setActiveAccount(accountFromUrl, 'stream-video-url');
                }
            }

            if (streaming.videoId) {
                multiGen.videoId = streaming.videoId;
            }

            if (streaming.videoPrompt !== undefined) {
                multiGen.videoPrompt = streaming.videoPrompt;
                this.stateManager.updateMultiGenAttempt(imageId, attemptId, { videoPrompt: streaming.videoPrompt });
            }
        }

        const userResponse = payload?.result?.response?.userResponse;
        if (userResponse && typeof userResponse.message === 'string') {
            const cleanedPrompt = this._cleanupPromptText(userResponse.message);
            if (cleanedPrompt && cleanedPrompt !== multiGen.prompt) {
                multiGen.prompt = cleanedPrompt;
                this.stateManager.updateMultiGenAttempt(imageId, attemptId, { prompt: cleanedPrompt });
            }
        }

        const modelResponse = payload?.result?.response?.modelResponse;
        if (modelResponse && typeof modelResponse.message === 'string') {
            multiGen.finalMessage = modelResponse.message;
            this.stateManager.updateMultiGenAttempt(imageId, attemptId, { finalMessage: modelResponse.message });
        }
    }

    _finalizeMultiGenStream(requestMetadata, { error } = {}) {
        if (!this._multiGenHistoryEnabled || !requestMetadata || !requestMetadata.multiGen) {
            return;
        }

        const data = requestMetadata.multiGen;
        if (data.completed) {
            return;
        }
        data.completed = true;
        if (data.timeoutId) {
            window.clearTimeout(data.timeoutId);
            data.timeoutId = null;
        }

        const finalizePayload = {
            rawStream: Array.isArray(data.rawChunks) && data.rawChunks.length ? data.rawChunks.join('') : null,
            videoUrl: data.videoUrl || null,
            videoId: data.videoId || null,
            videoPrompt: data.videoPrompt,
            finalMessage: data.finalMessage || null
        };

        if (data.prompt) {
            finalizePayload.prompt = data.prompt;
        }

        if (data.moderated) {
            finalizePayload.moderated = true;
            if (data.moderationReason) {
                finalizePayload.moderationReason = data.moderationReason;
            }
        }

        if (error) {
            finalizePayload.error = String(error);
            finalizePayload.status = 'failed';
            console.error('[GVP][Interceptor] Multi-gen stream encountered error', error);
        }

        let attemptResult = null;
        try {
            attemptResult = this.stateManager.finalizeMultiGenAttempt(data.imageId, data.attemptId, finalizePayload);
        } finally {
            if (data.requestId) {
                this._bridgeRequestsById.delete(data.requestId);
            }
            if (data.requestId) {
                this.stateManager.disarmMultiGenRequest(data.requestId);
            }
        }
        if (attemptResult) {
            this._handlePostGenerationAutomation(data, attemptResult);
        }
    }

    _handleUploadFileResponse(responseJson) {
        if (!responseJson || typeof responseJson.fileUri !== 'string') {
            return;
        }
        const match = responseJson.fileUri.match(/users\/([0-9a-f-]{36})\/([0-9a-f-]{36})/i);
        if (!match) {
            console.warn('[GVP Upload] Unable to extract account/image from fileUri', responseJson.fileUri);
            return;
        }
        const [, accountId, imageId] = match;
        this._pendingUpload = {
            accountId,
            imageId,
            fileMetadataId: responseJson.fileMetadataId || null,
            fileUri: responseJson.fileUri,
            savedAt: Date.now(),
            fileName: responseJson.fileName || null
        };
        console.log('[GVP Upload] Pending upload registered', {
            accountId,
            imageId,
            fileMetadataId: responseJson.fileMetadataId || null,
            fileName: responseJson.fileName || null
        });

        if (this.uploadAutomationManager) {
            this.uploadAutomationManager.handleUploadResponse({
                accountId,
                imageId,
                fileUri: responseJson.fileUri || null,
                fileName: responseJson.fileName || null,
                fileMetadataId: responseJson.fileMetadataId || null
            });
        }
    }

    setPageInterceptorActive(isActive = true, context = {}) {
        const nextState = !!isActive;
        const previousState = this._pageInterceptorActive;
        this._pageInterceptorActive = nextState;

        console.log(`[GVP][Interceptor] Page interceptor ${nextState ? 'enabled' : 'disabled'}`, context);

        if (!nextState) {
            return;
        }

        try {
            const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            if (!w || typeof w.fetch !== 'function') {
                return;
            }

            const fetchMatchesWrapper = this._fetchWrapper && w.fetch === this._fetchWrapper;
            if (fetchMatchesWrapper && previousState === nextState) {
                return;
            }

            const reason = context?.source ? `page-bridge:${context.source}` : 'page-bridge';
            this._overrideFetch(w, {
                force: true,
                useCurrentAsOriginal: true,
                reason
            });
        } catch (error) {
            console.warn('[GVP][Interceptor] Failed to refresh fetch override after page interceptor activation:', error);
        }
    }

    // GVP MODIFICATION: Enhanced fetch override with lifecycle tracking
    _installFetchOverride() {
        console.log('[NetworkInterceptor] 🔧 Installing enhanced fetch override...');

        if (this.originalFetch) {
            console.log('[NetworkInterceptor] ⚠️ Fetch override already exists, skipping re-installation');
            return;
        }

        this.originalFetch = window.fetch;
        console.log('[NetworkInterceptor] 🔄 Storing original fetch reference');

        // Install enhanced interceptor
        window.fetch = async (...args) => {
            return await this._enhancedFetchInterceptor(...args);
        };

        console.log('[NetworkInterceptor] ✅ Enhanced fetch override installed and live');
    }

    _extractAccountIdFromString(value) {
        if (!value || typeof value !== 'string') {
            return null;
        }
        const match = value.match(/users\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
        return match ? match[1] : null;
    }

    _extractAccountIdFromPayload(payload, depth = 0) {
        if (!payload || depth > 4) {
            return null;
        }

        if (typeof payload === 'string') {
            return this._extractAccountIdFromString(payload);
        }

        if (Array.isArray(payload)) {
            for (const entry of payload) {
                const candidate = this._extractAccountIdFromPayload(entry, depth + 1);
                if (candidate) {
                    return candidate;
                }
            }
            return null;
        }

        if (typeof payload === 'object') {
            for (const value of Object.values(payload)) {
                const candidate = this._extractAccountIdFromPayload(value, depth + 1);
                if (candidate) {
                    return candidate;
                }
            }
        }

        return null;
    }

    _setActiveAccount(accountId, source = 'unknown') {
        if (!this._multiGenHistoryEnabled || !accountId) {
            return;
        }
        const changed = this.stateManager.setActiveMultiGenAccount(accountId);
        if (changed) {
            console.log('[GVP][Interceptor] Active account set', { accountId, source });
        }
    }

    async _processGalleryResponse(response, context = {}) {
        console.log('[GVP][Interceptor] 🗂️ Processing gallery response');
        if (!response) {
            console.warn('[GVP][Interceptor] ⚠️ No response provided for gallery processing');
            return;
        }

        try {
            const encoding = response.headers?.get?.('content-encoding') || '';
            let payloadText = '';

            if (encoding.includes('gzip')) {
                console.log('[GVP][Interceptor] 🗜️ Detected gzip encoded gallery response');
                if (typeof DecompressionStream === 'function' && response.body) {
                    const decompressedStream = response.body.pipeThrough(new DecompressionStream('gzip'));
                    payloadText = await new Response(decompressedStream).text();
                } else {
                    console.warn('[GVP][Interceptor] ⚠️ DecompressionStream unavailable; attempting Blob-based decode');
                    const buffer = await response.arrayBuffer();
                    payloadText = await this._gunzipArrayBuffer(buffer);
                }
            } else {
                payloadText = await response.text();
            }

            if (!payloadText) {
                console.warn('[GVP][Interceptor] ⚠️ Gallery payload empty after decoding');
                return;
            }

            let payload;
            try {
                payload = JSON.parse(payloadText);
            } catch (parseErr) {
                console.error('[GVP][Interceptor] ❌ Failed to parse gallery JSON:', parseErr);
                console.error('[GVP][Interceptor] ❌ Payload preview:', payloadText.substring(0, 200));
                return;
            }

            this._logGallerySchema(payload);
            this._ingestGalleryPayload(payload, { source: 'content-fetch', context });
        } catch (error) {
            console.error('[GVP][Interceptor] ❌ Failed handling gallery response:', error);
        }
    }

    ingestGalleryPayloadFromPage(payload, meta = {}) {
        console.log('[GVP][Interceptor] 📨 Gallery payload received from page context');
        if (!payload) {
            console.warn('[GVP][Interceptor] ⚠️ Empty gallery payload from page');
            return;
        }
        try {
            this._ingestGalleryPayload(payload, { source: 'page-bridge', ...meta });
        } catch (error) {
            console.error('[GVP][Interceptor] ❌ Failed ingesting gallery payload from page:', error);
        }
    }

    async _gunzipArrayBuffer(buffer) {
        if (!(buffer instanceof ArrayBuffer)) {
            return '';
        }
        if (typeof DecompressionStream !== 'function') {
            console.warn('[GVP][Interceptor] ⚠️ DecompressionStream unsupported; returning binary placeholder');
            return new TextDecoder().decode(buffer);
        }
        try {
            const ds = new DecompressionStream('gzip');
            const decompressedStream = new Response(new Blob([buffer]).stream().pipeThrough(ds));
            return await decompressedStream.text();
        } catch (error) {
            console.error('[GVP][Interceptor] ❌ ArrayBuffer gunzip failed:', error);
            return '';
        }
    }

    _ingestGalleryPayload(payload, meta = {}) {
        const posts = this._extractGalleryPosts(payload);
        if (!posts.length) {
            console.log('[GVP][Interceptor] ℹ️ Gallery payload produced no posts');
            return;
        }

        this._applyGalleryDataset(posts, meta);
    }

    _applyGalleryDataset(posts, meta = {}) {
        if (!Array.isArray(posts) || !posts.length) return;

        console.log('[GVP][Interceptor] ℹ️ Gallery dataset processed', {
            count: posts.length,
            source: meta?.source || 'unknown'
        });

        // Ingest gallery data into StateManager
        if (this.stateManager && typeof this.stateManager.ingestGalleryData === 'function') {
            try {
                const result = this.stateManager.ingestGalleryData(posts, {
                    source: meta?.source || 'unknown',
                    context: meta?.context || {},
                    timestamp: Date.now()
                });

                console.log('[GVP][Interceptor] ✅ Gallery data ingested into StateManager', result);
            } catch (error) {
                console.error('[GVP][Interceptor] ❌ Failed to ingest gallery data:', error);
            }
        } else {
            console.warn('[GVP][Interceptor] ⚠️ StateManager.ingestGalleryData not available');
        }

        // v1.21.31: Always ingest into unified video history (listIngestionEnabled setting removed)
        console.log('[GVP Unified] 🔎 /list response intercepted', {
            postsLength: Array.isArray(posts) ? posts.length : null,
            accountId: this.stateManager?.state?.activeAccountId?.substring(0, 12)
        });

        this._ingestListToUnified(posts).catch(error => {
            console.error('[GVP Unified] ❌ Failed to ingest /list data:', error);
        });
    }

    /**
     * NEW v6: Ingest /list API response into unified IndexedDB store
     * This runs in parallel with existing gallery ingestion for backward compatibility
     */
    async _ingestListToUnified(posts) {
        // Concurrency Lock: Prevent overlapping ingestions
        if (this._isIngestingUnified) {
            GVPLogger.debug('Unified', 'Ingestion already in progress, skipping batch');
            return;
        }

        this._isIngestingUnified = true;

        try {
            GVPLogger.debug('Unified', `_ingestListToUnified CALLED (${posts?.length || 0} posts)`);

            if (!Array.isArray(posts) || posts.length === 0) {
                GVPLogger.debug('Unified', 'Empty posts array, skipping');
                return;
            }

            if (!this.stateManager?.indexedDBManager?.initialized) {
                GVPLogger.warn('Unified', 'IndexedDB not initialized, skipping ingestion');
                return;
            }

            // Get current account ID - try multiple sources
            let accountId = this.stateManager.state?.activeAccountId ||
                this.stateManager.state?.multiGenHistory?.activeAccountId;

            // If not set, try to extract from posts (userId field from API)
            if (!accountId && posts.length > 0) {
                const firstPost = posts.find(p => p.userId);
                accountId = firstPost?.userId;

                if (accountId) {
                    GVPLogger.debug('Unified', `Extracted account ID: ${accountId.substring(0, 12)}...`);
                    if (this.stateManager.state.multiGenHistory) {
                        this.stateManager.state.multiGenHistory.activeAccountId = accountId;
                    }
                }
            }

            if (!accountId) {
                GVPLogger.warn('Unified', 'No active account ID, cannot ingest');
                return;
            }

            // v1.21.32: Skip if account already synced
            if (this.stateManager?.isAccountSyncComplete?.(accountId)) {
                GVPLogger.debug('Unified', `Account ${accountId.substring(0, 12)}... already synced - skipping`);
                return;
            }

            GVPLogger.debug('Unified', `Ingesting ${posts.length} posts for ${accountId.substring(0, 12)}...`);

            let processedCount = 0;
            let videoCount = 0;
            let skippedNonImage = 0;
            let createdEntries = 0;
            let updatedEntries = 0;

            const entriesToSave = [];


            // 1. PRE-FETCH: Get all existing entries in one go (optimization)
            const imageIdsToFetch = [];

            // First pass: Collect IDs
            for (const item of posts) {
                const post = item.raw || item;
                let imageId;
                if (post.mediaType === 'MEDIA_POST_TYPE_IMAGE') {
                    imageId = post.id;
                } else if (post.mediaType === 'MEDIA_POST_TYPE_VIDEO') {
                    imageId = post.originalPostId;
                }
                if (imageId) imageIdsToFetch.push(imageId);
            }

            console.log(`[GVP Unified] 🔍 Batch fetching ${imageIdsToFetch.length} entries...`);

            // CRITICAL: Wait for IDB to be ready logic to prevent overwriting locked entries
            await this._waitForIDB();

            const existingEntriesMap = await this.stateManager.indexedDBManager.getUnifiedEntriesBatch(imageIdsToFetch);
            console.log(`[GVP Unified] ✅ Batch fetch complete. Found ${existingEntriesMap.size} existing entries.`);

            // 2. PROCESS: Update or Create entries in memory
            for (const item of posts) {
                // Handle normalized objects by unwrapping .raw if present
                const post = item.raw || item;

                let imageId, isStandaloneVideo = false;

                if (post.mediaType === 'MEDIA_POST_TYPE_IMAGE') {
                    imageId = post.id;
                } else if (post.mediaType === 'MEDIA_POST_TYPE_VIDEO') {
                    imageId = post.originalPostId;
                    isStandaloneVideo = true;
                } else {
                    skippedNonImage++;
                    continue;
                }

                if (!imageId) continue;

                try {
                    // Get from batch map
                    let entry = existingEntriesMap.get(imageId);

                    const cleanMediaUrl = post.mediaUrl ? post.mediaUrl.split('?')[0] : null;
                    const cleanThumb = cleanMediaUrl; // As requested: use mediaUrl directly for parent thumbnail

                    if (!entry) {
                        createdEntries++;
                        // Detect if this is an Imagine Edit image (has /generated/ in URL)
                        const isEditedImage = cleanMediaUrl && cleanMediaUrl.includes('/generated/');

                        // Create new entry
                        entry = {
                            imageId: imageId,
                            accountId: accountId,
                            imageUrl: isStandaloneVideo ? null : cleanMediaUrl,
                            imageThumbnailUrl: isStandaloneVideo ? null : cleanThumb,
                            thumbnailUrl: isStandaloneVideo ? cleanThumb : cleanThumb,
                            imagePrompt: isStandaloneVideo ? '' : (post.prompt || post.originalPrompt || ''),
                            imageCreateTime: isStandaloneVideo ? null : post.createTime,
                            imageResolution: isStandaloneVideo ? null : post.resolution,
                            imageModelName: isStandaloneVideo ? null : post.modelName,
                            liked: isStandaloneVideo ? false : (post.userInteractionStatus?.likeStatus || false),
                            // NEW: Track if this is an edited image
                            isEditedImage: isEditedImage || false,
                            sourceImageId: null, // /list doesn't provide parent info
                            createdAt: post.createTime,
                            updatedAt: post.createTime,
                            expanded: false,
                            attempts: []
                        };
                        // Add to map so subsequent iterations (e.g. videos for same image) find it
                        existingEntriesMap.set(imageId, entry);
                    } else {
                        updatedEntries++;
                    }

                    // v1.21.31: Skip entirely if entry is already locked (dataSyncComplete)
                    if (entry.dataSyncComplete) {
                        // Entry is locked - no backfill needed, skip to video processing
                    } else {
                        // Backfill parent thumbnail ONLY if actually missing
                        const parentThumb = cleanThumb;
                        if (parentThumb && !entry.imageThumbnailUrl) {
                            entry.imageThumbnailUrl = parentThumb;
                            entry.thumbnailUrl = parentThumb;
                            entry._needsSave = true;
                            console.log('[GVP Unified] ✅ Backfilled parent thumb from /list', {
                                imageId,
                                parentThumb
                            });
                        }

                        // Backfill other missing metadata ONLY if actually missing
                        if (!entry.imageUrl && !isStandaloneVideo && cleanMediaUrl) {
                            entry.imageUrl = cleanMediaUrl;
                            entry._needsSave = true;
                        }
                        if (!entry.imagePrompt && (post.prompt || post.originalPrompt)) {
                            entry.imagePrompt = post.prompt || post.originalPrompt || '';
                            entry._needsSave = true;
                        }
                        if (!entry.imageCreateTime && post.createTime) {
                            entry.imageCreateTime = post.createTime;
                            entry._needsSave = true;
                        }
                        if (!entry.imageResolution && post.resolution) {
                            entry.imageResolution = post.resolution;
                            entry._needsSave = true;
                        }
                        if (!entry.imageModelName && post.modelName) {
                            entry.imageModelName = post.modelName;
                            entry._needsSave = true;
                        }

                        // v1.21.31: Auto-lock entry if all core fields are now populated
                        if (entry.imageThumbnailUrl && entry.imagePrompt && !entry.dataSyncComplete) {
                            entry.dataSyncComplete = true;
                            entry._needsSave = true;
                            console.log('[GVP Unified] 🔒 Auto-locked entry after backfill', { imageId });
                        }
                    }

                    // Process videos
                    let videosAdded = 0;
                    const videosToProcess = [];

                    if (isStandaloneVideo) {
                        videosToProcess.push(post);
                    } else {
                        // v1.21.23: Check BOTH childPosts AND videos arrays
                        // Grok API returns video data in both locations depending on context
                        if (Array.isArray(post.childPosts)) {
                            videosToProcess.push(...post.childPosts.filter(cp => cp.mediaType === 'MEDIA_POST_TYPE_VIDEO'));
                        }
                        if (Array.isArray(post.videos)) {
                            // Filter to avoid duplicates (video may be in both childPosts and videos)
                            const existingIds = new Set(videosToProcess.map(v => v.id));
                            videosToProcess.push(...post.videos.filter(v => v.id && !existingIds.has(v.id)));
                        }
                    }

                    let latestSuccessTime = null;

                    for (const videoPost of videosToProcess) {
                        const videoId = videoPost.id;
                        if (!videoId) continue;

                        const existingIndex = entry.attempts.findIndex(a => a.id === videoId || (a.videoId && a.videoId === videoId));

                        // CRITICAL FIX: If entry is locked and attempt exists, we ONLY update if meaningful data is missing.
                        // This allows "Repair" logic to backfill missing URLs/thumbnails without causing mass re-saves.
                        if (existingIndex >= 0 && entry.dataSyncComplete) {
                            const existingAttempt = entry.attempts[existingIndex];
                            // Check for missing critical data that the new post might have
                            const isMissingData =
                                (!existingAttempt.videoUrl && videoPost.mediaUrl) ||
                                (!existingAttempt.thumbnailUrl && videoPost.thumbnailImageUrl) ||
                                (!existingAttempt.videoPrompt && (videoPost.originalPrompt || videoPost.prompt));

                            if (!isMissingData) {
                                continue;
                            }
                            // If missing data, we fall through to allow the update logic below
                        }

                        const cleanVideoUrl = videoPost.mediaUrl ? videoPost.mediaUrl.split('?')[0] : null;
                        const cleanVideoThumb = (videoPost.thumbnailImageUrl || entry.imageThumbnailUrl || entry.thumbnailUrl || entry.imageUrl || videoPost.mediaUrl || null);
                        const cleanVideoThumbUrl = cleanVideoThumb ? cleanVideoThumb.split('?')[0] : null;
                        const videoPrompt = videoPost.originalPrompt || videoPost.prompt || '';
                        const videoCreateTime = videoPost.createTime || null;

                        let attempt;

                        if (existingIndex === -1) {
                            attempt = {
                                id: videoId,
                                videoId: videoId,
                                videoUrl: cleanVideoUrl,
                                thumbnailUrl: cleanVideoThumbUrl,
                                videoPrompt,
                                mode: videoPost.mode,
                                modelName: videoPost.modelName,
                                resolution: videoPost.resolution,
                                status: 'success',
                                progress: 100,
                                moderated: false,
                                moderationReason: null,
                                startedAt: videoCreateTime,
                                finishedAt: videoCreateTime,
                                respondedAt: videoCreateTime,
                                timestamp: videoCreateTime,
                                isApiSource: true,
                                parentImageId: videoPost.originalPostId,
                                responseId: null,
                                audioUrls: Array.isArray(videoPost.audioUrls) ? videoPost.audioUrls : [],
                                audioTranscripts: [],
                                error: null,
                                upscaledVideoUrl: null, // Schema enforcement (User Request)
                                expanded: false
                            };
                            entry.attempts.push(attempt);

                            if (videoCreateTime) {
                                const t = new Date(videoCreateTime).getTime();
                                if (!latestSuccessTime || t > latestSuccessTime) latestSuccessTime = t;
                            }
                            videoCount++;
                            videosAdded++;
                            entry._needsSave = true;
                            if (videoCount <= 3) {
                                console.log('[GVP Unified] 🎯 Added video from /list', {
                                    imageId,
                                    videoId,
                                    thumb: cleanVideoThumbUrl
                                });
                            }
                        } else {
                            // Existing attempt: backfill thumbnail if missing
                            attempt = entry.attempts[existingIndex];
                        }
                        // Track if we update anything for this attempt (moved outside else block)
                        let attemptUpdated = false;
                        if (existingIndex >= 0) {
                            // backfill core fields if missing
                            if (!attempt.videoId) {
                                attempt.videoId = videoId;
                                attemptUpdated = true;
                            }
                            if (!attempt.videoUrl && cleanVideoUrl) {
                                attempt.videoUrl = cleanVideoUrl;
                                attemptUpdated = true;
                            }
                            if (!attempt.videoPrompt && videoPrompt) {
                                attempt.videoPrompt = videoPrompt;
                                attemptUpdated = true;
                            }
                            if (!attempt.modelName && videoPost.modelName) {
                                attempt.modelName = videoPost.modelName;
                                attemptUpdated = true;
                            }
                            if (!attempt.resolution && videoPost.resolution) {
                                attempt.resolution = videoPost.resolution;
                                attemptUpdated = true;
                            }
                            // Backfill upscaledVideoUrl if missing (Schema enforcement)
                            // CRITICAL FIX: Only backfill if entry is NOT locked, to prevent redundant saving
                            if (!entry.dataSyncComplete && !('upscaledVideoUrl' in attempt)) {
                                attempt.upscaledVideoUrl = null;
                                attemptUpdated = true;
                            }

                            if (attemptUpdated) {
                                entry._needsSave = true;
                            }
                            attempt.resolution = videoPost.resolution;
                            attemptUpdated = true;
                        }
                        if ((!attempt.status || attempt.status === 'pending') && videoPost.mediaUrl) {
                            attempt.status = 'success';
                            attempt.progress = 100;
                            attemptUpdated = true;
                        }
                        if (!attempt.startedAt && videoCreateTime) {
                            attempt.startedAt = videoCreateTime;
                            attemptUpdated = true;
                        }
                        if (!attempt.finishedAt && videoCreateTime) {
                            attempt.finishedAt = videoCreateTime;
                            attemptUpdated = true;
                        }
                        if (!attempt.respondedAt && videoCreateTime) {
                            attempt.respondedAt = videoCreateTime;
                            attemptUpdated = true;
                        }
                        if (!attempt.timestamp && videoCreateTime) {
                            attempt.timestamp = videoCreateTime;
                            attemptUpdated = true;
                        }
                        if ((!attempt.thumbnailUrl || attempt.thumbnailUrl === attempt.videoUrl) && cleanVideoThumbUrl) {
                            attempt.thumbnailUrl = cleanVideoThumbUrl;
                            attemptUpdated = true;
                        }
                        if ((!attempt.audioUrls || !attempt.audioUrls.length) && Array.isArray(videoPost.audioUrls)) {
                            attempt.audioUrls = videoPost.audioUrls;
                            attemptUpdated = true;
                        }
                        if (videoCreateTime) {
                            const t = new Date(videoCreateTime).getTime();
                            if (!latestSuccessTime || t > latestSuccessTime) latestSuccessTime = t;
                        }

                        if (!attempt.thumbnailUrl && cleanVideoThumbUrl) {
                            attempt.thumbnailUrl = cleanVideoThumbUrl;
                            attemptUpdated = true;
                        }

                        if (attemptUpdated) {
                            entry._needsSave = true;
                            console.log('[GVP Unified] ✅ Backfilled attempt from /list', {
                                imageId,
                                videoId,
                                updatedFields: true
                            });
                        }
                    }

                    // Only save if we added videos or it's a new entry or we backfilled thumbs/likes/etc.
                    if (videosAdded > 0 || createdEntries > 0 || entry._needsSave || !entry.thumbnailUrl || !entry.imageThumbnailUrl) {
                        // ✅ Update lastUpdated to the LATEST activity time (max of current or new video time)
                        // This ensures sorting by "Newest" puts this entry at the top if a new video finished
                        let maxTime = new Date(entry.updatedAt).getTime();

                        for (const video of videosToProcess) {
                            if (video.createTime) {
                                const videoTime = new Date(video.createTime).getTime();
                                if (videoTime > maxTime) {
                                    maxTime = videoTime;
                                }
                            }
                        }

                        entry.updatedAt = new Date(maxTime).toISOString();
                        if (latestSuccessTime) {
                            entry.lastSuccessAt = new Date(latestSuccessTime).toISOString();
                        }

                        // Mark for save
                        entry._needsSave = true;
                        processedCount++;
                    }

                } catch (error) {
                    console.error(`[GVP Unified] ❌ Failed to process image ${imageId}:`, error);
                }
            }

            // Collect entries that need saving
            for (const entry of existingEntriesMap.values()) {
                if (entry._needsSave) {
                    delete entry._needsSave; // Clean up temporary flag
                    entriesToSave.push(entry);
                }
            }

            // 3. BATCH SAVE: Write all updates in a single transaction
            if (entriesToSave.length > 0) {
                console.log(`[GVP Unified] 💾 Batch saving ${entriesToSave.length} entries...`);
                const success = await this.stateManager.indexedDBManager.saveUnifiedEntries(entriesToSave);

                if (success) {
                    console.log(`[GVP Unified] ✅ Batch save complete`);
                } else {
                    console.error(`[GVP Unified] ❌ Batch save failed`);
                }
            } else {
                console.log(`[GVP Unified] ℹ️ No updates needed for this batch`);
            }

            console.log(`[GVP Unified] ✅ INGESTION COMPLETE`, {
                totalPosts: posts.length,
                processedImages: processedCount,
                newEntries: createdEntries,
                updatedEntries: updatedEntries,
                totalVideosAdded: videoCount,
                skippedNonImage: skippedNonImage
            });

        } catch (err) {
            console.error('[GVP Unified] ❌ Critical ingestion error:', err);
        } finally {
            // Release lock
            this._isIngestingUnified = false;
        }
    }

    async _processPostGetResponse(response, context = {}) {
        if (!response) {
            console.warn('[GVP][Interceptor] ⚠️ No response provided for post/get processing');
            return;
        }

        try {
            const payload = await response.json();
            const posts = this._collectPostCandidates(payload);

            if (!posts.length) {
                console.log('[GVP][Interceptor] ℹ️ No post entities discovered in /post/get payload');
                return;
            }

            posts.forEach(post => {
                const postId = post?.id || post?.postId || post?.assetId || null;
                if (!postId) {
                    return;
                }

                const selection = this._selectLastSuccessfulPrompt(post);
                if (!selection || !selection.prompt) {
                    console.log(`[GVP][Interceptor] ℹ️ No prompt candidate found for post ${postId}`);
                    return;
                }

                const metadata = {
                    timestamp: selection.timestamp || Date.now(),
                    videoUrl: (selection.videoUrl || post?.videoUrl || '').split('?')[0] || null,
                    assetId: selection.assetId || post?.assetId || null,
                    rawPost: post,
                    moderated: selection.moderated,
                    context
                };

                this._applyPromptDataForPost(postId, selection.prompt, metadata);
            });
        } catch (error) {
            console.error('[GVP][Interceptor] ❌ Failed handling /post/get response:', error);
        }
    }

    _collectPostCandidates(payload) {
        if (!payload || typeof payload !== 'object') {
            return [];
        }

        const candidates = [];
        const pushCandidate = (candidate) => {
            if (candidate && typeof candidate === 'object') {
                candidates.push(candidate);
            }
        };

        const direct = this._extractPostEntity(payload);
        pushCandidate(direct);

        const arrays = [
            payload?.result?.data?.posts,
            payload?.result?.posts,
            payload?.data?.posts,
            payload?.posts,
            payload?.mediaPosts
        ];

        arrays.forEach(collection => {
            if (Array.isArray(collection)) {
                collection.forEach(pushCandidate);
            }
        });

        const seen = new Set();
        const unique = [];

        candidates.forEach(candidate => {
            const key = candidate?.id || candidate?.postId || candidate?.assetId || null;
            if (key && seen.has(key)) {
                return;
            }
            if (key) {
                seen.add(key);
            }
            unique.push(candidate);
        });

        return unique.filter(Boolean);
    }

    _extractPostEntity(payload) {
        if (!payload || typeof payload !== 'object') {
            return null;
        }

        return payload?.result?.data?.post
            || payload?.result?.post
            || payload?.data?.post
            || payload?.post
            || null;
    }

    _selectLastSuccessfulPrompt(post) {
        if (!post || typeof post !== 'object') {
            return null;
        }

        const childPosts = Array.isArray(post.childPosts) ? post.childPosts : [];
        const candidates = [];

        childPosts.forEach(child => {
            const prompt = this._extractPromptString(child);
            if (!prompt) {
                return;
            }

            const timestamp = this._normalizeTimestamp(
                child.completedAt
                || child.updatedAt
                || child.lastUpdated
                || child.finishedAt
                || child.createdAt
                || child.timestamp
            ) || Date.now();

            candidates.push({
                prompt,
                timestamp,
                success: this._isSuccessfulChild(child),
                moderated: Boolean(child.moderated || child.isModerated),
                videoUrl: child.videoUrl || child.mediaUrl || child.resultVideoUrl || null,
                assetId: child.assetId || child.mediaAssetId || child.resultAssetId || child.id || null,
                child
            });
        });

        if (!candidates.length) {
            const fallbackPrompt = this._extractPromptString(post);
            if (!fallbackPrompt) {
                return null;
            }

            const fallbackTimestamp = this._normalizeTimestamp(
                post.updatedAt
                || post.lastUpdated
                || post.completedAt
                || post.createdAt
                || post.timestamp
            ) || Date.now();

            return {
                prompt: fallbackPrompt,
                timestamp: fallbackTimestamp,
                success: !Boolean(post.moderated || post.isModerated),
                moderated: Boolean(post.moderated || post.isModerated),
                videoUrl: post.videoUrl || post.mediaUrl || null,
                assetId: post.assetId || null,
                child: null
            };
        }

        const successful = candidates.filter(candidate => candidate.success);
        if (successful.length) {
            const sortedSuccessful = [...successful].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            return sortedSuccessful[0];
        }

        const sortedAll = [...candidates].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return sortedAll[0] || null;
    }

    _extractPromptString(node) {
        if (!node || typeof node !== 'object') {
            return '';
        }

        const promptFields = ['originalPrompt', 'videoPrompt', 'prompt', 'jsonPrompt'];

        for (const field of promptFields) {
            if (!Object.prototype.hasOwnProperty.call(node, field)) {
                continue;
            }

            const value = node[field];

            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }

            if (value && typeof value === 'object') {
                try {
                    return JSON.stringify(value);
                } catch (error) {
                    console.warn('[GVP][Interceptor] ⚠️ Failed stringifying prompt object field:', field, error);
                }
            }
        }

        return '';
    }

    _isSuccessfulChild(child) {
        if (!child || typeof child !== 'object') {
            return false;
        }

        if (child.moderated || child.isModerated) {
            return false;
        }

        if (typeof child.success === 'boolean') {
            return child.success;
        }

        if (typeof child.wasSuccessful === 'boolean') {
            return child.wasSuccessful;
        }

        if (typeof child.isSuccess === 'boolean') {
            return child.isSuccess;
        }

        const statusFields = [
            child.status,
            child.generationStatus,
            child.progressStatus,
            child.stage,
            child.state
        ];

        const status = statusFields
            .map(value => (typeof value === 'string' ? value : ''))
            .find(value => value.trim().length);

        if (status) {
            const lowered = status.toLowerCase();
            if (['success', 'successful', 'completed', 'complete', 'finished', 'ready'].some(token => lowered.includes(token))) {
                return true;
            }
            if (['moderated', 'failed', 'error', 'refused', 'rejected', 'cancelled', 'canceled'].some(token => lowered.includes(token))) {
                return false;
            }
        }

        const normalizedProgress = this._coerceProgressValue(child.progress);
        if (normalizedProgress !== null && normalizedProgress >= 100) {
            return true;
        }

        return false;
    }

    _applyPromptDataForPost(postId, prompt, metadata = {}) {
        if (!prompt || typeof prompt !== 'string') {
            return;
        }

        const trimmedPrompt = prompt.trim();
        if (!trimmedPrompt) {
            return;
        }

        this._parseAndSetPromptData(trimmedPrompt);

        if (postId) {
            console.log(`[GVP][Interceptor] ✅ Applied originalPrompt for post ${postId}`);
        } else {
            console.log('[GVP][Interceptor] ✅ Applied originalPrompt without post identifier');
        }
    }

    _extractGalleryPosts(payload) {
        if (!payload) return [];

        const candidateArrays = [];

        if (Array.isArray(payload)) candidateArrays.push(payload);

        const result = payload.result || payload.data || {};
        if (Array.isArray(result)) candidateArrays.push(result);
        if (result?.posts) candidateArrays.push(result.posts);
        if (result?.data?.posts) candidateArrays.push(result.data.posts);
        if (payload?.posts) candidateArrays.push(payload.posts);
        if (payload?.data?.posts) candidateArrays.push(payload.data.posts);
        if (payload?.mediaPosts) candidateArrays.push(payload.mediaPosts);

        const posts = candidateArrays.find(Array.isArray) || [];
        if (!posts.length) return [];

        return posts
            .map(post => this._normalizeGalleryPost(post))
            .filter(Boolean);
    }

    _logGallerySchema(payload) {
        if (this._hasLoggedGallerySchema) {
            return;
        }

        try {
            const posts = this._extractGalleryPosts(payload);
            if (!Array.isArray(posts) || !posts.length) {
                return;
            }

            const samplePost = posts[0]?.raw || posts[0];
            if (!samplePost || typeof samplePost !== 'object') {
                return;
            }

            const promptCandidates = [];
            const visited = new WeakSet();

            const recordCandidate = (path, value) => {
                const preview = Array.isArray(value)
                    ? value.slice(0, 3)
                    : value;
                promptCandidates.push({ path, type: Array.isArray(value) ? 'array' : typeof value, preview });
            };

            const explore = (node, path = '', depth = 0) => {
                if (!node || typeof node !== 'object' || visited.has(node) || depth > 4) {
                    return;
                }
                visited.add(node);

                if (Array.isArray(node)) {
                    node.forEach((entry, index) => {
                        const nextPath = path ? `${path}[${index}]` : `[${index}]`;
                        if (typeof entry === 'string' && entry.trim()) {
                            recordCandidate(nextPath, entry);
                        } else if (entry && typeof entry === 'object') {
                            explore(entry, nextPath, depth + 1);
                        }
                    });
                    return;
                }

                Object.entries(node).forEach(([key, value]) => {
                    const lowered = key.toLowerCase();
                    const nextPath = path ? `${path}.${key}` : key;

                    if (lowered.includes('prompt')) {
                        recordCandidate(nextPath, value);
                    }

                    if (value && typeof value === 'object') {
                        explore(value, nextPath, depth + 1);
                    }
                });
            };

            explore(samplePost, 'root', 0);

            console.log('[GVP][Interceptor] 🔍 Gallery sample keys:', Object.keys(samplePost).slice(0, 25));
            console.log('[GVP][Interceptor] 🔍 Gallery prompt candidates:', promptCandidates.slice(0, 10));
        } catch (error) {
            console.warn('[GVP][Interceptor] ⚠️ Failed logging gallery schema', error);
        } finally {
            this._hasLoggedGallerySchema = true;
        }
    }

    /**
     * Extract account ID from a gallery post object
     * Account ID appears in paths like:
     *   - /users/{accountId}/{imageId}/content (user uploads)
     *   - /users/{accountId}/generated/{imageId}/image.jpg (Imagine Edit)
     */
    _extractAccountIdFromGalleryPost(post) {
        if (!post || typeof post !== 'object') {
            return null;
        }

        // Regex handles both /users/{accountId}/{imageId}/ and /users/{accountId}/generated/{imageId}/
        const accountIdPattern = /\/users\/([0-9a-f-]{36})(?:\/generated)?\/[0-9a-f-]+/i;

        // Try mediaUrl first (most reliable)
        const mediaUrl = post.mediaUrl || post.imageUrl || post.url;
        if (mediaUrl && typeof mediaUrl === 'string') {
            const match = mediaUrl.match(accountIdPattern);
            if (match && match[1]) {
                return match[1];
            }
        }

        // Try thumbnailImageUrl
        const thumbUrl = post.thumbnailImageUrl || post.thumbnailUrl;
        if (thumbUrl && typeof thumbUrl === 'string') {
            const match = thumbUrl.match(accountIdPattern);
            if (match && match[1]) {
                return match[1];
            }
        }

        // Try any URL-like fields in childPosts
        if (Array.isArray(post.childPosts)) {
            for (const child of post.childPosts) {
                const childUrl = child.mediaUrl || child.thumbnailImageUrl;
                if (childUrl && typeof childUrl === 'string') {
                    const match = childUrl.match(accountIdPattern);
                    if (match && match[1]) {
                        return match[1];
                    }
                }
            }
        }

        return null;
    }

    _normalizeGalleryPost(post) {
        if (!post || typeof post !== 'object') return null;

        const imageId = post.id || post.postId || post.assetId || null;
        if (!imageId) return null;

        const createdAt = this._normalizeTimestamp(post.createdAt || post.createdDate || post.timestamp);
        const updatedAt = this._normalizeTimestamp(post.updatedAt || post.lastUpdated || post.lastAccessed);
        const childCount = typeof post.childPostsCount === 'number'
            ? post.childPostsCount
            : (Array.isArray(post.childPosts) ? post.childPosts.length : (post.childCount || 0));

        const previewUrl = this._resolveImageUrl(post);
        const fullUrl = this._resolveImageUrl(post, { preferFull: true }) || previewUrl;

        // Extract account ID from URLs (NEW)
        const accountId = this._extractAccountIdFromGalleryPost(post);

        return {
            postId: imageId, // ✅ FIX: IndexedDB keyPath requires 'postId'
            imageId,
            accountId, // NEW: Track account ID for per-account storage
            imageUrl: fullUrl || null,
            thumbnailUrl: previewUrl || fullUrl || null,
            jsonCount: childCount,
            lastAccessed: updatedAt || createdAt || Date.now(),
            createdAt: createdAt || Date.now(),
            moderated: Boolean(post.moderated || post.isModerated),
            likeStatus: Boolean(post.likeStatus || post.isLiked || post.liked),
            title: post.title || post.caption || post.prompt || '',
            modes: this._extractModes(post),
            tags: post.tags || [],
            raw: post
        };
    }

    _resolveImageUrl(post, options = {}, visited = new WeakSet()) {
        if (!post || typeof post !== 'object') return null;
        if (visited.has(post)) return null;
        visited.add(post);

        const preferFull = Boolean(options.preferFull);

        const coerceString = (value) => {
            if (typeof value === 'string') {
                const trimmed = value.trim();
                return trimmed ? trimmed : null;
            }
            return null;
        };

        const tryValue = (value) => {
            if (!value) return null;
            if (typeof value === 'string') {
                return coerceString(value);
            }
            if (Array.isArray(value)) {
                for (const entry of value) {
                    const candidate = tryValue(entry);
                    if (candidate) return candidate;
                }
                return null;
            }
            if (typeof value === 'object') {
                // common nested url fields
                const directNested = coerceString(value.url)
                    || coerceString(value.src)
                    || coerceString(value.href)
                    || coerceString(value.cdnUrl)
                    || coerceString(value.cdnUri)
                    || coerceString(value.downloadUrl)
                    || coerceString(value.signedUrl)
                    || coerceString(value.sourceUrl)
                    || coerceString(value.originalUrl);
                if (directNested) return directNested;
                return this._resolveImageUrl(value, options, visited);
            }
            return null;
        };

        const previewKeys = [
            'thumbnailUrl', 'previewUrl', 'previewImageUrl', 'previewImage',
            'coverImageUrl', 'coverUrl', 'cardImageUrl', 'thumbUrl', 'thumb',
            'primaryThumbnailUrl', 'smallImageUrl'
        ];
        const fullKeys = [
            'imageUrl', 'mediaUrl', 'url', 'sourceUrl', 'publicUrl',
            'signedUrl', 'downloadUrl', 'assetUrl', 'cdnUrl', 'cdnUri',
            'originalUrl', 'fullImageUrl', 'largeImageUrl'
        ];

        const keyOrder = preferFull ? [...fullKeys, ...previewKeys] : [...previewKeys, ...fullKeys];

        for (const key of keyOrder) {
            if (!Object.prototype.hasOwnProperty.call(post, key)) continue;
            const candidate = tryValue(post[key]);
            if (candidate) return candidate;
        }

        const objectKeys = [
            'thumbnail', 'preview', 'previewImage', 'coverImage', 'image',
            'mediaFile', 'mediaAsset', 'asset', 'primaryImage', 'featuredImage'
        ];
        for (const key of objectKeys) {
            if (!post[key]) continue;
            const candidate = tryValue(post[key]);
            if (candidate) return candidate;
        }

        const arrayKeys = [
            'thumbnails', 'previewImages', 'images', 'media', 'mediaItems',
            'assets', 'files', 'resources', 'previews', 'galleryItems',
            'mediaList', 'mediaFiles', 'attachments'
        ];
        for (const key of arrayKeys) {
            if (!post[key]) continue;
            const candidate = tryValue(post[key]);
            if (candidate) return candidate;
        }

        const graphCollections = [
            post.media?.edges,
            post.media?.nodes,
            post.assets?.edges,
            post.assets?.nodes
        ];
        for (const collection of graphCollections) {
            const candidate = tryValue(collection);
            if (candidate) return candidate;
        }

        if (Array.isArray(post.childPosts) && post.childPosts.length) {
            for (const child of post.childPosts) {
                const candidate = this._resolveImageUrl(child, options, visited);
                if (candidate) return candidate;
            }
        }

        if (Array.isArray(post.children) && post.children.length) {
            for (const child of post.children) {
                const candidate = this._resolveImageUrl(child, options, visited);
                if (candidate) return candidate;
            }
        }

        if (post.parent && typeof post.parent === 'object') {
            const candidate = this._resolveImageUrl(post.parent, options, visited);
            if (candidate) return candidate;
        }

        return null;
    }

    _normalizeTimestamp(value) {
        if (!value) return null;
        if (typeof value === 'number') return value;
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
    }

    _extractModes(post) {
        if (!post) return [];
        if (Array.isArray(post.childModes)) return post.childModes;
        if (Array.isArray(post.modes)) return post.modes;
        if (post.childPosts && Array.isArray(post.childPosts)) {
            const nestedModes = new Set();
            post.childPosts.forEach(child => {
                if (Array.isArray(child.modes)) {
                    child.modes.forEach(mode => nestedModes.add(mode));
                }
                if (Array.isArray(child.childModes)) {
                    child.childModes.forEach(mode => nestedModes.add(mode));
                }
            });
            return Array.from(nestedModes);
        }
        return [];
    }

    start() {
        try {
            const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            console.log('[GVP][Interceptor] 🔁 start() called - preparing fetch override');
            if (!w || !w.fetch) {
                console.warn('[GVP][Interceptor] ⚠️ Window context missing fetch!');
            } else {
                console.log('[GVP][Interceptor] ✅ Window fetch detected:', typeof w.fetch);
            }
            this._overrideFetch(w, {
                force: true,
                useCurrentAsOriginal: true,
                reason: 'start'
            });
            if (this.uploadAutomationManager) {
                this.uploadAutomationManager.start();
            }
        } catch (error) {
            window.Logger.error('Error handling request body', error);
        }
    }

    _overrideFetch(w, options = {}) {
        const {
            force = false,
            useCurrentAsOriginal = false,
            reason = 'unspecified'
        } = options || {};

        try {
            const targetWindow = w || (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
            if (!targetWindow || typeof targetWindow.fetch !== 'function') {
                console.warn('[GVP][Interceptor] ⚠️ Unable to install fetch override - fetch missing on target window');
                return;
            }

            const currentFetchFn = targetWindow.fetch;
            const isCurrentWrapper = this._fetchWrapper && currentFetchFn === this._fetchWrapper;

            if (!force && isCurrentWrapper) {
                console.log('[GVP][Interceptor] ⚙️ Fetch override already active; skipping reinstall');
                return;
            }

            if (isCurrentWrapper && force) {
                console.log('[GVP][Interceptor] ⚙️ Fetch wrapper already applied; no reinstall needed');
                return;
            }

            const boundFetch = currentFetchFn.bind(targetWindow);

            if (useCurrentAsOriginal || !this.originalFetch || !this._fetchOverrideInstalled) {
                this.originalFetch = boundFetch;
            }

            console.log('[GVP][Interceptor] 🔧 _overrideFetch invoked', { reason, originalType: typeof this.originalFetch });
            console.log('[GVP][Interceptor] 📄 File context:', 'src/content/managers/NetworkInterceptor.js');

            const interceptor = this;

            const fetchWrapper = async function (...args) {
                console.log('[GVP][Interceptor] 🚨 fetch wrapper triggered');
                const requestInfo = args[0];
                const requestInit = args[1] || {};

                let requestUrl = '';
                if (typeof requestInfo === 'string') {
                    requestUrl = requestInfo;
                } else if (requestInfo && typeof requestInfo.url === 'string') {
                    requestUrl = requestInfo.url;
                }

                const options = requestInit;
                const method = (options.method || (requestInfo && requestInfo.method) || 'GET').toUpperCase();
                const pageInterceptorActive = interceptor._pageInterceptorActive === true;

                interceptor._syncActiveAccountFromCookies();

                // ✅ NEW v6: Passive Account ID Detection from Asset URLs
                // Pattern: https://assets.grok.com/users/{UUID}/...
                if (requestUrl && requestUrl.includes('assets.grok.com/users/')) {
                    try {
                        const match = requestUrl.match(/users\/([a-f0-9-]{36})\//);
                        if (match && match[1]) {
                            const detectedAccountId = match[1];
                            // Only update if different to avoid spamming
                            if (interceptor.stateManager && interceptor.stateManager.state.activeAccountId !== detectedAccountId) {
                                console.log(`[GVP][Interceptor] 🕵️ Passive Account ID Detection: ${detectedAccountId.substring(0, 8)}...`);
                                interceptor.stateManager.state.activeAccountId = detectedAccountId;

                                // Trigger history load if initialized
                                if (interceptor.stateManager.indexedDBManager?.initialized) {
                                    interceptor.stateManager.loadUnifiedHistory(detectedAccountId).catch(err =>
                                        console.warn('[GVP][Interceptor] Failed to auto-load history from passive detection:', err)
                                    );
                                }
                            }
                        }
                    } catch (e) {
                        // Ignore parsing errors for passive detection
                    }
                }

                try {
                    console.log('[GVP][Interceptor] 🔍 Request details:', {
                        url: requestUrl || requestInfo,
                        method,
                        hasBody: !!options.body || (requestInfo && typeof requestInfo.text === 'function'),
                        callerStack: new Error().stack?.split('\n').slice(1, 4)
                    });
                } catch (logErr) {
                    console.warn('[GVP][Interceptor] ⚠️ Failed to log request details:', logErr);
                }

                if (requestUrl) {
                    console.log('[GVP][Interceptor] 🌐 FETCH URL:', requestUrl.substring(0, 150));
                }

                if (options && options.headers) {
                    Object.assign(interceptor.commonHeaders, options.headers);
                    console.log('[GVP][Interceptor] 🧾 Headers captured keys:', Object.keys(options.headers));
                }

                console.log('[GVP][Interceptor] 🛠 Method normalized:', method);

                if (interceptor._multiGenHistoryEnabled &&
                    method === 'GET' &&
                    typeof requestUrl === 'string' &&
                    requestUrl.includes('/content')) {
                    interceptor._handleImageContentRequest(requestUrl);
                }

                let payloadInfo = null;
                if (interceptor._multiGenHistoryEnabled &&
                    method === 'POST' &&
                    typeof requestUrl === 'string' &&
                    requestUrl.includes('/rest/app-chat/conversations/new')) {
                    payloadInfo = await interceptor._readRequestPayload(
                        requestInfo instanceof Request ? requestInfo : null,
                        options
                    );
                }

                // GVP MODIFICATION: Enhanced request logging
                if (options && options.body) {
                    try {
                        const bodyStr = options.body.toString();
                        console.log(`[NetworkInterceptor] Request body preview: `, bodyStr.substring(0, 200));

                        // Look for fileAttachments in body
                        if (bodyStr.includes('fileAttachments')) {
                            console.log(`[NetworkInterceptor] Found fileAttachments in request body`);
                            try {
                                const bodyJson = JSON.parse(bodyStr);
                                if (bodyJson.fileAttachments && bodyJson.fileAttachments.length > 0) {
                                    console.log(`[NetworkInterceptor] File attachments: `, bodyJson.fileAttachments);
                                }
                            } catch (e) {
                                console.log(`[NetworkInterceptor] Could not parse request body as JSON: `, e);
                            }
                        }
                    } catch (e) {
                        console.log(`[NetworkInterceptor] Could not read request body: `, e);
                    }
                }

                // ENHANCED: Capture request metadata for generation tracking
                let requestMetadata = {};

                const headerSnapshot = {};
                const collectHeaders = (source) => {
                    if (!source) return;
                    if (typeof Headers !== 'undefined' && source instanceof Headers) {
                        source.forEach((value, key) => {
                            headerSnapshot[key.toLowerCase()] = value;
                        });
                        return;
                    }
                    if (Array.isArray(source)) {
                        source.forEach(entry => {
                            if (Array.isArray(entry) && entry.length >= 2) {
                                headerSnapshot[String(entry[0]).toLowerCase()] = entry[1];
                            }
                        });
                        return;
                    }
                    if (typeof source === 'object') {
                        Object.entries(source).forEach(([key, value]) => {
                            headerSnapshot[String(key).toLowerCase()] = value;
                        });
                    }
                };

                collectHeaders(options?.headers);
                if (requestInfo instanceof Request && requestInfo.headers) {
                    collectHeaders(requestInfo.headers);
                }

                if (Object.keys(headerSnapshot).length) {
                    requestMetadata.headers = headerSnapshot;
                }

                const isGenerationRequest = method === 'POST' &&
                    typeof requestUrl === 'string' &&
                    requestUrl.includes('/rest/app-chat/conversations/new');

                // DEBUG: Log ALL POST requests to see what's happening
                if (method === 'POST' && typeof requestUrl === 'string') {
                    console.log('[GVP][Interceptor] 📨 POST REQUEST:', {
                        url: requestUrl,
                        isGenerationRequest,
                        multiGenEnabled: interceptor._multiGenHistoryEnabled,
                        hasPayload: !!payloadInfo
                    });
                }

                if (interceptor._multiGenHistoryEnabled && isGenerationRequest) {
                    const multiGenContext = interceptor._captureMultiGenRequestContext({
                        requestUrl,
                        method,
                        payloadInfo,
                        headers: headerSnapshot
                    });
                    if (multiGenContext) {
                        requestMetadata.multiGen = multiGenContext;
                    }
                }

                if (isGenerationRequest &&
                    interceptor.uploadAutomationManager &&
                    typeof interceptor.uploadAutomationManager.notifyGenerationStarted === 'function') {
                    try {
                        interceptor.uploadAutomationManager.notifyGenerationStarted({
                            stage: 'request',
                            url: requestUrl,
                            headers: headerSnapshot,
                            requestId: requestMetadata?.multiGen?.requestId ||
                                requestMetadata?.requestId || null
                        });
                    } catch (notifyError) {
                        console.warn('[GVP Upload] notifyGenerationStarted (request) failed', notifyError);
                    }
                }

                // Dispatch event for upload automation
                if (isGenerationRequest) {
                    window.dispatchEvent(new CustomEvent('gvp:generation-new-detected', {
                        detail: {
                            stage: 'request',
                            url: requestUrl,
                            requestId: requestMetadata?.multiGen?.requestId ||
                                requestMetadata?.requestId || null,
                            timestamp: Date.now()
                        }
                    }));
                }

                // DEBUG: Log every fetch call
                console.log('[GVP][Interceptor] 🌐 Fetch intercepted:', {
                    url: requestUrl,
                    method: method,
                    hasBody: !!options?.body,
                    bodyType: typeof options?.body,
                    isConversationsNew: requestUrl?.includes('/conversations/new'),
                    isResponses: requestUrl?.includes('/responses')
                });

                // Inject spicy mode into request
                if (options && typeof options.body === 'string' &&
                    method === 'POST' &&
                    typeof requestUrl === 'string' &&
                    (requestUrl.includes('/conversations/new') || requestUrl.includes('/responses'))) {
                    console.log('[GVP][Interceptor] ✅ Matched condition for body modification');
                    try {
                        let body = JSON.parse(options.body);
                        const state = interceptor.stateManager.getState();

                        // ENHANCED: Capture imageId from fileAttachments
                        if (body.fileAttachments && body.fileAttachments.length > 0) {
                            requestMetadata.imageId = body.fileAttachments[0];
                            requestMetadata.imageReference = body.message?.match(/https:\/\/assets\.grok\.com[^\s]+/)?.[0];
                            console.log('[GVP] 📸 Captured imageId from request:', requestMetadata.imageId);

                            // NEW: Inject upload prompt if queued
                            const uploadPrompt = state.generation.uploadPrompt;
                            if (uploadPrompt && uploadPrompt.trim()) {
                                console.log('[GVP Upload] 💉 Injecting prompt into upload:', uploadPrompt);
                                if (body.message && body.message.trim()) {
                                    body.message = `${body.message} \n\n${uploadPrompt} `.trim();
                                } else {
                                    body.message = uploadPrompt;
                                }
                                // Clear queued prompt after injection
                                state.generation.uploadPrompt = null;
                            }
                        }

                        // Capture request ID from headers
                        if (options.headers && options.headers['x-xai-request-id']) {
                            requestMetadata.requestId = options.headers['x-xai-request-id'];
                        }

                        if (!pageInterceptorActive && body.message && typeof body.message === 'string') {
                            const MODE_TOKEN_REGEX = /--mode=\S+/gi;
                            const existingModes = body.message.match(MODE_TOKEN_REGEX) || [];
                            const cleanedMessage = body.message.replace(MODE_TOKEN_REGEX, ' ')
                                .replace(/\s{2,}/g, ' ')
                                .trim();

                            if (state.generation.useSpicy) {
                                // NEW: Check if native spicy button was used
                                if (state.generation.useNativeSpicy) {
                                    console.log('[GVP Spicy] 🌶️ Native spicy mode active - still injecting tag for prompt upsampling');
                                    body.message = `${cleanedMessage} --mode=extremely - spicy - or - crazy`.trim();
                                    // Reset flag after use
                                    state.generation.useNativeSpicy = false;
                                } else {
                                    body.message = `${cleanedMessage} --mode=extremely - spicy - or - crazy`.trim();
                                    console.log('[GVP Spicy] 🌶️ Injected spicy mode tag');
                                }
                            } else if (existingModes.length > 0) {
                                body.message = `${cleanedMessage} ${existingModes[0]} `.trim();
                                console.log('[GVP Spicy] Normal mode - preserved existing mode', existingModes[0]);
                            } else {
                                body.message = `${cleanedMessage} --mode=normal`.trim();
                                console.log('[GVP Spicy] Set default mode to normal');
                            }
                        } else if (!pageInterceptorActive) {
                            console.warn('[GVP Spicy] No message field found in request body');
                        }

                        // Aurora injection - ONLY on /responses endpoint (chat mode, not video mode)
                        // Aurora runs even if page interceptor is active, since page interceptor doesn't handle /responses
                        console.log('[GVP][Interceptor] 🔍 Checking Aurora injection conditions:', {
                            url: requestUrl,
                            isResponsesEndpoint: requestUrl.includes('/responses'),
                            pageInterceptorActive: pageInterceptorActive
                        });

                        if (requestUrl.includes('/responses')) {
                            console.log('[GVP][Interceptor] 🎨 Calling Aurora injectAuroraAttachment...');
                            body = await interceptor.auroraManager.injectAuroraAttachment(body, interceptor.commonHeaders);
                            console.log('[GVP][Interceptor] ✅ Aurora injection returned');
                        } else {
                            console.log('[GVP][Interceptor] ⏭️ Not /responses endpoint, skipping Aurora');
                        }

                        // Re-stringify body if we modified it (for both spicy mode and Aurora)
                        if (!pageInterceptorActive) {
                            options.body = JSON.stringify(body);
                            args[1] = options;

                            const MODE_TOKEN_REGEX = /--mode=\S+/gi;
                            const finalModes = body.message?.match(MODE_TOKEN_REGEX) || [];
                            console.log('[GVP Spicy] Final mode tokens:', finalModes);
                        } else if (requestUrl.includes('/responses')) {
                            // If page interceptor is active but this is /responses, still need to re-stringify for Aurora
                            options.body = JSON.stringify(body);
                            args[1] = options;
                        }
                    } catch (error) {
                        console.error('[GVP] Body modification error:', error);
                    }
                }

                // Call original fetch
                let response;
                try {
                    response = await interceptor.originalFetch(...args);
                } catch (fetchError) {
                    console.error('[GVP][Interceptor] ❌ Original fetch threw error', fetchError);
                    if (typeof requestUrl === 'string' &&
                        requestUrl.includes('/rest/app-chat/upload-file') &&
                        method === 'POST' &&
                        interceptor.uploadAutomationManager &&
                        typeof interceptor.uploadAutomationManager.handleUploadFailure === 'function') {
                        interceptor.uploadAutomationManager.handleUploadFailure({
                            error: fetchError,
                            ok: false,
                            status: null
                        });
                    }
                    throw fetchError;
                }
                console.log('[GVP][Interceptor] 📥 Original fetch resolved - status:', response?.status, 'url:', requestUrl || requestInfo);

                let handledTarget = false;

                if (typeof requestUrl === 'string' &&
                    requestUrl.includes('/rest/app-chat/upload-file') &&
                    method === 'POST') {
                    handledTarget = true;
                    try {
                        const uploadClone = response.clone();
                        let uploadJson = null;
                        let parseError = null;
                        try {
                            uploadJson = await uploadClone.json();
                        } catch (error) {
                            parseError = error;
                        }

                        if (response?.ok) {
                            if (uploadJson) {
                                // Check for moderation response (HTTP 200 but code: 3 or message contains "moderated")
                                const isModerated = uploadJson.code === 3 ||
                                    (typeof uploadJson.message === 'string' &&
                                        uploadJson.message.toLowerCase().includes('moderated'));

                                if (isModerated) {
                                    console.warn('[GVP Upload] ⚠️ Image moderated:', uploadJson);

                                    // Dispatch event for listeners
                                    window.dispatchEvent(new CustomEvent('gvp:upload-moderated', {
                                        detail: {
                                            response: uploadJson,
                                            fileName: uploadJson.fileName || null,
                                            message: uploadJson.message || null,
                                            timestamp: Date.now()
                                        }
                                    }));

                                    // Notify UploadAutomationManager
                                    if (interceptor.uploadAutomationManager &&
                                        typeof interceptor.uploadAutomationManager.handleModerationDetected === 'function') {
                                        interceptor.uploadAutomationManager.handleModerationDetected({
                                            response: uploadJson,
                                            fileName: uploadJson.fileName || null,
                                            message: uploadJson.message || null,
                                            timestamp: Date.now()
                                        });
                                    }
                                } else {
                                    // Normal success path
                                    interceptor._handleUploadFileResponse(uploadJson);
                                }
                            } else {
                                console.warn('[GVP Upload] Upload response OK but parse failed', parseError);
                                if (interceptor.uploadAutomationManager) {
                                    interceptor.uploadAutomationManager.handleUploadResponse({
                                        ok: true,
                                        status: response?.status ?? null
                                    });
                                }
                            }
                        } else {
                            // Response not OK (e.g., 400, 500) - but still check for moderation!
                            // Moderation can come as HTTP 500 with JSON body: {code: 3, message: "Content is moderated..."}
                            const isModerated = uploadJson && (
                                uploadJson.code === 3 ||
                                (typeof uploadJson.message === 'string' &&
                                    uploadJson.message.toLowerCase().includes('moderated'))
                            );

                            if (isModerated) {
                                console.warn('[GVP Upload] ⚠️ Image moderated (HTTP ' + response?.status + '):', uploadJson);

                                // Dispatch event for listeners
                                window.dispatchEvent(new CustomEvent('gvp:upload-moderated', {
                                    detail: {
                                        response: uploadJson,
                                        fileName: uploadJson.fileName || null,
                                        message: uploadJson.message || null,
                                        httpStatus: response?.status,
                                        timestamp: Date.now()
                                    }
                                }));

                                // Notify UploadAutomationManager
                                if (interceptor.uploadAutomationManager &&
                                    typeof interceptor.uploadAutomationManager.handleModerationDetected === 'function') {
                                    interceptor.uploadAutomationManager.handleModerationDetected({
                                        response: uploadJson,
                                        fileName: uploadJson.fileName || null,
                                        message: uploadJson.message || null,
                                        httpStatus: response?.status,
                                        timestamp: Date.now()
                                    });
                                }
                            } else if (interceptor.uploadAutomationManager &&
                                typeof interceptor.uploadAutomationManager.handleUploadFailure === 'function') {
                                // Normal failure (not moderation)
                                interceptor.uploadAutomationManager.handleUploadFailure({
                                    status: response?.status ?? null,
                                    ok: response?.ok ?? false,
                                    response: uploadJson,
                                    error: parseError
                                });
                            }
                        }
                    } catch (error) {
                        console.warn('[GVP Upload] Failed processing upload-file response', error);
                        if (interceptor.uploadAutomationManager &&
                            typeof interceptor.uploadAutomationManager.handleUploadFailure === 'function') {
                            interceptor.uploadAutomationManager.handleUploadFailure({
                                status: response?.status ?? null,
                                ok: response?.ok ?? false,
                                error
                            });
                        }
                    }
                }

                // Intercept /conversations/new response
                if (typeof requestUrl === 'string' &&
                    requestUrl.includes('/rest/app-chat/conversations/new') &&
                    method === 'POST') {
                    handledTarget = true;
                    console.log('[GVP][Interceptor] 🎯 Matched target endpoint /rest/app-chat/conversations/new');
                    console.log('[GVP][Interceptor] 📊 Response meta:', {
                        status: response?.status,
                        ok: response?.ok,
                        type: response?.type,
                        redirected: response?.redirected
                    });

                    if (!response?.ok && interceptor.uploadAutomationManager &&
                        typeof interceptor.uploadAutomationManager.notifyUploadFailure === 'function') {
                        interceptor.uploadAutomationManager.notifyUploadFailure({
                            status: response?.status ?? null,
                            ok: response?.ok ?? false,
                            url: requestUrl,
                            stage: 'conversation',
                            requestId: requestMetadata?.multiGen?.requestId ||
                                requestMetadata?.requestId || null,
                            imageId: requestMetadata?.multiGen?.imageId || null
                        });
                    }

                    // Clone response so we can read it without consuming the original
                    if (!pageInterceptorActive && response && typeof response.clone === 'function') {
                        try {
                            const clonedResponse = response.clone();
                            console.log('[GVP][Interceptor] 🧬 Response cloned successfully');
                            // Process stream in background (async, doesn't block) - ENHANCED: pass request metadata
                            interceptor._processStream(clonedResponse, requestMetadata).catch(err =>
                                console.error('[GVP] ❌ Stream processing error:', err)
                            );
                        } catch (err) {
                            console.error('[GVP] ❌ Error cloning response:', err);
                            interceptor._finalizeMultiGenStream(requestMetadata, { error: err });
                        }
                    } else {
                        console.warn('[GVP] ❌ Response cannot be cloned');
                        interceptor._finalizeMultiGenStream(requestMetadata, { error: new Error('Response clone unavailable') });
                    }
                }

                // Intercept gallery list for batch planner
                if (typeof requestUrl === 'string' &&
                    requestUrl.includes('/rest/media/post/list') &&
                    method === 'POST') {
                    handledTarget = true;
                    console.log('[GVP][Interceptor] 🎯 Matched gallery endpoint /rest/media/post/list');
                    try {
                        const galleryClone = response.clone();
                        interceptor._processGalleryResponse(galleryClone, { url: requestUrl, options }).catch(err => {
                            console.error('[GVP] ❌ Gallery processing error:', err);
                        });
                    } catch (err) {
                        console.error('[GVP] ❌ Unable to clone gallery response:', err);
                    }
                }

                if (typeof requestUrl === 'string' &&
                    requestUrl.includes('/rest/media/post/get') &&
                    method === 'POST') {
                    handledTarget = true;
                    console.log('[GVP][Interceptor] 🎯 Matched post endpoint /rest/media/post/get');
                    try {
                        const postGetClone = response.clone();
                        interceptor._processPostGetResponse(postGetClone, {
                            url: requestUrl,
                            options,
                            source: 'post-get'
                        }).catch(err => {
                            console.error('[GVP] ❌ Post/get processing error:', err);
                        });
                    } catch (err) {
                        console.error('[GVP] ❌ Unable to clone post/get response:', err);
                    }
                }

                if (!handledTarget) {
                    console.log('[GVP][Interceptor] ⏭ Non-target request completed');
                }
                return response;
            };

            this._fetchWrapper = fetchWrapper;
            targetWindow.fetch = fetchWrapper;
            this._fetchOverrideInstalled = true;

            console.log('[GVP][Interceptor] ✅ Fetch override installed successfully', { reason });
        } catch (error) {
            console.error('[GVP] ❌ Fetch override failed:', error);
        }
    }

    _syncActiveAccountFromCookies() {
        // Stub to prevent TypeError.
        // Active account synchronization is currently handled by:
        // 1. Passive URL detection in fetchWrapper
        // 2. StateManager initialization from storage
    }

    async _processStream(response, requestMetadata = {}) {
        console.log('[GVP][Interceptor] 📡 _processStream invoked with metadata:', requestMetadata);
        if (!response) {
            console.warn('[GVP][Interceptor] ⚠️ No response provided to _processStream');
            return;
        }
        if (!response.body) {
            console.warn('[GVP][Interceptor] ⚠️ Response has no body - cannot read stream');
            return;
        }
        const meta = requestMetadata || {};
        if (meta.multiGen && !Array.isArray(meta.multiGen.rawChunks)) {
            meta.multiGen.rawChunks = [];
        }
        let streamError = null;

        try {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let chunkCount = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunkCount += 1;
                const decodedChunk = decoder.decode(value, { stream: true });
                buffer += decodedChunk;
                if (meta.multiGen) {
                    meta.multiGen.rawChunks.push(decodedChunk);
                }
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.trim()) {
                        console.log('[GVP][Interceptor] 📨 Processing line chunk - length:', line.length);
                        this._processLine(line, meta);
                    }
                }
            }

            const tail = decoder.decode();
            if (tail) {
                buffer += tail;
                if (meta.multiGen) {
                    meta.multiGen.rawChunks.push(tail);
                }
            }

            if (buffer.trim()) {
                console.log('[GVP][Interceptor] 📨 Processing trailing buffer - length:', buffer.length);
                this._processLine(buffer, meta);
            }

            console.log('[GVP][Interceptor] ✅ Stream processing completed - chunks read:', chunkCount);
        } catch (error) {
            console.error('[GVP] ❌ Stream reading error:', error);
            streamError = error;
        } finally {
            this._finalizeMultiGenStream(meta, { error: streamError });
        }
    }

    _processLine(line, requestMetadata = null) {
        try {
            console.log('[GVP][Interceptor] 🧾 _processLine received line prefix:', line.substring(0, 80));

            // Enhanced JSON parsing with detailed logging
            const lineStr = line.trim();
            if (!lineStr) {
                console.log('[NetworkInterceptor] Skipping empty line');
                return;
            }

            // Handle SSE format: "data: {...}" or plain NDJSON: "{...}"
            let jsonString = lineStr;
            if (lineStr.startsWith('data: ')) {
                jsonString = lineStr.substring(6);
                console.log('[GVP][Interceptor] 🔄 Stripped SSE data prefix');
            }

            // Enhanced JSON parsing with error handling
            let obj;
            try {
                obj = JSON.parse(jsonString);

                // Enhanced logging for debugging JSON issues
                console.log(`[NetworkInterceptor] Successfully parsed JSON: `, {
                    hasVideoId: !!obj?.result?.response?.streamingVideoGenerationResponse?.videoId,
                    hasProgress: obj?.result?.response?.streamingVideoGenerationResponse?.progress !== undefined,
                    hasModerated: obj?.result?.response?.streamingVideoGenerationResponse?.moderated !== undefined,
                    hasImageReference: !!obj?.result?.response?.streamingVideoGenerationResponse?.imageReference,
                    hasVideoPrompt: !!obj?.result?.response?.streamingVideoGenerationResponse?.videoPrompt,
                    progress: obj?.result?.response?.streamingVideoGenerationResponse?.progress
                });

            } catch (e) {
                console.log(`[NetworkInterceptor] Failed to parse JSON line: ${jsonString.substring(0, 100)}...`, e);
                console.log(`[NetworkInterceptor] Problematic line: "${jsonString}"`);
                return;
            }

            const meta = requestMetadata || {};
            const videoData = obj?.result?.response?.streamingVideoGenerationResponse;

            this._handleMultiGenStreamPayload(obj, meta);
            if (!videoData) return;

            // ENHANCED: Correlate response with request using imageId or videoId
            if (videoData.videoId && meta && (meta.imageId || meta.multiGen)) {
                const imageId = meta.imageId || meta.multiGen?.imageId || null;
                const imageReference = videoData.imageReference || meta.imageReference || meta.multiGen?.imageReference;

                // Try to find existing generation by imageId
                let generation = this.stateManager.findGenerationByImageId(imageId);

                // If not found by imageId, try by videoId
                if (!generation) {
                    generation = this.stateManager.findGenerationByVideoId(videoData.videoId);
                }

                // If still not found and we have imageId, this is the first response - associate videoId
                if (!generation && imageId) {
                    generation = this.stateManager.findGenerationByImageId(imageId);
                    if (generation) {
                        this.stateManager.updateGeneration(generation.id, {
                            videoId: videoData.videoId,
                            imageReference: imageReference
                        });
                        console.log(`[GVP] 🔗 Associated videoId ${videoData.videoId} with imageId ${imageId} `);
                    }
                }

                // Update generation with progress
                if (generation) {
                    const normalizedProgress = this._coerceProgressValue(
                        videoData.progress ?? videoData.progressValue ?? videoData.percent
                    );

                    const updates = {
                        moderated: videoData.moderated || generation.moderated,
                        status: videoData.moderated ? 'moderated' : 'generating'
                    };

                    if (normalizedProgress !== null) {
                        updates.progress = normalizedProgress;
                    }

                    if (videoData.moderated && !generation.moderated) {
                        updates.moderationTimestamp = Date.now();
                        console.log(`[GVP] ⚠️ Generation ${generation.id} was moderated`);
                    }

                    this.stateManager.updateGeneration(generation.id, updates);
                }
            }

            const chunkProgress = this._coerceProgressValue(
                videoData.progress ?? videoData.progressValue ?? videoData.percent ?? videoData.progressPercent
            );

            if (chunkProgress !== null) {
                console.log(`[GVP] 📊 Progress: ${chunkProgress}% (videoId: ${videoData.videoId})`);

                // Add to API monitoring when generation is detected
                if (videoData.videoId) {
                    // Extract imageId from imageReference or use videoId as fallback
                    const imageId = this._extractImageIdFromReference(videoData.imageReference) || videoData.videoId;

                    if (window.gvpProgressAPI?.addGeneration) {
                        window.gvpProgressAPI.addGeneration(videoData.videoId, imageId);
                        console.log('[GVP] Added to API monitoring:', {
                            videoId: videoData.videoId,
                            imageId: imageId,
                            imageReference: videoData.imageReference
                        });
                    }

                    if (window.gvpUIProgressAPI?.addGeneration) {
                        window.gvpUIProgressAPI.addGeneration(videoData.videoId, imageId);
                        console.log('[GVP API Progress] Added generation to monitor:', {
                            videoId: videoData.videoId,
                            imageId: imageId
                        });
                    }

                    // NEW: Emit gvp:rail-progress for Generation Rail UI
                    const thumbnailUrl = videoData.imageReference ||
                        meta?.multiGen?.thumbnailUrl ||
                        meta?.imageReference ||
                        null;

                    window.dispatchEvent(new CustomEvent('gvp:rail-progress', {
                        detail: {
                            videoId: videoData.videoId,
                            imageId: imageId,
                            // parentPostId is imageId - the correct ID for /imagine/post/{id} navigation
                            parentPostId: imageId,
                            progress: chunkProgress,
                            moderated: videoData.moderated === true,
                            thumbnailUrl: thumbnailUrl
                        }
                    }));
                }
            }

            // CRITICAL: Only extract at progress=100
            if (chunkProgress !== null && chunkProgress >= 100) {
                window.Logger.info('[GVP][Interceptor] 🎉 Progress reached 100!');
                window.Logger.info('[GVP][Interceptor] 🎥 videoUrl:', videoData.videoUrl);
                window.Logger.info('[GVP][Interceptor] 📦 assetId:', videoData.assetId);

                if (videoData.moderated) {
                    window.Logger.warn('[GVP] ⚠️ Content moderated');
                }

                if (videoData.videoPrompt && videoData.videoPrompt.trim()) {
                    window.Logger.info('[GVP][Interceptor] 📝 videoPrompt length:', videoData.videoPrompt.length);
                    this._parseAndSetPromptData(videoData.videoPrompt);
                } else {
                    console.log('[GVP][Interceptor] ⚠️ videoPrompt empty or missing at progress 100');
                }
            }

        } catch (error) {
            // Silently ignore parse errors for non-JSON lines
            if (!line.trim().startsWith('{') && !line.trim().startsWith('data:')) {
                return;
            }
            console.error('[GVP][Interceptor] ❌ Line processing error:', error);
            console.error('[GVP][Interceptor] ❌ Problem line preview:', line.substring(0, 200));
        }
    }

    async _attemptPromptFetchFallback({ imageId, assetId, videoId, source = 'bridge-fallback' } = {}) {
        const targetId = imageId || assetId || null;
        if (!targetId) {
            console.warn('[GVP][Interceptor] Prompt fallback aborted - no target id resolved');
            return null;
        }

        const uiManager = window.gvpUIManager;
        if (!uiManager) {
            console.warn('[GVP][Interceptor] Prompt fallback aborted - UIManager unavailable');
            return null;
        }

        const fetchFn = typeof uiManager._fetchPostPayload === 'function'
            ? uiManager._fetchPostPayload.bind(uiManager)
            : null;
        const processFn = typeof uiManager._processFetchedPostPayload === 'function'
            ? uiManager._processFetchedPostPayload.bind(uiManager)
            : null;

        if (!fetchFn || !processFn) {
            console.warn('[GVP][Interceptor] Prompt fallback aborted - UIManager helpers missing');
            return null;
        }

        try {
            const beforePrompt = this.stateManager?.getState?.()?.generation?.lastPrompt || null;
            const payload = await fetchFn(targetId);
            if (!payload) {
                console.warn('[GVP][Interceptor] Prompt fallback fetch returned empty payload', { targetId, source });
                return null;
            }

            processFn(payload, {
                imageId: targetId,
                assetId: assetId || null,
                videoId: videoId || null,
                source
            });

            const afterPrompt = this.stateManager?.getState?.()?.generation?.lastPrompt || null;
            if (afterPrompt && afterPrompt !== beforePrompt) {
                return afterPrompt;
            }

            return null;
        } catch (error) {
            console.error('[GVP][Interceptor] Prompt fallback via /rest/media/post/get failed:', error);
            return null;
        }
    }

    _parseStreamLine(line) {
        if (!line) return null;

        let trimmed = line.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith('event:') || trimmed.startsWith('id:') || trimmed === '[DONE]') {
            return null;
        }

        if (trimmed.startsWith('data:')) {
            trimmed = trimmed.substring(5).trim();
        }

        const firstBrace = trimmed.indexOf('{');
        if (firstBrace > 0) {
            trimmed = trimmed.substring(firstBrace);
        }

        if (!trimmed.startsWith('{')) {
            return null;
        }

        try {
            return JSON.parse(trimmed);
        } catch (error) {
            console.warn('[GVP] Failed to parse stream line as JSON:', trimmed.substring(0, 200));
            return null;
        }
    }

    _extractJsonObjects(rawStream) {
        if (!rawStream) {
            return [];
        }

        const sanitized = rawStream
            .replace(/^data:\s*/gm, '')
            .replace(/\r/g, '');

        const results = [];
        const seen = new Set();
        let depth = 0;
        let startIndex = -1;
        let inString = false;
        let isEscaped = false;

        for (let i = 0; i < sanitized.length; i++) {
            const char = sanitized[i];

            if (inString) {
                if (isEscaped) {
                    isEscaped = false;
                    continue;
                }
                if (char === '\\') {
                    isEscaped = true;
                    continue;
                }
                if (char === '"') {
                    inString = false;
                }
                continue;
            }

            if (char === '"') {
                inString = true;
                continue;
            }

            if (char === '{') {
                if (depth === 0) {
                    startIndex = i;
                }
                depth++;
            } else if (char === '}') {
                if (depth > 0) {
                    depth--;
                    if (depth === 0 && startIndex !== -1) {
                        const candidate = sanitized.slice(startIndex, i + 1);
                        startIndex = -1;
                        try {
                            const parsed = JSON.parse(candidate);
                            const dedupeKey = JSON.stringify(parsed);
                            if (!seen.has(dedupeKey)) {
                                seen.add(dedupeKey);
                                results.push(parsed);
                            }
                        } catch (parseError) {
                            console.warn('[GVP] Failed to parse candidate JSON chunk:', candidate.substring(0, 200));
                        }
                    }
                }
            }
        }

        return results;
    }

    async _processPayloadEvents(payloads, context = {}) {
        const { source = 'stream' } = context;
        Logger.debug(`Processing payload events from ${source} (count = ${payloads.length})`);

        let finalVideoPrompt = null;
        let videoUrl = null;
        let assetId = null;
        let wasModerated = false;
        let moderationReason = null;
        let progressReached100 = false;
        let progress100MissingPrompt = false;
        const progressValues = [];
        let modelName = null;
        let mode = null;
        let imageReference = null;
        let userMessageUrl = null;
        let parentPostId = null;
        let videoId = null;
        let accountId = null;

        for (const payload of payloads) {
            if (!payload || typeof payload !== 'object') continue;

            if (ModerationDetector.detectModeratedContent(payload)) {
                wasModerated = true;
                moderationReason = moderationReason || ModerationDetector.extractModerationReason(payload);
            }

            const userResponse = payload?.result?.response?.userResponse;
            if (userResponse) {
                if (!userMessageUrl && typeof userResponse.message === 'string') {
                    userMessageUrl = this._extractImageUrlFromMessage(userResponse.message) || userMessageUrl;
                }

                const parentId = userResponse?.metadata?.modelConfigOverride?.modelMap?.videoGenModelConfig?.parentPostId;
                if (parentId) {
                    parentPostId = parentId;
                }
            }

            const videoResponse = payload?.result?.response?.streamingVideoGenerationResponse ||
                payload?.streamingVideoGenerationResponse ||
                payload?.result?.streamingVideoGenerationResponse;

            if (!videoResponse) continue;

            if (!modelName && videoResponse.modelName) {
                modelName = videoResponse.modelName;
            }

            if (videoResponse.mode) {
                mode = videoResponse.mode;
            }

            if (videoResponse.imageReference) {
                imageReference = videoResponse.imageReference;
            }

            if (videoResponse.videoId) {
                videoId = videoResponse.videoId;
            }

            const progressRaw = videoResponse.progress ??
                videoResponse.progressValue ??
                videoResponse.progressPercent ??
                videoResponse.progress_percentage ??
                videoResponse.percentage ??
                videoResponse.percent ??
                (typeof videoResponse.status === 'object' ? videoResponse.status?.progress : null);
            const normalizedProgress = this._coerceProgressValue(progressRaw);

            if (normalizedProgress !== null) {
                progressValues.push(normalizedProgress);

                // PERSISTENCE FIX: Store progress in metadata for finalization
                if (context) {
                    context.lastProgress = normalizedProgress;
                    if (!wasModerated && normalizedProgress < 100) {
                        context.lastValidProgress = normalizedProgress;
                    }
                }

                Logger.debug(`📊 Progress: ${normalizedProgress}% `);

                // Feed progress to API progress monitor
                if (window.gvpUIProgressAPI) {
                    window.gvpUIProgressAPI.processStreamResponse(payload);
                }

                // Emit gvp:rail-progress for Generation Rail UI
                if (videoId) {
                    const extractedImageId = this._extractImageIdFromReference(imageReference) || videoId;
                    // Use videoResponse.moderated directly (wasModerated is updated later in the loop)
                    const isModerated = videoResponse.moderated === true || wasModerated;
                    window.dispatchEvent(new CustomEvent('gvp:rail-progress', {
                        detail: {
                            videoId: videoId,
                            imageId: extractedImageId,
                            // parentPostId is the correct ID for /imagine/post/{id} navigation
                            parentPostId: parentPostId || extractedImageId,
                            progress: normalizedProgress,
                            moderated: isModerated,
                            thumbnailUrl: imageReference || null
                        }
                    }));
                }
            }

            const { videoPrompt } = videoResponse;

            if (videoResponse.moderated === true) {
                wasModerated = true;
                if (!moderationReason) {
                    moderationReason = 'Content flagged by moderation system';
                }
            }

            if (normalizedProgress !== null && normalizedProgress >= 100) {
                progressReached100 = true;
                Logger.info('✅ Progress 100 reached!');

                if (videoResponse.videoUrl) {
                    videoUrl = videoResponse.videoUrl;
                    Logger.info('🎬 Found videoUrl:', videoUrl.substring(0, 50) + '...');
                    if (!accountId) {
                        accountId = this._extractAccountIdFromVideoUrl(videoUrl);
                    }
                }
                if (videoResponse.assetId) {
                    assetId = videoResponse.assetId;
                    console.log('[GVP] 📦 Found assetId:', assetId);
                }

                if (typeof videoPrompt === 'string' && videoPrompt.trim()) {
                    finalVideoPrompt = videoPrompt;
                    console.log('[GVP] 📝 Found videoPrompt! Length:', videoPrompt.length);
                } else {
                    progress100MissingPrompt = true;
                    console.log('[GVP] ⚠️ Progress 100 but videoPrompt empty or missing');
                }
            }
        }

        if (wasModerated) {
            await this._handleModerationEvent(moderationReason);
        }

        if (!accountId && videoUrl) {
            accountId = this._extractAccountIdFromVideoUrl(videoUrl);
        }

        let resolvedImageId = this._resolveImageId({
            parentPostId,
            imageReference,
            messageUrl: userMessageUrl
        });

        if (!resolvedImageId && window.gvpUIManager) {
            try {
                if (typeof window.gvpUIManager._resolveActiveImageId === 'function') {
                    resolvedImageId = window.gvpUIManager._resolveActiveImageId();
                }
                if (!resolvedImageId && typeof window.gvpUIManager._lastResolvedImageId === 'string') {
                    resolvedImageId = window.gvpUIManager._lastResolvedImageId;
                }
            } catch (uiResolveError) {
                console.warn('[GVP] ⚠️ Failed resolving image id via UI manager:', uiResolveError);
            }
        }

        if (!resolvedImageId && window.gvpImageProjectManager && typeof window.gvpImageProjectManager.ensureActiveContext === 'function') {
            const ctx = window.gvpImageProjectManager.ensureActiveContext();
            if (ctx?.imageId) {
                resolvedImageId = ctx.imageId;
                if (!accountId && ctx.accountId) {
                    accountId = ctx.accountId;
                }
            }
        }

        if (!finalVideoPrompt && progressReached100 && resolvedImageId) {
            let shouldAttemptFallback = true;
            let metaRecord = null;

            if (videoId) {
                metaRecord = this._bridgeMetadataByVideoId.get(videoId) || {};
                if (metaRecord.fallbackCompleted) {
                    shouldAttemptFallback = false;
                } else if (metaRecord.fallbackInFlight) {
                    shouldAttemptFallback = false;
                } else {
                    metaRecord.fallbackInFlight = true;
                    this._bridgeMetadataByVideoId.set(videoId, metaRecord);
                }
            }

            if (shouldAttemptFallback) {
                /* Temporarily disabling /rest/media/post/get fallback fetch.
               Grok no longer serves the JSON prompt there and this path now generates 404 noise.
               When the backend resumes supporting it, remove this guard and re-enable. */
                const fallbackPrompt = null;

                const trimmedFallback = typeof fallbackPrompt === 'string' ? fallbackPrompt.trim() : '';

                if (trimmedFallback) {
                    finalVideoPrompt = trimmedFallback;
                    progress100MissingPrompt = false;

                    if (videoId) {
                        metaRecord = this._bridgeMetadataByVideoId.get(videoId) || metaRecord || {};
                        metaRecord.videoPrompt = trimmedFallback;
                        metaRecord.fallbackCompleted = true;
                        metaRecord.fallbackInFlight = false;
                        this._bridgeMetadataByVideoId.set(videoId, metaRecord);
                    }

                    console.log('[GVP][Interceptor] ✅ Prompt fallback succeeded via /rest/media/post/get');
                } else if (videoId) {
                    metaRecord = this._bridgeMetadataByVideoId.get(videoId) || metaRecord || {};
                    metaRecord.fallbackInFlight = false;
                    this._bridgeMetadataByVideoId.set(videoId, metaRecord);
                }
            }
        }

        if (finalVideoPrompt) {
            console.log('[GVP] ? videoPrompt captured from response. Length:', finalVideoPrompt.length);
            console.log('[GVP] videoPrompt preview:', finalVideoPrompt.substring(0, 300) + '...');

            const trimmedFinal = typeof finalVideoPrompt === 'string' ? finalVideoPrompt.trim() : '';
            const looksLikeJson = trimmedFinal.startsWith('{') || trimmedFinal.startsWith('[');
            await this._parseAndSetPromptData(finalVideoPrompt);

            if (looksLikeJson) {
                const stateAccountId = this.stateManager?.getState()?.account?.id || null;
                const modelName = payload?.message?.modelName
                    || payload?.message?.model_name
                    || null;

                const historyManager = window.gvpImageProjectManager;
                if (historyManager) {
                    let historyAccountId = accountId || stateAccountId || null;
                    if (!historyAccountId && typeof historyManager.ensureActiveContext === 'function') {
                        const ctx = historyManager.ensureActiveContext();
                        if (ctx?.accountId) {
                            historyAccountId = ctx.accountId;
                        }
                    }
                    const activeHistoryAccount = historyAccountId || 'account:unknown';
                    if (resolvedImageId) {
                        try {
                            historyManager.setActiveAccount(activeHistoryAccount);
                            historyManager.registerImageProject(
                                activeHistoryAccount,
                                resolvedImageId,
                                {
                                    type: looksLikeJson ? 'json' : 'raw',
                                    prompt: trimmedFinal,
                                    modelName: modelName || null,
                                    mode: mode || null,
                                    moderated: wasModerated,
                                    timestamp: Date.now(),
                                    source: 'generation',
                                    videoId: videoId || null,
                                    videoUrl: videoUrl || null,
                                    assetId: assetId || null,
                                    imageReference: imageReference || userMessageUrl || null
                                },
                                {
                                    id: videoId || assetId || `gen_${Date.now()} `,
                                    timestamp: Date.now(),
                                    injectedMode: mode || null,
                                    originalMode: mode || null,
                                    modelName: modelName || null,
                                    mediaUrl: videoUrl || null,
                                    isRefused: wasModerated,
                                    metadata: {
                                        parentPostId: parentPostId || null
                                    }
                                }
                            );
                        } catch (historyError) {
                            console.error('[GVP] ❌ Failed to record prompt history:', historyError);
                        }
                    } else {
                        console.warn('[GVP] ⚠️ Skipped prompt history logging - unresolved imageId', {
                            accountId: activeHistoryAccount,
                            parentPostId,
                            imageReference,
                            userMessageUrl
                        });
                    }
                }
            }

        }

        // ✅ Save to unified history for ALL completed videos (regardless of prompt)
        if (progressReached100 && resolvedImageId && accountId) {
            try {
                // PERSISTENCE FIX: Get authoritative progress from StateManager
                let finalProgress = 100;
                if (wasModerated) {
                    const trackedProgress = this.stateManager?.getGenerationProgress?.(videoId || assetId);
                    finalProgress = trackedProgress?.progress || meta?.lastValidProgress || 0;
                    console.log('[GVP][Interceptor] 🛑 Moderated video finalization. Using progress:', finalProgress);
                }

                // Build unified entry for this completed generation
                // Detect if source image is from Imagine Edit (has /generated/ in path)
                const isEditedImage = imageReference && imageReference.includes('/generated/');
                const sourceImageId = isEditedImage ? this._extractImageIdFromUrl(imageReference) : null;

                const unifiedEntry = {
                    imageId: resolvedImageId,
                    accountId: accountId,
                    thumbnailUrl: imageReference || userMessageUrl || null,
                    // NEW: Track if source was an edited image
                    isEditedImage: isEditedImage || false,
                    sourceImageId: sourceImageId,
                    attempts: [{
                        id: videoId || assetId || `gen_${Date.now()} `,
                        videoUrl: videoUrl ? videoUrl.split('?')[0] : null,
                        thumbnailUrl: imageReference ? imageReference.split('?')[0] : null,
                        videoPrompt: finalVideoPrompt || '',
                        mode: mode || 'normal',
                        modelName: modelName || 'imagine_xdit_1',
                        timestamp: new Date().toISOString(),
                        status: wasModerated ? 'moderated' : 'success',
                        moderated: wasModerated,
                        progress: finalProgress,
                        lastProgress: finalProgress
                    }],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                // Save to IndexedDB via StateManager
                if (this.stateManager?.indexedDBManager) {
                    const saved = await this.stateManager.indexedDBManager.saveUnifiedEntry(unifiedEntry);

                    if (saved) {
                        console.log('[GVP][Interceptor] ✅ Saved to unified history:', resolvedImageId);

                        // 🔧 FIX v1.21.35: Incremental state update to prevent UI staleness
                        // The redundancy guard in StateManager skips loadUnifiedHistory() if data is already loaded.
                        // We must manually push new entries to state.unifiedHistory for immediate UI updates.
                        if (this.stateManager?.state?.unifiedHistory) {
                            const existingIndex = this.stateManager.state.unifiedHistory.findIndex(
                                e => e.imageId === resolvedImageId
                            );
                            if (existingIndex >= 0) {
                                // Merge attempt into existing entry
                                const existing = this.stateManager.state.unifiedHistory[existingIndex];
                                if (!existing.attempts) existing.attempts = [];
                                const attemptId = videoId || assetId;
                                if (!existing.attempts.some(a => a.id === attemptId)) {
                                    existing.attempts.unshift(unifiedEntry.attempts[0]);
                                    existing.updatedAt = unifiedEntry.updatedAt;
                                    console.log('[GVP][Interceptor] 📝 Merged attempt into existing entry in-memory');
                                }
                            } else {
                                // Add as new entry at the beginning (newest first)
                                this.stateManager.state.unifiedHistory.unshift(unifiedEntry);
                                console.log('[GVP][Interceptor] ➕ Added new entry to state.unifiedHistory in-memory');
                            }
                        }

                        // Trigger UI update
                        window.dispatchEvent(new CustomEvent('gvp:multi-gen-history-update', {
                            detail: {
                                type: 'attempt-completed',
                                imageId: resolvedImageId,
                                attemptId: videoId || assetId,
                                status: wasModerated ? 'moderated' : 'success'
                            }
                        }));
                    } else {
                        console.error('[GVP][Interceptor] ❌ Failed to save to unified history (returned false):', {
                            imageId: resolvedImageId,
                            accountId: accountId?.substring(0, 12),
                            hasEntry: !!unifiedEntry
                        });
                    }
                } else {
                    console.warn('[GVP][Interceptor] ⚠️ Cannot save - no stateManager or indexedDBManager');
                }
            } catch (unifiedHistoryError) {
                console.error('[GVP][Interceptor] ❌ Failed to save to unified history:', unifiedHistoryError);
            }
        }

        if (progress100MissingPrompt) {
            console.info(`[GVP] Progress reached 100 in ${source} but no JSON prompt was provided(Moderated = ${wasModerated}).`);
        } else if (!progressValues.length) {
            console.log('[GVP] No streaming video responses found in payloads');
        }

        const state = this.stateManager.getState();
        const currentGenId = state.generation.currentGenerationId;

        if (currentGenId) {
            const newStatus = wasModerated ? 'moderated'
                : finalVideoPrompt ? 'completed'
                    : state.generation.status;

            this.stateManager.updateGeneration(currentGenId, {
                videoUrl: videoUrl || null,
                assetId: assetId || null,
                finalPrompt: finalVideoPrompt || null,
                status: newStatus,
                modelName: modelName || null,
                mode: mode || null,
                imageId: resolvedImageId || null,
                accountId: accountId || null,
                videoId: videoId || null
            });

            if (!wasModerated && finalVideoPrompt && videoUrl) {
                this.stateManager.completeGeneration(currentGenId, {
                    videoUrl,
                    assetId
                });

                if (window.gvpUIManager) {
                    window.gvpUIManager.updateGenerationStatus('completed', { generationId: currentGenId });
                    window.gvpUIManager.updateProgressBar(100);
                }
            }
        }

        if (progressValues.length) {
            Logger.debug('Stream progress values:', progressValues.join(', '));
            if (!progressReached100) {
                console.debug('[GVP] Stream ended before progress reached 100. Last progress:', progressValues[progressValues.length - 1]);
            }
        }

        if (accountId) {
            this._setActiveAccount(accountId, 'stream-summary');
        }
    }

    _extractAccountIdFromVideoUrl(videoUrl) {
        if (!videoUrl || typeof videoUrl !== 'string') {
            return null;
        }

        const match = videoUrl.match(/users\/([^\/]+)/i);
        return match ? match[1] : null;
    }

    _extractImageUrlFromMessage(message) {
        if (!message || typeof message !== 'string') {
            return null;
        }

        const match = message.match(/https?:\/\/[^\s]+/i);
        return match ? match[0] : null;
    }

    _extractImageIdFromUrl(url) {
        if (!url || typeof url !== 'string') {
            return null;
        }

        const uuidMatch = url.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
        if (uuidMatch) {
            return uuidMatch[1];
        }

        const segments = url.split(/[\/]/).filter(Boolean);
        if (!segments.length) {
            return null;
        }

        const lastSegment = segments[segments.length - 1];
        const withoutQuery = lastSegment.split(/[?#]/)[0];
        const idCandidate = withoutQuery.includes('.') ? withoutQuery.substring(0, withoutQuery.lastIndexOf('.')) : withoutQuery;
        return idCandidate || null;
    }

    _resolveImageId({ parentPostId, imageReference, messageUrl }) {
        if (parentPostId) {
            return parentPostId;
        }

        const fromReference = this._extractImageIdFromUrl(imageReference);
        if (fromReference) {
            return fromReference;
        }

        const fromMessage = this._extractImageIdFromUrl(messageUrl);
        if (fromMessage) {
            return fromMessage;
        }

        return null;
    }

    async _handleModerationEvent(reason) {
        const state = this.stateManager.getState();
        const currentGenId = state.generation.currentGenerationId;

        if (!currentGenId) {
            console.warn('[GVP] Moderation detected but no active generation');
            return;
        }

        const moderationData = state.generation.moderationData;
        const settings = state.settings;

        moderationData.isModerated = true;
        moderationData.moderationReason = reason;
        moderationData.retryCount++;
        moderationData.lastRetryTime = Date.now();

        moderationData.retryHistory.push({
            attemptNumber: moderationData.retryCount,
            timestamp: Date.now(),
            reason: reason,
            generationId: currentGenId,
            success: false
        });

        console.log(`[GVP] Moderation event recorded(attempt ${moderationData.retryCount})`);

        if (window.gvpUIManager) {
            if (typeof window.gvpUIManager.updateRetryStatistics === 'function') {
                window.gvpUIManager.updateRetryStatistics();
            } else {
                console.debug('[GVP][Interceptor] updateRetryStatistics hook missing on UIManager');
            }
            window.gvpUIManager.updateGenerationStatus('moderated', {
                reason: moderationData.moderationReason,
                retryCount: moderationData.retryCount,
                maxRetries: settings.maxModerationRetries || this.retryManager.maxRetries || 3,
                generationId: currentGenId
            });
        }

        this.stateManager.updateGeneration(currentGenId, {
            isRefused: true,
            moderationRetryCount: moderationData.retryCount,
            status: 'moderated'
        });

        if (settings.autoRetryOnModeration) {
            console.log('[GVP] ?? Auto-retry enabled - initiating retry logic...');
            await this.retryManager.handleModeratedGeneration(currentGenId);
        }
    }

    async handleBridgeProgress(payload = {}) {
        const progressValue = this._coerceProgressValue(
            payload?.progress ?? payload?.progressValue ?? payload?.percent ?? payload?.progressPercent
        );
        if (progressValue === null) {
            return;
        }

        console.log('[GVP][Interceptor] Bridge progress payload received:', {
            progress: progressValue,
            videoId: payload?.videoId || null,
            hasRaw: typeof payload?.raw === 'string',
            mode: payload?.mode || null
        });

        const requestId = typeof payload?.requestId === 'string' ? payload.requestId : null;

        let requestContext = null;
        if (requestId) {
            requestContext = this._bridgeRequestsById.get(requestId) || null;
        }

        const multiGenMeta = requestContext ? { multiGen: requestContext } : null;

        if (requestContext && Array.isArray(requestContext.rawChunks) && typeof payload?.raw === 'string') {
            requestContext.rawChunks.push(payload.raw);
        }

        if (payload?.videoId) {
            // Add to API monitoring for Quick JSON mode
            const alreadyAdded = window.gvpUIProgressAPI?.activeGenerations?.has(payload.videoId);

            if (!alreadyAdded) {
                const imageId = payload.videoId; // Use videoId as imageId for Quick JSON mode

                if (window.gvpProgressAPI?.addGeneration) {
                    window.gvpProgressAPI.addGeneration(payload.videoId, imageId);
                    console.log('[GVP] Added to API monitoring (Quick JSON):', {
                        videoId: payload.videoId,
                        imageId: imageId,
                        progress: progressValue
                    });
                }

                if (window.gvpUIProgressAPI?.addGeneration) {
                    window.gvpUIProgressAPI.addGeneration(payload.videoId, imageId);
                    console.log('[GVP API Progress] Added generation to monitor (Quick JSON):', {
                        videoId: payload.videoId,
                        imageId: imageId,
                        progress: progressValue
                    });
                }
            }

            const existing = this._bridgeMetadataByVideoId.get(payload.videoId) || {};
            this._bridgeMetadataByVideoId.set(payload.videoId, {
                ...existing,
                progress: progressValue,
                moderated: payload?.moderated === true,
                imageReference: payload?.imageReference || existing.imageReference || null,
                mode: payload?.mode || existing.mode || null,
                modelName: payload?.modelName || existing.modelName || null,
                url: payload?.url || existing.url || null,
                requestId: requestId || existing.requestId || null
            });
        }

        let processed = false;

        if (typeof payload?.raw === 'string') {
            const rawText = payload.raw.trim();
            const looksJson = rawText.startsWith('{') || rawText.startsWith('[');
            if (looksJson) {
                try {
                    const parsed = JSON.parse(rawText);
                    if (multiGenMeta) {
                        await this._handleMultiGenStreamPayload(parsed, multiGenMeta);
                    }
                    await this._processPayloadEvents([parsed], { source: 'bridge-progress' });
                    processed = true;
                } catch (error) {
                    console.debug('[GVP][Interceptor] Failed to parse bridge progress payload raw JSON:', error);
                }
            }
        }

        if (!processed && payload?.videoId) {
            const meta = this._bridgeMetadataByVideoId.get(payload.videoId) || {};
            const syntheticPayload = {
                result: {
                    response: {
                        streamingVideoGenerationResponse: {
                            progress: progressValue,
                            videoId: payload.videoId,
                            moderated: payload?.moderated === true,
                            mode: payload?.mode || meta.mode || null,
                            modelName: payload?.modelName || meta.modelName || null,
                            imageReference: payload?.imageReference || meta.imageReference || null
                        }
                    }
                }
            };

            try {
                if (multiGenMeta) {
                    await this._handleMultiGenStreamPayload(syntheticPayload, multiGenMeta);
                }
                await this._processPayloadEvents([syntheticPayload], { source: 'bridge-progress-synthetic' });
                processed = true;
            } catch (error) {
                console.debug('[GVP][Interceptor] Failed to process synthetic bridge progress payload:', error, syntheticPayload);
            }
        }

        try {
            if (window.gvpUIManager && typeof window.gvpUIManager.updateProgressBar === 'function') {
                const clamped = Math.max(0, Math.min(100, progressValue));
                window.gvpUIManager.updateProgressBar(clamped);
            }
        } catch (uiError) {
            console.warn('[GVP][Interceptor] Failed to update progress bar from bridge:', uiError);
        }
    }

    async handleBridgeVideoPrompt(payload = {}) {
        const requestId = typeof payload?.requestId === 'string' ? payload.requestId : null;
        const requestContext = requestId ? this._bridgeRequestsById.get(requestId) || null : null;
        const multiGenMeta = requestContext ? { multiGen: requestContext } : null;

        if (payload?.videoId) {
            const existing = this._bridgeMetadataByVideoId.get(payload.videoId) || {};
            this._bridgeMetadataByVideoId.set(payload.videoId, {
                ...existing,
                videoUrl: payload?.videoUrl || existing.videoUrl || null,
                assetId: payload?.assetId || existing.assetId || null,
                moderated: payload?.moderated === true,
                videoPrompt: payload?.videoPrompt || existing.videoPrompt || '',
                imageReference: payload?.imageReference || existing.imageReference || null,
                mode: payload?.mode || existing.mode || null,
                modelName: payload?.modelName || existing.modelName || null
            });
        }

        console.log('[GVP][Interceptor] Bridge video prompt payload received:', {
            videoId: payload?.videoId || null,
            hasRaw: typeof payload?.raw === 'string',
            promptLength: typeof payload?.videoPrompt === 'string' ? payload.videoPrompt.length : 0,
            mode: payload?.mode || null
        });

        let processed = false;

        if (typeof payload?.raw === 'string') {
            const rawText = payload.raw.trim();
            const looksJson = rawText.startsWith('{') || rawText.startsWith('[');
            if (looksJson) {
                try {
                    const parsed = JSON.parse(rawText);
                    if (multiGenMeta) {
                        await this._handleMultiGenStreamPayload(parsed, multiGenMeta);
                    }
                    await this._processPayloadEvents([parsed], { source: 'bridge-video-prompt' });
                    processed = true;
                } catch (error) {
                    console.debug('[GVP][Interceptor] Failed to parse bridge video prompt raw JSON:', error);
                }
            }
        }

        if (!processed && payload?.videoId) {
            const meta = this._bridgeMetadataByVideoId.get(payload.videoId) || {};
            const syntheticProgress = this._coerceProgressValue(
                payload?.progress ??
                payload?.progressValue ??
                payload?.percent ??
                payload?.progressPercent ??
                meta.progress ??
                100
            ) ?? 100;
            const syntheticPayload = {
                result: {
                    response: {
                        streamingVideoGenerationResponse: {
                            progress: syntheticProgress,
                            videoPrompt: typeof payload?.videoPrompt === 'string' ? payload.videoPrompt : (meta.videoPrompt || ''),
                            videoUrl: payload?.videoUrl || meta.videoUrl || null,
                            assetId: payload?.assetId || meta.assetId || null,
                            moderated: payload?.moderated === true,
                            videoId: payload.videoId,
                            mode: payload?.mode || meta.mode || null,
                            modelName: payload?.modelName || meta.modelName || null,
                            imageReference: payload?.imageReference || meta.imageReference || null
                        }
                    }
                }
            };

            try {
                if (multiGenMeta) {
                    await this._handleMultiGenStreamPayload(syntheticPayload, multiGenMeta);
                }
                await this._processPayloadEvents([syntheticPayload], { source: 'bridge-video-prompt-synthetic' });
                processed = true;
            } catch (error) {
                console.debug('[GVP][Interceptor] Failed to process synthetic bridge video prompt payload:', error, syntheticPayload);
            }
        }

        if (!processed) {
            try {
                const videoPrompt = typeof payload?.videoPrompt === 'string' ? payload.videoPrompt : '';
                if (videoPrompt) {
                    await this._parseAndSetPromptData(videoPrompt);
                } else if (payload?.videoId) {
                    const meta = this._bridgeMetadataByVideoId.get(payload.videoId);
                    if (meta && typeof meta.videoPrompt === 'string' && meta.videoPrompt.trim()) {
                        await this._parseAndSetPromptData(meta.videoPrompt);
                    }
                }
            } catch (error) {
                console.error('[GVP][Interceptor] Failed to handle bridge video prompt payload:', error, payload);
            }
        }

        try {
            if (window.gvpUIManager && typeof window.gvpUIManager.updateProgressBar === 'function') {
                window.gvpUIManager.updateProgressBar(100);
            }
        } catch (uiError) {
            console.warn('[GVP][Interceptor] Failed to finalize progress bar from bridge:', uiError);
        }

        if (requestContext && !requestContext.completed) {
            this._finalizeMultiGenStream({ multiGen: requestContext });
        }

        if (payload?.videoId) {
            this._bridgeMetadataByVideoId.delete(payload.videoId);
        }
    }

    async _handleBridgeStreamPayload(parsedPayload, requestContext) {
        if (!parsedPayload || !requestContext) {
            return;
        }

        const meta = { multiGen: requestContext };
        this._handleMultiGenStreamPayload(parsedPayload, meta);
    }

    _parseAndSetPromptData(videoPromptString) {
        if (!videoPromptString || typeof videoPromptString !== 'string') {
            console.warn('[GVP] Ignoring empty or non-string videoPrompt');
            return;
        }

        const trimmed = videoPromptString.trim();
        const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');

        if (!looksLikeJson) {
            console.warn('[GVP] Non-JSON videoPrompt received; skipping editor population.');
            return;
        }

        try {
            JSON.parse(trimmed);

            if (window.stateManager) {
                window.stateManager.updatePromptDataFromVideoPrompt(trimmed);
            }

            if (window.gvpUIManager) {
                window.gvpUIManager.updatePromptFromVideoPrompt(trimmed);
            }

            console.log('[GVP] ✅ Parsed and set prompt data');

        } catch (error) {
            console.error('[GVP] Failed to parse videoPrompt JSON:', error);
        }
    }

    async _processJsonResponse(response, source = 'json') {
        try {
            console.log('[GVP] _processJsonResponse called');
            const jsonData = await response.json();
            await this._processPayloadEvents([jsonData], { source });
        } catch (error) {
            console.error('[GVP] Error processing JSON response:', error);
        }
    }

    /**
     * Extract imageId from imageReference URL
     * URL format: https://assets.grok.com/users/{accountId}/{imageId}/content
     * We need the LAST UUID (imageId), not the first (accountId)
     */
    _extractImageIdFromReference(imageReference) {
        if (!imageReference || typeof imageReference !== 'string') {
            return null;
        }

        try {
            // Extract ALL UUID patterns, then take the LAST one (actual image ID)
            // URL format: https://assets.grok.com/users/{accountId}/{imageId}/content
            // Or: https://imagine-public.x.ai/imagine-public/images/{imageId}.png
            const uuidPattern = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;
            const matches = imageReference.match(uuidPattern);

            if (matches && matches.length > 0) {
                // Return the LAST UUID (the actual image/post ID, not account ID)
                const lastUuid = matches[matches.length - 1];
                console.log('[GVP] Extracted imageId from reference:', lastUuid, '(from', matches.length, 'UUIDs)');
                return lastUuid;
            }
            return null;
        } catch (error) {
            console.warn('[GVP] Failed to extract imageId from reference:', imageReference, error);
            return null;
        }
    }
    async _waitForIDB() {
        if (this.stateManager.indexedDBManager.initialized) return;
        console.log('[GVP Unified] ⏳ Waiting for IDB initialization...');
        // poll for 2 seconds max
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 100));
            if (this.stateManager.indexedDBManager.initialized) return;
        }
        console.warn('[GVP Unified] ⚠️ IDB not initialized after wait. Proceeding with risk of overwrites.');
    }
};
