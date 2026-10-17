import { daysBetween } from "./dates";
import type { PpicParams, PpicStatus } from "./types";

interface StatusInput {
  forecastMonth: number | null;
  stock: number;
  available: number;
  minStock: number | null;
  maxStock: number | null;
  lastSaleDate: string | null;
  daysLive: number;
}

/** Evaluasi berurutan sesuai Bagian 8.6 — ambil yang pertama cocok. */
export function computeStatus(input: StatusInput, params: PpicParams, today: string): PpicStatus {
  const { forecastMonth, stock, available, minStock, maxStock, lastSaleDate, daysLive } = input;
  if (forecastMonth === null || minStock === null || maxStock === null) return "BARU";

  const lowForecast = forecastMonth < params.min_forecast_to_produce;
  if (lowForecast && stock <= 0) return "STOP";

  const noRecentSales = lastSaleDate === null || daysBetween(lastSaleDate, today) > params.deadstock_days;
  if (stock > 0 && noRecentSales && daysLive >= params.deadstock_days) return "DEADSTOCK";

  if (lowForecast) return "SLOW MOVING";
  if (stock <= 0) return "HABIS";
  if (available <= minStock) return "PRODUKSI";
  if (stock > maxStock * params.overstock_multiplier) return "OVERSTOCK";
  return "AMAN";
}

/** Urutan prioritas untuk sort default di halaman PPIC. */
export const STATUS_PRIORITY: Record<PpicStatus, number> = {
  HABIS: 0,
  PRODUKSI: 1,
  AMAN: 2,
  OVERSTOCK: 3,
  "SLOW MOVING": 4,
  DEADSTOCK: 4,
  STOP: 5,
  BARU: 6,
};
