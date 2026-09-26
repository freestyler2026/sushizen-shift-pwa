"use client";

/** 参考点。**計算であって、AIが付けた点ではない。**
 *
 *  点は段落より強く使われる。一度出れば人は並べ替える。だから画面には
 *  必ず3つを一緒に出す —— 合計、その内訳、そして**この点に入っていないもの**。
 *  合計だけを出すと、測っていない範囲まで含めた人物評価として読まれる。
 */
export type Reference = {
  total: number;
  out_of: number;
  components: { name: string; got: number; max: number; detail: string; note: string }[];
  excluded: string[];
};

export default function ReferenceScore({ reference }: { reference?: Reference | null }) {
  if (!reference) return null;
  const { total, out_of: outOf, components, excluded } = reference;
  const pct = outOf ? Math.round((total / outOf) * 100) : 0;

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">参考点</span>
        <span className="text-2xl font-semibold tabular-nums text-white">{total}</span>
        <span className="text-xs text-zinc-500">/ {outOf}</span>
      </div>

      <div className="mt-2 space-y-1.5">
        {components.map((c) => (
          <div key={c.name}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-zinc-300">{c.name}</span>
              <span className="font-mono tabular-nums text-zinc-400">
                {c.got} / {c.max}
              </span>
            </div>
            <div className="mt-0.5 h-1 rounded bg-white/5">
              <div
                className="h-1 rounded bg-violet-400/60"
                style={{ width: `${c.max ? Math.max(0, Math.min(100, (c.got / c.max) * 100)) : 0}%` }}
              />
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-zinc-600">
              {c.detail} — {c.note}
            </p>
          </div>
        ))}
      </div>

      {/* 点と同じ枠の中に置く。別のカードに追いやると読まれない。 */}
      <div className="mt-3 border-t border-white/10 pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300/80">
          この点に入っていないもの
        </p>
        <ul className="mt-1 space-y-0.5">
          {excluded.map((x, i) => (
            <li key={i} className="text-[11px] leading-snug text-zinc-500">— {x}</li>
          ))}
        </ul>
      </div>

      <p className="mt-2 text-[11px] text-zinc-600">
        測れた成分だけの計算です（{pct}%）。同じ回答なら何度計算しても同じ値になります。
        順位付けや合否には使えません。
      </p>
    </div>
  );
}
