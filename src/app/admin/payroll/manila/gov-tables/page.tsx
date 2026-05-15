"use client";

import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronLeft,
  Info, Loader2, RefreshCw, Shield, Upload, X, FileSpreadsheet,
  Tag, ToggleLeft, ToggleRight, Plus, Pencil, Save,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import {
  GLASS_CARD, TAB_CONTAINER, TAB_ACTIVE, TAB_INACTIVE,
  TABLE_HEADER, TABLE_ROW, TABLE_CELL,
} from "@/lib/ui-tokens";

const API = "/api/admin/manila-payroll";

function apiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const method = (opts?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["Content-Type"] = "application/json";
  if (auth?.accessToken) headers["Authorization"] = `Bearer ${auth.accessToken}`;
  return fetch(path, { ...opts, headers: { ...headers, ...(opts?.headers as Record<string, string> ?? {}) } });
}

// ── Types ──────────────────────────────────────────────────────────────────────

type PayRateRule = {
  id: number;
  day_type: string;
  worked: boolean;
  base_day_multiplier: string;
  ot_hourly_multiplier: string;
  is_base_included_in_monthly: boolean;
  requires_cpa_confirmation: boolean;
  effective_from: string;
  is_active: boolean;
  notes: string | null;
};

type SssRow = {
  id: number;
  effective_from: string;
  compensation_min: string;
  compensation_max: string | null;
  msc: string;
  ee_share: string;
  er_share: string;
  ec_share: string;
  total_share: string;
  source_version: string | null;
};

type SssUploadRow = {
  compensation_min: string;
  compensation_max: string;
  msc: string;
  ee_share: string;
  er_share: string;
  ec_share: string;
  total_share: string;
};

type PhilhealthRow = {
  id: number;
  rate_percent: string;
  basis_min: string;
  basis_max: string;
  ee_share_percent: string;
  effective_from: string;
};

type PagibigRow = {
  id: number;
  salary_min: string | null;
  salary_max: string | null;
  ee_rate_percent: string;
  er_rate_percent: string;
  fund_salary_cap: string;
  max_ee_contribution: string;
  max_er_contribution: string;
  effective_from: string;
};

type BirBracket = {
  id: number;
  annual_from: string;
  annual_to: string | null;
  base_tax: string;
  excess_rate_percent: string;
  effective_from: string;
};

type GovTables = {
  pay_rate_rules: PayRateRule[];
  sss: SssRow[];
  philhealth: PhilhealthRow[];
  pagibig: PagibigRow[];
  bir: BirBracket[];
};

type AllowanceType = {
  id: number;
  code: string;
  label: string;
  category: string;
  is_taxable: boolean;
  de_minimis_monthly_limit: string | null;
  bir_basis: string | null;
  is_active: boolean;
  updated_at: string;
};

type BirUploadRow = {
  annual_from: string;
  annual_to: string;
  base_tax: string;
  excess_rate_pct: string;
  excess_over: string;
};

type TabId = "pay_rules" | "sss" | "philhealth" | "pagibig" | "bir" | "allowances";

const DAY_TYPE_LABELS: Record<string, string> = {
  ordinary:                               "Ordinary Day",
  rest_day:                               "Rest Day",
  regular_holiday:                        "Regular Holiday",
  special_non_working_holiday:            "Special Non-Working Holiday",
  regular_holiday_and_rest_day:           "Regular Holiday + Rest Day",
  special_holiday_and_rest_day:           "Special Holiday + Rest Day",
};

