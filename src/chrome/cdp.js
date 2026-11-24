'use strict';

const { EventEmitter } = require('node:events');

class CDPConnection extends EventEmitter {
  constructor(url, { WebSocketImpl = globalThis.WebSocket, timeoutMs = 20000 } = {}) {
    super();
    if (!WebSocketImpl) throw new Error('This Electron/Node runtime does not provide WebSocket.');
    this.url = url;
    this.WebSocketImpl = WebSocketImpl;
    this.timeoutMs = timeoutMs;
    this.seq = 0;
    this.pending = new Map();
    this.socket = null;
    this.closed = false;
  }

  async connect() {
    const socket = new this.WebSocketImpl(this.url);
    this.socket = socket;
    await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => fail(new Error('Timed out connecting to managed Chrome')), this.timeoutMs);
      const clear = () => clearTimeout(timer);
      const ready = () => { if (!settled) { settled = true; clear(); resolve(); } };
      const fail = error => { if (!settled) { settled = true; clear(); reject(error); } };
      socket.addEventListener('open', ready, { once: true });
      socket.addEventListener('error', () => fail(new Error('Chrome debugging connection failed')), { once: true });
      socket.addEventListener('close', () => fail(new Error('Chrome connection closed before opening')), { once: true });
    });
    socket.addEventListener('message', event => this.receive(String(event.data)));
    socket.addEventListener('close', () => this.closeWithError(new Error('Managed Chrome connection lost')));
    socket.addEventListener('error', () => this.closeWithError(new Error('Managed Chrome socket error')));
    return this;
  }

  receive(data) {
    let message;
    try { message = JSON.parse(data); } catch (_) { return; }
    if (typeof message.id === 'number') {
      const wait = this.pending.get(message.id);
      if (!wait) return;
      this.pending.delete(message.id);
      clearTimeout(wait.timer);
      if (message.error) wait.reject(new Error(`${wait.method}: ${message.error.message || 'CDP error'}`));
      else wait.resolve(message.result || {});
    } else if (message.method) {
      // Dispatch immediately; handlers must not block command responses.
      this.emit('event', message);
    }
  }

  send(method, params = {}, sessionId) {
    if (this.closed || !this.socket || this.socket.readyState !== 1) {
      return Promise.reject(new Error('Chrome monitoring connection is not active'));
    }
    const id = ++this.seq;
    const command = { id, method, params };
    if (sessionId) command.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      try { this.socket.send(JSON.stringify(command)); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  closeWithError(error) {
    if (this.closed) return;
    this.closed = true;
    for (const wait of this.pending.values()) { clearTimeout(wait.timer); wait.reject(error); }
    this.pending.clear();
    this.emit('disconnected', error);
  }

  close() {
    if (!this.closed) this.closeWithError(new Error('Chrome monitor closed'));
    try { this.socket?.close(); } catch (_) { /* closing */ }
  }
}

module.exports = { CDPConnection };
