// src/app/admin/hr/manager-assessment/page.tsx
"use client";

import ReferenceScore, { type Reference } from "@/components/hr/ReferenceScore";
import AssessmentOpinion, { type Opinion } from "@/components/hr/AssessmentOpinion";
/**
 * 店長適性検査 — 受験者と結果。
 *
 * **総合点もバンドも出しません。**応募者は十数名で、合否の線に統計的な根拠が
 * 作れないためです。出すのは ①フラグ ②その根拠になった本人の選択そのもの
 * ③面接で聞くこと の3つ。「他責55点」より「Q3でこれを選んだ。だからこれを聞け」
 * の方が使えます。
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { GLASS_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, T_PAGE_TITLE, INPUT_CLASS,
         BADGE_ERROR, BADGE_WARNING, BADGE_SUCCESS, BADGE_INFO } from "@/lib/ui-tokens";

type Flag = {
  key: string; label: string; heavy: boolean; ask: string;
  evidence: { qn: string; text: string; chose: string }[];
};
type Result = {
  reference?: Reference | null;
  attribution_pct: number | null;
  pair_marked: number;
  big_five: Record<string, { label: string; pct: number; n: number }>;
  english: { score: number; answered: number; total: number; band: string; writing_missed: string[] };
  essays: { qn: string; prompt: string; text: string; chars: number; elapsed_ms: number }[];
  flags: Flag[];
  verdict: string;
  answered: number; total: number;
};
type Candidate = {
  id: string; full_name: string; agency: string; note: string;
  status: string; answered: number; link_until: string | null; opened_at: string | null;
  created_at: string; result: Result | null;
  opinion?: Opinion | null;
};

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(getAuthHeaders(getAuth()) ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = {};
  try { body = JSON.parse(text); } catch { body = { detail: text }; }
  if (!res.ok) throw new Error((body as { detail?: string })?.detail || text || "失敗しました");
  return body as T;
}

export default function ManagerAssessmentPage() {
  const [rows, setRows] = useState<Candidate[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [agency, setAgency] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ name: string; url: string; until: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ candidates: Candidate[] }>("/api/admin/hr/manager-assessment/candidates");
      setRows(d.candidates ?? []); setErr("");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function urlFor(token: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/assessment/${token}`;
  }

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const d = await api<{ token: string; expires_at: string }>(
        "/api/admin/hr/manager-assessment/candidate",
        { method: "POST", body: JSON.stringify({ full_name: name, agency }) });
      setLink({ name: name.trim(), url: urlFor(d.token), until: d.expires_at });
      setName(""); setAgency("");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function reissue(c: Candidate) {
    setBusy(true);
    try {
      const d = await api<{ token: string; expires_at: string }>(
        `/api/admin/hr/manager-assessment/candidate/${c.id}/link`, { method: "POST" });
      setLink({ name: c.full_name, url: urlFor(d.token), until: d.expires_at });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen px-3 pt-4 pb-24 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className={T_PAGE_TITLE}>店長適性検査</h1>
            <p className="mt-1 text-sm text-zinc-400">
              マニラ・日本人店長／管理責任者。
              <a href="https://claude.ai/code/artifact/2a4aa036-7ae0-4fdd-bc58-a548caa8eb3f"
                 target="_blank" rel="noopener noreferrer"
                 className="ml-1 text-violet-300 underline">設問集と採点キー</a>
            </p>
          </div>
          <Link href="/admin/hr/recruitment" className={SECONDARY_BUTTON}>採用に戻る</Link>
        </div>

        {err && <p className="text-sm text-red-400">{err}</p>}

        <div className={`${GLASS_CARD} p-4 sm:p-5`}>
          <h2 className="text-sm font-semibold text-white">受験者を追加してリンクを出す</h2>
          <p className="mt-1 text-xs text-zinc-500">
            リンクは派遣会社経由でご本人へ。<strong>もう1本出しても前のリンクは生きています。</strong>
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input className={INPUT_CLASS} value={name} placeholder="氏名"
                   onChange={(e) => setName(e.target.value)} />
            <input className={INPUT_CLASS} value={agency} placeholder="派遣会社（任意）"
                   onChange={(e) => setAgency(e.target.value)} />
            <button type="button" onClick={add} disabled={busy || !name.trim()}
                    className={PRIMARY_BUTTON}>追加してリンク発行</button>
          </div>
          {link && (
            <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-900/20 p-3">
              <p className="text-xs text-emerald-300">{link.name} さんのリンク（
                {new Date(link.until).toLocaleDateString("ja-JP")} まで有効）</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="break-all text-xs text-white">{link.url}</code>
                <button type="button" className={SECONDARY_BUTTON}
                        onClick={() => void navigator.clipboard?.writeText(link.url)}>コピー</button>
              </div>
            </div>
          )}
        </div>

        {loading && <p className="text-sm text-zinc-500">読み込んでいます…</p>}
        {!loading && rows.length === 0 && (
          <p className="text-sm text-zinc-500">まだ受験者がいません。</p>
        )}

        {rows.map((c) => {
          const r = c.result;
          const heavy = (r?.flags ?? []).filter((f) => f.heavy).length;
          return (
            <div key={c.id} className={`${GLASS_CARD} overflow-hidden`}>
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="text-sm font-semibold text-white">{c.full_name}</span>
                {c.agency && <span className="text-xs text-zinc-500">{c.agency}</span>}
                <span className={c.status === "completed" ? BADGE_SUCCESS
                                : c.status === "in_progress" ? BADGE_INFO : BADGE_WARNING}>
                  {c.status === "completed" ? "完了" : c.status === "in_progress" ? "受験中" : "未受験"}
                </span>
                <span className="text-xs text-zinc-500">{c.answered} / 73 問</span>
                {r && (
                  <span className={heavy >= 2 ? BADGE_ERROR : heavy === 1 ? BADGE_WARNING : BADGE_SUCCESS}>
                    {r.verdict}
                  </span>
                )}
                {r && <span className="text-xs text-zinc-400">英語 {r.english.score}/10・{r.english.band}</span>}
                <div className="ml-auto flex gap-2">
                  <button type="button" onClick={() => reissue(c)} className={SECONDARY_BUTTON}>
                    リンク再発行
                  </button>
                  {r && (
                    <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)}
                            className={SECONDARY_BUTTON}>
                      {open === c.id ? "閉じる" : "結果を見る"}
                    </button>
                  )}
                </div>
              </div>

              {open === c.id && r && (
                <div className="space-y-4 border-t border-white/8 px-4 py-4">
                  {r.flags.length === 0 && (
                    <p className="text-sm text-emerald-300">フラグはありません。</p>
                  )}
                  {r.flags.map((f) => (
                    <div key={f.key}
                         className={`rounded-xl border p-3 ${f.heavy
                           ? "border-red-500/40 bg-red-900/15" : "border-amber-500/30 bg-amber-900/10"}`}>
                      <p className={`text-sm font-semibold ${f.heavy ? "text-red-300" : "text-amber-300"}`}>
                        {f.label}{f.heavy ? "（重）" : ""}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">面接で聞くこと：{f.ask}</p>
                      <div className="mt-2 space-y-1.5">
                        {f.evidence.map((e, i) => (
                          <div key={i} className="rounded-lg bg-black/25 px-2.5 py-2">
                            <p className="text-[11px] text-zinc-500">{e.qn}　{e.text}</p>
                            <p className="text-xs text-white">選んだ答え：{e.chose}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {Object.entries(r.big_five).map(([k, v]) => (
                      <div key={k} className="rounded-xl bg-white/5 p-2.5">
                        <p className="text-[11px] text-zinc-500">{v.label}</p>
                        <p className="text-lg font-semibold text-white">{v.pct}</p>
                        <div className="mt-1 h-1 rounded-full bg-white/10">
                          <div className="h-1 rounded-full bg-violet-400" style={{ width: `${v.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500">
                    原因帰属 {r.attribution_pct ?? "—"}%　／　二者択一の印 {r.pair_marked} 件
                    {r.english.writing_missed.length > 0 &&
                      `　／　英語の作文で落とした問: ${r.english.writing_missed.join("・")}`}
                  </p>

                  <ReferenceScore reference={r.reference} />

                  <AssessmentOpinion
                    candidateId={c.id}
                    initial={c.opinion ?? null}
                    complete={r.answered >= r.total}
                  />

                  {r.essays.map((e) => (
                    <div key={e.qn} className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <p className="text-xs text-zinc-500">{e.qn}　{e.prompt}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">
                        {e.text || <span className="text-zinc-600">（未記入）</span>}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-600">
                        {e.chars}字・{Math.round(e.elapsed_ms / 1000)}秒
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
