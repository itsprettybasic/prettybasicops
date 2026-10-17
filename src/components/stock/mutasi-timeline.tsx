"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Download, X } from "lucide-react";
import { toast } from "sonner";
import { useAppData } from "@/components/providers/app-data";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Panel, Toolbar } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { FilterChip } from "@/components/ui/filter-chip";
import { Combobox } from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";
import { EmptyRow, Pagination, SkeletonRows } from "@/components/ui/table-parts";
import { movementTitle } from "@/components/ppic/sku-detail-modal";
import { getSkuMovements, type SkuMovement } from "@/app/actions/stock";
import { exportXlsx } from "@/lib/excel/download";
import { CHANNEL_LABEL, TYPE_LABEL, TYPE_TONE, type Direction, type MovementType, type SalesChannel } from "@/lib/constants";
import { fmtDate, fmtDateShort, fmtInt, fmtMonthYear, fmtSigned, fmtTime } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface MutasiDoc {
  id: string;
  doc_no: string;
  direction: Direction;
  type: MovementType;
  doc_date: string;
  channel: SalesChannel | null;
  batch_no: string | null;
  note: string | null;
  source: string;
  created_at: string;
  created_by_name: string | null;
  sku_count: number;
  total_qty: number;
  product_names: string | null;
}

export interface MutasiStats {
  qtyIn: number;
  qtyOut: number;
  docsIn: number;
  docsOut: number;
  adjustments: number;
}

type DirFilter = "all" | Direction;

const STEP = 50;

function productSummary(names: string | null) {
  const list = (names ?? "").split("|").filter(Boolean);
  if (list.length <= 3) return list.join(", ");
  return `${list.slice(0, 3).join(", ")}, +${list.length - 3} lainnya`;
}

function signedQty(direction: Direction, qty: number) {
  return fmtSigned(direction === "in" ? qty : -qty);
}

