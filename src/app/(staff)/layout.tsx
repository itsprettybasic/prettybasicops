import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/data/profile";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

/** Layout halaman yang bisa dibuka semua role (Packing, ganti password). */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const { profile } = current;

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <div className="w-full max-w-[400px] rounded-2xl border border-line bg-white p-8 text-center">
          <div className="text-[17px] font-bold text-ink">Akun belum punya akses</div>
          <p className="mt-2 text-[13px] text-grey-1">Akun ini nonaktif atau belum diberi role. Hubungi admin.</p>
          <form action={signOut} className="mt-5">
            <Button type="submit">Keluar</Button>
          </form>
        </div>
      </div>
    );
  }

  // Badge PPIC tidak dihitung di halaman Packing supaya halaman rekam terbuka cepat
  return (
    <AppShell userName={profile.full_name} role={profile.role} alertCount={0}>
      {children}
    </AppShell>
  );
}
