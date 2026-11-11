-- Semua catatan stock (barang masuk & keluar, semua tipe) bisa diedit dan dihapus oleh admin.
-- Stock tidak pernah diblokir: barang keluar boleh membuat stock minus.

-- ── Hak hapus: semua tipe (sebelumnya hanya Penerimaan Barang) ──
drop policy if exists "admin delete receipt" on stock_documents;
drop policy if exists "admin delete receipt lines" on stock_document_lines;
drop policy if exists "admin delete" on stock_documents;
drop policy if exists "admin delete" on stock_document_lines;
create policy "admin delete" on stock_documents for delete to authenticated using (app_role() = 'admin');
create policy "admin delete" on stock_document_lines for delete to authenticated using (app_role() = 'admin');

-- ── Ubah catatan apa saja: tipe (searah), tanggal, channel, catatan, qty per SKU ──
-- Penerimaan PO tetap terhubung ke PO-nya; status PO disinkronkan ulang.
create or replace function update_stock_document(
  p_id uuid, p_type movement_type, p_doc_date date, p_channel sales_channel, p_note text, p_lines jsonb
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
  if (v_doc.type = 'produksi') <> (p_type = 'produksi') then
    raise exception 'Tipe Penerimaan PO tidak bisa diganti ke tipe lain (atau sebaliknya)';
  end if;

  update stock_documents set
    type = p_type,
    doc_date = p_doc_date,
    channel = case when v_doc.direction = 'out' then p_channel end,
    note = nullif(trim(p_note), ''),
    updated_at = now(),
    updated_by_name = current_user_name()
  where id = p_id;   -- constraint direction_matches_type menolak tipe yang tidak searah

  delete from stock_document_lines where document_id = p_id;
  insert into stock_document_lines (document_id, sku_id, qty)
  select p_id, (x->>'sku_id')::uuid, sum((x->>'qty')::int)
  from jsonb_array_elements(p_lines) x group by (x->>'sku_id')::uuid;

  if v_doc.po_id is not null then perform sync_po_status(v_doc.po_id); end if;
end $$;

-- ── Hapus catatan apa saja (permanen). Stock otomatis menyesuaikan. ──
create or replace function delete_stock_document(p_id uuid)
returns void language plpgsql security invoker as $$
declare v_doc stock_documents;
begin
  select * into v_doc from stock_documents where id = p_id for update;
  if not found then raise exception 'Catatan tidak ditemukan'; end if;
  delete from stock_documents where id = p_id;
  if not found then raise exception 'Tidak punya izin menghapus catatan ini'; end if;
  if v_doc.po_id is not null then perform sync_po_status(v_doc.po_id); end if;
end $$;

-- Penerimaan yang sudah dibatalkan juga boleh diedit
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

grant execute on function update_stock_document, delete_stock_document, update_receipt to authenticated;
revoke execute on function update_stock_document, delete_stock_document, update_receipt from anon, public;
