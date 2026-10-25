"use server";

import { formatInTimeZone } from "date-fns-tz";
import { createClient } from "@/lib/supabase/server";
import { TIMEZONE } from "@/lib/format";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Signed URL (10 menit) untuk memutar / mengunduh video packing. Akses dicek RLS pack_records + storage. */
export async function getPackVideoUrl(recordId: string, download: boolean): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient();
  const { data: rec, error } = await supabase
    .from("pack_records")
    .select("resi, started_at, video_path, video_deleted_at")
    .eq("id", recordId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!rec) return { ok: false, error: "Rekaman tidak ditemukan" };
  if (rec.video_deleted_at) return { ok: false, error: "Video sudah dihapus (kedaluwarsa)" };
  if (!rec.video_path) return { ok: false, error: "Video belum terupload" };

  const ext = rec.video_path.split(".").pop() ?? "mp4";
  const filename = `${rec.resi}_${formatInTimeZone(new Date(rec.started_at), TIMEZONE, "yyyyMMdd-HHmm")}.${ext}`;
  const { data, error: signErr } = await supabase.storage
    .from("pack-videos")
    .createSignedUrl(rec.video_path, 600, download ? { download: filename } : undefined);
  if (signErr || !data) return { ok: false, error: signErr?.message ?? "Gagal membuat link video" };
  return { ok: true, data: { url: data.signedUrl } };
}
