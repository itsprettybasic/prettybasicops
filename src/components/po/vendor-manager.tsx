"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Panel, Toolbar } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterChip } from "@/components/ui/filter-chip";
import { SearchInput } from "@/components/ui/search-input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyRow } from "@/components/ui/table-parts";
import { deleteVendor, type Vendor } from "@/app/actions/po";
import { fmtDate, fmtInt } from "@/lib/format";
import { cn } from "@/lib/cn";
import { VendorFormModal } from "./vendor-form-modal";

export interface VendorSummary extends Vendor {
  po_count: number;
  po_open_count: number;
  last_po_date: string | null;
}

type Filter = "active" | "inactive" | "all";

export function VendorManager({ vendors }: { vendors: VendorSummary[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [editing, setEditing] = useState<Vendor | "new" | null>(null);
  const [deleting, setDeleting] = useState<VendorSummary | null>(null);

  const counts = useMemo(
    () => ({
      active: vendors.filter((v) => v.is_active).length,
      inactive: vendors.filter((v) => !v.is_active).length,
      all: vendors.length,
    }),
    [vendors],
  );

  const rows = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return vendors.filter((v) => {
      if (filter === "active" && !v.is_active) return false;
      if (filter === "inactive" && v.is_active) return false;
      const hay = [v.name, v.contact_person, v.phone, v.email, v.address, v.note].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [vendors, search, filter]);

  async function doDelete() {
    if (!deleting) return;
    const res = await deleteVendor(deleting.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`${deleting.name} dihapus`);
    setDeleting(null);
    router.refresh();
  }

  return (
    <>
      <Panel
        title="Daftar Vendor"
        sub="Klik baris untuk ubah data. Vendor yang sudah punya PO tidak bisa dihapus — nonaktifkan saja."
        actions={
          <Button variant="blue" onClick={() => setEditing("new")}>
            <Plus className="h-3.5 w-3.5" /> Tambah Vendor
          </Button>
        }
      >
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Cari nama, kontak, telepon, alamat..." />
          <FilterChip active={filter === "active"} count={counts.active} onClick={() => setFilter("active")}>
            Aktif
          </FilterChip>
          <FilterChip active={filter === "inactive"} count={counts.inactive} onClick={() => setFilter("inactive")}>
            Nonaktif
          </FilterChip>
          <FilterChip active={filter === "all"} count={counts.all} onClick={() => setFilter("all")}>
            Semua
          </FilterChip>
        </Toolbar>

        <table className="data-table">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Kontak</th>
              <th>Alamat</th>
              <th className="num">Total PO</th>
              <th className="num">PO Aktif</th>
              <th>PO Terakhir</th>
              <th className="w-[84px]" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <EmptyRow colSpan={7}>
                {vendors.length === 0 ? (
                  <button type="button" onClick={() => setEditing("new")} className="cursor-pointer font-semibold text-primary-2 hover:underline">
                    Belum ada vendor. Tambah vendor pertama →
                  </button>
                ) : (
                  "Tidak ada vendor yang cocok."
                )}
              </EmptyRow>
            )}
            {rows.map((v) => (
              <tr key={v.id} className={cn("clickable", !v.is_active && "text-grey-2")} onClick={() => setEditing(v)}>
                <td>
                  <div className={cn("font-semibold", v.is_active ? "text-ink" : "text-grey-2")}>{v.name}</div>
                  {!v.is_active && <Badge tone="grey">Nonaktif</Badge>}
                  {v.note && <div className="max-w-[220px] truncate text-[11.5px] text-grey-1">{v.note}</div>}
                </td>
                <td className="whitespace-nowrap">
                  <div className="text-ink-2">{v.contact_person ?? <span className="text-grey-2">—</span>}</div>
                  <div className="text-[11.5px] text-grey-1">{[v.phone, v.email].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="max-w-[240px]">
                  <div className="truncate text-ink-3" title={v.address ?? undefined}>
                    {v.address ?? <span className="text-grey-2">—</span>}
                  </div>
                </td>
                <td className="num">{fmtInt(v.po_count)}</td>
                <td className="num">{v.po_open_count > 0 ? <strong className="text-warn">{fmtInt(v.po_open_count)}</strong> : "0"}</td>
                <td className="text-ink-3">{fmtDate(v.last_po_date)}</td>
                <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    title="Ubah"
                    onClick={() => setEditing(v)}
                    className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-grey-1 hover:bg-bg hover:text-ink"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title={v.po_count > 0 ? "Sudah punya PO — nonaktifkan saja" : "Hapus"}
                    disabled={v.po_count > 0}
                    onClick={() => setDeleting(v)}
                    className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-grey-1 hover:bg-neg-tint hover:text-neg disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {editing && (
        <VendorFormModal
          vendor={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Hapus vendor?"
        message={
          <>
            Vendor <strong>{deleting?.name}</strong> akan dihapus permanen.
          </>
        }
        confirmLabel="Hapus Vendor"
        tone="neg"
        onConfirm={doDelete}
      />
    </>
  );
}
