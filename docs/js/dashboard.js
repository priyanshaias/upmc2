// UPMC2 — admin dashboard: KPIs, charts, filters, table and exports for one cadre at a time.
(function () {
  const A = () => window.UPMC_APP, API = window.UPMC_API, FL = window.UPMC_FIELDS, PDF = window.UPMC_PDF;
  const $ = s => document.querySelector(s);
  const CADRES = [['FR', 'Forest Rangers'], ['DFR', 'Deputy Rangers / Foresters'], ['FG', 'Forest Guards & HFG']];
  const BANDS = [[0, 2, 'Under 2'], [2, 3, '2–3'], [3, 5, '3–5'], [5, 8, '5–8'], [8, 99, '8+']];
  const BASIS = { posting: 'Range / beat', division: 'Division', circle: 'Circle' };
  const VER = { verified: 'All verified', corrected: 'All verified (corrected)', partial: 'Posting verified only', pending: 'Awaiting approval', unverified: 'Not verified' };
  const isFull = v => v === 'verified' || v === 'corrected';
  const HOME = { yes: 'Yes', no: 'No', unknown: 'Not known' };
  const MATCH = ['Matched', 'Matched (name differs)', 'Posting list shows other division', 'Not present in posting list', 'Not in Gradation List'];
  const EMPTY = { q: '', circle: '', division: '', ver: '', home: '', basis: 'posting', band: '', min: '', match: '', desig: '', retire: '', missing: '' };
  const D = { cadre: 'FR', data: {}, loading: {}, f: Object.assign({}, EMPTY), limit: 3, sort: { k: 'circle', dir: 1 }, shown: 100 };

  /* ---------------- data ---------------- */
  const yrs = s => { const d = FL.toDate(s); return d ? Math.max(0, (Date.now() - d) / (365.25 * 864e5)) : null; };
  function derive(o) {
    const d = o.data, postF = d.hasOwnProperty('Since when in this Range') && o.cadre !== 'DFR' ? 'Since when in this Range' : 'Since when in this Beat';
    const h = d['Home District'], r = d['District in which Range lies'];
    o.x = {
      posting: yrs(d[postF]), division: yrs(d['Division Date']), circle: yrs(d['Circle Date']),
      home: h && r ? (h === r ? 'yes' : 'no') : 'unknown',
      ver: o.status === 'verified' ? (d.Verification === 'Corrected' ? 'corrected' : 'verified') : o.status,
      retire: (() => { const t = FL.toDate(d['Date of Retirement']); return t ? (t - Date.now()) / (365.25 * 864e5) : null; })(),
      name: FL.cleanName(d.Name), search: [d.Name, o.id, d['Present Range / Office'], d['Present Beat'], d.Remarks, d['Posting List Remarks'], d.Division].join(' ').toLowerCase(),
    };
    return o;
  }
  async function load(c, quiet) {
    if (D.data[c]) return D.data[c];
    if (D.loading[c]) return D.loading[c];
    D.loading[c] = A().guard(() => API.call('adminData', { cadre: c })).then(r => {
      r.officers.forEach(derive); D.data[c] = r; delete D.loading[c];
      drawTabs();
      return r;
    }).catch(e => { delete D.loading[c]; throw e; });
    return D.loading[c];
  }

  /* ---------------- filtering ---------------- */
  const inBand = (y, b) => { const x = BANDS.find(z => z[2] === b); return y != null && x && y >= x[0] && y < x[1]; };
  function pass(o, f, skip) {
    const x = o.x, d = o.data;
    if (skip !== 'q' && f.q && !x.search.includes(f.q.toLowerCase())) return false;
    if (skip !== 'circle' && f.circle && d.Circle !== f.circle) return false;
    if (skip !== 'division' && skip !== 'circle' && f.division && d.Division !== f.division) return false;
    if (skip !== 'ver' && f.ver && !(f.ver === 'anyverified' ? isFull(x.ver) : f.ver === 'anyposting' ? isFull(x.ver) || x.ver === 'partial' : x.ver === f.ver)) return false;
    if (skip !== 'home' && f.home && x.home !== f.home) return false;
    if (skip !== 'band' && f.band && !inBand(x[f.basis], f.band)) return false;
    if (skip !== 'min' && f.min !== '' && !(x[f.basis] != null && x[f.basis] >= Number(f.min))) return false;
    if (skip !== 'match' && f.match && d['Posting List Match'] !== f.match) return false;
    if (skip !== 'desig' && f.desig && d.Designation !== f.desig) return false;
    if (skip !== 'retire' && f.retire && !(x.retire != null && x.retire >= 0 && x.retire <= Number(f.retire))) return false;
    if (skip !== 'missing' && f.missing) {
      if (f.missing === 'home' && d['Home District']) return false;
      if (f.missing === 'rdist' && d['District in which Range lies']) return false;
      if (f.missing === 'range' && d['Present Range / Office']) return false;
    }
    return true;
  }
  const all = () => (D.data[D.cadre] || { officers: [] }).officers;
  const view = skip => all().filter(o => pass(o, D.f, skip));

  /* ---------------- url state ---------------- */
  function saveUrl() {
    const p = new URLSearchParams(); p.set('c', D.cadre);
    Object.keys(D.f).forEach(k => { if (D.f[k] !== EMPTY[k]) p.set(k, D.f[k]); });
    if (D.limit !== 3) p.set('limit', D.limit);
    history.replaceState(null, '', '#/dash?' + p.toString());
  }
  function readUrl() {
    const q = new URLSearchParams((location.hash.split('?')[1]) || '');
    D.cadre = ['FR', 'DFR', 'FG'].includes(q.get('c')) ? q.get('c') : D.cadre;
    D.f = Object.assign({}, EMPTY); Object.keys(EMPTY).forEach(k => { if (q.has(k)) D.f[k] = q.get(k); });
    if (q.has('limit')) D.limit = Number(q.get('limit')) || 3;
  }
  function setF(patch) { Object.assign(D.f, patch); D.shown = 100; saveUrl(); syncControls(); drawDynamic(); }

  /* ---------------- shell ---------------- */
  const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;
  const n = x => Number(x).toLocaleString('en-IN');
  async function render(app) {
    const S = A().S;
    if (!S.meta || !S.meta.user || !S.meta.user.isAdmin) { app.innerHTML = '<div class="empty-state"><b>The dashboard is for administrators.</b></div>'; return; }
    readUrl();
    app.innerHTML = `<div class="dash">
      <div class="crumbs"><a href="#/circles">All circles</a><span class="sep">/</span><span>Dashboard</span></div>
      <div class="head"><div><h1 class="page-title">Posting & verification dashboard.</h1>
        <p class="page-sub" id="asof">Loading the register…</p></div><span class="sp"></span>
        <div class="dash-actions">
          <button class="btn sm" id="dRefresh" title="Read the Google Sheet again">↻ Refresh</button>
          <button class="btn sm" id="dCsv">${A().icon.down} CSV</button>
          <button class="btn sm" id="dPdf">${A().icon.down} PDF report</button>
          <button class="btn sm soft" id="dSheets">${A().icon.down} Information sheets</button></div></div>
      <div class="ctabs" id="ctabs"></div>
      <div id="dbody">${A().loaderHtml('admin', 'Loading the dashboard…')}</div></div>`;
    A().animateLoader(app);
    drawTabs();
    $('#dRefresh').onclick = refresh; $('#dCsv').onclick = csv; $('#dPdf').onclick = pdfReport; $('#dSheets').onclick = sheets;
    await load(D.cadre);
    drawBody();
    CADRES.forEach(([c]) => { if (c !== D.cadre) load(c, true).catch(() => {}); });   // warm the other tabs
  }

  function drawTabs() {
    const el = $('#ctabs'); if (!el) return;
    el.innerHTML = CADRES.map(([c, label]) => {
      const d = D.data[c], tot = d ? d.officers.length : null, v = d ? d.officers.filter(o => o.x.ver === 'verified' || o.x.ver === 'corrected').length : 0, p = pct(v, tot);
      return `<button class="ctab${c === D.cadre ? ' on' : ''}" data-c="${c}">
        <span class="ring sm" style="--p:${p}"><i>${d ? p + '%' : '…'}</i></span>
        <span><b>${label}</b><small>${d ? `${n(tot)} officers · ${n(v)} verified` : 'loading…'}</small></span></button>`;
    }).join('');
    el.querySelectorAll('.ctab').forEach(b => b.onclick = async () => {
      if (b.dataset.c === D.cadre) return;
      D.cadre = b.dataset.c; D.f = Object.assign({}, EMPTY); D.shown = 100; saveUrl(); drawTabs();
      if (!D.data[D.cadre]) { $('#dbody').innerHTML = A().loaderHtml('admin', 'Loading ' + CADRES.find(x => x[0] === D.cadre)[1] + '…'); A().animateLoader($('#dbody')); }
      await load(D.cadre); drawBody();
    });
  }

  function drawBody() {
    const data = D.data[D.cadre]; if (!data) return;
    const circles = [...new Set(all().map(o => o.data.Circle))];
    const order = (A().S.meta.circles || []).map(c => c.circle);
    circles.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    $('#asof').textContent = `Data as of ${data.builtAt || 'now'} · ${CADRES.find(x => x[0] === D.cadre)[1]} · click any number or bar to filter.`;
    const opt = (v, l, cur) => `<option value="${A().esc(v)}"${v === cur ? ' selected' : ''}>${A().esc(l)}</option>`;
    $('#dbody').innerHTML = `
      <section class="kpis dk" id="kpis"></section>
      <section class="charts" id="charts"></section>
      <section class="fbar" id="fbar">
        <div class="frow">
          <label class="fs grow"><span>Search</span><input id="fq" placeholder="Name, HRMS ID, range, beat or remark" value="${A().esc(D.f.q)}"></label>
          <label class="fs"><span>Circle</span><select id="fcircle">${opt('', 'All circles', D.f.circle)}${circles.map(c => opt(c, c, D.f.circle)).join('')}</select></label>
          <label class="fs"><span>Division</span><select id="fdivision"></select></label>
          <label class="fs"><span>Verification</span><select id="fver">${opt('', 'All', D.f.ver)}${opt('anyverified', 'All verified (any)', D.f.ver)}${opt('anyposting', 'Posting verified (incl. all)', D.f.ver)}${Object.entries(VER).map(([k, l]) => opt(k, l, D.f.ver)).join('')}</select></label>
          <label class="fs"><span>Posted in home district</span><select id="fhome">${opt('', 'All', D.f.home)}${Object.entries(HOME).map(([k, l]) => opt(k, l, D.f.home)).join('')}</select></label>
        </div>
        <div class="frow">
          <label class="fs"><span>Tenure in</span><select id="fbasis">${Object.entries(BASIS).map(([k, l]) => opt(k, l, D.f.basis)).join('')}</select></label>
          <label class="fs"><span>Tenure band</span><select id="fband">${opt('', 'Any', D.f.band)}${BANDS.map(b => opt(b[2], b[2] + ' years', D.f.band)).join('')}</select></label>
          <label class="fs"><span>At least (years)</span><input id="fmin" type="number" min="0" max="40" step="0.5" placeholder="Any" value="${A().esc(D.f.min)}"></label>
          <label class="fs"><span>Posting list</span><select id="fmatch">${opt('', 'All', D.f.match)}${MATCH.map(m => opt(m, m, D.f.match)).join('')}</select></label>
          ${D.cadre === 'FG' ? `<label class="fs"><span>Designation</span><select id="fdesig">${opt('', 'FG and HFG', D.f.desig)}${opt('FG', 'FG', D.f.desig)}${opt('HFG', 'HFG', D.f.desig)}</select></label>` : ''}
          <label class="fs"><span>Retiring within</span><select id="fretire">${opt('', 'Any time', D.f.retire)}${['1', '2', '3'].map(y => opt(y, y + (y === '1' ? ' year' : ' years'), D.f.retire)).join('')}</select></label>
          <label class="fs"><span>Missing</span><select id="fmissing">${opt('', 'Nothing', D.f.missing)}${opt('home', 'Home district', D.f.missing)}${opt('rdist', 'District of range', D.f.missing)}${opt('range', 'Present range', D.f.missing)}</select></label>
          <label class="fs lim" title="Used by the “Over tenure” card and the orange highlights"><span>Over-tenure limit</span><span class="limrow"><input id="flimit" type="number" min="1" max="20" step="1" value="${D.limit}"> yrs</span></label>
        </div>
        <div class="chips-row" id="chips"></div>
      </section>
      <section class="tablecard" id="tbl"></section>`;
    syncControls();
    const on = (id, ev, fn) => { const el = $('#' + id); if (el) el.addEventListener(ev, fn); };
    let qt; on('fq', 'input', e => { clearTimeout(qt); qt = setTimeout(() => setF({ q: e.target.value.trim() }), 200); });
    on('fcircle', 'change', e => setF({ circle: e.target.value, division: '' }));
    on('fdivision', 'change', e => setF({ division: e.target.value }));
    ['ver', 'home', 'basis', 'band', 'match', 'desig', 'retire', 'missing'].forEach(k => on('f' + k, 'change', e => setF({ [k]: e.target.value })));
    on('fmin', 'change', e => setF({ min: e.target.value }));
    on('flimit', 'change', e => { D.limit = Math.max(1, Number(e.target.value) || 3); saveUrl(); drawDynamic(); });
    drawDynamic();
  }

  function syncControls() {
    const set = (id, v) => { const el = $('#' + id); if (el && el.value !== v) el.value = v; };
    const divs = [...new Set(all().filter(o => !D.f.circle || o.data.Circle === D.f.circle).map(o => o.data.Division))].sort();
    const fd = $('#fdivision');
    if (fd) fd.innerHTML = `<option value="">${D.f.circle ? 'All divisions' : 'All divisions'}</option>` + divs.map(d => `<option${d === D.f.division ? ' selected' : ''}>${A().esc(d)}</option>`).join('');
    ['circle', 'division', 'ver', 'home', 'basis', 'band', 'match', 'desig', 'retire', 'missing'].forEach(k => set('f' + k, D.f[k]));
    set('fmin', D.f.min); const q = $('#fq'); if (q && document.activeElement !== q) q.value = D.f.q;
  }

  /* ---------------- dynamic parts ---------------- */
  function drawDynamic() { kpis(); charts(); chips(); table(); }

  function kpis() {
    const v = view(), tot = all().length;
    const c = { verified: 0, partial: 0, pending: 0, unverified: 0 }, home = { yes: 0 }; let over = 0, nip = 0;
    v.forEach(o => { c[o.x.ver === 'corrected' ? 'verified' : o.x.ver]++; if (o.x.home === 'yes') home.yes++; if (o.x.posting != null && o.x.posting >= D.limit) over++;
      if (o.data['Posting List Match'] === 'Not present in posting list') nip++; });
    const card = (k, label, val, sub, cls, active) => `<button class="kpi dkpi ${cls}${active ? ' on' : ''}" data-k="${k}">
      <span>${label}</span><b>${n(val)}</b><small>${sub}</small><i class="kbar"><em style="width:${pct(val, v.length || 1)}%"></em></i></button>`;
    $('#kpis').innerHTML = [
      card('all', 'Officers in view', v.length, v.length === tot ? 'whole cadre' : `of ${n(tot)} in cadre`, 'ink', false),
      card('verified', 'All details verified', c.verified, pct(c.verified, v.length) + '% of view', 'good', D.f.ver === 'anyverified'),
      card('partial', 'Posting verified only', c.partial, pct(c.partial, v.length) + '% of view', 'blue', D.f.ver === 'partial'),
      card('pending', 'Awaiting approval', c.pending, pct(c.pending, v.length) + '% of view', 'violet', D.f.ver === 'pending'),
      card('unverified', 'Not verified', c.unverified, pct(c.unverified, v.length) + '% of view', 'muted', D.f.ver === 'unverified'),
      card('home', 'Posted in home district', home.yes, pct(home.yes, v.length) + '% of view', 'hot', D.f.home === 'yes'),
      card('over', `Over ${D.limit} yrs in range/beat`, over, pct(over, v.length) + '% of view', 'warn', D.f.basis === 'posting' && String(D.f.min) === String(D.limit)),
      card('nip', 'Not in posting list', nip, pct(nip, v.length) + '% of view', 'warn2', D.f.match === 'Not present in posting list'),
    ].join('');
    $('#kpis').querySelectorAll('.dkpi').forEach(b => b.onclick = () => {
      const k = b.dataset.k, f = D.f;
      if (k === 'all') setF(Object.assign({}, EMPTY));
      if (k === 'verified') setF({ ver: f.ver === 'anyverified' ? '' : 'anyverified' });
      if (k === 'pending' || k === 'unverified' || k === 'partial') setF({ ver: f.ver === k ? '' : k });
      if (k === 'home') setF({ home: f.home === 'yes' ? '' : 'yes' });
      if (k === 'over') { const onNow = f.basis === 'posting' && String(f.min) === String(D.limit); setF({ basis: 'posting', min: onNow ? '' : String(D.limit), band: '' }); }
      if (k === 'nip') setF({ match: f.match === 'Not present in posting list' ? '' : 'Not present in posting list' });
    });
  }

  function charts() {
    const esc = A().esc;
    // 1. verification by circle
    const byC = {}; view('circle').forEach(o => { const c = byC[o.data.Circle] = byC[o.data.Circle] || { v: 0, h: 0, p: 0, u: 0, t: 0 }; c.t++; c[o.x.ver === 'pending' ? 'p' : o.x.ver === 'unverified' ? 'u' : o.x.ver === 'partial' ? 'h' : 'v']++; });
    const order = (A().S.meta.circles || []).map(c => c.circle);
    const cRows = Object.entries(byC).sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99));
    const maxT = Math.max(1, ...cRows.map(r => r[1].t));
    const circleChart = cRows.map(([c, x]) => `<button class="hrow${D.f.circle === c ? ' on' : ''}" data-circle="${esc(c)}" title="${esc(c)}: ${x.v} all verified, ${x.h} posting verified, ${x.p} awaiting, ${x.u} not verified">
      <span class="hl">${esc(c)}</span><span class="hb"><span class="stack" style="width:${Math.max(4, x.t * 100 / maxT)}%">
        <i class="sv" style="flex:${x.v}"></i><i class="sh" style="flex:${x.h}"></i><i class="sp" style="flex:${x.p}"></i><i class="su" style="flex:${x.u}"></i></span></span>
      <span class="hn num">${pct(x.v, x.t)}%<small> · ${x.t}</small></span></button>`).join('') || '<p class="faint">No officers.</p>';
    // 2. tenure bands
    const vb = view('band'), bc = BANDS.map(b => vb.filter(o => inBand(o.x[D.f.basis], b[2])).length), unk = vb.filter(o => o.x[D.f.basis] == null).length, maxB = Math.max(1, ...bc);
    const tenureChart = `<div class="cols">${BANDS.map((b, i) => `<button class="col${D.f.band === b[2] ? ' on' : ''}${b[0] >= D.limit ? ' over' : ''}" data-band="${b[2]}" title="${bc[i]} officers">
        <span class="cn num">${bc[i]}</span><span class="cb"><i style="height:${Math.max(2, bc[i] * 100 / maxB)}%"></i></span><span class="cl">${b[2]}</span></button>`).join('')}</div>
      <p class="faint ctr">Years in present ${BASIS[D.f.basis].toLowerCase()}${unk ? ` · ${unk} without a date` : ''} · bands at or above ${D.limit} yrs in orange</p>`;
    // 3. home district donut
    const vh = view('home'), hc = { yes: 0, no: 0, unknown: 0 }; vh.forEach(o => hc[o.x.home]++);
    const tot = Math.max(1, vh.length), R = 42, C = 2 * Math.PI * R; let off = 0;
    const seg = (k, col) => { const len = hc[k] / tot * C, s = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${col}" stroke-width="16" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" class="dseg${D.f.home === k ? ' on' : ''}" data-home="${k}"><title>${HOME[k]}: ${hc[k]}</title></circle>`; off += len; return s; };
    const donut = `<div class="donut"><svg viewBox="0 0 120 120" role="img" aria-label="Posted in home district">
        <g transform="rotate(-90 60 60)">${seg('yes', '#c4320a')}${seg('no', '#2f9e44')}${seg('unknown', '#d6d4cf')}</g>
        <text x="60" y="57" text-anchor="middle" class="dbig">${pct(hc.yes, vh.length)}%</text><text x="60" y="73" text-anchor="middle" class="dsm">in home district</text></svg>
      <div class="dleg">${[['yes', '#c4320a'], ['no', '#2f9e44'], ['unknown', '#d6d4cf']].map(([k, col]) => `<button class="lg${D.f.home === k ? ' on' : ''}" data-home="${k}"><i style="background:${col}"></i>${HOME[k]}<b class="num">${n(hc[k])}</b></button>`).join('')}</div></div>`;
    // 4. divisions needing attention
    const byD = {}; view('division').forEach(o => { const k = o.data.Circle + '|' + o.data.Division, x = byD[k] = byD[k] || { c: o.data.Circle, d: o.data.Division, u: 0, h: 0, t: 0 }; x.t++; if (o.x.ver === 'unverified') x.u++; if (o.x.home === 'yes') x.h++; });
    const top = Object.values(byD).sort((a, b) => (b.u + b.h * 2) - (a.u + a.h * 2)).filter(x => x.u || x.h).slice(0, 8), maxA = Math.max(1, ...top.map(x => x.t));
    const attention = top.map(x => `<button class="arow${D.f.division === x.d ? ' on' : ''}" data-c="${esc(x.c)}" data-d="${esc(x.d)}">
        <span class="al"><b>${esc(x.d)}</b><small>${esc(x.c)}</small></span>
        <span class="ab"><i class="au" style="width:${x.u * 100 / maxA}%"></i><i class="ah" style="width:${x.h * 100 / maxA}%"></i></span>
        <span class="an num">${x.u} <small>not verified</small> · ${x.h} <small>home</small></span></button>`).join('') || '<p class="faint">Nothing needs attention in this view.</p>';
    $('#charts').innerHTML = `
      <div class="chart"><h3>Verification by circle</h3><div class="legend-s"><span class="lv">All verified</span><span class="lh2">Posting only</span><span class="lp">Awaiting</span><span class="lu">Not verified</span></div>${circleChart}</div>
      <div class="chart"><h3>Tenure</h3>${tenureChart}</div>
      <div class="chart"><h3>Posted in home district</h3>${donut}</div>
      <div class="chart"><h3>Divisions needing attention</h3><div class="legend-s"><span class="lu2">Not verified</span><span class="lh">Home district</span></div>${attention}</div>`;
    const ch = $('#charts');
    ch.querySelectorAll('[data-circle]').forEach(b => b.onclick = () => setF({ circle: D.f.circle === b.dataset.circle ? '' : b.dataset.circle, division: '' }));
    ch.querySelectorAll('[data-band]').forEach(b => b.onclick = () => setF({ band: D.f.band === b.dataset.band ? '' : b.dataset.band, min: '' }));
    ch.querySelectorAll('[data-home]').forEach(b => b.addEventListener('click', () => setF({ home: D.f.home === b.dataset.home ? '' : b.dataset.home })));
    ch.querySelectorAll('[data-d]').forEach(b => b.onclick = () => setF(D.f.division === b.dataset.d ? { division: '' } : { circle: b.dataset.c, division: b.dataset.d }));
  }

  function filterLabels() {
    const f = D.f, out = [];
    if (f.q) out.push(['q', `Search: “${f.q}”`]);
    if (f.circle) out.push(['circle', `Circle: ${f.circle}`]);
    if (f.division) out.push(['division', `Division: ${f.division}`]);
    if (f.ver) out.push(['ver', `Verification: ${f.ver === 'anyverified' ? 'All verified (any)' : f.ver === 'anyposting' ? 'Posting verified (incl. all)' : VER[f.ver]}`]);
    if (f.home) out.push(['home', `Home district: ${HOME[f.home]}`]);
    if (f.band) out.push(['band', `${BASIS[f.basis]} tenure: ${f.band} yrs`]);
    if (f.min !== '') out.push(['min', `${BASIS[f.basis]} tenure ≥ ${f.min} yrs`]);
    if (f.match) out.push(['match', `Posting list: ${f.match}`]);
    if (f.desig) out.push(['desig', `Designation: ${f.desig}`]);
    if (f.retire) out.push(['retire', `Retiring within ${f.retire} yr${f.retire === '1' ? '' : 's'}`]);
    if (f.missing) out.push(['missing', `Missing: ${{ home: 'home district', rdist: 'district of range', range: 'present range' }[f.missing]}`]);
    return out;
  }
  function chips() {
    const l = filterLabels(), v = view().length;
    $('#chips').innerHTML = `<span class="count"><b class="num">${n(v)}</b> of ${n(all().length)} officers</span>
      ${l.map(([k, t]) => `<button class="fchip" data-k="${k}">${A().esc(t)} <span aria-hidden="true">×</span></button>`).join('')}
      ${l.length ? '<button class="btn sm ghost" id="clearF">Clear all</button>' : '<span class="faint">No filters. Click a card, bar or chart to filter.</span>'}`;
    $('#chips').querySelectorAll('.fchip').forEach(b => b.onclick = () => setF({ [b.dataset.k]: EMPTY[b.dataset.k], ...(b.dataset.k === 'circle' ? { division: '' } : {}) }));
    const c = $('#clearF'); if (c) c.onclick = () => setF(Object.assign({}, EMPTY, { basis: D.f.basis }));
  }

  /* ---------------- table ---------------- */
  const COLS = [
    ['name', 'Officer', o => o.x.name], ['desig', 'Desig.', o => o.data.Designation], ['circle', 'Circle / division', o => o.data.Circle + ' ' + o.data.Division],
    ['range', 'Range / beat', o => (o.data['Present Range / Office'] || '') + (o.data['Present Beat'] || '')],
    ['rdist', 'Range district', o => o.data['District in which Range lies'] || ''], ['hdist', 'Home district', o => o.data['Home District'] || ''],
    ['posting', 'Yrs range / beat', o => o.x.posting], ['division', 'Yrs division', o => o.x.division], ['circleY', 'Yrs circle', o => o.x.circle],
    ['ver', 'Verification', o => ({ verified: 1, corrected: 2, partial: 3, pending: 4, unverified: 5 })[o.x.ver]], ['match', 'Posting list', o => o.data['Posting List Match'] || ''],
  ];
  function sorted(list) {
    const c = COLS.find(x => x[0] === D.sort.k) || COLS[2], dir = D.sort.dir;
    return list.slice().sort((a, b) => {
      let x = c[2](a), y = c[2](b);
      if (x == null) return 1; if (y == null) return -1;
      if (typeof x === 'number') return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }
  const yr = (y, warn) => y == null ? '<span class="faint">—</span>' : `<span class="num${warn && y >= D.limit ? ' over' : ''}">${y.toFixed(1)}</span>`;
  function table(flashKey) {
    const esc = A().esc, list = sorted(view()), rows = list.slice(0, D.shown);
    if (!list.length) { $('#tbl').innerHTML = '<div class="empty-state"><b>No officers match these filters.</b>Remove a filter above to see more.</div>'; return; }
    const th = COLS.map(([k, l]) => `<th data-k="${k}" class="${['posting', 'division', 'circleY'].includes(k) ? 'r ' : ''}${D.sort.k === k ? 'sorted' : ''}">${l}${D.sort.k === k ? (D.sort.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('');
    $('#tbl').innerHTML = `<div class="tscroll"><table class="dtable"><thead><tr>${th}</tr></thead><tbody>${rows.map(o => {
      const d = o.data, x = o.x, k = o.cadre + '|' + o.id, same = x.home === 'yes';
      return `<tr data-k="${esc(k)}" tabindex="0">
        <td><div class="tn">${esc(x.name)}${isFull(x.ver) ? A().TICK : x.ver === 'partial' ? A().TICK_P : ''}</div><div class="faint num">${esc(o.id)}</div></td>
        <td><span class="tag">${esc(d.Designation || o.cadre)}</span></td>
        <td>${esc(d.Circle)}<div class="faint">${esc(d.Division)}</div></td>
        <td>${esc(d['Present Range / Office']) || '<span class="faint">—</span>'}${d['Present Beat'] ? `<div class="faint">${esc(d['Present Beat'])}</div>` : ''}</td>
        <td>${same ? `<span class="hd">${esc(d['District in which Range lies'])}</span>` : esc(d['District in which Range lies']) || '<span class="faint">—</span>'}</td>
        <td>${same ? `<span class="hd">${esc(d['Home District'])}</span>` : esc(d['Home District']) || '<span class="faint">—</span>'}</td>
        <td class="r">${yr(x.posting, true)}</td><td class="r">${yr(x.division)}</td><td class="r">${yr(x.circle)}</td>
        <td><span class="pill ${x.ver === 'corrected' ? 'verified' : x.ver}">${VER[x.ver]}</span>${(isFull(x.ver) || x.ver === 'partial') && d['Last Updated By'] ? `<div class="faint vby">${esc(d['Last Updated By'].split(' · ')[0].replace(/\s*\(.*\)$/, ''))}${d['Last Updated On'] ? ' · ' + esc(d['Last Updated On'].slice(0, 10)) : ''}</div>` : ''}</td>
        <td class="${d['Posting List Match'] === 'Not present in posting list' ? 'nip' : ''}">${esc(d['Posting List Match'] || '')}</td></tr>`;
    }).join('')}</tbody></table></div>
      <div class="tfoot"><span class="faint">Showing ${n(rows.length)} of ${n(list.length)} · click a row to open the profile · exports include every matching row</span>
        ${list.length > rows.length ? `<button class="btn sm" id="more">Show ${n(Math.min(200, list.length - rows.length))} more</button>` : ''}</div>`;
    $('#tbl').querySelectorAll('th').forEach(h => h.onclick = () => { D.sort = { k: h.dataset.k, dir: D.sort.k === h.dataset.k ? -D.sort.dir : 1 }; table(); });
    $('#tbl').querySelectorAll('tbody tr').forEach(r => { r.onclick = () => open(r.dataset.k); r.onkeydown = e => { if (e.key === 'Enter') open(r.dataset.k); }; });
    const m = $('#more'); if (m) m.onclick = () => { D.shown += 200; table(); };
    if (flashKey) { const r = $('#tbl').querySelector(`tr[data-k="${CSS.escape(flashKey)}"]`); if (r) { r.classList.add('flash'); r.scrollIntoView({ block: 'center' }); } }
  }

  /* ---------------- profile from the dashboard ---------------- */
  function open(k) {
    const data = D.data[D.cadre];
    A().S.div = { circle: null, division: null, officers: data.officers, schema: data.schema, after: key => {
      const o = data.officers.find(x => x.cadre + '|' + x.id === key); if (o) derive(o);
      drawTabs(); kpis(); charts(); chips(); table(key);
    } };
    A().openProfile(k);
  }

  /* ---------------- exports ---------------- */
  const stampFile = () => { const d = new Date(), p = x => String(x).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`; };
  const fname = ext => `UPMC2_${D.cadre}_${(D.f.division || D.f.circle || 'all').replace(/[^A-Za-z0-9]+/g, '_')}_${stampFile()}.${ext}`;
  function csv() {
    const list = sorted(view()); if (!list.length) return A().toast('Nothing to export.', true);
    const fields = D.data[D.cadre].schema[D.cadre].map(f => f.name);
    const head = [...fields, 'Years in range/beat', 'Years in division', 'Years in circle', 'Posted in home district', 'Verification status'];
    const q = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [head.map(q).join(',')].concat(list.map(o => [...fields.map(f => o.data[f]), o.x.posting == null ? '' : o.x.posting.toFixed(1),
      o.x.division == null ? '' : o.x.division.toFixed(1), o.x.circle == null ? '' : o.x.circle.toFixed(1), HOME[o.x.home], VER[o.x.ver]].map(q).join(',')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname('csv'); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    A().toast(`Downloaded ${list.length} officers as CSV.`);
  }
  async function pdfReport() {
    if (!window.pdfMake) return A().toast('The PDF tool is still loading. Try again in a moment.', true);
    const list = sorted(view()); if (!list.length) return A().toast('Nothing to export.', true);
    const b = A().busy(`Preparing the report (${list.length} officers)…`, false, 'pdf');
    try {
      const c = { verified: 0, partial: 0, pending: 0, unverified: 0 }; let home = 0, over = 0;
      list.forEach(o => { c[o.x.ver === 'corrected' ? 'verified' : o.x.ver]++; if (o.x.home === 'yes') home++; if (o.x.posting != null && o.x.posting >= D.limit) over++; });
      const f1 = y => y == null ? '' : y.toFixed(1);
      const name = await PDF.report({
        title: CADRES.find(x => x[0] === D.cadre)[1] + ' · posting register',
        subtitle: `Data as of ${D.data[D.cadre].builtAt} · ${list.length} officers`,
        filters: filterLabels().map(x => x[1]).join('  ·  ') || 'none (whole cadre)',
        kpis: [['Officers', list.length], ['All verified', c.verified, '#1d6b31'], ['Posting verified only', c.partial, '#1f4f9e'], ['Awaiting approval', c.pending, '#51308f'], ['Not verified', c.unverified, '#6b6a66'],
          ['In home district', home, '#c4320a'], [`Over ${D.limit} yrs in range/beat`, over, '#8a4510']],
        columns: [{ label: '#', w: 16, num: true }, { label: 'Officer', w: 88, bold: true }, { label: 'HRMS ID', w: 54 }, { label: 'Desig.', w: 28 },
          { label: 'Circle', w: 48 }, { label: 'Division', w: 60 }, { label: 'Range / beat', w: '*' }, { label: 'Range district', w: 54 }, { label: 'Home district', w: 54 },
          { label: 'Yrs range', w: 26, num: true, warn: r => Number(r[9]) >= D.limit }, { label: 'Yrs div.', w: 24, num: true }, { label: 'Yrs circle', w: 26, num: true }, { label: 'Verification', w: 52 }],
        rows: list.map((o, i) => [i + 1, o.x.name, o.id, o.data.Designation || o.cadre, o.data.Circle, o.data.Division,
          [o.data['Present Range / Office'], o.data['Present Beat']].filter(Boolean).join(' / '), o.data['District in which Range lies'], o.data['Home District'],
          f1(o.x.posting), f1(o.x.division), f1(o.x.circle), VER[o.x.ver]]),
        fileName: fname('pdf'),
      });
      A().toast('Downloaded ' + name);
    } catch (e) { A().toast('Could not make the PDF: ' + e.message, true); } finally { b.done(); }
  }
  async function sheets() {
    if (!window.pdfMake) return A().toast('The PDF tool is still loading. Try again in a moment.', true);
    const list = sorted(view()); if (!list.length) return A().toast('Nothing to export.', true);
    if (list.length > 150 && !confirm(`This makes ${list.length} pages and can take a minute. Continue?`)) return;
    const b = A().busy(`Preparing ${list.length} information sheets…`, true);
    try {
      const label = filterLabels().map(x => x[1]).join(' · ') || 'Whole cadre';
      const name = await PDF.division(list, D.data[D.cadre].schema, '', '', b.set, {
        kicker: 'Officer information sheets', title: CADRES.find(x => x[0] === D.cadre)[1],
        subtitle: `${label}  ·  ${list.length} officers`, footer: 'UPMC2 · ' + CADRES.find(x => x[0] === D.cadre)[1], fileName: fname('pdf').replace('.pdf', '_sheets.pdf') });
      A().toast('Downloaded ' + name);
    } catch (e) { A().toast('Could not make the PDF: ' + e.message, true); } finally { b.done(); }
  }
  async function refresh() {
    const b = A().busy('Reading the Google Sheet again… this can take up to a minute.', false, 'admin');
    try { await A().guard(() => API.call('adminRefresh')); D.data = {}; A().S.meta.stale = true; await A().ensureMeta(); await load(D.cadre); drawTabs(); drawBody();
      CADRES.forEach(([c]) => { if (c !== D.cadre) load(c, true).catch(() => {}); }); A().toast('Data refreshed.'); }
    catch (e) {} finally { b.done(); }
  }

  window.UPMC_DASH = { render };
})();
