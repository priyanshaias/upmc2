/**
 * UPMC2 — JSON API for the GitHub-hosted UPMC2 app.
 * Data: the Unified PMC Google Sheet (tabs FR, DFR, FG-HFG, Change Log, Lists).
 * Auth: username/password login; the server issues a session token kept in the script cache.
 * Private settings (password hashes) live in Config.local.gs, which is NOT in the public repo.
 * Deploy: Web app · Execute as: Me · Who has access: Anyone.
 */

const CONFIG = {
  TZ: 'Asia/Kolkata',
  LOG: 'Change Log',
  LISTS: 'Lists',
  KEY: 'Employee ID',
};

const CADRES = {
  FR: { sheet: 'FR', label: 'Forest Rangers', designations: ['FR'] },
  DFR: { sheet: 'DFR', label: 'Deputy Rangers / Foresters', designations: ['DR/Fr'] },
  FG: { sheet: 'FG-HFG', label: 'Forest Guards & HFG', designations: ['FG', 'HFG'] },
};

const LOCKED = ['Employee ID', 'Posting List Match', 'Name in Posting List', 'Posting List: Circle / Division',
  'Posting List Remarks', 'Home District (as in Gradation)', 'Remarks in Gradation List', 'Last Updated On', 'Last Updated By'];
const LOG_HEADERS = ['Change ID', 'Submission ID', 'Submitted On', 'Submitted By (email)', 'Submitter Name',
  'Submitter Designation', 'Submitter Mobile', 'Cadre', 'Type', 'Employee ID', 'Name', 'Circle', 'Division',
  'Field', 'Old Value', 'New Value', 'Status', 'Reviewed On', 'Review Note'];
const VERIFIED = 'Verified - All correct';
const SESSION_HOURS = 6;          // password sessions last this long (Apps Script cache maximum)
const MAX_FAILS = 5, LOCK_MIN = 15;

/** Private settings from Config.local.gs (read lazily so file order does not matter). */
function local_() {
  const L = (typeof LOCAL_CONFIG !== 'undefined') ? LOCAL_CONFIG : {};
  return { accounts: L.ACCOUNTS || {}, sheetId: L.SHEET_ID || '' };
}

/* ============================================================ HTTP */

function doGet() {
  return json_({ ok: true, app: 'UPMC2 API', time: now_() });
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'login') return json_({ ok: true, data: login_(body) });
    if (body.action === 'logout') { logout_(body.token); return json_({ ok: true, data: {} }); }
    const user = authenticate_(body.token);
    const handlers = {
      meta: meta_, division: division_, verify: verify_, submit: submit_, addOfficer: addOfficer_, search: search_,
      adminSummary: adminSummary_, adminChanges: adminChanges_, adminDecide: adminDecide_, adminRefresh: adminRefresh_, adminData: adminData_,
    };
    const fn = handlers[body.action];
    if (!fn) throw new Error('Unknown action: ' + body.action);
    if (String(body.action).indexOf('admin') === 0 && !user.isAdmin) throw new Error('Only administrators can do this.');
    return json_({ ok: true, data: fn(body, user) });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================ auth */

/* ---------- username / password ---------- */

function sha256hex_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

/** {username, password} -> {token, user}. Wrong attempts lock the username for LOCK_MIN minutes. */
function login_(body) {
  const cache = CacheService.getScriptCache();
  const u = String(body.username || '').trim().toLowerCase(), pw = String(body.password || '');
  if (!u || !pw) throw new Error('Enter your username and password.');
  const failKey = 'fail_' + u, fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAILS) throw new Error('Too many wrong attempts. Try again after ' + LOCK_MIN + ' minutes.');
  const acc = local_().accounts[u];
  if (!acc || sha256hex_(acc.salt + pw) !== acc.hash) {
    cache.put(failKey, String(fails + 1), LOCK_MIN * 60);
    throw new Error('Wrong username or password.');
  }
  cache.remove(failKey);
  const token = 'pw.' + Utilities.getUuid() + Utilities.getUuid().slice(0, 8);
  const user = { email: u + ' (password login)', name: acc.name || u, isAdmin: acc.role === 'admin', username: u };
  cache.put('sess_' + token, JSON.stringify(user), SESSION_HOURS * 3600);
  return { token, user };
}
function logout_(token) { if (token && String(token).indexOf('pw.') === 0) CacheService.getScriptCache().remove('sess_' + token); }

