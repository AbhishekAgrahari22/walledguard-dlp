'use strict';

const path = require('node:path');
const { MARKER, MAX_FILE_BYTES, containsMarker, ocrContainsMarker, detectType, decodeText } = require('./marker');

let ocrWorkerPromise = null;

async function getOcrWorker(langPath) {
  if (!ocrWorkerPromise) {
    const { createWorker } = require('tesseract.js');
    // Language data ships with the desktop project, avoiding any OCR cloud/API call.
    ocrWorkerPromise = createWorker('eng', 1, { langPath, gzip: false }).catch(error => {
      ocrWorkerPromise = null;
      throw error;
    });
  }
  return ocrWorkerPromise;
}

async function recognizeImage(buffer, langPath) {
  const worker = await getOcrWorker(langPath);
  const result = await worker.recognize(buffer);
  return String(result?.data?.text || '');
}

async function scanPdf(buffer, langPath) {
  // Dynamic import keeps the non-PDF startup fast and works with pdfjs-dist's ESM build.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false
  });
  let document;
  try {
    document = await loadingTask.promise;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const fragments = content.items.map(item => item.str || '');
      if (containsMarker(fragments.join(' ')) || containsMarker(fragments.join(''))) {
        return { sensitive: true, evidence: `PDF page ${pageNumber} (extractable text)` };
      }

      // Also OCR each page: PDFs can contain screenshots or scanned pages.
      // Load the native canvas module only when rasterization is required.
      const { createCanvas } = require('@napi-rs/canvas');
      // Cap resolution, not the number of pages; nothing is silently skipped.
      const natural = page.getViewport({ scale: 1 });
      const scale = Math.min(1.8, Math.sqrt(8_000_000 / Math.max(1, natural.width * natural.height)));
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
      const context = canvas.getContext('2d');
      const renderTask = page.render({ canvasContext: context, viewport, canvas });
      await renderTask.promise;
      const recognized = await recognizeImage(canvas.toBuffer('image/png'), langPath);
      if (ocrContainsMarker(recognized)) {
        return { sensitive: true, evidence: `PDF page ${pageNumber} (OCR)` };
      }
      page.cleanup();
    }
    return { sensitive: false, evidence: '' };
  } finally {
    await loadingTask.destroy().catch(() => {});
  }
}

async function scanFile({ name, mime, bytes }, { langPath }) {
  if (!bytes || !ArrayBuffer.isView(bytes) && !Buffer.isBuffer(bytes) && !Array.isArray(bytes)) {
    throw new Error('Missing file content; upload was blocked.');
  }
  const buffer = Buffer.from(bytes);
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error(`File exceeds the ${MAX_FILE_BYTES / 1024 / 1024} MB inspection limit. Upload blocked.`);
  }
  const kind = detectType(name, mime, buffer);
  // Detect the exact literal marker in embedded metadata/uncompressed content
  // before falling back to structural PDF parsing or image OCR.
  if ((kind === 'pdf' || kind === 'image') && buffer.includes(Buffer.from(MARKER, 'utf8'))) {
    return { sensitive: true, kind, evidence: 'file bytes / embedded metadata' };
  }
  if (kind === 'text') return { sensitive: containsMarker(decodeText(buffer)), kind, evidence: 'text content' };
  if (kind === 'pdf') return { ...(await scanPdf(buffer, langPath)), kind };
  if (kind === 'image') {
    const text = await recognizeImage(buffer, langPath);
    return { sensitive: ocrContainsMarker(text), kind, evidence: 'image OCR' };
  }
  // Only formats required by the assignment are inspected. See README limitations.
  return { sensitive: false, kind, evidence: 'unsupported format (not inspected)' };
}

async function shutdownOcr() {
  const promise = ocrWorkerPromise;
  ocrWorkerPromise = null;
  if (promise) {
    try { const worker = await promise; await worker.terminate(); } catch (_) { /* best effort */ }
  }
}

function getLanguageDirectory(isPackaged, resourcesPath, appDir) {
  return isPackaged ? path.join(resourcesPath, 'tessdata') : path.join(appDir, 'assets', 'tessdata');
}

module.exports = { scanFile, shutdownOcr, getLanguageDirectory, scanPdf, recognizeImage };
