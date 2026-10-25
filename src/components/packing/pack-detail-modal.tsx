"use client";

import { useEffect, useState } from "react";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { getPackVideoUrl } from "@/app/actions/packing-video";
import { fmtDate, fmtTime } from "@/lib/format";
import { daysLeft, videoState } from "@/lib/packing/expiry";
import { fmtBytes, fmtDuration } from "@/lib/packing/media";
import type { PackRecord } from "@/lib/packing/types";
import { PackStatusBadge, VideoStateLabel } from "./pack-status-badge";

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-bold tracking-[0.06em] text-grey-1 uppercase">{label}</div>
      <div className="mt-1 text-[13px] font-semibold break-words text-ink">{children}</div>
    </div>
  );
}

const dateTime = (d: string | null) => (d ? `${fmtDate(d)} · ${fmtTime(d)}` : "—");

export function PackDetailModal({ record, onClose }: { record: PackRecord | null; onClose: () => void }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const state = record ? videoState(record) : "none";

  useEffect(() => {
    setVideoUrl(null);
    setVideoError(null);
    if (!record || state !== "available") return;
    let cancelled = false;
    getPackVideoUrl(record.id, false).then((res) => {
      if (cancelled) return;
      if (res.ok) setVideoUrl(res.data.url);
      else setVideoError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [record, state]);

  async function copyResi() {
    if (!record) return;
    try {
      await navigator.clipboard.writeText(record.resi);
      toast.success(`Resi ${record.resi} disalin`);
    } catch {
      toast.error("Gagal menyalin resi");
    }
  }

  async function download() {
    if (!record) return;
    setDownloading(true);
    const res = await getPackVideoUrl(record.id, true);
    setDownloading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const a = document.createElement("a");
    a.href = res.data.url;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <Modal
      open={!!record}
      onOpenChange={(o) => !o && onClose()}
      eyebrow={record?.marketplace}
      title={record?.resi ?? ""}
      sub={record ? <VideoStateLabel record={record} /> : undefined}
      footerLeft={
        <Button onClick={copyResi}>
          <Copy className="h-4 w-4" />
          Salin resi
        </Button>
      }
      footer={
        state === "available" ? (
          <Button variant="primary" onClick={download} loading={downloading}>
            <Download className="h-4 w-4" />
            Unduh video
          </Button>
        ) : undefined
      }
    >
      {record && (
        <>
          {state === "available" && (
            <div className="mb-5 overflow-hidden rounded-xl bg-ink">
              {videoUrl ? (
                <video src={videoUrl} controls playsInline preload="metadata" className="mx-auto max-h-[60vh] w-full" />
              ) : (
                <div className="flex aspect-video items-center justify-center text-[13px] text-white/70">
                  {videoError ?? "Memuat video…"}
                </div>
              )}
            </div>
          )}
          {state === "expired" && (
            <div className="mb-5 rounded-xl border border-line bg-line-2 px-4 py-4 text-[13px] text-ink-3">
              Video sudah dihapus (kedaluwarsa) pada <strong>{fmtDate(record.video_deleted_at)}</strong>. Catatan paket
              tetap tersimpan.
            </div>
          )}
          {state === "uploading" && (
            <div className="mb-5 rounded-xl border border-[#FED7AA] bg-warn-tint px-4 py-4 text-[13px] text-warn-text">
              Video belum terupload. Biasanya masih dalam antrean di HP petugas dan akan terkirim otomatis saat online.
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-[10px] border border-line bg-bg px-5 py-4 sm:grid-cols-3">
            <Info label="Status">
              <PackStatusBadge status={record.status} />
            </Info>
            <Info label="Petugas">{record.packer_name}</Info>
            <Info label="Versi">{record.version > 1 ? `Rekam ulang ke-${record.version}` : "Rekaman pertama"}</Info>
            <Info label="Mulai">{dateTime(record.started_at)}</Info>
            <Info label="Selesai">{dateTime(record.finished_at)}</Info>
            <Info label="Durasi">{record.duration_sec === null ? "—" : fmtDuration(record.duration_sec)}</Info>
            <Info label="Ukuran video">{record.video_size ? fmtBytes(record.video_size) : "—"}</Info>
            <Info label="Kedaluwarsa">
              {record.video_expires_at ? (
                <>
                  {fmtDate(record.video_expires_at)}
                  {state === "available" && (
                    <span className="font-medium text-grey-1"> · sisa {daysLeft(record.video_expires_at)} hari</span>
                  )}
                </>
              ) : (
                "—"
              )}
            </Info>
            {record.order_id && <Info label="Order ID">{record.order_id}</Info>}
          </div>
        </>
      )}
    </Modal>
  );
}
