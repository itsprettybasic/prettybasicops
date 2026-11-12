"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Download, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAppData } from "@/components/providers/app-data";
import { Panel, Toolbar } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SearchInput } from "@/components/ui/search-input";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { EmptyRow, Pagination, SkeletonRows, SkuCell } from "@/components/ui/table-parts";
import { TransferFormModal } from "@/components/warehouse/transfer-form-modal";
import { deleteTransfer, getTransferDetail, type TransferDetail } from "@/app/actions/warehouses";
import { exportXlsx } from "@/lib/excel/download";
import { fmtDate, fmtInt, fmtTime } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface TransferSummary {
  id: string;
  transfer_no: string;
  transfer_date: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  from_warehouse_name: string;
  to_warehouse_name: string;
  note: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_by_name: string | null;
  updated_at: string | null;
  sku_count: number;
  total_qty: number;
  product_names: string[];
}

function searchText(t: TransferSummary) {
  return [t.transfer_no, t.from_warehouse_name, t.to_warehouse_name, t.note ?? "", t.created_by_name ?? "", ...t.product_names]
    .join(" ")
    .toLowerCase();
}

export function TransferList({
  transfers,
  from: initialFrom,
  to: initialTo,
  loadError,
}: {
  transfers: TransferSummary[];
  from: string;
  to: string;
  loadError: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const { warehouses, today } = useAppData();
  const [search, setSearch] = useState("");
  const [whFilter, setWhFilter] = useState("");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [formOpen, setFormOpen] = useState<{ key: number; edit?: TransferDetail } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (loadError) toast.error(`Gagal memuat transfer: ${loadError}`);
  }, [loadError]);

  const filtered = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return transfers.filter(
      (t) =>
        (!whFilter || t.from_warehouse_id === whFilter || t.to_warehouse_id === whFilter) &&
        words.every((w) => searchText(t).includes(w)),
    );
  }, [transfers, search, whFilter]);
  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPcs = filtered.reduce((s, t) => s + t.total_qty, 0);

  function applyRange(f: string, t: string) {
    setFrom(f);
    setTo(t);
    if (!f || !t) return;
    setPage(0);
    startTransition(() => router.replace(`${pathname}?${new URLSearchParams({ from: f, to: t })}`, { scroll: false }));
  }

  async function exportExcel() {
    setExporting(true);
    try {
      await exportXlsx("transfer-stock", today, {
        name: "Transfer Stock",
        rows: filtered,
        columns: [
          { header: "No Transfer", width: 20, value: (t) => t.transfer_no },
          { header: "Tanggal", width: 12, value: (t) => t.transfer_date },
          { header: "Dari", width: 18, value: (t) => t.from_warehouse_name },
          { header: "Ke", width: 18, value: (t) => t.to_warehouse_name },
          { header: "Jumlah SKU", value: (t) => t.sku_count },
          { header: "Total Qty", numFmt: "#,##0", value: (t) => t.total_qty },
          { header: "Produk", width: 40, value: (t) => t.product_names.join(", ") },
          { header: "Catatan", width: 30, value: (t) => t.note ?? "" },
          { header: "Admin", width: 16, value: (t) => t.created_by_name ?? "" },
        ],
      });
    } catch (e) {
      toast.error(`Gagal export: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <StatGrid cols={4}>
        <StatCard label="Transfer" tone="primary" value={fmtInt(filtered.length)} unit="catatan" sub={`${fmtDate(from)} – ${fmtDate(to)}`} />
        <StatCard label="Total Dipindah" tone="primary" value={fmtInt(totalPcs)} unit="pcs" sub="Stock total tidak berubah" />
        <StatCard
          label="Gudang Aktif"
          tone="grey"
          value={fmtInt(warehouses.filter((w) => w.is_active).length)}
          sub={warehouses.filter((w) => w.is_active).map((w) => w.name).join(" · ")}
        />
        <StatCard
          label="Hari Ini"
          tone="grey"
          value={fmtInt(transfers.filter((t) => t.transfer_date === today).length)}
          unit="transfer"
          sub={`${fmtInt(transfers.filter((t) => t.transfer_date === today).reduce((s, t) => s + t.total_qty, 0))} pcs`}
        />
      </StatGrid>

      <Panel
        title="Riwayat Transfer"
        sub="Klik baris untuk lihat detail, edit, atau hapus"
        actions={
          <>
            <Button onClick={exportExcel} loading={exporting} disabled={filtered.length === 0}>
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button variant="primary" onClick={() => setFormOpen({ key: Date.now() })}>
              <Plus className="h-4 w-4" />
              Transfer Stock
            </Button>
          </>
        }
      >
        <Toolbar>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(0);
            }}
            placeholder="Cari no transfer, gudang, produk..."
          />
          <select
            className="select-input"
            value={whFilter}
            onChange={(e) => {
              setWhFilter(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Semua gudang</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <input
              type="date"
              className="date-input min-w-0 flex-1 sm:flex-none"
              value={from}
              max={to || undefined}
              onChange={(e) => applyRange(e.target.value, to)}
              aria-label="Dari tanggal"
            />
            <span className="text-[12px] text-grey-2">s/d</span>
            <input
              type="date"
              className="date-input min-w-0 flex-1 sm:flex-none"
              value={to}
              min={from || undefined}
              onChange={(e) => applyRange(from, e.target.value)}
              aria-label="Sampai tanggal"
            />
          </div>
        </Toolbar>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>No Transfer</th>
                <th>Tanggal</th>
                <th>Dari → Ke</th>
                <th>SKU</th>
                <th className="num">Qty</th>
                <th>Catatan</th>
                <th>Admin</th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                <SkeletonRows cols={7} />
              ) : (
                <>
                  {pageRows.length === 0 && (
                    <EmptyRow colSpan={7}>
                      {transfers.length === 0 ? "Belum ada transfer di rentang tanggal ini." : "Tidak ada transfer yang cocok."}
                    </EmptyRow>
                  )}
                  {pageRows.map((t) => (
                    <tr key={t.id} className="clickable" onClick={() => setDetailId(t.id)}>
                      <td>
                        <span className="num text-[12.5px] font-semibold text-ink-2">{t.transfer_no}</span>
                      </td>
                      <td>
                        <div className="font-medium text-ink-2">{fmtDate(t.transfer_date)}</div>
                        <div className="num text-[11.5px] text-grey-1">{fmtTime(t.created_at)}</div>
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="font-medium text-ink-2">{t.from_warehouse_name}</span>
                        <ArrowRight className="mx-1.5 inline h-3.5 w-3.5 text-grey-2" />
                        <span className="font-medium text-ink-2">{t.to_warehouse_name}</span>
                      </td>
                      <td className="max-w-[260px]">
                        <div className="font-semibold text-ink">{fmtInt(t.sku_count)} SKU</div>
                        <div className="truncate text-[11.5px] text-grey-1">{t.product_names.join(", ")}</div>
                      </td>
                      <td className="num font-semibold text-primary-2">{fmtInt(t.total_qty)}</td>
                      <td className="max-w-[200px] truncate text-grey-1">{t.note ?? "—"}</td>
                      <td className="whitespace-nowrap text-ink-2">{t.created_by_name ?? "—"}</td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(0);
            }}
          />
        )}
      </Panel>

      {detailId && (
        <TransferDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(d) => {
            setDetailId(null);
            setFormOpen({ key: Date.now(), edit: d });
          }}
        />
      )}
      {formOpen && (
        <TransferFormModal key={formOpen.key} open onOpenChange={(o) => !o && setFormOpen(null)} edit={formOpen.edit} />
      )}
    </>
  );
}

function TransferDetailModal({
  id,
  onClose,
  onEdit,
}: {
  id: string;
  onClose: () => void;
  onEdit: (d: TransferDetail) => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<TransferDetail | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    getTransferDetail(id).then((res) => {
      if (res.ok) setDetail(res.data);
      else {
        toast.error(`Gagal memuat transfer: ${res.error}`);
        closeRef.current();
      }
    });
  }, [id]);

  async function remove() {
    const res = await deleteTransfer(id);
    if (!res.ok) {
      toast.error(`Gagal menghapus: ${res.error}`);
      return;
    }
    toast.success(`${detail?.transfer_no ?? "Transfer"} dihapus · stock kembali ke gudang asal`);
    setConfirmDelete(false);
    onClose();
    router.refresh();
  }

  const total = detail?.lines.reduce((s, l) => s + l.qty, 0) ?? 0;

  return (
    <>
      <Modal
        open
        onOpenChange={(o) => !o && onClose()}
        wide
        eyebrow="Transfer Stock"
        title={detail?.transfer_no ?? "Memuat..."}
        sub={detail ? `${fmtDate(detail.transfer_date)} · ${fmtInt(detail.lines.length)} SKU · ${fmtInt(total)} pcs` : undefined}
        footerLeft={
          detail ? (
            <Button variant="neg" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Hapus
            </Button>
          ) : undefined
        }
        footer={
          <>
            <Button onClick={onClose}>Tutup</Button>
            {detail && (
              <Button variant="primary" onClick={() => onEdit(detail)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            )}
          </>
        }
      >
        {!detail ? (
          <table className="data-table">
            <tbody>
              <SkeletonRows cols={2} rows={4} />
            </tbody>
          </table>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-2 gap-x-6 gap-y-4 rounded-[10px] border border-line bg-bg px-5 py-4 md:grid-cols-4">
              <Field label="Dari gudang">{detail.from_warehouse_name}</Field>
              <Field label="Ke gudang">{detail.to_warehouse_name}</Field>
              <Field label="Admin">
                {detail.created_by_name ?? "—"}
                <span className="num ml-1.5 text-[12px] text-grey-1">
                  {fmtDate(detail.created_at)} {fmtTime(detail.created_at)}
                </span>
              </Field>
              <Field label="Diubah">
                {detail.updated_at ? (
                  <>
                    {detail.updated_by_name ?? "—"}
                    <span className="num ml-1.5 text-[12px] text-grey-1">
                      {fmtDate(detail.updated_at)} {fmtTime(detail.updated_at)}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </Field>
              <div className="col-span-2 md:col-span-4">
                <Field label="Catatan">{detail.note || <span className="text-grey-2">—</span>}</Field>
              </div>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th className="num">Qty</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((l) => (
                  <tr key={l.sku_id}>
                    <td>
                      <SkuCell label={l.label} code={l.code} />
                    </td>
                    <td className="num font-semibold text-primary-2">{fmtInt(l.qty)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="text-grey-1">Total {fmtInt(detail.lines.length)} SKU</td>
                  <td className={cn("num font-bold text-ink")}>{fmtInt(total)} pcs</td>
                </tr>
              </tfoot>
            </table>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Hapus ${detail?.transfer_no ?? "transfer"}?`}
        tone="neg"
        confirmLabel="Ya, Hapus"
        message={
          detail ? (
            <p>
              <strong>{fmtInt(total)} pcs</strong> akan kembali dari <strong>{detail.to_warehouse_name}</strong> ke{" "}
              <strong>{detail.from_warehouse_name}</strong>. Salinan transfer tetap tercatat di log penghapusan.
            </p>
          ) : (
            ""
          )
        }
        onConfirm={remove}
      />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10.5px] font-bold tracking-[0.06em] text-grey-1 uppercase">{label}</div>
      <div className="text-[13.5px] font-medium text-ink">{children}</div>
    </div>
  );
}
