'use strict';

// Runs at document-start in the REAL managed Chrome tab, via the DevTools
// Protocol. This is not an installed browser extension or page plugin.
// No Electron/Node APIs are exposed to third-party webpages.
function injected() {
  if (globalThis.__WalledGuardInstalled) return;
  const host = location.hostname.toLowerCase();
  const chatgpt = host === 'chatgpt.com' || host === 'www.chatgpt.com';
  const perplexity = host === 'perplexity.ai' || host === 'www.perplexity.ai';
  if (!chatgpt && !perplexity) return;
  globalThis.__WalledGuardInstalled = true;

  const MARKER = 'WALLED_SENSITIVE';
  const assistantColor = '#1263d6';
  let nextId = 0;
  let filesInFlight = 0;
  let promptInFlight = false;
  let promptApproval = null;
  const pending = new Map();
  const fileGates = new WeakMap();
  const replayEvents = new WeakSet();
  const approvedFileNames = new Map();

  const editorSelectors = chatgpt ? [
    '#prompt-textarea', '[data-testid="composer-root"] [contenteditable="true"]',
    '[data-composer-markdown][contenteditable="true"]', '.ProseMirror[role="textbox"]',
    'form textarea', 'form [contenteditable="true"]'
  ] : [
    '#ask-input[contenteditable="true"]', '[data-ask-input-container] [contenteditable="true"]',
    '[data-lexical-editor="true"][contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
    'textarea', 'form [contenteditable="true"]'
  ];
  const sendSelectors = chatgpt ? [
    'button[data-testid="send-button"]', 'button[data-testid="composer-send-button"]',
    'button[aria-label="Send prompt"]', 'button[aria-label="Send message"]',
    'form button[type="submit"]'
  ] : [
    'button[data-testid="submit-button"]', 'button[aria-label="Submit"]',
    'button[aria-label="Send"]', 'button[aria-label="Ask"]',
    'form button[type="submit"]'
  ];
  // ChatGPT and Perplexity are SPAs and frequently change the wrappers used
  // for model answers. Style known assistant roots broadly, then mark their
  // text blocks. Never use generic article/p selectors: those also color the
  // user's own prompts and unrelated navigation.
  const responseRootSelectors = chatgpt ? [
    '[data-message-author-role="assistant"]', 'article[data-turn="assistant"]',
    'section[data-turn="assistant"]', '[data-conversation-role="assistant"]',
    '[data-testid="assistant-message"]', '.agent-turn'
  ] : [
    '[data-workflow-final-text]', '[data-testid="answer"]',
    '[data-testid="answer-content"]', '[data-testid="perplexity-answer"]',
    '[data-testid="assistant-message"]', '[data-message-author-role="assistant"]',
    '[data-testid="assistant"]', '[data-renderer="lm"]'
  ];
  const responseTextSelector = '.markdown, .prose, [data-testid="markdown"], [class*="markdown"], [class*="prose"], [data-workflow-final-text]';
  const rootSelectors = responseRootSelectors.join(',');
  // Large SPAs occasionally assign their text nodes inline !important colors
  // (or a custom -webkit-text-fill-color). Author-level CSS alone can lose.
  // Constrain inline overrides to known assistant-answer regions only.
  const excludedResponseUi = 'button,[role="button"],[role="toolbar"],input,textarea,select,[contenteditable="true"],svg,[data-testid*="action"],[data-testid*="feedback"]';
  const userContent = '[data-message-author-role="user"],[data-turn="user"],[data-testid="user-message"]';
  function isAnswerTextNode(el) {
    return !!el?.style && !el.closest(excludedResponseUi) && !el.closest(userContent) &&
      !el.matches('script,style,noscript,img,video,canvas,iframe');
  }
  function forceBlueText(root) {
    // Color the *entire assistant answer subtree*, not only descendants named
    // .markdown/.prose. Recent ChatGPT builds put rendered answer text in
    // siblings of those wrappers; the old hotfix colored the wrapper but left
    // what the user actually saw black.
    const stack = [root];
    let styled = 0;
    while (stack.length) {
      const el = stack.pop();
      if (isAnswerTextNode(el)) {
        if (el.style.getPropertyValue('color') !== assistantColor ||
            el.style.getPropertyPriority('color') !== 'important') {
          el.style.setProperty('color', assistantColor, 'important');
        }
        if (el.style.getPropertyValue('-webkit-text-fill-color') !== assistantColor ||
            el.style.getPropertyPriority('-webkit-text-fill-color') !== 'important') {
          el.style.setProperty('-webkit-text-fill-color', assistantColor, 'important');
        }
        styled++;
      }
      // Open shadow roots are rare on these sites but can own answer text.
      // Never enter a button/toolbar/editable region just to recolor it.
      if (!isAnswerTextNode(el)) continue;
      if (el.shadowRoot) stack.push(...el.shadowRoot.children);
      stack.push(...el.children);
    }
    return styled;
  }
  const colorCss = `
    :is(${rootSelectors}),
    :is(${rootSelectors}) :is(p,li,span,strong,em,b,i,h1,h2,h3,h4,h5,h6,a,pre,code,blockquote,td,th,div),
    .walledguard-ai-response,
    .walledguard-ai-response :not(button,button *,[role="button"],[role="button"] *,svg,svg *,input,textarea)
      {color:${assistantColor}!important;-webkit-text-fill-color:${assistantColor}!important;}
  `;

  function ensureStyle() {
    if (!document.documentElement) return;
    if (document.getElementById('walledguard-response-style')) return;
    const style = document.createElement('style');
    style.id = 'walledguard-response-style';
    style.textContent = colorCss;
    (document.head || document.documentElement).append(style);
  }
  function decorateResponses() {
    if (!document.querySelectorAll) return 0;
    let count = 0;
    for (const root of document.querySelectorAll(rootSelectors)) {
      if (!root.classList.contains('walledguard-ai-response')) root.classList.add('walledguard-ai-response');
      // Always include the root and all its legitimate answer descendants.
      // A .markdown element elsewhere within the same root must not prevent
      // styling a visible answer paragraph that is outside that wrapper.
      forceBlueText(root);
      count++;
    }
    return count;
  }
  globalThis.__WalledGuardRefreshColors = function() {
    ensureStyle();
    return decorateResponses();
  };
  globalThis.__WalledGuardColorReport = function() {
    // Inspect actual visible text leaves rather than reporting the first
    // matching (potentially empty/hidden) assistant wrapper. No prompt or
    // answer contents, URLs, or personal data are returned to the controller.
    const roots = [...document.querySelectorAll(rootSelectors)];
    let visibleTextNodes = 0;
    let blueTextNodes = 0;
    let otherTextNodes = 0;
    let firstOther = null;
    let firstBlue = null;
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent.trim()) continue;
        const el = node.parentElement;
        if (!isAnswerTextNode(el)) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        if (![...range.getClientRects()].some(rect => rect.width > 1 && rect.height > 1 &&
            rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight)) continue;
        const computed = getComputedStyle(el);
        const sample = { color: computed.color, textFillColor: computed.webkitTextFillColor, tag: el.tagName.toLowerCase() };
        visibleTextNodes++;
        if (computed.color === 'rgb(18, 99, 214)' && computed.webkitTextFillColor === 'rgb(18, 99, 214)') {
          blueTextNodes++;
          firstBlue ||= sample;
        } else {
          otherTextNodes++;
          firstOther ||= sample;
        }
      }
    }
    const sample = firstOther || firstBlue || { color: null, textFillColor: null };
    return { roots: roots.length, visibleTextNodes, blueTextNodes, otherTextNodes,
      color: sample.color, textFillColor: sample.textFillColor, firstOther };
  };
  function refreshResponseStyle() { ensureStyle(); decorateResponses(); }
  refreshResponseStyle();
  document.addEventListener('DOMContentLoaded', refreshResponseStyle);
  // Only track added/removed nodes, not style class mutations we make.
  let scheduled = false;
  const rootObserver = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; refreshResponseStyle(); });
  });
  if (document.documentElement) rootObserver.observe(document.documentElement, { childList: true, subtree: true });
  else document.addEventListener('DOMContentLoaded', () => {
    rootObserver.observe(document.documentElement, { childList: true, subtree: true });
  }, { once: true });
  // Backstop for SPA page transitions that reuse a previously styled element.
  setInterval(refreshResponseStyle, 1800);

  function visible(el) { return !!el?.isConnected && el.getClientRects().length > 0; }
  function editorNear(near) {
    let parent = near instanceof Element ? near : null;
    for (let depth = 0; parent && depth < 9; parent = parent.parentElement, depth++) {
      for (const selector of editorSelectors) {
        const matches = [...parent.querySelectorAll(selector)].filter(visible);
        if (matches.length === 1) return matches[0];
      }
    }
    const active = document.activeElement;
    const activeEditor = active?.closest?.('[contenteditable="true"]') || active;
    if (activeEditor && editorSelectors.some(s => activeEditor.matches?.(s))) return activeEditor;
    for (const selector of editorSelectors) {
      const found = [...document.querySelectorAll(selector)].find(visible);
      if (found) return found;
    }
    return null;
  }
  function editorText(el) {
    if (!el) return '';
    return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el.value : (el.innerText || el.textContent || '');
  }
  function isSendButton(el) {
    if (!el || !visible(el)) return false;
    if (sendSelectors.some(s => el.matches(s))) return true;
    const attrs = [el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('data-testid'), el.textContent?.trim().slice(0, 60)]
      .filter(Boolean).join(' ');
    if (/\b(stop|cancel|mic|record|upload|attach|feedback|menu)\b/i.test(attrs)) return false;
    if (/\b(send|submit|ask)\b/i.test(attrs)) return true;
    return el.matches('button[type="submit"],input[type="submit"]') &&
      !!el.closest('form')?.querySelector('textarea,[contenteditable="true"]');
  }
  function stop(e) { e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); }
  function transmit(message) {
    if (typeof globalThis.__WalledGuardBridge !== 'function') return false;
    try { globalThis.__WalledGuardBridge(JSON.stringify(message)); return true; }
    catch (_) { return false; }
  }
  function isApproved(text) {
    return !!promptApproval && promptApproval.text === text && promptApproval.expires > Date.now();
  }
  function requestPrompt(text, type, target, editor, event) {
    if (promptInFlight) return;
    promptInFlight = true;
    const id = `p${++nextId}`;
    pending.set(id, { type, target, editor, text });
    if (!transmit({ id, kind: 'prompt', text, action: type })) {
      pending.delete(id);
      promptInFlight = false;
    }
  }
  function onKey(e) {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const editor = editorNear(e.target);
    if (!editor || (e.target !== editor && !editor.contains(e.target))) return;
    const text = editorText(editor);
    if (filesInFlight > 0 || (text.includes(MARKER) && !isApproved(text))) {
      stop(e);
      if (filesInFlight === 0) requestPrompt(text, 'key', editor, editor, e);
    }
  }
  function onClick(e) {
    const btn = e.target?.closest?.('button,[role="button"],input[type="submit"]');
    if (!isSendButton(btn)) return;
    const editor = editorNear(btn);
    const text = editorText(editor);
    if (filesInFlight > 0 || (text.includes(MARKER) && !isApproved(text))) {
      stop(e);
      if (filesInFlight === 0) requestPrompt(text, 'click', btn, editor, e);
    }
  }
  function onSubmit(e) {
    const form = e.target;
    const editor = editorNear(form);
    const text = editorText(editor);
    if (filesInFlight > 0 || (text.includes(MARKER) && !isApproved(text))) {
      stop(e);
      if (filesInFlight === 0) requestPrompt(text, 'submit', form, editor, e);
    }
  }

  function allowedNames(files) {
    const names = [...files].map(f => f.name);
    const now = Date.now();
    for (const name of names) if ((approvedFileNames.get(name) || 0) < now) return false;
    return names.length > 0;
  }
  // Called by desktop before DOM.setFileInputFiles, which lets Chrome deliver
  // its original browser-generated input/change events without a second check.
  globalThis.__WalledGuardApproveSelectedFiles = function(names) {
    for (const name of names) approvedFileNames.set(name, Date.now() + 15000);
  };

  function readFile(file) {
    return new Promise((resolve, reject) => {
      if (file.size > 32 * 1024 * 1024) { reject(new Error('File is larger than 32 MB')); return; }
      const reader = new FileReader();
      reader.onload = () => resolve({
        name: file.name || 'clipboard-image',
        mime: file.type || '',
        bytes: String(reader.result).split(',')[1] || ''
      });
      reader.onerror = () => reject(new Error('Cannot read selected file'));
      reader.readAsDataURL(file);
    });
  }
  function requestFiles(files, type, target, types) {
    if (!files.length) return;
    filesInFlight++;
    const id = `f${++nextId}`;
    pending.set(id, { type, target, files, types });
    Promise.all(files.map(readFile)).then(payload => {
      if (!transmit({ id, kind: 'files', files: payload })) {
        pending.delete(id); filesInFlight--;
      }
    }).catch(error => {
      if (!transmit({ id, kind: 'file-error', error: error.message })) {
        pending.delete(id); filesInFlight--;
      }
    });
  }
  function onInput(e) {
    if (replayEvents.has(e)) return;
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
    const files = [...(input.files || [])];
    if (!files.length || allowedNames(files)) return;
    stop(e);
    const existing = fileGates.get(input);
    if (existing) { existing.types.add(e.type); return; }
    const record = { types: new Set([e.type]) };
    fileGates.set(input, record);
    requestFiles(files, 'input', input, record.types);
  }
  function onDrop(e) {
    if (replayEvents.has(e)) return;
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    stop(e);
    requestFiles(files, 'drop', e.target, new Set());
  }
  function onPaste(e) {
    if (replayEvents.has(e)) return;
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    stop(e);
    requestFiles(files, 'paste', e.target, new Set());
  }

  // Resolve only on a response from the desktop controller, which owns the
  // native OS dialog. For prompts, return where Chrome must replay trusted input.
  globalThis.__WalledGuardResolve = function(id, approved) {
    const item = pending.get(id);
    if (!item) return { type: 'none' };
    pending.delete(id);
    if (item.type === 'key' || item.type === 'click' || item.type === 'submit') {
      promptInFlight = false;
      if (!approved || editorText(item.editor) !== item.text || !item.target?.isConnected) return { type: 'none' };
      promptApproval = { text: item.text, expires: Date.now() + 2000 };
      if (item.type === 'click') {
        const rect = item.target.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return { type: 'none' };
        return { type: 'click', x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
      if (item.type === 'key') { item.editor.focus(); return { type: 'key' }; }
      // A native form submit is the nearest equivalent for requests generated
      // via form.requestSubmit() rather than clicks/Enter.
      if (item.type === 'submit') { try { item.target.requestSubmit(); } catch (_) {} }
      return { type: 'none' };
    }
    filesInFlight = Math.max(0, filesInFlight - 1);
    if (item.type === 'input') {
      fileGates.delete(item.target);
      if (approved && item.target?.isConnected) {
        for (const type of item.types) {
          const evt = new Event(type, { bubbles: true, cancelable: true, composed: true });
          replayEvents.add(evt);
          item.target.dispatchEvent(evt);
        }
      } else if (item.target) item.target.value = '';
    } else if (approved && item.target?.isConnected) {
      try {
        const dt = new DataTransfer();
        for (const file of item.files) dt.items.add(file);
        const evt = item.type === 'drop'
          ? new DragEvent('drop', { bubbles: true, cancelable: true, composed: true, dataTransfer: dt })
          : new ClipboardEvent('paste', { bubbles: true, cancelable: true, composed: true, clipboardData: dt });
        replayEvents.add(evt);
        item.target.dispatchEvent(evt);
      } catch (_) { /* Do not leak an uninspected file. */ }
    }
    return { type: 'none' };
  };

  window.addEventListener('keydown', onKey, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('submit', onSubmit, true);
  window.addEventListener('input', onInput, true);
  window.addEventListener('change', onInput, true);
  window.addEventListener('drop', onDrop, true);
  window.addEventListener('paste', onPaste, true);
}

const INJECTED_SCRIPT = `(${injected.toString()})();`;
module.exports = { INJECTED_SCRIPT };
