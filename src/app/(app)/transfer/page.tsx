import type { Metadata } from "next";
import { parseISO } from "date-fns";
import { PageHeader } from "@/components/layout/page-header";
import { TransferList, type TransferSummary } from "@/components/warehouse/transfer-list";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/data/fetch-all";
import { todayJakarta } from "@/lib/format";

export const metadata: Metadata = { title: "Transfer Stock · Pretty Basic" };

const valid = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseISO(s).getTime());

export default async function TransferPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const today = todayJakarta();
  let from = valid(sp.from) ? sp.from : `${today.slice(0, 8)}01`;
  let to = valid(sp.to) ? sp.to : today;
  if (from > to) [from, to] = [to, from];

  let transfers: TransferSummary[] = [];
  let loadError: string | null = null;
  try {
    const supabase = await createClient();
    const rows = await fetchAll<Omit<TransferSummary, "product_names"> & { product_names: string | null }>(() =>
      supabase
        .from("v_transfer_summary")
        .select(
          "id, transfer_no, transfer_date, from_warehouse_id, to_warehouse_id, from_warehouse_name, to_warehouse_name, note, created_by_name, created_at, updated_by_name, updated_at, sku_count, total_qty, product_names",
        )
        .gte("transfer_date", from)
        .lte("transfer_date", to)
        .order("transfer_date", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id"),
    );
    transfers = rows.map((r) => ({
      ...r,
      product_names: (r.product_names ?? "").split("|").map((s) => s.trim()).filter(Boolean),
    }));
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <PageHeader title="Transfer Stock" sub="Pindahkan stock dari satu gudang ke gudang lain · bisa diedit & dihapus" />
      <TransferList transfers={transfers} from={from} to={to} loadError={loadError} />
    </div>
  );
}
