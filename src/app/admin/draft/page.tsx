"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDownToLine,
  Bot,
  CalendarCog,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  ExternalLink,
  InboxIcon,
  Info,
  PencilLine,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Wand2,
  XCircle,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { canAccessAdminNav, getAuth } from "@/lib/auth";
import ShiftScheduleView from "./ShiftScheduleView";
import ShiftMasterPanel from "@/components/ShiftMasterPanel";
import { BRANCHES, labelOf, type BranchCode, type City } from "@/lib/branches";
import {
  loadShiftMaster,
  checkViolations,
  buildAiContext,
  type ShiftMasterData,
  type ShiftViolation,
} from "@/lib/shiftMasterData";
import { fmtNum } from "@/lib/formatters";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
  DANGER_BUTTON,
  GLASS_CARD,
  HIGHLIGHT_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SELECT_CLASS,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  TAB_ACTIVE,
  TAB_CONTAINER,
  TAB_INACTIVE,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
} from "@/lib/ui-tokens";

type DraftRow = {
  id: string;
  work_date: string;
  staff_name: string;
  role: string;
  start_hour: number;
  end_hour: number;
  source?: string;
  updated_at?: string;
};

type DraftGenerateMonthResult = {
  ok: boolean;
  version_id: string;
  city: string;
  branch_code: string;
  target_month: string;
  rows_inserted: number;
  days_generated: number;
  source_days: Array<{
    target_date: string;
    reference_date: string;
    source_type: string;
    rows_copied: number;
    rows_generated?: number;
    forecast_orders_total?: number;
    required_staff_hours?: number;
    overtime_hours_added?: number;
    unresolved_hours?: number;
    demand_multiplier?: number;
    demand_label?: string;
  }>;
  version_week_start: string;
  summary?: {
    generation_mode?: string;
    forecast_source_months?: string[];
    previous_month_source?: string;
    target_day_count?: number;
    total_overtime_hours?: number;
    total_required_staff_hours?: number;
    total_planned_staff_hours?: number;
    total_unresolved_hours?: number;
    demand_coverage_ratio?: number;
    avg_branch_reliability?: number;
    reliability_buffer_hours?: number;
    fulltime_enforcement_days_added?: number;
    fulltime_enforcement_days_removed?: number;
    ramadan_shifts_adjusted?: number;
    opening_crew_target?: number;
    opening_crew_shifts_added?: number;
  };
};

type ReliabilityRow = {
  staff_name: string;
  reliability_score: number;
  absence_days: number;
  late_days: number;
  shift_days: number;
};

type BatchDraftVersion = {
  branch_code: string;
  branch_name: string;
  version_id: string;
  version_week_start: string;
  rows_inserted: number;
  days_generated: number;
  summary?: DraftGenerateMonthResult["summary"];
  reliability_summary?: ReliabilityRow[];
};

type BatchGenerateResult = {
  ok: boolean;
  city: string;
  target_month: string;
  branches_generated: number;
  total_rows_inserted: number;
  total_overtime_hours: number;
  total_unresolved_hours: number;
  versions: BatchDraftVersion[];
  failed_branches: Array<{ branch_code: string; detail: string }>;
};

type RecommendedAction =
  | {
      id: string;
      type: "staffing_rule";
      label: string;
      rationale: string;
      condition_type: "all_days" | "holiday" | "weekend";
      adjustment: number;
      exclude_hours: string;
    }
  | {
      id: string;
      type: "forecast_setting";
      label: string;
      rationale: string;
      setting_key: string;
      setting_value: number;
    };

type AiAnalysisResult = {
  overall_rating: "GOOD" | "FAIR" | "AT_RISK";
  overall_comment: string;
  key_risks: string[];
  recommendations: string[];
  branch_notes: Record<string, string>;
  recommended_actions?: RecommendedAction[];
};

type ApplyPrepareResult = {
  ok: boolean;
  confirm_token: string;
  expires_in_sec: number;
  preview: {
    city: string;
    branch_code: string;
    week_start: string;
    draft_version_id: string;
    rows_count: number;
    staff_count: number;
  };
};

type ApplyConfirmResult = {
  ok: boolean;
  city: string;
  branch_code: string;
  week_start: string;
  draft_version_id: string;
  published_version_id?: string;
  rows_copied?: number;
  warning?: string;
  export?: {
    ok?: boolean;
    sheet_url?: string;
    spreadsheet_id?: string;
    tab_main?: string;
    tab_headcount?: string;
    main_url?: string;
    headcount_url?: string;
    meta?: any;
  };
};

type ExportPrepareResult = {
  ok: boolean;
  confirm_token: string;
};

type ExportConfirmResult = {
  ok: boolean;
  warning?: string;
  sheet_url?: string;
  spreadsheet_id?: string;
  tab_main?: string;
  tab_headcount?: string;
  main_url?: string;
  headcount_url?: string;
  meta?: any;
};

type BatchApplyPrepareResult = {
  ok: boolean;
  items: Array<{
    branch_code: string;
    branch_name: string;
    week_start: string;
    confirm_token: string;
    preview: ApplyPrepareResult["preview"];
  }>;
  total_rows_count: number;
  total_staff_count: number;
};

type BatchApplyConfirmResult = {
  ok: boolean;
  items: Array<{
    branch_code: string;
    branch_name: string;
    week_start: string;
    published_version_id?: string;
    rows_copied?: number;
    warning?: string;
    export?: ApplyConfirmResult["export"];
  }>;
  total_rows_copied: number;
};

type PublishedWeekResult = {
  ok: boolean;
  city: string;
  week_start: string;
  count: number;
  rows: Array<{
    work_date: string;
    branch_code: string;
    area: string;
    staff_name: string;
    role: string;
    start_hour: number;
    end_hour: number;
    is_exception: boolean;
  }>;
};

type VerifyResp = {
  ok: boolean;
  staff_name: string;
  role: "STAFF" | "MANAGER" | "MANAGEMENT" | "HQ" | "ADMIN" | "HR_MANAGER" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT";
};

type PendingSheetProposal = {
  id: string;
  city: string;
  branch_code: string;
  month_key: string;
  work_date: string;
  staff_name: string;
  start_hour: number;
  end_hour: number;
  proposed_staff_name: string;
  proposed_start_hour?: number | null;
  proposed_end_hour?: number | null;
  swap_with_staff?: string;
  note?: string;
  source_tab?: string;
  source_row_number?: number;
  proposed_by?: string;
  proposed_at?: string;
};

