"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SALARY_HIDDEN } from "@/lib/salary";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  T_PAGE_TITLE,
  T_SECTION,
  T_LABEL,
  BADGE_SUCCESS,
  BADGE_WARNING,
} from "@/lib/ui-tokens";
import { RefreshCw, Banknote, CheckCircle, AlertCircle } from "lucide-react";

type SummaryRow = {
  staff_name: string;
  city: string;
  /** null when the viewer is not HQ — the API masks compensation. */
  pending_total: number | null;
  pending_days: number;
  paid_out_total: number;
  latest_earned_date: string | null;
};

const ADMIN_ROLES = new Set(["ADMIN", "HQ", "HR_MANAGER", "MANILA_MANAGEMENT", "MANILA_MANAGER"]);

function fmtPHP(n: number) {
  return `PHP ${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function authHeaders(token: string | undefined) {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export default function MealAllowancePage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [city, setCity] = useState("manila");

  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [payingOut, setPayingOut] = useState(false);

  // Auth check
  useEffect(() => {
    async function init() {
      const localAuth = auth ?? getAuth();
      const refreshed = await refreshAuthFromApi(localAuth);
      const resolved = refreshed || localAuth;
      const role = String(resolved?.role || "").toUpperCase();
      setAllowed(ADMIN_ROLES.has(role));
      setCity(String(resolved?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila");
      setAuthChecked(true);
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!auth?.hasSession && !auth?.accessToken) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/meal-allowance/summary?city=${encodeURIComponent(city)}`, {
        headers: authHeaders(auth.accessToken),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows(Array.isArray(data?.summary) ? data.summary : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [auth, city]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const totalPending = useMemo(
    () => (rows.length > 0 && rows.every(r => r.pending_total == null)
      ? null
      : rows.reduce((s, r) => s + Number(r.pending_total ?? 0), 0)),
    [rows],
  );

  const toggleSelect = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const selectAll = () => setSelected(new Set(rows.map((r) => r.staff_name)));
  const clearAll = () => setSelected(new Set());

  const handlePayout = async () => {
    if ((!auth?.hasSession && !auth?.accessToken) || selected.size === 0) return;
    // A masked total would read as a confident PHP 0.00 and the approver would be
    // paying blind, so say the amount is hidden rather than inventing a zero.
    const chosen = rows.filter(r => selected.has(r.staff_name));
    const totalLabel = chosen.every(r => r.pending_total == null)
      ? SALARY_HIDDEN
      : fmtPHP(chosen.reduce((s, r) => s + Number(r.pending_total ?? 0), 0));
    if (!window.confirm(`Pay out ${totalLabel} to ${selected.size} staff?`)) return;
    setPayingOut(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/admin/meal-allowance/payout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(auth.accessToken) },
        body: JSON.stringify({
          city,
          staff_names: [...selected],
          paid_out_by: auth.staffName || "",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSuccessMsg(`✓ Paid out to ${selected.size} staff member${selected.size !== 1 ? "s" : ""}. Balances reset to 0.`);
      setSelected(new Set());
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setPayingOut(false);
    }
  };

  if (!authChecked) return null;
  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Meal Allowance management is only available to HR / Admin roles.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>Meal Allowance</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Track and pay out daily attendance allowances (PHP 50/day perfect attendance).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border border-white/10">
            {(["manila", "dubai"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCity(c)}
                className={[
                  "px-3 py-1.5 text-xs font-semibold transition-colors capitalize",
                  city === c ? "bg-violet-600/70 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10",
                ].join(" ")}
              >
                {c}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className={`${SECONDARY_BUTTON} flex items-center gap-1.5`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className={`${GLASS_CARD} p-4`}>
          <p className={`${T_LABEL} mb-1`}>Total Pending</p>
          <p className="text-2xl font-bold text-yellow-300">{totalPending == null ? SALARY_HIDDEN : fmtPHP(totalPending)}</p>
        </div>
        <div className={`${GLASS_CARD} p-4`}>
          <p className={`${T_LABEL} mb-1`}>Staff with Balance</p>
          <p className="text-2xl font-bold text-white">{rows.length}</p>
        </div>
        <div className={`${GLASS_CARD} p-4`}>
          <p className={`${T_LABEL} mb-1`}>Selected for Payout</p>
          <p className="text-2xl font-bold text-emerald-300">{selected.size}</p>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle className="h-4 w-4 shrink-0" /> {successMsg}
        </div>
      )}

      {/* Payout controls */}
      {rows.length > 0 && (
        <div className={`${GLASS_CARD} p-4 flex flex-wrap items-center gap-3`}>
          <button type="button" onClick={selectAll} className="text-xs text-violet-400 hover:text-violet-300 transition">
            Select all ({rows.length})
          </button>
          <button type="button" onClick={clearAll} className="text-xs text-zinc-500 hover:text-zinc-300 transition">
            Clear
          </button>
          <div className="flex-1" />
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => void handlePayout()}
              disabled={payingOut}
              className={`${PRIMARY_BUTTON} flex items-center gap-2`}
            >
              <Banknote className="h-4 w-4" />
              {payingOut ? "Processing…" : `Pay Out ${selected.size} Staff`}
            </button>
          )}
        </div>
      )}

      {/* Staff table */}
      {loading && !rows.length ? (
        <div className={`${GLASS_CARD} p-10 flex items-center justify-center gap-3 text-zinc-500`}>
          <RefreshCw className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : !rows.length ? (
        <div className={`${GLASS_CARD} p-10 text-center text-sm text-zinc-500`}>
          No pending meal allowances. Staff earn PHP 50 per day of perfect attendance.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const isSelected = selected.has(row.staff_name);
            return (
              <div
                key={row.staff_name}
                onClick={() => toggleSelect(row.staff_name)}
                className={[
                  "flex items-center gap-4 rounded-2xl border p-4 cursor-pointer transition-all",
                  isSelected
                    ? "border-emerald-500/50 bg-emerald-900/15"
                    : "border-white/8 bg-white/4 hover:border-white/15",
                ].join(" ")}
              >
                {/* Checkbox */}
                <div className={[
                  "h-5 w-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors",
                  isSelected ? "border-emerald-400 bg-emerald-500" : "border-zinc-600 bg-transparent",
                ].join(" ")}>
                  {isSelected && <CheckCircle className="h-3.5 w-3.5 text-white" />}
                </div>

                {/* Staff info */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-white">{row.staff_name}</span>
                    <span className={BADGE_WARNING}>{row.pending_days} day{row.pending_days !== 1 ? "s" : ""}</span>
                    {row.latest_earned_date && (
                      <span className="text-[11px] text-zinc-500">Last: {String(row.latest_earned_date).slice(0, 10)}</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    Total paid out: {fmtPHP(Number(row.paid_out_total || 0))}
                  </div>
                </div>

                {/* Balance */}
                <div className="shrink-0 text-right">
                  <div className="text-lg font-bold text-yellow-300">
                    {row.pending_total == null ? SALARY_HIDDEN : fmtPHP(Number(row.pending_total))}
                  </div>
                  <div className="text-[11px] text-zinc-500">pending</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
