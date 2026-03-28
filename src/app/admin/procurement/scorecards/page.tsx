"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";

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

export default function ProcurementScorecardsPage() {
  const auth = getAuth();
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
      const qsKpi = new URLSearchParams({
        month_key: monthKey.trim(),
        owner_name: effectiveOwner,
        limit: "500",
      });
      const qsImp = new URLSearchParams({
        month_key: monthKey.trim(),
        owner_name: effectiveOwner,
        limit: "500",
      });
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
    if (!monthKey.trim()) {
      setError("month_key is required.");
      return;
    }
    if (!effectiveOwner) {
      setError("owner_name is required.");
      return;
    }
    if (!issueTitle.trim()) {
      setError("issue_title is required.");
      return;
    }
    setSaving(true);
    setError("");
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
      const can = canAccessProcurementAdmin(refreshed || auth);
      setAllowed(can);
      if (can) await load();
    }
    void init();
  }, [auth, load]);

  if (!allowed) {
    return <div className="text-sm text-red-300">Procurement page is available only to authorized Manila admin roles.</div>;
  }

  return (
    <div className="space-y-4">
      {error ? <div className="text-sm text-red-300">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3 md:grid-cols-5">
        <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Approver name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input list="owner-list" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} placeholder="Owner name (optional)" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60">
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>
      <datalist id="owner-list">
        {owners.map((owner) => (
          <option key={owner} value={owner} />
        ))}
      </datalist>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
            <div className="text-sm font-medium">Staff Scorecards ({monthKey})</div>
            <div className="mt-3 space-y-2">
              {kpiRows.map((row) => (
                <button
                  key={row.id || `${row.month_key}:${row.owner_name}`}
                  type="button"
                  onClick={() => setOwnerFilter(row.owner_name || "")}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 text-left hover:bg-neutral-900"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm text-neutral-100">{row.owner_name || "UNASSIGNED"}</div>
                    <div className="text-xs text-neutral-400">
                      Score {Number(row.score_total || 0).toFixed(1)} / Grade {row.grade || "-"}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    On-time {Number(row.on_time_rate || 0).toFixed(1)} | Price dev {Number(row.price_deviation_avg || 0).toFixed(2)} | Exceptions {Number(row.exception_count || 0)}
                  </div>
                </button>
              ))}
              {!kpiRows.length ? <div className="text-sm text-neutral-500">No KPI rows.</div> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
            <div className="text-sm font-medium">Improvement Actions</div>
            <div className="mt-3 space-y-2">
              {improvementRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => editImprovement(row)}
                  className={[
                    "w-full rounded-xl border p-3 text-left",
                    selectedImprovementId === row.id ? "border-amber-500 bg-amber-950/20" : "border-neutral-800 bg-neutral-950/40 hover:bg-neutral-900",
                  ].join(" ")}
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm text-neutral-100">{row.issue_title}</div>
                    <div className="text-xs text-neutral-400">{row.status || "-"}</div>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {row.owner_name || "-"} | Due {String(row.due_date || "").slice(0, 10) || "-"} | Updated {String(row.updated_at || "").slice(0, 16).replace("T", " ")}
                  </div>
                </button>
              ))}
              {!improvementRows.length ? <div className="text-sm text-neutral-500">No improvement actions.</div> : null}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">{selectedImprovementId ? "Edit Improvement" : "New Improvement"}</div>
              <div className="mt-1 text-xs text-neutral-500">Register action plans against monthly scorecards.</div>
            </div>
            <button type="button" onClick={clearForm} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900">
              Clear
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3">
            <input value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} placeholder="Issue title" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
            <textarea value={actionPlan} onChange={(e) => setActionPlan(e.target.value)} placeholder="Action plan" className="min-h-24 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
                <option value="OPEN">OPEN</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="DONE">DONE</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </div>
            <textarea value={resultNote} onChange={(e) => setResultNote(e.target.value)} placeholder="Result note" className="min-h-24 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
            <button type="button" onClick={() => void saveImprovement()} disabled={saving} className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60">
              {saving ? "Saving..." : "Save Improvement"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
