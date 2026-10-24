// Feature 7 — minimal dependency-free PDF writer for the statutory exports.
// Produces a valid PDF 1.4 with standard Helvetica/Courier fonts (no embeds):
// a titled, paginated table. Text is mapped to WinAnsi — the encoding the
// standard fonts use — so °C-style symbols survive and everything else falls
// back to '?'.

const PAGE_W = 595; // A4 portrait, points
const PAGE_H = 842;
const MARGIN_X = 40;
const MARGIN_BOTTOM = 56;
const TOP_Y = 800;
const ROW_STEP = 12;
const ROWS_PER_PAGE = 54;

// Typographic characters that standard 14 fonts render via WinAnsi codepoints
// (they sit above 0xFF in Unicode but at specific single bytes in WinAnsi).
const WINANSI_EXTRA = {
  0x2014: 0x97, // — em dash
  0x2013: 0x96, // – en dash
  0x2018: 0x91, // ‘ left single quote
  0x2019: 0x92, // ’ right single quote
  0x201c: 0x93, // “ left double quote
  0x201d: 0x94, // ” right double quote
  0x2022: 0x95, // • bullet
  0x2026: 0x85, // … ellipsis
  0x2192: 0x3e, // → has no WinAnsi glyph; degrade to '>'
  0x2190: 0x3c, // ← degrade to '<'
};

function escapePdfText(text) {
  let out = "";
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (ch === "\\") out += "\\\\";
    else if (ch === "(") out += "\\(";
    else if (ch === ")") out += "\\)";
    else if (code >= 0x20 && code <= 0x7e) out += ch;
    else if (WINANSI_EXTRA[code] !== undefined) out += String.fromCharCode(WINANSI_EXTRA[code]);
    else if (code <= 0xff) out += String.fromCharCode(code); // WinAnsi range
    else out += "?";
  }
  return out;
}

function textOp(x, y, font, size, text) {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET\n`;
}

function pageContent(lines) {
  return lines.join("");
}

/**
 * @param {{ title: string, subtitle?: string,
 *   columns: { label: string, x: number, width: number }[],
 *   rows: string[][], footer?: string }} spec
 *   x/width are Courier character units (6 pt per char at size 10).
 */
export function buildTablePdf({ title, subtitle = "", columns, rows, footer = "" }) {
  const pages = [];
  for (let start = 0; start < Math.max(rows.length, 1); start += ROWS_PER_PAGE) {
    const slice = rows.slice(start, start + ROWS_PER_PAGE);
    const pageNo = pages.length + 1;
    const parts = [];
    parts.push(textOp(MARGIN_X, TOP_Y, "F1", 15, title));
    if (subtitle) parts.push(textOp(MARGIN_X, TOP_Y - 18, "F3", 9, subtitle));

    let y = TOP_Y - 44;
    const header = columns.map((c) => textOp(MARGIN_X + c.x * 6, y, "F2", 8, c.label)).join("");
    parts.push(header);
    parts.push(`0.6 w ${MARGIN_X} ${y - 4} m ${PAGE_W - MARGIN_X} ${y - 4} l S\n`);
    y -= ROW_STEP + 4;

    for (const row of slice) {
      const line = columns
        .map((c, i) => {
          const cell = String(row[i] ?? "");
          return textOp(MARGIN_X + c.x * 6, y, "F2", 8, cell.slice(0, c.width).padEnd(c.width));
        })
        .join("");
      parts.push(line);
      y -= ROW_STEP;
    }

    const foot = footer || `Generated ${new Date().toISOString()} · CoalSmart`;
    parts.push(textOp(MARGIN_X, MARGIN_BOTTOM, "F3", 8, `${foot} · page ${pageNo}`));
    pages.push(pageContent(parts));
  }

  return assemble(pages, rows.length);
}

function assemble(pageStreams, totalRows) {
  // Object plan: 1 catalog, 2 pages, 3/4/5 fonts, then (page, content) pairs.
  const objects = [];
  const kids = [];
  let nextId = 6;

  for (const stream of pageStreams) {
    const pageId = nextId++;
    const contentId = nextId++;
    kids.push(`${pageId} 0 R`);
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>`;
    const bytes = Buffer.byteLength(stream, "latin1");
    objects[contentId] = { dict: `<< /Length ${bytes} >>`, stream };
  }

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>";
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

  const chunks = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets = [0];
  let cursor = chunks[0].length;
  const total = objects.length - 1;

  for (let id = 1; id <= total; id++) {
    const obj = objects[id];
    if (!obj) continue;
    offsets[id] = cursor;
    let body;
    if (typeof obj === "string") {
      body = `${id} 0 obj\n${obj}\nendobj\n`;
    } else {
      body = `${id} 0 obj\n${obj.dict}\nstream\n${obj.stream}endstream\nendobj\n`;
    }
    const buf = Buffer.from(body, "latin1");
    chunks.push(buf);
    cursor += buf.length;
  }

  const xrefStart = cursor;
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= total; id++) {
    xref += `${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${total + 1} /Root 1 0 R /Info << /Title (CoalSmart statutory report) /Subject (${totalRows} rows) >> >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "latin1"));

  return Buffer.concat(chunks);
}
