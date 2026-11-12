import { getPoDetail } from "@/app/actions/po";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { DocError, DocHeader, DocTable, InfoGrid, NoteBox, Paper, PartyBox, PrintedAt, Signatures } from "@/components/print/doc-parts";
import { PO_STATUS_LABEL } from "@/lib/constants";
import { fmtDate, fmtInt, fmtRupiah } from "@/lib/format";
import { poName } from "@/lib/doc-names";

export const metadata = { title: "Purchase Order · Pretty Basic" };

export default async function PrintPoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getPoDetail(id);
  if (!res.ok) return <DocError message={res.error} />;
  const po = res.data;
  const hasPrice = po.lines.some((l) => l.unit_price !== null);
  const totalQty = po.lines.reduce((s, l) => s + l.qty, 0);
  const totalAmount = po.lines.reduce((s, l) => s + l.qty * (l.unit_price ?? 0), 0);

  const head = ["No", "Kode SKU", "Nama Produk", "Warna", "Size", "Qty (pcs)", ...(hasPrice ? ["Harga/pcs", "Jumlah"] : [])];
  const align: ("l" | "r")[] = ["r", "l", "l", "l", "l", "r", ...(hasPrice ? (["r", "r"] as const) : [])];

  return (
    <>
      <PrintToolbar fileName={poName({ vendor_name: po.vendor.name, batch: po.batch, po_date: po.po_date })} />
      <Paper>
        <DocHeader
          title="PURCHASE ORDER"
          number={po.po_no}
          status={po.status === "draft" ? "Draft" : po.status === "cancelled" ? PO_STATUS_LABEL.cancelled : undefined}
        />

        <div className="grid grid-cols-2 gap-5">
          <PartyBox
            label="Kepada (Vendor)"
            name={po.vendor.name}
            lines={[
              po.vendor.contact_person && `Up. ${po.vendor.contact_person}`,
              po.vendor.phone && `Telp/WA: ${po.vendor.phone}`,
              po.vendor.email,
              po.vendor.address,
            ]}
          />
          <InfoGrid
            rows={[
              ["No PO", po.po_no],
              ...(po.batch ? ([["Batch", po.batch]] as [string, string][]) : []),
              ["Tanggal PO", fmtDate(po.po_date)],
              ["Tanggal Kedatangan", fmtDate(po.expected_date)],
              ["Jumlah SKU", `${fmtInt(po.lines.length)} SKU`],
              ["Total Qty", `${fmtInt(totalQty)} pcs`],
            ]}
          />
        </div>

        <DocTable
          head={head}
          align={align}
          rows={po.lines.map((l, i) => [
            i + 1,
            l.code,
            l.product_name,
            l.color,
            l.size,
            fmtInt(l.qty),
            ...(hasPrice ? [l.unit_price === null ? "—" : fmtRupiah(l.unit_price), l.unit_price === null ? "—" : fmtRupiah(l.unit_price * l.qty)] : []),
          ])}
          foot={["", "", "", "", "Total", `${fmtInt(totalQty)} pcs`, ...(hasPrice ? ["", fmtRupiah(totalAmount)] : [])]}
        />

        <div className="mt-2 text-[11px] text-[#64748b]">Semua satuan dalam pcs.</div>
        <NoteBox label="Catatan" text={po.note} />

        <Signatures
          date={po.po_date}
          items={[{ label: "Dibuat oleh,", name: po.created_by_name }, { label: "Disetujui oleh," }, { label: "Vendor,", name: po.vendor.contact_person ?? po.vendor.name }]}
        />
        <PrintedAt />
      </Paper>
    </>
  );
}
