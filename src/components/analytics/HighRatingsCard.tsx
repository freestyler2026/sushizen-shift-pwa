"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";

import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import {
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  T_SECTION,
} from "@/lib/ui-tokens";
import {
  DUBAI_AGGREGATORS,
  DUBAI_BRANCHES,
  MANILA_AGGREGATORS,
  MANILA_BRANCHES,
  type HighRatingRow,
  type LowRatingCity,
} from "@/types/lowRating";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { HighRatingFormModal } from "@/components/analytics/HighRatingFormModal";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") { const _devBase = process.env.NEXT_PUBLIC_API_BASE_URL; if (_devBase) return _devBase.replace(/\/+$/, ""); return "http://127.0.0.1:8000"; }
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

type FilterState = {
  dateFrom: string;
  dateTo: string;
  aggregator: string;
  branch: string;
  hideBoost: boolean;
};

type ListResp = {
  ok?: boolean;
  rows: HighRatingRow[];
  total: number;
};

const PAGE_SIZE = 50;

function clip(text: string, max: number) {
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function HighRatingsCard({
  city,
  title,
  approverName,
  pin,
  stepUpReady,
  active,
  defaultDateFrom,
  defaultDateTo,
  datesFollowParent = false,
}: {
  city: LowRatingCity;
  title: string;
  approverName: string;
  pin: string;
  stepUpReady: boolean;
  active: boolean;
  defaultDateFrom: string;
  defaultDateTo: string;
  /** Take the date range from the page's own filter instead of asking again.
   *  Two Apply buttons on one screen is one too many: the encoders reported
   *  re-filtering the same records repeatedly, and half of that was this card
   *  keeping its own dates. */
  datesFollowParent?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<HighRatingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const defaultFilters = useMemo(
    (): FilterState => ({
      dateFrom: defaultDateFrom,
      dateTo: defaultDateTo,
      aggregator: "",
      branch: "",
      hideBoost: true,
    }),
    [defaultDateFrom, defaultDateTo],
  );
  const [pending, setPending] = useState<FilterState>(defaultFilters);
  const [applied, setApplied] = useState<FilterState>(defaultFilters);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HighRatingRow | null>(null);

  // Following the page filter means there is nothing left to press Apply for,
  // so the remaining choices take effect as they are made.
  const setFilter = useCallback((patch: Partial<FilterState>) => {
    setPending((p) => ({ ...p, ...patch }));
    if (datesFollowParent) {
      setApplied((a) => ({ ...a, ...patch }));
      setOffset(0);
    }
  }, [datesFollowParent]);

  useEffect(() => {
    if (!datesFollowParent) return;
    setPending((p) => ({ ...p, dateFrom: defaultDateFrom, dateTo: defaultDateTo }));
    setApplied((a) => ({ ...a, dateFrom: defaultDateFrom, dateTo: defaultDateTo }));
    setOffset(0);
  }, [datesFollowParent, defaultDateFrom, defaultDateTo]);
  const [saveBusy, setSaveBusy] = useState(false);
  const [reviewModalText, setReviewModalText] = useState<string | null>(null);

  const aggregatorFilterOptions = useMemo(() => {
    const defaults = city === "manila" ? [...MANILA_AGGREGATORS] : [...DUBAI_AGGREGATORS];
    const cur = pending.aggregator.trim();
    if (cur && !defaults.some((a) => a.toLowerCase() === cur.toLowerCase())) {
      return [cur, ...defaults];
    }
    return defaults;
  }, [city, pending.aggregator]);

  const branchFilterOptions = useMemo(() => {
    const defaults = city === "manila" ? [...MANILA_BRANCHES] : [...DUBAI_BRANCHES];
    const cur = pending.branch.trim();
    if (cur && !defaults.some((b) => b === cur)) {
      return [cur, ...defaults];
    }
    return defaults;
  }, [city, pending.branch]);

  useEffect(() => {
    setPending(defaultFilters);
    setApplied(defaultFilters);
    setOffset(0);
  }, [defaultFilters]);

  const canLoad = active && !!approverName.trim() && stepUpReady;

  const buildQs = useCallback(() => {
    const p = new URLSearchParams({
      approver_name: approverName.trim(),
      pin: pin.trim(),
      limit: String(PAGE_SIZE),
      offset: String(offset),
      include_boost: applied.hideBoost ? "false" : "true",
    });
    if (applied.dateFrom.trim()) p.set("date_from", applied.dateFrom.trim());
    if (applied.dateTo.trim()) p.set("date_to", applied.dateTo.trim());
    if (applied.aggregator.trim()) p.set("aggregator", applied.aggregator.trim().toLowerCase());
    if (applied.branch.trim()) p.set("branch", applied.branch.trim());
    return p.toString();
  }, [approverName, pin, offset, applied]);

  const load = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest("GET", `/api/admin/analytics/${city}/high-ratings?${buildQs()}`);
      const text = await res.text();
      if (!res.ok) {
        throw new Error(parseApiErrorDetail(text) || text || "Failed to load");
      }
      let data: ListResp;
      try {
        data = JSON.parse(text) as ListResp;
      } catch {
        throw new Error("Invalid response from server");
      }
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setTotal(Number(data.total || 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [buildQs, canLoad, city]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageMax = useMemo(() => Math.max(0, Math.ceil(total / PAGE_SIZE) - 1), [total]);
  const pageIndex = Math.floor(offset / PAGE_SIZE);

  async function handleSave(payload: Record<string, unknown>) {
    setSaveBusy(true);
    try {
      if (editing?.id) {
        const res = await apiRequest(
          "PUT",
          `/api/admin/analytics/${city}/high-ratings/${editing.id}`,
          payload,
        );
        const text = await res.text();
        if (!res.ok) throw new Error(parseApiErrorDetail(text) || text || "Update failed");
      } else {
        const res = await apiRequest("POST", `/api/admin/analytics/${city}/high-ratings`, payload);
        const text = await res.text();
        if (!res.ok) throw new Error(parseApiErrorDetail(text) || text || "Create failed");
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleDelete(row: HighRatingRow) {
    if (!window.confirm(`Delete high rating #${row.id}?`)) return;
    const res = await apiRequest("DELETE", `/api/admin/analytics/${city}/high-ratings/${row.id}`);
    const text = await res.text();
    if (!res.ok) {
      setError(parseApiErrorDetail(text) || text || "Delete failed");
      return;
    }
    await load();
  }

  function applyFilters() {
    setApplied(pending);
    setOffset(0);
  }

  return (
    <div id={`high-ratings-${city}`} className={GLASS_CARD + " scroll-mt-24 overflow-hidden"}>
      <div className="flex flex-col gap-3 border-b border-white/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
          <h2 className={T_SECTION}>{title}</h2>
        </div>
        <button
          type="button"
          className={PRIMARY_BUTTON + " inline-flex items-center gap-2 self-start sm:self-auto"}
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Add 5-star review
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 border-b border-white/5 px-5 py-3">
        {datesFollowParent ? (
          <div className="flex flex-col gap-1">
            <span className={T_LABEL}>Dates</span>
            <span className="text-sm tabular-nums text-zinc-300">
              {applied.dateFrom} → {applied.dateTo}
              <span className={T_CAPTION + " ml-2"}>from the filter above</span>
            </span>
          </div>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className={T_LABEL}>From</span>
              <input
                type="date"
                value={pending.dateFrom}
                onChange={(e) => setPending((p) => ({ ...p, dateFrom: e.target.value }))}
                className={INPUT_CLASS + " w-36"}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={T_LABEL}>To</span>
              <input
                type="date"
                value={pending.dateTo}
                onChange={(e) => setPending((p) => ({ ...p, dateTo: e.target.value }))}
                className={INPUT_CLASS + " w-36"}
              />
            </label>
          </>
        )}
        <label className="flex flex-col gap-1">
          <span className={T_LABEL}>Aggregator</span>
          <select
            value={pending.aggregator}
            onChange={(e) => setFilter({ aggregator: e.target.value })}
            className={SELECT_CLASS + " w-32"}
          >
            <option value="">All</option>
            {aggregatorFilterOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={T_LABEL}>Branch</span>
          <select
            value={pending.branch}
            onChange={(e) => setFilter({ branch: e.target.value })}
            className={SELECT_CLASS + " w-36"}
          >
            <option value="">All</option>
            {branchFilterOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2 self-end pb-0.5">
          <input
            id={`hide-boost-${city}`}
            type="checkbox"
            checked={pending.hideBoost}
            onChange={(e) => setFilter({ hideBoost: e.target.checked })}
            className="h-4 w-4 rounded border border-white/20 bg-white/10 accent-amber-400"
          />
          <label htmlFor={`hide-boost-${city}`} className={T_LABEL + " cursor-pointer whitespace-nowrap"}>
            Hide rating boost
          </label>
        </div>
        {datesFollowParent ? null : (
          <>
            <button type="button" onClick={applyFilters} className={PRIMARY_BUTTON + " self-end"}>
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                setPending(defaultFilters);
                setApplied(defaultFilters);
                setOffset(0);
              }}
              className={SECONDARY_BUTTON + " self-end"}
            >
              Reset
            </button>
          </>
        )}
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-4 px-5 py-3 border-b border-white/5">
        <div>
          <span className={T_CAPTION}>Total shown</span>
          <div className="text-lg font-semibold tabular-nums text-white">{total}</div>
        </div>
        {!applied.hideBoost && (
          <div>
            <span className={T_CAPTION}>Showing</span>
            <div className="text-sm text-amber-300">incl. rating boost orders</div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-5 py-3">
          <p className={T_BODY + " text-red-400"}>{error}</p>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState message={canLoad ? "No high ratings found." : "Auth required to load data."} />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/3">
              <tr>
                <th className={TABLE_HEADER + " px-3 py-3"}>Date</th>
                <th className={TABLE_HEADER + " px-3 py-3"}>Time</th>
                <th className={TABLE_HEADER + " px-3 py-3"}>Order ID</th>
                <th className={TABLE_HEADER + " px-3 py-3"}>Agg</th>
                <th className={TABLE_HEADER + " px-3 py-3"}>Branch</th>
                <th className={TABLE_HEADER + " px-3 py-3"}>Items</th>
                <th className={TABLE_HEADER + " px-3 py-3"}>Customer</th>
                <th className={TABLE_HEADER + " px-3 py-3"}>Review</th>
                <th className={TABLE_HEADER + " px-3 py-3"}>PIC</th>
                <th className={TABLE_HEADER + " px-3 py-3 w-[100px]"}> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={
                    TABLE_ROW +
                    (row.is_rating_boost ? " bg-amber-950/20" : "")
                  }
                >
                  <td className={TABLE_CELL + " px-3 whitespace-nowrap"}>
                    {row.order_date ? String(row.order_date).slice(0, 10) : "—"}
                  </td>
                  <td className={TABLE_CELL + " px-3 whitespace-nowrap tabular-nums"}>
                    {row.order_time ? String(row.order_time).slice(0, 5) : "—"}
                  </td>
                  <td className={TABLE_CELL + " px-3 whitespace-nowrap font-mono text-xs"}>
                    {row.order_id || "—"}
                  </td>
                  <td className={TABLE_CELL + " px-3"}>{row.aggregator}</td>
                  <td className={TABLE_CELL + " px-3"}>{row.branch || "—"}</td>
                  <td
                    className={
                      TABLE_CELL +
                      " px-3 max-w-[200px]" +
                      (row.is_rating_boost ? " text-amber-400" : "")
                    }
                    title={row.ordered_items + (row.is_rating_boost ? " [Rating Boost]" : "")}
                  >
                    {clip(row.ordered_items, 70)}
                    {row.is_rating_boost && (
                      <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-amber-500">
                        boost
                      </span>
                    )}
                  </td>
                  <td className={TABLE_CELL + " px-3"}>{row.customer_name || "—"}</td>
                  <td
                    className={TABLE_CELL + " px-3 max-w-[200px] cursor-pointer hover:text-yellow-300 transition-colors"}
                    title="Click to read full review"
                    onClick={() =>
                      row.customer_review && String(row.customer_review).trim()
                        ? setReviewModalText(String(row.customer_review).trim())
                        : undefined
                    }
                  >
                    {clip(row.customer_review, 60) || "—"}
                  </td>
                  <td className={TABLE_CELL + " px-3"}>{row.pic || "—"}</td>
                  <td className={TABLE_CELL + " px-3"}>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-yellow-300 hover:bg-white/10"
                        title="Edit"
                        onClick={() => {
                          setEditing(row);
                          setModalOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-red-400 hover:bg-white/10"
                        title="Delete"
                        onClick={() => void handleDelete(row)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-white/5 px-5 py-3">
          <p className={T_CAPTION}>
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={pageIndex === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Prev
            </button>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={pageIndex >= pageMax}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Review full-text modal */}
      {reviewModalText && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setReviewModalText(null)}
        >
          <div
            className={GLASS_CARD + " max-w-md w-full p-5"}
            onClick={(ev) => ev.stopPropagation()}
          >
            <h3 className={T_SECTION + " mb-3"}>Customer review</h3>
            <p className={T_BODY + " whitespace-pre-wrap"}>{reviewModalText}</p>
            <button
              type="button"
              className={SECONDARY_BUTTON + " mt-4"}
              onClick={() => setReviewModalText(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Form modal */}
      {modalOpen && (
        <HighRatingFormModal
          city={city}
          initial={editing}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSave={handleSave}
          busy={saveBusy}
        />
      )}
    </div>
  );
}
