"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useAppData } from "@/components/providers/app-data";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Panel, Toolbar } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { FilterChip } from "@/components/ui/filter-chip";
import { RankBadge, StatusBadge } from "@/components/ui/badge";
import { CapacityBar } from "@/components/ui/capacity-bar";
import { EmptyRow, Pagination, SkuCell, SortHeader } from "@/components/ui/table-parts";
import { matchOption } from "@/components/ui/combobox";
import { exportXlsx } from "@/lib/excel/download";
import { fmtInt, fmtRupiahShort, fmtSigned } from "@/lib/format";
import { STATUS_PRIORITY } from "@/lib/ppic";
import type { PpicRow } from "@/lib/data/ppic";

export interface MovementSummary {
  qtyIn: number;
  qtyOut: number;
  docsIn: number;
  docsOut: number;
  salesOut: number;
}

type StockFilter = "all" | "zero" | "low" | "high";
type SortKey = "name" | "rank" | "stock" | "min" | "max" | "pct" | "status";

const RANK_ORDER = { A: 0, B: 1, C: 2 } as const;

const FILTERS: { key: StockFilter; label: string; test: (stock: number) => boolean }[] = [
  { key: "all", label: "Semua", test: () => true },
  { key: "zero", label: "Stok = 0", test: (s) => s <= 0 },
  { key: "low", label: "Stok 1–10", test: (s) => s >= 1 && s <= 10 },
  { key: "high", label: "Stok > 10", test: (s) => s > 10 },
];

function capacityPct(row: PpicRow): number | null {
  if (row.maxStock === null || row.maxStock <= 0) return null;
  return (Math.max(0, row.stock) / row.maxStock) * 100;
}

/** Nilai kosong (—) selalu di bawah, apa pun arah urutannya. */
function sortValue(row: PpicRow, key: SortKey): number | null {
  switch (key) {
    case "rank":
      return RANK_ORDER[row.rank];
    case "stock":
      return row.stock;
    case "min":
      return row.minStock;
    case "max":
      return row.maxStock;
    case "pct":
      return capacityPct(row);
    case "status":
      return STATUS_PRIORITY[row.status];
    default:
      return null;
  }
}

function capacityTone(row: PpicRow, pct: number) {
  if (pct > 100) return "yellow" as const;
  if (row.stock <= 0) return "neg" as const;
  if (row.minStock !== null && row.stock <= row.minStock) return "warn" as const;
  return "pos" as const;
}

