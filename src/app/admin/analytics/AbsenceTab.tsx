"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronDown, ChevronRight, AlertTriangle,
  Users, Building2, Search, CalendarX,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { apiGet, qs } from "@/lib/api";
import DateRangePicker from "@/components/DateRangePicker";
import {
  GLASS_CARD, KPI_CARD, KPI_LABEL, KPI_VALUE,
  TABLE_HEADER, TABLE_ROW, TABLE_CELL,
  TAB_CONTAINER, TAB_ACTIVE, TAB_INACTIVE,
} from "@/lib/ui-tokens";

// ─── Types ────────────────────────────────────────────────────────────────────
type AbsenceBranchRow  = { branch_code: string; incidents: number; staff_count: number; absent_days: number };
type AbsenceStaffRow   = { staff_name: string; branch_code: string; absent_days: number; absence_types: string[] };
type AbsenceDetailRow  = { date: string; absence_type: string; note: string; branch_code: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isoFirstOfMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function isoLastOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}
function absenceStyle(type: string): { badge: string; bar: string } {
  const t = (type || "").toLowerCase();
  if (t.includes("sick") || t.includes("medical") || t.includes("ill"))
    return { badge: "bg-blue-500/20 text-blue-300 border-blue-500/30", bar: "#60a5fa" };
  if (t.includes("unpaid") || t.includes("unexcused") || t.includes("no show"))
    return { badge: "bg-red-500/20 text-red-300 border-red-500/30", bar: "#f87171" };
  if (t.includes("annual") || t.includes("vacation") || t.includes("leave"))
    return { badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", bar: "#34d399" };
  return { badge: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30", bar: "#a1a1aa" };
}

function AbsenceTypeBadge({ type }: { type: string }) {
  const { badge } = absenceStyle(type);
  return <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${badge}`}>{type || "—"}</span>;
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className={`${KPI_CARD} relative overflow-hidden`}>
      {accent && <div className={`absolute inset-x-0 top-0 h-0.5 ${accent}`} />}
      <div className={KPI_LABEL}>{label}</div>
      <div className={`${KPI_VALUE} text-xl mt-2`}>{value}</div>
      {sub && <div className="mt-1 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}

function InlineBar({ value, max, color = "#f87171" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-20 rounded-full bg-white/8 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: {value:number}[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/95 px-3 py-2 text-xs shadow-2xl">
      <p className="text-zinc-300 font-medium mb-0.5">{label}</p>
      <p className="text-rose-400 font-semibold">{payload[0].value} days</p>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AbsenceTab({
  city: defaultCity, dateFrom: defaultFrom, dateTo: defaultTo, approverName, pin,
}: { city: string; dateFrom: string; dateTo: string; approverName: string; pin: string }) {
  const now = new Date();
  const [city, setCity]               = useState(defaultCity || "dubai");
  const [draftRange, setDraftRange]   = useState({ from: defaultFrom || isoFirstOfMonth(now), to: defaultTo || isoLastOfMonth(now) });
  const [appliedFrom, setAppliedFrom] = useState(defaultFrom || isoFirstOfMonth(now));
  const [appliedTo, setAppliedTo]     = useState(defaultTo || isoLastOfMonth(now));
  const [view, setView]               = useState<"branch" | "staff">("branch");
  const [branchRows, setBranchRows]   = useState<AbsenceBranchRow[]>([]);
  const [staffRows, setStaffRows]     = useState<AbsenceStaffRow[]>([]);
  const [staffSearch, setStaffSearch] = useState("");
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);
  const [staffDetail, setStaffDetail] = useState<Record<string, AbsenceDetailRow[]>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const baseParams = useMemo(() => ({ city, date_from: appliedFrom, date_to: appliedTo, approver_name: approverName, pin }), [city, appliedFrom, appliedTo, approverName, pin]);

  const loadBranch = useCallback(async (p: typeof baseParams) => {
    setLoading(true); setError("");
    try { const r = await apiGet<{ok:boolean;rows:AbsenceBranchRow[]}>(`/api/admin/analytics/absence/by_branch${qs(p)}`); setBranchRows(r.rows || []); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);

  const loadStaff = useCallback(async (p: typeof baseParams) => {
    setLoading(true); setError("");
    try {
      const r = await apiGet<{ok:boolean;rows:AbsenceStaffRow[]}>(`/api/admin/analytics/absence/by_staff${qs(p)}`);
      setStaffRows(r.rows || []); setExpandedStaff(null); setStaffDetail({});
    }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (view === "branch") void loadBranch(baseParams);
    if (view === "staff")  void loadStaff(baseParams);
  }, [baseParams, view, loadBranch, loadStaff]);

  function applyRange() {
    if (!draftRange.from || !draftRange.to) return;
    setAppliedFrom(draftRange.from); setAppliedTo(draftRange.to);
  }

  async function toggleStaffDetail(name: string) {
    if (expandedStaff === name) { setExpandedStaff(null); return; }
    setExpandedStaff(name);
    if (staffDetail[name]) return;
    setDetailLoading(true);
    try {
      const r = await apiGet<{ok:boolean;rows:AbsenceDetailRow[]}>(`/api/admin/analytics/absence/staff_detail${qs({ ...baseParams, staff_name: name })}`);
      setStaffDetail((prev) => ({ ...prev, [name]: r.rows || [] }));
    } catch { /* ignore */ } finally { setDetailLoading(false); }
  }

  const filteredStaff = staffRows.filter((r) => !staffSearch || r.staff_name.toLowerCase().includes(staffSearch.toLowerCase()) || r.branch_code.toLowerCase().includes(staffSearch.toLowerCase()));
  const rangeChanged  = draftRange.from !== appliedFrom || draftRange.to !== appliedTo;

  const totalIncidents  = branchRows.reduce((s, r) => s + r.incidents, 0);
  const totalStaff      = branchRows.reduce((s, r) => s + r.staff_count, 0);
  const totalAbsentDays = branchRows.reduce((s, r) => s + r.absent_days, 0);

  const branchChartData = branchRows
    .sort((a, b) => b.absent_days - a.absent_days)
    .slice(0, 8)
    .map((r) => ({ name: r.branch_code, days: r.absent_days }));

  const maxBranchDays = Math.max(...branchRows.map((r) => r.absent_days), 1);
  const maxStaffDays  = Math.max(...staffRows.map((r) => r.absent_days), 1);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className={`${GLASS_CARD} p-4 space-y-3`}>
        <div className="flex items-center gap-2">
          <CalendarX className="h-4 w-4 text-rose-400 shrink-0" />
          <span className="text-sm font-semibold text-white">Absence Analysis</span>
          <span className="text-xs text-zinc-500">Absences recorded in Bayzat · all types included</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {/* City toggle */}
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">City</div>
            <div className="flex rounded-xl border border-white/10 overflow-hidden">
              {(["dubai", "manila"] as const).map((c) => (
                <button key={c} type="button" onClick={() => setCity(c)}
                  className={`px-4 py-2 text-sm font-medium capitalize transition border-r border-white/10 last:border-r-0 ${city === c ? "bg-rose-400/20 text-rose-300" : "text-zinc-400 hover:text-white"}`}>
                  {c === "dubai" ? "Dubai" : "Manila"}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-[260px] flex-1">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Period</div>
            <DateRangePicker value={draftRange} onChange={setDraftRange} />
          </div>
          <button type="button" onClick={applyRange} disabled={loading || !draftRange.from || !draftRange.to}
            className={`flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${rangeChanged ? "border-rose-400/40 bg-rose-400/20 text-rose-300 hover:bg-rose-400/30" : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-white"} disabled:opacity-50`}>
            {loading && <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {rangeChanged ? "Apply" : "Reload"}
          </button>
        </div>
        <div className="text-[11px] text-zinc-600">
          Showing: <span className="text-zinc-400 font-medium">{appliedFrom}</span> → <span className="text-zinc-400 font-medium">{appliedTo}</span>
          <span className="ml-2 capitalize text-zinc-500">· {city}</span>
        </div>
      </div>

      {/* KPI cards */}
      {!loading && branchRows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Total Absences" value={totalIncidents} sub="all records" accent="bg-rose-500" />
          <KpiCard label="Staff Affected" value={totalStaff} accent="bg-orange-500" />
          <KpiCard label="Absent Days" value={totalAbsentDays} sub="unique dates" accent="bg-red-600" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* Sub-tabs */}
      <div className={TAB_CONTAINER}>
        {([
          { key: "branch" as const, label: "By Branch", icon: <Building2 className="h-3.5 w-3.5" /> },
          { key: "staff"  as const, label: "By Staff",  icon: <Users className="h-3.5 w-3.5" /> },
        ]).map((t) => (
          <button key={t.key} type="button" onClick={() => setView(t.key)}
            className={`${view === t.key ? TAB_ACTIVE : TAB_INACTIVE} flex items-center gap-1.5`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {loading && <div className="py-8 text-center text-sm text-zinc-500">Loading…</div>}

      {/* ── BY BRANCH ── */}
      {!loading && view === "branch" && (
        <div className="space-y-4">
          {branchChartData.length > 0 && (
            <div className={`${GLASS_CARD} p-4`}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Absent Days by Branch</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={branchChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="days" radius={[4, 4, 0, 0]} fill="#f87171" fillOpacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className={`${GLASS_CARD} overflow-x-auto p-0`}>
            {branchRows.length === 0 ? (
              <div className="p-6 text-center text-sm text-zinc-500">No absence records in this period.</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/8">
                    <th className={`${TABLE_HEADER} px-4 py-3 text-left`}>Branch</th>
                    <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Records</th>
                    <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Staff</th>
                    <th className={`${TABLE_HEADER} px-4 py-3 text-left`}>Absent Days</th>
                  </tr>
                </thead>
                <tbody>
                  {branchRows.sort((a, b) => b.absent_days - a.absent_days).map((r) => (
                    <tr key={r.branch_code} className={TABLE_ROW}>
                      <td className={`${TABLE_CELL} px-4 font-medium`}>{r.branch_code || "—"}</td>
                      <td className={`${TABLE_CELL} px-4 text-right tabular-nums`}>{r.incidents}</td>
                      <td className={`${TABLE_CELL} px-4 text-right tabular-nums`}>{r.staff_count}</td>
                      <td className={`${TABLE_CELL} px-4`}>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold tabular-nums text-rose-300 w-6">{r.absent_days}</span>
                          <InlineBar value={r.absent_days} max={maxBranchDays} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── BY STAFF ── */}
      {!loading && view === "staff" && (
        <div className="space-y-2">
          {staffRows.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input type="text" placeholder="Search staff or branch…" value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-600 focus:border-rose-500/40 focus:outline-none focus:ring-1 focus:ring-rose-500/20" />
            </div>
          )}
          {filteredStaff.length === 0 && (
            <div className={`${GLASS_CARD} p-6 text-center text-sm text-zinc-500`}>
              {staffRows.length === 0 ? "No absence records for this period." : "No matches found."}
            </div>
          )}
          {filteredStaff.sort((a, b) => b.absent_days - a.absent_days).map((r, idx) => {
            const isExpanded = expandedStaff === r.staff_name;
            const detail = staffDetail[r.staff_name] || [];
            const dominantType = (r.absence_types || [])[0] || "";
            const { bar } = absenceStyle(dominantType);
            return (
              <div key={`${r.staff_name}-${idx}`}
                className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] transition-colors hover:border-rose-500/20">
                <button type="button" onClick={() => toggleStaffDetail(r.staff_name)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <span className="shrink-0 w-6 text-center text-[11px] font-bold tabular-nums text-zinc-600">
                    {idx < 3 ? ["🥇","🥈","🥉"][idx] : `#${idx + 1}`}
                  </span>
                  <span className="text-zinc-500 shrink-0">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">{r.staff_name}</div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-[11px] text-zinc-500">{r.branch_code || "—"}</span>
                      <InlineBar value={r.absent_days} max={maxStaffDays} color={bar} />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <span className="rounded-lg border border-rose-500/30 bg-rose-500/20 px-2.5 py-0.5 text-xs font-bold text-rose-300">
                      {r.absent_days}d
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {(r.absence_types || []).slice(0, 2).map((t) => <AbsenceTypeBadge key={t} type={t} />)}
                      {(r.absence_types || []).length > 2 && (
                        <span className="text-[11px] text-zinc-500">+{r.absence_types.length - 2}</span>
                      )}
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/8 bg-black/20">
                    {detailLoading && !detail.length ? (
                      <div className="p-4 text-xs text-zinc-500">Loading…</div>
                    ) : detail.length === 0 ? (
                      <div className="p-4 text-xs text-zinc-500">No detail available.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-white/5">
                              {["Date","Type","Note","Branch"].map((h) => (
                                <th key={h} className={`${TABLE_HEADER} px-4 py-2 text-left`}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {detail.map((d, di) => (
                              <tr key={`${d.date}-${di}`} className="border-t border-white/5 hover:bg-white/5">
                                <td className="px-4 py-2.5 text-xs font-medium text-zinc-300 whitespace-nowrap">{d.date}</td>
                                <td className="px-4 py-2.5"><AbsenceTypeBadge type={d.absence_type} /></td>
                                <td className="px-4 py-2.5 text-xs text-zinc-500 max-w-[200px] truncate">{d.note || "—"}</td>
                                <td className="px-4 py-2.5 text-xs text-zinc-500">{d.branch_code || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