/** Returns {email, name, isAdmin} for a valid password session. */
function authenticate_(token) {
  if (!token || String(token).indexOf('pw.') !== 0) throw new Error('Please sign in.');
  const s = CacheService.getScriptCache().get('sess_' + token);
  if (!s) throw new Error('Your sign-in has expired. Please sign in again.');
  return JSON.parse(s);
}

/* ============================================================ sheet helpers */

/** The Unified PMC sheet: by ID (standalone script) or the sheet this script is attached to. */
function ss_() {
  const id = local_().sheetId;
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No spreadsheet. Put SHEET_ID in Config.local.gs.');
  return ss;
}
function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" not found.');
  return sh;
}
function cadre_(code) { const c = CADRES[code]; if (!c) throw new Error('Unknown cadre: ' + code); return c; }
function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]'; }
function fmt_(v) {
  if (v === null || v === undefined) return '';
  if (isDate_(v)) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, CONFIG.TZ, 'dd-MM-yyyy');
  return String(v).trim();
}
function fmtTs_(v) { return isDate_(v) ? Utilities.formatDate(v, CONFIG.TZ, 'dd-MM-yyyy HH:mm') : fmt_(v); }
function now_() { return Utilities.formatDate(new Date(), CONFIG.TZ, 'dd-MM-yyyy HH:mm:ss'); }

function typeOf_(h) {
  if (LOCKED.indexOf(h) >= 0) return 'locked';
  if (h === 'Circle') return 'circle';
  if (h === 'Division') return 'division';
  if (h === 'Designation') return 'designation';
  if (h === 'Verification') return 'verify';
  if (h === 'Home District' || h === 'District in which Range lies') return 'district';
  if (h === 'Deceased/Retired/Absconding etc') return 'status';
  if (h === 'Remarks') return 'longtext';
  if (/^Since when|Date|^Joined as|^Entry in Govt Service/.test(h)) return 'date';
  return 'text';
}

function parseDate_(s) {
  s = String(s || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) throw new Error('Invalid date "' + s + '" (use DD-MM-YYYY)');
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  if (d.getDate() !== +m[1] || d.getMonth() !== +m[2] - 1 || +m[3] < 1950 || +m[3] > 2075) throw new Error('Invalid date "' + s + '"');
  return d;
}

function readSheet_(code) {
  const values = sheet_(cadre_(code).sheet).getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim()).filter(Boolean);
  const rows = [], index = {};
  for (let r = 1; r < values.length; r++) {
    const o = { _row: r + 1 };
    headers.forEach((h, c) => { o[h] = h === 'Last Updated On' ? fmtTs_(values[r][c]) : fmt_(values[r][c]); });
    if (!o[CONFIG.KEY]) continue;
    rows.push(o); index[o[CONFIG.KEY]] = o;
  }
  return { headers, rows, index };
}

function logSheet_() {
  let sh = ss_().getSheetByName(CONFIG.LOG);
  if (!sh) {
    sh = ss_().insertSheet(CONFIG.LOG);
    sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold');
  }
  return sh;
}
function readLog_() {
  const values = logSheet_().getDataRange().getValues();
  const headers = values[0].map(String), rows = [];
  for (let r = 1; r < values.length; r++) {
    const o = { _row: r + 1 };
    headers.forEach((h, c) => { o[h] = fmtTs_(values[r][c]); });
    if (o['Change ID']) rows.push(o);
  }
  return { headers, rows };
}

function readLists_() {
  const v = sheet_(CONFIG.LISTS).getDataRange().getValues();
  const h = v[0].map(x => String(x).trim());
  const take = name => { const i = h.indexOf(name); return i < 0 ? [] : v.slice(1).map(r => fmt_(r[i])).filter(Boolean); };
  const circles = [], by = {};
  v.slice(1).forEach(r => {
    const c = fmt_(r[h.indexOf('Circle')]), d = fmt_(r[h.indexOf('Division')]), off = fmt_(r[h.indexOf('Office')]);
    if (!c || !d) return;
    if (!by[c]) { by[c] = { circle: c, office: off, divisions: [] }; circles.push(by[c]); }
    by[c].divisions.push(d);
  });
  return { circles, districts: take('Districts'), status: take('Deceased/Retired/Absconding etc') };
}

