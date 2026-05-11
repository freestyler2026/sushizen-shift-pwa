"use client";

import { useCallback, useEffect, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";

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

export default function ProcurementExceptionsPage() {
  const auth = getAuth();
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<"manila" | "dubai">(
    String(auth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila",
  );
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [rows, setRows] = useState<ExceptionRow[]>([]);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
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
    }
  }, [city, pin, requestedBy]);

  const review = async (eventId: string, status: "REVIEWED" | "CLOSED") => {
    setBusyId(eventId + status);
    setError("");
    try {
      await procurementJson(
        "/api/admin/procurement/exceptions/review",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: eventId,
            status,
            note: "",
            approver_name: requestedBy,
            pin,
          }),
        },
        requestedBy,
        pin,
      );
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
      const can = canAccessProcurementAdmin(
        String((refreshed || auth)?.role || ""),
        resolvedCity,
      );
      setAllowed(can);
      if (can) await load();
    }
    void init();
  }, [auth, load]);

  if (!allowed) {
    return <div className="text-sm text-red-300">Procurement page is available only to authorized admin roles.</div>;
  }

  return (
    <div className="space-y-4">
      {error ? <div className="text-sm text-red-300">{error}</div> : null}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3 md:grid-cols-3">
        <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Approver name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <button type="button" onClick={() => void load()} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900">
          Refresh
        </button>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm font-medium text-neutral-100">{row.rule_code}</div>
                <div className="mt-1 text-xs text-neutral-400">
                  {row.request_no} | {row.requested_by} | Severity {row.severity} | Score {Number(row.score || 0).toFixed(1)} | {row.status}
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => void review(row.id, "REVIEWED")} disabled={busyId === row.id + "REVIEWED"} className="rounded-xl border border-sky-700/60 bg-sky-900/20 px-3 py-2 text-xs text-sky-200 hover:bg-sky-800/30 disabled:opacity-60">
                  Review
                </button>
                <button type="button" onClick={() => void review(row.id, "CLOSED")} disabled={busyId === row.id + "CLOSED"} className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60">
                  Close
                </button>
              </div>
            </div>
          </div>
        ))}
        {!rows.length ? <div className="text-sm text-neutral-500">No exception events.</div> : null}
      </div>
    </div>
  );
}
