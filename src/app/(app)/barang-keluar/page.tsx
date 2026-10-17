import type { Metadata } from "next";
import { getDocumentHistory } from "@/lib/data/documents";
import { DocumentHistory } from "@/components/stock/document-history";

export const metadata: Metadata = { title: "Barang Keluar · Pretty Basic" };

export default async function BarangKeluarPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const data = await getDocumentHistory("out", { from, to });
  return <DocumentHistory data={data} />;
}
