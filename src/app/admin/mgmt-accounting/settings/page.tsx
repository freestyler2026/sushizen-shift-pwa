"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  GLASS_CARD, T_PAGE_TITLE, T_SECTION, INPUT_CLASS,
  PRIMARY_BUTTON, SMALL_BUTTON, DANGER_BUTTON,
  TAB_ACTIVE, TAB_INACTIVE, TAB_CONTAINER,
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

const DUBAI_STORES = ["AM", "AB", "JLT", "BB", "ARJ", "JJAD_AM", "JJAD_JLT", "RZ_ARJ", "RZ_BB"];
const MANILA_STORES = ["CUB", "BER", "MOA", "MKT", "QC", "CEB"];
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
  const [tab, setTab] = useState<"revenue" | "overhead" | "budget">("revenue");
  const [city, setCity] = useState("dubai");
  const [storeCode, setStoreCode] = useState("AM");
  const [yearMonth, setYearMonth] = useState(thisMonth());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Revenue state
  const [revenue, setRevenue] = useState("");
  const [revNotes, setRevNotes] = useState("");
  const [revList, setRevList] = useState<RevenueEntry[]>([]);

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

  useEffect(() => { fetchLists(); }, [fetchLists]);

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
          <select value={city} onChange={e => { setCity(e.target.value); setStoreCode(e.target.value === "dubai" ? "AM" : "CUB"); }}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white">
            <option value="dubai">Dubai</option>
            <option value="manila">Manila</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Store</label>
          <select value={storeCode} onChange={e => setStoreCode(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white">
            {storeOptions.map(s => <option key={s} value={s}>{s}</option>)}
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
      </div>

      {/* Revenue Tab */}
      {tab === "revenue" && (
        <div className="space-y-5">
          <div className={`${GLASS_CARD} p-5`}>
            <h2 className={`${T_SECTION} mb-1`}>Enter Monthly Revenue</h2>
            <p className="text-xs text-zinc-500 mb-4">
              Manual entry until POS/delivery platform data is automated (Phase 2).
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
    </div>
  );
}
