import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/packing/types";

export interface Profile {
  id: string;
  full_name: string;
  username: string;
  role: AppRole;
  is_active: boolean;
}

/** User login + profilnya (role). Null kalau belum login. `profile` null kalau akun belum punya akses. */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, username, role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  const profile = data && (data as Profile).is_active ? (data as Profile) : null;
  return { user, profile };
});
