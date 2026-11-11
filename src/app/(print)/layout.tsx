import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/profile";

/** Halaman dokumen cetak (PO, Bukti Penerimaan, Surat Jalan) — tanpa menu samping, khusus admin. */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (current.profile?.role !== "admin") redirect("/packing");
  return <div className="min-h-screen bg-[#e9edf2] print:bg-white">{children}</div>;
}
