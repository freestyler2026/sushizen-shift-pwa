"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GLASS_CARD, T_PAGE_TITLE, T_SECTION, SMALL_BUTTON, PRIMARY_BUTTON } from "@/lib/ui-tokens";
import { getAuth } from "@/lib/auth";

// ─── Types ───────────────────────────────────────────────────────────────────

interface GroupSummary {
  year_month: string;
  fx_rates: { AED_JPY: number; PHP_JPY: number };
  dubai: { revenue: number; food_cost: number; labor_cost: number; prime_cost: number; overhead_total: number; food_cost_rate: number | null; prime_cost_rate: number | null; native: { currency: string; revenue: number; food_cost: number; revenue_source: string } };
  manila: { revenue: number; food_cost: number; labor_cost: number; prime_cost: number; overhead_total: number; food_cost_rate: number | null; prime_cost_rate: number | null; native: { currency: string; revenue: number; food_cost: number; revenue_source: string } };
  group: { revenue: number; food_cost: number; labor_cost: number; prime_cost: number; overhead_total: number; total_cost: number; food_cost_rate: number | null; labor_cost_rate: number | null; prime_cost_rate: number | null; total_cost_rate: number | null };
}

interface StoreRow {
  city: string; store_code: string; currency: string;
  revenue: number; food_cost: number; food_cost_rate: number | null; revenue_source: string;
}

interface KpiAlert { city: string; severity: string; title: string; message: string; }

interface Prediction {
  city: string; next_month: string | null; based_on_months: number;
  predictions: { food_cost: number | null; revenue: number | null; food_cost_trend: string } | null;
  error: string | null;
}

