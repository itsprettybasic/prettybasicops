import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { PackHistory } from "@/components/packing/pack-history";
import { getCurrentUser } from "@/lib/data/profile";
import { todayJakarta } from "@/lib/format";

export const metadata = { title: "Riwayat Packing · Pretty Basic" };

export default async function PackHistoryPage() {
  const current = await getCurrentUser();
  if (!current?.profile) redirect("/packing");
  const { profile } = current;
  const isManager = profile.role === "admin" || profile.role === "supervisor";

  return (
    <div>
      <PageHeader title="Riwayat Packing" sub={isManager ? "Semua petugas" : "Rekaman Anda"} />
      <PackHistory isManager={isManager} userId={profile.id} today={todayJakarta()} />
    </div>
  );
}
