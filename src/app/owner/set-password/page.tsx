"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function SetPasswordForm() {
  const token = useSearchParams().get("token") || "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ login_id: string; display_name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (pw !== pw2) { setError("The two passwords do not match."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/owner/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not set the password.");
      setDone(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set the password.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return <p className="text-sm text-slate-300">This link is incomplete. Open the full link HQ sent you.</p>;
  }
  if (done) {
    return (
      <div className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-sm">
        <p className="font-semibold text-emerald-300">Password set for {done.display_name}.</p>
        <p className="text-slate-300">Your login ID is <span className="font-mono text-white">{done.login_id}</span>.</p>
        <Link href="/owner" className="inline-block rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950">Go to sign in</Link>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
      <p className="text-sm text-slate-300">Choose a password of at least 10 characters with letters and numbers. Only you will know it.</p>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">New password</span>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required minLength={10}
          className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/60" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Repeat password</span>
        <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required minLength={10}
          className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/60" />
      </label>
      {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60">
        {busy ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}

export default function OwnerSetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-bold text-white">Set your password</h1>
        <Suspense fallback={null}><SetPasswordForm /></Suspense>
      </div>
    </div>
  );
}
