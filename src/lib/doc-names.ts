import { fmtDate } from "@/lib/format";

/**
 * Nama dokumen yang mudah dibaca untuk file PDF / judul pop-up / bagikan, mis.
 *   "Surat Jalan Pengiriman Kain GKS 12 Nov 2026"
 *   "PO Jahit Anang Batch 3 12 Nov 2026"
 *   "Bukti Penerimaan Barang GKS Batch 3 12 Nov 2026"
 */

/** Kata depan yang dibuang dari nama vendor supaya singkat: "Konveksi Pak Anang" → "Anang". */
const VENDOR_PREFIX = /^(konveksi|konfeksi|penjahit|jahit|cv\.?|pt\.?|ud\.?|toko|pak|bapak|bu|ibu|mas|mbak)\s+/i;

export function shortVendor(name: string | null | undefined): string {
  let n = (name ?? "").trim();
  for (let i = 0; i < 3 && VENDOR_PREFIX.test(n); i++) {
    const next = n.replace(VENDOR_PREFIX, "").trim();
    if (!next) break;
    n = next;
  }
  return n;
}

/** "3" → "Batch 3"; "Batch 3" tetap; kosong → "" */
export function batchLabel(batch: string | null | undefined): string {
  const b = (batch ?? "").trim();
  if (!b) return "";
  return /^batch\b/i.test(b) ? b.replace(/^batch/i, "Batch") : `Batch ${b}`;
}

/** Gabung bagian yang terisi, buang karakter yang tidak boleh di nama file. */
function join(...parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const day = (iso: string | null | undefined) => (iso ? fmtDate(iso) : "");

export function suratJalanName(sj: { vendor_name: string | null | undefined; ship_date: string }): string {
  return join("Surat Jalan Pengiriman Kain", shortVendor(sj.vendor_name), day(sj.ship_date));
}

export function poName(po: { vendor_name: string | null | undefined; batch?: string | null; po_date: string }): string {
  return join("PO Jahit", shortVendor(po.vendor_name), batchLabel(po.batch), day(po.po_date));
}

export function receiptName(r: {
  vendor_name: string | null | undefined;
  batch?: string | null;
  doc_date: string;
}): string {
  return join("Bukti Penerimaan Barang", shortVendor(r.vendor_name), batchLabel(r.batch), day(r.doc_date));
}
