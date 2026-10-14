const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Battle Slot HUD - module logic, rendering, and lifecycle', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'battle-hud.js'), 'utf8');

  // Create mock DOM environment
  const store = {};
  const mockLocalStorage = {
    getItem: k => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };

  class MockElement {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      this.classList = {
        _set: new Set(),
        add: (...cs) => cs.forEach(c => this.classList._set.add(c)),
        remove: (...cs) => cs.forEach(c => this.classList._set.delete(c)),
        toggle: (c, force) => {
          if (force === undefined) {
            if (this.classList._set.has(c)) this.classList._set.delete(c);
            else this.classList._set.add(c);
          } else if (force) this.classList._set.add(c);
          else this.classList._set.delete(c);
        },
        contains: c => this.classList._set.has(c)
      };
      this.attributes = {};
      this.children = [];
      this.textContent = '';
      this.style = {};
      this.src = '';
    }
    set className(val) {
      this._className = val;
      this.classList._set.clear();
      String(val || '').split(/\s+/).filter(Boolean).forEach(c => this.classList._set.add(c));
    }
    get className() { return this._className || ''; }
    set innerHTML(html) {
      this._innerHTML = html;
      this.children = [];
      const matches = html.matchAll(/<([a-zA-Z0-9-]+)([^>]*)>/g);
      for (const m of matches) {
        const tag = m[1];
        const attrs = m[2];
        const el = new MockElement(tag);
        const classMatch = attrs.match(/class=["']([^"']+)["']/);
        if (classMatch) {
          el.className = classMatch[1];
          classMatch[1].split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c));
        }
        this.children.push(el);
      }
    }
    get innerHTML() { return this._innerHTML || ''; }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : null; }
    hasAttribute(k) { return this.attributes[k] !== undefined; }
    appendChild(child) { this.children.push(child); return child; }
    insertBefore(newChild, refChild) {
      const idx = this.children.indexOf(refChild);
      if (idx >= 0) this.children.splice(idx, 0, newChild);
      else this.children.push(newChild);
      return newChild;
    }
    querySelector(selector) {
      const clean = selector.replace(/^[.#]/, '');
      const find = el => {
        if (selector.startsWith('.') && el.classList.contains(clean)) return el;
        if (selector.startsWith('#') && el.id === clean) return el;
        if (selector === el.tagName?.toLowerCase()) return el;
        for (const c of el.children) {
          const res = find(c);
          if (res) return res;
        }
        return null;
      };
      return find(this);
    }
  }

  const mockDocument = {
    createElement: tag => new MockElement(tag),
    getElementById: id => (id === 'grid' ? mockGrid : null)
  };

  const mockGrid = new MockElement('div');
  mockGrid.id = 'grid';

  const context = {
    window: {
      PIW_ALL_POKEMON_THEMES: [
        { name: 'Squirtle', dex: 7, id: 'pkmn-squirtle' },
        { name: 'Vulpix', dex: 37, id: 'pkmn-vulpix' }
      ]
    },
    document: mockDocument,
    localStorage: mockLocalStorage,
    console
  };
  context.window.window = context.window;
  context.window.document = mockDocument;
  context.window.localStorage = mockLocalStorage;

  vm.createContext(context);
  vm.runInContext(code, context);

  const PioBattleHud = context.window.PioBattleHud;
  assert.ok(PioBattleHud, 'PioBattleHud must be exposed on window');

  // Test 1: Mounting in panel
  const panel = new MockElement('div');
  panel.className = 'panel';
  const header = new MockElement('div');
  header.className = 'panel-header';
  const reloadBtn = new MockElement('button');
  reloadBtn.className = 'reload';
  header.appendChild(reloadBtn);
  panel.appendChild(header);

  mockGrid.appendChild(panel);

  PioBattleHud.mount(panel, 0);

  const hudEl = panel.querySelector('.battle-slot-hud');
  assert.ok(hudEl, 'HUD element must be appended into panel');

  const ecoBtn = header.querySelector('.btn-eco-hud');
  assert.ok(ecoBtn, 'Toggle button must be inserted in panel-header');

  // Test 2: Toggling HUD
  assert.equal(PioBattleHud.isHudActive(0), false);
  PioBattleHud.setHudActive(0, true);
  assert.equal(PioBattleHud.isHudActive(0), true);
  assert.equal(panel.classList.contains('is-hud-active'), true);
  assert.equal(ecoBtn.classList.contains('is-on'), true);
  assert.equal(ecoBtn.getAttribute('aria-pressed'), 'true');

  // Test 3: Updating State (Metrics & Sprites)
  const fakeState = {
    i: 0,
    hunt: 'vulpix',
    balls: 2063,
    equippedBall: { name: 'Pokeball', infinite: false },
    team: [
      { sid: 7, name: 'Squirtle', level: 25, ld: true, shiny: false }
    ],
    a: {
      seconds: 6,
      xph: 45000,
      shinyCap: 2,
      shinyFound: 2
    }
  };

  PioBattleHud.update(panel, 0, fakeState);

  const timeEl = hudEl.querySelector('.bsh-val-time');
  assert.equal(timeEl.textContent, '0h 00m 06s');

  const leadNameEl = hudEl.querySelector('.bsh-lead-name');
  assert.equal(leadNameEl.textContent, 'Squirtle Lv 25');

  const huntNameEl = hudEl.querySelector('.bsh-hunt-name');
  assert.equal(huntNameEl.textContent, 'Vulpix');

  const leadSprite = hudEl.querySelector('.bsh-lead-sprite');
  assert.ok(leadSprite.getAttribute('data-src').includes('7.gif'), 'Lead sprite must resolve to Squirtle gif');

  const huntSprite = hudEl.querySelector('.bsh-hunt-sprite');
  assert.ok(huntSprite.getAttribute('data-src').includes('37.gif'), 'Hunt sprite must resolve to Vulpix gif');

  // Test 4: Pause animation toggle
  const pauseBtn = hudEl.querySelector('.bsh-pause-btn');
  assert.equal(PioBattleHud.isPaused(0), false);
  pauseBtn.onclick();
  assert.equal(PioBattleHud.isPaused(0), true);
  assert.equal(pauseBtn.textContent, 'Retomar animação');

  // Re-updating while paused switches to png
  PioBattleHud.update(panel, 0, fakeState);
  assert.ok(leadSprite.getAttribute('data-src').includes('7.png'), 'Paused lead sprite must be PNG');

  // Test 5: Open game button turns off HUD
  const openBtn = hudEl.querySelector('.bsh-open-game-btn');
  openBtn.onclick();
  assert.equal(PioBattleHud.isHudActive(0), false);
  assert.equal(panel.classList.contains('is-hud-active'), false);
  assert.equal(ecoBtn.getAttribute('aria-pressed'), 'false');

  // Test 6: Master Blaster mode
  const blasterBtn = header.querySelector('.btn-blaster-hud');
  assert.ok(blasterBtn, 'Master Blaster button must be mounted in panel header');
  assert.equal(PioBattleHud.isBlasterActive(0), false);

  PioBattleHud.setBlasterActive(0, true);
  assert.equal(PioBattleHud.isBlasterActive(0), true);
  assert.equal(PioBattleHud.isHudActive(0), true);
  assert.equal(panel.classList.contains('is-blaster-active'), true);
  assert.equal(panel.classList.contains('is-hud-active'), true);
  assert.equal(blasterBtn.classList.contains('is-on'), true);

  const banner = hudEl.querySelector('.bsh-mode-banner');
  assert.ok(banner.textContent.includes('Headless'), 'Banner must indicate Master Blaster mode');

  PioBattleHud.setBlasterActive(0, false);
  assert.equal(PioBattleHud.isBlasterActive(0), false);
  assert.equal(panel.classList.contains('is-blaster-active'), false);
});
