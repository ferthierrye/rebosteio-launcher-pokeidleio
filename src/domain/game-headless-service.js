/**
 * @file game-headless-service.js
 * Gerenciador headless nativo do PokeIdle via WebSocket puro (wss://pokeidle.io/).
 * Emula o protocolo oficial do cliente do jogo sem instanciar Chromium WebViews,
 * reduzindo o consumo de memória RAM para <150MB no total do sistema.
 */

'use strict';

const EventEmitter = require('events');

class PokeIdleHeadlessClient extends EventEmitter {
  constructor(accountIndex, options = {}) {
    super();
    this.index = accountIndex;
    this.wsUrl = options.wsUrl || 'wss://pokeidle.io/ws';
    this.token = options.token || '';
    this.nick = options.nick || ('Conta ' + (accountIndex + 1));
    this.auth = options.auth || '';
    this.ws = null;
    this.pingInterval = null;
    this.huntInterval = null;
    this.status = 'disconnected'; // 'connecting', 'connected', 'error', 'disconnected'
    this.lastError = '';

    // Snapshot unificado de telemetria compatível com o launcher
    this.state = {
      ok: true,
      i: accountIndex,
      name: this.nick,
      hunt: options.hunt || '',
      balls: options.balls || 0,
      equippedBall: options.equippedBall || { name: 'Pokeball', infinite: false },
      team: options.team || [],
      gold: options.gold || 0,
      diamonds: options.diamonds || 0,
      level: options.level || 0,
      activeId: options.activeId || null,
      twitch: options.twitch || null,
      kick: options.kick || null,
      invMap: options.invMap || {},
      rawDrops: options.rawDrops || {},
      a: {
        seconds: 0,
        xph: 0,
        shinyCap: 0,
        shinyFound: 0,
        kills: 0,
        balls: 0,
        captures: 0,
        ...(options.a || {})
      }
    };

    this.sessionStartTime = Date.now() - (this.state.a.seconds * 1000);
  }

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) {
      return;
    }

    this.status = 'connecting';
    this.emit('status', { index: this.index, status: this.status });

    try {
      const WS = typeof globalThis.WebSocket !== 'undefined' ? globalThis.WebSocket : null;
      if (!WS) {
        throw new Error('WebSocket não disponível no ambiente.');
      }

      this.ws = new WS(this.wsUrl);

      this.ws.onopen = () => {
        this.status = 'connected';
        this.lastError = '';
        this.emit('status', { index: this.index, status: this.status });

        // Handshake oficial inicial
        if (this.nick && this.token) {
          this.send({ t: 'hello', nick: this.nick, token: this.token });
        }

        // Heartbeat periódico (a cada 25s)
        clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          this.send({ t: 'ping' });
        }, 25000);

        // Atualizador de tempo de caça / segundos decorridos (a cada 1s)
        clearInterval(this.huntInterval);
        this.huntInterval = setInterval(() => {
          this.state.a.seconds = Math.max(0, Math.floor((Date.now() - this.sessionStartTime) / 1000));
          if (this.state.a.seconds > 0 && this.state.a.xp) {
            this.state.a.xph = Math.round((this.state.a.xp / this.state.a.seconds) * 3600);
          }
          this.emit('update', { index: this.index, state: this.getState() });
        }, 1000);
      };

      this.ws.onmessage = (event) => {
        try {
          this.handleMessage(event.data);
        } catch (err) {
          this.emit('error', { index: this.index, error: err });
        }
      };

      this.ws.onclose = () => {
        this.cleanup();
        this.status = 'disconnected';
        this.emit('status', { index: this.index, status: this.status });
      };

      this.ws.onerror = (err) => {
        this.status = 'error';
        this.lastError = (err && err.message) || 'Erro de conexão no WebSocket';
        this.emit('status', { index: this.index, status: this.status, error: this.lastError });
      };
    } catch (err) {
      this.status = 'error';
      this.lastError = err.message;
      this.emit('status', { index: this.index, status: this.status, error: this.lastError });
    }
  }

  handleMessage(raw) {
    if (!raw) return;
    let m = null;
    try {
      m = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return;
    }
    if (!m) return;

    let hasChange = false;

    // 1. Welcome / Handshake do servidor
    if (m.t === 'welcome') {
      const est = m.estado || {};
      if (est.nick) this.state.name = est.nick;
      if (est.activeId != null) this.state.activeId = est.activeId;
      if (est.level != null) this.state.level = est.level;
      if (est.gold != null) this.state.gold = est.gold;
      if (est.diamonds != null) this.state.diamonds = est.diamonds;
      if (est.huntSlug) this.state.hunt = est.huntSlug;

      if (Array.isArray(est.pokemons)) {
        this.state.team = est.pokemons.map(pk => ({
          id: pk.id,
          sid: pk.speciesId || pk.pokeId,
          name: pk.nome || pk.name,
          level: pk.level,
          shiny: !!pk.shiny,
          ld: pk.slot != null || pk.id === est.activeId
        }));
      }

      if (est.balls && typeof est.balls === 'object') {
        const total = Object.values(est.balls).reduce((sum, v) => sum + (+v || 0), 0);
        this.state.balls = total;
      }

      if (est.items && typeof est.items === 'object') {
        this.state.invMap = Object.assign({}, this.state.invMap, est.items);
      }

      if (est.twitch && typeof est.twitch === 'object') {
        this.state.twitch = est.twitch;
      }

      if (est.kick && typeof est.kick === 'object') {
        this.state.kick = est.kick;
      }

      hasChange = true;
    }

    // 2. Mudança de campo/hunt
    else if (m.t === 'campo.init' || m.type === 'field-init') {
      const slug = m.slug || '';
      if (slug && this.state.hunt !== slug) {
        this.state.hunt = slug;
        hasChange = true;
      }
    }

    // 3. Eventos de batalha (kills, exp, loot, shinies, bolas, capturas)
    else if (m.t === 'batalha' && Array.isArray(m.ev)) {
      for (const ev of m.ev) {
        if (!ev) continue;
        if (ev.k === 'spawn' && ev.shiny) {
          this.state.a.shinyFound = (this.state.a.shinyFound || 0) + 1;
          hasChange = true;
        } else if (ev.k === 'morte' && ev.quem === 'selvagem') {
          this.state.a.kills = (this.state.a.kills || 0) + 1;
          this.state.a.xp = (this.state.a.xp || 0) + (ev.xp || ev.xpTreinador || 0);
          if (ev.shiny) {
            this.state.a.shinyFound = (this.state.a.shinyFound || 0) + 1;
          }
          if (Array.isArray(ev.drops)) {
            if (!this.state.rawDrops) this.state.rawDrops = {};
            if (!this.state.invMap) this.state.invMap = {};
            for (const l of ev.drops) {
              const k = l.itemId || l.id || l.nome;
              const q = l.qtd || l.qty || 1;
              const d = this.state.rawDrops[k] || (this.state.rawDrops[k] = { id: l.itemId || l.id || 0, name: l.nome || '', qty: 0 });
              d.qty += q;
              if (l.itemId != null) {
                const cur = Number(this.state.invMap[l.itemId]) || 0;
                this.state.invMap[l.itemId] = cur + q;
              }
            }
          }
          hasChange = true;
        } else if (ev.k === 'bossMorto') {
          this.state.a.xp = (this.state.a.xp || 0) + (ev.xp || ev.xpTreinador || 0);
          if (Array.isArray(ev.drops)) {
            if (!this.state.rawDrops) this.state.rawDrops = {};
            if (!this.state.invMap) this.state.invMap = {};
            for (const l of ev.drops) {
              const k = l.itemId || l.id || l.nome;
              const q = l.qtd || l.qty || 1;
              const d = this.state.rawDrops[k] || (this.state.rawDrops[k] = { id: l.itemId || l.id || 0, name: l.nome || '', qty: 0 });
              d.qty += q;
              if (l.itemId != null) {
                const cur = Number(this.state.invMap[l.itemId]) || 0;
                this.state.invMap[l.itemId] = cur + q;
              }
            }
          }
          hasChange = true;
        } else if (ev.k === 'bola') {
          this.state.a.balls = (this.state.a.balls || 0) + 1;
          if (this.state.balls > 0) this.state.balls--;
          hasChange = true;
        } else if (ev.k === 'capturado') {
          this.state.a.captures = (this.state.a.captures || 0) + 1;
          if (ev.pokemon && ev.pokemon.shiny) {
            this.state.a.shinyCap = (this.state.a.shinyCap || 0) + 1;
          }
          hasChange = true;
        }
      }
    }

    // 4. Estado contínuo
    else if (m.t === 'estado') {
      const est = m.estado || {};
      if (est.gold != null) { this.state.gold = est.gold; hasChange = true; }
      if (est.level != null) { this.state.level = est.level; hasChange = true; }
      if (est.xp != null) { hasChange = true; }
      if (est.huntSlug && this.state.hunt !== est.huntSlug) { this.state.hunt = est.huntSlug; hasChange = true; }
      if (est.balls && typeof est.balls === 'object') {
        const total = Object.values(est.balls).reduce((sum, v) => sum + (+v || 0), 0);
        this.state.balls = total;
        hasChange = true;
      }
      if (est.items && typeof est.items === 'object') {
        this.state.invMap = Object.assign({}, this.state.invMap, est.items);
        hasChange = true;
      }
      if (est.twitch && typeof est.twitch === 'object') {
        this.state.twitch = Object.assign(this.state.twitch || {}, est.twitch);
        hasChange = true;
      }
      if (est.kick && typeof est.kick === 'object') {
        this.state.kick = Object.assign(this.state.kick || {}, est.kick);
        hasChange = true;
      }
      if (Array.isArray(est.pkMud) && Array.isArray(this.state.team)) {
        for (const pk of est.pkMud) {
          const match = this.state.team.find(p => p.id === pk.id);
          if (match) {
            if (pk.level != null) match.level = pk.level;
            if (pk.hp != null) match.hp = pk.hp;
          }
        }
        hasChange = true;
      }
    }

    // 5. Catch result
    else if (m.type === 'catch-result') {
      this.state.a.balls = (this.state.a.balls || 0) + 1;
      if (m.success) {
        this.state.a.captures = (this.state.a.captures || 0) + 1;
      }
      hasChange = true;
    }

    if (hasChange) {
      this.emit('update', { index: this.index, state: this.getState() });
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === 1) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      this.ws.send(payload);
      return true;
    }
    return false;
  }

  changeHunt(slug) {
    return this.send({ type: 'enter-hunt', t: 'hunt.select', slug });
  }

  throwBall(ballId) {
    return this.send({ t: 'ball.throw', ballId });
  }

  getState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.huntInterval) {
      clearInterval(this.huntInterval);
      this.huntInterval = null;
    }
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        if (this.ws.readyState === 0 || this.ws.readyState === 1) {
          this.ws.close();
        }
      } catch {}
      this.ws = null;
    }
  }

  disconnect() {
    this.cleanup();
    this.status = 'disconnected';
    this.emit('status', { index: this.index, status: this.status });
  }
}

