"use client";

import {
  AlertCircle, ArrowRight, ChevronDown, ChevronRight, Download, DollarSign,
  Loader2, Pencil, Plus, RefreshCw, Settings, TrendingUp, Users, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import {
  BADGE_ERROR, BADGE_INFO, BADGE_SUCCESS, BADGE_WARNING,
  DANGER_BUTTON, GLASS_CARD, INPUT_CLASS, KPI_CARD, KPI_LABEL, KPI_VALUE,
  PRIMARY_BUTTON, SECONDARY_BUTTON, SELECT_CLASS, SMALL_BUTTON,
  T_PAGE_TITLE, TAB_ACTIVE, TAB_INACTIVE, TABLE_CELL, TABLE_HEADER, TABLE_ROW,
} from "@/lib/ui-tokens";

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

function fmt(n: number, currency = "AED") {
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  const labelCls = "block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className={`${GLASS_CARD} w-full max-w-lg p-6 relative`}>
        <button onClick={onClose} className="absolute right-4 top-4 text-zinc-500 hover:text-white"><X size={18} /></button>
        <h3 className="text-lg font-semibold text-white mb-4">{config ? "Edit Salary Config" : "Add Salary Config"}</h3>

        {err && <p className={`${BADGE_ERROR} mb-3 w-full justify-center py-2 rounded-xl`}>{err}</p>}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Staff Name *</label>
            <input className={INPUT_CLASS} value={form.staff_name} onChange={e => set("staff_name", e.target.value)}
              placeholder="Full name (matching OS Attendance)" disabled={!!config} />
          </div>
          <div>
            <label className={labelCls}>Bayzat ID</label>
            <input className={INPUT_CLASS} value={form.bayzat_id} onChange={e => set("bayzat_id", e.target.value)} placeholder="e.g. PH25018" />
          </div>
          <div>
            <label className={labelCls}>Branch Code</label>
            <input className={INPUT_CLASS} value={form.branch_code} onChange={e => set("branch_code", e.target.value)} placeholder="e.g. ZEN_DUBAI" />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Role / Title</label>
            <input className={INPUT_CLASS} value={form.role_title} onChange={e => set("role_title", e.target.value)} placeholder="e.g. Apprentice Cook" />
          </div>

          <div>
            <label className={labelCls}>Basic Salary</label>
            <input className={INPUT_CLASS} type="number" min="0" value={form.basic_salary} onChange={e => set("basic_salary", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Accommodation</label>
            <input className={INPUT_CLASS} type="number" min="0" value={form.accommodation} onChange={e => set("accommodation", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Transportation</label>
            <input className={INPUT_CLASS} type="number" min="0" value={form.transportation} onChange={e => set("transportation", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Other Allowances</label>
            <input className={INPUT_CLASS} type="number" min="0" value={form.other_allowances} onChange={e => set("other_allowances", e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Currency</label>
            <select className={SELECT_CLASS} value={form.currency} onChange={e => set("currency", e.target.value)}>
              <option value="AED">AED</option>
              <option value="PHP">PHP</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Paid Via</label>
            <select className={SELECT_CLASS} value={form.paid_via} onChange={e => set("paid_via", e.target.value)}>
              <option value="cash">Cash</option>
              <option value="bank">Bank Transfer</option>
            </select>
          </div>
          {form.paid_via === "bank" && (
            <div className="col-span-2">
              <label className={labelCls}>Bank Name</label>
              <input className={INPUT_CLASS} value={form.bank_name} onChange={e => set("bank_name", e.target.value)} placeholder="e.g. Emirates NBD" />
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className={SECONDARY_BUTTON} onClick={onClose} disabled={busy}>Cancel</button>
          <button className={PRIMARY_BUTTON} onClick={() => { void save(); }} disabled={busy}>
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
    { label: "Net Deductions", value: -row.net_deductions, section: "Adjustments", negative: true },
    { label: "Net Pay", value: row.net_pay, section: "Total", bold: true },
  ];
  const sections = ["Base", "Subtotal", "Adjustments", "Total"];

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className={`${GLASS_CARD} h-full w-full max-w-sm overflow-y-auto rounded-none border-l`}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-zinc-900/95 px-5 py-4 backdrop-blur-sm">
          <div>
            <p className="font-semibold text-white">{row.staff_name}</p>
            <p className="text-xs text-zinc-400">{row.role_title || "—"} · {row.branch_code || "—"}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className={`${BADGE_INFO} text-xs`}>Currency: {row.currency}</div>

          {sections.map(sec => {
            const secItems = items.filter(i => i.section === sec);
            return (
              <div key={sec}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">{sec}</p>
                {secItems.map(item => (
                  <div key={item.label} className={`flex justify-between py-2 ${item.bold ? "border-t border-white/10 font-semibold" : "border-t border-white/5"}`}>
                    <span className={`text-sm ${item.bold ? "text-white" : "text-zinc-300"}`}>{item.label}</span>
                    <span className={`text-sm tabular-nums ${item.positive ? "text-emerald-400" : item.negative ? "text-red-400" : item.bold ? "text-white" : "text-zinc-200"}`}>
                      {fmt(item.value, row.currency)}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}

          <div className="pt-3 border-t border-white/10">
            <div className="flex justify-between">
              <span className="text-xs text-zinc-400">Paid Via</span>
              <span className="text-xs capitalize text-zinc-200">{row.paid_via}</span>
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

  const [city, setCity] = useState<"dubai" | "manila">("dubai");
  const [tab, setTab] = useState<Tab>("table");
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<Cycle | null>(null);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [totalNetPay, setTotalNetPay] = useState(0);
  const [configs, setConfigs] = useState<SalaryConfig[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<PayrollRow | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SalaryConfig | null>(null);
  const [closingCycle, setClosingCycle] = useState(false);

  const loadCountRef = useRef(0);

  const loadCycles = useCallback(async (c: string) => {
    const id = ++loadCountRef.current;
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`${API}/cycles?city=${encodeURIComponent(c)}`);
      if (id !== loadCountRef.current) return;
      if (!r.ok) { setErr(await extractApiError(r, "Failed to load cycles")); return; }
      const data = await r.json() as { cycles: Cycle[] };
      setCycles(data.cycles);
      if (data.cycles.length > 0 && !selectedCycle) {
        setSelectedCycle(data.cycles[0]);
      }
    } catch {
      if (id === loadCountRef.current) setErr("Network error — please try again");
    } finally {
      if (id === loadCountRef.current) setBusy(false);
    }
  }, [selectedCycle]);

  const loadTable = useCallback(async (cycleId: number, c: string) => {
    const id = ++loadCountRef.current;
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`${API}/table?city=${encodeURIComponent(c)}&cycle_id=${cycleId}`);
      if (id !== loadCountRef.current) return;
      if (!r.ok) { setErr(await extractApiError(r, "Failed to load payroll table")); return; }
      const data = await r.json() as { rows: PayrollRow[]; total_net_pay: number };
      setRows(data.rows);
      setTotalNetPay(data.total_net_pay);
    } catch {
      if (id === loadCountRef.current) setErr("Network error — please try again");
    } finally {
      if (id === loadCountRef.current) setBusy(false);
    }
  }, []);

  const loadConfigs = useCallback(async (c: string) => {
    const id = ++loadCountRef.current;
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`${API}/salary-configs?city=${encodeURIComponent(c)}`);
      if (id !== loadCountRef.current) return;
      if (!r.ok) { setErr(await extractApiError(r, "Failed to load configs")); return; }
      const data = await r.json() as { configs: SalaryConfig[] };
      setConfigs(data.configs);
    } catch {
      if (id === loadCountRef.current) setErr("Network error — please try again");
    } finally {
      if (id === loadCountRef.current) setBusy(false);
    }
  }, []);

  // On city change
  useEffect(() => {
    setSelectedCycle(null);
    setRows([]);
    setConfigs([]);
    void loadCycles(city);
  }, [city]); // eslint-disable-line react-hooks/exhaustive-deps

  // On cycle change
  useEffect(() => {
    if (selectedCycle && tab === "table") void loadTable(selectedCycle.id, city);
  }, [selectedCycle, tab, city]); // eslint-disable-line react-hooks/exhaustive-deps

  // On tab change to configs
  useEffect(() => {
    if (tab === "configs") void loadConfigs(city);
  }, [tab, city]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ensureCurrentCycle() {
    const now = new Date();
    const r = await apiFetch(`${API}/cycles?city=${encodeURIComponent(city)}`, {
      method: "POST",
      body: JSON.stringify(null),
    });
    if (!r.ok) return;
    // Reload cycles
    await loadCycles(city);
  }

  async function closeCycle() {
    if (!selectedCycle) return;
    if (!confirm(`Close ${MONTHS[selectedCycle.month - 1]} ${selectedCycle.year} payroll? This cannot be easily undone.`)) return;
    setClosingCycle(true);
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
    const r = await apiFetch(`${API}/cycles/${selectedCycle.id}/reopen`, { method: "PATCH" });
    if (!r.ok) { setErr(await extractApiError(r, "Failed to reopen cycle")); return; }
    const data = await r.json() as { cycle: Cycle };
    setSelectedCycle(data.cycle);
    setCycles(prev => prev.map(c => c.id === data.cycle.id ? data.cycle : c));
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
    setConfigs(prev => {
      const idx = prev.findIndex(x => x.staff_name === c.staff_name);
      if (idx >= 0) { const next = [...prev]; next[idx] = c; return next; }
      return [...prev, c].sort((a, b) => a.staff_name.localeCompare(b.staff_name));
    });
    setShowConfigModal(false);
    setEditingConfig(null);
  }

  const currency = city === "manila" ? "PHP" : "AED";

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-slate-900 to-zinc-900 p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Payroll</h1>
          <p className="mt-1 text-sm text-zinc-400">Monthly salary processing and adjustments</p>
        </div>
        <div className="flex items-center gap-2">
          {/* City toggle */}
          {(["dubai","manila"] as const).map(c => (
            <button key={c} onClick={() => setCity(c)}
              className={city === c ? TAB_ACTIVE : TAB_INACTIVE}>
              {c === "dubai" ? "Dubai" : "Manila"}
            </button>
          ))}
          {selectedCycle && (
            <Link
              href={`/admin/payroll/transactions?city=${city}&cycle_id=${selectedCycle.id}`}
              className="flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm font-medium text-violet-300 transition hover:bg-violet-500/20"
            >
              Transactions <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      {err && (
        <div className={`${BADGE_ERROR} mb-4 w-full justify-center py-3 rounded-xl text-sm`}>
          <AlertCircle size={14} />{err}
        </div>
      )}

      {/* Cycle Picker + Status */}
      <div className={`${GLASS_CARD} p-4 mb-6`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Payroll Cycle</label>
            <select
              className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
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
          </div>

          {selectedCycle && (
            <span className={selectedCycle.status === "open" ? BADGE_SUCCESS : BADGE_INFO}>
              {selectedCycle.status === "open" ? "Open" : "Closed"}
            </span>
          )}

          <div className="ml-auto flex gap-2">
            <button className={SMALL_BUTTON} onClick={() => { void ensureCurrentCycle(); }}>
              <Plus size={12} /> New Cycle
            </button>
            <button className={SMALL_BUTTON} onClick={() => {
              if (selectedCycle) void loadTable(selectedCycle.id, city);
            }} disabled={busy}>
              <RefreshCw size={12} className={busy ? "animate-spin" : ""} /> Refresh
            </button>
            {tab === "table" && rows.length > 0 && (
              <button className={SMALL_BUTTON} onClick={downloadCSV}>
                <Download size={12} /> Download
              </button>
            )}
            {selectedCycle?.status === "open" && tab === "table" && (
              <button className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                onClick={() => { void closeCycle(); }} disabled={closingCycle}>
                {closingCycle ? <Loader2 size={12} className="animate-spin" /> : "Close Cycle"}
              </button>
            )}
            {selectedCycle?.status === "closed" && (
              <button className={SMALL_BUTTON} onClick={() => { void reopenCycle(); }}>Reopen</button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      {tab === "table" && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className={KPI_CARD}>
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={14} className="text-violet-400" />
              <p className={KPI_LABEL}>Total Net Pay</p>
            </div>
            <p className={KPI_VALUE}>{fmt(totalNetPay, currency)}</p>
          </div>
          <div className={KPI_CARD}>
            <div className="flex items-center gap-2 mb-1">
              <Users size={14} className="text-violet-400" />
              <p className={KPI_LABEL}>Employees</p>
            </div>
            <p className={KPI_VALUE}>{rows.length}</p>
          </div>
          <div className={KPI_CARD}>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} className="text-violet-400" />
              <p className={KPI_LABEL}>Avg Net Pay</p>
            </div>
            <p className={KPI_VALUE}>{fmt(rows.length ? totalNetPay / rows.length : 0, currency)}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        <button className={tab === "table" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("table")}>
          Payroll Table
        </button>
        <button className={tab === "configs" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("configs")}>
          <Settings size={14} />Salary Configs
        </button>
      </div>

      {/* ── Payroll Table Tab ── */}
      {tab === "table" && (
        <div className={GLASS_CARD}>
          {busy && rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-white/30">
              <Loader2 size={28} className="animate-spin" />
              <p className="text-sm">Loading payroll data…</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-white/30">
              <DollarSign size={32} />
              <p className="text-sm">No salary configs for this cycle.</p>
              <p className="text-xs">Add employees in the Salary Configs tab first.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr>
                    <th className="w-6" />
                    <th className={`${TABLE_HEADER} text-left px-3 py-3`}>Employee</th>
                    <th className={`${TABLE_HEADER} text-right px-3 py-3`}>Basic Salary</th>
                    <th className={`${TABLE_HEADER} text-right px-3 py-3`}>Allowances</th>
                    <th className={`${TABLE_HEADER} text-right px-3 py-3`}>Gross Pay</th>
                    <th className={`${TABLE_HEADER} text-right px-3 py-3`}>Net Add.</th>
                    <th className={`${TABLE_HEADER} text-right px-3 py-3`}>Net Ded.</th>
                    <th className={`${TABLE_HEADER} text-right px-3 py-3`}>Net Pay</th>
                    <th className={`${TABLE_HEADER} text-right px-3 py-3`}>Paid Via</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.staff_name} className={TABLE_ROW}>
                      <td className="pl-3">
                        <button className="text-zinc-500 hover:text-violet-300"
                          onClick={() => setDetailRow(row)}>
                          <ChevronRight size={14} />
                        </button>
                      </td>
                      <td className={`${TABLE_CELL} px-3`}>
                        <p className="font-medium text-white">{row.staff_name}</p>
                        <p className="text-xs text-zinc-500">{row.role_title || "—"} · {row.branch_code || "—"}</p>
                      </td>
                      <td className={`${TABLE_CELL} px-3 text-right tabular-nums`}>{row.basic_salary.toFixed(2)}</td>
                      <td className={`${TABLE_CELL} px-3 text-right tabular-nums`}>{row.allowances.toFixed(2)}</td>
                      <td className={`${TABLE_CELL} px-3 text-right tabular-nums`}>{row.gross_pay.toFixed(2)}</td>
                      <td className={`${TABLE_CELL} px-3 text-right tabular-nums text-emerald-400`}>
                        {row.net_additions > 0 ? `+${row.net_additions.toFixed(2)}` : "—"}
                      </td>
                      <td className={`${TABLE_CELL} px-3 text-right tabular-nums text-red-400`}>
                        {row.net_deductions > 0 ? `-${row.net_deductions.toFixed(2)}` : "—"}
                      </td>
                      <td className={`${TABLE_CELL} px-3 text-right tabular-nums font-semibold text-violet-300`}>
                        {row.net_pay.toFixed(2)}
                      </td>
                      <td className={`${TABLE_CELL} px-3 text-right`}>
                        <span className="text-xs capitalize text-zinc-400">{row.paid_via}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-white/10">
                    <td colSpan={7} className="px-3 py-3 text-right text-sm font-semibold text-zinc-400">Total Net Pay</td>
                    <td className="px-3 py-3 text-right text-base font-bold tabular-nums text-white">
                      {fmt(totalNetPay, currency)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Salary Configs Tab ── */}
      {tab === "configs" && (
        <div className={GLASS_CARD}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
            <p className="text-sm font-semibold text-white">{configs.length} employees configured</p>
            <button className={PRIMARY_BUTTON + " text-sm py-2 px-4 flex items-center gap-1.5"}
              onClick={() => { setEditingConfig(null); setShowConfigModal(true); }}>
              <Plus size={14} /> Add Employee
            </button>
          </div>

          {busy && configs.length === 0 ? (
            <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-violet-400" /></div>
          ) : configs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-white/30">
              <Users size={32} />
              <p className="text-sm">No salary configs yet.</p>
              <p className="text-xs">Add an employee to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr>
                    <th className={`${TABLE_HEADER} text-left px-4 py-3`}>Employee</th>
                    <th className={`${TABLE_HEADER} text-right px-4 py-3`}>Basic</th>
                    <th className={`${TABLE_HEADER} text-right px-4 py-3`}>Accomm.</th>
                    <th className={`${TABLE_HEADER} text-right px-4 py-3`}>Transport</th>
                    <th className={`${TABLE_HEADER} text-right px-4 py-3`}>Other</th>
                    <th className={`${TABLE_HEADER} text-center px-4 py-3`}>Currency</th>
                    <th className={`${TABLE_HEADER} text-center px-4 py-3`}>Paid Via</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {configs.map(cfg => (
                    <tr key={cfg.staff_name} className={TABLE_ROW}>
                      <td className={`${TABLE_CELL} px-4`}>
                        <p className="font-medium text-white">{cfg.staff_name}</p>
                        <p className="text-xs text-zinc-500">{cfg.role_title || "—"} · {cfg.branch_code || "—"}</p>
                      </td>
                      <td className={`${TABLE_CELL} px-4 text-right tabular-nums`}>{cfg.basic_salary.toFixed(2)}</td>
                      <td className={`${TABLE_CELL} px-4 text-right tabular-nums`}>{cfg.accommodation.toFixed(2)}</td>
                      <td className={`${TABLE_CELL} px-4 text-right tabular-nums`}>{cfg.transportation.toFixed(2)}</td>
                      <td className={`${TABLE_CELL} px-4 text-right tabular-nums`}>{cfg.other_allowances.toFixed(2)}</td>
                      <td className={`${TABLE_CELL} px-4 text-center text-xs`}>{cfg.currency}</td>
                      <td className={`${TABLE_CELL} px-4 text-center`}>
                        <span className="text-xs capitalize text-zinc-400">{cfg.paid_via}</span>
                      </td>
                      <td className="py-3 pr-3">
                        <button className={SMALL_BUTTON + " p-1.5"}
                          onClick={() => { setEditingConfig(cfg); setShowConfigModal(true); }}>
                          <Pencil size={12} />
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
