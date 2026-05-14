"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson, procurementTokenHeaders } from "@/lib/procurementClient";
import MonthPicker from "@/components/MonthPicker";
import {
  GLASS_CARD,
  SECONDARY_BUTTON,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  T_PAGE_TITLE,
  T_SECTION,
  T_CAPTION,
  T_LABEL,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
} from "@/lib/ui-tokens";
import { RefreshCw, AlertCircle, BarChart3, ExternalLink } from "lucide-react";

type DashboardSummary = {
  month_key: string;
  request_count: number;
  staff_count: number;
  store_count: number;
  receiving_delay_rate: number;
  variance_rate: number;
  claim_rate: number;
  hold_release_lead_hours: number;
  payment_compliance_rate: number;
  score_total: number;
  grade: string;
};

type DashboardStaffRow = {
  owner_name: string;
  request_count: number;
  receiving_delay_rate: number;
  variance_rate: number;
  claim_rate: number;
  hold_release_lead_hours: number;
  payment_compliance_rate: number;
  score_total: number;
  grade: string;
};

type DashboardStoreRow = {
  store_code: string;
  request_count: number;
  receiving_delay_rate: number;
  variance_rate: number;
  claim_rate: number;
  hold_release_lead_hours: number;
  payment_compliance_rate: number;
  score_total: number;
  grade: string;
};

function monthNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function gradeBadge(grade: string) {
  const g = String(grade || "-").toUpperCase();
  if (g === "A" || g === "S") return <span className={BADGE_SUCCESS}>{g}</span>;
  if (g === "B") return <span className={BADGE_INFO}>{g}</span>;
  if (g === "C") return <span className={BADGE_WARNING}>{g}</span>;
  return <span className={BADGE_ERROR}>{g || "-"}</span>;
}

