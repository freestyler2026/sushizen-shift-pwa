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

type ExceptionRow = {
  id: string;
  case_id: string;
  request_no: string;
  rule_code: string;
  severity: string;
  score: number;
  status: string;
  requested_by: string;
};

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
      const refreshed = await refreshAuthFromApi(auth);
      const resolvedCity: "manila" | "dubai" =
        String((refreshed || auth)?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila";
      setCity(resolvedCity);
      const can = canAccessProcurementAdmin(String((refreshed || auth)?.role || ""), resolvedCity);
      setAllowed(can);
      if (can) await load();
    }
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <select
              value={city}
              onChange={(e) => setCity(e.target.value === "dubai" ? "dubai" : "manila")}
              className={SELECT_CLASS}
            >
              <option value="manila">Manila</option>
              <option value="dubai">Dubai</option>
            </select>
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
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {severityBadge(row.severity)}
                    {statusBadge(row.status)}
                    <span className="font-mono text-sm font-semibold text-white">{row.rule_code}</span>
                  </div>
                  <p className={T_CAPTION}>
                    {row.request_no || "-"} · {row.requested_by || "-"} · Score {Number(row.score || 0).toFixed(1)}
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
                <span className="font-mono text-sm text-zinc-300">{row.rule_code}</span>
                <span className={T_CAPTION}>{row.request_no || "-"} · Score {Number(row.score || 0).toFixed(1)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
