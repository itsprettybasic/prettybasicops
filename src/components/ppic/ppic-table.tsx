"use client";

import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type FilterFn,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { Download } from "lucide-react";
import { toast } from "sonner";
import type { PpicRow } from "@/lib/data/ppic";
import { STATUS_PRIORITY, type PpicStatus, type RankClass } from "@/lib/ppic";
import { exportXlsx } from "@/lib/excel/download";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useAppData } from "@/components/providers/app-data";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Panel, Toolbar } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { SearchInput } from "@/components/ui/search-input";
import { RankBadge, StatusBadge } from "@/components/ui/badge";
import { EmptyRow, Pagination, SkuCell, SortHeader } from "@/components/ui/table-parts";
import { BatchModal } from "./batch-modal";

type StatusFilter = "all" | "HABIS" | "PRODUKSI" | "AMAN" | "OVERSTOCK" | "DEADSTOCK" | "BARU";

const STATUS_CHIPS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "HABIS", label: "Habis" },
  { key: "PRODUKSI", label: "Produksi" },
  { key: "AMAN", label: "Aman" },
  { key: "OVERSTOCK", label: "Overstock" },
  { key: "DEADSTOCK", label: "Deadstock" },
  { key: "BARU", label: "Baru" },
];

const RANK_ORDER: Record<RankClass, number> = { A: 0, B: 1, C: 2 };

function matchStatus(status: PpicStatus, filter: StatusFilter) {
  if (filter === "all") return true;
  return status === filter;
}

/** Sort default: prioritas status → Ranking A→C → Saran terbesar. */
function defaultCompare(a: PpicRow, b: PpicRow) {
  return (
    STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] ||
    RANK_ORDER[a.rank] - RANK_ORDER[b.rank] ||
    b.suggestion - a.suggestion ||
    a.code.localeCompare(b.code)
  );
}

const statusFilterFn: FilterFn<PpicRow> = (row, _id, value: StatusFilter) => matchStatus(row.original.status, value);
const equalsFilterFn: FilterFn<PpicRow> = (row, id, value: string) => row.getValue(id) === value;
const searchFilterFn: FilterFn<PpicRow> = (row, _id, value: string) => {
  const words = value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const r = row.original;
  const hay = `${r.code} ${r.product_name} ${r.color} ${r.size}`.toLowerCase();
  return words.every((w) => hay.includes(w));
};

const col = createColumnHelper<PpicRow>();

function Dash() {
  return <span className="text-grey-2">—</span>;
}

