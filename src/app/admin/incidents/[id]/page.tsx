"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Send,
} from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
  GLASS_CARD,
  PRIMARY_BUTTON,
  SELECT_CLASS,
  SMALL_BUTTON,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
  TEXTAREA_CLASS,
} from "@/lib/ui-tokens";

const STATUS_OPTIONS = [
  { value: "new", label: "新規", badge: BADGE_ERROR },
  { value: "acknowledged", label: "確認中", badge: BADGE_WARNING },
  { value: "in_progress", label: "対応中", badge: BADGE_INFO },
  { value: "resolved", label: "解決済", badge: BADGE_SUCCESS },
];

const SEVERITY_EMOJI: Record<string, string> = {
  low: "🟢",
  medium: "🟡",
  high: "🟠",
  critical: "🔴",
};

type Attachment = {
  id: string;
  file_name: string;
  web_view_link?: string;
  mime_type?: string;
  uploader_name?: string;
};

type Reply = {
  id: string;
  author_name: string;
  author_role: string;
  message: string;
  created_at: string;
};

type IncidentDetail = {
  id: string;
  city: string;
  branch: string;
  reporter_name: string;
  category: string;
  severity: string;
  description: string;
  incident_datetime: string;
  status: string;
  created_at: string;
  updated_at: string;
  replies: Reply[];
  attachments: Attachment[];
};

