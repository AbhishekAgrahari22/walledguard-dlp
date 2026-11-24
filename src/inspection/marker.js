'use strict';

const MARKER = 'WALLED_SENSITIVE';
const MAX_FILE_BYTES = 32 * 1024 * 1024;

function containsMarker(text) {
  return typeof text === 'string' && text.includes(MARKER);
}

// OCR sometimes inserts blanks between a printed underscore and its neighbors.
// Relax normalization only for OCR, never for typed or digitally extracted text.
function ocrContainsMarker(text) {
  if (containsMarker(text)) return true;
  if (typeof text !== 'string') return false;
  return text.toUpperCase().replace(/[\s_.:\-]+/g, '').includes('WALLEDSENSITIVE');
}

function detectType(filename, mime, buffer) {
  const name = String(filename || '').toLowerCase();
  const type = String(mime || '').toLowerCase();
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-' || type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  const png = bytes.length > 7 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  const jpeg = bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const gif = bytes.subarray(0, 3).toString('ascii') === 'GIF';
  const webp = bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  const tiff = bytes.subarray(0, 4).toString('latin1') === 'II*\x00' || bytes.subarray(0, 4).toString('latin1') === 'MM\x00*';
  const imageExtension = /\.(png|jpe?g|gif|bmp|webp|tif|tiff)$/i.test(name);
  if (png || jpeg || gif || webp || tiff || type.startsWith('image/') && type !== 'image/svg+xml' || imageExtension) return 'image';
  if (type === 'image/svg+xml' || name.endsWith('.svg')) return 'text';
  if (type.startsWith('text/') || /\.(txt|csv|md|log|json|xml|yaml|yml)$/i.test(name) || type === 'application/json') return 'text';
  return 'unsupported';
}

function decodeText(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.from(bytes.subarray(2));
    for (let i = 0; i + 1 < swapped.length; i += 2) [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
    return new TextDecoder('utf-16le').decode(swapped);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

module.exports = { MARKER, MAX_FILE_BYTES, containsMarker, ocrContainsMarker, detectType, decodeText };
