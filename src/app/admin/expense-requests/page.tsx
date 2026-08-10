"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Receipt,
  Clock,
  CheckCircle,
  XCircle,
  Banknote,
  Users,
  RefreshCw,
  Filter,
  Image as ImageIcon,
  ExternalLink,
} from "lucide-react";
import { useRouter } from "next/navigation";
import SelectDark from "@/components/SelectDark";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
  TAB_CONTAINER,
  TAB_ACTIVE,
  TAB_INACTIVE,
  T_PAGE_TITLE,
  T_SECTION,
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
  TABLE_HEADER,
  TABLE_ROW,
  TABLE_CELL,
} from "@/lib/ui-tokens";

const CITIES = ["dubai", "manila"];
const STATUSES = ["", "pending", "approved", "rejected", "paid"];
const STATUS_LABELS: Record<string, string> = {
  "": "All Status",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  paid: "Paid",
};
const ADMIN_ROLES = new Set(["ADMIN", "HQ", "DUBAI_MANAGEMENT", "MANILA_MANAGEMENT", "HR_MANAGER"]);

type Tab = "pending" | "all" | "summary";

type ExpenseRequest = {
  id: string;
  staff_name: string;
  city: string;
  branch_code: string;
  category: string;
  amount: number;
  currency: string;
  expense_date: string;
  description: string;
  status: string;
  reviewed_by: string;
  reviewed_at: string | null;
  review_note: string;
  submitted_at: string;
  has_receipt: boolean;
};

type SummaryItem = {
  id: string;
  category: string;
  amount: number;
  expense_date: string;
  description: string;
  status: string;
};

type SummaryRow = {
  staff_name: string;
  currency: string;
  total_amount: number;
  request_count: number;
  items: SummaryItem[];
};

function statusBadge(status: string) {
  if (status === "approved") return <span className={BADGE_SUCCESS}><CheckCircle className="h-3 w-3" />Approved</span>;
  if (status === "rejected") return <span className={BADGE_ERROR}><XCircle className="h-3 w-3" />Rejected</span>;
  if (status === "paid") return <span className={BADGE_SUCCESS}><Banknote className="h-3 w-3" />Paid</span>;
  return <span className={BADGE_WARNING}><Clock className="h-3 w-3" />Pending</span>;
}

