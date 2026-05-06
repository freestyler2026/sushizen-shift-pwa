// src/app/admin/disposal/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { BRANCHES, type BranchCode, type City } from "@/lib/branches";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  SMALL_BUTTON,
  T_CARD_TITLE,
  T_LABEL,
  T_PAGE_TITLE,
  TABLE_CELL,
  TABLE_ROW,
} from "@/lib/ui-tokens";

// ─── Types ───────────────────────────────────────────────────────────────────

type ItemType = "menu_item" | "ingredient";

interface SearchItem {
  id: number;
  item_type: ItemType;
  category: string;
  name: string;
  default_unit: string;
}

interface DisposalLine {
  _key: string;
  item_type: ItemType;
  item_id: number | null;
  item_name_snapshot: string;
  item_category: string;
  quantity: string;
  unit: string;
  disposal_reason: DisposalReason;
  notes: string;
}

type DisposalReason = "eod_leftover" | "spoilage" | "staff_meal" | "other";

const REASON_LABELS: Record<DisposalReason, string> = {
  eod_leftover: "End-of-Day Leftover",
  spoilage:     "Spoilage",
  staff_meal:   "Staff Meal",
  other:        "Other",
};

const SHIFT_OPTIONS = ["closing", "morning", "midday", "all_day"] as const;
type Shift = (typeof SHIFT_OPTIONS)[number];
const SHIFT_LABELS: Record<Shift, string> = {
  closing: "Closing",
  morning: "Morning",
  midday:  "Midday",
  all_day: "All Day",
};

// Common units for restaurant items
const UNIT_OPTIONS = ["pcs", "g", "kg", "ml", "L", "bag", "box", "pack", "rolls", "bottle", "sheet", "portion", "tray", "can"];

interface DisposalReport {
  id: number;
  city: string;
  branch_code: string;
  report_date: string;
  reported_by: string;
  shift: string;
  notes: string;
  status: string;
  created_at: string;
  lines: DisposalReportLine[];
}

interface DisposalReportLine {
  id: number;
  item_type: string;
  item_name_snapshot: string;
  item_category: string;
  quantity: number;
  unit: string;
  disposal_reason: string;
  notes: string;
}

// ─── Category normalisation (JP → EN) ────────────────────────────────────────

const CATEGORY_MAP: Record<string, string> = {
  "野菜": "Vegetables",
  "魚介類": "Seafood",
  "肉類": "Meat",
  "乳製品": "Dairy",
  "調味料": "Condiments",
  "飲料": "Beverages",
  "デザート": "Desserts",
  "穀物": "Grains",
  "冷凍食品": "Frozen Foods",
  "缶詰": "Canned Goods",
  "パン": "Bread",
  "果物": "Fruits",
  "卵": "Eggs",
  "豆腐": "Tofu",
  "油脂": "Oils & Fats",
  "ソース": "Sauces",
  "スパイス": "Spices",
};

function normaliseCategory(cat: string): string {
  if (!cat) return "";
  return CATEGORY_MAP[cat.trim()] ?? cat;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayStr(): string { return new Date().toISOString().slice(0, 10); }

function formatDateTime(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).replace(",", "");
  } catch { return iso; }
}

let _keyCounter = 0;
function nextKey(): string { return `line_${++_keyCounter}`; }

function emptyLine(): DisposalLine {
  return {
    _key: nextKey(), item_type: "menu_item", item_id: null,
    item_name_snapshot: "", item_category: "", quantity: "1",
    unit: "pcs", disposal_reason: "eod_leftover", notes: "",
  };
}

// ─── LocalStorage persistence ─────────────────────────────────────────────────

const LS_KEY = "disposal_draft_v1";

interface DraftState {
  city: City;
  branchCode: BranchCode;
  reportDate: string;
  reportedBy: string;
  shift: Shift;
  headerNotes: string;
  lines: DisposalLine[];
  savedAt: number;
}

function loadDraft(): DraftState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as DraftState;
    // Discard drafts older than 24 hours
    if (Date.now() - d.savedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(LS_KEY);
      return null;
    }
    return d;
  } catch { return null; }
}

function saveDraft(state: Omit<DraftState, "savedAt">) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
  } catch { /* ignore */ }
}

