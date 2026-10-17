"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { createStockDocument, getOpenBatches, type OpenBatch } from "@/app/actions/stock";
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset: StockModalPreset;
  onSwitchToUpload: () => void;
}) {
  const router = useRouter();
  const { today, skuOptions, rowById } = useAppData();
  const isIn = preset.direction === "in";

  // Dibuka dari SKU tertentu → default Adjustment + (Produksi butuh Ref Batch yang akan mengganti isi baris)
  const [type, setType] = useState<MovementType>(
    preset.type ?? (isIn ? (preset.skuId && !preset.batchId ? "adjustment_in" : "produksi") : "sales"),
  );
  const [date, setDate] = useState(today);
  const [channel, setChannel] = useState<SalesChannel | null>(isIn ? null : "shopee");
  const [batchId, setBatchId] = useState<string | null>(preset.batchId ?? null);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>(() => [newLine(preset.skuId ?? null)]);
  const [batches, setBatches] = useState<OpenBatch[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmMinus, setConfirmMinus] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const comboRefs = useRef(new Map<number, HTMLInputElement | null>());
  const qtyRefs = useRef(new Map<number, HTMLInputElement | null>());
  const focusNext = useRef<{ key: number; field: "sku" | "qty" } | null>(null);

  useEffect(() => {
    if (!isIn || !open) return;
    getOpenBatches().then((res) => {
      if (res.ok) setBatches(res.data);
      else toast.error(`Gagal memuat batch: ${res.error}`);
    });
  }, [isIn, open]);

  // Preset batch (dari halaman Batch → Terima Barang): isi semua SKU sisa
  const appliedPresetBatch = useRef(false);
  useEffect(() => {
    if (!batches || !preset.batchId || appliedPresetBatch.current) return;
    appliedPresetBatch.current = true;
    applyBatch(preset.batchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches, preset.batchId]);

  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    const el = target.field === "sku" ? comboRefs.current.get(target.key) : qtyRefs.current.get(target.key);
    el?.focus();
  });

  function applyBatch(id: string | null) {
    setBatchId(id);
    const batch = batches?.find((b) => b.id === id);
    if (!batch) return;
    setLines(batch.remaining.length ? batch.remaining.map((r) => newLine(r.sku_id, String(r.qty))) : [newLine()]);
  }

  const typeOptions: ComboOption[] = (isIn ? IN_TYPES : OUT_TYPES).map((t) => ({ value: t, label: TYPE_OPTION_LABEL[t] }));
  const channelOptions: ComboOption[] = CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }));
  const batchOptions: ComboOption[] = (batches ?? []).map((b) => ({
    value: b.id,
    label: b.batch_no,
    sublabel: `${b.konveksi_name} · sisa ${fmtInt(b.remaining.reduce((s, r) => s + r.qty, 0))} pcs`,
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
  const overStock = isIn ? [] : parsed.filter((l) => l.row && l.qtyNum && l.qtyNum > l.row.stock);
  const channelRequired = type === "sales";
  const batchRequired = type === "produksi";

  const errors: string[] = [];
  if (filled.length === 0) errors.push("Isi minimal 1 SKU dengan qty.");
  if (parsed.some((l) => l.skuId && !l.qtyNum)) errors.push("Qty harus bilangan bulat lebih dari 0.");
  if (parsed.some((l) => !l.skuId && l.qty)) errors.push("Ada baris yang SKU-nya belum dipilih.");
  if (duplicateOf.size > 0) errors.push("Ada SKU duplikat — gabungkan dulu.");
  if (channelRequired && !channel) errors.push("Channel wajib diisi untuk Sales.");
  if (batchRequired && !batchId) errors.push("Pilih Ref Batch untuk Produksi Selesai.");
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

  async function save(force = false) {
    setSubmitted(true);
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    if (!force && overStock.length > 0 && type !== "adjustment_out") {
      setConfirmMinus(true);
      return;
    }
    setSaving(true);
    const res = await createStockDocument({
      direction: preset.direction,
      type,
      doc_date: date,
      channel: isIn ? null : channel,
      batch_id: batchRequired ? batchId : null,
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
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        wide
        title={isIn ? "Catat Barang Masuk" : "Catat Barang Keluar"}
        sub="Satu catatan bisa berisi banyak SKU · Stock langsung ter-update"
        footerLeft={
          <Button onClick={onSwitchToUpload}>
            <Upload className="h-3.5 w-3.5" /> Upload Excel
          </Button>
        }
        footer={
          <>
            <Button onClick={() => onOpenChange(false)}>Batal</Button>
            <Button variant={isIn ? "pos" : "neg"} loading={saving} onClick={() => save()}>
              Simpan {isIn ? "Barang Masuk" : "Barang Keluar"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-3 gap-4">
          <div className="mb-4">
            <label className="form-label">Tipe {isIn ? "Barang Masuk" : "Barang Keluar"}</label>
            <Combobox
              options={typeOptions}
              value={type}
              onChange={(v) => {
                if (!v) return;
                setType(v as MovementType);
                if (v !== "produksi") setBatchId(null);
              }}
            />
          </div>
          <div className="mb-4">
            <label className="form-label">Tanggal</label>
            <input type="date" className="form-input" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </div>
          {isIn ? (
            <div className="mb-4">
              <label className="form-label">Ref Batch {batchRequired ? "" : "(khusus produksi)"}</label>
              <Combobox
                options={batchOptions}
                value={batchId}
                onChange={(v) => applyBatch(v)}
                disabled={!batchRequired}
                invalid={submitted && batchRequired && !batchId}
                placeholder={batches === null ? "Memuat..." : batchOptions.length ? "Pilih batch..." : "Tidak ada batch aktif"}
                emptyText="Tidak ada batch yang sedang diproduksi"
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
            placeholder={isIn ? "Mis. Konveksi GKS selesai" : "Mis. Rekap sales Shopee hari ini"}
          />
        </div>

        <div className="mt-5 mb-2 flex items-end justify-between">
          <div>
            <div className="text-[11px] font-bold tracking-[0.06em] text-grey-1 uppercase">SKU dalam Catatan</div>
            <div className="mt-0.5 text-xs text-grey-1">Ketik nama, warna, atau kode SKU · Enter di kolom Qty untuk baris baru</div>
          </div>
          <Button size="sm" onClick={addLine}>
            + Tambah SKU
          </Button>
        </div>

        <table className="sku-row-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th className="num w-[130px]">Stock Sekarang</th>
              <th className="num w-[120px]">Qty (pcs)</th>
              <th className="w-9" />
            </tr>
          </thead>
          <tbody>
            {parsed.map((l, i) => {
              const dup = duplicateOf.get(l.key);
              const over = !isIn && l.row && l.qtyNum !== null && l.qtyNum > l.row.stock;
              return (
                <tr key={l.key} className={cn(over && "bg-neg-tint/40")}>
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
                    {over && <div className="form-error">Melebihi stock (tersisa {fmtInt(l.row!.stock)})</div>}
                  </td>
                  <td className="num text-grey-1">{l.row ? fmtInt(l.row.stock) : "—"}</td>
                  <td className="num">
                    <input
                      ref={(el) => {
                        qtyRefs.current.set(l.key, el);
                      }}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      className={cn("qty-input", ((submitted && l.skuId && !l.qtyNum) || over) && "error")}
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

      <ConfirmDialog
        open={confirmMinus}
        onOpenChange={setConfirmMinus}
        title="Stock akan menjadi minus"
        message={
          <>
            {overStock.length} SKU melebihi stock yang tercatat. Stock akan menjadi minus. Lanjutkan?
            <div className="mt-2 text-xs text-grey-1">
              Biasanya terjadi kalau data marketplace lebih cepat dari pencatatan barang masuk.
            </div>
          </>
        }
        confirmLabel="Ya, simpan"
        tone="neg"
        onConfirm={async () => {
          setConfirmMinus(false);
          await save(true);
        }}
      />
    </>
  );
}
