"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, ChevronRight, RefreshCw, Star, Calendar, ClipboardList } from "lucide-react";
import { getAuth, refreshAuthFromApi, getAuthHeaders, clearAuth, hasRouteAccess } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
  TAB_CONTAINER,
  TAB_ACTIVE,
  TAB_INACTIVE,
  T_PAGE_TITLE,
  T_SECTION,
  T_CARD_TITLE,
  T_LABEL,
  T_BODY,
  T_CAPTION,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_ACCENT,
  TABLE_ROW,
  TABLE_HEADER,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

// ─── Types ───────────────────────────────────────────────────────────────────

type KanbanStatus =
  | "new"
  | "screened"
  | "scheduled"
  | "interviewed"
  | "offer_sent"
  | "hired"
  | "rejected";

type Applicant = {
  id: string;
  city: string;
  requisition_id: string | null;
  full_name: string;
  position_applied: string;
  phone: string;
  email: string;
  source: string;
  referrer_name: string;
  status: KanbanStatus;
  rejection_reason: string;
  notes: string;
  applied_date: string;
  days_in_pipeline: number;
  assigned_branch?: string;
  latest_score?: number;
  latest_recommendation?: string;
  latest_outcome_reason?: string;
};

/** The two points where a decision is actually made. Past these, moving someone
 *  on without saying why is what left 55 candidates undecided for up to 49 days. */
function needsOutcome(status: KanbanStatus) {
  return status === "scheduled" || status === "interviewed";
}

type Requisition = {
  id: string;
  city: string;
  branch: string;
  position: string;
  reason: string;
  resigned_staff_name: string;
  target_start_date: string;
  priority: string;
  status: string;
  requested_by: string;
  notes: string;
  created_at: string;
  openings?: number;
  candidate_count?: number;
  filled_count?: number;
  offer_count?: number;
  interviewed_count?: number;
  remaining?: number;
  days_to_target?: number | null;
};

type InterviewSchedule = {
  id: string;
  applicant_id: string;
  interview_date: string;
  interview_time: string;
  location: string;
  interviewer: string;
  interview_type: string;
  status: string;
  notes: string;
};

type Evaluation = {
  id: string;
  applicant_id: string;
  schedule_id: string | null;
  interviewer: string;
  score_communication: number;
  score_experience: number;
  score_attitude: number;
  score_availability: number;
  total_score: number;
  recommendation: string;
  strengths: string;
  areas_for_improvement: string;
  notes: string;
  created_at: string;
};

// ─── Kanban columns ──────────────────────────────────────────────────────────

const KANBAN_COLUMNS: { id: KanbanStatus; label: string; color: string }[] = [
  { id: "new",         label: "New",               color: "border-neutral-600" },
  { id: "screened",    label: "Screened",           color: "border-blue-600" },
  { id: "scheduled",   label: "Interview Sched.",   color: "border-amber-600" },
  { id: "interviewed", label: "Interviewed",        color: "border-violet-600" },
  { id: "offer_sent",  label: "Offer Sent",         color: "border-emerald-600" },
  { id: "hired",       label: "Hired ✓",       color: "border-green-500" },
  { id: "rejected",    label: "Rejected",           color: "border-red-800" },
];

const ALL_STATUSES: KanbanStatus[] = KANBAN_COLUMNS.map((c) => c.id);

// ─── Source badge helper ─────────────────────────────────────────────────────

function sourceBadge(source: string) {
  const s = (source || "").toLowerCase();
  if (s === "referral")
    return (
      <span className={BADGE_SUCCESS} style={{ fontSize: "10px", padding: "1px 6px" }}>
        Referral
      </span>
    );
  if (s === "jobstreet")
    return (
      <span className={BADGE_INFO} style={{ fontSize: "10px", padding: "1px 6px" }}>
        JobStreet
      </span>
    );
  if (s === "facebook")
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 border border-indigo-500/25 px-1.5 py-0.5 text-indigo-400"
        style={{ fontSize: "10px" }}
      >
        Facebook
      </span>
    );
  if (s === "walk_in")
    return (
      <span className={BADGE_WARNING} style={{ fontSize: "10px", padding: "1px 6px" }}>
        Walk-in
      </span>
    );
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-zinc-500/15 border border-zinc-500/25 px-1.5 py-0.5 text-zinc-400"
      style={{ fontSize: "10px" }}
    >
      {source || "Other"}
    </span>
  );
}

// ─── Score display helper ─────────────────────────────────────────────────────

function scoreDisplay(score?: number) {
  if (score === undefined || score === null) return null;
  const filled = Math.round((score / 20) * 5);
  const color =
    score >= 16 ? "text-emerald-400" : score >= 12 ? "text-amber-400" : "text-red-400";
  return (
    <span className={`flex items-center gap-0.5 text-xs ${color}`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className="h-3 w-3"
          fill={i < filled ? "currentColor" : "none"}
          stroke="currentColor"
        />
      ))}
      <span className="ml-1 tabular-nums">{score}/20</span>
    </span>
  );
}

// ─── Days badge helper ───────────────────────────────────────────────────────

function daysBadge(days: number) {
  const cls =
    days > 30
      ? "text-red-400"
      : days > 14
      ? "text-amber-400"
      : "text-zinc-500";
  return <span className={`text-xs ${cls}`}>{days}d</span>;
}

// ─── Kanban Card ─────────────────────────────────────────────────────────────

function KanbanCard({
  applicant,
  onSelect,
  onQuickStatus,
  onRecordOutcome,
  nextStatus,
}: {
  applicant: Applicant;
  onSelect: () => void;
  onQuickStatus: (id: string, status: KanbanStatus) => void;
  onRecordOutcome: (a: Applicant) => void;
  nextStatus: KanbanStatus | null;
}) {
  return (
    <div
      className={`${GLASS_CARD} p-3 cursor-pointer hover:border-violet-500/30 transition-all duration-150`}
      onClick={onSelect}
    >
      {/* Position badge */}
      <div className="mb-1.5">
        <span
          className={BADGE_ACCENT}
          style={{ fontSize: "10px", padding: "1px 6px" }}
        >
          {applicant.position_applied || "Position N/A"}
        </span>
      </div>

      {/* Name */}
      <p className="font-semibold text-sm text-white truncate">{applicant.full_name}</p>

      {/* Source + days */}
      <div className="mt-1 flex items-center justify-between gap-1">
        {sourceBadge(applicant.source)}
        {daysBadge(applicant.days_in_pipeline)}
      </div>

      {/* Assigned branch (shown when set) */}
      {applicant.assigned_branch && (
        <p className="mt-1 text-[10px] text-emerald-400 font-medium truncate">
          📍 {applicant.assigned_branch}
        </p>
      )}

      {/* Score */}
      {applicant.latest_score !== undefined && applicant.latest_score !== null && (
        <div className="mt-1.5">{scoreDisplay(applicant.latest_score)}</div>
      )}

      {/* Decision point: say what happened rather than just moving the card */}
      {needsOutcome(applicant.status) ? (
        <div className="mt-2">
          <button
            className={`${SMALL_BUTTON} w-full text-center justify-center flex items-center gap-1`}
            onClick={(e) => {
              e.stopPropagation();
              onRecordOutcome(applicant);
            }}
          >
            <ClipboardList className="h-3 w-3" />
            {applicant.status === "scheduled" ? "Record outcome" : "Decide"}
          </button>
        </div>
      ) : (
        nextStatus && (
          <div className="mt-2">
            <button
              className={`${SMALL_BUTTON} w-full text-center justify-center flex items-center gap-1`}
              onClick={(e) => {
                e.stopPropagation();
                onQuickStatus(applicant.id, nextStatus);
              }}
            >
              <ChevronRight className="h-3 w-3" />
              {KANBAN_COLUMNS.find((c) => c.id === nextStatus)?.label}
            </button>
          </div>
        )
      )}
    </div>
  );
}

// ─── Interview Schedule Form ──────────────────────────────────────────────────