function dec(v: string | number, dp = 2) { return parseFloat(String(v)).toFixed(dp); }
function php(v: string | number) { return `₱${parseFloat(String(v)).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export default function GovTablesPage() {
  const router = useRouter();
  const [data, setData] = useState<GovTables | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("pay_rules");
  const loadRef = useRef(0);

  // SSS upload modal state
  const [sssModal, setSssModal] = useState(false);
  const [sssEffectiveDate, setSssEffectiveDate] = useState("");
  const [sssSourceVersion, setSssSourceVersion] = useState("");
  const [sssCsvText, setSssCsvText] = useState("");
  const [sssPreview, setSssPreview] = useState<SssUploadRow[] | null>(null);
  const [sssParsError, setSssParsError] = useState("");
  const [sssUploading, setSssUploading] = useState(false);
  const [sssUploadMsg, setSssUploadMsg] = useState("");

  function parseSssCsv(text: string): SssUploadRow[] {
    const lines = text.trim().split("\n").filter(l => l.trim() && !l.trim().startsWith("#"));
    return lines.map((line, i) => {
      const cols = line.split(/[,\t]/).map(c => c.trim());
      if (cols.length < 5) throw new Error(`Row ${i + 1}: need at least 5 columns (comp_min, comp_max, msc, ee_share, er_share)`);
      const [comp_min, comp_max, msc, ee, er, ec] = cols;
      const ecVal = ec ?? "10.00";
      const total = (parseFloat(ee || "0") + parseFloat(er || "0") + parseFloat(ecVal)).toFixed(2);
      return {
        compensation_min: comp_min,
        compensation_max: comp_max === "" || comp_max?.toLowerCase() === "null" ? "" : comp_max,
        msc,
        ee_share: ee,
        er_share: er,
        ec_share: ecVal,
        total_share: total,
      };
    });
  }

  function handleSssParsePreview() {
    setSssParsError(""); setSssPreview(null);
    if (!sssEffectiveDate) { setSssParsError("Effective date is required."); return; }
    try {
      const rows = parseSssCsv(sssCsvText);
      if (rows.length === 0) { setSssParsError("No rows parsed."); return; }
      setSssPreview(rows);
    } catch (e) { setSssParsError(String(e)); }
  }

  // BIR upload modal state
  const [birModal, setBirModal] = useState(false);
  const [birEffectiveDate, setBirEffectiveDate] = useState("");
  const [birSourceVersion, setBirSourceVersion] = useState("");
  const [birCsvText, setBirCsvText] = useState("");
  const [birPreview, setBirPreview] = useState<BirUploadRow[] | null>(null);
  const [birParsError, setBirParsError] = useState("");
  const [birUploading, setBirUploading] = useState(false);
  const [birUploadMsg, setBirUploadMsg] = useState("");

  function parseBirCsv(text: string): BirUploadRow[] {
    const lines = text.trim().split("\n").filter(l => l.trim() && !l.trim().startsWith("#"));
    return lines.map((line, i) => {
      const cols = line.split(/[,\t]/).map(c => c.trim());
      if (cols.length < 5) throw new Error(`Row ${i + 1}: need 5 columns (annual_from, annual_to, base_tax, excess_rate_pct%, excess_over)`);
      const [from, to, base, rate, over] = cols;
      return { annual_from: from, annual_to: to, base_tax: base, excess_rate_pct: rate, excess_over: over };
    });
  }

  function handleBirParsePreview() {
    setBirParsError(""); setBirPreview(null);
    if (!birEffectiveDate) { setBirParsError("Effective date is required."); return; }
    try {
      const rows = parseBirCsv(birCsvText);
      if (rows.length === 0) { setBirParsError("No rows parsed."); return; }
      setBirPreview(rows);
    } catch (e) { setBirParsError(String(e)); }
  }

  async function handleBirUpload() {
    if (!birPreview || !birEffectiveDate) return;
    setBirUploading(true); setBirUploadMsg("");
    try {
      const r = await apiFetch(`${API}/bir/upload`, {
        method: "POST",
        body: JSON.stringify({
          effective_from: birEffectiveDate,
          source_version: birSourceVersion || `BIR ${birEffectiveDate.slice(0, 4)}`,
          rows: birPreview,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const res = await r.json() as { inserted: number };
      setBirUploadMsg(`✓ ${res.inserted} brackets uploaded successfully.`);
      setBirPreview(null); setBirCsvText(""); setBirEffectiveDate(""); setBirSourceVersion("");
      await load();
      setTimeout(() => { setBirModal(false); setBirUploadMsg(""); }, 2000);
    } catch (e) { setBirUploadMsg(`Error: ${String(e)}`); }
    finally { setBirUploading(false); }
  }

  // Allowance types state
  const [allowanceTypes, setAllowanceTypes] = useState<AllowanceType[]>([]);
  const [allowanceLoading, setAllowanceLoading] = useState(false);
  const [allowanceError, setAllowanceError] = useState("");
  const [editingAllowance, setEditingAllowance] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<AllowanceType>>({});
  const [addingNew, setAddingNew] = useState(false);
  const [newForm, setNewForm] = useState({ code: "", label: "", category: "other", is_taxable: true, de_minimis_monthly_limit: "", bir_basis: "" });
  const [savingId, setSavingId] = useState<number | null>(null);

  const loadAllowanceTypes = useCallback(async () => {
    setAllowanceLoading(true); setAllowanceError("");
    try {
      const r = await apiFetch(`${API}/allowance-types`);
      if (!r.ok) throw new Error(await r.text());
      setAllowanceTypes(await r.json() as AllowanceType[]);
    } catch (e) { setAllowanceError(String(e)); }
    finally { setAllowanceLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === "allowances") void loadAllowanceTypes();
  }, [activeTab, loadAllowanceTypes]);

  async function toggleTaxable(at: AllowanceType) {
    setSavingId(at.id);
    try {
      const r = await apiFetch(`${API}/allowance-types/${at.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_taxable: !at.is_taxable }),
      });
      if (!r.ok) throw new Error(await r.text());
      setAllowanceTypes(prev => prev.map(x => x.id === at.id ? { ...x, is_taxable: !x.is_taxable } : x));
    } catch (e) { setAllowanceError(String(e)); }
    finally { setSavingId(null); }
  }

  async function saveEditAllowance(id: number) {
    setSavingId(id);
    try {
      const r = await apiFetch(`${API}/allowance-types/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          label: editForm.label,
          category: editForm.category,
          is_taxable: editForm.is_taxable,
          de_minimis_monthly_limit: editForm.de_minimis_monthly_limit ? parseFloat(String(editForm.de_minimis_monthly_limit)) : null,
          bir_basis: editForm.bir_basis || null,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const updated = await r.json() as AllowanceType;
      setAllowanceTypes(prev => prev.map(x => x.id === id ? updated : x));
      setEditingAllowance(null);
    } catch (e) { setAllowanceError(String(e)); }
    finally { setSavingId(null); }
  }

  async function createAllowanceType() {
    setSavingId(-1);
    try {
      const r = await apiFetch(`${API}/allowance-types`, {
        method: "POST",
        body: JSON.stringify({
          ...newForm,
          de_minimis_monthly_limit: newForm.de_minimis_monthly_limit ? parseFloat(newForm.de_minimis_monthly_limit) : null,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const created = await r.json() as AllowanceType;
      setAllowanceTypes(prev => [...prev, created]);
      setAddingNew(false);
      setNewForm({ code: "", label: "", category: "other", is_taxable: true, de_minimis_monthly_limit: "", bir_basis: "" });
    } catch (e) { setAllowanceError(String(e)); }
    finally { setSavingId(null); }
  }

  async function handleSssUpload() {
    if (!sssPreview || !sssEffectiveDate) return;
    setSssUploading(true); setSssUploadMsg("");
    try {
      const r = await apiFetch(`${API}/sss/upload`, {
        method: "POST",
        body: JSON.stringify({
          effective_from: sssEffectiveDate,
          source_version: sssSourceVersion || `SSS ${sssEffectiveDate.slice(0, 4)}`,
          rows: sssPreview,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const res = await r.json() as { inserted: number };
      setSssUploadMsg(`✓ ${res.inserted} rows uploaded successfully.`);
      setSssPreview(null); setSssCsvText(""); setSssEffectiveDate(""); setSssSourceVersion("");
      await load();
      setTimeout(() => { setSssModal(false); setSssUploadMsg(""); }, 2000);
    } catch (e) { setSssUploadMsg(`Error: ${String(e)}`); }
    finally { setSssUploading(false); }
  }

  useEffect(() => {
    const auth = getAuth();
    const role = auth?.role ?? "";
    if (!auth || (role !== "ADMIN" && role !== "HQ")) {
      router.replace("/week");
    }
  }, [router]);

  const load = useCallback(async () => {
    const seq = ++loadRef.current;
    setLoading(true); setError("");
    try {
      const r = await apiFetch(`${API}/gov-tables`);
      if (seq !== loadRef.current) return;
      if (!r.ok) throw new Error(await r.text());
      setData(await r.json() as GovTables);
    } catch (e) {
      if (seq === loadRef.current) setError(String(e));
    } finally {
      if (seq === loadRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "pay_rules",  label: "Pay Rate Rules" },
    { id: "sss",        label: "SSS" },
    { id: "philhealth", label: "PhilHealth" },
    { id: "pagibig",    label: "Pag-IBIG" },
    { id: "bir",        label: "BIR / TRAIN" },
    { id: "allowances", label: "Allowance Types" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Link href="/admin/payroll/manila"
                className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
                <ChevronLeft size={15} /> Manila Payroll
              </Link>
            </div>
            <h1 className="mt-2 text-3xl font-light tracking-tight text-white flex items-center gap-3">
              <Shield size={28} className="text-violet-400" />
              Government Tables
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Philippine statutory contribution rates and payroll computation rules
            </p>
          </div>
          <button onClick={load} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-900/20 p-4 text-sm text-red-300">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Legend */}
        <div className={GLASS_CARD + " p-4"}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Legend</p>
          <div className="flex flex-wrap gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={13} className="text-emerald-400" />
              <span><span className="text-emerald-300 font-medium">Base included in monthly</span> — 100% base is already in the semi-monthly salary; only the premium (multiplier−1) is added</span>
            </div>
            <div className="flex items-center gap-2">
              <Info size={13} className="text-blue-400" />
              <span><span className="text-blue-300 font-medium">Base NOT included</span> — day falls outside the 26-day base; full multiplier is added on top</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle size={13} className="text-amber-400" />
              <span><span className="text-amber-300 font-medium">Requires CPA confirmation</span> — extreme multiplier; seek legal/CPA sign-off before processing</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={32} className="animate-spin text-violet-400" />
          </div>
        ) : data && (
          <>
            {/* Tab bar */}
            <div className={TAB_CONTAINER}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={activeTab === t.id ? TAB_ACTIVE : TAB_INACTIVE}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Pay Rate Rules tab ─────────────────────────────────────── */}
            {activeTab === "pay_rules" && (
              <div className={GLASS_CARD + " overflow-hidden"}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: "900px" }}>
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Day Type</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-center"}>Worked</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>Base Mult.</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>OT Mult.</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>Effective OT Rate</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-center"}>Base in Monthly</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-center"}>CPA Required</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Effective From</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.pay_rate_rules.map(r => (
                        <tr key={r.id} className={TABLE_ROW}>
                          <td className={TABLE_CELL + " px-4 py-3"}>
                            <span className="font-medium text-white">
                              {DAY_TYPE_LABELS[r.day_type] ?? r.day_type}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              r.worked
                                ? "bg-emerald-900/50 text-emerald-300 border border-emerald-500/30"
                                : "bg-slate-700 text-slate-400"
                            }`}>
                              {r.worked ? "Yes" : "No"}
                            </span>
                          </td>
                          <td className={TABLE_CELL + " px-3 py-3 text-right tabular-nums font-mono"}>
                            {dec(r.base_day_multiplier, 2)}×
                          </td>
                          <td className={TABLE_CELL + " px-3 py-3 text-right tabular-nums font-mono"}>
                            {dec(r.ot_hourly_multiplier, 2)}×
                          </td>
                          <td className={TABLE_CELL + " px-3 py-3 text-right tabular-nums font-mono"}>
                            {r.worked ? (
                              <span className="text-amber-300">
                                {(parseFloat(r.base_day_multiplier) * parseFloat(r.ot_hourly_multiplier)).toFixed(2)}×
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {r.is_base_included_in_monthly ? (
                              <span className="flex items-center justify-center gap-1 text-emerald-400">
                                <CheckCircle2 size={14} />
                                <span className="text-xs">Yes (add premium only)</span>
                              </span>
                            ) : (
                              <span className="flex items-center justify-center gap-1 text-blue-400">
                                <Info size={14} />
                                <span className="text-xs">No (add full mult.)</span>
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {r.requires_cpa_confirmation ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-900/40 border border-amber-500/30 px-2 py-0.5 text-xs text-amber-300">
                                <AlertTriangle size={11} /> Required
                              </span>
                            ) : (
                              <span className="text-xs text-slate-600">—</span>
                            )}
                          </td>
                          <td className={TABLE_CELL + " px-3 py-3 text-slate-400"}>{r.effective_from}</td>
                          <td className={TABLE_CELL + " px-3 py-3 text-slate-500 text-xs max-w-xs truncate"}>{r.notes ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── SSS tab ────────────────────────────────────────────────── */}
            {activeTab === "sss" && (
              <div className={GLASS_CARD + " overflow-hidden"}>
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <p className="text-xs text-slate-400">SSS Contribution Table — bracket-based lookup on monthly salary credit (MSC)</p>
                  <button
                    onClick={() => { setSssModal(true); setSssPreview(null); setSssCsvText(""); setSssParsError(""); setSssUploadMsg(""); }}
                    className="flex items-center gap-1.5 rounded-lg bg-violet-600/20 border border-violet-500/30 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-600/30 transition-colors"
                  >
                    <Upload size={12} /> Update Table
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: "700px" }}>
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className={TABLE_HEADER + " px-4 py-3 text-right"}>Comp. Min</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>Comp. Max</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>MSC</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>EE Share</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>ER Share</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>EC</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>Total</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Effective</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sss.map(r => (
                        <tr key={r.id} className={TABLE_ROW}>
                          <td className={TABLE_CELL + " px-4 py-2.5 text-right tabular-nums"}>{php(r.compensation_min)}</td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums"}>
                            {r.compensation_max ? php(r.compensation_max) : <span className="text-slate-500">No limit</span>}
                          </td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums text-slate-300"}>{php(r.msc)}</td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums text-violet-300 font-medium"}>{php(r.ee_share)}</td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums text-slate-300"}>{php(r.er_share)}</td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums text-slate-500"}>{php(r.ec_share)}</td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums font-semibold"}>{php(r.total_share)}</td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-slate-400 text-xs"}>{r.effective_from}{r.source_version ? <span className="ml-1.5 text-slate-600">({r.source_version})</span> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── PhilHealth tab ─────────────────────────────────────────── */}
            {activeTab === "philhealth" && (
              <div className={GLASS_CARD + " overflow-hidden"}>
                <div className="border-b border-white/10 px-4 py-3">
                  <p className="text-xs text-slate-400">PhilHealth — 2.5% of monthly basic salary (EE) + 2.5% (ER); no floor/ceiling applied</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className={TABLE_HEADER + " px-4 py-3 text-right"}>Rate</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>Basis Min</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>Basis Max</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>EE Share</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Effective From</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.philhealth.map(r => (
                        <tr key={r.id} className={TABLE_ROW}>
                          <td className={TABLE_CELL + " px-4 py-2.5 text-right tabular-nums font-semibold text-violet-300"}>
                            {dec(r.rate_percent, 1)}%
                          </td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums"}>{php(r.basis_min)}</td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums"}>{php(r.basis_max)}</td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums text-slate-400"}>
                            {dec(r.ee_share_percent, 1)}% (50/50 split)
                          </td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-slate-400"}>{r.effective_from}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Pag-IBIG tab ───────────────────────────────────────────── */}
            {activeTab === "pagibig" && (
              <div className={GLASS_CARD + " overflow-hidden"}>
                <div className="border-b border-white/10 px-4 py-3">
                  <p className="text-xs text-slate-400">Pag-IBIG — Fixed contribution: ₱200.00 EE + ₱200.00 ER per employee per month</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className={TABLE_HEADER + " px-4 py-3 text-right"}>Salary Min</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>Salary Max</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>EE Rate</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>ER Rate</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>Fund Cap</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>Max EE</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>Max ER</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Effective From</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.pagibig.map(r => (
                        <tr key={r.id} className={TABLE_ROW}>
                          <td className={TABLE_CELL + " px-4 py-2.5 text-right tabular-nums"}>
                            {r.salary_min ? php(r.salary_min) : <span className="text-slate-500">—</span>}
                          </td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums"}>
                            {r.salary_max ? php(r.salary_max) : <span className="text-slate-500">No limit</span>}
                          </td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums text-violet-300"}>{dec(r.ee_rate_percent, 1)}%</td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums text-slate-300"}>{dec(r.er_rate_percent, 1)}%</td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums"}>{php(r.fund_salary_cap)}</td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums text-violet-300"}>{php(r.max_ee_contribution)}</td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums text-slate-300"}>{php(r.max_er_contribution)}</td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-slate-400"}>{r.effective_from}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── BIR tab ────────────────────────────────────────────────── */}
            {activeTab === "bir" && (
              <div className={GLASS_CARD + " overflow-hidden"}>
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <p className="text-xs text-slate-400">BIR Withholding Tax — TRAIN Law annual brackets; annualized monthly compensation method</p>
                  <button
                    onClick={() => { setBirModal(true); setBirPreview(null); setBirCsvText(""); setBirParsError(""); setBirUploadMsg(""); }}
                    className="flex items-center gap-1.5 rounded-lg bg-violet-600/20 border border-violet-500/30 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-600/30 transition-colors"
                  >
                    <Upload size={12} /> Update Brackets
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className={TABLE_HEADER + " px-4 py-3 text-right"}>Annual Income From</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>Annual Income To</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>Base Tax</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>Excess Rate</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Effective From</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.bir.map(r => (
                        <tr key={r.id} className={TABLE_ROW}>
                          <td className={TABLE_CELL + " px-4 py-2.5 text-right tabular-nums"}>{php(r.annual_from)}</td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums"}>
                            {r.annual_to ? php(r.annual_to) : <span className="text-slate-500">No limit</span>}
                          </td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums text-violet-300"}>{php(r.base_tax)}</td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums font-semibold"}>
                            {dec(r.excess_rate_percent, 1)}%
                          </td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-slate-400"}>{r.effective_from}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

            {/* ── Allowance Types tab ────────────────────────────────────── */}
            {activeTab === "allowances" && (
              <div className={GLASS_CARD + " overflow-hidden"}>
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-white flex items-center gap-2"><Tag size={15} className="text-violet-400" /> Allowance Taxability Classification</p>
                    <p className="text-xs text-slate-400 mt-0.5">BIR / TRAIN Law — define which allowances are taxable vs non-taxable (de minimis)</p>
                  </div>
                  <button
                    onClick={() => setAddingNew(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-violet-600/20 border border-violet-500/30 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-600/30 transition-colors"
                  >
                    <Plus size={12} /> Add Type
                  </button>
                </div>

                {allowanceError && (
                  <div className="flex items-center gap-2 m-4 rounded-lg border border-red-500/20 bg-red-900/20 p-3 text-xs text-red-300">
                    <AlertCircle size={13} /> {allowanceError}
                  </div>
                )}

                {allowanceLoading ? (
                  <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-violet-400" /></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" style={{ minWidth: "900px" }}>
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Code</th>
                          <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Label</th>
                          <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Category</th>
                          <th className={TABLE_HEADER + " px-3 py-3 text-center"}>Taxable</th>
                          <th className={TABLE_HEADER + " px-3 py-3 text-right"}>De Minimis Monthly Limit</th>
                          <th className={TABLE_HEADER + " px-3 py-3 text-left"}>BIR Basis</th>
                          <th className={TABLE_HEADER + " px-3 py-3 text-center"}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Add new row */}
                        {addingNew && (
                          <tr className="border-b border-violet-500/20 bg-violet-900/10">
                            <td className="px-4 py-2">
                              <input value={newForm.code} onChange={e => setNewForm(f => ({ ...f, code: e.target.value }))}
                                placeholder="RICE_SUBSIDY" className="w-full rounded bg-white/10 px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500" />
                            </td>
                            <td className="px-3 py-2">
                              <input value={newForm.label} onChange={e => setNewForm(f => ({ ...f, label: e.target.value }))}
                                placeholder="Label" className="w-full rounded bg-white/10 px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500" />
                            </td>
                            <td className="px-3 py-2">
                              <select value={newForm.category} onChange={e => setNewForm(f => ({ ...f, category: e.target.value }))}
                                className="rounded bg-white/10 px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-violet-500">
                                <option value="de_minimis">de_minimis</option>
                                <option value="regular">regular</option>
                                <option value="fringe">fringe</option>
                                <option value="other">other</option>
                              </select>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button onClick={() => setNewForm(f => ({ ...f, is_taxable: !f.is_taxable }))}
                                className={newForm.is_taxable ? "text-red-400 hover:text-red-300" : "text-emerald-400 hover:text-emerald-300"}>
                                {newForm.is_taxable ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input value={newForm.de_minimis_monthly_limit} onChange={e => setNewForm(f => ({ ...f, de_minimis_monthly_limit: e.target.value }))}
                                placeholder="—" className="w-24 rounded bg-white/10 px-2 py-1 text-xs text-white text-right placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500" />
                            </td>
                            <td className="px-3 py-2">
                              <input value={newForm.bir_basis} onChange={e => setNewForm(f => ({ ...f, bir_basis: e.target.value }))}
                                placeholder="Legal reference" className="w-full rounded bg-white/10 px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500" />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={createAllowanceType} disabled={savingId === -1 || !newForm.code || !newForm.label}
                                  className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs text-white hover:bg-violet-500 disabled:opacity-40 flex items-center gap-1">
                                  {savingId === -1 ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />} Save
                                </button>
                                <button onClick={() => setAddingNew(false)} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:text-white">Cancel</button>
                              </div>
                            </td>
                          </tr>
                        )}

                        {allowanceTypes.map(at => (
                          <tr key={at.id} className={TABLE_ROW + (at.is_active ? "" : " opacity-40")}>
                            {editingAllowance === at.id ? (
                              <>
                                <td className="px-4 py-2 font-mono text-xs text-slate-400">{at.code}</td>
                                <td className="px-3 py-2">
                                  <input value={editForm.label ?? ""} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                                    className="w-full rounded bg-white/10 px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-violet-500" />
                                </td>
                                <td className="px-3 py-2">
                                  <select value={editForm.category ?? "other"} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                                    className="rounded bg-white/10 px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-violet-500">
                                    <option value="de_minimis">de_minimis</option>
                                    <option value="regular">regular</option>
                                    <option value="fringe">fringe</option>
                                    <option value="other">other</option>
                                  </select>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <button onClick={() => setEditForm(f => ({ ...f, is_taxable: !f.is_taxable }))}
                                    className={editForm.is_taxable ? "text-red-400" : "text-emerald-400"}>
                                    {editForm.is_taxable ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                                  </button>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <input value={editForm.de_minimis_monthly_limit ?? ""} onChange={e => setEditForm(f => ({ ...f, de_minimis_monthly_limit: e.target.value as never }))}
                                    className="w-24 rounded bg-white/10 px-2 py-1 text-xs text-white text-right focus:outline-none focus:ring-1 focus:ring-violet-500" />
                                </td>
                                <td className="px-3 py-2">
                                  <input value={editForm.bir_basis ?? ""} onChange={e => setEditForm(f => ({ ...f, bir_basis: e.target.value }))}
                                    className="w-full rounded bg-white/10 px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-violet-500" />
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <button onClick={() => saveEditAllowance(at.id)} disabled={savingId === at.id}
                                      className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs text-white hover:bg-violet-500 disabled:opacity-40 flex items-center gap-1">
                                      {savingId === at.id ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />} Save
                                    </button>
                                    <button onClick={() => setEditingAllowance(null)} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:text-white">Cancel</button>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className={TABLE_CELL + " px-4 py-2.5 font-mono text-xs text-slate-400"}>{at.code}</td>
                                <td className={TABLE_CELL + " px-3 py-2.5 font-medium text-white"}>{at.label}</td>
                                <td className="px-3 py-2.5">
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium border ${
                                    at.category === "de_minimis"
                                      ? "bg-emerald-900/40 text-emerald-300 border-emerald-500/30"
                                      : at.category === "fringe"
                                      ? "bg-amber-900/40 text-amber-300 border-amber-500/30"
                                      : "bg-slate-700 text-slate-400 border-slate-600"
                                  }`}>
                                    {at.category}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  <button
                                    onClick={() => toggleTaxable(at)}
                                    disabled={savingId === at.id}
                                    title={at.is_taxable ? "Click to mark non-taxable" : "Click to mark taxable"}
                                    className={`transition-colors ${at.is_taxable ? "text-red-400 hover:text-red-300" : "text-emerald-400 hover:text-emerald-300"} ${savingId === at.id ? "opacity-40" : ""}`}
                                  >
                                    {savingId === at.id
                                      ? <Loader2 size={20} className="animate-spin" />
                                      : at.is_taxable
                                      ? <span className="flex items-center gap-1 text-xs"><ToggleRight size={20} /><span className="text-red-400">Taxable</span></span>
                                      : <span className="flex items-center gap-1 text-xs"><ToggleLeft size={20} /><span className="text-emerald-400">Non-taxable</span></span>
                                    }
                                  </button>
                                </td>
                                <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums"}>
                                  {at.de_minimis_monthly_limit
                                    ? <span className="text-emerald-300">{php(at.de_minimis_monthly_limit)}<span className="text-slate-500 text-xs">/mo</span></span>
                                    : <span className="text-slate-600">—</span>}
                                </td>
                                <td className={TABLE_CELL + " px-3 py-2.5 text-xs text-slate-500 max-w-xs"}>{at.bir_basis ?? "—"}</td>
                                <td className="px-3 py-2.5 text-center">
                                  <button
                                    onClick={() => { setEditingAllowance(at.id); setEditForm({ ...at }); }}
                                    className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* De minimis footnote */}
                <div className="border-t border-white/10 px-4 py-3">
                  <p className="text-xs text-slate-500">
                    <span className="text-emerald-400 font-medium">Non-taxable</span> items are excluded from BIR taxable income. De minimis limits follow BIR RR 11-2018.
                    Click the toggle to change taxability · Click <Pencil size={10} className="inline" /> to edit details.
                  </p>
                </div>
              </div>
            )}

        {/* Footer nav */}
        <div className="flex justify-between text-xs text-slate-500">
          <Link href="/admin/payroll/manila" className="hover:text-slate-300">← Back to Manila Payroll</Link>
          <span>SSS &amp; BIR brackets editable via Update buttons · Allowance Types: inline edit</span>
        </div>
      </div>

      {/* ── BIR Upload Modal ────────────────────────────────────────── */}
      {birModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-3">
                <FileSpreadsheet size={20} className="text-violet-400" />
                <div>
                  <h2 className="text-base font-semibold text-white">Update BIR Tax Brackets</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Paste bracket data from the BIR circular (TRAIN Law / RMC)</p>
                </div>
              </div>
              <button onClick={() => setBirModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"><X size={18} /></button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              <div className="rounded-xl border border-blue-500/20 bg-blue-900/10 p-3 text-xs text-blue-300 leading-relaxed">
                <p className="font-semibold mb-1">CSV Format (tab or comma separated):</p>
                <code className="block text-slate-300 font-mono">annual_from, annual_to, base_tax, excess_rate_pct, excess_over</code>
                <p className="mt-1.5 text-slate-400">Example (TRAIN Law brackets):</p>
                <code className="block text-slate-300 font-mono whitespace-pre">{"0, 250000, 0, 0, 0\n250001, 400000, 0, 15, 250000\n400001, 800000, 22500, 20, 400000\n800001, 2000000, 102500, 25, 800000\n2000001, 8000000, 402500, 30, 2000000\n8000001, , 2202500, 35, 8000000"}</code>
                <p className="mt-1.5 text-slate-500">Leave annual_to blank for the top bracket. excess_rate_pct is a percentage (e.g. 15 = 15%).</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Effective Date <span className="text-red-400">*</span></label>
                  <input type="date" value={birEffectiveDate} onChange={e => setBirEffectiveDate(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Source Version</label>
                  <input type="text" value={birSourceVersion} onChange={e => setBirSourceVersion(e.target.value)}
                    placeholder="TRAIN RR8-2018"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-violet-500 focus:outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">CSV Data</label>
                <textarea value={birCsvText} onChange={e => { setBirCsvText(e.target.value); setBirPreview(null); setBirParsError(""); }}
                  rows={8} placeholder={"0, 250000, 0, 0, 0\n250001, 400000, 0, 15, 250000\n..."}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 font-mono placeholder-slate-700 focus:border-violet-500 focus:outline-none resize-none" />
              </div>

              {birParsError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-900/20 p-3 text-xs text-red-300">
                  <AlertCircle size={13} /> {birParsError}
                </div>
              )}

              {birPreview && (
                <div>
                  <p className="text-xs text-emerald-400 mb-2 flex items-center gap-1.5">
                    <CheckCircle2 size={13} /> {birPreview.length} brackets parsed — review before uploading
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/5">
                          <th className="px-3 py-2 text-right text-slate-400">Annual From</th>
                          <th className="px-3 py-2 text-right text-slate-400">Annual To</th>
                          <th className="px-3 py-2 text-right text-slate-400">Base Tax</th>
                          <th className="px-3 py-2 text-right text-slate-400">Rate %</th>
                          <th className="px-3 py-2 text-right text-slate-400">Excess Over</th>
                        </tr>
                      </thead>
                      <tbody>
                        {birPreview.map((r, i) => (
                          <tr key={i} className="border-b border-white/5">
                            <td className="px-3 py-1.5 text-right tabular-nums">{php(r.annual_from)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{r.annual_to ? php(r.annual_to) : <span className="text-slate-600">—</span>}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-violet-300">{php(r.base_tax)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{parseFloat(r.excess_rate_pct).toFixed(1)}%</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{php(r.excess_over)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {birUploadMsg && (
                <div className={`flex items-center gap-2 rounded-lg border p-3 text-xs ${
                  birUploadMsg.startsWith("✓") ? "border-emerald-500/20 bg-emerald-900/20 text-emerald-300" : "border-red-500/20 bg-red-900/20 text-red-300"
                }`}>
                  {birUploadMsg.startsWith("✓") ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                  {birUploadMsg}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-white/10 px-6 py-4 gap-3">
              <p className="text-xs text-slate-500">Existing brackets for the selected effective date will be deactivated and replaced.</p>
              <div className="flex gap-2 shrink-0">
                {!birPreview ? (
                  <button onClick={handleBirParsePreview} disabled={!birCsvText.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-600 disabled:opacity-40 transition-colors">
                    Preview
                  </button>
                ) : (
                  <button onClick={handleBirUpload} disabled={birUploading}
                    className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500 disabled:opacity-40 transition-colors">
                    {birUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {birUploading ? "Uploading…" : "Upload & Replace"}
                  </button>
                )}
                {birPreview && (
                  <button onClick={() => { setBirPreview(null); setBirParsError(""); }} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors">Edit</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SSS Upload Modal ────────────────────────────────────────── */}
      {sssModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 shadow-2xl flex flex-col max-h-[90vh]">

            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-3">
                <FileSpreadsheet size={20} className="text-violet-400" />
                <div>
                  <h2 className="text-base font-semibold text-white">Update SSS Contribution Table</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Paste CSV data from the official SSS circular</p>
                </div>
              </div>
              <button onClick={() => setSssModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

              {/* Format hint */}
              <div className="rounded-xl border border-blue-500/20 bg-blue-900/10 p-3 text-xs text-blue-300 leading-relaxed">
                <p className="font-semibold mb-1">CSV Format (tab or comma separated):</p>
                <code className="block text-slate-300 font-mono">comp_min, comp_max, msc, ee_share, er_share [, ec_share]</code>
                <p className="mt-1.5 text-slate-400">Example rows:</p>
                <code className="block text-slate-300 font-mono whitespace-pre">{"0, 4999.99, 5000, 250, 500, 10\n5000, 9999.99, 10000, 500, 1000, 10\n35000, , 35000, 1750, 3500, 30"}</code>
                <p className="mt-1.5 text-slate-500">Leave comp_max blank or write &quot;null&quot; for the top bracket. ec_share defaults to 10.00 if omitted.</p>
              </div>

              {/* Effective date + source */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Effective Date <span className="text-red-400">*</span></label>
                  <input
                    type="date"
                    value={sssEffectiveDate}
                    onChange={e => setSssEffectiveDate(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Source Version</label>
                  <input
                    type="text"
                    value={sssSourceVersion}
                    onChange={e => setSssSourceVersion(e.target.value)}
                    placeholder={`SSS ${new Date().getFullYear()}`}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-violet-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* CSV textarea */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">CSV Data</label>
                <textarea
                  value={sssCsvText}
                  onChange={e => { setSssCsvText(e.target.value); setSssPreview(null); setSssParsError(""); }}
                  rows={8}
                  placeholder={"0, 4999.99, 5000, 250, 500, 10\n5000, 9999.99, 10000, 500, 1000, 10\n..."}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 font-mono placeholder-slate-700 focus:border-violet-500 focus:outline-none resize-none"
                />
              </div>

              {/* Parse error */}
              {sssParsError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-900/20 p-3 text-xs text-red-300">
                  <AlertCircle size={13} /> {sssParsError}
                </div>
              )}

              {/* Preview table */}
              {sssPreview && (
                <div>
                  <p className="text-xs text-emerald-400 mb-2 flex items-center gap-1.5">
                    <CheckCircle2 size={13} /> {sssPreview.length} rows parsed — review before uploading
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/5">
                          <th className="px-3 py-2 text-right text-slate-400">Comp Min</th>
                          <th className="px-3 py-2 text-right text-slate-400">Comp Max</th>
                          <th className="px-3 py-2 text-right text-slate-400">MSC</th>
                          <th className="px-3 py-2 text-right text-slate-400">EE</th>
                          <th className="px-3 py-2 text-right text-slate-400">ER</th>
                          <th className="px-3 py-2 text-right text-slate-400">EC</th>
                          <th className="px-3 py-2 text-right text-slate-400">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sssPreview.map((r, i) => (
                          <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">{php(r.compensation_min)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">{r.compensation_max ? php(r.compensation_max) : <span className="text-slate-600">—</span>}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{php(r.msc)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-violet-300 font-medium">{php(r.ee_share)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{php(r.er_share)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{php(r.ec_share)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{php(r.total_share)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Upload result */}
              {sssUploadMsg && (
                <div className={`flex items-center gap-2 rounded-lg border p-3 text-xs ${
                  sssUploadMsg.startsWith("✓")
                    ? "border-emerald-500/20 bg-emerald-900/20 text-emerald-300"
                    : "border-red-500/20 bg-red-900/20 text-red-300"
                }`}>
                  {sssUploadMsg.startsWith("✓") ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                  {sssUploadMsg}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between border-t border-white/10 px-6 py-4 gap-3">
              <p className="text-xs text-slate-500">
                Existing active rows for the selected effective date will be deactivated and replaced.
              </p>
              <div className="flex gap-2 shrink-0">
                {!sssPreview ? (
                  <button
                    onClick={handleSssParsePreview}
                    disabled={!sssCsvText.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-600 disabled:opacity-40 transition-colors"
                  >
                    Preview
                  </button>
                ) : (
                  <button
                    onClick={handleSssUpload}
                    disabled={sssUploading}
                    className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500 disabled:opacity-40 transition-colors"
                  >
                    {sssUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {sssUploading ? "Uploading…" : "Upload & Replace"}
                  </button>
                )}
                {sssPreview && (
                  <button onClick={() => { setSssPreview(null); setSssParsError(""); }} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                    Edit
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
