"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, XCircle, AlertTriangle, RefreshCw, DollarSign,
  Vault, Send, ChevronDown, ChevronUp,
  ClipboardCheck, Landmark,
} from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD, PRIMARY_BUTTON, SELECT_CLASS, INPUT_CLASS,
  TAB_CONTAINER, TAB_ACTIVE, TAB_INACTIVE,
  T_PAGE_TITLE, T_LABEL, T_CAPTION, T_SECTION,
  BADGE_WARNING,
} from "@/lib/ui-tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

type FullReport = {
  id: string; branch: string; report_date: string; report_type: string;
  staff_name: string; status: string;
  // POS
  pos_gross_sales: number | null; pos_cash_sales: number | null;
  pos_credit_card: number | null; pos_qrph: number | null;
  // CC reconciliation
  terminal_credit_card_amt: number | null; cc_discrepancy: number | null;
  // QRPH
  qrph_terminal_amt: number | null; qrph_discrepancy: number | null;
  qrph_photo_url: string;
  // SC/PWD
  scpwd_count: number; scpwd_total_discount: number;
  scpwd_ids_uploaded: boolean; scpwd_receipts_saved: boolean;
  // Denominations
  bill_1000: number; bill_500: number; bill_200: number;
  bill_100: number; bill_50: number; bill_20: number;
  coin_20: number; coin_10: number; coin_5: number;
  coin_1: number; coin_025: number; coin_005: number; coin_001: number;
  cash_total: number;
  // Cash reconciliation
  opening_balance: number | null; expected_closing_balance: number | null;
  cash_discrepancy: number | null;
  // Other
  safety_box_deposit_amt: number; klickit_gross_sales: number | null;
  discrepancy_notes: string;
  submitted_at?: string; created_at: string;
};

type CollectionRecord = {
  id: string; branch: string; amount: number;
  collected_by: string; double_check_by: string; collected_at: string;
  office_checked_by: string; office_checked_at: string | null;
  confirmed_amount: number | null; petty_cash_matched: boolean | null;
  deposited_by: string; deposited_at: string | null;
  bank_reference: string; deposit_amount: number | null;
  status: "COLLECTED" | "OFFICE_CHECKED" | "DEPOSITED";
  notes: string; created_at: string;
};

type CompRow = {
  id: string; report_date: string; report_type: string;
  staff_name: string; status: string;
  cc_discrepancy: number | null; qrph_discrepancy: number | null; cash_discrepancy: number | null;
  has_pending_nte: boolean;
};
type SafetyBoxInfo = { branch: string; balance: number; exceeds_threshold: boolean; threshold: number; last_event_at: string };
type LedgerRow     = { id: string; event_type: string; amount: number; performed_by: string; running_balance: number; created_at: string; ref_date: string | null; ref_staff: string | null };
type NteRow        = { id: string; branch: string; report_date: string; report_type: string; staff_name: string; status: string; discrepancy_types: string[]; discrepancy_details: Record<string, any>; nte_text: string; approved_by: string; approved_at: string | null; created_at: string };

const BRANCHES = ["PAR", "CUB", "TAFT"] as const;
type Branch = (typeof BRANCHES)[number];
const BRANCH_LABELS: Record<Branch, string> = { PAR: "Paranaque", CUB: "Cubao", TAFT: "Taft" };
const SECTIONS = ["OPENING", "CLOSING"] as const;
const SECTION_LABELS: Record<string, string> = { OPENING: "Opening", CLOSING: "Closing" };

