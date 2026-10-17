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
import { getDocumentDetail, voidStockDocument, type DocumentDetail } from "@/app/actions/stock";
import { CHANNEL_LABEL, TYPE_LABEL, TYPE_OPTION_LABEL, TYPE_TONE } from "@/lib/constants";
import { fmtDate, fmtDateLong, fmtInt, fmtSigned, fmtTime } from "@/lib/format";

function SourceLabel({ source }: { source: string }) {
  return <>{source === "excel" ? "Upload Excel" : source === "seed" ? "Import awal" : "Manual"}</>;
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
  }, [documentId]);

  const isIn = doc?.direction === "in";
  const totalQty = doc?.lines.reduce((s, l) => s + l.qty, 0) ?? 0;
  const voided = !!doc?.voided_at;

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
        open={open}
        onOpenChange={onOpenChange}
        eyebrow={doc ? (isIn ? "Barang Masuk" : "Barang Keluar") : undefined}
        title={doc ? doc.doc_no : "Detail Catatan"}
        sub={doc ? fmtDateLong(doc.doc_date) : undefined}
        footerLeft={
          doc && !voided ? (
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
            <div className="grid grid-cols-4 gap-4">
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

            <div className="mb-5 grid grid-cols-4 gap-x-6 gap-y-4 rounded-[10px] border border-line bg-bg px-5 py-4">
              <Field label="Tipe">
                <span className="inline-flex items-center gap-2">
                  <Badge tone={voided ? "grey" : TYPE_TONE[doc.type]}>{TYPE_LABEL[doc.type]}</Badge>
                  <span className="truncate text-[12px] text-grey-1">{TYPE_OPTION_LABEL[doc.type]}</span>
                </span>
              </Field>
              <Field label={isIn ? "Ref Batch" : "Channel"}>
                {isIn ? (
                  doc.batch_no ? (
                    <strong className="text-primary-2">{doc.batch_no}</strong>
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
              <div className="col-span-4">
                <Field label="Catatan">{doc.note || <span className="text-grey-2">—</span>}</Field>
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