export function StockLiveTable({
  summary,
  loadError,
}: {
  summary: MovementSummary;
  loadError: string | null;
}) {
  const { rows, today, openStockModal, openSkuDetail } = useAppData();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "name", desc: false });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (loadError) toast.error(`Gagal memuat mutasi 7 hari: ${loadError}`);
  }, [loadError]);

  const stats = useMemo(() => {
    const products = new Set(rows.map((r) => r.product_id));
    let totalStock = 0;
    let value = 0;
    let hasCost = false;
    for (const r of rows) {
      const s = Math.max(0, r.stock);
      totalStock += s;
      if (r.unit_cost !== null) {
        hasCost = true;
        value += s * r.unit_cost;
      }
    }
    return { products: products.size, totalStock, value, hasCost };
  }, [rows]);

  const searched = useMemo(
    () =>
      query.trim()
        ? rows.filter((r) =>
            matchOption({ value: r.id, label: r.label, sublabel: r.code, keywords: `${r.product_name} ${r.color} ${r.size}` }, query),
          )
        : rows,
    [rows, query],
  );

  const counts = useMemo(() => {
    const c: Record<StockFilter, number> = { all: 0, zero: 0, low: 0, high: 0 };
    for (const r of searched) for (const f of FILTERS) if (f.test(r.stock)) c[f.key]++;
    return c;
  }, [searched]);

  const visible = useMemo(() => {
    const test = FILTERS.find((f) => f.key === filter)!.test;
    const list = searched.filter((r) => test(r.stock));
    const byName = (a: PpicRow, b: PpicRow) => a.label.localeCompare(b.label, "id");
    const dir = sort.desc ? -1 : 1;
    list.sort((a, b) => {
      if (sort.key === "name") return dir * byName(a, b);
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (va === null || vb === null) return va === vb ? byName(a, b) : va === null ? 1 : -1;
      return dir * (va - vb) || byName(a, b);
    });
    return list;
  }, [searched, filter, sort]);

  const pageRows = visible.slice(page * pageSize, (page + 1) * pageSize);
  const net = summary.qtyIn - summary.qtyOut;

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: false }));
    setPage(0);
  }

  function sortHeader(key: SortKey, label: string, num = false) {
    return (
      <SortHeader label={label} num={num} active={sort.key === key} desc={sort.desc} onClick={() => toggleSort(key)} />
    );
  }

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(0);
    };
  }

  async function exportExcel() {
    setExporting(true);
    try {
      await exportXlsx("stock-live", today, {
        name: "Stock Live",
        rows: visible,
        columns: [
          { header: "Produk", width: 26, value: (r) => r.product_name },
          { header: "Warna", width: 16, value: (r) => r.color },
          { header: "Size", width: 10, value: (r) => r.size },
          { header: "Kode SKU", width: 26, value: (r) => r.code },
          { header: "Ranking", value: (r) => r.rank },
          { header: "Stock", numFmt: "#,##0", value: (r) => r.stock },
          { header: "Min", numFmt: "#,##0", value: (r) => r.minStock },
          { header: "Max", numFmt: "#,##0", value: (r) => r.maxStock },
          {
            header: "% Kapasitas",
            numFmt: "0",
            value: (r) => {
              const pct = capacityPct(r);
              return pct === null ? null : Math.round(pct);
            },
          },
          { header: "Status", width: 14, value: (r) => r.status },
        ],
      });
    } catch (e) {
      toast.error(`Gagal export: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <StatGrid cols={5}>
        <StatCard label="Total SKU" tone="primary" value={fmtInt(rows.length)} sub={`Dari ${fmtInt(stats.products)} produk`} />
        <StatCard
          label="Total Stock"
          tone="grey"
          value={fmtInt(stats.totalStock)}
          unit="pcs"
          sub={stats.hasCost ? `Nilai ${fmtRupiahShort(stats.value)}` : "Harga pokok belum diisi"}
        />
        <StatCard
          label="Masuk 7 Hari"
          tone="pos"
          valueTone="pos"
          value={fmtSigned(summary.qtyIn)}
          unit="pcs"
          sub={`${fmtInt(summary.docsIn)} catatan masuk`}
        />
        <StatCard
          label="Keluar 7 Hari"
          tone="neg"
          valueTone="neg"
          value={summary.qtyOut > 0 ? fmtSigned(-summary.qtyOut) : "0"}
          unit="pcs"
          sub={`Sales ${fmtInt(summary.salesOut)} · lainnya ${fmtInt(summary.qtyOut - summary.salesOut)}`}
        />
        <StatCard
          label="Net Movement"
          tone="warn"
          valueTone={net < 0 ? "warn" : net > 0 ? "pos" : undefined}
          value={fmtSigned(net)}
          unit="pcs"
          sub={net < 0 ? "Stock turun minggu ini" : net > 0 ? "Stock naik minggu ini" : "Tidak ada perubahan"}
        />
      </StatGrid>

      <Panel
        title="Stock per SKU"
        sub="Klik baris untuk detail & kartu mutasi"
        actions={
          <>
            <Button onClick={exportExcel} loading={exporting} disabled={visible.length === 0}>
              <Download className="h-4 w-4" />
              Export Excel
            </Button>
            <Button variant="pos" onClick={() => openStockModal({ direction: "in" })}>
              + Barang Masuk
            </Button>
            <Button variant="neg" onClick={() => openStockModal({ direction: "out" })}>
              − Barang Keluar
            </Button>
          </>
        }
      >
        <Toolbar>
          <SearchInput value={query} onChange={resetPage(setQuery)} placeholder="Cari SKU, produk, warna..." />
          {FILTERS.map((f) => (
            <FilterChip key={f.key} active={filter === f.key} count={counts[f.key]} onClick={() => resetPage(setFilter)(f.key)}>
              {f.label}
            </FilterChip>
          ))}
        </Toolbar>

        <table className="data-table">
          <thead>
            <tr>
              {sortHeader("name", "Produk / SKU")}
              {sortHeader("rank", "Ranking")}
              {sortHeader("stock", "Stock", true)}
              {sortHeader("min", "Min", true)}
              {sortHeader("max", "Max", true)}
              {sortHeader("pct", "% Kapasitas", true)}
              {sortHeader("status", "Status")}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <EmptyRow colSpan={7}>
                {rows.length === 0 ? (
                  <>
                    Belum ada SKU.{" "}
                    <Link href="/master-sku" className="font-semibold text-primary-2">
                      Tambah di Master SKU →
                    </Link>
                  </>
                ) : (
                  "Tidak ada SKU yang cocok dengan filter."
                )}
              </EmptyRow>
            )}
            {pageRows.map((r) => {
              const pct = capacityPct(r);
              const stockTone =
                r.stock <= 0 ? "text-neg" : r.minStock !== null && r.stock <= r.minStock ? "text-warn" : undefined;
              return (
                <tr key={r.id} className="clickable" onClick={() => openSkuDetail(r.id)}>
                  <td>
                    <SkuCell label={r.label} code={r.code} />
                  </td>
                  <td>
                    <RankBadge rank={r.rank} overridden={r.rankOverridden} />
                  </td>
                  <td className="num">
                    <strong className={stockTone}>{fmtInt(r.stock)}</strong>
                  </td>
                  <td className="num">{fmtInt(r.minStock)}</td>
                  <td className="num">{fmtInt(r.maxStock)}</td>
                  <td className="num">
                    <CapacityBar pct={pct} tone={pct === null ? undefined : capacityTone(r, pct)} />
                  </td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={visible.length}
            onPage={setPage}
            onPageSize={(s) => {
              setPageSize(s);
              setPage(0);
            }}
          />
        )}
      </Panel>
    </>
  );
}
