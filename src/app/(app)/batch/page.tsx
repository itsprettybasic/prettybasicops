import { PageHeader } from "@/components/layout/page-header";
import { BatchList, type BatchSummary } from "@/components/ppic/batch-list";
import { InfoBanner } from "@/components/ui/info-banner";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/data/fetch-all";
import { todayJakarta } from "@/lib/format";

export const metadata = { title: "Batch Produksi · Pretty Basic" };

export default async function BatchPage() {
  const supabase = await createClient();
  let batches: BatchSummary[] = [];
  let error: string | null = null;
  try {
    batches = await fetchAll<BatchSummary>(() =>
      supabase
        .from("v_batch_summary")
        .select(
          "id, batch_no, konveksi_id, konveksi_name, konveksi_capacity, sent_date, est_done_date, status, note, done_at, created_at, sku_count, qty_planned, qty_received",
        )
        .order("created_at", { ascending: false }),
    );
  } catch (e) {
    error = e instanceof Error ? e.message : "Data gagal dimuat";
  }

  return (
    <div>
      <PageHeader title="Batch Produksi" sub="Pantau batch di konveksi dan penerimaan barang jadi" />
      {error && (
        <InfoBanner variant="warn" head="Data gagal dimuat">
          {error}
        </InfoBanner>
      )}
      <BatchList batches={batches} today={todayJakarta()} />
    </div>
  );
}
