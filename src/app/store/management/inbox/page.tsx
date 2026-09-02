"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Send,
} from "lucide-react";
import SelectDark from "@/components/SelectDark";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  T_PAGE_TITLE,
  T_LABEL,
  T_CAPTION,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
} from "@/lib/ui-tokens";
import {
  fillTemplate,
  shortfallSummary,
  type ResponseOption as MgmtResponseOption,
  type ActionTemplate as MgmtActionTemplate,
} from "@/lib/management";

// ─── Types ───────────────────────────────────────────────────────────────────

type Severity = "red" | "yellow" | "green";
type TaskStatus = "open" | "sent" | "responded" | "closed" | "escalated";

/** One scored photo inside a product-score alert. */
interface ScoredItem {
  score_id?: string | number;
  scored_at?: string;
  total_score?: string | number;
  grade?: string;
  posted_by?: string;
  food_category?: string;
}

/** The answer recorded against one scored photo. */
interface ItemAnswer {
  cause?: string;
  action?: string;
  note?: string;
  feedback_discord?: boolean;
  feedback_kitchen?: boolean;
  training_note?: string;
  answered_by?: string;
  answered_at?: string;
}

interface TaskContextShape {
  items?: ScoredItem[];
  answers?: Record<string, ItemAnswer>;
  handling?: ItemAnswer | null;
  [k: string]: unknown;
}

interface RushCheckRow {
  branch: string;
  slot: string;
  submitted_by: string;
  queue_ok: boolean | null;
  prep_ok: boolean | null;
  staffing_ok: boolean | null;
  cleanliness_ok: boolean | null;
  travel_path_ok: boolean | null;
  travel_path_note: string | null;
  note: string | null;
  ticket_count: number | null;
  oldest_order: string | null;
  created_at: string;
}

interface ManagementTask {
  id: number;
  city: string;
  branch: string;
  type: string;
  severity: Severity;
  status: TaskStatus;
  sent_message: string | null;
  template_key: string | null;
  response: string | null;
  response_action: string | null;
  response_note: string | null;
  context: TaskContextShape | null;
  /** Who the task is addressed to, from the duty roster. */
  manager_name: string | null;
  created_at: string;
  sent_at: string | null;
  responded_at: string | null;
}

function scoredItems(task: ManagementTask): ScoredItem[] {
  const raw = task.context?.items;
  if (!Array.isArray(raw)) return [];
  return raw.filter(it => it && typeof it === "object");
}

function itemKey(it: ScoredItem): string {
  return String(it.score_id ?? "");
}

type ResponseOption = MgmtResponseOption;
type ActionTemplate = MgmtActionTemplate;

// ─── Fallback response options by exception type ──────────────────────────────

const FALLBACK_OPTIONS: Record<string, ResponseOption[]> = {
  pm_backup_missing: [
    { key: "submitted_now",  label_en: "Submitted Now",  type: "done" },
    { key: "staff_shortage", label_en: "Staff Shortage", type: "cannot" },
    { key: "system_issue",   label_en: "System Issue",   type: "cannot" },
    { key: "other",          label_en: "Other…",         type: "neutral" },
  ],
  am_backup_missing: [
    { key: "submitted_now",  label_en: "Submitted Now",  type: "done" },
    { key: "staff_shortage", label_en: "Staff Shortage", type: "cannot" },
    { key: "other",          label_en: "Other…",         type: "neutral" },
  ],
  backup_below_50: [
    { key: "insufficient_prep",  label_en: "Insufficient Prep",  type: "cannot" },
    { key: "higher_sales",       label_en: "Higher Sales",       type: "cannot" },
    { key: "staff_shortage",     label_en: "Staff Shortage",     type: "cannot" },
    { key: "ck_delivery",        label_en: "CK Delivery Delay",  type: "cannot" },
    { key: "wrong_par_level",    label_en: "Wrong Par Level",    type: "neutral" },
  ],
  disposal_missing: [
    { key: "nil_confirmed",  label_en: "NIL — Zero Disposal Confirmed", type: "done" },
    { key: "submitting_now", label_en: "Submitting Now",                type: "done" },
  ],
  complaint_no_photo: [
    { key: "staff_found_discord_sent",   label_en: "Staff identified + Discord sent",   type: "done" },
    { key: "staff_found_no_discord",     label_en: "Staff identified — no Discord",     type: "cannot" },
    { key: "cannot_identify",            label_en: "Cannot identify staff",             type: "neutral" },
  ],
  attendance_unverified: [
    { key: "was_present_os_issue",  label_en: "Was present — OS issue",  type: "done" },
    { key: "was_present_forgot",    label_en: "Was present — forgot",    type: "done" },
    { key: "was_absent",            label_en: "Was absent",              type: "cannot" },
    { key: "cannot_confirm",        label_en: "Cannot confirm",          type: "neutral" },
  ],
  product_score_c: [
    { key: "presentation",          label_en: "Presentation",          type: "cannot" },
    { key: "portion",               label_en: "Portion",               type: "cannot" },
    { key: "rolling_cutting",       label_en: "Rolling / Cutting",     type: "cannot" },
    { key: "sauce_topping",         label_en: "Sauce / Topping",       type: "cannot" },
    { key: "staff_feedback_done",   label_en: "Staff Feedback Done",   type: "done" },
  ],
};

