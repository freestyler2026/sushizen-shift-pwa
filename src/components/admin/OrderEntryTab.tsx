"use client";

import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useState } from "react";

import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { GLASS_CARD, INPUT_CLASS, T_CAPTION, T_LABEL } from "@/lib/ui-tokens";

export const BRAND_GRID_CONFIG = {
  "Sushi Zen": {
    aggregators: ["Careem", "NOON", "Talabat", "Deliveroo", "Smiles", "Keeta", "Dine-in"],
    branches: ["Business Bay", "JLT", "Arjan", "Al Hudaiba", "Al Barsha"],
  },
  "Ramen Zen": {
    aggregators: ["Careem", "NOON", "Talabat", "Keeta"],
    branches: ["Business Bay", "JLT", "Arjan", "Al Hudaiba"],
  },
  "All Veggie Sushi": {
    aggregators: ["Careem", "NOON", "Talabat", "Keeta"],
    branches: ["Al Barsha"],
  },
  "J-Deli": {
    aggregators: ["Careem", "NOON", "Talabat"],
    branches: ["Business Bay", "JLT", "Arjan", "Al Hudaiba"],
  },
} as const;

export type Brand = keyof typeof BRAND_GRID_CONFIG;
export const ORDER_ENTRY_BRANDS = Object.keys(BRAND_GRID_CONFIG) as Brand[];

export type CellKey = string;
export type GridData = Record<CellKey, number>;

export function cellKey(brand: string, agg: string, branch: string) {
  return `${brand}|${agg}|${branch}`;
}

const BRAND_COLOR: Record<Brand, string> = {
  "Sushi Zen": "border-indigo-500/40 bg-indigo-500/5",
  "Ramen Zen": "border-orange-500/40 bg-orange-500/5",
  "All Veggie Sushi": "border-green-500/40 bg-green-500/5",
  "J-Deli": "border-purple-500/40 bg-purple-500/5",
};

const BRAND_TITLE_COLOR: Record<Brand, string> = {
  "Sushi Zen": "text-indigo-400",
  "Ramen Zen": "text-orange-400",
  "All Veggie Sushi": "text-green-400",
  "J-Deli": "text-purple-400",
};

