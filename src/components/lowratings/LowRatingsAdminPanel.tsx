"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { getAuth } from "@/lib/auth";
import {
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  T_SECTION,
  TAB_ACTIVE,
  TAB_CONTAINER,
  TAB_INACTIVE,
} from "@/lib/ui-tokens";
import {
  DUBAI_AGGREGATORS,
  DUBAI_BRANCHES,
  MANILA_AGGREGATORS,
  MANILA_BRANCHES,
  type LowRatingCity,
} from "@/types/lowRating";
import { LowRatingsGrid } from "@/components/lowratings/LowRatingsGrid";
import { useGridData } from "@/components/lowratings/useGridData";

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 3);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// ── Summary table: branch × aggregator matrix ────────────────────────────────
type SummaryCell = { total: number; r1: number; r2: number; r3: number };

function buildSummary(
  rows: { branch: string; aggregator: string; rating: number }[],
  branches: readonly string[],
  aggregators: readonly string[],
): Record<string, Record<string, SummaryCell>> {
  const result: Record<string, Record<string, SummaryCell>> = {};
  const allBranches = new Set<string>([...branches]);
  const allAggs = new Set<string>([...aggregators]);
  for (const r of rows) {
    if (r.branch) allBranches.add(r.branch);
    if (r.aggregator) allAggs.add(r.aggregator);
  }
  for (const branch of allBranches) {
    result[branch] = {};
    for (const agg of allAggs) {
      result[branch][agg] = { total: 0, r1: 0, r2: 0, r3: 0 };
    }
  }
  for (const r of rows) {
    const b = r.branch || "";
    const a = r.aggregator?.toLowerCase() || "";
    if (!result[b]) result[b] = {};
    if (!result[b][a]) result[b][a] = { total: 0, r1: 0, r2: 0, r3: 0 };
    result[b][a].total++;
    if (r.rating === 1) result[b][a].r1++;
    else if (r.rating === 2) result[b][a].r2++;
    else if (r.rating === 3) result[b][a].r3++;
  }
  return result;
}

