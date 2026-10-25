"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/ui/panel";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { InfoBanner } from "@/components/ui/info-banner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/cn";
import { fmtDate, fmtInt, fmtTime } from "@/lib/format";
import { fmtBytes } from "@/lib/packing/media";
import {
  estimateSizeMb,
  QUALITY_PRESET,
  RETENTION_OPTIONS,
  type PackQuality,
  type PackSettings,
} from "@/lib/packing/types";
import { applyRetentionToExisting, runPackCleanupNow, updatePackSettings } from "@/app/actions/packing-settings";

export interface StorageSummary {
  video_count: number;
  total_bytes: number;
  oldest_at: string | null;
  last_cleanup_at: string | null;
  last_cleanup_deleted: number | null;
}

export interface CleanupRun {
  ran_at: string;
  deleted_count: number;
  stale_count: number;
  note: string | null;
}

/** Batas file per video di paket gratis Supabase */
const FREE_FILE_LIMIT_MB = 50;
const QUALITIES: PackQuality[] = ["hemat", "standar", "tinggi"];

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-[10px] border border-line px-4 py-3">
      <span>
        <span className="block text-[13px] font-semibold text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-[12px] text-grey-1">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors",
          checked ? "bg-pos" : "bg-grey-3",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-5",
          )}
        />
      </button>
    </label>
  );
}

