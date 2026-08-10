"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  T_LABEL,
  T_SECTION,
  BADGE_SUCCESS,
  BADGE_WARNING,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

// ─── Types ──────────────────────────────────────────────────────────────────

type TravelPathItem = {
  id: number;
  item_code: string;
  branch_group: string;
  section: string;
  item_text: string;
  sort_order: number;
  is_active: boolean;
  item_type: string;           // 'CHECKBOX' | 'TEMPERATURE'
  unit_labels_json: string[];  // e.g. ['Chiller 1', 'Freezer 1', ...]
};

type EntryState = {
  item_code: string;
  checked: boolean;
  note: string;
  temp_values_json: Record<string, string>; // unit_label → numeric string
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

type ReportEntry = {
  item_code: string;
  item_text: string;
  item_type: string;                        // 'CHECKBOX' | 'TEMPERATURE'
  unit_labels_json: string[];               // ['Chiller 1', 'Freezer 1', ...]
  sort_order: number;
  checked: boolean;
  note: string | null;
  temp_values_json: Record<string, string>; // unit_label → value
};

// Temp-log types
type TempLogItem = {
  item_code: string;
  item_text: string;
  unit_labels_json: string[];
  temp_values_json: Record<string, string>;
  checked: boolean;
};

type TempLogRow = {
  id: number;
  report_date: string;
  section: string;
  staff_name: string;
  status: string;
  temp_items: TempLogItem[];
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

// All section keys across branches. Standard branches use OPENING/MID_SHIFT/
// CLOSING; Central Kitchen uses a time-blocked manager checklist
// (MORNING/AFTERNOON/EVENING).
type Section =
  | "OPENING" | "MID_SHIFT" | "CLOSING"
  | "MORNING" | "AFTERNOON" | "EVENING";

// Which sections each branch shows (and in what order).
const SECTIONS_BY_BRANCH: Record<Branch, readonly Section[]> = {
  TAFT:  ["OPENING", "MID_SHIFT", "CLOSING"],
  PAR:   ["OPENING", "MID_SHIFT", "CLOSING"],
  CUBAO: ["OPENING", "MID_SHIFT", "CLOSING"],
  CK:    ["MORNING", "AFTERNOON", "EVENING"],
};

const SECTION_LABELS: Record<Section, string> = {
  OPENING: "Opening",
  MID_SHIFT: "Mid-Shift",
  CLOSING: "Closing",
  MORNING: "Morning (9–12)",
  AFTERNOON: "Afternoon (14–18)",
  EVENING: "Evening (18–02)",
};

const SECTION_COLORS: Record<Section, string> = {
  OPENING: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  MID_SHIFT: "bg-sky-500/15 text-sky-300 border-sky-500/25",
  CLOSING: "bg-violet-500/15 text-violet-300 border-violet-500/25",
  MORNING: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  AFTERNOON: "bg-sky-500/15 text-sky-300 border-sky-500/25",
  EVENING: "bg-violet-500/15 text-violet-300 border-violet-500/25",
};

// ─── Temperature helpers ─────────────────────────────────────────────────────

type TempStatus = "ok" | "danger" | "empty";

function getTempStatus(unitLabel: string, value: string): TempStatus {
  const trimmed = value.trim();
  if (!trimmed) return "empty";
  const num = parseFloat(trimmed);
  if (isNaN(num)) return "empty";
  const lbl = unitLabel.toLowerCase();
  if (lbl.includes("chiller")) return num <= 5 ? "ok" : "danger";
  if (lbl.includes("freezer")) return num <= -18 ? "ok" : "danger";
  return "ok";
}

function tempStatusStyle(status: TempStatus): string {
  if (status === "ok")     return "border-emerald-500/60 bg-emerald-500/10 text-emerald-200";
  if (status === "danger") return "border-red-500/60 bg-red-500/10 text-red-200";
  return "border-white/15 bg-white/5 text-white";
}

function TempSuffix({ status }: { status: TempStatus }) {
  if (status === "ok")     return <span className="text-emerald-400 text-xs">✓</span>;
  if (status === "danger") return <span className="text-red-400 text-xs">⚠</span>;
  return null;
}

// ─── Temperature Input Component ─────────────────────────────────────────────

function TemperatureInputGrid({
  item,
  values,
  onChange,
  disabled,
}: {
  item: TravelPathItem;
  values: Record<string, string>;
  onChange: (unit: string, val: string) => void;
  disabled: boolean;
}) {
  const units = item.unit_labels_json ?? [];
  return (
    <div className="mt-2 space-y-1">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
        Chiller ≤ 5°C &nbsp;|&nbsp; Freezer ≤ −18°C &nbsp;|&nbsp; Danger Zone 5°C〜60°C
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {units.map((unit) => {
          const val = values[unit] ?? "";
          const status = getTempStatus(unit, val);
          return (
            <div key={unit} className="space-y-0.5">
              <label className="text-[10px] text-zinc-500 block truncate">{unit}</label>
              <div className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 transition-colors ${tempStatusStyle(status)}`}>
                <input
                  type="number"
                  step="0.1"
                  className="w-full bg-transparent text-sm outline-none placeholder-zinc-600 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  placeholder="—"
                  value={val}
                  disabled={disabled}
                  onChange={(e) => onChange(unit, e.target.value)}
                />
                <span className="text-xs text-zinc-500 shrink-0">°C</span>
                <TempSuffix status={status} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
        // Phase 3: accessToken is "" when auth lives in httpOnly sz_access cookie.
        if (!resolved?.hasSession && !resolved?.accessToken) {
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

  // Sections shown for the current branch (CK uses MORNING/AFTERNOON/EVENING).
  const sections = SECTIONS_BY_BRANCH[branch];

  // When branch changes, snap the active section to a valid one for that branch.
  useEffect(() => {
    if (!sections.includes(section)) setSection(sections[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  // Load items when branch, section, or date changes — then check for an existing
  // saved/submitted report for the same (branch, reportDate, section) and restore
  // its entries so staff can see their previously saved work.
  useEffect(() => {
    let cancelled = false;
    setLoadingItems(true);
    setItems([]);
    setReportId(null);
    setReportStatus("DRAFT");
    const auth = getAuth();
    fetch(`${API_BASE}/api/travel-path/items?branch=${branch}&section=${section}`, {
      headers: getAuthHeaders(auth),
    })
      .then((r) => r.json())
      .then(async (d: TravelPathItem[]) => {
        if (cancelled) return;
        const itemList = Array.isArray(d) ? d : [];
        setItems(itemList);
        // Start with unchecked state as default
        const initial: Record<string, EntryState> = {};
        itemList.forEach((item) => {
          initial[item.item_code] = {
            item_code: item.item_code,
            checked: false,
            note: "",
            temp_values_json: {},
          };
        });
        setEntries(initial);

        // Check if a report already exists for this (branch, date, section)
        try {
          const listRes = await fetch(
            `${API_BASE}/api/travel-path/reports?branch=${branch}&date_from=${reportDate}&date_to=${reportDate}&section=${section}&limit=1`,
            { headers: getAuthHeaders(auth) }
          );
          if (cancelled || !listRes.ok) return;
          const list = await listRes.json() as Array<{ id: number; status: string }>;
          if (!Array.isArray(list) || list.length === 0) return;

          // Existing report found — load its saved entries
          const existingId = list[0].id;
          const detailRes = await fetch(
            `${API_BASE}/api/travel-path/reports/${existingId}`,
            { headers: getAuthHeaders(auth) }
          );
          if (cancelled || !detailRes.ok) return;
          const detail = await detailRes.json() as {
            id: number; status: string;
            entries: Array<{
              item_code: string; checked: boolean;
              note: string | null; temp_values_json: Record<string, string>;
            }>;
          };
          if (cancelled) return;
          setReportId(detail.id);
          setReportStatus(detail.status);
          // Rebuild entries from saved server data
          const loaded: Record<string, EntryState> = { ...initial };
          for (const e of detail.entries ?? []) {
            loaded[e.item_code] = {
              item_code: e.item_code,
              checked: Boolean(e.checked),
              note: e.note ?? "",
              temp_values_json: e.temp_values_json ?? {},
            };
          }
          setEntries(loaded);
        } catch {
          // Non-critical: existing-report lookup failed; leave blank form
        }
      })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoadingItems(false); });
    return () => { cancelled = true; };
  }, [branch, section, reportDate]);

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

  function setTempValue(code: string, unit: string, val: string) {
    setEntries((prev) => {
      const entry = prev[code] ?? { item_code: code, checked: false, note: "", temp_values_json: {} };
      const newVals = { ...entry.temp_values_json, [unit]: val };
      // Auto-check when all units have a valid numeric value
      const item = items.find((i) => i.item_code === code);
      const allFilled = (item?.unit_labels_json ?? []).every(
        (u) => newVals[u] !== undefined && newVals[u].trim() !== "" && !isNaN(parseFloat(newVals[u]))
      );
      return {
        ...prev,
        [code]: { ...entry, temp_values_json: newVals, checked: allFilled },
      };
    });
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
            <SelectDark
              className={SELECT_CLASS}
              value={branch}
              onChange={(v) => setBranch(v as Branch)}
              options={[
                ...BRANCHES.map((b) => ({ value: b, label: BRANCH_LABELS[b] })),
              ]}
            />
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
            <SelectDark
              className={SELECT_CLASS}
              value={section}
              onChange={(v) => setSection(v as Section)}
              options={[
                ...sections.map((s) => ({ value: s, label: SECTION_LABELS[s] })),
              ]}
            />
          </div>

          {/* Staff Name */}
          <div className="space-y-1">
            <label className={T_LABEL}>Staff Name</label>
            {loadingNames ? (
              <div className="text-xs text-zinc-500 py-2">Loading…</div>
            ) : (
              <SelectDark
                className={SELECT_CLASS}
                value={staffName}
                onChange={setStaffName}
                options={[
                  { value: "", label: "— Select —" },
                  ...staffNames.map((n) => ({ value: n, label: n })),
                ]}
              />
            )}
          </div>
        </div>

        {/* Section tab pills */}
        <div className="flex flex-wrap gap-2">
          {sections.map((s) => (
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
            const entry = entries[item.item_code] ?? {
              item_code: item.item_code, checked: false, note: "", temp_values_json: {},
            };
            const noteExpanded = expandedNotes[item.item_code] || false;
            const isTemp = item.item_type === "TEMPERATURE";
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

                  {/* Checkbox (manual for CHECKBOX type; auto for TEMPERATURE) */}
                  <button
                    onClick={() => !isTemp && toggleCheck(item.item_code)}
                    disabled={isSubmitted || isTemp}
                    className={[
                      "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-all duration-150",
                      entry.checked
                        ? "border-emerald-500/60 bg-emerald-500/30 text-emerald-400"
                        : "border-white/20 bg-white/5",
                      isTemp ? "cursor-default opacity-70" : isSubmitted ? "cursor-default" : "cursor-pointer hover:border-violet-400/40 hover:bg-violet-500/10",
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
                      entry.checked ? "text-zinc-400" : "text-zinc-200",
                    ].join(" ")}>
                      {item.item_text}
                      {isTemp && (
                        <span className="ml-2 text-[10px] text-violet-400 bg-violet-500/15 border border-violet-500/25 rounded px-1.5 py-0.5">
                          🌡 TEMP
                        </span>
                      )}
                    </p>

                    {/* Temperature input grid for TEMPERATURE items */}
                    {isTemp && (
                      <TemperatureInputGrid
                        item={item}
                        values={entry.temp_values_json}
                        onChange={(unit, val) => setTempValue(item.item_code, unit, val)}
                        disabled={isSubmitted}
                      />
                    )}

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
  const [reportDetail, setReportDetail] = useState<(ReportSummary & { entries: ReportEntry[] }) | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Temperature log
  const [tempLog, setTempLog] = useState<TempLogRow[]>([]);
  const [tempLogLoading, setTempLogLoading] = useState(false);

  // Sections shown for the current branch (CK uses MORNING/AFTERNOON/EVENING).
  const sections = SECTIONS_BY_BRANCH[branch];

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

  // Fetch temperature log alongside compliance data
  useEffect(() => {
    let cancelled = false;
    setTempLogLoading(true);
    const auth = getAuth();
    fetch(`${API_BASE}/api/travel-path/temp-log?branch=${branch}&year=${year}&month=${month}`, {
      headers: getAuthHeaders(auth),
    })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setTempLog(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setTempLog([]); })
      .finally(() => { if (!cancelled) setTempLogLoading(false); });
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
    if (row.status === "SUBMITTED") {
      const pct = row.total_entries > 0 ? (row.checked_entries / row.total_entries) * 100 : 100;
      if (pct < 100) return "bg-amber-500/20 text-amber-300 border border-amber-500/40";
      return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
    }
    return "bg-orange-500/15 text-orange-300 border border-orange-500/25";
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
            <SelectDark
              className={SELECT_CLASS}
              value={branch}
              onChange={(v) => setBranch(v as Branch)}
              options={[
                ...BRANCHES.map((b) => ({ value: b, label: BRANCH_LABELS[b] })),
              ]}
            />
          </div>
          <div className="space-y-1">
            <label className={T_LABEL}>Month</label>
            <SelectDark
              className={SELECT_CLASS}
              value={String(month)}
              onChange={(v) => setMonth(Number(v))}
              options={[
                ...monthNames.map((m, i) => ({ value: String(i + 1), label: m })),
              ]}
            />
          </div>
          <div className="space-y-1">
            <label className={T_LABEL}>Year</label>
            <SelectDark
              className={SELECT_CLASS}
              value={String(year)}
              onChange={(v) => setYear(Number(v))}
              options={[
                ...[2025, 2026, 2027].map((y) => ({ value: String(y), label: String(y) })),
              ]}
            />
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

      {/* ── Issues & Actions Panel ── */}
      {!loading && (() => {
        const now2 = new Date();
        const isCurrentMonth = year === now2.getFullYear() && month === now2.getMonth() + 1;
        // Only flag days strictly before today for current month; all days for past months
        const lastPastDay = isCurrentMonth ? now2.getDate() - 1 : days;

        const incomplete = data
          .filter((r) => r.status === "SUBMITTED" && r.total_entries > 0 && r.checked_entries < r.total_entries)
          .sort((a, b) => b.report_date.localeCompare(a.report_date));

        const drafts = data
          .filter((r) => r.status !== "SUBMITTED")
          .sort((a, b) => b.report_date.localeCompare(a.report_date));

        const missingBySec: Record<string, number> = {};
        sections.forEach((sec) => { missingBySec[sec] = 0; });
        for (let d = 1; d <= lastPastDay; d++) {
          const dayRows = byDaySec[d] || {};
          sections.forEach((sec) => { if (!dayRows[sec]) missingBySec[sec]++; });
        }
        const totalMissing = Object.values(missingBySec).reduce((a, b) => a + b, 0);

        const tempViolationCount = tempLog.filter((row) =>
          row.temp_items.some((item) =>
            item.unit_labels_json.some((unit) =>
              getTempStatus(unit.toLowerCase(), String(item.temp_values_json[unit] ?? "")) === "danger"
            )
          )
        ).length;

        const hasIssues = incomplete.length > 0 || drafts.length > 0 || totalMissing > 0 || tempViolationCount > 0;

        if (!hasIssues && data.length > 0) return (
          <div className={`${GLASS_CARD} p-4 flex items-center gap-2`}>
            <span className="text-emerald-400 text-base">✓</span>
            <span className="text-sm text-zinc-400">No issues found for {monthNames[month - 1]} {year} — {BRANCH_LABELS[branch]}</span>
          </div>
        );

        if (!hasIssues) return null;

        return (
          <div className={`${GLASS_CARD} p-5 space-y-4 border border-amber-500/25`}>
            {/* Panel header */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-amber-300">⚠ Issues Requiring Attention</h3>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {incomplete.length > 0 && (
                  <span className="rounded-full bg-amber-500/15 border border-amber-500/25 px-2 py-0.5 text-amber-400">
                    {incomplete.length} incomplete
                  </span>
                )}
                {drafts.length > 0 && (
                  <span className="rounded-full bg-orange-500/15 border border-orange-500/25 px-2 py-0.5 text-orange-400">
                    {drafts.length} draft
                  </span>
                )}
                {totalMissing > 0 && (
                  <span className="rounded-full bg-red-500/15 border border-red-500/25 px-2 py-0.5 text-red-400">
                    {totalMissing} missing
                  </span>
                )}
                {tempViolationCount > 0 && (
                  <span className="rounded-full bg-violet-500/15 border border-violet-500/25 px-2 py-0.5 text-violet-400">
                    {tempViolationCount} temp flags
                  </span>
                )}
              </div>
            </div>

            {/* Submitted but incomplete */}
            {incomplete.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Submitted but Incomplete — items left unchecked
                </p>
                <div className="space-y-1.5">
                  {incomplete.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedReport(r.id === selectedReport ? null : r.id)}
                      className={[
                        "w-full flex items-center justify-between rounded-lg border px-3 py-2 text-xs text-left transition-all",
                        r.id === selectedReport
                          ? "border-amber-400/50 bg-amber-500/20"
                          : "border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 text-amber-400">📋</span>
                        <span className="text-zinc-300 truncate">
                          {r.report_date} · {SECTION_LABELS[r.section as Section] ?? r.section}
                        </span>
                        <span className="hidden sm:inline text-zinc-500 truncate">— {r.staff_name}</span>
                      </div>
                      <span className="ml-2 shrink-0 font-semibold text-amber-400">
                        {r.checked_entries}/{r.total_entries} checked
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Draft reports */}
            {drafts.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Not Submitted / Draft
                </p>
                <div className="space-y-1.5">
                  {drafts.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedReport(r.id === selectedReport ? null : r.id)}
                      className={[
                        "w-full flex items-center justify-between rounded-lg border px-3 py-2 text-xs text-left transition-all",
                        r.id === selectedReport
                          ? "border-orange-400/50 bg-orange-500/20"
                          : "border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 text-orange-400">⏳</span>
                        <span className="text-zinc-300 truncate">
                          {r.report_date} · {SECTION_LABELS[r.section as Section] ?? r.section}
                        </span>
                        <span className="hidden sm:inline text-zinc-500 truncate">— {r.staff_name}</span>
                      </div>
                      <span className="ml-2 shrink-0 font-semibold text-orange-400">Draft</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Missing sections */}
            {totalMissing > 0 && lastPastDay > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  No Submission Record (past {lastPastDay} day{lastPastDay !== 1 ? "s" : ""})
                </p>
                <div className="flex flex-wrap gap-2">
                  {sections.map((sec) => {
                    const cnt = missingBySec[sec];
                    if (!cnt) return null;
                    return (
                      <span
                        key={sec}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/8 px-3 py-1.5 text-xs text-red-400"
                      >
                        <span className="text-red-500">✗</span>
                        {SECTION_LABELS[sec]}: {cnt} day{cnt !== 1 ? "s" : ""} missing
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Temperature violations */}
            {tempViolationCount > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-xs">
                <span className="text-red-400">🌡</span>
                <span className="text-zinc-300">
                  {tempViolationCount} temperature violation{tempViolationCount !== 1 ? "s" : ""} this month
                </span>
                <span className="text-zinc-500">— see Temperature Log below for details</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Calendar grid */}
      {loading ? (
        <div className={`${GLASS_CARD} p-8 text-center text-sm text-zinc-500`}>Loading…</div>
      ) : (
        <div className={`${GLASS_CARD} p-5 space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={T_SECTION}>{monthNames[month - 1]} {year} — {BRANCH_LABELS[branch]}</h3>
            <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
              <span><span className="inline-block w-3 h-3 rounded bg-emerald-500/30 mr-1 align-middle" />100% complete</span>
              <span><span className="inline-block w-3 h-3 rounded bg-amber-500/25 mr-1 align-middle" />Incomplete (&lt;100%)</span>
              <span><span className="inline-block w-3 h-3 rounded bg-orange-500/20 mr-1 align-middle" />Draft</span>
              <span><span className="inline-block w-3 h-3 rounded bg-zinc-800/50 mr-1 align-middle" />None</span>
            </div>
          </div>
          <p className="text-[11px] text-zinc-600">Tap any cell to review the full report and see unchecked items.</p>

          {/* Section header row */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left pb-2 pr-2 font-semibold text-zinc-500 w-10">Day</th>
                  {sections.map((s) => (
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
                      {sections.map((s) => {
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

      {/* Temperature Log — grouped by date × section */}
      {(() => {
        if (tempLogLoading) return (
          <div className={`${GLASS_CARD} p-5 text-sm text-zinc-500`}>Loading temperature log…</div>
        );
        if (!tempLog.length && !data.length) return null;

        // Group temp-log rows by date → section
        const byDate: Record<string, Record<string, TempLogRow>> = {};
        tempLog.forEach((row) => {
          if (!byDate[row.report_date]) byDate[row.report_date] = {};
          byDate[row.report_date][row.section] = row;
        });

        // Cross-reference: compliance data keyed by date → section
        // Used to distinguish "no report submitted" vs "report exists but no temp recorded"
        const byDateCompliance: Record<string, Record<string, ComplianceRow>> = {};
        data.forEach((row) => {
          const ds = row.report_date.slice(0, 10);
          if (!byDateCompliance[ds]) byDateCompliance[ds] = {};
          byDateCompliance[ds][row.section] = row;
        });

        // Include dates from both temp-log AND compliance data
        const allDates = new Set([...Object.keys(byDate), ...Object.keys(byDateCompliance)]);
        const sortedDates = Array.from(allDates).sort();

        const sectionColors: Record<string, string> = {
          OPENING:   "text-amber-300",
          MID_SHIFT: "text-sky-300",
          CLOSING:   "text-violet-300",
        };
        const sectionBg: Record<string, string> = {
          OPENING:   "bg-amber-500/10 border-amber-500/20",
          MID_SHIFT: "bg-sky-500/10 border-sky-500/20",
          CLOSING:   "bg-violet-500/10 border-violet-500/20",
        };

        return (
          <div className={`${GLASS_CARD} p-5 space-y-4`}>
            <h3 className={T_SECTION}>🌡 Temperature Log — {monthNames[month - 1]} {year} — {BRANCH_LABELS[branch]}</h3>

            {sortedDates.map((date) => {
              const dayRows = byDate[date] ?? {};
              // Parse date string directly (avoid local-time offset shifting the day number)
              const dayNum = parseInt(date.slice(8, 10), 10);
              const hasDanger = sections.some((sec) => {
                const row = dayRows[sec];
                if (!row) return false;
                return row.temp_items.some((item) =>
                  item.unit_labels_json.some((unit) => {
                    const val = item.temp_values_json[unit] ?? "";
                    return getTempStatus(unit.toLowerCase(), String(val)) === "danger";
                  })
                );
              });
              return (
                <div key={date} className="rounded-xl border border-white/10 overflow-hidden">
                  {/* Date header */}
                  <div className={`flex items-center gap-2 px-4 py-2 bg-white/5 border-b border-white/10`}>
                    <span className="text-sm font-bold text-white">
                      {String(dayNum).padStart(2, "0")} {monthNames[month - 1]}
                    </span>
                    {hasDanger && (
                      <span
                        className="rounded-full bg-red-500/20 border border-red-500/30 px-2 py-0.5 text-[10px] font-bold text-red-400"
                        title="One or more temperature readings are outside safe range (Chiller >5°C or Freezer >-18°C)"
                      >
                        ⚠ Unsafe Temps
                      </span>
                    )}
                  </div>

                  {/* Sections side by side (stacked on small screens) */}
                  <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/8">
                    {sections.map((sec) => {
                      const row = dayRows[sec];
                      return (
                        <div key={sec} className="p-3 space-y-2">
                          <p className={`text-[11px] font-bold uppercase tracking-wide ${sectionColors[sec]}`}>
                            {SECTION_LABELS[sec as Section]}
                            {row && (
                              <span className={`ml-2 text-[10px] font-normal ${
                                row.status === "SUBMITTED" ? "text-emerald-400" : "text-amber-400"
                              }`}>
                                {row.status === "SUBMITTED" ? "✓ Submitted" : "Draft"}
                              </span>
                            )}
                          </p>
                          {!row ? (
                            byDateCompliance[date]?.[sec] ? (
                              <p className="text-xs text-amber-500/70">Report submitted — no temp recorded</p>
                            ) : (
                              <p className="text-xs text-zinc-600">No report submitted</p>
                            )
                          ) : row.temp_items.length === 0 ? (
                            <p className="text-xs text-zinc-600">No temperature items</p>
                          ) : (
                            row.temp_items.map((item) => (
                              <div key={item.item_code}
                                className={`rounded-lg border px-2.5 py-2 text-xs ${sectionBg[sec]}`}
                              >
                                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                                  {item.unit_labels_json.map((unit) => {
                                    const rawVal = String(item.temp_values_json[unit] ?? "");
                                    const status  = getTempStatus(unit.toLowerCase(), rawVal);
                                    return (
                                      <div key={unit} className="flex items-center justify-between gap-1">
                                        <span className="text-zinc-500 truncate">{unit}</span>
                                        {rawVal ? (
                                          <span className={`font-semibold ${
                                            status === "ok"     ? "text-emerald-400" :
                                            status === "danger" ? "text-red-400"     :
                                            "text-zinc-400"
                                          }`}>
                                            {rawVal}°C{status === "danger" ? "⚠" : ""}
                                          </span>
                                        ) : (
                                          <span className="text-zinc-600">—</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

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

              {/* Entries — all master items, with check status + temps */}
              {reportDetail.entries.length > 0 && (() => {
                const checkedCount  = reportDetail.entries.filter(e => e.checked).length;
                const totalCount    = reportDetail.entries.length;
                const missedEntries = reportDetail.entries.filter(e => !e.checked);
                return (
                  <div className="space-y-3">
                    {/* Summary bar */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className={T_LABEL}>
                        Checklist Items&nbsp;
                        <span className={checkedCount === totalCount ? "text-emerald-400" : "text-amber-400"}>
                          {checkedCount}/{totalCount} checked
                        </span>
                      </p>
                      {missedEntries.length > 0 && (
                        <span className="rounded-full bg-red-500/15 border border-red-500/30 px-2 py-0.5 text-[11px] font-semibold text-red-400">
                          {missedEntries.length} unchecked
                        </span>
                      )}
                    </div>

                    {/* Unchecked items — highlighted at top */}
                    {missedEntries.length > 0 && (
                      <div className="rounded-xl border border-red-500/25 bg-red-500/5 overflow-hidden">
                        <p className="px-3 py-2 text-[11px] font-semibold text-red-400 border-b border-red-500/20">
                          ✗ Not Completed ({missedEntries.length})
                        </p>
                        <div className="divide-y divide-red-500/10">
                          {missedEntries.map((e) => (
                            <div key={e.item_code} className="px-3 py-2 text-xs text-red-300/80">
                              {e.item_text || e.item_code}
                              {e.note && <span className="ml-2 text-red-400/50 italic">— {e.note}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* All items list */}
                    <div className="divide-y divide-white/5 rounded-xl border border-white/8 overflow-hidden">
                      {reportDetail.entries.map((e) => {
                        const isTemp = e.item_type === "TEMPERATURE";
                        const temps  = e.temp_values_json ?? {};
                        const hasTemps = isTemp && Object.values(temps).some(v => v !== "" && v != null);
                        return (
                          <div key={e.item_code}
                            className={`px-3 py-2.5 text-xs ${
                              e.checked
                                ? isTemp && hasTemps ? "bg-blue-500/5" : "bg-emerald-500/5"
                                : "bg-red-500/5"
                            }`}
                          >
                            {/* Item header row */}
                            <div className="flex items-start gap-2">
                              <span className={`mt-0.5 shrink-0 ${e.checked ? "text-emerald-400" : "text-red-400"}`}>
                                {e.checked ? "✓" : "✗"}
                              </span>
                              <div className="flex-1 min-w-0">
                                <span className={e.checked ? "text-zinc-200" : "text-zinc-400"}>
                                  {e.item_text || e.item_code}
                                </span>
                                {isTemp && (
                                  <span className="ml-1.5 inline-flex items-center rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-violet-400">
                                    🌡 TEMP
                                  </span>
                                )}
                                {e.note && (
                                  <span className="ml-2 text-zinc-500 italic">— {e.note}</span>
                                )}
                              </div>
                            </div>

                            {/* Temperature values grid */}
                            {isTemp && hasTemps && (
                              <div className="mt-2 ml-5 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                                {(e.unit_labels_json ?? []).map((unit) => {
                                  const raw    = String(temps[unit] ?? "");
                                  const status = getTempStatus(unit.toLowerCase(), raw);
                                  return (
                                    <div key={unit} className="flex items-center gap-1.5">
                                      <span className="text-zinc-500 truncate max-w-[70px]">{unit}:</span>
                                      {raw ? (
                                        <span className={
                                          status === "ok"     ? "font-semibold text-emerald-400" :
                                          status === "danger" ? "font-semibold text-red-400" :
                                          "text-zinc-500"
                                        }>
                                          {raw}°C
                                          {status === "danger" && <span className="ml-0.5 text-red-400">⚠</span>}
                                        </span>
                                      ) : (
                                        <span className="text-zinc-600">—</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No detail available.</p>
          )}
        </div>
      )}
    </div>
  );
}
