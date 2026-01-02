
# Grok Video Prompter — Canonical Encyclopedia (v1.16.11)

> **Purpose**: Single-shot orientation for successor AI agents. This document provides complete context for understanding and working with the Grok Video Prompter Chrome extension.
> 
> **For New AI Sessions**: Read this document first to understand the complete project structure, features, and operating rules before making any changes.

---

## 🚀 How to Use This Encyclopedia (MANDATORY READING)

### For AI Agents Starting a Fresh Session

**STEP 1: Read This Entire Document First**
- Start from the top and read through each section sequentially
- Pay special attention to the [Mandatory Operating Rules](#9-mandatory-operating-rules--pitfalls)
- Review the [Glossary](#11-glossary--quick-facts) for terminology
- Study the UI screenshots to understand visual components

**STEP 2: After Reading Each Section, Read The Actual Code**
- After reading about a manager/module in this encyclopedia, go read the actual source file
- Example: After reading about `UIFormManager`, open and read `src/content/managers/ui/UIFormManager.js`
- This helps you familiarize yourself with implementation details and coding patterns
- Note any differences between the documentation and actual code

**STEP 3: Reference This Document Constantly**
- **BEFORE** making any changes → Check this encyclopedia
- **WHEN** facing a problem → Search this encyclopedia for context
- **WHEN** unsure about something → Read relevant section to avoid making things up
- **WHEN** you need to understand dependencies → Check the architecture sections
- **WHEN** your memory feels fuzzy → Re-read sections to refresh

---

## 🔥 **CRITICAL BUG FIXES (v1.16.11 - 2025-11-25)**

### **Bug #1: UI Reset Bug (Root Cause - FIXED)**

**Problem**: Templates were being loaded correctly from IndexedDB (confirmed in logs: 4 templates loaded) but the UI appeared empty after reset, showing "No template rules yet".

**Root Cause**: `UIRawInputManager._renderTemplateRows()` was filtering templates by the `autoApply` property, hiding all templates without `autoApply: true`.

**Evidence from Logs**:
```
[GVP StateManager] 📦 Raw Templates: 4 loaded
[GVP] Rendering template rows (autoApply only), count: 0  ← UI showed 0!
```

**Fix Applied** (`UIRawInputManager.js` lines 779-781): Removed the `.filter(t => t.autoApply)` so all templates are now visible.

**Impact**: Template Manager now displays all templates regardless of their `autoApply` status.

---

### **Bug #2: Delete Button TypeError (FIXED)**

**Problem**: `TypeError: Cannot set properties of null (setting 'textContent')` when deleting templates in editor mode.

**Root Cause**: The delete handler tried to update `previewTitle.textContent` and `previewBody.textContent`, but these elements don't exist when `renderEditor: true` (editor mode has no preview panel).

**Fix Applied** (`UIModalManager.js` lines 1720-1727): Wrapped element updates in proper block-level `if` checks.

**Impact**: No more crashes when deleting templates. The null checks now properly guard against missing elements.

---

### **Additional Fixes in v1.16.11:**

3. **Template Batch Deletion**: Fixed issue where deleting one template would delete all templates with the same name. Now uses unique IDs (`item.id`).

4. **Dialogue Editor Method**: Implemented missing `ArrayFieldManager.createDialogu eList()` static method and ensured `shadowRoot` parameter is passed correctly.

---

## 📋 MANDATORY RULES FOR ALL AI AGENTS

> **These rules MUST be followed without exception. Treat them as your operating guidelines.**

### Rule 1: Version Number Updates
```markdown
✅ ALWAYS update version numbers in ALL 4 locations for EVERY change:
1. manifest.json (line 5) - "version": "X.X.X"
2. popup.html (line 12) - <span class="version">vX.X.X</span>
3. content.js (line 1315) - Console log message (vX.X.X)
4. CHANGELOG.md (top) - Add new entry with version and date

❌ NEVER skip version updates, even for small changes
❌ NEVER update only some locations - it's all 4 or nothing
```

### Rule 2: Consult Encyclopedia Before Acting
```markdown
✅ ALWAYS check this encyclopedia when:
- You're about to make a change
- You encounter a problem or error
- You're unsure about how something works
- You need to understand dependencies between modules
- You need to refresh your understanding

❌ NEVER make assumptions or guess
❌ NEVER make up functionality that doesn't exist
❌ NEVER skip reading relevant sections
```

### Rule 3: Read Code After Reading Documentation
```markdown
✅ ALWAYS read the actual source files after reading about them here
✅ ALWAYS verify documentation matches current implementation
✅ ALWAYS familiarize yourself with coding patterns and style

❌ NEVER rely solely on documentation without checking code
```

### Rule 4: Communication Style
```markdown
✅ ALWAYS explain things in simple, layman's terms
✅ ALWAYS ask questions when you need more information
✅ ALWAYS clarify requirements before making changes
✅ ALWAYS confirm your understanding with the user

❌ NEVER use excessive jargon without explanation
❌ NEVER proceed with uncertainty - ask first
❌ NEVER assume user intent - verify explicitly
```

### Rule 5: Follow UI Tightening Rules
```markdown
✅ ALWAYS maintain spacing: ≤8px vertical, ≤10px horizontal
✅ ALWAYS keep layouts tight and compact
✅ ALWAYS avoid floating controls or dead space
✅ ALWAYS check UI screenshots for visual reference

❌ NEVER add unnecessary spacing or padding
❌ NEVER create scrolling panels without justification
```

### Rule 6: Testing & Verification
```markdown
✅ ALWAYS run through the [Verification Checklist](#10-verification-checklist)
✅ ALWAYS test changes before claiming completion
✅ ALWAYS verify integration with other components

❌ NEVER skip testing
❌ NEVER claim something works without verification
```

### Rule 7: Refresh Your Memory
```markdown
✅ WHEN facing complexity → Re-read relevant sections
✅ WHEN unsure about dependencies → Review architecture diagrams
✅ WHEN debugging → Check troubleshooting sections
✅ WHEN implementing features → Review similar existing implementations

❌ NEVER rely on vague memory - always verify
```

### Rule 8: Verify Method Signatures
```markdown
✅ ALWAYS verify the exact method name and signature in the source definition BEFORE calling it
✅ ALWAYS check the export/class definition (e.g., `StateManager.js`) to confirm the API
✅ ALWAYS cross-reference method names when connecting UI components to backend managers

❌ NEVER guess method names based on patterns (e.g., assuming `setTemplate` exists because `getTemplate` does)
❌ NEVER write consumer code without looking at the provider code first
```

---

## 💡 Quick Start Workflow Example

**Example: User asks you to fix a bug in the JSON Editor**

1. ✅ **Consult Encyclopedia**: Read Section 4.2 about JSON Tab (`UIFormManager`)
2. ✅ **Read Actual Code**: Open `src/content/managers/ui/UIFormManager.js` and read it
3. ✅ **Check Dependencies**: Review what `UIFormManager` depends on (StateManager, ArrayFieldManager, etc.)
4. ✅ **Look at Screenshots**: Check `JsonEditArray.png` and related screenshots to understand UI
5. ✅ **Make Changes**: Fix the bug following UI rules and coding patterns
6. ✅ **Update Versions**: Update all 4 version locations + CHANGELOG
7. ✅ **Test**: Run verification checklist items related to JSON tab
8. ✅ **Explain**: Describe changes to user in simple terms
9. ✅ **Ask**: "Is this working as expected? Do you need any adjustments?"

---

## Executive Summary

**Grok Video Prompter** is a Chrome extension that enhances Grok's AI video generation interface with advanced prompt management, batch automation, and quality-of-life features.

### Core Features

1. **Shadow DOM UI System** - Sidebar drawer with tabbed interface (JSON Editor, Raw Prompt, Generations, History, Settings)
2. **Prompt Management** - Structured JSON editor with templates, custom dropdowns, fullscreen editors, saved slots
3. **🌶️ Spicy Mode** - Aggressive prompt mode toggle with **native button detection** (auto-opens Grok's "Video Presets" menu)
4. **📤 Upload Injection** - Queue JSON/Raw prompts for automatic injection on next image upload (no regeneration needed)
5. **Batch Generation** - Multi-video queue manager with concurrent processing, progress tracking, retry logic
6. **Template System** - Prefix/suffix injection for both JSON fields and raw prompts, including dialogue templates
7. **History Tracking** - Per-image prompt timeline with apply-to-editor, copy JSON, metadata display
8. **Aurora Auto-Injection** - Automated blank PNG uploads for image-to-video workflows
9. **Network Interception** - Dual-layer fetch override (content + page context) for payload rewriting and response parsing
10. **Quick Launch** - Gallery automation with spicy+quick mode auto-generation (works with JSON and Raw)
11. **🎬 Video Playlist** - Auto-playing sequential video player with favorites auto-scroll (v1.15.18-1.15.20)
12. **🆕 Upload Mode** - Batch image upload automation with queue management and navigation (v1.7.26)

### Quick Facts

- **Current Version**: v1.16.11 (update in 4 locations: `manifest.json`, `popup.html`, `content.js`, CHANGELOG.md)
- **Architecture**: Shadow DOM-based UI, modular manager system, dual-layer network interception
- **Storage**: Chrome local storage for settings, templates, custom dropdowns, generation history
- **Key Files**: 40+ JavaScript modules, stylesheet constants, injected page interceptor
- **UI Rules**: ≤8px vertical spacing, ≤10px horizontal, zero-scroll default, tight layouts

### For AI Agents

This encyclopedia uses the format `@filepath#start_line-end_line` for internal code references. Always:
1. Read [Mandatory Operating Rules](#9-mandatory-operating-rules--pitfalls) before making changes
2. Update all 4 version locations when shipping
3. Follow UI tightening rules (spacing, alignment, no floating controls)
4. Test using the [Verification Checklist](#10-verification-checklist)
5. Cross-reference the [Glossary](#11-glossary--quick-facts) for terminology

### UI Screenshots Reference

Visual reference images for key UI components:

| UI Component | Screenshot |
|--------------|------------|
| **Launcher (Closed State)** | `A:\Tools n Programs\SD-GrokScripts\ClosedMainUI.png` |
| **Main UI (Open State)** | `A:\Tools n Programs\SD-GrokScripts\OpenMainUI.png` |
| **JSON Editor - Array View** | `A:\Tools n Programs\SD-GrokScripts\JsonEditArray.png` |
| **JSON Editor - Dialogue** | `A:\Tools n Programs\SD-GrokScripts\JsonEditDialogue.png` |
| **JSON Editor - Sub-Array View** | `A:\Tools n Programs\SD-GrokScripts\Subarray.png` |
| **JSON Editor - Sub-Array Expanded (Dropdowns)** | `A:\Tools n Programs\SD-GrokScripts\SubarrayExapnded+Drodowns.png` |
| **JSON Editor - Sub-Array Expanded (Custom Dropdowns)** | `A:\Tools n Programs\SD-GrokScripts\SubarrayExapnded+CustomDrodowns.png` |
| **Fullscreen Textarea Editor** | `A:\Tools n Programs\SD-GrokScripts\Fullscreentextarea.png` |
| **Raw Prompt + Saved Prompts** | `A:\Tools n Programs\SD-GrokScripts\RawPrompt+SavedPromtps.png` |
| **Template Creator** | `A:\Tools n Programs\SD-GrokScripts\TemplateCreator.png` |
| **Template Editor (Dialogue)** | `A:\Tools n Programs\SD-GrokScripts\TemplateEditorDialogue.png` |
| **History Tab** ⚠️ **OUTDATED (v1.13.8 redesign)** | `A:\Tools n Programs\SD-GrokScripts\HistoryTab.png` |
| **History - Image ID Item** ⚠️ **OUTDATED (v1.13.8 redesign)** | `A:\Tools n Programs\SD-GrokScripts\HistoryImageIDItem.png` |
| **Settings Tab (Part 1)** | `A:\Tools n Programs\SD-GrokScripts\Settingspt1.png` |
| **Settings Tab (Part 2)** | `A:\Tools n Programs\SD-GrokScripts\Settingspt2.png` |
| **View Final JSON Modal** | `A:\Tools n Programs\SD-GrokScripts\ViewFinalJSON.png` |

---

## 0. Navigation Map

1. [Extension Topography](#1-extension-topography)
2. [Boot Sequence & Message Bus](#2-boot-sequence--message-bus)
3. [JavaScript Encyclopedia](#3-javascript-encyclopedia)
   - [Constants & Styling](#31-constants--styling)
   - [Utility Layer](#32-utility-layer)
   - [State, Storage & Templates](#33-state-storage--templates)
   - [Automation & Retry Stack](#34-automation--retry-stack)
   - [Network Interception (Content + Page)](#35-network-interception-content--page)
   - [UI Orchestration & Sub-Managers](#36-ui-orchestration--sub-managers)
   - [Entry, Background, Popup](#37-entry-background-popup)
4. [UI Surfaces & Click-through Flows](#4-ui-surfaces--click-through-flows)
5. [Template & Prompt Transformation Systems](#5-template--prompt-transformation-systems)
6. [Generation Lifecycle (Click A → Result B)](#6-generation-lifecycle-click-a--result-b)
7. [Persistence, Storage Keys & Cleanup](#7-persistence-storage-keys--cleanup)
8. [Backups, Historical Artifacts & Reference Docs](#8-backups-historical-artifacts--reference-docs)
9. [Mandatory Operating Rules & Pitfalls](#9-mandatory-operating-rules--pitfalls)
10. [Verification Checklist](#10-verification-checklist)
11. [Glossary & Quick Facts](#11-glossary--quick-facts)
12. **Video Playlist System (NEW)](#12-video-playlist-system-new)**
   - [Overview](#121-overview)
   - [Playlist Building](#122-playlist-building) 
   - [Favorites Auto-Scroll](#123-favorites-auto-scroll)
   - [Network API Integration](#124-network-api-integration)
   - [Player UI](#125-player-ui)
   - [Playlist Manager](#126-playlist-manager)
   - [Future Enhancements](#127-future-enhancements)
13. **Upload Automation System](#13-upload-automation-system)**
   - [Overview](#131-overview)
   - [Architecture](#132-architecture)
   - [File Injection Method](#133-file-injection-method)
   - [Upload Flow](#134-upload-flow)
   - [Navigation Logic](#135-navigation-logic)
   - [Button Functions](#136-button-functions)
   - [Cancellation System](#137-cancellation-system)
   - [State Management](#138-state-management)
   - [Queue Item Structure](#139-queue-item-structure)
   - [UI Specifications](#1310-ui-specifications)
   - [Common Issues & Fixes](#1311-common-issues--fixes)
   - [Future Enhancements](#1312-future-enhancements)

---

## 1. Extension Topography

| Layer | Responsibility | Principal Files |
| --- | --- | --- |
| Styling | Shadow DOM visuals (launcher, drawer, header, tabs, bottom bar, modals). | `src/content/constants/stylesheet.js` @grok-video-prompter-extension/src/content/constants/stylesheet.js#1-1351 |
| Utility | Shared helpers (storage wrappers, formatting, dynamic arrays, constants). | `StorageHelper.js`, `SentenceFormatter.js`, `ArrayFieldManager.js`, `uiConstants.js`, `ModerationDetector.js`, `src/utils/storage.js` |
| State & Persistence | Canonical state tree, template handling, generation persistence. | `StateManager.js`, `StorageManager.js` |
| Automation & Retry | React-compatible DOM automation, quick-launch routing, multi-generation queue, moderation retries, Aurora asset handling. | `ReactAutomation.js`, `content.js` (QuickLaunchManager), `MultiVideoManager.js`, `AutomaticRetryManager.js`, `AuroraManager.js`, `RawInputManager.js`, `AdvancedRawInputManager.js` |
| **Upload Automation** | **Batch image upload queue with automated injection into Grok's textarea.** | **`UploadAutomationManager.js`, `UIUploadManager.js`** |
| Network Interception | Content-script fetch override and page-context interceptor (spicy payload rewrite, videoPrompt capture, gallery ingestion). | `NetworkInterceptor.js`, `public/injected/gvpFetchInterceptor.js` |
| UI Orchestration | Shadow DOM bootstrap, header/backdrop/tab wiring, modals, status badges, tab-specific managers. | `UIManager.js`, `UIHelpers.js`, `uiConstants.js`, `UITabManager.js`, `UIStatusManager.js`, `UIFormManager.js`, `UIRawInputManager.js`, `UIGenerationsManager.js`, `UIHistoryManager.js`, `UISettingsManager.js`, `UIModalManager.js`, `BatchLauncherManager.js`, **`UIUploadManager.js`**, **`UIPlaylistManager.js`** |
| Entry & Messaging | Content bootstrap, background defaults, browser action & popup UX, toolbar messaging. | `content.js`, `background.js`, `popup.js`, `options.js` |

Version in manifest/content/UI header: **v1.15.58** (`manifest.json` @grok-video-prompter-extension/manifest.json#1-12, `content.js` @grok-video-prompter-extension/src/content/content.js#1-18, UI title set inside `UIManager` @grok-video-prompter-extension/src/content/managers/UIManager.js#220-231).

### 🔥 Active Initiative — Native Spicy + Gallery Automation (Nov 2025)

**Goal:** Make Grok’s built-in “Spicy” preset behave as if the extension clicked it, injected the Quick JSON/RAW prompt, and returned the user to the gallery automatically—without duplicate `/conversations/new` calls.

**Current Focus (v1.15.55 → v1.15.58):**
1. **Prompt Bridge:** Broadcast the currently-armed Quick JSON/RAW prompt to the page interceptor so the first `/rest/app-chat/conversations/new` request contains the full instructions and `--mode=extremely-spicy-or-crazy` when Spicy is ON.
2. **Native Button Detection:** Reliably locate `button[aria-label="Video Presets"]` and the `div[role="menuitem"]` entry for “Spicy,” even when Grok nests them inside sidebar containers. We now poll for up to 3 seconds and allow explicit selectors to bypass sidebar filtering.
3. **Single Request Flow:** Suppress the old Quick Launch double-request path so only the native Grok request fires (prevents duplicate videos and quota waste).
4. **Gallery Return:** After clicking native Spicy, replay a click on `button[aria-label="Favorites"]` to drop the user back into gallery mode automatically.
5. **Diagnostics:** Console logs now include `[GVP Spicy] Searching for trigger button…` checks, `🎯 Using explicit Video Presets selector`, menu item dumps, and `[GVP Gallery] 📡 Bridged prompt…` so QA can confirm each stage.
6. **Auto-click guard (v1.15.66):** `_detectNativeSpicyButton({ autoClick: true })` auto-presses Grok’s preset when we enter `/imagine/post/*`, and returns an `autoClicked` flag so downstream flows (gallery automation, manual toggle) skip their own `element.click()` calls. This eliminated the triple `/rest/app-chat/conversations/new` bursts when SPA navigation fired the handler twice.

**Open Tasks:**
- Ensure `_detectNativeSpicyButton()` never exits before the presets control mounts on slower networks.
- Make the Favorites click run even when native Spicy is unavailable (so gallery always resumes).
- Capture telemetry for failures (`Video preset trigger button not found`), so we can prompt the user to refresh selectors.

Keep this section updated as we iterate; subsequent releases should note selector changes, timing tweaks, or fallback heuristics.

---

## 2. Boot Sequence & Message Bus

1. **Content entry point (`content.js`)** loads once DOM is ready.
   - Disables Tampermonkey bridge remnants and restores native fetch if a legacy wrapper is detected @grok-video-prompter-extension/src/content/content.js#35-99.
   - Instantiates core managers, exposes globals (`window.gvpUIManager`, `window.gvpStateManager`, `window.gvpUIGenerationsManager`) and kicks off:
     - State initialization + storage restore @grok-video-prompter-extension/src/content/content.js#101-176.
     - UI construction via `UIManager.createUI()` followed by automatic drawer open @grok-video-prompter-extension/src/content/content.js#132-138.
     - Network interceptor install, React automation init, multi-generation monitor, image project manager boot @grok-video-prompter-extension/src/content/content.js#154-175.
     - Quick-launch automation now short-circuits favorites overlay "Make video" buttons before resolving targets to avoid misrouting prompts into the image composer @grok-video-prompter-extension/src/content/content.js#293-320.
   - Broadcasts spicy state (see §4.4) and installs toolbar icon listener (`openGVPUI`, `toggleDrawer`) to satisfy popup/background messages @grok-video-prompter-extension/src/content/content.js#185-213.

2. **Browser action / background service worker (`background.js`)** seeds default `gvp-settings` and proxies browser action clicks to the content script @grok-video-prompter-extension/src/background/background.js#1-55.

3. **Popup (`popup.js`)** guards against missing content scripts and non-grok tabs, retries three times when the page context is slow, then sends `openGVPUI` which the content listener handles @grok-video-prompter-extension/src/popup/popup.js#1-70.

4. **Page-context interceptor** (`public/injected/gvpFetchInterceptor.js`) synchronises spicy mode and mirrors `/rest/app-chat/conversations/new` traffic when CSP allows injection (see §5.2) @grok-video-prompter-extension/public/injected/gvpFetchInterceptor.js#1-337.

Message flow summary:

```
Popup/background → chrome.tabs.sendMessage → content.js listener → UIManager.toggleDrawer/openDrawer → UI shadow DOM
UIManager.toggleSpicyMode → notifySpicyState/postMessage → page fetch interceptor → request payload rewrite → Grok backend
NetworkInterceptor progress → UIStatusManager.updateGenerationStatus/updateProgressBar → UI badges & progress bar
```

---

## 3. JavaScript Encyclopedia

### 3.1 Constants & Styling

| File | Highlights |
| --- | --- |
| `src/content/constants/stylesheet.js` @grok-video-prompter-extension/src/content/constants/stylesheet.js#1-1351 | Single source of truth for Shadow DOM CSS (launcher, drawer, header, tabs, bottom bar, modals, timeline cards). Honors UI-tightening rules (≤8 px vertical spacing, ≤10 px horizontal, zero-scroll default). Contains button state styling (`.gvp-spicy-mode-btn.active`, emoji header buttons, dialogue template overlay). |
| `src/content/managers/ui/uiConstants.js` @grok-video-prompter-extension/src/content/managers/ui/uiConstants.js#1-41 | Tab names, category names, saved prompt slot count, raw template field metadata (value/label/type) used throughout forms, raw templates, and BatchLauncher. |

### 3.2 Utility Layer

| File | Responsibility |
| --- | --- |
| `src/content/utils/StorageHelper.js` @grok-video-prompter-extension/src/content/utils/StorageHelper.js#1-30 | Promise-based `chrome.storage.local` helpers (legacy compatibility). Modern modules call Chrome APIs directly but older code still imports these wrappers. |
| `src/utils/storage.js` @grok-video-prompter-extension/src/utils/storage.js#1-26 | ES module wrappers for storage operations when used outside content scripts (build tooling/tests). |
| `src/content/utils/SentenceFormatter.js` @grok-video-prompter-extension/src/content/utils/SentenceFormatter.js#1-19 | Converts textarea text between display (double newline) and storage formats; `hasFormatting` quickly detects display formatting. |
| `src/content/utils/ModerationDetector.js` @grok-video-prompter-extension/src/content/utils/ModerationDetector.js#1-67 | Static utilities to detect moderation flags, extract reason strings, and confirm completion events from Grok response payloads. |
| `src/content/utils/ArrayFieldManager.js` @grok-video-prompter-extension/src/content/utils/ArrayFieldManager.js#1-400 | Builds dynamic array field UIs (objects, positioning, dialogue, tags). Handles dialogue-specific accordion UI, item indexing, fullscreen triggers, and value extraction. UIFormManager delegates array rendering/synchronisation here. Exposes `resetDialoguePresetDefaults()` so cached presets rebuild after a reset. |

### 3.3 State, Storage & Templates

| File | Key Notes |
| --- | --- |
| `src/content/managers/StateManager.js` @grok-video-prompter-extension/src/content/managers/StateManager.js#1-978 | Canonical state tree (UI flags, prompt data, generation tracking, settings, templates). Handles settings load/save, template normalisation, dialogue utilities, silent-mode defaults, videoPrompt ingestion (`updatePromptDataFromVideoPrompt`), multi-generation registration/update/complete, storage initialisation, template application for JSON/Raw flows, and targeted wipes via `clearCustomDropdownValues()` @grok-video-prompter-extension/src/content/managers/StateManager.js#132-162. |
| `src/content/managers/StorageManager.js` @grok-video-prompter-extension/src/content/managers/StorageManager.js#1-324 | Persists active/completed generations, stats, last sync; trims history to 100 entries; exposes helpers to clear caches and update stats. Used by StateManager and MultiVideoManager. |
| `src/content/managers/ImageProjectManager.js` @grok-video-prompter-extension/src/content/managers/ImageProjectManager.js#1-370 | Tracks per-image prompt history, metadata, generations, favourites. Integrates with UIHistoryManager to render prompt timelines and supports chrome storage persistence across sessions. |

### 3.4 Automation & Retry Stack

| File | Description |
| --- | --- |
| `src/content/managers/ReactAutomation.js` @grok-video-prompter-extension/src/content/managers/ReactAutomation.js#1-242 | React-safe automation for Grok textarea/button: waits for selectors, applies native property setters, dispatches React events, clicks submit, registers generation IDs, updates UI status/progress and state history. Handles fallback selectors and logs spicy state. |
| `src/content/content.js` (QuickLaunchManager) @grok-video-prompter-extension/src/content/content.js#39-476 | Handles favorites quick-launch workflow, including guards that ignore overlay "Make video" buttons before resolving targets so prompts only enqueue once the actual favorite card is detected. |
| `src/content/managers/MultiVideoManager.js` @grok-video-prompter-extension/src/content/managers/MultiVideoManager.js#1-378 | Batch queue orchestrator. Supports concurrent generations (default 3), queueing, monitoring timeouts/stuck jobs, updating state/UI, cancellation, and statistics. Integrates with UI manager for status updates and StorageManager for persistence. |
| `src/content/managers/AutomaticRetryManager.js` @grok-video-prompter-extension/src/content/managers/AutomaticRetryManager.js#1-367 | Moderation retry logic: exponential backoff, progressive prompt softening, fallback to normal mode, retry notifications, and failure logging. Called from NetworkInterceptor when a generation is moderated. |
| `src/content/managers/AuroraManager.js` (not shown above) | Automates blank PNG uploads and caching for image-to-video mode; integrates with NetworkInterceptor to inject assets when required. |
| `src/content/managers/RawInputManager.js` @grok-video-prompter-extension/src/content/managers/RawInputManager.js#1-279 | Baseline raw prompt utilities (templates, saved prompts, batch parsing). Superseded in UI by UIRawInputManager but still exposes template data for other managers. |
| `src/content/managers/AdvancedRawInputManager.js` @grok-video-prompter-extension/src/content/managers/AdvancedRawInputManager.js#1-321 | Enhanced raw prompt processing: quote wrapping, spicy mode flag injection, template merging, previews, word counts, autosave with extension-context validation, and recent prompt storage. Fed by UIRawInputManager. |

### 3.5 Network Interception (Content & Page)

| File | Highlights |
| --- | --- |
| `src/content/managers/NetworkInterceptor.js` @grok-video-prompter-extension/src/content/managers/NetworkInterceptor.js#1-1585 | Wraps `window.fetch`, handles `/rest/app-chat/conversations/new`, merges request metadata (spicy mode, Aurora headers), streams responses, extracts `videoPrompt` at progress 100, calls `UIManager.updatePromptFromVideoPrompt`, propagates progress to UIStatusManager, and coordinates moderation retries plus gallery ingestion. Also bridges gallery/history data into ImageProjectManager/UIHistoryManager. |
| `public/injected/gvpFetchInterceptor.js` @grok-video-prompter-extension/public/injected/gvpFetchInterceptor.js#1-337 | Page-level fetch override (when injected via `chrome.scripting`). Mirrors spicy state via `postMessage`, rewrites request payload, emits progress/`videoPrompt` events, and ships gallery data back to content script. |

### 3.6 UI Orchestration & Sub-Managers

#### Core

| File | Purpose |
| --- | --- |
| `src/content/managers/UIManager.js` @grok-video-prompter-extension/src/content/managers/UIManager.js#1-300 | Builds Shadow DOM, header, tabs, modals, bottom bar, launcher panel; instantiates all sub-managers; toggles drawer/backdrop; exposes delegation methods (updateProgressBar, updateGenerationStatus, getCurrentJson, toggleSpicyMode, etc.). Includes Aurora mode, upload automation, silent mode, multi-gen history integration. |
| `src/content/managers/ui/UITabManager.js` @grok-video-prompter-extension/src/content/managers/ui/UITabManager.js#1-130 | Renders tab buttons, constructs tab content by calling into sub-managers, and handles tab switching (class toggles and display states). |

#### Status & Notifications

| File | Notes |
| --- | --- |
| `src/content/managers/ui/UIStatusManager.js` @grok-video-prompter-extension/src/content/managers/ui/UIStatusManager.js#1-193 | Header badge container, generation status updates, retry counters, moderation warnings, progress bar width updates, spicy button state toggling. |

#### Modal & View Helpers

| File | Notes |
| --- | --- |
| `src/content/managers/ui/UIModalManager.js` @grok-video-prompter-extension/src/content/managers/ui/UIModalManager.js#1-142 | Fullscreen editor (single “← Go Back (Save)” button), prompt-history modal, View JSON modal (copy/export). Coordinates with SentenceFormatter and UIFormManager (`handleFullscreenSave`) to keep UI fields synchronised. |
| `src/content/managers/ui/UIHelpers.js` @grok-video-prompter-extension/src/content/managers/ui/UIHelpers.js#1-610 | Shared UI utilities (status badge formatter, accordion factory, dialogue template overlay). Used across raw/template panels and history cards. |

#### Tab Managers

| Tab | File | Highlights |
| --- | --- | --- |
| JSON Editor | `UIFormManager.js` @grok-video-prompter-extension/src/content/managers/ui/UIFormManager.js#1-766 | Category grid + sub-array view, dynamic dropdown-to-custom conversions (with storage), ArrayField integration, fullscreen editors, JSON serialisation, API response merging (`updateFromApiResponse`), and generation triggers. Removes stale custom dropdown options when presets change to keep select lists clean @grok-video-prompter-extension/src/content/managers/ui/UIFormManager.js#101-135. |
| Raw Prompt | `UIRawInputManager.js` @grok-video-prompter-extension/src/content/managers/ui/UIRawInputManager.js#1-965 | Accordion stack (raw textarea, saved slots, template system, recent prompts), live preview via AdvancedRawInputManager, saved slot persistence, template editing (prefix/suffix/dialogue panel). |
| Generations | `UIGenerationsManager.js` @grok-video-prompter-extension/src/content/managers/ui/UIGenerationsManager.js#1-444 | Generation list rendering, progress updates, moderation badges, stats (active/queued/completed/failed), cancellation controls, container discovery fallbacks. |
| History | `UIHistoryManager.js` @grok-video-prompter-extension/src/content/managers/ui/UIHistoryManager.js#1-274 | Prompt timeline cards with metadata (model/mode/moderation/video link), apply-to-editor button, copy JSON, fetch-latest handler (wired by UIManager). |
| Settings | `UISettingsManager.js` @grok-video-prompter-extension/src/content/managers/ui/UISettingsManager.js#1-388 | Inline settings panel (wrap in quotes, silent/voice-only mode, Aurora auto-inject configuration, cache clear, aspect ratio selection). Synchronises silent mode to UI audio fields and header voice indicator and now includes a “Dialogue Presets” reset button that clears saved dropdown values and restores defaults @grok-video-prompter-extension/src/content/managers/ui/UISettingsManager.js#101-170. |
| Batch Planner | `BatchLauncherManager.js` @grok-video-prompter-extension/src/content/managers/ui/BatchLauncherManager.js#1-887 | (Currently unused in main tab layout) Provides future multi-replay/selection UI sourcing from history/gallery datasets. |

#### Bottom Bar & Launcher

Bottom bar built in `UIManager._createBottomBar` @grok-video-prompter-extension/src/content/managers/UIManager.js#900-1100 with buttons for View JSON (opens modal), Generate JSON (UIFormManager.handleGenerateJson), Generate Raw (UIRawInputManager.handleGenerateRaw), and Spicy toggle. Launcher panel defined separately with Quick JSON/Raw toggles, Upload, Silent, Aurora, and Quote modes. Backdrop defined in `_createBackdrop`.

### 3.7 Entry, Background, Popup

| File | Highlights |
| --- | --- |
| `src/content/content.js` @grok-video-prompter-extension/src/content/content.js#1-339 | Initialization pipeline, toolbar message handler, spicy broadcast helpers (`_postStateToPage`, `_broadcastSpicyState`, `notifySpicyState`), global fullscreen helper. |
| `src/background/background.js` @grok-video-prompter-extension/src/background/background.js#1-55 | On-install default settings, message responder for `getSettings`, browser action click handler with toggle fallback. |
| `src/popup/popup.js` @grok-video-prompter-extension/src/popup/popup.js#1-70 | Popup UI entrypoint; validates active tab, retries messaging, surfaces Chrome runtime errors to user. |
| `src/options/options.js` @grok-video-prompter-extension/src/options/options.js#1-34 | Options page (outside shadow UI) for adjusting stored settings. |

---

## 4. UI Surfaces & Click-through Flows

### 4.1 Header & Status Row

*Location:* `UIManager._createHeader` + `UIStatusManager.createStatusDisplay`.

**Screenshots**: 
- Main UI Open: `A:\Tools n Programs\SD-GrokScripts\OpenMainUI.png`
- Launcher Closed: `A:\Tools n Programs\SD-GrokScripts\ClosedMainUI.png`

1. **Status badges (left)**: `UIStatusManager.updateGenerationStatus` updates icon/text, exposes retry counter, moderation reason, and toggles header generation button state @grok-video-prompter-extension/src/content/managers/ui/UIStatusManager.js#55-158.
2. **Title**: `Grok Video Prompter v13.10` text currently hard-coded; ensure it matches manifest version during releases (@UIManager.js#116-119). Header buttons currently limited to minimize (drawer toggle). Voice-only indicator updates via `UIManager.updateVoiceOnlyIndicator` (hooked when silent mode toggles).
3. **Drawer toggle**: Minimize button calls `UIManager.toggleDrawer`, toggling shadow classes/backdrop/bottom bar display @UIManager.js#209-220.

### 4.2 Tabs & Content Area

**JSON Tab** (`UIFormManager`):

**Screenshots**:
- Array Editor: `A:\Tools n Programs\SD-GrokScripts\JsonEditArray.png`
- Dialogue Editor: `A:\Tools n Programs\SD-GrokScripts\JsonEditDialogue.png`
- Sub-Array View: `A:\Tools n Programs\SD-GrokScripts\Subarray.png`
- Sub-Array Expanded (Dropdowns): `A:\Tools n Programs\SD-GrokScripts\SubarrayExapnded+Drodowns.png`
- Sub-Array Expanded (Custom Dropdowns): `A:\Tools n Programs\SD-GrokScripts\SubarrayExapnded+CustomDrodowns.png`
- Fullscreen Textarea Editor: `A:\Tools n Programs\SD-GrokScripts\Fullscreentextarea.png`

1. **Grid view**: Cards for each category (`uiConstants.CATEGORY_NAMES`). Clicking calls `expandCategory` which hides grid, shows sub-array view, and renders fields with `ArrayFieldManager` (arrays) or textareas/dropdowns (scalars) @UIFormManager.js#38-195.
2. **Custom dropdown values**: Selecting “Custom…” converts the control into input+save button, saves to `gvp-custom-dropdown-values` via `_saveCustomDropdownValue` and updates state @UIFormManager.js#198-289. See screenshots showing both regular dropdown view and custom dropdown input view for comparison.
3. **Array editing**: `ArrayFieldManager.createArrayField` supplies add/remove buttons, fullscreen icons, and state syncing. `saveArrayField` writes to `state.promptData` while preserving unsaved display if invoked silently (e.g., while typing) @UIFormManager.js#440-463.
4. **Fullscreen editor**: Buttons call `window.gvpOpenFullscreen`. On save, `UIModalManager.saveFullscreen()` delegates to `UIFormManager.handleFullscreenSave`, mirroring edits back to current array/textarea and notifying observers @UIFormManager.js#465-494. The fullscreen editor provides a large textarea for editing long content with word count display.
5. **Generate JSON flow**: `handleGenerateJson` (not shown above) collects prompt data, optionally applies templates (`StateManager.applyTemplatesToPrompt`), stringifies JSON, assigns to automation queue via `ReactAutomation.sendToGenerator`.
6. **API updates**: `updateFromApiResponse` merges JSON from network (videoPrompt) and refreshes whichever view is active, preserving scroll/selection state @UIFormManager.js#410-433.

**Raw Tab** (`UIRawInputManager`):

**Screenshot**: `A:\Tools n Programs\SD-GrokScripts\RawPrompt+SavedPromtps.png`

1. **Raw textarea**: `updateRawPreview` runs input through `AdvancedRawInputManager.processRawInput` (quote wrapping, spicy parameter, template merge) and renders preview metadata @UIRawInputManager.js#413-458.
2. **Saved slots**: Async storage via `getSavedPrompts`, `saveSavedPrompt`, `loadSavedPrompt`, `clearSavedPrompt` with button-state updates and success feedback @UIRawInputManager.js#480-573.
3. **Template system**: Accordion lists template rules. `BatchLauncherManager` uses same constants. Editing prefix/suffix opens fullscreen (for dialogue, uses custom overlay). Templates persisted through `StateManager` @UIRawInputManager.js#598-742.
4. **Generate Raw**: Button collects textarea value, applies JSON templates (`StateManager.applyTemplatesToRawPrompt`), and sends via `ReactAutomation.sendToGenerator` with `isRaw=true` @UIRawInputManager.js#575-591.

**Generations Tab** (`UIGenerationsManager`):

1. **Add entry**: `addGenerationToList` builds card with thumbnail, status badge, progress bar, mode chip, moderation badge, cancel button @UIGenerationsManager.js#140-320.
2. **Updates**: `updateGenerationInList` adjusts status/progress/duration, highlights moderated runs, ensures metadata remains in sync @UIGenerationsManager.js#322-370.
3. **Stats**: `updateGenerationsStats` (not shown) recalculates counts from StateManager maps.
4. **Refresh/cancel**: Buttons call `refreshGenerationsList` and `multiVideoManager.cancelGeneration` @UIGenerationsManager.js#293-307.

**History Tab** (`UIHistoryManager`):

**Screenshots** ⚠️ **OUTDATED (v1.13.8 redesign - see CHANGELOG.md)**:
- History Tab Overview: `A:\Tools n Programs\SD-GrokScripts\HistoryTab.png`
- Image ID Item Detail: `A:\Tools n Programs\SD-GrokScripts\HistoryImageIDItem.png`

**Current Implementation (v1.13.8+)**:
- Compact horizontal closed cards (~60px height)
- Emoji buttons for actions (📋 Copy, 📝 Apply, 🔄 Retry, 🗑️ Delete, 📹 Last Video)
- Colored progress bars per attempt
- Sort options: Default, Recently updated, Recent successes, Most attempts, Oldest active
- Toast confirmation system (replaces `window.confirm()`)
- Expandable attempts with inline button layout
- Per-account isolation with StateManager fallback

**Legacy Documentation**:
1. **Render timeline**: `renderHistory` populates meta text, toggles fetch button. Each entry includes timestamp, model, mode, moderation indicator, video link, JSON preview, apply-to-editor (calls `UIManager.applyPromptFromHistory`), copy JSON @UIHistoryManager.js#101-228.
2. **Fetch latest**: Handler injected by UIManager to tie into NetworkInterceptor/ImageProjectManager fetch routines.

**Settings Tab** (`UISettingsManager`):

**Screenshots**:
- Settings Part 1: `A:\Tools n Programs\SD-GrokScripts\Settingspt1.png`
- Settings Part 2: `A:\Tools n Programs\SD-GrokScripts\Settingspt2.png`

1. **Core toggles**: Wrap in quotes, silent/voice-only (updates audio defaults + voice indicator), Aurora auto-injection (enable, aspect ratio, blank PNG base64), auto-detect, force edit intent @UISettingsManager.js#83-353.
2. **Cache controls**: Clear Aurora cache button calls `NetworkInterceptor.auroraManager.clearCache`.

**Bottom Bar** (`UIManager._createBottomBar`):

**Screenshot**: View JSON Modal - `A:\Tools n Programs\SD-GrokScripts\ViewFinalJSON.png`

- **View Current JSON** → `UIModalManager.showViewJsonModal`
- **Generate JSON** → `UIFormManager.handleGenerateJson`
- **Generate Raw** → `UIRawInputManager.handleGenerateRaw`
- **Spicy Mode** toggle → `UIManager.toggleSpicyMode` → State flag flip + `UIStatusManager.updateModeIndicator` + `notifySpicyState` broadcast + payload rewrite (NetworkInterceptor/Page interceptor).

### 4.3 Header Badges & Progress

`UIStatusManager.updateGenerationStatus` handles state transitions:

- `generating` → progress bar active, hides moderation messages.
- `moderated` → badge + moderation reason + progress colour swap (and triggers AutomaticRetryManager).
- `retrying` → retry counter visible (sync with AutomaticRetryManager data).
- `completed`/`failed` → progress to 100%, auto-reset to idle after timeout.

Progress updates originate from NetworkInterceptor stream parsing (`_processStream` in both content/page interceptors) and call `UIManager.updateProgressBar` → `UIStatusManager.updateProgressBar` @UIStatusManager.js#175-179.

### 4.4 Voice-only / Silent Mode

- Setting toggled in Settings panel (`gvp-silent-mode-checkbox`) updates `state.settings.silentMode`, applies audio defaults (`StateManager.applySilentModeAudioDefaults`), syncs UI text areas, and updates header microphone indicator via `UIManager.updateVoiceOnlyIndicator` @UISettingsManager.js#101-137.

---

## 5. Template & Prompt Transformation Systems

### 5.1 Structured JSON Templates

Managed entirely by `StateManager`:

- Templates stored in `state.settings.rawTemplates`, each with `{ id, fieldPath, prefix, suffix, enabled, prefixOnly, dialogueTemplate }` @StateManager.js#585-617.
- Applied to JSON data before generation via `applyTemplatesToPrompt` (handles interpolation of scalars/arrays/dialogue, with `_resolveTemplatePath`, `_applyTemplateRule`) @StateManager.js#430-551.
- Dialogue templates normalised/cloned to avoid mutation of UI state @StateManager.js#623-718.

### 5.2 Raw Prompt Templates

`AdvancedRawInputManager.processRawInput` merges prefix/suffix around typed prompt, applies spicy mode token, generates preview metadata @AdvancedRawInputManager.js#57-174.

### 5.3 Spicy Mode Pipeline

1. **UI Toggle** → `UIManager.toggleSpicyMode` flips `state.generation.useSpicy`, updates UI badges/buttons, broadcasts state.
2. **Automation** → `ReactAutomation.sendToGenerator` logs spicy state and preserves prompt; actual `--mode=` rewrites executed downstream.
3. **Network Layer** →
   - Content interceptor ensures payload contains desired mode before sending @NetworkInterceptor.js (within `_enhancedFetchInterceptor`).
   - Page interceptor rewrites message string if content wrapper is bypassed @public/injected/gvpFetchInterceptor.js#62-104.

### 5.3.1 🆕 Native Spicy Button Detection (v1.14.0+)

**Problem**: Grok's native "Spicy" mode button is hidden in a dropdown menu that doesn't exist in DOM until clicked.

**Solution**: Extension automatically opens the "Video Presets" dropdown, finds "Spicy" option, and clicks it when spicy mode is enabled.

**Implementation** @UIManager.js#875-927:

1. **Toggle Detection** → When user enables spicy mode and navigates to `/imagine/post/` page, `toggleSpicyMode` triggers detection after 100ms
2. **Menu Opening** → `_detectNativeSpicyButton()` finds trigger button with:
   - `aria-label="Video Presets"` OR
   - Contains film icon SVG (`svg.lucide-film`) + chevron icon (`svg.lucide-chevron-down`)
3. **Animation Wait** → Clicks trigger, waits 300ms for Radix UI menu animation
4. **Button Search** → Queries `[role="menuitem"][data-orientation="vertical"]` and finds item with `textContent.trim() === 'Spicy'`
5. **Activation** → Clicks native button, sets `state.generation.useNativeSpicy = true`, shows toast notification
6. **Duplicate guard** → When called from gallery automation we pass `{ autoClick: true }`, and the returned `{ autoClicked: true }` short-circuits any additional `element.click()` attempts so only one Grok request fires per tap.
6. **Tag Injection** → NetworkInterceptor still injects `--mode=extremely-spicy-or-crazy` tag for prompt upsampling compatibility

**Gallery Integration** @UIManager.js#1045-1081:
- **MutationObserver** watches for URL changes to `/imagine/post/`
- **Image Click Handler** detects clicks on image cards in gallery
- **Quick Mode Check** → If spicy + (Quick JSON or Quick Raw) enabled:
  1. Opens menu and clicks spicy button
  2. Waits 500ms for menu to close
  3. Triggers JSON or Raw generation automatically
- **Timing**: ~800ms total (300ms menu + 500ms generation delay)

**Logging**:
```
[GVP Spicy] 🎬 Opening video preset menu...
[GVP Spicy] ✅ Native spicy button detected after menu open
[GVP Gallery] 🔗 Navigated to image post
[GVP Gallery] Quick JSON mode active - auto-triggering
[GVP Gallery] 🌶️ Clicked native spicy button
```

**Edge Cases**:
- Menu already open → Detects without re-clicking
- Trigger button not found → Falls back to tag injection only
- Not on image page → Skips detection to avoid unnecessary menu opening

### 5.3.2 🆕 Upload Prompt Injection (v1.14.1+)

**Feature**: Queue current JSON or Raw prompt for automatic injection on next image upload—no manual "Make video" click or regeneration needed.

**UI Component** @UIManager.js#643-655:
- **Button**: "📤 Queue Upload" in bottom bar (top row, after Quick toggles)
- **Active State**: Shows "✅ Queued" when prompt is queued
- **Reset**: Automatically returns to "📤 Queue Upload" after injection

**Workflow** @UIManager.js#1114-1144:

1. **User Clicks Queue** → `_queueUploadPrompt()` shows confirm toast: "Queue prompt from JSON or Raw tab?"
2. **User Chooses**:
   - **JSON** → Stringifies `state.promptData`, stores in `state.generation.uploadPrompt`
   - **Raw** → Takes `state.rawInput.value`, validates not empty, stores in `state.generation.uploadPrompt`
3. **Visual Feedback** → Button changes to "✅ Queued", success toast appears
4. **Upload Detection** @NetworkInterceptor.js#1959-1975 → When `/conversations/new` request contains `fileAttachments`:
   - Checks for `state.generation.uploadPrompt`
   - Appends prompt to `body.message` (newline-separated if message exists)
   - Clears `state.generation.uploadPrompt = null`
   - Calls `UIManager._updateQueueUploadButtonState(false)` to reset button
5. **Video Generates** → Prompt included in first generation request, no regeneration needed

**Example Payload** (before injection):
```json
{
  "message": "https://assets.grok.com/.../image.png",
  "fileAttachments": ["abc-123-def"],
  "toolOverrides": {"videoGen": true}
}
```

**Example Payload** (after injection):
```json
{
  "message": "https://assets.grok.com/.../image.png\n\n{\"shot\":{\"motion_level\":\"high\",...}}",
  "fileAttachments": ["abc-123-def"],
  "toolOverrides": {"videoGen": true}
}
```

**State Management**:
- `state.generation.uploadPrompt` → String (JSON stringified or raw text)
- Set by: `UIManager._queueUploadPrompt()`
- Cleared by: `NetworkInterceptor` after injection
- Persists until used or extension reload

**Benefits**:
- ✅ No need to regenerate after upload
- ✅ Works with both JSON and Raw prompts
- ✅ Visual feedback shows queued state
- ✅ Automatically clears after use

### 5.4 Dialogue Template Panel

**Screenshots**:
- Template Creator: `A:\Tools n Programs\SD-GrokScripts\TemplateCreator.png`
- Dialogue Template Editor: `A:\Tools n Programs\SD-GrokScripts\TemplateEditorDialogue.png`

`UIHelpers.createDialogueTemplatePanel` renders overlay for advanced dialogue configurations (characters, timing, accents, subtitles toggles). Invoked from `UIRawInputManager` when template target is `dialogue[]` @UIHelpers.js#191-400, @UIRawInputManager.js#739-799.

---

## 6. Generation Lifecycle (Click A → Result B)

1. **User action**: Generate JSON (`UIFormManager.handleGenerateJson`) or Generate Raw (`UIRawInputManager.handleGenerateRaw`). Both update `state.generation.lastPrompt`.
2. **Automation**: `ReactAutomation.sendToGenerator`
   - Finds textarea/button, applies prompt, triggers React events, clicks submit @ReactAutomation.js#67-190.
   - Generates `generationId`, registers with `StateManager.registerGeneration`, toggles `UIStatusManager.updateGenerationStatus('generating')` @ReactAutomation.js#158-184.
3. **Network**: `NetworkInterceptor` intercepts request/response.
   - Request: rewrites message with spicy mode / Aurora assets.
   - Response: parses streaming payload, updates progress, moderation state, finalises generation, extracts `videoPrompt` @NetworkInterceptor.js#58-400 & `UIManager.updatePromptFromVideoPrompt` (delegates to StateManager + UI refresh).
4. **Retry**: If moderated, `AutomaticRetryManager.handleModeratedGeneration` orchestrates retries/fallback @AutomaticRetryManager.js#18-312.
5. **Completion**: `StateManager.completeGeneration` archives to `completedGenerations`, UIStatusManager transitions to `completed`, UIHistoryManager registers prompt entry (via ImageProjectManager + NetworkInterceptor gallery ingestion).

---

## 7. Persistence, Storage Keys & Cleanup

- **Settings**: `gvp-settings` (Chrome local storage). Accessed by content, background, options.
- **Recent Prompts**: `gvp-recent-prompts`, `gvp_recent_prompts` (legacy), saved prompt slots `gvp-saved-prompts` (JSON stringified).
- **Custom Dropdowns**: `gvp-custom-dropdown-values`.
- **Image Projects**: `gvp-image-projects` (Map serialised as array), `gvp-active-account`.
- **Generations**: `gvp_active_generations`, `gvp_completed_generations`, `gvp_generation_stats`, `gvp_last_sync` handled via StorageManager.
- **Batch Planner Cache**: `gvp-batch-gallery-cache` (within BatchLauncherManager).

Use StorageManager/StateManager helpers for wipe operations (`StorageManager.clearAll`, `ImageProjectManager.saveProjectData`, etc.).

---

## 8. Backups, Historical Artifacts & Reference Docs

| Artifact | Location | Notes |
| --- | --- | --- |
| Legacy monolithic UI | `src/content/managers/UIManagerbackup.js` | 2,641-line pre-modular UI. Reference when reconciling HTML entity issues (179 encoded entities remain across UI modules—regenerate rather than hand-fix). |
| Generations Manager Phase 1 backup | `src/content/managers/ui/UIGenerationsManager.phase1.backup.js` | Earlier implementation for reference. |
| Enhanced Generations Manager prototype | `src/content/managers/ui/UIGenerationsManager.enhanced.js` | Experimental variant not wired into current UI.
| Extraction instructions | `extension docs/GEMINI_UI_EXTRACTION_INSTRUCTIONS.md`, `extension docs/UI_EXTRACTION_QUICK_REFERENCE.md` | Path-normalised guides for MCP extraction of UI modules. |
| Handover dossiers | `HANDOVER_COMPLETE_CONTEXT.md`, `QUICK_START_NEXT_SESSION.md` | Mandatory reading before new work session. |
| External planning docs | `extension docs/` contains technical specs (note outdated SSE references—see memory summary). |

---

## 9. Mandatory Operating Rules & Pitfalls

1. **Version Synchronisation (No exceptions)**: Update all four locations + changelog + UI header when shipping changes (see memory `6a8613fa…` and `version.md`).
2. **UI Tightening Rules**: Respect spacing, alignment, zero-scroll, dead-space removal per `ui-rules.md`.
3. **Shadow DOM Boundaries**: Do not query across roots; use `UIManager` delegation methods.
4. **Spicy State Pipeline**: Always flip state via `UIManager.toggleSpicyMode`; payload rewrite handled downstream—do not duplicate logic.
5. **Storage Context Validation**: Guard Chrome storage writes with `chrome.runtime && chrome.runtime.id` (see AdvancedRawInputManager autosave fix @AdvancedRawInputManager.js#188-269).
6. **HTML Entity Debt**: Many UI modules still contain encoded characters (`&gt;`, `&lt;`, etc.). Preferred remediation: regenerate from `UIManagerbackup.js` rather than manual spot fixes.
7. **Testing before claiming completion**: Follow 10-point checklist in memory `929537eb…` (read entire request, verify integration, update versions, avoid inline style conflicts, etc.).

---

## 10. Verification Checklist

Run these after significant changes:

1. Drawer auto-opens on grok.com; launcher toggles correctly.
2. Header badges update through idle → generating → completed/failure states; retry counter/mode indicator behave as expected.
3. JSON Tab: open every category, edit scalars/arrays, save+fullscreen, ensure state sync + templates applied.
4. Raw Tab: preview updates live, saved slots (save/load/clear) persist, template edits reflect in preview.
5. Spicy toggle: updates button + header, `--mode=` rewrite visible in DevTools network request, toggles revert correctly.
6. Generation run: progress bar increments, completion injects videoPrompt JSON into editor via `UIManager.updatePromptFromVideoPrompt`.
7. History tab: entries appear with metadata; Apply to Editor refreshes JSON tab; Fetch Latest triggers network ingestion.
8. Settings: Silent mode toggles audio fields + header indicator; Aurora config persists; aspect ratio buttons highlight correctly.
9. Popup: Works on grok.com tab, handles missing content script gracefully.
10. Storage: `chrome.storage` entries update (`gvp-settings`, `gvp-active-account`, generation maps). No context invalidation errors in console.

---

## 11. Glossary & Quick Facts

| Term | Meaning |
| --- | --- |
| **Spicy Mode** | Aggressive prompt mode flagged via `state.generation.useSpicy`; ensures `/new` payload ends with `--mode=extremely-spicy-or-crazy`. |
| **Silent Mode / Voice-only** | `settings.silentMode` forces audio fields to “none” + updates UI indicator. |
| **Aurora Auto-Injector** | Automatically uploads blank PNGs for image-to-video flows; configured in settings. |
| **Video Prompt** | JSON string returned at progress=100; parsed by `StateManager.updatePromptDataFromVideoPrompt`. |
| **Generation Maps** | Active/completed generation `Map`s stored under `state.multiGeneration`; persisted by `StorageManager`. |
| **Dialogue Template Panel** | Overlay for editing dialogue template lines (characters, timing, language, emotion). |
| **Batch Planner** | Future-facing module for scheduling multiple replays from gallery/history data (currently not wired into UI tabs). |

Keep this document synchronised with code changes. Whenever a module gains new responsibilities, append or revise the corresponding section and annotate the changelog.
\n\n` for readability in textareas.
- `toStorage(text)`: collapses double newlines and extra spaces for persistence.
- `hasFormatting(text)`: quick check for display formatting. @grok-video-prompter-extension/src/content/utils/SentenceFormatter.js#1-19

#### `src/content/utils/ArrayFieldManager.js`
Central engine for dynamic arrays (objects, positioning, dialogue, tags). Key features:
- `createArrayField`: builds container + items, handles dialogue-specific configuration with nested accordions. @grok-video-prompter-extension/src/content/utils/ArrayFieldManager.js#5-84
- `createArrayItem`: creates textarea/input with fullscreen/save/remove controls, wired to `UIFormManager.saveArrayField`. @grok-video-prompter-extension/src/content/utils/ArrayFieldManager.js#103-208
- Dialogue helpers (`_createDialogueAccordionItem`, `createDialogueItem`) build dense grid per handover: characters, timings, languages, emotions, type, accent, content, subtitles, actions. @grok-video-prompter-extension/src/content/utils/ArrayFieldManager.js#211-400+
- `getArrayValues`, `_updateArrayItemIndexes` keep `state.promptData` in sync and update display labels.
- Normalizes and collects dialogue fields, including maximum duration logic and template integration options.

#### `src/content/managers/ui/uiConstants.js`
Defines constant arrays and enumerations used across UI modules: tab names, category names, status strings, raw template field metadata (feeds advanced template UI). @grok-video-prompter-extension/src/content/managers/ui/uiConstants.js#1-41

#### `src/content/managers/ui/UIHelpers.js`
Shared UI utilities:
- Formatting helpers (time differences, badge HTML).
- `createAccordionSection` for templated collapsible sections (used extensively in raw/template dialogs). @grok-video-prompter-extension/src/content/managers/ui/UIHelpers.js#4-189
- `createDialogueTemplatePanel` constructs the detachable dialogue template editor overlay (dense grid, minimal spacing, reused by template system). @grok-video-prompter-extension/src/content/managers/ui/UIHelpers.js#191-400+

### 3.2 State & Persistence

#### `src/content/managers/StorageManager.js`
Responsible for persistence across sessions:
- Keys for active/completed generations, stats, last sync.
- `initialize()` loads existing data; handles logging counts. @grok-video-prompter-extension/src/content/managers/StorageManager.js#20-41
- `saveActiveGeneration`, `updateActiveGeneration`, `completeGeneration` maintain generation lifecycle with persistence, trimming completed history to 100 entries via `_trimCompletedHistory`. @grok-video-prompter-extension/src/content/managers/StorageManager.js#44-292
- `clearAll()` utility for debug reset.

#### `src/content/managers/StateManager.js`
The brain:
- Initial state includes UI flags, prompt data structure, generation tracking, settings, templates, image projects. @grok-video-prompter-extension/src/content/managers/StateManager.js#11-85
- Settings load/save through Chrome storage with silent-mode defaults, template normalization. @grok-video-prompter-extension/src/content/managers/StateManager.js#110-149, #585-617
- `updatePromptDataFromVideoPrompt` handles stringified JSON from API, including double-stringify unwrapping, JSON repair, and raw fallback storage. @grok-video-prompter-extension/src/content/managers/StateManager.js#204-273
- Template utilities (`applyTemplatesToPrompt`, `applyTemplatesToRawPrompt`, `_resolveTemplatePath`) allow prefix/suffix/insertion for both structured and raw prompts. #430-551
- Dialogue normalization, timestamp formatting, template ID generation, etc. #623-718
- Generation management (`registerGeneration`, `updateGeneration`, `completeGeneration`) syncs with `StorageManager` and `MultiVideoManager`. #733-839
- Storage restoration (`initializeStorage`) handles context bridging to `StorageManager`. #842-868
- Search helpers (`findGenerationByImageId`, `findGenerationByVideoId`), clearing completed, etc.

### 3.3 Automation & Networking

#### `src/content/managers/ReactAutomation.js`
Implements React-friendly front-end automation (codemap “Constructor Fix”):
- Constructor stores `stateManager` then closes properly (fix to avoid methods embedded in constructor). @grok-video-prompter-extension/src/content/managers/ReactAutomation.js#5-18
- `waitForElement` with MutationObserver fallback. #19-64
- `sendToGenerator`: core workflow
  1. Find textarea using selectors; fallback search.
  2. Use native setter + React events to insert prompt. #67-125
  3. Find Make Video button; fallback text search. #129-152
  4. React-compatible click. #192-204
  5. Register generation ID, update state, UI status, progress bar.
  6. Logs and handles errors (alerts user). #158-189
- Mode awareness: logs spicy state, ensures prompt contains correct `--mode` when `state.generation.useSpicy` is true.

#### `src/content/managers/AutomaticRetryManager.js`
Ensures moderated prompts retry automatically:
- Checks settings (`autoRetryOnModeration`, `maxModerationRetries`) and updates UI with retry counters. @grok-video-prompter-extension/src/content/managers/AutomaticRetryManager.js#18-67, #127-141
- Exponential backoff with multiplier, max delay 30s. #118-123
- Progressive enhancement: for JSON prompts, injects safety hints, toned-down descriptors on later attempts. #131-247
- Fallback to normal mode after max retries if configured. #280-312
- Marks generations failed with reason codes; updates storage and UI. #319-334

#### `src/content/managers/AuroraManager.js`
Automates blank PNG uploads for image-to-video flows:
- Caches per-aspect ratio file IDs using Chrome storage with expiration.
- Uploads base64 from settings with retries.
- Detects aspect ratio from prompt or settings, enforces edit intent by prepending text when necessary. @grok-video-prompter-extension/src/content/managers/AuroraManager.js#1-226

#### `src/content/managers/MultiVideoManager.js`
Handles simultaneous prompt submissions:
- Works in batches respecting `maxConcurrent` (default 3). #19-37
- Registers each generation, updates UI status, handles queue when active count < max.
- `monitorActiveGenerations` detects stuck/timeouts, triggers retries/failures. #152-264
- Provides cancellation, statistics, and queue control. #267-378

#### `src/content/managers/NetworkInterceptor.js`
Content-script `fetch` override (mirrored by injected interceptor):
- Installation guard prevents double-wrap. @grok-video-prompter-extension/src/content/managers/NetworkInterceptor.js#39-56
- On `/rest/app-chat/conversations/new` POST:
  - Logs, clones Request/Response, rewrites payload via `_enhancedFetchInterceptor` (not shown but part of class), extracts videoPrompt at `progress === 100`. #58-160, #425-493
  - Calls `window.gvpUIManager.updatePromptFromVideoPrompt()` (fix per memory) to refresh UI.
- Gallery ingestion for history tab: decompresses gzip, JSON parse, passes posts to `UIHistoryManager`. #58-152
- Tracks common headers for Aurora uploads; integrates with `AutomaticRetryManager` and `ImageProjectManager`.

### 3.4 UI Managers & Helpers

#### `src/content/managers/UIManager.js`
Shadow DOM orchestrator:
- Constructor receives state/automation/managers; stores references to all UI sub-managers. @grok-video-prompter-extension/src/content/managers/UIManager.js#1-100
- `_initializeSubManagers`: instantiates UIStatusManager, UITabManager, UIModalManager, UISettingsManager, UIHistoryManager, UIGenerationsManager, UIRawInputManager, UIFormManager. Sets back-references (e.g., history fetch handler). #37-72
- `createUI`: creates shadow host, backdrop, shell with drawer + launcher, modals, etc. #74-99
- `_createHeader`: builds left status (spicy indicator, 🎬 button, voice indicator), centered title (version string), right controls (⚙ settings, − minimize). #189-261
- `_createTabContent`: leverages sub-managers to render JSON, Raw, Generations, History, Settings tabs. #140-163
- `_createBottomBar`: view JSON modal button, generate JSON/Raw buttons, spicy toggle. #264-308
- Drawer control (`toggleDrawer`, `openDrawer`, `closeDrawer`) ensures shell/backdrop/bottom bar stay in sync.
- `toggleSpicyMode`: flips state, updates indicators/buttons, broadcasts to page. #340-366
- Delegation methods (switchTab, expandCategory, applyPromptFromHistory, updateProgressBar, etc.) call into sub-managers.

#### `src/content/managers/ui/UITabManager.js`
- Builds tab buttons (`JSON`, `Raw`, `Generations`, `History`, `Settings`). @grok-video-prompter-extension/src/content/managers/ui/UITabManager.js#1-113
- Handles tab switching: toggles `active` classes, hides/shows content. Maintains reference to `UIManager` for delegation.

#### `src/content/managers/ui/UIFormManager.js`
JSON Editor controller:
- Loads custom dropdown values from storage, saves on change. @grok-video-prompter-extension/src/content/managers/ui/UIFormManager.js#18-36, #198-289
- Creates category grid and sub-array view; `expandCategory` renders form groups with ArrayFieldManager for arrays, textareas for scalar fields. #38-195
- Fullscreen buttons map to `window.gvpOpenFullscreen` and keep state synchronized (callbacks to `saveField`, `saveArrayField`).
- `handleGenerateJson`: collects data, serializes JSON, optionally applies templates, sends to generator.
- `updateFromApiResponse` merges API updates into state and refreshes current view (fix from Batch 2). (Later lines beyond 400, but part of file.)

#### `src/content/managers/ui/UIRawInputManager.js`
Raw tab UI:
- Accordion stack: raw input, saved prompt slots (3, from constants), template system, recent prompts. #20-98
- Uses `AdvancedRawInputManager` for template merging, preview, saved slots with async storage (includes `.catch` on listeners). #342-400+
- Template system renders prefix/suffix editor for each field (leverages UIHelpers accordion). Buttons allow adding, editing, enabling, removing template rules.

#### `src/content/managers/ui/UIStatusManager.js`
- `createStatusDisplay` returns container inserted into header left area (per UI tightening fix). @grok-video-prompter-extension/src/content/managers/ui/UIStatusManager.js#10-53
- `updateGenerationStatus` updates badge text/icons, triggers header 🎬 button state, handles Retry/Moderation display, updates progress bar (requires `progressBar` reference from DOM). #55-125
- `updateModeIndicator`: toggles between “🎬 Normal” and “🌶️ Spicy”. #160-172
- `updateSpicyModeButton` toggles `.active` on header spicy button if present. #182-191

#### `src/content/managers/ui/UIModalManager.js`
Controls fullscreen editor, JSON modal, prompt history modal:

**Screenshots**:
- Fullscreen Textarea Editor: `A:\Tools n Programs\SD-GrokScripts\Fullscreentextarea.png`
- View JSON Modal: `A:\Tools n Programs\SD-GrokScripts\ViewFinalJSON.png`

- `_createFullscreenModal`: single "← Go Back (Save)" button centered; word count updates via `updateWordCount`. No minimize/X (per Phase 1/2 fix). Used primarily in JSON tab for editing long textarea fields. @grok-video-prompter-extension/src/content/managers/ui/UIModalManager.js#11-50
- `_createPromptHistoryModal`: renders timeline list with apply/copy actions. #53-97
- `_createViewJsonModal`: read-only JSON view with copy/export buttons. #99-142
- `showViewJsonModal`, `hideViewJsonModal`, `showPromptHistoryModal`, etc. manage visibility and populate data using `stateManager` templates. #144-245
- `copyJsonToClipboard`, `exportJson`, `_populateJsonTextarea`, `_stringifyTemplatedPrompt` tie into template application pipeline. #295-349

#### `src/content/managers/ui/UIGenerationsManager.js`
(Not fully shown, but responsibilities include rendering queue, stats, progress, cancel actions. Consult file for details.)

#### `src/content/managers/ui/UIHistoryManager.js`
- Builds prompt history tab with toolbar (meta info, fetch latest, reload). #23-99
- `renderHistory` updates meta text, enables fetch button, populates timeline with entries (cards). #101-139
- `_renderEntry` builds card showing timestamp, model, mode, moderation badge, video link, pretty-printed JSON, apply/copy buttons. #142-227
- Copy helpers, timeline updates; integrates with `ImageProjectManager` and `NetworkInterceptor` data. #230-270

#### `src/content/managers/ui/UISettingsManager.js`
(Not fully included above, but manages settings UI toggles: auto retry, spicy default, silent mode/voice indicator, Aurora config, debug mode, etc. Check file for handling of each setting and saving via `StateManager`.)

### 3.5 Entry, Background, Popup, Injected

#### `src/content/content.js`
- Storage helper inline (legacy compatibility) but real logic uses `StateManager`.
- Constructor disables legacy bridge, logs boot, sets global references (e.g., `window.gvpUIManager`). #35-99
- `initialize()` orchestrates state init, UI creation, interceptor start, automation start, monitor start, image project init, and logs version. #101-179
- `_setupToolbarIconListener` handles `openGVPUI` and `toggleDrawer` messages from popup/background. #185-210
- Spicy state broadcast functions `_postStateToPage`, `_broadcastSpicyState`, `notifySpicyState`. #242-275
- Global `window.gvpOpenFullscreen` for Textareas -> fullscreen modal. #278-317

#### `src/background/background.js`
- On install: sets default `gvp-settings` (mode, auto retry, retries, sound, debug). #2-18
- `onMessage`: returns settings for popup or others. #21-28
- `chrome.action.onClicked`: toggles drawer or opens UI (with fallback) by messaging content script. #30-54

#### `src/popup/popup.js`
(Not shown here, but ensures active tab exists, handles `chrome.runtime.lastError`, displays errors if content script missing, per memory fix.)

#### `public/injected/gvpFetchInterceptor.js`
Page-level fallback when CSP blocks content-script override:
- Guards against double installation, stores native fetch.
- Maintains `useSpicyMode` toggled via `postMessage` from content script. #45-52
- `modifyRequestPayload` rewrites message `--mode=` tokens based on spicy state. #62-98
- `processResponseBody` splits SSE/JSON lines, emits progress events, sends final videoPrompt to extension. #106-166
- Handles gallery data, posts logs for debugging. #290-326

---

## 4. Template Systems & Prompt Transformations

### 4.1 JSON Template Engine (StateManager)
- Templates stored in `state.settings.rawTemplates` (array of rules). Each rule: `fieldPath`, `prefix`, `suffix`, `enabled`, `prefixOnly`, optional dialogue structure.
- `applyTemplatesToPrompt(promptData)`: deep clones data, navigates to fields, prepends/appends prefixes/suffixes. Arrays insert at start/end unless `prefixOnly` (replaces contents). Dialogue-specific handling clones structured lines. @grok-video-prompter-extension/src/content/managers/StateManager.js#430-551
- `_resolveTemplatePath`, `_applyTemplateRule` handle dot-notation paths (`dialogue[]`, `visual_details.objects[]`).

### 4.2 Raw Template Engine (AdvancedRawInputManager)
- Template map includes name/category/prompt/tags; merging occurs in `processRawInput` when user selects template (smart check for “scene/shot” to determine prefix vs suffix). @grok-video-prompter-extension/src/content/managers/AdvancedRawInputManager.js#21-137
- Quote wrapping and spicy mode injection happen before template merge when toggled.
- Preview metadata includes word count, presence of `--mode`, suggestions if missing.

### 4.3 UI Template Panels
- `UIRawInputManager` renders template list with “Add Rule” button → opens panel built via `UIHelpers.createAccordionSection` for rule editing.
- Each rule row includes prefix-only toggle, prefix/suffix fullscreen editors, dropdown for field path (populated by `uiConstants.RAW_TEMPLATE_FIELDS`), enable checkbox, remove button. @grok-video-prompter-extension/src/content/managers/ui/UIRawInputManager.js#215-400+
- Dialogue template panel uses `UIHelpers.createDialogueTemplatePanel` overlay for tight editing, aligning with dialogue handover (grid arrangement, subtitles toggle in same row as remove). @grok-video-prompter-extension/src/content/managers/ui/UIHelpers.js#191-400+

### 4.4 Custom Dropdown Values
- `UIFormManager` supports converting select to custom input; value saved to both prompt data and `gvp-custom-dropdown-values` storage key so dropdown rehydrates on next load. @grok-video-prompter-extension/src/content/managers/ui/UIFormManager.js#198-289

---

## 5. UI Blueprint & Feature Matrix

| Area | Features | Files |
| --- | --- | --- |
| Launcher & Shell | `#gvp-shell` keeps launcher attached to drawer seam; gradients match navy/amber palette; zero-floating per launcher handover. | `stylesheet.js`, `UIManager._createLauncher()` |
| Header | Status badges (🎬, 🌶️, 🎙️), compact 32×32 emoji buttons (🌶, 🎬, ⚙️, −). Version title centered. | `UIManager._createHeader`, `UIStatusManager`, `stylesheet.js` |
| Tabs | JSON, Raw, Generations, History, Settings; tab switching handled by UITabManager. | `UITabManager.js`, `UIManager._createTabContent` |
| JSON Tab | Category grid, sub-array view, fullscreen editors, save buttons, template-aware view. | `UIFormManager.js`, `ArrayFieldManager.js` |
| Raw Tab | Raw textarea with preview, saved slots (3), template system with accordion, recent prompts. | `UIRawInputManager.js`, `AdvancedRawInputManager.js` |
| Generations Tab | (See `UIGenerationsManager` for list/queue, status display). |
| History Tab | Timeline of prompts per image, apply/copy actions, fetch latest button hooking into `ImageProjectManager`. | `UIHistoryManager.js` |
| Settings Tab | Toggles for auto retry, spicy default, silent mode (voice-only), Aurora options, debug controls. | `UISettingsManager.js` |
| Bottom Bar | View JSON modal, Generate JSON/Raw, Spicy toggle. Always floats above taskbar (CSS `bottom: 28px`). | `UIManager._createBottomBar`, `stylesheet.js` |
| Modals | Fullscreen editor (single save button), JSON view modal, prompt history modal. | `UIModalManager.js` |
| Status & Progress | Header badge row, progress bar (`#gvp-progress-section`), retry counter, moderation reason display. | `UIStatusManager.js`, `stylesheet.js` |

UI tightening rules (from handovers) enforced via CSS and layout: ≤8px gaps, aligned buttons, zero scroll unless justified, merge narrow controls into rows. Voices from dialogues panel (subtitles toggle plus remove button on same row) implemented via `UIHelpers` dialogue template grid.

---

## 6. Generation Lifecycle (Click A → Result B)

1. **User edits prompt** (JSON tab, raw tab, or template adjustments). State is updated immediately on input (FormManager, RawManager) and persisted when saved.
2. **Generate action** (JSON or Raw button):
   - JSON: `UIFormManager.handleGenerateJson()` serializes structured data, may apply templates, stringifies, passes to `ReactAutomation`. (See file for final steps — ensures `state.promptData` is up to date).
   - Raw: `UIRawInputManager.handleGenerateRaw()` uses `AdvancedRawInputManager.processRawInput` to apply quote wrapping, spicy, templates. 
3. **ReactAutomation** sets textarea value using native setter, triggers React events, scrolls into view, waits briefly, finds Make Video button, clicks it with React-safe events.
4. **StateManager.registerGeneration** stores metadata (prompt, mode, imageId if available) and persists via StorageManager.
5. **UIStatusManager.updateGenerationStatus('generating')** sets header badge and progress bar.
6. **Network interception**:
   - Request: spicy mode rewriting ensures message ends with `--mode=extremely-spicy-or-crazy` or `--mode=normal` (custom). Aurora injection adds blank PNG file ID when appropriate.
   - Response: progress events update progress bar and badges. At `progress === 100`, `videoPrompt` (stringified JSON) parsed via `StateManager.updatePromptDataFromVideoPrompt`. UI refreshed through `UIFormManager.refreshCurrentView` (fix from memory 211574...).
7. **Completion**: `StateManager.completeGeneration` moves data to completed map; UIStatusManager sets status to `completed` (then returns to `idle`). History tab receives new entry via `NetworkInterceptor` gallery/post processing.
8. **Moderation**: AutomaticRetryManager logs moderated status, triggers retry with exponential delay, updates retry counter. If max retries reached and fallback to normal mode enabled, toggles `useSpicy` false and resubmits.

---

## 7. Known Constraints, Pitfalls, and Mandatory Rules

1. **Version Synchronization:** Update manifest, popup badge, content log, UI header title, and CHANGELOG every release. (Memories emphatically state “NO EXCEPTIONS”).
2. **UI Spacing:** obey ≤8px vertical/time, ≤10px horizontal. No floating controls or extraneous white space.
3. **Avoid inline `display` toggles** that conflict with CSS (prior mistakes causing invisible buttons). Toggle CSS classes instead.
4. **Shadow DOM Boundaries:** Each manager works within same shadow root; don’t attempt to query across multiple roots. Use UIManager delegation functions (`updateGenerationButtonState`, `updateSpicyModeButton`) rather than manual lookups.
5. **HTML Entity Encoding Warning:** Many UI modules still contain `&gt;`, `&lt;`, etc. (179 matches per memory). If refactoring, regenerate modules cleanly rather than manual replacements.
6. **Storage Context Validation:** When using `chrome.storage`, guard against missing runtime id (extension context invalidated). AdvancedRawInputManager already does this; follow same pattern.
7. **Template Consistency:** Keep raw template UI and StateManager application logic aligned. When adding new fields, update `uiConstants.RAW_TEMPLATE_FIELDS` and ensure `applyTemplatesToPrompt` handles the new path.
8. **Testing before claiming success (memory 929537...):** follow 10-point checklist (read entire request, verify functionality, integrate methods, update versions, etc.).
9. **Read handover docs before work:** `LauncherDrawer_UI_Tightening_Handover.md`, `DialoguePanel_UI_Tightening_Handover.md`, `HANDOVER_COMPLETE_CONTEXT.md`, `QUICK_START_NEXT_SESSION.md`.

---

## 8. Backups & Historical Artifacts

| File | Description | When to reference |
| --- | --- | --- |
| `src/content/managers/UIManagerbackup.js` | 2,641-line monolithic UIManager before modularization. Contains raw HTML strings (with HTML entities). | When rewriting modules wholesale; use as canonical source. |
| `src/content/managers/ui/UIGenerationsManager.phase1.backup.js` | Early Phase 1 design. | Compare with current generation tab or to resurrect features. |
| `GEMINI_UI_EXTRACTION_INSTRUCTIONS.md`, `UI_EXTRACTION_QUICK_REFERENCE.md` | Guides for extracting modules via MCP with correct path formats. | For future automated extraction tasks. |

---

## 9. Testing & Verification Checklist

Use this list before concluding work:

1. Launch grok.com page, confirm drawer auto-opens (or toggles via icon/popup).
2. Check header: 🎬/🌶️/🎙️ indicators showing, spacing correct, title matches manifest version.
3. JSON Tab
   - Open categories, edit fields, use fullscreen editor, save, ensure state updates.
   - Add/remove array items, test dialogue accordion, confirm `save` writes to state.
   - Generate JSON button injects prompt and logs generation start.
4. Raw Tab
   - Type raw prompt, watch preview update and recent prompts appear.
   - Test saved slots (save/load/clear) without errors.
   - Add template rule and verify persistence.
   - Generate Raw button triggers automation.
5. Spicy toggle flips header/bottom button styling; generated prompt includes correct `--mode` in request network logs.
6. Observe progress bar and status badges during generation.
7. After completion, check JSON tab reflects videoPrompt data (shot/scene, etc.).
8. Consult History tab; entries appear with apply/copy actions.
9. Settings tab toggles persist (reload page to verify silent mode, etc.).
10. Popup toggles drawer without errors; background logs show success message.
11. If modifications touched network or automation, confirm moderation retry flow and Aurora injection still function in relevant scenarios.

---

## 10. Glossary

| Term | Meaning |
| --- | --- |
| **Spicy Mode** | Ultra-aggressive prompt mode toggled via 🌶️ button; rewrites prompt payload to `--mode=extremely-spicy-or-crazy` unless fallback resets to normal. |
| **Fullscreen Editor** | Modal for detailed text editing, ensures SentenceFormatter handles newlines. |
| **Template Rule** | Prefix/suffix injection per JSON field; applied to JSON serialization and raw prompt generation. |
| **Aurora** | Workflow to auto-upload blank PNGs as attachments for image-to-video prompts. |
| **Prompt History** | Timeline of captured prompts per image; fetched from `/rest/media/post/list` or stored `ImageProjectManager`. |
| **Active/Completed Generations** | Maps stored in StateManager/StorageManager for ongoing and finished prompts. |
| **HTML Entity Issue** | Legacy extraction produced `&gt;`, `&lt;` etc. in UI files; fix by regenerating from source to avoid manual errors. |
| **Context Invalidated** | Chrome storage errors when background context unloads; mitigate by checking `chrome.runtime && chrome.runtime.id` before access. |

---

## 12. Video Playlist System (NEW)

### 12.1 Overview

**Status**: ✅ IMPLEMENTED (v1.15.18-1.15.20)

Auto-playing video playlist system that builds playlists from multi-gen history or favorites page with intelligent auto-scroll.

**Core Files**:
- `UIPlaylistManager.js` @grok-video-prompter-extension/src/content/managers/ui/UIPlaylistManager.js#1-557 - Main playlist orchestrator
- `UIManager.js` (header button) @grok-video-prompter-extension/src/content/managers/UIManager.js#573-593 - Golden ▶ button integration
- `stylesheet.js` (player CSS) @grok-video-prompter-extension/src/content/constants/stylesheet.js#2361-2398 - Fullscreen player styling

### 12.2 Playlist Building

**Multi-Gen History Mode**:
- Scans `state.multiGenHistory.images` for successful attempts
- Filters videos with `attempt.status === 'success'` and `attempt.videoUrl`
- Respects current sorting mode (success-desc, updated-desc, etc.)
- Extracts: videoUrl, videoId, imageId, imageUrl, prompt, timestamp, assetId

**Method**: `buildPlaylist(sortMode)` @UIPlaylistManager.js#40-68

```javascript
const videos = [];
entries.forEach(entry => {
    const successfulAttempts = entry.attempts.filter(
        attempt => attempt.status === 'success' && attempt.videoUrl
    );
    // Build playlist items...
});
```

### 12.3 Favorites Auto-Scroll

**Status**: ✅ IMPLEMENTED (v1.15.20)

**Problem Solved**: Grok's favorites page uses lazy-loading - only ~8 videos initially visible. Manual scrolling required to load all videos.

**Solution**: Invisible auto-scroll that programmatically scrolls entire page to force all videos to render.

**Implementation**: `playFromFavorites()` + `_autoScrollPage()` @UIPlaylistManager.js#94-180

**Auto-Scroll Process**:
1. **Detect favorites page**: `window.location.pathname.includes('/imagine/favorites')`
2. **Aggressive scrolling**: Scroll down in chunks, wait for new videos to load
3. **Video detection**: Count `video[src*="generated_video.mp4"]` elements
4. **Completion**: Stop when no new videos found after multiple attempts
5. **Return to top**: `window.scrollTo(0, 0)` for clean UX
6. **Scrape videos**: Extract all video URLs and metadata

**Key Insights from Session**:
- **Window scroll required**: Favorites page scrolls `window`, not container
- **API calls triggered**: Manual scroll triggers `/rest/media/post/list` calls
- **Script scroll doesn't work**: Only user-initiated scrolling triggers lazy loading
- **Scroll position shows 0/0**: Container detection was failing initially

**Fixed in v1.15.20**:
```javascript
// Use window scroll instead of container
const container = window;
const scrollTop = window.scrollY;
const scrollHeight = document.documentElement.scrollHeight;
```

### 12.4 Network API Integration

**Status**: ✅ **IMPLEMENTED in v1.15.23**

The extension now fully integrates with Grok's `/rest/media/post/list` API to provide rich video metadata.

**API Response Structure** (from `list.json` reference file):
```json
{
  "posts": [
    {
      "id": "post-id",
      "userId": "user-id", 
      "createTime": "2025-10-23T17:23:57.022884Z",
      "prompt": "Full original prompt text",
      "mediaType": "MEDIA_POST_TYPE_IMAGE",
      "mediaUrl": "image-url",
      "childPosts": [
        {
          "id": "video-id",
          "mediaType": "MEDIA_POST_TYPE_VIDEO",
          "mediaUrl": "https://assets.grok.com/.../generated_video.mp4",
          "originalPrompt": "Video motion description",
          "mode": "normal|custom|extremely-spicy-or-crazy",
          "resolution": {"width": 464, "height": 688},
          "modelName": "imagine_xdit_1",
          "createTime": "2025-10-23T17:36:41.286229Z"
        }
      ],
      "userInteractionStatus": {"likeStatus": true},
      "thumbnailImageUrl": "thumbnail-url"
    }
  ],
  "nextCursor": "pagination-token"
}
```

**Implementation Details**:

1. **StateManager Gallery Data Storage**:
   - `state.galleryData` structure stores API responses
   - `videoIndex` Map for O(1) video lookups by ID
   - `imageIndex` Map for O(1) image/post lookups by ID
   - 5-minute freshness check via `hasGalleryData(maxAge)`
   - Event system: `gvp:gallery-data-updated` dispatched on changes

2. **Key StateManager Methods** (240 lines added):
   - `ingestGalleryData(posts, meta)` - Process and store API responses
   - `getVideoById(videoId)` - Fast video lookup
   - `getImageById(imageId)` - Fast image lookup
   - `getAllVideosFromGallery()` - Get all videos
   - `getFilteredVideos(filters)` - Filter by mode, liked, date, hasPrompt
   - `getGalleryDataStats()` - Statistics about stored data
   - `clearGalleryData()` - Clear stale data

3. **NetworkInterceptor Integration**:
   - `_applyGalleryDataset()` now calls `StateManager.ingestGalleryData()`
   - Automatic ingestion when `/rest/media/post/list` responses arrive
   - Handles gzip decompression transparently
   - Error handling with graceful fallback

4. **UIPlaylistManager Enhancement**:
   - `buildPlaylistFromApi(filters)` - Build from API data
   - Enhanced `playFromFavorites()` with smart fallback:
     - **Primary**: Uses API data if available and fresh
     - **Fallback**: DOM scraping if API data unavailable
   - Enriched metadata display:
     - Mode badges: 🌶️ (spicy), 📝 (custom), ❤️ (liked)
     - Resolution: "3 / 10 • 464×688"
     - Real prompts instead of "Favorite #1"
     - Better thumbnails from `thumbnailImageUrl`

**Data Flow**:
```
1. User views /imagine/favorites
   ↓
2. Page makes POST to /rest/media/post/list
   ↓
3. NetworkInterceptor catches response
   ↓
4. _processGalleryResponse() parses JSON
   ↓
5. _extractGalleryPosts() extracts posts
   ↓
6. _applyGalleryDataset() calls StateManager
   ↓
7. StateManager.ingestGalleryData() stores & indexes
   ↓
8. Event: gvp:gallery-data-updated dispatched
   ↓
9. User clicks ▶ playlist button
   ↓
10. UIPlaylistManager checks API data freshness
    ↓
11. buildPlaylistFromApi() if data fresh
    ↓
12. Player shows enriched metadata
```

**Benefits**:
- ✅ Real prompts (not "Favorite #1")
- ✅ Accurate timestamps from API
- ✅ Mode detection (normal/custom/spicy)
- ✅ Resolution info displayed
- ✅ Like status tracking
- ✅ Instant playlist (no scrolling if data fresh)
- ✅ Fallback ensures reliability

### 12.5 Player UI

**Fullscreen Modal**: `.gvp-playlist-player` overlay with black background
**Layout**: CSS Grid with video area + sidebar playlist
**Styling**: Golden theme matching extension (`#fbbf24` accent color)

**Components**:
- **Video container**: Large area with black letterboxing
- **Sidebar**: Scrollable playlist with thumbnails
- **Controls**: Previous/Next, Play/Pause, Shuffle, Loop
- **Info bar**: Video counter ("3 / 10"), title display
- **Close button**: Top-right × with rotation animation

**CSS Classes** @stylesheet.js#2361-2398:
- `.gvp-playlist-player` - Fixed fullscreen overlay
- `.gvp-playlist-content` - Grid container
- `.gvp-playlist-video-container` - Video area
- `.gvp-playlist-sidebar` - Playlist items
- `.gvp-playlist-controls` - Button controls

### 12.6 Playlist Manager

**File**: `UIPlaylistManager.js` (~650 lines with v1.15.23 enhancements)

**Key Methods**:
- `buildPlaylist(sortMode)` - Build from multi-gen history
- **NEW:** `buildPlaylistFromApi(filters)` - Build from API gallery data
- `playFromFavorites()` - **Enhanced**: API-first with DOM fallback
- `_autoScrollPage()` - Aggressive page scrolling (fallback)
- `_scrapeVideoUrls()` - DOM video extraction (fallback)
- `play(sortMode)` - Start playback
- `_createPlayerModal()` - Build fullscreen UI
- `_loadVideo(index)` - Load specific video
- `_updatePlayerUI()` - **Enhanced**: Show mode badges & resolution
- `_renderPlaylist()` - **Enhanced**: Show thumbnails & metadata
- `_countModes(playlist)` - Count videos by mode for stats

**State Properties**:
- `playlist[]` - Video items array (enriched with API data)
- `currentIndex` - Current video position
- `isPlaying` - Playback state
- `shuffle/loop` - Playback modes
- `playerModal` - UI reference

**Integration**:
- **Button**: Golden ▶ in header (next to Settings)
- **Detection**: Auto-detects favorites vs history page
- **API Integration**: Uses StateManager.galleryData when available
- **Smart Fallback**: DOM scraping if API data unavailable/stale
- **Storage**: No persistence (rebuilds each time)
- **UI**: Integrated with shadow DOM styling

**Playlist Item Structure** (API-enhanced):
```javascript
{
  videoUrl: "https://assets.grok.com/.../generated_video.mp4",
  videoId: "919316b2-...",
  imageId: "c310c181-...",
  imageUrl: "https://imagine-public.x.ai/.../image.png",
  thumbnailUrl: "https://imagine-public.x.ai/.../thumb.png", // NEW
  prompt: "Full video motion prompt", // Real prompt, not "Favorite #1"
  timestamp: "2025-10-23T17:36:41.286229Z", // Accurate timestamp
  mode: "normal|custom|extremely-spicy-or-crazy", // NEW
  resolution: {width: 464, height: 688}, // NEW
  modelName: "imagine_xdit_1", // NEW
  assetId: "919316b2-...",
  isApiSource: true, // NEW - flag for API vs DOM
  liked: true // NEW - from userInteractionStatus
}
```

### 12.7 Recent Enhancements (v1.15.23)

**✅ Completed API Integration**:
- ✅ Hooked into `/rest/media/post/list` NetworkInterceptor
- ✅ Using real prompts instead of generic titles
- ✅ Actual timestamps for accurate tracking
- ✅ Thumbnail variety from API `thumbnailImageUrl`
- ✅ Mode badges displayed (🌶️📝❤️)
- ✅ Resolution display in player
- ✅ Smart fallback to DOM scraping

**Future Player Features**:
- Volume control
- Playback speed adjustment
- Fullscreen video mode
- Playlist persistence/saving
- Video download button
- Share playlist feature

**Future History Tab Enhancements**:
- Match API data to multi-gen history entries
- Enrich history cards with prompts/modes/resolutions
- Add "Refresh from API" button
- Show mode badges in history cards
- Display resolution and accurate timestamps
- Playlist export/import
- Search/filter within playlist

**Network Integration**:
- "Raw Prompt" and "JSON" buttons in player
- Regenerate video from player interface
- Save favorite videos to local collection
- Sync playlist across browser sessions

---

## 13. Upload Automation System

### 12.1 Overview

Upload Mode is a **major feature** that automates batch image uploading to Grok's image generation interface. Users queue multiple images, click Start, and the system automatically injects each image, waits for upload, navigates back to the gallery, and processes the next item.

**Key Components**:
- `UploadAutomationManager.js` - Core automation logic, queue management, file injection
- `UIUploadManager.js` - Upload queue UI panel (388px wide, slides from right)
- `UIManager.js` - Integration point, launcher button, killswitch logic

### 12.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Launcher Button (📤 Upload Mode)                            │
│  └─> Toggles upload mode on/off                            │
│  └─> Acts as KILLSWITCH when active                        │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ UIUploadManager (388px Panel from Right)                    │
│  ┌───────────┬───────────┐                                  │
│  │ ▶️ Start  │ ⏹️ Stop   │  4-button grid (2x2)             │
│  ├───────────┼───────────┤                                  │
│  │ 🗑️ Clear  │ ❌ Cancel │                                  │
│  └───────────┴───────────┘                                  │
│  📁 Select Images                                           │
│  Queue: 0  |  Processed: 0                                 │
│  [Queue List with status icons]                            │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ UploadAutomationManager                                      │
│  • Queue Management (_queue array)                          │
│  • File Injection (DataTransfer API)                        │
│  • Navigation (Favorites button click)                      │
│  • State Sync (StateManager integration)                    │
│  • Cancellation Checks (after each await)                   │
└─────────────────────────────────────────────────────────────┘
```

### 12.3 File Injection Method

**Critical Implementation Detail**: Uses DataTransfer API to inject files directly into Grok's hidden file input, **NOT clipboard API**.

```javascript
// WORKS ✅ - Direct file injection
const fileInput = document.querySelector('input[type="file"][name="files"]');
const dataTransfer = new DataTransfer();
dataTransfer.items.add(file);
fileInput.files = dataTransfer.files;
fileInput.dispatchEvent(new Event('change', { bubbles: true }));

// DOESN'T WORK ❌ - Clipboard API (JPEG not supported)
await navigator.clipboard.write([clipboardItem]); // Fails for JPEG!
```

**Why**: Clipboard API only supports PNG format. JPEGs throw `NotAllowedError: Type image/jpeg not supported on write`.

### 12.4 Upload Flow

1. **User Action**: Click launcher 📤 button → Upload mode enabled
2. **Queue UI Opens**: 388px panel slides in from right
3. **Select Files**: Click "📁 Select Images" → File picker
4. **Files Queued**: Items appear with 'pending' status
5. **Click Start** (▶️):
   - For each image in queue:
     a. **Inject**: DataTransfer → hidden input → events dispatched
     b. **Wait**: 3 seconds for upload to complete
     c. **Check Cancelled**: If Stop clicked → save state & exit
     d. **Navigate**: Click Favorites button → back to `/imagine/favorites`
     e. **Check Cancelled**: Again after navigation
     f. **Mark Complete**: Update status, increment counter
     g. **Next Item**: Repeat from step a
6. **Completion**: All done → Auto-close panel (optional)

### 12.5 Navigation Logic

**Path Detection** (CRITICAL FIX):
```javascript
// WRONG ❌ - Matches /imagine/post/[id] as gallery!
path.startsWith('/imagine')

// CORRECT ✅ - Exact match only
path === '/imagine/favorites' || path === '/imagine' || path === '/imagine/'
```

**Navigation Method**:
1. Check if already on gallery → early return
2. Find Favorites button: `button[aria-label="Favorites"]`
3. Click button (visible stacked images icon)
4. Wait 1 second for SPA navigation
5. Verify path changed
6. Fallback to ESC key / history.back() / direct pushState if needed

### 12.6 Button Functions

| Button | Icon | Color | Function | Behavior |
|--------|------|-------|----------|----------|
| **Start/Pause** | ▶️/⏸️ | Green | Start or pause processing | Toggles based on `_isProcessing` state |
| **Stop** | ⏹️ | Orange | Stop current item | Sets `_isProcessing = false`, item saved to resume later |
| **Clear** | 🗑️ | Gray | Clear entire queue | Confirms, clears queue, keeps panel open |
| **Cancel** | ❌ | Red | **KILLSWITCH** | Stop + Clear + Close Panel + Disable Mode (confirms first) |

**Launcher Button**: Acts as killswitch when upload mode active - same as Cancel button.

### 12.7 Cancellation System

**Problem**: Async functions don't automatically stop when `_isProcessing` set to false.

**Solution**: Check `_isProcessing` after every `await`:

```javascript
await this._delay(3000);

// Check if cancelled during delay
if (!this._isProcessing) {
    console.log('⏸️ Cancelled, stopping...');
    item.status = 'pending';  // Reset so can resume
    this._queue.unshift(item); // Put back at front
    return;  // STOP IMMEDIATELY
}
```

Checks happen:
1. After file injection
2. After 3-second upload wait
3. After navigation back to gallery

### 12.8 State Management

**StateManager Integration**:
```javascript
// Enable/disable mode
stateManager.setUploadAutomationEnabled(true/false)

// Listen for mode changes
window.addEventListener('gvp:upload-mode-changed', handler)

// Check current state
stateManager.isUploadAutomationEnabled()
```

**Sync Pattern**: UploadAutomationManager checks StateManager directly in `enqueueFiles` to handle event dispatch misses:
```javascript
const stateEnabled = this.stateManager?.isUploadAutomationEnabled?.() ?? false;
if (!stateEnabled) {
    console.warn('[GVP Upload] Cannot enqueue - mode disabled');
    return 0;
}
```

### 12.9 Queue Item Structure

```javascript
{
    id: 'upload_1762518628560_abc123',
    file: File,              // Actual File object
    name: 'image.jpg',       // Display name
    size: 1024576,           // Bytes
    type: 'image/jpeg',      // MIME type
    status: 'pending',       // pending|processing|completed|failed
    attempts: 1,             // Retry counter (max 3)
    addedAt: timestamp,      // Queue time
    startedAt: timestamp,    // Processing start
    error: 'error message'   // If failed
}
```

### 12.10 UI Specifications

**Panel**:
- Width: **388px** (fits drawer perfectly)
- Position: Fixed, right: 0, z-index: 999999
- Animation: `translateX(100%)` → `translateX(0)` (slide from right)
- Background: #1a1a1a (dark theme)

**Button Grid**:
- Layout: `grid-template-columns: repeat(2, 1fr)`
- Gap: 8px
- 2 rows × 2 columns

**Status Display**:
- Queue count
- Processed count
- Current item (if processing)
- Failed count (if any)

### 12.11 Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Stop button doesn't work | Async not checking cancellation | Add `if (!this._isProcessing) return` after awaits |
| JPEG upload fails | Clipboard API limitation | Use DataTransfer API instead |
| Stays on image page | `path.startsWith('/imagine')` matches post pages | Use exact path match |
| "Cannot enqueue" error | StateManager sync miss | Check StateManager directly in enqueueFiles |
| Panel doesn't close | Auto-close disabled | Added auto-close on completion/failure |

### 12.12 Future Enhancements

- [ ] Configurable upload delay (currently fixed 3s)
- [ ] Drag & drop file support
- [ ] Progress percentage per item
- [ ] Pause/resume individual items
- [ ] Export/import queue lists
- [ ] Upload history tracking

---

## 13. Recent Updates (v1.11.0 - v1.12.0)

### 13.1 Toast Notification System (v1.12.0)

**Status**: ✅ IMPLEMENTED

Replaced all blocking `window.alert()` dialogs with modern toast notifications.

**Features**:
- Non-blocking notifications that slide up from bottom
- Smart queue system (shows toasts sequentially)
- Color-coded by type: Success (green), Error (red), Warning (gold), Info (blue)
- Auto-dismiss: Success (3s), Error (4s), Warning (3.5s), Info (3s)
- Smooth animations with fade effects

**Usage**:
```javascript
window.gvpUIManager.uiModalManager.showSuccess("Preset saved!");
window.gvpUIManager.uiModalManager.showError("Save failed");
window.gvpUIManager.uiModalManager.showWarning("No preset loaded");
window.gvpUIManager.uiModalManager.showInfo("Processing...");
```

**Files Modified**:
- `UIModalManager.js` (lines 12-13, 723-775)
- `stylesheet.js` (lines 2079-2118)
- `UIFormManager.js` (7 alert replacements)

### 13.2 Smart Preset Update System (v1.11.0)

**Status**: ✅ IMPLEMENTED

Automatic change detection for JSON presets with one-click updates.

**How It Works**:
1. Load preset → Extension stores preset name + original data
2. Make changes → Deep JSON comparison detects modifications
3. Update button appears: `💾 Update "Preset Name"`
4. Click button → Preset updated, toast confirmation, button disappears

**Key Methods** (UIFormManager.js):
- `_applyJsonPresetFromSelect()` - Stores loaded preset data (lines 324-359)
- `_hasPresetChanges()` - Deep comparison (lines 525-537)
- `_updatePresetButtonVisibility()` - Show/hide logic (lines 539-552)
- `_updateCurrentPreset()` - One-click save (lines 555-581)

**Properties**:
- `currentPresetName` (line 16) - Tracks loaded preset
- `currentPresetData` (line 17) - Original data for comparison
- `updatePresetBtn` (line 18) - Button reference

### 13.3 History Tab - Multi-Generation Tracker

**Status**: ✅ FULLY IMPLEMENTED AND WORKING

**Location**: `UIManager.js` lines 819-1100+

The History tab tracks video generations PER IMAGE with full state persistence.

**Data Structure**:
```
multiGenHistory:
  images: Map<imageId, {accountId, thumbnailUrl, attempts[], counters}>
  order: ['imageId1', 'imageId2']
  armed: Map<requestId, metadata>
  lastImageByAccount: Map<accountId, imageId>
```

**Network Capture**:
- `GET .../content` → Registers imageId + thumbnail
- `POST /rest/app-chat/conversations/new` → Tracks generation progress

**UI Features**:
- Sorting: Default, Recently updated, Recent successes, etc.
- Image cards with thumbnails, counters (success/moderated/fail)
- Expandable attempts with progress bars
- Action buttons: Prompt, Video, Open Image
- Modals for prompt viewing and image preview

**Key Methods**:
- `_createHistoryTab()` - Main UI (line 819)
- `_renderMultiGenHistory()` - Card rendering
- `_renderMultiGenImageCard()` - Individual images
- `_renderMultiGenAttempt()` - Generation attempts

**StateManager Methods**:
- `ensureMultiGenImageEntry()`, `createMultiGenAttempt()`
- `appendMultiGenProgress()`, `finalizeMultiGenAttempt()`
- `deleteMultiGenAttempt()`, `clearMultiGenHistory()`
- `_startGenerationTimeout()`, `_clearGenerationTimeout()`, `_handleGenerationTimeout()` - 30-second timeout for stalled attempts

**Storage**: Persists to `chrome.storage.local` under `gvp_multi_gen_history`

**Troubleshooting - Account ID Extraction Failure (v1.12.6 Fix)**:

**Symptom**: History tab stops tracking new video generations. Logs show:
```
[GVP][Interceptor] Multi-gen capture skipped: unable to resolve account id
```

**Root Cause**: `NetworkInterceptor._captureMultiGenRequestContext()` failed to extract account ID from:
1. Payload (searches for `users/{uuid}` pattern)
2. Thumbnail URL
3. Pending upload metadata

**Fix Applied**: Added fallback to `StateManager.getActiveMultiGenAccount()` which syncs from cookies/active state.

**Location**: `NetworkInterceptor.js` lines 473-479

**Code**:
```javascript
// FALLBACK: Try to get active account from StateManager if extraction failed
if (!accountId && this.stateManager?.getActiveMultiGenAccount) {
    accountId = this.stateManager.getActiveMultiGenAccount();
    if (accountId) {
        console.log('[GVP][Interceptor] ℹ️ Using active account from StateManager as fallback', accountId);
    }
}
```

**Verification**: After fix, logs should show either:
- `[GVP][Interceptor] Bridge conversation captured {requestId: ..., imageId: ...}` (success)
- `[GVP][Interceptor] ℹ️ Using active account from StateManager as fallback` (fallback worked)

If still failing, check detailed error log for payload contents and active account state.

### 13.4 Aurora Mode

**Status**: ✅ IMPLEMENTED

**File**: `AuroraManager.js` (305 lines)

Auto-uploads blank PNG images to Grok for text-to-video generation.

**Features**:
- 3 aspect ratios: portrait, landscape, square
- Auto-detection from prompt keywords ("portrait", "landscape")
- Cached file IDs (30min expiry) to avoid re-uploads
- Configurable base64 PNGs per aspect ratio
- Auto-adds "Edit this image to show:" prefix

**Flow**:
1. User enables Aurora mode in Settings
2. On generation, detects aspect ratio from prompt
3. Checks cache for file ID (30min expiry)
4. If not cached, uploads blank PNG to `/rest/app-chat/upload-file`
5. Injects file ID into `fileAttachments` array
6. Adds edit intent prefix if not present

**Settings**:
- `auroraEnabled` (boolean)
- `auroraAspectRatio` ('portrait'|'landscape'|'square')
- `auroraBlankPngPortrait` (base64)
- `auroraBlankPngLandscape` (base64)
- `auroraBlankPngSquare` (base64)
- `auroraCacheExpiry` (milliseconds, default 30min)

**Key Methods**:
- `getCachedFileId(type)` - Retrieve cached ID
- `uploadBlankPNG(type, headers)` - Upload new blank
- `detectAspectRatio(message)` - Parse prompt for keywords
- `injectAuroraAttachment(body, headers)` - Main injection
- `clearCache()` - Clear all cached IDs

**Cache Keys**:
- `gvp_aurora_file_id_portrait`
- `gvp_aurora_file_id_landscape`
- `gvp_aurora_file_id_square`

**NetworkInterceptor Integration**:
Called from `_enhancedFetchInterceptor` before sending POST to `/conversations/new`.

---

## 🔧 Recent Critical Fixes (v1.15.40 - v1.15.41)

### **API Stream Monitoring - FIXED ✅**

**The Problem:**
- API progress monitoring was broken due to fetch interceptor processing completed responses instead of live streaming data
- Progress updates showed millisecond timing (1% → 100% in 63ms) instead of real generation time (2-5 minutes)
- Cross-page monitoring wasn't working for live generations

**The Root Cause:**
```javascript
// BROKEN (v1.15.40 and earlier):
const text = await response.text(); // ❌ Waits for COMPLETE response
const lines = text.split(/\r?\n/);  // ❌ Processes all at once
// Result: All progress updates replayed in milliseconds
```

**The Fix (v1.15.41):**
```javascript
// FIXED - Real streaming processing:
const reader = response.body.getReader();
while (true) {
    const { done, value } = await reader.read(); // ✅ Process as chunks arrive
    const chunkText = new TextDecoder().decode(value, { stream: true });
    // Process each progress update in real-time with proper timing
}
```

**Files Modified:**
- `public/injected/gvpFetchInterceptor.js` - Complete rewrite of `processResponseBody()` function
- Added proper streaming buffer management and chunk processing
- Added real-time logging with `log('Stream progress: ${progress}%')`

**Expected Result:**
- Progress updates now have real timing (20-30 second intervals)
- Cross-page monitoring works for live generations  
- Concurrent video tracking (12+ videos) works efficiently
- Each video stream processes independently without polling

**Testing Status:** ✅ Confirmed working - proper timing observed in logs

---

### **Quick JSON Mode Support - FIXED ✅**

**The Problem:**
- UIProgressAPI wasn't tracking generations when using Quick JSON mode
- Bridge-progress events weren't being monitored for API tracking
- Cross-page monitoring only worked for regular generation mode

**The Fix (v1.15.40):**
- Added generation tracking to `NetworkInterceptor.handleBridgeProgress()` method
- Added dual API tracking calls (UIProgressAPI and legacy gvpProgressAPI)
- Proper videoId/imageId extraction for Quick JSON workflow

**Files Modified:**
- `src/content/managers/NetworkInterceptor.js` - Added generation tracking to handleBridgeProgress
- Added _extractImageIdFromReference method for UUID extraction

---

### Final Note
Treat this encyclopedia as living documentation. The streaming fix represents a fundamental architectural improvement - we now process real-time data instead of replaying completed responses. This enables true cross-page progress monitoring and concurrent video tracking.

**Key Architectural Insight:** The difference between Chrome's "Preview" (live streaming) and "Response" (completed data) tabs was crucial to understanding and fixing the timing issue.

Happy prompt-wrangling. Stream responsibly. 🎯
