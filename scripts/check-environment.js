'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { findChromeExecutable } = require('../src/chrome/chrome-path');
const root = path.resolve(__dirname, '..');
function check(name, ok, detail = '') { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ': ' + detail : ''}`); if (!ok) process.exitCode = 1; }
const major = Number(process.versions.node.split('.')[0]);
check('Node.js 22+', major >= 22, process.version);
const executable = findChromeExecutable();
check('Google Chrome / Chromium installed', !!executable, executable || 'Install Google Chrome');
check('OCR language data', fs.existsSync(path.join(root, 'assets/tessdata/eng.traineddata')));
check('Electron installed', fs.existsSync(path.join(root, 'node_modules/electron')));
check('PDF and OCR dependencies installed', ['pdfjs-dist', 'tesseract.js', '@napi-rs/canvas'].every(m => fs.existsSync(path.join(root, 'node_modules', m))));
console.log('Run: npm ci && npm test && npm start');
