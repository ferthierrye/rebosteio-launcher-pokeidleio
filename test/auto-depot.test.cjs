const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { installAutoDepot } = require('../src/ui/auto-depot');

function setup(invoke) {
  let now = 100000, tick;
  const store = new Map();
  class Socket {
    constructor() { this.readyState = 1; this.handlers = {}; this.sent = []; }
    addEventListener(t, f) { (this.handlers[t] ||= []).push(f); }
    send(s) { this.sent.push(JSON.parse(s)); }
    emit(m) { for (const f of this.handlers.message || []) f({ data: JSON.stringify(m) }); }
    close() { this.readyState = 3; for (const f of this.handlers.close || []) f(); }
  }
  const w = { WebSocket: Socket };
  if (invoke) w.__TAURI_INTERNALS__ = { invoke };
  vm.runInNewContext('(' + installAutoDepot.toString() + ')()', {
    window: w, Date: { now: () => now }, document: { querySelector: () => null },
    localStorage: { getItem: k => store.get(k), setItem: (k, v) => store.set(k, v) },
    setInterval: f => { tick = f; }
  });
  return { w, store, socket: () => new w.WebSocket(), tick: () => { now += 6000; tick(); }, minute: () => { now += 60000; tick(); } };
}
const protections = { autoLockShiny: true, autoLockNota9: true, autoLockNotaMin: 3.5, autoLockP5: true, pokemonTravado: [2] };
function welcome(s, id = 1, auto = {}) {
  s.emit({ t: 'welcome', estado: { id, automation: auto, pokemons: [{ id: 1, slot: 0 }, { id: 2, slot: null }, { id: 3, slot: null }] } });
}
test('waits for each server confirmation before selling; persists initialization', () => {
  const e = setup(), s = e.socket(); welcome(s);
  e.tick(); assert.deepEqual(s.sent.at(-1), { t: 'shop.autoLockShiny', ativo: true });
  assert.equal(e.store.size, 0);
  s.emit({ t: 'estado', estado: { automation: { autoLockShiny: true } } });
  e.tick(); assert.deepEqual(s.sent.at(-1), { t: 'shop.autoLockNota9', ativo: true, nota: 3.5 });
  s.emit({ t: 'estado', estado: { automation: { autoLockNota9: true, autoLockNotaMin: 3.5 } } });
  e.tick(); assert.deepEqual(s.sent.at(-1), { t: 'shop.autoLockP5', ativo: true });
  assert.ok(s.sent.every(c => c.t !== 'shop.sellAllPokemons'));
  s.emit({ t: 'estado', estado: { automation: protections } });
  e.tick(); assert.equal(JSON.parse(e.store.get('pio:auto-depot:v1:1')).configured, true);
  e.tick(); assert.deepEqual(s.sent.at(-1), { t: 'shop.sellAllPokemons', ateId: 3 });
  const count = s.sent.length; e.tick(); assert.equal(s.sent.length, count);
  e.minute(); assert.equal(s.sent.length, count + 1);
});
test('keeps later options, pauses for disabled protections and reconnects independently per character', () => {
  const e = setup(), s = e.socket(); welcome(s, 1, protections); e.tick(); e.tick();
  s.emit({ t: 'estado', estado: { automation: { autoLockP5: false } } });
  const n = s.sent.length; e.minute(); assert.equal(s.sent.length, n);
  s.close(); e.minute(); assert.equal(s.sent.length, n);
  const s2 = e.socket(); welcome(s2, 1, { ...protections, autoLockP5: false });
  e.minute(); assert.equal(s2.sent.length, 0);
  const s3 = e.socket(); welcome(s3, 2); e.tick();
  assert.equal(s3.sent[0].t, 'shop.autoLockShiny');
  assert.equal(e.store.has('pio:auto-depot:v1:2'), false);
});
test('disabled selling and delta removal prevent unnecessary sale requests', () => {
  const e = setup(), s = e.socket(); welcome(s, 1, protections); e.tick();
  e.store.set('pio:auto-depot:v1:1', JSON.stringify({ configured: true, enabled: false }));
  e.minute(); assert.equal(s.sent.length, 0);
  e.store.set('pio:auto-depot:v1:1', JSON.stringify({ configured: true, enabled: true }));
  s.emit({ t: 'estado', estado: { pkFora: [3] } }); e.minute();
  assert.equal(s.sent.length, 0);
  s.emit({ t: 'estado', estado: { pkMud: [{ id: 9, slot: null }] } }); e.minute();
  assert.deepEqual(s.sent.at(-1), { t: 'shop.sellAllPokemons', ateId: 9 });
});
test('native preferences override stale local settings and initialization is saved for Headless', async () => {
  const native = new Map();
  const e = setup(async (command, args) => {
    if (command === 'auto_depot_get') {
      if (!native.has(args.account)) native.set(args.account, args.legacy);
      return native.get(args.account);
    }
    assert.equal(command, 'auto_depot_set');
    native.set(args.account, args.preferences);
  });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  native.set('1', { enabled: false, configured: true });
  e.store.set('pio:auto-depot:v1:1', JSON.stringify({ enabled: true, configured: true }));
  const s = e.socket(); welcome(s, 1, protections); e.minute();
  assert.equal(s.sent.length, 0); await settle(); e.minute(); assert.equal(s.sent.length, 0);
  const s2 = e.socket(); welcome(s2, 2, protections); await settle();
  e.tick(); await settle();
  assert.equal(native.get('2').configured, true);
  e.tick(); assert.equal(s2.sent.at(-1).t, 'shop.sellAllPokemons');
  assert.equal(native.get('1').enabled, false);
});
test('native preference failure blocks sales', async () => {
  const e = setup(async () => { throw Error('storage unavailable'); });
  const s = e.socket(); welcome(s, 1, protections);
  await new Promise(resolve => setImmediate(resolve)); e.minute();
  assert.equal(s.sent.length, 0);
  assert.equal(e.w.__pioAutoDepot.phase, 'falha ao carregar preferências');
});
