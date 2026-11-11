"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InfoBanner } from "@/components/ui/info-banner";
import { SkuCell } from "@/components/ui/table-parts";
import { useAppData } from "@/components/providers/app-data";
import { deleteReceipt, getDocumentDetail, voidStockDocument, type DocumentDetail } from "@/app/actions/stock";
import { ReceiptEditModal } from "@/components/po/receipt-edit-modal";
import { Pencil, Printer, Trash2 } from "lucide-react";
import { CHANNEL_LABEL, TYPE_LABEL, TYPE_OPTION_LABEL, TYPE_TONE } from "@/lib/constants";
import { fmtDate, fmtDateLong, fmtInt, fmtSigned, fmtTime } from "@/lib/format";

function SourceLabel({ source }: { source: string }) {
  return <>{source === "excel" ? "Upload Excel" : source === "seed" ? "Import awal" : source === "opname" ? "Stock Opname" : "Manual"}</>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="form-label !mb-1">{label}</div>
      <div className="text-[13px] font-medium text-ink-2">{children}</div>
    </div>
  );
}

/** Modal detail satu catatan stock: info header, semua SKU & qty, dan tombol Batalkan Catatan (void). */
export function DocumentDetailModal({
  documentId,
  open,
  onOpenChange,
}: {
  documentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { rowById, openSkuDetail } = useAppData();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    getDocumentDetail(documentId).then((res) => {
      if (!alive) return;
      if (res.ok) setDoc(res.data);
      else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, [documentId, reload]);

  const isIn = doc?.direction === "in";
  const totalQty = doc?.lines.reduce((s, l) => s + l.qty, 0) ?? 0;
  const voided = !!doc?.voided_at;
  const isReceipt = doc?.type === "produksi";

  async function doDelete() {
    if (!doc) return;
    const res = await deleteReceipt(doc.id);
    if (!res.ok) {
      toast.error(`Gagal menghapus: ${res.error}`);
      return;
    }
    toast.success(`Penerimaan ${doc.doc_no} dihapus · stock dikurangi lagi`);
    setConfirmDelete(false);
    onOpenChange(false);
    router.refresh();
  }

  async function doVoid(reason: string) {
    if (!doc) return;
    const res = await voidStockDocument(doc.id, reason);
    if (!res.ok) {
      toast.error(`Gagal membatalkan: ${res.error}`);
      return;
    }
    toast.success(`Catatan ${doc.doc_no} dibatalkan · stock dikembalikan`);
    setConfirmVoid(false);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <>
      <Modal
        open={open && !editing}
        onOpenChange={onOpenChange}
        eyebrow={doc ? (isReceipt ? "Penerimaan Barang" : isIn ? "Barang Masuk" : "Barang Keluar") : undefined}
        title={doc ? doc.doc_no : "Detail Catatan"}
        sub={doc ? fmtDateLong(doc.doc_date) : undefined}
        footerLeft={
          doc && isReceipt ? (
            <>
              <a
                href={`/cetak/penerimaan/${doc.id}`}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-line bg-white px-4 py-[9px] text-[13px] font-semibold text-ink-2 hover:border-grey-3"
              >
                <Printer className="h-3.5 w-3.5" /> Bukti Penerimaan
              </a>
              {!voided && (
                <Button onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              )}
              <Button className="text-neg hover:border-neg" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Hapus
              </Button>
            </>
          ) : doc && !voided ? (
            <Button className="text-neg hover:border-neg" onClick={() => setConfirmVoid(true)}>
              Batalkan Catatan
            </Button>
          ) : undefined
        }
        footer={<Button onClick={() => onOpenChange(false)}>Tutup</Button>}
      >
        {error ? (
          <InfoBanner variant="warn" head="Gagal memuat">
            {error}
          </InfoBanner>
        ) : !doc ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-9" />
              ))}
            </div>
            <div className="skeleton h-40" />
          </div>
        ) : (
          <>
            {voided && (
              <InfoBanner variant="warn" head="Catatan dibatalkan">
                Dibatalkan {fmtDate(doc.voided_at)} pukul {fmtTime(doc.voided_at!)}. Alasan:{" "}
                <strong>{doc.void_reason || "—"}</strong>
                <div className="text-[11.5px] text-grey-1">Qty di catatan ini tidak dihitung ke stock.</div>
              </InfoBanner>
            )}

            <div className="mb-5 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 rounded-[10px] border border-line bg-bg px-5 py-4">
              <Field label="Tipe">
                <span className="inline-flex items-center gap-2">
                  <Badge tone={voided ? "grey" : TYPE_TONE[doc.type]}>{TYPE_LABEL[doc.type]}</Badge>
                  {TYPE_OPTION_LABEL[doc.type] !== TYPE_LABEL[doc.type] && (
                    <span className="truncate text-[12px] text-grey-1">{TYPE_OPTION_LABEL[doc.type]}</span>
                  )}
                </span>
              </Field>
              <Field label={isIn ? "No PO / Vendor" : "Channel"}>
                {isIn ? (
                  doc.po_no ? (
                    <>
                      <a href={`/po?id=${doc.po_id}`} className="font-bold text-primary-2 hover:underline">
                        {doc.po_no}
                      </a>
                      {doc.vendor_name && <div className="truncate text-[12px] text-grey-1">{doc.vendor_name}</div>}
                    </>
                  ) : (
                    "—"
                  )
                ) : doc.channel ? (
                  CHANNEL_LABEL[doc.channel]
                ) : (
                  "—"
                )}
              </Field>
              <Field label="Admin">
                {doc.created_by_name ?? "—"}
                <span className="num ml-1.5 text-[12px] text-grey-1">
                  {fmtDate(doc.created_at)} {fmtTime(doc.created_at)}
                </span>
              </Field>
              <Field label="Sumber">
                <SourceLabel source={doc.source} />
              </Field>
              <div className="col-span-2 md:col-span-4">
                <Field label="Catatan">{doc.note || <span className="text-grey-2">—</span>}</Field>
                {doc.updated_at && (
                  <div className="mt-1 text-[11.5px] text-grey-1">
                    Diubah {doc.updated_by_name ?? "—"} · {fmtDate(doc.updated_at)} {fmtTime(doc.updated_at)}
                  </div>
                )}
              </div>
            </div>

            <div className="text-[11px] font-bold tracking-[0.06em] text-grey-1 uppercase">SKU dalam Catatan</div>
            <div className="max-h-[46vh] overflow-y-auto">
              <table className="sku-row-table">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>SKU</th>
                    <th className="num">Stock Sekarang</th>
                    <th className="num">Qty (pcs)</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.lines.map((l, i) => {
                    const row = rowById.get(l.sku_id);
                    return (
                      <tr key={l.sku_id}>
                        <td className="num text-grey-2">{i + 1}</td>
                        <td>
                          {row ? (
                            <button
                              type="button"
                              className="cursor-pointer text-left hover:[&_div:first-child]:text-primary-2"
                              onClick={() => {
                                onOpenChange(false);
                                openSkuDetail(l.sku_id);
                              }}
                            >
                              <SkuCell label={l.label} code={l.code} />
                            </button>
                          ) : (
                            <SkuCell label={l.label} code={l.code} />
                          )}
                        </td>
                        <td className="num text-grey-1">{row ? fmtInt(row.stock) : "—"}</td>
                        <td className="num">
                          <strong className={voided ? "text-grey-2 line-through" : isIn ? "text-pos" : "text-neg"}>
                            {fmtSigned(isIn ? l.qty : -l.qty)}
                          </strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Total: {fmtInt(doc.lines.length)} SKU</td>
                    <td className="num">
                      <span className={voided ? "text-grey-2 line-through" : isIn ? "text-pos" : "text-neg"}>
                        {fmtSigned(isIn ? totalQty : -totalQty)} pcs
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </Modal>

      {doc && isReceipt && editing && (
        <ReceiptEditModal
          doc={doc}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setReload((n) => n + 1);
            router.refresh();
          }}
        />
      )}

      {doc && isReceipt && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Hapus penerimaan ini?"
          message={
            <>
              Penerimaan <strong>{doc.doc_no}</strong> ({fmtInt(doc.lines.length)} SKU · {fmtInt(totalQty)} pcs) akan dihapus
              permanen. Stock dikurangi lagi{doc.po_no ? <> dan sisa di PO <strong>{doc.po_no}</strong> kembali terbuka</> : null}.
            </>
          }
          confirmLabel="Hapus Penerimaan"
          tone="neg"
          onConfirm={doDelete}
        />
      )}

      {doc && (
        <ConfirmDialog
          open={confirmVoid}
          onOpenChange={setConfirmVoid}
          title="Batalkan catatan ini?"
          message={
            <>
              Catatan <strong>{doc.doc_no}</strong> ({fmtInt(doc.lines.length)} SKU · {fmtSigned(isIn ? totalQty : -totalQty)}{" "}
              pcs) akan dibatalkan dan stock dikembalikan. Riwayat tetap tersimpan sebagai &quot;Dibatalkan&quot;.
            </>
          }
          confirmLabel="Batalkan Catatan"
          tone="neg"
          requireReason
          reasonLabel="Alasan pembatalan"
          onConfirm={doVoid}
        />
      )}
    </>
  );
}
