import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db = new PGlite();
await db.exec(`
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'admin@prettybasic.id', '{"full_name":"Jose Putra"}');
create role authenticated; create role anon;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
`);
for (const f of fs.readdirSync('supabase/migrations').sort()) {
  if (fs.readFileSync(`supabase/migrations/${f}`, 'utf8').startsWith('-- test:skip')) continue;
  await db.exec(fs.readFileSync(`supabase/migrations/${f}`, 'utf8').replace('create extension if not exists pgcrypto;', ''));
}
const r = await db.query(`
with p as (insert into products(name) values ('Solea Mini Skort') returning id),
s as (insert into skus(product_id, code, color, size, launch_date) select id, 'SOLEASKORT-BLACK-XSS','Black','XS/S','2026-01-10' from p returning id)
select id from s`);
const sku = r.rows[0].id;
await db.query(`select set_config('request.jwt.claims', '{"email":"admin@prettybasic.id","user_metadata":{"full_name":"Jose Putra"}}', false)`);
const k = (await db.query(`select id from konveksi limit 1`)).rows[0].id;
const b = (await db.query(`select create_production_batch($1,$2,'2026-10-17','2026-10-31','in_production',null,$3) id`, [ (await db.query(`select next_batch_no(2026) n`)).rows[0].n, k, JSON.stringify([{sku_id: sku, qty_suggested: 10, qty_planned: 10}])])).rows[0].id;
console.log((await db.query(`select * from v_sku_in_production`)).rows);
await db.query(`select create_stock_document('in','adjustment_in','2026-10-01',null,null,'awal','manual',$1)`, [JSON.stringify([{sku_id: sku, qty: 5},{sku_id: sku, qty: 3}])]);
await db.query(`select create_stock_document('out','sales','2026-10-02','shopee',null,null,'manual',$1)`, [JSON.stringify([{sku_id: sku, qty: 2}])]);
await db.query(`select create_stock_document('in','produksi','2026-10-03',null,$2,null,'manual',$1)`, [JSON.stringify([{sku_id: sku, qty: 10}]), b]);
console.log((await db.query(`select * from v_sku_stock`)).rows, (await db.query(`select status from production_batches`)).rows, (await db.query(`select * from v_sku_in_production`)).rows);
console.log((await db.query(`select doc_no, created_by_name, sku_count, total_qty, product_names, batch_no from v_document_summary order by doc_no`)).rows);
console.log((await db.query(`select * from v_batch_summary`)).rows.map(r=>[r.batch_no,r.qty_planned,r.qty_received,r.konveksi_name]));
console.log((await db.query(`select * from movement_totals('2026-10-01','2026-10-31')`)).rows, (await db.query(`select * from sku_movements('2026-10-01','2026-10-31')`)).rows, (await db.query(`select * from v_sku_monthly_sales`)).rows, (await db.query(`select * from v_sku_last_sale`)).rows);
const d = (await db.query(`select id from stock_documents where type='sales'`)).rows[0].id;
await db.query(`select void_stock_document($1,'salah input')`, [d]);
console.log((await db.query(`select * from v_sku_stock`)).rows, (await db.query(`select next_batch_no(2026) n`)).rows);

// Stock opname: stock 16 → hitung fisik 12 → Adjustment − 4
console.log('opname', (await db.query(`select create_stock_opname('2026-10-05','gudang',$1) r`, [JSON.stringify([{sku_id: sku, counted: 12}])])).rows[0].r);
console.log((await db.query(`select * from v_sku_stock`)).rows, (await db.query(`select doc_no, type, source, note from stock_documents where source='opname'`)).rows);
console.log('opname no change', (await db.query(`select create_stock_opname('2026-10-05',null,$1) r`, [JSON.stringify([{sku_id: sku, counted: 12}])])).rows[0].r);

{
// ── Rekam Packing ─────────────────────────────────
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };
const ADMIN = '00000000-0000-0000-0000-00000000000a', PETUGAS = '00000000-0000-0000-0000-00000000000b';
await db.query(`insert into auth.users values ($1, 'budi@petugas.prettybasic.id', '{"full_name":"Budi"}')`, [PETUGAS]);
await db.query(`insert into profiles (id, full_name, username, role) values ($1, 'Budi', 'budi', 'petugas')`, [PETUGAS]);
const as = (id) => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [id]);
assert((await db.query(`select role from profiles where id = $1`, [ADMIN])).rows[0]?.role === 'admin', 'user lama jadi admin');

