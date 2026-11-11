-- Batch Produksi → Purchase Order (PO) ke vendor.
--   konveksi                → vendors (database vendor: kontak, telepon, alamat, ...)
--   production_batches      → purchase_orders  (batch_no → po_no, sent_date → po_date, est_done_date → expected_date)
--   production_batch_lines  → purchase_order_lines (qty_planned → qty, + harga/pcs opsional)
--   stock_documents.batch_id → po_id   (dokumen tipe 'produksi' = Penerimaan Barang dari PO)
-- Data lama tetap ada; nomor BATCH-YYYY-NNN diganti jadi PO-YYYY-NNN.
-- Penerimaan barang (stock_documents tipe 'produksi') sekarang bisa diedit & dihapus; tipe lain tetap pakai void.

-- ── Lepas view & fungsi lama ───────────────────────
drop view if exists v_batch_summary;
drop view if exists v_document_summary;
drop view if exists v_sku_in_production;
drop view if exists v_batch_received;
drop function if exists create_production_batch(text, uuid, date, date, batch_status, text, jsonb);
drop function if exists next_batch_no(int);

-- ── Vendor ─────────────────────────────────────────
alter table konveksi rename to vendors;
alter table vendors drop column if exists capacity_per_day;
alter table vendors
  add column contact_person text,
  add column phone text,
  add column email text,
  add column address text,
  add column note text,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

-- ── Purchase Order ─────────────────────────────────
alter type batch_status rename to po_status;
alter type po_status rename value 'in_production' to 'open';

alter table production_batches rename to purchase_orders;
alter table purchase_orders rename column batch_no to po_no;
alter table purchase_orders rename column konveksi_id to vendor_id;
alter table purchase_orders rename column sent_date to po_date;
alter table purchase_orders rename column est_done_date to expected_date;
alter table purchase_orders alter column status set default 'open';
alter table purchase_orders
  -- true = ditutup manual (Tandai Selesai), jadi tidak dibuka lagi otomatis saat penerimaan diedit/dihapus
  add column closed_manually boolean not null default false,
  add column updated_at timestamptz,
  add column updated_by_name text;
update purchase_orders set po_no = regexp_replace(po_no, '^BATCH-', 'PO-') where po_no like 'BATCH-%';

alter table production_batch_lines rename to purchase_order_lines;
alter table purchase_order_lines rename column batch_id to po_id;
alter table purchase_order_lines rename column qty_planned to qty;
alter table purchase_order_lines add column unit_price numeric(14,2) check (unit_price is null or unit_price >= 0);

alter table stock_documents rename column batch_id to po_id;
-- PO yang dihapus: penerimaan yang sudah dibatalkan (void) tetap ada, referensinya dikosongkan
alter table stock_documents drop constraint if exists stock_documents_batch_id_fkey;
alter table stock_documents add constraint stock_documents_po_id_fkey
  foreign key (po_id) references purchase_orders(id) on delete set null;
alter table stock_documents add column updated_at timestamptz, add column updated_by_name text;

-- ── Hak hapus (admin) ──────────────────────────────
drop policy if exists "admin delete draft lines" on purchase_order_lines;
create policy "admin delete" on purchase_order_lines for delete to authenticated using (app_role() = 'admin');
create policy "admin delete" on purchase_orders for delete to authenticated using (app_role() = 'admin');
create policy "admin delete" on vendors for delete to authenticated using (app_role() = 'admin');
-- Hanya dokumen Penerimaan Barang (tipe produksi) yang boleh dihapus; mutasi lain tetap pakai void
create policy "admin delete receipt" on stock_documents for delete to authenticated
  using (app_role() = 'admin' and type = 'produksi');
create policy "admin delete receipt lines" on stock_document_lines for delete to authenticated
  using (app_role() = 'admin' and exists (
    select 1 from stock_documents d where d.id = document_id and d.type = 'produksi'));

-- ── Views ──────────────────────────────────────────
create view v_po_received with (security_invoker = true) as
select d.po_id, l.sku_id, sum(l.qty)::int as qty_received
from stock_documents d
join stock_document_lines l on l.document_id = d.id
where d.type = 'produksi' and d.po_id is not null and d.voided_at is null
group by d.po_id, l.sku_id;

-- Qty yang sudah di-PO tapi belum datang (dipakai PPIC sebagai kolom "Dalam PO")
create view v_sku_in_production with (security_invoker = true) as
select pl.sku_id,
  sum(greatest(pl.qty - coalesce(r.qty_received, 0), 0))::int as in_production
