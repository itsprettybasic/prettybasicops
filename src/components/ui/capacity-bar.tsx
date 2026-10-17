import { cn } from "@/lib/cn";

/** Progress bar kecil 60×5px (mockup .stock-bar). `pct` = persen 0–∞. */
export function CapacityBar({ pct, tone }: { pct: number | null; tone?: "pos" | "warn" | "neg" | "yellow" | "primary" }) {
  if (pct === null) return <span className="text-grey-2">—</span>;
  const color = {
    pos: "bg-pos",
    warn: "bg-warn",
    neg: "bg-neg",
    yellow: "bg-yellow",
    primary: "bg-primary-2",
  }[tone ?? "pos"];
  const textColor = tone === "neg" ? "text-neg" : tone === "warn" ? "text-warn" : undefined;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-[5px] w-[60px] overflow-hidden rounded-full bg-line">
        {pct > 0 && <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(100, pct)}%` }} />}
      </div>
      <span className={cn("num min-w-[38px] text-right", textColor)}>{Math.round(pct)}%</span>
    </div>
  );
}
