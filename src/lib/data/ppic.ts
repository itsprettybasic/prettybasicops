import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import {
  computePpic,
  computeRanking,
  DEFAULT_PARAMS,
  monthKey,
  monthStart,
  type PpicParams,
  type PpicResult,
  type RankClass,
} from "@/lib/ppic";
import { fetchAll } from "./fetch-all";

export interface SkuInfo {
  id: string;
  code: string;
  color: string;
  size: string;
  launch_date: string;
  rank_override: RankClass | null;
  unit_cost: number | null;
  is_active: boolean;
  product_id: string;
  product_name: string;
  /** "Produk · Warna · Size" */
  label: string;
}

export interface PpicRow extends SkuInfo, PpicResult {
  stock: number;
  inProduction: number;
  rank: RankClass;
  rankAuto: RankClass;
  rankOverridden: boolean;
}

export interface MonthStarts {
  h3: string;
  h2: string;
  h1: string;
  current: string;
}

export interface PpicData {
  today: string;
  months: MonthStarts;
  params: PpicParams;
  rows: PpicRow[];
}

export function skuLabel(productName: string, color: string, size: string) {
  return `${productName} · ${color} · ${size}`;
}

export async function getParams(): Promise<PpicParams> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ppic_parameters").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return DEFAULT_PARAMS;
  const p = { ...DEFAULT_PARAMS };
  for (const key of Object.keys(DEFAULT_PARAMS) as (keyof PpicParams)[]) {
    const value = data[key];
    if (value !== null && value !== undefined) (p as Record<string, unknown>)[key] = key === "rounding" ? value : Number(value);
  }
  return p;
}

interface SkuQueryRow {
  id: string;
  code: string;
  color: string;
  size: string;
  launch_date: string;
  rank_override: RankClass | null;
  unit_cost: number | string | null;
  is_active: boolean;
  product_id: string;
  products: { name: string } | null;
}

export async function getSkus(opts: { includeInactive?: boolean } = {}): Promise<SkuInfo[]> {
  const supabase = await createClient();
  const rows = await fetchAll<SkuQueryRow>(() => {
    let q = supabase
      .from("skus")
      .select("id, code, color, size, launch_date, rank_override, unit_cost, is_active, product_id, products(name)")
      .order("code");
    if (!opts.includeInactive) q = q.eq("is_active", true);
    return q;
  });
  return rows.map((r) => {
    const productName = r.products?.name ?? "—";
    return {
      id: r.id,
      code: r.code,
      color: r.color,
      size: r.size,
      launch_date: r.launch_date,
      rank_override: r.rank_override,
      unit_cost: r.unit_cost === null ? null : Number(r.unit_cost),
      is_active: r.is_active,
      product_id: r.product_id,
      product_name: productName,
      label: skuLabel(productName, r.color, r.size),
    };
  });
}

/** Semua angka PPIC untuk semua SKU aktif. Di-cache per request supaya layout & halaman berbagi hasil. */
export const getPpicData = cache(async (): Promise<PpicData> => {
  const supabase = await createClient();
  const today = todayJakarta();
  const months: MonthStarts = {
    h3: monthStart(today, -3),
    h2: monthStart(today, -2),
    h1: monthStart(today, -1),
    current: monthStart(today, 0),
  };

  const [params, skus, stock, inProduction, monthly, lastSale] = await Promise.all([
    getParams(),
    getSkus(),
    fetchAll<{ sku_id: string; stock: number }>(() => supabase.from("v_sku_stock").select("sku_id, stock")),
    fetchAll<{ sku_id: string; in_production: number }>(() =>
      supabase.from("v_sku_in_production").select("sku_id, in_production"),
    ),
    fetchAll<{ sku_id: string; month: string; qty: number }>(() =>
      supabase.from("v_sku_monthly_sales").select("sku_id, month, qty").gte("month", months.h3),
    ),
    fetchAll<{ sku_id: string; last_sale_date: string }>(() =>
      supabase.from("v_sku_last_sale").select("sku_id, last_sale_date"),
    ),
  ]);

  const stockMap = new Map(stock.map((r) => [r.sku_id, r.stock]));
  const prodMap = new Map(inProduction.map((r) => [r.sku_id, r.in_production]));
  const lastSaleMap = new Map(lastSale.map((r) => [r.sku_id, r.last_sale_date]));
  const salesMap = new Map<string, Record<string, number>>();
  for (const r of monthly) {
    const entry = salesMap.get(r.sku_id) ?? {};
    entry[monthKey(r.month)] = r.qty;
    salesMap.set(r.sku_id, entry);
  }

  const threeMonthTotals = new Map<string, number>();
  for (const s of skus) {
    const sales = salesMap.get(s.id) ?? {};
    threeMonthTotals.set(
      s.id,
      (sales[monthKey(months.h3)] ?? 0) + (sales[monthKey(months.h2)] ?? 0) + (sales[monthKey(months.h1)] ?? 0),
    );
  }
  const ranks = computeRanking(threeMonthTotals, params);

  const rows: PpicRow[] = skus.map((s) => {
    const stockQty = stockMap.get(s.id) ?? 0;
    const inProd = prodMap.get(s.id) ?? 0;
    const result = computePpic(
      {
        launchDate: s.launch_date,
        monthlySales: salesMap.get(s.id) ?? {},
        lastSaleDate: lastSaleMap.get(s.id) ?? null,
        stock: stockQty,
        inProduction: inProd,
      },
      params,
      today,
    );
    const rankAuto = ranks.get(s.id) ?? "C";
    return {
      ...s,
      ...result,
      stock: stockQty,
      inProduction: inProd,
      rankAuto,
      rank: s.rank_override ?? rankAuto,
      rankOverridden: s.rank_override !== null,
    };
  });

  return { today, months, params, rows };
});
