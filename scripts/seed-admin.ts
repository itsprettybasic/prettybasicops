/**
 * Buat akun admin awal (idempotent). Butuh SUPABASE_SERVICE_ROLE_KEY.
 * Alternatif tanpa service key: Supabase Dashboard → Authentication → Users → Add user (centang Auto Confirm).
 */
import { env, scriptClient } from "./lib";

async function main() {
  const { supabase } = await scriptClient({ requireServiceRole: true });
  const email = env("SEED_ADMIN_EMAIL");
  const password = env("SEED_ADMIN_PASSWORD");
  const fullName = env("SEED_ADMIN_NAME", false) || "Admin";

  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;
  if (list.users.some((u) => u.email?.toLowerCase() === email.toLowerCase())) {
    console.log(`✓ User ${email} sudah ada — dilewati.`);
    return;
  }

  const { error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  console.log(`✓ User admin ${email} dibuat. Segera ganti password setelah login pertama.`);
}

main().catch((e) => {
  console.error("✗", e.message ?? e);
  process.exit(1);
});
