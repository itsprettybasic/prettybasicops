"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { useAppData, type StockModalPreset } from "@/components/providers/app-data";
import {
  CHANNELS,
  CHANNEL_LABEL,
  IN_TYPES,
  OUT_TYPES,
  TYPE_OPTION_LABEL,
  type MovementType,
  type SalesChannel,
} from "@/lib/constants";
import { fmtInt, fmtSigned } from "@/lib/format";
import {
  createStockDocument,
  getOpenPos,
  updateStockDocument,
  type DocumentDetail,
  type OpenPo,
} from "@/app/actions/stock";
import { cn } from "@/lib/cn";

interface Line {
  key: number;
  skuId: string | null;
  qty: string;
}

let lineKey = 0;
const newLine = (skuId: string | null = null, qty = ""): Line => ({ key: ++lineKey, skuId, qty });

export function StockDocumentModal({
  open,
  onOpenChange,
  preset,
  onSwitchToUpload,
  editDoc,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset: StockModalPreset;
  onSwitchToUpload?: () => void;
  /** Mode edit: catatan yang diubah (bukan Penerimaan PO — itu pakai ReceiptEditModal) */
  editDoc?: DocumentDetail;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { today, skuOptions: activeSkuOptions, rowById } = useAppData();
  const isIn = preset.direction === "in";
  const isEdit = !!editDoc;

  // Dibuka dari SKU tertentu → default Adjustment + (Penerimaan PO butuh No PO yang akan mengganti isi baris)
  const [type, setType] = useState<MovementType>(
    editDoc?.type ?? preset.type ?? (isIn ? (preset.skuId && !preset.poId ? "adjustment_in" : "produksi") : "sales"),
  );
  const [date, setDate] = useState(editDoc?.doc_date ?? today);
  const [channel, setChannel] = useState<SalesChannel | null>(editDoc ? editDoc.channel : isIn ? null : "shopee");
  const [poId, setPoId] = useState<string | null>(preset.poId ?? null);
  const [note, setNote] = useState(editDoc?.note ?? "");
  const [lines, setLines] = useState<Line[]>(() =>
    editDoc ? editDoc.lines.map((l) => newLine(l.sku_id, String(l.qty))) : [newLine(preset.skuId ?? null)],
  );
  const [pos, setPos] = useState<OpenPo[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Qty asli catatan yang diedit → stock "sebelum catatan ini" = stock sekarang dikoreksi qty asli
  const origQty = useMemo(
    () => new Map(editDoc && !editDoc.voided_at ? editDoc.lines.map((l) => [l.sku_id, l.qty]) : []),
    [editDoc],
  );
  const stockBefore = (skuId: string, stock: number) => stock + (isIn ? -1 : 1) * (origQty.get(skuId) ?? 0);

  // SKU nonaktif yang ada di catatan lama tetap bisa tampil di pilihan
  const skuOptions = useMemo<ComboOption[]>(() => {
    if (!editDoc) return activeSkuOptions;
    const known = new Set(activeSkuOptions.map((o) => o.value));
    const extra = editDoc.lines
      .filter((l) => !known.has(l.sku_id))
      .map((l) => ({ value: l.sku_id, label: l.label, sublabel: l.code, keywords: l.product_name }));
    return [...activeSkuOptions, ...extra];
  }, [activeSkuOptions, editDoc]);

  const comboRefs = useRef(new Map<number, HTMLInputElement | null>());
  const qtyRefs = useRef(new Map<number, HTMLInputElement | null>());
  const focusNext = useRef<{ key: number; field: "sku" | "qty" } | null>(null);

  useEffect(() => {
    if (!isIn || !open || isEdit) return;
    getOpenPos().then((res) => {
      if (res.ok) setPos(res.data);
      else toast.error(`Gagal memuat PO: ${res.error}`);
    });
  }, [isIn, open, isEdit]);

  // Preset PO (dari detail PO → Terima Barang): isi semua SKU sisa
  const appliedPresetPo = useRef(false);
  useEffect(() => {
    if (!pos || !preset.poId || appliedPresetPo.current) return;
    appliedPresetPo.current = true;
    applyPo(preset.poId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, preset.poId]);

  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    const el = target.field === "sku" ? comboRefs.current.get(target.key) : qtyRefs.current.get(target.key);
    el?.focus();
  });

  function applyPo(id: string | null) {
    setPoId(id);
    const po = pos?.find((b) => b.id === id);
    if (!po) return;
    const open = po.lines.filter((l) => l.remaining > 0);
    setLines(open.length ? open.map((r) => newLine(r.sku_id, String(r.remaining))) : [newLine()]);
  }

  const selectedPo = pos?.find((p) => p.id === poId) ?? null;
  const poLineBySku = useMemo(() => new Map((selectedPo?.lines ?? []).map((l) => [l.sku_id, l])), [selectedPo]);

  const typeOptions: ComboOption[] = (isIn ? IN_TYPES : OUT_TYPES)
    .filter((t) => !isEdit || t !== "produksi")
    .map((t) => ({ value: t, label: TYPE_OPTION_LABEL[t] }));
  const channelOptions: ComboOption[] = CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }));
  const poOptions: ComboOption[] = (pos ?? []).map((b) => ({
    value: b.id,
    label: b.po_no,
    sublabel: `${b.vendor_name} · sisa ${fmtInt(b.lines.reduce((s, r) => s + r.remaining, 0))} pcs`,
    keywords: b.vendor_name,
  }));

  const parsed = lines.map((l) => {
    const qty = Number(l.qty);
    const row = l.skuId ? rowById.get(l.skuId) : undefined;
    return { ...l, qtyNum: Number.isInteger(qty) && qty > 0 ? qty : null, row };
  });

  const duplicateOf = useMemo(() => {
    const seen = new Map<string, number>();
    const dup = new Map<number, number>();
    lines.forEach((l, i) => {
      if (!l.skuId) return;
      if (seen.has(l.skuId)) dup.set(l.key, seen.get(l.skuId)! + 1);
      else seen.set(l.skuId, i);
    });
    return dup;
  }, [lines]);

  const filled = parsed.filter((l) => l.skuId && l.qtyNum);
  const totalQty = filled.reduce((s, l) => s + (l.qtyNum ?? 0), 0);
  const channelRequired = type === "sales";
  const poRequired = type === "produksi" && !isEdit;

  const errors: string[] = [];
  if (filled.length === 0) errors.push("Isi minimal 1 SKU dengan qty.");
  if (parsed.some((l) => l.skuId && !l.qtyNum)) errors.push("Qty harus bilangan bulat lebih dari 0.");
  if (parsed.some((l) => !l.skuId && l.qty)) errors.push("Ada baris yang SKU-nya belum dipilih.");
  if (duplicateOf.size > 0) errors.push("Ada SKU duplikat — gabungkan dulu.");
  if (channelRequired && !channel) errors.push("Channel wajib diisi untuk Sales.");
  if (poRequired && !poId) errors.push("Pilih No PO untuk Penerimaan PO.");
  if (!date) errors.push("Tanggal wajib diisi.");

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    const line = newLine();
    focusNext.current = { key: line.key, field: "sku" };
    setLines((ls) => [...ls, line]);
  }

  function removeLine(key: number) {
    setLines((ls) => (ls.length <= 1 ? [newLine()] : ls.filter((l) => l.key !== key)));
  }

  async function save() {
    setSubmitted(true);
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    setSaving(true);
    if (editDoc) {
      const res = await updateStockDocument({
        id: editDoc.id,
        type,
        doc_date: date,
        channel: isIn ? null : channel,
        note: note.trim() || null,
        lines: filled.map((l) => ({ sku_id: l.skuId!, qty: l.qtyNum! })),
      });
      setSaving(false);
      if (!res.ok) {
        toast.error(`Gagal menyimpan: ${res.error}`);
        return;
      }
      toast.success(`${editDoc.doc_no} diperbarui · ${filled.length} SKU · ${fmtSigned(isIn ? totalQty : -totalQty)} pcs`);
      onSaved?.();
      router.refresh();
      return;
    }
    const res = await createStockDocument({
      direction: preset.direction,
      type,
      doc_date: date,
      channel: isIn ? null : channel,
      po_id: poRequired ? poId : null,
      note: note.trim() || null,
      source: "manual",
      lines: filled.map((l) => ({ sku_id: l.skuId!, qty: l.qtyNum! })),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(`Gagal menyimpan: ${res.error}`);
      return;
    }
    toast.success(
      `${isIn ? "Barang masuk" : "Barang keluar"} tersimpan · ${filled.length} SKU · ${fmtSigned(isIn ? totalQty : -totalQty)} pcs`,
    );
    onOpenChange(false);
    router.refresh();
  }

  return (
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        wide
        eyebrow={editDoc ? (isIn ? "Barang Masuk" : "Barang Keluar") : undefined}
        title={
          editDoc
            ? `Ubah ${editDoc.doc_no}`
            : isIn
            ? type === "produksi"
              ? "Terima Barang dari PO"
              : "Catat Barang Masuk"
            : "Catat Barang Keluar"
        }
        sub={
          editDoc
            ? "Ubah tipe, tanggal, channel, catatan, atau SKU & qty · Stock langsung menyesuaikan"
            : "Satu catatan bisa berisi banyak SKU · Stock langsung ter-update"
        }
        footerLeft={
          onSwitchToUpload && !isEdit ? (
            <Button onClick={onSwitchToUpload}>
              <Upload className="h-3.5 w-3.5" /> Upload Excel
            </Button>
          ) : undefined
        }
        footer={
          <>
            <Button onClick={() => onOpenChange(false)}>Batal</Button>
            <Button variant={isIn ? "pos" : "neg"} loading={saving} onClick={() => save()}>
              {isEdit ? "Simpan Perubahan" : `Simpan ${isIn ? "Barang Masuk" : "Barang Keluar"}`}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="mb-4">
            <label className="form-label">Tipe {isIn ? "Barang Masuk" : "Barang Keluar"}</label>
            <Combobox
              options={typeOptions}
              value={type}
              onChange={(v) => {
                if (!v) return;
                setType(v as MovementType);
                if (v !== "produksi") setPoId(null);
              }}
            />
          </div>
          <div className="mb-4">
            <label className="form-label">Tanggal</label>
            <input type="date" className="form-input" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </div>
          {isIn ? (
            <div className="mb-4">
              <label className="form-label">No PO {poRequired ? "" : "(khusus penerimaan PO)"}</label>
              <Combobox
                options={poOptions}
                value={poId}
                onChange={(v) => applyPo(v)}
                disabled={!poRequired}
                invalid={submitted && poRequired && !poId}
                placeholder={pos === null ? "Memuat..." : poOptions.length ? "Pilih PO..." : "Tidak ada PO aktif"}
                emptyText="Tidak ada PO yang sedang dipesan"
              />
            </div>
          ) : (
            <div className="mb-4">
              <label className="form-label">Channel {channelRequired ? "" : "(opsional)"}</label>
              <Combobox
                options={channelOptions}
                value={channel}
                onChange={(v) => setChannel(v as SalesChannel | null)}
                invalid={submitted && channelRequired && !channel}
                placeholder="Pilih channel..."
              />
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="form-label">Catatan (opsional)</label>
          <input
            className="form-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isIn ? "Mis. Surat jalan vendor no. 123" : "Mis. Rekap sales Shopee hari ini"}
          />
        </div>

        <div className="mt-5 mb-2">
          <div className="text-[11px] font-bold tracking-[0.06em] text-grey-1 uppercase">SKU dalam Catatan</div>
          <div className="mt-0.5 text-xs text-grey-1">Ketik nama, warna, atau kode SKU · Enter di kolom Qty untuk baris baru</div>
        </div>

        <table className="sku-row-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th className="num w-[130px]">{isEdit ? "Stock Sebelum" : "Stock Sekarang"}</th>
              <th className="num w-[120px]">Qty (pcs)</th>
              <th className="w-9" />
            </tr>
          </thead>
          <tbody>
            {parsed.map((l, i) => {
              const dup = duplicateOf.get(l.key);
              const base = l.row ? stockBefore(l.row.id, l.row.stock) : null;
              const after = base !== null && l.qtyNum !== null ? base + (isIn ? l.qtyNum : -l.qtyNum) : null;
              return (
                <tr key={l.key}>
                  <td>
                    <Combobox
                      size="sm"
                      options={skuOptions}
                      value={l.skuId}
                      onChange={(v) => updateLine(l.key, { skuId: v })}
                      placeholder="Ketik untuk cari SKU..."
                      invalid={(submitted && !l.skuId && !!l.qty) || dup !== undefined}
                      inputRef={(el) => {
                        comboRefs.current.set(l.key, el);
                      }}
                      onEnterAfterSelect={() => {
                        focusNext.current = { key: l.key, field: "qty" };
                      }}
                    />
                    {dup !== undefined && <div className="form-error">SKU sudah ada di baris {dup}</div>}
                    {selectedPo && l.skuId && (() => {
                      const pl = poLineBySku.get(l.skuId);
                      if (!pl) return <div className="mt-0.5 text-[11px] font-semibold text-warn">Tidak ada di {selectedPo.po_no}</div>;
                      return (
                        <div className={cn("mt-0.5 text-[11px]", l.qtyNum && l.qtyNum > pl.remaining ? "font-semibold text-warn" : "text-grey-1")}>
                          PO {fmtInt(pl.qty)} · sudah diterima {fmtInt(pl.received)} · sisa {fmtInt(pl.remaining)}
                        </div>
                      );
                    })()}
                    {after !== null && after < 0 && (
                      <div className="mt-0.5 text-[11px] text-grey-1">Stock jadi {fmtSigned(after)} (minus tetap boleh)</div>
                    )}
                  </td>
                  <td className="num text-grey-1">{base !== null ? fmtInt(base) : "—"}</td>
                  <td className="num">
                    <input
                      ref={(el) => {
                        qtyRefs.current.set(l.key, el);
                      }}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      className={cn("qty-input", submitted && l.skuId && !l.qtyNum && "error")}
                      placeholder="0"
                      value={l.qty}
                      onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (i === lines.length - 1) addLine();
                          else comboRefs.current.get(lines[i + 1].key)?.focus();
                        }
                      }}
                    />
                  </td>
                  <td className="text-center">
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      aria-label="Hapus baris"
                      className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-grey-2 hover:bg-neg-tint hover:text-neg"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={4} className="!py-2">
                <button
                  type="button"
                  onClick={addLine}
                  className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-grey-3 py-2 text-[12.5px] font-semibold text-grey-1 transition-colors hover:border-primary-2 hover:bg-primary-tint hover:text-primary-2"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tambah baris SKU
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="text-grey-1">
                Total: <span className="text-ink">{filled.length} SKU</span>
              </td>
              <td className="num pr-[10px] text-right">
                <span className={isIn ? "text-pos" : "text-neg"}>{fmtSigned(isIn ? totalQty : -totalQty)} pcs</span>
              </td>
              <td />
            </tr>
          </tfoot>
        </table>

        {submitted && errors.length > 0 && (
          <div className="mt-3 rounded-lg bg-neg-tint px-3 py-2 text-[12px] font-semibold text-neg-text">{errors[0]}</div>
        )}
      </Modal>
  );
}
