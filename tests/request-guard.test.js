'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ApprovalStore, requestRequiresPromptConfirmation } = require('../src/interception/request-guard');

const upload = text => ({ method: 'POST', uploadData: [{ bytes: Buffer.from(text) }] });

test('network guard sees literal sensitive text in outgoing POST', () => {
  const store = new ApprovalStore();
  assert.equal(requestRequiresPromptConfirmation(upload('{"prompt":"WALLED_SENSITIVE"}'), store), true);
  assert.equal(requestRequiresPromptConfirmation(upload('{"prompt":"safe"}'), store), false);
  assert.equal(requestRequiresPromptConfirmation({ ...upload('WALLED_SENSITIVE'), method: 'GET' }, store), false);
});

test('approved prompt is not prompted twice when forwarded unchanged', () => {
  const clock = { now: 0 };
  const store = new ApprovalStore(() => clock.now);
  store.approvePrompt('hello WALLED_SENSITIVE');
  assert.equal(requestRequiresPromptConfirmation(upload('{"prompt":"hello WALLED_SENSITIVE"}'), store), false);
  clock.now = 21_000;
  assert.equal(requestRequiresPromptConfirmation(upload('{"prompt":"hello WALLED_SENSITIVE"}'), store), true);
});

test('approval for one file does not authorize another file with marker', () => {
  const store = new ApprovalStore();
  store.approveFile(Buffer.from('first: WALLED_SENSITIVE'));
  assert.equal(requestRequiresPromptConfirmation(upload('first: WALLED_SENSITIVE'), store), false);
  assert.equal(requestRequiresPromptConfirmation(upload('second: WALLED_SENSITIVE'), store), true);
});


test('network guard detects marker split across upload parts', () => {
  const request = { method: 'POST', uploadData: [
    { bytes: Buffer.from('WALLED_') }, { bytes: Buffer.from('SENSITIVE') }
  ] };
  assert.equal(requestRequiresPromptConfirmation(request, new ApprovalStore()), true);
});
