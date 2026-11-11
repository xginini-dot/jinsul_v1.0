import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function setup(file, dates = ['2026-08-31', '2026-09-01', '2026-09-30', '2026-10-01', '2026-10-31', '2026-11-01']) {
  const html = readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
  const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].at(-1)[1];
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, {
      value: id === 'weeklyEstimateDays' ? '30' : '', innerHTML: '', dataset: {},
      classList: {contains: () => false, add() {}, remove() {}},
      listeners: {}, addEventListener(event, listener) { this.listeners[event] = listener; },
      setAttribute() {}
    });
    return elements.get(id);
  };
  let exported;
  const context = {
    window: {}, document: {getElementById: get, addEventListener() {}},
    localStorage: {getItem: () => null, setItem() {}},
    XLSX: {utils: {book_new: () => ({}), aoa_to_sheet: rows => rows, book_append_sheet(book, rows) { exported = rows; }}, writeFile() {}},
    drParseCarm: () => ({source: new Set()})
  };
  vm.createContext(context);
  vm.runInContext(script, context);
  const records = dates.map((date, index) => ({
    id: String(1000 + index), date, room: index % 2 ? '2진료실' : '1진료실', age: 40,
    type: '초진', isInitial: true, finalClass: '초진', inj: true, carm: false
  }));
  const data = file.startsWith('bit')
    ? {visits: [...records, records[1]], hasInjection: true, hasCarm: true, hasAge: true}
    : {outpatientRecords: [...records, records[1]], allInitialEvents: records, fileMap: {},
      injectionDates: new Map(records.map(record => [record.id, new Set([record.date])]))};
  data.startDate = dates[0];
  data.endDate = dates.at(-1);
  context.window.weeklyPrepare(data);
  const render = () => get('weeklyOpenBtn').listeners.click();
  const choose = (month, checked) => get('weeklyMonthChoices').listeners.change({
    target: {closest: () => ({dataset: {weeklyMonth: month}, checked})}
  });
  const enter = (row, period, value) => get('weeklyOutput').listeners.input({
    target: {closest: () => ({dataset: {weeklyRow: row, weeklyWeek: period, weeklyRoom: ''}, value})}
  });
  render();
  return {context, get, render, choose, enter, export: () => { get('weeklyExport').listeners.click(); return exported; }};
}

for (const file of ['bit-stats.html', 'ysarang-stats2.html']) {
  test(file + ' calendar months include endpoints, deduplicate and keep weekly results', () => {
    const app = setup(file);
    const weeklyBefore = JSON.stringify(app.context.window.__weeklyModel.results);
    app.choose('2026-09', true);
    const model = app.context.window.__weeklyModel;
    const september = model.monthly.find(column => column.month === '2026-09');
    assert.equal(september.data.values.clinicDays, 2);
    assert.equal(september.data.values.newPatients + september.data.values.ninetyPatients, 2);
    assert.equal(september.data.values.firstInjected, 2);
    assert.equal(september.data.roomValues['1진료실'].firstCount, 1);
    assert.equal(september.data.roomValues['2진료실'].firstCount, 1);
    assert.equal(model.monthly.find(column => column.month === '2026-10').data.values.clinicDays, 2);
    assert.equal(JSON.stringify(model.results), weeklyBefore);
    assert.ok(app.get('weeklyOutput').innerHTML.indexOf('2026-09') < app.get('weeklyOutput').innerHTML.indexOf('최근 4주'));
  });

  test(file + ' month selection, folding and Excel export match visible columns', () => {
    const app = setup(file);
    assert.deepEqual(Array.from(app.context.window.__weeklyModel.monthly, column => column.month), ['2026-10', '2026-11']);
    app.choose('2026-09', true);
    app.choose('2026-11', false);
    assert.deepEqual(Array.from(app.export()[0].slice(2, 5)), ['2026-09', '2026-10', '최근 4주']);
    app.get('weeklyMonthToggle').listeners.click();
    assert.equal(app.context.window.__weeklyModel.monthly.length, 0);
    assert.equal(app.export()[0][2], '최근 4주');
    app.get('weeklyMonthToggle').listeners.click();
    assert.deepEqual(Array.from(app.context.window.__weeklyModel.monthly, column => column.month), ['2026-09', '2026-10']);
    app.choose('2026-09', false);
    app.choose('2026-10', false);
    assert.equal(app.context.window.__weeklyModel.monthly.length, 0);
    assert.match(app.get('weeklyOutput').innerHTML, /colspan="6"/);
  });

  test(file + ' monthly manual values and derived ratios stay separate from weekly inputs', () => {
    const app = setup(file);
    app.enter('totalRevenue', 'month:2026-10', '12000');
    app.enter('totalRevenue', app.context.window.__weeklyModel.weeks[0], '500');
    app.enter('manualReturn', 'month:2026-10', '3');
    app.enter('manualReturnReserved', 'month:2026-10', '4');
    app.render();
    const exported = app.export();
    const revenue = exported.find(row => row[1] === '총 진료비');
    assert.equal(revenue[2], 12000);
    assert.equal(revenue[4], 500);
    assert.equal(exported.find(row => row[1] === '도수 예약 내원율')[2], 75);
    assert.match(app.get('weeklyOutput').innerHTML, /data-weekly-week="month:2026-10"[^>]*value="12000"/);
  });

  test(file + ' partial leap months and year boundaries use calendar days', () => {
    const app = setup(file, ['2024-02-17', '2024-02-29', '2024-03-01', '2024-12-31', '2025-01-01']);
    app.choose('2024-02', true);
    const february = app.context.window.__weeklyModel.monthly.find(column => column.month === '2024-02');
    assert.equal(february.data.values.clinicDays, 2);
    assert.equal(app.context.window.__weeklyModel.monthly.find(column => column.month === '2024-12').data.values.clinicDays, 1);
    assert.equal(app.context.window.__weeklyModel.monthly.find(column => column.month === '2025-01').data.values.clinicDays, 1);
  });
}
