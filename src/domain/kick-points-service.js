'use strict';
const { kickRewardCatalog } = require('./kick-reward-catalog');

// Verified against kick.com's shipped ChannelPoints.getChannelPoints / UserQueries.get.
// No simulated earnings: only a successful authenticated response can supply a balance.
const cleanSlug = value => {
  const slug = String(value || '').trim().toLowerCase().replace(/^@/, '');
  return /^[a-z0-9_-]{1,40}$/.test(slug) ? slug : '';
};
const emptyAccount = () => ({ status: 'login_required', username: '', error: '', balances: {}, refreshing: false });

class KickPointsManager {
  constructor({ getSession, request, openWindow, now = Date.now, onAutoCapture = () => {}, onChange = () => {} }) {
    this.getSession = getSession;
    this.request = request;
    this.openWindow = openWindow;
    this.now = now;
    this.onAutoCapture = onAutoCapture;
    this.onChange = onChange;
    this.config = { masterEnabled: false, accounts: [] };
    this.accounts = Array.from({ length: 4 }, emptyAccount);
    this.channels = [];
    this.jobs = new Map();
    this.generation = [0, 0, 0, 0];
    this.timer = null;
    this.lastRefresh = [0, 0, 0, 0];
    this.disposed = false;
  }

  checkIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index > 3) throw new Error('Conta Kick inválida.');
  }

  configure(config) {
    const previous = this.config;
    this.config = {
      masterEnabled: !!config.masterEnabled,
      accounts: Array.from({ length: 4 }, (_, i) => ({
        username: cleanSlug(config.accounts?.[i]?.username),
        enabled: config.accounts?.[i]?.enabled !== false
      }))
    };
    for (let i = 0; i < 4; i++) {
      if (previous.accounts[i]?.username !== this.config.accounts[i].username ||
          previous.accounts[i]?.enabled !== this.config.accounts[i].enabled ||
          previous.masterEnabled !== this.config.masterEnabled) {
        this.generation[i]++;
        this.accounts[i] = emptyAccount();
        this.lastRefresh[i] = 0;
      }
    }
    clearInterval(this.timer);
    this.timer = null;
    if (this.config.masterEnabled) {
      this.timer = setInterval(() => this.refreshEnabled(), 60000);
      this.timer.unref?.();
      this.refreshEnabled();
    }
    this.emit();
  }

  setChannels(channels) {
    const next = [...new Set((channels || []).map(c => cleanSlug(c?.login || c?.slug || c)).filter(Boolean))].slice(0, 40);
    if (JSON.stringify(next) === JSON.stringify(this.channels)) return;
    this.channels = next;
    this.refreshEnabled();
  }

  refreshEnabled() {
    if (!this.config.masterEnabled) return;
    this.config.accounts.forEach((acc, i) => {
      if (acc.enabled && acc.username && !['blocked', 'account_mismatch'].includes(this.accounts[i].status)) {
        this.refresh(i).catch(() => {});
      }
    });
  }

  getStatus() {
    // Copies only non-secret data. Neither cookies nor bearer tokens cross IPC or get persisted.
    return { accounts: this.accounts.map(a => ({ ...a,
      balances: Object.fromEntries(Object.entries(a.balances).map(([k, v]) => [k, { ...v }]))
    })) };
  }

  emit() { this.onChange(this.getStatus()); }

  async open(index, channel) {
    this.checkIndex(index);
    await this.openWindow(index, 'https://kick.com/settings/profile');
    return { ok: true };
  }

  async refresh(index, force = false) {
    this.checkIndex(index);
    if (this.disposed) return this.getStatus();
    if (this.jobs.has(index)) return this.jobs.get(index);
    if (force && this.now() - this.lastRefresh[index] < 3000) return this.getStatus();
    if (!force && this.now() - this.lastRefresh[index] < 55000) return this.getStatus();
    const generation = this.generation[index];
    const job = this.refreshAccount(index, generation).finally(() => {
      this.jobs.delete(index);
      // A save/identity change while awaiting I/O must not strand the replacement configuration.
      if (!this.disposed && this.generation[index] !== generation) this.refresh(index, true).catch(() => {});
    });
    this.jobs.set(index, job);
    return job;
  }

  async refreshAccount(index, generation) {
    const state = this.accounts[index];
    const expected = this.config.accounts[index]?.username;
    const current = () => this.generation[index] === generation;
    state.refreshing = true;
    this.lastRefresh[index] = this.now();
    this.emit();
    try {
      const ses = await this.getSession(index);
      let cookies = await ses.cookies.get({ url: 'https://kick.com', name: 'session_token' });
      if (!cookies || !cookies.length) cookies = await ses.cookies.get({ name: 'session_token' });
      const token = cookies.find(c => c.name === 'session_token')?.value;
      if (!token) throw Object.assign(new Error('Entre na Kick nesta conta para consultar o saldo.'), { status: 'login_required' });
      const get = async suffix => {
        if (!current()) throw Object.assign(new Error('Configuração alterada.'), { status: 'cancelled' });
        const result = await this.request(index, ses, `https://kick.com${suffix}`, {
          Accept: 'application/json', Authorization: `Bearer ${token}`, 'x-app-platform': 'web', Referer: 'https://kick.com/'
        });
        if (result.status === 401) throw Object.assign(new Error('Sessão Kick expirada. Entre novamente.'), { status: 'login_required' });
        if (result.status === 403) throw Object.assign(new Error('A Kick bloqueou a consulta. Abra a página oficial e verifique a sessão.'), { status: 'blocked' });
        if (result.status === 429) throw Object.assign(new Error('Limite da Kick atingido. Aguarde antes de atualizar.'), { status: 'rate_limited' });
        if (result.status < 200 || result.status >= 300) throw Object.assign(new Error('Canal indisponível.'), { channelError: result.status });
        return result.body;
      };
      const rawUser = await get('/api/v1/user');
      const user = rawUser?.data || rawUser;
      const username = cleanSlug(user?.username);
      if (!username || !user?.id) throw new Error('A Kick não confirmou a identidade da sessão.');
      if (expected && username !== expected) throw Object.assign(new Error(`Sessão de @${username}; entre como @${expected}.`), { status: 'account_mismatch' });
      if (!expected) {
        this.config.accounts[index].username = username;
        if (this.onAutoCapture) this.onAutoCapture(index, username, this.config);
      }
      if (!current()) return this.getStatus();
      state.username = username;
      state.status = 'authenticated';
      state.error = '';
      for (const slug of [...this.channels]) {
        let raw;
        try { raw = await get(`/api/v2/channels/${encodeURIComponent(slug)}/points`); }
        catch (error) {
          if (!error.channelError) throw error;
          if (current()) state.balances[slug] = { status: 'unavailable', checkedAt: this.now() };
          continue;
        }
        const points = raw?.data?.points;
        if (!Number.isSafeInteger(points) || points < 0) {
          if (current()) state.balances[slug] = { status: 'unavailable', error: 'A Kick não retornou um saldo numérico.', checkedAt: this.now() };
        } else if (current()) {
          const balance = { status: 'verified', points, checkedAt: this.now(), catalogStatus: 'unavailable' };
          try {
            const catalog = await get(`/api/v2/channels/${slug}/rewards`);
            const settings = await get(`/api/v2/channels/${slug}/channel-points/channel-settings`);
            if (Array.isArray(catalog?.data) && settings?.data?.channel_points_enabled === true) {
              balance.rewards = kickRewardCatalog(catalog);
              balance.catalogStatus = 'verified';
            }
          } catch (error) {
            if (['login_required', 'rate_limited', 'cancelled'].includes(error.status)) throw error;
          }
          if (current()) state.balances[slug] = balance;
        }
      }
    } catch (error) {
      if (current()) {
        state.status = error.status || 'error';
        // Only our bounded messages escape; transport must never pass headers, cookies or bodies.
        state.error = ['login_required', 'blocked', 'rate_limited', 'account_mismatch'].includes(error.status)
          ? error.message : 'Não foi possível consultar o saldo da Kick. Tente atualizar novamente.';
        for (const value of Object.values(state.balances)) value.status = 'stale';
      }
    } finally {
      if (current()) { state.refreshing = false; this.emit(); }
    }
    return this.getStatus();
  }

  async captureSession(index) {
    this.checkIndex(index);
    if (this.disposed) return null;
    const ses = await this.getSession(index);
    let cookies = await ses.cookies.get({ url: 'https://kick.com', name: 'session_token' });
    if (!cookies || !cookies.length) cookies = await ses.cookies.get({ name: 'session_token' });
    const token = cookies.find(c => c.name === 'session_token')?.value;
    if (!token) return null;
    try {
      const res = await this.request(index, ses, 'https://kick.com/api/v1/user', {
        Accept: 'application/json', Authorization: `Bearer ${token}`, 'x-app-platform': 'web', Referer: 'https://kick.com/'
      });
      const rawUser = res?.body?.data || res?.body;
      const username = cleanSlug(rawUser?.username);
      if (username) {
        this.config.accounts[index] = { ...this.config.accounts[index], username };
        this.accounts[index].username = username;
        this.accounts[index].status = 'authenticated';
        this.accounts[index].error = '';
        if (this.onAutoCapture) this.onAutoCapture(index, username, this.config);
        this.refresh(index, true).catch(() => {});
        return username;
      }
    } catch {}
    return null;
  }

  invalidate(index) {
    this.checkIndex(index);
    this.generation[index]++;
    this.accounts[index] = emptyAccount();
    this.lastRefresh[index] = 0;
    this.emit();
    return this.refresh(index, true);
  }

  dispose() { this.disposed = true; clearInterval(this.timer); this.timer = null; this.generation = this.generation.map(g => g + 1); }
}

module.exports = { KickPointsManager, cleanSlug };
