// selectors.js - Centralized DOM selectors for Grok UI interaction
// Dependencies: None (must load before managers)
// Source: Consolidated from ReactAutomation.js, AutomaticRetryManager.js, UploadAutomationManager.js

window.GROK_SELECTORS = {
    // ═══════════════════════════════════════════════════════════════
    // TEXTAREA SELECTORS
    // ═══════════════════════════════════════════════════════════════
    TEXTAREA: {
        // Make Video textarea on front page
        VIDEO: [
            'textarea[aria-label="Make a video"]',
            'textarea[aria-label="Create a video"]',
            'textarea[placeholder="Describe the video you want to create"]',
            'textarea[placeholder*="video"]',
            'textarea[data-testid="video-generator-textarea"]',
            'textarea[data-testid="video-textarea"]',
            'textarea[name="videoPrompt"]',
            'section textarea[aria-multiline="true"]',
            'div[contenteditable="true"][data-testid*="video"]',
            'div[contenteditable="true"][aria-label*="video"]',
            'div[contenteditable="true"][data-placeholder*="video"]',
            'div[contenteditable="true"][role="textbox"]'
        ],
        // Image edit textarea
        IMAGE_EDIT: [
            'textarea[aria-label="Type to edit image..."]',
            'textarea[placeholder="Type to edit image..."]',
            'textarea[aria-label="Image prompt"]'
        ],
        // Masonry section textarea (for re-edits)
        MASONRY: [
            'textarea[aria-label="Image prompt"]',
            'textarea[aria-required="true"]',
            'textarea'
        ]
    },

    // ═══════════════════════════════════════════════════════════════
    // BUTTON SELECTORS
    // ═══════════════════════════════════════════════════════════════
    BUTTON: {
        // Make Video button (primary)
        MAKE_VIDEO: [
            'button[aria-label="Make video"]',
            'button[aria-label="Make a video"]',
            'button[data-testid="make-video-button"]',
            'button[data-testid="video-generator-submit"]',
            'button[type="submit"][data-variant]',
            'section button[type="submit"]'
        ],
        // Submit button (for edit mode)
        SUBMIT: 'button[aria-label="Submit"]',
        // Edit image button
        EDIT_IMAGE: [
            'button[aria-label="Play"]:has(svg.lucide-brush)',
            'button:has(svg.lucide-brush)'
        ],
        // Favorites button
        FAVORITES: 'button[aria-label="Favorites"]'
    },

    // ═══════════════════════════════════════════════════════════════
    // NAVIGATION PATHS
    // ═══════════════════════════════════════════════════════════════
    PATHS: {
        GALLERY: ['/imagine/favorites', '/imagine'],
        POST_PATTERN: /^\/imagine\/post\/([a-z0-9-]+)$/i,
        EDIT_PATTERN: /^\/imagine\/edit\//i
    },

    // ═══════════════════════════════════════════════════════════════
    // MASONRY SECTION SELECTORS
    // ═══════════════════════════════════════════════════════════════
    MASONRY: {
        SECTION_PREFIX: '[id^="imagine-edit-masonry-section-"]'
    }
};

// Utility: Check if any selector in array matches
window.GROK_SELECTORS.findFirst = function (selectorArray, root = document) {
    if (!Array.isArray(selectorArray)) {
        return root.querySelector(selectorArray);
    }
    for (const selector of selectorArray) {
        try {
            const el = root.querySelector(selector);
            if (el) return el;
        } catch (e) {
            // Invalid selector, skip
        }
    }
    return null;
};

// Utility: Check if any selector exists
window.GROK_SELECTORS.exists = function (selectorArray, root = document) {
    return !!window.GROK_SELECTORS.findFirst(selectorArray, root);
};

window.Logger?.info?.('Selectors', 'GROK_SELECTORS loaded');
