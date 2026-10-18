export type Rounding = "ceil" | "floor" | "round";
export type RankClass = "A" | "B" | "C";

export type PpicStatus =
  | "HABIS"
  | "PRODUKSI"
  | "AMAN"
  | "OVERSTOCK"
  | "DEADSTOCK"
  | "STOP"
  | "BARU";

export type ForecastMethod = "normal" | "two_months" | "one_month" | "weekly" | "none";

export interface PpicParams {
  min_cover_days: number;
  max_cover_days: number;
  lead_time_days: number;
  moq: number;
  rounding: Rounding;
  weight_h3: number;
  weight_h2: number;
  weight_h1: number;
  weight2_h2: number;
  weight2_h1: number;
  overstock_multiplier: number;
  min_forecast_to_produce: number;
  deadstock_days: number;
  new_product_min_days: number;
  rank_a_pct: number;
  rank_b_pct: number;
}

export const DEFAULT_PARAMS: PpicParams = {
  min_cover_days: 21,
  max_cover_days: 35,
  lead_time_days: 14,
  moq: 1,
  rounding: "ceil",
  weight_h3: 20,
  weight_h2: 30,
  weight_h1: 50,
  weight2_h2: 40,
  weight2_h1: 60,
  overstock_multiplier: 1.5,
  min_forecast_to_produce: 6,
  deadstock_days: 60,
  new_product_min_days: 7,
  rank_a_pct: 70,
  rank_b_pct: 20,
};

/** Data mentah satu SKU yang dibutuhkan untuk menghitung PPIC. Tanggal dalam format `yyyy-MM-dd`. */
export interface SkuPpicInput {
  launchDate: string;
  /** Penjualan (tipe sales saja) per bulan, key `yyyy-MM`. */
  monthlySales: Record<string, number>;
  lastSaleDate: string | null;
  stock: number;
  inProduction: number;
}

export interface MonthSales {
  h3: number;
  h2: number;
  h1: number;
  current: number;
}

export interface ForecastResult {
  forecastMonth: number | null;
  method: ForecastMethod;
  sales: MonthSales;
  daysLive: number;
}

export interface PpicResult extends ForecastResult {
  forecastDay: number | null;
  minStock: number | null;
  maxStock: number | null;
  available: number;
  daysCover: number | null;
  status: PpicStatus;
  suggestion: number;
}
