"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError("Email atau password salah.");
      setLoading(false);
      return;
    }
    router.replace("/ppic");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <form onSubmit={submit} className="w-[400px] rounded-2xl border border-line bg-white p-8">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-extrabold tracking-[-0.02em] text-white">
            PB
          </div>
          <div>
            <div className="text-[17px] leading-tight font-bold tracking-[-0.01em] text-ink">Pretty Basic</div>
            <div className="mt-0.5 text-[12px] text-grey-1">PPIC System</div>
          </div>
        </div>

        <div className="mb-4">
          <label className="form-label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            className="form-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="mb-5">
          <label className="form-label" htmlFor="password">Password</label>
          <div className="relative">
            <input
              id="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
              className="form-input pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Sembunyikan password" : "Lihat password"}
              className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer text-grey-1 hover:text-ink"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" variant="primary" loading={loading} className="w-full py-2.5">
          Masuk
        </Button>
        {error && <div className="mt-3 text-center text-[12.5px] font-semibold text-neg">{error}</div>}
      </form>
    </div>
  );
}
