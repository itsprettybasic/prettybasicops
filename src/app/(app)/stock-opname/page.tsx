import { PageHeader } from "@/components/layout/page-header";
import { StockOpname, type LastOpname } from "@/components/stock/stock-opname";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Stock Opname · Pretty Basic" };

export default async function StockOpnamePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_documents")
    .select("doc_date, created_at, created_by_name")
    .eq("source", "opname")
    .is("voided_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div>
      <PageHeader title="Stock Opname" sub="Isi hasil hitung fisik · stock di sistem otomatis disesuaikan" />
      <StockOpname lastOpname={(data as LastOpname | null) ?? null} />
    </div>
  );
}
