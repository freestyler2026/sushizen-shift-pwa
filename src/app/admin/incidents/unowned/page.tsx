"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Hand, RefreshCw, Siren } from "lucide-react";
import { getAuth, getAuthHeaders, canAccessAdminNav } from "@/lib/auth";
import {
  GLASS_CARD,
  SMALL_BUTTON,
  T_PAGE_TITLE,
  T_CAPTION,
  T_BODY,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  TABLE_ROW,
  TABLE_HEADER,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

/**
 * The list that matters: reports with nobody's name on them.
 *
 * Eight sat unread for weeks because nothing made the silence visible. The
 * badge in the nav is the real fix; this is where the badge leads, and taking
 * one on is a single press from here.
 */

interface Unowned {
  id: string;
  city: string;
  branch: string;
  category: string;
  level: number;
  report_kind: string;
  description: string;
  reporter_name: string;
  status: string;
  created_at: string;
  operation_affected: boolean | null;
  can_continue: string;
  immediate_action: string;
  hq_help_needed: boolean | null;
  notify_round: number;
  reported_lag_min: number | null;
  waiting_min: number;
}

function waited(mins: number): string {
  if (mins < 60) return `${mins} min`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)} h`;
  return `${Math.round(mins / 1440)} days`;
}

export default function UnownedIncidentsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Unowned[]>([]);
  const [summary, setSummary] = useState<{ total?: number; urgent?: number; longest_wait_min?: number }>({});
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(true);
  const [taking, setTaking] = useState("");
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login?next=%2Fadmin%2Fincidents%2Funowned");
      return;
    }
    if (!canAccessAdminNav(auth) && auth.role !== "HQ") router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = city ? `?city=${encodeURIComponent(city)}` : "";
      const res = await fetch(`/api/admin/incidents/unowned${qs}`, {
        headers: getAuthHeaders(getAuth()),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setRows(d.rows || []);
      setSummary(d.summary || {});
    } catch (e) {
      setBanner({ kind: "err", text: `Could not load: ${e}` });
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    load();
  }, [load]);

  async function takeOn(r: Unowned) {
    setTaking(r.id);
    setBanner(null);
    try {
      const res = await fetch(`/api/admin/incidents/${r.id}/acknowledge`, {
        method: "POST",
        headers: getAuthHeaders(getAuth()),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.detail || `HTTP ${res.status}`);
      }
      const d = await res.json();
      setBanner(
        d.ok
          ? { kind: "ok", text: `Taken on. It waited ${waited(d.waited_min ?? 0)}. The alerts stop now.` }
          : { kind: "err", text: `${d.already_taken_by} already has this one.` },
      );
      await load();
    } catch (e) {
      setBanner({ kind: "err", text: `${e instanceof Error ? e.message : e}` });
    } finally {
      setTaking("");
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Waiting for someone</h1>
          <p className={T_BODY + " mt-1 max-w-3xl"}>
            Reports with nobody&rsquo;s name on them. Taking one on stops the alerts and puts
            your name against it — which is the point: a report addressed to
            &ldquo;HQ&rdquo; is addressed to nobody.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-36">
            <SelectDark
              value={city}
              onChange={setCity}
              options={[
                { value: "", label: "Both cities" },
                { value: "dubai", label: "Dubai" },
                { value: "manila", label: "Manila" },
              ]}
            />
          </div>
          <button onClick={load} disabled={loading} className={SMALL_BUTTON}>
            <RefreshCw className={`h-3.5 w-3.5 inline mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`rounded-xl border p-3 text-sm ${
            banner.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/30 bg-red-500/10 text-red-200"
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Waiting</div>
          <div className={KPI_VALUE + ((summary.total ?? 0) ? " text-amber-300" : " text-emerald-300")}>
            {summary.total ?? 0}
          </div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Happening now</div>
          <div className={KPI_VALUE + ((summary.urgent ?? 0) ? " text-red-300" : "")}>
            {summary.urgent ?? 0}
          </div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Longest wait</div>
          <div className={KPI_VALUE}>{waited(summary.longest_wait_min ?? 0)}</div>
        </div>
      </div>

      <div className={GLASS_CARD + " overflow-hidden p-0"}>
        {loading ? (
          <div className="p-8 text-center text-zinc-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <Check className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
            <div className="text-sm text-zinc-300">Everything has an owner.</div>
            <div className={T_CAPTION + " mt-1"}>
              This is the state to keep. A store that gets a reply keeps reporting.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr>
                  <th className={TABLE_HEADER}>Waiting</th>
                  <th className={TABLE_HEADER}>What / where</th>
                  <th className={TABLE_HEADER}>Trading</th>
                  <th className={TABLE_HEADER}>Reported by</th>
                  <th className={TABLE_HEADER}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={TABLE_ROW}>
                    <td className="py-3 whitespace-nowrap">
                      <div
                        className={`text-sm tabular-nums ${
                          r.waiting_min > 120 ? "text-red-300" : "text-zinc-300"
                        }`}
                      >
                        {waited(r.waiting_min)}
                      </div>
                      {r.notify_round > 0 && (
                        <div className="text-[10px] text-zinc-500">
                          alerted {r.notify_round}×
                        </div>
                      )}
                    </td>
                    <td className="py-3 max-w-[320px]">
                      <div className="flex items-center gap-1.5">
                        {r.report_kind === "urgent" && (
                          <Siren
                            className={`h-3.5 w-3.5 shrink-0 ${
                              r.level === 3 ? "text-red-400" : "text-orange-400"
                            }`}
                          />
                        )}
                        <span className="text-sm text-zinc-100">{r.category}</span>
                        {r.report_kind === "urgent" && (
                          <span className="rounded bg-white/10 px-1.5 text-[10px] text-zinc-300">
                            L{r.level}
                          </span>
                        )}
                      </div>
                      <div className={T_CAPTION}>
                        {r.branch || r.city}
                        {r.description ? ` · ${r.description.slice(0, 70)}` : ""}
                      </div>
                      {r.immediate_action && (
                        <div className="text-[11px] text-zinc-500">
                          already done: {r.immediate_action.slice(0, 60)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-xs">
                      {r.report_kind === "urgent" ? (
                        <>
                          <div className={r.operation_affected ? "text-amber-300" : "text-zinc-500"}>
                            {r.operation_affected ? "affected" : "not yet"}
                          </div>
                          <div className="text-zinc-500">can continue: {r.can_continue || "—"}</div>
                          {r.hq_help_needed && (
                            <div className="text-red-300">needs HQ</div>
                          )}
                        </>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="py-3 text-xs text-zinc-400">
                      <div>{r.reporter_name || "—"}</div>
                      {r.reported_lag_min !== null && (
                        <div className="flex items-center gap-1 text-zinc-500">
                          <Clock className="h-3 w-3" />
                          told us after {waited(r.reported_lag_min)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => takeOn(r)}
                        disabled={taking === r.id}
                        className={SMALL_BUTTON}
                      >
                        <Hand className="mr-1 inline h-3.5 w-3.5" />
                        {taking === r.id ? "…" : "Take this on"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={T_CAPTION + " leading-relaxed"}>
        After two unanswered rounds the alert starts naming one person at a time, working
        through HQ, so nobody can assume somebody else has it.
        <br />
        Judge this list by how long things wait — never by how many arrive. A store that is
        counted for reporting learns to stop.
      </div>
    </div>
  );
}
