/**
 * Hapus data demo (produk kategori 'demo', dokumen source 'seed', batch note 'seed-demo').
 * Hanya jalan jika ALLOW_RESET=true dan butuh SUPABASE_SERVICE_ROLE_KEY (tidak ada policy delete untuk user biasa).
 * Alternatif tanpa service key: jalankan supabase/reset-demo.sql di SQL Editor.
 */
import { scriptClient } from "./lib";

async function main() {
  if (process.env.ALLOW_RESET !== "true") {
    console.error("✗ Diblokir. Jalankan dengan ALLOW_RESET=true untuk menghapus data demo.");
    process.exit(1);
  }
  const { supabase } = await scriptClient({ requireServiceRole: true });

  const { data: products } = await supabase.from("products").select("id").eq("category", "demo");
  const productIds = (products ?? []).map((p) => p.id);
  const { data: skus } = productIds.length
    ? await supabase.from("skus").select("id").in("product_id", productIds)
    : { data: [] as { id: string }[] };
  const skuIds = (skus ?? []).map((s) => s.id);

  const steps: [string, () => PromiseLike<{ error: { message: string } | null }>][] = [
    ["dokumen seed", () => supabase.from("stock_documents").delete().eq("source", "seed")],
    ["batch demo", () => supabase.from("production_batches").delete().eq("note", "seed-demo")],
  ];
  if (skuIds.length) {
    steps.push(["baris SKU demo", () => supabase.from("stock_document_lines").delete().in("sku_id", skuIds)]);
    steps.push(["baris batch SKU demo", () => supabase.from("production_batch_lines").delete().in("sku_id", skuIds)]);
    steps.push(["SKU demo", () => supabase.from("skus").delete().in("id", skuIds)]);
  }
  if (productIds.length) steps.push(["produk demo", () => supabase.from("products").delete().in("id", productIds)]);

  for (const [label, run] of steps) {
    const { error } = await run();
    if (error) throw new Error(`Gagal hapus ${label}: ${error.message}`);
    console.log(`  ✓ ${label} dihapus`);
  }
  console.log("✓ Data demo dihapus.");
}

main().catch((e) => {
  console.error("✗", e.message ?? e);
  process.exit(1);
});
