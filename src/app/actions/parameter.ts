"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { PpicParams } from "@/lib/ppic";
import type { ActionResult } from "./stock";

const int = (label: string, min: number) =>
  z.number({ error: `${label} harus angka` }).int(`${label} harus bilangan bulat`).min(min, `${label} minimal ${min}`);
const num = (label: string, min: number) => z.number({ error: `${label} harus angka` }).min(min, `${label} minimal ${min}`);

const paramsSchema = z
  .object({
    min_cover_days: int("Min Stock cover", 1),
    max_cover_days: int("Max Stock cover", 1),
    lead_time_days: int("Lead time", 1),
    moq: int("MOQ", 1),
    rounding: z.enum(["ceil", "floor", "round"]),
    weight_h3: num("Bobot H-3", 0).max(100),
    weight_h2: num("Bobot H-2", 0).max(100),
    weight_h1: num("Bobot H-1", 0).max(100),
    weight2_h2: num("Bobot 2 bulan H-2", 0).max(100),
    weight2_h1: num("Bobot 2 bulan H-1", 0).max(100),
    overstock_multiplier: num("Batas overstock", 1),
    min_forecast_to_produce: num("Min forecast", 0),
    deadstock_days: int("Hari deadstock", 1),
    new_product_min_days: int("Umur minimal produk", 1),
    rank_a_pct: num("Batas Ranking A", 1).max(100),
    rank_b_pct: num("Batas Ranking B", 0).max(100),
  })
  .superRefine((p, ctx) => {
    if (p.max_cover_days <= p.min_cover_days) ctx.addIssue({ code: "custom", message: "Max Stock harus lebih besar dari Min Stock" });
    if (Math.abs(p.weight_h3 + p.weight_h2 + p.weight_h1 - 100) > 0.001)
      ctx.addIssue({ code: "custom", message: "Total bobot H-3 + H-2 + H-1 harus 100%" });
    if (Math.abs(p.weight2_h2 + p.weight2_h1 - 100) > 0.001)
      ctx.addIssue({ code: "custom", message: "Total bobot produk 2 bulan harus 100%" });
    if (p.rank_a_pct + p.rank_b_pct > 100) ctx.addIssue({ code: "custom", message: "Batas Ranking A + B maksimal 100%" });
  });

export async function updatePpicParams(input: PpicParams): Promise<ActionResult> {
  const parsed = paramsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Parameter tidak valid" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi berakhir, silakan login ulang" };

  const { error } = await supabase
    .from("ppic_parameters")
    .update({ ...parsed.data, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
