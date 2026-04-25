"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson, saveProcurementSession } from "@/lib/procurementClient";
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

type ApprovalQueueRow = {
  id: string;
  request_no: string;
  requested_by: string;
  total_amount: number;
  status: string;
};

function monthNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Action card ─────────────────────────────────────────────────────────────
function ActionCard({
  count,
  label,
  sublabel,
  href,
  urgent,
  colorScheme,
}: {
  count: number;
  label: string;
  sublabel: string;
  href: string;
  urgent?: boolean;
  colorScheme: "amber" | "sky" | "rose" | "orange" | "emerald";
}) {
  const schemes = {
    amber:   { border: "border-amber-700/50 hover:border-amber-600/70",   bg: "bg-amber-950/20",   value: "text-amber-200",  sub: "text-amber-400/70" },
    sky:     { border: "border-sky-700/50 hover:border-sky-600/70",       bg: "bg-sky-950/20",     value: "text-sky-200",    sub: "text-sky-400/70" },
    rose:    { border: "border-rose-700/50 hover:border-rose-600/70",     bg: "bg-rose-950/20",    value: "text-rose-200",   sub: "text-rose-400/70" },
    orange:  { border: "border-orange-700/50 hover:border-orange-600/70", bg: "bg-orange-950/20",  value: "text-orange-200", sub: "text-orange-400/70" },
    emerald: { border: "border-emerald-700/50",                           bg: "bg-emerald-950/15", value: "text-emerald-200",sub: "text-emerald-500/70" },
  };
  const s = count > 0 ? schemes[colorScheme] : { border: "border-neutral-800 hover:border-neutral-700", bg: "bg-neutral-900/20", value: "text-neutral-500", sub: "text-neutral-600" };

  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-2xl border p-4 transition-all duration-200 ${s.border} ${s.bg}`}
    >
      <div className={`text-3xl font-bold tabular-nums transition-transform duration-200 group-hover:scale-105 ${s.value}${urgent && count > 0 ? " animate-pulse" : ""}`}>
        {count}
      </div>
      <div className="mt-1 text-sm font-medium text-neutral-200">{label}</div>
      <div className={`mt-0.5 text-xs ${s.sub}`}>→ {sublabel}</div>
    </Link>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ProcurementDashboardPage() {
  const auth = getAuth();
  const initRef = useRef(false);
  const [allowed, setAllowed] = useState(false);
  // Read-only: session credentials come from ProcurementSessionBar in the layout
  const requestedBy = defaultProcurementName();
  const pin = defaultProcurementPin();
  const [city, setCity] = useState((String(auth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila"));
  const [monthKey, setMonthKey] = useState(monthNow());
  const [snapshotDate] = useState(todayIso());
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [risks, setRisks] = useState<RiskRow[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [approvalQueue, setApprovalQueue] = useState<ApprovalQueueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [kpiRes, exRes, riskRes, caseRes, queueRes] = await Promise.all([
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
        procurementJson<{ rows: ApprovalQueueRow[] }>(
          `/api/admin/procurement/approvals/queue?city=${encodeURIComponent(city)}&limit=50`,
          { method: "GET" },
          requestedBy,
          pin,
        ).catch(() => ({ rows: [] })),
      ]);
      setSummary(kpiRes?.summary || null);
      setExceptions(Array.isArray(exRes?.rows) ? exRes.rows : []);
      setRisks(Array.isArray(riskRes?.rows) ? riskRes.rows : []);
      setCases(Array.isArray(caseRes?.rows) ? caseRes.rows : []);
      setApprovalQueue(Array.isArray(queueRes?.rows) ? queueRes.rows : []);
      // Persist session after successful load
      if (requestedBy.trim() && pin.trim()) saveProcurementSession(requestedBy.trim(), pin.trim());
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

  const openExceptions = exceptions.filter((r) => String(r.status || "").toUpperCase() === "OPEN");
  const criticalRisks = risks.filter((r) => {
    const l = String(r.risk_level || "").toUpperCase();
    return l === "CRITICAL" || l === "HIGH";
  });
  const holdCases = cases.filter((r) => String(r.payment_status || "").toUpperCase() === "HOLD");

  return (
    <div className="space-y-5">
      {error ? <div className="text-sm text-red-300">{error}</div> : null}

      {/* ── Today's Actions ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-neutral-100">Today&apos;s Actions</div>
            <div className="text-xs text-neutral-500">Click a card to go directly to that section</div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ActionCard
            count={approvalQueue.length}
            label="Approvals Pending"
            sublabel="Needs My Approval"
            href="/admin/procurement/approval-inbox"
            urgent
            colorScheme="amber"
          />
          <ActionCard
            count={holdCases.length}
            label="Payments on Hold"
            sublabel="Payments"
            href="/admin/procurement/payments"
            colorScheme="sky"
          />
          <ActionCard
            count={openExceptions.length}
            label="Open Alerts"
            sublabel="Alerts"
            href="/admin/procurement/exceptions"
            colorScheme="rose"
          />
          <ActionCard
            count={criticalRisks.length}
            label="Critical Stock Risks"
            sublabel="Stock Risk"
            href="/admin/procurement/risk-lab"
            colorScheme="orange"
          />
        </div>
      </div>

      {/* ── KPI snapshot ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-neutral-100">KPI Snapshot</div>
          <div className="flex items-center gap-2">
            <MonthPicker value={monthKey} onChange={setMonthKey} />
            <select
              value={city}
              onChange={(e) => setCity(String(e.target.value || "manila").toLowerCase() === "dubai" ? "dubai" : "manila")}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm"
            >
              <option value="manila">Manila</option>
              <option value="dubai">Dubai</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "KPI Score", value: Number(summary?.score_total || 0).toFixed(1), sub: `Grade ${summary?.grade || "–"}` },
            { label: "Payment Compliance", value: `${Number(summary?.payment_compliance_rate || 0).toFixed(1)}%`, sub: "This month" },
            { label: "On-time Rate", value: `${Number(summary?.receiving_delay_rate || 0).toFixed(1)}%`, sub: "Receiving" },
            { label: "Requests", value: String(Number(summary?.request_count || 0)), sub: "This month" },
            { label: "Stores Active", value: String(Number(summary?.store_count || 0)), sub: "Branches" },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
              <div className="text-xs text-neutral-500">{card.label}</div>
              <div className="mt-1 text-xl font-semibold text-neutral-100">{card.value}</div>
              <div className="mt-0.5 text-xs text-neutral-600">{card.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Detail panels ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-medium text-neutral-100">Exception Alerts</div>
            <Link href="/admin/procurement/exceptions" className="text-xs text-amber-300 hover:underline">View All →</Link>
          </div>
          <div className="space-y-2">
            {openExceptions.slice(0, 6).map((row) => (
              <div key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                <div className="text-sm text-neutral-100">{row.rule_code}</div>
                <div className="mt-0.5 text-xs text-neutral-400">{row.request_no || row.request_id} · {row.severity} · Score {Number(row.score || 0).toFixed(1)}</div>
              </div>
            ))}
            {!openExceptions.length ? <div className="text-sm text-neutral-500">No open exceptions.</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-medium text-neutral-100">Stock Risks</div>
            <Link href="/admin/procurement/risk-lab" className="text-xs text-amber-300 hover:underline">View All →</Link>
          </div>
          <div className="space-y-2">
            {criticalRisks.slice(0, 6).map((row) => (
              <div key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                <div className="text-sm text-neutral-100">{row.item_name} <span className="text-neutral-500">({row.store_code || "–"})</span></div>
                <div className="mt-0.5 text-xs text-neutral-400">{row.risk_level} · {Number(row.projected_days_to_stockout || 0).toFixed(1)} days left</div>
                {row.recommended_action ? <div className="mt-1 text-xs text-amber-300">{row.recommended_action}</div> : null}
              </div>
            ))}
            {!criticalRisks.length ? <div className="text-sm text-neutral-500">No critical / high stock risks.</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-medium text-neutral-100">Payment Hold Cases</div>
            <Link href="/admin/procurement/payments" className="text-xs text-amber-300 hover:underline">View All →</Link>
          </div>
          <div className="space-y-2">
            {holdCases.slice(0, 6).map((row) => (
              <Link key={row.id} href={`/admin/procurement/cases/${row.id}`} className="block rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 hover:bg-neutral-900">
                <div className="text-sm text-neutral-100">{row.parent_case_no || row.request_no || row.id}</div>
                <div className="mt-0.5 text-xs text-neutral-400">Severity {row.severity || "–"} · Role {row.current_assignee_role || "–"}</div>
                {row.payment_hold_reason ? <div className="mt-1 text-xs text-amber-300">{row.payment_hold_reason}</div> : null}
              </Link>
            ))}
            {!holdCases.length ? <div className="text-sm text-neutral-500">No payment hold cases.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
