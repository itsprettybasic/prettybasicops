import "server-only";
import { createClient } from "@/lib/supabase/server";
import { WAREHOUSE_COLS, sortWarehouses, type Warehouse } from "@/lib/stock/warehouse-types";
import { fetchAll } from "./fetch-all";

/** Semua gudang (aktif & nonaktif). Kosong kalau tabel belum ada. */
export async function getWarehouses(): Promise<Warehouse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("warehouses").select(WAREHOUSE_COLS);
  if (error) return [];
  return sortWarehouses((data ?? []) as Warehouse[]);
}

/** Stock per SKU per gudang: warehouse_id → sku_id → stock. */
export async function getWarehouseStock(): Promise<Record<string, Record<string, number>>> {
  const supabase = await createClient();
  const rows = await fetchAll<{ sku_id: string; warehouse_id: string; stock: number }>(() =>
    supabase.from("v_sku_warehouse_stock").select("sku_id, warehouse_id, stock").order("sku_id").order("warehouse_id"),
  );
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) (out[r.warehouse_id] ??= {})[r.sku_id] = r.stock;
  return out;
}