const DEFAULT_OPTIONS: ResponseOption[] = [
  { key: "done",   label_en: "Done",     type: "done" },
  { key: "cannot", label_en: "Cannot",   type: "cannot" },
  { key: "other",  label_en: "Other…",   type: "neutral" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EXCEPTION_LABELS: Record<string, string> = {
  pm_backup_missing:     "PM Backup Report Missing",
  am_backup_missing:     "AM Backup Report Missing",
  backup_below_50:       "Backup Below 50%",
  backup_below_70:       "Backup Below 70%",
  disposal_missing:      "Disposal Report Missing",
  complaint_no_photo:    "Complaint — No Photo",
  attendance_unverified: "Attendance Unverified",
  product_score_c:       "Product Score C",
  product_score_d:       "Product Score D/F",
};

function fmtLabel(type: string) {
  return EXCEPTION_LABELS[type] || type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
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

function getOptions(task: ManagementTask, template: ActionTemplate | null): ResponseOption[] {
  if (template && template.response_options && template.response_options.length > 0) {
    return template.response_options;
  }
  return FALLBACK_OPTIONS[task.type] || DEFAULT_OPTIONS;
}

// ─── Task Thread (store side) ─────────────────────────────────────────────────

interface TaskMessage {
  id: number;
  task_id: number;
  author_name: string;
  author_role: string;
  body: string;
  created_at: string;
}

interface StoreTaskThreadProps {
  taskId: number;
  managerName: string;
}

function StoreTaskThread({ taskId, managerName }: StoreTaskThreadProps) {
  const [messages, setMessages] = useState<TaskMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const headers = getAuthHeaders(getAuth());
      const res = await fetch(`/api/store/management/tasks/${taskId}/messages`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages || []);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function handleSend() {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      const auth = getAuth();
      const headers = getAuthHeaders(auth);
      const res = await fetch(`/api/store/management/tasks/${taskId}/messages`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          body: body.trim(),
          author_name: managerName,
          author_role: "manager",
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
    if (role === "manager")      return "You";
    if (role === "bo")           return "BO";
    if (role === "area_manager") return "Area Mgr";
    return "HQ";
  };

  function fmtMsgTime(iso: string) {
    const d = new Date(iso);
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMin <= 0) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const hasMessages = !loading && messages.length > 0;

  return (
    <div className="mt-4 border-t border-white/10 pt-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors w-full"
      >
        <MessageSquare className="h-4 w-4" />
        <span className="font-medium">
          {hasMessages ? `Messages (${messages.length})` : "Messages"}
        </span>
        {hasMessages && !open && messages[messages.length - 1].author_role === "bo" && (
          <span className="ml-1 text-xs text-violet-400 font-semibold">● New from BO</span>
        )}
        {open ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
      </button>

      {open && (
        <div className="mt-3">
          {/* Messages */}
          <div className="max-h-48 overflow-y-auto space-y-3 mb-3 pr-1">
            {loading ? (
              <div className="text-xs text-zinc-600 py-2">Loading…</div>
            ) : messages.length === 0 ? (
              <div className="text-xs text-zinc-500 italic py-1">
                No messages yet. Back Office may send questions or follow-ups here.
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className="flex gap-2 items-start">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${rolePill(msg.author_role)}`}>
                    {roleLabel(msg.author_role)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-medium text-zinc-200">{msg.author_name}</span>
                      <span className="text-[10px] text-zinc-600">{fmtMsgTime(msg.created_at)}</span>
                    </div>
                    <p className="text-sm text-zinc-300 leading-relaxed mt-0.5 break-words">{msg.body}</p>
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
              placeholder="Reply to Back Office…"
              className="flex-1 rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
            />
            <button
              onClick={handleSend}
              disabled={sending || !body.trim()}
              className="rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2.5 text-white transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Option Group ─────────────────────────────────────────────────────────────

/** One labelled row of choice chips. Used for both response stages. */
function OptionGroup({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: ResponseOption[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <>
      <div className={T_LABEL + " mb-3"}>{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => {
          const isSelected = selected === opt.key;
          const baseColor =
            opt.type === "done"
              ? isSelected ? "bg-emerald-500 text-white border-emerald-500" : "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15"
              : opt.type === "cannot"
              ? isSelected ? "bg-amber-500 text-white border-amber-500" : "border-amber-500/40 text-amber-300 hover:bg-amber-500/15"
              : isSelected ? "bg-white/20 text-white border-white/30" : "border-white/20 text-zinc-300 hover:bg-white/10";
          return (
            <button
              key={opt.key}
              onClick={() => onSelect(opt.key)}
              className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${baseColor}`}
            >
              {opt.label_en}
            </button>
          );
        })}
      </div>
    </>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: ManagementTask;
  template: ActionTemplate | null;
  managerName: string;
  onRespond: (
    task: ManagementTask,
    response: string,
    action: string | null,
    note: string,
    channels?: string[],
    trainingNote?: string,
    itemId?: string | null,
  ) => Promise<void>;
}


/**
 * The photo the alert is about.
 *
 * The instruction identifies it only by the time it was scored, which meant
 * opening Product Scoring and reading down a list to find out what the complaint
 * was actually about. Showing it here is the difference between judging the food
 * and guessing at it.
 */
function TaskPhoto({ taskId, base, item }: { taskId: number; base: "store" | "admin"; item?: string }) {
  const [failed, setFailed] = useState(false);
  const [full, setFull] = useState(false);
  if (failed) return null;
  const q = item ? `?item=${encodeURIComponent(item)}` : "";
  const src = `/api/${base}/management/tasks/${taskId}/photo${q}`;
  const thumb = `${src}${q ? "&" : "?"}size=thumb`;
  return (
    <>
      <button
        type="button"
        onClick={() => setFull(true)}
        className="mt-3 block w-full overflow-hidden rounded-xl border border-white/10 bg-black/20"
        title="Tap to enlarge"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb}
          alt="Scored product"
          loading="lazy"
          onError={() => setFailed(true)}
          className="max-h-56 w-full object-contain"
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

/**
 * Where the feedback was given, on a recorded answer.
 *
 * "Feedback given" records that something was said, not where — and the whole
 * point of preferring Discord is that the rest of the team can read it. Without
 * this the back office has to open Discord and guess whether a message exists.
 */
function ChannelBadges({ answer }: { answer: ItemAnswer | null | undefined }) {
  const on: string[] = [];
  if (answer?.feedback_discord) on.push("Discord");
  if (answer?.feedback_kitchen) on.push("Kitchen");
  if (on.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {on.map(c => (
        <span
          key={c}
          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
            c === "Discord"
              ? "border-violet-400/50 bg-violet-500/20 text-violet-200"
              : "border-white/15 bg-white/10 text-zinc-300"
          }`}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

/** A recorded answer, read-only. */
function AnsweredBlock({ answer, compact }: { answer: ItemAnswer; compact?: boolean }) {
  return (
    <div className={`rounded-xl bg-emerald-900/20 border border-emerald-500/20 ${compact ? "p-2.5" : "p-3"} text-sm`}>
      {!compact && <div className={T_LABEL + " mb-1"}>Your Response</div>}
      <div className="font-medium text-emerald-300">
        {(answer.cause || "").replace(/_/g, " ")}
      </div>
      {answer.action && (
        <div className="text-xs text-emerald-400/80 mt-0.5">
          → {answer.action.replace(/_/g, " ")}
        </div>
      )}
      <ChannelBadges answer={answer} />
      {answer.note && <div className="text-xs text-zinc-400 mt-1.5">{answer.note}</div>}
    </div>
  );
}

/**
 * The cause / action / channel picker for one thing that needs answering.
 *
 * Its own component so a task covering several scored photos can hold several
 * independent answers — previously one set of chips stood for the whole day,
 * and a manager who picked "portion" was recorded as saying that about every
 * photo in the alert.
 */
function AnswerForm({
  options,
  actionOptions,
  responseLabel,
  actionLabel,
  onSubmit,
}: {
  options: ResponseOption[];
  actionOptions: ResponseOption[];
  responseLabel: string;
  actionLabel: string;
  onSubmit: (a: { cause: string; action: string | null; note: string; channels: string[] }) => Promise<void>;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [channels, setChannels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const pickedCause = options.find(o => o.key === selectedKey);
  const pickedAction = actionOptions.find(o => o.key === actionKey);
  const isFeedback = /feedback/i.test(actionKey || selectedKey || "");
  const isTraining = /training|retrain|coach/i.test(actionKey || selectedKey || "");
  const toggleChannel = (c: string) =>
    setChannels(prev => (prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]));

  const needsNote =
    !!pickedCause?.require_note || !!pickedAction?.require_note ||
    selectedKey === "other" || selectedKey === "cannot_confirm";
  const notePlaceholder =
    pickedCause?.note_placeholder || pickedAction?.note_placeholder || "Please explain briefly…";
  const canSubmit =
    !!selectedKey &&
    (actionOptions.length === 0 || !!actionKey) &&
    (!needsNote || !!note.trim()) &&
    (!isFeedback || channels.length > 0) &&
    (!isTraining || !!note.trim());

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      await onSubmit({ cause: selectedKey!, action: actionKey, note: note.trim(), channels });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <OptionGroup
        label={responseLabel}
        options={options}
        selected={selectedKey}
        onSelect={key => { setSelectedKey(key); setNote(""); }}
      />

      {actionOptions.length > 0 && selectedKey && (
        <div className="mt-4">
          <OptionGroup
            label={actionLabel}
            options={actionOptions}
            selected={actionKey}
            onSelect={setActionKey}
          />
        </div>
      )}

      {isFeedback && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Where did you give the feedback?
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: "discord", label: "Discord" },
              { key: "kitchen", label: "Kitchen" },
            ].map(c => (
              <button
                key={c.key}
                type="button"
                onClick={() => toggleChannel(c.key)}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                  channels.includes(c.key)
                    ? "border-violet-500/60 bg-violet-500/20 text-white"
                    : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isTraining && (
        <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          What did the training cover? (one line)
        </div>
      )}

      {(needsNote || isTraining) && (
        <textarea
          className="mt-3 w-full rounded-xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 resize-none"
          rows={2}
          placeholder={isTraining ? "e.g. Re-checked plating standard for salmon nigiri" : notePlaceholder}
          value={note}
          onChange={e => setNote(e.target.value)}
        />
      )}

      {selectedKey && (
        <button
          onClick={submit}
          disabled={busy || !canSubmit}
          className={PRIMARY_BUTTON + " mt-3 w-full flex items-center justify-center gap-2 disabled:opacity-40"}
        >
          {busy ? (
            <><RefreshCw className="h-4 w-4 animate-spin" /> Submitting…</>
          ) : (
            <><CheckCircle2 className="h-4 w-4" /> Confirm Response</>
          )}
        </button>
      )}
      {selectedKey && !canSubmit && !busy && (
        <div className="text-xs text-amber-400/80 mt-2 text-center">
          {actionOptions.length > 0 && !actionKey
            ? `Select ${actionLabel} to continue`
            : isFeedback && channels.length === 0
            ? "Say where the feedback was given to continue"
            : "Please add a short note to continue"}
        </div>
      )}
    </div>
  );
}

function TaskCard({ task, template, managerName, onRespond }: TaskCardProps) {
  const [submitted, setSubmitted] = useState(false);

  const options = getOptions(task, template);
  const actionOptions = template?.action_options ?? [];
  const shortfall = shortfallSummary(task.context);
  const isResponded = task.status === "responded" || task.status === "closed" || submitted;

  // A product-score alert covers every photo the branch scored that day. Three
  // C grades hours apart are three incidents, so each one is answered on its
  // own; one card, several answers. Everything else answers once.
  const items = scoredItems(task);
  const answers = task.context?.answers ?? {};
  const perItem = items.length > 1;
  const answeredCount = items.filter(it => answers[itemKey(it)]).length;

  const responseLabel = template?.response_label || "Select your response";
  const actionLabel = template?.action_label || "Action Taken";

  const sevColor =
    task.severity === "red"    ? "border-red-500/40 bg-red-950/20" :
    task.severity === "yellow" ? "border-amber-500/40 bg-amber-950/20" :
    "border-emerald-500/30 bg-emerald-950/15";

  const sevDot =
    task.severity === "red"    ? "bg-red-400" :
    task.severity === "yellow" ? "bg-amber-400" :
    "bg-emerald-400";

  async function submitFor(
    itemId: string | null,
    a: { cause: string; action: string | null; note: string; channels: string[] },
  ) {
    const isTraining = /training|retrain|coach/i.test(a.action || a.cause || "");
    await onRespond(
      task, a.cause, a.action, a.note, a.channels,
      isTraining ? a.note : "", itemId,
    );
    if (!itemId) setSubmitted(true);
  }

  return (
    <div className={`rounded-2xl border p-5 ${sevColor}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${sevDot}`} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-white text-sm">{fmtLabel(task.type)}</span>
              {/* Which store this is about. Without it an alert arriving on a
                  day you are not at any branch is unreadable — you cannot tell
                  whether it is yours, and neither can whoever picks it up next. */}
              {task.branch && (
                <span className="rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-zinc-200">
                  {task.branch}
                </span>
              )}
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">
              {fmtTime(task.sent_at || task.created_at)}
              {/* The day the exception is ABOUT, when that is not the day it
                  was forwarded. The owner is the rostered owner for the day it
                  arose, so a task raised Tuesday and sent Wednesday reaches
                  Tuesday's owner — who is not at that branch today and has no
                  way to tell why it is in their inbox. */}
              {(() => {
                const about = typeof task.context?.date === "string" ? task.context.date : "";
                const sentDay = (task.sent_at || task.created_at || "").slice(0, 10);
                return about && about !== sentDay
                  ? <> · <span className="text-amber-300">For {about}</span></>
                  : null;
              })()}
              {task.manager_name ? <> · Owner: <span className="text-zinc-300">{task.manager_name}</span></> : null}
            </div>
          </div>
        </div>
        {isResponded ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/25 rounded-full px-2.5 py-0.5">
            <CheckCircle2 className="h-3 w-3" /> Done
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-semibold text-amber-400 bg-amber-500/15 border border-amber-500/25 rounded-full px-2.5 py-0.5">
            <Clock className="h-3 w-3" /> Action Required
          </span>
        )}
      </div>

      {/* Instruction message */}
      {task.sent_message && (
        <div className="rounded-xl bg-white/5 border border-white/8 p-4 mb-4">
          <div className={T_LABEL + " mb-1.5"}>Instruction from Back Office</div>
          <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-line">
            {fillTemplate(task.sent_message, task.context)}
          </p>
          {shortfall && (
            <div className="mt-2 text-xs font-semibold text-amber-300 tabular-nums">
              {shortfall}
            </div>
          )}
        </div>
      )}

      {/* Response section */}
      {perItem ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className={T_LABEL}>Answer each photo</div>
            <span className="text-xs font-semibold tabular-nums text-zinc-400">
              {answeredCount} / {items.length} done
            </span>
          </div>

          {items.map((it, i) => {
            const key = itemKey(it) || String(i);
            const saved = answers[key];
            return (
              <div
                key={key}
                className={`rounded-xl border p-3 ${
                  saved ? "border-emerald-500/25 bg-emerald-950/10" : "border-white/10 bg-white/5"
                }`}
              >
                <div className="mb-2 flex items-center gap-2 text-xs">
                  <span className="font-semibold tabular-nums text-white">{it.scored_at || "—"}</span>
                  <span className="rounded px-1.5 py-0.5 font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/30">
                    {it.grade || "C"} {it.total_score ?? ""}
                  </span>
                  {it.posted_by && <span className="text-zinc-400 truncate">{it.posted_by}</span>}
                </div>

                <TaskPhoto taskId={task.id} base="store" item={itemKey(it)} />

                <div className="mt-3">
                  {saved ? (
                    <AnsweredBlock answer={saved} compact />
                  ) : (
                    <AnswerForm
                      options={options}
                      actionOptions={actionOptions}
                      responseLabel={responseLabel}
                      actionLabel={actionLabel}
                      onSubmit={a => submitFor(key, a)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : isResponded ? (
        <AnsweredBlock
          answer={{
            cause: task.response || "",
            action: task.response_action || "",
            note: task.response_note || "",
            // Recorded since the channel picker was added, but never shown —
            // the screen said "feedback given" and stopped there.
            feedback_discord: !!task.context?.handling?.feedback_discord,
            feedback_kitchen: !!task.context?.handling?.feedback_kitchen,
          }}
        />
      ) : (
        <div>
          {items.length === 1 && task.type === "product_score_c" && (
            <div className="mb-3">
              <TaskPhoto taskId={task.id} base="store" item={itemKey(items[0])} />
            </div>
          )}
          <AnswerForm
            options={options}
            actionOptions={actionOptions}
            responseLabel={responseLabel}
            actionLabel={actionLabel}
            onSubmit={a => submitFor(null, a)}
          />
        </div>
      )}

      <StoreTaskThread taskId={task.id} managerName={managerName} />
    </div>
  );
}

// ─── Branch options per city ──────────────────────────────────────────────────

const BRANCHES: Record<string, { value: string; label: string }[]> = {
  manila: [
    { value: "PAR",  label: "Paranaque" },
    { value: "CUB",  label: "Cubao" },
    { value: "TAFT", label: "Taft" },
  ],
  dubai: [
    { value: "BB",  label: "Business Bay" },
    { value: "JLT", label: "JLT" },
    { value: "ARJ", label: "Arjan" },
    { value: "AM",  label: "Al Mina" },
    { value: "AB",  label: "Al Barsha" },
  ],
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ManagerInboxPage() {
  const router = useRouter();
  const auth = getAuth();

  const [tasks, setTasks] = useState<ManagementTask[]>([]);
  const [templates, setTemplates] = useState<Record<string, ActionTemplate>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [showDone, setShowDone] = useState(false);

  // cityLock is the account's real constraint: '' means this person works across
  // cities. auth.city is only whatever was picked on the login screen, which
  // defaults to Dubai — so a Manila manager who left it alone saw nothing but
  // Dubai branches here, with no control on the page to correct it.
  const cityLock = (auth?.cityLock || "").toLowerCase();
  const canSwitchCity = cityLock === "";
  const [city, setCity] = useState<string>(
    cityLock || (auth?.city as string) || "manila",
  );
  const branchOptions = BRANCHES[city] || BRANCHES.manila;
  // Empty branch means "the tasks addressed to me". That is the default now:
  // this page used to open on a branch dropdown, so finding your own work meant
  // knowing to pick the right store, and 322 tasks reached nobody.
  const [branch, setBranch] = useState("");
  // Filter by the person a task is addressed to, so an area manager can read
  // one manager's whole load and the feedback they gave the kitchen.
  const [assignee, setAssignee] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  // What the store actually filed today. The inbox showed only the chases for
  // missing checks, so a manager who had submitted one had no way to see back
  // what they entered.
  const [rushChecks, setRushChecks] = useState<RushCheckRow[]>([]);
  const [rushSlots, setRushSlots] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState("");

  // Moving city must move the branch with it, or the page asks the API for a
  // Dubai branch while showing Manila.
  useEffect(() => {
    const opts = BRANCHES[city] || BRANCHES.manila;
    // "" is a valid selection — it means me — so only correct a branch that
    // belongs to the other city.
    if (branch && !opts.some(o => o.value === branch)) setBranch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  useEffect(() => {
    if (!auth) {
      router.replace("/login?next=%2Fstore%2Fmanagement%2Finbox");
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const headers = getAuthHeaders(getAuth());
      const res = await fetch("/api/admin/management/templates", { headers });
      if (!res.ok) return;
      const data = await res.json();
      const map: Record<string, ActionTemplate> = {};
      for (const t of data.templates || []) map[t.exception_type] = t;
      setTemplates(map);
    } catch { /* silently ignore */ }
  }, []);

  const loadRushChecks = useCallback(async () => {
    try {
      const headers = getAuthHeaders(getAuth());
      const p = new URLSearchParams({ city });
      if (branch) p.set("branch", branch);
      const res = await fetch(`/api/store/management/rush-checks?${p}`, { headers });
      if (!res.ok) return;
      const d = await res.json();
      setRushChecks((d.checks || []) as RushCheckRow[]);
      const m: Record<string, string> = {};
      for (const sl of d.slots || []) m[sl.key] = sl.label;
      setRushSlots(m);
    } catch {
      /* a read-only panel must not take the inbox down with it */
    }
  }, [city, branch]);

  const loadTasks = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const headers = getAuthHeaders(getAuth());
      const params = new URLSearchParams({ limit: "100" });
      if (city)   params.set("city", city);
      if (assignee) params.set("assignee", assignee);
      else if (branch) params.set("branch", branch);
      const res = await fetch(`/api/store/management/tasks?${params}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTasks(data.tasks || []);
      setViewer(String(data.viewer || ""));
      if (Array.isArray(data.assignees)) setAssignees(data.assignees);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [city, branch, assignee]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks, branch, assignee]);

  useEffect(() => { void loadRushChecks(); }, [loadRushChecks]);

  async function handleRespond(
    task: ManagementTask,
    response: string,
    action: string | null,
    note: string,
    channels?: string[],
    trainingNote?: string,
    itemId?: string | null,
  ) {
    const headers = getAuthHeaders(getAuth());
    const body: Record<string, unknown> = { response };
    if (action) body.response_action = action;
    if (note) body.response_note = note;
    if (channels && channels.length > 0) body.feedback_channels = channels;
    if (trainingNote) body.training_note = trainingNote;
    if (itemId) body.item_id = itemId;
    const res = await fetch(`/api/store/management/tasks/${task.id}/respond`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await loadTasks(true);
  }

  const pendingTasks   = tasks.filter(t => t.status === "sent");
  const completedTasks = tasks.filter(t => t.status === "responded" || t.status === "closed");

  const sortedPending = [...pendingTasks].sort((a, b) => {
    const ord = { red: 0, yellow: 1, green: 2 };
    const so = (ord[a.severity] ?? 9) - (ord[b.severity] ?? 9);
    if (so !== 0) return so;
    return new Date(b.sent_at || b.created_at).getTime() - new Date(a.sent_at || a.created_at).getTime();
  });

  const branchLabel = branch ? `${branch} — ` : "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0f1e] via-[#0d1526] to-[#0a0f1e] pb-24">
      <div className="mx-auto max-w-xl px-4 pt-6">

        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="h-5 w-5 text-violet-400" />
              <h1 className="text-2xl font-semibold text-white tracking-tight">Management Inbox</h1>
            </div>
            <p className="text-sm text-zinc-400">Instructions from Back Office</p>
          </div>
          <button
            onClick={() => loadTasks(true)}
            disabled={refreshing}
            className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/6 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* City + branch. The city control only appears for accounts that work
            across cities; a manager tied to one city still cannot wander. */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          {canSwitchCity && (
            <>
              <span className={T_LABEL}>City</span>
              <SelectDark
                value={city}
                onChange={v => setCity(v)}
                options={[
                  { value: "manila", label: "Manila" },
                  { value: "dubai", label: "Dubai" },
                ]}
                className="w-32 text-sm"
              />
            </>
          )}
          <span className={T_LABEL}>Showing</span>
          <SelectDark
            value={branch}
            onChange={v => setBranch(v)}
            options={[
              { value: "", label: viewer ? `Assigned to me (${viewer})` : "Assigned to me" },
              ...branchOptions,
            ]}
            className="w-56 text-sm"
          />
          <span className={T_LABEL}>Owner</span>
          <SelectDark
            value={assignee}
            onChange={v => setAssignee(v)}
            aria-label="Filter by the person a task is addressed to"
            options={[
              { value: "", label: "Anyone" },
              ...assignees.map(n => ({ value: n, label: n })),
            ]}
            className="w-52 text-sm"
          />
          {assignee ? (
            <span className={T_CAPTION}>
              Everything addressed to {assignee}, across every branch.
            </span>
          ) : !branch ? (
            <span className={T_CAPTION}>
              Only what is addressed to you. Pick a branch, or a person, to look wider.
            </span>
          ) : null}
          {!canSwitchCity && (
            <span className={T_CAPTION}>
              {city === "dubai" ? "Dubai" : "Manila"} — your account is set to this city
            </span>
          )}
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className={KPI_CARD}>
            <div className={KPI_LABEL}>Pending Action</div>
            <div className={KPI_VALUE + " text-amber-400"}>{pendingTasks.length}</div>
          </div>
          <div className={KPI_CARD}>
            <div className={KPI_LABEL}>Completed Today</div>
            <div className={KPI_VALUE + " text-emerald-400"}>{completedTasks.length}</div>
          </div>
        </div>

        {/* What the store filed today. The inbox only ever showed the chases
            for checks that were MISSING, so a manager who had done the check
            could not see back what they entered. */}
        {rushChecks.length > 0 && (
          <div className={GLASS_CARD + " mb-5 p-4"}>
            <div className="flex items-center gap-2 mb-3">
              <span className={T_LABEL}>Rush Hour Checks filed today</span>
              <span className={T_CAPTION}>{rushChecks.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left">
                    <th className={T_CAPTION + " pb-1.5 pr-3 font-medium"}>Slot</th>
                    <th className={T_CAPTION + " pb-1.5 pr-3 font-medium"}>Branch</th>
                    <th className={T_CAPTION + " pb-1.5 pr-3 font-medium text-right"}>Tickets</th>
                    <th className={T_CAPTION + " pb-1.5 pr-3 font-medium"}>Oldest order</th>
                    <th className={T_CAPTION + " pb-1.5 pr-3 font-medium"}>Issues</th>
                    <th className={T_CAPTION + " pb-1.5 font-medium"}>By</th>
                  </tr>
                </thead>
                <tbody>
                  {rushChecks.map((rc, i) => {
                    const bad = [
                      rc.queue_ok === false && "Queue",
                      rc.prep_ok === false && "Prep",
                      rc.staffing_ok === false && "Staffing",
                      rc.cleanliness_ok === false && "Cleanliness",
                      rc.travel_path_ok === false && "Travel path",
                    ].filter(Boolean) as string[];
                    return (
                      <tr key={`${rc.branch}-${rc.slot}-${i}`} className="border-t border-white/5">
                        <td className="py-1.5 pr-3 text-zinc-200">{rushSlots[rc.slot] || rc.slot}</td>
                        <td className="py-1.5 pr-3 text-zinc-400">{rc.branch}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-200">
                          {rc.ticket_count ?? "—"}
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums text-zinc-300">
                          {rc.oldest_order || "—"}
                        </td>
                        <td className="py-1.5 pr-3">
                          {bad.length === 0
                            ? <span className="text-emerald-400">All OK</span>
                            : <span className="text-amber-300">{bad.join(", ")}</span>}
                          {rc.note ? <span className="text-zinc-500"> · {rc.note}</span> : null}
                          {rc.travel_path_note
                            ? <span className="text-zinc-500"> · {rc.travel_path_note}</span> : null}
                        </td>
                        <td className="py-1.5 text-zinc-400">{rc.submitted_by}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Loading / Error */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-500">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-400 p-4 rounded-xl border border-red-500/30 bg-red-950/20">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        ) : (
          <>
            {/* Pending tasks */}
            {sortedPending.length === 0 ? (
              <div className={GLASS_CARD + " py-14 text-center"}>
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500/60" />
                <div className="text-sm font-medium text-zinc-300">All clear!</div>
                <div className="text-xs text-zinc-500 mt-1">No pending instructions from Back Office.</div>
              </div>
            ) : (
              <div className="space-y-4">
                {sortedPending.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    template={templates[task.type] || null}
                    managerName={auth?.staffName || "Manager"}
                    onRespond={handleRespond}
                  />
                ))}
              </div>
            )}

            {/* Completed section */}
            {completedTasks.length > 0 && (
              <div className="mt-6">
                <button
                  onClick={() => setShowDone(v => !v)}
                  className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-3"
                >
                  {showDone ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  Completed ({completedTasks.length})
                </button>
                {showDone && (
                  <div className="space-y-3 opacity-60">
                    {completedTasks.map(task => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        template={templates[task.type] || null}
                        managerName={auth?.staffName || "Manager"}
                        onRespond={handleRespond}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