function clearDraft() {
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const auth = getAuth();
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(getAuthHeaders(auth) ?? {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    const j = text ? JSON.parse(text) : {};
    throw new Error(j?.detail || j?.message || text || `HTTP ${res.status}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

// ─── Inline Item Search (used inside each card) ───────────────────────────────

function InlineItemSearch({
  city,
  onSelect,
  placeholder = "Search item name...",
}: {
  city: City;
  onSelect: (item: SearchItem) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const data = await apiFetch<{ items: SearchItem[] }>(
        `/api/admin/disposal/items/search?city=${city}&q=${encodeURIComponent(q)}&limit=50`
      );
      setResults(data.items ?? []);
      setOpen(true);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, [city]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (item: SearchItem) => {
    onSelect(item);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        className="w-full rounded-lg border border-violet-500/40 bg-violet-500/8 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-violet-400"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => search(e.target.value), 250);
        }}
        placeholder={placeholder}
        autoComplete="off"
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">…</div>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-[200] mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden">
          {results.map((item) => (
            <button key={`${item.item_type}_${item.id}`} type="button"
              onMouseDown={() => handleSelect(item)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-violet-500/15 transition-colors">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 w-10">
                {item.item_type === "menu_item" ? "MENU" : "INGR"}
              </span>
              <span className="flex-1 text-white">{item.name}</span>
              <span className="shrink-0 text-xs text-violet-400">{item.default_unit}</span>
            </button>
          ))}
        </div>
      )}
      {open && !loading && results.length === 0 && query.trim() && (
        <div className="absolute z-[200] mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-500 shadow-2xl">
          No items found
        </div>
      )}
    </div>
  );
}

// ─── Unit Selector ────────────────────────────────────────────────────────────

function UnitSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isCustom = !UNIT_OPTIONS.includes(value);
  const [showCustom, setShowCustom] = useState(isCustom);

  const handleSelectChange = (v: string) => {
    if (v === "__custom__") {
      setShowCustom(true);
      onChange("");
    } else {
      setShowCustom(false);
      onChange(v);
    }
  };

  return (
    <div className="space-y-1">
      <select
        className="w-full rounded-lg border border-white/10 bg-white/6 px-3 py-3 text-base text-white outline-none focus:border-violet-500/50 appearance-none cursor-pointer"
        value={showCustom ? "__custom__" : value}
        onChange={(e) => handleSelectChange(e.target.value)}
      >
        {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
        <option value="__custom__">Other…</option>
      </select>
      {showCustom && (
        <input
          type="text"
          className="w-full rounded-lg border border-violet-500/40 bg-violet-500/8 px-3 py-2 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-violet-400"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter unit"
          autoFocus
        />
      )}
    </div>
  );
}

// ─── Disposal Line Card ───────────────────────────────────────────────────────

function DisposalLineCard({
  line,
  city,
  onUpdate,
  onRemove,
}: {
  line: DisposalLine;
  city: City;
  onUpdate: (patch: Partial<DisposalLine>) => void;
  onRemove: () => void;
}) {
  const handleItemSelect = (item: SearchItem) => {
    onUpdate({
      item_type: item.item_type,
      item_id: item.id,
      item_name_snapshot: item.name,
      item_category: item.category,
      unit: item.default_unit || "pcs",
    });
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/4 p-3 space-y-2">
      {/* Search field — always visible */}
      <div className="space-y-1">
        <InlineItemSearch city={city} onSelect={handleItemSelect} placeholder="Search item name to link…" />
        {/* Show current item name or free-text input */}
        {line.item_id ? (
          <div className="flex items-center gap-2 px-1">
            <span className="text-sm font-medium text-white flex-1">{line.item_name_snapshot}</span>
            {line.item_category && (
              <span className="text-xs text-zinc-500 shrink-0">{normaliseCategory(line.item_category)}</span>
            )}
            <button type="button" onClick={() => onUpdate({ item_id: null, item_name_snapshot: "", item_category: "" })}
              className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors shrink-0">clear</button>
          </div>
        ) : (
          <input type="text"
            className="w-full rounded-lg border border-white/10 bg-white/6 px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/50"
            value={line.item_name_snapshot}
            onChange={(e) => onUpdate({ item_name_snapshot: e.target.value })}
            placeholder="Or type item name manually" />
        )}
      </div>

      {/* Remove button row */}
      <div className="flex items-center justify-end">
        <button type="button" onClick={onRemove}
          className="text-xs text-zinc-600 hover:text-red-400 hover:bg-red-500/10 px-2 py-1 rounded transition-colors">
          Remove
        </button>
      </div>

      {/* Qty + Unit row */}
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <label className="block mb-1 text-xs text-zinc-500">Qty</label>
          <input type="number" inputMode="numeric" min="0" step="0.5"
            className="w-full rounded-lg border border-white/10 bg-white/6 px-3 py-3 text-base text-white text-right outline-none focus:border-violet-500/50"
            value={line.quantity}
            onChange={(e) => onUpdate({ quantity: e.target.value })} />
        </div>
        <div className="w-28">
          <label className="block mb-1 text-xs text-zinc-500">Unit</label>
          <UnitSelector value={line.unit} onChange={(v) => onUpdate({ unit: v })} />
        </div>
      </div>

      {/* Reason */}
      <div>
        <label className="block mb-1 text-xs text-zinc-500">Reason</label>
        <select
          className="w-full appearance-none cursor-pointer rounded-lg border border-white/10 bg-white/6 px-3 py-3 text-base text-white outline-none focus:border-violet-500/50"
          value={line.disposal_reason}
          onChange={(e) => onUpdate({ disposal_reason: e.target.value as DisposalReason })}>
          {(Object.keys(REASON_LABELS) as DisposalReason[]).map((r) => (
            <option key={r} value={r}>{REASON_LABELS[r]}</option>
          ))}
        </select>
      </div>

      {/* Notes */}
      <input type="text"
        className="w-full rounded-lg border border-white/10 bg-white/6 px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/50"
        value={line.notes}
        onChange={(e) => onUpdate({ notes: e.target.value })}
        placeholder="Notes (optional)" />
    </div>
  );
}

// ─── Past Reports Panel ───────────────────────────────────────────────────────

// city のみでフィルター。branch_code は渡さず全店舗分を表示する。
function PastReports({ city, isAdmin }: { city: City; isAdmin: boolean }) {
  const [reports, setReports] = useState<DisposalReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [deletingLineId, setDeletingLineId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(todayStr);

  const load = useCallback(async () => {
    if (!city) return;
    setLoading(true); setError("");
    try {
      // branch_code を省略 → 全店舗分を返す
      const params = new URLSearchParams({ city, date_from: dateFrom, date_to: dateTo, limit: "100" });
      const data = await apiFetch<{ reports: DisposalReport[] }>(`/api/admin/disposal/reports?${params}`);
      setReports(data.reports ?? []);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [city, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const handleDeleteReport = async (id: number) => {
    if (!confirm("Delete this entire disposal report?")) return;
    try {
      await apiFetch(`/api/admin/disposal/report/${id}?city=${city}`, { method: "DELETE" });
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) { alert(e instanceof Error ? e.message : String(e)); }
  };

  const handleDeleteLine = async (reportId: number, lineId: number) => {
    if (!confirm("Delete this item line?")) return;
    setDeletingLineId(lineId);
    try {
      await apiFetch(`/api/admin/disposal/line/${lineId}?city=${city}`, { method: "DELETE" });
      setReports((prev) =>
        prev.map((r) =>
          r.id !== reportId ? r : { ...r, lines: r.lines.filter((l) => l.id !== lineId) }
        )
      );
    } catch (e: unknown) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setDeletingLineId(null); }
  };

  const reasonBadge = (r: string) => {
    if (r === "spoilage")    return <span className={BADGE_ERROR}>{REASON_LABELS[r as DisposalReason] ?? r}</span>;
    if (r === "staff_meal")  return <span className={BADGE_SUCCESS}>{REASON_LABELS[r as DisposalReason] ?? r}</span>;
    if (r === "eod_leftover") return <span className={BADGE_WARNING}>{REASON_LABELS[r as DisposalReason] ?? r}</span>;
    return <span className={BADGE_INFO}>{r}</span>;
  };

  return (
    <div className={`${GLASS_CARD} p-4 sm:p-6 mt-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className={T_CARD_TITLE}>Past Reports <span className="text-xs font-normal text-zinc-500 ml-1">— all branches</span></h2>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500/50 w-36" />
          <span className="text-zinc-500 text-sm">–</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500/50 w-36" />
          <button onClick={load} className={SMALL_BUTTON}>Reload</button>
        </div>
      </div>

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      {loading && <p className="text-sm text-zinc-500">Loading...</p>}
      {!loading && reports.length === 0 && <p className="text-sm text-zinc-500">No reports found for this period.</p>}

      <div className="space-y-2">
        {reports.map((r) => (
          <div key={r.id} className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5 active:bg-white/8 transition-colors"
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
              <span className="text-sm font-semibold text-white">{r.report_date}</span>
              {r.created_at && (
                <span className="text-xs text-zinc-500">{formatDateTime(r.created_at)}</span>
              )}
              {/* Branch badge — helps distinguish when showing all branches */}
              <span className="rounded-full bg-violet-900/40 px-2 py-0.5 text-[11px] font-semibold text-violet-300">{r.branch_code}</span>
              <span className={BADGE_INFO}>{r.shift}</span>
              <span className="text-xs text-zinc-400">by {r.reported_by}</span>
              <span className="text-xs text-zinc-500 ml-auto">{r.lines?.length ?? 0} items</span>
              {isAdmin && (
                <button onClick={(e) => { e.stopPropagation(); handleDeleteReport(r.id); }}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 shrink-0">
                  Delete All
                </button>
              )}
            </div>

            {expanded === r.id && (
              <div className="border-t border-white/8 px-4 py-3">
                {r.notes && <p className="text-xs text-zinc-400 mb-3 italic">{r.notes}</p>}

                {/* Mobile: stacked cards */}
                <div className="space-y-2 sm:hidden">
                  {(r.lines ?? []).map((l) => (
                    <div key={l.id} className="rounded-lg bg-white/3 p-3 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <span className="text-sm text-white font-medium">{l.item_name_snapshot}</span>
                          {l.item_category && (
                            <span className="ml-2 text-xs text-zinc-500">{normaliseCategory(l.item_category)}</span>
                          )}
                        </div>
                        <span className="shrink-0 font-mono text-violet-300 text-sm">{l.quantity} {l.unit}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          {reasonBadge(l.disposal_reason)}
                          {l.notes && <span className="text-xs text-zinc-500 italic">{l.notes}</span>}
                        </div>
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteLine(r.id, l.id)}
                            disabled={deletingLineId === l.id}
                            className="text-[11px] text-red-400/70 hover:text-red-400 transition-colors px-1.5 py-0.5 rounded shrink-0 disabled:opacity-40">
                            {deletingLineId === l.id ? "…" : "Delete"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop: table */}
                <table className="hidden sm:table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 pb-2 text-left">Item</th>
                      <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 pb-2 text-left">Category</th>
                      <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 pb-2 text-right">Qty</th>
                      <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 pb-2 text-left">Unit</th>
                      <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 pb-2 text-left">Reason</th>
                      {isAdmin && <th className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 pb-2 text-center w-16"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(r.lines ?? []).map((l) => (
                      <tr key={l.id} className={TABLE_ROW}>
                        <td className={TABLE_CELL}>{l.item_name_snapshot}</td>
                        <td className={`${TABLE_CELL} text-zinc-500`}>{normaliseCategory(l.item_category)}</td>
                        <td className={`${TABLE_CELL} text-right font-mono`}>{l.quantity}</td>
                        <td className={`${TABLE_CELL} text-zinc-400`}>{l.unit}</td>
                        <td className={TABLE_CELL}>{reasonBadge(l.disposal_reason)}</td>
                        {isAdmin && (
                          <td className={`${TABLE_CELL} text-center`}>
                            <button
                              onClick={() => handleDeleteLine(r.id, l.id)}
                              disabled={deletingLineId === l.id}
                              className="text-[11px] text-red-400/70 hover:text-red-400 transition-colors px-1.5 py-0.5 rounded disabled:opacity-40">
                              {deletingLineId === l.id ? "…" : "Delete"}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DisposalPage() {
  const auth = useMemo(() => getAuth(), []);
  const role = auth?.role ?? "";
  const isAdmin = role === "ADMIN" || role === "HQ";

  // ── Form state (restored from localStorage draft if present) ──
  const [city, setCity] = useState<City>("dubai");
  const [branchCode, setBranchCode] = useState<BranchCode>("BB");
  const [reportDate, setReportDate] = useState(todayStr);
  const [reportedBy, setReportedBy] = useState(auth?.staffName ?? "");
  const [shift, setShift] = useState<Shift>("closing");
  const [headerNotes, setHeaderNotes] = useState("");
  const [lines, setLines] = useState<DisposalLine[]>([emptyLine()]);
  const [draftRestored, setDraftRestored] = useState(false);

  // ── Staff list for autocomplete ──
  const [staffNames, setStaffNames] = useState<string[]>([]);

  // ── Submit state ──
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  // ── Restore draft on mount ──
  useEffect(() => {
    const draft = loadDraft();
    if (draft && draft.lines.some((l) => l.item_name_snapshot.trim())) {
      setCity(draft.city);
      setBranchCode(draft.branchCode);
      setReportDate(draft.reportDate);
      setReportedBy(draft.reportedBy);
      setShift(draft.shift);
      setHeaderNotes(draft.headerNotes);
      setLines(draft.lines);
      setDraftRestored(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-save draft whenever form changes ──
  useEffect(() => {
    // Don't save on first render before draft restore completes
    saveDraft({ city, branchCode, reportDate, reportedBy, shift, headerNotes, lines });
  }, [city, branchCode, reportDate, reportedBy, shift, headerNotes, lines]);

  // ── Load staff names when city changes ──
  useEffect(() => {
    async function fetchStaff() {
      try {
        const data = await apiFetch<{ names: string[] }>(
          `/api/admin/staff_master/names?city=${city}&status=ACTIVE&limit=500`
        );
        setStaffNames(data.names ?? []);
      } catch { /* non-fatal */ }
    }
    void fetchStaff();
  }, [city]);

  useEffect(() => {
    const branches = BRANCHES[city];
    if (branches.length > 0) setBranchCode(branches[0].code);
  }, [city]);

  const updateLine = useCallback((key: string, patch: Partial<DisposalLine>) => {
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, ...patch } : l)));
  }, []);

  const removeLine = useCallback((key: string) => {
    setLines((prev) => prev.filter((l) => l._key !== key));
  }, []);

  const handleClear = useCallback(() => {
    setLines([emptyLine()]); setHeaderNotes("");
    setSubmitSuccess(""); setSubmitError("");
    setDraftRestored(false);
    clearDraft();
  }, []);

  const handleSubmit = async () => {
    const validLines = lines.filter((l) => l.item_name_snapshot.trim() && parseFloat(l.quantity) > 0);
    if (!validLines.length) { setSubmitError("Please add at least one item with a valid quantity."); return; }
    if (!reportedBy.trim()) { setSubmitError("Please enter the reporter name."); return; }

    setSubmitting(true); setSubmitError(""); setSubmitSuccess("");
    try {
      const result = await apiFetch<{ report_id: number; status: string }>(
        "/api/admin/disposal/report",
        {
          method: "POST",
          body: JSON.stringify({
            city, branch_code: branchCode, report_date: reportDate,
            reported_by: reportedBy.trim(), shift, notes: headerNotes.trim(),
            lines: validLines.map((l) => ({
              item_type: l.item_type, item_id: l.item_id,
              item_name_snapshot: l.item_name_snapshot,
              item_category: l.item_category,
              quantity: parseFloat(l.quantity),
              unit: l.unit, disposal_reason: l.disposal_reason, notes: l.notes,
            })),
          }),
        }
      );
      setSubmitSuccess(`Report #${result.report_id} submitted.`);
      setLines([emptyLine()]); setHeaderNotes("");
      setDraftRestored(false);
      clearDraft();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const itemCount = lines.filter((l) => l.item_name_snapshot.trim()).length;

  return (
    <>
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950/20 to-slate-950 px-3 pt-4 pb-44 sm:px-6 md:pb-32">
        <div className="mx-auto max-w-5xl space-y-4">

          {/* Page header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className={T_PAGE_TITLE}>Disposal Report</h1>
              <p className="mt-0.5 text-sm text-zinc-500">Record end-of-day item disposal</p>
            </div>
            <Link href="/my-shift" className={`${SECONDARY_BUTTON} shrink-0`}>&larr; My Shift</Link>
          </div>

          {/* Draft restored banner */}
          {draftRestored && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-900/15 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-base">💾</span>
                <span className="text-sm text-amber-200">Draft restored — your previous entry was saved automatically.</span>
              </div>
              <button type="button" onClick={handleClear}
                className="shrink-0 text-xs text-amber-400/60 hover:text-amber-400 transition-colors px-2 py-1 rounded">
                Discard
              </button>
            </div>
          )}

          {/* Report Details */}
          <div className={`${GLASS_CARD} p-4 sm:p-6`}>
            <h2 className={`${T_CARD_TITLE} mb-4`}>Report Details</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              <div>
                <label className={`${T_LABEL} block mb-1.5`}>City</label>
                <select className={`${SELECT_CLASS} py-3 text-base`} value={city}
                  onChange={(e) => setCity(e.target.value as City)}>
                  <option value="dubai">Dubai</option>
                  <option value="manila">Manila</option>
                </select>
              </div>
              <div>
                <label className={`${T_LABEL} block mb-1.5`}>Branch</label>
                <select className={`${SELECT_CLASS} py-3 text-base`} value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value as BranchCode)}>
                  {BRANCHES[city].map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
                </select>
              </div>
              <div className="min-w-0 overflow-hidden">
                <label className={`${T_LABEL} block mb-1.5`}>Date</label>
                <input type="date" className={`${INPUT_CLASS} py-3 text-base`} value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)} />
              </div>
              <div>
                <label className={`${T_LABEL} block mb-1.5`}>Reported By</label>
                {/* Staff name autocomplete from staff_master */}
                <input
                  type="text"
                  list="disposal-staff-names"
                  className={`${INPUT_CLASS} py-3 text-base`}
                  value={reportedBy}
                  onChange={(e) => setReportedBy(e.target.value)}
                  placeholder="Select or type staff name"
                  autoComplete="off"
                />
                <datalist id="disposal-staff-names">
                  {staffNames.map((n) => <option key={n} value={n} />)}
                </datalist>
              </div>
              <div>
                <label className={`${T_LABEL} block mb-1.5`}>Shift</label>
                <select className={`${SELECT_CLASS} py-3 text-base`} value={shift}
                  onChange={(e) => setShift(e.target.value as Shift)}>
                  {SHIFT_OPTIONS.map((s) => <option key={s} value={s}>{SHIFT_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label className={`${T_LABEL} block mb-1.5`}>Notes (optional)</label>
                <input type="text" className={`${INPUT_CLASS} py-3 text-base`} value={headerNotes}
                  onChange={(e) => setHeaderNotes(e.target.value)} placeholder="e.g. public holiday, event..." />
              </div>
            </div>
          </div>

          {/* Disposal Items — z-10 ensures search dropdowns appear above Past Reports */}
          <div className={`${GLASS_CARD} p-4 sm:p-6 relative z-10`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={T_CARD_TITLE}>Disposal Items</h2>
              <span className="text-xs text-zinc-500">{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
            </div>

            {/* Line cards — each has its own search field */}
            {lines.length > 0 && (
              <div className="space-y-3 mb-3">
                {lines.map((line) => (
                  <DisposalLineCard
                    key={line._key}
                    line={line}
                    city={city}
                    onUpdate={(patch) => updateLine(line._key, patch)}
                    onRemove={() => removeLine(line._key)}
                  />
                ))}
              </div>
            )}

            <button type="button" onClick={() => setLines((prev) => [...prev, emptyLine()])}
              className={SMALL_BUTTON}>+ Add item</button>
          </div>

          {/* Past Reports — all branches for selected city */}
          <PastReports city={city} isAdmin={isAdmin} />

        </div>
      </main>

      {/* Sticky submit bar */}
      <div className="fixed bottom-14 md:bottom-0 inset-x-0 z-[60] bg-slate-950/95 backdrop-blur border-t border-white/8 px-4 py-3 sm:px-6">
        <div className="mx-auto max-w-5xl flex items-center gap-3">
          <button onClick={handleSubmit} disabled={submitting}
            className={`${PRIMARY_BUTTON} flex-1 py-3.5 text-base justify-center`}>
            {submitting ? "Submitting..." : "Submit Disposal Report"}
          </button>
          <button type="button" onClick={handleClear} className={`${SECONDARY_BUTTON} py-3.5`}>
            Clear
          </button>
          {itemCount > 0 && !submitSuccess && (
            <span className="text-xs text-zinc-500 hidden sm:block">{itemCount} items</span>
          )}
        </div>
        {(submitError || submitSuccess) && (
          <div className="mx-auto max-w-5xl mt-1">
            {submitError && <p className="text-sm text-red-400">{submitError}</p>}
            {submitSuccess && <p className="text-sm text-emerald-400">{submitSuccess}</p>}
          </div>
        )}
      </div>
    </>
  );
}
