"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { canAccessPrivateReportAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { dispatchBadgeRefresh } from "@/lib/badgeEvents";
import {
  GLASS_CARD,
  SMALL_BUTTON,
  T_PAGE_TITLE,
  T_SECTION,
  T_BODY,
  T_CAPTION,
  BADGE_WARNING,
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
  payload_json?: Record<string, any>;
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

function StatusBadge({ status }: { status: string }) {
  const s = String(status || "").toUpperCase();
  const map: Record<string, string> = {
    RECEIVED: "border-sky-700/40 bg-sky-950/30 text-sky-300",
    IN_PROGRESS: "border-amber-600/40 bg-amber-950/30 text-amber-300",
    RESOLVED: "border-emerald-700/40 bg-emerald-950/30 text-emerald-300",
    CLOSED: "border-neutral-700/40 bg-neutral-800/30 text-neutral-400",
  };
  const cls = map[s] || "border-neutral-700/40 bg-neutral-800/30 text-neutral-400";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{s || "OPEN"}</span>;
}

function ReportField({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-xl border p-3",
        highlight ? "border-amber-700/30 bg-amber-950/20" : "border-neutral-800/60 bg-neutral-900/30",
      ].join(" ")}
    >
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{label}</div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">{value}</p>
    </div>
  );
}

