'use strict';

const { containsMarker } = require('../inspection/marker');

// An additional guard for literal markers in HTTP upload bodies. The early DOM
// gates are still essential for OCR-only images, File/Blob uploads and user UX.
const TTL_MS = 20_000;
const MAX_CACHED_APPROVED_FILE_BYTES = 32 * 1024 * 1024;

class ApprovalStore {
  constructor(clock = () => Date.now()) {
    this.clock = clock;
    this.records = [];
  }

  prune() {
    this.records = this.records.filter(record => record.expires > this.clock());
  }

  approvePrompt(text) {
    this.prune();
    this.records.push({ kind: 'prompt', text, expires: this.clock() + TTL_MS });
  }

  approveFile(bytes) {
    this.prune();
    const buffer = Buffer.from(bytes);
    if (!buffer.length || buffer.length > MAX_CACHED_APPROVED_FILE_BYTES) return;
    this.records.push({ kind: 'file', bytes: buffer, expires: this.clock() + TTL_MS });
  }

  matchesBody(body) {
    this.prune();
    const raw = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const utf8 = raw.toString('utf8');
    return this.records.some(record => {
      if (record.kind === 'file') return raw.includes(record.bytes);
      // Prompt can appear literally or JSON-escaped in the network request.
      const escaped = JSON.stringify(record.text).slice(1, -1);
      return utf8.includes(record.text) || utf8.includes(escaped);
    });
  }
  // Used by managed Chrome's HTTP backstop. Grant is one request only,
  // so a later identical sensitive prompt must request a fresh decision.
  consumeBody(body) {
    this.prune();
    const raw = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const utf8 = raw.toString('utf8');
    const index = this.records.findIndex(record => {
      if (record.kind === 'file') return raw.includes(record.bytes);
      const escaped = JSON.stringify(record.text).slice(1, -1);
      return utf8.includes(record.text) || utf8.includes(escaped);
    });
    if (index === -1) return false;
    this.records.splice(index, 1);
    return true;
  }
}

function bodyParts(details) {
  return (details.uploadData || []).flatMap(item => {
    if (item.bytes) return [Buffer.from(item.bytes)];
    return []; // Blob UUIDs and streaming uploads are NOT readable by webRequest.
  });
}

function requestRequiresPromptConfirmation(details, approvals) {
  if (!['POST', 'PUT', 'PATCH'].includes(String(details.method || '').toUpperCase())) return false;
  const parts = bodyParts(details);
  if (!parts.length) return false;
  const body = Buffer.concat(parts);
  return containsMarker(body.toString('utf8')) && !approvals.matchesBody(body);
}

module.exports = { ApprovalStore, bodyParts, requestRequiresPromptConfirmation };
