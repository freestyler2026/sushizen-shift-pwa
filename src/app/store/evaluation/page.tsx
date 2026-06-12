"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Send,
  Camera,
  Trash2,
  ImageIcon,
} from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_LABEL,
  T_CAPTION,
  T_BODY,
  BADGE_SUCCESS,
  BADGE_ERROR,
  BADGE_INFO,
} from "@/lib/ui-tokens";

// ─── Constants ───────────────────────────────────────────────────────────────

const ALLOWED_ROLES = new Set([
  "ADMIN", "HQ", "HR_MANAGER", "MANILA_MANAGEMENT", "MANILA_MANAGER",
]);

const SCORED_KEYS = [
  "backup_score",
  "station_balance_score",
  "quality_score",
  "cleanliness_score",
  "team_support_score",
  "coaching_score",
  "problem_awareness_score",
  "prep_time_score",
  "food_safety_score",
  "organization_score",
  "sop_compliance_score",
] as const;

type ScoredKey = typeof SCORED_KEYS[number];

// Items that have an inline photo button
const PHOTO_ENABLED_KEYS: ReadonlySet<ScoredKey> = new Set([
  "backup_score",
  "station_balance_score",
  "cleanliness_score",
  "problem_awareness_score",
] as ScoredKey[]);

const PHOTO_CATEGORY: Partial<Record<ScoredKey, string>> = {
  backup_score: "backup",
  station_balance_score: "station",
  cleanliness_score: "cleanliness",
  problem_awareness_score: "problem_awareness",
};

const ITEM_LABELS: Record<ScoredKey, string> = {
  backup_score: "Backup",
  station_balance_score: "Station Balance",
  quality_score: "Quality",
  cleanliness_score: "Cleanliness",
  team_support_score: "Team Support",
  coaching_score: "Coaching & Staff Development",
  problem_awareness_score: "Problem Awareness",
  prep_time_score: "Prep Time",
  food_safety_score: "Food Safety",
  organization_score: "Organization & Storage",
  sop_compliance_score: "SOP Compliance",
};

const RUBRICS: Record<ScoredKey, string[]> = {
  backup_score: [
    "No backup prepared — must stop service immediately to prep",
    "Key roles/topping items missing — service will be affected if it gets busy",
    "Core items ready, ~60% overall backup",
    "80%+ backed up, remainder in progress",
    "All items above standard, sufficient backup throughout",
  ],
  station_balance_score: [
    "Operations collapsed — total breakdown",
    "Multiple bottlenecks across stations",
    "One bottleneck identified and managed",
    "Minor adjustments made, mostly smooth",
    "All staff properly positioned, no bottlenecks",
  ],
  quality_score: [
    "Major quality failure (taste, temperature, or texture) — immediate action required. Transport packaging is not a defect.",
    "Multiple quality issues ongoing (e.g. taste, texture, wrong recipe). Does not include dispatch container appearance.",
    "1–2 quality issues (taste/texture/temperature) occurred during service. Container type is excluded from this score.",
    "Minor adjustments made, overall standard maintained",
    "All products met quality standard, no rework required",
  ],
  cleanliness_score: [
    "Kitchen hygiene failure — immediate action required",
    "Multiple stations dirty, ongoing issue",
    "Some stations needed cleaning and were addressed",
    "Minor areas noted and corrected promptly",
    "All stations fully clean and sanitized throughout",
  ],
  team_support_score: [
    "No response to busy sections",
    "Delayed support affected prep time",
    "Support only occurs after instruction, not proactively",
    "Most members appropriately supporting busy sections",
    "All members proactively supporting busy sections ahead of time",
  ],
  coaching_score: [
    "No coaching or feedback given",
    "Verbal reminders only — no structured feedback",
    "1 specific coaching session completed",
    "2 specific coaching sessions completed",
    "3+ specific coaching sessions with targeted guidance",
  ],
  problem_awareness_score: [
    "No awareness of ongoing issues",
    "Issues only noticed when pointed out",
    "Some issues identified, partial or delayed response",
    "Most issues identified and addressed",
    "All issues proactively identified and resolved",
  ],
  prep_time_score: [
    "Operations collapsed — prep completely unmanageable",
    "Continuous delays occurring across service",
    "5+ delays, or delays exceeding 45 min",
    "Minor delays (30–40 min) on high-value orders (2,000 PHP+)",
    "All time slots within management standard",
  ],
  food_safety_score: [
    "No temperature checks done, FIFO not followed at all",
    "Temperature checked once or less; clear FIFO violations present",
    "1–2 temperature checks done; minor FIFO issues observed",
    "2–3 temperature checks done; FIFO mostly followed",
    "All 3 temperature checks completed (fridge & freezer); FIFO fully followed",
  ],
  organization_score: [
    "No organization — no one knows what is where or what stock exists",
    "Multiple areas disorganized; difficult to track stock",
    "Some areas untidy; inventory count takes extra time",
    "Mostly organized; only minor disorder",
    "All areas (incl. fridge & freezer) fully organized; inventory count ready at all times",
  ],
  sop_compliance_score: [
    "SOPs are not being followed. Significant portion control issues or recipe deviations observed.",
    "Frequent SOP violations or inconsistent scale usage. Food cost or quality may be affected.",
    "Some SOP violations or portion control issues observed. Improvement required but no major impact.",
    "Minor SOP deviations observed. Issues are corrected immediately after being identified.",
    "All staff follow SOPs consistently. Scales are properly used and no portion control issues are observed.",
  ],
};

