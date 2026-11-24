import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHarness} from './isarang-analysis-harness.mjs';

const header = ['차트번호', '환자명', '내원일', '초/재진구분', '진료실'];
const row = (id, day, type = '', name = '가상환자', room = 1) => [id, name, `2026-11-${day}`, type, room];
const source = (role, rows) => ({name: `${role}.xlsx`, data: [header, ...rows], role, fileDate: ''});
const files = {
  outpatient: [source('외래 완료환자', [
    row('A100', '01', '신환', '가상 <환자>'), row('A100', '01', '신환', '가상 <환자>', 2),
    row('B200', '01', '초진'), row('B200', '02', '재진'),
    row('C300', '01', '신환'), row('C300', '02', '재진'),
    row('D400', '01', '신환'), row('E500', '01', '90일초진'), row('F600', '01', '재진'),
    row('G700', '01', '재진'), row('G700', '02', '신환'),
    row('H800', '01', '신환'), row('H800', '02', '신환')
  ])],
  injection: [source('주사 파일', [
    row('A100', '01'), row('A100', '01'), row('A100', '02'),
    row('B200', '02'), row('C300', '01'), row('C300', '02'),
    row('E500', '01'), row('F600', '01'), row('G700', '01')
  ])],
  carm: []
};

const listedIds = element => [...element.innerHTML.matchAll(/<tr><td>([A-Z]\d+)<\/td>/g)].map(match => match[1]);

test('single visit and injection lists count distinct matched patient-days since first new visit', () => {
  const h = makeHarness();
  h.run(files);
  const visits = h.elements.get('singleVisitPatientOutput');
  const injections = h.elements.get('singleInjectionPatientOutput');
  assert.equal(h.elements.get('newPatientLists').hidden, false);
  assert.equal(h.elements.get('singleVisitPatientCount').textContent, '3명');
  assert.equal(h.elements.get('singleInjectionPatientCount').textContent, '2명');
  assert.deepEqual(listedIds(visits), ['A100', 'D400', 'G700']);
  assert.deepEqual(listedIds(injections), ['A100', 'B200']);
  assert.match(visits.innerHTML, /가상 &lt;환자&gt;/);
  assert.match(injections.innerHTML, /<td>B200<\/td>.*?<td>2026-11-02<\/td><td>2<\/td>/);
});

test('both lists follow the current date range and clear when source files are reset', () => {
  const range = {startDate: '2026-11-01', endDate: '2026-11-01'};
  const h = makeHarness(range);
  h.run(files);
  assert.deepEqual(listedIds(h.elements.get('singleVisitPatientOutput')), ['A100', 'B200', 'C300', 'D400', 'H800']);
  assert.deepEqual(listedIds(h.elements.get('singleInjectionPatientOutput')), ['A100', 'C300']);

  range.startDate = range.endDate = '2026-11-30';
  h.c.runAnalysis(files, true);
  assert.equal(h.elements.get('singleVisitPatientCount').textContent, '0명');
  assert.equal(h.elements.get('singleInjectionPatientCount').textContent, '0명');
  assert.match(h.elements.get('singleInjectionPatientOutput').innerHTML, /해당 환자가 없습니다/);

  h.c.clearNewPatientLists();
  assert.equal(h.elements.get('newPatientLists').hidden, true);
  assert.equal(h.elements.get('singleVisitPatients').open, false);
  assert.equal(h.elements.get('singleInjectionPatientOutput').innerHTML, '');
});

test('updating final classification refreshes the cohort without duplicating patients', () => {
  const h = makeHarness();
  h.c.window.__initialClassOverrides = {'H800__2026-11-01': '재진', 'H800__2026-11-02': '초진', 'C300__2026-11-02': '초진', 'E500__2026-11-01': '초진'};
  const outpatient = source('외래 완료환자', [row('C300', '02', '신환')]);
  h.c.runAnalysis({...files, outpatient: [...files.outpatient, outpatient]}, true);
  assert.deepEqual(listedIds(h.elements.get('singleVisitPatientOutput')), ['A100', 'D400', 'E500', 'G700', 'H800']);
  assert.deepEqual(listedIds(h.elements.get('singleInjectionPatientOutput')), ['A100', 'B200', 'E500']);
});
