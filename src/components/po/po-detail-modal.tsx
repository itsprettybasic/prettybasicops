"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DocumentButton } from "@/components/print/document-viewer";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SkuCell } from "@/components/ui/table-parts";
import { useAppData } from "@/components/providers/app-data";
import { DocumentDetailModal } from "@/components/stock/document-detail-modal";
import { cancelPo, deletePo, getPoDetail, markPoDone, reopenPo, sendPo, type PoDetail } from "@/app/actions/po";
import type { ActionResult } from "@/app/actions/stock";
import { poStatusDisplay } from "@/lib/constants";
import { fmtDate, fmtInt, fmtRupiah, fmtTime } from "@/lib/format";
import { daysBetween } from "@/lib/ppic";
import { cn } from "@/lib/cn";
import { PoFormModal } from "./po-form-modal";

type Confirm = "done" | "cancel" | "send" | "delete" | "reopen" | null;

export function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] bg-bg px-4 py-3">
      <div className="mb-1 text-[10.5px] font-bold tracking-[0.08em] text-grey-1 uppercase">{label}</div>
      <div className="text-[13.5px] font-semibold text-ink">{children}</div>
    </div>
  );
}

export function PoDetailModal({
  poId,
  open,
  onOpenChange,
}: {
  poId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { today, openStockModal } = useAppData();
  const [po, setPo] = useState<PoDetail | null>(null);
  const [reload, setReload] = useState(0);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [editing, setEditing] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  useEffect(() => {
    let alive = true;
    getPoDetail(poId).then((res) => {
      if (!alive) return;
      if (res.ok) setPo(res.data);
      else {
        toast.error(`Gagal memuat PO: ${res.error}`);
        onOpenChangeRef.current(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [poId, reload]);

  async function run(action: () => Promise<ActionResult>, success: string, close = false) {
    const res = await action();
    setConfirm(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(success);
    if (close) onOpenChange(false);
    else setReload((n) => n + 1);
    router.refresh();
  }

  const totals = po
    ? po.lines.reduce(
        (s, l) => ({
          qty: s.qty + l.qty,
          received: s.received + Math.min(l.qty_received, l.qty),
          remaining: s.remaining + Math.max(0, l.qty - l.qty_received),
          amount: s.amount + l.qty * (l.unit_price ?? 0),
        }),
        { qty: 0, received: 0, remaining: 0, amount: 0 },
      )
    : null;
  const hasPrice = po?.lines.some((l) => l.unit_price !== null) ?? false;
  const isOpenPo = po?.status === "draft" || po?.status === "open";
  const activeReceipts = po?.receipts.filter((r) => !r.voided_at) ?? [];
  const overdue = po && isOpenPo && po.expected_date ? daysBetween(today, po.expected_date) < 0 : false;
  const status = po ? poStatusDisplay(po.status, totals?.received ?? 0) : null;

  return (
    <>
      <Modal
        open={open && !editing && !receiptId}
        onOpenChange={onOpenChange}
        wide
        eyebrow="Purchase Order"
        title={po?.po_no ?? "Memuat..."}
        sub={
          po && (
            <span className="inline-flex flex-wrap items-center gap-2">
              {po.vendor.name} · {fmtInt(po.lines.length)} SKU · {fmtInt(totals?.qty)} pcs
              {status && <Badge tone={status.tone}>{status.label}</Badge>}
            </span>
          )
        }
        footerLeft={
          po && (
            <>
              <DocumentButton url={`/cetak/po/${po.id}`} fileName={po.po_no} title="Purchase Order" label="Dokumen PO" />
              {isOpenPo && (
                <Button onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              )}
              {isOpenPo && (
                <Button className="text-neg hover:border-neg" onClick={() => setConfirm("cancel")}>
                  Batalkan PO
                </Button>
              )}
              {activeReceipts.length === 0 && (
                <Button className="text-neg hover:border-neg" onClick={() => setConfirm("delete")}>
                  <Trash2 className="h-3.5 w-3.5" /> Hapus
                </Button>
              )}
            </>
          )
        }
        footer={
          po && (
            <>
              {po.status === "open" && (
                <>
                  <Button onClick={() => setConfirm("done")}>Tandai Selesai</Button>
                  <Button
                    variant="pos"
                    onClick={() => {
                      onOpenChange(false);
                      openStockModal({ direction: "in", type: "produksi", poId: po.id });
                    }}
                  >
                    Terima Barang
                  </Button>
                </>
              )}
              {po.status === "draft" && (
                <Button variant="blue" onClick={() => setConfirm("send")}>
                  Kirim PO
                </Button>
              )}
              {(po.status === "cancelled" || (po.status === "done" && totals && totals.remaining > 0)) && (
                <Button onClick={() => setConfirm("reopen")}>Buka Lagi</Button>
              )}
              {!isOpenPo && <Button onClick={() => onOpenChange(false)}>Tutup</Button>}
            </>
          )
        }
      >
        {!po ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-[62px]" />
              ))}
            </div>
            <div className="skeleton h-40" />
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Info label="Tanggal PO">{fmtDate(po.po_date)}</Info>
              <Info label="Tanggal Kedatangan">
                <span className={cn(overdue && "text-neg")}>{fmtDate(po.expected_date)}</span>
                {overdue && <span className="ml-1.5 text-[11.5px] font-medium text-neg">terlambat</span>}
              </Info>
              <Info label="Diterima">
                <span className="num">
                  {fmtInt(totals?.received)} / {fmtInt(totals?.qty)} pcs
                </span>
              </Info>
              <Info label={hasPrice ? "Nilai PO" : po.status === "done" ? "Selesai" : "Sisa"}>
                {hasPrice ? (
                  <span className="num">{fmtRupiah(totals?.amount)}</span>
                ) : po.status === "done" ? (
                  fmtDate(po.done_at)
                ) : (
                  <span className="num">{fmtInt(totals?.remaining)} pcs</span>
                )}
              </Info>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-[10px] border border-line px-4 py-3 text-[12.5px] text-ink-3">
                <div className="mb-1 text-[10.5px] font-bold tracking-[0.08em] text-grey-1 uppercase">Vendor</div>
                <div className="font-semibold text-ink">{po.vendor.name}</div>
                {(po.vendor.contact_person || po.vendor.phone) && (
                  <div>{[po.vendor.contact_person, po.vendor.phone].filter(Boolean).join(" · ")}</div>
                )}
                {po.vendor.address && <div className="whitespace-pre-line">{po.vendor.address}</div>}
              </div>
              <div className="rounded-[10px] border border-line px-4 py-3 text-[12.5px] text-ink-3">
                <div className="mb-1 text-[10.5px] font-bold tracking-[0.08em] text-grey-1 uppercase">Catatan</div>
                <div className="whitespace-pre-line">{po.note || <span className="text-grey-2">—</span>}</div>
                <div className="mt-1.5 text-[11.5px] text-grey-1">
                  Dibuat {po.created_by_name ?? "—"} · {fmtDate(po.created_at)} {fmtTime(po.created_at)}
                  {po.updated_at && (
                    <>
                      {" "}
                      · Diubah {po.updated_by_name ?? "—"} · {fmtDate(po.updated_at)} {fmtTime(po.updated_at)}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mb-2 text-[11px] font-bold tracking-[0.06em] text-grey-1 uppercase">SKU dalam PO</div>
            <div className="overflow-x-auto">
              <table className="sku-row-table min-w-[560px]">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th className="num w-[90px]">Dipesan</th>
                    {hasPrice && <th className="num w-[120px]">Harga/pcs</th>}
                    <th className="num w-[90px]">Diterima</th>
                    <th className="num w-[90px]">Sisa</th>
                  </tr>
                </thead>
                <tbody>
                  {po.lines.map((l) => {
                    const remaining = Math.max(0, l.qty - l.qty_received);
                    return (
                      <tr key={l.sku_id}>
                        <td>
                          <SkuCell label={l.label} code={l.code} />
                        </td>
                        <td className="num">{fmtInt(l.qty)}</td>
                        {hasPrice && <td className="num text-ink-3">{l.unit_price === null ? "—" : fmtRupiah(l.unit_price)}</td>}
                        <td className={cn("num", l.qty_received > 0 ? "text-pos" : "text-grey-2")}>{fmtInt(l.qty_received)}</td>
                        <td className={cn("num", remaining > 0 ? "font-semibold text-ink" : "text-grey-2")}>
                          {remaining > 0 ? fmtInt(remaining) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="text-grey-1">
                      Total: <span className="text-ink">{fmtInt(po.lines.length)} SKU</span>
                    </td>
                    <td className="num text-right">{fmtInt(totals?.qty)}</td>
                    {hasPrice && <td className="num text-right">{fmtRupiah(totals?.amount)}</td>}
                    <td className="num text-right">{fmtInt(totals?.received)}</td>
                    <td className="num text-right">{fmtInt(totals?.remaining)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-5 mb-2 text-[11px] font-bold tracking-[0.06em] text-grey-1 uppercase">
              Penerimaan Barang ({fmtInt(activeReceipts.length)})
            </div>
            {po.receipts.length === 0 ? (
              <div className="rounded-[10px] border border-dashed border-line px-4 py-4 text-center text-[12.5px] text-grey-1">
                Belum ada barang yang diterima dari PO ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table min-w-[520px]">
                  <thead>
                    <tr>
                      <th>No Penerimaan</th>
                      <th>Tanggal</th>
                      <th className="num">SKU</th>
                      <th className="num">Qty</th>
                      <th>Admin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.receipts.map((r) => (
                      <tr key={r.id} className={cn("clickable", r.voided_at && "text-grey-2")} onClick={() => setReceiptId(r.id)}>
                        <td>
                          <strong className={r.voided_at ? "text-grey-2" : "text-primary-2"}>{r.doc_no}</strong>
                          {r.voided_at && (
                            <Badge tone="neg" className="ml-2">
                              Dibatalkan
                            </Badge>
                          )}
                        </td>
                        <td>{fmtDate(r.doc_date)}</td>
                        <td className="num">{fmtInt(r.sku_count)}</td>
                        <td className="num">
                          <strong className={r.voided_at ? "line-through" : "text-pos"}>+{fmtInt(r.total_qty)}</strong>
                        </td>
                        <td>{r.created_by_name ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {po.status === "draft" && (
              <div className="mt-3 text-[12px] text-grey-1">
                Draft belum dihitung ke kolom Dalam PO di PPIC. Kirim PO untuk mulai menghitungnya.
              </div>
            )}
          </>
        )}
      </Modal>

      {po && editing && (
        <PoFormModal
          open
          onOpenChange={(o) => !o && setEditing(false)}
          po={po}
          onSaved={() => setReload((n) => n + 1)}
        />
      )}

      {receiptId && (
        <DocumentDetailModal
          key={receiptId}
          documentId={receiptId}
          open
          onOpenChange={(o) => {
            if (!o) {
              setReceiptId(null);
              setReload((n) => n + 1);
            }
          }}
        />
      )}

      {po && (
        <>
          <ConfirmDialog
            open={confirm === "done"}
            onOpenChange={(o) => !o && setConfirm(null)}
            title="Tandai PO selesai?"
            message={
              totals && totals.remaining > 0 ? (
                <>
                  Masih ada <strong>{fmtInt(totals.remaining)} pcs</strong> yang belum datang. Sisa ini dianggap batal dan
                  tidak lagi dihitung sebagai Dalam PO.
                </>
              ) : (
                "Semua SKU sudah diterima. PO akan ditandai selesai."
              )
            }
            confirmLabel="Tandai Selesai"
            onConfirm={() => run(() => markPoDone(po.id), `${po.po_no} ditandai selesai`)}
          />
          <ConfirmDialog
            open={confirm === "cancel"}
            onOpenChange={(o) => !o && setConfirm(null)}
            title="Batalkan PO?"
            message={
              <>
                PO <strong>{po.po_no}</strong> akan dibatalkan dan qty-nya tidak lagi dihitung sebagai Dalam PO. Barang yang
                sudah diterima tetap tercatat di stock.
              </>
            }
            confirmLabel="Ya, batalkan"
            tone="neg"
            onConfirm={() => run(() => cancelPo(po.id), `${po.po_no} dibatalkan`)}
          />
          <ConfirmDialog
            open={confirm === "send"}
            onOpenChange={(o) => !o && setConfirm(null)}
            title="Kirim PO ke vendor?"
            message={
              <>
                PO <strong>{po.po_no}</strong> ({fmtInt(totals?.qty)} pcs) akan berstatus Dipesan dan langsung dihitung ke
                kolom Dalam PO di PPIC.
              </>
            }
            confirmLabel="Kirim PO"
            onConfirm={() => run(() => sendPo(po.id), `${po.po_no} dikirim ke ${po.vendor.name}`)}
          />
          <ConfirmDialog
            open={confirm === "reopen"}
            onOpenChange={(o) => !o && setConfirm(null)}
            title="Buka lagi PO ini?"
            message={
              <>
                PO <strong>{po.po_no}</strong> kembali berstatus Dipesan, sehingga sisa barangnya bisa diterima lagi.
              </>
            }
            confirmLabel="Buka Lagi"
            onConfirm={() => run(() => reopenPo(po.id), `${po.po_no} dibuka lagi`)}
          />
          <ConfirmDialog
            open={confirm === "delete"}
            onOpenChange={(o) => !o && setConfirm(null)}
            title="Hapus PO ini?"
            message={
              <>
                PO <strong>{po.po_no}</strong> dan semua baris SKU-nya akan dihapus permanen. Tindakan ini tidak bisa
                dibatalkan.
              </>
            }
            confirmLabel="Hapus PO"
            tone="neg"
            onConfirm={() => run(() => deletePo(po.id), `${po.po_no} dihapus`, true)}
          />
        </>
      )}
    </>
  );
}
