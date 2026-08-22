"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  GLASS_CARD, T_PAGE_TITLE, T_SECTION, INPUT_CLASS,
  PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON, DANGER_BUTTON,
  TAB_ACTIVE, TAB_INACTIVE, TAB_CONTAINER,
  BADGE_SUCCESS, BADGE_INFO,
} from "@/lib/ui-tokens";
import { getAuth } from "@/lib/auth";

interface OverheadEntry {
  id: number;
  store_code: string;
  city: string;
  year_month: string;
  category: string;
  amount: number;
  currency: string;
  notes: string;
  updated_at: string | null;
}

interface BudgetEntry {
  id: number;
  store_code: string;
  city: string;
  year_month: string;
  category: string;
  budget_amount: number;
  currency: string;
  updated_at: string | null;
}

interface RevenueEntry {
  id: number;
  store_code: string;
  city: string;
  year_month: string;
  revenue_amount: number;
  currency: string;
  entered_by: string;
  notes: string;
  updated_at: string | null;
}

interface ArRevenueData {
  total: number;
  currency: string;
  record_count: number;
  by_platform: { platform: string; amount: number; records: number }[];
  by_store: { store_code: string; amount: number }[];
}

const DUBAI_STORES = ["", "AM", "AB", "JLT", "BB", "ARJ", "JJAD_AM", "JJAD_JLT", "RZ_ARJ", "RZ_BB", "CK"];
const MANILA_STORES = ["", "CUB", "BER", "MOA", "MKT", "QC", "CEB", "CK"];
const OVERHEAD_CATEGORIES = ["Rent", "Utilities", "Insurance", "Marketing", "Maintenance", "Delivery Fees", "Admin", "Other"];
const BUDGET_CATEGORIES = ["food", "labor", "overhead"];

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function prevMonths(n: number): string[] {
  const result: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    result.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return result;
}

