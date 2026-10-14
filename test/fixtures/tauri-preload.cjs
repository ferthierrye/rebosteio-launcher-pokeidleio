const accounts = Array.from({length: 4}, (_, i) => ({name: `Fixture ${i + 1}`, email: `fixture${i}@example.invalid`, senha: 'fixture'}));
const listeners = new Map();
window.__nativeCalls = [];
window.__emitNative = (name, payload) => (listeners.get(name) || []).forEach(cb => cb({payload}));
window.__TAURI__ = {
  core: {invoke: async (name, args = {}) => {
    window.__nativeCalls.push({name, args});
    if (name === 'creds_load') return accounts;
    if (name === 'window_control') return {maximized: args.action === 'maximize'};
    if (name === 'blaster_start') { if (window.__failBlaster) throw new Error('fixture connection rejected'); return null; }
    if (name === 'webview_eval') {
      if (args.script === window.READ_STATE) return window.__fixtureState || null;
      if (args.script === 'Promise.resolve({answer:42})') return {answer: 42};
      if (args.script === 'throw new Error("fixture")') throw new Error('fixture');
      return null;
    }
    if (/creds_load|status_get/.test(name)) return {enabled: false, accounts: []};
    if (name === 'autostart_get') return {on: false, suportado: false};
    return true;
  }},
  event: {listen: async (name, cb) => {
    const handlers = listeners.get(name) || [];
    handlers.push(cb); listeners.set(name, handlers);
    return () => listeners.set(name, handlers.filter(h => h !== cb));
  }}
};
