'use strict';

// Optional offline real-Chrome smoke test. Does NOT test live ChatGPT/Perplexity
// servers. It uses a simulated app DOM in about:blank with the test-only origin
// override, while exercising real CDP clicks, native file chooser interception,
// the page binding, and CSS styling. It opens no user-sensitive files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ChromeController } = require('../src/chrome/controller');
const { INJECTED_SCRIPT } = require('../src/chrome/injected');
const { findChromeExecutable } = require('../src/chrome/chrome-path');

const HTML = `<!doctype html><html><body>
  <form><div id="prompt-textarea" role="textbox" contenteditable="true"></div>
  <button type="button" data-testid="send-button">Send</button>
  <input id="file" type="file" /></form>
  <article data-message-author-role="assistant"><p id="answer">Mock assistant reply</p></article>
  <section data-testid="conversation-turn-3" data-turn="assistant"><div id="modern-answer"><span style="color: #111 !important; -webkit-text-fill-color: #111 !important">Modern assistant text</span></div></section>
  <section data-turn="assistant"><div class="markdown" style="display:none">Non-visible markdown node</div><p id="outside-markdown" style="color: #111 !important; -webkit-text-fill-color: #111 !important">Actual visible answer outside markdown wrapper</p><button id="answer-toolbar">Copy</button></section>
  <section data-testid="conversation-turn-2" data-turn="user"><div id="user-prompt">Keep this user's text black</div></section>
  <script>
  window.sends=[];window.uploads=[];
  document.querySelector('[data-testid="send-button"]').addEventListener('click',
    () => window.sends.push(document.querySelector('#prompt-textarea').innerText));
  document.querySelector('#file').addEventListener('change',
    () => window.uploads.push([...document.querySelector('#file').files].map(f=>f.name)));
  </script></body></html>`;

