"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Mail,
  RefreshCw,
  Search,
  TicketCheck,
  X,
} from "lucide-react";
import { getAuth, getAuthHeaders, tryRefreshAccessToken } from "@/lib/auth";
import {
  GLASS_CARD,
  KPI_CARD,
  PRIMARY_BUTTON,
  SELECT_CLASS,
  SMALL_BUTTON,
  T_LABEL,
  T_PAGE_TITLE,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

// ── API helpers ────────────────────────────────────────────────────────────

function getApiBase() {
  if (process.env.NODE_ENV !== "production") { const _devBase = process.env.NEXT_PUBLIC_API_BASE_URL; if (_devBase) return _devBase.replace(/\/+$/, ""); return "http://127.0.0.1:8000"; }
  return "";
}

async function apiGet<T = unknown>(path: string): Promise<T> {
  const request = async () =>
    fetch(`${getApiBase()}${path}`, { cache: "no-store", headers: getAuthHeaders() });
  let res = await request();
  let text = await res.text();
  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) { res = await request(); text = await res.text(); }
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = JSON.parse(text); msg = j?.detail || j?.message || msg; } catch { if (text) msg = text; }
    throw new Error(msg);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const request = async () =>
    fetch(`${getApiBase()}${path}`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  let res = await request();
  let text = await res.text();
  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) { res = await request(); text = await res.text(); }
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = JSON.parse(text); msg = j?.detail || j?.message || msg; } catch { if (text) msg = text; }
    throw new Error(msg);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function apiPatch<T = unknown>(path: string, body: unknown): Promise<T> {
  const request = async () =>
    fetch(`${getApiBase()}${path}`, {
      method: "PATCH",
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
    });
  let res = await request();
  let text = await res.text();
  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) { res = await request(); text = await res.text(); }
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = JSON.parse(text); msg = j?.detail || j?.message || msg; } catch { if (text) msg = text; }
    throw new Error(msg);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ── Types ──────────────────────────────────────────────────────────────────

// Unified row type used throughout the UI
type CancelRow = {
  id: number;
  platform: string;
  incident_date: string;
  branch: string;
  brand: string | null;
  category: string | null;
  order_id: string | null;
  time_reported: string | null;
  ordered_items: string | null;
  basket_amount: number | null;   // Manila: food order value (paid_price field)
  total_amount: number | null;
  refund_amount: number | null;
  compensation_amount: number | null;
  cancellation_reason: string | null;
  encoded_by: string | null;
  customer_note: string | null;
  photo_status: string | null;
  double_checked_by: string | null;
  email_status: string | null;
  kitchen_notes: string | null;
  platform_notes: string | null;
  refund_status: string | null;
  pic_notes: string | null;
  workflow_status: string | null;
  no_refund_reason: string | null;
  photo_upload_urls: string[] | null;
  grab_refund_reason: string | null;
  grab_synced_at: string | null;
};

