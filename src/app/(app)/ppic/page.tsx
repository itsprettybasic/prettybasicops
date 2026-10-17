import { PageHeader } from "@/components/layout/page-header";
import { PpicTable } from "@/components/ppic/ppic-table";
import { InfoBanner } from "@/components/ui/info-banner";
import { getPpicData, type PpicData } from "@/lib/data/ppic";
import { todayJakarta } from "@/lib/format";

export const metadata = { title: "Rekomendasi Produksi · Pretty Basic" };

export default async function PpicPage() {
  let data: PpicData | null = null;
  let error: string | null = null;
  try {
    data = await getPpicData();
  } catch (e) {
    error = e instanceof Error ? e.message : "Data gagal dimuat";
  }

  return (
    <div>
      <PageHeader
        title="PPIC — Rekomendasi Produksi"
        sub={`Forecast berdasarkan bobot 3 bulan terakhir · Lead time ${data?.params.lead_time_days ?? 14} hari`}
      />
      {error && (
        <InfoBanner variant="warn" head="Data gagal dimuat">
          {error}
        </InfoBanner>
      )}
      <PpicTable rows={data?.rows ?? []} today={data?.today ?? todayJakarta()} />
    </div>
  );
}
