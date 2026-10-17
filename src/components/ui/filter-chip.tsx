import { cn } from "@/lib/cn";

export function FilterChip({
  active,
  count,
  onClick,
  children,
}: {
  active?: boolean;
  count?: number;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-medium",
        active ? "border-primary bg-primary text-white" : "border-line bg-white text-ink-3 hover:border-grey-3",
      )}
    >
      {children}
      {count !== undefined && (
        <span
          className={cn(
            "num rounded-full px-[7px] py-px text-[11px] font-semibold",
            active ? "bg-white/20" : "bg-line-2 text-grey-1",
          )}
        >
          {new Intl.NumberFormat("id-ID").format(count)}
        </span>
      )}
    </button>
  );
}
