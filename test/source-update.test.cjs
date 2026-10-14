const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');

test('source updater follows fork tracking and preserves dirty or diverged branches', () => {
  fs.mkdirSync(path.join(root, 'scratch'), {recursive: true});
  const fixture = fs.mkdtempSync(path.join(root, 'scratch', 'source update '));
  const remote = path.join(fixture, 'fork.git');
  const seed = path.join(fixture, 'seed');
  const clone = path.join(fixture, 'clone');
  function git(cwd, ...args) {
    const result = spawnSync('git', args, {cwd, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  function identity(cwd) {
    git(cwd, 'config', 'user.name', 'Source updater fixture');
    git(cwd, 'config', 'user.email', 'fixture@example.invalid');
  }
  function update() {
    return spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(clone, 'tools', 'update-source.ps1')], {cwd: clone, encoding: 'utf8'});
  }
  git(fixture, 'init', '--bare', '--initial-branch=main', remote);
  git(fixture, 'clone', remote, seed);
  identity(seed);
  fs.mkdirSync(path.join(seed, 'tools'));
  fs.copyFileSync(path.join(root, 'tools', 'update-source.ps1'), path.join(seed, 'tools', 'update-source.ps1'));
  fs.writeFileSync(path.join(seed, 'value.txt'), 'initial');
  git(seed, 'add', '.'); git(seed, 'commit', '-m', 'initial'); git(seed, 'push', '-u', 'origin', 'main');
  git(fixture, 'clone', remote, clone); identity(clone);
  fs.writeFileSync(path.join(seed, 'value.txt'), 'updated from fork');
  git(seed, 'commit', '-am', 'fork update'); git(seed, 'push');
  assert.equal(update().status, 0);
  assert.equal(fs.readFileSync(path.join(clone, 'value.txt'), 'utf8'), 'updated from fork');
  assert.equal(git(clone, 'remote', 'get-url', 'origin'), remote);

  fs.writeFileSync(path.join(clone, 'value.txt'), 'local edit');
  assert.equal(update().status, 0);
  assert.equal(fs.readFileSync(path.join(clone, 'value.txt'), 'utf8'), 'local edit');
  git(clone, 'restore', 'value.txt');
  fs.writeFileSync(path.join(clone, 'untracked.txt'), 'keep');
  fs.writeFileSync(path.join(seed, 'remote.txt'), 'new remote change');
  git(seed, 'add', '.'); git(seed, 'commit', '-m', 'another remote update'); git(seed, 'push');
  const previous = git(clone, 'rev-parse', 'HEAD');
  assert.equal(update().status, 0);
  assert.equal(git(clone, 'rev-parse', 'HEAD'), previous);
  fs.unlinkSync(path.join(clone, 'untracked.txt'));

  fs.writeFileSync(path.join(clone, 'local.txt'), 'local commit');
  git(clone, 'add', '.'); git(clone, 'commit', '-m', 'local divergence');
  const localHead = git(clone, 'rev-parse', 'HEAD');
  assert.notEqual(update().status, 0);
  assert.equal(git(clone, 'rev-parse', 'HEAD'), localHead);
  assert.equal(fs.readFileSync(path.join(clone, 'local.txt'), 'utf8'), 'local commit');
  git(clone, 'switch', '-c', 'without-upstream');
  assert.equal(update().status, 0);
  assert.equal(git(clone, 'rev-parse', 'HEAD'), localHead);
});
