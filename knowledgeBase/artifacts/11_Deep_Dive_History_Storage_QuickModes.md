# Deep Dive: History Tab, Unified Storage & Quick Modes

**Version**: v1.21.44 (2025-12-25)  
**Purpose**: Detailed architectural diagrams for IndexedDB storage, History Tab data flow, and Quick Raw/JSON automation.

---

## 1. IndexedDB Unified Storage Architecture

### Database Schema

```mermaid
erDiagram
    UNIFIED_HISTORY {
        string imageId PK "Parent image UUID"
        string accountId FK "User account UUID"
        string thumbnailUrl "Image thumbnail"
        string imageUrl "Source image URL"
        string prompt "Original prompt text"
        datetime createdAt "Image creation time"
        datetime updatedAt "Last activity"
        array attempts "Video attempts array"
    }
    
    ATTEMPTS {
        string id PK "Video UUID"
        string status "success|pending|moderated|failed"
        string videoUrl "Playable video URL"
        string thumbnailUrl "Video thumbnail"
        datetime timestamp "Finished timestamp"
        datetime startedAt "Generation start"
        datetime finishedAt "Completion time"
        int progress "0-100"
        boolean isApiSource "From /list API?"
        boolean liked "User liked?"
        string mode "normal|spicy"
    }
    
    UNIFIED_HISTORY ||--o{ ATTEMPTS : contains
```

### IndexedDB Method Call Flow

```mermaid
flowchart TB
    subgraph Callers["Who Calls IndexedDB"]
        STATE["StateManager"]
        NET["NetworkInterceptor"]
        SETTINGS["UISettingsManager"]
        PLAYLIST["UIPlaylistManager"]
    end
    
    subgraph IDB["IndexedDBManager"]
        INIT["initialize()"]
        GET_ALL["getAllUnifiedEntries(accountId)"]
        GET_ONE["getUnifiedEntry(imageId)"]
        GET_BATCH["getUnifiedEntriesBatch(imageIds)"]
        SAVE_ONE["saveUnifiedEntry(entry)"]
        SAVE_BATCH["saveUnifiedEntries(entries)"]
        CLEAR["clearUnifiedHistory(accountId)"]
    end
    
    subgraph Store["IndexedDB Store"]
        UH[("unifiedHistory\n(keyPath: imageId)")]
    end
    
    STATE --> GET_ALL & SAVE_BATCH
    NET --> GET_ONE & SAVE_ONE
    SETTINGS --> GET_ALL
    PLAYLIST --> GET_ALL
    
    GET_ALL --> UH
    GET_ONE --> UH
    SAVE_ONE --> UH
    SAVE_BATCH --> UH
    CLEAR --> UH
```

---

## 2. History Tab Data Loading Flow

```mermaid
sequenceDiagram
    participant Page as Grok Page Load
    participant DOM as DOM Scanner
    participant SM as StateManager
    participant IDB as IndexedDBManager
    participant UI as UIManager
    participant Cards as History Cards
    
    rect rgb(40, 60, 80)
    Note over Page,Cards: Initial Account Detection
    Page->>DOM: Page loads with images
    DOM->>DOM: scanForAccountId()<br/>Regex: /users/([uuid])/
    DOM->>SM: state.activeAccountId = uuid
    end
    
    rect rgb(60, 40, 80)
    Note over SM,IDB: Data Loading
    SM->>IDB: getAllUnifiedEntries(accountId)
    IDB->>IDB: Open transaction (readonly)
    IDB->>IDB: Query by accountId index
    IDB-->>SM: entries[] (all images + attempts)
    end
    
    rect rgb(40, 80, 60)
    Note over SM,Cards: Data Enrichment & UI
    SM->>SM: _enrichUnifiedThumbnails(entries)
    SM->>SM: state.unifiedHistory = entries
    SM->>SM: dispatchEvent('gvp-unified-history-loaded')
    SM-->>UI: Event received
    UI->>UI: _renderMultiGenHistory()
    UI->>Cards: Create history cards with attempts
    end
```

### Unified Entry Structure After Load

```mermaid
flowchart LR
    subgraph Entry["Unified Entry (1 per image)"]
        IMG["imageId: 'abc-123'"]
        ACC["accountId: 'user-456'"]
        THUMB["thumbnailUrl: 'https://...'"]
        PROMPT["prompt: 'A cat...'"]
        DATES["createdAt/updatedAt"]
    end
    
    subgraph Attempts["attempts[] (N per image)"]
        A1["Attempt 1<br/>id: 'vid-001'<br/>status: success<br/>videoUrl: 'https://...'<br/>progress: 100"]
        A2["Attempt 2<br/>id: 'vid-002'<br/>status: moderated<br/>progress: 72"]
        A3["Attempt 3<br/>id: 'vid-003'<br/>status: pending<br/>progress: 45"]
    end
    
    Entry --> Attempts
```

