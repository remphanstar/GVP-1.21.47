(function () {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.__gvpFetchInterceptorInstalled) {
    window.postMessage({
      source: 'gvp-fetch-interceptor',
      type: 'GVP_FETCH_LOG',
      payload: {
        level: 'debug',
        message: 'Fetch interceptor already installed in page context'
      }
    }, '*');
    return;
  }

  window.__gvpFetchInterceptorInstalled = true;
  console.log('[GVP Interceptor v1.21.41] ✅ Fetch interceptor installed in page context');

  const MODE_TOKEN_REGEX = /\s*--mode=\S+/gi;
  let useSpicyMode = false;
  const PROMPT_TTL_MS = 6000;
  let bridgedPrompt = { text: '', isRaw: false, ts: 0 };

  // Aurora state
  let auroraEnabled = false;
  let auroraAspectRatio = 'square';
  let auroraImageMode = 'blank';
  let auroraBlankPngs = {
    portrait: '',
    landscape: '',
    square: ''
  };
  let auroraCustomImages = {
    portrait: '',
    landscape: '',
    square: ''
  };
  let auroraCache = {};
  const CACHE_EXPIRY = 30 * 60 * 1000; // 30 minutes

  // Aurora helper functions
  function getAuroraCacheKey(type) {
    return `gvp_aurora_file_id_${type}`;
  }

  function getCachedAuroraFileId(type) {
    const key = getAuroraCacheKey(type);
    const cached = auroraCache[key];
    if (cached && (Date.now() - cached.timestamp) < CACHE_EXPIRY) {
      return cached.id;
    }
    return null;
  }

  function setCachedAuroraFileId(type, id) {
    const key = getAuroraCacheKey(type);
    auroraCache[key] = { id, timestamp: Date.now() };
  }

  async function uploadAuroraBlankPNG(type) {
    // Select image source based on mode
    const imageSource = auroraImageMode === 'custom' ? auroraCustomImages : auroraBlankPngs;
    const base64 = imageSource[type];

    if (!base64) {
      log('[Aurora] No ' + auroraImageMode + ' image configured for ' + type, {}, 'error');
      return null;
    }

    log('[Aurora] Uploading ' + auroraImageMode + ' image for ' + type);

    try {
      const uploadUrl = 'https://grok.com/rest/app-chat/upload-file';
      const uploadHeaders = {
        'Content-Type': 'application/json'
      };

      const uploadBody = JSON.stringify({
        fileName: `blank_${type}.png`,
        fileMimeType: 'image/png',
        content: base64
      });

      const uploadResponse = await ORIGINAL_FETCH(uploadUrl, {
        method: 'POST',
        headers: uploadHeaders,
        body: uploadBody
      });

      if (!uploadResponse.ok) {
        log('[Aurora] Upload failed', { status: uploadResponse.status }, 'error');
        return null;
      }

      const result = await uploadResponse.json();
      const fileId = result.fileMetadataId;

      if (fileId) {
        log('[Aurora] Upload successful, file ID: ' + fileId);
        setCachedAuroraFileId(type, fileId);
        return fileId;
      }

      log('[Aurora] No file ID in upload response', { result }, 'error');
      return null;
    } catch (error) {
      log('[Aurora] Upload error: ' + error.message, {}, 'error');
      return null;
    }
  }

  const ORIGINAL_FETCH = window.fetch.bind(window);

  function postBridgeMessage(type, payload) {
    try {
      window.postMessage({
        source: 'gvp-fetch-interceptor',
        type,
        payload
      }, '*');
    } catch (error) {
      console.error('[GVP][Interceptor][Page] Failed to post bridge message:', error);
    }
  }

  function log(message, extras = {}, level = 'info') {
    postBridgeMessage('GVP_FETCH_LOG', {
      level,
      message,
      extras
    });
  }

  function serializeHeaders(source) {
    if (!source) return null;
    const snapshot = {};
    const assign = (key, value) => {
      if (!key) return;
      snapshot[String(key).toLowerCase()] = value;
    };

    if (typeof Headers !== 'undefined' && source instanceof Headers) {
      source.forEach((value, key) => assign(key, value));
      return snapshot;
    }

    if (Array.isArray(source)) {
      source.forEach(entry => {
        if (!entry) return;
        if (Array.isArray(entry) && entry.length >= 2) {
          assign(entry[0], entry[1]);
        } else if (entry && typeof entry === 'object') {
          assign(entry.name, entry.value);
        }
      });
      return snapshot;
    }

    if (typeof source === 'object') {
      Object.entries(source).forEach(([key, value]) => assign(key, value));
      return snapshot;
    }

    return null;
  }

  function updateSpicyState(nextState, meta = {}) {
    const normalized = !!nextState;
    if (useSpicyMode === normalized) {
      return;
    }
    useSpicyMode = normalized;
    log('Updated spicy mode state from extension', { useSpicyMode, ...meta }, 'debug');
  }

  function requestStateSync(reason) {
    postBridgeMessage('GVP_FETCH_STATE_REQUEST', { reason });
  }

  function sanitizeMessage(message) {
    return message.replace(MODE_TOKEN_REGEX, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  function modifyRequestPayload(init, context = {}) {
    if (!init || typeof init !== 'object') {
      return { modified: false, reason: 'no-init' };
    }

    if (typeof init.body !== 'string') {
      return { modified: false, reason: 'non-string-body' };
    }

    let payload;
    try {
      payload = JSON.parse(init.body);
    } catch (error) {
      log('Failed to parse request body JSON', {
        error: error?.message,
        url: context.url
      }, 'error');
      return { modified: false, reason: 'invalid-json' };
    }

    if (!payload || typeof payload !== 'object') {
      return { modified: false, reason: 'invalid-payload' };
    }

    const hadMessage = typeof payload.message === 'string';
    const originalMessage = hadMessage ? payload.message : '';
    const sanitized = hadMessage ? sanitizeMessage(originalMessage) : '';

    const modeMatch = hadMessage ? (originalMessage.match(MODE_TOKEN_REGEX) || [])[0] : '';
    const originalModeToken = (modeMatch || '').trim();

    const now = Date.now();
    let promptText = '';
    if (bridgedPrompt.text && (now - bridgedPrompt.ts) <= PROMPT_TTL_MS) {
      promptText = String(bridgedPrompt.text || '');
      bridgedPrompt.text = '';
      bridgedPrompt.ts = 0;
      log('[Bridge] Using prompt from extension', { length: promptText.length }, 'debug');
    }

    let base = sanitized;
    if (promptText) {
      // NEW v1.21.41: Append prompt AFTER the URL instead of replacing
      // This matches the working Payloadmod.js pattern
      // Original: "https://assets.grok.com/.../content --mode=normal"
      // Result:   "https://assets.grok.com/.../content PROMPT_HERE --mode=normal"
      base = `${sanitized} ${promptText}`.trim();
      log('[Bridge] Appending prompt after URL', { promptLength: promptText.length });
    }
    if (!base && hadMessage) {
      base = originalMessage.trim();
    }

    let newMessage = base;
    if (useSpicyMode) {
      newMessage = `${base} --mode=extremely-spicy-or-crazy`.trim();
    } else if (originalModeToken) {
      newMessage = `${base} ${originalModeToken}`.trim();
    }


    if (!hadMessage && !promptText) {
      return { modified: false, reason: 'no-message-and-no-bridge' };
    }

    if (newMessage === originalMessage.trim()) {
      return { modified: false, reason: 'no-change' };
    }

    payload.message = newMessage;
    init.body = JSON.stringify(payload);

    return {
      modified: true,
      mode: useSpicyMode ? 'extremely-spicy-or-crazy' : (originalModeToken || null),
      promptApplied: !!promptText,
      originalMessage,
      newMessage
    };
  }

  async function processResponseBody(response, context) {
    try {
      log('Starting streaming response processing', context, 'debug');

      const reader = response.body.getReader();
      let buffer = '';
      let lineIndex = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          log('Stream finished', context, 'debug');
          break;
        }

        // Decode chunk and add to buffer
        const chunkText = new TextDecoder().decode(value, { stream: true });
        buffer += chunkText;

        // Process complete lines from buffer
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const rawLine of lines) {
          const trimmedLine = rawLine.trim();
          if (!trimmedLine) {
            continue;
          }

          let jsonString = trimmedLine;
          if (trimmedLine.startsWith('data: ')) {
            jsonString = trimmedLine.substring(6);
          }

          if (!jsonString) {
            continue;
          }

          try {
            const payload = JSON.parse(jsonString);
            const videoData = payload?.result?.response?.streamingVideoGenerationResponse;
            if (!videoData) {
              continue;
            }

            log(`Stream progress: ${videoData.progress}%`, { videoId: videoData.videoId, url: context.url }, 'debug');

            const progressPayload = {
              progress: videoData.progress,
              moderated: videoData.moderated === true,
              videoId: videoData.videoId || null,
              mode: videoData.mode || null,
              imageReference: videoData.imageReference || null,
              modelName: videoData.modelName || null,
              index: lineIndex,
              url: context.url,
              raw: jsonString,
              requestId: context?.requestId || null
            };
            postBridgeMessage('GVP_FETCH_PROGRESS', progressPayload);

            if (videoData.progress === 100) {
              log('Video generation completed', { videoId: videoData.videoId, moderated: videoData.moderated }, 'debug');
              postBridgeMessage('GVP_FETCH_VIDEO_PROMPT', {
                videoPrompt: videoData.videoPrompt || '',
                videoUrl: videoData.videoUrl || '',
                assetId: videoData.assetId || '',
                progress: videoData.progress,
                videoId: videoData.videoId || null,
                mode: videoData.mode || null,
                imageReference: videoData.imageReference || null,
                modelName: videoData.modelName || null,
                moderated: videoData.moderated === true,
                raw: jsonString,
                url: context.url,
                requestId: context?.requestId || null
              });
            }

            lineIndex++;
          } catch (error) {
            log('Failed to parse JSON line from stream', {
              error: error?.message,
              index: lineIndex,
              preview: jsonString.substring(0, 200),
              url: context.url
            }, 'error');
          }
        }
      }

      // Process any remaining data in buffer
      if (buffer.trim()) {
        log('Processing final buffer data', { preview: buffer.substring(0, 100) }, 'debug');
        // Same processing logic for final buffer if needed
      }

    } catch (error) {
      log('processResponseBody failed', {
        error: error?.message,
        url: context.url
      }, 'error');
    }
  }

  function handleExtensionMessage(event) {
    if (event.source !== window || !event.data) {
      return;
    }

    const { source, type, payload } = event.data;
    if (source !== 'gvp-extension') {
      return;
    }

    switch (type) {
      case 'GVP_STATE_UPDATE':
        updateSpicyState(payload?.useSpicy, { origin: 'state-update' });
        break;
      case 'GVP_STATE_BROADCAST':
        updateSpicyState(payload?.useSpicy, { origin: 'state-broadcast' });
        break;
      case 'GVP_PROMPT_STATE': {
        const text = typeof payload?.promptText === 'string' ? payload.promptText : '';
        const isRaw = !!payload?.isRaw;
        bridgedPrompt = { text, isRaw, ts: Date.now() };
        log('[Bridge] 📥 Received prompt state from extension', { length: text.length, isRaw }, 'debug');
        break;
      }
      case 'GVP_AURORA_STATE':
        if (payload) {
          auroraEnabled = Boolean(payload.enabled);
          auroraAspectRatio = payload.aspectRatio || 'square';
          auroraImageMode = payload.imageMode || 'blank';
          auroraBlankPngs = payload.blankPngs || auroraBlankPngs;
          auroraCustomImages = payload.customImages || auroraCustomImages;
          log('[Aurora] 📥 Received state from extension', {
            enabled: auroraEnabled,
            aspectRatio: auroraAspectRatio,
            imageMode: auroraImageMode,
            hasBlankSquare: !!auroraBlankPngs.square,
            hasBlankPortrait: !!auroraBlankPngs.portrait,
            hasBlankLandscape: !!auroraBlankPngs.landscape,
            hasCustomSquare: !!auroraCustomImages.square,
            hasCustomPortrait: !!auroraCustomImages.portrait,
            hasCustomLandscape: !!auroraCustomImages.landscape
          });
        }
        break;
      default:
        log('Received unhandled message from extension', { type }, 'debug');
    }
  }

  window.addEventListener('message', handleExtensionMessage, false);

  postBridgeMessage('GVP_FETCH_READY', { installedAt: Date.now() });
  requestStateSync('initial');

  window.fetch = async function (...args) {
    let input = args[0];
    let init = args.length > 1 ? args[1] : undefined;

    let url = '';
    if (typeof input === 'string') {
      url = input;
    } else if (input && typeof input.url === 'string') {
      url = input.url;
    }

    const method = (init && init.method ? init.method : (input && input.method) || 'GET').toUpperCase();
    const isTarget = typeof url === 'string' &&
      url.includes('/rest/app-chat/conversations/new') &&
      method === 'POST';
    const isResponsesTarget = typeof url === 'string' &&
      url.includes('/responses') &&
      method === 'POST';
    const isGalleryTarget = typeof url === 'string' &&
      url.includes('/rest/media/post/list') &&
      method === 'POST';
    const isSystemPromptList = typeof url === 'string' &&
      url.includes('/rest/system-prompt/list') &&
      method === 'POST';

    // NEW: Notify extension when system-prompt/list is called (startup signal)
    if (isSystemPromptList) {
      console.log('[GVP Interceptor] 🔔 system-prompt/list detected, sending bridge message');
      postBridgeMessage('GVP_SYSTEM_PROMPT_LIST', {
        url,
        timestamp: Date.now()
      });
    }

    // FALLBACK: Also trigger on first gallery /list call (for pages that don't call system-prompt)
    if (isGalleryTarget && !window._gvpBulkSyncTriggered) {
      window._gvpBulkSyncTriggered = true;
      console.log('[GVP Interceptor] 🔔 First gallery /list detected, triggering bulk sync');
      postBridgeMessage('GVP_TRIGGER_BULK_SYNC', {
        url,
        timestamp: Date.now()
      });
    }

    if (typeof url === 'string' && method === 'GET' && url.includes('/content')) {
      postBridgeMessage('GVP_FETCH_CONTENT_REQUEST', {
        url,
        method
      });
    }

    let bridgeId = null;
    let requestInit = init && typeof init === 'object' ? init : null;
    let capturedHeaders = null;

    if (isTarget) {
      log('Intercepting /conversations/new request', { url, method });
      bridgeId = `mg_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;

      if (!requestInit) {
        requestInit = {};
        if (args.length <= 1) {
          args.push(requestInit);
        } else {
          args[1] = requestInit;
        }
        init = requestInit;
      }

      // Check if Aurora will handle this request (skip mode injection if so)
      let auroraWillInject = false;
      if ((isTarget || isResponsesTarget) && auroraEnabled && requestInit && requestInit.body) {
        try {
          const checkBody = JSON.parse(requestInit.body);
          auroraWillInject = checkBody.enableImageGeneration && (!checkBody.fileAttachments || checkBody.fileAttachments.length === 0);
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Only apply mode injection if Aurora is NOT handling the request
      if (requestInit && !auroraWillInject) {
        const modification = modifyRequestPayload(requestInit, { url });
        if (modification.modified) {
          args[1] = requestInit;
          log('Modified request message', { url, mode: modification.mode, promptApplied: modification.promptApplied === true });
          postBridgeMessage('GVP_FETCH_REQUEST_MODIFIED', {
            url,
            mode: modification.mode,
            promptApplied: modification.promptApplied === true,
            originalMessagePreview: modification.originalMessage?.substring(0, 120) || null,
            newMessagePreview: modification.newMessage?.substring(0, 120) || null
          });
        } else if (modification.reason !== 'already-desired-mode') {
          log('Request message not modified', { url, reason: modification.reason }, 'debug');
        }
      } else if (auroraWillInject) {
        log('[Aurora] Skipping mode injection - Aurora will handle this request', { url });
      } else if (typeof Request !== 'undefined' && input instanceof Request) {
        log('Cannot modify Request object body; skipping spicy rewrite', { url }, 'warn');
      }

      capturedHeaders = serializeHeaders(requestInit?.headers) ||
        (typeof Request !== 'undefined' && input instanceof Request ? serializeHeaders(input.headers) : null);
    }

    // DEBUG: Log Aurora state on EVERY relevant request
    if (isTarget || isResponsesTarget) {
      const endpoint = isTarget ? '/conversations/new' : '/responses';
      log(`[Aurora] 🔍 Checking ${endpoint} request`, {
        url,
        auroraEnabled,
        auroraAspectRatio,
        hasSquarePng: !!auroraBlankPngs.square,
        hasPortraitPng: !!auroraBlankPngs.portrait,
        hasLandscapePng: !!auroraBlankPngs.landscape
      });
    }

    // Aurora injection for BOTH /conversations/new AND /responses
    if ((isTarget || isResponsesTarget) && auroraEnabled) {
      const endpoint = isTarget ? '/conversations/new' : '/responses';
      log(`[Aurora] ✅ Aurora ENABLED - Intercepting ${endpoint} request`, { url });

      if (!requestInit) {
        requestInit = {};
        if (args.length <= 1) {
          args.push(requestInit);
        } else {
          args[1] = requestInit;
        }
        init = requestInit;
      }

      if (requestInit && requestInit.body && typeof requestInit.body === 'string') {
        try {
          const body = JSON.parse(requestInit.body);
          log('[Aurora] Parsed body', { enableImageGeneration: body.enableImageGeneration, hasFileAttachments: body.fileAttachments && body.fileAttachments.length > 0 });

          // Only inject if enableImageGeneration is true AND no existing fileAttachments
          if (body.enableImageGeneration && (!body.fileAttachments || body.fileAttachments.length === 0)) {
            log('[Aurora] Conditions met for injection');

            // Detect aspect ratio
            let aspectType = auroraAspectRatio || 'square';
            if (aspectType === 'square' && body.message) {
              const lowerMessage = body.message.toLowerCase();
              if (lowerMessage.includes('portrait') || lowerMessage.includes('vertical')) {
                aspectType = 'portrait';
                log('[Aurora] Auto-detected portrait aspect');
              } else if (lowerMessage.includes('landscape') || lowerMessage.includes('horizontal')) {
                aspectType = 'landscape';
                log('[Aurora] Auto-detected landscape aspect');
              }
            }
            log('[Aurora] Using aspect type:', aspectType);

            // Get cached file ID or upload new blank PNG
            let fileId = getCachedAuroraFileId(aspectType);

            if (!fileId) {
              log('[Aurora] No cached file ID, attempting upload...');
              fileId = await uploadAuroraBlankPNG(aspectType);
            } else {
              log('[Aurora] Using cached file ID: ' + fileId);
            }

            if (!fileId) {
              log('[Aurora] Failed to obtain file ID, aborting injection', {}, 'error');
            } else {
              // Inject file attachment
              body.fileAttachments = [fileId];
              log('[Aurora] ✅ Injected fileAttachments: ' + fileId);

              // Add edit intent prefix if not present
              if (body.message) {
                const lowerMessage = body.message.toLowerCase();
                const hasEditIntent = lowerMessage.includes('edit') || lowerMessage.includes('modify') || lowerMessage.includes('change');
                if (!hasEditIntent) {
                  const originalMessage = body.message;
                  body.message = `Edit this image to show: ${body.message}`;
                  log('[Aurora] ✅ Added edit intent prefix:', { original: originalMessage, modified: body.message });
                } else {
                  log('[Aurora] Message already has edit intent');
                }
              }

              // Re-stringify the modified body
              requestInit.body = JSON.stringify(body);
              args[1] = requestInit;
              log('[Aurora] ✅ Aurora injection complete!');
            }

          } else {
            log('[Aurora] Skipping injection - conditions not met');
          }
        } catch (e) {
          log('[Aurora] Failed to parse/modify body', { error: e.message }, 'error');
        }
      }
    }

    let response;
    try {
      response = await ORIGINAL_FETCH(...args);
    } catch (error) {
      if (isTarget) {
        log('Original fetch threw error', { error: error?.message, url }, 'error');
      }
      throw error;
    }

    if (isTarget) {
      log('Processing /conversations/new response', {
        url,
        status: response?.status,
        ok: response?.ok,
        type: response?.type
      });

      try {
        postBridgeMessage('GVP_FETCH_CONVERSATION_REQUEST', {
          id: bridgeId,
          url,
          method,
          headers: capturedHeaders,
          body: typeof requestInit?.body === 'string' ? requestInit.body : null,
          status: response?.status,
          ok: response?.ok
        });
      } catch (bridgeError) {
        log('Failed to post bridge conversation request', { error: bridgeError?.message }, 'warn');
      }

      try {
        postBridgeMessage('GVP_FETCH_CONVERSATION_RESPONSE', {
          id: bridgeId,
          url,
          status: response?.status,
          ok: response?.ok,
          type: response?.type,
          redirected: response?.redirected ?? false
        });
      } catch (bridgeError) {
        log('Failed to post bridge conversation response', { error: bridgeError?.message }, 'warn');
      }

      if (response && typeof response.clone === 'function') {
        try {
          const cloned = response.clone();
          processResponseBody(cloned, { url, requestId: bridgeId }).catch(error => {
            log('processResponseBody promise rejected', { error: error?.message, url }, 'error');
          });
        } catch (error) {
          log('Failed to clone response for processing', {
            error: error?.message,
            url
          }, 'error');
        }
      } else {
        log('Response clone not available on intercepted fetch', { url }, 'warn');
      }
    }

    if (isGalleryTarget) {
      log('Processing /rest/media/post/list response', {
        url,
        status: response?.status,
        ok: response?.ok
      });

      if (response && typeof response.clone === 'function') {
        try {
          const cloned = response.clone();
          Promise.resolve(cloned.text())
            .then(text => {
              if (!text) {
                log('Gallery response empty', { url }, 'warn');
                return;
              }
              let payload;
              try {
                payload = JSON.parse(text);
              } catch (error) {
                log('Gallery response JSON parse failed', {
                  error: error?.message,
                  preview: text.substring(0, 200)
                }, 'error');
                return;
              }
              postBridgeMessage('GVP_FETCH_GALLERY_DATA', {
                url,
                method,
                payload,
                length: Array.isArray(payload?.result?.posts) ? payload.result.posts.length : Array.isArray(payload?.posts) ? payload.posts.length : 0
              });
            })
            .catch(error => {
              log('Gallery response read failed', { error: error?.message, url }, 'error');
            });
        } catch (error) {
          log('Failed to clone gallery response', { error: error?.message, url }, 'error');
        }
      }
    }

    return response;
  };

  log('Page fetch interceptor installed');
})();