function fmtDt(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function BadgeFor({ status }: { status: string }) {
  const opt = STATUS_OPTIONS.find((s) => s.value === status);
  if (!opt) return <span className={BADGE_INFO}>{status}</span>;
  return <span className={opt.badge}>{opt.label}</span>;
}

export default function AdminIncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = String(params?.id || "");

  const [item, setItem] = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState("");
  const [replySuccess, setReplySuccess] = useState("");

  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError] = useState("");

  const fetchDetail = useCallback(async () => {
    const a = getAuth();
    if (!a || !reportId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/incidents/${reportId}`, {
        cache: "no-store",
        headers: getAuthHeaders(a),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setItem(data.item || null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  const handleStatusChange = async (newStatus: string) => {
    const a = getAuth();
    if (!a || !item) return;
    setStatusUpdating(true);
    setStatusError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/incidents/${reportId}/status`, {
        method: "PATCH",
        headers: getAuthHeaders(a),
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(await res.text());
      setItem((prev) => prev ? { ...prev, status: newStatus } : prev);
    } catch (e: unknown) {
      setStatusError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleReply = async () => {
    const a = getAuth();
    if (!a || !replyText.trim()) return;
    setReplying(true);
    setReplyError("");
    setReplySuccess("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/incidents/${reportId}/replies`, {
        method: "POST",
        headers: getAuthHeaders(a),
        body: JSON.stringify({
          message: replyText.trim(),
          author_role: "HQ",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setReplyText("");
      setReplySuccess("返信を送信しました。");
      void fetchDetail();
    } catch (e: unknown) {
      setReplyError(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setReplying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-zinc-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        読み込み中…
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-400">
          {error || "インシデントが見つかりません。"}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button
          className={`${SMALL_BUTTON} flex items-center gap-1.5`}
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          戻る
        </button>
        <AlertTriangle className="h-5 w-5 text-amber-400" />
        <h1 className="text-xl font-semibold text-white">{item.category}</h1>
        <BadgeFor status={item.status} />
      </div>

      {/* Meta */}
      <div className={`${GLASS_CARD} grid gap-4 p-5 sm:grid-cols-2`}>
        <div>
          <p className={T_LABEL}>重要度</p>
          <p className="mt-1 text-sm text-white">
            {SEVERITY_EMOJI[item.severity] ?? "🟡"} {item.severity.toUpperCase()}
          </p>
        </div>
        <div>
          <p className={T_LABEL}>店舗</p>
          <p className="mt-1 text-sm text-white">{item.branch}</p>
        </div>
        <div>
          <p className={T_LABEL}>都市</p>
          <p className="mt-1 text-sm text-white">
            {item.city === "dubai" ? "🇦🇪 Dubai" : "🇵🇭 Manila"}
          </p>
        </div>
        <div>
          <p className={T_LABEL}>投稿者</p>
          <p className="mt-1 text-sm text-white">{item.reporter_name}</p>
        </div>
        {item.incident_datetime && (
          <div>
            <p className={T_LABEL}>発生日時</p>
            <p className="mt-1 text-sm text-white">{fmtDt(item.incident_datetime)}</p>
          </div>
        )}
        <div>
          <p className={T_LABEL}>報告日時</p>
          <p className="mt-1 text-sm text-zinc-300">{fmtDt(item.created_at)}</p>
        </div>
      </div>

      {/* Description */}
      <div className={`${GLASS_CARD} p-5`}>
        <p className={T_LABEL}>内容</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
          {item.description}
        </p>
      </div>

      {/* Attachments */}
      {item.attachments?.length > 0 && (
        <div className={`${GLASS_CARD} p-5`}>
          <p className={T_LABEL}>添付画像</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {item.attachments.map((att) => {
              const isImage = (att.mime_type || "").startsWith("image/");
              return isImage && att.web_view_link ? (
                <a
                  key={att.id}
                  href={att.web_view_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative overflow-hidden rounded-xl border border-white/10 transition-all hover:border-violet-500/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={att.web_view_link.replace("/view", "/preview")}
                    alt={att.file_name}
                    className="h-36 w-52 object-cover transition-transform duration-200 group-hover:scale-105"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[10px] text-zinc-300 truncate">
                    {att.file_name}
                    {att.uploader_name && <span className="ml-1 text-zinc-500">by {att.uploader_name}</span>}
                  </div>
                </a>
              ) : (
                <a
                  key={att.id}
                  href={att.web_view_link || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${SMALL_BUTTON} flex items-center gap-2`}
                >
                  <ImageIcon className="h-4 w-4" />
                  <span className="max-w-[180px] truncate">{att.file_name}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Status change */}
      <div className={`${GLASS_CARD} p-5`}>
        <p className={T_SECTION}>ステータス変更</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              disabled={item.status === opt.value || statusUpdating}
              className={[
                item.status === opt.value
                  ? `${opt.badge} cursor-default`
                  : `${SMALL_BUTTON} opacity-70 hover:opacity-100`,
                "transition-all duration-150",
              ].join(" ")}
              onClick={() => handleStatusChange(opt.value)}
            >
              {statusUpdating && item.status !== opt.value ? (
                <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
              ) : null}
              {opt.label}
            </button>
          ))}
        </div>
        {statusError && (
          <p className="mt-2 text-xs text-red-400">{statusError}</p>
        )}
      </div>

      {/* Replies */}
      <div className={`${GLASS_CARD} p-5 space-y-4`}>
        <p className={T_SECTION}>
          <MessageSquare className="mr-2 inline h-5 w-5 text-violet-400" />
          本部コメント・返信
        </p>

        {item.replies?.length === 0 && (
          <p className="text-sm text-zinc-500">まだ返信はありません。</p>
        )}

        {item.replies?.map((reply) => (
          <div
            key={reply.id}
            className="rounded-xl border border-violet-500/20 bg-violet-500/8 px-4 py-3"
          >
            <div className="mb-1.5 flex items-center gap-2 text-xs text-zinc-400">
              <span className="font-semibold text-violet-300">{reply.author_name}</span>
              <span className="rounded-full border border-violet-500/20 bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-300">
                {reply.author_role}
              </span>
              <span className="flex items-center gap-1 ml-auto">
                <Clock className="h-3 w-3" />
                {fmtDt(reply.created_at)}
              </span>
            </div>
            <p className="text-sm text-zinc-200">{reply.message}</p>
          </div>
        ))}

        {/* Reply form */}
        <div className="space-y-3 border-t border-white/8 pt-4">
          <p className={T_LABEL}>返信を送る</p>
          <textarea
            className={`${TEXTAREA_CLASS} min-h-[80px]`}
            placeholder="スタッフへのコメントを入力…"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
          />

          {replySuccess && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {replySuccess}
            </div>
          )}
          {replyError && (
            <p className="text-xs text-red-400">{replyError}</p>
          )}

          <div className="flex justify-end">
            <button
              className={PRIMARY_BUTTON}
              onClick={handleReply}
              disabled={replying || !replyText.trim()}
            >
              {replying ? (
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 inline h-4 w-4" />
              )}
              送信
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
