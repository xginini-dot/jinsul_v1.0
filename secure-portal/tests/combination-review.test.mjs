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

test('uses the claim’s LA codes to distinguish same-name patients seen on the same date',()=>{
  const {review}=boot();
  const date='2026-11-14';
  const {claims}=review.readBook([claimSheet('심사조정건조회','1',date)],'건강보험.xlsx');
  const {details}=review.readBook([codesSheet],'건강보험.xlsx');
  const actual=visit(date);
  actual.la.set('LA272',1);
  const other=visit(date,'200');
  other.la=new Map([['LA357',1]]);
  const secondCode={...details[0],code:'LA272',rawCode:'LA27200Z',line:'2'};
  const compare=(visits,lines)=>review.compare({claims,details:lines},[],visits,new Map());
  const linked=compare([other,actual],[...details,secondCode]).find(row=>row.claims.length);
  assert.equal(linked.visit,actual);
  assert.equal(linked.details.length,2);
  other.la.set('LA358',2);
  assert.equal(compare([other,actual],[...details,secondCode]).find(row=>row.claims.length).visit,actual);
  assert.equal(compare([other,actual],details).find(row=>row.claims.length).visit,undefined);
  actual.la.delete('LA358');
  assert.equal(compare([other,actual],[...details,secondCode]).find(row=>row.claims.length).visit,undefined);
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

test('all-period actual results and their Excel export keep outside dates and undated code detail',()=>{
  const {context,run,review}=boot();
  const health=review.readBook([claimSheet('심사조정건조회','1','2026-10-01')],'건강보험.xlsx');
  const aid=review.readBook([claimSheet('심사조정건조회','2','2026-11-08')],'의료급여.xlsx');
  const linked=review.readBook([codesSheet],'건강보험.xlsx').details;
  context.data={claims:[...health.claims,...aid.claims],details:[...linked,{...linked[0],serial:'3'}],summary:[]};
  context.dateStart.value='2026-11-01';
  context.dateEnd.value='2026-11-30';
  run('reviewData=data; renderAllAdjustments()');
  assert.equal(context.allAdjustTable.innerHTML,'');
  assert.equal(run("reviewReport().rows.some(row=>row.dateKey==='2026-10-01')"),false);
  assert.deepEqual(Array.from(run('allAdjustReport().rows'),row=>row.dateKey),['2026-11-08','2026-10-01','']);
  context.allAdjustPanel.open=true;
  run('renderAllAdjustments()');
  assert.match(context.allAdjustTable.innerHTML,/2026-10-01/);
  assert.match(context.allAdjustTable.innerHTML,/날짜 미연결/);
  context.dateEnd.value='2026-09-30';
  context.allAdjustInsurance.value='건강보험';
  const sheets={};
  context.XLSX={utils:{book_new:()=>({}),aoa_to_sheet:a=>a,book_append_sheet:(_wb,rows,name)=>{sheets[name]=rows;}},writeFile(){}};
  run('exportAllAdjustments()');
  assert.deepEqual(Array.from(sheets['전체기간_실제심사조정'].slice(1),row=>row[0]),['2026-10-01','날짜 미연결']);
  assert.equal(sheets['LA_조정_원본합계'][1][2],10000);
});

test('review panels start collapsed',()=>{
  for(const id of ['ratePanel','allAdjustPanel','reviewPanel','payoutPanel']){
    const start=html.match(new RegExp(`<details[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(start);
    assert.doesNotMatch(start,/\sopen(?:[\s=>]|$)/);
  }
});

test('uses unique prescribed codes for rates, same-code history for intervals and explicit recognition for status',()=>{
  const {context,run,review}=boot();
  const first=visit('2026-11-01');
  const otherCode=visit('2026-11-05');
  otherCode.la=new Map([['LA357',1]]);
  const adjusted=visit('2026-11-08','100',2);
  adjusted.la.set('LA357',1);
  context.testVisits=[first,otherCode,adjusted];
  const result=review.readBook([{name:'코드별 심사결과',rows:[
    ['수진자명','요양개시일','수가코드','심사결과'],
    ['가상환자','2026-11-05','LA357','전액 인정'],
    ['가상환자','2026-11-01','LA358','미인정']
  ]}],'건강보험.xlsx');
  assert.equal(result.accepted.length,1);
  assert.equal(result.payouts.length,0);
  const row={name:'가상환자',dateKey:'2026-11-08',code:'LA358',amount:10000,insurance:'건강보험'};
  context.data={claims:[],details:[row,{...row,amount:20000},{...row,code:'LA245'}],summary:[],accepted:result.accepted};
  context.ratePanel.open=true;
  const report=run('visits=testVisits; reviewData=data; LA_INFO.LA358.price=30000; renderRates(); getRates()');
  assert.deepEqual({...report.total},{total:4,adjusted:1,accepted:1,denied:0,unknown:2});
  assert.equal(report.adjustedVisits,1);
  assert.equal(report.visitCount,3);
  assert.equal(report.median,7);
  assert.equal(report.unlinked,1);
  assert.equal(report.gaps.get('정확히 7일').adjusted,1);
  assert.equal(report.codes.get('LA358').total,2);
  assert.equal(run('rateDetailCells(getRates().visible[0])[10]'),50);
  assert.match(context.rateSummary.innerHTML,/25\.00%/);
  context.rateView.value='accepted';
  assert.equal(run('getRates().visible[0].visit.dateKey'),'2026-11-05');
  assert.equal(run('reviewData.details=[]; getRates().hasDetails'),false);
});

test('adjustment tabs keep one adjusted visit per combination and show the patient’s other prescriptions',()=>{
  const {context,run}=boot();
  const first=visit('2026-10-31'),second=visit('2026-11-07'),third=visit('2026-11-14','200');
  first.extra=second.extra=third.extra=new Map([['KK090',1]]);
  context.testVisits=[first,second,third];
  const reason={name:'가상환자',dateKey:second.dateKey,code:'LA358',rawCode:'LA358',amount:1000,insurance:'건강보험',reasonCode:'A',reason:'범위 초과'};
  context.data={claims:[],details:[reason,{...reason,amount:2000},{...reason,dateKey:'',amount:3000}],summary:[],accepted:[]};
  context.ratePanel.open=true;
  const rows=run('visits=testVisits; reviewData=data; adjustmentBreakdown(getRates())');
  assert.deepEqual(Array.from(rows.combo[0]),['LA358 1','KK090 1',3,1,33.33,1,3,3000]);
  assert.equal(rows.month[1][2],1);
  assert.equal(rows.reason[0][3],3);
  assert.equal(rows.reason[0][4],1);
  assert.equal(rows.unlinked[0][7],'요양개시일 미연결');
  assert.deepEqual(Array.from(rows.flows[0].items,item=>item.visit.dateKey),['2026-10-31','2026-11-07']);
  assert.match(run('adjustmentFlowText(adjustmentBreakdown(getRates()).flows[0])'),/직전 동일 코드 7일/);
  run("selectRateTab('flow'); renderRates()");
  assert.match(context.rateFlowList.innerHTML,/결과 미확인/);
  assert.match(context.rateFlowList.innerHTML,/3,000원/);
  context.rateSearch.value='LA358 + KK090';
  assert.equal(run('adjustmentBreakdown(getRates()).combo.length'),1);
});

test('code-only adjustment combinations combine doses and count each patient once',()=>{
  const {context,run}=boot();
  const first=visit('2026-10-01'), second=visit('2026-10-08','100',1.5), third=visit('2026-10-15','200',2);
  first.extra=new Map([['KK090',1]]);
  second.extra=new Map([['KK090',2]]);
  third.extra=new Map([['KK061',1]]);
  context.testVisits=[first,second,third];
  context.testDetails=[first,second].map(visit=>({name:visit.name,dateKey:visit.dateKey,code:'LA358',amount:1000}));
  context.ratePanel.open=true;
  const rows=run('visits=testVisits; reviewData.details=testDetails; renderRates(); adjustmentBreakdown(getRates())');
  assert.deepEqual(Array.from(rows.comboCodes[0]),['LA358','KK090',2,2,100,1,2000]);
  assert.equal(rows.comboCodes.length,2);
  assert.equal(rows.combo.length,3);
  assert.match(context.rateDetail.innerHTML,/<th>LA 코드 조합<\/th>/);
  assert.doesNotMatch(context.rateDetail.innerHTML,/<th>LA 총투여량<\/th>/);
  context.rateComboBasis.value='dose';
  run('renderRates()');
  assert.match(context.rateDetail.innerHTML,/<th>LA 총투여량<\/th>/);
});
