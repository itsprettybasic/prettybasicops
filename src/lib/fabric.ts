export const FABRIC_UNITS = ["kg", "yard"] as const;
export type FabricUnit = (typeof FABRIC_UNITS)[number];

/** Pemakaian kain produk: `qty` <unit> kain menghasilkan `pcs` pcs. */
export interface FabricUsage {
  fabric_type: string | null;
  fabric_unit: FabricUnit | null;
  fabric_qty: number | null;
  fabric_pcs: number | null;
}

/** Kain yang dibutuhkan untuk 1 pcs, atau null kalau belum diisi. */
export function fabricPerPcs(p: FabricUsage): number | null {
  if (!p.fabric_unit || !p.fabric_qty || !p.fabric_pcs) return null;
  return p.fabric_qty / p.fabric_pcs;
}

/** Total kain untuk `qtyPcs` pcs (dalam satuan p.fabric_unit), atau null kalau belum diisi. */
export function fabricNeed(p: FabricUsage, qtyPcs: number): number | null {
  const per = fabricPerPcs(p);
  return per === null ? null : per * qtyPcs;
}

function num(n: number, max = 3) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: max });
}

/** Ringkasan singkat, mis. "1 kg → 4 pcs · 0,25 kg/pcs". */
export function fabricSummary(p: FabricUsage): string | null {
  const per = fabricPerPcs(p);
  if (per === null) return null;
  return `${num(p.fabric_qty!)} ${p.fabric_unit} → ${num(p.fabric_pcs!, 2)} pcs · ${num(per)} ${p.fabric_unit}/pcs`;
}
