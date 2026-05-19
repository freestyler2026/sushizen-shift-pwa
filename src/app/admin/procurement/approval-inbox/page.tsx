"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_LABEL,
  T_CAPTION,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
} from "@/lib/ui-tokens";
import { RefreshCw, Inbox, AlertCircle, Building2 } from "lucide-react";

type CaseRow = {
  id: string;
  parent_case_no: string;
  request_no: string;
  requested_by: string;
  store_code: string;
  total_amount: number;
  severity: string;
  status: string;
  current_assignee_role: string;
  claimed_by: string;
  document_status: string;
  po_status: string;
  blocked_reason?: string;
  notification_status?: string;
  notification_failed_count?: number;
  purchase_type?: string;
  payment_status?: string;
  request_status?: string;
  city?: string;
};

function severityBadge(severity: string) {
  const s = String(severity || "").toUpperCase();
  if (s === "RED")    return <span className={BADGE_ERROR}>RED</span>;
  if (s === "AMBER")  return <span className={BADGE_WARNING}>AMBER</span>;
  if (s === "YELLOW") return <span className={BADGE_WARNING}>YELLOW</span>;
  if (s === "GREEN")  return <span className={BADGE_SUCCESS}>GREEN</span>;
  if (s === "HIGH")   return <span className={BADGE_ERROR}>HIGH</span>;
  if (s === "MEDIUM") return <span className={BADGE_WARNING}>MEDIUM</span>;
  if (s === "LOW")    return <span className={BADGE_INFO}>LOW</span>;
  return <span className={BADGE_INFO}>{severity || "-"}</span>;
}

function statusBadge(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "OPEN")        return <span className={BADGE_INFO}>OPEN</span>;
  if (s === "CLAIMED")     return <span className={BADGE_WARNING}>CLAIMED</span>;
  if (s === "IN_REVIEW")   return <span className={BADGE_INFO}>IN REVIEW</span>;
  if (s === "ESCALATED")   return <span className={BADGE_ERROR}>ESCALATED</span>;
  if (s === "APPROVED")    return <span className={BADGE_SUCCESS}>APPROVED</span>;
  if (s === "RETURNED")    return <span className={BADGE_WARNING}>RETURNED</span>;
  if (s === "REJECTED")    return <span className={BADGE_ERROR}>REJECTED</span>;
  return <span className={BADGE_INFO}>{status || "-"}</span>;
}

