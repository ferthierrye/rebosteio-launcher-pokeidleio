'use strict';

const { cleanSlug } = require('./kick-points-service');

// Opens real, visible official pages. This controller does not generate viewer events.
class KickWatchManager {
  constructor({ points, open, close, onChange = () => {}, now = Date.now }) {
    Object.assign(this, { points, open, close, onChange, now });
    this.channels = [];
    this.states = Array.from({ length: 4 }, () => ({ enabled: false, status: 'stopped', channel: '', error: '' }));
    this.generation = [0, 0, 0, 0];
    this.pending = new Map();
  }
  getStatus() { return this.states.map(state => ({ ...state })); }
  emit() { this.onChange(); }
  setChannels(channels) {
    this.channels = [...new Set((channels || []).filter(c => c && c.aoVivo === true && c.ativo !== false)
      .map(c => cleanSlug(c.login || c.slug)).filter(Boolean))].slice(0, 40);
    this.states.forEach((state, i) => { if (state.enabled) this.reconcile(i).catch(() => {}); });
  }
  configure() {
    this.states.forEach((state, i) => {
      const config = this.points.config;
      if (state.enabled && (!config.masterEnabled || !config.accounts[i]?.enabled ||
          state.username !== config.accounts[i]?.username)) this.stop(i);
    });
  }
  async start(index) {
    this.points.checkIndex(index);
    const config = this.points.config;
    if (!config.masterEnabled || !config.accounts[index]?.enabled) throw new Error('Ative o acompanhamento e esta conta antes de assistir.');
    await this.points.refresh(index, true);
    const account = this.points.getStatus().accounts[index];
    if (account.status !== 'authenticated' || account.username !== config.accounts[index]?.username) {
      throw new Error('Confirme o login desta conta na Kick antes de iniciar.');
    }
    const state = this.states[index];
    state.enabled = true;
    state.username = account.username;
    await this.reconcile(index);
    return this.getStatus();
  }
  stop(index, close = true) {
    this.points.checkIndex(index);
    this.generation[index]++;
    this.states[index] = { enabled: false, status: 'stopped', channel: '', error: '' };
    if (close) this.close(index);
    this.emit();
    return this.getStatus();
  }
  async reconcile(index) {
    if (this.pending.has(index)) return this.pending.get(index);
    const generation = this.generation[index];
    const task = this.openNext(index, generation).finally(() => this.pending.delete(index));
    this.pending.set(index, task);
    return task;
  }
  async openNext(index, generation) {
    const state = this.states[index];
    if (!state.enabled) return;
    if (state.channel && this.channels.includes(state.channel) && state.status === 'page_open') return;
    const channel = this.channels[0];
    if (!channel) {
      state.channel = ''; state.status = 'waiting'; state.error = '';
      this.close(index); this.emit(); return;
    }
    state.channel = channel; state.status = 'opening'; state.error = ''; this.emit();
    try {
      await this.open(index, `https://kick.com/${channel}`, false);
      if (this.generation[index] !== generation || !state.enabled) return;
      state.status = 'page_open'; state.openedAt = this.now();
      // Page load does not prove playback or watch-time credit.
    } catch {
      if (this.generation[index] === generation) {
        state.status = 'error'; state.error = 'Não foi possível abrir a live. Pare e tente iniciar novamente.';
      }
    }
    this.emit();
  }
  dispose() { this.states.forEach((_, i) => this.stop(i)); }
}

module.exports = { KickWatchManager };
