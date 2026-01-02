# 🤖 AI HANDOVER PROTOCOL: Grok Video Prompter

**SYSTEM NOTICE**: You have been activated on the **Grok Video Prompter** project. This is a complex, persistent Chrome Extension with a strict architecture.

**⛔ STOP. DO NOT WRITE CODE YET.**

Your first priority is to align your internal context with the project's "External Brain" located in `grok_video_prompter/`. Ignoring this protocol will lead to regression, data loss, and architectural violations.

---

## 1. 🔴 THE PRIME DIRECTIVE: "Rules First"

Before generating **ANY** response or code, you must ingest the project's core laws.
*   **Action**: Read `grok_video_prompter/artifacts/0_Overview_Rules.md`
*   **Why**: This file contains the "Master Rules" (Forbidden patterns, mandatory checks) and the "UI Style Guide".
*   **Constraint**: You are **FORBIDDEN** from using React, Vue, Tailwind, or `innerHTML` loops. You must use the defined `Manager` pattern and `ShadowDOM`.

---

## 2. 🧠 CONTEXT ACQUISITION SEQUENCE

To understand the project state, follow this read order:

### Step A: The Map (`metadata.json`)
*   **File**: `grok_video_prompter/metadata.json`
*   **Purpose**: This is your index. It maps every feature (e.g., "Upload Mode", "History") to its specific documentation artifact.
*   **Usage**: If the user asks about "Playlists", look up "Playlist" in this file to find the correct `.md` file to read.

### Step B: The Architecture (`5_Core_Infrastructure.md`)
*   **File**: `grok_video_prompter/artifacts/5_Core_Infrastructure.md`
*   **Purpose**: Explains the "Manager Pattern".
    *   `UIManager`: The visual orchestrator.
    *   `StateManager`: The single source of truth.
    *   `NetworkInterceptor`: The API listener.
*   **Key Concept**: The UI is ephemeral; State is persistent. Never store state in the UI.

### Step C: The Data (`9_Unified_Storage_Architecture.md`)
*   **File**: `grok_video_prompter/artifacts/9_Unified_Storage_Architecture.md`
*   **Purpose**: Explains how data is stored.
    *   **Unified Store**: We use `IndexedDB` (not `chrome.storage` for heavy data).
    *   **Account Isolation**: Data is segregated by Grok Account ID.
    *   **DOM Scanning**: How we detect the active account.

---

## 3. 📂 CODEBASE NAVIGATION GUIDE

The project structure is strict. Do not create files outside these patterns.

```text
src/content/
├── managers/                 # 🧠 BUSINESS LOGIC (Classes)
│   ├── StateManager.js       # Global State & Persistence
│   ├── NetworkInterceptor.js # API Traffic Handling
│   ├── IndexedDBManager.js   # Database Operations
│   ├── UIManager.js          # UI Orchestrator
│   │
│   └── ui/                   # 🎨 UI COMPONENTS (Sub-managers)
│       ├── UIFormManager.js  # JSON Editor Forms
│       ├── UIPlaylistManager.js # Video Player & Lists
│       └── ...
│
├── utils/                    # 🛠️ HELPERS (Pure Functions)
│   ├── Logger.js             # Centralized Logging
│   └── ...
│
└── content.js                # 🚀 ENTRY POINT (Bootstrapper)
```

---

## 4. ⚠️ CRITICAL "GOTCHAS" & ACTIVE ISSUES

**1. The "Progress Persistence" Bug**
*   **Issue**: Moderated videos sometimes lose their progress percentage on reload.
*   **Reference**: Read `grok_video_prompter/artifacts/9_Unified_Storage_Architecture.md` (Known Issues section).
*   **Instruction**: Be careful when touching `NetworkInterceptor.js` finalization logic.

**2. The "Shadow DOM" Barrier**
*   **Rule**: You cannot query extension elements using `document.getElementById`.
*   **Solution**: Use `this.shadowRoot.getElementById()` within Managers.

**3. The "Async" Storage**
*   **Rule**: `IndexedDB` is asynchronous.
*   **Instruction**: Always `await` storage operations. Never assume data is saved immediately.

---

## 5. 🔄 YOUR WORKFLOW LOOP

1.  **User Request**: "Fix the playlist bug."
2.  **Consult Map**: Check `metadata.json` -> Find `4_History_Playlist.md`.
3.  **Read Artifact**: Read `4_History_Playlist.md` to understand how playlists work.
4.  **Plan**: Create a plan based on the artifact + code.
5.  **Execute**: Write code.
6.  **Update**: If you changed logic, **YOU MUST UPDATE THE ARTIFACT**.

**Go forth and code safely.**
