'use strict';

const { MARKER, containsMarker } = require('../inspection/marker');

function isProtectedWebApp(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (
      u.hostname === 'chatgpt.com' || u.hostname === 'www.chatgpt.com' ||
      u.hostname === 'perplexity.ai' || u.hostname === 'www.perplexity.ai'
    );
  } catch (_) { return false; }
}

function requiresHttpCheck(method, postData) {
  return ['POST', 'PUT', 'PATCH'].includes(String(method || '').toUpperCase()) &&
    containsMarker(String(postData || ''));
}

function describeHttpBody(postData) {
  const text = String(postData || '');
  const fileName = text.match(/filename\*?=(?:UTF-8''|["']?)([^"'\r\n;]+)/i)?.[1];
  if (fileName) return { kind: 'file', value: fileName.slice(0, 150) };
  try {
    const parsed = JSON.parse(text);
    const find = (v, depth = 0) => {
      if (depth > 12) return null;
      if (typeof v === 'string' && v.includes(MARKER)) return v;
      if (Array.isArray(v)) { for (const item of v) { const found = find(item, depth + 1); if (found) return found; } }
      if (v && typeof v === 'object') { for (const item of Object.values(v)) { const found = find(item, depth + 1); if (found) return found; } }
      return null;
    };
    const found = find(parsed);
    if (found) return { kind: 'prompt', value: found.slice(0, 500) };
  } catch (_) { /* encoded form data or multipart */ }
  const index = text.indexOf(MARKER);
  return { kind: 'prompt', value: index >= 0 ? `…${text.slice(Math.max(0, index - 70), index + MARKER.length + 70)}…` : 'Outgoing request' };
}

module.exports = { isProtectedWebApp, requiresHttpCheck, describeHttpBody };
