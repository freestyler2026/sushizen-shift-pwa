"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Bell, MailOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
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

export default function InboxPage() {
  const router = useRouter();
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
  const auth = useMemo(() => getAuth(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingIds, setMarkingIds] = useState<number[]>([]);
  const [markAllBusy, setMarkAllBusy] = useState(false);

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
          <p className={T_BODY}>Private acknowledgements and replies from HQ/HR appear here.</p>
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
        {rows.map((row) => (
          <div key={row.id} className={`${BLUSH_GLASS} p-4`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-neutral-400">{row.created_at}</div>
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
            <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-200">{row.message}</div>
          </div>
        ))}
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
