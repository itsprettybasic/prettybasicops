"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Pencil, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Panel, Toolbar } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterChip } from "@/components/ui/filter-chip";
import { SearchInput } from "@/components/ui/search-input";
import { InfoBanner } from "@/components/ui/info-banner";
import { EmptyRow, Pagination, SkeletonRows } from "@/components/ui/table-parts";
import { useAppData } from "@/components/providers/app-data";
import { DocumentDetailModal } from "@/components/stock/document-detail-modal";
import {
  CHANNEL_LABEL,
  IN_TYPES,
  OUT_TYPES,
  TYPE_LABEL,
  TYPE_TONE,
  type MovementType,
} from "@/lib/constants";
import { fmtDate, fmtDec, fmtInt, fmtMonthYear, fmtSigned, fmtTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { DocumentHistoryData, DocumentSummary } from "@/lib/data/documents";

const COLS = 9;

export function SourceBadge({ source }: { source: string }) {
  const label = source === "excel" ? "Excel" : source === "seed" ? "Import awal" : source === "opname" ? "Opname" : "Manual";
  return (
    <Badge tone={source === "excel" ? "info" : source === "opname" ? "purple" : "grey"} className="px-[7px] py-[2px] text-[10px]">
      {label}
    </Badge>
  );
}

function searchText(d: DocumentSummary) {
  return [
    d.doc_no,
    d.note ?? "",
    d.po_no ?? "",
    d.vendor_name ?? "",
    d.channel ? CHANNEL_LABEL[d.channel] : "",
    d.created_by_name ?? "",
    TYPE_LABEL[d.type],
    ...d.product_names,
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Riwayat Barang Masuk / Barang Keluar. `receipts` = halaman Penerimaan Barang (hanya dokumen Penerimaan PO).
 */
export function DocumentHistory({ data, receipts = false }: { data: DocumentHistoryData; receipts?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const { openStockModal, openUpload } = useAppData();
  const [isPending, startTransition] = useTransition();

  const isIn = data.direction === "in";
  const noun = receipts ? "penerimaan barang" : isIn ? "barang masuk" : "barang keluar";
  const types = isIn ? IN_TYPES : OUT_TYPES;

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<MovementType | "all">("all");
  const [showVoided, setShowVoided] = useState(false);
  const [from, setFrom] = useState(data.from);
  const [to, setTo] = useState(data.to);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [detail, setDetail] = useState<{ id: string; action?: "edit" | "delete" } | null>(null);

  const indexed = useMemo(() => data.documents.map((d) => ({ doc: d, hay: searchText(d) })), [data.documents]);
  const voidedCount = useMemo(() => data.documents.filter((d) => d.voided_at).length, [data.documents]);

  // Search + toggle void dulu (untuk hitungan chip), lalu filter tipe
  const baseFiltered = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return indexed
      .filter(({ doc, hay }) => (showVoided || !doc.voided_at) && words.every((w) => hay.includes(w)))
      .map(({ doc }) => doc);
  }, [indexed, search, showVoided]);

  const typeCounts = useMemo(() => {
    const counts = new Map<MovementType, number>();
    for (const d of baseFiltered) counts.set(d.type, (counts.get(d.type) ?? 0) + 1);
    return counts;
  }, [baseFiltered]);

  const filtered = useMemo(
    () => (typeFilter === "all" ? baseFiltered : baseFiltered.filter((d) => d.type === typeFilter)),
    [baseFiltered, typeFilter],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const hasFilter = search.trim() !== "" || typeFilter !== "all";

  function applyRange(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    if (!nextFrom || !nextTo) return;
    setPage(0);
    const params = new URLSearchParams({ from: nextFrom, to: nextTo });
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  function resetFilters() {
    setSearch("");
    setTypeFilter("all");
    setPage(0);
  }

  const openNew = () => openStockModal(receipts ? { direction: "in", type: "produksi" } : { direction: data.direction });
  const signed = (qty: number) => fmtSigned(isIn ? qty : -qty);
  const { stats } = data;
  const damagePct =
    stats.salesMonth && stats.salesMonth > 0 ? ((stats.damageMonth ?? 0) / stats.salesMonth) * 100 : null;

  return (
    <>
      <PageHeader
        title={receipts ? "Penerimaan Barang" : isIn ? "Barang Masuk" : "Barang Keluar"}
        sub={
          receipts
            ? "Barang yang datang dari vendor berdasarkan PO · otomatis masuk ke stock & mutasi"
            : isIn
            ? "Catatan stock masuk dari penerimaan PO, retur, atau adjustment"
            : "Catatan stock keluar dari sales, damage, giveaway, atau adjustment"
        }
      />

      {data.error && (
        <InfoBanner variant="warn" head="Data gagal dimuat">
          {data.error}
        </InfoBanner>
      )}

      <StatGrid cols={4}>
        <StatCard
          label={isIn ? "Masuk Hari Ini" : "Keluar Hari Ini"}
          tone={isIn ? "pos" : "neg"}
          valueTone={stats.today.qty ? (isIn ? "pos" : "neg") : undefined}
          value={signed(stats.today.qty)}
          unit="pcs"
          sub={`${fmtInt(stats.today.docs)} catatan`}
        />
        <StatCard
          label={isIn ? "Masuk 7 Hari" : "Keluar 7 Hari"}
          tone={isIn ? "pos" : "neg"}
          value={signed(stats.week.qty)}
          unit="pcs"
          sub={`${fmtInt(stats.week.docs)} catatan`}
        />
        <StatCard
          label={isIn ? "Masuk Bulan Ini" : "Keluar Bulan Ini"}
          tone="primary"
          value={signed(stats.month.qty)}
          unit="pcs"
          sub={`${fmtMonthYear(data.today)} · ${fmtInt(stats.month.docs)} catatan`}
        />
        {isIn ? (
          <StatCard
            label="PO Aktif"
            tone="warn"
            value={fmtInt(stats.openPos ?? 0)}
            sub="PO yang barangnya belum datang semua"
            onClick={() => router.push("/po")}
          />
        ) : (
          <StatCard
            label="Damage Bulan Ini"
            tone="warn"
            value={fmtInt(stats.damageMonth ?? 0)}
            unit="pcs"
            sub={damagePct === null ? "Belum ada sales bulan ini" : `${fmtDec(damagePct)}% dari sales`}
          />
        )}
      </StatGrid>

      <Panel
        title={receipts ? "Daftar Penerimaan Barang" : isIn ? "Riwayat Barang Masuk" : "Riwayat Barang Keluar"}
        sub={
          receipts
            ? "Klik baris untuk lihat rincian, cetak bukti penerimaan, edit, atau hapus"
            : "1 catatan bisa berisi banyak SKU · Klik baris untuk lihat detail, atau langsung edit / hapus"
        }
        actions={
          <>
            {!receipts && (
              <Button onClick={() => openUpload(isIn ? "masuk" : "keluar")}>
                <Upload className="h-3.5 w-3.5" /> Upload Excel
              </Button>
            )}
            <Button variant={isIn ? "pos" : "neg"} onClick={openNew}>
              {receipts ? "+ Terima Barang dari PO" : isIn ? "+ Catat Barang Masuk" : "− Catat Barang Keluar"}
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
            placeholder={isIn ? "Cari no, PO, vendor, produk..." : "Cari catatan, channel, produk..."}
          />
          {!receipts && (
          <>
          <FilterChip
            active={typeFilter === "all"}
            count={baseFiltered.length}
            onClick={() => {
              setTypeFilter("all");
              setPage(0);
            }}
          >
            Semua Tipe
          </FilterChip>
          {types.map((t) => (
            <FilterChip
              key={t}
              active={typeFilter === t}
              count={typeCounts.get(t) ?? 0}
              onClick={() => {
                setTypeFilter(t);
                setPage(0);
              }}
            >
              {TYPE_LABEL[t]}
            </FilterChip>
          ))}
          </>
          )}
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:flex-nowrap">
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

        <div className="-mt-1 mb-3 flex items-center justify-between text-[12px] text-grey-1">
          <label className="inline-flex cursor-pointer items-center gap-2 select-none">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 cursor-pointer accent-primary"
              checked={showVoided}
              onChange={(e) => {
                setShowVoided(e.target.checked);
                setPage(0);
              }}
            />
            Tampilkan yang dibatalkan
            {voidedCount > 0 && <span className="num text-grey-2">({fmtInt(voidedCount)})</span>}
          </label>
          <span>
            {fmtDate(data.from)} – {fmtDate(data.to)}
          </span>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>{receipts ? "No Penerimaan" : "No Catatan"}</th>
              <th>Tanggal</th>
              <th>Tipe</th>
              <th>{isIn ? "No PO / Vendor" : "Channel"}</th>
              <th>SKU dalam Catatan</th>
              <th className="num">Total Qty</th>
              <th>Catatan</th>
              <th>Admin</th>
              <th className="w-[76px]" aria-label="Aksi" />
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              <SkeletonRows cols={COLS} />
            ) : pageRows.length === 0 ? (
              <EmptyRow colSpan={COLS}>
                {data.documents.length === 0 ? (
                  <button type="button" onClick={openNew} className="cursor-pointer font-semibold text-primary-2 hover:underline">
                    Belum ada {noun}. Catat yang pertama →
                  </button>
                ) : hasFilter ? (
                  <>
                    Tidak ada catatan yang cocok dengan filter.{" "}
                    <button type="button" onClick={resetFilters} className="cursor-pointer font-semibold text-primary-2 hover:underline">
                      Reset filter
                    </button>
                  </>
                ) : (
                  "Semua catatan di periode ini sudah dibatalkan."
                )}
              </EmptyRow>
            ) : (
              pageRows.map((d) => {
                const voided = !!d.voided_at;
                const shown = d.product_names.slice(0, 3);
                const rest = d.product_names.length - shown.length;
                return (
                  <tr key={d.id} className={cn("clickable", voided && "text-grey-2")} onClick={() => setDetail({ id: d.id })}>
                    <td className="whitespace-nowrap">
                      <span className={cn("num text-[12.5px] font-semibold", voided ? "text-grey-2" : "text-ink-2")}>{d.doc_no}</span>
                    </td>
                    <td className="whitespace-nowrap">
                      <div className={cn("font-medium", voided ? "text-grey-2" : "text-ink-2")}>{fmtDate(d.doc_date)}</div>
                      <div className="num text-[11.5px] text-grey-1">{fmtTime(d.created_at)}</div>
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={voided ? "grey" : TYPE_TONE[d.type]}>{TYPE_LABEL[d.type]}</Badge>
                        {voided && <Badge tone="neg">Dibatalkan</Badge>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      {isIn ? (
                        d.po_no ? (
                          <>
                            <strong className={voided ? "text-grey-2" : "text-primary-2"}>{d.po_no}</strong>
                            {d.vendor_name && <div className="text-[11.5px] text-grey-1">{d.vendor_name}</div>}
                          </>
                        ) : (
                          <span className="text-grey-2">—</span>
                        )
                      ) : d.channel ? (
                        <span className={voided ? "text-grey-2" : "font-medium text-ink-2"}>{CHANNEL_LABEL[d.channel]}</span>
                      ) : (
                        <span className="text-grey-2">—</span>
                      )}
                    </td>
                    <td className="max-w-[260px]">
                      <div className={cn("font-semibold", voided ? "text-grey-2" : "text-ink")}>{fmtInt(d.sku_count)} SKU</div>
                      <div className="truncate text-[11.5px] text-grey-1">
                        {shown.join(", ")}
                        {rest > 0 && `, +${rest} lainnya`}
                      </div>
                    </td>
                    <td className="num">
                      <strong className={voided ? "text-grey-2 line-through" : isIn ? "text-pos" : "text-neg"}>
                        {signed(d.total_qty)}
                      </strong>
                    </td>
                    <td className="max-w-[200px]">
                      <div className="truncate" title={d.note ?? undefined}>
                        {d.note || <span className="text-grey-2">—</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <div className={voided ? "text-grey-2" : "text-ink-2"}>{d.created_by_name ?? "—"}</div>
                      <div className="mt-0.5">
                        <SourceBadge source={d.source} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        title="Edit"
                        aria-label={`Edit ${d.doc_no}`}
                        onClick={() => setDetail({ id: d.id, action: "edit" })}
                        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-grey-1 hover:bg-primary-tint hover:text-primary-2"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Hapus"
                        aria-label={`Hapus ${d.doc_no}`}
                        onClick={() => setDetail({ id: d.id, action: "delete" })}
                        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-grey-1 hover:bg-neg-tint hover:text-neg"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {!isPending && filtered.length > 0 && (
          <Pagination
            page={safePage}
            pageSize={pageSize}
            total={filtered.length}
            onPage={setPage}
            onPageSize={(s) => {
              setPageSize(s);
              setPage(0);
            }}
          />
        )}
      </Panel>

      {detail && (
        <DocumentDetailModal
          key={`${detail.id}:${detail.action ?? "view"}`}
          documentId={detail.id}
          initialAction={detail.action}
          open
          onOpenChange={(o) => !o && setDetail(null)}
        />
      )}
    </>
  );
}
