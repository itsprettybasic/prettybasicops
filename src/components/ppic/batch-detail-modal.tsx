"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SkuCell } from "@/components/ui/table-parts";
import { useAppData } from "@/components/providers/app-data";
import {
  cancelBatch,
  getBatchDetail,
  markBatchDone,
  sendDraftBatch,
  type BatchDetail,
} from "@/app/actions/batch";
import type { ActionResult } from "@/app/actions/stock";
import { BATCH_STATUS_LABEL, BATCH_STATUS_TONE } from "@/lib/constants";
import { HEADER_FILL, downloadWorkbook } from "@/lib/excel/download";
import { fmtDate, fmtInt } from "@/lib/format";
import { daysBetween } from "@/lib/ppic";
import { cn } from "@/lib/cn";

type Confirm = "done" | "cancel" | "send" | null;

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] bg-bg px-4 py-3">
      <div className="mb-1 text-[10.5px] font-bold tracking-[0.08em] text-grey-1 uppercase">{label}</div>
      <div className="text-[13.5px] font-semibold text-ink">{children}</div>
    </div>
  );
}

async function exportSuratOrder(b: BatchDetail) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pretty Basic PPIC";
  const ws = wb.addWorksheet("Surat Order");
  ws.columns = [{ width: 6 }, { width: 28 }, { width: 30 }, { width: 18 }, { width: 12 }, { width: 12 }];

  ws.addRow(["SURAT ORDER PRODUKSI"]).font = { bold: true, size: 14 };
  ws.mergeCells(1, 1, 1, 6);
  ws.addRow(["Pretty Basic"]).font = { color: { argb: "FF64748B" } };
  ws.addRow([]);
  const info: [string, string][] = [
    ["No Batch", b.batch_no],
    ["Konveksi", b.konveksi_name],
    ["Tanggal Kirim", fmtDate(b.sent_date)],
    ["Estimasi Selesai", fmtDate(b.est_done_date)],
    ["Catatan", b.note ?? "—"],
  ];
  for (const [k, v] of info) {
    const r = ws.addRow([k, "", v]);
    r.getCell(1).font = { bold: true };
    ws.mergeCells(r.number, 1, r.number, 2);
    ws.mergeCells(r.number, 3, r.number, 6);
  }
  ws.addRow([]);

  const header = ws.addRow(["No", "Kode SKU", "Produk", "Warna", "Size", "Qty (pcs)"]);
  header.font = { bold: true, color: { argb: "FF0F172A" } };
  header.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    c.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
  });
  b.lines.forEach((l, i) => {
    const r = ws.addRow([i + 1, l.code, l.product_name, l.color, l.size, l.qty_planned]);
    r.getCell(6).numFmt = "#,##0";
  });
  const total = ws.addRow(["", "", "", "", "Total", b.lines.reduce((s, l) => s + l.qty_planned, 0)]);
  total.font = { bold: true };
  total.getCell(6).numFmt = "#,##0";

  await downloadWorkbook(wb, `surat-order-${b.batch_no}.xlsx`);
}

