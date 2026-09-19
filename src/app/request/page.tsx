// src/app/request/page.tsx
"use client";

import { isoToday } from "@/lib/date";
import { useCallback, useEffect, useRef, useState } from "react";
import { prepareIfImage } from "@/lib/image-compress";
import {
  AlertCircle, ArrowRightLeft, Bell, BellRing, CalendarDays, CheckCircle2,
  ClipboardList, Clock, FileText, Loader2, RefreshCw,
  Send, XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/Field";
import DatePicker from "@/components/DatePicker";
import SelectDark from "@/components/SelectDark";
import { getAuth, getAuthHeaders, refreshAuthFromApi, getUploadHeaders } from "@/lib/auth";
import { BRANCHES } from "@/lib/branches";
import { dispatchBadgeRefresh } from "@/lib/badgeEvents";
import {
  GLASS_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON, DANGER_BUTTON,
  INPUT_CLASS, SELECT_CLASS, TEXTAREA_CLASS,
  TAB_CONTAINER, TAB_ACTIVE, TAB_INACTIVE,
  BADGE_SUCCESS, BADGE_WARNING, BADGE_ERROR, BADGE_INFO, BADGE_ACCENT,
  T_PAGE_TITLE, T_SECTION, T_LABEL, T_CAPTION,
} from "@/lib/ui-tokens";

type Tab = "form" | "history" | "inbox";
type ReqType = "time_change" | "day_off" | "absence" | "swap" | "paid_leave" | "vacation" | "overtime_request" | "other";

const LEAVE_TYPES: { value: ReqType; label: string }[] = [
  { value: "time_change",      label: "Time Change" },
  { value: "day_off",          label: "Day Off" },
  { value: "absence",          label: "Absence" },
  { value: "paid_leave",       label: "Paid Leave" },
  { value: "vacation",         label: "Vacation" },
  { value: "overtime_request", label: "Overtime Request" },
  { value: "other",            label: "Other" },
  { value: "swap",             label: "Swap" },
];

const REASON_CATEGORIES: { value: string; label: string }[] = [
  { value: "medical",    label: "🏥 Medical appointment / Health check" },
  { value: "school",     label: "🎓 School / Exam / Graduation" },
  { value: "government", label: "🏛️ Government / Admin errand (passport, ID, etc.)" },
  { value: "family",     label: "💒 Family event (wedding / funeral / important ceremony)" },
  { value: "religious",  label: "🕌 Religious observance" },
  { value: "work",       label: "🔄 Work-related (training, interview, etc.)" },
  { value: "other",      label: "📋 Other — please specify in Reason" },
];

type LeaveBalance = {
  id: number | null;
  leave_type: string;
  entitled_days: number;
  used_days: number;
  remaining_days: number;
  // Service Incentive Leave only: inside your first year the five days are
  // ahead of you, not absent, and "0 / 0d" says the wrong thing about that.
  is_eligible?: boolean;
  eligible_from?: string | null;
};

type ShiftConflict = {
  staff_name: string;
  work_date: string;
  kind: "approved_but_rostered" | "undecided_and_rostered";
  days_away: number | null;
  shifts: { role: string | null; start_hour: number; end_hour: number; branch_code: string | null }[];
};

/** Roster hours are decimals, and 24.5 means 00:30 the next day. */
function rosterTime(h: number) {
  const mins = Math.round((Number(h) || 0) * 60);
  return `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

type Notification = {
  id: string;
  sender_name: string;
  sender_city: string;
  notification_type: string;
  request_date: string;
  target_date: string;
  leave_type: string | null;
  leave_days: number | null;
  overtime_hours: number | null;
  reason: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  /** Which of the two approval stages is sitting on it, while it is pending.
      The store asked to know whether it was the manager or HQ; for Patrick
      Danel Santiago's 2026-09-20 it was HQ, for three weeks. */
  waiting_on?: "Manager" | "HQ" | null;
  manager_status?: string;
  hq_status?: string;
  urgency_status?: string | null;
  branch?: string | null;
};

function todayIso() { return isoToday(); }

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <span className={BADGE_SUCCESS}><CheckCircle2 size={11} />Approved</span>;
  if (status === "rejected") return <span className={BADGE_ERROR}><XCircle size={11} />Rejected</span>;
  return <span className={BADGE_WARNING}><Clock size={11} />Pending</span>;
}

function apiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const method = (opts?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  if (method !== "GET" && !(opts?.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (auth?.accessToken) headers["Authorization"] = `Bearer ${auth.accessToken}`;
  return fetch(path, { ...opts, headers: { ...headers, ...(opts?.headers as Record<string, string> ?? {}) } });
}

// ── Tab 2: History ─────────────────────────────────────────────────────────────

function HistoryTab({ staffName, city }: { staffName: string; city: string }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loadRef = useRef(0);

  const load = useCallback(async () => {
    if (!staffName || !city) return;
    const seq = ++loadRef.current;
    setLoading(true); setError("");
    try {
      const r = await apiFetch(`/api/request/notifications/history?staff_name=${encodeURIComponent(staffName)}&city=${encodeURIComponent(city)}&limit=50`);
      if (seq !== loadRef.current) return;
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json() as { items: Notification[] };
      setItems(d.items ?? []);
    } catch (e) {
      if (seq === loadRef.current) setError(String(e));
    } finally {
      if (seq === loadRef.current) setLoading(false);
    }
  }, [staffName, city]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className={T_SECTION}>My Request History</h2>
        <button onClick={load} className={SMALL_BUTTON + " flex items-center gap-1.5"}>
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-violet-400" />
        </div>
      ) : items.length === 0 ? (
        <div className={GLASS_CARD + " p-10 text-center"}>
          <ClipboardList size={36} className="mx-auto mb-3 text-zinc-600" />
          <p className="text-sm text-zinc-500">No requests submitted yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(n => (
            <div key={n.id} className={GLASS_CARD + " p-4"}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={BADGE_INFO + " capitalize"}>
                      {n.notification_type.replace(/_/g, " ")}
                    </span>
                    <StatusBadge status={n.status} />
                  </div>
                  <p className="mt-2 text-sm text-zinc-300">{n.reason}</p>
                  {n.leave_days != null && (
                    <p className={T_CAPTION + " mt-1"}>{n.leave_days} day(s) · {n.leave_type}</p>
                  )}
                  {n.overtime_hours != null && n.overtime_hours > 0 && (
                    <p className={T_CAPTION + " mt-1"}>{n.overtime_hours} OT hour(s)</p>
                  )}
                  {n.review_note && (
                    <p className={T_CAPTION + " mt-1 italic"}>Note: {n.review_note}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className={T_CAPTION}>{n.target_date}</p>
                  {n.reviewed_by && (
                    <p className={T_CAPTION + " mt-0.5"}>{n.reviewed_by}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Inbox ───────────────────────────────────────────────────────────────

function InboxTab({
  city,
  onCityChange,
  byCity,
}: {
  city: string;
  onCityChange: (c: "dubai" | "manila") => void;
  byCity: Record<string, number>;
}) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
  const loadRef = useRef(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const seq = ++loadRef.current;
    setLoading(true); setError("");
    try {
      const r = await apiFetch(`/api/request/notifications/inbox?city=${encodeURIComponent(city)}&status=pending&limit=100`);
      if (seq !== loadRef.current) return;
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json() as { items: Notification[] };
      const next = d.items ?? [];
      setItems(next);
      setLastLoaded(new Date());
    } catch (e) {
      if (seq === loadRef.current) setError(String(e));
    } finally {
      if (seq === loadRef.current) setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    void load();
    pollingRef.current = setInterval(() => { void load(); }, 30_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [load]);

  // Days somebody asked off where the roster still has them working.
  //
  // Approving a request and editing the roster are two separate acts, and
  // nothing connected them, so only the first happening looked exactly like
  // both happening. Mary Jane Tegerero worked 2026-08-21 and Abegail A.
  // Dalida worked 2026-09-06 -- both approved off, weeks earlier.
  const [conflicts, setConflicts] = useState<ShiftConflict[]>([]);
  useEffect(() => {
    let dead = false;
    apiFetch(`/api/admin/shift-conflicts?city=${encodeURIComponent(city)}`)
      .then(r => r.ok ? r.json() as Promise<{ items?: ShiftConflict[] }> : Promise.resolve({}))
      .then((d: { items?: ShiftConflict[] }) => { if (!dead) setConflicts(d.items ?? []); })
      .catch(() => {});
    return () => { dead = true; };
  }, [city]);

  const openCount = items.length;

  // Which city's requests these are.
  //
  // The inbox used to follow the form's city, which follows the reviewer's own
  // registration. Yuri is HQ registered in dubai, so his inbox opened on dubai
  // -- empty -- while fourteen manila requests sat unanswered behind a selector
  // nobody had a reason to touch. The review permission is not scoped to a
  // city, so neither is this: both are here, each with its own count.
  const cityPicker = (
    <div className="flex items-center gap-1.5">
      {(["manila", "dubai"] as const).map((c) => {
        const n = Number(byCity[c] || 0);
        return (
          <button
            key={c}
            type="button"
            onClick={() => onCityChange(c)}
            className={[
              "rounded-lg px-2.5 py-1 text-xs font-semibold capitalize transition",
              city === c
                ? "bg-violet-500/20 text-violet-200 border border-violet-500/40"
                : "bg-white/5 text-neutral-400 border border-white/10 hover:text-white",
            ].join(" ")}
          >
            {c}
            {n > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none text-black">
                {n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  async function review(id: string, action: "approved" | "rejected") {
    setReviewBusy(true);
    setError("");
    try {
      const auth = getAuth();
      const r = await apiFetch(`/api/request/notifications/${id}/review`, {
        method: "PATCH",
        body: JSON.stringify({
          status: action,
          review_note: reviewNote.trim(),
          reviewed_by: auth?.staffName ?? "manager",
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      setItems(prev => prev.filter(i => i.id !== id));
      // The tab count and the left-nav badge both come from the badge endpoint,
      // so one event refreshes both. Without it the number the reviewer just
      // acted on stays on screen for up to thirty seconds.
      dispatchBadgeRefresh("requests");
      setReviewingId(null);
      setReviewNote("");
    } catch (e) {
      setError(String(e));
    } finally {
      setReviewBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className={T_SECTION + " flex items-center gap-2"}>
            <BellRing size={18} className="text-amber-400" />
            Pending Inbox
            {openCount > 0 && (
              <span className={BADGE_WARNING}>{openCount}</span>
            )}
          </h2>
          {lastLoaded && (
            <p className={T_CAPTION + " mt-0.5"}>
              Updated {lastLoaded.toLocaleTimeString()} · auto-refresh every 30s
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {cityPicker}
          <button onClick={load} className={SMALL_BUTTON + " flex items-center gap-1.5"}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
          <p className="text-sm font-semibold text-rose-200">
            Still on the roster for a day they asked off
          </p>
          <p className="mt-0.5 text-xs text-rose-300/80">
            Approving a request does not move the shift. Manual Shift is where the day is changed.
          </p>
          <ul className="mt-3 space-y-1.5">
            {conflicts.map((c) => {
              const sh = c.shifts[0];
              return (
                <li key={`${c.staff_name}|${c.work_date}`} className="text-xs text-zinc-300">
                  <span className="font-semibold text-white">{c.staff_name}</span>
                  {" · "}{c.work_date}
                  {" · "}
                  <span className={c.kind === "approved_but_rostered" ? "text-rose-300" : "text-amber-300"}>
                    {c.kind === "approved_but_rostered" ? "approved" : "not answered yet"}
                  </span>
                  {sh && (
                    <> · rostered {rosterTime(sh.start_hour)}–{rosterTime(sh.end_hour)}
                      {sh.branch_code ? ` ${sh.branch_code}` : ""}</>
                  )}
                  {typeof c.days_away === "number" && (
                    <span className="text-zinc-500">
                      {c.days_away === 0 ? " · today"
                        : c.days_away > 0 ? ` · in ${c.days_away}d`
                        : ` · ${Math.abs(c.days_away)}d ago`}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-violet-400" />
        </div>
      ) : items.length === 0 ? (
        <div className={GLASS_CARD + " p-10 text-center"}>
          <Bell size={36} className="mx-auto mb-3 text-zinc-600" />
          <p className="text-sm text-zinc-500">No pending requests in {city}.</p>
          {(["manila", "dubai"] as const)
            .filter((c) => c !== city && Number(byCity[c] || 0) > 0)
            .map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onCityChange(c)}
                className="mt-3 text-sm font-semibold text-violet-300 underline underline-offset-4 hover:text-violet-200"
              >
                {byCity[c]} waiting in <span className="capitalize">{c}</span>
              </button>
            ))}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(n => (
            <div key={n.id} className={GLASS_CARD + " p-4"}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white text-sm">{n.sender_name}</span>
                    <span className={BADGE_INFO + " capitalize"}>
                      {n.notification_type.replace(/_/g, " ")}
                    </span>
                    {/* Which stage it is sitting on. "Pending" alone does not
                        say whose answer is missing, and for Patrick Danel
                        Santiago's day off the missing one was HQ's. */}
                    {n.waiting_on && (
                      <span className={BADGE_WARNING}>Waiting on {n.waiting_on}</span>
                    )}
                    {n.branch && <span className={BADGE_INFO}>{n.branch}</span>}
                  </div>
                  <p className="mt-1.5 text-sm text-zinc-300">{n.reason}</p>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-zinc-500">
                    <span>Date: {n.target_date}</span>
                    {n.leave_type && <span>Type: {n.leave_type}</span>}
                    {n.leave_days != null && <span>{n.leave_days} day(s)</span>}
                    {n.overtime_hours != null && <span>{n.overtime_hours} OT hr(s)</span>}
                    <span className="font-mono text-zinc-600">{String(n.id).slice(0, 8)}…</span>
                  </div>

                  {reviewingId === n.id ? (
                    <div className="mt-3 space-y-2">
                      <label className={T_LABEL}>Review note (optional)</label>
                      <textarea
                        className={TEXTAREA_CLASS}
                        rows={2}
                        value={reviewNote}
                        onChange={e => setReviewNote(e.target.value)}
                        placeholder="Add a note for the staff member…"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { void review(n.id, "approved"); }}
                          disabled={reviewBusy}
                          className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50 transition">
                          {reviewBusy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                          Approve
                        </button>
                        <button
                          onClick={() => { void review(n.id, "rejected"); }}
                          disabled={reviewBusy}
                          className={DANGER_BUTTON + " flex items-center gap-1.5 !px-3 !py-1.5 text-xs font-semibold"}>
                          <XCircle size={12} /> Reject
                        </button>
                        <button
                          onClick={() => { setReviewingId(null); setReviewNote(""); }}
                          className={SMALL_BUTTON}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setReviewingId(n.id)}
                      className={SMALL_BUTTON + " mt-2"}>
                      Review
                    </button>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className={T_CAPTION}>{new Date(n.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Swap Inbox Banner ─────────────────────────────────────────────────────────

type PendingSwap = {
  id: string;
  requester_name: string;
  work_date: string;
  requester_new_time: string;
  counterparty_new_time: string;
  reason: string;
  requested_at: string;
};

function SwapInboxBanner({ staffName }: { staffName: string }) {
  const [swaps, setSwaps] = useState<PendingSwap[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Confirm modal state
  const [confirming, setConfirming] = useState<{ id: string; action: "APPROVED" | "REJECTED" } | null>(null);
  const [pin, setPin] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const load = useCallback(async () => {
    if (!staffName) return;
    setLoading(true);
    try {
      const r = await apiFetch(`/api/shift_change/counterparty/pending?staff_name=${encodeURIComponent(staffName)}`);
      if (r.ok) {
        const d = await r.json() as { items: PendingSwap[] };
        setSwaps(d.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [staffName]);

  useEffect(() => { void load(); }, [load]);

  async function respond(id: string, action: "APPROVED" | "REJECTED") {
    setSubmitting(true);
    setSubmitError("");
    try {
      const q = new URLSearchParams({ req_id: id, staff_name: staffName, action, note, pin }).toString();
      const r = await apiFetch(`/api/shift_change/counterparty/respond?${q}`, { method: "POST" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({})) as { detail?: string };
        throw new Error(d.detail ?? "Failed");
      }
      setConfirming(null);
      setPin(""); setNote("");
      setSwaps(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (swaps.length === 0 && !loading) return null;

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ArrowRightLeft size={16} className="text-violet-400 shrink-0" />
          <span className="text-sm font-semibold text-violet-300">
            Swap Requests for You
          </span>
          {swaps.length > 0 && (
            <span className="rounded-full bg-violet-500 px-2 py-0.5 text-[11px] font-bold text-white">
              {swaps.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void load()}
            className="rounded-lg p-1.5 text-violet-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Refresh">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setCollapsed(v => !v)}
            className="text-xs text-violet-400 hover:text-violet-200 transition-colors px-2 py-1">
            {collapsed ? "Show" : "Hide"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="space-y-2">
          {swaps.map(s => (
            <div key={s.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">{s.requester_name}</span>
                    <span className={BADGE_INFO}>Swap request</span>
                    <span className="text-xs text-zinc-400">{s.work_date}</span>
                  </div>
                  <div className="text-xs text-zinc-400 flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                    {s.requester_new_time && <span>Their new shift: <span className="text-zinc-200">{s.requester_new_time}</span></span>}
                    {s.counterparty_new_time && <span>Your new shift: <span className="text-violet-300 font-semibold">{s.counterparty_new_time}</span></span>}
                  </div>
                  {s.reason && <p className="text-xs text-zinc-400 mt-1 italic">&ldquo;{s.reason}&rdquo;</p>}
                </div>
                {confirming?.id !== s.id && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => { setConfirming({ id: s.id, action: "APPROVED" }); setPin(""); setNote(""); setSubmitError(""); }}
                      className="flex items-center gap-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/30 transition">
                      <CheckCircle2 size={12} /> Approve
                    </button>
                    <button
                      onClick={() => { setConfirming({ id: s.id, action: "REJECTED" }); setPin(""); setNote(""); setSubmitError(""); }}
                      className="flex items-center gap-1 rounded-lg bg-red-500/15 border border-red-500/25 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/25 transition">
                      <XCircle size={12} /> Reject
                    </button>
                  </div>
                )}
              </div>

              {/* Inline confirm form */}
              {confirming?.id === s.id && (
                <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                  <p className="text-xs font-semibold text-amber-300">
                    {confirming.action === "APPROVED" ? "✅ Confirm approval" : "❌ Confirm rejection"} — enter your PIN
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="password"
                      inputMode="numeric"
                      placeholder="PIN"
                      value={pin}
                      onChange={e => setPin(e.target.value)}
                      className="w-32 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/50"
                    />
                    <input
                      type="text"
                      placeholder="Note (optional)"
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      className="flex-1 min-w-[140px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                  {submitError && <p className="text-xs text-red-400">{submitError}</p>}
                  <div className="flex gap-2">
                    <button
                      disabled={submitting || !pin.trim()}
                      onClick={() => void respond(s.id, confirming.action)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 transition ${
                        confirming.action === "APPROVED"
                          ? "bg-emerald-600 text-white hover:bg-emerald-500"
                          : "bg-red-600 text-white hover:bg-red-500"
                      }`}>
                      {submitting ? <Loader2 size={12} className="animate-spin" /> : null}
                      {confirming.action === "APPROVED" ? "Confirm Approve" : "Confirm Reject"}
                    </button>
                    <button onClick={() => { setConfirming(null); setPin(""); setNote(""); setSubmitError(""); }}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function RequestPage() {
  const router = useRouter();
  const [auth, setAuth] = useState(() => getAuth());
  const [activeTab, setActiveTab] = useState<Tab>("form");
  const [inboxCount, setInboxCount] = useState(0);
  // The inbox's city, kept apart from the form's. They were one piece of state,
  // which meant a reviewer could not look at manila's requests without also
  // switching the city of the request he was about to file.
  const [inboxCity, setInboxCity] = useState<"dubai" | "manila">("manila");
  const [inboxByCity, setInboxByCity] = useState<Record<string, number>>({});
  const inboxCityPinned = useRef(false);

  // Form state
  const [city, setCity] = useState<"dubai" | "manila">("manila");
  const [branch, setBranch] = useState("");
  const [staffName, setStaffName] = useState("");
  const [workDate, setWorkDate] = useState(todayIso());
  const [requestType, setRequestType] = useState<ReqType>("time_change");
  const [reason, setReason] = useState("");
  const [reasonCategory, setReasonCategory] = useState("medical");
  const [medicalDoc, setMedicalDoc] = useState(false);
  const [medicalDocumentFile, setMedicalDocumentFile] = useState<File | null>(null);
  const medicalFileInputRef = useRef<HTMLInputElement | null>(null);

  // Type-specific fields
  const [from, setFrom] = useState("9-16");
  const [to, setTo] = useState("10-18");
  const [withStaff, setWithStaff] = useState("");
  const [myTo, setMyTo] = useState("9-16");
  const [theirTo, setTheirTo] = useState("18-25");
  const [leaveDays, setLeaveDays] = useState("1");
  const [leaveSubType, setLeaveSubType] = useState("annual_leave");
  const [otHours, setOtHours] = useState("2");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);

  const MANAGER_ROLES = ["HQ", "ADMIN", "MANAGER", "DUBAI_MANAGEMENT", "MANILA_MANAGEMENT", "HR_MANAGER"];
  const canSubmitForOthers = MANAGER_ROLES.includes(auth?.role ?? "");
  const isInbox = canSubmitForOthers;

  // Auth refresh on focus
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

  useEffect(() => {
    if (!auth?.staffName || (!auth?.hasSession && !auth?.accessToken)) {
      router.replace("/login?next=%2Frequest");
      return;
    }
    if (auth.city) setCity(auth.city as "dubai" | "manila");
    if (auth.staffName) setStaffName(auth.staffName);
  }, [auth, router]);

  // Default branch
  useEffect(() => {
    const first = BRANCHES[city]?.[0]?.code ?? "";
    setBranch(first);
  }, [city]);

  // Fetch staff names
  useEffect(() => {
    const freshAuth = getAuth();
    if (!freshAuth?.hasSession && !freshAuth?.accessToken) return;
    fetch(`/api/admin/staff_master/names?city=${encodeURIComponent(city)}&status=ACTIVE&limit=500`, {
      headers: freshAuth?.accessToken ? { Authorization: `Bearer ${freshAuth.accessToken}` } : {},
    })
      .then(r => r.json())
      .then((d: { names?: string[] }) => { if (Array.isArray(d.names)) setStaffNames(d.names); })
      .catch(() => setStaffNames([]));
  }, [city]);

  // Fetch leave balances
  useEffect(() => {
    const freshAuth = getAuth();
    if ((!freshAuth?.hasSession && !freshAuth?.accessToken) || !staffName || !city) return;
    apiFetch(`/api/request/leave-balance?staff_name=${encodeURIComponent(staffName)}&city=${encodeURIComponent(city)}&year=${new Date().getFullYear()}`)
      .then(r => r.ok ? r.json() as Promise<{ balances: LeaveBalance[] }> : Promise.resolve({ balances: [] }))
      .then(d => setLeaveBalances(d.balances ?? []))
      .catch(() => setLeaveBalances([]));
  }, [staffName, city]);

  // Poll the pending count so the tab badge is live on any tab.
  //
  // This counts every city, not the reviewer's own, and so matches the badge in
  // the left nav. It also decides which city the inbox opens on: the one
  // holding the request whose day comes soonest. Opening on the reviewer's own
  // city showed Yuri an empty dubai inbox while fourteen manila requests waited.
  useEffect(() => {
    if (!isInbox) return;
    type BadgeResponse = {
      badge_count?: number;
      soonest_city?: string | null;
      by_city?: Record<string, { badge_count?: number }>;
    };
    const poll = () => {
      apiFetch(`/api/request/notifications/badge`)
        .then(r => r.ok ? r.json() as Promise<BadgeResponse> : Promise.resolve({} as BadgeResponse))
        .then((d: BadgeResponse) => {
          setInboxCount(Number(d.badge_count ?? 0));
          const per: Record<string, number> = {};
          Object.entries(d.by_city ?? {}).forEach(([c, v]) => {
            per[c] = Number(v?.badge_count ?? 0);
          });
          setInboxByCity(per);
          // Only until the reviewer picks a city — after that it is his choice.
          if (!inboxCityPinned.current && (d.soonest_city === "manila" || d.soonest_city === "dubai")) {
            setInboxCity(d.soonest_city);
          }
        })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, [isInbox]);

  const branchOptions = BRANCHES[city] ?? [];

  const submit = async () => {
    setLoading(true); setError(""); setResult(null);
    try {
      let currentAuth = getAuth();
      if (!currentAuth?.hasSession && !currentAuth?.accessToken) throw new Error("Please log in again.");
      if (!branch.trim()) throw new Error("Branch is required.");
      if (!workDate.trim()) throw new Error("Work date is required.");
      if (!reason.trim() || reason.trim().length < 5) throw new Error("Reason must be at least 5 characters.");
      if (requestType === "swap" && !withStaff.trim()) throw new Error("Counterparty staff name is required.");
      if (requestType === "swap" && (!myTo.trim() || !theirTo.trim())) throw new Error("Both swap time fields are required.");
      if (requestType === "time_change" && !to.trim()) throw new Error("Requested time is required.");
      if (medicalDoc && !medicalDocumentFile) throw new Error("Please attach your medical document file.");
      if (requestType === "overtime_request" && (parseFloat(otHours) || 0) <= 0) throw new Error("Overtime hours must be greater than 0.");
      if (["paid_leave", "vacation", "absence", "day_off"].includes(requestType) && (parseFloat(leaveDays) || 0) <= 0) throw new Error("Leave days must be greater than 0.");

      // One call.
      //
      // This used to post leave and day-off to /api/request/notify first and
      // then submit them again here, and post overtime only to that endpoint.
      // Two tables, two review screens, nothing between them: every one of the
      // fourteen rows in the second table still read "pending" while thirteen
      // had been answered on the dashboard weeks earlier.
      const isLeaveType = ["paid_leave", "vacation", "absence", "day_off"].includes(requestType);

      let payload: Record<string, string> = {};
      if (requestType === "time_change") payload = { from, to };
      else if (requestType === "swap") payload = { with_staff: withStaff, my_to: myTo, their_to: theirTo };
      payload.reason_category = reasonCategory;

      const form = new FormData();
      form.set("city", city);
      form.set("staff_name", staffName);
      form.set("work_date", workDate);
      form.set("request_type", requestType);
      form.set("reason", reason);
      form.set("branch", branch);
      form.set("medical_doc", String(medicalDoc));
      form.set("payload_json", JSON.stringify(payload));
      form.set("reason_category", reasonCategory);
      if (isLeaveType) {
        form.set("leave_days", String(parseFloat(leaveDays) || 1));
        if (requestType === "paid_leave" || requestType === "vacation") form.set("leave_type", leaveSubType);
      }
      if (requestType === "overtime_request") form.set("overtime_hours", String(parseFloat(otHours) || 0));
      if (medicalDocumentFile) form.set("medical_document_file", await prepareIfImage(medicalDocumentFile));

      const apiBase = "";
      let res = await fetch(`${apiBase}/api/shift_change/submit`, {
        method: "POST",
        headers: getUploadHeaders(currentAuth),
        body: form,
      });
      if (res.status === 401) {
        const refreshed = await refreshAuthFromApi(currentAuth);
        if (refreshed && (refreshed.hasSession || refreshed.accessToken)) {
          currentAuth = refreshed;
          const form2 = new FormData();
          form.forEach((v, k) => form2.set(k, v));
          res = await fetch(`${apiBase}/api/shift_change/submit`, {
            method: "POST",
            headers: getUploadHeaders(refreshed),
            body: form2,
          });
        }
      }
      const text = await res.text();
      if (!res.ok) throw new Error(`Submit failed: ${res.status} ${text}`);
      setResult(JSON.parse(text) as Record<string, unknown>);
      setReason("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-3xl space-y-6 px-4 pb-12 pt-8">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className={T_PAGE_TITLE}>Request</h1>
            <p className="mt-1 text-sm text-zinc-400">Submit shift changes, leave, or overtime requests.</p>
          </div>
          {leaveBalances.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {leaveBalances.slice(0, 3).map((b, i) => {
                const notYet = b.is_eligible === false;
                return (
                  <div key={b.id ?? `${b.leave_type}-${i}`}
                       className={"rounded-xl border px-3 py-1.5 text-xs " + (notYet
                         ? "border-white/10 bg-white/5"
                         : "border-violet-500/20 bg-violet-500/10")}>
                    <span className={(notYet ? "text-zinc-400" : "text-violet-300") + " font-medium capitalize"}>
                      {b.leave_type.replace(/_/g, " ")}
                    </span>
                    {notYet ? (
                      <span className="ml-1.5 text-zinc-500">
                        {b.eligible_from ? `from ${b.eligible_from}` : "after 1 year"}
                      </span>
                    ) : (
                      <>
                        <span className="ml-1.5 font-bold text-white">{b.remaining_days}</span>
                        <span className="text-zinc-500">/{b.entitled_days}d</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Swap Inbox Banner ────────────────────────────────────────── */}
        {staffName && <SwapInboxBanner staffName={staffName} />}

        {/* ── Tab bar ─────────────────────────────────────────────────── */}
        <div className={TAB_CONTAINER}>
          <button
            className={activeTab === "form" ? TAB_ACTIVE : TAB_INACTIVE}
            onClick={() => setActiveTab("form")}>
            <FileText size={14} className="inline mr-1.5" />Form
          </button>
          <button
            className={activeTab === "history" ? TAB_ACTIVE : TAB_INACTIVE}
            onClick={() => setActiveTab("history")}>
            <ClipboardList size={14} className="inline mr-1.5" />My History
          </button>
          {isInbox && (
            <button
              className={activeTab === "inbox" ? TAB_ACTIVE : TAB_INACTIVE}
              onClick={() => setActiveTab("inbox")}>
              <BellRing size={14} className="inline mr-1.5" />Inbox
              {inboxCount > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none text-black">
                  {inboxCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* ── Tab content ─────────────────────────────────────────────── */}
        <div className={GLASS_CARD + " p-6"}>

          {/* ── Tab 1: Form ──────────────────────────────────────────── */}
          {activeTab === "form" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className={T_SECTION}>Request Form</h2>
                <span className={canSubmitForOthers ? BADGE_WARNING : BADGE_INFO}>
                  {canSubmitForOthers ? "Manager mode" : "Self submit"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="City">
                  <SelectDark
                    className={SELECT_CLASS}
                    value={city}
                    onChange={v => setCity(v as "dubai" | "manila")}
                    options={[
                      { value: "dubai", label: "Dubai" },
                      { value: "manila", label: "Manila" },
                    ]}
                  />
                </Field>
                <Field label="Branch">
                  <SelectDark
                    className={SELECT_CLASS}
                    value={branch}
                    onChange={setBranch}
                    options={branchOptions.map(b => ({ value: b.code, label: b.name }))}
                  />
                </Field>

                <Field label="Staff name" hint={canSubmitForOthers ? "Submit on behalf of staff" : "Locked to login"}>
                  {canSubmitForOthers && staffNames.length > 0 ? (
                    <SelectDark
                      className={SELECT_CLASS}
                      value={staffName}
                      onChange={setStaffName}
                      placeholder="— Select —"
                      options={staffNames.map(n => ({ value: n, label: n }))}
                    />
                  ) : (
                    <input className={INPUT_CLASS} value={staffName} readOnly={!canSubmitForOthers}
                      onChange={e => setStaffName(e.target.value)} />
                  )}
                </Field>
                <Field label="Work date">
                  <DatePicker value={workDate} onChange={setWorkDate} />
                </Field>

                {/* 14-day advance notice warning */}
                {(() => {
                  const daysLeft = Math.ceil((new Date(workDate).getTime() - Date.now()) / 86400000);
                  return daysLeft < 14 ? (
                    <div className="col-span-2 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
                      <span className="mt-0.5 shrink-0">⚠️</span>
                      <span>
                        Requests should be submitted at least <strong>14 days in advance</strong>.
                        This request is only {daysLeft <= 0 ? "overdue" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} away`} — approval is at management&apos;s discretion.
                      </span>
                    </div>
                  ) : null;
                })()}

                <Field label="Request type">
                  <SelectDark
                    className={SELECT_CLASS}
                    value={requestType}
                    onChange={v => setRequestType(v as ReqType)}
                    options={LEAVE_TYPES.map(t => ({ value: t.value, label: t.label }))}
                  />
                </Field>

                {/* Type-specific extras */}
                {requestType === "time_change" && (
                  <>
                    <Field label="From (current)">
                      <input className={INPUT_CLASS} value={from} onChange={e => setFrom(e.target.value)} placeholder="e.g. 9-16" />
                    </Field>
                    <Field label="To (requested)">
                      <input className={INPUT_CLASS} value={to} onChange={e => setTo(e.target.value)} placeholder="e.g. 10-18" />
                    </Field>
                  </>
                )}

                {["paid_leave", "vacation", "absence", "day_off"].includes(requestType) && (
                  <>
                    <Field label="Leave sub-type">
                      <SelectDark
                        className={SELECT_CLASS}
                        value={leaveSubType}
                        onChange={setLeaveSubType}
                        options={[
                          { value: "annual_leave", label: "Annual Leave (uses your 5 SIL days)" },
                          { value: "sick_leave", label: "Sick Leave" },
                          { value: "emergency_leave", label: "Emergency Leave" },
                          { value: "unpaid_leave", label: "Unpaid Leave" },
                          { value: "maternity_leave", label: "Maternity Leave" },
                          { value: "paternity_leave", label: "Paternity Leave" },
                          { value: "other", label: "Other" },
                        ]}
                      />
                    </Field>
                    <Field label="Days">
                      <input className={INPUT_CLASS} type="number" min="0.5" step="0.5" value={leaveDays}
                        onChange={e => setLeaveDays(e.target.value)} />
                    </Field>
                  </>
                )}

                {requestType === "overtime_request" && (
                  <Field label="Overtime hours">
                    <input className={INPUT_CLASS} type="number" min="0.5" step="0.5" value={otHours}
                      onChange={e => setOtHours(e.target.value)} placeholder="e.g. 2.5" />
                  </Field>
                )}

                {requestType === "swap" && (
                  <>
                    <Field label="Counterparty staff">
                      {staffNames.length > 0 ? (
                        <SelectDark
                          className={SELECT_CLASS}
                          value={withStaff}
                          onChange={setWithStaff}
                          placeholder="— Select —"
                          options={staffNames.filter(n => n !== staffName).map(n => ({ value: n, label: n }))}
                        />
                      ) : (
                        <input className={INPUT_CLASS} value={withStaff} onChange={e => setWithStaff(e.target.value)} />
                      )}
                    </Field>
                    <div />
                    <Field label="My new time">
                      <input className={INPUT_CLASS} value={myTo} onChange={e => setMyTo(e.target.value)} />
                    </Field>
                    <Field label="Their new time">
                      <input className={INPUT_CLASS} value={theirTo} onChange={e => setTheirTo(e.target.value)} />
                    </Field>
                  </>
                )}

                <div className="col-span-2">
                  <Field label="Reason category">
                    <SelectDark
                      value={reasonCategory}
                      onChange={setReasonCategory}
                      options={REASON_CATEGORIES}
                    />
                  </Field>
                </div>

                <div className="col-span-2">
                  <label className={T_LABEL}>Reason</label>
                  <textarea className={TEXTAREA_CLASS + " mt-1"} rows={3} value={reason}
                    onChange={e => setReason(e.target.value)} placeholder="At least 5 characters…" />
                </div>

                {/* Medical doc */}
                {requestType !== "overtime_request" && (
                  <div className="col-span-2">
                    <label className={T_LABEL}>Medical document</label>
                    <div className="mt-1 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                      <input type="checkbox" checked={medicalDoc} onChange={e => setMedicalDoc(e.target.checked)}
                        className="h-4 w-4 accent-violet-500 rounded" />
                      <span className="text-sm text-zinc-300">I have a medical document</span>
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
                        ref={medicalFileInputRef}
                        onChange={e => setMedicalDocumentFile(e.target.files?.[0] ?? null)}
                        className="hidden" aria-hidden tabIndex={-1} />
                      {medicalDoc && (
                        <button type="button" onClick={() => medicalFileInputRef.current?.click()}
                          className={SMALL_BUTTON + " ml-auto"}>
                          {medicalDocumentFile ? medicalDocumentFile.name : "Choose file"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button onClick={() => { void submit(); }} disabled={loading}
                  className={PRIMARY_BUTTON + " flex items-center gap-2"}>
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {loading ? "Submitting…" : "Submit Request"}
                </button>
                <button type="button"
                  onClick={() => { setReason(""); setError(""); setResult(null); }}
                  className={SECONDARY_BUTTON}>
                  Clear
                </button>
              </div>

              {result && (
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 size={18} className="text-emerald-400" />
                    <span className="font-semibold text-emerald-400 text-sm">Request submitted</span>
                  </div>
                  {(result.request_id || result.ok) && (
                    <p className="text-xs text-emerald-400 font-mono">
                      {result.request_id ? `ID: ${String(result.request_id).slice(0, 8)}…` : "Notification sent."}
                    </p>
                  )}
                  {result.urgency_status && (
                    <p className="mt-1 text-xs text-emerald-400">
                      Urgency: <span className="font-semibold">{String(result.urgency_status)}</span>
                      {" · "}Days before: <span className="font-semibold">{String(result.days_before)}</span>
                    </p>
                  )}
                  <p className="mt-1 text-xs text-emerald-500">Your manager has been notified and will review shortly.</p>
                </div>
              )}
            </div>
          )}

          {/* ── Tab 2: History ───────────────────────────────────────── */}
          {activeTab === "history" && (
            <HistoryTab staffName={staffName} city={city} />
          )}

          {/* ── Tab 3: Inbox ─────────────────────────────────────────── */}
          {activeTab === "inbox" && isInbox && (
            <InboxTab
              city={inboxCity}
              onCityChange={(c) => { inboxCityPinned.current = true; setInboxCity(c); }}
              byCity={inboxByCity}
            />
          )}
        </div>
      </div>
    </div>
  );
}
