/**
 * Helper parsing & normalisasi untuk upload Excel/CSV (Bagian 10 spec).
 * Fungsi di file ini murni (tanpa DOM) kecuali `readSpreadsheet`, supaya mudah diuji.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Nama header dinormalisasi: huruf kecil, tanpa spasi/underscore. "Ref Batch" → "refbatch" */
export function normalizeHeader(value: unknown): string {
  return cellText(value).toLowerCase().replace(/[\s_]+/g, "");
}

/** Normalisasi nilai pilihan (Tipe, Channel): huruf kecil, hanya huruf & angka. "TikTok Shop" → "tiktokshop" */
export function normalizeKey(value: unknown): string {
  return cellText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Ubah nilai sel (string, angka, Date, rich text, hyperlink, formula) menjadi teks yang di-trim. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  if (isObject(value)) {
    if (Array.isArray(value.richText)) {
      return (value.richText as { text?: string }[])
        .map((r) => r.text ?? "")
        .join("")
        .trim();
    }
    if ("result" in value) return cellText(value.result);
    if ("text" in value) return cellText(value.text);
    if ("error" in value) return "";
  }
  return String(value).trim();
}

/** Nilai mentah sel (Date/angka dipertahankan) — membuka formula & rich text. */
export function cellValue(value: unknown): unknown {
  if (isObject(value) && !(value instanceof Date)) {
    if ("result" in value) return cellValue(value.result);
    if (Array.isArray(value.richText) || "text" in value) return cellText(value);
    if ("error" in value) return null;
  }
  return value;
}

export function isBlank(value: unknown): boolean {
  return cellText(value) === "";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Validasi tanggal kalender dan format `yyyy-mm-dd`. */
export function toIsoDate(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Serial tanggal Excel (sistem 1900) → `yyyy-mm-dd`. 45947 → 2025-10-17 */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 61 || serial > 2958465) return null;
  const ms = Math.round((Math.floor(serial) - 25569) * 86400000);
  const dt = new Date(ms);
  return toIsoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Parse tanggal dari sel Excel/CSV. Menerima:
 * - Date (sel bertipe tanggal; exceljs menyimpan tanggal kalender sebagai UTC tengah malam)
 * - Angka serial Excel (mis. 45947)
 * - Teks `yyyy-mm-dd`, `yyyy/mm/dd`, `dd/mm/yyyy`, `dd-mm-yyyy`, `dd.mm.yyyy` (tahun 2 digit → 20xx)
 */
export function parseDateCell(value: unknown): string | null {
  const v = cellValue(value);
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return toIsoDate(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  if (typeof v === "number") return excelSerialToIso(v);
  const s = cellText(v);
  if (!s) return null;
  // ISO dengan jam (mis. "2026-10-17T00:00:00") → ambil bagian tanggal
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:\s.*)?$/.exec(s);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return toIsoDate(year, Number(m[2]), Number(m[1]));
  }
  if (/^\d+(\.\d+)?$/.test(s)) return excelSerialToIso(Number(s));
  return null;
}

/**
 * Parse qty bilangan bulat > 0. Menerima angka, teks "45", "1.000" (pemisah ribuan Indonesia), "45,0".
 * Mengembalikan null jika bukan bilangan bulat positif.
 */
export function parsePositiveInt(value: unknown): number | null {
  const v = cellValue(value);
  if (typeof v === "number") return Number.isInteger(v) && v > 0 ? v : null;
  const s = cellText(v).replace(/\s+/g, "");
  if (!s) return null;
  let n: number | null = null;
  if (/^\d+$/.test(s)) n = Number(s);
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) n = Number(s.replace(/\./g, "")); // "1.000" = seribu (format id-ID)
  else if (/^\d{1,3}(,\d{3})+$/.test(s)) n = Number(s.replace(/,/g, "")); // "1,000" (format en-US)
  else if (/^\d+[.,]0+$/.test(s)) n = Number(s.split(/[.,]/)[0]); // "45,0"
  if (n === null || !Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Parse nominal rupiah ≥ 0 (Harga Pokok). Menerima angka, "85000", "85.000", "Rp 85.000", "85.000,50".
 * Kosong → null; tidak valid → NaN.
 */
export function parseMoney(value: unknown): number | null {
  const v = cellValue(value);
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : Number.NaN;
  let s = cellText(v).replace(/rp\.?/i, "").replace(/\s+/g, "");
  if (!s) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d+,\d+$/.test(s)) s = s.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return Number.NaN;
  return Number(s);
}

/**
 * Parse teks CSV (RFC 4180: tanda kutip, koma/titik-koma di dalam kutip, CRLF).
 * Delimiter dideteksi otomatis dari baris pertama (`,` `;` atau tab).
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const counts = { ",": 0, ";": 0, "\t": 0 } as Record<string, number>;
  let inQ = false;
  for (const ch of firstLine) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch]++;
  }
  const [bestDelim, bestCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const delim = bestCount > 0 ? bestDelim : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export interface HeaderSpec<K extends string> {
  key: K;
  /** Nama kolom di template */
  label: string;
  /** Nama alternatif (sudah dinormalisasi) */
  aliases?: string[];
  required?: boolean;
}

/**
 * Cocokkan baris header dengan spesifikasi kolom (case-insensitive, abaikan spasi).
 * Mengembalikan index kolom per key dan daftar kolom wajib yang tidak ditemukan.
 */
export function matchHeaders<K extends string>(
  header: unknown[],
  specs: HeaderSpec<K>[],
): { index: Partial<Record<K, number>>; missing: string[] } {
  const normalized = header.map(normalizeHeader);
  const index: Partial<Record<K, number>> = {};
  for (const spec of specs) {
    const names = [normalizeHeader(spec.label), ...(spec.aliases ?? [])];
    const i = normalized.findIndex((h) => h !== "" && names.includes(h));
    if (i >= 0) index[spec.key] = i;
  }
  const missing = specs.filter((s) => s.required && index[s.key] === undefined).map((s) => s.label);
  return { index, missing };
}

/** Baris mentah sheet: setiap sel nilai mentah (string/angka/Date/objek exceljs). */
export type RawGrid = unknown[][];

/** Baca sheet pertama dari file .xlsx atau .csv di browser. Baris kosong dibuang. */
export async function readSpreadsheet(file: File): Promise<RawGrid> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    return parseCsv(await file.text());
  }
  if (!name.endsWith(".xlsx")) throw new Error("Format file harus .xlsx atau .csv");
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error("File Excel tidak bisa dibaca. Pastikan formatnya .xlsx (bukan .xls lama).");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("File tidak berisi sheet");
  const grid: RawGrid = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    const cells = Array.from({ length: values.length }, (_, i) => values[i] ?? null);
    if (cells.some((c) => !isBlank(c))) grid.push(cells);
  });
  return grid;
}
