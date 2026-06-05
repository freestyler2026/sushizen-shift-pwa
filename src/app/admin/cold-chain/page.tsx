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
  BADGE_SUCCESS,
  BADGE_WARNING,
} from "@/lib/ui-tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

type Dispatch = {
  id: string;
  city: string;
  dispatch_date: string;
  dispatch_at: string;
  has_frozen: boolean;
  has_chilled: boolean;
  frozen_cooler_temp: number | null;
  chilled_cooler_temp: number | null;
  dispatched_by: string;
  destination_branches: string[];
  delivery_count: number;
  stored_count: number;
  notes: string | null;
};

type Delivery = {
  id: string;
  dispatch_id: string;
  branch_code: string;
  dispatch_at: string;
  dispatch_date: string;
  dispatch_frozen_temp: number | null;
  dispatch_chilled_temp: number | null;
  has_frozen: boolean;
  has_chilled: boolean;
  dispatched_by: string;
  received_at: string | null;
  received_by: string | null;
  frozen_cooler_temp: number | null;
  chilled_cooler_temp: number | null;
  transfer_temps_json: Array<{ unit: string; type: string; temp: number; at: string }>;
  status: string;
  notes: string | null;
  alert_flags?: Array<{ field: string; value: number }>;
};

const BRANCH_LABELS: Record<string, string> = {
  PAR: "Paranaque", CUB: "Cubao", TAFT: "Taft",
  BB: "Business Bay", JLT: "JLT", ARJ: "Arjan", AM: "Al Mina", AB: "Al Barsha",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  if (!d) return "—";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  } catch { return d; }
}

function TempBadge({ temp, type }: { temp: number | null; type: "FROZEN" | "CHILLED" }) {
  if (temp == null) return <span className="text-slate-500 text-sm">—</span>;
  const ok = type === "FROZEN" ? temp <= -18 : temp <= 5;
  return (
    <span className={`text-sm font-bold ${ok ? "text-emerald-400" : "text-red-400"}`}>
      {temp}°C {ok ? "✓" : "⚠"}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "STORED")   return <span className={BADGE_SUCCESS}>Stored</span>;
  if (status === "RECEIVED") return <span className={BADGE_WARNING}>Received</span>;
  return <span className="text-xs bg-white/10 text-slate-400 rounded-full px-2 py-0.5">Pending</span>;
}

// ─── Dispatch Log ─────────────────────────────────────────────────────────────

