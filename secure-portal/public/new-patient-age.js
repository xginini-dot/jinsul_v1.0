(() => {
  'use strict';
  const bands = ['19세 이하', '20대', '30대', '40대', '50대', '60대', '70세 이상', '연령 미상'];
  const iso = date => date.toISOString().slice(0, 10);
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '';
    const date = new Date(value + 'T12:00:00Z');
    return Number.isFinite(date.getTime()) && iso(date) === value ? value : '';
  }
  function id(value) { return String(value ?? '').trim().replace(/\s+/g, '').replace(/\.0$/, ''); }
  function ageBand(value) {
    if (value === null || value === undefined || String(value).trim() === '') return 7;
    const age = Number(value);
    if (!Number.isFinite(age) || age < 0 || age > 120) return 7;
    return age < 20 ? 0 : age >= 70 ? 6 : Math.floor(age / 10) - 1;
  }
  function periodKey(date, mode) {
    if (mode === 'month') return date.slice(0, 7);
    const day = new Date(date + 'T12:00:00Z');
    day.setUTCDate(day.getUTCDate() - day.getUTCDay());
    return iso(day);
  }
  function periodRange(key, mode) {
    if (mode === 'month') {
      const [year, month] = key.split('-').map(Number);
      return {start: key + '-01', end: iso(new Date(Date.UTC(year, month, 0, 12)))};
    }
    const day = new Date(key + 'T12:00:00Z');
    day.setUTCDate(day.getUTCDate() + 6);
    return {start: key, end: iso(day)};
  }
  function normalize(data) {
    const inRange = date => date && (!data.startDate || date >= data.startDate) && (!data.endDate || date <= data.endDate);
    const events = (data.events || []).map(event => ({id: id(event.id), date: validDate(event.date), age: event.age, kind: event.kind || '초진'}))
      .filter(event => event.id && inRange(event.date));
    const visits = (data.visits || []).map(visit => ({id: id(visit.id), date: validDate(visit.date)}))
      .filter(visit => visit.id && inRange(visit.date));
    return {...data, events, visits};
  }
  function periods(data, mode) {
    return [...new Set([...data.events, ...data.visits].map(record => periodKey(record.date, mode)))].sort();
  }
  function buildModel(data, key, mode = 'week', includeNinety = false) {
    const range = periodRange(key, mode);
    const start = data.startDate && data.startDate > range.start ? data.startDate : range.start;
    const end = data.endDate && data.endDate < range.end ? data.endDate : range.end;
    const patients = new Map();
    for (const event of data.events) {
      if (event.date < start || event.date > end || !(event.kind === '초진' || includeNinety && event.kind === '90초진')) continue;
      const previous = patients.get(event.id);
      if (!previous || event.date < previous.date) patients.set(event.id, {...event});
      else if (event.date === previous.date && ageBand(previous.age) === 7 && ageBand(event.age) !== 7) previous.age = event.age;
    }
    const dates = new Map([...patients].map(([person]) => [person, new Set()]));
    for (const visit of data.visits) {
      const patient = patients.get(visit.id);
      if (patient && visit.date >= patient.date && visit.date >= start && visit.date <= end) dates.get(visit.id).add(visit.date);
    }
    const rows = bands.map(band => ({band, patients: 0, visits: data.hasVisits ? 0 : null, average: null, once: 0, twice: 0, three: 0, fourPlus: 0}));
    let missingInitialDates = 0;
    for (const patient of patients.values()) {
      const row = rows[ageBand(patient.age)];
      row.patients++;
      if (!data.hasVisits) continue;
      const days = dates.get(patient.id);
      if (!days.has(patient.date)) missingInitialDates++;
      // The initial record itself is evidence of this visit, even if omitted from the total-visit export.
      days.add(patient.date);
      row.visits += days.size;
      row[days.size === 1 ? 'once' : days.size === 2 ? 'twice' : days.size === 3 ? 'three' : 'fourPlus']++;
    }
    const total = {band: '전체', patients: 0, visits: data.hasVisits ? 0 : null, average: null, once: 0, twice: 0, three: 0, fourPlus: 0};
    for (const row of rows) {
      row.average = data.hasVisits && row.patients ? row.visits / row.patients : null;
      for (const field of ['patients', 'once', 'twice', 'three', 'fourPlus']) total[field] += row[field];
      if (data.hasVisits) total.visits += row.visits;
    }
    total.average = data.hasVisits && total.patients ? total.visits / total.patients : null;
    return {key, mode, includeNinety, start, end, range, rows, total, missingInitialDates, hasVisits: !!data.hasVisits};
  }
  window.JinsulNewPatientAge = {normalize, periods, buildModel, ageBand, periodRange};
  let data = null, dialog, button, opener, selected = '', model;
  const get = key => document.getElementById(key);
  const text = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  const number = value => value === null ? '—' : Number(value).toLocaleString('ko-KR');
  window.newPatientAgePrepare = input => {
    data = input ? normalize(input) : null;
    selected = '';
    if (button) button.disabled = !data;
    const inWeekly = get('newPatientAgeWeeklyBtn');
    if (inWeekly) inWeekly.disabled = !data;
    if (dialog?.open) render();
  };
  function render() {
    if (!data) {
      get('newPatientAgeOutput').innerHTML = '<p>자료를 다시 계산해 주세요.</p>';
      get('newPatientAgePeriod').replaceChildren();
      get('newPatientAgeSummary').textContent = '';
      get('newPatientAgeNote').textContent = '';
      get('newPatientAgeExport').disabled = true;
      model = null;
      return;
    }
    const mode = get('newPatientAgeMode').value;
    const keys = periods(data, mode);
    if (!keys.includes(selected)) selected = keys.at(-1) || '';
    get('newPatientAgePeriod').innerHTML = keys.map(key => {
      const range = periodRange(key, mode);
      const label = mode === 'month' ? key.replace('-', '년 ') + '월' : range.start + ' ~ ' + range.end;
      return `<option value="${key}"${key === selected ? ' selected' : ''}>${label}</option>`;
    }).join('');
    get('newPatientAgeExport').disabled = !selected;
    if (!selected) {
      model = null;
      get('newPatientAgeOutput').innerHTML = '<p>조회기간에 해당하는 초진·내원 자료가 없습니다.</p>';
      get('newPatientAgeSummary').textContent = '';
      get('newPatientAgeNote').textContent = '';
      return;
    }
    model = buildModel(data, selected, mode, get('newPatientAgeScope').value === 'all');
    const fields = ['patients', 'visits', 'average', 'once', 'twice', 'three', 'fourPlus'];
    const headings = ['환자수', '총 내원횟수', '1인당 평균', '1회 내원', '2회 내원', '3회 내원', '4회 이상'];
    const cells = row => fields.map(field => `<td>${field !== 'patients' && !model.hasVisits ? '—' : field === 'average' ? row.average === null ? '—' : row.average.toFixed(2) + '회' : number(row[field])}</td>`).join('');
    get('newPatientAgeOutput').innerHTML = `<table><caption>초진일이 ${text(model.start)} ~ ${text(model.end)}인 환자의 같은 기간 내 내원 통계</caption><thead><tr><th scope="col">연령대</th>${headings.map(heading => `<th scope="col">${heading}</th>`).join('')}</tr></thead><tbody>${model.rows.map(row => `<tr><th scope="row">${row.band}</th>${cells(row)}</tr>`).join('')}</tbody><tfoot><tr><th scope="row">전체</th>${cells(model.total)}</tr></tfoot></table>`;
    get('newPatientAgeSummary').textContent = `초진 환자 ${number(model.total.patients)}명 · 총 내원 ${number(model.total.visits)}${model.hasVisits ? '회' : ''} · 1인당 평균 ${model.total.average === null ? '—' : model.total.average.toFixed(2) + '회'}`;
    const notes = [
      `집계기간 ${model.start} ~ ${model.end}. ${mode === 'week' ? '주간은 일요일~토요일' : '월간은 매월 1일~말일'}이며, 업로드 조회기간과 겹치는 자료만 반영합니다.`,
      '해당 기간에 초진한 환자의 초진일 이후 같은 기간 내 내원만 계산합니다. 같은 환자의 같은 날짜는 진료실·처방·중복 파일 수와 관계없이 1회입니다. 초진 기록에서 읽은 연령을 사용하고, 연령이 없거나 유효하지 않으면 ‘연령 미상’에 포함합니다.',
      get('newPatientAgeScope').value === 'all' ? '초진 및 90초진을 포함합니다. 같은 기간에 초진 기록이 여러 번 있어도 환자수는 1명입니다.' : '신환(초진)만 포함하며, 90초진과 재진으로 분류된 기록은 대상에서 제외합니다.',
      data.classificationNote || '',
      model.hasVisits ? `초진일은 초진 기록을 근거로 1회 포함합니다.${model.missingInitialDates ? ` 총내원 자료에서 초진 당일이 확인되지 않은 환자 ${model.missingInitialDates}명은 초진일 1회를 추가했습니다.` : ''} 업로드하지 않은 날짜의 추가 내원은 계산할 수 없습니다.` : '총내원 파일이 없거나 내원일·환자 식별 열을 확인하지 못해 환자수만 표시합니다. 내원 횟수는 총내원 파일 업로드 후 조회하세요.'
    ].filter(Boolean);
    get('newPatientAgeNote').textContent = notes.join('\n');
  }
  function open(event) {
    if (!data) return;
    opener = event.currentTarget;
    render();
    dialog.showModal();
  }
  function exportResult() {
    if (!model || !window.XLSX) return;
    const rows = [['연령대', '환자수', '총 내원횟수', '1인당 평균 내원횟수', '1회 내원 환자수', '2회 내원 환자수', '3회 내원 환자수', '4회 이상 내원 환자수'], ...[...model.rows, model.total].map(row => [row.band, row.patients, model.hasVisits ? row.visits : '', row.average === null ? '' : Number(row.average.toFixed(2)), ...['once', 'twice', 'three', 'fourPlus'].map(field => model.hasVisits ? row[field] : '')])];
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.aoa_to_sheet(rows), '신환_연령별_내원');
    window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.aoa_to_sheet([['항목', '내용'], ['프로그램', data.sourceLabel], ['구분', model.mode === 'week' ? '주간' : '월간'], ['조회기간', model.start + ' ~ ' + model.end], ['초진 포함 기준', get('newPatientAgeScope').selectedOptions[0].textContent], ['계산 기준', get('newPatientAgeNote').textContent]]), '집계기준');
    window.XLSX.writeFile(workbook, `${data.sourceLabel}_신환연령별내원_${model.start}_${model.end}.xlsx`);
  }
  function init() {
    const anchor = get('weeklyOpenBtn') || get('downloadBtn');
    if (!anchor || get('newPatientAgeOpenBtn')) return;
    button = document.createElement('button');
    button.id = 'newPatientAgeOpenBtn';
    button.type = 'button';
    button.className = anchor.className;
    button.textContent = '📊 신환 연령별 내원';
    button.disabled = !data;
    button.addEventListener('click', open);
    anchor.insertAdjacentElement('afterend', button);
    const exportButton = get('weeklyExport');
    if (exportButton) {
      const secondary = button.cloneNode(true);
      secondary.id = 'newPatientAgeWeeklyBtn';
      secondary.addEventListener('click', open);
      exportButton.insertAdjacentElement('afterend', secondary);
    }
    dialog = document.createElement('dialog');
    dialog.id = 'newPatientAgeDialog';
    dialog.setAttribute('aria-labelledby', 'newPatientAgeTitle');
    dialog.innerHTML = `<header><div><h2 id="newPatientAgeTitle">주간·월간 신환 연령별 내원</h2><p>해당 주·월의 초진 환자가 같은 주·월에 내원한 횟수</p></div><button type="button" id="newPatientAgeClose" aria-label="연령별 내원 창 닫기" autofocus>닫기</button></header><div class="new-age-controls"><label>조회 단위<select id="newPatientAgeMode"><option value="week">주간 (일~토)</option><option value="month">월간</option></select></label><label>조회 기간<select id="newPatientAgePeriod"></select></label><label>초진 포함 기준<select id="newPatientAgeScope"><option value="new">신환(초진)만</option><option value="all">초진 전체 (90초진 포함)</option></select></label><button type="button" id="newPatientAgeExport">엑셀 다운로드</button></div><p id="newPatientAgeSummary" role="status" aria-live="polite"></p><div id="newPatientAgeOutput" tabindex="0" aria-label="연령별 내원 통계 표"></div><p id="newPatientAgeNote"></p>`;
    document.body.appendChild(dialog);
    get('newPatientAgeOutput').insertAdjacentHTML('beforebegin', '<p class="new-age-scroll-hint">표를 좌우로 밀면 평균과 내원 횟수별 환자수를 볼 수 있습니다.</p>');
    get('newPatientAgeClose').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => opener?.focus());
    get('newPatientAgeMode').addEventListener('change', () => {selected = ''; render();});
    get('newPatientAgePeriod').addEventListener('change', event => {selected = event.target.value; render();});
    get('newPatientAgeScope').addEventListener('change', render);
    get('newPatientAgeExport').addEventListener('click', exportResult);
    for (const inputId of ['fileInput', 'clinicFiles', 'bFile', 'vFile', 'outpatientFiles', 'injectionFiles', 'carmFiles']) {
      get(inputId)?.addEventListener('change', () => window.newPatientAgePrepare(null));
    }
    get('clearBtn')?.addEventListener('click', () => window.newPatientAgePrepare(null));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