function statusOf_(r, pendingIds) {
  if (pendingIds[r[CONFIG.KEY]]) return 'pending';
  if (r['Verification'] === VERIFIED || r['Verification'] === 'Corrected') return 'verified';
  return 'unverified';
}

function stamp_(user, op) {
  return (op && op.name ? op.name : user.name) + (op && op.designation ? ' (' + op.designation + ')' : '') + ' · ' + user.email;
}

/* ============================================================ cache
 * Opening the sheet is slow (it holds many formulas), so the whole dataset is read once and kept,
 * gzipped, in the script cache for up to 6 hours: 'meta', 'schema' and one 'div|<circle>|<division>' per division.
 * Verify / submit update the cached copy in place; approvals and "Refresh data" rebuild it. */

const CACHE_TTL = 21600;
function gz_(o) { return Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(o), 'application/json')).getBytes()); }
function ungz_(s) { return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(s), 'application/x-gzip')).getDataAsString()); }
function cget_(k) { const v = CacheService.getScriptCache().get(k); return v ? ungz_(v) : null; }
function cput_(obj) { const m = {}; Object.keys(obj).forEach(k => m[k] = gz_(obj[k])); CacheService.getScriptCache().putAll(m, CACHE_TTL); }
const divKey_ = (c, d) => 'div|' + c + '|' + d;

/** Reads everything once and fills the cache. Returns {meta, schema, divs}. */
function buildAll_() {
  const lists = readLists_();
  const pending = {};
  readLog_().rows.forEach(l => {
    if (l['Status'] !== 'Pending' || l['Type'] !== 'Edit') return;
    const k = l['Cadre'] + '|' + l['Employee ID'];
    (pending[k] = pending[k] || []).push({ field: l['Field'], value: l['New Value'], by: l['Submitter Name'], on: l['Submitted On'] });
  });
  const schema = {}, divs = {}, counts = {};
  Object.keys(CADRES).forEach(code => {
    const m = readSheet_(code);
    schema[code] = m.headers.map(h => ({ name: h, type: typeOf_(h) }));
    m.rows.forEach(r => {
      const k = divKey_(r['Circle'], r['Division']);
      const o = Object.assign({}, r); delete o._row;
      const p = pending[code + '|' + r[CONFIG.KEY]] || [];
      (divs[k] = divs[k] || { officers: [] }).officers.push({ cadre: code, id: r[CONFIG.KEY], row: r._row, data: o, pending: p,
        status: p.length ? 'pending' : statusOf_(r, {}) });
    });
  });
  // pending transfers: show the officer in the target division as "transfer in"
  Object.keys(divs).forEach(k => divs[k].officers.slice().forEach(o => addIncoming_(divs, o)));
  readLog_().rows.forEach(l => {
    if (l['Status'] !== 'Pending' || l['Type'] !== 'Add' || !CADRES[l['Cadre']]) return;
    let data = {}; try { data = JSON.parse(l['New Value']); } catch (e) { return; }
    const k = divKey_(data['Circle'], data['Division']);
    (divs[k] = divs[k] || { officers: [] }).officers.push({ cadre: l['Cadre'], id: data[CONFIG.KEY], row: null, data, isNew: true,
      pending: [{ field: '(New officer)', value: 'New officer', by: l['Submitter Name'], on: l['Submitted On'] }], status: 'pending' });
  });
  Object.keys(divs).forEach(k => counts[k.slice(4)] = countsOf_(divs[k]));
  const meta = { circles: lists.circles, districts: lists.districts, status: lists.status, counts, builtAt: now_(), builtMs: Date.now(),
    cadres: Object.keys(CADRES).map(k => ({ code: k, label: CADRES[k].label, designations: CADRES[k].designations })) };
  const put = { meta, schema }; Object.keys(divs).forEach(k => put[k] = divs[k]);
  cput_(put);
  return { meta, schema, divs };
}
/** If an officer has a pending division change, put a read-only "transfer in" copy in the target division. */
function addIncoming_(divs, o, loader) {
  if (o.incoming || !o.pending || !o.pending.length) return null;
  const pv = f => { const x = o.pending.filter(p => p.field === f).slice(-1)[0]; return x ? x.value : null; };
  const nd = pv('Division'); if (!nd || nd === o.data['Division']) return null;
  const nc = pv('Circle') || o.data['Circle'], k = divKey_(nc, nd);
  const copy = { cadre: o.cadre, id: o.id, row: null, incoming: true, status: 'pending', pending: o.pending,
    from: o.data['Circle'] + ' / ' + o.data['Division'], data: Object.assign({}, o.data) };
  o.pending.forEach(p => { if (p.field !== '(New officer)') copy.data[p.field] = p.value; });
  const d = divs[k] = divs[k] || (loader && loader(nc, nd)) || { officers: [] };
  d.officers = d.officers.filter(x => !(x.incoming && x.id === o.id && x.cadre === o.cadre));
  d.officers.push(copy);
  return { key: k, circle: nc, division: nd, d };
}

