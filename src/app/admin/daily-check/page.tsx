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
  INPUT_CLASS,
  T_PAGE_TITLE,
  T_LABEL,
  T_CAPTION,
  TAB_ACTIVE,
  TAB_INACTIVE,
} from "@/lib/ui-tokens";

// ─── Constants ────────────────────────────────────────────────────────────────

type CityKey = "manila" | "dubai";

const BRANCHES_BY_CITY: Record<CityKey, { code: string; label: string }[]> = {
  manila: [
    { code: "PAR",  label: "Paranaque" },
    { code: "CUB",  label: "Cubao" },
    { code: "TAFT", label: "Taft" },
  ],
  dubai: [
    { code: "BB",  label: "Business Bay" },
    { code: "JLT", label: "JLT" },
    { code: "ARJ", label: "Arjan" },
    { code: "AM",  label: "Al Mina" },
    { code: "AB",  label: "Al Barsha" },
  ],
};

const AGGREGATORS_BY_CITY: Record<CityKey, { key: string; label: string }[]> = {
  manila: [
    { key: "grabfood",  label: "GrabFood" },
    { key: "foodpanda", label: "Foodpanda" },
    { key: "beep",      label: "Beep" },
  ],
  dubai: [
    { key: "careem",    label: "Careem" },
    { key: "noon",      label: "NOON" },
    { key: "talabat",   label: "Talabat" },
    { key: "deliveroo", label: "Deliveroo" },
    { key: "keeta",     label: "Keeta" },
    { key: "smiles",    label: "Smiles" },
  ],
};

const TZ_BY_CITY: Record<CityKey, string> = { manila: "Asia/Manila", dubai: "Asia/Dubai" };

// Combined lookups so the admin view can render any city's submission correctly.
const ALL_BRANCHES = [...BRANCHES_BY_CITY.manila, ...BRANCHES_BY_CITY.dubai];
const AGG_LABEL: Record<string, string> = Object.fromEntries(
  [...AGGREGATORS_BY_CITY.manila, ...AGGREGATORS_BY_CITY.dubai].map((a) => [a.key, a.label]),
);
const branchLabelOf = (code: string) => ALL_BRANCHES.find((b) => b.code === code)?.label ?? code;
const tzOf = (city: string) => TZ_BY_CITY[(String(city || "manila").toLowerCase() as CityKey)] ?? "Asia/Manila";

const CHECK_TYPES = [
  { key: "OPENING",        label: "Opening",       icon: "🌅" },
  { key: "LUNCH_OPEN",     label: "Lunch Open",    icon: "🍽️" },
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
  aggregator_statuses: Record<string, unknown>;  // {key: bool} or {key: {open: bool, mode: str}}
  dine_in_open: boolean | null;
  notes: string;
  photo_urls: { url: string; type: string }[];
  status: string;
  bo_confirmed_by: string | null;
  bo_confirmed_at: string | null;
  discord_confirmed: boolean;
  issue_note: string | null;
  double_checked_by: string | null;
  double_checked_at: string | null;
};

type SummaryRow = {
  branch_code: string;
  check_type: string;
  total: number;
  confirmed: number;
  issues: number;
  last_submitted_at: string | null;
  last_confirmed_at: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayInTz(tz = "Asia/Manila"): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz });
}

function fmtTime(iso: string | null, tz = "Asia/Manila"): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit",
  });
}

/** Extract open boolean from aggregator value (supports old {bool} and new {open, mode} formats) */
function aggIsOpen(val: unknown): boolean {
  if (typeof val === "boolean") return val;
  if (val && typeof val === "object" && "open" in val) return !!(val as { open: boolean }).open;
  return false;
}

