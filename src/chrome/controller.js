'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { CDPConnection } = require('./cdp');
const { findChromeExecutable } = require('./chrome-path');
const { INJECTED_SCRIPT } = require('./injected');
const { BLUE_RESPONSE_CSS } = require('./response-style');
const { isProtectedWebApp, requiresHttpCheck, describeHttpBody } = require('./request-policy');
const { ApprovalStore } = require('../interception/request-guard');
const { MARKER } = require('../inspection/marker');

const SITES = Object.freeze({ chatgpt: 'https://chatgpt.com/', perplexity: 'https://www.perplexity.ai/' });
const FETCH_PATTERNS = ['*://chatgpt.com/*', '*://*.chatgpt.com/*', '*://perplexity.ai/*', '*://*.perplexity.ai/*', '*://*.openai.com/*', '*://*.oaiusercontent.com/*']
  .flatMap(urlPattern => ['XHR', 'Fetch'].map(resourceType => ({ urlPattern, resourceType, requestStage: 'Request' })));

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function readDebugPort(profileDir, child, timeoutMs = 20000) {
  const portFile = path.join(profileDir, 'DevToolsActivePort');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Google Chrome exited before monitoring could start.');
    try {
      const content = await fsp.readFile(portFile, 'utf8');
      const [portRaw, wsPath] = content.trim().split(/\r?\n/);
      const port = Number(portRaw);
      if (port > 0 && port <= 65535 && wsPath?.startsWith('/devtools/browser/')) {
        return `ws://127.0.0.1:${port}${wsPath}`;
      }
    } catch (_) { /* Chrome still launching */ }
    await sleep(120);
  }
  throw new Error('Google Chrome did not open its localhost debugging port. Check its install and profile permissions.');
}

function safeNetworkTarget(url) {
  try {
    const { hostname, pathname } = new URL(url);
    const endpoint = pathname.startsWith('/backend-api/') ? '/backend-api' :
      pathname.startsWith('/api/') ? '/api' : '/request';
    // Never log arbitrary URL paths: they sometimes contain conversation IDs.
    return hostname + endpoint;
  } catch (_) { return 'unknown target'; }
}

class ChromeController extends EventEmitter {
  constructor({ userDataPath, onConfirm, onInspectFiles, onSelectFiles, onFileError, onScanPaths, chromePath, chromeFlags = [] }) {
    super();
    this.userDataPath = userDataPath;
    this.onConfirm = onConfirm;
    this.onInspectFiles = onInspectFiles;
    this.onSelectFiles = onSelectFiles;
    this.onFileError = onFileError;
    this.onScanPaths = onScanPaths;
    this.chromePath = chromePath;
    this.chromeFlags = chromeFlags;
    this.cdp = null;
    this.child = null;
    this.signInChild = null;
    this.signInMode = false;
    this.stopping = false;
    this.sessions = new Map();       // target ID => session metadata
    this.bySession = new Map();
    this.initializing = new Map();
    this.approvals = new ApprovalStore();
    this.openTargets = new Map();
  }

  report(text) { this.emit('status', text); }
  activity(text) { this.emit('activity', text); }

