// UITabManager.js - Tab management and switching
// Dependencies: None

window.UITabManager = class UITabManager {
    constructor(shadowRoot, uiManager) {
        this.shadowRoot = shadowRoot;
        this.uiManager = uiManager;
    }

    _createTabs() {
        const tabs = document.createElement('div');
        tabs.id = 'gvp-tabs';
        const tabNames = window.uiConstants.TAB_NAMES;
        tabNames.forEach((name, idx) => {
            const tab = document.createElement('button');
            tab.className = `gvp-tab ${idx === 0 ? 'active' : ''}`;
            tab.textContent = name;
            tab.addEventListener('click', (e) => this.switchTab(e.target.textContent));
            tabs.appendChild(tab);
        });
        return tabs;
    }

    _createTabContent() {
        const tabContent = document.createElement('div');
        tabContent.id = 'gvp-tab-content';

        try {
            // Create all tab content containers
            if (this.uiManager && this.uiManager.uiFormManager) {
                const jsonTab = this.uiManager.uiFormManager._createJsonEditorTab();
                if (jsonTab) {
                    jsonTab.id = 'gvp-tab-JSON';
                    tabContent.appendChild(jsonTab);
                    window.Logger.debug('Tab', 'JSON tab created');
                }
            }

            if (this.uiManager && this.uiManager.uiRawInputManager) {
                const rawTab = this.uiManager.uiRawInputManager._createRawInputTab();
                if (rawTab) {
                    rawTab.id = 'gvp-tab-Raw';
                    rawTab.className = 'gvp-tab-content';
                    rawTab.style.display = 'none';
                    tabContent.appendChild(rawTab);
                    window.Logger.debug('Tab', 'Raw tab created');
                }
            }

            const mergedHistoryTab = this._createMergedHistoryTab();
            if (mergedHistoryTab) {
                tabContent.appendChild(mergedHistoryTab);
                window.Logger.debug('Tab', 'Merged History tab created');
            }
        } catch (error) {
            window.Logger.error('Tab', 'Error creating tab content:', error);
        }

        return tabContent;
    }

    _createMergedHistoryTab() {
        const tab = document.createElement('div');
        tab.id = 'gvp-tab-History';
        tab.className = 'gvp-tab-content';
        tab.style.display = 'none';

        if (this.uiManager && typeof this.uiManager._createHistoryTab === 'function') {
            const content = this.uiManager._createHistoryTab();
            if (content) {
                tab.appendChild(content);
            }
        }
        return tab;
    }

    switchTab(tabName) {
        // Update tab button states
        const tabButtons = Array.from(this.shadowRoot.querySelectorAll('#gvp-tabs .gvp-tab'));
        tabButtons.forEach(btn => {
            if (btn.textContent === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Hide all tab content
        const tabContainers = Array.from(this.shadowRoot.querySelectorAll('.gvp-tab-content'));
        tabContainers.forEach(tab => {
            tab.classList.remove('active');
            tab.style.display = 'none';
        });

        // Show selected tab
        const targetTab = this.shadowRoot.getElementById(`gvp-tab-${tabName}`);
        if (targetTab) {
            targetTab.classList.add('active');
            targetTab.style.display = 'block';
            if (tabName === 'History' && this.uiManager && typeof this.uiManager.refreshHistoryTab === 'function') {
                this.uiManager.refreshHistoryTab(true);
            }
        } else {
            window.Logger.warn('Tab', 'Attempted to switch to missing tab:', tabName);
        }
    }

    _createPlaceholderTab(featureName) {
        const tab = document.createElement('div');
        tab.className = 'gvp-tab-content';
        tab.style.padding = '32px 16px';
        tab.style.textAlign = 'center';
        tab.style.color = 'var(--gvp-text-muted)';

        tab.innerHTML = `
            <div style="font-size: 64px; margin-bottom: 16px;">🚧</div>
            <h3 style="margin: 0 0 16px 0; color: var(--gvp-text-highlight);">${featureName} Coming Soon</h3>
            <p style="font-size: 14px; line-height: 1.6;">
                This feature is currently under development and will be available in a future update.
            </p>
            <p style="font-size: 12px; color: var(--gvp-text-muted); margin-top: 16px;">
                Stay tuned for more awesome features!
            </p>
        `;

        return tab;
    }
};
