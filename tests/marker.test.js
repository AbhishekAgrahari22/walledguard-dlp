'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MARKER, containsMarker, ocrContainsMarker, detectType, decodeText
} = require('../src/inspection/marker');

test('exact typed prompt marker is detected case-sensitively', () => {
  assert.equal(MARKER, 'WALLED_SENSITIVE');
  assert.equal(containsMarker('hello WALLED_SENSITIVE world'), true);
  assert.equal(containsMarker('hello walled_sensitive world'), false);
  assert.equal(containsMarker('normal text'), false);
});

test('text files can be UTF-8 or UTF-16', () => {
  const plain = Buffer.from('WALLED_SENSITIVE', 'utf8');
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('WALLED_SENSITIVE', 'utf16le')]);
  assert.equal(containsMarker(decodeText(plain)), true);
  assert.equal(containsMarker(decodeText(utf16)), true);
});

test('detect PDF and PNG by actual signatures', () => {
  assert.equal(detectType('doc.data', '', Buffer.from('%PDF-1.4')), 'pdf');
  assert.equal(detectType('image.data', '', Buffer.from('89504e470d0a1a0a', 'hex')), 'image');
  assert.equal(detectType('sample.txt', 'text/plain', Buffer.from('abc')), 'text');
  assert.equal(detectType('sample.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from('abc')), 'unsupported');
});

test('OCR normalization can tolerate spaces around printed underscores', () => {
  assert.equal(ocrContainsMarker('WALLED _ SENSITIVE'), true);
  assert.equal(ocrContainsMarker('safe image'), false);
});
