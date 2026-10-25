/** Kandidat format rekaman: mp4 dulu (Safari iOS, Chrome baru), lalu webm (Chrome Android lama). */
const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

export function pickMimeType(isSupported: (m: string) => boolean): string | null {
  return MIME_CANDIDATES.find((m) => isSupported(m)) ?? null;
}

export function extFromMime(mime: string): "mp4" | "webm" {
  return mime.startsWith("video/mp4") ? "mp4" : "webm";
}

/** Nama file storage: <tahun>/<bulan>/<resi>_<timestamp>.<ext> (tahun/bulan zona WIB). */
export function buildVideoPath(resi: string, startedAt: number, ext: "mp4" | "webm"): string {
  const wib = new Date(startedAt + 7 * 3_600_000);
  const y = wib.getUTCFullYear();
  const m = String(wib.getUTCMonth() + 1).padStart(2, "0");
  const safe = resi.replace(/[^A-Za-z0-9_-]/g, "") || "RESI";
  return `${y}/${m}/${safe}_${startedAt}.${ext}`;
}

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2).replace(".", ",")} GB`;
}
