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

// ── Pengiriman kain: satuan per baris ──────────────
export const SHIPMENT_UNITS = ["kg", "yard", "meter", "roll"] as const;
export type ShipmentUnit = (typeof SHIPMENT_UNITS)[number];
export const SHIPMENT_UNIT_LABEL: Record<ShipmentUnit, string> = { kg: "KG", yard: "Yard", meter: "Meter", roll: "Roll" };

const qtyFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

/** "25,5 kg", "10 yard", "3 roll" */
export function fmtFabricQty(qty: number | string, unit: string): string {
  const n = Number(qty);
  return `${Number.isFinite(n) ? qtyFormat.format(n) : "—"} ${unit}`;
}

export type UnitTotals = Partial<Record<string, number>>;

/** Jumlahkan qty per satuan. */
export function sumByUnit(lines: { qty: number | string; unit: string }[]): UnitTotals {
  const t: UnitTotals = {};
  for (const l of lines) t[l.unit] = (t[l.unit] ?? 0) + Number(l.qty);
  return t;
}

/** Gabung beberapa total per satuan (mis. dari banyak surat jalan). */
export function mergeUnitTotals(list: (UnitTotals | null | undefined)[]): UnitTotals {
  const t: UnitTotals = {};
  for (const x of list) for (const [u, q] of Object.entries(x ?? {})) t[u] = (t[u] ?? 0) + Number(q);
  return t;
}

/** "25 kg · 10 yard" (urut KG, Yard, Meter, Roll); kosong → "—" */
export function fmtUnitTotals(t: UnitTotals | null | undefined): string {
  const order = (u: string) => {
    const i = (SHIPMENT_UNITS as readonly string[]).indexOf(u);
    return i < 0 ? 99 : i;
  };
  const parts = Object.entries(t ?? {})
    .filter(([, q]) => Number(q) > 0)
    .sort(([a], [b]) => order(a) - order(b))
    .map(([u, q]) => fmtFabricQty(q!, u));
  return parts.length ? parts.join(" · ") : "—";
}
