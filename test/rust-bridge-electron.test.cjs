const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {app, BrowserWindow, session} = require('electron');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.runtime', 'rust-bridge-tests');
fs.mkdirSync(output, {recursive: true});
app.setPath('userData', path.join(output, 'profile-' + process.pid));
app.commandLine.appendSwitch('log-level', '3');
const pause = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  // No real accounts, game sockets, or network are used in this fixture test.
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => cb({cancel: /^https?:/.test(details.url)}));
  const win = new BrowserWindow({width:1600, height:1000, show:false, webPreferences:{contextIsolation:false, nodeIntegration:false, preload:path.join(__dirname, 'fixtures', 'tauri-preload.cjs')}});
  win.webContents.on("console-message", event => { if (event.level >= 2) console.error("Renderer:",event.message); });
  const read = script => win.webContents.executeJavaScript(script).catch(error => { console.error("Fixture script failed:",script.slice(0,500)); throw error; });
  await win.loadFile(path.join(root, 'rust-migration', 'ui', 'index.html'));
  await pause(700);
  // Native child windows must yield to launcher surfaces and expanded accounts.
  await read('document.querySelectorAll(".panel").forEach(p=>p.classList.remove("is-hud-active","is-blaster-active","off"));toggleExpand(0)');
  await pause(200);
  for (const surface of ['leafToolsBtn', 'leafSettingsBtn']) {
    await read('__nativeCalls.length=0;document.getElementById('+JSON.stringify(surface)+').click()');
    await pause(200);
    assert.equal(await read('__nativeCalls.some(c=>c.name==="webview_set_visible"&&c.args.index===0&&c.args.visible===false)'),true,surface+' hides native views');
    await read('__nativeCalls.length=0;document.body.classList.remove("leaf-tools-open","leaf-settings-open")');
    await pause(200);
    assert.equal(await read('__nativeCalls.some(c=>c.name==="webview_set_visible"&&c.args.index===0&&c.args.visible===true)'),true,'expanded account restores');
    assert.equal(await read('__nativeCalls.some(c=>c.name==="webview_set_visible"&&c.args.index!==0&&c.args.visible===true)'),false,'covered accounts stay hidden');
  }
  await read('__nativeCalls.length=0;toggleExpand(0)');
  await pause(200);
  assert.equal(await read('[1,2,3].every(i=>__nativeCalls.some(c=>c.name==="webview_set_visible"&&c.args.index===i&&c.args.visible===true))'),true,'grid restores other accounts');
  // Login has no channel; Tauri still requires a string after JSON serialization.
  for (const argument of ['', ', undefined', ', null', ", 'nailo'"]) {
    await read('__nativeCalls.length=0; openKickOfficialChannel(0' + argument + ')');
    const call = await read('JSON.parse(JSON.stringify(__nativeCalls.find(c => c.name === "kick_session_open")))');
    assert.deepEqual(call.args, {index: 0, slug: argument.includes('nailo') ? 'nailo' : ''});
  }

  assert.equal(await read('document.querySelectorAll(".panel").length'), 4);
  assert.equal(await read('webviews.every(w => typeof w.executeJavaScript === "function")'), true);
  assert.deepEqual(await read('webviews[0].executeJavaScript("Promise.resolve({answer:42})")'), {answer:42});
  assert.equal(await read('webviews[0].executeJavaScript(\'throw new Error("fixture")\').then(()=>false,()=>true)'), true);
  await read(`document.querySelector('[data-window-action="maximize"]').click()`);
  assert.equal(await read('__nativeCalls.some(c => c.name === "window_control" && c.args.action === "maximize")'), true);
  await read(`__emitNative('st:push', {index:0,state:{ok:true,live:true,cid:'fixture',name:'Fixture',level:27,gold:4321,hunt:'vulpix',balls:123,team:[{id:'a',sid:7,name:'Squirtle',level:18,ld:true}],a:{seconds:120,xph:85000,kills:9,xpg:40}}})`);
  assert.equal(await read('stCache[0].d.gold'), 4321);
  assert.match(await read('document.querySelector(".bsh-lead-name").textContent'), /Squirtle/);
  assert.equal(await read('document.querySelector(".bsh-hunt-name").textContent'), 'Vulpix');
  await read(`(() => {
    const saved = JSON.parse(JSON.stringify(stCache[0].d));
    __emitNative('st:push', {index:0,state:{...saved,team:[]}});
    __emitNative('st:push', {index:0,state:saved});
  })()`);
  assert.equal(await read('document.querySelector(".bsh-lead-sprite").style.opacity'), '1', 'The same sprite must become visible after an empty sample');
  await read(`(() => {
    const saved = JSON.parse(JSON.stringify(stCache[0].d));
    __emitNative('st:push', {index:0,state:{...saved,hunt:'larvitar'}});
    __emitNative('st:push', {index:0,state:{...saved,hunt:'centro'}});
    __emitNative('st:push', {index:0,state:{...saved,hunt:'larvitar'}});
  })()`);
  assert.match(await read('document.querySelector(".bsh-hunt-sprite").getAttribute("src")'), /246\.(gif|png)$/, 'Centro must not leave a Pokeball cached over Larvitar');
  for (const [hunt, dex] of [['hard_golem',76],['brave_blastoise',9],['nidoranfe',29],['nidoranma',32]]) {
    await read(`__emitNative('st:push', {index:0,state:{...stCache[0].d,hunt:${JSON.stringify(hunt)}}})`);
    assert.match(await read('document.querySelector(".bsh-hunt-sprite").getAttribute("src")'), new RegExp('/'+dex+'\\.(gif|png)$'), hunt+' must render its base species');
  }
  await read('__nativeCalls.length=0; PioBattleHud.setHudActive(0,true)');
  await pause(100);
  assert.equal(await read('__nativeCalls.some(c=>c.name==="webview_eval" && c.args.script.includes("const ligar = true"))'), false, 'Arena must not force manual Economy over the native transient owner');
  await read('PioBattleHud.setHudActive(0,false)');

  const telemetry = new BrowserWindow({show:false,webPreferences:{contextIsolation:false,nodeIntegration:false}});
  const telemetryEval=telemetry.webContents.executeJavaScript.bind(telemetry.webContents);
  telemetry.webContents.executeJavaScript=script=>telemetryEval(script).catch(error=>{console.error('Telemetry failed:',script.slice(0,700));throw error;});
  telemetry.webContents.on('console-message',event=>{if(event.level>=2)console.error('Telemetry:',event.message);});
  fs.writeFileSync(path.join(output,'guest.html'),'<html><body></body></html>');
  await telemetry.loadFile(path.join(output,'guest.html'));
  await telemetry.webContents.executeJavaScript(`window.WebSocket=class extends EventTarget {constructor(){super();this.readyState=1;}send(){} };window.WebSocket.OPEN=1;`);
  await telemetry.webContents.executeJavaScript(fs.readFileSync(path.join(root,'rust-migration/ui/src/ui/inventory-state.js'),'utf8'));
  await telemetry.webContents.executeJavaScript(fs.readFileSync(path.join(root,'rust-migration/src-tauri/src/launcher_gameplay.js'),'utf8'));
  await telemetry.webContents.executeJavaScript(`const socket=new WebSocket('wss://pokeidle.io/ws');socket.send('{}');for(const data of [{t:'welcome',estado:{nick:'Fixture',huntSlug:'larvitar'}},{t:'campo.init',slug:'centro'},{t:'campo',slug:'larvitar'}])socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(data)}));`);
  assert.equal(await telemetry.webContents.executeJavaScript('window.__poke.ws["field-init"].slug'), 'larvitar');
  const stateReader = await read('READ_STATE');

  assert.equal((await telemetry.webContents.executeJavaScript(stateReader)).hunt, 'Larvitar');
  await telemetry.webContents.executeJavaScript(`socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({t:'campo.init',slug:'centro'})}));socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({t:'campo',data:{slug:'larvitar'}})}));`);
  assert.equal((await telemetry.webContents.executeJavaScript(stateReader)).hunt, 'Larvitar', 'Enveloped campo must agree with the native telemetry bridge');
  await telemetry.webContents.executeJavaScript(`socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({t:'campo.init',slug:'centro'})}));socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({t:'estado',noCentro:false})}));socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({t:'campo',seq:33,mobs:[]})}));`);
  assert.equal((await telemetry.webContents.executeJavaScript(stateReader)).hunt, 'Larvitar', 'A center exit delta and combat-only campo must preserve the current target');
  const stock = {balls:{1:44,4:862,5:1},items:{200:31,203:7,205:9,206:2},automation:{ballIds:[4,1]}};
  const catalog = [{id:1,nome:'Poké Ball',priceGold:5},{id:4,nome:'Ultra Ball',priceGold:130},{id:5,nome:'Beast Ball',infinite:true}];
  await telemetry.webContents.executeJavaScript(`socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({t:'welcome',catalogoBolas:${JSON.stringify(catalog)},estado:${JSON.stringify(stock)}})}));`);
  const gameplay = await telemetryEval('(()=>{try{return '+stateReader+'}catch(e){return {error:e.stack}}})()');
  if(gameplay.error) throw new Error(gameplay.error);
  assert.equal(gameplay.balls,862); assert.equal(gameplay.potions,38); assert.equal(gameplay.revives,11);
  await read(`__emitNative('st:push',{index:0,state:{ok:true,live:true,ballsKnown:true,inventoryKnown:true,ballMap:${JSON.stringify(stock.balls)},invMap:${JSON.stringify(stock.items)},automation:${JSON.stringify(stock.automation)},ballCatalog:${JSON.stringify(catalog)}}})`);
  assert.deepEqual(await read('[stCache[0].d.balls,stCache[0].d.potions,stCache[0].d.revives]'),[gameplay.balls,gameplay.potions,gameplay.revives]);
  assert.deepEqual(await read(`['balls','potions','revives'].map(k=>document.querySelector('.bsh-val-'+k).textContent)`),['862','38','11']);
  await read(`__emitNative('st:push',{index:0,state:{ok:true,live:true,ballsKnown:true,inventoryKnown:true,ballMap:{5:1},invMap:{},automation:{ballIds:[5]},ballCatalog:${JSON.stringify(catalog)}}})`);
  assert.equal(await read("document.querySelector('.bsh-val-balls').textContent"),'∞');
  assert.equal(await read("document.querySelector('.bsh-val-potions').textContent"),'0');
  await read(`__emitNative('st:push',{index:0,state:{ok:true,live:false,ballsKnown:false,inventoryKnown:false,ballMap:{},invMap:{},equippedBall:null}})`);
  assert.deepEqual(await read(`['balls','potions','revives'].map(k=>document.querySelector('.bsh-val-'+k).textContent)`),['—','—','—']);
  // A full snapshot cannot resurrect stock omitted by the server.
  await telemetry.webContents.executeJavaScript(`socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({t:'estado',cheio:true,gold:1})}));`);
  const cleared = await telemetry.webContents.executeJavaScript(stateReader);
  assert.equal(cleared.ballsKnown,false); assert.equal(cleared.inventoryKnown,false);
  telemetry.destroy();
  // Failed handoff must not leave the UI claiming a working headless session.
  await read('__failBlaster = true; PioBattleHud.setBlasterActive(0, true)');
  await pause(150);
  assert.equal(await read('PioBattleHud.isBlasterActive(0)'), false);
  assert.match(await read('document.querySelector(".bsh-mode-banner").textContent'), /fixture connection rejected/);
  // Successful handoff must retain HUD data, and return to game must resync unchanged bounds.
  await read('__failBlaster = false; PioBattleHud.setBlasterActive(0, true)');
  await pause(150);
  assert.equal(await read('PioBattleHud.isBlasterActive(0)'), true);
  assert.equal(await read('webviews[0].executeJavaScript(READ_STATE).then(d=>d.gold)'), 4321);
  await read(`__emitNative('blaster:update', {index:0,state:{...stCache[0].d,live:true,ballsKnown:true,inventoryKnown:true,ballMap:{3:0},invMap:{9:0}}})`);
  await read(`window.__supplyResult = null; void window.pokeAPI.supplyBuy(0,[{kind:'ball',id:3,qty:1000},{kind:'item',id:9,qty:50}]).then(r=>window.__supplyResult=r)`);
  await pause(100);
  assert.equal(await read('__nativeCalls.some(c=>c.name==="blaster_send" && c.args.data.t==="shop.buy" && c.args.data.qty===1000)'),true);
  assert.equal(await read('__supplyResult'),null,'Sending is not confirmation');
  await read(`__emitNative('blaster:update', {index:1,state:{live:true,ballMap:{3:1000}}})`);
  assert.equal(await read('__supplyResult'),null,'Another account cannot confirm purchase');
  await read(`__emitNative('blaster:update', {index:0,state:{live:true,ballMap:{3:1000}}})`);
  await pause(100);
  await read(`__emitNative('blaster:update', {index:0,state:{live:true,invMap:{9:50}}})`);
  await pause(100);
  assert.equal(await read('__supplyResult.every(r=>r.success)'),true);
  await read(`window.__supplyResult=null;void window.pokeAPI.supplyBuy(0,[{kind:'ball',id:3,qty:5},{kind:'item',id:9,qty:5}]).then(r=>window.__supplyResult=r)`);
  await pause(100);
  await read(`__emitNative('blaster:update', {index:0,state:{live:false}})`);
  await pause(100);
  assert.equal(await read('__supplyResult.length'),1,'Disconnect stops subsequent orders');
  assert.equal(await read('__supplyResult[0].success'),false);
  await read(`__emitNative('blaster:update', {index:0,state:{live:true,ballMap:{3:1000}}})`);
  const timeoutResult = await read(`window.pokeAPI.supplyBuy(0,[{kind:'ball',id:3,qty:5},{kind:'item',id:9,qty:5}])`);
  assert.equal(timeoutResult.length,1,'Unconfirmed purchase stops subsequent orders');
  assert.equal(timeoutResult[0].success,false);
  assert.match(timeoutResult[0].reason,/estoque não confirmado/);
  await read('PioBattleHud.setBlasterActive(0,false); PioBattleHud.setHudActive(0,false)');
  await pause(250);
  assert.equal(await read('__nativeCalls.some(c=>c.name === "blaster_stop")'), true);
  await read(`PioBattleHud.update(document.querySelector('.panel'), 0, {team:[], balls:0, twitch:{login:'fixture', assistindo:true, pctAtual:20}, kick:{login:'fixture', pontos:1379, bonusExp:1}})`);
  assert.equal(await read("document.querySelector('.bsh-twitch-bonus').textContent"), '+20% XP');
  assert.equal(await read("document.querySelector('.bsh-kick-status').textContent"), 'Vinculada');
  assert.equal(await read("document.querySelector('.bsh-social-points').textContent"), '1.379 pts no jogo');
  await read(`__emitNative('twitch:status', {accounts:[{status:'connected',joinedChannels:['fixture']}]}); __emitNative('kick:status', {accounts:[{status:'authenticated'}]}); __emitNative('kick:points', {accounts:[{status:'authenticated', balances:{alpha:{status:'verified',points:1200},beta:{status:'verified',points:179},old:{status:'stale',points:9000}}}]})`);
  assert.equal(await read("document.querySelector('.bsh-twitch-status').textContent"), 'Conectada');
  assert.equal(await read("document.querySelector('.bsh-kick-status').textContent"), 'Sessão confirmada');
  assert.equal(await read("document.querySelector('.bsh-social-points').textContent"), '1.379 pts');
  assert.match(await read("document.querySelector('.bsh-social-channels').textContent"), /parcial/);
  assert.equal(await read("document.querySelectorAll('.bsh-social-points')[1].textContent"), 'Pontos —');
  await read(`PioBattleHud.update(document.querySelector('.panel'),0,{team:[],balls:0,twitch:null,kick:null}); __emitNative('kick:points', {accounts:[{status:'authenticated',balances:{alpha:{status:'verified',points:0}}}]})`);
  assert.equal(await read("document.querySelector('.bsh-social-points').textContent"), '0 pts');
  await read(`__emitNative('kick:points', {accounts:[{status:'blocked',balances:{alpha:{status:'stale',points:0}}}]}); __emitNative('kick:status', {accounts:[{status:'blocked'}]})`);
  assert.equal(await read("document.querySelector('.bsh-social-points').textContent"), 'Pontos —');
  assert.equal(await read("document.querySelector('.bsh-kick-status').textContent"), 'Consulta bloqueada');
  assert.equal(await read("document.querySelector('.bsh-twitch-bonus').textContent"), 'Bônus —');
  await read(`__emitNative('st:push',{index:0,state:{team:[],balls:0,twitch:null,kick:{login:'fixture',bonusExp:1}}})`);
  await pause(100);
  assert.equal(await read("document.querySelector('.bsh-social-points').textContent"), 'Pontos —', 'A missing game balance must not turn into zero after sanitization');
  // Render the actual Rust frontend styles at each required reference size.
  await read(`PioBattleHud.setHudActive(0,true); PioBattleHud.update(document.querySelector('.panel'),0,{hunt:'larvitar',team:[{sid:9,name:'Blastoise',level:132,ld:true}],ballsKnown:true,inventoryKnown:true,ballMap:{4:862},invMap:{200:38,205:11},automation:{ballIds:[4]},balls:862,twitch:{assistindo:true,pctAtual:20},kick:{bonusExp:1}}); __emitNative('kick:status',{accounts:[{status:'authenticated'}]}); __emitNative('kick:points',{accounts:[{status:'authenticated',balances:{fixture:{status:'verified',points:1379}}}]})`);
  await read(`__fixtureState={ok:true,live:true,hunt:'larvitar',team:[{sid:9,name:'Blastoise',level:132,ld:true}],ballsKnown:true,inventoryKnown:true,ballMap:{4:862},invMap:{200:38,205:11},automation:{ballIds:[4]},balls:862,twitch:{assistindo:true,pctAtual:20},kick:{bonusExp:1}}`);
  await read(`__emitNative('st:push',{index:0,state:__fixtureState})`);
  win.showInactive();
  for (const [width,height] of [[1920,1032],[1600,950],[820,720]]) {
    win.setSize(width,height); await pause(300);
    const boxes=await read(`(() => {const hud=document.querySelector('.battle-slot-hud'); const selectors=['.bsh-social','.bsh-arena','.bsh-controls-row','.bsh-stats-grid']; return selectors.map(s=>{const r=hud.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}})})()`);
    const [social,arena]=boxes;
    const hudBounds=await read(`(() => {const h=document.querySelector('.battle-slot-hud'),r=h.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,overflow:getComputedStyle(h).overflowY}})()`);
    assert.ok(social.y>=hudBounds.top-1, 'Social summary cannot be clipped above HUD');
    assert.equal(hudBounds.overflow,'auto');
    assert.ok(social.right<=arena.x+1 || social.bottom<=arena.y+1 || arena.right<=social.x+1 || arena.bottom<=social.y+1, 'Social summary must not overlap fighters at '+width);
    fs.writeFileSync(path.join(output, `social-${width}.png`),(await win.webContents.capturePage()).toPNG());
  }
  fs.writeFileSync(path.join(output, 'fixture.png'), (await win.webContents.capturePage()).toPNG());
  console.log('PASS: four accounts, query results/errors, controls, telemetry, failed/successful handoff and restoration (fixtures).');
  win.destroy(); app.quit();
}).catch(error => {console.error(error); app.exit(1);});
