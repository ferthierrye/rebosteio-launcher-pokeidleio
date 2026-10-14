const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {app,BrowserWindow,session}=require('electron');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.runtime','launcher-session-regressions');
fs.mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(output,'profile-'+process.pid));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:/^https?:/.test(d.url)}));
 for(const name of ['index.html','rust-migration/ui/index.html']){
   const html=fs.readFileSync(path.join(root,name),'utf8');
   for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1],{filename:name});
 }
 const win=new BrowserWindow({show:false,webPreferences:{contextIsolation:false,nodeIntegration:false,preload:path.join(__dirname,'fixtures','tauri-preload.cjs')}});
 await win.loadFile(path.join(root,'rust-migration/ui/index.html'));await pause(500);
 const read=code=>win.webContents.executeJavaScript(code);
 const prepare=`delete stCache[0];delete sessSnap[0];isLoggingIn[0]=false;trocou[0]=false;off[0]=false;window.__loginScripts=[];webviews[0].executeJavaScript=async script=>{__loginScripts.push(script);return {isOnline:false,isReady:true,hasLoginForm:true};};pokeAPI.camoufoxLogin=()=>new Promise(r=>window.__finishLogin=r);loginPanel(webviews[0],accounts[0]);`;
 await read(prepare);await pause(40);
 await read(`__emitNative('st:push',{index:0,state:{ok:true,live:true,cid:42,name:'Fixture',sessStart:Date.now(),team:[],a:{}}});__finishLogin({success:false,error:'fixture timeout'});`);await pause(40);
 assert.equal(await read(`grid.children[0].querySelector('.status').textContent`),'online','Late failure cannot replace authenticated status');
 assert.equal(await read('isLoggingIn[0]'),false);
 // A genuine offline failure is still visible, and fresh telemetry clears it.
 await read(prepare);await pause(40);await read(`__finishLogin({success:false,error:'fixture timeout'})`);await pause(40);
 assert.match(await read(`grid.children[0].querySelector('.status').textContent`),/Erro login/);
 await read(`__emitNative('st:push',{index:0,state:{ok:true,live:true,cid:'42',sessStart:Date.now(),team:[],a:{}}})`);
 assert.equal(await read(`grid.children[0].querySelector('.status').textContent`),'online');
 // Account replacement invalidates an old successful authentication too.
 await read(prepare);await pause(40);
 await read(`window.__savedAccount=accounts[0];accounts[0]={...accounts[0],email:'other@example.invalid'};__finishLogin({success:true,sessao:{token:'fixture-token',nick:'old'}});`);await pause(40);
 assert.equal(await read(`__loginScripts.some(s=>s.includes('fixture-token'))`),false);
 await read(`accounts[0]=__savedAccount;isLoggingIn[0]=false;window.__loginScripts=[];`);
 // Neither numeric/string representations nor a real identity change may reset the game.
 for(const cid of [42,'42',43]){
   await read(`__emitNative('st:push',{index:0,state:{ok:true,live:true,cid:${JSON.stringify(cid)},sessStart:Date.now(),team:[],a:{}}})`);
 }
 assert.equal(await read(`__loginScripts.some(s=>s.includes('analyzer-clear')||s.includes('eco-reset'))`),false);
 assert.equal(await read('sessSnap[0].cid'),'43');
 const guest=new BrowserWindow({show:false,webPreferences:{contextIsolation:false,nodeIntegration:false}});
 const guestFile=path.join(output,'guest.html');fs.writeFileSync(guestFile,'<html><body></body></html>');await guest.loadFile(guestFile);
 const fixture=`document.body.innerHTML='<div id="eco-painel"><button class="sessao-reset sessao-copiar eco-copiar">Copiar</button><button class="sessao-reset eco-reset">Zerar</button></div>';window.__poke={sess:{},ws:{}};window.__copyCalls=0;window.__resetCalls=0;document.querySelector('.eco-copiar').onclick=()=>__copyCalls++;document.querySelector('.eco-reset').onclick=()=>__resetCalls++;void 0;`;
 await guest.webContents.executeJavaScript(fixture);
 const reset=await read('RESET_SESS');await guest.webContents.executeJavaScript(reset);
 assert.deepEqual(await guest.webContents.executeJavaScript('({copies:__copyCalls,resets:__resetCalls})'),{copies:0,resets:1});
 // The official session pane's reset ID is also supported, without matching its Copy class.
 await guest.webContents.executeJavaScript(`document.body.innerHTML='<button class="sessao-reset sessao-copiar" id="sessao-copiar">Copiar</button><button class="sessao-reset" id="sessao-reset">Zerar</button>';document.getElementById('sessao-copiar').onclick=()=>__copyCalls++;document.getElementById('sessao-reset').onclick=()=>__resetCalls++;void 0;`);
 await guest.webContents.executeJavaScript(reset);
 assert.deepEqual(await guest.webContents.executeJavaScript('({copies:__copyCalls,resets:__resetCalls})'),{copies:0,resets:2});
 fs.writeFileSync(path.join(output,'validation.json'),JSON.stringify({lateLoginDiscarded:true,genuineFailureVisible:true,onlineStatusRecovered:true,staleSuccessDiscarded:true,identityNeverResetsGame:true,manualResetNeverCopies:true,realClipboardModified:false},null,2));
 console.log('PASS: stale auth responses, status recovery, identity changes and safe manual reset (isolated fixtures).');
 guest.destroy();win.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
