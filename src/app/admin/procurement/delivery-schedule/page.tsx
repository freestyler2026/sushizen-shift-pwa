"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_LABEL,
} from "@/lib/ui-tokens";

// ─── Types ────────────────────────────────────────────────────────────────────
type ScheduleEntry = {
  id: string;
  supplier_name: string;
  store_code: string;
  delivery_date: string; // YYYY-MM-DD
  cutoff_note: string;
  note: string;
};

const STORES = ["Paranaque", "Taft", "Cubao", "ALL"];
const STORE_COLORS: Record<string, string> = {
  Paranaque: "bg-violet-500/20 border-violet-500/40 text-violet-200",
  Taft:      "bg-sky-500/20 border-sky-500/40 text-sky-200",
  Cubao:     "bg-emerald-500/20 border-emerald-500/40 text-emerald-200",
  ALL:       "bg-zinc-500/20 border-zinc-500/40 text-zinc-300",
};

function monthStart(ym: string) { return `${ym}-01`; }
function monthEnd(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).toISOString().slice(0, 10);
}
function daysInMonth(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => {
    const d = String(i + 1).padStart(2, "0");
    return `${ym}-${d}`;
  });
}
function dayLabel(date: string) {
  const d = new Date(date + "T00:00:00");
  return { day: d.getDate(), dow: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()], isWeekend: d.getDay() === 0 || d.getDay() === 6 };
}
function currentYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DeliverySchedulePage() {
  const router = useRouter();

  const [yearMonth, setYearMonth] = useState(currentYM());
  const [filterStore, setFilterStore] = useState("ALL");
  const [entries, setEntries]   = useState<ScheduleEntry[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [loading, setLoading]   = useState(false);
  const [loadErr, setLoadErr]   = useState("");

  // Modal state
  const [modal, setModal] = useState<{ date: string } | null>(null);
  const [form, setForm] = useState({ supplier_name: "", store_code: "Paranaque", cutoff_note: "", note: "" });
  const [saving, setSaving]   = useState(false);
  const [saveErr, setSaveErr] = useState("");

  const authRef = useRef<ReturnType<typeof getAuth>>(null);

  useEffect(() => {
    const auth = getAuth();
    if (!auth?.accessToken) { router.replace("/login"); return; }
    authRef.current = auth;
  }, [router]);

  // Load entries for the selected month
  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr("");
    try {
      let auth = getAuth();
      const refreshed = await refreshAuthFromApi(auth);
      auth = refreshed || auth;
      authRef.current = auth;
      const params = new URLSearchParams({
        city: "manila",
        date_from: monthStart(yearMonth),
        date_to: monthEnd(yearMonth),
        limit: "2000",
      });
      const [schedRes, catRes] = await Promise.all([
        fetch(`/api/admin/procurement/delivery-schedule?${params}`, {
          headers: { Authorization: `Bearer ${auth?.accessToken || ""}` },
        }),
        fetch(`/api/admin/procurement/catalog/curated?city=manila&active_only=true&limit=5000`, {
          headers: { Authorization: `Bearer ${auth?.accessToken || ""}` },
        }),
      ]);
      if (!schedRes.ok) throw new Error(await schedRes.text());
      const schedJson = await schedRes.json();
      setEntries((schedJson.rows || []) as ScheduleEntry[]);
      if (catRes.ok) {
        const catJson = await catRes.json();
        const names = Array.from(new Set(
          (catJson.rows || []).map((r: { supplier_name: string }) => r.supplier_name).filter(Boolean)
        )).sort() as string[];
        setSuppliers(names);
      }
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => { void load(); }, [load]);

  // Group entries by date → entry[]
  const byDate = useMemo(() => {
    const map = new Map<string, ScheduleEntry[]>();
    for (const e of entries) {
      const filtered =
        filterStore === "ALL" ||
        e.store_code === "ALL" ||
        e.store_code === filterStore;
      if (!filtered) continue;
      if (!map.has(e.delivery_date)) map.set(e.delivery_date, []);
      map.get(e.delivery_date)!.push(e);
    }
    return map;
  }, [entries, filterStore]);

  const days = useMemo(() => daysInMonth(yearMonth), [yearMonth]);

  // Calendar grid: pad the first day of month to the correct weekday
  const calendarGrid = useMemo(() => {
    if (days.length === 0) return [];
    const firstDow = new Date(days[0] + "T00:00:00").getDay();
    const blanks: null[] = Array(firstDow).fill(null);
    return [...blanks, ...days];
  }, [days]);

  // Open add modal for a date
  const openModal = (date: string) => {
    setForm({ supplier_name: suppliers[0] || "", store_code: "Paranaque", cutoff_note: "", note: "" });
    setSaveErr("");
    setModal({ date });
  };

  // Save
  const saveEntry = useCallback(async () => {
    if (!modal) return;
    setSaving(true);
    setSaveErr("");
    try {
      const auth = authRef.current || getAuth();
      const res = await fetch("/api/admin/procurement/delivery-schedule/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth?.accessToken || ""}` },
        body: JSON.stringify({ city: "manila", delivery_date: modal.date, ...form }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || JSON.stringify(json));
      setModal(null);
      await load();
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [modal, form, load]);

  // Delete
  const deleteEntry = useCallback(async (id: string) => {
    const auth = authRef.current || getAuth();
    try {
      const res = await fetch(`/api/admin/procurement/delivery-schedule/${id}?city=manila`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${auth?.accessToken || ""}` },
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j?.detail); }
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Month navigation
  const prevMonth = () => {
    const [y, m] = yearMonth.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setYearMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const nextMonth = () => {
    const [y, m] = yearMonth.split("-").map(Number);
    const d = new Date(y, m, 1);
    setYearMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen space-y-5 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={T_PAGE_TITLE}>Delivery Schedule</h1>
        <span className="text-xs text-zinc-500">Manila — vendor × store × date</span>
      </div>

      {/* Controls */}
      <div className={`${GLASS_CARD} flex flex-wrap items-center gap-3 p-4`}>
        {/* Month nav */}
        <div className="flex items-center gap-2">
          <button className={SMALL_BUTTON} onClick={prevMonth}>‹</button>
          <input
            type="month"
            className={`${INPUT_CLASS} w-36`}
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
          />
          <button className={SMALL_BUTTON} onClick={nextMonth}>›</button>
        </div>

        {/* Store filter */}
        <div className="flex items-center gap-2">
          <label className={`${T_LABEL} shrink-0`}>Store</label>
          <select
            className={`${SELECT_CLASS} w-36`}
            value={filterStore}
            onChange={(e) => setFilterStore(e.target.value)}
          >
            {STORES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <button className={`${SECONDARY_BUTTON} ml-auto text-sm`} onClick={load} disabled={loading}>
          {loading ? "Loading…" : "↺ Reload"}
        </button>
      </div>

      {loadErr && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{loadErr}</div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {(["Paranaque","Taft","Cubao","ALL"] as const).map((s) => (
          <span key={s} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STORE_COLORS[s]}`}>
            {s}
          </span>
        ))}
      </div>

      {/* Calendar */}
      <div className={`${GLASS_CARD} overflow-hidden`}>
        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b border-white/8 bg-white/3">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {calendarGrid.map((date, idx) => {
            if (!date) {
              return <div key={`blank-${idx}`} className="min-h-[100px] border-b border-r border-white/5 bg-white/1" />;
            }
            const { day, isWeekend } = dayLabel(date);
            const dayEntries = byDate.get(date) || [];
            const isToday = date === new Date().toISOString().slice(0, 10);

            return (
              <div
                key={date}
                className={[
                  "min-h-[100px] border-b border-r border-white/5 p-1.5 transition-colors",
                  isWeekend ? "bg-white/2" : "",
                ].join(" ")}
              >
                {/* Day number */}
                <div className="mb-1 flex items-center justify-between">
                  <span className={[
                    "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold",
                    isToday ? "bg-violet-500 text-white" : isWeekend ? "text-zinc-500" : "text-zinc-400",
                  ].join(" ")}>
                    {day}
                  </span>
                  <button
                    onClick={() => openModal(date)}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-600 transition hover:bg-violet-500/20 hover:text-violet-300"
                    title="Add delivery"
                  >
                    +
                  </button>
                </div>

                {/* Delivery chips */}
                <div className="space-y-0.5">
                  {dayEntries.map((e) => (
                    <div
                      key={e.id}
                      className={[
                        "group flex items-center gap-1 rounded border px-1 py-0.5 text-[10px] leading-tight",
                        STORE_COLORS[e.store_code] || STORE_COLORS.ALL,
                      ].join(" ")}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{e.supplier_name}</span>
                      {e.store_code !== "ALL" && (
                        <span className="shrink-0 opacity-60">{e.store_code.slice(0, 3)}</span>
                      )}
                      <button
                        onClick={() => deleteEntry(e.id)}
                        className="ml-auto hidden shrink-0 text-[9px] opacity-50 transition hover:opacity-100 group-hover:inline"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* List view (below calendar) */}
      {entries.length > 0 && (
        <div className={`${GLASS_CARD} overflow-hidden`}>
          <div className="border-b border-white/8 px-4 py-3">
            <span className="text-sm font-semibold text-zinc-300">
              {entries.length} delivery slot{entries.length !== 1 ? "s" : ""} in {yearMonth}
            </span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5 bg-white/3">
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Date</th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Supplier</th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Store</th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Notes</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {entries.filter(e =>
                filterStore === "ALL" || e.store_code === "ALL" || e.store_code === filterStore
              ).map((e) => (
                <tr key={e.id} className="border-b border-white/5 hover:bg-white/3">
                  <td className="px-4 py-2 text-sm tabular-nums text-zinc-300">{e.delivery_date}</td>
                  <td className="px-4 py-2 text-sm text-zinc-200">{e.supplier_name}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-medium ${STORE_COLORS[e.store_code] || STORE_COLORS.ALL}`}>
                      {e.store_code}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-zinc-500">
                    {[e.cutoff_note, e.note].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => deleteEntry(e.id)}
                      className="rounded px-1.5 py-0.5 text-[11px] text-zinc-600 transition hover:bg-red-500/20 hover:text-red-400"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add delivery modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`${GLASS_CARD} w-full max-w-md p-6`}>
            <h2 className="mb-4 text-base font-semibold text-white">
              Add Delivery — {modal.date}
            </h2>

            <div className="space-y-4">
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Supplier</label>
                {suppliers.length > 0 ? (
                  <select
                    className={SELECT_CLASS}
                    value={form.supplier_name}
                    onChange={(e) => setForm((f) => ({ ...f, supplier_name: e.target.value }))}
                  >
                    {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <input
                    className={INPUT_CLASS}
                    placeholder="Supplier name"
                    value={form.supplier_name}
                    onChange={(e) => setForm((f) => ({ ...f, supplier_name: e.target.value }))}
                  />
                )}
              </div>

              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Store</label>
                <select
                  className={SELECT_CLASS}
                  value={form.store_code}
                  onChange={(e) => setForm((f) => ({ ...f, store_code: e.target.value }))}
                >
                  {STORES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Cut-off note (optional)</label>
                <input
                  className={INPUT_CLASS}
                  placeholder="e.g. Order by 5pm previous day"
                  value={form.cutoff_note}
                  onChange={(e) => setForm((f) => ({ ...f, cutoff_note: e.target.value }))}
                />
              </div>

              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Note (optional)</label>
                <input
                  className={INPUT_CLASS}
                  placeholder="Additional info"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                />
              </div>

              {saveErr && (
                <p className="text-sm text-red-400">{saveErr}</p>
              )}
            </div>

            <div className="mt-5 flex gap-3">
              <button className={`${SECONDARY_BUTTON} flex-1`} onClick={() => setModal(null)} disabled={saving}>
                Cancel
              </button>
              <button
                className={`${PRIMARY_BUTTON} flex-1`}
                onClick={saveEntry}
                disabled={saving || !form.supplier_name.trim()}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
