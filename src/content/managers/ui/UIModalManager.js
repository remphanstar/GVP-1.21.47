// UIModalManager.js - Modal dialogs and fullscreen editor
// Dependencies: StateManager, SentenceFormatter

window.UIModalManager = class UIModalManager {
    constructor(stateManager, shadowRoot, sentenceFormatter) {
        this.stateManager = stateManager;
        this.shadowRoot = shadowRoot;
        this.sentenceFormatter = sentenceFormatter;

        this.savedPromptModal = null;
        this._savedPromptCallbacks = {};
        this.importJsonCallback = null;
        this.toastQueue = [];
        this.toastShowing = false;
        window.Logger.info('UIModal', 'UIModalManager v1.16.2 initialized');
    }

    _createFullscreenModal() {
        const modal = document.createElement('div');
        modal.id = 'gvp-fullscreen-modal';

        const header = document.createElement('div');
        header.id = 'gvp-fullscreen-header';
        const title = document.createElement('div');
        title.id = 'gvp-fullscreen-title';
        title.textContent = 'Full Screen Editor';
        header.appendChild(title);

        const content = document.createElement('div');
        content.id = 'gvp-fullscreen-content';
        const textarea = document.createElement('textarea');
        textarea.id = 'gvp-fullscreen-textarea';
        textarea.placeholder = 'Enter your text here...';
        textarea.addEventListener('input', (e) => this.updateWordCount(e.target.value));
        textarea.addEventListener('keydown', (e) => {
            e.stopPropagation();
        });
        content.appendChild(textarea);

        const footer = document.createElement('div');
        footer.id = 'gvp-fullscreen-footer';
        footer.style.justifyContent = 'center';
        const goBackBtn = document.createElement('button');
        goBackBtn.className = 'gvp-button primary';
        goBackBtn.textContent = '← Go Back (Save)';
        goBackBtn.addEventListener('click', () => this.saveFullscreen());
        const wordCount = document.createElement('span');
        wordCount.textContent = '0 words';
        wordCount.style.position = 'absolute';
        wordCount.style.right = '16px';
        footer.appendChild(goBackBtn);
        footer.appendChild(wordCount);

        modal.appendChild(header);
        modal.appendChild(content);
        modal.appendChild(footer);
        this.shadowRoot.appendChild(modal);
    }

    _createPromptHistoryModal() {
        const modal = document.createElement('div');
        modal.id = 'gvp-prompt-history-modal';

        const content = document.createElement('div');
        content.id = 'gvp-prompt-history-content';

        const header = document.createElement('div');
        header.id = 'gvp-prompt-history-header';

        const title = document.createElement('div');
        title.id = 'gvp-prompt-history-title';
        title.textContent = 'Prompt History';

        const closeBtn = document.createElement('button');
        closeBtn.id = 'gvp-prompt-history-close';
        closeBtn.innerHTML = '×';
        closeBtn.addEventListener('click', () => this.hidePromptHistoryModal());

        header.appendChild(title);
        header.appendChild(closeBtn);

        const list = document.createElement('div');
        list.id = 'gvp-prompt-history-list';

        const footer = document.createElement('div');
        footer.id = 'gvp-prompt-history-footer';

        const info = document.createElement('div');
        info.id = 'gvp-prompt-history-info';
        footer.appendChild(info);

        const closeFooterBtn = document.createElement('button');
        closeFooterBtn.className = 'gvp-button';
        closeFooterBtn.textContent = 'Close';
        closeFooterBtn.addEventListener('click', () => this.hidePromptHistoryModal());
        footer.appendChild(closeFooterBtn);

        content.appendChild(header);
        content.appendChild(list);
        content.appendChild(footer);

        modal.appendChild(content);
        this.shadowRoot.appendChild(modal);
    }

    _createViewJsonModal() {
        const modal = document.createElement('div');
        modal.id = 'gvp-view-json-modal';
        const content = document.createElement('div');
        content.id = 'gvp-view-json-content';
        content.style.maxWidth = '80vw';
        content.style.width = '70vw';
        content.style.minHeight = '80vh';
        content.style.maxHeight = '95vh';

        const header = document.createElement('div');
        header.id = 'gvp-view-json-header';
        const title = document.createElement('div');
        title.id = 'gvp-view-json-title';
        title.textContent = 'Current Prompt Data (JSON)';
        const closeBtn = document.createElement('button');
        closeBtn.id = 'gvp-view-json-close';
        closeBtn.innerHTML = '×';
        closeBtn.addEventListener('click', () => this.hideViewJsonModal());
        header.appendChild(title);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.id = 'gvp-view-json-body';
        const textarea = document.createElement('textarea');
        textarea.id = 'gvp-view-json-textarea';
        textarea.readOnly = true;
        textarea.style.resize = 'vertical';
        textarea.style.overflowY = 'auto';
        textarea.style.width = '100%';
        textarea.style.minHeight = '640px';
        textarea.style.maxHeight = '90vh';
        textarea.style.boxSizing = 'border-box';
        textarea.style.fontFamily = 'monospace';
        textarea.style.fontSize = '12px';
        textarea.style.lineHeight = '1.5';
        textarea.style.padding = '12px';
        textarea.style.border = '1px solid var(--gvp-border)';
        textarea.style.borderRadius = '8px';
        textarea.style.background = 'var(--gvp-bg-input)';
        textarea.style.whiteSpace = 'pre';
        body.appendChild(textarea);

        const footer = document.createElement('div');
        footer.id = 'gvp-view-json-footer';
        const copyBtn = document.createElement('button');
        copyBtn.className = 'gvp-button primary';
        copyBtn.textContent = 'Copy JSON';
        copyBtn.addEventListener('click', () => this.copyJsonToClipboard());
        const exportBtn = document.createElement('button');
        exportBtn.className = 'gvp-button';
        exportBtn.textContent = 'Export JSON';
        exportBtn.addEventListener('click', () => this.exportJson());

        footer.appendChild(copyBtn);
        footer.appendChild(exportBtn);

        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        modal.appendChild(content);
        this.shadowRoot.appendChild(modal);
    }

    _createImportJsonModal() {
        window.Logger.debug('UIModal', 'Creating import JSON modal...');
        const modal = document.createElement('div');
        modal.id = 'gvp-import-json-modal';

        const content = document.createElement('div');
        content.id = 'gvp-import-json-content';

        // Header
        const header = document.createElement('div');
        header.id = 'gvp-import-json-header';
        const title = document.createElement('div');
        title.id = 'gvp-import-json-title';
        title.textContent = '📥 Import JSON Preset';
        const closeBtn = document.createElement('button');
        closeBtn.id = 'gvp-import-json-close';
        closeBtn.innerHTML = '×';
        closeBtn.addEventListener('click', () => this.hideImportJsonModal());
        header.appendChild(title);
        header.appendChild(closeBtn);

        // Body
        const body = document.createElement('div');
        body.id = 'gvp-import-json-body';

        // JSON textarea
        const textareaLabel = document.createElement('label');
        textareaLabel.textContent = 'Paste your JSON prompt here:';
        textareaLabel.style.display = 'block';
        textareaLabel.style.marginBottom = '8px';
        textareaLabel.style.fontWeight = 'bold';
        body.appendChild(textareaLabel);

        const textarea = document.createElement('textarea');
        textarea.id = 'gvp-import-json-textarea';
        textarea.placeholder = '{\n  "shot": {...},\n  "scene": {...},\n  ...\n}';
        textarea.rows = 15;
        textarea.style.width = '100%';
        textarea.style.fontFamily = 'monospace';
        textarea.style.fontSize = '12px';
        textarea.style.marginBottom = '16px';
        // Prevent keystrokes from leaking to Grok's prompt area
        textarea.addEventListener('keydown', (e) => {
            e.stopPropagation();
        });
        textarea.addEventListener('keyup', (e) => {
            e.stopPropagation();
        });
        body.appendChild(textarea);

        // Preset name input
        const nameLabel = document.createElement('label');
        nameLabel.textContent = 'Preset name:';
        nameLabel.style.display = 'block';
        nameLabel.style.marginBottom = '8px';
        nameLabel.style.fontWeight = 'bold';
        body.appendChild(nameLabel);

        const nameInput = document.createElement('input');
        nameInput.id = 'gvp-import-json-name';
        nameInput.type = 'text';
        nameInput.placeholder = 'Enter a name for this preset...';
        nameInput.style.width = '100%';
        nameInput.style.marginBottom = '8px';
        // Prevent keystrokes from leaking to Grok's prompt area
        nameInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
        });
        nameInput.addEventListener('keyup', (e) => {
            e.stopPropagation();
        });
        body.appendChild(nameInput);

        // Footer
        const footer = document.createElement('div');
        footer.id = 'gvp-import-json-footer';
        footer.style.display = 'flex';
        footer.style.gap = '8px';
        footer.style.justifyContent = 'flex-end';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'gvp-button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => this.hideImportJsonModal());
        footer.appendChild(cancelBtn);

        const importBtn = document.createElement('button');
        importBtn.className = 'gvp-button primary';
        importBtn.textContent = 'Import & Save as Preset';
        importBtn.addEventListener('click', () => {
            const jsonString = textarea.value;
            const presetName = nameInput.value;
            if (this.importJsonCallback) {
                this.importJsonCallback(jsonString, presetName);
            }
            this.hideImportJsonModal();
        });
        footer.appendChild(importBtn);

        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        modal.appendChild(content);
        this.shadowRoot.appendChild(modal);
        window.Logger.debug('UIModal', 'Import JSON modal created and appended to shadowRoot', { modalId: modal.id });
    }

    _createSavedPromptModal() {
        const modal = document.createElement('div');
        modal.id = 'gvp-saved-prompt-modal';

        const content = document.createElement('div');
        content.id = 'gvp-saved-prompt-content';

        const header = document.createElement('div');
        header.id = 'gvp-saved-prompt-header';

        const title = document.createElement('div');
        title.id = 'gvp-saved-prompt-title';
        title.textContent = 'Saved Prompt';

        const closeBtn = document.createElement('button');
        closeBtn.id = 'gvp-saved-prompt-close';
        closeBtn.type = 'button';
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', () => this.hideSavedPromptModal());

        header.appendChild(title);
        header.appendChild(closeBtn);

        const meta = document.createElement('div');
        meta.id = 'gvp-saved-prompt-meta';

        const body = document.createElement('div');
        body.id = 'gvp-saved-prompt-body';

        const textarea = document.createElement('textarea');
        textarea.id = 'gvp-saved-prompt-textarea';
        textarea.readOnly = true;

        body.appendChild(textarea);

        const footer = document.createElement('div');
        footer.id = 'gvp-saved-prompt-footer';

        const loadBtn = document.createElement('button');
        loadBtn.className = 'gvp-button primary';
        loadBtn.type = 'button';
        loadBtn.textContent = 'Load into Raw Tab';

        loadBtn.addEventListener('click', () => {
            const cb = this._savedPromptCallbacks?.onLoad;
            if (typeof cb === 'function') {
                cb();
            }
            this.hideSavedPromptModal();
        });

        const copyBtn = document.createElement('button');
        copyBtn.className = 'gvp-button';
        copyBtn.type = 'button';
        copyBtn.textContent = 'Copy Prompt';

        copyBtn.addEventListener('click', async () => {
            const prompt = textarea.value || '';
            if (!prompt) {
                return;
            }
            try {
                await navigator.clipboard.writeText(prompt);
                window.Logger.info('UIModal', 'Saved prompt copied to clipboard');
            } catch (error) {
                window.Logger.warn('UIModal', 'Clipboard copy failed, using fallback', error);
                const temp = document.createElement('textarea');
                temp.value = prompt;
                temp.style.position = 'fixed';
                temp.style.opacity = '0';
                document.body.appendChild(temp);
                temp.select();
                document.execCommand('copy');
                document.body.removeChild(temp);
            }
        });

        footer.appendChild(loadBtn);
        footer.appendChild(copyBtn);

        content.appendChild(header);
        content.appendChild(meta);
        content.appendChild(body);
        content.appendChild(footer);

        modal.appendChild(content);

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                this.hideSavedPromptModal();
            }
        });

        this.shadowRoot.appendChild(modal);

        this.savedPromptModal = {
            modal,
            title,
            meta,
            textarea,
            loadBtn,
            copyBtn
        };
    }

    showViewJsonModal() {
        const modal = this.shadowRoot.getElementById('gvp-view-json-modal');
        this._populateJsonTextarea(true);
        modal.classList.add('visible');
    }

    hideViewJsonModal() {
        const modal = this.shadowRoot.getElementById('gvp-view-json-modal');
        modal.classList.remove('visible');
    }

    showImportJsonModal(callback) {
        window.Logger.debug('UIModal', 'showImportJsonModal called, looking for elements...');
        const modal = this.shadowRoot.getElementById('gvp-import-json-modal');
        const textarea = this.shadowRoot.getElementById('gvp-import-json-textarea');
        const nameInput = this.shadowRoot.getElementById('gvp-import-json-name');

        window.Logger.debug('UIModal', 'Import modal elements found:', {
            modal: !!modal,
            textarea: !!textarea,
            nameInput: !!nameInput,
            shadowRootChildren: this.shadowRoot.childElementCount
        });

        if (!modal || !textarea || !nameInput) {
            window.Logger.error('UIModal', 'Import modal elements not found', {
                modalFound: !!modal,
                textareaFound: !!textarea,
                nameInputFound: !!nameInput
            });
            return;
        }

        // Clear previous values
        textarea.value = '';
        nameInput.value = '';

        // Store callback
        this.importJsonCallback = callback;

        // Show modal
        modal.classList.add('visible');

        // Focus textarea for easy paste
        setTimeout(() => textarea.focus(), 100);
    }

    hideImportJsonModal() {
        const modal = this.shadowRoot.getElementById('gvp-import-json-modal');
        if (modal) {
            modal.classList.remove('visible');
        }
        this.importJsonCallback = null;
    }

    showSavedPromptModal(details = {}, callbacks = {}) {
        if (!this.savedPromptModal) {
            window.Logger.warn('UIModal', 'Saved prompt modal not initialized');
            return;
        }

        const { modal, title, meta, textarea } = this.savedPromptModal;
        const { slot, prompt, timestamp } = details;

        title.textContent = slot ? `Saved Prompt – Slot ${slot}` : 'Saved Prompt';
        textarea.value = prompt || '';

        meta.textContent = this._formatSavedPromptMeta(prompt, timestamp);

        this._savedPromptCallbacks = callbacks || {};

        modal.classList.add('visible');
    }

    hideSavedPromptModal() {
        if (!this.savedPromptModal) {
            return;
        }
        this.savedPromptModal.modal.classList.remove('visible');
        this._savedPromptCallbacks = {};
    }

    _formatSavedPromptMeta(prompt = '', timestamp) {
        const parts = [];
        const length = typeof prompt === 'string' ? prompt.length : 0;
        if (length) {
            parts.push(`${length} characters`);
        }

        if (timestamp) {
            const formatted = new Date(timestamp).toLocaleString();
            parts.push(`Saved ${formatted}`);
        }

        if (!parts.length) {
            return 'No additional metadata';
        }

        return parts.join(' • ');
    }

    showPromptHistoryModal(entries = [], meta = {}) {
        const modal = this.shadowRoot.getElementById('gvp-prompt-history-modal');
        const list = this.shadowRoot.getElementById('gvp-prompt-history-list');
        const info = this.shadowRoot.getElementById('gvp-prompt-history-info');

        if (!modal || !list) {
            window.Logger.warn('UIModal', 'Prompt history modal missing required elements');
            return;
        }

        list.innerHTML = '';

        if (!entries.length) {
            const empty = document.createElement('div');
            empty.className = 'gvp-prompt-history-empty';
            empty.textContent = 'No prompt history available for this image yet.';
            list.appendChild(empty);
        } else {
            entries.forEach((entry) => {
                const item = document.createElement('div');
                item.className = 'gvp-prompt-history-item';

                const header = document.createElement('div');
                header.className = 'gvp-prompt-history-item-header';

                const badge = document.createElement('span');
                badge.className = 'gvp-prompt-history-badge';
                badge.textContent = entry.isJson ? 'JSON' : 'RAW';

                const time = document.createElement('span');
                time.className = 'gvp-prompt-history-time';
                time.textContent = this._formatTimestamp(entry.timestamp);

                if (entry.moderated) {
                    const moderated = document.createElement('span');
                    moderated.className = 'gvp-prompt-history-moderated';
                    moderated.textContent = 'Moderated';
                    header.appendChild(moderated);
                }

                if (entry.source) {
                    const source = document.createElement('span');
                    source.className = 'gvp-prompt-history-source';
                    source.textContent = entry.source;
                    header.appendChild(source);
                }

                header.appendChild(badge);
                header.appendChild(time);

                const preview = document.createElement('pre');
                preview.className = 'gvp-prompt-history-preview';
                const snippet = entry.prompt.length > 300 ? `${entry.prompt.slice(0, 300)}…` : entry.prompt;
                preview.textContent = snippet;

                const actions = document.createElement('div');
                actions.className = 'gvp-prompt-history-actions';

                const applyBtn = document.createElement('button');
                applyBtn.className = 'gvp-button primary';
                applyBtn.textContent = 'Apply';
                applyBtn.addEventListener('click', () => {
                    this.hidePromptHistoryModal();
                    if (window.gvpUIManager && typeof window.gvpUIManager.applyPromptFromHistory === 'function') {
                        window.gvpUIManager.applyPromptFromHistory(entry.index);
                    }
                });

                const copyBtn = document.createElement('button');
                copyBtn.className = 'gvp-button';
                copyBtn.textContent = 'Copy';
                copyBtn.addEventListener('click', () => {
                    this._copyPromptToClipboard(entry.prompt);
                });

                actions.appendChild(applyBtn);
                actions.appendChild(copyBtn);

                item.appendChild(header);
                item.appendChild(preview);
                item.appendChild(actions);

                list.appendChild(item);
            });
        }

        if (info) {
            const total = entries.length;
            const formattedDate = entries.length ? this._formatTimestamp(entries[0].timestamp) : 'N/A';
            info.textContent = `Image ID: ${meta?.imageId || 'unknown'} • Entries: ${total} • Most recent: ${formattedDate}`;
        }

        modal.classList.add('visible');
    }

    hidePromptHistoryModal() {
        const modal = this.shadowRoot.getElementById('gvp-prompt-history-modal');
        if (modal) {
            modal.classList.remove('visible');
        }
    }

    updateJsonPreview() {
        if (typeof this._populateJsonTextarea === 'function') {
            this._populateJsonTextarea(false);
        } else {
            window.Logger.warn('UIModal', 'JSON textarea helper missing, skipping preview update');
        }
    }

    _promptDataLooksDefault(promptData) {
        if (!promptData || typeof promptData !== 'object') {
            return true;
        }

        const categories = ['shot', 'scene', 'cinematography', 'visual_details', 'audio'];
        for (const category of categories) {
            if (promptData[category] && Object.values(promptData[category]).some(value => {
                if (Array.isArray(value)) return value.length > 0;
                return typeof value === 'string' ? value.trim().length > 0 : !!value;
            })) {
                return false;
            }
        }

        if (typeof promptData.motion === 'string' && promptData.motion.trim().length) {
            return false;
        }

        if (Array.isArray(promptData.dialogue) && promptData.dialogue.length) {
            return false;
        }

        if (Array.isArray(promptData.tags) && promptData.tags.length) {
            return false;
        }

        return true;
    }

    copyJsonToClipboard() {
        const textarea = this.shadowRoot.getElementById('gvp-view-json-textarea');
        textarea.value = this._stringifyTemplatedPrompt();
        textarea.select();
        document.execCommand('copy');
        this.showSuccess('JSON copied to clipboard!');
        this.hideViewJsonModal();
    }

    exportJson() {
        const blob = new Blob([this._stringifyTemplatedPrompt()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `grok-video-prompt-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    _populateJsonTextarea(force = false) {
        const textarea = this.shadowRoot.getElementById('gvp-view-json-textarea');
        if (!textarea) {
            return;
        }

        if (!force) {
            const modal = this.shadowRoot.getElementById('gvp-view-json-modal');
            if (!modal || !modal.classList.contains('visible')) {
                return;
            }
        }

        textarea.value = this._stringifyTemplatedPrompt();
        // Auto-size to fit content (bounded by maxHeight)
        textarea.style.height = 'auto';
        const maxHeight = Math.max(640, window.innerHeight * 0.9);
        textarea.style.maxHeight = `${maxHeight}px`;
        textarea.style.height = `${Math.min(textarea.scrollHeight + 16, maxHeight)}px`;
    }

    _getTemplatedPromptData() {
        try {
            const state = this.stateManager.getState();
            const promptData = state?.promptData || {};

            if (typeof this.stateManager.applyTemplatesToPrompt === 'function') {
                return this.stateManager.applyTemplatesToPrompt(promptData) || {};
            }

            return promptData;
        } catch (error) {
            window.Logger.error('UIModal', 'Failed to prepare templated JSON preview:', error);
            const stateFallback = this.stateManager.getState();
            return stateFallback?.promptData || {};
        }
    }

    _stringifyTemplatedPrompt() {
        const data = this._getTemplatedPromptData();
        return JSON.stringify(data, null, 2);
    }

    _formatTimestamp(value) {
        if (!value) {
            return 'Unknown';
        }
        const date = typeof value === 'number' ? new Date(value) : new Date(Number(value));
        if (Number.isNaN(date.getTime())) {
            return 'Unknown';
        }
        return date.toLocaleString();
    }

    _copyPromptToClipboard(prompt) {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = prompt;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'absolute';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            window.Logger.info('UIModal', '✅ Prompt copied to clipboard');
        } catch (error) {
            window.Logger.error('UIModal', '❌ Failed to copy prompt:', error);
        }
    }

    minimizeFullscreen() {
        const textarea = this.shadowRoot.getElementById('gvp-fullscreen-textarea');
        const modal = this.shadowRoot.getElementById('gvp-fullscreen-modal');
        const state = this.stateManager.getState();
        const displayText = textarea.value;
        const storageText = this.sentenceFormatter.toStorage(displayText);

        const { category, subArray } = state.fullscreenContent;
        if (category && subArray) {
            if (subArray.includes('[')) {
                const fieldName = subArray.split('[')[0];
                const index = parseInt(subArray.match(/\[(\d+)\]/)[1]);

                if (category === 'visual_details') {
                    if (!state.promptData.visual_details[fieldName]) {
                        state.promptData.visual_details[fieldName] = [];
                    }
                    state.promptData.visual_details[fieldName][index] = storageText;
                } else if (category === 'dialogue') {
                    if (!state.promptData.dialogue) {
                        state.promptData.dialogue = [];
                    }
                    state.promptData.dialogue[index] = storageText;
                }
            } else {
                if (category === 'motion') {
                    state.promptData.motion = storageText;
                } else {
                    if (!state.promptData[category]) {
                        state.promptData[category] = {};
                    }
                    state.promptData[category][subArray] = storageText;
                }
            }
        }

        modal.classList.remove('visible');
    }

    async saveFullscreen() {
        const modal = this.shadowRoot.getElementById('gvp-fullscreen-modal');
        if (!modal || !modal.classList.contains('visible')) return;

        const textarea = this.shadowRoot.getElementById('gvp-fullscreen-textarea');
        const displayValue = textarea.value;

        // Retrieve stored context
        const fullscreenData = this.stateManager.getState().fullscreenContent;
        if (!fullscreenData) {
            window.Logger.error('UIModal', 'No fullscreen context found for save');
            return;
        }

        const storageValue = this.sentenceFormatter.toStorage(displayValue);
        const category = fullscreenData.category;
        const field = fullscreenData.subArray;
        const templateId = fullscreenData.templateId;
        const templateRole = fullscreenData.templateRole;

        if (window.gvpUIManager && window.gvpUIManager.uiFormManager && typeof window.gvpUIManager.uiFormManager.handleFullscreenSave === 'function') {
            window.gvpUIManager.uiFormManager.handleFullscreenSave(fullscreenData, displayValue, storageValue);
        }

        if (category === 'rawTemplate') {
            if (templateId && templateRole && window.gvpUIManager && typeof window.gvpUIManager.updateTemplateContentFromFullscreen === 'function') {
                await window.gvpUIManager.updateTemplateContentFromFullscreen(templateId, templateRole, storageValue);
                window.Logger.info('UIModal', 'Saved raw template segment:', templateId, templateRole);
            } else {
                window.Logger.warn('UIModal', 'Unable to update raw template from fullscreen:', templateId, templateRole);
            }
        } else if (category === 'motion') {
            this.stateManager.getState().promptData.motion = storageValue;
            window.Logger.debug('UIModal', 'Saved motion:', storageValue);
        } else if (field) {
            const fieldPath = `${category}.${field}`;
            this._setNestedValue(fieldPath, storageValue);
            window.Logger.debug('UIModal', 'Saved', fieldPath, ':', storageValue);
        } else {
            window.Logger.error('UIModal', 'Unknown field structure:', category, field);
        }

        this.closeFullscreen();
        window.Logger.info('UIModal', '✅ Fullscreen save complete');
    }

    closeFullscreen() {
        const modal = this.shadowRoot.getElementById('gvp-fullscreen-modal');
        modal.classList.remove('visible');
    }

    updateWordCount(text) {
        const wordCount = this.shadowRoot.querySelector('#gvp-fullscreen-footer span');
        if (wordCount) {
            const words = text.split(/\s+/).filter(w => w.length > 0).length;
            wordCount.textContent = `${words} words`;
        }
    }

    openProjectDetails(project) {
        window.Logger.debug('UIModal', 'Opening project details:', project.imageId);

        const modal = document.createElement('div');
        modal.className = 'gvp-project-modal';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.background = 'rgba(0,0,0,0.8)';
        modal.style.zIndex = '20000';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.padding = '20px';

        const modalContent = document.createElement('div');
        modalContent.style.background = '#111827';
        modalContent.style.borderRadius = '12px';
        modalContent.style.padding = '24px';
        modalContent.style.maxWidth = '600px';
        modalContent.style.maxHeight = '80vh';
        modalContent.style.overflowY = 'auto';
        modalContent.style.width = '100%';
        modalContent.style.border = '2px solid #fbbf24';

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '20px';

        const title = document.createElement('h3');
        title.className = 'gvp-label';
        title.textContent = 'Project Details';
        title.style.margin = '0';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.background = 'transparent';
        closeBtn.style.border = 'none';
        closeBtn.style.color = '#ddd';
        closeBtn.style.fontSize = '24px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.addEventListener('click', () => {
            modal.remove();
        });

        header.appendChild(title);
        header.appendChild(closeBtn);
        modalContent.appendChild(header);

        const projectInfo = document.createElement('div');
        projectInfo.innerHTML = `
            <div style="margin-bottom: 16px;">
                <strong>Image ID:</strong> ${project.imageId.substring(0, 24)}...
            </div>
            <div style="margin-bottom: 16px;">
                <strong>Created:</strong> ${new Date(project.createdAt).toLocaleString()}
            </div>
            <div style="margin-bottom: 16px;">
                <strong>Last Accessed:</strong> ${new Date(project.lastAccessed).toLocaleString()}
            </div>
            <div style="color: #888; font-size: 12px;">
                Detailed project management UI will be implemented in future stages.
            </div>
        `;
        modalContent.appendChild(projectInfo);

        modal.appendChild(modalContent);
        this.shadowRoot.appendChild(modal);
    }

    _setNestedValue(key, value) {
        const keys = key.split('.');
        let obj = this.stateManager.getState().promptData;

        if (!obj) return;

        for (let i = 0; i < keys.length - 1; i++) {
            if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object' || Array.isArray(obj[keys[i]])) {
                obj[keys[i]] = {};
            }
            obj = obj[keys[i]];
        }

        const finalKey = keys[keys.length - 1];
        obj[finalKey] = value;
    }

    // Toast Notification System (replaces window.alert)
    showToast(message, type = 'success', duration = 3000) {
        this.toastQueue.push({ message, type, duration });
        if (!this.toastShowing) {
            this._processToastQueue();
        }
    }

    _processToastQueue() {
        if (this.toastQueue.length === 0) {
            this.toastShowing = false;
            return;
        }

        this.toastShowing = true;
        const { message, type, duration } = this.toastQueue.shift();

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `gvp-toast gvp-toast-${type}`;
        toast.textContent = message;

        // Add to shadow DOM
        this.shadowRoot.appendChild(toast);

        // Show toast (trigger animation)
        setTimeout(() => toast.classList.add('show'), 10);

        // Hide and remove toast
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
                this._processToastQueue(); // Process next toast
            }, 300); // Wait for fade-out animation
        }, duration);
    }

    // Convenience methods
    showSuccess(message, duration = 3000) {
        this.showToast(message, 'success', duration);
    }

    showError(message, duration = 4000) {
        this.showToast(message, 'error', duration);
    }

    showInfo(message, duration = 3000) {
        this.showToast(message, 'info', duration);
    }
    showWarning(message, duration = 3500) {
        this.showToast(message, 'warning', duration);
    }
    async showTemplateManagerModal(callbacks = {}) {
        const templates = await this.stateManager.getRawTemplates();
        const config = {
            title: '📝 Template Manager',
            items: templates,
            searchPlaceholder: 'Search templates...',
            emptyMessage: 'No templates found',
            getItemName: (item) => item.name || 'Unnamed Template',
            getItemPreview: (item) => {
                const parts = [];
                if (item.fieldPath) parts.push(`Field: ${item.fieldPath}`);
                if (item.prefix) parts.push(`Prefix: "${item.prefix}"`);
                if (item.suffix) parts.push(`Suffix: "${item.suffix}"`);
                if (item.autoApply) parts.push('✅ Auto-Apply Active');
                return parts.join('\n');
            },
            onLoad: callbacks.onLoad,
            onRename: callbacks.onRename,
            onDelete: callbacks.onDelete,
            onToggleActive: callbacks.onToggleActive,
            onCreate: callbacks.onCreate,
            canToggleActive: true,
            renderEditor: callbacks.renderEditor,
            simpleCreate: callbacks.simpleCreate
        };
        this._createManagerModal(config);
    }

    async showPresetManagerModal(callbacks = {}) {
        const presets = await this.stateManager.getJsonPresets();
        const config = {
            title: '📂 Preset Manager',
            items: presets,
            searchPlaceholder: 'Search presets...',
            emptyMessage: 'No presets found',
            getItemName: (item) => item.name,
            getItemPreview: (item) => JSON.stringify(item.data, null, 2),
            onLoad: callbacks.onLoad,
            onRename: callbacks.onRename,
            onDelete: callbacks.onDelete,
            canToggleActive: false
        };
        this._createManagerModal(config);
    }

    async showDialogueEditorModal({ template, role, onSave }) {
        const modal = document.createElement('div');
        modal.className = 'gvp-modal-overlay';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 999999;';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background: #1a1a1a; border-radius: 12px; width: 90%; max-width: 900px; height: 80vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.5);';

        const header = document.createElement('div');
        header.style.cssText = 'padding: 20px 24px; border-bottom: 1px solid #333; display: flex; align-items: center; justify-content: space-between;';

        const titleDiv = document.createElement('div');
        const title = document.createElement('h2');
        title.textContent = `Dialogue Editor`;
        title.style.cssText = 'margin: 0; font-size: 18px; color: #fff;';
        const subtitle = document.createElement('div');
        subtitle.textContent = `${template.name} - ${role === 'prefix' ? 'PREFIX' : 'SUFFIX'} Dialogue`;
        subtitle.style.cssText = 'margin-top: 4px; font-size: 13px; color: #888;';
        titleDiv.appendChild(title);
        titleDiv.appendChild(subtitle);

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.className = 'gvp-button ghost';
        closeBtn.style.cssText = 'font-size: 28px; padding: 4px 12px;';
        closeBtn.onclick = () => modal.remove();
        header.appendChild(titleDiv);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.style.cssText = 'flex: 1; padding: 24px; overflow-y: auto; min-height: 0;';

        const dialogueTemplate = template.dialogueTemplate || { prefixLines: [], suffixLines: [] };
        const currentLines = role === 'prefix' ? dialogueTemplate.prefixLines : dialogueTemplate.suffixLines;

        const presetOptions = this.stateManager.getState().settings.presetOptions || {};
        const gatherOptionValues = (fieldName, existingOptions = []) => Array.isArray(existingOptions) ? existingOptions : [];

        const dialogueConfig = {
            maxDuration: 6,
            objectOptions: [{ value: '', label: 'Select character' }, { value: 'narrator', label: 'Narrator' }, { value: 'character1', label: 'Character 1' }, { value: 'character2', label: 'Character 2' }],
            accentOptions: gatherOptionValues('accent', presetOptions.accent),
            languageOptions: gatherOptionValues('language', presetOptions.language),
            emotionOptions: gatherOptionValues('emotion', presetOptions.emotion),
            typeOptions: gatherOptionValues('type', presetOptions.type)
        };

        const listContainer = window.ArrayFieldManager.createDialogueList({
            shadowRoot: this.shadowRoot,
            initialValues: currentLines || [],
            dialogueConfig: dialogueConfig,
            dialogueItemOptions: { includeSaveButton: false, compactMode: false }
        });

        listContainer.style.cssText = 'background: #262626; border-radius: 8px; padding: 16px;';
        body.appendChild(listContainer);

        const footer = document.createElement('div');
        footer.style.cssText = 'padding: 16px 24px; border-top: 1px solid #333; display: flex; justify-content: flex-end; gap: 12px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'gvp-button ghost';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => modal.remove();

        const saveBtn = document.createElement('button');
        saveBtn.className = 'gvp-button primary';
        saveBtn.textContent = 'Save & Close';
        saveBtn.onclick = async () => {
            try {
                const updatedLines = window.ArrayFieldManager.collectDialogueValues(listContainer);
                const existing = template.dialogueTemplate || { prefixLines: [], suffixLines: [] };
                template.dialogueTemplate = {
                    prefixLines: role === 'prefix' ? updatedLines : existing.prefixLines,
                    suffixLines: role === 'suffix' ? updatedLines : existing.suffixLines
                };
                await this.stateManager.saveRawTemplate(template);
                this.showToast('Dialogue saved successfully', 'success');
                if (onSave) await onSave(updatedLines);
                modal.remove();
            } catch (error) {
                window.Logger.error('UIModal', 'Failed to save dialogue:', error);
                this.showToast('Failed to save dialogue', 'error');
            }
        };

        footer.appendChild(cancelBtn);
        footer.appendChild(saveBtn);

        dialog.appendChild(header);
        dialog.appendChild(body);
        dialog.appendChild(footer);
        modal.appendChild(dialog);
        this.shadowRoot.appendChild(modal);

        setTimeout(() => {
            const firstInput = listContainer.querySelector('input, textarea, select');
            if (firstInput) firstInput.focus();
        }, 100);
    }

    _createManagerModal(config) {
        window.Logger.debug('UIModal', 'Opening Manager Modal:', config.title);

        const existing = this.shadowRoot.getElementById('gvp-manager-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'gvp-manager-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;

        const panel = document.createElement('div');
        panel.className = 'gvp-manager-panel';
        panel.style.cssText = `
            width: 900px;
            height: 700px;
            max-width: 95vw;
            max-height: 90vh;
            background: #141414;
            border: 1px solid #333;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 16px 24px;
            border-bottom: 1px solid #333;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #1a1a1a;
        `;

        const title = document.createElement('h2');
        title.textContent = config.title;
        title.style.cssText = 'margin: 0 auto; font-size: 18px; color: #fff; font-weight: 600;';

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: #888;
            font-size: 28px;
            cursor: pointer;
            line-height: 1;
            padding: 0 8px;
        `;
        closeBtn.onmouseover = () => closeBtn.style.color = '#fff';
        closeBtn.onmouseout = () => closeBtn.style.color = '#888';
        closeBtn.onclick = () => modal.remove();

        header.appendChild(title);
        header.appendChild(closeBtn);
        panel.appendChild(header);

        // Content
        const content = document.createElement('div');
        content.style.cssText = `
            display: flex;
            flex: 1;
            overflow: hidden;
        `;

        // Left Column
        const leftCol = document.createElement('div');
        leftCol.style.cssText = `
            width: 300px;
            border-right: 1px solid #333;
            display: flex;
            flex-direction: column;
            background: #111;
        `;

        const searchContainer = document.createElement('div');
        searchContainer.style.cssText = 'padding: 16px; border-bottom: 1px solid #262626; flex-shrink: 0;';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = config.searchPlaceholder;
        searchInput.style.cssText = `
            width: 100%;
            padding: 8px 12px;
            background: #262626;
            border: 1px solid #404040;
            border-radius: 6px;
            color: #fff;
            font-size: 13px;
            outline: none;
        `;
        searchInput.onfocus = () => searchInput.style.borderColor = '#4ade80';
        searchInput.onblur = () => searchInput.style.borderColor = '#404040';

        searchContainer.appendChild(searchInput);
        leftCol.appendChild(searchContainer);

        const listContainer = document.createElement('div');
        listContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 8px;
        `;
        leftCol.appendChild(listContainer);

        // Right Column
        const rightCol = document.createElement('div');
        rightCol.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
            background: #141414;
            min-width: 0;
        `;

        let editorContainer = null;
        let previewHeader = null;
        let previewTitle = null;
        let previewBody = null;

        if (config.renderEditor) {
            editorContainer = document.createElement('div');
            editorContainer.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                position: relative;
                background: #141414;
            `;
            rightCol.appendChild(editorContainer);

            // Initial empty state
            editorContainer.innerHTML = `
                <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: #666; font-size: 13px;">
                    Select an item to edit
                </div>
            `;
        } else {
            previewHeader = document.createElement('div');
            previewHeader.style.cssText = `
                padding: 12px 24px;
                border-bottom: 1px solid #262626;
                display: flex;
                justify-content: space-between;
                align-items: center;
                height: 50px;
                flex-shrink: 0;
            `;

            previewTitle = document.createElement('div');
            previewTitle.textContent = 'Select an item to view details';
            previewTitle.style.cssText = 'color: #888; font-size: 13px; font-weight: 500;';

            previewHeader.appendChild(previewTitle);
            rightCol.appendChild(previewHeader);

            previewBody = document.createElement('div');
            previewBody.style.cssText = `
                flex: 1;
                padding: 20px;
                overflow-y: auto;
                font-family: monospace;
                font-size: 12px;
                color: #a1a1aa;
                white-space: pre-wrap;
            `;
            rightCol.appendChild(previewBody);
        }

        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 16px 24px;
            border-top: 1px solid #333;
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            background: #1a1a1a;
            align-items: center;
        `;

        if (config.onCreate) {
            const createContainer = document.createElement('div');
            createContainer.style.cssText = 'display: flex; gap: 8px; flex: 1; margin-right: 12px;';

            if (config.simpleCreate) {
                const createBtn = document.createElement('button');
                createBtn.textContent = 'Create New';
                createBtn.className = 'gvp-button primary';
                createBtn.style.whiteSpace = 'nowrap';
                createBtn.onclick = async () => {
                    try {
                        const newTemplate = await config.onCreate('New Template');
                        if (newTemplate) {
                            window.Logger.info('UIModal', 'Manager Modal: Created new item', newTemplate);
                            currentItems.push(newTemplate);
                            renderList(searchInput.value);
                            selectItem(newTemplate);
                        }
                    } catch (error) {
                        window.Logger.error('UIModal', 'Manager Modal: Failed to create item', error);
                    }
                };
                createContainer.appendChild(createBtn);
            } else {
                const nameInput = document.createElement('input');
                nameInput.type = 'text';
                nameInput.placeholder = 'New Template Name...';
                nameInput.style.cssText = `
                    flex: 1;
                    padding: 8px 12px;
                    background: #262626;
                    border: 1px solid #404040;
                    border-radius: 6px;
                    color: #fff;
                    font-size: 13px;
                    outline: none;
                `;
                // Isolate input
                nameInput.addEventListener('keydown', e => e.stopPropagation());
                nameInput.addEventListener('keyup', e => e.stopPropagation());
                nameInput.addEventListener('keypress', e => e.stopPropagation());

                const createBtn = document.createElement('button');
                createBtn.textContent = 'Create';
                createBtn.className = 'gvp-button primary';
                createBtn.style.whiteSpace = 'nowrap';
                createBtn.onclick = async () => {
                    const name = nameInput.value.trim();
                    if (!name) return;

                    try {
                        const newTemplate = await config.onCreate(name);
                        if (newTemplate) {
                            window.Logger.info('UIModal', 'Manager Modal: Created new item', newTemplate);
                            nameInput.value = '';
                            currentItems.push(newTemplate);
                            renderList(searchInput.value);
                            selectItem(newTemplate);
                        } else {
                            window.Logger.warn('UIModal', 'Manager Modal: onCreate returned null/undefined');
                        }
                    } catch (error) {
                        window.Logger.error('UIModal', 'Manager Modal: Failed to create item', error);
                    }
                };

                createContainer.appendChild(nameInput);
                createContainer.appendChild(createBtn);
            }
            footer.appendChild(createContainer);
        }

        const deleteBtn = this._createActionButton('🗑️ Delete', '#451a1a', '#ef4444');
        deleteBtn.style.display = 'none'; // Hidden until item selected

        const loadBtn = document.createElement('button');
        loadBtn.textContent = 'Load Item';
        loadBtn.className = 'gvp-button primary';
        loadBtn.disabled = true;
        loadBtn.style.opacity = '0.5';
        loadBtn.style.cursor = 'not-allowed';
        if (!config.onLoad) loadBtn.style.display = 'none';

        footer.appendChild(deleteBtn);
        footer.appendChild(loadBtn);
        rightCol.appendChild(footer);

        content.appendChild(leftCol);
        content.appendChild(rightCol);
        panel.appendChild(content);
        modal.appendChild(panel);
        this.shadowRoot.appendChild(modal);

        // Logic
        const handleRename = (item) => {
            // Find the specific list item element
            // We need a way to identify the element. 
            // Since we re-render on every change, we can just re-render this specific item in "edit mode"
            // OR simpler: find the element by text content (risky) or add an ID.
            // Let's modify renderList to handle an "editingItem" state.
            editingItem = item;
            renderList(searchInput.value);
        };

        // Logic
        let selectedItem = null;
        let editingItem = null; // Track which item is being edited
        let currentItems = [...config.items];

        const renderList = (filterText = '') => {
            listContainer.innerHTML = '';
            const filtered = currentItems.filter(item =>
                config.getItemName(item).toLowerCase().includes(filterText.toLowerCase())
            );

            if (filtered.length === 0) {
                listContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: #666; font-size: 13px;">${config.emptyMessage}</div>`;
                return;
            }

            filtered.forEach(item => {
                const div = document.createElement('div');
                const name = config.getItemName(item);

                // CRITICAL FIX: Use ID for selection if available, fallback to name
                const isSelected = selectedItem && (item.id ? item.id === selectedItem.id : config.getItemName(selectedItem) === name);
                const isEditing = editingItem && (item.id ? item.id === editingItem.id : config.getItemName(editingItem) === name);
                const isActive = item.autoApply;

                div.style.cssText = `
                    padding: 10px 12px;
                    margin-bottom: 4px;
                    border-radius: 6px;
                    cursor: pointer;
                    color: ${isSelected ? '#fff' : '#ccc'};
                    background: ${isSelected ? '#262626' : 'transparent'};
                    font-size: 13px;
                    transition: all 0.2s;
                    border: 1px solid ${isSelected ? '#404040' : 'transparent'};
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                `;

                if (isEditing) {
                    const inputContainer = document.createElement('div');
                    inputContainer.style.cssText = 'display: flex; gap: 4px; align-items: center; flex: 1;';

                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = name;
                    input.style.cssText = `
                        background: #111;
                        border: 1px solid #4ade80;
                        color: #fff;
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 13px;
                        flex: 1;
                        outline: none;
                    `;

                    const saveRename = async () => {
                        const newName = input.value.trim();
                        if (newName && newName !== name) {
                            if (config.onRename) {
                                const result = await config.onRename(item, newName);
                                if (result && result.success) {
                                    // Find item by ID if possible
                                    const index = currentItems.findIndex(i => item.id ? i.id === item.id : config.getItemName(i) === name);
                                    if (index !== -1) {
                                        if (result.newItem) {
                                            currentItems[index] = result.newItem;
                                        } else {
                                            item.name = newName;
                                            currentItems[index] = item;
                                        }
                                        if (isSelected) selectedItem = currentItems[index];
                                    }
                                }
                            }
                        }
                        editingItem = null;
                        renderList(searchInput.value);
                    };

                    const cancelRename = () => {
                        editingItem = null;
                        renderList(searchInput.value);
                    };

                    input.onkeydown = (e) => {
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        if (e.key === 'Enter') {
                            saveRename();
                        } else if (e.key === 'Escape') {
                            cancelRename();
                        }
                    };

                    input.onkeyup = (e) => {
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                    };

                    input.oninput = (e) => {
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                    };

                    input.onclick = (e) => {
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                    };

                    const confirmBtn = document.createElement('button');
                    confirmBtn.innerHTML = '✓';
                    confirmBtn.title = 'Save (Enter)';
                    confirmBtn.style.cssText = `
                        background: #166534;
                        border: 1px solid #4ade80;
                        color: #4ade80;
                        cursor: pointer;
                        font-size: 16px;
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-weight: bold;
                    `;
                    confirmBtn.onmouseover = () => confirmBtn.style.background = '#14532d';
                    confirmBtn.onmouseout = () => confirmBtn.style.background = '#166534';
                    confirmBtn.onclick = (e) => {
                        e.stopPropagation();
                        saveRename();
                    };

                    const cancelBtn = document.createElement('button');
                    cancelBtn.innerHTML = '✕';
                    cancelBtn.title = 'Cancel (Escape)';
                    cancelBtn.style.cssText = `
                        background: #451a1a;
                        border: 1px solid #ef4444;
                        color: #ef4444;
                        cursor: pointer;
                        font-size: 16px;
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-weight: bold;
                    `;
                    cancelBtn.onmouseover = () => cancelBtn.style.background = '#3a0f0f';
                    cancelBtn.onmouseout = () => cancelBtn.style.background = '#451a1a';
                    cancelBtn.onclick = (e) => {
                        e.stopPropagation();
                        cancelRename();
                    };

                    inputContainer.appendChild(input);
                    inputContainer.appendChild(confirmBtn);
                    inputContainer.appendChild(cancelBtn);
                    div.appendChild(inputContainer);

                    // Auto-focus
                    setTimeout(() => input.focus(), 0);
                } else {
                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = name;
                    div.appendChild(nameSpan);

                    const actionsDiv = document.createElement('div');
                    actionsDiv.style.cssText = 'display: flex; gap: 4px; align-items: center;';

                    if (config.canToggleActive) {
                        const toggleBtn = document.createElement('button');
                        toggleBtn.innerHTML = item.autoApply ? '👁️' : '🚫';
                        toggleBtn.title = item.autoApply ? 'Active (Click to Deactivate)' : 'Inactive (Click to Activate)';
                        toggleBtn.style.cssText = `
                            background: none; border: none; cursor: pointer; font-size: 14px; padding: 4px; opacity: 0.7;
                            color: ${item.autoApply ? '#4ade80' : '#666'};
                        `;
                        toggleBtn.onmouseover = () => toggleBtn.style.opacity = '1';
                        toggleBtn.onmouseout = () => toggleBtn.style.opacity = '0.7';
                        toggleBtn.onclick = (e) => {
                            e.stopPropagation();
                            handleToggleActive(item);
                        };
                        actionsDiv.appendChild(toggleBtn);
                    }

                    const renameBtn = document.createElement('button');
                    renameBtn.innerHTML = '✏️';
                    renameBtn.title = 'Rename';
                    renameBtn.style.cssText = 'background: none; border: none; cursor: pointer; font-size: 14px; padding: 4px; opacity: 0.7;';
                    renameBtn.onmouseover = () => renameBtn.style.opacity = '1';
                    renameBtn.onmouseout = () => renameBtn.style.opacity = '0.7';
                    renameBtn.onclick = (e) => {
                        e.stopPropagation();
                        handleRename(item);
                    };
                    actionsDiv.appendChild(renameBtn);

                    div.appendChild(actionsDiv);

                    div.onmouseover = () => { if (!isSelected) div.style.background = '#1f1f1f'; };
                    div.onmouseout = () => { if (!isSelected) div.style.background = 'transparent'; };
                    div.onclick = () => selectItem(item);
                }
                listContainer.appendChild(div);
            });

            // Show "Create New" if search is active and no exact match (or list empty)
            if (config.onCreate && searchInput.value.trim()) {
                const searchTerm = searchInput.value.trim();
                const exactMatch = currentItems.find(i => config.getItemName(i).toLowerCase() === searchTerm.toLowerCase());

                if (!exactMatch) {
                    const createDiv = document.createElement('div');
                    createDiv.style.cssText = `
                        padding: 12px 16px;
                        cursor: pointer;
                        color: #4ade80;
                        font-size: 13px;
                        border-top: 1px solid #333;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    `;
                    createDiv.innerHTML = `<span>➕</span> <span>Create "<strong>${searchTerm}</strong>"</span>`;
                    createDiv.onmouseover = () => createDiv.style.background = '#1f1f1f';
                    createDiv.onmouseout = () => createDiv.style.background = 'transparent';
                    createDiv.onclick = async () => {
                        if (config.onCreate) {
                            const success = await config.onCreate(searchTerm);
                            if (success) {
                                // Refresh list or close? 
                                // Ideally, we select the new item.
                                // The callback should probably return the new item or true.
                                // For now, let's assume the parent handles refresh or we close.
                                // If we want to stay open, we need to refresh `currentItems`.
                                // But `currentItems` is local.
                                // Let's assume the parent triggers a re-open or we just close.
                                modal.remove();
                            }
                        }
                    };
                    listContainer.appendChild(createDiv);
                }
            }
        };

        const selectItem = (item) => {
            selectedItem = item;
            renderList(searchInput.value);

            if (config.renderEditor && editorContainer) {
                editorContainer.innerHTML = '';
                config.renderEditor(editorContainer, item, (updatedItem) => {
                    // Handle update from editor
                    if (updatedItem) {
                        // Update local list
                        const index = currentItems.findIndex(i => i.id === updatedItem.id);
                        if (index !== -1) {
                            currentItems[index] = updatedItem;
                            selectedItem = updatedItem;
                            renderList(searchInput.value);
                        }
                    }
                });
            } else if (previewTitle && previewBody) {
                const name = config.getItemName(item);
                previewTitle.textContent = name;
                previewTitle.style.color = '#fff';
                previewTitle.style.fontSize = '16px';
                previewBody.textContent = config.getItemPreview(item);
            }

            loadBtn.disabled = false;
            loadBtn.style.opacity = '1';
            loadBtn.style.cursor = 'pointer';
            loadBtn.onclick = () => {
                if (config.onLoad) config.onLoad(item);
                modal.remove();
            };

            deleteBtn.style.display = 'block';
            deleteBtn.onclick = () => handleDelete(item);
        };



        const handleDelete = async (item) => {
            // Create custom delete confirmation modal
            const confirmModal = document.createElement('div');
            confirmModal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 100000;
            `;

            const confirmBox = document.createElement('div');
            confirmBox.style.cssText = `
                background: #1a1a1a;
                border: 1px solid #333;
                border-radius: 8px;
                padding: 24px;
                max-width: 400px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            `;

            const confirmText = document.createElement('p');
            confirmText.textContent = `Delete "${config.getItemName(item)}"?`;
            confirmText.style.cssText = 'margin: 0 0 20px 0; color: #fff; font-size: 14px;';

            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = 'display: flex; gap: 12px; justify-content: flex-end;';

            const cancelButton = document.createElement('button');
            cancelButton.textContent = 'Cancel';
            cancelButton.className = 'gvp-button';
            cancelButton.style.cssText = 'background: #333; color: #fff;';
            cancelButton.onclick = () => confirmModal.remove();

            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Delete';
            deleteButton.className = 'gvp-button';
            deleteButton.style.cssText = 'background: #451a1a; color: #ef4444; border: 1px solid #ef4444;';
            deleteButton.onclick = async () => {
                confirmModal.remove();
                if (config.onDelete) {
                    const success = await config.onDelete(item);
                    if (success) {
                        // CRITICAL FIX: Use ID for filtering if available to prevent batch deletion
                        if (item.id) {
                            currentItems = currentItems.filter(i => i.id !== item.id);
                        } else {
                            currentItems = currentItems.filter(i => config.getItemName(i) !== config.getItemName(item));
                        }

                        selectedItem = null;

                        // CRITICAL FIX: Check if preview elements exist BEFORE updating them
                        // In editor mode (renderEditor: true), these elements are null
                        if (previewTitle) {
                            previewTitle.textContent = 'Select an item to view details';
                        }
                        if (previewBody) {
                            previewBody.textContent = '';
                        }

                        // If in editor mode, clear the editor
                        if (config.renderEditor && editorContainer) {
                            editorContainer.innerHTML = `
                                <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: #666; font-size: 13px;">
                                    Select an item to edit
                                </div>
                            `;
                        }

                        loadBtn.disabled = true;
                        loadBtn.style.opacity = '0.5';
                        deleteBtn.style.display = 'none';
                        renderList(searchInput.value);
                    }
                }
            };

            buttonContainer.appendChild(cancelButton);
            buttonContainer.appendChild(deleteButton);
            confirmBox.appendChild(confirmText);
            confirmBox.appendChild(buttonContainer);
            confirmModal.appendChild(confirmBox);
            this.shadowRoot.appendChild(confirmModal);
        };

        const handleToggleActive = async (item) => {
            if (config.onToggleActive) {
                const success = await config.onToggleActive(item);
                if (success) {
                    item.autoApply = !item.autoApply;
                    selectItem(item);
                    renderList(searchInput.value);
                }
            }
        };

        searchInput.addEventListener('input', (e) => renderList(e.target.value));
        renderList();
    }

    _createActionButton(text, bg, hoverColor) {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.style.cssText = `
            padding: 6px 12px;
            background: ${bg};
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 4px;
            color: #fff;
            font-size: 12px;
            cursor: pointer;
            transition: background 0.2s;
        `;
        btn.onmouseover = () => btn.style.background = hoverColor || '#404040';
        btn.onmouseout = () => btn.style.background = bg;
        return btn;
    }
};