  async launch(site = 'chatgpt') {
    if (this.signInMode) throw new Error('DLP is paused for sign-in. Click Finish sign-in & resume protection first.');
    if (this.cdp && !this.cdp.closed) return this.open(site);
    const executable = this.chromePath || findChromeExecutable();
    if (!executable) throw new Error('Google Chrome is not installed. Install Chrome or set WALLEDGUARD_CHROME_PATH to its executable.');
    this.stopping = false;
    const profileDir = path.join(this.userDataPath, 'managed-chrome-profile');
    await fsp.mkdir(profileDir, { recursive: true, mode: 0o700 });
    // Do not attach to the user's everyday Chrome profile. Chrome >=136
    // intentionally refuses remote debugging of its default data directory.
    const portFile = path.join(profileDir, 'DevToolsActivePort');
    await fsp.rm(portFile, { force: true });
    const args = [
      `--user-data-dir=${profileDir}`,
      '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
      '--no-first-run', '--no-default-browser-check',
      '--new-window', ...this.chromeFlags, 'about:blank'
    ];
    this.report('Launching dedicated Google Chrome…');
    this.child = spawn(executable, args, { stdio: 'ignore', windowsHide: false });
    this.child.on('error', err => this.emit('error', new Error(`Chrome launch failed: ${err.message}`)));
    try {
      const url = await readDebugPort(profileDir, this.child);
      this.cdp = await new CDPConnection(url).connect();
      this.cdp.on('event', event => this.handleEvent(event));
      this.cdp.on('disconnected', error => {
        if (!this.stopping) {
          this.report('Disconnected — closing managed Chrome to prevent unmonitored use');
          this.emit('error', error);
          this.stop();
        }
      });
      await this.cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
      await this.cdp.send('Target.setDiscoverTargets', { discover: true });
      this.report('Chrome connected; installing DLP monitoring…');
      await this.open(site);
      this.report('Protected Chrome browser ready');
      this.activity('Connected to a dedicated Chrome profile.');
      return true;
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  async open(site) {
    if (this.signInMode) throw new Error('DLP is paused for sign-in. Resume protection first.');
    if (!SITES[site]) throw new Error('Unknown supported site.');
    if (!this.cdp || this.cdp.closed) return this.launch(site);
    const previous = this.openTargets.get(site);
    if (previous && this.sessions.has(previous)) {
      const info = this.sessions.get(previous);
      try {
        if (!isProtectedWebApp(info.url)) await this.cdp.send('Page.navigate', { url: SITES[site] }, info.sessionId);
        await this.cdp.send('Page.bringToFront', {}, info.sessionId);
        this.activity(`Switched to ${site}.`);
        return;
      } catch (_) { this.openTargets.delete(site); }
    }
    // Start on about:blank; inject at document-start before navigating.
    const { targetId } = await this.cdp.send('Target.createTarget', { url: 'about:blank' });
    const session = await this.waitForSession(targetId);
    await this.cdp.send('Page.navigate', { url: SITES[site] }, session.sessionId);
    await this.cdp.send('Page.bringToFront', {}, session.sessionId);
    this.openTargets.set(site, targetId);
    this.activity(`Opened ${site} in protected Google Chrome.`);
  }

  async waitForSession(targetId) {
    const started = Date.now();
    let manualAttached = false;
    while (Date.now() - started < 12000) {
      const session = this.sessions.get(targetId);
      if (session) {
        await this.initializing.get(targetId);
        return session;
      }
      if (!manualAttached && Date.now() - started > 900) {
        manualAttached = true;
        try { await this.cdp.send('Target.attachToTarget', { targetId, flatten: true }); }
        catch (_) { /* automatic attachment may already be in progress */ }
      }
      await sleep(80);
    }
    throw new Error('Chrome page could not be connected to WalledGuard monitoring.');
  }

  handleEvent(event) {
    const { method, params = {}, sessionId } = event;
    if (method === 'Target.attachedToTarget') {
      this.attach(params).catch(error => this.emit('error', error));
    } else if (method === 'Target.detachedFromTarget') {
      const info = this.bySession.get(params.sessionId);
      if (info) { this.sessions.delete(info.targetId); this.bySession.delete(params.sessionId); }
    } else if (method === 'Target.targetInfoChanged') {
      const info = this.sessions.get(params.targetInfo?.targetId);
      if (info) info.url = params.targetInfo.url;
    } else if (method === 'Runtime.bindingCalled' && sessionId && params.name === '__WalledGuardBridge') {
      this.handleBridge(sessionId, params).catch(error => this.emit('error', error));
    } else if (method === 'Page.fileChooserOpened' && sessionId) {
      this.handleFileChooser(sessionId, params).catch(error => this.emit('error', error));
    } else if (method === 'Fetch.requestPaused' && sessionId) {
      this.handlePausedRequest(sessionId, params).catch(error => this.emit('error', error));
    } else if (method === 'Page.domContentEventFired' && sessionId) {
      this.installResponseStyles(sessionId).catch(error => {
        this.activity(`Response styling diagnostics: ${String(error.message).slice(0, 100)}`);
      });
    } else if (method === 'Network.responseReceived' && sessionId) {
      const code = params.response?.status;
      if (code >= 400 && ['XHR', 'Fetch'].includes(params.type)) {
        this.activity(`HTTP ${code}: ${safeNetworkTarget(params.response.url)} (no request content logged)`);
      }
    } else if (method === 'Network.loadingFailed' && sessionId && params.errorText) {
      if (params.errorText !== 'net::ERR_ABORTED') this.activity(`Network failure: ${params.errorText}`);
    }
  }

  async attach({ sessionId, targetInfo, waitingForDebugger }) {
    if (!sessionId || !targetInfo) return;
    const info = { targetId: targetInfo.targetId, sessionId, url: targetInfo.url, type: targetInfo.type };
    this.sessions.set(info.targetId, info);
    this.bySession.set(sessionId, info);
    const initialize = (async () => {
      try {
        if (info.type !== 'page' && info.type !== 'iframe') return;
        await this.cdp.send('Runtime.enable', {}, sessionId);
        await this.cdp.send('Page.enable', {}, sessionId);
        await this.cdp.send('DOM.enable', {}, sessionId);
        await this.cdp.send('CSS.enable', {}, sessionId);
        await this.cdp.send('Runtime.addBinding', { name: '__WalledGuardBridge' }, sessionId);
        await this.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECTED_SCRIPT }, sessionId);
        await this.cdp.send('Page.setInterceptFileChooserDialog', { enabled: true }, sessionId);
        await this.cdp.send('Network.enable', {}, sessionId);
        await this.cdp.send('Fetch.enable', { patterns: FETCH_PATTERNS }, sessionId);
        await this.cdp.send('Runtime.evaluate', { expression: INJECTED_SCRIPT, awaitPromise: false }, sessionId).catch(() => {});
        await this.installResponseStyles(sessionId).catch(() => {});
      } catch (error) {
        // A page must not continue unprotected if instrumentation fails.
        this.emit('error', new Error(`Protection could not be installed: ${error.message}`));
        this.stop();
        throw error;
      } finally {
        if (waitingForDebugger) {
          try { await this.cdp?.send('Runtime.runIfWaitingForDebugger', {}, sessionId); } catch (_) { /* target closed */ }
        }
      }
    })();
    this.initializing.set(info.targetId, initialize);
    await initialize;
  }

