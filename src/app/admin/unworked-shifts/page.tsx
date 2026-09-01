"use client";

/**
 * Shifts that were rostered and nobody worked.
 *
 * 321 of these built up in two months and lived nowhere but a Discord message
 * that had already scrolled away. The page exists to answer one question —
 * where do we keep losing cover — so it opens on the branch, person and weekday
 * counts rather than on a list of dates, which is what you actually change a
 * rota by. The dates are underneath for checking a specific day.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarX2 } from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { GLASS_CARD, T_PAGE_TITLE, T_CAPTION, T_LABEL, PRIMARY_BUTTON } from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

type Row = {
  id: number;
  city: string;
  branch_code: string;
  staff_name: string;
  work_date: string;
  scheduled_start: number;
  alert_type: string;
  reminder_count: number;
  weekday: string;
};
type ByBranch = { branch_code: string; city: string; n: number; opening: number; last_seen: string };
type ByStaff = { staff_name: string; city: string; n: number; last_seen: string; branches: string[] };
type ByWeekday = { dow: number; weekday: string; n: number };

const ROLES = new Set(["HQ", "ADMIN", "HR_MANAGER", "DUBAI_MANAGEMENT", "MANILA_MANAGEMENT"]);

/** Local calendar date — toISOString() is UTC and shifts the day for anyone east of it. */
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function hhmm(h: number): string {
  const t = Math.round((h ?? 0) * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export default function UnworkedShiftsPage() {
  const [auth] = useState(getAuth);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [city, setCity] = useState("");
  const [days, setDays] = useState("60");
  const [branch, setBranch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [byBranch, setByBranch] = useState<ByBranch[]>([]);
  const [byStaff, setByStaff] = useState<ByStaff[]>([]);
  const [byWeekday, setByWeekday] = useState<ByWeekday[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - Number(days));
      const q = new URLSearchParams({ date_from: ymd(from), date_to: ymd(to) });
      if (city) q.set("city", city);
      if (branch) q.set("branch_code", branch);
      const res = await fetch(`/api/admin/late-alerts/unworked?${q.toString()}`, {
        cache: "no-store",
        headers: getAuthHeaders(),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      const j = JSON.parse(text);
      setRows(j.items || []);
      setByBranch(j.by_branch || []);
      setByStaff(j.by_staff || []);
      setByWeekday(j.by_weekday || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [city, days, branch]);

  useEffect(() => {
    if (mounted) void load();
  }, [mounted, load]);

  const worstWeekday = useMemo(
    () => byWeekday.reduce<ByWeekday | null>((a, b) => (!a || b.n > a.n ? b : a), null),
    [byWeekday],
  );
  const maxWeekday = useMemo(
    () => byWeekday.reduce((m, w) => Math.max(m, w.n), 0),
    [byWeekday],
  );

  // The page is prerendered and cached identically for everyone, so the server
  // renders it signed-out. Say nothing until the browser has read the session,
  // rather than flashing a refusal at someone who has access.
  if (!mounted) return <div className="min-h-screen" aria-busy="true" />;
  if (!auth || !ROLES.has((auth.role ?? "").toUpperCase())) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-white/60">Access denied — Manager or above required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className={T_PAGE_TITLE}>Unworked Shifts</h1>
        <p className={T_CAPTION}>
          Shifts somebody was rostered for and nobody clocked in — the shop ran short that day.
          A late arrival is not here: clocking in closes the alert, so only a shift that stayed
          empty to the end of the day reaches this list.
        </p>
      </div>

      <div className={`${GLASS_CARD} p-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[130px]">
            <label className={`${T_LABEL} mb-1 block`}>City</label>
            <SelectDark value={city} onChange={(v) => setCity(v)}
              options={[
                { value: "", label: "Both cities" },
                { value: "dubai", label: "Dubai" },
                { value: "manila", label: "Manila" },
              ]} />
          </div>
          <div className="min-w-[130px]">
            <label className={`${T_LABEL} mb-1 block`}>Period</label>
            <SelectDark value={days} onChange={(v) => setDays(v)}
              options={[
                { value: "30", label: "Last 30 days" },
                { value: "60", label: "Last 60 days" },
                { value: "90", label: "Last 90 days" },
                { value: "180", label: "Last 6 months" },
              ]} />
          </div>
          {branch && (
            <button type="button" onClick={() => setBranch("")}
              className="rounded-full bg-sky-600/50 px-3 py-1 text-xs text-sky-100 hover:bg-sky-500/50">
              {branch} ✕
            </button>
          )}
          <button type="button" onClick={() => void load()} className={PRIMARY_BUTTON}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className={`${GLASS_CARD} flex items-center gap-2 p-4 text-sm text-red-300`}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className={`${GLASS_CARD} flex items-center gap-3 p-6 text-white/60`}>
          <CalendarX2 className="h-5 w-5 shrink-0 text-emerald-400" />
          <span>No unworked shifts in this period. Every rostered shift was clocked in for.</span>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className={`${GLASS_CARD} p-4`}>
            <p className="text-3xl font-semibold text-amber-300">{rows.length}</p>
            <p className={T_CAPTION}>
              shifts nobody worked in the last {days} days
              {worstWeekday && maxWeekday > 0 && (
                <> — most often on <span className="text-white">{worstWeekday.weekday}</span></>
              )}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Where — the cut you move people between */}
            <div className={`${GLASS_CARD} p-4`}>
              <h2 className="mb-3 text-sm font-semibold text-white/80">By branch</h2>
              <div className="space-y-1.5">
                {byBranch.map((b) => (
                  <button key={`${b.city}-${b.branch_code}`} type="button"
                    onClick={() => setBranch(b.branch_code === branch ? "" : b.branch_code)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-white/5">
                    <span className="text-white/80">
                      {b.branch_code}
                      <span className="ml-1.5 text-[11px] text-white/35">{b.city}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {b.opening > 0 && (
                        <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-300">
                          {b.opening} opening
                        </span>
                      )}
                      <span className="font-mono text-white">{b.n}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Who — repeated names are a conversation, one-offs are not */}
            <div className={`${GLASS_CARD} p-4`}>
              <h2 className="mb-3 text-sm font-semibold text-white/80">By person</h2>
              <div className="space-y-1.5">
                {byStaff.slice(0, 12).map((s) => (
                  <div key={`${s.city}-${s.staff_name}`}
                    className="flex items-center justify-between px-2 py-1.5 text-sm">
                    <span className="min-w-0 truncate text-white/80">
                      {s.staff_name}
                      <span className="ml-1.5 text-[11px] text-white/35">{s.branches.join(", ")}</span>
                    </span>
                    <span className={`ml-2 shrink-0 font-mono ${s.n >= 5 ? "text-amber-300" : "text-white/70"}`}>
                      {s.n}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-white/40">
                A name here has not necessarily done anything wrong — approved leave that was never
                put on the rota lands here too. It is where to look, not a conclusion.
              </p>
            </div>

            {/* When — the cut you change the rota shape by */}
            <div className={`${GLASS_CARD} p-4`}>
              <h2 className="mb-3 text-sm font-semibold text-white/80">By weekday</h2>
              <div className="space-y-2">
                {byWeekday.map((w) => (
                  <div key={w.dow} className="flex items-center gap-2">
                    <span className="w-9 shrink-0 text-xs text-white/60">{w.weekday}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-amber-400/70"
                        style={{ width: `${maxWeekday ? (w.n / maxWeekday) * 100 : 0}%` }} />
                    </div>
                    <span className="w-7 shrink-0 text-right font-mono text-xs text-white/70">{w.n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`${GLASS_CARD} overflow-x-auto p-4`}>
            <h2 className="mb-3 text-sm font-semibold text-white/80">
              Every unworked shift{branch ? ` — ${branch}` : ""}
            </h2>
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-white/50">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Day</th>
                  <th className="py-2 pr-3 font-medium">Branch</th>
                  <th className="py-2 pr-3 font-medium">Rostered</th>
                  <th className="py-2 pr-3 font-medium">Shift</th>
                  <th className="py-2 pr-3 font-medium">Chased</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-white/5">
                    <td className="py-2 pr-3 font-mono text-white/80">{r.work_date}</td>
                    <td className="py-2 pr-3 text-white/50">{r.weekday}</td>
                    <td className="py-2 pr-3">
                      <span className="text-white/80">{r.branch_code}</span>
                      <span className="ml-1.5 text-[11px] text-white/35">{r.city}</span>
                    </td>
                    <td className="py-2 pr-3 text-white">{r.staff_name}</td>
                    <td className="py-2 pr-3">
                      <span className="font-mono text-white/80">{hhmm(r.scheduled_start)}</span>
                      {r.alert_type === "OPENING" && (
                        <span className="ml-2 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-300">
                          opening
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-white/50">
                      {r.reminder_count > 0 ? `${r.reminder_count}×` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
