"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, INPUT_CLASS, TEXTAREA_CLASS, SELECT_CLASS,
  T_PAGE_TITLE, T_SECTION, T_LABEL, BADGE_ERROR, BADGE_WARNING, BADGE_SUCCESS, BADGE_INFO,
} from "@/lib/ui-tokens";
import { RefreshCw, AlertCircle, FileText, Calendar, CheckCircle, XCircle, Plus } from "lucide-react";

type NteSummaryRow = {
  staff_name: string;
  city: string;
  active_count: number;
  total_count: number;
  latest_nte_date: string | null;
  suspension_triggered: boolean;
};

type NteRecord = {
  id: string;
  staff_name: string;
  issued_date: string;
  reason: string;
  issued_by: string;
  status: string;
  suspension_triggered: boolean;
  resolved_at: string | null;
  resolved_by: string;
  resolution_note: string;
};

type Suspension = {
  id: string;
  staff_name: string;
  suspension_date: string;
  reason: string;
  nte_count: number;
  status: string;
  created_by: string;
  notes: string;
};

const ADMIN_ROLES = new Set(["ADMIN", "HQ", "HR_MANAGER", "MANILA_MANAGEMENT", "MANILA_MANAGER"]);

function nteBadge(count: number) {
  if (count >= 3) return <span className={BADGE_ERROR}>⛔ {count} NTEs — Suspension</span>;
  if (count === 2) return <span className={BADGE_WARNING}>⚠ {count} NTEs — 1 more = suspension</span>;
  if (count === 1) return <span className={BADGE_INFO}>{count} NTE</span>;
  return <span className="text-xs text-zinc-500">No active NTEs</span>;
}

function suspStatusBadge(s: string) {
  if (s === "SCHEDULED") return <span className={BADGE_WARNING}>🗓 Scheduled</span>;
  if (s === "COMPLETED") return <span className={BADGE_SUCCESS}>✓ Completed</span>;
  if (s === "CANCELLED") return <span className="text-xs text-zinc-400">Cancelled</span>;
  return <span className={BADGE_INFO}>{s}</span>;
}

