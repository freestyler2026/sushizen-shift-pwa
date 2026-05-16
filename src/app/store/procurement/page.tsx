"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
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
  X,
  Package,
  FileText,
  User,
  CalendarDays,
  Hash,
  PlusCircle,
} from "lucide-react";
import { ProcurementStepper } from "@/components/ProcurementStepper";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES } from "@/lib/branches";
import { defaultProcurementName, defaultProcurementPin, friendlyProcurementError, procurementJson } from "@/lib/procurementClient";
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

type RequestItem = {
  id: string;
  item_name: string;
  category: string;
  spec: string;
  qty: number;
  unit: string;
  unit_price: number;
  line_total: number;
  vendor_name: string;
  needed_by_date: string;
};

type RequestDetail = {
  id: string;
  request_no: string;
  store_code: string;
  request_date: string;
  total_amount: number;
  status: string;
  current_approval_level: number;
  currency: string;
  requested_by: string;
  urgent_flag: boolean;
  notes: string;
  items: RequestItem[];
  receivings?: { id: string; receiving_no: string; status: string }[];
  claims?: { id: string; claim_no: string; status: string }[];
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


function RequestDetailDrawer({
  requestId,
  city,
  requestedBy,
  pin,
  currencyCode,
  onClose,
  onSubmitSuccess,
}: {
  requestId: string;
  city: string;
  requestedBy: string;
  pin: string;
  currencyCode: string;
  onClose: () => void;
  onSubmitSuccess?: (requestNo: string) => void;
}) {
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);

  const handleSubmitForApproval = async () => {
    setSubmitBusy(true);
    setError("");
    try {
      await procurementJson(
        "/api/admin/procurement/requests/submit",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: requestId,
            approver_name: requestedBy.trim(),
            pin: pin.trim(),
          }),
        },
        requestedBy,
        pin,
      );
      onSubmitSuccess?.(detail?.request_no || requestId);
    } catch (e: unknown) {
      setError(friendlyProcurementError(e));
      setSubmitBusy(false);
      setSubmitConfirm(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setError("");
    setDetail(null);
    procurementJson<{ ok: boolean; request: RequestDetail }>(
      `/api/admin/procurement/requests/${encodeURIComponent(requestId)}`,
      { method: "GET" },
      requestedBy,
      pin,
    )
      .then((data) => {
        setDetail(data?.request ?? null);
      })
      .catch((e: unknown) => {
        setError(friendlyProcurementError(e));
      })
      .finally(() => setLoading(false));
  }, [requestId, requestedBy, pin]);

  const statusBadge = (status: string) => {
    const s = String(status || "").toUpperCase();
    if (s === "APPROVED") return <span className="rounded-full bg-emerald-900/40 border border-emerald-700/50 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">APPROVED</span>;
    if (s === "RETURNED") return <span className="rounded-full bg-red-900/40 border border-red-700/50 px-2.5 py-0.5 text-xs font-semibold text-red-300">RETURNED</span>;
    if (s === "IN_REVIEW" || s === "SUBMITTED") return <span className="rounded-full bg-blue-900/40 border border-blue-700/50 px-2.5 py-0.5 text-xs font-semibold text-blue-300">IN REVIEW</span>;
    if (s === "DRAFT") return <span className="rounded-full bg-amber-900/40 border border-amber-700/50 px-2.5 py-0.5 text-xs font-semibold text-amber-300">DRAFT</span>;
    return <span className="rounded-full bg-zinc-800 border border-zinc-700 px-2.5 py-0.5 text-xs text-zinc-400">{status}</span>;
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      {/* Drawer */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[210] flex max-h-[90vh] flex-col rounded-t-2xl border-t border-white/10 bg-[#0f0f1a] shadow-2xl md:bottom-auto md:right-0 md:top-0 md:w-[480px] md:max-h-screen md:rounded-none md:rounded-l-2xl md:border-l md:border-t-0"
        initial={{ y: "100%", x: 0 }}
        animate={{ y: 0, x: 0 }}
        exit={{ y: "100%", x: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-violet-400" />
            <span className="font-mono text-base font-semibold text-white">
              {detail?.request_no || "Loading..."}
            </span>
            {detail ? statusBadge(detail.status) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-16 text-zinc-400 text-sm">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Loading...
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
          {detail && (
            <>
              {/* Meta info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1 text-xs text-zinc-500">
                    <Hash className="h-3 w-3" /> Branch
                  </div>
                  <div className="font-semibold text-white">{detail.store_code || "-"}</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1 text-xs text-zinc-500">
                    <CalendarDays className="h-3 w-3" /> Date
                  </div>
                  <div className="font-semibold text-white">{detail.request_date || "-"}</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1 text-xs text-zinc-500">
                    <User className="h-3 w-3" /> Requested By
                  </div>
                  <div className="font-semibold text-white">{detail.requested_by || "-"}</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1 text-xs text-zinc-500">
                    <Package className="h-3 w-3" /> Total
                  </div>
                  <div className="font-semibold text-violet-300">
                    {Number(detail.total_amount || 0).toFixed(2)} {currencyCode}
                  </div>
                </div>
              </div>

              {detail.urgent_flag && (
                <div className="rounded-xl border border-red-700/40 bg-red-900/20 px-3 py-2 text-xs font-semibold text-red-300">
                  ⚡ URGENT REQUEST
                </div>
              )}

              {detail.notes && (
                <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2.5 text-sm text-zinc-300">
                  <div className="mb-1 text-xs text-zinc-500">Notes</div>
                  {detail.notes}
                </div>
              )}

              {/* Items */}
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-300">
                  <Package className="h-4 w-4 text-violet-400" />
                  Items ({detail.items?.length ?? 0})
                </h3>
                {!detail.items?.length ? (
                  <p className="text-xs text-zinc-500 py-4 text-center">No items</p>
                ) : (
                  <div className="space-y-2">
                    {detail.items.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        className="rounded-xl border border-white/8 bg-white/4 px-3 py-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-white text-sm leading-tight">{item.item_name}</div>
                            {item.category && (
                              <div className="mt-0.5 text-xs text-violet-400">{item.category}</div>
                            )}
                            {item.spec && (
                              <div className="mt-0.5 text-xs text-zinc-500">{item.spec}</div>
                            )}
                            {item.vendor_name && (
                              <div className="mt-0.5 text-xs text-zinc-500">Vendor: {item.vendor_name}</div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-semibold text-white">
                              {Number(item.qty || 0).toLocaleString()} {item.unit}
                            </div>
                            {item.unit_price > 0 && (
                              <div className="text-xs text-zinc-400">
                                @ {Number(item.unit_price).toFixed(2)}
                              </div>
                            )}
                            {item.line_total > 0 && (
                              <div className="text-xs font-semibold text-violet-300 mt-0.5">
                                {Number(item.line_total).toFixed(2)} {currencyCode}
                              </div>
                            )}
                          </div>
                        </div>
                        {item.needed_by_date && (
                          <div className="mt-1.5 text-xs text-amber-400">
                            Needed by: {item.needed_by_date}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Receivings */}
              {detail.receivings && detail.receivings.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-300">
                    Receivings ({detail.receivings.length})
                  </h3>
                  <div className="space-y-1.5">
                    {detail.receivings.map((r) => (
                      <div key={r.id} className="flex items-center justify-between rounded-lg border border-white/8 bg-white/4 px-3 py-2 text-sm">
                        <span className="font-mono text-xs text-zinc-300">{r.receiving_no || r.id}</span>
                        <span className="text-xs text-zinc-500">{r.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Claims */}
              {detail.claims && detail.claims.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-300">
                    Claims ({detail.claims.length})
                  </h3>
                  <div className="space-y-1.5">
                    {detail.claims.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg border border-white/8 bg-white/4 px-3 py-2 text-sm">
                        <span className="font-mono text-xs text-zinc-300">{c.claim_no || c.id}</span>
                        <span className="text-xs text-zinc-500">{c.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions — status-aware */}
        {detail && (() => {
          const s = String(detail.status || "").toUpperCase();
          if (s === "DRAFT") {
            if (submitConfirm) {
              return (
                <div className="border-t border-white/10 px-5 py-4 space-y-3">
                  <p className="text-center text-sm text-amber-200">
                    Submit <span className="font-mono font-semibold">{detail?.request_no}</span> for approval?
                  </p>
                  {error && (
                    <div className="rounded-xl border border-red-700/40 bg-red-900/20 px-3 py-2 text-xs text-red-300">
                      {error}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSubmitForApproval()}
                      disabled={submitBusy}
                      className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                    >
                      {submitBusy ? "Submitting…" : "✓ Confirm Submit"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSubmitConfirm(false); setError(""); }}
                      disabled={submitBusy}
                      className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm text-zinc-400 transition hover:bg-white/10 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div className="border-t border-white/10 px-5 py-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSubmitConfirm(true)}
                  className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
                >
                  Submit for Approval
                </button>
                <Link
                  href={`/store/procurement/request?city=${encodeURIComponent(city || "manila")}&edit=${encodeURIComponent(requestId)}`}
                  onClick={onClose}
                  className="shrink-0 rounded-xl border border-amber-500/30 bg-amber-950/30 px-4 py-2.5 text-sm font-semibold text-amber-300 transition hover:bg-amber-900/40"
                >
                  Edit
                </Link>
              </div>
            );
          }
          if (s === "RETURNED") {
            return (
              <div className="border-t border-white/10 px-5 py-4 flex gap-3">
                <Link
                  href={`/store/procurement/request?city=${encodeURIComponent(city || "manila")}&edit=${encodeURIComponent(requestId)}`}
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-amber-500/40 bg-amber-950/30 py-2.5 text-center text-sm font-semibold text-amber-300 transition hover:bg-amber-900/40"
                >
                  Edit &amp; Resubmit
                </Link>
              </div>
            );
          }
          if (s === "IN_REVIEW" || s === "SUBMITTED") {
            return (
              <div className="border-t border-white/10 px-5 py-4">
                <div className="flex items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/4 py-2.5 text-sm text-zinc-500">
                  <Clock className="h-4 w-4" /> Awaiting Approval
                </div>
              </div>
            );
          }
          if (s === "APPROVED") {
            return (
              <div className="border-t border-white/10 px-5 py-4 flex gap-3">
                <Link
                  href={`/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(requestId)}`}
                  onClick={onClose}
                  className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 py-2.5 text-center text-sm font-semibold text-white transition hover:from-emerald-500 hover:to-emerald-400"
                >
                  Receive Now
                </Link>
              </div>
            );
          }
          if (s === "RECEIVED") {
            return (
              <div className="border-t border-white/10 px-5 py-4 flex gap-3">
                <Link
                  href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(requestId)}`}
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-blue-500/30 bg-blue-950/30 py-2.5 text-center text-sm font-semibold text-blue-300 transition hover:bg-blue-900/40"
                >
                  File Claim
                </Link>
              </div>
            );
          }
          // CLAIMED / CLOSED / other — show history links
          return (
            <div className="border-t border-white/10 px-5 py-4 flex gap-3">
              <Link
                href={`/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(requestId)}`}
                onClick={onClose}
                className="flex-1 rounded-xl border border-violet-500/30 bg-violet-950/40 py-2.5 text-center text-sm font-semibold text-violet-300 transition hover:bg-violet-900/40"
              >
                Receiving
              </Link>
              <Link
                href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(requestId)}`}
                onClick={onClose}
                className="flex-1 rounded-xl border border-red-500/30 bg-red-950/40 py-2.5 text-center text-sm font-semibold text-red-300 transition hover:bg-red-900/40"
              >
                Claim
              </Link>
            </div>
          );
        })()}
      </motion.div>
    </>
  );
}

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
  const [submitSuccessMsg, setSubmitSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [canOpenAdminCase, setCanOpenAdminCase] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const initRef = useRef(false);
  const cityLabel = city === "dubai" ? "Dubai" : "Manila";
  const currencyCode = city === "dubai" ? "AED" : "PHP";
  const APPROVAL_THRESHOLD = city === "dubai" ? 500 : 15000;
  const isHighValue = (row: RequestRow) => Number(row.total_amount || 0) > APPROVAL_THRESHOLD;

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
      setError(friendlyProcurementError(e));
    } finally {
      setLoading(false);
    }
  }, [city, pin, requestedBy]);


  useEffect(() => {
    if (!submitSuccessMsg) return;
    const t = setTimeout(() => setSubmitSuccessMsg(""), 8000);
    return () => clearTimeout(t);
  }, [submitSuccessMsg]);

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

  const getStatusActionButton = (row: RequestRow) => {
    const s = String(row.status || "").toUpperCase();
    if (s === "APPROVED") {
      return (
        <Link
          href={`/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(row.id)}`}
          className="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-all shadow-md shadow-emerald-500/20 hover:from-emerald-500 hover:to-emerald-400 hover:scale-[1.02] active:scale-[0.98]"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4" />
            Receive Now
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      );
    }
    if (s === "RETURNED") {
      return (
        <Link
          href={`/store/procurement/request?city=${encodeURIComponent(city || "manila")}&edit=${encodeURIComponent(row.id)}`}
          className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-900/40"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            Edit & Resubmit
          </span>
        </Link>
      );
    }
    if (s === "IN_REVIEW" || s === "SUBMITTED") {
      return (
        <span className="inline-flex items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-4 py-2 text-sm text-zinc-500 cursor-default">
          <Clock className="h-4 w-4" />
          Awaiting Approval
        </span>
      );
    }
    if (s === "RECEIVED") {
      return (
        <Link
          href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(row.id)}`}
          className="rounded-xl border border-blue-500/30 bg-blue-950/30 px-4 py-2 text-sm font-semibold text-blue-300 transition hover:bg-blue-900/40"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            File Claim
          </span>
        </Link>
      );
    }
    if (s === "DRAFT") {
      return (
        <Link
          href={`/store/procurement/request?city=${encodeURIComponent(city || "manila")}&edit=${encodeURIComponent(row.id)}`}
          className="rounded-xl border border-amber-500/25 bg-amber-950/25 px-4 py-2 text-sm font-semibold text-amber-400 transition hover:bg-amber-900/35"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex items-center gap-2">
            <ChevronRight className="h-4 w-4" />
            Continue Draft
          </span>
        </Link>
      );
    }
    // CLAIMED / CLOSED / fallback — show both options
    return (
      <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
        <Link href={`/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(row.id)}`} className={`${SMALL_BUTTON} justify-center`}>
          Receiving
        </Link>
        <Link href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(row.id)}`} className={`${DANGER_BUTTON} justify-center`}>
          Claim
        </Link>
      </div>
    );
  };

  return (
    <div className={PAGE_BG}>
      <motion.div
        className="mx-auto max-w-7xl px-4 py-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
      {/* Header */}
      <div className="mb-5">
        <h1 className={T_PAGE_TITLE}>Store Procurement</h1>
        <p className={T_BODY}>Request, track, receive, and claim store supplies.</p>
      </div>

      {/* Stepper */}
      <div className={`${BLUSH_GLASS} px-6 py-3 mb-6`}>
        <ProcurementStepper currentStep="hub" />
      </div>

      {/* Two-column layout on PC */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

        {/* ─── LEFT PANEL ─── */}
        <div className="flex flex-col gap-4 lg:w-72 xl:w-80 lg:shrink-0">

          {/* City selector */}
          <div className={`${BLUSH_GLASS} p-4`}>
            <div className="mb-2 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-semibold text-white">City</span>
            </div>
            <select
              value={city}
              onChange={(e) => {
                const nextCity = e.target.value as "dubai" | "manila";
                setCity(nextCity);
                setStoreCode("");
                if (typeof window !== "undefined") localStorage.removeItem("store_proc_branch");
                void loadMyRequests(nextCity);
              }}
              className={SELECT_CLASS}
            >
              <option value="manila">Manila</option>
              <option value="dubai">Dubai</option>
            </select>
          </div>

          {/* Branch selector */}
          <div className={`${BLUSH_GLASS} p-4`}>
            <div className="mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-semibold text-white">Branch</span>
              {storeCode ? (
                <span className="rounded-full bg-violet-500/20 px-2.5 py-0.5 text-xs font-semibold text-violet-300">
                  ✓ {BRANCHES[city as "dubai" | "manila"]?.find((b) => b.code === storeCode)?.name || storeCode}
                </span>
              ) : (
                <span className="text-xs text-amber-400">⚠ Select branch</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {(BRANCHES[city as "dubai" | "manila"] || [])
                .filter((b) => b.code !== "DRIVER")
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
                        "rounded-xl border px-3 py-1.5 text-sm font-semibold transition-all duration-200",
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

          {/* New Request CTA */}
          <Link
            href={`/store/procurement/request?city=${encodeURIComponent(city || "manila")}${storeCode ? `&store_code=${encodeURIComponent(storeCode)}` : ""}`}
            className={[BLUSH_PRIMARY, "flex items-center justify-center gap-2 text-sm", !storeCode ? "opacity-60 cursor-not-allowed pointer-events-none" : ""].join(" ")}
            aria-disabled={!storeCode}
          >
            <PlusCircle className="h-4 w-4" />
            {storeCode ? "New Request" : "Select Branch First"}
          </Link>

          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className={KPI_CARD}>
              <div className="mb-1.5 flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5 text-zinc-400" />
                <p className={KPI_LABEL}>Draft</p>
              </div>
              <p className={`${KPI_VALUE} text-lg text-zinc-200`}>{counts.draft}</p>
            </div>
            <div className={KPI_CARD}>
              <div className="mb-1.5 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <p className={KPI_LABEL}>In Review</p>
              </div>
              <p className={`${KPI_VALUE} text-lg ${counts.inReview > 0 ? "text-amber-400" : "text-zinc-500"}`}>{counts.inReview}</p>
            </div>
            <div className={KPI_CARD}>
              <div className="mb-1.5 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <p className={KPI_LABEL}>Approved</p>
              </div>
              <p className={`${KPI_VALUE} text-lg ${counts.approved > 0 ? "text-emerald-400" : "text-zinc-500"}`}>{counts.approved}</p>
            </div>
            <div className={KPI_CARD}>
              <div className="mb-1.5 flex items-center gap-1.5">
                <RotateCcw className="h-3.5 w-3.5 text-red-400" />
                <p className={KPI_LABEL}>Returned</p>
              </div>
              <p className={`${KPI_VALUE} text-lg ${counts.returned > 0 ? "text-red-400" : "text-zinc-500"}`}>{counts.returned}</p>
            </div>
          </div>

          {/* Auth form + city */}
          <div className={`${BLUSH_GLASS} p-4 space-y-3`}>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Your Name</label>
              <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Session PIN</label>
              <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`} />
            </div>
            <div>
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
            <button type="button" onClick={() => void loadMyRequests()} disabled={loading} className={BLUSH_SECONDARY + " w-full flex items-center justify-center gap-2 text-sm"}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {/* Quick links */}
          <div className={`${BLUSH_GLASS} p-4`}>
            <p className={`${T_LABEL} mb-3`}>Quick Links</p>
            <div className="grid grid-cols-2 gap-2">
              <Link href={`/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}`} className={`${BLUSH_SMALL} justify-center min-h-10`}>
                <span className="flex items-center justify-center gap-1.5">
                  <PackageCheck className="h-3 w-3" /> Receiving
                </span>
              </Link>
              <Link href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}`} className={`${DANGER_BUTTON} justify-center min-h-10 text-sm`}>
                <span className="flex items-center justify-center gap-1.5">
                  <AlertCircle className="h-3 w-3" /> Claim
                </span>
              </Link>
              <Link href={`/store/procurement?city=${encodeURIComponent(city || "manila")}#history`} className={`col-span-2 ${BLUSH_SMALL} justify-center min-h-10`}>
                <span className="flex items-center justify-center gap-1.5">
                  <History className="h-3 w-3" /> View History
                </span>
              </Link>
            </div>
          </div>
        </div>

        {/* ─── RIGHT PANEL ─── */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">

          {error ? <div className="rounded-xl border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-300">{error}</div> : null}

          {submitSuccessMsg && (
            <div className="rounded-xl border border-emerald-700/40 bg-emerald-900/20 px-4 py-3 text-sm font-semibold text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {submitSuccessMsg}
            </div>
          )}

          {recentActivities.length ? (
            <div className={`${BLUSH_GLASS} px-4 py-3 text-xs text-neutral-200`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className={T_CARD_TITLE}>Recent Activity</div>
                <span className={T_CAPTION}>{recentActivities.length} item{recentActivities.length !== 1 ? "s" : ""}</span>
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

          {/* Request list */}
          <div id="history" className={`${BLUSH_GLASS} p-5`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className={T_SECTION}>
                My Requests
                <span className={`${T_CAPTION} ml-2 font-normal`}>({cityLabel} · {counts.total})</span>
              </h2>
              {loading && <RefreshCw className="h-4 w-4 animate-spin text-zinc-500" />}
            </div>

            {rows.length === 0 && !loading ? (
              <div className="flex flex-col items-center gap-2 py-10">
                <ShoppingCart className="h-8 w-8 text-zinc-600" />
                <p className={T_CAPTION}>No requests yet.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {rows.map((row) => {
                  const s = String(row.status || "").toUpperCase();
                  return (
                    <div
                      key={row.id}
                      className={`rounded-xl border px-4 py-3 transition-all duration-150 cursor-pointer hover:border-violet-500/40 hover:bg-violet-950/20 ${
                        row.id === lastCreatedRequestId
                          ? "border-emerald-700/60 bg-emerald-900/20"
                          : selectedRequestId === row.id
                            ? "border-violet-500/50 bg-violet-950/25"
                            : "border-white/8 bg-white/4"
                      }`}
                      onClick={() => setSelectedRequestId(row.id)}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-semibold leading-tight text-white flex items-center gap-2">
                            <span className="font-mono">{row.request_no}</span>
                            {row.id === lastCreatedRequestId && <span className={BADGE_SUCCESS}>New</span>}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-zinc-500">
                            <span>{row.store_code || "-"}</span>
                            <span>{row.request_date || "-"}</span>
                            <span className={`font-semibold ${isHighValue(row) ? "text-amber-400" : "text-zinc-400"}`}>
                              {Number(row.total_amount || 0).toFixed(2)} {currencyCode}
                            </span>
                          </div>
                          {/* Status badge row */}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {s === "DRAFT" && <span className={BADGE_WARNING}>DRAFT · Level {row.current_approval_level || 0}</span>}
                            {s === "APPROVED" && <span className={BADGE_SUCCESS}>APPROVED</span>}
                            {s === "RETURNED" && <span className={BADGE_ERROR}>RETURNED</span>}
                            {(s === "IN_REVIEW" || s === "SUBMITTED") && <span className={BADGE_INFO}>IN REVIEW</span>}
                            {s === "RECEIVED" && <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 border border-cyan-500/25 px-2.5 py-0.5 text-xs font-medium text-cyan-400">RECEIVED</span>}
                            {isHighValue(row) && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-900/40 border border-amber-500/40 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                                ⚠ High Value
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Status-driven action button */}
                        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                          {getStatusActionButton(row)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>{/* end right panel */}
      </div>{/* end two-column */}
      </motion.div>

      {/* Request detail drawer */}
      <AnimatePresence>
        {selectedRequestId && (
          <RequestDetailDrawer
            key={selectedRequestId}
            requestId={selectedRequestId}
            city={city}
            requestedBy={requestedBy}
            pin={pin}
            currencyCode={currencyCode}
            onClose={() => setSelectedRequestId(null)}
            onSubmitSuccess={(requestNo) => {
              setSelectedRequestId(null);
              setSubmitSuccessMsg(`✓ ${requestNo} → IN REVIEW に変更されました`);
              void loadMyRequests();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