async function main() {
  const executable = findChromeExecutable();
  if (!executable) throw new Error('Google Chrome/Chromium is required to run this optional smoke test.');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'walledguard-smoke-'));
  let permit = false;
  let confirms = 0;
  let filesScanned = 0;
  const flags = ['--headless=new', '--disable-gpu'];
  if (process.platform === 'linux' && typeof process.getuid === 'function' && process.getuid() === 0) flags.push('--no-sandbox');
  const controller = new ChromeController({
    userDataPath: tempDir, chromePath: executable, chromeFlags: flags,
    onConfirm: async () => { confirms++; return permit; },
    onInspectFiles: async () => false,
    onSelectFiles: async () => [path.join(__dirname, '..', 'fixtures', 'normal.txt')],
    onScanPaths: async () => { filesScanned++; return true; },
    onFileError: async error => { throw new Error(error); }
  });
  try {
    await controller.launch('chatgpt');
    const { targetId } = await controller.cdp.send('Target.createTarget', { url: 'about:blank' });
    const page = await controller.waitForSession(targetId);
    await controller.cdp.send('Runtime.evaluate', { expression: `document.open();document.write(${JSON.stringify(HTML)});document.close();` }, page.sessionId);
    // This override is only for an offline test; production code checks the real origin.
    const simulated = INJECTED_SCRIPT.replace('const host = location.hostname.toLowerCase();', 'const host = "chatgpt.com";');
    const evaluation = await controller.cdp.send('Runtime.evaluate', { expression: simulated }, page.sessionId);
    if (evaluation.exceptionDetails) throw new Error(`Guard failed to inject: ${evaluation.exceptionDetails.text}`);
    // The desktop bridge restricts origins; emulate the site URL only here.
    page.url = 'https://chatgpt.com/';
    const run = async expression => {
      const result = await controller.cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, page.sessionId);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result?.value;
    };
    assert.equal(await run('globalThis.__WalledGuardInstalled'), true);
    assert.equal(await run('getComputedStyle(document.querySelector("#answer")).color'), 'rgb(18, 99, 214)');
    assert.equal(await run('getComputedStyle(document.querySelector("#modern-answer")).color'), 'rgb(18, 99, 214)');
    assert.notEqual(await run('getComputedStyle(document.querySelector("#user-prompt")).color'), 'rgb(18, 99, 214)');
    assert.equal(await run('getComputedStyle(document.querySelector("#outside-markdown")).color'), 'rgb(18, 99, 214)');
    assert.equal(await run('getComputedStyle(document.querySelector("#outside-markdown")).webkitTextFillColor'), 'rgb(18, 99, 214)');
    assert.notEqual(await run('getComputedStyle(document.querySelector("#answer-toolbar")).color'), 'rgb(18, 99, 214)');
    assert.equal(await run('getComputedStyle(document.querySelector("#modern-answer span")).color'), 'rgb(18, 99, 214)');
    assert.equal(await run('getComputedStyle(document.querySelector("#modern-answer span")).webkitTextFillColor'), 'rgb(18, 99, 214)');
    assert.deepEqual(await run('globalThis.__WalledGuardColorReport()').then(x => [x.otherTextNodes, x.visibleTextNodes > 0]), [0, true]);
    console.log('PASS: ChatGPT AI text overrides inline black styles and text-fill; user prompt unaffected');
    // Removing the dynamically injected style simulates a strict CSP. A
    // DevTools via-inspector stylesheet should still enforce the blue color.
    await run('document.getElementById("walledguard-response-style")?.remove()');
    await controller.installResponseStyles(page.sessionId);
    assert.equal(await run('getComputedStyle(document.querySelector("#modern-answer")).color'), 'rgb(18, 99, 214)');
    console.log('PASS: Chrome inspector stylesheet colors model answers');

    await run('document.querySelector("#prompt-textarea").innerText="Demo WALLED_SENSITIVE"');
    const { x, y } = await run(`(()=>{const r=document.querySelector('[data-testid="send-button"]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    const click = async () => {
      await controller.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, page.sessionId);
      await controller.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, page.sessionId);
      await new Promise(resolve => setTimeout(resolve, 220));
    };
    permit = false;
    await click();
    assert.equal((await run('window.sends')).length, 0);
    console.log('PASS: Cancel blocks the sensitive prompt');
    permit = true;
    await click();
    assert.deepEqual(await run('window.sends'), ['Demo WALLED_SENSITIVE']);
    assert.equal(confirms, 2);
    console.log('PASS: Continue submits the unchanged original prompt');

    await run('document.querySelector("#file").click()');
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.deepEqual(await run('window.uploads'), [['normal.txt']]);
    assert.equal(filesScanned, 1);
    console.log('PASS: Original file picker selection reaches page after desktop inspection');

    // A separate Perplexity-like DOM verifies that answer styling is scoped
    // to the model answer and that sensitive prompt clicks are gated there.
    const { targetId: perplexityTarget } = await controller.cdp.send('Target.createTarget', { url: 'about:blank' });
    const perplexityPage = await controller.waitForSession(perplexityTarget);
    const perplexityHtml = `<!doctype html><html><body>
      <div id="ask-input" contenteditable="true">Perplexity WALLED_SENSITIVE</div>
      <button data-testid="submit-button">Ask</button>
      <div data-testid="answer"><p id="perplexity-answer" style="color: #111 !important; -webkit-text-fill-color: #111 !important">Mock Perplexity AI answer</p></div>
      <div id="perplexity-user">My user query</div>
      <script>
      window.sent=[];
      document.querySelector('button').addEventListener('click',()=>window.sent.push(document.querySelector('#ask-input').innerText));
      </script></body></html>`;
    await controller.cdp.send('Runtime.evaluate', { expression: `document.open();document.write(${JSON.stringify(perplexityHtml)});document.close();` }, perplexityPage.sessionId);
    const perplexityGuard = INJECTED_SCRIPT.replace('const host = location.hostname.toLowerCase();', 'const host = "perplexity.ai";');
    await controller.cdp.send('Runtime.evaluate', { expression: perplexityGuard }, perplexityPage.sessionId);
    perplexityPage.url = 'https://www.perplexity.ai/';
    const runPerplexity = async expression => {
      const result = await controller.cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, perplexityPage.sessionId);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result?.value;
    };
    assert.equal(await runPerplexity('getComputedStyle(document.querySelector("#perplexity-answer")).color'), 'rgb(18, 99, 214)');
    assert.equal(await runPerplexity('getComputedStyle(document.querySelector("#perplexity-answer")).webkitTextFillColor'), 'rgb(18, 99, 214)');
    assert.notEqual(await runPerplexity('getComputedStyle(document.querySelector("#perplexity-user")).color'), 'rgb(18, 99, 214)');
    console.log('PASS: Perplexity-like AI answers turn blue; user questions unaffected');
    const perplexityPoint = await runPerplexity(`(()=>{const r=document.querySelector('[data-testid="submit-button"]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    const clickPerplexity = async () => {
      for (const type of ['mousePressed','mouseReleased']) {
        await controller.cdp.send('Input.dispatchMouseEvent', { type, x: perplexityPoint.x, y: perplexityPoint.y, button: 'left', clickCount: 1 }, perplexityPage.sessionId);
      }
      await new Promise(resolve => setTimeout(resolve, 220));
    };
    permit = false;
    await clickPerplexity();
    assert.deepEqual(await runPerplexity('window.sent'), []);
    permit = true;
    await clickPerplexity();
    assert.deepEqual(await runPerplexity('window.sent'), ['Perplexity WALLED_SENSITIVE']);
    console.log('PASS: Perplexity-like sensitive prompt Cancel/Continue works');

    console.log('OFFLINE BROWSER SMOKE: ALL CHECKS PASSED (mock page, not live websites)');
  } finally {
    const child = controller.child;
    controller.stop();
    if (child && child.exitCode === null && child.signalCode === null) {
      await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        new Promise(resolve => setTimeout(resolve, 3000))
      ]);
    }
    await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 12, retryDelay: 160 });
  }
}

main().catch(error => { console.error('SMOKE FAIL:', error.stack); process.exitCode = 1; });
