import { PageHeader } from "@/components/layout/page-header";
import { CalcList } from "@/components/fabric-calc/calc-list";
import type { CalcProduct, FabricCalc, PoOption } from "@/components/fabric-calc/types";
import type { FabricUnit } from "@/lib/fabric";
import { fetchAll } from "@/lib/data/fetch-all";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Kalkulator Kain · Pretty Basic" };

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

type RawLine = {
  line_no: number;
  product_id: string;
  color: string | null;
  qty_pcs: number;
  fabric_type: string | null;
  fabric_unit: FabricUnit | null;
  fabric_qty: string | null;
  fabric_pcs: string | null;
  products: { name: string } | null;
};

export default async function KalkulatorKainPage() {
  const supabase = await createClient();
  let calcs: FabricCalc[] = [];
  let products: CalcProduct[] = [];
  let pos: PoOption[] = [];
  let loadError: string | null = null;
  try {
    const [calcRows, productRows, skuRows, poRes] = await Promise.all([
      fetchAll<Record<string, unknown>>(() =>
        supabase
          .from("fabric_calculations")
          .select(
            "id, calc_no, title, calc_date, po_id, note, created_by_name, created_at, updated_by_name, updated_at, purchase_orders(po_no), fabric_calculation_lines(line_no, product_id, color, qty_pcs, fabric_type, fabric_unit, fabric_qty, fabric_pcs, products(name))",
          )
          .order("calc_date", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id"),
      ),
      fetchAll<Record<string, unknown>>(() =>
        supabase.from("products").select("id, name, is_active, fabric_type, fabric_unit, fabric_qty, fabric_pcs").order("name").order("id"),
      ),
      fetchAll<{ product_id: string; color: string }>(() => supabase.from("skus").select("product_id, color").order("id")),
      supabase
        .from("purchase_orders")
        .select("id, po_no, batch, po_date, status, vendors(name), purchase_order_lines(qty, skus(product_id, color))")
        .neq("status", "cancelled")
        .order("po_date", { ascending: false })
        .order("po_no", { ascending: false })
        .limit(60),
    ]);
    if (poRes.error) throw new Error(poRes.error.message);

    const colorMap = new Map<string, Set<string>>();
    for (const s of skuRows) {
      const set = colorMap.get(s.product_id) ?? new Set<string>();
      set.add(s.color);
      colorMap.set(s.product_id, set);
    }
    products = productRows.map((p) => ({
      id: p.id as string,
      name: p.name as string,
      is_active: p.is_active as boolean,
      fabric_type: (p.fabric_type as string | null) ?? null,
      fabric_unit: (p.fabric_unit as FabricUnit | null) ?? null,
      fabric_qty: num(p.fabric_qty),
      fabric_pcs: num(p.fabric_pcs),
      colors: [...(colorMap.get(p.id as string) ?? [])].sort((a, b) => a.localeCompare(b, "id")),
    }));

    calcs = calcRows.map((r) => {
      const lines = ((r.fabric_calculation_lines as RawLine[]) ?? []).sort((a, b) => a.line_no - b.line_no);
      return {
        id: r.id as string,
        calc_no: r.calc_no as string,
        title: (r.title as string | null) ?? null,
        calc_date: r.calc_date as string,
        po_id: (r.po_id as string | null) ?? null,
        po_no: (r.purchase_orders as { po_no: string } | null)?.po_no ?? null,
        note: (r.note as string | null) ?? null,
        created_by_name: (r.created_by_name as string | null) ?? null,
        created_at: r.created_at as string,
        updated_by_name: (r.updated_by_name as string | null) ?? null,
        updated_at: (r.updated_at as string | null) ?? null,
        lines: lines.map((l) => ({
          product_id: l.product_id,
          product_name: l.products?.name ?? "—",
          color: l.color,
          qty_pcs: l.qty_pcs,
          fabric_type: l.fabric_type,
          fabric_unit: l.fabric_unit,
          fabric_qty: num(l.fabric_qty),
          fabric_pcs: num(l.fabric_pcs),
        })),
      };
    });

    pos = ((poRes.data ?? []) as unknown as {
      id: string;
      po_no: string;
      batch: string | null;
      po_date: string;
      vendors: { name: string } | null;
      purchase_order_lines: { qty: number; skus: { product_id: string; color: string } | null }[];
    }[]).map((po) => {
      const agg = new Map<string, { product_id: string; color: string; qty: number }>();
      for (const l of po.purchase_order_lines) {
        if (!l.skus) continue;
        const k = `${l.skus.product_id}|${l.skus.color}`;
        const row = agg.get(k) ?? { product_id: l.skus.product_id, color: l.skus.color, qty: 0 };
        row.qty += Number(l.qty);
        agg.set(k, row);
      }
      return { id: po.id, po_no: po.po_no, batch: po.batch, po_date: po.po_date, vendor_name: po.vendors?.name ?? "—", lines: [...agg.values()] };
    });
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <PageHeader title="Kalkulator Kain" sub="Tulis rencana produksi, langsung tahu butuh kain apa saja · hasilnya bisa disimpan & diedit" />
      <CalcList calcs={calcs} products={products} pos={pos} loadError={loadError} />
    </div>
  );
}
