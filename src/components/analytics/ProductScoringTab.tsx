"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
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
  TAB_ACTIVE,
  TAB_INACTIVE,
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

interface WeeklyHistoryRow {
  week_start: string;
  photo_count: number;
  avg_score: number;
  count_s: number;
  count_a: number;
  count_b: number;
  count_c: number;
  count_d: number;
  count_f: number;
}

interface KnownStore {
  key: string;
  city: string;
}

interface StoreWithRate extends ScoreSummaryRow {
  order_total?: number;
  upload_rate?: number;  // photos / orders * 100
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

// Return ISO date of the Sunday that starts the week containing dateStr
function weekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const sun = new Date(d);
  sun.setDate(d.getDate() - d.getDay());
  return sun.toISOString().slice(0, 10);
}

// "MM/DD – MM/DD" label for a Sunday-start week
function weekLabel(sunIso: string): string {
  const end = new Date(sunIso + "T00:00:00");
  end.setDate(end.getDate() + 6);
  return `${sunIso.slice(5).replace("-", "/")} – ${end.toISOString().slice(5, 10).replace("-", "/")}`;
}

const GRADE_ORDER = ["S", "A", "B", "C", "D", "F"];

function gradeRateBg(rate: number) {
  if (rate <= 10) return "text-emerald-400";
  if (rate <= 25) return "text-yellow-400";
  return "text-red-400";
}

// ─── Delta badge ─────────────────────────────────────────────────────────────

function DeltaBadge({ delta, unit = "" }: { delta: number | null; unit?: string }) {
  if (delta === null) return <span className="text-slate-600">—</span>;
  const sign = delta >= 0 ? "+" : "";
  const cls = delta >= 1 ? "text-emerald-400" : delta <= -1 ? "text-red-400" : "text-slate-400";
  return (
    <span className={`font-bold ${cls}`}>
      {sign}{delta.toFixed(1)}{unit}
    </span>
  );
}

// ─── Weekly History Panel ─────────────────────────────────────────────────────

