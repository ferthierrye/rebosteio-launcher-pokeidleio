'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { KickPointsManager } = require('../src/domain/kick-points-service');

function fixture() {
  let clock = 100000;
  const cookies = Array.from({ length: 4 }, () => []);
  const calls = [];
  const users = ['viewer0', 'viewer1', 'viewer2', 'viewer3'];
  let reply = () => ({ status: 200, body: { data: { points: 321 } } });
  const manager = new KickPointsManager({
    now: () => clock,
    getSession: async i => ({ cookies: { get: async () => cookies[i] } }),
    openWindow: async () => {},
    request: async (i, _ses, url, headers) => {
      calls.push({ i, url });
      assert.equal(headers.Authorization, 'Bearer isolated-' + i);
      return url.endsWith('/api/v1/user')
        ? { status: 200, body: { id: i + 1, username: users[i] } } : reply(i, url);
    }
  });
  manager.configure({ masterEnabled: false, accounts: users.map(username => ({ username, enabled: true })) });
  manager.setChannels(['biscoitao', 'matta']);
  return { manager, cookies, calls, users, tick: () => { clock += 60000; },
    setReply: r => { reply = r; }, login: i => { cookies[i] = [{ name: 'session_token', value: 'isolated-' + i }]; } };
}

test('requires a session, verifies identity and isolates four accounts; only server balances count', async () => {
  const f = fixture();
  try {
    await f.manager.refresh(0, true);
    assert.equal(f.calls.length, 0);
    assert.equal(f.manager.getStatus().accounts[0].status, 'login_required');
    f.tick();
    for (let i = 0; i < 4; i++) { f.login(i); await f.manager.refresh(i, true); }
    for (const acc of f.manager.getStatus().accounts) assert.equal(acc.balances.biscoitao.points, 321);
    assert.ok(!JSON.stringify(f.manager.getStatus()).includes('isolated-'));
    f.setReply(() => ({ status: 200, body: { data: { points: 0 } } }));
    f.tick(); await f.manager.refresh(0, true);
    assert.equal(f.manager.getStatus().accounts[0].balances.biscoitao.points, 0);
    assert.equal(f.manager.getStatus().accounts[1].balances.biscoitao.points, 321);
  } finally { f.manager.dispose(); }
});

test('wrong authenticated identity never queries points or exposes another account balance', async () => {
  const f = fixture();
  try {
    f.login(0); f.users[0] = 'wrongviewer';
    await f.manager.refresh(0, true);
    assert.equal(f.manager.getStatus().accounts[0].status, 'account_mismatch');
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.manager.getStatus().accounts[0].balances, {});
  } finally { f.manager.dispose(); }
});

test('401, 403, 429 and malformed responses never become zero; refresh is deduplicated', async () => {
  const f = fixture();
  try {
    f.login(0); await f.manager.refresh(0, true);
    for (const [code, status] of [[401, 'login_required'], [403, 'blocked'], [429, 'rate_limited']]) {
      f.tick(); f.setReply(() => ({ status: code, body: {} }));
      await Promise.all([f.manager.refresh(0, true), f.manager.refresh(0, true)]);
      const acc = f.manager.getStatus().accounts[0];
      assert.equal(acc.status, status);
      assert.equal(acc.balances.biscoitao.status, 'stale');
      assert.equal(acc.balances.biscoitao.points, 321);
    }
    f.tick(); f.setReply(() => ({ status: 200, body: { data: {} } }));
    await f.manager.refresh(0, true);
    assert.equal(f.manager.getStatus().accounts[0].balances.biscoitao.status, 'unavailable');
    f.tick(); f.setReply((_i, url) => url.includes('biscoitao')
      ? { status: 404, body: {} } : { status: 200, body: { data: { points: 45 } } });
    await f.manager.refresh(0, true);
    assert.equal(f.manager.getStatus().accounts[0].balances.matta.points, 45);
  } finally { f.manager.dispose(); }
});

test('identity changes while request is pending invalidate results', async () => {
  const f = fixture();
  try {
    f.login(0);
    let release;
    f.setReply(() => new Promise(resolve => { release = resolve; }));
    const job = f.manager.refresh(0, true);
    while (!release) await new Promise(resolve => setImmediate(resolve));
    f.manager.configure({ masterEnabled: false, accounts: [{ username: 'newviewer' }] });
    release({ status: 200, body: { data: { points: 99999 } } });
    await job;
    assert.deepEqual(f.manager.getStatus().accounts[0].balances, {});
  } finally { f.manager.dispose(); }
});


test('catalog availability is verified separately from balance and excludes paused rewards', async () => {
  const f = fixture();
  try {
    f.login(0);
    f.setReply((_i, url) => ({status:200,body:{data:url.endsWith('/rewards') ? [{
      id:'01M3WZ35RA642BBYFZ89CDQ23N',title:'Bônus +15% XP PokeIdle',description:'1 hora no PokeIdle',
      cost:300,is_enabled:true,is_paused:url.includes('/matta/'),is_user_input_required:false
    }] : url.endsWith('/channel-settings') ? {channel_points_enabled:true} : {points:321}}}));
    await f.manager.refresh(0,true);
    const balances=f.manager.getStatus().accounts[0].balances;
    const {forBalance}=require('../src/ui/kick-reward-status');
    assert.equal(forBalance(balances.biscoitao,'exp',100000).affordable.length,1);
    assert.equal(forBalance(balances.matta,'exp',100000).affordable.length,0);
  } finally {f.manager.dispose();}
});
