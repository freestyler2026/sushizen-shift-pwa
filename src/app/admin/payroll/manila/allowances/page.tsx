"use client";

import { useEffect, useState, useCallback } from "react";
import { getAuth } from "@/lib/auth";
import { apiGet, apiPost } from "@/lib/api";

const API = "/api/admin/manila-payroll";

interface AllowanceItem {
  id: number;
  staff_name: string;
  cutoff1_start: string;
  cutoff1_end: string;
  cutoff1_working_days: number;
  cutoff1_late_count: number;
  cutoff1_late_minutes: number;
  cutoff1_awol_days: number;
  cutoff1_rejected_requests: number;
  cutoff1_flag_no_notice: boolean;
  cutoff1_eligible: boolean;
  cutoff1_disqualify_reasons: string;
  cutoff1_amount: number;
  cutoff2_start: string;
  cutoff2_end: string;
  cutoff2_working_days: number;
  cutoff2_late_count: number;
  cutoff2_late_minutes: number;
  cutoff2_awol_days: number;
  cutoff2_rejected_requests: number;
  cutoff2_flag_no_notice: boolean;
  cutoff2_eligible: boolean;
  cutoff2_disqualify_reasons: string;
  cutoff2_amount: number;
  pa_late_count: number;
  pa_late_minutes: number;
  pa_awol_days: number;
  pa_eligible: boolean;
  pa_disqualify_reasons: string;
  pa_amount: number;
  total_amount: number;
  override_note: string;
  computed_at: string;
}

