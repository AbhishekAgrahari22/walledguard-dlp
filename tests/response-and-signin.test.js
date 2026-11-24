'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BLUE_RESPONSE_CSS } = require('../src/chrome/response-style');
const { ChromeController } = require('../src/chrome/controller');

test('blue response stylesheet targets older and newer ChatGPT plus Perplexity AI answer roots', () => {
  for (const selector of ['article[data-turn="assistant"]', 'section[data-turn="assistant"]',
    '[data-message-author-role="assistant"]', '[data-workflow-final-text]',
    '[data-testid="answer"]']) {
    assert.ok(BLUE_RESPONSE_CSS.includes(selector), `missing ${selector}`);
  }
  assert.match(BLUE_RESPONSE_CSS, /#1263d6 !important/);
  assert.match(BLUE_RESPONSE_CSS, /-webkit-text-fill-color: #1263d6 !important/);
  assert.doesNotMatch(BLUE_RESPONSE_CSS, /data-turn="user"|data-message-author-role="user"/);
});

test('sign-in mode cannot be misreported as protected browsing by Chrome controller', async () => {
  const controller = new ChromeController({ userDataPath: '/tmp/wg-test-unused' });
  controller.signInMode = true;
  await assert.rejects(() => controller.launch('chatgpt'), /DLP is paused/);
  await assert.rejects(() => controller.open('perplexity'), /DLP is paused/);
  controller.stop();
});

test('ordinary Chrome sign-in handoff does not enable remote debugging', () => {
  const source = ChromeController.prototype.enterSignInMode.toString();
  assert.match(source, /user-data-dir/);
  assert.doesNotMatch(source, /--remote-debugging-port|--remote-debugging-pipe|--disable-web-security/);
});
