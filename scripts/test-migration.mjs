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
const k = (await db.query(`select id from vendors limit 1`)).rows[0].id;
const b = (await db.query(`select save_purchase_order(null,$1,$2,'2026-10-17','2026-10-31','open',null,$3) id`, [ (await db.query(`select next_po_no(2026) n`)).rows[0].n, k, JSON.stringify([{sku_id: sku, qty_suggested: 10, qty: 10, unit_price: 50000}])])).rows[0].id;
console.log((await db.query(`select * from v_sku_in_production`)).rows);
await db.query(`select create_stock_document('in','adjustment_in','2026-10-01',null,null,'awal','manual',$1)`, [JSON.stringify([{sku_id: sku, qty: 5},{sku_id: sku, qty: 3}])]);
await db.query(`select create_stock_document('out','sales','2026-10-02','shopee',null,null,'manual',$1)`, [JSON.stringify([{sku_id: sku, qty: 2}])]);
await db.query(`select create_stock_document('in','produksi','2026-10-03',null,$2,null,'manual',$1)`, [JSON.stringify([{sku_id: sku, qty: 10}]), b]);
console.log((await db.query(`select * from v_sku_stock`)).rows, (await db.query(`select status from purchase_orders`)).rows, (await db.query(`select * from v_sku_in_production`)).rows);
console.log((await db.query(`select doc_no, created_by_name, sku_count, total_qty, product_names, po_no, vendor_name from v_document_summary order by doc_no`)).rows);
console.log((await db.query(`select * from v_po_summary`)).rows.map(r=>[r.po_no,r.qty_ordered,r.qty_received,r.vendor_name,r.total_amount,r.receipt_count]));
console.log((await db.query(`select * from movement_totals('2026-10-01','2026-10-31')`)).rows, (await db.query(`select * from sku_movements('2026-10-01','2026-10-31')`)).rows, (await db.query(`select * from v_sku_monthly_sales`)).rows, (await db.query(`select * from v_sku_last_sale`)).rows);
const d = (await db.query(`select id from stock_documents where type='sales'`)).rows[0].id;
await db.query(`select void_stock_document($1,'salah input')`, [d]);
console.log((await db.query(`select * from v_sku_stock`)).rows, (await db.query(`select next_po_no(2026) n`)).rows);

