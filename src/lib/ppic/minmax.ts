import type { Rounding } from "./types";

// Toleransi kecil supaya error floating point (mis. 21.000000000004) tidak ikut dibulatkan ke atas.
const EPSILON = 1e-9;

export function applyRounding(x: number, rounding: Rounding): number {
  // `|| 0` mengubah -0 (mis. Math.ceil(0 - EPSILON)) jadi 0
  if (rounding === "floor") return Math.floor(x + EPSILON) || 0;
  if (rounding === "round") return Math.round(x) || 0;
  return Math.ceil(x - EPSILON) || 0;
}

export function roundUpToMultiple(x: number, multiple: number): number {
  if (x <= 0) return 0;
  const m = Math.max(1, Math.floor(multiple));
  return Math.ceil(x / m - EPSILON) * m;
}

export function minMax(forecastDay: number, minCoverDays: number, maxCoverDays: number, rounding: Rounding) {
  return {
    minStock: applyRounding(forecastDay * minCoverDays, rounding),
    maxStock: applyRounding(forecastDay * maxCoverDays, rounding),
  };
}
