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
  BADGE_SUCCESS,
  T_PAGE_TITLE,
  T_SECTION,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
} from "@/lib/ui-tokens";
import { AlertCircle, CheckCircle, FileText, RefreshCw, X } from "lucide-react";

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

// ─── Explanation Form ─────────────────────────────────────────────────────────

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
        throw new Error((d as any).detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onSubmitted((data as any).notice as NteRecord);
    } catch (e: any) {
      setErr(e?.message || "Failed to submit explanation");
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
      {err && (
        <p className="text-xs text-red-400">{err}</p>
      )}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyNtePage() {
  const router = useRouter();
  const [notices, setNotices] = useState<NteRecord[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
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
      if (!raw?.accessToken) {
        router.replace("/login?next=/store/my-nte");
        return;
      }
      const resolved = (await refreshAuthFromApi(raw)) || raw;
      if (!resolved?.accessToken) {
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
      const res = await fetch("/api/store/conduct/my-notices", {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as any).detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setNotices(Array.isArray(data.notices) ? data.notices : []);
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);

      // Mark all notifications as read
      if (data.unread_count > 0) {
        fetch("/api/store/conduct/notifications/read", {
          method: "POST",
          headers: authHeaders(),
        }).catch(() => {});
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (accessReady) void loadData();
  }, [accessReady, loadData]);

  const activeCount = notices.filter((n) => n.status === "ACTIVE").length;
  const pendingExplanation = notices.filter(
    (n) => n.status === "ACTIVE" && !n.explanation_text
  ).length;

  const handleExplanationSubmitted = (updated: NteRecord) => {
    setNotices((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  };

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
      <div className="grid grid-cols-3 gap-3">
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Total Notices</p>
          <p className={KPI_VALUE}>{loading ? "—" : notices.length}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Active</p>
          <p className={`${KPI_VALUE} ${activeCount > 0 ? "text-red-400" : ""}`}>
            {loading ? "—" : activeCount}
          </p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Awaiting Explanation</p>
          <p className={`${KPI_VALUE} ${pendingExplanation > 0 ? "text-amber-400" : ""}`}>
            {loading ? "—" : pendingExplanation}
          </p>
        </div>
      </div>

      {/* Unread inbox notifications */}
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

      {/* Notice list */}
      {loading ? (
        <p className={`${T_BODY} py-8 text-center`}>Loading…</p>
      ) : notices.length === 0 ? (
        <div className={`${GLASS_CARD} py-12 text-center`}>
          <FileText className="mx-auto mb-3 h-8 w-8 text-zinc-500" />
          <p className={T_BODY}>No notices on record.</p>
        </div>
      ) : (
        <div className="space-y-4">
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

              {/* Reason */}
              <p className="text-sm leading-relaxed text-white">{notice.reason}</p>
              <p className={T_CAPTION}>Issued by: {notice.issued_by || "—"}</p>

              {/* Suspension flag */}
              {notice.suspension_triggered && (
                <span className={BADGE_ERROR}>Suspension triggered</span>
              )}

              {/* Explanation status */}
              {notice.explanation_text ? (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Explanation submitted {notice.explanation_submitted_at
                      ? `on ${fmtDate(notice.explanation_submitted_at)}`
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

              {/* Resolved info */}
              {notice.status === "RESOLVED" && notice.resolved_at && (
                <p className={`${T_CAPTION} border-t border-white/5 pt-2`}>
                  Resolved on {fmtDate(notice.resolved_at)}
                </p>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