/** Operators: find an officer of a cadre anywhere in the register, by HRMS ID or name (for "already listed?" checks). */
function search_(body) {
  const code = body.cadre; cadre_(code);
  const q = String(body.q || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (q.length < 3) throw new Error('Type at least 3 letters or digits.');
  const meta = getMeta_(), keys = Object.keys(meta.counts).filter(k => meta.counts[k].total).map(k => 'div|' + k);
  const got = CacheService.getScriptCache().getAll(keys);
  const divs = Object.keys(got).length < keys.length ? buildAll_().divs : keys.reduce((a, k) => (a[k] = ungz_(got[k]), a), {});
  const toks = q.split(' '), out = [];
  Object.keys(divs).forEach(k => divs[k].officers.forEach(o => {
    if (o.cadre !== code || o.incoming) return;
    const hay = (String(o.id) + ' ' + String(o.data.Name || '')).toLowerCase();
    if (!toks.every(t => hay.indexOf(t) >= 0)) return;
    out.push({ cadre: o.cadre, id: o.id, isNew: !!o.isNew, status: o.status, name: o.data.Name, designation: o.data.Designation,
      circle: o.data.Circle, division: o.data.Division, range: o.data['Present Range / Office'] || '', beat: o.data['Present Beat'] || '',
      pendingTransfer: (o.pending || []).some(p => p.field === 'Division') });
  }));
  return { results: out.slice(0, 25), more: Math.max(0, out.length - 25) };
}

function countsOf_(d) {
  const c = { total: 0, verified: 0, pending: 0 };
  d.officers.forEach(o => { if (o.incoming) return; c.total++; if (o.status === 'pending') c.pending++; else if (o.status === 'verified') c.verified++; });
  return c;
}
function getMeta_() { return cget_('meta') || buildAll_().meta; }
function getSchema_() { return cget_('schema') || buildAll_().schema; }
function getDiv_(circle, division) {
  const k = divKey_(circle, division), meta = getMeta_();
  const known = meta.counts[circle + '|' + division];
  if (!known || !known.total) return { officers: [] };
  return cget_(k) || buildAll_().divs[k] || { officers: [] };
}
/** After a write: store the patched division and its new counts. */
function saveDiv_(circle, division, d) {
  const meta = cget_('meta');
  const put = {}; put[divKey_(circle, division)] = d;
  if (meta) { meta.counts[circle + '|' + division] = countsOf_(d); put.meta = meta; }
  cput_(put);
}
/** Finds the officer's sheet row from the cache and re-reads just that row; falls back to a full read. */
function locate_(code, id, circle, division) {
  const sh = sheet_(CADRES[code].sheet);
  const headers = (getSchema_()[code] || []).map(f => f.name);
  const d = circle ? getDiv_(circle, division) : null;
  const o = d && d.officers.find(x => x.cadre === code && x.id === id);
  if (o && o.row && headers.length) {
    const vals = sh.getRange(o.row, 1, 1, headers.length).getValues()[0];
    const rec = { _row: o.row }; headers.forEach((h, i) => rec[h] = h === 'Last Updated On' ? fmtTs_(vals[i]) : fmt_(vals[i]));
    if (rec[CONFIG.KEY] === id) return { sh, headers, rec, d, o };
  }
  const m = readSheet_(code), rec = m.index[id];     // sheet changed by hand: slow path + rebuild cache
  if (!rec) throw new Error('Officer not found.');
  buildAll_();
  const d2 = getDiv_(rec['Circle'], rec['Division']);
  return { sh, headers: m.headers, rec, d: d2, o: d2.officers.find(x => x.cadre === code && x.id === id) };
}

/* ============================================================ actions */

/** Circles → divisions with officer and verified counts (all cadres together). */
function meta_(body, user) {
  return Object.assign({}, getMeta_(), { user });
}

/** All officers (all cadres) of one division, with field types and pending proposals. */
function division_(body) {
  const d = getDiv_(body.circle, body.division);
  return { officers: d.officers.map(o => { const x = Object.assign({}, o); delete x.row; return x; }), schema: getSchema_() };
}

/** Marks an officer verified straight away (no approval needed). */
function verify_(body, user) {
  const code = body.cadre; cadre_(code);
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const L = locate_(code, body.id, body.circle, body.division), rec = L.rec, col = h => L.headers.indexOf(h) + 1;
    const by = stamp_(user, body.operator), when = new Date(), whenTxt = fmtTs_(when);
    L.sh.getRange(rec._row, col('Verification')).setNumberFormat('@').setValue(VERIFIED);
    L.sh.getRange(rec._row, col('Last Updated By')).setNumberFormat('@').setValue(by);
    L.sh.getRange(rec._row, col('Last Updated On')).setNumberFormat('dd-mm-yyyy hh:mm').setValue(when);
    appendLog_([[id8_(), 'V' + Utilities.formatDate(when, CONFIG.TZ, 'yyMMdd-HHmmss'), now_(), user.email,
      (body.operator && body.operator.name) || user.name, (body.operator && body.operator.designation) || '', (body.operator && body.operator.mobile) || '',
      code, 'Verify', rec[CONFIG.KEY], rec['Name'], rec['Circle'], rec['Division'], 'Verification', rec['Verification'], VERIFIED,
      'Approved', now_(), 'Verified directly by operator']]);
    if (L.o) {
      Object.assign(L.o.data, { Verification: VERIFIED, 'Last Updated By': by, 'Last Updated On': whenTxt });
      if (!L.o.pending.length) L.o.status = 'verified';
      saveDiv_(rec['Circle'], rec['Division'], L.d);
    }
    return { verifiedBy: by, verifiedOn: whenTxt };
  } finally { lock.releaseLock(); }
}

