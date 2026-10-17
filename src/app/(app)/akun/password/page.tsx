"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

export default function ChangePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 8;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch || tooShort) return;
    setLoading(true);
    const { error } = await createClient().auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(`Gagal ganti password: ${error.message}`);
      return;
    }
    setPassword("");
    setConfirm("");
    toast.success("Password berhasil diganti");
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink">Ganti Password</h1>
        <div className="mt-1.5 text-[13.5px] text-grey-1">Gunakan minimal 8 karakter</div>
      </div>
      <Panel className="max-w-[440px]">
        <form onSubmit={submit}>
          <div className="mb-4">
            <label className="form-label">Password Baru</label>
            <input
              type="password"
              autoComplete="new-password"
              className={`form-input ${tooShort ? "error" : ""}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {tooShort && <div className="form-error">Minimal 8 karakter</div>}
          </div>
          <div className="mb-5">
            <label className="form-label">Ulangi Password Baru</label>
            <input
              type="password"
              autoComplete="new-password"
              className={`form-input ${mismatch ? "error" : ""}`}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            {mismatch && <div className="form-error">Password tidak sama</div>}
          </div>
          <Button type="submit" variant="primary" loading={loading} disabled={!password || mismatch || tooShort}>
            Simpan Password
          </Button>
        </form>
      </Panel>
    </div>
  );
}