function searchText(m: Pick<MutasiDoc, "doc_no" | "note" | "batch_no" | "type" | "channel">) {
  return [m.doc_no, m.note, m.batch_no, TYPE_LABEL[m.type], m.channel ? CHANNEL_LABEL[m.channel] : ""]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matches(hay: string, query: string) {
  const q = query.trim().toLowerCase();
  return !q || q.split(/\s+/).every((w) => hay.includes(w));
}

export function MutasiTimeline({
  docs,
  from,
  to,
  stats,
  loadError,
}: {
  docs: MutasiDoc[];
  from: string;
  to: string;
  stats: MutasiStats;
  loadError: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { today, skuOptions, rowById, openSkuDetail } = useAppData();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [dir, setDir] = useState<DirFilter>("all");
  const [skuId, setSkuId] = useState<string | null>(null);
  const [limit, setLimit] = useState(STEP);
  const [movements, setMovements] = useState<SkuMovement[] | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (loadError) toast.error(`Gagal memuat riwayat: ${loadError}`);
  }, [loadError]);

  // Kartu stok: ambil semua mutasi SKU (saldo berjalan dihitung dari awal), filter tanggal di client.
  useEffect(() => {
    if (!skuId) return;
    let alive = true;
    setMovements(null);
    getSkuMovements(skuId).then((res) => {
      if (!alive) return;
      if (res.ok) setMovements(res.data);
      else {
        toast.error(`Gagal memuat kartu stok: ${res.error}`);
        setMovements([]);
      }
    });
    return () => {
      alive = false;
    };
  }, [skuId]);

  function setRange(nextFrom: string, nextTo: string) {
    if (!nextFrom || !nextTo) return;
    const [a, b] = nextFrom <= nextTo ? [nextFrom, nextTo] : [nextTo, nextFrom];
    setLimit(STEP);
    setPage(0);
    startTransition(() => router.replace(`${pathname}?from=${a}&to=${b}`, { scroll: false }));
  }

  // ── Mode timeline (per catatan) ──
  const searchedDocs = useMemo(
    () => docs.filter((d) => matches(`${searchText(d)} ${(d.product_names ?? "").toLowerCase()}`, query)),
    [docs, query],
  );
  const docCounts = useMemo(() => {
    const c = { all: searchedDocs.length, in: 0, out: 0 };
    for (const d of searchedDocs) c[d.direction]++;
    return c;
  }, [searchedDocs]);
  const visibleDocs = useMemo(
    () => (dir === "all" ? searchedDocs : searchedDocs.filter((d) => d.direction === dir)),
    [searchedDocs, dir],
  );

  // ── Mode kartu stok (SKU dipilih) ──
  const inRange = useMemo(
    () => (movements ?? []).filter((m) => m.doc_date >= from && m.doc_date <= to),
    [movements, from, to],
  );
  const card = useMemo(() => {
    const all = movements ?? [];
    // `all` urut terbaru di atas → saldo awal = saldo mutasi terakhir sebelum `from`
    const before = all.find((m) => m.doc_date < from);
    const last = all.find((m) => m.doc_date <= to);
    let qtyIn = 0;
    let qtyOut = 0;
    for (const m of inRange) {
      if (m.direction === "in") qtyIn += m.qty;
      else qtyOut += m.qty;
    }
    return { opening: before?.balance ?? 0, closing: last?.balance ?? 0, qtyIn, qtyOut };
  }, [movements, inRange, from, to]);
  const searchedMoves = useMemo(() => inRange.filter((m) => matches(searchText(m), query)), [inRange, query]);
  const moveCounts = useMemo(() => {
    const c = { all: searchedMoves.length, in: 0, out: 0 };
    for (const m of searchedMoves) c[m.direction]++;
    return c;
  }, [searchedMoves]);
  const visibleMoves = useMemo(
    () => (dir === "all" ? searchedMoves : searchedMoves.filter((m) => m.direction === dir)),
    [searchedMoves, dir],
  );

  const sku = skuId ? rowById.get(skuId) : undefined;
  const counts = skuId ? moveCounts : docCounts;
  const net = stats.qtyIn - stats.qtyOut;
  const monthName = fmtMonthYear(today).split(" ")[0];

  async function exportExcel() {
    setExporting(true);
    try {
      if (skuId && sku) {
        await exportXlsx(`kartu-stok-${sku.code.toLowerCase()}`, today, {
          name: "Kartu Stok",
          rows: visibleMoves,
          columns: [
            { header: "Tanggal", width: 14, value: (m) => m.doc_date },
            { header: "No Catatan", width: 20, value: (m) => m.doc_no },
            { header: "Tipe", width: 14, value: (m) => TYPE_LABEL[m.type] },
            { header: "Keterangan", width: 24, value: (m) => movementTitle(m) },
            { header: "Catatan", width: 30, value: (m) => m.note },
            { header: "Qty", numFmt: "#,##0", value: (m) => (m.direction === "in" ? m.qty : -m.qty) },
            { header: "Saldo", numFmt: "#,##0", value: (m) => m.balance },
          ],
        });
      } else {
        await exportXlsx("mutasi", today, {
          name: "Riwayat Mutasi",
          rows: visibleDocs,
          columns: [
            { header: "Tanggal", width: 14, value: (d) => d.doc_date },
            { header: "Jam", width: 8, value: (d) => fmtTime(d.created_at) },
            { header: "No Catatan", width: 20, value: (d) => d.doc_no },
            { header: "Arah", width: 10, value: (d) => (d.direction === "in" ? "Masuk" : "Keluar") },
            { header: "Tipe", width: 14, value: (d) => TYPE_LABEL[d.type] },
            { header: "Channel", width: 14, value: (d) => (d.channel ? CHANNEL_LABEL[d.channel] : null) },
            { header: "Ref Batch", width: 18, value: (d) => d.batch_no },
            { header: "Jumlah SKU", numFmt: "#,##0", value: (d) => d.sku_count },
            { header: "Total Qty", numFmt: "#,##0", value: (d) => (d.direction === "in" ? d.total_qty : -d.total_qty) },
            { header: "Produk", width: 40, value: (d) => (d.product_names ?? "").split("|").join(", ") },
            { header: "Catatan", width: 30, value: (d) => d.note },
            { header: "Admin", width: 16, value: (d) => d.created_by_name },
          ],
        });
      }
    } catch (e) {
      toast.error(`Gagal export: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  const rangeLabel = `${fmtDate(from)} – ${fmtDate(to)}`;

  return (
    <>
      <StatGrid cols={4}>
        <StatCard
          label="Total Masuk Bulan Ini"
          tone="pos"
          valueTone="pos"
          value={fmtSigned(stats.qtyIn)}
          unit="pcs"
          sub={`${fmtInt(stats.docsIn)} catatan`}
        />
        <StatCard
          label="Total Keluar Bulan Ini"
          tone="neg"
          valueTone="neg"
          value={fmtSigned(-stats.qtyOut)}
          unit="pcs"
          sub={`${fmtInt(stats.docsOut)} catatan`}
        />
        <StatCard
          label="Perubahan Net"
          tone="warn"
          valueTone={net < 0 ? "warn" : net > 0 ? "pos" : undefined}
          value={fmtSigned(net)}
          unit="pcs"
          sub={net < 0 ? `Stock turun di ${monthName}` : net > 0 ? `Stock naik di ${monthName}` : "Tidak ada perubahan"}
        />
        <StatCard label="Adjustment" tone="grey" value={fmtInt(stats.adjustments)} sub="Catatan opname + koreksi bulan ini" />
      </StatGrid>

      <Panel
        title={sku ? `Kartu Stok — ${sku.label}` : "Timeline Mutasi"}
        sub={
          sku ? (
            <>
              {sku.code} · {rangeLabel} ·{" "}
              <button type="button" className="cursor-pointer font-semibold text-primary-2" onClick={() => openSkuDetail(sku.id)}>
                Lihat detail PPIC
              </button>
            </>
          ) : (
            `Auto dari Barang Masuk & Barang Keluar · ${rangeLabel}`
          )
        }
        actions={
          <Button
            onClick={exportExcel}
            loading={exporting}
            disabled={skuId ? visibleMoves.length === 0 : visibleDocs.length === 0}
          >
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
        }
      >
        <Toolbar>
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setLimit(STEP);
              setPage(0);
            }}
            placeholder={skuId ? "Cari catatan, batch, tipe..." : "Cari catatan, batch, produk..."}
          />
          {(["all", "in", "out"] as const).map((k) => (
            <FilterChip
              key={k}
              active={dir === k}
              count={counts[k]}
              onClick={() => {
                setDir(k);
                setLimit(STEP);
                setPage(0);
              }}
            >
              {k === "all" ? "Semua" : k === "in" ? "Masuk" : "Keluar"}
            </FilterChip>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <input
              type="date"
              className="date-input"
              value={from}
              max={to}
              onChange={(e) => setRange(e.target.value, to)}
              aria-label="Dari tanggal"
            />
            <span className="text-[12px] text-grey-1">s/d</span>
            <input
              type="date"
              className="date-input"
              value={to}
              min={from}
              max={today}
              onChange={(e) => setRange(from, e.target.value)}
              aria-label="Sampai tanggal"
            />
            <div className="flex w-[280px] items-center gap-1">
              <Combobox
                className="flex-1"
                options={skuOptions}
                value={skuId}
                onChange={(v) => {
                  setSkuId(v);
                  setPage(0);
                }}
                placeholder="Filter SKU (kartu stok)..."
              />
              {skuId && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Hapus filter SKU"
                  onClick={() => {
                    setSkuId(null);
                    setMovements(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </Toolbar>

        {skuId ? (
          <>
            {movements !== null && (
              <div className="mb-3 grid grid-cols-4 gap-3">
                {[
                  { label: "Saldo awal", value: fmtInt(card.opening), cls: "text-ink" },
                  { label: "Masuk", value: fmtSigned(card.qtyIn), cls: "text-pos" },
                  { label: "Keluar", value: fmtSigned(-card.qtyOut), cls: "text-neg" },
                  { label: "Saldo akhir", value: fmtInt(card.closing), cls: "text-ink" },
                ].map((k) => (
                  <div key={k.label} className="rounded-[10px] bg-bg px-4 py-3">
                    <div className="mb-1 text-[10.5px] font-bold tracking-[0.08em] text-grey-1 uppercase">{k.label}</div>
                    <div className={cn("num text-lg leading-none font-extrabold", k.cls)}>{k.value}</div>
                  </div>
                ))}
              </div>
            )}
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-[110px]">Tanggal</th>
                  <th className="w-[120px]">Tipe</th>
                  <th>Catatan</th>
                  <th className="num">Qty</th>
                  <th className="num">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {movements === null && <SkeletonRows cols={5} rows={6} />}
                {movements !== null && visibleMoves.length === 0 && (
                  <EmptyRow colSpan={5}>Tidak ada mutasi SKU ini di rentang tanggal tersebut.</EmptyRow>
                )}
                {visibleMoves.slice(page * pageSize, (page + 1) * pageSize).map((m) => (
                  <tr key={m.document_id}>
                    <td>
                      <div className="font-medium text-ink-2">{fmtDate(m.doc_date)}</div>
                      <div className="text-[11px] text-grey-1">{fmtTime(m.created_at)}</div>
                    </td>
                    <td>
                      <Badge tone={TYPE_TONE[m.type]}>{TYPE_LABEL[m.type]}</Badge>
                    </td>
                    <td>
                      <div className="font-semibold text-ink">{movementTitle(m)}</div>
                      <div className="text-[11.5px] text-grey-1">{m.note ? `${m.note} · ${m.doc_no}` : m.doc_no}</div>
                    </td>
                    <td className={cn("num", m.direction === "in" ? "text-pos" : "text-neg")}>
                      <strong>{signedQty(m.direction, m.qty)}</strong>
                    </td>
                    <td className="num">
                      <strong className={m.balance < 0 ? "text-neg" : undefined}>{fmtInt(m.balance)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleMoves.length > 0 && (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={visibleMoves.length}
                onPage={setPage}
                onPageSize={(s) => {
                  setPageSize(s);
                  setPage(0);
                }}
              />
            )}
          </>
        ) : (
          <div className={cn(pending && "opacity-60 transition-opacity")}>
            {pending &&
              visibleDocs.length === 0 &&
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="mut-entry">
                  <div className="skeleton h-3 w-10" />
                  <div className="skeleton h-3 w-56" />
                  <div className="skeleton h-3 w-12" />
                </div>
              ))}
            {!pending && visibleDocs.length === 0 && (
              <div className="py-12 text-center text-[13px] text-grey-1">
                {docs.length === 0 ? "Belum ada mutasi di rentang tanggal ini." : "Tidak ada catatan yang cocok dengan filter."}
              </div>
            )}
            {visibleDocs.slice(0, limit).map((d) => {
              const summary = productSummary(d.product_names);
              return (
                <div key={d.id} className="mut-entry">
                  <div className="text-[11.5px] leading-snug font-medium text-grey-1">
                    {fmtDateShort(d.doc_date)}
                    <br />
                    {fmtTime(d.created_at)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                      <span className="truncate">
                        {movementTitle(d)} · {fmtInt(d.sku_count)} SKU
                      </span>
                      <Badge tone={TYPE_TONE[d.type]} className="!px-2 !py-px !text-[10px]">
                        {TYPE_LABEL[d.type]}
                      </Badge>
                    </div>
                    <div className="mt-0.5 truncate text-[11.5px] font-medium text-grey-1">
                      {[d.note, summary, d.doc_no].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="num text-right">
                    <div className={cn("text-sm font-extrabold", d.direction === "in" ? "text-pos" : "text-neg")}>
                      {signedQty(d.direction, d.total_qty)} pcs
                    </div>
                    {d.created_by_name && <div className="mt-px text-[10.5px] font-medium text-grey-1">{d.created_by_name}</div>}
                  </div>
                </div>
              );
            })}
            {visibleDocs.length > 0 && (
              <div className="mt-3 flex items-center justify-between border-t border-line-2 pt-3 text-[12px] text-grey-1">
                <div>
                  {fmtInt(Math.min(limit, visibleDocs.length))} dari {fmtInt(visibleDocs.length)} catatan
                </div>
                {limit < visibleDocs.length && (
                  <Button size="sm" onClick={() => setLimit((l) => l + STEP)}>
                    Tampilkan {fmtInt(Math.min(STEP, visibleDocs.length - limit))} lagi
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </Panel>
    </>
  );
}
