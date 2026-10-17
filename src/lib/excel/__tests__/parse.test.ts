import { describe, expect, it } from "vitest";
import {
  cellText,
  excelSerialToIso,
  matchHeaders,
  normalizeHeader,
  normalizeKey,
  parseCsv,
  parseDateCell,
  parseMoney,
  parsePositiveInt,
} from "../parse";

describe("normalizeHeader / normalizeKey", () => {
  it("case-insensitive dan abaikan spasi", () => {
    expect(normalizeHeader(" Ref Batch ")).toBe("refbatch");
    expect(normalizeHeader("TANGGAL_LAUNCH")).toBe("tanggallaunch");
    expect(normalizeKey("TikTok Shop")).toBe("tiktokshop");
    expect(normalizeKey("Adjustment +")).toBe("adjustment");
  });
});

describe("cellText", () => {
  it("membaca rich text, hyperlink, dan formula exceljs", () => {
    expect(cellText({ richText: [{ text: "POLLY" }, { text: "TOP" }] })).toBe("POLLYTOP");
    expect(cellText({ text: "SKU-1", hyperlink: "http://x" })).toBe("SKU-1");
    expect(cellText({ formula: "A1*2", result: 12 })).toBe("12");
    expect(cellText(null)).toBe("");
  });
});

describe("parseDateCell", () => {
  it("menerima yyyy-mm-dd dan dd/mm/yyyy", () => {
    expect(parseDateCell("2026-10-17")).toBe("2026-10-17");
    expect(parseDateCell("2026/1/5")).toBe("2026-01-05");
    expect(parseDateCell("17/10/2026")).toBe("2026-10-17");
    expect(parseDateCell("5-1-2026")).toBe("2026-01-05");
    expect(parseDateCell("17/10/26")).toBe("2026-10-17");
  });

  it("menerima serial Excel (angka & teks)", () => {
    expect(excelSerialToIso(45947)).toBe("2025-10-17");
    expect(parseDateCell(46312)).toBe("2026-10-17");
    expect(parseDateCell("46312")).toBe("2026-10-17");
  });

  it("menerima sel Date (UTC tengah malam dari exceljs)", () => {
    expect(parseDateCell(new Date(Date.UTC(2026, 9, 17)))).toBe("2026-10-17");
  });

  it("menolak tanggal tidak valid", () => {
    expect(parseDateCell("31/02/2026")).toBeNull();
    expect(parseDateCell("2026-13-01")).toBeNull();
    expect(parseDateCell("besok")).toBeNull();
    expect(parseDateCell("")).toBeNull();
    expect(parseDateCell(null)).toBeNull();
  });
});

describe("parsePositiveInt", () => {
  it("menerima bilangan bulat positif", () => {
    expect(parsePositiveInt(45)).toBe(45);
    expect(parsePositiveInt(" 12 ")).toBe(12);
    expect(parsePositiveInt("1.000")).toBe(1000);
    expect(parsePositiveInt("1,250")).toBe(1250);
    expect(parsePositiveInt("45,0")).toBe(45);
    expect(parsePositiveInt({ formula: "1+1", result: 2 })).toBe(2);
  });

  it("menolak 0, negatif, desimal, teks", () => {
    expect(parsePositiveInt(0)).toBeNull();
    expect(parsePositiveInt(-3)).toBeNull();
    expect(parsePositiveInt(2.5)).toBeNull();
    expect(parsePositiveInt("2,5")).toBeNull();
    expect(parsePositiveInt("abc")).toBeNull();
    expect(parsePositiveInt("")).toBeNull();
  });
});

describe("parseMoney", () => {
  it("menerima format rupiah", () => {
    expect(parseMoney(85000)).toBe(85000);
    expect(parseMoney("Rp 85.000")).toBe(85000);
    expect(parseMoney("85.000,50")).toBe(85000.5);
    expect(parseMoney("85000")).toBe(85000);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("murah")).toBeNaN();
    expect(parseMoney(-1)).toBeNaN();
  });
});

describe("parseCsv", () => {
  it("koma dengan tanda kutip & CRLF", () => {
    const rows = parseCsv('﻿Tanggal,SKU,Qty,Catatan\r\n2026-10-17,POLLYTOP-BLUE-XSS,2,"Rekap, harian"\r\n\r\n');
    expect(rows).toEqual([
      ["Tanggal", "SKU", "Qty", "Catatan"],
      ["2026-10-17", "POLLYTOP-BLUE-XSS", "2", "Rekap, harian"],
    ]);
  });

  it("deteksi titik-koma dan kutip ganda di dalam field", () => {
    const rows = parseCsv('SKU;Qty;Catatan\nA-1;3;"kata ""lunas"""\n');
    expect(rows).toEqual([
      ["SKU", "Qty", "Catatan"],
      ["A-1", "3", 'kata "lunas"'],
    ]);
  });
});

describe("matchHeaders", () => {
  it("mencocokkan header case-insensitive + alias, melaporkan kolom wajib yang hilang", () => {
    const { index, missing } = matchHeaders(
      ["tanggal", " SKU ", "REF BATCH", "Jumlah"],
      [
        { key: "date", label: "Tanggal" },
        { key: "sku", label: "SKU", required: true },
        { key: "batch", label: "Ref Batch" },
        { key: "qty", label: "Qty", aliases: ["jumlah"], required: true },
        { key: "type", label: "Tipe", required: true },
      ],
    );
    expect(index).toEqual({ date: 0, sku: 1, batch: 2, qty: 3 });
    expect(missing).toEqual(["Tipe"]);
  });
});
