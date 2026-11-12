export interface Warehouse {
  id: string;
  name: string;
  address: string | null;
  note: string | null;
  is_active: boolean;
  counts_in_ppic: boolean;
  is_default: boolean;
}

export const WAREHOUSE_COLS = "id, name, address, note, is_active, counts_in_ppic, is_default";

/** Gudang utama dulu, lalu urut nama. */
export function sortWarehouses<T extends Pick<Warehouse, "name" | "is_default">>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name, "id"));
}
