"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, MessageSquareText, RefreshCw, Send, ShieldAlert, MessagesSquare } from "lucide-react";
import { canAccessPrivateReportAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import {
  GLASS_CARD,
  STATUS_CARD,
  HIGHLIGHT_CARD,
  PRIMARY_BUTTON,
  SMALL_BUTTON,
  INPUT_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_CARD_TITLE,
  T_BODY,
  T_CAPTION,
  BADGE_WARNING,
  BADGE_SUCCESS,
  BADGE_INFO,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
} from "@/lib/ui-tokens";

type ReportRow = {
  id: string;
  report_type: string;
  city: string;
  branch: string;
  staff_name: string;
  report_datetime: string;
  category: string;
  anonymous_request: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  reply_count: number;
};

type ReportDetail = {
  id: string;
  report_type: string;
  city: string;
  branch: string;
  staff_name: string;
  report_datetime: string;
  category: string;
  anonymous_request: boolean;
  status: string;
  payload_json: Record<string, any>;
  created_at: string;
};

type ReportReply = {
  id: number;
  report_id: string;
  author_name: string;
  author_role: string;
  message: string;
  created_at: string;
};

export default function AdminPrivateReportsPage() {
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [replies, setReplies] = useState<ReportReply[]>([]);
  const [replyText, setReplyText] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);

  const tokenHeaders = useCallback(async () => {
    const refreshed = await refreshAuthFromApi(auth);
    const accessToken = refreshed?.accessToken || auth?.accessToken;
    if (!accessToken) throw new Error("Please log in again.");
    return {
      Authorization: `Bearer ${accessToken}`,
      ...(refreshed?.stepUpToken ? { "X-Step-Up-Token": refreshed.stepUpToken } : {}),
    };
  }, [auth]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/private_reports?limit=200`, { headers, cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      const j = JSON.parse(text);
      setRows(Array.isArray(j?.rows) ? j.rows : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [apiBase, tokenHeaders]);

  const loadDetail = async (reportId: string) => {
    setError("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/private_reports/${reportId}`, { headers, cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      const j = JSON.parse(text);
      setDetail((j?.report || null) as ReportDetail | null);
      setReplies(Array.isArray(j?.replies) ? j.replies : []);
      setSelectedId(reportId);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  const submitReply = async () => {
    if (!selectedId) return;
    if (!replyText.trim()) {
      setError("Reply message is required.");
      return;
    }
    setSubmitBusy(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/private_reports/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          report_id: selectedId,
          message: replyText.trim(),
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      setReplyText("");
      await loadDetail(selectedId);
      await loadList();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSubmitBusy(false);
    }
  };

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const can = canAccessPrivateReportAdmin(refreshed || auth);
      setAllowed(can);
      if (can) await loadList();
    }
    init();
  }, [auth, loadList]);

  if (!allowed) {
    return (
      <div className={`${GLASS_CARD} p-5`}>
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-red-400" />
          <div>
            <h1 className={T_SECTION}>Private Reports</h1>
            <p className="mt-1 text-sm text-red-300">Private Reports page is available only to HQ/HR Manager/Admin.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Private Reports</h1>
          <p className={T_BODY}>Restricted review channel for HQ, HR, and admin follow-up.</p>
        </div>
        <span className={BADGE_WARNING}>
          <ShieldAlert className="h-3 w-3" />
          Sensitive access
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className={KPI_CARD}>
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-violet-400" />
            <p className={KPI_LABEL}>Open Reports</p>
          </div>
          <p className={KPI_VALUE}>{rows.length}</p>
        </div>
        <div className={KPI_CARD}>
          <div className="mb-2 flex items-center gap-2">
            <MessagesSquare className="h-4 w-4 text-sky-400" />
            <p className={KPI_LABEL}>Replies</p>
          </div>
          <p className={KPI_VALUE}>{replies.length}</p>
        </div>
        <div className={`${STATUS_CARD} p-4`}>
          <p className={`${KPI_LABEL} mb-2`}>Access Scope</p>
          <p className="text-sm text-zinc-300">Only HQ/HR/Admin can view these reports. Other staff cannot access this page.</p>
        </div>
      </div>

      {error ? <div className="text-sm text-red-300">{error}</div> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={`${GLASS_CARD} p-5`}>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className={T_SECTION}>Reports</h2>
              <p className={T_CAPTION}>Choose a report to inspect its detail and reply thread.</p>
            </div>
            <button
              type="button"
              onClick={loadList}
              disabled={loading}
              className={SMALL_BUTTON}
            >
              <span className="flex items-center gap-2">
                <RefreshCw className="h-3 w-3" />
                Refresh
              </span>
            </button>
          </div>
          <div className="space-y-2">
            {rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => loadDetail(r.id)}
                className={[
                  "w-full rounded-2xl border px-4 py-3 text-left text-sm transition-all duration-150",
                  selectedId === r.id
                    ? "border-amber-400 bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/20"
                    : "border-white/8 bg-white/4 text-neutral-200 hover:border-white/15 hover:bg-white/8",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{r.report_type}</div>
                  <span className={r.reply_count > 0 ? BADGE_INFO : BADGE_SUCCESS}>
                    {r.reply_count} replies
                  </span>
                </div>
                <div className="mt-1 text-xs text-neutral-400">
                  {r.city}/{r.branch || "-"} • {r.staff_name}
                </div>
              </button>
            ))}
            {loading ? <div className="text-sm text-neutral-500">Loading reports...</div> : null}
            {!loading && !rows.length ? <div className="text-sm text-neutral-500">No reports.</div> : null}
          </div>
        </div>

        <div className={`${GLASS_CARD} p-5`}>
          <div className="mb-2">
            <h2 className={T_SECTION}>Detail</h2>
            <p className={T_CAPTION}>Review report data, history, and send a private reply.</p>
          </div>
          {!detail ? (
            <div className="mt-2 text-sm text-neutral-500">Select a report.</div>
          ) : (
            <div className="mt-2 space-y-3">
              <div className={`${HIGHLIGHT_CARD} p-4 text-sm`}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className={T_CARD_TITLE}>{detail.report_type}</h3>
                  <span className={BADGE_INFO}>{detail.status || "OPEN"}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <p className={T_CAPTION}>City / Branch</p>
                    <p className="text-sm text-zinc-200">{detail.city}/{detail.branch || "-"}</p>
                  </div>
                  <div>
                    <p className={T_CAPTION}>Reporter</p>
                    <p className="text-sm text-zinc-200">{detail.staff_name}</p>
                  </div>
                  <div>
                    <p className={T_CAPTION}>Category</p>
                    <p className="text-sm text-zinc-200">{detail.category || "-"}</p>
                  </div>
                  <div>
                    <p className={T_CAPTION}>Anonymous Request</p>
                    <p className="text-sm text-zinc-200">{detail.anonymous_request ? "Yes" : "No"}</p>
                  </div>
                </div>
              </div>
              <pre className="overflow-auto rounded-2xl border border-white/8 bg-white/4 p-3 text-xs text-neutral-300">
                {JSON.stringify(detail.payload_json || {}, null, 2)}
              </pre>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="h-4 w-4 text-sky-400" />
                  <div className={T_CARD_TITLE}>Replies</div>
                </div>
                {replies.map((rp) => (
                  <div key={rp.id} className={`${STATUS_CARD} p-3 text-xs text-neutral-300`}>
                    <div className="text-neutral-400">
                      {rp.author_name} ({rp.author_role}) • {rp.created_at}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap">{rp.message}</div>
                  </div>
                ))}
                {!replies.length ? <div className="text-xs text-neutral-500">No replies yet.</div> : null}
              </div>

              <div className="space-y-2">
                <textarea
                  className={INPUT_CLASS}
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write private reply to the reporter"
                />
                <button
                  type="button"
                  onClick={submitReply}
                  disabled={submitBusy || !replyText.trim()}
                  className={PRIMARY_BUTTON}
                >
                  <span className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    {submitBusy ? "Sending..." : "Send Reply"}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
