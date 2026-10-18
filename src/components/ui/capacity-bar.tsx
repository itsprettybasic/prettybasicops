import { cn } from "@/lib/cn";

/** Progress bar kecil + angka persen. Warna hanya di bar, angka tetap netral supaya rapi. `pct` = persen 0–∞. */
export function CapacityBar({ pct, tone }: { pct: number | null; tone?: "pos" | "warn" | "neg" | "yellow" | "primary" }) {
  if (pct === null) return <span className="text-grey-2">—</span>;
  const color = {
    pos: "bg-pos",
    warn: "bg-warn",
    neg: "bg-neg",
    yellow: "bg-yellow",
    primary: "bg-primary-2",
  }[tone ?? "pos"];
  return (
    <div className="inline-flex items-center gap-2.5">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
        {pct > 0 && <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(100, pct)}%` }} />}
      </div>
      <span className="num w-10 text-right">{Math.round(pct)}%</span>
    </div>
  );
}
