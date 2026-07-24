"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, ChevronRight, RefreshCw, Star, Calendar, ClipboardList } from "lucide-react";
import { getAuth, refreshAuthFromApi, getAuthHeaders, clearAuth } from "@/lib/auth";
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
  T_LABEL,
  T_BODY,
  T_CAPTION,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_ACCENT,
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
};

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
  nextStatus,
}: {
  applicant: Applicant;
  onSelect: () => void;
  onQuickStatus: (id: string, status: KanbanStatus) => void;
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

      {/* Quick status button */}
      {nextStatus && (
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
}: {
  applicant: Applicant;
  onClose: () => void;
  onStatusChange: (id: string, status: KanbanStatus) => void;
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
                <SelectDark
                  className={`${SELECT_CLASS} mt-2`}
                  value={localStatus}
                  onChange={v => void handleStatusChange(v as KanbanStatus)}
                  options={ALL_STATUSES.map(s => ({ value: s, label: KANBAN_COLUMNS.find(c => c.id === s)?.label || s }))}
                />
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

// ─── Add Applicant Modal ──────────────────────────────────────────────────────

type AddApplicantForm = {
  full_name: string;
  position_applied: string;
  phone: string;
  email: string;
  source: string;
  referrer_name: string;
  requisition_id: string;
  notes: string;
  applied_date: string;
};

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
            <label className={T_LABEL}>Position Applied</label>
            <input
              type="text"
              className={`${INPUT_CLASS} mt-1`}
              value={form.position_applied}
              onChange={(e) => set("position_applied", e.target.value)}
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
          <div className="col-span-2">
            <label className={T_LABEL}>Requisition (optional)</label>
            <SelectDark
              className={`${SELECT_CLASS} mt-1`}
              value={form.requisition_id}
              onChange={v => set("requisition_id", v)}
              options={[
                { value: "", label: "— None —" },
                ...requisitions.map(r => ({ value: r.id, label: `${r.position} — ${r.branch} (${r.priority})` })),
              ]}
            />
          </div>
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
            disabled={saving || !form.full_name.trim()}
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
};

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
      if (!ALLOWED_ROLES.includes(role)) {
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

  useEffect(() => {
    if (accessReady) void loadData();
  }, [accessReady, loadData]);

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
        body: JSON.stringify({ city: "manila", ...form }),
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
          <h1 className={T_PAGE_TITLE}>HR Recruitment Pipeline</h1>
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
                    <p className="text-zinc-400 capitalize">{r.reason.replace("_", " ")} · {r.priority}</p>
                    <p className="text-zinc-500 mt-0.5">by {r.requested_by}</p>
                    {r.target_start_date && (
                      <p className="text-zinc-600 mt-0.5">Start: {r.target_start_date}</p>
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
            />
          </div>
        </div>
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
