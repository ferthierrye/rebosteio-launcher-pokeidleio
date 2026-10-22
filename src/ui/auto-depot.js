(function (root) {
  'use strict';
  function installAutoDepot() {
    if (typeof location !== 'undefined' && location.hostname !== 'pokeidle.io') return;
    if (window.__pioAutoDepot) return;
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    let account = null, enabled = false, connected = false, revision = 0, pending = false, ticking = false;
    let pokemons = new Map(), automation = {}, activeId = null;
    const status = window.__pioAutoDepot = { account: null, phase: 'aguardando conexão', enabled: false, lastSale: 0 };
    const key = id => 'pio:auto-depot:v2:' + id;
    const phase = () => { status.enabled = enabled; status.phase = !connected ? 'aguardando conexão' : enabled ? 'ligado: venda até nível 100 (1 min)' : 'desativado'; };
    status.setEnabled = async value => {
      if (!account || !connected) throw Error('Abra o personagem antes de configurar a venda.');
      const target = account;
      const version = ++revision; pending = true;
      status.phase = 'salvando';
      try {
        if (invoke) await invoke('auto_depot_set', { account: String(target), preferences: { enabled: !!value, configured: false } });
        else localStorage.setItem(key(target), JSON.stringify({ enabled: !!value }));
        if (account === target && version === revision) { enabled = !!value; phase(); }
        return { account: target, enabled: !!value, phase: status.phase };
      } catch (error) { if (account === target) status.phase = 'falha ao salvar'; throw error; } finally { if (version === revision) pending = false; }
    };
    async function observe(raw) {
      const m = raw.data && typeof raw.data === 'object' ? { ...raw, ...raw.data } : raw;
      const state = m.estado || (m.t === 'estado' ? m : {});
      if (!['welcome', 'estado'].includes(m.t)) return;
      if (m.t === 'estado' && state.id != null && String(state.id) !== String(account)) return;
      if (m.t === 'welcome') { automation = {}; activeId = null; }
      if (state.automation && typeof state.automation === 'object') automation = { ...automation, ...state.automation };
      if (Object.hasOwn(state, 'activeId')) activeId = state.activeId;
      if (Array.isArray(state.pokemons)) pokemons = new Map(state.pokemons.map(p => [String(p.id), p]));
      for (const p of state.pkMud || []) pokemons.set(String(p.id), { ...pokemons.get(String(p.id)), ...p });
      for (const id of state.pkFora || []) pokemons.delete(String(id));
      if (m.t !== 'welcome') return;
      ++revision; pending = false;
      pokemons = new Map((state.pokemons || []).map(p => [String(p.id), p]));
      status.lastSale = null;
      account = state.id; status.account = account; enabled = false; connected = true; phase();
      const target = account, version = revision;
      try {
        const pref = invoke ? await invoke('auto_depot_get', { account: String(target), legacy: null }) : JSON.parse(localStorage.getItem(key(target)) || '{}');
        if (account === target && revision === version) { enabled = pref.enabled === true; phase(); }
      } catch { if (account === target) status.phase = 'falha ao carregar preferências'; }
    }
    const hooked = new WeakSet();
    let current;
    function hook(socket) {
      if (!socket || hooked.has(socket)) return;
      hooked.add(socket);
      socket.addEventListener('message', e => { try { const m = JSON.parse(e.data); if (m.t === 'welcome') current = socket; if (socket === current) void observe(m); } catch {} });
      socket.addEventListener('close', () => { if (socket === current) { connected = false; phase(); } });
    }
    const Native = window.WebSocket;
    window.WebSocket = new Proxy(Native, { construct(target, args) { const socket = Reflect.construct(target, args); hook(socket); return socket; } });
    if (window.__poke?.sock) { current = window.__poke.sock; hook(current); if (window.__poke.ws?.welcome) void observe(window.__poke.ws.welcome); }
    // Read the shared native preference every tick so launcher changes also apply here.
    async function tick() {
      if (ticking || pending || !connected || !account || !current || current.readyState !== 1) return;
      ticking = true;
      const target = account, version = revision, socket = current;
      try {
        const pref = invoke ? await invoke('auto_depot_get', { account: String(target), legacy: null }) : JSON.parse(localStorage.getItem(key(target)) || '{}');
        if (target !== account || version !== revision || pending || socket !== current || !connected || socket.readyState !== 1) return;
        enabled = pref.enabled === true; phase();
        if (!enabled || (status.lastSale != null && Date.now() - status.lastSale < 60000)) return;
        // ateId covers every earlier ID, not only the candidates. Stop before
        // the first protected/unknown Pokémon in the sellable Depot. Team and
        // Collection are already excluded by the server's bulk sale operation.
        const locked = new Set((Array.isArray(automation.pokemonTravado) ? automation.pokemonTravado : []).map(String));
        const list = [...pokemons.values()].filter(p => p.slot == null && String(p.id) !== String(activeId) && !locked.has(String(p.id)));
        const numericId = p => Number(p.id);
        const validId = p => Number.isSafeInteger(numericId(p)) && numericId(p) > 0;
        if (list.some(p => !validId(p))) { status.phase = 'pausado: ID desconhecido'; return; }
        const safeLevel = p => p.level != null && Number.isInteger(Number(p.level)) && Number(p.level) >= 1 && Number(p.level) <= 100;
        const boundary = list.filter(p => !safeLevel(p)).reduce((min, p) => Math.min(min, numericId(p)), Infinity);
        const ateId = list.filter(p => p.slot == null && safeLevel(p) && numericId(p) < boundary).reduce((max, p) => Math.max(max, numericId(p)), 0);
        if (!ateId) status.phase = boundary !== Infinity ? 'aguardando: Depot bloqueado por nível 101+ ou desconhecido' : 'aguardando: nenhum Pokémon para vender no Depot';
        if (!Number.isSafeInteger(ateId) || ateId <= 0) return;
        socket.send(JSON.stringify({ t: 'shop.sellAllPokemons', ateId }));
        status.lastSale = Date.now();
      } catch { enabled = false; status.enabled = false; status.phase = 'falha; venda interrompida'; }
      finally { ticking = false; }
    }
    setInterval(() => { void tick(); }, 2000);
  }
  if (typeof module === 'object' && module.exports) module.exports = { installAutoDepot };
  else root.PioAutoDepot = { installAutoDepot };
})(typeof window === 'object' ? window : globalThis);
