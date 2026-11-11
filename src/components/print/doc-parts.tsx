/* eslint-disable @next/next/no-img-element */
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Kertas A4 — di layar tampil seperti lembar kertas, saat dicetak memenuhi halaman. */
export function Paper({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`@page { size: A4; margin: 12mm; } @media print { html, body { background: #fff !important; } }`}</style>
      <div className="mx-auto mb-10 w-full max-w-[210mm] bg-white px-6 py-8 text-[12px] leading-snug text-[#0f172a] shadow-[0_2px_16px_rgba(15,23,42,0.08)] sm:px-[14mm] sm:py-[12mm] print:mb-0 print:max-w-none print:p-0 print:shadow-none">
        {children}
      </div>
    </>
  );
}

/** Kop dokumen: logo Pretty Basic + judul + nomor dokumen. */
export function DocHeader({ title, number, status }: { title: string; number: string; status?: string }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-6 border-b-2 border-[#7F0010] pb-4">
      <div>
        <img src="/logo.png" alt="Pretty Basic" className="h-[52px] w-auto" />
        <div className="mt-1.5 text-[11px] text-[#64748b]">Pretty Basic</div>
      </div>
      <div className="text-right">
        <div className="text-[20px] font-extrabold tracking-[0.04em] text-[#7F0010]">{title}</div>
        <div className="mt-1 text-[13px] font-bold">{number}</div>
        {status && <div className="mt-1 text-[11px] font-semibold tracking-[0.06em] text-[#64748b] uppercase">{status}</div>}
      </div>
    </div>
  );
}

export function InfoGrid({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <table className="w-full">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td className="w-[38%] py-[3px] pr-2 align-top text-[#64748b]">{k}</td>
            <td className="py-[3px] align-top font-semibold">{v ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PartyBox({
  label,
  name,
  lines,
}: {
  label: string;
  name: string;
  lines: (string | null | undefined)[];
}) {
  return (
    <div className="rounded-md border border-[#e2e8f0] px-3.5 py-3">
      <div className="mb-1 text-[10px] font-bold tracking-[0.08em] text-[#64748b] uppercase">{label}</div>
      <div className="text-[13px] font-bold">{name}</div>
      {lines.filter(Boolean).map((l, i) => (
        <div key={i} className="whitespace-pre-line text-[#334155]">
          {l}
        </div>
      ))}
    </div>
  );
}

export function DocTable({
  head,
  rows,
  foot,
  align,
}: {
  head: string[];
  rows: React.ReactNode[][];
  foot?: React.ReactNode[];
  /** "r" = rata kanan per kolom */
  align: ("l" | "r")[];
}) {
  return (
    <table className="mt-5 w-full border-collapse">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th
              key={h}
              className={cn(
                "border border-[#cbd5e1] bg-[#f1f5f9] px-2 py-1.5 text-[10.5px] font-bold tracking-[0.04em] uppercase",
                align[i] === "r" ? "text-right" : "text-left",
              )}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className="break-inside-avoid">
            {r.map((c, i) => (
              <td
                key={i}
                className={cn("border border-[#cbd5e1] px-2 py-1.5 align-top", align[i] === "r" && "text-right tabular-nums")}
              >
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {foot && (
        <tfoot>
          <tr>
            {foot.map((c, i) => (
              <td
                key={i}
                className={cn(
                  "border border-[#cbd5e1] bg-[#f8fafc] px-2 py-1.5 font-bold",
                  align[i] === "r" && "text-right tabular-nums",
                )}
              >
                {c}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

export function NoteBox({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <div className="mt-4 rounded-md border border-[#e2e8f0] px-3.5 py-2.5">
      <div className="mb-0.5 text-[10px] font-bold tracking-[0.08em] text-[#64748b] uppercase">{label}</div>
      <div className="whitespace-pre-line">{text}</div>
    </div>
  );
}

/** Kolom tanda tangan. */
export function Signatures({ items, date }: { items: { label: string; name?: string | null }[]; date?: string }) {
  return (
    <div className="mt-10 break-inside-avoid">
      {date && <div className="mb-2 text-right text-[#334155]">{fmtDate(date)}</div>}
      <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-[#334155]">{s.label}</div>
            <div className="mx-auto mt-[62px] w-[85%] border-t border-[#0f172a] pt-1 font-semibold">{s.name || " "}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PrintedAt({ by }: { by?: string | null }) {
  return (
    <div className="mt-8 border-t border-[#e2e8f0] pt-2 text-[10px] text-[#94a3b8]">
      Dokumen dibuat dari sistem Pretty Basic{by ? ` · ${by}` : ""}
    </div>
  );
}

export function DocError({ message }: { message: string }) {
  return (
    <div className="mx-auto mt-16 max-w-[420px] rounded-xl border border-line bg-white p-6 text-center text-[13px] text-ink-2">
      {message}
    </div>
  );
}
