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
  T_CAPTION,
  T_CARD_TITLE,
  T_LABEL,
  T_PAGE_TITLE,
  TABLE_CELL,
  TABLE_HEADER,
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
  _key: string; // local unique key
  item_type: ItemType;
  item_id: number | null;
  item_name_snapshot: string;
  item_category: string;
  quantity: string; // string for input control
  unit: string;
  disposal_reason: DisposalReason;
  notes: string;
}

type DisposalReason = "eod_leftover" | "spoilage" | "staff_meal" | "other";

const REASON_LABELS: Record<DisposalReason, string> = {
  eod_leftover: "End-of-Day Leftover",
  spoilage: "Spoilage",
  staff_meal: "Staff Meal",
  other: "Other",
};

const SHIFT_OPTIONS = ["closing", "morning", "midday", "all_day"] as const;
type Shift = (typeof SHIFT_OPTIONS)[number];
const SHIFT_LABELS: Record<Shift, string> = {
  closing: "Closing",
  morning: "Morning",
  midday: "Midday",
  all_day: "All Day",
};

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

let _keyCounter = 0;
function nextKey(): string {
  return `line_${++_keyCounter}`;
}

function emptyLine(): DisposalLine {
  return {
    _key: nextKey(),
    item_type: "menu_item",
    item_id: null,
    item_name_snapshot: "",
    item_category: "",
    quantity: "1",
    unit: "pcs",
    disposal_reason: "eod_leftover",
    notes: "",
  };
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

// ─── Item Search Combobox ─────────────────────────────────────────────────────

interface ItemSearchProps {
  city: City;
  onSelect: (item: SearchItem) => void;
}

function ItemSearch({ city, onSelect }: ItemSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const search = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const data = await apiFetch<{ items: SearchItem[] }>(
          `/api/admin/disposal/items/search?city=${city}&q=${encodeURIComponent(q)}&limit=20`
        );
        setResults(data.items ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [city]
  );

  const handleInput = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 250);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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
        className={INPUT_CLASS}
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        placeholder="Search item name to add line..."
        autoComplete="off"
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
          searching...
        </div>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/60 overflow-hidden">
          {results.map((item) => (
            <button
              key={`${item.item_type}_${item.id}`}
              type="button"
              onMouseDown={() => handleSelect(item)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-violet-500/15 transition-colors"
            >
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 w-16">
                {item.item_type === "menu_item" ? "MENU" : "INGR"}
              </span>
              <span className="flex-1 text-white">{item.name}</span>
              <span className="shrink-0 text-xs text-zinc-500">{item.category}</span>
              <span className="shrink-0 text-xs text-violet-400">{item.default_unit}</span>
            </button>
          ))}
        </div>
      )}
      {open && !loading && results.length === 0 && query.trim() && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-500 shadow-2xl">
          No items found
        </div>
      )}
    </div>
  );
}

// ─── Past Reports Panel ───────────────────────────────────────────────────────

interface PastReportsProps {
  city: City;
  branchCode: BranchCode;
  isAdmin: boolean;
}

