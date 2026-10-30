"use client";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import SelectDark from "@/components/SelectDark";
import {
  clearOwnerSession, getOwnerSession, OwnerAuthError, ownerDownload, ownerFetch, ownerImageUrl, type OwnerSession,
} from "@/lib/owner-auth";

type Tab = "daily" | "ledger" | "sales" | "ck" | "payouts" | "quality";
const TABS: { key: Tab; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "ledger", label: "Distributions" },
  { key: "sales", label: "Sales" },
  { key: "ck", label: "CK Billing" },
  { key: "payouts", label: "Payouts" },
  { key: "quality", label: "Store Performance" },
];

// The owner's month is the calendar month (like their books, BIR and the mall rent).
function cycleBounds(cycle: string): [string, string] {
  const [y, m] = cycle.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(y, m, 0).getDate();
  return [`${y}-${pad(m)}-01`, `${y}-${pad(m)}-${pad(last)}`];
}
function cycleOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function manilaToday(): Date {
  const now = new Date();
  return new Date(now.getTime() + (now.getTimezoneOffset() + 8 * 60) * 60000);
}
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function cycleLabel(cycle: string) {
  const [a, b] = cycleBounds(cycle);
  const fmt = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  const month = new Date(`${cycle}-01T00:00:00`).toLocaleDateString("en-PH", { month: "long", year: "numeric" });
  return `${month} (${fmt(a)} – ${fmt(b)})`;
}
const php = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const num = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : Number(n).toLocaleString("en-PH", { maximumFractionDigits: digits });

const FIRST_CYCLE = "2026-10";

