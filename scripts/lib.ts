import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

export function env(name: string, required = true): string {
  const value = process.env[name]?.trim() ?? "";
  if (required && !value) {
    console.error(`✗ Env var ${name} belum diisi di .env.local`);
    process.exit(1);
  }
  return value;
}

/**
 * Client Supabase untuk script. Pakai SUPABASE_SERVICE_ROLE_KEY jika ada (bypass RLS);
 * kalau tidak ada, login sebagai admin (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD) — RLS mengizinkan insert untuk user login.
 */
export async function scriptClient(opts: { requireServiceRole?: boolean } = {}): Promise<{ supabase: SupabaseClient; mode: string }> {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY", false);
  const authOpts = { auth: { persistSession: false, autoRefreshToken: false } };

  if (serviceKey) return { supabase: createClient(url, serviceKey, authOpts), mode: "service role" };
  if (opts.requireServiceRole) {
    console.error("✗ Script ini butuh SUPABASE_SERVICE_ROLE_KEY di .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), authOpts);
  const email = env("SEED_ADMIN_EMAIL");
  const { error } = await supabase.auth.signInWithPassword({ email, password: env("SEED_ADMIN_PASSWORD") });
  if (error) {
    console.error(`✗ Gagal login sebagai ${email}: ${error.message}`);
    process.exit(1);
  }
  return { supabase, mode: `login ${email}` };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function insertAll(supabase: SupabaseClient, table: string, rows: object[], size = 500) {
  for (const part of chunk(rows, size)) {
    const { error } = await supabase.from(table).insert(part);
    if (error) throw new Error(`Insert ${table} gagal: ${error.message}`);
  }
}
