"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { InfoBanner } from "@/components/ui/info-banner";
import { SkuCell } from "@/components/ui/table-parts";
import { useAppData } from "@/components/providers/app-data";
import { getOpenPos, updateReceipt, type DocumentDetail, type OpenPo } from "@/app/actions/stock";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/cn";

interface Row {
  skuId: string;
  label: string;
  code: string;
  /** Qty di PO (null = SKU tidak ada di PO) */
  ordered: number | null;
  /** Diterima dari penerimaan LAIN untuk PO ini */
  otherReceived: number;
  qty: string;
}

/** Ubah Penerimaan Barang: tanggal, catatan, dan qty per SKU (kosong / 0 = tidak diterima). */
export function ReceiptEditModal({
  doc,
  onClose,
  onSaved,
}: {
  doc: DocumentDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { today, rowById } = useAppData();
  const [date, setDate] = useState(doc.doc_date);
  const [note, setNote] = useState(doc.note ?? "");
  const [po, setPo] = useState<OpenPo | null | undefined>(doc.po_id ? undefined : null);
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(doc.lines.map((l) => [l.sku_id, String(l.qty)])),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!doc.po_id) return;
    let alive = true;
    getOpenPos(doc.po_id).then((res) => {
      if (!alive) return;
      if (res.ok) setPo(res.data.find((p) => p.id === doc.po_id) ?? null);
      else {
        toast.error(`Gagal memuat PO: ${res.error}`);
        setPo(null);
      }
    });
    return () => {
      alive = false;
    };
  }, [doc.po_id]);

  const rows = useMemo<Row[]>(() => {
    const thisQty = new Map(doc.lines.map((l) => [l.sku_id, l.qty]));
    const out: Row[] = [];
    const seen = new Set<string>();
    for (const l of po?.lines ?? []) {
      const r = rowById.get(l.sku_id);
      const docLine = doc.lines.find((d) => d.sku_id === l.sku_id);
      out.push({
        skuId: l.sku_id,
        label: docLine?.label ?? r?.label ?? "SKU tidak aktif",
        code: docLine?.code ?? r?.code ?? "—",
        ordered: l.qty,
        otherReceived: l.received - (thisQty.get(l.sku_id) ?? 0),
        qty: "",
      });
      seen.add(l.sku_id);
    }
    for (const l of doc.lines) {
      if (seen.has(l.sku_id)) continue;
      out.push({ skuId: l.sku_id, label: l.label, code: l.code, ordered: null, otherReceived: 0, qty: "" });
    }
    return out;
  }, [po, doc.lines, rowById]);

  const parsed = rows.map((r) => {
    const raw = qty[r.skuId] ?? "";
    const n = Number(raw);
    const valid = raw === "" || (Number.isInteger(n) && n >= 0);
    const num = valid && raw !== "" ? n : 0;
    const remaining = r.ordered === null ? null : Math.max(0, r.ordered - r.otherReceived);
    return { ...r, raw, valid, num, remaining, over: remaining !== null && num > remaining };
  });
  const filled = parsed.filter((r) => r.num > 0);
  const total = filled.reduce((s, r) => s + r.num, 0);
  const invalid = parsed.some((r) => !r.valid);

  async function save() {
    if (invalid) {
      toast.error("Qty harus bilangan bulat ≥ 0");
      return;
    }
    if (filled.length === 0) {
      toast.error("Isi minimal 1 SKU. Kalau mau mengosongkan penerimaan, hapus saja dokumennya.");
      return;
    }
    if (!date) {
      toast.error("Tanggal wajib diisi");
      return;
    }
    setSaving(true);
    const res = await updateReceipt({
      id: doc.id,
      doc_date: date,
      note: note.trim() || null,
      lines: filled.map((r) => ({ sku_id: r.skuId, qty: r.num })),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(`Gagal menyimpan: ${res.error}`);
      return;
    }
    toast.success(`Penerimaan ${doc.doc_no} diperbarui · ${fmtInt(total)} pcs`);
    onSaved();
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      wide
      eyebrow="Penerimaan Barang"
      title={`Ubah ${doc.doc_no}`}
      sub={doc.po_no ? `${doc.po_no} · ${doc.vendor_name ?? ""}` : undefined}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button variant="pos" loading={saving} onClick={save}>
            Simpan Perubahan
          </Button>
        </>
      }
    >
      <InfoBanner head="Stock ikut berubah">
        Qty baru langsung menggantikan qty lama di stock dan Riwayat Mutasi. Status PO menyesuaikan otomatis.
      </InfoBanner>

      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
        <div className="mb-4">
          <label className="form-label">Tanggal Terima</label>
          <input type="date" className="form-input" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="mb-4 sm:col-span-2">
          <label className="form-label">Catatan (opsional)</label>
          <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </div>
      </div>

      {po === undefined ? (
        <div className="skeleton h-40" />
      ) : (
        <div className="overflow-x-auto">
          <table className="sku-row-table min-w-[560px]">
            <thead>
              <tr>
                <th>SKU</th>
                <th className="num w-[90px]">Dipesan</th>
                <th className="num w-[110px]">Sisa PO</th>
                <th className="num w-[120px]">Diterima (pcs)</th>
              </tr>
            </thead>
            <tbody>
              {parsed.map((r) => (
                <tr key={r.skuId}>
                  <td>
                    <SkuCell label={r.label} code={r.code} />
                    {r.over && <div className="text-[11px] font-semibold text-warn">Melebihi sisa PO</div>}
                  </td>
                  <td className="num text-grey-1">{r.ordered === null ? "—" : fmtInt(r.ordered)}</td>
                  <td className="num text-grey-1">{r.remaining === null ? "—" : fmtInt(r.remaining)}</td>
                  <td className="num">
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="0"
                      className={cn("qty-input", !r.valid && "error")}
                      value={r.raw}
                      onChange={(e) => setQty((q) => ({ ...q, [r.skuId]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total: {fmtInt(filled.length)} SKU</td>
                <td className="num pr-[10px] text-right text-pos">+{fmtInt(total)} pcs</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Modal>
  );
}
