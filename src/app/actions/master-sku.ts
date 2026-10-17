"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { skuSchema, type SkuInput } from "@/lib/validators";
import type { ActionResult } from "./stock";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function fail(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Cari produk berdasarkan nama (case-insensitive); buat baru jika belum ada. */
async function upsertProductByName(supabase: Supabase, name: string): Promise<ActionResult<{ id: string }>> {
  const find = () => supabase.from("products").select("id").ilike("name", escapeLike(name)).limit(1).maybeSingle();
  const existing = await find();
  if (existing.error) return fail(existing.error.message);
  if (existing.data) return { ok: true, data: { id: existing.data.id as string } };

  const inserted = await supabase.from("products").insert({ name }).select("id").single();
  if (inserted.error) {
    // Dibuat bersamaan oleh request lain → ambil ulang
    if (inserted.error.code === "23505") {
      const again = await find();
      if (again.data) return { ok: true, data: { id: again.data.id as string } };
    }
    return fail(inserted.error.message);
  }
  return { ok: true, data: { id: inserted.data.id as string } };
}

function friendlyError(error: { code?: string; message: string; details?: string | null }) {
  if (error.code === "23505" && /code/i.test(`${error.message} ${error.details ?? ""}`)) {
    return "Kode SKU sudah dipakai SKU lain";
  }
  return error.message;
}

/** Tambah SKU baru (id = null) atau update SKU yang ada. Produk dibuat otomatis jika namanya baru. */
export async function saveSku(input: SkuInput): Promise<ActionResult<{ id: string }>> {
  const parsed = skuSchema.safeParse({ ...input, code: input.code?.trim().toUpperCase() });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Data tidak valid");
  const d = parsed.data;
  const supabase = await createClient();

  // Cek kode unik lebih dulu supaya pesan error jelas
  const dup = await supabase.from("skus").select("id").eq("code", d.code).limit(1).maybeSingle();
  if (dup.error) return fail(dup.error.message);
  if (dup.data && dup.data.id !== d.id) return fail("Kode SKU sudah dipakai SKU lain");

  const product = await upsertProductByName(supabase, d.product_name);
  if (!product.ok) return product;

  const values = {
    product_id: product.data.id,
    code: d.code,
    color: d.color,
    size: d.size,
    launch_date: d.launch_date,
    unit_cost: d.unit_cost,
    is_active: d.is_active,
  };

  const res = d.id
    ? await supabase.from("skus").update(values).eq("id", d.id).select("id").single()
    : await supabase.from("skus").insert(values).select("id").single();
  if (res.error) return fail(friendlyError(res.error));

  revalidatePath("/", "layout");
  return { ok: true, data: { id: res.data.id as string } };
}

export async function setSkuActive(id: string, isActive: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("skus").update({ is_active: isActive }).eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
