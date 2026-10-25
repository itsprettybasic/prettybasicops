const DAY_MS = 86_400_000;

/** Sama dengan pack_expiry() di database: jam selesai + lama simpan. */
export function computeExpiry(finishedAt: Date, retentionDays: number): Date {
  return new Date(finishedAt.getTime() + retentionDays * DAY_MS);
}

/** Sisa hari (dibulatkan ke atas) sebelum video terhapus. 0 = hari ini / sudah lewat. */
export function daysLeft(expiresAt: string | Date, now: Date = new Date()): number {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / DAY_MS);
}

export type VideoState = "none" | "uploading" | "available" | "expired";

export function videoState(r: {
  status: string;
  video_path: string | null;
  video_deleted_at: string | null;
}): VideoState {
  if (r.video_deleted_at) return "expired";
  if (r.video_path) return "available";
  if (r.status === "dibatalkan") return "none";
  return "uploading";
}
