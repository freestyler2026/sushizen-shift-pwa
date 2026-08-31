"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Send,
  X,
  ChevronDown,
  ChevronUp,
  BookOpen,
  MessageSquare,
} from "lucide-react";
import { getAuth, getAuthHeaders, canAccessAdminNav } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  T_PAGE_TITLE,
  T_LABEL,
  T_CAPTION,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  BADGE_ERROR,
  BADGE_WARNING,
  BADGE_INFO,
  BADGE_SUCCESS,
  TABLE_ROW,
  TABLE_CELL,
  INPUT_CLASS,
  TABLE_HEADER,
} from "@/lib/ui-tokens";
import { MgmtChannelTabBar } from "../MgmtChannelTabs";
import { fillTemplate, shortfallSummary, fmtExceptionType } from "@/lib/management";
import SelectDark from "@/components/SelectDark";

// ─── Types ───────────────────────────────────────────────────────────────────

type Severity = "red" | "yellow" | "green";
type TaskStatus = "open" | "sent" | "responded" | "closed" | "escalated";

interface ManagementTask {
  id: number;
  city: string;
  branch: string;
  type: string;
  source_id: string | null;
  severity: Severity;
  status: TaskStatus;
  bo_assignee: string | null;
  template_key: string | null;
  sent_message: string | null;
  manager_name: string | null;
  response: string | null;
  response_action: string | null;
  response_note: string | null;
  context: Record<string, unknown> | null;
  missed_by_manager: boolean;
  created_at: string;
  sent_at: string | null;
  responded_at: string | null;
  closed_at: string | null;
  escalated_at: string | null;
}

interface JobRun {
  job: string;
  city: string;
  ran_at: string;
  seconds_ago: number;
  created: number;
  escalated: number;
  missed: number;
  skipped: number;
  errors: { detector: string; error: string }[];
}

interface ActionTemplate {
  exception_type: string;
  severity: Severity;
  title_en: string;
  title_ja: string;
  message_en: string;
  message_ja: string;
  response_options: ResponseOption[];
  /** Second stage — empty when the cause is the whole answer. */
  action_options: ResponseOption[];
  response_label: string | null;
  action_label: string | null;
}

