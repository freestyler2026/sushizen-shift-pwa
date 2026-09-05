"use client";

import { useState, useEffect, useCallback } from "react";
import { GLASS_CARD } from "@/lib/ui-tokens";
import { getAuthHeaders } from "@/lib/auth";

/**
 * Prep Time from the aggregator order ledger.
 *
 * Replaces the photographed-receipt view, which saw 34% of Manila's orders and
 * scored Dubai up to 12 points below what the kitchens actually did. The old
 * screen is still reachable in its own tab -- its numbers are a different
 * measurement and must not share an axis with these.
 */

interface StoreRow {
  city: string; platform: string; store_code: string;
  orders: number; measured: number;
  median_prep: number | null; p90_prep: number | null;
}
interface HourRow { hour: number; orders: number; measured: number; median_prep: number | null }
interface HourStoreRow extends HourRow { store_code: string }
interface StatusRow { platform: string; status: string; orders: number; measured: number }
interface FreshRow { city: string; platform: string; store_code: string; last_date: string; last_import: string }
interface Ledger {
  orders: number; measured: number; measured_pct: number | null;
  never_cooked: number; zero_minute: number;
  median_prep_min: number | null; p90_prep_min: number | null; max_prep_min: number;
  grab_flagged: number;
  by_store: StoreRow[]; by_hour: HourRow[]; by_hour_store: HourStoreRow[];
  by_status: StatusRow[]; freshness: FreshRow[];
  platforms: string[]; date_from: string; date_to: string;
}

/** The scoring the OS has always used. Same formula, honest input. */
function score(min: number): number {
  if (min <= 10) return 100;
  if (min <= 20) return 120 - 2 * min;
  if (min <= 99) return 100 - min;
  return 0;
}
function grade(s: number): string {
  if (s >= 90) return "S";
  if (s >= 80) return "A";
  if (s >= 70) return "B";
  if (s >= 60) return "C";
  if (s >= 50) return "D";
  return "F";
}
const GRADE_TONE: Record<string, string> = {
  S: "text-emerald-300", A: "text-emerald-400", B: "text-sky-300",
  C: "text-amber-300", D: "text-orange-300", F: "text-red-400",
};

// An hour built on a handful of orders swings wildly; 08:00 once read 100% late
// off a single order. Below this the bucket is counted but not drawn.
const MIN_HOUR_SAMPLE = 20;

const PLATFORM_NOTE: Record<string, string> = {
  manila: "Grab only — FoodPanda and Beep are not imported.",
  dubai: "Keeta only — Careem, Talabat and Noon are not imported.",
};

function fmt(n: number | null | undefined, unit = ""): string {
  if (n === null || n === undefined) return "—";
  return `${Math.round(n * 10) / 10}${unit}`;
}

