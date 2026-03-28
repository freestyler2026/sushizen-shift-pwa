"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessPrivateReportAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";

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
    return <div className="text-sm text-red-300">Private Reports page is available only to HQ/HR Manager/Admin.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
        <div className="text-lg font-semibold">Private Reports (HQ / HR)</div>
        <div className="mt-1 text-sm text-neutral-400">Only HQ/HR/Admin can view these reports. Other staff cannot access this page.</div>
      </div>

      {error ? <div className="text-sm text-red-300">{error}</div> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium">Reports</div>
            <button
              type="button"
              onClick={loadList}
              disabled={loading}
              className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1 text-xs hover:bg-neutral-900 disabled:opacity-60"
            >
              Refresh
            </button>
          </div>
          <div className="space-y-2">
            {rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => loadDetail(r.id)}
                className={[
                  "w-full rounded-xl border px-3 py-2 text-left text-sm",
                  selectedId === r.id ? "border-amber-500 bg-amber-950/20 text-amber-100" : "border-neutral-800 bg-neutral-950/30 text-neutral-200",
                ].join(" ")}
              >
                <div className="font-medium">{r.report_type}</div>
                <div className="mt-1 text-xs text-neutral-400">
                  {r.city}/{r.branch || "-"} • {r.staff_name} • replies: {r.reply_count}
                </div>
              </button>
            ))}
            {!rows.length ? <div className="text-sm text-neutral-500">No reports.</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3">
          <div className="text-sm font-medium">Detail</div>
          {!detail ? (
            <div className="mt-2 text-sm text-neutral-500">Select a report.</div>
          ) : (
            <div className="mt-2 space-y-3">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3 text-sm">
                <div>Type: {detail.report_type}</div>
                <div>City/Branch: {detail.city}/{detail.branch || "-"}</div>
                <div>Reporter: {detail.staff_name}</div>
                <div>Anonymous request: {detail.anonymous_request ? "Yes" : "No"}</div>
              </div>
              <pre className="overflow-auto rounded-xl border border-neutral-800 bg-neutral-950/30 p-3 text-xs text-neutral-300">
                {JSON.stringify(detail.payload_json || {}, null, 2)}
              </pre>

              <div className="space-y-2">
                <div className="text-sm font-medium">Replies</div>
                {replies.map((rp) => (
                  <div key={rp.id} className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-2 text-xs text-neutral-300">
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
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write private reply to the reporter"
                />
                <button
                  type="button"
                  onClick={submitReply}
                  disabled={submitBusy}
                  className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60"
                >
                  {submitBusy ? "Sending..." : "Send Reply"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