const BRAND_DOT: Record<Brand, string> = {
  "Sushi Zen": "#6366f1",
  "Ramen Zen": "#f97316",
  "All Veggie Sushi": "#22c55e",
  "J-Deli": "#a855f7",
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

export default function OrderEntryTab() {
  const [approverName, setApproverName] = useState("");
  const [pin, setPin] = useState("");
  const todayStr = todayLocalYmd();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [gridData, setGridData] = useState<GridData>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState<Partial<Record<Brand, boolean>>>({});
  const [saved, setSaved] = useState<Partial<Record<Brand, boolean>>>({});
  const [dirty, setDirty] = useState<Partial<Record<Brand, boolean>>>({});
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
          order_date: date,
          approver_name: nm,
          pin: p,
        });
        const json = await apiGet<{ rows?: Array<{ brand: string; aggregator: string; branch: string; order_count: number }> }>(
          `/api/admin/analytics/dubai/order-counts/by-date?${qs}`,
        );
        const next: GridData = {};
        for (const row of json.rows || []) {
          const k = cellKey(row.brand, row.aggregator, row.branch);
          next[k] = Number(row.order_count) || 0;
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

  const handleCellChange = (brand: Brand, agg: string, branch: string, val: string) => {
    const num = parseInt(val.replace(/[^0-9]/g, ""), 10);
    const k = cellKey(brand, agg, branch);
    setGridData((prev) => ({ ...prev, [k]: Number.isNaN(num) ? 0 : num }));
    setDirty((prev) => ({ ...prev, [brand]: true }));
    setSaved((prev) => ({ ...prev, [brand]: false }));
  };

  const saveBrand = async (brand: Brand) => {
    const nm = approverName.trim();
    const p = pin.trim();
    if (!nm || !p) {
      setSaveError("Approver name and PIN are required to save.");
      return;
    }
    setSaving((prev) => ({ ...prev, [brand]: true }));
    setSaveError("");
    const cfg = BRAND_GRID_CONFIG[brand];
    const rows = cfg.aggregators.flatMap((agg) =>
      cfg.branches.map((branch) => ({
        aggregator: agg,
        branch,
        order_count: gridData[cellKey(brand, agg, branch)] ?? 0,
      })),
    );
    try {
      await apiPostJson("/api/admin/analytics/dubai/order-counts/save-day", {
        order_date: selectedDate,
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
    for (const b of ORDER_ENTRY_BRANDS) {
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
    brand: Brand,
    aggIdx: number,
    branchIdx: number,
  ) => {
    const cfg = BRAND_GRID_CONFIG[brand];
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

    const nextKey = cellKey(brand, cfg.aggregators[nextAgg], cfg.branches[nextBranch]);
    const el = document.getElementById(`cell-${nextKey}`);
    if (el) {
      (el as HTMLInputElement).focus();
      (el as HTMLInputElement).select();
    }
  };

  const anyDirty = ORDER_ENTRY_BRANDS.some((b) => dirty[b]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <span>📦</span> Number of Orders Entry
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">Dubai · Daily order counts by brand × aggregator × branch</p>
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
          Same approver name and PIN as other Dubai sales analytics (HQ). Required to load and save counts.
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
      </div>

      {loadError ? <div className="text-sm text-amber-300">{loadError}</div> : null}

      {!approverName.trim() || !pin.trim() ? (
        <p className="text-sm text-amber-300">Fill approver name and PIN above to load and save.</p>
      ) : null}

      <BrandGrid
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
        {(["Ramen Zen", "All Veggie Sushi", "J-Deli"] as Brand[]).map((brand) => (
          <BrandGrid
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

interface BrandGridProps {
  brand: Brand;
  selectedDate: string;
  gridData: GridData;
  onChange: (brand: Brand, agg: string, branch: string, val: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>, brand: Brand, aggIdx: number, branchIdx: number) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  dirty: boolean;
}

function branchShortLabel(branch: string) {
  if (branch === "Business Bay") return "Biz Bay";
  if (branch === "Al Hudaiba") return "Hudaiba";
  return branch;
}

function BrandGrid({
  brand,
  selectedDate,
  gridData,
  onChange,
  onKeyDown,
  onSave,
  saving,
  saved,
  dirty,
}: BrandGridProps) {
  const cfg = BRAND_GRID_CONFIG[brand];

  const aggs = cfg.aggregators as readonly string[];
  const branches = cfg.branches as readonly string[];

  const rowTotal = (agg: string) =>
    branches.reduce((s, br) => s + (gridData[cellKey(brand, agg, br)] ?? 0), 0);

  const colTotal = (branch: string) =>
    aggs.reduce((s, agg) => s + (gridData[cellKey(brand, agg, branch)] ?? 0), 0);

  const grandTotal = aggs.reduce((s, agg) => s + rowTotal(agg), 0);

  return (
    <div className={`overflow-hidden rounded-xl border ${BRAND_COLOR[brand]}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className={`flex items-center gap-2 text-sm font-bold ${BRAND_TITLE_COLOR[brand]}`}>
          <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: BRAND_DOT[brand] }} />
          {brand}
        </h3>

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
                <span className="h-3 w-3 animate-spin rounded-full border border-white/50 border-t-transparent" />{" "}
                Saving...
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
              <th className="sticky left-0 z-10 w-28 bg-[#0f1117] px-3 py-2 text-left font-medium text-gray-500">
                Aggregator
              </th>
              {branches.map((branch) => (
                <th
                  key={branch}
                  className="min-w-[72px] px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wide text-gray-500"
                >
                  {branchShortLabel(branch)}
                </th>
              ))}
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-white">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {aggs.map((agg, aggIdx) => {
              const rt = rowTotal(agg);
              return (
                <tr key={agg} className="border-b border-white/5 transition-colors hover:bg-white/[0.03]">
                  <td className="sticky left-0 z-10 bg-[#0f1117] px-3 py-1.5 font-medium text-gray-400">{agg}</td>
                  {branches.map((branch, branchIdx) => {
                    const k = cellKey(brand, agg, branch);
                    const val = gridData[k] ?? 0;
                    return (
                      <td key={branch} className="px-1 py-1">
                        <input
                          id={`cell-${k}`}
                          type="text"
                          inputMode="numeric"
                          value={val === 0 ? "" : String(val)}
                          placeholder="0"
                          onChange={(e) => onChange(brand, agg, branch, e.target.value)}
                          onKeyDown={(e) => onKeyDown(e, brand, aggIdx, branchIdx)}
                          onFocus={(e) => e.target.select()}
                          className={`w-full rounded-md border px-1 py-1.5 text-center text-sm outline-none transition-all focus:ring-1 focus:ring-indigo-500/40 ${
                            val > 0
                              ? "border-white/15 bg-white/[0.07] text-white"
                              : "border-white/5 bg-transparent text-gray-600 placeholder:text-gray-700"
                          } focus:border-indigo-500/70 focus:bg-white/10 focus:text-white`}
                        />
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-center font-bold">
                    <span className={rt > 0 ? "text-white" : "text-gray-700"}>{rt > 0 ? rt.toLocaleString() : "—"}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/20 bg-white/[0.03]">
              <td className="sticky left-0 z-10 bg-[#141720] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                TOTAL
              </td>
              {branches.map((branch) => {
                const ct = colTotal(branch);
                return (
                  <td key={branch} className="px-2 py-2 text-center">
                    <span className={`text-sm font-bold ${ct > 0 ? "text-white" : "text-gray-700"}`}>
                      {ct > 0 ? ct.toLocaleString() : "—"}
                    </span>
                  </td>
                );
              })}
              <td className="px-3 py-2 text-center">
                <span className={`text-sm font-bold ${grandTotal > 0 ? "text-white" : "text-gray-700"}`}>
                  {grandTotal > 0 ? grandTotal.toLocaleString() : "—"}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {grandTotal > 0 ? (
        <div className="flex items-center justify-end gap-3 border-t border-white/10 px-4 py-2">
          <span className="text-xs text-gray-500">
            {selectedDate} · {aggs.length} aggregators · {branches.length} branches
          </span>
          <span className="text-xs font-bold text-white">Grand Total: {grandTotal.toLocaleString()}</span>
        </div>
      ) : null}
    </div>
  );
}
