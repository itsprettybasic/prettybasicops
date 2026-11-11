import { getDocumentDetail } from "@/app/actions/stock";
import { getPoDetail } from "@/app/actions/po";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { DocError, DocHeader, DocTable, InfoGrid, NoteBox, Paper, PartyBox, PrintedAt, Signatures } from "@/components/print/doc-parts";
import { fmtDate, fmtInt } from "@/lib/format";

export const metadata = { title: "Bukti Penerimaan Barang · Pretty Basic" };

export default async function PrintReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getDocumentDetail(id);
  if (!res.ok) return <DocError message={res.error} />;
  const doc = res.data;
  if (doc.type !== "produksi") return <DocError message="Dokumen ini bukan Penerimaan Barang." />;
  const poRes = doc.po_id ? await getPoDetail(doc.po_id) : null;
  const po = poRes?.ok ? poRes.data : null;
  const ordered = new Map(po?.lines.map((l) => [l.sku_id, l]) ?? []);
  const total = doc.lines.reduce((s, l) => s + l.qty, 0);

  return (
    <>
      <PrintToolbar fileName={`Penerimaan ${doc.doc_no}`} />
      <Paper>
        <DocHeader title="BUKTI PENERIMAAN BARANG" number={doc.doc_no} status={doc.voided_at ? "Dibatalkan" : undefined} />

        <div className="grid grid-cols-2 gap-5">
          {po ? (
            <PartyBox
              label="Dari (Vendor)"
              name={po.vendor.name}
              lines={[po.vendor.contact_person && `Up. ${po.vendor.contact_person}`, po.vendor.phone && `Telp/WA: ${po.vendor.phone}`, po.vendor.address]}
            />
          ) : (
            <PartyBox label="Dari (Vendor)" name={doc.vendor_name ?? "—"} lines={[]} />
          )}
          <InfoGrid
            rows={[
              ["No Penerimaan", doc.doc_no],
              ["Tanggal Terima", fmtDate(doc.doc_date)],
              ["No PO", doc.po_no ?? "—"],
              ["Tanggal PO", po ? fmtDate(po.po_date) : "—"],
              ["Total Diterima", `${fmtInt(total)} pcs`],
            ]}
          />
        </div>

        <DocTable
          head={["No", "Kode SKU", "Nama Produk", "Warna", "Size", "Qty PO", "Diterima (pcs)"]}
          align={["r", "l", "l", "l", "l", "r", "r"]}
          rows={doc.lines.map((l, i) => [
            i + 1,
            l.code,
            l.product_name,
            l.color,
            l.size,
            ordered.has(l.sku_id) ? fmtInt(ordered.get(l.sku_id)!.qty) : "—",
            fmtInt(l.qty),
          ])}
          foot={["", "", "", "", "", "Total", `${fmtInt(total)} pcs`]}
        />

        <NoteBox label="Catatan" text={doc.note} />
        {doc.voided_at && <NoteBox label="Dibatalkan" text={doc.void_reason} />}

        <Signatures
          date={doc.doc_date}
          items={[{ label: "Diserahkan oleh (Vendor),", name: po?.vendor.contact_person }, { label: "Diterima oleh,", name: doc.created_by_name }, { label: "Diperiksa oleh," }]}
        />
        <PrintedAt />
      </Paper>
    </>
  );
}