  async handleBridge(sessionId, params) {
    const info = this.bySession.get(sessionId);
    if (!info || !isProtectedWebApp(info.url)) return;
    let message;
    try { message = JSON.parse(params.payload); } catch (_) { return; }
    if (!message || typeof message.id !== 'string' || message.id.length > 60) return;
    let approved = false;
    if (message.kind === 'prompt' && typeof message.text === 'string' && message.text.length <= 100000) {
      approved = !message.text.includes(MARKER) || await this.onConfirm('prompt', message.text);
      if (approved && message.text.includes(MARKER)) this.approvals.approvePrompt(message.text);
      this.activity(`Sensitive prompt ${approved ? 'continued' : 'cancelled'}.`);
    } else if (message.kind === 'files' && Array.isArray(message.files) && message.files.length <= 12) {
      approved = await this.onInspectFiles(message.files);
      if (approved) {
        for (const item of message.files) {
          if (typeof item.bytes === 'string') {
            const bytes = Buffer.from(item.bytes, 'base64');
            if (bytes.length <= 32 * 1024 * 1024) this.approvals.approveFile(bytes);
          }
        }
      }
    } else if (message.kind === 'file-error') {
      await this.onFileError(String(message.error || 'Cannot inspect file'));
    }
    let result;
    try {
      result = await this.cdp.send('Runtime.evaluate', {
        expression: `globalThis.__WalledGuardResolve(${JSON.stringify(message.id)},${approved ? 'true' : 'false'})`,
        contextId: params.executionContextId,
        returnByValue: true,
        awaitPromise: false
      }, sessionId);
    } catch (_) { return; } // navigation cancelled the action
    const resume = result.result?.value;
    if (!approved || !resume) return;
    try {
      // The native dialog focused Electron. Bring Chrome forward before
      // sending browser-trusted input so keyboard focus is restored.
      if (resume.type === 'click' || resume.type === 'key') {
        await this.cdp.send('Page.bringToFront', {}, sessionId);
      }
      if (resume.type === 'click' && Number.isFinite(resume.x) && Number.isFinite(resume.y)) {
        for (const type of ['mousePressed', 'mouseReleased']) {
          await this.cdp.send('Input.dispatchMouseEvent', {
            type, x: resume.x, y: resume.y, button: 'left', clickCount: 1
          }, sessionId);
        }
      } else if (resume.type === 'key') {
        await this.cdp.send('Input.dispatchKeyEvent', {
          type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13
        }, sessionId);
        await this.cdp.send('Input.dispatchKeyEvent', {
          type: 'char', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13
        }, sessionId);
        await this.cdp.send('Input.dispatchKeyEvent', {
          type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13
        }, sessionId);
      }
    } catch (error) { this.emit('error', new Error(`Approved action could not be resumed: ${error.message}`)); }
  }

