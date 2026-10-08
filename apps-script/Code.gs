/**
 * UPMC2 — JSON API for the GitHub-hosted UPMC2 app.
 * Data: the Unified PMC Google Sheet (tabs FR, DFR, FG-HFG, Change Log, Lists).
 * Auth: every request carries a Google Sign-In ID token; it is verified with Google and the email is taken from it.
 * Deploy: Web app · Execute as: Me · Who has access: Anyone.
 */

const CONFIG = {
  CLIENT_ID: 'PASTE-YOUR-OAUTH-CLIENT-ID.apps.googleusercontent.com',
  ADMINS: ['admin-1@gmail.com', 'admin-2@gmail.com'],   // replace with the admin Google accounts
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

/* ============================================================ HTTP */

function doGet() {
  return json_({ ok: true, app: 'UPMC2 API', time: now_() });
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const user = authenticate_(body.token);
    const handlers = {
      meta: meta_, division: division_, verify: verify_, submit: submit_,
      adminSummary: adminSummary_, adminChanges: adminChanges_, adminDecide: adminDecide_,
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

/** Verifies a Google ID token with Google and returns {email, name, isAdmin}. Cached for the token's life. */
function authenticate_(token) {
  if (!token) throw new Error('Please sign in with Google.');
  const cache = CacheService.getScriptCache();
  const key = 'tok_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 40);
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Your sign-in has expired. Please sign in again.');
  const info = JSON.parse(res.getContentText());
  if (info.aud !== CONFIG.CLIENT_ID) throw new Error('Sign-in is not for this app.');
  if (String(info.email_verified) !== 'true') throw new Error('Your Google email is not verified.');
  const email = String(info.email).toLowerCase();
  const user = { email, name: info.name || email, isAdmin: CONFIG.ADMINS.some(a => a.toLowerCase() === email) };
  const ttl = Math.max(60, Math.min(3600, Number(info.exp) - Math.floor(Date.now() / 1000) - 30));
  cache.put(key, JSON.stringify(user), ttl);
  return user;
}

/* ============================================================ sheet helpers */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
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

/* ============================================================ actions */

/** Circles → divisions with officer and verified counts (all cadres together). */
function meta_(body, user) {
  const lists = readLists_();
  const pend = {};
  readLog_().rows.forEach(l => { if (l['Status'] === 'Pending') pend[l['Cadre'] + '|' + l['Employee ID']] = true; });
  const counts = {};
  Object.keys(CADRES).forEach(code => {
    readSheet_(code).rows.forEach(r => {
      const k = r['Circle'] + '|' + r['Division'];
      const c = counts[k] = counts[k] || { total: 0, verified: 0, pending: 0 };
      c.total++;
      if (pend[code + '|' + r[CONFIG.KEY]]) c.pending++;
      else if (r['Verification'] === VERIFIED || r['Verification'] === 'Corrected') c.verified++;
    });
  });
  return {
    user, circles: lists.circles, districts: lists.districts, status: lists.status, counts,
    cadres: Object.keys(CADRES).map(k => ({ code: k, label: CADRES[k].label, designations: CADRES[k].designations })),
  };
}

/** All officers (all cadres) of one division, with field types and pending proposals. */
function division_(body) {
  const pending = {};
  readLog_().rows.forEach(l => {
    if (l['Status'] !== 'Pending' || l['Type'] !== 'Edit') return;
    const k = l['Cadre'] + '|' + l['Employee ID'];
    (pending[k] = pending[k] || []).push({ field: l['Field'], value: l['New Value'], by: l['Submitter Name'], on: l['Submitted On'] });
  });
  const out = { officers: [], schema: {} };
  Object.keys(CADRES).forEach(code => {
    const m = readSheet_(code);
    out.schema[code] = m.headers.map(h => ({ name: h, type: typeOf_(h) }));
    m.rows.filter(r => r['Circle'] === body.circle && r['Division'] === body.division).forEach(r => {
      const o = Object.assign({}, r); delete o._row;
      const p = pending[code + '|' + r[CONFIG.KEY]] || [];
      out.officers.push({ cadre: code, id: r[CONFIG.KEY], data: o, pending: p,
        status: p.length ? 'pending' : statusOf_(r, {}) });
    });
  });
  return out;
}

/** Marks an officer verified straight away (no approval needed). */
function verify_(body, user) {
  const code = body.cadre; cadre_(code);
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const m = readSheet_(code), rec = m.index[body.id];
    if (!rec) throw new Error('Officer not found.');
    const sh = sheet_(CADRES[code].sheet), col = h => m.headers.indexOf(h) + 1;
    const by = stamp_(user, body.operator), when = new Date();
    sh.getRange(rec._row, col('Verification')).setNumberFormat('@').setValue(VERIFIED);
    sh.getRange(rec._row, col('Last Updated By')).setNumberFormat('@').setValue(by);
    sh.getRange(rec._row, col('Last Updated On')).setNumberFormat('dd-mm-yyyy hh:mm').setValue(when);
    appendLog_([[id8_(), 'V' + Utilities.formatDate(when, CONFIG.TZ, 'yyMMdd-HHmmss'), now_(), user.email,
      (body.operator && body.operator.name) || user.name, (body.operator && body.operator.designation) || '', (body.operator && body.operator.mobile) || '',
      code, 'Verify', rec[CONFIG.KEY], rec['Name'], rec['Circle'], rec['Division'], 'Verification', rec['Verification'], VERIFIED,
      'Approved', now_(), 'Verified directly by operator']]);
    return { verifiedBy: by, verifiedOn: fmtTs_(when) };
  } finally { lock.releaseLock(); }
}

/** Proposes edits; they wait for admin approval. */
function submit_(body, user) {
  const code = body.cadre; cadre_(code);
  const changes = body.changes || [];
  if (!changes.length) throw new Error('Nothing was changed.');
  const lists = readLists_();
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const m = readSheet_(code), rec = m.index[body.id];
    if (!rec) throw new Error('Officer not found.');
    const op = body.operator || {};
    const sub = 'S' + Utilities.formatDate(new Date(), CONFIG.TZ, 'yyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 900 + 100);
    const rows = [];
    changes.forEach(ch => {
      if (m.headers.indexOf(ch.field) < 0) throw new Error('Unknown field: ' + ch.field);
      if (typeOf_(ch.field) === 'locked') throw new Error(ch.field + ' cannot be changed.');
      const nv = clean_(code, ch.field, ch.value, lists);
      if (nv === rec[ch.field]) return;
      rows.push([id8_(), sub, now_(), user.email, op.name || user.name, op.designation || '', op.mobile || '', code, 'Edit',
        rec[CONFIG.KEY], rec['Name'], rec['Circle'], rec['Division'], ch.field, rec[ch.field], nv, 'Pending', '', '']);
    });
    if (!rows.length) throw new Error('Nothing was changed.');
    appendLog_(rows);
    return { submissionId: sub, count: rows.length };
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
    if (CADRES[o.cadre]) {
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
    return res;
  } finally { lock.releaseLock(); }
}

function mark_(sh, row, lc, status, whenTxt, note) {
  sh.getRange(row, lc('Status')).setValue(status);
  sh.getRange(row, lc('Reviewed On')).setNumberFormat('@').setValue(whenTxt);
  if (note) sh.getRange(row, lc('Review Note')).setValue(note);
}

/** Run once from the editor to authorise (Sheets + external fetch) and check the sheet. */
function setup() {
  readLists_(); logSheet_();
  Object.keys(CADRES).forEach(c => Logger.log(c + ': ' + readSheet_(c).rows.length + ' officers'));
  UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=x', { muteHttpExceptions: true });
  Logger.log('OK. CLIENT_ID set: ' + (CONFIG.CLIENT_ID.indexOf('PASTE') < 0));
}
