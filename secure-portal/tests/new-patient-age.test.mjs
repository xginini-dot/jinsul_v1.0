import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {makeHarness} from './isarang-analysis-harness.mjs';
import worker from '../worker.mjs';
import {database} from './database.mjs';

const shared=readFileSync(new URL('../public/new-patient-age.js',import.meta.url),'utf8');
function api(){const c={window:{},document:{readyState:'loading',addEventListener(){}}};vm.createContext(c);vm.runInContext(shared,c);return c.window.JinsulNewPatientAge;}
const functions=api();
const event=(id,date,age,kind='초진')=>({id,date,age,kind});
const visit=(id,date)=>({id,date});
const prepare=(events,visits,extra={})=>functions.normalize({events,visits,hasVisits:true,...extra});
function pick(html,name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);let at=html.indexOf('{',start)+1,depth=1;for(;depth&&at<html.length;at++){if(html[at]==='{')depth++;else if(html[at]==='}')depth--;}return html.slice(start,at);}

test('weekly cohort includes only initial patients of that Sunday-Saturday period and their subsequent visits',()=>{
 const data=prepare([event('A','2026-09-06',25),event('B','2026-09-12',45),event('old','2026-09-05',60),event('next','2026-09-13',70)],
 [visit('A','2026-09-04'),visit('A','2026-09-06'),visit('A','2026-09-08'),visit('A','2026-09-13'),visit('B','2026-09-12'),visit('old','2026-09-08')]);
 const model=functions.buildModel(data,'2026-09-06');
 assert.equal(model.total.patients,2);assert.equal(model.total.visits,3);assert.equal(model.total.average,1.5);
 assert.equal(model.rows[1].twice,1);assert.equal(model.rows[3].once,1);
});
test('monthly cohort is recalculated from calendar boundaries, not weekly sums',()=>{
 const data=prepare([event('A','2026-08-31',25),event('B','2026-09-01',35),event('C','2026-09-06',75),event('D','2026-10-01',45)],
 [visit('A','2026-09-02'),visit('B','2026-09-01'),visit('B','2026-09-06'),visit('B','2026-09-30'),visit('B','2026-10-01'),visit('C','2026-09-06')]);
 const september=functions.buildModel(data,'2026-09','month');
 assert.equal(september.total.patients,2);assert.equal(september.total.visits,4);assert.equal(september.total.average,2);
 const week=functions.buildModel(data,'2026-08-30');assert.equal(week.total.patients,2);assert.equal(week.total.visits,3);
});
test('duplicate files, rooms and procedure rows count one patient and one visit per date',()=>{
 const data=prepare([event('101','2026-09-01',40),event('101.0','2026-09-01',40),event('101','2026-09-03',41)],
 [visit('101','2026-09-01'),visit('101.0','2026-09-01'),visit('101','2026-09-03'),visit('101','2026-09-03')]);
 const model=functions.buildModel(data,'2026-09','month');assert.equal(model.total.patients,1);assert.equal(model.total.visits,2);assert.equal(model.rows[3].patients,1);
});
test('90-day initials and manually corrected revisits are excluded by default and can be explicitly included',()=>{
 const data=prepare([event('A','2026-09-01',20),event('B','2026-09-01',50,'90초진'),event('C','2026-09-01',60,'재진')],[visit('A','2026-09-02'),visit('B','2026-09-03')]);
 assert.equal(functions.buildModel(data,'2026-09','month').total.patients,1);
 assert.equal(functions.buildModel(data,'2026-09','month',true).total.patients,2);
});
test('age boundaries include infants, 19/20 and 69/70; missing or invalid ages stay unknown',()=>{
 for(const [age,expected] of [[0,0],[19,0],[20,1],[29,1],[30,2],[69,5],[70,6],[120,6],[121,7],[-1,7],[null,7],['',7],[undefined,7],['bad',7]])assert.equal(functions.ageBand(age),expected,String(age));
 const data=prepare([event('A','2026-09-01',null),event('B','2026-09-01',0)],[]);
 const model=functions.buildModel(data,'2026-09','month');assert.equal(model.rows[7].patients,1);assert.equal(model.rows[0].patients,1);assert.equal(model.total.patients,2);
});
test('initial dates missing from the visit file are counted once from source evidence and reported',()=>{
 const model=functions.buildModel(prepare([event('A','2026-09-01',30)],[visit('A','2026-09-03')]),'2026-09','month');
 assert.equal(model.total.visits,2);assert.equal(model.missingInitialDates,1);
 const missing=functions.buildModel(prepare([event('A','2026-09-01',30)],[],{hasVisits:false}),'2026-09','month');
 assert.equal(missing.total.patients,1);assert.equal(missing.total.visits,null);assert.equal(missing.total.average,null);
});
test('partial query ranges, leap February and year-crossing weeks respect their actual included days',()=>{
 assert.equal(functions.periodRange('2024-02','month').end,'2024-02-29');
 assert.equal(functions.periodRange('2026-12-27','week').end,'2027-01-02');
 const data=prepare([event('A','2024-02-17',30),event('B','2024-02-20',40),event('C','2024-02-29',50)],[visit('A','2024-02-20'),visit('B','2024-02-21'),visit('B','2024-02-29')],{startDate:'2024-02-20',endDate:'2024-02-28'});
 const model=functions.buildModel(data,'2024-02','month');assert.equal(model.start,'2024-02-20');assert.equal(model.end,'2024-02-28');assert.equal(model.total.patients,1);assert.equal(model.total.visits,2);
});
test('count distributions reconcile; total average is weighted by patients and empty data is safe',()=>{
 const events=[event('A','2026-09-01',20),event('B','2026-09-01',20),event('C','2026-09-01',40)];
 const visits=[visit('C','2026-09-01'),visit('C','2026-09-02'),visit('C','2026-09-03'),visit('C','2026-09-04')];
 const data=prepare(events,visits);const original=JSON.stringify(data);
 const model=functions.buildModel(data,'2026-09','month');
 assert.equal(model.total.visits,6);assert.equal(model.total.average,2);assert.equal(model.total.once,2);assert.equal(model.total.fourPlus,1);
 assert.equal(model.rows.reduce((sum,row)=>sum+row.patients,0),model.total.patients);
 assert.equal(model.rows.reduce((sum,row)=>sum+row.visits,0),model.total.visits);
 assert.equal(model.total.once+model.total.twice+model.total.three+model.total.fourPlus,model.total.patients);
 assert.equal(JSON.stringify(data),original);
 const empty=functions.buildModel(prepare([],[]),'2026-09','month');assert.equal(empty.total.patients,0);assert.equal(empty.total.visits,0);assert.equal(empty.total.average,null);
});
test('invalid dates and missing identifiers cannot become phantom patients or periods',()=>{
 const data=prepare([event('A','2026-02-30',20),event('','2026-09-01',30),event('B','2026-09-01',30)],[visit('B','2026-13-01'),visit('B','2026-09-02')]);
 assert.equal(data.events.length,1);assert.equal(data.visits.length,1);assert.deepEqual(Array.from(functions.periods(data,'month')),['2026-09']);
});
test('Bit adapter uses corrected source classes, ages and all subsequent outpatient dates',()=>{
 const html=readFileSync(new URL('../../bit-stats.html',import.meta.url),'utf8');let data;
 const c={window:{weeklyPrepare(){},newPatientAgePrepare:value=>data=value},state:{},normalizeVisitDate:value=>value};
 vm.createContext(c);for(const name of ['normalizeVisitType','isFirstVisitType','parseAge','carmRoom','carmId','carmKey','prepareBitWeekly'])vm.runInContext(pick(html,name),c);
 const columns={'내원일':'date','차트':'id','과':'room','초재':'type','연령':'age'};
 c.prepareBitWeekly([{id:'A',date:'2026-09-01',room:'1진료실',type:'초진',age:40},{id:'A',date:'2026-09-03',room:'2진료실',type:'재진',age:40},{id:'B',date:'2026-09-01',room:'1진료실',type:'90초진',age:60}],columns,'','');
 const model=functions.buildModel(functions.normalize(data),'2026-09','month');assert.equal(model.total.patients,1);assert.equal(model.total.visits,2);
});
test('legacy adapter retains unknown ages, same-day room duplicates and identifier fallback from visit exports',()=>{
 const html=readFileSync(new URL('../../ysarang-stats.html',import.meta.url),'utf8');let data;
 const c={window:{newPatientAgePrepare:value=>data=value},Date,console};vm.createContext(c);
 for(const name of ['excelDateToISO','isDateInRange','normalizeDateInput','fileMapHeaderIndex','findHeaderIndex','normalizePersonValue','normalizeRrn','detectSheetColumns','buildPatientDateIndex','datesForPatient','calculateAge','parseAgeFromBirthish','prepareLegacyNewPatientAge'])vm.runInContext(pick(html,name),c);
 const header=['차트번호','나이','내원일','초재진'];
 c.prepareLegacyNewPatientAge({clinic:[{name:'1진료실',data:[header,['A',40,'2026-09-01','초진'],['B','','2026-09-01','초진'],['C',60,'2026-09-01','90초진']]},{name:'2진료실',data:[header,['A',40,'2026-09-01','초진']]}],v:[['차트번호','내원일'],['A.0','2026-09-01'],['A.0','2026-09-03'],['B','2026-09-01']]},'','');
 const model=functions.buildModel(functions.normalize(data),'2026-09','month');assert.equal(model.total.patients,2);assert.equal(model.total.visits,3);assert.equal(model.rows[7].patients,1);assert.equal(data.hasVisits,true);
});
test('outpatient adapter follows final manual initial classification and includes follow-up visits',()=>{
 const app=makeHarness();let data;app.c.window.newPatientAgePrepare=value=>data=value;
 const outpatient=[['차트번호','환자명','진료구분','진료실','나이','내원일'],['A','가상A','초진','1',20,'2026-09-01'],['A','가상A','재진','2',20,'2026-09-03'],['B','가상B','90일초진','1',60,'2026-09-01'],['C','가상C','초진','1','','2026-09-01']];
 app.run({outpatient:[{name:'외래.xlsx',role:'외래',fileDate:'',data:outpatient}],injection:[],carm:[]});
 const model=functions.buildModel(functions.normalize(data),'2026-09','month');assert.equal(model.total.patients,2);assert.equal(model.total.visits,3);assert.equal(model.rows[7].patients,1);
});
test('shared age statistics assets remain protected and are available to signed-in users',async()=>{
 const env={DB:database(),PASSWORD_PEPPER:'test-pepper-'.repeat(5),BOOTSTRAP_TOKEN:'secret',ASSETS:{fetch:()=>new Response('asset')}};
 const request=(path,body,cookie)=>worker.fetch(new Request('https://portal.example'+path,{method:body?'POST':'GET',headers:{Origin:'https://portal.example',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined}),env);
 for(const path of ['/new-patient-age.js','/new-patient-age.css'])assert.equal((await request(path)).status,302);
 assert.equal((await request('/api/bootstrap',{token:'secret',username:'owner',name:'테스트',password:'pw'})).status,200);
 const login=await request('/api/login',{username:'owner',password:'pw'});const cookie=login.headers.get('Set-Cookie').split(';')[0];
 for(const path of ['/new-patient-age.js','/new-patient-age.css'])assert.equal((await request(path,undefined,cookie)).status,200);
});
