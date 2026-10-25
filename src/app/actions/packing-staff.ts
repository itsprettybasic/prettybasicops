"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/profile";
import type { AppRole } from "@/lib/packing/types";
import type { ActionResult } from "./stock";

function fail(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

export interface CreateStaffInput {
  full_name: string;
  username: string;
  password: string;
  role: AppRole;
}

export interface UpdateStaffInput {
  id: string;
  full_name?: string;
  role?: AppRole;
  is_active?: boolean;
  password?: string;
}

/** Panggil Edge Function pack-staff (service role hanya ada di Supabase). */
async function invokeStaff<T>(body: Record<string, unknown>): Promise<ActionResult<T>> {
  const current = await getCurrentUser();
  if (current?.profile?.role !== "admin") return fail("Hanya admin yang bisa mengelola petugas");
  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke("pack-staff", { body });
  if (error) {
    let message = error.message;
    try {
      const res = await (error as { context?: Response }).context?.json();
      if (res?.error) message = res.error;
    } catch {
      // pakai pesan bawaan
    }
    return fail(message);
  }
  revalidatePath("/packing/petugas");
  return { ok: true, data: data as T };
}

export async function createStaff(input: CreateStaffInput): Promise<ActionResult<{ id: string }>> {
  const username = input.username.trim().toLowerCase();
  if (input.full_name.trim().length < 2) return fail("Nama minimal 2 huruf");
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return fail("Username 3–30 karakter: huruf kecil, angka, titik, _ atau -");
  if (input.password.length < 8) return fail("Password minimal 8 karakter");
  return invokeStaff<{ id: string }>({ action: "create", ...input, full_name: input.full_name.trim(), username });
}

export async function updateStaff(input: UpdateStaffInput): Promise<ActionResult> {
  if (input.password && input.password.length < 8) return fail("Password minimal 8 karakter");
  const res = await invokeStaff<unknown>({ action: "update", ...input });
  return res.ok ? { ok: true, data: undefined } : res;
}