function PastReports({ city, branchCode, isAdmin }: PastReportsProps) {
  const [reports, setReports] = useState<DisposalReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(todayStr);

  const load = useCallback(async () => {
    if (!city) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        city,
        branch_code: branchCode,
        date_from: dateFrom,
        date_to: dateTo,
        limit: "50",
      });
      const data = await apiFetch<{ reports: DisposalReport[] }>(
        `/api/admin/disposal/reports?${params}`
      );
      setReports(data.reports ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [city, branchCode, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this disposal report?")) return;
    try {
      await apiFetch(`/api/admin/disposal/report/${id}?city=${city}`, { method: "DELETE" });
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const reasonBadge = (r: string) => {
    if (r === "spoilage") return <span className={BADGE_ERROR}>{REASON_LABELS[r as DisposalReason] ?? r}</span>;
    if (r === "staff_meal") return <span className={BADGE_SUCCESS}>{REASON_LABELS[r as DisposalReason] ?? r}</span>;
    if (r === "eod_leftover") return <span className={BADGE_WARNING}>{REASON_LABELS[r as DisposalReason] ?? r}</span>;
    return <span className={BADGE_INFO}>{r}</span>;
  };

  return (
    <div className={`${GLASS_CARD} p-6 mt-6`}>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h2 className={T_CARD_TITLE}>Past Reports</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 w-36"
          />
          <span className="text-zinc-500 text-sm">–</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 w-36"
          />
          <button onClick={load} className={SMALL_BUTTON}>Reload</button>
        </div>
      </div>

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      {loading && <p className="text-sm text-zinc-500">Loading...</p>}
      {!loading && reports.length === 0 && (
        <p className="text-sm text-zinc-500">No reports found for this period.</p>
      )}

      <div className="space-y-2">
        {reports.map((r) => (
          <div key={r.id} className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
            <div
              className="flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}
            >
              <span className="font-mono text-xs text-zinc-500">#{r.id}</span>
              <span className="text-sm font-semibold text-white">{r.report_date}</span>
              <span className="text-xs text-zinc-400">{r.branch_code}</span>
              <span className={BADGE_INFO}>{r.shift}</span>
              <span className="text-xs text-zinc-400">by {r.reported_by}</span>
              <span className="text-xs text-zinc-500 ml-auto">{r.lines?.length ?? 0} items</span>
              {isAdmin && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1"
                >
                  Delete
                </button>
              )}
            </div>

            {expanded === r.id && (
              <div className="border-t border-white/8 px-4 py-3">
                {r.notes && (
                  <p className="text-xs text-zinc-400 mb-3 italic">{r.notes}</p>
                )}
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={`${TABLE_HEADER} text-left`}>Item</th>
                      <th className={`${TABLE_HEADER} text-left`}>Category</th>
                      <th className={`${TABLE_HEADER} text-right`}>Qty</th>
                      <th className={`${TABLE_HEADER} text-left`}>Unit</th>
                      <th className={`${TABLE_HEADER} text-left`}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(r.lines ?? []).map((l) => (
                      <tr key={l.id} className={TABLE_ROW}>
                        <td className={TABLE_CELL}>{l.item_name_snapshot}</td>
                        <td className={`${TABLE_CELL} text-zinc-500`}>{l.item_category}</td>
                        <td className={`${TABLE_CELL} text-right font-mono`}>{l.quantity}</td>
                        <td className={`${TABLE_CELL} text-zinc-400`}>{l.unit}</td>
                        <td className={TABLE_CELL}>{reasonBadge(l.disposal_reason)}</td>
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

  // Header fields
  const [city, setCity] = useState<City>("dubai");
  const [branchCode, setBranchCode] = useState<BranchCode>("BB");
  const [reportDate, setReportDate] = useState(todayStr);
  const [reportedBy, setReportedBy] = useState(auth?.staffName ?? "");
  const [shift, setShift] = useState<Shift>("closing");
  const [headerNotes, setHeaderNotes] = useState("");

  // Lines
  const [lines, setLines] = useState<DisposalLine[]>([emptyLine()]);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  // Reset branch when city changes
  useEffect(() => {
    const branches = BRANCHES[city];
    if (branches.length > 0) setBranchCode(branches[0].code);
  }, [city]);

  const addItemLine = useCallback((item: SearchItem) => {
    setLines((prev) => [
      ...prev,
      {
        _key: nextKey(),
        item_type: item.item_type,
        item_id: item.id,
        item_name_snapshot: item.name,
        item_category: item.category,
        quantity: "1",
        unit: item.default_unit || "pcs",
        disposal_reason: "eod_leftover",
        notes: "",
      },
    ]);
  }, []);

  const updateLine = useCallback((key: string, patch: Partial<DisposalLine>) => {
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, ...patch } : l)));
  }, []);

  const removeLine = useCallback((key: string) => {
    setLines((prev) => prev.filter((l) => l._key !== key));
  }, []);

  const handleSubmit = async () => {
    // Validate
    const validLines = lines.filter((l) => l.item_name_snapshot.trim() && parseFloat(l.quantity) > 0);
    if (!validLines.length) {
      setSubmitError("Please add at least one item with a valid quantity.");
      return;
    }
    if (!reportedBy.trim()) {
      setSubmitError("Please enter the reporter name.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");

    try {
      const body = {
        city,
        branch_code: branchCode,
        report_date: reportDate,
        reported_by: reportedBy.trim(),
        shift,
        notes: headerNotes.trim(),
        lines: validLines.map((l) => ({
          item_type: l.item_type,
          item_id: l.item_id,
          item_name_snapshot: l.item_name_snapshot,
          item_category: l.item_category,
          quantity: parseFloat(l.quantity),
          unit: l.unit,
          disposal_reason: l.disposal_reason,
          notes: l.notes,
        })),
      };

      const result = await apiFetch<{ report_id: number; status: string }>(
        "/api/admin/disposal/report",
        { method: "POST", body: JSON.stringify(body) }
      );

      setSubmitSuccess(`Report #${result.report_id} submitted successfully.`);
      setLines([emptyLine()]);
      setHeaderNotes("");
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950/20 to-slate-950 p-6">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className={T_PAGE_TITLE}>Disposal Report</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Record end-of-day item disposal with quantities and reasons
            </p>
          </div>
          <Link href="/admin" className={SECONDARY_BUTTON}>
            &larr; Admin
          </Link>
        </div>

        {/* Report Header Form */}
        <div className={`${GLASS_CARD} p-6`}>
          <h2 className={`${T_CARD_TITLE} mb-4`}>Report Details</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">

            {/* City */}
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>City</label>
              <select
                className={SELECT_CLASS}
                value={city}
                onChange={(e) => setCity(e.target.value as City)}
              >
                <option value="dubai">Dubai</option>
                <option value="manila">Manila</option>
              </select>
            </div>

            {/* Branch */}
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>Branch</label>
              <select
                className={SELECT_CLASS}
                value={branchCode}
                onChange={(e) => setBranchCode(e.target.value as BranchCode)}
              >
                {BRANCHES[city].map((b) => (
                  <option key={b.code} value={b.code}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>Date</label>
              <input
                type="date"
                className={INPUT_CLASS}
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
              />
            </div>

            {/* Reporter */}
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>Reported By</label>
              <input
                type="text"
                className={INPUT_CLASS}
                value={reportedBy}
                onChange={(e) => setReportedBy(e.target.value)}
                placeholder="Staff name"
              />
            </div>

            {/* Shift */}
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>Shift</label>
              <select
                className={SELECT_CLASS}
                value={shift}
                onChange={(e) => setShift(e.target.value as Shift)}
              >
                {SHIFT_OPTIONS.map((s) => (
                  <option key={s} value={s}>{SHIFT_LABELS[s]}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className={`${T_LABEL} block mb-1.5`}>Notes (optional)</label>
              <input
                type="text"
                className={INPUT_CLASS}
                value={headerNotes}
                onChange={(e) => setHeaderNotes(e.target.value)}
                placeholder="e.g. public holiday, event..."
              />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className={`${GLASS_CARD} p-6`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={T_CARD_TITLE}>Disposal Items</h2>
            <span className={T_CAPTION}>{lines.filter(l => l.item_name_snapshot).length} item(s)</span>
          </div>

          {/* Item Search */}
          <div className="mb-4">
            <label className={`${T_LABEL} block mb-1.5`}>Add Item</label>
            <ItemSearch city={city} onSelect={addItemLine} />
          </div>

          {/* Lines Table */}
          {lines.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr>
                    <th className={`${TABLE_HEADER} text-left w-[28%]`}>Item</th>
                    <th className={`${TABLE_HEADER} text-left w-[14%]`}>Category</th>
                    <th className={`${TABLE_HEADER} text-right w-[10%]`}>Qty</th>
                    <th className={`${TABLE_HEADER} text-left w-[8%]`}>Unit</th>
                    <th className={`${TABLE_HEADER} text-left w-[18%]`}>Reason</th>
                    <th className={`${TABLE_HEADER} text-left w-[16%]`}>Notes</th>
                    <th className={`${TABLE_HEADER} text-center w-[6%]`}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line._key} className={TABLE_ROW}>
                      {/* Item name */}
                      <td className="py-2 pr-2">
                        {line.item_id ? (
                          <div>
                            <span className="text-white">{line.item_name_snapshot}</span>
                            <span className="ml-1.5 text-[10px] font-semibold uppercase text-zinc-600">
                              {line.item_type === "menu_item" ? "menu" : "ingr"}
                            </span>
                          </div>
                        ) : (
                          <input
                            type="text"
                            className="w-full rounded-lg border border-white/10 bg-white/6 px-2 py-1.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/40"
                            value={line.item_name_snapshot}
                            onChange={(e) => updateLine(line._key, { item_name_snapshot: e.target.value })}
                            placeholder="Item name"
                          />
                        )}
                      </td>
                      {/* Category */}
                      <td className="py-2 pr-2 text-zinc-500 text-xs">{line.item_category || "—"}</td>
                      {/* Qty */}
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          className="w-20 rounded-lg border border-white/10 bg-white/6 px-2 py-1.5 text-sm text-white text-right outline-none focus:border-violet-500/40"
                          value={line.quantity}
                          onChange={(e) => updateLine(line._key, { quantity: e.target.value })}
                        />
                      </td>
                      {/* Unit */}
                      <td className="py-2 pr-2">
                        <input
                          type="text"
                          className="w-16 rounded-lg border border-white/10 bg-white/6 px-2 py-1.5 text-sm text-white outline-none focus:border-violet-500/40"
                          value={line.unit}
                          onChange={(e) => updateLine(line._key, { unit: e.target.value })}
                        />
                      </td>
                      {/* Reason */}
                      <td className="py-2 pr-2">
                        <select
                          className="w-full appearance-none cursor-pointer rounded-lg border border-white/10 bg-white/6 px-2 py-1.5 text-sm text-white outline-none focus:border-violet-500/40"
                          value={line.disposal_reason}
                          onChange={(e) =>
                            updateLine(line._key, { disposal_reason: e.target.value as DisposalReason })
                          }
                        >
                          {(Object.keys(REASON_LABELS) as DisposalReason[]).map((r) => (
                            <option key={r} value={r}>{REASON_LABELS[r]}</option>
                          ))}
                        </select>
                      </td>
                      {/* Notes */}
                      <td className="py-2 pr-2">
                        <input
                          type="text"
                          className="w-full rounded-lg border border-white/10 bg-white/6 px-2 py-1.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/40"
                          value={line.notes}
                          onChange={(e) => updateLine(line._key, { notes: e.target.value })}
                          placeholder="optional"
                        />
                      </td>
                      {/* Remove */}
                      <td className="py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(line._key)}
                          className="text-zinc-600 hover:text-red-400 transition-colors text-lg leading-none"
                          title="Remove"
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add blank line button */}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
              className={SMALL_BUTTON}
            >
              + Add blank line
            </button>
          </div>
        </div>

        {/* Submit */}
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={PRIMARY_BUTTON}
          >
            {submitting ? "Submitting..." : "Submit Disposal Report"}
          </button>
          <button
            type="button"
            onClick={() => { setLines([emptyLine()]); setHeaderNotes(""); setSubmitSuccess(""); setSubmitError(""); }}
            className={SECONDARY_BUTTON}
          >
            Clear
          </button>
          {submitError && <p className="text-sm text-red-400">{submitError}</p>}
          {submitSuccess && <p className="text-sm text-emerald-400">{submitSuccess}</p>}
        </div>

        {/* Past Reports */}
        <PastReports city={city} branchCode={branchCode} isAdmin={isAdmin} />

      </div>
    </main>
  );
}
