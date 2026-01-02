// a:/Tools n Programs/SD-GrokScripts/grok-video-prompter-extension/src/content/managers/AutomaticRetryManager.js
// Manages automatic retry logic for moderated content.
// Dependencies: StateManager, ReactAutomation

window.AutomaticRetryManager = class AutomaticRetryManager {
    constructor(stateManager, reactAutomation) {
        this.stateManager = stateManager;
        this.reactAutomation = reactAutomation;
        this.retryTimers = new Map(); // Track retry delays
        this.maxRetries = 3; // Default, will be updated from settings
    }

    /**
     * Handle a moderated generation and initiate retry
     * @param {string} generationId - The generation that was moderated
     * @returns {Promise<boolean>} True if retry initiated, false if max retries exceeded
     */
    async handleModeratedGeneration(generationId) {
        const state = this.stateManager.getState();
        const settings = state.settings;

        // Update max retries from settings
        this.maxRetries = settings.maxModerationRetries || 3;

        // GUARD: Check if we're on a page that supports video generation
        // If user has navigated away from the image post page, skip retry
        const currentPath = window.location.pathname;
        const isVideoCapablePage = currentPath.includes('/imagine/post/') ||
            currentPath.includes('/chat/') ||
            currentPath === '/imagine' ||
            currentPath === '/imagine/' ||
            currentPath === '/imagine/favorites' ||
            currentPath === '/' ||
            currentPath === '';

        if (!isVideoCapablePage) {
            console.log(`[GVP] ⏭️ Skipping auto-retry: not on a video-capable page (current: ${currentPath})`);
            return false;
        }

        // Check if auto-retry is enabled
        if (!settings.autoRetryOnModeration) {
            console.log('[GVP] Auto-retry disabled in settings');
            return false;
        }

        // Get current retry count
        const retryCount = state.generation.moderationData.retryCount;

        // Check if max retries exceeded
        if (retryCount >= this.maxRetries) {
            console.log(`[GVP] ⚠️ Max retries (${this.maxRetries}) reached for generation ${generationId}`);

            // Check if fallback to normal mode is enabled
            if (settings.fallbackToNormalMode && state.generation.useSpicy) {
                console.log('[GVP] Attempting fallback to normal mode...');
                return await this.fallbackToNormalMode(generationId);
            }

            this.markGenerationFailed(generationId, 'MAX_RETRIES_EXCEEDED');
            return false;
        }

        // Calculate retry delay with exponential backoff
        const retryDelay = this.calculateRetryDelay(retryCount, settings.retryDelayMultiplier);

        console.log(`[GVP] 🔄 Retrying moderated generation (attempt ${retryCount + 1}/${this.maxRetries}) in ${retryDelay}ms`);

        // Update UI status
        if (window.gvpUIManager) {
            window.gvpUIManager.updateGenerationStatus('retrying', {
                retryCount: retryCount + 1,
                maxRetries: this.maxRetries,
                generationId: generationId
            });
            window.gvpUIManager.updateProgressBar(25);
        }

        // Show notification if enabled
        if (settings.notifyOnModerationRetry) {
            this.showRetryNotification(generationId, retryCount + 1, this.maxRetries);
        }

        // Update retry history as successful (will be marked failed if retry fails)
        const history = state.generation.moderationData.retryHistory;
        if (history.length > 0) {
            history[history.length - 1].success = true;

            if (window.gvpUIManager) {
                if (typeof window.gvpUIManager.updateRetryStatistics === 'function') {
                    window.gvpUIManager.updateRetryStatistics();
                } else {
                    console.debug('[GVP Retry] updateRetryStatistics hook missing on UIManager');
                }
            }
        }

        // Wait before retry (progressive delay)
        await this.delay(retryDelay);

        // Get the last prompt that was sent
        const lastPrompt = state.generation.lastPrompt;
        if (!lastPrompt) {
            console.info('[GVP] Skipping auto-retry; no last prompt available to resend.');
            return false;
        }

        // Apply progressive enhancement if enabled
        let enhancedPrompt = lastPrompt;
        if (settings.progressiveEnhancement) {
            enhancedPrompt = this.applyProgressiveEnhancement(lastPrompt, retryCount);
        }

        // Update generation data
        this.stateManager.updateGeneration(generationId, {
            status: 'retrying',
            moderationRetryCount: retryCount + 1
        });

        // Initiate retry
        try {
            // GUARD: Re-check page after delay - user may have navigated away
            const currentPathNow = window.location.pathname;
            const stillOnVideoPage = currentPathNow.includes('/imagine/post/') ||
                currentPathNow.includes('/chat/') ||
                currentPathNow === '/imagine' ||
                currentPathNow === '/imagine/' ||
                currentPathNow === '/imagine/favorites' ||
                currentPathNow === '/' ||
                currentPathNow === '';

            if (!stillOnVideoPage) {
                console.log(`[GVP] ⏭️ Aborting retry: user navigated away during delay (now on: ${currentPathNow})`);
                return false;
            }

            // GUARD: Check if the video textarea actually exists on this page
            // Grok's button-triggered generations don't use the textarea, so retry won't work
            const textareaSelectors = window.GROK_SELECTORS?.TEXTAREA?.VIDEO || [
                'textarea[aria-label="Make a video"]',
                'textarea[placeholder*="video"]'
            ];
            const textareaExists = textareaSelectors.some(sel => document.querySelector(sel));

            if (!textareaExists) {
                console.log('[GVP] ⏭️ Skipping auto-retry: no video textarea found on this page (generation was button-triggered, not textarea-based)');
                this.markGenerationFailed(generationId, 'NO_TEXTAREA_FOR_RETRY');
                return false;
            }

            await this.reactAutomation.sendToGenerator(enhancedPrompt, false);
            console.log(`[GVP] ✅ Retry attempt ${retryCount + 1} initiated successfully`);
            return true;
        } catch (error) {
            console.error('[GVP] Retry failed:', error);
            this.markGenerationFailed(generationId, 'RETRY_FAILED');
            return false;
        }
    }

    /**
     * Calculate retry delay with exponential backoff
     * @param {number} retryCount - Current retry attempt number
     * @param {number} multiplier - Delay multiplier from settings
     * @returns {number} Delay in milliseconds
     */
    calculateRetryDelay(retryCount, multiplier = 1.5) {
        const baseDelay = 2000; // 2 seconds base
        const maxDelay = 30000; // 30 seconds max
        const delay = Math.min(baseDelay * Math.pow(multiplier, retryCount), maxDelay);
        return delay;
    }

    /**
     * Apply progressive enhancement to prompt based on retry attempt
     * @param {string} originalPrompt - The original prompt (JSON or raw)
     * @param {number} retryAttempt - Which retry attempt this is (0-indexed)
     * @returns {string} Enhanced prompt
     */
    applyProgressiveEnhancement(originalPrompt, retryAttempt) {
        const state = this.stateManager.getState();

        // If not using spicy mode, no enhancement needed
        if (!state.generation.useSpicy) {
            return originalPrompt;
        }

        // Progressive enhancement strategy based on retry count
        let enhancedPrompt = originalPrompt;

        switch (retryAttempt) {
            case 0:
                // First retry: Maintain spicy mode, no changes
                console.log('[GVP] Retry attempt 1: Maintaining original parameters');
                break;

            case 1:
                // Second retry: Add safety hints (if JSON prompt)
                if (this.isJsonPrompt(originalPrompt)) {
                    enhancedPrompt = this.addSafetyHintsToJson(originalPrompt);
                    console.log('[GVP] Retry attempt 2: Added safety hints to prompt');
                }
                break;

            case 2:
                // Third retry: More aggressive modifications
                if (this.isJsonPrompt(originalPrompt)) {
                    enhancedPrompt = this.toneDownContentInJson(originalPrompt);
                    console.log('[GVP] Retry attempt 3: Toned down content descriptors');
                }
                break;

            default:
                // Further retries: Keep attempting with modifications
                console.log(`[GVP] Retry attempt ${retryAttempt + 1}: Using enhanced prompt`);
                break;
        }

        return enhancedPrompt;
    }

    /**
     * Check if prompt is JSON format
     * @param {string} prompt - Prompt to check
     * @returns {boolean} True if JSON
     */
    isJsonPrompt(prompt) {
        try {
            JSON.parse(prompt);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Add safety hints to JSON prompt
     * @param {string} jsonPrompt - JSON prompt string
     * @returns {string} Enhanced JSON prompt
     */
    addSafetyHintsToJson(jsonPrompt) {
        try {
            const promptData = JSON.parse(jsonPrompt);

            // Add safety descriptors to tags if they exist
            if (Array.isArray(promptData.tags)) {
                // Add safety-related tags
                const safetyTags = ['professional', 'broadcast-safe', 'family-friendly'];
                safetyTags.forEach(tag => {
                    if (!promptData.tags.includes(tag)) {
                        promptData.tags.push(tag);
                    }
                });
            }

            // Modify cinematography to be more conservative
            if (promptData.cinematography) {
                if (!promptData.cinematography.style) {
                    promptData.cinematography.style = '';
                }
                // Add professional/broadcast descriptors
                if (!promptData.cinematography.style.includes('professional')) {
                    promptData.cinematography.style = 'professional broadcast quality. ' + promptData.cinematography.style;
                }
            }

            return JSON.stringify(promptData);
        } catch (error) {
            console.error('[GVP] Failed to add safety hints:', error);
            return jsonPrompt;
        }
    }

    /**
     * Tone down potentially sensitive content in JSON prompt
     * @param {string} jsonPrompt - JSON prompt string
     * @returns {string} Toned-down JSON prompt
     */
    toneDownContentInJson(jsonPrompt) {
        try {
            const promptData = JSON.parse(jsonPrompt);

            // Replace potentially sensitive words with milder alternatives
            const sensitiveWords = [
                { pattern: /violent/gi, replacement: 'dynamic' },
                { pattern: /aggressive/gi, replacement: 'energetic' },
                { pattern: /extreme/gi, replacement: 'notable' },
                { pattern: /intense/gi, replacement: 'focused' },
                { pattern: /brutal/gi, replacement: 'impactful' },
                { pattern: /graphic/gi, replacement: 'detailed' }
            ];

            // Apply replacements to all string fields recursively
            const tonedPromptData = this.replaceInObject(promptData, sensitiveWords);

            return JSON.stringify(tonedPromptData);
        } catch (error) {
            console.error('[GVP] Failed to tone down content:', error);
            return jsonPrompt;
        }
    }

    /**
     * Recursively replace sensitive words in object
     * @param {object|string|array} obj - Object to process
     * @param {array} replacements - Array of {pattern, replacement} objects
     * @returns {object|string|array} Processed object
     */
    replaceInObject(obj, replacements) {
        if (typeof obj === 'string') {
            let result = obj;
            replacements.forEach(({ pattern, replacement }) => {
                result = result.replace(pattern, replacement);
            });
            return result;
        } else if (Array.isArray(obj)) {
            return obj.map(item => this.replaceInObject(item, replacements));
        } else if (typeof obj === 'object' && obj !== null) {
            const result = {};
            Object.keys(obj).forEach(key => {
                result[key] = this.replaceInObject(obj[key], replacements);
            });
            return result;
        }
        return obj;
    }

    /**
     * Fallback to normal mode after max retries
     * @param {string} generationId - Generation ID
     * @returns {Promise<boolean>} True if fallback initiated
     */
    async fallbackToNormalMode(generationId) {
        const state = this.stateManager.getState();

        console.log('[GVP] 🔄 Falling back to normal mode...');

        // Disable spicy mode
        state.generation.useSpicy = false;

        // Reset moderation data for new attempt
        state.generation.moderationData.retryCount = 0;
        state.generation.moderationData.isModerated = false;

        // Get last prompt
        const lastPrompt = state.generation.lastPrompt;
        if (!lastPrompt) {
            return false;
        }

        // Attempt generation without spicy mode
        try {
            await this.reactAutomation.sendToGenerator(lastPrompt, false);
            console.log('[GVP] ✅ Fallback to normal mode initiated');
            return true;
        } catch (error) {
            console.error('[GVP] Fallback failed:', error);
            this.markGenerationFailed(generationId, 'FALLBACK_FAILED');
            return false;
        }
    }

    /**
     * Mark generation as failed
     * @param {string} generationId - Generation ID
     * @param {string} reason - Failure reason
     */
    markGenerationFailed(generationId, reason) {
        console.log(`[GVP] ❌ Generation ${generationId} failed: ${reason}`);

        this.stateManager.updateGeneration(generationId, {
            status: 'failed',
            failureReason: reason,
            endTime: Date.now()
        });

        // Move to completed with failed status
        const state = this.stateManager.getState();
        const generation = state.multiGeneration.activeGenerations.get(generationId);
        if (generation) {
            state.multiGeneration.completedGenerations.set(generationId, generation);
            state.multiGeneration.activeGenerations.delete(generationId);
        }
    }

    /**
     * Show retry notification to user
     * @param {string} generationId - Generation ID
     * @param {number} attemptNumber - Current attempt number
     * @param {number} maxRetries - Maximum retries
     */
    showRetryNotification(generationId, attemptNumber, maxRetries) {
        const state = this.stateManager.getState();
        const reason = state.generation.moderationData.moderationReason || 'Content policy';

        console.log(`[GVP] 🔔 Notification: Retrying moderated content (${attemptNumber}/${maxRetries})`);
        console.log(`[GVP]    Reason: ${reason}`);

        // Future enhancement: Add browser notification API
        // if (Notification.permission === 'granted') {
        //     new Notification('Grok Video Prompter', {
        //         body: `Retrying moderated content (${attemptNumber}/${maxRetries})`,
        //         icon: '🔄'
        //     });
        // }
    }

    /**
     * Delay helper
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} Resolves after delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};
