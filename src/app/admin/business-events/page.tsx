"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SMALL_BUTTON,
  INPUT_CLASS,
  TEXTAREA_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_CAPTION,
  T_LABEL,
} from "@/lib/ui-tokens";
import { AlertTriangle, CalendarDays, Plus, RefreshCw, Trash2, TrendingDown, TrendingUp, Minus } from "lucide-react";

type BusinessEvent = {
  id: number;
  event_date: string;
  event_name: string;
  affected_cities: string;
  impact_direction: string;
  impact_level: number;
  event_type: string;
  notes: string;
  created_at: string;
};

const EVENT_TYPE_OPTIONS = [
  { value: "", label: "— Select type —" },
  { value: "geopolitical_supply_shock", label: "Geopolitical / Supply Shock" },
  { value: "seasonal_religious", label: "Seasonal / Religious (Ramadan etc.)" },
  { value: "weather_disaster", label: "Weather / Disaster" },
  { value: "macroeconomic_inflation", label: "Macroeconomic / Inflation" },
  { value: "macroeconomic_growth", label: "Macroeconomic / Growth" },
  { value: "demand_suppression", label: "Demand Suppression" },
  { value: "demand_boost", label: "Demand Boost" },
  { value: "labor_cost", label: "Labor Cost Change" },
  { value: "regulatory", label: "Regulatory / Tax" },
  { value: "regulatory_relief", label: "Regulatory Relief" },
  { value: "platform_outage", label: "Platform Outage" },
  { value: "other", label: "Other" },
];

const CITY_OPTIONS = [
  { value: "all", label: "Both cities (Dubai + Manila)" },
  { value: "dubai", label: "Dubai only" },
  { value: "manila", label: "Manila only" },
];

const IMPACT_OPTIONS = [
  { value: "negative", label: "Negative — revenue/demand fell" },
  { value: "positive", label: "Positive — revenue/demand rose" },
  { value: "neutral", label: "Neutral — operational disruption" },
];

function ImpactBadge({ dir }: { dir: string }) {
  if (dir === "positive")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/40 border border-emerald-700/50 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
        <TrendingUp className="h-3 w-3" /> Positive
      </span>
    );
  if (dir === "neutral")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 border border-zinc-600 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
        <Minus className="h-3 w-3" /> Neutral
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-900/40 border border-red-700/50 px-2 py-0.5 text-[10px] font-semibold text-red-300">
      <TrendingDown className="h-3 w-3" /> Negative
    </span>
  );
}

function CityBadge({ cities }: { cities: string }) {
  const label = cities === "dubai" ? "Dubai" : cities === "manila" ? "Manila" : "All Cities";
  return (
    <span className="rounded-full bg-violet-900/30 border border-violet-700/40 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
      {label}
    </span>
  );
}

