-- Multi gudang + Transfer Stock antar gudang.
--   warehouses            : daftar gudang. Semua stock lama masuk ke "Gudang Utama" (is_default).
--   stock_documents       : + warehouse_id (gudang tempat barang masuk/keluar), + transfer_id.
--   stock_transfers       : 1 transfer = 2 catatan stock (Transfer Keluar di gudang asal, Transfer Masuk di gudang tujuan)
--                           dengan SKU & qty yang sama. Diedit/dihapus hanya lewat transfer-nya.
--   PPIC hanya menghitung stock di gudang dengan counts_in_ppic = true (awal: hanya Gudang Utama).
--   Penjualan (sales) dari gudang mana pun tetap dihitung sebagai demand.

-- ── Gudang ─────────────────────────────────────────
create table warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  address text,
  note text,
  is_active boolean not null default true,
  counts_in_ppic boolean not null default false,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Gudang utama selalu aktif
  constraint default_is_active check (not is_default or is_active)
);
create unique index warehouses_one_default on warehouses (is_default) where is_default;

insert into warehouses (name, counts_in_ppic, is_default) values ('Gudang Utama', true, true);

alter table warehouses enable row level security;
create policy "admin select" on warehouses for select to authenticated using (app_role() = 'admin');
create policy "admin insert" on warehouses for insert to authenticated with check (app_role() = 'admin');
create policy "admin update" on warehouses for update to authenticated
  using (app_role() = 'admin') with check (app_role() = 'admin');

create or replace function default_warehouse_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from warehouses where is_default limit 1
$$;

-- ── Gudang di setiap catatan stock ─────────────────
alter table stock_documents add column warehouse_id uuid references warehouses(id);
update stock_documents set warehouse_id = default_warehouse_id();
alter table stock_documents alter column warehouse_id set not null;
alter table stock_documents alter column warehouse_id set default default_warehouse_id();
create index on stock_documents(warehouse_id);

-- ── Transfer Stock ─────────────────────────────────
create table stock_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_no text not null unique,
  transfer_date date not null,
  from_warehouse_id uuid not null references warehouses(id),
  to_warehouse_id uuid not null references warehouses(id),
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_by_name text default current_user_name(),
  created_at timestamptz not null default now(),
  updated_by_name text,
  updated_at timestamptz,
  constraint different_warehouses check (from_warehouse_id <> to_warehouse_id)
);
create index on stock_transfers(transfer_date);

alter table stock_transfers enable row level security;
create policy "admin select" on stock_transfers for select to authenticated using (app_role() = 'admin');
create policy "admin insert" on stock_transfers for insert to authenticated with check (app_role() = 'admin');
create policy "admin update" on stock_transfers for update to authenticated
  using (app_role() = 'admin') with check (app_role() = 'admin');
create policy "admin delete" on stock_transfers for delete to authenticated using (app_role() = 'admin');

alter table stock_documents add column transfer_id uuid references stock_transfers(id) on delete cascade;
create index on stock_documents(transfer_id);
alter table stock_documents add constraint transfer_type_matches check (
  (type in ('transfer_in', 'transfer_out')) = (transfer_id is not null)
);

-- Log penghapusan ikut mencatat gudang
alter table stock_document_deletions add column warehouse_name text;

create or replace function log_stock_document_deletion() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_lines jsonb; v_po text; v_wh text;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'sku_id', l.sku_id, 'code', s.code,
           'label', p.name || ' · ' || s.color || ' · ' || s.size, 'qty', l.qty) order by s.code), '[]'::jsonb)
    into v_lines
  from stock_document_lines l
  join skus s on s.id = l.sku_id
  join products p on p.id = s.product_id
  where l.document_id = old.id;
  if old.po_id is not null then select po_no into v_po from purchase_orders where id = old.po_id; end if;
  select name into v_wh from warehouses where id = old.warehouse_id;

  insert into stock_document_deletions (
    document_id, doc_no, direction, type, doc_date, channel, po_no, note, source, voided_at, void_reason,
    created_by_name, created_at, lines, sku_count, total_qty, warehouse_name)
  values (
    old.id, old.doc_no, old.direction, old.type, old.doc_date, old.channel, v_po, old.note, old.source,
    old.voided_at, old.void_reason, old.created_by_name, old.created_at, v_lines,
    jsonb_array_length(v_lines), coalesce((select sum((x->>'qty')::int) from jsonb_array_elements(v_lines) x), 0), v_wh);
  return old;
end $$;

