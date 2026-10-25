import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { PackSettingsForm, type CleanupRun, type StorageSummary } from "@/components/packing/pack-settings-form";
import { getCurrentUser } from "@/lib/data/profile";
import { createClient } from "@/lib/supabase/server";
import type { PackSettings } from "@/lib/packing/types";

export const metadata = { title: "Pengaturan Packing · Pretty Basic" };

export default async function PackSettingsPage() {
  const current = await getCurrentUser();
  const role = current?.profile?.role;
  if (role !== "admin" && role !== "supervisor") redirect("/packing");

  const supabase = await createClient();
  const [settingsRes, summaryRes, runsRes] = await Promise.all([
    supabase.from("pack_settings").select("*").eq("id", true).single(),
    supabase.rpc("pack_storage_summary"),
    supabase.from("pack_cleanup_runs").select("ran_at, deleted_count, stale_count, note").order("ran_at", { ascending: false }).limit(5),
  ]);

  const summaryRow = (Array.isArray(summaryRes.data) ? summaryRes.data[0] : summaryRes.data) as StorageSummary | undefined;
  const summary: StorageSummary = summaryRow ?? {
    video_count: 0,
    total_bytes: 0,
    oldest_at: null,
    last_cleanup_at: null,
    last_cleanup_deleted: null,
  };

  return (
    <div>
      <PageHeader title="Pengaturan Packing" sub="Berlaku langsung untuk semua petugas, tanpa perlu update aplikasi" />
      {settingsRes.error || !settingsRes.data ? (
        <div className="rounded-[14px] border border-line bg-white p-6 text-[13px] text-neg">
          Gagal memuat pengaturan: {settingsRes.error?.message ?? "data kosong"}
        </div>
      ) : (
        <PackSettingsForm
          settings={settingsRes.data as PackSettings}
          summary={summary}
          runs={(runsRes.data ?? []) as CleanupRun[]}
        />
      )}
    </div>
  );
}
