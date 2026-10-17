import { computeForecast } from "./forecast";
import { minMax, roundUpToMultiple } from "./minmax";
import { computeStatus } from "./status";
import type { PpicParams, PpicResult, SkuPpicInput } from "./types";

export * from "./types";
export { computeForecast, FORECAST_METHOD_LABEL } from "./forecast";
export { applyRounding, minMax, roundUpToMultiple } from "./minmax";
export { computeStatus, STATUS_PRIORITY } from "./status";
export { computeRanking } from "./ranking";
export { monthStart, monthKey, daysBetween } from "./dates";

/** Hitung semua angka PPIC untuk satu SKU (Bagian 8.3 – 8.6). */
export function computePpic(sku: SkuPpicInput, params: PpicParams, today: string): PpicResult {
  const forecast = computeForecast(sku, params, today);
  const available = sku.stock + sku.inProduction;

  const forecastDay = forecast.forecastMonth === null ? null : forecast.forecastMonth / 30;
  const { minStock, maxStock } =
    forecastDay === null
      ? { minStock: null, maxStock: null }
      : minMax(forecastDay, params.min_cover_days, params.max_cover_days, params.rounding);

  const daysCover = forecastDay && forecastDay > 0 ? Math.floor(Math.max(0, sku.stock) / forecastDay) : null;

  const status = computeStatus(
    {
      forecastMonth: forecast.forecastMonth,
      stock: sku.stock,
      available,
      minStock,
      maxStock,
      lastSaleDate: sku.lastSaleDate,
      daysLive: forecast.daysLive,
    },
    params,
    today,
  );

  const suggestion =
    (status === "HABIS" || status === "PRODUKSI") && maxStock !== null
      ? roundUpToMultiple(Math.max(0, maxStock - available), params.moq)
      : 0;

  return { ...forecast, forecastDay, minStock, maxStock, available, daysCover, status, suggestion };
}
