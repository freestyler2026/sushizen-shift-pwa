"use client";

import { useEffect, useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Camera, ChevronDown, ChevronUp, RefreshCw, Settings } from "lucide-react";
import { getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  TABLE_HEADER,
  TABLE_ROW,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  T_SECTION as SECTION_TITLE,
  T_BODY as BODY_TEXT,
  T_CAPTION as SUBTEXT,
} from "@/lib/ui-tokens";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScoreSummaryRow {
  store_code: string;
  branch_code: string;
  city: string;
  score_date: string;
  photo_count: number;
  avg_total: number;
  avg_shape: number;
  avg_size_consistency: number;
  avg_completion: number;
  avg_topping: number;
  avg_cut_uniformity: number;
  avg_arrangement: number;
  avg_portioning: number;
}

interface ScoreRow {
  id: number;
  store_code: string;
  branch_code: string;
  city: string;
  author_name: string;
  image_url: string;
  score_date: string;
  scored_at: string;
  total_score: number;
  grade: string;
  feedback: string;
  food_category: string;
  score_shape: number;
  score_size_consistency: number;
  score_completion: number;
  score_topping: number;
  score_cut_uniformity: number;
  score_arrangement: number;
  score_portioning: number;
}

// Axis display labels per food_category
const AXIS_LABELS: Record<string, Record<string, string>> = {
  sushi: {
    shape: "Shape", size_consistency: "Size", completion: "Completion",
    topping: "Topping", cut_uniformity: "Cut", arrangement: "Arrangement", portioning: "Portion",
  },
  general: {
    shape: "Presentation", size_consistency: "Consistency", completion: "Completion",
    topping: "Freshness", cut_uniformity: "Cleanliness", arrangement: "Overall", portioning: "Portion",
  },
};

