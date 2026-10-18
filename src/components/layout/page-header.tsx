import { fmtDateLong, todayJakarta } from "@/lib/format";

export function PageHeader({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4 lg:mb-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl tracking-[-0.02em] text-ink">{title}</h1>
        {sub && <div className="mt-1.5 text-[13.5px] text-grey-1">{sub}</div>}
      </div>
      <div className="hidden shrink-0 rounded-full border border-line bg-white px-4 md:block py-[9px] text-[12.5px] font-semibold text-ink-2">
        {fmtDateLong(todayJakarta())}
      </div>
    </div>
  );
}
