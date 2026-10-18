import type { PpicStatus } from "@/lib/ppic";

export type Direction = "in" | "out";
export type MovementType =
  | "produksi"
  | "retur"
  | "adjustment_in"
  | "transfer_in"
  | "sales"
  | "damage"
  | "giveaway"
  | "adjustment_out"
  | "transfer_out";
export type SalesChannel = "shopee" | "tiktok" | "instagram" | "website" | "offline" | "lainnya";
export type BatchStatus = "draft" | "in_production" | "done" | "cancelled";

/** Warna badge — sesuai .badge di mockup. */
export type BadgeTone = "pos" | "warn" | "neg" | "info" | "yellow" | "purple" | "grey";

export const STATUS_TONE: Record<PpicStatus, BadgeTone> = {
  HABIS: "neg",
  PRODUKSI: "warn",
  AMAN: "pos",
  OVERSTOCK: "yellow",
  DEADSTOCK: "purple",
  STOP: "grey",
  BARU: "info",
};

export const STATUS_RULES: { status: PpicStatus; meaning: string; action: string }[] = [
  { status: "BARU", meaning: "Produk < 7 hari, belum ada forecast", action: "Tunggu data 1 minggu" },
  { status: "STOP", meaning: "Forecast di bawah batas minimal + stock 0", action: "SKU tidak diproduksi lagi" },
  { status: "DEADSTOCK", meaning: "Masih ada stock, tidak ada sales dalam batas hari deadstock", action: "Diskon / bundling / live selling" },
  { status: "HABIS", meaning: "Stock 0 padahal masih laku", action: "Produksi segera (prioritas 1), pertimbangkan pre-order" },
  { status: "PRODUKSI", meaning: "Stock + sedang produksi ≤ Min Stock", action: "Buat batch produksi sebesar Saran minggu ini" },
  { status: "OVERSTOCK", meaning: "Stock kebanyakan: di atas Max × batas overstock, atau penjualan di bawah batas minimal", action: "Jangan produksi, habiskan stock / promo" },
  { status: "AMAN", meaning: "Stock di atas Min Stock", action: "Pantau di review berikutnya" },
];

export const IN_TYPES: MovementType[] = ["produksi", "retur", "adjustment_in", "transfer_in"];
export const OUT_TYPES: MovementType[] = ["sales", "damage", "giveaway", "adjustment_out", "transfer_out"];

/** Label panjang untuk combobox di form. */
export const TYPE_OPTION_LABEL: Record<MovementType, string> = {
  produksi: "Produksi Selesai (dari konveksi)",
  retur: "Retur dari Customer",
  adjustment_in: "Adjustment + (Stock Opname)",
  transfer_in: "Transfer Masuk",
  sales: "Sales",
  damage: "Damage / Reject",
  giveaway: "Giveaway / Marketing",
  adjustment_out: "Adjustment − (Stock Opname)",
  transfer_out: "Transfer Keluar",
};

/** Label pendek untuk badge & chip. */
export const TYPE_LABEL: Record<MovementType, string> = {
  produksi: "Produksi",
  retur: "Retur",
  adjustment_in: "Adjustment +",
  transfer_in: "Transfer",
  sales: "Sales",
  damage: "Damage",
  giveaway: "Giveaway",
  adjustment_out: "Adjustment −",
  transfer_out: "Transfer",
};

export const TYPE_TONE: Record<MovementType, BadgeTone> = {
  produksi: "pos",
  retur: "yellow",
  adjustment_in: "grey",
  transfer_in: "info",
  sales: "info",
  damage: "warn",
  giveaway: "purple",
  adjustment_out: "grey",
  transfer_out: "info",
};

export const CHANNELS: SalesChannel[] = ["shopee", "tiktok", "instagram", "website", "offline", "lainnya"];

export const CHANNEL_LABEL: Record<SalesChannel, string> = {
  shopee: "Shopee",
  tiktok: "TikTok Shop",
  instagram: "Instagram",
  website: "Website PB",
  offline: "Offline",
  lainnya: "Lainnya",
};

export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  draft: "Draft",
  in_production: "Diproduksi",
  done: "Selesai",
  cancelled: "Dibatalkan",
};

export const BATCH_STATUS_TONE: Record<BatchStatus, BadgeTone> = {
  draft: "grey",
  in_production: "warn",
  done: "pos",
  cancelled: "neg",
};

/** Nilai yang diterima di kolom Excel (Bagian 10). Key dalam huruf kecil tanpa spasi. */
export const EXCEL_IN_TYPES: Record<string, MovementType> = {
  produksi: "produksi",
  retur: "retur",
  adjustment: "adjustment_in",
  transfer: "transfer_in",
};
export const EXCEL_OUT_TYPES: Record<string, MovementType> = {
  sales: "sales",
  damage: "damage",
  giveaway: "giveaway",
  adjustment: "adjustment_out",
  transfer: "transfer_out",
};
export const EXCEL_CHANNELS: Record<string, SalesChannel> = {
  shopee: "shopee",
  tiktok: "tiktok",
  tiktokshop: "tiktok",
  instagram: "instagram",
  website: "website",
  websitepb: "website",
  offline: "offline",
  lainnya: "lainnya",
};
