const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
for(const nativeMode of [false,true]) for(const path of ['index.html','rust-migration/ui/index.html']) test(path+(nativeMode?' native hidden views':' Electron')+': settings close by button, Escape and backdrop; account toggle works',async()=>{
 const source=fs.readFileSync(path,'utf8');
 for(const m of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(!m[1].includes('src=')&&!/type=["'](?:application\/json|module)/.test(m[1]))new vm.Script(m[2]);
 }
 const listeners=new Set();
 class El{
  constructor(tag){this.tag=tag;this.children=[];this.style={};this.dataset={};this.classes=new Set();this.classList={add:v=>this.classes.add(v),remove:v=>this.classes.delete(v)};}
  append(...els){this.children.push(...els);for(const e of els)e.parent=this;}
  prepend(e){this.children.unshift(e);e.parent=this;}
  setAttribute(){} focus(){this.focused=true;} click(){this.onclick?.({target:this});}
  remove(){this.parent.children=this.parent.children.filter(e=>e!==this);}
  querySelector(){return this.children.flatMap(e=>[e,...e.children]).find(e=>'depotClose' in e.dataset);}
  get firstChild(){return this._text ||= {textContent:this.textContent};}
 }
 const body=new El('body');
 const document={body,createElement:t=>new El(t),getElementById:id=>body.children.find(e=>e.id===id),addEventListener:(t,f)=>listeners.add(f),removeEventListener:(t,f)=>listeners.delete(f)};
 const button=new El('button');let saved;
 const prefs=new Map();
 const invoke=async(name,args)=>{
   const cap=JSON.parse(fs.readFileSync('rust-migration/src-tauri/capabilities/default.json','utf8'));
   const allowed=cap.permissions.some(id=>{
     const filename='rust-migration/src-tauri/permissions/'+id.replace(/^allow-/, '')+'.toml';
     return fs.existsSync(filename)&&fs.readFileSync(filename,'utf8').includes('"'+name+'"');
   });
   assert.ok(allowed,'main window permission for '+name);
   if(name==='auto_depot_get')return prefs.get(args.account)||{enabled:false};
   assert.equal(name,'auto_depot_set');prefs.set(args.account,args.preferences);saved=args;
 };
 const win=nativeMode?{__TAURI__:{core:{invoke}}}:{};
 const view={executeJavaScript:async code=>{if(nativeMode)throw Error('Headless view unavailable');if(code.includes('setEnabled')){saved=code;return;}return {account:1,enabled:false,phase:'desativado'};}};
 const start=source.indexOf('if (autoSellBtn) autoSellBtn.onclick = async () => {');
 const end=source.indexOf('// ----- Despachar Contas',start);
 vm.runInNewContext(source.slice(start,end),{autoSellBtn:button,document,window:win,stCache:nativeMode?{0:{d:{cid:'1'}}}:{},webviews:[view],off:[false],console});
 await button.onclick();let overlay=body.children[0],panel=overlay.children[0];
 assert.equal(panel.tag,'section');assert.ok(overlay.classes.has('show'));
 const row=panel.children.find(e=>e.children.some(c=>c.tag==='input'));
 const checkbox=row.children.find(e=>e.tag==='input');checkbox.checked=true;await checkbox.onchange();if(nativeMode){assert.equal(saved.account,'1');assert.equal(saved.preferences.enabled,true);}else assert.match(saved,/setEnabled\(true\)/);
 panel.children[0].click();assert.equal(body.children.length,0);assert.equal(listeners.size,0);
 await button.onclick();for(const f of [...listeners])f({key:'Escape',preventDefault(){},stopPropagation(){}});
 assert.equal(body.children.length,0);assert.equal(listeners.size,0);
 await button.onclick();overlay=body.children[0];overlay.onclick({target:overlay});assert.equal(body.children.length,0);
});
test('native game views recognize the Depot overlay',()=>{
 assert.ok(fs.readFileSync('rust-migration/ui/tauri-bridge.js','utf8').includes("'#depotSettingsDialog.show'"));
});
