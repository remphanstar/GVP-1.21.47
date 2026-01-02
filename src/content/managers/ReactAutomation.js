// a:/Tools n Programs/SD-GrokScripts/grok-video-prompter-extension/src/content/managers/ReactAutomation.js
// Handles automation of the React-based UI.
// Dependencies: StateManager

window.ReactAutomation = class ReactAutomation {
    constructor(stateManager) {
        this.stateManager = stateManager;
    }

    /**
     * Initialize ReactAutomation - placeholder for future enhancements
     * Currently a no-op but prevents initialization errors
     */
    init() {
        window.Logger.info('ReactAutomation', 'Initialized');
        // Future: Add any necessary initialization logic here
    }

    async waitForElement(selectors, timeout = 5000, root = document) {
        const selectorList = Array.isArray(selectors)
            ? selectors.filter(Boolean)
            : [selectors].filter(Boolean);

        if (!selectorList.length) {
            throw new Error('[GVP Automation] waitForElement called without selectors');
        }

        const searchRoot = root && root.nodeType === Node.ELEMENT_NODE ? root : document;

        return new Promise((resolve, reject) => {
            const tryFind = () => {
                for (const selector of selectorList) {
                    try {
                        const el = searchRoot.querySelector(selector);
                        if (el) {
                            cleanup();
                            resolve(el);
                            return;
                        }
                    } catch (error) {
                        window.Logger.warn('ReactAutomation', 'Invalid selector', { selector, error });
                    }
                }
            };

            const cleanup = () => {
                observer.disconnect();
                clearTimeout(timeoutId);
            };

            const observer = new MutationObserver(tryFind);
            observer.observe(searchRoot === document ? document.body : searchRoot, {
                childList: true,
                subtree: true
            });

            const timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error(`Element not found after ${timeout}ms for selectors: ${selectorList.join(' || ')}`));
            }, timeout);

            // Attempt initial lookup before waiting for mutations
            tryFind();
        });
    }

    _applyPromptTransforms(promptText) {
        let result = typeof promptText === 'string' ? promptText : '';
        try {
            const settings = this.stateManager?.getState?.().settings;
            if (settings?.wrapInQuotes) {
                result = this._quoteWrapPrompt(result);
            }
        } catch (error) {
            window.Logger.warn('ReactAutomation', 'Prompt transform fallback due to error', error);
        }
        return result;
    }

    _quoteWrapPrompt(basePrompt) {
        const sanitized = typeof basePrompt === 'string' ? basePrompt.trim() : '';
        return `", "${sanitized}", {"mode": "`;
    }

    async sendToGenerator(promptText, isRaw = false) {
        window.Logger.info('ReactAutomation', 'Starting direct front-page automation');
        try {
            // Use centralized selectors
            const textareaSelectors = window.GROK_SELECTORS?.TEXTAREA?.VIDEO || [
                'textarea[aria-label="Make a video"]',
                'textarea[aria-label="Create a video"]',
                'textarea[placeholder="Describe the video you want to create"]',
                'textarea[placeholder*="video"]',
                'div[contenteditable="true"][role="textbox"]'
            ];

            // Step 1: Find textarea on front page
            const textarea = await this.waitForElement(textareaSelectors, 8000).catch(err => {
                const fallback = this._findTextareaFallback();
                if (fallback) {
                    window.Logger.warn('ReactAutomation', 'Falling back to generic textarea discovery');
                    return fallback;
                }
                window.Logger.error('ReactAutomation', 'Unable to locate video textarea. Ensure the Make Video composer is visible on the page.');
                throw err;
            });
            if (!textarea) {
                throw new Error('Could not find video textarea');
            }

            window.Logger.debug('ReactAutomation', 'Found textarea');

            // Get spicy mode state
            const state = this.stateManager.getState();
            const useSpicy = state.generation.useSpicy || false;
            const targetMode = useSpicy ? '--mode=extremely-spicy-or-crazy' : '--mode=custom';

            // Preserve existing --mode flags; spicy injection handled in NetworkInterceptor
            let fullPrompt = this._applyPromptTransforms(promptText);

            // Step 2: Set prompt value using React-compatible method
            const isTextArea = textarea.tagName && textarea.tagName.toLowerCase() === 'textarea';
            const isContentEditable = !isTextArea && textarea.isContentEditable;

            if (isTextArea) {
                const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype,
                    'value'
                ).set;
                nativeTextareaSetter.call(textarea, fullPrompt);
            } else if (isContentEditable) {
                if (typeof textarea.focus === 'function') {
                    textarea.focus({ preventScroll: true });
                }
                textarea.textContent = '';
                textarea.textContent = fullPrompt;
            } else {
                try {
                    textarea.value = fullPrompt;
                } catch (assignError) {
                    window.Logger.warn('ReactAutomation', 'Fallback assignment failed for composer element', assignError);
                }
            }

            if (typeof textarea.scrollIntoView === 'function') {
                textarea.scrollIntoView({ behavior: 'instant', block: 'center' });
            }

            // Trigger React events to notify the framework
            const inputEvent = typeof window.InputEvent === 'function'
                ? new window.InputEvent('input', { bubbles: true, data: fullPrompt, inputType: 'insertText' })
                : new Event('input', { bubbles: true });
            textarea.dispatchEvent(inputEvent);

            if (!isContentEditable) {
                textarea.dispatchEvent(new Event('change', { bubbles: true }));
            }

            if (typeof textarea.focus === 'function') {
                textarea.focus();
            }

            window.Logger.info('ReactAutomation', 'Set prompt value', {
                promptPreview: fullPrompt.substring(0, 100) + '...',
                spicyMode: useSpicy
            });

            // Step 3: Wait a moment for React to process the input
            await new Promise(resolve => setTimeout(resolve, 300));

            // Step 4: Find and click the Make video button (use centralized selectors)
            const buttonSelectors = window.GROK_SELECTORS?.BUTTON?.MAKE_VIDEO || [
                'button[aria-label="Make video"]',
                'button[aria-label="Make a video"]',
                'button[data-testid="make-video-button"]',
                'section button[type="submit"]'
            ];

            let makeVideoBtn;
            try {
                makeVideoBtn = await this.waitForElement(buttonSelectors, 5000);
            } catch (error) {
                makeVideoBtn = this._findButtonByText('Make video')
                    || this._findButtonByText('Make a video');

                if (!makeVideoBtn) {
                    window.Logger.error('ReactAutomation', 'Unable to locate Make Video button');
                    throw error;
                }
                window.Logger.warn('ReactAutomation', 'Falling back to text-based Make Video button discovery');
            }

            // Use React-compatible click
            this.reactClick(makeVideoBtn, 'Make video button');

            window.Logger.info('ReactAutomation', '✅ Video generation submitted successfully');

            // NEW: Generate and register generation ID
            const generationId = this.stateManager.generateGenerationId();

            // Register the generation
            this.stateManager.registerGeneration(generationId, fullPrompt, {
                mode: useSpicy ? 'extremely-spicy-or-crazy' : 'custom',
                imageUrl: null // Will be extracted from stream if available
            });

            // Update state
            this.stateManager.setState({
                generation: {
                    ...state.generation,
                    lastPrompt: fullPrompt,
                    isGenerating: true,
                    currentGenerationId: generationId
                }
            });

            window.Logger.info('ReactAutomation', 'Registered generation', { generationId });

            // NEW: Update UI status
            if (window.gvpUIManager) {
                window.gvpUIManager.updateGenerationStatus('generating', { generationId: generationId });
                window.gvpUIManager.updateProgressBar(10);
            }

        } catch (error) {
            window.Logger.error('ReactAutomation', 'Error during automation', error);
            alert(`Failed to send prompt to generator:\n${error.message}\n\nPlease check console for details.`);
            throw error;
        }
    }

    /**
     * Send prompt to Grok's Imagine Edit interface
     * Flow: Click "Edit image" button (if needed) -> Enter prompt in edit textarea -> Click submit button
     * @param {string} promptText - The prompt text to enter for image editing
     */
    async sendToImageEdit(promptText) {
        window.gvpUIManager?.showToast('Opening image editor...', 'info', 2000); // GVP Toast
        window.Logger.info('ReactAutomation', 'STARTING IMAGE EDIT AUTOMATION');
        window.Logger.debug('ReactAutomation', 'Context', { promptPreview: promptText?.substring(0, 50), url: window.location.href });

        // DEBUG: Dump all relevant elements on page
        window.Logger.debug('ReactAutomation', '=== PAGE STATE DUMP ===');

        // All textareas
        const allTextareas = document.querySelectorAll('textarea');
        window.Logger.debug('ReactAutomation', `Found ${allTextareas.length} textareas`);
        allTextareas.forEach((ta, i) => {
            window.Logger.debug('ReactAutomation', `  [${i}] aria-label="${ta.getAttribute('aria-label')}" placeholder="${ta.getAttribute('placeholder')}" value="${ta.value?.substring(0, 30)}..."`);
        });

        // All buttons with brush icons
        const brushButtons = document.querySelectorAll('button:has(svg.lucide-brush)');
        window.Logger.debug('ReactAutomation', `Found ${brushButtons.length} brush buttons`);
        brushButtons.forEach((btn, i) => {
            window.Logger.debug('ReactAutomation', `  [${i}] aria-label="${btn.getAttribute('aria-label')}" text="${btn.textContent?.trim()}" classes="${btn.className}"`);
        });

        // All divs with bg-surface-l1
        const surfaceDivs = document.querySelectorAll('div.bg-surface-l1');
        window.Logger.debug('ReactAutomation', `Found ${surfaceDivs.length} surface divs`);
        surfaceDivs.forEach((div, i) => {
            window.Logger.debug('ReactAutomation', `  [${i}] classes="${div.className}" innerHTML="${div.innerHTML?.substring(0, 80)}..."`);
        });

        // All buttons with Submit label
        const submitButtons = document.querySelectorAll('button[aria-label="Submit"]');
        window.Logger.debug('ReactAutomation', `Found ${submitButtons.length} Submit buttons`);

        window.Logger.debug('ReactAutomation', '=== END PAGE STATE DUMP ===');

        try {
            // Selectors for the edit textarea
            const editTextareaSelectors = [
                'textarea[aria-label="Type to edit image..."]',
                'textarea[placeholder="Type to edit image..."]',
                'textarea[aria-label="Image prompt"]'
            ];

            // Check if edit textarea already exists
            let editTextarea = null;
            window.Logger.debug('ReactAutomation', 'Checking for existing textarea...');
            for (const selector of editTextareaSelectors) {
                editTextarea = document.querySelector(selector);
                window.Logger.debug('ReactAutomation', `Selector "${selector}": ${editTextarea ? 'FOUND' : 'not found'}`);
                if (editTextarea) {
                    window.Logger.debug('ReactAutomation', 'Found existing textarea');
                    break;
                }
            }

            // If no textarea, click the Edit image button
            if (!editTextarea) {
                window.Logger.debug('ReactAutomation', 'No textarea found, looking for Edit image button...');

                // Try multiple selectors for the Edit image button
                let editImageBtn = document.querySelector('button[aria-label="Play"]:has(svg.lucide-brush)');
                window.Logger.debug('ReactAutomation', `Play button logic: ${editImageBtn ? 'FOUND' : 'not found'}`);

                if (!editImageBtn) {
                    editImageBtn = document.querySelector('button:has(svg.lucide-brush)');
                    window.Logger.debug('ReactAutomation', `Brush button logic: ${editImageBtn ? 'FOUND' : 'not found'}`);
                }

                if (!editImageBtn) {
                    window.Logger.debug('ReactAutomation', 'Trying text-based search for "Edit image"...');
                    const allButtons = document.querySelectorAll('button');
                    window.Logger.debug('ReactAutomation', `Total buttons on page: ${allButtons.length}`);
                    for (const btn of allButtons) {
                        if (btn.textContent?.includes('Edit image')) {
                            editImageBtn = btn;
                            window.Logger.debug('ReactAutomation', `Found by text: "${btn.textContent?.trim()}"`);
                            break;
                        }
                    }
                }

                if (!editImageBtn) {
                    window.Logger.error('ReactAutomation', 'FAILED: Could not find any Edit image button');
                    throw new Error('Edit image button not found');
                }

                window.Logger.debug('ReactAutomation', 'Found Edit image button', { button: editImageBtn.className });
                console.log('[GVP DEBUG] Button outerHTML:', editImageBtn.outerHTML?.substring(0, 200));
                window.Logger.debug('ReactAutomation', 'Clicking button now...');

                this.reactClick(editImageBtn, 'Edit image button');
                window.Logger.debug('ReactAutomation', 'Click dispatched, waiting 800ms...');

                await new Promise(resolve => setTimeout(resolve, 800));
                window.Logger.debug('ReactAutomation', 'Wait complete, searching for textarea again...');

                // Now find the textarea
                for (const selector of editTextareaSelectors) {
                    editTextarea = document.querySelector(selector);
                    window.Logger.debug('ReactAutomation', `Post-click selector "${selector}": ${editTextarea ? 'FOUND' : 'not found'}`);
                    if (editTextarea) {
                        window.Logger.debug('ReactAutomation', 'Found textarea after clicking button');
                        break;
                    }
                }

                if (!editTextarea) {
                    window.Logger.error('ReactAutomation', 'FAILED: Textarea not found after clicking Edit image button');
                    // Dump page state again
                    const newTextareas = document.querySelectorAll('textarea');
                    window.Logger.debug('ReactAutomation', `Textareas now on page: ${newTextareas.length}`);
                    newTextareas.forEach((ta, i) => {
                        window.Logger.debug('ReactAutomation', `  [${i}] aria-label="${ta.getAttribute('aria-label')}" placeholder="${ta.getAttribute('placeholder')}"`);
                    });
                    throw new Error('Edit textarea not found');
                }
            }

            window.Logger.debug('ReactAutomation', 'Got edit textarea, proceeding to enter prompt');

            // Step 3: Enter the prompt using React-compatible method
            const fullPrompt = this._applyPromptTransforms(promptText);

            const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype,
                'value'
            ).set;
            window.gvpUIManager?.showToast('Applying prompt...', 'info', 2000); // GVP Toast
            nativeTextareaSetter.call(editTextarea, fullPrompt);

            // Trigger React events
            const inputEvent = typeof window.InputEvent === 'function'
                ? new window.InputEvent('input', { bubbles: true, data: fullPrompt, inputType: 'insertText' })
                : new Event('input', { bubbles: true });
            editTextarea.dispatchEvent(inputEvent);
            editTextarea.dispatchEvent(new Event('change', { bubbles: true }));

            if (typeof editTextarea.focus === 'function') {
                editTextarea.focus();
            }

            window.Logger.info('ReactAutomation', 'Set edit prompt value', { preview: fullPrompt.substring(0, 100) + '...' });

            // Wait for React to process input
            await new Promise(resolve => setTimeout(resolve, 300));

            // User's HTML has multiple button states:
            // - Revealed state: aria-label="Submit"
            // - Initial state: aria-label="Make video" with child <span>Edit</span>
            let editSubmitBtn = null;

            // Try Submit button first (revealed state after clicking collapsed div)
            editSubmitBtn = document.querySelector('button[aria-label="Submit"]');

            if (!editSubmitBtn) {
                // Try Make video button with Edit text
                const makeVideoBtns = document.querySelectorAll('button[aria-label="Make video"]');
                for (const btn of makeVideoBtns) {
                    if (btn.textContent?.includes('Edit')) {
                        editSubmitBtn = btn;
                        break;
                    }
                }
                // Or just grab first Make video button
                if (!editSubmitBtn && makeVideoBtns.length > 0) {
                    editSubmitBtn = makeVideoBtns[0];
                }
            }

            if (!editSubmitBtn) {
                // Fallback 2: find any button containing "Edit" text with an SVG
                const allButtons = document.querySelectorAll('button');
                for (const btn of allButtons) {
                    if (btn.textContent?.trim() === 'Edit' && btn.querySelector('svg')) {
                        editSubmitBtn = btn;
                        break;
                    }
                }
            }

            if (!editSubmitBtn) {
                window.Logger.error('ReactAutomation', 'Unable to locate image edit Submit button');
                throw new Error('Submit button not found');
            }

            window.Logger.debug('ReactAutomation', 'Found submit button');
            window.gvpUIManager?.showToast('Submitting...', 'info', 2000); // GVP Toast
            this.reactClick(editSubmitBtn, 'Image edit submit button');

            window.Logger.info('ReactAutomation', '✅ Image edit submitted successfully');
            window.Logger.info('ReactAutomation', 'Quick Edit mode: Staying on page');

            // NOTE: Unlike Quick JSON/RAW, Quick Edit does NOT navigate back to gallery.
            // The user stays on the current image page to continue editing or wait for generation.
            // Image edit uses /new API stream - response can be monitored by NetworkInterceptor.

            // Register the generation for tracking (use runtime lookup since load order is unpredictable)
            const stateManager = this.stateManager || window.gvpStateManager;
            if (stateManager?.getState) {
                const state = stateManager.getState();
                const generationId = stateManager.generateGenerationId();

                stateManager.registerGeneration(generationId, fullPrompt, {
                    mode: 'image-edit',
                    imageUrl: null
                });

                stateManager.setState({
                    generation: {
                        ...state.generation,
                        lastPrompt: fullPrompt,
                        isGenerating: true,
                        currentGenerationId: generationId
                    }
                });

                window.Logger.info('ReactAutomation', 'Registered image edit generation', { generationId });

                if (window.gvpUIManager) {
                    window.gvpUIManager.updateGenerationStatus('generating', { generationId: generationId });
                }
            } else {
                window.Logger.warn('ReactAutomation', 'StateManager not available, skipping generation tracking');
            }

        } catch (error) {
            window.Logger.error('ReactAutomation', 'Error during image edit automation', error);
            throw error;
        }
    }

    /**
     * Send prompt to the LATEST image edit masonry section (for re-editing)
     * Used when user wants to submit another edit on the same image
     * @param {string} promptText - The prompt text to enter for image editing
     */
    async sendToLatestImageEdit(promptText) {
        window.gvpUIManager?.showToast('Opening latest editor...', 'info', 2000); // GVP Toast
        window.Logger.info('ReactAutomation', 'Starting re-edit automation (latest masonry section)');
        try {
            // Find all masonry sections and get the latest (highest numbered)
            const sections = document.querySelectorAll('[id^="imagine-edit-masonry-section-"]');

            if (!sections.length) {
                window.Logger.error('ReactAutomation', 'No masonry sections found');
                throw new Error('No masonry sections found');
            }

            const latestSection = sections[sections.length - 1];
            const sectionId = latestSection.id;
            window.Logger.debug('ReactAutomation', `Found ${sections.length} masonry section(s), using latest: ${sectionId}`);

            // Find the textarea inside the latest section
            const textareaSelectors = [
                'textarea[aria-label="Image prompt"]',
                'textarea[aria-required="true"]',
                'textarea'
            ];

            let textarea = null;
            for (const selector of textareaSelectors) {
                textarea = latestSection.querySelector(selector);
                if (textarea) break;
            }

            if (!textarea) {
                window.Logger.error('ReactAutomation', 'No textarea found in latest masonry section');
                throw new Error('Textarea not found in masonry section');
            }

            window.Logger.debug('ReactAutomation', 'Found textarea in latest masonry section');

            // Enter the prompt using React-compatible method
            const fullPrompt = this._applyPromptTransforms(promptText);

            const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype,
                'value'
            ).set;
            window.gvpUIManager?.showToast('Applying prompt...', 'info', 2000); // GVP Toast
            nativeTextareaSetter.call(textarea, fullPrompt);

            // Trigger React events
            const inputEvent = typeof window.InputEvent === 'function'
                ? new window.InputEvent('input', { bubbles: true, data: fullPrompt, inputType: 'insertText' })
                : new Event('input', { bubbles: true });
            textarea.dispatchEvent(inputEvent);
            textarea.dispatchEvent(new Event('change', { bubbles: true }));

            if (typeof textarea.focus === 'function') {
                textarea.focus();
            }

            window.Logger.info('ReactAutomation', 'Set re-edit prompt value', { preview: fullPrompt.substring(0, 100) + '...' });

            // Wait for React to process input
            await new Promise(resolve => setTimeout(resolve, 300));

            // Find and click the submit button inside the same section
            const submitBtn = latestSection.querySelector('button[aria-label="Submit"]')
                || latestSection.querySelector('button[type="button"]:has(svg)');

            if (!submitBtn) {
                window.Logger.error('ReactAutomation', 'Submit button not found in masonry section');
                throw new Error('Submit button not found');
            }

            window.Logger.debug('ReactAutomation', 'Found submit button');
            window.gvpUIManager?.showToast('Submitting...', 'info', 2000); // GVP Toast
            this.reactClick(submitBtn, 'Re-edit submit button');

            window.Logger.info('ReactAutomation', '✅ Re-edit submitted successfully');
            window.Logger.info('ReactAutomation', 'Staying on page for next edit...');

            // Register the generation
            const state = this.stateManager.getState();
            const generationId = this.stateManager.generateGenerationId();

            this.stateManager.registerGeneration(generationId, fullPrompt, {
                mode: 'image-edit',
                imageUrl: null
            });

            this.stateManager.setState({
                generation: {
                    ...state.generation,
                    lastPrompt: fullPrompt,
                    isGenerating: true,
                    currentGenerationId: generationId
                }
            });

            window.Logger.info('ReactAutomation', 'Registered re-edit generation', { generationId });

            if (window.gvpUIManager) {
                window.gvpUIManager.updateGenerationStatus('generating', { generationId: generationId });
            }

        } catch (error) {
            window.Logger.error('ReactAutomation', 'Error during re-edit automation', error);
            throw error;
        }
    }

    reactClick(element, elementName = 'element') {
        // React-compatible click that fires synthetic pointer/mouse events without native .click()
        if (!element) {
            window.Logger.error('ReactAutomation', `Cannot click ${elementName} - element not found`);
            return;
        }

        try {
            if (typeof element.focus === 'function') {
                element.focus({ preventScroll: true });
            }
        } catch (_) {
            // Ignore focus errors (e.g., hidden elements)
        }

        const dispatch = (type, EventCtor = MouseEvent, extraInit = {}) => {
            const init = {
                bubbles: true,
                cancelable: true,
                view: window,
                button: 0,
                ...extraInit
            };
            element.dispatchEvent(new EventCtor(type, init));
        };

        if (typeof PointerEvent === 'function') {
            dispatch('pointerdown', PointerEvent);
        }
        dispatch('mousedown');
        if (typeof PointerEvent === 'function') {
            dispatch('pointerup', PointerEvent);
        }
        dispatch('mouseup');
        dispatch('click');

        window.Logger.debug('ReactAutomation', `Clicked ${elementName}`);
    }

    async waitForAttribute(element, attribute, value, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const checkAttribute = () => {
                if (element.getAttribute(attribute) === value) {
                    resolve(element);
                }
            };

            checkAttribute();
            const observer = new MutationObserver(checkAttribute);
            observer.observe(element, { attributes: true, attributeFilter: [attribute] });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Attribute ${attribute}=${value} not found within ${timeout}ms`));
            }, timeout);
        });
    }

    _findButtonByText(text) {
        if (!text) return null;
        const target = text.trim().toLowerCase();
        return Array.from(document.querySelectorAll('button')).find(btn =>
            btn.textContent && btn.textContent.trim().toLowerCase() === target
        ) || null;
    }

    _findTextareaFallback() {
        const candidates = Array.from(document.querySelectorAll('textarea, div[contenteditable="true"]'));

        // Filter out image gallery textareas
        const filtered = candidates.filter(el => {
            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
            const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
            const dataPlaceholder = (el.getAttribute('data-placeholder') || '').toLowerCase();

            // Exclude image gallery/generation textareas
            if (aria.includes('image') || aria.includes('gallery') || aria.includes('generate image')) {
                return false;
            }
            if (placeholder.includes('image') || placeholder.includes('gallery') || placeholder.includes('generate image')) {
                return false;
            }
            if (dataPlaceholder.includes('image') || dataPlaceholder.includes('gallery')) {
                return false;
            }

            // Check if it's in the image carousel/gallery container
            const inImageGallery = el.closest('[class*="image"]') || el.closest('[class*="gallery"]');
            if (inImageGallery) {
                return false;
            }

            return true;
        });

        // Find video-specific textarea
        const heuristics = filtered.find(el => {
            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
            const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
            const dataPlaceholder = (el.getAttribute('data-placeholder') || '').toLowerCase();
            const role = (el.getAttribute('role') || '').toLowerCase();
            return aria.includes('video') ||
                placeholder.includes('video') ||
                dataPlaceholder.includes('video') ||
                (role === 'textbox' && !aria.includes('image'));
        });

        // IMPORTANT: Return null if no video textarea found - never blindly use first textarea
        return heuristics || null;
    }
};

// Auto-instantiate and expose on window for UIManager access
// NOTE: Wait for gvpStateManager to be available (it's set in content.js boot sequence)
if (!window.gvpReactAutomation) {
    // Use gvpStateManager instance if available, fallback gracefully
    const stateManagerInstance = window.gvpStateManager || null;
    window.gvpReactAutomation = new window.ReactAutomation(stateManagerInstance);
    window.Logger.info('ReactAutomation', 'Instance created as window.gvpReactAutomation');
}
