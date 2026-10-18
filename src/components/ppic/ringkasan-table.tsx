"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronRight, Download } from "lucide-react";
import { toast } from "sonner";
import { useAppData } from "@/components/providers/app-data";
import { Panel, Toolbar } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { RankBadge, StatusBadge } from "@/components/ui/badge";
import { EmptyRow } from "@/components/ui/table-parts";
import { exportXlsx } from "@/lib/excel/download";
import { fmtInt, fmtMonthShort } from "@/lib/format";
import { STATUS_PRIORITY } from "@/lib/ppic";
import { cn } from "@/lib/cn";
import type { PpicRow } from "@/lib/data/ppic";

interface ProductAgg {
  id: string;
  name: string;
  variants: number;
  h3: number;
  h2: number;
  h1: number;
  current: number;
  forecast: number;
  stock: number;
  habis: number;
  produksi: number;
  overSlowDead: number;
  suggestion: number;
  skus: PpicRow[];
}

const OVER_SLOW_DEAD = new Set(["OVERSTOCK", "SLOW MOVING", "DEADSTOCK"]);

function aggregate(rows: PpicRow[]): ProductAgg[] {
  const map = new Map<string, ProductAgg>();
  for (const r of rows) {
    let p = map.get(r.product_id);
    if (!p) {
      p = {
        id: r.product_id,
        name: r.product_name,
        variants: 0,
        h3: 0,
        h2: 0,
        h1: 0,
        current: 0,
        forecast: 0,
        stock: 0,
        habis: 0,
        produksi: 0,
        overSlowDead: 0,
        suggestion: 0,
        skus: [],
      };
      map.set(r.product_id, p);
    }
    p.variants++;
    p.h3 += r.sales.h3;
    p.h2 += r.sales.h2;
    p.h1 += r.sales.h1;
    p.current += r.sales.current;
    p.forecast += r.forecastMonth ?? 0;
    p.stock += r.stock;
    if (r.status === "HABIS") p.habis++;
    if (r.status === "PRODUKSI") p.produksi++;
    if (OVER_SLOW_DEAD.has(r.status)) p.overSlowDead++;
    p.suggestion += r.suggestion;
    p.skus.push(r);
  }
  const list = [...map.values()];
  for (const p of list) {
    p.skus.sort(
      (a, b) =>
        STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] ||
        (b.forecastMonth ?? 0) - (a.forecastMonth ?? 0) ||
        a.code.localeCompare(b.code),
    );
  }
  return list.sort((a, b) => b.forecast - a.forecast || a.name.localeCompare(b.name, "id"));
}

function MonthHead({ label, month }: { label: string; month: string }) {
  return (
    <th className="num">
      <span className="inline-flex flex-col items-end">
        <span>{label}</span>
        <span className="text-[9.5px] font-semibold tracking-normal normal-case text-grey-2">{fmtMonthShort(month)}</span>
      </span>
    </th>
  );
}

function CountCell({ n, tone }: { n: number; tone: "neg" | "warn" | "purple" }) {
  const color = { neg: "text-neg", warn: "text-warn", purple: "text-purple" }[tone];
  return <td className={cn("num", n > 0 ? cn(color, "font-semibold") : "text-grey-2")}>{fmtInt(n)}</td>;
}

