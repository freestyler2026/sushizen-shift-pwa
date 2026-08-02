"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, CheckCircle, XCircle, AlertCircle, Download, Banknote, UserCheck } from "lucide-react";
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
  status: "pending" | "manager_approved" | "paid" | "approved" | "rejected";
  reviewed_by: string;
  reviewed_at: string | null;
  review_note: string;
  manager_approved_by: string;
  manager_approved_at: string | null;
  manager_note: string;
  paid_by: string;
  paid_at: string | null;
  submitted_at: string;
};

type ModalAction = "manager_approve" | "mark_paid" | "reject";

const REVIEWER_ROLES = new Set(["ADMIN", "HQ", "DUBAI_MANAGEMENT", "MANILA_MANAGEMENT", "MANAGER", "HR_MANAGER"]);
const STAGE1_ROLES   = new Set(["ADMIN", "HQ", "MANILA_MANAGEMENT", "HR_MANAGER"]);
const STAGE2_ROLES   = new Set(["ADMIN", "HQ"]);

function statusBadge(status: string) {
  if (status === "paid")             return <span className={BADGE_SUCCESS}><Banknote className="h-3 w-3" />Paid</span>;
  if (status === "approved")         return <span className={BADGE_SUCCESS}><CheckCircle className="h-3 w-3" />Approved</span>;
  if (status === "manager_approved") return <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-300"><UserCheck className="h-3 w-3" />Mgr Confirmed</span>;
  if (status === "rejected")         return <span className={BADGE_ERROR}><XCircle className="h-3 w-3" />Rejected</span>;
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
  const userCity = (auth?.city || "dubai").toLowerCase() as "dubai" | "manila";
  const role = (auth?.role || "").toUpperCase();
  const canSwitchCity = ["ADMIN", "HQ"].includes(role);
  const canStage1 = STAGE1_ROLES.has(role);
  const canStage2 = STAGE2_ROLES.has(role);

  const [activeCity, setActiveCity] = useState<"dubai" | "manila">(userCity);
  const city = activeCity;
  const branches = BRANCHES[city] ?? BRANCHES.dubai;

  const tokenHeaders = useCallback(async () => {
    const freshAuth = getAuth();
    const refreshed = await refreshAuthFromApi(freshAuth);
    const accessToken = refreshed?.accessToken || freshAuth?.accessToken;
    if (!accessToken) throw new Error("Please log in again.");
    return { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  }, []);

  const [filterBranch, setFilterBranch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterMonth, setFilterMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [requests, setRequests] = useState<OTRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Modal state
  const [reviewing, setReviewing] = useState<OTRequest | null>(null);
  const [modalAction, setModalAction] = useState<ModalAction>("manager_approve");
  const [actionNote, setActionNote] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const params = new URLSearchParams({ city, limit: "200" });
      if (filterBranch) params.set("branch_code", filterBranch);
      if (filterStatus) params.set("status", filterStatus);
      if (filterMonth)  params.set("month", filterMonth);
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

  function openModal(r: OTRequest, action: ModalAction) {
    setReviewing(r);
    setModalAction(action);
    setActionNote("");
    setActionError("");
  }

  async function submitAction() {
    if (!reviewing) return;
    setActionBusy(true);
    setActionError("");
    try {
      const headers = await tokenHeaders();
      let endpoint = "";
      let body: Record<string, string> = {};
      if (modalAction === "manager_approve") {
        endpoint = `/api/admin/overtime/${reviewing.id}/manager-approve`;
        body = { note: actionNote };
      } else if (modalAction === "mark_paid") {
        endpoint = `/api/admin/overtime/${reviewing.id}/mark-paid`;
        body = { note: actionNote };
      } else {
        endpoint = `/api/admin/overtime/${reviewing.id}/review`;
        body = { status: "rejected", review_note: actionNote };
      }
      const res = await fetch(`${apiBase}${endpoint}`, {
        method: "PATCH",
        headers: new Headers(headers),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Action failed");
      setReviewing(null);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActionBusy(false);
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
        "Staff,Branch,Date,Type,OT Start,OT End,OT Minutes,Reason,Mgr Approved By,Paid By",
        ...rows.map((r) =>
          [r.staff_name, r.branch_code, r.work_date, r.request_type,
           formatHour(r.ot_start_hour), formatHour(r.ot_end_hour),
           r.ot_minutes, `"${r.reason}"`, r.manager_approved_by || "", r.paid_by || ""].join(",")
        ),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `overtime_paid_${city}_${filterMonth}.csv`;
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

  const pending         = requests.filter((r) => r.status === "pending");
  const mgrApproved     = requests.filter((r) => r.status === "manager_approved");
  const paid            = requests.filter((r) => r.status === "paid" || r.status === "approved");
  const totalPaidMin    = paid.reduce((s, r) => s + r.ot_minutes, 0);

  const modalTitle = modalAction === "manager_approve" ? "Confirm Direct Management Approval"
    : modalAction === "mark_paid" ? "Mark as Paid (Payroll Processed)"
    : "Reject OT Request";

  const modalConfirmLabel = modalAction === "manager_approve" ? "Confirm Approval"
    : modalAction === "mark_paid" ? "Mark Paid"
    : "Reject";

  const modalConfirmClass = modalAction === "reject"
    ? "flex-1 rounded-xl border border-red-700/50 bg-red-950/40 py-2 text-sm font-semibold text-red-300 hover:bg-red-950/60 transition disabled:opacity-50"
    : `${PRIMARY_BUTTON} flex-1`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 p-4 pb-24">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className={T_PAGE_TITLE}>Overtime Management</h1>
          <div className="flex items-center gap-2">
            {canSwitchCity && (
              <div className="flex rounded-xl overflow-hidden border border-zinc-700">
                {(["dubai", "manila"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => { setActiveCity(c); setFilterBranch(""); }}
                    className={`px-4 py-2 text-xs font-semibold transition-colors ${activeCity === c ? TAB_ACTIVE : TAB_INACTIVE}`}
                  >
                    {c === "dubai" ? "Dubai" : "Manila"}
                  </button>
                ))}
              </div>
            )}
            {canStage2 && (
              <button
                onClick={handleExport}
                disabled={exporting}
                className={`${SECONDARY_BUTTON} flex items-center gap-2`}
              >
                <Download className="h-4 w-4" />
                {exporting ? "Exporting…" : "Export CSV"}
              </button>
            )}
          </div>
        </div>

        {/* Flow explanation */}
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs text-zinc-400 flex-wrap">
          <span className="flex items-center gap-1 text-amber-300 font-medium"><Clock className="h-3 w-3" />Pending</span>
          <span>→</span>
          <span className="flex items-center gap-1 text-blue-300 font-medium"><UserCheck className="h-3 w-3" />Mgr Confirmed</span>
          <span className="text-zinc-600">(Uejima / Yamada / Richard / Peter)</span>
          <span>→</span>
          <span className="flex items-center gap-1 text-green-300 font-medium"><Banknote className="h-3 w-3" />Paid</span>
          <span className="text-zinc-600">(Yamada / Ayako)</span>
          <span className="ml-auto text-zinc-500">Staff notified at each stage via Inbox</span>
        </div>

        {/* KPI summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Awaiting Stage 1", value: pending.length, color: "text-amber-400" },
            { label: "Awaiting Payroll", value: mgrApproved.length, color: "text-blue-300" },
            { label: "Total Paid OT", value: formatMinutes(totalPaidMin), color: "text-green-300" },
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
                placeholder="All branches"
                clearable={true}
                options={branches.map((b) => ({ value: b.code, label: b.name }))}
              />
            </div>
            <div>
              <label className={T_LABEL}>Status</label>
              <SelectDark
                className={`${SELECT_CLASS} mt-1`}
                value={filterStatus}
                onChange={setFilterStatus}
                placeholder="All"
                clearable={true}
                options={[
                  { value: "pending",          label: "Pending (Stage 1)" },
                  { value: "manager_approved", label: "Mgr Confirmed (Stage 2)" },
                  { value: "paid",             label: "Paid" },
                  { value: "rejected",         label: "Rejected" },
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
                      <span className="text-white">{formatHour(r.ot_start_hour)}–{formatHour(r.ot_end_hour)}</span>
                      <span className="text-white/50 text-xs">{formatMinutes(r.ot_minutes)}</span>
                    </div>
                    <p className="text-sm text-white/70 line-clamp-2">{r.reason}</p>
                    {r.manager_approved_by && (
                      <p className="text-xs text-blue-400">Stage 1: {r.manager_approved_by}</p>
                    )}
                    {r.paid_by && (
                      <p className="text-xs text-green-400">Paid by: {r.paid_by}</p>
                    )}
                    <div className="flex gap-2 pt-1">
                      {r.status === "pending" && canStage1 && (
                        <button
                          onClick={() => openModal(r, "manager_approve")}
                          className="flex-1 rounded-xl border border-blue-500/30 bg-blue-900/20 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-900/40 transition"
                        >
                          Confirm (Stage 1)
                        </button>
                      )}
                      {r.status === "manager_approved" && canStage2 && (
                        <button
                          onClick={() => openModal(r, "mark_paid")}
                          className="flex-1 rounded-xl border border-green-500/30 bg-green-900/20 px-3 py-2 text-xs font-semibold text-green-300 hover:bg-green-900/40 transition"
                        >
                          Mark Paid
                        </button>
                      )}
                      {(r.status === "pending" || r.status === "manager_approved") && canStage1 && (
                        <button
                          onClick={() => openModal(r, "reject")}
                          className="rounded-xl border border-red-500/20 bg-red-900/10 px-3 py-2 text-xs text-red-400 hover:bg-red-900/30 transition"
                        >
                          Reject
                        </button>
                      )}
                    </div>
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
                      <th className={TABLE_CELL}>Actions</th>
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
                          <br /><span className="text-white/50">{formatMinutes(r.ot_minutes)}</span>
                        </td>
                        <td className={TABLE_CELL}>
                          <span className="line-clamp-2 max-w-[180px]" title={r.reason}>{r.reason}</span>
                          {r.manager_approved_by && (
                            <span className="block text-blue-400 text-xs mt-0.5">✓ {r.manager_approved_by}</span>
                          )}
                          {r.paid_by && (
                            <span className="block text-green-400 text-xs mt-0.5">💴 {r.paid_by}</span>
                          )}
                        </td>
                        <td className={TABLE_CELL}>{statusBadge(r.status)}</td>
                        <td className={TABLE_CELL}>
                          <div className="flex flex-col gap-1">
                            {r.status === "pending" && canStage1 && (
                              <button
                                onClick={() => openModal(r, "manager_approve")}
                                className="rounded-lg border border-blue-500/30 bg-blue-900/20 px-2 py-1 text-xs text-blue-300 hover:bg-blue-900/40 transition whitespace-nowrap"
                              >
                                Confirm (S1)
                              </button>
                            )}
                            {r.status === "manager_approved" && canStage2 && (
                              <button
                                onClick={() => openModal(r, "mark_paid")}
                                className="rounded-lg border border-green-500/30 bg-green-900/20 px-2 py-1 text-xs text-green-300 hover:bg-green-900/40 transition whitespace-nowrap"
                              >
                                Mark Paid
                              </button>
                            )}
                            {(r.status === "pending" || r.status === "manager_approved") && canStage1 && (
                              <button
                                onClick={() => openModal(r, "reject")}
                                className="rounded-lg border border-red-500/20 bg-red-900/10 px-2 py-1 text-xs text-red-400 hover:bg-red-900/30 transition"
                              >
                                Reject
                              </button>
                            )}
                            {(r.status === "paid" || r.status === "approved" || r.status === "rejected") && (
                              <span className="text-white/40 text-xs">{r.paid_by || r.reviewed_by || "—"}</span>
                            )}
                          </div>
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

      {/* Action Modal */}
      {reviewing && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
          <div className={`${GLASS_CARD} w-full sm:max-w-md p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto rounded-b-none sm:rounded-2xl pb-safe`}>
            <h3 className={T_SECTION}>{modalTitle}</h3>
            <div className="space-y-1 rounded-lg bg-white/5 p-3 text-sm">
              <p><span className="text-white/50">Staff:</span> <strong className="text-white">{reviewing.staff_name}</strong></p>
              <p><span className="text-white/50">Date:</span> {reviewing.work_date} ({reviewing.branch_code})</p>
              <p><span className="text-white/50">OT:</span> {formatHour(reviewing.ot_start_hour)}–{formatHour(reviewing.ot_end_hour)} ({formatMinutes(reviewing.ot_minutes)})</p>
              <p><span className="text-white/50">Reason:</span> {reviewing.reason}</p>
              {reviewing.manager_approved_by && (
                <p><span className="text-white/50">Stage 1 by:</span> <span className="text-blue-300">{reviewing.manager_approved_by}</span></p>
              )}
            </div>
            {modalAction === "mark_paid" && (
              <div className="flex items-start gap-2 rounded-lg border border-green-800/40 bg-green-950/20 p-3 text-xs text-green-300">
                <Banknote className="h-4 w-4 shrink-0 mt-0.5" />
                This will mark the OT as paid and added to payroll. The staff member will be notified via Inbox.
              </div>
            )}
            {modalAction === "manager_approve" && (
              <div className="flex items-start gap-2 rounded-lg border border-blue-800/40 bg-blue-950/20 p-3 text-xs text-blue-300">
                <UserCheck className="h-4 w-4 shrink-0 mt-0.5" />
                Confirming as direct management. Staff will be notified and the request will move to Stage 2 (payroll).
              </div>
            )}
            <div>
              <label className={T_LABEL}>Comment (optional)</label>
              <textarea
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                rows={2}
                placeholder="Add a comment…"
                className={`${TEXTAREA_CLASS} mt-1`}
              />
            </div>
            {actionError && <p className="text-sm text-red-400">{actionError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setReviewing(null)} className={`${SECONDARY_BUTTON} flex-1`} disabled={actionBusy}>
                Cancel
              </button>
              <button onClick={submitAction} disabled={actionBusy} className={modalConfirmClass}>
                {actionBusy ? "Saving…" : modalConfirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