function pickText(payload: Record<string, any> | null | undefined, ...keys: string[]): string {
  if (!payload) return "";
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

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
  const openCount = rows.length;
  const replyCount = rows.reduce((sum, r) => sum + Number(r.reply_count || 0), 0);

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
      dispatchBadgeRefresh("privateReports");
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-amber-700/30 bg-amber-950/10 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-500/70">Open Reports</div>
          <div className="mt-1 text-3xl font-bold text-amber-200">{openCount}</div>
          <div className="mt-1 text-xs text-neutral-500">awaiting review</div>
        </div>
        <div className="rounded-2xl border border-violet-700/30 bg-violet-950/10 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-violet-400/70">Replies Sent</div>
          <div className="mt-1 text-3xl font-bold text-violet-200">{replyCount}</div>
          <div className="mt-1 text-xs text-neutral-500">total replies</div>
        </div>
        <div className="rounded-2xl border border-neutral-700/40 bg-neutral-900/30 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Access Scope</div>
          <div className="mt-2 text-xs leading-relaxed text-neutral-400">
            Only <span className="font-medium text-neutral-200">HQ / HR / Admin</span> can view these reports. Other staff
            cannot access this page.
          </div>
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
                  "w-full rounded-xl border px-4 py-3 text-left transition",
                  selectedId === r.id
                    ? "border-amber-500/60 bg-amber-950/20"
                    : "border-neutral-800 bg-neutral-900/30 hover:bg-neutral-800/40",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-neutral-200">{r.report_type}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    {pickText(r.payload_json, "problem") ? (
                      <p className="mt-0.5 truncate text-xs text-neutral-500">{pickText(r.payload_json, "problem").slice(0, 60)}...</p>
                    ) : null}
                    <div className="mt-1 text-[11px] text-neutral-600">
                      {r.city}/{r.branch || "-"} • {r.staff_name}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className={[
                        "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        r.reply_count > 0 ? "bg-violet-900/50 text-violet-200" : "bg-neutral-800/60 text-neutral-500",
                      ].join(" ")}
                    >
                      {r.reply_count} {r.reply_count === 1 ? "reply" : "replies"}
                    </div>
                    {r.created_at ? (
                      <div className="mt-1 text-[10px] text-neutral-600">
                        {new Date(r.created_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    ) : null}
                  </div>
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
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-bold text-neutral-100">{detail.report_type}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      Submitted: {detail.created_at ? new Date(detail.created_at).toLocaleString("en-GB") : "-"}
                    </div>
                  </div>
                  <StatusBadge status={detail.status} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "City / Branch", value: `${detail.city}/${detail.branch || "-"}` },
                    { label: "Reporter", value: detail.staff_name || "-" },
                    { label: "Category", value: detail.category || "-" },
                    { label: "Anonymous", value: detail.anonymous_request ? "Yes" : "No" },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl border border-neutral-800/60 bg-neutral-900/20 p-2.5">
                      <div className="text-[10px] font-medium uppercase tracking-wide text-neutral-600">{label}</div>
                      <div className="mt-0.5 text-sm font-medium text-neutral-200">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
                  {pickText(detail.payload_json, "date_time", "report_datetime", "datetime") ? (
                    <span className="rounded-lg bg-neutral-800/60 px-2 py-1">
                      🕐 {pickText(detail.payload_json, "date_time", "report_datetime", "datetime")}
                    </span>
                  ) : null}
                  {pickText(detail.payload_json, "store_branch", "branch") ? (
                    <span className="rounded-lg bg-neutral-800/60 px-2 py-1">
                      🏪 {pickText(detail.payload_json, "store_branch", "branch")}
                    </span>
                  ) : null}
                  {pickText(detail.payload_json, "screen_feature") ? (
                    <span className="rounded-lg bg-neutral-800/60 px-2 py-1">
                      📱 {pickText(detail.payload_json, "screen_feature")}
                    </span>
                  ) : null}
                </div>

                {pickText(detail.payload_json, "problem") ? (
                  <ReportField label="Problem" value={pickText(detail.payload_json, "problem")} highlight />
                ) : null}
                {pickText(detail.payload_json, "expected") ? (
                  <ReportField label="What was expected" value={pickText(detail.payload_json, "expected")} />
                ) : null}
                {pickText(detail.payload_json, "actual") ? (
                  <ReportField label="What actually happened" value={pickText(detail.payload_json, "actual")} />
                ) : null}
                {pickText(detail.payload_json, "screenshot") ? (
                  <ReportField label="Screenshot / Note" value={pickText(detail.payload_json, "screenshot")} />
                ) : null}
              </div>

              <div className="mt-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="text-sm font-semibold text-neutral-200">Replies</div>
                  {replies.length > 0 ? (
                    <span className="rounded-full bg-violet-900/40 px-2 py-0.5 text-[10px] text-violet-300">{replies.length}</span>
                  ) : null}
                </div>
                {replies.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-neutral-800 p-4 text-center text-xs text-neutral-600">
                    No replies yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {replies.map((rp) => (
                      <div key={rp.id} className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-4 py-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-neutral-300">{rp.author_name}</span>
                          <span className="text-[10px] text-neutral-600">{rp.created_at}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">{rp.message}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 space-y-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write a private reply to the reporter..."
                    rows={3}
                    className="w-full resize-none rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-200 placeholder:text-neutral-600 transition focus:border-violet-500/60 focus:outline-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={!replyText.trim() || submitBusy}
                      onClick={submitReply}
                      className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submitBusy ? "Sending..." : "Send Reply"}
                    </button>
                  </div>
                </div>
              </div>

              {pickText(detail.payload_json, "what_happened", "why_problem", "support_needed", "affected_people") ? (
                <div className="space-y-3">
                  {pickText(detail.payload_json, "what_happened") ? (
                    <ReportField label="What happened" value={pickText(detail.payload_json, "what_happened")} />
                  ) : null}
                  {pickText(detail.payload_json, "why_problem") ? (
                    <ReportField label="Why this is a problem" value={pickText(detail.payload_json, "why_problem")} />
                  ) : null}
                  {pickText(detail.payload_json, "affected_people") ? (
                    <ReportField label="Who is affected" value={pickText(detail.payload_json, "affected_people")} />
                  ) : null}
                  {pickText(detail.payload_json, "support_needed") ? (
                    <ReportField label="Support needed" value={pickText(detail.payload_json, "support_needed")} />
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