-- ── Views ──────────────────────────────────────────
-- Stock per SKU per gudang (hanya kombinasi yang pernah ada mutasinya)
create view v_sku_warehouse_stock with (security_invoker = true) as
select l.sku_id, d.warehouse_id,
  sum(case when d.direction = 'in' then l.qty else -l.qty end)::int as stock
from stock_document_lines l
join stock_documents d on d.id = l.document_id and d.voided_at is null
group by l.sku_id, d.warehouse_id;

-- Stock untuk PPIC: hanya gudang yang dihitung di PPIC
create or replace view v_sku_stock with (security_invoker = true) as
select s.id as sku_id,
  coalesce(sum(case when d.id is null then 0 when d.direction = 'in' then l.qty else -l.qty end), 0)::int as stock
from skus s
left join stock_document_lines l on l.sku_id = s.id
left join (stock_documents d join warehouses w on w.id = d.warehouse_id and w.counts_in_ppic)
  on d.id = l.document_id and d.voided_at is null
group by s.id;

drop view if exists v_document_summary;
create view v_document_summary with (security_invoker = true) as
select d.*,
  po.po_no,
  v.name as vendor_name,
  w.name as warehouse_name,
  (select count(*) from stock_document_lines l where l.document_id = d.id)::int as sku_count,
  (select coalesce(sum(l.qty), 0) from stock_document_lines l where l.document_id = d.id)::int as total_qty,
  (select string_agg(distinct p.name, '|')
     from stock_document_lines l
     join skus s on s.id = l.sku_id
     join products p on p.id = s.product_id
     where l.document_id = d.id) as product_names
from stock_documents d
join warehouses w on w.id = d.warehouse_id
left join purchase_orders po on po.id = d.po_id
left join vendors v on v.id = po.vendor_id;

create view v_transfer_summary with (security_invoker = true) as
select t.*,
  wf.name as from_warehouse_name,
  wt.name as to_warehouse_name,
  (select count(*) from stock_document_lines l where l.document_id = o.id)::int as sku_count,
  (select coalesce(sum(l.qty), 0) from stock_document_lines l where l.document_id = o.id)::int as total_qty,
  (select string_agg(distinct p.name, '|')
     from stock_document_lines l
     join skus s on s.id = l.sku_id
     join products p on p.id = s.product_id
     where l.document_id = o.id) as product_names
from stock_transfers t
join warehouses wf on wf.id = t.from_warehouse_id
join warehouses wt on wt.id = t.to_warehouse_id
left join stock_documents o on o.transfer_id = t.id and o.direction = 'out';

-- ── RPC ────────────────────────────────────────────

-- Nomor catatan berikutnya: IN-/OUT-YYYYMMDD-NNN (panggil di dalam transaksi; mengunci per prefix)
create or replace function next_stock_doc_no(p_direction movement_direction, p_doc_date date)
returns text language plpgsql security invoker as $$
declare v_prefix text; v_seq int;
begin
  v_prefix := case when p_direction = 'in' then 'IN-' else 'OUT-' end || to_char(p_doc_date, 'YYYYMMDD');
  perform pg_advisory_xact_lock(hashtext(v_prefix));
  select coalesce(max(substring(doc_no from length(v_prefix) + 2)::int), 0) + 1 into v_seq
    from stock_documents where doc_no like v_prefix || '-%';
  return v_prefix || '-' || lpad(v_seq::text, 3, '0');
end $$;

create or replace function check_warehouse(p_id uuid) returns uuid
language plpgsql stable security invoker as $$
declare v warehouses;
begin
  if p_id is null then return default_warehouse_id(); end if;
  select * into v from warehouses where id = p_id;
  if not found then raise exception 'Gudang tidak ditemukan'; end if;
  if not v.is_active then raise exception 'Gudang % sudah nonaktif', v.name; end if;
  return p_id;
end $$;