await as(PETUGAS);
assert((await db.query(`select app_role() r`)).rows[0].r === 'petugas', 'role petugas');
const id1 = '10000000-0000-0000-0000-000000000001';
await db.query(`select save_pack_record($1, ' spx123 ', 'Shopee', 'merekam', '2026-10-20T10:00:00Z', null, null)`, [id1]);
let pr = (await db.query(`select (save_pack_record($1, 'SPX123', 'Shopee', 'selesai', '2026-10-20T10:00:00Z', '2026-10-20T10:02:00Z', 120)).*`, [id1])).rows[0];
assert(pr.resi === 'SPX123' && pr.status === 'selesai' && pr.packer_name === 'Budi', 'catatan tersimpan');
assert(new Date(pr.video_expires_at).toISOString() === '2026-11-03T10:02:00.000Z', 'kedaluwarsa = selesai + 14 hari');
// kirim ulang dari antrean offline tidak mengubah apa-apa
pr = (await db.query(`select (save_pack_record($1, 'SPX123', 'Shopee', 'terputus', '2026-10-20T10:00:00Z', '2026-10-20T11:00:00Z', 3600)).*`, [id1])).rows[0];
assert(pr.status === 'selesai' && pr.duration_sec === 120, 'idempotent');

// duplikat
let ph = (await db.query(`select * from pack_resi_history('spx123')`)).rows[0];
assert(ph.record_count === 1 && ph.last_packer_name === 'Budi', 'riwayat resi');

// ubah lama simpan → hanya rekaman baru
await db.query(`update pack_settings set retention_days = 7`);
const id2 = '10000000-0000-0000-0000-000000000002';
pr = (await db.query(`select (save_pack_record($1, 'SPX123', 'Shopee', 'selesai', '2026-10-21T10:00:00Z', '2026-10-21T10:01:00Z', 60)).*`, [id2])).rows[0];
assert(pr.version === 2, 'rekam ulang = versi 2');
assert(new Date(pr.video_expires_at).toISOString() === '2026-10-28T10:01:00.000Z', 'rekaman baru pakai 7 hari');
assert(new Date((await db.query(`select video_expires_at from pack_records where id=$1`, [id1])).rows[0].video_expires_at).toISOString() === '2026-11-03T10:02:00.000Z', 'rekaman lama tetap 14 hari');

// batal → tanpa kedaluwarsa, tidak dihitung duplikat
const id3 = '10000000-0000-0000-0000-000000000003';
pr = (await db.query(`select (save_pack_record($1, 'JX999', 'TikTok Shop', 'dibatalkan', '2026-10-21T11:00:00Z', '2026-10-21T11:00:10Z', 10)).*`, [id3])).rows[0];
assert(pr.video_expires_at === null, 'batal tanpa kedaluwarsa');
assert((await db.query(`select * from pack_resi_history('JX999')`)).rows[0].record_count === 0, 'batal bukan duplikat');

// path video
await db.query(`select attach_pack_video($1, '2026/10/SPX123_1760954520000.webm', 1234, 'video/webm')`, [id1]);
let bad = false;
try { await db.query(`select attach_pack_video($1, '../x.mp4', 1, 'video/mp4')`, [id2]); } catch { bad = true; }
assert(bad, 'path aneh ditolak');

// petugas tidak bisa terapkan ke video lama; admin bisa
bad = false;
try { await db.query(`select apply_pack_retention_to_existing()`); } catch { bad = true; }
assert(bad, 'petugas tidak boleh ubah kedaluwarsa');
await as(ADMIN);
assert((await db.query(`select apply_pack_retention_to_existing() n`)).rows[0].n === 2, 'terapkan ke 2 video');
assert(new Date((await db.query(`select video_expires_at from pack_records where id=$1`, [id1])).rows[0].video_expires_at).toISOString() === '2026-10-27T10:02:00.000Z', 'video lama jadi 7 hari');
// admin tidak bisa menulis atas nama rekaman petugas
bad = false;
try { await db.query(`select save_pack_record($1, 'SPX123', 'Shopee', 'selesai', now(), now(), 1)`, ['10000000-0000-0000-0000-000000000004']); await db.query(`select attach_pack_video($1, '2026/10/SPX123_1.mp4', 1, 'video/mp4')`, [id1]); } catch { bad = true; }
assert(bad, 'bukan pemilik ditolak');
console.log('packing OK', (await db.query(`select * from pack_storage_summary()`)).rows[0]);
}
