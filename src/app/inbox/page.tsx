"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bell, MailOpen, ClipboardList } from "lucide-react";
import { useRouter } from "next/navigation";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { dispatchBadgeRefresh } from "@/lib/badgeEvents";
import {
  GLASS_CARD,
  SMALL_BUTTON,
  T_PAGE_TITLE,
  T_SECTION,
  T_BODY,
  T_CAPTION,
  BADGE_SUCCESS,
  BADGE_WARNING,
} from "@/lib/ui-tokens";

const PAGE_BG = "min-h-screen text-white";
const BLUSH_GLASS = `${GLASS_CARD} bg-violet-950/30`;
const BLUSH_PRIMARY =
  "rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-5 py-2.5 font-semibold text-white transition-all duration-200 shadow-lg shadow-violet-500/25 hover:scale-[1.02] hover:from-violet-400 hover:to-purple-400 hover:shadow-violet-500/40 active:scale-[0.98] disabled:opacity-60";
const BLUSH_SECONDARY =
  "rounded-xl border border-violet-400/15 bg-violet-950/30 px-5 py-2.5 text-white transition-all duration-200 hover:border-violet-500/25 hover:bg-violet-950/45 disabled:opacity-60";
const BLUSH_SMALL = `${SMALL_BUTTON} bg-violet-950/30 hover:bg-violet-950/45`;

type InboxRow = {
  id: number;
  report_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

// Parse "[Request Submitted] ..." style messages into structured data
function parseRequestMessage(message: string) {
  if (!message.startsWith("[Request Submitted]")) return null;
  const lines = message.split("\n");
  const title = lines[0].replace("[Request Submitted]", "").trim();
  const data: Record<string, string> = {};
  lines.slice(1).forEach((line) => {
    const colonIdx = line.indexOf(":");
    if (colonIdx > -1) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      data[key] = val;
    }
  });
  return { title, ...data };
}