export default function PrepTimeLedger({ approverName, pin }: { approverName: string; pin: string }) {
  const [city, setCity] = useState<"manila" | "dubai">("manila");
  const [days, setDays] = useState(30);
  // "" means every store. The hourly medians come per store from SQL, so
  // switching here is a filter over data already fetched, not another request.
  const [store, setStore] = useState("");
  const [data, setData] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const to = new Date();
      const from = new Date(Date.now() - days * 86400000);
      const p = new URLSearchParams({
        city,
        date_from: from.toISOString().slice(0, 10),
        date_to: to.toISOString().slice(0, 10),
        approver_name: approverName, pin,
      });
      const res = await fetch(`/api/admin/prep-time/ledger?${p}`, { headers: getAuthHeaders() });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      setData(JSON.parse(text));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally { setLoading(false); }
  }, [city, days, approverName, pin]);

  useEffect(() => { void load(); }, [load]);

  const hourRows: HourRow[] = store
    ? (data?.by_hour_store || []).filter((h) => h.store_code === store)
    : (data?.by_hour || []);
  const hours = hourRows.filter((h) => (h.measured || 0) >= MIN_HOUR_SAMPLE);
  const hidden = hourRows.length - hours.length;
  const worstHour = hours.reduce<HourRow | null>(
    (a, h) => (!a || (h.median_prep || 0) > (a.median_prep || 0) ? h : a), null);

  // Anything that is neither measured, nor cancelled before cooking, nor a
  // mis-pressed zero. This is the only bucket that means something is wrong.
  const unfetched = data
    ? data.orders - data.measured - data.never_cooked - data.zero_minute : 0;

  const staleDays = (iso: string) =>
    Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["manila", "dubai"] as const).map((c) => (
          <button key={c} type="button" onClick={() => { setCity(c); setStore(""); }}
            className={`rounded-xl px-3 py-2 text-xs font-medium transition ${
              city === c ? "bg-violet-500/20 text-violet-200 border border-violet-400/40"
                         : "border border-white/10 text-zinc-400 hover:text-zinc-200"}`}>
            {c === "manila" ? "Manila" : "Dubai"}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-white/10" />
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)}
            className={`rounded-xl px-3 py-2 text-xs transition ${
              days === d ? "bg-white/10 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
            {d}d
          </button>
        ))}
        <button type="button" onClick={() => void load()} disabled={loading}
          className="ml-auto rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-300 disabled:opacity-50">
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {/* Which platforms these figures actually cover. A city name over a
          one-platform number reads as covering the city. */}
      <p className="text-xs text-amber-200/80">{PLATFORM_NOTE[city]}</p>

      {err && (
        <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-200">
          {err}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Orders", String(data.orders), ""],
              ["Measured", `${data.measured}`, data.measured_pct !== null ? `${data.measured_pct}%` : ""],
              ["Median", fmt(data.median_prep_min), "min"],
              ["p90", fmt(data.p90_prep_min), "min"],
            ].map(([label, value, sub]) => (
              <div key={label} className={`${GLASS_CARD} p-4`}>
                <p className="text-xs text-zinc-500">{label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
                  {value}<span className="ml-1 text-sm font-normal text-zinc-400">{sub}</span>
                </p>
              </div>
            ))}
          </div>

          {/* The gap, named. Cancellations and mis-pressed zeros are normal and
              are counted apart, so a rise in "not measured" is the one thing that
              means the import is failing rather than the day being quiet. */}
          <div className={`${GLASS_CARD} p-4`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Breakdown</p>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-300">
              <span>Measured <b className="tabular-nums text-white">{data.measured}</b></span>
              <span>Never cooked (cancelled / in progress) <b className="tabular-nums">{data.never_cooked}</b></span>
              <span>Zero minutes (mis-pressed) <b className="tabular-nums">{data.zero_minute}</b></span>
              <span className={unfetched > data.orders * 0.15 ? "text-amber-300" : ""}>
                Not measured <b className="tabular-nums">{unfetched}</b>
              </span>
            </div>
            {unfetched > 0 && (
              <p className="mt-2 text-xs text-zinc-500">
                Not measured means Ready was never pressed on that order, most often on
                collections. It is not an import failure. If this alone starts rising,
                suspect the import.
              </p>
            )}
          </div>

          {hours.length === 0 && store && (
            <div className={`${GLASS_CARD} p-4 text-sm text-zinc-400`}>
              {store} has no hour with at least {MIN_HOUR_SAMPLE} measured orders in
              this window. Widen the range or pick another store.
              <button type="button" onClick={() => setStore("")}
                className="ml-2 text-violet-300 underline">Show all stores</button>
            </div>
          )}

          {hours.length > 0 && (
            <div className={`${GLASS_CARD} p-4`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Median by hour (local time){store ? ` · ${store}` : ""}
                </p>
                {worstHour && (
                  <p className="text-xs text-amber-200">
                    Slowest {String(worstHour.hour).padStart(2, "0")}:00 · {fmt(worstHour.median_prep)} min
                  </p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {[{ code: "", label: "All stores" },
                  ...(data.by_store.map((b) => ({ code: b.store_code, label: b.store_code })))]
                  .map((o) => (
                  <button key={o.code || "all"} type="button" onClick={() => setStore(o.code)}
                    className={`rounded-lg px-2.5 py-1 text-xs transition ${
                      store === o.code ? "bg-violet-500/25 text-violet-100"
                                       : "text-zinc-500 hover:text-zinc-300"}`}>
                    {o.label}
                  </button>
                ))}
              </div>

              <div className="mt-3 flex items-end gap-1 overflow-x-auto">
                {hours.map((h) => {
                  const m = h.median_prep || 0;
                  const max = Math.max(...hours.map((x) => x.median_prep || 0), 1);
                  return (
                    <div key={h.hour} className="flex min-w-[34px] flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] tabular-nums text-zinc-400">{Math.round(m)}</span>
                      <div className="w-full rounded-t bg-violet-500/40"
                           style={{ height: `${Math.max(6, (m / max) * 90)}px` }} />
                      <span className="text-[10px] tabular-nums text-zinc-500">{h.hour}</span>
                    </div>
                  );
                })}
              </div>
              {hidden > 0 && (
                <p className="mt-2 text-xs text-zinc-500">
                  {hidden} hour(s) with fewer than {MIN_HOUR_SAMPLE} measured orders are
                  not drawn. A median over a handful of orders flips easily.
                </p>
              )}
            </div>
          )}

          <div className={`${GLASS_CARD} p-4`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">By store</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-zinc-500">
                    <th className="py-2 text-left">Store</th>
                    <th className="py-2 text-right">Orders</th>
                    <th className="py-2 text-right">Measured</th>
                    <th className="py-2 text-right">Median</th>
                    <th className="py-2 text-right">p90</th>
                    <th className="py-2 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_store.map((r) => {
                    const m = r.median_prep;
                    const s = m !== null ? score(Math.round(m)) : null;
                    return (
                      <tr key={`${r.platform}-${r.store_code}`} className="border-b border-white/5">
                        <td className="py-2 font-medium text-white">{r.store_code}</td>
                        <td className="py-2 text-right tabular-nums text-zinc-400">{r.orders}</td>
                        <td className="py-2 text-right tabular-nums text-zinc-400">{r.measured}</td>
                        <td className="py-2 text-right tabular-nums text-zinc-200">{fmt(m, " min")}</td>
                        <td className="py-2 text-right tabular-nums text-zinc-400">{fmt(r.p90_prep, " min")}</td>
                        <td className="py-2 text-right tabular-nums">
                          {s === null ? "—" : (
                            <span className={GRADE_TONE[grade(s)]}>{s} <b>{grade(s)}</b></span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* One store stalling is invisible in the totals: the others keep
              importing and the figure only dips. */}
          <div className={`${GLASS_CARD} p-4`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Import freshness</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {data.freshness.filter((f) => f.city === city).map((f) => {
                const d = staleDays(f.last_import);
                return (
                  <span key={`${f.platform}-${f.store_code}`}
                        className={d >= 2 ? "text-red-300" : "text-zinc-300"}>
                    {f.store_code} {String(f.last_date).slice(5)}
                    {d >= 2 && <b className="ml-1">{d}d ago</b>}
                  </span>
                );
              })}
            </div>
            {data.freshness.filter((f) => f.city === city && staleDays(f.last_import) >= 2).length > 0 && (
              <p className="mt-2 text-xs text-red-300">
                A store has stopped importing. Refresh its session:
                <code className="ml-1 rounded bg-black/30 px-1">
                  node scripts/{city === "dubai" ? "keeta" : "grab"}/setup-session.js
                </code>
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