function DispatchLog({ city, date }: { city: string; date: string }) {
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ deliveries: Delivery[] } | null>(null);

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

  const toggleDetail = async (id: string) => {
    if (expanded === id) { setExpanded(null); setDetail(null); return; }
    setExpanded(id);
    const res = await fetch(`/api/admin/cold-chain/dispatches/${id}`, {
      headers: getAuthHeaders(), cache: "no-store",
    });
    const data = await res.json();
    setDetail(data.dispatch ?? null);
  };

  if (loading) return <div className="flex justify-center py-10"><RefreshCw size={20} className="animate-spin text-slate-400" /></div>;
  if (!dispatches.length) return <div className={`${GLASS_CARD} p-10 text-center`}><p className={T_BODY}>No dispatches for {fmtDate(date)}.</p></div>;

  return (
    <div className="space-y-3">
      {dispatches.map((d) => (
        <div key={d.id} className={GLASS_CARD + " overflow-hidden"}>
          <button type="button" className="w-full p-4 text-left" onClick={() => toggleDetail(d.id)}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Truck size={14} className="text-violet-400" />
                  <span className={`${T_BODY} font-semibold`}>{d.dispatch_at} dispatch</span>
                  <span className={T_CAPTION}>by {d.dispatched_by}</span>
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
                <p className={T_CAPTION}>{d.stored_count}/{d.delivery_count} stored</p>
                <div className="flex gap-2 mt-1 justify-end">
                  {d.has_frozen  && <TempBadge temp={d.frozen_cooler_temp}  type="FROZEN" />}
                  {d.has_chilled && <TempBadge temp={d.chilled_cooler_temp} type="CHILLED" />}
                </div>
              </div>
            </div>
          </button>

          {/* Expanded delivery detail */}
          {expanded === d.id && detail && (
            <div className="border-t border-white/5 p-4 space-y-3">
              {detail.deliveries.map((dl) => (
                <div key={dl.id} className="rounded-xl border border-white/8 bg-white/3 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`${T_BODY} font-semibold`}>{BRANCH_LABELS[dl.branch_code] ?? dl.branch_code}</span>
                    <StatusBadge status={dl.status} />
                  </div>
                  {dl.status !== "PENDING" && (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className={T_CAPTION}>Received at</p>
                        <p className="text-white">{dl.received_at ?? "—"}</p>
                      </div>
                      <div>
                        <p className={T_CAPTION}>By</p>
                        <p className="text-white">{dl.received_by ?? "—"}</p>
                      </div>
                      {dl.has_frozen  && <div><p className={T_CAPTION}>Frozen at receiving</p><TempBadge temp={dl.frozen_cooler_temp}  type="FROZEN"  /></div>}
                      {dl.has_chilled && <div><p className={T_CAPTION}>Chilled at receiving</p><TempBadge temp={dl.chilled_cooler_temp} type="CHILLED" /></div>}
                    </div>
                  )}
                  {(dl.transfer_temps_json ?? []).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-white/5">
                      <p className={`${T_CAPTION} mb-1`}>Storage transfer</p>
                      <div className="flex flex-wrap gap-2">
                        {dl.transfer_temps_json.map((t) => {
                          const ok = t.type === "FREEZER" ? t.temp <= -18 : t.temp <= 5;
                          return (
                            <span key={t.unit} className={`text-xs rounded-lg px-2 py-1 border ${ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
                              {t.unit}: {t.temp}°C {ok ? "✓" : "⚠"}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

function AlertsView({ city, date }: { city: string; date: string }) {
  const [alerts, setAlerts] = useState<Delivery[]>([]);
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
      {alerts.map((a) => (
        <div key={a.id} className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-red-400" />
            <span className={`${T_BODY} font-semibold text-red-300`}>
              {BRANCH_LABELS[a.branch_code] ?? a.branch_code} — {a.dispatch_at} dispatch
            </span>
          </div>
          <div className="space-y-1">
            {(a.alert_flags ?? []).map((f, i) => (
              <p key={i} className={`${T_CAPTION} text-red-300`}>
                ⚠ {f.field.replace(/_/g, " ")}: {f.value}°C
              </p>
            ))}
          </div>
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
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Thermometer size={22} className="text-violet-400" />
              <h1 className={T_PAGE_TITLE}>Cold Chain Monitoring</h1>
            </div>
            <p className={`${T_CAPTION} text-slate-400`}>CK dispatch temperature records</p>
          </div>
        </div>

        {/* Controls */}
        <div className={`${GLASS_CARD} p-4 mb-5 flex flex-wrap items-end gap-4`}>
          <div className="flex gap-2">
            {(["manila", "dubai"] as const).map((c) => (
              <button key={c} type="button" onClick={() => setCity(c)}
                className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                  city === c ? "border-violet-500/40 bg-violet-500/20 text-violet-300"
                             : "border-white/10 bg-white/5 text-slate-400"
                }`}
              >{c === "manila" ? "🇵🇭 Manila" : "🇦🇪 Dubai"}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Calendar size={14} className="text-slate-400" />
            <input type="date" className={INPUT_CLASS} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {/* Tabs */}
        <div className={`${TAB_CONTAINER} mb-5`}>
          <button className={tab === "dispatches" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("dispatches")}>
            <Truck size={14} /> Dispatch Log
          </button>
          <button className={tab === "alerts" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("alerts")}>
            <AlertTriangle size={14} /> Temperature Alerts
          </button>
        </div>

        {tab === "dispatches" && <DispatchLog city={city} date={date} />}
        {tab === "alerts"    && <AlertsView city={city} date={date} />}
      </div>
    </div>
  );
}