-- Simpan catatan stock + gudang (p_warehouse_id null = Gudang Utama). Transfer tidak lewat sini.
drop function if exists create_stock_document(movement_direction, movement_type, date, sales_channel, uuid, text, text, jsonb);
create or replace function create_stock_document(
  p_direction movement_direction, p_type movement_type, p_doc_date date,
  p_channel sales_channel, p_po_id uuid, p_note text, p_source text,
  p_lines jsonb,   -- [{ "sku_id": "...", "qty": 12 }, ...]
  p_warehouse_id uuid default null
) returns uuid language plpgsql security invoker as $$
declare v_id uuid; v_doc_no text; v_po purchase_orders; v_wh uuid;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Minimal 1 SKU'; end if;
  if p_type in ('transfer_in', 'transfer_out') then raise exception 'Transfer stock dicatat lewat menu Transfer Stock'; end if;
  if p_type = 'sales' and p_channel is null then raise exception 'Channel wajib diisi untuk Sales'; end if;
  if p_type = 'produksi' and p_po_id is not null then
    select * into v_po from purchase_orders where id = p_po_id;
    if not found then raise exception 'PO tidak ditemukan'; end if;
    if v_po.status <> 'open' then
      raise exception 'PO % berstatus %, barang hanya bisa diterima dari PO yang sedang dipesan', v_po.po_no, v_po.status;
    end if;
  end if;
  v_wh := check_warehouse(p_warehouse_id);

  v_doc_no := next_stock_doc_no(p_direction, p_doc_date);
  insert into stock_documents (doc_no, direction, type, doc_date, channel, po_id, note, source, warehouse_id)
  values (v_doc_no, p_direction, p_type, p_doc_date, p_channel,
          case when p_type = 'produksi' then p_po_id end, nullif(trim(p_note), ''), coalesce(p_source, 'manual'), v_wh)
  returning id into v_id;

  insert into stock_document_lines (document_id, sku_id, qty)
  select v_id, (x->>'sku_id')::uuid, sum((x->>'qty')::int)   -- SKU duplikat digabung
  from jsonb_array_elements(p_lines) x group by (x->>'sku_id')::uuid;

  if p_type = 'produksi' then perform sync_po_status(p_po_id); end if;
  return v_id;
end $$;

-- Ubah catatan barang masuk/keluar (+ gudang). p_warehouse_id null = gudang tidak diubah.
drop function if exists update_stock_document(uuid, movement_type, date, sales_channel, text, jsonb);
create or replace function update_stock_document(
  p_id uuid, p_type movement_type, p_doc_date date, p_channel sales_channel, p_note text, p_lines jsonb,
  p_warehouse_id uuid default null
) returns void language plpgsql security invoker as $$
declare v_doc stock_documents;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Minimal 1 SKU'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) x where coalesce((x->>'qty')::int, 0) <= 0) then
    raise exception 'Qty harus lebih dari 0';
  end if;
  if p_type = 'sales' and p_channel is null then raise exception 'Channel wajib diisi untuk Sales'; end if;

  select * into v_doc from stock_documents where id = p_id for update;
  if not found then raise exception 'Catatan tidak ditemukan'; end if;
  if v_doc.transfer_id is not null or p_type in ('transfer_in', 'transfer_out') then
    raise exception 'Transfer stock diedit lewat menu Transfer Stock';
  end if;
  if (v_doc.type = 'produksi') <> (p_type = 'produksi') then
    raise exception 'Tipe Penerimaan PO tidak bisa diganti ke tipe lain (atau sebaliknya)';
  end if;

  update stock_documents set
    type = p_type,
    doc_date = p_doc_date,
    channel = case when v_doc.direction = 'out' then p_channel end,
    note = nullif(trim(p_note), ''),
    warehouse_id = case when p_warehouse_id is null or p_warehouse_id = v_doc.warehouse_id
                        then v_doc.warehouse_id else check_warehouse(p_warehouse_id) end,
    updated_at = now(),
    updated_by_name = current_user_name()
  where id = p_id;

  delete from stock_document_lines where document_id = p_id;
  insert into stock_document_lines (document_id, sku_id, qty)
  select p_id, (x->>'sku_id')::uuid, sum((x->>'qty')::int)
  from jsonb_array_elements(p_lines) x group by (x->>'sku_id')::uuid;

  if v_doc.po_id is not null then perform sync_po_status(v_doc.po_id); end if;
end $$;

create or replace function delete_stock_document(p_id uuid)
returns void language plpgsql security invoker as $$
declare v_doc stock_documents;
begin
  select * into v_doc from stock_documents where id = p_id for update;
  if not found then raise exception 'Catatan tidak ditemukan'; end if;
  if v_doc.transfer_id is not null then raise exception 'Transfer stock dihapus lewat menu Transfer Stock'; end if;
  delete from stock_documents where id = p_id;
  if not found then raise exception 'Tidak punya izin menghapus catatan ini'; end if;
  if v_doc.po_id is not null then perform sync_po_status(v_doc.po_id); end if;
end $$;

