"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAppData } from "@/components/providers/app-data";
import { Panel, Toolbar } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { FilterChip } from "@/components/ui/filter-chip";
import { RankBadge } from "@/components/ui/badge";
import { matchOption } from "@/components/ui/combobox";
import { EmptyRow, Pagination } from "@/components/ui/table-parts";
import { ActiveSwitch, SkuFormModal } from "@/components/ppic/sku-form-modal";
import { setSkuActive } from "@/app/actions/master-sku";
import { exportXlsx } from "@/lib/excel/download";
import { fmtDate, fmtInt, fmtRupiah } from "@/lib/format";
import type { SkuInfo } from "@/lib/data/ppic";
import type { RankClass } from "@/lib/ppic";
import { cn } from "@/lib/cn";

type ActiveFilter = "active" | "inactive" | "all";

const CHIPS: { key: ActiveFilter; label: string }[] = [
  { key: "active", label: "Aktif" },
  { key: "inactive", label: "Nonaktif" },
  { key: "all", label: "Semua" },
];

export function MasterSkuTable({
  skus,
  products,
  loadError,
}: {
  skus: SkuInfo[];
  products: string[];
  loadError: string | null;
}) {
  const router = useRouter();
  const { rowById, today, openUpload } = useAppData();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ActiveFilter>("active");
  const [product, setProduct] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SkuInfo | null>(null);
  const [formKey, setFormKey] = useState(0);
  /** Status aktif optimistis selama menunggu server */
  const [pendingActive, setPendingActive] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (loadError) toast.error(`Gagal memuat SKU: ${loadError}`);
  }, [loadError]);

  // Data baru dari server → buang state optimistis
  useEffect(() => setPendingActive({}), [skus]);

  const isActive = (s: SkuInfo) => pendingActive[s.id] ?? s.is_active;

  const codeOwners = useMemo(() => new Map(skus.map((s) => [s.code.toUpperCase(), s.id])), [skus]);

  const sorted = useMemo(
    () =>
      [...skus].sort(
        (a, b) =>
          a.product_name.localeCompare(b.product_name, "id") ||
          a.color.localeCompare(b.color, "id") ||
          a.size.localeCompare(b.size, "id") ||
          a.code.localeCompare(b.code),
      ),
    [skus],
  );

  const searched = useMemo(
    () =>
      sorted.filter(
        (s) =>
          (!product || s.product_name === product) &&
          matchOption({ value: s.id, label: s.label, sublabel: s.code, keywords: `${s.product_name} ${s.color} ${s.size}` }, query),
      ),
    [sorted, product, query],
  );

  const counts = useMemo(() => {
    const c: Record<ActiveFilter, number> = { active: 0, inactive: 0, all: searched.length };
    for (const s of searched) c[(pendingActive[s.id] ?? s.is_active) ? "active" : "inactive"]++;
    return c;
  }, [searched, pendingActive]);

  const visible = useMemo(
    () =>
      filter === "all"
        ? searched
        : searched.filter((s) => (pendingActive[s.id] ?? s.is_active) === (filter === "active")),
    [searched, filter, pendingActive],
  );
  const pageRows = visible.slice(page * pageSize, (page + 1) * pageSize);

  function rankOf(s: SkuInfo): { rank: RankClass; overridden: boolean } | null {
    const row = rowById.get(s.id);
    if (row) return { rank: row.rank, overridden: row.rankOverridden };
    if (s.rank_override) return { rank: s.rank_override, overridden: true };
    return null;
  }

  function openForm(sku: SkuInfo | null) {
    setEditing(sku);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }

  async function toggleActive(s: SkuInfo, next: boolean) {
    setPendingActive((p) => ({ ...p, [s.id]: next }));
    const res = await setSkuActive(s.id, next);
    if (!res.ok) {
      setPendingActive((p) => {
        const copy = { ...p };
        delete copy[s.id];
        return copy;
      });
      toast.error(`Gagal mengubah status: ${res.error}`);
      return;
    }
    toast.success(`${s.code} ${next ? "diaktifkan" : "dinonaktifkan"}`);
    router.refresh();
  }

  async function exportExcel() {
    setExporting(true);
    try {
      // Kolom pertama sama dengan template upload Master SKU supaya bisa diupload ulang
      await exportXlsx("master-sku", today, {
        name: "Master SKU",
        rows: visible,
        columns: [
          { header: "Produk", width: 26, value: (s) => s.product_name },
          { header: "Warna", width: 16, value: (s) => s.color },
          { header: "Size", width: 10, value: (s) => s.size },
          { header: "SKU", width: 28, value: (s) => s.code },
          { header: "Tanggal Launch", width: 16, value: (s) => s.launch_date },
          { header: "Harga Pokok", numFmt: "#,##0", value: (s) => s.unit_cost },
          { header: "Ranking", value: (s) => rankOf(s)?.rank ?? null },
          { header: "Ranking Override", width: 18, value: (s) => s.rank_override ?? "" },
          { header: "Aktif", value: (s) => (isActive(s) ? "Ya" : "Tidak") },
        ],
      });
    } catch (e) {
      toast.error(`Gagal export: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  const resetPage = () => setPage(0);

  return (
    <>
      <Panel
        title="Daftar SKU"
        sub={`${fmtInt(skus.length)} SKU dari ${fmtInt(products.length)} produk · Klik baris untuk edit`}
        actions={
          <>
            <Button onClick={exportExcel} loading={exporting} disabled={visible.length === 0}>
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button onClick={() => openUpload("master-sku")}>
              <Upload className="h-4 w-4" />
              Upload Excel
            </Button>
            <Button variant="primary" onClick={() => openForm(null)}>
              + Tambah SKU
            </Button>
          </>
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
          {CHIPS.map((c) => (
            <FilterChip
              key={c.key}
              active={filter === c.key}
              count={counts[c.key]}
              onClick={() => {
                setFilter(c.key);
                resetPage();
              }}
            >
              {c.label}
            </FilterChip>
          ))}
          <div className="ml-auto">
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

        <table className="data-table">
          <thead>
            <tr>
              <th>Produk</th>
              <th>Warna</th>
              <th>Size</th>
              <th>Kode SKU</th>
              <th>Tanggal Launch</th>
              <th>Ranking</th>
              <th className="num">Harga Pokok</th>
              <th className="w-[70px]">Aktif</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <EmptyRow colSpan={8}>
                {skus.length === 0 ? (
                  <>
                    Belum ada SKU.{" "}
                    <button type="button" className="cursor-pointer font-semibold text-primary-2" onClick={() => openForm(null)}>
                      Tambah yang pertama →
                    </button>
                  </>
                ) : (
                  "Tidak ada SKU yang cocok dengan filter."
                )}
              </EmptyRow>
            )}
            {pageRows.map((s) => {
              const active = isActive(s);
              const rank = rankOf(s);
              return (
                <tr key={s.id} className={cn("clickable", !active && "text-grey-1")} onClick={() => openForm(s)}>
                  <td className={cn("font-semibold", active ? "text-ink" : "text-grey-1")}>{s.product_name}</td>
                  <td className={cn(!active && "!text-grey-1")}>{s.color}</td>
                  <td className={cn(!active && "!text-grey-1")}>{s.size}</td>
                  <td>
                    <span className={cn("text-[12px] font-semibold tracking-[0.01em]", active ? "text-ink-3" : "text-grey-2")}>
                      {s.code}
                    </span>
                  </td>
                  <td className={cn(!active && "!text-grey-1")}>{fmtDate(s.launch_date)}</td>
                  <td>
                    {rank ? (
                      <span className="inline-flex items-center gap-2">
                        <RankBadge rank={rank.rank} overridden={rank.overridden} />
                        <span className="text-[11px] text-grey-1">{rank.overridden ? "override" : "auto"}</span>
                      </span>
                    ) : (
                      <span className="text-grey-2">—</span>
                    )}
                  </td>
                  <td className={cn("num", !active && "!text-grey-1")}>{s.unit_cost === null ? "—" : fmtRupiah(s.unit_cost)}</td>
                  <td>
                    <ActiveSwitch
                      checked={active}
                      label={active ? "Nonaktifkan SKU" : "Aktifkan SKU"}
                      disabled={pendingActive[s.id] !== undefined && pendingActive[s.id] !== s.is_active}
                      onChange={(next) => toggleActive(s, next)}
                    />
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
            onPageSize={(n) => {
              setPageSize(n);
              setPage(0);
            }}
          />
        )}
      </Panel>

      {formOpen && (
        <SkuFormModal
          key={formKey}
          open={formOpen}
          onOpenChange={setFormOpen}
          sku={editing}
          products={products}
          codeOwners={codeOwners}
          today={today}
        />
      )}
    </>
  );
}
