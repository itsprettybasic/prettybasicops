import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/data/profile";
import { getPpicData, type PpicData } from "@/lib/data/ppic";
import { AppDataProvider } from "@/components/providers/app-data";
import { DEFAULT_PARAMS, monthStart } from "@/lib/ppic";
import { todayJakarta } from "@/lib/format";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  // Menu stock/PPIC khusus admin; supervisor & petugas langsung ke Packing
  if (current.profile?.role !== "admin") redirect("/packing");
  const { profile } = current;

  let data: PpicData;
  try {
    data = await getPpicData();
  } catch {
    // Database belum siap / gagal dimuat — tetap tampilkan aplikasi dengan data kosong
    const today = todayJakarta();
    data = {
      today,
      months: { h3: monthStart(today, -3), h2: monthStart(today, -2), h1: monthStart(today, -1), current: monthStart(today, 0) },
      params: DEFAULT_PARAMS,
      rows: [],
    };
  }
  const alertCount = data.rows.filter((r) => r.status === "HABIS" || r.status === "PRODUKSI").length;

  return (
    <AppDataProvider today={data.today} months={data.months} params={data.params} rows={data.rows}>
      <AppShell userName={profile.full_name} role={profile.role} alertCount={alertCount}>
        {children}
      </AppShell>
    </AppDataProvider>
  );
}
