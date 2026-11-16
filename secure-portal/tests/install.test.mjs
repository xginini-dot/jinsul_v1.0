import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import worker from '../worker.mjs';

const script=await readFile(new URL('../public/install.js',import.meta.url),'utf8');
const paths=['/install.js','/install.css','/manifest.webmanifest','/sw.js','/icons/app-192.png','/icons/app-512.png','/icons/app-maskable-512.png','/icons/apple-touch-icon.png','/icons/favicon-32.png'];
test('install assets work before login without database or runtime secrets',async()=>{
  for(const path of paths){
    const response=await worker.fetch(new Request('https://portal.example'+path),{ASSETS:{fetch:()=>new Response('public asset')}});
    assert.equal(response.status,200,path);
    assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
    assert.equal((await worker.fetch(new Request('https://portal.example'+path,{method:'POST',headers:{Origin:'https://portal.example'}}),{})).status,503);
  }
});
test('install support does not expose arbitrary icons, files, apps or APIs',async()=>{
  const env={DB:{prepare(){throw Error('anonymous request must not query database');}},PASSWORD_PEPPER:'x'.repeat(40)};
  for(const path of ['/icons/private.png','/icons/other.svg','/index.html','/bit-stats.html','/worker.mjs','/catalog.json']){
    assert.equal((await worker.fetch(new Request('https://portal.example'+path),env)).status,302,path);
  }
  assert.equal((await worker.fetch(new Request('https://portal.example/api/workspace'),env)).status,401);
});
test('manifest and icons support standalone install; worker never stores private responses',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url)));
  assert.equal(manifest.name,'진설 포털');
  assert.equal(manifest.start_url,'/');
  assert.equal(manifest.scope,'/');
  assert.equal(manifest.display,'standalone');
  for(const icon of manifest.icons){
    const iconPath=new URL(icon.src,'https://portal.example').pathname;
    const data=await readFile(new URL('../public'+iconPath,import.meta.url));
    const [width,height]=icon.sizes.split('x').map(Number);
    assert.equal(data.readUInt32BE(16),width);
    assert.equal(data.readUInt32BE(20),height);
  }
  const sw=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
  assert.doesNotMatch(sw,/caches\.|localStorage|indexedDB/);
  const handlers={};let requested;
  vm.runInNewContext(sw,{self:{addEventListener:(type,fn)=>handlers[type]=fn},fetch:request=>{requested=request;return Promise.resolve('network');}});
  let response;const request={url:'https://portal.example/api/workspace'};
  handlers.fetch({request,respondWith:result=>response=result});
  assert.equal(await response,'network');assert.equal(requested,request);
});
function fixture({userAgent='Chrome Windows',standalone=false,ipad=false,clipboard=true}={}){
  const handlers={};const elements=new Map();
  function element(){return {dataset:{},hidden:false,textContent:'',value:'',disabled:false,open:false,events:{},addEventListener(type,fn){this.events[type]=fn;},replaceChildren(...items){this.children=items;},focus(){this.focused=true;},select(){this.selected=true;},showModal(){this.open=true;},close(){this.open=false;this.events.close?.();}};}
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const buttons=['desktop','android','ios'].map(target=>Object.assign(element(),{dataset:{installPlatform:target}}));
  get('#app-install').querySelector=()=>get('options');
  get('#app-install').querySelectorAll=()=>buttons;
  get('#install-guide').querySelectorAll=()=>[get('close')];
  const media={matches:standalone,addEventListener(type,fn){this.change=fn;}};
  const registered=[];
  const navigator={userAgent,platform:ipad?'MacIntel':'Win32',maxTouchPoints:ipad?5:0,serviceWorker:{register:(...args)=>{registered.push(args);return Promise.resolve();}},clipboard:{writeText:()=>clipboard?Promise.resolve():Promise.reject(Error('denied'))}};
  vm.runInNewContext(script,{document:{querySelector:get,createElement:element},window:{matchMedia:()=>media,addEventListener:(type,fn)=>handlers[type]=fn},navigator,location:{origin:'https://portal.example'}});
  return {get,buttons,handlers,registered,media};
}
test('desktop install consumes a native prompt only once and does not claim cancelled installs succeeded',async()=>{
  const f=fixture();let calls=0,prevented=false;
  f.handlers.beforeinstallprompt({preventDefault(){prevented=true;},prompt:async()=>calls++,userChoice:Promise.resolve({outcome:'dismissed'})});
  await f.buttons[0].events.click();assert.equal(calls,1);assert.ok(prevented);assert.match(f.get('#install-status').textContent,/취소/);assert.equal(f.get('options').hidden,false);
  await f.buttons[0].events.click();assert.equal(calls,1);assert.equal(f.get('#install-guide').open,true);
});
test('accepted install waits for completion and appinstalled shows truthful completion state',async()=>{
  const f=fixture();f.handlers.beforeinstallprompt({preventDefault(){},prompt:async()=>{},userChoice:Promise.resolve({outcome:'accepted'})});
  await f.buttons[0].events.click();assert.match(f.get('#install-status').textContent,/설치 요청/);assert.equal(f.get('options').hidden,false);
  f.handlers.appinstalled();assert.equal(f.get('options').hidden,true);assert.match(f.get('#install-status').textContent,/설치했습니다/);
});
test('iPhone and touch-enabled iPad show Safari guidance rather than a foreign native prompt',async()=>{
  for(const settings of [{userAgent:'iPhone Safari'},{ipad:true,userAgent:'Macintosh Safari'}]){
    const f=fixture(settings);await f.buttons[2].events.click();assert.equal(f.get('#install-guide').open,true);
    assert.match(f.get('#install-steps').children[0].textContent,/Safari/);
    assert.equal(f.buttons[2].dataset.current,'true');
  }
});
test('Android can install natively and selecting another device only opens its instructions',async()=>{
  const f=fixture({userAgent:'Android Chrome'});let calls=0;
  f.handlers.beforeinstallprompt({preventDefault(){},prompt:async()=>calls++,userChoice:Promise.resolve({outcome:'accepted'})});
  await f.buttons[0].events.click();assert.equal(calls,0);assert.match(f.get('#install-guide-title').textContent,/PC/);
  f.get('#install-guide').close();await f.buttons[1].events.click();assert.equal(calls,1);
});
test('standalone mode hides redundant install controls and changes remain synchronized',()=>{
  const f=fixture({standalone:true});assert.equal(f.get('options').hidden,true);
  f.media.matches=false;f.media.change();assert.equal(f.get('options').hidden,false);
  assert.equal(f.registered[0][0],'/sw.js');assert.equal(f.registered[0][1].updateViaCache,'none');
});
test('failed native install falls back to instructions and clipboard denial selects the address',async()=>{
  const f=fixture({clipboard:false});f.handlers.beforeinstallprompt({preventDefault(){},prompt:async()=>{throw Error('unavailable');}});
  await f.buttons[0].events.click();assert.equal(f.get('#install-guide').open,true);assert.equal(f.buttons[0].disabled,false);
  await f.get('#install-copy').events.click();assert.equal(f.get('#install-address').selected,true);
  f.get('close').events.click();assert.equal(f.get('#install-guide').open,false);assert.equal(f.buttons[0].focused,true);
});
