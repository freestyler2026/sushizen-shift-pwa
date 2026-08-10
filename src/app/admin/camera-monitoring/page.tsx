"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Camera,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Cpu,
  Eye,
  Filter,
  Flame,
  MonitorOff,
  RefreshCw,
  Shield,
  Thermometer,
  Users,
  Video,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
  GLASS_CARD,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  PRIMARY_BUTTON,
  SMALL_BUTTON,
  T_BODY,
  T_CARD_TITLE,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW,
} from "@/lib/ui-tokens";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";

const ADMIN_ROLES = new Set(["ADMIN", "HQ", "DUBAI_MANAGEMENT", "MANILA_MANAGEMENT"]);

const ALERT_LABELS: Record<string, { label: string; color: string; icon: typeof AlertTriangle }> = {
  mobile:           { label: "Mobile Use",        color: "text-red-400",    icon: AlertTriangle },
  head_pose:        { label: "Head Pose",          color: "text-orange-400", icon: Eye },
  activity:         { label: "Idle Activity",      color: "text-amber-400",  icon: Activity },
  idle:             { label: "Idle",               color: "text-amber-400",  icon: Activity },
  restricted_zone:  { label: "Restricted Zone",    color: "text-red-500",    icon: Shield },
  group_chat:       { label: "Group Chat",         color: "text-violet-400", icon: Users },
  ppe:              { label: "PPE Missing",         color: "text-orange-500", icon: Shield },
  dangerous_action: { label: "Dangerous Action",   color: "text-red-600",    icon: Flame },
};

type CameraStatus = {
  id: number;
  camera_id: string;
  branch_code: string;
  city: string;
  display_name: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  fps_actual: number | null;
  zone_name: string | null;
};

type HardwareMetrics = {
  gpu_utilization_pct: number | null;
  gpu_memory_used_mb: number | null;
  gpu_memory_total_mb: number | null;
  gpu_temp_c: number | null;
  cpu_utilization_pct: number | null;
  ram_used_mb: number | null;
  ram_total_mb: number | null;
  cameras_active: number | null;
  fps_total: number | null;
  uptime_seconds: number | null;
  recorded_at: string | null;
};

type Alert = {
  id: number;
  camera_id: string;
  branch_code: string;
  city: string;
  alert_type: string;
  score: number;
  confidence: number;
  frame_url: string | null;
  triggered_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
};

type AlertSummary = {
  by_type: { alert_type: string; total: number; unacknowledged: number }[];
  total: number;
  unacknowledged: number;
};

