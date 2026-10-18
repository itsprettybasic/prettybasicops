import { cn } from "@/lib/cn";
import { STATUS_TONE, type BadgeTone } from "@/lib/constants";
import type { PpicStatus, RankClass } from "@/lib/ppic";

const TONES: Record<BadgeTone, string> = {
  pos: "bg-pos-tint text-pos-text",
  warn: "bg-warn-tint text-warn-text",
  neg: "bg-neg-tint text-neg-text",
  info: "bg-primary-tint text-primary",
  yellow: "bg-yellow-tint text-yellow-text",
  purple: "bg-purple-tint text-purple-text",
  grey: "bg-line-2 text-ink-3",
};

export function Badge({ tone = "grey", className, children }: { tone?: BadgeTone; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-[9px] py-[3px] text-[11px] font-bold tracking-[0.01em] whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: PpicStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;
}

const RANK_STYLE: Record<RankClass, string> = {
  A: "text-pos",
  B: "text-yellow",
  C: "text-grey-2",
};

const RANK_TITLE: Record<RankClass, string> = {
  A: "Kelas A — penyumbang 70% penjualan teratas",
  B: "Kelas B — 20% penjualan berikutnya",
  C: "Kelas C — 10% sisanya",
};

/** Label kelas A/B/C yang ringan: huruf di kotak kecil dengan ring tipis. */
export function RankBadge({ rank, overridden }: { rank: RankClass; overridden?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1"
      title={`${RANK_TITLE[rank]}${overridden ? " · diatur manual" : ""}`}
    >
      <span
        className={cn(
          "text-[13.5px] leading-none font-extrabold",
          RANK_STYLE[rank],
        )}
      >
        {rank}
      </span>
      {overridden && <span className="h-1 w-1 rounded-full bg-primary-2" aria-label="diatur manual" />}
    </span>
  );
}
