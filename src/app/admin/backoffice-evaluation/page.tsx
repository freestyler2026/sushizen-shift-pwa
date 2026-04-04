"use client";

import { motion } from "framer-motion";
import {
  BarChart3,
  ClipboardCheck,
  InboxIcon,
  Lightbulb,
  Plus,
  RefreshCw,
  Settings2,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessBackofficeEvaluationAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { fmtNum } from "@/lib/formatters";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
  GLASS_CARD,
  INPUT_CLASS,
  KPI_CARD,
  KPI_LABEL,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  SMALL_BUTTON,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW,
  TEXTAREA_CLASS,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
} from "@/lib/ui-tokens";

type ScoreRow = {
  city: string;
  month_key: string;
  staff_name: string;
  role_name: string;
  workload_score: number;
  speed_score: number;
  quality_score: number;
  progress_score: number;
  total_score: number;
  issue_points_json: string[];
  improvement_points_json: string[];
  status: string;
  scored_by: string;
};

type SummaryPayload = {
  staff_count: number;
  avg_total_score: number;
  avg_workload_score: number;
  avg_speed_score: number;
  avg_quality_score: number;
  avg_progress_score: number;
  by_role: Array<{ role_name: string; staff_count: number; avg_total_score: number }>;
};

type AttendanceStatus = {
  city: string;
  month_key: string;
  attendance_last_date: string;
  attendance_date_count: number;
  attendance_staff_count: number;
  matched_staff_count: number;
};

type ActionRow = {
  id: number;
  city: string;
  month_key: string;
  staff_name: string;
  action_title: string;
  action_detail: string;
  action_owner: string;
  due_date: string;
  status: string;
  updated_by: string;
  updated_at: string;
};

function monthNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AdminBackofficeEvaluationPage() {
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<"dubai" | "manila">("manila");
  const [monthKey, setMonthKey] = useState(monthNow());
  const [approverName] = useState(auth?.staffName || "");
  const [pin, setPin] = useState(auth?.pin || "");
  const [loading, setLoading] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [attendanceSyncBusy, setAttendanceSyncBusy] = useState(false);
  const [error, setError] = useState("");
  const [attendanceError, setAttendanceError] = useState("");
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus | null>(null);
  const [bayzatSyncKey, setBayzatSyncKey] = useState("");
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [selectedStaff, setSelectedStaff] = useState("");
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [actionTitle, setActionTitle] = useState("");
  const [actionDetail, setActionDetail] = useState("");
  const [actionOwner, setActionOwner] = useState("");
  const [actionDueDate, setActionDueDate] = useState("");
  const [actionStatus, setActionStatus] = useState("OPEN");
  const [actionBusy, setActionBusy] = useState(false);

  const tokenHeaders = useCallback(async () => {
    const refreshed = await refreshAuthFromApi(auth);
    const accessToken = refreshed?.accessToken || auth?.accessToken;
    if (!accessToken) throw new Error("Please log in again.");
    return {
      Authorization: `Bearer ${accessToken}`,
      ...(refreshed?.stepUpToken ? { "X-Step-Up-Token": refreshed.stepUpToken } : {}),
    };
  }, [auth]);

  const applyAttendanceStatus = useCallback((payload: unknown) => {
    if (!payload || typeof payload !== "object") {
      setAttendanceStatus(null);
      return;
    }
    const status = payload as Partial<AttendanceStatus>;
    setAttendanceStatus({
      city: String(status.city || city),
      month_key: String(status.month_key || monthKey),
      attendance_last_date: String(status.attendance_last_date || ""),
      attendance_date_count: Number(status.attendance_date_count || 0),
      attendance_staff_count: Number(status.attendance_staff_count || 0),
      matched_staff_count: Number(status.matched_staff_count || 0),
    });
  }, [city, monthKey]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const q = new URLSearchParams({ city, month_key: monthKey }).toString();
      const res = await fetch(`${apiBase}/api/admin/backoffice-evaluation/summary?${q}`, { headers, cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      const j = JSON.parse(text || "{}");
      setSummary((j?.summary || null) as SummaryPayload | null);
      applyAttendanceStatus(j?.attendance_status);
      const scoreRows = (Array.isArray(j?.rows) ? j.rows : []) as ScoreRow[];
      setRows(scoreRows);
      if (scoreRows.length && !selectedStaff) {
        setSelectedStaff(scoreRows[0].staff_name || "");
      }
    } catch (e: any) {
      setError(e?.message || String(e));
      setSummary(null);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, applyAttendanceStatus, city, monthKey, selectedStaff, tokenHeaders]);

  const loadAttendanceStatus = useCallback(async () => {
    setAttendanceError("");
    try {
      const headers = await tokenHeaders();
      const q = new URLSearchParams({ city, month_key: monthKey }).toString();
      const res = await fetch(`${apiBase}/api/admin/backoffice-evaluation/attendance-status?${q}`, { headers, cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      const j = JSON.parse(text || "{}");
      applyAttendanceStatus(j?.attendance_status);
    } catch (e: any) {
      setAttendanceError(e?.message || String(e));
      setAttendanceStatus(null);
    }
  }, [apiBase, applyAttendanceStatus, city, monthKey, tokenHeaders]);

  const loadActions = useCallback(async (staffName: string) => {
    if (!staffName) {
      setActions([]);
      return;
    }
    setError("");
    try {
      const headers = await tokenHeaders();
      const q = new URLSearchParams({ city, month_key: monthKey, staff_name: staffName, limit: "200" }).toString();
      const res = await fetch(`${apiBase}/api/admin/backoffice-evaluation/actions?${q}`, { headers, cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      const j = JSON.parse(text || "{}");
      setActions((Array.isArray(j?.rows) ? j.rows : []) as ActionRow[]);
    } catch (e: any) {
      setError(e?.message || String(e));
      setActions([]);
    }
  }, [apiBase, city, monthKey, tokenHeaders]);

  const syncFromSheet = async () => {
    if (!approverName.trim() || !pin.trim()) {
      setError("Approver Name and PIN are required.");
      return;
    }
    if (bayzatSyncKey !== `${city}:${monthKey}`) {
      setError("Run Bayzat Sync before scoring this month.");
      return;
    }
    setSyncBusy(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/backoffice-evaluation/sync-from-sheet`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          city,
          month_key: monthKey,
          approver_name: approverName.trim(),
          pin: pin.trim(),
          dry_run: false,
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      const j = JSON.parse(text || "{}");
      applyAttendanceStatus(j?.attendance_status);
      await loadSummary();
      if (selectedStaff) await loadActions(selectedStaff);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSyncBusy(false);
    }
  };

  const syncBayzatAttendance = async () => {
    if (!approverName.trim() || !pin.trim()) {
      setAttendanceError("Approver Name and PIN are required.");
      return;
    }
    setAttendanceSyncBusy(true);
    setAttendanceError("");
    setError("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/backoffice-evaluation/bayzat-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          city,
          month_key: monthKey,
          approver_name: approverName.trim(),
          pin: pin.trim(),
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      const j = JSON.parse(text || "{}");
      applyAttendanceStatus(j?.attendance_status);
      setBayzatSyncKey(`${city}:${monthKey}`);
    } catch (e: any) {
      setAttendanceError(e?.message || String(e));
      setBayzatSyncKey("");
    } finally {
      setAttendanceSyncBusy(false);
    }
  };

  const upsertAction = async () => {
    if (!selectedStaff) {
      setError("Select staff first.");
      return;
    }
    if (!actionTitle.trim()) {
      setError("Action title is required.");
      return;
    }
    if (!approverName.trim() || !pin.trim()) {
      setError("Approver Name and PIN are required.");
      return;
    }
    setActionBusy(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/backoffice-evaluation/actions/upsert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          city,
          month_key: monthKey,
          staff_name: selectedStaff,
          action_title: actionTitle.trim(),
          action_detail: actionDetail.trim(),
          action_owner: actionOwner.trim(),
          due_date: actionDueDate.trim(),
          status: actionStatus,
          approver_name: approverName.trim(),
          pin: pin.trim(),
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      setActionTitle("");
      setActionDetail("");
      setActionOwner("");
      setActionDueDate("");
      setActionStatus("OPEN");
      await loadActions(selectedStaff);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setActionBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const can = canAccessBackofficeEvaluationAdmin(refreshed || auth);
      if (cancelled) return;
      setAllowed(can);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [auth]);

  useEffect(() => {
    if (!allowed) return;
    setBayzatSyncKey("");
    loadAttendanceStatus();
    loadSummary();
  }, [allowed, city, monthKey, loadAttendanceStatus, loadSummary]);

  useEffect(() => {
    if (!allowed || !selectedStaff) return;
    loadActions(selectedStaff);
  }, [allowed, selectedStaff, loadActions]);

  if (!allowed) {
    return <div className="text-sm text-red-300">Backoffice Evaluation page is available only to HQ/HR Manager.</div>;
  }

  const bayzatReady = bayzatSyncKey === `${city}:${monthKey}`;
  const hasSummaryData = Boolean(summary) || rows.length > 0;
  const scoreCriteriaEn = [
    { label: "Workload", desc: "submission / work volume", pct: 10, color: "bg-sky-400" },
    { label: "Speed", desc: "on-time / same-day handling", pct: 10, color: "bg-emerald-400" },
    { label: "Quality", desc: "low error rate", pct: 35, color: "bg-violet-400" },
    { label: "Progress", desc: "completion against plan", pct: 45, color: "bg-violet-400" },
  ];
  const scoreCriteriaJa = [
    { label: "Workload", desc: "提出率・業務量", pct: 10, color: "bg-sky-400" },
    { label: "Speed", desc: "期限内対応・当日対応", pct: 10, color: "bg-emerald-400" },
    { label: "Quality", desc: "エラーの少なさ", pct: 35, color: "bg-violet-400" },
    { label: "Progress", desc: "計画に対する完了率", pct: 45, color: "bg-violet-400" },
  ];
  const hasRoleSummary = Boolean(summary?.by_role?.length);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="max-w-5xl mx-auto px-4 py-8 space-y-6"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/10 border border-violet-500/20">
          <ClipboardCheck className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h1 className={T_PAGE_TITLE}>Backoffice Daily Evaluation</h1>
          <p className={T_CAPTION}>HQ / HR Manager only. Google Forms daily reports are evaluated against benchmark metrics.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`${GLASS_CARD} p-5`}>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-amber-400" />
            <h2 className={T_SECTION}>Scoring Criteria</h2>
          </div>
          <p className={`${T_BODY} mb-3`}>Scores are calculated using four dimensions:</p>
          <div className="space-y-2">
            {scoreCriteriaEn.map((d) => (
              <div key={d.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white">
                    {d.label}
                    <span className="text-zinc-500 font-normal"> — {d.desc}</span>
                  </span>
                  <span className="text-sm font-bold text-white">{d.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/8">
                  <div className={`h-1.5 rounded-full ${d.color}`} style={{ width: `${d.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className={`${T_CAPTION} mt-3`}>These scores are benchmark-based and may vary by role.</p>
        </div>

        <div className={`${GLASS_CARD} p-5`}>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-violet-400" />
            <h2 className={T_SECTION}>Backoffice Eval 評価基準</h2>
          </div>
          <p className={`${T_BODY} mb-3`}>点数は以下の4項目で構成されています。</p>
          <div className="space-y-2">
            {scoreCriteriaJa.map((d) => (
              <div key={d.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white">
                    {d.label}
                    <span className="text-zinc-500 font-normal">（{d.desc}）</span>
                  </span>
                  <span className="text-sm font-bold text-white">{d.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/8">
                  <div className={`h-1.5 rounded-full ${d.color}`} style={{ width: `${d.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className={`${T_CAPTION} mt-3`}>各項目の点数は、職種ごとの benchmark をもとに算出されます。</p>
        </div>
      </div>

      {error ? <div className={`${BADGE_ERROR} px-4 py-2 text-sm`}>{error}</div> : null}

      <div className={`${GLASS_CARD} p-5`}>
        <div className="flex items-center gap-2 mb-4">
          <Settings2 className="h-4 w-4 text-zinc-400" />
          <h2 className={T_SECTION}>Evaluation Context</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div>
            <label className={`${T_LABEL} block mb-1.5`}>City</label>
            <select value={city} onChange={(e) => setCity(e.target.value as "dubai" | "manila")} className={SELECT_CLASS}>
              <option value="manila">manila</option>
              <option value="dubai">dubai</option>
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} block mb-1.5`}>Month</label>
            <input type="month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} block mb-1.5`}>Approver Name</label>
            <input value={approverName} readOnly className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} block mb-1.5`}>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} className={INPUT_CLASS} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            type="button"
            onClick={syncBayzatAttendance}
            disabled={attendanceSyncBusy || syncBusy}
            className={`${SECONDARY_BUTTON} flex items-center gap-2 text-sm disabled:opacity-60`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {attendanceSyncBusy ? "Syncing Bayzat..." : "Bayzat Sync"}
          </button>
          <button
            type="button"
            onClick={syncFromSheet}
            disabled={syncBusy || attendanceSyncBusy || !bayzatReady}
            className={`${PRIMARY_BUTTON} flex items-center gap-2 text-sm disabled:opacity-60`}
          >
            <Zap className="h-3.5 w-3.5" />
            {syncBusy ? "Syncing..." : "Sync + Score"}
          </button>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3 space-y-1">
          <p className={T_CAPTION}>Bayzat attendance available through: <span className="text-zinc-300">{attendanceStatus?.attendance_last_date || "-"}</span></p>
          <p className={T_CAPTION}>Attendance coverage: <span className="text-zinc-300">{fmtNum(attendanceStatus?.attendance_staff_count ?? 0)} staff</span></p>
          <p className={T_CAPTION}>{bayzatReady ? "Bayzat Sync completed for this city/month. You can run Sync + Score now." : "Click Bayzat Sync first, then Sync + Score."}</p>
          {attendanceError ? <div className={`${BADGE_ERROR} mt-2 px-3 py-1.5 text-sm`}>{attendanceError}</div> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${GLASS_CARD} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              <h2 className={T_SECTION}>Score Summary</h2>
            </div>
            <button
              type="button"
              onClick={loadSummary}
              disabled={loading}
              className={`${SMALL_BUTTON} flex items-center gap-1.5 disabled:opacity-60`}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
          {loading ? <div className={`${GLASS_CARD} px-3 py-6 text-sm text-neutral-400`}>Loading summary...</div> : null}
          {!loading && !hasSummaryData ? <div className={`${GLASS_CARD} px-3 py-6 text-sm text-neutral-500`}>No evaluation data found for this city and month.</div> : null}
          {!loading && hasSummaryData ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Staff", value: summary?.staff_count ?? 0, color: "text-white" },
                  { label: "Avg Total", value: summary?.avg_total_score ?? 0, color: "text-amber-400" },
                  { label: "Workload", value: summary?.avg_workload_score ?? 0, color: "text-sky-400" },
                  { label: "Speed", value: summary?.avg_speed_score ?? 0, color: "text-emerald-400" },
                  { label: "Quality", value: summary?.avg_quality_score ?? 0, color: "text-amber-400" },
                  { label: "Progress", value: summary?.avg_progress_score ?? 0, color: "text-violet-400" },
                ].map((s) => (
                  <div key={s.label} className={KPI_CARD}>
                    <p className={KPI_LABEL}>{s.label}</p>
                    <p className={`mt-1 text-2xl font-bold tabular-nums ${s.color}`}>{fmtNum(s.value)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                {(summary?.by_role || []).map((x) => (
                  <div key={`${x.role_name}-${x.staff_count}`} className={`${GLASS_CARD} p-3 text-xs text-neutral-300`}>
                    {x.role_name || "(role unknown)"} - {fmtNum(x.staff_count)} staff - avg {fmtNum(x.avg_total_score)}
                  </div>
                ))}
                {!hasRoleSummary && <p className={`${T_CAPTION} mt-3 text-center`}>No role summary yet.</p>}
              </div>
            </>
          ) : null}
        </div>

        <div className={`${GLASS_CARD} p-5`}>
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-sky-400" />
            <h2 className={T_SECTION}>Staff Scores</h2>
          </div>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <InboxIcon className="h-8 w-8 text-zinc-700" />
              <p className={T_CAPTION}>Loading staff scores...</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <InboxIcon className="h-8 w-8 text-zinc-700" />
              <p className={T_CAPTION}>No score rows.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {["Staff", "Workload", "Speed", "Quality", "Progress", "Total"].map((col) => (
                      <th key={col} className={`${TABLE_HEADER} px-3 py-2 text-left`}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={i}
                      className={`${TABLE_ROW} cursor-pointer ${selectedStaff === r.staff_name ? "bg-white/6" : ""}`}
                      onClick={() => setSelectedStaff(r.staff_name)}
                    >
                      <td className={`${TABLE_CELL} px-3 font-medium`}>
                        <div>{r.staff_name}</div>
                        <div className="h-1 rounded-full bg-white/8 mt-1">
                          <div
                            className="h-1 rounded-full bg-gradient-to-r from-violet-500 to-amber-400 transition-all duration-700"
                            style={{ width: `${Math.max(0, Math.min(100, Number(r.total_score || 0)))}%` }}
                          />
                        </div>
                      </td>
                      <td className={`${TABLE_CELL} px-3 text-sky-400`}>{fmtNum(r.workload_score)}</td>
                      <td className={`${TABLE_CELL} px-3 text-emerald-400`}>{fmtNum(r.speed_score)}</td>
                      <td className={`${TABLE_CELL} px-3 text-amber-400`}>{fmtNum(r.quality_score)}</td>
                      <td className={`${TABLE_CELL} px-3 text-violet-400`}>{fmtNum(r.progress_score)}</td>
                      <td className={`${TABLE_CELL} px-3 font-bold text-white`}>{fmtNum(r.total_score)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className={`${GLASS_CARD} p-5`}>
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          <h2 className={T_SECTION}>Improvement Actions {selectedStaff ? `- ${selectedStaff}` : ""}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3">
          <div className="sm:col-span-2">
            <label className={`${T_LABEL} block mb-1.5`}>Action Title</label>
            <input value={actionTitle} onChange={(e) => setActionTitle(e.target.value)} placeholder="Action title" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} block mb-1.5`}>Owner</label>
            <input value={actionOwner} onChange={(e) => setActionOwner(e.target.value)} placeholder="Owner" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} block mb-1.5`}>Status</label>
            <select value={actionStatus} onChange={(e) => setActionStatus(e.target.value)} className={SELECT_CLASS}>
              <option value="OPEN">OPEN</option>
              <option value="IN_PROGRESS">IN PROGRESS</option>
              <option value="DONE">DONE</option>
              <option value="HOLD">HOLD</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
          <div className="sm:col-span-3">
            <label className={`${T_LABEL} block mb-1.5`}>Action Detail</label>
            <textarea value={actionDetail} onChange={(e) => setActionDetail(e.target.value)} rows={3} placeholder="Action detail" className={TEXTAREA_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} block mb-1.5`}>Due Date</label>
            <input type="date" value={actionDueDate} onChange={(e) => setActionDueDate(e.target.value)} className={INPUT_CLASS} />
          </div>
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={upsertAction} disabled={actionBusy || !selectedStaff} className={`${PRIMARY_BUTTON} flex items-center gap-2 disabled:opacity-60`}>
            <Plus className="h-4 w-4" />
            {actionBusy ? "Saving..." : "Save Action"}
          </button>
        </div>

        {actions.length > 0 && (
          <div className="mt-5 space-y-2">
            <hr className="border-white/5 mb-3" />
            {actions.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3 rounded-xl border border-white/8 bg-white/3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">{a.action_title}</p>
                  <p className={T_CAPTION}>{a.action_detail || "-"}</p>
                  <p className={`${T_CAPTION} mt-1`}>{a.action_owner || "-"} · {a.due_date || "-"}</p>
                </div>
                <span className={a.status === "DONE" ? BADGE_SUCCESS : a.status === "IN_PROGRESS" ? BADGE_WARNING : BADGE_INFO}>
                  {a.status || "-"}
                </span>
              </div>
            ))}
          </div>
        )}

        {!actions.length ? <div className={`${T_CAPTION} mt-3`}>No action items yet.</div> : null}
      </div>
    </motion.div>
  );
}