function norm(s: string) {
  return (s || "").trim();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function hourText(h: number) {
  const hh = Number(h || 0);
  const base = hh >= 24 ? hh - 24 : hh;
  const suffix = hh >= 24 ? "(+1)" : "";
  return `${pad2(base)}${suffix}`;
}

function rangeText(st: number, en: number) {
  return `${hourText(st)}–${hourText(en)}`;
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${y}-${m}-${dd}`;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function nextMonthKey(base = new Date()) {
  return monthKey(new Date(base.getFullYear(), base.getMonth() + 1, 1));
}

function monthStartDate(month: string) {
  return new Date(`${month}-01T00:00:00`);
}

function monthDates(month: string) {
  const out: string[] = [];
  if (!month || month.length !== 7) return out;
  const start = monthStartDate(month);
  if (Number.isNaN(start.getTime())) return out;
  const y = start.getFullYear();
  const m = start.getMonth();
  const d = new Date(y, m, 1);
  while (d.getMonth() === m) {
    out.push(isoDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function mondayOfDateString(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return isoDate(d);
}

function uniqueStaffCount(rows: DraftRow[]) {
  return new Set(rows.map((r) => norm(r.staff_name)).filter(Boolean)).size;
}

function sortRows(rows: DraftRow[]) {
  return [...rows].sort((a, b) => {
    if (a.work_date !== b.work_date) return a.work_date.localeCompare(b.work_date);
    if (a.staff_name !== b.staff_name) return a.staff_name.localeCompare(b.staff_name);
    if (a.start_hour !== b.start_hour) return a.start_hour - b.start_hour;
    return a.end_hour - b.end_hour;
  });
}

function weekStartsForMonth(month: string) {
  const s = new Set<string>();
  for (const d of monthDates(month)) s.add(mondayOfDateString(d));
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}

function monthRangeLabel(month: string) {
  const dates = monthDates(month);
  if (!dates.length) return "";
  return `${dates[0]} -> ${dates[dates.length - 1]}`;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

function qs(obj: Record<string, any>) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    const s = String(v);
    if (s === "") return;
    p.append(k, s);
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  const text = await res.text();
  if (!res.ok) {
    try {
      const j = JSON.parse(text);
      throw new Error(j?.detail || text || `GET ${path} failed`);
    } catch {
      throw new Error(text || `GET ${path} failed`);
    }
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function apiPost<T = any>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    try {
      const j = JSON.parse(text);
      throw new Error(j?.detail || text || `POST ${path} failed`);
    } catch {
      throw new Error(text || `POST ${path} failed`);
    }
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

const DUBAI_DRAFT_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1IkpYJUAa8OkysEPY2cRs8svrEBHZRIBVY6jGw309uco/edit?gid=2068736399#gid=2068736399";
const MANILA_DRAFT_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1Eoj02lU8YWnDXSVWeJNeRLpYwLf5i3CHRN87nYVpHJs/edit?gid=0#gid=0";

// ---------------------------------------------------------------------------
// Forecast Settings Panel
// ---------------------------------------------------------------------------
type ForecastSettings = {
  holiday_multiplier: number;
  holiday_eve_multiplier: number;
  weekend_multiplier: number;
  weight_year_0: number;
  weight_year_1: number;
  weight_year_2: number;
  // anchor_month: stored as YYYYMM integer (e.g. 202604). 0 = disabled.
  anchor_month: number;
};

// Helper: "YYYY-MM" string ↔ YYYY.MM float
// Stored as YYYY.MM (e.g. 2026.04) to fit in DB NUMERIC(8,4). 0 = disabled.
function anchorMonthToStr(v: number): string {
  if (!v || v < 2000) return "";
  const year = Math.floor(v);
  const month = Math.round((v - year) * 100);
  if (month < 1 || month > 12) return "";
  return `${year}-${String(month).padStart(2, "0")}`;
}
function strToAnchorMonth(s: string): number {
  if (!s) return 0;
  const [y, m] = s.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return 0;
  return parseFloat(`${y}.${String(m).padStart(2, "0")}`);
}

const FORECAST_DEFAULTS_DUBAI: ForecastSettings  = { holiday_multiplier: 1.35, holiday_eve_multiplier: 1.20, weekend_multiplier: 1.25, weight_year_0: 0.80, weight_year_1: 0.20, weight_year_2: 0.00, anchor_month: 0 };
const FORECAST_DEFAULTS_MANILA: ForecastSettings = { holiday_multiplier: 1.35, holiday_eve_multiplier: 1.20, weekend_multiplier: 1.20, weight_year_0: 0.80, weight_year_1: 0.20, weight_year_2: 0.00, anchor_month: 0 };

function ForecastSettingsPanel({
  city,
  approverName,
  pin,
}: {
  city: string;
  approverName: string;
  pin: string;
}) {
  const defaults = city === "dubai" ? FORECAST_DEFAULTS_DUBAI : FORECAST_DEFAULTS_MANILA;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [vals, setVals] = useState<ForecastSettings>(defaults);

  async function loadSettings() {
    if (!city || !approverName || !pin) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ city, approver_name: approverName, pin });
      const res = await fetch(`/api/admin/forecast-settings?${qs}`);
      const j = await res.json();
      if (j.settings) setVals({ ...defaults, ...j.settings });
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function saveSettings() {
    setSaving(true); setSaveMsg("");
    const keys = Object.keys(vals) as (keyof ForecastSettings)[];
    const w0 = vals.weight_year_0, w1 = vals.weight_year_1, w2 = vals.weight_year_2;
    const wSum = +(w0 + w1 + w2).toFixed(4);
    if (wSum < 0.99 || wSum > 1.01) { setSaveMsg(`⚠️ Weights must sum to 1.0 (currently ${wSum})`); setSaving(false); return; }
    try {
      for (const key of keys) {
        const res = await fetch("/api/admin/forecast-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city, key, value: vals[key], approver_name: approverName, pin }),
        });
        if (!res.ok) { const j = await res.json(); setSaveMsg(`❌ ${j.detail || "Failed"}`); setSaving(false); return; }
      }
      setSaveMsg("✅ Saved");
    } catch (e: any) { setSaveMsg(`❌ ${e.message}`); }
    setSaving(false);
  }

  function set(key: keyof ForecastSettings, raw: string) {
    const v = parseFloat(raw);
    if (!isNaN(v)) setVals((p) => ({ ...p, [key]: v }));
  }

  useEffect(() => { if (open) loadSettings(); }, [open, city]);

  const isModified = (key: keyof ForecastSettings) => vals[key] !== defaults[key];
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const mult = (v: number) => `×${v.toFixed(2)}`;

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
      <button type="button" className="flex w-full items-center justify-between" onClick={() => setOpen((p) => !p)}>
        <span className="flex items-center gap-2 font-semibold text-emerald-300">
          <span className="text-lg">📊</span> Forecast Settings
        </span>
        <span className="text-neutral-400 text-sm">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-5">
          {loading ? <p className="text-xs text-neutral-500">Loading…</p> : (
            <>
              {/* Demand Multipliers */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-400">Demand Multipliers</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {([
                    ["holiday_multiplier",     "🎌 Holiday"],
                    ["holiday_eve_multiplier", "🌙 Eve of Holiday"],
                    ["weekend_multiplier",     city === "dubai" ? "🌴 Weekend (Fri–Sat)" : "🌴 Weekend (Sat–Sun)"],
                  ] as [keyof ForecastSettings, string][]).map(([key, lbl]) => (
                    <div key={key}>
                      <label className="block text-xs text-neutral-400 mb-1">
                        {lbl}
                        {isModified(key) && <span className="ml-1 text-amber-400">●</span>}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number" step="0.05" min="0.5" max="5"
                          value={vals[key]}
                          onChange={(e) => set(key, e.target.value)}
                          className={INPUT_CLASS + " text-sm w-24"}
                        />
                        <span className="text-xs text-neutral-500">{mult(vals[key])}</span>
                        {isModified(key) && (
                          <button type="button" onClick={() => setVals((p) => ({ ...p, [key]: defaults[key] }))} className="text-xs text-neutral-500 hover:text-neutral-300">↩</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Forecast Weights */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-400">Historical Forecast Weights</p>
                <p className="mb-3 text-xs text-neutral-500">How much weight to give each year&apos;s same-month data. Must sum to 100%.</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {([
                    ["weight_year_0", "Most recent year"],
                    ["weight_year_1", "2 years ago"],
                    ["weight_year_2", "3 years ago"],
                  ] as [keyof ForecastSettings, string][]).map(([key, lbl]) => (
                    <div key={key}>
                      <label className="block text-xs text-neutral-400 mb-1">
                        {lbl}
                        {isModified(key) && <span className="ml-1 text-amber-400">●</span>}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number" step="0.05" min="0" max="1"
                          value={vals[key]}
                          onChange={(e) => set(key, e.target.value)}
                          className={INPUT_CLASS + " text-sm w-24"}
                        />
                        <span className="text-xs text-neutral-500">{pct(vals[key])}</span>
                        {isModified(key) && (
                          <button type="button" onClick={() => setVals((p) => ({ ...p, [key]: defaults[key] }))} className="text-xs text-neutral-500 hover:text-neutral-300">↩</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Weight sum indicator */}
                {(() => {
                  const s = +(vals.weight_year_0 + vals.weight_year_1 + vals.weight_year_2).toFixed(4);
                  const ok = s >= 0.99 && s <= 1.01;
                  return <p className={`mt-2 text-xs ${ok ? "text-neutral-500" : "text-rose-400 font-semibold"}`}>Sum: {pct(s)} {ok ? "✓" : "— must equal 100%"}</p>;
                })()}
              </div>
              {/* Anchor Month Override */}
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-neutral-400">Anchor Month Override</p>
                <p className="mb-2 text-xs text-neutral-500">
                  When set, this month&apos;s actual hourly order data replaces the &quot;most recent year&quot; reference.
                  Use this when operating hours changed and a specific month should drive all future drafts.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="month"
                    value={anchorMonthToStr(vals.anchor_month)}
                    onChange={(e) => setVals((p) => ({ ...p, anchor_month: strToAnchorMonth(e.target.value) }))}
                    className={INPUT_CLASS + " text-sm w-40"}
                  />
                  {vals.anchor_month > 0 && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                      Active: {anchorMonthToStr(vals.anchor_month)}
                    </span>
                  )}
                  {vals.anchor_month !== defaults.anchor_month && (
                    <button
                      type="button"
                      onClick={() => setVals((p) => ({ ...p, anchor_month: defaults.anchor_month }))}
                      className="text-xs text-neutral-500 hover:text-neutral-300"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={saveSettings} disabled={saving} className={PRIMARY_BUTTON + " text-sm"}>
                  {saving ? "Saving…" : "Save Settings"}
                </button>
                <button type="button" onClick={() => setVals(defaults)} className="text-xs text-neutral-400 hover:text-neutral-200">Reset to defaults</button>
                {saveMsg && <span className="text-xs text-neutral-300">{saveMsg}</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Operating Hours Panel
// ---------------------------------------------------------------------------
type OpHoursRecord = {
  id: number;
  city: string;
  date_from: string;
  date_to: string;
  open_hour: number;
  close_hour: number;
  label: string;
};

function OperatingHoursPanel({
  city,
  approverName,
  pin,
  targetMonth,
}: {
  city: string;
  approverName: string;
  pin: string;
  targetMonth: string;
}) {
  const [records, setRecords] = useState<OpHoursRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [openHour, setOpenHour] = useState("10");
  const [closeHour, setCloseHour] = useState("23");
  const [label, setLabel] = useState("");
  const [addError, setAddError] = useState("");

  async function loadRecords() {
    if (!city || !approverName || !pin) return;
    setLoading(true);
    try {
      const yr = targetMonth ? targetMonth.slice(0, 4) : new Date().getFullYear().toString();
      const qs = new URLSearchParams({ city, approver_name: approverName, pin, date_from: `${yr}-01-01`, date_to: `${yr}-12-31` });
      const res = await fetch(`/api/admin/operating-hours?${qs}`);
      const j = await res.json();
      setRecords(Array.isArray(j.records) ? j.records : []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function addRecord() {
    setAddError("");
    if (!dateFrom || !dateTo) { setAddError("Start date and end date are required."); return; }
    const oh = parseInt(openHour), ch = parseInt(closeHour);
    if (isNaN(oh) || isNaN(ch) || oh < 0 || oh > 23 || ch < 1 || ch > 30) { setAddError("Open: 0–23. Close: 1–30 (25=1am next day, 26=2am next day…)"); return; }
    if (ch <= oh && ch <= 24) { setAddError("Same-day close must be after open. For next-day (e.g. 2am) enter 26."); return; }
    try {
      const res = await fetch("/api/admin/operating-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, date_from: dateFrom, date_to: dateTo, open_hour: oh, close_hour: ch, label, approver_name: approverName, pin }),
      });
      if (!res.ok) { const j = await res.json(); setAddError(j.detail || "Failed"); return; }
      setDateFrom(""); setDateTo(""); setLabel("");
      loadRecords();
    } catch (e: any) { setAddError(e.message); }
  }

  async function deleteRecord(id: number) {
    await fetch(`/api/admin/operating-hours/${id}?approver_name=${encodeURIComponent(approverName)}&pin=${encodeURIComponent(pin)}`, { method: "DELETE" });
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }

  useEffect(() => { if (open) loadRecords(); }, [open, targetMonth, city]);

  const fmt = (h: number) => h >= 25 ? `${String(h - 24).padStart(2, "0")}:00+1` : `${String(h).padStart(2, "0")}:00`;

  return (
    <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-5">
      <button type="button" className="flex w-full items-center justify-between" onClick={() => setOpen((p) => !p)}>
        <span className="flex items-center gap-2 font-semibold text-sky-300">
          <span className="text-lg">🕐</span> Operating Hours Override
          {records.length > 0 && <span className="ml-2 rounded-full bg-sky-500/20 px-2 py-0.5 text-xs text-sky-200">{records.length} period{records.length > 1 ? "s" : ""}</span>}
        </span>
        <span className="text-neutral-400 text-sm">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-neutral-400">Set restricted operating hours for a date range (e.g. war/emergency period). Shifts outside these hours will be set to 0 staff.</p>
          {/* Add form */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-neutral-400 mb-1">From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={INPUT_CLASS + " text-sm"} />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={INPUT_CLASS + " text-sm"} />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Label</label>
              <input type="text" placeholder="e.g. War period, Ramadan" value={label} onChange={(e) => setLabel(e.target.value)} className={INPUT_CLASS + " text-sm"} />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Open hour (0–23)</label>
              <input type="number" min={0} max={23} value={openHour} onChange={(e) => setOpenHour(e.target.value)} className={INPUT_CLASS + " text-sm"} />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Close hour (1–30, 25+=next day)</label>
              <input type="number" min={1} max={30} value={closeHour} onChange={(e) => setCloseHour(e.target.value)} className={INPUT_CLASS + " text-sm"} />
            </div>
            <div className="flex items-end">
              <button type="button" onClick={addRecord} className={PRIMARY_BUTTON + " w-full text-sm"}>Add</button>
            </div>
          </div>
          {addError && <p className="text-xs text-rose-400">{addError}</p>}
          {/* Quick presets */}
          <div className="flex flex-wrap gap-2">
            {[["11:00–21:00", "11", "21"], ["12:00–22:00", "12", "22"], ["10:00–20:00", "10", "20"], ["11:00–02:00+1", "11", "26"], ["11:00–05:00+1", "11", "29"]].map(([lbl, o, c]) => (
              <button key={lbl} type="button" onClick={() => { setOpenHour(o); setCloseHour(c); }} className="rounded-lg border border-sky-500/30 px-3 py-1 text-xs text-sky-300 hover:bg-sky-500/10">{lbl}</button>
            ))}
          </div>
          {/* List */}
          {loading ? <p className="text-xs text-neutral-500">Loading…</p> : records.length === 0 ? (
            <p className="text-xs text-neutral-500">No operating hour overrides set. Default: full 24h.</p>
          ) : (
            <div className="space-y-2">
              {records.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                  <div>
                    <span className="font-mono text-sky-200">{r.date_from} → {r.date_to}</span>
                    <span className="mx-2 text-neutral-400">|</span>
                    <span className="text-white">{fmt(r.open_hour)}–{fmt(r.close_hour)}</span>
                    {r.label && <span className="ml-2 text-xs text-neutral-400">{r.label}</span>}
                  </div>
                  <button type="button" onClick={() => deleteRecord(r.id)} className="ml-2 text-xs text-rose-400 hover:text-rose-300">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Staffing Rules Panel
// ---------------------------------------------------------------------------
type StaffingRule = {
  id: number;
  city: string;
  condition_type: string;
  adjustment: number;
  exclude_hours: string;
  label: string;
};

function StaffingRulesPanel({
  city,
  approverName,
  pin,
}: {
  city: string;
  approverName: string;
  pin: string;
}) {
  const [rules, setRules] = useState<StaffingRule[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [condition, setCondition] = useState("holiday");
  const [adjustment, setAdjustment] = useState("-1");
  const [peakExempt, setPeakExempt] = useState(true);
  const [peakStart, setPeakStart] = useState("18");
  const [peakEnd, setPeakEnd] = useState("22");
  const [label, setLabel] = useState("");
  const [addError, setAddError] = useState("");

  async function loadRules() {
    if (!city || !approverName || !pin) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ city, approver_name: approverName, pin });
      const res = await fetch(`/api/admin/staffing-rules?${qs}`);
      const j = await res.json();
      setRules(Array.isArray(j.rules) ? j.rules : []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function addRule() {
    setAddError("");
    const adj = parseInt(adjustment);
    if (isNaN(adj) || adj === 0) { setAddError("Adjustment must be a non-zero integer."); return; }
    let excludeHours = "";
    if (peakExempt) {
      const ps = parseInt(peakStart), pe = parseInt(peakEnd);
      if (!isNaN(ps) && !isNaN(pe) && ps < pe) {
        excludeHours = Array.from({ length: pe - ps }, (_, i) => String(ps + i)).join(",");
      }
    }
    try {
      const res = await fetch("/api/admin/staffing-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, condition_type: condition, adjustment: adj, exclude_hours: excludeHours, label, approver_name: approverName, pin }),
      });
      if (!res.ok) { const j = await res.json(); setAddError(j.detail || "Failed"); return; }
      setLabel("");
      loadRules();
    } catch (e: any) { setAddError(e.message); }
  }

  async function deleteRule(id: number) {
    await fetch(`/api/admin/staffing-rules/${id}?approver_name=${encodeURIComponent(approverName)}&pin=${encodeURIComponent(pin)}`, { method: "DELETE" });
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  useEffect(() => { if (open) loadRules(); }, [open, city]);

  const conditionLabel = (c: string) => c === "holiday" ? "🎌 Holiday" : c === "weekend" ? "📅 Weekend" : "📆 Every Day";
  const adjColor = (a: number) => a < 0 ? "text-rose-300" : "text-emerald-300";

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5">
      <button type="button" className="flex w-full items-center justify-between" onClick={() => setOpen((p) => !p)}>
        <span className="flex items-center gap-2 font-semibold text-violet-300">
          <span className="text-lg">⚙️</span> Staffing Adjustment Rules
          {rules.length > 0 && <span className="ml-2 rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-200">{rules.length} rule{rules.length > 1 ? "s" : ""}</span>}
        </span>
        <span className="text-neutral-400 text-sm">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-neutral-400">Add rules to auto-adjust staff count during specific day types. Peak hours can be exempted to maintain service quality.</p>
          {/* Add form */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Condition</label>
              <select value={condition} onChange={(e) => setCondition(e.target.value)} className={SELECT_CLASS + " text-sm"}>
                <option value="holiday">Holiday</option>
                <option value="weekend">Weekend</option>
                <option value="all_days">Every Day</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Staff adjustment</label>
              <input type="number" placeholder="-1 or +1" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} className={INPUT_CLASS + " text-sm"} />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Label</label>
              <input type="text" placeholder="e.g. Holiday double pay" value={label} onChange={(e) => setLabel(e.target.value)} className={INPUT_CLASS + " text-sm"} />
            </div>
          </div>
          {/* Peak exempt */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
              <input type="checkbox" checked={peakExempt} onChange={(e) => setPeakExempt(e.target.checked)} className="rounded" />
              Exempt peak hours from this rule
            </label>
            {peakExempt && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-neutral-400">Peak:</span>
                <input type="number" min={0} max={23} value={peakStart} onChange={(e) => setPeakStart(e.target.value)} className={INPUT_CLASS + " w-16 text-sm"} />
                <span className="text-neutral-400">–</span>
                <input type="number" min={1} max={24} value={peakEnd} onChange={(e) => setPeakEnd(e.target.value)} className={INPUT_CLASS + " w-16 text-sm"} />
                <span className="text-xs text-neutral-500">(rule skipped for these hours)</span>
              </div>
            )}
          </div>
          <button type="button" onClick={addRule} className={PRIMARY_BUTTON + " text-sm"}>Add Rule</button>
          {addError && <p className="text-xs text-rose-400">{addError}</p>}
          {/* List */}
          {loading ? <p className="text-xs text-neutral-500">Loading…</p> : rules.length === 0 ? (
            <p className="text-xs text-neutral-500">No staffing rules set.</p>
          ) : (
            <div className="space-y-2">
              {rules.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-neutral-200">{conditionLabel(r.condition_type)}</span>
                    <span className={`font-mono font-bold ${adjColor(r.adjustment)}`}>{r.adjustment > 0 ? "+" : ""}{r.adjustment} staff</span>
                    {r.exclude_hours && <span className="text-xs text-neutral-400">exempt: {r.exclude_hours.replace(/,/g, ", ")}h</span>}
                    {r.label && <span className="text-xs text-neutral-500 italic">{r.label}</span>}
                  </div>
                  <button type="button" onClick={() => deleteRule(r.id)} className="ml-2 text-xs text-rose-400 hover:text-rose-300">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demand Events Panel component
// ---------------------------------------------------------------------------
type DemandEvent = {
  id: number;
  city: string;
  branch_code: string;
  event_date: string;
  multiplier: number;
  label: string;
  created_by: string;
};

function DemandEventsPanel({
  city,
  approverName,
  pin,
  targetMonth,
}: {
  city: string;
  approverName: string;
  pin: string;
  targetMonth: string;
}) {
  const [events, setEvents] = useState<DemandEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newMult, setNewMult] = useState("1.3");
  const [addError, setAddError] = useState("");
  const [open, setOpen] = useState(false);

  async function loadEvents() {
    if (!city || !approverName || !pin || !targetMonth) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ city, approver_name: approverName, pin, date_from: `${targetMonth}-01`, date_to: `${targetMonth}-31` });
      const res = await fetch(`/api/admin/demand-events?${qs}`);
      const j = await res.json();
      setEvents(Array.isArray(j.events) ? j.events : []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function addEvent() {
    setAddError("");
    if (!newDate || !newLabel) { setAddError("Date and label are required."); return; }
    const mult = parseFloat(newMult);
    if (isNaN(mult) || mult < 0.1 || mult > 5) { setAddError("Multiplier must be 0.1–5.0."); return; }
    try {
      const res = await fetch("/api/admin/demand-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, branch_code: "", event_date: newDate, multiplier: mult, label: newLabel, approver_name: approverName, pin }),
      });
      if (!res.ok) { const j = await res.json(); setAddError(j.detail || "Failed"); return; }
      setNewDate(""); setNewLabel(""); setNewMult("1.3");
      loadEvents();
    } catch (e: any) { setAddError(e.message); }
  }

  async function deleteEvent(id: number) {
    await fetch(`/api/admin/demand-events/${id}?approver_name=${encodeURIComponent(approverName)}&pin=${encodeURIComponent(pin)}`, { method: "DELETE" });
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  useEffect(() => { if (open) loadEvents(); }, [open, targetMonth, city]);

  const multColor = (m: number) => m >= 1.3 ? "text-amber-300" : m >= 1.1 ? "text-sky-300" : m < 1.0 ? "text-rose-300" : "text-neutral-300";

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
      <button type="button" className="flex w-full items-center justify-between" onClick={() => setOpen((p) => !p)}>
        <div className="flex items-center gap-2">
          <span className="text-lg">📅</span>
          <span className="font-semibold text-amber-200">Demand Events — {targetMonth}</span>
          {events.length > 0 && !open && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">{events.length} events</span>}
        </div>
        <span className="text-xs text-neutral-500">{open ? "▲ Hide" : "▼ Manage holidays & campaigns"}</span>
      </button>

      {open ? (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-neutral-400">
            Register special days for <strong className="text-white">{city === "dubai" ? "Dubai" : "Manila"} — {targetMonth}</strong>.
            These multipliers are applied to demand forecasting when generating the monthly draft.
            UAE/Philippines public holidays are already applied automatically.
          </p>

          {/* Add new event */}
          <div className="grid grid-cols-1 gap-2 rounded-xl border border-white/10 bg-white/5 p-3 sm:grid-cols-4">
            <div>
              <div className="mb-1 text-xs text-neutral-400">Date</div>
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white focus:outline-none" />
            </div>
            <div className="sm:col-span-2">
              <div className="mb-1 text-xs text-neutral-400">Label (e.g. Mega Sale, Ramadan)</div>
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Event name..." className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white focus:outline-none" />
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-400">Multiplier (1.0 = normal)</div>
              <div className="flex gap-2">
                <input value={newMult} onChange={(e) => setNewMult(e.target.value)} className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white focus:outline-none" />
                <button type="button" onClick={addEvent} className="flex-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500">+ Add</button>
              </div>
            </div>
            {addError ? <div className="sm:col-span-4 text-xs text-rose-400">{addError}</div> : null}
          </div>

          {/* Multiplier presets */}
          <div className="flex flex-wrap gap-2">
            {[["🎉 Big Event ×1.5", "1.5"], ["📈 Promotion ×1.3", "1.3"], ["🌙 Ramadan ×1.2", "1.2"], ["📉 Slow Day ×0.8", "0.8"]].map(([label, val]) => (
              <button key={val} type="button" onClick={() => setNewMult(val)} className={`rounded-full border px-3 py-1 text-xs ${newMult === val ? "border-amber-400 bg-amber-400/20 text-amber-200" : "border-white/10 text-neutral-400 hover:border-white/30"}`}>{label}</button>
            ))}
          </div>

          {/* Events list */}
          {loading ? <p className="text-xs text-neutral-500">Loading…</p> : events.length === 0 ? (
            <p className="text-xs text-neutral-500">No events registered. UAE/PH holidays are applied automatically.</p>
          ) : (
            <div className="space-y-1.5">
              {events.map((ev) => (
                <div key={ev.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="w-24 font-mono text-xs text-neutral-400">{ev.event_date}</span>
                    <span className="text-white">{ev.label}</span>
                    {ev.branch_code ? <span className="text-xs text-neutral-500">[{ev.branch_code}]</span> : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-semibold ${multColor(ev.multiplier)}`}>×{ev.multiplier.toFixed(2)}</span>
                    <button type="button" onClick={() => deleteEvent(ev.id)} className="text-xs text-neutral-500 hover:text-rose-400">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function AdminDraftPage() {
  const router = useRouter();
  const auth = getAuth();
  const [city, setCity] = useState<City>(String(auth?.city || "").toLowerCase() === "manila" ? "manila" : "dubai");
  const draftBranches = useMemo(() => BRANCHES[city].map((b) => b.code as BranchCode), [city]);
  const targetMonth = useMemo(() => nextMonthKey(new Date()), []);

  const [approverName, setApproverName] = useState(auth?.staffName || "");
  const [pin, setPin] = useState(auth?.pin || "");
  const [myRole, setMyRole] = useState<
    "STAFF" | "MANAGER" | "MANAGEMENT" | "HQ" | "ADMIN" | "HR_MANAGER" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT" | ""
  >("");

  const [prepared, setPrepared] = useState<null | {
    city: string;
    branch_codes: string[];
    target_month: string;
  }>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [versions, setVersions] = useState<BatchDraftVersion[]>([]);
  const [activeBranchCode, setActiveBranchCode] = useState<string>("");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [generateResult, setGenerateResult] = useState<BatchGenerateResult | null>(null);

  const [newWorkDate, setNewWorkDate] = useState("");
  const [newStaffName, setNewStaffName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newStartHour, setNewStartHour] = useState("9");
  const [newEndHour, setNewEndHour] = useState("18");
  const [editingRow, setEditingRow] = useState<DraftRow | null>(null);
  const [draftTab, setDraftTab] = useState<"schedule" | "manage">("schedule");

  const [applyMonth, setApplyMonth] = useState(targetMonth);
  const [applyPrepared, setApplyPrepared] = useState<BatchApplyPrepareResult | null>(null);
  const [applyResult, setApplyResult] = useState<BatchApplyConfirmResult | null>(null);
  const [published, setPublished] = useState<PublishedWeekResult | null>(null);
  const [pendingRows, setPendingRows] = useState<PendingSheetProposal[]>([]);
  const [pendingBranch, setPendingBranch] = useState<string>("ALL");
  const [selectedProposalIds, setSelectedProposalIds] = useState<string[]>([]);
  const [decisionNote, setDecisionNote] = useState("");
  const [pendingBusy, setPendingBusy] = useState(false);
  const [pendingMessage, setPendingMessage] = useState("");
  const [sheetSpreadsheetId, setSheetSpreadsheetId] = useState("");
  const [sheetTabMain, setSheetTabMain] = useState("");
  const [sheetRange, setSheetRange] = useState("A1:CL2000");
  const [sheetTabs, setSheetTabs] = useState<string[]>([]);
  const [sheetTabsBusy, setSheetTabsBusy] = useState(false);

  // AI analysis
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysisResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [openReliabilityBranch, setOpenReliabilityBranch] = useState<string | null>(null);
  const aiRef = useRef<HTMLDivElement | null>(null);
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set());
  const [applyingActions, setApplyingActions] = useState(false);
  const [applyActionsError, setApplyActionsError] = useState("");

  // Staff Master Data (①②③④⑤)
  const [shiftMaster, setShiftMaster] = useState<ShiftMasterData | null>(null);
  const [violations, setViolations] = useState<ShiftViolation[]>([]);

  // Export state
  const [sheetExportLoading, setSheetExportLoading] = useState(false);
  const [sheetExportResult, setSheetExportResult] = useState<{ ok: boolean; url?: string } | null>(null);
  const [sheetExportError, setSheetExportError] = useState("");
  const [xlsxExporting, setXlsxExporting] = useState(false);

  const canOperate = myRole === "HQ" || myRole === "ADMIN";
  const targetMonthDates = useMemo(() => monthDates(targetMonth), [targetMonth]);
  const applyWeekStarts = useMemo(() => weekStartsForMonth(applyMonth), [applyMonth]);
  const version = useMemo(
    () => versions.find((item) => item.branch_code === activeBranchCode) || null,
    [versions, activeBranchCode]
  );

  const grouped = useMemo(() => {
    const m = new Map<string, DraftRow[]>();
    for (const r of sortRows(rows)) {
      const key = r.work_date;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return Array.from(m.entries());
  }, [rows]);
  const pendingVisibleRows = useMemo(() => {
    if (pendingBranch === "ALL") return pendingRows;
    return pendingRows.filter((r) => (r.branch_code || "").toUpperCase() === pendingBranch);
  }, [pendingRows, pendingBranch]);
  const defaultSyncBranch = useMemo(() => {
    if (pendingBranch !== "ALL") return pendingBranch;
    if (activeBranchCode) return activeBranchCode;
    if (versions[0]?.branch_code) return versions[0].branch_code;
    return "";
  }, [pendingBranch, activeBranchCode, versions]);

  useEffect(() => {
    if (!auth?.staffName) {
      router.replace("/login");
      return;
    }
    if (!canAccessAdminNav(auth)) {
      router.replace("/week");
    }
  }, [auth, router]);

  // Load staff master from localStorage on mount
  useEffect(() => {
    const saved = loadShiftMaster();
    if (saved) setShiftMaster(saved);
  }, []);

  // Re-run violations whenever rows or shiftMaster changes
  useEffect(() => {
    if (!shiftMaster || rows.length === 0) {
      setViolations([]);
      return;
    }
    setViolations(checkViolations(rows, shiftMaster));
  }, [rows, shiftMaster]);

  useEffect(() => {
    const run = async () => {
      const nm = approverName.trim();
      const p = pin.trim();

      if (!nm || !p) {
        setMyRole("");
        return;
      }

      try {
        const r = await apiPost<VerifyResp>(`/api/auth/verify${qs({ staff_name: nm, pin: p })}`);
        if (r?.ok) setMyRole(r.role || "");
        else setMyRole("");
      } catch {
        setMyRole("");
      }
    };

    run();
  }, [approverName, pin]);

  useEffect(() => {
    setPrepared(null);
    setVersions([]);
    setActiveBranchCode("");
    setRows([]);
    setGenerateResult(null);
    setApplyPrepared(null);
    setApplyResult(null);
    setPublished(null);
    setEditingRow(null);
    setApplyMonth(targetMonth);
    setError("");
  }, [city, targetMonth]);

  useEffect(() => {
    setApplyMonth(targetMonth);
  }, [targetMonth]);

  useEffect(() => {
    if (!versions.length) {
      setActiveBranchCode("");
      return;
    }
    if (!activeBranchCode || !versions.some((item) => item.branch_code === activeBranchCode)) {
      setActiveBranchCode(versions[0].branch_code);
    }
  }, [versions, activeBranchCode]);

  // Reset export state when branch changes
  useEffect(() => {
    setSheetExportResult(null);
    setSheetExportError("");
  }, [activeBranchCode]);

  useEffect(() => {
    let mounted = true;

    async function loadDraftRows() {
      if (!version?.version_id) {
        setRows([]);
        return;
      }
      try {
        const rr = await apiGet<{ ok: boolean; version_id: string; rows: DraftRow[] }>(
          `/api/draft/rows${qs({ version_id: version.version_id })}`
        );
        const nextRows = sortRows(rr.rows || []);
        if (!mounted) return;
        setRows(nextRows);
        if (nextRows.length > 0) {
          setNewWorkDate(nextRows[0].work_date);
        } else if (targetMonthDates.length > 0) {
          setNewWorkDate(targetMonthDates[0]);
        }
      } catch {
        if (mounted) setRows([]);
      }
    }

    setEditingRow(null);
    loadDraftRows();
    return () => {
      mounted = false;
    };
  }, [version?.version_id, targetMonthDates]);

  useEffect(() => {
    let mounted = true;

    async function loadPublished() {
      if (!applyWeekStarts.length) {
        setPublished(null);
        return;
      }
      try {
        const pr = await apiGet<PublishedWeekResult>(
          `/api/published/week${qs({ city, week_start: applyWeekStarts[0] })}`
        );
        if (mounted) setPublished(pr);
      } catch {
        if (mounted) setPublished(null);
      }
    }

    loadPublished();
    return () => {
      mounted = false;
    };
  }, [city, applyWeekStarts]);

  useEffect(() => {
    loadPendingProposals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canOperate, approverName, pin, applyMonth, pendingBranch]);

  useEffect(() => {
    if (sheetTabMain.trim()) return;
    const fromApply = (applyResult?.items || [])
      .map((x) => x.export?.tab_main || "")
      .find((x) => !!x);
    if (fromApply) setSheetTabMain(fromApply);
  }, [applyResult, sheetTabMain]);

  useEffect(() => {
    loadSheetTabs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canOperate, approverName, pin, city, applyMonth]);

  function prepareDraft() {
    setError("");
    setGenerateResult(null);
    setPrepared({
      city,
      branch_codes: draftBranches,
      target_month: targetMonth,
    });
    setConfirmChecked(false);
    setApplyPrepared(null);
    setApplyResult(null);
    setPublished(null);
  }

  async function confirmGenerate() {
    if (!prepared) return;
    setLoading(true);
    setError("");
    setGenerateResult(null);
    setVersions([]);
    setActiveBranchCode("");
    setRows([]);
    setApplyPrepared(null);
    setApplyResult(null);
    setPublished(null);
    setEditingRow(null);
    setApplyMonth(prepared.target_month);

    try {
      const nextVersions: BatchDraftVersion[] = [];
      const failedBranches: Array<{ branch_code: string; detail: string }> = [];
      let totalRowsInserted = 0;
      let totalOvertimeHours = 0;
      let totalUnresolvedHours = 0;

      for (const code of prepared.branch_codes) {
        try {
          const res = (await apiPost(`/api/draft/generate_month`, {
            city: prepared.city,
            branch_code: code,
            target_month: prepared.target_month,
            created_by: approverName || "AI",
          })) as DraftGenerateMonthResult;
          nextVersions.push({
            branch_code: res.branch_code,
            branch_name: labelOf("dubai", res.branch_code),
            version_id: res.version_id,
            version_week_start: res.version_week_start,
            rows_inserted: res.rows_inserted,
            days_generated: res.days_generated,
            summary: res.summary,
          });
          totalRowsInserted += Number(res.rows_inserted || 0);
          totalOvertimeHours += Number(res.summary?.total_overtime_hours || 0);
          totalUnresolvedHours += Number(res.summary?.total_unresolved_hours || 0);
        } catch (branchError: any) {
          failedBranches.push({
            branch_code: code,
            detail: String(branchError?.message || branchError || "Failed"),
          });
        }
      }

      if (!nextVersions.length) {
        throw new Error(`Failed to generate monthly drafts for ${city === "dubai" ? "Dubai" : "Manila"} branches.`);
      }

      setVersions(nextVersions);
      setActiveBranchCode(nextVersions[0]?.branch_code || "");
      setGenerateResult({
        ok: failedBranches.length === 0,
        city: prepared.city,
        target_month: prepared.target_month,
        branches_generated: nextVersions.length,
        total_rows_inserted: totalRowsInserted,
        total_overtime_hours: totalOvertimeHours,
        total_unresolved_hours: totalUnresolvedHours,
        versions: nextVersions,
        failed_branches: failedBranches,
      });
      setApplyMonth(prepared.target_month);
      if (failedBranches.length) {
        setError(
          failedBranches
            .map((item) => `${item.branch_code}: ${item.detail}`)
            .join("\n")
        );
      }
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to generate monthly draft"));
    } finally {
      setLoading(false);
    }
  }

  function startEditRow(r: DraftRow) {
    setEditingRow(r);
    setNewWorkDate(r.work_date);
    setNewStaffName(r.staff_name);
    setNewRole(r.role || "");
    setNewStartHour(String(r.start_hour));
    setNewEndHour(String(r.end_hour));
  }

  function cancelEdit() {
    setEditingRow(null);
    setNewStaffName("");
    setNewRole("");
    setNewStartHour("9");
    setNewEndHour("18");
    setNewWorkDate(targetMonthDates[0] || "");
  }

  async function saveRow() {
    if (!version?.version_id) return;
    setLoading(true);
    setError("");

    try {
      const nextRow = {
        work_date: norm(newWorkDate),
        staff_name: norm(newStaffName),
        role: norm(newRole),
        start_hour: Number(newStartHour),
        end_hour: Number(newEndHour),
      };

      if (!nextRow.work_date) throw new Error("Date is required");
      if (!nextRow.staff_name) throw new Error("Staff name is required");
      if (Number.isNaN(nextRow.start_hour) || Number.isNaN(nextRow.end_hour)) {
        throw new Error("Start / End hour is invalid");
      }
      if (nextRow.end_hour <= nextRow.start_hour) {
        throw new Error("End hour must be greater than start hour");
      }

      if (editingRow?.id) {
        await apiPost(`/api/draft/rows/update`, {
          row_id: editingRow.id,
          ...nextRow,
        });
      } else {
        await apiPost(`/api/draft/rows/upsert`, {
          version_id: version.version_id,
          ...nextRow,
        });
      }

      const rr = await apiGet<{ ok: boolean; version_id: string; rows: DraftRow[] }>(
        `/api/draft/rows${qs({ version_id: version.version_id })}`
      );
      setRows(sortRows(rr.rows || []));

      setEditingRow(null);
      setNewStaffName("");
      setNewRole("");
      setNewStartHour("9");
      setNewEndHour("18");
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to save row"));
    } finally {
      setLoading(false);
    }
  }

  async function deleteRow(r: DraftRow) {
    if (!version?.version_id) return;
    setLoading(true);
    setError("");

    try {
      await apiPost(`/api/draft/rows/delete_by_id`, {
        row_id: r.id,
      });

      const rr = await apiGet<{ ok: boolean; version_id: string; rows: DraftRow[] }>(
        `/api/draft/rows${qs({ version_id: version.version_id })}`
      );
      setRows(sortRows(rr.rows || []));

      if (editingRow?.id === r.id) {
        cancelEdit();
      }
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to delete row"));
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateRow(
    id: string,
    fields: { work_date: string; staff_name: string; role: string; start_hour: number; end_hour: number }
  ) {
    if (!version?.version_id) return;
    setLoading(true);
    setError("");
    try {
      await apiPost(`/api/draft/rows/update`, { row_id: id, ...fields });
      const rr = await apiGet<{ ok: boolean; version_id: string; rows: DraftRow[] }>(
        `/api/draft/rows${qs({ version_id: version.version_id })}`
      );
      setRows(sortRows(rr.rows || []));
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to update row"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteRow(id: string) {
    if (!version?.version_id) return;
    setLoading(true);
    setError("");
    try {
      await apiPost(`/api/draft/rows/delete_by_id`, { row_id: id });
      const rr = await apiGet<{ ok: boolean; version_id: string; rows: DraftRow[] }>(
        `/api/draft/rows${qs({ version_id: version.version_id })}`
      );
      setRows(sortRows(rr.rows || []));
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to delete row"));
    } finally {
      setLoading(false);
    }
  }

  async function handleAddRow(date: string, staffName: string, role: string, start: number, end: number) {
    if (!version?.version_id) return;
    setLoading(true);
    setError("");
    try {
      await apiPost(`/api/draft/rows/upsert`, {
        version_id: version.version_id,
        work_date: date,
        staff_name: staffName,
        role,
        start_hour: start,
        end_hour: end,
      });
      const rr = await apiGet<{ ok: boolean; version_id: string; rows: DraftRow[] }>(
        `/api/draft/rows${qs({ version_id: version.version_id })}`
      );
      setRows(sortRows(rr.rows || []));
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to add row"));
    } finally {
      setLoading(false);
    }
  }

  async function buildApplyPrepared(): Promise<BatchApplyPrepareResult> {
    if (!versions.length) {
      throw new Error("No generated drafts found.");
    }
    if (!applyMonth) {
      throw new Error("Select a month to publish first.");
    }
    if (!applyWeekStarts.length) {
      throw new Error("No publishable weeks found for the selected month.");
    }

    const items: BatchApplyPrepareResult["items"] = [];
    let totalRowsCount = 0;
    let totalStaffCount = 0;
    for (const item of versions) {
      for (const weekStart of applyWeekStarts) {
        const res = await apiPost<ApplyPrepareResult>(`/api/draft/apply/prepare`, {
          city,
          branch_code: item.branch_code,
          week_start: weekStart,
          draft_version_id: item.version_id,
          approver_name: approverName,
          pin,
        });
        items.push({
          branch_code: item.branch_code,
          branch_name: item.branch_name,
          week_start: weekStart,
          confirm_token: res.confirm_token,
          preview: res.preview,
        });
        totalRowsCount += Number(res.preview?.rows_count || 0);
        totalStaffCount += Number(res.preview?.staff_count || 0);
      }
    }
    return {
      ok: true,
      items,
      total_rows_count: totalRowsCount,
      total_staff_count: totalStaffCount,
    };
  }

  async function prepareApply() {
    setLoading(true);
    setError("");
    setApplyPrepared(null);
    setApplyResult(null);

    try {
      const prepared = await buildApplyPrepared();
      setApplyPrepared(prepared);
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to prepare apply"));
    } finally {
      setLoading(false);
    }
  }

  async function confirmApply() {
    setLoading(true);
    setError("");
    setApplyResult(null);

    try {
      const prepared = applyPrepared?.items?.length ? applyPrepared : await buildApplyPrepared();
      setApplyPrepared(prepared);
      const confirmedItems: BatchApplyConfirmResult["items"] = [];
      let totalRowsCopied = 0;
      for (const item of prepared.items) {
        const res = await apiPost<ApplyConfirmResult>(`/api/draft/apply/confirm`, {
          confirm_token: item.confirm_token,
          approver_name: approverName,
          pin,
          auto_export: false,
          export_month: applyMonth,
        });
        confirmedItems.push({
          branch_code: item.branch_code,
          branch_name: item.branch_name,
          week_start: item.week_start,
          published_version_id: res.published_version_id,
          rows_copied: res.rows_copied,
          warning: res.warning,
        });
        totalRowsCopied += Number(res.rows_copied || 0);
      }

      // Export once per branch/month to avoid Google Sheets write quota spikes.
      const exportByBranch: Record<string, ApplyConfirmResult["export"]> = {};
      const exportWarningByBranch: Record<string, string> = {};
      const uniqueBranches = Array.from(
        new Map(confirmedItems.map((x) => [x.branch_code, { code: x.branch_code, name: x.branch_name }])).values()
      );
      for (const branch of uniqueBranches) {
        try {
          const prep = await apiPost<ExportPrepareResult>(`/api/admin/export/month/prepare`, {
            city,
            branch_code: branch.code,
            month: applyMonth,
            mode: "FINAL",
            approver_name: approverName,
            pin,
          });
          const confirm = await apiPost<ExportConfirmResult>(`/api/admin/export/month/confirm`, {
            confirm_token: prep.confirm_token,
            approver_name: approverName,
            pin,
          });
          exportByBranch[branch.code] = {
            ok: confirm.ok,
            sheet_url: confirm.sheet_url,
            spreadsheet_id: confirm.spreadsheet_id,
            tab_main: confirm.tab_main,
            tab_headcount: confirm.tab_headcount,
            main_url: confirm.main_url,
            headcount_url: confirm.headcount_url,
            meta: confirm.meta,
          };
          if (confirm.warning) {
            exportWarningByBranch[branch.code] = String(confirm.warning);
          }
          await sleep(300);
        } catch (e: any) {
          exportWarningByBranch[branch.code] = String(e?.message || e || "Export failed");
        }
      }

      const items = confirmedItems.map((item) => ({
        ...item,
        export: exportByBranch[item.branch_code],
        warning: item.warning || exportWarningByBranch[item.branch_code],
      }));
      setApplyResult({
        ok: true,
        items,
        total_rows_copied: totalRowsCopied,
      });

      const pr = await apiGet<PublishedWeekResult>(
        `/api/published/week${qs({ city, week_start: applyWeekStarts[0] })}`
      );
      setPublished(pr);
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to confirm apply"));
    } finally {
      setLoading(false);
    }
  }

  async function loadPendingProposals() {
    if (!canOperate) return;
    if (!approverName.trim() || !pin.trim()) {
      setPendingRows([]);
      setSelectedProposalIds([]);
      return;
    }
    setPendingBusy(true);
    setPendingMessage("");
    try {
      const branchParam = pendingBranch === "ALL" ? "" : pendingBranch;
      const resp = await apiGet<{ ok: boolean; count: number; items: PendingSheetProposal[] }>(
        `/api/draft/sheet/proposals${qs({
          city,
          branch_code: branchParam,
          month_key: applyMonth,
          status: "PENDING_HQ",
          approver_name: approverName,
          pin,
          limit: 500,
        })}`
      );
      const items = Array.isArray(resp?.items) ? resp.items : [];
      setPendingRows(items);
      setSelectedProposalIds((prev) => prev.filter((id) => items.some((r) => r.id === id)));
    } catch (e: any) {
      setPendingMessage(String(e?.message || e || "Failed to load pending proposals"));
    } finally {
      setPendingBusy(false);
    }
  }

  function toggleSelectProposal(id: string, checked: boolean) {
    setSelectedProposalIds((prev) => {
      if (checked) {
        if (prev.includes(id)) return prev;
        return [...prev, id];
      }
      return prev.filter((x) => x !== id);
    });
  }

  function toggleSelectAllVisible(checked: boolean) {
    if (!checked) {
      setSelectedProposalIds((prev) => prev.filter((id) => !pendingVisibleRows.some((r) => r.id === id)));
      return;
    }
    setSelectedProposalIds((prev) => {
      const s = new Set(prev);
      for (const r of pendingVisibleRows) s.add(r.id);
      return Array.from(s);
    });
  }

  async function runBulkDecision(decision: "APPROVE" | "REJECT") {
    if (!selectedProposalIds.length) {
      setPendingMessage("Select at least one pending row.");
      return;
    }
    setPendingBusy(true);
    setPendingMessage("");
    try {
      const res = await apiPost<{ ok: boolean; updated: number; decision: string; draft_rows_applied: number }>(
        `/api/draft/sheet/decide`,
        {
          proposal_ids: selectedProposalIds,
          decision,
          approver_name: approverName,
          pin,
          note: decisionNote,
        }
      );
      setPendingMessage(
        `${res.decision}: updated ${res.updated} rows` +
          (decision === "APPROVE" ? `, draft applied ${res.draft_rows_applied}` : "")
      );
      setSelectedProposalIds([]);
      await loadPendingProposals();
      if (version?.version_id) {
        const rr = await apiGet<{ ok: boolean; version_id: string; rows: DraftRow[] }>(
          `/api/draft/rows${qs({ version_id: version.version_id })}`
        );
        setRows(sortRows(rr.rows || []));
      }
    } catch (e: any) {
      setPendingMessage(String(e?.message || e || "Decision failed"));
    } finally {
      setPendingBusy(false);
    }
  }

  async function runAiAnalysis() {
    if (!generateResult || aiBusy) return;
    setAiBusy(true);
    setAiError("");
    setAiAnalysis(null);
    try {
      const branchResults = generateResult.versions.map((v) => ({
        branch_code: v.branch_code,
        branch_name: v.branch_name,
        summary: v.summary || {},
        reliability_summary: v.reliability_summary || [],
      }));
      const res = await apiPost<{ ok: boolean; analysis: AiAnalysisResult }>(
        `/api/draft/ai_analyze`,
        {
          city,
          target_month: generateResult.target_month,
          approver_name: approverName,
          pin,
          branch_results: branchResults,
          // ① Staff master context — included for AI prompt enrichment
          staff_rules_context: shiftMaster
            ? buildAiContext(shiftMaster, generateResult.target_month)
            : undefined,
        }
      );
      if (res.ok && res.analysis) {
        setAiAnalysis(res.analysis);
        // Pre-select all recommended actions by default
        const actionIds = new Set((res.analysis.recommended_actions || []).map((a) => a.id));
        setSelectedActions(actionIds);
        setTimeout(() => aiRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      }
    } catch (e: any) {
      setAiError(String(e?.message || e || "AI analysis failed"));
    } finally {
      setAiBusy(false);
    }
  }

  async function applyAndRegenerate() {
    if (!aiAnalysis || !prepared || applyingActions) return;
    const actions = (aiAnalysis.recommended_actions || []).filter((a) => selectedActions.has(a.id));
    if (!actions.length) return;
    setApplyingActions(true);
    setApplyActionsError("");
    try {
      for (const action of actions) {
        if (action.type === "staffing_rule") {
          const res = await fetch("/api/admin/staffing-rules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              city,
              condition_type: action.condition_type,
              adjustment: action.adjustment,
              exclude_hours: action.exclude_hours || "",
              label: `[AI] ${action.label}`,
              approver_name: approverName,
              pin,
            }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(`Staffing rule failed: ${j.detail || res.statusText}`);
          }
        } else if (action.type === "forecast_setting") {
          const res = await fetch("/api/admin/forecast-settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              city,
              key: action.setting_key,
              value: action.setting_value,
              approver_name: approverName,
              pin,
            }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(`Settings update failed: ${j.detail || res.statusText}`);
          }
        }
      }
      // Clear AI analysis so the new generation starts fresh
      setAiAnalysis(null);
      setSelectedActions(new Set());
      // Trigger regeneration
      await confirmGenerate();
    } catch (e: any) {
      setApplyActionsError(String(e?.message || e || "Failed to apply actions"));
    } finally {
      setApplyingActions(false);
    }
  }

  // ── Export to Google Sheets (draft mode) ──────────────────────────────────
  async function exportDraftToSheet() {
    if (!canOperate || !activeBranchCode) return;
    setSheetExportLoading(true);
    setSheetExportError("");
    setSheetExportResult(null);
    try {
      const prep = await apiPost<ExportPrepareResult>(`/api/admin/export/month/prepare`, {
        city,
        branch_code: activeBranchCode,
        month: targetMonth,
        mode: "DRAFT",
        approver_name: approverName,
        pin,
      });
      const confirm = await apiPost<ExportConfirmResult>(`/api/admin/export/month/confirm`, {
        confirm_token: prep.confirm_token,
        approver_name: approverName,
        pin,
      });
      setSheetExportResult({ ok: confirm.ok, url: confirm.main_url || confirm.sheet_url });
    } catch (e: any) {
      setSheetExportError(String(e?.message || e || "Export to sheet failed"));
    } finally {
      setSheetExportLoading(false);
    }
  }

  // ── Download .xlsx (browser-side pivot: staff × date) ────────────────────
  async function downloadDraftXlsx() {
    if (!rows.length) return;
    setXlsxExporting(true);
    try {
      const XLSX = await import("xlsx");

      const fmtH = (h: number) => {
        const hr = h >= 24 ? h - 24 : h;
        return `${String(hr).padStart(2, "0")}:00${h >= 24 ? "(+1)" : ""}`;
      };
      const fmtShift = (s: number, e: number) => `${fmtH(s)}-${fmtH(e)}`;

      // All unique dates (sorted) and staff names (alphabetical)
      const dates = Array.from(new Set(rows.map((r) => r.work_date))).sort();
      const staffNames = Array.from(new Set(rows.map((r) => r.staff_name))).sort();

      // Build lookup: staffName → date → shift string
      const lookup: Record<string, Record<string, string>> = {};
      for (const row of rows) {
        if (!lookup[row.staff_name]) lookup[row.staff_name] = {};
        const cell = fmtShift(row.start_hour, row.end_hour);
        const prev = lookup[row.staff_name][row.work_date];
        lookup[row.staff_name][row.work_date] = prev ? `${prev} / ${cell}` : cell;
      }

      // ── Sheet 1: Schedule grid ──────────────────────────────────────────
      const dayLabels = dates.map((d) => {
        const dt = new Date(d + "T00:00:00");
        const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getDay()];
        return `${dt.getDate()}(${wd})`;
      });

      const header = ["Staff Name", "Role", ...dayLabels];
      const dataRows = staffNames.map((name) => {
        const role = rows.find((r) => r.staff_name === name)?.role ?? "";
        const cells = dates.map((d) => lookup[name]?.[d] ?? "");
        return [name, role, ...cells];
      });

      const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
      ws["!cols"] = [
        { wch: 22 },
        { wch: 8 },
        ...dates.map(() => ({ wch: 13 })),
      ];
      // Freeze top row and first two columns
      ws["!freeze"] = { xSplit: 2, ySplit: 1, topLeftCell: "C2", activePane: "bottomRight" };

      // ── Sheet 2: Raw data ───────────────────────────────────────────────
      const rawHeaders = ["Date", "Day", "Staff Name", "Role", "Start", "End", "Shift"];
      const rawRows = [...rows]
        .sort((a, b) => a.work_date.localeCompare(b.work_date) || a.staff_name.localeCompare(b.staff_name))
        .map((r) => {
          const dt = new Date(r.work_date + "T00:00:00");
          const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getDay()];
          return [r.work_date, wd, r.staff_name, r.role, fmtH(r.start_hour), fmtH(r.end_hour), fmtShift(r.start_hour, r.end_hour)];
        });
      const wsRaw = XLSX.utils.aoa_to_sheet([rawHeaders, ...rawRows]);
      wsRaw["!cols"] = [{ wch: 12 }, { wch: 5 }, { wch: 22 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 14 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Schedule");
      XLSX.utils.book_append_sheet(wb, wsRaw, "Raw Data");

      const filename = `draft_${activeBranchCode}_${targetMonth}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (e: any) {
      console.error("xlsx export failed", e);
    } finally {
      setXlsxExporting(false);
    }
  }

  async function proposeFromSheet() {
    if (!canOperate) return;
    if (!approverName.trim() || !pin.trim()) {
      setPendingMessage("Approver and PIN are required.");
      return;
    }
    if (!applyMonth) {
      setPendingMessage("Select month first.");
      return;
    }
    if (!defaultSyncBranch) {
      setPendingMessage("Select branch first.");
      return;
    }
    if (!sheetTabMain.trim()) {
      setPendingMessage("MAIN tab name is required.");
      return;
    }
    setPendingBusy(true);
    setPendingMessage("");
    try {
      const res = await apiPost<{ ok: boolean; inserted: number; warnings?: string[] }>(`/api/draft/sheet/propose_sync`, {
        city,
        branch_code: defaultSyncBranch,
        month_key: applyMonth,
        spreadsheet_id: sheetSpreadsheetId.trim(),
        tab_main: sheetTabMain.trim(),
        a1_range: sheetRange.trim() || "A1:CL2000",
        draft_version_id: version?.version_id || "",
        approver_name: approverName,
        pin,
      });
      const w = (res.warnings || []).join(" / ");
      setPendingMessage(`Proposed ${res.inserted} rows.${w ? ` Warnings: ${w}` : ""}`);
      await loadPendingProposals();
    } catch (e: any) {
      setPendingMessage(String(e?.message || e || "Sync propose failed"));
    } finally {
      setPendingBusy(false);
    }
  }

  async function loadSheetTabs() {
    if (!canOperate) return;
    if (!approverName.trim() || !pin.trim()) return;
    setSheetTabsBusy(true);
    try {
      const resp = await apiGet<{ ok: boolean; tabs: string[] }>(
        `/admin/sheet_tabs${qs({ city })}`
      );
      const all = Array.isArray(resp?.tabs) ? resp.tabs : [];
      const mains = all.filter((t) => /_MAIN$/i.test(t));
      setSheetTabs(mains.length ? mains : all);
      if (!sheetTabMain) {
        const candidate = mains.find((t) => t.includes(applyMonth)) || mains[0];
        if (candidate) setSheetTabMain(candidate);
      }
    } catch {
      setSheetTabs([]);
    } finally {
      setSheetTabsBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="max-w-5xl mx-auto px-4 py-8 space-y-6"
    >
      <div className="mb-2 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/20 to-purple-500/10">
          <CalendarCog className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h1 className={T_PAGE_TITLE}>Draft Generator / Edit / Apply</h1>
          <p className={T_CAPTION}>Generate next month draft for all stores in the selected city, edit by branch, then publish week by week.</p>
        </div>
      </div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className={BADGE_INFO}>
          <ShieldCheck className="h-3 w-3" />
          Verified role: {myRole || "HQ"}
        </span>
      </div>

      {/* Top-level tab bar */}
      <div className={TAB_CONTAINER}>
        <button
          type="button"
          onClick={() => setDraftTab("schedule")}
          className={draftTab === "schedule" ? TAB_ACTIVE : TAB_INACTIVE}
        >
          Schedule View
        </button>
        <button
          type="button"
          onClick={() => setDraftTab("manage")}
          className={draftTab === "manage" ? TAB_ACTIVE : TAB_INACTIVE}
        >
          Draft Management
        </button>
      </div>

      {/* ── Schedule View tab ── */}
      {draftTab === "schedule" && (
        <div className="mt-4">
          {!versions.length ? (
            <div className={`${GLASS_CARD} p-8 text-center`}>
              <div className="text-sm text-neutral-400 mb-2">No shift data yet</div>
              <div className={T_CAPTION}>Generate a draft in the Draft Management tab to display shifts here.</div>
            </div>
          ) : (
            <>
              <div className={`${TAB_CONTAINER} mb-4`}>
                {versions.map((item) => (
                  <button
                    key={item.branch_code}
                    type="button"
                    onClick={() => setActiveBranchCode(item.branch_code)}
                    className={activeBranchCode === item.branch_code ? TAB_ACTIVE : TAB_INACTIVE}
                  >
                    {item.branch_name}
                  </button>
                ))}
              </div>
              {/* Export toolbar */}
              {rows.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-white/3 px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mr-1">Export:</span>

                  {/* Google Sheets export */}
                  <button
                    type="button"
                    onClick={exportDraftToSheet}
                    disabled={sheetExportLoading || !canOperate}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {sheetExportLoading ? "Exporting…" : "Export to Sheet"}
                  </button>

                  {/* Local xlsx download */}
                  <button
                    type="button"
                    onClick={downloadDraftXlsx}
                    disabled={xlsxExporting}
                    className="flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/20 disabled:opacity-40 transition-colors"
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5" />
                    {xlsxExporting ? "Preparing…" : "Download .xlsx"}
                  </button>

                  {/* Sheet export result link */}
                  {sheetExportResult?.ok && sheetExportResult.url && (
                    <a
                      href={sheetExportResult.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-2.5 py-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Sheet updated — Open
                    </a>
                  )}
                  {sheetExportResult?.ok && !sheetExportResult.url && (
                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Sheet updated
                    </span>
                  )}
                  {sheetExportError && (
                    <span className="text-xs text-rose-400">{sheetExportError}</span>
                  )}

                  {!canOperate && (
                    <span className="text-[11px] text-zinc-600">HQ/Admin only for sheet export</span>
                  )}
                </div>
              )}

              <ShiftScheduleView
                rows={rows}
                month={targetMonth}
                versionId={version?.version_id || ""}
                loading={loading}
                onUpdateRow={handleUpdateRow}
                onDeleteRow={handleDeleteRow}
                onAddRow={handleAddRow}
                masterData={shiftMaster ?? undefined}
                branchCode={activeBranchCode || undefined}
              />
            </>
          )}
        </div>
      )}

      {/* ── ドラフト管理 tab ── */}
      {draftTab === "manage" && (
        <>

      <div className={`${GLASS_CARD} p-6`}>
        <div className="mb-5 flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-violet-400" />
          <h2 className={T_SECTION}>Generate Draft</h2>
        </div>

        {!canOperate ? (
          <div className={`${BADGE_WARNING} mb-4 px-4 py-2 text-sm`}>
            HQ / ADMIN only. Enter a valid approver name and PIN to verify your role.
          </div>
        ) : null}

        <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <label className={`${T_LABEL} block mb-1.5`}>City</label>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value === "manila" ? "manila" : "dubai")}
              className={SELECT_CLASS}
            >
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} block mb-1.5`}>Scope</label>
            <input
              className={INPUT_CLASS}
              readOnly
              value={`All ${city === "dubai" ? "Dubai" : "Manila"} stores`}
            />
          </div>
          <div>
            <label className={`${T_LABEL} block mb-1.5`}>Target Month</label>
            <input type="month" className={INPUT_CLASS} readOnly value={targetMonth} />
          </div>
          <div>
            <label className={`${T_LABEL} block mb-1.5`}>Approver</label>
            <input
              className={INPUT_CLASS}
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div>
            <label className={`${T_LABEL} block mb-1.5`}>PIN</label>
            <input
              type="password"
              className={INPUT_CLASS}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
            />
          </div>
        </div>

        <div className={`mb-5 ${HIGHLIGHT_CARD} p-4 shadow-lg shadow-violet-500/15 ring-1 ring-violet-400/30`}>
          <div className={`${T_LABEL} mb-2 text-violet-300`}>Draft spreadsheet (Google Sheets)</div>
          <a
            href={city === "dubai" ? DUBAI_DRAFT_SHEET_URL : MANILA_DRAFT_SHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${PRIMARY_BUTTON} inline-flex items-center gap-2.5 text-sm no-underline shadow-xl shadow-violet-500/40 ring-2 ring-violet-300/50 hover:ring-violet-200/60`}
          >
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
            {city === "dubai" ? "Open Dubai draft spreadsheet" : "Open Manila draft spreadsheet"}
          </a>
        </div>

        <div className="mb-5 rounded-xl border border-sky-500/15 bg-sky-500/5 px-4 py-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-sky-400 flex-shrink-0 mt-0.5" />
            <p className={T_BODY}>
              Forecast-based generation uses previous-month Bayzat shifts as the team pattern and hourly sales history as the demand
              signal. Branch members stay fixed, usual day-off patterns are preserved when possible, and shortages are handled with
              limited overtime first.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={prepareDraft}
            disabled={!canOperate || loading}
            className={`${PRIMARY_BUTTON} flex items-center gap-2 disabled:opacity-60`}
          >
            <Zap className="h-4 w-4" />
            Prepare Generate
          </button>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-amber-500 h-4 w-4 rounded"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
              disabled={!prepared}
            />
            <span className="text-sm text-zinc-300">I confirm generating a new monthly draft.</span>
          </label>
          <button
            type="button"
            onClick={confirmGenerate}
            disabled={!canOperate || loading || !prepared || !confirmChecked}
            className={`${SECONDARY_BUTTON} flex items-center gap-2 disabled:opacity-60`}
          >
            <CheckCircle2 className="h-4 w-4" />
            {loading ? "Working..." : "Confirm Generate"}
          </button>
        </div>

        {prepared ? (
          <p className={`${T_CAPTION} mt-3`}>
            Prepared: All {city === "dubai" ? "Dubai" : "Manila"} stores • {prepared.target_month}
          </p>
        ) : null}

        {error ? <div className={`${BADGE_ERROR} mt-3 whitespace-pre-wrap px-4 py-2 text-sm`}>{error}</div> : null}
      </div>

      {/* Config Panels */}
      <div className="space-y-3">
        <ForecastSettingsPanel city={city} approverName={approverName} pin={pin} />
        <OperatingHoursPanel city={city} approverName={approverName} pin={pin} targetMonth={targetMonth} />
        <StaffingRulesPanel city={city} approverName={approverName} pin={pin} />
        <DemandEventsPanel city={city} approverName={approverName} pin={pin} targetMonth={targetMonth} />
      </div>

      {generateResult ? (
        <div className={`${GLASS_CARD} p-6`}>
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <h2 className={T_SECTION}>Generate Result</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <div>
              <p className={T_LABEL}>Target Month</p>
              <p className="mt-1 text-sm text-zinc-200">{generateResult.target_month}</p>
            </div>
            <div>
              <p className={T_LABEL}>Branches Generated</p>
              <p className="mt-1 text-sm text-zinc-200">{fmtNum(generateResult.branches_generated)}</p>
            </div>
            <div>
              <p className={T_LABEL}>Rows Inserted</p>
              <p className="mt-1 text-sm text-zinc-200">{fmtNum(generateResult.total_rows_inserted)}</p>
            </div>
            <div>
              <p className={T_LABEL}>Overtime Hours</p>
              <p className={`mt-1 text-sm ${generateResult.total_overtime_hours > 0 ? "text-amber-400 font-semibold" : "text-zinc-200"}`}>{fmtNum(generateResult.total_overtime_hours)}</p>
            </div>
            <div>
              <p className={T_LABEL}>Unresolved Hours</p>
              <p className={`mt-1 text-sm ${generateResult.total_unresolved_hours > 0 ? "text-red-400 font-semibold" : "text-zinc-200"}`}>{fmtNum(generateResult.total_unresolved_hours)}</p>
            </div>
          </div>
          {generateResult.failed_branches.length ? (
            <div className={`${BADGE_WARNING} mt-4 px-4 py-2 text-sm`}>
              failed_branches: {generateResult.failed_branches.map((item) => item.branch_code).join(", ")}
            </div>
          ) : null}
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {generateResult.versions.map((item) => {
              const coverage = typeof item.summary?.demand_coverage_ratio === "number" ? item.summary.demand_coverage_ratio : null;
              const avgRel = typeof item.summary?.avg_branch_reliability === "number" ? item.summary.avg_branch_reliability : null;
              const ot = item.summary?.total_overtime_hours ?? 0;
              const unres = item.summary?.total_unresolved_hours ?? 0;
              const relRows = item.reliability_summary || [];
              const atRisk = relRows.filter((r) => r.reliability_score < 0.82);
              const isOpen = openReliabilityBranch === item.branch_code;
              const coverageColor = coverage === null ? "text-zinc-400" : coverage >= 0.9 ? "text-emerald-400" : coverage >= 0.75 ? "text-amber-400" : "text-red-400";
              const relColor = avgRel === null ? "text-zinc-400" : avgRel >= 0.9 ? "text-emerald-400" : avgRel >= 0.82 ? "text-amber-400" : "text-red-400";
              return (
                <div key={item.branch_code} className={`${GLASS_CARD} p-4`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-neutral-100">{item.branch_name}</div>
                    <div className="flex gap-2 flex-wrap justify-end">
                      {coverage !== null && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${coverage >= 0.9 ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : coverage >= 0.75 ? "bg-amber-500/15 border-amber-500/30 text-amber-400" : "bg-red-500/15 border-red-500/30 text-red-400"}`}>
                          Coverage {(coverage * 100).toFixed(0)}%
                        </span>
                      )}
                      {avgRel !== null && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${avgRel >= 0.9 ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : avgRel >= 0.82 ? "bg-amber-500/15 border-amber-500/30 text-amber-400" : "bg-red-500/15 border-red-500/30 text-red-400"}`}>
                          Reliability {(avgRel * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                  {coverage !== null && (
                    <div className="mb-3">
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${coverage >= 0.9 ? "bg-emerald-500" : coverage >= 0.75 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, coverage * 100)}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="space-y-1 text-xs text-neutral-400">
                    <div>rows: <span className="text-neutral-200">{fmtNum(item.rows_inserted)}</span> &nbsp;·&nbsp; days: <span className="text-neutral-200">{fmtNum(item.days_generated)}</span></div>
                    {ot > 0 && <div className="text-amber-400">⚠ Overtime: {fmtNum(ot)}h</div>}
                    {unres > 0 && <div className="text-red-400">⚠ Unresolved: {fmtNum(unres)}h</div>}
                    {item.summary?.reliability_buffer_hours != null && item.summary.reliability_buffer_hours > 0 && (
                      <div className="text-sky-400">↑ Reliability buffer: +{item.summary.reliability_buffer_hours}h</div>
                    )}
                    {((item.summary?.fulltime_enforcement_days_added ?? 0) > 0 || (item.summary?.fulltime_enforcement_days_removed ?? 0) > 0) && (
                      <div className="text-violet-400 flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        6-day rule:
                        {(item.summary?.fulltime_enforcement_days_added ?? 0) > 0 && (
                          <span className="text-emerald-400 ml-1">+{item.summary!.fulltime_enforcement_days_added} added</span>
                        )}
                        {(item.summary?.fulltime_enforcement_days_removed ?? 0) > 0 && (
                          <span className="text-amber-400 ml-1">−{item.summary!.fulltime_enforcement_days_removed} removed</span>
                        )}
                      </div>
                    )}
                    {(item.summary?.ramadan_shifts_adjusted ?? 0) > 0 && (
                      <div className="text-orange-400 flex items-center gap-1">
                        🌙 Ramadan 6h cap: {item.summary!.ramadan_shifts_adjusted} shifts adjusted
                      </div>
                    )}
                    {((item.summary?.opening_crew_shifts_added ?? 0) > 0 || (item.summary?.opening_crew_target ?? 0) > 0) && (
                      <div className="text-teal-400 flex items-center gap-1">
                        🍱 Opening crew: {item.summary?.opening_crew_shifts_added ?? 0} opener shifts added (target {item.summary?.opening_crew_target ?? 1}/day)
                      </div>
                    )}
                  </div>
                  {relRows.length > 0 && (
                    <div className="mt-3 border-t border-white/8 pt-3">
                      <button
                        type="button"
                        onClick={() => setOpenReliabilityBranch(isOpen ? null : item.branch_code)}
                        className="flex w-full items-center justify-between text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3 w-3 text-amber-400" />
                          Staff Reliability Flags
                          {atRisk.length > 0 && <span className="ml-1 rounded-full bg-red-500/20 px-1.5 py-0.5 text-red-400 text-[10px]">{atRisk.length} at risk</span>}
                        </span>
                        {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      {isOpen && (
                        <div className="mt-2 space-y-1.5">
                          {relRows.map((r) => {
                            const sc = r.reliability_score;
                            const scColor = sc >= 0.9 ? "text-emerald-400" : sc >= 0.82 ? "text-amber-400" : "text-red-400";
                            const label = sc >= 0.9 ? "Good" : sc >= 0.82 ? "Caution" : "At Risk";
                            return (
                              <div key={r.staff_name} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                                <div>
                                  <div className="text-xs font-medium text-zinc-200">{r.staff_name}</div>
                                  <div className="text-[10px] text-zinc-500 mt-0.5">{r.absence_days}d absent · {r.late_days}d late · {r.shift_days}s shifts</div>
                                </div>
                                <div className="text-right">
                                  <div className={`text-xs font-bold ${scColor}`}>{(sc * 100).toFixed(0)}%</div>
                                  <div className={`text-[10px] ${scColor}`}>{label}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ① Staff Master Panel */}
          <div className="mt-5">
            <ShiftMasterPanel
              masterData={shiftMaster}
              targetMonth={generateResult.target_month}
              onLoaded={(data) => {
                setShiftMaster(data);
              }}
              onCleared={() => {
                setShiftMaster(null);
                setViolations([]);
              }}
            />
          </div>

          {/* ② Violation Panel */}
          {violations.length > 0 && (
            <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <span className={T_SECTION}>Rule Violations Detected ({violations.length})</span>
              </div>
              <div className="space-y-2">
                {violations.map((v, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${
                      v.severity === "CRITICAL"
                        ? "border-red-500/20 bg-red-950/20"
                        : v.severity === "HIGH"
                          ? "border-amber-500/20 bg-amber-950/10"
                          : "border-zinc-500/20 bg-zinc-950/10"
                    }`}
                  >
                    <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      v.severity === "CRITICAL"
                        ? "bg-red-500/20 text-red-400"
                        : v.severity === "HIGH"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-zinc-500/20 text-zinc-400"
                    }`}>
                      {v.ruleId}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-zinc-300">{v.message}</span>
                      <span className="ml-2 text-[10px] text-zinc-600">{v.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Analysis Button */}
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={runAiAnalysis}
              disabled={aiBusy}
              className={`${PRIMARY_BUTTON} flex items-center gap-2 text-sm disabled:opacity-60`}
            >
              {aiBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {aiBusy ? "Analyzing…" : "AI Schedule Analysis"}
            </button>
            {shiftMaster && (
              <span className="text-[10px] text-emerald-500 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Staff rules context will be included in AI analysis
              </span>
            )}
            {aiError && <span className="text-xs text-red-400">{aiError}</span>}
          </div>

          {/* AI Analysis Result */}
          {aiAnalysis && (
            <div ref={aiRef} className="mt-4 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Bot className="h-4 w-4 text-violet-400" />
                <span className={T_SECTION}>AI Schedule Analysis</span>
                <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded-full ${
                  aiAnalysis.overall_rating === "GOOD" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" :
                  aiAnalysis.overall_rating === "FAIR" ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" :
                  "bg-red-500/15 text-red-400 border border-red-500/30"
                }`}>
                  {aiAnalysis.overall_rating === "GOOD" ? "🟢" : aiAnalysis.overall_rating === "FAIR" ? "🟡" : "🔴"} {aiAnalysis.overall_rating}
                </span>
              </div>
              <p className="text-sm text-zinc-300 mb-4">{aiAnalysis.overall_comment}</p>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {aiAnalysis.key_risks.length > 0 && (
                  <div>
                    <p className={`${T_LABEL} mb-2`}>⚠ Key Risks</p>
                    <ul className="space-y-1.5">
                      {aiAnalysis.key_risks.map((r, i) => (
                        <li key={i} className="text-xs text-zinc-400 flex gap-2"><span className="text-red-400 mt-0.5">•</span>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {aiAnalysis.recommendations.length > 0 && (
                  <div>
                    <p className={`${T_LABEL} mb-2`}>✓ Recommendations</p>
                    <ul className="space-y-1.5">
                      {aiAnalysis.recommendations.map((r, i) => (
                        <li key={i} className="text-xs text-zinc-400 flex gap-2"><span className="text-emerald-400 mt-0.5">•</span>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {Object.keys(aiAnalysis.branch_notes).length > 0 && (
                <div className="mt-4 border-t border-white/8 pt-4">
                  <p className={`${T_LABEL} mb-2`}>Branch Notes</p>
                  <div className="space-y-1.5">
                    {Object.entries(aiAnalysis.branch_notes).map(([branch, note]) => (
                      <div key={branch} className="text-xs text-zinc-400"><span className="text-zinc-200 font-medium">{branch}:</span> {note}</div>
                    ))}
                  </div>
                </div>
              )}
              {/* ── Recommended Actions ── */}
              {(aiAnalysis.recommended_actions || []).length > 0 && (
                <div className="mt-5 border-t border-violet-400/20 pt-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="h-4 w-4 text-amber-400" />
                    <span className={T_SECTION}>Recommended Actions</span>
                    <span className="text-xs text-zinc-500 ml-1">— select and apply to regenerate with these settings</span>
                  </div>
                  <div className="space-y-2">
                    {(aiAnalysis.recommended_actions || []).map((action) => {
                      const checked = selectedActions.has(action.id);
                      const isRule = action.type === "staffing_rule";
                      const isSetting = action.type === "forecast_setting";
                      const typeLabel = isRule
                        ? `+${(action as any).adjustment > 0 ? "+" : ""}${(action as any).adjustment} staff · ${(action as any).condition_type}`
                        : `${(action as any).setting_key} → ${(action as any).setting_value}`;
                      const typeColor = isRule ? "text-sky-400 bg-sky-500/10 border-sky-500/20" : "text-amber-400 bg-amber-500/10 border-amber-500/20";
                      return (
                        <label
                          key={action.id}
                          className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${checked ? "border-violet-500/40 bg-violet-500/10" : "border-white/8 bg-white/3 hover:bg-white/5"}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelectedActions((prev) => {
                                const next = new Set(prev);
                                if (next.has(action.id)) next.delete(action.id);
                                else next.add(action.id);
                                return next;
                              })
                            }
                            className="mt-0.5 h-4 w-4 rounded accent-violet-500 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-zinc-100">{action.label}</span>
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${typeColor}`}>{typeLabel}</span>
                            </div>
                            <p className="text-xs text-zinc-400 mt-0.5">{action.rationale}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex items-center gap-3 flex-wrap">
                    <button
                      type="button"
                      disabled={selectedActions.size === 0 || applyingActions}
                      onClick={applyAndRegenerate}
                      className={`${PRIMARY_BUTTON} flex items-center gap-2 text-sm disabled:opacity-50`}
                    >
                      {applyingActions
                        ? <><RefreshCw className="h-4 w-4 animate-spin" /> Applying & Regenerating…</>
                        : <><Wand2 className="h-4 w-4" /> Apply Selected & Regenerate</>
                      }
                    </button>
                    <span className="text-xs text-zinc-500">
                      {selectedActions.size} of {(aiAnalysis.recommended_actions || []).length} selected
                    </span>
                    {applyActionsError && <span className="text-xs text-red-400">{applyActionsError}</span>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {canOperate ? (
        <div className={`${GLASS_CARD} p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-sky-400" />
              <h2 className={T_SECTION}>Pending Sheet Proposals</h2>
            </div>
            <div className="flex items-center gap-2">
              <p className={T_CAPTION}>Manager edits from spreadsheet are queued here until HQ/Admin bulk decision.</p>
              <button
                type="button"
                onClick={loadPendingProposals}
                disabled={pendingBusy}
                className={`${SECONDARY_BUTTON} flex items-center gap-2 text-sm disabled:opacity-60`}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh Pending
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>Month</label>
              <input type="month" className={INPUT_CLASS} value={applyMonth} onChange={(e) => setApplyMonth(e.target.value)} />
            </div>
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>Branch Filter</label>
              <select className={SELECT_CLASS} value={pendingBranch} onChange={(e) => setPendingBranch(e.target.value)}>
                <option value="ALL">All branches</option>
                {versions.map((v) => (
                  <option key={v.branch_code} value={v.branch_code}>
                    {v.branch_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>Decision Note (optional)</label>
              <input
                className={INPUT_CLASS}
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="Reason for approve/reject"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-2">
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>Spreadsheet ID (optional)</label>
              <input
                className={INPUT_CLASS}
                value={sheetSpreadsheetId}
                onChange={(e) => setSheetSpreadsheetId(e.target.value)}
                placeholder="blank = use city export sheet env"
              />
            </div>
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>MAIN Tab Name</label>
              <select className={SELECT_CLASS} value={sheetTabMain} onChange={(e) => setSheetTabMain(e.target.value)}>
                <option value="">Select MAIN tab</option>
                {sheetTabs.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {!sheetTabs.length ? (
                <input
                  className={`${INPUT_CLASS} mt-2`}
                  value={sheetTabMain}
                  onChange={(e) => setSheetTabMain(e.target.value)}
                  placeholder="fallback: type MAIN tab manually"
                />
              ) : null}
            </div>
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>A1 Range</label>
              <div className="flex gap-2">
                <input
                  className={INPUT_CLASS}
                  value={sheetRange}
                  onChange={(e) => setSheetRange(e.target.value)}
                  placeholder="A1:CL2000"
                />
                <button
                  type="button"
                  onClick={loadSheetTabs}
                  disabled={sheetTabsBusy}
                  className={`${SMALL_BUTTON} whitespace-nowrap disabled:opacity-60`}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
          <p className={`${T_CAPTION} mb-4`}>sync branch: {defaultSyncBranch || "-"}</p>

          <div className="flex justify-end mb-4">
            <button
              type="button"
              onClick={proposeFromSheet}
              disabled={pendingBusy || !defaultSyncBranch}
              className={`${PRIMARY_BUTTON} flex items-center gap-2 text-sm disabled:opacity-60`}
            >
              <ArrowDownToLine className="h-4 w-4" />
              Sync Proposals From Sheet
            </button>
          </div>

          <hr className="border-white/5 mb-4" />

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <button
              type="button"
              onClick={() => runBulkDecision("APPROVE")}
              disabled={pendingBusy || selectedProposalIds.length === 0}
              className={`${PRIMARY_BUTTON} flex items-center gap-2 text-sm bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 from-transparent to-transparent shadow-none disabled:opacity-60`}
            >
              <CheckCircle2 className="h-4 w-4" />
              Approve Selected
            </button>
            <button
              type="button"
              onClick={() => runBulkDecision("REJECT")}
              disabled={pendingBusy || selectedProposalIds.length === 0}
              className={`${DANGER_BUTTON} flex items-center gap-2 text-sm disabled:opacity-60`}
            >
              <XCircle className="h-4 w-4" />
              Reject Selected
            </button>
            <span className={T_CAPTION}>
              selected: {fmtNum(selectedProposalIds.length)} / {fmtNum(pendingVisibleRows.length)}
            </span>
          </div>

          {pendingMessage ? <div className={`${BADGE_WARNING} mb-4 px-4 py-2 text-sm`}>{pendingMessage}</div> : null}

          <div className="rounded-xl border border-white/8 overflow-hidden">
            <table className="w-full">
              <thead className="bg-white/3">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      className="accent-amber-500 h-4 w-4"
                      checked={pendingVisibleRows.length > 0 && pendingVisibleRows.every((r) => selectedProposalIds.includes(r.id))}
                      onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                    />
                  </th>
                  {["Date", "Branch", "Before", "After", "Swap", "Note", "By"].map((col) => (
                    <th key={col} className={`${TABLE_HEADER} px-4 py-3 text-left`}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!pendingVisibleRows.length ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <InboxIcon className="h-8 w-8 text-zinc-700" />
                        <p className={T_CAPTION}>{pendingBusy ? "Loading..." : "No pending proposals."}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pendingVisibleRows.map((r, index) => (
                    <motion.tr
                      key={r.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: index * 0.03 }}
                      className={TABLE_ROW}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="accent-amber-500 h-4 w-4"
                          checked={selectedProposalIds.includes(r.id)}
                          onChange={(e) => toggleSelectProposal(r.id, e.target.checked)}
                        />
                      </td>
                      <td className={`${TABLE_CELL} px-4`}>{r.work_date}</td>
                      <td className={`${TABLE_CELL} px-4`}>
                        <span className={BADGE_INFO}>{labelOf(city, r.branch_code as BranchCode) || r.branch_code}</span>
                      </td>
                      <td className={`${TABLE_CELL} px-4 text-zinc-500 line-through text-xs`}>
                        {r.staff_name} {rangeText(Number(r.start_hour || 0), Number(r.end_hour || 0))}
                      </td>
                      <td
                        className={`${TABLE_CELL} px-4 text-xs font-medium ${
                          r.staff_name !== (r.proposed_staff_name || r.staff_name) ||
                          Number(r.start_hour || 0) !== Number(r.proposed_start_hour ?? r.start_hour ?? 0) ||
                          Number(r.end_hour || 0) !== Number(r.proposed_end_hour ?? r.end_hour ?? 0)
                            ? "text-emerald-400"
                            : "text-zinc-300"
                        }`}
                      >
                        {(r.proposed_staff_name || r.staff_name) + " "}
                        {rangeText(Number(r.proposed_start_hour ?? r.start_hour ?? 0), Number(r.proposed_end_hour ?? r.end_hour ?? 0))}
                      </td>
                      <td className={`${TABLE_CELL} px-4`}>
                        {r.swap_with_staff ? <span className={BADGE_WARNING}>{r.swap_with_staff}</span> : <span className="text-zinc-600">-</span>}
                      </td>
                      <td className={`${TABLE_CELL} px-4 text-zinc-500 text-xs`}>{r.note || "-"}</td>
                      <td className={`${TABLE_CELL} px-4 text-zinc-500 text-xs`}>
                        <div>{r.proposed_by || "-"}</div>
                        <div className="text-[10px] text-zinc-600">
                          {(r.source_tab || "-")}#{r.source_row_number || 0}
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {versions.length ? (
        <div className={`${GLASS_CARD} p-6`}>
          <div className="mb-4 flex items-center gap-2">
            <Send className="h-4 w-4 text-emerald-400" />
            <h2 className={T_SECTION}>Apply Draft To Published</h2>
          </div>
          <p className={T_CAPTION}>
            Select a month to publish. All weeks included in that month are applied for all generated branches in the selected city.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Month to Publish</label>
              <input type="month" className={INPUT_CLASS} value={applyMonth} onChange={(e) => setApplyMonth(e.target.value)} />
              {monthRangeLabel(applyMonth) ? <div className={`${T_CAPTION} mt-2`}>Export range: {monthRangeLabel(applyMonth)}</div> : null}
              {applyWeekStarts.length ? <div className={`${T_CAPTION} mt-2`}>Weeks included: {applyWeekStarts.join(", ")}</div> : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={prepareApply}
              disabled={loading || !canOperate || !approverName.trim() || !pin.trim() || !applyMonth || !applyWeekStarts.length}
              className={`${PRIMARY_BUTTON} disabled:opacity-60`}
            >
              Prepare Apply
            </button>
            <button
              type="button"
              onClick={confirmApply}
              disabled={loading}
              className={`${SECONDARY_BUTTON} disabled:opacity-60`}
            >
              Confirm Apply
            </button>
          </div>

          {applyPrepared?.ok ? (
            <div className={`${GLASS_CARD} mt-4 p-4`}>
              <div className="space-y-1 text-xs text-neutral-400">
                <div>jobs_ready: <span className="text-neutral-200">{fmtNum(applyPrepared.items.length)}</span></div>
                <div>preview: {fmtNum(applyPrepared.total_rows_count)} rows / {fmtNum(applyPrepared.total_staff_count)} staff</div>
              </div>
            </div>
          ) : null}

          {applyResult?.ok ? (
            <div className={`${GLASS_CARD} mt-4 p-4`}>
              <div className="text-sm font-semibold">Apply result</div>
              <div className="mt-2 space-y-1 text-xs text-neutral-400">
                <div>jobs_applied: <span className="text-neutral-200">{fmtNum(applyResult.items.length)}</span></div>
                <div>rows_copied: <span className="text-neutral-200">{fmtNum(applyResult.total_rows_copied)}</span></div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {applyResult.items.map((item) => (
                  <div key={`${item.branch_code}-${item.week_start}`} className={`${GLASS_CARD} p-4`}>
                    <div className="text-sm font-semibold text-neutral-100">{item.branch_name}</div>
                    <div className="mt-2 space-y-1 text-xs text-neutral-400">
                      <div>week_start: <span className="text-neutral-200">{item.week_start}</span></div>
                      <div>published_version_id: <span className="text-neutral-200">{item.published_version_id || "-"}</span></div>
                      <div>rows_copied: <span className="text-neutral-200">{String(item.rows_copied ?? "-")}</span></div>
                      {item.warning ? <div className={BADGE_WARNING}>{item.warning}</div> : null}
                      {item.export?.main_url ? (
                        <div>
                          Main: <a className="underline hover:text-white" href={item.export.main_url} target="_blank" rel="noreferrer">open</a>
                        </div>
                      ) : null}
                      {item.export?.headcount_url ? (
                        <div>
                          Headcount: <a className="underline hover:text-white" href={item.export.headcount_url} target="_blank" rel="noreferrer">open</a>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {versions.length ? (
        <div className={`${GLASS_CARD} p-6`}>
          <div className="mb-4 flex items-center gap-2">
            <PencilLine className="h-4 w-4 text-sky-400" />
            <h2 className={T_SECTION}>Branch Edit</h2>
          </div>
          <div className={T_CAPTION}>
            branch: <span className="text-neutral-200">{version?.branch_name || "-"}</span> • version_id:{" "}
            <span className="text-neutral-200">{version?.version_id || "-"}</span> • rows:{" "}
            <span className="text-neutral-200">{fmtNum(rows.length)}</span> • staff:{" "}
            <span className="text-neutral-200">{fmtNum(uniqueStaffCount(rows))}</span>
          </div>

          <div className={`${TAB_CONTAINER} mt-4`}>
            {versions.map((item) => (
              <button
                key={item.branch_code}
                type="button"
                onClick={() => setActiveBranchCode(item.branch_code)}
                className={activeBranchCode === item.branch_code ? TAB_ACTIVE : TAB_INACTIVE}
              >
                {item.branch_name}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
            <div>
              <div className={`${T_LABEL} mb-1.5`}>Date</div>
              <input
                className={INPUT_CLASS}
                value={newWorkDate}
                onChange={(e) => setNewWorkDate(e.target.value)}
                placeholder="YYYY-MM-DD"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {targetMonthDates.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setNewWorkDate(d)}
                    className={newWorkDate === d ? TAB_ACTIVE : TAB_INACTIVE}
                  >
                    {d.slice(5)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className={`${T_LABEL} mb-1.5`}>Staff</div>
              <input className={INPUT_CLASS} value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)} placeholder="Staff name" />
            </div>

            <div>
              <div className={`${T_LABEL} mb-1.5`}>Role</div>
              <input className={INPUT_CLASS} value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="Role" />
            </div>

            <div>
              <div className={`${T_LABEL} mb-1.5`}>Start</div>
              <input type="number" className={INPUT_CLASS} value={newStartHour} onChange={(e) => setNewStartHour(e.target.value)} />
            </div>

            <div>
              <div className={`${T_LABEL} mb-1.5`}>End</div>
              <input type="number" className={INPUT_CLASS} value={newEndHour} onChange={(e) => setNewEndHour(e.target.value)} />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveRow}
              disabled={loading || !version?.version_id || !norm(newWorkDate) || !norm(newStaffName)}
              className={`${PRIMARY_BUTTON} disabled:opacity-60`}
            >
              {editingRow ? "Save Update" : "Add Row"}
            </button>

            {editingRow ? (
              <button type="button" onClick={cancelEdit} disabled={loading} className={`${SECONDARY_BUTTON} disabled:opacity-60`}>
                Cancel Edit
              </button>
            ) : null}
          </div>

          <div className="mt-5 space-y-4">
            {!grouped.length ? <div className="text-sm text-neutral-500">No draft rows.</div> : null}

            {grouped.map(([day, dayRows]) => (
              <div key={day} className={`${GLASS_CARD} p-4`}>
                <div className="mb-3 text-sm font-semibold">{day}</div>

                <div className="space-y-2">
                  {dayRows.map((r, idx) => {
                    const isEditing = editingRow?.id === r.id;

                    return (
                      <div key={`${r.id}-${idx}`} className={`${GLASS_CARD} p-3`}>
                        {!isEditing ? (
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="space-y-1">
                              <div className="text-sm font-medium">{r.staff_name}</div>
                              <div className="text-xs text-neutral-400">
                                {r.role || "-"} • {rangeText(r.start_hour, r.end_hour)}
                                {r.source ? ` • ${r.source}` : ""}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => startEditRow(r)} disabled={loading} className={`${SMALL_BUTTON} disabled:opacity-60`}>
                                Edit
                              </button>

                              <button type="button" onClick={() => deleteRow(r)} disabled={loading} className={`${DANGER_BUTTON} px-3 py-1 text-xs disabled:opacity-60`}>
                                Delete
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="text-sm font-semibold text-amber-200">Editing</div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                              <input className={INPUT_CLASS} value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)} placeholder="Staff name" />
                              <input className={INPUT_CLASS} value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="Role" />
                              <input type="number" className={INPUT_CLASS} value={newStartHour} onChange={(e) => setNewStartHour(e.target.value)} />
                              <input type="number" className={INPUT_CLASS} value={newEndHour} onChange={(e) => setNewEndHour(e.target.value)} />
                              <div className="flex gap-2">
                                <button type="button" onClick={saveRow} disabled={loading} className={`${PRIMARY_BUTTON} px-3 py-2 text-xs disabled:opacity-60`}>
                                  Save
                                </button>
                                <button type="button" onClick={cancelEdit} disabled={loading} className={`${SECONDARY_BUTTON} px-3 py-2 text-xs disabled:opacity-60`}>
                                  Cancel
                                </button>
                              </div>
                            </div>

                            <div className="text-xs text-neutral-500">{newWorkDate} • editing row</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {published ? (
        <div className={`${GLASS_CARD} p-6`}>
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <h2 className={T_SECTION}>Published Week</h2>
            <span className={BADGE_SUCCESS}>published</span>
          </div>
          <div className={T_CAPTION}>
            week_start: <span className="text-neutral-200">{published.week_start}</span> • count:{" "}
            <span className="text-neutral-200">{fmtNum(published.count)}</span>
          </div>

          <div className="mt-4 space-y-4">
            {published.rows.length === 0 ? <div className="text-sm text-neutral-500">No published rows yet.</div> : null}

            {Object.entries(
              published.rows.reduce<Record<string, typeof published.rows>>((acc, r) => {
                if (!acc[r.work_date]) acc[r.work_date] = [];
                acc[r.work_date].push(r);
                return acc;
              }, {})
            )
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([day, dayRows]) => (
                <div key={day} className={`${GLASS_CARD} p-4`}>
                  <div className="mb-3 text-sm font-semibold">{day}</div>
                  <div className="space-y-2">
                    {dayRows.map((r, idx) => (
                      <div key={`${day}-${r.staff_name}-${r.start_hour}-${r.end_hour}-${idx}`} className={`${GLASS_CARD} p-3`}>
                        <div className="text-sm font-medium">{r.staff_name}</div>
                        <div className="mt-1 text-xs text-neutral-400">
                          {r.branch_code} • {r.role || "-"} • {rangeText(r.start_hour, r.end_hour)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ) : null}
        </>
      )}
    </motion.div>
  );
}