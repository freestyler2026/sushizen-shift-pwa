"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  INPUT_CLASS,
  TEXTAREA_CLASS,
  TAB_CONTAINER,
  TAB_ACTIVE,
  TAB_INACTIVE,
  T_PAGE_TITLE,
  T_SECTION,
  T_LABEL,
  T_CAPTION,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  DIVIDER,
} from "@/lib/ui-tokens";

// ─── Types ──────────────────────────────────────────────────────────────────

type TravelPathItem = {
  id: number;
  item_code: string;
  branch_group: string;
  section: string;
  item_text: string;
  sort_order: number;
  is_active: boolean;
};

type EntryState = {
  item_code: string;
  checked: boolean;
  note: string;
};

type ReportSummary = {
  id: number;
  branch: string;
  report_date: string;
  section: string;
  staff_name: string;
  status: string;
  submitted_at: string | null;
};

type ComplianceRow = {
  id: number;
  report_date: string;
  section: string;
  staff_name: string;
  status: string;
  submitted_at: string | null;
  total_entries: number;
  checked_entries: number;
};

// ─── Constants ──────────────────────────────────────────────────────────────

const BRANCHES = ["TAFT", "PAR", "CUBAO", "CK"] as const;
type Branch = (typeof BRANCHES)[number];

const BRANCH_LABELS: Record<Branch, string> = {
  TAFT: "TAFT",
  PAR: "PARANAQUE",
  CUBAO: "CUBAO",
  CK: "CENTRAL KITCHEN",
};

const SECTIONS = ["OPENING", "MID_SHIFT", "CLOSING"] as const;
type Section = (typeof SECTIONS)[number];

const SECTION_LABELS: Record<Section, string> = {
  OPENING: "Opening",
  MID_SHIFT: "Mid-Shift",
  CLOSING: "Closing",
};

const SECTION_COLORS: Record<Section, string> = {
  OPENING: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  MID_SHIFT: "bg-sky-500/15 text-sky-300 border-sky-500/25",
  CLOSING: "bg-violet-500/15 text-violet-300 border-violet-500/25",
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = window.setTimeout(() => resolve(fallback), ms);
    promise
      .then((v) => { window.clearTimeout(timer); resolve(v); })
      .catch(() => { window.clearTimeout(timer); resolve(fallback); });
  });
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function TravelPathPage() {
  const router = useRouter();
  const initialAuth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const localAuth = getAuth() || initialAuth;
      try {
        const refreshed = await withTimeout(refreshAuthFromApi(localAuth), 4000, localAuth);
        if (cancelled) return;
        const resolved = refreshed || getAuth() || localAuth || null;
        if (!resolved?.staffName) {
          setAllowed(false);
          setReady(true);
          router.replace(`/login?next=${encodeURIComponent("/admin/travel-path")}`);
          return;
        }
        if (!resolved?.accessToken) {
          setAllowed(false);
          setReady(true);
          return;
        }
        setAllowed(true);
        setReady(true);
      } catch {
        if (cancelled) return;
        const fallback = getAuth() || initialAuth || null;
        if (!fallback?.staffName) {
          setAllowed(false);
          setReady(true);
          router.replace(`/login?next=${encodeURIComponent("/admin/travel-path")}`);
          return;
        }
        setAllowed(Boolean(fallback?.accessToken));
        setReady(true);
      }
    }
    void init();
    return () => { cancelled = true; };
  }, [initialAuth, router]);

  if (!ready) return <div className="p-4 text-sm text-neutral-400">Loading…</div>;
  if (!allowed) return <div className="p-4 text-sm text-red-400">Access denied.</div>;

  return <TravelPathContent />;
}

// ─── Main Content ────────────────────────────────────────────────────────────