interface ResponseOption {
  key: string;
  label_en: string;
  type: "done" | "cannot" | "neutral";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────


/** Today's date in the store's own timezone — never the browser's. */
function storeToday(city: string): string {
  const tz = city === "dubai" ? "Asia/Dubai" : "Asia/Manila";
  // en-CA gives YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

/**
 * Whether the automatic sweep is still running, and when it last did.
 *
 * Everything in this channel — detection, the 30-minute escalation, the SLA
 * miss log, the weekly score — depends on that job. If it stops, the dashboard
 * goes quiet and looks exactly like a good day, which is how the channel sat
 * dead from 2026-08-22 without anyone noticing.
 */
function AutoCheckBanner({ runs, city }: { runs: JobRun[]; city: string }) {
  const relevant = runs.filter(r => r.job === "detect" && (city === "all" || r.city === city));
  if (relevant.length === 0) {
    return (
      <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-2.5 text-sm text-amber-100/90 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-400" />
        <span>
          The automatic check has not reported yet. Until it does, tasks appear only
          when someone presses Run Detection.
        </span>
      </div>
    );
  }

  const stalest = relevant.reduce((a, b) => (a.seconds_ago > b.seconds_ago ? a : b));
  const failing = relevant.filter(r => r.errors?.length > 0);
  // The job runs every 15 minutes; an hour of silence means it stopped.
  const stale = stalest.seconds_ago > 3600;
  const mins = Math.round(stalest.seconds_ago / 60);
  const ago = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)}h ago`;

  if (stale || failing.length) {
    return (
      <div className="mb-4 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-2.5 text-sm text-red-100 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-400" />
        <div>
          {stale ? (
            <>Automatic checks have not run for {ago}. Exceptions are not being detected.</>
          ) : (
            <>
              Automatic check ran {ago}, but {failing.length} detector(s) failed:{" "}
              {failing.flatMap(r => r.errors.map(e => `${r.city}/${e.detector}`)).join(", ")}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-center gap-2 text-xs text-zinc-500">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
      <span>
        Automatic check ran {ago}
        {stalest.skipped > 0 && (
          <span className="text-amber-400"> · {stalest.skipped} item(s) not judged</span>
        )}
      </span>
    </div>
  );
}

function fmtLabel(type: string) {
  return fmtExceptionType(type);
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin <= 0) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Severity / Status UI ─────────────────────────────────────────────────────

function SevBadge({ sev }: { sev: Severity }) {
  if (sev === "red")    return <span className="text-base">🔴</span>;
  if (sev === "yellow") return <span className="text-base">🟠</span>;
  return <span className="text-base">🟢</span>;
}

function StatusBadge({ status }: { status: TaskStatus }) {
  if (status === "open")      return <span className={BADGE_INFO}>Open</span>;
  if (status === "sent")      return <span className={BADGE_WARNING}>Sent</span>;
  if (status === "responded") return <span className={BADGE_SUCCESS}>Responded</span>;
  if (status === "closed")    return <span className={BADGE_SUCCESS}>Closed</span>;
  if (status === "escalated") return <span className={BADGE_ERROR}>Escalated</span>;
  return <span className={BADGE_INFO}>{status}</span>;
}

// ─── Answer rates ─────────────────────────────────────────────────────────────

type RateRow = {
  type: string;
  generated: number;
  per_day: number;
  sent: number;
  answered: number;
  answer_rate: number | null;
  scored: boolean;
};

/** Which exception types are worth sending, measured rather than assumed.
 *
 *  Types get added over time and nobody looks back. product_score_c grew to
 *  three quarters of everything the channel raised and was answered twice in
 *  eleven sends, while rush_check_missing was answered three times out of three.
 *  Read this monthly: a type that stops being answered should stop being sent.
 */
function AnswerRates({ city }: { city: string }) {
  const [rows, setRows] = useState<RateRow[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/management/type-response-rates?city=${encodeURIComponent(city)}&days=30`,
          { headers: getAuthHeaders(getAuth()) },
        );
        if (!res.ok) return;
        const d = await res.json();
        if (!cancelled) setRows(d.rows || []);
      } catch { /* the page works without it */ }
    })();
    return () => { cancelled = true; };
  }, [city]);

  if (!rows || rows.length === 0) return null;
  const perDay = rows.reduce((n, r) => n + r.per_day, 0);
  const neverSent = rows.filter(r => r.sent === 0);

  return (
    <div className={GLASS_CARD + " mb-5 p-4"}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <div className="text-sm font-semibold text-zinc-100">
            What this channel sends — last 30 days
          </div>
          <div className={T_CAPTION + " mt-0.5"}>
            {perDay.toFixed(1)} raised per day
            {neverSent.length > 0
              ? ` · ${neverSent.length} type${neverSent.length === 1 ? "" : "s"} never sent`
              : ""}
          </div>
        </div>
        <span className="text-xs text-zinc-400">{open ? "Hide" : "Show"}</span>
      </button>

      {open ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-zinc-500">
                <th className="pb-2 pr-3 font-medium">Type</th>
                <th className="pb-2 pr-3 text-right font-medium">Per day</th>
                <th className="pb-2 pr-3 text-right font-medium">Sent</th>
                <th className="pb-2 pr-3 text-right font-medium">Answered</th>
                <th className="pb-2 pr-3 text-right font-medium">Rate</th>
                <th className="pb-2 font-medium">Scored</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map(r => (
                <tr key={r.type} className="border-t border-white/5">
                  <td className="py-1.5 pr-3 text-zinc-200">{fmtLabel(r.type)}</td>
                  <td className="py-1.5 pr-3 text-right text-zinc-300">{r.per_day}</td>
                  <td className="py-1.5 pr-3 text-right text-zinc-300">{r.sent}</td>
                  <td className="py-1.5 pr-3 text-right text-zinc-300">{r.answered}</td>
                  <td className={`py-1.5 pr-3 text-right font-semibold ${
                    r.answer_rate === null ? "text-zinc-500"
                      : r.answer_rate >= 0.6 ? "text-emerald-300"
                      : r.answer_rate >= 0.3 ? "text-amber-300" : "text-rose-300"
                  }`}>
                    {/* Never sent is not a zero answer rate. One is the back
                        office's to explain, the other the manager's. */}
                    {r.answer_rate === null ? "never sent" : `${Math.round(r.answer_rate * 100)}%`}
                  </td>
                  <td className="py-1.5 text-zinc-400">{r.scored ? "yes" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={T_CAPTION + " mt-3"}>
            A type nobody answers is not reaching anyone in a form they can act on.
            Fix the wording or stop sending it — leaving it in place is how a channel
            becomes something people ignore.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ─── Send Modal ───────────────────────────────────────────────────────────────

interface SendModalProps {
  task: ManagementTask;
  template: ActionTemplate | null;
  customMessage: string;
  onChangeMessage: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  sending: boolean;
}

type OwnerPreview = {
  staff_name: string;
  substitute: string;
  on_shift: boolean | null;
  discord_user_id: string;
  reason: string;
};

function SendModal({ task, template, customMessage, onChangeMessage, onConfirm, onClose, sending }: SendModalProps) {
  const [owner, setOwner] = useState<OwnerPreview | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const date = String(task.context?.date || "");
        const params = new URLSearchParams({ city: task.city, branch: task.branch });
        if (date) params.set("on_date", date);
        const res = await fetch(`/api/admin/management/owner-preview?${params}`, {
          headers: getAuthHeaders(getAuth()),
        });
        if (!res.ok) return;
        const d = await res.json();
        if (!cancelled) setOwner(d);
      } catch { /* the modal still works without it */ }
    })();
    return () => { cancelled = true; };
  }, [task.id]);

  // on_shift === false is the only case worth raising. null means there is no
  // published shift to read, which is not the same as "off", and treating it as
  // one would put a warning on every task.
  const offShift = owner?.on_shift === false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={GLASS_CARD + " w-full max-w-lg p-6"}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <SevBadge sev={task.severity} />
              <span className="font-semibold text-white text-sm">{fmtLabel(task.type)}</span>
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">
              {task.branch} · Manager: {task.manager_name || "Unknown"}
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        {owner && !owner.staff_name ? (
          <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-950/20 p-3">
            <p className="text-sm font-semibold text-rose-200">No manager rostered</p>
            <p className="mt-1 text-[13px] text-rose-100/80">
              {owner.reason || `${task.branch} has nobody on duty for this day.`} Sending is
              blocked until someone is set under Management → Assignments.
            </p>
          </div>
        ) : null}

        {offShift ? (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-950/15 p-3">
            <p className="text-sm font-semibold text-amber-200">
              {owner?.staff_name} is not on the published shift for this day
            </p>
            <p className="mt-1 text-[13px] text-amber-100/80">
              {owner?.substitute
                ? `The stand-in for ${task.branch} is ${owner.substitute}.`
                : `No stand-in is set for ${task.branch}.`}{" "}
              Nothing is switched automatically — the published shift is not always
              right, and a silent switch delivers to someone whose branch it is not.
            </p>
          </div>
        ) : null}

        {owner?.staff_name && !owner.discord_user_id ? (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-950/10 p-3 text-[13px] text-amber-100/80">
            {owner.staff_name} has no Discord ID recorded, so no notification will
            be posted. They would have to open the page themselves.
          </div>
        ) : null}

        {template ? (
          <div className="mb-4">
            <div className={T_LABEL + " mb-2"}>Pre-written instruction (from template)</div>
            <div className="rounded-lg border border-violet-500/20 bg-violet-950/20 p-3 text-sm text-zinc-200 leading-relaxed italic">
              {fillTemplate(template.message_en, task.context)}
            </div>
            {template.response_options.length > 0 && (
              <div className="mt-2">
                <div className={T_LABEL + " mb-1.5"}>
                  {template.response_label || "Manager will respond with"}
                </div>
                <OptionChips options={template.response_options} />
              </div>
            )}
            {template.action_options && template.action_options.length > 0 && (
              <div className="mt-3">
                <div className={T_LABEL + " mb-1.5 text-sky-400/80"}>
                  Then: {template.action_label || "Action Taken"}
                </div>
                <OptionChips options={template.action_options} />
                <div className={T_CAPTION + " mt-1.5"}>
                  The manager cannot submit until both stages are answered.
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mb-4">
            <div className={T_LABEL + " mb-2"}>Custom message (no template found)</div>
            <textarea
              className="w-full rounded-xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 resize-none"
              rows={4}
              placeholder="Type an instruction for the manager..."
              value={customMessage}
              onChange={e => onChangeMessage(e.target.value)}
            />
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={sending || (!template && !customMessage.trim())
                       || (owner !== null && !owner.staff_name)}
            className={PRIMARY_BUTTON + " flex-1 flex items-center justify-center gap-2"}
          >
            <Send className="h-4 w-4" />
            {sending
              ? "Sending…"
              : owner?.staff_name
                ? `Send to ${owner.staff_name}`
                : "Send Instruction"}
          </button>
          <button onClick={onClose} className={SECONDARY_BUTTON}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Task Thread ──────────────────────────────────────────────────────────────

interface TaskMessage {
  id: number;
  task_id: number;
  author_name: string;
  author_role: string;
  body: string;
  created_at: string;
}

interface TaskThreadProps {
  taskId: number;
}

function TaskThread({ taskId }: TaskThreadProps) {
  const [messages, setMessages] = useState<TaskMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const headers = getAuthHeaders(getAuth());
      const res = await fetch(`/api/admin/management/tasks/${taskId}/messages`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages || []);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      const auth = getAuth();
      const headers = getAuthHeaders(auth);
      const res = await fetch(`/api/admin/management/tasks/${taskId}/messages`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          body: body.trim(),
          author_name: auth?.staffName || "BO Staff",
          author_role: "bo",
        }),
      });
      if (!res.ok) return;
      const msg = await res.json();
      setMessages(prev => [...prev, msg]);
      setBody("");
    } finally {
      setSending(false);
    }
  }

  const rolePill = (role: string) => {
    if (role === "manager") return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
    if (role === "bo")      return "bg-violet-500/15 text-violet-300 border border-violet-500/30";
    return "bg-blue-500/15 text-blue-300 border border-blue-500/30";
  };
  const roleLabel = (role: string) => {
    if (role === "manager")      return "Manager";
    if (role === "bo")           return "BO";
    if (role === "area_manager") return "Area Mgr";
    return "HQ";
  };

  return (
    <div className="mt-3 border-t border-white/8 pt-3">
      <div className="flex items-center gap-1.5 mb-2">
        <MessageSquare className="h-3.5 w-3.5 text-zinc-500" />
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Thread</span>
        {messages.length > 0 && (
          <span className="text-xs text-zinc-600">({messages.length})</span>
        )}
      </div>

      {/* Message list */}
      <div className="max-h-48 overflow-y-auto space-y-2 mb-2 pr-1">
        {loading ? (
          <div className="text-xs text-zinc-600 py-2">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="text-xs text-zinc-600 py-1 italic">No messages yet. Start the thread to follow up.</div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className="flex gap-2 items-start">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${rolePill(msg.author_role)}`}>
                {roleLabel(msg.author_role)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-medium text-zinc-200 truncate">{msg.author_name}</span>
                  <span className="text-[10px] text-zinc-600 flex-shrink-0">{fmtTime(msg.created_at)}</span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed mt-0.5 break-words">{msg.body}</p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Add a follow-up note…"
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
        />
        <button
          onClick={handleSend}
          disabled={sending || !body.trim()}
          className="rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1.5 text-white transition-colors"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** The response choices a manager will see, rendered as read-only chips. */
function OptionChips({ options }: { options: ResponseOption[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => (
        <span
          key={opt.key}
          className={
            opt.type === "done"
              ? "text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              : opt.type === "cannot"
              ? "text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30"
              : "text-xs px-2 py-0.5 rounded-full bg-white/8 text-zinc-300 border border-white/15"
          }
        >
          {opt.label_en}
        </span>
      ))}
    </div>
  );
}

// ─── Task Row ─────────────────────────────────────────────────────────────────



/**
 * The photo a product-score alert is about.
 *
 * The alert identifies it only by the time it was scored. Showing it on the task
 * is what lets a reviewer judge the score rather than take it on trust.
 */
function TaskPhoto({ taskId }: { taskId: number }) {
  const [failed, setFailed] = useState(false);
  const [full, setFull] = useState(false);
  if (failed) return null;
  const src = `/api/admin/management/tasks/${taskId}/photo`;
  const thumb = `${src}?size=thumb`;
  return (
    <>
      <button
        type="button"
        onClick={() => setFull(true)}
        className="block w-full overflow-hidden rounded-lg border border-white/10 bg-black/20"
        title="Click to enlarge"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb}
          alt="Scored product"
          loading="lazy"
          onError={() => setFailed(true)}
          className="max-h-48 w-full object-contain"
        />
      </button>
      {full && (
        <div
          onClick={() => setFull(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Scored product" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </>
  );
}

// ─── Per-photo answers ────────────────────────────────────────────────────────

interface ScoredItem {
  score_id?: string | number;
  scored_at?: string;
  total_score?: string | number;
  grade?: string;
  posted_by?: string;
}
interface ItemAnswer {
  cause?: string;
  action?: string;
  note?: string;
  feedback_discord?: boolean;
  feedback_kitchen?: boolean;
  answered_by?: string;
}

/**
 * What the manager said about each scored photo, and where they said it.
 *
 * The rolled-up Manager Response below can only show one line for a task that
 * covers a whole day of photos, and it never showed the channel at all — so
 * "feedback given" gave the back office nothing to go and read. Reviewing
 * whether feedback is actually reaching Discord starts here.
 */
function PerPhotoAnswers({ task }: { task: ManagementTask }) {
  const items = (task.context?.items as ScoredItem[] | undefined) || [];
  const answers = (task.context?.answers as Record<string, ItemAnswer> | undefined) || {};
  if (items.length === 0 || Object.keys(answers).length === 0) return null;

  return (
    <div>
      <div className={T_LABEL + " mb-1.5"}>Per-photo answers</div>
      <div className="space-y-1.5">
        {items.map((it, i) => {
          const key = String(it.score_id ?? i);
          const a = answers[key];
          return (
            <div
              key={key}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-white/8 bg-white/4 px-2.5 py-1.5 text-xs"
            >
              <span className="font-semibold tabular-nums text-white">{it.scored_at || "—"}</span>
              <span className="tabular-nums text-amber-300">
                {it.grade || "C"} {it.total_score ?? ""}
              </span>
              {a ? (
                <>
                  <span className="text-emerald-300">{(a.cause || "").replace(/_/g, " ")}</span>
                  {a.action && (
                    <>
                      <span className="text-zinc-500">→</span>
                      <span className="text-sky-300">{a.action.replace(/_/g, " ")}</span>
                    </>
                  )}
                  {a.feedback_discord && (
                    <span className="rounded-full border border-violet-400/50 bg-violet-500/20 px-2 py-0.5 font-semibold text-violet-200">
                      Discord
                    </span>
                  )}
                  {a.feedback_kitchen && (
                    <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 font-semibold text-zinc-300">
                      Kitchen
                    </span>
                  )}
                  {a.note && <span className="text-zinc-400">{a.note}</span>}
                </>
              ) : (
                <span className="text-amber-400/80">not answered yet</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Handling record ──────────────────────────────────────────────────────────

interface Handling {
  photo_checked?: boolean;
  issue_found?: boolean | null;
  issue_category?: string;
  issue_detail?: string;
  feedback_discord?: boolean;
  feedback_kitchen?: boolean;
  training_done?: boolean;
  training_note?: string;
  handled_by?: string;
  handled_at?: string;
}

const ISSUE_CATEGORIES: { key: string; label: string }[] = [
  { key: "portioning",     label: "Portioning / quantity" },
  { key: "freshness",      label: "Freshness" },
  { key: "temperature",    label: "Temperature" },
  { key: "presentation",   label: "Presentation / plating" },
  { key: "packaging",      label: "Packaging" },
  { key: "wrong_item",     label: "Wrong item" },
  { key: "foreign_object", label: "Foreign object" },
  { key: "other",          label: "Other" },
];

function Check({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 accent-violet-500"
      />
      {label}
    </label>
  );
}

/**
 * What was done about this exception.
 *
 * Closing a task used to record nothing at all, so a week later there was no way
 * to tell a handled one from an ignored one. These are the steps as the work
 * actually happens: look at the photo, decide whether there is a problem, tell
 * the team, train if it needs training.
 */
function HandlingPanel({
  task, onSaved,
}: { task: ManagementTask; onSaved: (t: ManagementTask) => void }) {
  const saved = (task.context?.handling ?? null) as Handling | null;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<Handling>({
    photo_checked: saved?.photo_checked ?? false,
    issue_found: saved?.issue_found ?? null,
    issue_category: saved?.issue_category ?? "",
    issue_detail: saved?.issue_detail ?? "",
    feedback_discord: saved?.feedback_discord ?? false,
    feedback_kitchen: saved?.feedback_kitchen ?? false,
    training_done: saved?.training_done ?? false,
    training_note: saved?.training_note ?? "",
  });
  const [closeTask, setCloseTask] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/management/tasks/${task.id}/handling`, {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, close_task: closeTask }),
      });
      if (!res.ok) throw new Error((await res.text()).slice(0, 200) || `Save failed (${res.status})`);
      const data = await res.json();
      onSaved(data.task as ManagementTask);
      setOpen(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className={T_LABEL}>Handling</div>
        {saved?.handled_at ? (
          <span className="text-[11px] text-emerald-300">
            {saved.handled_by} · {fmtTime(saved.handled_at)}
          </span>
        ) : (
          <span className="text-[11px] text-amber-300">Not recorded</span>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-zinc-300 hover:bg-white/10 hover:text-white"
        >
          {open ? "Cancel" : saved?.handled_at ? "Update" : "Record"}
        </button>
      </div>

      {!open && task.response_note && (
        <div className="mt-1.5 text-xs text-zinc-300">{task.response_note}</div>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          <Check
            checked={!!form.photo_checked}
            onChange={(v) => setForm((f) => ({ ...f, photo_checked: v }))}
            label="提出写真を確認した"
          />

          <div className="space-y-1.5">
            <div className={T_LABEL}>問題の有無</div>
            <div className="flex flex-wrap items-center gap-3">
              {[
                { v: false, l: "問題なし" },
                { v: true,  l: "問題あり" },
              ].map((o) => (
                <label key={String(o.v)} className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-300">
                  <input
                    type="radio"
                    checked={form.issue_found === o.v}
                    onChange={() => setForm((f) => ({ ...f, issue_found: o.v }))}
                    className="h-3.5 w-3.5 accent-violet-500"
                  />
                  {o.l}
                </label>
              ))}
            </div>
            {form.issue_found === true && (
              <div className="space-y-2 pt-1">
                <SelectDark
                  value={form.issue_category ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, issue_category: v }))}
                  options={[
                    { value: "", label: "— Issue category —" },
                    ...ISSUE_CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
                  ]}
                />
                <textarea
                  value={form.issue_detail ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, issue_detail: e.target.value }))}
                  rows={2}
                  placeholder="問題の内容"
                  className={INPUT_CLASS + " w-full text-xs"}
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className={T_LABEL}>Feedback / Training</div>
            <Check
              checked={!!form.feedback_discord}
              onChange={(v) => setForm((f) => ({ ...f, feedback_discord: v }))}
              label="Discord でフィードバックした"
            />
            <Check
              checked={!!form.feedback_kitchen}
              onChange={(v) => setForm((f) => ({ ...f, feedback_kitchen: v }))}
              label="キッチンでフィードバックした"
            />
            <Check
              checked={!!form.training_done}
              onChange={(v) => setForm((f) => ({ ...f, training_done: v }))}
              label="トレーニングを実施した"
            />
            {form.training_done && (
              <textarea
                value={form.training_note ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, training_note: e.target.value }))}
                rows={2}
                placeholder="トレーニング内容"
                className={INPUT_CLASS + " w-full text-xs"}
              />
            )}
          </div>

          {err && <div className="text-xs text-red-400">{err}</div>}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Check checked={closeTask} onChange={setCloseTask} label="対応完了として閉じる" />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="ml-auto rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-400 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save handling"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Task row ─────────────────────────────────────────────────────────────────


