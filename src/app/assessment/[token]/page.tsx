// src/app/assessment/[token]/page.tsx
"use client";

/**
 * 店長適性検査の受験画面。**未認証。**リンクだけが鍵。
 *
 * 1画面1問・前の問題には戻れない。戻れないのは一貫性を測るためで、
 * **途中で切れたら同じリンクで続きから再開できる** — この2つは別の話です。
 * 戻れないことと再開できないことを一緒にすると、通信が切れた応募者が
 * ただ詰みます（サーバは「まだ答えていない最初の問」を返すだけ）。
 *
 * 画面は日本語。UIは英語のみという全体の規則の例外で、理由は読み手が
 * 日本から応募してくる候補者だからです（社内スタッフ向けではない）。
 */

import { useCallback, useEffect, useRef, useState } from "react";

type Question = {
  qn: string;
  section: string;
  type: "choice" | "pair" | "likert" | "essay";
  text: string;
  mode?: "most_least" | "single";
  options?: string[];
  min_chars?: number;
  max_chars?: number;
};

type State = {
  ok?: boolean;
  name?: string;
  status?: string;
  done: number;
  total: number;
  section: string | null;
  section_title?: string;
  section_minutes?: number;
  seconds_left?: number | null;
  hard_stop?: boolean;
  section_done?: number;
  section_total?: number;
  question: Question | null;
};

const SECTION_INTRO: Record<string, { title: string; body: string }> = {
  S1: {
    title: "第1部　状況設問（30問）",
    body: "実際に起きる場面です。どう考えるかを選んでください。飲食の知識は要りません。"
      + "正解を探すより、ふだんの自分に近いものを選んでください。",
  },
  S2: {
    title: "第2部　性格設問（30問）",
    body: "自分にどれだけ当てはまるかを5段階で選んでください。深く考えず、直感で構いません。",
  },
  S4: {
    title: "第4部　英語（10問・15分）",
    body: "実際に店長のもとへ届く種類の文です。辞書は使わずにお答えください。",
  },
  S3: {
    title: "第3部　記述（3問）",
    body: "各問200字以上400字以内。目安は20分ですが、時間で締め切りません。"
      + "辞書や検索を使っていただいて構いません。",
  },
};

