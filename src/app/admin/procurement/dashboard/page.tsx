"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import DatePicker from "@/components/DatePicker";
import MonthPicker from "@/components/MonthPicker";

type KpiSummary = {
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

type ExceptionRow = {
  id: string;
  request_id: string;
  request_no: string;
  rule_code: string;
  severity: string;
  score: number;
  status: string;
};

type RiskRow = {
  id: string;
  request_id: string;
  case_id: string;
  item_name: string;
  store_code: string;
  risk_level: string;
  risk_score: number;
  projected_days_to_stockout: number;
  recommended_action: string;
};

type CaseRow = {
  id: string;
  parent_case_no: string;
  request_no: string;
  status: string;
  severity: string;
  current_assignee_role: string;
  payment_status: string;
  payment_hold_reason: string;
};

function monthNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ProcurementDashboardPage() {
  const auth = getAuth();
  const initRef = useRef(false);
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [city, setCity] = useState((String(auth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila"));
  const [monthKey, setMonthKey] = useState(monthNow());
  const [snapshotDate, setSnapshotDate] = useState(todayIso());
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [risks, setRisks] = useState<RiskRow[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const cityLabel = city === "dubai" ? "Dubai" : "Manila";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [kpiRes, exRes, riskRes, caseRes] = await Promise.all([
        procurementJson<{ summary: KpiSummary }>(
          `/api/admin/procurement/kpi/dashboard?city=${encodeURIComponent(city)}&month_key=${encodeURIComponent(monthKey)}`,
          { method: "GET" },
          requestedBy,
          pin,
        ),
        procurementJson<{ rows: ExceptionRow[] }>(
          `/api/admin/procurement/exceptions?city=${encodeURIComponent(city)}&status=OPEN&limit=50`,
          { method: "GET" },
          requestedBy,
          pin,
        ),
        procurementJson<{ rows: RiskRow[] }>(
          `/api/admin/procurement/stockout/risks?city=${encodeURIComponent(city)}&snapshot_date=${encodeURIComponent(snapshotDate)}&risk_level=&limit=50`,
          { method: "GET" },
          requestedBy,
          pin,
        ),
        procurementJson<{ rows: CaseRow[] }>(
          `/api/admin/procurement/cases?city=${encodeURIComponent(city)}&status=&limit=80`,
          { method: "GET" },
          requestedBy,
          pin,
        ),
      ]);
      setSummary(kpiRes?.summary || null);
      setExceptions(Array.isArray(exRes?.rows) ? exRes.rows : []);
      setRisks(Array.isArray(riskRes?.rows) ? riskRes.rows : []);
      setCases(Array.isArray(caseRes?.rows) ? caseRes.rows : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [city, monthKey, pin, requestedBy, snapshotDate]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const can = canAccessProcurementAdmin(String((refreshed || auth)?.role || ""), city === "dubai" ? "dubai" : "manila");
      setAllowed(can);
      if (can) await load();
    }
    void init();
  }, [auth, city, load]);

  if (!allowed) {
    return <div className="text-sm text-red-300">Procurement page is available only to authorized admin roles.</div>;
  }

  const openExceptions = exceptions.filter((row) => String(row.status || "").toUpperCase() === "OPEN");
  const criticalRisks = risks.filter((row) => {
    const level = String(row.risk_level || "").toUpperCase();
    return level === "CRITICAL" || level === "HIGH";
  });
  const holdCases = cases.filter((row) => String(row.payment_status || "").toUpperCase() === "HOLD");

  return (
    <div className="space-y-4">
      {error ? <div className="text-sm text-red-300">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3 md:grid-cols-6">
        <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Approver name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <select
          value={city}
          onChange={(e) => setCity(String(e.target.value || "manila").toLowerCase() === "dubai" ? "dubai" : "manila")}
          className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
        >
          <option value="manila">Manila</option>
          <option value="dubai">Dubai</option>
        </select>
        <MonthPicker value={monthKey} onChange={setMonthKey} />
        <DatePicker value={snapshotDate} onChange={setSnapshotDate} />
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60">
          {loading ? "Loading..." : "Refresh Dashboard"}
        </button>
      </div>

      <div className="text-xs text-neutral-500">Showing procurement dashboard for {cityLabel}.</div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-xs text-neutral-400">KPI Score</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-100">{Number(summary?.score_total || 0).toFixed(1)}</div>
          <div className="mt-1 text-xs text-neutral-500">Grade {summary?.grade || "-"}</div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-xs text-neutral-400">Open Exceptions</div>
          <div className="mt-2 text-2xl font-semibold text-amber-200">{openExceptions.length}</div>
          <div className="mt-1 text-xs text-neutral-500">Needs review</div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-xs text-neutral-400">Critical / High Stockout</div>
          <div className="mt-2 text-2xl font-semibold text-rose-200">{criticalRisks.length}</div>
          <div className="mt-1 text-xs text-neutral-500">Snapshot {snapshotDate}</div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-xs text-neutral-400">Payment Hold Cases</div>
          <div className="mt-2 text-2xl font-semibold text-sky-200">{holdCases.length}</div>
          <div className="mt-1 text-xs text-neutral-500">Release follow-up</div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-xs text-neutral-400">Payment Compliance</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-100">{Number(summary?.payment_compliance_rate || 0).toFixed(1)}%</div>
          <div className="mt-1 text-xs text-neutral-500">Month {monthKey}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">Exception Alerts</div>
            <Link href="/admin/procurement/exceptions" className="text-xs text-amber-200 hover:underline">Open</Link>
          </div>
          <div className="mt-3 space-y-2">
            {openExceptions.slice(0, 8).map((row) => (
              <div key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                <div className="text-sm text-neutral-100">{row.rule_code}</div>
                <div className="mt-1 text-xs text-neutral-400">
                  {row.request_no || row.request_id} | {row.severity} | Score {Number(row.score || 0).toFixed(1)}
                </div>
              </div>
            ))}
            {!openExceptions.length ? <div className="text-sm text-neutral-500">No open exceptions.</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">Stockout Alerts</div>
            <Link href="/admin/procurement/whitelist" className="text-xs text-amber-200 hover:underline">Open</Link>
          </div>
          <div className="mt-3 space-y-2">
            {criticalRisks.slice(0, 8).map((row) => (
              <div key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                <div className="text-sm text-neutral-100">{row.item_name} ({row.store_code || "-"})</div>
                <div className="mt-1 text-xs text-neutral-400">
                  {row.risk_level} | Score {Number(row.risk_score || 0).toFixed(1)} | Days {Number(row.projected_days_to_stockout || 0).toFixed(2)}
                </div>
                {row.recommended_action ? <div className="mt-1 text-xs text-amber-200">{row.recommended_action}</div> : null}
              </div>
            ))}
            {!criticalRisks.length ? <div className="text-sm text-neutral-500">No critical/high stockout risk.</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">Payment Hold Cases</div>
            <Link href="/admin/procurement/payments" className="text-xs text-amber-200 hover:underline">Open</Link>
          </div>
          <div className="mt-3 space-y-2">
            {holdCases.slice(0, 8).map((row) => (
              <Link key={row.id} href={`/admin/procurement/cases/${row.id}`} className="block rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 hover:bg-neutral-900">
                <div className="text-sm text-neutral-100">{row.parent_case_no || row.request_no || row.id}</div>
                <div className="mt-1 text-xs text-neutral-400">
                  Severity {row.severity || "-"} | Role {row.current_assignee_role || "-"} | Payment {row.payment_status || "-"}
                </div>
                {row.payment_hold_reason ? <div className="mt-1 text-xs text-amber-200">{row.payment_hold_reason}</div> : null}
              </Link>
            ))}
            {!holdCases.length ? <div className="text-sm text-neutral-500">No payment hold cases.</div> : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4 text-xs text-neutral-500">
        Summary metrics are from `kpi/dashboard`, alerts are composed from open exceptions, stockout risks, and case payment-hold statuses.
      </div>
    </div>
  );
}
