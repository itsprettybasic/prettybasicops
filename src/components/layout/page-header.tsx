import { fmtDateLong, todayJakarta } from "@/lib/format";

export function PageHeader({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink">{title}</h1>
        {sub && <div className="mt-1.5 text-[13.5px] text-grey-1">{sub}</div>}
      </div>
      <div className="rounded-full border border-line bg-white px-4 py-[9px] text-[12.5px] font-semibold text-ink-2">
        {fmtDateLong(todayJakarta())}
      </div>
    </div>
  );
}