function TravelPathContent() {
  const [mainTab, setMainTab] = useState<"checklist" | "compliance">("checklist");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div>
          <h1 className={T_PAGE_TITLE}>Travel Path Checklist</h1>
          <p className="mt-1 text-sm text-zinc-500">Manila Branch Daily Operations</p>
        </div>

        {/* Main tabs */}
        <div className={TAB_CONTAINER}>
          <button
            className={mainTab === "checklist" ? TAB_ACTIVE : TAB_INACTIVE}
            onClick={() => setMainTab("checklist")}
          >
            ✅ Checklist Input
          </button>
          <button
            className={mainTab === "compliance" ? TAB_ACTIVE : TAB_INACTIVE}
            onClick={() => setMainTab("compliance")}
          >
            📊 Monthly Compliance
          </button>
        </div>

        {mainTab === "checklist" ? <ChecklistView /> : <ComplianceView />}
      </div>
    </div>
  );
}

// ─── Checklist View ──────────────────────────────────────────────────────────

function ChecklistView() {
  const [branch, setBranch] = useState<Branch>("TAFT");
  const [reportDate, setReportDate] = useState(todayStr());
  const [section, setSection] = useState<Section>("OPENING");
  const [staffName, setStaffName] = useState("");
  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [items, setItems] = useState<TravelPathItem[]>([]);
  const [entries, setEntries] = useState<Record<string, EntryState>>({});
  const [reportId, setReportId] = useState<number | null>(null);
  const [reportStatus, setReportStatus] = useState<string>("DRAFT");
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingNames, setLoadingNames] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  const showToast = useCallback((type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  // Load staff names when branch changes
  useEffect(() => {
    let cancelled = false;
    setLoadingNames(true);
    const auth = getAuth();
    fetch(`${API_BASE}/api/travel-path/staff-names?branch=${branch}`, {
      headers: getAuthHeaders(auth),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setStaffNames(Array.isArray(d.names) ? d.names : []);
        }
      })
      .catch(() => { if (!cancelled) setStaffNames([]); })
      .finally(() => { if (!cancelled) setLoadingNames(false); });
    return () => { cancelled = true; };
  }, [branch]);

  // Load items when branch or section changes
  useEffect(() => {
    let cancelled = false;
    setLoadingItems(true);
    setItems([]);
    const auth = getAuth();
    fetch(`${API_BASE}/api/travel-path/items?branch=${branch}&section=${section}`, {
      headers: getAuthHeaders(auth),
    })
      .then((r) => r.json())
      .then((d: TravelPathItem[]) => {
        if (!cancelled) {
          setItems(Array.isArray(d) ? d : []);
          // Pre-populate entries with unchecked state
          const initial: Record<string, EntryState> = {};
          (Array.isArray(d) ? d : []).forEach((item) => {
            initial[item.item_code] = { item_code: item.item_code, checked: false, note: "" };
          });
          setEntries(initial);
          setReportId(null);
          setReportStatus("DRAFT");
        }
      })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoadingItems(false); });
    return () => { cancelled = true; };
  }, [branch, section]);

  const checkedCount = Object.values(entries).filter((e) => e.checked).length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;
  const isSubmitted = reportStatus === "SUBMITTED";

  function toggleCheck(code: string) {
    if (isSubmitted) return;
    setEntries((prev) => ({
      ...prev,
      [code]: { ...prev[code], checked: !prev[code]?.checked },
    }));
  }

  function setNote(code: string, note: string) {
    setEntries((prev) => ({
      ...prev,
      [code]: { ...prev[code], note },
    }));
  }

  async function handleSave() {
    if (!staffName.trim()) { showToast("error", "Please select a staff name."); return; }
    setSaving(true);
    const auth = getAuth();
    try {
      const res = await fetch(`${API_BASE}/api/travel-path/save`, {
        method: "POST",
        headers: getAuthHeaders(auth),
        body: JSON.stringify({
          branch,
          report_date: reportDate,
          section,
          staff_name: staffName,
          entries: Object.values(entries),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setReportId(d.report_id);
      setReportStatus(d.status);
      showToast("success", "Draft saved.");
    } catch (e) {
      showToast("error", `Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!staffName.trim()) { showToast("error", "Please select a staff name."); return; }
    // Save first if no reportId
    let currentId = reportId;
    if (!currentId) {
      setSaving(true);
      const auth = getAuth();
      try {
        const res = await fetch(`${API_BASE}/api/travel-path/save`, {
          method: "POST",
          headers: getAuthHeaders(auth),
          body: JSON.stringify({
            branch,
            report_date: reportDate,
            section,
            staff_name: staffName,
            entries: Object.values(entries),
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const d = await res.json();
        currentId = d.report_id;
        setReportId(d.report_id);
        setReportStatus(d.status);
      } catch (e) {
        showToast("error", `Save failed: ${e instanceof Error ? e.message : String(e)}`);
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
    setSubmitting(true);
    const auth = getAuth();
    try {
      const res = await fetch(`${API_BASE}/api/travel-path/submit`, {
        method: "POST",
        headers: getAuthHeaders(auth),
        body: JSON.stringify({ report_id: currentId, verified_by: "" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setReportStatus(d.status);
      showToast("success", "Report submitted successfully!");
    } catch (e) {
      showToast("error", `Submit failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div
          className={[
            "fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-5 py-3 text-sm font-medium shadow-xl",
            toast.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-300"
              : "border-red-500/30 bg-red-500/20 text-red-300",
          ].join(" ")}
        >
          {toast.msg}
        </div>
      )}

      {/* Controls */}
      <div className={`${GLASS_CARD} p-5 space-y-4`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Branch */}
          <div className="space-y-1">
            <label className={T_LABEL}>Branch</label>
            <select
              className={SELECT_CLASS}
              value={branch}
              onChange={(e) => setBranch(e.target.value as Branch)}
            >
              {BRANCHES.map((b) => (
                <option key={b} value={b}>{BRANCH_LABELS[b]}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div className="space-y-1">
            <label className={T_LABEL}>Date</label>
            <input
              type="date"
              className={INPUT_CLASS}
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
            />
          </div>

          {/* Section */}
          <div className="space-y-1">
            <label className={T_LABEL}>Section</label>
            <select
              className={SELECT_CLASS}
              value={section}
              onChange={(e) => setSection(e.target.value as Section)}
            >
              {SECTIONS.map((s) => (
                <option key={s} value={s}>{SECTION_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {/* Staff Name */}
          <div className="space-y-1">
            <label className={T_LABEL}>Staff Name</label>
            {loadingNames ? (
              <div className="text-xs text-zinc-500 py-2">Loading…</div>
            ) : (
              <select
                className={SELECT_CLASS}
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
              >
                <option value="">— Select —</option>
                {staffNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Section tab pills */}
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={[
                "rounded-full border px-4 py-1.5 text-xs font-semibold transition-all duration-150",
                section === s
                  ? SECTION_COLORS[s]
                  : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200",
              ].join(" ")}
            >
              {SECTION_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Progress */}
        {items.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">{checkedCount} / {totalCount} completed</span>
              <span className={progress === 100 ? "text-emerald-400 font-semibold" : "text-zinc-400"}>
                {progress}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Status badge + actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {isSubmitted ? (
            <span className={BADGE_SUCCESS}>✓ Submitted</span>
          ) : reportId ? (
            <span className={BADGE_WARNING}>Draft saved</span>
          ) : null}
          {reportId && (
            <span className="text-xs text-zinc-500">Report #{reportId}</span>
          )}
        </div>
        {!isSubmitted && (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || submitting}
              className={SECONDARY_BUTTON}
            >
              {saving ? "Saving…" : "Save Draft"}
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || submitting}
              className={PRIMARY_BUTTON}
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        )}
      </div>

      {/* Checklist items */}
      {loadingItems ? (
        <div className={`${GLASS_CARD} p-8 text-center text-sm text-zinc-500`}>Loading items…</div>
      ) : items.length === 0 ? (
        <div className={`${GLASS_CARD} p-8 text-center text-sm text-zinc-500`}>No items found for this selection.</div>
      ) : (
        <div className={`${GLASS_CARD} divide-y divide-white/5`}>
          {items.map((item, idx) => {
            const entry = entries[item.item_code] ?? { item_code: item.item_code, checked: false, note: "" };
            const noteExpanded = expandedNotes[item.item_code] || false;
            return (
              <div
                key={item.item_code}
                className={[
                  "p-4 transition-colors duration-150",
                  entry.checked ? "bg-emerald-500/5" : "",
                  isSubmitted ? "opacity-80" : "",
                ].join(" ")}
              >
                <div className="flex items-start gap-3">
                  {/* Index */}
                  <span className="mt-0.5 min-w-[24px] text-right text-xs font-mono text-zinc-600">
                    {String(idx + 1).padStart(2, "0")}
                  </span>

                  {/* Checkbox */}
                  <button
                    onClick={() => toggleCheck(item.item_code)}
                    disabled={isSubmitted}
                    className={[
                      "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-all duration-150",
                      entry.checked
                        ? "border-emerald-500/60 bg-emerald-500/30 text-emerald-400"
                        : "border-white/20 bg-white/5 hover:border-violet-400/40 hover:bg-violet-500/10",
                      isSubmitted ? "cursor-default" : "cursor-pointer",
                    ].join(" ")}
                  >
                    {entry.checked && (
                      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="1.5,6 4.5,9 10.5,3" />
                      </svg>
                    )}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p className={[
                      "text-sm leading-relaxed",
                      entry.checked ? "text-zinc-400 line-through decoration-zinc-600" : "text-zinc-200",
                    ].join(" ")}>
                      {item.item_text}
                    </p>

                    {/* Note area */}
                    {!isSubmitted && (
                      <div>
                        {!noteExpanded ? (
                          <button
                            onClick={() => setExpandedNotes((p) => ({ ...p, [item.item_code]: true }))}
                            className="text-[11px] text-zinc-600 hover:text-violet-400 transition-colors"
                          >
                            {entry.note ? `📝 ${entry.note.slice(0, 40)}${entry.note.length > 40 ? "…" : ""}` : "+ add note"}
                          </button>
                        ) : (
                          <div className="flex items-start gap-2">
                            <textarea
                              className={`${TEXTAREA_CLASS} text-xs py-1.5 min-h-[60px]`}
                              placeholder="Add a note…"
                              value={entry.note}
                              onChange={(e) => setNote(item.item_code, e.target.value)}
                            />
                            <button
                              onClick={() => setExpandedNotes((p) => ({ ...p, [item.item_code]: false }))}
                              className="mt-1 text-xs text-zinc-500 hover:text-zinc-300"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {isSubmitted && entry.note && (
                      <p className="text-xs text-zinc-500 italic">📝 {entry.note}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom actions */}
      {!isSubmitted && items.length > 0 && (
        <div className="flex justify-end gap-2 pb-10">
          <button onClick={handleSave} disabled={saving || submitting} className={SECONDARY_BUTTON}>
            {saving ? "Saving…" : "Save Draft"}
          </button>
          <button onClick={handleSubmit} disabled={saving || submitting} className={PRIMARY_BUTTON}>
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Compliance View ─────────────────────────────────────────────────────────

function ComplianceView() {
  const now = new Date();
  const [branch, setBranch] = useState<Branch>("TAFT");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<ComplianceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState<number | null>(null);
  const [reportDetail, setReportDetail] = useState<(ReportSummary & { entries: { item_code: string; checked: boolean; note: string | null }[] }) | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const auth = getAuth();
    fetch(`${API_BASE}/api/travel-path/compliance?branch=${branch}&year=${year}&month=${month}`, {
      headers: getAuthHeaders(auth),
    })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setData([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [branch, year, month]);

  useEffect(() => {
    if (!selectedReport) { setReportDetail(null); return; }
    setDetailLoading(true);
    const auth = getAuth();
    fetch(`${API_BASE}/api/travel-path/reports/${selectedReport}`, {
      headers: getAuthHeaders(auth),
    })
      .then((r) => r.json())
      .then((d) => setReportDetail(d))
      .catch(() => setReportDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedReport]);

  // Build calendar data: day → section → row
  const days = daysInMonth(year, month);
  const byDaySec = useMemo(() => {
    const map: Record<number, Record<string, ComplianceRow>> = {};
    data.forEach((row) => {
      const d = new Date(row.report_date);
      const day = d.getUTCDate();
      if (!map[day]) map[day] = {};
      map[day][row.section] = row;
    });
    return map;
  }, [data]);

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Stats
  const totalReports = data.length;
  const submitted = data.filter((r) => r.status === "SUBMITTED").length;
  const complianceRate = totalReports > 0 ? Math.round((submitted / totalReports) * 100) : 0;
  const avgCompletion =
    data.length > 0
      ? Math.round(data.reduce((acc, r) => acc + (r.total_entries > 0 ? (r.checked_entries / r.total_entries) * 100 : 0), 0) / data.length)
      : 0;

  function getCellColor(row: ComplianceRow | undefined): string {
    if (!row) return "bg-zinc-800/30 text-zinc-700";
    if (row.status === "SUBMITTED") return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
    return "bg-amber-500/15 text-amber-300 border border-amber-500/25";
  }

  function getCellPct(row: ComplianceRow | undefined): string {
    if (!row || row.total_entries === 0) return "";
    return `${Math.round((row.checked_entries / row.total_entries) * 100)}%`;
  }

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className={`${GLASS_CARD} p-5`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className={T_LABEL}>Branch</label>
            <select
              className={SELECT_CLASS}
              value={branch}
              onChange={(e) => setBranch(e.target.value as Branch)}
            >
              {BRANCHES.map((b) => (
                <option key={b} value={b}>{BRANCH_LABELS[b]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={T_LABEL}>Month</label>
            <select
              className={SELECT_CLASS}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {monthNames.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={T_LABEL}>Year</label>
            <select
              className={SELECT_CLASS}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {[2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPIs */}
      {!loading && data.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className={`${GLASS_CARD} p-4`}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Reports</p>
            <p className="mt-1 text-2xl font-bold text-white">{totalReports}</p>
          </div>
          <div className={`${GLASS_CARD} p-4`}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Submitted</p>
            <p className={`mt-1 text-2xl font-bold ${complianceRate >= 80 ? "text-emerald-400" : complianceRate >= 50 ? "text-amber-400" : "text-red-400"}`}>
              {complianceRate}%
            </p>
          </div>
          <div className={`${GLASS_CARD} p-4`}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Avg. Completion</p>
            <p className={`mt-1 text-2xl font-bold ${avgCompletion >= 80 ? "text-emerald-400" : avgCompletion >= 50 ? "text-amber-400" : "text-red-400"}`}>
              {avgCompletion}%
            </p>
          </div>
        </div>
      )}

      {/* Calendar grid */}
      {loading ? (
        <div className={`${GLASS_CARD} p-8 text-center text-sm text-zinc-500`}>Loading…</div>
      ) : (
        <div className={`${GLASS_CARD} p-5 space-y-3`}>
          <div className="flex items-center justify-between">
            <h3 className={T_SECTION}>{monthNames[month - 1]} {year} — {BRANCH_LABELS[branch]}</h3>
            <div className="flex gap-3 text-xs text-zinc-500">
              <span><span className="inline-block w-3 h-3 rounded bg-emerald-500/30 mr-1 align-middle" />Submitted</span>
              <span><span className="inline-block w-3 h-3 rounded bg-amber-500/20 mr-1 align-middle" />Draft</span>
              <span><span className="inline-block w-3 h-3 rounded bg-zinc-800/50 mr-1 align-middle" />None</span>
            </div>
          </div>

          {/* Section header row */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left pb-2 pr-2 font-semibold text-zinc-500 w-10">Day</th>
                  {SECTIONS.map((s) => (
                    <th key={s} className="pb-2 text-center font-semibold text-zinc-400 px-1">
                      {SECTION_LABELS[s]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
                  const dayRows = byDaySec[day] || {};
                  const isToday =
                    day === now.getDate() &&
                    month === now.getMonth() + 1 &&
                    year === now.getFullYear();
                  return (
                    <tr
                      key={day}
                      className={[
                        "border-t border-white/5",
                        isToday ? "bg-violet-500/5" : "",
                      ].join(" ")}
                    >
                      <td className="py-1.5 pr-2 font-mono text-zinc-500">
                        {String(day).padStart(2, "0")}
                        {isToday && <span className="ml-1 text-[10px] text-violet-400">today</span>}
                      </td>
                      {SECTIONS.map((s) => {
                        const row = dayRows[s];
                        return (
                          <td key={s} className="py-1 px-1 text-center">
                            {row ? (
                              <button
                                onClick={() => setSelectedReport(row.id === selectedReport ? null : row.id)}
                                className={[
                                  "rounded-lg px-2 py-0.5 text-[11px] font-medium transition-all duration-150 hover:brightness-110",
                                  getCellColor(row),
                                  row.id === selectedReport ? "ring-1 ring-violet-400/50" : "",
                                ].join(" ")}
                                title={`${row.staff_name} — ${getCellPct(row)}`}
                              >
                                {getCellPct(row) || (row.status === "SUBMITTED" ? "✓" : "…")}
                              </button>
                            ) : (
                              <span className="rounded-lg px-2 py-0.5 text-[11px] text-zinc-700">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report detail panel */}
      {selectedReport && (
        <div className={`${GLASS_CARD} p-5 space-y-4`}>
          <div className="flex items-center justify-between">
            <h3 className={T_SECTION}>Report #{selectedReport}</h3>
            <button
              onClick={() => { setSelectedReport(null); setReportDetail(null); }}
              className="text-zinc-400 hover:text-zinc-200 text-lg leading-none"
            >✕</button>
          </div>

          {detailLoading ? (
            <p className="text-sm text-zinc-500">Loading detail…</p>
          ) : reportDetail ? (
            <div className="space-y-4">
              {/* Header info */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                <div>
                  <p className={T_LABEL}>Branch</p>
                  <p className="mt-0.5 text-zinc-200">{reportDetail.branch}</p>
                </div>
                <div>
                  <p className={T_LABEL}>Date</p>
                  <p className="mt-0.5 text-zinc-200">{reportDetail.report_date}</p>
                </div>
                <div>
                  <p className={T_LABEL}>Section</p>
                  <p className="mt-0.5 text-zinc-200">{SECTION_LABELS[reportDetail.section as Section] ?? reportDetail.section}</p>
                </div>
                <div>
                  <p className={T_LABEL}>Staff</p>
                  <p className="mt-0.5 text-zinc-200">{reportDetail.staff_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {reportDetail.status === "SUBMITTED" ? (
                  <span className={BADGE_SUCCESS}>✓ Submitted</span>
                ) : (
                  <span className={BADGE_WARNING}>Draft</span>
                )}
                {reportDetail.submitted_at && (
                  <span className="text-xs text-zinc-500">
                    {new Date(reportDetail.submitted_at).toLocaleString()}
                  </span>
                )}
              </div>

              {/* Entries */}
              {reportDetail.entries.length > 0 && (
                <div className="space-y-1.5">
                  <p className={T_LABEL}>Checklist Items ({reportDetail.entries.filter(e => e.checked).length}/{reportDetail.entries.length} checked)</p>
                  <div className="divide-y divide-white/5 rounded-xl border border-white/8 overflow-hidden">
                    {reportDetail.entries.map((e) => (
                      <div key={e.item_code} className={`flex items-start gap-3 px-3 py-2 text-xs ${e.checked ? "bg-emerald-500/5" : ""}`}>
                        <span className={e.checked ? "text-emerald-400" : "text-zinc-600"}>
                          {e.checked ? "✓" : "○"}
                        </span>
                        <span className={e.checked ? "text-zinc-300" : "text-zinc-500"}>
                          {e.item_code}
                          {e.note && <span className="ml-2 text-zinc-600 italic">— {e.note}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No detail available.</p>
          )}
        </div>
      )}
    </div>
  );
}
