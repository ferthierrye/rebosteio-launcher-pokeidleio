const test = require('node:test');
const assert = require('node:assert/strict');
const { KickPointsManager } = require('../src/domain/kick-points-service.js');

test('KickPointsManager auto-captures username and triggers onAutoCapture when session exists', async () => {
  let captured = null;
  const config = {
    accounts: [
      { username: '', enabled: true },
      { username: 'existing_user', enabled: true },
      { username: '', enabled: true },
      { username: '', enabled: true }
    ]
  };

  const fakeSession = {
    cookies: {
      get: async (opts) => {
        if (opts.name === 'session_token') {
          return [{ name: 'session_token', value: 'valid_cookie_123', domain: '.kick.com' }];
        }
        return [];
      }
    }
  };

  const fakeRequest = async (index, ses, url, headers) => {
    if (url === 'https://kick.com/api/v1/user') {
      return {
        status: 200,
        body: { data: { id: 998877, username: 'autoCapturedNailo' } }
      };
    }
    if (url.includes('/points')) {
      return {
        status: 200,
        body: { data: { points: 1500 } }
      };
    }
    return { status: 404, body: {} };
  };

  const manager = new KickPointsManager({
    getSession: async () => fakeSession,
    request: fakeRequest,
    onAutoCapture: (idx, uname, cfg) => {
      captured = { idx, uname, cfg };
    }
  });

  manager.configure(config);
  manager.setChannels(['souonailo']);

  // Call captureSession for account 0
  const user = await manager.captureSession(0);
  assert.equal(user, 'autocapturednailo');
  assert.ok(captured, 'onAutoCapture was fired');
  assert.equal(captured.idx, 0);
  assert.equal(captured.uname, 'autocapturednailo');
  assert.equal(captured.cfg.accounts[0].username, 'autocapturednailo');

  // Verify status reflects authenticated state
  const status = manager.getStatus();
  assert.equal(status.accounts[0].username, 'autocapturednailo');
  assert.equal(status.accounts[0].status, 'authenticated');

  manager.dispose();
});
