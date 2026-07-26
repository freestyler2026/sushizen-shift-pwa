"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
  GLASS_CARD,
  T_PAGE_TITLE,
} from "@/lib/ui-tokens";
import { getAuth } from "@/lib/auth";
import SelectDark from "@/components/SelectDark";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Inquiry {
  id: number;
  city: string;
  staff_name: string;
  subject: string;
  status: "open" | "in_progress" | "resolved";
  created_at: string;
  updated_at: string;
  reply_count: number;
  last_reply_at: string | null;
}

interface InquiryReply {
  id: number;
  inquiry_id: number;
  sender_name: string;
  sender_role: string;
  body: string;
  is_from_staff: boolean;
  created_at: string;
}

interface InquiryThread {
  found: boolean;
  inquiry: Inquiry & { body: string };
  replies: InquiryReply[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDateShort(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
}

function statusBadge(status: string) {
  if (status === "open") return <span className={BADGE_WARNING}>Open</span>;
  if (status === "in_progress") return <span className={BADGE_INFO}>In Progress</span>;
  if (status === "resolved") return <span className={BADGE_SUCCESS}>Resolved</span>;
  return <span className={BADGE_ERROR}>{status}</span>;
}

function apiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const headers: Record<string, string> = {};
  const method = (opts?.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") headers["Content-Type"] = "application/json";
  if (auth?.accessToken) headers["Authorization"] = `Bearer ${auth.accessToken}`;
  return fetch(path, { ...opts, headers: { ...headers, ...(opts?.headers as Record<string, string> ?? {}) } });
}

async function extractErr(r: Response, fallback: string): Promise<string> {
  try {
    const j = await r.json() as { detail?: string };
    return j.detail || fallback;
  } catch { return fallback; }
}

const ALLOWED_ROLES = new Set(["ADMIN", "HQ", "MANILA_MANAGEMENT", "DUBAI_MANAGEMENT", "HR_MANAGER"]);

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PayrollInquiriesPage() {
  const router = useRouter();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [selectedThread, setSelectedThread] = useState<InquiryThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [error, setError] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [replyBody, setReplyBody] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const loadRef = useRef(0);

  // Auth guard
  useEffect(() => {
    const auth = getAuth();
    if (!auth || !ALLOWED_ROLES.has(auth.role ?? "")) {
      router.replace("/");
    }
  }, [router]);

  const loadInquiries = useCallback(async () => {
    const id = ++loadRef.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (cityFilter !== "all") params.set("city", cityFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const r = await apiFetch(`/api/admin/payroll/inquiries?${params.toString()}`);
      if (loadRef.current !== id) return;
      if (!r.ok) { setError(await extractErr(r, "Failed to load inquiries.")); return; }
      const data = await r.json() as Inquiry[];
      if (loadRef.current !== id) return;
      setInquiries(data);
    } catch { if (loadRef.current === id) setError("Failed to load inquiries."); }
    finally { if (loadRef.current === id) setLoading(false); }
  }, [cityFilter, statusFilter]);

  useEffect(() => {
    void loadInquiries();
  }, [loadInquiries]);

  const loadThread = useCallback(async (id: number) => {
    setThreadLoading(true);
    try {
      const r = await apiFetch(`/api/admin/payroll/inquiries/${id}`);
      if (!r.ok) { setError(await extractErr(r, "Failed to load thread.")); return; }
      const data = await r.json() as InquiryThread;
      setSelectedThread(data);
    } catch { setError("Failed to load thread."); }
    finally { setThreadLoading(false); }
  }, []);

  const submitReply = useCallback(async () => {
    if (!selectedThread || !replyBody.trim()) return;
    setReplySubmitting(true);
    try {
      const r = await apiFetch(`/api/admin/payroll/inquiries/${selectedThread.inquiry.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ body: replyBody.trim() }),
      });
      if (!r.ok) { setError(await extractErr(r, "Failed to send reply.")); return; }
      setReplyBody("");
      await loadThread(selectedThread.inquiry.id);
      void loadInquiries();
    } catch { setError("Failed to send reply."); }
    finally { setReplySubmitting(false); }
  }, [selectedThread, replyBody, loadThread, loadInquiries]);

  const updateStatus = useCallback(async (newStatus: string) => {
    if (!selectedThread) return;
    setStatusUpdating(true);
    try {
      const r = await apiFetch(`/api/admin/payroll/inquiries/${selectedThread.inquiry.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      if (!r.ok) { setError(await extractErr(r, "Failed to update status.")); return; }
      await loadThread(selectedThread.inquiry.id);
      void loadInquiries();
    } catch { setError("Failed to update status."); }
    finally { setStatusUpdating(false); }
  }, [selectedThread, loadThread, loadInquiries]);

  // ── Thread view ────────────────────────────────────────────────────────────
  if (selectedThread || threadLoading) {
    const thread = selectedThread;
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
        {/* Thread header */}
        <div className="border-b border-white/10 px-4 py-4 flex items-start gap-3 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
          <button
            onClick={() => { setSelectedThread(null); setReplyBody(""); }}
            className="rounded-full p-1.5 text-zinc-400 hover:bg-white/10 transition mt-0.5"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white truncate">{thread?.inquiry.subject ?? "Loading…"}</p>
            {thread && (
              <p className="text-xs text-zinc-500 mt-0.5">
                {thread.inquiry.staff_name} · {thread.inquiry.city.charAt(0).toUpperCase() + thread.inquiry.city.slice(1)} · {fmtDate(thread.inquiry.created_at)}
              </p>
            )}
          </div>
          {thread && (
            <div className="flex items-center gap-2 shrink-0">
              {statusBadge(thread.inquiry.status)}
            </div>
          )}
        </div>

        {threadLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        ) : thread ? (
          <>
            {/* Status actions */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-slate-900/40">
              <span className="text-xs text-zinc-500 mr-1">Change status:</span>
              {thread.inquiry.status !== "in_progress" && (
                <button
                  onClick={() => updateStatus("in_progress")}
                  disabled={statusUpdating}
                  className="text-xs rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-blue-400 hover:bg-blue-500/20 transition disabled:opacity-50"
                >
                  Mark In Progress
                </button>
              )}
              {thread.inquiry.status !== "resolved" && (
                <button
                  onClick={() => updateStatus("resolved")}
                  disabled={statusUpdating}
                  className="text-xs rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-emerald-400 hover:bg-emerald-500/20 transition disabled:opacity-50"
                >
                  Mark Resolved
                </button>
              )}
              {thread.inquiry.status !== "open" && (
                <button
                  onClick={() => updateStatus("open")}
                  disabled={statusUpdating}
                  className="text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-amber-400 hover:bg-amber-500/20 transition disabled:opacity-50"
                >
                  Reopen
                </button>
              )}
              {statusUpdating && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-3xl mx-auto w-full">
              {/* Original message */}
              <div className="flex flex-col items-start">
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white/5 border border-white/10 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-400 mb-1">
                    {thread.inquiry.staff_name}
                  </p>
                  <p className="text-sm text-white whitespace-pre-wrap">{thread.inquiry.body}</p>
                </div>
                <p className="text-xs text-zinc-600 mt-1">{fmtDate(thread.inquiry.created_at)}</p>
              </div>

              {/* Replies */}
              {thread.replies.map((reply) => (
                <div key={reply.id} className={`flex flex-col ${reply.is_from_staff ? "items-start" : "items-end"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 border ${
                    reply.is_from_staff
                      ? "rounded-tl-sm bg-white/5 border-white/10"
                      : "rounded-tr-sm bg-emerald-600/20 border-emerald-500/20"
                  }`}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1 text-zinc-400">
                      {reply.is_from_staff ? reply.sender_name : `HQ · ${reply.sender_name}`}
                    </p>
                    <p className="text-sm text-white whitespace-pre-wrap">{reply.body}</p>
                  </div>
                  <p className="text-xs text-zinc-600 mt-1">{fmtDate(reply.created_at)}</p>
                </div>
              ))}

              {thread.inquiry.status === "resolved" && (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Inquiry resolved.
                </div>
              )}
            </div>

            {/* Reply input */}
            <div className="border-t border-white/10 px-4 py-3 bg-slate-900/80 backdrop-blur-sm max-w-3xl mx-auto w-full">
              {error && (
                <p className="text-xs text-red-400 mb-2">{error}</p>
              )}
              <div className="flex gap-3 items-end">
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  rows={3}
                  placeholder="Type your reply to the staff member…"
                  className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition resize-none"
                />
                <button
                  onClick={submitReply}
                  disabled={replySubmitting || !replyBody.trim()}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 p-3 transition"
                >
                  {replySubmitting
                    ? <Loader2 className="h-4 w-4 animate-spin text-white" />
                    : <Send className="h-4 w-4 text-white" />}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  const openCount = inquiries.filter((i) => i.status === "open").length;
  const inProgressCount = inquiries.filter((i) => i.status === "in_progress").length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-violet-400 mb-1">Payroll</p>
            <h1 className={T_PAGE_TITLE}>Staff Pay Inquiries</h1>
          </div>
          <button
            onClick={loadInquiries}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10 transition disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* KPI chips */}
        {!loading && (
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
              <Clock className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-semibold text-amber-400">{openCount}</span>
              <span className="text-xs text-amber-500">Open</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2">
              <MessageCircle className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-semibold text-blue-400">{inProgressCount}</span>
              <span className="text-xs text-blue-500">In Progress</span>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <SelectDark
            value={cityFilter}
            onChange={(v) => setCityFilter(v)}
            options={[
              { value: "all", label: "All Cities" },
              { value: "dubai", label: "Dubai" },
              { value: "manila", label: "Manila" },
            ]}
          />
          <SelectDark
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            options={[
              { value: "all", label: "All Status" },
              { value: "open", label: "Open" },
              { value: "in_progress", label: "In Progress" },
              { value: "resolved", label: "Resolved" },
            ]}
          />
        </div>

        {/* Error */}
        {error && !loading && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 flex items-center justify-between">
            {error}
            <button onClick={() => setError("")}><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading inquiries…
          </div>
        ) : inquiries.length === 0 ? (
          <div className={`${GLASS_CARD} flex flex-col items-center justify-center py-16 text-center`}>
            <MessageCircle className="h-10 w-10 text-zinc-600 mb-3" />
            <p className="text-zinc-400 font-medium">No inquiries found</p>
            <p className="text-xs text-zinc-600 mt-1">Staff inquiries will appear here when submitted.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {inquiries.map((inq) => (
              <button
                key={inq.id}
                onClick={() => loadThread(inq.id)}
                className={`${GLASS_CARD} w-full text-left p-4 hover:border-violet-500/30 transition group`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold text-white text-sm truncate">{inq.subject}</p>
                      {inq.status === "open" && (
                        <span className="shrink-0 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      )}
                    </div>
                    <p className="text-xs text-zinc-400">
                      {inq.staff_name}
                      <span className="text-zinc-600"> · {inq.city.charAt(0).toUpperCase() + inq.city.slice(1)}</span>
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      {fmtDateShort(inq.created_at)}
                      {inq.last_reply_at && <span> · Last reply {fmtDateShort(inq.last_reply_at)}</span>}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {statusBadge(inq.status)}
                    {inq.reply_count > 0 && (
                      <span className="text-xs text-zinc-500 flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" />{inq.reply_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
