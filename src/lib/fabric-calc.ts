import type { FabricUnit } from "@/lib/fabric";

export interface CalcLineInput {
  product_id: string;
  product_name: string;
  color: string | null;
  qty_pcs: number;
  fabric_type: string | null;
  fabric_unit: FabricUnit | null;
  fabric_qty: number | null;
  fabric_pcs: number | null;
}

export interface FabricNeedRow {
  key: string;
  fabric_type: string;
  color: string | null;
  unit: FabricUnit;
  total: number;
  pcs: number;
  products: string[];
}

export function lineNeed(l: CalcLineInput): number | null {
  if (!l.fabric_unit || !l.fabric_qty || !l.fabric_pcs || !(l.qty_pcs > 0)) return null;
  return (l.fabric_qty / l.fabric_pcs) * l.qty_pcs;
}

/** Kebutuhan kain digabung per jenis kain + warna + satuan. */
export function fabricNeeds(lines: CalcLineInput[]) {
  const m = new Map<string, FabricNeedRow>();
  const missing = new Set<string>();
  const totals: Partial<Record<FabricUnit, number>> = {};
  for (const l of lines) {
    const need = lineNeed(l);
    if (need === null) {
      if (l.qty_pcs > 0) missing.add(l.product_name);
      continue;
    }
    const type = l.fabric_type?.trim() || "Jenis kain belum diisi";
    const key = `${type.toLowerCase()}|${(l.color ?? "").toLowerCase()}|${l.fabric_unit}`;
    const row = m.get(key) ?? { key, fabric_type: type, color: l.color, unit: l.fabric_unit!, total: 0, pcs: 0, products: [] };
    row.total += need;
    row.pcs += l.qty_pcs;
    if (!row.products.includes(l.product_name)) row.products.push(l.product_name);
    m.set(key, row);
    totals[l.fabric_unit!] = (totals[l.fabric_unit!] ?? 0) + need;
  }
  const rows = [...m.values()].sort(
    (a, b) => a.fabric_type.localeCompare(b.fabric_type, "id") || (a.color ?? "").localeCompare(b.color ?? "", "id") || a.unit.localeCompare(b.unit),
  );
  return { rows, missing: [...missing], totals };
}

export function fmtFabric(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

/** "Rayon Black 25 kg · Linen 10 yard" */
export function needsSummary(lines: CalcLineInput[], max = 3): string {
  const { rows } = fabricNeeds(lines);
  if (rows.length === 0) return "—";
  const parts = rows.slice(0, max).map((r) => `${r.fabric_type}${r.color ? ` ${r.color}` : ""} ${fmtFabric(r.total)} ${r.unit}`);
  return parts.join(" · ") + (rows.length > max ? ` · +${rows.length - max} lagi` : "");
}
