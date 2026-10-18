import { describe, expect, it } from "vitest";
import { computeForecast, computePpic, computeRanking, DEFAULT_PARAMS, roundUpToMultiple } from "..";
import type { SkuPpicInput } from "..";

const TODAY = "2026-10-17";
const P = DEFAULT_PARAMS;

function sku(overrides: Partial<SkuPpicInput>): SkuPpicInput {
  return { launchDate: "2026-01-10", monthlySales: {}, lastSaleDate: TODAY, stock: 0, inProduction: 0, ...overrides };
}

describe("Contoh 1 — produk lama", () => {
  const r = computePpic(
    sku({ monthlySales: { "2026-07": 39, "2026-08": 76, "2026-09": 75, "2026-10": 37 }, stock: 4 }),
    P,
    TODAY,
  );
  it("forecast bobot normal", () => {
    expect(r.method).toBe("normal");
    expect(r.forecastMonth).toBeCloseTo(68.1, 6);
    expect(r.forecastDay).toBeCloseTo(2.27, 6);
  });
  it("min, max, status, saran, hari cover", () => {
    expect(r.minStock).toBe(48);
    expect(r.maxStock).toBe(80);
    expect(r.status).toBe("PRODUKSI");
    expect(r.suggestion).toBe(76);
    expect(r.daysCover).toBe(1);
  });
});

describe("Contoh 2 — umur 2 bulan", () => {
  it("pakai H-2 40% + H-1 60%", () => {
    const f = computeForecast(sku({ launchDate: "2026-08-01", monthlySales: { "2026-08": 20, "2026-09": 30 } }), P, TODAY);
    expect(f.method).toBe("two_months");
    expect(f.forecastMonth).toBeCloseTo(26, 6);
  });
});

describe("Contoh 3 — launch di tengah bulan", () => {
  it("bulan launch diprorata", () => {
    const f = computeForecast(sku({ launchDate: "2026-08-15", monthlySales: { "2026-08": 10, "2026-09": 30 } }), P, TODAY);
    expect(f.method).toBe("two_months");
    expect(f.forecastMonth).toBeCloseTo(0.4 * ((10 / 17) * 31) + 0.6 * 30, 6);
    expect(f.forecastMonth).toBeCloseTo(25.29, 2);
  });
  it("bulan dengan live < 7 hari tidak dihitung", () => {
    const f = computeForecast(sku({ launchDate: "2026-08-28", monthlySales: { "2026-08": 3, "2026-09": 30 } }), P, TODAY);
    expect(f.method).toBe("one_month");
    expect(f.forecastMonth).toBe(30);
  });
});

describe("Contoh 4 — produk baru bulan berjalan", () => {
  it("prorata mingguan", () => {
    const r = computePpic(sku({ launchDate: "2026-10-03", monthlySales: { "2026-10": 10 }, stock: 5 }), P, TODAY);
    expect(r.daysLive).toBe(14);
    expect(r.method).toBe("weekly");
    expect(r.forecastMonth).toBe(20);
  });
});

describe("Contoh 5 — produk sangat baru", () => {
  it("BARU tanpa forecast", () => {
    const r = computePpic(sku({ launchDate: "2026-10-12", monthlySales: { "2026-10": 4 }, stock: 10 }), P, TODAY);
    expect(r.daysLive).toBe(5);
    expect(r.status).toBe("BARU");
    expect(r.forecastMonth).toBeNull();
    expect(r.minStock).toBeNull();
    expect(r.maxStock).toBeNull();
    expect(r.suggestion).toBe(0);
  });
});

describe("Contoh 6 — overstock", () => {
  it("stock > max × 1,5", () => {
    const r = computePpic(sku({ monthlySales: { "2026-07": 21, "2026-08": 21, "2026-09": 21 }, stock: 62 }), P, TODAY);
    expect(r.forecastMonth).toBeCloseTo(21, 6);
    expect(r.maxStock).toBe(25);
    expect(r.status).toBe("OVERSTOCK");
    expect(r.suggestion).toBe(0);
  });
});

