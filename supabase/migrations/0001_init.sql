-- Pretty Basic · PPIC System — initial schema
-- Jalankan sekali di Supabase Dashboard → SQL Editor (atau `supabase db push`).

create extension if not exists pgcrypto;

create type movement_direction as enum ('in', 'out');
create type movement_type as enum (
  'produksi', 'retur', 'adjustment_in', 'transfer_in',            -- masuk
  'sales', 'damage', 'giveaway', 'adjustment_out', 'transfer_out' -- keluar
);
create type sales_channel as enum ('shopee', 'tiktok', 'instagram', 'website', 'offline', 'lainnya');
create type batch_status as enum ('draft', 'in_production', 'done', 'cancelled');
create type rank_class as enum ('A', 'B', 'C');

-- Nama user yang sedang login (dari user_metadata.full_name), dipakai untuk kolom "Admin".
create or replace function current_user_name() returns text
language sql stable as $$
  select coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    split_part(auth.jwt() ->> 'email', '@', 1),
    'Admin'
  )
$$;

-- ── Master ─────────────────────────────────────────
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table skus (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  code text not null unique,
  color text not null,
  size text not null,
  launch_date date not null,
  rank_override rank_class,
  unit_cost numeric(12,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on skus(product_id);

create table konveksi (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  capacity_per_day int,
  is_active boolean not null default true
);

-- ── Batch produksi ─────────────────────────────────
create table production_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text not null unique,
  konveksi_id uuid not null references konveksi(id),
  sent_date date not null,
  est_done_date date,
  status batch_status not null default 'in_production',
  note text,
  done_at timestamptz,
  created_by uuid references auth.users(id) default auth.uid(),
  created_by_name text default current_user_name(),
  created_at timestamptz not null default now()
);

create table production_batch_lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references production_batches(id) on delete cascade,
  sku_id uuid not null references skus(id),
  qty_suggested int not null default 0,
  qty_planned int not null check (qty_planned > 0),
  unique (batch_id, sku_id)
);
create index on production_batch_lines(sku_id);

-- ── Mutasi stock (dokumen + baris) ─────────────────
create table stock_documents (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  direction movement_direction not null,
  type movement_type not null,
  doc_date date not null,
  channel sales_channel,
  batch_id uuid references production_batches(id),
  note text,
  source text not null default 'manual' check (source in ('manual', 'excel', 'seed')),
  voided_at timestamptz,
  void_reason text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_by_name text default current_user_name(),
  created_at timestamptz not null default now(),
  constraint direction_matches_type check (
    (direction = 'in'  and type in ('produksi','retur','adjustment_in','transfer_in')) or
    (direction = 'out' and type in ('sales','damage','giveaway','adjustment_out','transfer_out'))
  )
);
create index on stock_documents(doc_date);
create index on stock_documents(type);
create index on stock_documents(batch_id);

create table stock_document_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references stock_documents(id) on delete cascade,
  sku_id uuid not null references skus(id),
  qty int not null check (qty > 0),
  unique (document_id, sku_id)
);
create index on stock_document_lines(sku_id);

