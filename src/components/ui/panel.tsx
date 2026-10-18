import { cn } from "@/lib/cn";

export function Panel({
  title,
  sub,
  actions,
  className,
  children,
}: {
  title?: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("mb-4 min-w-0 rounded-[14px] border border-line bg-white px-4 py-4 sm:px-[22px] sm:py-5", className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
          <div>
            {title && <div className="text-[15px] font-bold tracking-[-0.005em] text-ink">{title}</div>}
            {sub && <div className="mt-[3px] text-[12.5px] text-grey-1">{sub}</div>}
          </div>
          {actions && <div className="flex flex-wrap gap-2 sm:shrink-0 sm:gap-2.5">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2.5">{children}</div>;
}
