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
    batch_id: z.string().uuid().nullable(),
    note: z.string().max(500).nullable(),
    source: z.enum(["manual", "excel"]),
    lines: z.array(lineSchema).min(1, "Minimal 1 SKU"),
  })
  .superRefine((d, ctx) => {
    const allowed = d.direction === "in" ? IN_TYPES : OUT_TYPES;
    if (!allowed.includes(d.type as never)) ctx.addIssue({ code: "custom", message: "Tipe tidak sesuai arah" });
    if (d.type === "sales" && !d.channel) ctx.addIssue({ code: "custom", message: "Channel wajib diisi untuk Sales" });
    if (d.type === "produksi" && !d.batch_id) ctx.addIssue({ code: "custom", message: "Ref Batch wajib untuk Produksi Selesai" });
    const ids = d.lines.map((l) => l.sku_id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Ada SKU duplikat" });
  });

export type StockDocumentInput = z.infer<typeof stockDocumentSchema>;

export const batchSchema = z.object({
  batch_no: z
    .string()
    .trim()
    .min(1, "No Batch wajib diisi")
    .max(40),
  konveksi_id: z.string().uuid("Konveksi belum dipilih"),
  sent_date: dateStr,
  est_done_date: dateStr.nullable(),
  status: z.enum(["draft", "in_production"]),
  note: z.string().max(1000).nullable(),
  lines: z
    .array(
      z.object({
        sku_id: z.string().uuid(),
        qty_suggested: z.number().int().min(0),
        qty_planned: z.number().int().positive("Qty Final harus lebih dari 0"),
      }),
    )
    .min(1, "Minimal 1 SKU"),
});

export type BatchInput = z.infer<typeof batchSchema>;

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

/** Saran kode SKU: NAMAPRODUK-WARNA-SIZE, huruf besar tanpa spasi/simbol. */
export function suggestSkuCode(product: string, color: string, size: string) {
  const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return [clean(product), clean(color), clean(size)].filter(Boolean).join("-");
}
