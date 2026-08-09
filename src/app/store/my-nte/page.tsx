"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import {
  GLASS_CARD,
  STATUS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TEXTAREA_CLASS,
  BADGE_ERROR,
  T_PAGE_TITLE,
  T_SECTION,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
} from "@/lib/ui-tokens";
import { AlertCircle, CheckCircle, Clock, FileText, RefreshCw, X } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type NteRecord = {
  id: string;
  city: string;
  staff_name: string;
  issued_date: string;
  reason: string;
  issued_by: string;
  status: "ACTIVE" | "RESOLVED";
  case_type: string;
  explanation_text: string | null;
  explanation_submitted_at: string | null;
  resolved_at: string | null;
  suspension_triggered: boolean;
  created_at: string;
};

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
};

type NteV2Case = {
  id: string;
  nte_ref: string;
  market: string;
  store_code: string | null;
  staff_name: string;
  violation_code: string | null;
  violation_title: string | null;
  severity_class: string | null;
  offense_count: number;
  proposed_penalty: string | null;
  status: string;
  served_at: string | null;
  served_method: string | null;
  response_deadline: string | null;
  response_received_at: string | null;
  response_text: string | null;
  response_waived: boolean;
  decision_outcome: string | null;
  decision_penalty_detail: string | null;
  decided_at: string | null;
  created_at: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return String(d).slice(0, 10);
}

const CASE_TYPE_LABELS: Record<string, string> = {
  NTE: "NTE — Notice to Explain",
  WARNING_LETTER: "Warning Letter",
  FINAL_WARNING: "Final Warning",
};

function CaseTypeBadge({ type }: { type: string }) {
  const label = CASE_TYPE_LABELS[type] ?? type ?? "NTE";
  const cls =
    type === "FINAL_WARNING"
      ? "inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30"
      : type === "WARNING_LETTER"
      ? "inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30"
      : "inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30";
  return <span className={cls}>{label}</span>;
}

const SEVERITY_COLORS: Record<string, string> = {
  A: "bg-zinc-700 text-zinc-300",
  B: "bg-amber-900/60 text-amber-300",
  C: "bg-orange-900/60 text-orange-300",
  D: "bg-red-900/60 text-red-300",
};

