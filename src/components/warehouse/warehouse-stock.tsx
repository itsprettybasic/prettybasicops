"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Download, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAppData } from "@/components/providers/app-data";
import { Panel, Toolbar } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { FilterChip } from "@/components/ui/filter-chip";
import { EmptyRow, Pagination, SkuCell } from "@/components/ui/table-parts";
import { matchOption } from "@/components/ui/combobox";
import { WarehouseFormModal } from "@/components/warehouse/warehouse-form-modal";
import { exportXlsx } from "@/lib/excel/download";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { SkuInfo } from "@/lib/data/ppic";
import type { Warehouse } from "@/lib/stock/warehouse-types";

type StockFilter = "all" | "has" | "zero" | "minus";

const FILTERS: { key: StockFilter; label: string }[] = [
  { key: "has", label: "Ada stock" },
  { key: "zero", label: "Stock 0" },
  { key: "minus", label: "Minus" },
  { key: "all", label: "Semua" },
];

interface Row {
  sku: SkuInfo;
  /** Stock per gudang yang ditampilkan (urutan = kolom) */
  per: number[];
  total: number;
  any: boolean;
}

function testRow(r: Row, f: StockFilter) {
  if (f === "all") return true;
  if (f === "has") return r.per.some((v) => v > 0);
  if (f === "zero") return r.per.every((v) => v === 0);
  return r.per.some((v) => v < 0);
}

