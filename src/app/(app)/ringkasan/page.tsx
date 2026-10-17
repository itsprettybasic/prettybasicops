import { PageHeader } from "@/components/layout/page-header";
import { RingkasanTable } from "@/components/ppic/ringkasan-table";

export const metadata = { title: "Ringkasan Produk · Pretty Basic" };

export default function RingkasanPage() {
  return (
    <div>
      <PageHeader title="Ringkasan per Produk" sub="Agregat semua warna & size per produk · Urut terlaris" />
      <RingkasanTable />
    </div>
  );
}
