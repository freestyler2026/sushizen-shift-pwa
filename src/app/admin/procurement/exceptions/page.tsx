"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import {
  GLASS_CARD,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_CAPTION,
  T_LABEL,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
} from "@/lib/ui-tokens";
import { RefreshCw, AlertCircle, CheckCircle } from "lucide-react";
import SelectDark from "@/components/SelectDark";

type ExceptionRow = {
  id: string;
  case_id: string;
  request_no: string;
  rule_code: string;
  severity: string;
  score: number;
  status: string;
  requested_by: string;
  total_amount?: number | string | null;
  store_code?: string | null;
  request_date?: string | null;
  detected_payload_json?: Record<string, unknown> | null;
};

const CCY: Record<string, string> = { manila: "₱", dubai: "AED " };

function money(v: unknown, city: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${CCY[city] || ""}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/**
 * What this alert is, in words, from its own payload.
 *
 * Without this the row said "DUPLICATE_REQUEST · Score 85.0" and nothing else,
 * which is a research task rather than a decision: the reviewer has to go and
 * look the order up somewhere else before they can judge anything.
 */
function explain(row: ExceptionRow, city: string): { title: string; detail: string; look: string } {
  const p = (row.detected_payload_json || {}) as Record<string, any>;
  const amt = money(row.total_amount, city);
  const rule = String(row.rule_code || "").toUpperCase();

  if (rule === "DUPLICATE_REQUEST") {
    const m: any[] = Array.isArray(p.matches) ? p.matches : [];
    const live = Number(p.live_matches || 0);
    const others = m.map((x) => `${x.request_no} (${x.status}, ${x.gap_minutes} min apart)`).join(", ");
    return {
      title: `Same amount ordered twice — ${amt}`,
      detail: others
        ? `Also raised as ${others}.`
        : "Another order for the identical amount was raised minutes away.",
      look: live
        ? "At least one of them is still moving, so this can be delivered and paid twice. Cancel the one that should not stand."
        : "The other one was already stopped (draft, returned, rejected or cancelled), so nothing is at risk — close this.",
    };
  }
  if (rule === "SPLIT_ORDER_SUSPECT") {
    const cl: any[] = Array.isArray(p.clusters) ? p.clusters : [];
    const c0 = cl[0] || {};
    const sib: any[] = Array.isArray(c0.siblings) ? c0.siblings : [];
    const step = Number(p.approval_step || 0);
    return {
      title: `Same-day orders to one supplier add up past the approval line`,
      detail:
        `${money(p.this_amount, city)} here, plus ${sib.map((s) => money(s.amount, city)).join(" + ") || "—"}` +
        `${c0.vendor ? ` to ${c0.vendor}` : ""} = ${money(c0.combined_amount, city)}. ` +
        `Each one on its own stays under ${money(step, city)}; together they do not.`,
      look:
        `Above ${money(step, city)} the order needs the next approver up. Check whether these were meant to be one order. ` +
        `Separate stores or genuinely separate deliveries are normal — close it.`,
    };
  }
  if (rule === "THRESHOLD_EDGE_PATTERN") {
    const th = Number(p.threshold || 0);
    // The amount when it was flagged, not the amount now. Orders get edited
    // after they are raised, and repeating today's figure under "just under
    // the line" makes the screen state something arithmetically false.
    const then = Number(p.total_amount);
    const now = Number(row.total_amount);
    const moved = Number.isFinite(then) && Number.isFinite(now) && Math.abs(then - now) > 0.5;
    return {
      title: `${money(Number.isFinite(then) ? then : now, city)} — just under the ${money(th, city)} approval line`,
      detail: moved
        ? `That was the total when it was flagged. It is ${money(now, city)} now — the order was edited afterwards.`
        : `Within 5% of the point where a higher approver is required.`,
      look: moved
        ? "The alert no longer describes the order. Worth one look at who changed it, then close."
        : "Usually a coincidence. Worth a look only if the same person keeps landing here.",
    };
  }
  if (rule === "URGENT_OVERUSE") {
    return {
      title: `Urgent used on ${Math.round(Number(p.urgent_ratio || 0) * 100)}% of recent orders`,
      detail: `${p.urgent_count} of ${p.recent_count} requests.`,
      look: "Urgent escalates approval. Constant urgency means the flag has stopped meaning anything.",
    };
  }
  return { title: rule, detail: "", look: "" };
}

function severityBadge(severity: string) {
  const s = String(severity || "").toUpperCase();
  if (s === "RED" || s === "HIGH")    return <span className={BADGE_ERROR}>{s}</span>;
  if (s === "AMBER" || s === "MEDIUM" || s === "YELLOW") return <span className={BADGE_WARNING}>{s}</span>;
  if (s === "GREEN" || s === "LOW")   return <span className={BADGE_SUCCESS}>{s}</span>;
  return <span className={BADGE_INFO}>{severity || "-"}</span>;
}

function statusBadge(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "OPEN")     return <span className={BADGE_ERROR}>OPEN</span>;
  if (s === "REVIEWED") return <span className={BADGE_WARNING}>REVIEWED</span>;
  if (s === "CLOSED")   return <span className={BADGE_SUCCESS}>CLOSED</span>;
  return <span className={BADGE_INFO}>{status || "-"}</span>;
}

