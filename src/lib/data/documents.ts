import "server-only";
import { addDays, format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import type { Direction, MovementType, SalesChannel } from "@/lib/constants";
import { fetchAll } from "./fetch-all";

export interface DocumentSummary {
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
  sku_count: number;
  total_qty: number;
  /** Nama produk unik (sudah di-split dari '|') */
  product_names: string[];
}

export interface PeriodTotal {
  qty: number;
  docs: number;
}

export interface DocumentHistoryStats {
  today: PeriodTotal;
  week: PeriodTotal;
  month: PeriodTotal;
  /** Masuk: jumlah batch berstatus in_production */
  pendingBatches?: number;
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
    stats: { today: { qty: 0, docs: 0 }, week: { qty: 0, docs: 0 }, month: { qty: 0, docs: 0 } },
    error: null,
  };

  try {
    const supabase = await createClient();
    const totals = async (p_from: string): Promise<TotalsRow[]> => {
      const { data, error } = await supabase.rpc("movement_totals", { p_from, p_to: today });
      if (error) throw new Error(error.message);
      return ((data ?? []) as TotalsRow[]).filter((r) => r.direction === direction);
    };
    const sum = (rows: TotalsRow[]): PeriodTotal => ({
      qty: rows.reduce((s, r) => s + r.qty, 0),
      docs: rows.reduce((s, r) => s + r.doc_count, 0),
    });

    const [docs, tToday, tWeek, tMonth, pending] = await Promise.all([
      fetchAll<Omit<DocumentSummary, "product_names"> & { product_names: string | null }>(() =>
        supabase
          .from("v_document_summary")
          .select(
            "id, doc_no, direction, type, doc_date, channel, batch_no, note, source, voided_at, void_reason, created_by_name, created_at, sku_count, total_qty, product_names",
          )
          .eq("direction", direction)
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
        ? supabase.from("production_batches").select("id", { count: "exact", head: true }).eq("status", "in_production")
        : Promise.resolve(null),
    ]);
    if (pending?.error) throw new Error(pending.error.message);

    const stats: DocumentHistoryStats = { today: sum(tToday), week: sum(tWeek), month: sum(tMonth) };
    if (direction === "in") stats.pendingBatches = pending?.count ?? 0;
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
      stats,
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "Gagal memuat data" };
  }
}