-- ── Parameter (1 baris saja) ───────────────────────
create table ppic_parameters (
  id int primary key default 1 check (id = 1),
  min_cover_days int not null default 21,
  max_cover_days int not null default 35,
  lead_time_days int not null default 14,
  moq int not null default 1,
  rounding text not null default 'ceil' check (rounding in ('ceil','floor','round')),
  weight_h3 numeric not null default 20,
  weight_h2 numeric not null default 30,
  weight_h1 numeric not null default 50,
  weight2_h2 numeric not null default 40,
  weight2_h1 numeric not null default 60,
  overstock_multiplier numeric not null default 1.5,
  min_forecast_to_produce numeric not null default 6,
  deadstock_days int not null default 60,
  new_product_min_days int not null default 7,
  rank_a_pct numeric not null default 70,
  rank_b_pct numeric not null default 20,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into ppic_parameters (id) values (1) on conflict do nothing;

-- ── Views ──────────────────────────────────────────
create view v_sku_stock with (security_invoker = true) as
select s.id as sku_id,
  coalesce(sum(case when d.id is null then 0 when d.direction = 'in' then l.qty else -l.qty end), 0)::int as stock
from skus s
left join stock_document_lines l on l.sku_id = s.id
left join stock_documents d on d.id = l.document_id and d.voided_at is null
group by s.id;

create view v_batch_received with (security_invoker = true) as
select d.batch_id, l.sku_id, sum(l.qty)::int as qty_received
from stock_documents d
join stock_document_lines l on l.document_id = d.id
where d.type = 'produksi' and d.batch_id is not null and d.voided_at is null
group by d.batch_id, l.sku_id;

create view v_sku_in_production with (security_invoker = true) as
select bl.sku_id,
  sum(greatest(bl.qty_planned - coalesce(r.qty_received, 0), 0))::int as in_production
from production_batch_lines bl
join production_batches b on b.id = bl.batch_id and b.status = 'in_production'
left join v_batch_received r on r.batch_id = bl.batch_id and r.sku_id = bl.sku_id
group by bl.sku_id;

-- Penjualan per SKU per bulan (HANYA tipe 'sales')
create view v_sku_monthly_sales with (security_invoker = true) as
select l.sku_id, date_trunc('month', d.doc_date)::date as month, sum(l.qty)::int as qty
from stock_documents d
join stock_document_lines l on l.document_id = d.id
where d.type = 'sales' and d.voided_at is null
group by l.sku_id, date_trunc('month', d.doc_date);

-- Tanggal sales terakhir per SKU (untuk DEADSTOCK)
create view v_sku_last_sale with (security_invoker = true) as
select l.sku_id, max(d.doc_date) as last_sale_date
from stock_documents d
join stock_document_lines l on l.document_id = d.id
where d.type = 'sales' and d.voided_at is null
group by l.sku_id;

-- Ringkasan per dokumen (jumlah SKU & total qty) untuk tabel riwayat
create view v_document_summary with (security_invoker = true) as
select d.*,
  b.batch_no,
  (select count(*) from stock_document_lines l where l.document_id = d.id)::int as sku_count,
  (select coalesce(sum(l.qty), 0) from stock_document_lines l where l.document_id = d.id)::int as total_qty,
  (select string_agg(distinct p.name, '|')
     from stock_document_lines l
     join skus s on s.id = l.sku_id
     join products p on p.id = s.product_id
     where l.document_id = d.id) as product_names
from stock_documents d
left join production_batches b on b.id = d.batch_id;

-- Ringkasan per batch
create view v_batch_summary with (security_invoker = true) as
select b.*,
  k.name as konveksi_name,
  k.capacity_per_day as konveksi_capacity,
  (select count(*) from production_batch_lines bl where bl.batch_id = b.id)::int as sku_count,
  (select coalesce(sum(bl.qty_planned), 0) from production_batch_lines bl where bl.batch_id = b.id)::int as qty_planned,
  (select coalesce(sum(least(r.qty_received, bl.qty_planned)), 0)
     from production_batch_lines bl
     join v_batch_received r on r.batch_id = bl.batch_id and r.sku_id = bl.sku_id
     where bl.batch_id = b.id)::int as qty_received
from production_batches b
join konveksi k on k.id = b.konveksi_id;

-- ── RLS ────────────────────────────────────────────
alter table products enable row level security;
alter table skus enable row level security;
alter table konveksi enable row level security;
alter table production_batches enable row level security;
alter table production_batch_lines enable row level security;
alter table stock_documents enable row level security;
alter table stock_document_lines enable row level security;
alter table ppic_parameters enable row level security;

do $$
declare t text;
begin
  foreach t in array array['products','skus','konveksi','production_batches','production_batch_lines',
                           'stock_documents','stock_document_lines','ppic_parameters']
  loop
    execute format('create policy "auth select" on %I for select to authenticated using (true)', t);
    execute format('create policy "auth insert" on %I for insert to authenticated with check (true)', t);
    execute format('create policy "auth update" on %I for update to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Baris batch boleh dihapus saat batch masih draft (edit draft). Mutasi stock tidak pernah dihapus — pakai void.
create policy "auth delete draft lines" on production_batch_lines for delete to authenticated
  using (exists (select 1 from production_batches b where b.id = batch_id and b.status = 'draft'));

-- ── RPC ────────────────────────────────────────────

-- Simpan dokumen stock + baris-barisnya secara atomik.
create or replace function create_stock_document(
  p_direction movement_direction, p_type movement_type, p_doc_date date,
  p_channel sales_channel, p_batch_id uuid, p_note text, p_source text,
  p_lines jsonb   -- [{ "sku_id": "...", "qty": 12 }, ...]
) returns uuid language plpgsql security invoker as $$
declare v_id uuid; v_prefix text; v_seq int; v_doc_no text; v_open int;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Minimal 1 SKU'; end if;
  if p_type = 'sales' and p_channel is null then raise exception 'Channel wajib diisi untuk Sales'; end if;

  v_prefix := case when p_direction = 'in' then 'IN-' else 'OUT-' end || to_char(p_doc_date, 'YYYYMMDD');
  perform pg_advisory_xact_lock(hashtext(v_prefix));
  select coalesce(max(substring(doc_no from length(v_prefix) + 2)::int), 0) + 1 into v_seq
    from stock_documents where doc_no like v_prefix || '-%';
  v_doc_no := v_prefix || '-' || lpad(v_seq::text, 3, '0');

  insert into stock_documents (doc_no, direction, type, doc_date, channel, batch_id, note, source)
  values (v_doc_no, p_direction, p_type, p_doc_date, p_channel,
          case when p_type = 'produksi' then p_batch_id end, nullif(trim(p_note), ''), coalesce(p_source, 'manual'))
  returning id into v_id;

  insert into stock_document_lines (document_id, sku_id, qty)
  select v_id, (x->>'sku_id')::uuid, sum((x->>'qty')::int)   -- SKU duplikat digabung
  from jsonb_array_elements(p_lines) x group by (x->>'sku_id')::uuid;

  -- Batch otomatis selesai jika semua SKU sudah diterima ≥ rencana
  if p_type = 'produksi' and p_batch_id is not null then
    select count(*) into v_open
      from production_batch_lines bl
      left join v_batch_received r on r.batch_id = bl.batch_id and r.sku_id = bl.sku_id
     where bl.batch_id = p_batch_id and coalesce(r.qty_received, 0) < bl.qty_planned;
    if v_open = 0 then
      update production_batches set status = 'done', done_at = now()
       where id = p_batch_id and status = 'in_production';
    end if;
  end if;

  return v_id;
end $$;

-- Batalkan (void) dokumen — stock otomatis kembali karena view mengabaikan dokumen void.
create or replace function void_stock_document(p_id uuid, p_reason text)
returns void language plpgsql security invoker as $$
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'Alasan wajib diisi'; end if;
  update stock_documents set voided_at = now(), void_reason = trim(p_reason)
   where id = p_id and voided_at is null;
  if not found then raise exception 'Catatan tidak ditemukan atau sudah dibatalkan'; end if;
end $$;

-- Buat batch produksi + baris SKU secara atomik.
create or replace function create_production_batch(
  p_batch_no text, p_konveksi_id uuid, p_sent_date date, p_est_done_date date,
  p_status batch_status, p_note text,
  p_lines jsonb   -- [{ "sku_id": "...", "qty_suggested": 25, "qty_planned": 25 }, ...]
) returns uuid language plpgsql security invoker as $$
declare v_id uuid;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Minimal 1 SKU'; end if;
  if p_status not in ('draft', 'in_production') then raise exception 'Status batch tidak valid'; end if;

  insert into production_batches (batch_no, konveksi_id, sent_date, est_done_date, status, note)
  values (upper(trim(p_batch_no)), p_konveksi_id, p_sent_date, p_est_done_date, p_status, nullif(trim(p_note), ''))
  returning id into v_id;

  insert into production_batch_lines (batch_id, sku_id, qty_suggested, qty_planned)
  select v_id, (x->>'sku_id')::uuid, max(coalesce((x->>'qty_suggested')::int, 0)), sum((x->>'qty_planned')::int)
  from jsonb_array_elements(p_lines) x group by (x->>'sku_id')::uuid;

  return v_id;
end $$;

-- Nomor batch berikutnya: BATCH-YYYY-NNN
create or replace function next_batch_no(p_year int)
returns text language sql stable security invoker as $$
  select 'BATCH-' || p_year || '-' || lpad((coalesce(max(
    case when batch_no ~ ('^BATCH-' || p_year || '-[0-9]+$') then split_part(batch_no, '-', 3)::int end
  ), 0) + 1)::text, 3, '0')
  from production_batches
$$;

-- Total masuk/keluar per SKU dalam rentang tanggal (untuk Stock Live: Masuk 7d / Keluar 7d)
create or replace function sku_movements(p_from date, p_to date)
returns table (sku_id uuid, qty_in int, qty_out int)
language sql stable security invoker as $$
  select l.sku_id,
    coalesce(sum(l.qty) filter (where d.direction = 'in'), 0)::int,
    coalesce(sum(l.qty) filter (where d.direction = 'out'), 0)::int
  from stock_documents d
  join stock_document_lines l on l.document_id = d.id
  where d.voided_at is null and d.doc_date between p_from and p_to
  group by l.sku_id
$$;

-- Total per arah & tipe dalam rentang tanggal (untuk stat cards)
create or replace function movement_totals(p_from date, p_to date)
returns table (direction movement_direction, type movement_type, doc_count int, qty int)
language sql stable security invoker as $$
  select d.direction, d.type, count(distinct d.id)::int, coalesce(sum(l.qty), 0)::int
  from stock_documents d
  join stock_document_lines l on l.document_id = d.id
  where d.voided_at is null and d.doc_date between p_from and p_to
  group by d.direction, d.type
$$;

grant execute on all functions in schema public to authenticated;
revoke execute on function create_stock_document, void_stock_document, create_production_batch from anon;

-- ── Seed konveksi ──────────────────────────────────
insert into konveksi (name, capacity_per_day) values
  ('Konveksi GKS', 60),
  ('Konveksi Nusa', 45)
on conflict (name) do nothing;
