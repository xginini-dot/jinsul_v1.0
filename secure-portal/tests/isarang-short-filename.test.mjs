import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {makeHarness, pick} from './isarang-analysis-harness.mjs';

function harness(year = 2026) {
  const h = makeHarness();
  h.c.document.getElementById('filenameYear').value = String(year);
  return h;
}

test('original dated filenames keep explicit years even with a different abbreviation year', () => {
  const h = harness();
  for (const name of [
    '외래 완료환자 검색(진료일자_2026-09-15_전체).xls',
    '외래 완료환자 검색(진료일자_20260915_전체).xlsx',
    '2026.9.15.xls', '2026년 9월 15일.xlsx', '20260915.xls'
  ]) assert.equal(h.c.extractDateFromFilename(name, 2025), '2026-09-15', name);
});

test('month-day abbreviations accept unpadded dates, separators, Unicode and duplicate-download suffixes', () => {
  const h = harness();
  for (const name of ['9.15.xls', '09.15.xlsx', '9-15.xls', '9_15.xls', '9월15일.xlsx', '９．１５.xls', ' 9.15 (1).XLSX ']) {
    assert.equal(h.c.extractDateFromFilename(name, 2026), '2026-09-15', name);
  }
  assert.equal(h.c.extractDateFromFilename('10.1.xls', 2026), '2026-10-01');
  assert.equal(h.c.extractDateFromFilename('12.31.xls', 2025), '2025-12-31');
  assert.equal(h.c.extractDateFromFilename('1.1.xls', 2026), '2026-01-01');
});

test('invalid dates, periods and unrelated numbers never become outpatient dates', () => {
  const h = harness();
  for (const name of ['2.29.xls', '9.31.xls', '0.15.xls', '13.1.xls', '9.0.xls', '9.15~10.1.xls', '통계 9.15.xls', '915.xls', '2026-02-30.xls']) {
    assert.equal(h.c.extractDateFromFilename(name, 2026), '', name);
  }
  assert.equal(h.c.extractDateFromFilename('2.29.xls', 2024), '2024-02-29');
  assert.equal(h.c.extractDateFromFilename('9.15.xls', 2026.5), '');
});

function outpatient(name, id, type = '초진') {
  return {name, file: {name}, role: '외래 완료환자', fileDate: '', data: [
    ['차트번호', '환자명', '주민등록번호', '나이', '초/재진구분', '진료실'],
    [id, '가상자료', '', 40, type, 1]
  ]};
}
function files(names) {
  return {
    outpatient: [outpatient(names[0], '100'), outpatient(names[1], '100', '재진'), outpatient(names[2], '200')],
    injection: [{name: '주사.xls', role: '주사 파일', fileDate: '', data: [
      ['차트번호', '환자명', '주민등록번호', '내원일'],
      ['100', '가상자료', '', '2026-09-15'], ['100', '가상자료', '', '2026-09-16'], ['200', '가상자료', '', '2026-10-01']
    ]}],
    carm: []
  };
}

test('multiple renamed files produce the same summary, daily dates and injection matches as originals', () => {
  const old = harness(), renamed = harness();
  const oldFiles = files(['2026-09-15.xls', '2026-09-16.xls', '2026-10-01.xls']);
  const newFiles = files(['9.15.xls', '9.16.xls', '10.1.xls']);
  assert.equal(JSON.stringify(renamed.run(newFiles)), JSON.stringify(old.run(oldFiles)));
  assert.equal(JSON.stringify(renamed.c.window.__latestDailyStats), JSON.stringify(old.c.window.__latestDailyStats));
  assert.deepEqual(Array.from(renamed.c.weeklyContext.injectionDates.get('100')), ['2026-09-15', '2026-09-16']);
  assert.match(renamed.elements.get('fileDiagnostic').innerHTML, /9\.15\.xls → 파일명 날짜 2026-09-15/);
});

test('internal visit dates take priority over abbreviated filenames', () => {
  const h = harness();
  const input = files(['9.15.xls', '9.16.xls', '10.1.xls']);
  input.outpatient[0].data[0].push('내원일');
  input.outpatient[0].data[1].push('2026-09-14');
  h.run(input);
  assert.ok(h.c.weeklyContext.outpatientRecords.some(record => record.date === '2026-09-14'));
  assert.ok(!h.c.weeklyContext.outpatientRecords.some(record => record.date === '2026-09-15'));
});

test('changing the abbreviation year recalculates cached files and clears invalid leap dates', () => {
  const h = harness(2024);
  const input = {outpatient: [outpatient('2.29.xls', '100')], injection: [], carm: []};
  h.run(input);
  assert.equal(input.outpatient[0].fileDate, '2024-02-29');
  h.c.document.getElementById('filenameYear').value = '2025';
  assert.equal(h.run(input).length, 0);
  assert.equal(input.outpatient[0].fileDate, '');
});

test('normal multi-file loading applies the selected year before analysis', async () => {
  const h = harness(2025);
  h.c.readXlsx = async () => [['차트번호', '환자명'], ['100', '가상자료']];
  h.c.yieldToBrowser = async () => {};
  vm.runInContext('async ' + pick('loadFiles'), h.c);
  const loaded = await h.c.loadFiles([{name: '9.15.xls'}, {name: '10.1.xlsx'}], '외래 완료환자');
  assert.deepEqual(Array.from(loaded, source => source.fileDate), ['2025-09-15', '2025-10-01']);
});
