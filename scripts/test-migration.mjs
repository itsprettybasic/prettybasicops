import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db = new PGlite();
await db.exec(`
create schema auth;
create table auth.users (id uuid primary key);
create role authenticated; create role anon;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
`);
for (const f of fs.readdirSync('supabase/migrations').sort()) {
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
