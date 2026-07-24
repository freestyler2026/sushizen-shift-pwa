"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { canAccessAdminNav, getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  SELECT_CLASS,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  TAB_ACTIVE,
  TAB_INACTIVE,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

// ─── Constants ────────────────────────────────────────────────────────────────

const BRANCHES = [
  { code: "", label: "All branches" },
  { code: "PAR",  label: "Paranaque" },
  { code: "CUB",  label: "Cubao" },
  { code: "TAFT", label: "Taft" },
];

const CATEGORIES = [
  "",
  "Cleaning Supplies",
  "Office Supplies",
  "Food & Beverages",
  "Maintenance & Repairs",
  "Transportation",
  "Utilities",
  "Other",
];

const CATEGORY_ICONS: Record<string, string> = {
  "Cleaning Supplies":     "🧹",
  "Office Supplies":       "📎",
  "Food & Beverages":      "🍱",
  "Maintenance & Repairs": "🔧",
  "Transportation":        "🚌",
  "Utilities":             "💡",
  "Other":                 "📋",
};

const STATUS_TABS = [
  { key: "",         label: "All" },
  { key: "PENDING",  label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "CLOSED",   label: "Closed" },
  { key: "REJECTED", label: "Rejected" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type PCRequest = {
  id: string;
  branch_code: string;
  requested_by: string;
  request_date: string;
  category: string;
  amount: number;
  purpose: string;
  photo_url: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  closed_by: string | null;
  closed_at: string | null;
  admin_notes: string | null;
  created_at: string;
};

type SummaryRow = {
  branch_code: string;
  category: string;
  status: string;
  total_requests: number;
  total_amount: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number | undefined): string {
  if (n == null) return "—";
  return `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric",
  });
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING:  { label: "Pending",  color: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  APPROVED: { label: "Approved", color: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  REJECTED: { label: "Rejected", color: "border-red-500/30 bg-red-500/10 text-red-300" },
  CLOSED:   { label: "Closed",   color: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
};

// ─── Summary Tab ──────────────────────────────────────────────────────────────

function SummaryTab({ summary }: { summary: SummaryRow[] }) {
  // Aggregate by branch + category
  const byBranch: Record<string, { approved: number; pending: number; total: number }> = {};
  for (const row of summary) {
    if (!byBranch[row.branch_code]) byBranch[row.branch_code] = { approved: 0, pending: 0, total: 0 };
    byBranch[row.branch_code].total += Number(row.total_amount);
    if (row.status === "APPROVED" || row.status === "CLOSED")
      byBranch[row.branch_code].approved += Number(row.total_amount);
    if (row.status === "PENDING")
      byBranch[row.branch_code].pending += Number(row.total_amount);
  }

  if (Object.keys(byBranch).length === 0) {
    return <p className="text-center text-sm text-white/30 py-6">No data for selected period.</p>;
  }

  return (
    <div className="space-y-3">
      {Object.entries(byBranch).map(([branch, data]) => (
        <div key={branch} className="rounded-xl border border-white/8 bg-white/3 p-4">
          <p className="text-sm font-semibold text-white mb-2">
            {BRANCHES.find((b) => b.code === branch)?.label ?? branch}
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-base font-bold text-white">{fmtCurrency(data.total)}</p>
              <p className={`${T_CAPTION}`}>Total</p>
            </div>
            <div>
              <p className="text-base font-bold text-emerald-400">{fmtCurrency(data.approved)}</p>
              <p className={`${T_CAPTION} text-emerald-400/60`}>Approved</p>
            </div>
            <div>
              <p className="text-base font-bold text-amber-400">{fmtCurrency(data.pending)}</p>
              <p className={`${T_CAPTION} text-amber-400/60`}>Pending</p>
            </div>
          </div>
          {/* Category breakdown */}
          <div className="mt-3 space-y-1">
            {summary
              .filter((r) => r.branch_code === branch)
              .reduce((acc, r) => {
                const key = r.category;
                const ex = acc.find((a) => a.category === key);
                if (ex) { ex.total += Number(r.total_amount); ex.count += Number(r.total_requests); }
                else acc.push({ category: key, total: Number(r.total_amount), count: Number(r.total_requests) });
                return acc;
              }, [] as { category: string; total: number; count: number }[])
              .sort((a, b) => b.total - a.total)
              .map((item) => (
                <div key={item.category} className="flex items-center justify-between text-xs">
                  <span className="text-white/50">
                    {CATEGORY_ICONS[item.category] ?? "📋"} {item.category}
                    <span className="ml-1 text-white/30">×{item.count}</span>
                  </span>
                  <span className="text-white/70 font-medium">{fmtCurrency(item.total)}</span>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Request Card ─────────────────────────────────────────────────────────────

function RequestCard({
  req: initialReq,
  onAction,
}: {
  req: PCRequest;
  onAction: () => void;
}) {
  const [req, setReq]               = useState(initialReq);
  const [open, setOpen]             = useState(false);
  const [actionNotes, setActionNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [acting, setActing]         = useState<string | null>(null);
  const [msg, setMsg]               = useState<{ ok: boolean; text: string } | null>(null);

  const meta   = STATUS_META[req.status] ?? STATUS_META["PENDING"];
  const branch = BRANCHES.find((b) => b.code === req.branch_code)?.label ?? req.branch_code;

  const callAction = async (action: "approve" | "reject" | "close") => {
    setActing(action); setMsg(null);
    try {
      const body = action === "reject"
        ? JSON.stringify({ reason: rejectReason })
        : JSON.stringify({ notes: actionNotes });

      const r = await fetch(`/api/admin/petty-cash/${req.id}/${action}`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body,
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || `${action} failed`);
      setReq(d.request);
      setMsg({ ok: true, text: `${action.charAt(0).toUpperCase() + action.slice(1)}d ✓` });
      setShowRejectInput(false); setRejectReason(""); setActionNotes("");
      onAction();
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setActing(null);
    }
  };

  return (
    <div className={`rounded-2xl border bg-white/3 ${req.status === "PENDING" ? "border-amber-500/20" : "border-white/8"}`}>
      {/* Header */}
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-white">{req.requested_by}</p>
            <p className={`${T_CAPTION} mt-0.5`}>
              {branch} · {fmtDate(req.request_date)}
            </p>
            <p className="text-xs text-white/40 mt-0.5">
              {CATEGORY_ICONS[req.category] ?? "📋"} {req.category}
              {req.purpose && ` · ${req.purpose}`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.color}`}>
              {meta.label}
            </span>
            <span className="text-sm font-bold text-white">{fmtCurrency(req.amount)}</span>
            {req.photo_url
              ? <span className="text-[10px] text-sky-400">📎 Receipt</span>
              : <span className="text-[10px] text-white/25">No receipt</span>
            }
            {open ? <ChevronUp size={13} className="text-white/40" /> : <ChevronDown size={13} className="text-white/40" />}
          </div>
        </div>
      </button>

      {/* Detail */}
      {open && (
        <div className="border-t border-white/6 px-4 pb-4 pt-3 space-y-3">

          {/* Receipt photo link */}
          {req.photo_url && (
            <a href={req.photo_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-sky-500/25 bg-sky-500/8 px-3 py-2 text-xs text-sky-400 hover:bg-sky-500/15">
              📎 View Receipt Photo
            </a>
          )}
          {!req.photo_url && (
            <p className="rounded-lg bg-amber-500/8 border border-amber-500/20 px-3 py-2 text-xs text-amber-300/80">
              ⚠ No receipt photo attached yet
            </p>
          )}

          {req.rejection_reason && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
              ✗ {req.rejection_reason}
            </p>
          )}
          {req.admin_notes && (
            <p className="rounded-lg bg-white/4 px-3 py-2 text-xs text-white/50">📝 {req.admin_notes}</p>
          )}

          {msg && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>
              {msg.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {msg.text}
            </div>
          )}

          {/* PENDING actions */}
          {req.status === "PENDING" && (
            <div className="space-y-2">
              <div>
                <label className={`${T_LABEL} mb-1 block`}>Notes (optional)</label>
                <input type="text" className={SELECT_CLASS} placeholder="Add a note for the staff…"
                  value={actionNotes} onChange={(e) => setActionNotes(e.target.value)} />
              </div>
              {!showRejectInput ? (
                <div className="flex gap-2">
                  <button onClick={() => callAction("approve")} disabled={!!acting}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50">
                    {acting === "approve" ? <RefreshCw size={11} className="animate-spin" /> : <ThumbsUp size={11} />}
                    Approve
                  </button>
                  <button onClick={() => setShowRejectInput(true)} disabled={!!acting}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-50">
                    <ThumbsDown size={11} /> Reject
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input type="text" className={SELECT_CLASS} placeholder="Rejection reason…"
                    value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                  <div className="flex gap-2">
                    <button onClick={() => callAction("reject")} disabled={!!acting}
                      className="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-50">
                      {acting === "reject" ? <RefreshCw size={11} className="animate-spin mx-auto" /> : "Confirm Reject"}
                    </button>
                    <button onClick={() => { setShowRejectInput(false); setRejectReason(""); }}
                      className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/50 hover:text-white">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* APPROVED → Close */}
          {req.status === "APPROVED" && (
            <button onClick={() => callAction("close")} disabled={!!acting}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 disabled:opacity-50">
              {acting === "close" ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
              Close (Receipt Verified)
            </button>
          )}

          {/* Footer info */}
          {req.approved_by && (
            <p className={T_CAPTION}>✓ Approved by {req.approved_by} · {fmtTime(req.approved_at)}</p>
          )}
          {req.rejected_by && (
            <p className={T_CAPTION}>✗ Rejected by {req.rejected_by} · {fmtTime(req.rejected_at)}</p>
          )}
          {req.closed_by && (
            <p className={T_CAPTION}>⊙ Closed by {req.closed_by} · {fmtTime(req.closed_at)}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPettyCashPage() {
  const router = useRouter();

  useEffect(() => {
    const a = getAuth();
    if (!a) { router.replace("/login"); return; }
    if (!canAccessAdminNav(a) && a.role !== "HQ") { router.replace("/week"); }
  }, [router]);

  const [tab, setTab]           = useState<"list" | "summary">("list");
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [branch, setBranch]     = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [staffFilter, setStaffFilter] = useState("");

  const [requests, setRequests] = useState<PCRequest[]>([]);
  const [summary, setSummary]   = useState<SummaryRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [msg, setMsg]           = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true); setMsg(null);
    const p = new URLSearchParams({ city: "manila" });
    if (statusFilter) p.set("status",       statusFilter);
    if (branch)       p.set("branch_code",  branch);
    if (catFilter)    p.set("category",     catFilter);
    if (staffFilter)  p.set("requested_by", staffFilter);

    Promise.all([
      fetch(`/api/admin/petty-cash/list?${p}`,    { headers: getAuthHeaders(), cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/admin/petty-cash/summary?city=manila`, { headers: getAuthHeaders(), cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([listData, sumData]) => {
        setRequests(listData.requests ?? []);
        setSummary(sumData.summary ?? []);
      })
      .catch(() => setMsg({ ok: false, text: "Failed to load" }))
      .finally(() => setLoading(false));
  }, [statusFilter, branch, catFilter, staffFilter]);

  useEffect(() => { load(); }, [load]);

  const totalAmt    = requests.reduce((s, r) => s + Number(r.amount), 0);
  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-1">ADMIN · MANILA</p>
            <h1 className={T_PAGE_TITLE}>Petty Cash</h1>
            <p className="text-sm text-white/40 mt-1">Review expense requests &amp; verify receipts</p>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:text-white">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {/* Filters */}
        <div className={`${GLASS_CARD} grid grid-cols-2 gap-3`}>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Branch</label>
            <SelectDark
              className={SELECT_CLASS}
              value={branch}
              onChange={setBranch}
              options={BRANCHES.map((b) => ({ value: b.code, label: b.label || "All branches" }))}
            />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Category</label>
            <SelectDark
              className={SELECT_CLASS}
              value={catFilter}
              onChange={setCatFilter}
              options={CATEGORIES.map((c) => ({ value: c, label: c ? `${CATEGORY_ICONS[c] ?? ""} ${c}` : "All categories" }))}
            />
          </div>
          <div className="col-span-2">
            <label className={`${T_LABEL} mb-1 block`}>Staff Name</label>
            <input type="text" className={SELECT_CLASS} placeholder="Search by name…"
              value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()} />
          </div>
        </div>

        {/* KPI chips */}
        <div className="flex gap-3">
          <div className="flex-1 rounded-xl border border-white/8 bg-white/3 px-3 py-3 text-center">
            <p className="text-2xl font-bold text-white">{requests.length}</p>
            <p className={`${T_CAPTION} mt-0.5`}>{statusFilter || "All"} requests</p>
          </div>
          <div className="flex-1 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-3 text-center">
            <p className="text-xl font-bold text-amber-300">{pendingCount}</p>
            <p className={`${T_CAPTION} mt-0.5 text-amber-400/60`}>Pending</p>
          </div>
          <div className="flex-1 rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-3 text-center">
            <p className="text-base font-bold text-violet-300">{fmtCurrency(totalAmt)}</p>
            <p className={`${T_CAPTION} mt-0.5 text-violet-400/60`}>Total shown</p>
          </div>
        </div>

        {msg && (
          <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
            {msg.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {msg.text}
          </div>
        )}

        {/* View toggle */}
        <div className="flex gap-2">
          <button onClick={() => setTab("list")} className={tab === "list" ? TAB_ACTIVE : TAB_INACTIVE}>
            Requests
          </button>
          <button onClick={() => setTab("summary")} className={tab === "summary" ? TAB_ACTIVE : TAB_INACTIVE}>
            Branch Summary
          </button>
        </div>

        {/* Status tabs (list view only) */}
        {tab === "list" && (
          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((t) => (
              <button key={t.key} onClick={() => setStatusFilter(t.key)}
                className={statusFilter === t.key ? TAB_ACTIVE : TAB_INACTIVE}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {tab === "summary" ? (
          <SummaryTab summary={summary} />
        ) : (
          <div className="space-y-3">
            {loading && (
              <div className="flex justify-center py-8">
                <RefreshCw size={20} className="animate-spin text-white/30" />
              </div>
            )}
            {!loading && requests.length === 0 && (
              <p className="text-center text-sm text-white/30 py-8">
                No {statusFilter.toLowerCase() || ""} requests found.
              </p>
            )}
            {requests.map((r) => (
              <RequestCard key={r.id} req={r} onAction={load} />
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
