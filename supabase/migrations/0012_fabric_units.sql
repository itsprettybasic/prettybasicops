-- Pengiriman kain: satuan per baris (kg / yard / meter / roll, default kg). qty_kg → qty.
-- Kolom roll_count lama dibiarkan (tidak dipakai lagi di aplikasi; Roll sekarang salah satu satuan).

alter table fabric_shipment_lines rename column qty_kg to qty;
alter table fabric_shipment_lines
  add column unit text not null default 'kg' check (unit in ('kg', 'yard', 'meter', 'roll'));

drop view if exists v_fabric_shipment_summary;
create view v_fabric_shipment_summary with (security_invoker = true) as
select f.*,
  v.name as vendor_name,
  po.po_no,
  (select count(*) from fabric_shipment_lines l where l.shipment_id = f.id)::int as line_count,
  (select coalesce(sum(l.qty), 0) from fabric_shipment_lines l where l.shipment_id = f.id and l.unit = 'kg') as total_kg,
  -- Total per satuan, mis. {"kg": 25.5, "yard": 10}
  (select coalesce(jsonb_object_agg(t.unit, t.qty), '{}'::jsonb)
     from (select l.unit, sum(l.qty) as qty from fabric_shipment_lines l where l.shipment_id = f.id group by l.unit) t
  ) as qty_by_unit,
  (select coalesce(sum(l.roll_count), 0) from fabric_shipment_lines l where l.shipment_id = f.id)::int as total_roll,
  (select string_agg(distinct l.fabric_type, '|') from fabric_shipment_lines l where l.shipment_id = f.id) as fabric_types,
  (select string_agg(distinct l.color, '|') from fabric_shipment_lines l where l.shipment_id = f.id) as colors
from fabric_shipments f
join vendors v on v.id = f.vendor_id
left join purchase_orders po on po.id = f.po_id;
grant select on v_fabric_shipment_summary to authenticated;
revoke all on v_fabric_shipment_summary from anon;

-- p_lines: [{ "fabric_type": "Rayon", "color": "Hitam", "qty": 25.5, "unit": "kg", "note": null }, ...]
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
  if exists (select 1 from jsonb_array_elements(p_lines) x
             where coalesce((coalesce(x->>'qty', x->>'qty_kg'))::numeric, 0) <= 0) then
    raise exception 'Qty harus lebih dari 0';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lines) x
             where coalesce(x->>'unit', 'kg') not in ('kg', 'yard', 'meter', 'roll')) then
    raise exception 'Satuan harus KG, Yard, Meter, atau Roll';
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

  insert into fabric_shipment_lines (shipment_id, line_no, fabric_type, color, qty, unit, roll_count, note)
  select v_id, x.ord::int, trim(x.v->>'fabric_type'), trim(x.v->>'color'),
         round((coalesce(x.v->>'qty', x.v->>'qty_kg'))::numeric, 2), coalesce(x.v->>'unit', 'kg'),
         nullif(x.v->>'roll_count', '')::int, nullif(trim(x.v->>'note'), '')
  from jsonb_array_elements(p_lines) with ordinality as x(v, ord);

  return v_id;
end $$;
