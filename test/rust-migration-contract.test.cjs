const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('every launcher IPC command is allowed exclusively on the local main webview', () => {
  const cap = JSON.parse(read('rust-migration/src-tauri/capabilities/default.json'));
  assert.deepEqual(cap.webviews, ['main']);
  assert.ok(!cap.windows?.length, 'window-scoped permissions also include remote child webviews');
  assert.equal(cap.remote, undefined);
  const permission = read('rust-migration/src-tauri/permissions/launcher.toml');
  const allowed = new Set([...permission.split('commands.allow =')[1].matchAll(/"([a-z_]+)"/g)].map(m => m[1]));
  const commands = [...read('rust-migration/ui/tauri-bridge.js').matchAll(/invoke\('([a-z_]+)'/g)].map(m => m[1]);
  for (const command of commands) assert.ok(allowed.has(command), `Missing launcher ACL: ${command}`);
  for (const command of ['report_gameplay', 'webview_eval_result', 'game_console_message']) assert.ok(!allowed.has(command));
  const game = JSON.parse(read('rust-migration/src-tauri/capabilities/gameplay.json'));
  assert.equal(game.local, false);
  assert.deepEqual(game.remote.urls, ['https://pokeidle.io/*']);
  assert.ok(!game.permissions.includes('allow-launcher'));
});

test('the launcher update version agrees with its lock file', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(pkg.version, lock.version);
  assert.equal(pkg.version, lock.packages[''].version);
  assert.equal(pkg.version, JSON.parse(read('rust-migration/src-tauri/tauri.conf.json')).version);
  assert.equal(pkg.version, read('rust-migration/src-tauri/Cargo.toml').match(/^version = "([^"]+)"/m)[1]);
  assert.equal(pkg.version, read('rust-migration/src-tauri/Cargo.lock').match(/name = "pio-nailo-rust"\r?\nversion = "([^"]+)"/)[1]);
  assert.equal(pkg.version, read('rust-migration/ui/tauri-bridge.js').match(/appVersion: '([^']+)'/)[1]);
});
