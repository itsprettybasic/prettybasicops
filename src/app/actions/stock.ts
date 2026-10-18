"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { stockDocumentSchema, type StockDocumentInput } from "@/lib/validators";
import { skuLabel } from "@/lib/data/ppic";
import type { Direction, MovementType, SalesChannel } from "@/lib/constants";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function fail(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

export async function createStockDocument(input: StockDocumentInput): Promise<ActionResult<{ id: string }>> {
  const parsed = stockDocumentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Data tidak valid");
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_stock_document", {
    p_direction: d.direction,
    p_type: d.type,
    p_doc_date: d.doc_date,
    p_channel: d.channel,
    p_batch_id: d.batch_id,
    p_note: d.note,
    p_source: d.source,
    p_lines: d.lines,
  });
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true, data: { id: data as string } };
}

/** Simpan banyak dokumen sekaligus (import Excel). Berhenti di dokumen pertama yang gagal. */
export async function createStockDocuments(inputs: StockDocumentInput[]): Promise<ActionResult<{ count: number }>> {
  const supabase = await createClient();
  let count = 0;
  for (const input of inputs) {
    const parsed = stockDocumentSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Data tidak valid");
    const d = parsed.data;
    const { error } = await supabase.rpc("create_stock_document", {
      p_direction: d.direction,
      p_type: d.type,
      p_doc_date: d.doc_date,
      p_channel: d.channel,
      p_batch_id: d.batch_id,
      p_note: d.note,
      p_source: d.source,
      p_lines: d.lines,
    });
    if (error) {
      if (count > 0) revalidatePath("/", "layout");
      return fail(`${count} catatan tersimpan, lalu gagal: ${error.message}`);
    }
    count++;
  }
  revalidatePath("/", "layout");
  return { ok: true, data: { count } };
}

export interface OpnameResult {
  counted: number;
  changed: number;
  plus: number;
  minus: number;
}

/** Stock opname: sistem membuat Adjustment +/− sebesar selisih, sehingga stock = hasil hitung fisik. */
export async function createStockOpname(input: {
  doc_date: string;
  note: string;
  lines: { sku_id: string; counted: number }[];
}): Promise<ActionResult<OpnameResult>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.doc_date)) return fail("Tanggal tidak valid");
  if (input.lines.length === 0) return fail("Isi minimal 1 stock fisik");
  if (input.lines.some((l) => !Number.isInteger(l.counted) || l.counted < 0)) return fail("Stock fisik harus angka bulat ≥ 0");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_stock_opname", {
    p_doc_date: input.doc_date,
    p_note: input.note,
    p_lines: input.lines,
  });
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true, data: data as OpnameResult };
}

