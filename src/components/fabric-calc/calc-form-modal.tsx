"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useAppData } from "@/components/providers/app-data";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { OptionPicker } from "@/components/ui/option-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InfoBanner } from "@/components/ui/info-banner";
import type {
  CalcProduct,
  FabricCalc,
  PoOption,
} from "@/components/fabric-calc/types";
import { deleteFabricCalc, saveFabricCalc } from "@/app/actions/fabric-calc";
import {
  fabricNeeds,
  fmtFabric,
  lineNeed,
  type CalcLineInput,
  type FabricNeedRow,
} from "@/lib/fabric-calc";
import { fabricPerPcs } from "@/lib/fabric";
import {
  buildWorkbook,
  downloadWorkbook,
  type SheetSpec,
} from "@/lib/excel/download";
import { fmtDate, fmtInt } from "@/lib/format";
import { cn } from "@/lib/cn";

interface Draft {
  key: number;
  product_id: string | null;
  color: string;
  qty: string;
}

let nextKey = 1;
const blank = (): Draft => ({
  key: nextKey++,
  product_id: null,
  color: "",
  qty: "",
});

export function CalcFormModal({
  open,
  onOpenChange,
  calc,
  products,
  pos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calc: FabricCalc | null;
  products: CalcProduct[];
  pos: PoOption[];
}) {
  const router = useRouter();
  const { today } = useAppData();
  const [title, setTitle] = useState(calc?.title ?? "");
  const [date, setDate] = useState(calc?.calc_date ?? today);
  const [poId, setPoId] = useState<string | null>(calc?.po_id ?? null);
  const [note, setNote] = useState(calc?.note ?? "");
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    calc && calc.lines.length > 0
      ? calc.lines.map((l) => ({
          key: nextKey++,
          product_id: l.product_id,
          color: l.color ?? "",
          qty: String(l.qty_pcs),
        }))
      : [blank(), blank(), blank()],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const productOptions: ComboOption[] = useMemo(
    () =>
      [...products]
        .sort(
          (a, b) =>
            Number(b.is_active) - Number(a.is_active) ||
            a.name.localeCompare(b.name, "id"),
        )
        .map((p) => {
          const per = fabricPerPcs(p);
          return {
            value: p.id,
            label: p.name,
            sublabel:
              per !== null
                ? `${p.fabric_type ? `${p.fabric_type} · ` : ""}${fmtFabric(per)} ${p.fabric_unit}/pcs`
                : "Pemakaian kain belum diisi",
            keywords: p.fabric_type ?? "",
          };
        }),
    [products],
  );

  const poOptions: ComboOption[] = useMemo(
    () =>
      pos.map((po) => ({
        value: po.id,
        label: `${po.po_no}${po.batch ? ` · Batch ${po.batch.replace(/^batch\s*/i, "")}` : ""}`,
        sublabel: `${po.vendor_name} · ${fmtDate(po.po_date)} · ${fmtInt(po.lines.reduce((s, l) => s + l.qty, 0))} pcs`,
      })),
    [pos],
  );

  /** Baris yang sudah lengkap, dihitung pakai data kain produk terbaru. */
  const lines: CalcLineInput[] = useMemo(
    () =>
      drafts.flatMap((d) => {
        const p = d.product_id ? productById.get(d.product_id) : null;
        const qty = Number(d.qty);
        if (!p || !(qty > 0)) return [];
        return [
          {
            product_id: p.id,
            product_name: p.name,
            color: d.color.trim() || null,
            qty_pcs: qty,
            fabric_type: p.fabric_type,
            fabric_unit: p.fabric_unit,
            fabric_qty: p.fabric_qty,
            fabric_pcs: p.fabric_pcs,
          },
        ];
      }),
    [drafts, productById],
  );
  const result = useMemo(() => fabricNeeds(lines), [lines]);
  const totalPcs = lines.reduce((s, l) => s + l.qty_pcs, 0);

  // Data kain produk berubah sejak perhitungan ini disimpan?
  const changed = useMemo(() => {
    if (!calc) return [];
    const out = new Set<string>();
    for (const l of calc.lines) {
      const p = productById.get(l.product_id);
      if (!p) continue;
      if (
        p.fabric_type !== l.fabric_type ||
        p.fabric_unit !== l.fabric_unit ||
        p.fabric_qty !== l.fabric_qty ||
        p.fabric_pcs !== l.fabric_pcs
      )
        out.add(p.name);
    }
    return [...out];
  }, [calc, productById]);

  function update(key: number, patch: Partial<Draft>) {
    setDrafts((list) =>
      list.map((d) => (d.key === key ? { ...d, ...patch } : d)),
    );
    setError(null);
  }

  function fillFromPo(id: string | null) {
    setPoId(id);
    if (!id) return;
    const po = pos.find((p) => p.id === id);
    if (!po || po.lines.length === 0) return;
    const hasData = drafts.some((d) => d.product_id);
    if (
      hasData &&
      !window.confirm(`Ganti daftar produk dengan isi ${po.po_no}?`)
    )
      return;
    setDrafts(
      po.lines.map((l) => ({
        key: nextKey++,
        product_id: l.product_id,
        color: l.color,
        qty: String(l.qty),
      })),
    );
    if (!title.trim()) setTitle(`Kain untuk ${po.po_no}`);
    setError(null);
  }

  async function submit() {
    const filledDrafts = drafts.filter((d) => d.product_id || d.qty.trim());
    if (filledDrafts.length === 0) {
      setError("Tambahkan minimal 1 produk");
      return;
    }
    for (const d of filledDrafts) {
      if (!d.product_id) {
        setError("Ada baris yang belum dipilih produknya");
        return;
      }
      const q = Number(d.qty);
      if (!Number.isInteger(q) || q <= 0) {
        setError(
          `Jumlah pcs untuk ${productById.get(d.product_id)?.name ?? "produk"} harus angka bulat lebih dari 0`,
        );
        return;
      }
    }
    setSaving(true);
    const res = await saveFabricCalc({
      id: calc?.id ?? null,
      title,
      calc_date: date,
      po_id: poId,
      note,
      lines: filledDrafts.map((d) => ({
        product_id: d.product_id!,
        color: d.color.trim() || null,
        qty_pcs: Number(d.qty),
      })),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success(
      calc ? "Perhitungan diperbarui" : "Perhitungan disimpan ke riwayat",
    );
    onOpenChange(false);
    router.refresh();
  }

  async function doDelete() {
    if (!calc) return;
    const res = await deleteFabricCalc(calc.id);
    if (!res.ok) {
      toast.error(`Gagal menghapus: ${res.error}`);
      return;
    }
    toast.success("Perhitungan dihapus");
    setConfirmDelete(false);
    onOpenChange(false);
    router.refresh();
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const needSheet: SheetSpec<FabricNeedRow> = {
        name: "Kebutuhan Kain",
        rows: result.rows,
        columns: [
          { header: "Jenis Kain", width: 22, value: (r) => r.fabric_type },
          { header: "Warna", width: 18, value: (r) => r.color ?? "" },
          {
            header: "Butuh Kain",
            width: 14,
            numFmt: "#,##0.00",
            value: (r) => Math.round(r.total * 100) / 100,
          },
          { header: "Satuan", value: (r) => r.unit },
          { header: "Total Pcs", numFmt: "#,##0", value: (r) => r.pcs },
          { header: "Produk", width: 50, value: (r) => r.products.join(", ") },
        ],
      };
      const lineSheet: SheetSpec<CalcLineInput> = {
        name: "Rincian Produk",
        rows: lines,
        columns: [
          { header: "Produk", width: 28, value: (l) => l.product_name },
          { header: "Warna", width: 18, value: (l) => l.color ?? "" },
          { header: "Pcs", numFmt: "#,##0", value: (l) => l.qty_pcs },
          {
            header: "Jenis Kain",
            width: 18,
            value: (l) => l.fabric_type ?? "",
          },
          {
            header: "Kain per Pcs",
            width: 14,
            numFmt: "#,##0.000",
            value: (l) =>
              l.fabric_qty && l.fabric_pcs ? l.fabric_qty / l.fabric_pcs : null,
          },
          {
            header: "Butuh Kain",
            width: 14,
            numFmt: "#,##0.00",
            value: (l) => lineNeed(l),
          },
          { header: "Satuan", value: (l) => l.fabric_unit ?? "belum diisi" },
        ],
      };
      const wb = await buildWorkbook([
        needSheet,
        lineSheet,
      ] as SheetSpec<unknown>[]);
      const name = (title.trim() || calc?.calc_no || "Kalkulator Kain").replace(
        /[\\/:*?"<>|]+/g,
        "-",
      );
      await downloadWorkbook(wb, `${name} ${fmtDate(date)}.xlsx`);
    } catch (e) {
      toast.error(
        `Gagal export: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <Modal
        open={open && !confirmDelete}
        onOpenChange={onOpenChange}
        eyebrow="Kalkulator Kain"
        title={calc ? (calc.title ?? calc.calc_no) : "Hitung Kebutuhan Kain"}
        sub={
          calc
            ? `${calc.calc_no} · dibuat ${calc.created_by_name ?? "—"}${calc.updated_at ? ` · diedit ${calc.updated_by_name ?? ""} ${fmtDate(calc.updated_at)}` : ""}`
            : "Isi produk & jumlah pcs yang mau diproduksi, hasil kebutuhan kain muncul di bawah"
        }
        wide
        footerLeft={
          <>
            {calc && (
              <Button
                className="text-neg hover:border-neg"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Hapus
              </Button>
            )}
            <Button
              onClick={exportExcel}
              loading={exporting}
              disabled={lines.length === 0}
            >
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </>
        }
        footer={
          <>
            <Button onClick={() => onOpenChange(false)}>Batal</Button>
            <Button variant="primary" loading={saving} onClick={submit}>
              {calc ? "Simpan Perubahan" : "Simpan ke Riwayat"}
            </Button>
          </>
        }
      >
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-[1.4fr_0.8fr_1.4fr]">
          <div>
            <label className="form-label">Nama perhitungan (opsional)</label>
            <input
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="mis. Produksi Desember, Restock Best Seller"
            />
          </div>
          <div>
            <label className="form-label">Tanggal</label>
            <input
              type="date"
              className="form-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">Ambil dari PO (opsional)</label>
            <div className="flex gap-2">
              <Combobox
                className="flex-1"
                options={poOptions}
                value={poId}
                onChange={fillFromPo}
                placeholder="Pilih PO untuk isi otomatis"
                emptyText="PO tidak ditemukan"
              />
              {poId && (
                <button
                  type="button"
                  title="Lepas PO"
                  onClick={() => setPoId(null)}
                  className="flex h-[42px] w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-grey-1 hover:bg-bg hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {changed.length > 0 && (
          <InfoBanner variant="warn" head="Data kain produk sudah berubah">
            Pemakaian kain untuk <strong>{changed.join(", ")}</strong> sudah
            diubah di Database Produk sejak perhitungan ini disimpan. Hitungan
            di bawah memakai data terbaru — klik Simpan Perubahan untuk
            memperbarui riwayat.
          </InfoBanner>
        )}

        <div className="mb-2 flex items-baseline justify-between gap-3">
          <div className="text-[13px] font-semibold text-ink">
            Rencana produksi{" "}
            <span className="font-normal text-grey-1">
              · {fmtInt(lines.length)} baris · {fmtInt(totalPcs)} pcs
            </span>
          </div>
          <Link
            href="/produk"
            className="text-[12px] font-semibold text-primary-2"
          >
            Atur pemakaian kain di Database Produk →
          </Link>
        </div>
        <div className="rounded-[10px] border border-line">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-[36px]">No</th>
                <th>Produk</th>
                <th className="w-[170px]">Warna (opsional)</th>
                <th className="num w-[100px]">Pcs</th>
                <th className="num">Kain / pcs</th>
                <th className="num">Butuh Kain</th>
                <th className="w-[40px]" />
              </tr>
            </thead>
            <tbody>
              {drafts.map((d, i) => {
                const p = d.product_id ? productById.get(d.product_id) : null;
                const per = p ? fabricPerPcs(p) : null;
                const qty = Number(d.qty);
                const need = per !== null && qty > 0 ? per * qty : null;
                return (
                  <tr key={d.key}>
                    <td className="num text-grey-1">{i + 1}</td>
                    <td className="min-w-[220px]">
                      <Combobox
                        size="sm"
                        options={productOptions}
                        value={d.product_id}
                        onChange={(v) =>
                          update(d.key, {
                            product_id: v,
                            color: v === d.product_id ? d.color : "",
                          })
                        }
                        placeholder="Ketik nama produk"
                      />
                    </td>
                    <td>
                      <OptionPicker
                        size="sm"
                        options={p?.colors ?? []}
                        value={d.color}
                        onChange={(v) => update(d.key, { color: v })}
                        noun="warna"
                        placeholder="Semua warna"
                        allowEmpty
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        className="form-input num !py-1.5"
                        value={d.qty}
                        onChange={(e) => update(d.key, { qty: e.target.value })}
                        placeholder="0"
                      />
                    </td>
                    <td className="num whitespace-nowrap text-[12.5px]">
                      {!p ? (
                        <span className="text-grey-2">—</span>
                      ) : per !== null ? (
                        <span className="text-ink-2">
                          {fmtFabric(per)} {p.fabric_unit}
                          {p.fabric_type && (
                            <div className="text-[11px] text-grey-1">
                              {p.fabric_type}
                            </div>
                          )}
                        </span>
                      ) : (
                        <Link
                          href="/produk"
                          className="text-[12px] font-semibold text-warn-text"
                        >
                          Belum diisi
                        </Link>
                      )}
                    </td>
                    <td
                      className={cn(
                        "num whitespace-nowrap font-semibold",
                        need === null ? "text-grey-2" : "text-ink",
                      )}
                    >
                      {need === null
                        ? "—"
                        : `${fmtFabric(need)} ${p!.fabric_unit}`}
                    </td>
                    <td>
                      <button
                        type="button"
                        title="Hapus baris"
                        aria-label="Hapus baris"
                        onClick={() =>
                          setDrafts((list) =>
                            list.length > 1
                              ? list.filter((x) => x.key !== d.key)
                              : [blank()],
                          )
                        }
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-grey-1 hover:bg-neg-tint hover:text-neg"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button
            type="button"
            onClick={() => setDrafts((list) => [...list, blank()])}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-t border-line py-2.5 text-[12.5px] font-semibold text-primary-2 hover:bg-primary-tint"
          >
            <Plus className="h-3.5 w-3.5" /> Tambah produk
          </button>
        </div>
        <div className="form-hint mt-2">
          Warna dikosongkan = kain dihitung tanpa pisah warna.
        </div>

        {/* Hasil */}
        <div className="mt-5 rounded-[12px] border-2 border-primary-soft bg-primary-tint/40 px-4 py-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-[14px] font-bold text-primary">
              Kebutuhan Kain
            </div>
            <div className="text-[13px] font-semibold text-ink">
              Total:{" "}
              {Object.entries(result.totals).length === 0
                ? "—"
                : Object.entries(result.totals)
                    .map(([u, q]) => `${fmtFabric(q!)} ${u}`)
                    .join(" + ")}
            </div>
          </div>
          {result.rows.length === 0 ? (
            <div className="py-3 text-center text-[12.5px] text-grey-1">
              Isi produk dan jumlah pcs untuk melihat kebutuhan kain.
            </div>
          ) : (
            <div className="overflow-auto rounded-[10px] border border-line bg-white">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Jenis Kain</th>
                    <th>Warna</th>
                    <th className="num">Butuh Kain</th>
                    <th className="num">Pcs</th>
                    <th>Untuk Produk</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.key}>
                      <td className="font-semibold text-ink">
                        {r.fabric_type}
                      </td>
                      <td>
                        {r.color ?? (
                          <span className="text-grey-2">Semua warna</span>
                        )}
                      </td>
                      <td className="num text-[14px] font-bold whitespace-nowrap text-primary">
                        {fmtFabric(r.total)} {r.unit}
                      </td>
                      <td className="num">{fmtInt(r.pcs)}</td>
                      <td className="max-w-[280px] text-[12px] text-ink-3">
                        {r.products.join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.missing.length > 0 && (
            <div className="mt-3 text-[12px] text-warn-text">
              <strong>
                {fmtInt(result.missing.length)} produk belum dihitung
              </strong>{" "}
              karena pemakaian kainnya belum diisi: {result.missing.join(", ")}.{" "}
              <Link href="/produk" className="font-semibold underline">
                Isi di Database Produk
              </Link>
            </div>
          )}
        </div>

        <div className="mt-4">
          <label className="form-label">Catatan (opsional)</label>
          <textarea
            className="form-input min-h-[60px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="mis. kain beli di Toko X"
          />
        </div>

        {error && <div className="form-error mt-3">{error}</div>}
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Hapus perhitungan?"
        message={`${calc?.title ?? calc?.calc_no ?? ""} akan dihapus dari riwayat.`}
        confirmLabel="Hapus"
        tone="neg"
        onConfirm={doDelete}
      />
    </>
  );
}