function WeeklyHistoryPanel({
  approverName,
  pin,
  allStores,
}: {
  approverName: string;
  pin: string;
  allStores: KnownStore[];
}) {
  const [selectedStore, setSelectedStore] = useState("");
  const [weekCount, setWeekCount] = useState(0);
  const [rows, setRows] = useState<WeeklyHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadHistory() {
    if (!selectedStore) return;
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({
        store_code: selectedStore,
        weeks: "52",
        approver_name: approverName,
        pin,
      });
      const res = await fetch(`/api/admin/qc/weekly-history?${qs}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRows((data.rows ?? []).map((r: WeeklyHistoryRow) => ({
        ...r,
        avg_score: Number(r.avg_score),
      })));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  // Most-recent weekCount rows for display (0 = show all available)
  const displayRows = weekCount === 0 ? rows : rows.slice(0, weekCount);

  // Chart: oldest → newest for left-to-right
  const chartData = useMemo(
    () =>
      [...displayRows].reverse().map((r) => {
        const total = r.photo_count;
        const cdCount = r.count_c + r.count_d + r.count_f;
        return {
          name: r.week_start.slice(5).replace("-", "/"),  // "MM/DD"
          score: r.avg_score,
          cd: total > 0 ? Math.round((cdCount / total) * 100) : 0,
        };
      }),
    [displayRows],
  );

  // Map for last-year lookup (key = week_start ISO string)
  const weekMap = useMemo(
    () => new Map(rows.map((r) => [r.week_start, r])),
    [rows],
  );

  function sameWeekLastYear(weekStart: string): WeeklyHistoryRow | null {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() - 364);
    return weekMap.get(d.toISOString().slice(0, 10)) ?? null;
  }

  const dubaiStores = allStores.filter((s) => s.city === "dubai");
  const manilaStores = allStores.filter((s) => s.city === "manila");

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className={`${GLASS_CARD} flex flex-wrap gap-3 p-4`}>
        <div>
          <label className={`block text-xs mb-1 ${SUBTEXT}`}>Store</label>
          <select
            className={SELECT_CLASS}
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
          >
            <option value="">Select store…</option>
            {dubaiStores.length > 0 && (
              <optgroup label="🇦🇪 Dubai">
                {dubaiStores.map((s) => (
                  <option key={s.key} value={s.key}>{s.key}</option>
                ))}
              </optgroup>
            )}
            {manilaStores.length > 0 && (
              <optgroup label="🇵🇭 Manila">
                {manilaStores.map((s) => (
                  <option key={s.key} value={s.key}>{s.key}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div>
          <label className={`block text-xs mb-1 ${SUBTEXT}`}>Period</label>
          <select
            className={SELECT_CLASS}
            value={weekCount}
            onChange={(e) => setWeekCount(Number(e.target.value))}
          >
            <option value={0}>All available</option>
            <option value={4}>Last 4 weeks</option>
            <option value={8}>Last 8 weeks</option>
            <option value={12}>Last 12 weeks</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={loadHistory}
            disabled={loading || !selectedStore}
            className={PRIMARY_BUTTON}
          >
            {loading ? "Loading…" : "Load"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/30 px-4 py-2 text-sm text-red-300">{error}</div>
      )}

      {!selectedStore && !loading && (
        <div className="rounded-lg bg-slate-800/40 px-4 py-8 text-center text-sm text-slate-400">
          Select a store and press Load to view its weekly score history.
        </div>
      )}

      {/* Trend line chart */}
      {chartData.length > 0 && (
        <div className={`${GLASS_CARD} p-4`}>
          <h3 className={`${SECTION_TITLE} mb-1`}>Score Trend — {selectedStore}</h3>
          <p className={`${SUBTEXT} mb-3`}>Green = Avg Score · Red dashed = C/D Rate %</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: -20, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 9, fill: "#94a3b8" }}
                angle={-45}
                textAnchor="end"
                interval={Math.floor(chartData.length / 8)}
              />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} />
              <Tooltip
                contentStyle={{ background: "#1e293b", border: "none", fontSize: 12 }}
                formatter={(v: number, name: string) => [
                  `${v.toFixed(1)}`,
                  name === "score" ? "Avg Score" : "C/D Rate %",
                ]}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#34d399"
                strokeWidth={2}
                dot={{ r: 3, fill: "#34d399" }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="cd"
                stroke="#f87171"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="5 3"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Weekly detail table */}
      {displayRows.length > 0 && (
        <div className={`${GLASS_CARD} p-4`}>
          <h3 className={`${SECTION_TITLE} mb-3`}>Weekly Detail — {selectedStore}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {["Week", "Avg Score", "Photos", "A%", "B%", "C/D/F", "C/D Rate", "vs Prev Wk", "vs Last Yr"].map(
                    (h) => <th key={h} className={TABLE_HEADER}>{h}</th>,
                  )}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, idx) => {
                  const prevRow = displayRows[idx + 1] ?? null;
                  const lyRow = sameWeekLastYear(row.week_start);
                  const total = row.photo_count;
                  const cdCount = row.count_c + row.count_d + row.count_f;
                  const cdRate = total > 0 ? (cdCount / total) * 100 : 0;
                  const prevDelta = prevRow ? row.avg_score - prevRow.avg_score : null;
                  const lyDelta = lyRow ? row.avg_score - lyRow.avg_score : null;

                  return (
                    <tr key={row.week_start} className={TABLE_ROW}>
                      <td className="py-2 px-2 font-mono text-slate-300 whitespace-nowrap">
                        {weekLabel(row.week_start)}
                      </td>
                      <td className={`py-2 px-2 font-bold ${scoreBg(row.avg_score)}`}>
                        {row.avg_score}
                      </td>
                      <td className="py-2 px-2 text-slate-400">{total}</td>
                      <td className="py-2 px-2 text-center text-emerald-400">
                        {total > 0 && row.count_a > 0
                          ? `${Math.round((row.count_a / total) * 100)}%`
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-2 px-2 text-center text-blue-400">
                        {total > 0 && row.count_b > 0
                          ? `${Math.round((row.count_b / total) * 100)}%`
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-2 px-2 text-center text-yellow-400">
                        {cdCount > 0 ? cdCount : <span className="text-slate-600">—</span>}
                      </td>
                      <td className={`py-2 px-2 font-bold ${gradeRateBg(cdRate)}`}>
                        {cdRate.toFixed(0)}%
                        <span className="ml-1 font-normal text-slate-500">({cdCount})</span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <DeltaBadge delta={prevDelta} />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <DeltaBadge delta={lyDelta} />
                        {lyRow && (
                          <span className="block text-[10px] text-slate-600 mt-0.5">
                            {lyRow.week_start.slice(0, 7)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={`${SUBTEXT} mt-3`}>
            vs Prev Wk: score difference from prior week · vs Last Yr: same week 52 weeks ago (364 days)
          </p>
        </div>
      )}

      {selectedStore && !loading && rows.length === 0 && (
        <div className="rounded-lg bg-slate-800/40 px-4 py-6 text-center text-sm text-slate-400">
          No data found for {selectedStore}.
        </div>
      )}
    </div>
  );
}

// ─── Store chart bar ─────────────────────────────────────────────────────────

function uploadRateColor(rate: number) {
  if (rate >= 80) return "text-emerald-400";
  if (rate >= 50) return "text-yellow-400";
  return "text-red-400";
}

function StoreBar({ row }: { row: StoreWithRate }) {
  const axes = Object.entries(AXES_LABELS).map(([key, label]) => ({
    label,
    value: Number((row as unknown as Record<string, unknown>)[key] ?? 0),
  }));

  return (
    <div className={`${GLASS_CARD} p-4`}>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <span className="font-semibold text-slate-100">{row.branch_code || row.store_code}</span>
          <span className="ml-2 text-xs text-slate-400">{row.city}</span>
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
      {row.upload_rate !== undefined && row.order_total !== undefined && (
        <div className="mb-2 flex items-center gap-2 text-xs">
          <span className="text-slate-400">Upload rate:</span>
          <span className={`font-bold ${uploadRateColor(row.upload_rate)}`}>
            {row.upload_rate.toFixed(1)}%
          </span>
          <span className="text-slate-500">
            ({row.photo_count} photos / {row.order_total} orders)
          </span>
        </div>
      )}
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

// ─── Reference Images Panel ──────────────────────────────────────────────────

interface RefImage {
  id: number;
  food_type: string;
  label: string;
  is_active: boolean;
  image_b64: string;
  created_at: string;
}

function ReferenceImagesPanel({ approverName, pin }: { approverName: string; pin: string }) {
  const [images, setImages] = useState<RefImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ food_type: "yakisoba", label: "", file: null as File | null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/qc/reference-images?approver_name=${encodeURIComponent(approverName)}&pin=${encodeURIComponent(pin)}`,
        { headers: getAuthHeaders() }
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setImages(data.images || []);
    } catch (e: unknown) {
      setMsg(`Load error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [approverName, pin]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async () => {
    if (!form.file || !form.food_type.trim()) { setMsg("Select a file and set Food Type"); return; }
    setUploading(true);
    setMsg("");
    try {
      const reader = new FileReader();
      const b64: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(form.file!);
      });
      const res = await fetch("/api/admin/qc/reference-images", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ food_type: form.food_type.trim(), label: form.label.trim(), image_b64: b64, approver_name: approverName, pin }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg("Uploaded successfully");
      setForm((f) => ({ ...f, file: null, label: "" }));
      await load();
    } catch (e: unknown) {
      setMsg(`Upload error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this reference image?")) return;
    try {
      const res = await fetch(
        `/api/admin/qc/reference-images/${id}?approver_name=${encodeURIComponent(approverName)}&pin=${encodeURIComponent(pin)}`,
        { method: "DELETE", headers: getAuthHeaders() }
      );
      if (!res.ok) throw new Error(await res.text());
      setImages((prev) => prev.filter((img) => img.id !== id));
    } catch (e: unknown) {
      setMsg(`Delete error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className={`${GLASS_CARD} p-4 space-y-4`}>
      <div className="flex items-center gap-2">
        <span className="text-violet-400 text-sm">★</span>
        <h3 className={SECTION_TITLE}>QC Reference Standard Images</h3>
        <span className={`${SUBTEXT} text-xs`}>Used by AI as visual benchmarks during scoring</span>
      </div>

      {/* Existing images */}
      {loading ? (
        <p className={`${SUBTEXT} text-xs`}>Loading…</p>
      ) : images.length === 0 ? (
        <p className={`${SUBTEXT} text-xs`}>No reference images registered yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((img) => (
            <div key={img.id} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/jpeg;base64,${img.image_b64}`}
                alt={img.label || img.food_type}
                className="w-full aspect-square object-cover rounded-lg border border-white/10"
              />
              <div className="absolute inset-0 rounded-lg bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 p-2">
                <p className="text-white text-xs font-semibold text-center truncate w-full text-center">{img.label || img.food_type}</p>
                <p className="text-white/60 text-[10px]">{img.food_type}</p>
                <button
                  onClick={() => handleDelete(img.id)}
                  className="mt-1 px-2 py-0.5 rounded bg-red-600/80 text-white text-[10px] hover:bg-red-500 transition-colors"
                >
                  Delete
                </button>
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 rounded-b-lg px-1.5 py-0.5 text-[10px] text-white/70 truncate">
                {img.label || img.food_type}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload form */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end border-t border-white/10 pt-3">
        <div>
          <label className={`block text-xs mb-1 ${SUBTEXT}`}>Food Type</label>
          <input
            className={INPUT_CLASS}
            placeholder="e.g. yakisoba, sushi, ramen"
            value={form.food_type}
            onChange={(e) => setForm((f) => ({ ...f, food_type: e.target.value }))}
          />
        </div>
        <div>
          <label className={`block text-xs mb-1 ${SUBTEXT}`}>Label</label>
          <input
            className={INPUT_CLASS}
            placeholder="e.g. Yakisoba Standard"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          />
        </div>
        <div>
          <label className={`block text-xs mb-1 ${SUBTEXT}`}>Image File</label>
          <input
            type="file"
            accept="image/*"
            className="text-xs text-slate-300 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-white/10 file:text-white/70 hover:file:bg-white/20"
            onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-transparent">Upload</label>
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !form.file}
            className={PRIMARY_BUTTON}
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
      {msg && (
        <p className={`text-xs px-2 py-1 rounded ${msg.includes("error") || msg.includes("Error") ? "text-red-300 bg-red-900/30" : "text-emerald-300 bg-emerald-900/30"}`}>
          {msg}
        </p>
      )}
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
  const [subTab, setSubTab] = useState<"overview" | "grade" | "history">("overview");
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
  const [orderTotals, setOrderTotals] = useState<Record<string, number>>({});

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

      // order-totals uses no city filter — always fetch all cities so rates are available
      const orderQs = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        approver_name: approverName,
        pin,
      });

      const [sumRes, scoresRes, chRes, orderRes] = await Promise.all([
        fetch(`/api/admin/qc/summary?${qs}`, { headers: getAuthHeaders() }),
        fetch(`/api/admin/qc/scores?${qs}&limit=1000`, { headers: getAuthHeaders() }),
        fetch(`/api/admin/qc/channels?approver_name=${approverName}&pin=${pin}`, { headers: getAuthHeaders() }),
        fetch(`/api/admin/qc/order-totals?${orderQs}`, { headers: getAuthHeaders() }),
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

      if (orderRes.ok) {
        const od = await orderRes.json();
        setOrderTotals(od.order_totals ?? {});
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset store filter whenever the city filter changes
  useEffect(() => { setScoreStoreFilter(""); setExpandedRow(null); }, [cityFilter]);

  // ── Individual scores filtered by active city ──
  const filteredScores = useMemo(
    () => cityFilter ? recentScores.filter((r) => r.city === cityFilter) : recentScores,
    [recentScores, cityFilter],
  );

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

  // ── Per-store aggregated (one entry per store, across all dates) ──
  const storeAggregated = useMemo(() => {
    const byStore: Record<string, { rows: ScoreSummaryRow[]; city: string; branch: string }> = {};
    for (const r of summary) {
      if (!byStore[r.store_code]) {
        byStore[r.store_code] = { rows: [], city: r.city, branch: r.branch_code };
      }
      byStore[r.store_code].rows.push(r);
    }
    return Object.entries(byStore).map(([store_code, { rows, city, branch }]) => {
      const totalPhotos = rows.reduce((a, r) => a + r.photo_count, 0);
      const wa = (key: keyof ScoreSummaryRow) =>
        rows.reduce((a, r) => a + (r[key] as number) * r.photo_count, 0) / totalPhotos;
      return {
        store_code,
        branch_code: branch,
        city,
        photo_count: totalPhotos,
        score_date: "",
        avg_total: parseFloat(wa("avg_total").toFixed(1)),
        avg_shape: parseFloat(wa("avg_shape").toFixed(1)),
        avg_size_consistency: parseFloat(wa("avg_size_consistency").toFixed(1)),
        avg_completion: parseFloat(wa("avg_completion").toFixed(1)),
        avg_topping: parseFloat(wa("avg_topping").toFixed(1)),
        avg_cut_uniformity: parseFloat(wa("avg_cut_uniformity").toFixed(1)),
        avg_arrangement: parseFloat(wa("avg_arrangement").toFixed(1)),
        avg_portioning: parseFloat(wa("avg_portioning").toFixed(1)),
      } as ScoreSummaryRow;
    }).sort((a, b) => b.avg_total - a.avg_total);
  }, [summary]);

  // ── Attach upload rates to store aggregates ──
  const storeAggregatedWithRates = useMemo((): StoreWithRate[] => {
    return storeAggregated.map((s) => {
      const orderTotal = orderTotals[s.branch_code] ?? orderTotals[s.store_code];
      if (orderTotal == null || orderTotal === 0) return s as StoreWithRate;
      return {
        ...s,
        order_total: orderTotal,
        upload_rate: Math.min((s.photo_count / orderTotal) * 100, 999),
      } as StoreWithRate;
    });
  }, [storeAggregated, orderTotals]);

  // ── All known stores (channels + summary) for the Weekly History selector ──
  const allKnownStores = useMemo((): KnownStore[] => {
    const seen = new Set<string>();
    const result: KnownStore[] = [];
    for (const ch of channels) {
      const key = ch.branch_code || ch.store_code;
      if (!seen.has(key)) { seen.add(key); result.push({ key, city: ch.city }); }
    }
    for (const s of storeAggregated) {
      const key = s.branch_code || s.store_code;
      if (!seen.has(key)) { seen.add(key); result.push({ key, city: s.city }); }
    }
    return result.sort((a, b) => a.city.localeCompare(b.city) || a.key.localeCompare(b.key));
  }, [channels, storeAggregated]);

  // ── Overall upload rate KPI ──
  const overallUploadRate = useMemo(() => {
    const totalPhotos = storeAggregatedWithRates.reduce((a, s) => a + s.photo_count, 0);
    const totalOrders = storeAggregatedWithRates.reduce((a, s) => a + (s.order_total ?? 0), 0);
    if (!totalOrders) return null;
    return Math.min((totalPhotos / totalOrders) * 100, 999);
  }, [storeAggregatedWithRates]);

  // ── Grade distribution per store ──
  const gradeDistByStore = useMemo(() => {
    const scores = cityFilter ? recentScores.filter((r) => r.city === cityFilter) : recentScores;
    const result: Record<string, Record<string, number>> = {};
    for (const r of scores) {
      const key = r.branch_code || r.store_code;
      if (!result[key]) result[key] = {};
      result[key][r.grade] = (result[key][r.grade] || 0) + 1;
    }
    return result;
  }, [recentScores, cityFilter]);

  // ── Weekly C/D breakdown by store (Sunday-start) ──
  const weeklyGradeData = useMemo(() => {
    const scores = cityFilter ? recentScores.filter((r) => r.city === cityFilter) : recentScores;
    const storeCityMap: Record<string, string> = {};
    const weekMap: Record<string, Record<string, { total: number; cdCount: number }>> = {};
    for (const r of scores) {
      const store = r.branch_code || r.store_code;
      storeCityMap[store] = r.city;
      const wk = weekKey(r.score_date);
      if (!weekMap[wk]) weekMap[wk] = {};
      if (!weekMap[wk][store]) weekMap[wk][store] = { total: 0, cdCount: 0 };
      weekMap[wk][store].total++;
      if (r.grade === "C" || r.grade === "D" || r.grade === "F") {
        weekMap[wk][store].cdCount++;
      }
    }
    const dubaiStores = Object.entries(storeCityMap).filter(([, c]) => c === "dubai").map(([s]) => s).sort();
    const manilaStores = Object.entries(storeCityMap).filter(([, c]) => c === "manila").map(([s]) => s).sort();
    const weeks = Object.keys(weekMap).sort().reverse();
    return { dubaiStores, manilaStores, weeks, weekMap };
  }, [recentScores, cityFilter]);

  // ── Chart data split by city ──
  const dubaiChartData = (kpis?.storeAvgs ?? [])
    .filter((s) => s.city === "dubai")
    .map((s) => ({ name: s.branch || s.store_code, score: parseFloat(s.avg.toFixed(1)) }));
  const manilaChartData = (kpis?.storeAvgs ?? [])
    .filter((s) => s.city === "manila")
    .map((s) => ({ name: s.branch || s.store_code, score: parseFloat(s.avg.toFixed(1)) }));

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

      {/* Sub-tab nav */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setSubTab("overview")}
          className={subTab === "overview" ? TAB_ACTIVE : TAB_INACTIVE}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setSubTab("grade")}
          className={subTab === "grade" ? TAB_ACTIVE : TAB_INACTIVE}
        >
          Grade Distribution
        </button>
        <button
          type="button"
          onClick={() => setSubTab("history")}
          className={subTab === "history" ? TAB_ACTIVE : TAB_INACTIVE}
        >
          Weekly History
        </button>
      </div>

      {/* Weekly History Panel */}
      {subTab === "history" && (
        <WeeklyHistoryPanel
          approverName={approverName}
          pin={pin}
          allStores={allKnownStores}
        />
      )}

      {/* Channel Setup Panel */}
      {subTab === "overview" && showSetup && isHQOrAdmin && (
        <>
          <ChannelSetupPanel
            channels={channels}
            approverName={approverName}
            pin={pin}
            onSaved={load}
          />
          <ReferenceImagesPanel approverName={approverName} pin={pin} />
        </>
      )}

      {subTab === "overview" && (<div className="space-y-6">

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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
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
          {overallUploadRate !== null && (
            <div className={KPI_CARD}>
              <div className={KPI_LABEL}>Upload Rate</div>
              <div className={`${KPI_VALUE} ${uploadRateColor(overallUploadRate)}`}>
                {overallUploadRate.toFixed(1)}%
              </div>
            </div>
          )}
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

      {/* Bar charts — Dubai and Manila */}
      {(dubaiChartData.length > 0 || manilaChartData.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {(!cityFilter || cityFilter === "dubai") && dubaiChartData.length > 0 && (
            <div className={`${GLASS_CARD} p-4`}>
              <h3 className={`${SECTION_TITLE} mb-1`}>🇦🇪 Dubai — Avg Score</h3>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={dubaiChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "none", fontSize: 12 }}
                    formatter={(v: number) => [`${v}`, "Avg Score"]}
                  />
                  <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                    {dubaiChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.score >= 90 ? "#a78bfa" : entry.score >= 75 ? "#34d399" : entry.score >= 60 ? "#60a5fa" : entry.score >= 45 ? "#fbbf24" : "#f87171"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {(!cityFilter || cityFilter === "manila") && manilaChartData.length > 0 && (
            <div className={`${GLASS_CARD} p-4`}>
              <h3 className={`${SECTION_TITLE} mb-1`}>🇵🇭 Manila — Avg Score</h3>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={manilaChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "none", fontSize: 12 }}
                    formatter={(v: number) => [`${v}`, "Avg Score"]}
                  />
                  <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                    {manilaChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.score >= 90 ? "#a78bfa" : entry.score >= 75 ? "#34d399" : entry.score >= 60 ? "#60a5fa" : entry.score >= 45 ? "#fbbf24" : "#f87171"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── Grade Distribution by Store ── */}
      {Object.keys(gradeDistByStore).length > 0 && (
        <div className={GLASS_CARD + " p-4"}>
          <h3 className={`${SECTION_TITLE} mb-3`}>Grade Distribution by Store</h3>
          {(["dubai", "manila"] as const).map((city) => {
            if (cityFilter && cityFilter !== city) return null;
            const cityStores = storeAggregatedWithRates.filter(
              (s) => s.city === city && gradeDistByStore[s.branch_code || s.store_code],
            );
            if (cityStores.length === 0) return null;
            const activeGrades = GRADE_ORDER.filter((g) =>
              cityStores.some((s) => gradeDistByStore[s.branch_code || s.store_code]?.[g]),
            );
            return (
              <div key={city} className="mb-5 last:mb-0">
                <p className="mb-2 text-xs font-semibold text-slate-400">
                  {city === "dubai" ? "🇦🇪 Dubai" : "🇵🇭 Manila"}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        {["Store", "Avg Score", "Photos", ...activeGrades, "C/D Rate"].map((h) => (
                          <th key={h} className={TABLE_HEADER}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cityStores.map((s) => {
                        const key = s.branch_code || s.store_code;
                        const dist = gradeDistByStore[key] ?? {};
                        const total = Object.values(dist).reduce((a, v) => a + v, 0);
                        const cdCount = (dist["C"] ?? 0) + (dist["D"] ?? 0) + (dist["F"] ?? 0);
                        const cdRate = total > 0 ? (cdCount / total) * 100 : 0;
                        return (
                          <tr key={key} className={TABLE_ROW}>
                            <td className="py-2 px-2 font-semibold text-slate-200">{key}</td>
                            <td className={`py-2 px-2 font-bold ${scoreBg(s.avg_total)}`}>{s.avg_total}</td>
                            <td className="py-2 px-2 text-slate-400">{total}</td>
                            {activeGrades.map((g) => {
                              const cnt = dist[g] ?? 0;
                              const pct = total > 0 ? (cnt / total) * 100 : 0;
                              return (
                                <td key={g} className="py-2 px-2 text-center">
                                  {cnt > 0 ? (
                                    <span>
                                      <span
                                        className="inline-block rounded px-1 py-0.5 text-[10px] font-bold text-black"
                                        style={{ background: gradeColor(g) }}
                                      >
                                        {g}
                                      </span>
                                      <span className="ml-1 text-slate-300">{pct.toFixed(0)}%</span>
                                      <span className="ml-0.5 text-slate-500">({cnt})</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-600">—</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className={`py-2 px-2 font-bold ${gradeRateBg(cdRate)}`}>
                              {cdRate.toFixed(0)}%
                              <span className="ml-1 font-normal text-slate-500">({cdCount})</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Weekly C/D Rate by Store ── */}
      {weeklyGradeData.weeks.length > 0 && (
        <div className={GLASS_CARD + " p-4"}>
          <h3 className={`${SECTION_TITLE} mb-1`}>Weekly C/D Rate by Store</h3>
          <p className={`${SUBTEXT} mb-3`}>Sunday–Saturday weeks · C/D includes grades C, D, F</p>
          {(["dubai", "manila"] as const).map((city) => {
            const cityStores = city === "dubai" ? weeklyGradeData.dubaiStores : weeklyGradeData.manilaStores;
            if (cityFilter && cityFilter !== city) return null;
            if (cityStores.length === 0) return null;
            return (
              <div key={city} className="mb-4 last:mb-0">
                <p className="mb-2 text-xs font-semibold text-slate-400">
                  {city === "dubai" ? "🇦🇪 Dubai" : "🇵🇭 Manila"}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className={TABLE_HEADER}>Week (Sun–Sat)</th>
                        {cityStores.map((s) => (
                          <th key={s} className={TABLE_HEADER}>{s}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {weeklyGradeData.weeks.map((wk) => (
                        <tr key={wk} className={TABLE_ROW}>
                          <td className="py-2 px-2 font-mono text-slate-400 whitespace-nowrap">
                            {weekLabel(wk)}
                          </td>
                          {cityStores.map((store) => {
                            const cell = weeklyGradeData.weekMap[wk]?.[store];
                            if (!cell || cell.total === 0) {
                              return <td key={store} className="py-2 px-2 text-center text-slate-600">—</td>;
                            }
                            const rate = (cell.cdCount / cell.total) * 100;
                            return (
                              <td key={store} className="py-2 px-2 text-center">
                                <span className={`font-bold ${gradeRateBg(rate)}`}>
                                  {rate.toFixed(0)}%
                                </span>
                                <span className="ml-1 text-slate-500">({cell.cdCount}/{cell.total})</span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Per-store axis breakdown — aggregated, split by city */}
      {storeAggregatedWithRates.length > 0 ? (
        <div className="space-y-4">
          {(!cityFilter || cityFilter === "dubai") && storeAggregatedWithRates.filter((r) => r.city === "dubai").length > 0 && (
            <div>
              <h3 className={`${SECTION_TITLE} mb-3`}>🇦🇪 Dubai — Store Breakdown</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {storeAggregatedWithRates
                  .filter((r) => r.city === "dubai")
                  .map((row, i) => <StoreBar key={i} row={row} />)}
              </div>
            </div>
          )}
          {(!cityFilter || cityFilter === "manila") && storeAggregatedWithRates.filter((r) => r.city === "manila").length > 0 && (
            <div>
              <h3 className={`${SECTION_TITLE} mb-3`}>🇵🇭 Manila — Store Breakdown</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {storeAggregatedWithRates
                  .filter((r) => r.city === "manila")
                  .map((row, i) => <StoreBar key={i} row={row} />)}
              </div>
            </div>
          )}
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
      {filteredScores.length > 0 && (
        <div className={GLASS_CARD + " p-4"}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className={SECTION_TITLE}>Recent Individual Scores</h3>
            <select
              value={scoreStoreFilter}
              onChange={(e) => { setScoreStoreFilter(e.target.value); setExpandedRow(null); }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              <option value="">All Stores</option>
              {(cityFilter
                ? storeAggregated.filter((r) => r.city === cityFilter)
                : storeAggregated
              )
                .map((r) => r.branch_code || r.store_code)
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
                {filteredScores
                  .filter((r) => !scoreStoreFilter || (r.branch_code || r.store_code) === scoreStoreFilter)
                  .slice(0, 100)
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
                          {row.feedback && (
                            <p className="mb-3 text-xs text-slate-300 leading-relaxed">{row.feedback}</p>
                          )}
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
                              href={`/api/admin/qc/scores/${row.id}/photo?approver_name=${encodeURIComponent(approverName)}&pin=${encodeURIComponent(pin)}`}
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

      </div>)}

      {/* ── Grade Distribution sub-tab ── */}
      {subTab === "grade" && (
        <div className="space-y-5">
          {/* City filter row */}
          <div className={`${GLASS_CARD} flex flex-wrap gap-3 p-4`}>
            {(["", "dubai", "manila"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCityFilter(c)}
                className={cityFilter === c ? TAB_ACTIVE : TAB_INACTIVE}
              >
                {c === "" ? "All" : c === "dubai" ? "🇦🇪 Dubai" : "🇵🇭 Manila"}
              </button>
            ))}
          </div>

          {Object.keys(gradeDistByStore).length === 0 ? (
            <div className={`${GLASS_CARD} p-8 text-center`}>
              <p className={BODY_TEXT}>No score data for this period.</p>
            </div>
          ) : (
            (["dubai", "manila"] as const).map((city) => {
              if (cityFilter && cityFilter !== city) return null;
              const cityStores = storeAggregatedWithRates.filter(
                (s) => s.city === city && gradeDistByStore[s.branch_code || s.store_code],
              );
              if (cityStores.length === 0) return null;
              const activeGrades = GRADE_ORDER.filter((g) =>
                cityStores.some((s) => gradeDistByStore[s.branch_code || s.store_code]?.[g]),
              );
              return (
                <div key={city} className={GLASS_CARD + " p-4"}>
                  <h3 className={`${SECTION_TITLE} mb-3`}>
                    {city === "dubai" ? "🇦🇪 Dubai" : "🇵🇭 Manila"} — Grade Distribution
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          {["Store", "Avg Score", "Photos", ...activeGrades, "C/D Rate"].map((h) => (
                            <th key={h} className={TABLE_HEADER}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cityStores.map((s) => {
                          const key = s.branch_code || s.store_code;
                          const dist = gradeDistByStore[key] ?? {};
                          const total = Object.values(dist).reduce((a, v) => a + v, 0);
                          const cdCount = (dist["C"] ?? 0) + (dist["D"] ?? 0) + (dist["F"] ?? 0);
                          const cdRate = total > 0 ? (cdCount / total) * 100 : 0;
                          return (
                            <tr key={key} className={TABLE_ROW}>
                              <td className="py-2 px-2 font-semibold text-slate-200">{key}</td>
                              <td className={`py-2 px-2 font-bold ${scoreBg(s.avg_total)}`}>{s.avg_total}</td>
                              <td className="py-2 px-2 text-slate-400">{total}</td>
                              {activeGrades.map((g) => {
                                const cnt = dist[g] ?? 0;
                                const pct = total > 0 ? (cnt / total) * 100 : 0;
                                return (
                                  <td key={g} className="py-2 px-2 text-center">
                                    {cnt > 0 ? (
                                      <span>
                                        <span
                                          className="inline-block rounded px-1 py-0.5 text-[10px] font-bold text-black"
                                          style={{ background: gradeColor(g) }}
                                        >
                                          {g}
                                        </span>
                                        <span className="ml-1 text-slate-300">{pct.toFixed(0)}%</span>
                                        <span className="ml-0.5 text-slate-500">({cnt})</span>
                                      </span>
                                    ) : (
                                      <span className="text-slate-600">—</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className={`py-2 px-2 font-bold ${gradeRateBg(cdRate)}`}>
                                {cdRate.toFixed(0)}%
                                <span className="ml-1 font-normal text-slate-500">({cdCount})</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
