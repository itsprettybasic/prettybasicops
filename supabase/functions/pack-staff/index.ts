// Kelola akun petugas (khusus admin). Service role hanya ada di Supabase, tidak pernah di Vercel/browser.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const STAFF_EMAIL_DOMAIN = "petugas.prettybasic.id";
const ROLES = ["admin", "supervisor", "petugas"];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: u } = await admin.auth.getUser(token);
  if (!u.user) return json({ error: "Sesi tidak valid, silakan login ulang" }, 401);
  const { data: me } = await admin.from("profiles").select("role, is_active").eq("id", u.user.id).single();
  if (!me?.is_active || me.role !== "admin") return json({ error: "Hanya admin yang bisa mengelola petugas" }, 403);

  const body = await req.json().catch(() => ({}));

  if (body.action === "create") {
    const fullName = String(body.full_name ?? "").trim();
    const username = String(body.username ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const role = String(body.role ?? "petugas");
    if (fullName.length < 2) return json({ error: "Nama minimal 2 huruf" }, 400);
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) return json({ error: "Username 3–30 karakter: huruf kecil, angka, titik, _ atau -" }, 400);
    if (password.length < 8) return json({ error: "Password minimal 8 karakter" }, 400);
    if (!ROLES.includes(role)) return json({ error: "Role tidak valid" }, 400);

    const { data: taken } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
    if (taken) return json({ error: `Username "${username}" sudah dipakai` }, 400);

    const { data: created, error } = await admin.auth.admin.createUser({
      email: `${username}@${STAFF_EMAIL_DOMAIN}`,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !created.user) return json({ error: error?.message ?? "Gagal membuat akun" }, 400);
    const { error: pErr } = await admin
      .from("profiles")
      .insert({ id: created.user.id, full_name: fullName, username, role });
    if (pErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: pErr.message }, 400);
    }
    return json({ id: created.user.id });
  }

  if (body.action === "update") {
    const id = String(body.id ?? "");
    const { data: target } = await admin.from("profiles").select("*").eq("id", id).single();
    if (!target) return json({ error: "Akun tidak ditemukan" }, 404);

    const patch: Record<string, unknown> = {};
    if (typeof body.full_name === "string") {
      if (body.full_name.trim().length < 2) return json({ error: "Nama minimal 2 huruf" }, 400);
      patch.full_name = body.full_name.trim();
    }
    if (typeof body.role === "string") {
      if (!ROLES.includes(body.role)) return json({ error: "Role tidak valid" }, 400);
      patch.role = body.role;
    }
    if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
    if (id === u.user.id && (patch.role && patch.role !== "admin" || patch.is_active === false)) {
      return json({ error: "Tidak bisa menurunkan role atau menonaktifkan akun sendiri" }, 400);
    }

    const authPatch: Record<string, unknown> = {};
    if (typeof body.password === "string" && body.password) {
      if (body.password.length < 8) return json({ error: "Password minimal 8 karakter" }, 400);
      authPatch.password = body.password;
    }
    if (patch.full_name) authPatch.user_metadata = { full_name: patch.full_name };
    if (typeof patch.is_active === "boolean") authPatch.ban_duration = patch.is_active ? "none" : "876000h";

    if (Object.keys(authPatch).length) {
      const { error } = await admin.auth.admin.updateUserById(id, authPatch);
      if (error) return json({ error: error.message }, 400);
    }
    if (Object.keys(patch).length) {
      const { error } = await admin.from("profiles").update(patch).eq("id", id);
      if (error) return json({ error: error.message }, 400);
    }
    return json({ ok: true });
  }

  return json({ error: "Aksi tidak dikenal" }, 400);
});
