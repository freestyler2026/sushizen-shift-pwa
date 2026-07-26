"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, CheckCircle, XCircle, AlertCircle, Download } from "lucide-react";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES } from "@/lib/branches";
import SelectDark from "@/components/SelectDark";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
  TAB_ACTIVE,
  TAB_INACTIVE,
  TABLE_HEADER,
  TABLE_ROW,
  TABLE_CELL,
} from "@/lib/ui-tokens";

type OTRequest = {
  id: string;
  staff_name: string;
  branch_code: string;
  work_date: string;
  request_type: "pre" | "post";
  ot_start_hour: number;
  ot_end_hour: number;
  ot_minutes: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string;
  reviewed_at: string | null;
  review_note: string;
  submitted_at: string;
};

const REVIEWER_ROLES = new Set(["ADMIN", "HQ", "DUBAI_MANAGEMENT", "MANILA_MANAGEMENT", "MANAGER"]);

function statusBadge(status: string) {
  if (status === "approved") return <span className={BADGE_SUCCESS}><CheckCircle className="h-3 w-3" />Approved</span>;
  if (status === "rejected") return <span className={BADGE_ERROR}><XCircle className="h-3 w-3" />Rejected</span>;
  return <span className={BADGE_WARNING}><Clock className="h-3 w-3" />Pending</span>;
}