export default function InboxPage() {
  const router = useRouter();
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
  const [auth, setAuth] = useState(() => getAuth());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingIds, setMarkingIds] = useState<number[]>([]);
  const [markAllBusy, setMarkAllBusy] = useState(false);

  // Re-read auth on focus and visibility change (no hard reload needed)
  useEffect(() => {
    const refresh = () => setAuth(getAuth());
    const onVisibility = () => { if (!document.hidden) refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const tokenHeaders = useCallback(async () => {
    const freshAuth = getAuth();
    const refreshed = await refreshAuthFromApi(freshAuth);
    const accessToken = refreshed?.accessToken || freshAuth?.accessToken;
    if (!accessToken) throw new Error("Please log in again.");
    return {
      Authorization: `Bearer ${accessToken}`,
      ...(refreshed?.stepUpToken ? { "X-Step-Up-Token": refreshed.stepUpToken } : {}),
    };
  }, []);

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
    const isBulk = ids.length > 1;
    if (isBulk) {
      setMarkAllBusy(true);
    } else {
      setMarkingIds((current) => Array.from(new Set([...current, ...ids])));
    }
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
      dispatchBadgeRefresh("inbox");
      await loadInbox();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      if (isBulk) {
        setMarkAllBusy(false);
      } else {
        setMarkingIds((current) => current.filter((id) => !ids.includes(id)));
      }
    }
  };

  useEffect(() => {
    if (!auth?.staffName || !auth?.accessToken) {
      router.replace("/login?next=%2Finbox");
      return;
    }
    void loadInbox();
  }, [auth, loadInbox, router]);

  const unreadIds = rows.filter((x) => !x.is_read).map((x) => x.id);

  return (
    <div className={PAGE_BG}>
      <motion.div
        className="mx-auto max-w-5xl space-y-5 px-4 py-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Inbox</h1>
          <p className={T_BODY}>Submitted requests and private replies from HQ/HR appear here.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={unreadCount ? BADGE_WARNING : BADGE_SUCCESS}>
            <Bell className="h-3 w-3" />
            {unreadCount} unread
          </span>
        </div>
      </div>

      <div className={`${BLUSH_GLASS} p-4`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className={T_SECTION}>Message Center</div>
            <div className={T_CAPTION}>Refresh your inbox or mark unread items as read after checking them.</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={loadInbox}
          disabled={loading}
          className={BLUSH_PRIMARY}
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={() => markRead(unreadIds)}
          disabled={!unreadIds.length || markAllBusy || Boolean(markingIds.length)}
          className={BLUSH_SECONDARY}
        >
          {markAllBusy ? "Marking..." : "Mark all unread as read"}
        </button>
        </div>

        {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const parsed = parseRequestMessage(row.message);
          return (
          <div key={row.id} className={`${BLUSH_GLASS} p-4 ${!row.is_read ? "border-l-2 border-violet-500" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {parsed
                  ? <ClipboardList className="h-4 w-4 text-violet-400 shrink-0 mt-0.5" />
                  : <Bell className="h-4 w-4 text-neutral-400 shrink-0 mt-0.5" />
                }
                <div className="text-xs text-neutral-400">{new Date(row.created_at).toLocaleString()}</div>
              </div>
              {!row.is_read ? (
                <button
                  type="button"
                  onClick={() => markRead([row.id])}
                  disabled={markAllBusy || markingIds.includes(row.id)}
                  className={BLUSH_SMALL}
                >
                  {markingIds.includes(row.id) ? "Marking..." : "Mark read"}
                </button>
              ) : (
                <span className={BADGE_SUCCESS}>
                  <MailOpen className="h-3 w-3" />
                  Read
                </span>
              )}
            </div>

            {parsed ? (
              <div className="mt-3">
                <div className="text-sm font-semibold text-violet-300 mb-2">{parsed.title}</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {parsed["Date"] && (
                    <div className="rounded-md bg-violet-950/40 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wide text-neutral-500">Date</div>
                      <div className="text-xs text-neutral-200">{parsed["Date"]}</div>
                    </div>
                  )}
                  {parsed["Urgency"] && (
                    <div className="rounded-md bg-violet-950/40 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wide text-neutral-500">Urgency</div>
                      <div className="text-xs text-neutral-200">{parsed["Urgency"]}</div>
                    </div>
                  )}
                  {parsed["Status"] && (
                    <div className="rounded-md bg-violet-950/40 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wide text-neutral-500">Status</div>
                      <div className="text-xs text-amber-300">{parsed["Status"]}</div>
                    </div>
                  )}
                  {parsed["Reason"] && (
                    <div className="rounded-md bg-violet-950/40 px-3 py-2 col-span-2 sm:col-span-3">
                      <div className="text-[10px] uppercase tracking-wide text-neutral-500">Reason</div>
                      <div className="text-xs text-neutral-200">{parsed["Reason"]}</div>
                    </div>
                  )}
                  {parsed["Requested time"] && (
                    <div className="rounded-md bg-violet-950/40 px-3 py-2 col-span-2 sm:col-span-3">
                      <div className="text-[10px] uppercase tracking-wide text-neutral-500">Requested time</div>
                      <div className="text-xs text-neutral-200">{parsed["Requested time"]}</div>
                    </div>
                  )}
                </div>
                {parsed["Request ID"] && (
                  <div className="mt-2 text-[10px] text-neutral-500 font-mono">ID: {parsed["Request ID"]}</div>
                )}
              </div>
            ) : (
              <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-200">{row.message}</div>
            )}
          </div>
          );
        })}
        {!loading && !error && !rows.length ? (
          <div className={`${BLUSH_GLASS} flex flex-col items-center gap-2 py-8`}>
            <MailOpen className="h-6 w-6 text-zinc-600" />
            <p className={T_CAPTION}>No messages.</p>
          </div>
        ) : null}
      </div>
      </motion.div>
    </div>
  );
}
