const assert = require('node:assert/strict');
const {app, BrowserWindow, session} = require('electron');
const path = require('node:path'), fs = require('node:fs'), os = require('node:os');
const root = path.resolve(__dirname, '..');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'pio-simple-')));
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest((d, cb) => cb({cancel: /^https?:/.test(d.url)}));
  const win = new BrowserWindow({show: false, webPreferences: {contextIsolation: false, preload: path.join(root, 'test/fixtures/tauri-preload.cjs')}});
  await win.loadFile(path.join(root, 'rust-migration/ui/index.html'));
  await new Promise(r => setTimeout(r, 600));
  const result = await win.webContents.executeJavaScript(`(async () => {
    for (let i=0;i<4;i++) stCache[i]={t:Date.now(),d:{ok:true,live:true,name:'Fixture '+i,team:[],a:{}}};
    cardsBtn.click();
    await refreshCards(true);
    return {active:document.body.classList.contains('cards-on'), options:cardsEl.querySelectorAll('#cdHuntAcc option').length, text:cardsEl.textContent};
  })()`);
  assert.equal(result.active, true);
  assert.equal(result.options, 4);
  assert.match(result.text, /Fixture 0/);
  console.log('PASS: Simples renders account data and hunt selector without undefined variables.');
  app.exit(0);
}).catch(e => {console.error(e); app.exit(1)});
