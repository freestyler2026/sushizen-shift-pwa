// src/app/admin/staff/hire-dates/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Check, Clock } from "lucide-react";
import SelectDark from "@/components/SelectDark";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  KPI_CARD,
  PRIMARY_BUTTON,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
} from "@/lib/ui-tokens";

/**
 * Where each person's start date stands, and HR's one place to confirm it.
 *
 * Split from the person's own answer on purpose. The start date decides how
 * many leave days someone is owed, so a self-entered value must not reach the
 * entitlement calculation until it has been checked against the contract.
 *
 * Dubai is here because it holds none at all — 63 profiles, zero dates — and
 * the existing employment-details screen only ever queried Manila.
 */

type Row = {
  staff_name: string;
  city: string;
  branch_code: string;
  status: string;
  confirmed_hire_date: string | null;
  claimed_hire_date: string | null;
  claimed_at: string | null;
  confirmed_by: string;
};

type Resp = {
  ok: boolean;
  rows: Row[];
  total: number;
  confirmed: number;
  awaiting_confirmation: number;
  no_answer: number;
};

type Filter = "awaiting" | "no_answer" | "confirmed" | "all";

export default function HireDatesPage() {
  const [city, setCity] = useState("manila");
  const [data, setData] = useState<Resp | null>(null);
  const [filter, setFilter] = useState<Filter>("awaiting");
  const [loading, setLoading] = useState(false);
  const [savingFor, setSavingFor] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/admin/staff/hire-dates?city=${encodeURIComponent(city)}`,
        { headers: getAuthHeaders(getAuth()), cache: "no-store" },
      );
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.detail || `HTTP ${res.status}`);
      setData(j as Resp);
      setDraft({});
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const rows = data?.rows ?? [];
    if (filter === "all") return rows;
    if (filter === "confirmed") return rows.filter((r) => r.confirmed_hire_date);
    if (filter === "awaiting")
      return rows.filter((r) => r.claimed_hire_date && !r.confirmed_hire_date);
    return rows.filter((r) => !r.claimed_hire_date && !r.confirmed_hire_date);
  }, [data, filter]);

  async function confirm(r: Row, value: string) {
    if (!value) return;
    setSavingFor(r.staff_name);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/staff/hire-dates/confirm", {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ city: r.city, staff_name: r.staff_name, hire_date: value }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.detail || `HTTP ${res.status}`);
      setMsg({ kind: "ok", text: `${r.staff_name} — confirmed ${value}` });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: `${r.staff_name}: ${e instanceof Error ? e.message : e}` });
    } finally {
      setSavingFor("");
    }
  }

  const counts: [Filter, string, number][] = [
    ["awaiting", "Awaiting HR", data?.awaiting_confirmation ?? 0],
    ["no_answer", "No answer yet", data?.no_answer ?? 0],
    ["confirmed", "Confirmed", data?.confirmed ?? 0],
    ["all", "Everyone", data?.total ?? 0],
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-5">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-violet-400" />
          <h1 className={T_PAGE_TITLE}>Hire dates</h1>
        </div>
        <p className={T_CAPTION + " mt-1"}>
          Staff enter their own start date under My Details. It counts towards leave only
          once confirmed here, against the contract.
        </p>
      </motion.div>

      <div className={GLASS_CARD + " p-5 space-y-4"}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-40">
            <label className={`${T_LABEL} mb-1.5 block`}>City</label>
            <SelectDark
              value={city}
              onChange={setCity}
              options={[
                { value: "manila", label: "Manila" },
                { value: "dubai", label: "Dubai" },
              ]}
            />
          </div>
          <button onClick={load} disabled={loading} className={PRIMARY_BUTTON + " disabled:opacity-40"}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {counts.map(([key, label, n]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`${KPI_CARD} text-left transition-colors ${
                filter === key ? "border-violet-500/50 bg-violet-500/10" : ""
              }`}
            >
              <div className={T_LABEL}>{label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-white">{n}</div>
            </button>
          ))}
        </div>

        {msg && (
          <div
            className={`rounded-lg border p-2.5 text-sm ${
              msg.kind === "ok"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-red-500/30 bg-red-500/10 text-red-200"
            }`}
          >
            {msg.text}
          </div>
        )}
      </div>

      <div className={GLASS_CARD + " p-5"}>
        <h2 className={T_SECTION + " mb-3"}>
          {shown.length} {shown.length === 1 ? "person" : "people"}
        </h2>

        {shown.length === 0 ? (
          <p className={T_CAPTION}>Nothing in this group.</p>
        ) : (
          <div className="space-y-2">
            {shown.map((r) => {
              const value = draft[r.staff_name] ?? r.confirmed_hire_date ?? r.claimed_hire_date ?? "";
              const isConfirmed = !!r.confirmed_hire_date;
              return (
                <div
                  key={`${r.city}:${r.staff_name}`}
                  className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${
                    isConfirmed
                      ? "border-emerald-500/20 bg-emerald-950/10"
                      : r.claimed_hire_date
                      ? "border-amber-500/25 bg-amber-950/10"
                      : "border-white/8 bg-white/4"
                  }`}
                >
                  <div className="min-w-[11rem] flex-1">
                    <div className="text-sm font-medium text-white">{r.staff_name}</div>
                    <div className={T_CAPTION}>
                      {r.branch_code || "—"} · {r.status}
                    </div>
                  </div>

                  <div className="min-w-[9rem]">
                    <div className={T_LABEL}>They said</div>
                    <div className="mt-0.5 text-sm tabular-nums text-amber-200">
                      {r.claimed_hire_date ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {r.claimed_hire_date}
                        </span>
                      ) : (
                        <span className="text-zinc-600">no answer</span>
                      )}
                    </div>
                  </div>

                  {isConfirmed ? (
                    <div className="min-w-[12rem]">
                      <div className={T_LABEL}>Confirmed</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-sm tabular-nums text-emerald-300">
                        <Check className="h-3.5 w-3.5" />
                        {r.confirmed_hire_date}
                        {r.confirmed_by && (
                          <span className={T_CAPTION}>by {r.confirmed_by}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-end gap-2">
                      <div>
                        <div className={T_LABEL}>Confirm as</div>
                        <input
                          type="date"
                          className="mt-1 rounded-lg border border-white/10 bg-white/6 px-2.5 py-1.5 text-sm tabular-nums text-white outline-none focus:border-violet-500/50"
                          value={value}
                          max={new Date().toISOString().slice(0, 10)}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [r.staff_name]: e.target.value }))
                          }
                        />
                      </div>
                      <button
                        onClick={() => confirm(r, value)}
                        disabled={!value || savingFor === r.staff_name}
                        className={PRIMARY_BUTTON + " disabled:opacity-40"}
                      >
                        {savingFor === r.staff_name ? "Saving…" : "Confirm"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
