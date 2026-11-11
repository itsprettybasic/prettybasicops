import { PageHeader } from "@/components/layout/page-header";
import { VendorManager, type VendorSummary } from "@/components/po/vendor-manager";
import { InfoBanner } from "@/components/ui/info-banner";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/data/fetch-all";

export const metadata = { title: "Vendor · Pretty Basic" };

export default async function VendorPage() {
  const supabase = await createClient();
  let vendors: VendorSummary[] = [];
  let error: string | null = null;
  try {
    vendors = await fetchAll<VendorSummary>(() =>
      supabase
        .from("v_vendor_summary")
        .select("id, name, contact_person, phone, email, address, note, is_active, po_count, po_open_count, last_po_date")
        .order("name"),
    );
  } catch (e) {
    error = e instanceof Error ? e.message : "Data gagal dimuat";
  }
  return (
    <div>
      <PageHeader title="Vendor" sub="Database vendor / konveksi untuk PO dan pengiriman kain" />
      {error && (
        <InfoBanner variant="warn" head="Data gagal dimuat">
          {error}
        </InfoBanner>
      )}
      <VendorManager vendors={vendors} />
    </div>
  );
}
