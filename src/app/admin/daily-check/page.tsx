"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { canAccessAdminNav, getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_LABEL,
  T_CAPTION,
  TAB_ACTIVE,
  TAB_INACTIVE,
} from "@/lib/ui-tokens";

// ─── Constants ────────────────────────────────────────────────────────────────

const BRANCHES = [
  { code: "PAR",  label: "Paranaque" },
  { code: "CUB",  label: "Cubao" },
  { code: "TAFT", label: "Taft" },
];

const AGGREGATORS = [
  { key: "grabfood",  label: "GrabFood" },
  { key: "foodpanda", label: "Foodpanda" },
  { key: "beep",      label: "Beep" },
];

const CHECK_TYPES = [
  { key: "OPENING",        label: "Opening",       icon: "🌅" },
  { key: "LUNCH_CLOSE",    label: "Lunch Close",   icon: "🌤" },
  { key: "BUSINESS_CLOSE", label: "Business Close", icon: "🌙" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type CheckRecord = {
  id: string;
  city: string;
  branch_code: string;
  check_type: string;
  check_date: string;
  submitted_by: string;
  submitted_at: string;
  aggregator_statuses: Record<string, boolean>;
  dine_in_open: boolean | null;
  notes: string;
  photo_urls: { url: string; type: string }[];
  status: string;
  bo_confirmed_by: string | null;
  bo_confirmed_at: string | null;
};

type SummaryRow = {
  branch_code: string;
  check_type: string;
  total: number;
  confirmed: number;
  last_submitted_at: string | null;
  last_confirmed_at: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayPH(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit",
  });
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryGrid({ summary }: { summary: SummaryRow[] }) {
  if (!summary.length) return (
    <p className="text-sm text-white/30 py-4 text-center">No submissions yet today.</p>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/8 text-white/30">
            <th className="text-left py-2 pr-3 font-medium">Branch</th>
            {CHECK_TYPES.map((t) => (
              <th key={t.key} className="text-center py-2 px-2 font-medium">
                {t.icon} {t.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {BRANCHES.map((branch) => (
            <tr key={branch.code} className="border-b border-white/5">
              <td className="py-2 pr-3 font-semibold text-white/70">{branch.label}</td>
              {CHECK_TYPES.map((ct) => {
                const row = summary.find(
                  (s) => s.branch_code === branch.code && s.check_type === ct.key
                );
                if (!row) return (
                  <td key={ct.key} className="py-2 px-2 text-center text-white/20">—</td>
                );
                const allConfirmed = row.confirmed >= row.total;
                return (
                  <td key={ct.key} className="py-2 px-2 text-center">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      allConfirmed
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-amber-500/15 text-amber-300"
                    }`}>
                      {allConfirmed ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                      {allConfirmed ? "Confirmed" : `${row.confirmed}/${row.total}`}
                    </span>
                    <div className="text-white/25 mt-0.5">{fmtTime(row.last_submitted_at)}</div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Check Detail Card ────────────────────────────────────────────────────────

function CheckCard({
  check,
  onConfirm,
  confirming,
}: {
  check: CheckRecord;
  onConfirm: (id: string) => void;
  confirming: boolean;
}) {
  const meta = CHECK_TYPES.find((t) => t.key === check.check_type);
  const branchLabel = BRANCHES.find((b) => b.code === check.branch_code)?.label ?? check.branch_code;
  const isConfirmed = check.status === "CONFIRMED";

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${
      isConfirmed
        ? "border-emerald-500/25 bg-emerald-500/5"
        : "border-white/10 bg-white/3"
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">
            {meta?.icon} {meta?.label} — {branchLabel}
          </p>
          <p className={`${T_CAPTION} mt-0.5`}>
            by {check.submitted_by} · {fmtTime(check.submitted_at)}
          </p>
        </div>
        {isConfirmed ? (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300">
            <CheckCircle2 size={11} /> Confirmed
          </span>
        ) : (
          <button
            onClick={() => onConfirm(check.id)}
            disabled={confirming}
            className={`flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/25 disabled:opacity-50 transition-colors`}>
            {confirming ? <RefreshCw size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
            {confirming ? "..." : "Confirm ✓"}
          </button>
        )}
      </div>

      {/* Aggregator statuses */}
      <div className="flex flex-wrap gap-2">
        {AGGREGATORS.map((agg) => {
          const ok = check.aggregator_statuses?.[agg.key];
          return (
            <span key={agg.key} className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
              ok === true
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : ok === false
                  ? "border-red-500/25 bg-red-500/8 text-red-300"
                  : "border-white/10 text-white/30"
            }`}>
              {ok === true ? <CheckCircle2 size={10} /> : ok === false ? <XCircle size={10} /> : null}
              {agg.label}
            </span>
          );
        })}
        {check.dine_in_open !== null && (
          <span className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
            check.dine_in_open
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-slate-500/30 text-slate-400"
          }`}>
            {check.dine_in_open ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
            Dine-in {check.dine_in_open ? "Open" : "Closed"}
          </span>
        )}
      </div>

      {/* Notes */}
      {check.notes && (
        <p className="text-xs text-white/50 bg-white/3 rounded-lg px-3 py-2">
          📝 {check.notes}
        </p>
      )}

      {/* Photos */}
      {check.photo_urls?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {check.photo_urls.map((p, i) => (
            <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg border border-sky-500/25 bg-sky-500/8 px-2 py-1 text-xs text-sky-400 hover:bg-sky-500/15">
              📎 {AGGREGATORS.find((a) => a.key === p.type)?.label ?? p.type} photo
            </a>
          ))}
        </div>
      )}

      {/* Confirmation info */}
      {isConfirmed && check.bo_confirmed_by && (
        <p className={T_CAPTION}>
          ✓ Confirmed by {check.bo_confirmed_by} at {fmtTime(check.bo_confirmed_at)}
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDailyCheckPage() {
  const router = useRouter();
  const auth = getAuth();

  const [city] = useState("manila");
  const [date, setDate] = useState(todayPH());
  const [branchFilter, setBranchFilter] = useState("");
  const [typeFilter, setTypeFilter]     = useState("");
  const [tab, setTab]                   = useState<"summary" | "detail">("summary");

  const [summary, setSummary]   = useState<SummaryRow[]>([]);
  const [checks, setChecks]     = useState<CheckRecord[]>([]);
  const [loading, setLoading]   = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const a = getAuth();
    if (!a) { router.replace("/login"); return; }
    if (!canAccessAdminNav(a)) { router.replace("/week"); }
  }, [router]);

  const load = useCallback(() => {
    setLoading(true); setMsg(null);
    const params = new URLSearchParams({ city, check_date: date });
    if (branchFilter) params.set("branch_code", branchFilter);
    if (typeFilter)   params.set("check_type", typeFilter);

    Promise.all([
      fetch(`/api/admin/daily-check/summary?city=${city}&check_date=${date}`, {
        headers: getAuthHeaders(), cache: "no-store",
      }).then((r) => r.json()),
      fetch(`/api/admin/daily-check/list?${params}`, {
        headers: getAuthHeaders(), cache: "no-store",
      }).then((r) => r.json()),
    ])
      .then(([sumData, listData]) => {
        setSummary(sumData.summary ?? []);
        setChecks(listData.checks ?? []);
      })
      .catch(() => setMsg({ ok: false, text: "Failed to load data" }))
      .finally(() => setLoading(false));
  }, [city, date, branchFilter, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const confirmCheck = async (checkId: string) => {
    setConfirmingId(checkId); setMsg(null);
    try {
      const r = await fetch(`/api/admin/daily-check/${checkId}/confirm`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Confirmation failed");
      setMsg({ ok: true, text: "Check confirmed ✓" });
      load();
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setConfirmingId(null);
    }
  };

  const pendingCount = checks.filter((c) => c.status !== "CONFIRMED").length;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-1">ADMIN · OPS</p>
            <h1 className={T_PAGE_TITLE}>Daily Check</h1>
            <p className="text-sm text-white/40 mt-1">Opening &amp; closing confirmation review</p>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:text-white">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {/* Filters */}
        <div className={`${GLASS_CARD} grid grid-cols-2 gap-3 sm:grid-cols-4`}>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Date</label>
            <input type="date" className={SELECT_CLASS} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Branch</label>
            <select className={SELECT_CLASS} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="">All branches</option>
              {BRANCHES.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Check Type</label>
            <select className={SELECT_CLASS} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All types</option>
              {CHECK_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={load} disabled={loading}
              className={`${PRIMARY_BUTTON} w-full text-sm py-2`}>
              {loading ? <RefreshCw size={14} className="animate-spin mx-auto" /> : "Load"}
            </button>
          </div>
        </div>

        {/* KPI chips */}
        <div className="flex gap-3">
          <div className="flex-1 rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-white">{checks.length}</p>
            <p className={`${T_CAPTION} mt-0.5`}>Total submissions</p>
          </div>
          <div className="flex-1 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">{checks.length - pendingCount}</p>
            <p className={`${T_CAPTION} mt-0.5 text-emerald-400/70`}>Confirmed</p>
          </div>
          <div className="flex-1 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-amber-400">{pendingCount}</p>
            <p className={`${T_CAPTION} mt-0.5 text-amber-400/70`}>Pending</p>
          </div>
        </div>

        {/* Message */}
        {msg && (
          <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
            msg.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}>
            {msg.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {msg.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          <button onClick={() => setTab("summary")} className={tab === "summary" ? TAB_ACTIVE : TAB_INACTIVE}>
            Branch Summary
          </button>
          <button onClick={() => setTab("detail")} className={`${tab === "detail" ? TAB_ACTIVE : TAB_INACTIVE} relative`}>
            All Records
            {pendingCount > 0 && (
              <span className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                {pendingCount}
              </span>
            )}
          </button>
        </div>

        {/* Summary tab */}
        {tab === "summary" && (
          <div className={GLASS_CARD}>
            <SummaryGrid summary={summary} />
          </div>
        )}

        {/* Detail tab */}
        {tab === "detail" && (
          <div className="space-y-3">
            {loading && (
              <div className="flex justify-center py-8">
                <RefreshCw size={20} className="animate-spin text-white/30" />
              </div>
            )}
            {!loading && checks.length === 0 && (
              <p className="text-center text-sm text-white/30 py-8">No submissions for this date / filter.</p>
            )}
            {checks.map((c) => (
              <CheckCard
                key={c.id}
                check={c}
                onConfirm={confirmCheck}
                confirming={confirmingId === c.id}
              />
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
