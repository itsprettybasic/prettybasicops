"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO, subDays } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { Panel, Toolbar } from "@/components/ui/panel";
import { SearchInput } from "@/components/ui/search-input";
import { FilterChip } from "@/components/ui/filter-chip";
import { Button } from "@/components/ui/button";
import { EmptyRow } from "@/components/ui/table-parts";
import { fmtDate, fmtInt, fmtTime } from "@/lib/format";
import { fmtDuration } from "@/lib/packing/media";
import {
  PACK_STATUS_LABEL,
  type PackRecord,
  type PackStatus,
} from "@/lib/packing/types";
import { PackStatusBadge, VideoStateLabel } from "./pack-status-badge";
import { PackDetailModal } from "./pack-detail-modal";

const PAGE_SIZE = 50;
const COLS = 7;

export function PackHistory({
  isManager,
  userId,
  today,
}: {
  isManager: boolean;
  userId: string;
  today: string;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState(() =>
    format(subDays(parseISO(today), 6), "yyyy-MM-dd"),
  );
  const [to, setTo] = useState(today);
  const [marketplace, setMarketplace] = useState("");
  const [packer, setPacker] = useState("");
  const [status, setStatus] = useState<"" | PackStatus>("");

  const [rows, setRows] = useState<PackRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marketplaces, setMarketplaces] = useState<string[]>([]);
  const [packers, setPackers] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<PackRecord | null>(null);

  // Debounce cari resi
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim().toUpperCase()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Opsi filter: marketplace dari Pengaturan, petugas dari rekaman (khusus admin/supervisor)
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("pack_settings")
      .select("marketplaces")
      .maybeSingle()
      .then(({ data }) =>
        setMarketplaces((data?.marketplaces as string[] | undefined) ?? []),
      );
    if (!isManager) return;
    supabase
      .from("pack_records")
      .select("packer_id, packer_name")
      .order("created_at", { ascending: false })
      .limit(2000)
      .then(({ data }) => {
        const map = new Map<string, string>();
        for (const r of (data ?? []) as {
          packer_id: string;
          packer_name: string;
        }[]) {
          if (!map.has(r.packer_id)) map.set(r.packer_id, r.packer_name);
        }
        setPackers(
          [...map]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name, "id")),
        );
      });
  }, [isManager]);

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      setError(null);
      let q = createClient()
        .from("pack_records")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (from) q = q.gte("created_at", `${from}T00:00:00+07:00`);
      if (to) q = q.lte("created_at", `${to}T23:59:59.999+07:00`);
      if (query) q = q.ilike("resi", `%${query.replace(/[%_]/g, "")}%`);
      if (marketplace) q = q.eq("marketplace", marketplace);
      if (status) q = q.eq("status", status);
      if (isManager && packer) q = q.eq("packer_id", packer);
      const { data, count, error: err } = await q;
      setLoading(false);
      if (err) {
        setError(err.message);
        return;
      }
      const list = (data ?? []) as PackRecord[];
      setRows((prev) => (offset === 0 ? list : [...prev, ...list]));
      setTotal(count ?? 0);
    },
    [from, to, query, marketplace, status, packer, isManager],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const marketplaceChips = useMemo(() => {
    const set = new Set(marketplaces);
    for (const r of rows) set.add(r.marketplace);
    return [...set];
  }, [marketplaces, rows]);

  const empty = !loading && rows.length === 0;
  const emptyText = error
    ? `Gagal memuat: ${error}`
    : "Belum ada paket yang cocok dengan filter.";

  return (
    <>
      <Panel
        title="Daftar Paket"
        sub={
          loading && rows.length === 0
            ? "Memuat…"
            : `${fmtInt(total)} paket${isManager ? "" : " · hanya rekaman Anda"}`
        }
      >
        <Toolbar>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Cari nomor resi..."
          />
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
            <input
              type="date"
              className="date-input min-w-0 flex-1 sm:flex-none"
              value={from}
              max={to || today}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Dari tanggal"
            />
            <span className="text-[12px] text-grey-1">s/d</span>
            <input
              type="date"
              className="date-input min-w-0 flex-1 sm:flex-none"
              value={to}
              min={from}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Sampai tanggal"
            />
          </div>
          {isManager && (
            <select
              className="select-input"
              value={packer}
              onChange={(e) => setPacker(e.target.value)}
              aria-label="Petugas"
            >
              <option value="">Semua petugas</option>
              {packers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === userId ? " (Anda)" : ""}
                </option>
              ))}
            </select>
          )}
          <select
            className="select-input"
            value={status}
            onChange={(e) => setStatus(e.target.value as "" | PackStatus)}
            aria-label="Status"
          >
            <option value="">Semua status</option>
            {(Object.keys(PACK_STATUS_LABEL) as PackStatus[]).map((s) => (
              <option key={s} value={s}>
                {PACK_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Toolbar>
        {marketplaceChips.length > 0 && (
          <div className="-mt-1 mb-4 flex flex-wrap gap-2">
            <FilterChip
              active={!marketplace}
              onClick={() => setMarketplace("")}
            >
              Semua
            </FilterChip>
            {marketplaceChips.map((m) => (
              <FilterChip
                key={m}
                active={marketplace === m}
                onClick={() => setMarketplace(m)}
              >
                {m}
              </FilterChip>
            ))}
          </div>
        )}

        {/* HP: kartu */}
        <div className="space-y-2.5 lg:hidden">
          {empty && (
            <div className="py-10 text-center text-[13px] text-grey-1">
              {emptyText}
            </div>
          )}
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelected(r)}
              className="block w-full cursor-pointer rounded-xl border border-line bg-white px-4 py-3 text-left active:bg-bg"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-bold tracking-[-0.01em] text-ink">
                    {r.resi}
                  </div>
                  <div className="mt-0.5 text-[12px] text-grey-1">
                    {r.marketplace} · {r.packer_name}
                  </div>
                </div>
                <PackStatusBadge status={r.status} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-[12px]">
                <span className="num text-ink-3">
                  {fmtDate(r.created_at)} · {fmtTime(r.created_at)}
                  {r.duration_sec !== null &&
                    ` · ${fmtDuration(r.duration_sec)}`}
                </span>
                <VideoStateLabel record={r} className="truncate text-right" />
              </div>
            </button>
          ))}
        </div>

        {/* Desktop: tabel (dibungkus div karena .data-table punya display sendiri di layar kecil) */}
        <div className="hidden lg:block">
          <table className="data-table">
            <thead>
              <tr>
                <th>Resi</th>
                <th>Marketplace</th>
                <th>Petugas</th>
                <th>Waktu</th>
                <th className="num">Durasi</th>
                <th>Status</th>
                <th>Video</th>
              </tr>
            </thead>
            <tbody>
              {empty && <EmptyRow colSpan={COLS}>{emptyText}</EmptyRow>}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="clickable"
                  onClick={() => setSelected(r)}
                >
                  <td>
                    <div className="font-semibold text-ink">{r.resi}</div>
                    {r.version > 1 && (
                      <div className="text-[11px] text-grey-1">
                        Rekam ulang ke-{r.version}
                      </div>
                    )}
                  </td>
                  <td>{r.marketplace}</td>
                  <td>{r.packer_name}</td>
                  <td className="num whitespace-nowrap">
                    {fmtDate(r.created_at)} · {fmtTime(r.created_at)}
                  </td>
                  <td className="num">
                    {r.duration_sec === null
                      ? "—"
                      : fmtDuration(r.duration_sec)}
                  </td>
                  <td>
                    <PackStatusBadge status={r.status} />
                  </td>
                  <td>
                    <VideoStateLabel record={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length < total && (
          <div className="mt-4 flex justify-center">
            <Button onClick={() => load(rows.length)} loading={loading}>
              Muat lagi ({fmtInt(total - rows.length)})
            </Button>
          </div>
        )}
      </Panel>

      <PackDetailModal record={selected} onClose={() => setSelected(null)} />
    </>
  );
}
