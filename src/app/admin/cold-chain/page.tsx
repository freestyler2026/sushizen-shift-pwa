"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Thermometer,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Truck,
  Clock,
} from "lucide-react";
import { getAuth, canAccessAdminNav, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  INPUT_CLASS,
  TAB_CONTAINER,
  TAB_ACTIVE,
  TAB_INACTIVE,
  T_PAGE_TITLE,
  T_CAPTION,
  T_BODY,
  BADGE_WARNING,
} from "@/lib/ui-tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

type CoolerBox = {
  id: string;
  dispatch_id: string;
  city: string;
  branch_code: string;
  box_number: number;
  item_type: string;
  dispatch_at: string;
  dispatch_temp: number | null;
  received_at: string | null;
  received_temp: number | null;
  received_by: string | null;
  stored_at: string | null;
  stored_temp: number | null;
  stored_by: string | null;
  storage_unit: string | null;
  time_held_minutes: number | null;
  status: string;
  dispatched_by: string;
  dispatch_date: string;
  alert_flags?: Array<{ field: string; value: number }>;
};

type Dispatch = {
  id: string;
  city: string;
  dispatch_date: string;
  dispatched_by: string;
  destination_branches: string[];
  box_count: number;
  stored_count: number;
  notes: string | null;
};

const BRANCH_LABELS: Record<string, string> = {
  PAR: "Paranaque", CUB: "Cubao", TAFT: "Taft",
  BB: "Business Bay", JLT: "JLT", ARJ: "Arjan", AM: "Al Mina", AB: "Al Barsha",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  if (!d) return "—";
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" }); }
  catch { return d; }
}

function TempBadge({ temp, itemType }: { temp: number | null; itemType: string }) {
  if (temp == null) return <span className="text-slate-500 text-sm font-mono">—</span>;
  const t = itemType.toUpperCase();
  const ok = t === "FROZEN" ? temp <= -18 : temp <= 5;
  return (
    <span className={`text-sm font-bold font-mono ${ok ? "text-emerald-400" : "text-red-400"}`}>
      {temp > 0 ? "+" : ""}{temp}°C {ok ? "✓" : "⚠"}
    </span>
  );
}

function HeldBadge({ minutes }: { minutes: number | null }) {
  if (minutes == null) return <span className="text-slate-500 text-xs">—</span>;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const text = h > 0 ? `${h}h ${m}m` : `${m}m`;
  const color = minutes > 60 ? "text-red-400" : minutes > 30 ? "text-amber-400" : "text-emerald-400";
  return <span className={`text-xs font-bold ${color}`}>{text}</span>;
}

// ─── Temperature Control Table (matches the paper format) ────────────────────