from purchase_order_lines pl
join purchase_orders po on po.id = pl.po_id and po.status = 'open'
left join v_po_received r on r.po_id = pl.po_id and r.sku_id = pl.sku_id
group by pl.sku_id;

create view v_document_summary with (security_invoker = true) as
select d.*,
  po.po_no,
  v.name as vendor_name,
  (select count(*) from stock_document_lines l where l.document_id = d.id)::int as sku_count,
  (select coalesce(sum(l.qty), 0) from stock_document_lines l where l.document_id = d.id)::int as total_qty,
  (select string_agg(distinct p.name, '|')
     from stock_document_lines l
     join skus s on s.id = l.sku_id
     join products p on p.id = s.product_id
     where l.document_id = d.id) as product_names
from stock_documents d
left join purchase_orders po on po.id = d.po_id
left join vendors v on v.id = po.vendor_id;

create view v_po_summary with (security_invoker = true) as
select po.*,
  v.name as vendor_name,
  (select count(*) from purchase_order_lines pl where pl.po_id = po.id)::int as sku_count,
  (select coalesce(sum(pl.qty), 0) from purchase_order_lines pl where pl.po_id = po.id)::int as qty_ordered,
  (select coalesce(sum(least(r.qty_received, pl.qty)), 0)
     from purchase_order_lines pl
     join v_po_received r on r.po_id = pl.po_id and r.sku_id = pl.sku_id
     where pl.po_id = po.id)::int as qty_received,
  (select sum(pl.qty * pl.unit_price) from purchase_order_lines pl where pl.po_id = po.id) as total_amount,
  (select count(*) from stock_documents d where d.po_id = po.id and d.type = 'produksi' and d.voided_at is null)::int as receipt_count,
  (select max(d.doc_date) from stock_documents d where d.po_id = po.id and d.type = 'produksi' and d.voided_at is null) as last_receipt_date
from purchase_orders po
join vendors v on v.id = po.vendor_id;

create view v_vendor_summary with (security_invoker = true) as
select v.*,
  (select count(*) from purchase_orders po where po.vendor_id = v.id)::int as po_count,
  (select count(*) from purchase_orders po where po.vendor_id = v.id and po.status in ('draft', 'open'))::int as po_open_count,
  (select max(po.po_date) from purchase_orders po where po.vendor_id = v.id) as last_po_date
from vendors v;

-- ── RPC ────────────────────────────────────────────

-- Status PO mengikuti penerimaan: semua SKU diterima ≥ qty → Selesai; kalau penerimaan diedit/dihapus
-- sehingga kurang lagi → kembali Dipesan (kecuali ditutup manual).
create or replace function sync_po_status(p_po_id uuid)
returns void language plpgsql security invoker as $$
declare v_open int; v_status po_status; v_manual boolean;
begin
  if p_po_id is null then return; end if;
  select status, closed_manually into v_status, v_manual from purchase_orders where id = p_po_id;
  if not found then return; end if;
  select count(*) into v_open
    from purchase_order_lines pl
    left join v_po_received r on r.po_id = pl.po_id and r.sku_id = pl.sku_id
   where pl.po_id = p_po_id and coalesce(r.qty_received, 0) < pl.qty;
  if v_status = 'open' and v_open = 0 then
    update purchase_orders set status = 'done', done_at = now() where id = p_po_id;
  elsif v_status = 'done' and v_open > 0 and not v_manual then
    update purchase_orders set status = 'open', done_at = null where id = p_po_id;
  end if;
end $$;

-- Nomor PO berikutnya: PO-YYYY-NNN
create or replace function next_po_no(p_year int)
returns text language sql stable security invoker as $$
  select 'PO-' || p_year || '-' || lpad((coalesce(max(
    case when po_no ~ ('^PO-' || p_year || '-[0-9]+$') then split_part(po_no, '-', 3)::int end
  ), 0) + 1)::text, 3, '0')
  from purchase_orders
$$;