  async handleFileChooser(sessionId, params) {
    if (!params.backendNodeId) {
      await this.onFileError('File selector could not be identified. Upload blocked.');
      return;
    }
    const info = this.bySession.get(sessionId);
    if (!info || !isProtectedWebApp(info.url)) return;
    const paths = await this.onSelectFiles(params.mode === 'selectMultiple');
    if (!paths?.length) return; // Cancel: no files selected or transmitted.
    if (!await this.onScanPaths(paths)) return;
    const names = paths.map(p => path.basename(p));
    try {
      await this.cdp.send('Runtime.evaluate', {
        expression: `globalThis.__WalledGuardApproveSelectedFiles?.(${JSON.stringify(names)})`
      }, sessionId);
      await this.cdp.send('DOM.setFileInputFiles', {
        files: paths, backendNodeId: params.backendNodeId
      }, sessionId);
      this.activity(`${paths.length} inspected file(s) selected in Chrome.`);
    } catch (error) {
      await this.onFileError(`Could not attach inspected files to the webpage: ${error.message}`);
    }
  }

  async handlePausedRequest(sessionId, params) {
    const requestId = params.requestId;
    if (!requestId) return;
    let allow = true;
    try {
      const request = params.request || {};
      if (['POST', 'PUT', 'PATCH'].includes(String(request.method).toUpperCase())) {
        let postData = typeof request.postData === 'string' ? request.postData : '';
        if (!postData && request.hasPostData) {
          try {
            const data = await this.cdp.send('Fetch.getRequestPostData', { requestId }, sessionId);
            postData = data.postData || '';
          } catch (_) { /* Multipart file bytes may not be available over CDP. */ }
        }
        if (requiresHttpCheck(request.method, postData) && !this.approvals.consumeBody(Buffer.from(postData))) {
          const desc = describeHttpBody(postData);
          allow = await this.onConfirm(desc.kind, desc.value);
          if (allow) this.approvals.approvePrompt(postData);
          this.activity(`HTTP marker backstop: ${allow ? 'continued' : 'blocked'} a request.`);
        }
      }
    } catch (error) {
      allow = false;
      this.emit('error', new Error(`Inspection error; outgoing request blocked: ${error.message}`));
    }
    try {
      await this.cdp.send(allow ? 'Fetch.continueRequest' : 'Fetch.failRequest',
        allow ? { requestId } : { requestId, errorReason: 'BlockedByClient' }, sessionId);
    } catch (_) { /* request navigated/cancelled while paused */ }
  }

  // Google may reject OAuth in a Chrome session under CDP monitoring. The
  // approved option is a temporary ordinary Chrome session, using the same
  // dedicated profile, with NO remote-debugging switch or instrumentation.
  // The controller must communicate clearly that browsing is unprotected.
  async enterSignInMode() {
    if (this.signInMode) return;
    const executable = this.chromePath || findChromeExecutable();
    if (!executable) throw new Error('Google Chrome is required.');
    const previous = this.child;
    this.stop();
    await waitForExit(previous);
    const profileDir = path.join(this.userDataPath, 'managed-chrome-profile');
    await fsp.mkdir(profileDir, { recursive: true, mode: 0o700 });
    await fsp.rm(path.join(profileDir, 'DevToolsActivePort'), { force: true });
    this.signInMode = true;
    try {
      this.signInChild = spawn(executable, [
        `--user-data-dir=${profileDir}`,
        '--no-first-run', '--no-default-browser-check', '--new-window',
        'https://chatgpt.com/'
      ], { stdio: 'ignore', windowsHide: false });
      this.signInChild.on('error', error => {
        this.emit('error', new Error(`Sign-in Chrome failed: ${error.message}`));
      });
      this.signInChild.on('exit', () => {
        if (this.signInMode) this.activity('Sign-in Chrome closed. Click Finish sign-in to restart monitored browsing.');
      });
      this.report('DLP PAUSED — sign-in only (unprotected Chrome)');
      this.activity('Unprotected sign-in mode. Do not submit prompts or upload files.');
    } catch (error) {
      this.signInMode = false;
      throw error;
    }
  }