export default function BusinessEventsPage() {
  const auth = useMemo(() => getAuth(), []);
  const [events, setEvents] = useState<BusinessEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  // Form state
  const [eventDate, setEventDate] = useState("");
  const [eventName, setEventName] = useState("");
  const [affectedCities, setAffectedCities] = useState("all");
  const [impactDir, setImpactDir] = useState("negative");
  const [impactLevel, setImpactLevel] = useState(3);
  const [eventType, setEventType] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/business-events", {
        headers: getAuthHeaders(),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setEvents(Array.isArray(data?.events) ? data.events : []);
    } catch (e: unknown) {
      setError(String((e as Error)?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEventDate("");
    setEventName("");
    setAffectedCities("all");
    setImpactDir("negative");
    setImpactLevel(3);
    setEventType("");
    setNotes("");
    setSaveMsg("");
  };

  const handleSave = async () => {
    if (!eventDate || !eventName.trim()) {
      setSaveMsg("Date and event name are required.");
      return;
    }
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/admin/business-events", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          event_name: eventName.trim(),
          affected_cities: affectedCities,
          impact_direction: impactDir,
          impact_level: impactLevel,
          event_type: eventType,
          notes: notes.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail || `Error ${res.status}`);
      }
      const data = await res.json();
      setEvents((prev) => [data.event, ...prev]);
      resetForm();
      setShowForm(false);
    } catch (e: unknown) {
      setSaveMsg(String((e as Error)?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await fetch(`/api/admin/business-events/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  const canEdit = ["ADMIN", "HQ", "MANILA_MANAGEMENT", "DUBAI_MANAGEMENT"].includes(
    String(auth?.role || "").toUpperCase()
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Business Events Log</h1>
          <p className="mt-1 text-sm text-zinc-400">
            External events that explain revenue or operational anomalies. The AI Analytics Pro
            reads this log and uses these events as the primary explanation before looking for
            internal causes.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className={`${SMALL_BUTTON} flex items-center gap-2`}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => { setShowForm(!showForm); setSaveMsg(""); }}
              className={`${PRIMARY_BUTTON} flex items-center gap-2`}
            >
              <Plus className="h-4 w-4" />
              Add Event
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-700/50 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className={`${GLASS_CARD} mb-6 p-5`}>
          <p className={`${T_SECTION} mb-4`}>Add External Event</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Date</label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Affected Cities</label>
              <select
                value={affectedCities}
                onChange={(e) => setAffectedCities(e.target.value)}
                className={INPUT_CLASS}
              >
                {CITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={`${T_LABEL} mb-1.5 block`}>Event Name</label>
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g. Iran War outbreak, Typhoon Carina, GrabFood platform outage"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>
                Impact Level <span className="text-zinc-500">(1=minor · 5=critical)</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={impactLevel}
                  onChange={(e) => setImpactLevel(Number(e.target.value))}
                  className="flex-1 accent-violet-500"
                />
                <span className={`w-6 text-center font-bold text-lg ${
                  impactLevel >= 5 ? "text-red-400" : impactLevel >= 4 ? "text-amber-400" : "text-zinc-300"
                }`}>{impactLevel}</span>
              </div>
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Event Type</label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className={INPUT_CLASS}
              >
                {EVENT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={`${T_LABEL} mb-1.5 block`}>Impact Direction</label>
              <div className="flex flex-wrap gap-2">
                {IMPACT_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setImpactDir(o.value)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                      impactDir === o.value
                        ? o.value === "positive"
                          ? "border-emerald-600 bg-emerald-900/40 text-emerald-300"
                          : o.value === "neutral"
                            ? "border-zinc-500 bg-zinc-800 text-zinc-300"
                            : "border-red-600 bg-red-900/40 text-red-300"
                        : "border-white/10 bg-white/3 text-zinc-400 hover:bg-white/6"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={`${T_LABEL} mb-1.5 block`}>Notes (for AI context)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Describe the impact. e.g. Dubai consumer confidence dropped sharply. Delivery demand fell ~30% through April. Recovery began May 2026."
                className={TEXTAREA_CLASS}
              />
            </div>
          </div>
          {saveMsg && (
            <p className="mt-3 text-sm text-red-400">{saveMsg}</p>
          )}
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className={`${PRIMARY_BUTTON} flex items-center gap-2`}
            >
              {saving ? "Saving…" : "Save Event"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); resetForm(); }}
              className="rounded-xl border border-white/10 bg-white/3 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Explainer */}
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-700/30 bg-amber-900/10 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p className="text-xs text-amber-300/80">
          The AI Analytics Pro calls this log automatically before every analysis. Events logged
          here override internal explanations (staffing, licensing, seasonality) when revenue
          moves correlate with event dates. Add any event since <strong>August 2025</strong> that
          affected business — wars, typhoons, platform outages, regulatory changes, etc.
        </p>
      </div>

      {/* Event list */}
      {events.length === 0 && !loading ? (
        <div className={`${GLASS_CARD} flex flex-col items-center gap-2 p-10`}>
          <CalendarDays className="h-8 w-8 text-zinc-600" />
          <p className={T_CAPTION}>No events logged yet.</p>
          {canEdit && (
            <p className="text-xs text-zinc-500">
              Click &ldquo;Add Event&rdquo; to log the first external event.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => (
            <div key={ev.id} className={`${GLASS_CARD} p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-zinc-500">{ev.event_date}</span>
                    <ImpactBadge dir={ev.impact_direction} />
                    <CityBadge cities={ev.affected_cities} />
                    {ev.impact_level >= 4 && (
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                        ev.impact_level === 5
                          ? "bg-red-900/50 border-red-600 text-red-200"
                          : "bg-amber-900/40 border-amber-600 text-amber-300"
                      }`}>
                        Lv.{ev.impact_level}
                      </span>
                    )}
                    {ev.event_type && (
                      <span className="rounded-full bg-zinc-800 border border-zinc-600 px-2 py-0.5 text-[10px] text-zinc-400">
                        {ev.event_type.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-white">{ev.event_name}</p>
                  {ev.notes && (
                    <p className="mt-1.5 text-sm text-zinc-400">{ev.notes}</p>
                  )}
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(ev.id)}
                    disabled={deleting === ev.id}
                    className="shrink-0 rounded-lg p-1.5 text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
