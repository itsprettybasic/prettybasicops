import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { StaffManager, type StaffRow } from "@/components/packing/staff-manager";
import { getCurrentUser } from "@/lib/data/profile";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";

export const metadata = { title: "Kelola Petugas · Pretty Basic" };

const ROLE_ORDER = { admin: 0, supervisor: 1, petugas: 2 } as const;

export default async function StaffPage() {
  const current = await getCurrentUser();
  if (current?.profile?.role !== "admin") redirect("/packing");

  const supabase = await createClient();
  const today = todayJakarta();
  const [profilesRes, todayRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, username, role, is_active, created_at"),
    supabase
      .from("pack_records")
      .select("packer_id")
      .neq("status", "dibatalkan")
      .gte("created_at", `${today}T00:00:00+07:00`)
      .limit(5000),
  ]);

  const todayCount = new Map<string, number>();
  for (const r of (todayRes.data ?? []) as { packer_id: string }[]) {
    todayCount.set(r.packer_id, (todayCount.get(r.packer_id) ?? 0) + 1);
  }
  const rows: StaffRow[] = ((profilesRes.data ?? []) as Omit<StaffRow, "today_count">[])
    .map((p) => ({ ...p, today_count: todayCount.get(p.id) ?? 0 }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.full_name.localeCompare(b.full_name, "id"));

  return (
    <div>
      <PageHeader title="Kelola Petugas" sub="Akun login untuk petugas packing & supervisor" />
      <StaffManager rows={rows} selfId={current.profile.id} loadError={profilesRes.error?.message ?? null} />
    </div>
  );
}