function mmss(s: number) {
  const m = Math.floor(Math.max(0, s) / 60);
  const r = Math.max(0, s) % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function AssessmentPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [st, setSt] = useState<State | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  // 締切の時刻を持ち、残りはそこから計算する。秒を減らしていく作り方だと
  // 「left が変わるたびに setInterval を張り直す」か「依存から外して古い値を
  // 掴む」かの二択になり、どちらも壊れる。
  const [deadline, setDeadline] = useState<number | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const shownAt = useRef<number>(Date.now());

  // 回答中の値
  const [most, setMost] = useState<number | null>(null);
  const [least, setLeast] = useState<number | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [likert, setLikert] = useState<number | null>(null);
  const [essay, setEssay] = useState("");

  useEffect(() => { void params.then((p) => setToken(p.token)); }, [params]);

  const load = useCallback(async (t: string) => {
    try {
      const res = await fetch(`/api/assessment/${encodeURIComponent(t)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body?.detail || "読み込めませんでした。"); return; }
      setSt(body);
      setDeadline(body.seconds_left == null ? null : Date.now() + body.seconds_left * 1000);
    } catch {
      setErr("通信できませんでした。電波の良い場所でもう一度お試しください。");
    }
  }, []);

  useEffect(() => { if (token) void load(token); }, [token, load]);

  useEffect(() => {
    if (deadline === null) { setLeft(null); return; }
    const tick = () => setLeft(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  // 時間切れ。サーバに聞き直すと、時間の切れた区分は飛ばして次を返す。
  const hardStop = st?.hard_stop ?? false;
  useEffect(() => {
    if (left !== null && left <= 0 && hardStop && token) {
      setDeadline(null);
      void load(token);
      setShowIntro(true);
    }
  }, [left, hardStop, token, load]);

  function reset() {
    setMost(null); setLeast(null); setChoice(null); setLikert(null); setEssay("");
    shownAt.current = Date.now();
  }

  async function begin() {
    if (!st?.section || !token) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/assessment/${encodeURIComponent(token)}/start?section=${st.section}`,
        { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) { setSt(body); setDeadline(body.seconds_left == null ? null : Date.now() + body.seconds_left * 1000); }
      setShowIntro(false); reset();
    } finally { setBusy(false); }
  }

  async function submit(value: Record<string, unknown>) {
    if (!st?.question || !token) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/assessment/${encodeURIComponent(token)}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qn: st.question.qn, value,
          elapsed_ms: Date.now() - shownAt.current,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body?.detail || "保存できませんでした。"); return; }
      const prevSection = st.section;
      setSt(body);
      setDeadline(body.seconds_left == null ? null : Date.now() + body.seconds_left * 1000);
      reset();
      if (body.section && body.section !== prevSection) setShowIntro(true);
      if (!body.question) {
        await fetch(`/api/assessment/${encodeURIComponent(token)}/finish`, { method: "POST" });
      }
    } catch {
      setErr("保存できませんでした。もう一度押してください。");
    } finally { setBusy(false); }
  }

  if (err && !st) return <Shell><p className="text-lg">{err}</p></Shell>;
  if (!st) return <Shell><p>読み込んでいます…</p></Shell>;

  if (!st.question) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">お疲れさまでした</h1>
        <p className="mt-3">回答を受け付けました。この画面は閉じていただいて構いません。</p>
        <p className="mt-2 text-sm text-stone-500">{st.done} / {st.total} 問</p>
      </Shell>
    );
  }

  const q = st.question;
  const intro = SECTION_INTRO[st.section || ""];

  if (showIntro && intro) {
    return (
      <Shell>
        <p className="text-sm text-stone-500">{st.name} 様</p>
        <h1 className="mt-1 text-2xl font-bold">{intro.title}</h1>
        <p className="mt-3 leading-relaxed">{intro.body}</p>
        {st.section_minutes ? (
          <p className="mt-3 text-sm text-stone-600">
            制限時間 {st.section_minutes} 分
            {st.hard_stop ? "。時間になると次へ進みます。" : "（目安です。時間では締め切りません）"}
          </p>
        ) : null}
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>前の問題には戻れません。</b>途中で画面が切れた場合は、同じリンクをもう一度開けば
          続きから再開できます。
        </p>
        <button type="button" onClick={begin} disabled={busy}
          className="mt-6 w-full rounded-xl bg-stone-900 px-5 py-3.5 text-base font-semibold text-white disabled:opacity-50">
          始める
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-baseline justify-between text-sm text-stone-500">
        <span>{st.section_title}　{(st.section_done ?? 0) + 1} / {st.section_total}</span>
        {left !== null && st.hard_stop && (
          <span className={left <= 60 ? "font-semibold text-red-600" : ""}>残り {mmss(left)}</span>
        )}
      </div>
      <div className="mt-2 h-1 w-full rounded-full bg-stone-200">
        <div className="h-1 rounded-full bg-stone-800"
             style={{ width: `${Math.round((st.done / st.total) * 100)}%` }} />
      </div>

      <p className="mt-6 whitespace-pre-wrap text-lg leading-relaxed">{q.text}</p>

      {q.type === "choice" && q.mode === "most_least" && (
        <div className="mt-5">
          <p className="text-sm text-stone-500">
            <b>最も近いもの</b>と<b>最も遠いもの</b>を1つずつ選んでください。
          </p>
          <div className="mt-3 space-y-2">
            {(q.options ?? []).map((o, i) => (
              <div key={i} className="rounded-xl border border-stone-200 bg-white p-3">
                <p className="text-[15px] leading-relaxed">{o}</p>
                <div className="mt-2 flex gap-2">
                  <Pick on={most === i} disabled={least === i}
                        onClick={() => setMost(i)} label="最も近い" />
                  <Pick on={least === i} disabled={most === i}
                        onClick={() => setLeast(i)} label="最も遠い" />
                </div>
              </div>
            ))}
          </div>
          <Next disabled={busy || most === null || least === null}
                onClick={() => submit({ most, least })} />
        </div>
      )}

      {q.type === "choice" && q.mode !== "most_least" && (
        <Options options={q.options ?? []} value={choice} onPick={setChoice}
                 onNext={() => submit({ choice })} busy={busy} />
      )}

      {q.type === "pair" && (
        <Options options={q.options ?? []} value={choice} onPick={setChoice}
                 onNext={() => submit({ choice })} busy={busy}
                 hint="どちらが自分に近いですか。どちらも良い答えです。" />
      )}

      {q.type === "likert" && (
        <div className="mt-5">
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((v) => (
              <button key={v} type="button" onClick={() => setLikert(v)}
                className={`rounded-xl border px-2 py-4 text-lg font-semibold transition ${
                  likert === v ? "border-stone-900 bg-stone-900 text-white"
                               : "border-stone-200 bg-white hover:border-stone-400"}`}>
                {v}
              </button>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-stone-500">
            <span>まったく当てはまらない</span><span>とても当てはまる</span>
          </div>
          <Next disabled={busy || likert === null} onClick={() => submit({ value: likert })} />
        </div>
      )}

      {q.type === "essay" && (
        <div className="mt-5">
          <textarea
            value={essay}
            onChange={(e) => setEssay(e.target.value)}
            rows={12}
            placeholder="200字以上400字以内"
            className="w-full rounded-xl border border-stone-300 p-3 text-base leading-relaxed outline-none focus:border-stone-600"
          />
          <p className={`mt-1 text-sm ${
            essay.length < 200 || essay.length > 400 ? "text-stone-500" : "text-emerald-700"}`}>
            {essay.length} 字（200〜400字）
          </p>
          <Next disabled={busy || essay.length < 200 || essay.length > 400}
                onClick={() => submit({ text: essay })} />
        </div>
      )}

      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-stone-100 px-4 py-8 text-stone-900">
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-5 shadow-sm sm:p-7">{children}</div>
    </main>
  );
}

function Pick({ on, disabled, onClick, label }: {
  on: boolean; disabled: boolean; onClick: () => void; label: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
        on ? "bg-stone-900 text-white"
           : disabled ? "bg-stone-100 text-stone-300"
                      : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}>
      {label}
    </button>
  );
}

function Options({ options, value, onPick, onNext, busy, hint }: {
  options: string[]; value: number | null; onPick: (i: number) => void;
  onNext: () => void; busy: boolean; hint?: string;
}) {
  return (
    <div className="mt-5">
      {hint && <p className="mb-3 text-sm text-stone-500">{hint}</p>}
      <div className="space-y-2">
        {options.map((o, i) => (
          <button key={i} type="button" onClick={() => onPick(i)}
            className={`w-full rounded-xl border p-3 text-left text-[15px] leading-relaxed transition ${
              value === i ? "border-stone-900 bg-stone-900 text-white"
                          : "border-stone-200 bg-white hover:border-stone-400"}`}>
            {o}
          </button>
        ))}
      </div>
      <Next disabled={busy || value === null} onClick={onNext} />
    </div>
  );
}

function Next({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="mt-6 w-full rounded-xl bg-stone-900 px-5 py-3.5 text-base font-semibold text-white disabled:opacity-40">
      次へ
    </button>
  );
}
