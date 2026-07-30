"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle2, Database, FileSpreadsheet, Edit3, List } from "lucide-react";
import { getAuth, getAuthHeaders, tryRefreshAccessToken } from "@/lib/auth";
import { GLASS_CARD, PRIMARY_BUTTON, SMALL_BUTTON, T_LABEL, T_PAGE_TITLE, TABLE_CELL, TABLE_HEADER, TABLE_ROW } from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") { const _devBase = process.env.NEXT_PUBLIC_API_BASE_URL; if (_devBase) return _devBase.replace(/\/+$/, ""); return "http://127.0.0.1:8000"; }
  return "";
}

async function apiGet<T = unknown>(path: string): Promise<T> {
  const request = async () =>
    fetch(`${getApiBase()}${path}`, { cache: "no-store", headers: getAuthHeaders() });
  let res = await request();
  let text = await res.text();
  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) { res = await request(); text = await res.text(); }
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = JSON.parse(text); msg = j?.detail || msg; } catch { if (text) msg = text; }
    throw new Error(msg);
  }
  return JSON.parse(text) as T;
}

type HistoryRow = {
  branch_code: string;
  week_start: string;
  published_by: string;
  published_at_pht: string;
  published_at_utc: string;
  publish_source: "draft_apply" | "bayzat_import" | "load_from_db" | "manual";
  row_count: number;
};

type LogRow = {
  id: number;
  branch_code: string;
  week_start: string;
  published_by: string;
  published_at_pht: string;
  published_at_utc: string;
  publish_source: "draft_apply" | "bayzat_import" | "load_from_db" | "manual" | "unknown";
  rows_count: number;
  draft_version_id: string | null;
  draft_created_at_pht: string | null;
};

const SOURCE_CONFIG = {
  bayzat_import: {
    label: "Bayzat Import",
    icon: <FileSpreadsheet className="h-3.5 w-3.5" />,
    color: "text-amber-400",
    bg: "bg-amber-500/15 border-amber-500/30",
    risk: true,
  },
  load_from_db: {
    label: "Load from DB",
    icon: <Database className="h-3.5 w-3.5" />,
    color: "text-orange-400",
    bg: "bg-orange-500/15 border-orange-500/30",
    risk: true,
  },
  draft_apply: {
    label: "Draft Apply",
    icon: <Edit3 className="h-3.5 w-3.5" />,
    color: "text-sky-400",
    bg: "bg-sky-500/15 border-sky-500/30",
    risk: false,
  },
  manual: {
    label: "Manual Publish",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    color: "text-emerald-400",
    bg: "bg-emerald-500/15 border-emerald-500/30",
    risk: false,
  },
  unknown: {
    label: "Unknown",
    icon: <List className="h-3.5 w-3.5" />,
    color: "text-neutral-400",
    bg: "bg-neutral-500/15 border-neutral-500/30",
    risk: false,
  },
};

