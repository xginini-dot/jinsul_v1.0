import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHarness} from './isarang-analysis-harness.mjs';

test('actual room columns take priority over an exact specialty header in any column order', () => {
  const {c} = makeHarness();
  for (const roomHeader of ['진료실', '진료실명', '진료실 번호', '진료실(번호)', '진료방', '진료방명', '진료실 정보']) {
    for (const reverse of [false, true]) {
      const columns = [['진료과', '09001'], [roomHeader, '2진료실']];
      if (reverse) columns.reverse();
      const data = [
        ['차트번호', '주민등록번호', ...columns.map(column => column[0])],
        ['100', '', ...columns.map(column => column[1])]
      ];
      const meta = c.headerInfo(data, '외래 완료환자');
      assert.equal(data[1][meta.roomIdx], '2진료실', roomHeader);
      assert.equal(c.normalizedRoom(data[1][meta.roomIdx]), '2진료실');
    }
  }
});

test('legacy specialty-only room headings and missing room labels retain their behavior', () => {
  const {c} = makeHarness();
  const meta = c.headerInfo([['차트번호', '주민등록번호', '진료과'], ['100', '', '1진료실']], '외래 완료환자');
  assert.equal(meta.roomIdx, 2);
  assert.equal(c.headerInfo([['차트번호', '주민등록번호']], '외래 완료환자').roomIdx, -1);
  assert.equal(c.normalizedRoom(''), '미지정');
});

function fixture(useAlternateHeader) {
  const date = '2026-09-15';
  const base = ['차트번호', '환자명', '주민등록번호', '내원일', '나이', '초재진구분'];
  const common = ['100', '가상자료', '', date, 40, '초진'];
  const outpatient = [
    {name:'2026.9.15.xls', fileDate:date, role:'외래 완료환자', data:[
      [...base, '진료실'], [...common, '1진료실']
    ]},
    {name:'2026.9.16.xls', fileDate:'2026-09-16', role:'외래 완료환자', data:[
      [...base, '진료과', useAlternateHeader ? '진료실명' : '진료실'],
      ['100', '가상자료', '', '2026-09-16', 40, '재진', '09001', '1진료실'],
      ['200', '가상자료', '', '2026-09-16', 50, '초진', '09002', '2진료실']
    ]}
  ];
  return {outpatient, injection:[{name:'주사.xls', role:'주사 파일', data:[
    ['차트번호', '주민등록번호', '내원일'],
    ['100', '', date], ['100', '', '2026-09-16'], ['200', '', '2026-09-16']
  ]}], carm:[]};
}

test('mixed exports with specialty codes produce the same room, age, daily and weekly results as explicit room headings', () => {
  const old = makeHarness(), alternate = makeHarness();
  const originalStats = old.run(fixture(false));
  const changedStats = alternate.run(fixture(true));
  assert.equal(JSON.stringify(changedStats), JSON.stringify(originalStats));
  assert.equal(JSON.stringify(alternate.c.window.__latestByAge), JSON.stringify(old.c.window.__latestByAge));
  assert.equal(JSON.stringify(alternate.c.window.__latestDailyStats), JSON.stringify(old.c.window.__latestDailyStats));
  assert.equal(JSON.stringify(alternate.c.weeklyContext.outpatientRecords), JSON.stringify(old.c.weeklyContext.outpatientRecords));
  assert.deepEqual(Array.from(changedStats, row => row['구분']).sort(), ['1진료실', '2진료실', '전체'].sort());
  const all = changedStats.find(row => row['구분'] === '전체');
  assert.equal(all['총내원수'], 3);
  assert.equal(all['초진환자수'], 2);
  assert.equal(all['재진'], 1);
});
