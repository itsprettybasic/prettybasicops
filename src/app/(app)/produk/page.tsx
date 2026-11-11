import { PageHeader } from "@/components/layout/page-header";
import { ProductTable, type ProductRow } from "@/components/ppic/product-table";
import { getSkus, type SkuInfo } from "@/lib/data/ppic";
import { fetchAll } from "@/lib/data/fetch-all";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Database Produk · Pretty Basic" };

export default async function ProdukPage() {
  const supabase = await createClient();
  let products: ProductRow[] = [];
  let skus: SkuInfo[] = [];
  let loadError: string | null = null;
  try {
    const [rows, skuRows] = await Promise.all([
      fetchAll<ProductRow>(() =>
        supabase
          .from("products")
          .select("id, name, category, is_active, created_at, fabric_type, fabric_unit, fabric_qty, fabric_pcs")
          .order("name"),
      ),
      getSkus({ includeInactive: true }),
    ]);
    // Kolom numeric datang sebagai teks dari PostgREST
    products = rows.map((p) => ({
      ...p,
      fabric_qty: p.fabric_qty === null ? null : Number(p.fabric_qty),
      fabric_pcs: p.fabric_pcs === null ? null : Number(p.fabric_pcs),
    }));
    skus = skuRows;
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <PageHeader title="Database Produk" sub="Daftar semua produk · Produk nonaktif beserta SKU-nya tidak dihitung di PPIC" />
      <ProductTable products={products} skus={skus} loadError={loadError} />
    </div>
  );
}
