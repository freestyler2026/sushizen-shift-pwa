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
  T_LABEL,
  T_CAPTION,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
} from "@/lib/ui-tokens";
import { RefreshCw, LayoutDashboard, AlertCircle, Building2, Filter, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type HubRow = {
  id: string;
  city: string;
  request_no: string;
  requested_by: string;
  store_code: string;
  request_date: string;
  currency: string;
  total_amount: number;
  purchase_type: string;
  request_status: string;
  urgent_flag: boolean;
  severity?: string;
  document_status?: string;
  po_status?: string;
  receiving_status?: string;
  payment_status?: string;
  payment_hold_reason?: string;
  blocked_reason?: string;
  created_at: string;
  updated_at: string;
  // Case fields (may be null if no case yet)
  case_id?: string;
  parent_case_no?: string;
  case_status?: string;
  current_assignee_role?: string;
  claimed_by?: string;
  approved_at?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PURCHASE_TYPE_LABELS: Record<string, string> = {
  standard:      "Standard",
  cash_purchase: "Cash & Carry",
  ec_purchase:   "EC / Online",
  prepaid:       "Pre-payment",
};

const PURCHASE_TYPE_COLORS: Record<string, string> = {
  standard:      "border-zinc-600/40 bg-zinc-800/20 text-zinc-300",
  cash_purchase: "border-amber-500/35 bg-amber-950/25 text-amber-300",
  ec_purchase:   "border-sky-500/35 bg-sky-950/25 text-sky-300",
  prepaid:       "border-purple-500/35 bg-purple-950/25 text-purple-300",
};

function purchaseTypeBadge(pt: string) {
  const k = (pt || "standard").toLowerCase();
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${PURCHASE_TYPE_COLORS[k] ?? PURCHASE_TYPE_COLORS.standard}`}>
      {PURCHASE_TYPE_LABELS[k] ?? k}
    </span>
  );
}

function requestStatusBadge(s: string) {
  const v = (s || "").toUpperCase();
  if (v === "DRAFT")     return <span className="rounded-full border border-zinc-600/40 bg-zinc-800/25 px-2 py-0.5 text-[11px] font-medium text-zinc-400">Draft</span>;
  if (v === "SUBMITTED") return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${BADGE_INFO}`}>Submitted</span>;
  if (v === "APPROVED")  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${BADGE_SUCCESS}`}>Approved</span>;
  if (v === "PURCHASED") return <span className="rounded-full border border-emerald-600/40 bg-emerald-950/25 px-2 py-0.5 text-[11px] font-medium text-emerald-300">Purchased</span>;
  if (v === "RECEIVED")  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${BADGE_SUCCESS}`}>Received</span>;
  if (v === "REJECTED")  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${BADGE_ERROR}`}>Rejected</span>;
  if (v === "CLOSED")    return <span className="rounded-full border border-zinc-600/40 bg-zinc-800/25 px-2 py-0.5 text-[11px] font-medium text-zinc-500">Closed</span>;
  if (v === "CANCELLED") return <span className="rounded-full border border-zinc-600/40 bg-zinc-800/25 px-2 py-0.5 text-[11px] font-medium text-zinc-500">Cancelled</span>;
  if (v === "PAYMENT_CONFIRMED") return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${BADGE_SUCCESS}`}>Payment Confirmed</span>;
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${BADGE_INFO}`}>{s}</span>;
}

function caseStatusBadge(s: string | undefined) {
  if (!s) return <span className="text-[11px] text-zinc-600">—</span>;
  const v = s.toUpperCase();
  if (v === "OPEN")      return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${BADGE_INFO}`}>Open</span>;
  if (v === "CLAIMED")   return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${BADGE_WARNING}`}>Claimed</span>;
  if (v === "IN_REVIEW") return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${BADGE_INFO}`}>In Review</span>;
  if (v === "ESCALATED") return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${BADGE_ERROR}`}>Escalated</span>;
  if (v === "APPROVED")  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${BADGE_SUCCESS}`}>Case Approved</span>;
  if (v === "RETURNED")  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${BADGE_WARNING}`}>Returned</span>;
  if (v === "REJECTED")  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${BADGE_ERROR}`}>Case Rejected</span>;
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${BADGE_INFO}`}>{s}</span>;
}

/** Determine what action label + style to show on a row */
function rowAction(row: HubRow): { label: string; href: string; style: string } | null {
  const rs = (row.request_status || "").toUpperCase();
  const pt = (row.purchase_type || "standard").toLowerCase();
  const cs = (row.case_status || "").toUpperCase();

  // Draft — go to edit
  if (rs === "DRAFT") return {
    label: "Edit →",
    href: `/store/procurement/request?city=${row.city}&editId=${row.id}`,
    style: "border-zinc-600/40 bg-zinc-800/20 text-zinc-300 hover:bg-zinc-700/30",
  };

  // Approved cash/EC — needs to be purchased
  if (rs === "APPROVED" && (pt === "cash_purchase" || pt === "ec_purchase")) return {
    label: "Mark Purchased →",
    href: row.case_id ? `/admin/procurement/cases/${row.case_id}` : "#",
    style: "border-amber-500/40 bg-amber-950/20 text-amber-200 hover:bg-amber-950/35",
  };

  // Approved prepaid — needs payment confirmation
  if (rs === "APPROVED" && pt === "prepaid") return {
    label: "Confirm Payment →",
    href: row.case_id ? `/admin/procurement/cases/${row.case_id}` : "#",
    style: "border-purple-500/40 bg-purple-950/20 text-purple-200 hover:bg-purple-950/35",
  };

  // Has an active case — open it
  if (row.case_id && cs && !["REJECTED", "APPROVED"].includes(cs)) return {
    label: "Open Case →",
    href: `/admin/procurement/cases/${row.case_id}`,
    style: "border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20",
  };

  // Has an approved/rejected case or completed request — view
  if (row.case_id) return {
    label: "View →",
    href: `/admin/procurement/cases/${row.case_id}`,
    style: "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/8",
  };

  return null;
}

/** Row background highlight */
function rowHighlight(row: HubRow): string {
  const rs = (row.request_status || "").toUpperCase();
  const cs = (row.case_status || "").toUpperCase();
  if (row.urgent_flag) return "border-rose-700/40 bg-rose-950/15";
  if (rs === "APPROVED" && (row.purchase_type === "cash_purchase" || row.purchase_type === "ec_purchase" || row.purchase_type === "prepaid"))
    return "border-amber-600/30 bg-amber-950/10";
  if (cs === "ESCALATED") return "border-rose-700/30 bg-rose-950/10";
  if (rs === "CLOSED" || rs === "REJECTED" || rs === "CANCELLED") return "border-zinc-700/20 bg-black/10 opacity-60";
  return "border-white/7 bg-white/3";
}

function fmt(dateStr: string | undefined) {
  if (!dateStr) return "—";
  return String(dateStr).substring(0, 10);
}

// ─── Status counts ────────────────────────────────────────────────────────────
type StatusGroup = "action_needed" | "in_review" | "completed" | "all";

function classifyRow(row: HubRow): StatusGroup {
  const rs = (row.request_status || "").toUpperCase();
  const cs = (row.case_status || "").toUpperCase();
  const pt = (row.purchase_type || "").toLowerCase();
  const DONE = new Set(["RECEIVED", "CLOSED", "CANCELLED", "REJECTED", "PURCHASED", "PAYMENT_CONFIRMED"]);
  if (DONE.has(rs)) return "completed";
  if (rs === "APPROVED" && (pt === "cash_purchase" || pt === "ec_purchase" || pt === "prepaid")) return "action_needed";
  if (cs === "OPEN" || cs === "CLAIMED" || cs === "IN_REVIEW" || cs === "ESCALATED" || rs === "SUBMITTED") return "in_review";
  if (rs === "DRAFT") return "in_review";
  return "completed";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProcurementHubPage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [city, setCity] = useState(String(auth?.city || "manila").toLowerCase());

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterGroup, setFilterGroup] = useState<StatusGroup>("all");

  const [rows, setRows] = useState<HubRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const currencyCode = city === "dubai" ? "AED" : "PHP";

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const qs = new URLSearchParams({ city, limit: "300" });
      if (filterStatus) qs.set("status", filterStatus);
      if (filterType) qs.set("purchase_type", filterType);
      if (filterDateFrom) qs.set("date_from", filterDateFrom);
      if (filterDateTo) qs.set("date_to", filterDateTo);
      const data = await procurementJson<{ rows: HubRow[] }>(
        `/api/admin/procurement/hub?${qs}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [city, filterStatus, filterType, filterDateFrom, filterDateTo, pin, requestedBy]);

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

  useEffect(() => {
    if (allowed) void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  // Counts per group
  const counts = useMemo(() => {
    const c: Record<StatusGroup, number> = { action_needed: 0, in_review: 0, completed: 0, all: rows.length };
    rows.forEach((r) => { c[classifyRow(r)]++; });
    return c;
  }, [rows]);

  // Active display rows
  const displayRows = useMemo(
    () => filterGroup === "all" ? rows : rows.filter((r) => classifyRow(r) === filterGroup),
    [rows, filterGroup],
  );

  const clearFilters = () => {
    setFilterStatus("");
    setFilterType("");
    setFilterDateFrom("");
    setFilterDateTo("");
  };
  const hasActiveFilters = filterStatus || filterType || filterDateFrom || filterDateTo;

  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Procurement Hub is only available to authorized admin roles.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>Procurement Hub</h2>
          <p className="mt-1 text-sm text-zinc-400">All purchase requests — every type, every status — in one place.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-400 shrink-0">
          <LayoutDashboard className="h-3 w-3" />{rows.length} requests
        </span>
      </div>

      {/* Session + city */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Name</label>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Name" className={INPUT_CLASS} />
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
            <button type="button" onClick={() => void load()} disabled={loading}
              className={`${SECONDARY_BUTTON} w-full flex items-center justify-center gap-2`}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-sm font-medium text-zinc-300">Filters</span>
          {hasActiveFilters && (
            <button type="button" onClick={clearFilters}
              className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors">
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Request Status</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={SELECT_CLASS}>
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="APPROVED">Approved</option>
              <option value="PURCHASED">Purchased</option>
              <option value="RECEIVED">Received</option>
              <option value="CLOSED">Closed</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Purchase Type</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={SELECT_CLASS}>
              <option value="">All types</option>
              <option value="standard">Standard</option>
              <option value="cash_purchase">Cash &amp; Carry</option>
              <option value="ec_purchase">EC / Online</option>
              <option value="prepaid">Pre-payment</option>
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>From</label>
            <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>To</label>
            <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className={INPUT_CLASS} />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={() => void load()} disabled={loading}
            className={`${PRIMARY_BUTTON} px-5 py-2 text-sm`}>
            {loading ? "Searching…" : "Apply Filters"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* Status group tabs */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "all",           label: "All",             color: "border-zinc-700/50 bg-zinc-800/20 text-zinc-300",           active: "border-zinc-500 bg-zinc-700/30 text-zinc-100" },
            { key: "action_needed", label: "Action Needed",   color: "border-amber-600/30 bg-amber-950/15 text-amber-400",        active: "border-amber-500/70 bg-amber-900/25 text-amber-200" },
            { key: "in_review",     label: "In Review",       color: "border-violet-600/30 bg-violet-950/15 text-violet-400",     active: "border-violet-500/70 bg-violet-900/25 text-violet-200" },
            { key: "completed",     label: "Completed",       color: "border-zinc-700/30 bg-zinc-900/20 text-zinc-500",           active: "border-zinc-500 bg-zinc-800/30 text-zinc-300" },
          ] as const
        ).map(({ key, label, color, active }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilterGroup(key as StatusGroup)}
            className={[
              "rounded-xl border px-3 py-1.5 text-sm font-medium transition-all",
              filterGroup === key ? active : color,
            ].join(" ")}
          >
            {label}
            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${filterGroup === key ? "bg-white/10" : "bg-black/20"}`}>
              {counts[key as StatusGroup]}
            </span>
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && !rows.length && (
        <div className={`${GLASS_CARD} p-8 flex items-center justify-center gap-3 text-zinc-500`}>
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading requests…</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !displayRows.length && (
        <div className={`${GLASS_CARD} p-10 flex flex-col items-center gap-3`}>
          <LayoutDashboard className="h-8 w-8 text-zinc-600" />
          <p className={T_CAPTION}>No requests found.</p>
          {hasActiveFilters && (
            <button type="button" onClick={clearFilters} className="text-xs text-violet-400 hover:text-violet-300 underline">
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Request list */}
      <div className="space-y-2">
        {displayRows.map((row) => {
          const action = rowAction(row);
          const currCode = String(row.city || city).toLowerCase() === "dubai" ? "AED" : "PHP";
          return (
            <div
              key={row.id}
              className={`rounded-2xl border p-4 transition-all ${rowHighlight(row)}`}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">

                {/* Left — identifiers + badges */}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-white">
                      {row.request_no || row.id.substring(0, 8)}
                    </span>
                    {purchaseTypeBadge(row.purchase_type)}
                    {requestStatusBadge(row.request_status)}
                    {caseStatusBadge(row.case_status)}
                    {row.urgent_flag && (
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${BADGE_ERROR}`}>⚡ Urgent</span>
                    )}
                  </div>

                  {/* Meta row */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                    <span>By <span className="text-zinc-200">{row.requested_by || "—"}</span></span>
                    <span>Store <span className="text-zinc-200">{row.store_code || "—"}</span></span>
                    <span>Date <span className="text-zinc-200">{fmt(row.request_date)}</span></span>
                    <span>
                      Amount{" "}
                      <span className="font-semibold text-zinc-200">
                        {Number(row.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currCode}
                      </span>
                    </span>
                    {row.current_assignee_role && (
                      <span>Assignee <span className="text-zinc-300">{row.current_assignee_role}</span></span>
                    )}
                    {row.claimed_by && (
                      <span>Claimed by <span className="text-zinc-300">{row.claimed_by}</span></span>
                    )}
                  </div>

                  {/* Blocked / hold reason */}
                  {(row.blocked_reason || row.payment_hold_reason) && (
                    <p className="text-xs text-amber-300 flex items-center gap-1">
                      <span>⚠</span>
                      {row.blocked_reason || row.payment_hold_reason}
                    </p>
                  )}
                </div>

                {/* Right — action */}
                <div className="flex shrink-0 items-center gap-2">
                  {action ? (
                    <Link
                      href={action.href}
                      className={`rounded-xl border px-4 py-2 text-xs font-medium transition ${action.style}`}
                    >
                      {action.label}
                    </Link>
                  ) : (
                    row.case_id && (
                      <Link
                        href={`/admin/procurement/cases/${row.case_id}`}
                        className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition"
                      >
                        View →
                      </Link>
                    )
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
