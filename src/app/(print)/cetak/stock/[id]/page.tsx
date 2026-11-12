import { getDocumentDetail } from "@/app/actions/stock";
import { createClient } from "@/lib/supabase/server";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { DocError, DocHeader, DocTable, InfoGrid, NoteBox, Paper, PrintedAt, Signatures } from "@/components/print/doc-parts";
import { CHANNEL_LABEL, TYPE_LABEL, TYPE_OPTION_LABEL, type MovementType, type SalesChannel } from "@/lib/constants";
import { fmtDate, fmtInt } from "@/lib/format";
import { stockDocName } from "@/lib/doc-names";

export const metadata = { title: "Bukti Barang Masuk / Keluar · Pretty Basic" };

type Line = { qty: number; product_name: string; label: string };

/** Ranking produk / SKU berdasarkan qty. */
function top<T extends Line>(lines: T[], key: (l: T) => string, n: number) {
  const m = new Map<string, number>();
  for (const l of lines) m.set(key(l), (m.get(key(l)) ?? 0) + l.qty);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

/** Rekap semua catatan (arah sama, tanggal sama, tidak dibatalkan, bukan transfer) per channel / tipe. */
async function dayRecap(date: string, direction: "in" | "out") {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_documents")
    .select("type, channel, stock_document_lines(qty, skus(product_id))")
    .eq("doc_date", date)
    .eq("direction", direction)
    .is("voided_at", null)
    .is("transfer_id", null);
  if (error) return null;
  const groups = new Map<string, { pcs: number; products: Set<string>; docs: number }>();
  for (const d of (data ?? []) as unknown as {
    type: MovementType;
    channel: SalesChannel | null;
    stock_document_lines: { qty: number; skus: { product_id: string } | null }[];
  }[]) {
    const key =
      d.type === "sales" && (d.channel === "shopee" || d.channel === "tiktok")
        ? CHANNEL_LABEL[d.channel]
        : d.type === "sales"
          ? "Sales lainnya"
          : TYPE_LABEL[d.type];
    const g = groups.get(key) ?? { pcs: 0, products: new Set<string>(), docs: 0 };
    g.docs++;
    for (const l of d.stock_document_lines) {
      g.pcs += Math.abs(Number(l.qty));
      if (l.skus) g.products.add(l.skus.product_id);
    }
    groups.set(key, g);
  }
  const order = ["Shopee", "TikTok Shop", "Sales lainnya"];
  return [...groups.entries()].sort(
    (a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99) || b[1].pcs - a[1].pcs,
  );
}

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${strong ? "border-[#7F0010] bg-[#fdf2f3]" : "border-[#e2e8f0]"}`}>
      <div className="text-[9.5px] font-bold tracking-[0.08em] text-[#64748b] uppercase">{label}</div>
      <div className="mt-0.5 text-[15px] font-extrabold">{value}</div>
      {sub && <div className="text-[10px] text-[#64748b]">{sub}</div>}
    </div>
  );
}

export default async function PrintStockDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getDocumentDetail(id);
  if (!res.ok) return <DocError message={res.error} />;
  const doc = res.data;
  if (doc.transfer_id) return <DocError message="Catatan ini bagian dari Transfer Stock." />;
  const isIn = doc.direction === "in";
  const total = doc.lines.reduce((s, l) => s + Math.abs(l.qty), 0);
  const typeLabel = TYPE_OPTION_LABEL[doc.type];
  const channel = doc.channel ? CHANNEL_LABEL[doc.channel] : null;
  const lines = doc.lines.map((l) => ({ ...l, qty: Math.abs(l.qty) }));
  const productCount = new Set(lines.map((l) => l.product_name)).size;
  const topProducts = top(lines, (l) => l.product_name, 5);
  const topSkus = top(lines, (l) => l.label, 5);
  const recap = await dayRecap(doc.doc_date, doc.direction);
  const recapTotal = recap?.reduce((s, [, g]) => s + g.pcs, 0) ?? 0;
  const isSales = doc.type === "sales";

  return (
    <>
      <PrintToolbar
        fileName={stockDocName({ direction: doc.direction, type_label: typeLabel, channel_label: channel, doc_date: doc.doc_date, doc_no: doc.doc_no })}
      />
      <Paper>
        <DocHeader
          title={isIn ? "BUKTI BARANG MASUK" : "BUKTI BARANG KELUAR"}
          number={doc.doc_no}
          status={doc.voided_at ? "Dibatalkan" : undefined}
        />

        <div className="mb-1 max-w-[60%]">
          <InfoGrid
            rows={[
              ["No Catatan", doc.doc_no],
              ["Tanggal", fmtDate(doc.doc_date)],
              ["Tipe", typeLabel],
              ...(channel ? [["Channel", channel] as [string, string]] : []),
              ...(doc.po_no ? [["No PO", doc.po_no] as [string, string]] : []),
              ["Gudang", doc.warehouse_name ?? "—"],
              ["Total", `${fmtInt(total)} pcs · ${fmtInt(doc.lines.length)} SKU`],
            ]}
          />
        </div>

        {/* Highlight */}
        <div className="mt-4 mb-2 break-inside-avoid">
          <div className="mb-2 text-[11px] font-bold tracking-[0.08em] text-[#7F0010] uppercase">Highlight</div>
          <div className="grid grid-cols-3 gap-2">
            <Stat strong label="Catatan ini" value={`${fmtInt(total)} pcs`} sub={channel ?? typeLabel} />
            <Stat label="Jumlah produk" value={`${fmtInt(productCount)} produk`} sub={`${fmtInt(lines.length)} SKU`} />
            <Stat
              label={isSales ? "Produk paling laku" : "Produk terbanyak"}
              value={topProducts[0]?.[0] ?? "—"}
              sub={topProducts[0] ? `${fmtInt(topProducts[0][1])} pcs` : undefined}
            />
          </div>

          {recap && recap.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-[10.5px] font-semibold text-[#334155]">
                Rekap semua barang {isIn ? "masuk" : "keluar"} tanggal {fmtDate(doc.doc_date)} · {fmtInt(recapTotal)} pcs
              </div>
              <div className="grid grid-cols-4 gap-2">
                {recap.map(([k, g]) => (
                  <Stat
                    key={k}
                    strong={k === (doc.type === "sales" && (doc.channel === "shopee" || doc.channel === "tiktok") ? channel : doc.type === "sales" ? "Sales lainnya" : TYPE_LABEL[doc.type])}
                    label={k}
                    value={`${fmtInt(g.pcs)} pcs`}
                    sub={`${fmtInt(g.products.size)} produk · ${fmtInt(g.docs)} catatan`}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <div className="mb-1 text-[10.5px] font-semibold text-[#334155]">Top 5 produk</div>
              <table className="w-full">
                <tbody>
                  {topProducts.map(([name, q], i) => (
                    <tr key={name} className="border-b border-[#f1f5f9]">
                      <td className="w-5 py-[3px] text-[#94a3b8]">{i + 1}</td>
                      <td className="py-[3px]">{name}</td>
                      <td className="py-[3px] text-right font-semibold">{fmtInt(q)} pcs</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <div className="mb-1 text-[10.5px] font-semibold text-[#334155]">Top 5 SKU (warna & size)</div>
              <table className="w-full">
                <tbody>
                  {topSkus.map(([name, q], i) => (
                    <tr key={name} className="border-b border-[#f1f5f9]">
                      <td className="w-5 py-[3px] text-[#94a3b8]">{i + 1}</td>
                      <td className="py-[3px]">{name}</td>
                      <td className="py-[3px] text-right font-semibold">{fmtInt(q)} pcs</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <DocTable
          head={["No", "Kode SKU", "Nama Produk", "Warna", "Size", "Qty (pcs)"]}
          align={["r", "l", "l", "l", "l", "r"]}
          rows={lines.map((l, i) => [i + 1, l.code, l.product_name, l.color, l.size, fmtInt(l.qty)])}
          foot={["", "", "", "", "Total", `${fmtInt(total)} pcs`]}
        />

        <NoteBox label="Catatan" text={doc.note} />
        {doc.voided_at && <NoteBox label="Dibatalkan" text={doc.void_reason} />}

        <Signatures
          date={doc.doc_date}
          items={[{ label: "Dicatat oleh,", name: doc.created_by_name }, { label: "Diperiksa oleh," }]}
        />
        <PrintedAt />
      </Paper>
    </>
  );
}