/** Proposes edits; they wait for admin approval. */
function submit_(body, user) {
  const code = body.cadre; cadre_(code);
  const changes = body.changes || [];
  if (!changes.length) throw new Error('Nothing was changed.');
  const meta = getMeta_(), lists = { circles: meta.circles, districts: meta.districts, status: meta.status };
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const L = locate_(code, body.id, body.circle, body.division), rec = L.rec;
    const op = body.operator || {};
    const sub = 'S' + Utilities.formatDate(new Date(), CONFIG.TZ, 'yyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 900 + 100);
    const rows = [];
    changes.forEach(ch => {
      if (L.headers.indexOf(ch.field) < 0) throw new Error('Unknown field: ' + ch.field);
      if (typeOf_(ch.field) === 'locked') throw new Error(ch.field + ' cannot be changed.');
      const nv = clean_(code, ch.field, ch.value, lists);
      if (nv === rec[ch.field]) return;
      rows.push([id8_(), sub, now_(), user.email, op.name || user.name, op.designation || '', op.mobile || '', code, 'Edit',
        rec[CONFIG.KEY], rec['Name'], rec['Circle'], rec['Division'], ch.field, rec[ch.field], nv, 'Pending', '', '']);
    });
    if (!rows.length) throw new Error('Nothing was changed.');
    const chg = f => rows.some(r => r[13] === f);
    if (chg('Division') && !chg('Division Date')) throw new Error('This is a transfer: enter the date of joining the new division (Division date).');
    if (chg('Circle') && !chg('Circle Date')) throw new Error('This is a transfer to another circle: enter the date of joining the new circle (Circle date).');
    appendLog_(rows);
    if (L.o) {
      rows.forEach(r => L.o.pending.push({ field: r[13], value: r[15], by: r[4], on: r[2] }));
      L.o.status = 'pending';
      saveDiv_(rec['Circle'], rec['Division'], L.d);
      if (chg('Division')) {
        const inc = addIncoming_({}, L.o, getDiv_);
        if (inc) saveDiv_(inc.circle, inc.division, inc.d);
      }
    }
    return { submissionId: sub, count: rows.length };
  } finally { lock.releaseLock(); }
}

