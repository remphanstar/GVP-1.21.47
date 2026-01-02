/**
/**
 * IndexedDBManager.js
 * Handles unlimited storage using IndexedDB for large datasets
 * Replaces chrome.storage.local for multi-gen history and progress tracking
 */

window.IndexedDBManager = class IndexedDBManager {
    constructor() {
        this.dbName = 'GrokVideoPrompter';
        this.dbVersion = 12; // v12: Stable unified store creation and safe cleanup
        this.db = null;
        this.initialized = false;
        this.migrationComplete = false;

        // Object store names
        this.STORES = {
            MULTI_GEN_HISTORY: 'multiGenHistory',
            PROGRESS_TRACKING: 'progressTracking',
            SETTINGS_BACKUP: 'settingsBackup',
            GALLERY_DATA: 'galleryData',
            IMAGE_PROJECTS: 'imageProjects',
            JSON_PRESETS: 'jsonPresets',
            RAW_TEMPLATES: 'rawTemplates',
            SAVED_PROMPT_SLOTS: 'savedPromptSlots',       // v4
            CUSTOM_DROPDOWNS: 'customDropdownOptions',    // v4
            CUSTOM_OBJECTS: 'customObjects',              // v4
            CUSTOM_DIALOGUES: 'customDialogues',          // v4
            UNIFIED_VIDEO_HISTORY: 'unifiedVideoHistory'  // v6
        };

        // Storage limits (from HANDOVER.md)
        this.LIMITS = {
            MAX_IMAGES: 36,                    // Total images tracked in multi-gen history
            MAX_ATTEMPTS_PER_IMAGE: 6,         // Max attempts per image
            MAX_PROGRESS_SAMPLES: 25,          // Max progress events per generation
            MAX_PAYLOAD_SIZE: 10000,           // Max chars for raw stream/payload data
            MAX_GALLERY_POSTS: 100000,         // Effectively unlimited (was 200)
            MAX_IMAGE_PROJECT_AGE_DAYS: 90,    // Days to keep image project history
            CLEANUP_BATCH_SIZE: 10             // Items to process per cleanup batch
        };
    }

    /**
     * Initialize IndexedDB and create object stores
     */
    async initialize() {
        if (this.initialized) {
            return true;
        }

        try {
            console.log('[GVP IndexedDB] Initializing database...');

            this.db = await this._openDatabase();
            this.initialized = true;

            console.log('[GVP IndexedDB] ✅ Database initialized successfully');

            // Check if migration needed
            await this._checkMigrationStatus();

            // Check if migration needed
            await this._checkMigrationStatus();

            // Legacy cleanup removed (stores deleted in v9)
            // this.cleanupOldProgress(24 * 60 * 60 * 1000)...

            return true;
        } catch (error) {
            console.error('[GVP IndexedDB] ❌ Initialization failed:', error);
            this.initialized = false;
            return false;
        }
    }

    /**
     * Open or create the IndexedDB database
     */
    _openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                reject(new Error(`IndexedDB open failed: ${request.error}`));
            };

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onupgradeneeded = (event) => {
                const oldVersion = event.oldVersion;
                console.log(`[GVP IndexedDB] Upgrading database schema from v${oldVersion} to v${event.newVersion}...`);
                const db = event.target.result;
                const transaction = event.target.transaction;

                // Helper to ensure unified store exists (and indexes) before any migrations that touch it
                const ensureUnifiedStore = () => {
                    let unifiedStoreRef = null;
                    if (!db.objectStoreNames.contains(this.STORES.UNIFIED_VIDEO_HISTORY)) {
                        unifiedStoreRef = db.createObjectStore(this.STORES.UNIFIED_VIDEO_HISTORY, { keyPath: 'imageId' });
                        unifiedStoreRef.createIndex('accountId', 'accountId', { unique: false });
                        unifiedStoreRef.createIndex('updatedAt', 'updatedAt', { unique: false });
                        unifiedStoreRef.createIndex('createdAt', 'createdAt', { unique: false });
                        console.log('[GVP IndexedDB] Created unifiedVideoHistory store');
                    } else {
                        unifiedStoreRef = transaction.objectStore(this.STORES.UNIFIED_VIDEO_HISTORY);
                        if (!unifiedStoreRef.indexNames.contains('accountId')) {
                            unifiedStoreRef.createIndex('accountId', 'accountId', { unique: false });
                            console.log('[GVP IndexedDB] Added accountId index to unifiedVideoHistory');
                        }
                        if (!unifiedStoreRef.indexNames.contains('updatedAt')) {
                            unifiedStoreRef.createIndex('updatedAt', 'updatedAt', { unique: false });
                            console.log('[GVP IndexedDB] Added updatedAt index to unifiedVideoHistory');
                        }
                        if (!unifiedStoreRef.indexNames.contains('createdAt')) {
                            unifiedStoreRef.createIndex('createdAt', 'createdAt', { unique: false });
                            console.log('[GVP IndexedDB] Added createdAt index to unifiedVideoHistory');
                        }
                    }
                    return unifiedStoreRef;
                };

                // V1 Schema: multiGenHistory, progressTracking, settingsBackup
                if (!db.objectStoreNames.contains(this.STORES.MULTI_GEN_HISTORY)) {
                    const historyStore = db.createObjectStore(this.STORES.MULTI_GEN_HISTORY, { keyPath: 'imageId' });
                    historyStore.createIndex('accountId', 'accountId', { unique: false });
                    historyStore.createIndex('timestamp', 'timestamp', { unique: false });
                    historyStore.createIndex('status', 'status', { unique: false });
                    console.log('[GVP IndexedDB] Created multiGenHistory store');
                } else if (event.oldVersion < 2) {
                    // V2 upgrade: Add status index to existing store
                    const historyStore = transaction.objectStore(this.STORES.MULTI_GEN_HISTORY);
                    if (!historyStore.indexNames.contains('status')) {
                        historyStore.createIndex('status', 'status', { unique: false });
                        console.log('[GVP IndexedDB] Added status index to multiGenHistory');
                    }
                }

                if (!db.objectStoreNames.contains(this.STORES.PROGRESS_TRACKING)) {
                    const progressStore = db.createObjectStore(this.STORES.PROGRESS_TRACKING, { keyPath: 'generationId' });
                    progressStore.createIndex('imageId', 'imageId', { unique: false });
                    progressStore.createIndex('timestamp', 'timestamp', { unique: false });
                    progressStore.createIndex('status', 'status', { unique: false });
                    console.log('[GVP IndexedDB] Created progressTracking store');
                } else if (event.oldVersion < 2) {
                    // V2 upgrade: Add indexes to existing store
                    const progressStore = transaction.objectStore(this.STORES.PROGRESS_TRACKING);
                    if (!progressStore.indexNames.contains('imageId')) {
                        progressStore.createIndex('imageId', 'imageId', { unique: false });
                        console.log('[GVP IndexedDB] Added imageId index to progressTracking');
                    }
                    if (!progressStore.indexNames.contains('timestamp')) {
                        progressStore.createIndex('timestamp', 'timestamp', { unique: false });
                        console.log('[GVP IndexedDB] Added timestamp index to progressTracking');
                    }
                    if (!progressStore.indexNames.contains('status')) {
                        progressStore.createIndex('status', 'status', { unique: false });
                        console.log('[GVP IndexedDB] Added status index to progressTracking');
                    }
                }

                if (!db.objectStoreNames.contains(this.STORES.SETTINGS_BACKUP)) {
                    db.createObjectStore(this.STORES.SETTINGS_BACKUP, { keyPath: 'key' });
                    console.log('[GVP IndexedDB] Created settingsBackup store');
                }

                // V2 Schema: New stores
                if (event.oldVersion < 2) {
                    if (!db.objectStoreNames.contains(this.STORES.GALLERY_DATA)) {
                        const galleryStore = db.createObjectStore(this.STORES.GALLERY_DATA, { keyPath: 'postId' });
                        galleryStore.createIndex('accountId', 'accountId', { unique: false });
                        galleryStore.createIndex('timestamp', 'timestamp', { unique: false });
                        console.log('[GVP IndexedDB] Created galleryData store');
                    }

                    if (!db.objectStoreNames.contains(this.STORES.IMAGE_PROJECTS)) {
                        const projectsStore = db.createObjectStore(this.STORES.IMAGE_PROJECTS, { keyPath: 'compositeKey' });
                        projectsStore.createIndex('accountId', 'accountId', { unique: false });
                        projectsStore.createIndex('imageId', 'imageId', { unique: false });
                        projectsStore.createIndex('timestamp', 'timestamp', { unique: false });
                        console.log('[GVP IndexedDB] Created imageProjects store');
                    }
                }

                // V3 Schema: JSON Presets & Raw Templates
                if (event.oldVersion < 3) {
                    if (!db.objectStoreNames.contains(this.STORES.JSON_PRESETS)) {
                        const presetStore = db.createObjectStore(this.STORES.JSON_PRESETS, { keyPath: 'name' });
                        presetStore.createIndex('savedAt', 'savedAt', { unique: false });
                        console.log('[GVP IndexedDB] Created jsonPresets store');
                    }

                    if (!db.objectStoreNames.contains(this.STORES.RAW_TEMPLATES)) {
                        const templateStore = db.createObjectStore(this.STORES.RAW_TEMPLATES, { keyPath: 'id' });
                        templateStore.createIndex('name', 'name', { unique: false });
                        console.log('[GVP IndexedDB] Created rawTemplates store');
                    }
                }

                // V4 Schema: Saved Prompt Slots, Custom Dropdowns, Custom Objects/Dialogues
                if (event.oldVersion < 4) {
                    const unifiedStore = ensureUnifiedStore();

                    if (!db.objectStoreNames.contains(this.STORES.SAVED_PROMPT_SLOTS)) {
                        const slotsStore = db.createObjectStore(this.STORES.SAVED_PROMPT_SLOTS, { keyPath: 'slotId' });
                        slotsStore.createIndex('active', 'active', { unique: false });
                        slotsStore.createIndex('timestamp', 'timestamp', { unique: false });
                        console.log('[GVP IndexedDB] Created savedPromptSlots store');
                    }

                    if (!db.objectStoreNames.contains(this.STORES.CUSTOM_DROPDOWNS)) {
                        db.createObjectStore(this.STORES.CUSTOM_DROPDOWNS, { keyPath: 'category' });
                        console.log('[GVP IndexedDB] Created customDropdownOptions store');
                    }

                    if (!db.objectStoreNames.contains(this.STORES.CUSTOM_OBJECTS)) {
                        const objectsStore = db.createObjectStore(this.STORES.CUSTOM_OBJECTS, { keyPath: 'id' });
                        objectsStore.createIndex('timestamp', 'timestamp', { unique: false });
                        console.log('[GVP IndexedDB] Created customObjects store');
                    }

                    if (!db.objectStoreNames.contains(this.STORES.CUSTOM_DIALOGUES)) {
                        const dialoguesStore = db.createObjectStore(this.STORES.CUSTOM_DIALOGUES, { keyPath: 'id' });
                        const multiGenStore = transaction.objectStore(this.STORES.MULTI_GEN_HISTORY);
                        multiGenStore.openCursor().onsuccess = (e) => {
                            const cursor = e.target.result;
                            if (cursor) {
                                const entry = cursor.value;
                                // Transform to Unified Schema
                                const unifiedEntry = {
                                    imageId: entry.imageId,
                                    accountId: entry.accountId || 'unknown',
                                    updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString(),
                                    thumbnailUrl: entry.thumbnailUrl || '',
                                    prompt: entry.prompt || '',
                                    attempts: entry.attempts || [],
                                    projectSettings: {}, // Will be populated from imageProjects
                                    galleryMeta: {}      // Will be populated from galleryData
                                };
                                unifiedStore.put(unifiedEntry);
                                cursor.continue();
                            }
                        };
                    }

                    // 2. Migrate ImageProjects (Merge settings)
                    if (db.objectStoreNames.contains(this.STORES.IMAGE_PROJECTS)) {
                        const projectsStore = transaction.objectStore(this.STORES.IMAGE_PROJECTS);
                        projectsStore.openCursor().onsuccess = (e) => {
                            const cursor = e.target.result;
                            if (cursor) {
                                const project = cursor.value;
                                if (project.imageId) {
                                    const request = unifiedStore.get(project.imageId);
                                    request.onsuccess = (ev) => {
                                        const existing = ev.target.result;
                                        if (existing) {
                                            existing.projectSettings = {
                                                aspectRatio: project.aspectRatio,
                                                lastPrompt: project.lastPrompt,
                                                spicyMode: project.spicyMode,
                                                music: project.music,
                                                wrapMode: project.wrapMode
                                            };
                                            unifiedStore.put(existing);
                                        }
                                    };
                                }
                                cursor.continue();
                            }
                        };
                    }

                    // 3. Migrate GalleryData (Merge meta)
                    if (db.objectStoreNames.contains(this.STORES.GALLERY_DATA)) {
                        const galleryStore = transaction.objectStore(this.STORES.GALLERY_DATA);
                        galleryStore.openCursor().onsuccess = (e) => {
                            const cursor = e.target.result;
                            if (cursor) {
                                const post = cursor.value;
                                // Assuming postId maps to imageId for images
                                const request = unifiedStore.get(post.postId);
                                request.onsuccess = (ev) => {
                                    const existing = ev.target.result;
                                    if (existing) {
                                        existing.galleryMeta = {
                                            postId: post.postId,
                                            source: 'gallery',
                                            originalJson: post.originalJson || null
                                        };
                                        unifiedStore.put(existing);
                                    } else {
                                        // If it's in gallery but not history, add it as a "cached" item
                                        // Only if it looks like an image/video we care about
                                        const newEntry = {
                                            imageId: post.postId,
                                            accountId: post.accountId || 'unknown',
                                            updatedAt: post.timestamp || new Date().toISOString(),
                                            thumbnailUrl: post.thumbnailUrl || '',
                                            prompt: '', // Gallery might not have prompt easily accessible here
                                            attempts: [],
                                            projectSettings: {},
                                            galleryMeta: {
                                                postId: post.postId,
                                                source: 'gallery',
                                                originalJson: post.originalJson || null
                                            }
                                        };
                                        unifiedStore.put(newEntry);
                                    }
                                };
                                cursor.continue();
                            }
                        };
                    }
                }

                // V6+: Ensure unified store exists even if earlier migrations were skipped
                if (event.oldVersion < 6) {
                    ensureUnifiedStore();
                }

                // v12: Cleanup Legacy Stores (safe clear, not delete)
                if (oldVersion < 12) {
                    ensureUnifiedStore();

                    const legacyStores = [
                        this.STORES.MULTI_GEN_HISTORY,
                        this.STORES.IMAGE_PROJECTS,
                        this.STORES.GALLERY_DATA,
                        this.STORES.PROGRESS_TRACKING
                    ];

                    legacyStores.forEach(storeName => {
                        if (db.objectStoreNames.contains(storeName)) {
                            try {
                                const store = transaction.objectStore(storeName);
                                store.clear();
                                console.log(`[GVP IndexedDB] 🧹 Cleared legacy store: ${storeName} (v12 cleanup)`);
                            } catch (clearErr) {
                                console.warn(`[GVP IndexedDB] ⚠️ Failed to clear legacy store during cleanup: ${storeName}`, clearErr);
                            }
                        }
                    });
                }

                console.log(`[GVP IndexedDB] ✅ Schema upgrade complete to v${event.newVersion}`);
            };
        });
    }

    /**
     * Check if migration from chrome.storage has been completed
     */
    async _checkMigrationStatus() {
        try {
            if (!chrome?.storage?.local) {
                this.migrationComplete = true;
                return;
            }

            const result = await chrome.storage.local.get('gvp-indexeddb-migrated-v4');
            this.migrationComplete = result['gvp-indexeddb-migrated-v4'] === true;

            if (!this.migrationComplete) {
                console.log('[GVP IndexedDB] Migration not complete, will run migration...');
                await this.migrateFromChromeStorage();
            }
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to check migration status:', error);
        }
    }

    /**
     * Update or insert a single multi-gen history entry
     * REDIRECTED TO UNIFIED STORE (v7)
     * @param {Object} entry - The entry to save
     */
    async upsertMultiGenEntry(entry) {
        // Redirect to unified store
        return this.saveUnifiedEntry(entry);
    }

    /**
     * Save multi-gen history snapshot
     * REDIRECTED TO UNIFIED STORE (v7)
     */
    async saveMultiGenHistory(snapshot) {
        if (!this.initialized || !snapshot) {
            return false;
        }

        try {
            // Convert Map or Object to array
            let entries = [];
            if (snapshot.images instanceof Map) {
                entries = Array.from(snapshot.images.values());
            } else if (typeof snapshot.images === 'object' && snapshot.images !== null) {
                entries = Object.values(snapshot.images);
            }

            // Save to unified store
            return this.saveUnifiedEntries(entries);
        } catch (error) {
            console.error('[GVP IndexedDB] ❌ Failed to save multi-gen history (redirected):', error);
            return false;
        }
    }

    /**
     * Get multi-gen history snapshot
     * REDIRECTED FROM UNIFIED STORE (v7)
     */
    async getMultiGenHistory() {
        if (!this.initialized) {
            return null;
        }

        try {
            // Get all entries from unified store
            const transaction = this.db.transaction([this.STORES.UNIFIED_VIDEO_HISTORY], 'readonly');
            const store = transaction.objectStore(this.STORES.UNIFIED_VIDEO_HISTORY);
            const entries = await this._getAllData(store);

            // Reconstruct Map for StateManager
            const images = new Map();
            entries.forEach(entry => {
                if (entry.imageId) {
                    images.set(entry.imageId, entry);
                }
            });

            console.log('[GVP IndexedDB] Retrieved multi-gen history from Unified Store:', images.size, 'entries');

            return {
                images,
                lastModified: Date.now()
            };
        } catch (error) {
            console.error('[GVP IndexedDB] ❌ Failed to get multi-gen history from Unified Store:', error);
            return null;
        }
    }

    /**
     * Clear multi-gen history
     */
    async clearMultiGenHistory() {
        if (!this.initialized) {
            return false;
        }
        try {
            const transaction = this.db.transaction([this.STORES.MULTI_GEN_HISTORY], 'readwrite');
            const store = transaction.objectStore(this.STORES.MULTI_GEN_HISTORY);
            await this._clearStore(store);
            console.log('[GVP IndexedDB] ✅ Cleared multi-gen history');
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB] ❌ Failed to clear multi-gen history:', error);
            return false;
        }
    }

    /**
     * Save progress tracking data
     * @param {string} generationId
     * @param {Object} data
     */
    /**
     * Save progress tracking data
     * @deprecated Legacy store removed in v9
     */
    async saveProgress(generationId, data) {
        return true;
    }

    /**
     * Get progress tracking data
     */
    /**
     * Get progress tracking data
     * @deprecated Legacy store removed in v9
     */
    async getProgress(generationId) {
        return null;
    }

    /**
     * Delete progress tracking data
     */
    /**
     * Delete progress tracking data
     * @deprecated Legacy store removed in v9
     */
    async deleteProgress(generationId) {
        return true;
    }

    /**
     * Get all progress entries
     */
    /**
     * Get all progress entries
     * @deprecated Legacy store removed in v9
     */
    async getAllProgress() {
        return [];
    }

    /**
     * Clean up old progress entries (older than specified time)
     */
    /**
     * Clean up old progress entries
     * @deprecated Legacy store removed in v9
     */
    async cleanupOldProgress(maxAgeMs = 3600000) {
        return 0;
    }

    /**
     * Migrate data from chrome.storage.local to IndexedDB
     */
    async migrateFromChromeStorage() {
        if (this.migrationComplete || !chrome?.storage?.local) {
            console.log('[GVP IndexedDB] Migration already complete or chrome.storage unavailable');
            return true;
        }

        try {
            console.log('[GVP IndexedDB] 🔄 Starting migration from chrome.storage...');

            // Get all chrome.storage data
            const allData = await chrome.storage.local.get(null);
            let migratedCount = 0;

            // 1. Migrate multi-gen history (if not already done)
            // 1. Migrate multi-gen history (if not already done)
            // CRITICAL FIX: Ensure we don't overwrite IDB with legacy data repeatedly
            const multigenMigrated = await chrome.storage.local.get('gvp-multigen-migrated-v7');
            if (allData['gvp_multigen_history'] && !multigenMigrated['gvp-multigen-migrated-v7']) {
                const historySnapshot = allData['gvp_multigen_history'];
                const saved = await this.saveMultiGenHistory(historySnapshot);
                if (saved) {
                    migratedCount++;
                    await chrome.storage.local.remove('gvp_multigen_history');
                    // Mark as explicitly migrated to prevent re-runs
                    await chrome.storage.local.set({ 'gvp-multigen-migrated-v7': true });
                    console.log('[GVP IndexedDB] ✅ Migrated & cleared multi-gen history');
                }
            } else if (allData['gvp_multigen_history']) {
                // Was already migrated but data lingers? Clean it up.
                console.log('[GVP IndexedDB] 🧹 Cleaning up lingering legacy multi-gen history...');
                await chrome.storage.local.remove('gvp_multigen_history');
            }

            // 2. Migrate progress tracking entries
            const progressKeys = Object.keys(allData).filter(key => key.startsWith('gvp-progress-'));
            for (const key of progressKeys) {
                const generationId = key.replace('gvp-progress-', '');
                const saved = await this.saveProgress(generationId, allData[key]);
                if (saved) {
                    migratedCount++;
                    await chrome.storage.local.remove(key);
                }
            }
            if (progressKeys.length > 0) {
                console.log('[GVP IndexedDB] ✅ Migrated', progressKeys.length, 'progress entries');
            }

            // 3. Migrate JSON Presets & Raw Templates from gvp-settings
            if (allData['gvp-settings']) {
                const settings = allData['gvp-settings'];
                let settingsModified = false;

                // Migrate JSON Presets
                if (Array.isArray(settings.jsonPresets) && settings.jsonPresets.length > 0) {
                    console.log(`[GVP IndexedDB] Migrating ${settings.jsonPresets.length} JSON presets...`);
                    for (const preset of settings.jsonPresets) {
                        await this.saveJsonPreset(preset);
                    }
                    settings.jsonPresets = []; // Clear from settings
                    settingsModified = true;
                    migratedCount += settings.jsonPresets.length;
                }

                // Migrate Raw Templates
                if (Array.isArray(settings.rawTemplates) && settings.rawTemplates.length > 0) {
                    console.log(`[GVP IndexedDB] Migrating ${settings.rawTemplates.length} raw templates...`);
                    for (const template of settings.rawTemplates) {
                        // Ensure ID exists
                        if (!template.id) template.id = crypto.randomUUID();
                        await this.saveRawTemplate(template);
                    }
                    settings.rawTemplates = []; // Clear from settings
                    settingsModified = true;
                    migratedCount += settings.rawTemplates.length;
                }

                if (settingsModified) {
                    await chrome.storage.local.set({ 'gvp-settings': settings });
                    console.log('[GVP IndexedDB] ✅ Cleared migrated data from gvp-settings');
                }
            }

            // 4. Migrate Saved Prompt Slots from chrome.storage.local
            const savedPromptsData = allData['gvp-saved-prompts'];
            const savedPromptsConfig = allData['gvp-saved-prompts-config'];

            if (savedPromptsData || savedPromptsConfig) {
                console.log('[GVP IndexedDB] Migrating saved prompt slots...');

                // Parse config to get active slots
                let activeSlots = [1, 2, 3]; // default
                if (savedPromptsConfig) {
                    try {
                        const config = JSON.parse(savedPromptsConfig);
                        if (Array.isArray(config.slots)) {
                            activeSlots = config.slots;
                        }
                    } catch (e) {
                        console.warn('[GVP IndexedDB] Failed to parse saved prompts config:', e);
                    }
                }

                // Parse prompts data
                let promptsObj = {};
                if (savedPromptsData) {
                    try {
                        promptsObj = JSON.parse(savedPromptsData);
                    } catch (e) {
                        console.warn('[GVP IndexedDB] Failed to parse saved prompts data:', e);
                    }
                }

                // Migrate each slot
                for (const slotId of activeSlots) {
                    const slotKey = `slot${slotId}`;
                    const slotData = promptsObj[slotKey];

                    await this.saveSavedPromptSlot(slotId, {
                        slotId,
                        active: true,
                        prompt: slotData?.prompt || '',
                        timestamp: slotData?.timestamp || Date.now()
                    });
                }

                // Remove from chrome.storage
                await chrome.storage.local.remove(['gvp-saved-prompts', 'gvp-saved-prompts-config']);
                console.log(`[GVP IndexedDB] ✅ Migrated ${activeSlots.length} saved prompt slots`);
                migratedCount += activeSlots.length;
            }

            // 5. Migrate Custom Dropdown Options from chrome.storage.local
            const customDropdownValues = allData['gvp-custom-dropdown-values'];

            if (customDropdownValues) {
                console.log('[GVP IndexedDB] Migrating custom dropdown options...');

                try {
                    const dropdownObj = typeof customDropdownValues === 'string'
                        ? JSON.parse(customDropdownValues)
                        : customDropdownValues;

                    // Each category becomes a store entry
                    for (const [category, options] of Object.entries(dropdownObj)) {
                        if (Array.isArray(options) && options.length > 0) {
                            await this.saveCustomDropdownOptions(category, options);
                        }
                    }

                    // Remove from chrome.storage
                    await chrome.storage.local.remove('gvp-custom-dropdown-values');
                    const categoryCount = Object.keys(dropdownObj).length;
                    console.log(`[GVP IndexedDB] ✅ Migrated custom dropdowns for ${categoryCount} categories`);
                    migratedCount += categoryCount;
                } catch (e) {
                    console.warn('[GVP IndexedDB] Failed to migrate custom dropdowns:', e);
                }
            }

            // Mark migration complete (v4)
            await chrome.storage.local.set({ 'gvp-indexeddb-migrated-v4': true });
            this.migrationComplete = true;

            console.log('[GVP IndexedDB] ✅ Migration complete:', migratedCount, 'items migrated');

            return true;
        } catch (error) {
            console.error('[GVP IndexedDB] ❌ Migration failed:', error);
            return false;
        }
    }

    /**
     * Clean up migrated data from chrome.storage to free space
     */
    async _cleanupOldChromeStorageData(allData) {
        try {
            const keysToRemove = [];

            // Remove multi-gen history
            if (allData['gvp_multigen_history']) {
                keysToRemove.push('gvp_multigen_history');
            }

            // Remove old progress entries
            keysToRemove.push(...Object.keys(allData).filter(key => key.startsWith('gvp-progress-')));

            if (keysToRemove.length > 0) {
                await chrome.storage.local.remove(keysToRemove);
                console.log('[GVP IndexedDB] 🧹 Cleaned up', keysToRemove.length, 'old chrome.storage keys');
            }
        } catch (error) {
            console.warn('[GVP IndexedDB] Failed to cleanup old chrome.storage data:', error);
        }
    }

    // ========================================
    // Low-level IndexedDB helpers
    // ========================================

    _putData(store, data) {
        return new Promise((resolve, reject) => {
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    _getData(store, key) {
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    _deleteData(store, key) {
        return new Promise((resolve, reject) => {
            const request = store.delete(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    _getAllData(store) {
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    _clearStore(store) {
        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    // ========================================
    // Gallery Data Management (NEW in v2)
    // ========================================

    /**
     * Save gallery posts from API responses
     * @param {Array} posts - Array of post objects from gallery API
     * @param {string} accountId - Account ID for indexing
     */
    async saveGalleryPosts(posts, accountId) {
        if (!this.initialized || !posts || !Array.isArray(posts)) {
            return false;
        }

        try {
            const transaction = this.db.transaction([this.STORES.GALLERY_DATA], 'readwrite');
            const store = transaction.objectStore(this.STORES.GALLERY_DATA);

            let savedCount = 0;
            for (const post of posts) {
                const data = {
                    postId: post.id || post.postId,
                    accountId: accountId || post.accountId,
                    timestamp: post.timestamp || Date.now(),
                    thumbnail: post.thumbnail || post.image_url || null,
                    status: post.status || 'unknown',
                    success: post.success !== false,
                    ...post
                };
                await this._putData(store, data);
                savedCount++;
            }

            // ✅ UNLIMITED STORAGE: Pruning disabled per user request
            // Per-account isolation maintained via accountId field
            // await this._pruneGalleryData(accountId);

            console.log(`[GVP IndexedDB]  Saved ${savedCount} gallery posts`);
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB]  Failed to save gallery posts:', error);
            return false;
        }
    }

    /**
     * Get gallery posts for an account
     * @param {string} accountId - Account ID to filter by
     * @param {Object} options - Query options (limit, offset, etc.)
     */
    /**
     * Get gallery posts for an account
     * @deprecated Legacy store removed in v9
     */
    async getGalleryPosts(accountId, options = {}) {
        return [];
    }

    /**
     * Get all gallery posts across all accounts (for finding most recent account)
     * @param {Object} options - Query options (limit, sortBy)
     */
    /**
     * Get all gallery posts across all accounts
     * @deprecated Legacy store removed in v9
     */
    async getAllGalleryPosts(options = {}) {
        return [];
    }

    /**
     * Clear all gallery data for an account
     */
    async clearGalleryData(accountId) {
        if (!this.initialized) {
            return false;
        }

        try {
            const posts = await this.getGalleryPosts(accountId);
            const transaction = this.db.transaction([this.STORES.GALLERY_DATA], 'readwrite');
            const store = transaction.objectStore(this.STORES.GALLERY_DATA);

            for (const post of posts) {
                await this._deleteData(store, post.postId);
            }

            console.log(`[GVP IndexedDB]  Cleared ${posts.length} gallery posts for account ${accountId}`);
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB]  Failed to clear gallery data:', error);
            return false;
        }
    }

    /**
     * Prune oldest gallery posts to stay within limit
     * @deprecated Pruning disabled in v1.17.2 for unlimited storage
     */
    async _pruneGalleryData(accountId) {
        // Pruning disabled per user request for unlimited video storage
        // Keeping method stub for backward compatibility
        return;
    }

    // ========================================
    // Unified Video History Management (NEW in v6)
    // ========================================

    /**
     * Save a unified video history entry
     * @param {Object} entry - The entry to save
     * @returns {Promise<boolean>}
     */
    async saveUnifiedEntry(entry) {
        if (!this.initialized || !entry || !entry.imageId) {
            console.warn('[GVP IndexedDB] ⚠️ Cannot save unified entry: Invalid data', entry);
            return false;
        }

        try {
            const transaction = this.db.transaction([this.STORES.UNIFIED_VIDEO_HISTORY], 'readwrite');
            const store = transaction.objectStore(this.STORES.UNIFIED_VIDEO_HISTORY);

            // Ensure timestamp
            if (!entry.updatedAt) {
                entry.updatedAt = new Date().toISOString();
            }

            await this._putData(store, entry);
            console.log(`[GVP IndexedDB] 💾 SAVED to UNIFIED_VIDEO_HISTORY: ${entry.imageId}`, {
                accountId: entry.accountId,
                timestamp: entry.updatedAt,
                prompt: entry.prompt ? entry.prompt.substring(0, 50) + '...' : 'N/A'
            });
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB] ❌ Failed to save unified entry:', error);
            return false;
        }
    }

    /**
     * Save multiple unified video history entries in a single transaction
     * @param {Array<Object>} entries - The entries to save
     * @returns {Promise<boolean>}
     */
    async saveUnifiedEntries(entries) {
        if (!this.initialized || !Array.isArray(entries)) {
            return false;
        }

        if (entries.length === 0) {
            return true;
        }

        try {
            const transaction = this.db.transaction([this.STORES.UNIFIED_VIDEO_HISTORY], 'readwrite');
            const store = transaction.objectStore(this.STORES.UNIFIED_VIDEO_HISTORY);

            let savedCount = 0;
            for (const entry of entries) {
                if (entry.updatedAt) {
                    entry.updatedAt = new Date().toISOString();
                }
                store.put(entry);
                savedCount++;
            }

            return new Promise((resolve, reject) => {
                transaction.oncomplete = () => {
                    console.log(`[GVP IndexedDB] 💾 BATCH SAVED ${savedCount} entries to UNIFIED_VIDEO_HISTORY`);
                    resolve(true);
                };
                transaction.onerror = () => reject(transaction.error);
            });
        } catch (error) {
            console.error('[GVP IndexedDB] ❌ Failed to save unified entries batch:', error);
            return false;
        }
    }

    /**
     * Get multiple unified video history entries in a single transaction
     * @param {Array<string>} imageIds - Array of Image IDs to retrieve
     * @returns {Promise<Map<string, Object>>} Map of imageId -> entry
     */
    async getUnifiedEntriesBatch(imageIds) {
        if (!this.initialized || !Array.isArray(imageIds) || imageIds.length === 0) {
            return new Map();
        }

        try {
            const uniqueIds = [...new Set(imageIds)];
            const transaction = this.db.transaction([this.STORES.UNIFIED_VIDEO_HISTORY], 'readonly');
            const store = transaction.objectStore(this.STORES.UNIFIED_VIDEO_HISTORY);
            const results = new Map();

            const promises = uniqueIds.map(id => {
                return new Promise((resolve) => {
                    const request = store.get(id);
                    request.onsuccess = () => resolve({ id, data: request.result });
                    request.onerror = () => {
                        console.warn(`[GVP IndexedDB] Failed to batch get ${id}`);
                        resolve({ id, data: null });
                    };
                });
            });

            const entries = await Promise.all(promises);
            entries.forEach(entry => {
                if (entry.data) {
                    results.set(entry.id, entry.data);
                }
            });

            return results;
        } catch (error) {
            console.error('[GVP IndexedDB] ❌ Failed to get unified entries batch:', error);
            return new Map();
        }
    }

    /**
     * Get a single unified video history entry by imageId
     * @param {string} imageId - Image ID to retrieve
     * @returns {Promise<Object|null>}
     */
    async getUnifiedEntry(imageId) {
        // console.log('[GVP IndexedDB] 🔍 getUnifiedEntry called', { imageId });

        if (!this.initialized || !imageId) {
            return null;
        }

        try {
            const transaction = this.db.transaction([this.STORES.UNIFIED_VIDEO_HISTORY], 'readonly');
            const store = transaction.objectStore(this.STORES.UNIFIED_VIDEO_HISTORY);
            const entry = await this._getData(store, imageId);
            return entry;
        } catch (error) {
            console.error('[GVP IndexedDB] ❌ Failed to get unified entry:', error, { imageId });
            return null;
        }
    }

    /**
     * Get all unified video history entries for an account
     * @param {string} accountId - Account ID to filter by
     * @returns {Promise<Array>}
     */
    async getAllUnifiedEntries(accountId, limit = 500) {
        console.log('[GVP IndexedDB] 📦 getAllUnifiedEntries called', {
            accountId: accountId?.substring(0, 12) + '...',
            limit,
            initialized: this.initialized
        });

        if (!this.initialized || !accountId) {
            console.warn('[GVP IndexedDB] ⚠️ Cannot get entries - not initialized or no accountId', {
                initialized: this.initialized,
                hasAccountId: !!accountId
            });
            return [];
        }

        try {
            console.log('[GVP IndexedDB] 🔎 Querying index for accountId:', accountId.substring(0, 12) + '...');

            const transaction = this.db.transaction([this.STORES.UNIFIED_VIDEO_HISTORY], 'readonly');
            const store = transaction.objectStore(this.STORES.UNIFIED_VIDEO_HISTORY);
            const index = store.index('accountId');

            const request = index.getAll(accountId);
            const entries = await new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });

            // ✅ Sort by createTime/updatedAt/createdAt (descending) - Newest First
            entries.sort((a, b) => {
                const timeA = new Date(a.createTime || a.updatedAt || a.createdAt || 0).getTime();
                const timeB = new Date(b.createTime || b.updatedAt || b.createdAt || 0).getTime();
                return timeB - timeA;
            });

            const totalVideos = entries.reduce((sum, e) => sum + (e.attempts?.length || 0), 0);

            // Apply limit
            const limitedEntries = limit > 0 ? entries.slice(0, limit) : entries;

            console.log(`[GVP IndexedDB] ✅ Retrieved ${limitedEntries.length}/${entries.length} unified entries for account ${accountId.substring(0, 8)}...`, {
                imageCount: limitedEntries.length,
                totalVideos: totalVideos,
                sampleImageIds: limitedEntries.slice(0, 3).map(e => e.imageId)
            });

            return limitedEntries;
        } catch (error) {
            console.error('[GVP IndexedDB] ❌ Failed to get all unified entries:', error, {
                accountId: accountId?.substring(0, 12)
            });
            return [];
        }
    }

    /**
     * Clear all unified video history entries for an account
     * @param {string} accountId - Account ID to clear
     * @returns {Promise<boolean>}
     */
    async clearUnifiedHistory(accountId) {
        if (!this.initialized || !accountId) {
            return false;
        }

        try {
            const entries = await this.getAllUnifiedEntries(accountId);
            const transaction = this.db.transaction([this.STORES.UNIFIED_VIDEO_HISTORY], 'readwrite');
            const store = transaction.objectStore(this.STORES.UNIFIED_VIDEO_HISTORY);

            for (const entry of entries) {
                await this._deleteData(store, entry.imageId);
            }

            console.log(`[GVP IndexedDB] ✅ Cleared ${entries.length} unified entries for account ${accountId}`);
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB] ❌ Failed to clear unified history:', error);
            return false;
        }
    }

    // ========================================
    // Image Projects Management (NEW in v2)
    // ========================================


    /**
     * Save an image project state
     * @param {string} accountId
     * @param {string} imageId
     * @param {Object} data
     */
    /**
     * Save an image project state
     * REDIRECTED TO UNIFIED STORE (v7)
     * @param {string} accountId
     * @param {string} imageId
     * @param {Object} data
     */
    async saveImageProject(accountId, imageId, data) {
        if (!this.initialized || !accountId || !imageId) {
            return false;
        }

        try {
            // 1. Save to Unified Store (Primary)
            const unifiedEntry = await this.getUnifiedEntry(imageId) || {
                imageId,
                accountId,
                attempts: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            unifiedEntry.projectSettings = {
                ...unifiedEntry.projectSettings,
                ...data,
                timestamp: Date.now()
            };
            unifiedEntry.updatedAt = new Date().toISOString();

            await this.saveUnifiedEntry(unifiedEntry);

            // Legacy store write removed in v8 cleanup

            console.log(`[GVP IndexedDB] ✅ Saved image project (Unified): ${accountId}:${imageId}`);
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB] ❌ Failed to save image project:', error);
            return false;
        }
    }


    /**
     * Get image project data
     * REDIRECTED TO UNIFIED STORE (v7)
     * @param {string} accountId - Account ID
     * @param {string} imageId - Image ID
     */
    async getImageProject(accountId, imageId) {
        if (!this.initialized || !accountId || !imageId) {
            return null;
        }

        try {
            // Unified Store Only
            const unifiedEntry = await this.getUnifiedEntry(imageId);
            if (unifiedEntry && unifiedEntry.projectSettings) {
                return unifiedEntry.projectSettings;
            }
            return null;
        } catch (error) {
            console.error('[GVP IndexedDB] ❌ Failed to get image project:', error);
            return null;
        }
    }

    /**
     * Get all image projects for an account
     * @param {string} accountId - Account ID
     */
    async getImageProjectsByAccount(accountId, limit = 500) {
        if (!this.initialized || !accountId) {
            return [];
        }

        try {
            // Use unified store
            const unifiedEntries = await this.getAllUnifiedEntries(accountId, limit);
            return unifiedEntries
                .filter(e => e.projectSettings && Object.keys(e.projectSettings).length > 0)
                .map(e => ({
                    ...e.projectSettings,
                    imageId: e.imageId,
                    accountId: e.accountId,
                    timestamp: e.updatedAt
                }));
        } catch (error) {
            console.error('[GVP IndexedDB] ❌ Failed to get image projects:', error);
            return [];
        }
    }


    /**
     * Delete image project
     * @param {string} accountId - Account ID
     * @param {string} imageId - Image ID
     */
    async deleteImageProject(accountId, imageId) {
        if (!this.initialized || !accountId || !imageId) {
            return false;
        }

        try {
            const transaction = this.db.transaction([this.STORES.IMAGE_PROJECTS], 'readwrite');
            const store = transaction.objectStore(this.STORES.IMAGE_PROJECTS);
            const compositeKey = `${accountId}:${imageId}`;

            await this._deleteData(store, compositeKey);
            console.log(`[GVP IndexedDB]  Deleted image project: ${compositeKey}`);
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB]  Failed to delete image project:', error);
            return false;
        }
    }

    /**
     * Migrate image projects from chrome.storage.local
     */
    async migrateImageProjectsFromChromeStorage() {
        if (!this.initialized) return;

        try {
            const result = await chrome.storage.local.get(['gvp-image-projects']);
            const projectsArray = result['gvp-image-projects'];

            if (!projectsArray || !Array.isArray(projectsArray)) {
                console.log('[GVP IndexedDB] No legacy image projects found to migrate.');
                return;
            }

            // CRITICAL FIX: Check if already migrated to prevent overwriting Unified Store
            const flag = await chrome.storage.local.get('gvp-image-projects-migrated-v7');
            if (flag['gvp-image-projects-migrated-v7']) {
                console.log('[GVP IndexedDB] Image projects already migrated provided by v7 flag.');
                // Cleanup if still present
                await chrome.storage.local.remove('gvp-image-projects');
                return;
            }

            console.log('[GVP IndexedDB] Migrating image projects from chrome.storage...');
            let count = 0;

            // projectsArray structure: [[accountId, [[imageId, projectData], ...]], ...]
            for (const [accountId, entries] of projectsArray) {
                if (!Array.isArray(entries)) continue;

                for (const [imageId, projectData] of entries) {
                    if (projectData) {
                        // Ensure accountId is attached
                        projectData.accountId = accountId;
                        // Use the new save method
                        await this.saveImageProject(accountId, imageId, projectData);
                        count++;
                    }
                }
            }

            console.log(`[GVP IndexedDB] Successfully migrated ${count} image projects.`);

            // Optional: Clear legacy storage after successful migration
            await chrome.storage.local.remove('gvp-image-projects');
            // CRITICAL: Set flag
            await chrome.storage.local.set({ 'gvp-image-projects-migrated-v7': true });

        } catch (error) {
            console.error('[GVP IndexedDB] Failed to migrate image projects:', error);
        }
    }

    // ========================================
    // JSON Presets Management (NEW in v3)
    // ========================================

    async saveJsonPreset(preset) {
        if (!this.initialized || !preset || !preset.name) return false;
        try {
            const transaction = this.db.transaction([this.STORES.JSON_PRESETS], 'readwrite');
            const store = transaction.objectStore(this.STORES.JSON_PRESETS);
            await this._putData(store, preset);
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to save JSON preset:', error);
            return false;
        }
    }

    async getJsonPresets() {
        if (!this.initialized) return [];
        try {
            const transaction = this.db.transaction([this.STORES.JSON_PRESETS], 'readonly');
            const store = transaction.objectStore(this.STORES.JSON_PRESETS);
            return await this._getAllData(store);
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to get JSON presets:', error);
            return [];
        }
    }

    async deleteJsonPreset(name) {
        if (!this.initialized || !name) return false;
        try {
            const transaction = this.db.transaction([this.STORES.JSON_PRESETS], 'readwrite');
            const store = transaction.objectStore(this.STORES.JSON_PRESETS);
            await this._deleteData(store, name);
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to delete JSON preset:', error);
            return false;
        }
    }

    // ========================================
    // Raw Templates Management (NEW in v3)
    // ========================================

    async saveRawTemplate(template) {
        if (!this.initialized || !template || !template.id) return false;
        try {
            const transaction = this.db.transaction([this.STORES.RAW_TEMPLATES], 'readwrite');
            const store = transaction.objectStore(this.STORES.RAW_TEMPLATES);
            await this._putData(store, template);
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to save raw template:', error);
            return false;
        }
    }

    async getRawTemplates() {
        if (!this.initialized) return [];
        try {
            const transaction = this.db.transaction([this.STORES.RAW_TEMPLATES], 'readonly');
            const store = transaction.objectStore(this.STORES.RAW_TEMPLATES);
            return await this._getAllData(store);
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to get raw templates:', error);
            return [];
        }
    }

    async deleteRawTemplate(id) {
        if (!this.initialized || !id) return false;
        try {
            const transaction = this.db.transaction([this.STORES.RAW_TEMPLATES], 'readwrite');
            const store = transaction.objectStore(this.STORES.RAW_TEMPLATES);
            await this._deleteData(store, id);
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to delete raw template:', error);
            return false;
        }
    }

    // ========================================
    // Saved Prompt Slots Management (NEW in v4)
    // ========================================

    async saveSavedPromptSlot(slotId, data) {
        if (!this.initialized || !slotId) return false;
        try {
            const slotData = {
                slotId,
                active: data.active !== undefined ? data.active : true,
                name: data.name || '',
                prompt: data.prompt || '',
                timestamp: data.timestamp || Date.now()
            };
            const transaction = this.db.transaction([this.STORES.SAVED_PROMPT_SLOTS], 'readwrite');
            const store = transaction.objectStore(this.STORES.SAVED_PROMPT_SLOTS);
            await this._putData(store, slotData);
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to save saved prompt slot:', error);
            return false;
        }
    }

    async getSavedPromptSlots() {
        if (!this.initialized) return [];
        try {
            const transaction = this.db.transaction([this.STORES.SAVED_PROMPT_SLOTS], 'readonly');
            const store = transaction.objectStore(this.STORES.SAVED_PROMPT_SLOTS);
            return await this._getAllData(store);
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to get saved prompt slots:', error);
            return [];
        }
    }

    async getSavedPromptSlot(slotId) {
        if (!this.initialized || !slotId) return null;
        try {
            const transaction = this.db.transaction([this.STORES.SAVED_PROMPT_SLOTS], 'readonly');
            const store = transaction.objectStore(this.STORES.SAVED_PROMPT_SLOTS);
            return await this._getData(store, slotId);
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to get saved prompt slot:', error);
            return null;
        }
    }

    async deleteSavedPromptSlot(slotId) {
        if (!this.initialized || !slotId) return false;
        try {
            const transaction = this.db.transaction([this.STORES.SAVED_PROMPT_SLOTS], 'readwrite');
            const store = transaction.objectStore(this.STORES.SAVED_PROMPT_SLOTS);
            await this._deleteData(store, slotId);
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to delete saved prompt slot:', error);
            return false;
        }
    }

    // ========================================
    // Custom Dropdown Options Management (NEW in v4)
    // ========================================

    async saveCustomDropdownOptions(category, options) {
        if (!this.initialized || !category) return false;
        try {
            const data = {
                category,
                options: Array.isArray(options) ? options : [],
                timestamp: Date.now()
            };
            const transaction = this.db.transaction([this.STORES.CUSTOM_DROPDOWNS], 'readwrite');
            const store = transaction.objectStore(this.STORES.CUSTOM_DROPDOWNS);
            await this._putData(store, data);
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to save custom dropdown options:', error);
            return false;
        }
    }


    async getCustomDropdownOptions(category) {
        if (!this.initialized || !category) return [];
        try {
            const transaction = this.db.transaction([this.STORES.CUSTOM_DROPDOWNS], 'readonly');
            const store = transaction.objectStore(this.STORES.CUSTOM_DROPDOWNS);
            const data = await this._getData(store, category);
            return data?.options || [];
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to get custom dropdown options:', error);
            return [];
        }
    }

    async getAllCustomDropdownOptions() {
        if (!this.initialized) return {};
        try {
            const transaction = this.db.transaction([this.STORES.CUSTOM_DROPDOWNS], 'readonly');
            const store = transaction.objectStore(this.STORES.CUSTOM_DROPDOWNS);
            const allData = await this._getAllData(store);
            const result = {};
            for (const item of allData) {
                result[item.category] = item.options;
            }
            return result;
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to get all custom dropdown options:', error);
            return {};
        }
    }

    async deleteCustomDropdownOptions(category) {
        if (!this.initialized || !category) return false;
        try {
            const transaction = this.db.transaction([this.STORES.CUSTOM_DROPDOWNS], 'readwrite');
            const store = transaction.objectStore(this.STORES.CUSTOM_DROPDOWNS);
            await this._deleteData(store, category);
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to delete custom dropdown options:', error);
            return false;
        }
    }

    // ========================================
    // Custom Objects Management (NEW in v4)
    // ========================================

    async saveCustomObject(object) {
        if (!this.initialized || !object) return false;
        try {
            const objectData = {
                id: object.id || crypto.randomUUID(),
                data: object.data || object,
                timestamp: Date.now()
            };
            const transaction = this.db.transaction([this.STORES.CUSTOM_OBJECTS], 'readwrite');
            const store = transaction.objectStore(this.STORES.CUSTOM_OBJECTS);
            await this._putData(store, objectData);
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to save custom object:', error);
            return false;
        }
    }

    async getCustomObjects() {
        if (!this.initialized) return [];
        try {
            const transaction = this.db.transaction([this.STORES.CUSTOM_OBJECTS], 'readonly');
            const store = transaction.objectStore(this.STORES.CUSTOM_OBJECTS);
            return await this._getAllData(store);
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to get custom objects:', error);
            return [];
        }
    }

    async deleteCustomObject(id) {
        if (!this.initialized || !id) return false;
        try {
            const transaction = this.db.transaction([this.STORES.CUSTOM_OBJECTS], 'readwrite');
            const store = transaction.objectStore(this.STORES.CUSTOM_OBJECTS);
            await this._deleteData(store, id);
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to delete custom object:', error);
            return false;
        }
    }

    // ========================================
    // Custom Dialogues Management (NEW in v4)
    // ========================================

    async saveCustomDialogue(dialogue) {
        if (!this.initialized || !dialogue) return false;
        try {
            const dialogueData = {
                id: dialogue.id || crypto.randomUUID(),
                data: dialogue.data || dialogue,
                timestamp: Date.now()
            };
            const transaction = this.db.transaction([this.STORES.CUSTOM_DIALOGUES], 'readwrite');
            const store = transaction.objectStore(this.STORES.CUSTOM_DIALOGUES);
            await this._putData(store, dialogueData);
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to save custom dialogue:', error);
            return false;
        }
    }

    async getCustomDialogues() {
        if (!this.initialized) return [];
        try {
            const transaction = this.db.transaction([this.STORES.CUSTOM_DIALOGUES], 'readonly');
            const store = transaction.objectStore(this.STORES.CUSTOM_DIALOGUES);
            return await this._getAllData(store);
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to get custom dialogues:', error);
            return [];
        }
    }

    async deleteCustomDialogue(id) {
        if (!this.initialized || !id) return false;
        try {
            const transaction = this.db.transaction([this.STORES.CUSTOM_DIALOGUES], 'readwrite');
            const store = transaction.objectStore(this.STORES.CUSTOM_DIALOGUES);
            await this._deleteData(store, id);
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB] Failed to delete custom dialogue:', error);
            return false;
        }
    }

    // ========================================
    // Storage Management & Pruning (NEW in v2)
    // ========================================

    /**
     * Get storage statistics for all stores
     */
    async getStorageStats() {
        if (!this.initialized) {
            return null;
        }

        try {
            const stats = {};
            const storeNames = Object.values(this.STORES);

            for (const storeName of storeNames) {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const count = await new Promise((resolve, reject) => {
                    const request = store.count();
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });

                stats[storeName] = { count };
            }

            return stats;
        } catch (error) {
            console.error('[GVP IndexedDB]  Failed to get storage stats:', error);
            return null;
        }
    }

    /**
     * Prune old data across all stores to enforce limits
     */
    async pruneOldData() {
        if (!this.initialized) {
            return false;
        }

        try {
            console.log('[GVP IndexedDB]  Starting data pruning...');

            // Prune old image projects (beyond retention days)
            await this._pruneImageProjects();

            // Prune old progress tracking (completed generations)
            await this._pruneProgressTracking();

            console.log('[GVP IndexedDB]  Pruning complete');
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB]  Pruning failed:', error);
            return false;
        }
    }

    /**
     * Prune image projects older than retention period
     */
    async _pruneImageProjects() {
        try {
            const transaction = this.db.transaction([this.STORES.IMAGE_PROJECTS], 'readwrite');
            const store = transaction.objectStore(this.STORES.IMAGE_PROJECTS);
            const allProjects = await this._getAllData(store);

            const cutoffTime = Date.now() - (this.LIMITS.MAX_IMAGE_PROJECT_AGE_DAYS * 24 * 60 * 60 * 1000);
            let prunedCount = 0;

            for (const project of allProjects) {
                if (project.timestamp < cutoffTime) {
                    await this._deleteData(store, project.compositeKey);
                    prunedCount++;
                }
            }

            if (prunedCount > 0) {
                console.log(`[GVP IndexedDB]  Pruned ${prunedCount} old image projects`);
            }
        } catch (error) {
            console.error('[GVP IndexedDB]  Image project pruning failed:', error);
        }
    }

    /**
     * Prune completed/old progress tracking entries
     */
    async _pruneProgressTracking() {
        try {
            const transaction = this.db.transaction([this.STORES.PROGRESS_TRACKING], 'readwrite');
            const store = transaction.objectStore(this.STORES.PROGRESS_TRACKING);
            const allProgress = await this._getAllData(store);

            const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
            let prunedCount = 0;

            for (const progress of allProgress) {
                const isOld = progress.timestamp < cutoffTime;
                const isCompleted = progress.status === 'completed' || progress.status === 'failed';

                if (isOld || (isCompleted && progress.timestamp < Date.now() - (24 * 60 * 60 * 1000))) {
                    await this._deleteData(store, progress.generationId);
                    prunedCount++;
                }
            }

            if (prunedCount > 0) {
                console.log(`[GVP IndexedDB]  Pruned ${prunedCount} old progress entries`);
            }
        } catch (error) {
            console.error('[GVP IndexedDB]  Progress tracking pruning failed:', error);
        }
    }

    /**
     * Cleanup legacy stores after migration (v7)
     * Deletes multiGenHistory, imageProjects, and galleryData
     */
    async cleanupLegacyStores() {
        if (!this.initialized) return false;

        try {
            console.log('[GVP IndexedDB] 🧹 Starting cleanup of legacy stores...');

            const legacyStores = [
                this.STORES.MULTI_GEN_HISTORY,
                this.STORES.IMAGE_PROJECTS,
                this.STORES.GALLERY_DATA,
                this.STORES.PROGRESS_TRACKING
            ];

            const transaction = this.db.transaction(legacyStores, 'readwrite');

            for (const storeName of legacyStores) {
                const store = transaction.objectStore(storeName);
                await this._clearStore(store);
                console.log(`[GVP IndexedDB] 🗑️ Cleared legacy store: ${storeName}`);
            }

            console.log('[GVP IndexedDB] ✨ Legacy cleanup complete.');
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB] ❌ Failed to cleanup legacy stores:', error);
            return false;
        }
    }

    /**
     * Enhanced saveProgress with automatic limit enforcement
     */
    async saveProgressWithLimit(generationId, data) {
        if (!this.initialized || !generationId) {
            return false;
        }

        try {
            if (data.rawPayload && data.rawPayload.length > this.LIMITS.MAX_PAYLOAD_SIZE) {
                data.rawPayload = data.rawPayload.substring(0, this.LIMITS.MAX_PAYLOAD_SIZE) + '... [truncated]';
            }

            if (data.progressSamples && Array.isArray(data.progressSamples)) {
                if (data.progressSamples.length > this.LIMITS.MAX_PROGRESS_SAMPLES) {
                    data.progressSamples = data.progressSamples.slice(-this.LIMITS.MAX_PROGRESS_SAMPLES);
                }
            }

            return await this.saveProgress(generationId, data);
        } catch (error) {
            console.error('[GVP IndexedDB]  Failed to save progress with limit:', error);
            return false;
        }
    }

    /**
     * Get progress entries by image ID
     */
    async getProgressByImageId(imageId) {
        if (!this.initialized || !imageId) {
            return [];
        }

        try {
            const transaction = this.db.transaction([this.STORES.PROGRESS_TRACKING], 'readonly');
            const store = transaction.objectStore(this.STORES.PROGRESS_TRACKING);
            const index = store.index('imageId');

            const request = index.getAll(imageId);
            const results = await new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });

            return results;
        } catch (error) {
            console.error('[GVP IndexedDB]  Failed to get progress by imageId:', error);
            return [];
        }
    }

    /**
     * Delete all progress entries for an image
     */
    async deleteProgressByImageId(imageId) {
        if (!this.initialized || !imageId) {
            return false;
        }

        try {
            const progressEntries = await this.getProgressByImageId(imageId);
            const transaction = this.db.transaction([this.STORES.PROGRESS_TRACKING], 'readwrite');
            const store = transaction.objectStore(this.STORES.PROGRESS_TRACKING);

            for (const entry of progressEntries) {
                await this._deleteData(store, entry.generationId);
            }

            console.log(`[GVP IndexedDB]  Deleted ${progressEntries.length} progress entries for image ${imageId}`);
            return true;
        } catch (error) {
            console.error('[GVP IndexedDB]  Failed to delete progress by imageId:', error);
            return false;
        }
    }

};
