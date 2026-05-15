"use client";

import {
  AlertCircle, Calculator, CalendarDays, CheckCircle2,
  ChevronRight, Clock, Loader2, Plus, RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAuth, canAccessPayrollAdmin } from "@/lib/auth";
import { GLASS_CARD, PRIMARY_BUTTON } from "@/lib/ui-tokens";

const API = "/api/admin/manila-payroll";

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
  first_half_period_id: number | null;
  status: "draft" | "approved" | "paid";
  approved_at: string | null;
  paid_at: string | null;
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const STATUS_BADGE: Record<string, string> = {
  draft:    "bg-slate-700 text-slate-300",
  approved: "bg-emerald-900/60 text-emerald-300 border border-emerald-500/30",
  paid:     "bg-violet-900/60 text-violet-300 border border-violet-500/30",
};

export default function ManilaPayrollPage() {
  const router   = useRouter();
  const [periods, setPeriods]   = useState<Period[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // Form state
  const [newYear, setNewYear]   = useState(new Date().getFullYear());
  const [newMonth, setNewMonth] = useState(new Date().getMonth() + 1);
  const [newHalf, setNewHalf]   = useState<1|2>(1);

  const loadRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadRef.current;
    setLoading(true);
    setError("");
    try {
      const r = await apiFetch(`${API}/periods`);
      if (seq !== loadRef.current) return;
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as Period[];
      setPeriods(data);
    } catch (e) {
      if (seq !== loadRef.current) return;
      setError(String(e));
    } finally {
      if (seq === loadRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Pure permission-based guard — Role Management is the source of truth.
  // HQ always has wildcard access; all other roles need the payroll permission.
  useEffect(() => {
    const auth = getAuth();
    const role = auth?.role ?? "";
    const ok = role === "HQ" || canAccessPayrollAdmin(auth);
    if (!auth || !ok) {
      router.replace("/week");
    }
  }, [router]);

  const createPeriod = async () => {
    setCreating(true);
    setError("");
    try {
      // Auto-link first_half if creating 2H
      let firstHalfId: number | null = null;
      if (newHalf === 2) {
        const existing = periods.find(
          p => p.year === newYear && p.month === newMonth && p.period_half === 1
        );
        firstHalfId = existing?.id ?? null;
      }
      const r = await apiFetch(`${API}/periods`, {
        method: "POST",
        body: JSON.stringify({
          year: newYear, month: newMonth, period_half: newHalf,
          first_half_period_id: firstHalfId,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      setShowCreate(false);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-light tracking-tight text-white">
              Manila Payroll
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Semi-monthly payroll — Monthly Pay Delta method
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Link
              href="/admin/payroll/manila/dtr-upload"
              className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-600/10 px-4 py-2 text-sm text-violet-300 hover:bg-violet-600/20"
            >
              DTR Upload
            </Link>
            <Link
              href="/admin/payroll/manila/gov-tables"
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
            >
              Gov. Tables
            </Link>
            <Link
              href="/admin/payroll/manila/staff-profiles"
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
            >
              Staff Profiles
            </Link>
            <button
              onClick={() => setShowCreate(v => !v)}
              className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm"}
            >
              <Plus size={16} /> New Period
            </button>
          </div>
        </div>

        {/* Create Period Form */}
        {showCreate && (
          <div className={GLASS_CARD + " p-5"}>
            <h2 className="mb-4 text-base font-semibold text-white">Create Payroll Period</h2>
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Year</label>
                <input
                  type="number"
                  value={newYear}
                  onChange={e => setNewYear(Number(e.target.value))}
                  className="w-24 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Month</label>
                <select
                  value={newMonth}
                  onChange={e => setNewMonth(Number(e.target.value))}
                  className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white"
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Half</label>
                <select
                  value={newHalf}
                  onChange={e => setNewHalf(Number(e.target.value) as 1|2)}
                  className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white"
                >
                  <option value={1}>1st Half (1–15)</option>
                  <option value={2}>2nd Half (16–EOM)</option>
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button
                  onClick={createPeriod}
                  disabled={creating}
                  className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm"}
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Create
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-900/20 p-4 text-sm text-red-300">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Period List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={28} className="animate-spin text-violet-400" />
          </div>
        ) : periods.length === 0 ? (
          <div className={GLASS_CARD + " p-10 text-center"}>
            <CalendarDays size={40} className="mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400">No payroll periods yet. Create the first one above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {periods.map(p => (
              <Link
                key={p.id}
                href={`/admin/payroll/manila/${p.id}`}
                className={GLASS_CARD + " flex items-center justify-between p-4 hover:bg-white/10 transition-colors cursor-pointer"}
              >
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-violet-900/40 p-2.5">
                    {p.status === "paid"     ? <CheckCircle2 size={20} className="text-violet-400" />
                     : p.status === "approved" ? <Calculator size={20} className="text-emerald-400" />
                     : <Clock size={20} className="text-slate-400" />}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{p.period_label}</p>
                    <p className="text-xs text-slate-400">
                      {p.start_date} → {p.end_date}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {p.period_half === 2 && (
                    <span className="text-xs text-slate-500">
                      Statutory deductions included
                    </span>
                  )}
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE[p.status] ?? STATUS_BADGE.draft}`}>
                    {p.status}
                  </span>
                  <ChevronRight size={16} className="text-slate-500" />
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Bottom nav */}
        <div className="flex justify-between text-xs text-slate-500">
          <Link href="/admin/payroll" className="hover:text-slate-300">← Dubai/Other Payroll</Link>
          <button onClick={load} className="flex items-center gap-1 hover:text-slate-300">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