-- Buat (p_id null) atau ubah PO + baris SKU secara atomik.
-- p_lines: [{ "sku_id": "...", "qty": 25, "qty_suggested": 20, "unit_price": 45000 }, ...]
create or replace function save_purchase_order(
  p_id uuid, p_po_no text, p_vendor_id uuid, p_po_date date, p_expected_date date,
  p_status po_status, p_note text, p_lines jsonb
) returns uuid language plpgsql security invoker as $$
declare v_id uuid := p_id; v_cur purchase_orders; v_bad text;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Minimal 1 SKU'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) x where coalesce((x->>'qty')::int, 0) <= 0) then
    raise exception 'Qty harus lebih dari 0';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lines) x where (x->>'unit_price')::numeric < 0) then
    raise exception 'Harga tidak boleh minus';
  end if;
  if p_expected_date is not null and p_expected_date < p_po_date then
    raise exception 'Tanggal kedatangan tidak boleh sebelum tanggal PO';
  end if;

  if v_id is null then
    if p_status not in ('draft', 'open') then raise exception 'Status PO tidak valid'; end if;
    insert into purchase_orders (po_no, vendor_id, po_date, expected_date, status, note)
    values (upper(trim(p_po_no)), p_vendor_id, p_po_date, p_expected_date, p_status, nullif(trim(p_note), ''))
    returning id into v_id;
  else
    select * into v_cur from purchase_orders where id = v_id for update;
    if not found then raise exception 'PO tidak ditemukan'; end if;
    if v_cur.status not in ('draft', 'open') then
      raise exception 'PO yang sudah selesai atau dibatalkan tidak bisa diedit';
    end if;

    -- SKU yang sudah diterima tidak boleh dihapus / qty-nya di bawah yang sudah diterima
    select string_agg(s.code || ' (sudah diterima ' || r.qty_received || ')', ', ') into v_bad
      from v_po_received r
      join skus s on s.id = r.sku_id
      left join (select (x->>'sku_id')::uuid as sku_id, sum((x->>'qty')::int) as qty
                   from jsonb_array_elements(p_lines) x group by 1) n on n.sku_id = r.sku_id
     where r.po_id = v_id and coalesce(n.qty, 0) < r.qty_received;
    if v_bad is not null then raise exception 'Qty tidak boleh kurang dari yang sudah diterima: %', v_bad; end if;

    update purchase_orders set
      po_no = upper(trim(p_po_no)),
      vendor_id = p_vendor_id,
      po_date = p_po_date,
      expected_date = p_expected_date,
      -- Draft boleh langsung dikirim; PO yang sudah dikirim tidak kembali ke draft
      status = case when v_cur.status = 'draft' and p_status = 'open' then 'open'::po_status else v_cur.status end,
      note = nullif(trim(p_note), ''),
      updated_at = now(),
      updated_by_name = current_user_name()
    where id = v_id;
    delete from purchase_order_lines where po_id = v_id;
  end if;

  insert into purchase_order_lines (po_id, sku_id, qty_suggested, qty, unit_price)
  select v_id, (x->>'sku_id')::uuid,
         max(coalesce((x->>'qty_suggested')::int, 0)),
         sum((x->>'qty')::int),
         max((x->>'unit_price')::numeric)
  from jsonb_array_elements(p_lines) x group by (x->>'sku_id')::uuid;

  perform sync_po_status(v_id);
  return v_id;
end $$;

-- Hapus PO. Ditolak kalau sudah ada penerimaan barang yang aktif (hapus penerimaannya dulu atau batalkan PO).
create or replace function delete_purchase_order(p_id uuid)
returns void language plpgsql security invoker as $$
declare v_n int;
begin
  select count(*) into v_n from stock_documents where po_id = p_id and voided_at is null;
  if v_n > 0 then
    raise exception 'PO ini sudah punya % penerimaan barang. Hapus penerimaannya dulu, atau batalkan PO saja.', v_n;
  end if;
  delete from purchase_orders where id = p_id;
  if not found then raise exception 'PO tidak ditemukan'; end if;
end $$;

