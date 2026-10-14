const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../rust-migration/src-tauri/src/background_economy.js'), 'utf8');

function game(previous) {
  const values = new Map(previous === null ? [] : [['cfg-economia', previous]]);
  const timers = new Map(); let nextId = 0, clicks = 0;
  const buttons = {
    app: {classList:{contains:()=>false}},
    'hunt-eco': {click(){clicks++;values.set('cfg-economia','1');}},
    'eco-sair': {click(){clicks++;values.set('cfg-economia','0');}}
  };
  const context = {
    location:{origin:'https://pokeidle.io'},
    localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},
    document:{hidden:false,readyState:'complete',getElementById:id=>buttons[id],addEventListener(){}},
    setTimeout(fn){timers.set(++nextId,fn);return nextId;},clearTimeout:id=>timers.delete(id),
    MutationObserver:class {observe(){}},addEventListener(){}
  };
  context.window=context;context.top=context;
  vm.runInNewContext(source, context);
  return {
    policy:context.__idleioBackgroundEconomy,
    flush(){const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn());},
    preference:()=>values.get('cfg-economia')??null,clicks:()=>clicks
  };
}

for (const previous of [null, '0', '1']) {
  test(`Arena returns Economy to its previous setting ${JSON.stringify(previous)}`, () => {
    const fixture=game(previous);fixture.flush();
    fixture.policy.setHidden(true);fixture.flush();
    assert.equal(fixture.preference(),'1');
    fixture.policy.setHidden(false);fixture.flush();
    assert.equal(fixture.preference(),previous);
  });
}

test('rapid Arena open/close cancels a pending temporary Economy change', () => {
  const fixture=game('0');fixture.flush();
  fixture.policy.setHidden(true);fixture.policy.setHidden(false);fixture.flush();
  assert.equal(fixture.preference(),'0');
  assert.equal(fixture.clicks(),0);
});
