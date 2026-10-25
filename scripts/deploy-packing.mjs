// Pasang fitur Rekam Packing ke Supabase: migrasi 0003 + 0004 dan Edge Function pack-cleanup & pack-staff.
// Pakai: SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/deploy-packing.mjs [--functions-only]
// Token dibaca dari env saja, tidak disimpan di mana pun.
import fs from "node:fs";

const REF = "dfgujuuyndqjiecgvfjb";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("Set SUPABASE_ACCESS_TOKEN dulu");
  process.exit(1);
}
const api = `https://api.supabase.com/v1/projects/${REF}`;
const headers = { Authorization: `Bearer ${TOKEN}` };

async function sql(query) {
  const res = await fetch(`${api}/database/query`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL gagal (${res.status}): ${text}`);
  return JSON.parse(text);
}

async function deployFunction(slug, verifyJwt) {
  const form = new FormData();
  form.append("metadata", JSON.stringify({ entrypoint_path: "index.ts", name: slug, verify_jwt: verifyJwt }));
  form.append("file", new Blob([fs.readFileSync(`supabase/functions/${slug}/index.ts`)], { type: "application/typescript" }), "index.ts");
  const res = await fetch(`${api}/functions/deploy?slug=${slug}`, { method: "POST", headers, body: form });
  const text = await res.text();
  if (!res.ok) throw new Error(`Deploy ${slug} gagal (${res.status}): ${text}`);
  console.log(`✓ function ${slug}`);
}

if (!process.argv.includes("--functions-only")) {
  const applied = await sql(`select to_regclass('public.pack_records') is not null as done`);
  if (applied[0].done) {
    console.log("• 0003 sudah terpasang, dilewati");
  } else {
    await sql(fs.readFileSync("supabase/migrations/0003_packing.sql", "utf8"));
    console.log("✓ migrasi 0003_packing");
  }
  const bucket = await sql(`select exists (select 1 from storage.buckets where id = 'pack-videos') as done`);
  if (bucket[0].done) {
    console.log("• 0004 sudah terpasang, dilewati");
  } else {
    await sql(fs.readFileSync("supabase/migrations/0004_packing_storage.sql", "utf8"));
    console.log("✓ migrasi 0004_packing_storage");
  }
}

await deployFunction("pack-cleanup", false); // dipanggil pg_cron dengan x-cron-secret
await deployFunction("pack-staff", true);

console.log(await sql(`select jobname, schedule from cron.job where jobname = 'pack-cleanup-daily'`));
console.log(await sql(`select username, role from profiles order by role, username`));
