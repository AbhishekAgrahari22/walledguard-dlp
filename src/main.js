'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const { ChromeController } = require('./chrome/controller');
const { MARKER, MAX_FILE_BYTES, detectType } = require('./inspection/marker');
const { scanFile, shutdownOcr, getLanguageDirectory } = require('./inspection/scanner');

let window = null;
let chrome = null;
let busy = false;
const recent = [];

function eventLog(text) {
  const value = String(text || '').slice(0, 240);
  recent.push({ timestamp: new Date().toLocaleTimeString(), text: value });
  if (recent.length > 80) recent.shift();
  if (!window?.isDestroyed()) window.webContents.send('walledguard:log', recent[recent.length - 1]);
}

function setStatus(text) {
  // Never display "protected" while the ordinary sign-in Chrome window is
  // running without DLP instrumentation, even if a separate error occurs.
  if (chrome?.signInMode && !String(text).startsWith('DLP PAUSED')) {
    text = 'DLP PAUSED — sign-in only (unprotected Chrome)';
  }
  if (!window?.isDestroyed()) window.webContents.send('walledguard:status', text);
}

async function nativeMessage(options) {
  if (window && !window.isDestroyed()) {
    window.show();
    window.focus();
    return dialog.showMessageBox(window, options);
  }
  return dialog.showMessageBox(options);
}

function shortPreview(input) {
  return String(input || '').replace(/[\r\n]+/g, ' ').slice(0, 250);
}

async function confirm(kind, detail, evidence = MARKER) {
  const isFile = kind === 'file';
  const result = await nativeMessage({
    type: 'warning', title: 'WalledGuard — Sensitive content detected',
    message: `Detected ${MARKER} in ${isFile ? 'a FILE' : 'a TEXT PROMPT'}`,
    detail: isFile
      ? `File: ${shortPreview(detail)}\nDetection: ${evidence}\n\nContinue allows the original file to upload. Cancel blocks the upload.`
      : `Prompt: ${shortPreview(detail)}\n\nContinue sends the original prompt unchanged. Cancel keeps it editable.`,
    buttons: ['Continue', 'Cancel'], defaultId: 1, cancelId: 1, noLink: true
  });
  eventLog(`Sensitive ${isFile ? 'file' : 'prompt'}: ${result.response === 0 ? 'continued' : 'cancelled'}.`);
  return result.response === 0;
}

async function showBlocked(message, detail = '') {
  eventLog('File inspection error — operation blocked.');
  await nativeMessage({
    type: 'error', title: 'WalledGuard — Upload blocked', message,
    detail: String(detail).slice(0, 700), buttons: ['OK']
  });
}

function langPath() {
  return getLanguageDirectory(app.isPackaged, process.resourcesPath, app.getAppPath());
}