/** Extract mode string from new-format aggregator value */
function aggMode(val: unknown): string | null {
  if (val && typeof val === "object" && "mode" in val) return (val as { mode: string }).mode;
  return null;
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryGrid({ summary, branches, tz }: { summary: SummaryRow[]; branches: { code: string; label: string }[]; tz: string }) {
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
          {branches.map((branch) => (
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
                const hasIssues = (row.issues ?? 0) > 0;
                return (
                  <td key={ct.key} className="py-2 px-2 text-center">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      hasIssues
                        ? "bg-red-500/15 text-red-300"
                        : allConfirmed
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-amber-500/15 text-amber-300"
                    }`}>
                      {hasIssues ? "🔴" : allConfirmed ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                      {hasIssues
                        ? `${row.issues} issue${row.issues > 1 ? "s" : ""}`
                        : allConfirmed
                          ? "OK"
                          : `${row.confirmed}/${row.total}`}
                    </span>
                    <div className="text-white/25 mt-0.5">{fmtTime(row.last_submitted_at, tz)}</div>
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

const STATUS_META: Record<string, { label: string; dot: string }> = {
  SUBMITTED:       { label: "Pending",  dot: "🟡" },
  CONFIRMED_OK:    { label: "OK",       dot: "🟢" },
  CONFIRMED_ISSUE: { label: "Issue",    dot: "🔴" },
  RESOLVED:        { label: "Resolved", dot: "🔵" },
  ONGOING_ISSUE:   { label: "Ongoing",  dot: "🟣" },
};

function CheckCard({
  check,
  onConfirm,
  onDoubleCheck,
  confirmingId,
  doubleCheckingId,
}: {
  check: CheckRecord;
  onConfirm: (id: string, status: string, discord_confirmed: boolean, issue_note: string) => void;
  onDoubleCheck: (id: string, status: string, note: string) => void;
  confirmingId: string | null;
  doubleCheckingId: string | null;
}) {
  const [selectedStatus, setSelectedStatus] = useState<"CONFIRMED_OK" | "CONFIRMED_ISSUE" | null>(null);
  const [issueNote, setIssueNote] = useState("");
  const [discordConfirmed, setDiscordConfirmed] = useState(false);
  const [doubleStatus, setDoubleStatus] = useState<"RESOLVED" | "ONGOING_ISSUE" | null>(null);
  const [doubleNote, setDoubleNote] = useState("");

  const confirming = confirmingId === check.id;
  const doubleChecking = doubleCheckingId === check.id;
  const statusMeta = STATUS_META[check.status] ?? { label: check.status, dot: "⚪" };
  const meta = CHECK_TYPES.find((t) => t.key === check.check_type);
  const branchLabel = branchLabelOf(check.branch_code);

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${
      check.status === "CONFIRMED_OK"
        ? "border-emerald-500/25 bg-emerald-500/5"
        : check.status === "CONFIRMED_ISSUE"
          ? "border-red-500/25 bg-red-500/5"
          : check.status === "RESOLVED"
            ? "border-sky-500/25 bg-sky-500/5"
            : check.status === "ONGOING_ISSUE"
              ? "border-violet-500/25 bg-violet-500/5"
              : "border-white/10 bg-white/3"
    }`}>

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">
            {meta?.icon} {meta?.label} — {branchLabel}
          </p>
          <p className={`${T_CAPTION} mt-0.5`}>
            by {check.submitted_by} · {fmtTime(check.submitted_at, tzOf(check.city))}
          </p>
        </div>
        <span className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
          check.status === "CONFIRMED_OK"
            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
            : check.status === "CONFIRMED_ISSUE"
              ? "border-red-500/30 bg-red-500/15 text-red-300"
              : check.status === "RESOLVED"
                ? "border-sky-500/30 bg-sky-500/15 text-sky-300"
                : check.status === "ONGOING_ISSUE"
                  ? "border-violet-500/30 bg-violet-500/15 text-violet-300"
                  : "border-white/15 bg-white/5 text-white/40"
        }`}>
          {statusMeta.dot} {statusMeta.label}
        </span>
      </div>

      {/* Aggregator statuses */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(check.aggregator_statuses || {}).map(([key, val]) => {
          const ok = aggIsOpen(val);
          const mode = aggMode(val);
          return (
            <span key={key} className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
              ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/25 bg-red-500/8 text-red-300"
            }`}>
              {ok ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
              {AGG_LABEL[key] ?? key}
              {mode && (
                <span className="ml-0.5 opacity-60">{mode === "manual" ? "M" : "A"}</span>
              )}
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

      {/* Staff notes */}
      {check.notes && (
        <p className="text-xs text-white/50 bg-white/3 rounded-lg px-3 py-2">
          📝 {check.notes}
        </p>
      )}

      {/* Issue note (recorded at confirmation) */}
      {check.issue_note && (
        <p className="text-xs text-red-300/80 bg-red-950/20 rounded-lg px-3 py-2 border border-red-500/20">
          ⚠ {check.issue_note}
        </p>
      )}

      {/* Photos */}
      {check.photo_urls?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {check.photo_urls.map((p, i) => (
            <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg border border-sky-500/25 bg-sky-500/8 px-2 py-1 text-xs text-sky-400 hover:bg-sky-500/15">
              📎 {AGG_LABEL[p.type] ?? p.type} photo
            </a>
          ))}
        </div>
      )}

      {/* ── Initial confirmation UI (SUBMITTED) ── */}
      {check.status === "SUBMITTED" && (
        <div className="space-y-3 pt-2 border-t border-white/8">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wide">Back Office Confirmation</p>

          {/* Status selector */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button"
              onClick={() => setSelectedStatus("CONFIRMED_OK")}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all ${
                selectedStatus === "CONFIRMED_OK"
                  ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                  : "border-white/10 bg-white/3 text-slate-400 hover:border-emerald-500/25 hover:text-emerald-400/80"
              }`}>
              🟢 All Good
            </button>
            <button type="button"
              onClick={() => setSelectedStatus("CONFIRMED_ISSUE")}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all ${
                selectedStatus === "CONFIRMED_ISSUE"
                  ? "border-red-500/40 bg-red-500/20 text-red-300"
                  : "border-white/10 bg-white/3 text-slate-400 hover:border-red-500/25 hover:text-red-400/80"
              }`}>
              🔴 Issue Found
            </button>
          </div>

          {/* Issue note — required for CONFIRMED_ISSUE */}
          {selectedStatus === "CONFIRMED_ISSUE" && (
            <div>
              <label className={`${T_LABEL} mb-1 block`}>
                Issue description <span className="text-red-400">*</span>
              </label>
              <textarea
                className={`${INPUT_CLASS} min-h-[60px] resize-none`}
                value={issueNote}
                onChange={(e) => setIssueNote(e.target.value)}
                placeholder="Describe the issue found..."
              />
            </div>
          )}

          {/* Discord notification checkbox */}
          {selectedStatus && (
            <label className="flex cursor-pointer items-center gap-2.5 select-none">
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-xs transition-colors ${
                discordConfirmed
                  ? "border-violet-400 bg-violet-500/30 text-violet-300"
                  : "border-white/25 bg-white/5 text-transparent"
              }`}>✓</span>
              <input type="checkbox" className="sr-only"
                checked={discordConfirmed}
                onChange={(e) => setDiscordConfirmed(e.target.checked)} />
              <span className="text-xs text-white/50">Discord notification sent</span>
            </label>
          )}

          {/* Confirm button */}
          {selectedStatus && (
            <button type="button"
              disabled={confirming || (selectedStatus === "CONFIRMED_ISSUE" && !issueNote.trim())}
              onClick={() => onConfirm(check.id, selectedStatus, discordConfirmed, issueNote)}
              className={`w-full flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
                selectedStatus === "CONFIRMED_ISSUE"
                  ? "border-red-500/30 bg-red-500/15 text-red-300 hover:bg-red-500/25"
                  : "border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
              }`}>
              {confirming ? <RefreshCw size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
              {confirming
                ? "Saving..."
                : selectedStatus === "CONFIRMED_OK"
                  ? "Confirm — All Good"
                  : "Confirm — Issue Found"}
            </button>
          )}
        </div>
      )}

      {/* ── Double-check UI (CONFIRMED_ISSUE needs follow-up) ── */}
      {check.status === "CONFIRMED_ISSUE" && (
        <div className="space-y-3 pt-2 border-t border-red-500/20">
          <p className="text-xs font-semibold text-red-300/70 uppercase tracking-wide">Follow-up Required</p>
          <p className={T_CAPTION}>
            Flagged by {check.bo_confirmed_by ?? "back office"} at {fmtTime(check.bo_confirmed_at, tzOf(check.city))}
            {check.discord_confirmed && <span className="ml-2 text-violet-400/80">· Discord ✓</span>}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button type="button"
              onClick={() => setDoubleStatus("RESOLVED")}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all ${
                doubleStatus === "RESOLVED"
                  ? "border-sky-500/40 bg-sky-500/20 text-sky-300"
                  : "border-white/10 bg-white/3 text-slate-400 hover:border-sky-500/25 hover:text-sky-400/80"
              }`}>
              🔵 Resolved
            </button>
            <button type="button"
              onClick={() => setDoubleStatus("ONGOING_ISSUE")}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all ${
                doubleStatus === "ONGOING_ISSUE"
                  ? "border-violet-500/40 bg-violet-500/20 text-violet-300"
                  : "border-white/10 bg-white/3 text-slate-400 hover:border-violet-500/25 hover:text-violet-400/80"
              }`}>
              🟣 Still Ongoing
            </button>
          </div>

          {doubleStatus && (
            <>
              <div>
                <label className={`${T_LABEL} mb-1 block`}>Follow-up note (optional)</label>
                <textarea
                  className={`${INPUT_CLASS} min-h-[52px] resize-none`}
                  value={doubleNote}
                  onChange={(e) => setDoubleNote(e.target.value)}
                  placeholder="Update on the issue..."
                />
              </div>
              <button type="button"
                disabled={doubleChecking}
                onClick={() => onDoubleCheck(check.id, doubleStatus, doubleNote)}
                className={`w-full flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  doubleStatus === "ONGOING_ISSUE"
                    ? "border-violet-500/30 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25"
                    : "border-sky-500/30 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25"
                }`}>
                {doubleChecking ? <RefreshCw size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
                {doubleChecking
                  ? "Saving..."
                  : doubleStatus === "RESOLVED"
                    ? "Mark as Resolved"
                    : "Mark as Ongoing"}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Final confirmed state ── */}
      {["CONFIRMED_OK", "RESOLVED", "ONGOING_ISSUE"].includes(check.status) && (
        <div className="pt-1 border-t border-white/5">
          <p className={T_CAPTION}>
            {statusMeta.dot} {statusMeta.label}
            {check.bo_confirmed_by && ` · by ${check.bo_confirmed_by}`}
            {check.bo_confirmed_at && ` at ${fmtTime(check.bo_confirmed_at, tzOf(check.city))}`}
            {check.discord_confirmed && <span className="ml-2 text-violet-400/80">· Discord ✓</span>}
          </p>
          {check.double_checked_by && (
            <p className={`${T_CAPTION} mt-0.5`}>
              Follow-up by {check.double_checked_by} at {fmtTime(check.double_checked_at, tzOf(check.city))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDailyCheckPage() {
  const router = useRouter();
  const auth = getAuth();

  const [city, setCity] = useState<CityKey>(
    (String(auth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila")
  );
  const branches = BRANCHES_BY_CITY[city];
  const tz = TZ_BY_CITY[city];
  const [date, setDate] = useState(todayInTz(tz));
  const [branchFilter, setBranchFilter] = useState("");
  const [typeFilter, setTypeFilter]     = useState("");
  const [tab, setTab]                   = useState<"summary" | "detail">("summary");

  const [summary, setSummary]   = useState<SummaryRow[]>([]);
  const [checks, setChecks]     = useState<CheckRecord[]>([]);
  const [loading, setLoading]   = useState(false);
  const [confirmingId, setConfirmingId]       = useState<string | null>(null);
  const [doubleCheckingId, setDoubleCheckingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const a = getAuth();
    if (!a) { router.replace("/login"); return; }
    if (!canAccessAdminNav(a) && a.role !== "HQ") { router.replace("/week"); }
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

  const confirmCheck = async (
    checkId: string,
    status: string,
    discord_confirmed: boolean,
    issue_note: string,
  ) => {
    setConfirmingId(checkId); setMsg(null);
    try {
      const r = await fetch(`/api/admin/daily-check/${checkId}/confirm`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status, discord_confirmed, issue_note: issue_note.trim() || null }),
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Confirmation failed");
      setMsg({ ok: true, text: status === "CONFIRMED_OK" ? "Confirmed OK ✓" : "Issue flagged 🔴" });
      load();
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setConfirmingId(null);
    }
  };

  const doubleCheck = async (checkId: string, status: string, note: string) => {
    setDoubleCheckingId(checkId); setMsg(null);
    try {
      const r = await fetch(`/api/admin/daily-check/${checkId}/double-check`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: note.trim() || null }),
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Follow-up failed");
      setMsg({ ok: true, text: status === "RESOLVED" ? "Marked as Resolved 🔵" : "Marked as Ongoing 🟣" });
      load();
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setDoubleCheckingId(null);
    }
  };

  // "Needs attention" = SUBMITTED (unreviewed) + CONFIRMED_ISSUE (needs follow-up)
  const pendingCount  = checks.filter((c) => c.status === "SUBMITTED").length;
  const issueCount    = checks.filter((c) => c.status === "CONFIRMED_ISSUE").length;
  const attentionCount = pendingCount + issueCount;

  // auth is used for the guard above (via getAuth()), suppress unused-var warning
  void auth;

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
            <label className={`${T_LABEL} mb-1 block`}>City</label>
            <select className={SELECT_CLASS} value={city}
              onChange={(e) => { setCity(e.target.value as CityKey); setBranchFilter(""); }}>
              <option value="manila">Manila</option>
              <option value="dubai">Dubai</option>
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Date</label>
            <input type="date" className={SELECT_CLASS} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Branch</label>
            <select className={SELECT_CLASS} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}
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
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-3 text-center">
            <p className="text-2xl font-bold text-white">{checks.length}</p>
            <p className={`${T_CAPTION} mt-0.5 text-[10px]`}>Total</p>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">
              {checks.filter((c) => c.status === "CONFIRMED_OK").length}
            </p>
            <p className={`${T_CAPTION} mt-0.5 text-[10px] text-emerald-400/70`}>🟢 OK</p>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-3 text-center">
            <p className="text-2xl font-bold text-amber-400">{pendingCount}</p>
            <p className={`${T_CAPTION} mt-0.5 text-[10px] text-amber-400/70`}>Pending</p>
          </div>
          <div className={`rounded-xl border px-3 py-3 text-center ${
            issueCount > 0
              ? "border-red-500/25 bg-red-500/5"
              : "border-white/8 bg-white/3"
          }`}>
            <p className={`text-2xl font-bold ${issueCount > 0 ? "text-red-400" : "text-white/30"}`}>
              {issueCount}
            </p>
            <p className={`${T_CAPTION} mt-0.5 text-[10px] ${issueCount > 0 ? "text-red-400/70" : "text-white/20"}`}>
              🔴 Issues
            </p>
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
            {attentionCount > 0 && (
              <span className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                {attentionCount}
              </span>
            )}
          </button>
        </div>

        {/* Summary tab */}
        {tab === "summary" && (
          <div className={GLASS_CARD}>
            <SummaryGrid summary={summary} branches={branches} tz={tz} />
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
                onDoubleCheck={doubleCheck}
                confirmingId={confirmingId}
                doubleCheckingId={doubleCheckingId}
              />
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
