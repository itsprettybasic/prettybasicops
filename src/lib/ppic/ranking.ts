import type { PpicParams, RankClass } from "./types";

const EPSILON = 1e-9;

/**
 * Ranking Pareto otomatis (Bagian 8.5). `totals` = total sales H-3 + H-2 + H-1 per SKU aktif.
 * SKU teratas selalu A; SKU dengan total 0 selalu C.
 */
export function computeRanking(totals: Map<string, number>, params: PpicParams): Map<string, RankClass> {
  const ranks = new Map<string, RankClass>();
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const grandTotal = sorted.reduce((sum, [, v]) => sum + v, 0);

  let cumulative = 0;
  sorted.forEach(([id, value], index) => {
    if (value <= 0 || grandTotal <= 0) {
      ranks.set(id, "C");
      return;
    }
    cumulative += value;
    const pct = (cumulative / grandTotal) * 100;
    if (index === 0 || pct <= params.rank_a_pct + EPSILON) ranks.set(id, "A");
    else if (pct <= params.rank_a_pct + params.rank_b_pct + EPSILON) ranks.set(id, "B");
    else ranks.set(id, "C");
  });
  return ranks;
}
