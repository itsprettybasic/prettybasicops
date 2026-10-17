"use client";

import type ExcelJS from "exceljs";

export interface SheetColumn<T> {
  header: string;
  width?: number;
  value: (row: T) => string | number | null | undefined;
  /** Format angka Excel, mis. "#,##0" */
  numFmt?: string;
}

export interface SheetSpec<T> {
  name: string;
  columns: SheetColumn<T>[];
  rows: T[];
}

export const HEADER_FILL = "FFF1F5F9";

/** Styling header standar: bold, bg #F1F5F9, freeze baris pertama. */
export function styleHeader(ws: ExcelJS.Worksheet) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FF0F172A" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  header.alignment = { vertical: "middle" };
  header.height = 20;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export async function buildWorkbook(sheets: SheetSpec<never>[] | SheetSpec<unknown>[]) {
  const { default: ExcelJSLib } = await import("exceljs");
  const wb = new ExcelJSLib.Workbook();
  wb.creator = "Pretty Basic PPIC";
  for (const sheet of sheets as SheetSpec<unknown>[]) {
    const ws = wb.addWorksheet(sheet.name);
    ws.columns = sheet.columns.map((c) => ({ header: c.header, width: c.width ?? Math.max(12, c.header.length + 4) }));
    for (const row of sheet.rows) ws.addRow(sheet.columns.map((c) => c.value(row) ?? null));
    sheet.columns.forEach((c, i) => {
      if (c.numFmt) ws.getColumn(i + 1).numFmt = c.numFmt;
    });
    styleHeader(ws);
  }
  return wb;
}

export async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Export satu sheet → file `pretty-basic-{page}-{yyyy-mm-dd}.xlsx` */
export async function exportXlsx<T>(page: string, today: string, sheet: SheetSpec<T>) {
  const wb = await buildWorkbook([sheet as SheetSpec<unknown>]);
  await downloadWorkbook(wb, `pretty-basic-${page}-${today}.xlsx`);
}