function SeverityBadge({ cls }: { cls: string | null }) {
  if (!cls) return null;
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${SEVERITY_COLORS[cls] ?? "bg-zinc-700 text-zinc-300"}`}>
      Severity {cls}
    </span>
  );
}

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  SERVED:               { label: "Response Required",    color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  RESPONSE_RECEIVED:    { label: "Response Submitted",   color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  RESPONSE_WAIVED:      { label: "Response Waived",      color: "bg-zinc-700 text-zinc-300 border-zinc-600" },
  HEARING_PENDING:      { label: "Hearing Scheduled",    color: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  HEARING_DONE:         { label: "Hearing Complete",     color: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  INVESTIGATION_DONE:   { label: "Under Review",         color: "bg-zinc-700 text-zinc-300 border-zinc-600" },
  DECIDED:              { label: "Decision Issued",      color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  NOD_ISSUED:           { label: "Notice of Decision",   color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  CLOSED:               { label: "Closed",               color: "bg-zinc-700 text-zinc-300 border-zinc-600" },
  DISMISSED:            { label: "Dismissed",            color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
};

function V2StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, color: "bg-zinc-700 text-zinc-300 border-zinc-600" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function isOverdue(deadline: string | null): boolean {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

// ─── Old-system Explanation Form ──────────────────────────────────────────────

function ExplanationForm({
  notice,
  authHeaders,
  onSubmitted,
}: {
  notice: NteRecord;
  authHeaders: () => Record<string, string>;
  onSubmitted: (updated: NteRecord) => void;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    setErr("");
    try {
      const res = await fetch(`/api/store/conduct/my-notices/${notice.id}/explain`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ explanation: text.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onSubmitted((data as { notice: NteRecord }).notice);
    } catch (e: unknown) {
      setErr((e as Error)?.message || "Failed to submit explanation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
      <p className={T_LABEL}>Submit Your Explanation</p>
      <p className={`${T_CAPTION} text-zinc-400`}>
        Write your explanation for this notice. Once submitted it cannot be edited.
      </p>
      <textarea
        className={`${TEXTAREA_CLASS} mt-1`}
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Explain the circumstances of this incident…"
      />
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex justify-end">
        <button
          type="button"
          className={`${PRIMARY_BUTTON} flex items-center gap-2 text-sm`}
          disabled={submitting || !text.trim()}
          onClick={() => void handleSubmit()}
        >
          {submitting ? "Submitting…" : "Submit Explanation"}
        </button>
      </div>
    </div>
  );
}

// ─── NTE v2 Response Form ─────────────────────────────────────────────────────

function V2ResponseForm({
  caseId,
  authHeaders,
  onSubmitted,
}: {
  caseId: string;
  authHeaders: () => Record<string, string>;
  onSubmitted: (newStatus: string) => void;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    setErr("");
    try {
      const res = await fetch(`/api/store/nte-v2/my-cases/${caseId}/respond`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ response_text: text.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail || `HTTP ${res.status}`);
      }
      const data = await res.json() as { new_status?: string };
      onSubmitted(data.new_status ?? "RESPONSE_RECEIVED");
    } catch (e: unknown) {
      setErr((e as Error)?.message || "Failed to submit response");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
      <p className={T_LABEL}>Submit Your Written Response</p>
      <p className={`${T_CAPTION} text-zinc-400`}>
        Provide your explanation or rebuttal. This is your official response to the NTE.
        Once submitted it cannot be edited.
      </p>
      <textarea
        className={`${TEXTAREA_CLASS} mt-1`}
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Explain the circumstances, provide context, or submit your rebuttal…"
      />
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex justify-end">
        <button
          type="button"
          className={`${PRIMARY_BUTTON} flex items-center gap-2 text-sm`}
          disabled={submitting || text.trim().length < 20}
          onClick={() => void handleSubmit()}
        >
          {submitting ? "Submitting…" : "Submit Response"}
        </button>
      </div>
      {text.trim().length > 0 && text.trim().length < 20 && (
        <p className="text-right text-[10px] text-zinc-500">{text.trim().length}/20 minimum characters</p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyNtePage() {
  const router = useRouter();
  const [notices, setNotices] = useState<NteRecord[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [ntev2Cases, setNtev2Cases] = useState<NteV2Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accessReady, setAccessReady] = useState(false);

  const authHeaders = useCallback((): Record<string, string> => {
    const auth = getAuth();
    return getAuthHeaders(auth) as Record<string, string>;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const raw = getAuth();
      // Phase 3: accessToken is "" when auth lives in httpOnly sz_access cookie.
      if (!raw?.hasSession && !raw?.accessToken) {
        router.replace("/login?next=/store/my-nte");
        return;
      }
      const resolved = (await refreshAuthFromApi(raw)) || raw;
      if (!resolved?.hasSession && !resolved?.accessToken) {
        router.replace("/login?next=/store/my-nte");
        return;
      }
      if (!cancelled) setAccessReady(true);
    }
    void init();
    return () => { cancelled = true; };
  }, [router]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [oldRes, v2Res] = await Promise.all([
        fetch("/api/store/conduct/my-notices", { headers: authHeaders(), cache: "no-store" }),
        fetch("/api/store/nte-v2/my-cases", { headers: authHeaders(), cache: "no-store" }),
      ]);

      if (!oldRes.ok) {
        const d = await oldRes.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail || `HTTP ${oldRes.status}`);
      }
      const oldData = await oldRes.json() as { notices?: NteRecord[]; notifications?: Notification[]; unread_count?: number };
      setNotices(Array.isArray(oldData.notices) ? oldData.notices : []);
      setNotifications(Array.isArray(oldData.notifications) ? oldData.notifications : []);
      if ((oldData.unread_count ?? 0) > 0) {
        fetch("/api/store/conduct/notifications/read", {
          method: "POST",
          headers: authHeaders(),
        }).catch(() => {});
      }

      if (v2Res.ok) {
        const v2Data = await v2Res.json() as { cases?: NteV2Case[] };
        setNtev2Cases(Array.isArray(v2Data.cases) ? v2Data.cases : []);
      } else {
        setNtev2Cases([]);
      }
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (accessReady) void loadData();
  }, [accessReady, loadData]);

  const handleExplanationSubmitted = (updated: NteRecord) => {
    setNotices((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  };

  const handleV2ResponseSubmitted = (caseId: string, newStatus: string) => {
    setNtev2Cases((prev) =>
      prev.map((c) =>
        c.id === caseId ? { ...c, status: newStatus, response_received_at: new Date().toISOString() } : c
      )
    );
  };

  const activeCount = notices.filter((n) => n.status === "ACTIVE").length;
  const pendingExplanation = notices.filter((n) => n.status === "ACTIVE" && !n.explanation_text).length;
  const v2ResponseRequired = ntev2Cases.filter((c) => c.status === "SERVED" && !c.response_text).length;

  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={T_PAGE_TITLE}>My Notices</h2>
          <p className={`${T_BODY} mt-1`}>
            View notices issued to you and submit your written explanation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className={`${SECONDARY_BUTTON} flex items-center gap-1.5 text-sm`}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="ml-auto shrink-0">
            <X className="h-4 w-4 opacity-60 hover:opacity-100" />
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Legacy Notices</p>
          <p className={KPI_VALUE}>{loading ? "—" : notices.length}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Legacy Active</p>
          <p className={`${KPI_VALUE} ${activeCount > 0 ? "text-red-400" : ""}`}>
            {loading ? "—" : activeCount}
          </p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>NTE Cases</p>
          <p className={KPI_VALUE}>{loading ? "—" : ntev2Cases.length}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Response Required</p>
          <p className={`${KPI_VALUE} ${(v2ResponseRequired + pendingExplanation) > 0 ? "text-amber-400" : ""}`}>
            {loading ? "—" : v2ResponseRequired + pendingExplanation}
          </p>
        </div>
      </div>

      {/* Unread notifications */}
      {notifications.filter((n) => !n.is_read).length > 0 && (
        <div className="space-y-2">
          <p className={T_SECTION}>New Notifications</p>
          {notifications
            .filter((n) => !n.is_read)
            .map((notif) => (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-amber-300">{notif.title}</p>
                  <p className={`${T_CAPTION} mt-0.5`}>{notif.body}</p>
                </div>
              </motion.div>
            ))}
        </div>
      )}

      {/* ── NTE v2 Cases ── */}
      {!loading && ntev2Cases.length > 0 && (
        <div className="space-y-3">
          <p className={T_SECTION}>Formal NTE Cases</p>
          {ntev2Cases.map((c) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`${STATUS_CARD} p-5 space-y-3`}
            >
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold text-violet-400">{c.nte_ref}</span>
                  <SeverityBadge cls={c.severity_class} />
                  <span className="text-xs text-zinc-500">{c.market}</span>
                </div>
                <V2StatusBadge status={c.status} />
              </div>

              {/* Violation */}
              {c.violation_code && (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-violet-400">{c.violation_code}</span>
                  {c.violation_title && (
                    <span className="text-sm text-white">{c.violation_title}</span>
                  )}
                  {c.offense_count > 1 && (
                    <span className="text-xs text-zinc-500">({c.offense_count}{c.offense_count === 2 ? "nd" : c.offense_count === 3 ? "rd" : "th"} offense)</span>
                  )}
                </div>
              )}

              {/* Served info */}
              {c.served_at && (
                <p className={T_CAPTION}>
                  Served: {fmtDate(c.served_at)}
                  {c.served_method ? ` · ${c.served_method}` : ""}
                  {c.response_deadline && (
                    <>
                      {" · "}
                      <span className={isOverdue(c.response_deadline) && c.status === "SERVED" ? "text-red-400 font-medium" : ""}>
                        Response deadline: {fmtDate(c.response_deadline)}
                        {isOverdue(c.response_deadline) && c.status === "SERVED" ? " (overdue)" : ""}
                      </span>
                    </>
                  )}
                </p>
              )}

              {/* Response status */}
              {c.status === "SERVED" && !c.response_text ? (
                <>
                  {isOverdue(c.response_deadline) && (
                    <div className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      Response deadline has passed. Please submit your response immediately.
                    </div>
                  )}
                  <V2ResponseForm
                    caseId={c.id}
                    authHeaders={authHeaders}
                    onSubmitted={(newStatus) => handleV2ResponseSubmitted(c.id, newStatus)}
                  />
                </>
              ) : c.response_text ? (
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-400">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Response submitted{c.response_received_at ? ` on ${fmtDate(c.response_received_at)}` : ""}
                  </div>
                  <p className="text-sm text-zinc-300 leading-relaxed">{c.response_text}</p>
                </div>
              ) : null}

              {/* Decision */}
              {c.decision_outcome && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 space-y-1">
                  <p className="text-xs font-semibold text-emerald-400">
                    Decision: {c.decision_outcome}
                    {c.decided_at ? ` (${fmtDate(c.decided_at)})` : ""}
                  </p>
                  {c.decision_penalty_detail && (
                    <p className="text-sm text-zinc-300">{c.decision_penalty_detail}</p>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Legacy notice list ── */}
      {loading ? (
        <p className={`${T_BODY} py-8 text-center`}>Loading…</p>
      ) : notices.length === 0 && ntev2Cases.length === 0 ? (
        <div className={`${GLASS_CARD} py-12 text-center`}>
          <FileText className="mx-auto mb-3 h-8 w-8 text-zinc-500" />
          <p className={T_BODY}>No notices on record.</p>
        </div>
      ) : notices.length > 0 ? (
        <div className="space-y-3">
          <p className={T_SECTION}>Previous Notices</p>
          {notices.map((notice) => (
            <motion.div
              key={notice.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`${STATUS_CARD} p-5 space-y-3`}
            >
              {/* Header row */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CaseTypeBadge type={notice.case_type ?? "NTE"} />
                  <span className="font-mono text-xs text-zinc-400">
                    {fmtDate(notice.issued_date)}
                  </span>
                </div>
                <span
                  className={
                    notice.status === "ACTIVE"
                      ? "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30"
                      : "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  }
                >
                  {notice.status === "ACTIVE" ? "Active" : "Resolved"}
                </span>
              </div>

              <p className="text-sm leading-relaxed text-white">{notice.reason}</p>
              <p className={T_CAPTION}>Issued by: {notice.issued_by || "—"}</p>

              {notice.suspension_triggered && (
                <span className={BADGE_ERROR}>Suspension triggered</span>
              )}

              {notice.explanation_text ? (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Explanation submitted{notice.explanation_submitted_at
                      ? ` on ${fmtDate(notice.explanation_submitted_at)}`
                      : ""}
                  </div>
                  <p className="text-sm text-zinc-300 leading-relaxed">
                    {notice.explanation_text}
                  </p>
                </div>
              ) : notice.status === "ACTIVE" ? (
                <ExplanationForm
                  notice={notice}
                  authHeaders={authHeaders}
                  onSubmitted={handleExplanationSubmitted}
                />
              ) : null}

              {notice.status === "RESOLVED" && notice.resolved_at && (
                <p className={`${T_CAPTION} border-t border-white/5 pt-2`}>
                  Resolved on {fmtDate(notice.resolved_at)}
                </p>
              )}
            </motion.div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
