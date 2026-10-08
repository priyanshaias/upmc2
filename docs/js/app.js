// UPMC2 — screens and interactions.
(function () {
  const API = window.UPMC_API, FL = window.UPMC_FIELDS, PDF = window.UPMC_PDF;
  const $ = s => document.querySelector(s);
  const app = $('#app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = {
    check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 21h16"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 18 9 12l6-6"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg>',
  };
  const S = { meta: null, div: null, filter: 'all', cadre: 'all', q: '', open: null, editSecs: new Set(), edits: {} };
  const STATUS_TXT = { verified: 'Verified', pending: 'Awaiting approval', unverified: 'Not verified' };

  /* ---------------- small helpers ---------------- */
  function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'toast on' + (err ? ' err' : ''); clearTimeout(t._t); t._t = setTimeout(() => t.className = 'toast', 3800); }
  /* ---------- loading animation: a tree that draws itself, a moving bar, rotating messages and tips ---------- */
  const TREE = `<svg class="tree" viewBox="0 0 64 64" aria-hidden="true">
    <path class="canopy" d="M32 7c-8 0-14 6-14 13.5 0 1.6.3 3 .8 4.4C14.2 27 11 31.3 11 36.5 11 43.4 16.8 49 24 49h16c7.2 0 13-5.6 13-12.5 0-5.2-3.2-9.5-7.8-11.6.5-1.4.8-2.8.8-4.4C46 13 40 7 32 7Z"/>
    <path class="trunk" d="M32 57V30M32 42l-7-6M32 37l6-5"/>
    <path class="ground" d="M17 57h30"/></svg>`;
  const TIPS = [
    'Tip: the “Posting and home district” box is the most important part. Check it first.',
    'Tip: the download icon on each card gives that officer’s information sheet as a PDF.',
    'Tip: use the “Not verified” filter to see who is left in your division.',
    'Tip: changes you make go to the administrator for approval before they count.',
    'Tip: a blue tick next to a name means the officer is verified.',
  ];
  const STEPS = {
    circles: ['Opening the PMC register…', 'Counting officers in every circle…', 'Checking what has been verified…', 'Almost there…'],
    division: ['Fetching the officers…', 'Reading posting details…', 'Arranging cards by cadre…', 'Almost there…'],
    save: ['Saving…', 'Writing to the register…', 'Almost done…'],
    pdf: ['Preparing the information sheets…', 'Laying out each page…', 'Adding the emblem and signatures…'],
    admin: ['Collecting changes sent by divisions…', 'Comparing with the register…', 'Almost there…'],
  };
  function loaderHtml(kind, title) {
    return `<div class="loader" data-kind="${kind}">${TREE}
      <b class="ld-title">${esc(title || STEPS[kind][0])}</b>
      <div class="ibar"><i></i></div>
      <p class="ld-step">${esc(STEPS[kind][1] || '')}</p>
      <p class="ld-tip">${esc(TIPS[Math.floor(Math.random() * TIPS.length)])}</p>
      <p class="ld-slow faint"></p></div>`;
  }
  /** Rotates the messages of every .loader on screen; stops by itself when the loader is gone. */
  function animateLoader(root) {
    const el = root.querySelector('.loader'); if (!el) return;
    const steps = STEPS[el.dataset.kind] || STEPS.division, t0 = Date.now();
    let i = 1, tip = Math.floor(Math.random() * TIPS.length);
    const timer = setInterval(() => {
      if (!document.body.contains(el)) return clearInterval(timer);
      const secs = (Date.now() - t0) / 1000;
      const st = el.querySelector('.ld-step');
      if (i < steps.length - 1 || secs > 9) { i = Math.min(i + 1, steps.length - 1); swapText(st, steps[i]); }
      if (Math.round(secs) % 6 === 0) { tip = (tip + 1) % TIPS.length; swapText(el.querySelector('.ld-tip'), TIPS[tip]); }
      if (secs > 8) el.querySelector('.ld-slow').textContent = 'The first load of the day can take up to 20 seconds. Thank you for waiting.';
    }, 2600);
  }
  function swapText(node, text) {
    if (!node || node.textContent === text) return;
    node.classList.add('out');
    setTimeout(() => { node.textContent = text; node.classList.remove('out'); }, 220);
  }
  function busy(text, withBar, kind) {
    const el = document.createElement('div'); el.className = 'busy';
    el.innerHTML = `<div class="box">${loaderHtml(kind || (withBar ? 'pdf' : 'save'), text)}${withBar ? '<div class="track"><i></i></div>' : ''}</div>`;
    document.body.appendChild(el);
    animateLoader(el);
    return { set: p => { const i = el.querySelector('.track i'); if (i) i.style.width = Math.round(p * 100) + '%'; }, done: () => el.remove() };
  }
  function op() { try { return JSON.parse(localStorage.getItem('upmc_operator') || 'null'); } catch (e) { return null; } }
  function go(h) { location.hash = h; }
  async function guard(fn) {
    try { return await fn(); }
    catch (e) { if (e.auth) { toast(e.message, true); go('#/'); render(); } else toast(e.message || 'Something went wrong.', true); throw e; }
  }
  const toISO = s => { const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
  const fromISO = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
  const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;

  /* ---------------- header ---------------- */
  function renderWho() {
    const u = API.user;
    $('#demoFlag').classList.toggle('hidden', !API.DEMO);
    if (!u) { $('#who').innerHTML = ''; return; }
    const o = op();
    const admin = S.meta && S.meta.user && S.meta.user.isAdmin;
    $('#who').innerHTML = `${admin ? '<a class="btn sm ghost hide-sm" href="#/admin">Approvals</a>' : ''}
      <button class="menu-btn" id="menuBtn" aria-haspopup="true" aria-expanded="false" title="${esc(u.email)}">
        <span class="av">${esc(FL.initials(o && o.name || u.name))}</span><span class="hide-sm">${esc(o && o.name || u.name)}</span><span aria-hidden="true">▾</span></button>
      <div class="menu hidden" id="menu" role="menu">
        <div class="menu-who"><b>${esc(o && o.name || u.name)}</b><span>${esc(u.email)}</span></div>
        ${admin ? '<a role="menuitem" href="#/admin">Approvals</a>' : ''}
        <a role="menuitem" href="#/circles">All circles</a>
        <button role="menuitem" id="meBtn">My details</button>
        <button role="menuitem" id="outBtn">Sign out</button>
      </div>`;
    const menu = $('#menu'), mb = $('#menuBtn');
    mb.onclick = e => { e.stopPropagation(); const open = menu.classList.toggle('hidden') === false; mb.setAttribute('aria-expanded', open); };
    menu.querySelectorAll('a').forEach(a => a.onclick = () => menu.classList.add('hidden'));
    $('#outBtn').onclick = () => { API.signOut(); S.meta = null; go('#/'); render(); };
    $('#meBtn').onclick = () => { menu.classList.add('hidden'); renderOperator(true); };
  }

  document.addEventListener('click', e => {
    const m = $('#menu'); if (m && !e.target.closest('#menu')) { m.classList.add('hidden'); const b = $('#menuBtn'); b && b.setAttribute('aria-expanded', 'false'); }
  });

  /* ---------------- sign in & operator details ---------------- */
  function renderSignin() {
    app.innerHTML = `<section class="signin"><div class="card">
      <img class="emb" src="assets/emblem.svg" alt="National Emblem of India">
      <h1>Officer data verification</h1>
      <p class="muted">Directorate of Forests, West Bengal. Sign in to check and update the details of officers in your division.</p>
      ${API.DEMO ? `<button class="btn primary" id="demoBtn" style="width:100%">Try with demo data</button>
        <p class="faint" style="margin:12px 0 0">This copy is not connected to the live sheet. All names and numbers are made up.</p>`
        : `<form class="form" id="pwForm" autocomplete="on">
            <label>Username<input name="username" autocomplete="username" autocapitalize="none" required></label>
            <label>Password<span class="pw"><input name="password" type="password" autocomplete="current-password" required>
              <button type="button" class="btn sm ghost" id="showPw" aria-label="Show password">Show</button></span></label>
            <button class="btn primary" type="submit" id="pwBtn">Sign in</button>
            <div id="pwMsg" class="faint" role="alert"></div>
          </form>`}
    </div></section>`;
    if (API.DEMO) { $('#demoBtn').onclick = () => { API.demoSignIn(); start(); }; return; }
    $('#showPw').onclick = () => { const i = $('#pwForm').password; i.type = i.type === 'password' ? 'text' : 'password'; $('#showPw').textContent = i.type === 'password' ? 'Show' : 'Hide'; };
    $('#pwForm').onsubmit = async e => {
      e.preventDefault();
      const f = e.target, btn = $('#pwBtn');
      btn.disabled = true; btn.textContent = 'Signing in…'; $('#pwMsg').textContent = '';
      try { await API.passwordSignIn(f.username.value.trim(), f.password.value); start(); }
      catch (err) { $('#pwMsg').textContent = err.message; $('#pwMsg').style.color = 'var(--danger-ink)'; btn.disabled = false; btn.textContent = 'Sign in'; }
    };
  }

  function renderOperator(editing) {
    const o = op() || {}, u = API.user || {};
    app.innerHTML = `<section class="signin"><div class="card" style="text-align:left">
      <h1 style="font-size:26px">${editing ? 'Your details' : 'One more step'}</h1>
      <p class="muted" style="margin-bottom:0">These appear as “Verified by” on the information sheets you verify.</p>
      <form class="form" id="opForm">
        <label>Your name<input name="name" required value="${esc(o.name || u.name || '')}"></label>
        <label>Designation and office<input name="designation" required placeholder="e.g. Data entry operator, Kurseong Division" value="${esc(o.designation || '')}"></label>
        <label>Mobile number (optional)<input name="mobile" inputmode="numeric" maxlength="10" value="${esc(o.mobile || '')}"></label>
        <button class="btn primary" type="submit">Save and continue</button>
      </form></div></section>`;
    $('#opForm').onsubmit = e => {
      e.preventDefault();
      const f = new FormData(e.target), d = { name: f.get('name').trim(), designation: f.get('designation').trim(), mobile: f.get('mobile').trim() };
      if (d.mobile && !/^\d{10}$/.test(d.mobile)) { toast('Mobile number should have 10 digits.', true); return; }
      localStorage.setItem('upmc_operator', JSON.stringify(d));
      renderWho(); route();
    };
  }

  async function start() {
    if (!op()) { renderWho(); renderOperator(false); return; }
    if (!location.hash || location.hash === '#/') go('#/circles'); else route();
  }

  async function ensureMeta(force) {
    if (S.meta && !force) return S.meta;
    S.meta = await guard(() => API.call('meta'));
    if (S.meta.user) API.setAdmin(!!S.meta.user.isAdmin);
    renderWho();
    return S.meta;
  }

  /* ---------------- circles & divisions ---------------- */
  function countFor(circle, division) {
    const c = S.meta.counts || {}, keys = division ? [circle + '|' + division] : Object.keys(c).filter(k => k.startsWith(circle + '|'));
    return keys.reduce((a, k) => { const x = c[k] || {}; a.total += x.total || 0; a.verified += x.verified || 0; a.pending += x.pending || 0; return a; }, { total: 0, verified: 0, pending: 0 });
  }
  function tile(title, sub, c, href, i) {
    const p = pct(c.verified, c.total);
    return `<a class="tile${c.total ? '' : ' empty'}" href="${href}" style="animation-delay:${Math.min(i, 20) * 30}ms;text-decoration:none">
      <div class="ring" style="--p:${p}"><i>${p}%</i></div>
      <div class="t"><b>${esc(title)}</b><span>${esc(sub)}</span><br><span class="num">${c.total} officers · ${c.verified} verified</span></div></a>`;
  }
  async function renderCircles() {
    app.innerHTML = `<div class="head"><div><h1 class="page-title">Choose your circle.</h1><p class="page-sub">Then pick your division to see its officers.</p></div></div>
      ${S.meta ? '' : loaderHtml('circles')}<div class="tiles">${'<div class="skeleton"></div>'.repeat(8)}</div>`;
    animateLoader(app);
    const m = await ensureMeta();
    const ld = app.querySelector('.loader'); if (ld) ld.remove();
    app.querySelector('.tiles').innerHTML = m.circles.map((c, i) => tile(c.circle, c.office, countFor(c.circle), `#/c/${encodeURIComponent(c.circle)}`, i)).join('');
  }
  async function renderDivisions(circle) {
    if (!S.meta) { app.innerHTML = loaderHtml('circles') + `<div class="tiles">${'<div class="skeleton"></div>'.repeat(6)}</div>`; animateLoader(app); }
    const m = await ensureMeta();
    const c = m.circles.find(x => x.circle === circle);
    if (!c) { go('#/circles'); return; }
    app.innerHTML = `<div class="crumbs"><a href="#/circles">All circles</a><span class="sep">/</span><span>${esc(circle)}</span></div>
      <div class="head"><div><h1 class="page-title">${esc(circle)} circle.</h1><p class="page-sub">Choose your division.</p></div></div>
      <div class="tiles">${c.divisions.map((d, i) => tile(d, 'Division', countFor(circle, d), `#/d/${encodeURIComponent(circle)}/${encodeURIComponent(d)}`, i)).join('')}</div>`;
  }

  /* ---------------- division: officer cards ---------------- */
  const FILTERS = [
    ['all', 'All', () => true], ['unverified', 'Not verified', o => o.status === 'unverified'], ['verified', 'Verified', o => o.status === 'verified'],
    ['pending', 'Awaiting approval', o => o.status === 'pending'], ['attn', 'Needs attention', o => FL.needsAttention(o.data)],
  ];
  const CADRE_TXT = { FR: 'Forest Rangers', DFR: 'Deputy Rangers / Foresters', FG: 'Forest Guards & HFG' };

  async function renderDivision(circle, division) {
    app.innerHTML = `<div class="crumbs"><a href="#/circles">All circles</a><span class="sep">/</span><a href="#/c/${encodeURIComponent(circle)}">${esc(circle)}</a><span class="sep">/</span><span>${esc(division)}</span></div>
      <div class="head"><div><h1 class="page-title">${esc(division)}</h1><p class="page-sub">${esc(circle)} circle. Open each officer, check the details and verify.</p></div></div>
      ${loaderHtml('division', `Fetching the officers of ${division}…`)}
      <div class="cards">${'<div class="skeleton"></div>'.repeat(9)}</div>`;
    animateLoader(app);
    await ensureMeta();
    const d = await guard(() => API.call('division', { circle, division }));
    S.div = { circle, division, officers: d.officers, schema: d.schema };
    S.filter = 'all'; S.cadre = 'all'; S.q = '';
    drawDivision();
  }

  function drawDivision(flashId) {
    const D = S.div, list = D.officers;
    const n = { verified: 0, pending: 0, unverified: 0 }; list.forEach(o => n[o.status]++);
    const cadres = ['FR', 'DFR', 'FG'].filter(c => list.some(o => o.cadre === c));
    app.innerHTML = `<div class="crumbs"><a href="#/circles">All circles</a><span class="sep">/</span><a href="#/c/${encodeURIComponent(D.circle)}">${esc(D.circle)}</a><span class="sep">/</span><span>${esc(D.division)}</span></div>
      <div class="head"><div><h1 class="page-title">${esc(D.division)}</h1><p class="page-sub">${esc(D.circle)} circle · ${list.length} officers. Open each card, check the details and verify.</p></div>
        <span class="sp"></span><button class="btn soft" id="allPdf" ${list.length ? '' : 'disabled'}>${icon.down} Download all PDFs</button></div>
      <div class="progress"><div><div class="big">${n.verified} of ${list.length}</div><div class="faint">verified</div></div>
        <div class="bar"><i class="v" style="width:${pct(n.verified, list.length)}%"></i><i class="p" style="width:${pct(n.pending, list.length)}%"></i></div>
        <div class="legend"><span style="--c:var(--prelims)">Verified ${n.verified}</span><span style="--c:var(--interview)">Awaiting approval ${n.pending}</span><span style="--c:var(--border-strong)">Not verified ${n.unverified}</span></div></div>
      <div class="toolbar">
        <div class="chips" id="fchips">${FILTERS.map(([k, l, f]) => `<button class="chip${S.filter === k ? ' on' : ''}" data-f="${k}">${l}<span class="n">${list.filter(f).length}</span></button>`).join('')}</div>
        ${cadres.length > 1 ? `<div class="chips" id="cchips"><button class="chip${S.cadre === 'all' ? ' on' : ''}" data-c="all">All cadres</button>${cadres.map(c => `<button class="chip${S.cadre === c ? ' on' : ''}" data-c="${c}">${c === 'FG' ? 'FG / HFG' : c}</button>`).join('')}</div>` : ''}
        <label class="search">${icon.search}<input id="q" placeholder="Search name or HRMS ID" value="${esc(S.q)}"></label>
      </div>
      <div id="groups"></div>`;
    drawCards(flashId);
    $('#allPdf').onclick = downloadAll;
    app.querySelectorAll('#fchips .chip').forEach(b => b.onclick = () => { S.filter = b.dataset.f; drawDivision(); });
    app.querySelectorAll('#cchips .chip').forEach(b => b.onclick = () => { S.cadre = b.dataset.c; drawDivision(); });
    $('#q').oninput = e => { S.q = e.target.value; drawCards(); };
  }

  function visible() {
    const f = FILTERS.find(x => x[0] === S.filter)[2], q = S.q.trim().toLowerCase();
    return S.div.officers.filter(o => f(o) && (S.cadre === 'all' || o.cadre === S.cadre) &&
      (!q || String(o.data.Name).toLowerCase().includes(q) || String(o.id).includes(q)));
  }

  // Instagram/Twitter-style verified badge
  const TICK = '<svg class="tick" viewBox="0 0 24 24" aria-label="Verified" role="img"><path fill="currentColor" d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484z"/><path fill="#fff" d="M10.6 16.3 6.9 12.6l1.4-1.4 2.3 2.3 5.1-5.1 1.4 1.4z"/></svg>';

  function card(o, i) {
    const d = o.data, attn = FL.needsAttention(d) && o.status !== 'verified';
    const rng = d['Present Range / Office'] || '', beat = d['Present Beat'] ? ' · ' + d['Present Beat'] : '';
    const k = esc(o.cadre + '|' + o.id);
    return `<div class="ocard" role="button" tabindex="0" data-k="${k}" style="animation-delay:${Math.min(i, 24) * 25}ms" aria-label="Open ${esc(FL.cleanName(d.Name))}">
      <button class="dl" data-dl="${k}" title="Download information sheet (PDF)" aria-label="Download PDF of ${esc(FL.cleanName(d.Name))}">${icon.down}</button>
      <div class="top"><div class="initials ${o.cadre}">${esc(FL.initials(d.Name))}</div>
        <div><div class="nm">${esc(FL.cleanName(d.Name))}${o.status === 'verified' ? TICK : ''}</div><div class="id">HRMS ${esc(o.id)}</div></div></div>
      <div class="meta"><span class="tag">${esc(d.Designation || o.cadre)}</span> ${esc(rng + beat) || '<span class="faint">Range not recorded</span>'}</div>
      <div class="foot"><span class="pill ${o.status}">${STATUS_TXT[o.status]}</span>${attn ? '<span class="pill attn">Needs attention</span>' : ''}</div>
    </div>`;
  }

  function drawCards(flashId) {
    const vis = visible();
    if (!vis.length) { $('#groups').innerHTML = `<div class="empty-state"><b>No officers here.</b>${S.div.officers.length ? 'Try another filter.' : 'No officers are recorded for this division.'}</div>`; return; }
    let i = 0;
    $('#groups').innerHTML = ['FR', 'DFR', 'FG'].map(c => {
      const g = vis.filter(o => o.cadre === c);
      return g.length ? `<div class="group-h"><h3>${CADRE_TXT[c]}</h3><span>${g.length}</span></div><div class="cards">${g.map(o => card(o, i++)).join('')}</div>` : '';
    }).join('');
    app.querySelectorAll('.ocard').forEach(b => {
      b.onclick = e => { if (!e.target.closest('.dl')) openProfile(b.dataset.k); };
      b.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === b) { e.preventDefault(); openProfile(b.dataset.k); } };
    });
    app.querySelectorAll('.ocard .dl').forEach(b => b.onclick = e => { e.stopPropagation(); pdfOne(findO(b.dataset.dl)); });
    if (flashId) {
      const el = app.querySelector(`.ocard[data-k="${CSS.escape(flashId)}"]`);
      if (el) { el.classList.add('flash'); }
      const nxt = vis.find(o => o.status === 'unverified' && o.cadre + '|' + o.id !== flashId);
      const nel = nxt && app.querySelector(`.ocard[data-k="${CSS.escape(nxt.cadre + '|' + nxt.id)}"]`);
      if (nel) { nel.classList.add('next'); nel.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => nel.classList.remove('next'), 4000); }
    }
  }

  /* ---------------- profile dialog ---------------- */
  const findO = k => S.div.officers.find(o => o.cadre + '|' + o.id === k);
  const editing = () => S.editSecs.size > 0;

  function openProfile(k) {
    if (S.open || $('#scrim')) return;
    S.open = k; S.editSecs = new Set(); S.edits = {};
    const el = document.createElement('div'); el.className = 'scrim'; el.id = 'scrim';
    el.innerHTML = '<div class="dialog" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(el); document.body.style.overflow = 'hidden';
    el.addEventListener('click', e => { if (e.target === el) closeProfile(); });
    drawProfile();
    requestAnimationFrame(() => el.classList.add('on'));
  }
  function closeProfile(force) {
    if (!force && Object.keys(S.edits).length && !confirm('You have changes that are not submitted. Close anyway?')) return;
    const el = $('#scrim'); if (!el) return;
    el.classList.remove('on'); document.body.style.overflow = '';
    setTimeout(() => el.remove(), 250);
    S.open = null; S.editSecs = new Set(); S.edits = {};
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.open) closeProfile(); });

  function valueHtml(o, f) {
    const v = S.edits.hasOwnProperty(f) ? S.edits[f] : o.data[f];
    const p = (o.pending || []).filter(x => x.field === f).slice(-1)[0];
    return `<div class="v${v ? '' : ' empty'}">${v ? esc(v) : 'Not recorded'}${p ? `<span class="pa">Awaiting approval: ${esc(p.value || '(blank)')}</span>` : ''}</div>`;
  }
  function inputHtml(o, f, type) {
    const cur = S.edits.hasOwnProperty(f) ? S.edits[f] : (o.data[f] || ''), m = S.meta;
    const opts = (list, blank) => (blank !== false ? `<option value="">${blank || 'Choose…'}</option>` : '') + list.map(x => `<option${x === cur ? ' selected' : ''}>${esc(x)}</option>`).join('');
    const a = `data-f="${esc(f)}" aria-label="${esc(FL.label(f))}"`;
    if (type === 'locked') return valueHtml(o, f);
    if (type === 'date') return `<input type="date" ${a} value="${toISO(cur)}">`;
    if (type === 'district') return `<select ${a}>${opts(m.districts)}</select>`;
    if (type === 'status') return `<select ${a}>${opts(m.status, 'Working (none of these)')}</select>`;
    if (type === 'designation') return `<select ${a}>${opts((m.cadres.find(c => c.code === o.cadre) || {}).designations || [], false)}</select>`;
    if (type === 'circle') return `<select ${a}>${opts(m.circles.map(c => c.circle), false)}</select>`;
    if (type === 'division') { const c = S.edits.Circle || o.data.Circle; return `<select ${a}>${opts((m.circles.find(x => x.circle === c) || {}).divisions || [])}</select>`; }
    if (type === 'longtext') return `<textarea ${a}>${esc(cur)}</textarea>`;
    return `<input ${a} value="${esc(cur)}">`;
  }

  function drawProfile() {
    const o = findO(S.open), d = o.data, schema = S.div.schema[o.cadre], types = {}; schema.forEach(f => types[f.name] = f.type);
    const t = FL.tenure(d), y = FL.fmtYears;
    const secs = FL.sections(schema);
    const attn = [];
    if (d['Posting List Match'] === 'Not present in posting list') attn.push('Not found in the posting list of 29.08.2026. Please confirm the present posting.');
    if (!d['Home District']) attn.push('Home district is not recorded.');
    if (!d['District in which Range lies']) attn.push('District of the present range is not recorded.');
    const nChanged = Object.keys(S.edits).length;
    const dlg = $('#scrim .dialog');
    const keepScroll = dlg.querySelector('.dbody') ? dlg.querySelector('.dbody').scrollTop : 0;
    const secHtml = s => {
      const on = S.editSecs.has(s.id), urgent = s.id === 'posting', canEdit = s.id !== 'reference';
      const rows = s.fields.map(f => `<div class="row${['Remarks', 'Posting List Remarks', 'Remarks in Gradation List'].includes(f) ? ' full' : ''}${S.edits.hasOwnProperty(f) ? ' chg' : ''}">
          <div class="k">${esc(FL.label(f))}</div>${on ? inputHtml(o, f, types[f]) : valueHtml(o, f)}</div>`).join('');
      return `<section class="sec${urgent ? ' urgent' : ''}${on ? ' editing' : ''}">
        <div class="sec-h"><h3>${esc(s.title)}</h3>${urgent ? '<span class="urgent-tag">Check first</span>' : ''}<span class="sp"></span>
          ${canEdit ? (on ? '<span class="editing-tag">Editing</span>' : `<button class="btn sm ghost sec-edit" data-sec="${s.id}">${icon.edit} Edit</button>`) : ''}</div>
        ${urgent ? `${!on && attn.length ? `<div class="notice attn">${attn.map(esc).join('<br>')}</div>` : ''}
          <div class="summary">
            <div><b>${y(t.posting)}</b><span>${t.postingLabel.toLowerCase()}</span></div>
            <div><b>${y(t.division)}</b><span>in present division</span></div>
            <div><b>${y(t.circle)}</b><span>in present circle</span></div>
            <div class="${t.home ? 'warn' : ''}"><b>${t.home ? 'Yes' : (d['Home District'] && d['District in which Range lies'] ? 'No' : '—')}</b><span>posted in home district</span></div>
          </div>` : ''}
        <div class="bio">${rows}</div></section>`;
    };
    dlg.innerHTML = `
      <div class="dhead"><div class="initials ${o.cadre}">${esc(FL.initials(d.Name))}</div>
        <div><h2>${esc(FL.cleanName(d.Name))}${o.status === 'verified' ? TICK : ''}</h2>
          <div class="sub"><b>${esc(d.Designation || o.cadre)}</b> · HRMS ID <b class="num">${esc(o.id)}</b> · ${esc(d.Division)}, ${esc(d.Circle)}</div>
          <div class="pills"><span class="pill ${o.status}">${STATUS_TXT[o.status]}</span>${d['Last Updated By'] && o.status === 'verified' ? `<span class="faint" style="align-self:center">by ${esc(d['Last Updated By'].split(' · ')[0])} on ${esc(d['Last Updated On'])}</span>` : ''}</div></div>
        <button class="x" id="dClose" aria-label="Close">×</button></div>
      <div class="dbody">
        ${editing() ? '<div class="notice info" style="margin-top:18px">Change only what is wrong. Your changes go to the administrator for approval.</div>' : ''}
        ${!editing() && (o.pending || []).length ? `<div class="notice pend">${o.pending.length} change(s) sent earlier are waiting for approval.</div>` : ''}
        ${secs.map(secHtml).join('')}
      </div>
      <div class="dfoot">${editing()
        ? `<span class="ask">${nChanged ? `${nChanged} field${nChanged > 1 ? 's' : ''} changed` : 'Make your changes above'}</span><span class="sp"></span>
           <button class="btn" id="cancelEdit">Cancel</button><button class="btn primary" id="submitEdit" ${nChanged ? '' : 'disabled'}>${icon.send} Submit for approval</button>`
        : `<span class="ask">Is everything correct?</span><span class="sp"></span>
           <button class="btn good" id="verBtn">${icon.check} Yes, verify · all correct</button>`}</div>`;
    dlg.querySelector('.dbody').scrollTop = keepScroll;
    $('#dClose').onclick = () => closeProfile();
    dlg.querySelectorAll('.sec-edit').forEach(b => b.onclick = () => {
      S.editSecs.add(b.dataset.sec); drawProfile();
      const first = $(`#scrim section.editing [data-f]`); first && first.focus({ preventScroll: true });
    });
    dlg.querySelectorAll('[data-f]').forEach(el => el.addEventListener('change', e => {
      const f = e.target.dataset.f, val = types[f] === 'date' ? fromISO(e.target.value) : e.target.value.trim();
      if (val === (o.data[f] || '')) delete S.edits[f]; else S.edits[f] = val;
      if (f === 'Circle') S.edits.Division = '';
      drawProfile();
    }));
    if (editing()) {
      $('#cancelEdit').onclick = () => { if (!nChanged || confirm('Discard your changes?')) { S.editSecs = new Set(); S.edits = {}; drawProfile(); } };
      $('#submitEdit').onclick = () => submitEdits(o);
    } else {
      $('#verBtn').onclick = () => verify(o);
    }
  }

  async function verify(o) {
    const mis = [];
    if (!o.data['Home District']) mis.push('home district');
    if (!o.data['District in which Range lies']) mis.push('district of the range');
    if (mis.length && !confirm(`The ${mis.join(' and ')} ${mis.length > 1 ? 'are' : 'is'} not recorded.\n\nPress Cancel and use Edit to fill ${mis.length > 1 ? 'them' : 'it'}, or OK to verify anyway.`)) return;
    const b = busy('Saving verification…', false, 'save');
    try {
      const r = await guard(() => API.call('verify', { cadre: o.cadre, id: o.id, circle: S.div.circle, division: S.div.division, operator: op() }));
      Object.assign(o.data, { Verification: 'Verified - All correct', 'Last Updated By': r.verifiedBy, 'Last Updated On': r.verifiedOn });
      if (o.status !== 'pending') o.status = 'verified';
      bumpCounts(o, 'verified');
      b.done(); closeProfile(true);
      toast(`${FL.cleanName(o.data.Name)} verified.`);
      drawDivision(o.cadre + '|' + o.id);
    } catch (e) { b.done(); }
  }

  async function submitEdits(o) {
    const changes = Object.entries(S.edits).map(([field, value]) => ({ field, value }));
    if (!changes.length) return;
    if (!changes.some(c => c.field === 'Verification')) changes.push({ field: 'Verification', value: 'Corrected' });
    const b = busy('Sending for approval…', false, 'save');
    try {
      const r = await guard(() => API.call('submit', { cadre: o.cadre, id: o.id, circle: S.div.circle, division: S.div.division, changes, operator: op() }));
      o.pending = (o.pending || []).concat(changes.map(c => ({ field: c.field, value: c.value, by: (op() || {}).name, on: 'now' })));
      o.status = 'pending'; bumpCounts(o, 'pending');
      b.done(); S.edits = {}; S.editSecs = new Set(); closeProfile(true);
      toast(`Sent for approval (${r.count} change${r.count > 1 ? 's' : ''}).`);
      drawDivision(o.cadre + '|' + o.id);
    } catch (e) { b.done(); }
  }

  function bumpCounts(o, to) {
    const c = S.meta && S.meta.counts && S.meta.counts[S.div.circle + '|' + S.div.division];
    if (!c) return;
    const n = { verified: 0, pending: 0 }; S.div.officers.forEach(x => { if (n[x.status] != null) n[x.status]++; });
    c.verified = n.verified; c.pending = n.pending;
  }

  async function pdfOne(o, quiet) {
    if (!window.pdfMake) { toast('The PDF tool is still loading. Please try again in a moment.', true); return; }
    const b = quiet ? null : busy('Preparing the information sheet…', false, 'pdf');
    try { const name = await PDF.officer(o, S.div.schema[o.cadre]); if (!quiet) toast('Downloaded ' + name); }
    catch (e) { toast('Could not make the PDF: ' + e.message, true); }
    finally { b && b.done(); }
  }

  async function downloadAll() {
    if (!window.pdfMake) { toast('The PDF tool is still loading. Please try again in a moment.', true); return; }
    const list = S.div.officers.slice().sort((a, b) => ['FR', 'DFR', 'FG'].indexOf(a.cadre) - ['FR', 'DFR', 'FG'].indexOf(b.cadre));
    const b = busy(`Preparing ${list.length} information sheets…`, true);
    try { const name = await PDF.division(list, S.div.schema, S.div.circle, S.div.division, b.set); toast('Downloaded ' + name); }
    catch (e) { toast('Could not make the PDF: ' + e.message, true); }
    finally { b.done(); }
  }

  /* ---------------- admin ---------------- */
  async function renderAdmin(status) {
    await ensureMeta();
    if (!S.meta.user || !S.meta.user.isAdmin) { app.innerHTML = '<div class="empty-state"><b>Approvals are for administrators.</b>Ask the PMC cell if you need access.</div>'; return; }
    status = status || 'Pending';
    app.innerHTML = `<div class="crumbs"><a href="#/circles">All circles</a><span class="sep">/</span><span>Approvals</span></div>
      <div class="head"><div><h1 class="page-title">Approvals.</h1><p class="page-sub">Changes sent by divisions. Approved changes are written to the master sheet.</p></div>
        <span class="sp"></span><button class="btn" id="refreshData" title="Use after editing the Google Sheet by hand">↻ Refresh data from sheet</button></div>
      <div class="kpis" id="kpis">${'<div class="skeleton" style="height:76px"></div>'.repeat(4)}</div>
      <div class="toolbar"><div class="chips">${['Pending', 'Approved', 'Rejected', 'All'].map(s => `<button class="chip${s === status ? ' on' : ''}" data-s="${s}">${s}</button>`).join('')}</div>
        <label class="search">${icon.search}<input id="aq" placeholder="Search officer, operator or field"></label></div>
      <div id="alist">${loaderHtml('admin')}</div>`;
    animateLoader(app);
    app.querySelectorAll('[data-s]').forEach(b => b.onclick = () => renderAdmin(b.dataset.s));
    $('#refreshData').onclick = async () => {
      const bz = busy('Reading the Google Sheet again… this can take up to a minute.');
      try { const r = await guard(() => API.call('adminRefresh')); S.meta = null; toast(`Data refreshed (${r.divisions} divisions).`); }
      catch (e) {} finally { bz.done(); }
    };
    const [sum, rows] = await Promise.all([guard(() => API.call('adminSummary')), guard(() => API.call('adminChanges', { filter: { status } }))]);
    $('#kpis').innerHTML = [['Changes waiting', sum.pending], ['Submissions waiting', sum.submissions], ['Approved so far', sum.approved], ['Rejected so far', sum.rejected]]
      .map(([l, n]) => `<div class="kpi"><span>${l}</span><b>${n}</b></div>`).join('');
    const draw = () => {
      const q = $('#aq').value.trim().toLowerCase();
      const list = rows.filter(x => !q || [x.officer, x.name, x.field, x.division, x.email].join(' ').toLowerCase().includes(q));
      if (!list.length) { $('#alist').innerHTML = `<div class="empty-state"><b>${status === 'Pending' ? 'Nothing is waiting for approval.' : 'Nothing here.'}</b></div>`; return; }
      const subs = {}; list.forEach(x => (subs[x.submissionId] = subs[x.submissionId] || []).push(x));
      $('#alist').innerHTML = Object.entries(subs).map(([sid, g]) => {
        const f = g[0], pend = g.filter(x => x.status === 'Pending');
        return `<div class="subm"><div class="sh">
          <div style="flex:1;min-width:240px"><b style="color:var(--ink)">${esc(f.officer)}</b> <span class="faint">· ${esc(f.cadre)} · HRMS ${esc(f.id)} · ${esc(f.division)}, ${esc(f.circle)}</span>
            <div class="faint">Sent by ${esc(f.name)}${f.designation ? ', ' + esc(f.designation) : ''} · ${esc(f.email)} · ${esc(f.on)}</div></div>
          ${pend.length ? `<button class="btn sm" data-dec="reject" data-sid="${esc(sid)}">Reject</button><button class="btn sm primary" data-dec="approve" data-sid="${esc(sid)}">Approve ${pend.length}</button>` : ''}</div>
          <table><tr><th>Field</th><th>Change</th><th>Status</th></tr>${g.map(x => `<tr><td>${esc(FL.label(x.field))}</td>
            <td><span class="old">${esc(x.oldValue || '(blank)')}</span> → <span class="new">${esc(x.newValue || '(blank)')}</span>${x.conflict ? `<div class="conflict">The sheet now says “${esc(x.current || '(blank)')}”. It changed after this was sent.</div>` : ''}</td>
            <td><span class="pill ${x.status === 'Approved' ? 'verified' : x.status === 'Rejected' ? 'attn' : 'pending'}">${esc(x.status)}</span></td></tr>`).join('')}</table></div>`;
      }).join('');
      app.querySelectorAll('[data-dec]').forEach(b => b.onclick = async () => {
        const g = subs[b.dataset.sid].filter(x => x.status === 'Pending'), approve = b.dataset.dec === 'approve';
        const conflict = g.some(x => x.conflict);
        let note = '';
        if (!approve) { note = prompt('Reason for rejecting (optional):', '') ; if (note === null) return; }
        else if (!confirm(`Approve ${g.length} change(s) for ${g[0].officer}?${conflict ? '\n\nSome values changed after this was sent. They will be overwritten.' : ''}`)) return;
        const bz = busy(approve ? 'Writing to the master sheet…' : 'Rejecting…');
        try {
          const r = await guard(() => API.call('adminDecide', { ids: g.map(x => x.changeId), decision: approve ? 'approve' : 'reject', note, force: conflict }));
          toast(approve ? `${r.applied} change(s) approved.` : `${r.rejected} change(s) rejected.`);
          S.meta = null; renderAdmin(status);
        } catch (e) {} finally { bz.done(); }
      });
    };
    $('#aq').oninput = draw; draw();
  }

  /* ---------------- router ---------------- */
  async function route() {
    if (!API.user) { renderWho(); renderSignin(); return; }
    if (!op()) { renderOperator(false); return; }
    renderWho();
    const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    try {
      if (parts[0] === 'c' && parts[1]) await renderDivisions(parts[1]);
      else if (parts[0] === 'd' && parts[2]) await renderDivision(parts[1], parts[2]);
      else if (parts[0] === 'admin') await renderAdmin();
      else await renderCircles();
    } catch (e) { /* toast already shown */ }
    window.scrollTo(0, 0);
  }
  function render() { route(); }
  window.addEventListener('hashchange', () => { if (S.open) closeProfile(true); route(); });
  if (API.user) start(); else route();
})();
