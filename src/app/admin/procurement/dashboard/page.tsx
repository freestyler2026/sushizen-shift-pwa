"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson, saveProcurementSession } from "@/lib/procurementClient";
import MonthPicker from "@/components/MonthPicker";
import {
  GLASS_CARD,
  SECONDARY_BUTTON,
  T_PAGE_TITLE,
  T_CARD_TITLE,
  T_CAPTION,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
} from "@/lib/ui-tokens";
import { RefreshCw, AlertCircle, TrendingUp, ShoppingCart } from "lucide-react";

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

function severityBadge(severity: string) {
  const s = String(severity || "").toUpperCase();
  if (s === "RED" || s === "HIGH")    return <span className={BADGE_ERROR}>{s}</span>;
  if (s === "AMBER" || s === "MEDIUM" || s === "YELLOW") return <span className={BADGE_WARNING}>{s}</span>;
  return <span className={BADGE_INFO}>{severity || "-"}</span>;
}

function ActionCard({
  count,
  label,
  sublabel,
  href,
  urgent,
  colorClass,
}: {
  count: number;
  label: string;
  sublabel: string;
  href: string;
  urgent?: boolean;
  colorClass: string;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-2xl border p-4 transition-all duration-200 ${
        count > 0 ? colorClass : "border-white/8 bg-white/4 hover:border-white/12"
      }`}
    >
      <div className={`text-3xl font-bold tabular-nums transition-transform duration-200 group-hover:scale-105 ${count > 0 ? "" : "text-zinc-600"}${urgent && count > 0 ? " animate-pulse" : ""}`}>
        {count}
      </div>
      <div className="mt-1 text-sm font-medium text-zinc-200">{label}</div>
      <div className="mt-0.5 text-xs text-zinc-500">→ {sublabel}</div>
    </Link>
  );
}

export default function ProcurementDashboardPage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const requestedBy = defaultProcurementName();
  const pin = defaultProcurementPin();
  const [city, setCity] = useState(String(auth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila");
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
          { method: "GET" }, requestedBy, pin,
        ),
        procurementJson<{ rows: ExceptionRow[] }>(
          `/api/admin/procurement/exceptions?city=${encodeURIComponent(city)}&status=OPEN&limit=50`,
          { method: "GET" }, requestedBy, pin,
        ),
        procurementJson<{ rows: RiskRow[] }>(
          `/api/admin/procurement/stockout/risks?city=${encodeURIComponent(city)}&snapshot_date=${encodeURIComponent(snapshotDate)}&risk_level=&limit=50`,
          { method: "GET" }, requestedBy, pin,
        ),
        procurementJson<{ rows: CaseRow[] }>(
          `/api/admin/procurement/cases?city=${encodeURIComponent(city)}&status=&limit=80`,
          { method: "GET" }, requestedBy, pin,
        ),
        procurementJson<{ rows: ApprovalQueueRow[] }>(
          `/api/admin/procurement/approvals/queue?city=${encodeURIComponent(city)}&limit=50`,
          { method: "GET" }, requestedBy, pin,
        ).catch(() => ({ rows: [] as ApprovalQueueRow[] })),
      ]);
      setSummary(kpiRes?.summary || null);
      setExceptions(Array.isArray(exRes?.rows) ? exRes.rows : []);
      setRisks(Array.isArray(riskRes?.rows) ? riskRes.rows : []);
      setCases(Array.isArray(caseRes?.rows) ? caseRes.rows : []);
      setApprovalQueue(Array.isArray(queueRes?.rows) ? queueRes.rows : []);
      if (requestedBy.trim() && pin.trim()) saveProcurementSession(requestedBy.trim(), pin.trim());
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [city, monthKey, pin, requestedBy, snapshotDate]);

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const resolvedAuth = refreshed || auth;
      const resolvedCity = String(resolvedAuth?.city || "manila").toLowerCase();
      setCity(resolvedCity === "dubai" ? "dubai" : "manila");
      const can = canAccessProcurementAdmin(
        String(resolvedAuth?.role || ""),
        resolvedCity === "dubai" ? "dubai" : "manila",
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
        Procurement dashboard is only available to authorized admin roles.
      </div>
    );
  }

  const openExceptions = exceptions.filter((r) => String(r.status || "").toUpperCase() === "OPEN");
  const criticalRisks = risks.filter((r) => {
    const l = String(r.risk_level || "").toUpperCase();
    return l === "CRITICAL" || l === "HIGH";
  });
  const holdCases = cases.filter((r) => String(r.payment_status || "").toUpperCase() === "HOLD");

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={T_PAGE_TITLE}>Procurement Dashboard</h2>
          <p className="mt-1 text-sm text-zinc-400">Live operational overview for {city === "dubai" ? "Dubai" : "Manila"}.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className={`${SECONDARY_BUTTON} flex items-center gap-2 px-4 py-2 text-sm`}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* Loading */}
      {loading && !summary && (
        <div className={`${GLASS_CARD} p-10 flex items-center justify-center gap-3 text-zinc-500`}>
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading dashboard data…</span>
        </div>
      )}

      {/* Today's Actions */}
      <div className={`${GLASS_CARD} p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className={T_CARD_TITLE}>Today&apos;s Actions</p>
            <p className={`${T_CAPTION} mt-0.5`}>Click a card to go directly to that section</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ActionCard
            count={approvalQueue.length}
            label="Approvals Pending"
            sublabel="Approval Inbox"
            href="/admin/procurement/approval-inbox"
            urgent
            colorClass="border-amber-500/30 bg-amber-500/10 hover:border-amber-500/50"
          />
          <ActionCard
            count={holdCases.length}
            label="Payments on Hold"
            sublabel="Payments"
            href="/admin/procurement/payments"
            colorClass="border-sky-500/30 bg-sky-500/10 hover:border-sky-500/50"
          />
          <ActionCard
            count={openExceptions.length}
            label="Open Alerts"
            sublabel="Exceptions"
            href="/admin/procurement/exceptions"
            colorClass="border-red-500/30 bg-red-500/10 hover:border-red-500/50"
          />
          <ActionCard
            count={criticalRisks.length}
            label="Critical Stock Risks"
            sublabel="Risk Lab"
            href="/admin/procurement/risk-lab"
            colorClass="border-orange-500/30 bg-orange-500/10 hover:border-orange-500/50"
          />
        </div>
      </div>

      {/* KPI Snapshot */}
      <div className={`${GLASS_CARD} p-5`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-violet-400" />
            <p className={T_CARD_TITLE}>KPI Snapshot</p>
          </div>
          <div className="flex items-center gap-2">
            <MonthPicker value={monthKey} onChange={setMonthKey} />
            <select
              value={city}
              onChange={(e) => setCity(String(e.target.value).toLowerCase() === "dubai" ? "dubai" : "manila")}
              className="appearance-none rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="manila">Manila</option>
              <option value="dubai">Dubai</option>
            </select>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className={`${SECONDARY_BUTTON} px-3 py-2 text-xs flex items-center gap-1.5`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Go
            </button>
          </div>
        </div>

        {summary ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "KPI Score", value: Number(summary.score_total || 0).toFixed(1), sub: `Grade ${summary.grade || "–"}` },
              { label: "Payment Compliance", value: `${Number(summary.payment_compliance_rate || 0).toFixed(1)}%`, sub: "This month" },
              { label: "On-time Receiving", value: `${Number(summary.receiving_delay_rate || 0).toFixed(1)}%`, sub: "Delay rate" },
              { label: "Requests", value: String(Number(summary.request_count || 0)), sub: "This month" },
              { label: "Stores Active", value: String(Number(summary.store_count || 0)), sub: "Branches" },
            ].map((card) => (
              <div key={card.label} className={KPI_CARD}>
                <div className={KPI_LABEL}>{card.label}</div>
                <div className={KPI_VALUE}>{card.value}</div>
                <div className={`${T_CAPTION} mt-0.5`}>{card.sub}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className={T_CAPTION}>No KPI data yet. Select a month and click Go.</p>
        )}
      </div>

      {/* Detail panels */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">

        {/* Exception Alerts */}
        <div className={`${GLASS_CARD} p-5`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className={T_CARD_TITLE}>Exception Alerts</p>
            <Link href="/admin/procurement/exceptions" className="text-xs text-violet-400 hover:text-violet-300">View All →</Link>
          </div>
          <div className="space-y-2">
            {openExceptions.slice(0, 6).map((row) => (
              <div key={row.id} className="rounded-xl border border-white/8 bg-white/4 p-3">
                <div className="flex items-center gap-2">
                  {severityBadge(row.severity)}
                  <span className="text-sm font-medium text-white">{row.rule_code}</span>
                </div>
                <p className={`${T_CAPTION} mt-1`}>{row.request_no || row.request_id} · Score {Number(row.score || 0).toFixed(1)}</p>
              </div>
            ))}
            {!openExceptions.length && <p className={T_CAPTION}>No open exceptions.</p>}
          </div>
        </div>

        {/* Stock Risks */}
        <div className={`${GLASS_CARD} p-5`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-orange-400" />
              <p className={T_CARD_TITLE}>Stock Risks</p>
            </div>
            <Link href="/admin/procurement/risk-lab" className="text-xs text-violet-400 hover:text-violet-300">View All →</Link>
          </div>
          <div className="space-y-2">
            {criticalRisks.slice(0, 6).map((row) => (
              <div key={row.id} className="rounded-xl border border-orange-700/30 bg-orange-950/15 p-3">
                <p className="text-sm font-medium text-white">
                  {row.item_name} <span className="text-zinc-500">({row.store_code || "–"})</span>
                </p>
                <p className={`${T_CAPTION} mt-0.5`}>{row.risk_level} · {Number(row.projected_days_to_stockout || 0).toFixed(1)} days left</p>
                {row.recommended_action && (
                  <p className="mt-1 text-xs text-amber-300">{row.recommended_action}</p>
                )}
              </div>
            ))}
            {!criticalRisks.length && <p className={T_CAPTION}>No critical / high stock risks.</p>}
          </div>
        </div>

        {/* Payment Hold Cases */}
        <div className={`${GLASS_CARD} p-5`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className={T_CARD_TITLE}>Payment Hold Cases</p>
            <Link href="/admin/procurement/payments" className="text-xs text-violet-400 hover:text-violet-300">View All →</Link>
          </div>
          <div className="space-y-2">
            {holdCases.slice(0, 6).map((row) => (
              <Link
                key={row.id}
                href={`/admin/procurement/cases/${row.id}`}
                className="block rounded-xl border border-white/8 bg-white/4 p-3 transition hover:bg-white/8"
              >
                <p className="font-mono text-sm font-semibold text-white">{row.parent_case_no || row.request_no || row.id}</p>
                <p className={`${T_CAPTION} mt-0.5`}>
                  {severityBadge(row.severity)} · {row.current_assignee_role || "–"}
                </p>
                {row.payment_hold_reason && (
                  <p className="mt-1 text-xs text-amber-300">{row.payment_hold_reason}</p>
                )}
              </Link>
            ))}
            {!holdCases.length && <p className={T_CAPTION}>No payment hold cases.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
