import { PackRecorder } from "@/components/packing/recorder";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/profile";
import { todayJakarta } from "@/lib/format";
import type { PackSettings } from "@/lib/packing/types";

export const metadata = { title: "Rekam Packing · Pretty Basic" };
export const dynamic = "force-dynamic";

/** Dipakai kalau pengaturan gagal dimuat (mis. koneksi), supaya petugas tetap bisa merekam. */
const FALLBACK_SETTINGS: PackSettings = {
  retention_days: 14,
  max_duration_sec: 600,
  min_duration_sec: 5,
  quality: "hemat",
  marketplaces: ["Shopee", "TikTok Shop"],
  packers: [],
  duplicate_warning: true,
  record_audio: false,
  storage_quota_gb: 1,
  updated_at: new Date(0).toISOString(),
  updated_by_name: null,
};

export default async function PackingPage() {
  const supabase = await createClient();
  const current = await getCurrentUser();
  const today = todayJakarta();

  const [settingsRes, countRes] = await Promise.all([
    supabase.from("pack_settings").select("*").maybeSingle(),
    current
      ? supabase
          .from("pack_records")
          .select("id", { count: "exact", head: true })
          .eq("packer_id", current.user.id)
          .neq("status", "dibatalkan")
          .gte("created_at", `${today}T00:00:00+07:00`)
      : Promise.resolve({ count: 0 }),
  ]);

  const settings = (settingsRes.data as PackSettings | null) ?? FALLBACK_SETTINGS;

  return (
    <div className="mx-auto max-w-[480px]">
      <h1 className="mb-3 text-xl font-bold tracking-[-0.02em] text-ink sm:text-2xl">Rekam Packing</h1>
      <PackRecorder
        settings={settings}
        settingsError={!settingsRes.data}
        packerName={current?.profile?.full_name ?? "Petugas"}
        todayCount={countRes.count ?? 0}
      />
    </div>
  );
}
