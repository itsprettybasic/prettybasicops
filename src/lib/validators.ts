import { z } from "zod";
import { CHANNELS, IN_TYPES, OUT_TYPES } from "@/lib/constants";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid");

export const lineSchema = z.object({
  sku_id: z.string().uuid("SKU belum dipilih"),
  qty: z.number().int("Qty harus bilangan bulat").positive("Qty harus lebih dari 0"),
});

export const stockDocumentSchema = z
  .object({
    direction: z.enum(["in", "out"]),
    type: z.enum([...IN_TYPES, ...OUT_TYPES] as [string, ...string[]]),
    doc_date: dateStr,
    channel: z.enum(CHANNELS as [string, ...string[]]).nullable(),
    po_id: z.string().uuid().nullable(),
    note: z.string().max(500).nullable(),
    source: z.enum(["manual", "excel"]),
    lines: z.array(lineSchema).min(1, "Minimal 1 SKU"),
  })
  .superRefine((d, ctx) => {
    const allowed = d.direction === "in" ? IN_TYPES : OUT_TYPES;
    if (!allowed.includes(d.type as never)) ctx.addIssue({ code: "custom", message: "Tipe tidak sesuai arah" });
    if (d.type === "sales" && !d.channel) ctx.addIssue({ code: "custom", message: "Channel wajib diisi untuk Sales" });
    if (d.type === "produksi" && !d.po_id) ctx.addIssue({ code: "custom", message: "No PO wajib untuk Penerimaan PO" });
    const ids = d.lines.map((l) => l.sku_id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Ada SKU duplikat" });
  });

export type StockDocumentInput = z.infer<typeof stockDocumentSchema>;

export const poSchema = z
  .object({
    id: z.string().uuid().nullable(),
    po_no: z.string().trim().min(1, "No PO wajib diisi").max(40),
    vendor_id: z.string().uuid("Vendor belum dipilih"),
    po_date: dateStr,
    expected_date: dateStr.nullable(),
    status: z.enum(["draft", "open"]),
    note: z.string().max(1000).nullable(),
    lines: z
      .array(
        z.object({
          sku_id: z.string().uuid(),
          qty_suggested: z.number().int().min(0),
          qty: z.number().int("Qty harus bilangan bulat").positive("Qty harus lebih dari 0"),
          unit_price: z.number().min(0, "Harga tidak boleh minus").nullable(),
        }),
      )
      .min(1, "Minimal 1 SKU"),
  })
  .superRefine((d, ctx) => {
    if (d.expected_date && d.expected_date < d.po_date)
      ctx.addIssue({ code: "custom", message: "Tanggal kedatangan tidak boleh sebelum tanggal PO" });
    const ids = d.lines.map((l) => l.sku_id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Ada SKU duplikat" });
  });

export type PoInput = z.infer<typeof poSchema>;

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable();

export const vendorSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(1, "Nama vendor wajib diisi").max(80, "Nama vendor terlalu panjang"),
  contact_person: optText(80),
  phone: optText(40),
  email: optText(120).refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Format email tidak valid"),
  address: optText(500),
  note: optText(1000),
  is_active: z.boolean(),
});

export type VendorInput = z.input<typeof vendorSchema>;

export const skuSchema = z.object({
  id: z.string().uuid().nullable(),
  product_name: z.string().trim().min(1, "Produk wajib diisi").max(120),
  color: z.string().trim().min(1, "Warna wajib diisi").max(60),
  size: z.string().trim().min(1, "Size wajib diisi").max(30),
  code: z
    .string()
    .trim()
    .min(1, "Kode SKU wajib diisi")
    .max(60)
    .regex(/^[A-Z0-9-]+$/, "Kode SKU hanya huruf besar, angka, dan tanda -"),
  launch_date: dateStr,
  unit_cost: z.number().min(0).nullable(),
  is_active: z.boolean(),
});

export type SkuInput = z.infer<typeof skuSchema>;

const optStr = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable();

export const fabricShipmentSchema = z.object({
  id: z.string().uuid().nullable(),
  sj_no: z.string().trim().min(1, "No Surat Jalan wajib diisi").max(40),
  ship_date: dateStr,
  vendor_id: z.string().uuid("Vendor belum dipilih"),
  po_id: z.string().uuid().nullable(),
  driver_name: optStr(80),
  vehicle_no: optStr(20),
  note: optStr(1000),
  lines: z
    .array(
      z.object({
        fabric_type: z.string().trim().min(1, "Jenis kain wajib diisi").max(80),
        color: z.string().trim().min(1, "Warna wajib diisi").max(60),
        qty_kg: z.number().positive("Qty (kg) harus lebih dari 0").max(100000),
        roll_count: z.number().int("Jumlah roll harus bilangan bulat").min(0).nullable(),
        note: optStr(200),
      }),
    )
    .min(1, "Minimal 1 baris kain"),
});

export type FabricShipmentInput = z.input<typeof fabricShipmentSchema>;

/** Saran kode SKU: NAMAPRODUK-WARNA-SIZE, huruf besar tanpa spasi/simbol. */
export function suggestSkuCode(product: string, color: string, size: string) {
  const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return [clean(product), clean(color), clean(size)].filter(Boolean).join("-");
}