interface BoPageManualRow { signal: string; means: string; do: string }
interface BoPage {
  key: string;
  slot: string;
  label: string;
  types: string[];
  manual: BoPageManualRow[];
  owner: string;
  owner_conflict: string[];
  red: number;
  yellow: number;
  open_total: number;
}

/**
 * What the colours on this page mean and what to send.
 *
 * The design has back-office staff "look at the colour, open the manual, send
 * the template" — three steps, of which only the middle one required leaving the
 * screen. Printing it here is what makes the job the zero-judgement script it was
 * meant to be.
 */
function ActionManual({ page }: { page: BoPage }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <BookOpen className="h-3.5 w-3.5 text-violet-300" />
        <span className="text-xs font-bold uppercase tracking-wider text-violet-200">Action Manual</span>
        <span className="text-xs text-zinc-500">{page.label}</span>
        {open ? <ChevronUp className="ml-auto h-3.5 w-3.5 text-zinc-500" />
              : <ChevronDown className="ml-auto h-3.5 w-3.5 text-zinc-500" />}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {page.manual.map((m, i) => (
            <div key={i} className="grid grid-cols-[minmax(140px,auto)_1fr] gap-x-3 gap-y-0.5 text-xs">
              <div className="font-semibold text-white">{m.signal}</div>
              <div className="text-zinc-300">{m.do}</div>
              <div className="text-zinc-500">{m.means}</div>
              <div />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface TaskRowProps {
  task: ManagementTask;
  template: ActionTemplate | null;
  onSend: (task: ManagementTask) => void;
  expanded: boolean;
  onToggle: () => void;
  onClaim?: (task: ManagementTask) => void;
  currentUser?: string;
  onHandled?: (task: ManagementTask) => void;
}

function TaskRow({ task, template, onSend, expanded, onToggle, onClaim, currentUser, onHandled }: TaskRowProps) {
  const shortfall = shortfallSummary(task.context);
  return (
    <div className={TABLE_ROW + " border-white/8"}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <SevBadge sev={task.severity} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white truncate">{fmtLabel(task.type)}</span>
            <span className="text-xs text-zinc-500">{task.branch}</span>
            {task.escalated_at && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-red-300 bg-red-500/15 border border-red-500/30 rounded px-1.5 py-0.5">
                Escalated
              </span>
            )}
            {task.missed_by_manager && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-orange-300 bg-orange-500/15 border border-orange-500/30 rounded px-1.5 py-0.5">
                Missed
              </span>
            )}
          </div>
          {shortfall && (
            <div className="text-xs text-amber-300 mt-0.5 tabular-nums truncate">{shortfall}</div>
          )}
          <div className="flex items-center gap-3 mt-0.5">
            {/* manager_name is who the task is addressed to, not who answered
                it. This read "Replied by: <name>" on every row — harmless while
                almost no task had an addressee, and wrong on all of them once
                the duty roster started filling it in. */}
            <span className={T_CAPTION}>
              {task.response ? (
                <>Replied by: <span className="text-zinc-300">{task.manager_name || "the store"}</span></>
              ) : task.status === "open" ? (
                task.manager_name
                  ? <>Not sent yet — goes to <span className="text-zinc-300">{task.manager_name}</span></>
                  : <>Not sent yet</>
              ) : !task.sent_at ? (
                // Closed without ever going out — the auto-close sweep when the
                // report turned up, the seven-day expiry, or a bulk clear. 208
                // of these read "Sent … awaiting reply", which is wrong twice:
                // nothing was sent, and nothing is being awaited.
                <>Closed without being sent</>
              ) : task.status === "closed" ? (
                <>Sent to <span className="text-zinc-300">{task.manager_name || "the store"}</span> · closed</>
              ) : task.manager_name ? (
                <>Sent to <span className="text-zinc-300">{task.manager_name}</span> · awaiting reply</>
              ) : (
                <>Awaiting the store’s reply</>
              )}
            </span>
            <span className={T_CAPTION}>{fmtTime(task.created_at)}</span>
            {/* Whose queue this sits in. Without it on the row, a task owned by
                someone who is off today looks the same as one being worked on. */}
            <span className={T_CAPTION}>
              {task.bo_assignee ? (
                <>Owner: <span className="text-zinc-300">{task.bo_assignee}</span></>
              ) : (
                <span className="text-red-300">No owner</span>
              )}
            </span>
            {onClaim && task.status !== "closed" && task.bo_assignee !== currentUser && (
              <button
                onClick={() => onClaim(task)}
                className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                {task.bo_assignee ? "Take over" : "Take this"}
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={task.status} />
          {task.status === "open" && (
            <button
              onClick={() => onSend(task)}
              className="flex items-center gap-1.5 rounded-lg bg-violet-500 hover:bg-violet-400 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
              Send
            </button>
          )}
          <button onClick={onToggle} className="text-zinc-500 hover:text-zinc-300 transition-colors p-1">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2 border-t border-white/5 pt-3">
          {task.sent_message && (
            <div>
              <div className={T_LABEL + " mb-1"}>Sent Instruction</div>
              <div className="text-xs text-zinc-300 leading-relaxed bg-white/5 rounded-lg p-3 italic">
                {fillTemplate(task.sent_message, task.context)}
              </div>
              {task.sent_at && (
                <div className={T_CAPTION + " mt-1"}>Sent: {fmtTime(task.sent_at)}</div>
              )}
            </div>
          )}
          <PerPhotoAnswers task={task} />
          {task.response && (
            <div>
              <div className={T_LABEL + " mb-1"}>Manager Response</div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-2.5 py-0.5">
                  {task.response.replace(/_/g, " ")}
                </span>
                {task.response_action && (
                  <>
                    <span className="text-zinc-500 text-xs">→</span>
                    <span className="text-xs font-semibold text-sky-300 bg-sky-500/10 border border-sky-500/25 rounded-full px-2.5 py-0.5">
                      {task.response_action.replace(/_/g, " ")}
                    </span>
                  </>
                )}
                {task.responded_at && (
                  <span className={T_CAPTION}>at {fmtTime(task.responded_at)}</span>
                )}
              </div>
              {task.response_note && (
                <div className="text-xs text-zinc-400 mt-1">{task.response_note}</div>
              )}
            </div>
          )}
          {task.status === "sent" && !task.response && (
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <Clock className="h-3.5 w-3.5" />
              Awaiting manager response…
            </div>
          )}
          {task.type === "product_score_c" && <TaskPhoto taskId={task.id} />}
          {onHandled && <HandlingPanel task={task} onSaved={onHandled} />}
          <TaskThread taskId={task.id} />
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BODashboardPage() {
  const router = useRouter();
  const auth = getAuth();

  const [tasks, setTasks] = useState<ManagementTask[]>([]);
  const [templates, setTemplates] = useState<Record<string, ActionTemplate>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [jobRuns, setJobRuns] = useState<JobRun[]>([]);
  const [detecting, setDetecting] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [pages, setPages] = useState<BoPage[]>([]);
  // Defaults to the pages this person owns. The design gives each back-office
  // member specific pages and says they "see only their exceptions"; a list of
  // everyone's is a list nobody treats as theirs.
  const [pageFilter, setPageFilter] = useState<string>("mine");
  const [cityFilter, setCityFilter] = useState<string>("manila");

  // Send modal
  const [sendingTask, setSendingTask] = useState<ManagementTask | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Expanded rows
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!auth) { router.replace("/login?next=%2Fadmin%2Fmanagement%2Fback-office"); return; }
    if (!canAccessAdminNav(auth)) { router.replace("/"); return; }
  }, []);

  const loadTemplates = useCallback(async () => {
    const headers = getAuthHeaders(getAuth());
    const res = await fetch("/api/admin/management/templates", { headers });
    if (!res.ok) return;
    const data = await res.json();
    const map: Record<string, ActionTemplate> = {};
    for (const t of data.templates || []) {
      map[t.exception_type] = t;
    }
    setTemplates(map);
  }, []);

  const loadTasks = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const headers = getAuthHeaders(getAuth());
      // Always fetch all statuses so KPI cards show accurate totals across all statuses
      const params = new URLSearchParams({ city: cityFilter, limit: "200" });
      const res = await fetch(`/api/admin/management/tasks?${params}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cityFilter]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/admin/management/bo-pages?city=${cityFilter}`, {
          headers: getAuthHeaders(getAuth()), cache: "no-store",
        });
        if (res.ok) setPages(((await res.json())?.pages ?? []) as BoPage[]);
      } catch { /* the dashboard still works without the manual */ }
    })();
  }, [cityFilter]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    loadTasks();
    loadJobRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTasks]);

  // KPI counts
  const openCount      = tasks.filter(t => t.status === "open").length;
  const sentCount      = tasks.filter(t => t.status === "sent").length;
  const respondedCount = tasks.filter(t => t.status === "responded").length;
  const closedCount    = tasks.filter(t => t.status === "closed").length;

  // Filter by status client-side (tasks are always fetched for all statuses for accurate KPI counts)
  const me = getAuth()?.staffName || "";
  const myPages = pages.filter((p) => p.owner && p.owner === me);
  const activePages =
    pageFilter === "all" ? pages
    : pageFilter === "mine" ? (myPages.length > 0 ? myPages : pages)
    : pages.filter((p) => p.key === pageFilter);
  const allowedTypes = new Set(activePages.flatMap((p) => p.types));

  const pageFilteredTasks = pages.length === 0
    ? tasks
    : tasks.filter((t) => allowedTypes.has(t.type));

  const filteredTasks = statusFilter && statusFilter !== "all"
    ? pageFilteredTasks.filter(t => t.status === statusFilter)
    : pageFilteredTasks;

  // Sorted: red first, then by created_at desc
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const sevOrd = { red: 0, yellow: 1, green: 2 };
    const so = (sevOrd[a.severity] ?? 9) - (sevOrd[b.severity] ?? 9);
    if (so !== 0) return so;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  async function loadJobRuns() {
    try {
      const res = await fetch("/api/admin/management/job-runs", {
        headers: getAuthHeaders(getAuth()),
      });
      if (!res.ok) return;
      const d = await res.json();
      setJobRuns(d.runs || []);
    } catch {
      /* the banner degrades to "unknown", which is the honest reading */
    }
  }

  async function handleSeedTemplates() {
    setSeeding(true);
    try {
      const headers = getAuthHeaders(getAuth());
      const res = await fetch("/api/admin/management/seed-templates", {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadTemplates();
    } catch {
      alert("Failed to seed templates. Please try again.");
    } finally {
      setSeeding(false);
    }
  }

  async function handleDetect() {
    if (cityFilter === "all") {
      alert("Please select a specific city (Manila or Dubai) to run detection.");
      return;
    }
    setDetecting(true);
    try {
      const headers = getAuthHeaders(getAuth());
      const res = await fetch("/api/admin/management/detect", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        // The date is the STORE's, not the browser's. toISOString() is UTC, so
        // a Manila morning run would have scanned yesterday.
        body: JSON.stringify({ city: cityFilter, date: storeToday(cityFilter) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      await loadTasks(true);

      // A failed detector must not read as a clean scan. The API reports which
      // ones broke and which items it declined to judge; showing only the
      // created count is how "0 new tasks" hides a dead rule.
      const errs: { detector: string; error: string }[] = data.errors || [];
      const skipped: { branch: string; item: string; reason: string }[] = data.skipped || [];
      const lines = [
        `Detection complete — ${data.created} new task${data.created !== 1 ? "s" : ""}.`,
      ];
      if (data.escalated) lines.push(`${data.escalated} task(s) escalated to red.`);
      if (data.missed) lines.push(`${data.missed} task(s) past SLA marked as missed.`);
      if (skipped.length) {
        lines.push(
          "",
          `${skipped.length} item(s) could NOT be judged:`,
          ...skipped.slice(0, 5).map(s => `  • ${s.branch} ${s.item} — ${s.reason}`),
          ...(skipped.length > 5 ? [`  • …and ${skipped.length - 5} more`] : []),
        );
      }
      if (errs.length) {
        lines.push(
          "",
          `⚠️ ${errs.length} detector(s) FAILED — those exceptions were not scanned:`,
          ...errs.map(e => `  • ${e.detector}: ${e.error}`),
        );
      }
      alert(lines.join("\n"));
    } catch (e) {
      alert(`Detection failed: ${e}`);
    } finally {
      setDetecting(false);
    }
  }

  function openSendModal(task: ManagementTask) {
    setSendingTask(task);
    setCustomMessage(fillTemplate(templates[task.type]?.message_en || "", task.context));
  }

  /** Take a task into your own queue.
   *
   *  HQ names an owner per exception type, which is right until that person is
   *  off — and then their queue is the only place the task appears. Anyone can
   *  pick it up; the name is what the dashboard filters and reports on.
   */
  async function claimTask(task: ManagementTask) {
    const me = getAuth()?.staffName || "";
    if (!me) return;
    try {
      const res = await fetch(`/api/admin/management/tasks/${task.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ bo_assignee: me }),
      });
      if (!res.ok) throw new Error(`Could not take this task (${res.status})`);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, bo_assignee: me } : t)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSend() {
    if (!sendingTask) return;
    setSending(true);
    try {
      const template = templates[sendingTask.type];
      // Send the substituted text, not the raw template — the stored
      // sent_message is what the manager and every later reader sees.
      const message = template
        ? fillTemplate(template.message_en, sendingTask?.context)
        : customMessage.trim();
      const headers = getAuthHeaders(getAuth());
      const res = await fetch(`/api/admin/management/tasks/${sendingTask.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "sent",
          sent_message: message,
          template_key: sendingTask.type,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The server refuses to send a Manila task with no owner. Say which
        // branch and what to do — "Failed, try again" would send the person
        // round the same loop, and retrying cannot help.
        throw new Error(data?.detail || `HTTP ${res.status}`);
      }
      // The task is recorded either way; a ping that did not leave is worth
      // knowing about rather than assuming.
      if (data?.notified && data.notified.sent === false) {
        setError(`Sent, but Discord was not notified — ${data.notified.reason}.`);
      }
      setSendingTask(null);
      setCustomMessage("");
      await loadTasks(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send instruction.");
    } finally {
      setSending(false);
    }
  }

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0f1e] via-[#0d1526] to-[#0a0f1e] pb-24">
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <MgmtChannelTabBar active="bo" />
        <AutoCheckBanner runs={jobRuns} city={cityFilter} />
        <AnswerRates city={cityFilter} />


        {/* Header */}
        <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className={T_PAGE_TITLE}>Management Back Office</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Review store exceptions and send pre-written instructions to managers.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDetect}
              disabled={detecting || cityFilter === "all"}
              className={SMALL_BUTTON + " flex items-center gap-2"}
              title={cityFilter === "all" ? "Select a city first" : "Scan for new exceptions"}
            >
              <AlertTriangle className={`h-3.5 w-3.5 ${detecting ? "animate-pulse" : ""}`} />
              {detecting ? "Detecting…" : "Run Detection"}
            </button>
            <button
              onClick={() => loadTasks(true)}
              disabled={refreshing}
              className={SMALL_BUTTON + " flex items-center gap-2"}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Open", value: openCount, color: "text-violet-400" },
            { label: "Sent (Awaiting)", value: sentCount, color: "text-amber-400" },
            { label: "Responded", value: respondedCount, color: "text-emerald-400" },
            { label: "Closed", value: closedCount, color: "text-zinc-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className={KPI_CARD}>
              <div className={KPI_LABEL}>{label}</div>
              <div className={KPI_VALUE + " " + color}>{value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex items-center gap-2">
            <span className={T_LABEL}>City</span>
            <SelectDark
              value={cityFilter}
              onChange={v => setCityFilter(v)}
              options={[
                { value: "manila", label: "Manila" },
                { value: "dubai",  label: "Dubai" },
              ]}
              className="w-32 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className={T_LABEL}>Status</span>
            <SelectDark
              value={statusFilter}
              onChange={v => setStatusFilter(v)}
              options={[
                { value: "open",      label: "Open" },
                { value: "sent",      label: "Sent" },
                { value: "responded", label: "Responded" },
                { value: "closed",    label: "Closed" },
                { value: "all",       label: "All" },
              ]}
              className="w-36 text-sm"
            />
          </div>
        </div>

        {/* Task List */}
        {pages.length > 0 && (
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={T_LABEL}>Page</span>
              {[{ key: "mine", label: myPages.length > 0 ? "My pages" : "My pages (none assigned)" },
                ...pages.map((p) => ({ key: p.key, label: p.label })),
                { key: "all", label: "All" }].map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setPageFilter(o.key)}
                  className={`rounded-lg border px-3 py-1 text-xs font-semibold transition-colors ${
                    pageFilter === o.key
                      ? "border-violet-500/50 bg-violet-500/20 text-white"
                      : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"
                  }`}
                >
                  {o.label}
                  {o.key !== "mine" && o.key !== "all" && (() => {
                    const pg = pages.find((x) => x.key === o.key);
                    return pg && pg.open_total > 0
                      ? <span className="ml-1.5 tabular-nums text-zinc-400">{pg.open_total}</span>
                      : null;
                  })()}
                </button>
              ))}
            </div>

            {/* The manual for whatever is being worked, on the page being worked. */}
            {activePages.map((p) => (
              <div key={p.key} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-white">{p.label}</span>
                  <span className="text-zinc-500">{p.slot}</span>
                  {p.owner
                    ? <span className="text-zinc-400">Owner: <span className="text-zinc-200">{p.owner}</span></span>
                    : <span className="text-red-300">No owner set</span>}
                  {p.owner_conflict.length > 0 && (
                    <span className="text-amber-300">
                      分割されています: {p.owner_conflict.join(" / ")}
                    </span>
                  )}
                  {p.red > 0 && <span className="text-red-300">赤 {p.red}</span>}
                  {p.yellow > 0 && <span className="text-amber-300">黄 {p.yellow}</span>}
                </div>
                <ActionManual page={p} />
              </div>
            ))}
          </div>
        )}

        <div className={GLASS_CARD + " overflow-hidden"}>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-zinc-500">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-red-400 p-6">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          ) : sortedTasks.length === 0 ? (
            <div className="py-16 text-center text-zinc-500">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-zinc-600" />
              <div className="text-sm">No tasks for the selected filters.</div>
              {statusFilter === "open" && (
                <div className="text-xs mt-1 text-zinc-600">No open exceptions — all clear! ✅</div>
              )}
            </div>
          ) : (
            <div>
              {/* Table header */}
              <div className="hidden sm:flex items-center gap-3 px-4 py-2 border-b border-white/8">
                <div className="w-6" />
                <div className={TABLE_HEADER + " flex-1"}>Exception</div>
                <div className={TABLE_HEADER + " w-28"}>Branch</div>
                <div className={TABLE_HEADER + " w-28"}>Detected</div>
                <div className={TABLE_HEADER + " w-28"}>Status</div>
                <div className={TABLE_HEADER + " w-20 text-right"}>Action</div>
              </div>
              {sortedTasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  template={templates[task.type] || null}
                  onSend={openSendModal}
                  expanded={expanded.has(task.id)}
                  onToggle={() => toggleExpand(task.id)}
                  onClaim={claimTask}
                  currentUser={getAuth()?.staffName || ""}
                  onHandled={(t) => setTasks((prev) => prev.map((x) => (x.id === t.id ? t : x)))}
                />
              ))}
            </div>
          )}
        </div>

        {/* No templates warning */}
        {Object.keys(templates).length === 0 && !loading && (
          <div className="mt-4 rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-amber-300">⚠️ No action templates loaded</div>
                <div className="text-amber-400/80 mt-1 text-xs">
                  Seed the default templates to enable pre-written instructions for all exception types.
                </div>
              </div>
              <button
                onClick={handleSeedTemplates}
                disabled={seeding}
                className="shrink-0 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
              >
                {seeding ? "Seeding…" : "Seed Default Templates"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Send Modal */}
      {sendingTask && (
        <SendModal
          task={sendingTask}
          template={templates[sendingTask.type] || null}
          customMessage={customMessage}
          onChangeMessage={setCustomMessage}
          onConfirm={handleSend}
          onClose={() => { setSendingTask(null); setCustomMessage(""); }}
          sending={sending}
        />
      )}
    </div>
  );
}
