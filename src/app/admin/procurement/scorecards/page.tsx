"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import DatePicker from "@/components/DatePicker";
import MonthPicker from "@/components/MonthPicker";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_CARD_TITLE,
  T_CAPTION,
  T_LABEL,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
} from "@/lib/ui-tokens";
import { RefreshCw, AlertCircle, CheckCircle, BarChart3 } from "lucide-react";

type KpiRow = {
  id: string;
  month_key: string;
  owner_name: string;
  on_time_rate: number;
  price_deviation_avg: number;
  exception_count: number;
  urgent_ratio: number;
  approval_cycle_hours_avg: number;
  score_total: number;
  grade: string;
};

type ImprovementRow = {
  id: string;
  month_key: string;
  owner_name: string;
  issue_title: string;
  action_plan: string;
  due_date: string;
  status: string;
  result_note: string;
  updated_by: string;
  updated_at: string;
};

function monthNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function gradeBadge(grade: string) {
  const g = String(grade || "-").toUpperCase();
  if (g === "A" || g === "S") return <span className={BADGE_SUCCESS}>{g}</span>;
  if (g === "B") return <span className={BADGE_INFO}>{g}</span>;
  if (g === "C") return <span className={BADGE_WARNING}>{g}</span>;
  return <span className={BADGE_ERROR}>{g || "-"}</span>;
}

function improvementStatusBadge(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "DONE" || s === "CLOSED") return <span className={BADGE_SUCCESS}>{s}</span>;
  if (s === "IN_PROGRESS") return <span className={BADGE_INFO}>{s}</span>;
  if (s === "OPEN") return <span className={BADGE_WARNING}>{s}</span>;
  return <span className={BADGE_INFO}>{status || "-"}</span>;
}

