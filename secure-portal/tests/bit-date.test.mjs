import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html=await readFile(new URL('../../bit-stats.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('  function normalizeVisitDate('),html.indexOf('  function updateDateRangeStatus('));
const ctx={pad2:v=>String(v).padStart(2,'0')};vm.createContext(ctx);vm.runInContext(source,ctx);
const serial=Date.UTC(2026,8,30)/86400000+25569;
test('Excel timestamps retain their calendar day at noon, evening and month boundaries',()=>{
 for(const fraction of [0,0.25,0.5,0.75,0.999999]){
  const date=ctx.normalizeVisitDate(serial+fraction);
  assert.equal(date,'2026-09-30');
  assert.equal(ctx.isDateInRange(serial+fraction,'2026-09-01','2026-09-30'),true);
  assert.equal(ctx.isDateInRange(serial+fraction,'2026-10-01','2026-10-17'),false);
 }
 assert.equal(ctx.normalizeVisitDate(serial+1.5),'2026-10-01');
});
test('numeric, text and Date date inputs agree without shifting the visit key',()=>{
 for(const value of [serial+0.75,String(serial+0.75),20260930,'2026/9/30 18:00','2026-09-30',new Date(2026,8,30,18)])assert.equal(ctx.normalizeVisitDate(value),'2026-09-30');
 assert.equal(ctx.normalizeVisitDate(null),'');
});
