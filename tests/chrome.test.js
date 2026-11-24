'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Script } = require('node:vm');
const { isProtectedWebApp, requiresHttpCheck, describeHttpBody } = require('../src/chrome/request-policy');
const { findChromeExecutable } = require('../src/chrome/chrome-path');
const { INJECTED_SCRIPT } = require('../src/chrome/injected');
const { ChromeController, safeNetworkTarget } = require('../src/chrome/controller');
const { ApprovalStore } = require('../src/interception/request-guard');

test('managed Chrome script parses and is not a browser extension', () => {
  assert.doesNotThrow(() => new Script(INJECTED_SCRIPT));
  assert.match(INJECTED_SCRIPT, /WALLED_SENSITIVE/);
  assert.match(INJECTED_SCRIPT, /data-message-author-role/);
  assert.match(INJECTED_SCRIPT, /data-workflow-final-text/);
});

test('monitor only HTTPS ChatGPT and Perplexity origins', () => {
  assert.equal(isProtectedWebApp('https://chatgpt.com/'), true);
  assert.equal(isProtectedWebApp('https://www.perplexity.ai/'), true);
  assert.equal(isProtectedWebApp('https://fakechatgpt.com/'), false);
  assert.equal(isProtectedWebApp('http://chatgpt.com/'), false);
  assert.equal(isProtectedWebApp('https://evil.perplexity.ai/'), false);
});

test('HTTP backstop checks outgoing POST, not GET', () => {
  assert.equal(requiresHttpCheck('POST', '{"prompt":"WALLED_SENSITIVE"}'), true);
  assert.equal(requiresHttpCheck('PATCH', 'WALLED_SENSITIVE'), true);
  assert.equal(requiresHttpCheck('GET', 'WALLED_SENSITIVE'), false);
  assert.equal(requiresHttpCheck('POST', 'hello'), false);
});

test('HTTP body diagnostics extract relevant prompt or file name', () => {
  assert.deepEqual(describeHttpBody('{"message":{"content":"hello WALLED_SENSITIVE"}}'), { kind: 'prompt', value: 'hello WALLED_SENSITIVE' });
  assert.deepEqual(describeHttpBody('--x\r\nContent-Disposition: form-data; name="file"; filename="sample.txt"\r\nWALLED_SENSITIVE'), { kind: 'file', value: 'sample.txt' });
  assert.equal(safeNetworkTarget('https://chatgpt.com/api/v1/a-very-long-secret-token-that-should-not-be-logged?authorization=abc'), 'chatgpt.com/api');
});

test('Chrome executable supports explicit custom executable', () => {
  assert.equal(findChromeExecutable({ platform: 'darwin', env: { WALLEDGUARD_CHROME_PATH: '/custom/chrome' }, exists: x => x === '/custom/chrome' }), '/custom/chrome');
  assert.equal(findChromeExecutable({ platform: 'darwin', env: { HOME: '/home/demo' }, exists: x => x.startsWith('/Applications/Google Chrome.app') }), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
});

test('HTTP approval applies to one request, not later repeats', () => {
  const store = new ApprovalStore();
  store.approvePrompt('hello WALLED_SENSITIVE');
  assert.equal(store.consumeBody(Buffer.from('{"text":"hello WALLED_SENSITIVE"}')), true);
  assert.equal(store.consumeBody(Buffer.from('{"text":"hello WALLED_SENSITIVE"}')), false);
});

test('native prompt decision blocks or replays trusted Chrome input', async () => {
  let approve = false;
  const commands = [];
  const c = new ChromeController({
    userDataPath: '/unused', onConfirm: async () => approve,
    onInspectFiles: async () => false, onSelectFiles: async () => [],
    onFileError: async () => {}, onScanPaths: async () => false
  });
  c.bySession.set('session', { targetId: 'page', sessionId: 'session', url: 'https://chatgpt.com/' });
  c.cdp = {
    send: async (method, args) => {
      commands.push(method);
      if (method === 'Runtime.evaluate') return { result: { value: { type: 'click', x: 100, y: 75 } } };
      return {};
    }
  };
  await c.handleBridge('session', { name: '__WalledGuardBridge', executionContextId: 1, payload: JSON.stringify({ id: 'p1', kind: 'prompt', text: 'WALLED_SENSITIVE' }) });
  assert.equal(commands.includes('Input.dispatchMouseEvent'), false);
  approve = true;
  await c.handleBridge('session', { name: '__WalledGuardBridge', executionContextId: 1, payload: JSON.stringify({ id: 'p2', kind: 'prompt', text: 'WALLED_SENSITIVE' }) });
  assert.equal(commands.filter(x => x === 'Input.dispatchMouseEvent').length, 2);
});