function InterviewForm({
  onSave,
  onCancel,
  saving,
}: {
  onSave: (data: Omit<InterviewSchedule, "id" | "applicant_id">) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    interview_date: "",
    interview_time: "",
    location: "",
    interviewer: "",
    interview_type: "initial",
    status: "scheduled",
    notes: "",
  });
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className={`${GLASS_CARD} p-4 space-y-3`}>
      <p className={T_SECTION}>Schedule Interview</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={T_LABEL}>Date</label>
          <input
            type="date"
            className={`${INPUT_CLASS} mt-1`}
            value={form.interview_date}
            onChange={(e) => set("interview_date", e.target.value)}
          />
        </div>
        <div>
          <label className={T_LABEL}>Time</label>
          <input
            type="text"
            placeholder="14:00"
            className={`${INPUT_CLASS} mt-1`}
            value={form.interview_time}
            onChange={(e) => set("interview_time", e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className={T_LABEL}>Location</label>
        <input
          type="text"
          placeholder="e.g. Head Office — Room 2"
          className={`${INPUT_CLASS} mt-1`}
          value={form.location}
          onChange={(e) => set("location", e.target.value)}
        />
      </div>
      <div>
        <label className={T_LABEL}>Interviewer</label>
        <input
          type="text"
          className={`${INPUT_CLASS} mt-1`}
          value={form.interviewer}
          onChange={(e) => set("interviewer", e.target.value)}
        />
      </div>
      <div>
        <label className={T_LABEL}>Interview Type</label>
        <SelectDark
          className={`${SELECT_CLASS} mt-1`}
          value={form.interview_type}
          onChange={v => set("interview_type", v)}
          options={[
            { value: "initial", label: "Initial" },
            { value: "final", label: "Final" },
            { value: "practical", label: "Practical" },
          ]}
        />
      </div>
      <div>
        <label className={T_LABEL}>Notes</label>
        <textarea
          className={`${TEXTAREA_CLASS} mt-1`}
          rows={2}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          className={PRIMARY_BUTTON}
          disabled={saving}
          onClick={() => onSave(form)}
        >
          {saving ? "Saving..." : "Save Schedule"}
        </button>
        <button className={SECONDARY_BUTTON} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Evaluation Form ─────────────────────────────────────────────────────────

function EvaluationForm({
  onSave,
  onCancel,
  saving,
}: {
  onSave: (data: Partial<Evaluation>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    interviewer: "",
    score_communication: 3,
    score_experience: 3,
    score_attitude: 3,
    score_availability: 3,
    recommendation: "consider",
    strengths: "",
    areas_for_improvement: "",
    notes: "",
  });
  const set = (k: string, v: string | number) => setForm((p) => ({ ...p, [k]: v }));
  const total =
    form.score_communication +
    form.score_experience +
    form.score_attitude +
    form.score_availability;

  const scoreColor =
    total >= 16 ? "text-emerald-400" : total >= 12 ? "text-amber-400" : "text-red-400";

  return (
    <div className={`${GLASS_CARD} p-4 space-y-3`}>
      <p className={T_SECTION}>Add Evaluation</p>
      <div>
        <label className={T_LABEL}>Interviewer</label>
        <input
          type="text"
          className={`${INPUT_CLASS} mt-1`}
          value={form.interviewer}
          onChange={(e) => set("interviewer", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ["score_communication", "Communication"],
            ["score_experience", "Experience"],
            ["score_attitude", "Attitude"],
            ["score_availability", "Availability"],
          ] as [string, string][]
        ).map(([key, label]) => (
          <div key={key}>
            <label className={T_LABEL}>{label}</label>
            <SelectDark
              className={`${SELECT_CLASS} mt-1`}
              value={String(form[key as keyof typeof form])}
              onChange={v => set(key, Number(v))}
              options={[1, 2, 3, 4, 5].map(n => ({ value: String(n), label: String(n) }))}
            />
          </div>
        ))}
      </div>

      <div
        className={`rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-center font-bold text-lg ${scoreColor}`}
      >
        Total: {total} / 20
      </div>

      <div>
        <label className={T_LABEL}>Recommendation</label>
        <SelectDark
          className={`${SELECT_CLASS} mt-1`}
          value={form.recommendation}
          onChange={v => set("recommendation", v)}
          options={[
            { value: "hire", label: "Hire" },
            { value: "consider", label: "Consider" },
            { value: "reject", label: "Reject" },
          ]}
        />
      </div>
      <div>
        <label className={T_LABEL}>Strengths</label>
        <textarea
          className={`${TEXTAREA_CLASS} mt-1`}
          rows={2}
          value={form.strengths}
          onChange={(e) => set("strengths", e.target.value)}
        />
      </div>
      <div>
        <label className={T_LABEL}>Areas for Improvement</label>
        <textarea
          className={`${TEXTAREA_CLASS} mt-1`}
          rows={2}
          value={form.areas_for_improvement}
          onChange={(e) => set("areas_for_improvement", e.target.value)}
        />
      </div>
      <div>
        <label className={T_LABEL}>Notes</label>
        <textarea
          className={`${TEXTAREA_CLASS} mt-1`}
          rows={2}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          className={PRIMARY_BUTTON}
          disabled={saving}
          onClick={() =>
            onSave({
              ...form,
              total_score: total,
            })
          }
        >
          {saving ? "Saving..." : "Save Evaluation"}
        </button>
        <button className={SECONDARY_BUTTON} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  applicant,
  onClose,
  onStatusChange,
  onRecordOutcome,
}: {
  applicant: Applicant;
  onClose: () => void;
  onStatusChange: (id: string, status: KanbanStatus) => void;
  onRecordOutcome: (a: Applicant) => void;
}) {
  const [tab, setTab] = useState<"info" | "interview" | "evaluation">("info");
  const [interviews, setInterviews] = useState<InterviewSchedule[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loadingInterviews, setLoadingInterviews] = useState(false);
  const [loadingEvaluations, setLoadingEvaluations] = useState(false);
  const [showInterviewForm, setShowInterviewForm] = useState(false);
  const [showEvalForm, setShowEvalForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localStatus, setLocalStatus] = useState<KanbanStatus>(applicant.status);
  const [statusChanging, setStatusChanging] = useState(false);
  const [error, setError] = useState("");
  const [assignedBranch, setAssignedBranch] = useState(applicant.assigned_branch || "");
  const [savingBranch, setSavingBranch] = useState(false);

  const handleSaveBranch = async () => {
    setSavingBranch(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/applicants/${applicant.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_branch: assignedBranch }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingBranch(false);
    }
  };

  const loadInterviews = useCallback(async () => {
    setLoadingInterviews(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/hr/applicants/${applicant.id}/interviews`,
        { headers: getAuthHeaders(), cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setInterviews(Array.isArray(data) ? data : data?.interviews || []);
    } catch {
      setInterviews([]);
    } finally {
      setLoadingInterviews(false);
    }
  }, [applicant.id]);

  const loadEvaluations = useCallback(async () => {
    setLoadingEvaluations(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/hr/applicants/${applicant.id}/evaluations`,
        { headers: getAuthHeaders(), cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvaluations(Array.isArray(data) ? data : data?.evaluations || []);
    } catch {
      setEvaluations([]);
    } finally {
      setLoadingEvaluations(false);
    }
  }, [applicant.id]);

  useEffect(() => {
    if (tab === "interview") void loadInterviews();
    if (tab === "evaluation") void loadEvaluations();
  }, [tab, loadInterviews, loadEvaluations]);

  const handleStatusChange = async (newStatus: KanbanStatus) => {
    setStatusChanging(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/applicants/${applicant.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLocalStatus(newStatus);
      onStatusChange(applicant.id, newStatus);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatusChanging(false);
    }
  };

  const handleSaveInterview = async (data: Omit<InterviewSchedule, "id" | "applicant_id">) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/interviews`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ applicant_id: applicant.id, ...data }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowInterviewForm(false);
      void loadInterviews();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEvaluation = async (data: Partial<Evaluation>) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/evaluations`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ applicant_id: applicant.id, ...data }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowEvalForm(false);
      void loadEvaluations();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
        <div className="min-w-0">
          <p className={T_SECTION + " truncate"}>{applicant.full_name}</p>
          <p className={`${T_BODY} truncate`}>{applicant.position_applied}</p>
        </div>
        <button
          className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className={`${TAB_CONTAINER} mt-3 shrink-0`}>
        {(["info", "interview", "evaluation"] as const).map((t) => (
          <button
            key={t}
            className={tab === t ? TAB_ACTIVE : TAB_INACTIVE}
            onClick={() => setTab(t)}
          >
            {t === "info" ? "Info" : t === "interview" ? "Interview" : "Evaluation"}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <p className="mt-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto mt-3 space-y-4 pr-1">
        {/* ── Info Tab ── */}
        {tab === "info" && (
          <div className="space-y-3">
            <div className={`${GLASS_CARD} p-4 space-y-2`}>
              {[
                ["Phone", applicant.phone],
                ["Email", applicant.email],
                ["Source", applicant.source],
                ...(applicant.referrer_name ? [["Referrer", applicant.referrer_name]] : []),
                ["Applied", applicant.applied_date],
                ["Days in pipeline", String(applicant.days_in_pipeline)],
                ...(assignedBranch ? [["Assigned Branch", assignedBranch]] : []),
              ].map(([label, val]) => (
                <div key={label} className="flex gap-2 text-sm">
                  <span className="text-zinc-500 shrink-0 w-28">{label}</span>
                  <span className="text-zinc-200 break-all">{val || "—"}</span>
                </div>
              ))}
            </div>

            {applicant.notes && (
              <div className={`${GLASS_CARD} p-4`}>
                <p className={T_LABEL}>Notes</p>
                <p className={`${T_BODY} mt-1`}>{applicant.notes}</p>
              </div>
            )}

            <div className={`${GLASS_CARD} p-4 space-y-3`}>
              {/* Status */}
              <div>
                <p className={T_LABEL}>Status</p>
                {needsOutcome(localStatus) && (
                  <button
                    className={`${PRIMARY_BUTTON} mt-2 flex w-full items-center justify-center gap-2`}
                    onClick={() => onRecordOutcome(applicant)}
                  >
                    <ClipboardList className="h-4 w-4" />
                    Record interview outcome
                  </button>
                )}
                <SelectDark
                  className={`${SELECT_CLASS} mt-2`}
                  value={localStatus}
                  onChange={v => void handleStatusChange(v as KanbanStatus)}
                  options={ALL_STATUSES.map(s => ({ value: s, label: KANBAN_COLUMNS.find(c => c.id === s)?.label || s }))}
                />
                {needsOutcome(localStatus) && (
                  <p className={`${T_CAPTION} mt-1`}>
                    Moving them with this dropdown records no reason. Use the button
                    above so the decision can be explained later.
                  </p>
                )}
                {statusChanging && (
                  <p className={`${T_CAPTION} mt-1`}>Updating...</p>
                )}
              </div>

              {/* Assigned Branch */}
              <div className="border-t border-white/10 pt-3">
                <p className={T_LABEL}>Assigned Branch <span className="text-zinc-500 font-normal">配属先</span></p>
                <div className="flex gap-2 mt-2">
                  <input
                    list="branch-options"
                    type="text"
                    className={`${INPUT_CLASS} flex-1`}
                    placeholder="e.g. CK, Taft, Paranaque..."
                    value={assignedBranch}
                    onChange={(e) => setAssignedBranch(e.target.value)}
                  />
                  <datalist id="branch-options">
                    <option value="Central Kitchen (CK)" />
                    <option value="Taft" />
                    <option value="Paranaque" />
                    <option value="Cubao" />
                    <option value="Al Barsha" />
                    <option value="Business Bay" />
                    <option value="Al Mina" />
                    <option value="M City" />
                  </datalist>
                  <button
                    className={`${PRIMARY_BUTTON} shrink-0`}
                    disabled={savingBranch}
                    onClick={() => void handleSaveBranch()}
                  >
                    {savingBranch ? "..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Interview Tab ── */}
        {tab === "interview" && (
          <div className="space-y-3">
            {!showInterviewForm && (
              <button
                className={`${PRIMARY_BUTTON} flex items-center gap-2`}
                onClick={() => setShowInterviewForm(true)}
              >
                <Plus className="h-4 w-4" />
                Schedule Interview
              </button>
            )}
            {showInterviewForm && (
              <InterviewForm
                onSave={handleSaveInterview}
                onCancel={() => setShowInterviewForm(false)}
                saving={saving}
              />
            )}
            {loadingInterviews ? (
              <p className={T_BODY}>Loading...</p>
            ) : interviews.length === 0 ? (
              <p className={T_BODY}>No interviews scheduled yet.</p>
            ) : (
              interviews.map((iv) => (
                <div key={iv.id} className={`${GLASS_CARD} p-3 space-y-1`}>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                    <span className="text-sm text-white font-medium">
                      {iv.interview_date} {iv.interview_time && `at ${iv.interview_time}`}
                    </span>
                  </div>
                  <p className={`${T_CAPTION} ml-5`}>
                    {iv.interview_type} &bull; {iv.location || "Location TBD"} &bull;{" "}
                    {iv.interviewer || "Interviewer TBD"}
                  </p>
                  <p className={`${T_CAPTION} ml-5 capitalize`}>Status: {iv.status}</p>
                  {iv.notes && <p className={`${T_BODY} ml-5`}>{iv.notes}</p>}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Evaluation Tab ── */}
        {tab === "evaluation" && (
          <div className="space-y-3">
            {!showEvalForm && (
              <button
                className={`${PRIMARY_BUTTON} flex items-center gap-2`}
                onClick={() => setShowEvalForm(true)}
              >
                <Plus className="h-4 w-4" />
                Add Evaluation
              </button>
            )}
            {showEvalForm && (
              <EvaluationForm
                onSave={handleSaveEvaluation}
                onCancel={() => setShowEvalForm(false)}
                saving={saving}
              />
            )}
            {loadingEvaluations ? (
              <p className={T_BODY}>Loading...</p>
            ) : evaluations.length === 0 ? (
              <p className={T_BODY}>No evaluations yet.</p>
            ) : (
              evaluations.map((ev) => (
                <div key={ev.id} className={`${GLASS_CARD} p-3 space-y-2`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white font-medium">{ev.interviewer}</span>
                    {scoreDisplay(ev.total_score)}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {[
                      ["Communication", ev.score_communication],
                      ["Experience", ev.score_experience],
                      ["Attitude", ev.score_attitude],
                      ["Availability", ev.score_availability],
                    ].map(([label, val]) => (
                      <div key={String(label)} className="flex justify-between text-xs">
                        <span className="text-zinc-500">{label}</span>
                        <span className="text-zinc-300">{val}/5</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={T_LABEL}>Recommendation:</span>
                    <span
                      className={
                        ev.recommendation === "hire"
                          ? BADGE_SUCCESS
                          : ev.recommendation === "reject"
                          ? BADGE_ERROR
                          : BADGE_WARNING
                      }
                      style={{ fontSize: "10px", padding: "1px 6px" }}
                    >
                      {ev.recommendation}
                    </span>
                  </div>
                  {ev.strengths && (
                    <div>
                      <p className={T_LABEL}>Strengths</p>
                      <p className={`${T_BODY} mt-0.5`}>{ev.strengths}</p>
                    </div>
                  )}
                  {ev.areas_for_improvement && (
                    <div>
                      <p className={T_LABEL}>Areas for Improvement</p>
                      <p className={`${T_BODY} mt-0.5`}>{ev.areas_for_improvement}</p>
                    </div>
                  )}
                  {ev.notes && (
                    <div>
                      <p className={T_LABEL}>Notes</p>
                      <p className={`${T_BODY} mt-0.5`}>{ev.notes}</p>
                    </div>
                  )}
                  <p className={`${T_CAPTION} text-right`}>{ev.created_at?.slice(0, 10) || ""}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Hiring plans ─────────────────────────────────────────────────────────────

type PlanPosition = {
  id: string;
  position: string;
  branch: string;
  priority: string;
  status: string;
  openings: number;
  target_start_date: string | null;
  candidate_count: number;
  filled_count: number;
  offer_count: number;
  interviewed_count: number;
  remaining: number;
};

type HiringPlan = {
  id: string;
  name: string;
  branch: string;
  opening_date: string | null;
  status: string;
  created_by: string;
  days_to_opening: number | null;
  positions: PlanPosition[];
  headcount: number;
  filled: number;
  remaining: number;
  at_risk: string[];
};

type Overview = {
  plans: HiringPlan[];
  stalled: { full_name: string; position_applied: string; days_waiting: number; since: string }[];
  stalled_count: number;
  awaiting_offer: { full_name: string; position_applied: string; days_waiting: number }[];
  openings_with_no_candidates: {
    position: string; branch: string; openings: number;
    target_start_date: string | null; days_to_target: number | null;
  }[];
  overdue_requisitions: number;
};

function ProgressBar({ filled, total }: { filled: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((filled / total) * 100)) : 0;
  const tone =
    pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-violet-500" : "bg-amber-500";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** The owner's screen: will these stores be staffed in time.
 *
 *  Built because the answer used to live across nineteen requisition rows that
 *  nobody closed, a hundred and thirty applicant cards, and several dozen
 *  spreadsheets. A red bar is the only reason to open anything.
 */
function PlansView({
  data,
  loading,
  onReload,
  onNewPlan,
}: {
  data: Overview | null;
  loading: boolean;
  onReload: () => void;
  onNewPlan: () => void;
}) {
  if (loading && !data) return <p className={`${T_BODY} p-6`}>Loading…</p>;
  if (!data) return null;

  const { plans, stalled, awaiting_offer, openings_with_no_candidates } = data;

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className={T_SECTION}>Hiring Plans</h2>
        <button className={SMALL_BUTTON} onClick={onReload}>
          <RefreshCw className="mr-1 inline h-3.5 w-3.5" /> Reload
        </button>
        <button
          className={`${PRIMARY_BUTTON} ml-auto flex items-center gap-1.5`}
          onClick={onNewPlan}
        >
          <Plus className="h-4 w-4" />
          New Hiring Plan
        </button>
      </div>

      {plans.length === 0 ? (
        <div className={`${GLASS_CARD} p-6`}>
          <p className={T_BODY}>
            No active hiring plan. A plan is one store opening or expansion — its
            roles, how many of each, and the date it has to be ready by.
          </p>
        </div>
      ) : (
        plans.map((p) => (
          <div key={p.id} className={`${GLASS_CARD} p-5 space-y-4`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className={T_CARD_TITLE}>{p.name}</p>
                <p className={T_CAPTION}>
                  {p.branch || "—"}
                  {p.opening_date ? ` · opens ${p.opening_date}` : ""}
                  {p.days_to_opening !== null && p.days_to_opening !== undefined
                    ? p.days_to_opening >= 0
                      ? ` · ${p.days_to_opening} days to go`
                      : ` · ${Math.abs(p.days_to_opening)} days overdue`
                    : ""}
                </p>
              </div>
              <p className="text-sm tabular-nums text-zinc-300">
                <span className="text-lg font-bold text-white">{p.filled}</span>
                <span className="text-zinc-500"> / {p.headcount} filled</span>
                {p.remaining > 0 && (
                  <span className="ml-2 text-amber-300">{p.remaining} to go</span>
                )}
              </p>
            </div>

            <ProgressBar filled={p.filled} total={p.headcount} />

            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-[13px]">
                <thead>
                  <tr className={TABLE_HEADER}>
                    <th className="px-3 py-2 text-left">Position</th>
                    <th className="px-3 py-2 text-right">Filled</th>
                    <th className="px-3 py-2 text-right">Candidates</th>
                    <th className="px-3 py-2 text-right">Interviewed</th>
                    <th className="px-3 py-2 text-right">Offers out</th>
                    <th className="px-3 py-2 text-left">State</th>
                  </tr>
                </thead>
                <tbody>
                  {p.positions.map((i) => {
                    const atRisk = i.remaining > 0 && i.offer_count === 0;
                    return (
                      <tr key={i.id} className={TABLE_ROW}>
                        <td className="px-3 py-2 font-medium text-white">
                          {i.position}
                          {i.priority === "urgent" && (
                            <span className="ml-2 text-[10px] uppercase tracking-wide text-red-400">
                              urgent
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {i.filled_count}/{i.openings}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {i.candidate_count || <span className="text-white/25">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {i.interviewed_count || <span className="text-white/25">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {i.offer_count || <span className="text-white/25">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          {i.status === "closed" ? (
                            <span className={BADGE_SUCCESS}>Filled</span>
                          ) : atRisk ? (
                            <span className={BADGE_WARNING}>
                              {i.candidate_count === 0 ? "No candidates" : "No offer out"}
                            </span>
                          ) : (
                            <span className={BADGE_INFO}>In progress</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {p.at_risk.length > 0 && (
              <p className="text-sm text-amber-300">
                At risk for the opening date: {p.at_risk.join(", ")}
              </p>
            )}
          </div>
        ))
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${GLASS_CARD} p-5`}>
          <p className={T_SECTION}>Waiting on a decision</p>
          <p className={`${T_CAPTION} mb-3`}>
            Interviewed more than a week ago and still not decided.
          </p>
          {stalled.length === 0 ? (
            <p className={T_BODY}>Nobody is waiting. </p>
          ) : (
            <>
              <p className="mb-2 text-2xl font-bold tabular-nums text-amber-300">
                {data.stalled_count}
              </p>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {stalled.slice(0, 40).map((s) => (
                  <div
                    key={`${s.full_name}-${s.since}`}
                    className="flex items-baseline justify-between gap-3 border-b border-white/5 py-1"
                  >
                    <span className="truncate text-sm text-white">{s.full_name}</span>
                    <span className={`${T_CAPTION} truncate`}>{s.position_applied}</span>
                    <span className="shrink-0 text-xs tabular-nums text-amber-400">
                      {s.days_waiting}d
                    </span>
                  </div>
                ))}
              </div>
              {stalled.length > 40 && (
                <p className={`${T_CAPTION} mt-2`}>and {stalled.length - 40} more</p>
              )}
            </>
          )}
        </div>

        <div className="space-y-4">
          <div className={`${GLASS_CARD} p-5`}>
            <p className={T_SECTION}>Offers out</p>
            {awaiting_offer.length === 0 ? (
              <p className={`${T_BODY} mt-2`}>None.</p>
            ) : (
              <div className="mt-2 space-y-1">
                {awaiting_offer.map((a) => (
                  <div key={a.full_name} className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm text-white">{a.full_name}</span>
                    <span className={`${T_CAPTION} truncate`}>{a.position_applied}</span>
                    <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                      {a.days_waiting}d
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={`${GLASS_CARD} p-5`}>
            <p className={T_SECTION}>Openings with nobody in the running</p>
            <p className={`${T_CAPTION} mb-2`}>
              {data.overdue_requisitions} open requisition
              {data.overdue_requisitions === 1 ? " is" : "s are"} past their target date.
            </p>
            {openings_with_no_candidates.length === 0 ? (
              <p className={T_BODY}>None.</p>
            ) : (
              <div className="max-h-52 space-y-1 overflow-y-auto">
                {openings_with_no_candidates.map((o, i) => (
                  <div
                    key={`${o.branch}-${o.position}-${i}`}
                    className="flex items-baseline justify-between gap-3 border-b border-white/5 py-1"
                  >
                    <span className="truncate text-sm text-white">{o.position}</span>
                    <span className={`${T_CAPTION} truncate`}>{o.branch}</span>
                    {o.days_to_target !== null && o.days_to_target < 0 && (
                      <span className="shrink-0 text-xs tabular-nums text-red-400">
                        {Math.abs(o.days_to_target)}d late
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type PlanPositionDraft = { position: string; openings: string; priority: string };

function NewPlanModal({
  onSave,
  onClose,
  saving,
}: {
  onSave: (data: {
    name: string; branch: string; opening_date: string;
    positions: { position: string; openings: number; priority: string }[];
  }) => Promise<string | null>;
  onClose: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [openingDate, setOpeningDate] = useState("");
  const [rows, setRows] = useState<PlanPositionDraft[]>([
    { position: "", openings: "1", priority: "normal" },
  ]);
  const [error, setError] = useState("");

  const setRow = (i: number, patch: Partial<PlanPositionDraft>) =>
    setRows((prev) => {
      const next = prev.map((r, j) => (j === i ? { ...r, ...patch } : r));
      if (i === next.length - 1 && next[i].position.trim()) {
        next.push({ position: "", openings: "1", priority: "normal" });
      }
      return next;
    });

  const valid = rows.filter((r) => r.position.trim());
  const headcount = valid.reduce((n, r) => n + Math.max(1, Number(r.openings) || 1), 0);

  const submit = async () => {
    setError("");
    const err = await onSave({
      name,
      branch,
      opening_date: openingDate,
      positions: valid.map((r) => ({
        position: r.position.trim(),
        openings: Math.max(1, Number(r.openings) || 1),
        priority: r.priority,
      })),
    });
    if (err) setError(err);
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className={`${GLASS_CARD} w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4`}>
        <div className="flex items-center justify-between">
          <p className={T_SECTION}>New Hiring Plan</p>
          <button
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className={T_CAPTION}>
          One store opening or expansion. Every role below becomes its own
          requisition, so you raise them once instead of one at a time.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={T_LABEL}>Plan name *</label>
            <input
              type="text"
              className={`${INPUT_CLASS} mt-1`}
              placeholder="e.g. Cubao (QC) opening"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className={T_LABEL}>Branch</label>
            <input
              type="text"
              className={`${INPUT_CLASS} mt-1`}
              placeholder="e.g. Cubao"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            />
          </div>
          <div>
            <label className={T_LABEL}>Opening date</label>
            <input
              type="date"
              className={`${INPUT_CLASS} mt-1`}
              value={openingDate}
              onChange={(e) => setOpeningDate(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className={T_LABEL}>Roles and how many of each</label>
          <div className="mt-1 space-y-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  className={INPUT_CLASS}
                  placeholder={i === 0 ? "e.g. Store Manager" : ""}
                  value={r.position}
                  onChange={(e) => setRow(i, { position: e.target.value })}
                />
                <input
                  type="number"
                  min={1}
                  className={`${INPUT_CLASS} w-20 shrink-0`}
                  value={r.openings}
                  onChange={(e) => setRow(i, { openings: e.target.value })}
                />
                <div className="w-32 shrink-0">
                  <SelectDark
                    value={r.priority}
                    onChange={(v) => setRow(i, { priority: v })}
                    options={[
                      { value: "normal", label: "Normal" },
                      { value: "urgent", label: "Urgent" },
                    ]}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className={`${T_CAPTION} mt-2`}>
            {valid.length} role{valid.length === 1 ? "" : "s"} · {headcount} people
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            className={PRIMARY_BUTTON}
            disabled={saving || !name.trim() || valid.length === 0}
            onClick={submit}
          >
            {saving ? "Saving…" : `Create ${valid.length} requisition${valid.length === 1 ? "" : "s"}`}
          </button>
          <button className={SECONDARY_BUTTON} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Interview Outcome ────────────────────────────────────────────────────────

type OutcomeReason = { key: string; label: string };

const OUTCOME_BUTTONS: {
  key: "proceed" | "hold" | "pass";
  label: string;
  hint: string;
  cls: string;
}[] = [
  {
    key: "proceed",
    label: "Proceed to offer",
    hint: "Moves them to Offer Sent",
    cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25",
  },
  {
    key: "hold",
    label: "Hold",
    hint: "Stays in Interviewed, with the reason on record",
    cls: "border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25",
  },
  {
    key: "pass",
    label: "Not proceeding",
    hint: "Moves them to Rejected",
    cls: "border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/25",
  },
];

/** The decision and the record, in one action.
 *
 *  Setting the status was one click; recording the interview was a six-field
 *  form and evaluating it an eight-field one. Everyone took the click, so 92
 *  people sat at or past "interviewed" backed by 3 interview records and 5
 *  evaluations, and all 16 rejections were filed without a reason.
 *
 *  Interviewer and date are not asked for -- the signed-in user and today are
 *  already known, and a field that is asked for is a field that gets skipped.
 */
function InterviewOutcomeModal({
  applicant,
  reasons,
  onSubmit,
  onClose,
  saving,
}: {
  applicant: Applicant;
  reasons: OutcomeReason[];
  onSubmit: (data: { outcome: string; reason: string; notes: string }) => Promise<string | null>;
  onClose: () => void;
  saving: boolean;
}) {
  const [outcome, setOutcome] = useState<"" | "proceed" | "hold" | "pass">("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const reasonRequired = outcome === "hold" || outcome === "pass";
  const noteRequired = reason === "other";
  const ready =
    !!outcome &&
    (!reasonRequired || !!reason) &&
    (!noteRequired || !!notes.trim());

  const submit = async () => {
    setError("");
    const err = await onSubmit({ outcome, reason, notes });
    if (err) setError(err);
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className={`${GLASS_CARD} w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={T_SECTION}>{applicant.full_name}</p>
            <p className={T_CAPTION}>{applicant.position_applied}</p>
          </div>
          <button
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div>
          <p className={T_LABEL}>How did the interview go?</p>
          <div className="mt-2 grid gap-2">
            {OUTCOME_BUTTONS.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => {
                  setOutcome(b.key);
                  setReason("");
                }}
                className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                  outcome === b.key ? b.cls : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                }`}
              >
                <span className="block text-sm font-semibold">{b.label}</span>
                <span className="block text-xs opacity-70">{b.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {outcome && (
          <div>
            <p className={T_LABEL}>
              Reason {reasonRequired ? "*" : <span className="opacity-60">(optional)</span>}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {reasons.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setReason(reason === r.key ? "" : r.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    reason === r.key
                      ? "border-violet-500/50 bg-violet-500/20 text-violet-200"
                      : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {outcome && (
          <div>
            <p className={T_LABEL}>
              Note {noteRequired ? "*" : <span className="opacity-60">(optional)</span>}
            </p>
            <textarea
              className={`${TEXTAREA_CLASS} mt-1`}
              rows={2}
              value={notes}
              placeholder={noteRequired ? "Say what happened" : ""}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button className={PRIMARY_BUTTON} disabled={!ready || saving} onClick={submit}>
            {saving ? "Saving…" : "Save outcome"}
          </button>
          <button className={SECONDARY_BUTTON} onClick={onClose}>Cancel</button>
        </div>
        <p className={T_CAPTION}>
          Recorded against you, dated today. A full scored evaluation can still be
          added from the candidate&apos;s Evaluation tab.
        </p>
      </div>
    </div>
  );
}

// ─── Add Applicant Modal ──────────────────────────────────────────────────────

type AddApplicantForm = {
  full_name: string;
  position_applied: string;
  phone: string;
  email: string;
  source: string;
  referrer_name: string;
  requisition_id: string;
  assigned_branch: string;
  notes: string;
  applied_date: string;
};

const OTHER_POSITION = "__other";

/** One field for "what are they applying for", instead of two.
 *
 *  It used to be a free-text Position box with an optional Requisition dropdown
 *  underneath it. People fill a form from the top, so the box that had to be
 *  typed got typed and the one that was useful got skipped: 115 of 132
 *  applicants are tied to no requisition, and "store manager" reached the
 *  database spelt five different ways.
 *
 *  Picking the requisition now sets the position and the branch, so this is
 *  fewer keystrokes than before rather than more.
 */
function PositionPicker({
  requisitions,
  requisitionId,
  positionApplied,
  onChange,
}: {
  requisitions: Requisition[];
  requisitionId: string;
  positionApplied: string;
  onChange: (patch: {
    requisition_id: string;
    position_applied: string;
    assigned_branch: string;
  }) => void;
}) {
  // Held here rather than inferred from the values, so choosing "Other" and then
  // clearing the text does not silently snap back to "nothing selected".
  const [isOther, setIsOther] = useState(!requisitionId && positionApplied !== "");

  const pick = (v: string) => {
    if (v === OTHER_POSITION) {
      setIsOther(true);
      onChange({ requisition_id: "", position_applied: "", assigned_branch: "" });
      return;
    }
    setIsOther(false);
    if (!v) {
      onChange({ requisition_id: "", position_applied: "", assigned_branch: "" });
      return;
    }
    const r = requisitions.find((x) => x.id === v);
    onChange({
      requisition_id: v,
      position_applied: r?.position ?? "",
      assigned_branch: r?.branch ?? "",
    });
  };

  return (
    <div className="space-y-2">
      <SelectDark
        className={`${SELECT_CLASS} mt-1`}
        value={requisitionId || (isOther ? OTHER_POSITION : "")}
        onChange={pick}
        options={[
          { value: "", label: "— Select an open position —" },
          ...requisitions.map((r) => ({
            value: r.id,
            label: `${r.position} — ${r.branch}${r.priority === "urgent" ? "  (urgent)" : ""}`,
          })),
          { value: OTHER_POSITION, label: "Other — not on the list" },
        ]}
      />
      {isOther && (
        <input
          type="text"
          autoFocus
          placeholder="Type the position"
          className={INPUT_CLASS}
          value={positionApplied}
          onChange={(e) =>
            onChange({
              requisition_id: "",
              position_applied: e.target.value,
              assigned_branch: "",
            })
          }
        />
      )}
      {requisitionId && (
        <p className={T_CAPTION}>
          Linked to this requisition, so it counts toward that opening.
        </p>
      )}
      {isOther && (
        <p className={T_CAPTION}>
          Not linked to any requisition — this candidate will not appear against an
          opening. Raise a requisition if this role is really being hired for.
        </p>
      )}
    </div>
  );
}

function AddApplicantModal({
  requisitions,
  onSave,
  onClose,
  saving,
}: {
  requisitions: Requisition[];
  onSave: (data: AddApplicantForm) => Promise<string | null>;
  onClose: () => void;
  saving: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<AddApplicantForm>({
    full_name: "",
    position_applied: "",
    phone: "",
    email: "",
    source: "referral",
    referrer_name: "",
    requisition_id: "",
    assigned_branch: "",
    notes: "",
    applied_date: today,
  });
  const [submitError, setSubmitError] = useState("");
  const set = (k: keyof AddApplicantForm, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));
  const handleSubmit = async () => {
    setSubmitError("");
    const err = await onSave(form);
    if (err) setSubmitError(err);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div
        className={`${GLASS_CARD} w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4`}
      >
        <div className="flex items-center justify-between">
          <p className={T_SECTION}>Add Applicant</p>
          <button
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={T_LABEL}>Full Name *</label>
            <input
              type="text"
              className={`${INPUT_CLASS} mt-1`}
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className={T_LABEL}>Applying for *</label>
            <PositionPicker
              requisitions={requisitions}
              requisitionId={form.requisition_id}
              positionApplied={form.position_applied}
              onChange={(patch) => setForm((p) => ({ ...p, ...patch }))}
            />
          </div>
          <div>
            <label className={T_LABEL}>Phone</label>
            <input
              type="text"
              className={`${INPUT_CLASS} mt-1`}
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>
          <div>
            <label className={T_LABEL}>Email</label>
            <input
              type="email"
              className={`${INPUT_CLASS} mt-1`}
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
          <div>
            <label className={T_LABEL}>Source</label>
            <SelectDark
              className={`${SELECT_CLASS} mt-1`}
              value={form.source}
              onChange={v => set("source", v)}
              options={[
                { value: "referral", label: "Referral" },
                { value: "jobstreet", label: "JobStreet" },
                { value: "facebook", label: "Facebook" },
                { value: "walk_in", label: "Walk-in" },
                { value: "other", label: "Other" },
              ]}
            />
          </div>
          {form.source === "referral" && (
            <div>
              <label className={T_LABEL}>Referrer Name</label>
              <input
                type="text"
                className={`${INPUT_CLASS} mt-1`}
                value={form.referrer_name}
                onChange={(e) => set("referrer_name", e.target.value)}
              />
            </div>
          )}
          <div>
            <label className={T_LABEL}>Applied Date</label>
            <input
              type="date"
              className={`${INPUT_CLASS} mt-1`}
              value={form.applied_date}
              onChange={(e) => set("applied_date", e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className={T_LABEL}>Notes</label>
            <textarea
              className={`${TEXTAREA_CLASS} mt-1`}
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </div>

        {submitError && (
          <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
            {submitError}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            className={PRIMARY_BUTTON}
            disabled={saving || !form.full_name.trim() || !form.position_applied.trim()}
            onClick={handleSubmit}
          >
            {saving ? "Saving..." : "Add Applicant"}
          </button>
          <button className={SECONDARY_BUTTON} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Requisition Modal ────────────────────────────────────────────────────

type AddRequisitionForm = {
  branch: string;
  position: string;
  reason: string;
  resigned_staff_name: string;
  target_start_date: string;
  priority: string;
  requested_by: string;
  notes: string;
  openings: string;
};

// ─── Add Several Modal ────────────────────────────────────────────────────────

type BulkAddResult = { created_count: number; skipped: string[] };

/** A stack of resumes is one event, not fifteen separate ones.
 *
 *  Fifteen candidates were entered through the single-applicant modal on
 *  2026-08-26 and ten more on 08-31. The position, the source and the date are
 *  the same for the whole stack, so they are asked once here and only the names
 *  are typed -- which is fewer keystrokes than the spreadsheet this replaces.
 */
function BulkAddModal({
  requisitions,
  onSave,
  onClose,
  saving,
}: {
  requisitions: Requisition[];
  onSave: (data: {
    names: string[];
    position_applied: string;
    requisition_id: string;
    assigned_branch: string;
    source: string;
    referrer_name: string;
    applied_date: string;
  }) => Promise<{ error: string | null; result: BulkAddResult | null }>;
  onClose: () => void;
  saving: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [position, setPosition] = useState({
    requisition_id: "",
    position_applied: "",
    assigned_branch: "",
  });
  const [source, setSource] = useState("walk_in");
  const [referrer, setReferrer] = useState("");
  const [appliedDate, setAppliedDate] = useState(today);
  const [names, setNames] = useState<string[]>([""]);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<BulkAddResult | null>(null);
  const rowRefs = useRef<(HTMLInputElement | null)[]>([]);

  const filled = names.map((n) => n.trim()).filter(Boolean);

  const setName = (i: number, v: string) =>
    setNames((prev) => {
      const next = [...prev];
      next[i] = v;
      // Always keep one empty row at the end, the way a spreadsheet does.
      if (i === next.length - 1 && v.trim()) next.push("");
      return next;
    });

  // Pasting a column of names from a spreadsheet fills a row each, rather than
  // dropping the whole block into one field.
  const handlePaste = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!/[\n\t]/.test(text)) return;
    e.preventDefault();
    const parts = text.split(/[\n\t]+/).map((x) => x.trim()).filter(Boolean);
    setNames((prev) => {
      const next = [...prev];
      next.splice(i, 1, ...parts);
      if (next[next.length - 1]?.trim()) next.push("");
      return next;
    });
  };

  const removeRow = (i: number) =>
    setNames((prev) => (prev.length === 1 ? [""] : prev.filter((_, j) => j !== i)));

  const handleSubmit = async () => {
    setSubmitError("");
    setResult(null);
    const r = await onSave({
      names: filled,
      position_applied: position.position_applied,
      requisition_id: position.requisition_id,
      assigned_branch: position.assigned_branch,
      source,
      referrer_name: referrer,
      applied_date: appliedDate,
    });
    if (r.error) setSubmitError(r.error);
    else setResult(r.result);
  };

  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
        <div className={`${GLASS_CARD} w-full max-w-lg p-6 space-y-4`}>
          <p className={T_SECTION}>
            {result.created_count} candidate{result.created_count === 1 ? "" : "s"} added
          </p>
          {result.skipped.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
              <p className="text-sm font-medium text-amber-300">
                {result.skipped.length} skipped — already in the pipeline for this position
              </p>
              <p className="mt-1 text-xs text-amber-200/70">{result.skipped.join(", ")}</p>
            </div>
          )}
          <button className={PRIMARY_BUTTON} onClick={onClose}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className={`${GLASS_CARD} w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4`}>
        <div className="flex items-center justify-between">
          <p className={T_SECTION}>Add Several Candidates</p>
          <button
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className={T_CAPTION}>
          Set the position once, then type the names. Paste a column from a
          spreadsheet and it fills a row each.
        </p>

        <div>
          <label className={T_LABEL}>Applying for *</label>
          <PositionPicker
            requisitions={requisitions}
            requisitionId={position.requisition_id}
            positionApplied={position.position_applied}
            onChange={setPosition}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={T_LABEL}>Source</label>
            <SelectDark
              className={`${SELECT_CLASS} mt-1`}
              value={source}
              onChange={setSource}
              options={[
                { value: "walk_in", label: "Walk-in" },
                { value: "referral", label: "Referral" },
                { value: "jobstreet", label: "JobStreet" },
                { value: "facebook", label: "Facebook" },
                { value: "other", label: "Other" },
              ]}
            />
          </div>
          <div>
            <label className={T_LABEL}>Applied Date</label>
            <input
              type="date"
              className={`${INPUT_CLASS} mt-1`}
              value={appliedDate}
              onChange={(e) => setAppliedDate(e.target.value)}
            />
          </div>
          {source === "referral" && (
            <div className="col-span-2">
              <label className={T_LABEL}>Referrer Name</label>
              <input
                type="text"
                className={`${INPUT_CLASS} mt-1`}
                value={referrer}
                onChange={(e) => setReferrer(e.target.value)}
              />
            </div>
          )}
        </div>

        <div>
          <label className={T_LABEL}>Names</label>
          <div className="mt-1 space-y-1.5">
            {names.map((n, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-white/30">
                  {i + 1}
                </span>
                <input
                  ref={(el) => { rowRefs.current[i] = el; }}
                  type="text"
                  className={INPUT_CLASS}
                  value={n}
                  placeholder={i === 0 ? "Full name" : ""}
                  onChange={(e) => setName(i, e.target.value)}
                  onPaste={(e) => handlePaste(i, e)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      rowRefs.current[i + 1]?.focus();
                    }
                  }}
                />
                <button
                  type="button"
                  className="shrink-0 rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white"
                  onClick={() => removeRow(i)}
                  aria-label={`Remove row ${i + 1}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {submitError && (
          <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
            {submitError}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            className={PRIMARY_BUTTON}
            disabled={saving || filled.length === 0 || !position.position_applied.trim()}
            onClick={handleSubmit}
          >
            {saving
              ? "Saving…"
              : `Add ${filled.length} candidate${filled.length === 1 ? "" : "s"}`}
          </button>
          <button className={SECONDARY_BUTTON} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function AddRequisitionModal({
  onSave,
  onClose,
  saving,
}: {
  onSave: (data: AddRequisitionForm) => Promise<string | null>;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<AddRequisitionForm>({
    branch: "",
    position: "",
    reason: "replacement",
    resigned_staff_name: "",
    target_start_date: "",
    priority: "normal",
    requested_by: "",
    notes: "",
    openings: "1",
  });
  const [submitError, setSubmitError] = useState("");
  const set = (k: keyof AddRequisitionForm, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));
  const handleSubmit = async () => {
    setSubmitError("");
    const err = await onSave(form);
    if (err) setSubmitError(err);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div
        className={`${GLASS_CARD} w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4`}
      >
        <div className="flex items-center justify-between">
          <p className={T_SECTION}>Add Requisition</p>
          <button
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={T_LABEL}>Branch *</label>
            <input
              type="text"
              className={`${INPUT_CLASS} mt-1`}
              value={form.branch}
              onChange={(e) => set("branch", e.target.value)}
            />
          </div>
          <div>
            <label className={T_LABEL}>Position *</label>
            <input
              type="text"
              className={`${INPUT_CLASS} mt-1`}
              value={form.position}
              onChange={(e) => set("position", e.target.value)}
            />
          </div>
          <div>
            <label className={T_LABEL}>Reason</label>
            <SelectDark
              className={`${SELECT_CLASS} mt-1`}
              value={form.reason}
              onChange={v => set("reason", v)}
              options={[
                { value: "replacement", label: "Replacement" },
                { value: "new_hire", label: "New Hire" },
                { value: "expansion", label: "Expansion" },
                { value: "buffer", label: "Buffer" },
              ]}
            />
          </div>
          {form.reason === "replacement" && (
            <div>
              <label className={T_LABEL}>Resigned Staff Name</label>
              <input
                type="text"
                className={`${INPUT_CLASS} mt-1`}
                value={form.resigned_staff_name}
                onChange={(e) => set("resigned_staff_name", e.target.value)}
              />
            </div>
          )}
          <div>
            <label className={T_LABEL}>Target Start Date</label>
            <input
              type="date"
              className={`${INPUT_CLASS} mt-1`}
              value={form.target_start_date}
              onChange={(e) => set("target_start_date", e.target.value)}
            />
          </div>
          <div>
            <label className={T_LABEL}>How many people</label>
            <input
              type="number"
              min={1}
              className={`${INPUT_CLASS} mt-1`}
              value={form.openings}
              onChange={(e) => set("openings", e.target.value)}
            />
          </div>
          <div>
            <label className={T_LABEL}>Priority</label>
            <SelectDark
              className={`${SELECT_CLASS} mt-1`}
              value={form.priority}
              onChange={v => set("priority", v)}
              options={[
                { value: "urgent", label: "Urgent" },
                { value: "normal", label: "Normal" },
                { value: "low", label: "Low" },
              ]}
            />
          </div>
          <div className="col-span-2">
            <label className={T_LABEL}>Requested By</label>
            <input
              type="text"
              className={`${INPUT_CLASS} mt-1`}
              value={form.requested_by}
              onChange={(e) => set("requested_by", e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className={T_LABEL}>Notes</label>
            <textarea
              className={`${TEXTAREA_CLASS} mt-1`}
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </div>

        {submitError && (
          <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
            {submitError}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            className={PRIMARY_BUTTON}
            disabled={saving || !form.branch.trim() || !form.position.trim()}
            onClick={handleSubmit}
          >
            {saving ? "Saving..." : "Add Requisition"}
          </button>
          <button className={SECONDARY_BUTTON} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = ["ADMIN", "HQ", "HR_MANAGER", "MANILA_MANAGEMENT", "MANILA_MANAGER"];

export default function HRRecruitmentPage() {
  const router = useRouter();
  const [accessReady, setAccessReady] = useState(false);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null);
  const [showAddApplicant, setShowAddApplicant] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [savingBulk, setSavingBulk] = useState(false);
  const [outcomeFor, setOutcomeFor] = useState<Applicant | null>(null);
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [outcomeReasons, setOutcomeReasons] = useState<OutcomeReason[]>([]);
  const [view, setView] = useState<"pipeline" | "plans">("pipeline");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [showAddRequisition, setShowAddRequisition] = useState(false);
  const [showRequisitionsList, setShowRequisitionsList] = useState(false);
  const [savingApplicant, setSavingApplicant] = useState(false);
  const [savingRequisition, setSavingRequisition] = useState(false);

  const authRef = useRef(getAuth());

  // ── Auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
    const current = getAuth();
    if (!current) {
      router.replace("/login?next=/admin/hr/recruitment");
      return;
    }
    void refreshAuthFromApi(current).then((resolved) => {
      const auth = resolved || current;
      const role = String(auth?.role || "").toUpperCase();
      if (!ALLOWED_ROLES.includes(role) && !hasRouteAccess("/admin/hr/recruitment", auth)) {
        router.replace("/week");
        return;
      }
      authRef.current = auth;
      setAccessReady(true);
    });
  }, [router]);

  // ── Session-expiry handling ───────────────────────────────────────────────
  // A 401 means the access token expired/was rejected. Clearing the stale auth
  // and sending the user back to login is the only real fix — otherwise every
  // call silently fails behind a tiny banner (and modals look like they hang).
  const redirectToLogin = useCallback(() => {
    clearAuth();
    router.replace("/login?next=/admin/hr/recruitment");
  }, [router]);

  // ── Data load ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const auth = authRef.current;
    if (!auth) return;
    setLoading(true);
    setError("");
    try {
      const headers = getAuthHeaders(auth);
      const [appRes, reqRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/hr/applicants?city=manila`, {
          headers,
          cache: "no-store",
        }),
        fetch(`${API_BASE}/api/admin/hr/requisitions?city=manila&status=open`, {
          headers,
          cache: "no-store",
        }),
      ]);
      if (appRes.status === 401 || reqRes.status === 401) {
        redirectToLogin();
        return;
      }
      if (!appRes.ok) throw new Error(`Applicants: HTTP ${appRes.status}`);
      const appData = await appRes.json();
      setApplicants(Array.isArray(appData) ? appData : appData?.applicants || []);

      if (reqRes.ok) {
        const reqData = await reqRes.json();
        setRequisitions(Array.isArray(reqData) ? reqData : reqData?.requisitions || []);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [redirectToLogin]);

  const loadOverview = useCallback(async () => {
    const auth = authRef.current;
    if (!auth) return;
    setLoadingOverview(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/recruitment-overview?city=manila`, {
        cache: "no-store",
        headers: getAuthHeaders(auth),
      });
      if (res.ok) setOverview((await res.json()) as Overview);
    } catch { /* the pipeline view still works */ } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    if (accessReady) void loadData();
  }, [accessReady, loadData]);

  useEffect(() => {
    if (accessReady && view === "plans") void loadOverview();
  }, [accessReady, view, loadOverview]);

  // Fetched rather than hard-coded, so the chips shown here are exactly the
  // values the database will accept.
  useEffect(() => {
    if (!accessReady) return;
    const auth = authRef.current;
    if (!auth) return;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/admin/hr/interview-outcome-reasons`, {
          headers: getAuthHeaders(auth),
        });
        if (res.ok) setOutcomeReasons(((await res.json())?.reasons ?? []) as OutcomeReason[]);
      } catch { /* the modal still works; the reason chips just stay empty */ }
    })();
  }, [accessReady]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  // Extract a human-readable detail from a failed JSON response (backend
  // returns {"detail": "..."} on validation errors).
  const errorDetail = async (res: Response): Promise<string> => {
    try {
      const data = await res.json();
      if (data?.detail) return String(data.detail);
    } catch {
      /* not JSON */
    }
    return `HTTP ${res.status}`;
  };

  // Both Add modals share the same contract: return null on success (modal
  // closes), or an error string to show inside the still-open modal.
  const handleAddApplicant = async (
    form: AddApplicantForm
  ): Promise<string | null> => {
    const auth = authRef.current;
    if (!auth) return "Not signed in.";
    setSavingApplicant(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/applicants`, {
        method: "POST",
        headers: getAuthHeaders(auth),
        body: JSON.stringify({ city: "manila", ...form }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return "Your session has expired. Redirecting to login…";
      }
      if (!res.ok) return `Failed to save applicant: ${await errorDetail(res)}`;
      setShowAddApplicant(false);
      void loadData();
      return null;
    } catch (e: unknown) {
      return e instanceof Error ? e.message : String(e);
    } finally {
      setSavingApplicant(false);
    }
  };

  const handleCreatePlan = async (data: {
    name: string; branch: string; opening_date: string;
    positions: { position: string; openings: number; priority: string }[];
  }): Promise<string | null> => {
    const auth = authRef.current;
    if (!auth) return "Not signed in.";
    setSavingPlan(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/hiring-plans`, {
        method: "POST",
        headers: getAuthHeaders(auth),
        body: JSON.stringify({ city: "manila", ...data }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return "Your session has expired. Redirecting to login\u2026";
      }
      if (!res.ok) return await errorDetail(res);
      void loadOverview();
      void loadData();
      return null;
    } catch (e: unknown) {
      return e instanceof Error ? e.message : String(e);
    } finally {
      setSavingPlan(false);
    }
  };

  const handleRecordOutcome = async (
    data: { outcome: string; reason: string; notes: string }
  ): Promise<string | null> => {
    const auth = authRef.current;
    if (!auth || !outcomeFor) return "Not signed in.";
    setSavingOutcome(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/hr/applicants/${outcomeFor.id}/interview-outcome`,
        { method: "POST", headers: getAuthHeaders(auth), body: JSON.stringify(data) },
      );
      if (res.status === 401) {
        redirectToLogin();
        return "Your session has expired. Redirecting to login\u2026";
      }
      if (!res.ok) return await errorDetail(res);
      void loadData();
      return null;
    } catch (e: unknown) {
      return e instanceof Error ? e.message : String(e);
    } finally {
      setSavingOutcome(false);
    }
  };

  const handleBulkAdd = async (data: {
    names: string[];
    position_applied: string;
    requisition_id: string;
    assigned_branch: string;
    source: string;
    referrer_name: string;
    applied_date: string;
  }): Promise<{ error: string | null; result: BulkAddResult | null }> => {
    const auth = authRef.current;
    if (!auth) return { error: "Not signed in.", result: null };
    setSavingBulk(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/applicants/bulk`, {
        method: "POST",
        headers: getAuthHeaders(auth),
        body: JSON.stringify({ city: "manila", ...data }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return { error: "Your session has expired. Redirecting to login\u2026", result: null };
      }
      if (!res.ok) return { error: `Failed to save: ${await errorDetail(res)}`, result: null };
      const body = await res.json();
      return {
        error: null,
        result: {
          created_count: Number(body?.created_count || 0),
          skipped: (body?.skipped || []) as string[],
        },
      };
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e), result: null };
    } finally {
      setSavingBulk(false);
    }
  };

  const handleAddRequisition = async (
    form: AddRequisitionForm
  ): Promise<string | null> => {
    const auth = authRef.current;
    if (!auth) return "Not signed in.";
    setSavingRequisition(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/requisitions`, {
        method: "POST",
        headers: getAuthHeaders(auth),
        body: JSON.stringify({
          city: "manila",
          ...form,
          openings: Math.max(1, Number(form.openings) || 1),
        }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return "Your session has expired. Redirecting to login…";
      }
      if (!res.ok) return `Failed to save requisition: ${await errorDetail(res)}`;
      setShowAddRequisition(false);
      void loadData();
      return null;
    } catch (e: unknown) {
      return e instanceof Error ? e.message : String(e);
    } finally {
      setSavingRequisition(false);
    }
  };

  const handleStatusChange = useCallback(
    (id: string, status: KanbanStatus) => {
      setApplicants((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status } : a))
      );
      if (selectedApplicant?.id === id) {
        setSelectedApplicant((prev) => (prev ? { ...prev, status } : prev));
      }
    },
    [selectedApplicant]
  );

  const handleQuickStatus = useCallback(
    async (id: string, newStatus: KanbanStatus) => {
      const auth = authRef.current;
      if (!auth) return;
      // Optimistic update
      handleStatusChange(id, newStatus);
      try {
        const res = await fetch(`${API_BASE}/api/admin/hr/applicants/${id}`, {
          method: "PATCH",
          headers: getAuthHeaders(auth),
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) {
          // Revert on error by reloading
          void loadData();
        }
      } catch {
        void loadData();
      }
    },
    [handleStatusChange, loadData]
  );

  // ── Kanban grouping ───────────────────────────────────────────────────────

  const grouped = KANBAN_COLUMNS.reduce(
    (acc, col) => {
      acc[col.id] = applicants.filter((a) => a.status === col.id);
      return acc;
    },
    {} as Record<KanbanStatus, Applicant[]>
  );

  const getNextStatus = (current: KanbanStatus): KanbanStatus | null => {
    const idx = ALL_STATUSES.indexOf(current);
    if (idx < 0 || current === "hired" || current === "rejected") return null;
    return ALL_STATUSES[idx + 1] || null;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!accessReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className={T_BODY}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* ── Page Header ── */}
      <div className="shrink-0 border-b border-white/10 bg-[#0d1117]/80 backdrop-blur px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className={T_PAGE_TITLE}>HR Recruitment Pipeline</h1>
            <div className={TAB_CONTAINER}>
              {([["pipeline", "Pipeline"], ["plans", "Plans"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  className={view === k ? TAB_ACTIVE : TAB_INACTIVE}
                  onClick={() => setView(k)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={`${SECONDARY_BUTTON} flex items-center gap-1.5`}
              onClick={() => void loadData()}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              className={`${SECONDARY_BUTTON} flex items-center gap-1.5`}
              onClick={() => setShowAddRequisition(true)}
            >
              <ClipboardList className="h-4 w-4" />
              + Requisition
            </button>
            <button
              className={`${SECONDARY_BUTTON} flex items-center gap-1.5`}
              onClick={() => setShowBulkAdd(true)}
            >
              <Plus className="h-4 w-4" />
              Add Several
            </button>
            <button
              className={`${PRIMARY_BUTTON} flex items-center gap-1.5`}
              onClick={() => setShowAddApplicant(true)}
            >
              <Plus className="h-4 w-4" />
              Add Applicant
            </button>
          </div>
        </div>

        {/* KPI summary */}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className={`${T_CAPTION} text-zinc-400`}>
            Total:{" "}
            <span className="font-semibold text-white">{applicants.length}</span>
          </span>
          {KANBAN_COLUMNS.filter((c) => c.id !== "rejected").map((col) => {
            const count = grouped[col.id]?.length || 0;
            if (count === 0) return null;
            return (
              <span key={col.id} className={`${T_CAPTION} text-zinc-400`}>
                {col.label}:{" "}
                <span className="font-semibold text-white">{count}</span>
              </span>
            );
          })}
          <button
            onClick={() => setShowRequisitionsList((v) => !v)}
            className={`ml-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
              showRequisitionsList
                ? "border-violet-500/40 bg-violet-500/15 text-violet-300"
                : "border-white/10 bg-white/5 text-zinc-400 hover:text-white"
            }`}
          >
            <ClipboardList className="h-3 w-3" />
            Open Requisitions ({requisitions.length})
            <span className="ml-0.5">{showRequisitionsList ? "▲" : "▼"}</span>
          </button>
        </div>

        {/* Requisitions list panel */}
        {showRequisitionsList && (
          <div className="mt-3 border-t border-white/10 pt-3">
            {requisitions.length === 0 ? (
              <p className="text-xs text-zinc-500">No open requisitions.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {requisitions.map((r) => (
                  <div key={r.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs min-w-[160px]">
                    <p className="font-semibold text-white">{r.branch} — {r.position}</p>
                    <p className="text-zinc-400 capitalize">{r.reason?.replace("_", " ")} · {r.priority}</p>
                    <p className="mt-1 tabular-nums text-zinc-300">
                      {r.filled_count ?? 0}/{r.openings ?? 1} filled
                      {(r.candidate_count ?? 0) > 0 && (
                        <span className="text-zinc-500"> · {r.candidate_count} candidates</span>
                      )}
                    </p>
                    {(r.candidate_count ?? 0) === 0 && (
                      <p className="mt-0.5 text-amber-400">No candidates yet</p>
                    )}
                    <p className="text-zinc-500 mt-0.5">by {r.requested_by}</p>
                    {r.target_start_date && (
                      <p className={`mt-0.5 ${(r.days_to_target ?? 0) < 0 ? "text-red-400" : "text-zinc-600"}`}>
                        Start: {r.target_start_date}
                        {(r.days_to_target ?? 0) < 0 &&
                          ` · ${Math.abs(r.days_to_target ?? 0)}d late`}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mt-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}
      </div>

      {view === "plans" ? (
        <PlansView
          data={overview}
          loading={loadingOverview}
          onReload={() => void loadOverview()}
          onNewPlan={() => setShowNewPlan(true)}
        />
      ) : (
        <>
          {/* ── Main area: Kanban + Detail Panel ── */}
          <div className="flex">
            {/* Kanban Board */}
            <div className="flex-1 overflow-x-auto">
              <div className="grid gap-2 p-3" style={{ gridTemplateColumns: `repeat(${KANBAN_COLUMNS.length}, minmax(0, 1fr))` }}>
                {KANBAN_COLUMNS.map((col) => {
                  const cards = grouped[col.id] || [];
                  return (
                    <div
                      key={col.id}
                      className={`flex min-w-0 flex-col rounded-2xl border-t-2 ${col.color} border border-white/8 bg-white/3`}
                    >
                      {/* Column header */}
                      <div className="shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-white/8">
                        <span className="text-sm font-semibold text-zinc-200">{col.label}</span>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-zinc-300 tabular-nums">
                          {cards.length}
                        </span>
                      </div>

                      <div className="space-y-2 p-2">
                        {cards.length === 0 ? (
                          <p className="text-center text-xs text-zinc-600 pt-6">Empty</p>
                        ) : (
                          cards.map((applicant) => (
                            <KanbanCard
                              key={applicant.id}
                              applicant={applicant}
                              onSelect={() => setSelectedApplicant(applicant)}
                              onQuickStatus={handleQuickStatus}
                              onRecordOutcome={setOutcomeFor}
                              nextStatus={getNextStatus(applicant.status)}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detail Panel (right slide-in) */}
            {selectedApplicant && (
              <div className="hidden md:flex w-[360px] shrink-0 border-l border-white/10 bg-[#0d1117]/95 p-4 flex-col">
                <DetailPanel
                  key={selectedApplicant.id}
                  applicant={selectedApplicant}
                  onClose={() => setSelectedApplicant(null)}
                  onStatusChange={handleStatusChange}
                  onRecordOutcome={setOutcomeFor}
                />
              </div>
            )}
          </div>

          {/* Mobile detail panel: bottom sheet */}
          {selectedApplicant && (
            <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setSelectedApplicant(null)}>
              <div
                className="absolute bottom-0 left-0 right-0 h-[85vh] overflow-hidden flex flex-col rounded-t-2xl border-t border-white/10 bg-[#0d1117] p-4"
                onClick={(e) => e.stopPropagation()}
              >
                <DetailPanel
                  key={selectedApplicant.id}
                  applicant={selectedApplicant}
                  onClose={() => setSelectedApplicant(null)}
                  onStatusChange={handleStatusChange}
                  onRecordOutcome={setOutcomeFor}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showAddApplicant && (
        <AddApplicantModal
          requisitions={requisitions}
          onSave={handleAddApplicant}
          onClose={() => setShowAddApplicant(false)}
          saving={savingApplicant}
        />
      )}
      {showNewPlan && (
        <NewPlanModal
          onSave={handleCreatePlan}
          onClose={() => setShowNewPlan(false)}
          saving={savingPlan}
        />
      )}
      {outcomeFor && (
        <InterviewOutcomeModal
          applicant={outcomeFor}
          reasons={outcomeReasons}
          onSubmit={handleRecordOutcome}
          onClose={() => setOutcomeFor(null)}
          saving={savingOutcome}
        />
      )}
      {showBulkAdd && (
        <BulkAddModal
          requisitions={requisitions}
          onSave={handleBulkAdd}
          onClose={() => { setShowBulkAdd(false); void loadData(); }}
          saving={savingBulk}
        />
      )}
      {showAddRequisition && (
        <AddRequisitionModal
          onSave={handleAddRequisition}
          onClose={() => setShowAddRequisition(false)}
          saving={savingRequisition}
        />
      )}
    </div>
  );
}
