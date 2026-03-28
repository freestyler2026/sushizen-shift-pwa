"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";

type InboxRow = {
  id: number;
  report_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export default function InboxPage() {
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
  const auth = useMemo(() => getAuth(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const tokenHeaders = useCallback(async () => {
    const refreshed = await refreshAuthFromApi(auth);
    const accessToken = refreshed?.accessToken || auth?.accessToken;
    if (!accessToken) throw new Error("Please log in again.");
    return {
      Authorization: `Bearer ${accessToken}`,
      ...(refreshed?.stepUpToken ? { "X-Step-Up-Token": refreshed.stepUpToken } : {}),
    };
  }, [auth]);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/private_reports/my_inbox?limit=200`, { headers, cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      const j = JSON.parse(text);
      const nextRows: InboxRow[] = Array.isArray(j?.rows) ? j.rows : [];
      setRows(nextRows);
      setUnreadCount(Number(j?.unread_count || 0));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [apiBase, tokenHeaders]);

  const markRead = async (ids: number[]) => {
    if (!ids.length) return;
    setError("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/private_reports/my_inbox/read`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({ notification_ids: ids }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      await loadInbox();
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  const unreadIds = rows.filter((x) => !x.is_read).map((x) => x.id);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
        <div className="text-lg font-semibold">Inbox</div>
        <div className="mt-1 text-sm text-neutral-400">Private acknowledgements and replies from HQ/HR appear here.</div>
        <div className="mt-2 text-sm text-neutral-300">Unread: {unreadCount}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={loadInbox}
          disabled={loading}
          className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={() => markRead(unreadIds)}
          disabled={!unreadIds.length}
          className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60"
        >
          Mark all unread as read
        </button>
      </div>

      {error ? <div className="text-sm text-red-300">{error}</div> : null}

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-neutral-400">{row.created_at}</div>
              {!row.is_read ? (
                <button
                  type="button"
                  onClick={() => markRead([row.id])}
                  className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs hover:bg-neutral-900"
                >
                  Mark read
                </button>
              ) : (
                <span className="text-xs text-neutral-500">Read</span>
              )}
            </div>
            <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-200">{row.message}</div>
          </div>
        ))}
        {!rows.length ? <div className="text-sm text-neutral-500">No messages.</div> : null}
      </div>
    </div>
  );
}