class GameHeadlessManager extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map(); // index -> PokeIdleHeadlessClient
  }

  start(accountIndex, options = {}) {
    this.stop(accountIndex);
    const client = new PokeIdleHeadlessClient(accountIndex, options);
    this.clients.set(accountIndex, client);

    client.on('update', data => this.emit('update', data));
    client.on('status', data => this.emit('status', data));
    client.on('error', data => this.emit('error', data));

    client.connect();
    return client;
  }

  stop(accountIndex) {
    const existing = this.clients.get(accountIndex);
    if (existing) {
      existing.disconnect();
      this.clients.delete(accountIndex);
      return true;
    }
    return false;
  }

  stopAll() {
    for (const [idx] of this.clients) {
      this.stop(idx);
    }
  }

  getClient(accountIndex) {
    return this.clients.get(accountIndex) || null;
  }

  getStatus(accountIndex) {
    const client = this.getClient(accountIndex);
    if (!client) {
      return { active: false, status: 'disconnected', state: null };
    }
    return {
      active: true,
      status: client.status,
      state: client.getState()
    };
  }

  isMasterBlasterActive(accountIndex) {
    const client = this.getClient(accountIndex);
    return !!(client && client.status === 'connected');
  }
}

const gameHeadlessManager = new GameHeadlessManager();

module.exports = {
  PokeIdleHeadlessClient,
  GameHeadlessManager,
  gameHeadlessManager
};
