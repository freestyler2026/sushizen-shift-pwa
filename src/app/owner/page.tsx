"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getOwnerSession, setOwnerSession } from "@/lib/owner-auth";

export default function OwnerLoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getOwnerSession()) router.replace("/owner/dashboard");
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/owner/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login_id: loginId, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "ログインできませんでした。");
      setOwnerSession({
        token: data.token,
        expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
        displayName: data.owner.display_name,
        stores: data.owner.stores,
      });
      router.replace("/owner/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ログインできませんでした。");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Sushi ZEN</p>
          <h1 className="mt-2 text-2xl font-bold text-white">オーナーポータル</h1>
          <p className="mt-1 text-sm text-slate-400">ご出資店舗の売上・分配・運営状況</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">ログインID</span>
            <input value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="username" required
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/60 focus-visible:ring-2 focus-visible:ring-emerald-500/30" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">パスワード</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/60 focus-visible:ring-2 focus-visible:ring-emerald-500/30" />
          </label>
          {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60">
            {busy ? "ログイン中…" : "ログイン"}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-500">初めての方は、本部からお送りしたリンクでパスワードを設定してください。</p>
      </div>
    </div>
  );
}
