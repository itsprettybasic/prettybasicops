import { PageHeader } from "@/components/layout/page-header";
import { MasterSkuTable } from "@/components/ppic/master-sku-table";
import { getSkus, type SkuInfo } from "@/lib/data/ppic";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Master SKU · Pretty Basic" };

export default async function MasterSkuPage() {
  const supabase = await createClient();
  let skus: SkuInfo[] = [];
  let loadError: string | null = null;
  try {
    skus = await getSkus({ includeInactive: true });
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
  const { data: productRows } = await supabase.from("products").select("name").order("name");
  const products = [...new Set([...(productRows ?? []).map((p) => p.name as string), ...skus.map((s) => s.product_name)])]
    .filter((n) => n && n !== "—")
    .sort((a, b) => a.localeCompare(b, "id"));

  return (
    <div>
      <PageHeader title="Master SKU" sub="Daftar produk × warna × size · SKU nonaktif tidak dihitung di PPIC" />
      <MasterSkuTable skus={skus} products={products} loadError={loadError} />
    </div>
  );
}
