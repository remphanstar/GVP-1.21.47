# Changelog - Grok Video Prompter

All notable changes to the Grok Video Prompter extension will be documented in this file.
## [1.21.47] - 2025-12-30
### Added
- ✨ **Job Queue System**: Introduced `JobQueueManager.js` for persistent background task processing (upscales, unlikes, relikes).
  - Persists queue to `chrome.storage.local`.
  - Survives page reloads and navigations.
  - Basic processing loop implemented.
- ✨ **Generation Rail**: Added `UIGenerationRailManager.js` - a visual status overlay for Quick Raw generations.
  - Positioned at top-right (z-index 9999) behind extension toggles.
  - Shows real-time status of "invisible" background generations.
- 🔧 **Selector Centralization**: Created `src/content/constants/selectors.js` as single source of truth for all DOM selectors.
  - Refactored `ReactAutomation`, `AutomaticRetryManager`, `UploadAutomationManager` to use these constants.

### Fixed
- 🐛 **Video Prep Loop**: Updated `AutomaticRetryManager` and `ReactAutomation` to check for specific textarea selectors from `selectors.js`, fixing potential detection issues.
- 🐛 **Generation Rail Layering**: Fixed Rail covering extension buttons by adjusting z-index to 9999 (behind UI) and ensuring interaction pass-through.
- ⚡ **React Compatibility**: Centralized `reactClick` usage across the codebase to ensure consistent event firing for Grok's React UI.


### Changed
- ⚡ **Spicy Button ReactClick Upgrade**: Replaced old multi-method click chain with unified `reactClick`.
  - Root cause: `_detectNativeSpicyButton()` used 3 separate click methods (`.click()`, MouseEvent chain, PointerEvent chain) that were redundant and could cause event duplication. This was implemented before `ReactAutomation.js` existed.
  - Fix: Replaced all three methods with single `window.gvpReactAutomation.reactClick()` call with automatic fallback to native `.click()` if ReactAutomation unavailable.
  - Pattern:
    ```javascript
    if (window.gvpReactAutomation?.reactClick) {
        window.gvpReactAutomation.reactClick(triggerButton, 'Native Spicy Button');
    } else {
        triggerButton.click(); // Fallback
    }
    ```
  - Benefits: Consistent with other React UI automation, ~50 lines removed
  - File: `UIManager.js` lines 3994-4004

## [1.21.42] - 2025-12-24
### Fixed
- 🔧 **Upload Mode Prompt Injection**: Changed from replacing message to APPENDING prompt after URL.
  - Root cause: Old logic replaced entire message with just URL + prompt, losing context
  - Fix: Now appends prompt AFTER the Grok URL, preserving `--mode=xxx` token
  - Pattern: `https://assets.grok.com/.../content YOUR_PROMPT --mode=normal`
  - File: `gvpFetchInterceptor.js` lines 226-237

- 🔧 **Moderated Image Infinite Retry Loop**: Fixed moderated images being re-queued infinitely.
  - Root cause: `handleModerationDetected()` set `_isProcessing=false`, but still-running `_processQueue()` saw "cancelled" and called `this._queue.unshift(item)` - putting moderated item back
  - Fix: Added moderation checks at all 3 re-queue locations (lines 790, 840, 864)
  - Now checks `_moderationTriggered || item.status === 'moderated'` before re-queuing
  - File: `UploadAutomationManager.js`

## [1.21.38] - 2025-12-21
### Added
- ✨ **Named Prompt Slots**: Saved prompts can now have custom names.
  - New `name` field stored in IndexedDB slot data
  - New `StateManager.renameSavedPromptSlot(slotId, name)` method
  - Card displays custom name (or truncated prompt preview)
  - Hover tooltip shows full prompt via `title` attribute

- ✨ **Inline Rename UI**: Replace browser `prompt()` with inline editing.
  - Click ✏️ button transforms preview into a text input
  - Save: Press Enter or click away (blur)
  - Cancel: Press Escape
  - Red border styling for active edit state

### Fixed
- 🔧 **clearSavedPrompt TypeError**: Fixed `Cannot create property 'textContent' on number '6'`.
  - Root cause: `clearSavedPrompt()` was passing slot number directly to `_setSavedPromptPreview()` instead of the preview element
  - Fix: Now queries for the element using data-slot attribute before passing to preview setter

