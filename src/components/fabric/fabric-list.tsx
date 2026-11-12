"use client";

import { useMemo, useState } from "react";
import { Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Panel, Toolbar } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterChip } from "@/components/ui/filter-chip";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyRow, Pagination } from "@/components/ui/table-parts";
import { exportXlsx } from "@/lib/excel/download";
import { fmtDate, fmtInt, fmtKg, fmtMonthYear } from "@/lib/format";
import { cn } from "@/lib/cn";
import { DocumentButton } from "@/components/print/document-viewer";
import { FabricDetailModal } from "./fabric-detail-modal";
import { FabricFormModal } from "./fabric-form-modal";

export interface FabricShipmentRow {
  id: string;
  sj_no: string;
  ship_date: string;
  vendor_id: string;
  vendor_name: string;
  po_id: string | null;
  po_no: string | null;
  status: "dikirim" | "diterima";
  received_date: string | null;
  received_by: string | null;
  driver_name: string | null;
  vehicle_no: string | null;
  note: string | null;
  created_by_name: string | null;
  created_at: string;
  line_count: number;
  total_kg: number | string;
  total_roll: number;
  fabric_types: string | null;
  colors: string | null;
}

export interface FabricLineRow {
  shipment_id: string;
  line_no: number;
  fabric_type: string;
  color: string;
  qty_kg: number | string;
  roll_count: number | null;
  note: string | null;
}

type StatusFilter = "all" | "dikirim" | "diterima";

const split = (s: string | null) => (s ?? "").split("|").filter(Boolean);

