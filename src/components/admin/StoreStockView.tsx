"use client";

import { useCallback, useEffect, useState } from "react";
import { GLASS_CARD, T_CARD_TITLE } from "@/lib/ui-tokens";

type StockItem = {
  item_code: string;
  item_name: string;
  unit: string;
  section: string;
  par_level: number;
  min_level: number;
  counted_qty: number | null;
  received_since: number;
  on_hand: number | null;
  pct_of_par: number | null;
  not_counted: boolean;
};

type StockView = {
  branch: string;
  count_date: string | null;
  count_shift: string | null;
  counted_at: string | null;
  items: StockItem[];
  counted_items: number;
  receipts_added: number;
  unmatched_receipts: { item_name: string; qty: number; unit: string; reason: string }[];
  unmatched_count: number;
};

const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, ""));

/** 店舗の在庫。数えた数 ＋ そのあと着いた数。
 *
 *  新しく数えてもらうものは何も無い。店舗は Daily Inventory で毎日この数字を
 *  打っていて（2026-09 実測: マニラ3店で月15,941行）、これまでそれを在庫として
 *  読む場所が無かっただけ。打った本人が結果を見られないと、入力は続かない。
 *
 *  ⚠️ **売れた分は引いていない。** POS の明細と棚卸しの品名は別の名簿なので、
 *  繋ぐと7〜8割落ちる。引けないものを引いたふりをするより、何を足して何を
 *  足していないかを画面に書く。
 */
export default function StoreStockView({
  branch, onBack, fetcher,
}: {
  branch: string;
  onBack: () => void;
  /** 呼び出し側の apiFetch をそのまま使う。401 のリフレッシュを含む取得は
   *  既に1つあるので、ここに2つ目を書かない（教訓62）。 */
  fetcher: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const [data, setData] = useState<StockView | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetcher(`/api/daily-inventory/stock?branch=${encodeURIComponent(branch)}`);
      const text = await res.text();
      if (!res.ok) throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
      setData(JSON.parse(text) as StockView);
    } catch (e) {
      // 「読めなかった」を「在庫ゼロ」と同じ見た目にしない。
      setData(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [branch, fetcher]);

  useEffect(() => { void load(); }, [load]);

  const counted = (data?.items ?? []).filter((i) => !i.not_counted);
  const below = counted
    .filter((i) => i.par_level > 0 && (i.on_hand ?? 0) < i.par_level)
    .sort((a, b) => (a.pct_of_par ?? 999) - (b.pct_of_par ?? 999));
  const rest = counted.filter((i) => !below.includes(i));
  const notCounted = (data?.items ?? []).filter((i) => i.not_counted);

  const countedAt = data?.counted_at
    ? new Date(data.counted_at).toLocaleString("en-GB", {
        timeZone: "Asia/Manila", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <div className="mx-auto max-w-4xl pb-24 text-white">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold sm:text-xl">📊 Stock on hand — {branch}</h1>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} disabled={loading}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-50">
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button type="button" onClick={onBack}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300 hover:bg-white/10">
            Back to form
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-sm text-red-300">
          Could not read it ({error}). This is not the same as the shelves being empty.
        </div>
      )}

      {!error && data && !data.count_date && (
        <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm text-amber-200">
          No count has been filed for {branch} yet. Stock here is read from the daily count —
          until one is submitted there is nothing to show.
        </div>
      )}

      {!error && data && data.count_date && (
        <>
          <div className={`${GLASS_CARD} mb-3 px-4 py-3`}>
            <p className="text-sm text-zinc-200">
              Counted <strong>{data.count_date}</strong>{data.count_shift ? ` ${data.count_shift}` : ""}
              {countedAt ? ` · ${countedAt}` : ""} — {data.counted_items} items
              {data.receipts_added > 0 && <> · <strong>{data.receipts_added}</strong> items had a delivery added after the count</>}
            </p>
            {/* 何を足して何を足していないかを、数字の隣に書く。 */}
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
              On hand = what was counted + what was received after the count was submitted.
              It does <strong>not</strong> subtract what has been sold since, so treat it as
              &ldquo;at least this much&rdquo;. A fresh count replaces it.
            </p>
          </div>

          <div className={`${GLASS_CARD} mb-3 p-4`}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className={T_CARD_TITLE}>Below par</h2>
              <span className="text-xs text-zinc-500">{below.length} of {counted.length} counted</span>
            </div>
            {below.length === 0 ? (
              <p className="text-sm italic text-zinc-500">Nothing counted is below par.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-zinc-500">
                      <th className="py-1 text-left font-normal">Item</th>
                      <th className="py-1 text-right font-normal w-20">Counted</th>
                      <th className="py-1 text-right font-normal w-20">+ In</th>
                      <th className="py-1 text-right font-normal w-24">On hand</th>
                      <th className="py-1 text-right font-normal w-16">Par</th>
                      <th className="py-1 text-right font-normal w-16">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {below.map((i) => (
                      <tr key={i.item_code} className="border-t border-white/5">
                        <td className="py-1.5 text-zinc-200">{i.item_name}
                          <span className="ml-1 text-[11px] text-zinc-600">{i.unit}</span></td>
                        <td className="py-1.5 text-right tabular-nums text-zinc-400">{n(i.counted_qty ?? 0)}</td>
                        <td className={`py-1.5 text-right tabular-nums ${i.received_since > 0 ? "text-emerald-300" : "text-zinc-700"}`}>
                          {i.received_since > 0 ? n(i.received_since) : "—"}
                        </td>
                        <td className="py-1.5 text-right tabular-nums font-medium text-white">{n(i.on_hand ?? 0)}</td>
                        <td className="py-1.5 text-right tabular-nums text-zinc-500">{n(i.par_level)}</td>
                        <td className={`py-1.5 text-right tabular-nums ${(i.pct_of_par ?? 0) < 50 ? "text-rose-300" : "text-amber-300"}`}>
                          {i.pct_of_par ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <button type="button" onClick={() => setShowAll((v) => !v)}
            className="mb-3 w-full rounded-xl border border-white/10 bg-white/4 px-4 py-2 text-xs text-zinc-400 hover:bg-white/8">
            {showAll ? "Hide" : `Show the other ${rest.length} counted items`}
          </button>

          {showAll && (
            <div className={`${GLASS_CARD} mb-3 p-4`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {rest.map((i) => (
                      <tr key={i.item_code} className="border-t border-white/5">
                        <td className="py-1.5 text-zinc-300">{i.item_name}
                          <span className="ml-1 text-[11px] text-zinc-600">{i.unit}</span></td>
                        <td className="py-1.5 text-right tabular-nums text-zinc-400 w-24">{n(i.on_hand ?? 0)}</td>
                        <td className="py-1.5 text-right tabular-nums text-zinc-600 w-20">
                          {i.par_level > 0 ? `/ ${n(i.par_level)}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {notCounted.length > 0 && (
            <p className="mb-3 text-xs text-zinc-600">
              {notCounted.length} items on the sheet were not counted in this report, so they have
              no number here — that is different from having none.
            </p>
          )}

          {data.unmatched_count > 0 && (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/6 px-4 py-3">
              <p className="text-xs font-medium text-amber-200">
                {data.unmatched_count} delivery line{data.unmatched_count !== 1 ? "s" : ""} could not be
                added to any counted item:
              </p>
              <ul className="mt-1 space-y-0.5">
                {data.unmatched_receipts.map((u, idx) => (
                  <li key={idx} className="text-xs text-amber-200/80">
                    {u.item_name} — {n(u.qty)} {u.unit || "(no unit)"}: {u.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