/** Proposes a new officer (not in the gradation list); added to the sheet when an admin approves. */
function addOfficer_(body, user) {
  const code = body.cadre; cadre_(code);
  const meta = getMeta_(), lists = { circles: meta.circles, districts: meta.districts, status: meta.status };
  const headers = (getSchema_()[code] || []).map(f => f.name);
  const raw = body.data || {}, data = {};
  const id = String(raw[CONFIG.KEY] || '').trim();
  if (!/^[A-Za-z0-9-]{4,20}$/.test(id)) throw new Error('Enter a valid HRMS ID.');
  if (!String(raw['Name'] || '').trim()) throw new Error('Enter the officer’s name.');
  if (!raw['Circle'] || !raw['Division']) throw new Error('Circle and division are missing.');
  headers.forEach(h => {
    if (raw[h] === undefined || raw[h] === null || raw[h] === '') return;
    if (h === CONFIG.KEY) { data[h] = id; return; }
    if (typeOf_(h) === 'locked') return;
    const v = clean_(code, h, raw[h], lists);
    if (v) data[h] = v;
  });
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    // HRMS ID must be new: not in any cadre and not already proposed
    const keys = Object.keys(meta.counts).map(k => 'div|' + k), got = CacheService.getScriptCache().getAll(keys);
    const divs = Object.keys(got).length < keys.length ? buildAll_().divs : keys.reduce((a, k) => (a[k] = ungz_(got[k]), a), {});
    Object.keys(divs).forEach(k => divs[k].officers.forEach(o => {
      if (String(o.id) === id) throw new Error('HRMS ID ' + id + ' already belongs to ' + (o.data.Name || 'another officer') + ' (' + (o.data.Division || '') + (o.isNew ? ', awaiting approval' : '') + ').');
    }));
    const op = body.operator || {};
    const sub = 'A' + Utilities.formatDate(new Date(), CONFIG.TZ, 'yyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 900 + 100);
    appendLog_([[id8_(), sub, now_(), user.email, op.name || user.name, op.designation || '', op.mobile || '', code, 'Add',
      id, data['Name'], data['Circle'], data['Division'], '(New officer)', '', JSON.stringify(data), 'Pending', '', '']]);
    const k = divKey_(data['Circle'], data['Division']), d = divs[k] || { officers: [] };
    d.officers.push({ cadre: code, id, row: null, data, isNew: true, status: 'pending',
      pending: [{ field: '(New officer)', value: 'New officer', by: op.name || user.name, on: now_() }] });
    saveDiv_(data['Circle'], data['Division'], d);
    return { submissionId: sub, id };
  } finally { lock.releaseLock(); }
}

function clean_(code, field, v, lists) {
  v = String(v === null || v === undefined ? '' : v).trim();
  if (!v) return '';
  const t = typeOf_(field);
  if (t === 'date') return fmt_(parseDate_(v));
  if (t === 'district' && lists.districts.indexOf(v) < 0) throw new Error(field + ': choose a district from the list.');
  if (t === 'status' && lists.status.indexOf(v) < 0) throw new Error(field + ': choose from the list.');
  if (t === 'designation' && CADRES[code].designations.indexOf(v) < 0) throw new Error('Designation: choose from the list.');
  if (t === 'division' && !lists.circles.some(c => c.divisions.indexOf(v) >= 0)) throw new Error('Unknown division: ' + v);
  if (t === 'circle' && !lists.circles.some(c => c.circle === v)) throw new Error('Unknown circle: ' + v);
  return v;
}

function appendLog_(rows) {
  const sh = logSheet_();
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setNumberFormat('@').setValues(rows);
}
function id8_() { return Utilities.getUuid().slice(0, 8); }

/* ============================================================ admin */

