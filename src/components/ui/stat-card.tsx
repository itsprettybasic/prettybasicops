import { cn } from "@/lib/cn";

export type StatTone = "neg" | "warn" | "pos" | "primary" | "yellow" | "purple" | "grey";

const DOT: Record<StatTone, string> = {
  neg: "bg-neg",
  warn: "bg-warn",
  pos: "bg-pos",
  primary: "bg-primary-2",
  yellow: "bg-yellow",
  purple: "bg-purple",
  grey: "bg-grey-2",
};

const VALUE: Partial<Record<StatTone, string>> = {
  neg: "text-neg",
  warn: "text-warn",
  pos: "text-pos",
  yellow: "text-yellow",
  purple: "text-purple",
};

export function StatGrid({ cols, children }: { cols: 4 | 5 | 6; children: React.ReactNode }) {
  const grid = { 4: "grid-cols-4", 5: "grid-cols-5", 6: "grid-cols-6" }[cols];
  return <div className={cn("mb-5 grid gap-4", grid)}>{children}</div>;
}

export function StatCard({
  label,
  value,
  unit,
  sub,
  tone = "grey",
  valueTone,
  active,
  onClick,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  sub?: React.ReactNode;
  /** Warna dot label */
  tone?: StatTone;
  /** Warna angka (default: ink) */
  valueTone?: StatTone;
  active?: boolean;
  onClick?: () => void;
  loading?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "rounded-[14px] border border-line bg-white px-5 py-[18px] text-left",
        onClick && "cursor-pointer transition-colors hover:border-grey-3",
        active && "border-primary ring-1 ring-primary",
      )}
    >
      <div className="mb-3 flex items-center gap-[7px] text-[10.5px] font-bold tracking-[0.08em] text-grey-1 uppercase">
        <span className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} />
        {label}
      </div>
      {loading ? (
        <div className="skeleton h-7 w-20" />
      ) : (
        <div className={cn("num text-[28px] leading-none font-extrabold tracking-[-0.03em] text-ink", valueTone && VALUE[valueTone])}>
          {value}
          {unit && <span className="ml-[3px] text-[13px] font-semibold tracking-normal text-grey-1">{unit}</span>}
        </div>
      )}
      {sub && <div className="mt-2 text-[11.5px] text-grey-1">{sub}</div>}
    </Comp>
  );
}
