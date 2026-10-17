"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { batchSchema, type BatchInput } from "@/lib/validators";
import { skuLabel } from "@/lib/data/ppic";
import type { BatchStatus } from "@/lib/constants";
import type { ActionResult } from "./stock";

function fail(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

function dbError(error: { message: string; code?: string }): string {
  if (error.code === "23505") return "No Batch sudah dipakai — ganti nomor lain";
  return error.message;
}

export interface Konveksi {
  id: string;
  name: string;
  capacity_per_day: number | null;
}

export async function listKonveksi(): Promise<ActionResult<Konveksi[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("konveksi")
    .select("id, name, capacity_per_day")
    .eq("is_active", true)
    .order("name");
  if (error) return fail(error.message);
  return { ok: true, data: (data ?? []) as Konveksi[] };
}

export async function createKonveksi(input: { name: string; capacity_per_day: number | null }): Promise<ActionResult<Konveksi>> {
  const name = input.name.trim();
  if (!name) return fail("Nama konveksi wajib diisi");
  if (name.length > 80) return fail("Nama konveksi terlalu panjang");
  const cap = input.capacity_per_day;
  if (cap !== null && (!Number.isInteger(cap) || cap <= 0)) return fail("Kapasitas harus bilangan bulat lebih dari 0");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("konveksi")
    .insert({ name, capacity_per_day: cap })
    .select("id, name, capacity_per_day")
    .single();
  if (error) return fail(error.code === "23505" ? "Nama konveksi sudah ada" : error.message);
  revalidatePath("/", "layout");
  return { ok: true, data: data as Konveksi };
}

export async function getNextBatchNo(year: number): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("next_batch_no", { p_year: year });
  if (error) return fail(error.message);
  return { ok: true, data: data as string };
}

export async function createBatch(input: BatchInput): Promise<ActionResult<{ id: string; batch_no: string }>> {
  const parsed = batchSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Data tidak valid");
  const d = parsed.data;
  const ids = d.lines.map((l) => l.sku_id);
  if (new Set(ids).size !== ids.length) return fail("Ada SKU duplikat");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_production_batch", {
    p_batch_no: d.batch_no,
    p_konveksi_id: d.konveksi_id,
    p_sent_date: d.sent_date,
    p_est_done_date: d.est_done_date,
    p_status: d.status,
    p_note: d.note,
    p_lines: d.lines,
  });
  if (error) return fail(dbError(error));
  revalidatePath("/", "layout");
  return { ok: true, data: { id: data as string, batch_no: d.batch_no.trim().toUpperCase() } };
}

export interface BatchDetailLine {
  sku_id: string;
  code: string;
  label: string;
  product_name: string;
  color: string;
  size: string;
  qty_suggested: number;
  qty_planned: number;
  qty_received: number;
}

export interface BatchDetail {
  id: string;
  batch_no: string;
  konveksi_name: string;
  konveksi_capacity: number | null;
  sent_date: string;
  est_done_date: string | null;
  status: BatchStatus;
  note: string | null;
  done_at: string | null;
  created_by_name: string | null;
  created_at: string;
  lines: BatchDetailLine[];
}

export async function getBatchDetail(id: string): Promise<ActionResult<BatchDetail>> {
  const supabase = await createClient();
  const [{ data, error }, { data: received, error: recErr }] = await Promise.all([
    supabase
      .from("production_batches")
      .select(
        "id, batch_no, sent_date, est_done_date, status, note, done_at, created_by_name, created_at, konveksi(name, capacity_per_day), production_batch_lines(sku_id, qty_suggested, qty_planned, skus(code, color, size, products(name)))",
      )
      .eq("id", id)
      .single(),
    supabase.from("v_batch_received").select("sku_id, qty_received").eq("batch_id", id),
  ]);
  if (error) return fail(error.message);
  if (recErr) return fail(recErr.message);
  const recMap = new Map((received ?? []).map((r) => [r.sku_id as string, r.qty_received as number]));
  const row = data as unknown as Omit<BatchDetail, "lines" | "konveksi_name" | "konveksi_capacity"> & {
    konveksi: { name: string; capacity_per_day: number | null } | null;
    production_batch_lines: {
      sku_id: string;
      qty_suggested: number;
      qty_planned: number;
      skus: { code: string; color: string; size: string; products: { name: string } | null };
    }[];
  };
  const { konveksi, production_batch_lines, ...rest } = row;
  return {
    ok: true,
    data: {
      ...rest,
      konveksi_name: konveksi?.name ?? "—",
      konveksi_capacity: konveksi?.capacity_per_day ?? null,
      lines: production_batch_lines
        .map((l) => {
          const productName = l.skus.products?.name ?? "—";
          return {
            sku_id: l.sku_id,
            code: l.skus.code,
            label: skuLabel(productName, l.skus.color, l.skus.size),
            product_name: productName,
            color: l.skus.color,
            size: l.skus.size,
            qty_suggested: l.qty_suggested,
            qty_planned: l.qty_planned,
            qty_received: recMap.get(l.sku_id) ?? 0,
          };
        })
        .sort((a, b) => a.code.localeCompare(b.code)),
    },
  };
}

async function updateStatus(
  id: string,
  from: BatchStatus[],
  patch: Record<string, unknown>,
  notAllowed: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_batches")
    .update(patch)
    .eq("id", id)
    .in("status", from)
    .select("id");
  if (error) return fail(error.message);
  if (!data || data.length === 0) return fail(notAllowed);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

/** Tandai selesai manual — sisa yang belum diterima tidak lagi dihitung sebagai sedang diproduksi. */
export async function markBatchDone(id: string): Promise<ActionResult> {
  return updateStatus(
    id,
    ["in_production"],
    { status: "done", done_at: new Date().toISOString() },
    "Hanya batch yang sedang diproduksi yang bisa ditandai selesai",
  );
}

export async function cancelBatch(id: string): Promise<ActionResult> {
  return updateStatus(id, ["draft", "in_production"], { status: "cancelled" }, "Batch ini sudah selesai atau dibatalkan");
}

/** Draft → Diproduksi. Qty langsung dihitung ke kolom Produksi di PPIC. */
export async function sendDraftBatch(id: string): Promise<ActionResult> {
  return updateStatus(id, ["draft"], { status: "in_production" }, "Batch ini bukan draft lagi");
}