-- Simpan dokumen stock + baris-barisnya secara atomik (p_batch_id → p_po_id).
drop function if exists create_stock_document(movement_direction, movement_type, date, sales_channel, uuid, text, text, jsonb);
create or replace function create_stock_document(
  p_direction movement_direction, p_type movement_type, p_doc_date date,
  p_channel sales_channel, p_po_id uuid, p_note text, p_source text,
  p_lines jsonb   -- [{ "sku_id": "...", "qty": 12 }, ...]
) returns uuid language plpgsql security invoker as $$
declare v_id uuid; v_prefix text; v_seq int; v_doc_no text; v_po purchase_orders;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Minimal 1 SKU'; end if;
  if p_type = 'sales' and p_channel is null then raise exception 'Channel wajib diisi untuk Sales'; end if;
  if p_type = 'produksi' and p_po_id is not null then
    select * into v_po from purchase_orders where id = p_po_id;
    if not found then raise exception 'PO tidak ditemukan'; end if;
    if v_po.status <> 'open' then
      raise exception 'PO % berstatus %, barang hanya bisa diterima dari PO yang sedang dipesan', v_po.po_no, v_po.status;
    end if;
  end if;

  v_prefix := case when p_direction = 'in' then 'IN-' else 'OUT-' end || to_char(p_doc_date, 'YYYYMMDD');
  perform pg_advisory_xact_lock(hashtext(v_prefix));
  select coalesce(max(substring(doc_no from length(v_prefix) + 2)::int), 0) + 1 into v_seq
    from stock_documents where doc_no like v_prefix || '-%';
  v_doc_no := v_prefix || '-' || lpad(v_seq::text, 3, '0');

  insert into stock_documents (doc_no, direction, type, doc_date, channel, po_id, note, source)
  values (v_doc_no, p_direction, p_type, p_doc_date, p_channel,
          case when p_type = 'produksi' then p_po_id end, nullif(trim(p_note), ''), coalesce(p_source, 'manual'))
  returning id into v_id;

  insert into stock_document_lines (document_id, sku_id, qty)
  select v_id, (x->>'sku_id')::uuid, sum((x->>'qty')::int)   -- SKU duplikat digabung
  from jsonb_array_elements(p_lines) x group by (x->>'sku_id')::uuid;

  if p_type = 'produksi' then perform sync_po_status(p_po_id); end if;
  return v_id;
end $$;

-- Ubah Penerimaan Barang (tanggal, catatan, qty per SKU). Stock & status PO ikut ter-update.
create or replace function update_receipt(p_id uuid, p_doc_date date, p_note text, p_lines jsonb)
returns void language plpgsql security invoker as $$
declare v_doc stock_documents;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Minimal 1 SKU'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) x where coalesce((x->>'qty')::int, 0) <= 0) then
    raise exception 'Qty harus lebih dari 0';
  end if;
  select * into v_doc from stock_documents where id = p_id for update;
  if not found then raise exception 'Penerimaan tidak ditemukan'; end if;
  if v_doc.type <> 'produksi' then raise exception 'Hanya Penerimaan Barang yang bisa diedit'; end if;
  if v_doc.voided_at is not null then raise exception 'Penerimaan ini sudah dibatalkan'; end if;

  update stock_documents set
    doc_date = p_doc_date,
    note = nullif(trim(p_note), ''),
    updated_at = now(),
    updated_by_name = current_user_name()
  where id = p_id;
  delete from stock_document_lines where document_id = p_id;
  insert into stock_document_lines (document_id, sku_id, qty)
  select p_id, (x->>'sku_id')::uuid, sum((x->>'qty')::int)
  from jsonb_array_elements(p_lines) x group by (x->>'sku_id')::uuid;

  perform sync_po_status(v_doc.po_id);
end $$;

-- Hapus Penerimaan Barang. Stock berkurang lagi dan PO kembali Dipesan kalau jadi kurang.
create or replace function delete_receipt(p_id uuid)
returns void language plpgsql security invoker as $$
declare v_doc stock_documents;
begin
  select * into v_doc from stock_documents where id = p_id for update;
  if not found then raise exception 'Penerimaan tidak ditemukan'; end if;
  if v_doc.type <> 'produksi' then raise exception 'Hanya Penerimaan Barang yang bisa dihapus'; end if;
  delete from stock_documents where id = p_id;
  perform sync_po_status(v_doc.po_id);
end $$;

-- Void penerimaan juga menyinkronkan status PO
create or replace function void_stock_document(p_id uuid, p_reason text)
returns void language plpgsql security invoker as $$
declare v_po uuid;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'Alasan wajib diisi'; end if;
  update stock_documents set voided_at = now(), void_reason = trim(p_reason)
   where id = p_id and voided_at is null
  returning po_id into v_po;
  if not found then raise exception 'Catatan tidak ditemukan atau sudah dibatalkan'; end if;
  perform sync_po_status(v_po);
end $$;

grant execute on all functions in schema public to authenticated;
revoke execute on function create_stock_document, void_stock_document, save_purchase_order, delete_purchase_order,
  update_receipt, delete_receipt, sync_po_status, next_po_no from anon;
