import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export const PAGE_SIZES = [25, 50, 100];

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(n);
  return (
    <div className="mt-3 flex items-center justify-between border-t border-line-2 pt-3 text-[12px] text-grey-1">
      <div>
        {fmt(from)}–{fmt(to)} dari {fmt(total)} baris
      </div>
      <div className="flex items-center gap-3">
        <select
          className="select-input !py-1.5 !text-[12px]"
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s} / halaman
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <PageBtn disabled={page === 0} onClick={() => onPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </PageBtn>
          <span className="num px-2 font-semibold text-ink-2">
            {page + 1} / {pages}
          </span>
          <PageBtn disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </PageBtn>
        </div>
      </div>
    </div>
  );
}

function PageBtn({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-line bg-white text-ink-3 hover:border-grey-3 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="!py-12 text-center text-[13px] text-grey-1">
        {children}
      </td>
    </tr>
  );
}

export function SkeletonRows({ cols, rows = 8 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c}>
              <div className={cn("skeleton h-3.5", c === 0 ? "w-40" : "ml-auto w-10")} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkuCell({ label, code }: { label: string; code: string }) {
  return (
    <div>
      <div className="font-semibold text-ink">{label}</div>
      <div className="text-[11.5px] font-medium text-grey-1">{code}</div>
    </div>
  );
}

/** Header kolom yang bisa diklik untuk sort */
export function SortHeader({
  label,
  active,
  desc,
  onClick,
  num,
  sub,
}: {
  label: string;
  active: boolean;
  desc: boolean;
  onClick: () => void;
  num?: boolean;
  sub?: string;
}) {
  return (
    <th className={cn(num && "num", "cursor-pointer select-none hover:text-ink-3")} onClick={onClick}>
      <span className={cn("inline-flex flex-col", num && "items-end")}>
        <span>
          {label}
          <span className={cn("ml-1", !active && "opacity-0")}>{desc ? "↓" : "↑"}</span>
        </span>
        {sub && <span className="text-[9.5px] font-semibold tracking-normal normal-case text-grey-2">{sub}</span>}
      </span>
    </th>
  );
}