create or replace function void_stock_document(p_id uuid, p_reason text)
returns void language plpgsql security invoker as $$
declare v_po uuid;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'Alasan wajib diisi'; end if;
  if exists (select 1 from stock_documents where id = p_id and transfer_id is not null) then
    raise exception 'Transfer stock dihapus lewat menu Transfer Stock';
  end if;
  update stock_documents set voided_at = now(), void_reason = trim(p_reason)
   where id = p_id and voided_at is null
  returning po_id into v_po;
  if not found then raise exception 'Catatan tidak ditemukan atau sudah dibatalkan'; end if;
  perform sync_po_status(v_po);
end $$;

-- Stock opname per gudang: selisih dihitung dari stock gudang itu.
drop function if exists create_stock_opname(date, text, jsonb);
create or replace function create_stock_opname(
  p_doc_date date, p_note text,
  p_lines jsonb,   -- [{ "sku_id": "...", "counted": 12 }, ...]
  p_warehouse_id uuid default null
) returns jsonb language plpgsql security invoker as $$
declare v_in jsonb; v_out jsonb; v_in_id uuid; v_out_id uuid; v_note text; v_counted int; v_wh uuid;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Minimal 1 SKU'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) x where (x->>'counted')::int < 0) then
    raise exception 'Stock fisik tidak boleh minus';
  end if;
  v_wh := check_warehouse(p_warehouse_id);

  perform pg_advisory_xact_lock(hashtext('stock-opname:' || v_wh));

  with c as (
    select (x->>'sku_id')::uuid as sku_id, max((x->>'counted')::int) as counted
    from jsonb_array_elements(p_lines) x group by 1
  ), d as (
    select c.sku_id, c.counted - coalesce(s.stock, 0) as diff
    from c left join v_sku_warehouse_stock s on s.sku_id = c.sku_id and s.warehouse_id = v_wh
  )
  select coalesce(jsonb_agg(jsonb_build_object('sku_id', sku_id, 'qty', diff)) filter (where diff > 0), '[]'),
         coalesce(jsonb_agg(jsonb_build_object('sku_id', sku_id, 'qty', -diff)) filter (where diff < 0), '[]'),
         count(*)
    into v_in, v_out, v_counted
  from d;

  v_note := 'Stock Opname' || coalesce(' · ' || nullif(trim(p_note), ''), '');
  if jsonb_array_length(v_in) > 0 then
    v_in_id := create_stock_document('in', 'adjustment_in', p_doc_date, null, null, v_note, 'opname', v_in, v_wh);
  end if;
  if jsonb_array_length(v_out) > 0 then
    v_out_id := create_stock_document('out', 'adjustment_out', p_doc_date, null, null, v_note, 'opname', v_out, v_wh);
  end if;

  return jsonb_build_object(
    'counted', v_counted,
    'changed', jsonb_array_length(v_in) + jsonb_array_length(v_out),
    'plus', (select coalesce(sum((x->>'qty')::int), 0) from jsonb_array_elements(v_in) x),
    'minus', (select coalesce(sum((x->>'qty')::int), 0) from jsonb_array_elements(v_out) x),
    'in_id', v_in_id, 'out_id', v_out_id
  );
end $$;

-- Masuk/keluar per SKU dalam rentang tanggal. p_warehouse_id null = semua gudang (transfer antar gudang tidak dihitung).
drop function if exists sku_movements(date, date);
create or replace function sku_movements(p_from date, p_to date, p_warehouse_id uuid default null)
returns table (sku_id uuid, qty_in int, qty_out int)
language sql stable security invoker as $$
  select l.sku_id,
    coalesce(sum(l.qty) filter (where d.direction = 'in'), 0)::int,
    coalesce(sum(l.qty) filter (where d.direction = 'out'), 0)::int
  from stock_documents d
  join stock_document_lines l on l.document_id = d.id
  where d.voided_at is null and d.doc_date between p_from and p_to
    and (case when p_warehouse_id is null then d.transfer_id is null else d.warehouse_id = p_warehouse_id end)
  group by l.sku_id
$$;