function fmtDate(d: string) {
  if (!d) return "—";
  return d.slice(0, 10);
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
      ok ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
    }`}>
      {label}
    </span>
  );
}

export default function ManilaAllowancesPage() {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [items, setItems] = useState<AllowanceItem[]>([]);
  const [cutoff1, setCutoff1] = useState<{ start: string; end: string } | null>(null);
  const [cutoff2, setCutoff2] = useState<{ start: string; end: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);
  const [patchingStaff, setPatchingStaff] = useState<string | null>(null);

  const load = useCallback(async (m: string) => {
    setLoading(true); setError("");
    try {
      const res = await apiGet<{ items: AllowanceItem[]; cutoff1: { start: string; end: string }; cutoff2: { start: string; end: string } }>(
        `${API}/allowances?month=${m}`
      );
      setItems(res.items || []);
      setCutoff1(res.cutoff1 || null);
      setCutoff2(res.cutoff2 || null);
    } catch (e: any) {
      if (!String(e).includes("404")) setError(e?.message || String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(month); }, [month, load]);

  async function compute() {
    if (!confirm(`Compute Meal Allowance & Perfect Attendance for ${month}?\n\nThis will recalculate from attendance data. Manual flags (No Prior Notice) will be preserved.`)) return;
    setComputing(true); setError(""); setSuccess("");
    try {
      const res = await apiPost<{ staff_count: number; cutoff1: string; cutoff2: string }>(
        `${API}/allowances/compute?month=${month}`,
        {}
      );
      setSuccess(`Computed for ${res.staff_count} staff members. Cutoff1: ${res.cutoff1} / Cutoff2: ${res.cutoff2}`);
      await load(month);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setComputing(false); }
  }

  async function patchFlag(
    staffName: string,
    field: "cutoff1_flag_no_notice" | "cutoff2_flag_no_notice",
    value: boolean
  ) {
    setPatchingStaff(staffName);
    try {
      await apiPost<{ ok: boolean }>(
        `${API}/allowances/${encodeURIComponent(staffName)}/flags?month=${month}`,
        { [field]: value }
      );
      setItems(prev => prev.map(it =>
        it.staff_name === staffName ? { ...it, [field]: value } : it
      ));
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setPatchingStaff(null); }
  }

  const totalMeal = items.reduce((s, it) => s + Number(it.cutoff1_amount) + Number(it.cutoff2_amount), 0);
  const totalPA = items.reduce((s, it) => s + Number(it.pa_amount), 0);
  const totalAll = items.reduce((s, it) => s + Number(it.total_amount), 0);
  const paCount = items.filter(it => it.pa_eligible).length;
  const fullEligCount = items.filter(it => it.cutoff1_eligible && it.cutoff2_eligible).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Meal Allowance & Perfect Attendance</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Manila — auto-calculated per cutoff period</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white"
          />
          <button
            onClick={compute}
            disabled={computing || loading}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
          >
            {computing ? "Computing…" : "⟳ Compute"}
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {success && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{success}</div>}

      {/* Cutoff info */}
      {(cutoff1 || cutoff2) && (
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl border border-white/8 bg-white/4 p-3">
            <div className="text-zinc-500">Cutoff 1 (Meal)</div>
            <div className="mt-1 font-medium text-zinc-200">{cutoff1 ? `${fmtDate(cutoff1.start)} → ${fmtDate(cutoff1.end)}` : "—"}</div>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/4 p-3">
            <div className="text-zinc-500">Cutoff 2 (Meal)</div>
            <div className="mt-1 font-medium text-zinc-200">{cutoff2 ? `${fmtDate(cutoff2.start)} → ${fmtDate(cutoff2.end)}` : "—"}</div>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/4 p-3">
            <div className="text-zinc-500">Perfect Attendance period</div>
            <div className="mt-1 font-medium text-zinc-200">
              {cutoff1 && cutoff2 ? `${fmtDate(cutoff1.start)} → ${fmtDate(cutoff2.end)}` : "—"}
            </div>
          </div>
        </div>
      )}

      {/* KPI row */}
      {items.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total Meal Allowance", value: `₱${totalMeal.toLocaleString()}`, color: "text-violet-300" },
            { label: "Total Perfect Att.", value: `₱${totalPA.toLocaleString()}`, color: "text-amber-300" },
            { label: "Grand Total", value: `₱${totalAll.toLocaleString()}`, color: "text-white" },
            { label: "Perfect Att. Recipients", value: `${paCount} / ${items.length}`, color: "text-emerald-300" },
          ].map(k => (
            <div key={k.label} className="rounded-xl border border-white/8 bg-white/4 p-3">
              <div className="text-xs text-zinc-500">{k.label}</div>
              <div className={`mt-1 text-xl font-semibold ${k.color}`}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-white/8 bg-white/4 p-8 text-center text-sm text-zinc-500">
          No data for {month}. Click <strong className="text-zinc-300">Compute</strong> to calculate.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-xs text-zinc-500">
                <th className="px-4 py-3 font-medium">Staff</th>
                <th className="px-4 py-3 font-medium text-center">Cutoff 1</th>
                <th className="px-4 py-3 font-medium text-center">Cutoff 2</th>
                <th className="px-4 py-3 font-medium text-center">Perfect Att.</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map(it => {
                const isExpanded = expandedStaff === it.staff_name;
                const patching = patchingStaff === it.staff_name;
                return (
                  <>
                    <tr
                      key={it.staff_name}
                      className="border-b border-white/5 hover:bg-white/3 cursor-pointer"
                      onClick={() => setExpandedStaff(isExpanded ? null : it.staff_name)}
                    >
                      <td className="px-4 py-3 font-medium text-zinc-200">{it.staff_name}</td>

                      {/* Cutoff 1 */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Badge ok={it.cutoff1_eligible} label={it.cutoff1_eligible ? `✓ ₱${Number(it.cutoff1_amount).toLocaleString()}` : "✗ ₱0"} />
                          {!it.cutoff1_eligible && it.cutoff1_disqualify_reasons && (
                            <span className="text-[10px] text-red-400">{it.cutoff1_disqualify_reasons}</span>
                          )}
                          {it.cutoff1_eligible && (
                            <span className="text-[10px] text-zinc-500">{it.cutoff1_working_days}d × ₱50</span>
                          )}
                        </div>
                      </td>

                      {/* Cutoff 2 */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Badge ok={it.cutoff2_eligible} label={it.cutoff2_eligible ? `✓ ₱${Number(it.cutoff2_amount).toLocaleString()}` : "✗ ₱0"} />
                          {!it.cutoff2_eligible && it.cutoff2_disqualify_reasons && (
                            <span className="text-[10px] text-red-400">{it.cutoff2_disqualify_reasons}</span>
                          )}
                          {it.cutoff2_eligible && (
                            <span className="text-[10px] text-zinc-500">{it.cutoff2_working_days}d × ₱50</span>
                          )}
                        </div>
                      </td>

                      {/* Perfect Attendance */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Badge ok={it.pa_eligible} label={it.pa_eligible ? "✓ ₱500" : "✗ ₱0"} />
                          {!it.pa_eligible && it.pa_disqualify_reasons && (
                            <span className="text-[10px] text-red-400">{it.pa_disqualify_reasons}</span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right font-semibold text-zinc-100">
                        ₱{Number(it.total_amount).toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-zinc-500 text-xs">{isExpanded ? "▲" : "▼"}</td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr key={`${it.staff_name}-detail`} className="border-b border-white/8 bg-white/2">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="grid grid-cols-3 gap-4 text-xs">
                            {/* Cutoff 1 detail */}
                            <div className="space-y-1.5">
                              <p className="font-semibold text-zinc-300">Cutoff 1: {fmtDate(it.cutoff1_start)} → {fmtDate(it.cutoff1_end)}</p>
                              <p className="text-zinc-400">Working days: <span className="text-zinc-200">{it.cutoff1_working_days}</span></p>
                              <p className="text-zinc-400">Late count: <span className={it.cutoff1_late_count >= 3 ? "text-red-300" : "text-zinc-200"}>{it.cutoff1_late_count}x</span></p>
                              <p className="text-zinc-400">Late minutes: <span className={it.cutoff1_late_minutes >= 60 ? "text-red-300" : "text-zinc-200"}>{it.cutoff1_late_minutes}min</span></p>
                              <p className="text-zinc-400">AWOL days: <span className={it.cutoff1_awol_days > 0 ? "text-red-300" : "text-zinc-200"}>{it.cutoff1_awol_days}</span></p>
                              <p className="text-zinc-400">Rejected requests: <span className={it.cutoff1_rejected_requests > 0 ? "text-red-300" : "text-zinc-200"}>{it.cutoff1_rejected_requests}</span></p>
                              {/* Condition 4 manual flag */}
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={it.cutoff1_flag_no_notice}
                                  disabled={patching}
                                  onChange={e => void patchFlag(it.staff_name, "cutoff1_flag_no_notice", e.target.checked)}
                                  onClick={e => e.stopPropagation()}
                                  className="accent-red-500"
                                />
                                <span className={it.cutoff1_flag_no_notice ? "text-red-300" : "text-zinc-500"}>
                                  No prior notice (condition 4)
                                </span>
                              </label>
                            </div>

                            {/* Cutoff 2 detail */}
                            <div className="space-y-1.5">
                              <p className="font-semibold text-zinc-300">Cutoff 2: {fmtDate(it.cutoff2_start)} → {fmtDate(it.cutoff2_end)}</p>
                              <p className="text-zinc-400">Working days: <span className="text-zinc-200">{it.cutoff2_working_days}</span></p>
                              <p className="text-zinc-400">Late count: <span className={it.cutoff2_late_count >= 3 ? "text-red-300" : "text-zinc-200"}>{it.cutoff2_late_count}x</span></p>
                              <p className="text-zinc-400">Late minutes: <span className={it.cutoff2_late_minutes >= 60 ? "text-red-300" : "text-zinc-200"}>{it.cutoff2_late_minutes}min</span></p>
                              <p className="text-zinc-400">AWOL days: <span className={it.cutoff2_awol_days > 0 ? "text-red-300" : "text-zinc-200"}>{it.cutoff2_awol_days}</span></p>
                              <p className="text-zinc-400">Rejected requests: <span className={it.cutoff2_rejected_requests > 0 ? "text-red-300" : "text-zinc-200"}>{it.cutoff2_rejected_requests}</span></p>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={it.cutoff2_flag_no_notice}
                                  disabled={patching}
                                  onChange={e => void patchFlag(it.staff_name, "cutoff2_flag_no_notice", e.target.checked)}
                                  onClick={e => e.stopPropagation()}
                                  className="accent-red-500"
                                />
                                <span className={it.cutoff2_flag_no_notice ? "text-red-300" : "text-zinc-500"}>
                                  No prior notice (condition 4)
                                </span>
                              </label>
                            </div>

                            {/* Perfect Attendance detail */}
                            <div className="space-y-1.5">
                              <p className="font-semibold text-zinc-300">Perfect Attendance ({fmtDate(it.cutoff1_start)} → {fmtDate(it.cutoff2_end)})</p>
                              <p className="text-zinc-400">Total late count: <span className={it.pa_late_count > 0 ? "text-red-300" : "text-emerald-300"}>{it.pa_late_count}x</span></p>
                              <p className="text-zinc-400">Total late minutes: <span className={it.pa_late_minutes > 0 ? "text-red-300" : "text-emerald-300"}>{it.pa_late_minutes}min</span></p>
                              <p className="text-zinc-400">Total AWOL days: <span className={it.pa_awol_days > 0 ? "text-red-300" : "text-emerald-300"}>{it.pa_awol_days}</span></p>
                              <div className={`mt-2 rounded-lg px-3 py-2 text-center font-semibold ${it.pa_eligible ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
                                {it.pa_eligible ? "✓ ₱500 Eligible" : `✗ Not eligible — ${it.pa_disqualify_reasons}`}
                              </div>
                            </div>
                          </div>
                          {it.override_note && (
                            <p className="mt-3 text-xs text-amber-400">Note: {it.override_note}</p>
                          )}
                          {it.computed_at && (
                            <p className="mt-1 text-[10px] text-zinc-600">Last computed: {it.computed_at.slice(0, 16).replace("T", " ")}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-zinc-600">
        Conditions auto-checked: (1) AWOL / rejected shift change request, (2) Late ≥3x, (3) Cumulative late ≥60min.
        Condition (4) No prior notice must be flagged manually after checking Discord.
      </p>
    </div>
  );
}
