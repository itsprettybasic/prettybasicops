import { getFabricShipment } from "@/app/actions/fabric";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { DocError, DocHeader, DocTable, InfoGrid, NoteBox, Paper, PartyBox, PrintedAt, Signatures } from "@/components/print/doc-parts";
import { fmtDate } from "@/lib/format";
import { SHIPMENT_UNIT_LABEL, fmtUnitTotals, sumByUnit } from "@/lib/fabric";

export const metadata = { title: "Surat Jalan · Pretty Basic" };

export default async function PrintSuratJalanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getFabricShipment(id);
  if (!res.ok) return <DocError message={res.error} />;
  const sj = res.data;
  const qtyFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

  return (
    <>
      <PrintToolbar fileName={sj.sj_no} />
      <Paper>
        <DocHeader title="SURAT JALAN" number={sj.sj_no} />

        <div className="grid grid-cols-2 gap-5">
          <PartyBox
            label="Kepada (Vendor)"
            name={sj.vendor.name}
            lines={[sj.vendor.contact_person && `Up. ${sj.vendor.contact_person}`, sj.vendor.phone && `Telp/WA: ${sj.vendor.phone}`, sj.vendor.address]}
          />
          <InfoGrid
            rows={[
              ["No Surat Jalan", sj.sj_no],
              ["Tanggal Kirim", fmtDate(sj.ship_date)],
              ["Untuk PO", sj.po_no ?? "—"],
              ["Sopir / Kurir", sj.driver_name ?? "—"],
              ["No. Kendaraan", sj.vehicle_no ?? "—"],
            ]}
          />
        </div>

        <div className="mt-4 text-[#334155]">Bersama ini kami kirimkan kain dengan rincian sebagai berikut:</div>

        <DocTable
          head={["No", "Jenis Kain", "Warna", "Qty", "Satuan", "Keterangan"]}
          align={["r", "l", "l", "r", "l", "l"]}
          rows={sj.lines.map((l) => [l.line_no, l.fabric_type, l.color, qtyFmt.format(l.qty), SHIPMENT_UNIT_LABEL[l.unit] ?? l.unit, l.note ?? ""])}
          foot={["", "Total", "", fmtUnitTotals(sumByUnit(sj.lines)), "", ""]}
        />

        <NoteBox label="Catatan" text={sj.note} />
        <div className="mt-3 text-[11px] text-[#64748b]">
          Mohon diperiksa dan ditandatangani saat barang diterima. Lembar ini menjadi bukti pengiriman kain.
        </div>

        <Signatures
          date={sj.ship_date}
          items={[
            { label: "Pengirim,", name: sj.created_by_name },
            { label: "Sopir / Kurir,", name: sj.driver_name },
            { label: "Penerima (Vendor),", name: sj.received_by },
          ]}
        />
        <PrintedAt />
      </Paper>
    </>
  );
}
