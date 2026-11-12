"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DocumentButton } from "@/components/print/document-viewer";
import { receiptName, stockDocName } from "@/lib/doc-names";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InfoBanner } from "@/components/ui/info-banner";
import { SkuCell } from "@/components/ui/table-parts";
import { useAppData } from "@/components/providers/app-data";
import { deleteStockDocument, getDocumentDetail, type DocumentDetail } from "@/app/actions/stock";
import { ReceiptEditModal } from "@/components/po/receipt-edit-modal";
import { StockDocumentModal } from "@/components/stock/stock-document-modal";
import { Pencil, Trash2 } from "lucide-react";
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

/**
 * Modal detail satu catatan stock: info header, semua SKU & qty, tombol Edit & Hapus (semua tipe).
 * `initialAction` = langsung buka form edit / konfirmasi hapus (dari tombol di baris tabel).
 */
export function DocumentDetailModal({
  documentId,
  open,
  onOpenChange,
  initialAction,
}: {
  documentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAction?: "edit" | "delete";
}) {
  const router = useRouter();
  const { rowById, openSkuDetail, warehouses } = useAppData();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(initialAction === "delete");
  const [editing, setEditing] = useState(initialAction === "edit");
  // Dibuka langsung ke edit/hapus dari tabel → setelah selesai/batal, tutup semuanya
  const direct = initialAction !== undefined;
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
    const res = await deleteStockDocument(doc.id);
    if (!res.ok) {
      toast.error(`Gagal menghapus: ${res.error}`);
      return;
    }
    toast.success(`${doc.doc_no} dihapus · stock sudah disesuaikan`);
    setConfirmDelete(false);
    onOpenChange(false);
    router.refresh();
  }

  function closeEdit() {
    setEditing(false);
    if (direct) onOpenChange(false);
  }

  function closeDelete(o: boolean) {
    setConfirmDelete(o);
    if (!o && direct) onOpenChange(false);
  }

  return (
    <>
      <Modal
        open={open && !editing && !(direct && confirmDelete)}
        onOpenChange={onOpenChange}
        eyebrow={doc ? (isReceipt ? "Penerimaan Barang" : isIn ? "Barang Masuk" : "Barang Keluar") : undefined}
        title={doc ? doc.doc_no : "Detail Catatan"}
        sub={doc ? fmtDateLong(doc.doc_date) : undefined}
        footerLeft={
          doc ? (
            <>
              {isReceipt && (
              <DocumentButton url={`/cetak/penerimaan/${doc.id}`} fileName={receiptName({ vendor_name: doc.vendor_name, batch: doc.po_batch, doc_date: doc.doc_date })} title="Bukti Penerimaan" label="Bukti Penerimaan" />
              )}
              {!isReceipt && (
                <DocumentButton
                  url={`/cetak/stock/${doc.id}`}
                  fileName={stockDocName({ direction: doc.direction, type_label: TYPE_OPTION_LABEL[doc.type], channel_label: doc.channel ? CHANNEL_LABEL[doc.channel] : null, doc_date: doc.doc_date, doc_no: doc.doc_no })}
                  title={isIn ? "Bukti Barang Masuk" : "Bukti Barang Keluar"}
                  label="Dokumen"
                />
              )}
              <Button onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button className="text-neg hover:border-neg" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Hapus
              </Button>
            </>
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
              {warehouses.length > 1 && <Field label="Gudang">{doc.warehouse_name ?? "—"}</Field>}
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
          onClose={closeEdit}
          onSaved={() => {
            closeEdit();
            setReload((n) => n + 1);
            router.refresh();
          }}
        />
      )}

      {doc && !isReceipt && editing && (
        <StockDocumentModal
          open
          onOpenChange={(o) => !o && closeEdit()}
          preset={{ direction: doc.direction }}
          editDoc={doc}
          onSaved={() => {
            closeEdit();
            setReload((n) => n + 1);
          }}
        />
      )}

      {doc && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={closeDelete}
          title="Hapus catatan ini?"
          message={
            <>
              <strong>{doc.doc_no}</strong> ({TYPE_LABEL[doc.type]} · {fmtInt(doc.lines.length)} SKU ·{" "}
              {fmtSigned(isIn ? totalQty : -totalQty)} pcs) akan dihapus permanen.{" "}
              {voided
                ? "Catatan ini sudah dibatalkan, jadi stock tidak berubah."
                : isIn
                ? "Stock SKU-nya dikurangi lagi."
                : "Stock SKU-nya dikembalikan."}
              {doc.po_no ? (
                <>
                  {" "}
                  Sisa di PO <strong>{doc.po_no}</strong> kembali terbuka.
                </>
              ) : null}
              {doc.source === "opname" && !voided && (
                <div className="mt-2 rounded-lg bg-warn-tint px-3 py-2 text-[12px] font-semibold text-warn-text">
                  Ini hasil Stock Opname. Kalau dihapus, stock SKU-nya kembali ke angka sebelum opname.
                </div>
              )}
              <div className="mt-2 text-xs text-grey-1">Salinannya tetap bisa dilihat di &quot;Riwayat dihapus&quot;.</div>
            </>
          }
          confirmLabel="Hapus"
          tone="neg"
          onConfirm={doDelete}
        />
      )}
    </>
  );
}
