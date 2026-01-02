# Unified Logging System

**Version:** 1.0.0
**Last Updated:** 2025-12-25
**Feature:** Centralized Debug Logging

## 1. Overview
The **Unified Logging System** (`GVPLogger`) replaces scattered `console.log` calls with a structured, persistent, and controllable logging mechanism. It allows the user to toggle verbose debug output on/off globally, preventing console spam during normal operation while offering deep insights when needed.

## 2. Core Components

### `GVPLogger` Class
Located in `src/content/utils/Logger.js`.
- **Global Access:** `window.Logger` or `window.GVPLogger`
- **Persistence:** Stores `debugLogging` state in `chrome.storage.local`.
- **Performance:** Includes `perf()` method for timing operations.

### Properties
| Level | Value | Usage |
| :--- | :--- | :--- |
| `DEBUG` | 0 | Detailed traces, variable dumps, high-frequency events (e.g., mouse processing). |
| `INFO` | 1 | Major lifecycle events, successful operations, state changes. |
| `WARN` | 2 | Non-fatal errors, recovaries, fallback activations. |
| `ERROR` | 3 | Critical failures, exceptions that stop a flow. |
| `NONE` | 4 | Silence all output. |

## 3. Usage Pattern

**Syntax:**
```javascript
window.Logger.level('FeatureName', 'Message', ...data);
```

**Examples:**
```javascript
// Info
window.Logger.info('NetworkInterceptor', '🚀 Request captured', { url: request.url });

// Debug (only visible if Debug Mode is ON)
window.Logger.debug('QuickLaunch', 'Mouse moved to', { x, y });

// Error
window.Logger.error('StateManager', 'Failed to save to IndexedDB', error);
```

**Output Format:**
```
[GVP] [FeatureName] Message -> Object
```

## 4. Configuration

### UI Toggle
1. Open the **GVP Settings Panel** (Gear icon).
2. Expand **Developer Options**.
3. Toggle **🐞 Debug Logging**.

### Console Control
You can also control logging programmatically via the DevTools console:

```javascript
// Enable Debug Mode
await window.Logger.setDebugMode(true);

// Disable Debug Mode
await window.Logger.setDebugMode(false);

// Check Status
window.Logger.isDebugEnabled(); // true/false
```

## 5. Migration Guide
When writing new code, **DO NOT** use `console.log`.

| Legacy | Modern Replacement |
| :--- | :--- |
| `console.log('Doing X')` | `window.Logger.info('MyFeature', 'Doing X')` |
| `console.debug('Var:', x)` | `window.Logger.debug('MyFeature', 'Var:', x)` |
| `console.warn('Oops')` | `window.Logger.warn('MyFeature', 'Oops')` |
| `console.error(err)` | `window.Logger.error('MyFeature', 'Failure', err)` |
