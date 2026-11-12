import type { FabricUnit } from "@/lib/fabric";
import type { CalcLineInput } from "@/lib/fabric-calc";

export interface CalcProduct {
  id: string;
  name: string;
  is_active: boolean;
  fabric_type: string | null;
  fabric_unit: FabricUnit | null;
  fabric_qty: number | null;
  fabric_pcs: number | null;
  colors: string[];
}

export interface FabricCalc {
  id: string;
  calc_no: string;
  title: string | null;
  calc_date: string;
  po_id: string | null;
  po_no: string | null;
  note: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_by_name: string | null;
  updated_at: string | null;
  lines: CalcLineInput[];
}

export interface PoOption {
  id: string;
  po_no: string;
  batch: string | null;
  vendor_name: string;
  po_date: string;
  /** qty per produk + warna */
  lines: { product_id: string; color: string; qty: number }[];
}