export default function MgmtSettingsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"revenue" | "overhead" | "budget" | "dailypl">("revenue");
  const [city, setCity] = useState("dubai");
  const [storeCode, setStoreCode] = useState("");
  const [yearMonth, setYearMonth] = useState(thisMonth());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Revenue state
  const [revenue, setRevenue] = useState("");
  const [revNotes, setRevNotes] = useState("");
  const [revList, setRevList] = useState<RevenueEntry[]>([]);
  const [arRevenue, setArRevenue] = useState<ArRevenueData | null>(null);
  const [arLoading, setArLoading] = useState(false);
  const [syncingAr, setSyncingAr] = useState(false);

  // Overhead state
  const [ohCategory, setOhCategory] = useState("Rent");
  const [ohCustomCategory, setOhCustomCategory] = useState("");
  const [ohAmount, setOhAmount] = useState("");
  const [ohNotes, setOhNotes] = useState("");
  const [ohList, setOhList] = useState<OverheadEntry[]>([]);

  // Budget state
  const [budCategory, setBudCategory] = useState("food");
  const [budAmount, setBudAmount] = useState("");
  const [budList, setBudList] = useState<BudgetEntry[]>([]);

  const cur = city === "dubai" ? "AED" : "PHP";
  const monthOptions = prevMonths(12);
  const storeOptions = city === "dubai" ? DUBAI_STORES : MANILA_STORES;

  function authHeaders(): Record<string, string> {
    const auth = getAuth();
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (auth?.accessToken) h.Authorization = `Bearer ${auth.accessToken}`;
    return h;
  }

  const fetchLists = useCallback(async () => {
    const h = authHeaders();
    const qs = `city=${city}&store_code=${storeCode}&year_month=${yearMonth}`;
    const [revRes, ohRes, budRes] = await Promise.all([
      fetch(`/api/admin/mgmt/revenue-manual?${qs}`, { headers: h }),
      fetch(`/api/admin/mgmt/overhead?${qs}`, { headers: h }),
      fetch(`/api/admin/mgmt/budget?${qs}`, { headers: h }),
    ]);
    if (revRes.ok) setRevList(await revRes.json());
    if (ohRes.ok) setOhList(await ohRes.json());
    if (budRes.ok) setBudList(await budRes.json());
  }, [city, storeCode, yearMonth]);

  const fetchArRevenue = useCallback(async () => {
    setArLoading(true);
    try {
      const h = authHeaders();
      const qs = `city=${city}&year_month=${yearMonth}${storeCode ? `&store_code=${storeCode}` : ""}`;
      const res = await fetch(`/api/admin/mgmt/ar-revenue-preview?${qs}`, { headers: h });
      if (res.ok) setArRevenue(await res.json());
    } finally {
      setArLoading(false);
    }
  }, [city, storeCode, yearMonth]);

  useEffect(() => { fetchLists(); fetchArRevenue(); }, [fetchLists, fetchArRevenue]);

  async function syncArRevenue() {
    if (!arRevenue || arRevenue.total === 0) return;
    setSyncingAr(true);
    setMsg(null);
    try {
      const currentAuth = getAuth();
      const platforms = arRevenue.by_platform.map(p => p.platform).join(", ");
      const res = await fetch("/api/admin/mgmt/revenue-manual", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          store_code: storeCode, city, year_month: yearMonth,
          revenue_amount: arRevenue.total,
          currency: cur,
          entered_by: currentAuth?.staffName || "",
          notes: `Synced from AR Payouts (${platforms})`,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg({ text: `Revenue synced: ${cur} ${arRevenue.total.toLocaleString("en", { maximumFractionDigits: 0 })}`, ok: true });
      fetchLists();
    } catch (e: unknown) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setSyncingAr(false);
    }
  }

  async function saveRevenue() {
    setSaving(true);
    setMsg(null);
    try {
      const currentAuth = getAuth();
      const res = await fetch("/api/admin/mgmt/revenue-manual", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          store_code: storeCode, city, year_month: yearMonth,
          revenue_amount: parseFloat(revenue) || 0,
          currency: cur,
          entered_by: currentAuth?.staffName || "",
          notes: revNotes,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg({ text: "Revenue saved.", ok: true });
      setRevenue("");
      setRevNotes("");
      fetchLists();
    } catch (e: unknown) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function saveOverhead() {
    setSaving(true);
    setMsg(null);
    try {
      const cat = ohCategory === "Other" && ohCustomCategory ? ohCustomCategory : ohCategory;
      const res = await fetch("/api/admin/mgmt/overhead", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          store_code: storeCode, city, year_month: yearMonth,
          category: cat,
          amount: parseFloat(ohAmount) || 0,
          currency: cur,
          notes: ohNotes,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg({ text: "Overhead saved.", ok: true });
      setOhAmount("");
      setOhNotes("");
      fetchLists();
    } catch (e: unknown) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function deleteOverhead(id: number) {
    if (!confirm("Delete this overhead entry?")) return;
    const res = await fetch(`/api/admin/mgmt/overhead/${id}`, {
      method: "DELETE", headers: authHeaders(),
    });
    if (res.ok) fetchLists();
  }

  async function saveBudget() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/mgmt/budget", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          store_code: storeCode, city, year_month: yearMonth,
          category: budCategory,
          budget_amount: parseFloat(budAmount) || 0,
          currency: cur,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg({ text: "Budget saved.", ok: true });
      setBudAmount("");
      fetchLists();
    } catch (e: unknown) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-1">Management Accounting</p>
          <h1 className={T_PAGE_TITLE}>Settings</h1>
          <p className="text-sm text-zinc-500 mt-1">Manual revenue · Overhead (fixed costs) · Monthly budgets</p>
        </div>
        <button onClick={() => router.push("/admin/mgmt-accounting")} className={SMALL_BUTTON}>
          ← Dashboard
        </button>
      </div>

      {/* Filters */}
      <div className={`${GLASS_CARD} p-4 flex flex-wrap gap-3`}>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">City</label>
          <select value={city} onChange={e => { setCity(e.target.value); setStoreCode(""); }}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white">
            <option value="dubai">Dubai</option>
            <option value="manila">Manila</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Store</label>
          <select value={storeCode} onChange={e => setStoreCode(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white">
            {storeOptions.map(s => (
              <option key={s} value={s}>
                {s === "" ? "City-wide" : s === "CK" ? "CK — Shared/Central Kitchen" : s}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Month</label>
          <select value={yearMonth} onChange={e => setYearMonth(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white">
            {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {msg && (
        <div className={`${GLASS_CARD} p-3 ${msg.ok ? "border-emerald-500/30" : "border-rose-500/30"}`}>
          <p className={`text-sm ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}>{msg.text}</p>
        </div>
      )}

      {/* Tabs */}
      <div className={TAB_CONTAINER}>
        <button onClick={() => setTab("revenue")} className={tab === "revenue" ? TAB_ACTIVE : TAB_INACTIVE}>
          Revenue
        </button>
        <button onClick={() => setTab("overhead")} className={tab === "overhead" ? TAB_ACTIVE : TAB_INACTIVE}>
          Overhead
        </button>
        <button onClick={() => setTab("budget")} className={tab === "budget" ? TAB_ACTIVE : TAB_INACTIVE}>
          Budget
        </button>
        <button onClick={() => setTab("dailypl")} className={tab === "dailypl" ? TAB_ACTIVE : TAB_INACTIVE}>
          Daily P&amp;L
        </button>
      </div>

      {/* Revenue Tab */}
      {tab === "revenue" && (
        <div className="space-y-5">

          {/* AR Payouts Auto-Revenue Panel */}
          <div className={`${GLASS_CARD} p-5 border-emerald-500/20`}>
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h2 className={`${T_SECTION} mb-0.5`}>AR Payouts Revenue</h2>
                <p className="text-xs text-zinc-500">Auto-computed from Careem, Keeta, Talabat, GrabFood, Foodpanda</p>
              </div>
              {arRevenue && arRevenue.total > 0 && (
                <span className={BADGE_SUCCESS}>Live</span>
              )}
            </div>

            {arLoading ? (
              <p className="text-sm text-zinc-500">Loading AR data…</p>
            ) : arRevenue && arRevenue.total > 0 ? (
              <>
                <div className="mb-4">
                  <p className="text-3xl font-bold text-emerald-300 tabular-nums">
                    {cur} {arRevenue.total.toLocaleString("en", { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">{arRevenue.record_count} payout records · {yearMonth}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  {arRevenue.by_platform.map(p => (
                    <div key={p.platform} className="rounded-xl border border-white/8 bg-white/3 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-0.5">{p.platform}</p>
                      <p className="text-sm font-mono font-semibold text-zinc-200">
                        {cur} {p.amount.toLocaleString("en", { maximumFractionDigits: 0 })}
                      </p>
                      <p className="text-xs text-zinc-600">{p.records} records</p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={syncArRevenue}
                    disabled={syncingAr}
                    className={SECONDARY_BUTTON}
                  >
                    {syncingAr ? "Syncing…" : `Sync to Revenue (${cur} ${arRevenue.total.toLocaleString("en", { maximumFractionDigits: 0 })})`}
                  </button>
                  <p className="text-xs text-zinc-600">Overwrites manual entry for this store/month</p>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-sm text-zinc-500">No AR payout records found for {yearMonth}.</p>
                {arRevenue && (
                  <span className={BADGE_INFO}>0 records</span>
                )}
              </div>
            )}
          </div>

          <div className={`${GLASS_CARD} p-5`}>
            <h2 className={`${T_SECTION} mb-1`}>Manual Revenue Override</h2>
            <p className="text-xs text-zinc-500 mb-4">
              Use this to enter revenue manually or override the AR Payouts total.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Revenue Amount ({cur})</label>
                <input type="number" min="0" step="0.01" value={revenue}
                  onChange={e => setRevenue(e.target.value)}
                  placeholder="e.g. 250000"
                  className={INPUT_CLASS} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Notes (optional)</label>
                <input type="text" value={revNotes}
                  onChange={e => setRevNotes(e.target.value)}
                  placeholder="e.g. Talabat + Careem estimate"
                  className={INPUT_CLASS} />
              </div>
            </div>
            <button onClick={saveRevenue} className={`${PRIMARY_BUTTON} mt-4`} disabled={saving || !revenue}>
              {saving ? "Saving…" : "Save Revenue"}
            </button>
          </div>

          {revList.length > 0 && (
            <div className={`${GLASS_CARD} p-5`}>
              <h2 className={`${T_SECTION} mb-4`}>Saved Revenue Entries</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-white/8">
                    <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Store</th>
                    <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Month</th>
                    <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Amount</th>
                    <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Entered By</th>
                    <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {revList.map(r => (
                    <tr key={r.id} className="border-t border-white/5">
                      <td className="py-2.5 font-mono text-zinc-300">{r.store_code}</td>
                      <td className="py-2.5 text-zinc-400">{r.year_month}</td>
                      <td className="py-2.5 text-right font-mono text-emerald-300">
                        {r.currency} {r.revenue_amount.toLocaleString("en")}
                      </td>
                      <td className="py-2.5 text-zinc-400 text-xs">{r.entered_by || "—"}</td>
                      <td className="py-2.5 text-zinc-500 text-xs">{r.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Overhead Tab */}
      {tab === "overhead" && (
        <div className="space-y-5">
          <div className={`${GLASS_CARD} p-5`}>
            <h2 className={`${T_SECTION} mb-1`}>Add / Update Overhead</h2>
            <p className="text-xs text-zinc-500 mb-4">
              Fixed costs like rent, utilities. Same category in same month/store will be overwritten.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Category</label>
                <select value={ohCategory} onChange={e => setOhCategory(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/6 px-3 py-2.5 text-sm text-white">
                  {OVERHEAD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {ohCategory === "Other" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Custom Category Name</label>
                  <input type="text" value={ohCustomCategory}
                    onChange={e => setOhCustomCategory(e.target.value)}
                    placeholder="e.g. Staff transport"
                    className={INPUT_CLASS} />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Amount ({cur})</label>
                <input type="number" min="0" step="0.01" value={ohAmount}
                  onChange={e => setOhAmount(e.target.value)}
                  placeholder="e.g. 15000"
                  className={INPUT_CLASS} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Notes (optional)</label>
                <input type="text" value={ohNotes}
                  onChange={e => setOhNotes(e.target.value)}
                  placeholder="e.g. DEWA Q3 estimate"
                  className={INPUT_CLASS} />
              </div>
            </div>
            <button onClick={saveOverhead} className={`${PRIMARY_BUTTON} mt-4`} disabled={saving || !ohAmount}>
              {saving ? "Saving…" : "Save Overhead"}
            </button>
          </div>

          {ohList.length > 0 && (
            <div className={`${GLASS_CARD} p-5`}>
              <h2 className={`${T_SECTION} mb-4`}>Overhead Entries — {yearMonth}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-white/8">
                    <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Category</th>
                    <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Amount</th>
                    <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Notes</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {ohList.map(o => (
                    <tr key={o.id} className="border-t border-white/5">
                      <td className="py-2.5 text-zinc-200">{o.category}</td>
                      <td className="py-2.5 text-right font-mono text-zinc-300">
                        {o.currency} {o.amount.toLocaleString("en")}
                      </td>
                      <td className="py-2.5 text-zinc-500 text-xs">{o.notes || "—"}</td>
                      <td className="py-2.5 text-right">
                        <button onClick={() => deleteOverhead(o.id)}
                          className="text-xs text-rose-400 hover:text-rose-300 transition-colors">
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-white/10">
                    <td className="py-2.5 font-semibold text-zinc-200">Total</td>
                    <td className="py-2.5 text-right font-mono font-bold text-white">
                      {cur} {ohList.reduce((s, o) => s + o.amount, 0).toLocaleString("en")}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Budget Tab */}
      {tab === "budget" && (
        <div className="space-y-5">
          <div className={`${GLASS_CARD} p-5`}>
            <h2 className={`${T_SECTION} mb-1`}>Set Monthly Budget</h2>
            <p className="text-xs text-zinc-500 mb-4">
              Budget targets for food, labor, and overhead. Used for budget vs actual comparison on the dashboard.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Category</label>
                <select value={budCategory} onChange={e => setBudCategory(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/6 px-3 py-2.5 text-sm text-white">
                  {BUDGET_CATEGORIES.map(c => (
                    <option key={c} value={c}>{c === "food" ? "Food Cost" : c === "labor" ? "Labor Cost" : "Overhead"}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Budget Amount ({cur})</label>
                <input type="number" min="0" step="0.01" value={budAmount}
                  onChange={e => setBudAmount(e.target.value)}
                  placeholder="e.g. 80000"
                  className={INPUT_CLASS} />
              </div>
            </div>
            <button onClick={saveBudget} className={`${PRIMARY_BUTTON} mt-4`} disabled={saving || !budAmount}>
              {saving ? "Saving…" : "Save Budget"}
            </button>
          </div>

          {budList.length > 0 && (
            <div className={`${GLASS_CARD} p-5`}>
              <h2 className={`${T_SECTION} mb-4`}>Budget — {yearMonth}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-white/8">
                    <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Category</th>
                    <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Budget</th>
                  </tr>
                </thead>
                <tbody>
                  {budList.map(b => (
                    <tr key={b.id} className="border-t border-white/5">
                      <td className="py-2.5 text-zinc-200 capitalize">
                        {b.category === "food" ? "Food Cost" : b.category === "labor" ? "Labor Cost" : "Overhead"}
                      </td>
                      <td className="py-2.5 text-right font-mono text-violet-300">
                        {b.currency} {b.budget_amount.toLocaleString("en")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Daily P&L Tab */}
      {tab === "dailypl" && (
        <DailyPLSettingsTab city={city} router={router} setMsg={setMsg} />
      )}
    </div>
  );
}

// ─── Daily P&L Settings Tab ───────────────────────────────────────────────────

function DailyPLSettingsTab({
  city, router, setMsg,
}: {
  city: string;
  router: ReturnType<typeof useRouter>;
  setMsg: (m: { text: string; ok: boolean } | null) => void;
}) {
  const [computing, setComputing] = useState<string | null>(null);
  const [foodRates, setFoodRates] = useState<{ rate_pct: number; computed_at: string; source: string }[]>([]);
  const [dowWeights, setDowWeights] = useState<{ dow: number; weight: number }[]>([]);
  const [commRates, setCommRates] = useState<{ platform: string; store_code: string; brand: string; rate: number }[]>([]);
  const [laborDefaults, setLaborDefaults] = useState<{ default_daily_wage: number; currency: string; updated_at: string }[]>([]);
  const [laborWageInput, setLaborWageInput] = useState("");

  const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const jsonH = { "Content-Type": "application/json" };

  const loadData = useCallback(async () => {
    const [fr, cr, ld] = await Promise.all([
      fetch(`/api/admin/mgmt/food-cost-rates?city=${city}`).then(r => r.json()),
      fetch(`/api/admin/mgmt/commission-rates?city=${city}`).then(r => r.json()),
      fetch(`/api/admin/mgmt/labor-defaults?city=${city}`).then(r => r.json()),
    ]);
    setFoodRates(fr.rates ?? []);
    setCommRates(cr.rates ?? []);
    const lds = ld.defaults ?? [];
    setLaborDefaults(lds);
    const cityDefault = lds.find((d: { store_code: string }) => d.store_code === "");
    if (cityDefault) setLaborWageInput(String(cityDefault.default_daily_wage));
  }, [city]);

  useEffect(() => { loadData(); }, [loadData]);

  const saveLaborDefault = async () => {
    const wage = parseFloat(laborWageInput);
    if (isNaN(wage) || wage < 0) return;
    const res = await fetch("/api/admin/mgmt/labor-defaults", {
      method: "POST",
      headers: jsonH,
      body: JSON.stringify({ city, default_daily_wage: wage }),
    });
    const json = await res.json();
    if (json.ok) {
      setMsg({ ok: true, text: `Default daily wage saved: ${wage.toFixed(0)} ${city === "dubai" ? "AED" : "PHP"}/day` });
      await loadData();
    } else {
      setMsg({ ok: false, text: json.error ?? "Save failed" });
    }
  };

  const compute = async (what: "food-cost-rate" | "dow-weights") => {
    setComputing(what);
    try {
      const res = await fetch(`/api/admin/mgmt/daily-pl/compute-${what}`, {
        method: "POST",
        headers: jsonH,
        body: JSON.stringify({ city }),
      });
      const json = await res.json();
      if (json.ok) {
        setMsg({
          ok: true,
          text: what === "food-cost-rate"
            ? `Food cost rate: ${(json.rate * 100).toFixed(1)}% (${json.items_count} items)`
            : `DOW weights updated (${json.data_points} data points)`,
        });
        await loadData();
      } else {
        setMsg({ ok: false, text: json.reason ?? json.error ?? "Failed" });
      }
    } finally {
      setComputing(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Food Cost Rate */}
      <div className={`${GLASS_CARD} p-5`}>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-200 mb-0.5">Food Cost Rate</h2>
            <p className="text-xs text-slate-500">
              Computed from Cost Calculation master (menu_item_master).
              Used for COGS = Gross Revenue × food_cost_rate in the Daily P&amp;L.
            </p>
          </div>
          <button
            onClick={() => compute("food-cost-rate")}
            disabled={computing === "food-cost-rate"}
            className={PRIMARY_BUTTON}
          >
            {computing === "food-cost-rate" ? "Computing…" : "Compute"}
          </button>
        </div>

        {foodRates.length > 0 ? (
          <div className="mt-3 text-sm space-y-1">
            {foodRates.map((r, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-emerald-400 text-lg font-semibold">{r.rate_pct}%</span>
                <span className="text-slate-500 text-xs">source: {r.source}</span>
                <span className="text-slate-600 text-xs">{r.computed_at?.slice(0, 10)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 text-xs text-slate-600 italic">
            Not computed yet. Click Compute to calculate from Cost Calculation master.
          </div>
        )}
      </div>

      {/* DOW Weights */}
      <div className={`${GLASS_CARD} p-5`}>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-200 mb-0.5">Day-of-Week Traffic Weights</h2>
            <p className="text-xs text-slate-500">
              Computed from Talabat daily sales (last 90 days). Used to distribute
              multi-day settlements into per-day revenue estimates.
            </p>
          </div>
          <button
            onClick={() => compute("dow-weights")}
            disabled={computing === "dow-weights"}
            className={PRIMARY_BUTTON}
          >
            {computing === "dow-weights" ? "Computing…" : "Compute"}
          </button>
        </div>
        <p className="text-xs text-slate-600 italic">
          Weights are auto-initialized to 1.0 (uniform). After computing, Fri/Sat will be higher
          and Mon/Tue lower, reflecting actual traffic patterns.
        </p>
      </div>

      {/* Commission Rates */}
      <div className={`${GLASS_CARD} p-5`}>
        <h2 className="text-sm font-semibold text-slate-200 mb-1">Commission Rates</h2>
        <p className="text-xs text-slate-500 mb-3">
          Used to compute gross_sales from net settlement payouts.
          Pre-populated from July 2026 P&amp;L analysis.
        </p>
        {commRates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-slate-500">
                  <th className="text-left py-1.5 pr-3">Platform</th>
                  <th className="text-left py-1.5 pr-3">Store</th>
                  <th className="text-left py-1.5 pr-3">Brand</th>
                  <th className="text-right py-1.5">Rate</th>
                </tr>
              </thead>
              <tbody>
                {commRates.map((r, i) => (
                  <tr key={i} className="border-b border-[var(--border)]/50">
                    <td className="py-1.5 pr-3 capitalize">{r.platform}</td>
                    <td className="py-1.5 pr-3 text-slate-400">{r.store_code || "—"}</td>
                    <td className="py-1.5 pr-3 text-slate-400">{r.brand || "—"}</td>
                    <td className="py-1.5 text-right font-mono text-amber-400">
                      {(r.rate * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-slate-600 italic">No rates loaded. Auto-seeded on first use.</p>
        )}
      </div>

      {/* Labor Defaults */}
      <div className={`${GLASS_CARD} p-5`}>
        <h2 className="text-sm font-semibold text-slate-200 mb-1">Labor — Default Daily Wage</h2>
        <p className="text-xs text-slate-500 mb-3">
          Labor cost is computed from published shifts × staff monthly salary (from Payroll).
          Staff with no salary record use this fallback daily rate.
          Monthly salary is prorated as: monthly ÷ days_in_month.
        </p>

        <div className="flex items-center gap-2 mb-3">
          <input
            type="number"
            min="0"
            step="1"
            placeholder={city === "dubai" ? "e.g. 200" : "e.g. 600"}
            value={laborWageInput}
            onChange={e => setLaborWageInput(e.target.value)}
            className="w-32 bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1 text-sm"
          />
          <span className="text-xs text-slate-400">{city === "dubai" ? "AED" : "PHP"} / day</span>
          <button onClick={saveLaborDefault} className={PRIMARY_BUTTON}>Save</button>
        </div>

        {laborDefaults.length > 0 && (
          <div className="text-xs text-slate-500">
            {laborDefaults.map((d, i) => (
              <span key={i}>
                Current: <strong className="text-emerald-400">{d.default_daily_wage} {d.currency}/day</strong>
                {d.updated_at && <span className="text-slate-600 ml-2">(set {d.updated_at.slice(0,10)})</span>}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 text-xs text-slate-600">
          <strong className="text-slate-500">How labor is calculated:</strong>{" "}
          For each day, all staff with a published shift at that store are looked up in Payroll.
          If a staff member has a monthly salary → salary ÷ days_in_month.
          If no salary record → the default daily rate above.
          CK staff costs should be entered as overhead (store = CK) and are distributed equally to all stores.
        </div>
      </div>

      {/* Link to Daily P&L */}
      <div className={`${GLASS_CARD} p-4 flex items-center justify-between`}>
        <span className="text-sm text-slate-300">Ready to view the daily P&amp;L dashboard?</span>
        <button
          onClick={() => router.push("/admin/mgmt-accounting/daily-pl")}
          className={PRIMARY_BUTTON}
        >
          Open Daily P&amp;L →
        </button>
      </div>
    </div>
  );
}
