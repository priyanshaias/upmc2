// Demo backend: made-up officers so the app can be tried and taught without real data.
(function () {
  const CIRCLES = [
    ['APM', 'CF, APM', ['Admin', 'Utilization', 'Publicity']],
    ['WP & GIS', 'CF, WP & GIS', ['Circle HQ', 'WP North', 'WP South I', 'WP South II']],
    ['Central', 'CCF, Central', ['Circle HQ', 'Bankura (N)', 'Bankura (S)', 'Panchet']],
    ['Western', 'CCF, Western', ['Circle HQ', 'Medinipur', 'Purba Medinipur', 'Kharagpur', 'Jhargram', 'Rupnarayan']],
    ['South East', 'CCF, South East', ['Circle HQ', 'Burdwan', 'Birbhum', 'Durgapur']],
    ['South West', 'CCF, South West', ['Circle HQ', 'Purulia', 'Kangsabati (N)', 'Kangsabati (S)', 'Extn. Forestry']],
    ['Parks & Gardens', 'CF, Parks & Gardens', ['Circle HQ', 'Howrah', 'Parks & Gardens North', 'URF']],
    ['North West', 'CF, North West', ['Circle HQ', 'Malda', 'Raiganj', 'Siliguri S.F', 'Jalpaiguri S.F.']],
    ['Hill', 'CCF, Hill', ['Circle HQ', 'Darjeeling', 'Kalimpong', 'Kurseong Dn.']],
    ['Northern', 'CCF, Northern', ['Circle HQ', 'Jalpaiguri', 'Baikunthapur', 'NTFP', 'Coochbehar']],
    ['Wild Life North', 'CCF, WL North', ['Circle HQ', 'Darjeeling WL', 'Gorumara WL', 'Jaldapara WL']],
    ['BTR', 'CCF & FD, BTR', ['Circle HQ', 'B.T.R (East)', 'B.T.R (West)']],
    ['WL HQ', 'CF, WL HQ', ['Division HQ']],
    ['STR', 'CCF & FD, STR', ['S.T.R']],
    ['SBR', 'Joint Director, SBR', ['Circle HQ', '24 Parganas (S)', '24 Parganas (N)', 'Nadia-Murshidabad']],
    ['Research', 'CF, Research', ['Circle HQ', 'Silviculture Hill', 'Silviculture North', 'Silviculture South']],
    ['Development', 'CF, Development', ['Circle HQ', 'WB Forest School', 'SFTI Hizli']],
    ['Monitoring', 'CF, Monitoring', ['Circle HQ', 'Monitoring North', 'Monitoring South']],
    ['Soil Con (N)', 'CF, SC', ['Circle HQ', 'Kurseong SC', 'Jalpaiguri SC']],
  ].map(([circle, office, divisions]) => ({ circle, office, divisions }));
  const DISTRICTS = ['Alipurduar', 'Bankura', 'Birbhum', 'Cooch Behar', 'Dakshin Dinajpur', 'Darjeeling', 'Hooghly', 'Howrah', 'Jalpaiguri', 'Jhargram',
    'Kalimpong', 'Kolkata', 'Malda', 'Murshidabad', 'Nadia', 'North 24 Parganas', 'Paschim Bardhaman', 'Paschim Medinipur', 'Purba Bardhaman',
    'Purba Medinipur', 'Purulia', 'South 24 Parganas', 'Uttar Dinajpur', 'Outside West Bengal'];
  const STATUS = ['Deceased', 'Retired', 'Absconding', 'Suspended', 'Others (write in Remarks)'];
  const stOf = d => d.Verification === 'Verified - All correct' || d.Verification === 'Corrected' ? 'verified' : d.Verification === 'Verified - Posting and home district' ? 'partial' : 'unverified';
  const HEAD = {
    FR: ['Employee ID', 'Designation', 'Circle', 'Division', 'Name', 'Verification', 'Home District', 'Present Range / Office', 'District in which Range lies', 'Since when in this Range', 'Additional Charge of Range', 'Since when in A/charge', 'Deceased/Retired/Absconding etc', 'Remarks', 'Division Date', 'Circle Date', 'Posting List Match', 'Name in Posting List', 'Posting List: Circle / Division', 'Posting List Remarks', 'Home District (as in Gradation)', 'Qualification', 'Caste', 'RC', 'Date of Birth', 'Date of Retirement', 'Entry in Govt Service', 'Confirmation Date', 'Rank Date (as FR)', 'Training Batch', 'Remarks in Gradation List', 'Last Updated On', 'Last Updated By'],
    DFR: ['Employee ID', 'Designation', 'Circle', 'Division', 'Name', 'Verification', 'Home District', 'Present Range / Office', 'District in which Range lies', 'Present Beat', 'Since when in this Beat', "In charge of Range (name, else 'No')", 'Since when in charge of Range', 'Additional charge of Beat(s)', 'Since when in A/charge of Beat(s)', 'Deceased/Retired/Absconding etc', 'Remarks', 'Division Date', 'Circle Date', 'Posting List Match', 'Name in Posting List', 'Posting List: Circle / Division', 'Posting List Remarks', 'Home District (as in Gradation)', 'Qualification', 'Caste', 'RC', 'Date of Birth', 'Date of Retirement', 'Entry in Govt Service', 'Confirmation Date', 'Joined as DR/Fr', 'Training Batch', 'DR/Fr Training Batch', 'Remarks in Gradation List', 'Last Updated On', 'Last Updated By'],
    FG: ['Employee ID', 'Designation', 'Circle', 'Division', 'Name', 'Verification', 'Home District', 'Present Range / Office', 'District in which Range lies', 'Since when in this Range', 'Present Beat', 'Since when in this Beat', 'Camp / Checkpost (if any)', 'Since when in Camp / Checkpost', 'Deceased/Retired/Absconding etc', 'Remarks', 'Division Date', 'Circle Date', 'Posting List Match', 'Name in Posting List', 'Posting List: Circle / Division', 'Posting List Remarks', 'Home District (as in Gradation)', 'Qualification', 'Caste', 'RC', 'Date of Birth', 'Date of Retirement', 'Entry in Govt Service', 'Joined as FG', 'Joined as HFG', 'Confirmation Date', 'Training Batch', 'Home District (as per DFO Report)', 'Remarks in Gradation List', 'Last Updated On', 'Last Updated By'],
  };
  const LOCKED = ['Employee ID', 'Posting List Match', 'Name in Posting List', 'Posting List: Circle / Division', 'Posting List Remarks',
    'Home District (as in Gradation)', 'Remarks in Gradation List', 'Last Updated On', 'Last Updated By'];
  function typeOf(h) {
    if (LOCKED.includes(h)) return 'locked';
    if (h === 'Circle') return 'circle'; if (h === 'Division') return 'division'; if (h === 'Designation') return 'designation';
    if (h === 'Verification') return 'verify'; if (h === 'Home District' || h === 'District in which Range lies') return 'district';
    if (h === 'Deceased/Retired/Absconding etc') return 'status'; if (h === 'Remarks') return 'longtext';
    if (/^Since when|Date|^Joined as|^Entry in Govt Service/.test(h)) return 'date';
    return 'text';
  }
  const FIRST = ['Amit', 'Bikash', 'Chandan', 'Debasish', 'Gopal', 'Hari', 'Jayanta', 'Kalyan', 'Lakshmi', 'Manas', 'Nirmal', 'Pradip', 'Rina', 'Sabita',
    'Sanjay', 'Subrata', 'Tapas', 'Uttam', 'Pemba', 'Dawa', 'Sonam', 'Rabin', 'Sukla', 'Anita', 'Mithun', 'Ramesh', 'Tshering', 'Soma', 'Arup', 'Bijoy'];
  const LAST = ['Das', 'Mondal', 'Roy', 'Ghosh', 'Sarkar', 'Mahato', 'Tamang', 'Lepcha', 'Chettri', 'Biswas', 'Hembram', 'Murmu', 'Pradhan', 'Saha',
    'Majhi', 'Bhutia', 'Sen', 'Paul', 'Barman', 'Oraon', 'Kisku', 'Rai', 'Gurung', 'Haldar', 'Bauri', 'Soren'];
  const RANGES = ['Range HQ', 'North Range', 'South Range', 'East Range', 'West Range', 'Mobile Range', 'Attached Forest Range', 'Land & Law Cell', 'Nursery Range'];
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  const hash = str => [...str].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const p2 = n => String(n).padStart(2, '0');
  const date = (r, y0, y1) => `${p2(1 + Math.floor(r() * 28))}-${p2(1 + Math.floor(r() * 12))}-${y0 + Math.floor(r() * (y1 - y0 + 1))}`;

  const store = {};   // "circle|division" -> officers
  const log = [];
  function officers(circle, division) {
    const key = circle + '|' + division;
    if (store[key]) return store[key];
    const r = rng(hash(key));
    const list = [];
    const home = pick(r, DISTRICTS.slice(0, 23));
    const plan = { FR: 1 + Math.floor(r() * 4), DFR: 2 + Math.floor(r() * 5), FG: 3 + Math.floor(r() * 8) };
    let n = 0;
    Object.entries(plan).forEach(([cadre, count]) => {
      for (let i = 0; i < count; i++) {
        n++;
        const d = {}; HEAD[cadre].forEach(h => d[h] = '');
        const name = pick(r, FIRST) + ' ' + pick(r, LAST);
        const by = 1960 + Math.floor(r() * 38);
        Object.assign(d, {
          'Employee ID': String(1990000000 + Math.floor(r() * 35) * 100000 + hash(key + n) % 99999),
          Designation: cadre === 'FR' ? 'FR' : cadre === 'DFR' ? 'DR/Fr' : (r() < .15 ? 'HFG' : 'FG'),
          Circle: circle, Division: division, Name: name, Verification: r() < .2 ? 'Verified - All correct' : r() < .15 ? 'Verified - Posting and home district' : 'Pending',
          'Home District': r() < .85 ? (r() < .3 ? home : pick(r, DISTRICTS.slice(0, 23))) : '',
          'Present Range / Office': r() < .9 ? pick(r, RANGES) : '', 'District in which Range lies': r() < .92 ? home : '',
          'Division Date': date(r, 2012, 2025), 'Circle Date': date(r, 2008, 2023),
          'Posting List Match': r() < .85 ? 'Matched' : 'Not present in posting list', 'Name in Posting List': name,
          'Posting List: Circle / Division': circle + ' / ' + division, 'Home District (as in Gradation)': '',
          Qualification: pick(r, ['B.Sc', 'B.A.', 'HS', 'M.Sc', 'MP', 'B.Com']), Caste: pick(r, ['GEN', 'SC', 'ST', 'OBC-A', 'OBC-B']),
          RC: pick(r, ['RR', 'PR']), 'Date of Birth': date(r, by, by), 'Date of Retirement': `30-06-${by + 60}`,
          'Entry in Govt Service': date(r, by + 22, Math.min(by + 32, 2024)), 'Confirmation Date': date(r, by + 25, Math.min(by + 35, 2025)),
          'Training Batch': pick(r, ['99 BF', '102 BF', '106 BF', '24 FG', '32 FG', '2017-18']),
        });
        const since = date(r, 2016, 2025);
        if (d.hasOwnProperty('Since when in this Range')) d['Since when in this Range'] = since;
        if (d.hasOwnProperty('Present Beat')) { d['Present Beat'] = pick(r, ['HQ Beat', 'North Beat', 'Nursery Beat', 'River Beat']); d['Since when in this Beat'] = since; }
        if (cadre === 'FR') d['Rank Date (as FR)'] = date(r, 2008, 2022);
        if (cadre === 'DFR') d['Joined as DR/Fr'] = date(r, 2005, 2020);
        if (cadre === 'FG') { d['Joined as FG'] = d['Entry in Govt Service']; if (d.Designation === 'HFG') d['Joined as HFG'] = date(r, 2010, 2022); }
        if (d['Posting List Match'] === 'Not present in posting list') { d['Present Range / Office'] = ''; d['Name in Posting List'] = ''; d['Posting List: Circle / Division'] = '';
          d.Remarks = 'Not present in posting list (29.08.2026) — no matching name found.'; }
        if (d.Verification !== 'Pending') { d['Last Updated By'] = 'Demo operator (Range Office) · demo@example.com'; d['Last Updated On'] = '02-10-2026 11:20'; }
        list.push({ cadre, id: d['Employee ID'], data: d, pending: [], status: stOf(d) });
      }
    });
    return (store[key] = list);
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const now = () => { const d = new Date(); return `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const find = (cadre, id) => { for (const k in store) { const o = store[k].find(x => x.cadre === cadre && x.id === id && !x.incoming); if (o) return o; } throw new Error('Officer not found.'); };
  function relocate(o) {   // after an approved transfer, move the officer to its new division list
    for (const k in store) store[k] = store[k].filter(x => !(x.cadre === o.cadre && x.id === o.id));
    officers(o.data.Circle, o.data.Division).push(o);
  }

  async function call(action, body, user) {
    await wait(250 + Math.random() * 250);
    if (action === 'meta') {
      const counts = {};
      CIRCLES.forEach(c => c.divisions.forEach(d => {
        const l = officers(c.circle, d);
        counts[c.circle + '|' + d] = { total: l.length, verified: l.filter(o => o.status === 'verified').length, partial: l.filter(o => o.status === 'partial').length, pending: l.filter(o => o.status === 'pending').length };
      }));
      return { user, circles: CIRCLES, districts: DISTRICTS, status: STATUS, counts,
        cadres: [{ code: 'FR', label: 'Forest Rangers', designations: ['FR'] }, { code: 'DFR', label: 'Deputy Rangers / Foresters', designations: ['DR/Fr'] },
          { code: 'FG', label: 'Forest Guards & HFG', designations: ['FG', 'HFG'] }] };
    }
    if (action === 'division') {
      const schema = {}; Object.keys(HEAD).forEach(c => schema[c] = HEAD[c].map(h => ({ name: h, type: typeOf(h) })));
      return { officers: JSON.parse(JSON.stringify(officers(body.circle, body.division))), schema };
    }
    if (action === 'verify') {
      const o = find(body.cadre, body.id), by = `${body.operator.name || user.name}${body.operator.designation ? ' (' + body.operator.designation + ')' : ''} · ${user.email}`;
      const posting = body.level === 'posting';
      if (posting && stOf(o.data) === 'verified') return { level: 'all', unchanged: true, verification: o.data.Verification, verifiedBy: o.data['Last Updated By'], verifiedOn: o.data['Last Updated On'] };
      const val = posting ? 'Verified - Posting and home district' : 'Verified - All correct';
      Object.assign(o.data, { Verification: val, 'Last Updated By': by, 'Last Updated On': now() });
      if (!o.pending.length) o.status = stOf(o.data);
      return { level: posting ? 'posting' : 'all', verification: val, verifiedBy: by, verifiedOn: now() };
    }
    if (action === 'submit') {
      const o = find(body.cadre, body.id);
      const ch = (body.changes || []).filter(c => (o.data[c.field] || '') !== (c.value || ''));
      if (!ch.length) throw new Error('Nothing was changed.');
      const sid = 'S-demo-' + Date.now();
      ch.forEach(c => { o.pending.push({ field: c.field, value: c.value, by: body.operator.name || user.name, on: now() });
        log.push({ changeId: Math.random().toString(16).slice(2, 10), submissionId: sid, on: now(), email: user.email, name: body.operator.name || user.name,
          designation: body.operator.designation || '', mobile: body.operator.mobile || '', cadre: o.cadre, type: 'Edit', id: o.id, officer: o.data.Name,
          circle: o.data.Circle, division: o.data.Division, field: c.field, oldValue: o.data[c.field] || '', newValue: c.value, status: 'Pending', current: o.data[c.field] || '', conflict: false }); });
      o.status = 'pending';
      const nd = ch.find(c => c.field === 'Division');
      if (nd) { const nc = (ch.find(c => c.field === 'Circle') || {}).value || o.data.Circle, copy = JSON.parse(JSON.stringify(o));
        ch.forEach(c => copy.data[c.field] = c.value); Object.assign(copy, { incoming: true, from: o.data.Circle + ' / ' + o.data.Division });
        officers(nc, nd.value).push(copy); }
      return { submissionId: 'S-demo', count: ch.length };
    }
    if (action === 'adminSummary') {
      const pend = log.filter(l => l.status === 'Pending');
      return { pending: pend.length, submissions: new Set(pend.map(l => l.submissionId)).size, approved: log.filter(l => l.status === 'Approved').length,
        rejected: log.filter(l => l.status === 'Rejected').length, verifiedToday: 0, byCadre: {} };
    }
    if (action === 'adminRefresh') return { builtAt: now(), divisions: 70 };
    if (action === 'search') {
      const q = String(body.q || '').toLowerCase().trim(); if (q.length < 3) throw new Error('Type at least 3 letters or digits.');
      CIRCLES.forEach(c => c.divisions.forEach(d => officers(c.circle, d)));
      const out = [];
      for (const k in store) store[k].forEach(o => { if (o.cadre !== body.cadre || o.incoming) return;
        const hay = (o.id + ' ' + o.data.Name).toLowerCase(); if (!q.split(/\s+/).every(t => hay.includes(t))) return;
        out.push({ cadre: o.cadre, id: o.id, isNew: !!o.isNew, status: o.status, name: o.data.Name, designation: o.data.Designation, circle: o.data.Circle,
          division: o.data.Division, range: o.data['Present Range / Office'] || '', pendingTransfer: o.pending.some(p => p.field === 'Division') }); });
      return { results: out.slice(0, 25), more: Math.max(0, out.length - 25) };
    }
    if (action === 'addOfficer') {
      const d = body.data, list = officers(d.Circle, d.Division);
      for (const k in store) if (store[k].some(o => o.id === d['Employee ID'])) throw new Error('HRMS ID ' + d['Employee ID'] + ' already belongs to another officer.');
      const o = { cadre: body.cadre, id: d['Employee ID'], data: Object.assign({}, d), isNew: true, status: 'pending', pending: [{ field: '(New officer)', value: 'New officer', by: body.operator.name, on: now() }] };
      list.push(o);
      log.push({ changeId: Math.random().toString(16).slice(2, 10), submissionId: 'A-demo-' + Date.now(), on: now(), email: user.email, name: body.operator.name || user.name,
        designation: body.operator.designation || '', mobile: '', cadre: body.cadre, type: 'Add', id: o.id, officer: d.Name, circle: d.Circle, division: d.Division,
        field: '(New officer)', oldValue: '', newValue: JSON.stringify(d), status: 'Pending' });
      return { submissionId: 'A-demo', id: o.id };
    }
    if (action === 'adminData') {
      const officersOf = []; CIRCLES.forEach(c => c.divisions.forEach(d => officers(c.circle, d).forEach(o => { if (o.cadre === body.cadre) officersOf.push(o); })));
      const schema = {}; schema[body.cadre] = HEAD[body.cadre].map(h => ({ name: h, type: typeOf(h) }));
      return { cadre: body.cadre, officers: JSON.parse(JSON.stringify(officersOf)), schema, builtAt: now(), circles: CIRCLES };
    }
    if (action === 'adminQueue') return { summary: await call('adminSummary', body, user), rows: await call('adminChanges', body, user) };
    if (action === 'adminChanges') { const f = body.filter || {}; return log.filter(l => !f.status || f.status === 'All' || l.status === f.status).slice().reverse(); }
    if (action === 'adminDecide') {
      let applied = 0, rejected = 0;
      log.filter(l => body.ids.includes(l.changeId) && l.status === 'Pending').forEach(l => {
        const o = find(l.cadre, l.id);
        if (l.type === 'Add') { if (body.decision === 'approve') { o.isNew = false; o.pending = []; o.status = 'verified'; o.data.Verification = 'Verified - All correct'; applied++; l.status = 'Approved'; } else { l.status = 'Rejected'; rejected++; } return; }
        if (body.decision === 'approve') { o.data[l.field] = l.newValue; o.data['Last Updated By'] = l.name + ' · ' + l.email; o.data['Last Updated On'] = now(); l.status = 'Approved'; applied++; }
        else { l.status = 'Rejected'; rejected++; }
        o.pending = o.pending.filter(p => !(p.field === l.field && p.value === l.newValue));
        if (!o.pending.length) o.status = stOf(o.data);
        if (l.field === 'Division' && body.decision === 'approve') relocate(o);
        if (l.field === 'Division' && body.decision !== 'approve') for (const k in store) store[k] = store[k].filter(x => !(x.incoming && x.id === o.id));
      });
      const done = {}; log.forEach(l => { if (body.ids.includes(l.changeId) && l.status !== 'Pending') done[l.changeId] = l.status; });
      return { applied, rejected, conflicts: [], errors: [], done };
    }
    throw new Error('Unknown action ' + action);
  }
  window.UPMC_DEMO = { call };
})();
