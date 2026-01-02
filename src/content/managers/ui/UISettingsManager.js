// UISettingsManager.js - Settings and configuration UI
// Dependencies: StateManager

window.UISettingsManager = class UISettingsManager {
    constructor(stateManager, shadowRoot, uiManager, networkInterceptor, imageProjectManager) {
        this.stateManager = stateManager;
        this.shadowRoot = shadowRoot;
        this.uiManager = uiManager;
        this.networkInterceptor = networkInterceptor;
        this.imageProjectManager = imageProjectManager;
        this._panelElement = null;
    }

    openSettingsPanel() {
        if (!this.shadowRoot) {
            window.Logger.warn('Settings', 'Settings panel cannot open: missing shadowRoot');
            return;
        }

        if (!this._panelElement) {
            this._panelElement = this._createSettingsPanel();
            this.shadowRoot.appendChild(this._panelElement);
        }

        requestAnimationFrame(() => {
            this._panelElement?.classList.add('visible');
        });
    }

    closeSettingsPanel() {
        if (this._panelElement) {
            this._panelElement.classList.remove('visible');
        }
    }

    _createButton(text, variant, onClick) {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.className = 'gvp-button';
        // approximate styles seen in other buttons
        btn.style.width = '100%';
        btn.style.marginTop = '8px';
        btn.style.padding = '8px';
        btn.style.cursor = 'pointer';

        if (variant === 'primary') {
            btn.style.background = 'var(--gvp-btn-primary-bg)';
            btn.style.color = 'white';
        } else {
            btn.style.background = 'var(--gvp-btn-secondary-bg)';
            btn.style.color = 'white';
        }

        if (onClick) btn.addEventListener('click', onClick);
        return btn;
    }

    _createSettingsPanel() {
        const panel = document.createElement('div');
        panel.id = 'gvp-settings-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');

        const container = document.createElement('div');
        container.className = 'gvp-settings-panel-container';

        const header = document.createElement('div');
        header.className = 'gvp-settings-panel-header';

        const title = document.createElement('span');
        title.textContent = 'Settings';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'gvp-button gvp-settings-close-btn';
        closeBtn.innerHTML = '×';
        closeBtn.setAttribute('aria-label', 'Close settings');
        closeBtn.addEventListener('click', () => this.closeSettingsPanel());
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'gvp-settings-panel-body';
        body.appendChild(this._buildSettingsContent());

        container.appendChild(header);
        container.appendChild(body);
        panel.appendChild(container);

        panel.addEventListener('click', (event) => {
            if (event.target === panel) {
                this.closeSettingsPanel();
            }
        });

        this.shadowRoot.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeSettingsPanel();
            }
        });

        return panel;
    }

    _createAccordion(title, contentBuilder, defaultOpen = false) {
        const accordion = document.createElement('div');
        accordion.className = 'gvp-accordion';

        const header = document.createElement('button');
        header.className = 'gvp-accordion-header' + (defaultOpen ? ' active' : '');
        header.innerHTML = `<span>${title}</span><span class="gvp-accordion-icon">▼</span>`;

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'gvp-accordion-content' + (defaultOpen ? ' open' : '');

        const innerContent = document.createElement('div');
        contentBuilder(innerContent);
        contentWrapper.appendChild(innerContent);

        header.addEventListener('click', () => {
            const isOpen = contentWrapper.classList.contains('open');
            header.classList.toggle('active');
            contentWrapper.classList.toggle('open');
        });

        accordion.appendChild(header);
        accordion.appendChild(contentWrapper);
        return accordion;
    }

    _buildSettingsContent() {
        const content = document.createElement('div');
        content.className = 'gvp-settings-content';

        // Dialogue Presets Accordion
        content.appendChild(this._createAccordion('💬 Dialogue Presets', (inner) => {
            const dialogueDesc = document.createElement('p');
            dialogueDesc.style.color = 'var(--gvp-text-muted)';
            dialogueDesc.style.fontSize = '11px';
            dialogueDesc.style.margin = '0 0 12px';
            dialogueDesc.textContent = 'Clear saved accent, language, emotion, and type values to restore the default presets.';
            inner.appendChild(dialogueDesc);

            const resetDialogueBtn = document.createElement('button');
            resetDialogueBtn.className = 'gvp-button';
            resetDialogueBtn.textContent = '♻️ Reset dialogue dropdowns';
            resetDialogueBtn.addEventListener('click', async () => {
                const confirmed = window.confirm('Reset saved dialogue dropdown values and restore defaults?');
                if (!confirmed) {
                    return;
                }

                const originalText = resetDialogueBtn.textContent;
                resetDialogueBtn.disabled = true;
                resetDialogueBtn.textContent = 'Resetting…';

                try {
                    if (window.ArrayFieldManager?.resetDialoguePresetDefaults) {
                        window.ArrayFieldManager.resetDialoguePresetDefaults();
                    }

                    await this.stateManager.clearCustomDropdownValues([
                        'dialogue.accent',
                        'dialogue.language',
                        'dialogue.emotion',
                        'dialogue.type'
                    ]);

                    if (this.uiManager?.uiFormManager?.refreshCurrentView) {
                        this.uiManager.uiFormManager.refreshCurrentView();
                    }

                    alert('Dialogue dropdowns restored to default presets.');
                } catch (error) {
                    window.Logger.error('Settings', 'Failed to reset dialogue dropdown presets:', error);
                    alert('Failed to reset dialogue dropdowns. Check console for details.');
                } finally {
                    resetDialogueBtn.disabled = false;
                    resetDialogueBtn.textContent = originalText;
                }
            });
            inner.appendChild(resetDialogueBtn);
        }));

        // v1.21.31: Gallery Sync Accordion (moved from video player)
        content.appendChild(this._createAccordion('🔄 Gallery Sync', (inner) => {
            const syncDesc = document.createElement('p');
            syncDesc.style.color = 'var(--gvp-text-muted)';
            syncDesc.style.fontSize = '11px';
            syncDesc.style.margin = '0 0 12px';
            syncDesc.textContent = 'Sync all your favorites from Grok to local storage. This fetches your full gallery history.';
            inner.appendChild(syncDesc);

            const syncBtn = document.createElement('button');
            syncBtn.className = 'gvp-button';
            syncBtn.textContent = '🔄 Sync Gallery Now';
            syncBtn.style.width = '100%';
            syncBtn.addEventListener('click', async () => {
                const accountId = this.stateManager?.getActiveMultiGenAccount?.();
                if (!accountId) {
                    alert('No account detected. Please visit your Grok gallery first.');
                    return;
                }

                // Reset sync status to force re-fetch
                this.stateManager?.resetAccountSync?.(accountId);

                const originalText = syncBtn.textContent;
                syncBtn.textContent = '⏳ Syncing...';
                syncBtn.disabled = true;

                try {
                    if (this.networkInterceptor?.triggerBulkGallerySync) {
                        const result = await this.networkInterceptor.triggerBulkGallerySync(accountId, 'favorites');

                        if (result.success) {
                            syncBtn.textContent = `✅ ${result.count} videos synced!`;
                            // Reload unified history from IndexedDB
                            await this.stateManager?.loadUnifiedHistory?.(accountId);

                            setTimeout(() => {
                                syncBtn.textContent = originalText;
                                syncBtn.disabled = false;
                            }, 2000);
                        } else {
                            throw new Error(result.error || 'Sync failed');
                        }
                    } else {
                        throw new Error('NetworkInterceptor not available');
                    }
                } catch (error) {
                    window.Logger.error('Settings', 'Sync failed:', error);
                    syncBtn.textContent = '❌ Sync failed';
                    setTimeout(() => {
                        syncBtn.textContent = originalText;
                        syncBtn.disabled = false;
                    }, 2000);
                }
            });
            inner.appendChild(syncBtn);

            const syncNote = document.createElement('p');
            syncNote.style.color = 'var(--gvp-text-muted)';
            syncNote.style.fontSize = '10px';
            syncNote.style.marginTop = '8px';
            syncNote.style.fontStyle = 'italic';
            syncNote.textContent = 'If sync fails, try refreshing the page and syncing again.';
            inner.appendChild(syncNote);
        }));

        // Data Export/Import Accordion
        content.appendChild(this._createAccordion('💾 Data Export/Import', (inner) => {
            const dataDesc = document.createElement('p');
            dataDesc.style.color = 'var(--gvp-text-muted)';
            dataDesc.style.fontSize = '11px';
            dataDesc.style.margin = '0 0 12px';
            dataDesc.textContent = 'Export all extension data (history, templates, presets, saved prompts) or import from a previously saved file.';
            inner.appendChild(dataDesc);

            const buttonContainer = document.createElement('div');
            buttonContainer.style.display = 'flex';
            buttonContainer.style.gap = '8px';

            const exportBtn = document.createElement('button');
            exportBtn.className = 'gvp-button';
            exportBtn.textContent = '📤 Export All Data';
            exportBtn.addEventListener('click', () => this._exportAllData());
            buttonContainer.appendChild(exportBtn);

            const importBtn = document.createElement('button');
            importBtn.className = 'gvp-button';
            importBtn.textContent = '📥 Import Data';
            importBtn.addEventListener('click', () => this._importDataFromFile());
            buttonContainer.appendChild(importBtn);

            inner.appendChild(buttonContainer);

            // Wipe Presets Section
            const wipeContainer = document.createElement('div');
            wipeContainer.style.marginTop = '16px';
            wipeContainer.style.paddingTop = '12px';
            wipeContainer.style.borderTop = '1px solid #333';

            const wipeDesc = document.createElement('p');
            wipeDesc.style.color = 'var(--gvp-status-error)';
            wipeDesc.style.fontSize = '11px';
            wipeDesc.style.margin = '0 0 8px';
            wipeDesc.textContent = '⚠️ Danger Zone: Delete all saved JSON presets. This cannot be undone!';
            wipeContainer.appendChild(wipeDesc);

            const wipeBtn = document.createElement('button');
            wipeBtn.className = 'gvp-button';
            wipeBtn.textContent = '🗑️ Wipe All Presets';
            wipeBtn.style.background = 'var(--gvp-accent-dark)';
            wipeBtn.style.borderColor = 'var(--gvp-accent-border)';
            wipeBtn.addEventListener('click', () => this._wipeAllPresets());
            wipeContainer.appendChild(wipeBtn);

            inner.appendChild(wipeContainer);
        }, true)); // Default open for easy access

        // v1.21.45: Developer Options Accordion
        content.appendChild(this._createAccordion('🛠️ Developer Options', (inner) => {
            const devDesc = document.createElement('p');
            devDesc.style.color = 'var(--gvp-text-muted)';
            devDesc.style.fontSize = '11px';
            devDesc.style.margin = '0 0 12px';
            devDesc.textContent = 'Advanced options for debugging and development. Enable verbose logging to see detailed console output.';
            inner.appendChild(devDesc);

            // Debug Logging Toggle
            const debugContainer = document.createElement('div');
            debugContainer.style.display = 'flex';
            debugContainer.style.alignItems = 'center';
            debugContainer.style.justifyContent = 'space-between';
            debugContainer.style.padding = '12px';
            debugContainer.style.background = 'var(--gvp-bg-panel)';
            debugContainer.style.borderRadius = '6px';
            debugContainer.style.border = '1px solid #333';

            const debugLabel = document.createElement('div');
            debugLabel.innerHTML = `
                <div style="color: var(--gvp-text-primary); font-size: 13px; font-weight: 500;">🐞 Debug Logging</div>
                <div style="color: var(--gvp-text-muted); font-size: 10px; margin-top: 2px;">Verbose console output for troubleshooting</div>
            `;

            const debugToggle = document.createElement('label');
            debugToggle.style.cssText = `
                position: relative;
                display: inline-block;
                width: 48px;
                height: 26px;
                cursor: pointer;
            `;

            const debugCheckbox = document.createElement('input');
            debugCheckbox.type = 'checkbox';
            debugCheckbox.style.opacity = '0';
            debugCheckbox.style.width = '0';
            debugCheckbox.style.height = '0';
            debugCheckbox.checked = window.GVPLogger?.isDebugEnabled?.() || false;

            const slider = document.createElement('span');
            slider.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: ${debugCheckbox.checked ? 'var(--gvp-status-processing)' : 'var(--gvp-border)'};
                border-radius: 26px;
                transition: background-color 0.3s;
            `;

            const sliderDot = document.createElement('span');
            sliderDot.style.cssText = `
                position: absolute;
                content: '';
                height: 20px;
                width: 20px;
                left: ${debugCheckbox.checked ? '25px' : '3px'};
                bottom: 3px;
                background-color: white;
                border-radius: 50%;
                transition: left 0.3s;
            `;
            slider.appendChild(sliderDot);

            debugCheckbox.addEventListener('change', async (e) => {
                const enabled = e.target.checked;

                // Update visual
                slider.style.backgroundColor = enabled ? 'var(--gvp-status-processing)' : 'var(--gvp-border)';
                sliderDot.style.left = enabled ? '25px' : '3px';

                // Update Logger
                if (window.GVPLogger?.setDebugMode) {
                    await window.GVPLogger.setDebugMode(enabled);
                }

                // Show feedback toast
                if (this.uiManager?.showToast) {
                    this.uiManager.showToast(
                        enabled ? '🐞 Debug logging enabled' : '🔇 Debug logging disabled',
                        enabled ? 'success' : 'info'
                    );
                }
            });

            debugToggle.appendChild(debugCheckbox);
            debugToggle.appendChild(slider);
            debugContainer.appendChild(debugLabel);
            debugContainer.appendChild(debugToggle);
            inner.appendChild(debugContainer);

            // Note about console
            const note = document.createElement('p');
            note.style.color = 'var(--gvp-text-muted)';
            note.style.fontSize = '10px';
            note.style.marginTop = '8px';
            note.style.fontStyle = 'italic';
            note.textContent = 'When enabled, all GVP operations log to the browser console (F12 → Console).';
            inner.appendChild(note);
        }));

        return content;
    }

    _createDebugTab() {
        const tab = document.createElement('div');
        tab.className = 'gvp-tab-content';
        tab.id = 'gvp-debug';
        tab.style.padding = '16px';
        tab.style.fontFamily = 'Courier New, monospace';
        tab.style.fontSize = '11px';

        const sections = [
            {
                title: '🔧 Application State',
                content: () => {
                    const state = this.stateManager.getState();
                    return `
                        <div style="margin-bottom: 16px;">
                            <strong>Version:</strong> v13.10<br>
                            <strong>Debug Mode:</strong> ${state.debugMode ? 'Enabled' : 'Disabled'}<br>
                            <strong>Active Tab:</strong> ${state.activeTab}<br>
                            <strong>UI Open:</strong> ${state.isOpen}<br>
                        </div>
                    `;
                }
            },
            {
                title: '📊 Generation Stats',
                content: () => {
                    const state = this.stateManager.getState();
                    const gen = state.generation;
                    return `
                        <div style="margin-bottom: 16px;">
                            <strong>Status:</strong> ${gen.status}<br>
                            <strong>Mode:</strong> ${gen.useSpicy ? 'Spicy' : 'Normal'}<br>
                            <strong>Current Generation:</strong> ${gen.currentGenerationId || 'None'}<br>
                            <strong>Retry Count:</strong> ${gen.retryCount}<br>
                        </div>
                    `;
                }
            }
        ];

        let content = '<div style="color: var(--gvp-text-highlight); font-weight: bold; margin-bottom: 16px;">🚀 Grok Video Prompter Debug Panel</div>';

        sections.forEach(section => {
            content += `
                <div style="background: var(--gvp-bg-deep); border: 1px solid #333; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                    <div style="color: var(--gvp-text-highlight); font-weight: bold; margin-bottom: 8px;">${section.title}</div>
                    <div style="color: var(--gvp-text-secondary);">${section.content()}</div>
                </div>
            `;
        });

        tab.innerHTML = content;
        return tab;
    }

    createCheckboxSetting(container, id, labelText, checked, onChange) {
        const checkboxContainer = document.createElement('div');
        checkboxContainer.className = 'gvp-checkbox-container';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = id;
        checkbox.checked = checked;
        checkbox.addEventListener('change', (e) => onChange(e.target.checked));

        const label = document.createElement('label');
        label.htmlFor = id;
        label.textContent = labelText;

        checkboxContainer.appendChild(checkbox);
        checkboxContainer.appendChild(label);
        container.appendChild(checkboxContainer);
    }

    createAspectRatioSelector(container) {
        const group = document.createElement('div');
        group.className = 'gvp-form-group';
        group.style.marginBottom = '16px';

        const label = document.createElement('label');
        label.className = 'gvp-label';
        label.textContent = 'Default Aspect Ratio';
        group.appendChild(label);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.marginTop = '8px';

        const aspects = ['portrait', 'landscape', 'square'];
        const currentAspect = this.stateManager.getState().settings.auroraAspectRatio || 'square';

        aspects.forEach(aspect => {
            const btn = document.createElement('button');
            btn.className = 'gvp-button';
            btn.textContent = aspect.charAt(0).toUpperCase() + aspect.slice(1);
            btn.style.flex = '1';

            if (aspect === currentAspect) {
                btn.style.backgroundColor = 'var(--gvp-btn-info-bg)';
                btn.style.color = 'white';
                btn.style.borderColor = 'var(--gvp-btn-info-bg)';
            }

            btn.addEventListener('click', () => {
                buttonContainer.querySelectorAll('button').forEach(b => {
                    b.style.backgroundColor = 'var(--gvp-bg-input)';
                    b.style.color = 'var(--gvp-text-secondary)';
                    b.style.borderColor = 'var(--gvp-border)';
                });

                btn.style.backgroundColor = 'var(--gvp-btn-info-bg)';
                btn.style.color = 'white';
                btn.style.borderColor = 'var(--gvp-btn-info-bg)';

                this.stateManager.getState().settings.auroraAspectRatio = aspect;
                this.stateManager.saveSettings();
                window.Logger.info('Aurora', `Aspect ratio set to: ${aspect}`);
            });

            buttonContainer.appendChild(btn);
        });

        group.appendChild(buttonContainer);
        container.appendChild(group);
    }

    createAuroraBlankPngConfig(container) {
        const group = document.createElement('div');
        group.className = 'gvp-form-group';
        group.style.marginTop = '16px';
        group.style.padding = '12px';
        group.style.backgroundColor = 'var(--gvp-bg-deep)';
        group.style.borderRadius = '6px';
        group.style.border = '1px solid #333';

        const title = document.createElement('div');
        title.className = 'gvp-label';
        title.textContent = '🖼️ Aurora Image Configuration';
        title.style.marginBottom = '12px';
        group.appendChild(title);

        const note = document.createElement('p');
        note.style.color = 'var(--gvp-text-muted)';
        note.style.fontSize = '10px';
        note.style.marginBottom = '12px';
        note.textContent = 'Choose images for Aurora injection. These can be blank PNGs or any custom images you want to use as starting points.';
        group.appendChild(note);

        // Image Mode Toggle
        const toggleContainer = document.createElement('div');
        toggleContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 16px;
            padding: 12px;
            background: linear-gradient(135deg, var(--gvp-bg-element) 0%, var(--gvp-bg-deep) 100%);
            border-radius: 8px;
            border: 1px solid var(--gvp-border);
        `;

        const toggleLabel = document.createElement('div');
        toggleLabel.style.cssText = `
            font-size: 11px;
            color: var(--gvp-text-secondary);
            font-weight: 500;
            letter-spacing: 0.5px;
        `;
        toggleLabel.textContent = 'IMAGE MODE:';

        const toggleSwitch = document.createElement('div');
        toggleSwitch.style.cssText = `
            position: relative;
            width: 240px;
            height: 32px;
            background: var(--gvp-bg-element);
            border-radius: 16px;
            cursor: pointer;
            border: 1px solid var(--gvp-border);
            display: flex;
            align-items: center;
            transition: all 0.3s ease;
        `;

        const toggleSlider = document.createElement('div');
        toggleSlider.style.cssText = `
            position: absolute;
            width: 120px;
            height: 28px;
            background: var(--gvp-bg-secondary);
            border-radius: 14px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
            left: 2px;
        `;

        const optionLeft = document.createElement('div');
        optionLeft.style.cssText = `
            position: absolute;
            left: 0;
            width: 120px;
            text-align: center;
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 0.5px;
            z-index: 1;
            transition: color 0.3s ease;
            color: #fff;
            line-height: 32px;
        `;
        optionLeft.textContent = '🎨 BLANK PNG';

        const optionRight = document.createElement('div');
        optionRight.style.cssText = `
            position: absolute;
            right: 0;
            width: 120px;
            text-align: center;
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 0.5px;
            z-index: 1;
            transition: color 0.3s ease;
            color: var(--gvp-btn-secondary-bg);
            line-height: 32px;
        `;
        optionRight.textContent = '🖼️ CUSTOM';

        toggleSwitch.appendChild(toggleSlider);
        toggleSwitch.appendChild(optionLeft);
        toggleSwitch.appendChild(optionRight);

        // Initialize from settings
        const currentMode = this.stateManager.getState().settings.auroraImageMode || 'blank';
        const updateToggleVisual = (mode) => {
            if (mode === 'custom') {
                toggleSlider.style.left = '118px';
                toggleSlider.style.background = 'var(--gvp-border)';
                toggleSlider.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.55)';
                optionLeft.style.color = 'var(--gvp-text-secondary)';
                optionRight.style.color = 'var(--gvp-text-primary)';
            } else {
                toggleSlider.style.left = '2px';
                toggleSlider.style.background = 'var(--gvp-bg-secondary)';
                toggleSlider.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.45)';
                optionLeft.style.color = 'var(--gvp-text-primary)';
                optionRight.style.color = 'var(--gvp-text-secondary)';
            }
        };

        updateToggleVisual(currentMode);

        toggleSwitch.addEventListener('click', () => {
            const settings = this.stateManager.getState().settings;
            const newMode = settings.auroraImageMode === 'custom' ? 'blank' : 'custom';
            settings.auroraImageMode = newMode;
            this.stateManager.saveSettings();
            updateToggleVisual(newMode);
            window.Logger.info('Aurora', `Image mode switched to: ${newMode}`);

            // Broadcast state change to page immediately
            if (window.gvpApp && typeof window.gvpApp.broadcastAuroraState === 'function') {
                window.gvpApp.broadcastAuroraState();
            }
        });

        toggleContainer.appendChild(toggleLabel);
        toggleContainer.appendChild(toggleSwitch);
        group.appendChild(toggleContainer);

        // Helper function to create image picker section
        const createImageSection = (sectionTitle, keyPrefix, aspects) => {
            const section = document.createElement('div');
            section.style.marginBottom = '20px';
            section.style.padding = '12px';
            section.style.backgroundColor = 'var(--gvp-bg-deep)';
            section.style.borderRadius = '6px';
            section.style.border = '1px solid var(--gvp-bg-element)';

            const sectionLabel = document.createElement('div');
            sectionLabel.className = 'gvp-label';
            sectionLabel.textContent = sectionTitle;
            sectionLabel.style.fontSize = '10px';
            sectionLabel.style.color = 'var(--gvp-text-secondary)';
            sectionLabel.style.marginBottom = '12px';
            sectionLabel.style.textTransform = 'uppercase';
            sectionLabel.style.letterSpacing = '1px';
            section.appendChild(sectionLabel);

            aspects.forEach(({ key, label, icon }) => {
                const fullKey = keyPrefix + key;
                createImagePicker(section, fullKey, label, icon);
            });

            return section;
        };

        // Helper function to create individual image picker
        const createImagePicker = (parent, key, label, icon) => {
            const fieldGroup = document.createElement('div');
            fieldGroup.style.marginBottom = '16px';
            fieldGroup.style.padding = '10px';
            fieldGroup.style.backgroundColor = 'var(--gvp-bg-element)';
            fieldGroup.style.borderRadius = '4px';
            fieldGroup.style.border = '1px solid var(--gvp-border)';

            const fieldLabel = document.createElement('div');
            fieldLabel.className = 'gvp-label';
            fieldLabel.textContent = `${icon} ${label}`;
            fieldLabel.style.fontSize = '11px';
            fieldLabel.style.marginBottom = '8px';
            fieldGroup.appendChild(fieldLabel);

            // Button row
            const btnRow = document.createElement('div');
            btnRow.style.display = 'flex';
            btnRow.style.gap = '8px';
            btnRow.style.marginBottom = '8px';

            // File picker button
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/png,image/jpeg,image/jpg,image/webp';
            fileInput.style.display = 'none';

            const pickBtn = document.createElement('button');
            pickBtn.className = 'gvp-button';
            pickBtn.textContent = '📁 Choose Image';
            pickBtn.style.fontSize = '10px';
            pickBtn.style.padding = '6px 12px';
            pickBtn.addEventListener('click', () => fileInput.click());

            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    let base64 = event.target.result;
                    // Remove data:image/...;base64, prefix
                    if (base64.includes(',')) {
                        base64 = base64.split(',')[1];
                    }

                    this.stateManager.getState().settings[key] = base64;
                    this.stateManager.saveSettings();

                    // Update preview
                    if (preview.src) URL.revokeObjectURL(preview.src);
                    preview.src = URL.createObjectURL(file);
                    preview.style.display = 'block';
                    clearBtn.style.display = 'inline-block';

                    window.Logger.info('Aurora', `Updated ${key} from file: ${file.name}`);
                };
                reader.readAsDataURL(file);
            });

            // Clear button
            const clearBtn = document.createElement('button');
            clearBtn.className = 'gvp-button';
            clearBtn.textContent = '🗑️ Clear';
            clearBtn.style.fontSize = '10px';
            clearBtn.style.padding = '6px 12px';
            clearBtn.style.display = this.stateManager.getState().settings[key] ? 'inline-block' : 'none';
            clearBtn.addEventListener('click', () => {
                this.stateManager.getState().settings[key] = '';
                this.stateManager.saveSettings();
                preview.style.display = 'none';
                clearBtn.style.display = 'none';
                window.Logger.info('Aurora', `Cleared ${key}`);
            });

            btnRow.appendChild(pickBtn);
            btnRow.appendChild(clearBtn);
            fieldGroup.appendChild(fileInput);
            fieldGroup.appendChild(btnRow);

            // Image preview
            const preview = document.createElement('img');
            preview.style.maxWidth = '150px';
            preview.style.maxHeight = '150px';
            preview.style.border = '2px solid var(--gvp-border)';
            preview.style.borderRadius = '4px';
            preview.style.marginTop = '8px';
            preview.style.display = 'none';

            // Show existing image if available
            const existingBase64 = this.stateManager.getState().settings[key];
            if (existingBase64) {
                preview.src = `data:image/png;base64,${existingBase64}`;
                preview.style.display = 'block';
            }

            fieldGroup.appendChild(preview);
            parent.appendChild(fieldGroup);
        };

        // Define aspect ratios
        const aspects = [
            { key: 'Portrait', label: 'Portrait (9:16)', icon: '📱' },
            { key: 'Landscape', label: 'Landscape (16:9)', icon: '🖼️' },
            { key: 'Square', label: 'Square (1:1)', icon: '⬜' }
        ];

        // Create Blank PNG section
        const blankSection = createImageSection('🎨 Blank PNG Images', 'auroraBlankPng', aspects);
        group.appendChild(blankSection);

        // Create Custom Images section
        const customSection = createImageSection('🖼️ Custom Images', 'auroraCustomImage', aspects);
        group.appendChild(customSection);

        // Nested accordion for base64 input (advanced)
        const advancedAccordion = this._createNestedAccordion('🔧 Advanced: Manual Base64 Input', () => {
            const advancedGroup = document.createElement('div');
            advancedGroup.style.padding = '12px';
            advancedGroup.style.backgroundColor = '#151925';
            advancedGroup.style.borderRadius = '4px';
            advancedGroup.style.marginTop = '8px';

            const advNote = document.createElement('p');
            advNote.style.color = '#888';
            advNote.style.fontSize = '9px';
            advNote.style.marginBottom = '12px';
            advNote.textContent = 'For advanced users: Paste base64-encoded image data directly (without data:image/png;base64, prefix)';
            advancedGroup.appendChild(advNote);

            aspects.forEach(({ key, label }) => {
                const fieldGroup = document.createElement('div');
                fieldGroup.style.marginBottom = '12px';

                const fieldLabel = document.createElement('label');
                fieldLabel.className = 'gvp-label';
                fieldLabel.textContent = label;
                fieldLabel.style.fontSize = '10px';
                fieldGroup.appendChild(fieldLabel);

                const textarea = document.createElement('textarea');
                textarea.className = 'gvp-textarea';
                textarea.placeholder = `Paste ${label.toLowerCase()} base64...`;
                textarea.rows = 2;
                textarea.style.fontSize = '9px';
                textarea.style.fontFamily = 'Courier New, monospace';
                textarea.value = this.stateManager.getState().settings[key] || '';

                textarea.addEventListener('input', (e) => {
                    this.stateManager.getState().settings[key] = e.target.value.trim();
                    this.stateManager.saveSettings();
                    window.Logger.info('Aurora', `Updated ${key} via base64`);
                });

                fieldGroup.appendChild(textarea);
                advancedGroup.appendChild(fieldGroup);
            });

            return advancedGroup;
        });

        group.appendChild(advancedAccordion);
        container.appendChild(group);
    }

    _createNestedAccordion(title, contentBuilder) {
        const accordion = document.createElement('div');
        accordion.className = 'gvp-nested-accordion';
        accordion.style.marginTop = '12px';
        accordion.style.border = '1px solid #2a2f45';
        accordion.style.borderRadius = '4px';
        accordion.style.overflow = 'hidden';

        const header = document.createElement('div');
        header.style.padding = '8px 12px';
        header.style.backgroundColor = '#1a1f35';
        header.style.cursor = 'pointer';
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.fontSize = '10px';
        header.style.fontWeight = '600';
        header.style.color = '#888';
        header.style.userSelect = 'none';

        const arrow = document.createElement('span');
        arrow.textContent = '▶';
        arrow.style.marginRight = '8px';
        arrow.style.transition = 'transform 0.2s';
        arrow.style.fontSize = '8px';

        const titleSpan = document.createElement('span');
        titleSpan.textContent = title;

        header.appendChild(arrow);
        header.appendChild(titleSpan);

        const content = document.createElement('div');
        content.style.display = 'none';
        content.style.padding = '0';
        content.appendChild(contentBuilder());

        let isOpen = false;
        header.addEventListener('click', () => {
            isOpen = !isOpen;
            content.style.display = isOpen ? 'block' : 'none';
            arrow.style.transform = isOpen ? 'rotate(90deg)' : 'rotate(0deg)';
        });

        accordion.appendChild(header);
        accordion.appendChild(content);

        return accordion;
    }

    _applySilentModeAudioDefaults() {
        if (this.stateManager && typeof this.stateManager.applySilentModeAudioDefaults === 'function') {
            this.stateManager.applySilentModeAudioDefaults();
            return;
        }

        const state = this.stateManager.getState();
        state.promptData.audio = state.promptData.audio || {};
        state.promptData.audio.music = 'none';
        state.promptData.audio.ambient = 'none';
        state.promptData.audio.sound_effect = 'none';
        state.promptData.audio.mix_level = 'No music, no ambient room noise, maximum dialogue audio, medium human sounds.';
    }

    _handleSilentModeToggle(isEnabled) {
        const enabled = !!isEnabled;
        if (this.uiManager && typeof this.uiManager.setSilentMode === 'function') {
            this.uiManager.setSilentMode(enabled, { from: 'settings' });
            return;
        }

        const state = this.stateManager.getState();
        state.settings.silentMode = enabled;
        if (enabled) {
            this._applySilentModeAudioDefaults();
        }
        this.stateManager.saveSettings();
        this._syncAudioFieldsWithState();
        if (this.uiManager && typeof this.uiManager.updateVoiceOnlyIndicator === 'function') {
            this.uiManager.updateVoiceOnlyIndicator(enabled);
        }
        window.Logger.info('Settings', `Silent mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    syncSilentModeUI(isEnabled) {
        const checkbox = this.shadowRoot?.getElementById('gvp-silent-mode-checkbox');
        if (checkbox) {
            checkbox.checked = !!isEnabled;
        }
        this._syncAudioFieldsWithState();
    }

    _syncAudioFieldsWithState() {
        if (!this.shadowRoot) {
            return;
        }

        const audio = this.stateManager.getState().promptData?.audio || {};
        const mapping = {
            'audio.music': audio.music || '',
            'audio.ambient': audio.ambient || '',
            'audio.sound_effect': audio.sound_effect || '',
            'audio.mix_level': audio.mix_level || ''
        };

        Object.entries(mapping).forEach(([fieldKey, value]) => {
            const textarea = this.shadowRoot.querySelector(`textarea[data-field-name="${fieldKey}"]`);
            if (textarea) {
                textarea.value = value;
            }
        });
    }

    async _exportAllData() {
        try {
            window.Logger.info('Settings', 'Starting data export...');

            // Gather all data from chrome.storage
            const storageKeys = [
                'gvp-settings',
                'gvp-recent-prompts',
                'gvp-saved-prompts',
                'gvp-custom-dropdown-values',
                'gvp-image-projects',
                'gvp_active_generations',
                'gvp_completed_generations',
                'gvp_generation_stats',
                'gvp_last_sync'
            ];

            const storageData = await chrome.storage.local.get(storageKeys);

            // Create export object with metadata
            const exportData = {
                version: '1.7.26', // Current extension version
                exportDate: new Date().toISOString(),
                data: storageData
            };

            // Convert to JSON and download
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `GVP_Export_${new Date().toISOString().split('T')[0]}.json`;
            a.click();

            URL.revokeObjectURL(url);

            window.Logger.info('Settings', 'Export complete!', { keys: Object.keys(storageData) });
            alert(`✅ Export complete!\n\nExported ${Object.keys(storageData).length} data items.\n\nFile: ${a.download}`);
        } catch (error) {
            window.Logger.error('Settings', 'Export failed:', error);
            alert(`❌ Export failed: ${error.message}`);
        }
    }

    async _importDataFromFile() {
        try {
            // Create file input
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json,.json';

            input.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                window.Logger.info('Settings', 'Reading file:', file.name);

                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const jsonData = JSON.parse(event.target.result);

                        // Validate export format
                        if (!jsonData.data || !jsonData.version) {
                            throw new Error('Invalid export file format');
                        }

                        // Confirm before overwriting
                        const itemCount = Object.keys(jsonData.data).length;
                        const confirm = window.confirm(
                            `⚠️ Import Data?\n\n` +
                            `This will OVERWRITE existing data:\n` +
                            `• History and Generations\n` +
                            `• Templates and Presets\n` +
                            `• Saved Prompts\n` +
                            `• Custom Dropdowns\n\n` +
                            `File: ${file.name}\n` +
                            `Export Date: ${new Date(jsonData.exportDate).toLocaleString()}\n` +
                            `Items: ${itemCount}\n\n` +
                            `Continue?`
                        );

                        if (!confirm) {
                            window.Logger.info('Settings', 'Import cancelled by user');
                            return;
                        }

                        // Import data to chrome.storage
                        try {
                            await chrome.storage.local.set(jsonData.data);

                            window.Logger.info('Settings', 'Import complete!', { items: itemCount });

                            alert(
                                `✅ Import complete!\n\n` +
                                `Imported ${itemCount} data items.\n\n` +
                                `⚠️ Please RELOAD the page to apply changes.`
                            );

                            // Optionally reload automatically after confirmation
                            const reload = window.confirm('Reload page now to apply changes?');
                            if (reload) {
                                window.location.reload();
                            }
                        } catch (storageError) {
                            window.Logger.error('Settings', 'Storage error:', storageError);
                            if (storageError.message.includes('context invalidated')) {
                                alert(
                                    `❌ Import failed: Extension context invalidated\n\n` +
                                    `The extension was reloaded during import.\n\n` +
                                    `To fix:\n` +
                                    `1. Close this Settings panel\n` +
                                    `2. Close the GVP drawer (minimize button)\n` +
                                    `3. Reopen GVP and try importing again`
                                );
                            } else {
                                alert(`❌ Import failed: ${storageError.message}`);
                            }
                        }
                    } catch (parseError) {
                        window.Logger.error('Settings', 'Failed to parse file:', parseError);
                        alert(`❌ Import failed: ${parseError.message}`);
                    }
                };

                reader.onerror = () => {
                    window.Logger.error('Settings', 'Failed to read file');
                    alert('❌ Failed to read file');
                };

                reader.readAsText(file);
            });

            input.click();
        } catch (error) {
            window.Logger.error('Settings', 'Import failed:', error);
            alert(`❌ Import failed: ${error.message}`);
        }
    }

    async _wipeAllPresets() {
        try {
            const presets = this.stateManager.getJsonPresets();
            const count = presets.length;

            if (count === 0) {
                window.gvpUIManager?.uiModalManager?.showInfo('No presets to delete.');
                return;
            }

            const confirmed = window.confirm(
                `⚠️ DELETE ALL PRESETS?\n\n` +
                `This will permanently delete ${count} saved preset${count === 1 ? '' : 's'}:\n` +
                `${presets.map(p => `• ${p.name}`).join('\n')}\n\n` +
                `This action CANNOT be undone!\n\n` +
                `Continue?`
            );

            if (!confirmed) {
                window.Logger.info('Settings', 'Preset wipe cancelled by user');
                return;
            }

            // Clear presets from StateManager
            this.stateManager.state.settings.jsonPresets = [];
            await this.stateManager.saveSettings();

            window.Logger.warn('Settings', 'All presets wiped', { count });

            window.gvpUIManager?.uiModalManager?.showSuccess(
                `✅ Deleted ${count} preset${count === 1 ? '' : 's'}!`
            );

            // Refresh preset dropdown if UIFormManager exists
            if (window.gvpUIManager?.uiFormManager?._populateJsonPresetSelect) {
                window.gvpUIManager.uiFormManager._populateJsonPresetSelect();
            }
        } catch (error) {
            window.Logger.error('Settings', 'Wipe presets failed:', error);
            window.gvpUIManager?.uiModalManager?.showError(`❌ Wipe failed: ${error.message}`);
        }
    }
};
