"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Building2, Calendar, CheckCircle2,
  Clock, Image as ImageIcon, Lock, Loader2, MapPin, MessageSquare,
  Send, User,
} from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  BADGE_ERROR, BADGE_INFO, BADGE_SUCCESS, BADGE_WARNING,
  GLASS_CARD, PRIMARY_BUTTON, SMALL_BUTTON, T_LABEL, T_SECTION, TEXTAREA_CLASS,
} from "@/lib/ui-tokens";

const STATUS_STEPS = [
  { value: "new",          label: "New",          badge: BADGE_ERROR },
  { value: "acknowledged", label: "Acknowledged", badge: BADGE_WARNING },
  { value: "in_progress",  label: "In Progress",  badge: BADGE_INFO },
  { value: "resolved",     label: "Resolved",     badge: BADGE_SUCCESS },
];

const STATUS_IDX: Record<string, number> = {
  new: 0, acknowledged: 1, in_progress: 2, resolved: 3,
};

const SEV_CFG: Record<string, { emoji: string; label: string; text: string; bg: string; ring: string; headerBg: string }> = {
  low:      { emoji: "🟢", label: "Low",      text: "text-emerald-400", bg: "bg-emerald-500/10",  ring: "ring-emerald-500/30",  headerBg: "from-emerald-500/8" },
  medium:   { emoji: "🟡", label: "Medium",   text: "text-amber-400",   bg: "bg-amber-500/10",    ring: "ring-amber-500/30",    headerBg: "from-amber-500/8" },
  high:     { emoji: "🟠", label: "High",     text: "text-orange-400",  bg: "bg-orange-500/10",   ring: "ring-orange-500/30",   headerBg: "from-orange-500/8" },
  critical: { emoji: "🔴", label: "Critical", text: "text-red-400",     bg: "bg-red-500/10",      ring: "ring-red-500/30",      headerBg: "from-red-500/8" },
};

type Attachment = {
  id: string; file_name: string; web_view_link?: string;
  mime_type?: string; uploader_name?: string;
};
type Reply = {
  id: string; author_name: string; author_role: string;
  message: string; created_at: string;
};
type InternalNote = {
  id: number; report_id: string; author_name: string;
  note: string; created_at: string;
};
type IncidentDetail = {
  id: string; city: string; branch: string; reporter_name: string;
  category: string; severity: string; description: string;
  incident_datetime: string; status: string; created_at: string;
  updated_at: string; replies: Reply[]; attachments: Attachment[];
  internal_notes: InternalNote[];
};

