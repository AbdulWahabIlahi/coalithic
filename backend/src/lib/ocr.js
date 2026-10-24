import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

// Feature 5 — OCR document auto-fill. Wraps the system `tesseract` (images) and
// `pdftotext` (text-layer PDFs) binaries; no native npm deps. Both are optional
// at runtime — a missing binary yields a clear 503 instead of a crash.

let binariesChecked = false;
let binaries = { tesseract: false, pdftotext: false };

export function ocrAvailable() {
  if (!binariesChecked) {
    binaries = {
      tesseract: spawnSync("tesseract", ["--version"], { stdio: "ignore" }).status === 0,
      pdftotext: spawnSync("pdftotext", ["-v"], { stdio: "ignore" }).status === 0,
    };
    binariesChecked = true;
  }
  return binaries;
}

export class OcrUnavailableError extends Error {
  constructor(tool) {
    super(`${tool} is not installed on the server — install it to enable OCR extraction`);
    this.status = 503;
  }
}

// Debian packages eng.traineddata separately from the binary, and conda installs
// it under its own prefix — locate a usable tessdata dir once, then pass it in.
let tesseractEnv;
function resolveTesseractEnv() {
  if (!tesseractEnv) {
    const candidates = [
      process.env.TESSDATA_PREFIX,
      "/usr/share/tessdata",
      "/usr/local/share/tessdata",
      `${homedir()}/miniconda3/share/tessdata`,
      `${homedir()}/anaconda3/share/tessdata`,
      `${homedir()}/.local/share/tessdata`,
    ].filter(Boolean);
    const dir = candidates.find((d) => existsSync(`${d}/eng.traineddata`));
    tesseractEnv = dir ? { ...process.env, TESSDATA_PREFIX: dir } : { ...process.env };
  }
  return tesseractEnv;
}

export function extractText(buffer, mime, filename = "") {
  const isPdf =
    mime === "application/pdf" || filename.toLowerCase().endsWith(".pdf") ||
    buffer.subarray(0, 5).toString() === "%PDF-";

  if (isPdf) {
    if (!ocrAvailable().pdftotext) throw new OcrUnavailableError("pdftotext");
    const result = spawnSync("pdftotext", ["-layout", "-", "-"], {
      input: buffer,
      maxBuffer: 32 * 1024 * 1024,
    });
    if (result.status !== 0) {
      throw Object.assign(new Error("failed to extract text from PDF"), { status: 422 });
    }
    return result.stdout.toString("utf8");
  }

  if (!["image/jpeg", "image/png", "image/webp", "image/tiff"].includes(mime)) {
    throw Object.assign(new Error("unsupported file type — send a PDF or an image"), { status: 415 });
  }
  if (!ocrAvailable().tesseract) throw new OcrUnavailableError("tesseract");

  const result = spawnSync("tesseract", ["stdin", "stdout", "--psm", "6"], {
    input: buffer,
    maxBuffer: 32 * 1024 * 1024,
    env: resolveTesseractEnv(),
  });
  if (result.status !== 0) {
    throw Object.assign(new Error("OCR failed on the uploaded image"), { status: 422 });
  }
  return result.stdout.toString("utf8");
}

// ---------------------------------------------------------------------------
// Structured field extraction from raw OCR/extracted text.

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";

