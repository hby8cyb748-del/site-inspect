// Builds a Word file on the phone. A .docx is a zip of XML files plus images,
// so this writes one directly and works offline with no libraries.
const encoder = new TextEncoder();
const PAGE_WIDTH_CM = 16;
const MAX_IMAGE_HEIGHT_CM = 11;
const EMU_PER_CM = 360000;
const RISK_FILL = { Low: 'C8E6C9', Medium: 'FFE0B2', High: 'FFAB91', Critical: 'EF9A9A' };

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const { name, data } of files) {
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);
    const common = (view, at) => {
      view.setUint16(at, 20, true); // version needed
      view.setUint16(at + 2, 0x0800, true); // UTF-8 names
      view.setUint16(at + 4, 0, true); // stored, no compression
      view.setUint16(at + 6, time, true);
      view.setUint16(at + 8, date, true);
      view.setUint32(at + 10, crc, true);
      view.setUint32(at + 14, data.length, true);
      view.setUint32(at + 18, data.length, true);
      view.setUint16(at + 22, nameBytes.length, true);
    };
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    common(local, 4);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    common(entry, 6);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

const esc = (s) => String(s ?? '')
  .replace(/[^\u0009\u000a\u000d -퟿-�\ud800-\udfff]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const run = (text, bold) =>
  `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const para = (text, style, bold) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${run(text, bold)}</w:p>`;
const bullet = (text) => para(`•  ${text}`);

function cell(xml, width, fill) {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>` +
    `${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}</w:tcPr>${xml}</w:tc>`;
}

function table(rows) {
  const border = (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="9070" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>` +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('') +
    `</w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>` +
    `</w:tblPr><w:tblGrid><w:gridCol w:w="2270"/><w:gridCol w:w="6800"/></w:tblGrid>` +
    rows.map(([label, value, fill]) =>
      `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cell(para(label, null, true), 2270, 'F2F2F2')}${cell(para(value), 6800, fill)}</w:tr>`,
    ).join('') + '</w:tbl><w:p/>';
}

function imageXml(rel, id, { width, height }, label) {
  let w = PAGE_WIDTH_CM;
  let h = (height / width) * w;
  if (h > MAX_IMAGE_HEIGHT_CM) { w *= MAX_IMAGE_HEIGHT_CM / h; h = MAX_IMAGE_HEIGHT_CM; }
  const cx = Math.round(w * EMU_PER_CM);
  const cy = Math.round(h * EMU_PER_CM);
  return `<w:p><w:pPr><w:keepNext/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Photo ${id}" descr="${esc(label)}"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="Photo ${id}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>` +
    `</wp:inline></w:drawing></w:r></w:p>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="25"/></w:rPr></w:style>
</w:styles>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

// photos: [{ number, time, transcript, note, jpeg (Uint8Array), width, height }]
export function buildDocx({ inspection, report, photos, title = 'Safety Inspection Report', heading = 'Findings', appendix = true, notes = [] }) {
  const byNumber = new Map(photos.map((p) => [p.number, p]));
  const media = [];
  const placed = new Set();
  const relFor = (p) => {
    media.push(p);
    return `rIdImg${media.length}`;
  };
  const picture = (p) => imageXml(relFor(p), media.length, p, `Photo ${p.number}`) + para(`Photo ${p.number}`);

  let body = para(title, 'Title');
  body += table([
    ['Site', inspection.site],
    ['Area', inspection.area || '—'],
    ['Inspector', inspection.inspector || '—'],
    ['Date', inspection.date],
  ]);

  if (report.executive_summary) {
    body += para('Summary', 'Heading1');
    for (const line of report.executive_summary.split(/\n+/)) body += para(line);
  }

  if (report.findings.length) {
    body += para(heading, 'Heading1');
    report.findings.forEach((f, i) => {
      body += para(`${i + 1}. ${f.title}`, 'Heading2');
      for (const n of f.photos) {
        const p = byNumber.get(n);
        if (p) { body += picture(p); placed.add(n); }
      }
      const rows = [];
      if (f.risk) rows.push(['Risk rating', f.risk, RISK_FILL[f.risk]]);
      if (f.hazard_type) rows.push(['Hazard type', f.hazard_type]);
      if (f.description) rows.push(['Observation', f.description]);
      if (f.action) rows.push(['Recommended action', f.action]);
      if (f.timeframe) rows.push(['Timeframe', f.timeframe]);
      if (f.source === 'ai_observation') rows.push(['Source', 'AI-suggested from photo, not in inspector notes']);
      if (rows.length) body += table(rows);
    });
  }

  if (report.good_practice?.length) {
    body += para('Good practice observed', 'Heading1');
    body += report.good_practice.map(bullet).join('');
  }
  if (report.next_steps?.length) {
    body += para('Next steps', 'Heading1');
    body += report.next_steps.map(bullet).join('');
  }

  const leftover = photos.filter((p) => !placed.has(p.number));
  if (leftover.length) {
    body += para('Other photos', 'Heading1');
    body += leftover.map(picture).join('');
  }

  const log = photos.filter((p) => p.transcript || p.note).map((p) => [
    `Photo ${p.number} (${p.time})`,
    [p.transcript, p.note].filter(Boolean).join(' — '),
  ]);
  log.push(...notes.map((n) => [n.label, n.text]));
  if (appendix && log.length) {
    body += para('Appendix: inspector notes', 'Heading1');
    body += table(log);
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1418" w:bottom="1134" w:left="1418" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${media.map((_, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${i + 1}.jpg"/>`).join('')}</Relationships>`;

  return zip([
    { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: encoder.encode(ROOT_RELS) },
    { name: 'word/document.xml', data: encoder.encode(documentXml) },
    { name: 'word/styles.xml', data: encoder.encode(STYLES) },
    { name: 'word/_rels/document.xml.rels', data: encoder.encode(docRels) },
    ...media.map((p, i) => ({ name: `word/media/image${i + 1}.jpg`, data: p.jpeg })),
  ]);
}