describe("Contoh 7 — MOQ", () => {
  it("dibulatkan ke kelipatan MOQ", () => {
    expect(roundUpToMultiple(76, 6)).toBe(78);
    const r = computePpic(
      sku({ monthlySales: { "2026-07": 39, "2026-08": 76, "2026-09": 75 }, stock: 4 }),
      { ...P, moq: 6 },
      TODAY,
    );
    expect(r.suggestion).toBe(78);
  });
});

describe("Contoh 8 — ranking", () => {
  it("700, 200, 60, 40 → A, B, C, C", () => {
    const ranks = computeRanking(new Map([["a", 700], ["b", 200], ["c", 60], ["d", 40]]), P);
    expect([...["a", "b", "c", "d"]].map((id) => ranks.get(id))).toEqual(["A", "B", "C", "C"]);
  });
  it("SKU teratas selalu A dan total 0 selalu C", () => {
    const ranks = computeRanking(new Map([["a", 900], ["b", 100], ["z", 0]]), P);
    expect(ranks.get("a")).toBe("A");
    expect(ranks.get("b")).toBe("C"); // kumulatif 100% > 90%
    expect(ranks.get("z")).toBe("C");
  });
});

describe("Status lain", () => {
  const oldSales = { "2026-07": 39, "2026-08": 76, "2026-09": 75 };
  it("HABIS: stock 0, saran dikurangi yang sedang diproduksi", () => {
    const r = computePpic(sku({ monthlySales: oldSales, stock: 0, inProduction: 30 }), P, TODAY);
    expect(r.status).toBe("HABIS");
    expect(r.suggestion).toBe(50);
  });
  it("STOP: forecast rendah dan stock 0", () => {
    const r = computePpic(sku({ monthlySales: { "2026-07": 3, "2026-08": 3, "2026-09": 3 }, stock: 0 }), P, TODAY);
    expect(r.status).toBe("STOP");
  });
  it("OVERSTOCK: forecast rendah, stock masih ada", () => {
    const r = computePpic(sku({ monthlySales: { "2026-07": 3, "2026-08": 3, "2026-09": 3 }, stock: 8 }), P, TODAY);
    expect(r.status).toBe("OVERSTOCK");
  });
  it("DEADSTOCK: tidak ada sales 60 hari", () => {
    const r = computePpic(
      sku({ monthlySales: { "2026-07": 30 }, lastSaleDate: "2026-07-31", stock: 12 }),
      P,
      TODAY,
    );
    expect(r.status).toBe("DEADSTOCK");
  });
  it("AMAN: di atas Min, di bawah batas overstock", () => {
    const r = computePpic(sku({ monthlySales: oldSales, stock: 60 }), P, TODAY);
    expect(r.status).toBe("AMAN");
    expect(r.suggestion).toBe(0);
  });
  it("PRODUKSI memperhitungkan qty yang sedang diproduksi", () => {
    const r = computePpic(sku({ monthlySales: oldSales, stock: 10, inProduction: 50 }), P, TODAY);
    expect(r.status).toBe("AMAN");
  });
  it("parameter Min 28 hari mengubah Min stock", () => {
    const r = computePpic(sku({ monthlySales: oldSales, stock: 4 }), { ...P, min_cover_days: 28 }, TODAY);
    expect(r.minStock).toBe(Math.ceil(2.27 * 28));
  });
});

describe("Forecast 0", () => {
  it("Min/Max 0, bukan -0", () => {
    const r = computePpic(sku({ monthlySales: { "2026-07": 0, "2026-08": 0, "2026-09": 0 }, stock: 5 }), P, TODAY);
    expect(Object.is(r.minStock, 0)).toBe(true);
    expect(Object.is(r.maxStock, 0)).toBe(true);
  });
});