---

## 3. History Tab Rendering Flow

```mermaid
flowchart TB
    subgraph DataSource["Data Sources"]
        UNIFIED["state.unifiedHistory[]"]
        EVENT["'gvp-unified-history-loaded' event"]
        UPDATE["'gvp:multi-gen-history-update' event"]
    end
    
    subgraph Render["_renderMultiGenHistory()"]
        SORT["Sort by updatedAt DESC"]
        BUILD["_buildMultiGenCard(entry)"]
        THUMB["Resolve thumbnail<br/>(imageThumbnailUrl || thumbnailUrl)"]
        ATTEMPTS["Render attempt rows<br/>(status, progress, buttons)"]
    end
    
    subgraph Card["History Card UI"]
        IMG_THUMB["🖼️ Thumbnail"]
        VID_BTN["🎥 Play Videos"]
        NAV_BTN["📍 Navigate to Image"]
        PROMPT_BTN["📋 View Prompt"]
        STATUS["Status badges<br/>(success/pending/moderated)"]
    end
    
    DataSource --> Render
    UNIFIED --> SORT --> BUILD
    BUILD --> THUMB --> IMG_THUMB
    BUILD --> ATTEMPTS --> STATUS
    BUILD --> VID_BTN & NAV_BTN & PROMPT_BTN
    
    subgraph Navigation["Snap Navigation Logic"]
        NAV_BTN -->|Click| PUSH["history.pushState({}, '', '/imagine/post/id')"]
        PUSH --> DISPATCH["dispatchEvent(new PopStateEvent('popstate'))"]
        DISPATCH --> ROUTER["Grok Router updates view"]
        PUSH -.->|Error| FALLBACK["window.location.assign() (Reload)"]
    end
```

---

## 4. Quick Raw/JSON Complete Flow

```mermaid
flowchart TB
    subgraph Trigger["User Trigger"]
        TOGGLE["Enable Quick Raw/JSON Toggle"]
        CLICK["Click Gallery Image"]
    end
    
    subgraph Detection["Gallery Watcher (UIManager)"]
        WATCH["_initGalleryWatcher()"]
        DETECT["Detect image click"]
        CHECK{"Check quickLaunchMode"}
    end
    
    subgraph Route["_triggerQuickGeneration()"]
        JSON_PATH["Mode = 'json'"]
        RAW_PATH["Mode = 'raw'"]
    end
    
    subgraph Handlers["Generation Handlers"]
        JSON_GEN["UIFormManager.handleGenerateJson()"]
        RAW_GEN["UIRawInputManager.handleGenerateRaw()"]
    end
    
    subgraph Build["Prompt Building"]
        JSON_BUILD["buildJsonPrompt()<br/>• Categories<br/>• Fields<br/>• Presets"]
        RAW_BUILD["buildRawPrompt()<br/>• Textarea content<br/>• Templates<br/>• Silent mode suffix"]
    end
    
    subgraph Inject["ReactAutomation"]
        SEND["sendToGenerator(prompt, isRaw)"]
        TEXTAREA["Find Grok's textarea"]
        INSERT["Insert prompt text"]
        SUBMIT["Click Generate button"]
    end
    
    subgraph Return["Return to Gallery"]
        WAIT["Wait for submission"]
        ESC["_returnToGallery()"]
        CLOSE["Simulate ESC key"]
    end
    
    TOGGLE --> WATCH
    CLICK --> DETECT --> CHECK
    CHECK -->|"'json'"| JSON_PATH --> JSON_GEN --> JSON_BUILD
    CHECK -->|"'raw'"| RAW_PATH --> RAW_GEN --> RAW_BUILD
    JSON_BUILD --> SEND
    RAW_BUILD --> SEND
    SEND --> TEXTAREA --> INSERT --> SUBMIT
    SUBMIT --> WAIT --> ESC --> CLOSE
```

### Quick Raw Flow Detail

