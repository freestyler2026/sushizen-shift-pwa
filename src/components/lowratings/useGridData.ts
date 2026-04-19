"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import type { LowRatingCity, LowRatingRow } from "@/types/lowRating";

import { newEmptyRow, rowReadyForApi, toSavePayload, type DataColumnKey, type GridRowState } from "./gridTypes";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  return "";
}

function parseApiErrorDetail(text: string) {
  try {
    const payload = JSON.parse(text);
    return typeof payload?.detail === "string" ? payload.detail : "";
  } catch {
    return "";
  }
}

async function apiRequest(method: string, path: string, body?: unknown): Promise<Response> {
  const request = async () =>
    fetch(`${getApiBase()}${path}`, {
      method,
      cache: "no-store",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...getAuthHeaders(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  let res = await request();
  let text = await res.text();
  if (!res.ok && res.status === 401) {
    const detail = parseApiErrorDetail(text);
    const current = getAuth();
    if (
      current?.pin &&
      (detail.includes("Invalid access token") ||
        detail.includes("Authentication is required") ||
        !current.accessToken)
    ) {
      await refreshAuthFromApi(current, { includeMfa: true });
      res = await request();
      text = await res.text();
    }
  }
  return new Response(text, { status: res.status, statusText: res.statusText });
}

function applyCellEdit(row: GridRowState, key: DataColumnKey, value: unknown): GridRowState {
  if (key === "amount") {
    const s = String(value ?? "").trim();
    const n = s === "" ? null : Number(s);
    return { ...row, amount: n !== null && Number.isFinite(n) ? n : null };
  }
  if (key === "rating") {
    const n = Number(value);
    return { ...row, rating: n >= 1 && n <= 3 ? n : row.rating };
  }
  return { ...row, [key]: value } as GridRowState;
}

function fromApiRow(r: LowRatingRow, localId?: string): GridRowState {
  return {
    _localId:
      localId ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `r-${r.id}-${Date.now()}`),
    id: r.id,
    order_date: r.order_date ? String(r.order_date).slice(0, 10) : "",
    aggregator: String(r.aggregator || ""),
    branch: String(r.branch || ""),
    brand: String(r.brand || ""),
    order_id: String(r.order_id || ""),
    ordered_items: String(r.ordered_items || ""),
    amount: r.amount != null && Number.isFinite(Number(r.amount)) ? Number(r.amount) : null,
    rating: Number(r.rating) || 1,
    customer_review: String(r.customer_review || ""),
    issue_category: String(r.issue_category || ""),
    pic: String(r.pic || ""),
    date_updated: r.date_updated ? String(r.date_updated).slice(0, 10) : "",
  };
}

export function useGridData(
  city: LowRatingCity,
  approverName: string,
  pin: string,
  dateFrom: string,
  dateTo: string,
  canLoad: boolean,
  filterBranch?: string,
  filterAggregator?: string,
) {
  const [rows, setRows] = useState<GridRowState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [ratingCounts, setRatingCounts] = useState<Record<string, number>>({ "1": 0, "2": 0, "3": 0 });
  const rowsRef = useRef<GridRowState[]>([]);
  rowsRef.current = rows;

  const buildListQs = useCallback(() => {
    const p = new URLSearchParams({
      approver_name: approverName.trim(),
      pin: pin.trim(),
      limit: "500",
      offset: "0",
    });
    if (dateFrom.trim()) p.set("date_from", dateFrom.trim());
    if (dateTo.trim()) p.set("date_to", dateTo.trim());
    if (filterBranch?.trim()) p.set("branch", filterBranch.trim());
    if (filterAggregator?.trim()) p.set("aggregator", filterAggregator.trim().toLowerCase());
    return p.toString();
  }, [approverName, pin, dateFrom, dateTo, filterBranch, filterAggregator]);

  const refetch = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest("GET", `/api/admin/analytics/${city}/low-ratings?${buildListQs()}`);
      const text = await res.text();
      if (!res.ok) throw new Error(parseApiErrorDetail(text) || text || "Failed to load");
      let data: { rows?: LowRatingRow[]; total?: number; rating_counts?: Record<string, number> };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Invalid response");
      }
      const list = Array.isArray(data.rows) ? data.rows : [];
      setRows(list.map((r) => fromApiRow(r)));
      setTotal(Number(data.total || 0));
      const rc = data.rating_counts || {};
      setRatingCounts({
        "1": Number(rc["1"] || 0),
        "2": Number(rc["2"] || 0),
        "3": Number(rc["3"] || 0),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
      setTotal(0);
      setRatingCounts({ "1": 0, "2": 0, "3": 0 });
    } finally {
      setLoading(false);
    }
  }, [buildListQs, canLoad, city]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const persistRow = useCallback(
    async (localId: string, row: GridRowState) => {
      if (!rowReadyForApi(row, city)) return;

      const before = { ...row, _saving: false, _error: false };
      setRows((prev) => prev.map((r) => (r._localId === localId ? { ...r, _saving: true, _error: false } : r)));

      try {
        const payload = toSavePayload(row, city);
        let newId = row.id;

        if (row.id) {
          const res = await apiRequest("PUT", `/api/admin/analytics/${city}/low-ratings/${row.id}`, payload);
          const text = await res.text();
          if (!res.ok) throw new Error(parseApiErrorDetail(text) || text || "Update failed");
        } else {
          const res = await apiRequest("POST", `/api/admin/analytics/${city}/low-ratings`, payload);
          const text = await res.text();
          if (!res.ok) throw new Error(parseApiErrorDetail(text) || text || "Create failed");
          try {
            const body = JSON.parse(text) as { id?: number };
            if (typeof body.id === "number") newId = body.id;
          } catch {
            /* ignore */
          }
        }

        setRows((prev) =>
          prev.map((r) =>
            r._localId === localId ? { ...r, id: newId ?? r.id, _saving: false, _error: false } : r,
          ),
        );
        await refetch();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Save failed";
        setRows((prev) =>
          prev.map((r) => (r._localId === localId ? { ...before, _error: true, _saving: false } : r)),
        );
        setError(msg);
      }
    },
    [city, refetch],
  );

  const updateCell = useCallback(
    (localId: string, key: DataColumnKey, value: unknown) => {
      setRows((prev) => {
        const next = prev.map((r) => (r._localId === localId ? applyCellEdit(r, key, value) : r));
        const merged = next.find((r) => r._localId === localId);
        // Draft rows (never saved) skip auto-persist — user must click "Save" explicitly
        if (merged && !merged._isDraft) {
          const snapshot = { ...merged };
          queueMicrotask(() => void persistRow(localId, snapshot));
        }
        return next;
      });
    },
    [persistRow],
  );

  /** Save a draft row to the API and clear its draft flag. */
  const commitDraft = useCallback(
    async (localId: string) => {
      const row = rowsRef.current.find((r) => r._localId === localId);
      if (!row) return;
      // Clear draft flag first so the row looks committed in the UI immediately
      setRows((prev) => prev.map((r) => (r._localId === localId ? { ...r, _isDraft: false } : r)));
      await persistRow(localId, { ...row, _isDraft: false });
    },
    [persistRow],
  );

  const addRow = useCallback(() => {
    const localId =
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `new-${Date.now()}`;
    // Prepend so the new row is visible at the top (headers always in view)
    setRows((prev) => [newEmptyRow(city, localId), ...prev]);
    queueMicrotask(() => {
      document.querySelector<HTMLButtonElement>(`[data-lr-focus="${localId}-order_date"]`)?.click();
    });
    return localId;
  }, [city]);

  const deleteRow = useCallback(
    async (localId: string) => {
      const row = rowsRef.current.find((r) => r._localId === localId);
      if (!row?.id) {
        setRows((prev) => prev.filter((r) => r._localId !== localId));
        return;
      }
      setRows((prev) => prev.map((r) => (r._localId === localId ? { ...r, _saving: true, _error: false } : r)));
      try {
        const res = await apiRequest("DELETE", `/api/admin/analytics/${city}/low-ratings/${row.id}`);
        const text = await res.text();
        if (!res.ok) throw new Error(parseApiErrorDetail(text) || text || "Delete failed");
        setRows((prev) => prev.filter((r) => r._localId !== localId));
        await refetch();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Delete failed";
        setRows((prev) =>
          prev.map((r) => (r._localId === localId ? { ...r, _saving: false, _error: true } : r)),
        );
        setError(msg);
      }
    },
    [city, refetch],
  );

  return {
    rows,
    loading,
    error,
    setError,
    total,
    ratingCounts,
    refetch,
    addRow,
    deleteRow,
    updateCell,
    commitDraft,
  };
}
