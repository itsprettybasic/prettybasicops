import { cn } from "@/lib/cn";

export function InfoBanner({
  head,
  variant = "primary",
  className,
  children,
}: {
  head?: string;
  variant?: "primary" | "green" | "warn";
  className?: string;
  children: React.ReactNode;
}) {
  const styles = {
    primary: { box: "bg-primary-tint border-primary-soft", head: "text-primary", strong: "[&_strong]:text-primary" },
    green: { box: "bg-pos-tint border-[#BBF7D0]", head: "text-pos-text", strong: "[&_strong]:text-ink" },
    warn: { box: "bg-warn-tint border-[#FED7AA]", head: "text-warn-text", strong: "[&_strong]:text-warn-text" },
  }[variant];
  return (
    <div className={cn("mb-4 rounded-[10px] border px-4 py-3 text-[12.5px] leading-[1.65] text-ink-2", styles.box, styles.strong, className)}>
      {head && <div className={cn("mb-1 text-[11px] font-bold tracking-[0.04em] uppercase", styles.head)}>{head}</div>}
      {children}
    </div>
  );
}
