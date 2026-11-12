"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyRow, SkuCell } from "@/components/ui/table-parts";
import { CHANNEL_LABEL, TYPE_LABEL } from "@/lib/constants";
import { fmtDate, fmtInt, fmtSigned, fmtTime } from "@/lib/format";
import type { DeletedDocument } from "@/lib/data/documents";

/** Daftar catatan yang sudah dihapus: siapa yang menghapus, kapan, dan isi catatannya. Hanya untuk dilihat. */
export function DeletedDocumentsModal({
  open,
  onOpenChange,
  items,
  isIn,
  from,
  to,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: DeletedDocument[];
  isIn: boolean;
  from: string;
  to: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const signed = (qty: number) => fmtSigned(isIn ? qty : -qty);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      wide
      eyebrow={isIn ? "Barang Masuk" : "Barang Keluar"}
      title="Riwayat Catatan Dihapus"
      sub={`Tanggal catatan ${fmtDate(from)} – ${fmtDate(to)} · Klik baris untuk lihat SKU`}
      footer={<Button onClick={() => onOpenChange(false)}>Tutup</Button>}
    >
      <div className="max-h-[60vh] overflow-y-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>No Catatan</th>
              <th>Tanggal</th>
              <th>Tipe</th>
              <th className="num">Total Qty</th>
              <th>Dihapus oleh</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <EmptyRow colSpan={5}>Tidak ada catatan yang dihapus di periode ini.</EmptyRow>
            ) : (
              items.map((d) => {
                const isOpen = expanded === d.id;
                return (
                  <Fragment key={d.id}>
                    <tr className="clickable" onClick={() => setExpanded(isOpen ? null : d.id)}>
                      <td className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-grey-1" /> : <ChevronRight className="h-3.5 w-3.5 text-grey-1" />}
                          <span className="num text-[12.5px] font-semibold text-ink-2">{d.doc_no}</span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap">{fmtDate(d.doc_date)}</td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="grey">{TYPE_LABEL[d.type]}</Badge>
                          {d.channel && <span className="text-[12px] text-grey-1">{CHANNEL_LABEL[d.channel]}</span>}
                          {d.po_no && <span className="text-[12px] text-grey-1">{d.po_no}</span>}
                        </div>
                      </td>
                      <td className="num">
                        <strong className="text-grey-1">{signed(d.total_qty)}</strong>
                        <div className="text-[11.5px] text-grey-2">{fmtInt(d.sku_count)} SKU</div>
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="text-ink-2">{d.deleted_by_name ?? "—"}</div>
                        <div className="num text-[11.5px] text-grey-1">
                          {fmtDate(d.deleted_at)} {fmtTime(d.deleted_at)}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={5} className="!bg-bg">
                          <div className="mb-2 text-[12px] text-grey-1">
                            Dibuat {d.created_by_name ?? "—"}
                            {d.created_at && ` · ${fmtDate(d.created_at)} ${fmtTime(d.created_at)}`}
                            {d.voided_at && " · sudah dibatalkan sebelum dihapus"}
                            {d.note && (
                              <>
                                {" "}
                                · Catatan: <span className="text-ink-2">{d.note}</span>
                              </>
                            )}
                          </div>
                          <table className="sku-row-table">
                            <tbody>
                              {d.lines.map((l) => (
                                <tr key={l.sku_id}>
                                  <td>
                                    <SkuCell label={l.label} code={l.code} />
                                  </td>
                                  <td className="num w-[100px]">{signed(l.qty)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