interface ChannelRow {
  channel_id: string;
  store_code: string;
  branch_code: string;
  city: string;
  label: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GRADE_COLORS: Record<string, string> = {
  S: "#a78bfa",
  A: "#34d399",
  B: "#60a5fa",
  C: "#fbbf24",
  F: "#f87171",
};

const AXES_LABELS: Record<string, string> = {
  avg_shape: "Shape",
  avg_size_consistency: "Size",
  avg_completion: "Completion",
  avg_topping: "Topping",
  avg_cut_uniformity: "Cut",
  avg_arrangement: "Arrangement",
  avg_portioning: "Portion",
};

function gradeColor(grade: string) {
  return GRADE_COLORS[grade] ?? "#94a3b8";
}

function scoreBg(score: number) {
  if (score >= 90) return "text-violet-300";
  if (score >= 75) return "text-emerald-400";
  if (score >= 60) return "text-blue-400";
  if (score >= 45) return "text-yellow-400";
  return "text-red-400";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function sevenDaysAgoIso() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

// ─── Store chart bar ─────────────────────────────────────────────────────────

function StoreBar({ row }: { row: ScoreSummaryRow }) {
  const axes = Object.entries(AXES_LABELS).map(([key, label]) => ({
    label,
    value: Number((row as unknown as Record<string, unknown>)[key] ?? 0),
  }));

  return (
    <div className={`${GLASS_CARD} p-4`}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <span className="font-semibold text-slate-100">{row.branch_code || row.store_code}</span>
          <span className="ml-2 text-xs text-slate-400">{row.city}</span>
          <span className="ml-2 text-xs text-slate-500">{row.score_date}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${scoreBg(row.avg_total)}`}>
            {row.avg_total}
          </span>
          <span
            className="rounded px-1.5 py-0.5 text-xs font-bold text-black"
            style={{ background: gradeColor("A") }}
          >
            {row.photo_count} photos
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <BarChart data={axes} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} />
          <YAxis domain={[0, 10]} tick={{ fontSize: 9, fill: "#64748b" }} />
          <Tooltip
            contentStyle={{ background: "#1e293b", border: "none", fontSize: 12 }}
            formatter={(v: number) => [v.toFixed(1), ""]}
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {axes.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.value >= 7.5 ? "#a78bfa" : entry.value >= 6 ? "#60a5fa" : entry.value >= 4.5 ? "#fbbf24" : "#f87171"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Channel Setup Modal ──────────────────────────────────────────────────────

function ChannelSetupPanel({
  channels,
  approverName,
  pin,
  onSaved,
}: {
  channels: ChannelRow[];
  approverName: string;
  pin: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    channel_id: "",
    store_code: "",
    branch_code: "",
    city: "dubai",
    label: "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    if (!form.channel_id || !form.store_code || !form.branch_code) {
      setMsg("All fields required");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/qc/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ ...form, approver_name: approverName, pin }),
      });
      if (!res.ok) throw new Error(await res.text());
      setForm({ channel_id: "", store_code: "", branch_code: "", city: "dubai", label: "" });
      setMsg("Saved");
      onSaved();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`${GLASS_CARD} p-4 space-y-4`}>
      <div className="flex items-center gap-2">
        <Settings className="h-4 w-4 text-violet-400" />
        <h3 className={SECTION_TITLE}>QC Discord Channel Mapping</h3>
      </div>
      <p className={BODY_TEXT}>
        Register Discord channel IDs so the bot knows which store each QC photo channel belongs to.
      </p>

      {channels.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                {["Channel ID", "Store", "Branch", "City", "Label"].map((h) => (
                  <th key={h} className={TABLE_HEADER}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {channels.map((ch) => (
                <tr key={ch.channel_id} className={TABLE_ROW}>
                  <td className="py-1 px-2 font-mono text-slate-300">{ch.channel_id}</td>
                  <td className="py-1 px-2">{ch.store_code}</td>
                  <td className="py-1 px-2">{ch.branch_code}</td>
                  <td className="py-1 px-2 capitalize">{ch.city}</td>
                  <td className="py-1 px-2 text-slate-400">{ch.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div>
          <label className={`block text-xs mb-1 ${SUBTEXT}`}>Discord Channel ID</label>
          <input
            className={INPUT_CLASS}
            placeholder="e.g. 1234567890123456789"
            value={form.channel_id}
            onChange={(e) => setForm((f) => ({ ...f, channel_id: e.target.value }))}
          />
        </div>
        <div>
          <label className={`block text-xs mb-1 ${SUBTEXT}`}>Store Code</label>
          <input
            className={INPUT_CLASS}
            placeholder="e.g. Dubai_BB"
            value={form.store_code}
            onChange={(e) => setForm((f) => ({ ...f, store_code: e.target.value }))}
          />
        </div>
        <div>
          <label className={`block text-xs mb-1 ${SUBTEXT}`}>Branch Code</label>
          <input
            className={INPUT_CLASS}
            placeholder="e.g. BB"
            value={form.branch_code}
            onChange={(e) => setForm((f) => ({ ...f, branch_code: e.target.value }))}
          />
        </div>
        <div>
          <label className={`block text-xs mb-1 ${SUBTEXT}`}>City</label>
          <select
            className={SELECT_CLASS}
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
          >
            <option value="dubai">Dubai</option>
            <option value="manila">Manila</option>
          </select>
        </div>
        <div>
          <label className={`block text-xs mb-1 ${SUBTEXT}`}>Label (optional)</label>
          <input
            className={INPUT_CLASS}
            placeholder="e.g. Business Bay QC"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={PRIMARY_BUTTON}
        >
          {saving ? "Saving…" : "Add Channel"}
        </button>
        {msg && <span className="text-xs text-slate-400">{msg}</span>}
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ProductScoringTab({
  approverName,
  pin,
  isHQOrAdmin,
}: {
  approverName: string;
  pin: string;
  isHQOrAdmin: boolean;
}) {
  const [dateFrom, setDateFrom] = useState(sevenDaysAgoIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [cityFilter, setCityFilter] = useState<"" | "dubai" | "manila">("");
  const [summary, setSummary] = useState<ScoreSummaryRow[]>([]);
  const [recentScores, setRecentScores] = useState<ScoreRow[]>([]);
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [scoreStoreFilter, setScoreStoreFilter] = useState<string>("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        approver_name: approverName,
        pin,
      });
      if (cityFilter) qs.set("city", cityFilter);

      const [sumRes, scoresRes, chRes] = await Promise.all([
        fetch(`/api/admin/qc/summary?${qs}`, { headers: getAuthHeaders() }),
        fetch(`/api/admin/qc/scores?${qs}&limit=100`, { headers: getAuthHeaders() }),
        fetch(`/api/admin/qc/channels?approver_name=${approverName}&pin=${pin}`, { headers: getAuthHeaders() }),
      ]);

      if (!sumRes.ok) throw new Error(await sumRes.text());
      const sumData = await sumRes.json();
      setSummary((sumData.summary ?? []).map((r: ScoreSummaryRow) => ({
        ...r,
        avg_total: Number(r.avg_total),
        avg_shape: Number(r.avg_shape),
        avg_size_consistency: Number(r.avg_size_consistency),
        avg_completion: Number(r.avg_completion),
        avg_topping: Number(r.avg_topping),
        avg_cut_uniformity: Number(r.avg_cut_uniformity),
        avg_arrangement: Number(r.avg_arrangement),
        avg_portioning: Number(r.avg_portioning),
      })));

      if (scoresRes.ok) {
        const sd = await scoresRes.json();
        setRecentScores(sd.scores ?? []);
      }

      if (chRes.ok) {
        const cd = await chRes.json();
        setChannels(cd.channels ?? []);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Aggregate KPIs across filtered summary ──
  const kpis = useMemo(() => {
    if (!summary.length) return null;
    const rows = cityFilter ? summary.filter((r) => r.city === cityFilter) : summary;
    if (!rows.length) return null;
    const totalPhotos = rows.reduce((a, r) => a + r.photo_count, 0);
    const avgScore = rows.reduce((a, r) => a + r.avg_total * r.photo_count, 0) / totalPhotos;
    const byStore: Record<string, { total: number; count: number; branch: string; city: string }> = {};
    for (const r of rows) {
      if (!byStore[r.store_code]) byStore[r.store_code] = { total: 0, count: 0, branch: r.branch_code, city: r.city };
      byStore[r.store_code].total += r.avg_total * r.photo_count;
      byStore[r.store_code].count += r.photo_count;
    }
    const storeAvgs = Object.entries(byStore).map(([code, v]) => ({
      store_code: code,
      branch: v.branch,
      city: v.city,
      avg: v.total / v.count,
    })).sort((a, b) => b.avg - a.avg);
    return { totalPhotos, avgScore, storeAvgs };
  }, [summary, cityFilter]);

  // ── Chart data: per-store averages for the period ──
  const chartData = kpis?.storeAvgs.map((s) => ({
    name: s.branch || s.store_code,
    score: parseFloat(s.avg.toFixed(1)),
  })) ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/20 to-purple-500/10">
          <Camera className="h-4 w-4 text-violet-400" />
        </div>
        <div>
          <h2 className={SECTION_TITLE}>Product Scoring</h2>
          <p className={SUBTEXT}>Claude Vision QC scoring — photos auto-scored from Discord</p>
        </div>
        <div className="ml-auto flex gap-2">
          {isHQOrAdmin && (
            <button
              type="button"
              onClick={() => setShowSetup((v) => !v)}
              className={SECONDARY_BUTTON + " flex items-center gap-1 text-xs"}
            >
              <Settings className="h-3 w-3" />
              Channel Setup
            </button>
          )}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className={SECONDARY_BUTTON + " flex items-center gap-1 text-xs"}
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Channel Setup Panel */}
      {showSetup && isHQOrAdmin && (
        <ChannelSetupPanel
          channels={channels}
          approverName={approverName}
          pin={pin}
          onSaved={load}
        />
      )}

      {/* Filters */}
      <div className={`${GLASS_CARD} flex flex-wrap gap-3 p-4`}>
        <div>
          <label className={`block text-xs mb-1 ${SUBTEXT}`}>From</label>
          <input
            type="date"
            className={INPUT_CLASS}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className={`block text-xs mb-1 ${SUBTEXT}`}>To</label>
          <input
            type="date"
            className={INPUT_CLASS}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div>
          <label className={`block text-xs mb-1 ${SUBTEXT}`}>City</label>
          <select
            className={SELECT_CLASS}
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value as "" | "dubai" | "manila")}
          >
            <option value="">All Cities</option>
            <option value="dubai">Dubai</option>
            <option value="manila">Manila</option>
          </select>
        </div>
        <div className="flex items-end">
          <button type="button" onClick={load} disabled={loading} className={PRIMARY_BUTTON}>
            {loading ? "Loading…" : "Apply"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/30 px-4 py-2 text-sm text-red-300">{error}</div>
      )}

      {/* KPI row */}
      {kpis && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className={KPI_CARD}>
            <div className={KPI_LABEL}>Total Photos Scored</div>
            <div className={KPI_VALUE}>{kpis.totalPhotos}</div>
          </div>
          <div className={KPI_CARD}>
            <div className={KPI_LABEL}>Overall Avg Score</div>
            <div className={`${KPI_VALUE} ${scoreBg(kpis.avgScore)}`}>
              {kpis.avgScore.toFixed(1)}
            </div>
          </div>
          <div className={KPI_CARD}>
            <div className={KPI_LABEL}>Best Store</div>
            <div className={KPI_VALUE + " text-base"}>
              {kpis.storeAvgs[0]?.branch ?? "—"}
              <span className={`ml-1 text-sm ${scoreBg(kpis.storeAvgs[0]?.avg ?? 0)}`}>
                {kpis.storeAvgs[0]?.avg.toFixed(1)}
              </span>
            </div>
          </div>
          <div className={KPI_CARD}>
            <div className={KPI_LABEL}>Stores Tracked</div>
            <div className={KPI_VALUE}>{kpis.storeAvgs.length}</div>
          </div>
        </div>
      )}

      {/* Bar chart */}
      {chartData.length > 0 && (
        <div className={`${GLASS_CARD} p-4`}>
          <h3 className={`${SECTION_TITLE} mb-3`}>Average Score by Store</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} />
              <Tooltip
                contentStyle={{ background: "#1e293b", border: "none", fontSize: 12 }}
                formatter={(v: number) => [`${v}`, "Avg Score"]}
              />
              <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.score >= 90 ? "#a78bfa" : entry.score >= 75 ? "#34d399" : entry.score >= 60 ? "#60a5fa" : entry.score >= 45 ? "#fbbf24" : "#f87171"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-store per-day axis breakdown */}
      {summary.length > 0 ? (
        <div>
          <h3 className={`${SECTION_TITLE} mb-3`}>Daily Breakdown by Store</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {summary
              .filter((r) => !cityFilter || r.city === cityFilter)
              .map((row, i) => (
                <StoreBar key={i} row={row} />
              ))}
          </div>
        </div>
      ) : !loading ? (
        <div className={`${GLASS_CARD} p-8 text-center`}>
          <Camera className="mx-auto mb-3 h-8 w-8 text-slate-600" />
          <p className={BODY_TEXT}>No scores yet for this period.</p>
          <p className={`${SUBTEXT} mt-1`}>
            Register QC Discord channels in Channel Setup, then photos posted there will be scored automatically.
          </p>
        </div>
      ) : null}

      {/* Recent individual scores table */}
      {recentScores.length > 0 && (
        <div className={GLASS_CARD + " p-4"}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className={SECTION_TITLE}>Recent Individual Scores</h3>
            <select
              value={scoreStoreFilter}
              onChange={(e) => { setScoreStoreFilter(e.target.value); setExpandedRow(null); }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              <option value="">All Stores</option>
              {Array.from(new Set(recentScores.map((r) => r.branch_code || r.store_code)))
                .sort()
                .map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {["Date", "Store", "Staff", "Category", "Score", "Grade", "Feedback", ""].map((h) => (
                    <th key={h} className={TABLE_HEADER}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentScores
                  .filter((r) => !scoreStoreFilter || (r.branch_code || r.store_code) === scoreStoreFilter)
                  .slice(0, 50)
                  .map((row) => (
                  <>
                    <tr key={row.id} className={TABLE_ROW + " cursor-pointer"} onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}>
                      <td className="py-1.5 px-2 text-slate-400">{row.score_date}</td>
                      <td className="py-1.5 px-2 font-medium">{row.branch_code || row.store_code}</td>
                      <td className="py-1.5 px-2 text-slate-400">{row.author_name || "—"}</td>
                      <td className="py-1.5 px-2">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${row.food_category === "general" ? "bg-amber-900/50 text-amber-300" : "bg-blue-900/50 text-blue-300"}`}>
                          {row.food_category === "general" ? "🍽 General" : "🍣 Sushi"}
                        </span>
                      </td>
                      <td className={`py-1.5 px-2 font-bold ${scoreBg(row.total_score)}`}>{row.total_score}</td>
                      <td className="py-1.5 px-2">
                        <span
                          className="rounded px-1.5 py-0.5 text-xs font-bold text-black"
                          style={{ background: gradeColor(row.grade) }}
                        >
                          {row.grade}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-slate-400 max-w-[200px] truncate">{row.feedback}</td>
                      <td className="py-1.5 px-2 text-slate-500">
                        {expandedRow === row.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </td>
                    </tr>
                    {expandedRow === row.id && (
                      <tr key={`${row.id}-expand`} className="bg-slate-900/40">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="grid grid-cols-7 gap-2 text-xs">
                            {(["shape", "size_consistency", "completion", "topping", "cut_uniformity", "arrangement", "portioning"] as const).map((axis) => {
                              const val = row[`score_${axis}` as keyof ScoreRow] as number;
                              const cat = row.food_category === "general" ? "general" : "sushi";
                              const label = AXIS_LABELS[cat]?.[axis] ?? axis;
                              return (
                                <div key={axis} className="text-center">
                                  <div className={`text-base font-bold ${scoreBg(val * 10)}`}>{val}</div>
                                  <div className="text-slate-500 text-[10px]">{label}</div>
                                </div>
                              );
                            })}
                          </div>
                          {row.image_url && (
                            <a
                              href={row.image_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-block text-xs text-violet-400 underline"
                            >
                              View photo ↗
                            </a>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
