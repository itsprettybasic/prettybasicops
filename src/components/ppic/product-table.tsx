"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useAppData } from "@/components/providers/app-data";
import { Panel, Toolbar } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { SearchInput } from "@/components/ui/search-input";
import { FilterChip } from "@/components/ui/filter-chip";
import { EmptyRow, Pagination } from "@/components/ui/table-parts";
import { ActiveSwitch } from "@/components/ppic/sku-form-modal";
import { saveProduct, setProductActive } from "@/app/actions/products";
import { exportXlsx } from "@/lib/excel/download";
import { fmtInt } from "@/lib/format";
import type { SkuInfo } from "@/lib/data/ppic";
import { cn } from "@/lib/cn";
import { FABRIC_UNITS, fabricPerPcs, fabricSummary, type FabricUnit, type FabricUsage } from "@/lib/fabric";

export interface ProductRow extends FabricUsage {
  id: string;
  name: string;
  category: string | null;
  is_active: boolean;
  created_at: string;
}

function fmtNum(n: number, max = 3) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: max });
}

type ActiveFilter = "active" | "inactive" | "all";

const CHIPS: { key: ActiveFilter; label: string }[] = [
  { key: "active", label: "Aktif" },
  { key: "inactive", label: "Nonaktif" },
  { key: "all", label: "Semua" },
];

function sortSkus(list: SkuInfo[]) {
  return [...list].sort(
    (a, b) => a.color.localeCompare(b.color, "id") || a.size.localeCompare(b.size, "id") || a.code.localeCompare(b.code),
  );
}

