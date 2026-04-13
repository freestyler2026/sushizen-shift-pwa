"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";

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
import { ISSUE_CATEGORIES, RATING_LABELS, type LowRatingCity, type LowRatingRow } from "@/types/lowRating";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { LowRatingFormModal } from "@/components/analytics/LowRatingFormModal";

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

type FilterState = {
  dateFrom: string;
  dateTo: string;
  aggregator: string;
  branch: string;
  ratingFilter: number;
  issueCategory: string;
};

type ListResp = {
  ok?: boolean;
  rows: LowRatingRow[];
  total: number;
  rating_counts?: Record<string, number>;
};

const PAGE_SIZE = 50;

function ratingClass(r: number): string {
  if (r <= 1) return "text-red-400 font-semibold";
  if (r === 2) return "text-orange-400 font-semibold";
  return "text-amber-300 font-semibold";
}

function clip(text: string, max: number) {
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function scrollToElementId(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function LowRatingsCard({
  city,
  title,
  approverName,
  pin,
  stepUpReady,
  active,
  defaultDateFrom,
  defaultDateTo,
  backToCardsTargetId,
  backToCardsLabel = "Back to dataset cards",
}: {
  city: LowRatingCity;
  title: string;
  approverName: string;
  pin: string;
  stepUpReady: boolean;
  active: boolean;
  defaultDateFrom: string;
  defaultDateTo: string;
  /** When set (e.g. Manila overview id), show the same “back to cards” control as other dataset sections. */
  backToCardsTargetId?: string;
  backToCardsLabel?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<LowRatingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [ratingCounts, setRatingCounts] = useState<Record<string, number>>({ "1": 0, "2": 0, "3": 0 });
  const [offset, setOffset] = useState(0);
  const defaultFilters = useMemo(
    (): FilterState => ({
      dateFrom: defaultDateFrom,
      dateTo: defaultDateTo,
      aggregator: "",
      branch: "",
      ratingFilter: 0,
      issueCategory: "",
    }),
    [defaultDateFrom, defaultDateTo],
  );
  const [pending, setPending] = useState<FilterState>(defaultFilters);
  const [applied, setApplied] = useState<FilterState>(defaultFilters);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LowRatingRow | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

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
    });
    if (applied.dateFrom.trim()) p.set("date_from", applied.dateFrom.trim());
    if (applied.dateTo.trim()) p.set("date_to", applied.dateTo.trim());
    if (applied.aggregator.trim()) p.set("aggregator", applied.aggregator.trim().toLowerCase());
    if (applied.branch.trim()) p.set("branch", applied.branch.trim());
    if (applied.ratingFilter > 0) p.set("rating", String(applied.ratingFilter));
    if (applied.issueCategory.trim()) p.set("issue_category", applied.issueCategory.trim());
    return p.toString();
  }, [approverName, pin, offset, applied]);

  const load = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest("GET", `/api/admin/analytics/${city}/low-ratings?${buildQs()}`);
      const text = await res.text();
      if (!res.ok) {
        throw new Error(parseApiErrorDetail(text) || text || "Failed to load");
      }
      const data = JSON.parse(text) as ListResp;
      setRows(data.rows || []);
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
          `/api/admin/analytics/${city}/low-ratings/${editing.id}`,
          payload,
        );
        const text = await res.text();
        if (!res.ok) throw new Error(parseApiErrorDetail(text) || text || "Update failed");
      } else {
        const res = await apiRequest("POST", `/api/admin/analytics/${city}/low-ratings`, payload);
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

  async function handleDelete(row: LowRatingRow) {
    if (!window.confirm(`Delete low rating #${row.id}?`)) return;
    const res = await apiRequest("DELETE", `/api/admin/analytics/${city}/low-ratings/${row.id}`);
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
    <div
      id={`low-ratings-${city}`}
      className={GLASS_CARD + " scroll-mt-24 overflow-hidden"}
    >
      <div className="flex flex-col gap-3 border-b border-white/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <h2 className={T_SECTION}>{title}</h2>
        </div>
        <button
          type="button"
          className={PRIMARY_BUTTON + " inline-flex items-center gap-2 self-start sm:self-auto"}
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          disabled={!canLoad || loading}
        >
          <Plus className="h-4 w-4" />
          New entry
        </button>
      </div>

      <div className="space-y-3 px-5 py-4">
        <p className={T_CAPTION}>
          Aggregator reviews rated 1–3. Filters apply to the list and the rating summary below.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <label className="block min-w-0">
            <div className={T_LABEL}>From</div>
            <input
              type="date"
              value={pending.dateFrom}
              onChange={(e) => setPending((p) => ({ ...p, dateFrom: e.target.value }))}
              className={"mt-1 w-full " + INPUT_CLASS}
            />
          </label>
          <label className="block min-w-0">
            <div className={T_LABEL}>To</div>
            <input
              type="date"
              value={pending.dateTo}
              onChange={(e) => setPending((p) => ({ ...p, dateTo: e.target.value }))}
              className={"mt-1 w-full " + INPUT_CLASS}
            />
          </label>
          <label className="block min-w-0">
            <div className={T_LABEL}>Aggregator</div>
            <input
              type="text"
              value={pending.aggregator}
              onChange={(e) => setPending((p) => ({ ...p, aggregator: e.target.value }))}
              placeholder="e.g. foodpanda"
              className={"mt-1 w-full " + INPUT_CLASS}
            />
          </label>
          <label className="block min-w-0">
            <div className={T_LABEL}>Branch</div>
            <input
              type="text"
              value={pending.branch}
              onChange={(e) => setPending((p) => ({ ...p, branch: e.target.value }))}
              className={"mt-1 w-full " + INPUT_CLASS}
            />
          </label>
          <label className="block min-w-0">
            <div className={T_LABEL}>Rating</div>
            <select
              value={pending.ratingFilter}
              onChange={(e) => setPending((p) => ({ ...p, ratingFilter: Number(e.target.value) }))}
              className={"mt-1 w-full " + SELECT_CLASS}
            >
              <option value={0}>All</option>
              <option value={1}>{RATING_LABELS[1]}</option>
              <option value={2}>{RATING_LABELS[2]}</option>
              <option value={3}>{RATING_LABELS[3]}</option>
            </select>
          </label>
          <label className="block min-w-0">
            <div className={T_LABEL}>Issue</div>
            <select
              value={pending.issueCategory}
              onChange={(e) => setPending((p) => ({ ...p, issueCategory: e.target.value }))}
              className={"mt-1 w-full " + SELECT_CLASS}
            >
              <option value="">All</option>
              {ISSUE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={SECONDARY_BUTTON} onClick={() => applyFilters()} disabled={!canLoad || loading}>
            Apply filters
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON}
            onClick={() => {
              setPending(defaultFilters);
              setApplied(defaultFilters);
              setOffset(0);
            }}
            disabled={loading}
          >
            Reset
          </button>
        </div>

        <div className="flex flex-wrap gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
          <span className="text-zinc-300">
            Total matching: <span className="font-semibold text-white tabular-nums">{total}</span>
          </span>
          <span className="text-zinc-500">|</span>
          <span className={ratingClass(1)}>
            {RATING_LABELS[1]}: {ratingCounts["1"]}
          </span>
          <span className={ratingClass(2)}>
            {RATING_LABELS[2]}: {ratingCounts["2"]}
          </span>
          <span className={ratingClass(3)}>
            {RATING_LABELS[3]}: {ratingCounts["3"]}
          </span>
        </div>

        {error ? <p className={T_BODY + " text-red-400"}>{error}</p> : null}

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/3">
                <tr>
                  <th className={TABLE_HEADER + " px-3 py-3"}>Date</th>
                  <th className={TABLE_HEADER + " px-3 py-3"}>Agg</th>
                  <th className={TABLE_HEADER + " px-3 py-3"}>Branch</th>
                  <th className={TABLE_HEADER + " px-3 py-3"}>Items</th>
                  <th className={TABLE_HEADER + " px-3 py-3"}>Rating</th>
                  <th className={TABLE_HEADER + " px-3 py-3"}>Review</th>
                  <th className={TABLE_HEADER + " px-3 py-3"}>Issue</th>
                  <th className={TABLE_HEADER + " px-3 py-3"}>PIC</th>
                  <th className={TABLE_HEADER + " px-3 py-3 w-[100px]"}> </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={TABLE_ROW}>
                    <td className={TABLE_CELL + " px-3 whitespace-nowrap"}>
                      {row.order_date ? String(row.order_date).slice(0, 10) : "—"}
                    </td>
                    <td className={TABLE_CELL + " px-3"}>{row.aggregator}</td>
                    <td className={TABLE_CELL + " px-3"}>{row.branch || "—"}</td>
                    <td className={TABLE_CELL + " px-3 max-w-[220px]"} title={row.ordered_items}>
                      {clip(row.ordered_items, 80)}
                    </td>
                    <td className={TABLE_CELL + " px-3 tabular-nums " + ratingClass(Number(row.rating))}>
                      {RATING_LABELS[Number(row.rating)] || row.rating}
                    </td>
                    <td className={TABLE_CELL + " px-3 max-w-[200px]"} title={row.customer_review}>
                      {clip(row.customer_review, 60) || "—"}
                    </td>
                    <td className={TABLE_CELL + " px-3"}>{row.issue_category || "—"}</td>
                    <td className={TABLE_CELL + " px-3"}>{row.pic || "—"}</td>
                    <td className={TABLE_CELL + " px-3"}>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-violet-300 hover:bg-white/10"
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
                {!rows.length ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center">
                      <EmptyState message="No low ratings in this range" />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE_SIZE ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={T_CAPTION}>
              Page {pageIndex + 1} of {pageMax + 1} · {PAGE_SIZE} per page
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={offset <= 0 || loading}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Previous
              </button>
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={offset + PAGE_SIZE >= total || loading}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}

        {backToCardsTargetId ? (
          <div className="mt-4 flex justify-end border-t border-white/5 pt-3">
            <button
              type="button"
              onClick={() => scrollToElementId(backToCardsTargetId)}
              className="rounded-lg px-2 py-1 text-xs font-medium text-violet-300 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60"
            >
              {backToCardsLabel}
            </button>
          </div>
        ) : null}
      </div>

      {modalOpen ? (
        <LowRatingFormModal
          city={city}
          initial={editing}
          busy={saveBusy}
          onClose={() => {
            if (!saveBusy) {
              setModalOpen(false);
              setEditing(null);
            }
          }}
          onSave={handleSave}
        />
      ) : null}
    </div>
  );
}
