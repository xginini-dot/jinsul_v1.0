import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHarness} from './isarang-analysis-harness.mjs';

test('body evidence repairs a displaced room heading without treating issuance codes as rooms',()=>{
 const {c}=makeHarness();
 const data=[['차트번호','수진자명','주민등록번호','초재진구분','교부번호','진료실','진료의','보험구분'],
 ['T1','가상환자','900101-1234567','초진',1000,'09001','2진료실','가상담당']];
 const m=c.headerInfo(data,'외래 완료환자');
 assert.equal(m.roomIdx,6);
 assert.equal(c.normalizedRoom(data[1][m.roomIdx]),'2진료실');
 assert.ok(m.adjustments.includes('진료실 본문 위치 보정'));
 assert.equal(c.normalizedRoom('접수실3'),'접수실3');
});

test('swapped name and registration headings are corrected using registration formats',()=>{
 const {c}=makeHarness();
 const data=[['차트번호','주민등록번호','수진자명','진료실'],['T1','가상환자','900101-1234567','1진료실']];
 const m=c.headerInfo(data,'외래 완료환자');
 assert.equal(m.rrnIdx,2);assert.equal(m.patientNameIdx,1);
 // Sparse, ambiguous values must retain explicit headings.
 const sparse=c.headerInfo([data[0],['T1','','','1진료실']], '외래 완료환자');
 assert.equal(sparse.rrnIdx,1);
});

test('opinions and invalid calendar strings cannot replace the filename date',()=>{
 const h=makeHarness();
 for(const v of ['가상 소견','2026-02-30','2026-13-01','900101-1234567'])assert.equal(h.c.excelDateToISO(v),'');
 const data=[['차트번호','주민등록번호','초재진구분','진료실','내원일소견'],['T1','','초진','1진료실','가상 소견']];
 assert.equal(h.c.headerInfo(data,'외래 완료환자').dateIdx,-1);
 h.run({outpatient:[{name:'2026.10.1.xls',fileDate:'2026-10-01',role:'외래 완료환자',data}],injection:[],carm:[]});
 assert.equal(h.c.weeklyContext.outpatientRecords[0].date,'2026-10-01');
});

test('repeated print headers and receipt-only exports are excluded and missing classifications are visible',()=>{
 const h=makeHarness();const header=['차트번호','주민등록번호','진료실'];
 const sources=[{name:'2026.10.1.xls',fileDate:'2026-10-01',role:'외래 완료환자',data:[header,['T1','','1진료실'],header,['T2','','1진료실'],['T1','','1진료실']]},
 {name:'2026.10.2.xls',fileDate:'2026-10-02',role:'외래 완료환자',data:[['차트번호','수진자명','카드수납액'],['T3','가상환자',1000]]}];
 const stats=h.run({outpatient:sources,injection:[],carm:[]});
 const total=stats.find(r=>r['구분']==='전체');
 assert.equal(total['총내원수'],2);assert.equal(total['초진환자수'],0);assert.equal(total['재진'],0);
 const note=h.elements.get('fileDiagnostic').innerHTML;
 assert.match(note,/외래 내원 2건/);
 assert.match(note,/초재진 열 없음: 총내원만 반영/);assert.match(note,/진료실·초재진 열 없음: 집계 제외/);
 assert.equal(h.c.weeklyContext.outpatientRecords.length,2);
});
