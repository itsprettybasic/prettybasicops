import { PageHeader } from "@/components/layout/page-header";
import { WarehouseStock } from "@/components/warehouse/warehouse-stock";
import { getSkus, type SkuInfo } from "@/lib/data/ppic";
import { getWarehouseStock } from "@/lib/data/warehouses";

export const metadata = { title: "Stock per Gudang · Pretty Basic" };

export default async function GudangPage() {
  let skus: SkuInfo[] = [];
  let stock: Record<string, Record<string, number>> = {};
  let loadError: string | null = null;
  try {
    [skus, stock] = await Promise.all([getSkus({ includeInactive: true }), getWarehouseStock()]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
  return (
    <div>
      <PageHeader title="Stock per Gudang" sub="Cek stock setiap gudang, tambah gudang, dan pindahkan stock lewat Transfer Stock" />
      <WarehouseStock skus={skus} stock={stock} loadError={loadError} />
    </div>
  );
}
