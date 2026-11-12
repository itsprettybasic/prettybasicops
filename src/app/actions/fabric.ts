"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fabricShipmentSchema, type FabricShipmentInput } from "@/lib/validators";
import type { ShipmentUnit } from "@/lib/fabric";
import type { ActionResult } from "./stock";
import type { Vendor } from "./po";

function fail(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

export async function getNextSjNo(year: number): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("next_sj_no", { p_year: year });
  if (error) return fail(error.message);
  return { ok: true, data: data as string };
}

export async function saveFabricShipment(input: FabricShipmentInput): Promise<ActionResult<{ id: string; sj_no: string }>> {
  const parsed = fabricShipmentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Data tidak valid");
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_fabric_shipment", {
    p_id: d.id,
    p_sj_no: d.sj_no,
    p_ship_date: d.ship_date,
    p_vendor_id: d.vendor_id,
    p_po_id: d.po_id,
    p_driver_name: d.driver_name,
    p_vehicle_no: d.vehicle_no,
    p_note: d.note,
    p_lines: d.lines,
  });
  if (error) return fail(error.code === "23505" ? "No Surat Jalan sudah dipakai — ganti nomor lain" : error.message);
  revalidatePath("/", "layout");
  return { ok: true, data: { id: data as string, sj_no: d.sj_no.trim().toUpperCase() } };
}

export interface FabricLine {
  line_no: number;
  fabric_type: string;
  color: string;
  qty: number;
  unit: ShipmentUnit;
  note: string | null;
}

export interface FabricShipmentDetail {
  id: string;
  sj_no: string;
  ship_date: string;
  vendor_id: string;
  vendor: Vendor;
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
  updated_by_name: string | null;
  updated_at: string | null;
  lines: FabricLine[];
}

export async function getFabricShipment(id: string): Promise<ActionResult<FabricShipmentDetail>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fabric_shipments")
    .select(
      "id, sj_no, ship_date, vendor_id, po_id, status, received_date, received_by, driver_name, vehicle_no, note, created_by_name, created_at, updated_by_name, updated_at, vendors(id, name, contact_person, phone, email, address, note, is_active), purchase_orders(po_no), fabric_shipment_lines(line_no, fabric_type, color, qty, unit, note)",
    )
    .eq("id", id)
    .single();
  if (error) return fail(error.code === "PGRST116" ? "Pengiriman tidak ditemukan (mungkin sudah dihapus)" : error.message);
  const row = data as unknown as Omit<FabricShipmentDetail, "vendor" | "po_no" | "lines"> & {
    vendors: Vendor;
    purchase_orders: { po_no: string } | null;
    fabric_shipment_lines: (Omit<FabricLine, "qty"> & { qty: number | string })[];
  };
  const { vendors, purchase_orders, fabric_shipment_lines, ...rest } = row;
  return {
    ok: true,
    data: {
      ...rest,
      vendor: vendors,
      po_no: purchase_orders?.po_no ?? null,
      lines: fabric_shipment_lines
        .map((l) => ({ ...l, qty: Number(l.qty) }))
        .sort((a, b) => a.line_no - b.line_no),
    },
  };
}

/** Tandai kain sudah diterima vendor (atau batalkan tanda terima). */
export async function setFabricReceived(
  id: string,
  received: { date: string; by: string | null } | null,
): Promise<ActionResult> {
  if (received && !/^\d{4}-\d{2}-\d{2}$/.test(received.date)) return fail("Tanggal tidak valid");
  const supabase = await createClient();
  const { error } = await supabase
    .from("fabric_shipments")
    .update(
      received
        ? { status: "diterima", received_date: received.date, received_by: received.by?.trim() || null }
        : { status: "dikirim", received_date: null, received_by: null },
    )
    .eq("id", id);
  if (error)
    return fail(error.message.includes("received_after_ship") ? "Tanggal diterima tidak boleh sebelum tanggal kirim" : error.message);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function deleteFabricShipment(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("fabric_shipments").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

/** Saran isian (jenis kain & warna yang pernah dipakai) untuk autocomplete. */
export async function getFabricSuggestions(): Promise<ActionResult<{ types: string[]; colors: string[] }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fabric_shipment_lines").select("fabric_type, color").limit(5000);
  if (error) return fail(error.message);
  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
  return {
    ok: true,
    data: { types: uniq((data ?? []).map((r) => r.fabric_type)), colors: uniq((data ?? []).map((r) => r.color)) },
  };
}

/** PO yang masih aktif per vendor — untuk dikaitkan (opsional) ke pengiriman kain. */
export async function listPosForVendor(vendorId: string): Promise<ActionResult<{ id: string; po_no: string; po_date: string }[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("id, po_no, po_date")
    .eq("vendor_id", vendorId)
    .in("status", ["draft", "open"])
    .order("po_date", { ascending: false });
  if (error) return fail(error.message);
  return { ok: true, data: data ?? [] };
}