function adminSummary_() {
  const s = { pending: 0, submissions: 0, approved: 0, rejected: 0, verifiedToday: 0, byCadre: {} };
  const subs = {}, today = Utilities.formatDate(new Date(), CONFIG.TZ, 'dd-MM-yyyy');
  readLog_().rows.forEach(l => {
    if (l['Status'] === 'Pending') { s.pending++; subs[l['Submission ID']] = 1; s.byCadre[l['Cadre']] = (s.byCadre[l['Cadre']] || 0) + 1; }
    else if (l['Type'] === 'Verify') { if (String(l['Submitted On']).indexOf(today) === 0) s.verifiedToday++; }
    else if (l['Status'] === 'Approved') s.approved++;
    else if (l['Status'] === 'Rejected') s.rejected++;
  });
  s.submissions = Object.keys(subs).length;
  return s;
}

function adminChanges_(body) {
  const f = body.filter || {};
  const masters = {}, master = c => masters[c] = masters[c] || readSheet_(c);
  return readLog_().rows.filter(l => l['Type'] !== 'Verify' &&
    (!f.status || f.status === 'All' || l['Status'] === f.status) &&
    (!f.cadre || l['Cadre'] === f.cadre) && (!f.circle || l['Circle'] === f.circle)
  ).reverse().slice(0, 2000).map(l => {
    const o = { changeId: l['Change ID'], submissionId: l['Submission ID'], on: l['Submitted On'], email: l['Submitted By (email)'],
      name: l['Submitter Name'], designation: l['Submitter Designation'], mobile: l['Submitter Mobile'], cadre: l['Cadre'],
      type: l['Type'], id: l['Employee ID'], officer: l['Name'], circle: l['Circle'], division: l['Division'],
      field: l['Field'], oldValue: l['Old Value'], newValue: l['New Value'], status: l['Status'], reviewedOn: l['Reviewed On'], note: l['Review Note'] };
    if (CADRES[o.cadre] && o.type !== 'Add') {
      const rec = master(o.cadre).index[o.id];
      o.current = rec ? rec[o.field] : '(record missing)';
      o.conflict = o.status === 'Pending' && o.current !== o.oldValue;
    }
    return o;
  });
}

function adminDecide_(body, user) {
  const ids = {}; (body.ids || []).forEach(i => ids[i] = true);
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const lsh = logSheet_(), log = readLog_(), lc = h => log.headers.indexOf(h) + 1;
    const res = { applied: 0, rejected: 0, conflicts: [], errors: [] };
    const masters = {}, master = c => masters[c] = masters[c] || readSheet_(c);
    const when = new Date(), whenTxt = Utilities.formatDate(when, CONFIG.TZ, 'dd-MM-yyyy HH:mm');
    log.rows.filter(l => ids[l['Change ID']] && l['Status'] === 'Pending').forEach(l => {
      try {
        if (body.decision === 'reject') { mark_(lsh, l._row, lc, 'Rejected', whenTxt, body.note); res.rejected++; return; }
        const by0 = l['Submitter Name'] + (l['Submitter Designation'] ? ' (' + l['Submitter Designation'] + ')' : '') + ' · ' + l['Submitted By (email)'];
        if (l['Type'] === 'Add') {
          const code = l['Cadre'], m = master(code), data = JSON.parse(l['New Value']);
          if (m.index[data[CONFIG.KEY]]) throw new Error('HRMS ID ' + data[CONFIG.KEY] + ' is already in the sheet.');
          const sh = sheet_(CADRES[code].sheet), row = sh.getLastRow() + 1;
          const extra = { 'Verification': VERIFIED, 'Posting List Match': 'Added by division', 'Last Updated By': by0 };
          const vals = m.headers.map(h => {
            const v = data[h] !== undefined ? data[h] : (extra[h] || '');
            return typeOf_(h) === 'date' && v ? parseDate_(v) : (h === 'Last Updated On' ? when : v);
          });
          const rg = sh.getRange(row, 1, 1, m.headers.length);
          rg.setNumberFormats([m.headers.map(h => typeOf_(h) === 'date' ? 'dd-mm-yyyy' : (h === 'Last Updated On' ? 'dd-mm-yyyy hh:mm' : '@'))]).setValues([vals]);
          const o = { _row: row }; m.headers.forEach(h => o[h] = data[h] || ''); m.index[data[CONFIG.KEY]] = o;
          mark_(lsh, l._row, lc, 'Approved', whenTxt, body.note || ('Approved by ' + user.email));
          res.applied++; return;
        }
        const code = l['Cadre'], m = master(code), rec = m.index[l['Employee ID']];
        if (!rec) throw new Error('Officer not found ' + l['Employee ID']);
        if (rec[l['Field']] !== l['Old Value'] && !body.force) {
          res.conflicts.push({ officer: l['Name'], field: l['Field'], old: l['Old Value'], current: rec[l['Field']] }); return;
        }
        const sh = sheet_(CADRES[code].sheet), col = h => m.headers.indexOf(h) + 1;
        const cell = sh.getRange(rec._row, col(l['Field']));
        if (typeOf_(l['Field']) === 'date') cell.setNumberFormat('dd-mm-yyyy').setValue(l['New Value'] ? parseDate_(l['New Value']) : '');
        else cell.setNumberFormat('@').setValue(l['New Value']);
        rec[l['Field']] = l['New Value'];
        const by = l['Submitter Name'] + (l['Submitter Designation'] ? ' (' + l['Submitter Designation'] + ')' : '') + ' · ' + l['Submitted By (email)'];
        sh.getRange(rec._row, col('Last Updated By')).setNumberFormat('@').setValue(by);
        sh.getRange(rec._row, col('Last Updated On')).setNumberFormat('dd-mm-yyyy hh:mm').setValue(when);
        mark_(lsh, l._row, lc, 'Approved', whenTxt, body.note || ('Approved by ' + user.email));
        res.applied++;
      } catch (err) { res.errors.push(l['Change ID'] + ': ' + err.message); }
    });
    buildAll_();
    return res;
  } finally { lock.releaseLock(); }
}

