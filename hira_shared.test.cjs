const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'ysarang-combination.html'),'utf8');
function boot(saved={}){
  const elements=new Map(),storage=new Map(Object.entries(saved));let inputs=[];
  function el(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'',disabled:false,classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(){},options:[]});return elements.get(id)}
  const context={console,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,location:{protocol:'file:'},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{getElementById:el,querySelectorAll:s=>s==='#priceEditGrid input'?inputs:[],documentElement:{setAttribute(){}}},window:{addEventListener(){}}};
  for(const m of html.matchAll(/id="([^"]+)"/g))context[m[1]]=el(m[1]);
  vm.createContext(context);
  const script=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(m=>!m[1].includes('application/json')).map(m=>m[2]).join('\n');
  vm.runInContext(script,context);
  vm.runInContext(`recalc=function(){};globalThis.fixture={schemaVersion:1,source:'HIRA',institution:'의원',updatedAt:new Date().toISOString(),fees:[...Object.keys(DEFAULT_LA_INFO),...Object.keys(DEFAULT_EXTRA_INFO)].map(code=>({code,name:code,price:10000,effective:'20260101'}))}`,context);
  return {run:s=>vm.runInContext(s,context),storage,el,setInputs:x=>inputs=x};
}
test('new user automatically receives common fees without a key',()=>{const b=boot();b.run('applySharedFees(fixture)');assert.equal(b.run('EXTRA_INFO.KK062.price'),10000);assert.equal(b.run('PRICE_META.KK062.source'),'HIRA_SHARED');assert(![...b.storage.values()].join('').includes('ServiceKey'))});
test('manual overrides survive refresh and reload; can return to common',()=>{const b=boot();b.run("EXTRA_INFO.KK062.price=999;PRICE_META.KK062={source:'manual'};applySharedFees(fixture)");assert.equal(b.run('EXTRA_INFO.KK062.price'),999);const next=boot(Object.fromEntries(b.storage));assert.equal(next.run('EXTRA_INFO.KK062.price'),999);next.run('applySharedFees(fixture,true)');assert.equal(next.run('EXTRA_INFO.KK062.price'),10000)});
test('missing, duplicate and future rows do not change current prices',()=>{const b=boot();const old=b.run('LA_INFO.LA241.price');for(const mutation of ['fixture.fees.pop()','fixture.fees[1]=fixture.fees[0]',"fixture.fees[0].effective='29990101'"]){const c=boot();c.run(mutation);assert.throws(()=>c.run('applySharedFees(fixture)'));assert.equal(c.run('LA_INFO.LA241.price'),old)}});
test('unsaved draft is not discarded by a background refresh',()=>{const b=boot();const input={dataset:{priceCode:'KK062'},value:'777'};b.setInputs([input]);b.run('applySharedFees(fixture)');assert.equal(input.value,'777');assert.equal(b.run('EXTRA_INFO.KK062.price'),0)});
test('network failure keeps cached fees and personal prices',async()=>{const b=boot();b.run('applySharedFees(fixture);location={protocol:"https:",href:"https://example.test/tool/"};fetch=async()=>{throw Error("offline")};');await b.run('loadSharedFees()');assert.equal(b.run('LA_INFO.LA241.price'),10000);assert.match(b.el('sharedFeeStatus').textContent,/마지막 정상 조회/)});
test('shared fee request includes same-origin access session',()=>{assert.match(html,/fetch\(new URL\('hira-prices\.json',location\.href\),\{cache:'no-store',credentials:'same-origin'/)});
test('legacy custom price is protected',()=>{const b=boot({'jinsul-la-extra-prices':JSON.stringify({EXTRA:{KK062:1234}})});b.run('applySharedFees(fixture)');assert.equal(b.run('EXTRA_INFO.KK062.price'),1234)});
test('new block codes become countable immediately and amounts update when common fees arrive',()=>{
  const b=boot();
  b.run("globalThis.sample=[{la:new Map([['LA245',1.5],['LA276',1]])},{la:new Map([['LA341',1]])}];renderMissingLaFees(sample)");
  assert.equal(b.el('missingLaSummary').textContent,'현재 조회기간의 미확인 단가 3종');
  assert.equal(b.run('fmtWon(laAmount(sample[0]))'),'단가 미확인');
  assert.equal(b.run('excelAmount(laAmount(sample[0]))'),'단가 미확인');
  b.run("fixture.fees.push({code:'LA245',name:'척추부신경',price:20000,effective:'20260101'},{code:'LA276',name:'기타 척수신경말초지',price:30000,effective:'20260101'});fixture.unavailableCodes=['LA341'];applySharedFees(fixture);renderMissingLaFees(sample)");
  assert.equal(b.run('laAmount(sample[0])'),60000);
  assert.equal(b.el('missingLaSummary').textContent,'현재 조회기간의 미확인 단가 1종');
  assert.match(b.el('missingLaTable').innerHTML,/LA341/);
  assert.equal(b.run('hiraSourceLabel("LA341")'),'심평원 의원단가 미확인');
});
test('a personal price for a newly registered code survives a shared refresh and reload',()=>{
  const b=boot();
  b.run("registerLaCode('LA245');LA_INFO.LA245.price=12345;PRICE_META.LA245={source:'manual'};persistPrices()");
  const next=boot(Object.fromEntries(b.storage));
  next.run("fixture.fees.push({code:'LA245',name:'척추부신경',price:20000,effective:'20260101'});applySharedFees(fixture)");
  assert.equal(next.run('LA_INFO.LA245.price'),12345);
  next.run('applySharedFees(fixture,true)');
  assert.equal(next.run('LA_INFO.LA245.price'),20000);
});
