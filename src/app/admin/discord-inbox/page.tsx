"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare, Send, CheckCircle, XCircle, Clock,
  RefreshCw, Bell, BellOff, Hash, User, ChevronDown, ChevronUp,
} from "lucide-react";
import { getAuth, canAccessAdminNav, tryRefreshAccessToken } from "@/lib/auth";
import { GLASS_CARD, PRIMARY_BUTTON, T_PAGE_TITLE, BADGE_SUCCESS, BADGE_WARNING } from "@/lib/ui-tokens";
import { API_BASE } from "@/lib/api";

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const doFetch = () => {
    const auth = getAuth();
    const token = auth?.accessToken || "";
    return fetch(url, {
      ...options,
      headers: {
        ...(options.headers as Record<string, string> || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };
  let res = await doFetch();
  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) res = await doFetch();
  }
  return res;
}

// Management Discord User ID → display name mapping
const MANAGEMENT_NAMES: Record<string, string> = {
  "871028335315124225": "Manager 1",
  "844419400240070656": "Manager 2",
  "448139655448100865": "Manager 3",
  "871611552103530516": "Manager 4",
  "887303149541527604": "Manager 5",
  "1321079656711196735": "Manager 6",
  "1203861629905670314": "Manager 7",
  "1306051804349333566": "Manager 8",
  "1417146528971358328": "Manager 9",
  "1458636250171965551": "Manager 10",
};

interface Mention {
  id: number;
  message_id: string;
  channel_id: string;
  channel_name: string;
  author_id: string;
  author_name: string;
  author_avatar: string;
  content: string;
  mentioned_user_ids: string[];
  discord_created_at: string;
  received_at: string;
  status: "new" | "replied" | "dismissed";
  replied_at?: string;
  replied_by?: string;
  reply_content?: string;
}

type StatusFilter = "new" | "replied" | "all";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "replied") return <span className={BADGE_SUCCESS}><CheckCircle className="h-3 w-3" />Replied</span>;
  if (status === "dismissed") return <span className="inline-flex items-center gap-1.5 rounded-full bg-white/8 border border-white/15 px-2.5 py-0.5 text-xs font-medium text-white/50"><XCircle className="h-3 w-3" />Dismissed</span>;
  return <span className={BADGE_WARNING}><Clock className="h-3 w-3" />New</span>;
}

