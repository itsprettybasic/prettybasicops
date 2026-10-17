import { PageHeader } from "@/components/layout/page-header";
import { MutasiTimeline, type MutasiDoc, type MutasiStats } from "@/components/stock/mutasi-timeline";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/data/fetch-all";
import { todayJakarta } from "@/lib/format";
import { monthStart } from "@/lib/ppic";
import type { Direction, MovementType } from "@/lib/constants";

export const metadata = { title: "Riwayat Mutasi · Pretty Basic" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pickDate(v: string | string[] | undefined, fallback: string) {
  const s = Array.isArray(v) ? v[0] : v;
  return s && DATE_RE.test(s) ? s : fallback;
}

export default async function MutasiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const today = todayJakarta();
  const thisMonth = monthStart(today, 0);
  let from = pickDate(sp.from, thisMonth);
  let to = pickDate(sp.to, today);
  if (from > to) [from, to] = [to, from];

  const supabase = await createClient();
  let loadError: string | null = null;

  const [docs, totalsRes] = await Promise.all([
    fetchAll<MutasiDoc>(() =>
      supabase
        .from("v_document_summary")
        .select(
          "id, doc_no, direction, type, doc_date, channel, batch_no, note, source, created_at, created_by_name, sku_count, total_qty, product_names",
        )
        .is("voided_at", null)
        .gte("doc_date", from)
        .lte("doc_date", to)
        .order("doc_date", { ascending: false })
        .order("created_at", { ascending: false }),
    ).catch((e: unknown) => {
      loadError = e instanceof Error ? e.message : String(e);
      return [] as MutasiDoc[];
    }),
    supabase.rpc("movement_totals", { p_from: thisMonth, p_to: today }),
  ]);

  const stats: MutasiStats = { qtyIn: 0, qtyOut: 0, docsIn: 0, docsOut: 0, adjustments: 0 };
  for (const r of (totalsRes.data ?? []) as { direction: Direction; type: MovementType; doc_count: number; qty: number }[]) {
    if (r.direction === "in") {
      stats.qtyIn += r.qty;
      stats.docsIn += r.doc_count;
    } else {
      stats.qtyOut += r.qty;
      stats.docsOut += r.doc_count;
    }
    if (r.type === "adjustment_in" || r.type === "adjustment_out") stats.adjustments += r.doc_count;
  }
  if (totalsRes.error) loadError ??= totalsRes.error.message;

  return (
    <div>
      <PageHeader title="Riwayat Mutasi Stock" sub="Semua pergerakan stock dalam satu timeline" />
      <MutasiTimeline docs={docs} from={from} to={to} stats={stats} loadError={loadError} />
    </div>
  );
}
