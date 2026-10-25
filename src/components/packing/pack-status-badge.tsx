import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { BadgeTone } from "@/lib/constants";
import { daysLeft, videoState } from "@/lib/packing/expiry";
import { PACK_STATUS_LABEL, type PackRecord, type PackStatus } from "@/lib/packing/types";

const STATUS_TONE: Record<PackStatus, BadgeTone> = {
  merekam: "info",
  selesai: "pos",
  dihentikan_otomatis: "yellow",
  terputus: "warn",
  dibatalkan: "grey",
};

export function PackStatusBadge({ status }: { status: PackStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{PACK_STATUS_LABEL[status]}</Badge>;
}

type VideoInfo = Pick<PackRecord, "status" | "video_path" | "video_deleted_at" | "video_expires_at">;

export function videoStateText(r: VideoInfo): string {
  switch (videoState(r)) {
    case "available":
      return r.video_expires_at ? `Video tersedia · sisa ${daysLeft(r.video_expires_at)} hari` : "Video tersedia";
    case "uploading":
      return "Video belum terupload";
    case "expired":
      return "Video sudah dihapus (kedaluwarsa)";
    default:
      return "—";
  }
}

export function VideoStateLabel({ record, className }: { record: VideoInfo; className?: string }) {
  const state = videoState(record);
  const tone = { available: "text-pos-text", uploading: "text-warn-text", expired: "text-grey-1", none: "text-grey-2" }[state];
  return <span className={cn("text-[12px] font-medium", tone, className)}>{videoStateText(record)}</span>;
}
