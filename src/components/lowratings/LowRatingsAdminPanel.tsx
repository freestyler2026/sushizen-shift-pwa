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
import type { LowRatingCity } from "@/types/lowRating";
import { LowRatingsGrid } from "@/components/lowratings/LowRatingsGrid";
import { useGridData } from "@/components/lowratings/useGridData";

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 3);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

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

  const { rows, loading, error, total, ratingCounts, refetch, addRow, deleteRow, updateCell } =
    useGridData(city, approverName, pin, dateFrom, dateTo, canLoad);

  const picSelectOptions = useMemo(() => {
    const s = new Set(approverSelectOptions);
    for (const r of rows) {
      const p = String(r.pic || "").trim();
      if (p) s.add(p);
    }
    return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [approverSelectOptions, rows]);

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
            }}
          >
            Reset range
          </button>
        </div>
        {!canLoad ? (
          <p className={T_CAPTION}>Fill approver name and PIN to load data.</p>
        ) : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-zinc-300">
            Total: <span className="font-semibold text-white tabular-nums">{total}</span>
          </span>
          <span className="text-red-400">★1: {ratingCounts["1"] ?? 0}</span>
          <span className="text-orange-400">★2: {ratingCounts["2"] ?? 0}</span>
          <span className="text-amber-300">★3: {ratingCounts["3"] ?? 0}</span>
        </div>
      </div>

      <LowRatingsGrid
        city={city}
        rows={rows}
        loading={loading}
        updateCell={updateCell}
        deleteRow={deleteRow}
        addRow={addRow}
        picOptions={picSelectOptions}
      />
    </div>
  );
}
