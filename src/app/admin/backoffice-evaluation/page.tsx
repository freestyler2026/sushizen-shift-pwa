"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessBackofficeEvaluationAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";

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
  const [approverName, setApproverName] = useState(auth?.staffName || "");
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

  const syncFromSheet = async (dryRun: boolean) => {
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
          dry_run: Boolean(dryRun),
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      const j = JSON.parse(text || "{}");
      applyAttendanceStatus(j?.attendance_status);
      if (!dryRun) {
        await loadSummary();
        if (selectedStaff) await loadActions(selectedStaff);
      }
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

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
        <div className="text-lg font-semibold">Backoffice Daily Evaluation</div>
        <div className="mt-1 text-sm text-neutral-400">HQ / HR Manager only. Google Forms daily reports are evaluated against benchmark metrics.</div>
      </div>

      {error ? <div className="text-sm text-red-300">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3 lg:grid-cols-6">
        <label className="space-y-1">
          <div className="text-xs text-neutral-400">City</div>
          <select value={city} onChange={(e) => setCity(e.target.value as "dubai" | "manila")} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
            <option value="manila">manila</option>
            <option value="dubai">dubai</option>
          </select>
        </label>
        <label className="space-y-1">
          <div className="text-xs text-neutral-400">Month</div>
          <input type="month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        </label>
        <label className="space-y-1 lg:col-span-2">
          <div className="text-xs text-neutral-400">Approver Name</div>
          <input value={approverName} onChange={(e) => setApproverName(e.target.value)} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        </label>
        <label className="space-y-1">
          <div className="text-xs text-neutral-400">PIN</div>
          <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        </label>
        <div className="flex items-end gap-2">
          <button type="button" onClick={syncBayzatAttendance} disabled={attendanceSyncBusy || syncBusy} className="rounded-xl border border-sky-700/60 bg-sky-950/20 px-3 py-2 text-xs text-sky-200 hover:bg-sky-900/20 disabled:opacity-60">
            {attendanceSyncBusy ? "Syncing Bayzat..." : "Bayzat Sync"}
          </button>
          <button type="button" onClick={() => syncFromSheet(true)} disabled={syncBusy || attendanceSyncBusy || !bayzatReady} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900 disabled:opacity-60">
            {syncBusy ? "Syncing..." : "Dry Run"}
          </button>
          <button type="button" onClick={() => syncFromSheet(false)} disabled={syncBusy || attendanceSyncBusy || !bayzatReady} className="rounded-xl border border-amber-600/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-200 hover:bg-amber-900/20 disabled:opacity-60">
            {syncBusy ? "Syncing..." : "Sync + Score"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3 text-xs text-neutral-300">
        <div>Bayzat attendance available through: {attendanceStatus?.attendance_last_date || "-"}</div>
        <div className="mt-1">Attendance coverage: {attendanceStatus?.attendance_staff_count ?? 0} staff</div>
        <div className="mt-1 text-neutral-400">
          {bayzatReady ? "Bayzat Sync completed for this city/month. You can run scoring now." : "Run Bayzat Sync before Dry Run or Sync + Score."}
        </div>
        {attendanceError ? <div className="mt-2 text-red-300">{attendanceError}</div> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium">Score Summary</div>
            <button type="button" onClick={loadSummary} disabled={loading} className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1 text-xs hover:bg-neutral-900 disabled:opacity-60">
              Refresh
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/30 p-2">Staff: {summary?.staff_count ?? 0}</div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/30 p-2">Avg Total: {(summary?.avg_total_score ?? 0).toFixed(1)}</div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/30 p-2">Workload: {(summary?.avg_workload_score ?? 0).toFixed(1)}</div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/30 p-2">Speed: {(summary?.avg_speed_score ?? 0).toFixed(1)}</div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/30 p-2">Quality: {(summary?.avg_quality_score ?? 0).toFixed(1)}</div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/30 p-2">Progress: {(summary?.avg_progress_score ?? 0).toFixed(1)}</div>
          </div>
          <div className="mt-3 space-y-2">
            {(summary?.by_role || []).map((x) => (
              <div key={`${x.role_name}-${x.staff_count}`} className="rounded-xl border border-neutral-800 bg-neutral-950/20 p-2 text-xs text-neutral-300">
                {x.role_name || "(role unknown)"} - {x.staff_count} staff - avg {Number(x.avg_total_score || 0).toFixed(1)}
              </div>
            ))}
            {!summary?.by_role?.length ? <div className="text-xs text-neutral-500">No role summary yet.</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3">
          <div className="text-sm font-medium">Staff Scores</div>
          <div className="mt-2 space-y-2">
            {rows.map((r) => (
              <button
                key={`${r.staff_name}-${r.month_key}`}
                type="button"
                onClick={() => setSelectedStaff(r.staff_name)}
                className={[
                  "w-full rounded-xl border px-3 py-2 text-left text-sm",
                  selectedStaff === r.staff_name ? "border-amber-500 bg-amber-950/20 text-amber-100" : "border-neutral-800 bg-neutral-950/30 text-neutral-200",
                ].join(" ")}
              >
                <div className="flex items-center justify-between">
                  <span>{r.staff_name}</span>
                  <span className="font-semibold">{Number(r.total_score || 0).toFixed(1)}</span>
                </div>
                <div className="mt-1 text-xs text-neutral-400">
                  {r.role_name || "-"} | W:{Number(r.workload_score || 0).toFixed(1)} S:{Number(r.speed_score || 0).toFixed(1)} Q:{Number(r.quality_score || 0).toFixed(1)} P:{Number(r.progress_score || 0).toFixed(1)}
                </div>
              </button>
            ))}
            {!rows.length ? <div className="text-xs text-neutral-500">No score rows.</div> : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3">
        <div className="text-sm font-medium">Improvement Actions {selectedStaff ? `- ${selectedStaff}` : ""}</div>
        <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-5">
          <input value={actionTitle} onChange={(e) => setActionTitle(e.target.value)} placeholder="Action title" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm lg:col-span-2" />
          <input value={actionOwner} onChange={(e) => setActionOwner(e.target.value)} placeholder="Owner" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
          <input type="date" value={actionDueDate} onChange={(e) => setActionDueDate(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
          <select value={actionStatus} onChange={(e) => setActionStatus(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
            <option value="OPEN">OPEN</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="DONE">DONE</option>
            <option value="HOLD">HOLD</option>
          </select>
        </div>
        <textarea value={actionDetail} onChange={(e) => setActionDetail(e.target.value)} rows={2} placeholder="Action detail" className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <div className="mt-2">
          <button type="button" onClick={upsertAction} disabled={actionBusy || !selectedStaff} className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60">
            {actionBusy ? "Saving..." : "Save Action"}
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {actions.map((a) => (
            <div key={a.id} className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-2 text-xs text-neutral-300">
              <div className="font-medium text-neutral-100">{a.action_title}</div>
              <div className="mt-1">{a.action_detail || "-"}</div>
              <div className="mt-1 text-neutral-400">
                owner: {a.action_owner || "-"} | due: {a.due_date || "-"} | status: {a.status || "-"}
              </div>
            </div>
          ))}
          {!actions.length ? <div className="text-xs text-neutral-500">No action items yet.</div> : null}
        </div>
      </div>
    </div>
  );
}