export default function ProcurementExceptionsPage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [city, setCity] = useState<"manila" | "dubai">(
    String(auth?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila",
  );
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [rows, setRows] = useState<ExceptionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const data = await procurementJson<{ rows: ExceptionRow[] }>(
        `/api/admin/procurement/exceptions?city=${encodeURIComponent(city)}&limit=200`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [city, pin, requestedBy]);

  const review = async (eventId: string, status: "REVIEWED" | "CLOSED") => {
    setBusyId(eventId + status);
    setError("");
    setSuccessMsg("");
    try {
      await procurementJson(
        "/api/admin/procurement/exceptions/review",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_id: eventId, status, note: "", approver_name: requestedBy, pin }),
        },
        requestedBy,
        pin,
      );
      setSuccessMsg(`Exception marked as ${status}.`);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusyId("");
    }
  };

  useEffect(() => {
    async function init() {
      const localAuth = auth ?? getAuth();
      const refreshed = await refreshAuthFromApi(localAuth);
      const resolvedCity: "manila" | "dubai" =
        String((refreshed || localAuth)?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila";
      setCity(resolvedCity);
      const can = canAccessProcurementAdmin(String((refreshed || localAuth)?.role || ""), resolvedCity);
      setAllowed(can);
      setAuthChecked(true);
      if (can) await load();
    }
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!authChecked) return null;
  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Procurement exceptions is only available to authorized admin roles.
      </div>
    );
  }

  const open = rows.filter((r) => String(r.status || "").toUpperCase() === "OPEN");
  const other = rows.filter((r) => String(r.status || "").toUpperCase() !== "OPEN");

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>Exception Alerts</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Review and close procurement rule violations.
            {open.length > 0 && <span className="ml-2 font-semibold text-red-400">{open.length} open</span>}
          </p>
        </div>
      </div>

      {/* Error / Success */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {successMsg && !error && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle className="h-4 w-4 shrink-0" />{successMsg}
        </div>
      )}

      {/* Session bar */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Approver Name</label>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Name" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>City</label>
            <SelectDark
              value={city}
              onChange={v => setCity(v === "dubai" ? "dubai" : "manila")}
              className={SELECT_CLASS}
              options={[
                { value: "manila", label: "Manila" },
                { value: "dubai", label: "Dubai" },
              ]}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className={`${SECONDARY_BUTTON} w-full flex items-center justify-center gap-2`}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && !rows.length && (
        <div className={`${GLASS_CARD} p-10 flex items-center justify-center gap-3 text-zinc-500`}>
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading exceptions…</span>
        </div>
      )}

      {!loading && !rows.length && (
        <div className={`${GLASS_CARD} p-10 flex items-center justify-center`}>
          <p className={T_CAPTION}>No exception events.</p>
        </div>
      )}

      {/* Open exceptions */}
      {open.length > 0 && (
        <div className="space-y-2">
          {open.map((row) => (
            <div key={row.id} className="rounded-2xl border border-red-500/30 bg-red-950/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {severityBadge(row.severity)}
                    <span className="text-sm font-semibold text-white">
                      {explain(row, city).title}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-300">{explain(row, city).detail}</p>
                  <p className="text-xs text-amber-200/80">{explain(row, city).look}</p>
                  <p className={T_CAPTION}>
                    {row.request_no || "-"} · {row.requested_by || "-"}
                    {row.store_code ? ` · ${row.store_code}` : ""}
                    {row.request_date ? ` · ${String(row.request_date).slice(0, 10)}` : ""}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void review(row.id, "REVIEWED")}
                    disabled={busyId === row.id + "REVIEWED"}
                    className={`${SMALL_BUTTON} flex items-center gap-1.5`}
                  >
                    {busyId === row.id + "REVIEWED" ? "…" : "Mark Reviewed"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void review(row.id, "CLOSED")}
                    disabled={busyId === row.id + "CLOSED"}
                    className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-60"
                  >
                    {busyId === row.id + "CLOSED" ? "…" : "Close"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reviewed / Closed */}
      {other.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600">Reviewed / Closed</p>
          {other.map((row) => (
            <div key={row.id} className="rounded-2xl border border-white/8 bg-white/4 p-4">
              <div className="flex flex-wrap items-center gap-2">
                {severityBadge(row.severity)}
                {statusBadge(row.status)}
                <span className="text-sm text-zinc-300">{explain(row, city).title}</span>
                <span className={T_CAPTION}>{row.request_no || "-"} · {row.requested_by || "-"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
