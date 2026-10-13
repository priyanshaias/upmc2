// UPMC2 — admin report generator: circle > division progress for following up with divisions.
(function () {
  const A = () => window.UPMC_APP, API = window.UPMC_API, FL = window.UPMC_FIELDS, PDF = window.UPMC_PDF;
  const $ = s => document.querySelector(s);
  const CADRES = [['FR', 'Forest Rangers'], ['DFR', 'Deputy Rangers / Foresters'], ['FG', 'Forest Guards & HFG']];
  const CAD_OPTS = [['all', 'All cadres'], ...CADRES];
  const GROUPS = [['cd', 'Circle > Division'], ['c', 'Circles only'], ['d', 'Divisions only']];
  const SORTS = [['circle', 'Circle-wise (register order)'], ['notfilled', '% not filled (highest first)'], ['pending', 'Officers not filled (most first)'],
    ['officers', 'Number of officers (most first)'], ['verified', '% verified (lowest first)'], ['activity', 'Last activity (oldest first)'], ['az', 'Name A–Z']];
  const STATUS = { verified: 'All details verified', partial: 'Posting verified only', pending: 'Awaiting approval', unverified: 'Not verified' };
  const R = { data: null, loading: null, cadre: 'all', group: 'cd', sort: 'circle', only: false, names: false, collapsed: new Set() };

  const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;
  const n = x => Number(x).toLocaleString('en-IN');
  const esc = s => A().esc(s);
  const stamp = () => { const d = new Date(), p = x => String(x).padStart(2, '0'); return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`; };
  const ts = s => { const m = /^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(s || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)).getTime() : null; };
  const day = ms => { if (!ms) return ''; const d = new Date(ms), p = x => String(x).padStart(2, '0'); return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`; };

  /* ---------------- data: all three cadres, through the same call the dashboard uses ---------------- */
  async function load(force) {
    if (R.data && !force) return R.data;
    if (R.loading) return R.loading;
    R.loading = Promise.all(CADRES.map(([c]) => A().guard(() => API.call('adminData', { cadre: c }))))
      .then(res => {
        const out = { officers: [], names: {}, builtAt: res[0].builtAt };
        res.forEach((r, i) => {
          const c = CADRES[i][0];
          out.names[c] = (r.schema[c] || []).map(f => f.name);
          r.officers.forEach(o => { if (!o.incoming) out.officers.push(o); });
        });
        R.data = out; R.loading = null; return out;
      }).catch(e => { R.loading = null; throw e; });
    return R.loading;
  }

  /* ---------------- figures ---------------- */
  function blank() { return { t: 0, full: 0, part: 0, pend: 0, nf: 0, miss: 0, last: null, people: [] }; }
  function add(s, o, miss) {
    s.t++;
    if (o.status === 'verified') s.full++; else if (o.status === 'partial') s.part++; else if (o.status === 'pending') s.pend++; else s.nf++;
    if (miss.length) s.miss++;
    const lt = ts(o.data['Last Updated On']); if (lt && (!s.last || lt > s.last)) s.last = lt;
    if (o.status === 'unverified' || o.status === 'pending' || miss.length) s.people.push({ o, miss });
  }
  function finish(s) { s.any = s.full + s.part; s.pAny = s.t ? s.any / s.t : 0; s.pNF = s.t ? s.nf / s.t : 0; return s; }
  function build() {
    const meta = A().S.meta, cOrder = meta.circles.map(c => c.circle), dOrder = {};
    meta.circles.forEach(c => c.divisions.forEach((d, i) => dOrder[c.circle + '|' + d] = i));
    const circles = {}, divs = {}, total = blank();
    R.data.officers.forEach(o => {
      if (R.cadre !== 'all' && o.cadre !== R.cadre) return;
      const c = o.data.Circle || '(no circle)', d = o.data.Division || '(no division)', k = c + '|' + d;
      const miss = FL.missing(o.data, R.data.names[o.cadre] || []);
      add(circles[c] = circles[c] || Object.assign(blank(), { c, name: c, idx: cOrder.indexOf(c) < 0 ? 999 : cOrder.indexOf(c) }), o, miss);
      add(divs[k] = divs[k] || Object.assign(blank(), { c, d, name: d, idx: dOrder[k] == null ? 999 : dOrder[k] }), o, miss);
      add(total, o, miss);
    });
    Object.values(circles).forEach(finish); Object.values(divs).forEach(finish); finish(total);
    return { circles, divs, total };
  }
  function cmp(key) {
    const tie = (a, b) => (a.cidx || 0) - (b.cidx || 0) || a.idx - b.idx || a.name.localeCompare(b.name);
    return ({
      circle: tie,
      notfilled: (a, b) => b.pNF - a.pNF || b.nf - a.nf || tie(a, b),
      pending: (a, b) => b.nf - a.nf || b.pNF - a.pNF || tie(a, b),
      officers: (a, b) => b.t - a.t || tie(a, b),
      verified: (a, b) => a.pAny - b.pAny || b.t - a.t || tie(a, b),
      activity: (a, b) => (a.last || 0) - (b.last || 0) || b.nf - a.nf || tie(a, b),
      az: (a, b) => a.name.localeCompare(b.name) || tie(a, b),
    })[key];
  }
  const pendingWork = s => s.nf > 0 || s.pend > 0 || s.miss > 0;
  // rows in display order: [{kind:'c'|'d', s}]
  function arrange(F) {
    const sortFn = cmp(R.sort), out = [];
    const cIdx = {}; Object.values(F.circles).forEach(c => cIdx[c.c] = c.idx);
    const divList = Object.values(F.divs).map(d => Object.assign(d, { cidx: cIdx[d.c] }));
    const keep = d => !R.only || pendingWork(d);
    if (R.group === 'd') { divList.filter(keep).sort(sortFn).forEach(s => out.push({ kind: 'd', s })); return out; }
    const circles = Object.values(F.circles).sort(sortFn);
    circles.forEach(c => {
      const ds = divList.filter(d => d.c === c.c && keep(d)).sort(sortFn);
      if (R.only && !ds.length) return;
      out.push({ kind: 'c', s: c, nDiv: ds.length });
      if (R.group === 'cd' && !R.collapsed.has(c.c)) ds.forEach(s => out.push({ kind: 'd', s }));
    });
    return out;
  }

  /* ---------------- url state ---------------- */
  function saveUrl() {
    const p = new URLSearchParams();
    if (R.cadre !== 'all') p.set('cadre', R.cadre);
    if (R.group !== 'cd') p.set('group', R.group);
    if (R.sort !== 'circle') p.set('sort', R.sort);
    if (R.only) p.set('only', '1');
    history.replaceState(null, '', '#/report' + (p.toString() ? '?' + p : ''));
  }
  function readUrl() {
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    R.cadre = CAD_OPTS.some(x => x[0] === q.get('cadre')) ? q.get('cadre') : 'all';
    R.group = GROUPS.some(x => x[0] === q.get('group')) ? q.get('group') : 'cd';
    R.sort = SORTS.some(x => x[0] === q.get('sort')) ? q.get('sort') : 'circle';
    R.only = q.get('only') === '1';
  }

  /* ---------------- page ---------------- */
  async function render(app) {
    const S = A().S;
    if (!S.meta || !S.meta.user || !S.meta.user.isAdmin) { app.innerHTML = '<div class="empty-state"><b>Reports are for administrators.</b></div>'; return; }
    readUrl();
    const opt = (list, cur) => list.map(([k, l]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');
    app.innerHTML = `<div class="rep">
      <div class="crumbs"><a href="#/circles">All circles</a><span class="sep">/</span><span>Report generator</span></div>
      <div class="head"><div><h1 class="page-title">Report generator.</h1>
        <p class="page-sub" id="rAsof">Division-wise progress, for following up with divisions.</p></div><span class="sp"></span>
        <div class="dash-actions">
          <button class="btn sm" id="rRefresh" title="Read the Google Sheet again">↻ Refresh</button>
          <button class="btn sm" id="rCsv">${A().icon.down} Summary CSV</button>
          <button class="btn sm" id="rPeople">${A().icon.down} Pending officers CSV</button>
          <button class="btn sm primary" id="rPdf">${A().icon.down} Follow-up PDF</button></div></div>
      <div class="rbar">
        <label class="fs"><span>Cadre</span><select id="rCadre">${opt(CAD_OPTS, R.cadre)}</select></label>
        <label class="fs"><span>Arrange</span><select id="rGroup">${opt(GROUPS, R.group)}</select></label>
        <label class="fs"><span>Sort by</span><select id="rSort">${opt(SORTS, R.sort)}</select></label>
        <label class="rchk"><input type="checkbox" id="rOnly"${R.only ? ' checked' : ''}> Only divisions with work pending</label>
        <label class="rchk"><input type="checkbox" id="rNames"${R.names ? ' checked' : ''}> Add officer names to the PDF</label>
        <span class="sp"></span><span id="rFold"></span>
      </div>
      <div id="rBody">${A().loaderHtml('admin', 'Loading all three cadres…')}</div></div>`;
    A().animateLoader(app);
    $('#rCadre').onchange = e => { R.cadre = e.target.value; saveUrl(); draw(); };
    $('#rGroup').onchange = e => { R.group = e.target.value; saveUrl(); draw(); };
    $('#rSort').onchange = e => { R.sort = e.target.value; saveUrl(); draw(); };
    $('#rOnly').onchange = e => { R.only = e.target.checked; saveUrl(); draw(); };
    $('#rNames').onchange = e => { R.names = e.target.checked; };
    $('#rRefresh').onclick = async () => {
      const b = A().busy('Reading the register again…');
      try { await A().guard(() => API.call('adminRefresh')); R.data = null; await load(true); draw(); A().toast('Report refreshed.'); } catch (e) {} finally { b.done(); }
    };
    $('#rCsv').onclick = csv; $('#rPeople').onclick = peopleCsv; $('#rPdf').onclick = pdf;
    try { await load(); } catch (e) { $('#rBody').innerHTML = '<div class="empty-state"><b>Could not load the register.</b>Use ↻ Refresh to try again.</div>'; return; }
    if (!$('#rBody')) return;   // left the page while loading
    draw();
  }

  function heat(p) { return p >= .75 ? 'h3' : p >= .4 ? 'h2' : p > 0 ? 'h1' : 'h0'; }
  function draw() {
    const F = build(), T = F.total, rows = arrange(F);
    const nDiv = Object.keys(F.divs).length, quiet = Object.values(F.divs).filter(d => !d.last).length;
    $('#rAsof').textContent = `Data as of ${R.data.builtAt || 'now'} · ${CAD_OPTS.find(x => x[0] === R.cadre)[1]} · ${nDiv} divisions`;
    $('#rFold').innerHTML = R.group === 'cd' ? `<button class="btn sm ghost" id="rOpen">Expand all</button><button class="btn sm ghost" id="rShut">Collapse all</button>` : '';
    const k = (l, v, sub, cls) => `<div class="kpi ${cls || ''}"><span>${l}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const kpis = `<div class="kpis rk">
      ${k('Officers', n(T.t))}
      ${k('All details verified', n(T.full), pct(T.full, T.t) + '%', 'good')}
      ${k('Posting verified only', n(T.part), pct(T.part, T.t) + '%', 'blue')}
      ${k('Any verified', n(T.any), pct(T.any, T.t) + '%', 'good')}
      ${k('Not filled', n(T.nf), pct(T.nf, T.t) + '% of officers', 'bad')}
      ${k('Divisions with no activity', n(quiet), 'of ' + n(nDiv) + ' divisions', 'bad')}</div>`;
    const tr = r => {
      const s = r.s, isC = r.kind === 'c';
      const name = isC
        ? `${R.group === 'cd' ? `<button class="fold" data-fold="${esc(s.c)}" aria-label="${R.collapsed.has(s.c) ? 'Expand' : 'Collapse'} ${esc(s.c)}">${R.collapsed.has(s.c) ? '▸' : '▾'}</button>` : ''}<b>${esc(s.c)}</b>${R.group === 'cd' ? ` <small>${r.nDiv} division${r.nDiv === 1 ? '' : 's'}</small>` : ''}`
        : `<a href="#/d/${encodeURIComponent(s.c)}/${encodeURIComponent(s.d)}">${esc(s.d)}</a>${R.group === 'd' ? `<small>${esc(s.c)}</small>` : ''}`;
      return `<tr class="${isC ? 'crow' : 'drow'}${!isC && R.group === 'cd' ? ' sub' : ''}">
        <td class="nm">${name}</td><td class="r">${n(s.t)}</td><td class="r">${n(s.full)}</td><td class="r">${n(s.part)}</td>
        <td class="r"><span class="pbar"><i style="width:${pct(s.any, s.t)}%"></i></span>${n(s.any)} <small>${pct(s.any, s.t)}%</small></td>
        <td class="r">${s.pend ? n(s.pend) : '–'}</td><td class="r">${n(s.nf)}</td>
        <td class="r"><span class="heat ${heat(s.pNF)}">${pct(s.nf, s.t)}%</span></td>
        <td class="r">${s.miss ? n(s.miss) : '–'}</td><td class="r last">${s.last ? day(s.last) : '<span class="none">No activity</span>'}</td></tr>`;
    };
    $('#rBody').innerHTML = `${kpis}
      <div class="rwrap"><table class="rtable">
        <thead><tr><th>${R.group === 'c' ? 'Circle' : R.group === 'd' ? 'Division' : 'Circle / division'}</th><th class="r">Officers</th><th class="r">Complete</th><th class="r">Partial</th>
          <th class="r">Any verified</th><th class="r">Awaiting approval</th><th class="r">Not filled</th><th class="r">% not filled</th><th class="r">Missing data</th><th class="r">Last activity</th></tr></thead>
        <tbody>${rows.map(tr).join('') || '<tr><td colspan="10" class="faint">Nothing to show. Every division is done.</td></tr>'}</tbody>
        <tfoot><tr><td>Total</td><td class="r">${n(T.t)}</td><td class="r">${n(T.full)}</td><td class="r">${n(T.part)}</td><td class="r">${n(T.any)} <small>${pct(T.any, T.t)}%</small></td>
          <td class="r">${n(T.pend)}</td><td class="r">${n(T.nf)}</td><td class="r">${pct(T.nf, T.t)}%</td><td class="r">${n(T.miss)}</td><td></td></tr></tfoot>
      </table></div>
      <p class="faint rnote"><b>Complete</b> = all details verified. <b>Partial</b> = only posting and home district verified. <b>Not filled</b> = not verified at all and nothing sent for approval.
        <b>Missing data</b> = officers with a required posting field blank. <b>Last activity</b> = latest verification or approved change in the division.</p>`;
    $('#rBody').querySelectorAll('[data-fold]').forEach(b => b.onclick = () => { const c = b.dataset.fold; R.collapsed.has(c) ? R.collapsed.delete(c) : R.collapsed.add(c); draw(); });
    const op = $('#rOpen'), sh = $('#rShut');
    if (op) op.onclick = () => { R.collapsed.clear(); draw(); };
    if (sh) sh.onclick = () => { Object.keys(F.circles).forEach(c => R.collapsed.add(c)); draw(); };
  }

  /* ---------------- exports ---------------- */
  const fname = ext => `UPMC2_Followup_${R.cadre === 'all' ? 'All' : R.cadre}_${stamp()}.${ext}`;
  function download(lines, name) {
    const q = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const blob = new Blob(['﻿' + lines.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  // every division (and circle totals) regardless of folding
  function exportRows(F) {
    const keep = R.collapsed; R.collapsed = new Set(); const rows = arrange(F); R.collapsed = keep; return rows;
  }
  function csv() {
    if (!R.data) return;
    const F = build(), T = F.total;
    const lines = [['Level', 'Circle', 'Division', 'Officers', 'Complete', 'Partial', 'Any verified', '% any verified', 'Awaiting approval', 'Not filled', '% not filled', 'Missing data', 'Last activity', 'Follow-up remarks']];
    exportRows(F).forEach(({ kind, s }) => lines.push([kind === 'c' ? 'Circle total' : 'Division', s.c, kind === 'c' ? '' : s.d, s.t, s.full, s.part, s.any, pct(s.any, s.t), s.pend, s.nf, pct(s.nf, s.t), s.miss, s.last ? day(s.last) : 'No activity', '']));
    lines.push(['Total', '', '', T.t, T.full, T.part, T.any, pct(T.any, T.t), T.pend, T.nf, pct(T.nf, T.t), T.miss, '', '']);
    download(lines, fname('csv')); A().toast('Downloaded the summary CSV.');
  }
  function pendingPeople(F) {
    const divs = exportRows(F).filter(r => r.kind === 'd').map(r => r.s);
    if (R.group === 'c') Object.values(F.divs).sort(cmp(R.sort)).forEach(d => divs.push(d));
    return divs;
  }
  function peopleCsv() {
    if (!R.data) return;
    const F = build(), lines = [['Circle', 'Division', 'Cadre', 'Officer', 'HRMS ID', 'Designation', 'Status', 'Missing fields', 'Follow-up remarks']];
    pendingPeople(F).forEach(d => d.people.forEach(({ o, miss }) => lines.push([d.c, d.d, o.cadre, FL.cleanName(o.data.Name), o.id, o.data.Designation || o.cadre,
      STATUS[o.status] || o.status, miss.map(FL.label).join('; '), ''])));
    if (lines.length === 1) return A().toast('No pending officers in this report.', true);
    download(lines, fname('csv').replace('Followup', 'Pending_officers')); A().toast(`Downloaded ${lines.length - 1} pending officers.`);
  }
  async function pdf() {
    if (!R.data) return;
    if (!window.pdfMake) return A().toast('The PDF tool is still loading. Try again in a moment.', true);
    const F = build(), T = F.total, rows = exportRows(F);
    const b = A().busy('Preparing the follow-up report…', false, 'pdf');
    try {
      const body = rows.map(({ kind, s }) => {
        const row = [kind === 'c' ? s.c : '', kind === 'c' ? (R.group === 'cd' ? 'Circle total' : '') : s.d, s.t, s.full, s.part, `${s.any} (${pct(s.any, s.t)}%)`, s.pend || '', s.nf, pct(s.nf, s.t) + '%', s.miss || '', s.last ? day(s.last) : 'No activity', ''];
        if (kind === 'c' && R.group === 'cd') row._bold = true;
        if (kind === 'd' && R.group === 'd') row[0] = s.c;
        return row;
      });
      body.push(Object.assign(['Total', '', T.t, T.full, T.part, `${T.any} (${pct(T.any, T.t)}%)`, T.pend, T.nf, pct(T.nf, T.t) + '%', T.miss, '', ''], { _bold: true }));
      const after = [];
      if (R.names) {
        after.push({ text: 'Officers to follow up, division-wise', bold: true, fontSize: 11, margin: [0, 14, 0, 4], pageBreak: 'before' });
        after.push({ text: 'Not verified, awaiting approval, or with required posting fields blank.', fontSize: 8, color: '#6b6a66', margin: [0, 0, 0, 6] });
        pendingPeople(F).filter(d => d.people.length).forEach(d => {
          after.push({ text: `${d.d}, ${d.c}  ·  ${d.people.length} officer${d.people.length > 1 ? 's' : ''}`, bold: true, fontSize: 9, margin: [0, 6, 0, 2] });
          after.push({ fontSize: 7.5, color: '#3d3c38', text: d.people.map(({ o, miss }) => `${FL.cleanName(o.data.Name)} (${o.data.Designation || o.cadre}, ${o.id}) – ${(STATUS[o.status] || o.status).toLowerCase()}${miss.length ? ', blank: ' + miss.map(FL.label).join(', ') : ''}`).join(';   ') });
        });
      }
      const name = await PDF.report({
        title: 'Division follow-up report', fileName: fname('pdf'),
        subtitle: `${CAD_OPTS.find(x => x[0] === R.cadre)[1]} · data as of ${R.data.builtAt} · printed ${stamp()}`,
        filters: [GROUPS.find(x => x[0] === R.group)[1], 'sorted by ' + SORTS.find(x => x[0] === R.sort)[1].toLowerCase(), R.only ? 'only divisions with work pending' : ''].filter(Boolean).join('  ·  '),
        kpis: [['Officers', T.t], ['All details verified', T.full, '#1d6b31'], ['Posting verified only', T.part, '#1f4f9e'], ['Any verified', `${T.any} (${pct(T.any, T.t)}%)`, '#1d6b31'],
          ['Not filled', `${T.nf} (${pct(T.nf, T.t)}%)`, '#b42318'], ['Divisions with no activity', Object.values(F.divs).filter(d => !d.last).length, '#b42318']],
        columns: [{ label: 'Circle', w: 58, bold: true, blank: true }, { label: 'Division', w: 92, blank: true }, { label: 'Officers', w: 34, num: true }, { label: 'Complete', w: 42, num: true },
          { label: 'Partial', w: 32, num: true }, { label: 'Any verified', w: 50, num: true }, { label: 'Awaiting', w: 36, num: true }, { label: 'Not filled', w: 38, num: true },
          { label: '% not filled', w: 40, num: true, warn: r => parseInt(r[8], 10) >= 75 }, { label: 'Missing data', w: 38, num: true }, { label: 'Last activity', w: 52 }, { label: 'Remarks / follow-up', w: '*', blank: true, tall: true }],
        rows: body, after,
      });
      A().toast('Downloaded ' + name);
    } catch (e) { A().toast('Could not make the PDF: ' + e.message, true); } finally { b.done(); }
  }

  window.UPMC_REPORT = { render };
})();
