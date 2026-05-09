"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2, ChevronDown, Download, FileText,
  Loader2, Printer, RefreshCw, XCircle,
} from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON,
  KPI_CARD, KPI_LABEL, KPI_VALUE,
  TAB_CONTAINER, TAB_ACTIVE, TAB_INACTIVE,
  INPUT_CLASS, SELECT_CLASS,
  TABLE_HEADER, TABLE_ROW, TABLE_CELL,
  T_PAGE_TITLE, T_SECTION, T_LABEL, T_BODY, T_CAPTION,
  BADGE_SUCCESS, BADGE_WARNING, BADGE_INFO,
} from "@/lib/ui-tokens";

// ── Types ────────────────────────────────────────────────────────────────────

type Cycle = { id: number; city: string; year: number; month: number; status: string; closed_at: string | null };
type RunRecord = {
  id: number; run_id: number; cycle_id: number; city: string; staff_name: string;
  bayzat_id: string; branch_code: string; role_title: string;
  currency: string; paid_via: string; bank_name: string;
  basic_salary: number; accommodation: number; transportation: number;
  other_allowances: number; net_additions: number; net_deductions: number;
  gross_pay: number; net_pay: number;
};
type PayrollRun = {
  id: number; cycle_id: number; city: string; status: string;
  employee_count: number; total_gross: number; total_net: number;
  generated_at: string; generated_by: string;
  finalized_at: string | null; finalized_by: string;
};
type Payment = {
  id: number; cycle_id: number; city: string; staff_name: string;
  amount: number; currency: string; paid_via: string;
  paid_at: string | null; paid_by: string; reference_no: string; note: string; status: string;
};
type AdjLine = { adj_type: string; subtype: string; amount: number; vat: number; reference_no: string; note: string; incurred_at: string | null };
type PayslipData = {
  record: RunRecord;
  adjustments: AdjLine[];
  cycle: { year: number; month: number };
  run: { generated_at: string; finalized_at: string | null };
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = (n: number, currency = "AED") =>
  `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function extractApiError(r: Response, fallback: string): Promise<string> {
  try { const j = await r.json(); return j?.detail || j?.message || fallback; } catch { return fallback; }
}

// ── PaymentModal ─────────────────────────────────────────────────────────────

function PaymentModal({
  record, existingPayment, cycleId, city,
  onClose, onSaved,
}: {
  record: RunRecord; existingPayment: Payment | null;
  cycleId: number; city: string;
  onClose: () => void; onSaved: (p: Payment) => void;
}) {
  const auth = getAuth();
  const [paidVia, setPaidVia] = useState(existingPayment?.paid_via || record.paid_via || "cash");
  const [paidAt, setPaidAt] = useState(existingPayment?.paid_at?.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [refNo, setRefNo] = useState(existingPayment?.reference_no || "");
  const [note, setNote] = useState(existingPayment?.note || "");
  const [amount, setAmount] = useState(String(existingPayment?.amount ?? record.net_pay));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!auth) return;
    setSaving(true); setErr("");
    try {
      const r = await fetch(
        `${API_BASE}/api/admin/payroll/payments/${encodeURIComponent(record.staff_name)}?city=${city}&cycle_id=${cycleId}`,
        {
          method: "PUT",
          headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
          body: JSON.stringify({
            staff_name: record.staff_name,
            amount: parseFloat(amount) || 0,
            currency: record.currency,
            paid_via: paidVia,
            paid_at: paidAt || null,
            paid_by: auth.staffName || "",
            reference_no: refNo,
            note,
            status: "paid",
          }),
        },
      );
      if (!r.ok) { setErr(await extractApiError(r, "Save failed")); return; }
      const j = await r.json();
      onSaved(j.payment);
    } catch {
      setErr("Network error — please try again");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`${GLASS_CARD} w-full max-w-md p-6 space-y-4`}>
        <div className="flex items-center justify-between">
          <p className={T_SECTION}>Mark as Paid — {record.staff_name}</p>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><XCircle className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <p className={`${T_LABEL} mb-1`}>Amount</p>
            <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div>
            <p className={`${T_LABEL} mb-1`}>Payment Method</p>
            <select value={paidVia} onChange={e => setPaidVia(e.target.value)} className={SELECT_CLASS}>
              <option value="cash">Cash</option>
              <option value="bank">Bank Transfer</option>
              <option value="wps">WPS</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>
          <div>
            <p className={`${T_LABEL} mb-1`}>Payment Date</p>
            <input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div>
            <p className={`${T_LABEL} mb-1`}>Reference No.</p>
            <input value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="TXN-001" className={INPUT_CLASS} />
          </div>
          <div>
            <p className={`${T_LABEL} mb-1`}>Note</p>
            <input value={note} onChange={e => setNote(e.target.value)} className={INPUT_CLASS} />
          </div>
        </div>

        {err && <p className="text-sm text-red-400">{err}</p>}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className={`${SECONDARY_BUTTON} flex-1`}>Cancel</button>
          <button onClick={save} disabled={saving} className={`${PRIMARY_BUTTON} flex-1 flex items-center justify-center gap-2`}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Payment
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PayslipModal ──────────────────────────────────────────────────────────────

function PayslipModal({ data, onClose }: { data: PayslipData; onClose: () => void }) {
  const { record: r, adjustments, cycle, run } = data;
  const additions = adjustments.filter(a => a.adj_type === "addition");
  const deductions = adjustments.filter(a => a.adj_type === "deduction" || a.adj_type === "recurring_deduction");
  const period = `${MONTHS[cycle.month - 1]} ${cycle.year}`;

  function doPrint() { window.print(); }

  // Inject print styles when modal is open
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "payslip-print-style";
    style.textContent = `
      @media print {
        body > *:not(#payslip-print-root) { display: none !important; }
        #payslip-print-root { position: fixed !important; inset: 0 !important; background: white !important; display: flex !important; align-items: flex-start !important; justify-content: center !important; }
        #payslip-print-root .payslip-no-print { display: none !important; }
        @page { margin: 15mm; size: A4; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById("payslip-print-style")?.remove(); };
  }, []);

  const rowStyle = "flex justify-between py-1.5 border-b border-zinc-200 text-sm";
  const sectionHead = "font-semibold text-xs uppercase tracking-widest text-zinc-500 mt-4 mb-1 pb-1 border-b-2 border-zinc-300";

  return (
    <div id="payslip-print-root" className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 overflow-y-auto">
      {/* Action bar — hidden on print */}
      <div className="payslip-no-print sticky top-0 z-10 flex gap-3 py-3 w-full max-w-2xl mb-4 justify-end">
        <button onClick={doPrint} className={`${PRIMARY_BUTTON} flex items-center gap-2`}>
          <Printer className="h-4 w-4" /> Print / Save PDF
        </button>
        <button onClick={onClose} className={`${SECONDARY_BUTTON} flex items-center gap-2`}>
          <XCircle className="h-4 w-4" /> Close
        </button>
      </div>

      {/* Printable payslip — white card */}
      <div className="w-full max-w-2xl bg-white text-zinc-900 rounded-2xl shadow-2xl p-8 mt-2 font-sans">
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-zinc-800 pb-4 mb-4">
          <div>
            <p className="text-2xl font-bold tracking-tight text-zinc-900">Sushi ZEN</p>
            <p className="text-sm text-zinc-500 mt-0.5">Workforce OS — Payroll</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-zinc-800">Pay Slip</p>
            <p className="text-sm text-zinc-500">{period}</p>
            {run.finalized_at && (
              <p className="text-xs text-zinc-400 mt-0.5">Finalised {new Date(run.finalized_at).toLocaleDateString()}</p>
            )}
          </div>
        </div>

        {/* Employee info */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm mb-4">
          {[
            ["Employee", r.staff_name],
            ["Employee ID", r.bayzat_id || "—"],
            ["Role", r.role_title || "—"],
            ["Branch", r.branch_code || "—"],
            ["City", r.city.charAt(0).toUpperCase() + r.city.slice(1)],
            ["Payment Method", r.paid_via.toUpperCase()],
            ...(r.bank_name ? [["Bank", r.bank_name] as [string,string]] : []),
          ].map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <span className="text-zinc-500 shrink-0 w-32">{label}</span>
              <span className="font-medium text-zinc-800">{value}</span>
            </div>
          ))}
        </div>

        {/* Earnings */}
        <p className={sectionHead}>Earnings</p>
        {[
          ["Basic Salary", r.basic_salary],
          ["Accommodation", r.accommodation],
          ["Transportation", r.transportation],
          ["Other Allowances", r.other_allowances],
        ].map(([label, val]) => (
          <div key={String(label)} className={rowStyle}>
            <span className="text-zinc-600">{label}</span>
            <span className="tabular-nums">{fmt(Number(val), r.currency)}</span>
          </div>
        ))}
        <div className="flex justify-between py-1.5 text-sm font-semibold">
          <span>Gross Pay</span>
          <span className="tabular-nums">{fmt(r.gross_pay, r.currency)}</span>
        </div>

        {/* Additions */}
        {additions.length > 0 && (
          <>
            <p className={sectionHead}>Additions</p>
            {additions.map((a, i) => (
              <div key={i} className={rowStyle}>
                <span className="text-zinc-600">{a.subtype || "Addition"}</span>
                <span className="tabular-nums text-emerald-700">+{fmt(a.amount, r.currency)}</span>
              </div>
            ))}
            <div className="flex justify-between py-1.5 text-sm font-semibold">
              <span>Total Additions</span>
              <span className="tabular-nums text-emerald-700">+{fmt(r.net_additions, r.currency)}</span>
            </div>
          </>
        )}

        {/* Deductions */}
        {deductions.length > 0 && (
          <>
            <p className={sectionHead}>Deductions</p>
            {deductions.map((a, i) => (
              <div key={i} className={rowStyle}>
                <span className="text-zinc-600">{a.subtype || a.adj_type.replace(/_/g, " ")}</span>
                <span className="tabular-nums text-red-700">−{fmt(a.amount, r.currency)}</span>
              </div>
            ))}
            <div className="flex justify-between py-1.5 text-sm font-semibold">
              <span>Total Deductions</span>
              <span className="tabular-nums text-red-700">−{fmt(r.net_deductions, r.currency)}</span>
            </div>
          </>
        )}

        {/* Net Pay */}
        <div className="mt-4 rounded-xl bg-zinc-900 text-white p-4 flex justify-between items-center">
          <span className="text-sm font-semibold uppercase tracking-widest">Net Pay</span>
          <span className="text-2xl font-bold tabular-nums">{fmt(r.net_pay, r.currency)}</span>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-zinc-400">
          This payslip was generated by Sushi ZEN Workforce OS on {new Date(run.generated_at).toLocaleString()}.
          It is a confidential document.
        </p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function PayrollTransactionsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = getAuth();

  // City / Cycle state — use ?? so a valid URL param ("manila") isn't overridden by ternary
  const [city, setCity] = useState<string>(
    searchParams.get("city") ??
    ((auth as { city?: string } | null)?.city?.toLowerCase() === "dubai" ? "dubai" : "manila")
  );
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleId, setCycleId] = useState<number | null>(searchParams.get("cycle_id") ? parseInt(searchParams.get("cycle_id")!) : null);
  const selectedCycle = cycles.find(c => c.id === cycleId) || null;

  // Run state
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [records, setRecords] = useState<RunRecord[]>([]);

  // Payments state
  const [payments, setPayments] = useState<Payment[]>([]);
  const paymentByName = Object.fromEntries(payments.map(p => [p.staff_name, p]));

  // Payslip state
  const [payslipData, setPayslipData] = useState<PayslipData | null>(null);
  const [payslipLoading, setPayslipLoading] = useState<string | null>(null);

  // UI state
  const [tab, setTab] = useState<"run" | "payments" | "payslips">("run");
  const [loading, setLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [err, setErr] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [paymentModal, setPaymentModal] = useState<RunRecord | null>(null);
  const [batchModal, setBatchModal] = useState(false);
  const [batchPaidVia, setBatchPaidVia] = useState("cash");
  const [batchPaidAt, setBatchPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [batchRefNo, setBatchRefNo] = useState("");
  const [batchSaving, setBatchSaving] = useState(false);
  const cycleLoadRef = useRef(0);
  const dataLoadRef = useRef(0);

  // Auth guard
  useEffect(() => {
    if (!auth) { router.replace("/"); return; }
    const role = String((auth as { role?: string }).role || "").toUpperCase();
    if (!["HQ", "ADMIN", "MANILA_MANAGEMENT", "MANAGEMENT", "HR_MANAGER"].includes(role)) {
      router.replace("/week");
    }
  }, []);

  // Load cycles — use cycleLoadRef for stale-fetch guard (separate from dataLoadRef)
  useEffect(() => {
    if (!auth) return;
    const token = ++cycleLoadRef.current;
    void (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/admin/payroll/cycles?city=${city}`, { headers: getAuthHeaders(auth) });
        if (token !== cycleLoadRef.current) return;
        if (!r.ok) { setErr(await extractApiError(r, "Failed to load cycles")); return; }
        const j = await r.json();
        setCycles(j.cycles || []);
        // Only auto-select first cycle if none is set yet
        if (j.cycles?.[0]) setCycleId(prev => prev ?? j.cycles[0].id);
      } catch { if (token === cycleLoadRef.current) setErr("Failed to load cycles"); }
    })();
  }, [city]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load run + records + payments when cycleId changes
  const loadData = useCallback(async () => {
    if (!auth || !cycleId) return;
    const token = ++dataLoadRef.current;
    setLoading(true); setErr("");
    try {
      const [runRes, pmtRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/payroll/runs?city=${city}&cycle_id=${cycleId}`, { headers: getAuthHeaders(auth) }),
        fetch(`${API_BASE}/api/admin/payroll/payments?city=${city}&cycle_id=${cycleId}`, { headers: getAuthHeaders(auth) }),
      ]);
      if (token !== dataLoadRef.current) return;

      if (runRes.ok) {
        const j = await runRes.json();
        const fetchedRun: PayrollRun | null = j.run;
        setRun(fetchedRun);
        if (fetchedRun) {
          const recRes = await fetch(`${API_BASE}/api/admin/payroll/runs/${fetchedRun.id}/records?city=${city}`, { headers: getAuthHeaders(auth) });
          if (recRes.ok) { const rj = await recRes.json(); if (token === dataLoadRef.current) setRecords(rj.records || []); }
        } else {
          setRecords([]);
        }
      }
      if (pmtRes.ok) { const j = await pmtRes.json(); if (token === dataLoadRef.current) setPayments(j.payments || []); }
    } catch { if (token === dataLoadRef.current) setErr("Failed to load data"); }
    finally { if (token === dataLoadRef.current) setLoading(false); }
  }, [city, cycleId]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function generateRun() {
    if (!auth || !cycleId) return;
    setRunLoading(true); setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/admin/payroll/runs?city=${city}&cycle_id=${cycleId}`, {
        method: "POST", headers: getAuthHeaders(auth),
      });
      if (!r.ok) { setErr(await extractApiError(r, "Failed to generate run")); return; }
      await loadData();
    } catch {
      setErr("Network error — please try again");
    } finally { setRunLoading(false); }
  }

  async function finalizeRun() {
    if (!auth || !run) return;
    if (!confirm("Finalise this payroll run? The run will be locked.")) return;
    setRunLoading(true); setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/admin/payroll/runs/${run.id}/finalize?city=${city}`, {
        method: "POST", headers: getAuthHeaders(auth),
      });
      if (!r.ok) { setErr(await extractApiError(r, "Failed to finalise")); return; }
      await loadData();
    } catch {
      setErr("Network error — please try again");
    } finally { setRunLoading(false); }
  }

  async function openPayslip(staffName: string) {
    if (!auth || !run) return;
    setPayslipLoading(staffName);
    try {
      const r = await fetch(
        `${API_BASE}/api/admin/payroll/runs/${run.id}/payslip/${encodeURIComponent(staffName)}?city=${city}`,
        { headers: getAuthHeaders(auth) },
      );
      if (r.ok) setPayslipData(await r.json());
      else setErr(await extractApiError(r, "Failed to load payslip"));
    } catch {
      setErr("Network error — please try again");
    } finally { setPayslipLoading(null); }
  }

  async function doBatchMarkPaid() {
    if (!auth || !cycleId || selectedRows.size === 0) return;
    setBatchSaving(true); setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/admin/payroll/payments/batch?city=${city}&cycle_id=${cycleId}`, {
        method: "POST",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: JSON.stringify({
          staff_names: [...selectedRows],
          paid_by: (auth as { staffName?: string }).staffName || "",
          paid_via: batchPaidVia,
          paid_at: batchPaidAt || null,
          reference_no: batchRefNo,
        }),
      });
      if (!r.ok) { setErr(await extractApiError(r, "Batch update failed")); return; }
      setBatchModal(false);
      setSelectedRows(new Set());
      await loadData();
    } catch {
      setErr("Network error — please try again");
    } finally { setBatchSaving(false); }
  }

  function csvField(v: string | number): string {
    const s = String(v ?? "");
    // If the field contains a comma, double-quote, or newline — wrap in quotes and escape inner quotes
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function downloadCSV() {
    if (!records.length || !selectedCycle) return;
    const header = "Staff Name,Role,Branch,Currency,Gross Pay,Additions,Deductions,Net Pay,Payment Method,Payment Status";
    const rows = records.map(r => {
      const pmt = paymentByName[r.staff_name];
      return [
        csvField(r.staff_name), csvField(r.role_title), csvField(r.branch_code), csvField(r.currency),
        r.gross_pay, r.net_additions, r.net_deductions, r.net_pay,
        csvField(r.paid_via), csvField(pmt?.status || "pending"),
      ].join(",");
    });
    const csv = "﻿" + [header, ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `payroll_${city}_${selectedCycle.year}_${String(selectedCycle.month).padStart(2, "0")}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  const paidCount = records.filter(r => paymentByName[r.staff_name]?.status === "paid").length;
  const unpaidCount = records.length - paidCount;

  return (
    <div className="min-h-screen bg-[#0a0b0f] px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={T_PAGE_TITLE}>Payroll Transactions</p>
            <p className={`${T_BODY} mt-1`}>月次クローズ・支払い管理・給与明細</p>
          </div>
          <div className="flex gap-2">
            {["dubai", "manila"].map(c => (
              <button
                key={c}
                onClick={() => { setCity(c); setCycleId(null); setRun(null); setRecords([]); setPayments([]); }}
                className={city === c ? TAB_ACTIVE : TAB_INACTIVE}
              >
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Cycle picker */}
        <div className={`${GLASS_CARD} p-4 flex flex-wrap items-center gap-4`}>
          <div className="flex-1 min-w-[200px]">
            <p className={`${T_LABEL} mb-1`}>Pay Period</p>
            <div className="relative">
              <select
                value={cycleId ?? ""}
                onChange={e => setCycleId(Number(e.target.value))}
                className={SELECT_CLASS}
              >
                <option value="">— Select Cycle —</option>
                {cycles.map(c => (
                  <option key={c.id} value={c.id}>
                    {MONTHS[c.month - 1]} {c.year} ({c.status})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            </div>
          </div>
          {selectedCycle && (
            <div className="flex items-center gap-3">
              <span className={selectedCycle.status === "closed" ? BADGE_INFO : BADGE_WARNING}>
                {selectedCycle.status === "closed" ? "Closed" : "Open"}
              </span>
              {run && (
                <span className={run.status === "final" ? BADGE_SUCCESS : BADGE_WARNING}>
                  Run: {run.status === "final" ? "Finalised" : "Draft"}
                </span>
              )}
            </div>
          )}
          <button onClick={() => void loadData()} className={SMALL_BUTTON}>
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {err && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-2">{err}</p>}

        {!cycleId ? (
          <div className={`${GLASS_CARD} p-12 text-center`}>
            <p className={T_BODY}>Select a pay period to view transactions.</p>
          </div>
        ) : (
          <>
            {/* KPIs */}
            {records.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Employees", value: String(records.length) },
                  { label: "Total Net Pay", value: run ? fmt(run.total_net, records[0]?.currency || (city === "manila" ? "PHP" : "AED")) : "—" },
                  { label: "Paid", value: `${paidCount} / ${records.length}` },
                  { label: "Pending", value: String(unpaidCount) },
                ].map(kpi => (
                  <div key={kpi.label} className={KPI_CARD}>
                    <p className={KPI_LABEL}>{kpi.label}</p>
                    <p className={KPI_VALUE}>{kpi.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Tabs */}
            <div className={TAB_CONTAINER}>
              {(["run", "payments", "payslips"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} className={tab === t ? TAB_ACTIVE : TAB_INACTIVE}>
                  {t === "run" ? "Payroll Run" : t === "payments" ? "Payments" : "Payslips"}
                </button>
              ))}
            </div>

            {/* ── Run Tab ── */}
            {tab === "run" && (
              <div className={`${GLASS_CARD} p-6 space-y-5`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className={T_SECTION}>Payroll Run</p>
                  <div className="flex gap-2">
                    {records.length > 0 && (
                      <button onClick={downloadCSV} className={`${SMALL_BUTTON} flex items-center gap-1.5`}>
                        <Download className="h-3.5 w-3.5" /> CSV
                      </button>
                    )}
                    <button
                      onClick={generateRun}
                      disabled={runLoading || run?.status === "final"}
                      className={`${SECONDARY_BUTTON} flex items-center gap-2`}
                    >
                      {runLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                      {run ? "Regenerate" : "Generate Run"}
                    </button>
                    {run && run.status === "draft" && (
                      <button onClick={finalizeRun} disabled={runLoading} className={`${PRIMARY_BUTTON} flex items-center gap-2`}>
                        {runLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                        Finalise
                      </button>
                    )}
                  </div>
                </div>

                {!run ? (
                  <div className="py-12 text-center">
                    <p className={T_BODY}>No payroll run generated yet.</p>
                    <p className={`${T_CAPTION} mt-1`}>Generate a run to snapshot the current payroll table.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                      {[
                        ["Generated", new Date(run.generated_at).toLocaleString()],
                        ["By", run.generated_by || "—"],
                        ["Finalised", run.finalized_at ? new Date(run.finalized_at).toLocaleString() : "Not yet"],
                        ["Status", run.status.toUpperCase()],
                      ].map(([k, v]) => (
                        <div key={k} className={`${KPI_CARD} !p-3`}>
                          <p className={KPI_LABEL}>{k}</p>
                          <p className="mt-1 text-sm font-medium text-white break-words">{v}</p>
                        </div>
                      ))}
                    </div>

                    {loading ? (
                      <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[700px]">
                          <thead>
                            <tr>
                              {["Staff Name","Role","Branch","Gross","Additions","Deductions","Net Pay","Method"].map(h => (
                                <th key={h} className={`${TABLE_HEADER} text-left`}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {records.map(rec => (
                              <tr key={rec.staff_name} className={TABLE_ROW}>
                                <td className={`${TABLE_CELL} font-medium`}>{rec.staff_name}</td>
                                <td className={`${TABLE_CELL} text-zinc-400`}>{rec.role_title || "—"}</td>
                                <td className={`${TABLE_CELL} text-zinc-400`}>{rec.branch_code || "—"}</td>
                                <td className={`${TABLE_CELL} tabular-nums`}>{rec.gross_pay.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                                <td className={`${TABLE_CELL} tabular-nums text-emerald-400`}>+{rec.net_additions.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                                <td className={`${TABLE_CELL} tabular-nums text-red-400`}>−{rec.net_deductions.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                                <td className={`${TABLE_CELL} tabular-nums font-semibold text-white`}>{rec.net_pay.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                                <td className={`${TABLE_CELL} text-zinc-400 text-xs`}>{rec.paid_via.toUpperCase()}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-white/10">
                              <td colSpan={3} className="py-3 text-sm font-semibold text-zinc-400">Total ({records.length} employees)</td>
                              <td className="py-3 text-sm tabular-nums font-semibold text-white">{run.total_gross.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                              <td colSpan={2} />
                              <td className="py-3 text-sm tabular-nums font-bold text-violet-300">{run.total_net.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Payments Tab ── */}
            {tab === "payments" && (
              <div className={`${GLASS_CARD} p-6 space-y-5`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className={T_SECTION}>Payment Records</p>
                  {selectedRows.size > 0 && (
                    <button
                      onClick={() => setBatchModal(true)}
                      className={`${PRIMARY_BUTTON} flex items-center gap-2`}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Mark {selectedRows.size} as Paid
                    </button>
                  )}
                </div>

                {!run ? (
                  <p className={T_BODY}>Generate a payroll run first to track payments.</p>
                ) : loading ? (
                  <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px]">
                      <thead>
                        <tr>
                          <th className="pb-2 pr-3">
                            <input
                              type="checkbox"
                              className="accent-violet-500"
                              checked={selectedRows.size === records.filter(r => paymentByName[r.staff_name]?.status !== "paid").length && records.length > 0}
                              onChange={e => {
                                if (e.target.checked) setSelectedRows(new Set(records.filter(r => paymentByName[r.staff_name]?.status !== "paid").map(r => r.staff_name)));
                                else setSelectedRows(new Set());
                              }}
                            />
                          </th>
                          {["Staff Name","Net Pay","Method","Status","Paid At","Ref No",""].map(h => (
                            <th key={h} className={`${TABLE_HEADER} text-left`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {records.map(rec => {
                          const pmt = paymentByName[rec.staff_name];
                          const isPaid = pmt?.status === "paid";
                          return (
                            <tr key={rec.staff_name} className={TABLE_ROW}>
                              <td className="py-3 pr-3">
                                {!isPaid && (
                                  <input
                                    type="checkbox"
                                    className="accent-violet-500"
                                    checked={selectedRows.has(rec.staff_name)}
                                    onChange={e => {
                                      const next = new Set(selectedRows);
                                      if (e.target.checked) next.add(rec.staff_name); else next.delete(rec.staff_name);
                                      setSelectedRows(next);
                                    }}
                                  />
                                )}
                              </td>
                              <td className={`${TABLE_CELL} font-medium`}>{rec.staff_name}</td>
                              <td className={`${TABLE_CELL} tabular-nums font-semibold`}>{fmt(rec.net_pay, rec.currency)}</td>
                              <td className={`${TABLE_CELL} text-zinc-400 text-xs`}>{(pmt?.paid_via || rec.paid_via).toUpperCase()}</td>
                              <td className={TABLE_CELL}>
                                {isPaid
                                  ? <span className={BADGE_SUCCESS}><CheckCircle2 className="h-3 w-3" /> Paid</span>
                                  : <span className={BADGE_WARNING}>Pending</span>}
                              </td>
                              <td className={`${TABLE_CELL} text-zinc-400`}>{pmt?.paid_at ? new Date(pmt.paid_at).toLocaleDateString() : "—"}</td>
                              <td className={`${TABLE_CELL} text-zinc-500 text-xs`}>{pmt?.reference_no || "—"}</td>
                              <td className={TABLE_CELL}>
                                <button
                                  onClick={() => setPaymentModal(rec)}
                                  className={SMALL_BUTTON}
                                >
                                  {isPaid ? "Edit" : "Mark Paid"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Payslips Tab ── */}
            {tab === "payslips" && (
              <div className={`${GLASS_CARD} p-6 space-y-5`}>
                <p className={T_SECTION}>Payslips</p>
                {!run ? (
                  <p className={T_BODY}>Generate a payroll run first to view payslips.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {records.map(rec => {
                      const pmt = paymentByName[rec.staff_name];
                      return (
                        <div key={rec.staff_name} className={`${KPI_CARD} p-4 space-y-2`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{rec.staff_name}</p>
                              <p className={`${T_CAPTION} truncate`}>{rec.role_title || "—"} · {rec.branch_code || "—"}</p>
                            </div>
                            {pmt?.status === "paid"
                              ? <span className={BADGE_SUCCESS}><CheckCircle2 className="h-3 w-3" /> Paid</span>
                              : <span className={BADGE_WARNING}>Pending</span>}
                          </div>
                          <p className="text-lg font-bold text-white tabular-nums">{fmt(rec.net_pay, rec.currency)}</p>
                          <button
                            onClick={() => void openPayslip(rec.staff_name)}
                            disabled={payslipLoading === rec.staff_name}
                            className={`${SMALL_BUTTON} w-full flex items-center justify-center gap-1.5`}
                          >
                            {payslipLoading === rec.staff_name
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <FileText className="h-3.5 w-3.5" />}
                            View Payslip
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modals ── */}
      {paymentModal && cycleId && (
        <PaymentModal
          record={paymentModal}
          existingPayment={paymentByName[paymentModal.staff_name] || null}
          cycleId={cycleId}
          city={city}
          onClose={() => setPaymentModal(null)}
          onSaved={p => {
            setPayments(prev => {
              const idx = prev.findIndex(x => x.staff_name === p.staff_name);
              if (idx >= 0) { const next = [...prev]; next[idx] = p; return next; }
              return [...prev, p];
            });
            setPaymentModal(null);
          }}
        />
      )}

      {batchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className={`${GLASS_CARD} w-full max-w-sm p-6 space-y-4`}>
            <p className={T_SECTION}>Batch Mark Paid ({selectedRows.size})</p>
            <div className="space-y-3">
              <div>
                <p className={`${T_LABEL} mb-1`}>Payment Method</p>
                <select value={batchPaidVia} onChange={e => setBatchPaidVia(e.target.value)} className={SELECT_CLASS}>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="wps">WPS</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
              <div>
                <p className={`${T_LABEL} mb-1`}>Payment Date</p>
                <input type="date" value={batchPaidAt} onChange={e => setBatchPaidAt(e.target.value)} className={INPUT_CLASS} />
              </div>
              <div>
                <p className={`${T_LABEL} mb-1`}>Reference No.</p>
                <input value={batchRefNo} onChange={e => setBatchRefNo(e.target.value)} placeholder="Batch TXN ref" className={INPUT_CLASS} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setBatchModal(false)} className={`${SECONDARY_BUTTON} flex-1`}>Cancel</button>
              <button onClick={doBatchMarkPaid} disabled={batchSaving} className={`${PRIMARY_BUTTON} flex-1 flex items-center justify-center gap-2`}>
                {batchSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {payslipData && <PayslipModal data={payslipData} onClose={() => setPayslipData(null)} />}
    </div>
  );
}

// Next.js 15 requires useSearchParams() to be inside a Suspense boundary
export default function PayrollTransactionsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0b0f] flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-violet-400" />
      </div>
    }>
      <PayrollTransactionsInner />
    </Suspense>
  );
}