export default function ProcurementApprovalInboxPage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [city, setCity] = useState(String(auth?.city || "manila").toLowerCase());
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"needs_approval" | "awaiting_execution">("needs_approval");

  const APPROVAL_THRESHOLD = city === "dubai" ? 500 : 15000;

  // "Needs Approval": open cases not yet approved/rejected/returned
  const needsApprovalRows = useMemo(
    () => rows.filter((r) => !["APPROVED", "REJECTED", "RETURNED"].includes((r.status || "").toUpperCase())),
    [rows],
  );

  // "Awaiting Execution": approved cases where the underlying request still needs action
  // - Cash/EC: request not yet PURCHASED/RECEIVED/CLOSED
  // - Prepaid: payment not yet confirmed
  const EXECUTED_REQ_STATUSES = ["PURCHASED", "RECEIVED", "CLOSED", "PAYMENT_CONFIRMED"];
  const awaitingExecutionRows = useMemo(
    () =>
      rows.filter((r) => {
        if ((r.status || "").toUpperCase() !== "APPROVED") return false;
        const pt = (r.purchase_type || "").toLowerCase();
        if (pt === "cash_purchase" || pt === "ec_purchase") {
          return !EXECUTED_REQ_STATUSES.includes((r.request_status || "").toUpperCase());
        }
        if (pt === "prepaid") {
          return (r.payment_status || "").toUpperCase() !== "PAYMENT_CONFIRMED";
        }
        return false;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  );

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: "200", city });
      const data = await procurementJson<{ rows: CaseRow[] }>(
        `/api/admin/procurement/cases?${qs.toString()}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      // Keep APPROVED cases for "Awaiting Execution" tab; discard only REJECTED/RETURNED
      const DISCARD_STATUSES = ["REJECTED", "RETURNED"];
      setRows(
        Array.isArray(data?.rows)
          ? data.rows.filter((r) => !DISCARD_STATUSES.includes((r.status || "").toUpperCase()))
          : [],
      );
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [city, pin, requestedBy]);

  const claim = async (caseId: string) => {
    setBusyId(caseId);
    setError("");
    try {
      await procurementJson(
        `/api/admin/procurement/cases/${caseId}/claim`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ case_id: caseId, approver_name: requestedBy, pin }),
        },
        requestedBy,
        pin,
      );
      await load();
      window.dispatchEvent(new Event("procurement-badge-refresh"));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusyId("");
    }
  };

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const resolvedAuth = refreshed || auth;
      const resolvedCity = String(resolvedAuth?.city || "manila").toLowerCase();
      setCity(resolvedCity);
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

  // Reload when city changes (user switches city in the selector)
  useEffect(() => {
    if (allowed) void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Procurement approval inbox is only available to authorized admin roles.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>Approval Inbox</h2>
          <p className="mt-1 text-sm text-zinc-400">Pending procurement cases awaiting review or action.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-400">
          <Inbox className="h-3 w-3" />{needsApprovalRows.length} pending
        </span>
      </div>

      {/* Auth bar */}
      <div className={`${GLASS_CARD} p-4`}>
        <p className={`${T_SECTION} mb-3`}>Session</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Name</label>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Approver name" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 flex items-center gap-1.5`}><Building2 className="h-3 w-3" />City</label>
            <select value={city} onChange={(e) => setCity(String(e.target.value).toLowerCase())} className={SELECT_CLASS}>
              <option value="manila">Manila</option>
              <option value="dubai">Dubai</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className={`${SECONDARY_BUTTON} w-full flex items-center justify-center gap-2`}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl border border-white/8 bg-black/20 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("needs_approval")}
          className={[
            "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all",
            activeTab === "needs_approval"
              ? "bg-violet-600/30 text-violet-100 shadow-sm border border-violet-500/30"
              : "text-zinc-400 hover:text-zinc-200",
          ].join(" ")}
        >
          Needs Approval
          {needsApprovalRows.length > 0 && (
            <span className={[
              "rounded-full px-2 py-0.5 text-[11px] font-bold",
              activeTab === "needs_approval" ? "bg-violet-500/40 text-violet-100" : "bg-white/10 text-zinc-300",
            ].join(" ")}>
              {needsApprovalRows.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("awaiting_execution")}
          className={[
            "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all",
            activeTab === "awaiting_execution"
              ? "bg-amber-600/20 text-amber-100 shadow-sm border border-amber-500/25"
              : "text-zinc-400 hover:text-zinc-200",
          ].join(" ")}
        >
          Awaiting Execution
          {awaitingExecutionRows.length > 0 && (
            <span className={[
              "rounded-full px-2 py-0.5 text-[11px] font-bold",
              activeTab === "awaiting_execution" ? "bg-amber-500/40 text-amber-100" : "bg-white/10 text-zinc-300",
            ].join(" ")}>
              {awaitingExecutionRows.length}
            </span>
          )}
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && !rows.length && (
        <div className={`${GLASS_CARD} p-8 flex items-center justify-center gap-3 text-zinc-500`}>
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading cases…</span>
        </div>
      )}

      {/* Case list */}
      {!loading && activeTab === "needs_approval" && !needsApprovalRows.length && (
        <div className={`${GLASS_CARD} p-10 flex flex-col items-center gap-3`}>
          <Inbox className="h-8 w-8 text-zinc-600" />
          <p className={T_CAPTION}>No pending approval cases.</p>
        </div>
      )}

      {!loading && activeTab === "awaiting_execution" && !awaitingExecutionRows.length && (
        <div className={`${GLASS_CARD} p-10 flex flex-col items-center gap-3`}>
          <Inbox className="h-8 w-8 text-zinc-600" />
          <p className={T_CAPTION}>No approved orders awaiting execution.</p>
          <p className="text-xs text-zinc-500 text-center max-w-xs">
            Cash &amp; Carry and EC orders that have been approved but not yet purchased will appear here.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {(activeTab === "needs_approval" ? needsApprovalRows : awaitingExecutionRows).map((row) => {
          const isHighValue = Number(row.total_amount || 0) > APPROVAL_THRESHOLD;
          const hasPushFail = Number(row.notification_failed_count || 0) > 0;
          return (
            <div
              key={row.id}
              className={[
                "rounded-2xl border p-4 transition-all",
                hasPushFail
                  ? "border-red-700/50 bg-red-950/20"
                  : isHighValue
                    ? "border-amber-500/30 bg-amber-950/10"
                    : "border-white/8 bg-white/4",
              ].join(" ")}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">

                {/* Left: case info */}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-white">
                      {row.parent_case_no || row.request_no}
                    </span>
                    {statusBadge(row.status)}
                    {activeTab === "awaiting_execution" && (
                      <span className="rounded-full border border-amber-500/40 bg-amber-950/30 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                        ⚡ Action Required
                      </span>
                    )}
                    {severityBadge(row.severity)}
                    {isHighValue && (
                      <span className={BADGE_WARNING}>⚠ High Value</span>
                    )}
                    {row.purchase_type === "cash_purchase" && <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">💵 Cash</span>}
                    {row.purchase_type === "ec_purchase" && <span className="rounded-full border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-xs text-sky-300">🛒 EC</span>}
                    {row.purchase_type === "prepaid" && <span className="rounded-full border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-xs text-purple-300">💳 Pre-pay</span>}
                    {row.purchase_type === "prepaid" && row.payment_status === "PAYMENT_CONFIRMED" && <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">✓ Paid</span>}
                    {hasPushFail && (
                      <span className={BADGE_ERROR}>Push Failed ×{row.notification_failed_count}</span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                    <span>By <span className="text-zinc-200">{row.requested_by || "-"}</span></span>
                    <span>Store <span className="text-zinc-200">{row.store_code || "-"}</span></span>
                    {row.city && row.city.toLowerCase() !== city.toLowerCase() && (
                      <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-300 uppercase">{row.city}</span>
                    )}
                    <span>
                      Amount{" "}
                      <span className={`font-semibold ${isHighValue ? "text-amber-300" : "text-zinc-200"}`}>
                        {Number(row.total_amount || 0).toFixed(2)} {String(row.city || city).toLowerCase() === "dubai" ? "AED" : "PHP"}
                      </span>
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                    <span>Assignee Role: <span className="text-zinc-400">{row.current_assignee_role || "-"}</span></span>
                    <span>Claimed By: <span className="text-zinc-400">{row.claimed_by || "-"}</span></span>
                    <span>Docs: <span className="text-zinc-400">{row.document_status || "-"}</span></span>
                    <span>PO: <span className="text-zinc-400">{row.po_status || "-"}</span></span>
                  </div>

                  {hasPushFail && row.blocked_reason && (
                    <p className="text-xs text-red-300">{row.blocked_reason}</p>
                  )}
                </div>

                {/* Right: actions */}
                <div className="flex shrink-0 flex-wrap gap-2">
                  {activeTab === "needs_approval" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void claim(row.id)}
                        disabled={busyId === row.id}
                        className={`${PRIMARY_BUTTON} px-4 py-2 text-xs`}
                      >
                        {busyId === row.id ? "Claiming…" : "Claim"}
                      </button>
                      <Link
                        href={`/admin/procurement/cases/${row.id}?from=inbox`}
                        className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-xs font-medium text-violet-300 transition hover:bg-violet-500/20"
                      >
                        Open Case →
                      </Link>
                    </>
                  ) : (
                    <>
                      {(row.purchase_type === "cash_purchase" || row.purchase_type === "ec_purchase") && (
                        <Link
                          href={`/admin/procurement/cases/${row.id}?from=inbox`}
                          className="rounded-xl border border-amber-500/30 bg-amber-500/15 px-4 py-2 text-xs font-medium text-amber-200 transition hover:bg-amber-500/25"
                        >
                          Mark Purchased →
                        </Link>
                      )}
                      {row.purchase_type === "prepaid" && (
                        <Link
                          href={`/admin/procurement/cases/${row.id}?from=inbox`}
                          className="rounded-xl border border-purple-500/30 bg-purple-500/15 px-4 py-2 text-xs font-medium text-purple-200 transition hover:bg-purple-500/25"
                        >
                          Confirm Payment →
                        </Link>
                      )}
                      <Link
                        href={`/admin/procurement/cases/${row.id}?from=inbox`}
                        className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-xs font-medium text-violet-300 transition hover:bg-violet-500/20"
                      >
                        Open Case →
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
