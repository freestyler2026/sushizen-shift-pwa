"use client";

import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronLeft,
  Info, Loader2, RefreshCw, Shield,
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
  compensation_min: string;
  compensation_max: string | null;
  ee_contribution: string;
  er_contribution: string;
  effective_from: string;
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

type TabId = "pay_rules" | "sss" | "philhealth" | "pagibig" | "bir";

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
                <div className="border-b border-white/10 px-4 py-3">
                  <p className="text-xs text-slate-400">Source: SSS Contribution Table — Bracket-based lookup on monthly salary credit</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className={TABLE_HEADER + " px-4 py-3 text-right"}>Compensation Min</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>Compensation Max</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>EE Contribution</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-right"}>ER Contribution</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Effective From</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sss.map(r => (
                        <tr key={r.id} className={TABLE_ROW}>
                          <td className={TABLE_CELL + " px-4 py-2.5 text-right tabular-nums"}>{php(r.compensation_min)}</td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums"}>
                            {r.compensation_max ? php(r.compensation_max) : <span className="text-slate-500">No limit</span>}
                          </td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums text-violet-300"}>{php(r.ee_contribution)}</td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-right tabular-nums text-slate-300"}>{php(r.er_contribution)}</td>
                          <td className={TABLE_CELL + " px-3 py-2.5 text-slate-400"}>{r.effective_from}</td>
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
                <div className="border-b border-white/10 px-4 py-3">
                  <p className="text-xs text-slate-400">BIR Withholding Tax — TRAIN Law annual brackets; annualized monthly compensation method</p>
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

        {/* Footer nav */}
        <div className="flex justify-between text-xs text-slate-500">
          <Link href="/admin/payroll/manila" className="hover:text-slate-300">← Back to Manila Payroll</Link>
          <span>Read-only — contact your system administrator to update these tables</span>
        </div>
      </div>
    </div>
  );
}
