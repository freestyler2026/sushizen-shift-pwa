"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
// API calls go through Next.js proxy (/api/admin/...) — no direct Heroku fetch
import {
  GLASS_CARD,
  STATUS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  DANGER_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
  TAB_CONTAINER,
  TAB_ACTIVE,
  TAB_INACTIVE,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  TABLE_HEADER,
  TABLE_ROW,
  TABLE_CELL,
  T_PAGE_TITLE,
  T_SECTION,
  T_CARD_TITLE,
  T_LABEL,
  T_BODY,
  T_CAPTION,
  BADGE_SUCCESS,
  BADGE_ERROR,
} from "@/lib/ui-tokens";
import {
  RefreshCw,
  AlertCircle,
  FileText,
  CheckCircle,
  Plus,
  X,
  ChevronRight,
  User,
  Edit2,
  Trash2,
  AlertTriangle,
  BookOpen,
  RotateCcw,
  Zap,
  Eye,
} from "lucide-react";
import SelectDark from "@/components/SelectDark";

// ─── Types ────────────────────────────────────────────────────────────────────

type NteStatus = "ACTIVE" | "RESOLVED";

type CaseType = "NTE" | "WARNING_LETTER" | "FINAL_WARNING";

type NteRecord = {
  id: string;
  city: string;
  staff_name: string;
  issued_date: string;
  reason: string;
  issued_by: string;
  status: NteStatus;
  resolved_at: string | null;
  resolved_by: string;
  resolution_note: string;
  suspension_triggered: boolean;
  case_type: CaseType;
  explanation_text: string | null;
  explanation_submitted_at: string | null;
  approved_by: string;
  created_at: string;
};

type StaffRanking = {
  staff_name: string;
  city: string;
  total_count: number;
  active_count: number;
  resolved_count: number;
  latest_issued_date: string | null;
  has_suspension: boolean;
};

type NteTemplate = {
  id: string;
  city: string;
  title: string;
  body: string;
  created_by: string;
  created_at: string;
};

type NteRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "ISSUED";

type NteRequest = {
  id: string;
  city: string;
  staff_name: string;
  reason: string;
  requested_by: string;
  request_date: string;
  status: NteRequestStatus;
  case_type: CaseType;
  image_url?: string | null;
  image_filename?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string;
  issued_nte_id?: string | null;
  created_at: string;
};

type DashboardData = {
  ok: boolean;
  summary: {
    staff_name: string;
    city: string;
    active_count: number;
    total_count: number;
    latest_nte_date: string | null;
  }[];
  ntes: NteRecord[];
  suspensions: any[];
  templates: NteTemplate[];
  requests?: NteRequest[];
};

type PageTab = "board" | "request" | "pending" | "issue" | "history" | "templates" | "catalog" | "ir" | "cases";

type IrEvidence = {
  id: string;
  evidence_type: string;
  file_path: string | null;
  cctv_reference: string | null;
  description: string;
  captured_at: string | null;
  uploaded_by: string;
  uploaded_at: string;
};

type IrRecord = {
  id: string;
  ir_ref: string;
  market: string;
  store_code: string;
  staff_name: string;
  reported_by: string;
  input_layer: string;
  proposed_code: string | null;
  status: string;
  incident_date: string;
  incident_time: string | null;
  location_code: string | null;
  witness_names: string[];
  observed_acts: string | null;
  verbatim_quote: string | null;
  operational_impact: string | null;
  prior_instruction: string | null;
  prior_nte_refs: string[];
  submitted_at: string | null;
  created_at: string;
  evidence?: IrEvidence[];
};

type CatalogEntry = {
  code: string;
  category_code: string;
  title_en: string;
  title_ja: string;
  severity_class: string;
  input_layer: string;
  scope: string;
  sop_ref: string | null;
  auto_detectable: boolean;
  requires_hq_review: boolean;
  market?: string | null;
  definition_en?: string | null;
  acts_block_en?: string | null;
  threshold?: Record<string, unknown> | null;
  evidence_required?: Array<{ type: string; key: string; mandatory: boolean | string }> | null;
  legal_ground_ref?: string | null;
};

