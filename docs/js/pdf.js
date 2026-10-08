// Officer information sheets (single and whole division) built with pdfmake.
(function () {
  const F = () => window.UPMC_FIELDS;
  const C = { ink: '#191918', body: '#55534e', subtle: '#6b6a66', faint: '#8f8d88', line: '#ecebe8', border: '#e3e2df', muted: '#f6f5f4',
    sunken: '#f1f0ee', primary: '#0b66c3', green: '#1d6b31', greenSoft: '#dff3e2', violet: '#51308f', violetSoft: '#efe6fb',
    orange: '#8a4510', orangeTint: '#fdf1e5', mainsSoft: '#dfeafb', mainsInk: '#1f4f9e', ifosSoft: '#dcefea', ifosInk: '#155e4d' };
  const STATUS = { verified: ['Verified', C.green, C.greenSoft], pending: ['Awaiting approval', C.violet, C.violetSoft],
    unverified: ['Not verified', C.subtle, C.sunken] };
  const AVATAR = { FR: [C.mainsSoft, C.mainsInk], DFR: [C.ifosSoft, C.ifosInk], FG: [C.sunken, C.ink] };

  let emblem = null;
  async function emblemPng() {
    if (emblem) return emblem;
    const img = new Image(); img.src = 'assets/emblem.svg';
    await img.decode();
    const h = 360, w = Math.round(h * 550 / 876.55);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    return (emblem = cv.toDataURL('image/png'));
  }

  const p2 = n => String(n).padStart(2, '0');
  const stamp = () => { const d = new Date(); return `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const v = x => (x === undefined || x === null || x === '') ? null : String(x);

  function header(img, title) {
    return [
      { image: img, width: 34, alignment: 'center', margin: [0, 0, 0, 4] },
      { text: 'Government of West Bengal', alignment: 'center', bold: true, fontSize: 11, color: C.ink },
      { text: 'Department of Forests · Directorate of Forests', alignment: 'center', fontSize: 8.5, color: C.subtle, margin: [0, 1, 0, 0] },
      { text: title, alignment: 'center', bold: true, fontSize: 14, color: C.ink, margin: [0, 6, 0, 6] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.2, lineColor: C.ink }], margin: [0, 0, 0, 10] },
    ];
  }

  function identity(o) {
    const d = o.data, [bg, fg] = AVATAR[o.cadre] || AVATAR.FG, [st, sc, sb] = STATUS[o.status] || STATUS.unverified;
    return {
      table: { widths: [46, '*', 'auto'], body: [[
        { stack: [{ canvas: [{ type: 'ellipse', x: 21, y: 21, r1: 21, r2: 21, color: bg }] },
          { text: F().initials(d.Name), bold: true, fontSize: 14, color: fg, alignment: 'center', relativePosition: { x: 0, y: -29 }, width: 42 }], margin: [2, 2, 0, 0] },
        { stack: [
          { text: F().cleanName(d.Name), bold: true, fontSize: 17, color: C.ink },
          { text: [{ text: d.Designation || o.cadre, bold: true, color: C.body }, '  ·  HRMS ID ', { text: o.id, bold: true, color: C.ink }], fontSize: 9.5, color: C.subtle, margin: [0, 3, 0, 0] },
          { text: `${d.Division || ''} division  ·  ${d.Circle || ''} circle`, fontSize: 9.5, color: C.subtle, margin: [0, 2, 0, 0] },
        ] },
        { table: { body: [[{ text: st, bold: true, fontSize: 9, color: sc, fillColor: sb, margin: [8, 3, 8, 3] }]] }, layout: 'noBorders', margin: [0, 4, 0, 0] },
      ]] },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => C.muted, paddingLeft: () => 10, paddingRight: () => 10, paddingTop: () => 10, paddingBottom: () => 10 },
      margin: [0, 0, 0, 8],
    };
  }

  function tenure(o) {
    const t = F().tenure(o.data), y = F().fmtYears;
    const box = (label, value, warn) => ({ stack: [{ text: label, fontSize: 8, color: warn ? C.orange : C.subtle }, { text: value, fontSize: 12, bold: true, color: warn ? C.orange : C.ink, margin: [0, 1, 0, 0] }],
      fillColor: warn ? C.orangeTint : '#ffffff', margin: [8, 5, 8, 5] });
    return {
      table: { widths: ['*', '*', '*', '*'], body: [[
        box(t.postingLabel, y(t.posting)), box('In present division', y(t.division)), box('In present circle', y(t.circle)),
        box('Posted in home district', t.home ? 'Yes' : (o.data['Home District'] && o.data['District in which Range lies'] ? 'No' : 'Not known'), t.home)]] },
      layout: { hLineColor: () => C.border, vLineColor: () => C.border, hLineWidth: () => 0.8, vLineWidth: () => 0.8, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
      margin: [0, 0, 0, 4],
    };
  }

  function section(title, fields, d) {
    const cells = fields.map(f => [{ text: F().label(f), fontSize: 7.8, color: C.subtle, margin: [0, 2.4, 0, 2.4] },
      v(d[f]) ? { text: v(d[f]), fontSize: 9, bold: true, color: C.ink, margin: [0, 2.4, 0, 2.4] } : { text: '—', fontSize: 9, color: C.faint, margin: [0, 2.4, 0, 2.4] }]);
    const long = cells.filter((c, i) => ['Remarks', 'Posting List Remarks', 'Remarks in Gradation List'].includes(fields[i]));
    const short = cells.filter((c, i) => !['Remarks', 'Posting List Remarks', 'Remarks in Gradation List'].includes(fields[i]));
    const body = [];
    for (let i = 0; i < short.length; i += 2) body.push([...short[i], ...(short[i + 1] || [{ text: '' }, { text: '' }])]);
    long.forEach(c => body.push([c[0], Object.assign({}, c[1], { colSpan: 3 }), {}, {}]));
    if (!body.length) return [];
    return [
      { text: title, bold: true, fontSize: 9.5, color: C.ink, margin: [0, 8, 0, 2] },
      { table: { widths: [96, '*', 96, '*'], body },
        layout: { hLineWidth: (i) => i === 0 ? 0 : 0.6, vLineWidth: () => 0, hLineColor: () => C.line, paddingLeft: (i) => i % 2 ? 6 : 0, paddingRight: () => 6, paddingTop: () => 0, paddingBottom: () => 0 } },
    ];
  }

  function verifiedBy(o) {
    const d = o.data, ok = d.Verification === 'Verified - All correct' || d.Verification === 'Corrected';
    const who = ok && d['Last Updated By'] ? d['Last Updated By'] : '';
    return {
      unbreakable: true, margin: [0, 14, 0, 0],
      columns: [
        { width: '*', stack: [
          { text: 'Verified by', bold: true, fontSize: 10, color: C.ink },
          { canvas: [{ type: 'line', x1: 0, y1: 22, x2: 220, y2: 22, lineWidth: 0.8, lineColor: C.ink }] },
          { text: who ? who.split(' · ')[0] : 'Name and designation', fontSize: 9, color: who ? C.ink : C.faint, bold: !!who, margin: [0, 4, 0, 0] },
          { text: who ? (who.split(' · ')[1] || '') : '', fontSize: 8, color: C.subtle },
          { text: 'Date: ' + (ok && d['Last Updated On'] ? d['Last Updated On'] : '____________'), fontSize: 8.5, color: C.body, margin: [0, 3, 0, 0] },
        ] },
        { width: 200, stack: [
          { text: 'Verification status', fontSize: 8, color: C.subtle, alignment: 'right' },
          { text: (STATUS[o.status] || STATUS.unverified)[0], bold: true, fontSize: 11, color: (STATUS[o.status] || STATUS.unverified)[1], alignment: 'right', margin: [0, 2, 0, 0] },
          o.pending && o.pending.length ? { text: `${o.pending.length} change(s) awaiting approval are not shown`, fontSize: 7.5, color: C.violet, alignment: 'right', margin: [0, 2, 0, 0] } : '',
        ] },
      ],
    };
  }

  function officerPage(o, schema, img) {
    const secs = F().sections(schema).filter(s => s.id !== 'reference');
    const content = [...header(img, 'Officer information sheet'), identity(o), tenure(o)];
    secs.forEach(s => content.push(...section(s.title, s.fields.filter(f => !['Name', 'Circle', 'Division', 'Designation'].includes(f)), o.data)));
    content.push(verifiedBy(o));
    return content;
  }

  function doc(content, footerText) {
    return {
      pageSize: 'A4', pageMargins: [40, 34, 40, 46], content,
      defaultStyle: { font: 'Roboto', fontSize: 9.5, color: C.body, lineHeight: 1.15 },
      footer: (page, pages) => ({ margin: [40, 14, 40, 0], columns: [
        { text: footerText + '  ·  Generated ' + stamp(), fontSize: 7.5, color: C.faint },
        { text: `Page ${page} of ${pages}`, fontSize: 7.5, color: C.faint, alignment: 'right' }] }),
      info: { title: footerText, author: 'Directorate of Forests, West Bengal', creator: 'UPMC2' },
    };
  }

  const safe = s => String(s || '').replace(/\(.*?\)/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');

  async function officer(o, schema) {
    const img = await emblemPng();
    const name = `${o.id}_${safe(F().cleanName(o.data.Name))}.pdf`;
    window.pdfMake.createPdf(doc(officerPage(o, schema, img), 'UPMC2 · Officer information sheet')).download(name);
    return name;
  }

  async function division(list, schemaByCadre, circle, div, onProgress) {
    const img = await emblemPng();
    const counts = { verified: 0, pending: 0, unverified: 0 };
    list.forEach(o => counts[o.status] = (counts[o.status] || 0) + 1);
    const byCadre = {}; list.forEach(o => byCadre[o.cadre] = (byCadre[o.cadre] || 0) + 1);
    const cover = [
      ...header(img, 'Division information sheets'),
      { text: div, fontSize: 24, bold: true, color: C.ink, alignment: 'center', margin: [0, 6, 0, 2] },
      { text: `${circle} circle  ·  ${list.length} officers`, fontSize: 11, color: C.subtle, alignment: 'center', margin: [0, 0, 0, 16] },
      { table: { widths: ['*', '*', '*', '*'], body: [[
        ...[['Officers', list.length, C.ink], ['Verified', counts.verified, C.green], ['Awaiting approval', counts.pending, C.violet], ['Not verified', counts.unverified, C.subtle]]
          .map(([l, n, c]) => ({ stack: [{ text: l, fontSize: 8.5, color: C.subtle }, { text: String(n), fontSize: 20, bold: true, color: c }], margin: [10, 8, 10, 8] }))]] },
        layout: { hLineColor: () => C.border, vLineColor: () => C.border, hLineWidth: () => 0.8, vLineWidth: () => 0.8 }, margin: [0, 0, 0, 16] },
      { text: 'Index', bold: true, fontSize: 11, color: C.ink, margin: [0, 0, 0, 6] },
      { table: { headerRows: 1, widths: [34, '*', 52, 78, 92, 34], body: [
        ['Sheet', 'Name', 'Desig.', 'HRMS ID', 'Status', 'Page'].map(t => ({ text: t, bold: true, fontSize: 8.5, color: '#ffffff', fillColor: C.ink, margin: [4, 4, 4, 4] })),
        ...list.map((o, i) => [String(i + 1), F().cleanName(o.data.Name), o.data.Designation || o.cadre, o.id, (STATUS[o.status] || STATUS.unverified)[0], String(i + 2)]
          .map((t, j) => ({ text: t, fontSize: 8.5, color: j === 4 ? (STATUS[o.status] || STATUS.unverified)[1] : C.ink, bold: j === 1 || j === 4, margin: [4, 3, 4, 3] })))] },
        layout: { hLineWidth: (i) => i < 2 ? 0 : 0.5, vLineWidth: () => 0, hLineColor: () => C.line, fillColor: (i) => i > 0 && i % 2 === 0 ? '#fbfbfa' : null } },
    ];
    const content = [...cover];
    for (let i = 0; i < list.length; i++) {
      const page = officerPage(list[i], schemaByCadre[list[i].cadre], img);
      page[0] = Object.assign({}, page[0], { pageBreak: 'before' });
      content.push(...page);
      if (onProgress && i % 5 === 0) { onProgress((i + 1) / list.length); await new Promise(r => setTimeout(r, 0)); }
    }
    const plain = x => String(x || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const name = `${plain(div)}_${plain(circle)}_officers_${stamp().slice(0, 10).replace(/-/g, '')}.pdf`;
    await new Promise(res => window.pdfMake.createPdf(doc(content, `UPMC2 · ${div} division`)).download(name, res));
    return name;
  }

  window.UPMC_PDF = { officer, division, _doc: doc, _officerPage: officerPage, emblemPng };
})();
