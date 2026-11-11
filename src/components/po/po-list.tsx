"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { Plus } from "lucide-react";
import { PO_STATUS_LABEL, poStatusDisplay, type PoStatus } from "@/lib/constants";
import { TIMEZONE, fmtDate, fmtDateShort, fmtInt, fmtRupiahShort } from "@/lib/format";
import { daysBetween } from "@/lib/ppic";
import { cn } from "@/lib/cn";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Panel, Toolbar } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CapacityBar } from "@/components/ui/capacity-bar";
import { FilterChip } from "@/components/ui/filter-chip";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyRow, Pagination } from "@/components/ui/table-parts";
import { PoDetailModal } from "./po-detail-modal";
import { PoFormModal } from "./po-form-modal";

export interface PoSummary {
  id: string;
  po_no: string;
  vendor_id: string;
  vendor_name: string;
  po_date: string;
  expected_date: string | null;
  status: PoStatus;
  note: string | null;
  done_at: string | null;
  created_at: string;
  sku_count: number;
  qty_ordered: number;
  qty_received: number;
  total_amount: number | null;
  receipt_count: number;
  last_receipt_date: string | null;
}

type Filter = "all" | PoStatus | "partial";

const CHIPS: { key: Filter; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "draft", label: PO_STATUS_LABEL.draft },
  { key: "open", label: PO_STATUS_LABEL.open },
  { key: "partial", label: "Diterima Sebagian" },
  { key: "done", label: PO_STATUS_LABEL.done },
  { key: "cancelled", label: PO_STATUS_LABEL.cancelled },
];

const COLS = 9;

function isOpen(p: PoSummary) {
  return p.status === "draft" || p.status === "open";
}

function matches(p: PoSummary, f: Filter) {
  if (f === "all") return true;
  if (f === "partial") return p.status === "open" && p.qty_received > 0;
  if (f === "open") return p.status === "open" && p.qty_received === 0;
  return p.status === f;
}

/** Merah jika sudah lewat, oranye jika ≤ 3 hari lagi — hanya untuk PO yang belum selesai. */
function dueTone(p: PoSummary, today: string): "neg" | "warn" | null {
  if (!isOpen(p) || !p.expected_date) return null;
  const left = daysBetween(today, p.expected_date);
  if (left < 0) return "neg";
  if (left <= 3) return "warn";
  return null;
}

