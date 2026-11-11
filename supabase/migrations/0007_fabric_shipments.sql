-- Pengiriman Kain ke Vendor: catatan kain apa saja yang dikirim ke vendor (qty dalam KG) + dokumen Surat Jalan.

create table fabric_shipments (
  id uuid primary key default gen_random_uuid(),
  sj_no text not null unique,
  ship_date date not null,
  vendor_id uuid not null references vendors(id),
  po_id uuid references purchase_orders(id) on delete set null,   -- opsional: kain untuk PO tertentu
  status text not null default 'dikirim' check (status in ('dikirim', 'diterima')),
  received_date date,
  received_by text,                                                  -- nama penerima di vendor
  driver_name text,
  vehicle_no text,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_by_name text default current_user_name(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  updated_by_name text,
  constraint received_after_ship check (received_date is null or received_date >= ship_date)
);
create index on fabric_shipments(ship_date);
create index on fabric_shipments(vendor_id);

create table fabric_shipment_lines (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references fabric_shipments(id) on delete cascade,
  line_no int not null,
  fabric_type text not null check (length(trim(fabric_type)) > 0),
  color text not null check (length(trim(color)) > 0),
  qty_kg numeric(10,2) not null check (qty_kg > 0),
  roll_count int check (roll_count is null or roll_count >= 0),
  note text,
  unique (shipment_id, line_no)
);
create index on fabric_shipment_lines(fabric_type);

alter table fabric_shipments enable row level security;
alter table fabric_shipment_lines enable row level security;
do $$
declare t text;
begin
  foreach t in array array['fabric_shipments', 'fabric_shipment_lines'] loop
    execute format('create policy "admin select" on %I for select to authenticated using (app_role() = ''admin'')', t);
    execute format('create policy "admin insert" on %I for insert to authenticated with check (app_role() = ''admin'')', t);
    execute format('create policy "admin update" on %I for update to authenticated using (app_role() = ''admin'') with check (app_role() = ''admin'')', t);
    execute format('create policy "admin delete" on %I for delete to authenticated using (app_role() = ''admin'')', t);
  end loop;
end $$;

create view v_fabric_shipment_summary with (security_invoker = true) as
select f.*,
  v.name as vendor_name,
  po.po_no,
  (select count(*) from fabric_shipment_lines l where l.shipment_id = f.id)::int as line_count,
  (select coalesce(sum(l.qty_kg), 0) from fabric_shipment_lines l where l.shipment_id = f.id) as total_kg,
  (select coalesce(sum(l.roll_count), 0) from fabric_shipment_lines l where l.shipment_id = f.id)::int as total_roll,
  (select string_agg(distinct l.fabric_type, '|') from fabric_shipment_lines l where l.shipment_id = f.id) as fabric_types,
  (select string_agg(distinct l.color, '|') from fabric_shipment_lines l where l.shipment_id = f.id) as colors
from fabric_shipments f
join vendors v on v.id = f.vendor_id
left join purchase_orders po on po.id = f.po_id;

-- Nomor Surat Jalan berikutnya: SJ-YYYY-NNNN
create or replace function next_sj_no(p_year int)
returns text language sql stable security invoker as $$
  select 'SJ-' || p_year || '-' || lpad((coalesce(max(
    case when sj_no ~ ('^SJ-' || p_year || '-[0-9]+$') then split_part(sj_no, '-', 3)::int end
  ), 0) + 1)::text, 4, '0')
  from fabric_shipments
$$;

-- Buat (p_id null) atau ubah pengiriman kain + baris kain secara atomik.
-- p_lines: [{ "fabric_type": "Rayon", "color": "Hitam", "qty_kg": 25.5, "roll_count": 2, "note": null }, ...]
create or replace function save_fabric_shipment(
  p_id uuid, p_sj_no text, p_ship_date date, p_vendor_id uuid, p_po_id uuid,
  p_driver_name text, p_vehicle_no text, p_note text, p_lines jsonb
) returns uuid language plpgsql security invoker as $$
declare v_id uuid := p_id;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Minimal 1 baris kain'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) x
             where coalesce(trim(x->>'fabric_type'), '') = '' or coalesce(trim(x->>'color'), '') = '') then
    raise exception 'Jenis kain dan warna wajib diisi';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lines) x where coalesce((x->>'qty_kg')::numeric, 0) <= 0) then
    raise exception 'Qty (kg) harus lebih dari 0';
  end if;

  if v_id is null then
    insert into fabric_shipments (sj_no, ship_date, vendor_id, po_id, driver_name, vehicle_no, note)
    values (upper(trim(p_sj_no)), p_ship_date, p_vendor_id, p_po_id,
            nullif(trim(p_driver_name), ''), nullif(upper(trim(p_vehicle_no)), ''), nullif(trim(p_note), ''))
    returning id into v_id;
  else
    update fabric_shipments set
      sj_no = upper(trim(p_sj_no)), ship_date = p_ship_date, vendor_id = p_vendor_id, po_id = p_po_id,
      driver_name = nullif(trim(p_driver_name), ''), vehicle_no = nullif(upper(trim(p_vehicle_no)), ''),
      note = nullif(trim(p_note), ''), updated_at = now(), updated_by_name = current_user_name()
    where id = v_id;
    if not found then raise exception 'Pengiriman tidak ditemukan'; end if;
    delete from fabric_shipment_lines where shipment_id = v_id;
  end if;

  insert into fabric_shipment_lines (shipment_id, line_no, fabric_type, color, qty_kg, roll_count, note)
  select v_id, x.ord::int, trim(x.v->>'fabric_type'), trim(x.v->>'color'), round((x.v->>'qty_kg')::numeric, 2),
         nullif(x.v->>'roll_count', '')::int, nullif(trim(x.v->>'note'), '')
  from jsonb_array_elements(p_lines) with ordinality as x(v, ord);

  return v_id;
end $$;

grant execute on function next_sj_no, save_fabric_shipment to authenticated;
revoke execute on function next_sj_no, save_fabric_shipment from anon;
