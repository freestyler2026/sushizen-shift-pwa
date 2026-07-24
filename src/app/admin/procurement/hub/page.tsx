"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canAccessProcurementAdmin, getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
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
import { RefreshCw, LayoutDashboard, AlertCircle, Building2, Filter, X, ChevronDown, ChevronRight, ImageIcon, Copy, Check, TriangleAlert, PackageSearch, ChevronUp } from "lucide-react";

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
  vendor_summary?: string;
  source_ref?: string;
  // Case fields (may be null if no case yet)
  case_id?: string;
  parent_case_no?: string;
  case_status?: string;
  current_assignee_role?: string;
  claimed_by?: string;
  approved_at?: string;
};

type WhStockItem = {
  name: string;
  unit: string;
  theoretical_qty: number;
  last_count_date: string | null;
};

/** Match an order item_name against the WH stock map.
 *  Priority: 1) exact  2) order-name contains WH-name  3) WH-name contains order-name */
function lookupWhStock(itemName: string, map: Map<string, WhStockItem>): WhStockItem | null {
  if (!itemName || map.size === 0) return null;
  const key = itemName.toLowerCase().trim();
  if (map.has(key)) return map.get(key)!;
  for (const [k, v] of map) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Parse source_ref "daily_inventory:{id}:{branch}:{date}" → { branch, date } or null
function parseDailyInvRef(sourceRef?: string): { branch: string; date: string } | null {
  if (!sourceRef?.startsWith("daily_inventory:")) return null;
  const parts = sourceRef.split(":");
  // parts: ["daily_inventory", id, branch, date]
  if (parts.length < 4) return null;
  return { branch: parts[2] || "", date: parts[3] || "" };
}

const PURCHASE_TYPE_LABELS: Record<string, string> = {
  standard:        "Standard",
  cash_purchase:   "Cash & Carry",
  ec_purchase:     "EC / Online",
  prepaid:         "Pre-payment",
  direct_purchase: "Direct Purchase",
};

const PURCHASE_TYPE_COLORS: Record<string, string> = {
  standard:        "border-zinc-600/40 bg-zinc-800/20 text-zinc-300",
  cash_purchase:   "border-amber-500/35 bg-amber-950/25 text-amber-300",
  ec_purchase:     "border-sky-500/35 bg-sky-950/25 text-sky-300",
  prepaid:         "border-purple-500/35 bg-purple-950/25 text-purple-300",
  direct_purchase: "border-teal-500/35 bg-teal-950/25 text-teal-300",
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

  // Direct Purchase — route to dedicated review/verify page
  if (pt === "direct_purchase") {
    if (rs === "DRAFT") return {
      label: "Verify →",
      href: "/admin/procurement/direct-purchases",
      style: "border-teal-500/40 bg-teal-950/20 text-teal-200 hover:bg-teal-950/35",
    };
    return {
      label: "View →",
      href: "/admin/procurement/direct-purchases",
      style: "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/8",
    };
  }

  // Draft — go to edit
  if (rs === "DRAFT") return {
    label: "Edit →",
    href: `/store/procurement/request?city=${row.city}&edit=${row.id}`,
    style: "border-zinc-600/40 bg-zinc-800/20 text-zinc-300 hover:bg-zinc-700/30",
  };

  // Approved cash/EC — needs to be purchased
  if (rs === "APPROVED" && (pt === "cash_purchase" || pt === "ec_purchase")) return {
    label: "Mark Purchased →",
    href: row.case_id ? `/admin/procurement/cases/${row.case_id}?from=hub` : "#",
    style: "border-amber-500/40 bg-amber-950/20 text-amber-200 hover:bg-amber-950/35",
  };

  // Approved prepaid — needs payment confirmation (only if not yet confirmed)
  if (rs === "APPROVED" && pt === "prepaid" && row.payment_status !== "PAYMENT_CONFIRMED") return {
    label: "Confirm Payment →",
    href: row.case_id ? `/admin/procurement/cases/${row.case_id}?from=hub` : "#",
    style: "border-purple-500/40 bg-purple-950/20 text-purple-200 hover:bg-purple-950/35",
  };

  // Has an active case — open it
  if (row.case_id && cs && !["REJECTED", "APPROVED"].includes(cs)) return {
    label: "Open Case →",
    href: `/admin/procurement/cases/${row.case_id}?from=hub`,
    style: "border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20",
  };

  // Has an approved/rejected case or completed request — view
  if (row.case_id) return {
    label: "View →",
    href: `/admin/procurement/cases/${row.case_id}?from=hub`,
    style: "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/8",
  };

  return null;
}

/** Row background highlight */
function rowHighlight(row: HubRow): string {
  const rs = (row.request_status || "").toUpperCase();
  const cs = (row.case_status || "").toUpperCase();
  const pt = (row.purchase_type || "").toLowerCase();
  if (row.urgent_flag) return "border-rose-700/40 bg-rose-950/15";
  if (pt === "direct_purchase" && rs === "DRAFT") return "border-teal-600/30 bg-teal-950/10";
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
  const DONE = new Set(["RECEIVED", "CLOSED", "CANCELLED", "REJECTED", "PURCHASED"]);
  if (DONE.has(rs)) return "completed";
  // Direct Purchase: DRAFT = needs verification (action needed), APPROVED = verified (completed)
  if (pt === "direct_purchase") {
    if (rs === "DRAFT") return "action_needed";
    return "completed";
  }
  // Prepaid: payment_status is the execution signal (r.status stays APPROVED after confirm)
  if (pt === "prepaid" && row.payment_status === "PAYMENT_CONFIRMED") return "completed";
  if (rs === "APPROVED" && (pt === "cash_purchase" || pt === "ec_purchase")) return "action_needed";
  if (rs === "APPROVED" && pt === "prepaid") return "action_needed"; // payment_status already excluded above
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
  const [filterBranch, setFilterBranch] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterGroup, setFilterGroup] = useState<StatusGroup>("all");
  const [filterDailyInvOnly, setFilterDailyInvOnly] = useState(false);
  const supplierDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [rows, setRows] = useState<HubRow[]>([]);

  // Overdue deliveries panel
  type OverdueRow = {
    id: string;
    po_no: string;
    vendor_name: string;
    amount: number;
    line_items_json: { item_name: string; qty: number; unit: string }[];
    request_id: string;
    request_no: string;
    store_code: string;
    city: string;
    currency: string;
    days_overdue: number;
    expected_date: string;
    case_id?: string;
    parent_case_no?: string;
    dispatched_at?: string;
    has_shortage: boolean;
  };
  const [overdueRows, setOverdueRows] = useState<OverdueRow[]>([]);
  const [overdueLoading, setOverdueLoading] = useState(false);
  const [overduePanelOpen, setOverduePanelOpen] = useState(true);
  const [overdueExpanded, setOverdueExpanded] = useState<string | null>(null);

  // Expandable rows — id → { items, receipt_url } cache
  type DetailItem = { id: string; item_name: string; vendor_name: string; qty: number; unit: string; unit_price: number; line_total: number; category?: string };
  type DetailCache = { items: DetailItem[]; receipt_url: string; notes: string; loading: boolean };
  const [expandedId, setExpandedId] = useState<string>("");
  const detailCache = useRef<Record<string, DetailCache>>({});
  const [, setDetailTick] = useState(0); // force re-render after cache update

  const toggleExpand = useCallback(async (rowId: string) => {
    if (expandedId === rowId) { setExpandedId(""); return; }
    setExpandedId(rowId);
    if (detailCache.current[rowId]) return; // already loaded
    detailCache.current[rowId] = { items: [], receipt_url: "", notes: "", loading: true };
    setDetailTick((n) => n + 1);
    try {
      const data = await procurementJson<{ ok?: boolean; request?: { items?: DetailItem[]; receipt_url?: string; notes?: string }; items?: DetailItem[]; receipt_url?: string; notes?: string }>(
        `/api/admin/procurement/requests/${rowId}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      // API returns { ok, request: { items, receipt_url, notes, ... }, ... }
      const req = (data as any)?.request ?? data;
      detailCache.current[rowId] = {
        items: Array.isArray(req?.items) ? req.items : [],
        receipt_url: String(req?.receipt_url || ""),
        notes: String(req?.notes || ""),
        loading: false,
      };
    } catch {
      detailCache.current[rowId] = { items: [], receipt_url: "", notes: "", loading: false };
    }
    setDetailTick((n) => n + 1);
  }, [expandedId, pin, requestedBy]);
  // WH stock cache — loaded once on init (Manila only)
  const [whStockMap, setWhStockMap] = useState<Map<string, WhStockItem>>(new Map());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");

  type LoadOverrides = { status?: string; type?: string; dateFrom?: string; dateTo?: string; branch?: string; supplier?: string };

  const load = useCallback(async (overrides?: LoadOverrides) => {
    const ov = overrides;
    const status    = ov?.status    !== undefined ? ov.status    : filterStatus;
    const type      = ov?.type      !== undefined ? ov.type      : filterType;
    const dateFrom  = ov?.dateFrom  !== undefined ? ov.dateFrom  : filterDateFrom;
    const dateTo    = ov?.dateTo    !== undefined ? ov.dateTo    : filterDateTo;
    const branch    = ov?.branch    !== undefined ? ov.branch    : filterBranch;
    const supplier  = ov?.supplier  !== undefined ? ov.supplier  : filterSupplier;

    setError("");
    setLoading(true);
    try {
      const qs = new URLSearchParams({ city, limit: "300" });
      if (status)   qs.set("status",        status);
      if (type)     qs.set("purchase_type", type);
      if (dateFrom) qs.set("date_from",     dateFrom);
      if (dateTo)   qs.set("date_to",       dateTo);
      if (branch)   qs.set("store_code",    branch);
      if (supplier) qs.set("vendor_name",   supplier);

      // Fetch orders and WH stock in parallel (WH stock only for Manila)
      const [data, whData] = await Promise.all([
        procurementJson<{ rows: HubRow[] }>(
          `/api/admin/procurement/hub?${qs}`,
          { method: "GET" },
          requestedBy,
          pin,
        ),
        city === "manila"
          ? fetch(`/api/admin/inventory/wh-stock?city=manila`, {
              headers: getAuthHeaders() as Record<string, string>,
            })
              .then((r) => (r.ok ? (r.json() as Promise<{ ok: boolean; rows: WhStockItem[] }>) : null))
              .catch(() => null)
          : Promise.resolve(null),
      ]);

      setRows(Array.isArray(data?.rows) ? data.rows : []);

      // Build WH stock lookup map (name → item)
      if (whData?.ok && Array.isArray(whData.rows)) {
        const m = new Map<string, WhStockItem>();
        for (const r of whData.rows) {
          m.set((r.name || "").toLowerCase().trim(), r);
        }
        setWhStockMap(m);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [city, filterStatus, filterType, filterDateFrom, filterDateTo, filterBranch, filterSupplier, pin, requestedBy]);

  const loadOverdue = useCallback(async (cityOverride?: string) => {
    const activeCity = cityOverride ?? city;
    setOverdueLoading(true);
    try {
      const qs = new URLSearchParams({ city: activeCity, limit: "200" });
      const res = await fetch(`/api/admin/procurement/overdue-deliveries?${qs}`, {
        headers: getAuthHeaders() as Record<string, string>,
        cache: "no-store",
      });
      const data = await res.json();
      setOverdueRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch {
      setOverdueRows([]);
    } finally {
      setOverdueLoading(false);
    }
  }, [city]);

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
      if (can) {
        await Promise.all([load(), loadOverdue(resolvedCity)]);
      }
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (allowed) {
      void load();
      void loadOverdue();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  // Auto-search when supplier filter changes (debounced 500ms)
  useEffect(() => {
    if (!allowed) return;
    if (supplierDebounce.current) clearTimeout(supplierDebounce.current);
    supplierDebounce.current = setTimeout(() => {
      void load();
    }, 500);
    return () => {
      if (supplierDebounce.current) clearTimeout(supplierDebounce.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSupplier]);

  // Counts per group
  const counts = useMemo(() => {
    const c: Record<StatusGroup, number> = { action_needed: 0, in_review: 0, completed: 0, all: rows.length };
    rows.forEach((r) => { c[classifyRow(r)]++; });
    return c;
  }, [rows]);

  // Active display rows
  const displayRows = useMemo(() => {
    let r = filterGroup === "all" ? rows : rows.filter((row) => classifyRow(row) === filterGroup);
    if (filterDailyInvOnly) r = r.filter((row) => !!parseDailyInvRef(row.source_ref));
    return r;
  }, [rows, filterGroup, filterDailyInvOnly]);

  const clearFilters = () => {
    setFilterStatus("");
    setFilterType("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterBranch("");
    setFilterSupplier("");
    // Reload immediately with empty filters — don't wait for async state update
    void load({ status: "", type: "", dateFrom: "", dateTo: "", branch: "", supplier: "" });
  };
  const hasActiveFilters = filterStatus || filterType || filterDateFrom || filterDateTo || filterBranch || filterSupplier;

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

      {/* ── Overdue Delivery Exceptions Panel ── */}
      <div className={`overflow-hidden rounded-2xl border ${overdueRows.length > 0 ? "border-red-700/50 bg-red-950/8" : "border-white/8 bg-white/3"}`}>
        <button
          type="button"
          className="w-full px-5 py-3.5 flex items-center justify-between gap-3"
          onClick={() => setOverduePanelOpen((v) => !v)}
        >
          <div className="flex items-center gap-2.5">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${overdueRows.length > 0 ? "bg-red-500/15 border border-red-500/40" : "bg-zinc-700/30 border border-zinc-600/30"}`}>
              <PackageSearch className={`h-4 w-4 ${overdueRows.length > 0 ? "text-red-400" : "text-zinc-500"}`} />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-white flex items-center gap-2 flex-wrap">
                Delivery Exceptions
                {overdueRows.length > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 border border-red-500/50 px-2 py-0.5 text-[11px] font-bold text-red-300">
                    <TriangleAlert className="h-3 w-3" />
                    {overdueRows.length} OVERDUE
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                    All Clear
                  </span>
                )}
                {overdueLoading && <RefreshCw className="h-3 w-3 animate-spin text-zinc-500" />}
              </p>
              <p className="text-xs text-zinc-500">
                {overdueRows.length > 0
                  ? `Vendor POs not received past expected delivery date — production may be at risk`
                  : "No overdue vendor deliveries across all branches"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void loadOverdue(); }}
              className="rounded-lg p-1 text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            {overduePanelOpen
              ? <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" />
              : <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />}
          </div>
        </button>

        {overduePanelOpen && (
          <div className="border-t border-white/8 px-5 pb-4 pt-3">
            {overdueRows.length === 0 && !overdueLoading ? (
              <div className="flex items-center gap-2 py-3 text-sm text-zinc-500">
                <span className="text-emerald-400">✓</span>
                No overdue deliveries for {city === "dubai" ? "Dubai" : "Manila"}.
              </div>
            ) : (
              <div className="space-y-2">
                {overdueRows.map((row) => {
                  const isExp = overdueExpanded === row.id;
                  const items = Array.isArray(row.line_items_json) ? row.line_items_json : [];
                  return (
                    <div
                      key={row.id}
                      className={`rounded-xl border overflow-hidden transition-all duration-200 ${
                        isExp
                          ? "border-red-500/50 bg-red-950/12"
                          : "border-red-800/40 bg-red-950/8 hover:border-red-600/50"
                      }`}
                    >
                      <button
                        type="button"
                        className="w-full px-3 py-2.5 flex items-start justify-between gap-2 text-left"
                        onClick={() => setOverdueExpanded(isExp ? null : row.id)}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white font-mono flex items-center gap-2 flex-wrap">
                            {row.po_no}
                            <span className="inline-flex items-center gap-1 rounded-full border bg-red-900/40 border-red-600/60 text-red-300 px-2 py-0.5 text-[10px] font-bold">
                              <TriangleAlert className="h-3 w-3" />
                              {row.days_overdue}d OVERDUE
                            </span>
                            <span className="rounded-full border border-zinc-600/40 bg-zinc-800/30 px-2 py-0.5 text-[10px] text-zinc-400">
                              {row.store_code}
                            </span>
                          </p>
                          <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-zinc-500">
                            <span>{row.vendor_name}</span>
                            <span className="text-red-400 font-medium">Expected {row.expected_date}</span>
                            <span>{items.length} item{items.length !== 1 ? "s" : ""}</span>
                            <span className="capitalize">{row.city}</span>
                          </div>
                        </div>
                        <div className="shrink-0 pt-0.5">
                          {isExp
                            ? <ChevronUp className="h-3.5 w-3.5 text-red-400" />
                            : <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />}
                        </div>
                      </button>
                      {isExp && (
                        <div className="border-t border-white/8 px-3 py-3 space-y-3">
                          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                            <div>
                              <p className={T_CAPTION}>PR No.</p>
                              <p className="font-mono text-zinc-200">{row.request_no}</p>
                            </div>
                            <div>
                              <p className={T_CAPTION}>Branch</p>
                              <p className="text-zinc-200">{row.store_code}</p>
                            </div>
                            <div>
                              <p className={T_CAPTION}>Expected</p>
                              <p className="text-red-300 font-medium">{row.expected_date}</p>
                            </div>
                            <div>
                              <p className={T_CAPTION}>Days Overdue</p>
                              <p className="text-red-300 font-bold">{row.days_overdue}d</p>
                            </div>
                          </div>
                          {items.length > 0 && (
                            <div className="space-y-1">
                              <p className={`${T_CAPTION} mb-1`}>Items ordered</p>
                              {items.map((item, i) => (
                                <div key={i} className="flex items-center justify-between text-xs text-zinc-300">
                                  <span>{item.item_name}</span>
                                  <span className="text-zinc-500">{item.qty} {item.unit}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2 pt-1">
                            {row.case_id && (
                              <a
                                href={`/admin/procurement/cases/${row.case_id}`}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-zinc-300 hover:bg-white/10 transition-colors"
                              >
                                Open Case →
                              </a>
                            )}
                            <a
                              href={`/store/procurement/receiving?city=${encodeURIComponent(row.city || "manila")}&request_id=${encodeURIComponent(row.request_id)}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-600/40 bg-sky-950/20 px-2.5 py-1 text-xs text-sky-300 hover:bg-sky-950/35 transition-colors"
                            >
                              Record Receiving →
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
              <option value="direct_purchase">Direct Purchase</option>
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Branch</label>
            <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className={SELECT_CLASS}>
              <option value="">All branches</option>
              {city === "dubai" ? (
                <>
                  <option value="BB">Business Bay</option>
                  <option value="JLT">JLT</option>
                  {/* Arjan and Motor City are the same physical branch — one option.
                      Backend ARJ alias also matches legacy "M City"/"Motor City" data. */}
                  <option value="ARJ">Arjan</option>
                  <option value="AM">Al Mina</option>
                  <option value="AB">Al Barsha</option>
                  <option value="CK">Central Kitchen</option>
                  <option value="SH">Sharjah</option>
                </>
              ) : (
                <>
                  <option value="PAR">Parañaque</option>
                  <option value="TAFT">Taft</option>
                  <option value="CUBAO">Cubao</option>
                  <option value="CK">Central Kitchen</option>
                  <option value="WH">Warehouse</option>
                </>
              )}
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Supplier</label>
            <input
              type="text"
              value={filterSupplier}
              onChange={(e) => setFilterSupplier(e.target.value)}
              placeholder="Supplier name…"
              className={INPUT_CLASS}
            />
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
      <div className="flex flex-wrap items-center gap-2">
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
        <button
          type="button"
          onClick={() => setFilterDailyInvOnly((v) => !v)}
          className={[
            "rounded-xl border px-3 py-1.5 text-sm font-medium transition-all",
            filterDailyInvOnly
              ? "border-teal-500/60 bg-teal-500/15 text-teal-200"
              : "border-teal-600/25 bg-teal-950/10 text-teal-500",
          ].join(" ")}
        >
          📦 Daily Inv Only
        </button>
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
      {/* detailTick is used to force re-render after async cache update: {detailTick} */}
      <div className="space-y-2">
        {displayRows.map((row) => {
          const action = rowAction(row);
          const currCode = String(row.city || city).toLowerCase() === "dubai" ? "AED" : "PHP";
          const isExpanded = expandedId === row.id;
          const detail = detailCache.current[row.id];

          return (
            <div
              key={row.id}
              className={`rounded-2xl border transition-all ${rowHighlight(row)}`}
            >
              {/* ── Summary row ── */}
              <div
                className="flex cursor-pointer select-none flex-col gap-3 p-4 lg:flex-row lg:items-center lg:gap-4"
                onClick={() => void toggleExpand(row.id)}
              >
                {/* Expand chevron */}
                <div className="shrink-0 text-zinc-500">
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4 text-violet-400" />
                    : <ChevronRight className="h-4 w-4" />}
                </div>

                {/* Left — identifiers + badges */}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-white">
                      {row.request_no || row.id.substring(0, 8)}
                    </span>
                    {/* Copy Request ID button */}
                    <button
                      type="button"
                      title="Copy Request ID"
                      onClick={(e) => {
                        e.stopPropagation();
                        const id = row.request_no || row.id;
                        void navigator.clipboard.writeText(id).then(() => {
                          setCopiedId(id);
                          setTimeout(() => setCopiedId(""), 2000);
                        });
                      }}
                      className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-500 transition hover:border-white/20 hover:text-zinc-300"
                    >
                      {copiedId === (row.request_no || row.id)
                        ? <><Check className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Copied</span></>
                        : <><Copy className="h-3 w-3" />Copy</>
                      }
                    </button>
                    {purchaseTypeBadge(row.purchase_type)}
                    {requestStatusBadge(row.request_status)}
                    {caseStatusBadge(row.case_status)}
                    {row.urgent_flag && (
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${BADGE_ERROR}`}>⚡ Urgent</span>
                    )}
                    {parseDailyInvRef(row.source_ref) && (
                      <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-2 py-0.5 text-[11px] font-medium text-teal-300">
                        📦 Daily Inv
                      </span>
                    )}
                  </div>

                  {/* Meta row */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                    <span>By <span className="text-zinc-200">{row.requested_by || "—"}</span></span>
                    <span>Store <span className="text-zinc-200">{row.store_code || "—"}</span></span>
                    <span>Date <span className="text-zinc-200">{fmt(row.request_date)}</span></span>
                    {row.created_at && (
                      <span>Created <span className="text-zinc-200">{fmt(row.created_at)}</span></span>
                    )}
                    <span>
                      Amount{" "}
                      <span className="font-semibold text-zinc-200">
                        {Number(row.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currCode}
                      </span>
                    </span>
                    {row.vendor_summary && (
                      <span>Supplier <span className="text-amber-200">{row.vendor_summary}</span></span>
                    )}
                    {row.current_assignee_role && (
                      <span>Assignee <span className="text-zinc-300">{row.current_assignee_role}</span></span>
                    )}
                    {row.claimed_by && (
                      <span>Claimed by <span className="text-zinc-300">{row.claimed_by}</span></span>
                    )}
                    {(() => {
                      const inv = parseDailyInvRef(row.source_ref);
                      if (!inv) return null;
                      return (
                        <span className="text-teal-400/80">
                          Auto-generated from Daily Inventory · {inv.branch} · {inv.date}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Assign Supplier warning for Daily Inv DRAFTs with no vendor yet */}
                  {parseDailyInvRef(row.source_ref) &&
                    (row.request_status || "").toUpperCase() === "DRAFT" &&
                    !row.vendor_summary && (
                    <p className="text-xs text-amber-300 flex items-center gap-1.5">
                      <span>⚠</span>
                      Supplier not yet assigned — please edit this order and select a supplier before submitting.
                    </p>
                  )}

                  {/* Blocked / hold reason */}
                  {(row.blocked_reason || row.payment_hold_reason) && (
                    <p className="text-xs text-amber-300 flex items-center gap-1">
                      <span>⚠</span>
                      {row.blocked_reason || row.payment_hold_reason}
                    </p>
                  )}
                </div>

                {/* Right — action (stop propagation so click doesn't toggle expand) */}
                <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
                        href={`/admin/procurement/cases/${row.case_id}?from=hub`}
                        className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition"
                      >
                        View →
                      </Link>
                    )
                  )}
                </div>
              </div>

              {/* ── Expanded detail panel ── */}
              {isExpanded && (
                <div className="border-t border-white/8 px-4 pb-4 pt-3">
                  {detail?.loading && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading items…
                    </div>
                  )}

                  {detail && !detail.loading && (
                    <div className="space-y-4">
                      {/* HQ approval required banner — shown to non-HQ users when WH order is pending HQ sign-off */}
                      {row.current_assignee_role === "HQ" &&
                        row.case_status !== "APPROVED" &&
                        !["HQ", "ADMIN"].includes((auth?.role || "").toUpperCase()) && (
                        <div className="flex items-start gap-2 rounded-xl border border-violet-500/30 bg-violet-950/20 px-3 py-2 text-xs text-violet-300">
                          <span className="mt-0.5 shrink-0">🔒</span>
                          <span>
                            <span className="font-semibold">HQ approval required</span> — this WH order
                            is pending HQ review. It cannot be approved without HQ sign-off.
                          </span>
                        </div>
                      )}

                      {/* WH stock alert banner */}
                      {city === "manila" && whStockMap.size > 0 && (() => {
                        const lowItems = detail.items.filter((item) => {
                          const wh = lookupWhStock(item.item_name, whStockMap);
                          return wh !== null && wh.theoretical_qty < Number(item.qty || 0);
                        });
                        if (!lowItems.length) return null;
                        return (
                          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-300">
                            <span className="mt-0.5 shrink-0">⚠</span>
                            <span>
                              <span className="font-semibold">WH stock insufficient</span> for{" "}
                              {lowItems.map((i) => i.item_name).join(", ")}.
                              Verify before approving.
                            </span>
                          </div>
                        );
                      })()}

                      {/* Items table */}
                      {detail.items.length > 0 ? (
                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                              Items ({detail.items.length})
                            </span>
                            {city === "manila" && whStockMap.size > 0 && (
                              <span className="text-[11px] text-sky-500/70">
                                📦 WH Stock column shows theoretical qty (last count + adjustments)
                              </span>
                            )}
                          </div>
                          <div className="overflow-x-auto rounded-xl border border-white/8">
                            <table className="min-w-full text-xs">
                              <thead className="bg-black/30 text-zinc-400">
                                <tr>
                                  <th className="px-3 py-2 text-left font-medium">Item</th>
                                  <th className="px-3 py-2 text-left font-medium">Supplier</th>
                                  <th className="px-3 py-2 text-right font-medium">Ordered</th>
                                  {city === "manila" && whStockMap.size > 0 && (
                                    <th className="px-3 py-2 text-right font-medium text-sky-400">WH Stock</th>
                                  )}
                                  <th className="px-3 py-2 text-left font-medium">Unit</th>
                                  <th className="px-3 py-2 text-right font-medium">Unit Price</th>
                                  <th className="px-3 py-2 text-right font-medium">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.items.map((item, idx) => {
                                  const whItem = city === "manila" ? lookupWhStock(item.item_name, whStockMap) : null;
                                  const whQty = whItem ? whItem.theoretical_qty : null;
                                  const orderQty = Number(item.qty || 0);
                                  const stockChip =
                                    whQty === null
                                      ? <span className="text-zinc-600">—</span>
                                      : whQty >= orderQty
                                        ? <span className="font-semibold text-emerald-400">{whQty.toFixed(1)} ✓</span>
                                        : whQty > 0
                                          ? <span className="font-semibold text-amber-400">{whQty.toFixed(1)} ⚠</span>
                                          : <span className="font-semibold text-red-400">0 ✕</span>;

                                  return (
                                    <tr key={item.id || idx} className={`border-t border-white/6 bg-black/10 ${whQty !== null && whQty < orderQty ? "bg-amber-950/10" : ""}`}>
                                      <td className="px-3 py-2 text-zinc-100">{item.item_name}</td>
                                      <td className="px-3 py-2 text-zinc-400">{item.vendor_name || "—"}</td>
                                      <td className="px-3 py-2 text-right text-zinc-200">{item.qty}</td>
                                      {city === "manila" && whStockMap.size > 0 && (
                                        <td className="px-3 py-2 text-right">{stockChip}</td>
                                      )}
                                      <td className="px-3 py-2 text-zinc-400">{item.unit}</td>
                                      <td className="px-3 py-2 text-right text-zinc-200">
                                        {Number(item.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold text-zinc-100">
                                        {Number(item.line_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500 py-1">No items recorded.</p>
                      )}

                      {/* Receipt photo */}
                      {detail.receipt_url && (
                        <div>
                          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                            <ImageIcon className="h-3 w-3" /> Receipt / Document
                          </div>
                          <a
                            href={detail.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-950/35 transition"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ImageIcon className="h-3.5 w-3.5" />
                            View Receipt →
                          </a>
                          {/* Inline preview if it looks like an image URL */}
                          {/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(detail.receipt_url) && (
                            <div className="mt-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={detail.receipt_url}
                                alt="Receipt"
                                className="max-h-48 rounded-xl border border-white/10 object-contain"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
