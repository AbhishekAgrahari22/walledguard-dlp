'use strict';

// Runs after npm install + npm run fixtures. Intentionally tests REAL PDF and OCR
// extraction, rather than replacing the scanner with mocks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { scanFile, shutdownOcr } = require('../src/inspection/scanner');
const root = path.resolve(__dirname, '..');
const langPath = path.join(root, 'assets', 'tessdata');

const fixtures = [
  ['sensitive.txt', 'text/plain', true],
  ['normal.txt', 'text/plain', false],
  ['sensitive.pdf', 'application/pdf', true],
  ['normal.pdf', 'application/pdf', false],
  ['sensitive.png', 'image/png', true],
  ['normal.png', 'image/png', false]
];

for (const [name, mime, expected] of fixtures) {
  test(`${name} => sensitive=${expected}`, { timeout: 180_000 }, async () => {
    const filepath = path.join(root, 'fixtures', name);
    assert.equal(fs.existsSync(filepath), true, `Missing fixture: ${name}; run npm run fixtures`);
    const result = await scanFile({ name, mime, bytes: fs.readFileSync(filepath) }, { langPath });
    assert.equal(result.sensitive, expected, JSON.stringify(result));
  });
}

test.after(async () => { await shutdownOcr(); });
