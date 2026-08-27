"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Star, ChevronRight, X, CheckCircle, RefreshCw, AlertCircle, Clock } from "lucide-react";
import {
  getAuth,
  refreshAuthFromApi,
  getAuthHeaders, hasRouteAccess } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import SelectDark from "@/components/SelectDark";
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
  DIVIDER,
} from "@/lib/ui-tokens";
import { SALARY_HIDDEN, isSalaryHidden } from "@/lib/salary";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReviewType = "probation_3mo" | "6mo_regularization" | "annual" | "ad_hoc";
type ReviewStatus = "draft" | "submitted" | "acknowledged";
type AlertLevel = "OVERDUE" | "URGENT" | "SOON" | "UPCOMING";
type PageTab = "upcoming" | "history" | "new";

const REVIEW_TYPE_LABELS: Record<ReviewType, string> = {
  probation_3mo: "3-Month Probation Review",
  "6mo_regularization": "6-Month Regularization Review",
  annual: "Annual Performance Review",
  ad_hoc: "Ad-hoc Review",
};

const ALLOWED_ROLES = ["ADMIN", "HQ", "HR_MANAGER", "MANILA_MANAGEMENT", "MANILA_MANAGER"];

type ScheduleItem = {
  id: string;
  staff_name: string;
  city: string;
  review_type: ReviewType;
  review_type_label: string;
  scheduled_date: string;
  days_until_due: number;
  alert_level: AlertLevel;
};

type PerformanceReview = {
  id: string;
  staff_name: string;
  city: string;
  review_type: ReviewType;
  review_period: string;
  review_date: string;
  score_attendance: number;
  score_work_quality: number;
  score_teamwork: number;
  score_customer_service: number;
  score_rule_compliance: number;
  total_score: number;
  grade: string;
  salary_increase_recommended: boolean;
  salary_increase_amount: number | null;
  strengths: string;
  areas_for_improvement: string;
  notes: string;
  reviewed_by: string;
  status: ReviewStatus;
  acknowledged_at: string | null;
  created_at: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeGrade(total: number): string {
  if (total >= 23) return "Excellent";
  if (total >= 19) return "Good";
  if (total >= 14) return "Satisfactory";
  if (total >= 10) return "Needs Improvement";
  return "Unsatisfactory";
}

function totalScoreColor(total: number): string {
  if (total >= 23) return "text-emerald-400";
  if (total >= 19) return "text-blue-400";
  if (total >= 14) return "text-amber-400";
  if (total >= 10) return "text-orange-400";
  return "text-red-400";
}

function alertBadgeClass(level: AlertLevel): string {
  switch (level) {
    case "OVERDUE": return "inline-flex items-center rounded-full bg-red-500/20 border border-red-500/30 px-2.5 py-0.5 text-xs font-semibold text-red-400";
    case "URGENT": return "inline-flex items-center rounded-full bg-orange-500/20 border border-orange-500/30 px-2.5 py-0.5 text-xs font-semibold text-orange-400";
    case "SOON": return "inline-flex items-center rounded-full bg-amber-500/20 border border-amber-500/30 px-2.5 py-0.5 text-xs font-semibold text-amber-400";
    default: return "inline-flex items-center rounded-full bg-neutral-500/20 border border-neutral-500/30 px-2.5 py-0.5 text-xs font-semibold text-neutral-400";
  }
}

function gradeBadgeClass(grade: string): string {
  switch (grade) {
    case "Excellent": return BADGE_SUCCESS;
    case "Good": return BADGE_INFO;
    case "Satisfactory": return BADGE_WARNING;
    case "Needs Improvement": return "inline-flex items-center gap-1.5 rounded-full bg-orange-500/15 border border-orange-500/25 px-2.5 py-0.5 text-xs font-medium text-orange-400";
    default: return BADGE_ERROR;
  }
}

function statusBadgeClass(status: ReviewStatus): string {
  switch (status) {
    case "acknowledged": return BADGE_SUCCESS;
    case "submitted": return BADGE_INFO;
    default: return "inline-flex items-center gap-1.5 rounded-full bg-neutral-500/15 border border-neutral-500/25 px-2.5 py-0.5 text-xs font-medium text-neutral-400";
  }
}

function formatDaysLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return "Due today";
  return `in ${days} days`;
}