-- Buat (p_id null) atau ubah Transfer Stock. p_lines: [{ "sku_id": "...", "qty": 10 }, ...]
-- Stock gudang asal boleh jadi minus (tidak pernah diblokir), sama seperti barang keluar.
create or replace function save_stock_transfer(
  p_id uuid, p_transfer_date date, p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_note text, p_lines jsonb
) returns uuid language plpgsql security invoker as $$
declare v_id uuid := p_id; v_prefix text; v_seq int; v_out uuid; v_in uuid; v_from uuid; v_to uuid;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Minimal 1 SKU'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) x where coalesce((x->>'qty')::int, 0) <= 0) then
    raise exception 'Qty harus lebih dari 0';
  end if;
  if p_from_warehouse_id is null or p_to_warehouse_id is null then raise exception 'Pilih gudang asal dan tujuan'; end if;
  if p_from_warehouse_id = p_to_warehouse_id then raise exception 'Gudang asal dan tujuan harus berbeda'; end if;

  if v_id is null then
    v_from := check_warehouse(p_from_warehouse_id);
    v_to := check_warehouse(p_to_warehouse_id);
    v_prefix := 'TRF-' || to_char(p_transfer_date, 'YYYYMMDD');
    perform pg_advisory_xact_lock(hashtext(v_prefix));
    select coalesce(max(substring(transfer_no from length(v_prefix) + 2)::int), 0) + 1 into v_seq
      from stock_transfers where transfer_no like v_prefix || '-%';
    insert into stock_transfers (transfer_no, transfer_date, from_warehouse_id, to_warehouse_id, note)
    values (v_prefix || '-' || lpad(v_seq::text, 3, '0'), p_transfer_date, v_from, v_to, nullif(trim(p_note), ''))
    returning id into v_id;

    insert into stock_documents (doc_no, direction, type, doc_date, note, source, warehouse_id, transfer_id)
    values (next_stock_doc_no('out', p_transfer_date), 'out', 'transfer_out', p_transfer_date, nullif(trim(p_note), ''), 'manual', v_from, v_id)
    returning id into v_out;
    insert into stock_documents (doc_no, direction, type, doc_date, note, source, warehouse_id, transfer_id)
    values (next_stock_doc_no('in', p_transfer_date), 'in', 'transfer_in', p_transfer_date, nullif(trim(p_note), ''), 'manual', v_to, v_id)
    returning id into v_in;
  else
    perform 1 from stock_transfers where id = v_id for update;
    if not found then raise exception 'Transfer tidak ditemukan'; end if;
    -- Gudang lama yang sudah nonaktif tetap boleh dipakai saat edit
    select case when from_warehouse_id = p_from_warehouse_id then p_from_warehouse_id else check_warehouse(p_from_warehouse_id) end,
           case when to_warehouse_id = p_to_warehouse_id then p_to_warehouse_id else check_warehouse(p_to_warehouse_id) end
      into v_from, v_to
      from stock_transfers where id = v_id;
    update stock_transfers set
      transfer_date = p_transfer_date,
      from_warehouse_id = v_from,
      to_warehouse_id = v_to,
      note = nullif(trim(p_note), ''),
      updated_at = now(),
      updated_by_name = current_user_name()
    where id = v_id;
    update stock_documents set
      doc_date = p_transfer_date,
      warehouse_id = case when direction = 'out' then v_from else v_to end,
      note = nullif(trim(p_note), ''),
      updated_at = now(),
      updated_by_name = current_user_name()
    where transfer_id = v_id;
    select id into v_out from stock_documents where transfer_id = v_id and direction = 'out';
    select id into v_in from stock_documents where transfer_id = v_id and direction = 'in';
    delete from stock_document_lines where document_id in (v_out, v_in);
  end if;

  insert into stock_document_lines (document_id, sku_id, qty)
  select doc, (x->>'sku_id')::uuid, sum((x->>'qty')::int)
  from jsonb_array_elements(p_lines) x cross join unnest(array[v_out, v_in]) doc
  group by doc, (x->>'sku_id')::uuid;

  return v_id;
end $$;

-- Hapus Transfer Stock (kedua catatannya ikut terhapus & tercatat di log penghapusan).
create or replace function delete_stock_transfer(p_id uuid)
returns void language plpgsql security invoker as $$
begin
  delete from stock_transfers where id = p_id;
  if not found then raise exception 'Transfer tidak ditemukan'; end if;
end $$;

grant execute on function default_warehouse_id, next_stock_doc_no, check_warehouse, create_stock_document,
  update_stock_document, delete_stock_document, void_stock_document, create_stock_opname, sku_movements,
  save_stock_transfer, delete_stock_transfer to authenticated;
revoke execute on function default_warehouse_id, next_stock_doc_no, check_warehouse, create_stock_document,
  update_stock_document, delete_stock_document, void_stock_document, create_stock_opname, sku_movements,
  save_stock_transfer, delete_stock_transfer from anon, public;