function formatUptime(seconds: number | null): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatTs(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatPct(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

function GpuBar({ value, max = 100, color = "bg-violet-500" }: { value: number | null; max?: number; color?: string }) {
  const pct = value != null ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function AlertTypeBadge({ type }: { type: string }) {
  const def = ALERT_LABELS[type] ?? { label: type, color: "text-zinc-400", icon: AlertTriangle };
  const Icon = def.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-xs font-medium ${def.color}`}>
      <Icon className="h-3 w-3" />
      {def.label}
    </span>
  );
}

export default function CameraMonitoringPage() {
  const router = useRouter();
  const apiBase = "";

  const [cameras, setCameras] = useState<CameraStatus[]>([]);
  const [hardware, setHardware] = useState<HardwareMetrics | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"feed" | "cameras" | "hardware">("feed");

  // Filters
  const [filterCity, setFilterCity] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterUnack, setFilterUnack] = useState(false);

  // Acknowledge
  const [ackBusy, setAckBusy] = useState<number | null>(null);

  const auth = getAuth();

  const tokenHeaders = useCallback(async () => {
    const freshAuth = getAuth();
    const refreshed = await refreshAuthFromApi(freshAuth);
    const token = refreshed?.accessToken || freshAuth?.accessToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const headers = await tokenHeaders();
      const qs = filterCity ? `?city=${encodeURIComponent(filterCity)}` : "";
      const r = await fetch(`${apiBase}/api/ai/camera/status${qs}`, { headers });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setCameras(d.cameras ?? []);
      setHardware(d.hardware ?? null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [apiBase, tokenHeaders, filterCity]);

  const fetchAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    try {
      const headers = await tokenHeaders();
      const params = new URLSearchParams();
      if (filterCity) params.set("city", filterCity);
      if (filterType) params.set("alert_type", filterType);
      if (filterUnack) params.set("unacknowledged_only", "true");
      params.set("limit", "100");
      const r = await fetch(`${apiBase}/api/ai/camera/alerts?${params}`, { headers });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setAlerts(d.alerts ?? []);
      setSummary(d.summary ?? null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingAlerts(false);
    }
  }, [apiBase, tokenHeaders, filterCity, filterType, filterUnack]);

  const acknowledge = useCallback(async (alertId: number) => {
    setAckBusy(alertId);
    try {
      const headers = await tokenHeaders();
      await fetch(`${apiBase}/api/ai/camera/alerts/${alertId}/acknowledge`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ staff_name: auth?.staffName ?? "" }),
      });
      await fetchAlerts();
    } finally {
      setAckBusy(null);
    }
  }, [apiBase, tokenHeaders, auth, fetchAlerts]);

  const refresh = useCallback(async () => {
    await Promise.all([fetchStatus(), fetchAlerts()]);
  }, [fetchStatus, fetchAlerts]);

  useEffect(() => {
    const a = getAuth();
    if (!a?.hasSession && !a?.accessToken) { router.replace("/login"); return; }
    if (!ADMIN_ROLES.has(a.role || "")) { router.replace("/"); return; }
    setLoading(true);
    Promise.all([fetchStatus(), fetchAlerts()]).finally(() => setLoading(false));
  }, [router, fetchStatus, fetchAlerts]);

  // Auto-refresh every 30s
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    timerRef.current = setInterval(refresh, 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refresh]);

  const onlineCount = cameras.filter((c) => c.is_online).length;
  const totalCount = cameras.length;
  const unackCount = summary?.unacknowledged ?? 0;

  const gpuPct = hardware?.gpu_utilization_pct ?? null;
  const gpuTempC = hardware?.gpu_temp_c ?? null;
  const gpuMemPct =
    hardware?.gpu_memory_used_mb && hardware?.gpu_memory_total_mb
      ? (hardware.gpu_memory_used_mb / hardware.gpu_memory_total_mb) * 100
      : null;
  const ramPct =
    hardware?.ram_used_mb && hardware?.ram_total_mb
      ? (hardware.ram_used_mb / hardware.ram_total_mb) * 100
      : null;

  return (
    <div className="min-h-screen bg-[#0a0a0f] px-4 py-8 md:px-8">
      {/* Header */}
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className={T_PAGE_TITLE}>Camera Monitoring</h1>
            <p className={`${T_BODY} mt-1`}>AI edge detection — Jetson Orin Nano Super</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
              className="cursor-pointer appearance-none rounded-xl border border-white/10 bg-white/6 px-4 py-2 text-sm text-white outline-none focus:border-violet-500/50"
            >
              <option value="">All Cities</option>
              <option value="Dubai">Dubai</option>
              <option value="Manila">Manila</option>
            </select>
            <button
              onClick={refresh}
              className={`${SMALL_BUTTON} flex items-center gap-1.5`}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* KPI Row */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>Cameras Online</p>
            <p className={`${KPI_VALUE} ${onlineCount === totalCount && totalCount > 0 ? "text-emerald-400" : "text-amber-400"}`}>
              {loading ? "—" : `${onlineCount}/${totalCount}`}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {totalCount > 0 ? `${Math.round((onlineCount / totalCount) * 100)}% uptime` : "No cameras registered"}
            </p>
          </div>
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>Unacknowledged</p>
            <p className={`${KPI_VALUE} ${unackCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
              {loading ? "—" : unackCount}
            </p>
            <p className="mt-1 text-xs text-zinc-500">alerts need review</p>
          </div>
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>GPU Temp</p>
            <p className={`${KPI_VALUE} ${gpuTempC != null && gpuTempC > 75 ? "text-red-400" : gpuTempC != null && gpuTempC > 65 ? "text-amber-400" : "text-emerald-400"}`}>
              {gpuTempC != null ? `${gpuTempC.toFixed(0)}°C` : "—"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">Jetson GPU</p>
          </div>
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>FPS Total</p>
            <p className={KPI_VALUE}>
              {hardware?.fps_total != null ? `${hardware.fps_total.toFixed(0)}` : "—"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {hardware?.cameras_active != null ? `${hardware.cameras_active} streams active` : "no data"}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-2xl border border-white/8 bg-white/5 p-1 w-fit">
          {(["feed", "cameras", "hardware"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={tab === t
                ? "rounded-xl border border-violet-500/30 bg-violet-500/20 px-4 py-2 text-sm font-semibold text-violet-300"
                : "rounded-xl px-4 py-2 text-sm font-medium text-zinc-400 transition-all hover:bg-violet-500/8 hover:text-violet-200"}
            >
              {t === "feed" ? "Alert Feed" : t === "cameras" ? "Cameras" : "Hardware"}
            </button>
          ))}
        </div>

        {/* ── ALERT FEED TAB ── */}
        {tab === "feed" && (
          <div className="space-y-4">
            {/* Alert type summary */}
            {summary && summary.by_type.length > 0 && (
              <div className={`${GLASS_CARD} p-4`}>
                <p className={`${T_LABEL} mb-3`}>Last 24h by Type</p>
                <div className="flex flex-wrap gap-2">
                  {summary.by_type.map((b) => (
                    <button
                      key={b.alert_type}
                      onClick={() => setFilterType(filterType === b.alert_type ? "" : b.alert_type)}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                        filterType === b.alert_type
                          ? "border-violet-500/50 bg-violet-500/20 text-violet-300"
                          : "border-white/10 bg-white/5 text-zinc-300 hover:border-violet-400/30"
                      }`}
                    >
                      {ALERT_LABELS[b.alert_type]?.label ?? b.alert_type}
                      <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-400">
                        {b.total}
                      </span>
                      {b.unacknowledged > 0 && (
                        <span className="rounded-full bg-red-500/30 px-1.5 py-0.5 text-[10px] text-red-400">
                          {b.unacknowledged} new
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterUnack}
                  onChange={(e) => setFilterUnack(e.target.checked)}
                  className="accent-violet-500"
                />
                <span className="text-sm text-zinc-300">Unacknowledged only</span>
              </label>
              {(filterType || filterUnack) && (
                <button
                  onClick={() => { setFilterType(""); setFilterUnack(false); }}
                  className={`${SMALL_BUTTON} text-xs`}
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Alert list */}
            {loadingAlerts ? (
              <div className="py-12 text-center text-zinc-500">Loading alerts…</div>
            ) : alerts.length === 0 ? (
              <div className={`${GLASS_CARD} p-12 text-center`}>
                <CheckCircle className="mx-auto mb-3 h-10 w-10 text-emerald-500/50" />
                <p className="text-zinc-400">No alerts found</p>
                <p className="mt-1 text-xs text-zinc-600">
                  {totalCount === 0
                    ? "Register cameras by sending a heartbeat from Jetson"
                    : "Everything looks good"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((a) => (
                  <div
                    key={a.id}
                    className={`${GLASS_CARD} flex flex-wrap items-center gap-3 p-4 ${
                      !a.acknowledged_at ? "border-red-500/20" : "opacity-60"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <AlertTypeBadge type={a.alert_type} />
                        <span className="text-xs text-zinc-500">
                          {a.camera_id} · {a.branch_code}
                          {a.city ? ` · ${a.city}` : ""}
                        </span>
                        {!a.acknowledged_at && (
                          <span className={BADGE_ERROR}>New</span>
                        )}
                      </div>
                      <div className="flex gap-4 text-xs text-zinc-500">
                        <span>Score: {a.score.toFixed(2)}</span>
                        <span>Conf: {(a.confidence * 100).toFixed(0)}%</span>
                        <span>{formatTs(a.triggered_at)}</span>
                        {a.acknowledged_by && (
                          <span className="text-emerald-600">✓ {a.acknowledged_by}</span>
                        )}
                      </div>
                    </div>
                    {!a.acknowledged_at && (
                      <button
                        onClick={() => acknowledge(a.id)}
                        disabled={ackBusy === a.id}
                        className={`${SMALL_BUTTON} text-xs`}
                      >
                        {ackBusy === a.id ? "…" : "Acknowledge"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CAMERAS TAB ── */}
        {tab === "cameras" && (
          <div>
            {cameras.length === 0 ? (
              <div className={`${GLASS_CARD} p-12 text-center`}>
                <Camera className="mx-auto mb-3 h-10 w-10 text-zinc-600" />
                <p className="text-zinc-400">No cameras registered</p>
                <p className={`${T_BODY} mt-2 text-xs`}>
                  Jetson will register cameras automatically on first heartbeat.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {cameras.map((c) => (
                  <div key={c.camera_id} className={`${GLASS_CARD} p-4`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className={`${T_CARD_TITLE} text-sm`}>
                          {c.display_name ?? c.camera_id}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {c.branch_code}{c.city ? ` · ${c.city}` : ""}
                        </p>
                        {c.zone_name && (
                          <p className="text-xs text-zinc-600">{c.zone_name}</p>
                        )}
                      </div>
                      <div>
                        {c.is_online ? (
                          <span className={BADGE_SUCCESS}>
                            <Wifi className="h-3 w-3" />Online
                          </span>
                        ) : (
                          <span className={BADGE_ERROR}>
                            <WifiOff className="h-3 w-3" />Offline
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1 text-xs text-zinc-500">
                      {c.fps_actual != null && (
                        <div className="flex justify-between">
                          <span>FPS</span>
                          <span className="text-zinc-300">{c.fps_actual.toFixed(1)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Last seen</span>
                        <span className="text-zinc-400">{formatTs(c.last_seen_at)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── HARDWARE TAB ── */}
        {tab === "hardware" && (
          <div className="space-y-4">
            {hardware ? (
              <>
                <div className={`${GLASS_CARD} p-6`}>
                  <p className={`${T_SECTION} mb-4`}>Jetson Orin Nano Super</p>
                  <div className="grid gap-6 sm:grid-cols-2">
                    {/* GPU */}
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className={T_LABEL}>GPU Utilization</span>
                        <span className="text-sm font-semibold text-white">{formatPct(hardware.gpu_utilization_pct)}</span>
                      </div>
                      <GpuBar
                        value={hardware.gpu_utilization_pct}
                        color={hardware.gpu_utilization_pct != null && hardware.gpu_utilization_pct > 80 ? "bg-red-500" : "bg-violet-500"}
                      />
                    </div>

                    {/* GPU Memory */}
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className={T_LABEL}>GPU Memory</span>
                        <span className="text-sm font-semibold text-white">
                          {hardware.gpu_memory_used_mb != null && hardware.gpu_memory_total_mb != null
                            ? `${hardware.gpu_memory_used_mb}/${hardware.gpu_memory_total_mb} MB`
                            : "—"}
                        </span>
                      </div>
                      <GpuBar value={gpuMemPct} color="bg-purple-500" />
                    </div>

                    {/* GPU Temp */}
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className={T_LABEL}>GPU Temperature</span>
                        <span className={`text-sm font-semibold ${
                          gpuTempC != null && gpuTempC > 75 ? "text-red-400" :
                          gpuTempC != null && gpuTempC > 65 ? "text-amber-400" : "text-emerald-400"
                        }`}>
                          {gpuTempC != null ? `${gpuTempC.toFixed(0)}°C` : "—"}
                        </span>
                      </div>
                      <GpuBar
                        value={gpuTempC}
                        max={100}
                        color={
                          gpuTempC != null && gpuTempC > 75 ? "bg-red-500" :
                          gpuTempC != null && gpuTempC > 65 ? "bg-amber-500" : "bg-emerald-500"
                        }
                      />
                    </div>

                    {/* CPU */}
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className={T_LABEL}>CPU Utilization</span>
                        <span className="text-sm font-semibold text-white">{formatPct(hardware.cpu_utilization_pct)}</span>
                      </div>
                      <GpuBar value={hardware.cpu_utilization_pct} color="bg-sky-500" />
                    </div>

                    {/* RAM */}
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className={T_LABEL}>RAM</span>
                        <span className="text-sm font-semibold text-white">
                          {hardware.ram_used_mb != null && hardware.ram_total_mb != null
                            ? `${hardware.ram_used_mb}/${hardware.ram_total_mb} MB`
                            : "—"}
                        </span>
                      </div>
                      <GpuBar value={ramPct} color="bg-teal-500" />
                    </div>

                    {/* Uptime */}
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className={T_LABEL}>Uptime</span>
                        <span className="text-sm font-semibold text-white">{formatUptime(hardware.uptime_seconds)}</span>
                      </div>
                      <p className="text-xs text-zinc-500">
                        Last report: {formatTs(hardware.recorded_at)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Stream info */}
                <div className={`${GLASS_CARD} p-4`}>
                  <div className="flex flex-wrap gap-6">
                    <div>
                      <p className={KPI_LABEL}>Active Streams</p>
                      <p className="mt-1 text-xl font-bold text-white">{hardware.cameras_active ?? "—"}</p>
                    </div>
                    <div>
                      <p className={KPI_LABEL}>Total FPS</p>
                      <p className="mt-1 text-xl font-bold text-white">
                        {hardware.fps_total != null ? hardware.fps_total.toFixed(0) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className={KPI_LABEL}>Target</p>
                      <p className="mt-1 text-xl font-bold text-zinc-400">
                        {hardware.cameras_active != null ? `${hardware.cameras_active * 5}` : "—"}
                      </p>
                      <p className="text-xs text-zinc-600">5fps × cameras</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className={`${GLASS_CARD} p-12 text-center`}>
                <Cpu className="mx-auto mb-3 h-10 w-10 text-zinc-600" />
                <p className="text-zinc-400">No hardware metrics yet</p>
                <p className={`${T_BODY} mt-2 text-xs`}>
                  Jetson sends metrics every 30s via POST /api/ai/camera/hardware-metrics
                </p>
              </div>
            )}
          </div>
        )}

        {/* Setup Guide (shown when no cameras registered) */}
        {!loading && totalCount === 0 && tab === "feed" && (
          <div className={`${GLASS_CARD} mt-6 p-6`}>
            <p className={`${T_SECTION} mb-4`}>Jetson Setup Guide</p>
            <div className="space-y-3 text-sm text-zinc-400">
              <p>No cameras registered yet. Follow the steps below on the Jetson:</p>
              <ol className="list-decimal list-inside space-y-2">
                <li>Check JetPack version: <code className="rounded bg-white/5 px-1 py-0.5 text-xs text-violet-300">cat /etc/nv_tegra_release</code></li>
                <li>Install DeepStream (JetPack 6.x): <code className="rounded bg-white/5 px-1 py-0.5 text-xs text-violet-300">sudo apt install deepstream-7.0</code></li>
                <li>Run the alert_engine.py — it will auto-register cameras via the status heartbeat endpoint</li>
              </ol>
              <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 font-mono text-xs">
                <p className="text-zinc-500 mb-2"># Test registration manually:</p>
                <p className="text-violet-300">curl -X POST {apiBase}/api/ai/camera/status \</p>
                <p className="text-violet-300 pl-4">{`-H 'Content-Type: application/json' \\`}</p>
                <p className="text-violet-300 pl-4">{`-d '{"camera_id":"CAM-001","branch_code":"DUBAI-BB","city":"Dubai","is_online":true}'`}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
