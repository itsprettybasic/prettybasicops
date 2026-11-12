"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./stock";

function fail(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

const calcSchema = z.object({
  id: z.string().uuid().nullable(),
  title: z.string().trim().max(120),
  calc_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
  po_id: z.string().uuid().nullable(),
  note: z.string().trim().max(1000),
  lines: z
    .array(
      z.object({
        product_id: z.string().uuid("Pilih produk"),
        color: z.string().trim().max(60).nullable(),
        qty_pcs: z.number().int("Jumlah pcs harus bilangan bulat").positive("Jumlah pcs harus lebih dari 0").max(1_000_000),
      }),
    )
    .min(1, "Tambahkan minimal 1 produk"),
});

export type FabricCalcInput = z.input<typeof calcSchema>;

export async function saveFabricCalc(input: FabricCalcInput): Promise<ActionResult<{ id: string }>> {
  const parsed = calcSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Data tidak valid");
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_fabric_calculation", {
    p_id: d.id,
    p_title: d.title,
    p_calc_date: d.calc_date,
    p_po_id: d.po_id,
    p_note: d.note,
    p_lines: d.lines,
  });
  if (error) return fail(error.message);
  revalidatePath("/kalkulator-kain");
  return { ok: true, data: { id: data as string } };
}

export async function deleteFabricCalc(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("fabric_calculations").delete({ count: "exact" }).eq("id", id);
  if (error) return fail(error.message);
  if (!count) return fail("Perhitungan tidak ditemukan");
  revalidatePath("/kalkulator-kain");
  return { ok: true, data: undefined };
}
