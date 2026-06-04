"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  TrendingUp,
  ClipboardList,
  Calendar,
  ImageIcon,
  ExternalLink,
  Settings,
  Save,
  Plus,
  BarChart3,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  Cell,
} from "recharts";
import { getAuth, canAccessAdminNav, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  INPUT_CLASS,
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
  T_LABEL,
  T_CAPTION,
  T_BODY,
} from "@/lib/ui-tokens";

// ─── Types ───────────────────────────────────────────────────────────────────

type EvalRow = {
  id: string;
  branch_code: string;
  eval_date: string;
  evaluator_name: string;
  total_score: number | null;
  // Scored items
  backup_score: number | null;
  station_balance_score: number | null;
  quality_score: number | null;
  cleanliness_score: number | null;
  team_support_score: number | null;
  coaching_score: number | null;
  problem_awareness_score: number | null;
  prep_time_score: number | null;
  // Binary
  attendance_check: boolean | null;
  report_submission: boolean | null;
  closing_check: boolean | null;
  issue_report: boolean | null;
  // Auto
  auto_attendance_rate: number | null;
  auto_cancel_count: number | null;
  auto_offline_rate_pct: number | null;
  auto_low_rating_count: number | null;
  // Flags
  waste_report_submitted: boolean;
  inventory_check_done: boolean;
  purchasing_done: boolean;
  // Meta
  submitted_at: string;
  updated_at: string;
  image_count?: number;
};

