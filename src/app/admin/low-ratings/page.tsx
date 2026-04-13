"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { canAccessAdminNav, getAuth, refreshAuthFromApi } from "@/lib/auth";
import {
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
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

export default function LowRatingsAdminPage() {
  const router = useRouter();
  const [accessReady, setAccessReady] = useState(false);
  const [city, setCity] = useState<LowRatingCity>("manila");
  const [approverName, setApproverName] = useState("");
  const [pin, setPin] = useState("");
  const range = useMemo(() => defaultRange(), []);
  const [dateFrom, setDateFrom] = useState(range.from);
  const [dateTo, setDateTo] = useState(range.to);

  useEffect(() => {
    const current = getAuth();
    if (!current) {
      router.replace("/login?next=%2Fadmin%2Flow-ratings");
      return;
    }
    setApproverName(current.staffName?.trim() || "");
    void refreshAuthFromApi(current).then((resolved) => {
      const auth = resolved || current;
      if (!canAccessAdminNav(auth)) {
        router.replace("/week");
        return;
      }
      setAccessReady(true);
    });
  }, [router]);

  const canLoad = accessReady && !!approverName.trim() && !!pin.trim();

  const { rows, loading, error, total, ratingCounts, refetch, addRow, deleteRow, updateCell } =
    useGridData(city, approverName, pin, dateFrom, dateTo, canLoad);

  if (!accessReady) {
    return (
      <div className="py-12 text-center text-sm text-zinc-500">
        Checking access…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-2 py-6 sm:px-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h1 className={T_PAGE_TITLE}>Low Ratings</h1>
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
            <input
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              className={"mt-1 w-full " + INPUT_CLASS}
              autoComplete="off"
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
      />
    </div>
  );
}
