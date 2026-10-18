import { format, parseISO, subDays } from "date-fns";
import { PageHeader } from "@/components/layout/page-header";
import { StockLiveTable, type MovementSummary } from "@/components/stock/stock-live-table";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import type { Direction, MovementType } from "@/lib/constants";

export const metadata = { title: "Stock Live · Pretty Basic" };

export default async function StockPage() {
  const today = todayJakarta();
  // Jendela 7 hari = hari ini − 6 s/d hari ini (Asia/Jakarta)
  const from = format(subDays(parseISO(today), 6), "yyyy-MM-dd");
  const supabase = await createClient();

  const totalsRes = await supabase.rpc("movement_totals", { p_from: from, p_to: today });

  const summary: MovementSummary = { qtyIn: 0, qtyOut: 0, docsIn: 0, docsOut: 0, salesOut: 0 };
  for (const r of (totalsRes.data ?? []) as { direction: Direction; type: MovementType; doc_count: number; qty: number }[]) {
    if (r.direction === "in") {
      summary.qtyIn += r.qty;
      summary.docsIn += r.doc_count;
    } else {
      summary.qtyOut += r.qty;
      summary.docsOut += r.doc_count;
      if (r.type === "sales") summary.salesOut += r.qty;
    }
  }

  const loadError = totalsRes.error?.message ?? null;

  return (
    <div>
      <PageHeader title="Stock Live — Semua SKU" sub="Real-time dari Barang Masuk & Barang Keluar" />
      <StockLiveTable summary={summary} loadError={loadError} />
    </div>
  );
}
