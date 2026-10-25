// Job harian: hapus file video yang sudah kedaluwarsa, catatan paket tetap disimpan.
// Dipanggil pg_cron (header x-cron-secret) atau admin/supervisor dari halaman Pengaturan (JWT user).
// Aman dijalankan berulang: hanya memproses baris yang video_deleted_at masih kosong.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const BUCKET = "pack-videos";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // ── Otorisasi ──
  let source = "cron";
  const secret = req.headers.get("x-cron-secret");
  if (secret) {
    const { data: ok } = await admin.rpc("pack_cron_secret_ok", { p_secret: secret });
    if (!ok) return json({ error: "unauthorized" }, 401);
  } else {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const { data: u } = await admin.auth.getUser(token);
    if (!u.user) return json({ error: "unauthorized" }, 401);
    const { data: p } = await admin.from("profiles").select("role, is_active, full_name").eq("id", u.user.id).single();
    if (!p?.is_active || !["admin", "supervisor"].includes(p.role)) return json({ error: "forbidden" }, 403);
    source = `manual oleh ${p.full_name}`;
  }

  // ── Rekaman yang menggantung "merekam" > 1 hari → terputus ──
  const { data: stale, error: staleErr } = await admin.rpc("pack_mark_stale");
  if (staleErr) return json({ error: staleErr.message }, 500);

  // ── Hapus file kedaluwarsa per 100 ──
  let deleted = 0;
  const errors: string[] = [];
  for (let round = 0; round < 50; round++) {
    const { data: rows, error } = await admin
      .from("pack_records")
      .select("id, video_path")
      .is("video_deleted_at", null)
      .not("video_path", "is", null)
      .lt("video_expires_at", new Date().toISOString())
      .limit(100);
    if (error) {
      errors.push(error.message);
      break;
    }
    if (!rows?.length) break;

    const { error: rmErr } = await admin.storage.from(BUCKET).remove(rows.map((r) => r.video_path as string));
    if (rmErr) {
      errors.push(rmErr.message);
      break;
    }
    // File yang memang sudah tidak ada juga ditandai terhapus, supaya tidak diproses ulang.
    const { error: upErr } = await admin
      .from("pack_records")
      .update({ video_deleted_at: new Date().toISOString() })
      .in("id", rows.map((r) => r.id));
    if (upErr) {
      errors.push(upErr.message);
      break;
    }
    deleted += rows.length;
  }

  const note = [source, ...errors].join(" · ");
  await admin.from("pack_cleanup_runs").insert({ deleted_count: deleted, stale_count: stale ?? 0, note });
  return json({ deleted, stale: stale ?? 0, errors }, errors.length ? 500 : 200);
});