/** Admin dashboard: every officer of one cadre (from the cache), with the field schema. */
function adminData_(body) {
  const code = body.cadre; cadre_(code);
  const meta = getMeta_(), schema = getSchema_();
  const keys = Object.keys(meta.counts).filter(k => meta.counts[k].total).map(k => 'div|' + k);
  const got = CacheService.getScriptCache().getAll(keys);
  let divs = {};
  if (Object.keys(got).length < keys.length) divs = buildAll_().divs;
  else keys.forEach(k => divs[k] = ungz_(got[k]));
  const officers = [];
  Object.keys(divs).forEach(k => divs[k].officers.forEach(o => {
    if (o.cadre !== code) return;
    const x = Object.assign({}, o); delete x.row; officers.push(x);
  }));
  return { cadre: code, officers, schema: { [code]: schema[code] }, builtAt: meta.builtAt, circles: meta.circles };
}

/** Admin: re-read the sheet now (use after editing the sheet by hand). */
function adminRefresh_() { const all = buildAll_(); return { builtAt: all.meta.builtAt, divisions: Object.keys(all.divs).length }; }

function mark_(sh, row, lc, status, whenTxt, note) {
  sh.getRange(row, lc('Status')).setValue(status);
  sh.getRange(row, lc('Reviewed On')).setNumberFormat('@').setValue(whenTxt);
  if (note) sh.getRange(row, lc('Review Note')).setValue(note);
}

/**
 * Keeps the app fast. Add a time-driven trigger for this function (every 10 minutes):
 * it keeps Google's server for this script awake and re-reads the sheet before the cache expires (every 5 hours).
 */
function keepWarm() {
  const m = cget_('meta');
  if (!m || !m.builtMs || Date.now() - m.builtMs > 5 * 3600 * 1000) buildAll_();
}

/** Run once from the editor to authorise and check the sheet. */
function setup() {
  Logger.log('Sheet: ' + ss_().getName());
  readLists_(); logSheet_();
  const all = buildAll_(); Logger.log('Cache ready: ' + Object.keys(all.divs).length + ' divisions');
  Object.keys(CADRES).forEach(c => Logger.log(c + ': ' + readSheet_(c).rows.length + ' officers'));
  const L = local_();
  Logger.log('Password users: ' + Object.keys(L.accounts).map(u => u + ' (' + L.accounts[u].role + ')').join(', '));
  if (typeof LOCAL_CONFIG === 'undefined') Logger.log('WARNING: Config.local.gs is missing. Add it as a second script file.');
}
