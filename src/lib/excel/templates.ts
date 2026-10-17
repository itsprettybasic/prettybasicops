import "server-only";
import ExcelJS from "exceljs";
import { CHANNELS, CHANNEL_LABEL } from "@/lib/constants";
import { todayJakarta } from "@/lib/format";

export const TEMPLATE_TYPES = ["barang-masuk", "barang-keluar", "master-sku"] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export function isTemplateType(v: string): v is TemplateType {
  return (TEMPLATE_TYPES as readonly string[]).includes(v);
}

const HEADER_FILL = "FFF1F5F9";
const DATE_FMT = "yyyy-mm-dd";

interface Col {
  header: string;
  width: number;
  date?: boolean;
  numFmt?: string;
}

interface TemplateDef {
  columns: Col[];
  rows: (string | number | Date | null)[][];
  guide: (string | null)[][];
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function definition(type: TemplateType): TemplateDef {
  const today = isoToDate(todayJakarta());
  if (type === "barang-masuk") {
    return {
      columns: [
        { header: "Tanggal", width: 14, date: true },
        { header: "Tipe", width: 14 },
        { header: "Ref Batch", width: 18 },
        { header: "SKU", width: 28 },
        { header: "Qty", width: 8, numFmt: "0" },
        { header: "Catatan", width: 30 },
      ],
      rows: [
        [today, "Produksi", "BATCH-2026-034", "SOLEASKORT-BLACK-ML", 45, "Konveksi GKS"],
        [today, "Retur", null, "COASTALTOP-WHITE-ML", 2, "Size tidak cocok"],
      ],
      guide: [
        ["Kolom", "Keterangan"],
        ["Tanggal", "Format yyyy-mm-dd (juga diterima dd/mm/yyyy). Kosong = hari ini."],
        ["Tipe", "Wajib. Salah satu: Produksi, Retur, Adjustment, Transfer"],
        ["Ref Batch", "Wajib untuk Tipe Produksi — No Batch yang sudah dibuat (mis. BATCH-2026-034)"],
        ["SKU", "Wajib. Kode SKU aktif dari Master SKU"],
        ["Qty", "Wajib. Bilangan bulat lebih dari 0"],
        ["Catatan", "Opsional"],
        [null, null],
        ["Nilai Tipe", "Arti"],
        ["Produksi", "Produksi Selesai (dari konveksi)"],
        ["Retur", "Retur dari Customer"],
        ["Adjustment", "Adjustment + (Stock Opname)"],
        ["Transfer", "Transfer Masuk"],
        [null, null],
        ["Pengelompokan", "Baris dengan Tanggal + Tipe + Ref Batch yang sama digabung jadi 1 catatan."],
      ],
    };
  }
  if (type === "barang-keluar") {
    return {
      columns: [
        { header: "Tanggal", width: 14, date: true },
        { header: "Tipe", width: 14 },
        { header: "Channel", width: 14 },
        { header: "SKU", width: 28 },
        { header: "Qty", width: 8, numFmt: "0" },
        { header: "Catatan", width: 30 },
      ],
      rows: [
        [today, "Sales", "Shopee", "POLLYTOP-BLUE-XSS", 2, "Rekap harian"],
        [today, "Damage", null, "COASTALTOP-GRAY-ML", 2, "Jahitan bolong"],
      ],
      guide: [
        ["Kolom", "Keterangan"],
        ["Tanggal", "Format yyyy-mm-dd (juga diterima dd/mm/yyyy). Kosong = hari ini."],
        ["Tipe", "Wajib. Salah satu: Sales, Damage, Giveaway, Adjustment, Transfer"],
        ["Channel", "Wajib untuk Tipe Sales. Opsional untuk tipe lain."],
        ["SKU", "Wajib. Kode SKU aktif dari Master SKU"],
        ["Qty", "Wajib. Bilangan bulat lebih dari 0"],
        ["Catatan", "Opsional"],
        [null, null],
        ["Nilai Tipe", "Arti"],
        ["Sales", "Penjualan (dihitung ke forecast)"],
        ["Damage", "Damage / Reject"],
        ["Giveaway", "Giveaway / Marketing"],
        ["Adjustment", "Adjustment − (Stock Opname)"],
        ["Transfer", "Transfer Keluar"],
        [null, null],
        ["Nilai Channel", "Arti"],
        ...CHANNELS.map((c) => [c === "tiktok" ? "TikTok" : c === "website" ? "Website" : CHANNEL_LABEL[c], CHANNEL_LABEL[c]]),
        [null, null],
        ["Pengelompokan", "Baris dengan Tanggal + Tipe + Channel yang sama digabung jadi 1 catatan."],
      ],
    };
  }
  return {
    columns: [
      { header: "Produk", width: 24 },
      { header: "Warna", width: 14 },
      { header: "Size", width: 10 },
      { header: "SKU", width: 28 },
      { header: "Tanggal Launch", width: 16, date: true },
      { header: "Harga Pokok", width: 14, numFmt: "#,##0" },
    ],
    rows: [
      ["Solea Mini Skort", "Black", "ML", "SOLEAMINISKORT-BLACK-ML", today, 85000],
      ["Polly Tanktop", "Blue", "XSS", "POLLYTOP-BLUE-XSS", today, null],
    ],
    guide: [
      ["Kolom", "Keterangan"],
      ["Produk", "Wajib. Nama produk — produk baru dibuat otomatis"],
      ["Warna", "Wajib"],
      ["Size", "Wajib"],
      ["SKU", "Kode SKU unik (huruf besar, angka, tanda -). Kosong = dibuat otomatis PRODUK-WARNA-SIZE"],
      ["Tanggal Launch", "Format yyyy-mm-dd. Kosong = hari ini untuk SKU baru, tidak diubah untuk SKU lama"],
      ["Harga Pokok", "Opsional, angka rupiah tanpa titik (mis. 85000)"],
      [null, null],
      ["Cara kerja", "Upsert berdasarkan kode SKU: SKU yang sudah ada diperbarui, SKU baru ditambahkan."],
    ],
  };
}

function styleHeaderRow(ws: ExcelJS.Worksheet) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FF0F172A" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  header.alignment = { vertical: "middle" };
  header.height = 20;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export async function buildTemplate(type: TemplateType): Promise<ArrayBuffer> {
  const def = definition(type);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pretty Basic PPIC";

  const ws = wb.addWorksheet("Data");
  ws.columns = def.columns.map((c) => ({ header: c.header, width: c.width }));
  def.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.date) col.numFmt = DATE_FMT;
    else if (c.numFmt) col.numFmt = c.numFmt;
  });
  for (const row of def.rows) ws.addRow(row);
  styleHeaderRow(ws);

  const guide = wb.addWorksheet("Petunjuk");
  guide.columns = [
    { header: def.guide[0][0] ?? "", width: 18 },
    { header: def.guide[0][1] ?? "", width: 90 },
  ];
  for (const row of def.guide.slice(1)) {
    const r = guide.addRow(row);
    // Sub-judul tabel kedua (mis. "Nilai Tipe") ditebalkan
    if (row[0] && row[0].startsWith("Nilai ")) r.font = { bold: true };
  }
  styleHeaderRow(guide);

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}
