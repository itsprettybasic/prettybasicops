import { PageHeader } from "@/components/layout/page-header";
import { PoList, type PoSummary } from "@/components/po/po-list";
import { InfoBanner } from "@/components/ui/info-banner";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/data/fetch-all";
import { todayJakarta } from "@/lib/format";

export const metadata = { title: "Purchase Order · Pretty Basic" };

export default async function PoPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const supabase = await createClient();
  let pos: PoSummary[] = [];
  let error: string | null = null;
  try {
    pos = await fetchAll<PoSummary>(() =>
      supabase
        .from("v_po_summary")
        .select(
          "id, po_no, batch, vendor_id, vendor_name, po_date, expected_date, status, note, done_at, created_at, sku_count, qty_ordered, qty_received, total_amount, receipt_count, last_receipt_date",
        )
        .order("po_date", { ascending: false })
        .order("created_at", { ascending: false }),
    );
  } catch (e) {
    error = e instanceof Error ? e.message : "Data gagal dimuat";
  }

  return (
    <div>
      <PageHeader title="Purchase Order" sub="Pesan barang ke vendor, pantau kedatangan, dan cetak dokumen PO" />
      {error && (
        <InfoBanner variant="warn" head="Data gagal dimuat">
          {error}
        </InfoBanner>
      )}
      <PoList pos={pos} today={todayJakarta()} initialOpenId={id && /^[0-9a-f-]{36}$/.test(id) ? id : null} />
    </div>
  );
}
