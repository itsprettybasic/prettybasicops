"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/profile";
import type { ActionResult } from "./stock";

function fail(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

const settingsSchema = z
  .object({
    retention_days: z.number().int("Lama simpan harus bilangan bulat").min(1, "Lama simpan minimal 1 hari").max(365, "Lama simpan maksimal 365 hari"),
    max_duration_sec: z.number().int().min(30, "Durasi maksimal minimal 30 detik").max(3600, "Durasi maksimal 60 menit"),
    min_duration_sec: z.number().int().min(0, "Durasi minimal tidak boleh minus").max(120, "Durasi minimal maks 120 detik"),
    quality: z.enum(["hemat", "standar", "tinggi"]),
    marketplaces: z
      .array(z.string().trim().min(1, "Nama marketplace kosong").max(30, "Nama marketplace maks 30 karakter"))
      .min(1, "Minimal 1 marketplace")
      .max(10, "Maksimal 10 marketplace"),
    duplicate_warning: z.boolean(),
    record_audio: z.boolean(),
    storage_quota_gb: z.number().positive("Kuota storage harus > 0").max(1000, "Kuota storage maks 1000 GB"),
  })
  .superRefine((d, ctx) => {
    if (d.min_duration_sec >= d.max_duration_sec) {
      ctx.addIssue({ code: "custom", message: "Durasi minimal harus lebih kecil dari durasi maksimal" });
    }
    const lower = d.marketplaces.map((m) => m.toLowerCase());
    if (new Set(lower).size !== lower.length) ctx.addIssue({ code: "custom", message: "Ada marketplace yang dobel" });
  });

export type PackSettingsInput = z.input<typeof settingsSchema>;

async function requireManager() {
  const current = await getCurrentUser();
  const role = current?.profile?.role;
  if (!current?.profile || (role !== "admin" && role !== "supervisor")) return null;
  return current.profile;
}

export async function updatePackSettings(input: PackSettingsInput): Promise<ActionResult> {
  const profile = await requireManager();
  if (!profile) return fail("Hanya admin/supervisor yang bisa mengubah pengaturan");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Data tidak valid");
  const supabase = await createClient();
  const { error } = await supabase
    .from("pack_settings")
    .update({ ...parsed.data, updated_at: new Date().toISOString(), updated_by_name: profile.full_name })
    .eq("id", true);
  if (error) return fail(error.message);
  revalidatePath("/packing", "layout");
  return { ok: true, data: undefined };
}

export async function applyRetentionToExisting(): Promise<ActionResult<{ count: number }>> {
  if (!(await requireManager())) return fail("Hanya admin/supervisor");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_pack_retention_to_existing");
  if (error) return fail(error.message);
  revalidatePath("/packing", "layout");
  return { ok: true, data: { count: (data as number) ?? 0 } };
}

export async function runPackCleanupNow(): Promise<ActionResult<{ deleted: number; stale: number }>> {
  if (!(await requireManager())) return fail("Hanya admin/supervisor");
  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke("pack-cleanup", { body: {} });
  if (error) {
    let message = error.message;
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
      else if (body?.errors?.length) message = body.errors.join(" · ");
    } catch {
      // pakai pesan bawaan
    }
    return fail(`Gagal menjalankan pembersihan: ${message}`);
  }
  revalidatePath("/packing", "layout");
  return { ok: true, data: { deleted: data?.deleted ?? 0, stale: data?.stale ?? 0 } };
}
