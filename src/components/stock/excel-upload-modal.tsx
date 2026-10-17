"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterChip } from "@/components/ui/filter-chip";
import { InfoBanner } from "@/components/ui/info-banner";
import { Pagination } from "@/components/ui/table-parts";
import { useAppData } from "@/components/providers/app-data";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/data/fetch-all";
import { createStockDocuments } from "@/app/actions/stock";
import { importMasterSku, type MasterSkuImportRow } from "@/app/actions/master-sku-import";
import {
  CHANNELS,
  CHANNEL_LABEL,
  EXCEL_CHANNELS,
  EXCEL_IN_TYPES,
  EXCEL_OUT_TYPES,
  IN_TYPES,
  OUT_TYPES,
  TYPE_LABEL,
  TYPE_OPTION_LABEL,
  TYPE_TONE,
  type Direction,
  type MovementType,
  type SalesChannel,
} from "@/lib/constants";
import {
  MAX_UPLOAD_BYTES,
  cellText,
  isBlank,
  matchHeaders,
  normalizeKey,
  parseDateCell,
  parseMoney,
  parsePositiveInt,
  readSpreadsheet,
  type HeaderSpec,
  type RawGrid,
} from "@/lib/excel/parse";
import { buildWorkbook, downloadWorkbook, type SheetSpec } from "@/lib/excel/download";
import { fmtDate, fmtInt, fmtRupiah, fmtSigned } from "@/lib/format";
import { suggestSkuCode, type StockDocumentInput } from "@/lib/validators";
import { cn } from "@/lib/cn";
import type { PpicRow } from "@/lib/data/ppic";

export type UploadKind = "masuk" | "keluar" | "master-sku";

// ── Konfigurasi per jenis upload ───────────────────────────

type StockKey = "date" | "type" | "ref" | "sku" | "qty" | "note";
type MasterKey = "product" | "color" | "size" | "code" | "launch" | "cost";

const STOCK_COMMON: HeaderSpec<StockKey>[] = [
  { key: "date", label: "Tanggal", aliases: ["tgl", "date"] },
  { key: "type", label: "Tipe", aliases: ["type", "jenis"], required: true },
  { key: "sku", label: "SKU", aliases: ["kodesku", "skucode", "sku_code"], required: true },
  { key: "qty", label: "Qty", aliases: ["jumlah", "quantity", "qty(pcs)", "pcs"], required: true },
  { key: "note", label: "Catatan", aliases: ["note", "notes", "keterangan"] },
];

const KIND_CONFIG = {
  masuk: {
    title: "Upload Excel — Barang Masuk",
    noun: "barang masuk",
    template: "barang-masuk",
    direction: "in" as Direction,
    columns: ["Tanggal", "Tipe", "Ref Batch", "SKU", "Qty", "Catatan"],
    headers: [
      ...STOCK_COMMON,
      { key: "ref", label: "Ref Batch", aliases: ["batch", "nobatch", "refbatch", "batchno"] },
    ] as HeaderSpec<StockKey>[],
  },
  keluar: {
    title: "Upload Excel — Barang Keluar",
    noun: "barang keluar",
    template: "barang-keluar",
    direction: "out" as Direction,
    columns: ["Tanggal", "Tipe", "Channel", "SKU", "Qty", "Catatan"],
    headers: [...STOCK_COMMON, { key: "ref", label: "Channel", aliases: ["saluran", "marketplace"] }] as HeaderSpec<StockKey>[],
  },
  "master-sku": {
    title: "Upload Excel — Master SKU",
    noun: "SKU",
    template: "master-sku",
    direction: null,
    columns: ["Produk", "Warna", "Size", "SKU", "Tanggal Launch", "Harga Pokok"],
    headers: [
      { key: "product", label: "Produk", aliases: ["namaproduk", "product"], required: true },
      { key: "color", label: "Warna", aliases: ["color"], required: true },
      { key: "size", label: "Size", aliases: ["ukuran"], required: true },
      { key: "code", label: "SKU", aliases: ["kodesku", "skucode"] },
      { key: "launch", label: "Tanggal Launch", aliases: ["launch", "launchdate", "tanggal", "tgllaunch"] },
      { key: "cost", label: "Harga Pokok", aliases: ["hpp", "hargapokok(rp)", "cost", "unitcost"] },
    ] as HeaderSpec<MasterKey>[],
  },
} as const;

