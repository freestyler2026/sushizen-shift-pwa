"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getInvestorSession } from "@/lib/investor-auth";

const VALID_NAME = "test";
const VALID_PW = "sushizen";

export default function InvestorLoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getInvestorSession()) router.replace("/investor/dashboard");
  }, [router]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setTimeout(() => {
      if (name.trim().toLowerCase() === VALID_NAME && pw === VALID_PW) {
        localStorage.setItem("sushizen_investor_session", JSON.stringify({ loggedIn: true, loginAt: Date.now() }));
        router.replace("/investor/dashboard");
      } else {
        setError("名前またはパスワードが正しくありません。");
        setLoading(false);
      }
    }, 400);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        {/* Logo / title */}
        <div className="mb-10 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/25">
            <span className="text-2xl font-bold text-emerald-400">ZEN</span>
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">Sushi ZEN FOCO</h1>
          <p className="mt-1 text-sm text-slate-400">投資家向けポータル</p>
        </div>

        <form onSubmit={handleLogin} className="rounded-2xl border border-white/8 bg-white/4 p-8 shadow-2xl backdrop-blur">
          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">
                お名前
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="名前を入力"
                required
                autoComplete="off"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">
                パスワード
              </label>
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="パスワードを入力"
                required
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition"
              />
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400 text-center">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 transition hover:from-emerald-400 hover:to-teal-400 disabled:opacity-60"
          >
            {loading ? "確認中..." : "ログイン"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-600">
          Sushi ZEN Group — 投資家専用ページ
        </p>
      </div>
    </div>
  );
}
