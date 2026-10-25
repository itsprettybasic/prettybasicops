/**
 * Aturan scan resi (murni, tanpa kamera) supaya bisa dites:
 * - kode yang sama dibaca berkali-kali dalam jeda cooldown → diabaikan
 * - saat merekam, resi lain → ditolak dengan pesan
 * - resi yang sama sebelum durasi minimal → diabaikan (bacaan ganda)
 * - resi yang sama setelah durasi minimal → selesai
 */

export const SCAN_COOLDOWN_MS = 2500;

export type ScanPhase = { phase: "idle" } | { phase: "recording"; resi: string; startedAt: number };

export interface ScanMemory {
  lastCode: string | null;
  lastAt: number;
}

export type ScanDecision =
  | { type: "ignore"; reason: "invalid" | "cooldown" | "too_soon" }
  | { type: "start"; resi: string }
  | { type: "finish"; resi: string }
  | { type: "reject"; resi: string; message: string };

/** Rapikan hasil scan jadi nomor resi: huruf besar, tanpa spasi. Null kalau bukan format resi. */
export function normalizeResi(raw: string): string | null {
  const v = raw.trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-Z0-9_-]{6,40}$/.test(v) ? v : null;
}

export function decideScan(
  state: ScanPhase,
  raw: string,
  now: number,
  memory: ScanMemory,
  cfg: { minDurationSec: number; cooldownMs?: number },
): ScanDecision {
  const resi = normalizeResi(raw);
  if (!resi) return { type: "ignore", reason: "invalid" };
  if (memory.lastCode === resi && now - memory.lastAt < (cfg.cooldownMs ?? SCAN_COOLDOWN_MS)) {
    return { type: "ignore", reason: "cooldown" };
  }
  if (state.phase === "idle") return { type: "start", resi };
  if (resi !== state.resi) {
    return { type: "reject", resi, message: `Masih merekam ${state.resi}. Selesaikan paket ini dulu.` };
  }
  if (now - state.startedAt < cfg.minDurationSec * 1000) return { type: "ignore", reason: "too_soon" };
  return { type: "finish", resi };
}

/** Ingat kode terakhir untuk cooldown. Dipanggil untuk setiap kode valid yang terbaca. */
export function rememberScan(raw: string, now: number): ScanMemory {
  return { lastCode: normalizeResi(raw), lastAt: now };
}

export interface ResiHistory {
  record_count: number;
  last_finished_at: string | null;
  last_packer_name: string | null;
}

/** Perlu tampilkan peringatan duplikat? */
export function needsDuplicateWarning(history: ResiHistory | null, enabled: boolean): boolean {
  return enabled && !!history && history.record_count > 0;
}
