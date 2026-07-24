"use client";

import {
  AlertCircle, ArrowRight, ClipboardList, Database,
  Loader2, RefreshCw, Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { GLASS_CARD, PRIMARY_BUTTON } from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

const API = "/api/admin/dubai-payroll";

function apiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const method = (opts?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["Content-Type"] = "application/json";
  if (auth?.accessToken) headers["Authorization"] = `Bearer ${auth.accessToken}`;
  return fetch(path, { ...opts, headers: { ...headers, ...(opts?.headers as Record<string, string> ?? {}) } });
}

type Period = {
  id: number;
  period_label: string;
  period_half: number;
  year: number;
  month: number;
  start_date: string;
  end_date: string;
  status: string;
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function DubaiPayrollPage() {
  const router = useRouter();

  useEffect(() => {
    const auth = getAuth();
    const role = auth?.role ?? "";
    if (!auth || (role !== "ADMIN" && role !== "HQ")) router.replace("/week");
  }, [router]);

  const [periods, setPeriods]               = useState<Period[]>([]);
  const [loading, setLoading]               = useState(true);
  const [err, setErr]                       = useState("");
  const [creating, setCreating]             = useState(false);

  // New period form
  const now = new Date();
  const [newYear, setNewYear]               = useState(String(now.getFullYear()));
  const [newMonth, setNewMonth]             = useState(String(now.getMonth() + 1));
  const [newHalf, setNewHalf]               = useState("1");
  const [showCreate, setShowCreate]         = useState(false);

  const loadPeriods = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await apiFetch(`${API}/periods`);
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json() as { periods: Period[] };
      setPeriods(d.periods ?? []);
    } catch (e) { setErr(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadPeriods(); }, [loadPeriods]);

  async function handleCreate() {
    setCreating(true); setErr("");
    try {
      const yr  = parseInt(newYear);
      const mo  = parseInt(newMonth);
      const ph  = parseInt(newHalf);
      const half1End = ph === 1 ? 15 : new Date(yr, mo, 0).getDate();
      const startDay = ph === 1 ? 1 : 16;
      const pad = (n: number) => String(n).padStart(2, "0");
      const start = `${yr}-${pad(mo)}-${pad(startDay)}`;
      const end   = `${yr}-${pad(mo)}-${pad(half1End)}`;
      const label = `${MONTHS[mo - 1]} ${yr} ${ph === 1 ? "1st" : "2nd"} Half`;
      const r = await apiFetch(`${API}/periods`, {
        method: "POST",
        body: JSON.stringify({ period_label: label, period_half: ph, year: yr, month: mo, start_date: start, end_date: end }),
      });
      if (!r.ok) throw new Error(await r.text());
      setShowCreate(false);
      await loadPeriods();
    } catch (e) { setErr(String(e)); }
    finally { setCreating(false); }
  }

  const statusColor = (s: string) =>
    s === "paid"     ? "bg-emerald-900/30 text-emerald-300" :
    s === "approved" ? "bg-blue-900/30 text-blue-300" :
    "bg-zinc-800 text-zinc-400";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link href="/admin/payroll" className="text-sm text-slate-400 hover:text-slate-200">
              ← Payroll
            </Link>
            <h1 className="mt-2 text-3xl font-light tracking-tight text-white flex items-center gap-3">
              <span className="text-2xl">🇦🇪</span>
              Dubai Payroll
            </h1>
            <p className="mt-1 text-sm text-slate-400">Manage Dubai staff attendance and payroll periods</p>
          </div>

          {/* Quick links */}
          <div className="flex flex-col gap-2">
            <Link href="/admin/payroll/dubai/dtr-upload"
              className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm"}>
              <ClipboardList size={15} />
              DTR Sync / Upload
            </Link>
            <button onClick={() => setShowCreate(v => !v)}
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10 transition-colors">
              <Database size={14} />
              New Period
            </button>
          </div>
        </div>

        {err && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-900/20 p-4 text-sm text-red-300">
            <AlertCircle size={15} /> {err}
          </div>
        )}

        {/* Create period form */}
        {showCreate && (
          <div className={GLASS_CARD + " p-5 space-y-4"}>
            <h3 className="text-sm font-semibold text-white">Create Payroll Period</h3>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Year</label>
                <input type="number" value={newYear} onChange={e => setNewYear(e.target.value)}
                  className="w-24 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Month</label>
                <SelectDark
                  value={newMonth}
                  onChange={setNewMonth}
                  className="w-28"
                  options={[
                    ...MONTHS.map((m, i) => ({ value: String(i + 1), label: m })),
                  ]}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Half</label>
                <SelectDark
                  value={newHalf}
                  onChange={setNewHalf}
                  className="w-28"
                  options={[
                    { value: "1", label: "1st (1–15)" },
                    { value: "2", label: "2nd (16–end)" },
                  ]}
                />
              </div>
              <button onClick={handleCreate} disabled={creating}
                className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm disabled:opacity-40"}>
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Link href="/admin/payroll/dubai/dtr-upload"
            className={GLASS_CARD + " p-4 hover:border-sky-500/40 transition-colors group"}>
            <ClipboardList size={20} className="text-sky-400 mb-2" />
            <div className="text-sm font-medium text-white">DTR Sync</div>
            <div className="text-xs text-slate-400">Sync from OS Attendance or upload CSV</div>
          </Link>
          <div className={GLASS_CARD + " p-4 opacity-50"}>
            <Users size={20} className="text-violet-400 mb-2" />
            <div className="text-sm font-medium text-white">Staff Profiles</div>
            <div className="text-xs text-slate-400">Coming soon</div>
          </div>
          <div className={GLASS_CARD + " p-4 opacity-50"}>
            <ArrowRight size={20} className="text-emerald-400 mb-2" />
            <div className="text-sm font-medium text-white">Payroll Compute</div>
            <div className="text-xs text-slate-400">Coming soon</div>
          </div>
        </div>

        {/* Periods list */}
        <div className={GLASS_CARD + " overflow-hidden"}>
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Database size={15} className="text-sky-400" />
              Payroll Periods
            </h2>
            <button onClick={loadPeriods} className="text-slate-400 hover:text-white transition-colors">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          ) : periods.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              No periods yet — create the first one above.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {periods.map(p => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3 hover:bg-white/3 transition-colors">
                  <div>
                    <span className="text-sm font-medium text-white">{p.period_label}</span>
                    <span className="ml-3 text-xs text-slate-400 font-mono">{p.start_date} – {p.end_date}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(p.status)}`}>
                      {p.status}
                    </span>
                    <Link href={`/admin/payroll/dubai/dtr-upload?period_id=${p.id}`}
                      className="text-xs text-sky-400 hover:text-sky-200 transition-colors">
                      DTR →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
