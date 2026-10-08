// How officer fields are labelled and grouped in the profile and the PDF.
(function () {
  const LABEL = {
    'Employee ID': 'HRMS ID',
    'Deceased/Retired/Absconding etc': 'Deceased / retired / other status',
    'Present Range / Office': 'Present range / office',
    'District in which Range lies': 'District of the range',
    "In charge of Range (name, else 'No')": 'In charge of range',
    'Rank Date (as FR)': 'Date of rank (FR)',
    'Home District (as in Gradation)': 'Home district (gradation list)',
    'Home District (as per DFO Report)': 'Home district (DFO report)',
    'Posting List: Circle / Division': 'Posting list: circle / division',
    'Remarks in Gradation List': 'Remarks in gradation list',
    'Entry in Govt Service': 'Entry into Govt service',
    'RC': 'Recruitment (RR / PR)',
  };
  const label = h => LABEL[h] || (h.charAt(0) + h.slice(1).toLowerCase().replace(/\b(fr|dr\/fr|fg|hfg|hrms|gis)\b/gi, m => m.toUpperCase()));

  // section -> ordered field names (fields absent in a cadre are skipped)
  const SECTIONS = [
    ['posting', 'Posting and home district', ['Present Range / Office', 'District in which Range lies', 'Home District',
      'Since when in this Range', 'Present Beat', 'Since when in this Beat', 'Camp / Checkpost (if any)', 'Since when in Camp / Checkpost',
      'Additional Charge of Range', 'Since when in A/charge', "In charge of Range (name, else 'No')", 'Since when in charge of Range',
      'Additional charge of Beat(s)', 'Since when in A/charge of Beat(s)', 'Division', 'Division Date', 'Circle', 'Circle Date']],
    ['personal', 'Personal details', ['Name', 'Date of Birth', 'Caste', 'Qualification', 'Home District (as per DFO Report)']],
    ['service', 'Service details', ['Designation', 'Entry in Govt Service', 'Confirmation Date', 'Rank Date (as FR)', 'Joined as DR/Fr',
      'Joined as FG', 'Joined as HFG', 'Date of Retirement', 'RC', 'Training Batch', 'DR/Fr Training Batch']],
    ['status', 'Status and remarks', ['Deceased/Retired/Absconding etc', 'Remarks']],
    ['reference', 'From the posting list and gradation list (read only)', ['Posting List Match', 'Name in Posting List',
      'Posting List: Circle / Division', 'Posting List Remarks', 'Home District (as in Gradation)', 'Remarks in Gradation List']],
  ];
  const HIDDEN = ['Employee ID', 'Verification', 'Last Updated On', 'Last Updated By'];   // shown in the header instead

  function sections(schema) {
    const names = schema.map(f => f.name), used = new Set(HIDDEN);
    const out = SECTIONS.map(([id, title, list]) => {
      const fs = list.filter(n => names.includes(n));
      fs.forEach(n => used.add(n));
      return { id, title, fields: fs };
    });
    const rest = names.filter(n => !used.has(n));
    if (rest.length) out.find(s => s.id === 'service').fields.push(...rest);
    return out.filter(s => s.fields.length);
  }

  // dd-mm-yyyy -> Date
  const toDate = s => { const m = /^(\d{2})-(\d{2})-(\d{4})/.exec(s || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
  const yearsSince = s => { const d = toDate(s); return d ? Math.max(0, (Date.now() - d) / (365.25 * 864e5)) : null; };
  const fmtYears = y => y == null ? '—' : (y < 1 ? Math.round(y * 12) + ' mo' : y.toFixed(1) + ' yrs');

  function tenure(d) {
    const tf = d['Since when in this Range'] ? 'Since when in this Range' : 'Since when in this Beat';
    return {
      postingLabel: tf === 'Since when in this Range' ? 'In present range' : 'In present beat',
      posting: yearsSince(d[tf]), division: yearsSince(d['Division Date']), circle: yearsSince(d['Circle Date']),
      home: !!(d['Home District'] && d['Home District'] === d['District in which Range lies']),
      retireIn: (() => { const r = toDate(d['Date of Retirement']); return r ? (r - Date.now()) / (365.25 * 864e5) : null; })(),
    };
  }

  function initials(name) {
    const w = String(name || '').replace(/\(.*?\)/g, ' ').replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(x => x && !/^(sri|shri|smt|md|dr)$/i.test(x));
    return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
  }
  const cleanName = n => String(n || '').replace(/\s*\(\s*cg\s*\)\s*/ig, ' ').replace(/\s+/g, ' ').trim();

  function needsAttention(d) {
    return d['Posting List Match'] === 'Not present in posting list' || !d['Home District'] || !d['District in which Range lies'] || !d['Present Range / Office'];
  }

  window.UPMC_FIELDS = { label, sections, tenure, fmtYears, initials, cleanName, needsAttention, toDate };
})();
