-- Log penghapusan catatan stock: setiap catatan barang masuk/keluar yang dihapus disimpan salinannya
-- (header + SKU & qty) beserta siapa yang menghapus dan kapan. Hanya bisa dibaca admin, tidak bisa diubah/dihapus.

create table stock_document_deletions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  doc_no text not null,
  direction movement_direction not null,
  type movement_type not null,
  doc_date date not null,
  channel sales_channel,
  po_no text,
  note text,
  source text,
  voided_at timestamptz,
  void_reason text,
  created_by_name text,
  created_at timestamptz,
  lines jsonb not null default '[]'::jsonb,   -- [{ sku_id, code, label, qty }]
  sku_count int not null default 0,
  total_qty int not null default 0,
  deleted_by uuid default auth.uid(),
  deleted_by_name text default current_user_name(),
  deleted_at timestamptz not null default now()
);
create index on stock_document_deletions(direction, doc_date);
create index on stock_document_deletions(deleted_at);

alter table stock_document_deletions enable row level security;
create policy "admin select" on stock_document_deletions for select to authenticated using (app_role() = 'admin');
-- Tidak ada policy insert/update/delete: baris hanya ditulis oleh trigger di bawah.

-- BEFORE DELETE: baris SKU masih ada (cascade berjalan sesudahnya), jadi bisa disalin.
create or replace function log_stock_document_deletion() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_lines jsonb; v_po text;
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

  insert into stock_document_deletions (
    document_id, doc_no, direction, type, doc_date, channel, po_no, note, source, voided_at, void_reason,
    created_by_name, created_at, lines, sku_count, total_qty)
  values (
    old.id, old.doc_no, old.direction, old.type, old.doc_date, old.channel, v_po, old.note, old.source,
    old.voided_at, old.void_reason, old.created_by_name, old.created_at, v_lines,
    jsonb_array_length(v_lines), coalesce((select sum((x->>'qty')::int) from jsonb_array_elements(v_lines) x), 0));
  return old;
end $$;

drop trigger if exists stock_document_deletion_log on stock_documents;
create trigger stock_document_deletion_log before delete on stock_documents
  for each row execute function log_stock_document_deletion();

revoke execute on function log_stock_document_deletion from public, anon, authenticated;
