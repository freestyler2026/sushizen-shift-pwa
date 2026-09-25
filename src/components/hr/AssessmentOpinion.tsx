"use client";

import { useState } from "react";

/** AIの読み。**参考であって合否ではない。**
 *
 *  点数とフラグは既に画面に出ている。ここが足すのは、記述3問を読むこと
 *  （今まで誰も採点していなかった）、数字どうしの食い違いを名指しすること、
 *  そして設問数の薄い因子を「判断できない」と言うこと。
 *
 *  押したときだけ作る。結果を開くたびに数十秒待たせるのも、開いただけで
 *  課金するのも違う。一度作ったら保存され、次からは同じ文面が出る ——
 *  2人が同じ候補者の話をするとき、別の文面を見ていては話にならない。
 */
export type Opinion = {
  ok?: boolean;
  model?: string;
  generated_at?: string;
  reading?: string[];
  ask?: string[];
  cannot_say?: string[];
  essay_note?: string;
  reason?: string;
};

const SECTIONS: { key: keyof Opinion; title: string; tone: string }[] = [
  { key: "reading", title: "読み取れること", tone: "text-zinc-200" },
  { key: "ask", title: "面接で確かめるとよいこと", tone: "text-sky-200" },
  { key: "cannot_say", title: "この結果では判断できないこと", tone: "text-amber-200" },
];

export default function AssessmentOpinion({
  candidateId,
  initial,
  complete,
}: {
  candidateId: string;
  initial?: Opinion | null;
  complete: boolean;
}) {
  const [op, setOp] = useState<Opinion | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function run(refresh: boolean) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(
        `/api/admin/hr/manager-assessment/candidate/${candidateId}/opinion${refresh ? "?refresh=true" : ""}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOp(data.opinion ?? null);
      if (data.opinion && data.opinion.ok === false) setErr(data.opinion.reason || "");
    } catch (e) {
      // 取れなかったことと、読みが「無い」ことは別。
      setErr(`読みを出せませんでした（${String(e)}）。`);
    } finally {
      setBusy(false);
    }
  }

  const has = op?.ok && ((op.reading?.length ?? 0) || (op.ask?.length ?? 0) || (op.cannot_say?.length ?? 0));

  return (
    <div className="rounded-xl border border-violet-500/25 bg-violet-900/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-violet-200">AIの読み</h3>
          {/* 何であって何でないかを、読む前に言う。 */}
          <p className="text-[11px] leading-snug text-zinc-500">
            判断材料の1つです。合否は書きません。設問数の少ない因子からは結論を出しません。
          </p>
        </div>
        {complete && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(Boolean(has))}
            className="shrink-0 rounded-lg border border-violet-400/40 px-3 py-1 text-xs text-violet-200 transition hover:bg-violet-500/15 disabled:opacity-50"
          >
            {busy ? "読んでいます…" : has ? "作り直す" : "読ませる"}
          </button>
        )}
      </div>

      {!complete && (
        <p className="mt-2 text-xs italic text-zinc-500">
          全問終わってから読みます。途中の回答には出しません。
        </p>
      )}

      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}

      {has && (
        <div className="mt-3 space-y-3">
          {SECTIONS.map(({ key, title, tone }) => {
            const list = (op?.[key] as string[] | undefined) ?? [];
            if (list.length === 0) return null;
            return (
              <div key={key}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
                <ul className="mt-1 space-y-1">
                  {list.map((t, i) => (
                    <li key={i} className={`text-xs leading-relaxed ${tone}`}>— {t}</li>
                  ))}
                </ul>
              </div>
            );
          })}
          {op?.essay_note && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">記述への所見</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-300">{op.essay_note}</p>
            </div>
          )}
          <p className="text-[11px] text-zinc-600">
            {op?.model}
            {op?.generated_at && ` ・ ${new Date(op.generated_at).toLocaleString("ja-JP")}`}
            {" ・ 同じ結果を2人で見たとき同じ文面が出るよう、作ったものを保存しています。"}
          </p>
        </div>
      )}
    </div>
  );
}