function MentionCard({
  mention,
  onReply,
  onDismiss,
  staffName,
}: {
  mention: Mention;
  onReply: (id: number, content: string, channelId: string) => Promise<void>;
  onDismiss: (id: number) => Promise<void>;
  staffName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const isNew = mention.status === "new";

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await onReply(mention.id, replyText.trim(), mention.channel_id);
      setReplyText("");
      setExpanded(false);
    } finally {
      setSending(false);
    }
  };

  const mentionedNames = mention.mentioned_user_ids
    .map((id) => MANAGEMENT_NAMES[id] || `User ${id.slice(-4)}`)
    .join(", ");

  return (
    <div className={`${GLASS_CARD} p-4 transition-all duration-200 ${isNew ? "border-amber-500/30 bg-amber-500/5" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {mention.author_avatar ? (
            <img src={mention.author_avatar} alt={mention.author_name}
              className="h-9 w-9 rounded-full shrink-0 ring-2 ring-white/10" />
          ) : (
            <div className="h-9 w-9 rounded-full bg-indigo-500/30 flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-indigo-300" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-white text-sm">{mention.author_name}</span>
              <span className="text-white/40 text-xs flex items-center gap-1">
                <Hash className="h-3 w-3" />{mention.channel_name}
              </span>
              <span className="text-white/35 text-xs">{timeAgo(mention.received_at)}</span>
            </div>
            <div className="text-xs text-violet-300 mt-0.5">→ {mentionedNames}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={mention.status} />
          <button onClick={() => setExpanded((p) => !p)}
            className="text-white/40 hover:text-white/70 transition-colors">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Message content */}
      <div className="mt-3 ml-12 text-sm text-white/80 leading-relaxed whitespace-pre-wrap break-words">
        {mention.content}
      </div>

      {/* Reply / dismiss section */}
      {expanded && (
        <div className="mt-4 ml-12 space-y-3">
          {mention.status === "replied" && mention.reply_content && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
              <div className="text-xs text-emerald-400 mb-1 font-medium">
                Replied by {mention.replied_by} · {timeAgo(mention.replied_at!)}
              </div>
              <div className="text-sm text-white/75 whitespace-pre-wrap">{mention.reply_content}</div>
            </div>
          )}

          {isNew && (
            <>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your reply to Discord..."
                rows={3}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleReply}
                  disabled={sending || !replyText.trim()}
                  className={`${PRIMARY_BUTTON} flex items-center gap-2 text-sm py-2 px-4`}>
                  <Send className="h-3.5 w-3.5" />
                  {sending ? "Sending…" : "Reply on Discord"}
                </button>
                <button
                  onClick={() => void onDismiss(mention.id)}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/60 hover:text-white/80 hover:bg-white/10 transition-all">
                  Dismiss
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function DiscordInboxPage() {
  const router = useRouter();
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("new");
  const [newCount, setNewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [discordUserId, setDiscordUserId] = useState("");
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const auth = getAuth();
  const staffName = auth?.staffName || "";

  // Auth guard — redirect immediately if not logged in or insufficient role
  useEffect(() => {
    if (!auth) { router.replace("/week"); return; }
    const role = (auth.role || "").toUpperCase();
    if (role !== "HQ" && role !== "ADMIN" && !canAccessAdminNav(auth)) {
      router.replace("/week");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMentions = useCallback(async (filter: StatusFilter = statusFilter) => {
    try {
      const res = await authFetch(
        `${API_BASE}/api/admin/discord/mentions?status=${filter}&limit=100`,
        { cache: "no-store" }
      );
      if (res.status === 401) { router.replace("/week"); return; }
      if (res.status === 403) { setError("アクセス権限がありません。管理者にご連絡ください。"); setLoading(false); return; }
      const data = await res.json();
      if (data.ok) {
        setMentions(data.items || []);
        setNewCount(data.new_count || 0);
      }
    } catch {
      setError("Failed to load mentions.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, router]);

  useEffect(() => {
    void fetchMentions(statusFilter);
    refreshRef.current = setInterval(() => void fetchMentions(statusFilter), 30_000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [statusFilter, fetchMentions]);

  // Check push notification state
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.getRegistration("/sw-push.js").then((reg) => {
      if (!reg) return;
      reg.pushManager.getSubscription().then((sub) => {
        setPushEnabled(!!sub);
      });
    });
  }, []);

  const enablePush = async () => {
    if (!discordUserId.trim()) {
      alert("Please enter your Discord User ID first.");
      return;
    }
    setPushLoading(true);
    try {
      // Register service worker
      const reg = await navigator.serviceWorker.register("/sw-push.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      // Get VAPID public key
      const keyRes = await authFetch(`${API_BASE}/api/admin/discord/vapid-public-key`);
      const keyData = await keyRes.json();
      if (!keyData.ok) throw new Error("VAPID key not available");

      const vapidKey = keyData.public_key;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      });

      const subJson = subscription.toJSON();
      await authFetch(`${API_BASE}/api/admin/discord/push-subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discord_user_id: discordUserId.trim(),
          staff_name: staffName,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys?.p256dh || "",
          auth: subJson.keys?.auth || "",
        }),
      });

      setPushEnabled(true);
      alert("✅ Push notifications enabled!");
    } catch (e: unknown) {
      alert("Failed to enable push: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setPushLoading(false);
    }
  };

  const disablePush = async () => {
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await authFetch(`${API_BASE}/api/admin/discord/push-unsubscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
      }
      setPushEnabled(false);
    } catch {
      alert("Failed to disable push.");
    } finally {
      setPushLoading(false);
    }
  };

  const handleReply = async (id: number, content: string, channelId: string) => {
    const res = await authFetch(`${API_BASE}/api/admin/discord/mentions/${id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, channel_id: channelId }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.detail || "Reply failed");
    await fetchMentions(statusFilter);
  };

  const handleDismiss = async (id: number) => {
    await authFetch(`${API_BASE}/api/admin/discord/mentions/${id}/dismiss`, {
      method: "POST",
    });
    await fetchMentions(statusFilter);
  };

  const FILTERS: { label: string; value: StatusFilter }[] = [
    { label: "New", value: "new" },
    { label: "Replied", value: "replied" },
    { label: "All", value: "all" },
  ];

  return (
    <div className="min-h-screen bg-[#0e0f1a] px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-1">
              Discord Inbox
            </p>
            <h1 className={T_PAGE_TITLE}>Mentions</h1>
            <p className="mt-1 text-sm text-white/50">
              Management @mentions from Discord channels
            </p>
          </div>
          <div className="flex items-center gap-2">
            {newCount > 0 && (
              <span className={`${BADGE_WARNING} text-sm px-3 py-1`}>
                <Clock className="h-3.5 w-3.5" />{newCount} new
              </span>
            )}
            <button
              onClick={() => void fetchMentions(statusFilter)}
              className="rounded-xl border border-white/15 bg-white/5 p-2.5 text-white/60 hover:text-white hover:bg-white/10 transition-all">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Push notification setup */}
        <div className={`${GLASS_CARD} p-4`}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {pushEnabled
                ? <Bell className="h-5 w-5 text-emerald-400" />
                : <BellOff className="h-5 w-5 text-white/40" />}
              <div>
                <div className="text-sm font-medium text-white">
                  {pushEnabled ? "Push notifications ON" : "Push notifications OFF"}
                </div>
                <div className="text-xs text-white/45">
                  {pushEnabled ? "You'll be notified when mentioned" : "Enable to get notified on this device"}
                </div>
              </div>
            </div>
            {!pushEnabled ? (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={discordUserId}
                  onChange={(e) => setDiscordUserId(e.target.value)}
                  placeholder="Your Discord User ID"
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-violet-500 w-44"
                />
                <button
                  onClick={() => void enablePush()}
                  disabled={pushLoading}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 transition-colors disabled:opacity-60">
                  {pushLoading ? "…" : "Enable"}
                </button>
              </div>
            ) : (
              <button
                onClick={() => void disablePush()}
                disabled={pushLoading}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/60 hover:text-white hover:bg-white/10 transition-all">
                {pushLoading ? "…" : "Disable"}
              </button>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1 w-fit">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setStatusFilter(f.value); setLoading(true); }}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
                statusFilter === f.value
                  ? "bg-violet-600 text-white shadow"
                  : "text-white/50 hover:text-white/75"
              }`}>
              {f.label}
              {f.value === "new" && newCount > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500 text-white text-xs px-1.5 py-0.5">
                  {newCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Mention list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`${GLASS_CARD} h-24 animate-pulse`} />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>
        ) : mentions.length === 0 ? (
          <div className={`${GLASS_CARD} p-12 flex flex-col items-center gap-3 text-center`}>
            <MessageSquare className="h-10 w-10 text-white/20" />
            <p className="text-white/50 text-sm">No {statusFilter === "all" ? "" : statusFilter} mentions</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mentions.map((m) => (
              <MentionCard
                key={m.id}
                mention={m}
                onReply={handleReply}
                onDismiss={handleDismiss}
                staffName={staffName}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