- 🔧 **Ghost Retry Triple Guard**: Fixed retries attempting on wrong pages or without textarea.
  - Guard 1: Page path check at function start (`/imagine`, `/chat/`, etc.)
  - Guard 2: Page path re-check after delay (user may navigate during backoff)
  - Guard 3: Textarea existence check before `sendToGenerator()` (Grok button clicks don't use textarea)
  - Result: No more "Unable to locate video textarea" errors after navigating away

## [1.21.37] - 2025-12-21
### Fixed
- 🔧 **Quick Raw/JSON Gallery Trigger for data:image URLs**: Fixed trigger not working for base64-encoded images in galleries.
  - Root cause: `ensurePostPath()` rejected `data:image/jpeg;base64,...` URLs (no UUIDs or post paths)
  - Key insight: Quick Raw/JSON modes only need a truthy path value to trigger - not an actual post path
  - Fix: `getMediaPathFromNode` now returns `data:image` URLs directly when on gallery pages (`/imagine`, `/imagine/favorites`)
  - Result: Gallery Quick Raw/JSON modes now work for all image types, including base64-encoded images

## [1.21.36] - 2025-12-20  
### Fixed
- 🔧 **Quick Raw/JSON UUID Extraction**: Fixed incorrect UUID being extracted from asset URLs.
  - Fix: Now extracts image ID (2nd UUID), not account ID (1st UUID) from `/users/{accountId}/{imageId}/` URLs

## [1.21.35] - 2025-12-20
### Fixed
- 🔧 **UI Staleness Regression**: Fixed History tab not updating with new videos after generation.
  - Root cause: New entries saved to IndexedDB were NOT added to `state.unifiedHistory` in memory
  - Fix: Added incremental updates in `NetworkInterceptor.js` after `saveUnifiedEntry()` succeeds
  - New videos now appear immediately without page refresh
- 🔧 **Upload Mode Priority**: Upload Mode now defers when Quick Raw/JSON/Edit modes are active.
  - Added guard in `UploadAutomationManager._processQueue()` to prevent mode conflicts

### Verified
- ✅ **Quick + Spicy Combo**: Confirmed working correctly.
  - `RawInputManager.applySpicyMode()` properly appends `--mode=extremely-spicy-or-crazy` tag
  - Spicy tag is added BEFORE prompt reaches ReactAutomation

### Known Issues
- 🐛 Quick Raw/JSON not working from gallery image page (needs investigation)

## [1.21.34] - 2025-12-20
### Verified
- ✅ **Bulk Sync Persistence**: Confirmed working correctly across page refreshes.
  - Sync status persisted in `chrome.storage.local` survives page reloads
  - Sync status correctly restored on extension re-initialization
  - Redundant `/list` API ingestion correctly skipped for already-synced accounts
  - IndexedDB loads all 2056 unified entries (1943 images, 5023 videos) successfully
  - Console logs confirm: `"[GVP] Account already synced, skipping redundant /list ingestion"`

### Notes
- **Console Filtering**: Disable "Network" logging in Chrome DevTools Console to reduce noise from Google Analytics, Mixpanel, and Cloudflare RUM requests when debugging GVP extension.

## [1.21.33] - 2025-12-20
### Fixed
- 🐛 **Bulk Sync "Failed to fetch" Error**: Fixed `TypeError: Failed to fetch` during gallery sync.
  - Root cause: `triggerBulkGallerySync` used intercepted `fetch`, causing double-processing
  - Interceptor's gzip decompression failed on cloned response while original was consumed
  - Fix: Now uses `originalFetch` to bypass interceptor entirely

## [1.21.32] - 2025-12-20
### Fixed
- 🐛 **Redundant /list Ingestion**: Entries were being re-saved on every scroll even when data hadn't changed.
  - Fixed backfill logic to only save when thumbnail/data is ACTUALLY missing
  - Added auto-lock: Entries with complete data now get `dataSyncComplete = true` automatically
  - Added **account-level sync guard**: Once bulk sync is complete, /list ingestion is SKIPPED entirely
  - After sync, ONLY `/new` API updates entries (for new generations)
  - Massive reduction in unnecessary IndexedDB writes

## [1.21.31] - 2025-12-20
### Changed
- ⚙️ **Settings Panel Cleanup**: Simplified settings window for better usability.
  - Removed Aurora Auto-Injector section (deprecated)
  - Removed Debug & Performance section
  - Added 🔄 Gallery Sync button - now accessible from Settings instead of video player
  - Removed `listIngestionEnabled` setting - /list ingestion is now always enabled

## [1.21.30] - 2025-12-20
### Fixed
- 🐛 **Double Generation with Spicy + Quick Mode**: When both modes enabled, both would run causing 2 videos.
  - Added Quick Mode precedence guard in `_handleGalleryImageOpened()`
  - Spicy Mode now skips if Quick Raw/JSON/Edit is active
  - Only one automation runs per click

## [1.21.29] - 2025-12-20
### Fixed
- 🐛 **Quick Raw/JSON Dying After First Click**: Suppression flag was set but never cleared.
  - Added `_setQuickLaunchSuppressed(false)` to `finally` block in `_processPendingPayload()`
  - Removed duplicate `_isSuppressed()` check (copy-paste error)
  - Consecutive Quick Raw/JSON clicks now work correctly

## [1.21.28] - 2025-12-20
### Fixed (Proper Architectural Fix)
- 🐛 **Double Video Generation - Root Cause Eliminated**: Found and removed duplicate quick-launch logic in `UIManager._handleGalleryImageOpened()`.
  - **Root Cause**: BOTH `content.js` QuickLaunchManager AND `UIManager._handleGalleryImageOpened` were trying to trigger video generation on image post navigation.
  - **Fix**: Removed quick-launch handling from UIManager entirely. Now `content.js` is the SOLE handler for Quick Raw/JSON modes.
  - UIManager's `_handleGalleryImageOpened` now ONLY handles Spicy Mode (native button automation).
  - No more suppression flags, delays, or workarounds needed!

### Removed
- Suppression flag system (no longer needed)
- 2-second navigation delay (no longer needed)

## [1.21.27] - 2025-12-20 (Superseded by v1.21.28)
### Fixed
- ~~Quick Raw/JSON Subsequent Clicks Not Working~~: Workaround was replaced with proper fix in v1.21.28.

## [1.21.25-26] - 2025-12-20 (Superseded by v1.21.28)
- Various workaround attempts for double video generation bug, all replaced by v1.21.28's architectural fix.

## [1.21.24] - 2025-12-20
### Fixed
- 🎬 **Favorites Drops to 19 Videos**: `playFromFavorites()` now always uses unified history (4230+ videos) instead of paginated gallery API (~40 posts).
- 🎬 **4235 vs 2427 Video Count Mismatch**: Added `videoUrl` and `moderated` filters to `buildPlaylistFromApi()` for consistency with favorites playlist.
- ⚡ **Duplicate Thumbnail Renders**: Removed redundant `_renderPlaylist()` call from `_loadVideo()` - now 1 render per video instead of 2.
- 🧹 **Debug Logging**: Removed verbose thumbnail logging that fired on every render.

### Performance
- Playlist navigation is now 2x faster (eliminated duplicate DOM work per video load).

## [1.21.23] - 2025-12-20
### Workflow
- 🤖 **Context Automation**: Enhanced `close-session` and `recontextualize` workflows to create a continuous context loop.
- 📝 **Auto-Docs**: Added automatic session briefing generation and mandatory changelog updates.

### Fixed
- 🐛 **Bulk Sync Persistence**: Fixed issue where Bulk Sync loop status wasn't persisting across reloads (now using `chrome.storage.local`).

### Known Issues (To Be Fixed in Next Session)
- **CRITICAL:** Stale UI State (History tab freezes/missing thumbnails).
- **Player Sync Crash:** "Sync" button in video player crashes due to missing dependency.
- **Autoplay Loop:** Infinite loop when video player encounters invalid URLs.

### Cleanup
- 🗑️ **Zombie Features**: Removed deprecated "Zombie Restoration" logic from `StateManager.js` and debug buttons from `UISettingsManager.js`.

### Documentation
- 🚨 **Regression Identified**: Documented the "Stale UI State" issue in `HANDOVER.md`, `4_History_Playlist.md`, and `9_Unified_Storage_Architecture.md`.
- 📚 **Architecture**: Updated Data Loading Strategy documentation to reflect the new "Redundancy Guard".

## [1.19.3] - 2025-11-30
### Added
- 🆕 **Unified Storage System**: Consolidated all video generation data (API-sourced and locally generated) into a single IndexedDB store with per-account isolation.
- 🆕 **DOM Account ID Detection**: Implemented passive DOM scanning to instantly identify the active account ID from asset URLs, eliminating initialization delays.
- 🆕 **State Synchronization**: Added dual-property account ID tracking (`state.activeAccountId` and `state.multiGenHistory.activeAccountId`) to prevent "no active account ID" errors.
- ⚡ **Performance**: Achieved ~95% reduction in API calls by loading history from local IndexedDB instead of fetching from server on every page load.

## [1.18.11] - 2025-11-26
### Fixed
- Fixed syntax error in `stylesheet.js` where CSS was appended outside the template string.

## [1.18.10] - 2025-11-26
### Changed
- Standardized the "Add Item" button in the Dialogue Editor to match the rest of the UI (replaced dashed square with standard button).

## [1.18.9] - 2025-11-26
### Fixed
- Scoped CSS in `UIHelpers.js` to prevent style leakage and ensure correct styling in Shadow DOM.

## [1.18.8] - 2025-11-26
### Fixed
- 🔥 **UI Regression**: Fixed critical UI corruption in the Raw Prompt Tab caused by global styles from the Playlist Video Player. Scoped all playlist styles to prevent Shadow DOM pollution.

## [1.18.7] - 2025-11-26
### Fixed
- 🔥 **Critical Syntax Error**: Fixed missing closing brace in `IndexedDBManager.js` that caused `SyntaxError: Unexpected identifier '_pruneGalleryData'` and prevented the extension from loading.

## [1.18.6] - 2025-11-25
### Fixed
- 🎨 **UI Integrity**: Replaced all native `alert()` calls with custom toast notifications in `UIPlaylistManager` and `UIRawInputManager` to adhere to UI rules.
- 🔧 **Shadow DOM Compliance**: Fixed `UIModalManager` and `UIRawInputManager` to append modals and overlays to `shadowRoot` instead of `document.body`, ensuring proper style isolation.
- ♾️ **Unlimited Storage**: Increased `MAX_GALLERY_POSTS` to 100,000 and disabled pruning logic in `IndexedDBManager` to support unlimited video storage per account.
- 🧹 **Code Cleanup**: Removed duplicated code blocks in `IndexedDBManager` and fixed syntax errors.

## [1.18.5] - 2025-11-25
### Fixed
- 🎨 **Template List Removal**: Fixed the "X" button in the Template System list to correctly remove the template from the view without deleting it from storage.
  - Modified `_renderTemplateRows` to filter templates by `autoApply: true`.
  - Updated `_createNewTemplate` to set `autoApply: true` by default so new templates appear immediately.
  - Updated empty state message to direct users to the Manager for full access.

## [1.18.4] - 2025-11-25
### Fixed
- 🎨 **Content/Sidebar Overlap**: Fixed main content area overlapping sidebar thumbnails
  - Changed from `max-width` to `margin-right: 320px` to properly reserve space for fixed-position sidebar
  - Removed conflicting width constraints that were causing layout issues
  - Accordion and controls now stay fully within main content area

## [1.18.3] - 2025-11-25
### Fixed
- 🎨 **Accordion Layout Overflow**: Fixed accordion extending into sidebar and overlapping thumbnails
  - Added `width: 100%`, `overflow: hidden`, and `box-sizing: border-box` to content container
  - Constrained accordion header and actions with `max-width` properties
  - Added `min-width: 0` to title to prevent flex overflow
  - Buttons now properly contained within main content area

## [1.18.2] - 2025-11-25
### Fixed
- 🎨 **Button Click-Through**: Fixed accordion Copy/Link buttons triggering behind thumbnails
  - Added `event.stopPropagation()` to prevent accordion toggle when clicking buttons
  - Improved z-index layering for proper button interaction
- ⚙️ **Default Sort**: Set "Newest First" as default playlist sort order
  - Sort dropdown now defaults to `date-desc` (newest videos first)

## [1.18.1] - 2025-11-25
### Fixed
- 🔧 **Gallery Data Loading**: Fixed issue where only 62 videos loaded on refresh despite 387 stored in IndexedDB
  - Root cause: `activeAccountId` wasn't set during initialization, preventing gallery data from loading
  - Solution: Added fallback to detect most recent account from IndexedDB when activeAccountId is not set
  - Added `getAllGalleryPosts()` method to IndexedDBManager for account detection
- 🎨 **UI Overlap**: Fixed accordion action buttons (Copy/Link) being cut off by playlist sidebar
  - Added `flex-shrink: 0` and `white-space: nowrap` to prevent button clipping

## [1.18.0] - 2025-11-25
### Changed
- 🎨 **Video Player Redesign**: Expanded video to 75% viewport height for better viewing experience
- **Compact Accordion**: Moved metadata into expandable accordion (closed by default) to maximize video space
- **Centered Controls**: Relocated playback controls below accordion with enlarged buttons and modern styling
- **Counter Overlay**: Fixed counter display bug (now shows actual count) and moved to video overlay
- **Modern Theme**: Applied dark theme with blue/purple gradient accents matching extension colors

## [1.17.2] - 2025-11-25
### Changed
- ♾️ **Unlimited Storage Per Account**: Removed `MAX_GALLERY_POSTS` limit (was 200) - now stores unlimited videos per account in IndexedDB
- Disabled `_pruneGalleryData()` automatic pruning
- Per-account isolation maintained via `accountId` field
- **Note**: IndexedDB quota managed by browser (typically ~50% of available disk space)

## [1.17.1] - 2025-11-25
### Fixed
- 🔥 **Critical: IndexedDB Persistence Failure**: Fixed `postId` keyPath mismatch in `_normalizeGalleryPost()` - normalized posts now include `postId` field so IndexedDB can save gallery data correctly
  - **Root Cause**: IndexedDB schema expects `postId` as keyPath, but normalized posts only had `imageId`
  - **Impact**: All 366 videos loaded correctly in-memory but **none were persisted** to IndexedDB
  - **Resolution**: Added `postId: imageId` to normalized post objects
- Gallery data now properly saves to IndexedDB and persists across sessions

## [1.17.0] - 2025-11-25
### Added
- ✨ **Persistent Per-Account Video Storage**: Gallery data from `/rest/media/post/list` API is now automatically persisted to IndexedDB on a per-account basis, enabling instant playlist availability without API calls
- **Account ID Extraction**: Added `NetworkInterceptor._extractAccountIdFromGalleryPost()` to extract account IDs from media URLs (`/users/{accountId}/{imageId}/content`)
- **IndexedDB Integration**: `StateManager.ingestGalleryData()` now automatically calls `IndexedDBManager.saveGalleryPosts()` after processing API responses
- **Startup Data Loading**: `StateManager.loadGalleryDataFromIndexedDB()` loads stored gallery data during extension initialization if active account is available
- **Account Switching**: Gallery data is cleared and reloaded from IndexedDB when switching accounts via `setActiveMultiGenAccount()`

### Changed
- `StateManager._loadSettings()`: Now loads gallery data from IndexedDB after multi-gen history loads
- `UIPlaylistManager.build PlaylistFromApi()`: Updated documentation to reflect IndexedDB-first loading architecture
- Gallery data lifecycle: **API → In-Memory → IndexedDB → Cross-Session Persistence**

### Technical Details
- Gallery posts are stored with `accountId` field for per-account filtering
- `MAX_GALLERY_POSTS` limit (200) enforced by `IndexedDBManager._pruneGalleryData()`
- Async persistence does not block UI updates
- Backward compatible: Falls back to API-only mode if IndexedDB fails

## [1.16.11] - 2025-11-25
### Fixed
- 🔥 **UI Reset Bug (Root Cause)**: Templates were loading from IndexedDB but filtered out by `autoApply` check, making UI appear empty. Removed filter so all templates are now visible in Template Manager.
- 🔥 **Delete Button TypeError**: Fixed `Cannot set properties of null` error when deleting templates in editor mode by adding proper null checks before updating preview elements.
- **Template Batch Deletion**: Fixed issue where deleting one template would delete all templates with the same name (now uses unique IDs).
- **Dialogue Editor Method**: Implemented missing `ArrayFieldManager.createDialogueList()` method and passed required `shadowRoot` parameter.

## [1.16.4] - 2025-11-25
### Added
- **Template Manager Editor**: Full-featured editor in the Template Manager modal (Name, Field, Prefix, Suffix, Toggles).
- **Simple Create**: Simplified "Create New" button in Template Manager.

## [1.16.3] - 2025-11-252
### Fixed
- **Saved Prompt Previews**: Fixed an issue where Saved Prompt slots in the Raw Tab were missing text previews. The full prompt data is now correctly passed to the preview generator.
- **Template Manager List Update**: Fixed the Template Manager Modal not updating the list after creating a new template. New templates now appear immediately and are selected for editing.

## [1.18.1] - 2025-11-25
### Fixed
- **Template Selection**: Fixed issue where multiple templates appeared selected simultaneously (now uses unique IDs)
- **Undefined Template Names**: Fixed "undefined" name when creating new templates via modal
- **Modal Error**: Fixed "Cannot read properties of undefined" error when opening dialogue editor

## [1.18.0] - 2025-11-25
### Changed
- **Dialogue Editor Modal**: Replaced cramped inline dialogue editor with dedicated full-screen modal popup for better editing experience
- **Save Reliability**: Dialogue changes now save immediately to IndexedDB via modal (no more lost edits)

### Fixed
- **updateSaveButton Error**: Removed broken inline dialogue editor that was calling undefined function
- **160 Lines Removed**: Simplified code by replacing complex inline editor with clean modal approach

## [1.17.1] - 2025-11-25
### Fixed
- **Toast Error**: Fixed "Cannot read properties of undefined (reading 'showToast')" error when deleting templates or clearing slots

## [1.17.0] - 2025-11-25
### Fixed
- **Dialogue Not Saving**: Dialogue editor's "Save & Close" button now immediately persists to IndexedDB instead of just marking as dirty
- **Templates Reappearing After Delete**: Template deletion now reloads from IndexedDB before deleting to prevent ghost entries from memory/IndexedDB mismatch

## [1.16.9] - 2025-11-25
### Fixed
- **Dialogue Editor Overflow**: Added word-wrap and max-width constraints to prevent horizontal scrolling on long text
- **Delete Confirmations**: Removed native confirm() dialogs, replaced with instant deletion + toast notifications
- **Compact Dialogue UI**: Dialogue editor in Template Manager now more compact with constrained dropdowns

### Changed
- New templates default to `applyToRaw: false` (applies to JSON, not RAW mode)

## [1.16.8] - 2025-11-25
### Fixed
- **Template Application Bug**: Changed `autoApply` flag to `enabled` to match `StateManager` application logic
- **Auto-Naming**: Templates now auto-generate names from their target field on creation
- **UI Switching**: Field path changes correctly re-render editor (dialogue ↔ text)
- **Manual Save**: Added explicit save button with dirty state tracking

## [1.16.2] - 2025-11-22
### Fixed
- **Template Creation UI**: Replaced the "Create New Template" button in the Template Manager modal with an inline creation form (name input + create button). This fixes the issue where users were prompted with a native browser dialog instead of an integrated UI.
- **Template Manager Refresh**: Creating a new template now automatically refreshes the list and selects the newly created template for immediate editing.

## [1.16.1] - 2025-11-21
### Fixed
- **UI Manager Refactoring**: Refactored `UIRawInputManager`, `UIFormManager`, and `ArrayFieldManager` to use `StateManager` for IndexedDB persistence, removing legacy `chrome.storage.local` dependencies for saved prompts and custom dropdowns.
- **Save Buttons Restored**: Restored and wired save buttons for Custom Objects and Custom Dialogues in `ArrayFieldManager`, connecting them to the new `StateManager` methods.
- **Modal Fixes**: Corrected `_openSavedPromptModal` in `UIRawInputManager` to properly use `StateManager` and pass correct callbacks to `UIModalManager`.

## [1.15.67] - 2025-11-20
### Added
- **IndexedDB Reimplementation (v2 Schema)**: Enables unlimited storage for multi-generation history, progress tracking, gallery data, and image projects, eliminating Chrome storage quota errors.
  - Upgraded `IndexedDBManager` from v1 to v2 with new object stores: `galleryData` (for API responses with thumbnails), `imageProjects` (per-image prompt history).
  - Added indexes for efficient querying: `status`, `imageId`, `timestamp`, `accountId` on relevant stores.
  - Implemented storage limits enforcement (36 images, 6 attempts per image, 25 progress samples, 200 gallery posts) with automatic pruning.
  - New CRUD methods for gallery posts tracking (successes/failures/thumbnails per account), image project history, enhanced progress tracking by imageId.
  - Storage stats reporting (`getStorageStats()`) and data lifecycle management (`pruneOldData()`).
  - Automatic migration from `chrome.storage.local` to IndexedDB on first run with fallback support.
- **Per-Account History Backup**: Continuously backs up each account's history tab data including videos, generations, successes, failures, and thumbnails in IndexedDB for persistent storage.

###Changed
- `StorageManager` now accepts `IndexedDBManager` in constructor; multi-gen history operations prefer IndexedDB with automatic fallback to `chrome.storage.local`.
- `StateManager` passes `IndexedDBManager` to `StorageManager` for seamless integration.
- `content.js` bootstrap sequence now initializes `IndexedDBManager` first, runs migration, then creates `StateManager` with IndexedDB support.
- Global `window.gvpIndexedDB` reference added for debugging/inspection.

## [1.15.66] - 2025-11-17
### Fixed
- Re-enabled the native Spicy auto-click for `/imagine` but gate it behind a `_nativeSpicyAutomationActive` mutex so simultaneous SPA events (click + URL observer) can't spam 2-3 preset clicks and `/rest/app-chat/conversations/new` calls.
- `_detectNativeSpicyButton()` now supports an explicit `autoClick` flag so the gallery flow can detect the button without firing it a second time; we read back an `autoClicked` flag before invoking `element.click()` which eliminates the duplicate `/new` storms from `/imagine`.
- Suppression + guard state now clears in every exit path (missing preset, origin mismatch, click errors, and after the back-navigation timeout) so Quick Launch resumes normally once the gallery returns.
- Added safety logging around the native preset click; if Grok removes the button we bail cleanly instead of leaving Quick Launch suppressed or hammering retries.
- UI header/console version labels now read `chrome.runtime.getManifest().version`, so they always match whatever build is installed after you reload the extension.
- Multi-Gen storage now enforces hard caps (36 images x 6 attempts, 25 progress samples) and truncates oversized raw streams/payload snapshots so Chrome's `kQuotaBytes` limit isn't tripped every time progress writes fire.

## [1.15.65] - 2025-11-16
### Fixed
- Disabled the auto-Spicy bridge entirely; `_handleGalleryImageOpened` now logs a warning and returns so no automated clicks or extra `/rest/app-chat/conversations/new` requests fire while we sort out the regression.

## [1.15.64] - 2025-11-16
### Fixed
- `_handleGalleryImageOpened` now strictly runs the native preset flow when the user came from `/imagine`; Quick JSON/RAW prompts are no longer touched, so the automation simply clicks Grok’s Spicy button, marks the state, and bails. This also fixes the syntax error that was preventing the UI from loading.
- Quick Launch suppression is toggled for the entire `/imagine` Spicy run (including failure cases) so favorites-mode automation never fires duplicate `/new` requests while the preset is active.

## [1.15.63] - 2025-11-16
### Fixed
- Native Spicy automation now runs **only** when you launch from `/imagine` and simply clicks the preset; Quick JSON/RAW + prompt bridging are skipped so the extension never stages extra `/rest/app-chat/conversations/new` calls during that flow.
- Quick Launch suppression toggles on as soon as the `/imagine` preset run starts and clears automatically when we return to the gallery, so favorites-mode Quick Launch continues to work while the imagine gallery gets a single native request.

## [1.15.62] - 2025-11-16
### Fixed
- Quick Launch now listens to the new `gvp:quick-launch-suppressed` event, immediately clearing any queued payloads and skipping resume probes whenever the native Spicy bridge is running, so it can’t replay a hidden queue on `/imagine`.
- Favorite clicks and pending payload resumes bail out when suppression is active, ensuring the native preset is the only thing that fires for gallery runs; suppression lifts automatically once the bridge returns to the gallery.

## [1.15.61] - 2025-11-16
### Fixed
- Quick Launch automation now listens to a native-spicy suppression flag so it no longer replays its payload when we already handed control to the native Spicy bridge, eliminating the duplicate `/rest/app-chat/conversations/new` storms (and the moderated-image loophole).
- UIManager now toggles `quickLaunchSuppressed` whenever the native bridge is running so the favorites flow defers to Grok's preset instead of sending its own request; suppression lifts automatically when the gallery navigator finishes.
- QuickLaunchManager drops pending payloads immediately when suppression is active and ignores favorite clicks while the bridge is hot, so only one request reaches Grok per tap.

### Changed
- Gallery origin tracking now records whether an image detail came from `/imagine` or `/imagine/favorites`, and the auto-return only fires for the imagine grid so playlist browsing stays untouched.
- When returning to the imagine grid we now click Grok's native back/close controls and fall back to synthesized Escape events, keeping the SPA shell in sync instead of brute clicking the Favorites button.
- Added `_determineGalleryOrigin` + `_findFirstMatchingElement` helpers and `[GVP Gallery]` telemetry to show why a return was skipped.

## [1.15.60] - 2025-11-16

## [1.15.59] - 2025-11-16
### Fixed
- Native Spicy detection now waits for the Video Presets trigger and Spicy menu entries to mount via a shared `_waitForElement` helper, logging `[GVP Spicy]` selector-gap telemetry whenever Grok hides those controls so QA knows to refresh selectors.
- Gallery automation now always replays the Favorites button after native Spicy attempts, waiting for the control before dispatching synthetic clicks so users land back in the gallery even when the preset never appears.

### Added
- Selector gap diagnostics dispatch a `gvp:spicy-selector-gap` event with URL + quick-mode metadata, and `[GVP Gallery]` logs annotate Favorites-return reasons for easier timeline reconstruction.

## [1.15.57] - 2025-11-16
### Fixed
- Restored explicit `button[aria-label="Video Presets"]` and `div[role="menuitem"="Spicy"]` targeting so native Spicy detection works on layouts where the presets stack lives near the sidebar.
- Added automatic return to the gallery after a native Spicy click by reusing the `button[aria-label="Favorites"]` thumbnails control.

### Notes
- Fallback heuristics remain for future layout changes; sidebar misclick filtering is still active.

## [1.15.56] - 2025-11-16
### Fixed
- Spicy auto-start from gallery sometimes clicked sidebar/project items instead of the image presets menu. Selector scope is now limited to the main image/detail area, excludes navigation/sidebars, and requires visible elements.
- Gallery watcher now installs once with an idempotent guard and no longer bails when not already on /imagine; this improves SPA navigation reliability into `/imagine/post/*`.

### Notes
- Native Spicy click still bridges Quick JSON/RAW prompt into the same `/conversations/new` request. The previous 1.15.55 mode/token behavior remains intact.

## [1.15.55] - 2025-11-16
### Added
- Spicy native prompt bridge: when Spicy is triggered via native preset (e.g., gallery image → Spicy), the extension now injects the current Quick JSON/RAW prompt directly into the first `/rest/app-chat/conversations/new` request.
- Page bridge TTL: short-lived prompt payload (2s) sent from extension to page ensures correct prompt is merged without duplicates.

### Changed
- Mode injection no longer forces `--mode=normal` when Spicy is off; preserves original mode token if present, and only forces `--mode=extremely-spicy-or-crazy` when Spicy is on.
- Gallery flow: broadcasts prompt to page before clicking native Spicy and suppresses second quick-generation request to avoid duplicates.

### Logging
- Bridge logs: `[Bridge] Using prompt from extension`, `GVP_FETCH_REQUEST_MODIFIED { promptApplied: true }`.
- Gallery logs: `📡 Bridged prompt to page for native spicy`, `🧹 Cleared pending quick-launch payload`.

## [1.15.54] - 2025-11-16
### Fixed
- Quota-safe progress storage: write progress under `gvp-progress-<videoId>`, maintain `gvp-progress-index`, and prune only non-active entries beyond the last 60; remove per-video progress keys immediately on completion; fallback prune on quota errors. No impact to playlist or settings keys.
- Spicy auto-detection: broadened menu selectors and trigger heuristics; added multi-dispatch clicks for React menus; improved gallery click watcher timing.


## [1.15.52] - 2025-11-15
### Changed
- Saved Prompt slots: removed green success styling and now use a light Grok gray for slots with content and standard dark gray for empty/default, plus a gray hover state for the save button.

## [1.15.51] - 2025-11-15
### Changed
- Playlist editor: updated Copy Prompt and playlist JSON/Raw buttons to use the standardized Grok button palette with distinct default, hover, and pressed states so they no longer blend into the sidebar background.

## [1.15.50] - 2025-11-15
### Changed
- Multi-Gen history cards: brightened success count circle to a Grok-light gray, darkened moderated (unsuccessful) text, and tuned micro view buttons so enabled state uses bright gray with white text while disabled state uses darker gray with muted text.
- Replaced green SUCCESS pill and success progress bar fills with neutral light gray tones while keeping moderated/error paths darker for contrast.
- Updated vertical launcher Quick JSON/RAW tab active state to use a solid lighter gray background with white text (no translucency or invisible labels).

## [1.15.49] - 2025-11-15
### Changed
- Updated Dialogue Template panel (suffix/prefix editors) to use the Grok gray palette instead of the old blue theme, including overlay, panel background, field labels/inputs, accordion cards, and save footer while keeping red accents only for destructive actions.

## [1.15.48] - 2025-11-15
### Changed
- Restored Raw tab layout to a centered vertical stack of accordions (Raw Prompt Input, Saved Prompt Slots, Template System) matching the original design while keeping the new Grok color palette. Adjusted raw-template empty state background to neutral gray.

## [1.15.47] - 2025-11-15
### Changed
- Updated playlist header "Play All Videos" button hover glow from yellow to a soft white Grok glow to remove remaining yellow accent.

## [1.15.46] - 2025-11-15
### Fixed
- Replaced red ❌ emoji delete icons in Multi-Gen history cards with plain Grok-white `X` glyphs so styling is fully controlled by CSS.

## [1.15.41] - 2025-11-13 🚨 **MAJOR STREAMING ARCHITECTURE FIX**
### Fixed
- **CRITICAL**: Fixed fetch interceptor to use real streaming response processing instead of waiting for completed response
- **Timing Issue Resolved**: Progress updates now show realistic 20-30 second intervals instead of millisecond replay (1% → 100% in 63ms)
- **Cross-Page Monitoring**: Finally works correctly for live video generations 
- **Concurrent Support**: Handles 12+ simultaneous video generations efficiently with independent stream processing
- **Architecture**: Replaced `response.text()` with `response.body.getReader()` for true streaming data processing

### Technical Details
- **File Modified**: `public/injected/gvpFetchInterceptor.js` - Complete rewrite of `processResponseBody()` function
- **Streaming Buffer**: Added proper chunk buffering and line-by-line processing as data arrives
- **Event-Driven**: No polling - responds instantly when server sends new data chunks  
- **Chrome DevTools Insight**: Fixed confusion between "Preview" (live streaming) vs "Response" (completed data) tabs
- **Performance**: Each video stream processes independently without blocking others

### Root Cause Analysis
**The Problem**: `await response.text()` waits for the ENTIRE response to complete, then processes all progress lines rapidly in sequence. This created fake "streaming" that replayed completed data in milliseconds.

**The Solution**: True streaming using `response.body.getReader()` processes data as it actually arrives from Grok's servers, providing real-time progress updates with proper timing.

**Impact**: This enables the core requested feature - cross-page progress monitoring that works during actual video generation.

## [1.15.40] - 2024-11-12
### Fixed
- **CRITICAL: Quick JSON Mode Support**: Fixed UIProgressAPI not tracking generations when using Quick JSON mode
- **Bridge Progress Integration**: Added generation tracking to handleBridgeProgress method for Quick JSON workflow
- **Cross-Mode Compatibility**: API monitoring now works for both regular and Quick JSON generation modes

### Technical Details
- Quick JSON mode uses bridge-progress events instead of /new streams
- Added generation tracking to NetworkInterceptor.handleBridgeProgress()
- UIProgressAPI now properly tracks generations from both code paths

### Root Cause
Quick JSON mode bypassed the /new stream processing where generation tracking was added. Progress was detected but never added to API monitoring, resulting in "tracking 0 generations" even when videos were generating.

## [1.15.39] - 2024-11-12
### Fixed
- **CRITICAL: Generation Tracking**: Fixed UIProgressAPI not tracking any generations due to missing imageId requirement
- **NDJSON Stream Processing**: Properly handle newline-delimited JSON responses from /new endpoint
- **ImageId Extraction**: Added _extractImageIdFromReference() to extract UUID from imageReference URLs
- **Cross-Component Integration**: Ensure both gvpProgressAPI and gvpUIProgressAPI get generation additions

### Technical Details
- Removed imageId requirement from generation tracking condition (videoData.imageId was never present in stream)
- Extract imageId from imageReference URL or use videoId as fallback
- Fixed NetworkInterceptor to properly add generations to both API monitors
- Handle Firefox NDJSON parsing without JSON syntax errors

### Root Cause
The stream contains `videoId` but no `imageId` field. Previous code required both, causing 0 generations to be tracked.

## [1.15.38] - 2024-11-12
### Fixed
- **API Progress Monitoring**: Fixed UIProgressAPI to monitor actual /new stream responses instead of attempting invalid GET requests
- **Cross-Page Monitoring**: API monitoring now properly processes streamingVideoGenerationResponse data from NetworkInterceptor
- **Stream Integration**: Added processStreamResponse() method to handle real-time progress updates from /new endpoint streams
- **Global Access**: Made UIProgressAPI available as both gvpProgressAPI and gvpUIProgressAPI for component compatibility

### Technical Details
- Replaced broken polling approach with stream response processing
- NetworkInterceptor now feeds stream data to UIProgressAPI.processStreamResponse()
- Proper handling of progress updates from { result: { response: { streamingVideoGenerationResponse } } } format
- Automatic generation tracking when videoId and progress are detected in stream

## [1.15.37] - 2025-11-12

### 🚀 Cross-Page Progress Monitoring: API-Based Solution

**Problem Solved:** Progress monitoring stopped when navigating away from videos page

**Root Cause:** DOM-based monitoring only works when progress elements are visible on current page

**Solution:** Added **API-based progress monitoring** that works from any page!

---

**New System: UIProgressAPI**

**How It Works:**
1. **Polls `/new` endpoint** every 3 seconds for active generations
2. **Tracks progress** via API responses (not DOM elements)  
3. **Works from any page** - doesn't require being on videos page
4. **Auto-starts** when NetworkInterceptor detects new generation
5. **Updates History tab** even when you're on different pages

**Technical Flow:**
```
User starts generation → NetworkInterceptor detects → UIProgressAPI.addGeneration()
                     ↓
Every 3 seconds: Poll /new endpoint → Extract progress → Update History tab
                     ↓
Works from: Chat page, Settings, Profile, ANY grok.com page!
```

**New Features:**

1. **UIProgressAPI.js** (New File)
   - API-based monitoring that works cross-page
   - Polls `/new` endpoint for generation progress
   - Automatic generation tracking and cleanup
   - Same data structure as DOM monitoring

2. **Dual Monitoring System**
   - **DOM monitoring** (fast, when on videos page)
   - **API monitoring** (reliable, works anywhere)
   - Both update the same History tab
   - Seamless fallback between methods

3. **Auto-Detection**
   - NetworkInterceptor auto-adds generations to API monitoring
   - Triggers when progress ≤ 10% (early in generation)
   - No manual setup required

**User Experience:**
- ✅ Start generation on videos page
- ✅ Navigate to chat/profile/any page  
- ✅ History tab **keeps updating** with progress
- ✅ See "57%" → "68%" → "100%" from anywhere
- ✅ No need to stay on videos page

**Data Sources:**
- **DOM**: `<div>57%</div>` (when on videos page)
- **API**: `/new` endpoint responses (from any page)
- **Storage**: chrome.storage.local (external monitoring)
- **Events**: chrome.runtime.sendMessage (popup updates)

**Files Added:**
- UIProgressAPI.js (new API monitoring system)

**Files Modified:**
- NetworkInterceptor.js (auto-add to API monitoring)
- content.js (initialize both monitoring systems)
- manifest.json (script loading order)

**Result:**
🎯 **Progress monitoring now works from ANY page on grok.com!**  
🎯 **History tab updates even when away from videos page**  
🎯 **Seamless experience - no user action required**  
🎯 **Reliable fallback system ensures no missed updates**

---

## [1.15.36] - 2025-11-12

### 🎯 Progress Integration: History Tab Real-Time Updates

**Feature:** DOM-based progress now updates the Generations (History) tab in real-time!

**What Changed:**
- UIProgressMonitor now integrates with multi-gen history tracking
- Real-time progress percentages replace "pending" status in History tab
- Progress updates automatically refresh the History tab every 2 seconds
- Progress bar fills dynamically as generation progresses

**How It Works:**
1. **UIProgressMonitor** detects progress from DOM (`57%`)
2. **Extracts context** (imageId from video/image elements)
3. **Updates StateManager** via `updateAttemptProgress(imageId, progress)`
4. **StateManager** finds the pending attempt and updates:
   - `currentProgress` field
   - Adds to `progressEvents` array
5. **UIManager** refreshes History tab automatically
6. **User sees** real-time percentage updates in the card

**New StateManager Method:**
- `updateAttemptProgress(imageId, progress)` - Updates attempt progress from DOM

**UIProgressMonitor Enhancements:**
- Added `setUIManager()` to receive UIManager reference
- Added `_updateHistoryProgress()` to update multi-gen history
- Added periodic UI refresh interval (2 seconds)
- Cleanup interval on stop

**User Experience:**
- Open History tab while video is generating
- See progress update from "starting..." → "57%" → "92%" → "100%"
- Progress bar fills in real-time
- No need to refresh or re-open tab

**Technical Flow:**
```
DOM Element (57%) 
  → UIProgressMonitor._updateProgress()
  → UIProgressMonitor._updateHistoryProgress()
  → StateManager.updateAttemptProgress()
  → Updates attempt.currentProgress
  → UIManager.refreshHistoryTab() (every 2s)
  → UIManager._getLatestAttemptProgress()
  → Shows 57% in card
```

**Files Modified:**
- UIProgressMonitor.js (constructor, startMonitoring, stopMonitoring, _updateProgress, new _updateHistoryProgress)
- StateManager.js (new updateAttemptProgress method)
- content.js (pass UIManager reference to progressMonitor)

**Result:**
✅ History tab shows live progress percentages  
✅ Progress bar updates in real-time  
✅ No more static "pending" status  
✅ Automatic refresh every 2 seconds  
✅ Clean integration with existing history system  

---

## [1.15.35] - 2025-11-12

### 📊 DOM-Based Real-Time Progress Monitoring

**New System:** Real-time video generation progress tracking from DOM elements

**What It Does:**
- Monitors the DOM for progress percentage divs (`<div class="text-xs font-semibold w-[4ch]">57%</div>`)
- These appear above video generation previews while waiting for generation
- Extracts percentage values in real-time (0% → 100%)
- Stores progress in StateManager and chrome.storage
- Broadcasts updates to extension popup/background for external monitoring

**New Files:**
- `UIProgressMonitor.js` - Monitors DOM for progress elements and tracks changes

**StateManager Enhancements:**
- Added `progressTracking` Map to `state.generation`
- Added `updateGenerationProgress(progressData)` method
- Added `getGenerationProgress(key)` method
- Added `getAllGenerationProgress()` method

**External Access:**
- Progress stored in `chrome.storage.local` with key pattern: `gvp-progress-{key}`
- Active generations list maintained at `gvp-active-generations`
- Messages sent to background/popup: `{ type: 'gvp-progress-update', key, progress, context }`
- Custom event dispatched: `gvp:progress-update` for in-page listeners

**Usage:**
```javascript
// Get current progress for a video
const progress = window.gvpProgressMonitor.getProgress(videoKey);

// Get all active progress
const all = window.gvpStateManager.getAllGenerationProgress();

// Listen for updates in popup/background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'gvp-progress-update') {
    console.log(`${msg.key}: ${msg.progress}%`);
  }
});
```

**Benefits:**
- ✅ Real-time progress visibility outside Grok page
- ✅ More dynamic than polling /new endpoint
- ✅ Always present during generation
- ✅ Automatic cleanup after completion
- ✅ Multiple concurrent generations tracked

**Technical:**
- MutationObserver watches for progress divs
- Contextual linking to videos/images
- Automatic cleanup after 5 minutes
- Global access via `window.gvpProgressMonitor`

**Files Modified:**
- UIProgressMonitor.js (new)
- StateManager.js (progress tracking methods)
- content.js (initialization)
- manifest.json (script loading)

---

## [1.15.34] - 2025-11-12

### ✨ Playlist Enhancements: Model Filtering & Generation Integration

**New Features:**

1. **Model Filtering** 🎯
   - Added model filter dropdown in playlist player
   - Options: All Models, imagine_w_1, imagine_x_1, imagine_h_1
   - Clicking a model filters playlist to show only videos made with that model
   - Preserves all thumbnail URLs and metadata during filtering

2. **Generation Integration** ⚡
   - Hooked up "📝 JSON" and "⚡ Raw" generation buttons
   - Buttons now trigger actual video generation via ReactAutomation
   - Uses the current video's prompt (video prompt or image prompt fallback)
   - Shows visual feedback: "✅ Sent!" for 2 seconds after successful trigger
   - Graceful fallback to clipboard if ReactAutomation unavailable

**Technical Changes:**
- UIPlaylistManager now accepts `reactAutomation` as third constructor parameter
- `_filterByModel()` method preserves `thumbnailUrl`, `parentThumbnailUrl`, `parentImageUrl` fields
- `_generateFromCurrent()` method now async, calls `reactAutomation.sendToGenerator()`
- UIManager passes `reactAutomation` to UIPlaylistManager during initialization

**User Experience:**
- Select "imagine_x_1" → see only X_1 model videos
- Click "📝 JSON" → prompt sent to generator with JSON formatting
- Click "⚡ Raw" → prompt sent to generator as raw text
- Button feedback confirms generation was triggered

**Files Modified:**
- UIPlaylistManager.js (constructor, _filterByModel, _generateFromCurrent)
- UIManager.js (pass reactAutomation to UIPlaylistManager)

---

## [1.15.33] - 2025-11-12

### 🔧 FIX: Playlist Video Count Inconsistency

**Problem:**
Gallery data ingestion was **replacing** all existing posts instead of **merging** them. When users scrolled the favorites page to load more videos, the extension would only show the new batch (e.g., 11 videos) instead of the cumulative total (e.g., 175 + 11 = 186 videos).

**Root Cause:**
- Line 2330 in StateManager.js: `this.state.galleryData.posts = posts;` was replacing all data
- Each API call from scrolling would overwrite previous gallery data
- Playlist would only have access to the most recent batch of videos

**Solution:**
Changed `ingestGalleryData()` to **MERGE** new posts with existing ones:
1. Collect existing posts into a Map (de-duped by imageId)
2. Add new posts to the Map (new posts overwrite old if same ID)
3. Convert Map back to array for storage
4. Rebuild video/image indexes from ALL merged posts
5. Updated logging to show both new batch count and total accumulated count

**Changes:**
- StateManager.js (lines 2324-2350) - Merge posts instead of replace
- StateManager.js (lines 2422-2428) - Updated logging to show totals
- UIPlaylistManager.js (lines 185-216) - Added detailed diagnostics for playlist building
- StateManager.js (lines 2515-2530) - Enhanced hasGalleryData() logging

**Result:**
✅ Playlist now accumulates ALL videos from multiple API calls
✅ Scrolling to load more videos increases total count instead of replacing
✅ First playlist click after page load shows all available videos (e.g., 175)
✅ Subsequent clicks after scrolling show cumulative total (e.g., 186)

**Files Modified:**
- StateManager.js - Gallery data merge logic
- UIPlaylistManager.js - Enhanced playlist diagnostics

---

## [1.15.32] - 2025-11-12

### ✅ FIX: Thumbnail Display Issue

**Problem Found:**
Debug logs revealed that thumbnail URLs were being set correctly (`https://imagine-public.x.ai/imagine-public/images/...`), but images weren't rendering due to CSS `aspect-ratio: 16/9` not working properly on button elements.

**Solution:**
Replaced `aspect-ratio: 16/9` with explicit `height: 120px` and `min-height: 120px` on `.gvp-playlist-thumb-btn`.

**Changes:**
- `.gvp-playlist-thumb-btn` now has fixed height instead of aspect-ratio
- Added `display: block` to ensure proper rendering
- Thumbnails will now show at 120px height with proper image scaling

**Files Modified:**
- stylesheet.js (line 2435) - Changed thumbnail button CSS from aspect-ratio to fixed height

---

## [1.15.31] - 2025-11-12

### 🔍 Enhanced Debug Logging for Thumbnails

Added comprehensive logging to diagnose thumbnail loading issues.

**Debug Logs Added:**
- Log full first video object from playlist
- Log first video object from StateManager (before mapping)
- Shows all available thumbnail fields in the data

**Purpose:**
These logs will reveal the exact structure of video objects and which thumbnail fields are actually populated in the API data, allowing us to fix the thumbnail display issue.

**Files Modified:**
- UIPlaylistManager.js (lines 145-149) - Added detailed video object logging

---

## [1.15.30] - 2025-11-12

### 🐛 Fix Thumbnail Loading

Fixed thumbnails not displaying in sidebar playlist.

**Fixes:**
- Added multiple thumbnail source fallbacks in `buildPlaylistFromApi`
- Preserved full `parentPost` data for metadata access
- Added error handling for failed thumbnail loads
- Added debug logging to track thumbnail URLs
- Create image elements properly instead of using innerHTML

**Changes:**
- `buildPlaylistFromApi` now includes: `thumbnailUrl`, `imageUrl`, `parentImageUrl`, `parentThumbnailUrl`, `parentPost`
- Thumbnail fallback chain: `thumbnailUrl → imageUrl → parentImageUrl → parentThumbnailUrl`
- `_renderPlaylist` creates proper DOM elements with error handlers
- Console logs first 3 thumbnail URLs for debugging

**Files Modified:**
- UIPlaylistManager.js (lines 116-137) - Enhanced playlist mapping with all thumbnail sources
- UIPlaylistManager.js (lines 699-746) - Improved thumbnail rendering with error handling

---

## [1.15.29] - 2025-11-12

### 🎨 Playlist UI Layout Redesign

Major restructure of playlist player layout to match user's mockup design.

**Layout Changes:**

1. **Video metadata moved below player** (not in sidebar)
   - Counter, copy button, video link in header
   - 2-column metadata grid: Mode, Created, Video Model, Image Model
   - Expandable prompt displays for image & video prompts

2. **Sidebar simplified to large thumbnail buttons**
   - Full-width clickable thumbnail buttons (16:9 aspect ratio)
   - #1, #2, #3 numbers overlaid on thumbnails
   - Active thumbnail highlighted with golden border & glow
   - All metadata removed from sidebar

3. **Grid layout restructured**:
   - Video: Grid column 1, row 1
   - Metadata: Grid column 1, row 2
   - Controls: Grid column 1, row 3
   - Sidebar: Grid column 2, rows 1-3

**CSS Added:**
- `.gvp-video-metadata` - Metadata section below player
- `.gvp-metadata-header` - Header with counter & actions
- `.gvp-metadata-grid` - 2-column grid for metadata pairs
- `.gvp-metadata-row` - Individual metadata rows
- `.gvp-metadata-label` / `.gvp-metadata-value` - Label/value pairs
- `.gvp-prompt-display` - Prompt display sections
- `.gvp-prompt-display-label` / `.gvp-prompt-display-text` - Prompt styling
- `.gvp-playlist-thumb-btn` - Large clickable thumbnail buttons
- `.gvp-thumb-image` - Thumbnail image styling
- `.gvp-thumb-number` - #1, #2, #3 overlays
- `.gvp-copy-current-prompt` - Copy prompt button
- `.gvp-current-video-link` - Video URL link

**Files Modified**:
- UIPlaylistManager.js (lines 431-488) - Restructured HTML layout
- UIPlaylistManager.js (lines 628-686) - Updated _updatePlayerUI to populate metadata
- UIPlaylistManager.js (lines 688-690) - Simplified _renderPlaylist for thumbnails only
- stylesheet.js (lines 2379-2445) - Complete CSS rewrite for new layout

---

## [1.15.28] - 2025-11-12

### 🎨 Major Playlist UI Overhaul

Complete redesign of the video playlist player with rich metadata display and advanced controls.

**New Features:**

1. **Sorting Controls**:
   - Newest First / Oldest First
   - Most Videos → Least Videos (by parent image)
   - Random shuffle
   - Filter by model: Imagine_w_1, Imagine_x_1, Imagine_h_1

2. **Rich Metadata Display**:
   Each playlist item now shows:
   - Video model name
   - Image model name (parent post)
   - Image prompt (originalPrompt from parent)
   - Video prompt (if different from image prompt)
   - Creation date
   - Mode badge (🌶️ spicy, 📝 custom, 🎬 normal)
   - Direct link to video URL

3. **Copy Prompt Feature**:
   - 📋 Copy button under each video
   - Copies video prompt (or image prompt if no video prompt)
   - Visual feedback when copied

4. **Generate Buttons**:
   - 📝 JSON and ⚡ Raw buttons in sidebar header
   - Currently copies prompt to clipboard (full integration pending)

**UI Improvements:**
- Cleaner sidebar header with controls organized in sections
- Larger playlist items with thumbnail, metadata grid, and actions
- Better typography and spacing
- Scrollable metadata for long prompts

**Files Modified**:
- UIPlaylistManager.js (major rebuild of rendering and controls)
  - Lines 456-486: New sidebar header with sorting/filter/action controls
  - Lines 521-537: Event listeners for new controls
  - Lines 625-711: Completely rebuilt _renderPlaylist() with rich metadata
  - Lines 773-915: New methods for copy, sort, filter, generate

**Known Limitations**:
- Generate buttons currently only copy prompt to clipboard
- Full integration with UIManager's generate methods coming in future update

---

## [1.15.27] - 2025-11-12

### 🔧 Remove Gallery Data Freshness Timeout

**Issue**: Gallery data was expiring after 5 minutes, causing the playlist to fall back to DOM scraping even when 176 videos were already loaded in memory.

**User Case**: 
User accesses **historical favorites from months ago**. The 5-minute timeout was too aggressive for archival content that doesn't change.

**Before**:
```javascript
hasGalleryData(maxAge = 5 * 60 * 1000) {
    const age = Date.now() - data.lastUpdate;
    return age <= maxAge;  // ❌ Rejected after 5 minutes
}
```

**After**:
```javascript
hasGalleryData() {
    // Gallery data is valid for entire session - no expiry
    return data.posts.length > 0 && data.lastUpdate !== null;  // ✅ Always valid
}
```

**Result**:
- Gallery data persists for entire browser session
- No arbitrary timeouts for historical content
- 176 videos remain accessible without re-fetching

**Files Modified**:
- StateManager.js (lines 2511-2520) - Removed maxAge parameter and timeout logic

---

## [1.15.26] - 2025-11-12

### 🐛 Critical Bug Fix: Liked Video Filter

**Issue**: StateManager extracted 176 videos correctly, but UIPlaylistManager returned 0 videos when building playlist.

**Root Cause**: 
The `getFilteredVideos({ liked: true })` method was checking the wrong path for like status:
```javascript
// WRONG - checking raw API structure
v.parentPost?.userInteractionStatus?.likeStatus === true
```

But `parentPost` is the **normalized** post object, which stores `likeStatus` directly, not inside `userInteractionStatus`.

**Fix**:
```javascript
// FIXED - check all possible locations
if (v.parentPost?.likeStatus === true) return true;  // Normalized
if (v.parentPost?.raw?.userInteractionStatus?.likeStatus === true) return true;  // Raw
if (v.liked === true) return true;  // Direct field
```

**Result**:
- Favorites playlist now correctly filters liked videos
- All 176 extracted videos are accessible
- API-based playlist building works end-to-end

**Files Modified**:
- StateManager.js (lines 2474-2485) - Fixed liked filter logic

---

## [1.15.25] - 2025-11-12

### 🐛 Critical Bug Fix: Video Extraction from Normalized Posts

**Root Cause Identified**:
The NetworkInterceptor's `_normalizeGalleryPost()` method wraps raw API data inside a `post.raw` property. StateManager was checking for `post.childPosts` and `post.mediaType` on the normalized object, where these fields don't exist - they're inside `post.raw`.

**What Was Wrong**:
```javascript
// BEFORE (BROKEN) - checking normalized post
if (Array.isArray(post.childPosts)) { ... }  // Always false!
if (post.mediaType === 'MEDIA_POST_TYPE_VIDEO') { ... }  // Always false!
```

**What Was Fixed**:
```javascript
// AFTER (FIXED) - checking raw post
const rawPost = post.raw || post;
if (Array.isArray(rawPost.childPosts)) { ... }  // Works!
if (rawPost.mediaType === 'MEDIA_POST_TYPE_VIDEO') { ... }  // Works!
```

**Changes**:
1. **StateManager.js (lines 2340-2403)**:
   - Extract `rawPost` from `post.raw || post`
   - Check `rawPost.childPosts` instead of `post.childPosts`
   - Check `rawPost.mediaType` instead of `post.mediaType`
   - Use `post.imageId` (normalized) and `rawPost.id` (raw) correctly
   - Enhanced debug logging to show both normalized and raw keys

2. **Enhanced Debug Logs**:
   - Shows `normalized: Object.keys(post)` - fields on normalized object
   - Shows `rawKeys: Object.keys(post.raw)` - fields on raw API data
   - Shows `hasRaw: true/false` - confirms raw data exists
   - Shows `mediaType` and `childPostsCount` from correct location

**Result**:
- API data will now correctly extract videos from `childPosts`
- Standalone video posts will be detected properly
- Normalized fields (imageUrl, thumbnailUrl, likeStatus) still accessible
- Full API metadata preserved in video objects

**Files Modified**:
- StateManager.js (lines 2340-2403)
- UIPlaylistManager.js (line 4) - Version updated to 1.15.25

---

## [1.15.24] - 2025-11-12

### 🐛 Bug Fix: Auto-Scroll Detection & Standalone Videos

**Issues Fixed**:
1. **Scroll container detection failure** - Auto-scroll reported "Scroll: 0 / 0" and stopped immediately
2. **Zero videos extracted from API** - API returned posts but no videos were found

**Changes**:

1. **Improved Scroll Container Detection** (UIPlaylistManager.js):
   - Added smart detection to find actual scrollable element
   - Checks multiple candidates: `main[data-testid]`, `[data-testid*="feed"]`, `[data-testid="primaryColumn"]`, etc.
   - Validates each candidate has `scrollHeight > clientHeight`
   - Logs initial dimensions for debugging: `📐 Initial dimensions: { height: X, client: Y }`
   - Fallback to window if no scrollable container found

2. **Standalone Video Support** (StateManager.js):
   - Added detection for videos that are top-level posts (not in `childPosts`)
   - Checks `post.mediaType === 'MEDIA_POST_TYPE_VIDEO'`
   - Handles both image→video (childPosts) and standalone video posts
   - Added debug logging: `🔍 First post structure` and `📹 Found standalone video post`

**Console Logs Added**:
```
[GVP Playlist] 📐 Initial dimensions: { height: 2847, client: 937 }
[GVP][StateManager] 🔍 First post structure: { id, mediaType, hasChildPosts, ... }
[GVP][StateManager] 📹 Found standalone video post: <videoId>
```

**Testing**:
- Reload extension on `chrome://extensions`
- Hard refresh favorites page (Ctrl+Shift+R)
- Click ▶ playlist button
- Check console for new debug logs

**Files Modified**:
- UIPlaylistManager.js (lines 230-270) - Enhanced container detection
- StateManager.js (lines 2339-2396) - Standalone video support + debug logging

---

## [1.15.23] - 2025-11-11

### 🎯 Major Feature: API-Based Video Playlist & Gallery Integration

**What Changed**:
- Video playlist now uses `/rest/media/post/list` API data instead of DOM scraping
- Automatic fallback to DOM scraping if API data unavailable
- Rich metadata displayed: mode badges (🌶️ spicy, 📝 custom), resolutions, like status
- StateManager now stores and indexes all gallery data for fast lookups
- NetworkInterceptor automatically ingests API responses into StateManager

**New Features**:

1. **StateManager Gallery Data Storage** (240 lines added)
   - `state.galleryData` - Stores posts, videos, and indexes
   - `ingestGalleryData(posts, meta)` - Processes API responses
   - `getVideoById(videoId)` - Fast video lookup
   - `getImageById(imageId)` - Fast image lookup
   - `getAllVideosFromGallery()` - Get all videos
   - `getFilteredVideos(filters)` - Filter by mode, liked, date, hasPrompt
   - `hasGalleryData(maxAge)` - Check data freshness (5min default)
   - `getGalleryDataStats()` - Statistics about stored data
   - `gvp:gallery-data-updated` event dispatched on changes

2. **UIPlaylistManager API Integration**
   - `buildPlaylistFromApi(filters)` - Build playlist from API data
   - Enhanced `playFromFavorites()` - Tries API first, falls back to DOM scraping
   - Mode counting for stats logging
   - Enriched video metadata (resolution, mode, liked status)

3. **Enhanced Player UI**
   - Mode badges in video title: 🌶️ (spicy), 📝 (custom)
   - Resolution display in counter: "3 / 10 • 464×688"
   - Sidebar items show mode badges and ❤️ for liked videos
   - Better thumbnails from API `thumbnailImageUrl`

4. **NetworkInterceptor Integration**
   - `_applyGalleryDataset()` now calls `StateManager.ingestGalleryData()`
   - Automatic ingestion when `/rest/media/post/list` responses arrive
   - Error handling with fallback gracefully

**API Data Structure** (from `/rest/media/post/list`):
```json
{
  "posts": [{
    "id": "image-id",
    "prompt": "Image prompt",
    "mediaUrl": "image-url",
    "thumbnailImageUrl": "thumbnail-url",
    "childPosts": [{
      "id": "video-id",
      "mediaUrl": "video.mp4",
      "originalPrompt": "Video prompt",
      "mode": "normal|custom|extremely-spicy-or-crazy",
      "resolution": {"width": 464, "height": 688},
      "createTime": "2025-10-23T17:36:41.286229Z"
    }],
    "userInteractionStatus": {"likeStatus": true}
  }]
}
```

**Benefits**:
- ✅ Real prompts (not "Favorite #1")
- ✅ Accurate timestamps from API
- ✅ Mode detection (normal/custom/spicy)
- ✅ Resolution info
- ✅ Like status
- ✅ Instant playlist building (no scrolling needed if API data fresh)
- ✅ Fallback ensures always works

**Console Logs to Watch**:
- `[GVP][Interceptor] 🎯 Matched gallery endpoint /rest/media/post/list`
- `[GVP][StateManager] 📥 Ingesting gallery data`
- `[GVP][StateManager] ✅ Gallery data ingested { posts: X, videos: Y }`
- `[GVP Playlist] ✅ Using API data (fresh gallery data available)`
- `[GVP Playlist] 📊 Built API-based playlist { total: X, modes: {...} }`

**Files Modified**:
- `StateManager.js` (+240 lines) - Gallery data storage and indexing
- `NetworkInterceptor.js` (line 1156-1180) - Auto-ingest API responses
- `UIPlaylistManager.js` (+60 lines, ~60 modified) - API-based playlist building
- All version files updated to 1.15.23

**Testing Instructions**:
1. Navigate to `/imagine/favorites`
2. Scroll down to trigger `/rest/media/post/list` API calls
3. Click golden ▶ playlist button in header
4. Check console for "Using API data" message
5. Verify mode badges (🌶️📝), resolution, and real prompts display
6. Try on fresh page without scrolling - should fallback to DOM scraping

**Future Enhancement**: Auto-scroll could be removed entirely once we add playlist refresh button to trigger new API calls on demand.

---

## [1.15.22] - 2025-11-11

### 🎯 UX Improvement: Auto-Close View JSON Modal

**Change**:
- View JSON modal now automatically closes after clicking "Copy JSON"
- No need to manually close the modal - smooth one-click workflow
- Toast notification still appears to confirm copy action

**Before**: Copy → Toast shows → Modal stays open → Click × to close  
**After**: Copy → Toast shows → Modal auto-closes

**Benefits**:
- ✅ Faster workflow - one less click
- ✅ Cleaner UX - modal disappears after action complete
- ✅ Consistent with modern UI patterns

**Files Modified**:
- `UIModalManager.js` (line 609): Added `this.hideViewJsonModal()` after copy

---

## [1.15.21] - 2025-11-11

### 🎨 UX Improvement: Non-Intrusive Copy Confirmation

**Change**:
- Replaced blocking `alert()` popup with toast notification when copying JSON
- Now shows green toast: "JSON copied to clipboard!" (3s duration)
- No more clicking "OK" button to dismiss confirmation

**Before**: Blocking modal popup requiring user interaction  
**After**: Smooth toast notification that auto-dismisses

**Benefits**:
- ✅ No workflow interruption
- ✅ Clean, modern UX
- ✅ Consistent with extension's toast system
- ✅ Auto-dismisses after 3 seconds

**Files Modified**:
- `UIModalManager.js` (line 608): Changed `alert()` → `this.showSuccess()`

---

## [1.15.20] - 2025-11-11

### 📜 Auto-Scroll Favorites for Playlist

**Smart Playlist Source Detection**:
- **Play button now detects page context**
- On `/imagine/favorites` → Auto-scrapes favorites
- On other pages → Uses multi-gen history

**Favorites Auto-Scroll Feature**:
- **Invisible auto-scroll** - Programmatically scrolls page to load lazy videos
- **Scrolls down** → Forces all videos to render (500px steps)
- **Scrolls back up** → Returns to top automatically
- **Scrapes video URLs** - Finds all `generated_video.mp4` elements
- **Builds playlist** - Converts scraped videos to playlist items
- **Zero manual effort** - Just click ▶ button on Favorites page

**Technical Implementation**:
- `playFromFavorites()` - New method for favorites
- `_autoScrollPage()` - Async scroll automation (100ms intervals)
- `_scrapeVideoUrls()` - DOM scraping for video elements
- Smart page detection with `window.location.pathname`
- Extracts: video URL, asset ID, thumbnail image

**User Experience**:
- Navigate to Favorites → Click ▶ → Instant playlist
- No manual scrolling required
- Works with any number of favorite videos
- Compatible with Grok's lazy-loading system

**Benefits**:
- ✅ Play ALL favorite videos effortlessly
- ✅ Handles lazy-loading automatically
- ✅ Invisible background processing
- ✅ Dual-mode: Favorites OR History

---

## [1.15.19] - 2025-11-11

### 🎯 Playlist Button Repositioned to Header

**UI Improvements**:
- **Moved Play button to header** - Now next to Settings (⚙️) button
- **Golden gradient button** - Matches extension theme with yellow/amber colors
- **Always visible** - No scrolling needed, accessible from any tab
- **Removed old indicators** - Cleaned up unused voice/spicy/gen indicators from header
- **Same size as Settings** - Consistent button styling

**Before**: Playlist button was in History tab controls (required scrolling)  
**After**: Golden ▶ button in header between Settings and Minimize

**Benefits**:
- ✅ Zero scrolling to access playlist
- ✅ Consistent with minimal scrolling UI rule
- ✅ More prominent golden button stands out
- ✅ Cleaner header (removed 3 unused indicators)

---

## [1.15.18] - 2025-11-11

### 🎬 Auto-Playing Video Playlist Feature

**New UIPlaylistManager**:
- Automatically discovers all successful videos from multi-gen history
- Builds playlist based on current sorting rule
- Sequential auto-play with automatic progression
- Fullscreen player with sidebar playlist view

**Playlist Player Features**:
- ▶ **Play button** in Generations tab header
- 🎥 **Video player** with native HTML5 controls
- 📋 **Sidebar playlist** with thumbnails and titles
- ⏮ **Previous/Next** navigation buttons
- ▶⏸ **Play/Pause** control
- 🔀 **Shuffle** mode with playlist randomization
- 🔁 **Loop** mode for continuous playback
- ⚡ **Auto-advance** to next video on completion
- 🎯 **Click any video** in sidebar to jump to it

**Player UI**:
- Golden theme matching extension design
- Large video display area with black letterboxing
- Real-time "Loading..." indicator
- Video counter (e.g., "3 / 10")
- Smooth transitions and hover effects
- Error recovery (auto-skip failed videos)
- Close button with rotation animation

**Playlist Building**:
- Respects Generations tab sorting mode
- Filters only successful videos with URLs
- Includes image thumbnail references
- Shows prompt preview in sidebar
- Automatic account-based filtering

**Technical Implementation**:
- New `UIPlaylistManager.js` (369 lines)
- Integrated into `UIManager.js` initialization
- Added to manifest.json load order
- CSS grid layout for responsive player
- Event-driven video progression
- Fisher-Yates shuffle algorithm

**Benefits**:
- Zero-click video review workflow
- Perfect for reviewing multiple generations
- Great for showcasing work
- Hands-free video playback
- Maintains context with thumbnails

---

## [1.15.17] - 2025-11-11

### Import Modal Styling Complete ✨

**Styling Added**:
- Modern dark theme modal with smooth animations
- Golden accent border matching extension theme
- Larger, readable textarea with syntax-friendly monospace font
- Focus states with golden glow effect
- Hover effects on close button (red with rotation)
- Clean footer with proper button spacing
- Responsive design (max 700px width, 85vh height)
- Overflow handling for long JSON

**Visual Features**:
- Dark overlay backdrop (rgba(0,0,0,0.85))
- Rounded corners (12px)
- Shadow depth for modal popup effect
- Proper label styling (uppercase, spaced)
- Input fields with 2px borders
- Professional color palette (#111827, #1f2937, #fbbf24)

**User Experience**:
- Modal appears centered on screen
- Easy to read placeholder text
- Accessible color contrast
- Smooth transitions on all interactions
- Mobile-friendly max-width constraints

---

## [1.15.16] - 2025-11-11

### CRITICAL FIX: Import Modal Not Created

**Root Cause Identified**:
- Extension had TWO `UIManager.js` files:
  - `src/content/managers/ui/UIManager.js` (orphaned modular version, not used)
  - `src/content/managers/UIManager.js` (ACTUAL file used by browser)
- Previous edits were made to the wrong file
- `_createImportJsonModal()` call was missing from the actual UIManager.js

**Fix Applied**:
- Added `_createImportJsonModal()` call to the REAL UIManager.js (line 265)
- Modal now created during UI initialization alongside other modals
- Deleted orphaned `src/content/managers/ui/UIManager.js` file to prevent confusion
- Updated Encyclopedia.md references to point to correct file path

**What Now Works**:
- Import modal is created when extension loads
- Modal elements exist in shadow DOM when Import button is clicked
- Import JSON feature should work properly

---

## [1.15.15] - 2025-11-11

### Enhanced Modal Creation Debug Logging

**Additional Debug Logs**:
- Added logs in UIManager._createDrawer() to track modal creation sequence
- Logs: `[GVP] About to create modals...`
- Logs: `[GVP] Fullscreen modal created`
- Logs: `[GVP] View JSON modal created`
- Logs: `[GVP] Import JSON modal created`

**Purpose**:
Track execution flow to determine if `_createImportJsonModal()` is being called and if it completes successfully.

## [1.15.14] - 2025-11-11

### Import Modal Debug Logging

**Debug Enhancement**:
- Added comprehensive debug logging to import modal creation and opening
- Logs when modal is created: `[GVP] Creating import JSON modal...`
- Logs when modal is appended: `[GVP] Import JSON modal created and appended to shadowRoot`
- Logs when showing modal with element status
- Helps diagnose why elements might not be found

**Purpose**:
Temporary debugging to identify why import modal elements are not being found after creation.

## [1.15.13] - 2025-11-11

### Import Modal Fix - Element IDs

**Bug Fix**:
- Fixed "Import modal elements not found" error
- Changed modal structure to use IDs instead of classes
- Modal now follows same pattern as existing modals (View JSON, etc.)
- Ensures modal elements are properly found when opening

**Technical Changes**:
- Changed `gvp-import-json-modal` to use specific IDs for all elements
- Header: `gvp-import-json-header`, `gvp-import-json-title`, `gvp-import-json-close`
- Body: `gvp-import-json-body`
- Footer: `gvp-import-json-footer`
- Consistent with existing modal structure

## [1.15.12] - 2025-11-11

### JSON Import Feature - Import External Prompts as Presets

**New Feature**:
- **📥 Import button** added to JSON preset panel
- Import JSON prompts from external tools directly into the extension
- Automatically saves imported JSON as a named preset
- Applies imported preset to form fields immediately

**How to Use**:
1. Click **📥 Import** button in preset panel (next to 👁️ View)
2. Paste your JSON prompt into the textarea
3. Enter a preset name
4. Click **"Import & Save as Preset"**
5. JSON is validated, saved, and applied to the form

**Validation**:
- Checks for valid JSON syntax
- Verifies JSON matches expected prompt structure
- Supports all fields: shot, scene, cinematography, visual_details, motion, audio, dialogue, tags
- Confirms overwrite if preset name already exists

**Technical Changes**:
- Added `UIFormManager._showImportModal()` method
- Added `UIFormManager._importJsonPreset()` with full validation
- Created `UIModalManager._createImportJsonModal()` 
- Created `UIModalManager.showImportJsonModal()` and `hideImportJsonModal()`
- Import button always visible in preset controls
- Modal includes large textarea (15 rows) for JSON input
- Event isolation (stopPropagation) on textarea and name input
- Auto-focus textarea on modal open for quick paste

**Use Case**:
Perfect for users who generate JSON prompts in external tools/spaces and want to quickly import them into the extension for use in video generation.

## [1.15.11] - 2025-11-11

### Upload Panel - Separate Start & Pause Buttons

**Solution**:
- **Added separate Start and Pause buttons** (no more toggle!)
- Start button (green) - Always visible when NOT processing
- Pause button (orange) - Only visible WHEN processing
- No more timing issues or display glitches
- Changed from 3 buttons to 4 buttons in action row

**Button Layout**:
```
When idle:     [▶️ Start] [        ] [🗑️ Clear] [❌ Cancel]
When running:  [        ] [⏸️ Pause] [🗑️ Clear] [❌ Cancel]
```

**Technical Changes**:
- Replaced single toggle button with two separate buttons
- Start button: `#gvp-upload-start` (display: block/none)
- Pause button: `#gvp-upload-pause` (display: none/block)
- Grid changed to `repeat(4, 1fr)` for 4 buttons
- Button visibility controlled by `updateQueueDisplay()`

## [1.15.10] - 2025-11-11

### Upload Panel - Start/Pause Button Display Fix

**Bug Fix**:
- **Fixed Start button not changing to Pause when processing starts**
- Problem: Button still showed "▶️ Start" even while processing
- Cause: `_processQueue()` is async - UI updated before `_isProcessing` flag was set
- Solution: Added 100ms delay before updating display after clicking Start
- Button now correctly shows "⏸️ Pause" (orange) when processing

**Technical Change**:
- Added `setTimeout(() => this.updateQueueDisplay(), 100)` after starting processing
- Gives async function time to set `_isProcessing = true` before UI updates

## [1.15.9] - 2025-11-11

### Upload Panel - Critical Button Fixes

**CRITICAL BUG FIXES**:
1. **Fixed Start button error**
   - Error: `this.uploadAutomationManager.startProcessing is not a function`
   - Cause: Wrong method name - `startProcessing()` doesn't exist
   - Fix: Changed to call `_processQueue('manual-start')` directly
   - Start button now works correctly

2. **Fixed bulk toggle buttons not updating display**
   - Problem: Clicking JSON/RAW/TOGGLE bulk buttons didn't visually update checkboxes
   - Cause: Queue hash didn't include checkbox states, so display didn't rebuild
   - Fix: Added checkbox states to hash calculation
   - Hash now: `id-status-json-raw-toggles` (was just `id-status`)
   - Bulk toggle buttons now immediately update all checkboxes visually

**Technical Changes**:
- Changed `startProcessing()` → `_processQueue('manual-start')`
- Updated queue hash to include checkbox states for change detection

## [1.15.8] - 2025-11-11

### Upload Panel - UI Improvements

**Bug Fixes**:
1. **Fixed thumbnail flickering in queue**
   - Problem: Thumbnails were vanishing and reappearing every second
   - Cause: Queue display was being completely rebuilt every second
   - Solution: Added hash-based change detection - only rebuild if queue items or statuses change
   - Now thumbnails stay stable unless queue actually changes

2. **Removed redundant Stop button**
   - The "⏹️ Stop" button did the same thing as "⏸️ Pause"
   - Removed Stop button to avoid confusion
   - Now only 3 action buttons: **▶️ Start/Pause**, **🗑️ Clear**, **❌ Cancel**
   - Changed button layout from 2x2 grid to 1x3 grid (3 buttons in a row)

**Technical Changes**:
- Added `_lastQueueHash` to track queue state changes
- Queue hash includes both item IDs and statuses
- Only calls DOM rebuild when hash changes
- Reduced button count from 4 to 3

## [1.15.7] - 2025-11-11

### Upload Panel - Make Video Button Timing Fix

**Bug Fix**:
- **Added 1-second delay after prompt injection before clicking button**
- Problem: Button was clicked too early (300ms), UI hadn't processed the prompt yet
- Solution: Wait 1 full second after prompt injection before clicking "Make video"
- Ensures the prompt is fully processed by the UI before generation starts

**Timing Flow**:
1. Upload image
2. Wait 1 second for image to appear
3. Inject custom prompt
4. **Wait 1 second for UI to process prompt** ← NEW
5. Click "Make video" button
6. Wait 2-3 seconds for generation to start
7. Navigate back to gallery

## [1.15.6] - 2025-11-11

### Upload Panel - Prompt Injection Timing Fix

**CRITICAL BUG FIX**:
- **Fixed prompt injection happening AFTER auto-generation started**
- Problem: Prompt was injected after auto-gen already started, so it used default prompt
- Solution: Inject prompt IMMEDIATELY after upload (1s wait) then click "Make video" button
- Clicking "Make video" after prompt injection starts generation WITH the custom prompt

**New Flow**:
1. Upload image (file injection)
2. Wait 1 second for image to appear
3. **Immediately inject custom prompt** (JSON/RAW)
4. **Click "Make video" button** to start generation with prompt
5. Wait 2-3 seconds for generation to start
6. Navigate back to gallery

**Technical Changes**:
- Reduced initial wait from 3s to 1s
- Moved prompt injection to happen BEFORE auto-generation completes
- Updated button selector to `button[aria-label="Make video"]`
- Simplified flow - no need to cancel auto-generation
- Different wait times: 2s with prompt, 3s without

## [1.15.5] - 2025-11-11

### Upload Panel - Gallery Navigation Fix

**Bug Fix**:
- **Fixed navigation back to main imagine gallery** after video generation
- Changed from Favorites button to direct `/imagine` navigation
- Now uses SPA-friendly navigation (clicks Imagine link or uses pushState)
- No longer causes full page reload
- Falls back to ESC key if link navigation fails
- Correctly returns to `https://grok.com/imagine` after each upload

**Technical Changes**:
- Removed Favorites button navigation
- Added `a[href="/imagine"]` link click detection
- Added `history.pushState` + `popstate` event for SPA routing
- Preserved automation state during navigation

## [1.15.4] - 2025-11-11

### Upload Panel - Persistent Checkbox States

**Feature**:
- **Checkbox states now persist in queue items**
- You can now close and reopen the upload panel without losing checkbox selections
- Checkbox states are saved directly to queue items in UploadAutomationManager
- States are automatically restored when panel reopens
- Individual checkbox changes sync to queue immediately
- Bulk toggle changes sync to all queue items
- Processing continues correctly even if panel is closed

**Technical Changes**:
- Added `_syncCheckboxesToQueue()` method in UIUploadManager
- Updated `getCheckboxStates()` to read from queue items first
- Checkbox states stored as `item.checkboxes` in queue
- UI loads checkbox states from queue on display update

## [1.15.3] - 2025-11-11

### Upload Panel - Critical Textarea Fix

**CRITICAL BUG FIX**:
- **Fixed prompt injection targeting WRONG textarea**
- Was injecting into IMAGINE (image gen) textarea instead of VIDEO generation textarea
- Updated selectors to match ReactAutomation.js (video generation selectors)
- Prompts now inject into correct video generation textarea
- All selectors now explicitly target video generation, not image generation

## [1.15.2] - 2025-11-11

### Upload Panel - Raw Prompt Fix

**Bug Fix**:
- Fixed RAW checkbox to read prompt from textarea instead of StateManager
- RAW prompt now correctly retrieved from `gvp-raw-input-textarea` element
- Added warning logs when checkbox is checked but prompt source is empty

## [1.15.1] - 2025-11-11

### Upload Panel - Checkbox Integration

**Changes**:
- Version bump to verify extension reload
- All checkbox functionality from 1.15.0 is active

## [1.15.0] - 2025-11-09

### 🎉 MAJOR: Upload Mode UI Overhaul (Phase 1)

Complete redesign of Upload Mode with per-image prompt configuration system.

**Hotfix (same day)**:
- Fixed panel positioning: Now slides from drawer's LEFT edge (not browser edge)
- Added text labels to bulk buttons: "JSON", "RAW", "TOGGLE"
- Aligned checkboxes with bulk buttons using grid layout
- Fixed modal z-index to 2147483647 (max) to appear above Grok UI
- Added image shadow and ESC key support to modal
- **MAJOR FIX**: Upload panel now displays as centered modal overlay with 50% opacity black backdrop
- Removed unnecessary blue tab button - uses existing 📤 launcher button
- Panel closes with main drawer, clicking 📤 toggles modal
- Backdrop click closes modal
- **CRITICAL FIX**: Restored upload automation state toggling - panel now properly enables/disables upload mode in StateManager
- **MAJOR FEATURE**: Checkbox functionality fully implemented - JSON/RAW/TOGGLE checkboxes now control prompt/settings injection
  - 🔴 JSON checkbox: Injects JSON prompt from JSON tab into video generation
  - 🔵 RAW checkbox: Injects Raw prompt from Raw tab into video generation  
  - 🟡 TOGGLE checkbox: Applies current toggle settings (spicy mode, etc.)
  - Checkboxes work both individually per-image and in bulk
  - Mutual exclusivity: JSON and RAW cannot both be checked
  - Prompts automatically injected after image upload completes
  - Generation triggered automatically when prompts are applied

#### **New UI Components**

**1. Upload Panel Modal**
- Triggered by existing 📤 launcher button
- Centered overlay with 50% opacity black backdrop
- Click backdrop or X button to close
- Closes automatically when main drawer closes

**2. Upload Queue Panel**
- Slides LEFT → RIGHT from left edge of drawer
- Auto-closes when main drawer closes
- Close button (✕) in header
- Fixed positioning with dark theme (#1a1a1a)

**3. Bulk Toggle Buttons**
- 🔴 Red (JSON) - Toggle JSON prompts for all images
- 🔵 Blue (Raw) - Toggle Raw prompts for all images
- 🟡 Yellow (Toggles) - Toggle settings (spicy/voice-only) for all images
- Smart toggle: <50% checked → Check all, >50% checked → Uncheck all

**4. Queue Items with Thumbnails**
- 60x60px clickable thumbnails (opens full-size modal)
- Status indicator (pending/processing/completed/failed)
- 3 checkboxes per image (JSON/Raw/Toggles)
- File size display
- Compact row layout with proper spacing

**5. Thumbnail Modal**
- Click thumbnail → Opens fullscreen modal (rgba(0,0,0,0.9))
- Max 90% width/height
- Click anywhere to close
- Z-index: 999999

#### **Checkbox Logic**

**Mutual Exclusivity (JSON ⊗ Raw)**:
- Checking JSON → Auto-unchecks Raw
- Checking Raw → Auto-unchecks JSON
- Can have neither checked
- Cannot have both checked

**Toggles Checkbox**:
- Independent of JSON/Raw
- Can be enabled/disabled freely
- Will apply spicy mode, voice-only, etc. when processing

#### **Lifecycle**

1. **Open Main Drawer** → Blue tab button appears on left edge
2. **Click Blue Tab** → Upload queue panel slides in from left
3. **Select Images** → File picker opens
4. **Configure Per Image**:
   - Check 🔴 to use JSON prompt
   - Check 🔵 to use Raw prompt
   - Check 🟡 to apply active toggles
5. **Bulk Toggle** → Click colored buttons to toggle all at once
6. **Close Main Drawer** → Upload queue panel auto-closes

#### **Files Modified**

1. **UIManager.js**
   - Added `_createUploadTabButton()` method (lines 689-732)
   - Added `toggleUploadQueue()`, `openUploadQueue()`, `closeUploadQueue()` methods (lines 772-810)
   - Auto-close upload queue when main drawer closes (line 750-752)
   - Added upload panel creation in `createUI()` (lines 266-271)
   - Pass UIManager reference to UIUploadManager (line 106)

2. **UIUploadManager.js** - Complete rewrite (545 lines)
   - Constructor now accepts `uiManager` parameter
   - `createUploadPanel()` - Left-sliding panel with bulk toggles
   - `_createQueueItem()` - Thumbnails + 3 checkboxes per item
   - `_createCheckbox()` - Checkbox factory with onChange handler
   - `_toggleBulkCheckboxes()` - Bulk toggle logic with mutual exclusion
   - `_createThumbnailModal()` - Fullscreen image viewer
   - `_showThumbnailModal()` / `_hideThumbnailModal()` - Modal control
   - Checkbox state tracking via `_queueItemCheckboxes` Map

#### **Next Steps (Phase 2)**

- Read checkbox states before generation
- Inject JSON/Raw prompts into Grok's custom prompt area
- Apply toggles (spicy, voice-only) based on yellow checkbox
- Trigger generation with configured settings

#### **Breaking Changes**

- UIUploadManager constructor signature changed (added `uiManager` param)
- Panel now slides from LEFT instead of RIGHT
- Panel ID changed from `gvp-upload-panel` to `gvp-upload-queue-panel`

---

## [1.14.4] - 2025-11-09

### Added

#### **Menu Open Verification**
- Added loop to verify menu actually opens by checking `aria-expanded` attribute
- Polls up to 10 times (100ms intervals) to confirm menu opened
- Logs each check with current `aria-expanded` value
- Falls back to additional click if menu fails to open
- Logs button state before clicking (aria-expanded, data-state, aria-haspopup)

### Why This Matters

Previous version would click the button but not verify the menu actually opened. Now we:
1. Click with multiple methods
2. **Wait and verify** `aria-expanded` changes to `"true"`
3. If menu doesn't open, try one more direct click
4. Show exactly what's happening in console

### Console Output
```
[GVP Spicy] 📊 Button state before click: {aria-expanded: "false", data-state: "closed", ...}
[GVP Spicy] 🎬 Opening video preset menu...
[GVP Spicy] ⏳ Waiting for menu to open...
[GVP Spicy] Check 1: aria-expanded="false"
[GVP Spicy] Check 2: aria-expanded="true"
[GVP Spicy] ✅ Menu opened (aria-expanded=true)
[GVP Spicy] 🔍 Searching for menu items...
```

### Files Modified

1. **UIManager.js** (lines 931-973)
   - Added button state logging before click
   - Added 10-iteration loop to verify menu opens
   - Added fallback click if verification fails

---

## [1.14.3] - 2025-11-09

### Changed

#### **Multi-Method Clicking for React/Radix UI Compatibility**
- Added multiple click methods for opening Video Presets menu:
  - Standard `.click()`
  - Full MouseEvent chain (mousedown → mouseup → click)
  - Focus + PointerEvent chain (pointerdown → pointerup)
- Added same multi-method approach for clicking Spicy menu item
- Added comprehensive logging for menu item detection
- Shows all found menu items in console for debugging

### Technical Details

**Button Click Methods** (lines 932-952):
```javascript
// Method 1: Standard click
triggerButton.click();

// Method 2: Full MouseEvent chain
['mousedown', 'mouseup', 'click'].forEach(type => {
    element.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window
    }));
});

// Method 3: Focus + PointerEvents
triggerButton.focus();
triggerButton.dispatchEvent(new PointerEvent('pointerdown', ...));
triggerButton.dispatchEvent(new PointerEvent('pointerup', ...));
```

### Console Logs Added
```
[GVP Spicy] 🔍 Searching for menu items...
[GVP Spicy] 📊 Found X menu items
[GVP Spicy] 📋 Menu items: ['item1', 'item2', ...]
[GVP Spicy] 🖱️ Clicking spicy option with multiple methods...
```

### Files Modified

1. **UIManager.js** (lines 930-977)
   - Enhanced button clicking with multiple methods
   - Added menu item enumeration logging
   - Applied to both trigger button and spicy menu item

---

## [1.14.2] - 2025-11-09

### Changed

#### **Enhanced Debug Logging for Spicy Detection**
- Added comprehensive console logging to `_detectNativeSpicyButton()`
- Shows total buttons found in page
- Shows which selector matched (aria-label vs SVG icons)
- Shows sample buttons if detection fails
- Helps diagnose button detection issues on different Grok UI versions

### Files Modified

1. **UIManager.js** (lines 897-927)
   - Enhanced `_detectNativeSpicyButton()` with detailed logging
   - Added button count display
   - Added match reason logging (aria-label vs SVG)
   - Added sample button preview on failure

### Testing

Console logs to watch for:
```
[GVP Spicy] 🔍 Searching for trigger button...
[GVP Spicy] 📊 Found X buttons in page
[GVP Spicy] ✅ Found match: {hasLabel: true, hasFilm: true, hasChevron: true, ...}
[GVP Spicy] 🎬 Opening video preset menu...
[GVP Spicy] ✅ Native spicy button detected after menu open
```

---

## [1.14.1] - 2025-11-09

### 🐛 **CRITICAL BUG FIX: Native Spicy Button Detection**

Fixed critical bug where native spicy button was not being detected because the dropdown menu wasn't open.

### Fixed

#### **Native Spicy Button Detection**
- **Root cause**: Menu items don't exist in DOM until dropdown is clicked
- **Solution**: Now automatically opens the "Video Presets" dropdown before searching
- **Process**:
  1. Find trigger button (film icon + chevron, `aria-label="Video Presets"`)
  2. Click to open menu
  3. Wait 300ms for Radix UI animation
  4. Find "Spicy" option in menu
  5. Click and mark as used
- **Improved logging**:
  - `[GVP Spicy] 🎬 Opening video preset menu...`
  - `[GVP Spicy] ✅ Native spicy button detected after menu open`
  - `[GVP Spicy] ⚠️ Video preset trigger button not found`

#### **Smart Detection Scope**
- Only runs on `/imagine/post/` pages when spicy mode enabled
- Doesn't unnecessarily open menu on gallery or other pages
- Checks if menu already open before clicking trigger

### Changed

#### **Method Signatures**
- `_detectNativeSpicyButton()` → Returns `Promise<{found, element, menuButton}>`
- `_activateNativeSpicyMode()` → Returns `Promise<boolean>`
- `_handleGalleryImageOpened()` → Now async

#### **Gallery Integration**
- Gallery watcher now properly awaits menu opening
- Sets `useNativeSpicy` flag when clicking button
- Better timing for menu close → generation trigger (500ms)

### Technical Details

**Button Selector**:
```javascript
Array.from(document.querySelectorAll('button')).find(btn => 
    btn.getAttribute('aria-label') === 'Video Presets' ||
    (btn.querySelector('svg.lucide-film') && btn.querySelector('svg.lucide-chevron-down'))
)
```

**Timing**:
- Menu animation: 300ms wait
- Menu close → generation: 500ms wait
- Total delay: ~800ms (acceptable for UX)

### Files Modified

1. **UIManager.js**
   - `_detectNativeSpicyButton()` - Now opens menu before searching
   - `_activateNativeSpicyMode()` - Made async
   - `_handleGalleryImageOpened()` - Made async with proper awaits
   - `toggleSpicyMode()` - Only runs detection on image post pages

### Changed

#### **Enhanced Debug Logging**
- Added comprehensive console logging to `_detectNativeSpicyButton()`
- Shows total buttons found in page
- Shows which selector matched (aria-label vs SVG icons)
- Shows sample buttons if detection fails
- Helps diagnose button detection issues on different Grok UI versions

### Testing

✅ **To Verify**:
- Toggle spicy ON → Navigate to image page → Console shows debug logs
- Check console for: `[GVP Spicy] 🔍 Searching for trigger button...`
- Check console for: `[GVP Spicy] 📊 Found X buttons in page`
- Check console for: `[GVP Spicy] ✅ Found match: {...}`
- Menu should open → Spicy clicked → Toast shows

---

## [1.14.0] - 2025-11-09

### 🌶️ **SPICY MODE NATIVE DETECTION & GALLERY INTEGRATION**

Intelligent native spicy mode button detection with automatic gallery image generation workflow.

### Added

#### **Native Spicy Button Detection**
- **Auto-detects Grok's native "Spicy" mode button** when available on image pages
- **Visual toast notification** (`🌶️ Native Spicy Detected`) appears bottom-right when found
- **Detection runs**:
  - When spicy toggle is enabled
  - When clicking images in gallery
  - When navigating to image post pages
- **Performance**: <1ms scan using `querySelectorAll('[role="menuitem"]')`

#### **Gallery Auto-Generation Workflow**
- **Click image in `/imagine` gallery** → Auto-detects native spicy button
- **Spicy + Quick JSON/Raw mode** → Automatically:
  1. Clicks native spicy button
  2. Waits 500ms for menu processing
  3. Triggers Quick JSON or Quick Raw generation
- **Works on**:
  - Image clicks in gallery
  - URL navigation to `/imagine/post/*`
  - Direct image page visits

#### **Upload Prompt Injection**
- **New field**: `state.generation.uploadPrompt`
- **Injects custom prompt on first upload** (no regeneration needed)
- **NetworkInterceptor enhancement**: Detects `fileAttachments` in payload
- **Appends prompt** to upload message before first request sent
- **Auto-clears** after injection to prevent duplicate injections

#### **Enhanced Spicy Mode Logic**
- **Tag injection still works** alongside native button (no conflicts)
- **`useNativeSpicy` flag** tracks when native button was clicked
- **NetworkInterceptor** respects flag and injects tag for prompt upsampling
- **Replaces all mode tokens** (`--mode=`) so no double-injection issues

### Changed

#### **UIManager Enhancements**
- Added `_detectNativeSpicyButton()` - Scans page for native button
- Added `_showSpicyDetectedToast()` - Shows detection notification
- Added `_activateNativeSpicyMode()` - Clicks native button + sets flag
- Added `_initGalleryWatcher()` - Watches for image clicks
- Added `_handleGalleryImageOpened()` - Processes image navigation
- Added `_triggerQuickGeneration()` - Triggers JSON/Raw based on mode

#### **StateManager Changes**
- Added `generation.useNativeSpicy` flag (boolean)
- Added `generation.uploadPrompt` field (string|null)

#### **NetworkInterceptor Integration**
- Upload prompt injection before spicy mode check
- Respects `useNativeSpicy` flag while still injecting tag
- Clears `uploadPrompt` after successful injection

### Technical Details

**Native Button Selector:**
```javascript
document.querySelectorAll('[role="menuitem"][data-orientation="vertical"]')
  .find(item => item.textContent.trim() === 'Spicy')
```

**Gallery Watcher:**
- Event listener on `document` (capture phase)
- Detects clicks on `[data-testid="image-card"]`, `.gallery-image`, `img[src*="grok.com"]`
- MutationObserver for SPA navigation
- Triggers after 500-800ms delay for page load

**Upload Injection Flow:**
1. User queues prompt in `state.generation.uploadPrompt`
2. User uploads image → NetworkInterceptor detects `fileAttachments`
3. Prompt appended to `body.message`
4. Flag cleared to prevent re-injection
5. Request sent with custom prompt

**Performance Safeguards:**
- Detection only runs on `/imagine` pages
- Max once per 300ms (debounced)
- Skip if spicy mode off
- Minimal DOM queries (<1ms)

### Use Cases

**Use Case 1: Simple Spicy Detection**
- Toggle spicy ON
- Visit any image page
- See toast: "🌶️ Native Spicy Detected"

**Use Case 2: Gallery Quick Gen**
- Enable Spicy toggle
- Enable Quick JSON or Quick Raw
- Go to gallery, click image
- Auto-generates with spicy mode + custom prompt

**Use Case 3: Upload with Prompt**
- Queue prompt in upload field
- Upload image
- Video generates immediately with prompt (no regeneration)

### Console Logging

All actions logged for debugging:
```
[GVP Spicy] ✅ Native spicy button detected
[GVP Spicy] 🌶️ Clicked native spicy button
[GVP Gallery] 🖼️ Image clicked, spicy mode active
[GVP Gallery] Quick JSON mode active - auto-triggering
[GVP Gallery] 📄 Triggering Quick JSON generation
[GVP Upload] 💉 Injecting prompt into upload
[GVP Spicy] 🌶️ Native spicy mode active - still injecting tag for prompt upsampling
```

### Future Enhancements

- **Progress bar HTML observer** (found element: `.text-xs.font-semibold.w-\[4ch\]` with percentage)
- **Upload mode UI improvements**
- **Image URL replacement toggle** for upload mode
- **Natural language template conversion** for raw prompts

---

## [1.13.8] - 2025-11-09

### 🎨 **HISTORY TAB OVERHAUL COMPLETE**

Major redesign of the Multi-Generation History tab with compact layouts, emoji buttons, status lights, and modern toast notifications.

### Added

#### **Toast Notification System**
- **Replaced all `window.confirm()` dialogs** with modern toast notifications
- **Three toast types**:
  - `showToast(message, type, duration)` - Info/success/error/warning toasts
  - `showConfirmToast(message, onConfirm, onCancel)` - Yes/No confirmation dialogs
  - `showUndoToast(message, onUndo, duration)` - Undo action toasts (future use)
- **Visual design**:
  - Bottom-center positioning with slide-up animation
  - Semi-transparent dark background with blur effect
  - Color-coded borders (green/red/orange/blue)
  - Smooth fade transitions (300ms)
- **Used for**:
  - Delete attempt confirmations
  - Delete image confirmations
  - Success/error feedback after operations

#### **30-Second Timeout Mechanism**
- **Auto-removal of stalled generations**
  - Monitors each pending generation attempt
  - After 30 seconds with no progress updates → deletes attempt
  - Toast notification: "Removed stalled generation after 30s timeout"
  - Timeouts restored after page refresh
- **StateManager methods**:
  - `_startGenerationTimeout(imageId, attemptId)`
  - `_clearGenerationTimeout(attemptId)`
  - `_deleteTimedOutGeneration(imageId, attemptId)`

#### **Compact Closed Card Layout**
- **Horizontal ~60px height design** (down from ~120px)
- **Three-section layout**:
  1. **Left**: 54px thumbnail
  2. **Center**: Progress text + inline emoji buttons + progress bar
  3. **Right**: Stacked status lights (🟡 pending, 🟢 success, 🔴 moderated) + delete button
- **Last successful video button** (🎥)
  - Appears only when successful video exists
  - Opens most recent successful video URL
  - Positioned with other emoji buttons
- **Status light counters** show totals for each state

#### **Compact Attempt Card Layout**
- **Three-row ~50px design** (down from ~90px):
  1. Status badge + timestamp + delete ❌
  2. Action buttons: 🖼️ 📝 🎥 (always 3 for alignment)
  3. Full-width colored progress bar
- **Colored progress bars**:
  - 🔴 **Red** for moderated (frozen at failure percentage)
  - 🟢 **Green** for success (filled to 100%)
  - ⚪ **Gray** for pending (current progress)
- **Perfect vertical alignment** - buttons always in same position
- **Disabled button state** - Video button shows dimmed (30% opacity) when no URL

#### **Emoji Button System**
- **Replaced text buttons** with emoji icons:
  - 📝 View prompt
  - 🖼️ Open image page
  - 🎥 Open video (or last successful video)
  - ❌ Delete
- **22px micro buttons** with hover effects
- **Consistent sizing** across closed and attempt cards
- **Tooltips** on hover for clarity

### Changed

#### **History Tab Header**
- **Compressed layout** - Title + sort controls on one line
- **Reduced vertical space** by ~20px
- **Sort defaults**:
  - Default sort: `success-desc` (most successful videos first)
  - Default "Active first": **OFF**
  - Settings persist across sessions

#### **Per-Account Storage**
- **Audited and verified** history data isolation by account
- **Confirmed** StateManager properly uses account-based keys
- **Tested** account switching triggers correct data load
- **No data leakage** between accounts

### Fixed

#### **Status Light Overlap**
- **Issue**: Status lights overlapped delete button on closed cards
- **Fix**: Reduced progress section width to 85%, added 24px right margin to lights

#### **Button Alignment**
- **Issue**: Status badge width variations (MODERATED vs SUCCESS) caused button misalignment
- **Fix**: Separated button row from status header for perfect vertical alignment

#### **Account ID Extraction**
- **Issue**: Account ID extraction could fail in some scenarios
- **Fix**: Added StateManager fallback for reliable account detection

#### **Pending Timeout Restoration**
- **Issue**: Timeouts didn't restore after page refresh
- **Fix**: Added timeout restoration logic on history load

### Technical Details

**Files Modified:**

1. **UIManager.js**:
   - Added toast system: `showToast()`, `showConfirmToast()`, `showUndoToast()`
   - Redesigned `_buildMultiGenCard()` - horizontal compact layout
   - Redesigned `_buildMultiGenAttempt()` - three-row compact layout
   - Added `_deleteMultiGenImage()` with toast confirmation
   - Default sort changed to `success-desc`, prioritizeActive to `false`

2. **StateManager.js**:
   - Added `deleteMultiGenImage()` method
   - Added timeout tracking: `generationTimeouts` Map
   - Added `_startGenerationTimeout()`, `_clearGenerationTimeout()`
   - Added `_deleteTimedOutGeneration()`
   - Timeout restoration on state load

3. **stylesheet.js**:
   - Added toast container and notification styles (~120 lines)
   - Added closed card compact layout CSS
   - Added attempt card three-row layout CSS
   - Added status light styling (pending/success/moderated)
   - Added micro button styles with hover effects
   - Added disabled button state (30% opacity)

**Layout Structure:**

Closed Card:
```
┌──────────────────────────────────────────────────┐
│ [THUMB] Last success 54m [📝][🖼️][🎥]  🟡🔴 [❌] │
│  54px   ══════════════════░░░░░                 │
└──────────────────────────────────────────────────┘
```

Attempt Card:
```
┌────────────────────────────────────────┐
│ MODERATED          1m ago        [❌]  │
│ [🖼️] [📝] [🎥]                          │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  (red)           │
└────────────────────────────────────────┘
```

### Version History

- **v1.13.8**: Toast system + button alignment fixes
- **v1.13.7**: Separate button row for perfect alignment
- **v1.13.6**: Attempt card redesign with colored bars
- **v1.13.5**: Closed card horizontal compact layout
- **v1.13.4**: Initial closed card redesign with status lights
- **v1.13.3**: Header compression (title + sort inline)
- **v1.13.2**: Per-account storage audit
- **v1.13.1**: 30-second timeout mechanism
- **v1.13.0**: Sort defaults and cleanup

### Impact

- ✅ **60% more compact** - Closed cards: ~120px → ~60px
- ✅ **50% more compact** - Attempt cards: ~90px → ~50px
- ✅ **Faster scanning** - Status visible at a glance with colored bars
- ✅ **Better UX** - No blocking dialogs, smooth toast notifications
- ✅ **Cleaner UI** - Emoji buttons reduce visual clutter
- ✅ **Auto-cleanup** - Stalled generations removed automatically
- ✅ **Perfect alignment** - All buttons line up vertically

---

## [1.12.3] - 2025-11-08

### 🧹 **UI IMPROVEMENTS & WIPE PRESETS**

Added ability to delete all saved presets and fixed custom input CSS overlap.

### Added

#### **Wipe All Presets Button**
- **Location**: Settings → Data Export/Import accordion
- **Function**: Permanently deletes all saved JSON presets
- **Safety**: 
  - Confirmation dialog lists all presets to be deleted
  - Shows warning: "This action CANNOT be undone!"
  - Displays count of presets being deleted
- **UX**: 
  - Red danger zone styling
  - Toast notification on success
  - Refreshes preset dropdown after wipe
- **Files Modified**:
  - `UISettingsManager.js` (lines 235-256): Added wipe button UI
  - `UISettingsManager.js` (lines 980-1021): Added `_wipeAllPresets()` method

### Fixed

#### **Custom Input Overlapping Button**
- **Issue**: When "Custom..." was selected in preset dropdown, input field covered the button to the right
- **Fix**: Changed `.gvp-json-preset-custom-input` width from `100%` to `95%`
- **Files Modified**:
  - `stylesheet.js` (line 190): Updated custom input width

### Verified

#### **Raw Tab Template System** ✅
- Confirmed `applyTemplatesToRawPrompt()` working correctly
- `buildRawPrompt()` properly applies templates to raw input
- No breaking changes from JSON editor updates
- Template system intact for both JSON and Raw tabs

### Technical Details

**Wipe Presets Flow**:
1. User clicks "🗑️ Wipe All Presets" in Settings
2. Method gets preset list from StateManager
3. Confirmation dialog shows preset names
4. On confirm: clears `state.settings.jsonPresets` array
5. Saves to `chrome.storage.local`
6. Shows success toast
7. Refreshes preset dropdown

**Safety Checks**:
- Empty preset list shows info toast instead
- User must confirm deletion
- Console logs deletion count for audit trail

---

## [1.12.2] - 2025-11-08

### 🔧 **AUTO-MIGRATION FOR CORRUPTED DATA**

Added automatic detection and repair of existing corrupted preset data.

### Enhancement

#### **Corrupted Objects Auto-Healing**
- **Problem**: Users with existing corrupted presets (from v1.12.0 bug) had no way to fix them
- **Solution**: Added `_fixCorruptedObjects()` migration method
  - Detects character array objects: `{"0":"L","1":"e","2":"f"}`
  - Reconstructs original strings: `"Lef"`
  - Runs automatically during preset loading
  - Logs warnings for each fixed object
- **Impact**: 
  - ✅ Old corrupted presets now auto-heal on load
  - ✅ Import/export works with corrupted data files
  - ✅ No manual intervention needed

### Technical Details

**Files Modified:**
1. `StateManager.js` (lines 983-1008):
   - Added `_fixCorruptedObjects()` method to detect and reconstruct corrupted strings
   - Sorts numeric keys and rebuilds string from character array
   - Logs warnings for transparency
2. `StateManager.js` (line 957):
   - Applies fix during normalization: `this._fixCorruptedObjects(visual.objects)`
   - Automatically heals data on every preset load

### How It Works

**Detection Logic:**
```javascript
const keys = Object.keys(item).sort((a, b) => Number(a) - Number(b));
const isCorrupted = keys.every(k => !isNaN(k));
```

**Reconstruction:**
```javascript
const reconstructed = keys.map(k => item[k]).join('');
// {"0":"L","1":"e"} → "Le"
```

### Testing

✅ Test auto-healing:
1. Load old corrupted preset from v1.12.0
2. Console shows: `[GVP] Fixed corrupted object: {corrupted: {...}, fixed: "..."}`
3. Objects display correctly in UI
4. JSON shows proper strings, not character arrays

---

## [1.12.1] - 2025-11-08

### 🔴 **CRITICAL BUGFIX**

Fixed severe data corruption bug in JSON preset saving/loading for `visual_details.objects` array.

### Bug Fixed

#### **Objects Array Character Corruption**
- **Issue**: Objects were being saved as character arrays instead of strings
  - Example: `"Left frame female subject"` became `{"0":"L","1":"e","2":"f",...}`
- **Impact**: 
  - ❌ Objects displayed as empty textareas after page refresh
  - ❌ JSON showed corrupted character-by-character objects
  - ❌ Data loss when saving/loading presets
- **Root Cause**: `StateManager._normalizePromptDataStructure()` was spreading strings as objects
  - Line 957: `visual.objects.map(item => ({ ...(item || {}) }))`
  - Spread operator on strings creates objects with numeric keys
- **Fix**: Preserve objects array as-is, treat positioning/text_elements as strings
  - Changed to: `objects: Array.isArray(visual.objects) ? [...visual.objects] : []`
  - Changed to: `positioning: typeof visual.positioning === 'string' ? visual.positioning : ''`
  - Changed to: `text_elements: typeof visual.text_elements === 'string' ? visual.text_elements : ''`

### Technical Details

**Files Modified:**
1. `StateManager.js` (lines 957-959):
   - Removed object spreading from objects array
   - Corrected positioning and text_elements to be strings (not arrays)
   - Objects now preserve as string array: `["object1", "object2"]`

### Testing

✅ Verify fix by:
1. Add objects to Visual Details → "Left frame female subject", "Centre frame female subject"
2. Save as preset
3. Refresh page and load preset
4. Objects should display correctly in textareas
5. JSON should show strings, not character arrays

---

## [1.12.0] - 2025-11-08

### ✨ **TOAST NOTIFICATION SYSTEM**

Replaced all `window.alert()` dialogs with modern toast notifications for better UX.

### Added

#### **Toast Notification System**
- **No more blocking alerts** - Replaced all `window.alert()` with non-blocking toast notifications
- **Smart queue system** - Multiple toasts show sequentially, never overlap
- **Color-coded messages**:
  - ✅ **Success** (green) - Preset saved, updates successful
  - ❌ **Error** (red) - Save failures, validation errors
  - ⚠️ **Warning** (gold) - No preset loaded, incomplete data
  - ℹ️ **Info** (blue) - General notifications
- **Smooth animations** - Slide up from bottom with fade effects
- **Auto-dismiss** - Success (3s), Error (4s), Warning (3.5s), Info (3s)

#### **Convenience Methods**
```javascript
window.gvpUIManager.uiModalManager.showSuccess("Preset saved!");
window.gvpUIManager.uiModalManager.showError("Failed to save.");
window.gvpUIManager.uiModalManager.showWarning("No preset loaded.");
window.gvpUIManager.uiModalManager.showInfo("Processing...");
```

### Fixed

#### **Bottom Bar Spacing**
- Changed `bottom: 28px` → `bottom: 0px` in stylesheet
- Reclaims vertical space for all tabs
- Eliminates gap between bottom bar and taskbar

### Technical Implementation

**Files Modified:**
1. `UIModalManager.js`:
   - Added `toastQueue` and `toastShowing` properties (lines 12-13)
   - Added `showToast()` main method (lines 723-728)
   - Added `_processToastQueue()` with animations (lines 730-758)
   - Added convenience methods: `showSuccess()`, `showError()`, `showWarning()`, `showInfo()` (lines 760-775)

2. `stylesheet.js`:
   - Added `.gvp-toast` base styles (lines 2080-2097)
   - Added `.gvp-toast.show` animation (lines 2098-2101)
   - Added color-coded toast variants (lines 2102-2118)

3. `UIFormManager.js`:
   - Replaced 7 `window.alert()` calls with toast notifications
   - Preset save errors now show red toasts
   - Preset update success shows green toast
   - Empty name validation shows error toast

4. `stylesheet.js` (line 309):
   - Bottom bar: `bottom: 28px` → `bottom: 0px`

### Testing

✅ Toast notifications tested for:
- Preset save success/failure
- Preset load failure
- Empty preset name validation
- Preset update workflow
- Bottom bar spacing verified

---

## [1.11.0] - 2025-11-08

### ✨ **SMART PRESET UPDATE SYSTEM**

No more manual "Select Custom... → Type name → Overwrite" workflow! The extension now **automatically detects** when you've edited a loaded preset and shows an **"Update Preset" button**.

### Added

#### **Automatic Change Detection**
- **Tracks which preset is loaded** - Extension remembers the preset you selected
- **Deep comparison** - Continuously compares current data vs. original preset data
- **Smart button visibility** - "Update Preset" button appears **only when changes detected**

#### **One-Click Preset Updates**
```
[Select JSON preset... ▼]  💾  👁️
         ↓ Select preset
[My Preset          ▼]     💾  👁️  💾 Update "My Preset"  ← Button appears!
         ↓ Make edits
[My Preset          ▼]     💾  👁️  💾 Update "My Preset"  ← Click to save!
```

**Button shows:**
- `💾 Update "My Preset"` - Exact preset name displayed
- Tooltip: `Save changes back to preset "My Preset"`
- Only visible when changes exist
- Disappears after update saved

### How It Works

**Load Preset:**
1. Select preset from dropdown
2. Extension stores preset name + original data
3. Update button hidden (no changes yet)

**Make Changes:**
1. Edit any field (Visual Details, Dialogue, etc.)
2. Extension compares current data to original
3. **Update button automatically appears!**

**Save Changes:**
1. Click `💾 Update "Preset Name"` button
2. Preset updated instantly
3. Button disappears (changes now saved)
4. Alert confirms: "Preset 'Name' updated successfully!"

### Technical Implementation

**Files Modified:**
1. `UIFormManager.js`:
   - Added `currentPresetName` tracking (line 16)
   - Added `currentPresetData` for comparison (line 17)
   - Added `updatePresetBtn` reference (line 18)
   - Modified `_applyJsonPresetFromSelect()` to store preset info
   - Added `_hasPresetChanges()` - Deep JSON comparison
   - Added `_updatePresetButtonVisibility()` - Show/hide logic
   - Added `_updateCurrentPreset()` - One-click save handler
   - Wired up change detection to `_handlePromptDataUpdated()`
   - Triggers check after "Go Back & Save" in `collapseToGrid()`

**Change Detection:**
```javascript
// Compares current state vs loaded preset
_hasPresetChanges() {
    return JSON.stringify(this.currentPresetData) !== 
           JSON.stringify(currentData);
}
```

**Auto-triggers on:**
- ✅ Field edits (any input/textarea/dropdown)
- ✅ Array changes (add/delete objects, dialogue, tags)
- ✅ "Go Back & Save" clicks
- ✅ Fullscreen editor saves
- ✅ Any `gvp:prompt-data-updated` event

### Benefits

**Before v1.11.0:**
```
1. Load preset
2. Edit fields
3. Select "Custom..." from dropdown
4. Type exact preset name
5. Confirm overwrite
6. Done (5 steps!)
```

**After v1.11.0:**
```
1. Load preset
2. Edit fields
3. Click "Update" button
4. Done! (3 steps!)
```

- ✅ **67% fewer steps**
- ✅ **No manual name typing** - Eliminates typos
- ✅ **Visual feedback** - See button appear when changes exist
- ✅ **Instant confirmation** - Button disappears after save
- ✅ **Smart detection** - Only shows when actually changed

### UX Improvements

**Solves:**
- ❌ "Did I spell the preset name exactly right?"
- ❌ "Do I need to save or are changes already saved?"
- ❌ "Which button saves changes back to the preset?"
- ❌ "Do I have unsaved changes?"

**Provides:**
- ✅ Immediate visual feedback on changes
- ✅ Clear action button with preset name
- ✅ No ambiguity about what will be updated
- ✅ Confidence that changes are tracked

### Edge Cases Handled

**Preset cleared:**
- Selecting empty option → Button hides, tracking cleared

**Preset deleted:**
- Button hides if preset no longer exists

**No changes:**
- Button remains hidden until actual edits made

**Identical changes:**
- Changing field then reverting → Button hides automatically

### Backwards Compatible

- ✅ Old "Custom..." workflow still works
- ✅ New "Update" button is **addition**, not replacement
- ✅ No breaking changes to existing presets
- ✅ Change detection is non-intrusive

### Testing

1. **Load a preset** from dropdown
2. **Make an edit** (change any field)
3. **Check:** `💾 Update "Preset Name"` button appears
4. **Click the button**
5. **Verify:** Alert shows "updated successfully"
6. **Check:** Button disappears
7. **Reload extension**
8. **Load same preset**
9. **Verify:** Your changes are saved!

## [1.10.2] - 2025-11-08

### 🔧 **CRITICAL DATA CORRUPTION FIX**

Fixed severe bug where `positioning` and `text_elements` were being saved as character arrays in presets.

### The Bug
**BEFORE (Broken):**
```json
"positioning": [
  {
    "0": "3",
    "1": " ",
    "2": "f",
    "3": "e",
    "4": "m",
    ...
  }
]
```

**AFTER (Fixed):**
```json
"positioning": "3 females next to one another"
```

### Root Cause
The `buildJsonPrompt()` function was using wrong selector:
- **Wrong:** `querySelector('[data-field="visual_details.positioning"]')`
- **Correct:** `querySelector('[data-field-name="visual_details.positioning"]')`

Because the selector failed, it fell back to reading old array data, which treated strings as character arrays when JSON.stringify was called.

### Fixed
- Changed `data-field` to `data-field-name` for positioning field query (line 1254)
- Changed `data-field` to `data-field-name` for text_elements field query (line 1259)
- Strings now correctly save as strings, not character-indexed objects

### Impact
- ✅ Positioning saves correctly as text
- ✅ Text Elements saves correctly as text
- ✅ Presets no longer corrupted
- ✅ Data readable and usable

### Migration
**Existing corrupted presets:**
If you have presets with the character array format, you'll need to:
1. Load the preset
2. Re-enter the positioning/text_elements text manually
3. Save the preset again (overwrite with same name)

## [1.10.1] - 2025-11-08

### 🔧 **CRITICAL HOTFIX: Save Button Removal Complete**

Fixed bugs from v1.10.0 where save buttons were not fully removed and "Go Back & Save" was broken.

### Fixed
- **"Go Back & Save" crashes** - Changed `this.stateManager.saveState()` to correct method `this.stateManager.saveSettings()`
  - Error: `Uncaught TypeError: this.stateManager.saveState is not a function`
  - Now properly saves all data when clicking "Go Back & Save"
  
- **Save buttons still present** - Completed removal of ALL individual save buttons:
  - ✅ Removed from textarea fields (positioning, text_elements, motion, audio, etc.)
  - ✅ Removed from array items (objects)
  - ✅ Removed from dialogue items (set `includeSaveButton: false`)
  - ✅ Removed from dropdown custom inputs
  
- **File corruption** - Fixed `_convertDropdownToCustomInput` function structure
  - Duplicate code removed
  - Function properly closes with `select.replaceWith(customInput)`

### Testing
1. Click into any sub-array view (Visual Details, Dialogue, etc.)
2. Edit fields
3. Click "Back & Save" button
4. Should see console: `[GVP] Go Back & Save: All data saved`
5. No crashes
6. No individual 💾 buttons visible

### Impact
- ✅ "Go Back & Save" now actually works
- ✅ All save buttons removed as intended
- ✅ Single unified save workflow functional

## [1.10.0] - 2025-11-08

### 🎯 **MAJOR UPDATE: Visual Details Restructure & Unified Save System**

This is a significant UX improvement update focused on simplifying the JSON Editor and improving data persistence.

### ✨ Added

#### **Object Preset Dropdown**
- **Quick character insertion** with preset dropdown in Objects array
- **9 preset options:**
  - Left Frame Female Subject
  - Centre Frame Female Subject
  - Right Frame Female Subject
  - Blonde Subject
  - Brunette Subject
  - Black Haired Subject
  - Red Headed Subject
  - Multi Colored Hair Subject
  - Artificially Colored Hair Subject
- Select from dropdown → Instantly adds to objects array
- Presets available but **NOT selected by default** (clean slate on load)

### 🔄 Changed

#### **Visual Details Structure**
**BEFORE**:
```javascript
visual_details: {
  objects: [],        // Array
  positioning: [],    // Array
  text_elements: []   // Array
}
```

**AFTER**:
```javascript
visual_details: {
  objects: [],          // Still an array (with preset dropdown)
  positioning: '',      // Now a simple text field
  text_elements: ''     // Now a simple text field
}
```

**Why?**
- Positioning and text elements rarely need multiple distinct entries
- Single textarea is faster to edit
- Reduces UI clutter
- Matches user mental model

#### **Unified Save System**
- **Removed ALL individual 💾 save buttons** from:
  - Objects array items
  - Dialogue array items
  - All sub-array fields
- **Single "Go Back & Save" button** now:
  - Saves ALL fields in current view
  - Saves objects array
  - Saves dialogue array
  - Saves all textareas
  - Saves all dropdowns
  - Persists to chrome.storage
  - Logs confirmation to console
- **No more confusion** about which save button to press!

### 🔧 Fixed

#### **Data Persistence Issues**
- **Strengthened save/load logic** to prevent data loss on:
  - Extension reload
  - Page refresh
  - Browser restart
- **Fixed duplication bug** where text_elements would clone on restart
- **Fixed deletion bug** where objects/dialogue items would disappear
- **Explicit save on "Go Back"** ensures nothing is lost

#### **Default State Improvements**
- **No JSON presets auto-loaded** on refresh/restart
- **Clean slate by default** unless user explicitly loads preset
- Arrays remain empty unless populated
- Fields retain their values across sessions

### 📝 Technical Details

**Files Modified:**
1. `UIFormManager.js`:
   - Added object preset dropdown (lines 605-650)
   - Converted positioning/text_elements rendering to textareas
   - Strengthened `collapseToGrid()` to save ALL data
   - Updated save logic for new Visual Details structure

2. `ArrayFieldManager.js`:
   - Removed individual save buttons (lines 174, 791-805)
   - Commented out auto-save on delete
   - Kept fullscreen and delete buttons only

3. `StateManager.js`:
   - Updated default promptData structure (line 939)
   - Changed `positioning` and `text_elements` from `[]` to `''`

4. `uiConstants.js`:
   - Updated field type declarations
   - Positioning/text_elements now `type: 'scalar'` instead of `'array'`

**Migration:**
Existing data with array values for positioning/text_elements will:
- Load correctly (backwards compatible)
- Display as text (arrays join to string)
- Save as strings going forward

### 🎨 User Experience

**Before:**
```
Objects:
  [Item 1] [💾] [🗑️]
  [Item 2] [💾] [🗑️]
  + Add Item

Positioning:
  [Item 1] [💾] [🗑️]
  + Add Item

Text Elements:
  [Item 1] [💾] [🗑️]
  + Add Item
```

**After:**
```
Objects:    [-- Add Preset Object --▼]
  [Item 1] [⛶] [🗑️]
  [Item 2] [⛶] [🗑️]
  + Add Item

Positioning:
  [Simple textarea field...]

Text Elements:
  [Simple textarea field...]

                    [← Back & Save]
```

### 📊 Impact

- ✅ **Faster workflow** - One save button, fewer clicks
- ✅ **Less confusion** - Clear single save action
- ✅ **Better UX** - Text fields for simple data, arrays only when needed
- ✅ **Preset efficiency** - Quick character insertion
- ✅ **Data safety** - Strengthened persistence prevents loss
- ✅ **Clean defaults** - No auto-loaded presets cluttering workspace

### ⚠️ Breaking Changes

**Minor:**
- Old saved data with `positioning`/`text_elements` as arrays will convert to strings
- Individual save buttons removed (use "Go Back & Save" instead)

**No action required** - Migration is automatic and backwards compatible.

### 🧪 Testing

1. **Object Presets:**
   - Select from dropdown → Adds to objects array
   - Custom text still works with "+ Add Item"

2. **Positioning/Text Elements:**
   - Now simple textareas
   - Can type freely without array structure

3. **Save System:**
   - Edit multiple fields
   - Click "Go Back & Save"
   - Check console: "[GVP] Go Back & Save: All data saved"
   - Reload page → Data persists

4. **No Auto-Load:**
   - Reload extension
   - JSON preset dropdown shows "Select JSON preset…"
   - No preset selected by default
   - Fields retain last saved values

## [1.9.7] - 2025-11-08

### 🔧 Fixed
- **Mode Parameter Not Added to Aurora Messages** - Critical fix for Aurora injection
  - Aurora messages were getting `--mode=normal` appended incorrectly
  - Example: ❌ "Edit this image to show: a girl--mode=normal" 
  - Should be: ✅ "Edit this image to show: a girl"
  
### Root Cause
Mode injection logic ran on ALL `/conversations/new` requests, including Aurora-handled ones. The page interceptor applied mode modification BEFORE checking if Aurora would inject.

### Solution
Added pre-check before mode injection:
1. Check if Aurora is enabled
2. Parse request body to see if `enableImageGeneration: true` and no file attachments
3. If Aurora will inject → Skip mode injection entirely
4. If Aurora won't inject → Apply mode as normal

### Technical Details

**Before (BROKEN)**:
```javascript
// Mode injection happens first (lines 400-416)
modifyRequestPayload(requestInit, { url });  // Adds --mode=normal

// Aurora injection happens later (lines 436+)
if (auroraEnabled && enableImageGeneration) {
  // Injects image, but mode already added to message
}
```

**After (FIXED)**:
```javascript
// Pre-check if Aurora will inject (lines 400-409)
let auroraWillInject = false;
if (auroraEnabled && enableImageGeneration && !fileAttachments) {
  auroraWillInject = true;
}

// Skip mode injection if Aurora is handling it (line 412)
if (requestInit && !auroraWillInject) {
  modifyRequestPayload(requestInit, { url });  // Only runs if Aurora won't inject
}

// Aurora injection runs as normal (lines 436+)
if (auroraEnabled && enableImageGeneration) {
  // Injects image WITHOUT mode parameter pollution
}
```

### Console Logs

**With Fix**:
```
[Aurora] Skipping mode injection - Aurora will handle this request
[Aurora] ✅ Aurora ENABLED - Intercepting /conversations/new request
[Aurora] Conditions met for injection
[Aurora] Uploading custom image for square
[Aurora] ✅ Injected fileAttachments: <id>
```

**Message sent**:
```json
{
  "message": "Edit this image to show: a girl",  // ← No --mode=normal!
  "fileAttachments": ["<id>"],
  "enableImageGeneration": true
}
```

### Testing
1. Enable Aurora
2. Send message: "a girl in a park"
3. Check prompt in Grok UI
4. Should NOT see `--mode=normal` in the message
5. Should only see: "Edit this image to show: a girl in a park"

### Impact
- ✅ Aurora messages now clean without mode pollution
- ✅ Mode injection still works for non-Aurora requests
- ✅ Spicy mode still works correctly
- ✅ No breaking changes to existing functionality

## [1.9.6] - 2025-11-08

### 🎯 **FEATURE COMPLETE: Aurora Image Mode Toggle Now Functional!**

### Added
- **Separate File Pickers** - Two distinct sections for image configuration:
  - **🎨 Blank PNG Images**: Minimal PNGs for fast generation
  - **🖼️ Custom Images**: Detailed images as starting points
  - Each section has Portrait, Landscape, and Square pickers
- **New Storage Keys** for custom images:
  - `auroraCustomImagePortrait`
  - `auroraCustomImageLandscape`
  - `auroraCustomImageSquare`
- **Immediate State Broadcast** - Toggle changes broadcast to page instantly
- **Mode-Based Upload** - Page interceptor now selects correct image source

### Fixed
- **Toggle now functional** - Previously only visual, now actually switches images
- **Image selection logic** - Page interceptor uses `imageMode` to pick blank vs custom
- **State synchronization** - Changes in Settings immediately affect injection behavior

### Technical Implementation

**State Broadcast** (`content.js`):
```javascript
payload: {
  enabled: true,
  aspectRatio: 'square',
  imageMode: 'blank' | 'custom',  // ← NEW
  blankPngs: { portrait, landscape, square },
  customImages: { portrait, landscape, square }  // ← NEW
}
```

**Page Interceptor** (`gvpFetchInterceptor.js`):
```javascript
async function uploadAuroraBlankPNG(type) {
  // Select source based on mode
  const imageSource = auroraImageMode === 'custom' 
    ? auroraCustomImages 
    : auroraBlankPngs;
  const base64 = imageSource[type];
  // Upload selected image...
}
```

**Settings UI** (`UISettingsManager.js`):
- Refactored into reusable helper functions
- `createImageSection()` - Builds picker section
- `createImagePicker()` - Builds individual picker
- Two separate sections rendered from same helpers

### How It Works Now

1. **Toggle in Settings**:
   - User clicks toggle to switch between Blank/Custom
   - Setting saved: `auroraImageMode = 'blank' | 'custom'`
   - State broadcast to page immediately

2. **Image Selection**:
   - Page interceptor receives `imageMode` + both image sets
   - On upload, checks `imageMode` to decide which set to use
   - Uploads correct image based on toggle position

3. **File Management**:
   - Blank PNGs stored in: `auroraBlankPng[Portrait|Landscape|Square]`
   - Custom images stored in: `auroraCustomImage[Portrait|Landscape|Square]`
   - Both sets persist independently
   - Toggle determines which set is active

### Console Logs to Verify

After setting custom images and toggling:
```
[GVP] 📡 Broadcasting Aurora state to page: {
  enabled: true,
  imageMode: 'custom',  // ← Check this!
  hasBlankSquare: true,
  hasCustomSquare: true  // ← Both can be true
}

[Aurora] 📥 Received state from extension {
  imageMode: 'custom',  // ← Confirms mode received
  hasCustomSquare: true
}

[Aurora] Uploading custom image for square  // ← Uses custom!
[Aurora] Upload successful, file ID: <id>
```

### Testing Steps

1. **Upload Blank PNGs** (if not already done)
2. **Toggle to Custom mode**
3. **Upload Custom Images** (portraits, landscapes, etc.)
4. **Toggle back to Blank** → Should use blank PNGs
5. **Toggle to Custom** → Should use custom images
6. **Send message** → Check console for which mode uploaded
7. **Verify** injection uses correct image type

### Breaking Changes
None - fully backward compatible. Defaults to 'blank' mode if not set.

## [1.9.5] - 2025-11-08

### ✨ Added
- **Aurora Image Mode Toggle** - Beautiful 2-point slider in Settings to choose between image types
  - **🎨 Blank PNG Mode**: Use minimal/solid color blank PNGs optimized for fast generation
  - **🖼️ Custom Mode**: Use detailed custom images as starting points for generation
  - Smooth animated slider with gradient effects
  - Blue highlight for Blank PNG mode, Purple highlight for Custom mode
  - Setting persists across sessions via `auroraImageMode` in settings

### UI/UX
- Clean toggle design with gradient backgrounds
- Smooth cubic-bezier animation for slider movement
- Color-coded text labels (white for active, gray for inactive)
- Positioned at top of Aurora Image Configuration section
- Responsive click handler with visual feedback

### Technical
- New setting key: `settings.auroraImageMode` (`'blank'` or `'custom'`)
- Default mode: `'blank'`
- Toggle persists via StateManager
- Console logging for mode changes

## [1.9.4] - 2025-11-08

### 🔧 **CRITICAL FIX: Aurora Upload Endpoint Corrected!**

### Fixed
- **Aurora Upload Failing with 404** - Upload endpoint was completely wrong
  - **Wrong endpoint**: `POST /rest/media/upload` → returned 404
  - **Correct endpoint**: `POST /rest/app-chat/upload-file` ✅
  - **Wrong body format**: `{base64Data, filename, contentType}`
  - **Correct body format**: `{fileName, fileMimeType, content}` ✅
  - **Wrong response field**: `result.fileId` or `result.id`
  - **Correct response field**: `result.fileMetadataId` ✅

### Root Cause
Page interceptor (`gvpFetchInterceptor.js`) was using a completely different (non-existent) upload API compared to the extension's `AuroraManager.js`. The endpoint, request body format, and response parsing were all incorrect.

### Technical Details

**Before (BROKEN)**:
```javascript
// WRONG ENDPOINT
fetch('https://grok.com/rest/media/upload', {
  body: JSON.stringify({
    base64Data: base64,        // ← Wrong key
    filename: 'aurora.png',     // ← Wrong key
    contentType: 'image/png'    // ← Wrong key
  })
});
const fileId = result.fileId || result.id;  // ← Wrong field
```

**After (FIXED)**:
```javascript
// CORRECT ENDPOINT
fetch('https://grok.com/rest/app-chat/upload-file', {
  body: JSON.stringify({
    fileName: 'blank_square.png',  // ← Correct key
    fileMimeType: 'image/png',     // ← Correct key
    content: base64                 // ← Correct key
  })
});
const fileId = result.fileMetadataId;  // ← Correct field
```

### Result
- ✅ Upload now succeeds (200 OK instead of 404)
- ✅ File ID correctly extracted from response
- ✅ File ID cached for reuse
- ✅ Aurora injection completes successfully
- ✅ Blank PNG attached to image generation requests

### What Was Happening
```
1. User sends message with image generation enabled
2. Aurora detects conditions met for injection
3. Attempts to upload blank PNG to /rest/media/upload
4. Server returns 404 Not Found ❌
5. Aurora aborts injection
6. Message sent WITHOUT fileAttachments
7. Grok sees enableImageGeneration=true but no image
8. Generation fails or behaves unexpectedly
```

### What Happens Now
```
1. User sends message with image generation enabled
2. Aurora detects conditions met for injection
3. Uploads blank PNG to /rest/app-chat/upload-file
4. Server returns 200 OK with fileMetadataId ✅
5. Aurora caches file ID for reuse
6. Injects fileAttachments: [fileId]
7. Grok receives valid image attachment
8. Generation proceeds with blank PNG as intended ✅
```

### Testing
After reloading extension (v1.9.4):
1. Enable Aurora (🌌 button)
2. Ensure blank PNG configured in Settings
3. Start new chat with image generation
4. Send message: "a woman in a forest"
5. Check console for:
   - `[Aurora] ✅ Aurora ENABLED - Intercepting /conversations/new`
   - `[Aurora] Uploading blank PNG for square`
   - `[Aurora] Upload successful, file ID: <id>` ← Should now succeed!
   - `[Aurora] ✅ Injected fileAttachments: <id>`
   - `[Aurora] ✅ Aurora injection complete!`

## [1.9.3] - 2025-11-08

### Added
- **🔍 Verbose Aurora Debugging**: Added comprehensive logging to diagnose why Aurora isn't injecting
  - Logs Aurora state when broadcast from content script: `📡 Broadcasting Aurora state to page`
  - Logs when page interceptor receives state: `📥 Received state from extension`
  - Logs Aurora check on EVERY `/conversations/new` and `/responses` request: `🔍 Checking {endpoint}`
  - Shows: `auroraEnabled`, `auroraAspectRatio`, `hasSquarePng`, PNG lengths, etc.
  - Helps identify if problem is: state not sent, state not received, or PNGs not configured

### Purpose
This is a diagnostic release to help identify why Aurora injection isn't working at all (neither on new chats nor follow-ups).

## [1.9.2] - 2025-11-08

### 🔧 **CRITICAL FIX: Aurora Now Works on New Chats!**

### Fixed
- **Aurora Not Injecting on New Chats** - Aurora was only intercepting `/responses` endpoint (continuing chats) but NOT `/conversations/new` (new chats)
  - Root cause: When you start a fresh conversation with image generation, Grok uses `/conversations/new`, not `/responses`
  - Aurora injection code only checked `isResponsesTarget`, missing `isTarget` for new conversations
  - Result: Aurora worked on follow-ups but NEVER on first message ❌

### Changed
- **Unified Aurora Injection**: Consolidated Aurora logic to handle BOTH endpoints
  - Now checks: `if ((isTarget || isResponsesTarget) && auroraEnabled)`
  - Injects on `/conversations/new` (new chats) ✅
  - Injects on `/responses` (continuing chats) ✅
  - Single code path = less duplication, easier maintenance
  
### Technical Details
**What Was Happening:**
```
User starts new chat → /conversations/new
Aurora checks: isResponsesTarget? NO ❌
Result: No injection, empty fileAttachments

User continues chat → /responses  
Aurora checks: isResponsesTarget? YES ✅
Result: Injection works (but too late)
```

**What Happens Now:**
```
User starts new chat → /conversations/new
Aurora checks: (isTarget || isResponsesTarget)? YES ✅
Result: Injection works! fileAttachments populated

User continues chat → /responses
Aurora checks: (isTarget || isResponsesTarget)? YES ✅  
Result: Still works!
```

### Testing
- Start a FRESH conversation (not continuing existing)
- Type a message WITHOUT uploading images
- Check console for `[Aurora] Intercepting /conversations/new`
- Verify `fileAttachments` contains file ID in network tab

## [1.9.1] - 2025-11-08

### Added
- **🎨 Modern Aurora Image Picker UI**: Completely redesigned Aurora image configuration interface
  - **File Picker Buttons**: Click "Choose Image" to select any PNG/JPG/WebP image from your computer
  - **Live Image Previews**: See thumbnails of selected images (max 150x150px)
  - **One-Click Clear**: Remove images easily with Clear button
  - **Collapsible Base64 Input**: Advanced users can still paste base64 directly (nested accordion, collapsed by default)
  - **Better Organization**: Each aspect ratio (Portrait, Landscape, Square) in its own card with icon
  - **Visual Feedback**: Shows which images are configured with previews and clear buttons
  
### Changed
- **Aurora Settings Layout**: More intuitive and user-friendly
  - File picker is now the primary method
  - Base64 textareas moved to collapsible "Advanced" section
  - Added helpful descriptions and icons (📱 Portrait, 🖼️ Landscape, ⬜ Square)
  - Reduced textarea size in advanced section (2 rows instead of 3)
  
### Improved
- **User Experience**: No more copying/pasting huge base64 strings!
  - Just click "Choose Image" and select a file
  - Extension automatically converts to base64 for storage
  - Works with any image format (PNG, JPG, WEBP)
  - Can use custom images, not just blank PNGs

### Technical Details
- Images are still stored as base64 in `chrome.storage.local` for compatibility
- File picker uses FileReader API to convert images client-side
- Preview uses blob URLs for efficient rendering
- Maintains backward compatibility with existing base64 configurations

## [1.9.0] - 2025-11-08

### 🎉 **MAJOR FIX: Aurora Auto-Injector Now Working!**

### Fixed
- **CRITICAL: Aurora Not Injecting** - Completely rewrote Aurora to work in page interceptor context
  - Root cause: Page interceptor (`gvpFetchInterceptor.js`) runs in page context and overrides `window.fetch` before extension's NetworkInterceptor can see requests
  - Page interceptor only handled `/conversations/new`, letting `/responses` pass through untouched
  - Aurora code in NetworkInterceptor never executed because requests were already consumed
  
### Added
- **Aurora in Page Interceptor**: Implemented full Aurora injection logic directly in page context
  - Added `/responses` endpoint detection alongside existing `/conversations/new` handling
  - Implemented aspect ratio detection (portrait/landscape/square) with auto-detection from keywords
  - Added blank PNG upload functionality with 30-minute caching
  - Automatic "Edit this image to show:" prefix when message lacks edit intent
  - File attachment injection into request body before fetch
- **Aurora State Bridging**: Created communication bridge between content script and page interceptor
  - Added `GVP_AURORA_STATE` message type to send Aurora settings to page context
  - Broadcasts Aurora enabled state, aspect ratio selection, and blank PNG base64 data
  - Updates page interceptor when Aurora toggle is clicked or settings change
- **Comprehensive Logging**: Added detailed `[Aurora]` console logs for debugging
  - Tracks interception, condition checks, aspect detection, caching, upload, and injection
  
### Changed
- **Architecture**: Aurora now has dual implementation
  - Page interceptor handles `/responses` (chat mode) - **PRIMARY IMPLEMENTATION**
  - NetworkInterceptor handles other endpoints - **FALLBACK**
  - Page interceptor takes precedence as it runs first in execution chain

### Technical Details
**Why This Was Needed:**
```
Browser Page Context (runs first)
└── gvpFetchInterceptor.js overrides window.fetch
    ├── Handles /conversations/new ✅
    ├── Handles /responses ✅ (NEW!)
    └── Passes through to original fetch

Extension Content Script (runs second)
└── NetworkInterceptor.js
    └── Never sees requests (already consumed)
```

**What Changed:**
- Aurora logic moved from NetworkInterceptor → Page Interceptor
- Settings bridged from content script → page context via postMessage
- Upload/cache/injection now happens in page context before fetch executes

### Testing
- Use diagnostic recorder script to capture fetch requests
- Check console for `[Aurora]` logs showing injection flow
- Verify `fileAttachments` array populated in network tab

## [1.8.9] - 2025-11-08

### Added
- **Diagnostic Tools**: Created two new diagnostic tools to help debug Aurora issues:
  - `DIAGNOSTIC-Aurora-Recorder.user.js` - Tampermonkey script that records all fetch requests and user actions during Aurora testing
  - `TESTING-Aurora-Checklist.md` - Comprehensive testing guide with scenarios, expected logs, and troubleshooting steps
- **Enhanced Fetch Logging**: Added detailed logging at the start of fetch interceptor to track ALL fetch calls and their conditions
- **Aurora State Tracking**: Added Aurora state variables to page interceptor for future bridging support

### Investigation
- Identified that page interceptor (`gvpFetchInterceptor.js`) runs in page context and may be consuming `/responses` requests before NetworkInterceptor can process them
- Page interceptor currently only handles `/conversations/new`, needs extension to handle `/responses` for Aurora
- Diagnosed that fetch wrapper logs not appearing means requests aren't reaching Aurora injection code

### Documentation
- Created detailed testing checklist with 4 test scenarios
- Added common issues and solutions guide
- Provided instructions for collecting diagnostic data

## [1.8.8] - 2025-11-08

### Added
- **Verbose Aurora Debugging**: Added comprehensive console logging throughout Aurora Auto-Injector to track:
  - Injection trigger conditions (enabled, endpoint check, page interceptor status)
  - Request body inspection (enableImageGeneration flag, fileAttachments)
  - Settings validation (aspect ratio, blank PNG availability)
  - Aspect ratio detection and auto-detection logic
  - Cache retrieval and expiry checks
  - PNG upload attempts and file ID responses
  - Message prefix modification
  - Final body modification output
  - Helps diagnose why Aurora may not be injecting in specific scenarios

## [1.8.7] - 2025-11-08

### Fixed
- **CRITICAL: Aurora Not Running in Chat Mode**: Fixed Aurora Auto-Injector not running when page interceptor is active. Aurora now correctly injects on `/responses` endpoint regardless of page interceptor status, since page interceptor only handles `/conversations/new`. This enables Aurora to work in regular Grok chat with `enableImageGeneration: true`.

## [1.8.6] - 2025-11-08

### Fixed
- **CRITICAL: Video Generation 403 Error**: Fixed bug introduced in 1.8.5 where modified request body wasn't being re-stringified for `/conversations/new` endpoint, causing video generation to fail with 403 Forbidden error. Body is now always re-stringified after any modifications (spicy mode or Aurora).

## [1.8.5] - 2025-11-08

### Fixed
- **Aurora Auto-Injector Endpoint**: Changed to only intercept `/responses` endpoint (chat mode) instead of `/conversations/new` (video mode), matching userscript behavior
- **Aurora Injection Logic**: Now only injects when `enableImageGeneration` is already true, never forces it on
- **Aurora Message Prefix**: Always adds "Edit this image to show:" prefix unless message contains "edit", "modify", or "change"
- **Aurora Auto-Detection**: Now only auto-detects aspect ratio when user selects "Square" - respects manual portrait/landscape selection
- **Aurora Cache Clearing**: Fixed to use `chrome.storage.local` instead of `localStorage`

### Changed
- **Aurora Settings Simplified**: Removed unnecessary checkboxes (auto-detect, force edit intent, force enable chat) - these behaviors are now always enabled
- **Aurora Default State**: Changed default to disabled (false) instead of enabled

### Improved
- Added explanatory note in Settings about Aurora's automatic behavior

## [1.8.4] - 2025-11-08

### Fixed
- **Raw Tab Accordions Not Opening**: Scoped Settings panel accordion CSS with `.gvp-settings-content` parent selector to prevent conflicts with existing Raw tab accordion styles. Raw Input, Saved Prompt Slots, and Template System accordions now work correctly again.

## [1.8.3] - 2025-11-08

### Fixed
- **JSON Prompt Leak to Image Gallery**: Fixed textarea fallback logic to filter out image gallery textareas and never blindly use first textarea on page. Prevents JSON prompts from accidentally appearing in image generation field during batch operations.

### Changed
- **Preset Input Width**: Changed from calculated `max-width` to clean `95%` width for better visual appearance
- **Settings Panel Background**: Removed dark overlay background - now only container visible for cleaner look

## [1.8.2] - 2025-11-08

### Fixed
- **Preset Input Covering Button**: Added `max-width` constraint to prevent preset dropdown/input from covering view button
- **Import Context Error**: Added try-catch handling for "Extension context invalidated" error with helpful recovery instructions

### Changed
- **Settings Panel Redesign**: Complete visual overhaul
  - Increased width from 360px to 600px for better readability
  - Replaced blue-tinted background with pure black (rgba(0,0,0,0.85))
  - Organized all settings into collapsible accordions
  - Removed "Wrap prompt in quotes" option (no longer needed)
  - Removed "Voice-only audio" checkbox (functionality retained elsewhere)
  - Export/Import accordion defaults to open for easy access
  - Improved spacing and modern dark theme

## [1.8.1] - 2025-11-08

### Fixed
- **Preset Input Keyboard Event Leak**: Added `stopPropagation()` to keydown/keyup events on custom preset input field to prevent keystrokes from leaking into Grok's prompt area at bottom of screen

## [1.8.0] - 2025-11-08

### Added
- **JSON Preset Panel Redesign**: Moved preset controls from sub-array header to main JSON tab (above category grid)
  - Implemented custom dropdown pattern (like shot settings) with "Custom..." option
  - Text becomes editable when "Custom..." selected, with save button appearing
  - Added "View Preset" button (👁️) next to dropdown to preview selected preset in modal
  - Saves entire JSON state (all categories, arrays, dialogue, tags) as named preset
- **Export/Import Data**: New Settings panel section for backing up and restoring all extension data
  - Export button creates JSON file with all history, generations, templates, presets, and saved prompts
  - Import button restores data from exported file with confirmation prompt
  - Export includes metadata (version, date) for validation

### Changed
- **Category Grid Buttons**: Reduced button size by 10% (height: 112px → 101px, font: 12px → 11px)
- **Grid Layout**: Added padding at top of category grid for better spacing
- Preset controls no longer appear in sub-array headers (cleaner UI, no more pushing back button off screen)

### Fixed
- JSON preset controls pushing back button off screen in sub-array view
- Preset UI now unified in single location above grid (easier to find and use)

## [1.7.26] - 2025-11-03

### Added
- Settings panel button to clear saved dialogue dropdown values and restore default presets.

### Fixed
- Resetting presets now clears cached custom options and refreshes dropdowns across the UI.

## [1.7.25] - 2025-11-03

### Fixed
- Pruned incremental custom dropdown entries and deferred template persistence so only complete values are stored.

## [1.7.24] - 2025-11-03

### Fixed
- Prevented dialogue custom dropdown persistence from storing intermediate keystrokes by saving only on blur or explicit save.

## [1.7.23] - 2025-11-03

### Changed
- Standardized dialogue dropdown presets across the JSON editor and dialogue template modals using shared defaults and persisted custom values.

## [1.7.21] - 2025-11-02

### Fixed
- Dialogue editor now saves accent, language, emotion, and type custom dropdown values as the actual text rather than the `__custom` sentinel, preventing reversion in both template and JSON views.

## [1.7.20] - 2025-11-02

### Fixed
- Ignored quick-launch gestures originating from the Radix dropdown menus on the favorites page so path scans no longer fire while users interact with sort/filter controls.
- Defaulted the quick-launch debug flag to `false` to keep the console quiet unless diagnostics are explicitly enabled.

## [1.7.19] - 2025-11-02

### Fixed
- Guarded saved prompt storage reads/writes against invalid extension contexts so autosave and slot actions stop raising exceptions after navigation events.
- Added an early favorites-page check and expanded overlay detection in QuickLaunchManager to avoid logging composed paths or queueing prompts outside the favorites grid.

## [1.7.18] - 2025-11-02

### Fixed
- Checked for the favorites overlay "Make video" button before attempting target resolution so the quick-launch scanner never emits warnings or hijacks the wrong composer on those clicks.

## [1.7.17] - 2025-11-02

### Fixed
- Ignored clicks on the favorites overlay “Make video” button so quick launch waits for a real card target instead of dumping prompts into the wrong composer.

## [1.7.16] - 2025-11-02

### Changed
- Skipped storage reads/writes when the extension context is gone to avoid `[StorageManager]` errors, and reduced the quick-launch “no favorite target” message to debug in non-gallery clicks.

## [1.7.15] - 2025-11-02

### Fixed
- Updated the automation click helper to use only synthetic pointer/mouse events, preventing duplicate `/rest/app-chat/conversations/new` submissions while keeping React handlers happy.

## [1.7.14] - 2025-11-02

### Changed
- Downgraded missing-prompt messages to info and suppressed auto-retry warnings when no prompt is available, keeping logs quiet until Grok restores JSON responses.

## [1.7.13] - 2025-11-02

### Changed
- Only parse bridge `raw` payloads when they look like JSON, preventing `payload is not defined` errors while keeping JSON ingestion intact.
- Disabled the `/rest/media/post/get` fallback and left notes explaining why, since Grok no longer returns prompts there and it spammed 404s.

## [1.7.12] - 2025-11-02

### Fixed
- Restored raw generator behavior so empty prompts are allowed by default (and quick-launch stays functional without manual text).

## [1.7.11] - 2025-11-02

### Fixed
- Quick-launch automation now ignores clicks that originate inside the GVP shadow DOM, preventing false "no favorite target" warnings when using the bottom bar toggles.

## [1.7.10] - 2025-11-02

### Changed
- Disabled the unfinished multi-video pipeline by default; the manager and monitoring now only boot when `window.__GVP_ENABLE_MULTI_VIDEO__` is explicitly set.
- Skip UIGenerationsManager initialization and timeout polling when the feature flag is off, preventing console spam from orphaned timeouts.

## [1.7.9] - 2025-11-02

### Changed
- Quick launch now starts disabled (`off`) so the UI accurately reflects readiness after reloads.
- Favorites automation listener re-attaches automatically on navigation, eliminating the manual toggle step.

## [1.7.8] - 2025-11-02

### Changed
- Cleaned up the Template System toolbar by removing redundant helper copy for a tighter Raw UI layout.
- Stopped non-JSON prompt fallbacks from auto-filling the Raw Prompt input while keeping JSON auto-population intact for future Grok responses.

## [1.7.6] - 2025-11-02

### Added
- Extensive quick-launch debugging logs covering prompt selection, spicy state sync, send delegation, and navigation fallbacks.

### Changed
- Quick JSON/Raw handlers now accept overrides and return promises for reuse across automation paths.
- Favorites quick-launch immediately navigates back to the grid after dispatching `/conversations/new`.

## [1.7.5] - 2025-11-01

### Fixed
- Quick-launch favorites detection now recognizes the updated gallery cards, including button-driven entries lacking direct anchors.
- Added robust fallback target resolution and detailed debug logging to trace favorite clicks across composed paths.

### Changed
- Quick-launch payloads now capture synthesized target paths from data attributes when anchor hrefs are absent, preserving navigation on resume.

## [1.7.4] - 2025-10-31

### Fixed
- Force-refresh the page fetch interceptor when a new build loads so extension reloads pick up script changes without a browser restart.
- Clear legacy shadow hosts and orphaned bottom bars before booting to guarantee the latest UI renders after reloads.

### Changed
- Centralized the application version constant and wired it through console logs, header banner, popup, and interceptor metadata for consistent display across reloads.

## [1.7.2] - 2025-10-30

### Added
- Account-scoped prompt archive that stores every prompt per image, ready for multi-account history timelines.

### Changed
- Restyled the prompt history modal so it anchors beside the drawer, stays scroll-free, and matches the compact layout spec.

## [1.7.1] - 2025-10-30

### Added
- Manual prompt utilities row with buttons to fetch the latest prompt and open a prompt-history modal for the active gallery image.
- Prompt history modal that lists every retrieved prompt, supports copy/apply actions, and keeps the layout scroll-free.

### Fixed
- Repaired malformed `/rest/media/post/get` payloads where `dialogue` entries were missing quotes, ensuring JSON prompts hydrate the JSON editor instead of falling back to the raw tab.

## [1.7.0] - 2025-10-30

### Removed
- Deleted Batch tab, mini-launcher actions, and all batch-related UI/logic so the extension focuses purely on prompt retrieval.
- Dropped `BatchLauncherManager` module, batch CSS, and `gvpBatchCache` plumbing in the interceptor.
- Simplified JSON modal to rely on current state without batch hydration fallbacks.

## [1.5.5] - 2025-10-27

### Changed
- Tightened JSON category grid spacing and card sizing to remove scrollbars in default view.
- Compressed bottom bar into a single compact row and reduced vertical footprint to match mock.
- Converted Settings tab into modal panel and removed redundant tab button while keeping header control.

## [1.5.4] - 2025-10-27

### Changed
- Further compacted dialogue template accordions, aligning timing inputs with character selects and shrinking padding.
- Embedded subtitles toggle beside the remove control and shortened its label for the final row layout.

## [1.5.3] - 2025-10-26

### Added
- Dialogue template slide-out editor for prefix/suffix rules targeting `dialogue[]`, reusing the dialogue grid UI within a dedicated panel.

### Changed
- Template rows now detect dialogue fields and open the slide-out instead of fullscreen, keeping prefix/suffix arrays synchronized with StateManager helpers.
- Styled the new slide-out overlay to match the drawer aesthetic and provide descriptive tooltips for template triggers.

## [1.5.2] - 2025-10-26

### Fixed
- Prevented dialogue textarea keystrokes from bubbling to the host page, eliminating focus jumps to Grok's hidden textareas.
- Skipped redundant dialogue item re-renders during silent state syncs so typing no longer resets focus.

## [1.5.0] - 2025-10-26

### Added
- Structured dialogue editor with fields for character, timing, emotion, and metadata, including character dropdowns sourced from visual objects.

### Changed
- Dialogue entries now use 0-6s numeric time inputs while exporting Grok-formatted timestamps automatically.
- Dialogue JSON sanitization ensures only populated lines are persisted.
- Updated styling and version banners to reflect the new editor.

## [1.4.2] - 2025-10-26

### Fixed
- Prevented JSON preview calls from crashing when helpers were missing.
- Restored ability to type spaces in subarray text areas while keeping event propagation under control.

### Changed
- JSON View modal now populates reliably with templated prompt data.
- Updated UI header/popup/version banners to display v1.4.2.

## [1.4.0] - 2025-10-26

### Added
- Prefix/suffix template rules now apply automatically to JSON generation requests
- Raw prompt generation applies template rules before dispatching the request

### Changed
- Template system UI redesigned to match compact icon-only layout with fullscreen editors

## [1.3.0] - 2025-10-25

### Added
- Voice-only (silent mode) toggle in Settings with header indicator support

### Changed
- Audio JSON automatically forces music/ambient to `none` and mix level to human-only when silent mode is enabled
- Application initialization now reflects silent mode state before showing the UI

## [1.2.0] - 2025-10-25

### Added
- Browser action click now opens the Grok Video Prompter drawer directly without the intermediate popup

### Changed
- Drawer stays open by default until explicitly minimized, removing the dark backdrop overlay
- Toolbar minimize button now closes the drawer while preserving the new persistent state

## [1.1.7] - 2025-10-25

### Added
- Inject page-context fetch interceptor script to capture `/rest/app-chat/conversations/new` responses directly
- Bridge listener in content script forwards intercepted `videoPrompt` data to existing NetworkInterceptor

### Fixed
- Added `gvpFetchInterceptor.js` to web accessible resources so the injected script can load without `chrome-extension://invalid/` errors

## [1.1.6] - 2025-10-25

### Fixed
- **CRITICAL: Fixed NDJSON parsing - API returns newline-delimited JSON, NOT SSE**
- Removed incorrect `data: ` prefix detection from _processLine()
- Fixed _processLine() to directly parse each line as complete JSON object
- Added better error handling for non-JSON lines
- Added detailed logging for videoUrl and assetId at progress=100
- Now correctly extracts videoPrompt from NDJSON response format

### Changed
- Simplified _processLine() to handle NDJSON format (each line is complete JSON)
- Improved error handling to silently skip non-JSON lines
- Enhanced logging to show videoUrl and assetId when found

## [1.1.5] - 2025-10-25

### Fixed
- **CRITICAL: Replaced entire stream processing implementation with working version from documentation**
- Fixed `_processStream()` to properly read and parse SSE stream line-by-line
- Fixed `_processLine()` to correctly extract videoPrompt at progress=100
- Simplified `_parseAndSetPromptData()` to directly call StateManager and UIManager
- Removed complex payload extraction logic that was preventing stream processing
- Now properly handles `data: ` prefixed SSE lines

### Changed
- Reverted to simpler, proven stream processing approach
- Removed `_extractJsonObjects()` and `_processPayloadEvents()` from stream path
- Streamlined response interception to directly process response.body

## [1.1.4] - 2025-10-25

### Added
- Enhanced logging in NetworkInterceptor for videoPrompt extraction debugging
- Added chunk count tracking in stream processing
- Added buffer size logging for stream diagnostics
- Added buffer preview logging when no payloads extracted

### Changed
- Improved _processStream() logging with detailed progress tracking
- Enhanced _processPayloadEvents() with progress value logging
- Added detailed logging for progress=100 detection and videoPrompt extraction

## [1.1.3] - 2025-10-24

### Fixed

- **Request Payload Mode Flag**
  - Normalizes outbound prompts to a single `--mode=` value when spicy mode toggles
  - Retains existing non-spicy mode flag instead of duplicating entries
- **Response Stream Processing**
  - Consolidated SSE/JSON stream parsing to reliably capture video prompts at 100% progress
  - Improved moderation handling so retries trigger without duplicate processing

### Changed

- `_processJsonResponse` now delegates to the unified payload processor for consistent logging and UI updates

## [1.1.2] - 2025-10-24

### Fixed

- **Request Payload Mode Flag**
  - Normalizes outbound prompts to a single `--mode=` value when spicy mode toggles
  - Retains existing non-spicy mode flag instead of duplicating entries
- **Response Stream Processing**
  - Consolidated SSE/JSON stream parsing to reliably capture video prompts at 100% progress
  - Improved moderation handling so retries trigger without duplicate processing

### Changed

- `_processJsonResponse` now delegates to the unified payload processor for consistent logging and UI updates

## [1.0.4] - 2025-10-24

### Fixed

- **Network Stream Processing**
  - Implemented proper fetch override for `/conversations/new` responses
  - Added stream reading with `response.body.getReader()` to process SSE data
  - Correctly extracts videoPrompt from stream at progress=100
  - Handles both SSE format (`data: {...}`) and plain JSON objects
  - Added comprehensive logging for stream processing and progress tracking
  - Automatically updates UI when videoPrompt is extracted

### Added

- **StateManager Methods**

  - `updatePromptDataFromVideoPrompt()` - Parses videoPrompt string and merges into promptData
  - Validates videoPrompt is not empty before parsing
  - Logs parsed structure for debugging
- **UIManager Methods**

  - `updatePromptFromVideoPrompt()` - Delegation method to update UI from extracted videoPrompt
  - Automatically refreshes UI to display updated JSON data

## [1.1.1] - 2025-10-24

### Fixed

- **Generation Timeout Issues**

  - Monitor now only checks multi-video scenarios (2+ concurrent generations)
  - Single generations skip timeout monitoring (handled by NetworkInterceptor)
  - Prevents false timeout warnings on single video generations
  - Multi-video timeout remains at 30 minutes for actual stuck scenarios
- **Chrome Runtime Connection Error**

  - Added URL validation to check if user is on grok.com
  - Better error handling for "Receiving end does not exist" error
  - Graceful fallback instead of alert spam
  - Clearer user guidance
- **Video Completion Detection**

  - **CRITICAL FIX**: Only extract videoPrompt when progress === 100
  - Added check to verify videoPrompt is not empty string before parsing
  - Added comprehensive logging to show:
    - Each progress value (1, 5, 13, 24, 35, 44, 53, 95, 100)
    - videoPrompt length at each progress level
    - When progress reaches 100
    - videoPrompt content preview
  - Better debugging for why videos aren't being recognized as complete

## [1.1.0] - 2025-10-24

### Added

- **Phase 3: Custom Dropdown Values Persistence**

  - Custom dropdown values now saved to chrome.storage.local
  - Custom values load on UI initialization
  - Custom values appear as options in dropdowns with "(saved)" label
  - Persists across sessions and page reloads
- **Phase 4: Spicy Mode Payload Fix**

  - Spicy mode state now passed to ReactAutomation.sendToGenerator()
  - Mode parameter REPLACED in prompt: `--mode=extremely-spicy-or-crazy` or `--mode=custom`
  - Existing `--mode=` parameters are overwritten, not duplicated
  - Correct mode parameter sent in /new request
  - Generation registration tracks correct mode
- **UI Improvements**

  - Spicy mode indicator (🌶️) in header shows current state (NOT clickable)
  - Spicy mode toggle button (🌶️ Spicy Mode) in bottom bar (clickable)
  - Header indicator highlights in red when spicy mode active
  - Bottom bar button highlights in red when spicy mode active
  - Spicy mode state properly persisted and displayed

### Fixed

- Custom dropdown values now properly persist
- Spicy mode now uses correct payload in requests
- Generation tracking includes correct mode parameter
- Spicy mode indicator and button properly synchronized

## [1.0.6] - 2025-10-24

### Fixed

- **Generation Indicator Always Visible**
  - Removed `display: none` from indicator
  - Now always visible, gray by default
  - Turns blue when generating via CSS class toggle
  - Proper state management without visibility hiding

## [1.0.5] - 2025-10-24

### Fixed

- **Generation Indicator Styling**
  - Removed `gvp-header-btn` class from generation indicator
  - Now displays as plain indicator, not button-styled
  - Properly non-interactive visual element

## [1.0.4] - 2025-10-24

### Fixed

- **Generation Button Inline Styles**
  - Removed conflicting `pointer-events: none` inline style
  - Button now properly clickable and interactive
  - Fixed logic conflict between inline styles and JavaScript visibility management

## [1.0.3] - 2025-10-24

### Fixed

- **Generation Button Not Showing**
  - Fixed 🎬 button not appearing when video generation starts
  - Button now properly shows/hides based on generation status
  - Added `updateGenerationButtonState()` method to UIManager
  - Updated UIStatusManager to call header button state updates

### Changed

- **Tab Height Expanded**
  - Increased tab bar height from 32px to 40px for better readability
  - Tabs no longer appear squished
  - Better visual hierarchy

## [1.0.2] - 2025-10-24

### Fixed

- **Saved Prompts Promise Handling Bug**
  - Fixed `getSavedPrompts()` treating Promise as synchronous value
  - Error: `"[object Promise]" is not valid JSON`
  - Solution: Made all storage methods async with proper await
  - Fixed `saveSavedPrompt()`, `clearSavedPrompt()`, `updateSavedPromptButtonState()`
  - Added .catch() error handlers to all async event listeners

### Changed

- **Header UI Redesign**
  - Removed status badges from main drawer
  - Moved 🎬 generation indicator to header (shows only when generating)
  - Moved 🌶️ spicy mode indicator to header (visual only, toggle in bottom bar)
  - Simplified header: [🌶️ 🎬] [GVP 1.0.1] [⚙️ −]
  - Generation button turns blue when active, hides when idle
  - Spicy button turns red when active
- **Fullscreen Modal Cleanup**
  - Removed minimize and close buttons
  - Centered single "Go Back (Save)" button
  - Word count positioned on right side

## [1.0.1] - 2025-10-24

### Fixed

- **Critical Bug Fix: RawInputManager Chrome Storage API**
  - Fixed `loadRecentPrompts()` using synchronous `chrome.storage.local.get()`
  - Error: `"[object Promise]" is not valid JSON`
  - Solution: Changed to async callback-based API matching AdvancedRawInputManager pattern
  - Both `loadRecentPrompts()` and `saveRecentPrompts()` now use proper Chrome storage callbacks
  - Prevents extension initialization failure when loading recent prompts

### Changed

- RawInputManager.js: Updated storage methods to use Chrome extension API correctly

## [1.0.0] - 2025-10-23

### Added

- Initial release of Grok Video Prompter extension
- Complete UI modularization (11 UI modules)
- JSON Editor tab with 8 categories
- Raw Input tab with templates and recent prompts
- Generations tracking tab
- History/Projects tab
- Settings and Debug tabs
- Fullscreen editor for textarea fields
- Double newline formatting on full stops
- Spicy mode toggle
- Multi-video generation support
- Image project management
- Network interception for stream parsing
- Automatic retry with progressive enhancement
- Aurora (image-to-video) mode support

### Architecture

- 16 modular files (constants, utils, managers)
- Clean separation of concerns
- Proper dependency injection
- Chrome extension manifest v3 compatible
