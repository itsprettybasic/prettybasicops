"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getWarehouseStockMap } from "@/app/actions/warehouses";

/**
 * Stock per SKU di satu gudang (dimuat dari server). null = sedang memuat / belum ada gudang.
 * Naikkan `version` untuk memuat ulang (mis. setelah menyimpan).
 */
export function useWarehouseStock(warehouseId: string | null, version = 0): Record<string, number> | null {
  const [state, setState] = useState<{ id: string; version: number; map: Record<string, number> } | null>(null);
  useEffect(() => {
    if (!warehouseId) return;
    let cancelled = false;
    getWarehouseStockMap(warehouseId).then((res) => {
      if (cancelled) return;
      if (res.ok) setState({ id: warehouseId, version, map: res.data });
      else toast.error(`Gagal memuat stock gudang: ${res.error}`);
    });
    return () => {
      cancelled = true;
    };
  }, [warehouseId, version]);
  return state && state.id === warehouseId && state.version === version ? state.map : null;
}
