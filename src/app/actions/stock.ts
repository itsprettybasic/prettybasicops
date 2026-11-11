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
    p_po_id: d.po_id,
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
      p_po_id: d.po_id,
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
  po_id: string | null;
  po_no: string | null;
  vendor_name: string | null;
  note: string | null;
  source: string;
  voided_at: string | null;
  void_reason: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_by_name: string | null;
  updated_at: string | null;
  lines: { sku_id: string; code: string; label: string; product_name: string; color: string; size: string; qty: number }[];
}

export async function getDocumentDetail(id: string): Promise<ActionResult<DocumentDetail>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_documents")
    .select(
      "id, doc_no, direction, type, doc_date, channel, po_id, note, source, voided_at, void_reason, created_by_name, created_at, updated_by_name, updated_at, purchase_orders(po_no, vendors(name)), stock_document_lines(sku_id, qty, skus(code, color, size, products(name)))",
    )
    .eq("id", id)
    .single();
  if (error) return fail(error.message);
  const row = data as unknown as {
    purchase_orders: { po_no: string; vendors: { name: string } | null } | null;
    stock_document_lines: { sku_id: string; qty: number; skus: { code: string; color: string; size: string; products: { name: string } } }[];
  } & Omit<DocumentDetail, "lines" | "po_no" | "vendor_name">;
  const { purchase_orders, stock_document_lines, ...rest } = row;
  return {
    ok: true,
    data: {
      ...rest,
      po_no: purchase_orders?.po_no ?? null,
      vendor_name: purchase_orders?.vendors?.name ?? null,
      lines: stock_document_lines
        .map((l) => ({
          sku_id: l.sku_id,
          qty: l.qty,
          code: l.skus.code,
          product_name: l.skus.products.name,
          color: l.skus.color,
          size: l.skus.size,
          label: skuLabel(l.skus.products.name, l.skus.color, l.skus.size),
        }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    },
  };
}

export interface OpenPo {
  id: string;
  po_no: string;
  vendor_name: string;
  po_date: string;
  expected_date: string | null;
  /** Per SKU: qty dipesan, sudah diterima, sisa (bisa 0) */
  lines: { sku_id: string; qty: number; received: number; remaining: number }[];
}

/** PO berstatus Dipesan + qty per SKU. `includeId`: ikut sertakan PO ini walau statusnya bukan Dipesan (untuk edit penerimaan). */
export async function getOpenPos(includeId?: string | null): Promise<ActionResult<OpenPo[]>> {
  const supabase = await createClient();
  let q = supabase
    .from("purchase_orders")
    .select("id, po_no, po_date, expected_date, vendors(name), purchase_order_lines(sku_id, qty)")
    .order("po_date", { ascending: false });
  q = includeId ? q.or(`status.eq.open,id.eq.${includeId}`) : q.eq("status", "open");
  const { data: pos, error } = await q;
  if (error) return fail(error.message);
  const ids = (pos ?? []).map((b) => b.id);
  const { data: received, error: recErr } = ids.length
    ? await supabase.from("v_po_received").select("po_id, sku_id, qty_received").in("po_id", ids)
    : { data: [], error: null };
  if (recErr) return fail(recErr.message);
  const recMap = new Map((received ?? []).map((r) => [`${r.po_id}:${r.sku_id}`, r.qty_received as number]));

  return {
    ok: true,
    data: (pos ?? []).map((b) => {
      const pp = b as unknown as {
        id: string;
        po_no: string;
        po_date: string;
        expected_date: string | null;
        vendors: { name: string } | null;
        purchase_order_lines: { sku_id: string; qty: number }[];
      };
      return {
        id: pp.id,
        po_no: pp.po_no,
        po_date: pp.po_date,
        expected_date: pp.expected_date,
        vendor_name: pp.vendors?.name ?? "—",
        lines: pp.purchase_order_lines.map((l) => {
          const rec = recMap.get(`${pp.id}:${l.sku_id}`) ?? 0;
          return { sku_id: l.sku_id, qty: l.qty, received: rec, remaining: Math.max(0, l.qty - rec) };
        }),
      };
    }),
  };
}

/** Ubah Penerimaan Barang: tanggal, catatan, qty per SKU. */
export async function updateReceipt(input: {
  id: string;
  doc_date: string;
  note: string | null;
  lines: { sku_id: string; qty: number }[];
}): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.doc_date)) return fail("Tanggal tidak valid");
  if (input.lines.length === 0) return fail("Minimal 1 SKU dengan qty");
  if (input.lines.some((l) => !Number.isInteger(l.qty) || l.qty <= 0)) return fail("Qty harus bilangan bulat lebih dari 0");
  if (new Set(input.lines.map((l) => l.sku_id)).size !== input.lines.length) return fail("Ada SKU duplikat");
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_receipt", {
    p_id: input.id,
    p_doc_date: input.doc_date,
    p_note: input.note,
    p_lines: input.lines,
  });
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

/** Ubah catatan barang masuk/keluar apa saja: tipe (searah), tanggal, channel, catatan, qty per SKU. */
export async function updateStockDocument(input: {
  id: string;
  type: MovementType;
  doc_date: string;
  channel: SalesChannel | null;
  note: string | null;
  lines: { sku_id: string; qty: number }[];
}): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.doc_date)) return fail("Tanggal tidak valid");
  if (input.lines.length === 0) return fail("Minimal 1 SKU dengan qty");
  if (input.lines.some((l) => !Number.isInteger(l.qty) || l.qty <= 0)) return fail("Qty harus bilangan bulat lebih dari 0");
  if (new Set(input.lines.map((l) => l.sku_id)).size !== input.lines.length) return fail("Ada SKU duplikat");
  if (input.type === "sales" && !input.channel) return fail("Channel wajib diisi untuk Sales");
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_stock_document", {
    p_id: input.id,
    p_type: input.type,
    p_doc_date: input.doc_date,
    p_channel: input.channel,
    p_note: input.note,
    p_lines: input.lines,
  });
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

/** Hapus permanen catatan barang masuk/keluar apa saja — stock otomatis menyesuaikan. */
export async function deleteStockDocument(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_stock_document", { p_id: id });
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

/** Hapus Penerimaan Barang — stock dikurangi lagi dan status PO disesuaikan. */
export async function deleteReceipt(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_receipt", { p_id: id });
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export interface SkuMovement {
  document_id: string;
  doc_no: string;
  doc_date: string;
  created_at: string;
  direction: Direction;
  type: MovementType;
  channel: SalesChannel | null;
  po_no: string | null;
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
        "qty, stock_documents!inner(id, doc_no, doc_date, created_at, direction, type, channel, note, voided_at, purchase_orders(po_no))",
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
          purchase_orders: { po_no: string } | null;
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
        po_no: d.purchase_orders?.po_no ?? null,
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
