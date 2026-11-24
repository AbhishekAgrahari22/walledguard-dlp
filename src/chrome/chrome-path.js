'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function findChromeExecutable({ platform = process.platform, env = process.env, exists = fs.existsSync } = {}) {
  // Explicit override is useful for custom installs and Chrome for Testing.
  if (env.WALLEDGUARD_CHROME_PATH && exists(env.WALLEDGUARD_CHROME_PATH)) return env.WALLEDGUARD_CHROME_PATH;
  let candidates = [];
  if (platform === 'darwin') {
    candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(env.HOME || '', 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
    ];
  } else if (platform === 'win32') {
    candidates = [
      path.join(env.PROGRAMFILES || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
      path.join(env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
      path.join(env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe')
    ];
  } else {
    for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
      try {
        const out = execFileSync('which', [name], { encoding: 'utf8', timeout: 1500 }).trim();
        if (out) candidates.push(out);
      } catch (_) { /* try next */ }
    }
  }
  return candidates.find(p => exists(p)) || null;
}

module.exports = { findChromeExecutable };
