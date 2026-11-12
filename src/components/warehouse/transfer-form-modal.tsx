"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { useAppData } from "@/components/providers/app-data";
import { useWarehouseStock } from "@/components/stock/use-warehouse-stock";
import { saveTransfer, type TransferDetail } from "@/app/actions/warehouses";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/cn";

interface Line {
  key: number;
  skuId: string | null;
  qty: string;
}

let lineKey = 0;
const newLine = (skuId: string | null = null, qty = ""): Line => ({ key: ++lineKey, skuId, qty });

export function TransferFormModal({
  open,
  onOpenChange,
  edit,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Mode edit: transfer yang diubah */
  edit?: TransferDetail;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { today, skuOptions: activeSkuOptions, warehouses, activeWarehouses, defaultWarehouseId } = useAppData();
  const [date, setDate] = useState(edit?.transfer_date ?? today);
  const [fromId, setFromId] = useState<string | null>(edit?.from_warehouse_id ?? defaultWarehouseId);
  const [toId, setToId] = useState<string | null>(
    edit?.to_warehouse_id ?? activeWarehouses.find((w) => w.id !== defaultWarehouseId)?.id ?? null,
  );
  const [note, setNote] = useState(edit?.note ?? "");
  const [lines, setLines] = useState<Line[]>(() =>
    edit ? edit.lines.map((l) => newLine(l.sku_id, String(l.qty))) : [newLine()],
  );
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const fromStock = useWarehouseStock(fromId);
  const toStock = useWarehouseStock(toId);

  const comboRefs = useRef(new Map<number, HTMLInputElement | null>());
  const qtyRefs = useRef(new Map<number, HTMLInputElement | null>());
  const focusNext = useRef<{ key: number; field: "sku" | "qty" } | null>(null);
  useEffect(() => {
    const t = focusNext.current;
    if (!t) return;
    focusNext.current = null;
    (t.field === "sku" ? comboRefs.current.get(t.key) : qtyRefs.current.get(t.key))?.focus();
  });

  // Gudang nonaktif tetap muncul kalau dipakai transfer yang diedit
  const whOptions = (keep: string | undefined): ComboOption[] =>
    warehouses
      .filter((w) => w.is_active || w.id === keep)
      .map((w) => ({ value: w.id, label: w.name, sublabel: w.is_default ? "Gudang utama" : w.is_active ? undefined : "Nonaktif" }));

  const skuOptions = useMemo<ComboOption[]>(() => {
    const opts = activeSkuOptions.map((o) => ({ ...o, right: undefined }));
    if (!edit) return opts;
    const known = new Set(opts.map((o) => o.value));
    return [
      ...opts,
      ...edit.lines.filter((l) => !known.has(l.sku_id)).map((l) => ({ value: l.sku_id, label: l.label, sublabel: l.code })),
    ];
  }, [activeSkuOptions, edit]);

  // Saat edit: stock "sebelum transfer ini" = stock sekarang dikoreksi qty asli (kalau gudangnya sama)
  const orig = useMemo(() => new Map((edit?.lines ?? []).map((l) => [l.sku_id, l.qty])), [edit]);
  const before = (map: Record<string, number> | null, whId: string | null, skuId: string, side: "from" | "to") => {
    if (!map) return null;
    let v = map[skuId] ?? 0;
    if (edit && side === "from" && whId === edit.from_warehouse_id) v += orig.get(skuId) ?? 0;
    if (edit && side === "to" && whId === edit.to_warehouse_id) v -= orig.get(skuId) ?? 0;
    return v;
  };

  const parsed = lines.map((l) => {
    const n = Number(l.qty);
    return { ...l, qtyNum: Number.isInteger(n) && n > 0 ? n : null };
  });
  const filled = parsed.filter((l) => l.skuId && l.qtyNum);
  const totalQty = filled.reduce((s, l) => s + l.qtyNum!, 0);
  const dupKeys = useMemo(() => {
    const seen = new Set<string>();
    const dup = new Set<number>();
    for (const l of lines) {
      if (!l.skuId) continue;
      if (seen.has(l.skuId)) dup.add(l.key);
      seen.add(l.skuId);
    }
    return dup;
  }, [lines]);

  const errors: string[] = [];
  if (!fromId || !toId) errors.push("Pilih gudang asal dan tujuan.");
  else if (fromId === toId) errors.push("Gudang asal dan tujuan harus berbeda.");
  if (!date) errors.push("Tanggal wajib diisi.");
  if (filled.length === 0) errors.push("Isi minimal 1 SKU dengan qty.");
  if (parsed.some((l) => l.skuId && !l.qtyNum)) errors.push("Qty harus bilangan bulat lebih dari 0.");
  if (parsed.some((l) => !l.skuId && l.qty)) errors.push("Ada baris yang SKU-nya belum dipilih.");
  if (dupKeys.size > 0) errors.push("Ada SKU duplikat — gabungkan dulu.");

  const updateLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  function addLine() {
    const l = newLine();
    focusNext.current = { key: l.key, field: "sku" };
    setLines((ls) => [...ls, l]);
  }
  const removeLine = (key: number) => setLines((ls) => (ls.length <= 1 ? [newLine()] : ls.filter((l) => l.key !== key)));

  async function save() {
    setSubmitted(true);
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    setSaving(true);
    const res = await saveTransfer({
      id: edit?.id ?? null,
      transfer_date: date,
      from_warehouse_id: fromId!,
      to_warehouse_id: toId!,
      note,
      lines: filled.map((l) => ({ sku_id: l.skuId!, qty: l.qtyNum! })),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(`Gagal menyimpan: ${res.error}`);
      return;
    }
    const fromName = warehouses.find((w) => w.id === fromId)?.name;
    const toName = warehouses.find((w) => w.id === toId)?.name;
    toast.success(`${edit ? `${edit.transfer_no} diperbarui` : "Transfer tersimpan"} · ${fmtInt(totalQty)} pcs ${fromName} → ${toName}`);
    onOpenChange(false);
    onSaved?.();
    router.refresh();
  }

  const fromName = warehouses.find((w) => w.id === fromId)?.name ?? "asal";
  const toName = warehouses.find((w) => w.id === toId)?.name ?? "tujuan";

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      wide
      eyebrow="Transfer Stock"
      title={edit ? `Ubah ${edit.transfer_no}` : "Transfer Stock Antar Gudang"}
      sub="Stock gudang asal berkurang, stock gudang tujuan bertambah dengan qty yang sama"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Batal</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {edit ? "Simpan Perubahan" : "Simpan Transfer"}
          </Button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_1fr_170px]">
        <div>
          <label className="form-label">Dari gudang</label>
          <Combobox
            options={whOptions(edit?.from_warehouse_id)}
            value={fromId}
            onChange={(v) => v && setFromId(v)}
            invalid={submitted && (!fromId || fromId === toId)}
            placeholder="Pilih gudang asal..."
          />
        </div>
        <div className="hidden pb-2.5 text-grey-2 sm:block">
          <ArrowRight className="h-4 w-4" />
        </div>
        <div>
          <label className="form-label">Ke gudang</label>
          <Combobox
            options={whOptions(edit?.to_warehouse_id)}
            value={toId}
            onChange={(v) => v && setToId(v)}
            invalid={submitted && (!toId || fromId === toId)}
            placeholder="Pilih gudang tujuan..."
          />
        </div>
        <div>
          <label className="form-label">Tanggal</label>
          <input type="date" className="form-input" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      {activeWarehouses.length < 2 && !edit && (
        <div className="mb-4 rounded-lg bg-warn-tint px-3 py-2 text-[12.5px] text-warn-text">
          Baru ada 1 gudang aktif. Tambah gudang dulu di menu Stock per Gudang.
        </div>
      )}

      <div className="mb-4">
        <label className="form-label">Catatan (opsional)</label>
        <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mis. Kirim stock untuk toko" />
      </div>

      <table className="sku-row-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th className="num w-[120px]">Stock {fromName}</th>
            <th className="num w-[120px]">Stock {toName}</th>
            <th className="num w-[110px]">Qty (pcs)</th>
            <th className="w-9" />
          </tr>
        </thead>
        <tbody>
          {parsed.map((l, i) => {
            const fs = l.skuId ? before(fromStock, fromId, l.skuId, "from") : null;
            const ts = l.skuId ? before(toStock, toId, l.skuId, "to") : null;
            const afterFrom = fs !== null && l.qtyNum ? fs - l.qtyNum : null;
            return (
              <tr key={l.key}>
                <td>
                  <Combobox
                    size="sm"
                    options={skuOptions}
                    value={l.skuId}
                    onChange={(v) => updateLine(l.key, { skuId: v })}
                    placeholder="Ketik untuk cari SKU..."
                    invalid={(submitted && !l.skuId && !!l.qty) || dupKeys.has(l.key)}
                    inputRef={(el) => {
                      comboRefs.current.set(l.key, el);
                    }}
                    onEnterAfterSelect={() => {
                      focusNext.current = { key: l.key, field: "qty" };
                    }}
                  />
                  {dupKeys.has(l.key) && <div className="form-error">SKU sudah ada di baris lain</div>}
                  {afterFrom !== null && afterFrom < 0 && (
                    <div className="mt-0.5 text-[11px] font-semibold text-warn">
                      Stock {fromName} jadi {fmtInt(afterFrom)} (minus tetap boleh)
                    </div>
                  )}
                </td>
                <td className="num text-grey-1">{fs === null ? (l.skuId ? "…" : "—") : fmtInt(fs)}</td>
                <td className="num text-grey-1">{ts === null ? (l.skuId ? "…" : "—") : fmtInt(ts)}</td>
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
            <td colSpan={5} className="!py-2">
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
            <td colSpan={3} className="text-grey-1">
              Total: <span className="text-ink">{filled.length} SKU</span>
            </td>
            <td className="num pr-[10px] text-right">
              <span className="text-primary-2">{fmtInt(totalQty)} pcs</span>
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