// Shape returned by Manila API (different field names)
type ManilaApiRow = {
  id: number;
  platform: string;
  incident_date: string;
  branch: string;
  brand?: string | null;
  category?: string | null;
  order_no?: string | null;
  time_reported?: string | null;
  ordered_items?: string | null;
  paid_price?: number | null;
  refund_amount?: number | null;
  compensation_amount?: number | null;
  cancellation_reason?: string | null;
  kitchen_photo_provided?: boolean | null;
  ticket_status?: string | null;
  recorded_by?: string | null;
  refund_status?: string | null;
  pic_notes?: string | null;
  workflow_status?: string | null;
  no_refund_reason?: string | null;
  photo_upload_urls?: string | null;
  grab_refund_reason?: string | null;
  grab_synced_at?: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizeManilaRow(r: ManilaApiRow): CancelRow {
  return {
    id: r.id,
    platform: r.platform,
    incident_date: r.incident_date,
    branch: r.branch,
    brand: r.brand ?? null,
    category: r.category ?? null,
    order_id: r.order_no ?? null,
    time_reported: r.time_reported ?? null,
    ordered_items: r.ordered_items ?? null,
    basket_amount: r.paid_price ?? null,     // food order value
    total_amount: null,
    refund_amount: r.refund_amount ?? null,  // actual refund amount
    compensation_amount: r.compensation_amount ?? null,
    cancellation_reason: r.cancellation_reason ?? null,
    encoded_by: r.recorded_by ?? null,
    customer_note: null,
    photo_status:
      r.kitchen_photo_provided != null
        ? r.kitchen_photo_provided ? "Provided" : "Not Provided"
        : null,
    double_checked_by: null,
    email_status: r.ticket_status ?? null,
    kitchen_notes: null,
    platform_notes: null,
    refund_status: r.refund_status ?? null,
    pic_notes: r.pic_notes ?? null,
    workflow_status: r.workflow_status ?? null,
    no_refund_reason: r.no_refund_reason ?? null,
    grab_refund_reason: r.grab_refund_reason ?? null,
    grab_synced_at: r.grab_synced_at ?? null,
    photo_upload_urls: (() => {
      try {
        const raw = r.photo_upload_urls;
        if (!raw) return null;
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
      } catch { return null; }
    })(),
  };
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysAgoIso(n: number) {
  const [y, m, day] = todayIso().split("-").map(Number);
  const utc = Date.UTC(y, m - 1, day - n);
  return new Date(utc).toISOString().slice(0, 10);
}
function fmtDate(s: string) {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y?.slice(2)}`;
}
function fmtAed(n: number | null | undefined) {
  if (n == null || n === 0) return "—";
  return `AED ${Number(n).toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function fmtPhp(n: number | null | undefined) {
  if (n == null || n === 0) return "—";
  return `PHP ${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const DUBAI_PLATFORM_COLORS: Record<string, string> = {
  Careem: "#00c896", Keeta: "#ff6b35", Talabat: "#ff2d55",
};
const DUBAI_BRANCH_COLORS: Record<string, string> = {
  "Business Bay": "#6366f1", Arjan: "#10b981", "Al Barsha": "#f59e0b",
  "Al Hudaiba": "#ec4899", JLT: "#8b5cf6",
};
const MANILA_PLATFORM_COLORS: Record<string, string> = {
  GrabFood: "#00b14f", FoodPanda: "#d70f64",
};
const MANILA_BRANCH_COLORS: Record<string, string> = {
  Paranaque: "#6366f1", Taft: "#10b981", Cubao: "#f59e0b",
};

function isTicketSent(email_status: string | null): boolean {
  const s = (email_status ?? "").toLowerCase();
  return s.includes("sent") || s.includes("email");
}
function isResolved(refund_status: string | null): boolean {
  return (refund_status ?? "").trim().length > 0;
}
function isPending(row: CancelRow): boolean {
  return isTicketSent(row.email_status) && !isResolved(row.refund_status);
}
function isOverdue(row: CancelRow): boolean {
  if (row.workflow_status === "Completed") return false;
  if (!row.incident_date) return false;
  return row.incident_date <= daysAgoIso(7);
}

const WORKFLOW_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  "Waiting for Photo": { bg: "#f59e0b1a", text: "#fbbf24" },
  "Ticket Submitted": { bg: "#6366f11a", text: "#a5b4fc" },
  "Waiting for Refund Confirmation": { bg: "#f973161a", text: "#fb923c" },
  "Refund Confirmed": { bg: "#10b9811a", text: "#34d399" },
  "No Refund": { bg: "#ef44441a", text: "#f87171" },
  "Completed": { bg: "#22c55e1a", text: "#86efac" },
};

function WorkflowBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-white/20">—</span>;
  const color = WORKFLOW_STATUS_COLORS[status] ?? { bg: "#ffffff10", text: "#ffffff60" };
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      {status}
    </span>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────

function DetailModal({
  row,
  onClose,
  platformColors,
  branchColors,
  city,
  canApproveHq,
  onWorkflowUpdate,
}: {
  row: CancelRow;
  onClose: () => void;
  platformColors: Record<string, string>;
  branchColors: Record<string, string>;
  city: "dubai" | "manila";
  canApproveHq?: boolean;
  onWorkflowUpdate?: (recordId: number, updates: Record<string, unknown>) => void;
}) {
  const isCancel = row.category === "Cancellation";
  const pc = platformColors[row.platform] ?? "#888";
  const bc = branchColors[row.branch] ?? "#ccc";

  function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
    const v = (value ?? "").trim();
    return (
      <div>
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">{label}</p>
        <p className={`text-sm ${mono ? "font-mono" : ""} ${v ? "text-white/80" : "text-white/20"}`}>
          {v || "—"}
        </p>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-neutral-900 px-5 py-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: `${pc}20`, color: pc, border: `1px solid ${pc}40` }}
            >
              {row.platform}
            </span>
            <span className="font-mono text-sm font-semibold text-white">{row.order_id || "—"}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${isCancel ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}`}
            >
              {row.category ?? "—"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* Row 1: Date / Branch / Brand */}
          <div className="grid grid-cols-3 gap-4">
            <Field label="Date" value={fmtDate(row.incident_date)} />
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">Branch</p>
              <p className="text-sm font-medium" style={{ color: bc }}>{row.branch || "—"}</p>
            </div>
            <Field label="Brand" value={row.brand} />
          </div>

          {/* Row 2: Amount fields — city-aware */}
          {city === "dubai" ? (
            <div className="grid grid-cols-4 gap-4">
              <Field label="Time" value={row.time_reported} />
              <Field label="Basket (AED)" value={row.basket_amount != null ? String(row.basket_amount) : null} mono />
              <Field label="Total (AED)" value={row.total_amount != null ? String(row.total_amount) : null} mono />
              <Field label="Refund (AED)" value={row.refund_amount != null ? String(row.refund_amount) : null} mono />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <Field label="Time" value={row.time_reported} />
              <Field label="Food Order Value (PHP)" value={row.basket_amount != null ? String(row.basket_amount) : null} mono />
              <Field label="Refund (PHP)" value={row.refund_amount != null ? String(row.refund_amount) : null} mono />
            </div>
          )}

          {/* Ordered Items */}
          {row.ordered_items && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">Ordered Items</p>
              <p className="rounded-lg border border-white/8 bg-white/4 px-3 py-2.5 text-sm text-white/80 whitespace-pre-wrap">
                {row.ordered_items}
              </p>
            </div>
          )}

          {/* Cancellation Reason + Encoded/Recorded By */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Cancellation Reason" value={row.cancellation_reason} />
            <Field label={city === "dubai" ? "Encoded By" : "Recorded By"} value={row.encoded_by} />
          </div>

          {/* Customer Note (Dubai only) */}
          {city === "dubai" && row.customer_note && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">Customer Note</p>
              <p className="rounded-lg border border-white/8 bg-white/4 px-3 py-2.5 text-sm text-white/70 whitespace-pre-wrap">
                {row.customer_note}
              </p>
            </div>
          )}

          {/* Photo / Double Checked */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Photo Status" value={row.photo_status} />
            {city === "dubai" && <Field label="Double Checked By" value={row.double_checked_by} />}
          </div>

          {/* Kitchen / Platform Notes (Dubai only) */}
          {city === "dubai" && (row.kitchen_notes || row.platform_notes) && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Kitchen Notes" value={row.kitchen_notes} />
              <Field label="Platform Response Notes" value={row.platform_notes} />
            </div>
          )}

          {/* Ticket / Refund Status */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Ticket Status" value={row.email_status} />
            <Field label="Refund Status" value={row.refund_status} />
          </div>

          {/* Workflow Status (Manila) */}
          {city === "manila" && (
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">Workflow Status</p>
                <WorkflowBadge status={row.workflow_status} />
              </div>
              {row.no_refund_reason && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">No Refund Reason</p>
                  <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-sm text-white/80 whitespace-pre-wrap">
                    {row.no_refund_reason}
                  </p>
                </div>
              )}
              {canApproveHq && row.workflow_status === "No Refund" && onWorkflowUpdate && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                  <span className="flex-1 text-xs text-amber-300">Pending HQ review — approve or revert this No Refund decision.</span>
                  <button
                    type="button"
                    onClick={() => onWorkflowUpdate(row.id, { hq_action: "approved" })}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => onWorkflowUpdate(row.id, { hq_action: "reverted" })}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Revert
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Grab settlement evidence — why this was confirmed automatically */}
          {row.grab_synced_at && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">Grab Settlement</p>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-sm text-white/80">
                <p>{row.grab_refund_reason || "Matched in Grab transaction data"}</p>
                <p className="mt-1 text-xs text-white/40">
                  Confirmed from Grab transaction data on {row.grab_synced_at.slice(0, 10)}
                </p>
              </div>
            </div>
          )}

          {/* PIC Notes */}
          {row.pic_notes && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">PIC Notes</p>
              <p className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2.5 text-sm text-white/80 whitespace-pre-wrap">
                {row.pic_notes}
              </p>
            </div>
          )}

          {/* Staff-uploaded Photos (Manila) */}
          {city === "manila" && row.photo_upload_urls && row.photo_upload_urls.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">Supporting Photos</p>
              <div className="flex flex-col gap-2">
                {row.photo_upload_urls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-blue-400 hover:text-blue-300 hover:border-blue-500/40 hover:bg-blue-500/10 transition-colors"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    Photo {i + 1}
                    <svg className="w-3 h-3 ml-auto shrink-0 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Full-text note modal ───────────────────────────────────────────────────

function TextCell({ text }: { text: string | null }) {
  const [open, setOpen] = useState(false);
  const val = (text ?? "").trim();
  if (!val) return <span className="text-white/20">—</span>;
  const isLong = val.length > 50;
  return (
    <>
      <span className="flex items-center gap-1.5">
        <span className={isLong ? "max-w-[150px] truncate" : ""}>{val}</span>
        {isLong && (
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(true); }}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-white/8 text-white/40 hover:bg-white/15 hover:text-white/80 transition-colors"
          >
            View
          </button>
        )}
      </span>
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Detail</p>
              <button onClick={() => setOpen(false)} className="rounded-full p-1 text-white/40 hover:bg-white/10 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-white/85 whitespace-pre-wrap break-words">{val}</p>
          </div>
        </div>
      )}
    </>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, sub, accent,
}: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <div className={KPI_CARD}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`${accent ?? "text-white/40"}`}>{icon}</span>
        <p className={`${T_LABEL}`}>{label}</p>
      </div>
      <p className={`text-2xl font-semibold ${accent ?? "text-white"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-white/30">{sub}</p>}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

const TICKET_STATUSES = [
  { value: "all",     label: "All Ticket Status" },
  { value: "sent",    label: "Ticket Sent" },
  { value: "no_need", label: "No Need to Send" },
  { value: "pending", label: "Pending (Sent, Unresolved)" },
  { value: "none",    label: "Not Sent" },
];

type SortKey = keyof CancelRow;

export default function CancellationReportPage() {
  const auth = getAuth();
  const approverName = auth?.staffName || "";
  const pin = auth?.pin || "";
  const userRole = auth?.role || "";
  const canApproveHq = userRole === "HQ" || userRole === "ADMIN";

  const [city, setCity] = useState<"dubai" | "manila">("dubai");
  const [dateFrom, setDateFrom] = useState(daysAgoIso(30));
  const [dateTo, setDateTo] = useState(todayIso());
  const [records, setRecords] = useState<CancelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Manila stats (no-refund pending, overdue)
  const [noRefundPending, setNoRefundPending] = useState(0);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncMsg, setSyncMsg] = useState("");

  // Filters
  const [filterBranch, setFilterBranch] = useState("All");
  const [filterPlatform, setFilterPlatform] = useState("All");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterTicket, setFilterTicket] = useState("all");
  const [filterResolution, setFilterResolution] = useState("all");
  const [search, setSearch] = useState("");

  // Sort
  const [sortCol, setSortCol] = useState<SortKey>("incident_date");
  const [sortAsc, setSortAsc] = useState(false);

  // Detail modal
  const [selectedRow, setSelectedRow] = useState<CancelRow | null>(null);

  // City-derived config
  const BRANCHES = city === "dubai"
    ? ["All", "Business Bay", "Arjan", "Al Barsha", "Al Hudaiba", "JLT"]
    : ["All", "Paranaque", "Taft", "Cubao"];
  const PLATFORMS = city === "dubai"
    ? ["All", "Careem", "Keeta", "Talabat"]
    : ["All", "GrabFood", "FoodPanda"];
  const CATEGORIES = city === "dubai"
    ? ["All", "Cancellation", "Refund/Complaint"]
    : ["All", "Cancellation", "Incident/Refund"];
  const activePlatformColors = city === "dubai" ? DUBAI_PLATFORM_COLORS : MANILA_PLATFORM_COLORS;
  const activeBranchColors = city === "dubai" ? DUBAI_BRANCH_COLORS : MANILA_BRANCH_COLORS;
  const fmtAmount = city === "dubai" ? fmtAed : fmtPhp;
  const amountLabel = city === "dubai" ? "Refund (AED)" : "Refund (PHP)";

  const canLoad = Boolean(approverName.trim() && pin.trim());

  // Reset city-dependent state when switching
  useEffect(() => {
    setFilterBranch("All");
    setFilterPlatform("All");
    setFilterCategory("All");
    setFilterResolution("all");
    setRecords([]);
    setLoaded(false);
    setError(null);
  }, [city]);

  const fetchRecords = useCallback(async () => {
    if (!canLoad) {
      setError("Authentication required. Please log in again.");
      return;
    }
    if (dateFrom > dateTo) {
      setError(`Invalid date range: "From" (${dateFrom}) must be on or before "To" (${dateTo}).`);
      return;
    }
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({
      approver_name: approverName.trim(),
      pin: pin.trim(),
      date_from: dateFrom,
      date_to: dateTo,
    }).toString();
    const endpoint = city === "dubai"
      ? `/api/admin/analytics/dubai/cancellations?${qs}`
      : `/api/admin/analytics/manila/cancellations?${qs}`;
    try {
      const res = await apiGet<{ ok?: boolean; items?: unknown[] }>(endpoint);
      const items = Array.isArray(res?.items) ? res.items : [];
      if (city === "manila") {
        setRecords((items as ManilaApiRow[]).map(normalizeManilaRow));
      } else {
        setRecords(items as CancelRow[]);
      }
      setLoaded(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [approverName, pin, dateFrom, dateTo, canLoad, city]);

  useEffect(() => { void fetchRecords(); }, [fetchRecords]);

  // Fetch Manila stats when viewing Manila
  useEffect(() => {
    if (city !== "manila" || !canLoad) return;
    const qs = new URLSearchParams({ approver_name: approverName.trim(), pin: pin.trim() }).toString();
    void apiGet<{ no_refund_pending?: number; overdue_count?: number }>(
      `/api/admin/analytics/manila/cancellations/stats?${qs}`,
    )
      .then((r) => setNoRefundPending(r.no_refund_pending ?? 0))
      .catch(() => { /* non-critical */ });
  }, [city, canLoad, approverName, pin]);

  const handleWorkflowUpdate = useCallback(
    async (recordId: number, updates: Record<string, unknown>) => {
      const qs = new URLSearchParams({ approver_name: approverName.trim(), pin: pin.trim() }).toString();
      try {
        const updated = await apiPatch<{ ok?: boolean; record?: ManilaApiRow }>(
          `/api/admin/analytics/manila/cancellations/${recordId}/workflow?${qs}`,
          updates,
        );
        if (updated.record) {
          const normalized = normalizeManilaRow(updated.record);
          setRecords((prev) => prev.map((r) => (r.id === recordId ? normalized : r)));
          setSelectedRow((prev) => (prev?.id === recordId ? normalized : prev));
        }
        // Refresh no-refund pending count
        const statsQs = new URLSearchParams({ approver_name: approverName.trim(), pin: pin.trim() }).toString();
        void apiGet<{ no_refund_pending?: number }>(`/api/admin/analytics/manila/cancellations/stats?${statsQs}`)
          .then((r) => setNoRefundPending(r.no_refund_pending ?? 0))
          .catch(() => { /* ignore */ });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Workflow update failed");
      }
    },
    [approverName, pin],
  );

  const handleGrabFinanceSync = async () => {
    setSyncStatus("syncing");
    setSyncMsg("");
    const qs = new URLSearchParams({ approver_name: approverName.trim(), pin: pin.trim() }).toString();
    try {
      const res = await apiPost<{ ok?: boolean; total_updated?: number; files_found?: number; total_not_found?: string[] }>(
        `/api/admin/analytics/manila/cancellations/grab-finance-sync?${qs}`,
      );
      setSyncStatus("done");
      setSyncMsg(`${res.files_found ?? 0} file(s) scanned · ${res.total_updated ?? 0} record(s) updated`);
      setTimeout(() => setSyncStatus("idle"), 6000);
      void fetchRecords();
    } catch (e: unknown) {
      setSyncStatus("error");
      setSyncMsg(e instanceof Error ? e.message : "Sync failed");
      setTimeout(() => setSyncStatus("idle"), 6000);
    }
  };

  // ── Filter + sort ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (filterBranch !== "All" && r.branch !== filterBranch) return false;
      if (filterPlatform !== "All" && r.platform !== filterPlatform) return false;
      if (filterCategory !== "All" && (r.category || "") !== filterCategory) return false;
      if (filterTicket === "sent" && !isTicketSent(r.email_status)) return false;
      if (filterTicket === "no_need") {
        const s = (r.email_status ?? "").toLowerCase();
        if (!s.includes("no need")) return false;
      }
      if (filterTicket === "pending" && !isPending(r)) return false;
      if (filterTicket === "none" && (isTicketSent(r.email_status) || (r.email_status ?? "").toLowerCase().includes("no need"))) return false;
      if (filterResolution === "resolved" && !isResolved(r.refund_status)) return false;
      if (filterResolution === "pending" && isResolved(r.refund_status)) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (r.order_id ?? "").toLowerCase().includes(q) ||
          (r.branch ?? "").toLowerCase().includes(q) ||
          (r.cancellation_reason ?? "").toLowerCase().includes(q) ||
          (r.email_status ?? "").toLowerCase().includes(q) ||
          (r.refund_status ?? "").toLowerCase().includes(q) ||
          (r.encoded_by ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [records, filterBranch, filterPlatform, filterCategory, filterTicket, filterResolution, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (sortCol === "refund_amount" || sortCol === "total_amount" || sortCol === "id") {
        const cmp = Number(av) - Number(bv);
        return sortAsc ? cmp : -cmp;
      }
      const cmp = String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortAsc]);

  function handleSort(col: SortKey) {
    if (col === sortCol) { setSortAsc((v) => !v); } else { setSortCol(col); setSortAsc(false); }
  }

  // ── KPI computation ──────────────────────────────────────────────────────

  const kpi = useMemo(() => {
    const totalRefund = filtered.reduce((s, r) => s + (Number(r.refund_amount) || 0), 0);
    const total = filtered.length;
    const ticketSent = filtered.filter(r => isTicketSent(r.email_status)).length;
    const resolved = filtered.filter(r => isResolved(r.refund_status)).length;
    const pending = filtered.filter(r => isPending(r)).length;
    const overdue = city === "manila" ? filtered.filter(r => isOverdue(r)).length : 0;
    return { totalRefund, total, ticketSent, resolved, pending, overdue };
  }, [filtered, city]);

  // ── CSV download ─────────────────────────────────────────────────────────

  function downloadCsv() {
    const amtCol = city === "dubai" ? "refund_aed" : "amount_php";
    const headers = ["date", "branch", "platform", "category", "order_id", amtCol, "reason", "ticket_status", "refund_status", "pic_notes"];
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      headers.join(","),
      ...sorted.map((r) => [
        r.incident_date, r.branch, r.platform, r.category ?? "",
        r.order_id ?? "", r.refund_amount ?? 0,
        esc(r.cancellation_reason), esc(r.email_status), esc(r.refund_status), esc(r.pic_notes),
      ].join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cancellations-${city}-${dateFrom}-${dateTo}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Ticket status badge ───────────────────────────────────────────────────

  function TicketBadge({ emailStatus }: { emailStatus: string | null }) {
    const s = (emailStatus ?? "").toLowerCase();
    if (s.includes("sent") || s.includes("email"))
      return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400"><CheckCircle2 className="h-3 w-3" />Sent</span>;
    if (s.includes("no need"))
      return <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-white/30">No Need</span>;
    if (s.length > 0)
      return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">{emailStatus}</span>;
    return <span className="text-white/20">—</span>;
  }

  // ── Columns ───────────────────────────────────────────────────────────────

  const COLS: { key: SortKey; label: string }[] = [
    { key: "incident_date",       label: "Date" },
    { key: "order_id",            label: "Order No." },
    { key: "branch",              label: "Branch" },
    { key: "platform",            label: "Platform" },
    { key: "category",            label: "Category" },
    { key: "refund_amount",       label: amountLabel },
    { key: "cancellation_reason", label: "Reason" },
    { key: "email_status",        label: "Ticket Status" },
    { key: "refund_status",       label: "Refund Status" },
    ...(city === "manila" ? [{ key: "workflow_status" as SortKey, label: "Workflow" }] : []),
  ];

  return (
    <main className="min-h-screen bg-neutral-950 pb-24 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Link href="/admin" className={`${SMALL_BUTTON} flex items-center gap-1.5 mt-1`}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
            <div>
              <h1 className={`${T_PAGE_TITLE} flex items-center gap-2`}>
                <TicketCheck className="h-8 w-8 text-violet-400" />
                Cancellation Report
              </h1>
              <p className="mt-1 text-sm text-white/40">
                {city === "dubai"
                  ? "Dubai · Careem / Keeta / Talabat — follow-up dashboard"
                  : "Manila · GrabFood / FoodPanda — follow-up dashboard"}
              </p>
            </div>
          </div>

          {/* City tabs + Date range + Load */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-xl border border-white/10">
              {(["dubai", "manila"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCity(c)}
                  className={[
                    "px-4 py-2 text-sm font-medium capitalize transition-colors",
                    city === c
                      ? "bg-violet-600/70 text-white"
                      : "bg-white/5 text-white/40 hover:text-white/70",
                  ].join(" ")}
                >
                  {c === "dubai" ? "Dubai" : "Manila"}
                </button>
              ))}
            </div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
            />
            <span className="text-white/30">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
            />
            <button
              onClick={() => void fetchRecords()}
              disabled={loading}
              className={`${PRIMARY_BUTTON} flex items-center gap-2 disabled:opacity-50`}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Load"}
            </button>
          </div>
        </div>

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ── KPI Cards ──────────────────────────────────────────────────── */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard
            icon={<span className="text-lg">💰</span>}
            label={city === "dubai" ? "Total Refund" : "Total Amount"}
            value={kpi.totalRefund > 0 ? fmtAmount(kpi.totalRefund) : "—"}
            sub={`${kpi.total} incidents total`}
            accent="text-amber-400"
          />
          <KpiCard
            icon={<span className="text-lg">📋</span>}
            label="Total Incidents"
            value={kpi.total}
            sub={loaded ? `${dateFrom} → ${dateTo}` : "—"}
            accent="text-white/80"
          />
          <KpiCard
            icon={<Mail className="h-4 w-4" />}
            label="Tickets Sent"
            value={kpi.ticketSent}
            sub={kpi.total > 0 ? `${Math.round(kpi.ticketSent / kpi.total * 100)}% of total` : "—"}
            accent="text-sky-400"
          />
          <KpiCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Resolved"
            value={kpi.resolved}
            sub="refund_status filled"
            accent="text-emerald-400"
          />
          <KpiCard
            icon={<Clock className="h-4 w-4" />}
            label="Pending"
            value={kpi.pending}
            sub="Ticket sent, no resolution"
            accent={kpi.pending > 0 ? "text-rose-400" : "text-white/40"}
          />
        </div>

        {/* ── Manila-specific KPI row ────────────────────────────────────── */}
        {city === "manila" && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {kpi.overdue > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                <span className="text-sm font-semibold text-red-300">{kpi.overdue}</span>
                <span className="text-xs text-red-400">records overdue (&gt;7 days, not completed)</span>
              </div>
            )}
            {canApproveHq && noRefundPending > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
                <span className="text-sm font-semibold text-amber-300">{noRefundPending}</span>
                <span className="text-xs text-amber-400">No Refund decisions pending HQ approval</span>
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              {syncStatus === "done" && <span className="text-xs text-emerald-400">{syncMsg}</span>}
              {syncStatus === "error" && <span className="text-xs text-red-400">{syncMsg}</span>}
              <button
                type="button"
                onClick={() => void handleGrabFinanceSync()}
                disabled={syncStatus === "syncing"}
                className={`flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50`}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncStatus === "syncing" ? "animate-spin" : ""}`} />
                {syncStatus === "syncing" ? "Syncing…" : "Sync Grab Finance"}
              </button>
            </div>
          </div>
        )}

        {/* ── Filters ────────────────────────────────────────────────────── */}
        <div className={`${GLASS_CARD} mb-4 p-4`}>
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[140px] flex-1">
              <p className={`${T_LABEL} mb-1`}>Branch</p>
              <SelectDark
                value={filterBranch}
                onChange={setFilterBranch}
                className={SELECT_CLASS}
                options={BRANCHES.map((b) => ({ value: b, label: b }))}
              />
            </div>
            <div className="min-w-[120px] flex-1">
              <p className={`${T_LABEL} mb-1`}>Platform</p>
              <SelectDark
                value={filterPlatform}
                onChange={setFilterPlatform}
                className={SELECT_CLASS}
                options={PLATFORMS.map((p) => ({ value: p, label: p }))}
              />
            </div>
            <div className="min-w-[150px] flex-1">
              <p className={`${T_LABEL} mb-1`}>Category</p>
              <SelectDark
                value={filterCategory}
                onChange={setFilterCategory}
                className={SELECT_CLASS}
                options={CATEGORIES.map((c) => ({ value: c, label: c }))}
              />
            </div>
            <div className="min-w-[180px] flex-1">
              <p className={`${T_LABEL} mb-1`}>Ticket Status</p>
              <SelectDark
                value={filterTicket}
                onChange={setFilterTicket}
                className={SELECT_CLASS}
                options={TICKET_STATUSES}
              />
            </div>
            <div className="min-w-[150px] flex-1">
              <p className={`${T_LABEL} mb-1`}>Resolution</p>
              <SelectDark
                value={filterResolution}
                onChange={setFilterResolution}
                className={SELECT_CLASS}
                options={[
                  { value: "all", label: "All" },
                  { value: "resolved", label: "Resolved" },
                  { value: "pending", label: "Pending" },
                ]}
              />
            </div>
            <div className="min-w-[180px] flex-1">
              <p className={`${T_LABEL} mb-1`}>Search</p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Order ID, reason, branch…"
                  className="w-full rounded-xl border border-white/10 bg-white/6 py-2.5 pl-8 pr-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-violet-500/50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Table ──────────────────────────────────────────────────────── */}
        <div className={`${GLASS_CARD} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <p className="text-sm text-white/50">
              Records
              <span className="ml-2 text-xs text-white/25">({sorted.length} shown)</span>
              {filterTicket === "pending" && kpi.pending > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-400">
                  <Clock className="h-3 w-3" /> {kpi.pending} need follow-up
                </span>
              )}
            </p>
            <button
              onClick={downloadCsv}
              disabled={sorted.length === 0}
              className={`${SMALL_BUTTON} flex items-center gap-1.5 text-xs disabled:opacity-40`}
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/8">
                  {COLS.map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className={`${TABLE_HEADER} cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left hover:text-white/60 transition-colors`}
                    >
                      {label}
                      {sortCol === key && <span className="ml-1 opacity-50">{sortAsc ? "↑" : "↓"}</span>}
                    </th>
                  ))}
                  <th className={`${TABLE_HEADER} px-3 py-3`} />
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={COLS.length + 1} className="px-4 py-8 text-center text-white/30">Loading…</td>
                  </tr>
                )}
                {!loading && sorted.length === 0 && (
                  <tr>
                    <td colSpan={COLS.length + 1} className="px-4 py-8 text-center text-white/25">
                      {loaded ? "No records match the current filter." : "Select a date range and click Load."}
                    </td>
                  </tr>
                )}
                {!loading && sorted.map((r, i) => {
                  const isCancel = r.category === "Cancellation";
                  const rowPending = isPending(r);
                  const rowOverdue = city === "manila" && isOverdue(r);
                  return (
                    <tr
                      key={r.id ?? i}
                      className={`${TABLE_ROW} cursor-pointer ${rowOverdue ? "bg-red-500/8 border-l-2 border-l-red-500/50" : rowPending ? "bg-rose-500/5" : ""}`}
                      onClick={() => setSelectedRow(r)}
                    >
                      <td className={`${TABLE_CELL} whitespace-nowrap px-4 text-white/50`}>
                        <span className={rowOverdue ? "text-red-400 font-semibold" : ""}>{fmtDate(r.incident_date)}</span>
                        {rowOverdue && <AlertCircle className="ml-1 inline h-3 w-3 text-red-400" />}
                      </td>
                      <td className={`${TABLE_CELL} whitespace-nowrap px-4 font-mono text-white/60`}>
                        {r.order_id || <span className="text-white/20">—</span>}
                      </td>
                      <td className={`${TABLE_CELL} whitespace-nowrap px-4`}>
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: activeBranchColors[r.branch] ?? "#888" }} />
                          <span style={{ color: activeBranchColors[r.branch] ?? "#ccc" }}>{r.branch}</span>
                        </span>
                      </td>
                      <td className={`${TABLE_CELL} whitespace-nowrap px-4`}>
                        <span
                          className="rounded-full px-2 py-0.5 font-medium"
                          style={{
                            backgroundColor: `${activePlatformColors[r.platform] ?? "#888"}20`,
                            color: activePlatformColors[r.platform] ?? "#aaa",
                          }}
                        >
                          {r.platform}
                        </span>
                      </td>
                      <td className={`${TABLE_CELL} px-4`}>
                        <span className={`rounded-full px-2 py-0.5 font-medium ${isCancel ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}`}>
                          {r.category ?? "—"}
                        </span>
                      </td>
                      <td className={`${TABLE_CELL} whitespace-nowrap px-4 text-right font-semibold text-amber-400`}>
                        {fmtAmount(r.refund_amount)}
                      </td>
                      <td className={`${TABLE_CELL} px-4 text-white/50`}>
                        <TextCell text={r.cancellation_reason} />
                      </td>
                      <td className={`${TABLE_CELL} px-4`}>
                        <TicketBadge emailStatus={r.email_status} />
                      </td>
                      <td className={`${TABLE_CELL} px-4 text-white/50`}>
                        {rowPending
                          ? <span className="inline-flex items-center gap-1 text-rose-400"><Clock className="h-3 w-3" /> Pending</span>
                          : <TextCell text={r.refund_status} />
                        }
                      </td>
                      {city === "manila" && (
                        <td className={`${TABLE_CELL} px-4`}>
                          <WorkflowBadge status={r.workflow_status} />
                        </td>
                      )}
                      <td className={`${TABLE_CELL} px-3`} onClick={(e) => e.stopPropagation()}>
                        <Link
                          href={`/admin?tab=${city === "dubai" ? "dubai-cancellation-input" : "cancellation-input"}&date=${r.incident_date}&order=${encodeURIComponent(r.order_id ?? "")}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/40 transition-colors hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-300"
                          title="Open in Admin Dashboard"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detail modal */}
      {selectedRow && (
        <DetailModal
          row={selectedRow}
          onClose={() => setSelectedRow(null)}
          platformColors={activePlatformColors}
          branchColors={activeBranchColors}
          city={city}
          canApproveHq={canApproveHq}
          onWorkflowUpdate={(id, updates) => void handleWorkflowUpdate(id, updates)}
        />
      )}
    </main>
  );
}
