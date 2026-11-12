-- Kalkulator Kain: hitung kebutuhan kain dari rencana produksi (produk × warna × pcs), bisa disimpan sebagai riwayat & diedit.
-- Pemakaian kain diambil dari Database Produk (products.fabric_*) dan disalin ke tiap baris saat disimpan,
-- jadi riwayat tetap sama walau data produk berubah (edit + simpan ulang = pakai data produk terbaru).

create table fabric_calculations (
  id uuid primary key default gen_random_uuid(),
  calc_no text not null unique,
  title text,
  calc_date date not null default current_date,
  po_id uuid references purchase_orders(id) on delete set null,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_by_name text default current_user_name(),
  created_at timestamptz not null default now(),
  updated_by_name text,
  updated_at timestamptz
);
create index on fabric_calculations(calc_date);

create table fabric_calculation_lines (
  id uuid primary key default gen_random_uuid(),
  calc_id uuid not null references fabric_calculations(id) on delete cascade,
  line_no int not null,
  product_id uuid not null references products(id),
  color text,
  qty_pcs int not null check (qty_pcs > 0),
  -- salinan pemakaian kain saat disimpan (null = produk belum diisi pemakaian kainnya)
  fabric_type text,
  fabric_unit text check (fabric_unit in ('kg', 'yard')),
  fabric_qty numeric(10,3),
  fabric_pcs numeric(10,2)
);
create index on fabric_calculation_lines(calc_id);

alter table fabric_calculations enable row level security;
create policy "admin select" on fabric_calculations for select to authenticated using (app_role() = 'admin');
create policy "admin insert" on fabric_calculations for insert to authenticated with check (app_role() = 'admin');
create policy "admin update" on fabric_calculations for update to authenticated
  using (app_role() = 'admin') with check (app_role() = 'admin');
create policy "admin delete" on fabric_calculations for delete to authenticated using (app_role() = 'admin');

alter table fabric_calculation_lines enable row level security;
create policy "admin select" on fabric_calculation_lines for select to authenticated using (app_role() = 'admin');
create policy "admin insert" on fabric_calculation_lines for insert to authenticated with check (app_role() = 'admin');
create policy "admin update" on fabric_calculation_lines for update to authenticated
  using (app_role() = 'admin') with check (app_role() = 'admin');
create policy "admin delete" on fabric_calculation_lines for delete to authenticated using (app_role() = 'admin');

-- Simpan (p_id null = baru). p_lines: [{ "product_id": "...", "color": "Black", "qty_pcs": 100 }, ...]
create or replace function save_fabric_calculation(
  p_id uuid, p_title text, p_calc_date date, p_po_id uuid, p_note text, p_lines jsonb
) returns uuid language plpgsql security invoker as $$
declare v_id uuid := p_id; v_prefix text; v_seq int;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Minimal 1 produk'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) x where coalesce((x->>'qty_pcs')::int, 0) <= 0) then
    raise exception 'Jumlah pcs harus lebih dari 0';
  end if;
  if p_calc_date is null then raise exception 'Tanggal wajib diisi'; end if;

  if v_id is null then
    v_prefix := 'KK-' || to_char(p_calc_date, 'YYYYMMDD');
    perform pg_advisory_xact_lock(hashtext(v_prefix));
    select coalesce(max(substring(calc_no from length(v_prefix) + 2)::int), 0) + 1 into v_seq
      from fabric_calculations where calc_no like v_prefix || '-%';
    insert into fabric_calculations (calc_no, title, calc_date, po_id, note)
    values (v_prefix || '-' || lpad(v_seq::text, 3, '0'), nullif(trim(p_title), ''), p_calc_date, p_po_id, nullif(trim(p_note), ''))
    returning id into v_id;
  else
    update fabric_calculations set
      title = nullif(trim(p_title), ''),
      calc_date = p_calc_date,
      po_id = p_po_id,
      note = nullif(trim(p_note), ''),
      updated_at = now(),
      updated_by_name = current_user_name()
    where id = v_id;
    if not found then raise exception 'Perhitungan tidak ditemukan'; end if;
    delete from fabric_calculation_lines where calc_id = v_id;
  end if;

  insert into fabric_calculation_lines (calc_id, line_no, product_id, color, qty_pcs, fabric_type, fabric_unit, fabric_qty, fabric_pcs)
  select v_id, x.ord::int, p.id, nullif(trim(x.v->>'color'), ''), (x.v->>'qty_pcs')::int,
         p.fabric_type, p.fabric_unit, p.fabric_qty, p.fabric_pcs
  from jsonb_array_elements(p_lines) with ordinality as x(v, ord)
  join products p on p.id = (x.v->>'product_id')::uuid;
  if (select count(*) from fabric_calculation_lines where calc_id = v_id) <> jsonb_array_length(p_lines) then
    raise exception 'Produk tidak ditemukan';
  end if;

  return v_id;
end $$;
