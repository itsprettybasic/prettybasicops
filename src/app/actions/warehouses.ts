"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { skuLabel } from "@/lib/data/ppic";
import type { ActionResult } from "./stock";

function fail(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

const optStr = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable();

const warehouseSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(1, "Nama gudang wajib diisi").max(80),
  address: optStr(300),
  note: optStr(500),
  is_active: z.boolean(),
  counts_in_ppic: z.boolean(),
});

export type WarehouseInput = z.input<typeof warehouseSchema>;

export async function saveWarehouse(input: WarehouseInput): Promise<ActionResult<{ id: string }>> {
  const parsed = warehouseSchema.safeParse({ ...input, name: input.name.trim().replace(/\s+/g, " ") });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Data tidak valid");
  const { id, ...values } = parsed.data;
  const supabase = await createClient();

  const dup = await supabase.from("warehouses").select("id").ilike("name", values.name.replace(/[\\%_]/g, (c) => `\\${c}`));
  if (dup.error) return fail(dup.error.message);
  if ((dup.data ?? []).some((w) => w.id !== id)) return fail(`Nama gudang "${values.name}" sudah dipakai`);

  const res = id
    ? await supabase
        .from("warehouses")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id")
        .single()
    : await supabase.from("warehouses").insert(values).select("id").single();
  if (res.error) {
    if (/default_is_active/.test(res.error.message)) return fail("Gudang utama tidak bisa dinonaktifkan");
    if (res.error.code === "23505") return fail(`Nama gudang "${values.name}" sudah dipakai`);
    return fail(res.error.message);
  }
  revalidatePath("/", "layout");
  return { ok: true, data: { id: res.data.id as string } };
}

const transferSchema = z.object({
  id: z.string().uuid().nullable(),
  transfer_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
  from_warehouse_id: z.string().uuid("Pilih gudang asal"),
  to_warehouse_id: z.string().uuid("Pilih gudang tujuan"),
  note: optStr(1000),
  lines: z
    .array(z.object({ sku_id: z.string().uuid(), qty: z.number().int("Qty harus bilangan bulat").positive("Qty harus lebih dari 0") }))
    .min(1, "Minimal 1 SKU dengan qty"),
});

export type TransferInput = z.input<typeof transferSchema>;

export async function saveTransfer(input: TransferInput): Promise<ActionResult<{ id: string }>> {
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Data tidak valid");
  const d = parsed.data;
  if (d.from_warehouse_id === d.to_warehouse_id) return fail("Gudang asal dan tujuan harus berbeda");
  if (new Set(d.lines.map((l) => l.sku_id)).size !== d.lines.length) return fail("Ada SKU duplikat");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_stock_transfer", {
    p_id: d.id,
    p_transfer_date: d.transfer_date,
    p_from_warehouse_id: d.from_warehouse_id,
    p_to_warehouse_id: d.to_warehouse_id,
    p_note: d.note,
    p_lines: d.lines,
  });
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true, data: { id: data as string } };
}

export async function deleteTransfer(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_stock_transfer", { p_id: id });
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export interface TransferDetail {
  id: string;
  transfer_no: string;
  transfer_date: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  from_warehouse_name: string;
  to_warehouse_name: string;
  note: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_by_name: string | null;
  updated_at: string | null;
  lines: { sku_id: string; code: string; label: string; qty: number }[];
}

export async function getTransferDetail(id: string): Promise<ActionResult<TransferDetail>> {
  const supabase = await createClient();
  const [head, lines] = await Promise.all([
    supabase
      .from("v_transfer_summary")
      .select(
        "id, transfer_no, transfer_date, from_warehouse_id, to_warehouse_id, from_warehouse_name, to_warehouse_name, note, created_by_name, created_at, updated_by_name, updated_at",
      )
      .eq("id", id)
      .single(),
    supabase
      .from("stock_documents")
      .select("stock_document_lines(sku_id, qty, skus(code, color, size, products(name)))")
      .eq("transfer_id", id)
      .eq("direction", "out")
      .single(),
  ]);
  if (head.error) return fail(head.error.message);
  if (lines.error) return fail(lines.error.message);
  const rows = (lines.data as unknown as {
    stock_document_lines: { sku_id: string; qty: number; skus: { code: string; color: string; size: string; products: { name: string } } }[];
  }).stock_document_lines;
  return {
    ok: true,
    data: {
      ...(head.data as Omit<TransferDetail, "lines">),
      lines: rows
        .map((l) => ({
          sku_id: l.sku_id,
          qty: l.qty,
          code: l.skus.code,
          label: skuLabel(l.skus.products.name, l.skus.color, l.skus.size),
        }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    },
  };
}

/** Stock semua SKU di satu gudang: sku_id → stock (SKU tanpa mutasi tidak ada di map = 0). */
export async function getWarehouseStockMap(warehouseId: string): Promise<ActionResult<Record<string, number>>> {
  const supabase = await createClient();
  const out: Record<string, number> = {};
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("v_sku_warehouse_stock")
      .select("sku_id, stock")
      .eq("warehouse_id", warehouseId)
      .order("sku_id")
      .range(from, from + 999);
    if (error) return fail(error.message);
    for (const r of data ?? []) out[r.sku_id as string] = r.stock as number;
    if (!data || data.length < 1000) break;
  }
  return { ok: true, data: out };
}