export function PoList({ pos, today, initialOpenId }: { pos: PoSummary[]; today: string; initialOpenId?: string | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [vendor, setVendor] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [detailId, setDetailId] = useState<string | null>(initialOpenId ?? null);
  const [creating, setCreating] = useState(false);

  const vendors = useMemo(
    () => [...new Map(pos.map((p) => [p.vendor_id, p.vendor_name])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [pos],
  );

  const stats = useMemo(() => {
    const thisMonth = today.slice(0, 7);
    const active = pos.filter((p) => p.status === "open");
    const drafts = pos.filter((p) => p.status === "draft").length;
    const pcsPending = active.reduce((s, p) => s + Math.max(0, p.qty_ordered - p.qty_received), 0);
    const doneThisMonth = pos.filter(
      (p) => p.status === "done" && p.done_at && formatInTimeZone(p.done_at, TIMEZONE, "yyyy-MM") === thisMonth,
    );
    const nearest = active
      .filter((p) => p.expected_date)
      .sort((a, b) => a.expected_date!.localeCompare(b.expected_date!))[0];
    const amountThisMonth = pos
      .filter((p) => p.status !== "cancelled" && p.po_date.slice(0, 7) === thisMonth)
      .reduce((s, p) => s + Number(p.total_amount ?? 0), 0);
    return {
      active: active.length,
      drafts,
      pcsPending,
      doneCount: doneThisMonth.length,
      donePcs: doneThisMonth.reduce((s, p) => s + p.qty_received, 0),
      nearest,
      amountThisMonth,
    };
  }, [pos, today]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(CHIPS.map((ch) => [ch.key, 0])) as Record<Filter, number>;
    for (const p of pos) for (const ch of CHIPS) if (matches(p, ch.key)) c[ch.key]++;
    return c;
  }, [pos]);

  const filtered = useMemo(() => {
    const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return pos.filter((p) => {
      if (!matches(p, filter)) return false;
      if (vendor && p.vendor_id !== vendor) return false;
      if (words.length === 0) return true;
      const hay = `${p.po_no} ${p.vendor_name} ${p.note ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [pos, filter, vendor, search]);

  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const nearestTone = stats.nearest ? dueTone(stats.nearest, today) : null;
  const nearestLeft = stats.nearest?.expected_date ? daysBetween(today, stats.nearest.expected_date) : null;

  return (
    <>
      <StatGrid cols={4}>
        <StatCard
          label="PO Aktif"
          tone="warn"
          value={fmtInt(stats.active)}
          sub={stats.drafts > 0 ? `Menunggu barang · ${fmtInt(stats.drafts)} draft` : "Menunggu barang datang"}
          active={filter === "open"}
          onClick={() => {
            setFilter((f) => (f === "open" ? "all" : "open"));
            setPage(0);
          }}
        />
        <StatCard
          label="Pcs Belum Datang"
          tone="primary"
          value={fmtInt(stats.pcsPending)}
          unit="pcs"
          sub={stats.amountThisMonth > 0 ? `Nilai PO bulan ini ${fmtRupiahShort(stats.amountThisMonth)}` : "Dari PO yang masih aktif"}
        />
        <StatCard
          label="Selesai Bulan Ini"
          tone="pos"
          valueTone="pos"
          value={fmtInt(stats.doneCount)}
          sub={`${fmtInt(stats.donePcs)} pcs diterima`}
        />
        <StatCard
          label="Kedatangan Terdekat"
          tone={nearestTone ?? "grey"}
          valueTone={nearestTone ?? undefined}
          value={stats.nearest?.expected_date ? fmtDateShort(stats.nearest.expected_date) : "—"}
          sub={
            stats.nearest
              ? `${stats.nearest.po_no} · ${
                  nearestLeft !== null && nearestLeft < 0
                    ? `lewat ${fmtInt(-nearestLeft)} hari`
                    : nearestLeft === 0
                      ? "hari ini"
                      : `${fmtInt(nearestLeft)} hari lagi`
                }`
              : "Tidak ada PO aktif"
          }
          onClick={stats.nearest ? () => setDetailId(stats.nearest!.id) : undefined}
        />
      </StatGrid>

      <Panel
        title="Daftar Purchase Order"
        sub="Klik baris untuk lihat detail, terima barang, edit, atau cetak dokumen PO"
        actions={
          <>
            <Link
              href="/ppic"
              className="inline-flex items-center rounded-[10px] border border-line bg-white px-4 py-[9px] text-[13px] font-semibold text-ink-2 hover:border-grey-3"
            >
              Dari Rekomendasi Produksi
            </Link>
            <Button variant="blue" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" /> Buat PO
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
            placeholder="Cari no PO, vendor, catatan..."
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
          <select
            className="select-input w-full sm:ml-auto sm:w-auto"
            value={vendor}
            onChange={(e) => {
              setVendor(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Semua Vendor</option>
            {vendors.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Toolbar>

        <table className="data-table">
          <thead>
            <tr>
              <th>No PO</th>
              <th>Vendor</th>
              <th>Tanggal PO</th>
              <th>Kedatangan</th>
              <th className="num">SKU</th>
              <th className="num">Qty PO</th>
              <th className="num">Diterima</th>
              <th className="num">Progress</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <EmptyRow colSpan={COLS}>
                {pos.length === 0 ? (
                  <button type="button" onClick={() => setCreating(true)} className="cursor-pointer font-semibold text-primary-2 hover:underline">
                    Belum ada PO. Buat PO pertama →
                  </button>
                ) : (
                  "Tidak ada PO yang cocok dengan filter."
                )}
              </EmptyRow>
            )}
            {pageRows.map((p) => {
              const tone = dueTone(p, today);
              const pct = p.status === "draft" || p.qty_ordered === 0 ? null : (p.qty_received / p.qty_ordered) * 100;
              const st = poStatusDisplay(p.status, p.qty_received);
              return (
                <tr key={p.id} className="clickable" onClick={() => setDetailId(p.id)}>
                  <td>
                    <strong className="text-primary-2">{p.po_no}</strong>
                  </td>
                  <td>
                    <div className="font-medium text-ink-2">{p.vendor_name}</div>
                  </td>
                  <td className="text-ink-3">{fmtDate(p.po_date)}</td>
                  <td className={cn("text-ink-3", tone === "neg" && "font-semibold text-neg", tone === "warn" && "font-semibold text-warn")}>
                    {fmtDate(p.expected_date)}
                  </td>
                  <td className="num">{fmtInt(p.sku_count)}</td>
                  <td className="num">{fmtInt(p.qty_ordered)}</td>
                  <td className="num">{p.qty_received > 0 ? fmtInt(p.qty_received) : <span className="text-grey-2">0</span>}</td>
                  <td className="num">
                    <CapacityBar pct={pct} tone={p.status === "done" ? "pos" : "primary"} />
                  </td>
                  <td>
                    <Badge tone={st.tone}>{st.label}</Badge>
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
        <PoDetailModal key={detailId} poId={detailId} open={detailId !== null} onOpenChange={(o) => !o && setDetailId(null)} />
      )}
      {creating && <PoFormModal open={creating} onOpenChange={setCreating} onSaved={(id) => setDetailId(id)} />}
    </>
  );
}