const BINARY_LABELS: Record<string, string> = {
  attendance_check: "Attendance Check",
  report_submission: "Report Submission",
  closing_check: "Closing Check",
  issue_report: "Issue Report",
};

// ─── Types ───────────────────────────────────────────────────────────────────

type AutoData = {
  eval_date: string;
  sales_data_is_prev_day: boolean;
  sales_data_date: string;
  attendance_rate: number | null;
  attendance_present: number | null;
  attendance_scheduled: number | null;
  attendance_date: string;
  cancel_count: number | null;
  cancel_date: string;
  offline_rate_pct: number | null;
  offline_date: string;
  low_rating_count: number | null;
  low_rating_date: string;
  waste_report_submitted: boolean;
  inventory_check_done: boolean;
  purchasing_done: boolean;
};

type FormState = {
  // Binary
  attendance_check: boolean | null;
  report_submission: boolean | null;
  closing_check: boolean | null;
  issue_report: boolean | null;
  // Scored
  backup_score: number | null;
  station_balance_score: number | null;
  quality_score: number | null;
  cleanliness_score: number | null;
  team_support_score: number | null;
  coaching_score: number | null;
  problem_awareness_score: number | null;
  prep_time_score: number | null;
  food_safety_score: number | null;
  organization_score: number | null;
  sop_compliance_score: number | null;
  // Meta
  notes: string;
  score_comments: Record<string, string>;
};

