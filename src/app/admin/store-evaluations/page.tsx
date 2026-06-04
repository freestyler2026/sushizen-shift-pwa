"use client";

import { useCallback, useEffect, useState } from "react";
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
} from "lucide-react";
import { getAuth, canAccessAdminNav, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
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

  const [tab, setTab] = useState<"summary" | "trend">("summary");
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
          {tab === "summary" && (
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
        </div>

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
      </div>

      {/* Detail Modal */}
      {selected && (
        <EvalDetailModal ev={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