function SummaryTable({
  rows,
  city,
}: {
  rows: { branch: string; aggregator: string; rating: number }[];
  city: LowRatingCity;
}) {
  const branches = city === "manila" ? MANILA_BRANCHES : DUBAI_BRANCHES;
  const aggregators = city === "manila" ? MANILA_AGGREGATORS : DUBAI_AGGREGATORS;

  // Collect actual branches/aggs from data (may have unlisted values)
  const dataBranches = useMemo(() => {
    const s = new Set<string>([...branches]);
    rows.forEach((r) => { if (r.branch) s.add(r.branch); });
    return [...s];
  }, [rows, branches]);
  const dataAggs = useMemo(() => {
    const s = new Set<string>([...aggregators]);
    rows.forEach((r) => { if (r.aggregator) s.add(r.aggregator.toLowerCase()); });
    return [...s];
  }, [rows, aggregators]);

  const summary = useMemo(() => buildSummary(rows, branches, aggregators), [rows, branches, aggregators]);

  // Branch totals
  const branchTotals = useMemo(() =>
    dataBranches.map((b) => {
      let t = 0, r1 = 0, r2 = 0, r3 = 0;
      dataAggs.forEach((a) => {
        const c = summary[b]?.[a];
        if (c) { t += c.total; r1 += c.r1; r2 += c.r2; r3 += c.r3; }
      });
      return { branch: b, total: t, r1, r2, r3 };
    }), [dataBranches, dataAggs, summary]);

  // Aggregator totals
  const aggTotals = useMemo(() =>
    dataAggs.map((a) => {
      let t = 0, r1 = 0, r2 = 0, r3 = 0;
      dataBranches.forEach((b) => {
        const c = summary[b]?.[a];
        if (c) { t += c.total; r1 += c.r1; r2 += c.r2; r3 += c.r3; }
      });
      return { agg: a, total: t, r1, r2, r3 };
    }), [dataBranches, dataAggs, summary]);

  const grandTotal = useMemo(() => branchTotals.reduce((s, b) => s + b.total, 0), [branchTotals]);

  if (rows.length === 0) return null;

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className={GLASS_CARD + " overflow-x-auto p-4"}>
      <p className="mb-3 text-sm font-semibold text-zinc-200">Branch × Aggregator Summary</p>
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-white/10">
            <th className="py-2 pr-3 text-left font-semibold text-zinc-400">Branch</th>
            {dataAggs.map((a) => (
              <th key={a} className="px-3 py-2 text-center font-semibold text-zinc-400">
                {capitalize(a)}
              </th>
            ))}
            <th className="pl-3 py-2 text-center font-semibold text-zinc-300">Total</th>
          </tr>
        </thead>
        <tbody>
          {dataBranches.map((branch) => {
            const bt = branchTotals.find((x) => x.branch === branch);
            return (
              <tr key={branch} className="border-b border-white/5 hover:bg-white/3 transition">
                <td className="py-2 pr-3 font-medium text-zinc-200">{branch}</td>
                {dataAggs.map((agg) => {
                  const c = summary[branch]?.[agg];
                  if (!c || c.total === 0) {
                    return <td key={agg} className="px-3 py-2 text-center text-zinc-600">—</td>;
                  }
                  return (
                    <td key={agg} className="px-3 py-2 text-center">
                      <span className="font-semibold text-white">{c.total}</span>
                      <span className="ml-1.5 text-zinc-500">
                        <span className="text-red-400">★{c.r1}</span>
                        {" "}
                        <span className="text-orange-400">★{c.r2}</span>
                        {" "}
                        <span className="text-amber-300">★{c.r3}</span>
                      </span>
                    </td>
                  );
                })}
                <td className="pl-3 py-2 text-center font-semibold text-white">
                  {bt?.total ?? 0}
                  <div className="text-zinc-500 font-normal">
                    <span className="text-red-400">★{bt?.r1 ?? 0}</span>
                    {" "}
                    <span className="text-orange-400">★{bt?.r2 ?? 0}</span>
                    {" "}
                    <span className="text-amber-300">★{bt?.r3 ?? 0}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-white/10">
            <td className="py-2 pr-3 font-semibold text-zinc-300">Total</td>
            {aggTotals.map((at) => (
              <td key={at.agg} className="px-3 py-2 text-center font-semibold text-white">
                {at.total}
                <div className="text-zinc-500 font-normal">
                  <span className="text-red-400">★{at.r1}</span>
                  {" "}
                  <span className="text-orange-400">★{at.r2}</span>
                  {" "}
                  <span className="text-amber-300">★{at.r3}</span>
                </div>
              </td>
            ))}
            <td className="pl-3 py-2 text-center font-bold text-white text-sm">{grandTotal}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────
export function LowRatingsAdminPanel() {
  const [city, setCity] = useState<LowRatingCity>("manila");
  const [approverName, setApproverName] = useState("");
  const [pin, setPin] = useState("");
  const [approverOptions, setApproverOptions] = useState<string[]>([]);
  const [approverOptionsLoading, setApproverOptionsLoading] = useState(false);
  const approverNameRef = useRef("");
  approverNameRef.current = approverName;
  const range = useMemo(() => defaultRange(), []);
  const [dateFrom, setDateFrom] = useState(range.from);
  const [dateTo, setDateTo] = useState(range.to);
  const [filterBranch, setFilterBranch] = useState("");
  const [filterAggregator, setFilterAggregator] = useState("");

  const branchOptions = city === "manila" ? MANILA_BRANCHES : DUBAI_BRANCHES;
  const aggregatorOptions = city === "manila" ? MANILA_AGGREGATORS : DUBAI_AGGREGATORS;

  // Reset filters when city changes
  useEffect(() => {
    setFilterBranch("");
    setFilterAggregator("");
  }, [city]);

  useEffect(() => {
    const a = getAuth();
    if (a?.staffName) setApproverName((p) => p.trim() || a.staffName || "");
    if (a?.pin) setPin((p) => p.trim() || a.pin || "");
  }, []);

  const loadApproverOptions = useCallback(async () => {
    const p = pin.trim();
    if (!p) {
      setApproverOptions([]);
      return;
    }
    const a = getAuth();
    const nm = (a?.staffName || approverNameRef.current).trim();
    if (!nm) {
      setApproverOptions([]);
      return;
    }
    setApproverOptionsLoading(true);
    try {
      const res = await fetch(
        `/api/admin/staff_master/names?city=${encodeURIComponent(city)}&status=ACTIVE&limit=5000&approver_name=${encodeURIComponent(nm)}&pin=${encodeURIComponent(p)}`,
        { cache: "no-store" },
      );
      const data: { names?: string[] } = await res.json().catch(() => ({}));
      const names = Array.isArray(data?.names) ? [...data.names] : [];
      const cur = approverNameRef.current.trim();
      if (cur && !names.includes(cur)) names.push(cur);
      if (a?.staffName?.trim() && !names.includes(a.staffName.trim())) names.push(a.staffName.trim());
      names.sort((x, y) => x.localeCompare(y, undefined, { sensitivity: "base" }));
      setApproverOptions(names);
      setApproverName((prev) => {
        const t = prev.trim();
        if (t && names.includes(t)) return prev;
        if (a?.staffName?.trim() && names.includes(a.staffName.trim())) return a.staffName.trim();
        if (names.length) return names[0];
        return prev;
      });
    } catch {
      setApproverOptions([]);
    } finally {
      setApproverOptionsLoading(false);
    }
  }, [city, pin]);

  useEffect(() => {
    void loadApproverOptions();
  }, [loadApproverOptions]);

  const canLoad = !!approverName.trim() && !!pin.trim();

  const approverSelectOptions = useMemo(() => {
    const set = new Set(approverOptions);
    const cur = approverName.trim();
    if (cur) set.add(cur);
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [approverOptions, approverName]);

  const { rows, loading, error, total, ratingCounts, refetch, addRow, deleteRow, updateCell, commitDraft } =
    useGridData(city, approverName, pin, dateFrom, dateTo, canLoad, filterBranch, filterAggregator);

  const picSelectOptions = useMemo(() => {
    const s = new Set(approverSelectOptions);
    for (const r of rows) {
      const p = String(r.pic || "").trim();
      if (p) s.add(p);
    }
    return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [approverSelectOptions, rows]);

  // Summary rows: use all loaded rows (client-side, no extra API call)
  const summaryRows = useMemo(() =>
    rows.map((r) => ({ branch: r.branch, aggregator: r.aggregator, rating: r.rating as number })),
    [rows],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h2 className={T_SECTION}>Low Ratings</h2>
          <p className={T_CAPTION}>
            Spreadsheet-style editing for aggregator reviews (1–3★). Changes save when you leave a cell or press Enter.
          </p>
        </div>
      </div>

      <div className={TAB_CONTAINER}>
        <button
          type="button"
          className={city === "manila" ? TAB_ACTIVE : TAB_INACTIVE}
          onClick={() => setCity("manila")}
        >
          Manila
        </button>
        <button
          type="button"
          className={city === "dubai" ? TAB_ACTIVE : TAB_INACTIVE}
          onClick={() => setCity("dubai")}
        >
          Dubai
        </button>
      </div>

      <div className={GLASS_CARD + " space-y-4 p-4"}>
        <p className={T_BODY}>
          Enter the same approver name and PIN used elsewhere for sales analytics, then set the date range and click Apply.
        </p>

        {/* ── Auth + Date range ── */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block min-w-0">
            <div className={T_LABEL}>Approver name</div>
            <select
              value={approverName.trim()}
              onChange={(e) => setApproverName(e.target.value)}
              className={"mt-1 w-full " + SELECT_CLASS}
              disabled={!pin.trim() || approverOptionsLoading}
            >
              <option value="">— Select —</option>
              {approverSelectOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {approverOptionsLoading ? <p className={`${T_CAPTION} mt-1`}>Loading staff list…</p> : null}
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
          <label className="block min-w-0">
            <div className={T_LABEL}>From</div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={"mt-1 w-full " + INPUT_CLASS}
            />
          </label>
          <label className="block min-w-0">
            <div className={T_LABEL}>To</div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={"mt-1 w-full " + INPUT_CLASS}
            />
          </label>
        </div>

        {/* ── Branch + Aggregator filters ── */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <div className={T_LABEL}>Branch</div>
            <select
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
              className={"mt-1 w-full " + SELECT_CLASS}
            >
              <option value="">All Branches</option>
              {branchOptions.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <div className={T_LABEL}>Aggregator</div>
            <select
              value={filterAggregator}
              onChange={(e) => setFilterAggregator(e.target.value)}
              className={"mt-1 w-full " + SELECT_CLASS}
            >
              <option value="">All Aggregators</option>
              {aggregatorOptions.map((a) => (
                <option key={a} value={a}>
                  {a.charAt(0).toUpperCase() + a.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={PRIMARY_BUTTON + " text-sm"}
            disabled={!canLoad}
            onClick={() => void refetch()}
          >
            Apply
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON + " text-sm"}
            onClick={() => {
              const r = defaultRange();
              setDateFrom(r.from);
              setDateTo(r.to);
              setFilterBranch("");
              setFilterAggregator("");
            }}
          >
            Reset
          </button>
        </div>
        {!canLoad ? (
          <p className={T_CAPTION}>Fill approver name and PIN to load data.</p>
        ) : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        {/* ── Rating counts ── */}
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-zinc-300">
            Total: <span className="font-semibold text-white tabular-nums">{total}</span>
          </span>
          <span className="text-red-400">★1: {ratingCounts["1"] ?? 0}</span>
          <span className="text-orange-400">★2: {ratingCounts["2"] ?? 0}</span>
          <span className="text-amber-300">★3: {ratingCounts["3"] ?? 0}</span>
        </div>
      </div>

      {/* ── Branch × Aggregator summary table ── */}
      {canLoad && !loading && summaryRows.length > 0 && (
        <SummaryTable rows={summaryRows} city={city} />
      )}

      <LowRatingsGrid
        city={city}
        rows={rows}
        loading={loading}
        updateCell={updateCell}
        deleteRow={deleteRow}
        addRow={addRow}
        commitDraft={commitDraft}
        picOptions={picSelectOptions}
      />
    </div>
  );
}