export default function ProcurementScorecardsPage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [monthKey, setMonthKey] = useState(monthNow());
  const [ownerFilter, setOwnerFilter] = useState("");
  const [kpiRows, setKpiRows] = useState<KpiRow[]>([]);
  const [improvementRows, setImprovementRows] = useState<ImprovementRow[]>([]);
  const [selectedImprovementId, setSelectedImprovementId] = useState("");
  const [issueTitle, setIssueTitle] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("OPEN");
  const [resultNote, setResultNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const owners = useMemo(() => {
    const set = new Set<string>();
    for (const row of kpiRows) {
      if (String(row.owner_name || "").trim()) set.add(String(row.owner_name || "").trim());
    }
    for (const row of improvementRows) {
      if (String(row.owner_name || "").trim()) set.add(String(row.owner_name || "").trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [improvementRows, kpiRows]);

  const effectiveOwner = useMemo(() => ownerFilter.trim(), [ownerFilter]);

  const load = useCallback(async () => {
    if (!monthKey.trim()) return;
    setLoading(true);
    setError("");
    try {
      const qsKpi = new URLSearchParams({ month_key: monthKey.trim(), owner_name: effectiveOwner, limit: "500" });
      const qsImp = new URLSearchParams({ month_key: monthKey.trim(), owner_name: effectiveOwner, limit: "500" });
      const [kpiRes, impRes] = await Promise.all([
        procurementJson<{ rows: KpiRow[] }>(
          `/api/admin/procurement/kpi/staff?${qsKpi.toString()}`,
          { method: "GET" },
          requestedBy,
          pin,
        ),
        procurementJson<{ rows: ImprovementRow[] }>(
          `/api/admin/procurement/improvements?${qsImp.toString()}`,
          { method: "GET" },
          requestedBy,
          pin,
        ),
      ]);
      setKpiRows(Array.isArray(kpiRes?.rows) ? kpiRes.rows : []);
      setImprovementRows(Array.isArray(impRes?.rows) ? impRes.rows : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [effectiveOwner, monthKey, pin, requestedBy]);

  const clearForm = () => {
    setSelectedImprovementId("");
    setIssueTitle("");
    setActionPlan("");
    setDueDate("");
    setStatus("OPEN");
    setResultNote("");
  };

  const editImprovement = (row: ImprovementRow) => {
    setSelectedImprovementId(String(row.id || ""));
    setOwnerFilter(String(row.owner_name || ""));
    setIssueTitle(String(row.issue_title || ""));
    setActionPlan(String(row.action_plan || ""));
    setDueDate(String(row.due_date || "").slice(0, 10));
    setStatus(String(row.status || "OPEN").toUpperCase());
    setResultNote(String(row.result_note || ""));
  };

  const saveImprovement = async () => {
    if (!monthKey.trim()) { setError("month_key is required."); return; }
    if (!effectiveOwner) { setError("owner_name is required."); return; }
    if (!issueTitle.trim()) { setError("issue_title is required."); return; }
    setSaving(true);
    setError("");
    setSuccessMsg("");
    try {
      await procurementJson(
        "/api/admin/procurement/improvements/upsert",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            month_key: monthKey.trim(),
            owner_name: effectiveOwner,
            issue_title: issueTitle.trim(),
            action_plan: actionPlan.trim(),
            due_date: dueDate.trim(),
            status: status.trim().toUpperCase(),
            result_note: resultNote.trim(),
            approver_name: requestedBy,
            pin,
          }),
        },
        requestedBy,
        pin,
      );
      setSuccessMsg("Improvement action saved.");
      await load();
      clearForm();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const mk = sp.get("month_key") || "";
    const owner = sp.get("owner_name") || "";
    if (mk) setMonthKey(mk);
    if (owner) setOwnerFilter(owner);
  }, []);

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const can = canAccessProcurementAdmin(
        String((refreshed || auth)?.role || ""),
        String((refreshed || auth)?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila",
      );
      setAllowed(can);
      if (can) await load();
    }
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Scorecards are only available to authorized admin roles.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>Staff Scorecards</h2>
          <p className="mt-1 text-sm text-zinc-400">Monthly KPI scores and improvement action tracking.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-400">
          <BarChart3 className="h-3 w-3" />{monthKey}
        </span>
      </div>

      {/* Error / Success */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {successMsg && !error && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle className="h-4 w-4 shrink-0" />{successMsg}
        </div>
      )}

      {/* Filter bar */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Approver Name</label>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Name" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Month</label>
            <MonthPicker value={monthKey} onChange={setMonthKey} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Owner</label>
            <input list="owner-list" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} placeholder="Filter by owner" className={INPUT_CLASS} />
            <datalist id="owner-list">
              {owners.map((owner) => <option key={owner} value={owner} />)}
            </datalist>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={() => void load()} disabled={loading} className={`${SECONDARY_BUTTON} w-full flex items-center justify-center gap-2`}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">

        {/* Left: scorecards + improvements list */}
        <div className="space-y-4">
          <div className={`${GLASS_CARD} p-4`}>
            <p className={`${T_SECTION} mb-3`}>Staff Scorecards ({monthKey})</p>
            <div className="space-y-2">
              {kpiRows.map((row) => (
                <button
                  key={row.id || `${row.month_key}:${row.owner_name}`}
                  type="button"
                  onClick={() => setOwnerFilter(row.owner_name || "")}
                  className="w-full rounded-xl border border-white/6 bg-white/3 p-3 text-left transition-colors hover:bg-white/5"
                >
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-medium text-white">{row.owner_name || "UNASSIGNED"}</div>
                    <div className="flex items-center gap-2">
                      <span className={T_CAPTION}>Score {Number(row.score_total || 0).toFixed(1)}</span>
                      {gradeBadge(row.grade || "-")}
                    </div>
                  </div>
                  <div className={`mt-1 ${T_CAPTION}`}>
                    On-time {Number(row.on_time_rate || 0).toFixed(1)} | Price dev {Number(row.price_deviation_avg || 0).toFixed(2)} | Exceptions {Number(row.exception_count || 0)}
                  </div>
                </button>
              ))}
              {!kpiRows.length && <p className={T_CAPTION}>No KPI rows for this month.</p>}
            </div>
          </div>

          <div className={`${GLASS_CARD} p-4`}>
            <p className={`${T_SECTION} mb-3`}>Improvement Actions</p>
            <div className="space-y-2">
              {improvementRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => editImprovement(row)}
                  className={[
                    "w-full rounded-xl border p-3 text-left transition-colors",
                    selectedImprovementId === row.id
                      ? "border-amber-500/40 bg-amber-500/10"
                      : "border-white/6 bg-white/3 hover:bg-white/5",
                  ].join(" ")}
                >
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-medium text-white">{row.issue_title}</div>
                    {improvementStatusBadge(row.status)}
                  </div>
                  <div className={`mt-1 ${T_CAPTION}`}>
                    {row.owner_name || "-"} | Due {String(row.due_date || "").slice(0, 10) || "-"} | Updated {String(row.updated_at || "").slice(0, 16).replace("T", " ")}
                  </div>
                </button>
              ))}
              {!improvementRows.length && <p className={T_CAPTION}>No improvement actions.</p>}
            </div>
          </div>
        </div>

        {/* Right: edit / create form */}
        <div className={`${GLASS_CARD} p-4`}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <p className={T_CARD_TITLE}>{selectedImprovementId ? "Edit Improvement" : "New Improvement"}</p>
              <p className={`mt-0.5 ${T_CAPTION}`}>Register action plans against monthly scorecards.</p>
            </div>
            <button type="button" onClick={clearForm} className={SECONDARY_BUTTON}>Clear</button>
          </div>

          <div className="space-y-3">
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Issue Title</label>
              <input value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} placeholder="Issue title" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Action Plan</label>
              <textarea value={actionPlan} onChange={(e) => setActionPlan(e.target.value)} placeholder="Action plan" rows={3} className={TEXTAREA_CLASS} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Due Date</label>
                <DatePicker value={dueDate} onChange={setDueDate} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={SELECT_CLASS}>
                  <option value="OPEN">OPEN</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="DONE">DONE</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </div>
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Result Note</label>
              <textarea value={resultNote} onChange={(e) => setResultNote(e.target.value)} placeholder="Result note" rows={3} className={TEXTAREA_CLASS} />
            </div>
            <button type="button" onClick={() => void saveImprovement()} disabled={saving} className={`${PRIMARY_BUTTON} w-full`}>
              {saving ? "Saving…" : "Save Improvement"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