export function PpicTable({ rows, today }: { rows: PpicRow[]; today: string }) {
  const { openSkuDetail, params } = useAppData();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [rank, setRank] = useState<"" | RankClass>("");
  const [product, setProduct] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchSkuIds, setBatchSkuIds] = useState<string[]>([]);

  const data = useMemo(() => [...rows].sort(defaultCompare), [rows]);
  const products = useMemo(() => [...new Set(rows.map((r) => r.product_name))].sort((a, b) => a.localeCompare(b)), [rows]);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: rows.length, HABIS: 0, PRODUKSI: 0, AMAN: 0, OVERSTOCK: 0, DEADSTOCK: 0, BARU: 0 };
    let saran = 0;
    let saranSku = 0;
    for (const r of rows) {
      for (const chip of STATUS_CHIPS) if (chip.key !== "all" && matchStatus(r.status, chip.key)) c[chip.key]++;
      if (r.suggestion > 0) {
        saran += r.suggestion;
        saranSku++;
      }
    }
    return { ...c, saran, saranSku };
  }, [rows]);

  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const f: ColumnFiltersState = [];
    if (search.trim()) f.push({ id: "sku", value: search });
    if (status !== "all") f.push({ id: "status", value: status });
    if (rank) f.push({ id: "rank", value: rank });
    if (product) f.push({ id: "product", value: product });
    return f;
  }, [search, status, rank, product]);

  const columns = useMemo(
    () => [
      col.display({
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label="Centang semua"
            className="h-3.5 w-3.5 cursor-pointer accent-primary"
            checked={table.getIsAllRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = table.getIsSomeRowsSelected();
            }}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`Centang ${row.original.code}`}
            className="h-3.5 w-3.5 cursor-pointer accent-primary"
            checked={row.getIsSelected()}
            onClick={(e) => e.stopPropagation()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
      }),
      col.accessor("label", {
        id: "sku",
        header: "Produk / SKU",
        filterFn: searchFilterFn,
        cell: ({ row }) => <SkuCell label={row.original.label} code={row.original.code} />,
      }),
      col.accessor("product_name", { id: "product", filterFn: equalsFilterFn }),
      col.accessor("rank", {
        id: "rank",
        header: "Ranking",
        filterFn: equalsFilterFn,
        sortingFn: (a, b) => RANK_ORDER[a.original.rank] - RANK_ORDER[b.original.rank],
        cell: ({ row }) => <RankBadge rank={row.original.rank} overridden={row.original.rankOverridden} />,
      }),
      col.accessor((r) => r.forecastMonth ?? undefined, {
        id: "forecast",
        header: "Forecast/bln",
        sortUndefined: "last",
        meta: { num: true },
        cell: ({ getValue }) => (getValue() === undefined ? <Dash /> : fmtInt(getValue())),
      }),
      col.accessor((r) => r.minStock ?? undefined, {
        id: "min",
        header: "Min",
        sortUndefined: "last",
        meta: { num: true },
        cell: ({ getValue }) => (getValue() === undefined ? <Dash /> : fmtInt(getValue())),
      }),
      col.accessor((r) => r.maxStock ?? undefined, {
        id: "max",
        header: "Max",
        sortUndefined: "last",
        meta: { num: true },
        cell: ({ getValue }) => (getValue() === undefined ? <Dash /> : fmtInt(getValue())),
      }),
      col.accessor("stock", {
        id: "stock",
        header: "Stok",
        meta: { num: true },
        cell: ({ row }) => {
          const r = row.original;
          const tone = r.stock <= 0 ? "text-neg" : r.minStock !== null && r.stock <= r.minStock ? "text-warn" : undefined;
          return <strong className={tone}>{fmtInt(r.stock)}</strong>;
        },
      }),
      col.accessor("inProduction", {
        id: "inProduction",
        header: "Produksi",
        meta: { num: true },
        cell: ({ getValue }) =>
          getValue() > 0 ? <span className="text-primary-2">{fmtInt(getValue())}</span> : <span className="text-grey-2">0</span>,
      }),
      col.accessor((r) => r.daysCover ?? undefined, {
        id: "daysCover",
        header: "Hari Cover",
        sortUndefined: "last",
        meta: { num: true },
        cell: ({ getValue }) => (getValue() === undefined ? <Dash /> : fmtInt(getValue())),
      }),
      col.accessor("status", {
        id: "status",
        header: "Status",
        filterFn: statusFilterFn,
        sortingFn: (a, b) => STATUS_PRIORITY[a.original.status] - STATUS_PRIORITY[b.original.status],
        cell: ({ getValue }) => <StatusBadge status={getValue()} />,
      }),
      col.accessor("suggestion", {
        id: "suggestion",
        header: "Saran",
        sortDescFirst: true,
        meta: { num: true },
        cell: ({ getValue }) =>
          getValue() > 0 ? <strong className="text-ink">{fmtInt(getValue())}</strong> : <span className="text-grey-2">0</span>,
      }),
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, rowSelection, pagination, columnVisibility: { product: false } },
    getRowId: (r) => r.id,
    enableRowSelection: true,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  // Hanya SKU yang masih ada di data terbaru yang dihitung
  const selectedIds = useMemo(() => {
    const ids = new Set(rows.map((r) => r.id));
    return Object.keys(rowSelection).filter((id) => rowSelection[id] && ids.has(id));
  }, [rowSelection, rows]);

  const visibleRows = table.getPrePaginationRowModel().rows;
  const pageRows = table.getRowModel().rows;
  const visibleColumnCount = table.getVisibleLeafColumns().length;

  function resetPage() {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  function setStatusFilter(next: StatusFilter) {
    setStatus((cur) => (cur === next && next !== "all" ? "all" : next));
    resetPage();
  }

  function checkPriority() {
    const priority = rows.filter((r) => r.status === "HABIS" || r.status === "PRODUKSI");
    if (priority.length === 0) {
      toast("Tidak ada SKU berstatus HABIS atau PRODUKSI");
      return;
    }
    setRowSelection((sel) => {
      const next = { ...sel };
      for (const r of priority) next[r.id] = true;
      return next;
    });
    toast.success(`${fmtInt(priority.length)} SKU HABIS & PRODUKSI dicentang`);
  }

  function openBatch() {
    if (selectedIds.length === 0) {
      toast.error("Pilih minimal 1 SKU dulu");
      return;
    }
    // Urutkan sesuai prioritas default supaya isi modal rapi
    const order = new Map(data.map((r, i) => [r.id, i]));
    setBatchSkuIds([...selectedIds].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)));
    setBatchOpen(true);
  }

  async function exportExcel() {
    try {
      await exportXlsx("ppic", today, {
        name: "PPIC",
        rows: visibleRows.map((r) => r.original),
        columns: [
          { header: "Produk", width: 28, value: (r) => r.product_name },
          { header: "Warna", width: 16, value: (r) => r.color },
          { header: "Size", width: 10, value: (r) => r.size },
          { header: "Kode SKU", width: 26, value: (r) => r.code },
          { header: "Ranking", width: 10, value: (r) => r.rank },
          { header: "Forecast/bln", numFmt: "#,##0", value: (r) => (r.forecastMonth === null ? null : Math.round(r.forecastMonth)) },
          { header: "Min", numFmt: "#,##0", value: (r) => r.minStock },
          { header: "Max", numFmt: "#,##0", value: (r) => r.maxStock },
          { header: "Stok", numFmt: "#,##0", value: (r) => r.stock },
          { header: "Produksi", numFmt: "#,##0", value: (r) => r.inProduction },
          { header: "Hari Cover", numFmt: "#,##0", value: (r) => r.daysCover },
          { header: "Status", width: 14, value: (r) => r.status },
          { header: "Saran", numFmt: "#,##0", value: (r) => r.suggestion },
        ],
      });
      toast.success(`Export ${fmtInt(visibleRows.length)} SKU berhasil`);
    } catch (e) {
      toast.error(`Gagal export: ${e instanceof Error ? e.message : "terjadi kesalahan"}`);
    }
  }

  const hasFilter = search.trim() !== "" || status !== "all" || rank !== "" || product !== "";

  return (
    <>
      <StatGrid cols={6}>
        <StatCard
          label="Habis"
          tone="neg"
          valueTone="neg"
          value={fmtInt(counts.HABIS)}
          sub="Stock = 0, masih laku"
          active={status === "HABIS"}
          onClick={() => setStatusFilter("HABIS")}
        />
        <StatCard
          label="Produksi"
          tone="warn"
          valueTone="warn"
          value={fmtInt(counts.PRODUKSI)}
          sub="Di bawah Min Stock"
          active={status === "PRODUKSI"}
          onClick={() => setStatusFilter("PRODUKSI")}
        />
        <StatCard
          label="Aman"
          tone="pos"
          valueTone="pos"
          value={fmtInt(counts.AMAN)}
          sub="Di atas Min Stock"
          active={status === "AMAN"}
          onClick={() => setStatusFilter("AMAN")}
        />
        <StatCard
          label="Overstock"
          tone="yellow"
          valueTone="yellow"
          value={fmtInt(counts.OVERSTOCK)}
          sub="Stock kebanyakan / kurang laku"
          active={status === "OVERSTOCK"}
          onClick={() => setStatusFilter("OVERSTOCK")}
        />
        <StatCard
          label="Deadstock"
          tone="purple"
          valueTone="purple"
          value={fmtInt(counts.DEADSTOCK)}
          sub={`Tidak laku ${params.deadstock_days} hari`}
          active={status === "DEADSTOCK"}
          onClick={() => setStatusFilter("DEADSTOCK")}
        />
        <StatCard
          label="Saran Produksi"
          tone="primary"
          value={fmtInt(counts.saran)}
          unit="pcs"
          sub={`Dari ${fmtInt(counts.saranSku)} SKU prioritas`}
        />
      </StatGrid>

      <Panel
        title="Daftar SKU — Status PPIC"
        sub={
          <>
            Ranking dari penjualan 3 bulan: <strong className="text-ink-3">A</strong> = 70% teratas ·{" "}
            <strong className="text-ink-3">B</strong> = 20% berikutnya · <strong className="text-ink-3">C</strong> = sisanya
          </>
        }
        actions={
          <>
            <Button onClick={exportExcel} disabled={visibleRows.length === 0}>
              <Download className="h-3.5 w-3.5" /> Export Excel
            </Button>
            <Button variant="blue" onClick={openBatch}>
              Buat Batch Produksi ({fmtInt(selectedIds.length)})
            </Button>
          </>
        }
      >
        <Toolbar>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              resetPage();
            }}
            placeholder="Cari SKU, produk, warna..."
          />
          {STATUS_CHIPS.map((chip) => (
            <FilterChip
              key={chip.key}
              active={status === chip.key}
              count={counts[chip.key]}
              onClick={() => {
                setStatus(chip.key);
                resetPage();
              }}
            >
              {chip.label}
            </FilterChip>
          ))}
          <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
            <select
              className="select-input"
              value={rank}
              onChange={(e) => {
                setRank(e.target.value as "" | RankClass);
                resetPage();
              }}
            >
              <option value="">Semua Ranking</option>
              <option value="A">Ranking A</option>
              <option value="B">Ranking B</option>
              <option value="C">Ranking C</option>
            </select>
            <select
              className="select-input max-w-[200px]"
              value={product}
              onChange={(e) => {
                setProduct(e.target.value);
                resetPage();
              }}
            >
              <option value="">Semua Produk</option>
              {products.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </Toolbar>

        <div className="mb-3 flex items-center gap-3 text-[12px] text-grey-1">
          <Button size="sm" onClick={checkPriority}>
            Centang semua HABIS & PRODUKSI
          </Button>
          {selectedIds.length > 0 && (
            <>
              <span>
                <span className="num font-semibold text-ink-2">{fmtInt(selectedIds.length)}</span> SKU dicentang
              </span>
              <button
                type="button"
                className="cursor-pointer font-semibold text-primary-2 hover:underline"
                onClick={() => setRowSelection({})}
              >
                Hapus centang
              </button>
            </>
          )}
        </div>

        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  if (h.column.id === "select") {
                    return (
                      <th key={h.id} className="w-[28px]">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </th>
                    );
                  }
                  const num = (h.column.columnDef.meta as { num?: boolean } | undefined)?.num;
                  const sorted = h.column.getIsSorted();
                  return (
                    <SortHeader
                      key={h.id}
                      label={String(h.column.columnDef.header)}
                      num={num}
                      active={sorted !== false}
                      desc={sorted === "desc"}
                      onClick={() => {
                        h.column.toggleSorting(undefined, false);
                        resetPage();
                      }}
                    />
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <EmptyRow colSpan={visibleColumnCount}>
                {rows.length === 0 ? (
                  "Belum ada SKU aktif. Tambahkan di Master SKU."
                ) : (
                  <>
                    Tidak ada SKU yang cocok dengan filter.{" "}
                    {hasFilter && (
                      <button
                        type="button"
                        className="cursor-pointer font-semibold text-primary-2 hover:underline"
                        onClick={() => {
                          setSearch("");
                          setStatus("all");
                          setRank("");
                          setProduct("");
                          resetPage();
                        }}
                      >
                        Reset filter
                      </button>
                    )}
                  </>
                )}
              </EmptyRow>
            )}
            {pageRows.map((row) => (
              <tr
                key={row.id}
                className={cn("clickable", row.getIsSelected() && "bg-primary-tint/50")}
                onClick={() => openSkuDetail(row.id)}
              >
                {row.getVisibleCells().map((cell) => {
                  const num = (cell.column.columnDef.meta as { num?: boolean } | undefined)?.num;
                  return (
                    <td
                      key={cell.id}
                      className={cn(num && "num")}
                      onClick={cell.column.id === "select" ? (e) => e.stopPropagation() : undefined}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <Pagination
          page={pagination.pageIndex}
          pageSize={pagination.pageSize}
          total={visibleRows.length}
          onPage={(p) => setPagination((s) => ({ ...s, pageIndex: p }))}
          onPageSize={(size) => setPagination({ pageIndex: 0, pageSize: size })}
        />
      </Panel>

      {batchOpen && (
        <BatchModal
          key={batchSkuIds.join(",")}
          open={batchOpen}
          onOpenChange={setBatchOpen}
          skuIds={batchSkuIds}
          onCreated={() => setRowSelection({})}
        />
      )}
    </>
  );
}