export default function ProcurementKpiPage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [monthKey, setMonthKey] = useState(monthNow());
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [staffRows, setStaffRows] = useState<DashboardStaffRow[]>([]);
  const [storeRows, setStoreRows] = useState<DashboardStoreRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const data = await procurementJson<{ summary: DashboardSummary; staff_rows: DashboardStaffRow[]; store_rows: DashboardStoreRow[] }>(
        `/api/admin/procurement/kpi/dashboard?month_key=${encodeURIComponent(monthKey)}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setSummary(data?.summary || null);
      setStaffRows(Array.isArray(data?.staff_rows) ? data.staff_rows : []);
      setStoreRows(Array.isArray(data?.store_rows) ? data.store_rows : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [monthKey, pin, requestedBy]);

  const recompute = async () => {
    setBusy(true);
    setError("");
    try {
      const headers = await procurementTokenHeaders(requestedBy, pin);
      const qs = new URLSearchParams({ month_key: monthKey, approver_name: requestedBy, pin });
      const res = await fetch(`/api/admin/procurement/kpi/recompute?${qs.toString()}`, {
        method: "POST",
        headers,
        cache: "no-store",
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Recompute failed (${res.status})`);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const can = canAccessProcurementAdmin(
        String((refreshed || auth)?.role || ""),
        String((refreshed || auth)?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila",
      );
      setAllowed(can);
      if (can) await load();
    }
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />
        KPI dashboard is only available to authorized admin roles.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>KPI Dashboard</h2>
          <p className="mt-1 text-sm text-zinc-400">Monthly procurement performance scores by staff and store.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-400">
          <BarChart3 className="h-3 w-3" />{monthKey}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* Session / filter bar */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Approver Name</label>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Name" className="w-full rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none transition focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20" />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className="w-full rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none transition focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20" />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Month</label>
            <MonthPicker value={monthKey} onChange={setMonthKey} />
          </div>
          <div className="flex items-end gap-2">
            <button type="button" onClick={() => void load()} disabled={loading} className={`${SECONDARY_BUTTON} flex-1 flex items-center justify-center gap-2`}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Refresh"}
            </button>
            <button type="button" onClick={() => void recompute()} disabled={busy} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-60">
              {busy ? "…" : "Recompute"}
            </button>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Overall Score</div>
          <div className={KPI_VALUE}>{Number(summary?.score_total || 0).toFixed(1)}</div>
          <div className="mt-1 flex items-center gap-2">
            <span className={T_CAPTION}>Grade</span>
            {gradeBadge(summary?.grade || "-")}
          </div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Receiving Delay</div>
          <div className={KPI_VALUE}>{Number(summary?.receiving_delay_rate || 0).toFixed(1)}%</div>
          <div className={`mt-1 ${T_CAPTION}`}>Requests: {summary?.request_count || 0}</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Variance Rate</div>
          <div className={KPI_VALUE}>{Number(summary?.variance_rate || 0).toFixed(1)}%</div>
          <div className={`mt-1 ${T_CAPTION}`}>Claim rate: {Number(summary?.claim_rate || 0).toFixed(1)}%</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Payment Compliance</div>
          <div className={KPI_VALUE}>{Number(summary?.payment_compliance_rate || 0).toFixed(1)}%</div>
          <div className={`mt-1 ${T_CAPTION}`}>Hold LT: {Number(summary?.hold_release_lead_hours || 0).toFixed(1)}h</div>
        </div>
      </div>

      {/* By Staff */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className={T_SECTION}>By Staff</p>
            <p className={`mt-0.5 ${T_CAPTION}`}>Use low-scoring rows to open improvement actions for the month.</p>
          </div>
          <Link
            href={`/admin/procurement?month_key=${encodeURIComponent(monthKey)}`}
            className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />Open Improvements
          </Link>
        </div>
        <div className="space-y-2">
          {staffRows.map((row) => (
            <div key={row.owner_name} className="rounded-xl border border-white/6 bg-white/3 p-3">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-medium text-white">{row.owner_name || "UNASSIGNED"}</div>
                <div className="flex items-center gap-2">
                  <span className={T_CAPTION}>Score {Number(row.score_total || 0).toFixed(1)}</span>
                  {gradeBadge(row.grade || "-")}
                </div>
              </div>
              <div className={`mt-1 ${T_CAPTION}`}>
                Delay {Number(row.receiving_delay_rate || 0).toFixed(1)}% | Variance {Number(row.variance_rate || 0).toFixed(1)}% | Claim {Number(row.claim_rate || 0).toFixed(1)}% | Payment {Number(row.payment_compliance_rate || 0).toFixed(1)}%
              </div>
            </div>
          ))}
          {!staffRows.length && <p className={T_CAPTION}>No staff KPI rows for this month.</p>}
        </div>
      </div>

      {/* By Store */}
      <div className={`${GLASS_CARD} p-4`}>
        <p className={`${T_SECTION} mb-3`}>By Store</p>
        <div className="space-y-2">
          {storeRows.map((row) => (
            <div key={row.store_code} className="rounded-xl border border-white/6 bg-white/3 p-3">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-medium text-white">{row.store_code || "UNASSIGNED"}</div>
                <div className="flex items-center gap-2">
                  <span className={T_CAPTION}>Score {Number(row.score_total || 0).toFixed(1)}</span>
                  {gradeBadge(row.grade || "-")}
                </div>
              </div>
              <div className={`mt-1 ${T_CAPTION}`}>
                Delay {Number(row.receiving_delay_rate || 0).toFixed(1)}% | Variance {Number(row.variance_rate || 0).toFixed(1)}% | Claim {Number(row.claim_rate || 0).toFixed(1)}% | Payment {Number(row.payment_compliance_rate || 0).toFixed(1)}%
              </div>
            </div>
          ))}
          {!storeRows.length && <p className={T_CAPTION}>No store KPI rows for this month.</p>}
        </div>
      </div>
    </div>
  );
}
