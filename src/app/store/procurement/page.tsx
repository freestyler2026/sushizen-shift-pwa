"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingCart,
  History,
  PackageCheck,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  MapPin,
  Building2,
  ClipboardList,
  CheckCircle2,
  Clock,
  RotateCcw,
} from "lucide-react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES } from "@/lib/branches";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import { formatRelativeAge, getRecentBadgeMaxAgeMs, isOlderThan, parseIsoTimeMs, useRelativeAgeNow } from "@/lib/timeAgo";
import {
  GLASS_CARD,
  STATUS_CARD,
  SMALL_BUTTON,
  DANGER_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_CARD_TITLE,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  DIVIDER,
} from "@/lib/ui-tokens";

type RequestRow = {
  id: string;
  request_no: string;
  store_code: string;
  request_date: string;
  total_amount: number;
  status: string;
  current_approval_level: number;
};

type RecentActivityItem = {
  kind: "request" | "receiving" | "claim";
  id: string;
  label: string;
  at: string;
  requestId?: string;
  caseId?: string;
};

type TimelineAction = {
  label: string;
  href: string;
};


export default function StoreProcurementHomePage() {
  const PAGE_BG = "min-h-screen text-white";
  const BLUSH_GLASS = `${GLASS_CARD} bg-violet-950/30`;
  const BLUSH_PRIMARY =
    "rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-5 py-2.5 font-semibold text-white transition-all duration-200 shadow-lg shadow-violet-500/25 hover:scale-[1.02] hover:from-violet-400 hover:to-purple-400 hover:shadow-violet-500/40 active:scale-[0.98] disabled:opacity-60";
  const BLUSH_SECONDARY =
    "rounded-xl border border-violet-400/15 bg-violet-950/30 px-5 py-2.5 text-white transition-all duration-200 hover:border-violet-500/25 hover:bg-violet-950/45 disabled:opacity-60";
  const BLUSH_SMALL = `${SMALL_BUTTON} bg-violet-950/30 hover:bg-violet-950/45`;

  const router = useRouter();
  const LAST_CREATED_REQUEST_KEY = "store_procurement_last_created_request";
  const LAST_CREATED_RECEIVING_KEY = "store_procurement_last_created_receiving";
  const LAST_CREATED_CLAIM_KEY = "store_procurement_last_created_claim";
  const RECENT_ACTIVITY_EXPANDED_KEY = "store_procurement_recent_activity_expanded";
  const RECENT_ACTIVITY_ACTIONS_EXPANDED_KEY = "store_procurement_recent_activity_actions_expanded";
  const LAST_CREATED_MAX_AGE_MS = getRecentBadgeMaxAgeMs();
  const relativeNowMs = useRelativeAgeNow();
  const auth = useMemo(() => getAuth(), []);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [city, setCity] = useState((auth?.city || "manila").toLowerCase());
  const [storeCode, setStoreCode] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("store_proc_branch") || "";
    return "";
  });
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [lastCreatedRequestId, setLastCreatedRequestId] = useState("");
  const [lastCreatedRequestNo, setLastCreatedRequestNo] = useState("");
  const [lastCreatedRequestAt, setLastCreatedRequestAt] = useState("");
  const [lastCreatedReceivingId, setLastCreatedReceivingId] = useState("");
  const [lastCreatedReceivingNo, setLastCreatedReceivingNo] = useState("");
  const [lastCreatedReceivingRequestId, setLastCreatedReceivingRequestId] = useState("");
  const [lastCreatedReceivingAt, setLastCreatedReceivingAt] = useState("");
  const [lastCreatedClaimId, setLastCreatedClaimId] = useState("");
  const [lastCreatedClaimNo, setLastCreatedClaimNo] = useState("");
  const [lastCreatedClaimCaseId, setLastCreatedClaimCaseId] = useState("");
  const [lastCreatedClaimRequestId, setLastCreatedClaimRequestId] = useState("");
  const [lastCreatedClaimAt, setLastCreatedClaimAt] = useState("");
  const [showAllRecentActivities, setShowAllRecentActivities] = useState(false);
  const [expandedActionsByItem, setExpandedActionsByItem] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [canOpenAdminCase, setCanOpenAdminCase] = useState(false);
  const initRef = useRef(false);
  const cityLabel = city === "dubai" ? "Dubai" : "Manila";
  const currencyCode = city === "dubai" ? "AED" : "PHP";

  const loadMyRequests = useCallback(async (cityOverride?: string) => {
    setLoading(true);
    setError("");
    try {
      const activeCity = String(cityOverride || city || "manila").trim().toLowerCase() || "manila";
      const qs = new URLSearchParams({
        city: activeCity,
        requested_by: requestedBy.trim(),
        limit: "200",
      });
      const data = await procurementJson<{ rows: RequestRow[] }>(
        `/api/admin/procurement/requests?${qs.toString()}`,
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
  }, [city, pin, requestedBy]);


  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      if (!(refreshed?.staffName || auth?.staffName) || !(refreshed?.accessToken || auth?.accessToken)) {
        router.replace("/login?next=%2Fstore%2Fprocurement");
        return;
      }
      let queryCity = "";
      if (typeof window !== "undefined") {
        queryCity = String(new URLSearchParams(window.location.search).get("city") || "").toLowerCase();
      }
      const initialCity = queryCity || city || String(refreshed?.city || auth?.city || "manila").toLowerCase() || "manila";
      setCanOpenAdminCase(canAccessProcurementAdmin(String((refreshed || auth)?.role || ""), initialCity === "dubai" ? "dubai" : "manila"));
      setCity(initialCity);
      if ((refreshed?.staffName || "").trim() && !requestedBy.trim()) {
        setRequestedBy(String(refreshed?.staffName || "").trim());
      }
      await loadMyRequests(initialCity);
    }
    void init();
  }, [auth, city, loadMyRequests, requestedBy, router]);


  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const timelineFromQuery = String(sp.get("timeline") || "").toLowerCase();
      if (timelineFromQuery === "open") {
        setShowAllRecentActivities(true);
        return;
      }
      if (timelineFromQuery === "closed") {
        setShowAllRecentActivities(false);
        return;
      }
      const saved = window.localStorage.getItem(RECENT_ACTIVITY_EXPANDED_KEY);
      if (!saved) return;
      setShowAllRecentActivities(saved === "1");
    } catch {}
  }, [RECENT_ACTIVITY_EXPANDED_KEY]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(RECENT_ACTIVITY_EXPANDED_KEY, showAllRecentActivities ? "1" : "0");
    } catch {}
  }, [RECENT_ACTIVITY_EXPANDED_KEY, showAllRecentActivities]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (showAllRecentActivities) {
        url.searchParams.set("timeline", "open");
      } else if (String(url.searchParams.get("timeline") || "").toLowerCase() === "open") {
        url.searchParams.delete("timeline");
      }
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {}
  }, [showAllRecentActivities]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LAST_CREATED_REQUEST_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id?: string; request_no?: string; at?: string };
      const id = String(parsed?.id || "").trim();
      const requestNo = String(parsed?.request_no || "").trim();
      const at = String(parsed?.at || "").trim();
      if (at && isOlderThan(at, LAST_CREATED_MAX_AGE_MS, relativeNowMs)) {
        window.localStorage.removeItem(LAST_CREATED_REQUEST_KEY);
        return;
      }
      if (id) {
        setLastCreatedRequestId(id);
        setLastCreatedRequestNo(requestNo);
        setLastCreatedRequestAt(at);
      }
    } catch {}
  }, [LAST_CREATED_MAX_AGE_MS, LAST_CREATED_REQUEST_KEY, relativeNowMs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LAST_CREATED_RECEIVING_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id?: string; receiving_no?: string; request_id?: string; at?: string };
      const id = String(parsed?.id || "").trim();
      const receivingNo = String(parsed?.receiving_no || "").trim();
      const requestId = String(parsed?.request_id || "").trim();
      const at = String(parsed?.at || "").trim();
      if (at && isOlderThan(at, LAST_CREATED_MAX_AGE_MS, relativeNowMs)) {
        window.localStorage.removeItem(LAST_CREATED_RECEIVING_KEY);
        return;
      }
      if (id) {
        setLastCreatedReceivingId(id);
        setLastCreatedReceivingNo(receivingNo);
        setLastCreatedReceivingRequestId(requestId);
        setLastCreatedReceivingAt(at);
      }
    } catch {}
  }, [LAST_CREATED_MAX_AGE_MS, LAST_CREATED_RECEIVING_KEY, relativeNowMs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LAST_CREATED_CLAIM_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id?: string; claim_no?: string; case_id?: string; request_id?: string; at?: string };
      const id = String(parsed?.id || "").trim();
      const claimNo = String(parsed?.claim_no || "").trim();
      const caseId = String(parsed?.case_id || "").trim();
      const requestId = String(parsed?.request_id || "").trim();
      const at = String(parsed?.at || "").trim();
      if (at && isOlderThan(at, LAST_CREATED_MAX_AGE_MS, relativeNowMs)) {
        window.localStorage.removeItem(LAST_CREATED_CLAIM_KEY);
        return;
      }
      if (id) {
        setLastCreatedClaimId(id);
        setLastCreatedClaimNo(claimNo);
        setLastCreatedClaimCaseId(caseId);
        setLastCreatedClaimRequestId(requestId);
        setLastCreatedClaimAt(at);
      }
    } catch {}
  }, [LAST_CREATED_CLAIM_KEY, LAST_CREATED_MAX_AGE_MS, relativeNowMs]);

  const counts = useMemo(() => {
    const out = {
      total: rows.length,
      draft: 0,
      inReview: 0,
      approved: 0,
      returned: 0,
    };
    for (const row of rows) {
      const st = String(row.status || "").toUpperCase();
      if (st === "DRAFT") out.draft += 1;
      else if (st === "IN_REVIEW" || st === "SUBMITTED") out.inReview += 1;
      else if (st === "APPROVED") out.approved += 1;
      else if (st === "RETURNED") out.returned += 1;
    }
    return out;
  }, [rows]);

  const recentActivities = useMemo<RecentActivityItem[]>(() => {
    const items: RecentActivityItem[] = [];
    if (lastCreatedRequestId) {
      items.push({
        kind: "request",
        id: lastCreatedRequestId,
        label: lastCreatedRequestNo || lastCreatedRequestId,
        at: lastCreatedRequestAt,
        requestId: lastCreatedRequestId,
      });
    }
    if (lastCreatedReceivingId) {
      items.push({
        kind: "receiving",
        id: lastCreatedReceivingId,
        label: lastCreatedReceivingNo || lastCreatedReceivingId,
        at: lastCreatedReceivingAt,
        requestId: lastCreatedReceivingRequestId,
      });
    }
    if (lastCreatedClaimId) {
      items.push({
        kind: "claim",
        id: lastCreatedClaimId,
        label: lastCreatedClaimNo || lastCreatedClaimId,
        at: lastCreatedClaimAt,
        requestId: lastCreatedClaimRequestId,
        caseId: lastCreatedClaimCaseId,
      });
    }
    return items.sort((a, b) => (parseIsoTimeMs(b.at) || 0) - (parseIsoTimeMs(a.at) || 0));
  }, [
    lastCreatedClaimAt,
    lastCreatedClaimCaseId,
    lastCreatedClaimId,
    lastCreatedClaimNo,
    lastCreatedClaimRequestId,
    lastCreatedReceivingAt,
    lastCreatedReceivingId,
    lastCreatedReceivingNo,
    lastCreatedReceivingRequestId,
    lastCreatedRequestAt,
    lastCreatedRequestId,
    lastCreatedRequestNo,
  ]);
  const visibleRecentActivities = useMemo(
    () => (showAllRecentActivities ? recentActivities : recentActivities.slice(0, 3)),
    [recentActivities, showAllRecentActivities],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(RECENT_ACTIVITY_ACTIONS_EXPANDED_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Record<string, boolean>;
      if (parsed && typeof parsed === "object") {
        setExpandedActionsByItem(parsed);
      }
    } catch {}
  }, [RECENT_ACTIVITY_ACTIONS_EXPANDED_KEY]);

  useEffect(() => {
    const activeKeys = new Set(recentActivities.map((item) => `${item.kind}:${item.id}`));
    setExpandedActionsByItem((prev) => {
      const next: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (activeKeys.has(key)) next[key] = Boolean(value);
      }
      return next;
    });
  }, [recentActivities]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        RECENT_ACTIVITY_ACTIONS_EXPANDED_KEY,
        JSON.stringify(expandedActionsByItem),
      );
    } catch {}
  }, [RECENT_ACTIVITY_ACTIONS_EXPANDED_KEY, expandedActionsByItem]);

  return (
    <div className={PAGE_BG}>
      <motion.div
        className="mx-auto max-w-6xl space-y-6 px-4 py-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Store Procurement</h1>
          <p className={T_BODY}>Central entry point for store request, receiving, and claim operations.</p>
        </div>
        <span className={BADGE_INFO}>
          <MapPin className="h-3 w-3" />
          {cityLabel}
        </span>
      </div>

      {/* Branch selector */}
      <div className={`${BLUSH_GLASS} p-4`}>
        <div className="mb-2 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold text-white">Select Your Branch</span>
          {storeCode ? (
            <span className="rounded-full bg-violet-500/20 px-2.5 py-0.5 text-xs font-semibold text-violet-300">
              ✓ {BRANCHES[city as "dubai" | "manila"]?.find((b) => b.code === storeCode)?.name || storeCode}
            </span>
          ) : (
            <span className="text-xs text-amber-400">⚠ Please select your branch</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {(BRANCHES[city as "dubai" | "manila"] || [])
            .filter((b) => b.code !== "CK" && b.code !== "DRIVER")
            .map((branch) => {
              const active = storeCode === branch.code;
              return (
                <button
                  key={branch.code}
                  type="button"
                  onClick={() => {
                    setStoreCode(branch.code);
                    if (typeof window !== "undefined") localStorage.setItem("store_proc_branch", branch.code);
                  }}
                  className={[
                    "rounded-xl border px-4 py-2 text-sm font-semibold transition-all duration-200",
                    active
                      ? "bg-violet-500/25 text-violet-100 border-violet-500/50 shadow-sm"
                      : "bg-violet-950/30 text-violet-400 border-violet-800/40 hover:bg-violet-900/40 hover:text-violet-200",
                  ].join(" ")}
                >
                  {branch.name}
                </button>
              );
            })}
        </div>
      </div>

      {error ? <div className="text-sm text-red-300">{error}</div> : null}
      {recentActivities.length ? (
        <div className={`${BLUSH_GLASS} px-4 py-3 text-xs text-neutral-200`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className={T_CARD_TITLE}>Recent Activity Timeline</div>
            <span className={T_CAPTION}>{recentActivities.length} items</span>
          </div>
          {recentActivities.length > 3 ? (
            <div className="mb-2">
              <button
                type="button"
                onClick={() => setShowAllRecentActivities((prev) => !prev)}
                className={BLUSH_SMALL}
              >
                {showAllRecentActivities ? "Show less" : `View all (${recentActivities.length})`}
              </button>
            </div>
          ) : null}
          <div className="space-y-2">
            {visibleRecentActivities.map((item) => (
              <div key={`${item.kind}:${item.id}`} className={`${STATUS_CARD} bg-violet-950/25 p-3`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] ${
                      item.kind === "request"
                        ? "border-emerald-700/60 bg-emerald-900/30 text-emerald-200"
                        : item.kind === "receiving"
                          ? "border-cyan-700/60 bg-cyan-900/30 text-cyan-200"
                          : "border-violet-700/60 bg-violet-900/30 text-violet-200"
                    }`}
                  >
                    {item.kind === "request" ? "Request" : item.kind === "receiving" ? "Receiving" : "Claim"}
                  </span>
                  <span className="font-mono">{item.label}</span>
                  {item.at ? <span className="text-[11px] text-neutral-400">({formatRelativeAge(item.at, relativeNowMs)})</span> : null}
                </div>
                {(() => {
                  const activityKey = `${item.kind}:${item.id}`;
                  const isExpanded = Boolean(expandedActionsByItem[activityKey]);
                  const actions: TimelineAction[] =
                    item.kind === "request" && item.requestId
                      ? [
                          {
                            label: "Continue to Receiving",
                            href: `/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(item.requestId)}`,
                          },
                          {
                            label: "Continue to Claim",
                            href: `/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(item.requestId)}`,
                          },
                        ]
                      : item.kind === "receiving" && item.requestId
                        ? [
                            {
                              label: "Open Receiving",
                              href: `/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(item.requestId)}`,
                            },
                            {
                              label: "Continue to Claim",
                              href: `/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(item.requestId)}&receiving_id=${encodeURIComponent(item.id)}`,
                            },
                          ]
                        : item.kind === "claim" && item.requestId
                          ? [
                              {
                                label: "Open Claim",
                                href: `/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(item.requestId)}`,
                              },
                              ...(item.caseId && canOpenAdminCase
                                ? [
                                    {
                                      label: "Open Case",
                                      href: `/admin/procurement/cases/${item.caseId}`,
                                    } satisfies TimelineAction,
                                  ]
                                : []),
                            ]
                          : [];
                  const hasMoreActions = actions.length > 2;
                  const visibleActions = isExpanded ? actions : actions.slice(0, 2);
                  return (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {visibleActions.map((action) => (
                        <Link
                          key={`${action.label}:${action.href}`}
                          href={action.href}
                          className={BLUSH_SMALL}
                        >
                          {action.label}
                        </Link>
                      ))}
                      {hasMoreActions ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedActionsByItem((prev) => ({
                              ...prev,
                              [activityKey]: !isExpanded,
                            }))
                          }
                          className={BLUSH_SMALL}
                        >
                          {isExpanded ? "Less" : `More (${actions.length - 2})`}
                        </button>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className={`${BLUSH_GLASS} p-5 flex items-center justify-between`}>
        <div>
          <h2 className={T_SECTION}>New Request</h2>
          <p className={T_CAPTION}>Create a new procurement request</p>
        </div>
        <Link
          href={`/store/procurement/request?city=${encodeURIComponent(city || "manila")}${storeCode ? `&store_code=${encodeURIComponent(storeCode)}` : ""}`}
          className={[BLUSH_PRIMARY, !storeCode ? "opacity-60 cursor-not-allowed pointer-events-none" : ""].join(" ")}
          aria-disabled={!storeCode}
        >
          <span className="flex items-center gap-2">
            {storeCode ? "New Request" : "Select Branch First"}
            <ChevronRight className="h-4 w-4" />
          </span>
        </Link>
      </div>

      <div className={`${BLUSH_GLASS} p-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[160px] flex-1">
            <label className={`${T_LABEL} mb-1.5 block`}>Approver Name</label>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`} readOnly />
          </div>
          <div className="min-w-[140px] flex-1">
            <label className={`${T_LABEL} mb-1.5 block`}>Session PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`} />
          </div>
          <div className="min-w-[140px]">
            <label className={`${T_LABEL} mb-1.5 flex items-center gap-1.5`}>
              <Building2 className="h-3 w-3" />
              City
            </label>
            <select
              value={city}
              onChange={(e) => {
                const nextCity = String(e.target.value || "manila").toLowerCase();
                setCity(nextCity);
                void loadMyRequests(nextCity);
              }}
              className={`${SELECT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
            >
              <option value="manila">Manila</option>
              <option value="dubai">Dubai</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => void loadMyRequests()} disabled={loading} className={BLUSH_SECONDARY}>
              <span className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                {loading ? "Loading..." : "Refresh"}
              </span>
            </button>
            <span className={T_CAPTION}>
              Total: <span className="font-semibold text-white">{counts.total}</span> requests
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <div className={KPI_CARD}>
          <div className="mb-2 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-zinc-400" />
            <p className={KPI_LABEL}>Draft</p>
          </div>
          <p className={`${KPI_VALUE} text-zinc-200`}>{counts.draft}</p>
        </div>
        <div className={KPI_CARD}>
          <div className="mb-2 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-400" />
            <p className={KPI_LABEL}>In Review</p>
          </div>
          <p className={`${KPI_VALUE} ${counts.inReview > 0 ? "text-amber-400" : "text-zinc-500"}`}>{counts.inReview}</p>
        </div>
        <div className={KPI_CARD}>
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <p className={KPI_LABEL}>Approved</p>
          </div>
          <p className={`${KPI_VALUE} ${counts.approved > 0 ? "text-emerald-400" : "text-zinc-500"}`}>{counts.approved}</p>
        </div>
        <div className={KPI_CARD}>
          <div className="mb-2 flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-red-400" />
            <p className={KPI_LABEL}>Returned</p>
          </div>
          <p className={`${KPI_VALUE} ${counts.returned > 0 ? "text-red-400" : "text-zinc-500"}`}>{counts.returned}</p>
        </div>
        <div className={`col-span-2 ${STATUS_CARD} bg-violet-950/25 p-4 md:col-span-1`}>
          <p className={`${KPI_LABEL} mb-3`}>Quick Actions</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-2">
            <Link href={`/store/procurement/request?city=${encodeURIComponent(city || "manila")}`} className={`${BLUSH_SMALL} min-h-10 justify-center`}>
              <span className="flex items-center justify-center gap-1.5 text-center">
                <ShoppingCart className="h-3 w-3" /> Request
              </span>
            </Link>
            <Link href={`/store/procurement?city=${encodeURIComponent(city || "manila")}#history`} className={`${BLUSH_SMALL} min-h-10 justify-center`}>
              <span className="flex items-center justify-center gap-1.5 text-center">
                <History className="h-3 w-3" /> History
              </span>
            </Link>
            <Link href={`/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}`} className={`${BLUSH_SMALL} min-h-10 justify-center`}>
              <span className="flex items-center justify-center gap-1.5 text-center">
                <PackageCheck className="h-3 w-3" /> Receiving
              </span>
            </Link>
            <Link href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}`} className={`${DANGER_BUTTON} min-h-10 justify-center`}>
              <span className="flex items-center justify-center gap-1.5 text-center">
                <AlertCircle className="h-3 w-3" /> Claim
              </span>
            </Link>
          </div>
        </div>
      </div>

      <div id="history" className={DIVIDER} />

      <div className={`${BLUSH_GLASS} p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className={T_SECTION}>My Recent Requests ({cityLabel})</h2>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <ShoppingCart className="h-8 w-8 text-zinc-600" />
            <p className={T_CAPTION}>No requests yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className={`rounded-xl border px-4 py-3 transition-all duration-150 hover:border-white/15 hover:bg-white/8 ${
                row.id === lastCreatedRequestId
                  ? "border-emerald-700/60 bg-emerald-900/20"
                  : "border-white/8 bg-white/4"
              }`}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-base font-semibold leading-tight text-white">{row.request_no}</p>
                  <div className="mt-2 grid gap-1 text-xs text-zinc-400 sm:grid-cols-3">
                    <span>{row.store_code || "-"}</span>
                    <span>{row.request_date || "-"}</span>
                    <span>{Number(row.total_amount || 0).toFixed(2)} {currencyCode}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 md:items-end">
                  <div className="flex flex-wrap gap-2">
                    {String(row.status || "").toUpperCase() === "DRAFT" ? (
                      <span className={BADGE_WARNING}>DRAFT | Level {row.current_approval_level || 0}</span>
                    ) : null}
                    {String(row.status || "").toUpperCase() === "APPROVED" ? <span className={BADGE_SUCCESS}>APPROVED</span> : null}
                    {String(row.status || "").toUpperCase() === "RETURNED" ? <span className={BADGE_ERROR}>RETURNED</span> : null}
                    {(String(row.status || "").toUpperCase() === "IN_REVIEW" || String(row.status || "").toUpperCase() === "SUBMITTED") ? <span className={BADGE_INFO}>IN REVIEW</span> : null}
                    {row.id === lastCreatedRequestId ? (
                      <span className={BADGE_SUCCESS}>
                        Just created
                      </span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    <Link href={`/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(row.id)}`} className={`${SMALL_BUTTON} justify-center`}>
                      Receiving
                    </Link>
                    <Link href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(row.id)}`} className={`${DANGER_BUTTON} justify-center`}>
                      Claim
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}
          </div>
        )}
      </div>
      </motion.div>
    </div>
  );
}
