"use client";

import {
  AlertCircle, ArrowRight, ChevronDown, ChevronRight, ChevronUp,
  Download, DollarSign, Eye, EyeOff, Filter, Loader2, Pencil, Plus, RefreshCw,
  Send, Settings, Users, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth";

const API = "/api/admin/payroll";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function apiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const method = (opts?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  if (method !== "GET" && method !== "HEAD") headers["Content-Type"] = "application/json";
  if (auth?.accessToken) headers["Authorization"] = `Bearer ${auth.accessToken}`;
  return fetch(path, { ...opts, headers: { ...headers, ...(opts?.headers as Record<string, string> ?? {}) } });
}

async function extractApiError(r: Response, fallback: string): Promise<string> {
  try {
    const j = await r.json() as { detail?: string; message?: string };
    return j.detail || j.message || fallback;
  } catch { return fallback; }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Cycle = {
  id: number;
  city: string;
  year: number;
  month: number;
  status: "open" | "closed";
  closed_at: string | null;
};

type PayrollRow = {
  staff_name: string;
  bayzat_id: string;
  branch_code: string;
  role_title: string;
  currency: string;
  paid_via: string;
  basic_salary: number;
  accommodation: number;
  transportation: number;
  other_allowances: number;
  allowances: number;
  net_additions: number;
  net_deductions: number;
  gross_pay: number;
  net_pay: number;
};

type SalaryConfig = {
  id: number;
  city: string;
  staff_name: string;
  bayzat_id: string;
  branch_code: string;
  role_title: string;
  basic_salary: number;
  accommodation: number;
  transportation: number;
  other_allowances: number;
  currency: string;
  paid_via: string;
  bank_name: string;
};

type Tab = "table" | "configs";

// ── Salary Config Edit Modal ──────────────────────────────────────────────────

function ConfigModal({
  city,
  config,
  onSave,
  onClose,
}: {
  city: string;
  config: SalaryConfig | null;
  onSave: (c: SalaryConfig) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    staff_name: config?.staff_name ?? "",
    bayzat_id: config?.bayzat_id ?? "",
    branch_code: config?.branch_code ?? "",
    role_title: config?.role_title ?? "",
    basic_salary: String(config?.basic_salary ?? "0"),
    accommodation: String(config?.accommodation ?? "0"),
    transportation: String(config?.transportation ?? "0"),
    other_allowances: String(config?.other_allowances ?? "0"),
    currency: config?.currency ?? (city === "manila" ? "PHP" : "AED"),
    paid_via: config?.paid_via ?? "cash",
    bank_name: config?.bank_name ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function set(k: keyof typeof form, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.staff_name.trim()) { setErr("Staff name is required"); return; }
    const numericFields = [form.basic_salary, form.accommodation, form.transportation, form.other_allowances];
    const parsed = numericFields.map(v => parseFloat(v));
    if (parsed.some(v => isNaN(v) || v < 0)) {
      setErr("Salary and allowance values must be non-negative numbers"); return;
    }
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`${API}/salary-configs?city=${encodeURIComponent(city)}`, {
        method: "PUT",
        body: JSON.stringify({
          staff_name: form.staff_name.trim(),
          bayzat_id: form.bayzat_id.trim(),
          branch_code: form.branch_code.trim(),
          role_title: form.role_title.trim(),
          basic_salary: parseFloat(form.basic_salary) || 0,
          accommodation: parseFloat(form.accommodation) || 0,
          transportation: parseFloat(form.transportation) || 0,
          other_allowances: parseFloat(form.other_allowances) || 0,
          currency: form.currency,
          paid_via: form.paid_via,
          bank_name: form.bank_name.trim(),
        }),
      });
      if (!r.ok) { setErr(await extractApiError(r, "Failed to save")); return; }
      const data = await r.json() as { config: SalaryConfig };
      onSave(data.config);
    } catch {
      setErr("Network error — please try again");
    } finally { setBusy(false); }
  }

  const labelCls = "block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide";
  const inputCls = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 disabled:bg-gray-100 disabled:text-gray-400";
  const selectCls = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200 p-6 relative">
        <button onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-gray-700"><X size={18} /></button>
        <h3 className="text-base font-semibold text-gray-900 mb-4">{config ? "Edit Salary Config" : "Add Salary Config"}</h3>

        {err && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
            <AlertCircle size={14} /> {err}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Staff Name *</label>
            <input className={inputCls} value={form.staff_name} onChange={e => set("staff_name", e.target.value)}
              placeholder="Full name (matching OS Attendance)" disabled={!!config} />
          </div>
          <div>
            <label className={labelCls}>Bayzat ID</label>
            <input className={inputCls} value={form.bayzat_id} onChange={e => set("bayzat_id", e.target.value)} placeholder="e.g. PH25018" />
          </div>
          <div>
            <label className={labelCls}>Branch Code</label>
            <input className={inputCls} value={form.branch_code} onChange={e => set("branch_code", e.target.value)} placeholder="e.g. ZEN_DUBAI" />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Role / Title</label>
            <input className={inputCls} value={form.role_title} onChange={e => set("role_title", e.target.value)} placeholder="e.g. Apprentice Cook" />
          </div>

          <div>
            <label className={labelCls}>Basic Salary</label>
            <input className={inputCls} type="number" min="0" value={form.basic_salary} onChange={e => set("basic_salary", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Accommodation</label>
            <input className={inputCls} type="number" min="0" value={form.accommodation} onChange={e => set("accommodation", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Transportation</label>
            <input className={inputCls} type="number" min="0" value={form.transportation} onChange={e => set("transportation", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Other Allowances</label>
            <input className={inputCls} type="number" min="0" value={form.other_allowances} onChange={e => set("other_allowances", e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Currency</label>
            <select className={selectCls} value={form.currency} onChange={e => set("currency", e.target.value)}>
              <option value="AED">AED</option>
              <option value="PHP">PHP</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Paid Via</label>
            <select className={selectCls} value={form.paid_via} onChange={e => set("paid_via", e.target.value)}>
              <option value="cash">Cash</option>
              <option value="bank">Bank Transfer</option>
            </select>
          </div>
          {form.paid_via === "bank" && (
            <div className="col-span-2">
              <label className={labelCls}>Bank Name</label>
              <input className={inputCls} value={form.bank_name} onChange={e => set("bank_name", e.target.value)} placeholder="e.g. Emirates NBD" />
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
            onClick={onClose} disabled={busy}>Cancel</button>
          <button
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 transition disabled:opacity-50"
            onClick={() => { void save(); }} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Employee Detail Side Panel ────────────────────────────────────────────────

function EmployeeDetailPanel({
  row,
  onClose,
}: {
  row: PayrollRow;
  onClose: () => void;
}) {
  const items = [
    { label: "Basic Salary", value: row.basic_salary, section: "Base" },
    { label: "Accommodation", value: row.accommodation, section: "Base" },
    { label: "Transportation", value: row.transportation, section: "Base" },
    { label: "Other Allowances", value: row.other_allowances, section: "Base" },
    { label: "Gross Pay", value: row.gross_pay, section: "Subtotal", bold: true },
    { label: "Net Additions", value: row.net_additions, section: "Adjustments", positive: true },
    { label: "Net Deductions", value: row.net_deductions, section: "Adjustments", negative: true },
    { label: "Net Pay", value: row.net_pay, section: "Total", bold: true },
  ];
  const sections = ["Base", "Subtotal", "Adjustments", "Total"];
  function fmtVal(v: number) {
    return `${row.currency} ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="h-full w-full max-w-sm overflow-y-auto bg-white border-l border-gray-200 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
          <div>
            <p className="font-semibold text-gray-900">{row.staff_name}</p>
            <p className="text-xs text-gray-500">{row.role_title || "—"} · {row.branch_code || "—"}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 font-medium">
            Currency: {row.currency}
          </div>

          {sections.map(sec => {
            const secItems = items.filter(i => i.section === sec);
            return (
              <div key={sec}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">{sec}</p>
                {secItems.map(item => (
                  <div key={item.label} className={`flex justify-between py-2 ${item.bold ? "border-t border-gray-200 font-semibold" : "border-t border-gray-100"}`}>
                    <span className={`text-sm ${item.bold ? "text-gray-900" : "text-gray-600"}`}>{item.label}</span>
                    <span className={`text-sm tabular-nums ${
                      item.positive ? "text-green-600" :
                      item.negative ? "text-red-500" :
                      item.bold ? "text-gray-900" : "text-gray-700"
                    }`}>
                      {fmtVal(item.value)}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}

          <div className="pt-3 border-t border-gray-200">
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Paid Via</span>
              <span className="text-xs capitalize text-gray-700 font-medium">{row.paid_via}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PayrollPage() {
  const router = useRouter();
  const auth = useMemo(() => getAuth(), []);
  const role = auth?.role ?? "";

  useEffect(() => {
    const ok = role === "HQ" || role === "ADMIN" || ["MANAGEMENT", "MANILA_MANAGEMENT", "HR_MANAGER"].includes(role);
    if (!ok) router.replace("/week");
  }, [role, router]);

  const [city, setCity] = useState<"dubai" | "manila">(() => {
    const a = getAuth();
    return (a as { city?: string } | null)?.city?.toLowerCase() === "dubai" ? "dubai" : "manila";
  });
  const [tab, setTab] = useState<Tab>("table");
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<Cycle | null>(null);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [totalNetPay, setTotalNetPay] = useState(0);
  const [configs, setConfigs] = useState<SalaryConfig[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [detailRow, setDetailRow] = useState<PayrollRow | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SalaryConfig | null>(null);
  const [closingCycle, setClosingCycle] = useState(false);
  const [publishingCycle, setPublishingCycle] = useState(false);
  const [cyclePublishedCount, setCyclePublishedCount] = useState<Record<number,number>>({});

  const cycleLoadRef = useRef(0);
  const tableLoadRef = useRef(0);
  const configLoadRef = useRef(0);

  const loadCycles = useCallback(async (c: string) => {
    const id = ++cycleLoadRef.current;
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`${API}/cycles?city=${encodeURIComponent(c)}`);
      if (id !== cycleLoadRef.current) return;
      if (!r.ok) { setErr(await extractApiError(r, "Failed to load cycles")); return; }
      const data = await r.json() as { cycles: Cycle[] };
      setCycles(data.cycles);
      if (data.cycles.length > 0) {
        setSelectedCycle(prev => prev ?? data.cycles[0]);
      }
    } catch {
      if (id === cycleLoadRef.current) setErr("Network error — please try again");
    } finally {
      if (id === cycleLoadRef.current) setBusy(false);
    }
  }, []);

  const loadTable = useCallback(async (cycleId: number, c: string) => {
    const id = ++tableLoadRef.current;
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`${API}/table?city=${encodeURIComponent(c)}&cycle_id=${cycleId}`);
      if (id !== tableLoadRef.current) return;
      if (!r.ok) {
        setRows([]); setTotalNetPay(0);
        setErr(await extractApiError(r, "Failed to load payroll table")); return;
      }
      const data = await r.json() as { rows: PayrollRow[]; total_net_pay: number };
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setTotalNetPay(data.total_net_pay ?? 0);
    } catch {
      if (id === tableLoadRef.current) setErr("Network error — please try again");
    } finally {
      if (id === tableLoadRef.current) setBusy(false);
    }
  }, []);

  const loadConfigs = useCallback(async (c: string) => {
    const id = ++configLoadRef.current;
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`${API}/salary-configs?city=${encodeURIComponent(c)}`);
      if (id !== configLoadRef.current) return;
      if (!r.ok) {
        setConfigs([]);
        setErr(await extractApiError(r, "Failed to load configs")); return;
      }
      const data = await r.json() as { configs: SalaryConfig[] };
      setConfigs(data.configs);
    } catch {
      if (id === configLoadRef.current) setErr("Network error — please try again");
    } finally {
      if (id === configLoadRef.current) setBusy(false);
    }
  }, []);

  // On city change
  useEffect(() => {
    setSelectedCycle(null);
    setCycles([]);
    setRows([]);
    setTotalNetPay(0);
    setConfigs([]);
    setDetailRow(null);
    void loadCycles(city);
  }, [city]); // eslint-disable-line react-hooks/exhaustive-deps

  // On cycle change
  useEffect(() => {
    if (selectedCycle && selectedCycle.city === city && tab === "table") void loadTable(selectedCycle.id, city);
  }, [selectedCycle, tab, city]); // eslint-disable-line react-hooks/exhaustive-deps

  // On tab change to configs
  useEffect(() => {
    if (tab === "configs") void loadConfigs(city);
  }, [tab, city]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ensureCurrentCycle() {
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`${API}/cycles?city=${encodeURIComponent(city)}`, {
        method: "POST",
        body: JSON.stringify(null),
      });
      if (!r.ok) { setErr(await extractApiError(r, "Failed to create cycle")); return; }
      const data = await r.json() as { cycle: Cycle };
      setCycles(prev => {
        const exists = prev.find(c => c.id === data.cycle.id);
        return exists
          ? prev.map(c => (c.id === data.cycle.id ? data.cycle : c))
          : [data.cycle, ...prev];
      });
      setSelectedCycle(data.cycle);
    } catch {
      setErr("Network error — please try again");
    } finally { setBusy(false); }
  }

  async function closeCycle() {
    if (!selectedCycle) return;
    if (!confirm(`Close ${MONTHS[selectedCycle.month - 1]} ${selectedCycle.year} payroll? This cannot be easily undone.`)) return;
    setClosingCycle(true); setErr("");
    try {
      const r = await apiFetch(`${API}/cycles/${selectedCycle.id}/close`, { method: "PATCH" });
      if (!r.ok) { setErr(await extractApiError(r, "Failed to close cycle")); return; }
      const data = await r.json() as { cycle: Cycle };
      setSelectedCycle(data.cycle);
      setCycles(prev => prev.map(c => c.id === data.cycle.id ? data.cycle : c));
    } catch {
      setErr("Network error — please try again");
    } finally { setClosingCycle(false); }
  }

  async function reopenCycle() {
    if (!selectedCycle) return;
    setClosingCycle(true); setErr("");
    try {
      const r = await apiFetch(`${API}/cycles/${selectedCycle.id}/reopen`, { method: "PATCH" });
      if (!r.ok) { setErr(await extractApiError(r, "Failed to reopen cycle")); return; }
      const data = await r.json() as { cycle: Cycle };
      setSelectedCycle(data.cycle);
      setCycles(prev => prev.map(c => c.id === data.cycle.id ? data.cycle : c));
    } catch {
      setErr("Network error — please try again");
    } finally { setClosingCycle(false); }
  }

  async function publishCycle() {
    if (!selectedCycle) return;
    if (!confirm(`${MONTHS[selectedCycle.month - 1]} ${selectedCycle.year} の全スタッフの給与明細をスタッフの My Pay に公開しますか？`)) return;
    setPublishingCycle(true); setErr("");
    try {
      const r = await apiFetch(`${API}/cycles/${selectedCycle.id}/publish-all`, { method: "POST" });
      if (!r.ok) { setErr(await extractApiError(r, "Failed to publish")); return; }
      const data = await r.json() as { published_count: number };
      setCyclePublishedCount(prev => ({ ...prev, [selectedCycle.id]: data.published_count }));
      alert(`${data.published_count}件の給与明細をスタッフに公開しました。`);
    } catch {
      setErr("Network error — please try again");
    } finally { setPublishingCycle(false); }
  }

  async function unpublishCycle() {
    if (!selectedCycle) return;
    if (!confirm(`${MONTHS[selectedCycle.month - 1]} ${selectedCycle.year} の給与明細の公開を取り消しますか？スタッフの My Pay から非表示になります。`)) return;
    setPublishingCycle(true); setErr("");
    try {
      const r = await apiFetch(`${API}/cycles/${selectedCycle.id}/unpublish-all`, { method: "POST" });
      if (!r.ok) { setErr(await extractApiError(r, "Failed to unpublish")); return; }
      setCyclePublishedCount(prev => ({ ...prev, [selectedCycle.id]: 0 }));
    } catch {
      setErr("Network error — please try again");
    } finally { setPublishingCycle(false); }
  }

  function downloadCSV() {
    if (!selectedCycle || rows.length === 0) return;
    const header = ["Name","Branch","Role","Currency","Basic Salary","Allowances","Gross Pay","Net Additions","Net Deductions","Net Pay","Paid Via"];
    const csvRows = rows.map(r => [
      r.staff_name, r.branch_code, r.role_title, r.currency,
      r.basic_salary, r.allowances, r.gross_pay,
      r.net_additions, r.net_deductions, r.net_pay, r.paid_via,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [header.join(","), ...csvRows].join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `payroll_${city}_${selectedCycle.year}_${String(selectedCycle.month).padStart(2,"0")}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  function onConfigSaved(c: SalaryConfig) {
    setShowConfigModal(false);
    setEditingConfig(null);
    if (c.city !== city) { void loadConfigs(city); return; }
    setConfigs(prev => {
      const idx = prev.findIndex(x => x.staff_name === c.staff_name);
      if (idx >= 0) { const next = [...prev]; next[idx] = c; return next; }
      return [...prev, c].sort((a, b) => a.staff_name.localeCompare(b.staff_name));
    });
  }

  const currency = city === "manila" ? "PHP" : "AED";

  // ── Column selector state ─────────────────────────────────────────────────
  type ColKey = "basic" | "allowances" | "gross" | "workExp" | "netAdd" | "netDed" | "arrears";
  const [visibleCols, setVisibleCols] = useState<Record<ColKey, boolean>>({
    basic: true, allowances: true, gross: true,
    workExp: false, netAdd: true, netDed: true, arrears: false,
  });
  const [showColSelector, setShowColSelector] = useState(true);
  const [filterMissing, setFilterMissing] = useState(false);

  function toggleCol(k: ColKey) { setVisibleCols(p => ({ ...p, [k]: !p[k] })); }

  // ── Computed totals ───────────────────────────────────────────────────────
  const totalBasic      = rows.reduce((s, r) => s + r.basic_salary, 0);
  const totalAllowances = rows.reduce((s, r) => s + (r.allowances ?? 0), 0);
  const totalGross      = rows.reduce((s, r) => s + r.gross_pay, 0);
  const totalNetAdd     = rows.reduce((s, r) => s + r.net_additions, 0);
  const totalNetDed     = rows.reduce((s, r) => s + r.net_deductions, 0);
  const missingRows     = rows.filter(r => r.basic_salary === 0);
  const displayRows     = filterMissing ? missingRows : rows;

  const cycleName = selectedCycle
    ? `${MONTHS[selectedCycle.month - 1]} ${selectedCycle.year}`
    : "—";

  function n(v: number) { return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  const COL_DEFS: { key: ColKey; label: string; total: number }[] = [
    { key: "basic",      label: "Basic Salary",               total: totalBasic },
    { key: "allowances", label: "Allowances",                 total: totalAllowances },
    { key: "gross",      label: "Gross Pay",                  total: totalGross },
    { key: "workExp",    label: "Work Expenses",              total: 0 },
    { key: "netAdd",     label: "Net Additions",              total: totalNetAdd },
    { key: "netDed",     label: "Net Deductions",             total: totalNetDed },
    { key: "arrears",    label: "Arrears from Previous Months", total: 0 },
  ];

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Top nav bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900">Payroll</h1>
          {/* City toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
            {(["dubai","manila"] as const).map(c => (
              <button key={c} onClick={() => setCity(c)}
                className={`px-4 py-1.5 text-sm font-medium transition ${
                  city === c
                    ? "bg-teal-600 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
                }`}>
                {c === "dubai" ? "Dubai" : "Manila"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/payroll/manila"
            className="flex items-center gap-1.5 rounded-lg border border-violet-400 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100 transition">
            Manila Payroll <ArrowRight size={13} />
          </Link>
          <Link href={`/admin/payroll/loans?city=${city}`}
            className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 transition">
            Loans <ArrowRight size={13} />
          </Link>
          <Link href={`/admin/payroll/leave-salary?city=${city}`}
            className="flex items-center gap-1.5 rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-100 transition">
            Leave Salary <ArrowRight size={13} />
          </Link>
          {selectedCycle && (
            <Link href={`/admin/payroll/transactions?city=${city}&cycle_id=${selectedCycle.id}`}
              className="flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 transition">
              Transactions <ArrowRight size={13} />
            </Link>
          )}
        </div>
      </div>

      {err && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} />{err}
        </div>
      )}

      {/* ── Summary header ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 divide-x divide-gray-200 bg-white border-b border-gray-200">
        <div className="px-6 py-5">
          <p className="text-xs text-gray-500 mb-1">Total net pay for {cycleName}</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{currency} {n(totalNetPay)}</p>
        </div>
        <div className="px-6 py-5">
          <p className="text-xs text-gray-500 mb-1">Processed till date for {cycleName}</p>
          <p className="text-2xl font-bold text-green-600 tabular-nums">
            {selectedCycle?.status === "closed" ? `${currency} ${n(totalNetPay)}` : `${currency} 0.00`}
          </p>
        </div>
        <div className="px-6 py-5">
          <p className="text-xs text-gray-500 mb-1">Total unpaid</p>
          <p className="text-2xl font-bold text-red-500 tabular-nums">
            {selectedCycle?.status === "closed" ? `${currency} 0.00` : `${currency} ${n(totalNetPay)}`}
          </p>
          {rows.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">{rows.length} employees</p>
          )}
        </div>
      </div>

      {/* ── Cycle controls toolbar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white border-b border-gray-200 px-6 py-2">
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-teal-500"
            value={selectedCycle?.id ?? ""}
            onChange={e => {
              const c = cycles.find(x => x.id === Number(e.target.value));
              if (c) setSelectedCycle(c);
            }}
          >
            {cycles.length === 0 && <option value="">No cycles</option>}
            {cycles.map(c => (
              <option key={c.id} value={c.id}>
                {MONTHS[c.month - 1]} {c.year} — {c.status === "open" ? "Open" : "Closed"}
              </option>
            ))}
          </select>
          {selectedCycle && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              selectedCycle.status === "open"
                ? "bg-green-100 text-green-700 border border-green-200"
                : "bg-gray-100 text-gray-600 border border-gray-200"
            }`}>
              {selectedCycle.status === "open" ? "Open" : "Closed"}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
            onClick={() => { void ensureCurrentCycle(); }} disabled={busy}>
            <Plus size={11} /> New Cycle
          </button>
          <button className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
            onClick={() => {
              if (tab === "configs") void loadConfigs(city);
              else if (selectedCycle) void loadTable(selectedCycle.id, city);
            }} disabled={busy}>
            <RefreshCw size={11} className={busy ? "animate-spin" : ""} /> Refresh
          </button>
          {rows.length > 0 && (
            <button className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
              onClick={downloadCSV}>
              <Download size={11} /> Download
            </button>
          )}
          {selectedCycle?.status === "open" && (
            <button className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500 transition disabled:opacity-50"
              onClick={() => { void closeCycle(); }} disabled={closingCycle}>
              {closingCycle ? <Loader2 size={11} className="animate-spin" /> : "Close Cycle"}
            </button>
          )}
          {selectedCycle?.status === "closed" && (
            <button className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
              onClick={() => { void reopenCycle(); }} disabled={closingCycle}>
              {closingCycle ? <Loader2 size={11} className="animate-spin" /> : "Reopen"}
            </button>
          )}
          {selectedCycle?.status === "closed" && rows.length > 0 && (
            <>
              <button
                className="flex items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 transition disabled:opacity-50"
                onClick={() => { void publishCycle(); }}
                disabled={publishingCycle}
                title="スタッフの My Pay に給与明細を公開"
              >
                {publishingCycle ? <Loader2 size={11} className="animate-spin" /> : <><Send size={11} /> スタッフに公開</>}
              </button>
              {(cyclePublishedCount[selectedCycle.id] ?? 0) > 0 && (
                <button
                  className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition"
                  onClick={() => { void unpublishCycle(); }}
                  disabled={publishingCycle}
                  title="公開を取り消す"
                >
                  <EyeOff size={11} /> 非公開に戻す
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-gray-200 bg-white px-6">
        <button
          onClick={() => setTab("table")}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
            tab === "table"
              ? "border-teal-500 text-teal-600"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}>
          Payroll Table
        </button>
        <button
          onClick={() => setTab("configs")}
          className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition ${
            tab === "configs"
              ? "border-teal-500 text-teal-600"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}>
          <Settings size={13} /> Salary Configs
        </button>
      </div>

      <div className="px-6 py-4">

        {/* ── Payroll Table Tab ─────────────────────────────────────────────── */}
        {tab === "table" && (
          <>
            {/* Column selector */}
            {rows.length > 0 && (
              <div className="mb-4 rounded-xl border border-gray-200 bg-white shadow-sm">
                <button
                  className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700"
                  onClick={() => setShowColSelector(p => !p)}>
                  <span>Selected columns on the payroll table</span>
                  {showColSelector ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                </button>
                {showColSelector && (
                  <div className="border-t border-gray-100 px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2">
                    {COL_DEFS.map(({ key, label, total }) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={visibleCols[key]}
                          onChange={() => toggleCol(key)}
                          className="accent-teal-600 w-4 h-4 rounded"
                        />
                        <span className="text-xs text-gray-700 group-hover:text-gray-900 transition">
                          {label}
                          <span className="text-gray-400 ml-1">({currency} {n(total)})</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Missing info warning */}
            {missingRows.length > 0 && (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <AlertCircle size={15} className="text-amber-500 shrink-0" />
                <span className="text-sm text-amber-700">
                  {missingRows.length} {missingRows.length === 1 ? "employee is" : "employees are"} missing basic salary information.
                </span>
                <button
                  onClick={() => setFilterMissing(p => !p)}
                  className="ml-auto flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition">
                  <Filter size={11} />
                  {filterMissing ? "Show All" : `Filter ${missingRows.length} employees`}
                </button>
              </div>
            )}

            {/* Table */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              {busy && rows.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
                  <Loader2 size={28} className="animate-spin" />
                  <p className="text-sm">Loading payroll data…</p>
                </div>
              ) : rows.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-gray-300">
                  <DollarSign size={32} />
                  <p className="text-sm text-gray-400">No salary configs for this cycle.</p>
                  <p className="text-xs text-gray-400">Add employees in the Salary Configs tab first.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: "800px" }}>
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="w-10 px-3 py-3 text-left">
                          <input type="checkbox" className="accent-teal-600 w-4 h-4 rounded" readOnly />
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">ID</th>
                        <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
                        {visibleCols.basic      && <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Basic Salary</th>}
                        {visibleCols.allowances && <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Allowances</th>}
                        {visibleCols.gross      && <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Gross Pay</th>}
                        {visibleCols.workExp    && <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Work Exp.</th>}
                        {visibleCols.netAdd     && <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Net Add.</th>}
                        {visibleCols.netDed     && <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Net Ded.</th>}
                        {visibleCols.arrears    && <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Arrears</th>}
                        <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Net Pay</th>
                        <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Paid Via</th>
                        <th className="w-8" />
                      </tr>
                      {/* Column totals row */}
                      <tr className="border-b border-gray-100 bg-gray-50/60 text-xs">
                        <td colSpan={3} className="px-3 py-2 text-right font-medium text-gray-500">Totals</td>
                        {visibleCols.basic      && <td className="px-3 py-2 text-right tabular-nums text-gray-700 font-medium">{n(totalBasic)}</td>}
                        {visibleCols.allowances && <td className="px-3 py-2 text-right tabular-nums text-gray-700 font-medium">{n(totalAllowances)}</td>}
                        {visibleCols.gross      && <td className="px-3 py-2 text-right tabular-nums text-gray-700 font-medium">{n(totalGross)}</td>}
                        {visibleCols.workExp    && <td className="px-3 py-2 text-right tabular-nums text-gray-400">0.00</td>}
                        {visibleCols.netAdd     && <td className="px-3 py-2 text-right tabular-nums text-green-600 font-medium">{n(totalNetAdd)}</td>}
                        {visibleCols.netDed     && <td className="px-3 py-2 text-right tabular-nums text-red-500 font-medium">{n(totalNetDed)}</td>}
                        {visibleCols.arrears    && <td className="px-3 py-2 text-right tabular-nums text-gray-400">0.00</td>}
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-gray-900">{n(totalNetPay)}</td>
                        <td colSpan={2} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {displayRows.map((row, idx) => {
                        const isMissing = row.basic_salary === 0;
                        return (
                          <tr key={row.staff_name}
                            className={`transition hover:bg-gray-50 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                            <td className="px-3 py-3">
                              <input type="checkbox" className="accent-teal-600 w-4 h-4 rounded" readOnly />
                            </td>
                            <td className="px-3 py-3 text-xs font-mono text-gray-400">{row.bayzat_id || "—"}</td>
                            <td className="px-3 py-3">
                              <p className={`font-medium ${isMissing ? "text-gray-500" : "text-gray-900"}`}>{row.staff_name}</p>
                              <p className="text-xs text-gray-400">{row.role_title || ""}{row.role_title && row.branch_code ? " · " : ""}{row.branch_code || ""}</p>
                              {isMissing && (
                                <p className="text-xs text-red-500 mt-0.5">Missing Basic Salary and Allowances</p>
                              )}
                            </td>
                            {visibleCols.basic      && <td className="px-3 py-3 text-right tabular-nums text-gray-700">{row.basic_salary.toFixed(2)}</td>}
                            {visibleCols.allowances && <td className="px-3 py-3 text-right tabular-nums text-gray-700">{(row.allowances ?? 0).toFixed(2)}</td>}
                            {visibleCols.gross      && <td className="px-3 py-3 text-right tabular-nums text-gray-700">{row.gross_pay.toFixed(2)}</td>}
                            {visibleCols.workExp    && <td className="px-3 py-3 text-right tabular-nums text-gray-400">0.00</td>}
                            {visibleCols.netAdd     && (
                              <td className="px-3 py-3 text-right tabular-nums">
                                {row.net_additions > 0
                                  ? <span className="text-green-600">{row.net_additions.toFixed(2)}</span>
                                  : <span className="text-gray-300">0.00</span>}
                              </td>
                            )}
                            {visibleCols.netDed     && (
                              <td className="px-3 py-3 text-right tabular-nums">
                                {row.net_deductions > 0
                                  ? <span className="text-red-500">-{row.net_deductions.toFixed(2)}</span>
                                  : <span className="text-gray-300">0.00</span>}
                              </td>
                            )}
                            {visibleCols.arrears    && <td className="px-3 py-3 text-right tabular-nums text-gray-300">0.00</td>}
                            <td className="px-3 py-3 text-right tabular-nums font-bold text-gray-900">
                              {row.net_pay.toFixed(2)}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`text-xs font-medium capitalize px-2 py-0.5 rounded-full ${
                                row.paid_via === "bank"
                                  ? "bg-blue-100 text-blue-700 border border-blue-200"
                                  : "bg-gray-100 text-gray-600 border border-gray-200"
                              }`}>
                                {row.paid_via === "bank" ? "Bank" : "Cash"}
                              </span>
                            </td>
                            <td className="pr-2">
                              <button className="text-gray-300 hover:text-teal-500 transition"
                                onClick={() => setDetailRow(row)}>
                                <ChevronRight size={14} />
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
          </>
        )}

        {/* ── Salary Configs Tab ──────────────────────────────────────────────── */}
        {tab === "configs" && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
              <p className="text-sm font-semibold text-gray-700">{configs.length} employees configured</p>
              <button
                className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-500 transition"
                onClick={() => { setEditingConfig(null); setShowConfigModal(true); }}>
                <Plus size={13} /> Add Employee
              </button>
            </div>

            {busy && configs.length === 0 ? (
              <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-teal-500" /></div>
            ) : configs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-gray-300">
                <Users size={32} />
                <p className="text-sm text-gray-400">No salary configs yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: "700px" }}>
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Employee</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Basic</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Accomm.</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Transport</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Other</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Currency</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Paid Via</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {configs.map((cfg, idx) => (
                      <tr key={cfg.staff_name}
                        className={`hover:bg-gray-50 transition ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{cfg.staff_name}</p>
                          <p className="text-xs text-gray-400">{cfg.bayzat_id || ""}{cfg.bayzat_id && cfg.role_title ? " · " : ""}{cfg.role_title || ""}</p>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700">{cfg.basic_salary.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700">{cfg.accommodation.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700">{cfg.transportation.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700">{cfg.other_allowances.toFixed(2)}</td>
                        <td className="px-4 py-3 text-center text-xs text-gray-500">{cfg.currency}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-medium capitalize px-2 py-0.5 rounded-full ${
                            cfg.paid_via === "bank"
                              ? "bg-blue-100 text-blue-700 border border-blue-200"
                              : "bg-gray-100 text-gray-600 border border-gray-200"
                          }`}>
                            {cfg.paid_via === "bank" ? "Bank" : "Cash"}
                          </span>
                        </td>
                        <td className="py-3 pr-3">
                          <button
                            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition"
                            onClick={() => { setEditingConfig(cfg); setShowConfigModal(true); }}>
                            <Pencil size={11} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Employee Detail Side Panel */}
      {detailRow && (
        <EmployeeDetailPanel row={detailRow} onClose={() => setDetailRow(null)} />
      )}

      {/* Config Modal */}
      {showConfigModal && (
        <ConfigModal
          city={city}
          config={editingConfig}
          onSave={onConfigSaved}
          onClose={() => { setShowConfigModal(false); setEditingConfig(null); }}
        />
      )}
    </div>
  );
}
