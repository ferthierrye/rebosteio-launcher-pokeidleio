const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { installAutoDepot } = require('../src/ui/auto-depot');
function setup(invoke) {
 let tick, now=100000;
 const store = new Map([['pio:auto-depot:v1:1', JSON.stringify({enabled:true,configured:true})]]);
 class Socket { constructor(){this.readyState=1;this.handlers={};this.sent=[];} addEventListener(t,f){(this.handlers[t] ||= []).push(f);} send(m){this.sent.push(m);} emit(m){for(const f of this.handlers.message||[]) f({data:JSON.stringify(m)});} close(){this.readyState=3;for(const f of this.handlers.close||[])f();} }
 const w={WebSocket:Socket}; if(invoke)w.__TAURI_INTERNALS__={invoke};
 vm.runInNewContext('('+installAutoDepot.toString()+')()', {window:w,setInterval:f=>{tick=f;},Date:{now:()=>now},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)}});
 return {w,store,s:new w.WebSocket(),tick:async(ms=2000)=>{now+=ms;tick();await new Promise(r=>setImmediate(r));}};
}
const settle=()=>new Promise(r=>setImmediate(r));
test('legacy preference ignored; explicit opt-in sells all Depot and disabling stops sends',async()=>{
 const e=setup();e.s.emit({t:'welcome',estado:{id:1,pokemons:[{id:9,level:100,shiny:true},{id:10,level:100,slot:0}]}});await settle();
 assert.equal(e.w.__pioAutoDepot.enabled,false);
 await e.w.__pioAutoDepot.setEnabled(true);
 await e.tick();assert.match(e.w.__pioAutoDepot.phase,/ligado/);assert.deepEqual(JSON.parse(e.s.sent[0]),{t:'shop.sellAllPokemons',ateId:9});
 await e.tick();assert.equal(e.s.sent.length,1);
 await e.tick(60000);assert.equal(e.s.sent.length,2);
 await e.w.__pioAutoDepot.setEnabled(false);assert.equal(e.w.__pioAutoDepot.phase,'desativado');await e.tick(60000);assert.equal(e.s.sent.length,2);
 e.s.emit({t:'welcome',estado:{id:2}});await settle();assert.equal(e.w.__pioAutoDepot.enabled,false);
 e.s.close();await assert.rejects(e.w.__pioAutoDepot.setEnabled(true));
});
test('native preference write failure is visible and does not enable selling',async()=>{
 const e=setup(async name=>{if(name==='auto_depot_get')return {enabled:false};throw Error('disk');});
 e.s.emit({t:'welcome',estado:{id:1}});await settle();await assert.rejects(e.w.__pioAutoDepot.setEnabled(true));
 assert.equal(e.w.__pioAutoDepot.enabled,false);assert.equal(e.w.__pioAutoDepot.phase,'falha ao salvar');assert.equal(e.s.sent.length,0);
});
test('both application variants remove obsolete loot commands and mirror executor',()=>{
 for(const p of ['index.html','rust-migration/ui/index.html']){
 const s=fs.readFileSync(p,'utf8');assert.ok(!s.includes('shop.autoVendaLoot'));assert.ok(!s.includes('shop.sellAllItems'));assert.ok(s.includes('depotSettingsDialog'));
 }
 assert.equal(fs.readFileSync('src/ui/auto-depot.js','utf8'),fs.readFileSync('rust-migration/ui/src/ui/auto-depot.js','utf8'));
});

test('launcher native preference changes are picked up without reopening game',async()=>{
 let enabled=false;
 const e=setup(async()=>({enabled}));e.s.emit({t:'welcome',estado:{id:1,pokemons:[{id:5,level:100}]}});await settle();
 await e.tick();assert.equal(e.s.sent.length,0);
 enabled=true;await e.tick();assert.equal(e.s.sent.length,1);
 enabled=false;await e.tick(60000);assert.equal(e.s.sent.length,1);
});

test('bulk range stops before level 101 even when sellable Pokémon have later IDs',async()=>{
 const e=setup();e.s.emit({t:'welcome',estado:{id:1,pokemons:[{id:2,level:100},{id:3,level:101},{id:4,level:50}]}});await settle();
 await e.w.__pioAutoDepot.setEnabled(true);await e.tick();
 assert.deepEqual(JSON.parse(e.s.sent[0]),{t:'shop.sellAllPokemons',ateId:2});
 e.s.emit({t:'estado',estado:{pkFora:[2],pkMud:[{id:3,hp:20}]}});await e.tick(60000);assert.equal(e.s.sent.length,1);
 e.s.emit({t:'estado',estado:{pkFora:[3],pkMud:[{id:1}]}});await e.tick(60000);assert.equal(e.s.sent.length,1);
});

test('trained team and Collection do not block two level-40 Depot captures',async()=>{
 const e=setup();e.s.emit({t:'welcome',estado:{id:1,activeId:3,automation:{pokemonTravado:[2]},pokemons:[
  {id:1,level:1107,slot:0},{id:2,level:101},{id:3,level:1065},{id:4,level:40},{id:5,level:40}
 ]}});await settle();await e.w.__pioAutoDepot.setEnabled(true);await e.tick();
 assert.deepEqual(JSON.parse(e.s.sent[0]),{t:'shop.sellAllPokemons',ateId:5});
 e.s.emit({t:'estado',estado:{automation:{pokemonTravado:[]}}});await e.tick(60000);
 assert.equal(e.s.sent.length,1);assert.match(e.w.__pioAutoDepot.phase,/bloqueado/);
});