const MAX_ROWS = 10000;

/** Map nilai Tipe yang diterima → movement_type, per arah. */
function buildTypeLookup(direction: Direction): Map<string, MovementType> {
  const map = new Map<string, MovementType>();
  const types = direction === "in" ? IN_TYPES : OUT_TYPES;
  for (const t of types) {
    map.set(normalizeKey(t), t);
    map.set(normalizeKey(TYPE_LABEL[t]), t);
    map.set(normalizeKey(TYPE_OPTION_LABEL[t]), t);
    map.set(normalizeKey(TYPE_OPTION_LABEL[t].split("(")[0]), t);
  }
  for (const [k, t] of Object.entries(direction === "in" ? EXCEL_IN_TYPES : EXCEL_OUT_TYPES)) map.set(k, t);
  return map;
}

function buildChannelLookup(): Map<string, SalesChannel> {
  const map = new Map<string, SalesChannel>(Object.entries(EXCEL_CHANNELS));
  for (const c of CHANNELS) map.set(normalizeKey(CHANNEL_LABEL[c]), c);
  return map;
}

// ── Tipe baris preview ────────────────────────────────────

interface StockLine {
  date: string | null;
  type: MovementType | null;
  channel: SalesChannel | null;
  batchId: string | null;
  batchNo: string | null;
  skuId: string | null;
  skuLabel: string | null;
  qty: number | null;
  note: string;
}

interface PreviewRow {
  rowNo: number;
  /** Teks asli per kolom template (untuk tampilan & download baris error) */
  raw: string[];
  errors: string[];
  warnings: string[];
  stock?: StockLine;
  master?: MasterSkuImportRow & { isNew: boolean };
}

interface Lookups {
  activeByCode: Map<string, PpicRow>;
  /** Semua kode SKU di database (aktif & nonaktif) → is_active. null jika gagal dimuat. */
  allCodes: Map<string, boolean> | null;
  batches: Map<string, { id: string; status: string }>;
}

type RowFilter = "all" | "valid" | "error" | "warn";

// ── Validasi ──────────────────────────────────────────────

function validateStockRows(
  kind: "masuk" | "keluar",
  grid: RawGrid,
  index: Partial<Record<StockKey, number>>,
  headerRow: number,
  lookups: Lookups,
  today: string,
): PreviewRow[] {
  const isIn = kind === "masuk";
  const typeLookup = buildTypeLookup(isIn ? "in" : "out");
  const channelLookup = buildChannelLookup();
  const get = (cells: unknown[], key: StockKey) => (index[key] === undefined ? null : cells[index[key]!]);

  const out: PreviewRow[] = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const cells = grid[r];
    const vals = (["date", "type", "ref", "sku", "qty", "note"] as StockKey[]).map((k) => get(cells, k));
    if (vals.every(isBlank)) continue;
    const [dateV, typeV, refV, skuV, qtyV, noteV] = vals;
    const errors: string[] = [];
    const warnings: string[] = [];

    // Tanggal (kosong = hari ini)
    let date: string | null = today;
    if (!isBlank(dateV)) {
      date = parseDateCell(dateV);
      if (!date) errors.push("Tanggal tidak valid");
    }

    // Tipe
    const typeText = cellText(typeV);
    const type = typeText ? (typeLookup.get(normalizeKey(typeText)) ?? null) : null;
    if (!typeText) errors.push("Tipe kosong");
    else if (!type) errors.push(`Tipe tidak dikenal (${typeText})`);

    // SKU
    const code = cellText(skuV).toUpperCase();
    const sku = code ? lookups.activeByCode.get(code) : undefined;
    if (!code) errors.push("SKU kosong");
    else if (!sku) errors.push(lookups.allCodes?.get(code) === false ? "SKU nonaktif" : "SKU tidak ditemukan");

    // Qty
    const qty = parsePositiveInt(qtyV);
    if (qty === null) errors.push("Qty harus bilangan bulat > 0");

    // Ref Batch / Channel
    const refText = cellText(refV);
    let channel: SalesChannel | null = null;
    let batchId: string | null = null;
    let batchNo: string | null = null;
    if (isIn) {
      if (type === "produksi") {
        batchNo = refText.toUpperCase();
        const batch = batchNo ? lookups.batches.get(batchNo) : undefined;
        if (!batchNo) errors.push("Ref Batch wajib untuk Produksi");
        else if (!batch) errors.push("Ref Batch tidak ditemukan");
        else if (batch.status === "cancelled") errors.push("Ref Batch sudah dibatalkan");
        else batchId = batch.id;
      } else if (refText && type) {
        warnings.push("Ref Batch diabaikan (hanya untuk Produksi)");
      }
    } else {
      if (refText) {
        channel = channelLookup.get(normalizeKey(refText)) ?? null;
        if (!channel) errors.push(`Channel tidak dikenal (${refText})`);
      } else if (type === "sales") {
        errors.push("Channel kosong untuk Sales");
      }
    }

    out.push({
      rowNo: r + 1,
      raw: [
        date && !errors.includes("Tanggal tidak valid") ? date : cellText(dateV),
        typeText,
        refText,
        code,
        cellText(qtyV),
        cellText(noteV),
      ],
      errors,
      warnings,
      stock: {
        date,
        type,
        channel,
        batchId,
        batchNo,
        skuId: sku?.id ?? null,
        skuLabel: sku?.label ?? null,
        qty,
        note: cellText(noteV),
      },
    });
  }

  // Peringatan stock minus (barang keluar): akumulasi per SKU dari stock sekarang
  if (!isIn) {
    const remaining = new Map<string, number>();
    for (const row of out) {
      if (row.errors.length || !row.stock?.skuId || !row.stock.qty) continue;
      const id = row.stock.skuId;
      const current = remaining.get(id) ?? lookups.activeByCode.get(row.raw[3])?.stock ?? 0;
      const next = current - row.stock.qty;
      remaining.set(id, next);
      if (next < 0) row.warnings.push(`Stock jadi minus (${fmtSigned(next)})`);
    }
  }
  return out;
}