async function inspect(name, mime, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_FILE_BYTES) {
    await showBlocked('File too large or unreadable', `Maximum size: ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
    return false;
  }
  const type = detectType(name, mime, bytes);
  if (type === 'unsupported') {
    await showBlocked('Unsupported file format', `${name}\nOnly text, PDF and image formats can be inspected.`);
    return false;
  }
  setStatus(`Inspecting ${shortPreview(name)} locally…`);
  try {
    const result = await scanFile({ name, mime, bytes }, { langPath: langPath() });
    if (!result.sensitive) {
      eventLog(`Checked ${type} file; no marker detected.`);
      return true;
    }
    return await confirm('file', name, result.evidence);
  } catch (error) {
    await showBlocked('File inspection failed', `${name}\n${error.message}`);
    return false;
  } finally {
    setStatus('Monitoring managed Chrome');
  }
}

async function inspectBrowserFiles(files) {
  if (!Array.isArray(files) || files.length > 12) return false;
  for (const file of files) {
    if (!file || typeof file.name !== 'string' || typeof file.mime !== 'string' || typeof file.bytes !== 'string') return false;
    if (file.bytes.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 64) {
      await showBlocked('File too large for inspection', file.name);
      return false;
    }
    const bytes = Buffer.from(file.bytes, 'base64');
    if (!await inspect(file.name, file.mime, bytes)) return false;
  }
  return true;
}

async function scanSelectedPaths(paths) {
  if (!Array.isArray(paths) || !paths.length || paths.length > 12) return false;
  for (const filePath of paths) {
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) {
        await showBlocked('Selected file cannot be inspected', path.basename(filePath));
        return false;
      }
      const bytes = await fs.readFile(filePath);
      if (!await inspect(path.basename(filePath), '', bytes)) return false;
    } catch (error) {
      await showBlocked('Cannot read selected file', `${path.basename(filePath)}\n${error.message}`);
      return false;
    }
  }
  return true;
}

async function selectFiles(multiple) {
  const options = {
    title: 'WalledGuard — Choose files for protected upload',
    properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: [
      { name: 'Text, PDF, images', extensions: ['txt', 'csv', 'md', 'log', 'json', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tif', 'tiff'] },
      { name: 'All files (unsupported formats blocked)', extensions: ['*'] }
    ]
  };
  if (window && !window.isDestroyed()) { window.show(); window.focus(); }
  const result = await (window && !window.isDestroyed() ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options));
  return result.canceled ? [] : result.filePaths;
}

function createChrome() {
  chrome = new ChromeController({
    userDataPath: app.getPath('userData'),
    onConfirm: confirm,
    onInspectFiles: inspectBrowserFiles,
    onSelectFiles: selectFiles,
    onFileError: detail => showBlocked('File upload could not be inspected', detail),
    onScanPaths: scanSelectedPaths
  });
  chrome.on('status', setStatus);
  chrome.on('activity', eventLog);
  chrome.on('error', error => {
    eventLog(`Browser diagnostic: ${String(error.message || error).slice(0, 180)}`);
    setStatus('Browser issue — check WalledGuard activity log');
  });
}

async function startChrome(site = 'chatgpt') {
  if (busy) return;
  busy = true;
  try {
    if (!chrome) createChrome();
    await chrome.launch(site);
  } catch (error) {
    setStatus(`Chrome could not start: ${error.message}`);
    eventLog(`Startup failure: ${error.message}`);
    await nativeMessage({
      type: 'error', title: 'WalledGuard — Browser startup failed',
      message: 'Could not launch protected Google Chrome',
      detail: `${error.message}\n\nYou need Google Chrome installed. WalledGuard does not open an unprotected fallback window.`,
      buttons: ['OK']
    });
  } finally { busy = false; }
}

function registerIPC() {
  const valid = e => window && !window.isDestroyed() && e.sender.id === window.webContents.id &&
    e.senderFrame?.url.startsWith('file://');
  ipcMain.handle('walledguard:open', async (e, site) => {
    if (!valid(e) || !['chatgpt', 'perplexity'].includes(site)) return false;
    if (busy) return false;
    try { if (chrome) await chrome.open(site); else await startChrome(site); return true; }
    catch (error) { eventLog(`Navigation failed: ${error.message}`); return false; }
  });
  ipcMain.handle('walledguard:restart', async e => {
    if (!valid(e) || busy) return false;
    if (chrome?.signInMode) return false;
    chrome?.stop(); chrome = null;
    await startChrome();
    return true;
  });
  ipcMain.handle('walledguard:signin', async e => {
    if (!valid(e) || busy) return false;
    busy = true;
    try {
      const response = await nativeMessage({
        type: 'warning', title: 'WalledGuard — Protection paused for sign-in',
        message: 'Sign in using ordinary Chrome without DLP monitoring?',
        detail: 'WalledGuard will close the monitored Chrome window and open an UNPROTECTED sign-in window with the same dedicated profile. Use it ONLY to sign in. Do not send prompts or select files while DLP is paused. Click Finish sign-in & resume protection when done.',
        buttons: ['Enter sign-in mode', 'Cancel'], defaultId: 1, cancelId: 1, noLink: true
      });
      if (response.response !== 0) return false;
      if (!chrome) createChrome();
      await chrome.enterSignInMode();
      return true;
    } catch (error) {
      setStatus(`Sign-in mode failed: ${error.message}`);
      eventLog(`Sign-in mode failed: ${error.message}`);
      return false;
    } finally { busy = false; }
  });
  ipcMain.handle('walledguard:resume', async e => {
    if (!valid(e) || busy || !chrome?.signInMode) return false;
    busy = true;
    try {
      await chrome.finishSignInMode();
      return true;
    } catch (error) {
      setStatus(`Could not resume protection: ${error.message}`);
      eventLog(`Protection resume failed: ${error.message}`);
      return false;
    } finally { busy = false; }
  });
  ipcMain.handle('walledguard:colors', async e => {
    if (!valid(e) || busy || !chrome || chrome.signInMode) return { tabs: 0, blocks: 0 };
    try { return await chrome.refreshColors(); }
    catch (error) { eventLog(`Response styling check failed: ${error.message}`); return { tabs: 0, blocks: 0 }; }
  });
  ipcMain.handle('walledguard:state', async e => valid(e) ? recent : []);
  ipcMain.handle('walledguard:help', async e => {
    if (!valid(e)) return false;
    await shell.openExternal('https://github.com/');
    return true;
  });
}

function createWindow() {
  window = new BrowserWindow({
    title: 'WalledGuard DLP — Desktop Controller',
    width: 720, height: 720, minWidth: 590, minHeight: 580,
    backgroundColor: '#101b2a',
    webPreferences: {
      preload: path.join(__dirname, 'controller', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, webviewTag: false
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.loadFile(path.join(__dirname, 'controller', 'index.html'));
  window.webContents.once('did-finish-load', () => startChrome('chatgpt'));
  window.on('closed', () => { chrome?.stop(); window = null; app.quit(); });
  const menu = Menu.buildFromTemplate([
    { label: 'WalledGuard', submenu: [
      { label: 'Open ChatGPT', accelerator: 'CmdOrCtrl+1', click: () => chrome?.open('chatgpt').catch(err => eventLog(err.message)) },
      { label: 'Open Perplexity', accelerator: 'CmdOrCtrl+2', click: () => chrome?.open('perplexity').catch(err => eventLog(err.message)) },
      { label: 'Restart Protected Browser', click: () => { if (chrome?.signInMode) return; chrome?.stop(); chrome = null; startChrome(); } },
      { type: 'separator' }, { role: 'quit' }
    ] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] }
  ]);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  app.setName('WalledGuard DLP');
  registerIPC();
  createWindow();
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { chrome?.stop(); shutdownOcr().catch(() => {}); });
