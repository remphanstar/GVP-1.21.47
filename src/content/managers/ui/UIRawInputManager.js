// UIRawInputManager.js - Raw input tab with templates
// Dependencies: StateManager, AdvancedRawInputManager, ReactAutomation

window.UIRawInputManager = class UIRawInputManager {
    constructor(stateManager, advancedRawInputManager, reactAutomation, shadowRoot, uiHelpers, uiModalManager) {
        this.stateManager = stateManager;
        this.advancedRawInputManager = advancedRawInputManager;
        this.reactAutomation = reactAutomation;
        this.shadowRoot = shadowRoot;
        this.uiHelpers = uiHelpers || new window.UIHelpers();
        this.uiModalManager = uiModalManager;
        this.uiConstants = window.uiConstants;

        this.templateListElement = null;
        this.templateAddButton = null;
        this.templateAccordionRef = null;
        this._templateToolbarBound = false;
        this._dialogueTemplatePanel = null;

        this.savedPromptSlots = [1, 2, 3];
        this.savedPromptContainer = null;
        this.addSavedPromptButton = null;
        this.savedPromptConfigKey = 'gvp-saved-prompts-config';
        this.maxSavedPromptSlots = 12;
        this._storageWarningShown = new Set();
        this.silentModeAudioBlock = [
            'Motion Level: high',
            'Music: none',
            'Ambient Sounds: none',
            'Sound Effects: heavy breathing',
            'Mix Level: dialogue slightly louder than sound_effects no music no ambient sounds'
        ].join('\n');
    }

    _isExtensionContextValid(operation) {
        const runtime = typeof chrome !== 'undefined' ? chrome?.runtime : null;
        const isValid = !!(runtime && runtime.id);
        if (!isValid && operation && !this._storageWarningShown.has(operation)) {
            window.Logger.debug('RawInput', `Skipping ${operation} - extension context invalidated`);
            this._storageWarningShown.add(operation);
        }
        return isValid;
    }

    _handleStorageError(operation, error) {
        const message = typeof error?.message === 'string' ? error.message : `${error ?? ''}`;
        if (message.includes('Extension context invalidated')) {
            this._isExtensionContextValid(operation);
            return false;
        }
        window.Logger.error('RawInput', `Failed during ${operation}:`, error);
        return true;
    }

    async _safeStorageSet(key, value, operation) {
        if (!this._isExtensionContextValid(operation)) {
            return false;
        }
        try {
            await chrome.storage.local.set({ [key]: value });
            return true;
        } catch (error) {
            if (this._handleStorageError(operation, error)) {
                throw error;
            }
            return false;
        }
    }

    async _safeStorageGet(keys, operation) {
        if (!this._isExtensionContextValid(operation)) {
            return {};
        }
        try {
            return await chrome.storage.local.get(keys);
        } catch (error) {
            if (this._handleStorageError(operation, error)) {
                throw error;
            }
            return {};
        }
    }

    _getSilentModeRawSuffix() {
        const state = this.stateManager?.getState?.();
        if (!state?.settings?.silentMode) {
            return '';
        }
        return this.silentModeAudioBlock;
    }

    _applySilentModeRawSuffix(text) {
        const suffix = this._getSilentModeRawSuffix();
        if (!suffix) {
            return typeof text === 'string' ? text : '';
        }
        const baseText = typeof text === 'string' ? text : '';
        const trimmed = baseText.trimEnd();
        if (!trimmed) {
            return suffix;
        }
        const normalized = trimmed.toLowerCase();
        if (normalized.includes('music: none') && normalized.includes('ambient sounds: none') && normalized.includes('sound effects: none')) {
            return trimmed;
        }
        return `${trimmed}\n\n${suffix}`;
    }

    _createRawInputTab() {
        const tab = document.createElement('div');
        tab.className = 'gvp-tab-content';
        tab.id = 'gvp-raw-input';

        const container = document.createElement('div');
        container.className = 'raw-input-container';

        const accordionStack = document.createElement('div');
        accordionStack.className = 'raw-input-accordion-stack';

        const templates = this.stateManager.getState().settings.rawTemplates || [];

        const accordionRefs = [];
        const createManagedAccordion = (key, config) => {
            const { onToggle, ...rest } = config || {};
            const accordion = this.uiHelpers.createAccordionSection({
                ...rest,
                onToggle: (isOpen, root) => {
                    if (isOpen) {
                        const isRawOrSaved = key === 'raw-input' || key === 'saved-prompts';
                        accordionRefs.forEach(({ key: otherKey, ref }) => {
                            if (otherKey === key) {
                                return;
                            }
                            const otherIsRawOrSaved = otherKey === 'raw-input' || otherKey === 'saved-prompts';
                            if (isRawOrSaved && otherIsRawOrSaved) {
                                return;
                            }
                            if (ref.isOpen()) {
                                ref.toggle(false, { silent: true });
                            }
                        });
                    }
                    if (typeof onToggle === 'function') {
                        onToggle(isOpen, root);
                    }
                }
            });

            accordionRefs.push({ key, ref: accordion });
            return accordion;
        };

        const rawInputContent = this._buildRawInputContent();
        const rawAccordion = createManagedAccordion('raw-input', {
            id: 'gvp-accordion-raw-input',
            title: 'Raw Prompt Input',
            icon: '📝',
            defaultOpen: templates.length === 0,
            content: rawInputContent
        });
        rawAccordion.content.classList.add('raw-accordion-content');

        const savedPromptsContent = this._buildSavedPromptsContent();
        const savedAccordion = createManagedAccordion('saved-prompts', {
            id: 'gvp-accordion-saved-prompts',
            title: 'Saved Prompt Slots',
            icon: '📦',
            content: savedPromptsContent
        });

        const templateSystemContent = this._buildTemplateSystemContent();
        const templateAccordion = createManagedAccordion('template-system', {
            id: 'gvp-accordion-template-system',
            title: 'Template System',
            icon: '🧩',
            defaultOpen: templates.length > 0,
            content: templateSystemContent,
            scrollable: true
        });
        this.templateAccordionRef = templateAccordion;

        accordionStack.appendChild(rawAccordion.root);
        accordionStack.appendChild(savedAccordion.root);
        accordionStack.appendChild(templateAccordion.root);

        container.appendChild(accordionStack);
        tab.appendChild(container);

        // Attach event listeners after tab is added to DOM
        // Use setTimeout to ensure tab is in shadowRoot
        setTimeout(() => this.attachRawInputEventListeners(), 0);

        return tab;
    }

    _buildRawInputContent() {
        const fragment = document.createDocumentFragment();

        const wrapper = document.createElement('div');
        wrapper.className = 'raw-input-body';

        const label = document.createElement('label');
        label.className = 'gvp-label';
        label.textContent = 'Raw Prompt Input:';

        const textarea = document.createElement('textarea');
        textarea.id = 'gvp-raw-input-textarea';
        textarea.className = 'gvp-textarea';
        textarea.placeholder = 'Enter your video prompt here... Paste, type, or use templates below.';
        textarea.rows = 8;

        wrapper.appendChild(label);
        wrapper.appendChild(textarea);
        fragment.appendChild(wrapper);
        return fragment;
    }

    _buildSavedPromptsContent() {
        const fragment = document.createDocumentFragment();

        const container = document.createElement('div');
        container.className = 'saved-prompts-container';

        this.savedPromptContainer = document.createElement('div');
        this.savedPromptContainer.className = 'saved-prompts-list';

        const controls = document.createElement('div');
        controls.className = 'saved-prompts-controls';

        this.addSavedPromptButton = document.createElement('button');
        this.addSavedPromptButton.type = 'button';
        this.addSavedPromptButton.className = 'gvp-button saved-prompt-add';
        this.addSavedPromptButton.textContent = '➕ Add Slot';
        this.addSavedPromptButton.title = 'Add an additional saved prompt slot';
        this.addSavedPromptButton.addEventListener('click', () => {
            this.addSavedPromptSlot().catch(error => {
                window.Logger.error('RawInput', 'Failed to add saved prompt slot:', error);
            });
        });

        controls.appendChild(this.addSavedPromptButton);

        container.appendChild(this.savedPromptContainer);
        container.appendChild(controls);

        fragment.appendChild(container);

        // Initial render with default slots, then hydrate from storage if available
        this._renderSavedPromptSlots();
        this._loadSavedPromptConfig().catch(error => {
            window.Logger.warn('RawInput', 'Failed to load saved prompt configuration:', error);
        });

        return fragment;
    }

    _renderSavedPromptSlots() {
        if (!this.savedPromptContainer) {
            return;
        }

        if (!Array.isArray(this.savedPromptSlots) || !this.savedPromptSlots.length) {
            this.savedPromptSlots = [1, 2, 3];
        }

        const uniqueSortedSlots = Array.from(new Set(this.savedPromptSlots))
            .map(num => parseInt(num, 10))
            .filter(num => Number.isInteger(num) && num > 0)
            .sort((a, b) => a - b)
            .slice(0, this.maxSavedPromptSlots);

        this.savedPromptSlots = uniqueSortedSlots.length ? uniqueSortedSlots : [1, 2, 3];

        this.savedPromptContainer.innerHTML = '';

        this.savedPromptSlots.forEach(slot => {
            const row = this._createSavedPromptSlotRow(slot);
            this.savedPromptContainer.appendChild(row);
        });

        if (this.addSavedPromptButton) {
            const atLimit = this.savedPromptSlots.length >= this.maxSavedPromptSlots;
            this.addSavedPromptButton.disabled = atLimit;
            this.addSavedPromptButton.title = atLimit
                ? `Maximum of ${this.maxSavedPromptSlots} saved slots reached`
                : 'Add an additional saved prompt slot';
        }

        window.requestAnimationFrame(() => {
            this.refreshSavedPromptStates();
        });
    }

    _createSavedPromptSlotRow(slot) {
        // Container: [Number] [Card with Preview | 2x2 Buttons]
        const wrapper = document.createElement('div');
        wrapper.className = 'saved-prompt-wrapper';
        wrapper.dataset.slot = String(slot);

        // Slot number label (OUTSIDE the card)
        const slotNumber = document.createElement('span');
        slotNumber.className = 'saved-prompt-number';
        slotNumber.textContent = String(slot);

        // The card itself
        const card = document.createElement('div');
        card.className = 'saved-prompt-card';
        card.dataset.slot = String(slot);

        // Preview area (clickable to load)
        const preview = document.createElement('div');
        preview.className = 'saved-prompt-preview empty';
        preview.dataset.slot = String(slot);
        preview.textContent = 'Empty slot';
        preview.title = 'Click to load this prompt';
        preview.addEventListener('click', () => {
            this.loadSavedPrompt(slot).catch(error => {
                window.Logger.error('RawInput', `Failed to load prompt in slot ${slot}:`, error);
            });
        });

        // 2x2 button grid
        const buttonGrid = document.createElement('div');
        buttonGrid.className = 'saved-prompt-buttons';

        // Row 1: Save, Clear
        const saveBtn = document.createElement('button');
        saveBtn.className = 'gvp-button saved-prompt-save';
        saveBtn.dataset.slot = String(slot);
        saveBtn.title = 'Save current prompt';
        saveBtn.textContent = '💾';
        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.saveSavedPrompt(slot).catch(error => {
                window.Logger.error('RawInput', `Failed to save prompt in slot ${slot}:`, error);
            });
        });

        const clearBtn = document.createElement('button');
        clearBtn.className = 'gvp-button saved-prompt-clear';
        clearBtn.dataset.slot = String(slot);
        clearBtn.title = 'Clear this slot';
        clearBtn.textContent = '🗑️';
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearSavedPrompt(slot).catch(error => {
                window.Logger.error('RawInput', `Failed to clear prompt in slot ${slot}:`, error);
            });
        });

        // Row 2: Copy, Rename
        const copyBtn = document.createElement('button');
        copyBtn.className = 'gvp-button saved-prompt-copy';
        copyBtn.dataset.slot = String(slot);
        copyBtn.title = 'Copy to clipboard';
        copyBtn.textContent = '📋';
        copyBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                const slotData = await this.stateManager.getSavedPromptSlot(slot);
                if (slotData?.prompt) {
                    await navigator.clipboard.writeText(slotData.prompt);
                    copyBtn.textContent = '✓';
                    setTimeout(() => { copyBtn.textContent = '📋'; }, 1000);
                }
            } catch (error) {
                window.Logger.error('RawInput', `Failed to copy prompt from slot ${slot}:`, error);
            }
        });

        const renameBtn = document.createElement('button');
        renameBtn.className = 'gvp-button saved-prompt-rename';
        renameBtn.dataset.slot = String(slot);
        renameBtn.title = 'Rename this slot';
        renameBtn.textContent = '✏️';
        renameBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                const slotData = await this.stateManager.getSavedPromptSlot(slot);
                if (!slotData?.prompt) {
                    this.uiModalManager?.showWarning(`Slot ${slot} is empty!`);
                    return;
                }

                // Inline rename: convert preview to input
                const currentName = slotData.name || '';
                const previewEl = preview;

                // Create inline input
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'saved-prompt-rename-input';
                input.value = currentName;
                input.placeholder = 'Enter name...';
                input.style.cssText = `
                    width: 100%;
                    padding: 4px 6px;
                    border: 1px solid var(--gvp-accent);
                    border-radius: 4px;
                    background: var(--gvp-bg-input);
                    color: var(--gvp-text-primary);
                    font-size: 12px;
                    outline: none;
                `;

                // Store original content
                const originalContent = previewEl.textContent;
                const originalTitle = previewEl.title;

                // Replace preview with input
                previewEl.textContent = '';
                previewEl.title = '';
                previewEl.appendChild(input);
                input.focus();
                input.select();

                // Save function
                const saveRename = async () => {
                    const newName = input.value.trim();
                    await this.stateManager.renameSavedPromptSlot(slot, newName);
                    await this.updateSavedPromptButtonState(slot);
                };

                // Cancel function
                const cancelRename = () => {
                    previewEl.textContent = originalContent;
                    previewEl.title = originalTitle;
                };

                // Handle Enter to save, Escape to cancel
                input.addEventListener('keydown', async (ke) => {
                    ke.stopPropagation();
                    if (ke.key === 'Enter') {
                        ke.preventDefault();
                        await saveRename();
                    } else if (ke.key === 'Escape') {
                        ke.preventDefault();
                        cancelRename();
                    }
                });

                // Prevent keyup/keypress from bubbling to host page
                input.addEventListener('keyup', (ke) => ke.stopPropagation());
                input.addEventListener('keypress', (ke) => ke.stopPropagation());

                // Save on blur (click away)
                input.addEventListener('blur', async () => {
                    await saveRename();
                });

            } catch (error) {
                window.Logger.error('RawInput', `Failed to rename slot ${slot}:`, error);
            }
        });

        buttonGrid.appendChild(saveBtn);
        buttonGrid.appendChild(clearBtn);
        buttonGrid.appendChild(copyBtn);
        buttonGrid.appendChild(renameBtn);

        card.appendChild(preview);
        card.appendChild(buttonGrid);

        wrapper.appendChild(slotNumber);
        wrapper.appendChild(card);

        return wrapper;
    }

    async addSavedPromptSlot() {
        if (this.savedPromptSlots.length >= this.maxSavedPromptSlots) {
            this.uiModalManager?.showWarning(`Maximum of ${this.maxSavedPromptSlots} saved slots reached.`);
            return;
        }

        const nextSlot = this._getNextSavedPromptSlotNumber();
        this.savedPromptSlots.push(nextSlot);
        this._renderSavedPromptSlots();
        await this._saveSavedPromptConfig();
    }

    _getNextSavedPromptSlotNumber() {
        const currentMax = this.savedPromptSlots.length
            ? Math.max(...this.savedPromptSlots)
            : 0;
        let candidate = currentMax + 1;
        const used = new Set(this.savedPromptSlots);
        while (used.has(candidate)) {
            candidate += 1;
        }
        return candidate;
    }

    async _saveSavedPromptConfig() {
        const payload = JSON.stringify({ slots: this.savedPromptSlots });
        try {
            await this._safeStorageSet(this.savedPromptConfigKey, payload, 'saveSavedPromptConfig');
        } catch (error) {
            // Errors already logged in helper when context valid
        }
    }

    async _loadSavedPromptConfig() {
        try {
            const result = await this._safeStorageGet(this.savedPromptConfigKey, 'loadSavedPromptConfig');
            const raw = result?.[this.savedPromptConfigKey];
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed?.slots)) {
                const sanitized = parsed.slots
                    .map(num => parseInt(num, 10))
                    .filter(num => Number.isInteger(num) && num > 0);

                if (sanitized.length) {
                    this.savedPromptSlots = sanitized;
                }
            }
        } catch (error) {
            window.Logger.error('RawInput', 'Failed to load saved prompt configuration:', error);
        } finally {
            this._savedPromptsInitialized = true;
            this._renderSavedPromptSlots();
            this.refreshSavedPromptStates();
        }
    }

    refreshSavedPromptStates() {
        if (!this.shadowRoot) {
            return;
        }

        this.savedPromptSlots.forEach(slot => {
            this.updateSavedPromptButtonState(slot).catch(error => {
                window.Logger.error('RawInput', `Failed to refresh saved prompt state for slot ${slot}:`, error);
            });
        });
    }

    _buildTemplateSystemContent() {
        const fragment = document.createDocumentFragment();

        const toolbar = document.createElement('div');
        toolbar.className = 'gvp-button-group';
        toolbar.style.cssText = 'display: flex; gap: 8px; margin-bottom: 10px; align-items: center;';

        // New Template Button
        const newBtn = document.createElement('button');
        newBtn.innerHTML = '➕';
        newBtn.className = 'gvp-button primary';
        newBtn.title = 'New Template';
        newBtn.style.padding = '8px';
        newBtn.onclick = () => this._openTemplateManager();

        // Save Button (Save Prompt to Slot)
        const saveBtn = document.createElement('button');
        saveBtn.innerHTML = '💾';
        saveBtn.className = 'gvp-button';
        saveBtn.title = 'Save Prompt to Slot';
        saveBtn.style.padding = '8px';
        saveBtn.onclick = () => this.addSavedPromptSlot();

        // Manager Button
        const manageBtn = document.createElement('button');
        manageBtn.innerHTML = '📂';
        manageBtn.className = 'gvp-button secondary';
        manageBtn.title = 'Manage Templates';
        manageBtn.style.padding = '8px';
        manageBtn.onclick = () => this._openTemplateManager();

        toolbar.appendChild(newBtn);
        toolbar.appendChild(saveBtn);
        toolbar.appendChild(manageBtn);

        const list = document.createElement('div');
        list.className = 'raw-template-list';
        this.templateListElement = list;
        this._renderTemplateRows(); // Keep this for now as a quick view, or we can remove it if we want ONLY the modal.
        // User requested "redesign", so let's keep the list but maybe simplify it or just rely on the modal?
        // For now, I'll keep the list as a "Quick Access" view, but the modal is the main manager.

        fragment.appendChild(toolbar);
        fragment.appendChild(list);
        return fragment;
    }

    _openTemplateManager() {
        const uiManager = window.gvpUIManager;
        if (!uiManager || !uiManager.uiModalManager) {
            window.Logger.warn('RawInput', 'UIModalManager not available');
            return;
        }

        uiManager.uiModalManager.showTemplateManagerModal({
            simpleCreate: true,
            onCreate: (name) => this._createNewTemplate(name),
            onRename: async (item, newName) => {
                const id = item.id;
                await this._updateTemplate(id, { name: newName });
                const updatedTemplates = this.stateManager.getState().settings.rawTemplates || [];
                const updatedItem = updatedTemplates.find(t => t.id === id);
                return { success: true, newItem: updatedItem };
            },
            onDelete: async (item) => {
                await this._handleRemoveTemplate(item.id);
                return true;
            },
            onToggleActive: async (item) => {
                await this._updateTemplate(item.id, { autoApply: !item.autoApply });
                const updatedTemplates = this.stateManager.getState().settings.rawTemplates || [];
                const updatedItem = updatedTemplates.find(t => t.id === item.id);
                return { success: true, newItem: updatedItem };
            },
            renderEditor: (container, item, onChange) => this._renderTemplateEditor(container, item, onChange)
        });
    }

    _renderTemplateEditor(container, template, onChange) {
        container.innerHTML = '';
        container.style.padding = '20px';
        container.style.overflowY = 'auto';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.height = '100%';

        // Track pending changes (Bug 3: Manual Save)
        let pendingChanges = { ...template };
        let hasUnsavedChanges = false;

        const markDirty = () => {
            hasUnsavedChanges = true;
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Changes';
                saveBtn.classList.add('pulsing');
            }
        };

        // Helper: Generate auto-name from field (Bug 5)
        const generateAutoName = (fieldPath) => {
            const field = (this.uiConstants.RAW_TEMPLATE_FIELDS || []).find(f => f.value === fieldPath);
            return field ? field.label : 'New Template';
        };

        // Name Input (Header)
        const header = document.createElement('div');
        header.style.marginBottom = '20px';

        const nameLabel = document.createElement('label');
        nameLabel.textContent = 'Template Name';
        nameLabel.style.cssText = 'display: block; margin-bottom: 6px; color: var(--gvp-text-muted); font-size: 12px;';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = template.name || pendingChanges.name || '';
        nameInput.style.cssText = `
            width: 100%; padding: 10px; background: var(--gvp-bg-secondary); border: 1px solid var(--gvp-border);
            border-radius: 6px; color: var(--gvp-text-primary); font-size: 14px; outline: none;
        `;
        nameInput.addEventListener('keydown', e => e.stopPropagation());
        nameInput.addEventListener('keyup', e => e.stopPropagation());
        nameInput.oninput = () => {
            pendingChanges.name = nameInput.value;
            markDirty();
        };

        header.appendChild(nameLabel);
        header.appendChild(nameInput);
        container.appendChild(header);

        // Controls Row
        const controlsRow = document.createElement('div');
        controlsRow.style.cssText = 'display: flex; gap: 16px; margin-bottom: 20px; align-items: flex-start; flex-wrap: wrap;';

        // Field Select
        const fieldContainer = document.createElement('div');
        fieldContainer.style.flex = '2';
        fieldContainer.style.minWidth = '200px';

        const fieldLabel = document.createElement('label');
        fieldLabel.textContent = 'Target Field';
        fieldLabel.style.cssText = 'display: block; margin-bottom: 6px; color: var(--gvp-text-muted); font-size: 12px;';

        const fieldSelect = document.createElement('select');
        fieldSelect.style.cssText = `
            width: 100%; padding: 10px; background: var(--gvp-bg-secondary); border: 1px solid var(--gvp-border);
            border-radius: 6px; color: var(--gvp-text-primary); font-size: 13px; outline: none; cursor: pointer;
        `;
        (this.uiConstants.RAW_TEMPLATE_FIELDS || []).forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            if (opt.value === template.fieldPath) option.selected = true;
            fieldSelect.appendChild(option);
        });

        // Bug 4: Re-render on field change + Bug 5: Auto-name
        fieldSelect.onchange = () => {
            const newField = fieldSelect.value;
            pendingChanges.fieldPath = newField;

            // Auto-update name if it matches the old field's auto-name
            const oldAutoName = generateAutoName(template.fieldPath);
            if (nameInput.value === oldAutoName || nameInput.value === template.name) {
                nameInput.value = generateAutoName(newField);
                pendingChanges.name = nameInput.value;
            }

            markDirty();

            // Re-render to switch between textarea/dialogue UI
            this._renderTemplateEditor(container, pendingChanges, onChange);
        };

        fieldContainer.appendChild(fieldLabel);
        fieldContainer.appendChild(fieldSelect);
        controlsRow.appendChild(fieldContainer);

        // Toggles Container
        const togglesContainer = document.createElement('div');
        togglesContainer.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 12px; padding-top: 24px;';

        const createToggle = (label, checked, onToggle) => {
            const labelEl = document.createElement('label');
            labelEl.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = checked;
            input.style.cssText = 'width: 16px; height: 16px; accent-color: var(--gvp-status-success); cursor: pointer;';
            input.onchange = (e) => onToggle(e.target.checked);

            const text = document.createElement('span');
            text.textContent = label;
            text.style.cssText = 'color: var(--gvp-text-secondary); font-size: 13px;';

            labelEl.appendChild(input);
            labelEl.appendChild(text);
            return labelEl;
        };

        togglesContainer.appendChild(createToggle('Overwrite Mode', !!pendingChanges.prefixOnly, (checked) => {
            pendingChanges.prefixOnly = checked;
            markDirty();
        }));

        togglesContainer.appendChild(createToggle('Enable Template', !!pendingChanges.enabled, (checked) => {
            pendingChanges.enabled = checked;
            markDirty();
        }));

        controlsRow.appendChild(togglesContainer);
        container.appendChild(controlsRow);

        // Content Row (Prefix/Suffix or Dialogue Editor)
        const contentRow = document.createElement('div');
        contentRow.style.cssText = 'display: flex; gap: 16px; flex: 1; min-height: 0;';

        if (pendingChanges.fieldPath === 'dialogue[]') {
            // Show buttons to open dialogue editor modal
            const createDialogueButton = (role) => {
                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 200px; background: var(--gvp-bg-input); border: 1px solid var(--gvp-border); border-radius: 6px; padding: 24px; gap: 16px;';

                const header = document.createElement('div');
                header.textContent = role === 'prefix' ? 'PREFIX DIALOGUE' : 'SUFFIX DIALOGUE';
                header.style.cssText = 'color: var(--gvp-status-success); font-weight: bold; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;';

                const lines = (pendingChanges.dialogueTemplate && pendingChanges.dialogueTemplate[`${role}Lines`]) || [];
                const count = lines.length;

                const countText = document.createElement('div');
                countText.textContent = `${count} line${count !== 1 ? 's' : ''} defined`;
                countText.style.cssText = 'color: var(--gvp-text-muted); font-size: 13px;';

                const editBtn = document.createElement('button');
                editBtn.className = 'gvp-button primary';
                editBtn.textContent = 'Edit Dialogue Rules →';
                editBtn.style.cssText = 'padding: 10px 20px;';
                editBtn.onclick = () => {
                    this.uiModalManager.showDialogueEditorModal({
                        template: pendingChanges,
                        role: role,
                        onSave: async (updatedLines) => {
                            // Refresh the count display
                            countText.textContent = `${updatedLines.length} line${updatedLines.length !== 1 ? 's' : ''} defined`;
                            // Mark as dirty so main Save Template button activates
                            markDirty();
                        }
                    });
                };

                wrapper.appendChild(header);
                wrapper.appendChild(countText);
                wrapper.appendChild(editBtn);
                return wrapper;
            };

            contentRow.appendChild(createDialogueButton('prefix'));
            contentRow.appendChild(createDialogueButton('suffix'));
        } else {
            const createTextArea = (role, value) => {
                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'flex: 1; display: flex; flex-direction: column; min-width: 0;';

                const header = document.createElement('div');
                header.textContent = role === 'prefix' ? 'Prefix' : 'Suffix';
                header.style.cssText = 'margin-bottom: 8px; color: #4ade80; font-weight: bold; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;';

                const area = document.createElement('textarea');
                area.value = value || '';
                area.placeholder = `Enter ${role} text...`;
                area.style.cssText = `
                    flex: 1; width: 100%; padding: 12px; background: #111; border: 1px solid #4ade80;
                    border-radius: 6px; color: #fff; font-size: 13px; outline: none; resize: none;
                    font-family: monospace; line-height: 1.5; box-sizing: border-box;
                `;

                area.addEventListener('keydown', e => e.stopPropagation());
                area.addEventListener('keyup', e => e.stopPropagation());
                area.addEventListener('keypress', e => e.stopPropagation());

                area.oninput = () => {
                    pendingChanges[role] = area.value;
                    markDirty();
                };

                wrapper.appendChild(header);
                wrapper.appendChild(area);
                return wrapper;
            };

            contentRow.appendChild(createTextArea('prefix', pendingChanges.prefix));
            contentRow.appendChild(createTextArea('suffix', pendingChanges.suffix));
        }
        container.appendChild(contentRow);

        // Save Button (Bug 3)
        const footer = document.createElement('div');
        footer.style.cssText = 'margin-top: 20px; display: flex; justify-content: flex-end; gap: 12px;';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'gvp-button primary';
        saveBtn.textContent = 'Save Template';
        saveBtn.disabled = !hasUnsavedChanges;
        saveBtn.onclick = () => {
            this.stateManager.saveRawTemplate(pendingChanges).then(() => {
                onChange(pendingChanges);
                hasUnsavedChanges = false;
                saveBtn.disabled = true;
                saveBtn.textContent = '✓ Saved';
                saveBtn.classList.remove('pulsing');

                setTimeout(() => {
                    saveBtn.textContent = 'Save Template';
                }, 2000);
            });
        };

        footer.appendChild(saveBtn);
        container.appendChild(footer);
    }

    async _createNewTemplate(nameOverride) {
        const defaultFieldPath = 'shot.motion_level';
        const field = (this.uiConstants.RAW_TEMPLATE_FIELDS || []).find(f => f.value === defaultFieldPath);
        const defaultName = field ? field.label : 'New Template';

        const name = nameOverride || prompt('Enter template name:', defaultName);
        if (!name) return null;

        const newTemplate = {
            id: crypto.randomUUID(),
            name: name.trim(),
            fieldPath: defaultFieldPath,
            prefix: '',
            suffix: '',
            enabled: true,
            applyToRaw: false
        };

        await this.stateManager.saveRawTemplate(newTemplate);
        this._renderTemplateRows();
        return newTemplate;
    }

    _renderTemplateRows() {
        if (!this.templateListElement) {
            return;
        }

        // Filter to only show "Active" (autoApply) templates in this quick list
        // The full list is available in the Template Manager modal
        const allTemplates = this.stateManager.getState().settings.rawTemplates || [];
        const templates = allTemplates.filter(t => t.autoApply);

        window.Logger.debug('RawInput', 'Rendering active template rows, count:', templates.length);
        this.templateListElement.innerHTML = '';

        if (!templates.length) {
            const emptyState = document.createElement('div');
            emptyState.className = 'raw-template-empty';
            emptyState.innerHTML = '<strong>No active templates</strong><br>Use the Manager 📂 to enable templates or create new ones.';
            this.templateListElement.appendChild(emptyState);
            return;
        }

        templates.forEach(templateEntry => {
            const template = this._createTemplateRow(templateEntry);
            this.templateListElement.appendChild(template);
            this._attachTemplateRowHandlers(template, templateEntry);
        });
    }

    _createTemplateRow(template) {
        const row = document.createElement('div');
        row.className = 'raw-template-row';
        row.dataset.templateId = template.id;

        row.classList.toggle('enabled', !!template.enabled);
        row.classList.toggle('prefix-only', !!template.prefixOnly);

        const layout = document.createElement('div');
        layout.className = 'raw-template-grid';

        const prefixOnlyCheckbox = document.createElement('input');
        prefixOnlyCheckbox.type = 'checkbox';
        prefixOnlyCheckbox.className = 'raw-template-check';
        prefixOnlyCheckbox.checked = !!template.prefixOnly;
        prefixOnlyCheckbox.dataset.templateId = template.id;
        prefixOnlyCheckbox.dataset.templateRole = 'prefixOnly';
        prefixOnlyCheckbox.setAttribute('aria-label', 'Use only prefix and suffix');
        prefixOnlyCheckbox.title = 'Prefix/Suffix only (ignore field value)';

        const prefixButton = document.createElement('button');
        prefixButton.type = 'button';
        prefixButton.className = 'gvp-button ghost raw-template-trigger';
        prefixButton.dataset.templateId = template.id;
        prefixButton.dataset.templateRole = 'prefix';
        prefixButton.textContent = '⛶';
        prefixButton.setAttribute('aria-label', 'Edit prefix');
        prefixButton.title = this._getTemplateRoleTooltip(template, 'prefix');
        if (this._templateRoleHasValue(template, 'prefix')) {
            prefixButton.classList.add('has-value');
        }

        const fieldSelect = document.createElement('select');
        fieldSelect.className = 'gvp-select raw-template-select';
        fieldSelect.setAttribute('aria-label', 'Template target field');

        (this.uiConstants.RAW_TEMPLATE_FIELDS || []).forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.textContent = option.label;
            if (option.value === template.fieldPath) {
                opt.selected = true;
            }
            fieldSelect.appendChild(opt);
        });

        const suffixButton = document.createElement('button');
        suffixButton.type = 'button';
        suffixButton.className = 'gvp-button ghost raw-template-trigger';
        suffixButton.dataset.templateId = template.id;
        suffixButton.dataset.templateRole = 'suffix';
        suffixButton.textContent = '⛶';
        suffixButton.setAttribute('aria-label', 'Edit suffix');
        suffixButton.title = this._getTemplateRoleTooltip(template, 'suffix');
        if (this._templateRoleHasValue(template, 'suffix')) {
            suffixButton.classList.add('has-value');
        }

        const enabledCheckbox = document.createElement('input');
        enabledCheckbox.type = 'checkbox';
        enabledCheckbox.className = 'raw-template-check';
        enabledCheckbox.checked = !!template.enabled;
        enabledCheckbox.dataset.templateId = template.id;
        enabledCheckbox.dataset.templateRole = 'enabled';
        enabledCheckbox.setAttribute('aria-label', 'Enable template rule');
        enabledCheckbox.title = 'Enable/disable this template rule';

        const deactivateButton = document.createElement('button');
        deactivateButton.type = 'button';
        deactivateButton.className = 'gvp-button ghost raw-template-deactivate';
        deactivateButton.style.cssText = 'display: flex; justify-content: center; align-items: center;';
        deactivateButton.dataset.templateId = template.id;
        deactivateButton.title = 'Deactivate (remove from list)';
        deactivateButton.textContent = '❌';

        layout.appendChild(prefixOnlyCheckbox);
        layout.appendChild(prefixButton);
        layout.appendChild(fieldSelect);
        layout.appendChild(suffixButton);
        layout.appendChild(enabledCheckbox);
        layout.appendChild(deactivateButton);

        row.appendChild(layout);
        return row;
    }

    renderTemplates() {
        const templates = this.advancedRawInputManager.templates;
        return Array.from(templates.entries()).map(([key, template]) => `
            <button class="gvp-button template-btn" onclick="window.gvpUIManager.selectTemplate('${key}')">
                ${template.name}
            </button>
        `).join('');
    }

    attachRawInputEventListeners() {
        const textarea = this.shadowRoot.getElementById('gvp-raw-input-textarea');

        if (!textarea) {
            window.Logger.error('RawInput', 'Raw input textarea not found in shadow DOM');
            return;
        }

        // Listen for template updates (persistence sync)
        window.addEventListener('gvp:templates-updated', () => {
            window.Logger.info('RawInput', 'Received templates update event, refreshing UI');
            this._renderTemplateRows();
        });

        textarea.addEventListener('input', (e) => {
            e.stopPropagation();
            const val = e.target.value;

            // FIX v1.21.40: Sync to StateManager immediately
            // This allows UploadAutomationManager to read prompt without needing DOM access
            if (this.stateManager?.setState) {
                this.stateManager.setState({ rawInput: val });
            }

            this.updateRawPreview(val);
        }, { capture: true });

        textarea.addEventListener('keyup', (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();

            if (document.activeElement !== textarea) {
                textarea.focus();
            }
        }, { capture: true });

        textarea.addEventListener('keydown', (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }, { capture: true });

        textarea.addEventListener('blur', (e) => {
            const relatedTarget = e.relatedTarget;
            if (!relatedTarget || !this.shadowRoot.contains(relatedTarget)) {
                setTimeout(() => {
                    const rawInputTab = this.shadowRoot.getElementById('gvp-raw-input');
                    if (rawInputTab && rawInputTab.style.display !== 'none') {
                        textarea.focus();
                    }
                }, 0);
            }
        }, { capture: true });

        textarea.addEventListener('click', (e) => {
            e.stopPropagation();
            textarea.focus();
        }, { capture: true });

        this._attachTemplateToolbarEvents();
        this.refreshSavedPromptStates();
    }

    updateRawPreview(rawText) {
        const options = {
            quoteWrapping: this.advancedRawInputManager.quoteWrapping,
            spicyMode: this.stateManager.getState().generation.useSpicy
        };

        const result = this.advancedRawInputManager.processRawInput(rawText, options);
        const processedWithSuffix = this._applySilentModeRawSuffix(result.processed);
        const displayResult = {
            ...result,
            processed: processedWithSuffix,
            metadata: {
                ...result.metadata,
                wordCount: processedWithSuffix.split(/\s+/).filter(Boolean).length,
                characterCount: processedWithSuffix.length
            }
        };

        const previewSection = this.shadowRoot.getElementById('gvp-raw-preview');
        const previewContent = this.shadowRoot.getElementById('gvp-preview-content');

        if (!previewSection || !previewContent) {
            return;
        }

        if (rawText.trim()) {
            previewSection.style.display = 'block';
            previewContent.innerHTML = this.renderRawPreview(displayResult);
        } else {
            previewSection.style.display = 'none';
        }
    }

    renderRawPreview(result) {
        return `
            <div class="preview-item">
                <strong>Processed Prompt:</strong>
                <pre>${result.processed}</pre>
            </div>
            <div class="preview-metadata">
                <span>Words: ${result.metadata.wordCount}</span>
                <span>Characters: ${result.metadata.characterCount}</span>
                ${result.metadata.templateUsed ? `<span>Template: ${result.metadata.templateUsed}</span>` : ''}
            </div>
            ${result.preview.warnings.length > 0 ?
                `<div class="preview-warnings">
                    <strong>Warnings:</strong>
                    <ul>${result.preview.warnings.map(w => `<li>${w}</li>`).join('')}</ul>
                </div>` : ''}
            ${result.preview.suggestions.length > 0 ?
                `<div class="preview-suggestions">
                    <strong>Suggestions:</strong>
                    <ul>${result.preview.suggestions.map(s => `<li>${s}</li>`).join('')}</ul>
                </div>` : ''}
        `;
    }

    selectTemplate(templateName) {
        const template = this.advancedRawInputManager.templates.get(templateName);
        if (template) {
            const textarea = this.shadowRoot.getElementById('gvp-raw-input-textarea');
            if (textarea) {
                textarea.value = template.prompt;
                this.updateRawPreview(template.prompt);
                this.advancedRawInputManager.addRecentPrompt(template.prompt);
            }
        }
    }

    loadRecentPrompt(prompt) {
        const textarea = this.shadowRoot.getElementById('gvp-raw-input-textarea');
        if (textarea) {
            textarea.value = prompt;
            this.updateRawPreview(prompt);
        }
    }

    async saveSavedPrompt(slot) {
        const textarea = this.shadowRoot.getElementById('gvp-raw-input-textarea');
        if (!textarea || !textarea.value.trim()) {
            this.uiModalManager?.showWarning('No prompt to save!');
            return;
        }

        try {
            await this.stateManager.saveSavedPromptSlot(slot, textarea.value.trim());
            await this.updateSavedPromptButtonState(slot);
            window.Logger.info('RawInput', `Saved prompt to slot ${slot}`);

            const saveBtn = this.shadowRoot.querySelector(`.saved-prompt-save[data-slot="${slot}"]`);
            if (saveBtn) {
                const originalText = saveBtn.textContent;
                saveBtn.textContent = '✓';
                setTimeout(() => { saveBtn.textContent = originalText; }, 1000);
            }
        } catch (error) {
            window.Logger.error('RawInput', 'Failed to save prompt:', error);
            this.uiModalManager?.showError('Failed to save prompt');
        }
    }

    async loadSavedPrompt(slot) {
        try {
            const slotData = await this.stateManager.getSavedPromptSlot(slot);

            if (!slotData || !slotData.prompt) {
                this.uiModalManager?.showWarning(`Slot ${slot} is empty!`);
                return;
            }

            const textarea = this.shadowRoot.getElementById('gvp-raw-input-textarea');
            if (textarea) {
                textarea.value = slotData.prompt;
                this.updateRawPreview(slotData.prompt);

                // Collapse Saved Prompts accordion, expand Raw Prompt Input
                const savedAccordion = this.shadowRoot.querySelector('#gvp-accordion-saved-prompts');
                const rawAccordion = this.shadowRoot.querySelector('#gvp-accordion-raw-input');

                if (savedAccordion) {
                    const savedHeader = savedAccordion.querySelector('.gvp-accordion-header');
                    const savedContent = savedAccordion.querySelector('.gvp-accordion-content');
                    if (savedHeader && savedContent && !savedContent.hidden) {
                        savedContent.hidden = true;
                        savedHeader.setAttribute('aria-expanded', 'false');
                    }
                }

                if (rawAccordion) {
                    const rawHeader = rawAccordion.querySelector('.gvp-accordion-header');
                    const rawContent = rawAccordion.querySelector('.gvp-accordion-content');
                    if (rawHeader && rawContent && rawContent.hidden) {
                        rawContent.hidden = false;
                        rawHeader.setAttribute('aria-expanded', 'true');
                    }
                }

                textarea.focus();
                window.Logger.info('RawInput', `Loaded prompt from slot ${slot}`);
            }
        } catch (error) {
            window.Logger.error('RawInput', 'Failed to load prompt:', error);
            this.uiModalManager?.showError('Failed to load prompt');
        }
    }

    async clearSavedPrompt(slot) {
        // Direct delete with toast notification

        try {
            await this.stateManager.deleteSavedPromptSlot(slot);

            // Find the preview element and clear it
            const previewEl = this.shadowRoot.querySelector(`.saved-prompt-preview[data-slot="${slot}"]`);
            const cardEl = this.shadowRoot.querySelector(`.saved-prompt-card[data-slot="${slot}"]`);
            if (previewEl) {
                this._setSavedPromptPreview(previewEl, null);
            }
            if (cardEl) {
                cardEl.classList.remove('has-content');
            }

            // Show toast if available
            if (this.uiManager?.showToast) {
                this.uiManager.showToast(`Slot ${slot} cleared`, 'success');
            }

            window.Logger.info('RawInput', `Cleared slot ${slot}`);
        } catch (error) {
            window.Logger.error('RawInput', 'Failed to clear prompt:', error);
        }
    }

    async getSavedPrompts() {
        try {
            const result = await this._safeStorageGet('gvp-saved-prompts', 'getSavedPrompts');
            const saved = result['gvp-saved-prompts'];
            return saved ? JSON.parse(saved) : {};
        } catch (error) {
            if (this._handleStorageError('getSavedPrompts', error)) {
                window.Logger.error('RawInput', 'Failed to get saved prompts:', error);
            }
            return {};
        }
    }

    async updateSavedPromptButtonState(slot) {
        try {
            const slotData = await this.stateManager.getSavedPromptSlot(slot);
            const previewEl = this.shadowRoot.querySelector(`.saved-prompt-preview[data-slot="${slot}"]`);
            const cardEl = this.shadowRoot.querySelector(`.saved-prompt-card[data-slot="${slot}"]`);

            if (previewEl) {
                if (slotData && slotData.prompt) {
                    const preview = this._getPromptPreview(slotData.prompt);
                    this._setSavedPromptPreview(previewEl, { preview, prompt: slotData.prompt, name: slotData.name });
                    if (cardEl) cardEl.classList.add('has-content');
                } else {
                    this._setSavedPromptPreview(previewEl, null);
                    if (cardEl) cardEl.classList.remove('has-content');
                }
            }
        } catch (error) {
            window.Logger.error('RawInput', `Failed to update button state for slot ${slot}:`, error);
        }
    }

    async _openSavedPromptModal(slot) {
        try {
            const slotData = await this.stateManager.getSavedPromptSlot(slot);

            if (!slotData || !slotData.prompt) {
                this.uiModalManager?.showWarning(`Slot ${slot} is empty!`);
                return;
            }

            const uiManager = window.gvpUIManager;
            if (!uiManager || typeof uiManager.showSavedPromptModal !== 'function') {
                window.Logger.warn('RawInput', 'UIManager not available to show saved prompt modal');
                return;
            }

            uiManager.showSavedPromptModal(
                {
                    slot,
                    prompt: slotData.prompt,
                    timestamp: slotData.savedAt
                },
                {
                    onLoad: async () => {
                        await this.loadSavedPrompt(slot);
                    }
                }
            );
        } catch (error) {
            window.Logger.error('RawInput', 'Failed to open saved prompt modal:', error);
        }
    }

    _setSavedPromptPreview(previewEl, slotData) {
        if (!previewEl) {
            return;
        }

        if (slotData && slotData.prompt) {
            // Show custom name if set, otherwise show preview
            previewEl.textContent = slotData.name || slotData.preview || this._getPromptPreview(slotData.prompt);
            // Full prompt shown on hover
            previewEl.title = slotData.prompt;
            previewEl.classList.remove('empty');
        } else {
            previewEl.textContent = 'Empty slot';
            previewEl.title = 'Click to load this prompt';
            previewEl.classList.add('empty');
        }
    }

    _getPromptPreview(text) {
        if (typeof text !== 'string') {
            return '';
        }
        const normalized = text.replace(/\s+/g, ' ').trim();
        if (!normalized) {
            return '';
        }
        // Allow more text since we now have multi-line preview
        return normalized.length > 200 ? `${normalized.slice(0, 200)}…` : normalized;
    }

    buildRawPrompt() {
        const prompt = this.shadowRoot.getElementById('gvp-raw-input-textarea').value;
        const state = this.stateManager.getState();

        let processedPrompt = prompt;
        // DISABLED: Unfinished feature that replaces raw prompts with templates
        // TODO: Re-enable when applyToRaw feature is properly implemented
        // try {
        //     processedPrompt = this.stateManager.applyTemplatesToRawPrompt(prompt);
        // } catch (error) {
        //     console.error('[GVP] Failed to apply templates to raw prompt:', error);
        //     processedPrompt = prompt;
        // }

        processedPrompt = this._applySilentModeRawSuffix(processedPrompt);

        state.generation.lastPrompt = processedPrompt;
        return processedPrompt;
    }

    handleGenerateRaw(options = {}) {
        const { allowEmpty = true, promptOverride } = options;
        const state = this.stateManager.getState();

        try {
            let processedPrompt;

            if (typeof promptOverride === 'string') {
                processedPrompt = this._applySilentModeRawSuffix(promptOverride);
            } else {
                processedPrompt = this.buildRawPrompt();
            }

            if (state?.generation) {
                state.generation.lastPrompt = processedPrompt;
            }

            if (processedPrompt === null || processedPrompt === undefined) {
                window.Logger.warn('RawInput', 'Skipping raw generation - prompt unavailable');
                return null;
            }

            if (!allowEmpty) {
                const isEmptyString = typeof processedPrompt === 'string' ? processedPrompt.length === 0 : false;
                if (processedPrompt === null || processedPrompt === undefined || isEmptyString) {
                    window.Logger.warn('RawInput', 'Skipping raw generation - prompt empty and allowEmpty=false');
                    return null;
                }
            }

            const sendPromise = this.reactAutomation.sendToGenerator(processedPrompt, true);
            sendPromise.catch(err =>
                window.Logger.error('RawInput', 'Generate Raw error:', err)
            );
            return sendPromise;
        } catch (error) {
            window.Logger.error('RawInput', 'Failed to build raw prompt:', error);
            return Promise.reject(error);
        }
    }

    _attachTemplateToolbarEvents() {
        if (!this.shadowRoot || !this.templateAddButton) {
            return;
        }

        if (!this._templateToolbarBound) {
            this.templateAddButton.addEventListener('click', () => this._handleAddTemplate());
            this._templateToolbarBound = true;
        }
    }

    _attachTemplateRowHandlers(row, template) {
        const fieldSelect = row.querySelector('.raw-template-select');
        if (fieldSelect) {
            fieldSelect.addEventListener('change', (event) => {
                this._updateTemplate(template.id, { fieldPath: event.target.value });
            });
        }

        const prefixButton = row.querySelector('button[data-template-role="prefix"]');
        if (prefixButton) {
            prefixButton.addEventListener('click', (event) => {
                event.preventDefault();
                this._handleTemplateRoleInteraction(template.id, 'prefix');
            });
        }

        const suffixButton = row.querySelector('button[data-template-role="suffix"]');
        if (suffixButton) {
            suffixButton.addEventListener('click', (event) => {
                event.preventDefault();
                this._handleTemplateRoleInteraction(template.id, 'suffix');
            });
        }

        const enabledCheckbox = row.querySelector('input[data-template-role="enabled"]');
        if (enabledCheckbox) {
            enabledCheckbox.addEventListener('change', (event) => {
                this._updateTemplate(template.id, { enabled: event.target.checked });
            });
        }

        const prefixOnlyCheckbox = row.querySelector('input[data-template-role="prefixOnly"]');
        if (prefixOnlyCheckbox) {
            prefixOnlyCheckbox.addEventListener('change', (event) => {
                this._updateTemplate(template.id, { prefixOnly: event.target.checked });
            });
        }

        const deactivateButton = row.querySelector('button.raw-template-deactivate');
        if (deactivateButton) {
            deactivateButton.addEventListener('click', (event) => {
                event.preventDefault();
                this._handleDeactivateTemplate(template.id);
            });
        }
    }

    async _handleAddTemplate() {
        const defaultField = (this.uiConstants.RAW_TEMPLATE_FIELDS && this.uiConstants.RAW_TEMPLATE_FIELDS[0]?.value) || '';
        const newTemplate = {
            fieldPath: defaultField,
            prefix: '',
            suffix: '',
            enabled: true,
            prefixOnly: false,
            applyToRaw: false
        };

        const created = await this.stateManager.saveRawTemplate(newTemplate);

        if (created && this.templateAccordionRef && !this.templateAccordionRef.isOpen()) {
            this.templateAccordionRef.toggle(true, { silent: true });
        }

        this._renderTemplateRows();
    }

    async _createNewTemplate(name) {
        const defaultField = (this.uiConstants.RAW_TEMPLATE_FIELDS && this.uiConstants.RAW_TEMPLATE_FIELDS[0]?.value) || '';
        const newTemplate = {
            name: name || 'New Template',
            fieldPath: defaultField,
            prefix: '',
            suffix: '',
            enabled: true,
            prefixOnly: false,
            applyToRaw: false,
            autoApply: true
        };

        const created = await this.stateManager.saveRawTemplate(newTemplate);
        this._renderTemplateRows();
        return created;
    }

    async _handleRemoveTemplate(templateId) {
        if (!templateId) {
            return;
        }

        // Direct delete with toast notification

        await this.stateManager.deleteRawTemplate(templateId);
        this._renderTemplateRows();

        // Show toast if available (may not be in modal context)
        if (this.uiManager?.showToast) {
            this.uiManager.showToast('Template deleted', 'success');
        }
    }

    async _handleDeactivateTemplate(templateId) {
        if (!templateId) return;
        // Just set autoApply to false so it disappears from the list but stays in Manager
        await this._updateTemplate(templateId, { autoApply: false });
    }

    async _updateTemplate(templateId, changes) {
        window.Logger.debug('RawInput', '_updateTemplate', templateId, changes);
        if (!templateId) {
            return;
        }

        const current = (this.stateManager.getState().settings.rawTemplates || []).find(t => t.id === templateId);
        if (!current) {
            window.Logger.warn('RawInput', 'Template not found for update:', templateId);
            return;
        }

        const updated = { ...current, ...changes };
        await this.stateManager.saveRawTemplate(updated);
        const refreshed = this.stateManager.getState().settings.rawTemplates || [];
        this._renderTemplateRows(refreshed);
    }

    async updateTemplateContentFromFullscreen(templateId, role, value) {
        window.Logger.debug('RawInput', 'UIRawInputManager.updateTemplateContentFromFullscreen', templateId, role);
        if (!templateId || !role) {
            return;
        }

        const sanitized = value != null ? value : '';
        if (role === 'prefix') {
            await this._updateTemplate(templateId, { prefix: sanitized });
        } else if (role === 'suffix') {
            await this._updateTemplate(templateId, { suffix: sanitized });
        }
    }

    _handleTemplateRoleInteraction(templateId, role) {
        const currentTemplates = this.stateManager.getState().settings.rawTemplates || [];
        const template = currentTemplates.find(t => t.id === templateId);
        if (!template) {
            window.Logger.warn('RawInput', 'Template not found for interaction:', templateId);
            return;
        }

        if (template.fieldPath !== 'dialogue[]') {
            const content = role === 'prefix' ? (template.prefix || '') : (template.suffix || '');
            window.gvpOpenFullscreen(
                role === 'prefix' ? 'Template Prefix' : 'Template Suffix',
                content,
                'rawTemplate',
                role,
                {
                    templateId,
                    templateRole: role
                }
            );
            return;
        }

        this._openDialogueTemplatePanel(templateId, role);
    }

    _openDialogueTemplatePanel(templateId, role) {
        this._closeDialogueTemplatePanel();

        const currentTemplates = this.stateManager.getState().settings.rawTemplates || [];
        const template = currentTemplates.find(t => t.id === templateId);
        if (!template) {
            window.Logger.warn('RawInput', 'Dialogue template not found:', templateId);
            return;
        }

        const panelRef = this.uiHelpers.createDialogueTemplatePanel({
            onClose: (reason) => {
                if (reason === 'overlay') {
                    return;
                }
                this._closeDialogueTemplatePanel(reason);
            },
            onSave: () => this._saveDialogueTemplate(templateId, role)
        });

        this._dialogueTemplatePanel = {
            ...panelRef,
            templateId,
            role,
            pendingLines: []
        };

        const heading = role === 'prefix' ? 'Prefix Dialogue Template' : 'Suffix Dialogue Template';
        panelRef.title.textContent = heading;

        const values = this._getDialogueTemplateLines(template, role);

        const state = this.stateManager.getState();
        const gatherOptionValues = (key, defaults = []) => {
            const normalizedDefaults = Array.isArray(defaults) ? defaults : [];
            const set = new Set(normalizedDefaults.map(val => typeof val === 'string' ? val.trim() : '').filter(Boolean));

            const addValue = (val) => {
                if (typeof val !== 'string') {
                    return;
                }
                const trimmed = val.trim();
                if (trimmed) {
                    set.add(trimmed);
                }
            };

            if (Array.isArray(values)) {
                values.forEach(line => {
                    if (line && typeof line === 'object') {
                        addValue(line[key]);
                    }
                });
            }

            const promptDialogue = state?.promptData?.dialogue;
            if (Array.isArray(promptDialogue)) {
                promptDialogue.forEach(entry => {
                    if (entry && typeof entry === 'object') {
                        addValue(entry[key]);
                    }
                });
            }

            const sharedCustoms = this.stateManager?.getCustomDropdownOptions?.();
            if (sharedCustoms && sharedCustoms[`dialogue.${key}`]) {
                sharedCustoms[`dialogue.${key}`].forEach((val) => {
                    if (typeof val === 'string') {
                        const trimmed = val.trim();
                        if (trimmed) {
                            set.add(trimmed);
                        }
                    }
                });
            }

            return Array.from(set);
        };

        const presetOptions = {
            accent: ['neutral', 'American', 'British', 'Australian', 'New Zealand'],
            language: ['English', 'Spanish', 'French', 'German', 'Italian'],
            emotion: ['Neutral', 'Happy', 'Sad', 'Angry', 'Seductive'],
            type: ['spoken', 'whispered', 'shouted', 'narration', 'sung']
        };

        const formWrapper = document.createElement('div');
        formWrapper.className = 'gvp-dialogue-template-editor';

        const options = {
            parentCategory: null,
            dialogueConfig: {
                maxDuration: 6,
                objectOptions: this._getDialogueObjectOptions(),
                accentOptions: gatherOptionValues('accent', presetOptions.accent),
                languageOptions: gatherOptionValues('language', presetOptions.language),
                emotionOptions: gatherOptionValues('emotion', presetOptions.emotion),
                typeOptions: gatherOptionValues('type', presetOptions.type)
            },
            dialogueItemOptions: {
                includeSaveButton: false,
                onChange: (container) => this._handleDialogueTemplateChange(container),
                onRemove: (container) => this._handleDialogueTemplateChange(container)
            }
        };

        const fieldContainer = window.ArrayFieldManager.createArrayField(
            this.shadowRoot,
            'dialogue',
            values,
            '',
            false,
            options
        );

        const listContainer = fieldContainer.querySelector('.gvp-dialogue-container');
        if (listContainer) {
            listContainer.id = `dialogue-template-${role}-${templateId}`;
            this._handleDialogueTemplateChange(listContainer);
        }

        formWrapper.appendChild(fieldContainer);
        panelRef.body.appendChild(formWrapper);

        this.shadowRoot.appendChild(panelRef.overlay);
        requestAnimationFrame(() => panelRef.overlay.classList.add('visible'));
    }

    _handleDialogueTemplateChange(container) {
        if (!this._dialogueTemplatePanel || !container) {
            return;
        }
        if (window.ArrayFieldManager && typeof window.ArrayFieldManager._updateArrayItemIndexes === 'function') {
            window.ArrayFieldManager._updateArrayItemIndexes(container);
        }
        this._dialogueTemplatePanel.pendingLines = window.ArrayFieldManager.collectDialogueValues(container);
    }

    _saveDialogueTemplate(templateId, role) {
        const currentTemplates = this.stateManager.getState().settings.rawTemplates || [];
        const template = currentTemplates.find(t => t.id === templateId);
        if (!template) {
            window.Logger.warn('RawInput', 'Unable to save dialogue template; template missing:', templateId);
            return;
        }

        const existing = template.dialogueTemplate || { prefixLines: [], suffixLines: [] };
        const lines = this._dialogueTemplatePanel?.pendingLines || this._getDialogueTemplateLines(template, role);

        const updated = {
            ...template,
            prefix: template.prefix,
            suffix: template.suffix,
            dialogueTemplate: {
                prefixLines: role === 'prefix' ? lines : existing.prefixLines,
                suffixLines: role === 'suffix' ? lines : existing.suffixLines
            }
        };

        this.stateManager.setTemplate(updated);
        this._persistDialogueCustomValues(lines);
        this._renderTemplateRows();
        this._closeDialogueTemplatePanel('save');
    }

    _persistDialogueCustomValues(lines = []) {
        if (!Array.isArray(lines) || !this.stateManager?.setCustomDropdownValues) {
            return;
        }

        const fields = ['accent', 'language', 'emotion', 'type'];
        const payload = {};

        fields.forEach((field) => {
            const values = lines
                .map((line) => (line && typeof line === 'object' ? line[field] : ''))
                .filter((val) => typeof val === 'string' && val.trim())
                .map((val) => val.trim());

            if (values.length) {
                payload[`dialogue.${field}`] = Array.from(new Set(values));
            }
        });

        if (Object.keys(payload).length) {
            this.stateManager.setCustomDropdownValues(payload).catch((error) => {
                window.Logger.error('RawInput', 'Failed to persist dialogue template custom values:', error);
            });
        }
    }

    _closeDialogueTemplatePanel(reason = 'unknown') {
        if (!this._dialogueTemplatePanel) {
            return;
        }
        const { overlay } = this._dialogueTemplatePanel;
        if (overlay && overlay.parentNode) {
            overlay.classList.remove('visible');
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 200);
        }
        this._dialogueTemplatePanel = null;
    }

    _getDialogueTemplateLines(template, role) {
        const source = template?.dialogueTemplate || { prefixLines: [], suffixLines: [] };
        return role === 'prefix'
            ? (source.prefixLines || [])
            : (source.suffixLines || []);
    }

    _getTemplateRoleTooltip(template, role) {
        if (!template) {
            return 'Add template content';
        }
        if (template.fieldPath === 'dialogue[]') {
            const lines = this._getDialogueTemplateLines(template, role);
            return lines.length
                ? `${role === 'prefix' ? 'Prefix' : 'Suffix'} lines: ${lines.length}`
                : `Add ${role} dialogue lines`;
        }
        const text = role === 'prefix' ? template.prefix : template.suffix;
        return text ? `${role === 'prefix' ? 'Prefix' : 'Suffix'}: ${text}` : `Add ${role}`;
    }

    _templateRoleHasValue(template, role) {
        if (!template) {
            return false;
        }
        if (template.fieldPath === 'dialogue[]') {
            const lines = this._getDialogueTemplateLines(template, role);
            return Array.isArray(lines) && lines.length > 0;
        }
        const value = role === 'prefix' ? template.prefix : template.suffix;
        return Boolean(value);
    }

    _getDialogueObjectOptions() {
        const state = this.stateManager.getState();
        const objects = state?.promptData?.visual_details?.objects;
        if (!Array.isArray(objects)) {
            return [];
        }
        return objects
            .map(obj => {
                if (typeof obj !== 'string') {
                    return '';
                }
                const normalized = obj.trim();
                if (!normalized) {
                    return '';
                }
                const separatorIndex = normalized.indexOf(':');
                if (separatorIndex > 0) {
                    return normalized.slice(0, separatorIndex).trim();
                }
                return normalized;
            })
            .filter(Boolean);
    }
};
