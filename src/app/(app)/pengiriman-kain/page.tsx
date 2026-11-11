import { PageHeader } from "@/components/layout/page-header";
import { FabricList, type FabricLineRow, type FabricShipmentRow } from "@/components/fabric/fabric-list";
import { InfoBanner } from "@/components/ui/info-banner";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/data/fetch-all";
import { todayJakarta } from "@/lib/format";

export const metadata = { title: "Pengiriman Kain · Pretty Basic" };

export default async function PengirimanKainPage() {
  const supabase = await createClient();
  let shipments: FabricShipmentRow[] = [];
  let lines: FabricLineRow[] = [];
  let error: string | null = null;
  try {
    [shipments, lines] = await Promise.all([
      fetchAll<FabricShipmentRow>(() =>
        supabase
          .from("v_fabric_shipment_summary")
          .select(
            "id, sj_no, ship_date, vendor_id, vendor_name, po_id, po_no, status, received_date, received_by, driver_name, vehicle_no, note, created_by_name, created_at, line_count, total_kg, total_roll, fabric_types, colors",
          )
          .order("ship_date", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id"),
      ),
      fetchAll<FabricLineRow>(() =>
        supabase
          .from("fabric_shipment_lines")
          .select("shipment_id, line_no, fabric_type, color, qty_kg, roll_count, note")
          .order("shipment_id")
          .order("line_no"),
      ),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Data gagal dimuat";
  }
  return (
    <div>
      <PageHeader title="Pengiriman Kain" sub="Catatan kain yang dikirim ke vendor · lengkap dengan Surat Jalan" />
      {error && (
        <InfoBanner variant="warn" head="Data gagal dimuat">
          {error}
        </InfoBanner>
      )}
      <FabricList shipments={shipments} lines={lines} today={todayJakarta()} />
    </div>
  );
}
