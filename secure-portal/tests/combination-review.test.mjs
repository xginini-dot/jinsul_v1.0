import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../../ysarang-combination.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(match=>!match[1].includes('application/json')).map(match=>match[2]).join('\n');
function boot(){
  const elements=new Map(), getElementById=id=>{
    if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',classList:{add(){},toggle(){},contains(){return id==='denialPage';}},addEventListener(){}});
    return elements.get(id);
  };
  const context={document:{getElementById,querySelectorAll:()=>[],documentElement:{setAttribute(){}}},window:{addEventListener(){}},
    location:{protocol:'file:'},localStorage:{getItem(){},setItem(){}},console};
  for(const [,id] of html.matchAll(/id="([^"]+)"/g))context[id]=getElementById(id);
  getElementById('reviewCodes').value='LA357, LA358, LA359';
  getElementById('reviewDays').value='14';
  vm.createContext(context);
  vm.runInContext(scripts,context);
  const run=js=>vm.runInContext(js,context);
  return {context,run,review:run('combinationReview')};
}
const claimSheet=(name,serial,date,nameValue='가상 환자')=>({name,rows:[
  ['명일련','수진자성명','요양개시일','묶음번호','청구사항','조정사항','','심사조정내역'],
  ['','','','','청구액','소계1','소계2',''],
  [serial,nameValue,date,'B1',90000,5000,3000,'가상 사유']
]});
const codesSheet={name:'심사조정현황',rows:[
  ['명일련','수진자','조정금액','줄번호','조정사유코드','조정사유코드명','분류코드(항)'],
  ['001','가상환자',5000,1,'A','가상 코드 사유','LA358010']
]};
const summarySheet={name:'코드별조정총괄내역',rows:[['분류코드(항)','건수','조정금액'],['LA358010',1,5000]]};
const visit=(date,chart='100',quantity=1)=>({dateKey:date,chart,name:'가상환자',patientKey:chart,la:new Map([['LA358',quantity]])});

test('code rows join exact insurance, serial and name while summary and copy do not double count',()=>{
  const {review}=boot();
  const health=review.readBook([claimSheet('심사조정건조회','1','2026-11-14')],'건강보험 심사조정건조회.xlsx');
  const publicAid=review.readBook([claimSheet('심사조정건조회','1','2026-11-07')],'의료급여 심사조정건조회.xlsx');
  const denied=review.readBook([claimSheet('지급불능건조회','2','2026-11-14')],'건강보험 지급불능건조회.xlsx');
  const byCode=review.readBook([summarySheet,codesSheet],'건강보험 코드별조정총괄.xlsx');
  assert.equal(byCode.summary.length,0);
  assert.equal(review.readBook([summarySheet],'의료급여 코드별조정총괄.xlsx').summary.length,1);
  const data=review.dedupe({claims:[...health.claims,...publicAid.claims,...health.claims],details:[...byCode.details,...byCode.details],summary:[]});
  assert.equal(data.claims.length,2);
  assert.equal(data.details.length,1);
  assert.equal(health.claims[0].adjustment,8000);
  const rows=review.compare(data,denied.payouts,[visit('2026-11-14', '100', 1.5)],new Map());
  assert.equal(rows[0].details[0].amount,5000);
  assert.equal(rows[0].claims[0].dateKey,'2026-11-14');
  assert.equal(rows[0].payouts[0].claim,90000);
  assert.equal(rows[0].visit.la.get('LA358'),1.5);
  assert.equal(rows[1].claims[0].insurance,'의료급여');
  assert.equal(rows[1].details.length,0);
});

test('ambiguous visit or ambiguous claim date remains visible without a guessed match',()=>{
  const {review}=boot();
  const dates=['2026-11-07','2026-11-14'];
  const claims=dates.flatMap(date=>review.readBook([claimSheet('심사조정건조회','001',date)],'건강보험.xlsx').claims);
  const details=review.readBook([codesSheet],'건강보험.xlsx').details;
  const rows=review.compare({claims,details},[],[visit(dates[0]),visit(dates[0],'200')],new Map());
  assert.equal(rows.filter(row=>row.visit&&row.claims.length).length,0);
  assert.ok(rows.find(row=>row.details.length&&!row.dateKey)?.unmatched);
});

test('14-day estimate keeps its anchor after short visits and uses history before the date filter',()=>{
  const {context,run}=boot();
  const input=[visit('2026-11-01'),visit('2026-11-08','100',1.5),visit('2026-11-15'),visit('2026-11-18','200')];
  context.testVisits=input;
  context.dateStart.value='2026-11-08';
  const rows=run('visits=testVisits; LA_INFO.LA358.price=80000; reviewReport().rows');
  assert.equal(rows.length,3);
  const exact=rows.find(row=>row.dateKey==='2026-11-15');
  assert.equal(exact.estimate.flagged,false);
  assert.equal(exact.estimate.anchorGap,14);
  assert.equal(exact.estimate.previousGap,7);
  const short=rows.find(row=>row.dateKey==='2026-11-08');
  assert.equal(short.estimate.flagged,true);
  assert.equal(short.estimate.loss,120000);
  assert.deepEqual(Array.from(run('reviewDoseRows(reviewReport().visible)[0]')),['LA358',2,3,3.5,1.75,1.17,0,null,1]);
  assert.equal(run("LA_INFO.LA358.price=0; reviewReport().rows.find(row=>row.dateKey==='2026-11-08').estimate.loss"),NaN);
});
