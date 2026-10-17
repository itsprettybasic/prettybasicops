import { daysBetween, daysInMonth, monthKey, monthStart } from "./dates";
import type { ForecastResult, PpicParams, SkuPpicInput } from "./types";

/**
 * Penjualan satu bulan (H-3/H-2/H-1) yang layak dipakai untuk forecast (Bagian 8.2):
 * - null jika SKU belum ada di bulan itu, atau live < `new_product_min_days` hari di bulan itu
 * - diprorata ke sebulan penuh jika SKU launch di tengah bulan itu
 */
function usableMonthSales(sku: SkuPpicInput, start: string, params: PpicParams): number | null {
  const totalDays = daysInMonth(start);
  const sales = sku.monthlySales[monthKey(start)] ?? 0;
  if (sku.launchDate <= start) return sales;
  if (monthKey(sku.launchDate) !== monthKey(start)) return null; // launch setelah bulan ini

  const liveDays = totalDays - Number(sku.launchDate.slice(8, 10)) + 1;
  if (liveDays < params.new_product_min_days) return null;
  return (sales / liveDays) * totalDays;
}

export function computeForecast(sku: SkuPpicInput, params: PpicParams, today: string): ForecastResult {
  const starts = { h3: monthStart(today, -3), h2: monthStart(today, -2), h1: monthStart(today, -1), current: monthStart(today, 0) };
  const sales = {
    h3: sku.monthlySales[monthKey(starts.h3)] ?? 0,
    h2: sku.monthlySales[monthKey(starts.h2)] ?? 0,
    h1: sku.monthlySales[monthKey(starts.h1)] ?? 0,
    current: sku.monthlySales[monthKey(starts.current)] ?? 0,
  };
  const daysLive = daysBetween(sku.launchDate, today);

  const h3 = usableMonthSales(sku, starts.h3, params);
  const h2 = usableMonthSales(sku, starts.h2, params);
  const h1 = usableMonthSales(sku, starts.h1, params);

  if (h3 !== null && h2 !== null && h1 !== null) {
    const fm = (params.weight_h3 * h3 + params.weight_h2 * h2 + params.weight_h1 * h1) / 100;
    return { forecastMonth: fm, method: "normal", sales, daysLive };
  }
  if (h2 !== null && h1 !== null) {
    const fm = (params.weight2_h2 * h2 + params.weight2_h1 * h1) / 100;
    return { forecastMonth: fm, method: "two_months", sales, daysLive };
  }
  if (h1 !== null) {
    return { forecastMonth: h1, method: "one_month", sales, daysLive };
  }
  if (daysLive >= params.new_product_min_days) {
    // Prorata mingguan: semua sales sejak bulan launch ÷ jumlah minggu penuh × 4
    const launchMonth = monthKey(sku.launchDate);
    const salesSinceLaunch = Object.entries(sku.monthlySales)
      .filter(([month]) => month >= launchMonth)
      .reduce((sum, [, qty]) => sum + qty, 0);
    const weeks = Math.floor(daysLive / 7);
    return { forecastMonth: (salesSinceLaunch / weeks) * 4, method: "weekly", sales, daysLive };
  }
  return { forecastMonth: null, method: "none", sales, daysLive };
}

export const FORECAST_METHOD_LABEL: Record<ForecastResult["method"], string> = {
  normal: "bobot normal",
  two_months: "2 bulan",
  one_month: "1 bulan (H-1)",
  weekly: "prorata mingguan",
  none: "belum ada forecast",
};
