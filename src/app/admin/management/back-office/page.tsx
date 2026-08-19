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
  TABLE_HEADER,
} from "@/lib/ui-tokens";
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
  response_note: string | null;
  missed_by_manager: boolean;
  created_at: string;
  sent_at: string | null;
  responded_at: string | null;
  closed_at: string | null;
  escalated_at: string | null;
}

interface ActionTemplate {
  exception_type: string;
  severity: Severity;
  title_en: string;
  title_ja: string;
  message_en: string;
  message_ja: string;
  response_options: ResponseOption[];
}

interface ResponseOption {
  key: string;
  label_en: string;
  type: "done" | "cannot" | "neutral";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EXCEPTION_LABELS: Record<string, string> = {
  pm_backup_missing:    "PM Backup Report Missing",
  am_backup_missing:    "AM Backup Report Missing",
  backup_below_50:      "Backup Below 50%",
  backup_below_70:      "Backup Below 70%",
  disposal_missing:     "Disposal Report Missing",
  complaint_no_photo:   "Complaint — No Photo",
  attendance_unverified: "Attendance Unverified",
  product_score_c:      "Product Score C",
  product_score_d:      "Product Score D/F",
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

function SendModal({ task, template, customMessage, onChangeMessage, onConfirm, onClose, sending }: SendModalProps) {
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

        {template ? (
          <div className="mb-4">
            <div className={T_LABEL + " mb-2"}>Pre-written instruction (from template)</div>
            <div className="rounded-lg border border-violet-500/20 bg-violet-950/20 p-3 text-sm text-zinc-200 leading-relaxed italic">
              {template.message_en}
            </div>
            {template.response_options.length > 0 && (
              <div className="mt-2">
                <div className={T_LABEL + " mb-1.5"}>Manager will respond with:</div>
                <div className="flex flex-wrap gap-1.5">
                  {template.response_options.map(opt => (
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
            disabled={sending || (!template && !customMessage.trim())}
            className={PRIMARY_BUTTON + " flex-1 flex items-center justify-center gap-2"}
          >
            <Send className="h-4 w-4" />
            {sending ? "Sending…" : "Send Instruction"}
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

// ─── Task Row ─────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: ManagementTask;
  template: ActionTemplate | null;
  onSend: (task: ManagementTask) => void;
  expanded: boolean;
  onToggle: () => void;
}

function TaskRow({ task, template, onSend, expanded, onToggle }: TaskRowProps) {
  return (
    <div className={TABLE_ROW + " border-white/8"}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <SevBadge sev={task.severity} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white truncate">{fmtLabel(task.type)}</span>
            <span className="text-xs text-zinc-500">{task.branch}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className={T_CAPTION}>
              Manager: <span className="text-zinc-300">{task.manager_name || "Unknown"}</span>
            </span>
            <span className={T_CAPTION}>{fmtTime(task.created_at)}</span>
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
                {task.sent_message}
              </div>
              {task.sent_at && (
                <div className={T_CAPTION + " mt-1"}>Sent: {fmtTime(task.sent_at)}</div>
              )}
            </div>
          )}
          {task.response && (
            <div>
              <div className={T_LABEL + " mb-1"}>Manager Response</div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-2.5 py-0.5">
                  {task.response.replace(/_/g, " ")}
                </span>
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
  const [detecting, setDetecting] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("open");
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
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // KPI counts
  const openCount      = tasks.filter(t => t.status === "open").length;
  const sentCount      = tasks.filter(t => t.status === "sent").length;
  const respondedCount = tasks.filter(t => t.status === "responded").length;
  const closedCount    = tasks.filter(t => t.status === "closed").length;

  // Filter by status client-side (tasks are always fetched for all statuses for accurate KPI counts)
  const filteredTasks = statusFilter && statusFilter !== "all"
    ? tasks.filter(t => t.status === statusFilter)
    : tasks;

  // Sorted: red first, then by created_at desc
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const sevOrd = { red: 0, yellow: 1, green: 2 };
    const so = (sevOrd[a.severity] ?? 9) - (sevOrd[b.severity] ?? 9);
    if (so !== 0) return so;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

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
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch("/api/admin/management/detect", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ city: cityFilter, date: today }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.created > 0) {
        await loadTasks(true);
      }
      alert(`Detection complete. ${data.created} new task${data.created !== 1 ? "s" : ""} created.`);
    } catch {
      alert("Detection failed. Please try again.");
    } finally {
      setDetecting(false);
    }
  }

  function openSendModal(task: ManagementTask) {
    setSendingTask(task);
    setCustomMessage(templates[task.type]?.message_en || "");
  }

  async function handleSend() {
    if (!sendingTask) return;
    setSending(true);
    try {
      const template = templates[sendingTask.type];
      const message = template ? template.message_en : customMessage.trim();
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSendingTask(null);
      setCustomMessage("");
      await loadTasks(true);
    } catch (e) {
      alert("Failed to send instruction. Please try again.");
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
