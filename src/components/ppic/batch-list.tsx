"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { BATCH_STATUS_LABEL, BATCH_STATUS_TONE, type BatchStatus } from "@/lib/constants";
import { TIMEZONE, fmtDate, fmtDateShort, fmtInt } from "@/lib/format";
import { daysBetween } from "@/lib/ppic";
import { cn } from "@/lib/cn";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Panel, Toolbar } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { CapacityBar } from "@/components/ui/capacity-bar";
import { FilterChip } from "@/components/ui/filter-chip";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyRow, Pagination } from "@/components/ui/table-parts";
import { BatchDetailModal } from "./batch-detail-modal";

export interface BatchSummary {
  id: string;
  batch_no: string;
  konveksi_id: string;
  konveksi_name: string;
  konveksi_capacity: number | null;
  sent_date: string;
  est_done_date: string | null;
  status: BatchStatus;
  note: string | null;
  done_at: string | null;
  created_at: string;
  sku_count: number;
  qty_planned: number;
  qty_received: number;
}

type Filter = "all" | BatchStatus;

const CHIPS: { key: Filter; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "draft", label: BATCH_STATUS_LABEL.draft },
  { key: "in_production", label: BATCH_STATUS_LABEL.in_production },
  { key: "done", label: BATCH_STATUS_LABEL.done },
  { key: "cancelled", label: BATCH_STATUS_LABEL.cancelled },
];

const COLS = 9;

function isOpen(b: BatchSummary) {
  return b.status === "draft" || b.status === "in_production";
}

/** Merah jika sudah lewat, oranye jika ≤ 3 hari lagi — hanya untuk batch yang belum selesai. */
function dueTone(b: BatchSummary, today: string): "neg" | "warn" | null {
  if (!isOpen(b) || !b.est_done_date) return null;
  const left = daysBetween(today, b.est_done_date);
  if (left < 0) return "neg";
  if (left <= 3) return "warn";
  return null;
}