{
  // ── Purchase Order & Penerimaan ───────────────────
  const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };
  const stock = async () => (await db.query(`select stock from v_sku_stock where sku_id=$1`, [sku])).rows[0].stock;
  const status = async (id) => (await db.query(`select status from purchase_orders where id=$1`, [id])).rows[0]?.status;
  const throws = async (q, args) => { try { await db.query(q, args); return false; } catch { return true; } };
  assert(await status(b) === 'done', 'PO selesai otomatis setelah diterima penuh');
  const s0 = await stock();
  const rec = (await db.query(`select id from stock_documents where type='produksi'`)).rows[0].id;
  // edit penerimaan: 10 → 6 → PO kembali open, stock turun 4
  await db.query(`select update_receipt($1,'2026-10-04','edit',$2)`, [rec, JSON.stringify([{sku_id: sku, qty: 6}])]);
  assert(await status(b) === 'open', 'PO dibuka lagi setelah penerimaan dikurangi');
  assert(await stock() === s0 - 4, 'stock ikut turun');
  assert((await db.query(`select in_production from v_sku_in_production`)).rows[0].in_production === 4, 'sisa 4 dalam PO');
  // edit PO: qty di bawah yang sudah diterima ditolak
  assert(await throws(`select save_purchase_order($1,'PO-2026-001',$2,'2026-10-17',null,'open',null,$3)`, [b, k, JSON.stringify([{sku_id: sku, qty: 5}])]), 'qty < diterima ditolak');
  await db.query(`select save_purchase_order($1,'PO-2026-001',$2,'2026-10-17','2026-11-01','open','ubah',$3)`, [b, k, JSON.stringify([{sku_id: sku, qty: 6, unit_price: 45000}])]);
  assert(await status(b) === 'done', 'qty PO = diterima → selesai');
  // hapus PO dengan penerimaan aktif ditolak
  assert(await throws(`select delete_purchase_order($1)`, [b]), 'hapus PO dengan penerimaan ditolak');
  // hapus penerimaan → stock kembali, PO open
  await db.query(`select delete_receipt($1)`, [rec]);
  assert(await stock() === s0 - 10, 'stock kembali setelah penerimaan dihapus');
  assert(await status(b) === 'open', 'PO open lagi');
  // tidak boleh hapus dokumen non-penerimaan
  assert(await throws(`select delete_receipt($1)`, [d]), 'hapus sales ditolak');
  // terima dari PO draft ditolak
  const draft = (await db.query(`select save_purchase_order(null,'PO-2026-099',$1,'2026-10-20',null,'draft',null,$2) id`, [k, JSON.stringify([{sku_id: sku, qty: 3}])])).rows[0].id;
  assert(await throws(`select create_stock_document('in','produksi','2026-10-21',null,$2,null,'manual',$1)`, [JSON.stringify([{sku_id: sku, qty: 1}]), draft]), 'terima dari draft ditolak');
  assert((await db.query(`select in_production from v_sku_in_production`)).rows[0].in_production === 6, 'draft tidak dihitung dalam PO');
  await db.query(`select save_purchase_order($1,'PO-2026-099',$2,'2026-10-20',null,'open',null,$3)`, [draft, k, JSON.stringify([{sku_id: sku, qty: 3}])]);
  assert(await status(draft) === 'open', 'draft dikirim');
  await db.query(`update purchase_orders set status='cancelled' where id=$1`, [draft]);
  await db.query(`select delete_purchase_order($1)`, [draft]);
  assert(!(await status(draft)), 'PO tanpa penerimaan terhapus');
  console.log('PO OK', (await db.query(`select name, po_count, po_open_count from v_vendor_summary`)).rows);
}

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
{
  const as = (id) => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [id]);
  await as('00000000-0000-0000-0000-00000000000b');
  const r = (await db.query(`select (save_pack_record('10000000-0000-0000-0000-000000000009', 'LULU001', 'Shopee', 'selesai', now(), now(), 30, 'Lulu')).*`)).rows[0];
  if (r.packer_name !== 'Lulu') { console.error('FAIL: nama packing'); process.exit(1); }
  const r2 = (await db.query(`select (save_pack_record('10000000-0000-0000-0000-000000000010', 'BUDI001', 'Shopee', 'selesai', now(), now(), 30)).*`)).rows[0];
  if (r2.packer_name !== 'Budi') { console.error('FAIL: default nama akun'); process.exit(1); }
  console.log('packers OK');
}
{
  // ── Pengiriman kain ───────────────────────────────
  const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };
  await db.query(`select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false)`);
  const v = (await db.query(`select id from vendors limit 1`)).rows[0].id;
  const no = (await db.query(`select next_sj_no(2026) n`)).rows[0].n;
  assert(no === 'SJ-2026-0001', 'nomor SJ');
  const id = (await db.query(`select save_fabric_shipment(null,$1,'2026-11-11',$2,null,'Pak Budi',' b 1234 xy ',null,$3) id`, [no, v, JSON.stringify([{fabric_type:'Rayon',color:'Hitam',qty_kg:25.555,roll_count:2},{fabric_type:'Linen',color:'Putih',qty_kg:10}])])).rows[0].id;
  let s = (await db.query(`select * from v_fabric_shipment_summary where id=$1`, [id])).rows[0];
  assert(Number(s.total_kg) === 35.56 && s.total_roll === 2 && s.line_count === 2 && s.vehicle_no === 'B 1234 XY', 'ringkasan SJ');
  await db.query(`select save_fabric_shipment($1,$2,'2026-11-11',$3,null,null,null,'edit',$4)`, [id, no, v, JSON.stringify([{fabric_type:'Rayon',color:'Hitam',qty_kg:30}])]);
  s = (await db.query(`select * from v_fabric_shipment_summary where id=$1`, [id])).rows[0];
  assert(Number(s.total_kg) === 30 && s.line_count === 1, 'edit SJ');
  let bad = false; try { await db.query(`select save_fabric_shipment(null,'SJ-X','2026-11-11',$1,null,null,null,null,$2)`, [v, JSON.stringify([{fabric_type:'Rayon',color:'',qty_kg:1}])]); } catch { bad = true; }
  assert(bad, 'warna kosong ditolak');
  await db.query(`delete from fabric_shipments where id=$1`, [id]);
  console.log('kain OK');
}
{
  // ── Edit & hapus semua catatan; stock boleh minus ──
  const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };
  await db.query(`select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false)`);
  const stock = async () => (await db.query(`select stock from v_sku_stock where sku_id=$1`, [sku])).rows[0].stock;
  const before = await stock();
  const id = (await db.query(`select create_stock_document('out','sales','2026-11-01','shopee',null,null,'manual',$1) id`, [JSON.stringify([{sku_id: sku, qty: before + 5}])])).rows[0].id;
  assert(await stock() === -5, 'barang keluar melebihi stock → minus');
  await db.query(`select update_stock_document($1,'damage','2026-11-02',null,'rusak',$2)`, [id, JSON.stringify([{sku_id: sku, qty: 2}])]);
  const d = (await db.query(`select type, doc_date::text, channel, note, updated_by_name from stock_documents where id=$1`, [id])).rows[0];
  assert(d.type === 'damage' && d.doc_date === '2026-11-02' && d.note === 'rusak' && d.updated_by_name === 'Jose Putra', 'edit catatan keluar');
  assert(await stock() === before - 2, 'stock ikut edit');
  let bad = false; try { await db.query(`select update_stock_document($1,'retur','2026-11-02',null,null,$2)`, [id, JSON.stringify([{sku_id: sku, qty: 1}])]); } catch { bad = true; }
  assert(bad, 'tipe beda arah ditolak');
  bad = false; try { await db.query(`select update_stock_document($1,'sales','2026-11-02',null,null,$2)`, [id, JSON.stringify([{sku_id: sku, qty: 1}])]); } catch { bad = true; }
  assert(bad, 'sales tanpa channel ditolak');
  await db.query(`select delete_stock_document($1)`, [id]);
  assert(await stock() === before, 'hapus mengembalikan stock');
  console.log('edit/hapus semua catatan OK');
}
{
  // ── Log penghapusan ───────────────────────────────
  const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };
  await db.query(`select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false)`);
  const id = (await db.query(`select create_stock_document('out','giveaway','2026-11-05',null,null,'endorse','manual',$1) id`, [JSON.stringify([{sku_id: sku, qty: 4}])])).rows[0].id;
  await db.query(`select delete_stock_document($1)`, [id]);
  const log = (await db.query(`select * from stock_document_deletions where document_id=$1`, [id])).rows[0];
  assert(log && log.type === 'giveaway' && log.note === 'endorse' && log.total_qty === 4 && log.sku_count === 1, 'log hapus tersimpan');
  assert(log.lines[0].code === 'SOLEASKORT-BLACK-XSS' && log.lines[0].label === 'Solea Mini Skort · Black · XS/S', 'baris SKU di log');
  assert(log.deleted_by_name === 'Jose Putra', 'nama penghapus');
  console.log('log hapus OK');
}
{
  // ── Gudang & Transfer Stock ───────────────────────
  const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };
  const throws = async (q, args) => { try { await db.query(q, args); return false; } catch { return true; } };
  const ppic = async () => (await db.query(`select stock from v_sku_stock where sku_id=$1`, [sku])).rows[0].stock;
  const wh = async (w) => (await db.query(`select stock from v_sku_warehouse_stock where sku_id=$1 and warehouse_id=$2`, [sku, w])).rows[0]?.stock ?? 0;
  const utama = (await db.query(`select id from warehouses where is_default`)).rows[0].id;
  assert((await db.query(`select count(*)::int n from stock_documents where warehouse_id is null or warehouse_id <> $1`, [utama])).rows[0].n === 0, 'semua catatan lama di Gudang Utama');
  const toko = (await db.query(`insert into warehouses(name) values ('Gudang Toko') returning id`)).rows[0].id;
  const p0 = await ppic(), u0 = await wh(utama);
  assert(p0 === u0, 'PPIC = Gudang Utama');
  // catatan masuk ke gudang lain tidak dihitung PPIC
  await db.query(`select create_stock_document('in','retur','2026-11-06',null,null,null,'manual',$1,$2)`, [JSON.stringify([{sku_id: sku, qty: 7}]), toko]);
  assert(await wh(toko) === 7 && await ppic() === p0, 'retur ke Gudang Toko tidak masuk PPIC');
  // transfer 3 dari Utama → Toko
  const t = (await db.query(`select save_stock_transfer(null,'2026-11-07',$1,$2,'kirim',$3) id`, [utama, toko, JSON.stringify([{sku_id: sku, qty: 3}])])).rows[0].id;
  assert(await wh(utama) === u0 - 3 && await wh(toko) === 10, 'transfer memindahkan stock');
  const sum = (await db.query(`select * from v_transfer_summary where id=$1`, [t])).rows[0];
  assert(sum.transfer_no === 'TRF-20261107-001' && sum.total_qty === 3 && sum.from_warehouse_name === 'Gudang Utama' && sum.to_warehouse_name === 'Gudang Toko', 'ringkasan transfer');
  // edit: qty 5, arah dibalik
  await db.query(`select save_stock_transfer($1,'2026-11-08',$2,$3,'balik',$4)`, [t, toko, utama, JSON.stringify([{sku_id: sku, qty: 5}])]);
  assert(await wh(utama) === u0 + 5 && await wh(toko) === 2, 'edit transfer');
  assert((await db.query(`select count(*)::int n from stock_documents where transfer_id=$1 and doc_date='2026-11-08'`, [t])).rows[0].n === 2, 'tanggal kedua catatan ikut');
  const doc = (await db.query(`select id from stock_documents where transfer_id=$1 limit 1`, [t])).rows[0].id;
  assert(await throws(`select delete_stock_document($1)`, [doc]), 'catatan transfer tidak bisa dihapus sendiri');
  assert(await throws(`select update_stock_document($1,'transfer_out','2026-11-08',null,null,$2)`, [doc, JSON.stringify([{sku_id: sku, qty: 1}])]), 'catatan transfer tidak bisa diedit sendiri');
  assert(await throws(`select create_stock_document('out','transfer_out','2026-11-08',null,null,null,'manual',$1)`, [JSON.stringify([{sku_id: sku, qty: 1}])]), 'transfer manual ditolak');
  assert(await throws(`select save_stock_transfer(null,'2026-11-07',$1,$1,null,$2)`, [utama, JSON.stringify([{sku_id: sku, qty: 1}])]), 'gudang sama ditolak');
  // sku_movements semua gudang mengabaikan transfer
  const mv = (await db.query(`select * from sku_movements('2026-11-08','2026-11-08')`)).rows;
  assert(mv.length === 0, 'transfer tidak dihitung di masuk/keluar total');
  const mvToko = (await db.query(`select * from sku_movements('2026-11-08','2026-11-08',$1)`, [toko])).rows[0];
  assert(mvToko.qty_out === 5, 'masuk/keluar per gudang ikut transfer');
  // opname per gudang
  const op = (await db.query(`select create_stock_opname('2026-11-09',null,$1,$2) r`, [JSON.stringify([{sku_id: sku, counted: 0}]), toko])).rows[0].r;
  assert(op.minus === 2 && await wh(toko) === 0 && await wh(utama) === u0 + 5, 'opname hanya gudang itu');
  // hapus transfer
  await db.query(`select delete_stock_transfer($1)`, [t]);
  assert(await wh(utama) === u0, 'hapus transfer mengembalikan stock');
  assert((await db.query(`select count(*)::int n from stock_document_deletions where type in ('transfer_in','transfer_out')`)).rows[0].n === 2, 'hapus transfer tercatat di log');
  // gudang nonaktif ditolak
  await db.query(`update warehouses set is_active=false where id=$1`, [toko]);
  assert(await throws(`select create_stock_document('in','retur','2026-11-06',null,null,null,'manual',$1,$2)`, [JSON.stringify([{sku_id: sku, qty: 1}]), toko]), 'gudang nonaktif ditolak');
  assert(await throws(`update warehouses set is_active=false where id=$1`, [utama]), 'gudang utama tidak bisa nonaktif');
  console.log('gudang & transfer OK');
}
{
  // ── Satuan kain per baris ─────────────────────────
  const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };
  const v = (await db.query(`select id from vendors limit 1`)).rows[0].id;
  const id = (await db.query(`select save_fabric_shipment(null,'SJ-UNIT-1','2026-11-12',$1,null,null,null,null,$2) id`, [v, JSON.stringify([{fabric_type:'Rayon',color:'Hitam',qty:25.5},{fabric_type:'Linen',color:'Putih',qty:10,unit:'yard'},{fabric_type:'Katun',color:'Navy',qty:3,unit:'roll'}])])).rows[0].id;
  const s = (await db.query(`select total_kg, qty_by_unit from v_fabric_shipment_summary where id=$1`, [id])).rows[0];
  assert(Number(s.total_kg) === 25.5 && Number(s.qty_by_unit.yard) === 10 && Number(s.qty_by_unit.roll) === 3 && Number(s.qty_by_unit.kg) === 25.5, 'total per satuan');
  const units = (await db.query(`select unit from fabric_shipment_lines where shipment_id=$1 order by line_no`, [id])).rows.map(r => r.unit);
  assert(units.join() === 'kg,yard,roll', 'default kg');
  let bad = false; try { await db.query(`select save_fabric_shipment(null,'SJ-UNIT-2','2026-11-12',$1,null,null,null,null,$2)`, [v, JSON.stringify([{fabric_type:'Rayon',color:'Hitam',qty:1,unit:'lusin'}])]); } catch { bad = true; }
  assert(bad, 'satuan tidak dikenal ditolak');
  console.log('satuan kain OK');
}