export function BatchDetailModal({
  batchId,
  today,
  open,
  onOpenChange,
}: {
  batchId: string;
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { openStockModal } = useAppData();
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [reload, setReload] = useState(0);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [exporting, setExporting] = useState(false);
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  useEffect(() => {
    let alive = true;
    getBatchDetail(batchId).then((res) => {
      if (!alive) return;
      if (res.ok) setBatch(res.data);
      else {
        toast.error(`Gagal memuat batch: ${res.error}`);
        onOpenChangeRef.current(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [batchId, reload]);

  async function run(action: () => Promise<ActionResult>, success: string) {
    const res = await action();
    setConfirm(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(success);
    setReload((n) => n + 1);
    router.refresh();
  }

  async function doExport() {
    if (!batch) return;
    setExporting(true);
    try {
      await exportSuratOrder(batch);
    } catch (e) {
      toast.error(`Gagal export: ${e instanceof Error ? e.message : "terjadi kesalahan"}`);
    } finally {
      setExporting(false);
    }
  }

  const totals = batch
    ? batch.lines.reduce(
        (s, l) => ({
          planned: s.planned + l.qty_planned,
          received: s.received + Math.min(l.qty_received, l.qty_planned),
          remaining: s.remaining + Math.max(0, l.qty_planned - l.qty_received),
        }),
        { planned: 0, received: 0, remaining: 0 },
      )
    : null;
  const isOpenBatch = batch?.status === "draft" || batch?.status === "in_production";
  const overdue = batch && isOpenBatch && batch.est_done_date ? daysBetween(today, batch.est_done_date) < 0 : false;

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        wide
        eyebrow="Batch Produksi"
        title={batch?.batch_no ?? "Memuat..."}
        sub={
          batch && (
            <span className="inline-flex items-center gap-2">
              {batch.konveksi_name} · {fmtInt(batch.lines.length)} SKU · {fmtInt(totals?.planned)} pcs
              <Badge tone={BATCH_STATUS_TONE[batch.status]}>{BATCH_STATUS_LABEL[batch.status]}</Badge>
            </span>
          )
        }
        footerLeft={
          batch && (
            <>
              <Button onClick={doExport} loading={exporting}>
                <Download className="h-3.5 w-3.5" /> Export Surat Order
              </Button>
              {isOpenBatch && (
                <Button className="text-neg hover:border-neg" onClick={() => setConfirm("cancel")}>
                  Batalkan
                </Button>
              )}
            </>
          )
        }
        footer={
          batch && (
            <>
              {batch.status === "in_production" && (
                <>
                  <Button onClick={() => setConfirm("done")}>Tandai Selesai</Button>
                  <Button
                    variant="pos"
                    onClick={() => {
                      onOpenChange(false);
                      openStockModal({ direction: "in", type: "produksi", batchId: batch.id });
                    }}
                  >
                    Terima Barang
                  </Button>
                </>
              )}
              {batch.status === "draft" && (
                <Button variant="blue" onClick={() => setConfirm("send")}>
                  Kirim ke Konveksi
                </Button>
              )}
              {!isOpenBatch && <Button onClick={() => onOpenChange(false)}>Tutup</Button>}
            </>
          )
        }
      >
        {!batch ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-[62px]" />
              ))}
            </div>
            <div className="skeleton h-40" />
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <Info label="Tanggal Kirim">{fmtDate(batch.sent_date)}</Info>
              <Info label="Est. Selesai">
                <span className={cn(overdue && "text-neg")}>{fmtDate(batch.est_done_date)}</span>
                {overdue && <span className="ml-1.5 text-[11.5px] font-medium text-neg">terlambat</span>}
              </Info>
              <Info label="Diterima">
                <span className="num">
                  {fmtInt(totals?.received)} / {fmtInt(totals?.planned)} pcs
                </span>
              </Info>
              <Info label={batch.status === "done" ? "Selesai" : "Sisa"}>
                {batch.status === "done" ? (
                  fmtDate(batch.done_at)
                ) : (
                  <span className="num">{fmtInt(totals?.remaining)} pcs</span>
                )}
              </Info>
            </div>

            {batch.note && (
              <div className="mb-4 rounded-[10px] border border-line px-4 py-3 text-[12.5px] text-ink-3">
                <span className="font-semibold text-ink-2">Catatan untuk konveksi:</span> {batch.note}
              </div>
            )}

            <table className="sku-row-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th className="num w-[100px]">Rencana</th>
                  <th className="num w-[100px]">Diterima</th>
                  <th className="num w-[100px]">Sisa</th>
                </tr>
              </thead>
              <tbody>
                {batch.lines.map((l) => {
                  const remaining = Math.max(0, l.qty_planned - l.qty_received);
                  return (
                    <tr key={l.sku_id}>
                      <td>
                        <SkuCell label={l.label} code={l.code} />
                      </td>
                      <td className="num">{fmtInt(l.qty_planned)}</td>
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
                    Total: <span className="text-ink">{fmtInt(batch.lines.length)} SKU</span>
                  </td>
                  <td className="num text-right">{fmtInt(totals?.planned)}</td>
                  <td className="num text-right">{fmtInt(totals?.received)}</td>
                  <td className="num text-right">{fmtInt(totals?.remaining)}</td>
                </tr>
              </tfoot>
            </table>

            {batch.status === "draft" && (
              <div className="mt-3 text-[12px] text-grey-1">
                Draft belum dihitung ke kolom Produksi di PPIC. Kirim ke konveksi untuk mulai menghitungnya.
              </div>
            )}
          </>
        )}
      </Modal>

      {batch && (
        <>
          <ConfirmDialog
            open={confirm === "done"}
            onOpenChange={(o) => !o && setConfirm(null)}
            title="Tandai batch selesai?"
            message={
              totals && totals.remaining > 0 ? (
                <>
                  Masih ada <strong>{fmtInt(totals.remaining)} pcs</strong> yang belum diterima. Sisa ini dianggap batal dan
                  tidak lagi dihitung sebagai sedang diproduksi.
                </>
              ) : (
                "Semua SKU sudah diterima. Batch akan ditandai selesai."
              )
            }
            confirmLabel="Tandai Selesai"
            onConfirm={() => run(() => markBatchDone(batch.id), `${batch.batch_no} ditandai selesai`)}
          />
          <ConfirmDialog
            open={confirm === "cancel"}
            onOpenChange={(o) => !o && setConfirm(null)}
            title="Batalkan batch?"
            message={
              <>
                Batch <strong>{batch.batch_no}</strong> akan dibatalkan dan qty-nya tidak lagi dihitung sebagai sedang
                diproduksi. Barang yang sudah diterima tetap tercatat di stock.
              </>
            }
            confirmLabel="Ya, batalkan"
            tone="neg"
            onConfirm={() => run(() => cancelBatch(batch.id), `${batch.batch_no} dibatalkan`)}
          />
          <ConfirmDialog
            open={confirm === "send"}
            onOpenChange={(o) => !o && setConfirm(null)}
            title="Kirim ke konveksi?"
            message={
              <>
                Batch <strong>{batch.batch_no}</strong> ({fmtInt(totals?.planned)} pcs) akan berstatus Diproduksi dan langsung
                dihitung ke kolom Produksi di PPIC.
              </>
            }
            confirmLabel="Kirim ke Konveksi"
            onConfirm={() => run(() => sendDraftBatch(batch.id), `${batch.batch_no} dikirim ke ${batch.konveksi_name}`)}
          />
        </>
      )}
    </>
  );
}