```mermaid
sequenceDiagram
    participant User
    participant UIM as UIManager
    participant RAW as UIRawInputManager
    participant STATE as StateManager
    participant REACT as ReactAutomation
    participant GROK as Grok UI
    
    User->>UIM: Click gallery image
    UIM->>UIM: _initGalleryWatcher() detected click
    UIM->>STATE: getState().ui.quickLaunchMode
    STATE-->>UIM: 'raw'
    
    UIM->>UIM: _triggerQuickGeneration()
    UIM->>RAW: handleGenerateRaw({allowEmpty: false})
    
    RAW->>RAW: buildRawPrompt()
    Note over RAW: 1. Get textarea value<br/>2. Apply templates<br/>3. Add silent mode suffix
    
    RAW->>STATE: state.generation.lastPrompt = prompt
    RAW->>REACT: sendToGenerator(prompt, true)
    
    REACT->>GROK: Find .grok-prompt-textarea
    REACT->>GROK: Set textarea.value = prompt
    REACT->>GROK: Dispatch input event
    REACT->>GROK: Find [data-testid="send-button"]
    REACT->>GROK: Click send button
    
    REACT-->>RAW: Promise<void>
    RAW-->>UIM: Promise resolved
    
    UIM->>UIM: _returnToGallery({reason: 'quick-launch'})
    UIM->>GROK: Dispatch Escape key event
    GROK-->>User: Returns to gallery view
```

### Quick JSON Flow Detail

```mermaid
sequenceDiagram
    participant User
    participant UIM as UIManager
    participant FORM as UIFormManager
    participant STATE as StateManager
    participant REACT as ReactAutomation
    participant GROK as Grok UI
    
    User->>UIM: Click gallery image
    UIM->>UIM: quickLaunchMode = 'json'
    UIM->>FORM: handleGenerateJson({allowEmpty: false})
    
    FORM->>FORM: buildJsonPrompt()
    Note over FORM: 1. Collect category values<br/>2. Collect field values<br/>3. Apply preset if selected<br/>4. Format as JSON structure
    
    FORM->>STATE: state.generation.lastPrompt = prompt
    FORM->>REACT: sendToGenerator(jsonPrompt, false)
    
    REACT->>GROK: Insert into textarea
    REACT->>GROK: Click Generate
    
    REACT-->>UIM: Promise resolved
    UIM->>GROK: ESC to return
```

---

## 5. Incremental State Update Flow (v1.21.35+)

When new videos are generated, they must be added to both IndexedDB AND in-memory state:

```mermaid
flowchart TB
    subgraph Generation["Video Generation"]
        NEW["New video created"]
        STREAM["/new API stream"]
    end
    
    subgraph Intercept["NetworkInterceptor"]
        CATCH["Intercept /new response"]
        PARSE["Parse video data"]
        CREATE["Create unified entry"]
    end
    
    subgraph Persist["Dual Persistence"]
        IDB_SAVE["IndexedDBManager.saveUnifiedEntry()"]
        MEM_UPDATE["state.unifiedHistory.unshift(entry)"]
    end
    
    subgraph UI["UI Update"]
        EVENT["Dispatch 'gvp:multi-gen-history-update'"]
        RENDER["_renderMultiGenHistory()"]
        CARD["New card appears instantly"]
    end
    
    NEW --> STREAM --> CATCH --> PARSE --> CREATE
    CREATE --> IDB_SAVE
    CREATE --> MEM_UPDATE
    IDB_SAVE --> EVENT
    MEM_UPDATE --> EVENT
    EVENT --> RENDER --> CARD
    
    style MEM_UPDATE fill:#4a3d2d,stroke:#fbbf24
    
    Note over MEM_UPDATE: v1.21.35 FIX: Must update<br/>in-memory array since<br/>loadUnifiedHistory() is<br/>skipped after initial load
```

---

## 6. Key Function Reference

| Function | File | Purpose |
|----------|------|---------|
| `loadUnifiedHistory(accountId)` | StateManager.js | Load all entries from IndexedDB for account |
| `getAllUnifiedEntries(accountId)` | IndexedDBManager.js | Raw IndexedDB query |
| `saveUnifiedEntry(entry)` | IndexedDBManager.js | Save single entry |
| `_enrichUnifiedThumbnails(entries)` | StateManager.js | Backfill missing thumbnails |
| `_triggerQuickGeneration()` | UIManager.js | Route to correct handler |
| `handleGenerateRaw(options)` | UIRawInputManager.js | Build & send RAW prompt |
| `handleGenerateJson(options)` | UIFormManager.js | Build & send JSON prompt |
| `sendToGenerator(prompt, isRaw)` | ReactAutomation.js | Inject prompt to Grok UI |
| `_renderMultiGenHistory()` | UIManager.js | Render history cards |
| `buildPlaylistFromApi(filters)` | UIPlaylistManager.js | Build playlist from unified data |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.21.44 | 2025-12-25 | Initial deep-dive artifact created |
| v1.21.46 | 2025-12-25 | Added Snap Navigation logic diagram |
