const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {app,BrowserWindow,session}=require('electron');
const root=path.resolve(__dirname,'..');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'pio-settings-')));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:/^https?:/.test(d.url)}));
 const win=new BrowserWindow({show:false,webPreferences:{contextIsolation:false,nodeIntegration:false,preload:path.join(__dirname,'fixtures/tauri-preload.cjs')}});
 const read=script=>win.webContents.executeJavaScript(script);
 await win.loadFile(path.join(root,'rust-migration/ui/index.html'));await pause(600);
 const race=await read(`(async()=>{
   window.__socialWrites=[];
   const saved={masterEnabled:true,accounts:Array.from({length:4},()=>({username:'',token:'fixture-token',enabled:false}))};
   pokeAPI.twitchLoadCreds=()=>new Promise(r=>setTimeout(()=>r(structuredClone(saved)),100));
   pokeAPI.kickLoadCreds=()=>new Promise(r=>setTimeout(()=>r(structuredClone(saved)),100));
   pokeAPI.twitchSaveCreds=async data=>{__socialWrites.push({platform:'twitch',data:structuredClone(data)});return true};
   pokeAPI.kickSaveCreds=async data=>{__socialWrites.push({platform:'kick',data:structuredClone(data)});return true};
   twitchConfigReady=false;kickConfigReady=false;
   twitchBonusConfig.masterEnabled=false;twitchBonusConfig.accounts=Array.from({length:4},()=>({username:'',token:'',enabled:true}));
   kickBonusConfig.masterEnabled=false;kickBonusConfig.accounts=Array.from({length:4},()=>({username:'',token:'',enabled:true}));
   await Promise.all([loadTwitchBonusConfig(),loadKickBonusConfig(),handleTwitchGameTelemetry(0,{login:'fixture',lives:[]}),handleKickGameTelemetry(0,{login:'fixture',lives:[]})]);
   return __socialWrites;
 })()`);
 for(const write of race){assert.equal(write.data.masterEnabled,true);assert.equal(write.data.accounts.filter(a=>a.token==='fixture-token').length,4);}
 for(const platform of ['twitch','kick']){
   const final=race.filter(write=>write.platform===platform).at(-1);
   assert.ok(final,`${platform} must persist the hydrated configuration`);
   assert.equal(final.data.accounts[0].username,'fixture');
   if(platform==='kick'){assert.equal(final.data.accounts[0].linkedUsername,'fixture');assert.equal(final.data.accounts[0].gameLinked,true);}
 }
 const blocked=await read(`(async()=>{__socialWrites=[];twitchConfigReady=false;kickConfigReady=false;pokeAPI.twitchLoadCreds=async()=>{throw Error('fixture unreadable')};pokeAPI.kickLoadCreds=async()=>{throw Error('fixture unreadable')};await Promise.all([handleTwitchGameTelemetry(0,{login:'fixture'}),handleKickGameTelemetry(0,{login:'fixture'})]);document.getElementById('twitchBonusSave').click();document.getElementById('kickBonusSave').click();return __socialWrites.length})()`);
 assert.equal(blocked,0,'Unreadable configuration must never be replaced by defaults');
 await read(`document.getElementById('autoSupplyBtn').click();document.getElementById('autoSupplyMasterToggle').checked=true;document.getElementById('autoSupplySave').click()`);await pause(550);
 const failed=await read(`(()=>{document.getElementById('autoSupplyBtn').click();const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='autoSupplyCfg'||k==='autoSupplyOn')throw new DOMException('fixture','QuotaExceededError');return original.call(this,k,v)};document.getElementById('autoSupplyMasterToggle').checked=false;document.getElementById('autoSupplySave').click();Storage.prototype.setItem=original;return {stored:JSON.parse(localStorage.getItem('autoSupplyCfg')).enabled,memory:autoSupplyOn,message:document.getElementById('autoSupplyStatusText').textContent,open:document.getElementById('autoSupplyOverlay').classList.contains('show')}})()`);
 assert.equal(failed.stored,true);assert.equal(failed.memory,true);assert.equal(failed.open,true);assert.match(failed.message,/Não foi possível salvar/);
 await read(`localStorage.setItem('autoSupplyOn','0')`);await win.reload();await pause(600);
 assert.equal(await read('autoSupplyOn'),true,'Canonical rules and enabled state must survive a stale legacy mirror');
 console.log('PASS: social hydration race, failed reads, truthful save failure and canonical Auto Supply restore.');
 win.destroy();app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
