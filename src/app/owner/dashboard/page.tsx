"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  clearOwnerSession, getOwnerSession, OwnerAuthError, ownerDownload, ownerFetch, type OwnerSession,
} from "@/lib/owner-auth";

type Tab = "sales" | "ck" | "payouts" | "quality";
const TABS: { key: Tab; label: string }[] = [
  { key: "sales", label: "Sales" },
  { key: "ck", label: "CK Billing" },
  { key: "payouts", label: "Payouts" },
  { key: "quality", label: "Store Performance" },
];

// The OS month runs 26th to 25th; "2026-10" is 26 Sep - 25 Oct.
function cycleBounds(cycle: string): [string, string] {
  const [y, m] = cycle.split("-").map(Number);
  const prev = m === 1 ? [y - 1, 12] : [y, m - 1];
  const pad = (n: number) => String(n).padStart(2, "0");
  return [`${prev[0]}-${pad(prev[1])}-26`, `${y}-${pad(m)}-25`];
}
function cycleOf(d: Date): string {
  const x = new Date(d.getTime() + 6 * 86400000);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
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
  const [tab, setTab] = useState<Tab>("sales");
  const today = useMemo(() => manilaToday(), []);
  const cycles = useMemo(() => {
    const out: string[] = [];
    const last = cycleOf(today);
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
            <select value={store} onChange={(e) => setStore(e.target.value)} aria-label="Store"
              className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
              {session.stores.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          )}
          <select value={cycle} onChange={(e) => setCycle(e.target.value)} aria-label="Month"
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
            {cycles.map((c) => <option key={c} value={c}>{cycleLabel(c)}</option>)}
          </select>
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
      <p className="text-xs text-slate-500">Sales are net of platform-funded and store-funded discounts, as each platform reports them. Gross is before discounts.</p>
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
        <Card label={`Margin ${data.margin_pct}%`} value={php(t.margin, 2)} />
        <Card label="Amount billed" value={php(t.amount, 2)} sub={`${data.period_from} – ${data.period_to}`} />
      </div>
      {data.pending_notes.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          {data.pending_notes.length} delivery note(s) not yet confirmed by the store are not billed yet
          ({php(data.pending_notes.reduce((s, n) => s + n.sent_cost, 0))} at sent quantities). They are added once the store confirms what it received.
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
              <th className="px-3 py-2 text-right">Margin</th><th className="px-3 py-2 text-right">Amount</th></tr>
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
      <p className="text-xs text-slate-500">Billed on the quantity your store confirmed it received, at the CK price on each delivery note, plus a {data.margin_pct}% margin.</p>
    </section>
  );
}

// ── Payouts ─────────────────────────────────────────────────────────────────
type Payouts = { payouts: { platform: string; payout_date: string; period_start: string; period_end: string; amount: number; orders: number | null; gross_sales: number | null; net_sales: number | null }[]; totals: Record<string, number> };

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
                <td className="px-3 py-2 text-slate-400">{p.period_start === p.period_end ? p.period_start : `${p.period_start} – ${p.period_end}`}</td>
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