export default function NtePage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState("manila");
  const [tab, setTab] = useState<"overview" | "records" | "suspensions">("overview");

  const [summary, setSummary] = useState<NteSummaryRow[]>([]);
  const [nteRecords, setNteRecords] = useState<NteRecord[]>([]);
  const [suspensions, setSuspensions] = useState<Suspension[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Issue NTE form
  const [issueForm, setIssueForm] = useState({ staff_name: "", reason: "", issued_date: "" });
  const [issuing, setIssuing] = useState(false);
  const [showIssueForm, setShowIssueForm] = useState(false);

  // Manual suspension form
  const [manualForm, setManualForm] = useState({ staff_name: "", suspension_date: "", reason: "" });
  const [creatingManual, setCreatingManual] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);

  const headers = useMemo(() => auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}, [auth]);

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const resolved = refreshed || auth;
      setAllowed(ADMIN_ROLES.has(String(resolved?.role || "").toUpperCase()));
      setCity(String(resolved?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila");
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAll = useCallback(async () => {
    if (!auth?.accessToken) return;
    setLoading(true);
    setError("");
    try {
      const [sumRes, nteRes, susRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/nte/summary?city=${city}`, { headers }),
        fetch(`${API_BASE}/api/admin/nte/list?city=${city}&limit=200`, { headers }),
        fetch(`${API_BASE}/api/admin/suspensions?city=${city}&limit=100`, { headers }),
      ]);
      const [sumJson, nteJson, susJson] = await Promise.all([sumRes.json(), nteRes.json(), susRes.json()]);
      setSummary(Array.isArray(sumJson?.summary) ? sumJson.summary : []);
      setNteRecords(Array.isArray(nteJson?.ntes) ? nteJson.ntes : []);
      setSuspensions(Array.isArray(susJson?.suspensions) ? susJson.suspensions : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [auth, city, headers]);

  useEffect(() => { if (allowed) void loadAll(); }, [allowed, loadAll]);

  const handleIssueNte = async () => {
    if (!issueForm.staff_name.trim() || !issueForm.reason.trim()) return;
    setIssuing(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/nte/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ city, ...issueForm, issued_by: auth?.staffName || "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      const msg = data.suspension_triggered
        ? `✓ NTE issued to ${issueForm.staff_name}. ⛔ Suspension auto-created for ${data.suspension?.suspension_date}!`
        : `✓ NTE issued to ${issueForm.staff_name}. Active NTEs: ${data.active_nte_count}`;
      setSuccessMsg(msg);
      setIssueForm({ staff_name: "", reason: "", issued_date: "" });
      setShowIssueForm(false);
      await loadAll();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIssuing(false);
    }
  };

  const handleResolveNte = async (nteId: string, staffName: string) => {
    if (!window.confirm(`Resolve this NTE for ${staffName}?`)) return;
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/nte/${nteId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ resolved_by: auth?.staffName || "" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSuccessMsg("NTE resolved.");
      await loadAll();
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  const handleSuspensionStatus = async (id: string, status: string) => {
    const label = status === "COMPLETED" ? "Mark as completed?" : "Cancel this suspension?";
    if (!window.confirm(label)) return;
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/suspensions/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSuccessMsg(`Suspension marked as ${status}.`);
      await loadAll();
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  const handleManualSuspension = async () => {
    if (!manualForm.staff_name.trim() || !manualForm.suspension_date) return;
    setCreatingManual(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/suspensions/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ city, ...manualForm, created_by: auth?.staffName || "" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSuccessMsg("Manual suspension created.");
      setManualForm({ staff_name: "", suspension_date: "", reason: "" });
      setShowManualForm(false);
      await loadAll();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCreatingManual(false);
    }
  };

  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" /> NTE management is only available to HR / Admin roles.
      </div>
    );
  }

  const scheduledSuspensions = suspensions.filter(s => s.status === "SCHEDULED");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>NTE & Suspensions</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Issue NTEs, track violations, manage suspensions. 3 active NTEs → automatic 1-day suspension.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border border-white/10">
            {(["manila", "dubai"] as const).map((c) => (
              <button key={c} type="button" onClick={() => setCity(c)}
                className={["px-3 py-1.5 text-xs font-semibold transition-colors capitalize",
                  city === c ? "bg-violet-600/70 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10",
                ].join(" ")}>{c}</button>
            ))}
          </div>
          <button type="button" onClick={() => void loadAll()} disabled={loading}
            className={`${SECONDARY_BUTTON} flex items-center gap-1.5`}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button type="button" onClick={() => setShowIssueForm(v => !v)}
            className={`${PRIMARY_BUTTON} flex items-center gap-1.5`}>
            <FileText className="h-4 w-4" />
            Issue NTE
          </button>
        </div>
      </div>

      {/* Upcoming suspension alert */}
      {scheduledSuspensions.length > 0 && (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/20 px-4 py-3">
          <p className="mb-2 text-sm font-semibold text-red-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {scheduledSuspensions.length} Upcoming Suspension{scheduledSuspensions.length !== 1 ? "s" : ""}
          </p>
          <div className="space-y-1">
            {scheduledSuspensions.map((s) => (
              <div key={s.id} className="flex items-center gap-3 text-sm">
                <span className="font-mono text-red-200 font-semibold">{String(s.suspension_date).slice(0, 10)}</span>
                <span className="text-white">{s.staff_name}</span>
                <span className="text-zinc-400 text-xs truncate">{s.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Issue NTE form */}
      {showIssueForm && (
        <div className={`${GLASS_CARD} p-4 space-y-3`}>
          <p className={`${T_SECTION}`}>Issue NTE</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Staff Name *</label>
              <input value={issueForm.staff_name} onChange={(e) => setIssueForm(p => ({ ...p, staff_name: e.target.value }))}
                placeholder="Full name" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Date (optional)</label>
              <input type="date" value={issueForm.issued_date} onChange={(e) => setIssueForm(p => ({ ...p, issued_date: e.target.value }))}
                className={INPUT_CLASS} />
            </div>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Reason *</label>
            <textarea value={issueForm.reason} onChange={(e) => setIssueForm(p => ({ ...p, reason: e.target.value }))}
              placeholder="Describe the violation..." rows={2} className={`${TEXTAREA_CLASS} min-h-[60px]`} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void handleIssueNte()} disabled={issuing || !issueForm.staff_name.trim() || !issueForm.reason.trim()}
              className={`${PRIMARY_BUTTON} flex items-center gap-2`}>
              <FileText className="h-4 w-4" />
              {issuing ? "Issuing…" : "Issue NTE"}
            </button>
            <button type="button" onClick={() => setShowIssueForm(false)}
              className={`${SECONDARY_BUTTON}`}>Cancel</button>
          </div>
        </div>
      )}

      {/* Manual suspension form */}
      {showManualForm && (
        <div className={`${GLASS_CARD} p-4 space-y-3`}>
          <p className={`${T_SECTION}`}>Manual Suspension</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Staff Name *</label>
              <input value={manualForm.staff_name} onChange={(e) => setManualForm(p => ({ ...p, staff_name: e.target.value }))}
                placeholder="Full name" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Suspension Date *</label>
              <input type="date" value={manualForm.suspension_date} onChange={(e) => setManualForm(p => ({ ...p, suspension_date: e.target.value }))}
                className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Reason</label>
              <input value={manualForm.reason} onChange={(e) => setManualForm(p => ({ ...p, reason: e.target.value }))}
                placeholder="Reason" className={INPUT_CLASS} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void handleManualSuspension()} disabled={creatingManual}
              className={`${PRIMARY_BUTTON} flex items-center gap-2`}>
              <Calendar className="h-4 w-4" />
              {creatingManual ? "Creating…" : "Create Suspension"}
            </button>
            <button type="button" onClick={() => setShowManualForm(false)} className={SECONDARY_BUTTON}>Cancel</button>
          </div>
        </div>
      )}

      {/* Alerts */}
      {error && <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300"><AlertCircle className="h-4 w-4 shrink-0" /> {error}</div>}
      {successMsg && <div className="flex items-center gap-2 rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3 text-sm text-emerald-300"><CheckCircle className="h-4 w-4 shrink-0" /> {successMsg}</div>}

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-white/10 bg-white/4 p-1 w-fit">
        {([["overview", "Overview"], ["records", "NTE Records"], ["suspensions", "Suspensions"]] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={["px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
              tab === id ? "bg-violet-600/70 text-white" : "text-zinc-400 hover:text-white",
            ].join(" ")}>{label}</button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === "overview" && (
        <div className="space-y-2">
          {!summary.length ? (
            <div className={`${GLASS_CARD} p-8 text-center text-sm text-zinc-500`}>
              No NTE records. Use &ldquo;Issue NTE&rdquo; to start tracking violations.
            </div>
          ) : summary.map((row) => (
            <div key={row.staff_name} className={[
              "rounded-2xl border p-4",
              row.active_count >= 3 ? "border-red-500/40 bg-red-950/15" :
              row.active_count === 2 ? "border-amber-500/30 bg-amber-950/10" :
              "border-white/8 bg-white/4",
            ].join(" ")}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-semibold text-white">{row.staff_name}</span>
                    {nteBadge(row.active_count)}
                    {row.suspension_triggered && <span className={BADGE_ERROR}>🚫 Suspension created</span>}
                  </div>
                  <div className="text-xs text-zinc-500">
                    Active: {row.active_count} / Total: {row.total_count}
                    {row.latest_nte_date && ` · Last: ${String(row.latest_nte_date).slice(0, 10)}`}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* NTE Records tab */}
      {tab === "records" && (
        <div className="space-y-2">
          {!nteRecords.length ? (
            <div className={`${GLASS_CARD} p-8 text-center text-sm text-zinc-500`}>No NTE records yet.</div>
          ) : nteRecords.map((nte) => (
            <div key={nte.id} className={[
              "rounded-2xl border p-4",
              nte.status === "ACTIVE" ? "border-red-700/40 bg-red-950/15" : "border-white/5 bg-white/2 opacity-70",
            ].join(" ")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-semibold text-white">{nte.staff_name}</span>
                    {nte.status === "ACTIVE" ? <span className={BADGE_ERROR}>ACTIVE</span> : <span className={BADGE_SUCCESS}>RESOLVED</span>}
                    {nte.suspension_triggered && <span className={BADGE_WARNING}>🚫 Triggered suspension</span>}
                  </div>
                  <div className="text-xs text-zinc-400 mb-1">
                    {String(nte.issued_date).slice(0, 10)} · Issued by {nte.issued_by || "—"}
                  </div>
                  <p className="text-sm text-zinc-300">{nte.reason}</p>
                  {nte.status === "RESOLVED" && nte.resolved_by && (
                    <p className="text-xs text-zinc-500 mt-1">Resolved by {nte.resolved_by}: {nte.resolution_note}</p>
                  )}
                </div>
                {nte.status === "ACTIVE" && (
                  <button type="button" onClick={() => void handleResolveNte(nte.id, nte.staff_name)}
                    className="flex items-center gap-1.5 rounded-xl border border-emerald-700/40 bg-emerald-900/20 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-900/40 transition">
                    <CheckCircle className="h-3.5 w-3.5" /> Resolve
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Suspensions tab */}
      {tab === "suspensions" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button type="button" onClick={() => setShowManualForm(v => !v)}
              className={`${SECONDARY_BUTTON} flex items-center gap-1.5`}>
              <Plus className="h-4 w-4" /> Add Manual Suspension
            </button>
          </div>
          {!suspensions.length ? (
            <div className={`${GLASS_CARD} p-8 text-center text-sm text-zinc-500`}>No suspensions recorded.</div>
          ) : suspensions.map((s) => (
            <div key={s.id} className={[
              "rounded-2xl border p-4",
              s.status === "SCHEDULED" ? "border-red-500/40 bg-red-950/15" : "border-white/5 bg-white/2 opacity-60",
            ].join(" ")}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-mono font-semibold text-white">{String(s.suspension_date).slice(0, 10)}</span>
                    <span className="font-medium text-white">{s.staff_name}</span>
                    {suspStatusBadge(s.status)}
                    {s.nte_count > 0 && <span className="text-xs text-zinc-500">{s.nte_count} NTEs</span>}
                  </div>
                  <p className="text-sm text-zinc-400">{s.reason}</p>
                  {s.notes && <p className="text-xs text-zinc-500 mt-0.5">{s.notes}</p>}
                </div>
                {s.status === "SCHEDULED" && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void handleSuspensionStatus(s.id, "COMPLETED")}
                      className="flex items-center gap-1 rounded-xl border border-emerald-700/40 bg-emerald-900/20 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-900/40 transition">
                      <CheckCircle className="h-3.5 w-3.5" /> Done
                    </button>
                    <button type="button" onClick={() => void handleSuspensionStatus(s.id, "CANCELLED")}
                      className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition">
                      <XCircle className="h-3.5 w-3.5" /> Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
