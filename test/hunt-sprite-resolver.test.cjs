const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const catalog=require('./fixtures/hunt-sprite-catalog.json');
for(const root of ['src/ui','rust-migration/ui/src/ui']) {
 test(`${root}: official hunt catalog resolves species for slugs and display names`,()=>{
   const script=fs.readFileSync(`${root}/battle-hud.js`,'utf8');
   const context={window:{PIW_ALL_POKEMON_THEMES:JSON.parse(fs.readFileSync(`${root}/themes/pokemon/all-pokemon.json`))}};
   vm.createContext(context);
   vm.runInContext(script.slice(0,script.indexOf('  function safeDex('))+'window.resolve=resolveDexFromHunt;})();',context);
   for(const hunt of catalog.hunts){
     assert.equal(context.window.resolve(hunt.slug),hunt.dex,hunt.slug);
     assert.equal(context.window.resolve(hunt.name),hunt.dex,hunt.name);
   }
   for(const value of ['centro','','unknown_pokemon','notgolem']) assert.equal(context.window.resolve(value),0,value);
   assert.equal(context.window.resolve('mr_mime'),122);
   assert.equal(context.window.resolve('larvitar_hoenn'),246);
 });
}