function ScoreButton({
  value,
  selected,
  onClick,
}: {
  value: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-9 w-9 rounded-lg text-sm font-semibold transition-all duration-150",
        selected
          ? "bg-violet-600 text-white shadow-lg shadow-violet-500/30"
          : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700",
      ].join(" ")}
    >
      {value}
    </button>
  );
}

// ─── Detail Slide Panel ───────────────────────────────────────────────────────

function ReviewDetailPanel({
  review,
  onClose,
  onAcknowledge,
}: {
  review: PerformanceReview;
  onClose: () => void;
  onAcknowledge: (id: string) => Promise<void>;
}) {
  const [acking, setAcking] = useState(false);

  const handleAcknowledge = async () => {
    setAcking(true);
    await onAcknowledge(review.id);
    setAcking(false);
  };

  const scoreRows: { label: string; value: number }[] = [
    { label: "Attendance & Punctuality", value: review.score_attendance },
    { label: "Work Quality", value: review.score_work_quality },
    { label: "Teamwork", value: review.score_teamwork },
    { label: "Customer Service", value: review.score_customer_service },
    { label: "Rule Compliance", value: review.score_rule_compliance },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      {/* Panel */}
      <div className="relative z-10 flex h-full w-full max-w-lg flex-col overflow-y-auto bg-[#0d1117] border-l border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <p className={T_CARD_TITLE}>{review.staff_name}</p>
            <p className={T_CAPTION}>{REVIEW_TYPE_LABELS[review.review_type]} · {review.review_period}</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 px-6 py-5">
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <span className={gradeBadgeClass(review.grade)}>{review.grade}</span>
            <span className={statusBadgeClass(review.status)}>{review.status}</span>
            <span className="inline-flex items-center rounded-full bg-violet-500/15 border border-violet-500/25 px-2.5 py-0.5 text-xs font-medium text-violet-400">
              {review.review_date}
            </span>
          </div>

          {/* Total score */}
          <div className={`${GLASS_CARD} p-4 flex items-center justify-between`}>
            <p className={T_LABEL}>Total Score</p>
            <p className={`text-2xl font-bold tabular-nums ${totalScoreColor(review.total_score)}`}>
              {review.total_score} <span className="text-sm text-neutral-500">/ 25</span>
            </p>
          </div>

          {/* Individual scores */}
          <div className={`${GLASS_CARD} p-4 space-y-3`}>
            <p className={T_SECTION}>Performance Scores</p>
            {scoreRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <p className="text-sm text-zinc-400">{row.label}</p>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span
                      key={n}
                      className={`inline-block h-2 w-2 rounded-full ${n <= row.value ? "bg-violet-500" : "bg-neutral-700"}`}
                    />
                  ))}
                  <span className="ml-2 text-sm font-semibold text-white">{row.value}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Narrative */}
          {review.strengths && (
            <div className={`${GLASS_CARD} p-4`}>
              <p className={`${T_LABEL} mb-1`}>Strengths</p>
              <p className={T_BODY}>{review.strengths}</p>
            </div>
          )}
          {review.areas_for_improvement && (
            <div className={`${GLASS_CARD} p-4`}>
              <p className={`${T_LABEL} mb-1`}>Areas for Improvement</p>
              <p className={T_BODY}>{review.areas_for_improvement}</p>
            </div>
          )}
          {review.notes && (
            <div className={`${GLASS_CARD} p-4`}>
              <p className={`${T_LABEL} mb-1`}>Notes</p>
              <p className={T_BODY}>{review.notes}</p>
            </div>
          )}

          {/* Compensation */}
          {review.salary_increase_recommended && (
            <div className={`${GLASS_CARD} p-4`}>
              <p className={`${T_LABEL} mb-1`}>Salary Increase Recommended</p>
              <p className="text-sm text-emerald-400 font-semibold">
                {isSalaryHidden(review.salary_increase_amount)
                  ? SALARY_HIDDEN
                  : `PHP ${review.salary_increase_amount!.toLocaleString()}`}
              </p>
            </div>
          )}

          {/* Reviewer */}
          <div className="flex items-center justify-between">
            <p className={T_CAPTION}>Reviewed by: <span className="text-zinc-300">{review.reviewed_by}</span></p>
            {review.acknowledged_at && (
              <p className={T_CAPTION}>Acknowledged: <span className="text-zinc-300">{review.acknowledged_at.slice(0, 10)}</span></p>
            )}
          </div>
        </div>

        {/* Footer action */}
        {review.status === "submitted" && (
          <div className="shrink-0 border-t border-white/10 px-6 py-4">
            <button
              onClick={handleAcknowledge}
              disabled={acking}
              className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2`}
            >
              <CheckCircle className="h-4 w-4" />
              {acking ? "Marking..." : "Mark as Acknowledged"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HRPerformancePage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<PageTab>("upcoming");

  // ── Upcoming tab state ──
  const [daysAhead, setDaysAhead] = useState<30 | 60 | 90>(60);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [scheduleError, setScheduleError] = useState("");

  // ── History tab state ──
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [selectedReview, setSelectedReview] = useState<PerformanceReview | null>(null);

  // ── New Review tab state ──
  const [prefillName, setPrefillName] = useState("");
  const [prefillType, setPrefillType] = useState<ReviewType | "">("");
  const [prefillScheduleId, setPrefillScheduleId] = useState("");
  const [form, setForm] = useState({
    staff_name: "",
    review_type: "" as ReviewType | "",
    review_date: new Date().toISOString().slice(0, 10),
    review_period: "",
    reviewed_by: "",
    score_attendance: 0,
    score_work_quality: 0,
    score_teamwork: 0,
    score_customer_service: 0,
    score_rule_compliance: 0,
    strengths: "",
    areas_for_improvement: "",
    notes: "",
    salary_increase_recommended: false,
    salary_increase_amount: 0,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const totalScore =
    form.score_attendance +
    form.score_work_quality +
    form.score_teamwork +
    form.score_customer_service +
    form.score_rule_compliance;
  const grade = computeGrade(totalScore);

  // ── Auth check ──
  useEffect(() => {
    (async () => {
      const a = getAuth();
      if (!a) { router.replace("/login"); return; }
      const resolved = await refreshAuthFromApi(a);
      const auth = resolved || a;
      const role = String(auth?.role || "").toUpperCase();
      if (!ALLOWED_ROLES.includes(role) && !hasRouteAccess("/admin/hr/performance", auth)) { router.replace("/my-shift"); return; }
      setAuthReady(true);
    })();
  }, [router]);

  // ── Prefill form when coming from Upcoming ──
  useEffect(() => {
    if (prefillName || prefillType) {
      setForm((f) => ({
        ...f,
        staff_name: prefillName || f.staff_name,
        review_type: prefillType || f.review_type,
      }));
    }
  }, [prefillName, prefillType]);

  // ── Fetch Upcoming Schedule ──
  const fetchSchedule = useCallback(async () => {
    const a = getAuth();
    if (!a) return;
    setScheduleLoading(true);
    setScheduleError("");
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/hr/reviews/upcoming?city=manila&days_ahead=${daysAhead}`,
        { headers: getAuthHeaders(a), cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSchedule(Array.isArray(data?.schedule) ? data.schedule : Array.isArray(data) ? data : []);
    } catch (e) {
      setScheduleError(e instanceof Error ? e.message : "Failed to load schedule");
    } finally {
      setScheduleLoading(false);
    }
  }, [daysAhead]);

  useEffect(() => {
    if (authReady && activeTab === "upcoming") void fetchSchedule();
  }, [authReady, activeTab, fetchSchedule]);

  // ── Fetch Review History ──
  const fetchReviews = useCallback(async () => {
    const a = getAuth();
    if (!a) return;
    setReviewsLoading(true);
    try {
      const params = new URLSearchParams({ city: "manila" });
      if (filterName) params.set("staff_name", filterName);
      if (filterType) params.set("review_type", filterType);
      if (filterStatus) params.set("status", filterStatus);
      const res = await fetch(`${API_BASE}/api/admin/hr/reviews?${params}`, {
        headers: getAuthHeaders(a),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReviews(Array.isArray(data?.reviews) ? data.reviews : Array.isArray(data) ? data : []);
    } catch {
      setReviews([]);
    } finally {
      setReviewsLoading(false);
    }
  }, [filterName, filterType, filterStatus]);

  useEffect(() => {
    if (authReady && activeTab === "history") void fetchReviews();
  }, [authReady, activeTab, fetchReviews]);

  // ── Sync schedules ──
  const handleSync = async () => {
    const a = getAuth();
    if (!a) return;
    setSyncing(true);
    setScheduleError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/reviews/schedule/sync`, {
        method: "POST",
        headers: { ...getAuthHeaders(a), "Content-Type": "application/json" },
        body: JSON.stringify({ city: "manila" }),
      });
      if (!res.ok) {
        setScheduleError(`Sync failed: HTTP ${res.status}`);
        return;
      }
      await fetchSchedule();
    } catch (e) {
      setScheduleError(`Sync failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setSyncing(false);
    }
  };

  // ── Acknowledge review ──
  const handleAcknowledge = async (id: string) => {
    const a = getAuth();
    if (!a) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/reviews/${id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(a), "Content-Type": "application/json" },
        body: JSON.stringify({ status: "acknowledged" }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      setSelectedReview(null);
      void fetchReviews();
    } catch (err) {
      alert(`Failed to acknowledge: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  // ── Submit review ──
  const handleSubmitReview = async (status: ReviewStatus) => {
    if (!form.staff_name || !form.review_type || !form.reviewed_by) {
      setSubmitMsg({ type: "error", text: "Staff Name, Review Type, and Reviewed By are required." });
      return;
    }
    if (status === "submitted" && [form.score_attendance, form.score_work_quality, form.score_teamwork, form.score_customer_service, form.score_rule_compliance].some((s) => s === 0)) {
      setSubmitMsg({ type: "error", text: "Please score all 5 performance areas." });
      return;
    }
    const a = getAuth();
    if (!a) return;
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const body = {
        staff_name: form.staff_name,
        city: "manila",
        review_type: form.review_type,
        review_period: form.review_period,
        review_date: form.review_date,
        score_attendance: form.score_attendance,
        score_work_quality: form.score_work_quality,
        score_teamwork: form.score_teamwork,
        score_customer_service: form.score_customer_service,
        score_rule_compliance: form.score_rule_compliance,
        salary_increase_recommended: form.salary_increase_recommended,
        salary_increase_amount: form.salary_increase_amount,
        strengths: form.strengths,
        areas_for_improvement: form.areas_for_improvement,
        notes: form.notes,
        reviewed_by: form.reviewed_by,
        status,
        ...(prefillScheduleId ? { schedule_id: prefillScheduleId } : {}),
      };
      const res = await fetch(`${API_BASE}/api/admin/hr/reviews`, {
        method: "POST",
        headers: { ...getAuthHeaders(a), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail || `HTTP ${res.status}`);
      }
      setSubmitMsg({ type: "success", text: status === "submitted" ? "Review submitted successfully." : "Review saved as draft." });
      // Reset form
      setForm({
        staff_name: "",
        review_type: "",
        review_date: new Date().toISOString().slice(0, 10),
        review_period: "",
        reviewed_by: "",
        score_attendance: 0,
        score_work_quality: 0,
        score_teamwork: 0,
        score_customer_service: 0,
        score_rule_compliance: 0,
        strengths: "",
        areas_for_improvement: "",
        notes: "",
        salary_increase_recommended: false,
        salary_increase_amount: 0,
      });
      setPrefillName("");
      setPrefillType("");
      setPrefillScheduleId("");
    } catch (e) {
      setSubmitMsg({ type: "error", text: e instanceof Error ? e.message : "Failed to save review." });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Start Review from schedule ──
  const handleStartReview = (item: ScheduleItem) => {
    setPrefillName(item.staff_name);
    setPrefillType(item.review_type);
    setPrefillScheduleId(item.id);
    setActiveTab("new");
  };

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  // ── Alert summary counts ──
  const overdueCount = schedule.filter((s) => s.alert_level === "OVERDUE").length;
  const urgentCount = schedule.filter((s) => s.alert_level === "URGENT").length;
  const soonCount = schedule.filter((s) => s.alert_level === "SOON").length;

  return (
    <div className="space-y-6 px-4 py-6 md:px-6">
      {/* Page title */}
      <div>
        <h1 className={T_PAGE_TITLE}>HR Performance Reviews</h1>
        <p className={`${T_BODY} mt-1`}>Manila — Performance evaluation cycle management</p>
      </div>

      {/* Tabs */}
      <div className={TAB_CONTAINER}>
        {(["upcoming", "history", "new"] as PageTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={activeTab === tab ? TAB_ACTIVE : TAB_INACTIVE}
          >
            {tab === "upcoming" ? "Upcoming Reviews" : tab === "history" ? "Review History" : "New Review"}
          </button>
        ))}
      </div>

      {/* ── Tab: Upcoming ── */}
      {activeTab === "upcoming" && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
              {([30, 60, 90] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDaysAhead(d)}
                  className={daysAhead === d ? TAB_ACTIVE : TAB_INACTIVE}
                >
                  {d} days
                </button>
              ))}
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className={`${SMALL_BUTTON} flex items-center gap-1.5`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Sync Schedules"}
            </button>
          </div>

          {/* Alert summary badges */}
          {schedule.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className={alertBadgeClass("OVERDUE")}>
                <AlertCircle className="mr-1 h-3 w-3" />
                OVERDUE: {overdueCount}
              </span>
              <span className={alertBadgeClass("URGENT")}>
                <Clock className="mr-1 h-3 w-3" />
                URGENT ≤7d: {urgentCount}
              </span>
              <span className={alertBadgeClass("SOON")}>
                SOON ≤30d: {soonCount}
              </span>
            </div>
          )}

          {/* Error */}
          {scheduleError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {scheduleError}
            </div>
          )}

          {/* Loading */}
          {scheduleLoading && (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            </div>
          )}

          {/* Cards */}
          {!scheduleLoading && schedule.length === 0 && !scheduleError && (
            <div className={`${GLASS_CARD} px-6 py-10 text-center`}>
              <Star className="mx-auto mb-3 h-8 w-8 text-neutral-600" />
              <p className={T_BODY}>No upcoming reviews in the next {daysAhead} days.</p>
            </div>
          )}

          <div className="space-y-3">
            {schedule.map((item) => (
              <div key={item.id} className={`${GLASS_CARD} p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={alertBadgeClass(item.alert_level)}>{item.alert_level}</span>
                    <span className={BADGE_INFO}>{REVIEW_TYPE_LABELS[item.review_type]}</span>
                  </div>
                  <p className={T_CARD_TITLE}>{item.staff_name}</p>
                  <p className={T_CAPTION}>
                    Scheduled: {item.scheduled_date}{" "}
                    <span className={item.days_until_due < 0 ? "text-red-400" : "text-zinc-500"}>
                      ({formatDaysLabel(item.days_until_due)})
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => handleStartReview(item)}
                  className={`${SECONDARY_BUTTON} flex shrink-0 items-center gap-1.5 text-sm`}
                >
                  Start Review
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: History ── */}
      {activeTab === "history" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              className={INPUT_CLASS}
              placeholder="Search by staff name..."
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
            />
            <SelectDark
              className={SELECT_CLASS}
              value={filterType}
              onChange={setFilterType}
              options={[
                { value: "", label: "All review types" },
                ...(Object.keys(REVIEW_TYPE_LABELS) as ReviewType[]).map((k) => ({ value: k, label: REVIEW_TYPE_LABELS[k] })),
              ]}
            />
            <SelectDark
              className={SELECT_CLASS}
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: "", label: "All statuses" },
                { value: "draft", label: "Draft" },
                { value: "submitted", label: "Submitted" },
                { value: "acknowledged", label: "Acknowledged" },
              ]}
            />
          </div>
          <button onClick={fetchReviews} className={`${SMALL_BUTTON} flex items-center gap-1.5`}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>

          {/* Loading */}
          {reviewsLoading && (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            </div>
          )}

          {/* Empty */}
          {!reviewsLoading && reviews.length === 0 && (
            <div className={`${GLASS_CARD} px-6 py-10 text-center`}>
              <Star className="mx-auto mb-3 h-8 w-8 text-neutral-600" />
              <p className={T_BODY}>No reviews found. Adjust filters or create a new review.</p>
            </div>
          )}

          {/* Review cards */}
          <div className="space-y-3">
            {reviews.map((rev) => (
              <div key={rev.id} className={`${GLASS_CARD} p-4 space-y-2`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={BADGE_INFO}>{REVIEW_TYPE_LABELS[rev.review_type]}</span>
                  <span className={gradeBadgeClass(rev.grade)}>{rev.grade}</span>
                  <span className={statusBadgeClass(rev.status)}>{rev.status}</span>
                  <span className={`${T_CAPTION} ml-auto`}>{rev.review_date}</span>
                </div>
                <p className={T_CARD_TITLE}>{rev.staff_name}</p>
                <div className="flex items-center gap-3">
                  <p className={`${totalScoreColor(rev.total_score)} text-sm font-semibold`}>
                    Score: {rev.total_score}/25
                  </p>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`h-3.5 w-3.5 ${n <= Math.round(rev.total_score / 5) ? "fill-amber-400 text-amber-400" : "text-neutral-700"}`}
                      />
                    ))}
                  </div>
                </div>
                <p className={T_CAPTION}>Reviewed by: <span className="text-zinc-300">{rev.reviewed_by}</span></p>
                {rev.strengths && (
                  <p className="line-clamp-1 text-xs text-zinc-500">
                    Strengths: {rev.strengths}
                  </p>
                )}
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => setSelectedReview(rev)}
                    className={`${SMALL_BUTTON} flex items-center gap-1.5`}
                  >
                    View Details
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: New Review ── */}
      {activeTab === "new" && (
        <div className="max-w-2xl space-y-6">
          {/* Prefill indicator */}
          {prefillName && (
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-300">
              Pre-filled from Upcoming: <strong>{prefillName}</strong> — {prefillType ? REVIEW_TYPE_LABELS[prefillType as ReviewType] : ""}
            </div>
          )}

          {/* Basic info */}
          <div className={`${GLASS_CARD} p-5 space-y-4`}>
            <p className={T_SECTION}>Review Information</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={T_LABEL}>Staff Name *</label>
                <input
                  className={INPUT_CLASS}
                  value={form.staff_name}
                  onChange={(e) => setForm((f) => ({ ...f, staff_name: e.target.value }))}
                  placeholder="Full name"
                />
              </div>
              <div className="space-y-1.5">
                <label className={T_LABEL}>Review Type *</label>
                <SelectDark
                  className={SELECT_CLASS}
                  value={form.review_type}
                  onChange={(v) => setForm((f) => ({ ...f, review_type: v as ReviewType }))}
                  options={[
                    { value: "", label: "Select type..." },
                    ...(Object.keys(REVIEW_TYPE_LABELS) as ReviewType[]).map((k) => ({ value: k, label: REVIEW_TYPE_LABELS[k] })),
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                <label className={T_LABEL}>Review Date *</label>
                <input
                  type="date"
                  className={INPUT_CLASS}
                  value={form.review_date}
                  onChange={(e) => setForm((f) => ({ ...f, review_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className={T_LABEL}>Review Period</label>
                <input
                  className={INPUT_CLASS}
                  value={form.review_period}
                  onChange={(e) => setForm((f) => ({ ...f, review_period: e.target.value }))}
                  placeholder="e.g. 2026-Q2"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className={T_LABEL}>Reviewed By *</label>
                <input
                  className={INPUT_CLASS}
                  value={form.reviewed_by}
                  onChange={(e) => setForm((f) => ({ ...f, reviewed_by: e.target.value }))}
                  placeholder="Manager name"
                />
              </div>
            </div>
          </div>

          {/* Performance scores */}
          <div className={`${GLASS_CARD} p-5 space-y-4`}>
            <div>
              <p className={T_SECTION}>Performance Scores</p>
              <p className={`${T_CAPTION} mt-0.5`}>1 = Needs Improvement, 5 = Excellent</p>
            </div>
            {(
              [
                { key: "score_attendance", label: "Attendance & Punctuality" },
                { key: "score_work_quality", label: "Work Quality" },
                { key: "score_teamwork", label: "Teamwork" },
                { key: "score_customer_service", label: "Customer Service" },
                { key: "score_rule_compliance", label: "Rule Compliance" },
              ] as { key: keyof typeof form; label: string }[]
            ).map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="text-sm text-zinc-300 sm:w-48">{label}</label>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <ScoreButton
                      key={n}
                      value={n}
                      selected={form[key] === n}
                      onClick={() => setForm((f) => ({ ...f, [key]: n }))}
                    />
                  ))}
                </div>
              </div>
            ))}

            <div className={DIVIDER} />

            {/* Live total */}
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <span className={T_LABEL}>Total Score</span>
              <div className="flex items-center gap-3">
                <span className={`text-2xl font-bold tabular-nums ${totalScoreColor(totalScore)}`}>
                  {totalScore}
                  <span className="text-sm font-normal text-neutral-500"> / 25</span>
                </span>
                <span className={`text-sm font-semibold ${totalScoreColor(totalScore)}`}>
                  — {grade}
                </span>
              </div>
            </div>
          </div>

          {/* Narrative */}
          <div className={`${GLASS_CARD} p-5 space-y-4`}>
            <p className={T_SECTION}>Narrative</p>
            <div className="space-y-1.5">
              <label className={T_LABEL}>Strengths</label>
              <textarea
                className={`${TEXTAREA_CLASS} h-24`}
                value={form.strengths}
                onChange={(e) => setForm((f) => ({ ...f, strengths: e.target.value }))}
                placeholder="Key strengths observed..."
              />
            </div>
            <div className="space-y-1.5">
              <label className={T_LABEL}>Areas for Improvement</label>
              <textarea
                className={`${TEXTAREA_CLASS} h-24`}
                value={form.areas_for_improvement}
                onChange={(e) => setForm((f) => ({ ...f, areas_for_improvement: e.target.value }))}
                placeholder="Areas that need development..."
              />
            </div>
            <div className="space-y-1.5">
              <label className={T_LABEL}>Notes</label>
              <textarea
                className={`${TEXTAREA_CLASS} h-20`}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Additional notes..."
              />
            </div>
          </div>

          {/* Compensation */}
          <div className={`${GLASS_CARD} p-5 space-y-4`}>
            <p className={T_SECTION}>Compensation</p>
            <div className="flex items-center gap-4">
              <label className={T_LABEL}>Salary Increase Recommended</label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                  <input
                    type="radio"
                    name="salary_increase"
                    checked={form.salary_increase_recommended === true}
                    onChange={() => setForm((f) => ({ ...f, salary_increase_recommended: true }))}
                    className="accent-violet-500"
                  />
                  Yes
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                  <input
                    type="radio"
                    name="salary_increase"
                    checked={form.salary_increase_recommended === false}
                    onChange={() => setForm((f) => ({ ...f, salary_increase_recommended: false, salary_increase_amount: 0 }))}
                    className="accent-violet-500"
                  />
                  No
                </label>
              </div>
            </div>
            {form.salary_increase_recommended && (
              <div className="space-y-1.5">
                <label className={T_LABEL}>Recommended Amount (PHP)</label>
                <input
                  type="number"
                  min={0}
                  className={INPUT_CLASS}
                  value={form.salary_increase_amount || ""}
                  onChange={(e) => setForm((f) => ({ ...f, salary_increase_amount: Number(e.target.value) }))}
                  placeholder="0"
                />
              </div>
            )}
          </div>

          {/* Submit message */}
          {submitMsg && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                submitMsg.type === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-red-500/30 bg-red-500/10 text-red-400"
              }`}
            >
              {submitMsg.text}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleSubmitReview("draft")}
              disabled={submitting}
              className={`${SECONDARY_BUTTON} flex items-center gap-2`}
            >
              {submitting ? "Saving..." : "Save as Draft"}
            </button>
            <button
              onClick={() => handleSubmitReview("submitted")}
              disabled={submitting}
              className={`${PRIMARY_BUTTON} flex items-center gap-2`}
            >
              {submitting ? "Submitting..." : "Submit Review"}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Detail panel */}
      {selectedReview && (
        <ReviewDetailPanel
          review={selectedReview}
          onClose={() => setSelectedReview(null)}
          onAcknowledge={handleAcknowledge}
        />
      )}
    </div>
  );
}
