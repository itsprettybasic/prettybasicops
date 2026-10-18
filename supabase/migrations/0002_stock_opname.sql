-- Stock Opname: hitung fisik → sistem membuat Adjustment +/− sebesar selisihnya, jadi stock = hasil hitung.

alter table stock_documents drop constraint stock_documents_source_check;
alter table stock_documents add constraint stock_documents_source_check
  check (source in ('manual', 'excel', 'seed', 'opname'));

create or replace function create_stock_opname(
  p_doc_date date, p_note text,
  p_lines jsonb   -- [{ "sku_id": "...", "counted": 12 }, ...]
) returns jsonb language plpgsql security invoker as $$
declare v_in jsonb; v_out jsonb; v_in_id uuid; v_out_id uuid; v_note text; v_counted int;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Minimal 1 SKU'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) x where (x->>'counted')::int < 0) then
    raise exception 'Stock fisik tidak boleh minus';
  end if;

  -- Satu opname dalam satu waktu, supaya selisih dihitung dari stock terbaru
  perform pg_advisory_xact_lock(hashtext('stock-opname'));

  with c as (
    select (x->>'sku_id')::uuid as sku_id, max((x->>'counted')::int) as counted
    from jsonb_array_elements(p_lines) x group by 1
  ), d as (
    select c.sku_id, c.counted - coalesce(s.stock, 0) as diff
    from c left join v_sku_stock s on s.sku_id = c.sku_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('sku_id', sku_id, 'qty', diff)) filter (where diff > 0), '[]'),
         coalesce(jsonb_agg(jsonb_build_object('sku_id', sku_id, 'qty', -diff)) filter (where diff < 0), '[]'),
         count(*)
    into v_in, v_out, v_counted
  from d;

  v_note := 'Stock Opname' || coalesce(' · ' || nullif(trim(p_note), ''), '');
  if jsonb_array_length(v_in) > 0 then
    v_in_id := create_stock_document('in', 'adjustment_in', p_doc_date, null, null, v_note, 'opname', v_in);
  end if;
  if jsonb_array_length(v_out) > 0 then
    v_out_id := create_stock_document('out', 'adjustment_out', p_doc_date, null, null, v_note, 'opname', v_out);
  end if;

  return jsonb_build_object(
    'counted', v_counted,
    'changed', jsonb_array_length(v_in) + jsonb_array_length(v_out),
    'plus', (select coalesce(sum((x->>'qty')::int), 0) from jsonb_array_elements(v_in) x),
    'minus', (select coalesce(sum((x->>'qty')::int), 0) from jsonb_array_elements(v_out) x),
    'in_id', v_in_id, 'out_id', v_out_id
  );
end $$;
