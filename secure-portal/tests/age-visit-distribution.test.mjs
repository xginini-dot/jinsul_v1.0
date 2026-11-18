import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context={window:{},document:{readyState:'loading',addEventListener(){}}};
vm.createContext(context);
vm.runInContext(readFileSync(new URL('../public/new-patient-age.js',import.meta.url),'utf8'),context);
const api=context.window.JinsulNewPatientAge;
function model(hasVisits=true){
 const events=[],visits=[];
 for(let count=1;count<=10;count++){
  events.push({id:String(count),date:'2026-09-01',age:40,kind:'초진'});
  for(let day=1;day<=count;day++)visits.push({id:String(count),date:'2026-09-'+String(day).padStart(2,'0')});
 }
 // Repeated procedure/room records must not change visit-count buckets.
 visits.push({...visits.at(-1)});
 return api.buildModel(api.normalize({events,visits,hasVisits}),'2026-09','month');
}
test('default distribution preserves exact 1-4 visits and groups 5 or more without changing the mean',()=>{
 const result=model();const columns=api.distributionColumns(result.total);
 assert.deepEqual(Array.from(columns,column=>column.label),['1회','2회','3회','4회','5회 이상']);
 assert.deepEqual(Array.from(columns,column=>column.count),[1,1,1,1,6]);
 assert.deepEqual(Array.from(columns,column=>column.rate),[10,10,10,10,60]);
 assert.equal(result.total.visits,55);assert.equal(result.total.average,5.5);
});
test('expanded distribution has exact 1-7 visits and an 8+ bucket including 8, 9 and 10 visits',()=>{
 const result=model();const columns=api.distributionColumns(result.total,true);
 assert.deepEqual(Array.from(columns,column=>column.count),[1,1,1,1,1,1,1,3]);
 assert.equal(columns.at(-1).label,'8회 이상');assert.equal(columns.at(-1).rate,30);
 assert.equal(columns.reduce((sum,column)=>sum+column.count,0),result.total.patients);
});
test('percentages use each age cohort denominator and the combined 1+2 rate uses combined patient counts',()=>{
 const result=model();const html=api.renderTable(result);
 assert.match(html,/<th[^>]*>1·2회 합산<\/th>/);
 assert.match(html,/new-age-distribution new-age-combined"><strong>20\.0%<\/strong><small>2명<\/small>/);
 assert.match(html,/<strong>60\.0%<\/strong><small>6명<\/small>/);
 assert.match(html,/<strong>해당 없음<\/strong><small>0명<\/small>/);
 assert.doesNotMatch(html,/NaN|Infinity/);
});
test('toggling the expansion only changes presentation; model and 1+2 combined counts stay unchanged',()=>{
 const result=model(),before=JSON.stringify(result);
 api.renderTable(result,true);api.exportRows(result,true);api.renderTable(result,false);
 assert.equal(JSON.stringify(result),before);
 assert.match(api.renderTable(result,true),/<th scope="col">8회 이상<\/th>/);
 assert.doesNotMatch(api.renderTable(result,true),/<th scope="col">5회 이상<\/th>/);
});
test('Excel exports selected buckets with separate numeric percentage and patient-count columns',()=>{
 const result=model();
 for(const expanded of [false,true]){
  const rows=api.exportRows(result,expanded),header=rows[0],total=rows.at(-1);
  assert.equal(header.length,expanded?22:16);
  assert.equal(total[header.indexOf('1·2회 합산 비율(%)')],20);
  assert.equal(total[header.indexOf('1·2회 합산 환자수')],2);
  const bucket=expanded?'8회 이상':'5회 이상';
  assert.equal(total[header.indexOf(bucket+' 비율(%)')],expanded?30:60);
  assert.equal(total[header.indexOf(bucket+' 환자수')],expanded?3:6);
  assert.equal(total.at(-1),5.5);
 }
});
test('missing visit files never appear as zero-percent visit distributions or fabricated patient counts',()=>{
 const result=model(false);const html=api.renderTable(result,true),rows=api.exportRows(result,true);
 assert.match(html,/<strong>—<\/strong><small>자료 없음<\/small>/);
 assert.doesNotMatch(html,/<strong>0\.0%/);
 assert.equal(rows.at(-1)[1],10);assert.ok(rows.at(-1).slice(2).every(value=>value===''));
});