export function ProductTable({
  products,
  skus,
  loadError,
}: {
  products: ProductRow[];
  skus: SkuInfo[];
  loadError: string | null;
}) {
  const router = useRouter();
  const { rowById, today } = useAppData();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ActiveFilter>("active");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [pendingActive, setPendingActive] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (loadError) toast.error(`Gagal memuat produk: ${loadError}`);
  }, [loadError]);

  useEffect(() => setPendingActive({}), [products]);

  const skusByProduct = useMemo(() => {
    const m = new Map<string, SkuInfo[]>();
    for (const s of skus) {
      const list = m.get(s.product_id);
      if (list) list.push(s);
      else m.set(s.product_id, [s]);
    }
    return m;
  }, [skus]);

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "id")),
    [products],
  );

  const fabricTypes = useMemo(
    () => [...new Set(products.map((p) => p.fabric_type).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "id")),
    [products],
  );

  const isActive = (p: ProductRow) => pendingActive[p.id] ?? p.is_active;

  function stats(p: ProductRow) {
    const list = skusByProduct.get(p.id) ?? [];
    let active = 0;
    let stock = 0;
    for (const s of list) {
      if (s.is_active) active++;
      stock += rowById.get(s.id)?.stock ?? 0;
    }
    return { total: list.length, active, stock, list };
  }

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category && p.category !== category) return false;
      if (!q) return true;
      if ([p.name, p.category, p.fabric_type].some((v) => (v ?? "").toLowerCase().includes(q))) return true;
      return (skusByProduct.get(p.id) ?? []).some((s) => s.code.toLowerCase().includes(q));
    });
  }, [products, skusByProduct, query, category]);

  const counts = useMemo(() => {
    const c: Record<ActiveFilter, number> = { active: 0, inactive: 0, all: searched.length };
    for (const p of searched) c[(pendingActive[p.id] ?? p.is_active) ? "active" : "inactive"]++;
    return c;
  }, [searched, pendingActive]);

  const visible = useMemo(
    () =>
      filter === "all" ? searched : searched.filter((p) => (pendingActive[p.id] ?? p.is_active) === (filter === "active")),
    [searched, filter, pendingActive],
  );
  const pageRows = visible.slice(page * pageSize, (page + 1) * pageSize);
  const resetPage = () => setPage(0);

  function openForm(p: ProductRow | null) {
    setEditing(p);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }

  async function toggleActive(p: ProductRow, next: boolean) {
    setPendingActive((s) => ({ ...s, [p.id]: next }));
    const res = await setProductActive(p.id, next);
    if (!res.ok) {
      setPendingActive((s) => {
        const copy = { ...s };
        delete copy[p.id];
        return copy;
      });
      toast.error(`Gagal mengubah status: ${res.error}`);
      return;
    }
    toast.success(`${p.name} ${next ? "diaktifkan" : "dinonaktifkan"} beserta semua SKU-nya`);
    router.refresh();
  }

  async function exportExcel() {
    setExporting(true);
    try {
      await exportXlsx("database-produk", today, {
        name: "Database Produk",
        rows: visible,
        columns: [
          { header: "Produk", width: 28, value: (p) => p.name },
          { header: "Kategori", width: 16, value: (p) => p.category ?? "" },
          { header: "Jenis Kain", width: 16, value: (p) => p.fabric_type ?? "" },
          { header: "Satuan Kain", value: (p) => p.fabric_unit ?? "" },
          { header: "Kain", numFmt: "#,##0.###", value: (p) => p.fabric_qty },
          { header: "Jadi Pcs", numFmt: "#,##0.##", value: (p) => p.fabric_pcs },
          { header: "Kain per Pcs", width: 14, numFmt: "#,##0.000", value: (p) => fabricPerPcs(p) },
          { header: "SKU Aktif", value: (p) => stats(p).active },
          { header: "Total SKU", value: (p) => stats(p).total },
          { header: "Stock", numFmt: "#,##0", value: (p) => stats(p).stock },
          { header: "Status", value: (p) => (isActive(p) ? "Aktif" : "Nonaktif") },
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
        title="Daftar Produk"
        sub={`${fmtInt(products.length)} produk · ${fmtInt(skus.length)} SKU · Klik baris untuk edit nama, kategori & kode SKU`}
        actions={
          <>
            <Button onClick={exportExcel} loading={exporting} disabled={visible.length === 0}>
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button variant="primary" onClick={() => openForm(null)}>
              + Tambah Produk
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
            placeholder="Cari produk, kategori, kain, kode SKU..."
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
          {categories.length > 0 && (
            <div className="ml-auto">
              <select
                className="select-input"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  resetPage();
                }}
              >
                <option value="">Semua kategori</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
        </Toolbar>

        <table className="data-table">
          <thead>
            <tr>
              <th>Produk</th>
              <th>Kategori</th>
              <th>Contoh Kode SKU</th>
              <th>Pemakaian Kain</th>
              <th className="num">SKU Aktif</th>
              <th className="num">Stock</th>
              <th>Status</th>
              <th className="w-[70px]">Aktif</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <EmptyRow colSpan={8}>{products.length === 0 ? "Belum ada produk." : "Tidak ada produk yang cocok dengan filter."}</EmptyRow>
            )}
            {pageRows.map((p) => {
              const active = isActive(p);
              const st = stats(p);
              const sample = sortSkus(st.list)[0]?.code;
              return (
                <tr key={p.id} className={cn("clickable", !active && "text-grey-1")} onClick={() => openForm(p)}>
                  <td className={cn("font-semibold", active ? "text-ink" : "text-grey-1")}>{p.name}</td>
                  <td className={cn(!active && "!text-grey-1")}>{p.category ?? <span className="text-grey-2">—</span>}</td>
                  <td>
                    {sample ? (
                      <span className={cn("text-[12px] font-semibold tracking-[0.01em]", active ? "text-ink-3" : "text-grey-2")}>
                        {sample}
                        {st.total > 1 && <span className="font-normal text-grey-1"> +{st.total - 1}</span>}
                      </span>
                    ) : (
                      <span className="text-grey-2">Belum ada SKU</span>
                    )}
                  </td>
                  <td className={cn(!active && "!text-grey-1")}>
                    {fabricPerPcs(p) !== null ? (
                      <div className="leading-tight">
                        <div className="text-[12.5px]">
                          {p.fabric_type && <span className="font-semibold">{p.fabric_type} · </span>}
                          {fmtNum(p.fabric_qty!)} {p.fabric_unit} → {fmtNum(p.fabric_pcs!, 2)} pcs
                        </div>
                        <div className="text-[11px] text-grey-1">
                          {fmtNum(fabricPerPcs(p)!)} {p.fabric_unit}/pcs
                        </div>
                      </div>
                    ) : (
                      <span className="text-[12px] text-warn-text">Belum diisi</span>
                    )}
                  </td>
                  <td className={cn("num", !active && "!text-grey-1")}>
                    {fmtInt(st.active)}
                    <span className="text-grey-1"> / {fmtInt(st.total)}</span>
                  </td>
                  <td className={cn("num", !active && "!text-grey-1")}>{fmtInt(st.stock)}</td>
                  <td>{active ? <Badge tone="pos">Aktif</Badge> : <Badge tone="grey">Nonaktif</Badge>}</td>
                  <td>
                    <ActiveSwitch
                      checked={active}
                      label={active ? "Nonaktifkan produk" : "Aktifkan produk"}
                      disabled={pendingActive[p.id] !== undefined && pendingActive[p.id] !== p.is_active}
                      onChange={(next) => toggleActive(p, next)}
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
        <ProductFormModal
          key={formKey}
          open={formOpen}
          onOpenChange={setFormOpen}
          product={editing}
          skus={editing ? sortSkus(skusByProduct.get(editing.id) ?? []) : []}
          categories={categories}
          fabricTypes={fabricTypes}
        />
      )}
    </>
  );
}

interface SkuDraft {
  id: string;
  code: string;
  color: string;
  size: string;
  is_active: boolean;
}

function ProductFormModal({
  open,
  onOpenChange,
  product,
  skus,
  categories,
  fabricTypes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductRow | null;
  skus: SkuInfo[];
  categories: string[];
  fabricTypes: string[];
}) {
  const router = useRouter();
  const [fabricType, setFabricType] = useState(product?.fabric_type ?? "");
  const [fabricUnit, setFabricUnit] = useState<FabricUnit | "">(product?.fabric_unit ?? "");
  const [fabricQty, setFabricQty] = useState(product?.fabric_qty != null ? String(product.fabric_qty) : "");
  const [fabricPcs, setFabricPcs] = useState(product?.fabric_pcs != null ? String(product.fabric_pcs) : "");
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [active, setActive] = useState(product?.is_active ?? true);
  const [drafts, setDrafts] = useState<SkuDraft[]>(() =>
    skus.map((s) => ({ id: s.id, code: s.code, color: s.color, size: s.size, is_active: s.is_active })),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateDraft(id: string, patch: Partial<SkuDraft>) {
    setDrafts((list) => list.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    setError(null);
  }

  function changeProductActive(next: boolean) {
    setActive(next);
    // Produk nonaktif → semua SKU nonaktif; diaktifkan lagi → semua SKU aktif (bisa diubah per SKU)
    setDrafts((list) => list.map((d) => ({ ...d, is_active: next })));
  }

  async function submit() {
    if (!name.trim()) {
      setError("Nama produk wajib diisi");
      return;
    }
    const qty = fabricQty.trim() === "" ? null : Number(fabricQty.replace(",", "."));
    const pcs = fabricPcs.trim() === "" ? null : Number(fabricPcs.replace(",", "."));
    if ((qty !== null && !(qty > 0)) || (pcs !== null && !(pcs > 0))) {
      setError("Jumlah kain dan jumlah pcs harus angka lebih dari 0");
      return;
    }
    const filled = [fabricUnit || null, qty, pcs].filter((v) => v !== null).length;
    if (filled !== 0 && filled !== 3) {
      setError("Pemakaian kain belum lengkap: isi satuan, jumlah kain, dan jumlah pcs (atau kosongkan semuanya)");
      return;
    }
    setSaving(true);
    const res = await saveProduct({
      fabric_type: fabricType,
      fabric_unit: fabricUnit || null,
      fabric_qty: qty,
      fabric_pcs: pcs,
      id: product?.id ?? null,
      name,
      category,
      is_active: active,
      skus: drafts,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success(product ? `${name.trim()} diperbarui` : `Produk ${name.trim()} ditambahkan`);
    onOpenChange(false);
    router.refresh();
  }

  const activeCount = drafts.filter((d) => d.is_active).length;
  const previewQty = Number(fabricQty.replace(",", "."));
  const previewPcs = Number(fabricPcs.replace(",", "."));
  const preview =
    fabricUnit && previewQty > 0 && previewPcs > 0
      ? fabricSummary({ fabric_type: null, fabric_unit: fabricUnit, fabric_qty: previewQty, fabric_pcs: previewPcs })
      : null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Database Produk"
      title={product ? "Edit Produk" : "Tambah Produk"}
      sub={product ? product.name : "SKU (warna × size) ditambahkan lewat menu Master SKU"}
      wide={drafts.length > 0}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Batal</Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            {product ? "Simpan Perubahan" : "Simpan Produk"}
          </Button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label">Nama Produk</label>
          <input
            className="form-input"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="mis. Daisy Halter Top"
          />
        </div>
        <div>
          <label className="form-label">Kategori (opsional)</label>
          <input
            className="form-input"
            value={category}
            list="product-categories"
            onChange={(e) => setCategory(e.target.value)}
            placeholder="mis. Top, Skirt, Dress"
          />
          <datalist id="product-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="mb-4 rounded-[10px] border border-line px-4 py-3">
        <div className="mb-3">
          <div className="text-[13px] font-semibold text-ink">Pemakaian Kain</div>
          <div className="text-[11.5px] text-grey-1">
            Untuk Kalkulator Kain & kebutuhan kain per PO. Contoh: 1 kg jadi 4 pcs, atau 1,5 yard jadi 1 pcs.
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_0.8fr_1fr_1fr]">
          <div>
            <label className="form-label">Jenis Kain</label>
            <input
              className="form-input"
              value={fabricType}
              list="fabric-types"
              onChange={(e) => setFabricType(e.target.value)}
              placeholder="mis. Rayon, Katun"
            />
            <datalist id="fabric-types">
              {fabricTypes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="form-label">Satuan</label>
            <select
              className="form-input"
              value={fabricUnit}
              onChange={(e) => {
                const u = e.target.value as FabricUnit | "";
                setFabricUnit(u);
                if (u && fabricQty.trim() === "") setFabricQty("1");
                setError(null);
              }}
            >
              <option value="">—</option>
              {FABRIC_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Kain {fabricUnit ? `(${fabricUnit})` : ""}</label>
            <input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              className="form-input num"
              value={fabricQty}
              onChange={(e) => {
                setFabricQty(e.target.value);
                setError(null);
              }}
              placeholder="1"
            />
          </div>
          <div>
            <label className="form-label">Jadi berapa pcs</label>
            <input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              className="form-input num"
              value={fabricPcs}
              onChange={(e) => {
                setFabricPcs(e.target.value);
                setError(null);
              }}
              placeholder="4"
            />
          </div>
        </div>
        <div className="form-hint mt-2">
          {preview ? (
            <>
              <span className="font-semibold text-ink-3">{preview}</span> · 100 pcs butuh{" "}
              <span className="font-semibold text-ink-3">
                {fmtNum((previewQty / previewPcs) * 100, 2)} {fabricUnit}
              </span>
            </>
          ) : (
            "Kosongkan kalau belum tahu."
          )}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-[10px] border border-line px-4 py-3">
        <div>
          <div className="text-[13px] font-semibold text-ink">Produk aktif</div>
          <div className="text-[11.5px] text-grey-1">
            Nonaktif = produk & semua SKU-nya tidak dihitung di PPIC dan tidak muncul di pilihan SKU. Riwayat tetap tersimpan.
          </div>
        </div>
        <ActiveSwitch checked={active} onChange={changeProductActive} label="Produk aktif" />
      </div>

      {product && (
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <div className="text-[13px] font-semibold text-ink">
              SKU produk ini{" "}
              <span className="font-normal text-grey-1">
                · {fmtInt(activeCount)} aktif dari {fmtInt(drafts.length)}
              </span>
            </div>
            <Link href="/master-sku" className="text-[12px] font-semibold text-primary-2">
              + Tambah SKU di Master SKU →
            </Link>
          </div>
          {drafts.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-line px-4 py-6 text-center text-[13px] text-grey-1">
              Produk ini belum punya SKU.
            </div>
          ) : (
            <div className="max-h-[45vh] overflow-auto rounded-[10px] border border-line">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Kode SKU</th>
                    <th>Warna</th>
                    <th>Size</th>
                    <th className="w-[70px]">Aktif</th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((d) => (
                    <tr key={d.id}>
                      <td className="min-w-[200px]">
                        <input
                          className="form-input !py-1.5 font-semibold tracking-[0.02em] uppercase"
                          value={d.code}
                          onChange={(e) => updateDraft(d.id, { code: e.target.value.toUpperCase().replace(/\s+/g, "") })}
                        />
                      </td>
                      <td className="min-w-[120px]">
                        <input
                          className="form-input !py-1.5"
                          value={d.color}
                          onChange={(e) => updateDraft(d.id, { color: e.target.value })}
                        />
                      </td>
                      <td className="min-w-[90px]">
                        <input
                          className="form-input !py-1.5"
                          value={d.size}
                          onChange={(e) => updateDraft(d.id, { size: e.target.value })}
                        />
                      </td>
                      <td>
                        <ActiveSwitch
                          checked={d.is_active}
                          disabled={!active}
                          label={d.is_active ? "Nonaktifkan SKU" : "Aktifkan SKU"}
                          onChange={(next) => updateDraft(d.id, { is_active: next })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="form-hint mt-2">
            Kode SKU harus sama dengan SKU di Shopee/TikTok supaya upload penjualan tetap cocok.
          </div>
        </div>
      )}

      {error && <div className="form-error mt-3">{error}</div>}
    </Modal>
  );
}