function TempControlCard({ box }: { box: CoolerBox }) {
  const hasAlert = (box.alert_flags ?? []).length > 0;

  return (
    <div className={`rounded-xl border overflow-hidden ${
      hasAlert ? "border-red-500/30" : "border-white/8"
    }`}>
      {/* Card header */}
      <div className={`flex items-center justify-between px-3 py-2 ${
        hasAlert ? "bg-red-500/10" : "bg-white/3"
      }`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-300">
            Box {box.box_number}
          </span>
          <span className={`text-[10px] rounded-full px-2 py-0.5 font-semibold ${
            box.item_type === "FROZEN"
              ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
              : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
          }`}>
            {box.item_type === "FROZEN" ? "🧊 Frozen" : "❄️ Chilled"}
          </span>
          {hasAlert && <AlertTriangle size={12} className="text-red-400" />}
        </div>
        {box.storage_unit && (
          <span className="text-[10px] text-slate-400">→ {box.storage_unit}</span>
        )}
      </div>

      {/* 3-row temperature table */}
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-amber-500/10">
            <th className="px-3 py-1.5 text-left text-amber-300/70 font-semibold w-[130px]">Step</th>
            <th className="px-3 py-1.5 text-center text-amber-300/70 font-semibold">Time</th>
            <th className="px-3 py-1.5 text-center text-amber-300/70 font-semibold">Temperature</th>
            <th className="px-3 py-1.5 text-center text-amber-300/70 font-semibold">By</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {/* Row 1: Dispatch */}
          <tr className="bg-amber-500/5">
            <td className="px-3 py-2 text-amber-300 font-medium">① Dispatch (CK)</td>
            <td className="px-3 py-2 text-center font-mono text-slate-300">{box.dispatch_at || "—"}</td>
            <td className="px-3 py-2 text-center">
              <TempBadge temp={box.dispatch_temp} itemType={box.item_type} />
            </td>
            <td className="px-3 py-2 text-center text-slate-400">{box.dispatched_by}</td>
          </tr>
          {/* Row 2: Received */}
          <tr className="bg-sky-500/5">
            <td className="px-3 py-2 text-sky-300 font-medium">② Received (Branch)</td>
            <td className="px-3 py-2 text-center font-mono text-slate-300">{box.received_at || "—"}</td>
            <td className="px-3 py-2 text-center">
              <TempBadge temp={box.received_temp} itemType={box.item_type} />
            </td>
            <td className="px-3 py-2 text-center text-slate-400">{box.received_by || "—"}</td>
          </tr>
          {/* Row 3: Stored */}
          <tr className="bg-emerald-500/5">
            <td className="px-3 py-2 text-emerald-300 font-medium">③ In Chiller/Freezer</td>
            <td className="px-3 py-2 text-center font-mono text-slate-300">{box.stored_at || "—"}</td>
            <td className="px-3 py-2 text-center">
              <TempBadge temp={box.stored_temp} itemType={box.item_type} />
            </td>
            <td className="px-3 py-2 text-center text-slate-400">{box.stored_by || "—"}</td>
          </tr>
        </tbody>
      </table>

      {/* Time held footer */}
      {box.time_held_minutes != null && (
        <div className="px-3 py-1.5 flex items-center gap-2 bg-white/2 border-t border-white/5">
          <Clock size={11} className="text-slate-500" />
          <span className={T_CAPTION}>Time in cooler before storage:</span>
          <HeldBadge minutes={box.time_held_minutes} />
        </div>
      )}
    </div>
  );
}

// ─── Dispatch Log ─────────────────────────────────────────────────────────────

function DispatchLog({ city, date }: { city: string; date: string }) {
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [boxesByDispatch, setBoxesByDispatch] = useState<Record<string, CoolerBox[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/cold-chain/dispatches?city=${city}&dispatch_date=${date}`, {
      headers: getAuthHeaders(), cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setDispatches(d.dispatches ?? []))
      .finally(() => setLoading(false));
  }, [city, date]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = async (dispatchId: string) => {
    if (expanded === dispatchId) { setExpanded(null); return; }
    setExpanded(dispatchId);
    // Always refetch — branch staff may have submitted receiving data since last expand
    const res = await fetch(`/api/admin/cold-chain/dispatches/${dispatchId}`, {
      headers: getAuthHeaders(), cache: "no-store",
    });
    const d = await res.json();
    setBoxesByDispatch((p) => ({ ...p, [dispatchId]: d.dispatch?.boxes ?? [] }));
  };

  if (loading) return <div className="flex justify-center py-10"><RefreshCw size={20} className="animate-spin text-slate-400" /></div>;
  if (!dispatches.length) return <div className={`${GLASS_CARD} p-10 text-center`}><p className={T_BODY}>No dispatches for {fmtDate(date)}.</p></div>;

  return (
    <div className="space-y-3">
      {dispatches.map((d) => (
        <div key={d.id} className={GLASS_CARD + " overflow-hidden"}>
          <button type="button" className="w-full p-4 text-left" onClick={() => toggleExpand(d.id)}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Truck size={14} className="text-violet-400" />
                  <span className={`${T_BODY} font-semibold`}>by {d.dispatched_by}</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {(d.destination_branches ?? []).map((b) => (
                    <span key={b} className="text-xs bg-white/10 text-slate-300 rounded-full px-2 py-0.5">
                      {BRANCH_LABELS[b] ?? b}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className={T_CAPTION}>{d.stored_count ?? 0}/{d.box_count ?? 0} boxes stored</p>
                <p className="text-xs text-violet-400 mt-1">
                  {expanded === d.id ? "▲ collapse" : "▼ show boxes"}
                </p>
              </div>
            </div>
          </button>

          {expanded === d.id && (
            <div className="border-t border-white/5 p-4">
              {(boxesByDispatch[d.id] ?? []).length === 0 ? (
                <p className={`${T_CAPTION} text-slate-500`}>No boxes recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(
                    (boxesByDispatch[d.id] ?? []).reduce((acc, b) => {
                      const key = b.branch_code;
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(b);
                      return acc;
                    }, {} as Record<string, CoolerBox[]>)
                  ).map(([branch, bboxes]) => (
                    <div key={branch}>
                      <p className="text-xs font-semibold text-slate-400 mb-2">
                        📍 {BRANCH_LABELS[branch] ?? branch}
                      </p>
                      <div className="space-y-2">
                        {bboxes.map((box) => <TempControlCard key={box.id} box={box} />)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

function AlertsView({ city, date }: { city: string; date: string }) {
  const [alerts, setAlerts] = useState<CoolerBox[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/cold-chain/alerts?city=${city}&dispatch_date=${date}`, {
      headers: getAuthHeaders(), cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setAlerts(d.alerts ?? []))
      .finally(() => setLoading(false));
  }, [city, date]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-10"><RefreshCw size={20} className="animate-spin text-slate-400" /></div>;
  if (!alerts.length) return (
    <div className={`${GLASS_CARD} p-10 text-center`}>
      <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-3" />
      <p className={T_BODY}>No temperature violations for {fmtDate(date)}.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {alerts.map((box) => (
        <div key={box.id}>
          <p className="text-xs text-slate-500 mb-1">
            {BRANCH_LABELS[box.branch_code] ?? box.branch_code} — by {box.dispatched_by}
          </p>
          <TempControlCard box={box} />
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminColdChainPage() {
  const router = useRouter();
  const auth = getAuth();
  const role = (auth?.role || "").toUpperCase();

  useEffect(() => {
    if (!canAccessAdminNav(auth) && role !== "HQ" && role !== "ADMIN") {
      router.replace("/week");
    }
  }, [auth, role, router]);

  const todayPH = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

  const [city, setCity] = useState<"manila" | "dubai">("manila");
  const [date, setDate] = useState(todayPH);
  const [tab, setTab] = useState<"dispatches" | "alerts">("dispatches");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pb-20">
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Thermometer size={22} className="text-violet-400" />
              <h1 className={T_PAGE_TITLE}>Cold Chain Monitoring</h1>
            </div>
            <p className={`${T_CAPTION} text-slate-400`}>Temperature Control — Dispatch → Received → In Storage</p>
          </div>
        </div>

        <div className={`${GLASS_CARD} p-4 mb-5 flex flex-wrap items-end gap-4`}>
          <div className="flex gap-2">
            {(["manila", "dubai"] as const).map((c) => (
              <button key={c} type="button" onClick={() => setCity(c)}
                className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                  city === c ? "border-violet-500/40 bg-violet-500/20 text-violet-300"
                             : "border-white/10 bg-white/5 text-slate-400"
                }`}>{c === "manila" ? "🇵🇭 Manila" : "🇦🇪 Dubai"}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Calendar size={14} className="text-slate-400" />
            <input type="date" className={INPUT_CLASS} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className={`${TAB_CONTAINER} mb-5`}>
          <button className={tab === "dispatches" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("dispatches")}>
            <Truck size={14} /> Dispatch Log
          </button>
          <button className={tab === "alerts" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("alerts")}>
            <AlertTriangle size={14} /> Temperature Alerts
          </button>
        </div>

        {tab === "dispatches" && <DispatchLog city={city} date={date} />}
        {tab === "alerts"    && <AlertsView  city={city} date={date} />}
      </div>
    </div>
  );
}
