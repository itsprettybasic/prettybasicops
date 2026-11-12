"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Panel, Toolbar } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyRow, Pagination } from "@/components/ui/table-parts";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { CalcFormModal } from "@/components/fabric-calc/calc-form-modal";
import type { CalcProduct, FabricCalc, PoOption } from "@/components/fabric-calc/types";
import { fabricNeeds, fmtFabric, needsSummary } from "@/lib/fabric-calc";
import { fmtDate, fmtInt } from "@/lib/format";

export function CalcList({
  calcs,
  products,
  pos,
  loadError,
}: {
  calcs: FabricCalc[];
  products: CalcProduct[];
  pos: PoOption[];
  loadError: string | null;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [editing, setEditing] = useState<FabricCalc | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (loadError) toast.error(`Gagal memuat data: ${loadError}`);
  }, [loadError]);

  const filled = products.filter((p) => p.fabric_unit && p.fabric_qty && p.fabric_pcs).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return calcs;
    return calcs.filter((c) =>
      [c.calc_no, c.title, c.po_no, c.note, ...c.lines.map((l) => l.product_name), ...c.lines.map((l) => l.fabric_type)].some((v) =>
        (v ?? "").toLowerCase().includes(q),
      ),
    );
  }, [calcs, query]);
  const pageRows = visible.slice(page * pageSize, (page + 1) * pageSize);

  function open(c: FabricCalc | null) {
    setEditing(c);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }

  return (
    <>
      <StatGrid cols={4}>
        <StatCard label="Riwayat Perhitungan" tone="primary" value={fmtInt(calcs.length)} unit="tersimpan" />
        <StatCard
          label="Produk Siap Dihitung"
          tone={filled === products.length ? "pos" : "warn"}
          value={fmtInt(filled)}
          unit={`/ ${fmtInt(products.length)}`}
          sub="Pemakaian kain sudah diisi di Database Produk"
        />
        <StatCard
          label="Terakhir Dihitung"
          tone="grey"
          value={calcs[0] ? fmtDate(calcs[0].calc_date) : "—"}
          sub={calcs[0] ? (calcs[0].title ?? calcs[0].calc_no) : undefined}
        />
        <StatCard
          label="Kain Terakhir"
          tone="grey"
          value={
            calcs[0]
              ? Object.entries(fabricNeeds(calcs[0].lines).totals)
                  .map(([u, q]) => `${fmtFabric(q!)} ${u}`)
                  .join(" · ") || "—"
              : "—"
          }
          sub="Total kebutuhan di perhitungan terakhir"
        />
      </StatGrid>

      <Panel
        title="Riwayat Perhitungan Kain"
        sub="Klik baris untuk lihat hasil, edit, export, atau hapus"
        actions={
          <Button variant="primary" onClick={() => open(null)}>
            + Hitung Kain
          </Button>
        }
      >
        <Toolbar>
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(0);
            }}
            placeholder="Cari nama, no, PO, produk, jenis kain..."
          />
        </Toolbar>

        <table className="data-table">
          <thead>
            <tr>
              <th>No / Nama</th>
              <th>Tanggal</th>
              <th>PO</th>
              <th className="num">Produk</th>
              <th className="num">Total Pcs</th>
              <th>Kebutuhan Kain</th>
              <th>Admin</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <EmptyRow colSpan={7}>
                {calcs.length === 0 ? "Belum ada perhitungan. Klik “+ Hitung Kain” untuk mulai." : "Tidak ada yang cocok dengan pencarian."}
              </EmptyRow>
            )}
            {pageRows.map((c) => {
              const pcs = c.lines.reduce((s, l) => s + l.qty_pcs, 0);
              const { missing } = fabricNeeds(c.lines);
              return (
                <tr key={c.id} className="clickable" onClick={() => open(c)}>
                  <td>
                    <div className="font-semibold text-ink">{c.title ?? c.calc_no}</div>
                    {c.title && <div className="text-[11.5px] text-grey-1">{c.calc_no}</div>}
                  </td>
                  <td className="whitespace-nowrap">{fmtDate(c.calc_date)}</td>
                  <td>{c.po_no ?? <span className="text-grey-2">—</span>}</td>
                  <td className="num">{fmtInt(new Set(c.lines.map((l) => l.product_id)).size)}</td>
                  <td className="num">{fmtInt(pcs)}</td>
                  <td className="max-w-[360px]">
                    <div className="truncate text-[12.5px] font-semibold text-ink-2" title={needsSummary(c.lines, 99)}>
                      {needsSummary(c.lines)}
                    </div>
                    {missing.length > 0 && (
                      <div className="text-[11px] text-warn-text">{fmtInt(missing.length)} produk belum ada data kain</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-ink-2">{c.updated_by_name ?? c.created_by_name ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={visible.length}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(0);
            }}
          />
        )}
      </Panel>

      {formOpen && (
        <CalcFormModal key={formKey} open={formOpen} onOpenChange={setFormOpen} calc={editing} products={products} pos={pos} />
      )}
    </>
  );
}