function fmtDt(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function AdminIncidentDetailPage() {
  const params   = useParams();
  const router   = useRouter();
  const reportId = String(params?.id || "");

  const [item, setItem]       = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const [replyText, setReplyText]           = useState("");
  const [replying, setReplying]             = useState(false);
  const [replyError, setReplyError]         = useState("");
  const [replySuccess, setReplySuccess]     = useState("");
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError]       = useState("");

  const [noteText, setNoteText]           = useState("");
  const [savingNote, setSavingNote]       = useState(false);
  const [noteError, setNoteError]         = useState("");
  const [noteSuccess, setNoteSuccess]     = useState("");

  const fetchDetail = useCallback(async () => {
    const a = getAuth();
    if (!a || !reportId) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/incidents/${reportId}`, {
        cache: "no-store", headers: getAuthHeaders(a),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setItem(data.item || null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }, [reportId]);

  useEffect(() => { void fetchDetail(); }, [fetchDetail]);

  const handleStatusChange = async (newStatus: string) => {
    const a = getAuth();
    if (!a || !item) return;
    setStatusUpdating(true); setStatusError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/incidents/${reportId}/status`, {
        method: "PATCH", headers: getAuthHeaders(a),
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(await res.text());
      setItem((prev) => prev ? { ...prev, status: newStatus } : prev);
    } catch (e: unknown) {
      setStatusError(e instanceof Error ? e.message : "Failed to update");
    } finally { setStatusUpdating(false); }
  };

  const handleSaveNote = async () => {
    const a = getAuth();
    if (!a || !noteText.trim()) return;
    setSavingNote(true); setNoteError(""); setNoteSuccess("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/incidents/${reportId}/notes`, {
        method: "POST", headers: getAuthHeaders(a),
        body: JSON.stringify({ note: noteText.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNoteText("");
      setNoteSuccess("Note saved.");
      void fetchDetail();
    } catch (e: unknown) {
      setNoteError(e instanceof Error ? e.message : "Failed to save");
    } finally { setSavingNote(false); }
  };

  const handleReply = async () => {
    const a = getAuth();
    if (!a || !replyText.trim()) return;
    setReplying(true); setReplyError(""); setReplySuccess("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/incidents/${reportId}/replies`, {
        method: "POST", headers: getAuthHeaders(a),
        body: JSON.stringify({ message: replyText.trim(), author_role: "HQ" }),
      });
      if (!res.ok) throw new Error(await res.text());
      setReplyText("");
      setReplySuccess("Reply sent.");
      void fetchDetail();
    } catch (e: unknown) {
      setReplyError(e instanceof Error ? e.message : "Failed to send reply");
    } finally { setReplying(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-zinc-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…
      </div>
    );
  }
  if (error || !item) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-400">
          {error || "Incident not found."}
        </div>
      </div>
    );
  }

  const sev            = SEV_CFG[item.severity] ?? SEV_CFG.medium;
  const currentStepIdx = STATUS_IDX[item.status] ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">

      {/* ── Back ──────────────────────────────────────────────────── */}
      <button className={`${SMALL_BUTTON} flex items-center gap-1.5`} onClick={() => router.back()}>
        <ArrowLeft className="h-3.5 w-3.5" />Back to List
      </button>

      {/* ── Hero card ─────────────────────────────────────────────── */}
      <div className={`${GLASS_CARD} overflow-hidden`}>
        {/* Severity-tinted header */}
        <div className={`bg-gradient-to-br ${sev.headerBg} to-transparent border-b border-white/8 p-5`}>
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl ${sev.bg} ring-1 ${sev.ring}`}>
              {sev.emoji}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold text-white">{item.category}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={`text-sm font-medium ${sev.text}`}>{sev.label} severity</span>
                <span className="text-zinc-600">·</span>
                <span className="flex items-center gap-1 text-xs text-zinc-500">
                  <Clock className="h-3 w-3" />{fmtDt(item.created_at)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Status progress stepper */}
        <div className="border-b border-white/8 px-5 py-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Progress</p>
          <div className="flex items-center">
            {STATUS_STEPS.map((step, idx) => {
              const done    = idx < currentStepIdx;
              const current = idx === currentStepIdx;
              return (
                <div key={step.value} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center">
                    <div className={[
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all",
                      done    ? "bg-emerald-500 text-white" :
                      current ? "bg-violet-500 text-white ring-4 ring-violet-500/20" :
                                "bg-zinc-800 text-zinc-600",
                    ].join(" ")}>
                      {done ? <CheckCircle2 className="h-4 w-4" /> : <span>{idx + 1}</span>}
                    </div>
                    <p className={[
                      "mt-1.5 hidden text-center text-[10px] font-medium sm:block",
                      current ? "text-violet-300" : done ? "text-emerald-400" : "text-zinc-600",
                    ].join(" ")}>
                      {step.label}
                    </p>
                  </div>
                  {idx < STATUS_STEPS.length - 1 && (
                    <div className={`mx-1 h-0.5 flex-1 transition-all ${idx < currentStepIdx ? "bg-emerald-500/40" : "bg-zinc-800"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Meta grid */}
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {[
            { Icon: Building2, label: "Branch",  value: item.branch },
            { Icon: MapPin,    label: "City",     value: item.city === "dubai" ? "🇦🇪 Dubai" : "🇵🇭 Manila" },
            { Icon: User,      label: "Reporter", value: item.reporter_name },
            ...(item.incident_datetime
              ? [{ Icon: Calendar, label: "Incident Date & Time", value: fmtDt(item.incident_datetime) }]
              : []),
          ].map(({ Icon, label, value }) => (
            <div key={label} className="flex items-start gap-2.5 rounded-xl border border-white/6 bg-white/3 px-3.5 py-2.5">
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
                <p className="mt-0.5 text-sm text-white">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Description ───────────────────────────────────────────── */}
      <div className={`${GLASS_CARD} p-5`}>
        <p className={`${T_LABEL} mb-2`}>Description</p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{item.description}</p>
      </div>

      {/* ── Attachments ───────────────────────────────────────────── */}
      {(item.attachments?.length ?? 0) > 0 && (
        <div className={`${GLASS_CARD} p-5`}>
          <p className={`${T_LABEL} mb-3`}>Attachments</p>
          <div className="flex flex-wrap gap-3">
            {item.attachments.map((att) => {
              const isImage = (att.mime_type || "").startsWith("image/");
              return isImage && att.web_view_link ? (
                <a key={att.id} href={att.web_view_link} target="_blank" rel="noopener noreferrer"
                  className="group relative overflow-hidden rounded-xl border border-white/10 transition-all hover:border-violet-500/40 hover:shadow-lg hover:shadow-violet-500/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={att.web_view_link.replace("/view", "/preview")} alt={att.file_name}
                    className="h-36 w-52 object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-2 text-[10px] text-zinc-300 truncate">
                    {att.file_name}
                    {att.uploader_name && <span className="ml-1 text-zinc-500">by {att.uploader_name}</span>}
                  </div>
                </a>
              ) : (
                <a key={att.id} href={att.web_view_link || "#"} target="_blank" rel="noopener noreferrer"
                  className={`${SMALL_BUTTON} flex items-center gap-2`}>
                  <ImageIcon className="h-4 w-4" />
                  <span className="max-w-[180px] truncate">{att.file_name}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Status update ─────────────────────────────────────────── */}
      <div className={`${GLASS_CARD} p-5`}>
        <p className={`${T_SECTION} mb-3`}>Update Status</p>
        <div className="flex flex-wrap gap-2">
          {STATUS_STEPS.map((opt) => {
            const isCurrent = item.status === opt.value;
            return (
              <button key={opt.value}
                disabled={isCurrent || statusUpdating}
                className={[
                  "rounded-xl border px-4 py-2 text-sm font-medium transition-all duration-150",
                  isCurrent
                    ? `${opt.badge} cursor-default`
                    : "border-white/10 bg-white/5 text-zinc-400 hover:border-violet-400/30 hover:bg-violet-500/10 hover:text-violet-200 disabled:opacity-50",
                ].join(" ")}
                onClick={() => handleStatusChange(opt.value)}>
                {statusUpdating && !isCurrent && <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />}
                {opt.label}
              </button>
            );
          })}
        </div>
        {statusError && <p className="mt-2.5 text-xs text-red-400">{statusError}</p>}
      </div>

      {/* ── HQ Internal Notes ─────────────────────────────────────── */}
      <div className={`${GLASS_CARD} overflow-hidden`}>
        {/* Header — clearly marked HQ-only */}
        <div className="flex items-center gap-2.5 border-b border-amber-500/15 bg-amber-500/5 px-5 py-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 ring-1 ring-amber-500/25">
            <Lock className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">HQ Internal Notes</p>
            <p className="text-[10px] text-amber-500/70">Only visible to HQ staff — not shown to branch reporters</p>
          </div>
          {(item.internal_notes?.length ?? 0) > 0 && (
            <span className="ml-auto rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-300">
              {item.internal_notes.length} {item.internal_notes.length === 1 ? "note" : "notes"}
            </span>
          )}
        </div>

        {/* Note thread */}
        <div className="divide-y divide-white/5">
          {(item.internal_notes?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center py-8">
              <Lock className="h-7 w-7 text-zinc-700" />
              <p className="mt-2 text-sm text-zinc-500">No internal notes yet</p>
              <p className="mt-0.5 text-xs text-zinc-600">Add a note below to record HQ observations</p>
            </div>
          ) : (
            item.internal_notes.map((n) => (
              <div key={n.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-300 ring-1 ring-amber-500/25">
                    {n.author_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">{n.author_name}</span>
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">HQ</span>
                      <span className="ml-auto flex items-center gap-1 text-[11px] text-zinc-600">
                        <Clock className="h-3 w-3" />{fmtDt(n.created_at)}
                      </span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{n.note}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Note composer */}
        <div className="space-y-3 border-t border-amber-500/15 bg-amber-500/3 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-500/70">Add Internal Note</p>
          <textarea
            className="w-full rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none transition-all duration-200 focus:border-amber-500/40 focus:ring-2 focus:ring-amber-500/15 resize-none min-h-[80px]"
            placeholder="Record observations, root cause analysis, action items, lessons learned…"
            value={noteText} onChange={(e) => setNoteText(e.target.value)}
          />
          {noteSuccess && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />{noteSuccess}
            </div>
          )}
          {noteError && <p className="text-xs text-red-400">{noteError}</p>}
          <div className="flex justify-end">
            <button
              onClick={handleSaveNote}
              disabled={savingNote || !noteText.trim()}
              className="inline-flex items-center rounded-xl border border-amber-500/30 bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-300 transition-all hover:bg-amber-500/25 disabled:opacity-50"
            >
              {savingNote ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
              Save Note
            </button>
          </div>
        </div>
      </div>

      {/* ── Replies ───────────────────────────────────────────────── */}
      <div className={`${GLASS_CARD} overflow-hidden`}>
        <div className="border-b border-white/8 px-5 py-4">
          <p className={T_SECTION}>
            <MessageSquare className="mr-2 inline h-5 w-5 text-violet-400" />
            HQ Comments &amp; Replies
          </p>
        </div>

        <div className="divide-y divide-white/5">
          {(item.replies?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center py-10">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800">
                <MessageSquare className="h-5 w-5 text-zinc-600" />
              </div>
              <p className="mt-2.5 text-sm text-zinc-500">No replies yet</p>
              <p className="mt-0.5 text-xs text-zinc-600">Use the form below to send the first reply</p>
            </div>
          ) : (
            item.replies.map((reply) => (
              <div key={reply.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-300 ring-1 ring-violet-500/25">
                    {reply.author_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">{reply.author_name}</span>
                      <span className="rounded-full border border-violet-500/20 bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-400">
                        {reply.author_role}
                      </span>
                      <span className="ml-auto flex items-center gap-1 text-[11px] text-zinc-600">
                        <Clock className="h-3 w-3" />{fmtDt(reply.created_at)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">{reply.message}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Reply composer */}
        <div className="space-y-3 border-t border-white/8 bg-white/3 px-5 py-4">
          <p className={T_LABEL}>Send a Reply</p>
          <textarea className={`${TEXTAREA_CLASS} min-h-[80px]`}
            placeholder="Write a comment or update for the staff member…"
            value={replyText} onChange={(e) => setReplyText(e.target.value)} />
          {replySuccess && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />{replySuccess}
            </div>
          )}
          {replyError && <p className="text-xs text-red-400">{replyError}</p>}
          <div className="flex justify-end">
            <button className={PRIMARY_BUTTON} onClick={handleReply}
              disabled={replying || !replyText.trim()}>
              {replying
                ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                : <Send className="mr-2 inline h-4 w-4" />}
              Send Reply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
