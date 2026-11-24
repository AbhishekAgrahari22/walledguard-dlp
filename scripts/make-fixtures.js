'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createCanvas } = require('@napi-rs/canvas');

const outDir = path.resolve(__dirname, '..', 'fixtures');
fs.mkdirSync(outDir, { recursive: true });

// A standards-compliant, one-page PDF with a selectable text object.
function simplePdf(text) {
  const sanitized = text.replace(/[\\()]/g, '\\$&');
  const stream = `BT /F1 20 Tf 50 180 Td (${sanitized}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 650 300] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  const parts = ['%PDF-1.4\n'];
  let offset = Buffer.byteLength(parts[0]);
  const offsets = [0];
  for (const [index, value] of objects.entries()) {
    const part = `${index + 1} 0 obj\n${value}\nendobj\n`;
    offsets.push(offset);
    parts.push(part);
    offset += Buffer.byteLength(part);
  }
  const xref = offset;
  parts.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i < offsets.length; i += 1) parts.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  parts.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.from(parts.join(''));
}

function imageFixture(text, filename) {
  const canvas = createCanvas(1180, 240);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, 1180, 240);
  ctx.fillStyle = 'black';
  ctx.font = 'bold 69px sans-serif';
  ctx.fillText(text, 30, 140);
  fs.writeFileSync(path.join(outDir, filename), canvas.toBuffer('image/png'));
}

fs.writeFileSync(path.join(outDir, 'normal.txt'), 'This is a safe public prompt.\n');
fs.writeFileSync(path.join(outDir, 'sensitive.txt'), 'Example: WALLED_SENSITIVE\n');
fs.writeFileSync(path.join(outDir, 'normal.pdf'), simplePdf('A SAFE PDF DOCUMENT'));
fs.writeFileSync(path.join(outDir, 'sensitive.pdf'), simplePdf('WALLED_SENSITIVE'));
imageFixture('WALLED_SENSITIVE', 'sensitive.png');
imageFixture('SAFE PUBLIC IMAGE', 'normal.png');
console.log(`Six fixtures saved in: ${outDir}`);