const SKU_CODE_RE = /^[A-Z0-9-]+$/;

function validateMasterRows(
  grid: RawGrid,
  index: Partial<Record<MasterKey, number>>,
  headerRow: number,
  lookups: Lookups,
): PreviewRow[] {
  const get = (cells: unknown[], key: MasterKey) => (index[key] === undefined ? null : cells[index[key]!]);
  const seen = new Map<string, number>();
  const out: PreviewRow[] = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const cells = grid[r];
    const vals = (["product", "color", "size", "code", "launch", "cost"] as MasterKey[]).map((k) => get(cells, k));
    if (vals.every(isBlank)) continue;
    const [productV, colorV, sizeV, codeV, launchV, costV] = vals;
    const errors: string[] = [];
    const warnings: string[] = [];

    const product = cellText(productV).replace(/\s+/g, " ");
    const color = cellText(colorV).replace(/\s+/g, " ");
    const size = cellText(sizeV).replace(/\s+/g, " ");
    if (!product) errors.push("Produk kosong");
    if (!color) errors.push("Warna kosong");
    if (!size) errors.push("Size kosong");

    let code = cellText(codeV).toUpperCase();
    if (!code && product && color && size) {
      code = suggestSkuCode(product, color, size);
      warnings.push("Kode SKU dibuat otomatis");
    }
    if (!code) errors.push("SKU kosong");
    else if (!SKU_CODE_RE.test(code)) errors.push("Kode SKU hanya boleh huruf besar, angka, dan tanda -");
    else if (seen.has(code)) errors.push(`SKU duplikat dengan baris ${seen.get(code)}`);
    if (code && !seen.has(code)) seen.set(code, r + 1);

    let launch: string | null = null;
    if (!isBlank(launchV)) {
      launch = parseDateCell(launchV);
      if (!launch) errors.push("Tanggal Launch tidak valid");
    }

    const cost = parseMoney(costV);
    if (cost !== null && Number.isNaN(cost)) errors.push("Harga Pokok tidak valid");

    const existing = lookups.allCodes?.get(code);
    if (existing === false) warnings.push("SKU nonaktif — tetap nonaktif");

    out.push({
      rowNo: r + 1,
      raw: [product, color, size, code, launch ?? cellText(launchV), cellText(costV)],
      errors,
      warnings,
      master: {
        product_name: product,
        color,
        size,
        code,
        launch_date: launch,
        unit_cost: cost !== null && !Number.isNaN(cost) ? cost : null,
        isNew: existing === undefined,
      },
    });
  }
  return out;
}

