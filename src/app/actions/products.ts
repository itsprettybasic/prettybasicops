"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./stock";

function fail(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const productSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(1, "Nama produk wajib diisi").max(120),
  category: z
    .string()
    .trim()
    .max(60)
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  is_active: z.boolean(),
  fabric_type: z
    .string()
    .trim()
    .max(80)
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  fabric_unit: z.enum(["kg", "yard"]).nullable(),
  fabric_qty: z.number().positive("Jumlah kain harus lebih dari 0").max(100000).nullable(),
  fabric_pcs: z.number().positive("Jumlah pcs harus lebih dari 0").max(100000).nullable(),
  skus: z.array(
    z.object({
      id: z.string().uuid(),
      code: z
        .string()
        .trim()
        .min(1, "Kode SKU wajib diisi")
        .max(60)
        .regex(/^[A-Z0-9-]+$/, "Kode SKU hanya huruf besar, angka, dan tanda -"),
      color: z.string().trim().min(1, "Warna wajib diisi").max(60),
      size: z.string().trim().min(1, "Size wajib diisi").max(30),
      is_active: z.boolean(),
    }),
  ),
});

export type ProductInput = z.input<typeof productSchema>;

/**
 * Tambah produk (id = null) atau update produk beserta SKU-nya.
 * Produk nonaktif → semua SKU-nya ikut nonaktif (tidak dihitung di PPIC).
 */
export async function saveProduct(input: ProductInput): Promise<ActionResult<{ id: string }>> {
  const parsed = productSchema.safeParse({
    ...input,
    name: input.name.trim().replace(/\s+/g, " "),
    skus: input.skus.map((s) => ({ ...s, code: s.code.trim().toUpperCase() })),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Data tidak valid");
  const d = parsed.data;
  const fabricFilled = [d.fabric_unit, d.fabric_qty, d.fabric_pcs].filter((v) => v !== null).length;
  if (fabricFilled !== 0 && fabricFilled !== 3) return fail("Pemakaian kain belum lengkap: isi satuan, jumlah kain, dan jumlah pcs");
  const supabase = await createClient();

  // Nama produk unik (tanpa beda huruf besar/kecil)
  const dupName = await supabase.from("products").select("id").ilike("name", escapeLike(d.name)).limit(2);
  if (dupName.error) return fail(dupName.error.message);
  if ((dupName.data ?? []).some((p) => p.id !== d.id)) return fail(`Nama produk "${d.name}" sudah dipakai`);

  // Kode SKU unik: dalam form ini dan terhadap SKU produk lain
  const codes = d.skus.map((s) => s.code);
  const seen = new Set<string>();
  for (const c of codes) {
    if (seen.has(c)) return fail(`Kode SKU ${c} dipakai lebih dari sekali`);
    seen.add(c);
  }
  if (codes.length > 0) {
    const ids = new Set(d.skus.map((s) => s.id));
    const dup = await supabase.from("skus").select("id, code").in("code", codes);
    if (dup.error) return fail(dup.error.message);
    const taken = (dup.data ?? []).find((r) => !ids.has(r.id as string));
    if (taken) return fail(`Kode SKU ${taken.code} sudah dipakai SKU lain`);
  }

  const values = {
    name: d.name,
    category: d.category,
    is_active: d.is_active,
    fabric_type: d.fabric_type,
    fabric_unit: d.fabric_unit,
    fabric_qty: d.fabric_qty,
    fabric_pcs: d.fabric_pcs,
  };
  const res = d.id
    ? await supabase.from("products").update(values).eq("id", d.id).select("id").single()
    : await supabase.from("products").insert(values).select("id").single();
  if (res.error) {
    if (res.error.code === "23505") return fail(`Nama produk "${d.name}" sudah dipakai`);
    return fail(res.error.message);
  }
  const productId = res.data.id as string;

  // Hanya update SKU yang benar-benar berubah
  if (d.id && d.skus.length > 0) {
    const current = await supabase
      .from("skus")
      .select("id, code, color, size, is_active")
      .eq("product_id", productId);
    if (current.error) return fail(current.error.message);
    const byId = new Map((current.data ?? []).map((r) => [r.id as string, r]));
    for (const s of d.skus) {
      const cur = byId.get(s.id);
      if (!cur) continue; // bukan SKU produk ini
      const active = d.is_active ? s.is_active : false;
      if (cur.code === s.code && cur.color === s.color && cur.size === s.size && cur.is_active === active) continue;
      const up = await supabase
        .from("skus")
        .update({ code: s.code, color: s.color, size: s.size, is_active: active })
        .eq("id", s.id);
      if (up.error) {
        if (up.error.code === "23505") return fail(`Kode SKU ${s.code} sudah dipakai SKU lain`);
        return fail(up.error.message);
      }
    }
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { id: productId } };
}

/** Aktif/nonaktifkan produk sekaligus semua SKU-nya. */
export async function setProductActive(id: string, isActive: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const p = await supabase.from("products").update({ is_active: isActive }).eq("id", id);
  if (p.error) return fail(p.error.message);
  const s = await supabase.from("skus").update({ is_active: isActive }).eq("product_id", id);
  if (s.error) return fail(s.error.message);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
