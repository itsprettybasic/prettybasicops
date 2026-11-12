import "server-only";
import { addDays, format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import { IN_TYPES, OUT_TYPES, type Direction, type MovementType, type SalesChannel } from "@/lib/constants";
import { fetchAll } from "./fetch-all";

export interface DocumentSummary {
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
  sku_count: number;
  total_qty: number;
  /** Nama produk unik (sudah di-split dari '|') */
  product_names: string[];
}

/** Salinan catatan yang sudah dihapus (log penghapusan) */
export interface DeletedDocument {
  id: string;
  doc_no: string;
  direction: Direction;
  type: MovementType;
  doc_date: string;
  channel: SalesChannel | null;
  po_no: string | null;
  note: string | null;
  source: string | null;
  voided_at: string | null;
  created_by_name: string | null;
  created_at: string | null;
  lines: { sku_id: string; code: string; label: string; qty: number }[];
  sku_count: number;
  total_qty: number;
  deleted_by_name: string | null;
  deleted_at: string;
}

export interface PeriodTotal {
  qty: number;
  docs: number;
}

export interface DocumentHistoryStats {
  today: PeriodTotal;
  week: PeriodTotal;
  month: PeriodTotal;
  /** Masuk: jumlah PO berstatus Dipesan (belum datang semua) */
  openPos?: number;
  /** Keluar: damage & sales bulan ini */
  damageMonth?: number;
  salesMonth?: number;
}

export interface DocumentHistoryData {
  direction: Direction;
  today: string;
  from: string;
  to: string;
  documents: DocumentSummary[];
  /** Catatan di rentang tanggal ini yang sudah dihapus */
  deleted: DeletedDocument[];
  stats: DocumentHistoryStats;
  /** Error saat memuat (database belum siap, dll.) */
  error: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(s: string | undefined): s is string {
  return !!s && DATE_RE.test(s) && !Number.isNaN(parseISO(s).getTime());
}

const shift = (iso: string, days: number) => format(addDays(parseISO(iso), days), "yyyy-MM-dd");

interface TotalsRow {
  direction: Direction;
  type: MovementType;
  doc_count: number;
  qty: number;
}

/** Data halaman Barang Masuk / Barang Keluar: semua catatan dalam rentang tanggal + angka stat card. */
export async function getDocumentHistory(
  direction: Direction,
  range: { from?: string; to?: string },
  opts: { type?: MovementType } = {},
): Promise<DocumentHistoryData> {
  const today = todayJakarta();
  const monthStart = `${today.slice(0, 8)}01`;
  let from = validDate(range.from) ? range.from : monthStart;
  let to = validDate(range.to) ? range.to : today;
  if (from > to) [from, to] = [to, from];

  const empty: DocumentHistoryData = {
    direction,
    today,
    from,
    to,
    documents: [],
    deleted: [],
    stats: { today: { qty: 0, docs: 0 }, week: { qty: 0, docs: 0 }, month: { qty: 0, docs: 0 } },
    error: null,
  };

  try {
    const supabase = await createClient();
    const totals = async (p_from: string): Promise<TotalsRow[]> => {
      const { data, error } = await supabase.rpc("movement_totals", { p_from, p_to: today });
      if (error) throw new Error(error.message);
      return ((data ?? []) as TotalsRow[]).filter((r) => r.direction === direction && (!opts.type || r.type === opts.type));
    };
    const sum = (rows: TotalsRow[]): PeriodTotal => ({
      qty: rows.reduce((s, r) => s + r.qty, 0),
      docs: rows.reduce((s, r) => s + r.doc_count, 0),
    });

    const types = opts.type ? [opts.type] : direction === "in" ? IN_TYPES : OUT_TYPES;
    const [docs, tToday, tWeek, tMonth, pending, deleted] = await Promise.all([
      fetchAll<Omit<DocumentSummary, "product_names"> & { product_names: string | null }>(() =>
        supabase
          .from("v_document_summary")
          .select(
            "id, doc_no, direction, type, doc_date, channel, po_id, po_no, vendor_name, note, source, voided_at, void_reason, created_by_name, created_at, sku_count, total_qty, product_names",
          )
          .eq("direction", direction)
          .in("type", types)
          .gte("doc_date", from)
          .lte("doc_date", to)
          .order("doc_date", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id"),
      ),
      totals(today),
      totals(shift(today, -6)),
      totals(monthStart),
      direction === "in"
        ? supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("status", "open")
        : Promise.resolve(null),
      supabase
        .from("stock_document_deletions")
        .select(
          "id, doc_no, direction, type, doc_date, channel, po_no, note, source, voided_at, created_by_name, created_at, lines, sku_count, total_qty, deleted_by_name, deleted_at",
        )
        .eq("direction", direction)
        .in("type", types)
        .gte("doc_date", from)
        .lte("doc_date", to)
        .order("deleted_at", { ascending: false })
        .limit(500),
    ]);
    if (pending?.error) throw new Error(pending.error.message);

    const stats: DocumentHistoryStats = { today: sum(tToday), week: sum(tWeek), month: sum(tMonth) };
    if (direction === "in") stats.openPos = pending?.count ?? 0;
    else {
      stats.damageMonth = tMonth.filter((r) => r.type === "damage").reduce((s, r) => s + r.qty, 0);
      stats.salesMonth = tMonth.filter((r) => r.type === "sales").reduce((s, r) => s + r.qty, 0);
    }

    return {
      ...empty,
      documents: docs.map((d) => ({
        ...d,
        product_names: (d.product_names ?? "")
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean),
      })),
      // Log hapus tidak wajib: kalau gagal dimuat, halaman tetap jalan
      deleted: deleted.error ? [] : ((deleted.data ?? []) as DeletedDocument[]),
      stats,
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "Gagal memuat data" };
  }
}
