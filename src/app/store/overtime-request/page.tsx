"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, CheckCircle, XCircle, AlertCircle, ChevronDown } from "lucide-react";
import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES } from "@/lib/branches";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
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

function statusBadge(status: string) {
  if (status === "approved") return <span className={BADGE_SUCCESS}><CheckCircle className="h-3 w-3" />Approved</span>;
  if (status === "rejected") return <span className={BADGE_ERROR}><XCircle className="h-3 w-3" />Rejected</span>;
  return <span className={BADGE_WARNING}><Clock className="h-3 w-3" />Pending</span>;
}

function formatHour(h: number): string {
  const total = h < 0 ? h + 24 : h;
  const hh = Math.floor(total) % 24;
  const mm = Math.round((total - Math.floor(total)) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function hourFromTime(t: string): number {
  const [hh, mm] = t.split(":").map(Number);
  return hh + mm / 60;
}

function calcMinutes(start: number, end: number): number {
  const e = end > start ? end : end + 24;
  return Math.round((e - start) * 60);
}

export default function OvertimeRequestPage() {
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
  const [auth, setAuth] = useState(() => getAuth());

  const city = (auth?.city || "dubai").toLowerCase() as "dubai" | "manila";
  const branches = BRANCHES[city] ?? BRANCHES.dubai;
  const staffBranch = auth?.branch_code ?? "";

  // Form state
  const [branchCode, setBranchCode] = useState(staffBranch);
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [requestType, setRequestType] = useState<"pre" | "post">("post");
  const [otStart, setOtStart] = useState("21:00");
  const [otEnd, setOtEnd] = useState("23:00");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  // History
  const [requests, setRequests] = useState<OTRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const otMinutes = calcMinutes(hourFromTime(otStart), hourFromTime(otEnd));

  const loadHistory = useCallback(async () => {
    if (!auth) return;
    setLoadingHistory(true);
    try {
      const res = await fetch(`${apiBase}/api/store/overtime/my-requests`, {
        headers: new Headers(getAuthHeaders(auth)),
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests ?? []);
      }
    } finally {
      setLoadingHistory(false);
    }
  }, [auth, apiBase]);

  useEffect(() => {
    refreshAuthFromApi().then((a) => { if (a) setAuth(a); });
    loadHistory();
  }, [loadHistory]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth) return;
    setSubmitError("");
    setSubmitSuccess("");
    if (otMinutes <= 0) { setSubmitError("OT end time must be after start time."); return; }
    if (reason.trim().length < 5) { setSubmitError("Please enter a reason (at least 5 characters)."); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/store/overtime/request`, {
        method: "POST",
        headers: new Headers({ ...getAuthHeaders(auth), "Content-Type": "application/json" }),
        body: JSON.stringify({
          branch_code: branchCode,
          work_date: workDate,
          request_type: requestType,
          ot_start_hour: hourFromTime(otStart),
          ot_end_hour: hourFromTime(otEnd),
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Submission failed");
      setSubmitSuccess("Overtime request submitted successfully.");
      setReason("");
      await loadHistory();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!auth) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-white/60">Please log in to submit an overtime request.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 p-4 pb-24">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className={T_PAGE_TITLE}>Overtime Request</h1>

        {/* Form */}
        <div className={`${GLASS_CARD} p-6`}>
          <h2 className={`${T_SECTION} mb-4`}>Submit OT Request</h2>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Request Type toggle */}
            <div>
              <label className={T_LABEL}>Request Type</label>
              <div className="mt-1 flex gap-2">
                {(["pre", "post"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setRequestType(t)}
                    className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                      requestType === t
                        ? "bg-purple-600 text-white"
                        : "bg-white/10 text-white/60 hover:bg-white/20"
                    }`}
                  >
                    {t === "pre" ? "Pre-approval (before OT)" : "Post-report (after OT)"}
                  </button>
                ))}
              </div>
              <p className={`${T_CAPTION} mt-1`}>
                {requestType === "pre"
                  ? "Request approval before working overtime."
                  : "Report overtime hours already worked."}
              </p>
            </div>

            {/* Branch */}
            <div>
              <label className={T_LABEL}>Branch</label>
              <div className="relative mt-1">
                <select
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value)}
                  className={`${SELECT_CLASS} appearance-none pr-8`}
                  required
                >
                  <option value="">Select branch…</option>
                  {branches.map((b) => (
                    <option key={b.code} value={b.code}>{b.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              </div>
            </div>

            {/* Date */}
            <div>
              <label className={T_LABEL}>Work Date</label>
              <input
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                className={`${INPUT_CLASS} mt-1`}
                required
              />
            </div>

            {/* OT times */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={T_LABEL}>OT Start Time</label>
                <input
                  type="time"
                  value={otStart}
                  onChange={(e) => setOtStart(e.target.value)}
                  className={`${INPUT_CLASS} mt-1`}
                  required
                />
              </div>
              <div>
                <label className={T_LABEL}>OT End Time</label>
                <input
                  type="time"
                  value={otEnd}
                  onChange={(e) => setOtEnd(e.target.value)}
                  className={`${INPUT_CLASS} mt-1`}
                  required
                />
              </div>
            </div>

            {/* OT duration summary */}
            {otMinutes > 0 && (
              <div className="rounded-lg bg-purple-900/30 border border-purple-500/30 px-4 py-2 text-center">
                <span className={T_BODY}>
                  Total OT:{" "}
                  <strong className="text-purple-300">
                    {Math.floor(otMinutes / 60)}h {otMinutes % 60 > 0 ? `${otMinutes % 60}m` : ""}
                  </strong>
                  {" "}({formatHour(hourFromTime(otStart))} – {formatHour(hourFromTime(otEnd))})
                </span>
              </div>
            )}
            {otMinutes <= 0 && otStart && otEnd && (
              <p className="text-xs text-amber-400">End time must be after start time (midnight-crossing is supported).</p>
            )}

            {/* Reason */}
            <div>
              <label className={T_LABEL}>Reason / Task Details</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Describe the work that requires overtime…"
                className={`${TEXTAREA_CLASS} mt-1`}
                required
              />
            </div>

            {submitError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-900/30 border border-red-500/30 p-3 text-sm text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />{submitError}
              </div>
            )}
            {submitSuccess && (
              <div className="flex items-center gap-2 rounded-lg bg-green-900/30 border border-green-500/30 p-3 text-sm text-green-300">
                <CheckCircle className="h-4 w-4 shrink-0" />{submitSuccess}
              </div>
            )}

            <button type="submit" disabled={submitting} className={`${PRIMARY_BUTTON} w-full`}>
              {submitting ? "Submitting…" : requestType === "pre" ? "Submit Pre-approval Request" : "Submit OT Report"}
            </button>
          </form>
        </div>

        {/* History */}
        <div className={`${GLASS_CARD} p-6`}>
          <h2 className={`${T_SECTION} mb-4`}>My OT Requests</h2>
          {loadingHistory ? (
            <p className={T_CAPTION}>Loading…</p>
          ) : requests.length === 0 ? (
            <p className={T_CAPTION}>No overtime requests yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={TABLE_HEADER}>
                    <th className={TABLE_CELL}>Date</th>
                    <th className={TABLE_CELL}>Branch</th>
                    <th className={TABLE_CELL}>Type</th>
                    <th className={TABLE_CELL}>OT Hours</th>
                    <th className={TABLE_CELL}>Status</th>
                    <th className={TABLE_CELL}>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id} className={TABLE_ROW}>
                      <td className={TABLE_CELL}>{r.work_date}</td>
                      <td className={TABLE_CELL}>{r.branch_code}</td>
                      <td className={TABLE_CELL}>
                        <span className={r.request_type === "pre" ? BADGE_INFO : "text-white/60 text-xs"}>
                          {r.request_type === "pre" ? "Pre" : "Post"}
                        </span>
                      </td>
                      <td className={TABLE_CELL}>
                        {formatHour(r.ot_start_hour)}–{formatHour(r.ot_end_hour)}
                        <span className="ml-1 text-white/50">
                          ({Math.floor(r.ot_minutes / 60)}h{r.ot_minutes % 60 > 0 ? `${r.ot_minutes % 60}m` : ""})
                        </span>
                      </td>
                      <td className={TABLE_CELL}>{statusBadge(r.status)}</td>
                      <td className={TABLE_CELL}>
                        <span className="text-white/60">{r.review_note || "—"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
