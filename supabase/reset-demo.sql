-- Hapus data demo dari seed (jalankan di Supabase SQL Editor). Data asli (source manual/excel) tidak disentuh,
-- kecuali baris yang memakai SKU demo.
begin;
delete from stock_documents where source = 'seed';
delete from production_batches where note = 'seed-demo';
delete from stock_document_lines where sku_id in (select s.id from skus s join products p on p.id = s.product_id where p.category = 'demo');
delete from production_batch_lines where sku_id in (select s.id from skus s join products p on p.id = s.product_id where p.category = 'demo');
delete from skus where product_id in (select id from products where category = 'demo');
delete from products where category = 'demo';
commit;
