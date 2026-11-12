-- PO: keterangan Batch (mis. "3") untuk nama dokumen & pencarian, mis. "PO Jahit Anang Batch 3 12 Nov 2026".

alter table purchase_orders add column if not exists batch text check (batch is null or length(batch) <= 40);

-- v_po_summary memakai po.* → buat ulang supaya kolom batch ikut
drop view if exists v_po_summary;
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
grant select on v_po_summary to authenticated;
revoke all on v_po_summary from anon;

-- Batch berikutnya untuk vendor: angka batch terbesar + 1 (batch yang bukan angka diabaikan)
create or replace function next_po_batch(p_vendor_id uuid)
returns text language sql stable security invoker as $$
  select (coalesce(max(substring(batch from '([0-9]+)')::int), 0) + 1)::text
  from purchase_orders where vendor_id = p_vendor_id
$$;

drop function if exists save_purchase_order(uuid, text, uuid, date, date, po_status, text, jsonb);
create or replace function save_purchase_order(
  p_id uuid, p_po_no text, p_vendor_id uuid, p_po_date date, p_expected_date date,
  p_status po_status, p_note text, p_lines jsonb, p_batch text default null
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
    insert into purchase_orders (po_no, vendor_id, po_date, expected_date, status, note, batch)
    values (upper(trim(p_po_no)), p_vendor_id, p_po_date, p_expected_date, p_status, nullif(trim(p_note), ''),
            nullif(trim(p_batch), ''))
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
      batch = nullif(trim(p_batch), ''),
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

grant execute on function next_po_batch, save_purchase_order to authenticated;
revoke execute on function next_po_batch, save_purchase_order from anon, public;