function SourceBadge({ source }: { source: string }) {
  const cfg = SOURCE_CONFIG[source as keyof typeof SOURCE_CONFIG] ?? SOURCE_CONFIG.unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function fmtPht(s: string | null) {
  if (!s) return "—";
  const clean = s.replace("T", " ").slice(0, 16);
  return clean + " PHT";
}

export default function ShiftAuditPage() {
  const auth = getAuth();
  const [city, setCity] = useState<"manila" | "dubai">("manila");
  const [weeks, setWeeks] = useState(4);
  const [tab, setTab] = useState<"current" | "log">("current");

  // Current state tab
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Full audit log tab
  const [log, setLog] = useState<LogRow[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const canAccess = auth?.role === "ADMIN" || auth?.role === "HQ";

  async function loadCurrent() {
    if (!canAccess) { setError("HQ / Admin access required."); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ ok: boolean; history: HistoryRow[] }>(
        `/api/admin/shifts/publish_history?city=${city}&weeks=${weeks}`
      );
      setHistory(res.history ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }

  async function loadLog() {
    if (!canAccess) { setLogError("HQ / Admin access required."); return; }
    setLogLoading(true);
    setLogError(null);
    try {
      const res = await apiGet<{ ok: boolean; log: LogRow[] }>(
        `/api/admin/shifts/publish_log?city=${city}&weeks=${weeks}`
      );
      setLog(res.log ?? []);
    } catch (e: unknown) {
      setLogError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLogLoading(false);
    }
  }

  function refresh() {
    if (tab === "current") void loadCurrent();
    else void loadLog();
  }

  useEffect(() => {
    if (tab === "current") void loadCurrent();
    else void loadLog();
  }, [city, weeks, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Group current history by week_start
  const byWeek: Record<string, HistoryRow[]> = {};
  for (const r of history) {
    if (!byWeek[r.week_start]) byWeek[r.week_start] = [];
    byWeek[r.week_start].push(r);
  }
  const weeksSorted = Object.keys(byWeek).sort().reverse();

  const riskCount = history.filter(r => SOURCE_CONFIG[r.publish_source]?.risk).length;
  const logRiskCount = log.filter(r => SOURCE_CONFIG[r.publish_source as keyof typeof SOURCE_CONFIG]?.risk).length;

  return (
    <main className="min-h-screen bg-neutral-950 pb-24 text-white">
      <div className="mx-auto max-w-5xl px-4 py-8">

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Link href="/admin" className={`${SMALL_BUTTON} flex items-center gap-1.5 mt-1`}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
            <div>
              <h1 className={`${T_PAGE_TITLE} flex items-center gap-2`}>
                Shift Publish Audit
              </h1>
              <p className="mt-1 text-sm text-white/40">
                Who published each branch&apos;s schedule and when — for investigating shift reversions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* City tabs */}
            <div className="flex overflow-hidden rounded-xl border border-white/10">
              {(["manila", "dubai"] as const).map((c) => (
                <button key={c} type="button" onClick={() => setCity(c)}
                  className={["px-4 py-2 text-sm font-medium capitalize transition-colors",
                    city === c ? "bg-violet-600/70 text-white" : "bg-white/5 text-white/40 hover:text-white/70",
                  ].join(" ")}>{c}</button>
              ))}
            </div>
            {/* Weeks selector */}
            <SelectDark
              value={String(weeks)}
              onChange={v => setWeeks(Number(v))}
              className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none"
              options={[
                { value: "2", label: "Last 2 weeks" },
                { value: "4", label: "Last 4 weeks" },
                { value: "8", label: "Last 8 weeks" },
                { value: "12", label: "Last 12 weeks" },
              ]}
            />
            <button onClick={refresh} disabled={loading || logLoading}
              className={`${PRIMARY_BUTTON} flex items-center gap-2 disabled:opacity-50`}>
              <RefreshCw className={`h-4 w-4 ${(loading || logLoading) ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* View tabs */}
        <div className="mb-4 flex gap-1 rounded-xl border border-white/10 bg-white/4 p-1 w-fit">
          <button
            onClick={() => setTab("current")}
            className={["px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
              tab === "current" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60",
            ].join(" ")}
          >
            Latest State
          </button>
          <button
            onClick={() => setTab("log")}
            className={["px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
              tab === "log" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60",
            ].join(" ")}
          >
            Full Audit Log
          </button>
        </div>

        {/* ── CURRENT STATE TAB ── */}
        {tab === "current" && (
          <>
            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}
            {!loading && riskCount > 0 && (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>{riskCount} high-risk publish event{riskCount > 1 ? "s" : ""}</strong> found —
                  Bayzat Import or Load from DB entries can overwrite manual OS shift corrections.
                </span>
              </div>
            )}
            {loading && <div className={`${GLASS_CARD} p-10 text-center text-white/30`}>Loading…</div>}
            {!loading && weeksSorted.length === 0 && !error && (
              <div className={`${GLASS_CARD} p-10 text-center text-white/30`}>No publish history found.</div>
            )}
            {!loading && weeksSorted.map((ws) => {
              const rows = byWeek[ws];
              return (
                <div key={ws} className={`${GLASS_CARD} mb-4 overflow-hidden`}>
                  <div className="border-b border-white/8 px-4 py-3">
                    <p className="text-sm font-semibold text-white">
                      Week of <span className="font-mono">{ws}</span>
                      <span className="ml-2 text-xs text-white/30">({rows.length} branches published)</span>
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/8">
                          <th className={`${TABLE_HEADER} px-4 py-2.5 text-left`}>Branch</th>
                          <th className={`${TABLE_HEADER} px-4 py-2.5 text-left`}>Source</th>
                          <th className={`${TABLE_HEADER} px-4 py-2.5 text-left`}>Published By</th>
                          <th className={`${TABLE_HEADER} px-4 py-2.5 text-left`}>Published At (PHT)</th>
                          <th className={`${TABLE_HEADER} px-4 py-2.5 text-right`}>Rows</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => {
                          const cfg = SOURCE_CONFIG[r.publish_source] ?? SOURCE_CONFIG.manual;
                          return (
                            <tr key={i} className={`${TABLE_ROW} ${cfg.risk ? "bg-amber-500/5" : ""}`}>
                              <td className={`${TABLE_CELL} px-4 font-semibold text-white/80`}>{r.branch_code}</td>
                              <td className={`${TABLE_CELL} px-4`}><SourceBadge source={r.publish_source} /></td>
                              <td className={`${TABLE_CELL} px-4 font-mono ${cfg.risk ? "text-amber-300" : "text-white/60"}`}>
                                {r.published_by || "—"}
                              </td>
                              <td className={`${TABLE_CELL} px-4 text-white/50`}>{fmtPht(r.published_at_pht)}</td>
                              <td className={`${TABLE_CELL} px-4 text-right text-white/40`}>{r.row_count}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ── FULL AUDIT LOG TAB ── */}
        {tab === "log" && (
          <>
            {logError && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {logError}
              </div>
            )}
            {!logLoading && logRiskCount > 0 && (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>{logRiskCount} high-risk event{logRiskCount > 1 ? "s" : ""}</strong> in this period.
                </span>
              </div>
            )}
            {!logLoading && log.length === 0 && !logError && (
              <div className={`${GLASS_CARD} p-10 text-center`}>
                <p className="text-white/30">No publish events recorded yet.</p>
                <p className="mt-2 text-xs text-white/20">
                  The audit log captures events from this deployment onward. Earlier publishes are shown in the Latest State tab.
                </p>
              </div>
            )}
            {logLoading && <div className={`${GLASS_CARD} p-10 text-center text-white/30`}>Loading…</div>}
            {!logLoading && log.length > 0 && (
              <div className={`${GLASS_CARD} overflow-hidden`}>
                <div className="border-b border-white/8 px-4 py-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">
                    All publish events
                    <span className="ml-2 text-xs text-white/30">({log.length} total, newest first)</span>
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/8">
                        <th className={`${TABLE_HEADER} px-4 py-2.5 text-left`}>Published At (PHT)</th>
                        <th className={`${TABLE_HEADER} px-4 py-2.5 text-left`}>Branch</th>
                        <th className={`${TABLE_HEADER} px-4 py-2.5 text-left`}>Week</th>
                        <th className={`${TABLE_HEADER} px-4 py-2.5 text-left`}>Source</th>
                        <th className={`${TABLE_HEADER} px-4 py-2.5 text-left`}>Published By</th>
                        <th className={`${TABLE_HEADER} px-4 py-2.5 text-left`}>Draft Generated At</th>
                        <th className={`${TABLE_HEADER} px-4 py-2.5 text-right`}>Rows</th>
                      </tr>
                    </thead>
                    <tbody>
                      {log.map((r) => {
                        const cfg = SOURCE_CONFIG[r.publish_source as keyof typeof SOURCE_CONFIG] ?? SOURCE_CONFIG.unknown;
                        return (
                          <tr key={r.id} className={`${TABLE_ROW} ${cfg.risk ? "bg-amber-500/5" : ""}`}>
                            <td className={`${TABLE_CELL} px-4 font-mono text-white/70`}>
                              {fmtPht(r.published_at_pht)}
                            </td>
                            <td className={`${TABLE_CELL} px-4 font-semibold text-white/80`}>{r.branch_code}</td>
                            <td className={`${TABLE_CELL} px-4 font-mono text-white/50`}>{r.week_start}</td>
                            <td className={`${TABLE_CELL} px-4`}><SourceBadge source={r.publish_source} /></td>
                            <td className={`${TABLE_CELL} px-4 font-mono ${cfg.risk ? "text-amber-300" : "text-white/60"}`}>
                              {r.published_by || "—"}
                            </td>
                            <td className={`${TABLE_CELL} px-4 text-white/40`}>
                              {r.draft_created_at_pht ? fmtPht(r.draft_created_at_pht) : "—"}
                            </td>
                            <td className={`${TABLE_CELL} px-4 text-right text-white/40`}>{r.rows_count}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Legend */}
        <div className={`${GLASS_CARD} p-4 mt-6`}>
          <p className={`${T_LABEL} mb-3`}>Source Types</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["draft_apply", "manual", "bayzat_import", "load_from_db"] as const).map((key) => {
              const cfg = SOURCE_CONFIG[key];
              return (
                <div key={key} className="flex items-center gap-2 text-xs">
                  <SourceBadge source={key} />
                  {cfg.risk && <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />}
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-xs text-white/30">
            <strong className="text-amber-400">⚠ Risk:</strong> Bayzat Import and Load from DB replace published shifts with the original Bayzat schedule, overwriting any manual OS shift corrections.
          </div>
          <div className="mt-1 text-xs text-white/20">
            Full Audit Log records events from 2026-07-21 onward (when logging was deployed). Earlier history is available only in Latest State.
          </div>
        </div>
      </div>
    </main>
  );
}