export default function AdminExpenseRequestsPage() {
  const router = useRouter();
  const apiBase = "";
  const [tab, setTab] = useState<Tab>("pending");

  // Filters
  const [filterCity, setFilterCity] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterStaff, setFilterStaff] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // Data
  const [requests, setRequests] = useState<ExpenseRequest[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Review modal state
  const [reviewing, setReviewing] = useState<ExpenseRequest | null>(null);
  const [reviewStatus, setReviewStatus] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  useEffect(() => {
    const a = getAuth();
    if (!a?.hasSession && !a?.accessToken) { router.replace("/login"); return; }
    if (!ADMIN_ROLES.has(a.role || "")) { router.replace("/"); }
  }, [router]);

  const tokenHeaders = useCallback(async () => {
    const freshAuth = getAuth();
    const refreshed = await refreshAuthFromApi(freshAuth);
    const accessToken = refreshed?.accessToken || freshAuth?.accessToken;
    const hasSession = refreshed?.hasSession || freshAuth?.hasSession;
    if (!accessToken && !hasSession) throw new Error("Please log in again.");
    return { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) };
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const params = new URLSearchParams();
      if (filterCity) params.set("city", filterCity);
      if (filterStatus) params.set("status", filterStatus);
      if (filterStaff) params.set("staff_name", filterStaff);
      if (filterFrom) params.set("from_date", filterFrom);
      if (filterTo) params.set("to_date", filterTo);
      params.set("limit", "200");

      const res = await fetch(`${apiBase}/api/admin/expense-requests?${params}`, { headers, cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.detail || `Error ${res.status}`);
      setRequests(Array.isArray(j?.requests) ? j.requests : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [apiBase, tokenHeaders, filterCity, filterStatus, filterStaff, filterFrom, filterTo]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const params = new URLSearchParams();
      if (filterCity) params.set("city", filterCity);
      if (filterFrom) params.set("from_date", filterFrom);
      if (filterTo) params.set("to_date", filterTo);

      const res = await fetch(`${apiBase}/api/admin/expense-requests/summary?${params}`, { headers, cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.detail || `Error ${res.status}`);
      setSummary(Array.isArray(j?.summary) ? j.summary : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [apiBase, tokenHeaders, filterCity, filterFrom, filterTo]);

  useEffect(() => {
    if (tab === "summary") {
      void loadSummary();
    } else {
      void loadRequests();
    }
  }, [tab, loadRequests, loadSummary]);

  const openReview = async (r: ExpenseRequest) => {
    setReviewing(r);
    setReviewStatus(r.status === "pending" ? "approved" : r.status);
    setReviewNote(r.review_note || "");
    setReviewError("");
    setReceiptImage(null);
    if (r.has_receipt) {
      setReceiptLoading(true);
      try {
        const headers = await tokenHeaders();
        const res = await fetch(`${apiBase}/api/admin/expense-requests/${r.id}`, { headers, cache: "no-store" });
        const j = await res.json();
        if (res.ok && j?.request?.receipt_image) {
          setReceiptImage(j.request.receipt_image);
        }
      } catch {
        // non-blocking — receipt just won't show
      } finally {
        setReceiptLoading(false);
      }
    }
  };

  const handleReview = async () => {
    if (!reviewing || !reviewStatus) return;
    setReviewBusy(true);
    setReviewError("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/expense-requests/${reviewing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ status: reviewStatus, review_note: reviewNote }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.detail || `Error ${res.status}`);
      setReviewing(null);
      setReviewStatus("");
      setReviewNote("");
      setReceiptImage(null);
      await loadRequests();
    } catch (e: unknown) {
      setReviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setReviewBusy(false);
    }
  };

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const displayRequests = tab === "pending" ? pendingRequests : requests;

  const pendingTotal = pendingRequests.length;
  const approvedTotal = requests.filter((r) => r.status === "approved" || r.status === "paid").length;
  const allTotal = requests.length;

  return (
    <div className="min-h-screen text-white">
      <motion.div
        className="mx-auto max-w-6xl space-y-6 px-4 py-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className={T_PAGE_TITLE}>Expense Requests</h1>
            <p className={T_BODY}>Review and process staff expense reimbursement requests.</p>
          </div>
          <button
            type="button"
            onClick={() => tab === "summary" ? loadSummary() : loadRequests()}
            disabled={loading}
            className={SMALL_BUTTON}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <div className={KPI_CARD}>
            <div className={KPI_LABEL}>Pending Review</div>
            <div className={`${KPI_VALUE} ${pendingTotal ? "text-amber-400" : ""}`}>{pendingTotal}</div>
          </div>
          <div className={KPI_CARD}>
            <div className={KPI_LABEL}>Approved</div>
            <div className={`${KPI_VALUE} text-emerald-400`}>{approvedTotal}</div>
          </div>
          <div className={KPI_CARD}>
            <div className={KPI_LABEL}>Total (filtered)</div>
            <div className={KPI_VALUE}>{allTotal}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className={TAB_CONTAINER}>
          <button className={tab === "pending" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("pending")}>
            Pending {pendingTotal > 0 && <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-400">{pendingTotal}</span>}
          </button>
          <button className={tab === "all" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("all")}>All Requests</button>
          <button className={tab === "summary" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("summary")}>
            <Users className="inline h-3.5 w-3.5 mr-1" />Payroll Summary
          </button>
        </div>

        {/* Filters */}
        {tab !== "summary" && (
          <div className={`${GLASS_CARD} p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <Filter className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-medium text-zinc-300">Filters</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <SelectDark
                className={SELECT_CLASS}
                value={filterCity}
                onChange={setFilterCity}
                options={[
                  { value: "", label: "All Cities" },
                  ...CITIES.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) })),
                ]}
              />
              <SelectDark
                className={SELECT_CLASS}
                value={filterStatus}
                onChange={setFilterStatus}
                options={STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
              />
              <input
                className={INPUT_CLASS}
                placeholder="Staff name..."
                value={filterStaff}
                onChange={(e) => setFilterStaff(e.target.value)}
              />
              <input type="date" className={INPUT_CLASS} value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
              <input type="date" className={INPUT_CLASS} value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={loadRequests} disabled={loading} className={PRIMARY_BUTTON}>
                Apply Filters
              </button>
              <button type="button" onClick={() => { setFilterCity(""); setFilterStatus(""); setFilterStaff(""); setFilterFrom(""); setFilterTo(""); }} className={SECONDARY_BUTTON}>
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Filters for summary */}
        {tab === "summary" && (
          <div className={`${GLASS_CARD} p-4`}>
            <div className="grid grid-cols-3 gap-3">
              <SelectDark
                className={SELECT_CLASS}
                value={filterCity}
                onChange={setFilterCity}
                options={[
                  { value: "", label: "All Cities" },
                  ...CITIES.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) })),
                ]}
              />
              <input type="date" className={INPUT_CLASS} value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} placeholder="From date" />
              <input type="date" className={INPUT_CLASS} value={filterTo} onChange={(e) => setFilterTo(e.target.value)} placeholder="To date" />
            </div>
            <button type="button" onClick={loadSummary} disabled={loading} className={`${PRIMARY_BUTTON} mt-3`}>Apply</button>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* Pending / All Requests Table */}
        {tab !== "summary" && (
          <div className={GLASS_CARD}>
            <div className="p-4 border-b border-white/8">
              <div className={T_SECTION}>{tab === "pending" ? "Pending Requests" : "All Requests"}</div>
              <p className={`${T_CAPTION} mt-0.5`}>{displayRequests.length} record{displayRequests.length !== 1 ? "s" : ""}</p>
            </div>
            {loading && <p className="p-6 text-center text-sm text-zinc-500">Loading...</p>}
            {!loading && displayRequests.length === 0 && (
              <p className="p-8 text-center text-sm text-zinc-500">No requests found.</p>
            )}
            {displayRequests.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      <th className={`${TABLE_HEADER} px-4 pt-4`}>Submitted</th>
                      <th className={`${TABLE_HEADER} px-4 pt-4`}>Staff</th>
                      <th className={`${TABLE_HEADER} px-4 pt-4`}>Category</th>
                      <th className={`${TABLE_HEADER} px-4 pt-4`}>Amount</th>
                      <th className={`${TABLE_HEADER} px-4 pt-4`}>Date</th>
                      <th className={`${TABLE_HEADER} px-4 pt-4`}>Status</th>
                      <th className={`${TABLE_HEADER} px-4 pt-4`}>Receipt</th>
                      <th className={`${TABLE_HEADER} px-4 pt-4`}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRequests.map((r) => (
                      <tr key={r.id} className={TABLE_ROW}>
                        <td className={`${TABLE_CELL} px-4 text-xs text-zinc-400 whitespace-nowrap`}>
                          {new Date(r.submitted_at).toLocaleDateString()}
                        </td>
                        <td className={`${TABLE_CELL} px-4 font-medium`}>{r.staff_name}</td>
                        <td className={`${TABLE_CELL} px-4`}>
                          <span className={BADGE_INFO}>{r.category}</span>
                        </td>
                        <td className={`${TABLE_CELL} px-4 font-mono whitespace-nowrap`}>
                          {r.currency} {Number(r.amount).toFixed(2)}
                        </td>
                        <td className={`${TABLE_CELL} px-4 text-xs whitespace-nowrap`}>{r.expense_date}</td>
                        <td className={`${TABLE_CELL} px-4`}>{statusBadge(r.status)}</td>
                        <td className={`${TABLE_CELL} px-4`}>
                          {r.has_receipt
                            ? <span className="text-violet-400 flex items-center gap-1 text-xs"><ImageIcon className="h-3.5 w-3.5" />Yes</span>
                            : <span className="text-zinc-600 text-xs">—</span>}
                        </td>
                        <td className={`${TABLE_CELL} px-4`}>
                          <button
                            type="button"
                            onClick={() => openReview(r)}
                            className={SMALL_BUTTON}
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Payroll Summary */}
        {tab === "summary" && (
          <div className="space-y-4">
            {loading && <p className="text-center text-sm text-zinc-500">Loading...</p>}
            {!loading && summary.length === 0 && (
              <p className="text-center text-sm text-zinc-500">No approved/paid requests in selected period.</p>
            )}
            {summary.map((s) => (
              <div key={`${s.staff_name}-${s.currency}`} className={GLASS_CARD}>
                <div className="flex items-center justify-between p-4 border-b border-white/8">
                  <div>
                    <div className="font-semibold text-white">{s.staff_name}</div>
                    <div className={T_CAPTION}>{s.request_count} request{s.request_count !== 1 ? "s" : ""}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-emerald-400">{s.currency} {Number(s.total_amount).toFixed(2)}</div>
                    <div className={T_CAPTION}>total approved</div>
                  </div>
                </div>
                <div className="p-3">
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        <th className={`${TABLE_HEADER} px-2`}>Date</th>
                        <th className={`${TABLE_HEADER} px-2`}>Category</th>
                        <th className={`${TABLE_HEADER} px-2`}>Amount</th>
                        <th className={`${TABLE_HEADER} px-2`}>Description</th>
                        <th className={`${TABLE_HEADER} px-2`}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(s.items || []).map((item) => (
                        <tr key={item.id} className={TABLE_ROW}>
                          <td className={`${TABLE_CELL} px-2 text-xs`}>{item.expense_date}</td>
                          <td className={`${TABLE_CELL} px-2`}><span className={BADGE_INFO}>{item.category}</span></td>
                          <td className={`${TABLE_CELL} px-2 font-mono`}>{s.currency} {Number(item.amount).toFixed(2)}</td>
                          <td className={`${TABLE_CELL} px-2 text-xs text-zinc-400 max-w-[200px] truncate`}>{item.description || "—"}</td>
                          <td className={`${TABLE_CELL} px-2`}>{statusBadge(item.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Review Modal */}
        {reviewing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              className={`${GLASS_CARD} w-full max-w-md`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              <div className="p-5 border-b border-white/8">
                <div className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-violet-400" />
                  <div className={T_SECTION}>Review Expense Request</div>
                </div>
              </div>
              <div className="p-5 space-y-4">
                {/* Details */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`${GLASS_CARD} p-3`}>
                    <div className={T_LABEL}>Staff</div>
                    <div className="mt-1 text-sm font-medium text-white">{reviewing.staff_name}</div>
                  </div>
                  <div className={`${GLASS_CARD} p-3`}>
                    <div className={T_LABEL}>Category</div>
                    <div className="mt-1 text-sm text-white">{reviewing.category}</div>
                  </div>
                  <div className={`${GLASS_CARD} p-3`}>
                    <div className={T_LABEL}>Amount</div>
                    <div className="mt-1 text-sm font-mono font-bold text-emerald-400">{reviewing.currency} {Number(reviewing.amount).toFixed(2)}</div>
                  </div>
                  <div className={`${GLASS_CARD} p-3`}>
                    <div className={T_LABEL}>Expense Date</div>
                    <div className="mt-1 text-sm text-white">{reviewing.expense_date}</div>
                  </div>
                </div>
                {reviewing.description && (
                  <div className={`${GLASS_CARD} p-3`}>
                    <div className={T_LABEL}>Description</div>
                    <div className="mt-1 text-sm text-zinc-300">{reviewing.description}</div>
                  </div>
                )}

                {/* Receipt */}
                {reviewing.has_receipt && (
                  <div className={`${GLASS_CARD} p-3`}>
                    <div className={T_LABEL}>Receipt</div>
                    {receiptLoading && <p className="mt-1 text-xs text-zinc-500">Loading receipt...</p>}
                    {!receiptLoading && receiptImage && (
                      <div className="mt-2 space-y-2">
                        <img src={receiptImage} alt="Receipt" className="max-h-48 rounded-lg border border-white/10 object-contain" />
                        <button
                          type="button"
                          onClick={() => { const w = window.open(); if (w) { w.document.write(`<img src="${receiptImage}" style="max-width:100%;height:auto;">`); } }}
                          className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open full size
                        </button>
                      </div>
                    )}
                    {!receiptLoading && !receiptImage && (
                      <p className="mt-1 text-xs text-zinc-500">Could not load receipt.</p>
                    )}
                  </div>
                )}

                {/* Status select */}
                <div>
                  <label className={`${T_LABEL} block mb-1.5`}>Decision *</label>
                  <SelectDark
                    className={SELECT_CLASS}
                    value={reviewStatus}
                    onChange={setReviewStatus}
                    placeholder="Select decision..."
                    options={[
                      { value: "approved", label: "✅ Approve" },
                      { value: "rejected", label: "❌ Reject" },
                      { value: "paid", label: "💰 Mark as Paid" },
                      { value: "pending", label: "🟡 Keep Pending" },
                    ]}
                  />
                </div>

                <div>
                  <label className={`${T_LABEL} block mb-1.5`}>Note (shown to staff)</label>
                  <textarea
                    className={TEXTAREA_CLASS}
                    rows={3}
                    placeholder="Reason for decision or additional notes..."
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                  />
                </div>

                {reviewError && <p className="text-sm text-red-400">{reviewError}</p>}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleReview}
                    disabled={reviewBusy || !reviewStatus}
                    className={PRIMARY_BUTTON}
                  >
                    {reviewBusy ? "Saving..." : "Confirm Decision"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setReviewing(null); setReviewStatus(""); setReviewNote(""); setReviewError(""); setReceiptImage(null); }}
                    className={SECONDARY_BUTTON}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
