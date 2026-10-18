"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Box,
  ChevronLeft,
  ClipboardCheck,
  Factory,
  KeyRound,
  LineChart,
  LogOut,
  Settings,
  Table,
  Tags,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { signOut } from "@/app/actions/auth";

const STORAGE_KEY = "pb-sidebar-collapsed";

const NAV: {
  section: string;
  items: {
    href: string;
    label: string;
    icon: React.ElementType;
    badge?: boolean;
  }[];
}[] = [
  {
    section: "PPIC",
    items: [
      { href: "/ppic", label: "Rekomendasi Produksi", icon: Box, badge: true },
      { href: "/stock", label: "Stock Live", icon: Table },
      { href: "/barang-masuk", label: "Barang Masuk", icon: ArrowDown },
      { href: "/barang-keluar", label: "Barang Keluar", icon: ArrowUp },
      { href: "/stock-opname", label: "Stock Opname", icon: ClipboardCheck },
      { href: "/batch", label: "Batch Produksi", icon: Factory },
    ],
  },
  {
    section: "Analisis",
    items: [
      { href: "/ringkasan", label: "Ringkasan Produk", icon: LineChart },
      { href: "/mutasi", label: "Riwayat Mutasi", icon: ArrowLeftRight },
    ],
  },
  {
    section: "Pengaturan",
    items: [
      { href: "/master-sku", label: "Master SKU", icon: Tags },
      { href: "/parameter", label: "Parameter PPIC", icon: Settings },
    ],
  },
];

export function AppShell({
  userName,
  userRole,
  alertCount,
  children,
}: {
  userName: string;
  userRole: string;
  alertCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // localStorage tidak tersedia — pakai default
    }
  }, []);

  function toggle() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(STORAGE_KEY, c ? "0" : "1");
      } catch {
        // abaikan
      }
      return !c;
    });
  }

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "fixed z-20 flex h-screen flex-col overflow-x-hidden overflow-y-auto border-r border-line bg-white py-6 transition-[width] duration-[220ms] ease-in-out",
          collapsed ? "w-[68px]" : "w-[240px]",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-3 pb-6",
            collapsed ? "justify-center px-3.5" : "px-6",
          )}
        >
          {collapsed ? (
            <Image src="/logo-mark.png" alt="Pretty Basic" width={40} height={40} className="h-10 w-10 shrink-0 rounded-[10px]" priority />
          ) : (
            <div>
              <Image src="/logo.png" alt="Pretty Basic" width={83} height={44} className="h-11 w-auto" priority />
              <div className="mt-1.5 text-[11px] leading-snug text-grey-1">PPIC System</div>
            </div>
          )}
        </div>

        {NAV.map((group) => (
          <div key={group.section}>
            <div
              className={cn(
                "text-[10.5px] font-semibold tracking-[0.14em] text-grey-2 uppercase",
                collapsed ? "invisible h-0.5 px-0 pt-3.5" : "px-6 pt-5 pb-2.5",
              )}
            >
              {group.section}
            </div>
            {group.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-label={item.label}
                  className={cn(
                    "group relative flex items-center gap-3 border-l-[3px] text-[13.5px] font-medium transition-all duration-150",
                    collapsed ? "justify-center py-[11px]" : "px-6 py-2.5",
                    active
                      ? "border-l-primary bg-primary-tint font-semibold text-primary"
                      : "border-l-transparent text-ink-3 hover:bg-bg hover:text-ink",
                  )}
                >
                  <Icon
                    className="h-[18px] w-[18px] shrink-0"
                    strokeWidth={1.8}
                  />
                  {!collapsed && <span>{item.label}</span>}
                  {!collapsed && item.badge && alertCount > 0 && (
                    <span className="num ml-auto rounded-full bg-neg px-[7px] py-px text-[10.5px] font-bold text-white">
                      {alertCount}
                    </span>
                  )}
                  {collapsed && item.badge && alertCount > 0 && (
                    <span className="absolute top-1.5 right-3.5 h-2 w-2 rounded-full bg-neg" />
                  )}
                  {collapsed && (
                    <span className="pointer-events-none absolute top-1/2 left-[60px] z-[100] hidden -translate-y-1/2 rounded-md bg-ink px-3 py-1.5 text-xs font-medium whitespace-nowrap text-white group-hover:block">
                      {item.label}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}

        <div
          className={cn(
            "mt-auto flex items-center gap-3 border-t border-line py-4",
            collapsed ? "flex-col justify-center px-3.5" : "px-6",
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-white">
            {userName.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-ink">
                {userName}
              </div>
              <div className="mt-px text-[11px] text-grey-1">{userRole}</div>
            </div>
          )}
          <div className={cn("flex", collapsed ? "flex-col gap-1" : "gap-0.5")}>
            <Link
              href="/akun/password"
              title="Ganti password"
              className="flex h-7 w-7 items-center justify-center rounded-md text-grey-1 hover:bg-bg hover:text-ink"
            >
              <KeyRound className="h-4 w-4" />
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                title="Keluar"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-grey-1 hover:bg-neg-tint hover:text-neg"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Buka sidebar" : "Tutup sidebar"}
        className={cn(
          "fixed top-9 z-30 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-line bg-white text-grey-1 shadow-[0_1px_3px_rgba(15,23,42,0.08)] transition-[left] duration-[220ms] ease-in-out hover:border-grey-3 hover:text-ink",
          collapsed ? "left-[52px]" : "left-[224px]",
        )}
      >
        <ChevronLeft
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-[220ms]",
            collapsed && "rotate-180",
          )}
          strokeWidth={2.2}
        />
      </button>

      <main
        className={cn(
          "min-h-screen min-w-0 flex-1 px-9 py-7 transition-[margin-left] duration-[220ms] ease-in-out",
          collapsed ? "ml-[68px]" : "ml-[240px]",
        )}
      >
        {children}
      </main>
    </div>
  );
}