const EMPTY_FORM: FormState = {
  attendance_check: null,
  report_submission: null,
  closing_check: null,
  issue_report: null,
  backup_score: null,
  station_balance_score: null,
  quality_score: null,
  cleanliness_score: null,
  team_support_score: null,
  coaching_score: null,
  problem_awareness_score: null,
  prep_time_score: null,
  food_safety_score: null,
  organization_score: null,
  sop_compliance_score: null,
  notes: "",
  score_comments: {},
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Score = (sum of answered scores / max possible) × 100
// Max possible = 11 items × 5 = 55; all 5s → 100 pts
const MAX_POSSIBLE = SCORED_KEYS.length * 5; // 55

function computeScore(form: FormState): number {
  let sum = 0;
  for (const key of SCORED_KEYS) {
    const v = form[key];
    if (v != null) sum += v;
  }
  return Math.round((sum / MAX_POSSIBLE) * 100 * 10) / 10;
}

function scoredCount(form: FormState): number {
  return SCORED_KEYS.filter((k) => form[k] != null).length;
}

function fmtDate(d: string): string {
  if (!d) return "";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  return "text-red-400";
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function DataRow({
  label,
  value,
  date,
  isPrevDay,
  flag,
}: {
  label: string;
  value: string | number | null;
  date?: string;
  isPrevDay?: boolean;
  flag?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
      <span className={`${T_CAPTION} text-slate-400`}>{label}</span>
      <div className="flex items-center gap-1.5">
        {flag !== undefined ? (
          flag ? (
            <span className={BADGE_SUCCESS}>Submitted</span>
          ) : (
            <span className={BADGE_ERROR}>Not submitted</span>
          )
        ) : (
          <span className="text-sm font-medium text-white">
            {value == null ? "—" : value}
          </span>
        )}
        {date && (
          <span className={`${T_CAPTION} text-slate-500 ml-1`}>
            {fmtDate(date)}
            {isPrevDay && (
              <span className="ml-1 text-amber-400" title="Syncing — fully available after 14:00 PHT">⚠</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

function BinaryToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className={`${T_BODY} font-medium`}>{label}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            value === true
              ? "bg-emerald-500 text-white"
              : "bg-white/5 text-slate-400 hover:bg-white/10"
          }`}
        >
          ✓ Done
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            value === false
              ? "bg-red-500/70 text-white"
              : "bg-white/5 text-slate-400 hover:bg-white/10"
          }`}
        >
          ✗ No
        </button>
      </div>
    </div>
  );
}

function ScoreSelector({
  label,
  value,
  rubric,
  onChange,
  comment = "",
  onCommentChange,
  excludeNote,
  photoEnabled = false,
  pendingPhotos = [],
  onAddPhoto,
  onRemovePhoto,
}: {
  label: string;
  value: number | null;
  rubric: string[];
  onChange: (v: number) => void;
  comment?: string;
  onCommentChange?: (v: string) => void;
  excludeNote?: string;
  photoEnabled?: boolean;
  pendingPhotos?: PendingPhoto[];
  onAddPhoto?: (file: File) => void;
  onRemovePhoto?: (localId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onAddPhoto) onAddPhoto(file);
    if (e.target) e.target.value = "";
  };

  return (
    <div className={`${GLASS_CARD} p-3 mb-2`}>
      {/* Header: label + photo button + score */}
      <div className="flex items-center justify-between mb-2">
        <span className={`${T_BODY} font-semibold`}>{label}</span>
        <div className="flex items-center gap-2">
          {photoEnabled && (
            <label className="cursor-pointer text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1">
              <Camera size={15} />
              {pendingPhotos.length > 0 && (
                <span className="text-[10px] font-bold bg-violet-500/30 px-1.5 py-0.5 rounded-full">
                  {pendingPhotos.length}
                </span>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          )}
          <span className={`text-sm font-bold ${value ? "text-white" : "text-slate-500"}`}>
            {value ?? "—"}/5
          </span>
        </div>
      </div>

      {/* Exclusion note banner */}
      {excludeNote && (
        <div className="flex items-start gap-1.5 bg-slate-700/40 border border-slate-600/40 rounded-lg px-2.5 py-2 mb-2.5">
          <span className="text-[11px] shrink-0 mt-px">ℹ️</span>
          <p className="text-[11px] text-slate-400 leading-relaxed">{excludeNote}</p>
        </div>
      )}

      {/* Rubric — always visible; selected row is highlighted */}
      <div className="space-y-1 mb-3">
        {rubric.map((desc, i) => {
          const n = i + 1;
          const isSelected = value === n;
          const numColor = n <= 2 ? "text-red-400" : n === 3 ? "text-amber-400" : "text-emerald-400";
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`w-full flex gap-2 items-start text-left rounded-lg px-2 py-1.5 transition-all ${
                isSelected
                  ? n <= 2
                    ? "bg-red-500/15 border border-red-500/30"
                    : n === 3
                    ? "bg-amber-500/15 border border-amber-500/30"
                    : "bg-emerald-500/15 border border-emerald-500/30"
                  : "hover:bg-white/5 border border-transparent"
              }`}
            >
              <span className={`text-xs font-bold w-4 shrink-0 mt-0.5 ${numColor}`}>{n}</span>
              <span className={`${T_CAPTION} leading-relaxed ${isSelected ? "text-white" : "text-slate-400"}`}>
                {desc}
              </span>
            </button>
          );
        })}
      </div>

      {/* 1-5 quick-select buttons */}
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`flex-1 py-1.5 rounded-lg text-sm font-bold transition-all ${
              value === n
                ? n <= 2
                  ? "bg-red-500 text-white"
                  : n === 3
                  ? "bg-amber-500 text-white"
                  : "bg-emerald-500 text-white"
                : "bg-white/5 text-slate-400 hover:bg-white/10"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      {/* Per-item comment field */}
      <div className="mt-2 pt-2 border-t border-white/5">
        <textarea
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 resize-none focus:outline-none focus:border-violet-500/50 focus:bg-white/8 transition-colors"
          rows={2}
          maxLength={400}
          placeholder="Issue description (optional) — max 400 chars"
          value={comment}
          onChange={(e) => onCommentChange?.(e.target.value)}
        />
        {comment.length > 0 && (
          <p className="text-right text-[10px] text-slate-500 mt-0.5">{comment.length}/400</p>
        )}
      </div>

      {/* Pending photo thumbnails */}
      {photoEnabled && pendingPhotos.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/5">
          <div className="flex gap-2 flex-wrap">
            {pendingPhotos.map((p) => (
              <div key={p.localId} className="relative w-14 h-14 rounded-lg overflow-hidden bg-white/5 group shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.previewUrl} alt="preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => onRemovePhoto?.(p.localId)}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={14} className="text-red-400" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Photo types ─────────────────────────────────────────────────────────────

type PendingPhoto = {
  localId: string;   // temp ID for removal before submit
  file: File;
  previewUrl: string;
  category: string;
};

type EvalImage = {
  id: string;
  category: string;
  drive_file_id: string;
  original_name: string;
  mime_type: string;
  uploaded_at: string;
};

const PHOTO_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "backup", label: "Backup" },
  { value: "station", label: "Station Balance" },
  { value: "quality", label: "Quality" },
  { value: "cleanliness", label: "Cleanliness" },
  { value: "team_support", label: "Team Support" },
  { value: "coaching", label: "Coaching" },
  { value: "prep_time", label: "Prep Time" },
  { value: "issue", label: "Issue / Problem" },
];

// ─── Photo Panel ─────────────────────────────────────────────────────────────

function PhotoPanel({
  evaluationId,
  branchCode,
  evalDate,
}: {
  evaluationId: string;
  branchCode: string;
  evalDate: string;
}) {
  const [images, setImages] = useState<EvalImage[]>([]);
  const [category, setCategory] = useState("general");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Load existing images
  useEffect(() => {
    fetch(`/api/store/evaluation/images/${evaluationId}`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setImages(d.images || []))
      .catch(() => {});
  }, [evaluationId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadErr("");

    const form = new FormData();
    form.append("evaluation_id", evaluationId);
    form.append("branch_code", branchCode);
    form.append("eval_date", evalDate);
    form.append("category", category);
    form.append("file", file);

    try {
      const headers = getAuthHeaders() as Record<string, string>;
      // Don't set Content-Type — browser sets multipart boundary automatically
      delete headers["Content-Type"];
      const res = await fetch("/api/store/evaluation/upload-image", {
        method: "POST",
        headers,
        body: form,
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed.");
      setImages((prev) => [...prev, data.image]);
    } catch (err: any) {
      setUploadErr(err.message || "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async (imageId: string) => {
    try {
      const res = await fetch(`/api/store/evaluation/image/${imageId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
        cache: "no-store",
      });
      if (res.ok) setImages((prev) => prev.filter((i) => i.id !== imageId));
    } catch {}
  };

  return (
    <div className={`${GLASS_CARD} p-4 mt-4`}>
      <div className="flex items-center gap-2 mb-3">
        <Camera size={16} className="text-violet-400" />
        <h2 className={T_SECTION}>Photos</h2>
        <span className={`${T_CAPTION} text-slate-400`}>{images.length} uploaded</span>
      </div>

      {/* Category + Upload row */}
      <div className="flex gap-2 mb-3">
        <select
          className={`${SELECT_CLASS} flex-1`}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {PHOTO_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <label className={`${PRIMARY_BUTTON} flex items-center gap-2 cursor-pointer shrink-0`}>
          {uploading ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : (
            <Camera size={16} />
          )}
          {uploading ? "Uploading..." : "Add Photo"}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      </div>

      {uploadErr && (
        <p className={`${T_CAPTION} text-red-400 mb-2`}>
          <XCircle size={12} className="inline mr-1" />{uploadErr}
        </p>
      )}

      {/* Image grid */}
      {images.length === 0 ? (
        <div className="flex flex-col items-center py-6 gap-2 text-slate-600">
          <ImageIcon size={28} />
          <p className={T_CAPTION}>No photos yet. Tap Add Photo to upload.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative group rounded-xl overflow-hidden bg-white/5 aspect-square">
              {img.drive_file_id ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/store/evaluation/image-proxy/${img.drive_file_id}`}
                  alt={img.category}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <ImageIcon size={20} className="text-slate-600" />
                </div>
              )}
              {/* Category label */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5">
                <p className="text-[9px] text-white truncate">{img.category}</p>
              </div>
              {/* Delete button */}
              <button
                type="button"
                onClick={() => handleDelete(img.id)}
                className="absolute top-1 right-1 bg-black/60 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={12} className="text-red-400" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function StoreEvaluationPage() {
  const router = useRouter();
  const auth = getAuth();
  const role = (auth?.role || "").toUpperCase();

  // Auth guard
  useEffect(() => {
    if (!ALLOWED_ROLES.has(role)) {
      router.replace("/week");
    }
  }, [role, router]);

  const [branches, setBranches] = useState<string[]>([]);
  const [branchCode, setBranchCode] = useState("");
  const [autoData, setAutoData] = useState<AutoData | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Pending inline photos: keyed by ScoredKey
  const [pendingPhotos, setPendingPhotos] = useState<Record<string, PendingPhoto[]>>({});

  const todayPH = (() => {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  })();

  const yesterdayPH = (() => {
    const parts = todayPH.split("-").map(Number);
    const dt = new Date(parts[0], parts[1] - 1, parts[2] - 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  })();

  // evalDate: which day's evaluation this form is for (default: yesterday)
  const [evalDate, setEvalDate] = useState(yesterdayPH);

  // Load branch list
  useEffect(() => {
    const headers = getAuthHeaders();
    fetch("/api/store/evaluation/branches", { headers, cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.branches?.length) setBranches(d.branches);
      })
      .catch(() => {});
  }, []);

  // Load existing evaluation + auto-data when branch changes
  const loadBranchData = useCallback(
    async (bc: string) => {
      if (!bc) return;
      setAutoLoading(true);
      setSubmitMsg(null);
      const headers = getAuthHeaders();

      try {
        // Check for existing submission on the selected eval date
        const existRes = await fetch(
          `/api/store/evaluation/today?branch_code=${encodeURIComponent(bc)}&eval_date=${evalDate}`,
          { headers, cache: "no-store" }
        );
        const existData = await existRes.json();
        if (existData.evaluation) {
          const ev = existData.evaluation;
          setExistingId(ev.id);
          setForm({
            attendance_check: ev.attendance_check ?? null,
            report_submission: ev.report_submission ?? null,
            closing_check: ev.closing_check ?? null,
            issue_report: ev.issue_report ?? null,
            backup_score: ev.backup_score ?? null,
            station_balance_score: ev.station_balance_score ?? null,
            quality_score: ev.quality_score ?? null,
            cleanliness_score: ev.cleanliness_score ?? null,
            team_support_score: ev.team_support_score ?? null,
            coaching_score: ev.coaching_score ?? null,
            problem_awareness_score: ev.problem_awareness_score ?? null,
            prep_time_score: ev.prep_time_score ?? null,
            food_safety_score: ev.food_safety_score ?? null,
            organization_score: ev.organization_score ?? null,
            sop_compliance_score: ev.sop_compliance_score ?? null,
            notes: ev.notes || "",
            score_comments: (ev.score_comments as Record<string, string>) || {},
          });
        } else {
          setExistingId(null);
          setForm(EMPTY_FORM);
        }

        // Fetch auto-data for the selected eval date
        const autoRes = await fetch(
          `/api/store/evaluation/auto-data?branch_code=${encodeURIComponent(bc)}&eval_date=${evalDate}`,
          { headers, cache: "no-store" }
        );
        const ad = await autoRes.json();
        setAutoData(ad);
      } catch {
        // silently fail auto-data
      } finally {
        setAutoLoading(false);
      }
    },
    [evalDate]
  );

  useEffect(() => {
    if (branchCode) loadBranchData(branchCode);
  }, [branchCode, loadBranchData]);

  const totalScore = computeScore(form);
  const scored = scoredCount(form);
  const allScored = scored === SCORED_KEYS.length;

  const setScore = (key: ScoredKey, v: number) =>
    setForm((f) => ({ ...f, [key]: v }));
  const setBinary = (key: string, v: boolean) =>
    setForm((f) => ({ ...f, [key]: v }));

  const handleAddPhoto = (key: ScoredKey, file: File) => {
    const previewUrl = URL.createObjectURL(file);
    const localId = `${key}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const category = PHOTO_CATEGORY[key] ?? key.replace("_score", "");
    const photo: PendingPhoto = { localId, file, previewUrl, category };
    setPendingPhotos((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), photo] }));
  };

  const handleRemovePhoto = (key: ScoredKey, localId: string) => {
    setPendingPhotos((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).filter((p) => p.localId !== localId),
    }));
  };

  const totalPendingCount = Object.values(pendingPhotos).reduce((s, arr) => s + arr.length, 0);

  const handleSubmit = async () => {
    if (!branchCode) {
      setSubmitMsg({ ok: false, text: "Please select a branch." });
      return;
    }
    if (!allScored) {
      setSubmitMsg({ ok: false, text: `Please rate all 8 items (${scored}/8 done).` });
      return;
    }

    setSubmitting(true);
    setSubmitMsg(null);

    const payload = {
      branch_code: branchCode,
      eval_date: evalDate,
      ...form,
      // Snapshot auto-data at submit time
      auto_attendance_rate: autoData?.attendance_rate ?? null,
      auto_attendance_date: autoData?.attendance_date ?? null,
      auto_cancel_count: autoData?.cancel_count ?? null,
      auto_cancel_date: autoData?.cancel_date ?? null,
      auto_offline_rate_pct: autoData?.offline_rate_pct ?? null,
      auto_offline_date: autoData?.offline_date ?? null,
      auto_low_rating_count: autoData?.low_rating_count ?? null,
      auto_low_rating_date: autoData?.low_rating_date ?? null,
      waste_report_submitted: autoData?.waste_report_submitted ?? false,
      inventory_check_done: autoData?.inventory_check_done ?? false,
      purchasing_done: autoData?.purchasing_done ?? false,
    };

    try {
      const res = await fetch("/api/store/evaluation/submit", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Submission failed.");
      const evalId: string = data.evaluation?.id ?? existingId ?? "";
      setExistingId(evalId);

      // Upload any pending inline photos
      const allPending = Object.values(pendingPhotos).flat();
      if (allPending.length > 0 && evalId) {
        for (const photo of allPending) {
          try {
            const fd = new FormData();
            fd.append("evaluation_id", evalId);
            fd.append("branch_code", branchCode);
            fd.append("eval_date", evalDate);
            fd.append("category", photo.category);
            fd.append("file", photo.file);
            const headers = getAuthHeaders() as Record<string, string>;
            delete headers["Content-Type"];
            await fetch("/api/store/evaluation/upload-image", {
              method: "POST",
              headers,
              body: fd,
              cache: "no-store",
            });
          } catch {
            // Don't fail the whole submit if one photo fails
          }
        }
        setPendingPhotos({});
      }

      setSubmitMsg({
        ok: true,
        text: existingId
          ? `Evaluation updated${allPending.length > 0 ? ` + ${allPending.length} photo(s) uploaded` : ""}.`
          : `Submitted${allPending.length > 0 ? ` with ${allPending.length} photo(s)` : ""}.`,
      });
    } catch (e: any) {
      setSubmitMsg({ ok: false, text: e.message || "Submission failed." });
    } finally {
      setSubmitting(false);
    }
  };

  if (!ALLOWED_ROLES.has(role)) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pb-28">
      <div className="max-w-lg mx-auto px-4 pt-6">

        {/* Header */}
        <div className="mb-5">
          <h1 className={T_PAGE_TITLE}>Daily Store Evaluation</h1>
          <p className={`${T_CAPTION} text-slate-400 mt-1`}>
            {new Date().toLocaleDateString("en-PH", {
              timeZone: "Asia/Manila",
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {/* Evaluation Date selector */}
        <div className={`${GLASS_CARD} p-4 mb-4`}>
          <label className={`${T_LABEL} mb-1 block`}>Evaluation Date</label>
          <p className={`${T_CAPTION} text-slate-400 mb-3`}>
            Which date are you evaluating? (Usually yesterday)
          </p>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setEvalDate(yesterdayPH)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                evalDate === yesterdayPH
                  ? "bg-violet-500/20 border border-violet-500/40 text-violet-300"
                  : "bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10"
              }`}
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => setEvalDate(todayPH)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                evalDate === todayPH
                  ? "bg-violet-500/20 border border-violet-500/40 text-violet-300"
                  : "bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10"
              }`}
            >
              Today
            </button>
          </div>
          <input
            type="date"
            className={INPUT_CLASS}
            value={evalDate}
            max={todayPH}
            onChange={(e) => setEvalDate(e.target.value)}
          />
          <p className={`${T_CAPTION} text-violet-400 mt-2`}>
            📅 Evaluating: {new Date(evalDate + "T12:00:00").toLocaleDateString("en-PH", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
          </p>
        </div>

        {/* Branch selector */}
        <div className={`${GLASS_CARD} p-4 mb-4`}>
          <label className={`${T_LABEL} mb-2 block`}>Branch</label>
          <select
            className={SELECT_CLASS}
            value={branchCode}
            onChange={(e) => setBranchCode(e.target.value)}
          >
            <option value="">— Select branch —</option>
            {branches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          {existingId && (
            <div className={`${BADGE_INFO} mt-2 inline-block`}>
              Editing existing evaluation for {evalDate}
            </div>
          )}
        </div>

        {/* Running score pill */}
        {branchCode && (
          <div className={`${GLASS_CARD} p-4 mb-4 flex items-center justify-between`}>
            <div>
              <p className={T_LABEL}>Total Score</p>
              <p className={`text-3xl font-bold ${scoreColor(totalScore)}`}>
                {totalScore.toFixed(1)}
                <span className="text-base font-normal text-slate-400"> / 100</span>
              </p>
              <p className={`${T_CAPTION} text-slate-500 mt-0.5`}>
                {scored}/{SCORED_KEYS.length} items rated
              </p>
            </div>
            {/* Progress bar */}
            <div className="w-24">
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    totalScore >= 80
                      ? "bg-emerald-400"
                      : totalScore >= 60
                      ? "bg-amber-400"
                      : "bg-red-400"
                  }`}
                  style={{ width: `${Math.min(totalScore, 100)}%` }}
                />
              </div>
              <p className={`${T_CAPTION} text-center mt-1 ${scoreColor(totalScore)}`}>
                {totalScore >= 80 ? "Good" : totalScore >= 60 ? "Needs Work" : "Critical"}
              </p>
            </div>
          </div>
        )}

        {/* Auto-data reference panel */}
        {branchCode && (
          <div className={`${GLASS_CARD} p-4 mb-4`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className={T_SECTION}>Reference Data</h2>
              {autoLoading ? (
                <RefreshCw size={14} className="animate-spin text-slate-400" />
              ) : (
                <button
                  type="button"
                  onClick={() => loadBranchData(branchCode)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <RefreshCw size={14} />
                </button>
              )}
            </div>

            {autoData?.sales_data_is_prev_day && (
              <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle size={12} className="text-amber-400 shrink-0" />
                <p className={`${T_CAPTION} text-amber-300`}>
                  Sales data is still syncing — fully available after 14:00 PHT
                </p>
              </div>
            )}

            <DataRow
              label="Attendance Rate"
              value={
                autoData?.attendance_rate != null
                  ? `${autoData.attendance_rate}% (${autoData.attendance_present}/${autoData.attendance_scheduled})`
                  : null
              }
              date={autoData?.attendance_date}
            />
            <DataRow
              label="Cancel Count"
              value={autoData?.cancel_count ?? null}
              date={autoData?.cancel_date}
              isPrevDay={autoData?.sales_data_is_prev_day}
            />
            <DataRow
              label="Offline Rate"
              value={
                autoData?.offline_rate_pct != null
                  ? `${autoData.offline_rate_pct}%`
                  : null
              }
              date={autoData?.offline_date}
              isPrevDay={autoData?.sales_data_is_prev_day}
            />
            <DataRow
              label="Low Ratings"
              value={autoData?.low_rating_count ?? null}
              date={autoData?.low_rating_date}
              isPrevDay={autoData?.sales_data_is_prev_day}
            />
            <DataRow
              label="Waste Report"
              value={null}
              flag={autoData?.waste_report_submitted}
            />
            <DataRow
              label="Daily Inventory"
              value={null}
              flag={autoData?.inventory_check_done}
            />
            <DataRow
              label="Procurement Order"
              value={null}
              flag={autoData?.purchasing_done}
            />
          </div>
        )}

        {/* Form body — only show when branch is selected */}
        {branchCode && (
          <>
            {/* Section 1: Compliance checks */}
            <div className={`${GLASS_CARD} p-4 mb-4`}>
              <h2 className={`${T_SECTION} mb-3`}>Implementation Check</h2>
              <p className={`${T_CAPTION} text-slate-400 mb-3`}>
                Compliance items — tracked separately from score
              </p>
              {Object.entries(BINARY_LABELS).map(([key, label]) => (
                <div key={key} className="border-b border-white/5 last:border-0">
                  <BinaryToggle
                    label={label}
                    value={form[key as keyof FormState] as boolean | null}
                    onChange={(v) => setBinary(key, v)}
                  />
                </div>
              ))}
            </div>

            {/* Section 2: Scored items */}
            <div className="mb-4">
              <h2 className={`${T_SECTION} mb-3`}>Store Evaluation (100 pts)</h2>
              <p className={`${T_CAPTION} text-slate-400 mb-3`}>
                Each item scored 1–5 · Click any criteria row or number button to select
              </p>
              {SCORED_KEYS.map((key) => (
                <ScoreSelector
                  key={key}
                  label={ITEM_LABELS[key]}
                  value={form[key]}
                  rubric={RUBRICS[key]}
                  onChange={(v) => setScore(key, v)}
                  comment={form.score_comments[key] ?? ""}
                  onCommentChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      score_comments: { ...f.score_comments, [key]: v },
                    }))
                  }
                  excludeNote={
                    key === "quality_score"
                      ? "Transport packaging (e.g. plastic containers for soup/broth dispatch) is excluded from presentation assessment. Score based on taste, temperature, and texture only."
                      : undefined
                  }
                  photoEnabled={PHOTO_ENABLED_KEYS.has(key)}
                  pendingPhotos={pendingPhotos[key] ?? []}
                  onAddPhoto={(file) => handleAddPhoto(key, file)}
                  onRemovePhoto={(localId) => handleRemovePhoto(key, localId)}
                />
              ))}
            </div>

            {/* Notes */}
            <div className={`${GLASS_CARD} p-4 mb-4`}>
              <label className={`${T_LABEL} mb-2 block`}>Notes (optional)</label>
              <textarea
                className={TEXTAREA_CLASS}
                rows={3}
                placeholder="Key observations, issues flagged, actions taken..."
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

            {/* Submit */}
            {submitMsg && (
              <div
                className={`p-3 rounded-xl mb-3 text-sm font-medium ${
                  submitMsg.ok
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-red-500/20 text-red-300 border border-red-500/30"
                }`}
              >
                {submitMsg.ok ? (
                  <CheckCircle2 size={14} className="inline mr-1.5" />
                ) : (
                  <XCircle size={14} className="inline mr-1.5" />
                )}
                {submitMsg.text}
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !allScored}
              className={`${PRIMARY_BUTTON} w-full py-4 text-base font-semibold flex items-center justify-center gap-2 ${
                !allScored ? "opacity-50" : ""
              }`}
            >
              {submitting ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
              {submitting
                ? `Submitting${totalPendingCount > 0 ? ` + ${totalPendingCount} photo(s)` : ""}...`
                : existingId
                ? `Update Evaluation${totalPendingCount > 0 ? ` · 📷 ${totalPendingCount}` : ""}`
                : `Submit Evaluation${totalPendingCount > 0 ? ` · 📷 ${totalPendingCount}` : ""}`}
            </button>

            {!allScored && (
              <p className={`${T_CAPTION} text-center text-slate-500 mt-2`}>
                Rate all {SCORED_KEYS.length} items to enable submission ({scored}/{SCORED_KEYS.length} done)
              </p>
            )}

            {/* Photo panel — shown after first submit */}
            {existingId && (
              <PhotoPanel
                evaluationId={existingId}
                branchCode={branchCode}
                evalDate={evalDate}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
