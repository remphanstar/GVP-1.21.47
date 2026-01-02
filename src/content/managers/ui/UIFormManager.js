// UIFormManager.js - JSON editor tab with form field rendering
// Dependencies: StateManager, ArrayFieldManager, SentenceFormatter, ReactAutomation

window.UIFormManager = class UIFormManager {
    constructor(stateManager, arrayFieldManager, sentenceFormatter, reactAutomation, shadowRoot) {
        this.stateManager = stateManager;
        this.arrayFieldManager = arrayFieldManager;
        this.sentenceFormatter = sentenceFormatter;
        this.reactAutomation = reactAutomation;
        this.shadowRoot = shadowRoot;
        this.currentCategory = null;
        this.gridContainer = null;
        this.subArrayContainer = null;
        this.customDropdownOptions = {}; // Store custom dropdown values
        this.customObjectPresets = [];
        this.jsonPresetSelect = null;
        this.currentPresetName = null; // Track loaded preset
        this.currentPresetData = null; // Original preset data for comparison
        this.updatePresetBtn = null; // Button to update current preset
        this._boundHandleJsonPresetsUpdated = this._handleJsonPresetsUpdated.bind(this);
        this._boundHandlePromptDataUpdated = this._handlePromptDataUpdated.bind(this);
        this._boundHandleCustomObjectsUpdated = this._handleCustomObjectsUpdated.bind(this);
        this._loadCustomDropdownValues();
        this._loadCustomObjects();
        window.addEventListener('gvp:custom-dropdown-updated', this._handleCustomDropdownUpdate.bind(this));
        window.addEventListener('gvp:json-presets-updated', this._boundHandleJsonPresetsUpdated);
        window.addEventListener('gvp:prompt-data-updated', this._boundHandlePromptDataUpdated);
        window.addEventListener('gvp:custom-objects-updated', this._boundHandleCustomObjectsUpdated);
    }

    _handleDialogueArrayChange(container) {
        if (!container) {
            return;
        }

        if (window.ArrayFieldManager && typeof window.ArrayFieldManager._updateArrayItemIndexes === 'function') {
            window.ArrayFieldManager._updateArrayItemIndexes(container);
        }

        this.saveArrayField('dialogue', { silent: true });

        const collectValues = typeof window.ArrayFieldManager?.collectDialogueValues === 'function'
            ? window.ArrayFieldManager.collectDialogueValues(container)
            : [];

        if (!Array.isArray(collectValues)) {
            return;
        }

        const fieldsToPersist = [];
        collectValues.forEach((line) => {
            if (!line || typeof line !== 'object') {
                return;
            }
            ['accent', 'language', 'emotion', 'type'].forEach((field) => {
                const val = typeof line[field] === 'string' ? line[field].trim() : '';
                if (val && !fieldsToPersist.includes(field)) {
                    fieldsToPersist.push(field);
                }
            });
        });

        if (!fieldsToPersist.length) {
            return;
        }

        Promise.all(fieldsToPersist.map((field) => {
            const values = collectValues
                .map((line) => (line && typeof line === 'object' ? line[field] : ''))
                .filter((val) => typeof val === 'string' && val.trim())
                .map((val) => val.trim());

            if (!values.length) {
                return null;
            }

            const uniqueValues = Array.from(new Set(values));
            return this._saveCustomDropdownValue(`dialogue.${field}`, uniqueValues);
        }).filter(Boolean)).catch((error) => {
            window.Logger.error('UIForm', 'Failed to persist dialogue custom values from JSON tab:', error);
        }).finally(() => {
            this._refreshOpenDialogueDropdowns();
        });
    }

    async _loadCustomDropdownValues() {
        try {
            const state = this.stateManager?.getState?.();
            if (state?.settings?.customDropdownOptions) {
                this.customDropdownOptions = { ...state.settings.customDropdownOptions };
            } else if (this.stateManager && typeof this.stateManager.getCustomDropdownOptions === 'function') {
                this.customDropdownOptions = this.stateManager.getCustomDropdownOptions();
            } else {
                this.customDropdownOptions = {};
            }
            window.Logger.debug('UIForm', 'Loaded custom dropdown values:', this.customDropdownOptions);
        } catch (error) {
            window.Logger.error('UIForm', 'Failed to load custom dropdown values:', error);
        }
    }

    async _saveCustomDropdownValue(key, value) {
        try {
            const values = Array.isArray(value) ? value : [value];
            const normalized = values
                .map((val) => (typeof val === 'string' ? val.trim() : ''))
                .filter(Boolean);

            if (!normalized.length) {
                return;
            }

            const stateManager = this.stateManager;
            if (stateManager && typeof stateManager.setCustomDropdownValues === 'function') {
                const payload = { [key]: normalized };
                await stateManager.setCustomDropdownValues(payload);
                this.customDropdownOptions = {
                    ...this.customDropdownOptions,
                    [key]: stateManager.getCustomDropdownOptions()[key]
                };
            } else {
                window.Logger.warn('UIForm', 'StateManager not available for saving custom dropdown');
            }

            window.Logger.debug('UIForm', 'Saved custom dropdown value:', key, normalized);
        } catch (error) {
            window.Logger.error('UIForm', 'Failed to save custom dropdown value:', error);
        }
    }

    _handleCustomDropdownUpdate(event) {
        const detail = event?.detail;
        if (!detail || typeof detail !== 'object') {
            return;
        }
        const nextOptions = detail.options || {};
        const hasChanged = JSON.stringify(this.customDropdownOptions) !== JSON.stringify(nextOptions);
        if (!hasChanged) {
            return;
        }

        this.customDropdownOptions = { ...nextOptions };
        this._refreshOpenDialogueDropdowns();
    }

    async _loadCustomObjects() {
        try {
            if (!this.stateManager || typeof this.stateManager.getCustomObjects !== 'function') {
                this.customObjectPresets = [];
                return;
            }
            const objects = await this.stateManager.getCustomObjects();
            this.customObjectPresets = Array.isArray(objects) ? objects : [];
            this._refreshObjectPresetDropdowns();
        } catch (error) {
            window.Logger.warn('UIForm', 'Failed to load custom objects:', error);
            this.customObjectPresets = [];
        }
    }

    _handleCustomObjectsUpdated() {
        this._loadCustomObjects();
    }

    _refreshObjectPresetDropdowns() {
        if (!this.shadowRoot) return;
        const selects = this.shadowRoot.querySelectorAll('select[data-role="object-preset"]');
        selects.forEach((select) => {
            const currentValue = select.value;
            // Remove old custom options
            select.querySelectorAll('option[data-source="custom-object"]').forEach(opt => opt.remove());
            this.customObjectPresets.forEach(obj => {
                const val = obj?.value || obj?.data || '';
                if (!val) return;
                const option = document.createElement('option');
                option.value = val;
                const namePart = val.split(':')[0] || val;
                option.textContent = `${namePart} (saved)`;
                option.dataset.source = 'custom-object';
                select.appendChild(option);
            });
            if (!select.querySelector('option[value="__custom"]')) {
                const customOption = document.createElement('option');
                customOption.value = '__custom';
                customOption.textContent = 'Custom...';
                select.appendChild(customOption);
            }
            // Try to preserve selection
            if (currentValue) {
                select.value = currentValue;
            } else {
                select.value = '';
            }
        });
    }

    _convertObjectPresetToCustomInput(selectEl) {
        const wrapper = selectEl.parentElement;
        if (!wrapper) return;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'gvp-input';
        input.placeholder = 'Enter object (e.g., "Blonde Subject: detailed description")';
        input.style.cssText = selectEl.style.cssText;
        input.value = '';

        const finish = async (commit) => {
            const val = commit ? this._normalizeObjectValue(input.value) : '';
            wrapper.replaceChild(selectEl, input);
            if (val) {
                await this._persistCustomObject(val);
                this._insertObjectArrayItem(val);
                this._refreshObjectPresetDropdowns();
            }
            selectEl.value = '';
        };

        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                await finish(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                await finish(false);
            }
            e.stopPropagation();
        }, { capture: true });

        input.addEventListener('blur', () => finish(true));

        wrapper.replaceChild(input, selectEl);
        input.focus();
    }

    _normalizeObjectValue(raw) {
        const trimmed = (raw || '').trim();
        if (!trimmed) return '';
        let val = trimmed;
        if (!val.includes(':')) {
            val = `${val}:`;
        }
        val = val.replace(/:+\s*$/, ':'); // collapse trailing colons
        val = val.replace(/:\s*/, ': ').replace(/\s+$/, ' ').trimEnd();
        if (!val.endsWith(' ')) {
            val = `${val} `;
        }
        return val;
    }

    async _persistCustomObject(val) {
        if (!val) return;
        if (this.stateManager && typeof this.stateManager.saveCustomObject === 'function') {
            try {
                await this.stateManager.saveCustomObject(val);
                await this._loadCustomObjects();
            } catch (error) {
                window.Logger.error('UIForm', 'Failed to persist custom object:', error);
            }
        }
    }

    _insertObjectArrayItem(value) {
        if (!value) return;
        const container = this.shadowRoot.getElementById('array-objects');
        if (!container) return;
        const newIndex = container.children.length;
        const newItem = window.ArrayFieldManager.createArrayItem(
            this.shadowRoot,
            'objects',
            value,
            newIndex,
            'Describe an object...',
            true,
            container
        );
        container.appendChild(newItem);
        window.ArrayFieldManager._updateArrayItemIndexes(container);
        this.saveArrayField('objects', { silent: false });
    }

    _refreshOpenDialogueDropdowns() {
        if (!this.shadowRoot) {
            return;
        }

        window.Logger.debug('UIForm', 'Refreshing open dialogue dropdowns');
        const dialogueContainers = this.shadowRoot.querySelectorAll('.gvp-dialogue-item');
        dialogueContainers.forEach((container, containerIndex) => {
            console.groupCollapsed(`[GVP][Debug][Dropdown] Container ${containerIndex}`);
            const selectElements = container.querySelectorAll('select[data-role]');
            selectElements.forEach((select) => {
                const fieldRole = select.dataset.role;
                let categoryFieldKey = '';
                switch (fieldRole) {
                    case 'accent':
                    case 'language':
                    case 'emotion':
                    case 'type':
                        categoryFieldKey = `dialogue.${fieldRole}`;
                        break;
                    default:
                        return;
                }

                const savedValues = Array.isArray(this.customDropdownOptions[categoryFieldKey])
                    ? this.customDropdownOptions[categoryFieldKey]
                    : [];
                const savedSet = new Set(savedValues);

                window.Logger.debug('UIForm', '[Dropdown] Refresh pass', {
                    fieldRole,
                    categoryFieldKey,
                    savedValues,
                    existingOptions: Array.from(select.options).map((opt) => ({
                        value: opt.value,
                        text: opt.textContent,
                        source: opt.dataset?.source
                    })),
                    currentValue: select.value
                });

                Array.from(select.options).forEach((opt) => {
                    if (opt.dataset?.source === 'custom-saved' && !savedSet.has(opt.value)) {
                        window.Logger.debug('UIForm', '[Dropdown] Removing stale custom option', opt.value);
                        select.removeChild(opt);
                    }
                });

                if (!savedValues.length) {
                    const selectedOption = select.options[select.selectedIndex];
                    if (selectedOption?.dataset?.source === 'custom-saved') {
                        window.Logger.debug('UIForm', '[Dropdown] Saved list empty; clearing selected value', {
                            currentValue: select.value,
                            selectedOption
                        });
                        select.value = '';
                    }
                    console.groupEnd();
                    return;
                }

                const existingValues = new Set(Array.from(select.options).map((opt) => opt.value));
                const customOption = Array.from(select.options).find((opt) => opt.value === '__custom');
                savedValues.forEach((saved) => {
                    if (!existingValues.has(saved)) {
                        window.Logger.debug('UIForm', '[Dropdown] Injecting saved option', saved);
                        const optEl = document.createElement('option');
                        optEl.value = saved;
                        optEl.textContent = `${saved} (saved)`;
                        optEl.dataset.source = 'custom-saved';
                        if (customOption) {
                            select.insertBefore(optEl, customOption);
                        } else {
                            select.appendChild(optEl);
                        }
                        existingValues.add(saved);
                    }
                });

                const selectedOption = select.options[select.selectedIndex];
                if (selectedOption?.dataset?.source === 'custom-saved' && !savedSet.has(select.value)) {
                    window.Logger.debug('UIForm', '[Dropdown] Selected saved option removed from list; clearing value', {
                        currentValue: select.value,
                        savedValues
                    });
                    select.value = '';
                }
            });
            console.groupEnd();
        });
        console.groupEnd();
    }

    _handleJsonPresetsUpdated() {
        this._updateSmartSaveButtonState();
    }

    _handlePromptDataUpdated() {
        this._refreshCurrentCategoryView();
        this._updatePresetButtonVisibility(); // Check if changes warrant showing update button
    }

    _promptSaveJsonPreset() {
        if (!this.stateManager?.saveJsonPreset) {
            window.Logger.warn('UIForm', 'JSON preset save unavailable (missing StateManager method)');
            return;
        }
        const state = this.stateManager.getState?.();
        if (!state) {
            return;
        }

        const defaultName = '';
        const nameInput = window.prompt('Save JSON preset as:', defaultName);
        if (nameInput === null) {
            return;
        }
        const name = nameInput.trim();
        if (!name) {
            window.gvpUIManager?.uiModalManager?.showError('Preset name cannot be empty.');
            return;
        }

        const presets = this.stateManager.getJsonPresets();
        const existing = presets.find(preset => preset.name.toLowerCase() === name.toLowerCase());
        if (existing) {
            const overwrite = window.confirm(`Preset "${existing.name}" already exists. Overwrite it?`);
            if (!overwrite) {
                return;
            }
        }

        const result = this.stateManager.saveJsonPreset(name, state.promptData);
        if (!result?.success) {
            window.gvpUIManager?.uiModalManager?.showError('Failed to save JSON preset.');
            return;
        }
        this.jsonPresetSelect.value = result.name;
        window.Logger.info('UIForm', 'JSON preset saved', { name: result.name, replaced: result.replaced });
    }

    async _applyJsonPresetFromSelect(name) {
        if (!name) {
            this.currentPresetName = null;
            this.currentPresetData = null;
            if (this.presetInput) this.presetInput.value = '';
            this._updatePresetButtonVisibility();
            return;
        }
        if (!this.stateManager?.applyJsonPreset) {
            window.Logger.warn('UIForm', 'Unable to apply JSON preset (StateManager missing method)');
            return;
        }

        // Get preset data before applying
        const presets = await this.stateManager.getJsonPresets();
        const preset = presets.find(p => p.name === name);

        const success = await this.stateManager.applyJsonPreset(name);
        if (!success) {
            window.gvpUIManager?.uiModalManager?.showError(`Failed to load preset "${name}". It may have been removed.`);
            this.currentPresetName = null;
            this.currentPresetData = null;
            if (this.presetInput) this.presetInput.value = '';
            this._updatePresetButtonVisibility();
            return;
        }

        // Store preset info for change detection
        this.currentPresetName = name;
        this.currentPresetData = preset ? JSON.parse(JSON.stringify(preset.data)) : null;

        if (this.presetInput) this.presetInput.value = name;
        window.Logger.info('UIForm', 'Applied JSON preset', { name });

        // Hide update button initially (no changes yet)
        this._updatePresetButtonVisibility();
    }

    _refreshCurrentCategoryView() {
        if (!this.currentCategory || !this.subArrayContainer) {
            return;
        }
        this.subArrayContainer.innerHTML = '';
        this._renderCategoryFields(this.subArrayContainer, this.currentCategory);
    }

    _createPresetPanel() {
        const panel = document.createElement('div');
        panel.id = 'gvp-json-preset-panel';
        panel.className = 'gvp-json-preset-panel';
        panel.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 12px; background: var(--gvp-bg-input); padding: 8px; border-radius: 6px; border: 1px solid #333;';

        // --- Smart Combobox Container ---
        const comboContainer = document.createElement('div');
        comboContainer.style.cssText = 'position: relative; flex: 1;';

        const inputWrapper = document.createElement('div');
        inputWrapper.style.cssText = 'position: relative; display: flex; align-items: center;';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Search or create preset...';
        input.style.cssText = `
            width: 100%;
            padding: 8px 32px 8px 12px;
            background: var(--gvp-bg-secondary);
            border: 1px solid var(--gvp-border);
            border-radius: 4px;
            color: var(--gvp-text-primary);
            font-size: 13px;
            outline: none;
        `;
        this.presetInput = input;

        // Dropdown Arrow Icon
        const arrow = document.createElement('span');
        arrow.innerHTML = '▼';
        arrow.style.cssText = 'position: absolute; right: 10px; color: var(--gvp-text-muted); font-size: 10px; pointer-events: none;';
        inputWrapper.appendChild(input);
        inputWrapper.appendChild(arrow);
        comboContainer.appendChild(inputWrapper);

        // Dropdown List (Hidden by default)
        const dropdown = document.createElement('div');
        dropdown.style.cssText = `
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            width: 100%;
            max-height: 300px;
            overflow-y: auto;
            background: var(--gvp-bg-secondary);
            border: 1px solid var(--gvp-border);
            border-radius: 4px;
            margin-top: 4px;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        `;
        this.presetDropdown = dropdown;
        comboContainer.appendChild(dropdown);
        panel.appendChild(comboContainer);

        // --- Actions ---

        // Save Button
        const saveBtn = document.createElement('button');
        saveBtn.innerHTML = '➕'; // Initial state
        saveBtn.title = 'Create New Preset';
        saveBtn.className = 'gvp-button primary';
        saveBtn.style.padding = '8px';
        saveBtn.onclick = () => this._handleSmartSave();
        this.smartSaveBtn = saveBtn;
        panel.appendChild(saveBtn);

        // Import Button
        const importBtn = document.createElement('button');
        importBtn.innerHTML = '📥';
        importBtn.title = 'Import JSON';
        importBtn.className = 'gvp-button';
        importBtn.style.padding = '8px';
        importBtn.onclick = () => this._showImportModal();
        panel.appendChild(importBtn);

        // Manager Button
        const manageBtn = document.createElement('button');
        manageBtn.innerHTML = '📂';
        manageBtn.title = 'Open Manager';
        manageBtn.className = 'gvp-button secondary';
        manageBtn.style.padding = '8px';
        manageBtn.onclick = () => this._openPresetManager();
        panel.appendChild(manageBtn);

        // --- Event Listeners ---

        input.onfocus = () => {
            this._renderDropdown(input.value);
            dropdown.style.display = 'block';
            input.style.borderColor = 'var(--gvp-status-processing)';
        };

        // Delay hiding to allow clicking items
        input.onblur = () => {
            setTimeout(() => {
                dropdown.style.display = 'none';
                input.style.borderColor = 'var(--gvp-border)';
                // Preserve the current preset name on blur
                if (this.currentPresetName) {
                    this.presetInput.value = this.currentPresetName;
                }
            }, 200);
        };

        input.oninput = (e) => {
            this._renderDropdown(e.target.value);
            this._updateSmartSaveButtonState();
        };

        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                this._handleSmartSave();
                input.blur();
            }
            e.stopPropagation();
        };

        return panel;
    }

    async _renderDropdown(filterText = '') {
        const list = this.presetDropdown;
        list.innerHTML = '';

        let presets = await this.stateManager.getJsonPresets();
        const lowerFilter = filterText.toLowerCase().trim();

        if (!Array.isArray(presets)) {
            window.Logger.warn('UIForm', 'Presets is not an array:', presets);
            presets = [];
        }
        const matches = presets.filter(p => p.name.toLowerCase().includes(lowerFilter));
        const exactMatch = presets.find(p => p.name.toLowerCase() === lowerFilter);

        // 1. Existing Matches
        matches.forEach(preset => {
            const item = document.createElement('div');
            item.textContent = preset.name;
            item.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                color: var(--gvp-text-secondary);
                font-size: 13px;
                border-bottom: 1px solid #333;
            `;
            item.onmouseover = () => { item.style.background = 'var(--gvp-bg-hover)'; item.style.color = 'var(--gvp-text-primary)'; };
            item.onmouseout = () => { item.style.background = 'transparent'; item.style.color = 'var(--gvp-text-secondary)'; };
            item.onmousedown = async () => { // onmousedown fires before blur
                await this._applyJsonPresetFromSelect(preset.name);
                this.presetInput.value = preset.name;
                this.currentPresetName = preset.name;
                this.currentPresetData = JSON.parse(JSON.stringify(this.stateManager.getState()?.promptData || {}));
                this._updateSmartSaveButtonState?.();
            };
            list.appendChild(item);
        });

        // 2. Create New Option (if filter exists and isn't an exact match)
        if (lowerFilter && !exactMatch) {
            const createItem = document.createElement('div');
            createItem.innerHTML = `<span style="color: var(--gvp-status-processing);">+</span> Create "<strong>${filterText}</strong>"`;
            createItem.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                color: var(--gvp-text-primary);
                font-size: 13px;
                border-top: 1px solid var(--gvp-border);
                background: var(--gvp-bg-input);
            `;
            createItem.onmouseover = () => createItem.style.background = 'var(--gvp-bg-hover)';
            createItem.onmouseout = () => createItem.style.background = 'var(--gvp-bg-input)';
            createItem.onmousedown = () => {
                this._saveNewPreset(filterText);
            };
            list.appendChild(createItem);
        }

        if (matches.length === 0 && !lowerFilter) {
            const empty = document.createElement('div');
            empty.textContent = 'Type to search or create...';
            empty.style.cssText = 'padding: 12px; color: var(--gvp-text-muted); font-size: 12px; text-align: center;';
            list.appendChild(empty);
        }
    }

    async _handleSmartSave() {
        const name = this.presetInput.value.trim();
        if (!name) {
            this.presetInput.focus();
            window.gvpUIManager?.uiModalManager?.showWarning('Name your preset before saving.');
            return;
        }

        const presets = await this.stateManager.getJsonPresets();
        const existing = presets.find(p => p.name.toLowerCase() === name.toLowerCase());

        if (existing) {
            await this._updateCurrentPreset(); // Update existing
        } else {
            await this._saveNewPreset(name); // Create new
        }

        // Keep input focused for quick renames/edits
        this.presetInput.focus();
    }

    async _saveNewPreset(name) {
        const state = this.stateManager.getState?.();
        if (!state?.promptData) return;

        const result = await this.stateManager.saveJsonPreset(name, state.promptData);
        if (result?.success) {
            const clonedPrompt = JSON.parse(JSON.stringify(state.promptData));
            this.currentPresetName = result.name;
            this.currentPresetData = clonedPrompt;
            this.presetInput.value = result.name;
            await this._applyJsonPresetFromSelect(result.name); // Load it as current
            this._updatePresetButtonVisibility?.();
            this._updateSmartSaveButtonState?.();
            window.gvpUIManager?.uiModalManager?.showSuccess(`Preset "${result.name}" created and selected.`);
            // Keep focus and dropdown in sync
            this.presetInput.focus();
        }
    }

    async _updateSmartSaveButtonState() {
        if (!this.smartSaveBtn) return;

        const name = this.presetInput.value.trim();
        const presets = await this.stateManager.getJsonPresets();
        const existing = presets.find(p => p.name.toLowerCase() === name.toLowerCase());

        const hasChanges = this._hasPresetChanges();

        if (existing) {
            this.smartSaveBtn.innerHTML = '💾';
            this.smartSaveBtn.title = 'Update Preset';

            // Pulse if dirty
            if (hasChanges && this.currentPresetName === existing.name) {
                this.smartSaveBtn.style.background = '#ea580c'; // Keep specific status color
                this.smartSaveBtn.classList.add('pulse');
            } else {
                this.smartSaveBtn.style.background = ''; // Default primary
                this.smartSaveBtn.classList.remove('pulse');
            }
        } else {
            this.smartSaveBtn.innerHTML = '➕';
            this.smartSaveBtn.title = 'Create New Preset';
            this.smartSaveBtn.style.background = 'var(--gvp-status-success)';
            this.smartSaveBtn.classList.remove('pulse');
            this.currentPresetName = null;
        }
    }

    async _openPresetManager() {
        window.gvpUIManager?.uiModalManager?.showPresetManagerModal({
            onLoad: (preset) => {
                const name = typeof preset === 'string' ? preset : preset.name;
                this._applyJsonPresetFromSelect(name);
                this.presetInput.value = name;
            },
            onDelete: async (preset) => {
                const name = typeof preset === 'string' ? preset : preset.name;
                const result = await this.stateManager.deleteJsonPreset(name);
                if (result && result.success && this.currentPresetName === name) {
                    this.currentPresetName = null;
                    this.currentPresetData = null;
                    this.presetInput.value = '';
                    this._updateSmartSaveButtonState();
                }
                return result && result.success;
            },
            onRename: async (preset, newName) => {
                const oldName = typeof preset === 'string' ? preset : preset.name;
                const result = await this.stateManager.renameJsonPreset(oldName, newName);
                if (result && result.success && this.currentPresetName === oldName) {
                    this.currentPresetName = newName;
                    this.presetInput.value = newName;
                }
                // Need to return the updated preset for UI refresh
                if (result && result.success) {
                    const presets = await this.stateManager.getJsonPresets();
                    const updatedPreset = presets.find(p => p.name === newName);
                    return { success: true, newItem: updatedPreset || { name: newName, data: result.preset } };
                }
                return { success: false };
            }
        });
    }

    _hasPresetChanges() {
        if (!this.currentPresetName || !this.currentPresetData) {
            return false;
        }

        const state = this.stateManager.getState();
        if (!state || !state.promptData) {
            return false;
        }

        // Deep comparison
        return JSON.stringify(this.currentPresetData) !== JSON.stringify(state.promptData);
    }

    _updatePresetButtonVisibility() {
        // Override original method to use new smart button logic
        this._updateSmartSaveButtonState();
    }

    async _updateCurrentPreset() {
        if (!this.currentPresetName) {
            window.gvpUIManager?.uiModalManager?.showWarning('No preset loaded to update.');
            return;
        }

        const state = this.stateManager.getState?.();
        if (!state?.promptData) {
            window.gvpUIManager?.uiModalManager?.showError('No data to save.');
            return;
        }

        const result = await this.stateManager.saveJsonPreset(this.currentPresetName, state.promptData);
        if (!result?.success) {
            window.gvpUIManager?.uiModalManager?.showError(`Failed to update preset "${this.currentPresetName}".`);
            return;
        }

        // Update stored preset data to match new version
        this.currentPresetData = JSON.parse(JSON.stringify(state.promptData));
        this.presetInput.value = this.currentPresetName;
        this.presetInput.focus();

        // Hide update button since changes are now saved
        this._updatePresetButtonVisibility();

        window.gvpUIManager?.uiModalManager?.showSuccess(`Preset "${this.currentPresetName}" updated successfully!`);
        window.Logger.info('UIForm', 'Preset updated', { name: this.currentPresetName });
    }

    _showImportModal() {
        if (!window.gvpUIManager?.uiModalManager?.showImportJsonModal) {
            window.Logger.error('UIForm', 'Import modal not available');
            return;
        }

        window.gvpUIManager.uiModalManager.showImportJsonModal((jsonString, presetName) => {
            this._importJsonPreset(jsonString, presetName);
        });
    }

    async _importJsonPreset(jsonString, presetName) {
        // Validate JSON
        let parsedData;
        try {
            parsedData = JSON.parse(jsonString);
        } catch (error) {
            window.gvpUIManager?.uiModalManager?.showError('Invalid JSON format. Please check your input.');
            window.Logger.error('UIForm', 'JSON parse error:', error);
            return;
        }

        // Validate preset name
        const trimmedName = presetName.trim();
        if (!trimmedName) {
            window.gvpUIManager?.uiModalManager?.showError('Preset name cannot be empty.');
            return;
        }

        // Check if it matches expected structure (has at least one known field)
        const expectedFields = ['shot', 'scene', 'cinematography', 'visual_details', 'motion', 'audio', 'dialogue', 'tags'];
        const hasValidField = expectedFields.some(field => parsedData.hasOwnProperty(field));

        if (!hasValidField) {
            window.gvpUIManager?.uiModalManager?.showError('JSON does not match expected prompt structure. Please check your format.');
            window.Logger.error('UIForm', 'Invalid structure:', parsedData);
            return;
        }

        // Check for existing preset with same name
        const presets = await this.stateManager.getJsonPresets();
        const existing = presets.find(preset => preset.name.toLowerCase() === trimmedName.toLowerCase());
        if (existing) {
            const overwrite = window.confirm(`Preset "${existing.name}" already exists. Overwrite it?`);
            if (!overwrite) {
                return;
            }
        }

        // Save preset
        const result = await this.stateManager.saveJsonPreset(trimmedName, parsedData);
        if (!result?.success) {
            window.gvpUIManager?.uiModalManager?.showError('Failed to save imported preset.');
            return;
        }

        // Apply preset immediately
        const applied = await this.stateManager.applyJsonPreset(trimmedName);
        if (!applied) {
            window.gvpUIManager?.uiModalManager?.showWarning('Preset saved but failed to apply.');
            return;
        }

        // Update UI
        this._populateJsonPresetSelect({ selectedName: trimmedName });
        this.jsonPresetSelect.value = trimmedName;

        // Store preset info for change detection
        this.currentPresetName = trimmedName;
        this.currentPresetData = JSON.parse(JSON.stringify(parsedData));
        this._updatePresetButtonVisibility();

        window.gvpUIManager?.uiModalManager?.showSuccess(`Preset "${trimmedName}" imported and applied successfully!`);
        window.Logger.info('UIForm', 'JSON preset imported', { name: trimmedName, replaced: result.replaced });
    }

    _createJsonEditorTab() {
        const tab = document.createElement('div');
        tab.className = 'gvp-tab-content active';
        tab.id = 'gvp-json-editor';

        // Create preset panel (above grid)
        const presetPanel = this._createPresetPanel();
        tab.appendChild(presetPanel);

        // Create grid container
        this.gridContainer = document.createElement('div');
        this.gridContainer.id = 'gvp-category-grid';

        const categories = window.uiConstants.CATEGORY_NAMES;
        categories.forEach(cat => {
            const card = document.createElement('div');
            card.className = 'gvp-category-card';
            card.textContent = cat;
            card.addEventListener('click', (e) => this.expandCategory(e.target.textContent.trim()));
            this.gridContainer.appendChild(card);
        });

        tab.appendChild(this.gridContainer);

        // Create sub-array view (no preset controls here anymore)
        this.subArrayView = document.createElement('div');
        this.subArrayView.id = 'gvp-subarray-view';
        const subArrayHeader = document.createElement('div');
        subArrayHeader.id = 'gvp-subarray-header';
        const subArrayTitle = document.createElement('div');
        subArrayTitle.id = 'gvp-subarray-title';

        const backBtn = document.createElement('button');
        backBtn.id = 'gvp-subarray-back-btn';
        backBtn.className = 'gvp-button primary';
        backBtn.textContent = 'Back & Save';
        backBtn.addEventListener('click', () => this.collapseToGrid());

        subArrayHeader.appendChild(subArrayTitle);
        subArrayHeader.appendChild(backBtn);
        this.subArrayContainer = document.createElement('div');
        this.subArrayContainer.id = 'gvp-subarray-container';
        this.subArrayView.appendChild(subArrayHeader);
        this.subArrayView.appendChild(this.subArrayContainer);
        tab.appendChild(this.subArrayView);



        return tab;
    }

    expandCategory(cat) {
        this.currentCategory = cat;
        const uiState = this.stateManager.getState().ui;
        uiState.activeCategory = cat;
        uiState.categoryViewMode = 'subarray';
        this.gridContainer.style.display = 'none';
        this.subArrayView.style.display = 'block';
        const title = this.shadowRoot.getElementById('gvp-subarray-title');
        if (title) title.textContent = cat.toUpperCase();
        this.subArrayContainer.innerHTML = '';
        this._renderCategoryFields(this.subArrayContainer, cat);
    }

    collapseToGrid() {
        // Save ALL data before collapsing
        this.buildJsonPrompt(); // This saves all visible fields to promptData
        this.stateManager.saveSettings(); // Persist to storage (correct method name)

        window.Logger.debug('UIForm', 'Go Back & Save: All data saved', this.stateManager.getState().promptData);

        // Check if we need to show update button for loaded preset
        this._updatePresetButtonVisibility();

        this.currentCategory = null;
        const uiState = this.stateManager.getState().ui;
        uiState.activeCategory = null;
        uiState.categoryViewMode = 'grid';
        this.gridContainer.style.display = 'grid';
        this.subArrayView.style.display = 'none';
    }

    _renderCategoryFields(container, categoryName) {
        const state = this.stateManager.getState();
        const data = state.promptData;

        if (categoryName === 'Shot Settings') {
            this._renderDropdownField(container, 'Motion Level', 'shot', 'motion_level', ['low', 'medium', 'high', 'custom'], data.shot.motion_level);
            this._renderDropdownField(container, 'Camera Depth', 'shot', 'camera_depth', ['close up', 'medium shot', 'full shot', 'custom'], data.shot.camera_depth);
            this._renderDropdownField(container, 'Camera View', 'shot', 'camera_view', ['eye level', 'high angle', 'low angle', 'custom'], data.shot.camera_view);
            this._renderTextareaField(container, 'Camera Movement', 'shot', 'camera_movement', data.shot.camera_movement);
        } else if (categoryName === 'Scene Settings') {
            this._renderTextareaField(container, 'Location', 'scene', 'location', data.scene.location);
            this._renderTextareaField(container, 'Environment', 'scene', 'environment', data.scene.environment);
        } else if (categoryName === 'Cinematography') {
            this._renderTextareaField(container, 'Lighting', 'cinematography', 'lighting', data.cinematography.lighting);
            this._renderTextareaField(container, 'Style', 'cinematography', 'style', data.cinematography.style);
            this._renderTextareaField(container, 'Texture', 'cinematography', 'texture', data.cinematography.texture);
            this._renderTextareaField(container, 'Depth of Field', 'cinematography', 'depth_of_field', data.cinematography.depth_of_field);
        } else if (categoryName === 'Visual Details') {
            const g1 = document.createElement('div');
            g1.className = 'gvp-form-group';
            const headerRow = document.createElement('div');
            headerRow.style.cssText = 'display: flex; align-items: center; gap: 12px; margin-bottom: 8px;';

            const l1 = document.createElement('label');
            l1.className = 'gvp-label';
            l1.textContent = 'Objects:';
            l1.style.margin = '0';
            headerRow.appendChild(l1);

            // Object preset dropdown
            const presetSelect = document.createElement('select');
            presetSelect.className = 'gvp-input';
            presetSelect.style.cssText = 'width: 240px; font-size: 12px;';
            presetSelect.dataset.role = 'object-preset';
            const presetOptions = [
                { value: '', label: '-- Add Preset Object --' },
                { value: 'Left frame female subject', label: 'Left Frame Female' },
                { value: 'Centre frame female subject', label: 'Centre Frame Female' },
                { value: 'Right frame female subject', label: 'Right Frame Female' },
                { value: 'Blonde subject', label: 'Blonde Subject' },
                { value: 'Brunette subject', label: 'Brunette Subject' },
                { value: 'Black haired subject', label: 'Black Haired Subject' },
                { value: 'Red headed subject', label: 'Red Headed Subject' },
                { value: 'Multi colored haired subject', label: 'Multi Colored Hair' },
                { value: 'Artificially colored haired subject', label: 'Artificially Colored Hair' }
            ];

            presetOptions.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                presetSelect.appendChild(option);
            });

            // Inject saved custom objects into the preset dropdown
            this.customObjectPresets.forEach(obj => {
                if (!obj?.value) return;
                const option = document.createElement('option');
                option.value = obj.value;
                const namePart = obj.value.split(':')[0] || obj.value;
                option.textContent = `${namePart} (saved)`;
                option.dataset.source = 'custom-object';
                presetSelect.appendChild(option);
            });

            // Add Custom... option
            const customOption = document.createElement('option');
            customOption.value = '__custom';
            customOption.textContent = 'Custom...';
            presetSelect.appendChild(customOption);

            presetSelect.addEventListener('change', async (e) => {
                const value = e.target.value;
                if (!value) {
                    return;
                }

                if (value === '__custom') {
                    this._convertObjectPresetToCustomInput(presetSelect);
                    return;
                }

                this._insertObjectArrayItem(this._normalizeObjectValue(value));
                presetSelect.value = '';
            });

            headerRow.appendChild(presetSelect);
            g1.appendChild(headerRow);

            const objectsArray = Array.isArray(data.visual_details?.objects) ? data.visual_details.objects : [];
            g1.appendChild(window.ArrayFieldManager.createArrayField(this.shadowRoot, 'objects', objectsArray, 'Describe an object...', true));
            container.appendChild(g1);
            this._attachArrayFieldListeners(this.shadowRoot, 'objects');

            // Positioning as textarea (kept as a single text block with label)
            this._renderTextareaField(container, 'Positioning', 'visual_details', 'positioning', Array.isArray(data.visual_details?.positioning) ? (data.visual_details.positioning.join('\n')) : (data.visual_details?.positioning || ''));

            // Text Elements as textarea
            this._renderTextareaField(container, 'Text Elements', 'visual_details', 'text_elements', Array.isArray(data.visual_details?.text_elements) ? (data.visual_details.text_elements.join('\n')) : (data.visual_details?.text_elements || ''));
        } else if (categoryName === 'Motion Description') {
            this._renderTextareaField(container, 'Motion', 'motion', '', data.motion);
        } else if (categoryName === 'Audio Settings') {
            this._renderTextareaField(container, 'Music', 'audio', 'music', data.audio.music);
            this._renderTextareaField(container, 'Ambient Sounds', 'audio', 'ambient', data.audio.ambient);
            this._renderTextareaField(container, 'Sound Effects', 'audio', 'sound_effect', data.audio.sound_effect);
            this._renderTextareaField(container, 'Mix Level', 'audio', 'mix_level', data.audio.mix_level);
        } else if (categoryName === 'Dialogue') {
            const g = document.createElement('div');
            g.className = 'gvp-form-group';
            const l = document.createElement('label');
            l.className = 'gvp-label';
            l.textContent = 'Dialogue Lines:';
            g.appendChild(l);
            const dialogueArray = Array.isArray(data.dialogue) ? data.dialogue : [];
            const dialogueField = window.ArrayFieldManager.createArrayField(
                this.shadowRoot,
                'dialogue',
                dialogueArray,
                'Enter dialogue line...',
                false,
                {
                    dialogueConfig: {
                        maxDuration: 6,
                        objectOptions: this._getDialogueObjectOptions()
                    },
                    dialogueItemOptions: {
                        includeSaveButton: false,
                        onChange: (container) => this._handleDialogueArrayChange(container),
                        onRemove: (container) => this._handleDialogueArrayChange(container)
                    }
                }
            );
            g.appendChild(dialogueField);
            container.appendChild(g);
            this._attachArrayFieldListeners(this.shadowRoot, 'dialogue');
            this._refreshDialogueCharacterOptions();
        } else if (categoryName === 'Tags') {
            const g = document.createElement('div');
            g.className = 'gvp-form-group';
            const l = document.createElement('label');
            l.className = 'gvp-label';
            l.textContent = 'Tags:';
            g.appendChild(l);
            const tagsArray = Array.isArray(data.tags) ? data.tags : [];
            g.appendChild(window.ArrayFieldManager.createArrayField(this.shadowRoot, 'tags', tagsArray, 'Enter a tag...', false));
            container.appendChild(g);
            this._attachArrayFieldListeners(this.shadowRoot, 'tags');
        }
    }

    _renderDropdownField(container, label, category, field, options, value) {
        const group = document.createElement('div');
        group.className = 'gvp-form-group';
        const labelEl = document.createElement('label');
        labelEl.className = 'gvp-label';
        labelEl.textContent = `${label}:`;
        group.appendChild(labelEl);

        const select = document.createElement('select');
        select.className = 'gvp-select';
        select.dataset.fieldName = `${category}.${field}`;

        // Add standard options
        options.forEach(opt => {
            const isCustomOption = opt === 'custom' || opt === '__custom';
            const optionValue = isCustomOption ? '__custom' : opt;
            const optionLabel = isCustomOption ? 'Custom...' : opt;

            const optEl = document.createElement('option');
            optEl.value = optionValue;
            optEl.textContent = optionLabel;
            if (optionValue === value) {
                optEl.selected = true;
            }
            select.appendChild(optEl);
        });

        // Add custom saved values as options
        const fieldKey = `${category}.${field}`;
        const savedValues = Array.isArray(this.customDropdownOptions[fieldKey])
            ? this.customDropdownOptions[fieldKey]
            : [];

        window.Logger.debug('UIForm', '[Dropdown] Rendering dropdown', {
            fieldKey,
            label,
            category,
            field,
            savedValues,
            initialValue: value,
            presetOptions: options
        });

        savedValues.forEach((saved) => {
            if (!options.includes(saved) && !Array.from(select.options).some((opt) => opt.value === saved)) {
                const customOptEl = document.createElement('option');
                customOptEl.value = saved;
                customOptEl.textContent = `${saved} (saved)`;
                customOptEl.dataset.source = 'custom-saved';
                if (saved === value) {
                    customOptEl.selected = true;
                }
                const customOption = Array.from(select.options).find((opt) => opt.value === '__custom');
                if (customOption) {
                    select.insertBefore(customOptEl, customOption);
                } else {
                    select.appendChild(customOptEl);
                }
                window.Logger.debug('UIForm', '[Dropdown] Added saved option to select', { fieldKey, saved });
            }
        });

        if (value && !Array.from(select.options).some((opt) => opt.value === value)) {
            const fallbackOpt = document.createElement('option');
            fallbackOpt.value = value;
            fallbackOpt.textContent = value;
            fallbackOpt.dataset.source = 'temp-selected';
            fallbackOpt.selected = true;
            select.appendChild(fallbackOpt);
            window.Logger.warn('UIForm', '[Dropdown] Inserted fallback option because value missing from options', {
                fieldKey,
                value
            });
        }

        select.addEventListener('change', (e) => {
            window.Logger.debug('UIForm', '[Dropdown] Select change', {
                fieldKey,
                newValue: e.target.value
            });
            if (e.target.value === '__custom') {
                this._convertDropdownToCustomInput(group, category, field, select);
            } else {
                this._setNestedValue(`${category}.${field}`, e.target.value);
            }
        });

        group.appendChild(select);
        container.appendChild(group);
    }

    _convertDropdownToCustomInput(group, category, field, select) {
        window.Logger.debug('UIForm', '[Dropdown] Converting dropdown to custom input', {
            fieldKey: `${category}.${field}`,
            previousValue: select.value
        });
        const customInput = document.createElement('input');
        customInput.type = 'text';
        customInput.className = 'gvp-input';
        customInput.placeholder = `Enter custom ${field.replace(/_/g, ' ')}`;
        customInput.dataset.fieldName = `${category}.${field}`;
        customInput.value = this._getNestedValue(`${category}.${field}`) || '';

        customInput.addEventListener('input', (e) => {
            e.stopPropagation();
            const customValue = e.target.value;
            window.Logger.debug('UIForm', '[Dropdown] Custom input typing', {
                fieldKey: `${category}.${field}`,
                customValue
            });
            this._setNestedValue(`${category}.${field}`, customValue);
        });

        const persistCustomValue = () => {
            const customValue = customInput.value;
            if (customValue.trim()) {
                window.Logger.debug('UIForm', '[Dropdown] Persisting custom value on blur/focus-out', {
                    fieldKey: `${category}.${field}`,
                    customValue
                });
                this._saveCustomDropdownValue(`${category}.${field}`, customValue);
            }
        };

        customInput.addEventListener('blur', persistCustomValue);

        customInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
        });

        customInput.focus();

        select.replaceWith(customInput);
    }

    _renderTextareaField(container, label, category, field, value) {
        const group = document.createElement('div');
        group.className = 'gvp-form-group';
        const labelEl = document.createElement('label');
        labelEl.className = 'gvp-label';
        labelEl.textContent = `${label}:`;
        group.appendChild(labelEl);

        const row = document.createElement('div');
        row.className = 'gvp-form-row';

        const textarea = document.createElement('textarea');
        textarea.className = 'gvp-textarea';
        textarea.value = value || '';
        textarea.rows = 3;
        const fieldKey = category === 'motion' ? 'motion' : `${category}.${field}`;
        textarea.dataset.fieldName = fieldKey;
        textarea.addEventListener('input', (e) => {
            e.stopPropagation();
            this._setNestedValue(fieldKey, e.target.value);
        });

        textarea.addEventListener('keydown', (e) => {
            e.stopPropagation();
        });

        const buttonColumn = document.createElement('div');
        buttonColumn.className = 'gvp-button-column';

        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.type = 'button';
        fullscreenBtn.className = 'gvp-button';
        fullscreenBtn.textContent = '⛶';
        fullscreenBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.gvpOpenFullscreen(label, textarea.value || '', category, field);
        });

        // Individual save button removed - use "Go Back & Save" instead

        buttonColumn.appendChild(fullscreenBtn);

        row.appendChild(textarea);
        row.appendChild(buttonColumn);
        group.appendChild(row);
        container.appendChild(group);
    }

    _attachArrayFieldListeners(shadowRoot, fieldName) {
        const container = shadowRoot.getElementById(`array-${fieldName}`);
        if (!container) return;

        const syncArrayToState = () => {
            this.saveArrayField(fieldName, { silent: true });
        };

        const attachControlListener = (control) => {
            if (control.dataset.syncAttached === 'true') {
                return;
            }

            const handler = (e) => {
                e.stopPropagation();
                syncArrayToState();
            };

            control.addEventListener('input', handler);
            control.addEventListener('change', handler);
            control.addEventListener('keydown', (e) => {
                e.stopPropagation();
            });

            control.dataset.syncAttached = 'true';
        };

        const controls = container.querySelectorAll('[data-array-field-input="true"]');
        controls.forEach(attachControlListener);

        const removeButtons = Array.from(container.querySelectorAll('button')).filter(btn => btn.textContent === '×');
        removeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                setTimeout(() => {
                    window.ArrayFieldManager._updateArrayItemIndexes(container);
                    this.saveArrayField(fieldName);
                }, 50);
            });
        });

        const addBtn = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent === '+ Add Item');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                setTimeout(() => {
                    this._attachArrayFieldListeners(this.shadowRoot, fieldName);
                    this.saveArrayField(fieldName, { silent: false });
                }, 50);
            });
        }
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

    _getNestedValue(key) {
        const keys = key.split('.');
        let obj = this.stateManager.getState().promptData;
        for (let i = 0; i < keys.length; i++) {
            obj = obj[keys[i]];
            if (!obj) return '';
        }
        return obj;
    }

    saveField(fieldKey, value, options = {}) {
        if (!fieldKey) {
            return;
        }

        window.Logger.debug('UIForm', '[Dropdown] saveField called', {
            fieldKey,
            value,
            options
        });

        const { valueIsStorage = false, displayValue = null, silent = false } = options;
        const storageValue = valueIsStorage ? value : value;
        this._setNestedValue(fieldKey, storageValue);
        this._syncTextareaDisplay(fieldKey, displayValue !== null ? displayValue : storageValue);

        if (!silent) {
            this._notifyPromptUpdated({ fieldKey });
        }
    }

    saveArrayField(fieldName, options = {}) {
        if (!fieldName) {
            return;
        }

        const silent = typeof options.silent === 'boolean' ? options.silent : false;
        let skipDisplay = false;
        if (typeof options.skipDisplay === 'boolean') {
            skipDisplay = options.skipDisplay;
        } else if (silent) {
            skipDisplay = true;
        }

        const values = window.ArrayFieldManager.getArrayValues(this.shadowRoot, fieldName);
        this._applyArrayValues(fieldName, values);

        if (!skipDisplay) {
            this._syncArrayFieldDisplay(fieldName, values);
        }

        if (!silent) {
            this._notifyPromptUpdated({ fieldKey: `array.${fieldName}` });
        }
    }

    handleFullscreenSave(fullscreenData, displayValue, storageValue) {
        if (!fullscreenData) {
            return;
        }

        let notifyFieldKey = null;

        if (fullscreenData.isArray && typeof fullscreenData.arrayField === 'string') {
            const fieldName = fullscreenData.arrayField;
            this._updateArrayItemDisplay(fieldName, fullscreenData.arrayIndex, displayValue);
            notifyFieldKey = `array.${fieldName}`;
        } else {
            const category = fullscreenData.category;
            const field = fullscreenData.subArray;
            let fieldKey = null;

            if (category === 'motion' || field === 'motion') {
                fieldKey = 'motion';
            } else if (category && field) {
                fieldKey = `${category}.${field}`;
            }

            if (fieldKey) {
                this._syncTextareaDisplay(fieldKey, displayValue);
                notifyFieldKey = fieldKey;
            }
        }

        this._notifyPromptUpdated({ fieldKey: notifyFieldKey });
    }

    _applyArrayValues(fieldName, values) {
        const promptData = this.stateManager.getState().promptData;
        if (!promptData) {
            return;
        }

        if (fieldName === 'objects') {
            if (!promptData.visual_details) {
                promptData.visual_details = {};
            }
            promptData.visual_details.objects = values;
            this._refreshDialogueCharacterOptions();
        } else if (fieldName === 'dialogue') {
            const sanitized = Array.isArray(values)
                ? values.filter(entry => {
                    if (!entry || typeof entry !== 'object') return false;
                    const hasContent = typeof entry.content === 'string' && entry.content.trim().length > 0;
                    const hasCharacters = typeof entry.characters === 'string' && entry.characters.trim().length > 0;
                    return hasContent || hasCharacters;
                })
                : [];
            promptData.dialogue = sanitized;
        } else if (fieldName === 'tags') {
            promptData[fieldName] = values;
        }
    }

    _syncTextareaDisplay(fieldKey, displayValue) {
        if (!fieldKey) {
            return;
        }

        const textarea = this.shadowRoot.querySelector(`textarea[data-field-name="${fieldKey}"]`);
        if (textarea) {
            textarea.value = displayValue != null ? displayValue : '';
        }
    }

    _syncArrayFieldDisplay(fieldName, values) {
        const container = this.shadowRoot.getElementById(`array-${fieldName}`);
        if (!container) {
            return;
        }

        if (fieldName === 'dialogue') {
            const config = container._dialogueConfig || {};
            config.objectOptions = this._getDialogueObjectOptions();
            container._dialogueConfig = config;

            container.innerHTML = '';
            if (Array.isArray(values)) {
                values.forEach((value, idx) => {
                    const item = window.ArrayFieldManager.createDialogueItem(
                        this.shadowRoot,
                        fieldName,
                        value,
                        idx,
                        container
                    );
                    container.appendChild(item);
                });
            }

            window.ArrayFieldManager._updateArrayItemIndexes(container);
            this._attachArrayFieldListeners(this.shadowRoot, 'dialogue');
            return;
        }

        const inputs = container.querySelectorAll('textarea, input');
        inputs.forEach((input, idx) => {
            const storedValue = values[idx] || '';
            if (fieldName === 'tags') {
                input.value = storedValue;
            } else {
                input.value = window.SentenceFormatter ? window.SentenceFormatter.toDisplay(storedValue) : storedValue;
            }
        });
        window.ArrayFieldManager._updateArrayItemIndexes(container);
    }

    _updateArrayItemDisplay(fieldName, index, displayValue) {
        if (index === undefined || index === null) {
            return;
        }

        const container = this.shadowRoot.getElementById(`array-${fieldName}`);
        if (!container) {
            return;
        }

        const input = container.querySelector(`[data-index="${index}"]`);
        if (input) {
            input.value = displayValue != null ? displayValue : '';
        }
    }

    _notifyPromptUpdated(detail = {}) {
        try {
            window.dispatchEvent(new CustomEvent('gvpPromptUpdated', {
                detail: {
                    ...detail,
                    updatedAt: Date.now()
                }
            }));
        } catch (error) {
            window.Logger.error('UIForm', 'Failed to dispatch prompt update event:', error);
        }

        if (window.gvpUIManager && window.gvpUIManager.uiModalManager && typeof window.gvpUIManager.uiModalManager.updateJsonPreview === 'function') {
            window.gvpUIManager.uiModalManager.updateJsonPreview();
        }
    }

    _getDialogueObjectOptions() {
        const state = this.stateManager.getState();
        const objects = state?.promptData?.visual_details?.objects;
        if (!Array.isArray(objects)) {
            return [];
        }

        const extractName = (entry) => {
            if (!entry) return '';
            if (typeof entry === 'string') {
                const [namePart] = entry.split(':');
                return (namePart || entry).trim();
            }

            if (typeof entry === 'object') {
                if (typeof entry.name === 'string') {
                    return entry.name.trim();
                }
                if (typeof entry.title === 'string') {
                    return entry.title.trim();
                }
                if (typeof entry.characters === 'string') {
                    return entry.characters.trim();
                }
            }

            return '';
        };

        const options = objects
            .map(extractName)
            .filter(Boolean)
            .map(name => name.replace(/\s+/g, ' ').trim());

        return Array.from(new Set(options));
    }

    _refreshDialogueCharacterOptions() {
        const container = this.shadowRoot.getElementById('array-dialogue');
        if (!container) {
            return;
        }
        const options = this._getDialogueObjectOptions();
        const config = container._dialogueConfig || {};
        config.objectOptions = options;
        container._dialogueConfig = config;
        window.ArrayFieldManager.updateDialogueCharacterOptions(container, options);
    }

    buildJsonPrompt() {
        const state = this.stateManager.getState();
        const activeCategory = state.ui.activeCategory;

        if (activeCategory === 'Tags') {
            const tagsContainer = this.shadowRoot.getElementById('array-tags');
            if (tagsContainer) {
                const tagValues = window.ArrayFieldManager.getArrayValues(this.shadowRoot, 'tags');
                state.promptData.tags = tagValues;
                window.Logger.debug('UIForm', 'Collected tags before generation:', tagValues);
            }
        }

        if (activeCategory === 'Dialogue') {
            const dialogueContainer = this.shadowRoot.getElementById('array-dialogue');
            if (dialogueContainer) {
                const dialogueValues = window.ArrayFieldManager.getArrayValues(this.shadowRoot, 'dialogue');
                state.promptData.dialogue = dialogueValues;
                window.Logger.debug('UIForm', 'Collected dialogue before generation:', dialogueValues);
            }
        }

        if (activeCategory === 'Visual Details') {
            if (!state.promptData.visual_details) {
                state.promptData.visual_details = {};
            }

            const objectsContainer = this.shadowRoot.getElementById('array-objects');
            if (objectsContainer) {
                state.promptData.visual_details.objects = window.ArrayFieldManager.getArrayValues(this.shadowRoot, 'objects');
            }

            const positioningField = this.shadowRoot.querySelector('textarea[data-field-name="visual_details.positioning"]');
            if (positioningField) {
                const lines = positioningField.value.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
                state.promptData.visual_details.positioning = lines;
            }

            const textElementsField = this.shadowRoot.querySelector('textarea[data-field-name="visual_details.text_elements"]');
            if (textElementsField) {
                const lines = textElementsField.value.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
                state.promptData.visual_details.text_elements = lines;
            }
        }

        if (!state.promptData.tags) {
            state.promptData.tags = [];
        }

        const promptData = state.promptData;
        if (state.settings?.silentMode) {
            if (typeof this.stateManager.applySilentModeAudioDefaults === 'function') {
                this.stateManager.applySilentModeAudioDefaults();
            }
            if (promptData?.audio) {
                promptData.audio = {
                    ...promptData.audio,
                    music: 'none',
                    ambient: 'none',
                    sound_effect: 'none',
                    mix_level: 'No music, no ambient room noise, maximum dialogue audio, medium human sounds.'
                };
            }
        }
        const templatedPrompt = this.stateManager.applyTemplatesToPrompt(promptData);
        const promptJson = JSON.stringify(templatedPrompt);

        window.Logger.debug('UIForm', 'Final JSON tags field:', promptData.tags);
        window.Logger.debug('UIForm', 'Final JSON dialogue field:', promptData.dialogue);

        state.generation.lastPrompt = promptJson;
        return promptJson;
    }

    handleGenerateJson(options = {}) {
        const { allowEmpty = false, promptOverride } = options;

        try {
            let promptJson;

            if (typeof promptOverride === 'string') {
                promptJson = promptOverride;
            } else {
                promptJson = this.buildJsonPrompt();
            }

            if (promptJson === null || promptJson === undefined) {
                window.Logger.warn('UIForm', 'Skipping JSON generation - prompt unavailable');
                return null;
            }

            if (!allowEmpty) {
                const isEmptyString = typeof promptJson === 'string' ? promptJson.length === 0 : false;
                if (promptJson === null || promptJson === undefined || isEmptyString) {
                    window.Logger.warn('UIForm', 'Skipping JSON generation - prompt empty and allowEmpty=false');
                    return null;
                }
            }

            const state = this.stateManager.getState();
            if (state?.generation) {
                state.generation.lastPrompt = promptJson;
            }

            const sendPromise = this.reactAutomation.sendToGenerator(promptJson, false);
            sendPromise.catch(err =>
                window.Logger.error('UIForm', 'Generate JSON error:', err)
            );
            return sendPromise;
        } catch (error) {
            window.Logger.error('UIForm', 'Failed to build JSON prompt:', error);
            return Promise.reject(error);
        }
    }

    // Update UI when JSON data is received from API response
    updateFromApiResponse(newData) {
        const state = this.stateManager.getState();

        // Merge new data with existing state
        if (newData && typeof newData === 'object') {
            state.promptData = { ...state.promptData, ...newData };
            window.Logger.debug('UIForm', 'Updated prompt data from API response');

            // Refresh the current view to show updated data
            this.refreshCurrentView();
        }
    }

    // Refresh current view to reflect state changes
    refreshCurrentView() {
        const state = this.stateManager.getState();
        const activeCategory = state.ui.activeCategory;

        if (activeCategory && this.subArrayContainer) {
            this.subArrayContainer.innerHTML = '';
            this._renderCategoryFields(this.subArrayContainer, activeCategory);
        }
    }
};