function fmtPHP(v: number | null | undefined): string {
  if (v == null) return "—";
  return `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function hasDisc(row: CompRow): boolean {
  return (row.cc_discrepancy != null && row.cc_discrepancy !== 0)
    || (row.qrph_discrepancy != null && row.qrph_discrepancy !== 0)
    || (row.cash_discrepancy != null && row.cash_discrepancy !== 0);
}

// ─── Report Detail Body ───────────────────────────────────────────────────────

function SectionHead({ label }: { label: string }) {
  return <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold pt-1 pb-0.5 border-t border-white/5">{label}</p>;
}

function Row({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: "red" | "green" }) {
  const vc = highlight === "red" ? "text-red-300 font-semibold" : highlight === "green" ? "text-emerald-300 font-semibold" : "text-zinc-200";
  return (
    <div className="flex justify-between items-center py-0.5 text-xs">
      <span className="text-zinc-400">{label}</span>
      <span className={vc}>{value}</span>
    </div>
  );
}

function Bool({ v }: { v: boolean }) {
  return v
    ? <span className="text-emerald-400">✓ Yes</span>
    : <span className="text-red-400">✗ No</span>;
}

function ReportDetailBody({ r }: { r: FullReport }) {
  const isClosing = r.report_type === "CLOSING";
  const denomRows: { label: string; count: number; unit: number }[] = [
    { label: "₱1,000", count: r.bill_1000, unit: 1000 },
    { label: "₱500",   count: r.bill_500,  unit: 500  },
    { label: "₱200",   count: r.bill_200,  unit: 200  },
    { label: "₱100",   count: r.bill_100,  unit: 100  },
    { label: "₱50",    count: r.bill_50,   unit: 50   },
    { label: "₱20",    count: r.bill_20,   unit: 20   },
    { label: "₱20 coin", count: r.coin_20, unit: 20   },
    { label: "₱10",    count: r.coin_10,   unit: 10   },
    { label: "₱5",     count: r.coin_5,    unit: 5    },
    { label: "₱1",     count: r.coin_1,    unit: 1    },
    { label: "₱0.25",  count: r.coin_025,  unit: 0.25 },
    { label: "₱0.05",  count: r.coin_005,  unit: 0.05 },
    { label: "₱0.01",  count: r.coin_001,  unit: 0.01 },
  ].filter((d) => d.count > 0);

  return (
    <div className="space-y-1 text-xs">

      {/* Submitted at */}
      {r.created_at && (
        <Row label="Submitted at" value={new Date(r.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })} />
      )}

      {/* ── POS Figures (Closing only) ── */}
      {isClosing && (
        <>
          <SectionHead label="POS Figures" />
          <Row label="Gross Sales"    value={fmtPHP(r.pos_gross_sales)} />
          <Row label="Cash Sales"     value={fmtPHP(r.pos_cash_sales)} />
          <Row label="Credit Card"    value={fmtPHP(r.pos_credit_card)} />
          <Row label="QRPH"           value={fmtPHP(r.pos_qrph)} />
        </>
      )}

      {/* ── CC Reconciliation (Closing only) ── */}
      {isClosing && (
        <>
          <SectionHead label="Credit Card Reconciliation" />
          <Row label="POS CC"             value={fmtPHP(r.pos_credit_card)} />
          <Row label="Terminal CC"        value={fmtPHP(r.terminal_credit_card_amt)} />
          <Row label="Discrepancy"
            value={fmtPHP(r.cc_discrepancy)}
            highlight={r.cc_discrepancy != null && r.cc_discrepancy !== 0 ? "red" : "green"} />
        </>
      )}

      {/* ── QRPH (Closing only) ── */}
      {isClosing && (
        <>
          <SectionHead label="QRPH / Cashless" />
          <Row label="POS QRPH"       value={fmtPHP(r.pos_qrph)} />
          <Row label="Terminal QRPH"  value={fmtPHP(r.qrph_terminal_amt)} />
          <Row label="Discrepancy"
            value={fmtPHP(r.qrph_discrepancy)}
            highlight={r.qrph_discrepancy != null && r.qrph_discrepancy !== 0 ? "red" : "green"} />
        </>
      )}

      {/* ── SC/PWD (Closing only) ── */}
      {isClosing && (r.scpwd_count > 0 || r.scpwd_total_discount > 0) && (
        <>
          <SectionHead label="SC/PWD Discount" />
          <Row label="Transactions"   value={r.scpwd_count} />
          <Row label="Total Discount" value={fmtPHP(r.scpwd_total_discount)} />
          <Row label="IDs Uploaded"   value={<Bool v={r.scpwd_ids_uploaded} />} />
          <Row label="Receipts Saved" value={<Bool v={r.scpwd_receipts_saved} />} />
        </>
      )}

      {/* ── Klickit (Closing, PAR only) ── */}
      {isClosing && r.klickit_gross_sales != null && (
        <>
          <SectionHead label="Klickit" />
          <Row label="Gross Sales" value={fmtPHP(r.klickit_gross_sales)} />
        </>
      )}

      {/* ── Cash Denomination Count ── */}
      <SectionHead label="Cash Count" />
      {denomRows.length === 0 ? (
        <p className="text-zinc-600 text-xs py-1">No denominations entered.</p>
      ) : (
        <div className="bg-white/5 rounded-lg p-2 space-y-0.5">
          {denomRows.map((d) => (
            <div key={d.label} className="flex justify-between text-xs">
              <span className="text-zinc-400">{d.label} × {d.count}</span>
              <span className="text-zinc-200 tabular-nums">{fmtPHP(d.count * d.unit)}</span>
            </div>
          ))}
          <div className="flex justify-between text-xs font-semibold border-t border-white/10 pt-1 mt-0.5">
            <span className="text-zinc-300">Total</span>
            <span className="text-emerald-300 tabular-nums">{fmtPHP(r.cash_total)}</span>
          </div>
        </div>
      )}

      {/* ── Cash Reconciliation ── */}
      <SectionHead label="Cash Reconciliation" />
      <Row label="Opening Balance"        value={fmtPHP(r.opening_balance)} />
      {isClosing && <Row label="Expected Closing" value={fmtPHP(r.expected_closing_balance)} />}
      <Row label="Cash Count Total"       value={fmtPHP(r.cash_total)} />
      <Row label="Discrepancy"
        value={fmtPHP(r.cash_discrepancy)}
        highlight={r.cash_discrepancy != null && r.cash_discrepancy !== 0 ? "red" : "green"} />

      {/* ── Safety Box Deposit (Closing only) ── */}
      {isClosing && r.safety_box_deposit_amt > 0 && (
        <>
          <SectionHead label="Safety Box Deposit" />
          <Row label="Deposited" value={fmtPHP(r.safety_box_deposit_amt)} highlight="green" />
        </>
      )}

      {/* ── Notes ── */}
      {r.discrepancy_notes && (
        <>
          <SectionHead label="Notes" />
          <p className="text-zinc-300 bg-white/5 rounded-lg p-2 leading-relaxed">{r.discrepancy_notes}</p>
        </>
      )}
    </div>
  );
}

// ─── Compliance Calendar ──────────────────────────────────────────────────────

function ComplianceView() {
  const now = new Date();
  const [branch, setBranch]   = useState<Branch>("PAR");
  const [year,   setYear]     = useState(now.getFullYear());
  const [month,  setMonth]    = useState(now.getMonth() + 1);
  const [data,   setData]     = useState<CompRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail,   setDetail]  = useState<FullReport | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  function openDetail(id: string) {
    if (expanded === id) { setExpanded(null); setDetail(null); return; }
    setExpanded(id);
    setDetail(null);
    setDetailLoading(true);
    const auth = getAuth();
    fetch(`${API_BASE}/api/admin/cash-reports/${id}`, { headers: getAuthHeaders(auth) })
      .then((r) => r.json())
      .then((d) => setDetail(d.report ?? null))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const auth = getAuth();
    fetch(`${API_BASE}/api/admin/cash-reports/compliance?branch=${branch}&year=${year}&month=${month}`, {
      headers: getAuthHeaders(auth),
    }).then((r) => r.json()).then((d) => { if (!cancelled) setData(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setData([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [branch, year, month]);

  const byDaySec = useMemo(() => {
    const map: Record<number, Record<string, CompRow>> = {};
    data.forEach((r) => {
      const d = new Date(r.report_date); const day = d.getUTCDate();
      if (!map[day]) map[day] = {};
      map[day][r.report_type] = r;
    });
    return map;
  }, [data]);

  const days = daysInMonth(year, month);
  const submitted = data.filter((r) => r.status === "SUBMITTED" && !hasDisc(r)).length;
  const withDisc  = data.filter((r) => hasDisc(r)).length;
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function cellColor(row?: CompRow): string {
    if (!row) return "text-zinc-700";
    if (hasDisc(row)) return "bg-red-500/20 text-red-300 border border-red-500/30";
    return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
  }

  return (
    <div className="space-y-5">
      <div className={`${GLASS_CARD} p-5`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1"><label className={T_LABEL}>Branch</label>
            <select className={SELECT_CLASS} value={branch} onChange={(e) => setBranch(e.target.value as Branch)}>
              {BRANCHES.map((b) => <option key={b} value={b}>{BRANCH_LABELS[b]}</option>)}
            </select></div>
          <div className="space-y-1"><label className={T_LABEL}>Month</label>
            <select className={SELECT_CLASS} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {monthNames.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select></div>
          <div className="space-y-1"><label className={T_LABEL}>Year</label>
            <select className={SELECT_CLASS} value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[2025,2026,2027].map((y) => <option key={y} value={y}>{y}</option>)}
            </select></div>
        </div>
      </div>

      {!loading && data.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Submitted", value: submitted, color: "text-emerald-400" },
            { label: "Discrepancy", value: withDisc, color: "text-red-400" },
            { label: "NTE Pending", value: data.filter((r) => r.has_pending_nte).length, color: "text-amber-400" },
          ].map((k) => (
            <div key={k.label} className={`${GLASS_CARD} p-4`}>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">{k.label}</p>
              <p className={`mt-1 text-2xl font-bold ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? <div className={`${GLASS_CARD} p-8 text-center text-sm text-zinc-500`}>Loading…</div> : (
        <div className={`${GLASS_CARD} p-5`}>
          <h3 className={`${T_SECTION} mb-3`}>{monthNames[month-1]} {year} — {BRANCH_LABELS[branch]}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left pb-2 text-zinc-500 w-10">Day</th>
                  {SECTIONS.map((s) => <th key={s} className="pb-2 text-center text-zinc-400 px-2">{SECTION_LABELS[s]}</th>)}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
                  const dayRows = byDaySec[day] || {};
                  const isToday = day === now.getDate() && month === now.getMonth()+1 && year === now.getFullYear();
                  return (
                    <tr key={day} className={`border-t border-white/5 ${isToday ? "bg-violet-500/5" : ""}`}>
                      <td className="py-1.5 pr-2 font-mono text-zinc-500">
                        {String(day).padStart(2,"0")}
                        {isToday && <span className="ml-1 text-[10px] text-violet-400">today</span>}
                      </td>
                      {SECTIONS.map((s) => {
                        const row = dayRows[s];
                        return (
                          <td key={s} className="py-1 px-1 text-center">
                            {row ? (
                              <button onClick={() => openDetail(row.id)}
                                className={`rounded-lg px-2 py-0.5 text-[11px] font-medium transition-all ${cellColor(row)} ${expanded === row.id ? "ring-1 ring-violet-400/50" : ""}`}
                                title={`${row.staff_name}${hasDisc(row) ? " — DISCREPANCY" : " — tap to view"}`}>
                                {hasDisc(row) ? "⚠" : "✓"}
                              </button>
                            ) : <span className="text-zinc-700">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {expanded && (() => {
        const row = data.find((r) => r.id === expanded);
        if (!row) return null;
        return (
          <div className={`${GLASS_CARD} p-5 space-y-4`}>
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className={T_SECTION}>{row.report_date} — {SECTION_LABELS[row.report_type]}</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {BRANCH_LABELS[branch]} · Submitted by <strong className="text-zinc-200">{row.staff_name}</strong>
                </p>
              </div>
              <button onClick={() => { setExpanded(null); setDetail(null); }} className="text-zinc-400 hover:text-zinc-200 shrink-0">✕</button>
            </div>

            {/* Discrepancy summary banners */}
            {(row.cc_discrepancy != null && row.cc_discrepancy !== 0) && (
              <div className="flex items-center gap-2 text-sm text-red-300 bg-red-500/10 rounded-lg px-3 py-2">
                <AlertTriangle size={13} />CC Discrepancy: <strong>{fmtPHP(row.cc_discrepancy)}</strong>
              </div>
            )}
            {(row.qrph_discrepancy != null && row.qrph_discrepancy !== 0) && (
              <div className="flex items-center gap-2 text-sm text-red-300 bg-red-500/10 rounded-lg px-3 py-2">
                <AlertTriangle size={13} />QRPH Discrepancy: <strong>{fmtPHP(row.qrph_discrepancy)}</strong>
              </div>
            )}
            {(row.cash_discrepancy != null && row.cash_discrepancy !== 0) && (
              <div className="flex items-center gap-2 text-sm text-red-300 bg-red-500/10 rounded-lg px-3 py-2">
                <AlertTriangle size={13} />Cash Discrepancy: <strong>{fmtPHP(row.cash_discrepancy)}</strong>
              </div>
            )}
            {row.has_pending_nte && <span className={BADGE_WARNING}>NTE Pending</span>}

            {/* Full detail */}
            {detailLoading && (
              <p className="text-xs text-zinc-500 text-center py-4">Loading submitted details…</p>
            )}
            {!detailLoading && detail && <ReportDetailBody r={detail} />}
            {!detailLoading && !detail && (
              <p className="text-xs text-zinc-600 text-center py-2">Details unavailable.</p>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Safety Box ───────────────────────────────────────────────────────────────

const STATUS_CFG = {
  COLLECTED:      { label: "Collected",    dot: "bg-blue-500",    badge: "border-blue-500/30 bg-blue-500/15 text-blue-300" },
  OFFICE_CHECKED: { label: "Office Check", dot: "bg-amber-500",   badge: "border-amber-500/30 bg-amber-500/15 text-amber-300" },
  DEPOSITED:      { label: "Deposited",    dot: "bg-emerald-500", badge: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" },
} as const;

function SafetyBoxView() {
  const [balances,  setBalances]  = useState<SafetyBoxInfo[]>([]);
  const [ledger,    setLedger]    = useState<LedgerRow[]>([]);
  const [selBranch, setSelBranch] = useState<Branch>("PAR");
  const [loading,   setLoading]   = useState(false);

  // Withdrawal form
  const [wAmt,  setWAmt]  = useState("");
  const [wBy,   setWBy]   = useState("");
  const [wDbl,  setWDbl]  = useState("");
  const [wNote, setWNote] = useState("");
  const [wBusy, setWBusy] = useState(false);
  const [msg,   setMsg]   = useState<{ ok: boolean; text: string } | null>(null);

  // Collection pipeline
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [colLoading,  setColLoading]  = useState(false);
  const [colStatus,   setColStatus]   = useState<"" | "COLLECTED" | "OFFICE_CHECKED" | "DEPOSITED">("");

  // Office-check inline form
  const [ocId,    setOcId]    = useState<string | null>(null);
  const [ocBy,    setOcBy]    = useState("");
  const [ocAmt,   setOcAmt]   = useState("");
  const [ocPetty, setOcPetty] = useState(false);
  const [ocBusy,  setOcBusy]  = useState(false);
  const [ocMsg,   setOcMsg]   = useState<{ ok: boolean; text: string } | null>(null);

  // Bank-deposit inline form
  const [depId,   setDepId]   = useState<string | null>(null);
  const [depBy,   setDepBy]   = useState("");
  const [depAmt,  setDepAmt]  = useState("");
  const [depRef,  setDepRef]  = useState("");
  const [depDate, setDepDate] = useState(new Date().toISOString().slice(0, 10));
  const [depBusy, setDepBusy] = useState(false);
  const [depMsg,  setDepMsg]  = useState<{ ok: boolean; text: string } | null>(null);

  const loadCollections = useCallback(() => {
    setColLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (colStatus) params.set("status", colStatus);
    fetch(`${API_BASE}/api/admin/cash-reports/collections?${params}`, { headers: getAuthHeaders(getAuth()) })
      .then((r) => r.json())
      .then((d) => setCollections(d.collections || []))
      .catch(() => setCollections([]))
      .finally(() => setColLoading(false));
  }, [colStatus]);

  const load = useCallback(() => {
    setLoading(true);
    const h = getAuthHeaders(getAuth());
    Promise.all([
      fetch(`${API_BASE}/api/admin/cash-reports/safety-box`, { headers: h }).then((r) => r.json()),
      fetch(`${API_BASE}/api/admin/cash-reports/safety-box/ledger?branch=${selBranch}&limit=20`, { headers: h }).then((r) => r.json()),
    ]).then(([sb, led]) => {
      setBalances(sb.branches || []);
      setLedger(led.ledger || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [selBranch]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCollections(); }, [loadCollections]);

  const withdraw = async () => {
    const amt = parseFloat(wAmt);
    if (!amt || !wBy.trim()) { setMsg({ ok: false, text: "Amount and Collected By are required." }); return; }
    setWBusy(true); setMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/cash-reports/safety-box/withdrawal`, {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ branch: selBranch, amount: amt, performed_by: wBy.trim(), double_check_by: wDbl.trim(), notes: wNote }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed.");
      setMsg({ ok: true, text: `Collection of ${fmtPHP(amt)} recorded and added to pipeline.` });
      setWAmt(""); setWNote(""); setWDbl("");
      load(); loadCollections();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setWBusy(false); }
  };

  const submitOfficeCheck = async (id: string) => {
    const amt = parseFloat(ocAmt);
    if (!ocBy.trim() || !amt) { setOcMsg({ ok: false, text: "Checked By and confirmed amount are required." }); return; }
    setOcBusy(true); setOcMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/cash-reports/collections/${id}/office-check`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ office_checked_by: ocBy.trim(), confirmed_amount: amt, petty_cash_matched: ocPetty }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed.");
      setOcId(null); setOcBy(""); setOcAmt(""); setOcPetty(false);
      loadCollections();
    } catch (e: any) { setOcMsg({ ok: false, text: e.message }); }
    finally { setOcBusy(false); }
  };

  const submitDeposit = async (id: string) => {
    const amt = parseFloat(depAmt);
    if (!depBy.trim() || !amt) { setDepMsg({ ok: false, text: "Deposited By and amount are required." }); return; }
    setDepBusy(true); setDepMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/cash-reports/collections/${id}/deposit`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ deposited_by: depBy.trim(), deposit_amount: amt, bank_reference: depRef.trim(), deposited_at: depDate }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed.");
      setDepId(null); setDepBy(""); setDepAmt(""); setDepRef(""); setDepDate(new Date().toISOString().slice(0, 10));
      loadCollections();
    } catch (e: any) { setDepMsg({ ok: false, text: e.message }); }
    finally { setDepBusy(false); }
  };

  const pendingCount = collections.filter((c) => c.status !== "DEPOSITED").length;

  return (
    <div className="space-y-5">
      {/* ── Balance cards ── */}
      <div className="grid grid-cols-3 gap-3">
        {BRANCHES.map((b) => {
          const info = balances.find((x) => x.branch === b);
          const bal  = info?.balance ?? 0;
          const pct  = Math.min(100, Math.round((bal / 20000) * 100));
          const over = info?.exceeds_threshold ?? false;
          return (
            <div key={b}
              className={`${GLASS_CARD} p-4 cursor-pointer border ${over ? "border-red-500/40" : "border-white/10"} ${selBranch === b ? "ring-1 ring-violet-400/50" : ""}`}
              onClick={() => setSelBranch(b)}>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">{BRANCH_LABELS[b]}</p>
              <p className={`mt-1 text-xl font-bold ${over ? "text-red-400" : "text-white"}`}>{fmtPHP(bal)}</p>
              {over && <p className="text-[10px] text-red-400 mt-1">⚠️ Exceeds ₱20,000</p>}
              <div className="mt-2 h-1.5 rounded-full bg-white/10">
                <div className={`h-1.5 rounded-full transition-all ${over ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Collection Pipeline ── */}
      <div className={`${GLASS_CARD} p-5 space-y-4`}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className={T_SECTION}>Collection Pipeline</h3>
            <p className={T_CAPTION}>Store collection → Office check → Bank deposit</p>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <span className="text-[11px] bg-amber-500/20 border border-amber-500/30 text-amber-300 px-2 py-0.5 rounded-full font-medium">
                {pendingCount} pending
              </span>
            )}
            <button type="button" onClick={loadCollections}
              className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10">
              <RefreshCw size={13} className={`text-zinc-400 ${colLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Status filter chips */}
        <div className="flex flex-wrap gap-2">
          {(["", "COLLECTED", "OFFICE_CHECKED", "DEPOSITED"] as const).map((s) => {
            const cfg   = s ? STATUS_CFG[s] : null;
            const label = s ? cfg!.label : "All";
            const isActive = colStatus === s;
            return (
              <button key={s} type="button" onClick={() => setColStatus(s)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  isActive
                    ? (s ? cfg!.badge : "border-violet-500/40 bg-violet-500/20 text-violet-300")
                    : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"
                }`}>
                {s && <span className={`w-1.5 h-1.5 rounded-full ${cfg!.dot}`} />}
                {label}
              </button>
            );
          })}
        </div>

        {/* Cards */}
        {colLoading ? (
          <p className="text-sm text-zinc-500 py-4 text-center">Loading…</p>
        ) : collections.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4 text-center">No collections yet. Record a withdrawal below to start tracking.</p>
        ) : (
          <div className="space-y-3">
            {collections.map((col) => {
              const cfg         = STATUS_CFG[col.status];
              const branchLabel = BRANCH_LABELS[col.branch as Branch] ?? col.branch;
              const isOcOpen    = ocId  === col.id;
              const isDepOpen   = depId === col.id;
              return (
                <div key={col.id} className="rounded-xl border border-white/8 bg-white/[0.03] p-4 space-y-3">
                  {/* Row 1: status badge + amount + branch + date */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                        <span className="text-sm font-bold text-white">{fmtPHP(col.amount)}</span>
                        <span className="text-xs text-zinc-400">{branchLabel}</span>
                        <span className="text-xs text-zinc-500">{col.collected_at?.slice(0, 10)}</span>
                      </div>
                      <p className="text-xs text-zinc-400">
                        Collected: <span className="text-zinc-200">{col.collected_by || "—"}</span>
                        {col.double_check_by && (
                          <span className="ml-3">2nd check: <span className="text-zinc-200">{col.double_check_by}</span></span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Office check summary */}
                  {(col.status === "OFFICE_CHECKED" || col.status === "DEPOSITED") && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs space-y-0.5">
                      <p className="text-zinc-300">
                        Confirmed: <span className="font-semibold text-white">{fmtPHP(col.confirmed_amount)}</span>
                        {col.petty_cash_matched === true  && <span className="ml-2 text-emerald-400">✓ Petty cash matched</span>}
                        {col.petty_cash_matched === false && <span className="ml-2 text-red-400">✗ Petty cash mismatch</span>}
                      </p>
                      <p className="text-zinc-500">Checked by: {col.office_checked_by} · {col.office_checked_at?.slice(0, 10)}</p>
                    </div>
                  )}

                  {/* Bank deposit summary */}
                  {col.status === "DEPOSITED" && (
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-xs space-y-0.5">
                      <p className="text-zinc-300">
                        Deposited: <span className="font-semibold text-white">{fmtPHP(col.deposit_amount)}</span>
                        {col.bank_reference && <span className="ml-2 font-mono text-emerald-300">{col.bank_reference}</span>}
                      </p>
                      <p className="text-zinc-500">By: {col.deposited_by} · {col.deposited_at}</p>
                    </div>
                  )}

                  {/* Action buttons */}
                  {col.status === "COLLECTED" && (
                    <button type="button"
                      onClick={() => { setOcId(isOcOpen ? null : col.id); setOcMsg(null); if (!isOcOpen) setOcAmt(String(col.amount)); }}
                      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                        isOcOpen
                          ? "border-amber-500/40 bg-amber-500/20 text-amber-300"
                          : "border-white/15 bg-white/5 hover:bg-white/10 text-zinc-300"
                      }`}>
                      <ClipboardCheck size={12} />
                      {isOcOpen ? "Cancel" : "Mark Office Checked ▾"}
                    </button>
                  )}
                  {col.status === "OFFICE_CHECKED" && (
                    <button type="button"
                      onClick={() => { setDepId(isDepOpen ? null : col.id); setDepMsg(null); if (!isDepOpen) setDepAmt(String(col.confirmed_amount ?? col.amount)); }}
                      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                        isDepOpen
                          ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                          : "border-white/15 bg-white/5 hover:bg-white/10 text-zinc-300"
                      }`}>
                      <Landmark size={12} />
                      {isDepOpen ? "Cancel" : "Record Bank Deposit ▾"}
                    </button>
                  )}

                  {/* Office-check inline form */}
                  {isOcOpen && (
                    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4 space-y-3">
                      <p className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                        <ClipboardCheck size={12} /> Office Confirmation
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={`${T_LABEL} mb-1 block`}>Confirmed Amount (₱)</label>
                          <input type="number" className={INPUT_CLASS} value={ocAmt} onChange={(e) => setOcAmt(e.target.value)} placeholder="0.00" />
                        </div>
                        <div>
                          <label className={`${T_LABEL} mb-1 block`}>Checked By</label>
                          <input className={INPUT_CLASS} value={ocBy} onChange={(e) => setOcBy(e.target.value)} placeholder="Staff name" />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-300">
                        <input type="checkbox" checked={ocPetty} onChange={(e) => setOcPetty(e.target.checked)}
                          className="w-4 h-4 rounded border-white/20 bg-white/10 accent-amber-500" />
                        Petty cash sheet matched ✓
                      </label>
                      {ocMsg && (
                        <div className={`flex items-center gap-2 rounded-lg border p-2 text-xs ${ocMsg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
                          {ocMsg.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {ocMsg.text}
                        </div>
                      )}
                      <button type="button" onClick={() => void submitOfficeCheck(col.id)} disabled={ocBusy}
                        className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 disabled:opacity-50">
                        {ocBusy ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                        Save Office Check
                      </button>
                    </div>
                  )}

                  {/* Bank-deposit inline form */}
                  {isDepOpen && (
                    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 space-y-3">
                      <p className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                        <Landmark size={12} /> Bank Deposit Record
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={`${T_LABEL} mb-1 block`}>Deposit Amount (₱)</label>
                          <input type="number" className={INPUT_CLASS} value={depAmt} onChange={(e) => setDepAmt(e.target.value)} placeholder="0.00" />
                        </div>
                        <div>
                          <label className={`${T_LABEL} mb-1 block`}>Deposited By</label>
                          <input className={INPUT_CLASS} value={depBy} onChange={(e) => setDepBy(e.target.value)} placeholder="Staff name" />
                        </div>
                        <div>
                          <label className={`${T_LABEL} mb-1 block`}>Bank Reference</label>
                          <input className={INPUT_CLASS} value={depRef} onChange={(e) => setDepRef(e.target.value)} placeholder="e.g. BPI-2026-0607-001" />
                        </div>
                        <div>
                          <label className={`${T_LABEL} mb-1 block`}>Deposit Date</label>
                          <input type="date" className={INPUT_CLASS} value={depDate} onChange={(e) => setDepDate(e.target.value)} />
                        </div>
                      </div>
                      {depMsg && (
                        <div className={`flex items-center gap-2 rounded-lg border p-2 text-xs ${depMsg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
                          {depMsg.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {depMsg.text}
                        </div>
                      )}
                      <button type="button" onClick={() => void submitDeposit(col.id)} disabled={depBusy}
                        className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50">
                        {depBusy ? <RefreshCw size={11} className="animate-spin" /> : <Landmark size={11} />}
                        Record Deposit
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Withdrawal form ── */}
      <div className={`${GLASS_CARD} p-5 space-y-3`}>
        <div>
          <h3 className={T_SECTION}>Record Withdrawal — {BRANCH_LABELS[selBranch]}</h3>
          <p className={T_CAPTION}>Automatically creates a collection record in the pipeline above.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Amount (₱)</label>
            <input type="number" className={INPUT_CLASS} value={wAmt} onChange={(e) => setWAmt(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Collected By</label>
            <input className={INPUT_CLASS} value={wBy} onChange={(e) => setWBy(e.target.value)} placeholder="Staff name" />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Double Check By</label>
            <input className={INPUT_CLASS} value={wDbl} onChange={(e) => setWDbl(e.target.value)} placeholder="2nd staff (optional)" />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Notes (optional)</label>
            <input className={INPUT_CLASS} value={wNote} onChange={(e) => setWNote(e.target.value)} placeholder="Any notes..." />
          </div>
        </div>
        <button type="button" onClick={() => void withdraw()} disabled={wBusy}
          className={`${PRIMARY_BUTTON} flex items-center gap-2`}>
          {wBusy ? <RefreshCw size={14} className="animate-spin" /> : <Vault size={14} />}
          {wBusy ? "Recording..." : "Record Withdrawal"}
        </button>
        {msg && (
          <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
            {msg.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {msg.text}
          </div>
        )}
      </div>

      {/* ── Recent Ledger ── */}
      <div className={`${GLASS_CARD} p-5`}>
        <h3 className={`${T_SECTION} mb-3`}>Recent Ledger — {BRANCH_LABELS[selBranch]}</h3>
        {loading ? <p className="text-sm text-zinc-500">Loading…</p> : ledger.length === 0 ? (
          <p className="text-sm text-zinc-500">No entries yet.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {ledger.map((row) => (
              <div key={row.id} className="flex items-center justify-between py-2 text-xs">
                <div>
                  <span className={`font-bold mr-2 ${row.event_type === "DEPOSIT" ? "text-red-300" : "text-emerald-300"}`}>
                    {row.event_type === "DEPOSIT" ? "↓ Deposit" : "↑ Withdrawal"}
                  </span>
                  <span className="text-zinc-400">{row.performed_by}</span>
                  {row.ref_date && <span className="text-zinc-600 ml-1">({row.ref_date})</span>}
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold">{fmtPHP(row.amount)}</div>
                  <div className="text-zinc-500">Balance: {fmtPHP(row.running_balance)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── NTE Management ───────────────────────────────────────────────────────────

function NteView() {
  const [ntes, setNtes]     = useState<NteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [approver, setApprover] = useState(getAuth()?.staffName || "");
  const [busy, setBusy]   = useState<string | null>(null);
  const [msg, setMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => {
    setLoading(true);
    fetch(`${API_BASE}/api/admin/cash-reports/nte?limit=100`, {
      headers: getAuthHeaders(getAuth()),
    }).then((r) => r.json()).then((d) => setNtes(d.ntes || []))
      .catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const approve = async (nteId: string) => {
    if (!approver.trim()) { setMsg({ ok: false, text: "Approver name required." }); return; }
    setBusy(nteId); setMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/cash-reports/nte/${nteId}/approve`, {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ approved_by: approver.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed.");
      setMsg({ ok: true, text: "NTE issued successfully." });
      load();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(null); }
  };

  const filtered = filter ? ntes.filter((n) => n.status === filter) : ntes;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select className={`${SELECT_CLASS} flex-1`} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="DRAFT">Draft</option>
          <option value="ISSUED">Issued</option>
          <option value="RESOLVED">Resolved</option>
        </select>
        <div className="flex-1">
          <input className={INPUT_CLASS} placeholder="Your name (approver)" value={approver}
            onChange={(e) => setApprover(e.target.value)} />
        </div>
        <button type="button" onClick={load} className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10">
          <RefreshCw size={14} className={`text-zinc-400 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
          {msg.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {msg.text}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className={`${GLASS_CARD} p-8 text-center text-sm text-zinc-500`}>No NTE records found.</div>
      ) : filtered.map((nte) => (
        <div key={nte.id} className={`${GLASS_CARD} p-4 space-y-2`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${nte.status === "ISSUED" ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" : nte.status === "RESOLVED" ? "border-zinc-500/30 bg-zinc-500/15 text-zinc-400" : "border-amber-500/30 bg-amber-500/15 text-amber-300"}`}>
                  {nte.status}
                </span>
                <span className="text-sm font-semibold text-white">{nte.staff_name}</span>
                <span className="text-xs text-zinc-400">{BRANCH_LABELS[nte.branch as Branch] ?? nte.branch} · {nte.report_date}</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {(nte.discrepancy_types || []).map((t) => (
                  <span key={t} className="text-[10px] bg-red-500/10 text-red-300 border border-red-500/20 px-1.5 rounded">{t}</span>
                ))}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={() => setExpanded(expanded === nte.id ? null : nte.id)}
                className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10">
                {expanded === nte.id ? <ChevronUp size={13} className="text-zinc-400" /> : <ChevronDown size={13} className="text-zinc-400" />}
              </button>
              {nte.status === "DRAFT" && (
                <button type="button" onClick={() => approve(nte.id)} disabled={busy === nte.id}
                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/40 text-violet-300 hover:bg-violet-500/30 disabled:opacity-50">
                  {busy === nte.id ? <RefreshCw size={11} className="animate-spin" /> : <Send size={11} />}
                  Approve & Issue
                </button>
              )}
            </div>
          </div>
          {expanded === nte.id && (
            <div className="mt-2 rounded-xl border border-white/8 bg-black/20 p-4">
              <p className={`${T_CAPTION} text-zinc-500 mb-2`}>NTE Text Preview</p>
              <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">{nte.nte_text}</pre>
              {nte.approved_by && (
                <p className="text-xs text-zinc-500 mt-2">Approved by: {nte.approved_by} on {nte.approved_at?.slice(0,10)}</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CashManagementPage() {
  const router = useRouter();
  const auth   = getAuth();
  const [tab, setTab] = useState<"compliance" | "safety-box" | "nte">("compliance");

  useEffect(() => {
    if (!auth) { router.replace("/login"); return; }
  }, [auth, router]);

  if (!auth) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <div className="mb-5 flex items-center gap-3">
          <DollarSign size={22} className="text-emerald-400" />
          <div>
            <h1 className={T_PAGE_TITLE}>Cash Management</h1>
            <p className={`${T_CAPTION} text-slate-400`}>Compliance · Safety Box · NTE</p>
          </div>
        </div>

        <div className={`${TAB_CONTAINER} mb-5`}>
          <button className={tab === "compliance" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("compliance")}>📊 Compliance</button>
          <button className={tab === "safety-box" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("safety-box")}>🔒 Safety Box</button>
          <button className={tab === "nte"        ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("nte")}>📋 NTE</button>
        </div>

        {tab === "compliance" && <ComplianceView />}
        {tab === "safety-box" && <SafetyBoxView />}
        {tab === "nte"        && <NteView />}
      </div>
    </div>
  );
}
