"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
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
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type NteStatus = "ACTIVE" | "RESOLVED";

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
};

type PageTab = "board" | "issue" | "history" | "templates";

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
                <span className={T_CAPTION}>{fmtDate(nte.issued_date)}</span>
                <NteStatusBadge status={nte.status} />
              </div>
              <p className="text-sm text-white leading-relaxed">{nte.reason}</p>
              <p className={T_CAPTION}>Issued by: {nte.issued_by || "—"}</p>
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
  apiBase,
  authHeaders,
}: {
  template: NteTemplate | null;
  city: string;
  currentUser: string;
  onClose: () => void;
  onSaved: () => void;
  apiBase: string;
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
        const res = await fetch(`${apiBase}/api/admin/cases/templates/${template.id}`, {
          method: "PATCH",
          headers: { ...h, "Content-Type": "application/json" },
          body: JSON.stringify({ title, body }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        const res = await fetch(`${apiBase}/api/admin/cases/templates`, {
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
  const [tab, setTab] = useState<PageTab>("board");

  // Data state
  const [ntes, setNtes] = useState<NteRecord[]>([]);
  const [ranking, setRanking] = useState<StaffRanking[]>([]);
  const [templates, setTemplates] = useState<NteTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Board tab state
  const [panelStaff, setPanelStaff] = useState<string | null>(null);

  // Issue Notice tab state
  const [issueStaffName, setIssueStaffName] = useState("");
  const [issueDate, setIssueDate] = useState(todayStr());
  const [issueIssuedBy, setIssueIssuedBy] = useState("");
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
      const res = await fetch(`${API_BASE}/api/admin/cases/data`, {
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

      // Board ranking
      const boardRes = await fetch(`${API_BASE}/api/admin/cases/board`, {
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
    if (!issueStaffName.trim() || !issueReason.trim()) return;
    setIssuing(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/cases/create`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          city,
          staff_name: issueStaffName.trim(),
          reason: issueReason.trim(),
          issued_by: issueIssuedBy || currentUser,
          issued_date: issueDate || todayStr(),
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
        `${API_BASE}/api/admin/cases/${nteId}/close`,
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

  // ── Delete template ────────────────────────────────────────────────────────
  const handleDeleteTemplate = async (id: string, title: string) => {
    if (!window.confirm(`Delete template "${title}"?`)) return;
    setError("");
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/cases/templates/${id}`,
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
        ? n.staff_name.toLowerCase().includes(historyNameFilter.toLowerCase())
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
          apiBase={API_BASE}
          authHeaders={authHeaders}
        />
      )}

      {/* ── Page Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>Staff Conduct Management</h2>
          <p className={`${T_BODY} mt-1`}>
            Create and manage staff conduct notices, track case history, and issue corrective actions.
            3 active notices trigger an automatic enforcement action.
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
      <div className="grid grid-cols-3 gap-3">
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
          <p className={KPI_LABEL}>Staff Affected</p>
          <p className={KPI_VALUE}>{loading ? "—" : totalStaffAffected}</p>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className={TAB_CONTAINER}>
        {(
          [
            { id: "board", label: "Staff Board" },
            { id: "issue", label: "Issue Notice" },
            { id: "history", label: "Case History" },
            { id: "templates", label: "Templates" },
          ] as { id: PageTab; label: string }[]
        ).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={tab === id ? TAB_ACTIVE : TAB_INACTIVE}
          >
            {label}
          </button>
        ))}
      </div>

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
              <p className={T_BODY}>No conduct cases for {city}.</p>
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
      {/* Tab 2: Issue Notice                                                 */}
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
              <input
                value={issueStaffName}
                onChange={(e) => setIssueStaffName(e.target.value)}
                placeholder="Full name"
                className={INPUT_CLASS}
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

          {/* Template toggle */}
          <div>
            <p className={`${T_LABEL} mb-2`}>Use Template?</p>
            <div className="flex gap-4">
              {[
                { val: false, label: "No — write custom reason" },
                { val: true, label: "Yes — use template" },
              ].map(({ val, label }) => (
                <label
                  key={String(val)}
                  className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300"
                >
                  <input
                    type="radio"
                    checked={issueUseTemplate === val}
                    onChange={() => {
                      setIssueUseTemplate(val);
                      if (!val) {
                        setIssueTemplateId("");
                        setIssueReason("");
                      }
                    }}
                    className="accent-violet-500"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Template selector */}
          {issueUseTemplate && (
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Template</label>
              {templates.length === 0 ? (
                <p className={T_CAPTION}>No templates available. Create one in the Templates tab.</p>
              ) : (
                <select
                  value={issueTemplateId}
                  onChange={(e) => setIssueTemplateId(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">— Select template —</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

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
                !issueReason.trim()
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
                setIssueUseTemplate(false);
                setIssueTemplateId("");
              }}
              className={SECONDARY_BUTTON}
            >
              Clear
            </button>
          </div>
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
              <input
                value={historyNameFilter}
                onChange={(e) => setHistoryNameFilter(e.target.value)}
                placeholder="Filter by staff name…"
                className={INPUT_CLASS}
              />
            </div>
            <div className="min-w-[140px]">
              <select
                value={historyStatusFilter}
                onChange={(e) =>
                  setHistoryStatusFilter(
                    e.target.value as "ALL" | "ACTIVE" | "RESOLVED"
                  )
                }
                className={SELECT_CLASS}
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className={`${GLASS_CARD} overflow-x-auto`}>
            {loading ? (
              <p className={`${T_BODY} p-5`}>Loading case history…</p>
            ) : filteredHistory.length === 0 ? (
              <p className={`${T_BODY} p-5 text-center`}>No conduct cases.</p>
            ) : (
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr>
                    <th className={`${TABLE_HEADER} px-4 pt-4 pb-2 text-left`}>Date</th>
                    <th className={`${TABLE_HEADER} px-4 pt-4 pb-2 text-left`}>Staff Name</th>
                    <th className={`${TABLE_HEADER} px-4 pt-4 pb-2 text-left`}>Reason</th>
                    <th className={`${TABLE_HEADER} px-4 pt-4 pb-2 text-left`}>Issued By</th>
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
                      <td className={`${TABLE_CELL} px-4`}>
                        <NteStatusBadge status={nte.status} />
                        {nte.suspension_triggered && (
                          <span className={`${BADGE_ERROR} ml-1.5`}>
                            Suspension
                          </span>
                        )}
                      </td>
                      <td className={`${TABLE_CELL} px-4`}>
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
    </div>
  );
}
