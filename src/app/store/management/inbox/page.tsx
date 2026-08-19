"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  MessageSquare,
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

// ─── Types ───────────────────────────────────────────────────────────────────

type Severity = "red" | "yellow" | "green";
type TaskStatus = "open" | "sent" | "responded" | "closed" | "escalated";

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
  response_note: string | null;
  created_at: string;
  sent_at: string | null;
  responded_at: string | null;
}

interface ResponseOption {
  key: string;
  label_en: string;
  type: "done" | "cannot" | "neutral";
}

interface ActionTemplate {
  exception_type: string;
  title_en: string;
  message_en: string;
  response_options: ResponseOption[];
}

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

// ─── Task Card ────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: ManagementTask;
  template: ActionTemplate | null;
  onRespond: (task: ManagementTask, response: string, note: string) => Promise<void>;
}

function TaskCard({ task, template, onRespond }: TaskCardProps) {
  const [responding, setResponding] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const options = getOptions(task, template);
  const isResponded = task.status === "responded" || task.status === "closed" || submitted;

  const sevColor =
    task.severity === "red"    ? "border-red-500/40 bg-red-950/20" :
    task.severity === "yellow" ? "border-amber-500/40 bg-amber-950/20" :
    "border-emerald-500/30 bg-emerald-950/15";

  const sevDot =
    task.severity === "red"    ? "bg-red-400" :
    task.severity === "yellow" ? "bg-amber-400" :
    "bg-emerald-400";

  async function handleSubmit() {
    if (!selectedKey || responding) return;
    const needsNote = selectedKey === "other" || selectedKey === "cannot_confirm";
    if (needsNote && !note.trim()) return;

    setResponding(true);
    try {
      await onRespond(task, selectedKey, note.trim());
      setSubmitted(true);
    } finally {
      setResponding(false);
    }
  }

  return (
    <div className={`rounded-2xl border p-5 ${sevColor}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${sevDot}`} />
          <div>
            <div className="font-semibold text-white text-sm">{fmtLabel(task.type)}</div>
            <div className="text-xs text-zinc-400 mt-0.5">{fmtTime(task.sent_at || task.created_at)}</div>
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
          <p className="text-sm text-zinc-200 leading-relaxed">{task.sent_message}</p>
        </div>
      )}

      {/* Response section */}
      {isResponded ? (
        <div className="rounded-xl bg-emerald-900/20 border border-emerald-500/20 p-3 text-sm">
          <div className={T_LABEL + " mb-1"}>Your Response</div>
          <div className="font-medium text-emerald-300">
            {(task.response || selectedKey || "").replace(/_/g, " ")}
          </div>
          {(task.response_note || note) && (
            <div className="text-xs text-zinc-400 mt-1">{task.response_note || note}</div>
          )}
        </div>
      ) : (
        <div>
          <div className={T_LABEL + " mb-3"}>Select your response:</div>
          <div className="flex flex-wrap gap-2">
            {options.map(opt => {
              const isSelected = selectedKey === opt.key;
              const baseColor =
                opt.type === "done"
                  ? isSelected ? "bg-emerald-500 text-white border-emerald-500" : "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15"
                  : opt.type === "cannot"
                  ? isSelected ? "bg-amber-500 text-white border-amber-500" : "border-amber-500/40 text-amber-300 hover:bg-amber-500/15"
                  : isSelected ? "bg-white/20 text-white border-white/30" : "border-white/20 text-zinc-300 hover:bg-white/10";
              return (
                <button
                  key={opt.key}
                  onClick={() => { setSelectedKey(opt.key); if (opt.key !== "other") setNote(""); }}
                  className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${baseColor}`}
                >
                  {opt.label_en}
                </button>
              );
            })}
          </div>

          {/* Note input for "Other" */}
          {(selectedKey === "other" || selectedKey === "cannot_confirm") && (
            <textarea
              className="mt-3 w-full rounded-xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 resize-none"
              rows={2}
              placeholder="Please explain briefly…"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          )}

          {selectedKey && (
            <button
              onClick={handleSubmit}
              disabled={responding || ((selectedKey === "other" || selectedKey === "cannot_confirm") && !note.trim())}
              className={PRIMARY_BUTTON + " mt-3 w-full flex items-center justify-center gap-2"}
            >
              {responding ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /> Submitting…</>
              ) : (
                <><CheckCircle2 className="h-4 w-4" /> Confirm Response</>
              )}
            </button>
          )}
        </div>
      )}
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

  const city = auth?.city || "manila";
  const branchOptions = BRANCHES[city] || BRANCHES.manila;
  const [branch, setBranch] = useState(branchOptions[0].value);

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

  const loadTasks = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const headers = getAuthHeaders(getAuth());
      const params = new URLSearchParams({ limit: "100" });
      if (city)   params.set("city", city);
      if (branch) params.set("branch", branch);
      const res = await fetch(`/api/store/management/tasks?${params}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [city, branch]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks, branch]);

  async function handleRespond(task: ManagementTask, response: string, note: string) {
    const headers = getAuthHeaders(getAuth());
    const body: Record<string, string> = { response };
    if (note) body.response_note = note;
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

        {/* Branch selector */}
        <div className="mb-5 flex items-center gap-3">
          <span className={T_LABEL}>Branch</span>
          <SelectDark
            value={branch}
            onChange={v => setBranch(v)}
            options={branchOptions}
            className="w-40 text-sm"
          />
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
