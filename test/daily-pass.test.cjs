const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('rust-migration/src-tauri/src/daily_pass.js', 'utf8');
function account() {
  let now = 20000 * 86400000 + 10800000, tick;
  class Socket {
    static OPEN = 1;
    readyState = 1; handlers = {}; sent = [];
    addEventListener(t, cb) { (this.handlers[t] ||= []).push(cb); }
    send(s) { this.sent.push(JSON.parse(s)); }
    emit(m) { for (const cb of this.handlers.message || []) cb({ data: JSON.stringify(m) }); }
    close() { this.readyState = 3; for (const cb of this.handlers.close || []) cb(); }
  }
  const window = { WebSocket: Socket }; window.top = window;
  vm.runInNewContext(source, { window, location: { hostname: 'pokeidle.io' }, Date: { now: () => now }, setInterval: fn => { tick = fn; } });
  const s = new window.WebSocket();
  return { window, s, tick: () => tick(), advance: ms => { now += ms; }, now: () => now };
}
test('four accounts claim independently, only after eligible server snapshots', () => {
  const accounts = Array.from({ length: 4 }, account);
  for (const a of accounts) {
    a.tick(); assert.equal(a.s.sent.length, 0);
    a.s.emit({ t: 'welcome', estado: { level: 9 } }); a.tick(); assert.equal(a.s.sent.length, 0);
    a.s.emit({ t: 'estado', data: { level: 10 } }); a.tick();
    assert.deepEqual(a.s.sent, [{ t: 'passe.resgatar' }]);
    a.s.emit({ t: 'passe', resgate: { degrau: 1 } }); a.advance(60000); a.tick();
    assert.equal(a.s.sent.length, 1);
    assert.equal(a.window.__idleioDailyPass.state, 'confirmed');
  }
});
test('collected free pass, pending VIP, day rollover and reconnect', () => {
  const a = account();
  a.s.emit({ t: 'welcome', estado: { level: 10, passe: { ultimo: 20000, degrau: 30 } } });
  a.tick(); assert.equal(a.s.sent.length, 0);
  a.s.emit({ t: 'estado', passe: { ultimo: 20000, degrau: 30, vipAte: a.now() + 172800000 } });
  a.tick(); assert.equal(a.s.sent.length, 1);
  a.s.emit({ t: 'estado', passe: { ultimo: 20000, ultimoVip: 20000, degrau: 30, vipAte: a.now() + 172800000 } });
  a.advance(60000); a.tick(); assert.equal(a.s.sent.length, 1);
  a.advance(86400000); a.tick(); assert.equal(a.s.sent.length, 2);
  a.s.close(); a.advance(60000); a.tick(); assert.equal(a.s.sent.length, 2);
  const s = new a.window.WebSocket();
  s.emit({ t: 'welcome', estado: { level: 10, passe: { ultimo: 20001, degrau: 1 } } });
  a.tick(); assert.equal(s.sent.length, 0);
});
test('server clock controls midnight; missing confirmation permits only three attempts', () => {
  const a = account();
  a.s.emit({ t: 'welcome', estado: { level: 10, servidorAgora: a.now() - 1, passe: { ultimo: 19999, degrau: 2 } } });
  a.tick(); assert.equal(a.s.sent.length, 0);
  a.advance(1); a.tick(); assert.equal(a.s.sent.length, 1);
  a.advance(59999); a.tick(); assert.equal(a.s.sent.length, 1);
  a.advance(1); a.tick(); assert.equal(a.s.sent.length, 2);
  a.advance(60000); a.tick(); assert.equal(a.s.sent.length, 3);
  a.advance(60000); a.tick(); assert.equal(a.s.sent.length, 3);
  assert.equal(a.window.__idleioDailyPass.state, 'unconfirmed');
});
