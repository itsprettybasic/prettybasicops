"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/data/fetch-all";
import { todayJakarta } from "@/lib/format";
import type { ActionResult } from "./stock";

const rowSchema = z.object({
  product_name: z.string().trim().min(1, "Produk wajib diisi").max(120),
  color: z.string().trim().min(1, "Warna wajib diisi").max(60),
  size: z.string().trim().min(1, "Size wajib diisi").max(30),
  code: z
    .string()
    .trim()
    .min(1, "Kode SKU wajib diisi")
    .max(60)
    .regex(/^[A-Z0-9-]+$/, "Kode SKU hanya huruf besar, angka, dan tanda -"),
  /** null = hari ini untuk SKU baru, tidak diubah untuk SKU lama */
  launch_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal Launch tidak valid")
    .nullable(),
  /** null = kosong untuk SKU baru, tidak diubah untuk SKU lama */
  unit_cost: z.number().min(0, "Harga Pokok tidak boleh negatif").nullable(),
});

export type MasterSkuImportRow = z.infer<typeof rowSchema>;

const CHUNK = 200;

function chunks<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Upload Excel Master SKU: upsert berdasarkan kode SKU. Produk yang belum ada dibuat otomatis
 * (dicocokkan tanpa beda huruf besar/kecil). Status aktif SKU lama tidak diubah; SKU baru aktif.
 */
export async function importMasterSku(
  input: MasterSkuImportRow[],
): Promise<ActionResult<{ created: number; updated: number; productsCreated: number }>> {
  const parsed = z.array(rowSchema).min(1, "Tidak ada baris untuk diimport").max(10000).safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const rowNo = typeof issue?.path[0] === "number" ? ` (baris data ke-${issue.path[0] + 1})` : "";
    return { ok: false, error: `${issue?.message ?? "Data tidak valid"}${rowNo}` };
  }
  const rows = parsed.data;
  const codes = rows.map((r) => r.code);
  if (new Set(codes).size !== codes.length) return { ok: false, error: "Ada kode SKU duplikat di file" };

  const supabase = await createClient();
  try {
    // 1. Produk: cocokkan nama (case-insensitive), buat yang belum ada
    const products = await fetchAll<{ id: string; name: string }>(() => supabase.from("products").select("id, name").order("id"));
    const productId = new Map(products.map((p) => [p.name.trim().toLowerCase(), p.id]));
    const newProducts = new Map<string, string>();
    for (const r of rows) {
      const key = r.product_name.toLowerCase();
      if (!productId.has(key) && !newProducts.has(key)) newProducts.set(key, r.product_name);
    }
    for (const part of chunks([...newProducts.values()])) {
      const { data, error } = await supabase
        .from("products")
        .insert(part.map((name) => ({ name })))
        .select("id, name");
      if (error) throw new Error(`Gagal membuat produk: ${error.message}`);
      for (const p of data ?? []) productId.set((p.name as string).trim().toLowerCase(), p.id as string);
    }

    // 2. SKU lama (untuk mempertahankan tanggal launch & harga pokok jika kolom kosong)
    const existing = new Map<string, { launch_date: string; unit_cost: number | null }>();
    for (const part of chunks(codes)) {
      const { data, error } = await supabase.from("skus").select("code, launch_date, unit_cost").in("code", part);
      if (error) throw new Error(error.message);
      for (const s of data ?? [])
        existing.set(s.code as string, {
          launch_date: s.launch_date as string,
          unit_cost: s.unit_cost === null ? null : Number(s.unit_cost),
        });
    }

    // 3. Upsert berdasarkan kode
    const today = todayJakarta();
    const payload = rows.map((r) => {
      const old = existing.get(r.code);
      const pid = productId.get(r.product_name.toLowerCase());
      if (!pid) throw new Error(`Produk "${r.product_name}" gagal dibuat`);
      return {
        code: r.code,
        product_id: pid,
        color: r.color,
        size: r.size,
        launch_date: r.launch_date ?? old?.launch_date ?? today,
        unit_cost: r.unit_cost ?? old?.unit_cost ?? null,
      };
    });
    let done = 0;
    for (const part of chunks(payload)) {
      const { error } = await supabase.from("skus").upsert(part, { onConflict: "code" });
      if (error) {
        if (done > 0) revalidatePath("/", "layout");
        throw new Error(done > 0 ? `${done} SKU tersimpan, lalu gagal: ${error.message}` : error.message);
      }
      done += part.length;
    }

    revalidatePath("/", "layout");
    const updated = rows.filter((r) => existing.has(r.code)).length;
    return { ok: true, data: { created: rows.length - updated, updated, productsCreated: newProducts.size } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Import gagal" };
  }
}