type NteV2Case = {
  id: string;
  nte_ref: string;
  market: string;
  store_code: string;
  staff_name: string;
  violation_code: string | null;
  severity_class: string | null;
  offense_count: number;
  proposed_penalty: string | null;
  status: string;
  reviewed_by: string | null;
  approved_by: string | null;
  decision_outcome: string | null;
  decided_by: string | null;
  incident_id: string | null;
  created_at: string;
  updated_at: string;
  response_deadline?: string | null;
  // SLA fields (from /sla overview endpoint)
  urgency?: "ok" | "warning" | "overdue" | "done";
  days_remaining?: number | null;
  next_deadline_type?: string | null;
  next_deadline_at?: string | null;
  all_deadlines?: Record<string, string | null>;
  audit_log?: Array<{
    id: number;
    actor_name: string;
    actor_role: string;
    action: string;
    from_status: string | null;
    to_status: string | null;
    payload: Record<string, unknown> | null;
    created_at: string;
  }>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return String(d).slice(0, 10);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function getRankingColor(total: number): string {
  if (total >= 3) return "text-red-400";
  if (total === 2) return "text-amber-400";
  return "text-blue-400";
}

function getRankingEmoji(total: number): string {
  if (total >= 3) return "🔴";
  if (total === 2) return "🟡";
  return "🔵";
}

function StatusDot({ status }: { status: NteStatus }) {
  if (status === "ACTIVE")
    return <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400 shrink-0" />;
  return <span className="inline-block h-2.5 w-2.5 rounded-full border border-zinc-500 shrink-0" />;
}

function NteStatusBadge({ status }: { status: NteStatus }) {
  if (status === "ACTIVE")
    return <span className={BADGE_ERROR}>ACTIVE</span>;
  return <span className={BADGE_SUCCESS}>Resolved</span>;
}

const CASE_TYPE_LABELS: Record<string, string> = {
  NTE: "NTE",
  WARNING_LETTER: "Warning",
  FINAL_WARNING: "Final Warning",
};

function CaseTypeBadge({ type }: { type: string }) {
  const label = CASE_TYPE_LABELS[type] ?? type ?? "NTE";
  const cls =
    type === "FINAL_WARNING"
      ? "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30"
      : type === "WARNING_LETTER"
      ? "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30"
      : "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30";
  return <span className={cls}>{label}</span>;
}

// ─── Staff Side Panel ─────────────────────────────────────────────────────────

function StaffHistoryPanel({
  staffName,
  ntes,
  onClose,
}: {
  staffName: string;
  ntes: NteRecord[];
  onClose: () => void;
}) {
  const staffNtes = ntes
    .filter((n) => n.staff_name === staffName)
    .sort((a, b) => b.issued_date.localeCompare(a.issued_date));

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-violet-400" />
            <span className={T_CARD_TITLE}>{staffName}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`${SMALL_BUTTON} flex items-center gap-1`}
          >
            <X className="h-4 w-4" /> Close
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 border-b border-white/10 p-4">
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>Total</p>
            <p className={KPI_VALUE}>{staffNtes.length}</p>
          </div>
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>Active</p>
            <p className={`${KPI_VALUE} ${staffNtes.filter((n) => n.status === "ACTIVE").length > 0 ? "text-red-400" : ""}`}>
              {staffNtes.filter((n) => n.status === "ACTIVE").length}
            </p>
          </div>
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>Resolved</p>
            <p className={KPI_VALUE}>{staffNtes.filter((n) => n.status === "RESOLVED").length}</p>
          </div>
        </div>

        {/* Notice list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {staffNtes.length === 0 && (
            <p className={T_BODY}>No notices on record.</p>
          )}
          {staffNtes.map((nte) => (
            <div key={nte.id} className={`${STATUS_CARD} p-4 space-y-2`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={T_CAPTION}>{fmtDate(nte.issued_date)}</span>
                  <CaseTypeBadge type={nte.case_type ?? "NTE"} />
                </div>
                <NteStatusBadge status={nte.status} />
              </div>
              <p className="text-sm text-white leading-relaxed">{nte.reason}</p>
              <p className={T_CAPTION}>Issued by: {nte.issued_by || "—"}</p>
              {nte.explanation_text && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                  <span className="font-semibold">Staff explanation: </span>
                  {nte.explanation_text}
                </div>
              )}
              {nte.status === "RESOLVED" && nte.resolved_at && (
                <p className={T_CAPTION}>
                  Resolved {fmtDate(nte.resolved_at)}
                  {nte.resolved_by ? ` by ${nte.resolved_by}` : ""}
                </p>
              )}
              {nte.suspension_triggered && (
                <span className={BADGE_ERROR}>Suspension triggered</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Template Modal ───────────────────────────────────────────────────────────

function TemplateModal({
  template,
  city,
  currentUser,
  onClose,
  onSaved,
  authHeaders,
}: {
  template: NteTemplate | null;
  city: string;
  currentUser: string;
  onClose: () => void;
  onSaved: () => void;
  authHeaders: () => Record<string, string>;
}) {
  const isEdit = Boolean(template);
  const [title, setTitle] = useState(template?.title || "");
  const [body, setBody] = useState(template?.body || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    setErr("");
    try {
      const h = authHeaders();
      if (isEdit && template) {
        const res = await fetch(`/api/admin/cases/templates/${template.id}`, {
          method: "PATCH",
          headers: { ...h, "Content-Type": "application/json" },
          body: JSON.stringify({ title, body }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        const res = await fetch(`/api/admin/cases/templates`, {
          method: "POST",
          headers: { ...h, "Content-Type": "application/json" },
          body: JSON.stringify({ city, title, body, created_by: currentUser }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className={`${GLASS_CARD} w-full max-w-lg p-6 space-y-4`}>
          <div className="flex items-center justify-between">
            <p className={T_SECTION}>{isEdit ? "Edit Template" : "Add Template"}</p>
            <button type="button" onClick={onClose} className={SMALL_BUTTON}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <label className={`${T_LABEL} mb-1 block`}>Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Repeated Tardiness"
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className={`${T_LABEL} mb-1 block`}>Body *</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Template content... Use {staff_name}, {date}, {issued_by} as placeholders."
              rows={6}
              className={`${TEXTAREA_CLASS} min-h-[120px]`}
            />
            <p className={`${T_CAPTION} mt-1`}>
              Available placeholders: {"{staff_name}"} {"{date}"} {"{issued_by}"}
            </p>
          </div>

          {err && (
            <p className="text-sm text-red-400 flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {err}
            </p>
          )}

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !title.trim() || !body.trim()}
              className={`${PRIMARY_BUTTON} flex items-center gap-2`}
            >
              {saving ? "Saving…" : "Save Template"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmployeeCasesPage() {
  const router = useRouter();
  const [accessReady, setAccessReady] = useState(false);
  const [city, setCity] = useState<"manila" | "dubai">("manila");
  const [currentUser, setCurrentUser] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState("");
  const [tab, setTab] = useState<PageTab>("board");

  // Data state
  const [ntes, setNtes] = useState<NteRecord[]>([]);
  const [ranking, setRanking] = useState<StaffRanking[]>([]);
  const [templates, setTemplates] = useState<NteTemplate[]>([]);
  const [requests, setRequests] = useState<NteRequest[]>([]);
  const [staffList, setStaffList] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Violation Catalog state
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogMarket, setCatalogMarket] = useState<"" | "AE" | "PH">("");
  const [catalogLoadMsg, setCatalogLoadMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // IR form state
  const [irList, setIrList] = useState<IrRecord[]>([]);
  const [irListLoading, setIrListLoading] = useState(false);
  const [irDraft, setIrDraft] = useState<IrRecord | null>(null);
  const [irFormOpen, setIrFormOpen] = useState(false);
  const [irFormError, setIrFormError] = useState("");
  const [irFormMsg, setIrFormMsg] = useState("");
  const [irSubmitting, setIrSubmitting] = useState(false);
  // IR form fields
  const [irStaffName, setIrStaffName] = useState("");
  const [irMarket, setIrMarket] = useState<"AE" | "PH">("PH");
  const [irStoreCode, setIrStoreCode] = useState("");
  const [irDate, setIrDate] = useState(todayStr());
  const [irTime, setIrTime] = useState("");
  const [irLocation, setIrLocation] = useState("");
  const [irProposedCode, setIrProposedCode] = useState("");
  const [irWitnesses, setIrWitnesses] = useState("");
  const [irObservedActs, setIrObservedActs] = useState("");
  const [irVerbatimQuote, setIrVerbatimQuote] = useState("");
  const [irOperationalImpact, setIrOperationalImpact] = useState("");
  const [irPriorInstruction, setIrPriorInstruction] = useState("");
  const [irBannedWords, setIrBannedWords] = useState<string[]>([]);
  // acts_block preview
  const [irActsPreview, setIrActsPreview] = useState<string | null>(null);
  const [irActsPreviewLoading, setIrActsPreviewLoading] = useState(false);
  const [irViolationSearch, setIrViolationSearch] = useState("");
  const [irViolationPickerOpen, setIrViolationPickerOpen] = useState(false);
  // Evidence form fields
  const [irEvidenceType, setIrEvidenceType] = useState("PHOTO");
  const [irEvidenceDesc, setIrEvidenceDesc] = useState("");
  const [irEvidenceRef, setIrEvidenceRef] = useState("");
  const [irAddingEvidence, setIrAddingEvidence] = useState(false);

  // Cases tab state (NTE v2)
  const [casesLoading, setCasesLoading] = useState(false);
  const [casesError, setCasesError] = useState("");
  const [casesList, setCasesList] = useState<NteV2Case[]>([]);
  const [casesNteRole, setCasesNteRole] = useState<string>("EMPLOYEE");
  const [casesSubmittedIrs, setCasesSubmittedIrs] = useState<IrRecord[]>([]);
  const [selectedCase, setSelectedCase] = useState<NteV2Case | null>(null);
  const [caseDetailLoading, setCaseDetailLoading] = useState(false);
  // Letter (P6)
  const [letterLoading, setLetterLoading] = useState(false);
  const [actsBlockEdit, setActsBlockEdit] = useState<string | null>(null);
  const [actsBlockSaving, setActsBlockSaving] = useState(false);
  // P8 Auto-detect
  const [autoDetectLoading, setAutoDetectLoading] = useState(false);
  const [autoDetectResult, setAutoDetectResult] = useState<Record<string, unknown> | null>(null);
  const [autoDetectMarket, setAutoDetectMarket] = useState<"" | "AE" | "PH">("");
  // P9 Catalog CRUD
  const [editTemplateOpen, setEditTemplateOpen] = useState(false);
  const [editTemplateCode, setEditTemplateCode] = useState("");
  const [editTemplateMarket, setEditTemplateMarket] = useState<"AE" | "PH" | "BOTH">("BOTH");
  const [editTemplateText, setEditTemplateText] = useState("");
  const [editTemplateSaving, setEditTemplateSaving] = useState(false);
  // Catalog preview modal
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [previewMarket, setPreviewMarket] = useState<"PH" | "AE">("PH");
  const [previewData, setPreviewData] = useState<{ raw: string; rendered: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  // Issue Notice — violation catalog picker
  const [issueViolationCode, setIssueViolationCode] = useState("");
  const [issueViolationPickerOpen, setIssueViolationPickerOpen] = useState(false);
  const [issueViolationSearch, setIssueViolationSearch] = useState("");
  const [issueTemplateLoading, setIssueTemplateLoading] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addItemForm, setAddItemForm] = useState({
    code: "", category_code: "", title_en: "", title_ja: "",
    severity_class: "B" as "A"|"B"|"C"|"D",
    input_layer: "L2_STRUCTURED" as "L1_AUTO"|"L2_STRUCTURED"|"L3_NARRATIVE",
    scope: "ALL", sop_ref: "", requires_hq_review: false,
    definition_en: "", legal_ground_ref_ae: "", legal_ground_ref_ph: "", acts_block_en: "",
  });
  const [addItemSaving, setAddItemSaving] = useState(false);
  const [addItemError, setAddItemError] = useState("");
  // IR Review modal
  const [reviewTarget, setReviewTarget] = useState<IrRecord | null>(null);
  const [reviewAction, setReviewAction] = useState<"reject" | "dismiss" | "confirm_violation">("reject");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewViolationCode, setReviewViolationCode] = useState("");
  const [reviewSeverity, setReviewSeverity] = useState<"A"|"B"|"C"|"D">("B");
  const [reviewPenalty, setReviewPenalty] = useState("");
  const [reviewOffenseCount, setReviewOffenseCount] = useState(1);
  const [reviewPickerOpen, setReviewPickerOpen] = useState(false);
  const [reviewPickerSearch, setReviewPickerSearch] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState("");
  // Offense history / penalty suggestion
  type EscalationStep = { offense: number; penalty: string };
  type PenaltySuggestion = {
    same_code_count: number;
    same_category_count: number;
    current_offense_number: number;
    proposed_penalty: string;
    severity_class: string;
    escalation_path: EscalationStep[];
    prior_cases: { nte_ref: string; violation_code: string; status: string; created_at: string }[];
  };
  const [penaltySuggestion, setPenaltySuggestion] = useState<PenaltySuggestion | null>(null);
  const [penaltyLoading, setPenaltyLoading] = useState(false);
  const [penaltyOverridden, setPenaltyOverridden] = useState(false);
  // Case transition modal
  const [transitionTarget, setTransitionTarget] = useState<NteV2Case | null>(null);
  const [transitionAction, setTransitionAction] = useState("");
  const [transitionPayload, setTransitionPayload] = useState<Record<string, string | number>>({});
  const [transitionSubmitting, setTransitionSubmitting] = useState(false);
  const [transitionError, setTransitionError] = useState("");

  // Board tab state
  const [panelStaff, setPanelStaff] = useState<string | null>(null);

  // NTE Request tab state
  const [reqStaffName, setReqStaffName] = useState("");
  const [reqReason, setReqReason] = useState("");
  const [reqDate, setReqDate] = useState(todayStr());
  const [reqCaseType, setReqCaseType] = useState<CaseType>("NTE");
  const [reqImage, setReqImage] = useState<File | null>(null);
  const [reqImagePreview, setReqImagePreview] = useState<string>("");
  const [submittingReq, setSubmittingReq] = useState(false);
  const reqImageRef = useRef<HTMLInputElement>(null);
  // Reject modal state
  const [rejectTarget, setRejectTarget] = useState<NteRequest | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejecting, setRejecting] = useState(false);

  // Issue Notice tab state
  const [issueStaffName, setIssueStaffName] = useState("");
  const [issueDate, setIssueDate] = useState(todayStr());
  const [issueIssuedBy, setIssueIssuedBy] = useState("");
  const [issueApprovedBy, setIssueApprovedBy] = useState("");
  const [issueCaseType, setIssueCaseType] = useState<CaseType>("NTE");
  const [issueUseTemplate, setIssueUseTemplate] = useState(false);
  const [issueTemplateId, setIssueTemplateId] = useState("");
  const [issueReason, setIssueReason] = useState("");
  const [issuing, setIssuing] = useState(false);

  // Case History tab state
  const [historyNameFilter, setHistoryNameFilter] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<"ALL" | "ACTIVE" | "RESOLVED">("ALL");

  // Templates tab state
  const [templateModal, setTemplateModal] = useState<{
    open: boolean;
    template: NteTemplate | null;
  }>({ open: false, template: null });

  // ── Auth init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const raw = getAuth();
      if (!raw?.accessToken) {
        router.replace("/login?next=/admin/employee-cases");
        return;
      }
      const resolved = (await refreshAuthFromApi(raw)) || raw;
      const role = String(resolved?.role || "").toUpperCase();
      const allowed = [
        "ADMIN",
        "HQ",
        "HR_MANAGER",
        "MANILA_MANAGEMENT",
        "MANILA_MANAGER",
      ].includes(role);
      if (!allowed) {
        router.replace("/week");
        return;
      }
      if (!cancelled) {
        setCity(
          String(resolved?.city || "manila").toLowerCase() === "dubai"
            ? "dubai"
            : "manila"
        );
        const name = resolved?.staffName || "";
        setCurrentUser(name);
        setIssueIssuedBy(name);
        setCurrentUserRole(role);
        setAccessReady(true);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // ── Auth headers helper ────────────────────────────────────────────────────
  const authHeaders = useCallback((): Record<string, string> => {
    const auth = getAuth();
    return getAuthHeaders(auth) as Record<string, string>;
  }, []);

  // ── Load data (POST only) ──────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const auth = getAuth();
    if (!auth?.accessToken) return;
    setLoading(true);
    setError("");

    try {
      const h = { ...authHeaders(), "Content-Type": "application/json" };

      // Main dashboard data
      const res = await fetch(`/api/admin/cases/data`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ city }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.detail || `HTTP ${res.status}`);
      }
      const data: DashboardData = await res.json();
      setNtes(Array.isArray(data.ntes) ? data.ntes : []);
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
      setRequests(Array.isArray(data.requests) ? data.requests : []);

      // Board ranking
      const boardRes = await fetch(`/api/admin/cases/board`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ city }),
      });
      if (boardRes.ok) {
        const boardData = await boardRes.json();
        setRanking(
          Array.isArray(boardData.ranking) ? boardData.ranking : []
        );
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [city, authHeaders]);

  useEffect(() => {
    if (accessReady) void loadData();
  }, [accessReady, city, loadData]);

  // ── Load staff list for dropdown ───────────────────────────────────────────
  useEffect(() => {
    if (!accessReady) return;
    const auth = getAuth();
    if (!auth?.accessToken) return;
    fetch(`/api/admin/staff_master/names?city=${city}&limit=300`, {
      headers: getAuthHeaders(auth) as Record<string, string>,
    })
      .then((r) => r.json())
      .then((d) => {
        const names: string[] = Array.isArray(d?.names)
          ? d.names
          : Array.isArray(d)
          ? d
          : [];
        setStaffList(names.sort());
      })
      .catch(() => {});
  }, [accessReady, city]);

  // ── Submit NTE Request ─────────────────────────────────────────────────────
  const handleSubmitRequest = async () => {
    if (!reqStaffName.trim() || !reqReason.trim()) return;
    setSubmittingReq(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch("/api/admin/cases/requests/submit", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          city,
          staff_name: reqStaffName.trim(),
          reason: reqReason.trim(),
          requested_by: currentUser,
          request_date: reqDate || todayStr(),
          case_type: reqCaseType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as any).detail || `HTTP ${res.status}`);
      const newReq: NteRequest = (data as any).request;

      // Upload image if selected
      if (reqImage && newReq?.id) {
        const form = new FormData();
        form.append("file", reqImage);
        await fetch(`/api/admin/cases/requests/${newReq.id}/upload-image`, {
          method: "POST",
          headers: authHeaders(),
          body: form,
        }).catch(() => {});
      }

      setSuccessMsg(`NTE request for ${reqStaffName} submitted. HR will review it.`);
      setReqStaffName("");
      setReqReason("");
      setReqDate(todayStr());
      setReqCaseType("NTE");
      setReqImage(null);
      setReqImagePreview("");
      if (reqImageRef.current) reqImageRef.current.value = "";
      await loadData();
    } catch (e: any) {
      setError(e?.message || "Failed to submit request");
    } finally {
      setSubmittingReq(false);
    }
  };

  // ── Approve / Reject Request ───────────────────────────────────────────────
  const handleApproveRequest = async (req: NteRequest) => {
    setError("");
    try {
      const res = await fetch(`/api/admin/cases/requests/${req.id}/approve`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSuccessMsg(`Request for ${req.staff_name} approved — moved to Pending Issuance.`);
      await loadData();
    } catch (e: any) {
      setError(e?.message || "Failed to approve");
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return;
    setRejecting(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/cases/requests/${rejectTarget.id}/reject`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ review_note: rejectNote }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSuccessMsg(`Request for ${rejectTarget.staff_name} rejected.`);
      setRejectTarget(null);
      setRejectNote("");
      await loadData();
    } catch (e: any) {
      setError(e?.message || "Failed to reject");
    } finally {
      setRejecting(false);
    }
  };

  // ── Issue from Pending ─────────────────────────────────────────────────────
  const handleIssueFromRequest = async (req: NteRequest) => {
    if (!window.confirm(`Issue NTE to ${req.staff_name}? This will create a formal NTE record.`)) return;
    setError("");
    try {
      const res = await fetch(`/api/admin/cases/requests/${req.id}/issue`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ issued_by: currentUser }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as any).detail || `HTTP ${res.status}`);
      const triggered = (data as any).suspension_triggered;
      setSuccessMsg(
        triggered
          ? `NTE issued to ${req.staff_name}. Suspension auto-created!`
          : `NTE issued to ${req.staff_name}. Visible in Case History.`
      );
      setTab("history");
      await loadData();
    } catch (e: any) {
      setError(e?.message || "Failed to issue");
    }
  };

  // Auto-clear success message
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(""), 5000);
    return () => clearTimeout(t);
  }, [successMsg]);

  // ── Template selection → auto-fill reason ─────────────────────────────────
  useEffect(() => {
    if (!issueUseTemplate || !issueTemplateId) {
      if (!issueUseTemplate) setIssueReason("");
      return;
    }
    const tpl = templates.find((t) => t.id === issueTemplateId);
    if (tpl) setIssueReason(tpl.body);
  }, [issueTemplateId, issueUseTemplate, templates]);

  // ── Issue Notice ───────────────────────────────────────────────────────────
  const handleIssueNte = async () => {
    if (!issueStaffName.trim() || !issueReason.trim() || !issueApprovedBy.trim()) return;
    setIssuing(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/admin/cases/create`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          city,
          staff_name: issueStaffName.trim(),
          reason: issueReason.trim(),
          issued_by: issueIssuedBy || currentUser,
          issued_date: issueDate || todayStr(),
          case_type: issueCaseType,
          approved_by: issueApprovedBy.trim(),
        }),
      });
      const resData = await res.json();
      if (!res.ok)
        throw new Error((resData as any).detail || `HTTP ${res.status}`);
      const msg = (resData as any).suspension_triggered
        ? `Notice issued to ${issueStaffName}. Suspension auto-created!`
        : `Notice issued to ${issueStaffName}. Active notices: ${(resData as any).active_nte_count ?? "—"}`;
      setSuccessMsg(msg);
      setIssueStaffName("");
      setIssueDate(todayStr());
      setIssueReason("");
      setIssueCaseType("NTE");
      setIssueApprovedBy("");
      setIssueUseTemplate(false);
      setIssueTemplateId("");
      setTab("board");
      await loadData();
    } catch (e: any) {
      setError(e?.message || "Failed to issue notice");
    } finally {
      setIssuing(false);
    }
  };

  // ── Close Case ─────────────────────────────────────────────────────────────
  const handleResolveNte = async (nteId: string, staffName: string) => {
    if (!window.confirm(`Close this case for ${staffName}?`)) return;
    setError("");
    try {
      const res = await fetch(
        `/api/admin/cases/${nteId}/close`,
        {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ resolved_by: currentUser }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSuccessMsg("Case closed.");
      await loadData();
    } catch (e: any) {
      setError(e?.message || "Failed to close case");
    }
  };

  // ── Delete NTE record ──────────────────────────────────────────────────────
  const handleDeleteNte = async (nteId: string, staffName: string) => {
    if (!window.confirm(`Permanently delete this NTE record for ${staffName}? This cannot be undone.`)) return;
    setError("");
    try {
      const res = await fetch(`/api/admin/cases/${nteId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).detail || `HTTP ${res.status}`);
      }
      setSuccessMsg("NTE record deleted.");
      await loadData();
    } catch (e: any) {
      setError(e?.message || "Failed to delete NTE record");
    }
  };

  // ── Delete template ────────────────────────────────────────────────────────
  const handleDeleteTemplate = async (id: string, title: string) => {
    if (!window.confirm(`Delete template "${title}"?`)) return;
    setError("");
    try {
      const res = await fetch(
        `/api/admin/cases/templates/${id}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSuccessMsg("Template deleted.");
      await loadData();
    } catch (e: any) {
      setError(e?.message || "Failed to delete template");
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────

  // How many active notices does issueStaffName currently have?
  const issueStaffActiveCount = issueStaffName.trim()
    ? ntes.filter(
        (n) =>
          n.staff_name.toLowerCase() === issueStaffName.trim().toLowerCase() &&
          n.status === "ACTIVE"
      ).length
    : 0;

  const willTriggerSuspension = issueStaffActiveCount >= 2; // 2 existing + 1 new = 3

  const filteredHistory = ntes
    .filter((n) => {
      const nameMatch = historyNameFilter
        ? n.staff_name.toLowerCase() === historyNameFilter.toLowerCase()
        : true;
      const statusMatch =
        historyStatusFilter === "ALL" ? true : n.status === historyStatusFilter;
      return nameMatch && statusMatch;
    })
    .sort((a, b) => b.issued_date.localeCompare(a.issued_date));

  // KPI values for display
  const totalActive = ntes.filter((n) => n.status === "ACTIVE").length;
  const totalNtes = ntes.length;
  const totalStaffAffected = new Set(ntes.map((n) => n.staff_name)).size;
  const pendingRequests = requests.filter((r) => r.status === "PENDING").length;
  const pendingIssuance = requests.filter((r) => r.status === "APPROVED").length;

  // HR visibility (can approve/reject)
  const isHR = ["ADMIN", "HQ", "HR_MANAGER"].includes(currentUserRole);
  // HQ visibility (catalog management)
  const isHQ = ["ADMIN", "HQ"].includes(currentUserRole);

  async function loadCatalog(market: "" | "AE" | "PH" = catalogMarket) {
    setCatalogLoading(true);
    setCatalogLoadMsg("");
    try {
      const auth = getAuth();
      const url = market
        ? `/api/admin/nte-v2/catalog?market=${market}`
        : "/api/admin/nte-v2/catalog";
      const res = await fetch(url, {
        headers: getAuthHeaders(auth) as Record<string, string>,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCatalog(data.catalog ?? []);
    } catch (e) {
      setCatalogLoadMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCatalogLoading(false);
    }
  }

  async function handleReloadSeed() {
    setCatalogLoading(true);
    setCatalogLoadMsg("");
    try {
      const auth = getAuth();
      const res = await fetch("/api/admin/nte-v2/catalog/load", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getAuthHeaders(auth) as Record<string, string>),
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCatalogLoadMsg(
        `Seed loaded: ${data.total_inserted} inserted, ${data.total_updated} updated, ${data.total_markets} market rows.`
      );
      await loadCatalog(catalogMarket);
    } catch (e) {
      setCatalogLoadMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCatalogLoading(false);
    }
  }

  // ── IR helpers ─────────────────────────────────────────────────────────────

  const BANNED_EN = ["always","never","lazy","attitude","unprofessional","disrespectful",
    "bad worker","rude","incompetent","useless","stupid","careless","habitually","constantly","repeatedly"];
  const BANNED_TL = ["palaging","lagi","tamad","walang kwenta","hindi marunong",
    "bastos","pasaway","suplado","matigas ang ulo"];

  function detectBannedWords(text: string): string[] {
    const lower = text.toLowerCase();
    return [...BANNED_EN, ...BANNED_TL].filter((t) => lower.includes(t));
  }

  function irInputLayer(): string {
    if (!irProposedCode) return "L3_NARRATIVE";
    const entry = catalog.find((c) => c.code === irProposedCode);
    return entry?.input_layer ?? "L3_NARRATIVE";
  }

  function irSelectedEntry(): CatalogEntry | null {
    if (!irProposedCode) return null;
    return catalog.find((c) => c.code === irProposedCode) ?? null;
  }

  async function fetchActsPreview(code: string, market: string) {
    if (!code) { setIrActsPreview(null); return; }
    setIrActsPreviewLoading(true);
    try {
      const auth = getAuth();
      const res = await fetch(`/api/admin/nte-v2/catalog/${code}/render?market=${market}`, {
        headers: getAuthHeaders(auth) as Record<string, string>,
      });
      if (!res.ok) { setIrActsPreview(null); return; }
      const data = await res.json() as { rendered?: string };
      setIrActsPreview(data.rendered ?? null);
    } catch {
      setIrActsPreview(null);
    } finally {
      setIrActsPreviewLoading(false);
    }
  }

  async function fetchCatalogPreview(code: string, market: "PH" | "AE") {
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      const auth = getAuth();
      const res = await fetch(`/api/admin/nte-v2/catalog/${code}/render?market=${market}`, {
        headers: getAuthHeaders(auth) as Record<string, string>,
      });
      if (!res.ok) return;
      const data = await res.json() as { raw?: string; rendered?: string };
      setPreviewData({ raw: data.raw ?? "", rendered: data.rendered ?? "" });
    } catch { /* silent */ } finally {
      setPreviewLoading(false);
    }
  }

  async function applyIssueViolationTemplate(code: string) {
    const market = city === "dubai" ? "AE" : "PH";
    setIssueTemplateLoading(true);
    try {
      const auth = getAuth();
      const res = await fetch(`/api/admin/nte-v2/catalog/${code}/render?market=${market}`, {
        headers: getAuthHeaders(auth) as Record<string, string>,
      });
      if (!res.ok) return;
      const data = await res.json() as { rendered?: string };
      setIssueReason(data.rendered ?? "");
      setIssueViolationCode(code);
      setIssueViolationPickerOpen(false);
      setIssueViolationSearch("");
    } catch { /* silent */ } finally {
      setIssueTemplateLoading(false);
    }
  }

  async function loadIrList() {
    setIrListLoading(true);
    try {
      const auth = getAuth();
      const res = await fetch("/api/admin/nte-v2/ir?limit=50", {
        headers: getAuthHeaders(auth) as Record<string, string>,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setIrList(data.irs ?? []);
    } catch (e) {
      setIrFormError(`Load error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIrListLoading(false);
    }
  }

  // ── Cases tab (NTE v2) ─────────────────────────────────────────────────────

  async function loadCasesTab() {
    setCasesLoading(true);
    setCasesError("");
    try {
      const auth = getAuth();
      const h = getAuthHeaders(auth) as Record<string, string>;
      // Use SLA overview endpoint — returns cases pre-sorted by urgency with SLA data
      const [casesRes, irsRes] = await Promise.all([
        fetch("/api/admin/nte-v2/sla?limit=100", { headers: h }),
        fetch("/api/admin/nte-v2/ir?status=IR_SUBMITTED&limit=100", { headers: h }),
      ]);
      if (!casesRes.ok) throw new Error(await casesRes.text());
      const casesData = await casesRes.json();
      setCasesList(casesData.cases ?? []);
      setCasesNteRole(casesData.your_nte_role ?? "EMPLOYEE");
      if (irsRes.ok) {
        const irsData = await irsRes.json();
        setCasesSubmittedIrs(
          (irsData.irs ?? []).filter((r: IrRecord) => r.status === "IR_SUBMITTED")
        );
      }
    } catch (e) {
      setCasesError(e instanceof Error ? e.message : String(e));
    } finally {
      setCasesLoading(false);
    }
  }

  async function loadCaseDetail(caseId: string) {
    setCaseDetailLoading(true);
    try {
      const auth = getAuth();
      const res = await fetch(`/api/admin/nte-v2/case/${caseId}`, {
        headers: getAuthHeaders(auth) as Record<string, string>,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSelectedCase(data.case);
    } catch {
      // silently ignore detail load errors
    } finally {
      setCaseDetailLoading(false);
    }
  }

  async function submitIrReview() {
    if (!reviewTarget) return;
    setReviewSubmitting(true);
    setReviewError("");
    try {
      const auth = getAuth();
      const body: Record<string, unknown> = {
        action: reviewAction,
        reviewer_note: reviewNote,
      };
      if (reviewAction === "confirm_violation") {
        if (!reviewViolationCode.trim()) { setReviewError("Violation code is required."); setReviewSubmitting(false); return; }
        if (!reviewPenalty.trim()) { setReviewError("Proposed penalty is required."); setReviewSubmitting(false); return; }
        body.violation_code = reviewViolationCode.trim();
        body.severity_class = reviewSeverity;
        body.proposed_penalty = reviewPenalty.trim();
        body.offense_count = reviewOffenseCount;
      }
      const res = await fetch(`/api/admin/nte-v2/ir/${reviewTarget.id}/review`, {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()) as Record<string, string>, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail || `HTTP ${res.status}`);
      }
      setReviewTarget(null);
      setReviewNote("");
      setReviewViolationCode("");
      setReviewPenalty("");
      setPenaltySuggestion(null);
      setPenaltyOverridden(false);
      void loadCasesTab();
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function fetchPenaltySuggestion(
    violationCode: string,
    staffName: string,
    market: string,
  ) {
    if (!violationCode || !staffName) return;
    setPenaltyLoading(true);
    setPenaltySuggestion(null);
    try {
      const auth = getAuth();
      const res = await fetch(
        `/api/admin/nte-v2/staff/${encodeURIComponent(staffName)}/offense-history?violation_code=${encodeURIComponent(violationCode)}&market=${market}`,
        { headers: getAuthHeaders(auth) as Record<string, string> },
      );
      if (!res.ok) return;
      const data = await res.json() as PenaltySuggestion;
      setPenaltySuggestion(data);
      if (!penaltyOverridden) {
        setReviewPenalty(data.proposed_penalty);
        setReviewOffenseCount(data.current_offense_number);
      }
    } catch { /* best-effort */ } finally {
      setPenaltyLoading(false);
    }
  }

  async function runAutoDetect(dryRun: boolean) {
    setAutoDetectLoading(true);
    setAutoDetectResult(null);
    try {
      const path = dryRun
        ? `/api/admin/nte-v2/auto-detect/preview${autoDetectMarket ? `?market=${autoDetectMarket}` : ""}`
        : `/api/admin/nte-v2/auto-detect/run`;
      const res = await fetch(path, {
        method: dryRun ? "GET" : "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        ...(dryRun ? {} : { body: JSON.stringify({ market: autoDetectMarket || null }) }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as Record<string, unknown>;
      setAutoDetectResult(data);
      if (!dryRun) void loadCasesTab();
    } catch (e) {
      alert(`Auto-detect failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAutoDetectLoading(false);
    }
  }

  function openEditTemplate(entry: CatalogEntry) {
    setEditTemplateCode(entry.code);
    setEditTemplateMarket((catalogMarket as "AE" | "PH" | "BOTH") || "BOTH");
    const text = entry.acts_block_en ?? "";
    setEditTemplateText(text);
    setEditTemplateOpen(true);
  }

  async function saveEditTemplate() {
    setEditTemplateSaving(true);
    try {
      const res = await fetch(`/api/admin/nte-v2/catalog/${editTemplateCode}/acts-block`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ market: editTemplateMarket, acts_block_en: editTemplateText }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditTemplateOpen(false);
      await loadCatalog(catalogMarket);
    } catch (e) {
      alert(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEditTemplateSaving(false);
    }
  }

  async function deleteCatalogItem(code: string) {
    if (!window.confirm(`Deactivate violation item "${code}"? It will no longer appear in the catalog or IR form.`)) return;
    try {
      const res = await fetch(`/api/admin/nte-v2/catalog/${code}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadCatalog(catalogMarket);
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function submitAddItem() {
    setAddItemSaving(true);
    setAddItemError("");
    try {
      const body = {
        code: addItemForm.code.trim().toUpperCase(),
        category_code: addItemForm.category_code,
        title_en: addItemForm.title_en.trim(),
        title_ja: addItemForm.title_ja.trim(),
        severity_class: addItemForm.severity_class,
        input_layer: addItemForm.input_layer,
        scope: addItemForm.scope,
        sop_ref: addItemForm.sop_ref.trim(),
        requires_hq_review: addItemForm.requires_hq_review,
        definition_en: addItemForm.definition_en.trim(),
        acts_block_en: addItemForm.acts_block_en.trim(),
        markets: {
          AE: { definition_en: addItemForm.definition_en.trim(), legal_ground_ref: addItemForm.legal_ground_ref_ae.trim() },
          PH: { definition_en: addItemForm.definition_en.trim(), legal_ground_ref: addItemForm.legal_ground_ref_ph.trim() },
        },
      };
      const res = await fetch("/api/admin/nte-v2/catalog/item", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      setAddItemOpen(false);
      setAddItemForm({
        code: "", category_code: "", title_en: "", title_ja: "",
        severity_class: "B", input_layer: "L2_STRUCTURED",
        scope: "ALL", sop_ref: "", requires_hq_review: false,
        definition_en: "", legal_ground_ref_ae: "", legal_ground_ref_ph: "", acts_block_en: "",
      });
      await loadCatalog(catalogMarket);
    } catch (e) {
      setAddItemError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddItemSaving(false);
    }
  }

  async function downloadNteLetter(caseId: string, nteRef: string) {
    setLetterLoading(true);
    try {
      const res = await fetch(`/api/admin/nte-v2/case/${caseId}/letter`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${nteRef}_NTE_Letter.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Letter generation failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLetterLoading(false);
    }
  }

  async function saveActsBlock(caseId: string) {
    if (actsBlockEdit === null) return;
    setActsBlockSaving(true);
    try {
      const res = await fetch(`/api/admin/nte-v2/case/${caseId}/letter/acts-block`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ acts_block: actsBlockEdit }),
      });
      if (!res.ok) throw new Error(await res.text());
      setActsBlockEdit(null);
    } catch (e) {
      alert(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActsBlockSaving(false);
    }
  }

  async function submitCaseTransition() {
    if (!transitionTarget || !transitionAction) return;
    setTransitionSubmitting(true);
    setTransitionError("");
    try {
      const auth = getAuth();
      const res = await fetch(`/api/admin/nte-v2/case/${transitionTarget.id}/transition`, {
        method: "POST",
        headers: { ...getAuthHeaders(auth) as Record<string, string>, "Content-Type": "application/json" },
        body: JSON.stringify({ action: transitionAction, ...transitionPayload }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail || `HTTP ${res.status}`);
      }
      setTransitionTarget(null);
      setTransitionAction("");
      setTransitionPayload({});
      if (selectedCase?.id === transitionTarget.id) {
        void loadCaseDetail(transitionTarget.id);
      }
      void loadCasesTab();
    } catch (e) {
      setTransitionError(e instanceof Error ? e.message : String(e));
    } finally {
      setTransitionSubmitting(false);
    }
  }

  async function handleCreateIrDraft() {
    if (!irStaffName.trim()) { setIrFormError("Staff name is required."); return; }
    if (!irDate) { setIrFormError("Incident date is required."); return; }
    setIrSubmitting(true);
    setIrFormError("");
    setIrFormMsg("");
    const layer = irInputLayer();
    const banned = layer === "L3_NARRATIVE"
      ? detectBannedWords(irObservedActs + " " + irOperationalImpact)
      : [];
    setIrBannedWords(banned);
    try {
      const auth = getAuth();
      const body: Record<string, unknown> = {
        market: irMarket,
        store_code: irStoreCode.trim() || city.slice(0, 3).toUpperCase(),
        staff_name: irStaffName.trim(),
        incident_date: irDate,
        incident_time: irTime || undefined,
        location_code: irLocation || undefined,
        proposed_code: irProposedCode || undefined,
        input_layer: layer,
        witness_names: irWitnesses.split(",").map((s) => s.trim()).filter(Boolean),
        observed_acts: irObservedActs || undefined,
        verbatim_quote: irVerbatimQuote || undefined,
        operational_impact: irOperationalImpact || undefined,
        prior_instruction: irPriorInstruction || undefined,
      };
      const res = await fetch("/api/admin/nte-v2/ir", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as any).detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const created: IrRecord = { ...data.ir, evidence: [] };
      setIrDraft(created);
      setIrFormMsg(`Draft created: ${data.ir_ref}`);
      await loadIrList();
    } catch (e: any) {
      setIrFormError(e?.message || "Failed to create draft");
    } finally {
      setIrSubmitting(false);
    }
  }

  async function handleSubmitIr() {
    if (!irDraft) return;
    setIrSubmitting(true);
    setIrFormError("");
    setIrFormMsg("");
    try {
      const auth = getAuth();
      const res = await fetch(`/api/admin/nte-v2/ir/${irDraft.id}/submit`, {
        method: "POST",
        headers: getAuthHeaders(auth) as Record<string, string>,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as any).detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setIrFormMsg(`IR submitted: ${irDraft.ir_ref} → ${data.status}`);
      setIrDraft({ ...irDraft, status: data.status });
      await loadIrList();
    } catch (e: any) {
      setIrFormError(e?.message || "Failed to submit IR");
    } finally {
      setIrSubmitting(false);
    }
  }

  async function handleAddEvidence() {
    if (!irDraft) return;
    if (!irEvidenceDesc.trim() && !irEvidenceRef.trim()) {
      setIrFormError("Provide a description or reference for the evidence.");
      return;
    }
    setIrAddingEvidence(true);
    setIrFormError("");
    try {
      const auth = getAuth();
      const res = await fetch(`/api/admin/nte-v2/ir/${irDraft.id}/evidence`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          evidence_type: irEvidenceType,
          description: irEvidenceDesc.trim(),
          file_path: irEvidenceRef.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as any).detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setIrDraft({
        ...irDraft,
        evidence: [...(irDraft.evidence ?? []), data.evidence],
      });
      setIrEvidenceDesc("");
      setIrEvidenceRef("");
    } catch (e: any) {
      setIrFormError(e?.message || "Failed to add evidence");
    } finally {
      setIrAddingEvidence(false);
    }
  }

  async function handleDeleteEvidence(evidenceId: string) {
    if (!irDraft) return;
    setIrFormError("");
    try {
      const auth = getAuth();
      const res = await fetch(
        `/api/admin/nte-v2/ir/${irDraft.id}/evidence/${evidenceId}`,
        { method: "DELETE", headers: getAuthHeaders(auth) as Record<string, string> }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setIrDraft({
        ...irDraft,
        evidence: (irDraft.evidence ?? []).filter((e) => e.id !== evidenceId),
      });
    } catch (e: any) {
      setIrFormError(e?.message || "Failed to delete evidence");
    }
  }

  function resetIrForm() {
    setIrFormOpen(false);
    setIrDraft(null);
    setIrStaffName("");
    setIrStoreCode("");
    setIrDate(todayStr());
    setIrTime("");
    setIrLocation("");
    setIrProposedCode("");
    setIrWitnesses("");
    setIrObservedActs("");
    setIrVerbatimQuote("");
    setIrOperationalImpact("");
    setIrPriorInstruction("");
    setIrBannedWords([]);
    setIrEvidenceDesc("");
    setIrEvidenceRef("");
    setIrFormError("");
    setIrFormMsg("");
    setIrActsPreview(null);
    setIrViolationPickerOpen(false);
    setIrViolationSearch("");
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Side panel */}
      {panelStaff && (
        <StaffHistoryPanel
          staffName={panelStaff}
          ntes={ntes}
          onClose={() => setPanelStaff(null)}
        />
      )}

      {/* Template modal */}
      {templateModal.open && (
        <TemplateModal
          template={templateModal.template}
          city={city}
          currentUser={currentUser}
          onClose={() => setTemplateModal({ open: false, template: null })}
          onSaved={async () => {
            setTemplateModal({ open: false, template: null });
            setSuccessMsg("Template saved.");
            await loadData();
          }}
          authHeaders={authHeaders}
        />
      )}

      {/* ── Page Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>Notice to Explain (NTE)</h2>
          <p className={`${T_BODY} mt-1`}>
            Issue and manage NTE notices, track case history, and apply corrective actions.
            3 active notices trigger an automatic suspension.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* City toggle */}
          <div className="flex overflow-hidden rounded-xl border border-white/10">
            {(["manila", "dubai"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCity(c)}
                className={[
                  "px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                  city === c
                    ? "bg-violet-600/70 text-white"
                    : "bg-white/5 text-zinc-400 hover:bg-white/10",
                ].join(" ")}
              >
                {c}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className={`${SECONDARY_BUTTON} flex items-center gap-1.5 text-sm`}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setTab("issue")}
            className={`${PRIMARY_BUTTON} flex items-center gap-1.5 text-sm`}
          >
            <FileText className="h-4 w-4" />
            Create Notice
          </button>
        </div>
      </div>

      {/* ── Feedback banners ── */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            className="ml-auto shrink-0"
          >
            <X className="h-4 w-4 opacity-60 hover:opacity-100" />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Active Notices</p>
          <p className={`${KPI_VALUE} ${totalActive > 0 ? "text-red-400" : ""}`}>
            {loading ? "—" : totalActive}
          </p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Total Notices</p>
          <p className={KPI_VALUE}>{loading ? "—" : totalNtes}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Pending Review</p>
          <p className={`${KPI_VALUE} ${pendingRequests > 0 ? "text-amber-400" : ""}`}>
            {loading ? "—" : pendingRequests}
          </p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Pending Issuance</p>
          <p className={`${KPI_VALUE} ${pendingIssuance > 0 ? "text-violet-400" : ""}`}>
            {loading ? "—" : pendingIssuance}
          </p>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className={TAB_CONTAINER}>
        {(
          [
            { id: "board",    label: "Staff Board" },
            { id: "request",  label: "NTE Request" },
            { id: "pending",  label: `Pending${pendingIssuance > 0 ? ` (${pendingIssuance})` : ""}` },
            { id: "issue",    label: "Issue Notice" },
            { id: "history",  label: "Case History" },
            { id: "templates",label: "Templates" },
            ...(isHQ ? [{ id: "catalog" as PageTab, label: "Violation Catalog" }] : []),
            ...(isHR ? [{ id: "ir" as PageTab, label: "New IR" }] : []),
            ...(isHR ? [{ id: "cases" as PageTab, label: "Case Queue" }] : []),
          ] as { id: PageTab; label: string }[]
        ).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              if (id === "catalog" && catalog.length === 0) void loadCatalog(catalogMarket);
              if (id === "ir") {
                void loadIrList();
                if (catalog.length === 0) void loadCatalog(catalogMarket);
              }
              if (id === "cases") void loadCasesTab();
            }}
            className={tab === id ? TAB_ACTIVE : TAB_INACTIVE}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Reject Modal ── */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className={`${GLASS_CARD} w-full max-w-md p-6 space-y-4`}>
            <p className={T_SECTION}>Reject NTE Request</p>
            <p className={T_BODY}>
              Request for <strong>{rejectTarget.staff_name}</strong> by {rejectTarget.requested_by}
            </p>
            <div>
              <label className={T_LABEL}>Reason for rejection (optional)</label>
              <textarea
                className={`${TEXTAREA_CLASS} mt-1`}
                rows={3}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="e.g. Insufficient evidence, please re-submit with documentation."
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className={SECONDARY_BUTTON}
                onClick={() => { setRejectTarget(null); setRejectNote(""); }}
                disabled={rejecting}
              >Cancel</button>
              <button
                type="button"
                className={DANGER_BUTTON}
                onClick={handleRejectConfirm}
                disabled={rejecting}
              >{rejecting ? "Rejecting…" : "Reject Request"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* Tab 1: Staff Board                                                  */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === "board" && (
        <div className="space-y-3">
          {loading && (
            <p className={T_BODY}>Loading board…</p>
          )}
          {!loading && ranking.length === 0 && (
            <div className={`${GLASS_CARD} p-6 text-center`}>
              <p className={T_BODY}>No NTE records for {city}.</p>
            </div>
          )}
          {ranking
            .slice()
            .sort((a, b) => b.total_count - a.total_count)
            .map((staff) => {
              const color = getRankingColor(staff.total_count);
              const emoji = getRankingEmoji(staff.total_count);
              // Build dot indicators for each notice: active = filled, resolved = outline
              const activeDots = Array.from({ length: staff.active_count }, (_, i) => (
                <StatusDot key={`a-${i}`} status="ACTIVE" />
              ));
              const resolvedDots = Array.from(
                { length: staff.resolved_count },
                (_, i) => <StatusDot key={`r-${i}`} status="RESOLVED" />
              );

              return (
                <div
                  key={`${staff.staff_name}-${staff.city}`}
                  className={`${GLASS_CARD} flex flex-wrap items-center gap-4 p-4`}
                >
                  {/* Count + Name */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${color}`}>
                        {emoji} [{staff.total_count}{staff.total_count === 1 ? " Notice" : " Notices"}]
                      </span>
                      <span className="text-base font-semibold text-white truncate">
                        {staff.staff_name}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={T_CAPTION}>
                        {staff.city.charAt(0).toUpperCase() + staff.city.slice(1)}
                        {staff.latest_issued_date
                          ? ` · Latest: ${fmtDate(staff.latest_issued_date)}`
                          : ""}
                      </span>
                    </div>
                    {/* Status dots */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {activeDots}
                      {resolvedDots}
                      {staff.has_suspension && (
                        <span className={`${BADGE_ERROR} ml-1`}>Suspension</span>
                      )}
                    </div>
                  </div>

                  {/* Action */}
                  <button
                    type="button"
                    onClick={() => setPanelStaff(staff.staff_name)}
                    className={`${SMALL_BUTTON} flex items-center gap-1.5 shrink-0`}
                  >
                    View History
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* Tab 2: NTE Request                                                  */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === "request" && (
        <div className="space-y-5">
          {/* Submit form */}
          <div className={`${GLASS_CARD} space-y-4 p-5`}>
            <p className={T_SECTION}>Submit NTE Request</p>
            <p className={`${T_BODY}`}>
              Request HR to issue a Notice to Explain. HR will review and approve before issuance.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={T_LABEL}>Staff Member *</label>
                <SelectDark
                  className={`${SELECT_CLASS} mt-1`}
                  value={reqStaffName}
                  onChange={setReqStaffName}
                  options={[
                    { value: "", label: "— Select staff —" },
                    ...staffList.map((name) => ({ value: name, label: name })),
                  ]}
                />
              </div>
              <div>
                <label className={T_LABEL}>Request Date</label>
                <input
                  type="date"
                  className={`${INPUT_CLASS} mt-1`}
                  value={reqDate}
                  onChange={(e) => setReqDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className={T_LABEL}>Document Type</label>
              <SelectDark
                className={`${SELECT_CLASS} mt-1`}
                value={reqCaseType}
                onChange={(v) => setReqCaseType(v as CaseType)}
                options={[
                  { value: "NTE", label: "NTE — Notice to Explain" },
                  { value: "WARNING_LETTER", label: "Warning Letter" },
                  { value: "FINAL_WARNING", label: "Final Warning" },
                ]}
              />
            </div>

            <div>
              <label className={T_LABEL}>Reason / Incident Description *</label>
              <textarea
                className={`${TEXTAREA_CLASS} mt-1`}
                rows={4}
                value={reqReason}
                onChange={(e) => setReqReason(e.target.value)}
                placeholder="Describe the incident or misconduct that warrants an NTE…"
              />
            </div>

            <div>
              <label className={T_LABEL}>Evidence Image (optional)</label>
              <div className="mt-1 flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  className={SECONDARY_BUTTON}
                  onClick={() => reqImageRef.current?.click()}
                >
                  {reqImage ? "Change Image" : "Upload Image"}
                </button>
                {reqImage && (
                  <span className={T_CAPTION}>{reqImage.name} ({(reqImage.size / 1024).toFixed(0)} KB)</span>
                )}
                <input
                  ref={reqImageRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setReqImage(f);
                    if (f && f.type.startsWith("image/")) {
                      const url = URL.createObjectURL(f);
                      setReqImagePreview(url);
                    } else {
                      setReqImagePreview("");
                    }
                  }}
                />
              </div>
              {reqImagePreview && (
                <img
                  src={reqImagePreview}
                  alt="preview"
                  className="mt-2 max-h-40 rounded-lg border border-white/10 object-contain"
                />
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                className={`${PRIMARY_BUTTON} flex items-center gap-2`}
                disabled={submittingReq || !reqStaffName || !reqReason.trim()}
                onClick={handleSubmitRequest}
              >
                {submittingReq ? "Submitting…" : "Submit Request"}
              </button>
            </div>
          </div>

          {/* HR Review section — only visible to HR roles */}
          {isHR && (
            <div className={`${GLASS_CARD} space-y-3 p-5`}>
              <p className={T_SECTION}>HR Review — Pending Requests</p>
              {requests.filter((r) => r.status === "PENDING").length === 0 ? (
                <p className={`${T_BODY} text-center py-4`}>No pending requests.</p>
              ) : (
                <div className="space-y-2">
                  {requests
                    .filter((r) => r.status === "PENDING")
                    .map((req) => (
                      <div
                        key={req.id}
                        className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4 space-y-2"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className={`${T_BODY} font-semibold`}>{req.staff_name}</p>
                            <p className={T_CAPTION}>
                              Requested by {req.requested_by} · {fmtDate(req.request_date)}
                            </p>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {req.image_url && (
                              <a
                                href={req.image_url}
                                target="_blank"
                                rel="noreferrer"
                                className={`${SMALL_BUTTON} flex items-center gap-1`}
                              >
                                <FileText className="h-3.5 w-3.5" /> Evidence
                              </a>
                            )}
                            <button
                              type="button"
                              className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
                              onClick={() => handleApproveRequest(req)}
                            >
                              ✓ Approve
                            </button>
                            <button
                              type="button"
                              className={`${DANGER_BUTTON} text-xs`}
                              onClick={() => { setRejectTarget(req); setRejectNote(""); }}
                            >
                              ✗ Reject
                            </button>
                          </div>
                        </div>
                        <p className={`${T_CAPTION} border-t border-white/5 pt-2`}>{req.reason}</p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* Tab 3: Pending Issuance                                             */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === "pending" && (
        <div className={`${GLASS_CARD} space-y-3 p-5`}>
          <p className={T_SECTION}>Pending Issuance</p>
          <p className={`${T_BODY}`}>
            Approved NTE requests awaiting formal issuance. Select and issue to add to Case History.
          </p>
          {requests.filter((r) => r.status === "APPROVED").length === 0 ? (
            <div className="py-8 text-center">
              <p className={T_BODY}>No approved requests pending issuance.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests
                .filter((r) => r.status === "APPROVED")
                .map((req) => (
                  <div
                    key={req.id}
                    className="rounded-xl border border-violet-500/30 bg-violet-950/10 p-4 space-y-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className={`${T_BODY} font-semibold text-violet-300`}>
                          {req.staff_name}
                        </p>
                        <p className={T_CAPTION}>
                          Requested by {req.requested_by} · {fmtDate(req.request_date)}
                        </p>
                        {req.reviewed_by && (
                          <p className={T_CAPTION}>
                            Approved by {req.reviewed_by}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {req.image_url && (
                          <a
                            href={req.image_url}
                            target="_blank"
                            rel="noreferrer"
                            className={`${SMALL_BUTTON} flex items-center gap-1`}
                          >
                            <FileText className="h-3.5 w-3.5" /> Evidence
                          </a>
                        )}
                        <button
                          type="button"
                          className={`${PRIMARY_BUTTON} flex items-center gap-2 text-sm`}
                          onClick={() => handleIssueFromRequest(req)}
                        >
                          <CheckCircle className="h-4 w-4" />
                          Issue NTE
                        </button>
                      </div>
                    </div>
                    <p className={`${T_CAPTION} border-t border-white/5 pt-2`}>{req.reason}</p>
                  </div>
                ))}
            </div>
          )}

          {/* Rejected requests (collapsible reference) */}
          {requests.filter((r) => r.status === "REJECTED").length > 0 && (
            <details className="mt-4">
              <summary className={`${T_CAPTION} cursor-pointer select-none`}>
                Rejected requests ({requests.filter((r) => r.status === "REJECTED").length})
              </summary>
              <div className="mt-2 space-y-2">
                {requests
                  .filter((r) => r.status === "REJECTED")
                  .map((req) => (
                    <div
                      key={req.id}
                      className="rounded-xl border border-zinc-700/30 bg-zinc-900/20 p-3 opacity-60"
                    >
                      <p className={`${T_CAPTION} font-semibold`}>{req.staff_name}</p>
                      <p className={T_CAPTION}>
                        By {req.requested_by} · {fmtDate(req.request_date)}
                        {req.reviewed_by && ` · Rejected by ${req.reviewed_by}`}
                      </p>
                      {req.review_note && (
                        <p className={`${T_CAPTION} mt-1 italic`}>&ldquo;{req.review_note}&rdquo;</p>
                      )}
                    </div>
                  ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* Tab 4: Issue Notice                                                 */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === "issue" && (
        <div className={`${GLASS_CARD} space-y-5 p-5`}>
          <p className={T_SECTION}>Issue Notice to Explain</p>

          {/* Warning if this will trigger suspension */}
          {willTriggerSuspension && issueStaffName.trim() && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-950/20 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <p className="text-sm text-red-300">
                <span className="font-semibold">{issueStaffName.trim()}</span> already
                has {issueStaffActiveCount} active notice{issueStaffActiveCount !== 1 ? "s" : ""}.
                Issuing this will trigger an automatic enforcement action.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Staff Name */}
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Staff Name *</label>
              <SelectDark
                value={issueStaffName}
                onChange={setIssueStaffName}
                className={SELECT_CLASS}
                options={[
                  { value: "", label: "— Select staff —" },
                  ...staffList.map((name) => ({ value: name, label: name })),
                ]}
              />
            </div>
            {/* Date */}
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Issue Date</label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            {/* Issued By */}
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Issued By</label>
              <input
                value={issueIssuedBy}
                onChange={(e) => setIssueIssuedBy(e.target.value)}
                placeholder="HR staff name"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {/* Approved By */}
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Approved By <span className="text-red-400">*</span></label>
            <input
              value={issueApprovedBy}
              onChange={(e) => setIssueApprovedBy(e.target.value)}
              placeholder="Name of manager or HQ who approved this notice"
              className={INPUT_CLASS}
            />
          </div>

          {/* Document Type */}
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Document Type</label>
            <SelectDark
              value={issueCaseType}
              onChange={(v) => setIssueCaseType(v as CaseType)}
              className={SELECT_CLASS}
              options={[
                { value: "NTE", label: "NTE — Notice to Explain" },
                { value: "WARNING_LETTER", label: "Warning Letter" },
                { value: "FINAL_WARNING", label: "Final Warning" },
              ]}
            />
          </div>

          {/* Violation Catalog picker */}
          <div>
            <p className={`${T_LABEL} mb-2`}>Fill from Violation Catalog</p>
            {issueViolationCode ? (
              <div className="flex items-center gap-2 rounded-lg border border-violet-500/40 bg-violet-950/30 px-3 py-2">
                <BookOpen className="h-4 w-4 shrink-0 text-violet-400" />
                <span className="text-sm font-mono text-violet-300 font-medium">{issueViolationCode}</span>
                {catalog.find((c) => c.code === issueViolationCode) && (
                  <span className="text-sm text-zinc-300 truncate">
                    — {catalog.find((c) => c.code === issueViolationCode)!.title_en}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => { setIssueViolationCode(""); setIssueReason(""); }}
                  className="ml-auto text-xs text-zinc-500 hover:text-red-400 shrink-0"
                >
                  ✕ clear
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (catalog.length === 0) void loadCatalog();
                  setIssueViolationPickerOpen(true);
                }}
                className="flex items-center gap-2 rounded-lg border border-zinc-600 bg-zinc-800/50 px-4 py-2 text-sm text-zinc-300 hover:border-violet-500/50 hover:text-violet-300 transition-colors"
              >
                <BookOpen className="h-4 w-4" />
                Select violation &amp; auto-fill reason…
              </button>
            )}
            {issueTemplateLoading && (
              <p className="mt-1 text-xs text-zinc-400">Loading template…</p>
            )}
          </div>

          {/* Reason / Content */}
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>
              Reason / Content *
            </label>
            <textarea
              value={issueReason}
              onChange={(e) => setIssueReason(e.target.value)}
              placeholder="Describe the violation in detail…"
              rows={5}
              className={`${TEXTAREA_CLASS} min-h-[100px]`}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleIssueNte()}
              disabled={
                issuing ||
                !issueStaffName.trim() ||
                !issueReason.trim() ||
                !issueApprovedBy.trim()
              }
              className={`${PRIMARY_BUTTON} flex items-center gap-2`}
            >
              <FileText className="h-4 w-4" />
              {issuing ? "Issuing…" : "Issue Notice"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIssueStaffName("");
                setIssueDate(todayStr());
                setIssueReason("");
                setIssueIssuedBy("");
                setIssueApprovedBy("");
                setIssueUseTemplate(false);
                setIssueTemplateId("");
                setIssueViolationCode("");
                setIssueViolationSearch("");
              }}
              className={SECONDARY_BUTTON}
            >
              Clear
            </button>
          </div>

          {/* ── Violation Catalog Picker Modal ── */}
          {issueViolationPickerOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className={`${GLASS_CARD} w-full max-w-2xl space-y-4 p-6 max-h-[80vh] flex flex-col`}>
                <div className="flex items-center justify-between">
                  <h3 className={`${T_SECTION} flex items-center gap-2`}>
                    <BookOpen className="h-5 w-5 text-violet-400" />
                    Select Violation
                  </h3>
                  <button type="button" onClick={() => { setIssueViolationPickerOpen(false); setIssueViolationSearch(""); }} className="text-zinc-400 hover:text-white">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <input
                  autoFocus
                  value={issueViolationSearch}
                  onChange={(e) => setIssueViolationSearch(e.target.value)}
                  placeholder="Search by code or title…"
                  className={INPUT_CLASS}
                />
                <div className="overflow-y-auto flex-1 space-y-1 pr-1">
                  {catalogLoading && <p className="text-sm text-zinc-400 py-4 text-center">Loading catalog…</p>}
                  {!catalogLoading && catalog
                    .filter((c) => {
                      const q = issueViolationSearch.toLowerCase();
                      return !q || c.code.toLowerCase().includes(q) || c.title_en.toLowerCase().includes(q);
                    })
                    .map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => void applyIssueViolationTemplate(c.code)}
                        className="w-full text-left rounded-lg px-3 py-2.5 hover:bg-zinc-700/60 transition-colors group"
                      >
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-xs text-violet-400 shrink-0 w-20">{c.code}</span>
                          <span className="text-sm text-zinc-200 group-hover:text-white">{c.title_en}</span>
                          <span className={`ml-auto text-xs shrink-0 px-1.5 py-0.5 rounded ${
                            c.severity_class === "SERIOUS" ? "bg-orange-950/60 text-orange-300" :
                            c.severity_class === "GROSS" ? "bg-red-950/60 text-red-300" :
                            "bg-zinc-800 text-zinc-400"
                          }`}>{c.severity_class}</span>
                        </div>
                      </button>
                    ))
                  }
                  {!catalogLoading && catalog.filter((c) => {
                    const q = issueViolationSearch.toLowerCase();
                    return !q || c.code.toLowerCase().includes(q) || c.title_en.toLowerCase().includes(q);
                  }).length === 0 && (
                    <p className="text-sm text-zinc-500 py-4 text-center">No violations match your search.</p>
                  )}
                </div>
                <p className="text-xs text-zinc-500">Selecting a violation will render the template and fill the Reason field.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* Tab 3: Case History                                                 */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === "history" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[180px]">
              <SelectDark
                value={historyNameFilter}
                onChange={setHistoryNameFilter}
                className={SELECT_CLASS}
                options={[
                  { value: "", label: "— All staff —" },
                  ...staffList.map((name) => ({ value: name, label: name })),
                ]}
              />
            </div>
            <div className="min-w-[140px]">
              <SelectDark
                value={historyStatusFilter}
                onChange={(v) =>
                  setHistoryStatusFilter(
                    v as "ALL" | "ACTIVE" | "RESOLVED"
                  )
                }
                className={SELECT_CLASS}
                options={[
                  { value: "ALL", label: "All Status" },
                  { value: "ACTIVE", label: "Active" },
                  { value: "RESOLVED", label: "Resolved" },
                ]}
              />
            </div>
          </div>

          {/* Table */}
          <div className={`${GLASS_CARD} overflow-x-auto`}>
            {loading ? (
              <p className={`${T_BODY} p-5`}>Loading case history…</p>
            ) : filteredHistory.length === 0 ? (
              <p className={`${T_BODY} p-5 text-center`}>No NTE records.</p>
            ) : (
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr>
                    <th className={`${TABLE_HEADER} px-4 pt-4 pb-2 text-left`}>Date</th>
                    <th className={`${TABLE_HEADER} px-4 pt-4 pb-2 text-left`}>Type</th>
                    <th className={`${TABLE_HEADER} px-4 pt-4 pb-2 text-left`}>Staff Name</th>
                    <th className={`${TABLE_HEADER} px-4 pt-4 pb-2 text-left`}>Reason</th>
                    <th className={`${TABLE_HEADER} px-4 pt-4 pb-2 text-left`}>Issued By</th>
                    <th className={`${TABLE_HEADER} px-4 pt-4 pb-2 text-left`}>Approved By</th>
                    <th className={`${TABLE_HEADER} px-4 pt-4 pb-2 text-left`}>Explanation</th>
                    <th className={`${TABLE_HEADER} px-4 pt-4 pb-2 text-left`}>Status</th>
                    <th className={`${TABLE_HEADER} px-4 pt-4 pb-2 text-left`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((nte) => (
                    <tr key={nte.id} className={TABLE_ROW}>
                      <td className={`${TABLE_CELL} px-4 font-mono text-xs text-zinc-300`}>
                        {fmtDate(nte.issued_date)}
                      </td>
                      <td className={`${TABLE_CELL} px-4`}>
                        <CaseTypeBadge type={nte.case_type} />
                      </td>
                      <td className={`${TABLE_CELL} px-4 font-medium text-white`}>
                        {nte.staff_name}
                      </td>
                      <td className={`${TABLE_CELL} px-4 max-w-xs`}>
                        <span
                          className="block truncate text-zinc-300"
                          title={nte.reason}
                        >
                          {nte.reason}
                        </span>
                      </td>
                      <td className={`${TABLE_CELL} px-4 text-zinc-400`}>
                        {nte.issued_by || "—"}
                      </td>
                      <td className={`${TABLE_CELL} px-4 text-zinc-400`}>
                        {nte.approved_by || "—"}
                      </td>
                      <td className={`${TABLE_CELL} px-4`}>
                        {nte.explanation_text ? (
                          <span
                            className="block max-w-[180px] truncate text-xs text-emerald-400"
                            title={nte.explanation_text}
                          >
                            ✓ {nte.explanation_text}
                          </span>
                        ) : (
                          <span className={T_CAPTION}>—</span>
                        )}
                      </td>
                      <td className={`${TABLE_CELL} px-4`}>
                        <NteStatusBadge status={nte.status} />
                        {nte.suspension_triggered && (
                          <span className={`${BADGE_ERROR} ml-1.5`}>
                            Suspension
                          </span>
                        )}
                      </td>
                      <td className={`${TABLE_CELL} px-4`}>
                        <div className="flex items-center gap-1.5">
                          {nte.status === "ACTIVE" && (
                            <button
                              type="button"
                              onClick={() =>
                                void handleResolveNte(nte.id, nte.staff_name)
                              }
                              className={`${SMALL_BUTTON} flex items-center gap-1`}
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              Close
                            </button>
                          )}
                          {nte.status === "RESOLVED" && (
                            <span className={T_CAPTION}>
                              {nte.resolved_at ? fmtDate(nte.resolved_at) : "—"}
                            </span>
                          )}
                          {["ADMIN", "HQ"].includes(currentUserRole) && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteNte(nte.id, nte.staff_name)}
                              className="flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Delete record"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* Tab 4: Templates                                                    */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === "templates" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                setTemplateModal({ open: true, template: null })
              }
              className={`${PRIMARY_BUTTON} flex items-center gap-2 text-sm`}
            >
              <Plus className="h-4 w-4" />
              Add Template
            </button>
          </div>

          {loading && <p className={T_BODY}>Loading templates…</p>}

          {!loading && templates.length === 0 && (
            <div className={`${GLASS_CARD} p-8 text-center`}>
              <FileText className="mx-auto mb-2 h-8 w-8 text-zinc-600" />
              <p className={T_BODY}>No templates yet. Create one to speed up notice issuance.</p>
            </div>
          )}

          <div className="space-y-3">
            {templates.map((tpl) => (
              <div key={tpl.id} className={`${GLASS_CARD} flex flex-col gap-2 p-4 sm:flex-row sm:items-start`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="h-4 w-4 shrink-0 text-violet-400" />
                    <span className={T_CARD_TITLE}>{tpl.title}</span>
                  </div>
                  <p className="line-clamp-2 text-sm text-zinc-400 leading-relaxed">
                    {tpl.body}
                  </p>
                  <p className={`${T_CAPTION} mt-1`}>
                    Created by {tpl.created_by || "—"} · {fmtDate(tpl.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setTemplateModal({ open: true, template: tpl })
                    }
                    className={`${SMALL_BUTTON} flex items-center gap-1`}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleDeleteTemplate(tpl.id, tpl.title)
                    }
                    className={`${DANGER_BUTTON} flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Violation Catalog (HQ only) ── */}
      {tab === "catalog" && isHQ && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className={T_LABEL}>Market:</label>
              <SelectDark
                value={catalogMarket}
                onChange={(v) => {
                  const m = v as "" | "AE" | "PH";
                  setCatalogMarket(m);
                  void loadCatalog(m);
                }}
                options={[
                  { value: "", label: "All" },
                  { value: "AE", label: "Dubai (AE)" },
                  { value: "PH", label: "Manila (PH)" },
                ]}
                placeholder="All"
                className="text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadCatalog(catalogMarket)}
                disabled={catalogLoading}
                className={`${SMALL_BUTTON} flex items-center gap-1`}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${catalogLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void handleReloadSeed()}
                disabled={catalogLoading}
                className={`${PRIMARY_BUTTON} flex items-center gap-2 text-sm`}
              >
                <RotateCcw className="h-4 w-4" />
                Reload Seed
              </button>
              <button
                type="button"
                onClick={() => { setAddItemError(""); setAddItemOpen(true); }}
                className={`${SECONDARY_BUTTON} flex items-center gap-2 text-sm`}
              >
                <Plus className="h-4 w-4" />
                Add Violation
              </button>
            </div>
          </div>

          {catalogLoadMsg && (
            <div className={`${GLASS_CARD} p-3 text-sm ${catalogLoadMsg.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
              {catalogLoadMsg}
            </div>
          )}

          {catalogLoading && <p className={T_BODY}>Loading catalog…</p>}

          {!catalogLoading && catalog.length === 0 && (
            <div className={`${GLASS_CARD} p-8 text-center`}>
              <BookOpen className="mx-auto mb-2 h-8 w-8 text-zinc-600" />
              <p className={T_BODY}>No violation catalog entries. Click &quot;Reload Seed&quot; to load the built-in ATT catalog.</p>
            </div>
          )}

          {/* ── Auto-Detect Batch (P8) ── */}
          <div className={`${GLASS_CARD} p-4 space-y-3`}>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-violet-400" />
              <span className="font-semibold text-sm text-white">Auto-Detect Batch</span>
              <span className="text-xs text-zinc-500">Scans attendance data and creates DRAFT IRs where thresholds are breached</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className={T_LABEL}>Market:</label>
                <SelectDark
                  value={autoDetectMarket}
                  onChange={(v) => setAutoDetectMarket(v as "" | "AE" | "PH")}
                  options={[
                    { value: "", label: "Both (AE + PH)" },
                    { value: "AE", label: "Dubai (AE)" },
                    { value: "PH", label: "Manila (PH)" },
                  ]}
                  placeholder="Both"
                  className="text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => void runAutoDetect(true)}
                disabled={autoDetectLoading}
                className={`${SMALL_BUTTON} flex items-center gap-1`}
              >
                <Eye className="h-3.5 w-3.5" />
                Preview (dry run)
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm("Run auto-detect and create DRAFT IRs for all threshold breaches?")) return;
                  void runAutoDetect(false);
                }}
                disabled={autoDetectLoading}
                className={`${PRIMARY_BUTTON} flex items-center gap-2 text-sm`}
              >
                <Zap className={`h-4 w-4 ${autoDetectLoading ? "animate-pulse" : ""}`} />
                {autoDetectLoading ? "Scanning…" : "Run Auto-Detect"}
              </button>
            </div>

            {autoDetectResult && (
              <div className="space-y-2 pt-1">
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="text-emerald-400 font-semibold">
                    {(autoDetectResult as {created?: number}).created ?? 0} IR{(autoDetectResult as {created?: number}).created === 1 ? "" : "s"} {(autoDetectResult as {dry_run?: boolean}).dry_run ? "would be created" : "created"}
                  </span>
                  <span className="text-zinc-400">
                    {(autoDetectResult as {skipped_dedup?: number}).skipped_dedup ?? 0} skipped (duplicate)
                  </span>
                  <span className="text-zinc-500 text-xs">as of {(autoDetectResult as {as_of?: string}).as_of}</span>
                </div>
                {((autoDetectResult as {details?: unknown[]}).details ?? []).length > 0 && (
                  <div className="overflow-x-auto max-h-48 overflow-y-auto rounded border border-zinc-700/50">
                    <table className="w-full min-w-[500px] text-xs">
                      <thead className="sticky top-0 bg-zinc-900">
                        <tr>
                          <th className="px-3 py-1.5 text-left text-zinc-400">Market</th>
                          <th className="px-3 py-1.5 text-left text-zinc-400">Staff</th>
                          <th className="px-3 py-1.5 text-left text-zinc-400">Code</th>
                          <th className="px-3 py-1.5 text-right text-zinc-400">Incidents</th>
                          <th className="px-3 py-1.5 text-left text-zinc-400">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {((autoDetectResult as {details?: {market: string; staff_name: string; violation_code: string; incidents_count: number; action: string; ir_id: string | null}[]}).details ?? []).map((d, i) => (
                          <tr key={i} className={`border-t border-zinc-800 ${d.action === "SKIP_DEDUP" ? "opacity-40" : ""}`}>
                            <td className="px-3 py-1 font-mono text-violet-400">{d.market}</td>
                            <td className="px-3 py-1 text-white">{d.staff_name}</td>
                            <td className="px-3 py-1 font-mono text-zinc-300">{d.violation_code}</td>
                            <td className="px-3 py-1 text-right text-zinc-300">{d.incidents_count}</td>
                            <td className="px-3 py-1">
                              <span className={`px-1.5 py-0.5 rounded text-xs ${
                                d.action === "CREATED" ? "bg-emerald-900/50 text-emerald-300" :
                                d.action === "DRY_RUN" ? "bg-blue-900/50 text-blue-300" :
                                "bg-zinc-800 text-zinc-500"
                              }`}>{d.action}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {catalog.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm border-collapse">
                <thead>
                  <tr className={TABLE_HEADER}>
                    <th className={`${TABLE_CELL} text-left`}>Code</th>
                    <th className={`${TABLE_CELL} text-left`}>Title</th>
                    <th className={`${TABLE_CELL} text-center`}>Severity</th>
                    <th className={`${TABLE_CELL} text-center`}>Layer</th>
                    <th className={`${TABLE_CELL} text-center`}>Auto</th>
                    <th className={`${TABLE_CELL} text-center`}>HQ Review</th>
                    {catalogMarket && <th className={`${TABLE_CELL} text-left`}>Legal Ref</th>}
                    <th className={`${TABLE_CELL} text-center`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.map((entry) => (
                    <tr key={entry.code} className={TABLE_ROW}>
                      <td className={`${TABLE_CELL} font-mono font-semibold text-violet-400`}>{entry.code}</td>
                      <td className={TABLE_CELL}>
                        <p className="font-medium">{entry.title_en}</p>
                        <p className="text-xs text-zinc-500">{entry.title_ja}</p>
                        {catalogMarket && entry.definition_en && (
                          <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{entry.definition_en}</p>
                        )}
                      </td>
                      <td className={`${TABLE_CELL} text-center`}>
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                          entry.severity_class === "D" ? "bg-red-900/60 text-red-300" :
                          entry.severity_class === "C" ? "bg-orange-900/60 text-orange-300" :
                          entry.severity_class === "B" ? "bg-yellow-900/60 text-yellow-300" :
                          "bg-zinc-800 text-zinc-300"
                        }`}>
                          {entry.severity_class}
                        </span>
                      </td>
                      <td className={`${TABLE_CELL} text-center font-mono text-xs`}>{entry.input_layer}</td>
                      <td className={`${TABLE_CELL} text-center`}>
                        {entry.auto_detectable
                          ? <CheckCircle className="inline h-4 w-4 text-emerald-400" />
                          : <X className="inline h-4 w-4 text-zinc-500" />}
                      </td>
                      <td className={`${TABLE_CELL} text-center`}>
                        {entry.requires_hq_review
                          ? <AlertTriangle className="inline h-4 w-4 text-amber-400" />
                          : <span className="text-zinc-600">—</span>}
                      </td>
                      {catalogMarket && (
                        <td className={`${TABLE_CELL} text-xs text-zinc-400 max-w-[200px]`}>
                          {entry.legal_ground_ref ?? "—"}
                        </td>
                      )}
                      <td className={`${TABLE_CELL} text-center`}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            title="Preview Template"
                            onClick={() => {
                              const mkt = catalogMarket || "PH";
                              setPreviewCode(entry.code);
                              setPreviewMarket(mkt as "PH" | "AE");
                              void fetchCatalogPreview(entry.code, mkt as "PH" | "AE");
                            }}
                            className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-cyan-300 transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Edit Template"
                            onClick={() => openEditTemplate(entry)}
                            className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-violet-300 transition-colors"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Deactivate"
                            onClick={() => void deleteCatalogItem(entry.code)}
                            className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Edit Template Modal ── */}
          {editTemplateOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className={`${GLASS_CARD} w-full max-w-2xl space-y-4 p-6`}>
                <div className="flex items-center justify-between">
                  <h3 className={T_CARD_TITLE}>Edit NTE Template — <span className="font-mono text-violet-400">{editTemplateCode}</span></h3>
                  <button type="button" onClick={() => setEditTemplateOpen(false)} className="text-zinc-400 hover:text-white">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <label className={T_LABEL}>Apply to market:</label>
                  <SelectDark
                    value={editTemplateMarket}
                    onChange={(v) => setEditTemplateMarket(v as "AE" | "PH" | "BOTH")}
                    options={[
                      { value: "BOTH", label: "Both (AE + PH)" },
                      { value: "AE", label: "Dubai (AE) only" },
                      { value: "PH", label: "Manila (PH) only" },
                    ]}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className={`${T_LABEL} block mb-1`}>
                    acts_block_en template
                    <span className="ml-2 text-zinc-500 font-normal text-xs">Handlebars syntax supported: {"{{field}}"}, {"{{#each items}}…{{/each}}"}, {"{{#if flag}}…{{/if}}"}</span>
                  </label>
                  {!catalogMarket && !editTemplateText && (
                    <p className="mb-1 text-xs text-amber-400">Switch the catalog to AE or PH market filter to load the current template text.</p>
                  )}
                  <textarea
                    value={editTemplateText}
                    onChange={(e) => setEditTemplateText(e.target.value)}
                    rows={14}
                    className={`${TEXTAREA_CLASS} font-mono text-xs w-full`}
                    placeholder="Enter the acts_block_en template text…"
                  />
                  <p className="mt-1 text-xs text-zinc-500">{editTemplateText.length} chars</p>
                </div>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setEditTemplateOpen(false)} className={SECONDARY_BUTTON}>Cancel</button>
                  <button
                    type="button"
                    onClick={() => void saveEditTemplate()}
                    disabled={editTemplateSaving || !editTemplateText.trim()}
                    className={`${PRIMARY_BUTTON} flex items-center gap-2`}
                  >
                    {editTemplateSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    {editTemplateSaving ? "Saving…" : "Save Template"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Add New Violation Modal ── */}
          {addItemOpen && (
            <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
              <div className={`${GLASS_CARD} w-full max-w-2xl space-y-4 p-6 my-8`}>
                <div className="flex items-center justify-between">
                  <h3 className={T_CARD_TITLE}>Add New Violation</h3>
                  <button type="button" onClick={() => setAddItemOpen(false)} className="text-zinc-400 hover:text-white">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {addItemError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{addItemError}</div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`${T_LABEL} block mb-1`}>Code <span className="text-red-400">*</span> <span className="font-normal text-zinc-500">(e.g. PERF-003)</span></label>
                    <input
                      className={INPUT_CLASS}
                      value={addItemForm.code}
                      onChange={(e) => setAddItemForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                      placeholder="XXX-NNN"
                    />
                  </div>
                  <div>
                    <label className={`${T_LABEL} block mb-1`}>Category Code <span className="text-red-400">*</span></label>
                    <SelectDark
                      value={addItemForm.category_code}
                      onChange={(v) => setAddItemForm(f => ({ ...f, category_code: v }))}
                      options={[
                        { value: "", label: "— select —" },
                        ...Array.from(new Set(catalog.map(c => c.category_code))).sort().map(cc => ({
                          value: cc,
                          label: cc + " — " + (catalog.find(c => c.category_code === cc)?.title_en.split(" ")[0] ?? ""),
                        })),
                      ]}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className={`${T_LABEL} block mb-1`}>Title (EN) <span className="text-red-400">*</span></label>
                    <input className={INPUT_CLASS} value={addItemForm.title_en} onChange={(e) => setAddItemForm(f => ({ ...f, title_en: e.target.value }))} placeholder="Violation title in English" />
                  </div>
                  <div className="col-span-2">
                    <label className={`${T_LABEL} block mb-1`}>Title (JA) <span className="text-zinc-500 font-normal">optional</span></label>
                    <input className={INPUT_CLASS} value={addItemForm.title_ja} onChange={(e) => setAddItemForm(f => ({ ...f, title_ja: e.target.value }))} placeholder="日本語タイトル（任意）" />
                  </div>
                  <div>
                    <label className={`${T_LABEL} block mb-1`}>Severity <span className="text-red-400">*</span></label>
                    <SelectDark
                      value={addItemForm.severity_class}
                      onChange={(v) => setAddItemForm(f => ({ ...f, severity_class: v as "A"|"B"|"C"|"D" }))}
                      options={[
                        { value: "A", label: "A — Minor" },
                        { value: "B", label: "B — Moderate" },
                        { value: "C", label: "C — Serious" },
                        { value: "D", label: "D — Grave" },
                      ]}
                    />
                  </div>
                  <div>
                    <label className={`${T_LABEL} block mb-1`}>Input Layer</label>
                    <SelectDark
                      value={addItemForm.input_layer}
                      onChange={(v) => setAddItemForm(f => ({ ...f, input_layer: v as "L1_AUTO"|"L2_STRUCTURED"|"L3_NARRATIVE" }))}
                      options={[
                        { value: "L2_STRUCTURED", label: "L2 — Structured" },
                        { value: "L3_NARRATIVE", label: "L3 — Narrative" },
                      ]}
                    />
                  </div>
                  <div>
                    <label className={`${T_LABEL} block mb-1`}>SOP Ref</label>
                    <input className={INPUT_CLASS} value={addItemForm.sop_ref} onChange={(e) => setAddItemForm(f => ({ ...f, sop_ref: e.target.value }))} placeholder="HR-SOP-XX §X.X" />
                  </div>
                  <div>
                    <label className={`${T_LABEL} block mb-1`}>Scope</label>
                    <SelectDark
                      value={addItemForm.scope}
                      onChange={(v) => setAddItemForm(f => ({ ...f, scope: v }))}
                      options={[
                        { value: "ALL", label: "ALL" },
                        { value: "AE", label: "AE only" },
                        { value: "PH", label: "PH only" },
                      ]}
                    />
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="addItemHqReview"
                      checked={addItemForm.requires_hq_review}
                      onChange={(e) => setAddItemForm(f => ({ ...f, requires_hq_review: e.target.checked }))}
                      className="h-4 w-4 rounded accent-violet-500"
                    />
                    <label htmlFor="addItemHqReview" className={T_LABEL}>Requires HQ Review</label>
                  </div>
                  <div className="col-span-2">
                    <label className={`${T_LABEL} block mb-1`}>Definition (EN) — used for both AE &amp; PH</label>
                    <textarea className={`${TEXTAREA_CLASS} text-sm`} rows={3} value={addItemForm.definition_en} onChange={(e) => setAddItemForm(f => ({ ...f, definition_en: e.target.value }))} placeholder="What constitutes this offense?" />
                  </div>
                  <div>
                    <label className={`${T_LABEL} block mb-1`}>Legal Ground Ref (AE)</label>
                    <input className={INPUT_CLASS} value={addItemForm.legal_ground_ref_ae} onChange={(e) => setAddItemForm(f => ({ ...f, legal_ground_ref_ae: e.target.value }))} placeholder="UAE Federal Decree-Law No. 33 of 2021, Art. XX" />
                  </div>
                  <div>
                    <label className={`${T_LABEL} block mb-1`}>Legal Ground Ref (PH)</label>
                    <input className={INPUT_CLASS} value={addItemForm.legal_ground_ref_ph} onChange={(e) => setAddItemForm(f => ({ ...f, legal_ground_ref_ph: e.target.value }))} placeholder="Labor Code of the Philippines, Art. 297(x)" />
                  </div>
                  <div className="col-span-2">
                    <label className={`${T_LABEL} block mb-1`}>
                      NTE Template (acts_block_en)
                      <span className="ml-2 font-normal text-zinc-500 text-xs">Handlebars: {"{{field}}"}, {"{{#each items}}"}, {"{{#if flag}}"}</span>
                    </label>
                    <textarea className={`${TEXTAREA_CLASS} font-mono text-xs`} rows={6} value={addItemForm.acts_block_en} onChange={(e) => setAddItemForm(f => ({ ...f, acts_block_en: e.target.value }))} placeholder="Describe the observed acts. Use {{placeholders}} for dynamic fields." />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setAddItemOpen(false)} className={SECONDARY_BUTTON}>Cancel</button>
                  <button
                    type="button"
                    onClick={() => void submitAddItem()}
                    disabled={addItemSaving || !addItemForm.code || !addItemForm.category_code || !addItemForm.title_en}
                    className={`${PRIMARY_BUTTON} flex items-center gap-2`}
                  >
                    {addItemSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {addItemSaving ? "Creating…" : "Create Violation"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Catalog Preview Modal ── */}
          {previewCode && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className={`${GLASS_CARD} w-full max-w-2xl space-y-4 p-6 max-h-[80vh] flex flex-col`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className={`${T_SECTION} flex items-center gap-2`}>
                      <Eye className="h-5 w-5 text-cyan-400" />
                      Template Preview
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {previewCode} — market: {previewMarket}
                    </p>
                  </div>
                  <button type="button" onClick={() => { setPreviewCode(null); setPreviewData(null); }} className="text-zinc-400 hover:text-white">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {previewLoading && (
                  <p className="text-sm text-zinc-400 py-8 text-center">Loading preview…</p>
                )}

                {!previewLoading && previewData && (
                  <div className="flex-1 overflow-y-auto space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Rendered Text</p>
                      <div className="rounded-lg bg-zinc-900/60 border border-zinc-700 p-4 text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
                        {previewData.rendered || <span className="text-zinc-500 italic">No rendered output</span>}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Raw Template (Handlebars)</p>
                      <div className="rounded-lg bg-zinc-950/80 border border-zinc-800 p-4 text-xs text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed">
                        {previewData.raw || <span className="text-zinc-600 italic">No raw template</span>}
                      </div>
                    </div>
                  </div>
                )}

                {!previewLoading && !previewData && (
                  <p className="text-sm text-zinc-500 py-8 text-center">No preview data available.</p>
                )}

                <div className="flex justify-between items-center pt-2 border-t border-zinc-700">
                  <div className="flex gap-2">
                    {(["PH", "AE"] as const).map((mkt) => (
                      <button
                        key={mkt}
                        type="button"
                        onClick={() => {
                          setPreviewMarket(mkt);
                          void fetchCatalogPreview(previewCode!, mkt);
                        }}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          previewMarket === mkt
                            ? "bg-violet-600 text-white"
                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                        }`}
                      >
                        {mkt === "PH" ? "Philippines" : "UAE"}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => openEditTemplate(catalog.find((c) => c.code === previewCode)!)}
                    className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
                  >
                    <Edit2 className="h-3 w-3" /> Edit Template
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* Tab: New IR (Incident Report)                                       */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === "ir" && (
        <div className="space-y-4">

          {/* Feedback */}
          {irFormError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{irFormError}</span>
              <button type="button" onClick={() => setIrFormError("")} className="ml-auto shrink-0">
                <X className="h-4 w-4 opacity-60 hover:opacity-100" />
              </button>
            </div>
          )}
          {irFormMsg && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              <CheckCircle className="h-4 w-4 shrink-0" />
              {irFormMsg}
            </div>
          )}

          {/* Banned words warning */}
          {irBannedWords.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300 space-y-1">
              <p className="font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Evaluative language detected — please revise
              </p>
              <p className="text-xs text-amber-400">
                Terms found: {irBannedWords.join(", ")}
              </p>
              <p className="text-xs text-amber-300/80">
                Write only specific, observable acts with time, place, and direct quotes. Avoid judgments or character assessments.
              </p>
            </div>
          )}

          {/* Section header + toggle */}
          <div className="flex items-center justify-between">
            <h3 className={T_SECTION}>Create Incident Report</h3>
            <button
              type="button"
              onClick={() => {
                if (irDraft) { resetIrForm(); } else { setIrFormOpen((v) => !v); }
              }}
              className={`${irFormOpen || irDraft ? SECONDARY_BUTTON : PRIMARY_BUTTON} flex items-center gap-1.5 text-sm`}
            >
              {irDraft ? (
                <><X className="h-4 w-4" /> Cancel / Reset</>
              ) : irFormOpen ? (
                <><X className="h-4 w-4" /> Cancel</>
              ) : (
                <><Plus className="h-4 w-4" /> New IR</>
              )}
            </button>
          </div>

          {/* ── Draft created: show detail + evidence ── */}
          {irDraft && (
            <div className={`${GLASS_CARD} space-y-4 p-5`}>
              {/* IR summary header */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm font-bold text-violet-400">{irDraft.ir_ref}</span>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                  irDraft.status === "IR_SUBMITTED" ? "bg-emerald-900/60 text-emerald-300" :
                  irDraft.status === "DRAFT" ? "bg-zinc-800 text-zinc-300" :
                  "bg-amber-900/60 text-amber-300"
                }`}>{irDraft.status}</span>
                <span className={T_CAPTION}>{irDraft.staff_name} · {irDraft.market} · {irDraft.incident_date}</span>
                <span className="ml-auto font-mono text-xs text-zinc-500">{irDraft.input_layer}</span>
              </div>

              {/* Evidence section */}
              {irDraft.status === "DRAFT" && (
                <div className="space-y-3">
                  <p className={T_LABEL}>
                    Evidence
                    {irDraft.input_layer === "L3_NARRATIVE" && (
                      <span className="ml-2 text-xs text-amber-400">
                        {(irDraft.witness_names?.length ?? 0) === 0
                          ? "Min 2 required (no witnesses)"
                          : "Min 1 required"}
                      </span>
                    )}
                  </p>

                  {/* Existing evidence */}
                  {(irDraft.evidence ?? []).length > 0 && (
                    <div className="space-y-1.5">
                      {(irDraft.evidence ?? []).map((ev) => (
                        <div key={ev.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
                          <span className="font-mono text-xs text-zinc-500">{ev.evidence_type}</span>
                          <span className="flex-1 text-zinc-300 truncate">{ev.description || ev.file_path || "—"}</span>
                          <button
                            type="button"
                            onClick={() => void handleDeleteEvidence(ev.id)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add evidence form */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                    <div>
                      <label className={T_LABEL}>Type</label>
                      <SelectDark
                        value={irEvidenceType}
                        onChange={setIrEvidenceType}
                        options={[
                          { value: "PHOTO", label: "Photo" },
                          { value: "CCTV_REF", label: "CCTV Ref" },
                          { value: "DOCUMENT", label: "Document" },
                          { value: "WITNESS_STATEMENT", label: "Witness Statement" },
                          { value: "OS_LOG", label: "System Log" },
                        ]}
                      />
                    </div>
                    <div>
                      <label className={T_LABEL}>Description</label>
                      <input
                        className={`${INPUT_CLASS} mt-1`}
                        value={irEvidenceDesc}
                        onChange={(e) => setIrEvidenceDesc(e.target.value)}
                        placeholder="e.g. CCTV cam 3, 14:30"
                      />
                    </div>
                    <div>
                      <label className={T_LABEL}>File path / reference</label>
                      <input
                        className={`${INPUT_CLASS} mt-1`}
                        value={irEvidenceRef}
                        onChange={(e) => setIrEvidenceRef(e.target.value)}
                        placeholder="Optional URL or ref"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAddEvidence()}
                    disabled={irAddingEvidence}
                    className={`${SECONDARY_BUTTON} flex items-center gap-1.5 text-sm`}
                  >
                    <Plus className="h-4 w-4" />
                    {irAddingEvidence ? "Adding…" : "Add Evidence"}
                  </button>
                </div>
              )}

              {/* Submit button (L3 validation summary) */}
              {irDraft.status === "DRAFT" && (
                <div className="border-t border-white/10 pt-4 space-y-2">
                  {irDraft.input_layer === "L3_NARRATIVE" && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      <div className={`rounded px-2 py-1 ${(irDraft.observed_acts?.length ?? 0) >= 120 ? "bg-emerald-900/30 text-emerald-300" : "bg-red-900/30 text-red-300"}`}>
                        Observed Acts: {irDraft.observed_acts?.length ?? 0}/120
                      </div>
                      <div className={`rounded px-2 py-1 ${(irDraft.operational_impact?.length ?? 0) >= 60 ? "bg-emerald-900/30 text-emerald-300" : "bg-red-900/30 text-red-300"}`}>
                        Impact: {irDraft.operational_impact?.length ?? 0}/60
                      </div>
                      <div className={`rounded px-2 py-1 ${(irDraft.evidence?.length ?? 0) >= ((irDraft.witness_names?.length ?? 0) === 0 ? 2 : 1) ? "bg-emerald-900/30 text-emerald-300" : "bg-red-900/30 text-red-300"}`}>
                        Evidence: {irDraft.evidence?.length ?? 0} file(s)
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSubmitIr()}
                    disabled={irSubmitting}
                    className={`${PRIMARY_BUTTON} flex items-center gap-2`}
                  >
                    <ChevronRight className="h-4 w-4" />
                    {irSubmitting ? "Submitting…" : "Submit IR"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── New IR form (before draft created) ── */}
          {!irDraft && irFormOpen && (
            <div className={`${GLASS_CARD} space-y-4 p-5`}>
              {/* Row 1: Staff + Market + Store */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={T_LABEL}>Staff Name *</label>
                  <input
                    className={`${INPUT_CLASS} mt-1`}
                    list="ir-staff-list"
                    value={irStaffName}
                    onChange={(e) => setIrStaffName(e.target.value)}
                    placeholder="Type staff name…"
                  />
                  <datalist id="ir-staff-list">
                    {staffList.map((n) => <option key={n} value={n} />)}
                  </datalist>
                </div>
                <div>
                  <label className={T_LABEL}>Market *</label>
                  <SelectDark
                    value={irMarket}
                    onChange={(v) => {
                      const m = v as "AE" | "PH";
                      setIrMarket(m);
                      if (irProposedCode) void fetchActsPreview(irProposedCode, m);
                    }}
                    options={[
                      { value: "PH", label: "PH (Philippines)" },
                      { value: "AE", label: "AE (Dubai)" },
                    ]}
                  />
                </div>
                <div>
                  <label className={T_LABEL}>Store Code</label>
                  <input
                    className={`${INPUT_CLASS} mt-1`}
                    value={irStoreCode}
                    onChange={(e) => setIrStoreCode(e.target.value.toUpperCase())}
                    placeholder="e.g. EWC"
                    maxLength={8}
                  />
                </div>
              </div>

              {/* Row 2: Violation Picker + Date + Time */}
              {/* ── Violation selector ── */}
              <div className="space-y-2">
                <label className={T_LABEL}>Violation *</label>
                {/* Trigger button */}
                <button
                  type="button"
                  onClick={() => setIrViolationPickerOpen((v) => !v)}
                  className={`${INPUT_CLASS} w-full text-left flex items-center justify-between`}
                >
                  {irProposedCode ? (
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-violet-400 text-xs">{irProposedCode}</span>
                      <span className="text-sm truncate">{irSelectedEntry()?.title_en}</span>
                    </span>
                  ) : (
                    <span className="text-zinc-500 text-sm">— Select violation —</span>
                  )}
                  <ChevronRight className={`h-4 w-4 text-zinc-500 transition-transform ${irViolationPickerOpen ? "rotate-90" : ""}`} />
                </button>

                {/* Picker panel */}
                {irViolationPickerOpen && (
                  <div className="rounded-xl border border-white/10 bg-zinc-900 shadow-xl overflow-hidden">
                    {/* Search */}
                    <div className="p-2 border-b border-white/10">
                      <input
                        autoFocus
                        className={`${INPUT_CLASS} text-sm`}
                        placeholder="Search code or title…"
                        value={irViolationSearch}
                        onChange={(e) => setIrViolationSearch(e.target.value)}
                      />
                    </div>
                    {/* Grouped list */}
                    <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
                      {(() => {
                        const q = irViolationSearch.toLowerCase();
                        const filtered = catalog
                          .filter((c) => c.code !== "MGT-004")
                          .filter((c) => !q || c.code.toLowerCase().includes(q) || c.title_en.toLowerCase().includes(q));
                        const groups = [...new Set(filtered.map((c) => c.category_code))];
                        if (filtered.length === 0) return (
                          <p className="px-4 py-6 text-center text-sm text-zinc-500">No matches</p>
                        );
                        return groups.map((cat) => (
                          <div key={cat}>
                            <div className="px-3 py-1.5 text-[10px] font-bold tracking-widest text-zinc-500 bg-zinc-800/60 uppercase">{cat}</div>
                            {filtered.filter((c) => c.category_code === cat).map((entry) => (
                              <button
                                key={entry.code}
                                type="button"
                                onClick={() => {
                                  setIrProposedCode(entry.code);
                                  setIrViolationPickerOpen(false);
                                  setIrViolationSearch("");
                                  setIrActsPreview(null);
                                  void fetchActsPreview(entry.code, irMarket);
                                }}
                                className={`w-full text-left px-3 py-2.5 hover:bg-white/5 flex items-start gap-3 transition-colors ${irProposedCode === entry.code ? "bg-violet-500/10" : ""}`}
                              >
                                <span className="font-mono text-[11px] text-violet-400 mt-0.5 shrink-0 w-16">{entry.code}</span>
                                <span className="flex-1 min-w-0">
                                  <span className="block text-sm text-zinc-200 leading-snug">{entry.title_en}</span>
                                  <span className="flex gap-1.5 mt-0.5">
                                    <span className={`inline-block px-1.5 py-0 rounded text-[10px] font-mono font-semibold ${
                                      entry.severity_class === "D" ? "bg-red-900/50 text-red-300" :
                                      entry.severity_class === "C" ? "bg-orange-900/50 text-orange-300" :
                                      entry.severity_class === "B" ? "bg-amber-900/50 text-amber-300" :
                                      "bg-zinc-700 text-zinc-300"}`}>{entry.severity_class}</span>
                                    <span className="inline-block px-1.5 py-0 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400">{entry.input_layer}</span>
                                    {entry.code === "CON-015" && (
                                      <span className="inline-block px-1.5 py-0 rounded text-[10px] font-semibold bg-red-900/60 text-red-300">CODI only</span>
                                    )}
                                    {entry.requires_hq_review && (
                                      <span className="inline-block px-1.5 py-0 rounded text-[10px] bg-violet-900/50 text-violet-300">HQ review</span>
                                    )}
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        ));
                      })()}
                    </div>
                    {/* Footer: clear */}
                    {irProposedCode && (
                      <div className="border-t border-white/10 px-3 py-2">
                        <button type="button" onClick={() => { setIrProposedCode(""); setIrActsPreview(null); setIrViolationPickerOpen(false); }} className="text-xs text-zinc-500 hover:text-zinc-300">Clear selection</button>
                      </div>
                    )}
                  </div>
                )}

                {/* Selected violation info card */}
                {irProposedCode && (() => {
                  const entry = irSelectedEntry();
                  if (!entry) return null;
                  const isCODI = entry.code === "CON-015";
                  return (
                    <div className={`rounded-xl border px-4 py-3 space-y-1.5 ${isCODI ? "border-red-500/40 bg-red-950/20" : "border-white/10 bg-white/5"}`}>
                      {isCODI ? (
                        <>
                          <p className="flex items-center gap-2 text-sm font-semibold text-red-300">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            CODI Referral Required — Sexual Harassment
                          </p>
                          <p className="text-xs text-red-300/80">
                            Cases of sexual harassment must NOT proceed through the standard NTE flow.
                            Refer immediately to the CODI (Committee on Decorum and Investigation).
                            Do not issue an NTE or create an IR for CON-015.
                          </p>
                          <p className="text-xs text-zinc-400">
                            Action: Submit a written report to HR Manager / HQ. CODI will be convened within 3 working days.
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs text-violet-400">{entry.code}</span>
                            <span className={`px-1.5 py-0 rounded text-[10px] font-mono font-semibold ${
                              entry.severity_class === "D" ? "bg-red-900/50 text-red-300" :
                              entry.severity_class === "C" ? "bg-orange-900/50 text-orange-300" :
                              entry.severity_class === "B" ? "bg-amber-900/50 text-amber-300" :
                              "bg-zinc-700 text-zinc-300"}`}>Severity {entry.severity_class}</span>
                            <span className="px-1.5 py-0 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400">{entry.input_layer}</span>
                            {entry.requires_hq_review && <span className="px-1.5 py-0 rounded text-[10px] bg-violet-900/50 text-violet-300">HQ review required</span>}
                            {entry.sop_ref && <span className="text-[10px] text-zinc-500">SOP: {entry.sop_ref}</span>}
                          </div>
                          {entry.definition_en && (
                            <p className="text-xs text-zinc-400 leading-relaxed">{entry.definition_en}</p>
                          )}
                          {entry.input_layer === "L1_AUTO" && (
                            <p className="text-xs text-emerald-400/80">
                              Auto-detected violation — the letter body will be generated from OS attendance data. No narrative required.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* acts_block preview */}
                {irProposedCode && irProposedCode !== "CON-015" && (
                  <div>
                    <p className={`${T_LABEL} mb-1`}>Letter Body Preview <span className="text-[10px] text-zinc-500">(sample data — actual content will reflect real incident data)</span></p>
                    {irActsPreviewLoading ? (
                      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-500 animate-pulse">Loading preview…</div>
                    ) : irActsPreview ? (
                      <pre className="rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-48 overflow-y-auto font-mono">{irActsPreview}</pre>
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-zinc-500">Preview not available for this violation.</div>
                    )}
                  </div>
                )}
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={T_LABEL}>Incident Date *</label>
                  <input
                    type="date"
                    className={`${INPUT_CLASS} mt-1`}
                    value={irDate}
                    max={todayStr()}
                    onChange={(e) => setIrDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className={T_LABEL}>Incident Time</label>
                  <input
                    type="time"
                    step="900"
                    className={`${INPUT_CLASS} mt-1`}
                    value={irTime}
                    onChange={(e) => setIrTime(e.target.value)}
                  />
                </div>
              </div>

              {/* Row 3: Location + Witnesses */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={T_LABEL}>Location</label>
                  <SelectDark
                    value={irLocation}
                    onChange={setIrLocation}
                    options={[
                      { value: "", label: "— Select location —" },
                      { value: "KITCHEN", label: "Kitchen" },
                      { value: "HALL", label: "Hall" },
                      { value: "CASHIER", label: "Cashier" },
                      { value: "BACK_OFFICE", label: "Back Office" },
                      { value: "DELIVERY_AREA", label: "Delivery Area" },
                      { value: "CENTRAL_KITCHEN", label: "Central Kitchen" },
                      { value: "WAREHOUSE", label: "Warehouse" },
                      { value: "OTHER", label: "Other" },
                    ]}
                  />
                </div>
                <div>
                  <label className={T_LABEL}>Witnesses (comma-separated names, leave blank if none)</label>
                  <input
                    className={`${INPUT_CLASS} mt-1`}
                    value={irWitnesses}
                    onChange={(e) => setIrWitnesses(e.target.value)}
                    placeholder="e.g. Maria Santos, Juan dela Cruz"
                  />
                  {irWitnesses === "" && irProposedCode && irInputLayer() === "L3_NARRATIVE" && (
                    <p className="mt-1 text-xs text-amber-400">No witnesses → 2 evidence files required</p>
                  )}
                </div>
              </div>

              {/* Narrative fields — L2_STRUCTURED + L3_NARRATIVE */}
              {(irInputLayer() === "L3_NARRATIVE" || irInputLayer() === "L2_STRUCTURED") && (
                <>
                  <div>
                    <label className={T_LABEL}>
                      Observed Acts *
                      {irInputLayer() === "L3_NARRATIVE" && (
                        <span className={`ml-2 font-mono ${irObservedActs.length >= 120 ? "text-emerald-400" : "text-red-400"}`}>
                          {irObservedActs.length}/120
                        </span>
                      )}
                    </label>
                    <textarea
                      className={`${TEXTAREA_CLASS} mt-1`}
                      rows={4}
                      value={irObservedActs}
                      onChange={(e) => {
                        setIrObservedActs(e.target.value);
                        setIrBannedWords(detectBannedWords(e.target.value + " " + irOperationalImpact));
                      }}
                      placeholder="Describe only what you directly observed: time, place, exact actions or words."
                    />
                  </div>

                  <div>
                    <label className={T_LABEL}>Verbatim Quote (if applicable)</label>
                    <input
                      className={`${INPUT_CLASS} mt-1`}
                      value={irVerbatimQuote}
                      onChange={(e) => setIrVerbatimQuote(e.target.value)}
                      placeholder="Exact words spoken, in the original language"
                    />
                  </div>

                  <div>
                    <label className={T_LABEL}>
                      Operational Impact *
                      {irInputLayer() === "L3_NARRATIVE" && (
                        <span className={`ml-2 font-mono ${irOperationalImpact.length >= 60 ? "text-emerald-400" : "text-red-400"}`}>
                          {irOperationalImpact.length}/60
                        </span>
                      )}
                    </label>
                    <textarea
                      className={`${TEXTAREA_CLASS} mt-1`}
                      rows={3}
                      value={irOperationalImpact}
                      onChange={(e) => {
                        setIrOperationalImpact(e.target.value);
                        setIrBannedWords(detectBannedWords(irObservedActs + " " + e.target.value));
                      }}
                      placeholder="How did this affect operations, customers, or team?"
                    />
                  </div>

                  <div>
                    <label className={T_LABEL}>Prior Instructions / Warnings (optional)</label>
                    <textarea
                      className={`${TEXTAREA_CLASS} mt-1`}
                      rows={2}
                      value={irPriorInstruction}
                      onChange={(e) => setIrPriorInstruction(e.target.value)}
                      placeholder="Reference any prior verbal/written warnings on this matter"
                    />
                  </div>
                </>
              )}

              {/* Action buttons */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setIrFormOpen(false); setIrFormError(""); }}
                  className={SECONDARY_BUTTON}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateIrDraft()}
                  disabled={irSubmitting || !irStaffName.trim() || !irDate || irProposedCode === "CON-015"}
                  title={irProposedCode === "CON-015" ? "CON-015 must go through CODI — do not create an IR" : undefined}
                  className={`${PRIMARY_BUTTON} flex items-center gap-2`}
                >
                  {irSubmitting ? "Saving…" : "Save Draft"}
                </button>
              </div>
            </div>
          )}

          {/* ── Recent IRs list ── */}
          <div>
            <h3 className={`${T_SECTION} mb-2`}>Recent Incident Reports</h3>
            {irListLoading && <p className={T_BODY}>Loading…</p>}
            {!irListLoading && irList.length === 0 && (
              <div className={`${GLASS_CARD} p-8 text-center`}>
                <FileText className="mx-auto mb-2 h-8 w-8 text-zinc-600" />
                <p className={T_BODY}>No IRs yet. Click &quot;New IR&quot; to start.</p>
              </div>
            )}
            {irList.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm border-collapse">
                  <thead>
                    <tr className={TABLE_HEADER}>
                      <th className={`${TABLE_CELL} text-left`}>IR Ref</th>
                      <th className={`${TABLE_CELL} text-left`}>Staff</th>
                      <th className={`${TABLE_CELL} text-center`}>Market</th>
                      <th className={`${TABLE_CELL} text-center`}>Layer</th>
                      <th className={`${TABLE_CELL} text-center`}>Status</th>
                      <th className={`${TABLE_CELL} text-left`}>Date</th>
                      <th className={`${TABLE_CELL} text-left`}>Code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {irList.map((ir) => (
                      <tr key={ir.id} className={TABLE_ROW}>
                        <td className={`${TABLE_CELL} font-mono text-violet-400`}>{ir.ir_ref}</td>
                        <td className={TABLE_CELL}>{ir.staff_name}</td>
                        <td className={`${TABLE_CELL} text-center`}>{ir.market}</td>
                        <td className={`${TABLE_CELL} text-center font-mono text-xs`}>{ir.input_layer}</td>
                        <td className={`${TABLE_CELL} text-center`}>
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                            ir.status === "IR_SUBMITTED" ? "bg-emerald-900/60 text-emerald-300" :
                            ir.status === "DRAFT" ? "bg-zinc-800 text-zinc-300" :
                            "bg-amber-900/60 text-amber-300"
                          }`}>
                            {ir.status}
                          </span>
                        </td>
                        <td className={TABLE_CELL}>{ir.incident_date}</td>
                        <td className={`${TABLE_CELL} font-mono text-xs text-zinc-400`}>{ir.proposed_code ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Case Queue (NTE v2 State Machine) ──────────────────────────── */}
      {tab === "cases" && isHR && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className={T_SECTION}>Case Queue</p>
              <p className={T_CAPTION}>Your NTE role: <span className="text-violet-300 font-semibold">{casesNteRole}</span></p>
            </div>
            <button type="button" className={SECONDARY_BUTTON} onClick={() => void loadCasesTab()} disabled={casesLoading}>
              <RefreshCw className={`w-3.5 h-3.5 ${casesLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {casesError && <p className="text-red-400 text-sm">{casesError}</p>}

          {/* IR Review Queue */}
          {casesSubmittedIrs.length > 0 && (
            <div className={GLASS_CARD}>
              <p className={`${T_CARD_TITLE} mb-3 flex items-center gap-2`}>
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Submitted IRs Awaiting Review ({casesSubmittedIrs.length})
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm border-collapse">
                  <thead>
                    <tr className={TABLE_HEADER}>
                      <th className={`${TABLE_CELL} text-left`}>IR Ref</th>
                      <th className={`${TABLE_CELL} text-left`}>Staff</th>
                      <th className={`${TABLE_CELL} text-center`}>Market</th>
                      <th className={`${TABLE_CELL} text-left`}>Incident Date</th>
                      <th className={`${TABLE_CELL} text-left`}>Code</th>
                      <th className={`${TABLE_CELL} text-center`}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {casesSubmittedIrs.map((ir) => (
                      <tr key={ir.id} className={TABLE_ROW}>
                        <td className={`${TABLE_CELL} font-mono text-violet-400`}>{ir.ir_ref}</td>
                        <td className={TABLE_CELL}>{ir.staff_name}</td>
                        <td className={`${TABLE_CELL} text-center`}>{ir.market}</td>
                        <td className={TABLE_CELL}>{ir.incident_date}</td>
                        <td className={`${TABLE_CELL} font-mono text-xs text-zinc-400`}>{ir.proposed_code ?? "—"}</td>
                        <td className={`${TABLE_CELL} text-center`}>
                          <button
                            type="button"
                            className="px-2 py-1 rounded text-xs bg-amber-700 hover:bg-amber-600 text-white transition"
                            onClick={() => {
                              setReviewTarget(ir);
                              setReviewAction("reject");
                              setReviewNote("");
                              setReviewViolationCode(ir.proposed_code ?? "");
                              setReviewSeverity("B");
                              setReviewPenalty("");
                              setReviewOffenseCount(1);
                              setReviewError("");
                              setReviewPickerOpen(false);
                              setReviewPickerSearch("");
                              setPenaltySuggestion(null);
                              setPenaltyOverridden(false);
                            }}
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Active Cases */}
          <div className={GLASS_CARD}>
            <p className={`${T_CARD_TITLE} mb-3`}>Active Cases ({casesList.length})</p>
            {casesLoading ? (
              <p className={T_CAPTION}>Loading…</p>
            ) : casesList.length === 0 ? (
              <p className={T_CAPTION}>No cases found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm border-collapse">
                  <thead>
                    <tr className={TABLE_HEADER}>
                      <th className={`${TABLE_CELL} text-left`}>NTE Ref</th>
                      <th className={`${TABLE_CELL} text-left`}>Staff</th>
                      <th className={`${TABLE_CELL} text-center`}>Mkt</th>
                      <th className={`${TABLE_CELL} text-left`}>Violation</th>
                      <th className={`${TABLE_CELL} text-center`}>Sev</th>
                      <th className={`${TABLE_CELL} text-center`}>Status</th>
                      <th className={`${TABLE_CELL} text-center`}>SLA</th>
                      <th className={`${TABLE_CELL} text-left`}>Reviewer</th>
                      <th className={`${TABLE_CELL} text-center`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {casesList.map((c) => {
                      const statusColors: Record<string, string> = {
                        REVIEW_PENDING: "bg-amber-900/60 text-amber-300",
                        APPROVAL_PENDING: "bg-blue-900/60 text-blue-300",
                        APPROVED: "bg-emerald-900/60 text-emerald-300",
                        SERVED: "bg-teal-900/60 text-teal-300",
                        RESPONSE_RECEIVED: "bg-cyan-900/60 text-cyan-300",
                        RESPONSE_WAIVED: "bg-orange-900/60 text-orange-300",
                        HEARING_PENDING: "bg-purple-900/60 text-purple-300",
                        HEARING_DONE: "bg-violet-900/60 text-violet-300",
                        INVESTIGATION_DONE: "bg-indigo-900/60 text-indigo-300",
                        DECIDED: "bg-rose-900/60 text-rose-300",
                        NOD_ISSUED: "bg-pink-900/60 text-pink-300",
                        CLOSED: "bg-zinc-700 text-zinc-400",
                        DISMISSED: "bg-zinc-700 text-zinc-400",
                      };
                      const availableActions: string[] = [];
                      if (casesNteRole !== "EMPLOYEE") {
                        if (c.status === "REVIEW_PENDING") availableActions.push("generate_nte_draft");
                        if (c.status === "APPROVAL_PENDING" && ["HQ","HR_MANAGER"].includes(casesNteRole)) {
                          availableActions.push("approve");
                          availableActions.push("reject_approval");
                        }
                        if (c.status === "APPROVED") availableActions.push("serve");
                        if (c.status === "SERVED") {
                          availableActions.push("receive_response");
                          availableActions.push("waive_response");
                        }
                        if (["RESPONSE_RECEIVED","RESPONSE_WAIVED"].includes(c.status) && c.market === "PH") {
                          availableActions.push("start_hearing");
                        }
                        if (c.status === "HEARING_PENDING") availableActions.push("complete_hearing");
                        if (["RESPONSE_RECEIVED","RESPONSE_WAIVED","HEARING_DONE"].includes(c.status)) {
                          availableActions.push("complete_investigation");
                        }
                        if (c.status === "INVESTIGATION_DONE" && ["HQ","HR_MANAGER"].includes(casesNteRole)) {
                          availableActions.push("decide");
                        }
                        if (c.status === "DECIDED" && ["HQ","HR_MANAGER"].includes(casesNteRole)) {
                          availableActions.push("issue_nod");
                        }
                        if (c.status === "NOD_ISSUED" && ["HQ","HR_MANAGER"].includes(casesNteRole)) {
                          availableActions.push("close");
                        }
                      }
                      return (
                        <tr
                          key={c.id}
                          className={`${TABLE_ROW} cursor-pointer`}
                          onClick={() => {
                            setSelectedCase(c);
                            void loadCaseDetail(c.id);
                          }}
                        >
                          <td className={`${TABLE_CELL} font-mono text-violet-400 text-xs`}>{c.nte_ref}</td>
                          <td className={TABLE_CELL}>{c.staff_name}</td>
                          <td className={`${TABLE_CELL} text-center`}>{c.market}</td>
                          <td className={`${TABLE_CELL} font-mono text-xs`}>{c.violation_code ?? "—"}</td>
                          <td className={`${TABLE_CELL} text-center font-bold`}>{c.severity_class ?? "—"}</td>
                          <td className={`${TABLE_CELL} text-center`}>
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${statusColors[c.status] ?? "bg-zinc-800 text-zinc-300"}`}>
                              {c.status}
                            </span>
                          </td>
                          <td className={`${TABLE_CELL} text-center`}>
                            {c.urgency && c.urgency !== "done" ? (
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                                c.urgency === "overdue" ? "bg-red-900/70 text-red-300" :
                                c.urgency === "warning" ? "bg-amber-900/70 text-amber-300" :
                                "bg-emerald-900/60 text-emerald-400"
                              }`}>
                                {c.urgency === "overdue"
                                  ? `${Math.abs(c.days_remaining ?? 0).toFixed(0)}d over`
                                  : c.urgency === "warning"
                                  ? `${(c.days_remaining ?? 0).toFixed(0)}d left`
                                  : `${(c.days_remaining ?? 0).toFixed(0)}d`}
                              </span>
                            ) : c.urgency === "done" ? (
                              <span className={T_CAPTION}>done</span>
                            ) : (
                              <span className={T_CAPTION}>—</span>
                            )}
                          </td>
                          <td className={`${TABLE_CELL} text-xs`}>{c.reviewed_by ?? "—"}</td>
                          <td className={`${TABLE_CELL} text-center`}>
                            <div className="flex gap-1 justify-center flex-wrap" onClick={(e) => e.stopPropagation()}>
                              {availableActions.map((act) => (
                                <button
                                  key={act}
                                  type="button"
                                  className="px-2 py-0.5 rounded text-xs bg-indigo-700 hover:bg-indigo-600 text-white transition whitespace-nowrap"
                                  onClick={() => {
                                    setTransitionTarget(c);
                                    setTransitionAction(act);
                                    setTransitionPayload({});
                                    setTransitionError("");
                                  }}
                                >
                                  {act.replace(/_/g, " ")}
                                </button>
                              ))}
                              {availableActions.length === 0 && (
                                <span className={T_CAPTION}>—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Case Detail Panel */}
          {selectedCase && (
            <div className={`${GLASS_CARD} space-y-3`}>
              <div className="flex items-center justify-between">
                <p className={T_CARD_TITLE}>{selectedCase.nte_ref} — Detail</p>
                <button type="button" onClick={() => setSelectedCase(null)}>
                  <X className="w-4 h-4 text-zinc-400 hover:text-white" />
                </button>
              </div>
              {caseDetailLoading ? (
                <p className={T_CAPTION}>Loading…</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className={T_LABEL}>Staff:</span> <span className={T_BODY}>{selectedCase.staff_name}</span></div>
                    <div><span className={T_LABEL}>Market:</span> <span className={T_BODY}>{selectedCase.market}</span></div>
                    <div><span className={T_LABEL}>Violation:</span> <span className="font-mono text-xs text-violet-300">{selectedCase.violation_code ?? "—"}</span></div>
                    <div><span className={T_LABEL}>Severity:</span> <span className="font-bold">{selectedCase.severity_class ?? "—"}</span></div>
                    <div><span className={T_LABEL}>Offense #:</span> <span>{selectedCase.offense_count}</span></div>
                    <div><span className={T_LABEL}>Proposed Penalty:</span> <span>{selectedCase.proposed_penalty ?? "—"}</span></div>
                    <div><span className={T_LABEL}>Reviewed by:</span> <span>{selectedCase.reviewed_by ?? "—"}</span></div>
                    <div><span className={T_LABEL}>Approved by:</span> <span>{selectedCase.approved_by ?? "—"}</span></div>
                    <div><span className={T_LABEL}>Decision:</span> <span className="text-rose-300">{selectedCase.decision_outcome ?? "—"}</span></div>
                    <div><span className={T_LABEL}>Decided by:</span> <span>{selectedCase.decided_by ?? "—"}</span></div>
                  </div>
                  {selectedCase.audit_log && selectedCase.audit_log.length > 0 && (
                    <div>
                      <p className={`${T_LABEL} mb-2`}>Audit Trail</p>
                      <div className="space-y-1">
                        {selectedCase.audit_log.map((entry) => (
                          <div key={entry.id} className="flex items-start gap-3 text-xs text-zinc-400 border-l-2 border-zinc-700 pl-3">
                            <span className="text-zinc-500 shrink-0">{fmtDate(entry.created_at)}</span>
                            <span className="font-semibold text-zinc-300">{entry.actor_name}</span>
                            <span className="text-violet-400">{entry.action}</span>
                            {entry.from_status && (
                              <span>{entry.from_status} → {entry.to_status}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── NTE Letter (P6) ───────────────────────────────── */}
                  <div className="border-t border-zinc-700 pt-3 space-y-3">
                    <p className={`${T_LABEL} text-amber-400`}>NTE Letter</p>

                    {/* acts_block editor */}
                    {actsBlockEdit === null ? (
                      <button
                        type="button"
                        className="text-xs text-zinc-400 underline hover:text-white"
                        onClick={() => setActsBlockEdit("")}
                      >
                        + Customize acts_block (optional override)
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <label className={T_LABEL}>
                          Alleged Acts (override)
                          <span className="ml-2 text-zinc-500 font-normal">
                            — leave blank to use catalog default
                          </span>
                        </label>
                        <textarea
                          className="w-full rounded bg-zinc-800 border border-zinc-600 text-sm text-white px-3 py-2 focus:outline-none focus:border-violet-500 min-h-[100px]"
                          value={actsBlockEdit}
                          onChange={(e) => setActsBlockEdit(e.target.value)}
                          placeholder="Describe the specific acts/omissions for this employee (blank = use catalog template)…"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className={PRIMARY_BUTTON}
                            disabled={actsBlockSaving}
                            onClick={() => void saveActsBlock(selectedCase.id)}
                          >
                            {actsBlockSaving ? "Saving…" : "Save acts_block"}
                          </button>
                          <button
                            type="button"
                            className="text-xs text-zinc-400 hover:text-white"
                            onClick={() => setActsBlockEdit(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Generate PDF button */}
                    <button
                      type="button"
                      className={PRIMARY_BUTTON}
                      disabled={letterLoading}
                      onClick={() => void downloadNteLetter(selectedCase.id, selectedCase.nte_ref)}
                    >
                      {letterLoading ? "Generating PDF…" : "Download NTE Letter (PDF)"}
                    </button>
                    <p className="text-xs text-zinc-500">
                      SHA-256 of each download is recorded in the audit log.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── IR Review Modal ─────────────────────────────────────────────────── */}
      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className={`${GLASS_CARD} w-full max-w-lg p-6 space-y-4`}>
            <div className="flex items-center justify-between">
              <p className={T_SECTION}>Review IR: {reviewTarget.ir_ref}</p>
              <button type="button" onClick={() => setReviewTarget(null)}><X className="w-4 h-4" /></button>
            </div>
            <p className={T_BODY}>Staff: <strong>{reviewTarget.staff_name}</strong> | {reviewTarget.market} | {reviewTarget.incident_date}</p>

            <div>
              <label className={T_LABEL}>Action</label>
              <SelectDark
                className="mt-1 w-full"
                value={reviewAction}
                onChange={(v) => setReviewAction(v as "reject" | "dismiss" | "confirm_violation")}
                options={[
                  { value: "reject", label: "Reject (Return to submitter)" },
                  { value: "dismiss", label: "Dismiss (No violation found)" },
                  { value: "confirm_violation", label: "Confirm Violation (Create NTE Case)" },
                ]}
              />
            </div>

            <div>
              <label className={T_LABEL}>Reviewer Note {reviewAction !== "confirm_violation" && "(required)"}</label>
              <textarea
                className={`${TEXTAREA_CLASS} mt-1`}
                rows={3}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Explain your decision…"
              />
            </div>

            {reviewAction === "confirm_violation" && (
              <div className="space-y-3 border border-indigo-800/50 rounded-lg p-3">
                <p className={T_LABEL}>Case Details</p>

                {/* Violation picker */}
                <div>
                  <label className={T_LABEL}>Violation *</label>
                  <button
                    type="button"
                    onClick={() => setReviewPickerOpen((v) => !v)}
                    className={`${INPUT_CLASS} mt-1 w-full text-left flex items-center justify-between`}
                  >
                    {reviewViolationCode ? (
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-violet-400 text-xs">{reviewViolationCode}</span>
                        <span className="text-sm truncate">{catalog.find((c) => c.code === reviewViolationCode)?.title_en}</span>
                      </span>
                    ) : (
                      <span className="text-zinc-500 text-sm">— Select violation —</span>
                    )}
                    <ChevronRight className={`h-4 w-4 text-zinc-500 transition-transform ${reviewPickerOpen ? "rotate-90" : ""}`} />
                  </button>

                  {reviewPickerOpen && (
                    <div className="mt-1 rounded-xl border border-white/10 bg-zinc-900 shadow-xl overflow-hidden">
                      <div className="p-2 border-b border-white/10">
                        <input
                          autoFocus
                          className={`${INPUT_CLASS} text-sm`}
                          placeholder="Search code or title…"
                          value={reviewPickerSearch}
                          onChange={(e) => setReviewPickerSearch(e.target.value)}
                        />
                      </div>
                      <div className="max-h-56 overflow-y-auto divide-y divide-white/5">
                        {(() => {
                          const reviewMarket = reviewTarget?.market ?? "PH";
                          const q = reviewPickerSearch.toLowerCase();
                          const filtered = catalog
                            .filter((c) => c.code !== "MGT-004" && c.code !== "CON-015")
                            .filter((c) => !c.market || c.market === reviewMarket || c.market === "BOTH")
                            .filter((c) => !q || c.code.toLowerCase().includes(q) || c.title_en.toLowerCase().includes(q));
                          const groups = [...new Set(filtered.map((c) => c.category_code))];
                          if (filtered.length === 0) return (
                            <p className="px-4 py-6 text-center text-sm text-zinc-500">No matches</p>
                          );
                          return groups.map((cat) => (
                            <div key={cat}>
                              <div className="px-3 py-1.5 text-[10px] font-bold tracking-widest text-zinc-500 bg-zinc-800/60 uppercase">{cat}</div>
                              {filtered.filter((c) => c.category_code === cat).map((entry) => (
                                <button
                                  key={entry.code}
                                  type="button"
                                  onClick={() => {
                                    setReviewViolationCode(entry.code);
                                    setReviewSeverity(entry.severity_class as "A"|"B"|"C"|"D");
                                    setReviewPickerOpen(false);
                                    setReviewPickerSearch("");
                                    setPenaltyOverridden(false);
                                    if (reviewTarget) {
                                      void fetchPenaltySuggestion(
                                        entry.code,
                                        reviewTarget.staff_name,
                                        reviewTarget.market,
                                      );
                                    }
                                  }}
                                  className={`w-full text-left px-3 py-2.5 hover:bg-white/5 flex items-start gap-3 transition-colors ${reviewViolationCode === entry.code ? "bg-violet-500/10" : ""}`}
                                >
                                  <span className="font-mono text-[11px] text-violet-400 mt-0.5 shrink-0 w-16">{entry.code}</span>
                                  <span className="flex-1 min-w-0">
                                    <span className="block text-sm text-zinc-200 leading-snug">{entry.title_en}</span>
                                    <span className="flex gap-1.5 mt-0.5">
                                      <span className={`inline-block px-1.5 py-0 rounded text-[10px] font-mono font-semibold ${
                                        entry.severity_class === "D" ? "bg-red-900/50 text-red-300" :
                                        entry.severity_class === "C" ? "bg-orange-900/50 text-orange-300" :
                                        entry.severity_class === "B" ? "bg-amber-900/50 text-amber-300" :
                                        "bg-zinc-700 text-zinc-300"}`}>{entry.severity_class}</span>
                                      {entry.requires_hq_review && (
                                        <span className="inline-block px-1.5 py-0 rounded text-[10px] bg-violet-900/50 text-violet-300">HQ review</span>
                                      )}
                                    </span>
                                  </span>
                                </button>
                              ))}
                            </div>
                          ));
                        })()}
                      </div>
                      {reviewViolationCode && (
                        <div className="border-t border-white/10 px-3 py-2">
                          <button type="button" onClick={() => { setReviewViolationCode(""); setReviewPickerOpen(false); setReviewPickerSearch(""); setPenaltySuggestion(null); setPenaltyOverridden(false); setReviewPenalty(""); setReviewOffenseCount(1); }} className="text-xs text-zinc-500 hover:text-zinc-300">Clear selection</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className={T_LABEL}>Severity Class</label>
                  <SelectDark
                    className="mt-1 w-full"
                    value={reviewSeverity}
                    onChange={(v) => setReviewSeverity(v as "A"|"B"|"C"|"D")}
                    options={[
                      { value: "A", label: "A — Minor" },
                      { value: "B", label: "B — Moderate" },
                      { value: "C", label: "C — Serious" },
                      { value: "D", label: "D — Critical" },
                    ]}
                  />
                </div>

                {/* ── Offense History + Progressive Penalty ─────────────── */}
                {reviewViolationCode && (
                  <div className="rounded-lg border border-white/10 bg-white/3 overflow-hidden">
                    <div className="px-3 py-2 flex items-center justify-between border-b border-white/10 bg-white/5">
                      <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Progressive Penalty</span>
                      {penaltyLoading && <span className="text-xs text-zinc-500 animate-pulse">Loading history…</span>}
                      {penaltySuggestion && !penaltyLoading && (
                        <span className="text-xs text-zinc-400">
                          {penaltySuggestion.same_code_count} prior offense{penaltySuggestion.same_code_count !== 1 ? "s" : ""} for {reviewViolationCode}
                          {penaltySuggestion.same_category_count > penaltySuggestion.same_code_count && (
                            <span className="text-zinc-500"> ({penaltySuggestion.same_category_count} same category)</span>
                          )}
                        </span>
                      )}
                    </div>

                    {penaltySuggestion && !penaltyLoading && (
                      <div className="px-3 py-2.5 space-y-2.5">
                        {/* Escalation path */}
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {penaltySuggestion.escalation_path.map((step) => (
                            <span
                              key={step.offense}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                                step.offense === penaltySuggestion.current_offense_number
                                  ? "bg-violet-600/30 border-violet-500/60 text-violet-200"
                                  : step.offense < penaltySuggestion.current_offense_number
                                  ? "bg-zinc-700/60 border-zinc-600/40 text-zinc-400 line-through"
                                  : "bg-zinc-800/40 border-zinc-700/30 text-zinc-500"
                              }`}
                            >
                              <span className="text-[9px] font-bold opacity-70">#{step.offense}</span>
                              {step.penalty}
                            </span>
                          ))}
                        </div>

                        {/* Prior cases list */}
                        {penaltySuggestion.prior_cases.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-semibold">Prior Cases</p>
                            {penaltySuggestion.prior_cases.map((pc) => (
                              <div key={pc.nte_ref} className="flex items-center gap-2 text-xs text-zinc-400">
                                <span className="font-mono text-violet-400">{pc.nte_ref}</span>
                                <span className="text-zinc-500">·</span>
                                <span>{pc.violation_code}</span>
                                <span className="text-zinc-500">·</span>
                                <span className="text-zinc-500">{pc.status}</span>
                                <span className="text-zinc-500">·</span>
                                <span className="text-zinc-600">{pc.created_at?.slice(0, 10)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Override toggle */}
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={penaltyOverridden}
                            onChange={(e) => {
                              setPenaltyOverridden(e.target.checked);
                              if (!e.target.checked && penaltySuggestion) {
                                setReviewPenalty(penaltySuggestion.proposed_penalty);
                                setReviewOffenseCount(penaltySuggestion.current_offense_number);
                              }
                            }}
                            className="rounded"
                          />
                          <span className="text-xs text-zinc-400">Override suggestion</span>
                        </label>
                      </div>
                    )}

                    {/* Editable fields — always shown, locked unless overridden */}
                    <div className="px-3 pb-3 space-y-2 border-t border-white/10 pt-2">
                      <div>
                        <label className={T_LABEL}>
                          Proposed Penalty
                          {penaltySuggestion && !penaltyOverridden && (
                            <span className="ml-2 text-violet-400 text-[10px] font-normal">(auto-suggested)</span>
                          )}
                        </label>
                        <input
                          className={`${INPUT_CLASS} mt-1`}
                          value={reviewPenalty}
                          readOnly={!!penaltySuggestion && !penaltyOverridden}
                          onChange={(e) => setReviewPenalty(e.target.value)}
                          placeholder="e.g. Written Warning"
                        />
                      </div>
                      <div>
                        <label className={T_LABEL}>
                          Offense Count
                          {penaltySuggestion && !penaltyOverridden && (
                            <span className="ml-2 text-violet-400 text-[10px] font-normal">(auto)</span>
                          )}
                        </label>
                        <input
                          type="number"
                          min={1}
                          className={`${INPUT_CLASS} mt-1`}
                          value={reviewOffenseCount}
                          readOnly={!!penaltySuggestion && !penaltyOverridden}
                          onChange={(e) => setReviewOffenseCount(parseInt(e.target.value) || 1)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Fallback fields when no code selected yet */}
                {!reviewViolationCode && (
                  <div className="space-y-2">
                    <div>
                      <label className={T_LABEL}>Proposed Penalty</label>
                      <input
                        className={`${INPUT_CLASS} mt-1`}
                        value={reviewPenalty}
                        onChange={(e) => setReviewPenalty(e.target.value)}
                        placeholder="e.g. Written Warning"
                      />
                    </div>
                    <div>
                      <label className={T_LABEL}>Offense Count</label>
                      <input
                        type="number"
                        min={1}
                        className={`${INPUT_CLASS} mt-1`}
                        value={reviewOffenseCount}
                        onChange={(e) => setReviewOffenseCount(parseInt(e.target.value) || 1)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {reviewError && <p className="text-red-400 text-sm">{reviewError}</p>}

            <div className="flex gap-3 justify-end pt-2">
              <button type="button" className={SECONDARY_BUTTON} onClick={() => setReviewTarget(null)}>Cancel</button>
              <button
                type="button"
                className={reviewAction === "confirm_violation" ? PRIMARY_BUTTON : DANGER_BUTTON}
                onClick={() => void submitIrReview()}
                disabled={reviewSubmitting}
              >
                {reviewSubmitting ? "Submitting…" : reviewAction === "reject" ? "Return IR" : reviewAction === "dismiss" ? "Dismiss IR" : "Confirm & Create Case"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Case Transition Modal ─────────────────────────────────────────── */}
      {transitionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className={`${GLASS_CARD} w-full max-w-md p-6 space-y-4`}>
            <div className="flex items-center justify-between">
              <p className={T_SECTION}>{transitionAction.replace(/_/g, " ").toUpperCase()}</p>
              <button type="button" onClick={() => setTransitionTarget(null)}><X className="w-4 h-4" /></button>
            </div>
            <p className={T_BODY}>Case: <strong>{transitionTarget.nte_ref}</strong> | Staff: {transitionTarget.staff_name}</p>
            <p className={T_CAPTION}>Current status: {transitionTarget.status}</p>

            {transitionAction === "approve" && (
              <p className="text-amber-300 text-sm">Note: self-approval is prohibited. You must be a different person from the reviewer ({transitionTarget.reviewed_by}).</p>
            )}

            {transitionAction === "receive_response" && (
              <div>
                <label className={T_LABEL}>Response Text</label>
                <textarea
                  className={`${TEXTAREA_CLASS} mt-1`}
                  rows={4}
                  value={(transitionPayload.response_text as string) ?? ""}
                  onChange={(e) => setTransitionPayload((p) => ({ ...p, response_text: e.target.value }))}
                  placeholder="Employee's response…"
                />
              </div>
            )}

            {transitionAction === "serve" && (
              <div>
                <label className={T_LABEL}>Served Method</label>
                <SelectDark
                  className="mt-1 w-full"
                  value={(transitionPayload.served_method as string) ?? "IN_PERSON"}
                  onChange={(v) => setTransitionPayload((p) => ({ ...p, served_method: v }))}
                  options={[
                    { value: "IN_PERSON", label: "In Person" },
                    { value: "EMAIL", label: "Email" },
                    { value: "REGISTERED_MAIL", label: "Registered Mail" },
                  ]}
                />
              </div>
            )}

            {transitionAction === "decide" && (
              <div className="space-y-3">
                <div>
                  <label className={T_LABEL}>Decision Outcome</label>
                  <SelectDark
                    className="mt-1 w-full"
                    value={(transitionPayload.decision_outcome as string) ?? ""}
                    onChange={(v) => setTransitionPayload((p) => ({ ...p, decision_outcome: v }))}
                    options={[
                      { value: "DISMISSED", label: "Dismissed" },
                      { value: "WRITTEN_WARNING", label: "Written Warning" },
                      { value: "SUSPENSION", label: "Suspension" },
                      { value: "TERMINATION", label: "Termination (HQ only)" },
                    ]}
                    placeholder="— Select —"
                  />
                </div>
                <div>
                  <label className={T_LABEL}>Penalty Detail (optional)</label>
                  <input
                    className={`${INPUT_CLASS} mt-1`}
                    value={(transitionPayload.decision_penalty_detail as string) ?? ""}
                    onChange={(e) => setTransitionPayload((p) => ({ ...p, decision_penalty_detail: e.target.value }))}
                    placeholder="e.g. 5-day suspension without pay"
                  />
                </div>
              </div>
            )}

            {transitionAction === "reject_approval" && (
              <div>
                <label className={T_LABEL}>Rejection Note</label>
                <textarea
                  className={`${TEXTAREA_CLASS} mt-1`}
                  rows={3}
                  value={(transitionPayload.reviewer_note as string) ?? ""}
                  onChange={(e) => setTransitionPayload((p) => ({ ...p, reviewer_note: e.target.value }))}
                />
              </div>
            )}

            {transitionError && <p className="text-red-400 text-sm">{transitionError}</p>}

            <div className="flex gap-3 justify-end pt-2">
              <button type="button" className={SECONDARY_BUTTON} onClick={() => setTransitionTarget(null)}>Cancel</button>
              <button
                type="button"
                className={["decide","reject_approval"].includes(transitionAction) ? DANGER_BUTTON : PRIMARY_BUTTON}
                onClick={() => void submitCaseTransition()}
                disabled={transitionSubmitting}
              >
                {transitionSubmitting ? "Submitting…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
