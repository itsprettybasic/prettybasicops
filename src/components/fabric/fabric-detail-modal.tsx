"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DocumentButton } from "@/components/print/document-viewer";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Info } from "@/components/po/po-detail-modal";
import { useAppData } from "@/components/providers/app-data";
import {
  deleteFabricShipment,
  getFabricShipment,
  setFabricReceived,
  type FabricShipmentDetail,
} from "@/app/actions/fabric";
import { fmtDate, fmtInt, fmtTime } from "@/lib/format";
import { fmtFabricQty, fmtUnitTotals, sumByUnit } from "@/lib/fabric";
import { FabricFormModal } from "./fabric-form-modal";

export function FabricDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const router = useRouter();
  const { today } = useAppData();
  const [sj, setSj] = useState<FabricShipmentDetail | null>(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [recvDate, setRecvDate] = useState(today);
  const [recvBy, setRecvBy] = useState("");
  const [busy, setBusy] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    let alive = true;
    getFabricShipment(id).then((res) => {
      if (!alive) return;
      if (res.ok) setSj(res.data);
      else {
        toast.error(res.error);
        onCloseRef.current();
      }
    });
    return () => {
      alive = false;
    };
  }, [id, reload]);

  const totalText = fmtUnitTotals(sumByUnit(sj?.lines ?? []));

  async function markReceived(on: boolean) {
    if (!sj) return;
    setBusy(true);
    const res = await setFabricReceived(sj.id, on ? { date: recvDate, by: recvBy } : null);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(on ? `${sj.sj_no} ditandai sudah diterima vendor` : `Tanda terima ${sj.sj_no} dibatalkan`);
    setReceiving(false);
    setReload((n) => n + 1);
    router.refresh();
  }

  async function doDelete() {
    if (!sj) return;
    const res = await deleteFabricShipment(sj.id);
    if (!res.ok) {
      toast.error(`Gagal menghapus: ${res.error}`);
      return;
    }
    toast.success(`${sj.sj_no} dihapus`);
    onClose();
    router.refresh();
  }

  return (
    <>
      <Modal
        open={!editing && !receiving}
        onOpenChange={(o) => !o && onClose()}
        wide
        eyebrow="Pengiriman Kain"
        title={sj?.sj_no ?? "Memuat..."}
        sub={
          sj && (
            <span className="inline-flex flex-wrap items-center gap-2">
              {sj.vendor.name} · {fmtInt(sj.lines.length)} baris · {totalText}
              <Badge tone={sj.status === "diterima" ? "pos" : "warn"}>
                {sj.status === "diterima" ? "Diterima Vendor" : "Dikirim"}
              </Badge>
            </span>
          )
        }
        footerLeft={
          sj && (
            <>
              <DocumentButton url={`/cetak/surat-jalan/${sj.id}`} fileName={sj.sj_no} title="Surat Jalan" label="Surat Jalan" />
              <Button onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button className="text-neg hover:border-neg" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Hapus
              </Button>
            </>
          )
        }
        footer={
          sj &&
          (sj.status === "dikirim" ? (
            <Button variant="pos" onClick={() => setReceiving(true)}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Tandai Diterima Vendor
            </Button>
          ) : (
            <Button loading={busy} onClick={() => markReceived(false)}>
              Batalkan Tanda Terima
            </Button>
          ))
        }
      >
        {!sj ? (
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
              <Info label="Tanggal Kirim">{fmtDate(sj.ship_date)}</Info>
              <Info label="Total Qty">
                <span className="num">{totalText}</span>
              </Info>
              <Info label="Diterima Vendor">
                {sj.status === "diterima" ? (
                  <>
                    {fmtDate(sj.received_date)}
                    {sj.received_by && <div className="text-[11.5px] font-medium text-grey-1">oleh {sj.received_by}</div>}
                  </>
                ) : (
                  <span className="text-warn">Belum</span>
                )}
              </Info>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-[10px] border border-line px-4 py-3 text-[12.5px] text-ink-3">
                <div className="mb-1 text-[10.5px] font-bold tracking-[0.08em] text-grey-1 uppercase">Vendor</div>
                <div className="font-semibold text-ink">{sj.vendor.name}</div>
                {(sj.vendor.contact_person || sj.vendor.phone) && (
                  <div>{[sj.vendor.contact_person, sj.vendor.phone].filter(Boolean).join(" · ")}</div>
                )}
                {sj.vendor.address && <div className="whitespace-pre-line">{sj.vendor.address}</div>}
                {sj.po_no && (
                  <div className="mt-1">
                    Untuk PO:{" "}
                    <a href={`/po?id=${sj.po_id}`} className="font-bold text-primary-2 hover:underline">
                      {sj.po_no}
                    </a>
                  </div>
                )}
              </div>
              <div className="rounded-[10px] border border-line px-4 py-3 text-[12.5px] text-ink-3">
                <div className="mb-1 text-[10.5px] font-bold tracking-[0.08em] text-grey-1 uppercase">Pengiriman</div>
                <div>Sopir / Kurir: {sj.driver_name ?? "—"}</div>
                <div>No. Kendaraan: {sj.vehicle_no ?? "—"}</div>
                {sj.note && <div className="mt-1 whitespace-pre-line">Catatan: {sj.note}</div>}
                <div className="mt-1.5 text-[11.5px] text-grey-1">
                  Dibuat {sj.created_by_name ?? "—"} · {fmtDate(sj.created_at)} {fmtTime(sj.created_at)}
                  {sj.updated_at && (
                    <>
                      {" "}
                      · Diubah {sj.updated_by_name ?? "—"} · {fmtDate(sj.updated_at)} {fmtTime(sj.updated_at)}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="sku-row-table min-w-[560px]">
                <thead>
                  <tr>
                    <th className="w-10">No</th>
                    <th>Jenis Kain</th>
                    <th>Warna</th>
                    <th className="num">Qty</th>
                    <th>Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {sj.lines.map((l) => (
                    <tr key={l.line_no}>
                      <td className="num text-grey-1">{l.line_no}</td>
                      <td className="font-semibold text-ink">{l.fabric_type}</td>
                      <td>{l.color}</td>
                      <td className="num font-semibold whitespace-nowrap">{fmtFabricQty(l.qty, l.unit)}</td>
                      <td className="text-ink-3">{l.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Total: {fmtInt(sj.lines.length)} baris</td>
                    <td className="num whitespace-nowrap">{totalText}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </Modal>

      {sj && editing && (
        <FabricFormModal
          shipment={sj}
          onClose={() => setEditing(false)}
          onSaved={() => setReload((n) => n + 1)}
        />
      )}

      {sj && (
        <Modal
          open={receiving}
          onOpenChange={setReceiving}
          size="sm"
          title="Tandai diterima vendor"
          footer={
            <>
              <Button onClick={() => setReceiving(false)}>Batal</Button>
              <Button variant="pos" loading={busy} onClick={() => markReceived(true)}>
                Simpan
              </Button>
            </>
          }
        >
          <div className="mb-4">
            <label className="form-label">Tanggal Diterima</label>
            <input
              type="date"
              className="form-input"
              value={recvDate}
              min={sj.ship_date}
              onChange={(e) => setRecvDate(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">Diterima oleh (opsional)</label>
            <input className="form-input" value={recvBy} onChange={(e) => setRecvBy(e.target.value)} placeholder="Nama penerima di vendor" />
          </div>
        </Modal>
      )}

      {sj && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Hapus pengiriman kain?"
          message={
            <>
              Surat jalan <strong>{sj.sj_no}</strong> ({totalText} ke {sj.vendor.name}) akan dihapus permanen.
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
