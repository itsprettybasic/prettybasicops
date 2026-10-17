"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { MonthStarts, PpicRow } from "@/lib/data/ppic";
import type { PpicParams } from "@/lib/ppic";
import type { ComboOption } from "@/components/ui/combobox";
import type { Direction, MovementType } from "@/lib/constants";
import { fmtInt } from "@/lib/format";
import { StockDocumentModal } from "@/components/stock/stock-document-modal";
import { ExcelUploadModal, type UploadKind } from "@/components/stock/excel-upload-modal";
import { SkuDetailModal } from "@/components/ppic/sku-detail-modal";

export interface StockModalPreset {
  direction: Direction;
  type?: MovementType;
  skuId?: string;
  batchId?: string;
}

interface AppDataValue {
  today: string;
  months: MonthStarts;
  params: PpicParams;
  rows: PpicRow[];
  rowById: Map<string, PpicRow>;
  /** Opsi combobox SKU (hanya SKU aktif): nama, kode, stock di kanan. */
  skuOptions: ComboOption[];
  openStockModal: (preset: StockModalPreset) => void;
  openUpload: (kind: UploadKind) => void;
  openSkuDetail: (skuId: string) => void;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData harus dipakai di dalam AppDataProvider");
  return ctx;
}

export function AppDataProvider({
  today,
  months,
  params,
  rows,
  children,
}: {
  today: string;
  months: MonthStarts;
  params: PpicParams;
  rows: PpicRow[];
  children: React.ReactNode;
}) {
  const [stockPreset, setStockPreset] = useState<StockModalPreset | null>(null);
  const [stockOpen, setStockOpen] = useState(false);
  const [uploadKind, setUploadKind] = useState<UploadKind | null>(null);
  const [skuDetailId, setSkuDetailId] = useState<string | null>(null);

  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const skuOptions = useMemo<ComboOption[]>(
    () =>
      rows.map((r) => ({
        value: r.id,
        label: r.label,
        sublabel: r.code,
        right: `stok ${fmtInt(r.stock)}`,
        keywords: `${r.product_name} ${r.color} ${r.size}`,
      })),
    [rows],
  );

  const openStockModal = useCallback((preset: StockModalPreset) => {
    setSkuDetailId(null);
    setStockPreset(preset);
    setStockOpen(true);
  }, []);
  const openUpload = useCallback((kind: UploadKind) => {
    setStockOpen(false);
    setUploadKind(kind);
  }, []);
  const openSkuDetail = useCallback((id: string) => setSkuDetailId(id), []);

  const value = useMemo(
    () => ({ today, months, params, rows, rowById, skuOptions, openStockModal, openUpload, openSkuDetail }),
    [today, months, params, rows, rowById, skuOptions, openStockModal, openUpload, openSkuDetail],
  );

  return (
    <AppDataContext.Provider value={value}>
      {children}
      {stockPreset && (
        <StockDocumentModal
          key={JSON.stringify(stockPreset)}
          open={stockOpen}
          onOpenChange={setStockOpen}
          preset={stockPreset}
          onSwitchToUpload={() => openUpload(stockPreset.direction === "in" ? "masuk" : "keluar")}
        />
      )}
      {uploadKind && (
        <ExcelUploadModal kind={uploadKind} open={uploadKind !== null} onOpenChange={(o) => !o && setUploadKind(null)} />
      )}
      {skuDetailId && (
        <SkuDetailModal skuId={skuDetailId} open={skuDetailId !== null} onOpenChange={(o) => !o && setSkuDetailId(null)} />
      )}
    </AppDataContext.Provider>
  );
}
