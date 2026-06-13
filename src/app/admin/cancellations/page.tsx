"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
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

// ── API helpers ────────────────────────────────────────────────────────────

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
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

// ── Types ──────────────────────────────────────────────────────────────────

type CancelRow = {
  id: number;
  platform: string;
  incident_date: string;
  branch: string;
  brand: string | null;
  category: string | null;
  order_id: string | null;
  total_amount: number | null;
  refund_amount: number | null;
  cancellation_reason: string | null;
  encoded_by: string | null;
  email_status: string | null;
  refund_status: string | null;
  photo_status: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function todayIso() { return new Date().toISOString().slice(0, 10); }
function daysAgoIso(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
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

const PLATFORM_COLORS: Record<string, string> = {
  Careem: "#00c896", Keeta: "#ff6b35", Talabat: "#ff2d55",
};
const BRANCH_COLORS: Record<string, string> = {
  "Business Bay": "#6366f1", Arjan: "#10b981", "Al Barsha": "#f59e0b",
  "Al Hudaiba": "#ec4899", JLT: "#8b5cf6",
};

function isTicketSent(email_status: string | null): boolean {
  const s = (email_status ?? "").toLowerCase();
  return s.includes("sent") || s.includes("email");
}
function isResolved(refund_status: string | null): boolean {
  const s = (refund_status ?? "").trim();
  return s.length > 0;
}
function isPending(row: CancelRow): boolean {
  // Plan A: email_status contains "sent" AND refund_status is empty
  return isTicketSent(row.email_status) && !isResolved(row.refund_status);
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

const BRANCHES = ["All", "Business Bay", "Arjan", "Al Barsha", "Al Hudaiba", "JLT"];
const PLATFORMS = ["All", "Careem", "Keeta", "Talabat"];
const CATEGORIES = ["All", "Cancellation", "Refund/Complaint"];
const TICKET_STATUSES = [
  { value: "all",      label: "All Ticket Status" },
  { value: "sent",     label: "Ticket Sent" },
  { value: "no_need",  label: "No Need to Send" },
  { value: "pending",  label: "Pending (Sent, Unresolved)" },
  { value: "none",     label: "Not Sent" },
];

type SortKey = keyof CancelRow;

export default function CancellationReportPage() {
  const auth = getAuth();
  const approverName = auth?.staffName || "";
  const pin = auth?.pin || "";

  const [dateFrom, setDateFrom] = useState(daysAgoIso(30));
  const [dateTo, setDateTo] = useState(todayIso());
  const [records, setRecords] = useState<CancelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Filters
  const [filterBranch, setFilterBranch] = useState("All");
  const [filterPlatform, setFilterPlatform] = useState("All");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterTicket, setFilterTicket] = useState("all");
  const [search, setSearch] = useState("");

  // Sort
  const [sortCol, setSortCol] = useState<SortKey>("incident_date");
  const [sortAsc, setSortAsc] = useState(false);

  const canLoad = Boolean(approverName.trim() && pin.trim());

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
    try {
      const res = await apiGet<{ ok?: boolean; items?: CancelRow[] }>(
        `/api/admin/analytics/dubai/cancellations?${qs}`
      );
      setRecords(Array.isArray(res?.items) ? res.items : []);
      setLoaded(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [approverName, pin, dateFrom, dateTo, canLoad]);

  useEffect(() => { void fetchRecords(); }, [fetchRecords]);

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
  }, [records, filterBranch, filterPlatform, filterCategory, filterTicket, search]);

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

  // ── KPI computation (based on filtered — reflects active frontend filters) ──

  const kpi = useMemo(() => {
    const totalRefund = filtered.reduce((s, r) => s + (Number(r.refund_amount) || 0), 0);
    const total = filtered.length;
    const ticketSent = filtered.filter(r => isTicketSent(r.email_status)).length;
    const resolved = filtered.filter(r => isResolved(r.refund_status)).length;
    const pending = filtered.filter(r => isPending(r)).length;
    return { totalRefund, total, ticketSent, resolved, pending };
  }, [filtered]);

  // ── CSV download ─────────────────────────────────────────────────────────

  function downloadCsv() {
    const headers = ["date", "branch", "platform", "category", "order_id", "refund_aed", "reason", "ticket_status", "refund_status"];
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      headers.join(","),
      ...sorted.map((r) => [
        r.incident_date, r.branch, r.platform, r.category ?? "",
        r.order_id ?? "", r.refund_amount ?? 0,
        esc(r.cancellation_reason), esc(r.email_status), esc(r.refund_status),
      ].join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `cancellations-${dateFrom}-${dateTo}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
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

  // ── Columns definition ───────────────────────────────────────────────────

  const COLS: { key: SortKey; label: string }[] = [
    { key: "incident_date",      label: "Date" },
    { key: "branch",             label: "Branch" },
    { key: "platform",           label: "Platform" },
    { key: "category",           label: "Category" },
    { key: "refund_amount",      label: "Refund (AED)" },
    { key: "cancellation_reason", label: "Reason" },
    { key: "email_status",       label: "Ticket Status" },
    { key: "refund_status",      label: "Refund Status" },
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
                Dubai · Careem / Keeta / Talabat — follow-up dashboard
              </p>
            </div>
          </div>

          {/* Date range + Load */}
          <div className="flex flex-wrap items-center gap-2">
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
              onClick={fetchRecords}
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
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard
            icon={<span className="text-lg">💰</span>}
            label="Total Refund"
            value={kpi.totalRefund > 0 ? `AED ${kpi.totalRefund.toLocaleString("en-AE", { maximumFractionDigits: 0 })}` : "—"}
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

        {/* ── Filters ────────────────────────────────────────────────────── */}
        <div className={`${GLASS_CARD} mb-4 p-4`}>
          <div className="flex flex-wrap gap-3">
            {/* Branch */}
            <div className="min-w-[140px] flex-1">
              <p className={`${T_LABEL} mb-1`}>Branch</p>
              <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className={SELECT_CLASS}>
                {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            {/* Platform */}
            <div className="min-w-[120px] flex-1">
              <p className={`${T_LABEL} mb-1`}>Platform</p>
              <select value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)} className={SELECT_CLASS}>
                {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {/* Category */}
            <div className="min-w-[150px] flex-1">
              <p className={`${T_LABEL} mb-1`}>Category</p>
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className={SELECT_CLASS}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {/* Ticket Status */}
            <div className="min-w-[180px] flex-1">
              <p className={`${T_LABEL} mb-1`}>Ticket Status</p>
              <select value={filterTicket} onChange={(e) => setFilterTicket(e.target.value)} className={SELECT_CLASS}>
                {TICKET_STATUSES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {/* Search */}
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
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-white/30">Loading…</td>
                  </tr>
                )}
                {!loading && sorted.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-white/25">
                      {loaded ? "No records match the current filter." : "Select a date range and click Load."}
                    </td>
                  </tr>
                )}
                {!loading && sorted.map((r, i) => {
                  const isCancel = r.category === "Cancellation";
                  const rowPending = isPending(r);
                  return (
                    <tr key={r.id ?? i} className={`${TABLE_ROW} ${rowPending ? "bg-rose-500/5" : ""}`}>
                      {/* Date */}
                      <td className={`${TABLE_CELL} whitespace-nowrap px-4 text-white/50`}>
                        {fmtDate(r.incident_date)}
                      </td>
                      {/* Branch */}
                      <td className={`${TABLE_CELL} whitespace-nowrap px-4`}>
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: BRANCH_COLORS[r.branch] ?? "#888" }} />
                          <span style={{ color: BRANCH_COLORS[r.branch] ?? "#ccc" }}>{r.branch}</span>
                        </span>
                      </td>
                      {/* Platform */}
                      <td className={`${TABLE_CELL} whitespace-nowrap px-4`}>
                        <span
                          className="rounded-full px-2 py-0.5 font-medium"
                          style={{
                            backgroundColor: `${PLATFORM_COLORS[r.platform] ?? "#888"}20`,
                            color: PLATFORM_COLORS[r.platform] ?? "#aaa",
                          }}
                        >
                          {r.platform}
                        </span>
                      </td>
                      {/* Category */}
                      <td className={`${TABLE_CELL} px-4`}>
                        <span className={`rounded-full px-2 py-0.5 font-medium ${isCancel ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}`}>
                          {r.category ?? "—"}
                        </span>
                      </td>
                      {/* Refund */}
                      <td className={`${TABLE_CELL} whitespace-nowrap px-4 text-right font-semibold text-amber-400`}>
                        {fmtAed(r.refund_amount)}
                      </td>
                      {/* Reason */}
                      <td className={`${TABLE_CELL} px-4 text-white/50`}>
                        <TextCell text={r.cancellation_reason} />
                      </td>
                      {/* Ticket Status */}
                      <td className={`${TABLE_CELL} px-4`}>
                        <TicketBadge emailStatus={r.email_status} />
                      </td>
                      {/* Refund Status */}
                      <td className={`${TABLE_CELL} px-4 text-white/50`}>
                        {rowPending
                          ? <span className="inline-flex items-center gap-1 text-rose-400"><Clock className="h-3 w-3" /> Pending</span>
                          : <TextCell text={r.refund_status} />
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