type TrendRow = {
  eval_date: string;
  total_score: number | null;
  evaluator_name: string;
  backup_score: number | null;
  station_balance_score: number | null;
  quality_score: number | null;
  cleanliness_score: number | null;
  team_support_score: number | null;
  coaching_score: number | null;
  problem_awareness_score: number | null;
  prep_time_score: number | null;
  attendance_check: boolean | null;
  report_submission: boolean | null;
  closing_check: boolean | null;
  issue_report: boolean | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SCORE_LABELS: Record<string, string> = {
  backup_score: "Backup",
  station_balance_score: "Station",
  quality_score: "Quality",
  cleanliness_score: "Clean",
  team_support_score: "Team",
  coaching_score: "Coaching",
  problem_awareness_score: "Awareness",
  prep_time_score: "Prep Time",
};

const BINARY_LABELS: Record<string, string> = {
  attendance_check: "Attendance",
  report_submission: "Report",
  closing_check: "Closing",
  issue_report: "Issue Report",
};

function scoreColor(s: number | null) {
  if (s == null) return "text-slate-500";
  if (s >= 80) return "text-emerald-400";
  if (s >= 60) return "text-amber-400";
  return "text-red-400";
}

function scoreBg(s: number | null) {
  if (s == null) return "bg-slate-700";
  if (s >= 80) return "bg-emerald-500/20 border-emerald-500/30";
  if (s >= 60) return "bg-amber-500/20 border-amber-500/30";
  return "bg-red-500/20 border-red-500/30";
}

function fmtDate(d: string) {
  if (!d) return "—";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

function BoolIcon({ v }: { v: boolean | null }) {
  if (v == null) return <span className="text-slate-500 text-xs">—</span>;
  return v ? (
    <CheckCircle2 size={14} className="text-emerald-400" />
  ) : (
    <XCircle size={14} className="text-red-400" />
  );
}

function ScorePip({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-500 text-xs">—</span>;
  const color =
    value >= 4 ? "bg-emerald-500" : value === 3 ? "bg-amber-500" : "bg-red-500";
  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white ${color}`}
    >
      {value}
    </span>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

type EvalImage = {
  id: string;
  category: string;
  drive_file_id: string;
  drive_web_link: string;
  original_name: string;
  uploaded_at: string;
};

function EvalDetailModal({
  ev,
  onClose,
}: {
  ev: EvalRow;
  onClose: () => void;
}) {
  const [images, setImages] = useState<EvalImage[]>([]);
  const [imgLoading, setImgLoading] = useState(true);

  useEffect(() => {
    setImgLoading(true);
    fetch(`/api/store/evaluation/images/${ev.id}`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setImages(d.images || []))
      .catch(() => {})
      .finally(() => setImgLoading(false));
  }, [ev.id]);

  const SCORED_KEYS = [
    "backup_score", "station_balance_score", "quality_score",
    "cleanliness_score", "team_support_score", "coaching_score",
    "problem_awareness_score", "prep_time_score",
  ] as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-white/10 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className={T_SECTION}>{ev.branch_code}</h2>
            <p className={`${T_CAPTION} text-slate-400`}>
              {fmtDate(ev.eval_date)} · {ev.evaluator_name}
            </p>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-bold ${scoreColor(ev.total_score)}`}>
              {ev.total_score?.toFixed(1) ?? "—"}
            </p>
            <p className={`${T_CAPTION} text-slate-500`}>/ 100</p>
          </div>
        </div>

        {/* Scored items grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {SCORED_KEYS.map((key) => (
            <div key={key} className={`${GLASS_CARD} p-3 flex items-center justify-between`}>
              <span className={`${T_CAPTION} text-slate-400`}>{SCORE_LABELS[key]}</span>
              <div className="flex items-center gap-1">
                <ScorePip value={ev[key]} />
                <span className={`${T_CAPTION} text-slate-500`}>
                  {ev[key] != null ? `(${(ev[key]! * 2.5).toFixed(1)})` : ""}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Compliance */}
        <div className={`${GLASS_CARD} p-3 mb-4`}>
          <p className={`${T_LABEL} mb-2`}>Compliance</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(BINARY_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <BoolIcon v={ev[key as keyof EvalRow] as boolean | null} />
                <span className={`${T_CAPTION} text-slate-300`}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Reference data */}
        <div className={`${GLASS_CARD} p-3 mb-4`}>
          <p className={`${T_LABEL} mb-2`}>Reference Data (at submission)</p>
          <div className="grid grid-cols-2 gap-y-2">
            <span className={`${T_CAPTION} text-slate-400`}>Attendance</span>
            <span className="text-sm text-white text-right">
              {ev.auto_attendance_rate != null ? `${ev.auto_attendance_rate}%` : "—"}
            </span>
            <span className={`${T_CAPTION} text-slate-400`}>Cancel Count</span>
            <span className="text-sm text-white text-right">
              {ev.auto_cancel_count ?? "—"}
            </span>
            <span className={`${T_CAPTION} text-slate-400`}>Offline Rate</span>
            <span className="text-sm text-white text-right">
              {ev.auto_offline_rate_pct != null ? `${ev.auto_offline_rate_pct}%` : "—"}
            </span>
            <span className={`${T_CAPTION} text-slate-400`}>Low Ratings</span>
            <span className="text-sm text-white text-right">
              {ev.auto_low_rating_count ?? "—"}
            </span>
            <span className={`${T_CAPTION} text-slate-400`}>Waste Report</span>
            <span className="text-right">
              <BoolIcon v={ev.waste_report_submitted} />
            </span>
            <span className={`${T_CAPTION} text-slate-400`}>Daily Inventory</span>
            <span className="text-right">
              <BoolIcon v={ev.inventory_check_done} />
            </span>
            <span className={`${T_CAPTION} text-slate-400`}>Procurement</span>
            <span className="text-right">
              <BoolIcon v={ev.purchasing_done} />
            </span>
          </div>
        </div>

        {/* Photos section */}
        <div className={`${GLASS_CARD} p-3 mb-4`}>
          <div className="flex items-center justify-between mb-2">
            <p className={T_LABEL}>Photos</p>
            {imgLoading && <RefreshCw size={12} className="animate-spin text-slate-400" />}
          </div>
          {!imgLoading && images.length === 0 ? (
            <div className="flex items-center gap-2 py-3 text-slate-600">
              <ImageIcon size={16} />
              <span className={T_CAPTION}>No photos uploaded</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="relative rounded-xl overflow-hidden bg-white/5 aspect-square group"
                >
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
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5 flex items-center justify-between">
                    <p className="text-[9px] text-white truncate">{img.category}</p>
                    {img.drive_web_link && (
                      <a
                        href={img.drive_web_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-300 hover:text-white"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button type="button" onClick={onClose} className={`${SECONDARY_BUTTON} w-full`}>
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Trend view ───────────────────────────────────────────────────────────────

function TrendView({ branch, city }: { branch: string; city: string }) {
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (!branch) return;
    setLoading(true);
    fetch(
      `/api/admin/store-evaluations/trend?branch_code=${encodeURIComponent(branch)}&city=${city}&days=${days}`,
      { headers: getAuthHeaders(), cache: "no-store" }
    )
      .then((r) => r.json())
      .then((d) => setTrend(d.trend || []))
      .finally(() => setLoading(false));
  }, [branch, city, days]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className={T_SECTION}>{branch} — Trend</h2>
        <select
          className={`${SELECT_CLASS} w-28`}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
          <option value={30}>30 days</option>
          <option value={60}>60 days</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <RefreshCw size={20} className="animate-spin text-slate-400" />
        </div>
      ) : trend.length === 0 ? (
        <p className={`${T_BODY} text-slate-400 text-center py-10`}>No evaluations found.</p>
      ) : (
        <div className="space-y-2">
          {trend.map((row) => (
            <div key={row.eval_date} className={`${GLASS_CARD} p-3`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className={`${T_BODY} font-semibold`}>{fmtDate(row.eval_date)}</span>
                  <span className={`${T_CAPTION} text-slate-400 ml-2`}>{row.evaluator_name}</span>
                </div>
                <span className={`text-xl font-bold ${scoreColor(row.total_score)}`}>
                  {row.total_score?.toFixed(1) ?? "—"}
                </span>
              </div>
              {/* Score dots */}
              <div className="flex gap-1 flex-wrap">
                {[
                  "backup_score", "station_balance_score", "quality_score",
                  "cleanliness_score", "team_support_score", "coaching_score",
                  "problem_awareness_score", "prep_time_score",
                ].map((k) => (
                  <div key={k} className="flex flex-col items-center">
                    <ScorePip value={row[k as keyof TrendRow] as number | null} />
                    <span className="text-[8px] text-slate-500 mt-0.5 w-6 text-center truncate">
                      {SCORE_LABELS[k]?.slice(0, 3)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Chart helpers ────────────────────────────────────────────────────────────

const BRANCH_COLORS = [
  "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#3b82f6", "#84cc16",
  "#f97316", "#a855f7",
];

const CATEGORY_KEYS = [
  { key: "avg_backup",            label: "Backup" },
  { key: "avg_station_balance",   label: "Station" },
  { key: "avg_quality",           label: "Quality" },
  { key: "avg_cleanliness",       label: "Cleanl." },
  { key: "avg_team_support",      label: "Team" },
  { key: "avg_coaching",          label: "Coaching" },
  { key: "avg_problem_awareness", label: "Awareness" },
  { key: "avg_prep_time",         label: "Prep" },
];

type WeeklyRow = {
  week_start: string;
  branch_code: string;
  avg_score: number;
  submission_count: number;
  compliance_rate: number;
  [key: string]: any;
};

type SubmissionRow = {
  branch_code: string;
  avg_score: number;
  submission_rate_pct: number;
  submitted_days: number;
  total_days: number;
  [key: string]: any;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-white/10 rounded-xl p-3 text-xs shadow-xl">
      <p className="text-slate-300 font-semibold mb-2">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="mb-0.5">
          {p.name}: <span className="font-bold">{typeof p.value === "number" ? p.value.toFixed(1) : p.value}</span>
        </p>
      ))}
    </div>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ city }: { city: string }) {
  const [weeks, setWeeks] = useState(8);
  const [weeklyData, setWeeklyData] = useState<WeeklyRow[]>([]);
  const [submissionData, setSubmissionData] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [weekRes, subRes] = await Promise.all([
        fetch(`/api/admin/store-evaluations/weekly-summary?city=${city}&weeks=${weeks}`, {
          headers: getAuthHeaders(), cache: "no-store",
        }),
        fetch(`/api/admin/store-evaluations/submission-rate?city=${city}&days=${weeks * 7}`, {
          headers: getAuthHeaders(), cache: "no-store",
        }),
      ]);
      const [weekData, subData] = await Promise.all([weekRes.json(), subRes.json()]);
      setWeeklyData(weekData.data || []);
      setSubmissionData(subData.data || []);
    } catch {
      setWeeklyData([]);
      setSubmissionData([]);
    } finally {
      setLoading(false);
    }
  }, [city, weeks]);

  useEffect(() => { load(); }, [load]);

  // Derive unique branches with color mapping
  const branches = useMemo(() => {
    const codes = Array.from(new Set(weeklyData.map((r) => r.branch_code))).sort();
    return codes.map((code, i) => ({
      code,
      color: BRANCH_COLORS[i % BRANCH_COLORS.length],
    }));
  }, [weeklyData]);

  // Chart 1: Weekly score trend per branch (line chart)
  const trendData = useMemo(() => {
    const byWeek: Record<string, Record<string, any>> = {};
    weeklyData.forEach((row) => {
      const wk = row.week_start;
      if (!byWeek[wk]) byWeek[wk] = { week: wk.slice(5) }; // "MM-DD"
      byWeek[wk][row.branch_code] = Number(row.avg_score);
    });
    return Object.values(byWeek).reverse();
  }, [weeklyData]);

  // Chart 2: Cross-store comparison bar (avg score over period)
  const comparisonData = useMemo(() => submissionData.map((r) => ({
    branch: r.branch_code,
    score: Number(r.avg_score),
    rate: Number(r.submission_rate_pct),
  })), [submissionData]);

  // Chart 3: Category breakdown radar — avg per category for each branch (last period)
  const categoryData = useMemo(() => {
    return CATEGORY_KEYS.map(({ key, label }) => {
      const row: Record<string, any> = { category: label };
      submissionData.forEach((s) => {
        row[s.branch_code] = Number(s[key] ?? 0);
      });
      return row;
    });
  }, [submissionData]);

  // Chart 4: Submission rate horizontal bars
  const submissionBars = useMemo(
    () => [...submissionData].sort((a, b) => b.submission_rate_pct - a.submission_rate_pct),
    [submissionData]
  );

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <RefreshCw size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (weeklyData.length === 0 && submissionData.length === 0) {
    return (
      <div className={`${GLASS_CARD} p-12 text-center`}>
        <BarChart3 size={36} className="text-slate-600 mx-auto mb-3" />
        <p className={T_BODY}>No data yet. Submit evaluations to see charts.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex items-center gap-3">
        <span className={T_LABEL}>Period</span>
        {[
          { label: "4 weeks", v: 4 },
          { label: "8 weeks", v: 8 },
          { label: "12 weeks", v: 12 },
        ].map(({ label, v }) => (
          <button
            key={v}
            type="button"
            onClick={() => setWeeks(v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              weeks === v
                ? "bg-violet-500/20 border border-violet-500/40 text-violet-300"
                : "bg-white/5 text-slate-400 hover:bg-white/10"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={load}
          className="ml-auto text-slate-400 hover:text-white"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Chart 1: Cross-store score comparison */}
      <div className={`${GLASS_CARD} p-4`}>
        <h3 className={`${T_SECTION} mb-1`}>Store Score Comparison</h3>
        <p className={`${T_CAPTION} text-slate-400 mb-4`}>Average total score over the selected period</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={comparisonData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="branch" tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="score" radius={[6, 6, 0, 0]} name="Avg Score">
              {comparisonData.map((_, i) => (
                <Cell key={i} fill={BRANCH_COLORS[i % BRANCH_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 2: Weekly trend per branch */}
      {trendData.length > 0 && (
        <div className={`${GLASS_CARD} p-4`}>
          <h3 className={`${T_SECTION} mb-1`}>Weekly Score Trend</h3>
          <p className={`${T_CAPTION} text-slate-400 mb-4`}>Total score per branch by week</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="week" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
              {branches.map(({ code, color }) => (
                <Line
                  key={code}
                  type="monotone"
                  dataKey={code}
                  stroke={color}
                  strokeWidth={2}
                  dot={{ r: 3, fill: color }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Chart 3: Category breakdown radar */}
      {submissionData.length > 0 && categoryData.length > 0 && (
        <div className={`${GLASS_CARD} p-4`}>
          <h3 className={`${T_SECTION} mb-1`}>Category Breakdown</h3>
          <p className={`${T_CAPTION} text-slate-400 mb-4`}>Average score per category (1–5 scale)</p>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={categoryData}>
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis
                dataKey="category"
                tick={{ fill: "#94a3b8", fontSize: 10 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
              {branches.map(({ code, color }) => (
                <Radar
                  key={code}
                  name={code}
                  dataKey={code}
                  stroke={color}
                  fill={color}
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
              ))}
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Chart 4: Submission rate */}
      <div className={`${GLASS_CARD} p-4`}>
        <h3 className={`${T_SECTION} mb-1`}>Submission Rate</h3>
        <p className={`${T_CAPTION} text-slate-400 mb-4`}>
          % of days with evaluation submitted (last {weeks * 7} days)
        </p>
        <div className="space-y-3">
          {submissionBars.map((row, i) => (
            <div key={row.branch_code}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: BRANCH_COLORS[i % BRANCH_COLORS.length] }}
                  />
                  <span className={`${T_BODY} font-semibold`}>{row.branch_code}</span>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <span className={`${T_CAPTION} text-slate-400`}>
                    {row.submitted_days}/{row.total_days} days
                  </span>
                  <span
                    className="text-sm font-bold w-12 text-right"
                    style={{ color: BRANCH_COLORS[i % BRANCH_COLORS.length] }}
                  >
                    {row.submission_rate_pct}%
                  </span>
                </div>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(row.submission_rate_pct, 100)}%`,
                    backgroundColor: BRANCH_COLORS[i % BRANCH_COLORS.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Branch Map Settings ─────────────────────────────────────────────────────

type BranchMapEntry = {
  branch_code: string;
  city: string;
  display_name: string;
  cancellations_patterns: string;
  offline_patterns: string;
  low_rating_patterns: string;
  active: boolean;
};

function BranchMapSettings({ city }: { city: string }) {
  const [entries, setEntries] = useState<BranchMapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string>("");
  const [editRow, setEditRow] = useState<BranchMapEntry | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newEntry, setNewEntry] = useState<BranchMapEntry>({
    branch_code: "", city, display_name: "",
    cancellations_patterns: "", offline_patterns: "", low_rating_patterns: "",
    active: true,
  });

  useEffect(() => {
    fetch(`/api/admin/store-evaluations/branch-map?city=${city}`, {
      headers: getAuthHeaders(), cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setEntries(d.branch_map || []))
      .finally(() => setLoading(false));
  }, [city]);

  const save = async (entry: BranchMapEntry) => {
    setSaving(entry.branch_code);
    setSaveMsg("");
    try {
      const res = await fetch("/api/admin/store-evaluations/branch-map", {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(entry),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Save failed.");
      setEntries((prev) =>
        prev.some((e) => e.branch_code === data.entry.branch_code)
          ? prev.map((e) => e.branch_code === data.entry.branch_code ? data.entry : e)
          : [...prev, data.entry]
      );
      setShowAdd(false);
      setEditRow(null);
      setSaveMsg(`${entry.branch_code} saved.`);
    } catch (e: any) {
      setSaveMsg(e.message || "Error.");
    } finally {
      setSaving(null);
    }
  };

  const PatternHelp = () => (
    <p className={`${T_CAPTION} text-slate-500 mt-1`}>
      Comma-separated keywords. Each is matched as ILIKE &quot;%keyword%&quot;.
    </p>
  );

  const EntryForm = ({ entry, onChange, onSave, onCancel }: {
    entry: BranchMapEntry;
    onChange: (e: BranchMapEntry) => void;
    onSave: () => void;
    onCancel: () => void;
  }) => (
    <div className={`${GLASS_CARD} p-4 mb-3`}>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className={`${T_LABEL} mb-1 block`}>Branch Code</label>
          <input
            className={INPUT_CLASS}
            value={entry.branch_code}
            onChange={(e) => onChange({ ...entry, branch_code: e.target.value.toUpperCase() })}
            placeholder="e.g. PAR"
          />
        </div>
        <div>
          <label className={`${T_LABEL} mb-1 block`}>Display Name</label>
          <input
            className={INPUT_CLASS}
            value={entry.display_name}
            onChange={(e) => onChange({ ...entry, display_name: e.target.value })}
            placeholder="e.g. Paranaque"
          />
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <label className={`${T_LABEL} mb-1 block`}>Cancellations Search (manila_cancellations.branch)</label>
          <input
            className={INPUT_CLASS}
            value={entry.cancellations_patterns}
            onChange={(e) => onChange({ ...entry, cancellations_patterns: e.target.value })}
            placeholder="e.g. paranaque,par"
          />
          <PatternHelp />
        </div>
        <div>
          <label className={`${T_LABEL} mb-1 block`}>Offline Hours Search (grab_offline_hours.store_name)</label>
          <input
            className={INPUT_CLASS}
            value={entry.offline_patterns}
            onChange={(e) => onChange({ ...entry, offline_patterns: e.target.value })}
            placeholder="e.g. paranaque"
          />
          <PatternHelp />
        </div>
        <div>
          <label className={`${T_LABEL} mb-1 block`}>Low Ratings Search (aggregator_low_ratings.branch)</label>
          <input
            className={INPUT_CLASS}
            value={entry.low_rating_patterns}
            onChange={(e) => onChange({ ...entry, low_rating_patterns: e.target.value })}
            placeholder="e.g. paranaque,par"
          />
          <PatternHelp />
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={onSave}
          disabled={saving === entry.branch_code}
          className={`${PRIMARY_BUTTON} flex items-center gap-2`}
        >
          {saving === entry.branch_code
            ? <RefreshCw size={14} className="animate-spin" />
            : <Save size={14} />}
          Save
        </button>
        <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className={T_SECTION}>Branch Name Mapping</h2>
          <p className={`${T_CAPTION} text-slate-400 mt-0.5`}>
            Maps branch codes to search patterns used in cancellations, offline, and rating data.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowAdd(true); setEditRow(null); }}
          className={`${SECONDARY_BUTTON} flex items-center gap-1.5`}
        >
          <Plus size={14} /> Add Branch
        </button>
      </div>

      {saveMsg && (
        <p className={`${T_CAPTION} text-emerald-400 mb-3`}>{saveMsg}</p>
      )}

      {showAdd && (
        <EntryForm
          entry={newEntry}
          onChange={setNewEntry}
          onSave={() => save(newEntry)}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <RefreshCw size={20} className="animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) =>
            editRow?.branch_code === entry.branch_code ? (
              <EntryForm
                key={entry.branch_code}
                entry={editRow}
                onChange={setEditRow}
                onSave={() => save(editRow)}
                onCancel={() => setEditRow(null)}
              />
            ) : (
              <div key={entry.branch_code} className={`${GLASS_CARD} p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`${T_BODY} font-bold`}>{entry.branch_code}</span>
                    <span className={`${T_CAPTION} text-slate-400`}>{entry.display_name}</span>
                    {!entry.active && (
                      <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded">inactive</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditRow({ ...entry })}
                    className={`${SECONDARY_BUTTON} text-xs py-1`}
                  >
                    Edit
                  </button>
                </div>
                <div className="space-y-1">
                  <p className={T_CAPTION}>
                    <span className="text-slate-500">Cancellations: </span>
                    <span className="text-slate-300">{entry.cancellations_patterns || "—"}</span>
                  </p>
                  <p className={T_CAPTION}>
                    <span className="text-slate-500">Offline: </span>
                    <span className="text-slate-300">{entry.offline_patterns || "—"}</span>
                  </p>
                  <p className={T_CAPTION}>
                    <span className="text-slate-500">Low Ratings: </span>
                    <span className="text-slate-300">{entry.low_rating_patterns || "—"}</span>
                  </p>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function StoreEvaluationsPage() {
  const router = useRouter();
  const auth = getAuth();
  useEffect(() => {
    const r = (auth?.role || "").toUpperCase();
    if (!canAccessAdminNav(auth) && r !== "HQ" && r !== "ADMIN") {
      router.replace("/week");
    }
  }, [auth, router]);

  const todayPH = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

  const [tab, setTab] = useState<"dashboard" | "summary" | "trend" | "settings">("dashboard");
  const [evalDate, setEvalDate] = useState(todayPH);
  const [city] = useState("manila");
  const [evaluations, setEvaluations] = useState<EvalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<EvalRow | null>(null);
  const [trendBranch, setTrendBranch] = useState("");

  // Load all known branches from summary
  const allBranches = evaluations.map((e) => e.branch_code);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/store-evaluations/summary?eval_date=${evalDate}&city=${city}`,
        { headers: getAuthHeaders(), cache: "no-store" }
      );
      const data = await res.json();
      setEvaluations(data.evaluations || []);
    } catch {
      setEvaluations([]);
    } finally {
      setLoading(false);
    }
  }, [evalDate, city]);

  useEffect(() => {
    if (tab === "summary") loadSummary();
  }, [tab, loadSummary]);

  // KPI summary
  const submitted = evaluations.length;
  const avgScore =
    submitted > 0
      ? evaluations.reduce((s, e) => s + (e.total_score ?? 0), 0) / submitted
      : null;
  const lowScoreCount = evaluations.filter((e) => (e.total_score ?? 0) < 60).length;
  const allCompliant = evaluations.filter(
    (e) =>
      e.attendance_check &&
      e.report_submission &&
      e.closing_check &&
      e.issue_report
  ).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pb-20">
      <div className="max-w-5xl mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className={T_PAGE_TITLE}>Store Evaluations</h1>
            <p className={`${T_CAPTION} text-slate-400 mt-1`}>Manila · Daily Store Score</p>
          </div>
          {tab === "summary" && !loading && (
            <button

              type="button"
              onClick={loadSummary}
              disabled={loading}
              className={SECONDARY_BUTTON}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className={`${TAB_CONTAINER} mb-5`}>
          <button
            className={tab === "dashboard" ? TAB_ACTIVE : TAB_INACTIVE}
            onClick={() => setTab("dashboard")}
          >
            <BarChart3 size={14} />
            Dashboard
          </button>
          <button
            className={tab === "summary" ? TAB_ACTIVE : TAB_INACTIVE}
            onClick={() => setTab("summary")}
          >
            <ClipboardList size={14} />
            Daily Summary
          </button>
          <button
            className={tab === "trend" ? TAB_ACTIVE : TAB_INACTIVE}
            onClick={() => setTab("trend")}
          >
            <TrendingUp size={14} />
            Branch Trend
          </button>
          <button
            className={tab === "settings" ? TAB_ACTIVE : TAB_INACTIVE}
            onClick={() => setTab("settings")}
          >
            <Settings size={14} />
            Settings
          </button>
        </div>

        {/* DASHBOARD TAB */}
        {tab === "dashboard" && <Dashboard city={city} />}

        {/* SUMMARY TAB */}
        {tab === "summary" && (
          <>
            {/* Date picker */}
            <div className={`${GLASS_CARD} p-4 mb-4 flex items-center gap-3`}>
              <Calendar size={16} className="text-slate-400 shrink-0" />
              <div>
                <label className={`${T_LABEL} block mb-1`}>Evaluation Date</label>
                <input
                  type="date"
                  className={INPUT_CLASS}
                  value={evalDate}
                  onChange={(e) => setEvalDate(e.target.value)}
                />
              </div>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className={KPI_CARD}>
                <p className={KPI_LABEL}>Submitted</p>
                <p className={KPI_VALUE}>{submitted}</p>
              </div>
              <div className={KPI_CARD}>
                <p className={KPI_LABEL}>Avg Score</p>
                <p className={`${KPI_VALUE} ${scoreColor(avgScore)}`}>
                  {avgScore != null ? avgScore.toFixed(1) : "—"}
                </p>
              </div>
              <div className={KPI_CARD}>
                <p className={KPI_LABEL}>Low (&lt;60)</p>
                <p className={`${KPI_VALUE} ${lowScoreCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {lowScoreCount}
                </p>
              </div>
              <div className={KPI_CARD}>
                <p className={KPI_LABEL}>Full Compliance</p>
                <p className={KPI_VALUE}>{allCompliant}</p>
              </div>
            </div>

            {/* Evaluation table */}
            {loading ? (
              <div className="flex justify-center py-16">
                <RefreshCw size={24} className="animate-spin text-slate-400" />
              </div>
            ) : evaluations.length === 0 ? (
              <div className={`${GLASS_CARD} p-10 text-center`}>
                <ClipboardList size={32} className="text-slate-600 mx-auto mb-3" />
                <p className={T_BODY}>No evaluations submitted for {fmtDate(evalDate)}.</p>
                <p className={`${T_CAPTION} text-slate-500 mt-1`}>
                  Store managers submit at /store/evaluation
                </p>
              </div>
            ) : (
              <>
                {/* Mobile card list */}
                <div className="sm:hidden space-y-3">
                  {evaluations.map((ev) => (
                    <div
                      key={ev.id}
                      className={`${GLASS_CARD} p-4 cursor-pointer hover:border-violet-500/40 transition-colors`}
                      onClick={() => setSelected(ev)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className={`${T_BODY} font-semibold`}>{ev.branch_code}</p>
                          <p className={`${T_CAPTION} text-slate-400`}>{ev.evaluator_name}</p>
                        </div>
                        <div className={`text-center px-3 py-1.5 rounded-xl border ${scoreBg(ev.total_score)}`}>
                          <p className={`text-xl font-bold ${scoreColor(ev.total_score)}`}>
                            {ev.total_score?.toFixed(1) ?? "—"}
                          </p>
                          <p className="text-xs text-slate-500">/ 100</p>
                        </div>
                      </div>
                      {/* Score dots */}
                      <div className="flex gap-1.5 flex-wrap mt-2">
                        {[
                          "backup_score", "station_balance_score", "quality_score",
                          "cleanliness_score", "team_support_score", "coaching_score",
                          "problem_awareness_score", "prep_time_score",
                        ].map((k) => (
                          <ScorePip key={k} value={ev[k as keyof EvalRow] as number | null} />
                        ))}
                      </div>
                      {/* Compliance row */}
                      <div className="flex gap-3 mt-2">
                        {Object.keys(BINARY_LABELS).map((k) => (
                          <BoolIcon key={k} v={ev[k as keyof EvalRow] as boolean | null} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className={`${TABLE_HEADER} text-left`}>Branch</th>
                        <th className={`${TABLE_HEADER} text-center`}>Score</th>
                        {Object.values(SCORE_LABELS).map((label) => (
                          <th key={label} className={`${TABLE_HEADER} text-center`}>
                            {label.slice(0, 4)}
                          </th>
                        ))}
                        <th className={`${TABLE_HEADER} text-center`}>Compliance</th>
                        <th className={`${TABLE_HEADER} text-left`}>Evaluator</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evaluations.map((ev) => (
                        <tr
                          key={ev.id}
                          className={`${TABLE_ROW} cursor-pointer`}
                          onClick={() => setSelected(ev)}
                        >
                          <td className={`${TABLE_CELL} font-semibold`}>{ev.branch_code}</td>
                          <td className={TABLE_CELL}>
                            <div className="flex justify-center">
                              <span
                                className={`text-lg font-bold ${scoreColor(ev.total_score)}`}
                              >
                                {ev.total_score?.toFixed(1) ?? "—"}
                              </span>
                            </div>
                          </td>
                          {[
                            "backup_score", "station_balance_score", "quality_score",
                            "cleanliness_score", "team_support_score", "coaching_score",
                            "problem_awareness_score", "prep_time_score",
                          ].map((k) => (
                            <td key={k} className={TABLE_CELL}>
                              <div className="flex justify-center">
                                <ScorePip value={ev[k as keyof EvalRow] as number | null} />
                              </div>
                            </td>
                          ))}
                          <td className={TABLE_CELL}>
                            <div className="flex justify-center gap-1">
                              {Object.keys(BINARY_LABELS).map((k) => (
                                <BoolIcon
                                  key={k}
                                  v={ev[k as keyof EvalRow] as boolean | null}
                                />
                              ))}
                            </div>
                          </td>
                          <td className={`${TABLE_CELL} text-slate-400`}>
                            {ev.evaluator_name}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* TREND TAB */}
        {tab === "trend" && (
          <div>
            <div className={`${GLASS_CARD} p-4 mb-4`}>
              <label className={`${T_LABEL} mb-2 block`}>Select Branch</label>
              <select
                className={SELECT_CLASS}
                value={trendBranch}
                onChange={(e) => setTrendBranch(e.target.value)}
              >
                <option value="">— Select branch —</option>
                {/* Pull from already-loaded summary if available, else show placeholder */}
                {allBranches.length > 0
                  ? allBranches.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))
                  : (
                    <option disabled>Load summary tab first</option>
                  )}
              </select>
            </div>
            {trendBranch ? (
              <TrendView branch={trendBranch} city={city} />
            ) : (
              <div className={`${GLASS_CARD} p-10 text-center`}>
                <TrendingUp size={32} className="text-slate-600 mx-auto mb-3" />
                <p className={T_BODY}>Select a branch to view trend.</p>
              </div>
            )}
          </div>
        )}

        {/* SETTINGS TAB */}
        {tab === "settings" && (
          <BranchMapSettings city={city} />
        )}
      </div>

      {/* Detail Modal */}
      {selected && (
        <EvalDetailModal ev={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