function formatHour(h: number): string {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function formatMinutes(m: number): string {
  return `${Math.floor(m / 60)}h${m % 60 > 0 ? `${m % 60}m` : ""}`;
}

export default function AdminOvertimePage() {
  const [auth] = useState(getAuth);
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
  const city = (auth?.city || "dubai").toLowerCase() as "dubai" | "manila";
  const branches = BRANCHES[city] ?? BRANCHES.dubai;

  const tokenHeaders = useCallback(async () => {
    const freshAuth = getAuth();
    const refreshed = await refreshAuthFromApi(freshAuth);
    const accessToken = refreshed?.accessToken || freshAuth?.accessToken;
    if (!accessToken) throw new Error("Please log in again.");
    return { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  }, []);

  // Filters
  const [filterBranch, setFilterBranch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterMonth, setFilterMonth] = useState(() => new Date().toISOString().slice(0, 7));

  // Data
  const [requests, setRequests] = useState<OTRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Review modal
  const [reviewing, setReviewing] = useState<OTRequest | null>(null);
  const [reviewStatus, setReviewStatus] = useState<"approved" | "rejected">("approved");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState("");

  // Export
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const params = new URLSearchParams({ city, limit: "200" });
      if (filterBranch) params.set("branch_code", filterBranch);
      if (filterStatus) params.set("status", filterStatus);
      if (filterMonth) params.set("month", filterMonth);
      const res = await fetch(`${apiBase}/api/admin/overtime/list?${params}`, {
        headers: new Headers(headers),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
      setRequests(data.requests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [tokenHeaders, apiBase, city, filterBranch, filterStatus, filterMonth]);

  useEffect(() => { load(); }, [load]);

  async function submitReview() {
    if (!reviewing) return;
    setReviewSubmitting(true);
    setReviewError("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/overtime/${reviewing.id}/review`, {
        method: "PATCH",
        headers: new Headers(headers),
        body: JSON.stringify({ status: reviewStatus, review_note: reviewNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Review failed");
      setReviewing(null);
      setReviewNote("");
      await load();
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "Review failed");
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const headers = await tokenHeaders();
      const params = new URLSearchParams({ city, month: filterMonth });
      const res = await fetch(`${apiBase}/api/admin/overtime/export?${params}`, {
        headers: new Headers(headers),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Export failed");
      const rows: OTRequest[] = data.rows ?? [];
      const csv = [
        "Staff,Branch,Date,Type,OT Start,OT End,OT Minutes,Reason,Reviewed By",
        ...rows.map((r) =>
          [r.staff_name, r.branch_code, r.work_date, r.request_type,
           formatHour(r.ot_start_hour), formatHour(r.ot_end_hour),
           r.ot_minutes, `"${r.reason}"`, r.reviewed_by].join(",")
        ),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `overtime_approved_${city}_${filterMonth}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  if (!auth || !REVIEWER_ROLES.has(auth.role ?? "")) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-white/60">Access denied — Manager or above required.</p>
      </div>
    );
  }

  // Summary stats
  const pending = requests.filter((r) => r.status === "pending");
  const approved = requests.filter((r) => r.status === "approved");
  const totalApprovedMin = approved.reduce((s, r) => s + r.ot_minutes, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 p-4 pb-24">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className={T_PAGE_TITLE}>Overtime Management</h1>
          <button
            onClick={handleExport}
            disabled={exporting}
            className={`${SECONDARY_BUTTON} flex items-center gap-2`}
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>

        {/* KPI summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Pending", value: pending.length, color: "text-amber-400" },
            { label: "Approved", value: approved.length, color: "text-green-400" },
            { label: "Total Approved OT", value: formatMinutes(totalApprovedMin), color: "text-purple-300" },
          ].map((k) => (
            <div key={k.label} className={`${GLASS_CARD} p-3 sm:p-4 text-center`}>
              <p className={`text-lg sm:text-2xl font-bold ${k.color}`}>{k.value}</p>
              <p className={`${T_CAPTION} text-[10px] sm:text-xs leading-tight mt-0.5`}>{k.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className={`${GLASS_CARD} p-4`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={T_LABEL}>Month</label>
              <input
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className={`${INPUT_CLASS} mt-1`}
              />
            </div>
            <div>
              <label className={T_LABEL}>Branch</label>
              <SelectDark
                className={`${SELECT_CLASS} mt-1`}
                value={filterBranch}
                onChange={setFilterBranch}
                options={[
                  { value: "", label: "All branches" },
                  ...branches.map((b) => ({ value: b.code, label: b.name })),
                ]}
              />
            </div>
            <div>
              <label className={T_LABEL}>Status</label>
              <SelectDark
                className={`${SELECT_CLASS} mt-1`}
                value={filterStatus}
                onChange={setFilterStatus}
                options={[
                  { value: "", label: "All" },
                  { value: "pending", label: "Pending" },
                  { value: "approved", label: "Approved" },
                  { value: "rejected", label: "Rejected" },
                ]}
              />
            </div>
            <div className="flex items-end">
              <button onClick={load} className={`${PRIMARY_BUTTON} w-full`}>Refresh</button>
            </div>
          </div>
        </div>

        {/* List */}
        <div className={`${GLASS_CARD} p-0 overflow-hidden`}>
          {error && (
            <div className="flex items-center gap-2 p-4 text-sm text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}
          {loading ? (
            <p className={`${T_CAPTION} p-6`}>Loading…</p>
          ) : error ? null : requests.length === 0 ? (
            <p className={`${T_CAPTION} p-6`}>No overtime requests found.</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="divide-y divide-white/5 sm:hidden">
                {requests.map((r) => (
                  <div key={r.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-white text-sm">{r.staff_name}</p>
                        <p className="text-xs text-white/50 mt-0.5">{r.work_date} · {r.branch_code}</p>
                      </div>
                      {statusBadge(r.status)}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className={r.request_type === "pre" ? BADGE_INFO : "text-white/50 text-xs"}>
                        {r.request_type === "pre" ? "Pre" : "Post"}
                      </span>
                      <span className="text-white">
                        {formatHour(r.ot_start_hour)}–{formatHour(r.ot_end_hour)}
                      </span>
                      <span className="text-white/50 text-xs">{formatMinutes(r.ot_minutes)}</span>
                    </div>
                    <p className="text-sm text-white/70 line-clamp-2">{r.reason}</p>
                    {r.review_note && (
                      <p className="text-xs text-white/50">Note: {r.review_note}</p>
                    )}
                    {r.status === "pending" ? (
                      <button
                        onClick={() => { setReviewing(r); setReviewStatus("approved"); setReviewNote(""); setReviewError(""); }}
                        className="w-full mt-1 rounded-xl bg-purple-600/30 border border-purple-500/30 px-4 py-2.5 text-sm font-semibold text-purple-300 hover:bg-purple-600/50 transition"
                      >
                        Review
                      </button>
                    ) : r.reviewed_by ? (
                      <p className="text-xs text-white/40">Reviewed by: {r.reviewed_by}</p>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={TABLE_HEADER}>
                      <th className={TABLE_CELL}>Staff</th>
                      <th className={TABLE_CELL}>Branch</th>
                      <th className={TABLE_CELL}>Date</th>
                      <th className={TABLE_CELL}>Type</th>
                      <th className={TABLE_CELL}>OT Time</th>
                      <th className={TABLE_CELL}>Reason</th>
                      <th className={TABLE_CELL}>Status</th>
                      <th className={TABLE_CELL}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r.id} className={TABLE_ROW}>
                        <td className={TABLE_CELL}><span className="font-medium text-white">{r.staff_name}</span></td>
                        <td className={TABLE_CELL}>{r.branch_code}</td>
                        <td className={TABLE_CELL}>{r.work_date}</td>
                        <td className={TABLE_CELL}>
                          <span className={r.request_type === "pre" ? BADGE_INFO : "text-white/50 text-xs"}>
                            {r.request_type === "pre" ? "Pre" : "Post"}
                          </span>
                        </td>
                        <td className={TABLE_CELL}>
                          {formatHour(r.ot_start_hour)}–{formatHour(r.ot_end_hour)}
                          <br />
                          <span className="text-white/50">{formatMinutes(r.ot_minutes)}</span>
                        </td>
                        <td className={TABLE_CELL}>
                          <span className="line-clamp-2 max-w-[200px]" title={r.reason}>{r.reason}</span>
                          {r.review_note && (
                            <span className="block text-white/50 text-xs mt-0.5">Note: {r.review_note}</span>
                          )}
                        </td>
                        <td className={TABLE_CELL}>{statusBadge(r.status)}</td>
                        <td className={TABLE_CELL}>
                          {r.status === "pending" && (
                            <button
                              onClick={() => { setReviewing(r); setReviewStatus("approved"); setReviewNote(""); setReviewError(""); }}
                              className="rounded-lg bg-purple-600/30 border border-purple-500/30 px-3 py-1 text-xs text-purple-300 hover:bg-purple-600/50 transition"
                            >
                              Review
                            </button>
                          )}
                          {r.status !== "pending" && (
                            <span className="text-white/40 text-xs">{r.reviewed_by || "—"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Review Modal */}
      {reviewing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
          <div className={`${GLASS_CARD} w-full sm:max-w-md p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto rounded-b-none sm:rounded-2xl`}>
            <h3 className={T_SECTION}>Review OT Request</h3>
            <div className="space-y-1 rounded-lg bg-white/5 p-3 text-sm">
              <p><span className="text-white/50">Staff:</span> <strong className="text-white">{reviewing.staff_name}</strong></p>
              <p><span className="text-white/50">Date:</span> {reviewing.work_date} ({reviewing.branch_code})</p>
              <p><span className="text-white/50">OT:</span> {formatHour(reviewing.ot_start_hour)}–{formatHour(reviewing.ot_end_hour)} ({formatMinutes(reviewing.ot_minutes)})</p>
              <p><span className="text-white/50">Reason:</span> {reviewing.reason}</p>
            </div>
            <div>
              <label className={T_LABEL}>Decision</label>
              <div className="mt-1 flex gap-2">
                {(["approved", "rejected"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setReviewStatus(s)}
                    className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                      reviewStatus === s
                        ? s === "approved" ? "bg-green-600 text-white" : "bg-red-600 text-white"
                        : "bg-white/10 text-white/60 hover:bg-white/20"
                    }`}
                  >
                    {s === "approved" ? "Approve" : "Reject"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={T_LABEL}>Comment (optional)</label>
              <textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                rows={2}
                placeholder="Add a comment…"
                className={`${TEXTAREA_CLASS} mt-1`}
              />
            </div>
            {reviewError && (
              <p className="text-sm text-red-400">{reviewError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setReviewing(null)}
                className={`${SECONDARY_BUTTON} flex-1`}
                disabled={reviewSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={submitReview}
                disabled={reviewSubmitting}
                className={`${PRIMARY_BUTTON} flex-1`}
              >
                {reviewSubmitting ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
