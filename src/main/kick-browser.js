'use strict';

const { BrowserWindow, session, net } = require('electron');
const { KickPointsManager } = require('../domain/kick-points-service');

function createKickBrowser({ prepareSession, getProxy, onAutoCapture, onChange }) {
  const windows = new Map();
  const getSession = async index => {
    await prepareSession(index);
    return session.fromPartition('persist:conta' + (index + 1));
  };
  const request = (index, ses, url, headers) => new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isKickApi = parsed.origin === 'https://kick.com' &&
      /^\/api\/(v1\/user|v2\/channels\/[a-z0-9_-]+(\/(points|rewards|channel-points\/channel-settings))?)$/.test(parsed.pathname);
    const isWsToken = parsed.origin === 'https://websockets.kick.com' &&
      parsed.pathname === '/viewer/v1/token';
    if (!isKickApi && !isWsToken) {
      reject(new Error('Endpoint Kick não permitido.')); return;
    }
    const req = net.request({ method: 'GET', url, session: ses, useSessionCookies: true, redirect: 'manual' });
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(new Error('Falha na consulta Kick: ' + (error.message || error))) : resolve(result);
    };
    const timer = setTimeout(() => { finish(new Error('Timeout')); req.abort(); }, 12000);
    for (const [name, value] of Object.entries(headers)) {
      if (name.toLowerCase() === 'referer') continue;
      req.setHeader(name, value);
    }
    req.on('redirect', () => { finish(new Error('Redirecionamento recusado')); req.abort(); });
    req.on('login', (info, callback) => {
      const proxy = getProxy(index);
      if (info.isProxy && proxy?.type === 'http' && proxy.username &&
          info.host.toLowerCase() === proxy.host && Number(info.port) === proxy.port) {
        callback(proxy.username, proxy.password);
      } else callback();
    });
    req.on('error', () => finish(new Error('Rede')));
    req.on('response', res => {
      let bytes = 0;
      const chunks = [];
      res.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) { finish(new Error('Resposta grande')); req.abort(); return; }
        chunks.push(chunk);
      });
      res.on('error', () => finish(new Error('Resposta')));
      res.on('end', () => {
        let body = null;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}
        finish(null, { status: res.statusCode, body });
      });
    });
    req.end();
  });

  let manager;
  const openWindow = async (index, url) => {
    let win = windows.get(index);
    if (win && !win.isDestroyed()) {
      if (win.webContents.getURL() !== url) await win.loadURL(url);
      win.show(); win.focus(); return;
    }
    const ses = await getSession(index);
    win = new BrowserWindow({
      width: 1100, height: 800, title: `Kick — Conta ${index + 1}`, autoHideMenuBar: true,
      webPreferences: { session: ses, nodeIntegration: false, contextIsolation: true, sandbox: true }
    });
    windows.set(index, win);
    // Official login and player; no injected credentials, fake watchtime or privileged preload.
    win.webContents.on('will-navigate', (event, target) => {
      if (!target.startsWith('https://')) event.preventDefault();
    });
    win.webContents.setWindowOpenHandler(({ url: target }) => {
      if (!target.startsWith('https://')) return { action: 'deny' };
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true,
        webPreferences: { session: ses, nodeIntegration: false, contextIsolation: true, sandbox: true }
      } };
    });
    win.webContents.on('did-finish-load', () => {
      manager.captureSession?.(index).catch(() => {});
      manager.refresh(index, true).catch(() => {});
    });
    win.on('closed', () => windows.delete(index));
    await win.loadURL(url);
  };
  manager = new KickPointsManager({ getSession, request, openWindow, onAutoCapture, onChange });
  manager.getSession = getSession;
  manager.request = request;
  // A normal login/logout updates the cookie without forcing a navigation.
  const cookieListeners = new Map();
  const ensureListeners = () => {
    for (let i = 0; i < 4; i++) {
      const ses = session.fromPartition('persist:conta' + (i + 1));
      if (cookieListeners.has(ses)) continue;
      const listener = (_event, cookie) => {
        if (cookie.name === 'session_token' && /(^|\.)kick\.com$/.test(cookie.domain)) {
          manager.captureSession?.(i).catch(() => manager.invalidate(i).catch(() => {}));
        }
      };
      ses.cookies.on('changed', listener);
      cookieListeners.set(ses, listener);
    }
  };
  const configure = manager.configure.bind(manager);
  manager.configure = data => { ensureListeners(); configure(data); };
  const dispose = manager.dispose.bind(manager);
  manager.dispose = () => {
    dispose();
    for (const [ses, listener] of cookieListeners) ses.cookies.removeListener('changed', listener);
    for (const win of windows.values()) if (!win.isDestroyed()) win.destroy();
    windows.clear();
  };
  return manager;
}

module.exports = { createKickBrowser };
