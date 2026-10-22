const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const vm=require('vm');
for(const file of ['index.html','rust-migration/ui/index.html']){
 const html=fs.readFileSync(file,'utf8');
 test(file+': inline scripts parse',()=>{for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!m[1].includes('src=')&&!/type=["'](?:application\/json|module)/.test(m[1]))new vm.Script(m[2]);});
 const source=html.slice(html.indexOf('    // GitHub sync stores'),html.indexOf('    function instalaCodigo'));
 function setup(fetch,save=true){
  const status={};const timers=[];let saves=0,render=0;
  const context=vm.createContext({document:{getElementById:id=>id==='scSyncStatus'?status:null},window:{pokeAPI:{fetchUserScript:fetch}},userScripts:[{id:'a',url:'https://github.com/a/b/blob/main/a.user.js',code:'old',version:'1',grants:['none']}],scMeta:code=>({version:code.includes('version 2')?'2':'1',name:'Tool',author:'Author'}),saveScripts:()=>{saves++;return save;},renderScriptsList:()=>render++,setTimeout:(f,ms)=>timers.push(ms),setInterval:(f,ms)=>timers.push(ms)});
  vm.runInContext(source,context);return {context,status,timers,run:()=>vm.runInContext('syncGitHubScripts()',context),saves:()=>saves,render:()=>render};
 }
 test(file+': saves changed GitHub code without executing it or reloading any game',async()=>{
  const e=setup(async()=>({ok:true,url:'https://raw.githubusercontent.com/a/b/main/a.user.js',code:'// @version 2\nwindow.MUST_NOT_RUN=true'}));
  await e.run();assert.equal(e.context.userScripts[0].version,'2');assert.match(e.context.userScripts[0].url,/raw/);assert.equal(e.context.window.MUST_NOT_RUN,undefined);assert.equal(e.saves(),1);assert.match(e.status.textContent,/próxima recarga/);assert.deepEqual(e.timers,[8000,1800000]);
  await e.run();assert.equal(e.saves(),1);
 });
 test(file+': network and persistence errors keep the installed version',async()=>{
  for(const [fetch,save] of [[async()=>({ok:false,error:'HTTP 404'}),true],[async()=>{throw Error('network');},true],[async()=>({ok:true,code:'new'}),false]]){
   const e=setup(fetch,save);await e.run();assert.equal(e.context.userScripts[0].code,'old');assert.match(e.status.textContent,/preservadas/);
  }
 });
 test(file+': concurrent checks share one request and removed scripts are not restored',async()=>{
  let resolve,calls=0;const e=setup(()=>{calls++;return new Promise(r=>resolve=r);});
  const first=e.run(),second=e.run();assert.equal(calls,1);e.context.userScripts=[];resolve({ok:true,code:'new'});await Promise.all([first,second]);assert.equal(e.context.userScripts.length,0);assert.equal(e.saves(),0);
 });
}
