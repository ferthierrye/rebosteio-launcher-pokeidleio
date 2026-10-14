'use strict';

const assert = require('node:assert/strict');
const {
  KickAccountClient,
  KickPresenceManager,
  DEFAULT_PARTNER_CHANNELS
} = require('../src/domain/kick-presence-service');

(async () => {
  // Mock WebSocket
  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0; // CONNECTING
      this.sent = [];
      setTimeout(() => {
        this.readyState = 1; // OPEN
        if (typeof this.onopen === 'function') this.onopen();
      }, 10);
    }
    send(data) {
      this.sent.push(data);
    }
    close() {
      this.readyState = 3; // CLOSED
      if (typeof this.onclose === 'function') this.onclose();
    }
  }

  global.WebSocket = MockWebSocket;

  const mockTransport = {
    getSession: async () => ({
      cookies: {
        get: async () => [{ name: 'session_token', value: 'fake_jwt_token_123' }]
      }
    }),
    request: async (_index, _ses, url) => {
      if (url.includes('/api/v1/user')) {
        return { status: 200, body: { data: { id: 7777 } } };
      }
      if (url.includes('/viewer/v1/token')) {
        return { status: 200, body: { data: { token: 'mock_ws_token' } } };
      }
      if (url.includes('/api/v2/channels/')) {
        const slug = url.split('/').pop();
        if (slug === 'biscoitao' || slug === 'surskity') {
          return {
            status: 200,
            body: {
              id: 111,
              chatroom: { id: 222 },
              livestream: { id: 999, is_live: true }
            }
          };
        }
        return {
          status: 200,
          body: {
            id: 333,
            chatroom: { id: 444 },
            livestream: null
          }
        };
      }
      return { status: 404, body: null };
    }
  };

  const client = new KickAccountClient(0);
  client.setTransport(mockTransport);
  client.setCredentials('viewer1', 'tok', true);

  // 1. Inicia sem alvos -> status waiting_live
  client.setTargetChannels([]);
  assert.equal(client.status, 'waiting_live');
  assert.equal(client.connections.size, 0);

  // 2. Streamer A (biscoitao) entra ao vivo -> conecta
  client.setTargetChannels(['biscoitao']);
  await new Promise(r => setTimeout(r, 60));

  assert.equal(client.status, 'connected');
  assert.equal(client.connections.size, 1);
  assert.ok(client.connections.has('biscoitao'));
  assert.equal(client.activeChannel, 'biscoitao');

  // 3. Streamer B (surskity) abre live DEPOIS que já estamos conectados -> conecta no novo também
  client.setTargetChannels(['biscoitao', 'surskity']);
  await new Promise(r => setTimeout(r, 60));

  assert.equal(client.status, 'connected');
  assert.equal(client.connections.size, 2);
  assert.ok(client.connections.has('biscoitao'), 'Mantem canal A conectado');
  assert.ok(client.connections.has('surskity'), 'Conecta dinamicamente ao novo canal B');

  // 4. Streamer A (biscoitao) encerra a live -> desconecta apenas A, mantém B
  client.setTargetChannels(['surskity']);
  assert.equal(client.connections.size, 1);
  assert.ok(!client.connections.has('biscoitao'), 'Remove canal offline');
  assert.ok(client.connections.has('surskity'), 'Mantem canal ainda ao vivo');
  assert.equal(client.activeChannel, 'surskity');

  // 5. KickPresenceManager live monitor detecta canais
  const manager = new KickPresenceManager();
  manager.setTransport(mockTransport);
  manager.masterEnabled = true;

  await manager.checkLiveChannels();
  assert.ok(manager.liveChannels.includes('biscoitao'), 'Manager detecta biscoitao live');
  assert.ok(manager.liveChannels.includes('surskity'), 'Manager detecta surskity live');
  assert.ok(!manager.liveChannels.includes('matta'), 'Manager detecta matta offline');

  manager.stopAll();
  client.disconnect();

  console.log('PASS: Kick dynamic live stream connection test passed completely!');
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