interface ExecReport {
  year_month: string;
  generated_at: string;
  group: GroupSummary;
  store_ranking: { year_month: string; stores: StoreRow[] };
  alerts: { year_month: string; alerts: KpiAlert[]; alert_count: number };
  predictions: { dubai: Prediction; manila: Prediction };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtJpy  = (v: number) => `¥${Math.round(v).toLocaleString("en")}`;
const fmtRate = (v: number | null) => v != null ? `${v.toFixed(1)}%` : "—";
const fmtNat  = (v: number, cur: string) => `${cur} ${Math.round(v).toLocaleString("en")}`;

function foodCls(v: number | null) {
  if (v == null) return "";
  if (v > 40) return "text-rose-400";
  if (v > 30) return "text-amber-400";
  return "text-emerald-400";
}
function primeCls(v: number | null) {
  if (v == null) return "";
  if (v > 80) return "text-rose-400";
  if (v > 65) return "text-amber-400";
  return "text-emerald-400";
}

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ExecutiveReportPage() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const [yearMonth, setYearMonth] = useState(searchParams.get("month") || thisMonth());
  const [report, setReport] = useState<ExecReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const authHeaders = useCallback(() => {
    const auth = getAuth();
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (auth?.accessToken) h.Authorization = `Bearer ${auth.accessToken}`;
    return h;
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/mgmt/executive-report?year_month=${yearMonth}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`${res.status}`);
      setReport(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [yearMonth, authHeaders]);

  useEffect(() => {
    const auth = getAuth();
    if (!auth || !["HQ", "ADMIN"].includes(auth.role)) { router.push("/"); return; }

    // Inject print CSS to hide NavBar when printing
    const style = document.createElement("style");
    style.innerHTML = `@media print {
      header, footer, nav { display: none !important; }
      main { margin-left: 0 !important; padding: 0 !important; max-width: none !important; }
      .no-print { display: none !important; }
      .print-page { break-inside: avoid; }
      body { background: white !important; color: black !important; }
    }`;
    document.head.appendChild(style);
    fetchReport();
    return () => { document.head.removeChild(style); };
  }, [fetchReport, router]);

  const g = report?.group?.group;
  const now = report ? new Date(report.generated_at).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" }) : "";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 max-w-5xl mx-auto">

      {/* Toolbar — hidden when printing */}
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <button onClick={() => router.push("/admin/mgmt-accounting/group")} className={SMALL_BUTTON}>
          ← Group Management
        </button>
        <select
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100"
        >
          {Array.from({ length: 12 }, (_, i) => {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          }).map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <button onClick={fetchReport} disabled={loading} className={SMALL_BUTTON}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        <button onClick={() => window.print()} className={PRIMARY_BUTTON} disabled={!report}>
          Print / Save PDF
        </button>
      </div>

      {error && <div className="text-rose-400 text-sm mb-4 no-print">{error}</div>}
      {loading && !report && <div className="text-zinc-500 text-sm mb-4">Loading executive report…</div>}

      {report && (
        <>
          {/* Report Header */}
          <div className="mb-6 border-b border-zinc-700 pb-4">
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">SUSHI ZEN WORKFORCE OS</p>
            <h1 className={T_PAGE_TITLE}>Monthly Executive Report</h1>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-zinc-400">
              <span>Period: <strong className="text-zinc-200">{report.year_month}</strong></span>
              <span>Generated: <span className="text-zinc-300">{now}</span></span>
              <span>FX: <span className="text-zinc-300">1 AED = ¥{report.group.fx_rates.AED_JPY.toFixed(2)} · 1 PHP = ¥{report.group.fx_rates.PHP_JPY.toFixed(2)}</span></span>
            </div>
          </div>

          {/* KPI Alerts */}
          {report.alerts.alert_count > 0 && (
            <div className={`${GLASS_CARD} mb-4 print-page`}>
              <h2 className={`${T_SECTION} mb-3`}>
                KPI Alerts
                <span className={`ml-2 text-xs font-normal px-2 py-0.5 rounded-full ${
                  report.alerts.alerts.some(a => a.severity === "critical")
                    ? "bg-rose-500/20 text-rose-400"
                    : "bg-amber-500/20 text-amber-400"
                }`}>
                  {report.alerts.alert_count} {report.alerts.alert_count === 1 ? "alert" : "alerts"}
                </span>
              </h2>
              <div className="flex flex-col gap-2">
                {report.alerts.alerts.map((a, i) => (
                  <div key={i} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                    a.severity === "critical"
                      ? "border-rose-500/30 bg-rose-500/10"
                      : "border-amber-500/30 bg-amber-500/10"
                  }`}>
                    <span className="text-sm">{a.severity === "critical" ? "🔴" : "🟠"}</span>
                    <div>
                      <div className={`font-semibold text-sm ${a.severity === "critical" ? "text-rose-300" : "text-amber-300"}`}>
                        {a.title}
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">{a.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Group P&L Summary */}
          {g && (
            <div className={`${GLASS_CARD} mb-4 print-page`}>
              <h2 className={`${T_SECTION} mb-3`}>Group P&L Summary — {report.year_month}</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                {[
                  { label: "Group Revenue",    value: fmtJpy(g.revenue),    sub: "" },
                  { label: "Food Cost",        value: fmtJpy(g.food_cost),  sub: `Rate: ${fmtRate(g.food_cost_rate)}`,  cls: foodCls(g.food_cost_rate) },
                  { label: "Labor Cost",       value: fmtJpy(g.labor_cost), sub: `Rate: ${fmtRate(g.labor_cost_rate)}` },
                  { label: "Prime Cost",       value: fmtJpy(g.prime_cost), sub: `Rate: ${fmtRate(g.prime_cost_rate)}`, cls: primeCls(g.prime_cost_rate) },
                ].map(({ label, value, sub, cls }) => (
                  <div key={label} className="rounded-lg bg-zinc-800/50 p-3">
                    <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{label}</div>
                    <div className={`text-lg font-bold font-mono ${cls || "text-zinc-100"}`}>{value}</div>
                    {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
                  </div>
                ))}
              </div>

              {/* City comparison */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-500 text-xs uppercase border-b border-zinc-800">
                      <th className="text-left py-2 pr-4">City</th>
                      <th className="text-right py-2 pr-4">Revenue</th>
                      <th className="text-right py-2 pr-4">Food Cost</th>
                      <th className="text-right py-2 pr-4">Food %</th>
                      <th className="text-right py-2 pr-4">Labor</th>
                      <th className="text-right py-2 pr-4">Prime Cost</th>
                      <th className="text-right py-2">Prime %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      { label: "Dubai",  flag: "🇦🇪", d: report.group.dubai  },
                      { label: "Manila", flag: "🇵🇭", d: report.group.manila },
                    ] as const).map(({ label, flag, d }) => (
                      <tr key={label} className="border-b border-zinc-800/50">
                        <td className="py-2.5 pr-4 font-medium">
                          {flag} {label}
                          <div className="text-xs text-zinc-500">{fmtNat(d.native.revenue, d.native.currency)}</div>
                        </td>
                        <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(d.revenue)}</td>
                        <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(d.food_cost)}</td>
                        <td className={`text-right py-2.5 pr-4 font-semibold ${foodCls(d.food_cost_rate)}`}>{fmtRate(d.food_cost_rate)}</td>
                        <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(d.labor_cost)}</td>
                        <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(d.prime_cost)}</td>
                        <td className={`text-right py-2.5 font-semibold ${primeCls(d.prime_cost_rate)}`}>{fmtRate(d.prime_cost_rate)}</td>
                      </tr>
                    ))}
                    <tr className="bg-zinc-800/30 font-semibold">
                      <td className="py-2.5 pr-4">🌐 Group Total</td>
                      <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(g.revenue)}</td>
                      <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(g.food_cost)}</td>
                      <td className={`text-right py-2.5 pr-4 ${foodCls(g.food_cost_rate)}`}>{fmtRate(g.food_cost_rate)}</td>
                      <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(g.labor_cost)}</td>
                      <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(g.prime_cost)}</td>
                      <td className={`text-right py-2.5 ${primeCls(g.prime_cost_rate)}`}>{fmtRate(g.prime_cost_rate)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Store Ranking */}
          {report.store_ranking.stores.length > 0 && (
            <div className={`${GLASS_CARD} mb-4 print-page`}>
              <h2 className={`${T_SECTION} mb-1`}>Store Food Cost Ranking</h2>
              <p className="text-xs text-zinc-500 mb-3">Sorted by food cost (highest first)</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-500 text-xs uppercase border-b border-zinc-800">
                      <th className="text-left py-2 w-8">#</th>
                      <th className="text-left py-2 pr-4">Store</th>
                      <th className="text-left py-2 pr-4">City</th>
                      <th className="text-right py-2 pr-4">Food Cost</th>
                      <th className="text-right py-2 pr-4">Revenue</th>
                      <th className="text-right py-2">Food %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.store_ranking.stores.map((s, i) => (
                      <tr key={`${s.city}-${s.store_code}`} className="border-b border-zinc-800/40">
                        <td className="py-2 text-zinc-600 text-xs">{i + 1}</td>
                        <td className="py-2 pr-4 font-semibold">{s.store_code}</td>
                        <td className="py-2 pr-4 text-xs text-zinc-400">
                          {s.city === "dubai" ? "🇦🇪" : "🇵🇭"} {s.city}
                        </td>
                        <td className="text-right py-2 pr-4 font-mono">
                          {s.currency} {Math.round(s.food_cost).toLocaleString("en")}
                        </td>
                        <td className="text-right py-2 pr-4 font-mono text-zinc-400">
                          {s.revenue > 0 ? `${s.currency} ${Math.round(s.revenue).toLocaleString("en")}` : "—"}
                        </td>
                        <td className={`text-right py-2 font-semibold ${foodCls(s.food_cost_rate)}`}>
                          {fmtRate(s.food_cost_rate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Trend Predictions */}
          {(report.predictions.dubai.predictions || report.predictions.manila.predictions) && (
            <div className={`${GLASS_CARD} mb-4 print-page`}>
              <h2 className={`${T_SECTION} mb-1`}>Trend Predictions</h2>
              <p className="text-xs text-zinc-500 mb-3">Linear regression based on last 6 months of data</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {([
                  { label: "Dubai",  flag: "🇦🇪", pred: report.predictions.dubai,  cur: "AED" },
                  { label: "Manila", flag: "🇵🇭", pred: report.predictions.manila, cur: "PHP" },
                ] as const).map(({ label, flag, pred, cur }) => (
                  <div key={label} className="rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span>{flag}</span>
                      <span className="text-sm font-semibold text-zinc-300">{label}</span>
                      {pred.next_month && (
                        <span className="text-xs text-zinc-500 ml-auto">Forecast: {pred.next_month}</span>
                      )}
                    </div>
                    {pred.predictions ? (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-zinc-500">Food Cost (next mo.)</span>
                          <span className={`text-sm font-mono font-semibold ${
                            pred.predictions.food_cost_trend === "up"   ? "text-rose-400"
                              : pred.predictions.food_cost_trend === "down" ? "text-emerald-400"
                              : "text-zinc-300"
                          }`}>
                            {cur} {pred.predictions.food_cost != null
                              ? Math.round(pred.predictions.food_cost).toLocaleString("en")
                              : "—"}
                            {" "}{pred.predictions.food_cost_trend === "up" ? "↑" : pred.predictions.food_cost_trend === "down" ? "↓" : "→"}
                          </span>
                        </div>
                        {pred.predictions.revenue != null && pred.predictions.revenue > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-zinc-500">Revenue (next mo.)</span>
                            <span className="text-sm font-mono text-zinc-400">
                              {cur} {Math.round(pred.predictions.revenue).toLocaleString("en")}
                            </span>
                          </div>
                        )}
                        <div className="text-xs text-zinc-600 pt-1">Based on {pred.based_on_months} months</div>
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-500">{pred.error || "Insufficient data"}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Print footer */}
          <div className="mt-6 pt-4 border-t border-zinc-800 text-xs text-zinc-600 flex justify-between">
            <span>Sushi ZEN Workforce OS — Management Accounting</span>
            <span>Generated {now}</span>
          </div>
        </>
      )}
    </div>
  );
}
