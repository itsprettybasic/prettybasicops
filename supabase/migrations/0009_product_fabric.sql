-- Pemakaian kain per produk, untuk Kalkulator Kain & kebutuhan kain per PO.
-- Disimpan sebagai rasio "fabric_qty <satuan> kain → fabric_pcs pcs", mis. 1 kg → 4 pcs, atau 1.5 yard → 1 pcs.
-- Kain per pcs = fabric_qty / fabric_pcs.

alter table products
  add column fabric_type text,
  add column fabric_unit text check (fabric_unit in ('kg', 'yard')),
  add column fabric_qty numeric(10,3) check (fabric_qty > 0),
  add column fabric_pcs numeric(10,2) check (fabric_pcs > 0),
  add constraint products_fabric_complete check (
    (fabric_unit is null and fabric_qty is null and fabric_pcs is null)
    or (fabric_unit is not null and fabric_qty is not null and fabric_pcs is not null)
  );
