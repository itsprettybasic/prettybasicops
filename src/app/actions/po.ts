"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { poSchema, vendorSchema, type PoInput, type VendorInput } from "@/lib/validators";
import { skuLabel } from "@/lib/data/ppic";
import type { PoStatus } from "@/lib/constants";
import type { ActionResult } from "./stock";

function fail(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

function poError(error: { message: string; code?: string }): string {
  if (error.code === "23505") return "No PO sudah dipakai — ganti nomor lain";
  if (error.code === "23503") return "Vendor atau SKU tidak ditemukan";
  return error.message;
}

// ── Vendor ─────────────────────────────────────────

export interface Vendor {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  is_active: boolean;
}

const VENDOR_COLS = "id, name, contact_person, phone, email, address, note, is_active";

export async function listVendors(opts: { includeInactive?: boolean } = {}): Promise<ActionResult<Vendor[]>> {
  const supabase = await createClient();
  let q = supabase.from("vendors").select(VENDOR_COLS).order("name");
  if (!opts.includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) return fail(error.message);
  return { ok: true, data: (data ?? []) as Vendor[] };
}

export async function saveVendor(input: VendorInput): Promise<ActionResult<Vendor>> {
  const parsed = vendorSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Data tidak valid");
  const { id, ...fields } = parsed.data;
  const supabase = await createClient();
  const q = id
    ? supabase.from("vendors").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id)
    : supabase.from("vendors").insert(fields);
  const { data, error } = await q.select(VENDOR_COLS).single();
  if (error) return fail(error.code === "23505" ? "Nama vendor sudah ada" : error.message);
  revalidatePath("/", "layout");
  return { ok: true, data: data as Vendor };
}

/** Hapus vendor. Vendor yang sudah punya PO tidak bisa dihapus — nonaktifkan saja. */
export async function deleteVendor(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { count, error: cErr } = await supabase
    .from("purchase_orders")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", id);
  if (cErr) return fail(cErr.message);
  if ((count ?? 0) > 0) return fail(`Vendor ini sudah punya ${count} PO, jadi tidak bisa dihapus. Nonaktifkan saja.`);
  const { error } = await supabase.from("vendors").delete().eq("id", id);
  if (error)
    return fail(error.code === "23503" ? "Vendor ini sudah dipakai di pengiriman kain, jadi tidak bisa dihapus. Nonaktifkan saja." : error.message);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

// ── Purchase Order ─────────────────────────────────

export async function getNextPoNo(year: number): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("next_po_no", { p_year: year });
  if (error) return fail(error.message);
  return { ok: true, data: data as string };
}

export async function savePurchaseOrder(input: PoInput): Promise<ActionResult<{ id: string; po_no: string }>> {
  const parsed = poSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Data tidak valid");
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_purchase_order", {
    p_id: d.id,
    p_po_no: d.po_no,
    p_vendor_id: d.vendor_id,
    p_po_date: d.po_date,
    p_expected_date: d.expected_date,
    p_status: d.status,
    p_note: d.note,
    p_lines: d.lines,
  });
  if (error) return fail(poError(error));
  revalidatePath("/", "layout");
  return { ok: true, data: { id: data as string, po_no: d.po_no.trim().toUpperCase() } };
}

export interface PoDetailLine {
  sku_id: string;
  code: string;
  label: string;
  product_name: string;
  color: string;
  size: string;
  qty_suggested: number;
  qty: number;
  unit_price: number | null;
  qty_received: number;
}

export interface PoReceipt {
  id: string;
  doc_no: string;
  doc_date: string;
  note: string | null;
  voided_at: string | null;
  created_by_name: string | null;
  created_at: string;
  sku_count: number;
  total_qty: number;
}

export interface PoDetail {
  id: string;
  po_no: string;
  vendor_id: string;
  vendor: Vendor;
  po_date: string;
  expected_date: string | null;
  status: PoStatus;
  note: string | null;
  done_at: string | null;
  closed_manually: boolean;
  created_by_name: string | null;
  created_at: string;
  updated_by_name: string | null;
  updated_at: string | null;
  lines: PoDetailLine[];
  receipts: PoReceipt[];
}

export async function getPoDetail(id: string): Promise<ActionResult<PoDetail>> {
  const supabase = await createClient();
  const [{ data, error }, { data: received, error: recErr }, { data: receipts, error: rcpErr }] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(
        `id, po_no, vendor_id, po_date, expected_date, status, note, done_at, closed_manually, created_by_name, created_at, updated_by_name, updated_at, vendors(${VENDOR_COLS}), purchase_order_lines(sku_id, qty_suggested, qty, unit_price, skus(code, color, size, products(name)))`,
      )
      .eq("id", id)
      .single(),
    supabase.from("v_po_received").select("sku_id, qty_received").eq("po_id", id),
    supabase
      .from("v_document_summary")
      .select("id, doc_no, doc_date, note, voided_at, created_by_name, created_at, sku_count, total_qty")
      .eq("po_id", id)
      .eq("type", "produksi")
      .order("doc_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (error) return fail(error.code === "PGRST116" ? "PO tidak ditemukan (mungkin sudah dihapus)" : error.message);
  if (recErr) return fail(recErr.message);
  if (rcpErr) return fail(rcpErr.message);
  const recMap = new Map((received ?? []).map((r) => [r.sku_id as string, r.qty_received as number]));
  const row = data as unknown as Omit<PoDetail, "lines" | "vendor" | "receipts"> & {
    vendors: Vendor;
    purchase_order_lines: {
      sku_id: string;
      qty_suggested: number;
      qty: number;
      unit_price: number | string | null;
      skus: { code: string; color: string; size: string; products: { name: string } | null };
    }[];
  };
  const { vendors, purchase_order_lines, ...rest } = row;
  return {
    ok: true,
    data: {
      ...rest,
      vendor: vendors,
      receipts: (receipts ?? []) as PoReceipt[],
      lines: purchase_order_lines
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
            qty: l.qty,
            unit_price: l.unit_price === null ? null : Number(l.unit_price),
            qty_received: recMap.get(l.sku_id) ?? 0,
          };
        })
        .sort((a, b) => a.code.localeCompare(b.code)),
    },
  };
}

async function updateStatus(
  id: string,
  from: PoStatus[],
  patch: Record<string, unknown>,
  notAllowed: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", from)
    .select("id");
  if (error) return fail(error.message);
  if (!data || data.length === 0) return fail(notAllowed);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

/** Tutup PO manual — sisa yang belum datang tidak lagi dihitung sebagai "Dalam PO". */
export async function markPoDone(id: string): Promise<ActionResult> {
  return updateStatus(
    id,
    ["open"],
    { status: "done", done_at: new Date().toISOString(), closed_manually: true },
    "Hanya PO berstatus Dipesan yang bisa ditandai selesai",
  );
}

/** Buka lagi PO yang sudah ditutup manual / dibatalkan. */
export async function reopenPo(id: string): Promise<ActionResult> {
  return updateStatus(
    id,
    ["done", "cancelled"],
    { status: "open", done_at: null, closed_manually: false },
    "PO ini tidak bisa dibuka lagi",
  );
}

export async function cancelPo(id: string): Promise<ActionResult> {
  return updateStatus(id, ["draft", "open"], { status: "cancelled" }, "PO ini sudah selesai atau dibatalkan");
}

/** Draft → Dipesan. Qty langsung dihitung ke kolom "Dalam PO" di PPIC. */
export async function sendPo(id: string): Promise<ActionResult> {
  return updateStatus(id, ["draft"], { status: "open" }, "PO ini bukan draft lagi");
}

export async function deletePo(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_purchase_order", { p_id: id });
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