export function WarehouseStock({
  skus,
  stock,
  loadError,
}: {
  skus: SkuInfo[];
  /** warehouse_id → sku_id → stock */
  stock: Record<string, Record<string, number>>;
  loadError: string | null;
}) {
  const { warehouses, today, openSkuDetail } = useAppData();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StockFilter>("has");
  const [product, setProduct] = useState("");
  const [focusWh, setFocusWh] = useState<string>(""); // "" = semua gudang
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [form, setForm] = useState<{ key: number; warehouse: Warehouse | null } | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (loadError) toast.error(`Gagal memuat stock: ${loadError}`);
  }, [loadError]);

  // Kolom: gudang aktif + gudang nonaktif yang masih ada stock-nya
  const columns = useMemo(
    () => warehouses.filter((w) => w.is_active || Object.values(stock[w.id] ?? {}).some((v) => v !== 0)),
    [warehouses, stock],
  );
  const shown = useMemo(() => (focusWh ? columns.filter((w) => w.id === focusWh) : columns), [columns, focusWh]);

  const whTotals = useMemo(() => {
    const m = new Map<string, { pcs: number; skus: number }>();
    for (const w of warehouses) {
      let pcs = 0;
      let n = 0;
      for (const v of Object.values(stock[w.id] ?? {})) {
        pcs += v;
        if (v > 0) n++;
      }
      m.set(w.id, { pcs, skus: n });
    }
    return m;
  }, [warehouses, stock]);

  const rows = useMemo<Row[]>(() => {
    const list = skus
      .map((s) => {
        const per = shown.map((w) => stock[w.id]?.[s.id] ?? 0);
        return { sku: s, per, total: per.reduce((a, b) => a + b, 0), any: per.some((v) => v !== 0) };
      })
      // SKU nonaktif hanya tampil kalau masih ada stock
      .filter((r) => r.sku.is_active || r.any);
    return list.sort((a, b) => a.sku.label.localeCompare(b.sku.label, "id"));
  }, [skus, shown, stock]);

  const products = useMemo(
    () => [...new Set(rows.map((r) => r.sku.product_name))].sort((a, b) => a.localeCompare(b, "id")),
    [rows],
  );

  const searched = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!product || r.sku.product_name === product) &&
          matchOption({ value: r.sku.id, label: r.sku.label, sublabel: r.sku.code }, query),
      ),
    [rows, product, query],
  );

  const counts = useMemo(() => {
    const c = { all: 0, has: 0, zero: 0, minus: 0 } as Record<StockFilter, number>;
    for (const r of searched) for (const f of FILTERS) if (testRow(r, f.key)) c[f.key]++;
    return c;
  }, [searched]);

  const visible = useMemo(() => searched.filter((r) => testRow(r, filter)), [searched, filter]);
  const pageRows = visible.slice(page * pageSize, (page + 1) * pageSize);
  const resetPage = () => setPage(0);

  async function exportExcel() {
    setExporting(true);
    try {
      await exportXlsx("stock-per-gudang", today, {
        name: "Stock per Gudang",
        rows: visible,
        columns: [
          { header: "Kode SKU", width: 26, value: (r) => r.sku.code },
          { header: "Produk", width: 26, value: (r) => r.sku.product_name },
          { header: "Warna", width: 16, value: (r) => r.sku.color },
          { header: "Size", width: 10, value: (r) => r.sku.size },
          ...shown.map((w, i) => ({ header: w.name, width: Math.max(12, w.name.length + 2), numFmt: "#,##0", value: (r: Row) => r.per[i] })),
          ...(shown.length > 1 ? [{ header: "Total", numFmt: "#,##0", value: (r: Row) => r.total }] : []),
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
      <Panel
        title="Daftar Gudang"
        sub="Klik gudang untuk lihat stock-nya saja · Hanya gudang bertanda PPIC yang dihitung di Rekomendasi Produksi"
        actions={
          <>
            <Link href="/transfer">
              <Button>
                <ArrowLeftRight className="h-4 w-4" />
                Transfer Stock
              </Button>
            </Link>
            <Button variant="primary" onClick={() => setForm({ key: Date.now(), warehouse: null })}>
              <Plus className="h-4 w-4" />
              Tambah Gudang
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {warehouses.map((w) => {
            const t = whTotals.get(w.id) ?? { pcs: 0, skus: 0 };
            const selected = focusWh === w.id;
            return (
              <div
                key={w.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setFocusWh(selected ? "" : w.id);
                  resetPage();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setFocusWh(selected ? "" : w.id);
                    resetPage();
                  }
                }}
                className={cn(
                  "cursor-pointer rounded-[12px] border px-4 py-3 transition-colors",
                  selected ? "border-primary-2 bg-primary-tint" : "border-line hover:border-grey-3",
                  !w.is_active && "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-bold text-ink">{w.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {w.is_default && <Badge tone="info">Utama</Badge>}
                      {w.counts_in_ppic && <Badge tone="pos">PPIC</Badge>}
                      {!w.is_active && <Badge tone="grey">Nonaktif</Badge>}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Edit ${w.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setForm({ key: Date.now(), warehouse: w });
                    }}
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-grey-1 hover:bg-line-2 hover:text-ink"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className={cn("text-[22px] font-bold tracking-[-0.02em]", t.pcs < 0 ? "text-neg" : "text-ink")}>
                    {fmtInt(t.pcs)}
                  </span>
                  <span className="text-[12px] text-grey-1">pcs · {fmtInt(t.skus)} SKU ada stock</span>
                </div>
                {w.address && <div className="mt-1 truncate text-[11.5px] text-grey-1">{w.address}</div>}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel
        title={focusWh ? `Stock ${shown[0]?.name ?? ""}` : "Stock Semua Gudang"}
        sub="Klik SKU untuk lihat detail & riwayat mutasinya"
        actions={
          <Button onClick={exportExcel} loading={exporting} disabled={visible.length === 0}>
            <Download className="h-4 w-4" />
            Export
          </Button>
        }
      >
        <Toolbar>
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              resetPage();
            }}
            placeholder="Cari SKU, produk, warna..."
          />
          {FILTERS.map((f) => (
            <FilterChip
              key={f.key}
              active={filter === f.key}
              count={counts[f.key]}
              onClick={() => {
                setFilter(f.key);
                resetPage();
              }}
            >
              {f.label}
            </FilterChip>
          ))}
          <div className="ml-auto flex flex-wrap gap-2">
            <select
              className="select-input"
              value={focusWh}
              onChange={(e) => {
                setFocusWh(e.target.value);
                resetPage();
              }}
            >
              <option value="">Semua gudang</option>
              {columns.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <select
              className="select-input"
              value={product}
              onChange={(e) => {
                setProduct(e.target.value);
                resetPage();
              }}
            >
              <option value="">Semua produk</option>
              {products.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </Toolbar>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                {shown.map((w) => (
                  <th key={w.id} className="num whitespace-nowrap">
                    {w.name}
                  </th>
                ))}
                {shown.length > 1 && <th className="num">Total</th>}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <EmptyRow colSpan={shown.length + 2}>Tidak ada SKU yang cocok dengan filter.</EmptyRow>
              )}
              {pageRows.map((r) => (
                <tr key={r.sku.id} className="clickable" onClick={() => r.sku.is_active && openSkuDetail(r.sku.id)}>
                  <td>
                    <SkuCell label={r.sku.label} code={r.sku.code} />
                    {!r.sku.is_active && <div className="text-[11px] text-grey-1">SKU nonaktif</div>}
                  </td>
                  {r.per.map((v, i) => (
                    <td key={shown[i].id} className={cn("num", v < 0 ? "font-semibold text-neg" : v === 0 ? "text-grey-2" : "text-ink-2")}>
                      {fmtInt(v)}
                    </td>
                  ))}
                  {shown.length > 1 && (
                    <td className={cn("num font-semibold", r.total < 0 ? "text-neg" : "text-ink")}>{fmtInt(r.total)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visible.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={visible.length}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(0);
            }}
          />
        )}
      </Panel>

      {form && (
        <WarehouseFormModal key={form.key} open onOpenChange={(o) => !o && setForm(null)} warehouse={form.warehouse} />
      )}
    </>
  );
}
