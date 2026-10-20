import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
process.env.TZ='Asia/Seoul';
function extract(html,name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0);const brace=html.indexOf('{',start);let depth=1,i=brace+1;for(;depth&&i<html.length;i++){if(html[i]==='{')depth++;else if(html[i]==='}')depth--;}return html.slice(start,i);}
const serial=Date.UTC(2026,8,30)/86400000+25569;
for(const file of ['ysarang-stats.html','ysarang-stats2.html','ysarang-1visit.html','ysarang-visit.html'])test(file+' preserves date keys for matching across supported inputs',async()=>{
 const html=await readFile(new URL('../../'+file,import.meta.url),'utf8');const c={Date};vm.createContext(c);vm.runInContext(extract(html,'excelDateToISO'),c);
 for(const value of [serial,serial+.5,serial+.75,serial+.999999,String(serial+.75),20260930,'20260930','2026-09-30 18:45','2026/9/30',new Date(2026,8,30,18)])assert.equal(c.excelDateToISO(value),'2026-09-30',String(value));
 assert.equal(c.excelDateToISO(serial+1.75),'2026-10-01');assert.equal(c.excelDateToISO(''),'');
});
test('block analysis uses the source date in Korean time instead of shifting late visits',async()=>{
 const html=await readFile(new URL('../../ysarang-block.html',import.meta.url),'utf8');const c={Date};vm.createContext(c);vm.runInContext(extract(html,'excelSerialDateToJSDate')+'\n'+extract(html,'parseDateFlexible'),c);
 for(const v of [serial,serial+.75,serial+.999999,20260930,String(serial+.75),'2026-09-30',new Date(2026,8,30,18)]){const d=c.parseDateFlexible(v);assert.equal(`${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`,'2026-9-30');}
});
test('combination analysis groups serial timestamps and Date cells on the same visit day',async()=>{
 const html=await readFile(new URL('../../ysarang-combination.html',import.meta.url),'utf8');const c={Date,clean:v=>String(v??'').trim()};vm.createContext(c);vm.runInContext(extract(html,'parseDate')+'\n'+extract(html,'dateKey'),c);
 for(const v of [serial+.75,String(serial+.75),new Date(2026,8,30,18),'20260930'])assert.equal(c.dateKey(c.parseDate(v)),'2026-09-30');
});
