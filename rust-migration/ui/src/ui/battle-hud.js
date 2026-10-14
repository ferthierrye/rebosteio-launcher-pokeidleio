(() => {
  'use strict';

  // Cache para mapeamento rápido de nome de Pokémon para dex ID
  let pokemonNameToDex = null;

  function initPokemonNameMap() {
    if (pokemonNameToDex) return;
    pokemonNameToDex = new Map();
    if (window.PIW_ALL_POKEMON_THEMES && Array.isArray(window.PIW_ALL_POKEMON_THEMES)) {
      for (const p of window.PIW_ALL_POKEMON_THEMES) {
        if (p && p.name && p.dex) {
          const clean = String(p.name).toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!pokemonNameToDex.has(clean)) {
            pokemonNameToDex.set(clean, p.dex);
          }
        }
      }
    }
  }

  function resolveDexFromHunt(huntName) {
    if (!huntName) return 0;
    initPokemonNameMap();
    // Match complete species names first, then whole-word suffixes of variant names.
    // Slugs and display names must follow the same path (hard_golem / Hard Golem).
    const words = String(huntName).toLowerCase()
      .replace(/[_-]+/g, ' ').trim().split(/\s+/);
    if (['hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'paldea'].includes(words[words.length - 1])) words.pop();
    const aliases = { nidoranfe: 'nidoranfemale', nidoranma: 'nidoranmale' };
    for (let i = 0; i < words.length; i++) {
      const key = words.slice(i).join('').replace(/[^a-z0-9]/g, '');
      const dex = pokemonNameToDex.get(aliases[key] || key);
      if (dex) return dex;
    }
    return 0;
  }

  function safeDex(sid) {
    try {
      return typeof dexId === 'function' ? dexId(+sid || 0) : (+sid || 0);
    } catch {
      return +sid || 0;
    }
  }

  function getSpriteUrl(dex, isShiny, isPaused, name) {
    if (!dex || dex <= 0) return '';
    const shinyPart = isShiny ? 'shiny/' : '';

    if (isPaused) {
      return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${shinyPart}${dex}.png`;
    }

    // Geração 1 a 5 (Black/White Animated)
    if (dex <= 649) {
      return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${shinyPart}${dex}.gif`;
    }

    // Gen 6+ via Showdown GIF com fallback
    const clean = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean) {
      return `https://play.pokemonshowdown.com/sprites/gen5${isShiny ? '-shiny' : ''}/${clean}.gif`;
    }

    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${shinyPart}${dex}.png`;
  }

  function formatHuntTime(seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }

  function fmtNumber(n) {
    n = +n || 0;
    return Math.round(n).toLocaleString('pt-BR');
  }

  function formatCompact(n) {
    n = +n || 0;
    const a = Math.abs(n), sg = n < 0 ? '-' : '';
    if (a >= 1e9) return sg + (a / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace('.0', '') + 'bi';
    if (a >= 1e6) return sg + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.0', '') + 'M';
    if (a >= 1e3) return sg + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace('.0', '') + 'k';
    return Math.round(a).toLocaleString('pt-BR');
  }

  const social = { twitch: null, kick: null, points: null };
  const gameSocial = new Map();
  function refreshSocial() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    Array.from(grid.children).forEach((panel, i) => PioBattleHud.updateSocial(panel, i));
  }

  const pausedPanels = new Set();
  try {
    const raw = localStorage.getItem('bsh_paused');
    if (raw) JSON.parse(raw).forEach(i => pausedPanels.add(+i));
  } catch {}

  function savePaused() {
    try {
      localStorage.setItem('bsh_paused', JSON.stringify(Array.from(pausedPanels)));
    } catch {}
  }

  const PioBattleHud = {
    updateSocial(panel, i) {
      const box = panel.querySelector('.battle-slot-hud');
      if (!box) return;
      const game = gameSocial.get(i) || {};
      const labels = { authenticated: 'Sessão confirmada', blocked: 'Consulta bloqueada', rate_limited: 'Aguarde', account_mismatch: 'Outra conta', connected: 'Conectada', connecting: 'Conectando', waiting_live: 'Sem live', error: 'Erro', login_required: 'Entrar', disconnected: 'Desconectada' };
      for (const platform of ['twitch', 'kick']) {
        const row = box.querySelector('.bsh-social-' + platform);
        const status = social[platform]?.accounts?.[i]?.status;
        const telemetry = game[platform];
        const connected = status === 'connected' || status === 'authenticated';
        row.classList.toggle('is-connected', connected);
        box.querySelector('.bsh-' + platform + '-status').textContent = labels[status] || (platform === 'twitch' && telemetry?.assistindo ? 'Assistindo' : telemetry?.login ? 'Vinculada' : 'Aguardando');
        let bonus = 'Bônus —';
        if (telemetry) {
          if (platform === 'twitch') bonus = telemetry.assistindo && telemetry.pctAtual > 0 ? '+' + telemetry.pctAtual + '% XP' : 'Sem bônus';
          else bonus = [telemetry.bonusExp ? 'EXP +15%' : '', telemetry.bonusCatch ? 'Catch +15%' : '', telemetry.bonusLure ? 'Lure +15%' : ''].filter(Boolean).join(' · ') || 'Sem bônus';
        }
        box.querySelector('.bsh-' + platform + '-bonus').textContent = bonus;
      }
      const account = social.points?.accounts?.[i];
      const balances = Object.entries(account?.balances || {});
      const verified = balances.filter(([, b]) => b.status === 'verified' && Number.isSafeInteger(b.points));
      const total = verified.reduce((n, [, b]) => n + b.points, 0);
      const points = box.querySelector('.bsh-social-points');
      const gamePoints = game.kick?.pontos;
      points.textContent = !verified.length && Number.isFinite(gamePoints) ? fmtNumber(gamePoints) + ' pts no jogo' : verified.length ? fmtNumber(total) + ' pts' : 'Pontos —';
      points.title = balances.length ? balances.map(([channel, b]) => channel + ': ' + (b.status === 'verified' ? fmtNumber(b.points) : 'indisponível')).join('\n') : 'Aguardando saldo confirmado pela Kick';
      box.querySelector('.bsh-social-channels').textContent = verified.length ? verified.length + (verified.length === 1 ? ' canal' : ' canais') + (verified.length < balances.length ? ' · parcial' : '') : Number.isFinite(gamePoints) ? 'Saldo informado pelo jogo' : 'Sem saldo confirmado';
    },

    isHudActive(i) {
      try {
        return localStorage.getItem('bsh_mode_' + i) === '1' || this.isBlasterActive(i);
      } catch {
        return false;
      }
    },

    isBlasterActive(i) {
      try {
        return localStorage.getItem('bsh_blaster_' + i) === '1';
      } catch {
        return false;
      }
    },

    setHudActive(i, active) {
      try {
        localStorage.setItem('bsh_mode_' + i, active ? '1' : '0');
      } catch {}

      const grid = document.getElementById('grid');
      const panel = grid && grid.children[i];
      if (!panel) return;

      if (!active && this.isBlasterActive(i)) {
        this.setBlasterActive(i, false);
      }

      panel.classList.toggle('is-hud-active', active);

      // Atualiza o botão no cabeçalho do painel
      const btn = panel.querySelector('.btn-eco-hud');
      if (btn) {
        btn.classList.toggle('is-on', active);
        btn.setAttribute('aria-pressed', String(active));
      }

      const hud = panel.querySelector('.battle-slot-hud');
      if (hud) {
        this.updateBanner(hud, this.isBlasterActive(i));
      }

      // No Tauri: Garante que o Webview nativo seja ocultado quando o HUD estiver ativo
      if (window.pokeAPI && typeof window.pokeAPI.webviewSetVisible === 'function') {
        window.pokeAPI.webviewSetVisible(i, !active);
      }

      // Tauri has one owner for transient Economy: background_economy.js.
      // Never turn that temporary setting into a permanent manual preference.
      if (window.__TAURI__) {
        if (active && !this.isBlasterActive(i) && window.READ_STATE) {
          window.pokeAPI.webviewEval(i, window.READ_STATE).then(state => {
            if (state?.ok && this.isHudActive(i)) {
              if (window.stCache) window.stCache[i] = {t: Date.now(), d: state};
              this.update(panel, i, state);
            }
          }).catch(() => {});
        }
        return;
      }

      // Aplica suspensão do Webview (quando não estiver no modo Blaster)
      if (!this.isBlasterActive(i) && typeof webviews !== 'undefined' && webviews[i] && !(typeof off !== 'undefined' && off[i])) {
        const wv = webviews[i];
        try {
          if (active) {
            wv.setAudioMuted(true);
            if (typeof ultraScript === 'function') wv.executeJavaScript(ultraScript(true)).catch(() => {});
            if (typeof inGameEcoScript === 'function') wv.executeJavaScript(inGameEcoScript(true)).catch(() => {});
            if (typeof ecoScript === 'function') wv.executeJavaScript(ecoScript(1)).catch(() => {});
          } else {
            const isMuted = typeof muted !== 'undefined' ? muted : false;
            wv.setAudioMuted(isMuted);
            if (typeof ultraScript === 'function') wv.executeJavaScript(ultraScript(false)).catch(() => {});
            const fps = typeof ecoFps === 'function' ? ecoFps() : 0;
            if (typeof ecoScript === 'function') wv.executeJavaScript(ecoScript(fps)).catch(() => {});
          }
        } catch {}
      }
    },

    setBlasterActive(i, active) {
      this._blasterGeneration ||= {};
      const generation = this._blasterGeneration[i] = (this._blasterGeneration[i] || 0) + 1;

      try {
        localStorage.setItem('bsh_blaster_' + i, active ? '1' : '0');
      } catch {}

      const grid = document.getElementById('grid');
      const panel = grid && grid.children[i];
      if (!panel) return;

      panel.classList.toggle('is-blaster-active', active);
      if (active) {
        panel.classList.add('is-hud-active');
        try { localStorage.setItem('bsh_mode_' + i, '1'); } catch {}
      }

      const blasterBtn = panel.querySelector('.btn-blaster-hud');
      if (blasterBtn) {
        blasterBtn.classList.toggle('is-on', active);
        blasterBtn.setAttribute('aria-pressed', String(active));
      }

      const ecoBtn = panel.querySelector('.btn-eco-hud');
      if (ecoBtn && active) {
        ecoBtn.classList.remove('is-on');
        ecoBtn.setAttribute('aria-pressed', 'false');
      }

      const hud = panel.querySelector('.battle-slot-hud');
      if (hud) {
        this.updateBanner(hud, active);
      }

      if (active) {
        if (window.pokeAPI && typeof window.pokeAPI.webviewSetVisible === 'function') {
          window.pokeAPI.webviewSetVisible(i, false);
        }
        // Coleta o estado mais recente para handoff contínuo
        const st = window.stCache?.[i]?.d || (typeof states !== 'undefined' && states.get(i)) || null;
        const p = window.__poke || {};
        const c = (typeof accounts !== 'undefined' && accounts[i]) || {};
        const config = {
          wsUrl: p.wsUrl || 'wss://pokeidle.io/ws',
          token: p.token || '',
          nick: p.nick || (c && c.name) || ('Conta ' + (i + 1)),
          auth: p.auth || '',
          // welcome restores the active hunt; the HUD text is a display name, not a protocol slug.
          balls: (st && st.balls) || 0,
          team: (st && st.team) || [],
          a: (st && st.a) || {}
        };

        const banner = hud && hud.querySelector('.bsh-mode-banner');
        if (banner) {
          banner.className = 'bsh-mode-banner is-blaster';
          banner.textContent = 'Conectando Headless...';
        }

        const handleSuccess = () => {
          if (this._blasterGeneration[i] !== generation || !this.isBlasterActive(i)) return;
          if (banner) {
            banner.textContent = 'Headless';
          }
        };

        const handleFail = (err) => {
          if (this._blasterGeneration[i] !== generation) return;
          if (banner) {
            banner.textContent = '⚠️ ' + String(err || 'Faça login na conta').slice(0, 160);
            panel.classList.remove('is-blaster-active');
            try { localStorage.setItem('bsh_blaster_' + i, '0'); } catch {}
            window.pokeAPI.blasterStop(i).catch(() => {});
          }
        };

        if (window.pokeAPI && typeof window.pokeAPI.blasterStartWithLogin === 'function') {
          window.pokeAPI.blasterStartWithLogin(i, config)
            .then(res => {
              if (res && res.ok) handleSuccess();
              else handleFail(res?.error);
            })
            .catch(handleFail);
        } else if (window.pokeAPI && typeof window.pokeAPI.blasterStart === 'function') {
          window.pokeAPI.blasterStart(i, config)
            .then(handleSuccess)
            .catch(handleFail);
        }

        const wv = panel.querySelector('webview');
        if (wv) {
          try { wv.setAudioMuted(true); } catch {}
        }
      } else {
        if (window.pokeAPI && typeof window.pokeAPI.blasterStop === 'function') {
          window.pokeAPI.blasterStop(i).catch(() => {});
        }
        if (!this.isHudActive(i) && window.pokeAPI && typeof window.pokeAPI.webviewSetVisible === 'function') {
          window.pokeAPI.webviewSetVisible(i, true);
        }
      }
    },

    toggleHud(i) {
      if (this.isBlasterActive(i)) {
        this.setBlasterActive(i, false);
        this.setHudActive(i, true);
        return;
      }
      const current = this.isHudActive(i);
      this.setHudActive(i, !current);
    },

    toggleBlaster(i) {
      const current = this.isBlasterActive(i);
      this.setBlasterActive(i, !current);
    },

    updateBanner(hud, isBlaster) {
      const banner = hud.querySelector('.bsh-mode-banner');
      const switchBtn = hud.querySelector('.bsh-switch-mode-btn');
      if (banner) {
        banner.className = 'bsh-mode-banner ' + (isBlaster ? 'is-blaster' : 'is-eco');
        banner.textContent = isBlaster
          ? 'Headless'
          : 'Painel de batalha';
      }
      if (switchBtn) {
        switchBtn.textContent = isBlaster
          ? 'Usar painel de batalha'
          : 'Ativar Headless';
      }
    },

    togglePause(i) {
      if (pausedPanels.has(i)) pausedPanels.delete(i);
      else pausedPanels.add(i);
      savePaused();
    },

    isPaused(i) {
      return pausedPanels.has(i);
    },

    mount(panel, i) {
      if (!panel || panel.querySelector('.battle-slot-hud')) return;

      const isBlaster = this.isBlasterActive(i);

      // 1. Cria a casca do HUD
      const hud = document.createElement('div');
      hud.className = 'battle-slot-hud';
      hud.setAttribute('data-panel', String(i));
      hud.innerHTML = `
        <div class="bsh-mode-banner ${isBlaster ? 'is-blaster' : 'is-eco'}">
          ${isBlaster ? 'Headless' : 'Painel de batalha'}
        </div>
        <aside class="bsh-social" aria-label="Twitch, Kick e pontos desta conta">
          <div class="bsh-social-twitch"><span class="bsh-social-brand">Twitch</span><span class="bsh-social-status bsh-twitch-status">Aguardando</span><span class="bsh-social-bonus bsh-twitch-bonus">Bônus —</span></div>
          <div class="bsh-social-kick"><span class="bsh-social-brand">Kick</span><span class="bsh-social-status bsh-kick-status">Aguardando</span><span class="bsh-social-bonus bsh-kick-bonus">Bônus —</span></div>
          <div class="bsh-social-wallet"><span class="bsh-social-points">Pontos —</span><span class="bsh-social-channels">Sem saldo confirmado</span></div>
        </aside>
        <div class="bsh-arena">
          <div class="bsh-fighter bsh-fighter-lead">
            <span class="bsh-fighter-tag">SEU POKÉMON</span>
            <div class="bsh-sprite-stage">
              <div class="bsh-stage-shadow"></div>
              <img class="bsh-sprite bsh-lead-sprite" alt="Seu Pokémon" onerror="this.style.opacity='0'">
            </div>
            <div class="bsh-fighter-name bsh-lead-name">—</div>
          </div>
          <div class="bsh-vs-badge">VS</div>
          <div class="bsh-fighter bsh-fighter-hunt">
            <span class="bsh-fighter-tag">CAÇA ATUAL</span>
            <div class="bsh-sprite-stage">
              <div class="bsh-stage-shadow"></div>
              <img class="bsh-sprite bsh-hunt-sprite" alt="Caça Atual" onerror="this.style.opacity='0'">
            </div>
            <div class="bsh-fighter-name bsh-hunt-name">—</div>
          </div>
        </div>
        <div class="bsh-controls-row">
          <button type="button" class="bsh-pause-btn">Pausar animação</button>
          <button type="button" class="bsh-switch-mode-btn">
            ${isBlaster ? 'Usar painel de batalha' : 'Ativar Headless'}
          </button>
        </div>
        <div class="bsh-divider"></div>
        <div class="bsh-stats-grid">
          <div class="bsh-stat-col">
            <span class="bsh-stat-label">Tempo de caça</span>
            <span class="bsh-stat-value bsh-val-time">0h 00m 00s</span>
          </div>
          <div class="bsh-stat-col">
            <span class="bsh-stat-label">Pokébolas</span>
            <span class="bsh-stat-value bsh-val-balls">—</span>
          </div>
          <div class="bsh-stat-col"><span class="bsh-stat-label">Poções</span><span class="bsh-stat-value bsh-val-potions">—</span></div>
          <div class="bsh-stat-col"><span class="bsh-stat-label">Revives</span><span class="bsh-stat-value bsh-val-revives">—</span></div>
          <div class="bsh-stat-col">
            <span class="bsh-stat-label">EXP / hora</span>
            <span class="bsh-stat-value bsh-val-xph">0</span>
          </div>
          <div class="bsh-stat-col">
            <span class="bsh-stat-label">Shinies</span>
            <span class="bsh-stat-value bsh-val-shinies">0</span>
          </div>
        </div>
        <button type="button" class="bsh-open-game-btn">
          Abrir jogo
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
            <path d="M7 17L17 7M17 7H7M17 7V17"/>
          </svg>
        </button>
      `;

      // Eventos internos do HUD
      const pauseBtn = hud.querySelector('.bsh-pause-btn');
      pauseBtn.onclick = () => {
        this.togglePause(i);
        pauseBtn.textContent = this.isPaused(i) ? 'Retomar animação' : 'Pausar animação';
        const st = window.stCache?.[i]?.d || (typeof states !== 'undefined' && states.get(i)) || null;
        if (st) this.update(panel, i, st);
      };

      const switchBtn = hud.querySelector('.bsh-switch-mode-btn');
      switchBtn.onclick = () => {
        const currentlyBlaster = this.isBlasterActive(i);
        if (currentlyBlaster) {
          this.setBlasterActive(i, false);
          this.setHudActive(i, true);
        } else {
          this.setBlasterActive(i, true);
        }
      };

      const openBtn = hud.querySelector('.bsh-open-game-btn');
      openBtn.onclick = () => {
        if (this.isBlasterActive(i)) {
          this.setBlasterActive(i, false);
        }
        this.setHudActive(i, false);
      };

      // Insere o HUD no painel
      panel.appendChild(hud);
      this.updateSocial(panel, i);

      // 2. Adiciona botões no cabeçalho do painel (.panel-header)
      const header = panel.querySelector('.panel-header');
      if (header) {
        const reloadBtn = header.querySelector('.reload') || header.querySelector('.expand');

        if (!header.querySelector('.btn-eco-hud')) {
          const toggleBtn = document.createElement('button');
          toggleBtn.className = 'btn-eco-hud';
          toggleBtn.type = 'button';
          toggleBtn.title = 'Mostrar painel de batalha';
          toggleBtn.setAttribute('aria-label', `Painel de batalha da conta ${i + 1}`);
          toggleBtn.setAttribute('aria-pressed', 'false');
          toggleBtn.textContent = 'Batalha';
          toggleBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleHud(i);
          };
          if (reloadBtn) header.insertBefore(toggleBtn, reloadBtn);
          else header.appendChild(toggleBtn);
        }

        if (!header.querySelector('.btn-blaster-hud')) {
          const blasterBtn = document.createElement('button');
          blasterBtn.className = 'btn-blaster-hud';
          blasterBtn.type = 'button';
          blasterBtn.title = 'Headless — jogo sem WebView';
          blasterBtn.setAttribute('aria-label', `Headless da conta ${i + 1}`);
          blasterBtn.setAttribute('aria-pressed', 'false');
          blasterBtn.textContent = 'Headless';
          blasterBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleBlaster(i);
          };
          if (reloadBtn) header.insertBefore(blasterBtn, reloadBtn);
          else header.appendChild(blasterBtn);
        }
      }

      // Restaura o estado salvo
      if (this.isBlasterActive(i)) {
        this.setBlasterActive(i, true);
      } else if (this.isHudActive(i)) {
        this.setHudActive(i, true);
      }
    },

    update(panel, i, state) {
      if (!panel) return;
      const hud = panel.querySelector('.battle-slot-hud');
      if (!hud) return;

      gameSocial.set(i, { twitch: state?.twitch, kick: state?.kick });
      this.updateSocial(panel, i);
      const isPaused = this.isPaused(i);
      const pauseBtn = hud.querySelector('.bsh-pause-btn');
      if (pauseBtn) {
        pauseBtn.textContent = isPaused ? 'Retomar animação' : 'Pausar animação';
      }

      state = window.PioInventory.project(state);
      const a = (state && state.a) || {};

      // 1. Líder do Jogador
      const lead = (state && state.team && state.team.length)
        ? (state.team.find(p => p.ld) || (state.activeId ? state.team.find(p => String(p.id) === String(state.activeId)) : null) || state.team[0])
        : null;

      const leadDex = lead ? safeDex(lead.sid) : 0;
      const leadSpriteEl = hud.querySelector('.bsh-lead-sprite');
      const leadNameEl = hud.querySelector('.bsh-lead-name');

      if (lead && leadDex > 0) {
        if (leadSpriteEl) leadSpriteEl.style.opacity = '1';
        const leadSrc = getSpriteUrl(leadDex, !!lead.shiny, isPaused, lead.name);
        if (leadSpriteEl && leadSpriteEl.getAttribute('data-src') !== leadSrc) {
          leadSpriteEl.setAttribute('data-src', leadSrc);
          leadSpriteEl.style.opacity = '1';
          leadSpriteEl.src = leadSrc;
          leadSpriteEl.onerror = () => {
            leadSpriteEl.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${lead.shiny ? 'shiny/' : ''}${leadDex}.png`;
          };
        }
        if (leadNameEl) {
          const leadTitle = (lead.shiny ? '✨ ' : '') + (lead.name || 'Líder') + (lead.level ? ` Lv ${lead.level}` : '');
          if (leadNameEl.textContent !== leadTitle) leadNameEl.textContent = leadTitle;
        }
      } else {
        if (leadSpriteEl) leadSpriteEl.style.opacity = '0';
        if (leadNameEl) leadNameEl.textContent = 'Sem Pokémon';
      }

      // 2. Caça Atual
      const huntRaw = (state && state.hunt) || '';
      const huntDex = resolveDexFromHunt(huntRaw);
      const huntSpriteEl = hud.querySelector('.bsh-hunt-sprite');
      const huntNameEl = hud.querySelector('.bsh-hunt-name');

      const prettyHunt = huntRaw ? huntRaw.replace(/[_-]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase()) : 'Aguardando caça';

      if (huntDex > 0) {
        if (huntSpriteEl) huntSpriteEl.style.opacity = '1';
        const huntSrc = getSpriteUrl(huntDex, false, isPaused, huntRaw);
        if (huntSpriteEl && huntSpriteEl.getAttribute('data-src') !== huntSrc) {
          huntSpriteEl.setAttribute('data-src', huntSrc);
          huntSpriteEl.style.opacity = '1';
          huntSpriteEl.src = huntSrc;
          huntSpriteEl.onerror = () => {
            huntSpriteEl.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${huntDex}.png`;
          };
        }
      } else if (huntRaw) {
        if (huntSpriteEl) {
          huntSpriteEl.removeAttribute('data-src');
          huntSpriteEl.style.opacity = '0.6';
          huntSpriteEl.src = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png';
        }
      } else {
        if (huntSpriteEl) huntSpriteEl.style.opacity = '0';
      }

      if (huntNameEl && huntNameEl.textContent !== prettyHunt) {
        huntNameEl.textContent = prettyHunt;
      }

      // 3. KPIs
      const timeValEl = hud.querySelector('.bsh-val-time');
      if (timeValEl) {
        const timeFormatted = formatHuntTime(a.seconds || 0);
        if (timeValEl.textContent !== timeFormatted) timeValEl.textContent = timeFormatted;
      }

      const ballsValEl = hud.querySelector('.bsh-val-balls');
      if (ballsValEl) {
        const bInf = Boolean((state.equippedBall && state.equippedBall.infinite) || (+state.balls >= 999999));
        const ballsFormatted = state.ballsKnown === false ? '—' : (bInf ? '∞' : fmtNumber(state.balls || 0));
        if (ballsValEl.textContent !== ballsFormatted) ballsValEl.textContent = ballsFormatted;
      }

      for (const key of ['potions', 'revives']) {
        const el = hud.querySelector('.bsh-val-' + key);
        if (el) el.textContent = state.inventoryKnown === false || state[key] == null ? '—' : fmtNumber(state[key]);
      }

      const xphValEl = hud.querySelector('.bsh-val-xph');
      if (xphValEl) {
        const xphFormatted = formatCompact(a.xph || 0);
        if (xphValEl.textContent !== xphFormatted) xphValEl.textContent = xphFormatted;
      }

      const shiniesValEl = hud.querySelector('.bsh-val-shinies');
      if (shiniesValEl) {
        const shiniesCount = a.shinyCap != null ? a.shinyCap : (a.shinyFound || 0);
        const shiniesFormatted = fmtNumber(shiniesCount);
        if (shiniesValEl.textContent !== shiniesFormatted) shiniesValEl.textContent = shiniesFormatted;
      }
    }
  };

  window.PioBattleHud = PioBattleHud;
  for (const [key, getter, event] of [
    ['twitch', 'twitchGetStatus', 'onTwitchStatus'],
    ['kick', 'kickGetStatus', 'onKickStatus'],
    ['points', 'kickGetPoints', 'onKickPoints']
  ]) {
    const receive = value => { social[key] = value; refreshSocial(); };
    if (typeof window.pokeAPI?.[event] === 'function') window.pokeAPI[event](receive);
    if (typeof window.pokeAPI?.[getter] === 'function') Promise.resolve(window.pokeAPI[getter]()).then(receive).catch(() => {});
  }



  if (window.__TAURI__ && window.pokeAPI?.onBlasterStatus) {
    window.pokeAPI.onBlasterStatus(({index, status, error}) => {
      if (!PioBattleHud.isBlasterActive(index)) return;
      const banner = document.querySelectorAll('.panel')[index]?.querySelector('.bsh-mode-banner');
      if (banner) banner.textContent = status === 'connected' ? 'Headless'
        : status === 'connecting' ? 'Conectando Headless...'
        : 'Headless: ' + String(error || 'conexão encerrada').slice(0, 160);
    });
  }

  if (!window.__TAURI__ && window.pokeAPI && typeof window.pokeAPI.onBlasterUpdate === 'function') {
    window.pokeAPI.onBlasterUpdate(({ index, state }) => {
      const grid = document.getElementById('grid');
      const panel = grid && grid.children[index];
      if (panel) {
        PioBattleHud.update(panel, index, state);
      }
      if (typeof window.stCache !== 'undefined') {
        window.stCache[index] = { t: Date.now() + 15000, d: state };
      }
    });
  }
})();