export async function voidStockDocument(id: string, reason: string): Promise<ActionResult> {
  if (!reason.trim()) return fail("Alasan wajib diisi");
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_stock_document", { p_id: id, p_reason: reason.trim() });
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export interface DocumentDetail {
  id: string;
  doc_no: string;
  direction: Direction;
  type: MovementType;
  doc_date: string;
  channel: SalesChannel | null;
  batch_no: string | null;
  note: string | null;
  source: string;
  voided_at: string | null;
  void_reason: string | null;
  created_by_name: string | null;
  created_at: string;
  lines: { sku_id: string; code: string; label: string; qty: number }[];
}

export async function getDocumentDetail(id: string): Promise<ActionResult<DocumentDetail>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_documents")
    .select(
      "id, doc_no, direction, type, doc_date, channel, note, source, voided_at, void_reason, created_by_name, created_at, production_batches(batch_no), stock_document_lines(sku_id, qty, skus(code, color, size, products(name)))",
    )
    .eq("id", id)
    .single();
  if (error) return fail(error.message);
  const row = data as unknown as {
    production_batches: { batch_no: string } | null;
    stock_document_lines: { sku_id: string; qty: number; skus: { code: string; color: string; size: string; products: { name: string } } }[];
  } & Omit<DocumentDetail, "lines" | "batch_no">;
  return {
    ok: true,
    data: {
      ...row,
      batch_no: row.production_batches?.batch_no ?? null,
      lines: row.stock_document_lines
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

export interface OpenBatch {
  id: string;
  batch_no: string;
  konveksi_name: string;
  sent_date: string;
  remaining: { sku_id: string; qty: number }[];
}

/** Batch berstatus in_production + sisa qty per SKU (rencana − sudah diterima). */
export async function getOpenBatches(): Promise<ActionResult<OpenBatch[]>> {
  const supabase = await createClient();
  const { data: batches, error } = await supabase
    .from("production_batches")
    .select("id, batch_no, sent_date, konveksi(name), production_batch_lines(sku_id, qty_planned)")
    .eq("status", "in_production")
    .order("sent_date", { ascending: false });
  if (error) return fail(error.message);
  const ids = (batches ?? []).map((b) => b.id);
  const { data: received, error: recErr } = ids.length
    ? await supabase.from("v_batch_received").select("batch_id, sku_id, qty_received").in("batch_id", ids)
    : { data: [], error: null };
  if (recErr) return fail(recErr.message);
  const recMap = new Map((received ?? []).map((r) => [`${r.batch_id}:${r.sku_id}`, r.qty_received as number]));

  return {
    ok: true,
    data: (batches ?? []).map((b) => {
      const bb = b as unknown as {
        id: string;
        batch_no: string;
        sent_date: string;
        konveksi: { name: string } | null;
        production_batch_lines: { sku_id: string; qty_planned: number }[];
      };
      return {
        id: bb.id,
        batch_no: bb.batch_no,
        sent_date: bb.sent_date,
        konveksi_name: bb.konveksi?.name ?? "—",
        remaining: bb.production_batch_lines
          .map((l) => ({ sku_id: l.sku_id, qty: l.qty_planned - (recMap.get(`${bb.id}:${l.sku_id}`) ?? 0) }))
          .filter((l) => l.qty > 0),
      };
    }),
  };
}

export interface SkuMovement {
  document_id: string;
  doc_no: string;
  doc_date: string;
  created_at: string;
  direction: Direction;
  type: MovementType;
  channel: SalesChannel | null;
  batch_no: string | null;
  note: string | null;
  qty: number;
  /** Saldo setelah mutasi ini */
  balance: number;
}

/**
 * Mutasi satu SKU (dokumen tidak void) dengan saldo berjalan. Jika `sinceDate` diisi, hanya mutasi sejak tanggal itu
 * yang dikembalikan (saldo tetap dihitung dari awal). Urutan terbaru di atas.
 */
export async function getSkuMovements(skuId: string, sinceDate?: string): Promise<ActionResult<SkuMovement[]>> {
  const supabase = await createClient();
  const all: SkuMovement[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("stock_document_lines")
      .select(
        "qty, stock_documents!inner(id, doc_no, doc_date, created_at, direction, type, channel, note, voided_at, production_batches(batch_no))",
      )
      .eq("sku_id", skuId)
      .is("stock_documents.voided_at", null)
      .range(from, from + 999);
    if (error) return fail(error.message);
    for (const row of data ?? []) {
      const d = (row as unknown as {
        stock_documents: {
          id: string;
          doc_no: string;
          doc_date: string;
          created_at: string;
          direction: Direction;
          type: MovementType;
          channel: SalesChannel | null;
          note: string | null;
          production_batches: { batch_no: string } | null;
        };
      }).stock_documents;
      all.push({
        document_id: d.id,
        doc_no: d.doc_no,
        doc_date: d.doc_date,
        created_at: d.created_at,
        direction: d.direction,
        type: d.type,
        channel: d.channel,
        batch_no: d.production_batches?.batch_no ?? null,
        note: d.note,
        qty: row.qty as number,
        balance: 0,
      });
    }
    if (!data || data.length < 1000) break;
  }
  all.sort((a, b) => (a.doc_date === b.doc_date ? a.created_at.localeCompare(b.created_at) : a.doc_date.localeCompare(b.doc_date)));
  let balance = 0;
  for (const m of all) {
    balance += m.direction === "in" ? m.qty : -m.qty;
    m.balance = balance;
  }
  const filtered = sinceDate ? all.filter((m) => m.doc_date >= sinceDate) : all;
  return { ok: true, data: filtered.reverse() };
}

export async function setRankOverride(skuId: string, rank: "A" | "B" | "C" | null): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("skus").update({ rank_override: rank }).eq("id", skuId);
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
