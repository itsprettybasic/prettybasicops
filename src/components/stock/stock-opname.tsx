"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAppData } from "@/components/providers/app-data";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Panel, Toolbar } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { FilterChip } from "@/components/ui/filter-chip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyRow, SkuCell } from "@/components/ui/table-parts";
import { matchOption } from "@/components/ui/combobox";
import { createStockOpname } from "@/app/actions/stock";
import {
  buildWorkbook,
  downloadWorkbook,
  type SheetSpec,
} from "@/lib/excel/download";
import {
  cellText,
  isBlank,
  matchHeaders,
  readSpreadsheet,
} from "@/lib/excel/parse";
import { fmtDate, fmtInt, fmtSigned, fmtTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { PpicRow } from "@/lib/data/ppic";

export interface LastOpname {
  doc_date: string;
  created_at: string;
  created_by_name: string | null;
}

type Filter = "all" | "todo" | "done" | "diff";

const DRAFT_KEY = "pb-opname-draft";

function loadDraft(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveDraft(counts: Record<string, string>) {
  try {
    if (Object.keys(counts).length)
      localStorage.setItem(DRAFT_KEY, JSON.stringify(counts));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // penyimpanan browser tidak tersedia — draft hanya hilang saat refresh
  }
}

function parseCount(v: string | undefined): number | null {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

export function StockOpname({ lastOpname }: { lastOpname: LastOpname | null }) {
  const router = useRouter();
  const { rows, today } = useAppData();
  const activeRows = useMemo(
    () =>
      rows
        .filter((r) => r.is_active)
        .sort((a, b) => a.label.localeCompare(b.label, "id")),
    [rows],
  );
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [docDate, setDocDate] = useState(today);
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement | null>());

  // Draft hitungan disimpan di browser supaya tidak hilang kalau halaman tertutup di tengah opname
  useEffect(() => {
    setCounts(loadDraft());
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) saveDraft(counts);
  }, [counts, loaded]);

  const products = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of activeRows) m.set(r.product_id, r.product_name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "id"));
  }, [activeRows]);

  const entries = useMemo(
    () =>
      activeRows.map((r) => {
        const counted = parseCount(counts[r.id]);
        const diff =
          counted === null || Number.isNaN(counted) ? null : counted - r.stock;
        return { row: r, counted, diff };
      }),
    [activeRows, counts],
  );

  const stats = useMemo(() => {
    let counted = 0;
    let changed = 0;
    let plus = 0;
    let minus = 0;
    let invalid = 0;
    for (const e of entries) {
      if (e.counted === null) continue;
      if (Number.isNaN(e.counted)) {
        invalid++;
        continue;
      }
      counted++;
      if (e.diff! > 0) plus += e.diff!;
      if (e.diff! < 0) minus -= e.diff!;
      if (e.diff !== 0) changed++;
    }
    return { counted, changed, plus, minus, invalid };
  }, [entries]);

  const searched = useMemo(
    () =>
      entries.filter(
        (e) =>
          (!product || e.row.product_id === product) &&
          (!query.trim() ||
            matchOption(
              {
                value: e.row.id,
                label: e.row.label,
                sublabel: e.row.code,
                keywords: `${e.row.product_name} ${e.row.color} ${e.row.size}`,
              },
              query,
            )),
      ),
    [entries, product, query],
  );

  const filterCounts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: searched.length,
      todo: 0,
      done: 0,
      diff: 0,
    };
    for (const e of searched) {
      if (e.counted === null) c.todo++;
      else c.done++;
      if (e.diff !== null && e.diff !== 0) c.diff++;
    }
    return c;
  }, [searched]);

  const visible = searched.filter((e) =>
    filter === "todo"
      ? e.counted === null
      : filter === "done"
        ? e.counted !== null
        : filter === "diff"
          ? !!e.diff
          : true,
  );

  function setCount(id: string, value: string) {
    setCounts((c) => {
      const next = { ...c };
      if (value === "") delete next[id];
      else next[id] = value;
      return next;
    });
  }

  function focusNext(index: number) {
    const next = visible[index + 1];
    if (next) inputRefs.current.get(next.row.id)?.focus();
  }

  async function downloadSheet() {
    const sheet: SheetSpec<PpicRow> = {
      name: "Stock Opname",
      rows: activeRows,
      columns: [
        { header: "Kode SKU", width: 26, value: (r: PpicRow) => r.code },
        { header: "Produk", width: 26, value: (r: PpicRow) => r.product_name },
        { header: "Warna", width: 16, value: (r: PpicRow) => r.color },
        { header: "Size", width: 10, value: (r: PpicRow) => r.size },
        { header: "Stock Sistem", width: 14, value: (r: PpicRow) => r.stock },
        {
          header: "Stock Fisik",
          width: 14,
          value: (r: PpicRow) => counts[r.id] ?? null,
        },
      ],
    };
    const wb = await buildWorkbook([sheet as SheetSpec<unknown>]);
    await downloadWorkbook(wb, `pretty-basic-stock-opname-${today}.xlsx`);
  }

  async function uploadSheet(file: File) {
    try {
      const grid = await readSpreadsheet(file);
      const { index, missing } = matchHeaders(grid[0] ?? [], [
        {
          key: "code",
          label: "Kode SKU",
          required: true,
          aliases: ["kode", "sku", "kodesku"],
        },
        {
          key: "counted",
          label: "Stock Fisik",
          required: true,
          aliases: ["fisik", "hasilhitung", "qtyfisik"],
        },
      ]);
      if (missing.length)
        throw new Error(`Kolom tidak ditemukan: ${missing.join(", ")}`);
      const byCode = new Map(
        activeRows.map((r) => [r.code.toUpperCase(), r.id]),
      );
      const next: Record<string, string> = {};
      const unknown: string[] = [];
      let bad = 0;
      for (const cells of grid.slice(1)) {
        const raw = cells[index.counted!];
        if (isBlank(raw)) continue;
        const code = cellText(cells[index.code!]).toUpperCase();
        const id = byCode.get(code);
        if (!id) {
          if (code) unknown.push(code);
          continue;
        }
        const text = cellText(raw).replace(/\s/g, "");
        const n = Number(/^\d{1,3}(\.\d{3})+$/.test(text) ? text.replace(/\./g, "") : text); // "1.250" = 1250
        if (!Number.isInteger(n) || n < 0) {
          bad++;
          continue;
        }
        next[id] = String(n);
      }
      const filled = Object.keys(next).length;
      if (!filled) throw new Error("Tidak ada kolom Stock Fisik yang terisi");
      setCounts((c) => ({ ...c, ...next }));
      const warn = [
        unknown.length && `${unknown.length} kode SKU tidak dikenal`,
        bad && `${bad} angka tidak valid`,
      ].filter(Boolean);
      toast.success(
        `${fmtInt(filled)} hasil hitung dimasukkan`,
        warn.length
          ? { description: `Dilewati: ${warn.join(" · ")}` }
          : undefined,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membaca file");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function askSave() {
    if (stats.invalid) {
      toast.error(
        `${stats.invalid} isian stock fisik tidak valid (harus angka bulat ≥ 0)`,
      );
      return;
    }
    if (!stats.counted) {
      toast.error("Isi stock fisik minimal 1 SKU");
      return;
    }
    setConfirmOpen(true);
  }

  async function save() {
    const lines = entries
      .filter((e) => e.counted !== null && !Number.isNaN(e.counted))
      .map((e) => ({ sku_id: e.row.id, counted: e.counted! }));
    const res = await createStockOpname({ doc_date: docDate, note, lines });
    if (!res.ok) {
      toast.error(`Gagal menyimpan opname: ${res.error}`);
      return;
    }
    const d = res.data;
    setConfirmOpen(false);
    setCounts({});
    setNote("");
    toast.success(
      d.changed
        ? `Stock opname tersimpan · ${fmtInt(d.changed)} SKU disesuaikan`
        : "Stock opname tersimpan · semua stock sudah sesuai",
      {
        description: `${fmtInt(d.counted)} SKU dihitung${d.changed ? ` · +${fmtInt(d.plus)} / −${fmtInt(d.minus)} pcs` : ""}`,
      },
    );
    router.refresh();
  }

  return (
    <>
      <StatGrid cols={4}>
        <StatCard
          label="SKU Dihitung"
          tone="primary"
          value={fmtInt(stats.counted)}
          unit={`/ ${fmtInt(activeRows.length)}`}
          sub={
            stats.counted
              ? `${fmtInt(stats.changed)} SKU ada selisih`
              : "Belum ada yang diisi"
          }
        />
        <StatCard
          label="Selisih Lebih"
          tone="pos"
          valueTone={stats.plus ? "pos" : undefined}
          value={`+${fmtInt(stats.plus)}`}
          unit="pcs"
          sub="Fisik lebih banyak dari sistem"
        />
        <StatCard
          label="Selisih Kurang"
          tone="neg"
          valueTone={stats.minus ? "neg" : undefined}
          value={`−${fmtInt(stats.minus)}`}
          unit="pcs"
          sub="Fisik lebih sedikit dari sistem"
        />
        <StatCard
          label="Opname Terakhir"
          tone="grey"
          value={
            <span className="text-[22px]">
              {lastOpname ? fmtDate(lastOpname.doc_date) : "—"}
            </span>
          }
          sub={
            lastOpname
              ? `${lastOpname.created_by_name ?? "Admin"} · ${fmtTime(lastOpname.created_at)}`
              : "Belum pernah opname"
          }
        />
      </StatGrid>

      <Panel
        title="Lembar Hitung"
        sub="Kosongkan SKU yang tidak dihitung · Enter untuk pindah ke baris berikutnya"
        actions={
          <>
            <Button onClick={downloadSheet}>
              <Download className="h-4 w-4" />
              Download Lembar Hitung
            </Button>
            <Button onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Upload Hasil Hitung
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) =>
                e.target.files?.[0] && uploadSheet(e.target.files[0])
              }
            />
          </>
        }
      >
        <Toolbar>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Cari SKU, produk, warna..."
          />
          <FilterChip
            active={filter === "all"}
            count={filterCounts.all}
            onClick={() => setFilter("all")}
          >
            Semua
          </FilterChip>
          <FilterChip
            active={filter === "todo"}
            count={filterCounts.todo}
            onClick={() => setFilter("todo")}
          >
            Belum dihitung
          </FilterChip>
          <FilterChip
            active={filter === "done"}
            count={filterCounts.done}
            onClick={() => setFilter("done")}
          >
            Sudah dihitung
          </FilterChip>
          <FilterChip
            active={filter === "diff"}
            count={filterCounts.diff}
            onClick={() => setFilter("diff")}
          >
            Ada selisih
          </FilterChip>
          <select
            className="select-input ml-auto"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
          >
            <option value="">Semua produk</option>
            {products.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Toolbar>

        <table className="data-table">
          <thead>
            <tr>
              <th>Produk / SKU</th>
              <th className="num w-[130px]">Stock Sistem</th>
              <th className="num w-[150px]">Stock Fisik</th>
              <th className="num w-[120px]">Selisih</th>
              <th className="w-[110px]" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <EmptyRow colSpan={5}>
                {activeRows.length === 0
                  ? "Belum ada SKU aktif."
                  : "Tidak ada SKU yang cocok."}
              </EmptyRow>
            )}
            {visible.map((e, i) => {
              const invalid = Number.isNaN(e.counted);
              return (
                <tr
                  key={e.row.id}
                  className={cn(
                    e.diff !== null && e.diff !== 0 && "bg-yellow-tint/30",
                  )}
                >
                  <td>
                    <SkuCell label={e.row.label} code={e.row.code} />
                  </td>
                  <td className="num text-ink-3">{fmtInt(e.row.stock)}</td>
                  <td className="num">
                    <input
                      ref={(el) => {
                        inputRefs.current.set(e.row.id, el);
                      }}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      aria-label={`Stock fisik ${e.row.label}`}
                      className={cn("qty-input !w-[96px]", invalid && "error")}
                      placeholder="—"
                      value={counts[e.row.id] ?? ""}
                      onChange={(ev) => setCount(e.row.id, ev.target.value)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") {
                          ev.preventDefault();
                          focusNext(i);
                        }
                      }}
                    />
                  </td>
                  <td className="num">
                    {e.diff === null ? (
                      <span className="text-grey-3">—</span>
                    ) : e.diff === 0 ? (
                      <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-pos">
                        <Check className="h-3.5 w-3.5" />
                        Sesuai
                      </span>
                    ) : (
                      <strong className={e.diff > 0 ? "text-pos" : "text-neg"}>
                        {fmtSigned(e.diff)}
                      </strong>
                    )}
                  </td>
                  <td className="text-right">
                    {e.counted === null ? (
                      <button
                        type="button"
                        onClick={() =>
                          setCount(e.row.id, String(Math.max(0, e.row.stock)))
                        }
                        className="cursor-pointer rounded-md px-2 py-1 text-[12px] font-semibold whitespace-nowrap text-primary-2 hover:bg-primary-tint"
                        title="Isi stock fisik sama dengan stock sistem"
                      >
                        = Sistem
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCount(e.row.id, "")}
                        className="cursor-pointer rounded-md px-2 py-1 text-[12px] font-medium text-grey-1 hover:bg-line-2 hover:text-ink-2"
                      >
                        Kosongkan
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <div className="flex flex-wrap items-end gap-3 rounded-[14px] border border-line bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.08)] sm:sticky sm:bottom-4 sm:z-10 sm:flex-nowrap sm:px-[22px]">
        <div className="w-full sm:w-auto">
          <label className="form-label">Tanggal Opname</label>
          <input
            type="date"
            className="date-input w-full sm:w-auto"
            value={docDate}
            max={today}
            onChange={(e) => setDocDate(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-auto sm:flex-1">
          <label className="form-label">Catatan (opsional)</label>
          <input
            className="form-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Mis. Opname gudang akhir bulan"
          />
        </div>
        {stats.counted > 0 && (
          <Button onClick={() => setCounts({})} className="mb-px">
            Reset
          </Button>
        )}
        <Button variant="primary" onClick={askSave} className="mb-px flex-1 sm:flex-none">
          Simpan Opname{stats.counted ? ` (${fmtInt(stats.counted)} SKU)` : ""}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Simpan stock opname?"
        confirmLabel="Ya, Update Stock"
        message={
          <div className="space-y-2">
            <p>
              <strong>{fmtInt(stats.counted)} SKU</strong> dihitung pada{" "}
              <strong>{fmtDate(docDate)}</strong>.
            </p>
            {stats.changed ? (
              <p>
                Stock di sistem akan disesuaikan untuk{" "}
                <strong>{fmtInt(stats.changed)} SKU</strong>:{" "}
                <span className="font-semibold text-pos">
                  +{fmtInt(stats.plus)}
                </span>{" "}
                /{" "}
                <span className="font-semibold text-neg">
                  −{fmtInt(stats.minus)}
                </span>{" "}
                pcs. Penyesuaian tercatat sebagai Adjustment di Barang Masuk /
                Keluar.
              </p>
            ) : (
              <p>
                Semua hasil hitung sudah sama dengan stock sistem, tidak ada
                yang berubah.
              </p>
            )}
          </div>
        }
        onConfirm={save}
      />
    </>
  );
}