  async finishSignInMode() {
    if (!this.signInMode) throw new Error('Sign-in mode is not running.');
    const child = this.signInChild;
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await waitForExit(child);
    this.signInChild = null;
    this.signInMode = false;
    this.activity('Unprotected sign-in browser closed; restarting DLP monitoring.');
    return this.launch('chatgpt');
  }

  async installResponseStyles(sessionId) {
    if (!this.cdp || this.cdp.closed) return false;
    const info = this.bySession.get(sessionId);
    if (!info || (info.url !== 'about:blank' && !isProtectedWebApp(info.url))) return false;
    const { frameTree } = await this.cdp.send('Page.getFrameTree', {}, sessionId);
    const frameId = frameTree?.frame?.id;
    if (!frameId) return false;
    const { styleSheetId } = await this.cdp.send('CSS.createStyleSheet', { frameId }, sessionId);
    if (!styleSheetId) return false;
    await this.cdp.send('CSS.setStyleSheetText', { styleSheetId, text: BLUE_RESPONSE_CSS }, sessionId);
    return true;
  }

  async refreshColors() {
    if (this.signInMode || !this.cdp || this.cdp.closed) throw new Error('Protected Chrome is not active.');
    let total = 0;
    let tabs = 0;
    for (const info of this.sessions.values()) {
      if (info.type !== 'page' || !isProtectedWebApp(info.url)) continue;
      await this.installResponseStyles(info.sessionId);
      const response = await this.cdp.send('Runtime.evaluate', {
        expression: 'globalThis.__WalledGuardRefreshColors?.() ?? -1', returnByValue: true
      }, info.sessionId);
      const found = response.result?.value;
      if (typeof found === 'number' && found >= 0) { total += found; tabs++; }
      // The number of matched answer blocks alone does not prove that Chrome
      // rendered blue text; log computed CSS colors as separate diagnostics.
      const computed = await this.cdp.send('Runtime.evaluate', {
        expression: 'globalThis.__WalledGuardColorReport?.() ?? null', returnByValue: true
      }, info.sessionId);
      const infoColor = computed.result?.value;
      if (infoColor?.color) {
        this.activity(`Visible AI answer text: ${infoColor.blueTextNodes}/${infoColor.visibleTextNodes} blue, ${infoColor.otherTextNodes} non-blue; sampled color ${infoColor.color}, fill ${infoColor.textFillColor || 'unset'} (no answer content logged).`);
      }
    }
    this.activity(`AI response styling refreshed in ${tabs} monitored tabs (${total} response blocks matched).`);
    return { tabs, blocks: total };
  }

  stop() {
    this.stopping = true;
    if (this.signInChild && this.signInChild.exitCode === null && this.signInChild.signalCode === null) {
      try { this.signInChild.kill('SIGTERM'); } catch (_) { /* already exited */ }
    }
    this.signInChild = null;
    this.signInMode = false;
    try { this.cdp?.close(); } catch (_) { /* stop */ }
    this.cdp = null;
    this.sessions.clear();
    this.bySession.clear();
    this.initializing.clear();
    this.openTargets.clear();
    if (this.child && this.child.exitCode === null) {
      try { this.child.kill('SIGTERM'); } catch (_) { /* already gone */ }
    }
    this.child = null;
    this.report('Managed Chrome stopped — protection inactive');
  }
}

// Graceful profile handoff: Chrome must close before reopening the same
// profile with/without CDP. Refuse to proceed if it stays open.
async function waitForExit(child, timeoutMs = 10000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    sleep(timeoutMs)
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    throw new Error('Chrome did not close. Quit the WalledGuard Chrome window and try again.');
  }
}

module.exports = { ChromeController, readDebugPort, safeNetworkTarget, SITES, waitForExit };