function parseDate(text) {
  // 14-03-2026 / 14/03/2026 / 14.03.2026
  let m = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // 14 March 2026 / 14-Mar-2026
  m = text.match(new RegExp(`\\b(\\d{1,2})[\\s-]+(${MONTHS})[\\s,-]+(\\d{4})\\b`, "i"));
  if (m) {
    const idx = MONTHS.split("|").findIndex((mo) =>
      mo === m[2].toLowerCase() || mo === m[2].toLowerCase().slice(0, 3),
    );
    const month = (idx >= 0 ? idx % 12 : 0) + 1;
    return `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  // March 14, 2026
  m = text.match(new RegExp(`\\b(${MONTHS})[\\s]+(\\d{1,2})[a-z]{0,2}[\\s,]+(\\d{4})\\b`, "i"));
  if (m) {
    const idx = MONTHS.split("|").findIndex((mo) =>
      mo === m[1].toLowerCase() || mo === m[1].toLowerCase().slice(0, 3),
    );
    const month = (idx >= 0 ? idx % 12 : 0) + 1;
    return `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

// OCR lines run together once flattened — strip trailing form labels from name captures.
function cleanLabel(s) {
  if (!s) return null;
  const cleaned = s
    .replace(/\s+(?:mine\s+id|mine|id|name|date|valid|registration|serial|no|certificate)\b.*$/i, "")
    .trim();
  if (/^(?:mine|mine\s+id|id|name|date|no|serial)$/i.test(cleaned)) return null;
  return cleaned.length > 1 ? cleaned : null;
}

export function parseCertificate(rawText) {
  const text = rawText.replace(/\r/g, "");
  const flat = text.replace(/\n+/g, " ");

  let document_type = "document";
  if (/dgms/i.test(text)) document_type = "DGMS certificate";
  else if (/licence|license/i.test(text)) document_type = "statutory licence";
  else if (/environment|emission|effluent/i.test(text)) document_type = "environmental report";
  else if (/safety|inspection/i.test(text)) document_type = "safety inspection sheet";
  else if (/contractor|registration/i.test(text)) document_type = "contractor certificate";

  const mineId = flat.match(/\bM-\d{3}\b/i)?.[0]?.toUpperCase() ?? null;
  const mineName = cleanLabel(
    flat.match(/\bmine\s+(?:name\s*)?[:\-]?\s*([A-Z][A-Za-z]+(?:\s+[A-Za-z]+){0,3})/i)?.[1] ?? null,
  );

  let contractor_name = cleanLabel(
    flat.match(/contractor(?:\s+name)?\s*[:\-]\s*([A-Z][A-Za-z&.\- ]{2,60})/i)?.[1] ?? null,
  );
  if (!contractor_name) {
    contractor_name = cleanLabel(
      flat.match(/\b([A-Z][A-Za-z]+(?:\s+[A-Za-z]+){0,3}\s+(?:Mining Services|Earth Movers|Industries|Industrial Works|Haulage))\b/)?.[1] ?? null,
    );
  }

  const valid_from = (() => {
    const m = flat.match(/(?:valid\s+from|issued?\s+on|date\s+of\s+issue)\s*[:\-]?\s*([^\n]{4,30})/i);
    return m ? parseDate(m[1]) : null;
  })();
  const expires_on = (() => {
    const m = flat.match(/(?:valid\s+up\s*to|valid\s+to|expiry(?:\s+date)?|expires?|valid\s+until)\s*[:\-]?\s*([^\n]{4,30})/i);
    return m ? parseDate(m[1]) : null;
  })();

  // Fallback: any date in the doc — later date treated as expiry.
  const allDates = [...flat.matchAll(new RegExp(`\\b(?:\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{4}|\\d{1,2}[\\s-]+(?:${MONTHS})[\\s,-]+\\d{4})\\b`, "gi"))]
    .map((m) => parseDate(m[0]))
    .filter(Boolean)
    .sort();
  const fallbackStart = allDates[0] ?? null;
  const fallbackExpiry = allDates.length > 1 ? allDates[allDates.length - 1] : null;

  let category = "safety";
  if (/environment|emission|effluent|pollution/i.test(text)) category = "environment";
  else if (/labour|labor|wage|contract labour/i.test(text)) category = "labour";
  else if (/equipment|machinery|hoist|conveyor|crane/i.test(text)) category = "equipment";

  return {
    document_type,
    category,
    mine_id: mineId,
    mine_name: mineName,
    contractor_name,
    valid_from: valid_from ?? fallbackStart,
    expires_on: expires_on ?? fallbackExpiry,
    title: `${document_type}${contractor_name ? ` · ${contractor_name}` : ""}`,
  };
}
