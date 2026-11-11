import type { Metadata } from "next";
import { getDocumentHistory } from "@/lib/data/documents";
import { DocumentHistory } from "@/components/stock/document-history";

export const metadata: Metadata = { title: "Penerimaan Barang · Pretty Basic" };

export default async function PenerimaanPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const data = await getDocumentHistory("in", { from, to }, { type: "produksi" });
  return <DocumentHistory data={data} receipts />;
}