/** Cari baris header di 10 baris pertama (baris pertama yang memuat semua kolom wajib). */
function findHeader<K extends string>(grid: RawGrid, specs: HeaderSpec<K>[]) {
  let first: ReturnType<typeof matchHeaders<K>> | null = null;
  for (let i = 0; i < Math.min(10, grid.length); i++) {
    const m = matchHeaders(grid[i], specs);
    if (!first) first = m;
    if (m.missing.length === 0) return { row: i, ...m };
  }
  return { row: -1, index: first?.index ?? {}, missing: first?.missing ?? specs.filter((s) => s.required).map((s) => s.label) };
}

// ── Komponen ──────────────────────────────────────────────

export function ExcelUploadModal({
  kind,
  open,
  onOpenChange,
}: {
  kind: UploadKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { today, rows: ppicRows } = useAppData();
  const config = KIND_CONFIG[kind];
  const isMaster = kind === "master-sku";
  const isIn = kind === "masuk";

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [filter, setFilter] = useState<RowFilter>("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [importing, setImporting] = useState(false);

  const activeByCode = useMemo(() => new Map(ppicRows.map((r) => [r.code.toUpperCase(), r])), [ppicRows]);

  async function loadLookups(grid: RawGrid, refIndex: number | undefined, headerRow: number): Promise<Lookups> {
    const supabase = createClient();
    let allCodes: Map<string, boolean> | null = null;
    try {
      const skus = await fetchAll<{ code: string; is_active: boolean }>(() =>
        supabase.from("skus").select("code, is_active").order("code"),
      );
      allCodes = new Map(skus.map((s) => [s.code.toUpperCase(), s.is_active]));
    } catch {
      allCodes = null;
    }
    const batches = new Map<string, { id: string; status: string }>();
    if (kind === "masuk" && refIndex !== undefined) {
      const nos = [
        ...new Set(
          grid
            .slice(headerRow + 1)
            .map((cells) => cellText(cells[refIndex]).toUpperCase())
            .filter(Boolean),
        ),
      ];
      for (let i = 0; i < nos.length; i += 200) {
        const { data, error } = await supabase
          .from("production_batches")
          .select("id, batch_no, status")
          .in("batch_no", nos.slice(i, i + 200));
        if (error) throw new Error(`Gagal memuat batch: ${error.message}`);
        for (const b of data ?? []) batches.set((b.batch_no as string).toUpperCase(), { id: b.id as string, status: b.status as string });
      }
    }
    return { activeByCode, allCodes, batches };
  }

  async function handleFile(file: File) {
    setFileError(null);
    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) {
      setFileError("Format file harus .xlsx atau .csv");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setFileError("Ukuran file maksimal 5 MB");
      return;
    }
    setParsing(true);
    setFileName(file.name);
    try {
      const grid = await readSpreadsheet(file);
      if (grid.length === 0) throw new Error("File kosong — tidak ada baris yang bisa dibaca");
      const header = findHeader(grid, config.headers as HeaderSpec<string>[]);
      if (header.row < 0) {
        throw new Error(
          `Kolom wajib tidak ditemukan: ${header.missing.join(", ")}. Pastikan baris pertama berisi header sesuai template.`,
        );
      }
      if (grid.length - header.row - 1 > MAX_ROWS) throw new Error(`Maksimal ${fmtInt(MAX_ROWS)} baris per upload`);
      const lookups = await loadLookups(grid, (header.index as Record<string, number>).ref, header.row);
      const result = isMaster
        ? validateMasterRows(grid, header.index as Partial<Record<MasterKey, number>>, header.row, lookups)
        : validateStockRows(kind, grid, header.index as Partial<Record<StockKey, number>>, header.row, lookups, today);
      if (result.length === 0) throw new Error("File tidak berisi baris data di bawah header");
      setRows(result);
      setFilter("all");
      setPage(0);
    } catch (e) {
      setRows(null);
      setFileName(null);
      setFileError(e instanceof Error ? e.message : "File tidak bisa dibaca");
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function reset() {
    setRows(null);
    setFileName(null);
    setFileError(null);
  }

  // ── Ringkasan ──
  const validRows = useMemo(() => (rows ?? []).filter((r) => r.errors.length === 0), [rows]);
  const errorRows = useMemo(() => (rows ?? []).filter((r) => r.errors.length > 0), [rows]);
  const warnRows = useMemo(() => validRows.filter((r) => r.warnings.length > 0), [validRows]);

  const documents = useMemo<StockDocumentInput[]>(() => {
    if (isMaster || !config.direction) return [];
    const groups = new Map<string, { input: StockDocumentInput; qty: Map<string, number>; notes: string[] }>();
    for (const r of validRows) {
      const s = r.stock!;
      const ref = isIn ? (s.type === "produksi" ? s.batchId : null) : s.channel;
      const key = `${s.date}|${s.type}|${ref ?? ""}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          input: {
            direction: config.direction,
            type: s.type!,
            doc_date: s.date!,
            channel: isIn ? null : s.channel,
            batch_id: isIn && s.type === "produksi" ? s.batchId : null,
            note: null,
            source: "excel",
            lines: [],
          },
          qty: new Map(),
          notes: [],
        };
        groups.set(key, g);
      }
      g.qty.set(s.skuId!, (g.qty.get(s.skuId!) ?? 0) + s.qty!);
      if (s.note && !g.notes.includes(s.note)) g.notes.push(s.note);
    }
    return [...groups.values()]
      .map((g) => ({
        ...g.input,
        note: g.notes.length ? g.notes.join("; ").slice(0, 500) : null,
        lines: [...g.qty.entries()].map(([sku_id, qty]) => ({ sku_id, qty })),
      }))
      .sort((a, b) => a.doc_date.localeCompare(b.doc_date) || a.type.localeCompare(b.type));
  }, [validRows, isMaster, isIn, config.direction]);

  const totalQty = documents.reduce((s, d) => s + d.lines.reduce((t, l) => t + l.qty, 0), 0);
  const newSkuCount = isMaster ? validRows.filter((r) => r.master?.isNew).length : 0;

  const shownRows = useMemo(() => {
    const all = rows ?? [];
    if (filter === "valid") return validRows;
    if (filter === "error") return errorRows;
    if (filter === "warn") return warnRows;
    return all;
  }, [rows, filter, validRows, errorRows, warnRows]);
  const safePage = Math.min(page, Math.max(0, Math.ceil(shownRows.length / pageSize) - 1));
  const pageRows = shownRows.slice(safePage * pageSize, (safePage + 1) * pageSize);

  function pickFilter(f: RowFilter) {
    setFilter(f);
    setPage(0);
  }

  function downloadTemplate() {
    const a = document.createElement("a");
    a.href = `/api/template/${config.template}`;
    a.download = `template-${config.template}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function downloadErrors() {
    const wb = await buildWorkbook([
      {
        name: "Baris Error",
        columns: [
          { header: "Baris", width: 8, value: (r: PreviewRow) => r.rowNo },
          ...config.columns.map((h, i) => ({
            header: h,
            width: h === "SKU" ? 28 : h === "Catatan" ? 30 : Math.max(12, h.length + 4),
            value: (r: PreviewRow) => r.raw[i],
          })),
          { header: "Alasan", width: 48, value: (r: PreviewRow) => r.errors.join("; ") },
        ],
        rows: errorRows,
      } as unknown as SheetSpec<unknown>,
    ]);
    await downloadWorkbook(wb, `baris-error-${config.template}-${today}.xlsx`);
  }

  async function runImport() {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      if (isMaster) {
        const res = await importMasterSku(
          validRows.map(({ master: m }) => ({
            product_name: m!.product_name,
            color: m!.color,
            size: m!.size,
            code: m!.code,
            launch_date: m!.launch_date,
            unit_cost: m!.unit_cost,
          })),
        );
        if (!res.ok) {
          toast.error(`Import gagal: ${res.error}`);
          router.refresh();
          return;
        }
        const { created, updated, productsCreated } = res.data;
        toast.success(
          `Import selesai · ${fmtInt(created)} SKU baru · ${fmtInt(updated)} diperbarui` +
            (productsCreated ? ` · ${fmtInt(productsCreated)} produk baru` : ""),
        );
      } else {
        const res = await createStockDocuments(documents);
        if (!res.ok) {
          toast.error(`Import gagal: ${res.error}`);
          router.refresh();
          return;
        }
        toast.success(
          `Import selesai · ${fmtInt(res.data.count)} catatan · ${fmtInt(validRows.length)} baris · ${fmtSigned(isIn ? totalQty : -totalQty)} pcs`,
        );
      }
      onOpenChange(false);
      router.refresh();
    } finally {
      setImporting(false);
    }
  }

  const step = rows ? 2 : 1;
  const importVariant = isMaster ? "primary" : isIn ? "pos" : "neg";

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !importing && onOpenChange(o)}
      wide={step === 2}
      title={config.title}
      sub={<Stepper step={step} />}
      footerLeft={
        step === 2 ? (
          <Button onClick={reset} disabled={importing}>
            Ganti file
          </Button>
        ) : (
          <Button onClick={downloadTemplate}>
            <Download className="h-3.5 w-3.5" /> Download Template
          </Button>
        )
      }
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={importing}>
            Batal
          </Button>
          {step === 2 && (
            <Button variant={importVariant} loading={importing} disabled={validRows.length === 0} onClick={runImport}>
              Import {fmtInt(validRows.length)} baris valid
            </Button>
          )}
        </>
      }
    >
      {step === 1 ? (
        <>
          <div
            role="button"
            tabIndex={0}
            onClick={() => !parsing && inputRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !parsing) {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file && !parsing) void handleFile(file);
            }}
            className={cn(
              "mb-4 cursor-pointer rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors focus:outline-none focus-visible:border-primary-2",
              dragOver ? "border-primary-2 bg-primary-tint" : "border-line bg-bg hover:border-primary-2 hover:bg-primary-tint",
              parsing && "cursor-wait",
            )}
          >
            {parsing ? (
              <>
                <span className="mb-2 inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary-2 border-r-transparent" />
                <div className="text-[13.5px] font-semibold text-ink">Membaca {fileName}...</div>
                <div className="text-[11.5px] text-grey-1">Memvalidasi setiap baris</div>
              </>
            ) : (
              <>
                <Upload className="mx-auto mb-2 h-6 w-6 text-grey-1" strokeWidth={1.75} />
                <div className="mb-1 text-[13.5px] font-semibold text-ink">Klik untuk pilih file atau drag &amp; drop</div>
                <div className="text-[11.5px] text-grey-1">
                  Excel (.xlsx) atau CSV · Maks 5 MB · Sheet pertama ·{" "}
                  <a
                    href={`/api/template/${config.template}`}
                    download
                    onClick={(e) => e.stopPropagation()}
                    className="font-semibold text-primary-2 hover:underline"
                  >
                    Download template
                  </a>
                </div>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>

          {fileError && (
            <div className="mb-4 flex items-start gap-2 rounded-[10px] border border-neg-tint bg-neg-tint/50 px-4 py-3 text-[12.5px] text-neg-text">
              <X className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{fileError}</span>
            </div>
          )}

          <FormatInfo kind={kind} />
        </>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <FileSpreadsheet className="h-5 w-5 shrink-0 text-pos" strokeWidth={1.75} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-ink">{fileName}</div>
                <div className="num text-[12px] text-grey-1">
                  {fmtInt(rows!.length)} baris · <span className="font-semibold text-pos">{fmtInt(validRows.length)} valid</span>
                  {" · "}
                  <span className={cn("font-semibold", errorRows.length ? "text-neg" : "text-grey-1")}>
                    {fmtInt(errorRows.length)} error
                  </span>
                  {warnRows.length > 0 && (
                    <>
                      {" · "}
                      <span className="font-semibold text-warn">{fmtInt(warnRows.length)} peringatan</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            {errorRows.length > 0 && (
              <Button size="sm" onClick={downloadErrors}>
                <Download className="h-3.5 w-3.5" /> Download baris error
              </Button>
            )}
          </div>

          {validRows.length > 0 ? (
            <InfoBanner head="Yang akan diimport">
              {isMaster ? (
                <>
                  <strong>{fmtInt(validRows.length)} SKU</strong> · {fmtInt(newSkuCount)} baru · {fmtInt(validRows.length - newSkuCount)}{" "}
                  diperbarui (berdasarkan kode SKU). Produk yang belum ada dibuat otomatis.
                </>
              ) : (
                <>
                  <strong>{fmtInt(documents.length)} catatan</strong> · {fmtInt(validRows.length)} baris ·{" "}
                  <strong>{fmtSigned(isIn ? totalQty : -totalQty)} pcs</strong>. Baris dikelompokkan per Tanggal + Tipe +{" "}
                  {isIn ? "Ref Batch" : "Channel"}; SKU yang sama dalam 1 catatan dijumlahkan.
                </>
              )}
              {errorRows.length > 0 && <> Baris error tidak ikut diimport.</>}
            </InfoBanner>
          ) : (
            <InfoBanner variant="warn" head="Tidak ada baris valid">
              Perbaiki baris error di file lalu upload ulang. Gunakan &quot;Download baris error&quot; untuk melihat alasannya.
            </InfoBanner>
          )}

          <div className="mb-2 flex flex-wrap items-center gap-2">
            <FilterChip active={filter === "all"} count={rows!.length} onClick={() => pickFilter("all")}>
              Semua
            </FilterChip>
            <FilterChip active={filter === "valid"} count={validRows.length} onClick={() => pickFilter("valid")}>
              Valid
            </FilterChip>
            <FilterChip active={filter === "error"} count={errorRows.length} onClick={() => pickFilter("error")}>
              Error
            </FilterChip>
            {warnRows.length > 0 && (
              <FilterChip active={filter === "warn"} count={warnRows.length} onClick={() => pickFilter("warn")}>
                Peringatan
              </FilterChip>
            )}
          </div>

          <div className="max-h-[42vh] overflow-auto rounded-lg">
            <table className="sku-row-table !mt-0">
              <thead className="sticky top-0 z-[1]">
                <tr>
                  <th className="w-12">Baris</th>
                  <th className="w-8" />
                  {isMaster ? (
                    <>
                      <th>Produk</th>
                      <th>Warna / Size</th>
                      <th>SKU</th>
                      <th>Launch</th>
                      <th className="num">Harga Pokok</th>
                      <th>Aksi</th>
                    </>
                  ) : (
                    <>
                      <th>Tanggal</th>
                      <th>Tipe</th>
                      <th>{isIn ? "Ref Batch" : "Channel"}</th>
                      <th>SKU</th>
                      <th className="num">Qty</th>
                      <th>Catatan</th>
                    </>
                  )}
                  <th>Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="!py-8 text-center text-grey-1">
                      Tidak ada baris.
                    </td>
                  </tr>
                )}
                {pageRows.map((r) => {
                  const bad = r.errors.length > 0;
                  return (
                    <tr key={r.rowNo} className={cn(bad && "bg-neg-tint/30")}>
                      <td className="num text-grey-2">{r.rowNo}</td>
                      <td>
                        {bad ? (
                          <X className="h-4 w-4 text-neg" strokeWidth={2.5} aria-label="Error" />
                        ) : r.warnings.length ? (
                          <AlertTriangle className="h-4 w-4 text-warn" strokeWidth={2.25} aria-label="Peringatan" />
                        ) : (
                          <Check className="h-4 w-4 text-pos" strokeWidth={2.5} aria-label="Valid" />
                        )}
                      </td>
                      {isMaster ? <MasterCells row={r} /> : <StockCells row={r} isIn={isIn} />}
                      <td className="min-w-[180px] text-[12px]">
                        {r.errors.map((e) => (
                          <div key={e} className="font-semibold text-neg">
                            {e}
                          </div>
                        ))}
                        {r.warnings.map((w) => (
                          <div key={w} className="font-medium text-warn">
                            {w}
                          </div>
                        ))}
                        {!bad && !r.warnings.length && <span className="text-grey-2">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {shownRows.length > 25 && (
            <Pagination
              page={safePage}
              pageSize={pageSize}
              total={shownRows.length}
              onPage={setPage}
              onPageSize={(s) => {
                setPageSize(s);
                setPage(0);
              }}
            />
          )}
        </>
      )}
    </Modal>
  );
}

function Stepper({ step }: { step: 1 | 2 }) {
  const steps = ["Pilih file", "Preview & validasi", "Import"];
  return (
    <div className="mt-1 flex items-center gap-2 text-[12px]">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === step || (n === 3 && step === 2);
        const done = n < step;
        return (
          <span key={label} className="inline-flex items-center gap-2">
            {i > 0 && <span className="h-px w-4 bg-line" />}
            <span
              className={cn(
                "inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10.5px] font-bold",
                done ? "bg-pos-tint text-pos-text" : active ? "bg-primary text-white" : "bg-line-2 text-grey-1",
              )}
            >
              {done ? <Check className="h-3 w-3" strokeWidth={3} /> : n}
            </span>
            <span className={cn(active || done ? "font-semibold text-ink-2" : "text-grey-1")}>{label}</span>
          </span>
        );
      })}
    </div>
  );
}

function FormatInfo({ kind }: { kind: UploadKind }) {
  if (kind === "master-sku") {
    return (
      <InfoBanner head="Format Excel" className="!mb-0">
        Kolom wajib: <strong>Produk</strong>, <strong>Warna</strong>, <strong>Size</strong>. Kolom lain: <strong>SKU</strong> (kosong =
        dibuat otomatis PRODUK-WARNA-SIZE), <strong>Tanggal Launch</strong> (yyyy-mm-dd), <strong>Harga Pokok</strong>.
        <br />
        Upsert berdasarkan kode SKU: SKU yang sudah ada diperbarui, produk baru dibuat otomatis.
      </InfoBanner>
    );
  }
  const isIn = kind === "masuk";
  return (
    <InfoBanner head="Format Excel" className="!mb-0">
      Kolom wajib: <strong>Tipe</strong> ({isIn ? "Produksi / Retur / Adjustment / Transfer" : "Sales / Damage / Giveaway / Adjustment / Transfer"}),{" "}
      <strong>SKU</strong> (kode SKU), <strong>Qty</strong> (bilangan bulat).
      <br />
      Kolom opsional: <strong>Tanggal</strong> (yyyy-mm-dd atau dd/mm/yyyy, kosong = hari ini),{" "}
      {isIn ? (
        <>
          <strong>Ref Batch</strong> (wajib untuk Produksi),
        </>
      ) : (
        <>
          <strong>Channel</strong> (wajib untuk Sales: Shopee, TikTok, Instagram, Website, Offline, Lainnya),
        </>
      )}{" "}
      <strong>Catatan</strong>.
      <br />
      Baris dengan Tanggal + Tipe + {isIn ? "Ref Batch" : "Channel"} yang sama digabung jadi 1 catatan.
    </InfoBanner>
  );
}

function StockCells({ row, isIn }: { row: PreviewRow; isIn: boolean }) {
  const s = row.stock!;
  const [dateRaw, typeRaw, refRaw, codeRaw, qtyRaw, noteRaw] = row.raw;
  const dash = <span className="text-grey-2">—</span>;
  return (
    <>
      <td className="whitespace-nowrap">{s.date && dateRaw === s.date ? fmtDate(s.date) : dateRaw || dash}</td>
      <td className="whitespace-nowrap">
        {s.type ? <Badge tone={TYPE_TONE[s.type]}>{TYPE_LABEL[s.type]}</Badge> : typeRaw || dash}
      </td>
      <td className="whitespace-nowrap">
        {isIn ? (
          s.batchNo || refRaw || dash
        ) : s.channel ? (
          CHANNEL_LABEL[s.channel]
        ) : (
          refRaw || dash
        )}
      </td>
      <td className="max-w-[240px]">
        <div className="truncate font-semibold text-ink">{codeRaw || "—"}</div>
        {s.skuLabel && <div className="truncate text-[11px] text-grey-1">{s.skuLabel}</div>}
      </td>
      <td className="num font-semibold">{s.qty !== null ? fmtInt(s.qty) : qtyRaw || "—"}</td>
      <td className="max-w-[160px]">
        <div className="truncate text-grey-1" title={noteRaw}>
          {noteRaw || "—"}
        </div>
      </td>
    </>
  );
}

function MasterCells({ row }: { row: PreviewRow }) {
  const m = row.master!;
  const [, , , , launchRaw, costRaw] = row.raw;
  return (
    <>
      <td className="max-w-[200px] truncate font-semibold text-ink">{m.product_name || "—"}</td>
      <td className="whitespace-nowrap">
        {m.color || "—"} · {m.size || "—"}
      </td>
      <td className="font-medium">{m.code || "—"}</td>
      <td className="whitespace-nowrap">{m.launch_date ? fmtDate(m.launch_date) : launchRaw || <span className="text-grey-2">—</span>}</td>
      <td className="num">{m.unit_cost !== null ? fmtRupiah(m.unit_cost) : costRaw || <span className="text-grey-2">—</span>}</td>
      <td>{m.isNew ? <Badge tone="pos">Baru</Badge> : <Badge tone="info">Update</Badge>}</td>
    </>
  );
}