export function BatchList({ batches, today }: { batches: BatchSummary[]; today: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [detailId, setDetailId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const thisMonth = today.slice(0, 7);
    const active = batches.filter((b) => b.status === "in_production");
    const drafts = batches.filter((b) => b.status === "draft").length;
    const pcsInProduction = active.reduce((s, b) => s + Math.max(0, b.qty_planned - b.qty_received), 0);
    const doneThisMonth = batches.filter(
      (b) => b.status === "done" && b.done_at && formatInTimeZone(b.done_at, TIMEZONE, "yyyy-MM") === thisMonth,
    );
    const nearest = active
      .filter((b) => b.est_done_date)
      .sort((a, b) => a.est_done_date!.localeCompare(b.est_done_date!))[0];
    return {
      active: active.length,
      drafts,
      pcsInProduction,
      doneCount: doneThisMonth.length,
      donePcs: doneThisMonth.reduce((s, b) => s + b.qty_received, 0),
      nearest,
    };
  }, [batches, today]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: batches.length, draft: 0, in_production: 0, done: 0, cancelled: 0 };
    for (const b of batches) c[b.status]++;
    return c;
  }, [batches]);

  const filtered = useMemo(() => {
    const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return batches.filter((b) => {
      if (filter !== "all" && b.status !== filter) return false;
      if (words.length === 0) return true;
      const hay = `${b.batch_no} ${b.konveksi_name} ${b.note ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [batches, filter, search]);

  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const nearestTone = stats.nearest ? dueTone(stats.nearest, today) : null;
  const nearestLeft = stats.nearest?.est_done_date ? daysBetween(today, stats.nearest.est_done_date) : null;

  return (
    <>
      <StatGrid cols={4}>
        <StatCard
          label="Batch Aktif"
          tone="warn"
          value={fmtInt(stats.active)}
          sub={stats.drafts > 0 ? `Sedang diproduksi · ${fmtInt(stats.drafts)} draft` : "Sedang diproduksi"}
          active={filter === "in_production"}
          onClick={() => {
            setFilter((f) => (f === "in_production" ? "all" : "in_production"));
            setPage(0);
          }}
        />
        <StatCard
          label="Pcs Sedang Diproduksi"
          tone="primary"
          value={fmtInt(stats.pcsInProduction)}
          unit="pcs"
          sub="Belum diterima dari konveksi"
        />
        <StatCard
          label="Selesai Bulan Ini"
          tone="pos"
          valueTone="pos"
          value={fmtInt(stats.doneCount)}
          sub={`${fmtInt(stats.donePcs)} pcs diterima`}
        />
        <StatCard
          label="Estimasi Selesai Terdekat"
          tone={nearestTone ?? "grey"}
          valueTone={nearestTone ?? undefined}
          value={stats.nearest?.est_done_date ? fmtDateShort(stats.nearest.est_done_date) : "—"}
          sub={
            stats.nearest
              ? `${stats.nearest.batch_no} · ${
                  nearestLeft !== null && nearestLeft < 0
                    ? `lewat ${fmtInt(-nearestLeft)} hari`
                    : nearestLeft === 0
                      ? "hari ini"
                      : `${fmtInt(nearestLeft)} hari lagi`
                }`
              : "Tidak ada batch aktif"
          }
          onClick={stats.nearest ? () => setDetailId(stats.nearest!.id) : undefined}
        />
      </StatGrid>

      <Panel
        title="Daftar Batch Produksi"
        sub="Klik baris untuk lihat detail per SKU, terima barang, atau export surat order"
        actions={
          <Link
            href="/ppic"
            className="inline-flex items-center rounded-[10px] border border-line bg-white px-4 py-[9px] text-[13px] font-semibold text-ink-2 hover:border-grey-3"
          >
            Buat dari Rekomendasi Produksi
          </Link>
        }
      >
        <Toolbar>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(0);
            }}
            placeholder="Cari no batch, konveksi..."
          />
          {CHIPS.map((c) => (
            <FilterChip
              key={c.key}
              active={filter === c.key}
              count={counts[c.key]}
              onClick={() => {
                setFilter(c.key);
                setPage(0);
              }}
            >
              {c.label}
            </FilterChip>
          ))}
        </Toolbar>

        <table className="data-table">
          <thead>
            <tr>
              <th>No Batch</th>
              <th>Konveksi</th>
              <th>Tanggal Kirim</th>
              <th>Est. Selesai</th>
              <th className="num">Jumlah SKU</th>
              <th className="num">Qty Rencana</th>
              <th className="num">Qty Diterima</th>
              <th className="num">Progress</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <EmptyRow colSpan={COLS}>
                {batches.length === 0 ? (
                  <>
                    Belum ada batch produksi.{" "}
                    <Link href="/ppic" className="font-semibold text-primary-2 hover:underline">
                      Buat dari Rekomendasi Produksi →
                    </Link>
                  </>
                ) : (
                  "Tidak ada batch yang cocok dengan filter."
                )}
              </EmptyRow>
            )}
            {pageRows.map((b) => {
              const tone = dueTone(b, today);
              const pct = b.status === "draft" || b.qty_planned === 0 ? null : (b.qty_received / b.qty_planned) * 100;
              return (
                <tr key={b.id} className="clickable" onClick={() => setDetailId(b.id)}>
                  <td>
                    <strong className="text-primary-2">{b.batch_no}</strong>
                  </td>
                  <td>
                    <div className="font-medium text-ink-2">{b.konveksi_name}</div>
                  </td>
                  <td className="text-ink-3">{fmtDate(b.sent_date)}</td>
                  <td className={cn("text-ink-3", tone === "neg" && "font-semibold text-neg", tone === "warn" && "font-semibold text-warn")}>
                    {fmtDate(b.est_done_date)}
                  </td>
                  <td className="num">{fmtInt(b.sku_count)}</td>
                  <td className="num">{fmtInt(b.qty_planned)}</td>
                  <td className="num">{b.qty_received > 0 ? fmtInt(b.qty_received) : <span className="text-grey-2">0</span>}</td>
                  <td className="num">
                    <CapacityBar pct={pct} tone={b.status === "done" ? "pos" : "primary"} />
                  </td>
                  <td>
                    <Badge tone={BATCH_STATUS_TONE[b.status]}>{BATCH_STATUS_LABEL[b.status]}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <Pagination
          page={page}
          pageSize={pageSize}
          total={filtered.length}
          onPage={setPage}
          onPageSize={(s) => {
            setPageSize(s);
            setPage(0);
          }}
        />
      </Panel>

      {detailId && (
        <BatchDetailModal
          key={detailId}
          batchId={detailId}
          today={today}
          open={detailId !== null}
          onOpenChange={(o) => !o && setDetailId(null)}
        />
      )}
    </>
  );
}