export default function OwnerDashboard() {
  const router = useRouter();
  const [session, setSession] = useState<OwnerSession | null>(null);
  const [store, setStore] = useState("");
  const [tab, setTab] = useState<Tab>("daily");
  const today = useMemo(() => manilaToday(), []);
  const cycles = useMemo(() => {
    const out: string[] = [];
    // Up to yesterday's month: on the 1st the new month has no figures yet.
    const last = cycleOf(new Date(today.getTime() - 86400000));
    for (let c = FIRST_CYCLE; c <= last; ) {
      out.push(c);
      const [y, m] = c.split("-").map(Number);
      c = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    }
    return out.reverse();
  }, [today]);
  const [cycle, setCycle] = useState(cycles[0]);

  useEffect(() => {
    const s = getOwnerSession();
    if (!s) { router.replace("/owner"); return; }
    setSession(s);
    setStore(s.stores[0]?.code || "");
  }, [router]);

  const onAuthError = useCallback((e: unknown) => {
    if (e instanceof OwnerAuthError) router.replace("/owner");
  }, [router]);

  if (!session || !store) return null;
  const [from, to] = cycleBounds(cycle);
  const yesterday = iso(new Date(today.getTime() - 86400000));
  const rangeTo = to < yesterday ? to : yesterday;
  const storeName = session.stores.find((s) => s.code === store)?.name || store;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Sushi ZEN · Owner Portal</p>
          <h1 className="mt-1 text-2xl font-bold text-white">{storeName}</h1>
          <p className="text-sm text-slate-400">{session.displayName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {session.stores.length > 1 && (
            <SelectDark value={store} onChange={setStore} aria-label="Store" className="min-w-[9rem]"
              options={session.stores.map((s) => ({ value: s.code, label: s.name }))} />
          )}
          {tab !== "ledger" && tab !== "daily" && (
            <SelectDark value={cycle} onChange={setCycle} aria-label="Month" className="min-w-[14rem]"
              options={cycles.map((c) => ({ value: c, label: cycleLabel(c) }))} />
          )}
          <button onClick={() => { clearOwnerSession(); router.replace("/owner"); }}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5">Sign out</button>
        </div>
      </header>

      <nav className="mt-4 flex gap-1 overflow-x-auto" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ${tab === t.key ? "bg-emerald-500 text-slate-950" : "text-slate-300 hover:bg-white/5"}`}>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="mt-6">
        {tab === "daily" && <DailyTab store={store} yesterday={yesterday} onAuthError={onAuthError} />}
        {tab === "ledger" && <LedgerTab store={store} onAuthError={onAuthError} />}
        {tab === "sales" && <SalesTab store={store} from={from} to={rangeTo} onAuthError={onAuthError} />}
        {tab === "ck" && <CkTab store={store} cycle={cycle} onAuthError={onAuthError} />}
        {tab === "payouts" && <PayoutsTab store={store} from={from} to={rangeTo} onAuthError={onAuthError} />}
        {tab === "quality" && <QualityTab store={store} from={from} to={rangeTo} onAuthError={onAuthError} />}
      </main>
    </div>
  );
}

function useOwnerData<T>(path: string, onAuthError: (e: unknown) => void) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    ownerFetch<T>(path).then((d) => { if (live) setData(d); }).catch((e) => {
      if (!live) return;
      onAuthError(e);
      setError(e instanceof Error ? e.message : "Could not load.");
    });
    return () => { live = false; };
  }, [path, onAuthError]);
  return { data, error };
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
function Loading({ error }: { error: string }) {
  return error ? <p role="alert" className="text-sm text-red-300">{error}</p> : <p className="text-sm text-slate-400">Loading…</p>;
}

// ── Daily: how the store traded and ran yesterday ──────────────────────────
type ChannelSales = { orders: number; paid: number; net: number };
type SalesBlock = { channels: Record<"dine_in" | "grab" | "foodpanda", ChannelSales>; total: ChannelSales & { avg_ticket: number | null } };
type ScoreItem = {
  id: number; food_category: string; total_score: number; grade: string; feedback: string; at: string | null;
  score_shape: number; score_size_consistency: number; score_completion: number; score_topping: number;
  score_cut_uniformity: number; score_arrangement: number; score_portioning: number;
};
type Daily = {
  day: string; compare_day: string; sales: SalesBlock; sales_week_ago: SalesBlock | null; sales_change: number | null;
  mtd: SalesBlock & { from: string; to: string }; prev_mtd: (SalesBlock & { from: string; to: string }) | null;
  hourly: { hour: number; grab: number; foodpanda: number }[];
  hourly_coverage: Record<"grab" | "foodpanda", { ledger: number; pos: number; complete: boolean }>;
  quality: {
    grab_rating: number | null; grab_rating_week_ago: number | null; foodpanda_rating: number | null; foodpanda_rating_week_ago: number | null;
    foodpanda_prep_min: number | null; foodpanda_offline_min: number | null; foodpanda_rejection_pct: number | null;
    foodpanda_complaints: number | null; grab_offline_min: number | null; grab_prep_median_min: number | null;
  };
  team: { people: number; hours: number; still_clocked_in: number };
  checks: { type: string; status: string; submitted_at: string | null; confirmed: boolean }[];
  ck: { notes: number; lines: number };
  product: { count: number; avg: number | null; avg_last_7_days: number | null; by_grade: Record<string, number>; by_category: Record<string, number>; items: ScoreItem[] };
  flags: string[];
  freshness: { pos: string | null; grab_orders: string | null; foodpanda_orders: string | null };
};
const CHANNEL_LABEL: Record<string, string> = { dine_in: "Dine-in / Beep", grab: "GrabFood", foodpanda: "foodpanda" };
const CHECK_LABEL: Record<string, string> = { OPENING: "Opening", LUNCH_OPEN: "Lunch open", LUNCH_CLOSE: "Lunch close", BUSINESS_CLOSE: "Business close" };
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + n); return iso(x); };
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const signed = (n: number | null | undefined) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`);

function DailyTab({ store, yesterday, onAuthError }: { store: string; yesterday: string; onAuthError: (e: unknown) => void }) {
  const [day, setDay] = useState(yesterday);
  const first = FIRST_CYCLE + "-01";
  const { data, error } = useOwnerData<Daily>(`/api/owner/daily?store=${store}&day=${day}`, onAuthError);
  const [lowestFirst, setLowestFirst] = useState(false);
  const [shown, setShown] = useState(12);
  useEffect(() => { setShown(12); }, [day, store]);
  const nav = (
    <div className="flex items-center gap-2">
      <button disabled={day <= first} onClick={() => setDay(addDays(day, -1))} aria-label="Previous day"
        className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-30">‹</button>
      <p className="min-w-0 flex-1 text-center text-sm font-semibold text-white sm:flex-none">{dayLabel(day)}</p>
      <button disabled={day >= yesterday} onClick={() => setDay(addDays(day, 1))} aria-label="Next day"
        className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-30">›</button>
    </div>
  );
  if (!data) return <section className="space-y-4">{nav}<Loading error={error} /></section>;
  const s = data.sales.total;
  const q = data.quality;
  const items = [...data.product.items].sort((a, b) => (lowestFirst ? a.total_score - b.total_score : (a.at || "").localeCompare(b.at || "")));
  const hourlyShown = (["grab", "foodpanda"] as const).filter((p) => data.hourly_coverage[p].complete);
  return (
    <section className="space-y-6">
      {nav}
      {data.flags.length > 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="font-semibold">Worth a look</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{data.flags.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">Nothing out of the ordinary.</div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Sales" value={php(s.net)} sub={data.sales_change == null ? "without VAT" : `${signed(data.sales_change)} vs ${new Date(`${data.compare_day}T00:00:00`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })}`} />
        <Card label="Orders" value={num(s.orders)} sub={data.sales_week_ago ? `${num(data.sales_week_ago.total.orders)} a week before` : undefined} />
        <Card label="Average ticket" value={php(s.avg_ticket)} />
        <Card label="Month to date" value={php(data.mtd.total.net)} sub={data.prev_mtd ? `${signed(data.prev_mtd.total.net ? data.mtd.total.net / data.prev_mtd.total.net - 1 : null)} vs last month` : `${num(data.mtd.total.orders)} orders`} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-semibold text-white">By channel</p>
          <div className="mt-3 space-y-2">
            {(["grab", "foodpanda", "dine_in"] as const).map((ch) => {
              const c = data.sales.channels[ch];
              const share = s.net ? c.net / s.net : 0;
              return (
                <div key={ch} className="text-sm">
                  <div className="flex justify-between text-slate-300"><span>{CHANNEL_LABEL[ch]}</span><span className="tabular-nums text-white">{php(c.net)} · {num(c.orders)} orders</span></div>
                  <div className="mt-1 h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${(share * 100).toFixed(1)}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-semibold text-white">Delivery orders by hour</p>
          {hourlyShown.length ? (
            <div className="mt-2 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.hourly.map((h) => ({ hour: `${h.hour}:00`, GrabFood: hourlyShown.includes("grab") ? h.grab : 0, foodpanda: hourlyShown.includes("foodpanda") ? h.foodpanda : 0 }))}>
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 10 }} width={24} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
                  {hourlyShown.includes("grab") && <Bar dataKey="GrabFood" stackId="a" fill="#10b981" />}
                  {hourlyShown.includes("foodpanda") && <Bar dataKey="foodpanda" stackId="a" fill="#ec4899" />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="mt-2 text-sm text-slate-400">The order times for this day are still coming in.</p>}
          {(["grab", "foodpanda"] as const).filter((p) => !data.hourly_coverage[p].complete && data.hourly_coverage[p].pos > 0).map((p) => (
            <p key={p} className="mt-1 text-xs text-slate-500">{CHANNEL_LABEL[p]}: order times not complete yet ({data.hourly_coverage[p].ledger} of {data.hourly_coverage[p].pos}); shown once they are in.</p>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="GrabFood rating" value={q.grab_rating?.toFixed(2) ?? "—"} sub={q.grab_rating_week_ago != null ? `${q.grab_rating_week_ago.toFixed(2)} a week before` : undefined} />
        <Card label="foodpanda rating" value={q.foodpanda_rating?.toFixed(2) ?? "—"} sub={q.foodpanda_rating_week_ago != null ? `${q.foodpanda_rating_week_ago.toFixed(2)} a week before` : undefined} />
        <Card label="Preparation time" value={q.foodpanda_prep_min != null ? `${q.foodpanda_prep_min} min` : q.grab_prep_median_min != null ? `${q.grab_prep_median_min} min` : "—"} sub={q.foodpanda_prep_min != null ? "foodpanda average" : q.grab_prep_median_min != null ? "GrabFood median" : "not in yet"} />
        <Card label="Time offline" value={`${q.grab_offline_min ?? "—"} / ${q.foodpanda_offline_min ?? "—"} min`} sub="GrabFood / foodpanda" />
        <Card label="Team on duty" value={`${data.team.people} people`} sub={`${data.team.hours} hours${data.team.still_clocked_in ? ` · ${data.team.still_clocked_in} not clocked out` : ""}`} />
        <Card label="CK deliveries received" value={String(data.ck.notes)} sub={`${data.ck.lines} lines`} />
        <Card label="Customer contacts" value={q.foodpanda_complaints != null ? `${q.foodpanda_complaints}%` : "—"} sub="of foodpanda orders" />
        <Card label="Orders rejected" value={q.foodpanda_rejection_pct != null ? `${q.foodpanda_rejection_pct}%` : "—"} sub="foodpanda" />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm font-semibold text-white">Store checks</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {data.checks.map((c) => {
            const tone = c.status === "MISSING" ? "border-red-500/40 text-red-200" : c.status.includes("ISSUE") ? "border-amber-500/40 text-amber-200" : c.confirmed ? "border-emerald-500/40 text-emerald-200" : "border-sky-500/40 text-sky-200";
            const text = c.status === "MISSING" ? "not submitted" : c.status.includes("ISSUE") ? "issue found" : c.confirmed ? "done, confirmed" : "done, being reviewed";
            return <span key={c.type} className={`rounded-full border px-3 py-1 text-xs ${tone}`}>{CHECK_LABEL[c.type] || c.type}: {text}</span>;
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">The team checks the delivery tablets and the store at opening, lunch and closing; back office reviews each one.</p>
      </div>

      <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-white">Product scoring <span className="font-normal text-slate-400">— every dish photo the kitchen sends is scored</span></p>
          <p className="text-sm tabular-nums text-slate-300">{data.product.count} photos · average {data.product.avg ?? "—"}{data.product.avg_last_7_days != null && <span className="text-slate-500"> (previous 7 days {data.product.avg_last_7_days})</span>}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(data.product.by_grade).sort().map(([g, n]) => (
            <span key={g} className={`rounded-full border px-2.5 py-0.5 ${g === "A" ? "border-emerald-500/40 text-emerald-200" : g === "C" ? "border-amber-500/40 text-amber-200" : "border-white/15 text-slate-300"}`}>Grade {g}: {n}</span>
          ))}
          {Object.entries(data.product.by_category).map(([c, v]) => <span key={c} className="rounded-full border border-white/10 px-2.5 py-0.5 text-slate-400">{c}: {v}</span>)}
          {data.product.count > 0 && (
            <button onClick={() => setLowestFirst(!lowestFirst)} className="ml-auto rounded-lg border border-white/10 px-2.5 py-0.5 text-slate-300 hover:bg-white/5">{lowestFirst ? "Show in time order" : "Lowest scores first"}</button>
          )}
        </div>
        {data.product.count === 0 ? <p className="text-sm text-slate-400">No dish photos scored this day.</p> : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.slice(0, shown).map((it) => <ScorePhoto key={it.id} store={store} item={it} />)}
            </div>
            {shown < items.length && (
              <button onClick={() => setShown(shown + 12)} className="w-full rounded-lg border border-white/10 py-2 text-sm text-slate-300 hover:bg-white/5">Show more ({items.length - shown} more)</button>
            )}
          </>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Sales here are from the store&apos;s till (StoreHub), which records every channel by the next morning, without VAT. The monthly figures on the Distributions tab use each platform&apos;s own settlement and can differ by a few percent. Profit is not shown day by day: it is only right once the month is closed.
        {" "}Data in: till to {data.freshness.pos ?? "—"}, GrabFood orders to {data.freshness.grab_orders ?? "—"}, foodpanda orders to {data.freshness.foodpanda_orders ?? "—"}.
      </p>
    </section>
  );
}

function ScorePhoto({ store, item }: { store: string; item: ScoreItem }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true; let made: string | null = null;
    ownerImageUrl(`/api/owner/product-scores/${item.id}/photo?store=${store}`)
      .then((u) => { made = u; if (live) setUrl(u); else URL.revokeObjectURL(u); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [store, item.id]);
  const tone = item.grade === "A" ? "bg-emerald-500 text-slate-950" : item.grade === "C" ? "bg-amber-400 text-slate-950" : "bg-slate-200 text-slate-900";
  return (
    <button onClick={() => setOpen(!open)} className="overflow-hidden rounded-lg border border-white/10 bg-slate-900 text-left">
      <div className="relative aspect-square bg-slate-800">
        {url ? <img src={url} alt={`${item.food_category} dish, score ${item.total_score}`} className="h-full w-full object-cover" />
          : <div className="flex h-full items-center justify-center text-xs text-slate-500">{failed ? "Photo not available" : "Loading…"}</div>}
        <span className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-xs font-bold ${tone}`}>{item.grade} {item.total_score}</span>
      </div>
      <div className="p-2 text-xs text-slate-400">
        <p>{item.at ?? ""} · {item.food_category}</p>
        {open && (
          <div className="mt-1 space-y-1">
            <p className="text-slate-300">{item.feedback}</p>
            <p className="text-[11px]">Shape {item.score_shape} · Size {item.score_size_consistency} · Completion {item.score_completion} · Topping {item.score_topping} · Cut {item.score_cut_uniformity} · Arrangement {item.score_arrangement} · Portion {item.score_portioning}</p>
          </div>
        )}
      </div>
    </button>
  );
}

// ── Distributions (the ledger under the agreement) ──────────────────────────
type LedgerRow = {
  month: string; financial_year: number; month_index: number; net_sales: number; store_costs: number;
  profit_before_fees: number; ck_supply_fee: number; operating_fee: number; royalty: number; foco_fees: number;
  operating_profit: number; corp_tax: number; corp_tax_rate: number; corp_tax_basis: "provisional" | "filed";
  capex_reserve: number; after_tax_profit: number; ytd_after_tax_profit: number; preferred_cap_year: number;
  ytd_preferred: number; ytd_owner_excess: number; ytd_entitled: number; interim_distribution: number;
  paid: number | null; ytd_payable: number; ytd_paid: number; year_end_due: number | null; overpayment_carried_in: number;
  fl_ratio: number | null; status: string;
  revision: number; published_at: string | null;
};
type Ledger = {
  store_name: string;
  contract: {
    investment_jpy: number; fx_php_per_jpy: number; fx_date: string; investment_php: number; opening_date: string;
    term_end: string; months_left: number; preferred_cap_year: number; operating_fee_pct: number; royalty_pct: number;
    food_supply_fee_pct: number; capex_reserve_pct: number; excess_owner_pct: number;
  };
  rows: LedgerRow[];
  payments: { id: number; month: string; amount: number; paid_on: string; reference: string }[];
  kpi: { paid_to_date: number; recovery_rate: number | null; due_not_paid: number; last_month: string | null; buyout_reference: number | null };
  fl: { month: string; fl_ratio: number | null; over: boolean; streak: number }[];
};

const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-PH", { month: "short", year: "numeric" });
const pct = (n: number | null | undefined, d = 1) => (n == null ? "—" : `${(n * 100).toFixed(d)}%`);

function LedgerTab({ store, onAuthError }: { store: string; onAuthError: (e: unknown) => void }) {
  const { data, error } = useOwnerData<Ledger>(`/api/owner/ledger?store=${store}`, onAuthError);
  if (!data) return <Loading error={error} />;
  const c = data.contract;
  const k = data.kpi;
  const rows = data.rows;
  const last = rows[rows.length - 1];
  const yearRows = last ? rows.filter((r) => r.financial_year === last.financial_year) : [];
  const yearLast = yearRows[yearRows.length - 1];
  const prefUsed = yearLast && yearLast.preferred_cap_year > 0 ? Math.min(1, yearLast.ytd_preferred / yearLast.preferred_cap_year) : 0;
  const flLast = data.fl[data.fl.length - 1];
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm text-slate-300">
        <span>Investment <b className="text-white">{php(c.investment_php)}</b> <span className="text-slate-500">(¥{num(c.investment_jpy)} at the BSP rate of {c.fx_date}, ₱{c.fx_php_per_jpy} per yen)</span></span>
        <span>Opening date <b className="text-white">{c.opening_date}</b></span>
        <span>Term ends <b className="text-white">{c.term_end}</b> · {c.months_left} months left</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Distributions paid" value={php(k.paid_to_date, 2)} sub={`${data.payments.length} payment(s)`} />
        <Card label="Recovery rate" value={pct(k.recovery_rate)} sub="paid ÷ investment, in pesos" />
        <Card label="Due, not yet paid" value={php(k.due_not_paid, 2)} sub="interim distribution" />
        <Card label="Last month published" value={k.last_month ? monthName(k.last_month) : "—"} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-sm text-slate-300">
          No month has been published yet. HQ closes each month once its bills and payroll are in, and publishes it here — usually by the 20th of the following month.
        </div>
      ) : (
        <>
          {yearLast && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-white">Preferred distribution, {yearLast.financial_year}</p>
                <p className="text-sm tabular-nums text-slate-300">{php(yearLast.ytd_preferred, 2)} of {php(yearLast.preferred_cap_year, 2)}</p>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${(prefUsed * 100).toFixed(1)}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-400">Up to 30% a year of your investment, counted over the financial year (January to December; {yearLast.financial_year === 2026 ? "2026 runs October to December, so its share is three months" : "a full year"}). What is not reached in a year is not carried into the next. Profit beyond it is shared {100 - c.excess_owner_pct}% Company / {c.excess_owner_pct}% you.</p>
            </div>
          )}

          {/* On a phone each month is a card; the ten-column table is for wider screens. */}
          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <div key={r.month} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm tabular-nums">
                <div className="flex items-baseline justify-between">
                  <p className="font-semibold text-white">{monthName(r.month)}{r.revision > 1 && <span className="ml-1 text-[10px] text-amber-300">rev {r.revision}</span>}</p>
                  <p className="text-xs text-slate-400">tax {(r.corp_tax_rate * 100).toFixed(0)}% {r.corp_tax_basis === "filed" ? "as filed" : "provisional"}</p>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {([
                    ["Net sales", r.net_sales], ["Store costs", r.store_costs], ["Company fees", r.foco_fees],
                    ["Operating profit", r.operating_profit], ["Corporate tax", r.corp_tax], ["Renewal reserve", r.capex_reserve],
                    ["After-tax profit", r.after_tax_profit],
                  ] as [string, number][]).map(([k, v]) => (
                    <Fragment key={k}>
                      <dt className="text-slate-400">{k}</dt>
                      <dd className={`text-right ${v < 0 ? "text-red-300" : "text-white"}`}>{php(v)}</dd>
                    </Fragment>
                  ))}
                </dl>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                  <div><p className="text-xs text-slate-400">Payable, year to date</p><p className="font-semibold text-white">{php(r.ytd_payable, 2)}</p>
                    {r.year_end_due != null && r.year_end_due > 0 && <p className="text-[11px] text-emerald-300">year-end settlement {php(r.year_end_due, 2)}</p>}</div>
                  <div className="text-right"><p className="text-xs text-slate-400">Paid, year to date</p><p className="font-semibold text-white">{php(r.ytd_paid, 2)}</p>
                    {r.overpayment_carried_in > 0 && <p className="text-[11px] text-amber-300">incl. {php(r.overpayment_carried_in, 2)} overpaid last year</p>}</div>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">Fees: CK {php(r.ck_supply_fee)} · Operating {php(r.operating_fee)} · Royalty {php(r.royalty)}</p>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-white/10 md:block">
            <table className="w-full min-w-[980px] text-sm tabular-nums">
              <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-2">Month</th><th className="px-3 py-2 text-right">Net sales</th>
                  <th className="px-3 py-2 text-right">Store costs</th><th className="px-3 py-2 text-right">Company fees</th>
                  <th className="px-3 py-2 text-right">Operating profit</th><th className="px-3 py-2 text-right">Corporate tax</th>
                  <th className="px-3 py-2 text-right">Renewal reserve</th><th className="px-3 py-2 text-right">After-tax profit</th>
                  <th className="px-3 py-2 text-right">Payable, year to date</th><th className="px-3 py-2 text-right">Paid, year to date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.month} className="border-t border-white/5 align-top">
                    <td className="px-3 py-2 text-white">{monthName(r.month)}{r.revision > 1 && <span className="ml-1 text-[10px] text-amber-300">rev {r.revision}</span>}</td>
                    <td className="px-3 py-2 text-right">{php(r.net_sales)}</td>
                    <td className="px-3 py-2 text-right">{php(r.store_costs)}</td>
                    <td className="px-3 py-2 text-right" title={`Food Supply Fee ${php(r.ck_supply_fee)} · Operating Fee ${php(r.operating_fee)} · Royalty ${php(r.royalty)}`}>
                      {php(r.foco_fees)}
                      <div className="text-[11px] text-slate-500">CK {php(r.ck_supply_fee)} · Op {php(r.operating_fee)} · Roy {php(r.royalty)}</div>
                    </td>
                    <td className={`px-3 py-2 text-right ${r.operating_profit < 0 ? "text-red-300" : ""}`}>{php(r.operating_profit)}</td>
                    <td className="px-3 py-2 text-right">{php(r.corp_tax)}<div className="text-[11px] text-slate-500">{(r.corp_tax_rate * 100).toFixed(0)}% {r.corp_tax_basis === "filed" ? "as filed" : "provisional"}</div></td>
                    <td className="px-3 py-2 text-right">{php(r.capex_reserve)}</td>
                    <td className={`px-3 py-2 text-right ${r.after_tax_profit < 0 ? "text-red-300" : "text-white"}`}>{php(r.after_tax_profit)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-white">
                      {php(r.ytd_payable, 2)}
                      {r.year_end_due != null && r.year_end_due > 0 && <div className="text-[11px] font-normal text-emerald-300">year-end settlement {php(r.year_end_due, 2)}</div>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {php(r.ytd_paid, 2)}
                      {r.paid ? <div className="text-[11px] text-slate-500">this month {php(r.paid, 2)}</div> : null}
                      {r.overpayment_carried_in > 0 && <div className="text-[11px] text-amber-300">incl. {php(r.overpayment_carried_in, 2)} overpaid last year</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-sm font-semibold text-white">FL ratio <span className="font-normal text-slate-400">(food + Food Supply Fee + store payroll) ÷ net sales</span></p>
              <div className="mt-3 space-y-1.5">
                {data.fl.map((f) => (
                  <div key={f.month} className="flex items-center gap-3 text-sm">
                    <span className="w-20 text-slate-400">{monthName(f.month)}</span>
                    <div className="relative h-2 flex-1 rounded-full bg-white/10">
                      <div className={`h-full rounded-full ${f.over ? "bg-amber-400" : "bg-sky-400"}`} style={{ width: `${Math.min(100, (f.fl_ratio || 0) * 100)}%` }} />
                      <div className="absolute inset-y-[-3px] w-px bg-white/60" style={{ left: "55%" }} title="55%" />
                    </div>
                    <span className={`w-14 text-right tabular-nums ${f.over ? "text-amber-300" : "text-white"}`}>{pct(f.fl_ratio)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                The line is 55%. In a month above it the Company explains the cause and the plan in the next month&apos;s report; after three months in a row it gives you a written remediation plan (Article 9.4).
                {flLast?.streak >= 3 && <b className="text-amber-300"> Three months in a row above 55%: a written plan is due.</b>}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
              <p className="font-semibold text-white">Company fees (Schedule 1)</p>
              <ul className="mt-2 space-y-1">
                <li>Food Supply Fee: {c.food_supply_fee_pct}% of the Supply Cost — line by line on the CK Billing tab</li>
                <li>Operating Fee: {c.operating_fee_pct}% of net sales</li>
                <li>Franchise Royalty: {c.royalty_pct}% of net sales</li>
                <li>Equipment Renewal Reserve: {c.capex_reserve_pct}% of net sales, kept for the store&apos;s repairs</li>
              </ul>
              <p className="mt-2 text-xs text-slate-400">No other head-office charge is made to the store (Article 7.7). You may have the accounts and the Supply Cost checked by an independent accountant once a year at your own cost (Article 9.6).</p>
              {k.buyout_reference != null && (
                <p className="mt-2 text-xs text-slate-400">Buyout reference (Article 12.3): {php(k.buyout_reference, 2)} — the last twelve months&apos; distributions × 0.8. A right of the Company, not an obligation, and not part of the recovery rate.</p>
              )}
            </div>
          </div>
        </>
      )}

      <ul className="list-disc space-y-1 pl-5 text-xs text-slate-400">
        <li>Amounts are in pesos. The recovery rate is distributions paid ÷ your investment in pesos ({php(c.investment_php)}); yen figures are for reference only.</li>
        <li>Distributions are after Philippine corporate income tax and before any tax on you: withholding tax on the distribution and tax where you live are not included, so what you receive can be lower.</li>
        <li>Corporate tax is worked out each month at 25% on the year so far. When the company files its return for the year, the year is worked out again at the rate filed (20% if the company qualifies) and the difference is settled.</li>
        <li>Monthly distributions are interim, on unaudited accounts: what is payable on the year so far is at most 70% of the year&apos;s profit so far. When the year&apos;s accounts are final it is settled: the rest of the year&apos;s entitlement is paid, or an overpayment comes off the next distributions (Schedule 2, Articles 3 and 4).</li>
        <li>Projected yields and recovery are targets, not guarantees. Each month is shown once HQ has closed it; a corrected month shows its revision number.</li>
      </ul>
    </section>
  );
}

// ── Sales ───────────────────────────────────────────────────────────────────
type SalesDay = {
  day: string; grab_orders: number; grab_net: number; grab_gross: number; foodpanda_orders: number;
  foodpanda_net: number; foodpanda_gross: number; store_orders: number; store_net: number; store_gross: number;
  total_orders: number; total_net: number;
};
type Sales = { days: SalesDay[]; totals: Record<string, number | null> };

function SalesTab({ store, from, to, onAuthError }: { store: string; from: string; to: string; onAuthError: (e: unknown) => void }) {
  const { data, error } = useOwnerData<Sales>(`/api/owner/sales?store=${store}&date_from=${from}&date_to=${to}`, onAuthError);
  if (!data) return <Loading error={error} />;
  const t = data.totals;
  const chart = data.days.map((d) => ({ day: d.day.slice(5), GrabFood: d.grab_net, foodpanda: d.foodpanda_net, "Dine-in / Beep": d.store_net }));
  return (
    <section className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Sales" value={php(t.total_net as number)} sub={`${from} – ${to}`} />
        <Card label="Orders" value={num(t.total_orders as number)} />
        <Card label="Average ticket" value={php(t.avg_ticket as number)} />
        <Card label="Days" value={String(data.days.length)} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card label="GrabFood" value={php(t.grab_net as number)} sub={`${num(t.grab_orders as number)} orders · gross ${php(t.grab_gross as number)}`} />
        <Card label="foodpanda" value={php(t.foodpanda_net as number)} sub={`${num(t.foodpanda_orders as number)} orders · gross ${php(t.foodpanda_gross as number)}`} />
        <Card label="Dine-in / Beep" value={php(t.store_net as number)} sub={`${num(t.store_orders as number)} orders`} />
      </div>
      <div className="h-72 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis dataKey="day" tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} formatter={(v: number) => php(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="GrabFood" stackId="a" fill="#10b981" />
            <Bar dataKey="foodpanda" stackId="a" fill="#ec4899" />
            <Bar dataKey="Dine-in / Beep" stackId="a" fill="#38bdf8" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-slate-500">Net Sales as in your agreement: without VAT, after discounts the store funds; foodpanda orders refunded to the customer are left out. Senior citizen and PWD sales are VAT-exempt and are not divided by 1.12. &quot;Gross&quot; is what the orders came to before the store-funded discount, VAT included.</p>
    </section>
  );
}

// ── CK billing ──────────────────────────────────────────────────────────────
type CkItem = { item_name: string; unit: string; unit_cost: number; received_qty: number; cost: number; margin: number; amount: number };
type Ck = {
  cycle: string; period_from: string; period_to: string; billable: boolean; margin_pct: number;
  confirmed_notes: number; pending_notes: { note_id: number; delivery_date: string; order_no: string; status: string; sent_cost: number }[];
  unpriced_lines: number; totals: { cost: number; margin: number; amount: number }; by_item: CkItem[];
};

function CkTab({ store, cycle, onAuthError }: { store: string; cycle: string; onAuthError: (e: unknown) => void }) {
  const { data, error } = useOwnerData<Ck>(`/api/owner/ck-billing?store=${store}&cycle=${cycle}`, onAuthError);
  const [dlError, setDlError] = useState("");
  if (!data) return <Loading error={error} />;
  const t = data.totals;
  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card label="CK cost" value={php(t.cost, 2)} sub={`${data.confirmed_notes} confirmed deliveries`} />
        <Card label={`Food Supply Fee ${data.margin_pct}%`} value={php(t.margin, 2)} />
        <Card label="CK cost + Food Supply Fee" value={php(t.amount, 2)} sub={`${data.period_from} – ${data.period_to}`} />
      </div>
      {data.pending_notes.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          {data.pending_notes.length} delivery note(s) not yet confirmed by the store are not counted yet
          ({php(data.pending_notes.reduce((s, n) => s + n.sent_cost, 0))} at sent quantities). They are counted in the month the store confirms what it received.
        </div>
      )}
      {data.unpriced_lines > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          {data.unpriced_lines} line(s) have no CK price yet and are not in the amount. HQ is setting their price.
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">By item</h2>
        <button onClick={() => ownerDownload(`/api/owner/ck-billing/csv?store=${store}&cycle=${cycle}`, `ck-billing-${store.toLowerCase()}-${cycle}.csv`).catch((e) => setDlError(String(e.message || e)))}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/5">Download line detail (CSV)</button>
      </div>
      {dlError && <p className="text-xs text-red-300">{dlError}</p>}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-wider text-slate-400">
            <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2 text-right">Qty received</th>
              <th className="px-3 py-2 text-right">Unit cost</th><th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">Food Supply Fee</th><th className="px-3 py-2 text-right">Amount</th></tr>
          </thead>
          <tbody>
            {data.by_item.map((i) => (
              <tr key={`${i.item_name}|${i.unit}|${i.unit_cost}`} className="border-t border-white/5">
                <td className="px-3 py-2 text-white">{i.item_name}</td><td className="px-3 py-2 text-slate-400">{i.unit}</td>
                <td className="px-3 py-2 text-right">{num(i.received_qty, 2)}</td>
                <td className={`px-3 py-2 text-right ${i.unit_cost > 0 ? "" : "text-amber-300"}`}>{i.unit_cost > 0 ? php(i.unit_cost, 2) : "no price"}</td>
                <td className="px-3 py-2 text-right">{php(i.cost, 2)}</td><td className="px-3 py-2 text-right">{php(i.margin, 2)}</td>
                <td className="px-3 py-2 text-right font-semibold text-white">{php(i.amount, 2)}</td>
              </tr>
            ))}
            {data.by_item.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No confirmed CK deliveries in this month yet.</td></tr>}
          </tbody>
          {data.by_item.length > 0 && (
            <tfoot className="border-t border-white/10 bg-white/[0.04] font-semibold text-white">
              <tr><td className="px-3 py-2" colSpan={4}>Total</td><td className="px-3 py-2 text-right">{php(t.cost, 2)}</td>
                <td className="px-3 py-2 text-right">{php(t.margin, 2)}</td><td className="px-3 py-2 text-right">{php(t.amount, 2)}</td></tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-slate-500">Food cost from the Central Kitchen and the Food Supply Fee ({data.margin_pct}% of the Supply Cost, Schedule 1 of your agreement). Counted on the quantity your store confirmed it received, at the CK price on each delivery note, in the month your store confirmed receipt. Both are costs of the store in its monthly profit.</p>
    </section>
  );
}

// ── Payouts ─────────────────────────────────────────────────────────────────
type Payouts = { payouts: { platform: string; payout_date: string; period_start: string; period_end: string; amount: number; orders: number | null; gross_sales: number | null; net_sales: number | null; before_transfer: boolean }[]; totals: Record<string, number>; owned_from: string };

function PayoutsTab({ store, from, to, onAuthError }: { store: string; from: string; to: string; onAuthError: (e: unknown) => void }) {
  const { data, error } = useOwnerData<Payouts>(`/api/owner/payouts?store=${store}&date_from=${from}&date_to=${to}`, onAuthError);
  if (!data) return <Loading error={error} />;
  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card label="GrabFood paid out" value={php(data.totals.grab || 0, 2)} />
        <Card label="foodpanda paid out" value={php(data.totals.foodpanda || 0, 2)} />
        <Card label="Total" value={php((data.totals.grab || 0) + (data.totals.foodpanda || 0), 2)} sub={`${from} – ${to}`} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-wider text-slate-400">
            <tr><th className="px-3 py-2">Paid on</th><th className="px-3 py-2">Platform</th><th className="px-3 py-2">For sales of</th>
              <th className="px-3 py-2 text-right">Orders</th><th className="px-3 py-2 text-right">Amount paid</th></tr>
          </thead>
          <tbody>
            {data.payouts.map((p, i) => (
              <tr key={i} className="border-t border-white/5">
                <td className="px-3 py-2">{p.payout_date}</td>
                <td className="px-3 py-2">{p.platform === "grab" ? "GrabFood" : "foodpanda"}</td>
                <td className="px-3 py-2 text-slate-400">
                  {p.period_start === p.period_end ? p.period_start : `${p.period_start} – ${p.period_end}`}
                  {p.before_transfer && <span className="ml-2 text-xs text-amber-300">includes sales before {data.owned_from}; not in the totals</span>}
                </td>
                <td className="px-3 py-2 text-right">{num(p.orders)}</td>
                <td className="px-3 py-2 text-right font-semibold text-white">{php(p.amount, 2)}</td>
              </tr>
            ))}
            {data.payouts.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">No payouts in this month.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">What each platform transferred to the bank, after its commission and fees.</p>
    </section>
  );
}

// ── Store performance ───────────────────────────────────────────────────────
type Quality = {
  ratings: { day: string; aggregator: string; rating_score: number; review_count: number | null }[];
  foodpanda_ops: { day: string; prep_seconds: number | null; offline_seconds: number | null; rejection_pct: number | null }[];
  grab_offline: { day: string; offline_minutes: number; offline_rate_pct: number }[];
  grab_prep: { day: string; orders: number; median_prep_minutes: number }[];
};

function QualityTab({ store, from, to, onAuthError }: { store: string; from: string; to: string; onAuthError: (e: unknown) => void }) {
  const { data, error } = useOwnerData<Quality>(`/api/owner/quality?store=${store}&date_from=${from}&date_to=${to}`, onAuthError);
  if (!data) return <Loading error={error} />;
  const latest = (agg: string) => [...data.ratings].reverse().find((r) => r.aggregator === agg)?.rating_score ?? null;
  const fp = data.foodpanda_ops.filter((d) => d.prep_seconds != null);
  const fpPrep = fp.length ? fp.reduce((s, d) => s + (d.prep_seconds || 0), 0) / fp.length / 60 : null;
  const fpOffline = data.foodpanda_ops.reduce((s, d) => s + (d.offline_seconds || 0), 0) / 60;
  const grabOffline = data.grab_offline.reduce((s, d) => s + d.offline_minutes, 0);
  const prepByDay = new Map<string, { day: string; GrabFood?: number; foodpanda?: number }>();
  data.grab_prep.forEach((d) => prepByDay.set(d.day, { ...(prepByDay.get(d.day) || { day: d.day }), GrabFood: Math.round(d.median_prep_minutes * 10) / 10 }));
  fp.forEach((d) => prepByDay.set(d.day, { ...(prepByDay.get(d.day) || { day: d.day }), foodpanda: Math.round((d.prep_seconds || 0) / 6) / 10 }));
  const prepChart = [...prepByDay.values()].sort((a, b) => a.day.localeCompare(b.day)).map((d) => ({ ...d, day: d.day.slice(5) }));
  return (
    <section className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="GrabFood rating" value={latest("GrabFood")?.toFixed(2) ?? "—"} sub="latest" />
        <Card label="foodpanda rating" value={latest("FoodPanda")?.toFixed(2) ?? "—"} sub="latest" />
        <Card label="foodpanda prep time" value={fpPrep == null ? "—" : `${fpPrep.toFixed(1)} min`} sub="daily average" />
        <Card label="Time offline" value={`${Math.round(grabOffline + fpOffline)} min`} sub={`GrabFood ${Math.round(grabOffline)} · foodpanda ${Math.round(fpOffline)}`} />
      </div>
      <div className="h-72 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p className="mb-1 text-xs uppercase tracking-wider text-slate-400">Preparation time (minutes)</p>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={prepChart}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis dataKey="day" tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="GrabFood" stroke="#10b981" dot={false} connectNulls />
            <Line type="monotone" dataKey="foodpanda" stroke="#ec4899" dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-slate-500">GrabFood: median minutes from accepting an order to marking it ready. foodpanda: the platform&apos;s own daily average. Offline time is time the store was closed on the app during its scheduled hours.</p>
    </section>
  );
}
