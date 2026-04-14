"use client";

import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useState } from "react";

import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { GLASS_CARD, INPUT_CLASS, T_CAPTION, T_LABEL } from "@/lib/ui-tokens";

export const RATING_GRID_CONFIG = {
  "Sushi Zen": {
    aggregators: ["Careem", "NOON", "Talabat", "Deliveroo"],
    branches: ["Business Bay", "JLT", "Arjan", "Al Hudaiba", "Al Barsha"],
    note: "Keeta — rate is invisible (excluded)",
  },
  "Ramen Zen": {
    aggregators: ["Careem", "NOON", "Talabat"],
    branches: ["Business Bay", "JLT", "Arjan", "Al Hudaiba"],
    note: "Keeta — rate is invisible (excluded)",
  },
  "All Veggie Sushi": {
    aggregators: ["Careem", "NOON", "Talabat"],
    branches: ["Al Barsha"],
    note: "",
  },
  "J-Deli": {
    aggregators: ["Careem", "NOON", "Talabat"],
    branches: ["Business Bay", "JLT", "Arjan", "Al Hudaiba"],
    note: "",
  },
} as const;

export type RatingBrand = keyof typeof RATING_GRID_CONFIG;
export const RATING_ENTRY_BRANDS = Object.keys(RATING_GRID_CONFIG) as RatingBrand[];

export type CellKey = string;

export interface RatingCell {
  score: number | null;
  count: string;
}

export type RatingGridData = Record<CellKey, RatingCell>;

export function ratingCellKey(brand: string, agg: string, branch: string) {
  return `${brand}|${agg}|${branch}`;
}

export function parseRatingCell(raw: string): RatingCell {
  const s = raw.trim();
  if (!s) return { score: null, count: "" };
  let m = s.match(/^(\d+\.?\d*)\s*\(\s*([^)]+)\s*\)\s*$/);
  if (m) {
    const score = parseFloat(m[1]);
    return { score: Number.isNaN(score) ? null : score, count: (m[2] || "").trim() };
  }
  m = s.match(/^(\d+\.?\d*)\s+(.+)$/);
  if (m) {
    const score = parseFloat(m[1]);
    return { score: Number.isNaN(score) ? null : score, count: (m[2] || "").trim() };
  }
  m = s.match(/^(\d+\.?\d*)$/);
  if (m) {
    const score = parseFloat(m[1]);
    return { score: Number.isNaN(score) ? null : score, count: "" };
  }
  return { score: null, count: "" };
}

export function formatRatingCell(cell: RatingCell): string {
  if (cell.score == null) return "";
  const base = cell.score.toFixed(1);
  return cell.count ? `${base} (${cell.count})` : base;
}

function scoreColorClass(score: number | null | undefined): string {
  if (score == null) return "";
  if (score >= 4.5) return "text-emerald-400";
  if (score >= 4.0) return "text-amber-400";
  return "text-red-400";
}

function scoreBgClass(score: number | null | undefined): string {
  if (score == null) return "bg-transparent";
  if (score >= 4.5) return "bg-emerald-500/10";
  if (score >= 4.0) return "bg-amber-500/10";
  return "bg-red-500/10";
}

const BRAND_COLOR: Record<RatingBrand, string> = {
  "Sushi Zen": "border-indigo-500/40 bg-indigo-500/5",
  "Ramen Zen": "border-orange-500/40 bg-orange-500/5",
  "All Veggie Sushi": "border-green-500/40 bg-green-500/5",
  "J-Deli": "border-purple-500/40 bg-purple-500/5",
};

const BRAND_DOT_COLOR: Record<RatingBrand, string> = {
  "Sushi Zen": "#6366f1",
  "Ramen Zen": "#f97316",
  "All Veggie Sushi": "#22c55e",
  "J-Deli": "#a855f7",
};

const BRAND_TEXT_COLOR: Record<RatingBrand, string> = {
  "Sushi Zen": "text-indigo-400",
  "Ramen Zen": "text-orange-400",
  "All Veggie Sushi": "text-green-400",
  "J-Deli": "text-purple-400",
};

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  return "";
}

function todayLocalYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function apiGet<T>(path: string): Promise<T> {
  const run = () => fetch(`${getApiBase()}${path}`, { cache: "no-store", headers: getAuthHeaders() });
  let res = await run();
  let text = await res.text();
  if (!res.ok && res.status === 401) {
    const current = getAuth();
    if (current?.pin && (text.includes("Invalid access token") || !current.accessToken)) {
      await refreshAuthFromApi(current, { includeMfa: true });
      res = await run();
      text = await res.text();
    }
  }
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      if (typeof j?.detail === "string") detail = j.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail || `GET ${path} failed`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function apiPostJson<T>(path: string, body: unknown): Promise<T> {
  const run = () =>
    fetch(`${getApiBase()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
    });
  let res = await run();
  let text = await res.text();
  if (!res.ok && res.status === 401) {
    const current = getAuth();
    if (current?.pin && (text.includes("Invalid access token") || !current.accessToken)) {
      await refreshAuthFromApi(current, { includeMfa: true });
      res = await run();
      text = await res.text();
    }
  }
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      if (typeof j?.detail === "string") detail = j.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail || `POST ${path} failed`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function branchShortLabel(branch: string) {
  if (branch === "Business Bay") return "Biz Bay";
  if (branch === "Al Hudaiba") return "Hudaiba";
  return branch;
}

function RatingEntryTab() {
  const [approverName, setApproverName] = useState("");
  const [pin, setPin] = useState("");
  const todayStr = todayLocalYmd();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [gridData, setGridData] = useState<RatingGridData>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState<Partial<Record<RatingBrand, boolean>>>({});
  const [saved, setSaved] = useState<Partial<Record<RatingBrand, boolean>>>({});
  const [dirty, setDirty] = useState<Partial<Record<RatingBrand, boolean>>>({});
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    const a = getAuth();
    if (a?.staffName) setApproverName((p) => p.trim() || a.staffName || "");
    if (a?.pin) setPin((p) => p.trim() || a.pin || "");
  }, []);

  const loadDate = useCallback(
    async (date: string) => {
      const nm = approverName.trim();
      const p = pin.trim();
      if (!nm || !p) {
        setLoadError("Approver name and PIN are required.");
        return;
      }
      setLoading(true);
      setLoadError("");
      setDirty({});
      setSaved({});
      setSaveError("");
      try {
        const qs = new URLSearchParams({
          record_date: date,
          approver_name: nm,
          pin: p,
        });
        const json = await apiGet<{
          rows?: Array<{ brand: string; aggregator: string; branch: string; rating_score: number | null; review_count?: string }>;
        }>(`/api/admin/analytics/dubai/aggregator-ratings/by-date?${qs}`);
        const next: RatingGridData = {};
        for (const row of json.rows || []) {
          const k = ratingCellKey(row.brand, row.aggregator, row.branch);
          const rs = row.rating_score;
          next[k] = {
            score: rs != null && !Number.isNaN(Number(rs)) ? Number(rs) : null,
            count: String(row.review_count ?? "").trim(),
          };
        }
        setGridData(next);
      } catch (e: unknown) {
        setGridData({});
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [approverName, pin],
  );

  useEffect(() => {
    void loadDate(selectedDate);
  }, [selectedDate, loadDate]);

  const handleCellChange = (brand: RatingBrand, agg: string, branch: string, rawText: string) => {
    const k = ratingCellKey(brand, agg, branch);
    const parsed = parseRatingCell(rawText);
    setGridData((prev) => ({ ...prev, [k]: parsed }));
    setDirty((prev) => ({ ...prev, [brand]: true }));
    setSaved((prev) => ({ ...prev, [brand]: false }));
  };

  const saveBrand = async (brand: RatingBrand) => {
    const nm = approverName.trim();
    const p = pin.trim();
    if (!nm || !p) {
      setSaveError("Approver name and PIN are required to save.");
      return;
    }
    setSaving((prev) => ({ ...prev, [brand]: true }));
    setSaveError("");
    const cfg = RATING_GRID_CONFIG[brand];
    const rows = cfg.aggregators.flatMap((agg) =>
      cfg.branches.map((branch) => {
        const cell = gridData[ratingCellKey(brand, agg, branch)] ?? { score: null, count: "" };
        return {
          aggregator: agg,
          branch,
          rating_score: cell.score,
          review_count: cell.count,
        };
      }),
    );
    try {
      await apiPostJson("/api/admin/analytics/dubai/aggregator-ratings/save-day", {
        record_date: selectedDate,
        brand,
        rows,
        approver_name: nm,
        pin: p,
      });
      setSaved((prev) => ({ ...prev, [brand]: true }));
      setDirty((prev) => ({ ...prev, [brand]: false }));
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving((prev) => ({ ...prev, [brand]: false }));
    }
  };

  const saveAll = async () => {
    for (const b of RATING_ENTRY_BRANDS) {
      if (dirty[b]) await saveBrand(b);
    }
  };

  const shiftDate = (days: number) => {
    const d = new Date(`${selectedDate}T12:00:00`);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    setSelectedDate(`${y}-${m}-${day}`);
  };

  const handleKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    brand: RatingBrand,
    aggIdx: number,
    branchIdx: number,
  ) => {
    const cfg = RATING_GRID_CONFIG[brand];
    const totalBranches = cfg.branches.length;
    const totalAggs = cfg.aggregators.length;
    let nextAgg = aggIdx;
    let nextBranch = branchIdx;

    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      nextBranch += 1;
      if (nextBranch >= totalBranches) {
        nextBranch = 0;
        nextAgg += 1;
      }
      if (nextAgg >= totalAggs) nextAgg = 0;
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      nextBranch -= 1;
      if (nextBranch < 0) {
        nextBranch = totalBranches - 1;
        nextAgg -= 1;
      }
      if (nextAgg < 0) nextAgg = totalAggs - 1;
    } else if (e.key === "Enter") {
      e.preventDefault();
      nextAgg += 1;
      if (nextAgg >= totalAggs) nextAgg = 0;
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      nextBranch = Math.min(nextBranch + 1, totalBranches - 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      nextBranch = Math.max(nextBranch - 1, 0);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      nextAgg = Math.min(nextAgg + 1, totalAggs - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nextAgg = Math.max(nextAgg - 1, 0);
    } else {
      return;
    }

    const nextKey = ratingCellKey(brand, cfg.aggregators[nextAgg], cfg.branches[nextBranch]);
    const el = document.getElementById(`rcell-${nextKey}`);
    if (el) {
      (el as HTMLInputElement).focus();
      (el as HTMLInputElement).select();
    }
  };

  const anyDirty = RATING_ENTRY_BRANDS.some((b) => dirty[b]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <span>⭐</span> Aggregator Ratings Entry
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Dubai · Daily ratings by brand × aggregator × branch · Format:{" "}
            <span className="font-mono text-gray-400">4.5 (999+)</span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => void saveAll()}
          disabled={loading || !anyDirty || !approverName.trim() || !pin.trim()}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span>💾</span> Save All
        </button>
      </div>

      {saveError ? <div className="text-sm text-red-300">{saveError}</div> : null}

      <div className={`${GLASS_CARD} space-y-3 p-4`}>
        <p className={T_CAPTION}>
          Same approver name and PIN as other Dubai sales analytics (HQ). Required to load and save ratings.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <div className={T_LABEL}>Approver name</div>
            <input
              type="text"
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              className={"mt-1 w-full " + INPUT_CLASS}
              autoComplete="name"
            />
          </label>
          <label className="block min-w-0">
            <div className={T_LABEL}>PIN</div>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className={"mt-1 w-full " + INPUT_CLASS}
              autoComplete="off"
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => shiftDate(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-lg text-gray-300 transition-colors hover:bg-white/10"
        >
          ‹
        </button>

        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-4 py-2 font-mono text-sm text-white transition-colors focus:border-indigo-500 focus:outline-none"
        />

        <button
          type="button"
          onClick={() => shiftDate(1)}
          disabled={selectedDate >= todayStr}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-lg text-gray-300 transition-colors hover:bg-white/10 disabled:opacity-30"
        >
          ›
        </button>

        {selectedDate !== todayStr ? (
          <button
            type="button"
            onClick={() => setSelectedDate(todayStr)}
            className="rounded-lg bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-400 transition-colors hover:bg-indigo-500/20 hover:text-indigo-300"
          >
            Today
          </button>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="h-3 w-3 animate-spin rounded-full border border-indigo-500 border-t-transparent" />
            Loading...
          </div>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm border border-emerald-500/30 bg-emerald-500/20" />
            ≥ 4.5
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm border border-amber-500/30 bg-amber-500/20" />
            ≥ 4.0
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm border border-red-500/30 bg-red-500/20" />
            &lt; 4.0
          </span>
        </div>
      </div>

      {loadError ? <div className="text-sm text-amber-300">{loadError}</div> : null}

      {!approverName.trim() || !pin.trim() ? (
        <p className="text-sm text-amber-300">Fill approver name and PIN above to load and save.</p>
      ) : null}

      <RatingBrandGrid
        brand="Sushi Zen"
        selectedDate={selectedDate}
        gridData={gridData}
        onChange={handleCellChange}
        onKeyDown={handleKeyDown}
        onSave={() => void saveBrand("Sushi Zen")}
        saving={saving["Sushi Zen"] ?? false}
        saved={saved["Sushi Zen"] ?? false}
        dirty={dirty["Sushi Zen"] ?? false}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {(["Ramen Zen", "All Veggie Sushi", "J-Deli"] as RatingBrand[]).map((brand) => (
          <RatingBrandGrid
            key={brand}
            brand={brand}
            selectedDate={selectedDate}
            gridData={gridData}
            onChange={handleCellChange}
            onKeyDown={handleKeyDown}
            onSave={() => void saveBrand(brand)}
            saving={saving[brand] ?? false}
            saved={saved[brand] ?? false}
            dirty={dirty[brand] ?? false}
          />
        ))}
      </div>
    </div>
  );
}

export default RatingEntryTab;
export { RatingEntryTab };

interface RatingBrandGridProps {
  brand: RatingBrand;
  selectedDate: string;
  gridData: RatingGridData;
  onChange: (brand: RatingBrand, agg: string, branch: string, raw: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>, brand: RatingBrand, aggIdx: number, branchIdx: number) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  dirty: boolean;
}

function RatingBrandGrid({
  brand,
  selectedDate,
  gridData,
  onChange,
  onKeyDown,
  onSave,
  saving,
  saved,
  dirty,
}: RatingBrandGridProps) {
  const cfg = RATING_GRID_CONFIG[brand];
  const aggs = cfg.aggregators as readonly string[];
  const branches = cfg.branches as readonly string[];

  const [editingKey, setEditingKey] = useState<CellKey | null>(null);
  const [editingText, setEditingText] = useState("");

  const totalSlots = aggs.length * branches.length;
  let filled = 0;
  for (const agg of aggs) {
    for (const branch of branches) {
      const c = gridData[ratingCellKey(brand, agg, branch)];
      if (c?.score != null) filled += 1;
    }
  }

  return (
    <div className={`overflow-hidden rounded-xl border ${BRAND_COLOR[brand]}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className={`flex items-center gap-2 text-sm font-bold ${BRAND_TEXT_COLOR[brand]}`}>
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: BRAND_DOT_COLOR[brand] }} />
            {brand}
          </h3>
          {cfg.note ? <span className="truncate text-[10px] font-normal text-gray-600">({cfg.note})</span> : null}
        </div>
        <div className="flex items-center gap-2">
          {saved && !dirty ? (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <span>✓</span> Saved
            </span>
          ) : null}
          {dirty ? <span className="text-xs text-amber-400">● unsaved</span> : null}
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !dirty}
            className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1 text-xs font-medium text-gray-200 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {saving ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border border-white/50 border-t-transparent" /> Saving...
              </>
            ) : (
              "💾 Save"
            )}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10">
              <th className="sticky left-0 z-10 w-24 bg-[#0f1117] px-3 py-2 text-left font-medium text-gray-500">Aggregator</th>
              {branches.map((branch) => (
                <th
                  key={branch}
                  className="min-w-[90px] px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wide text-gray-500"
                >
                  {branchShortLabel(branch)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {aggs.map((agg, aggIdx) => (
              <tr key={agg} className="border-b border-white/5 transition-colors hover:bg-white/[0.02]">
                <td className="sticky left-0 z-10 bg-[#0f1117] px-3 py-1.5 font-medium text-gray-400">{agg}</td>
                {branches.map((branch, branchIdx) => {
                  const k = ratingCellKey(brand, agg, branch);
                  const cell = gridData[k] ?? { score: null, count: "" };
                  const isEditing = editingKey === k;
                  const displayText = isEditing ? editingText : formatRatingCell(cell);

                  return (
                    <td key={branch} className={`px-1 py-1 ${scoreBgClass(cell.score)}`}>
                      <input
                        id={`rcell-${k}`}
                        type="text"
                        value={displayText}
                        placeholder="—"
                        onFocus={() => {
                          setEditingKey(k);
                          setEditingText(formatRatingCell(cell));
                          setTimeout(() => {
                            const el = document.getElementById(`rcell-${k}`) as HTMLInputElement | null;
                            el?.select();
                          }, 0);
                        }}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEditingText(v);
                          onChange(brand, agg, branch, v);
                        }}
                        onBlur={() => {
                          onChange(brand, agg, branch, editingText);
                          setEditingKey(null);
                          setEditingText("");
                        }}
                        onKeyDown={(e) => onKeyDown(e, brand, aggIdx, branchIdx)}
                        className={`w-full rounded-md border px-1 py-1.5 text-center font-mono text-sm outline-none transition-all focus:ring-1 focus:ring-indigo-500/40 ${
                          cell.score != null
                            ? `border-white/15 font-semibold ${scoreColorClass(cell.score)}`
                            : "border-white/5 text-gray-600 placeholder:text-gray-800"
                        } bg-transparent focus:border-indigo-500/70 focus:bg-white/10 focus:text-white`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-white/10 px-4 py-2">
        <span className="text-[10px] text-gray-600">
          {selectedDate} · {aggs.length} aggregators × {branches.length} branches
        </span>
        <span className="text-[10px] text-gray-500">
          {filled} / {totalSlots} filled
        </span>
      </div>
    </div>
  );
}