export function FabricList({
  shipments,
  lines,
  today,
}: {
  shipments: FabricShipmentRow[];
  lines: FabricLineRow[];
  today: string;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [vendor, setVendor] = useState("");
  const [fabric, setFabric] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const linesBy = useMemo(() => {
    const m = new Map<string, FabricLineRow[]>();
    for (const l of lines) m.set(l.shipment_id, [...(m.get(l.shipment_id) ?? []), l]);
    return m;
  }, [lines]);

  const vendors = useMemo(
    () => [...new Map(shipments.map((s) => [s.vendor_id, s.vendor_name])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [shipments],
  );
  const fabrics = useMemo(() => [...new Set(lines.map((l) => l.fabric_type))].sort((a, b) => a.localeCompare(b)), [lines]);

  const stats = useMemo(() => {
    const month = today.slice(0, 7);
    const thisMonth = shipments.filter((s) => s.ship_date.slice(0, 7) === month);
    const pending = shipments.filter((s) => s.status === "dikirim");
    const byVendor = new Map<string, number>();
    for (const s of thisMonth) byVendor.set(s.vendor_name, (byVendor.get(s.vendor_name) ?? 0) + Number(s.total_kg));
    const top = [...byVendor.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      monthKg: thisMonth.reduce((s, r) => s + Number(r.total_kg), 0),
      monthCount: thisMonth.length,
      pending: pending.length,
      pendingKg: pending.reduce((s, r) => s + Number(r.total_kg), 0),
      top,
      allKg: shipments.reduce((s, r) => s + Number(r.total_kg), 0),
    };
  }, [shipments, today]);

  // Semua filter kecuali status (untuk hitungan chip)
  const base = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return shipments.filter((s) => {
      if (vendor && s.vendor_id !== vendor) return false;
      if (fabric && !split(s.fabric_types).includes(fabric)) return false;
      if (from && s.ship_date < from) return false;
      if (to && s.ship_date > to) return false;
      if (words.length === 0) return true;
      const hay = [s.sj_no, s.vendor_name, s.po_no, s.driver_name, s.vehicle_no, s.note, s.fabric_types, s.colors]
        .join(" ")
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [shipments, search, vendor, fabric, from, to]);

  const filtered = useMemo(() => (status === "all" ? base : base.filter((s) => s.status === status)), [base, status]);
  const counts = {
    all: base.length,
    dikirim: base.filter((s) => s.status === "dikirim").length,
    diterima: base.filter((s) => s.status === "diterima").length,
  };
  const filteredKg = filtered.reduce((s, r) => s + Number(r.total_kg), 0);
  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const hasFilter = !!(search.trim() || vendor || fabric || from || to || status !== "all");
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(0);
  };

  async function exportExcel() {
    type Row = { s: FabricShipmentRow; l: FabricLineRow };
    const rows: Row[] = filtered.flatMap((s) =>
      (linesBy.get(s.id) ?? []).filter((l) => !fabric || l.fabric_type === fabric).map((l) => ({ s, l })),
    );
    try {
      await exportXlsx<Row>("pengiriman-kain", today, {
        name: "Pengiriman Kain",
        rows,
        columns: [
          { header: "No Surat Jalan", width: 16, value: (r) => r.s.sj_no },
          { header: "Tanggal Kirim", width: 14, value: (r) => r.s.ship_date },
          { header: "Vendor", width: 24, value: (r) => r.s.vendor_name },
          { header: "No PO", width: 14, value: (r) => r.s.po_no },
          { header: "No Baris", width: 9, value: (r) => r.l.line_no },
          { header: "Jenis Kain", width: 22, value: (r) => r.l.fabric_type },
          { header: "Warna", width: 16, value: (r) => r.l.color },
          { header: "Qty (kg)", numFmt: "#,##0.00", value: (r) => Number(r.l.qty_kg) },
          { header: "Roll", numFmt: "#,##0", value: (r) => r.l.roll_count },
          { header: "Keterangan", width: 24, value: (r) => r.l.note },
          { header: "Status", width: 12, value: (r) => (r.s.status === "diterima" ? "Diterima" : "Dikirim") },
          { header: "Tgl Diterima", width: 14, value: (r) => r.s.received_date },
          { header: "Sopir", width: 16, value: (r) => r.s.driver_name },
          { header: "No Kendaraan", width: 14, value: (r) => r.s.vehicle_no },
          { header: "Catatan", width: 24, value: (r) => r.s.note },
          { header: "Admin", width: 16, value: (r) => r.s.created_by_name },
        ],
      });
      toast.success(`Export ${fmtInt(rows.length)} baris kain berhasil`);
    } catch (e) {
      toast.error(`Gagal export: ${e instanceof Error ? e.message : "terjadi kesalahan"}`);
    }
  }

  return (
    <>
      <StatGrid cols={4}>
        <StatCard
          label="Kirim Bulan Ini"
          tone="primary"
          value={fmtKg(stats.monthKg)}
          unit="kg"
          sub={`${fmtMonthYear(today)} · ${fmtInt(stats.monthCount)} surat jalan`}
        />
        <StatCard
          label="Belum Dikonfirmasi"
          tone="warn"
          value={fmtInt(stats.pending)}
          sub={`${fmtKg(stats.pendingKg)} kg belum ditandai diterima vendor`}
          active={status === "dikirim"}
          onClick={() => reset(setStatus)(status === "dikirim" ? "all" : "dikirim")}
        />
        <StatCard
          label="Vendor Terbanyak"
          tone="pos"
          value={stats.top ? fmtKg(stats.top[1]) : "—"}
          unit="kg"
          sub={stats.top ? `${stats.top[0]} · bulan ini` : "Belum ada pengiriman bulan ini"}
        />
        <StatCard label="Total Semua" tone="grey" value={fmtKg(stats.allKg)} unit="kg" sub={`${fmtInt(shipments.length)} surat jalan`} />
      </StatGrid>

      <Panel
        title="Daftar Pengiriman Kain"
        sub="Klik baris untuk lihat rincian, cetak Surat Jalan, edit, atau hapus"
        actions={
          <>
            <Button onClick={exportExcel} disabled={filtered.length === 0}>
              <Download className="h-3.5 w-3.5" /> Export Excel
            </Button>
            <Button variant="blue" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" /> Catat Pengiriman
            </Button>
          </>
        }
      >
        <Toolbar>
          <SearchInput value={search} onChange={reset(setSearch)} placeholder="Cari no SJ, vendor, kain, warna, sopir..." />
          <FilterChip active={status === "all"} count={counts.all} onClick={() => reset(setStatus)("all")}>
            Semua
          </FilterChip>
          <FilterChip active={status === "dikirim"} count={counts.dikirim} onClick={() => reset(setStatus)("dikirim")}>
            Dikirim
          </FilterChip>
          <FilterChip active={status === "diterima"} count={counts.diterima} onClick={() => reset(setStatus)("diterima")}>
            Diterima Vendor
          </FilterChip>
        </Toolbar>
        <Toolbar>
          <select className="select-input w-full sm:w-auto" value={vendor} onChange={(e) => reset(setVendor)(e.target.value)}>
            <option value="">Semua Vendor</option>
            {vendors.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select className="select-input w-full sm:w-auto" value={fabric} onChange={(e) => reset(setFabric)(e.target.value)}>
            <option value="">Semua Jenis Kain</option>
            {fabrics.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:flex-nowrap">
            <input
              type="date"
              className="date-input min-w-0 flex-1 sm:flex-none"
              value={from}
              max={to || undefined}
              onChange={(e) => reset(setFrom)(e.target.value)}
              aria-label="Dari tanggal"
            />
            <span className="text-[12px] text-grey-2">s/d</span>
            <input
              type="date"
              className="date-input min-w-0 flex-1 sm:flex-none"
              value={to}
              min={from || undefined}
              onChange={(e) => reset(setTo)(e.target.value)}
              aria-label="Sampai tanggal"
            />
          </div>
        </Toolbar>

        <div className="-mt-1 mb-3 flex items-center justify-between text-[12px] text-grey-1">
          <span>
            {fmtInt(filtered.length)} surat jalan · <strong className="text-ink-2">{fmtKg(filteredKg)} kg</strong>
          </span>
          {hasFilter && (
            <button
              type="button"
              className="cursor-pointer font-semibold text-primary-2 hover:underline"
              onClick={() => {
                setSearch("");
                setStatus("all");
                setVendor("");
                setFabric("");
                setFrom("");
                setTo("");
                setPage(0);
              }}
            >
              Reset filter
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>No Surat Jalan</th>
              <th>Tanggal</th>
              <th>Vendor</th>
              <th>Kain</th>
              <th className="num">Qty (kg)</th>
              <th className="num">Roll</th>
              <th>Status</th>
              <th>Admin</th>
              <th className="text-right">Dokumen</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <EmptyRow colSpan={9}>
                {shipments.length === 0 ? (
                  <button type="button" onClick={() => setCreating(true)} className="cursor-pointer font-semibold text-primary-2 hover:underline">
                    Belum ada pengiriman kain. Catat yang pertama →
                  </button>
                ) : (
                  "Tidak ada pengiriman yang cocok dengan filter."
                )}
              </EmptyRow>
            )}
            {pageRows.map((s) => {
              const ls = linesBy.get(s.id) ?? [];
              const shown = ls.slice(0, 2).map((l) => `${l.fabric_type} ${l.color} (${fmtKg(l.qty_kg)} kg)`);
              return (
                <tr key={s.id} className="clickable" onClick={() => setDetailId(s.id)}>
                  <td className="whitespace-nowrap">
                    <strong className="text-primary-2">{s.sj_no}</strong>
                    {s.po_no && <div className="text-[11.5px] text-grey-1">{s.po_no}</div>}
                  </td>
                  <td className="whitespace-nowrap text-ink-3">{fmtDate(s.ship_date)}</td>
                  <td className="font-medium text-ink-2">{s.vendor_name}</td>
                  <td className="max-w-[300px]">
                    <div className="font-semibold text-ink">{fmtInt(s.line_count)} baris</div>
                    <div className="truncate text-[11.5px] text-grey-1">
                      {shown.join(", ")}
                      {ls.length > 2 && `, +${ls.length - 2} lainnya`}
                    </div>
                  </td>
                  <td className="num">
                    <strong>{fmtKg(s.total_kg)}</strong>
                  </td>
                  <td className="num">{s.total_roll > 0 ? fmtInt(s.total_roll) : <span className="text-grey-2">—</span>}</td>
                  <td>
                    <Badge tone={s.status === "diterima" ? "pos" : "warn"}>{s.status === "diterima" ? "Diterima" : "Dikirim"}</Badge>
                    {s.received_date && <div className="mt-0.5 text-[11px] text-grey-1">{fmtDate(s.received_date)}</div>}
                  </td>
                  <td className={cn("whitespace-nowrap text-ink-2")}>{s.created_by_name ?? "—"}</td>
                  <td className="text-right">
                    <DocumentButton
                      url={`/cetak/surat-jalan/${s.id}`}
                      fileName={s.sj_no}
                      title="Surat Jalan"
                      label="Surat Jalan"
                      className={"inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] font-semibold text-ink-2 hover:border-primary-2 hover:text-primary-2"}
                    />
                  </td>
                </tr>
              );
            })}
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

      {detailId && <FabricDetailModal key={detailId} id={detailId} onClose={() => setDetailId(null)} />}
      {creating && <FabricFormModal onClose={() => setCreating(false)} onSaved={(id) => setDetailId(id)} />}
    </>
  );
}
