const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('four accounts retain twelve distinct live targets each',async()=>{
 const html=fs.readFileSync('rust-migration/ui/index.html','utf8');
 const start=html.indexOf('async function handleKickGameTelemetry('),end=html.indexOf('window.handleKickGameTelemetry =',start);
 const calls=[];
 const context={kickConfigReady:true,kickCachedGameData:[],kickBonusConfig:{accounts:Array.from({length:4},()=>({linkedUsername:''}))},kickChannelsFromSnapshot:k=>k?.oficiais||[],kickBonusOverlay:null,window:{pokeAPI:{kickSetPointChannels:channels=>{calls.push({type:'points',channels});return Promise.resolve()},kickSyncLives:lives=>{calls.push({type:'lives',lives});return Promise.resolve()}}}};
 vm.createContext(context);vm.runInContext(html.slice(start,end),context);
 for(let account=0;account<4;account++)await context.handleKickGameTelemetry(account,{oficiais:[...Array.from({length:12},(_,i)=>({login:`account${account}channel${i}`,aoVivo:true,ativo:true})),{login:`offline${account}`,aoVivo:false,ativo:true},{login:`disabled${account}`,aoVivo:true,ativo:false}]});
 const lives=calls.filter(c=>c.type==='lives').at(-1).lives;
 assert.equal(lives.length,4);assert.equal(new Set(lives.flat()).size,48);
 for(let account=0;account<4;account++){assert.equal(lives[account].length,12);assert.ok(lives[account].every(slug=>slug.startsWith(`account${account}channel`)));}
 const points=calls.filter(c=>c.type==='points').at(-1).channels;
 for(let account=0;account<4;account++)assert.ok(points[account].includes(`offline${account}`));
});
