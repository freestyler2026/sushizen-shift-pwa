"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson, procurementTokenHeaders } from "@/lib/procurementClient";
import MonthPicker from "@/components/MonthPicker";

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

export default function ProcurementKpiPage() {
  const auth = getAuth();
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [monthKey, setMonthKey] = useState(monthNow());
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [staffRows, setStaffRows] = useState<DashboardStaffRow[]>([]);
  const [storeRows, setStoreRows] = useState<DashboardStoreRow[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
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
    }
  }, [monthKey, pin, requestedBy]);

  const recompute = async () => {
    setBusy("recompute");
    setError("");
    try {
      const headers = await procurementTokenHeaders(requestedBy, pin);
      const qs = new URLSearchParams({
        month_key: monthKey,
        approver_name: requestedBy,
        pin,
      });
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
      setBusy("");
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
  }, [auth, load]);

  if (!allowed) {
    return <div className="text-sm text-red-300">Procurement page is available only to authorized admin roles.</div>;
  }

  return (
    <div className="space-y-4">
      {error ? <div className="text-sm text-red-300">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3 md:grid-cols-4">
        <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Approver name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <MonthPicker value={monthKey} onChange={setMonthKey} />
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900">
            Refresh
          </button>
          <button type="button" onClick={() => void recompute()} disabled={busy === "recompute"} className="rounded-xl border border-amber-700/60 bg-amber-900/20 px-3 py-2 text-sm text-amber-200 hover:bg-amber-800/30 disabled:opacity-60">
            {busy === "recompute" ? "Recomputing..." : "Recompute"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-xs text-neutral-400">Overall Score</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-100">{Number(summary?.score_total || 0).toFixed(1)}</div>
          <div className="mt-1 text-xs text-neutral-500">Grade {summary?.grade || "-"}</div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-xs text-neutral-400">Receiving Delay</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-100">{Number(summary?.receiving_delay_rate || 0).toFixed(1)}%</div>
          <div className="mt-1 text-xs text-neutral-500">Requests {summary?.request_count || 0}</div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-xs text-neutral-400">Variance / Claim</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-100">{Number(summary?.variance_rate || 0).toFixed(1)}%</div>
          <div className="mt-1 text-xs text-neutral-500">Claim rate {Number(summary?.claim_rate || 0).toFixed(1)}%</div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-xs text-neutral-400">Payment Compliance</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-100">{Number(summary?.payment_compliance_rate || 0).toFixed(1)}%</div>
          <div className="mt-1 text-xs text-neutral-500">Hold release LT {Number(summary?.hold_release_lead_hours || 0).toFixed(1)}h</div>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">By Staff</div>
            <div className="mt-1 text-xs text-neutral-500">Use low-scoring rows to open improvement actions for the month.</div>
          </div>
          <Link href={`/admin/procurement?month_key=${encodeURIComponent(monthKey)}`} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900">
            Open Improvements
          </Link>
        </div>
        <div className="mt-3 space-y-2">
          {staffRows.map((row) => (
            <div key={row.owner_name} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-neutral-100">{row.owner_name || "UNASSIGNED"}</div>
                <div className="text-xs text-neutral-400">Score {Number(row.score_total || 0).toFixed(1)} / Grade {row.grade || "-"}</div>
              </div>
              <div className="mt-2 text-xs text-neutral-500">
                Delay {Number(row.receiving_delay_rate || 0).toFixed(1)}% | Variance {Number(row.variance_rate || 0).toFixed(1)}% | Claim {Number(row.claim_rate || 0).toFixed(1)}% | Payment {Number(row.payment_compliance_rate || 0).toFixed(1)}%
              </div>
            </div>
          ))}
          {!staffRows.length ? <div className="text-sm text-neutral-500">No staff KPI rows.</div> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="text-sm font-medium">By Store</div>
        <div className="mt-3 space-y-2">
          {storeRows.map((row) => (
            <div key={row.store_code} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-neutral-100">{row.store_code || "UNASSIGNED"}</div>
                <div className="text-xs text-neutral-400">Score {Number(row.score_total || 0).toFixed(1)} / Grade {row.grade || "-"}</div>
              </div>
              <div className="mt-2 text-xs text-neutral-500">
                Delay {Number(row.receiving_delay_rate || 0).toFixed(1)}% | Variance {Number(row.variance_rate || 0).toFixed(1)}% | Claim {Number(row.claim_rate || 0).toFixed(1)}% | Payment {Number(row.payment_compliance_rate || 0).toFixed(1)}%
              </div>
            </div>
          ))}
          {!storeRows.length ? <div className="text-sm text-neutral-500">No store KPI rows.</div> : null}
        </div>
      </div>
    </div>
  );
}