export function RingkasanTable() {
  const { rows, months, today, openSkuDetail } = useAppData();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const products = useMemo(() => aggregate(rows), [rows]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
  }, [products, query]);

  const totals = useMemo(
    () =>
      products.reduce(
        (t, p) => ({ forecast: t.forecast + p.forecast, stock: t.stock + p.stock, suggestion: t.suggestion + p.suggestion }),
        { forecast: 0, stock: 0, suggestion: 0 },
      ),
    [products],
  );

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allExpanded = visible.length > 0 && visible.every((p) => expanded.has(p.id));

  async function exportExcel() {
    setExporting(true);
    const m = (d: string) => fmtMonthShort(d);
    try {
      await exportXlsx("ringkasan", today, {
        name: "Ringkasan Produk",
        rows: visible,
        columns: [
          { header: "Produk", width: 28, value: (p) => p.name },
          { header: "Jml Varian", numFmt: "#,##0", value: (p) => p.variants },
          { header: `H-3 bln (${m(months.h3)})`, numFmt: "#,##0", value: (p) => p.h3 },
          { header: `H-2 bln (${m(months.h2)})`, numFmt: "#,##0", value: (p) => p.h2 },
          { header: `H-1 bln (${m(months.h1)})`, numFmt: "#,##0", value: (p) => p.h1 },
          { header: `Bln berjalan (${m(months.current)})`, numFmt: "#,##0", value: (p) => p.current },
          { header: "Forecast/bln", numFmt: "#,##0", value: (p) => Math.round(p.forecast) },
          { header: "Stock", numFmt: "#,##0", value: (p) => p.stock },
          { header: "Habis", numFmt: "#,##0", value: (p) => p.habis },
          { header: "Produksi", numFmt: "#,##0", value: (p) => p.produksi },
          { header: "Over/Slow/Dead", numFmt: "#,##0", value: (p) => p.overSlowDead },
          { header: "Saran Total", numFmt: "#,##0", value: (p) => p.suggestion },
        ],
      });
    } catch (e) {
      toast.error(`Gagal export: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Panel
      title={`${fmtInt(products.length)} Produk Aktif`}
      sub={`Total ${fmtInt(totals.forecast)} forecast/bulan · ${fmtInt(totals.stock)} pcs stock · ${fmtInt(totals.suggestion)} saran produksi`}
      actions={
        <Button onClick={exportExcel} loading={exporting} disabled={visible.length === 0}>
          <Download className="h-4 w-4" />
          Export Excel
        </Button>
      }
    >
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Cari produk..." />
        <Button
          variant="ghost"
          size="sm"
          disabled={visible.length === 0}
          onClick={() => setExpanded(allExpanded ? new Set() : new Set(visible.map((p) => p.id)))}
        >
          {allExpanded ? "Tutup semua" : "Buka semua varian"}
        </Button>
        <div className="ml-auto text-[12px] text-grey-1">Klik produk untuk melihat SKU-nya</div>
      </Toolbar>

      <table className="data-table">
        <thead>
          <tr>
            <th>Produk</th>
            <th className="num">Jml Varian</th>
            <MonthHead label="H-3 bln" month={months.h3} />
            <MonthHead label="H-2 bln" month={months.h2} />
            <MonthHead label="H-1 bln" month={months.h1} />
            <MonthHead label="Bln berjalan" month={months.current} />
            <th className="num">Forecast/bln</th>
            <th className="num">Stock</th>
            <th className="num">Habis</th>
            <th className="num">Produksi</th>
            <th className="num">Over/Slow/Dead</th>
            <th className="num">Saran Total</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <EmptyRow colSpan={12}>{products.length === 0 ? "Belum ada produk aktif." : "Tidak ada produk yang cocok."}</EmptyRow>
          )}
          {visible.map((p) => {
            const open = expanded.has(p.id);
            return (
              <Fragment key={p.id}>
                <tr className="clickable" onClick={() => toggle(p.id)} aria-expanded={open}>
                  <td>
                    <span className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap text-ink">
                      <ChevronRight
                        className={cn("h-3.5 w-3.5 shrink-0 text-grey-2 transition-transform", open && "rotate-90")}
                      />
                      {p.name}
                    </span>
                  </td>
                  <td className="num">{fmtInt(p.variants)}</td>
                  <td className="num">{fmtInt(p.h3)}</td>
                  <td className="num">{fmtInt(p.h2)}</td>
                  <td className="num">{fmtInt(p.h1)}</td>
                  <td className="num">{fmtInt(p.current)}</td>
                  <td className="num">
                    <strong>{fmtInt(p.forecast)}</strong>
                  </td>
                  <td className="num">{fmtInt(p.stock)}</td>
                  <CountCell n={p.habis} tone="neg" />
                  <CountCell n={p.produksi} tone="warn" />
                  <CountCell n={p.overSlowDead} tone="purple" />
                  <td className="num">
                    <strong className={p.suggestion > 0 ? "text-primary-2" : undefined}>{fmtInt(p.suggestion)}</strong>
                  </td>
                </tr>
                {open &&
                  p.skus.map((s) => (
                    <tr key={s.id} className="clickable bg-bg/60" onClick={() => openSkuDetail(s.id)}>
                      <td className="!pl-10">
                        <div className="flex items-center gap-2">
                          <RankBadge rank={s.rank} overridden={s.rankOverridden} />
                          <div className="min-w-0">
                            <div className="text-[12.5px] font-semibold text-ink-2">
                              {s.color} · {s.size}
                            </div>
                            <div className="text-[11px] font-medium text-grey-1">{s.code}</div>
                          </div>
                        </div>
                      </td>
                      <td />
                      <td className="num text-[12.5px]">{fmtInt(s.sales.h3)}</td>
                      <td className="num text-[12.5px]">{fmtInt(s.sales.h2)}</td>
                      <td className="num text-[12.5px]">{fmtInt(s.sales.h1)}</td>
                      <td className="num text-[12.5px]">{fmtInt(s.sales.current)}</td>
                      <td className="num text-[12.5px]">{fmtInt(s.forecastMonth)}</td>
                      <td
                        className={cn(
                          "num text-[12.5px]",
                          s.stock <= 0 ? "text-neg" : s.minStock !== null && s.stock <= s.minStock ? "text-warn" : undefined,
                        )}
                      >
                        {fmtInt(s.stock)}
                      </td>
                      <td colSpan={3} className="text-right">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="num text-[12.5px]">{s.suggestion > 0 ? fmtInt(s.suggestion) : "—"}</td>
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