export function PackSettingsForm({
  settings,
  summary,
  runs,
}: {
  settings: PackSettings;
  summary: StorageSummary;
  runs: CleanupRun[];
}) {
  const router = useRouter();
  const [retention, setRetention] = useState(settings.retention_days);
  const [customRetention, setCustomRetention] = useState(!RETENTION_OPTIONS.includes(settings.retention_days));
  const [quality, setQuality] = useState<PackQuality>(settings.quality);
  const [maxMin, setMaxMin] = useState(String(Math.round((settings.max_duration_sec / 60) * 10) / 10));
  const [minSec, setMinSec] = useState(String(settings.min_duration_sec));
  const [recordAudio, setRecordAudio] = useState(settings.record_audio);
  const [marketplaces, setMarketplaces] = useState<string[]>(settings.marketplaces);
  const [newMarket, setNewMarket] = useState("");
  const [dupWarning, setDupWarning] = useState(settings.duplicate_warning);
  const [quota, setQuota] = useState(String(settings.storage_quota_gb));
  const [saving, setSaving] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);

  const usedPct = (summary.total_bytes / (settings.storage_quota_gb * 1024 ** 3)) * 100;
  const maxSec = Math.round(Number(maxMin.replace(",", ".")) * 60);
  const retentionChanged = retention !== settings.retention_days;

  function addMarket() {
    const v = newMarket.trim();
    if (!v) return;
    if (marketplaces.some((m) => m.toLowerCase() === v.toLowerCase())) {
      toast.error(`${v} sudah ada`);
      return;
    }
    if (marketplaces.length >= 10) {
      toast.error("Maksimal 10 marketplace");
      return;
    }
    setMarketplaces([...marketplaces, v]);
    setNewMarket("");
  }

  async function save() {
    setSaving(true);
    const res = await updatePackSettings({
      retention_days: retention,
      max_duration_sec: maxSec,
      min_duration_sec: Number(minSec),
      quality,
      marketplaces,
      duplicate_warning: dupWarning,
      record_audio: recordAudio,
      storage_quota_gb: Number(quota.replace(",", ".")),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Pengaturan tersimpan · langsung berlaku untuk rekaman berikutnya");
    router.refresh();
  }

  return (
    <>
      {/* ── Ringkasan storage ── */}
      <StatGrid cols={4}>
        <StatCard label="Video Tersimpan" tone="primary" value={fmtInt(summary.video_count)} sub="Belum kedaluwarsa" />
        <StatCard
          label="Total Ukuran"
          tone={usedPct > 80 ? "neg" : "grey"}
          valueTone={usedPct > 80 ? "neg" : undefined}
          value={fmtBytes(summary.total_bytes)}
          sub={
            <span className="block">
              <span className="mb-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-line">
                <span
                  className={cn("block h-full rounded-full", usedPct > 80 ? "bg-neg" : usedPct > 60 ? "bg-warn" : "bg-pos")}
                  style={{ width: `${Math.min(100, usedPct)}%` }}
                />
              </span>
              {Math.round(usedPct)}% dari {fmtInt(settings.storage_quota_gb)} GB
            </span>
          }
        />
        <StatCard
          label="Video Tertua"
          tone="grey"
          value={<span className="text-[18px] sm:text-[20px]">{summary.oldest_at ? fmtDate(summary.oldest_at) : "—"}</span>}
          sub={summary.oldest_at ? `Selesai jam ${fmtTime(summary.oldest_at)}` : "Belum ada video"}
        />
        <StatCard
          label="Pembersihan Terakhir"
          tone="warn"
          value={<span className="text-[18px] sm:text-[20px]">{summary.last_cleanup_at ? fmtDate(summary.last_cleanup_at) : "—"}</span>}
          sub={
            summary.last_cleanup_at
              ? `${fmtTime(summary.last_cleanup_at)} · ${fmtInt(summary.last_cleanup_deleted ?? 0)} file dihapus`
              : "Otomatis tiap hari 03.00 WIB"
          }
        />
      </StatGrid>

      {usedPct > 80 && (
        <InfoBanner variant="warn" head="Storage hampir penuh">
          Sudah terpakai <strong>{Math.round(usedPct)}%</strong> dari {fmtInt(settings.storage_quota_gb)} GB. Kalau penuh, video
          baru gagal diupload (tetap tersimpan di HP petugas sampai ada ruang). Kurangi <strong>lama penyimpanan</strong>, pakai
          kualitas <strong>Hemat</strong>, atau upgrade storage.
        </InfoBanner>
      )}

      <Panel
        title="Penghapusan Otomatis"
        sub="Tiap hari jam 03.00 WIB video yang lewat masa simpan dihapus. Catatan paket tetap ada."
        actions={<Button onClick={() => setCleanupOpen(true)}>Jalankan pembersihan sekarang</Button>}
      >
        {runs.length === 0 ? (
          <div className="text-[12.5px] text-grey-1">Belum pernah berjalan.</div>
        ) : (
          <div className="divide-y divide-line-2 text-[12.5px]">
            {runs.map((r) => (
              <div key={r.ran_at} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 py-2">
                <span className="font-semibold text-ink">
                  {fmtDate(r.ran_at)} · {fmtTime(r.ran_at)}
                </span>
                <span className="text-grey-1">
                  {fmtInt(r.deleted_count)} video dihapus
                  {r.stale_count > 0 && ` · ${fmtInt(r.stale_count)} rekaman ditandai terputus`}
                  {r.note && ` · ${r.note}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* ── Video ── */}
      <Panel title="Video" sub="Lama simpan, kualitas, dan durasi rekaman">
        <div className="mb-6">
          <label className="form-label">Lama Penyimpanan Video</label>
          <div className="flex flex-wrap items-center gap-2">
            {RETENTION_OPTIONS.map((d) => (
              <FilterChip
                key={d}
                active={!customRetention && retention === d}
                onClick={() => {
                  setCustomRetention(false);
                  setRetention(d);
                }}
              >
                {d} hari
              </FilterChip>
            ))}
            <FilterChip active={customRetention} onClick={() => setCustomRetention(true)}>
              Lainnya
            </FilterChip>
            {customRetention && (
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={365}
                  className="form-input w-24"
                  value={retention}
                  onChange={(e) => setRetention(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                />
                <span className="text-[12.5px] text-grey-1">hari</span>
              </span>
            )}
          </div>
          <div className="form-hint">
            Hanya berlaku untuk rekaman <strong>baru</strong>. Video lama tetap memakai masa simpan saat direkam.
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <Button size="sm" onClick={() => setApplyOpen(true)} disabled={retentionChanged}>
              Terapkan ke video yang sudah ada
            </Button>
            {retentionChanged && <span className="text-[11.5px] text-warn-text">Simpan pengaturan dulu sebelum menerapkan ke video lama</span>}
          </div>
        </div>

        <div className="mb-6">
          <label className="form-label">Kualitas Video</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {QUALITIES.map((q) => {
              const p = QUALITY_PRESET[q];
              const per2 = estimateSizeMb(q, 120);
              const per10 = estimateSizeMb(q, 600);
              const perMax = maxSec > 0 ? estimateSizeMb(q, maxSec) : per10;
              const tooBig = perMax > FREE_FILE_LIMIT_MB;
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuality(q)}
                  className={cn(
                    "cursor-pointer rounded-[12px] border px-4 py-3 text-left transition-colors",
                    quality === q ? "border-primary bg-primary-tint ring-1 ring-primary" : "border-line bg-white hover:border-grey-3",
                  )}
                >
                  <div className="text-[13.5px] font-bold text-ink">{p.label}</div>
                  <div className="mt-1 text-[12px] text-grey-1">
                    ±{per2.toFixed(0)} MB / 2 menit · ±{per10.toFixed(0)} MB / 10 menit
                  </div>
                  {tooBig && (
                    <div className="mt-1.5 text-[11.5px] font-semibold text-warn-text">
                      Durasi maks ±{perMax.toFixed(0)} MB — paket gratis Supabase: maks {FREE_FILE_LIMIT_MB} MB per video
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="form-label">Durasi Maksimal per Rekaman</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                min={0.5}
                max={60}
                step={0.5}
                className="form-input"
                value={maxMin}
                onChange={(e) => setMaxMin(e.target.value)}
              />
              <span className="text-[12.5px] text-grey-1">menit</span>
            </div>
            <div className="form-hint">Lewat dari ini rekaman otomatis berhenti & disimpan (&quot;dihentikan otomatis&quot;)</div>
          </div>
          <div>
            <label className="form-label">Durasi Minimal sebelum Scan Penutup</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={120}
                className="form-input"
                value={minSec}
                onChange={(e) => setMinSec(e.target.value)}
              />
              <span className="text-[12.5px] text-grey-1">detik</span>
            </div>
            <div className="form-hint">Scan resi yang sama sebelum ini diabaikan (supaya tidak berhenti karena terbaca dua kali)</div>
          </div>
        </div>

        <Toggle
          checked={recordAudio}
          onChange={setRecordAudio}
          label="Rekam suara"
          hint="Default mati. Kalau dinyalakan, HP akan minta izin mikrofon dan ukuran video sedikit lebih besar."
        />
      </Panel>

      {/* ── Marketplace ── */}
      <Panel title="Marketplace" sub="Pilihan marketplace di layar rekam">
        <div className="mb-3 flex flex-wrap gap-2">
          {marketplaces.map((m) => (
            <span
              key={m}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg py-1.5 pr-1.5 pl-3.5 text-[13px] font-semibold text-ink"
            >
              {m}
              <button
                type="button"
                aria-label={`Hapus ${m}`}
                disabled={marketplaces.length <= 1}
                onClick={() => setMarketplaces(marketplaces.filter((x) => x !== m))}
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-grey-1 hover:bg-neg-tint hover:text-neg disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex max-w-[420px] gap-2">
          <input
            className="form-input"
            placeholder="Mis. Lazada, Tokopedia"
            maxLength={30}
            value={newMarket}
            onChange={(e) => setNewMarket(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addMarket();
              }
            }}
          />
          <Button onClick={addMarket} disabled={!newMarket.trim()}>
            <Plus className="h-4 w-4" />
            Tambah
          </Button>
        </div>
      </Panel>

      {/* ── Lainnya ── */}
      <Panel title="Lainnya">
        <div className="mb-4">
          <Toggle
            checked={dupWarning}
            onChange={setDupWarning}
            label="Peringatan resi duplikat"
            hint="Kalau resi pernah direkam, petugas diberi pilihan rekam ulang (versi lama tetap tersimpan) atau batal."
          />
        </div>
        <div className="max-w-[320px]">
          <label className="form-label">Kuota Storage</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min={0.1}
              step={0.1}
              className="form-input"
              value={quota}
              onChange={(e) => setQuota(e.target.value)}
            />
            <span className="text-[12.5px] text-grey-1">GB</span>
          </div>
          <div className="form-hint">Untuk indikator pemakaian. 1 = paket gratis Supabase, 100 = paket Pro.</div>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.08)] sm:sticky sm:bottom-4 sm:z-10 sm:px-[22px]">
        <div className="text-[12px] text-grey-1">
          Terakhir diubah {fmtDate(settings.updated_at)} {fmtTime(settings.updated_at)}
          {settings.updated_by_name && <> oleh {settings.updated_by_name}</>}
        </div>
        <Button variant="primary" onClick={save} loading={saving} className="w-full sm:w-auto">
          Simpan Pengaturan
        </Button>
      </div>

      <ConfirmDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        title="Terapkan ke video yang sudah ada?"
        confirmLabel="Ya, Terapkan"
        tone="neg"
        message={
          <div className="space-y-2">
            <p>
              Masa simpan semua video yang masih ada akan dihitung ulang menjadi{" "}
              <strong>{fmtInt(settings.retention_days)} hari</strong> sejak paket selesai direkam.
            </p>
            <p>
              Video yang sudah lebih tua dari {fmtInt(settings.retention_days)} hari akan <strong>dihapus</strong> pada
              pembersihan berikutnya (tiap hari 03.00 WIB, atau saat &quot;Jalankan pembersihan sekarang&quot;).
            </p>
          </div>
        }
        onConfirm={async () => {
          const res = await applyRetentionToExisting();
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success(`Masa simpan ${fmtInt(res.data.count)} video diperbarui`);
          setApplyOpen(false);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={cleanupOpen}
        onOpenChange={setCleanupOpen}
        title="Jalankan pembersihan sekarang?"
        confirmLabel="Ya, Jalankan"
        message="Video yang masa simpannya sudah lewat akan dihapus sekarang. Catatan paketnya tetap tersimpan dengan status “Video sudah dihapus (kedaluwarsa)”."
        onConfirm={async () => {
          const res = await runPackCleanupNow();
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success(`${fmtInt(res.data.deleted)} video kedaluwarsa dihapus`);
          setCleanupOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
