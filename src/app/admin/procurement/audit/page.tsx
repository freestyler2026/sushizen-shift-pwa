"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import {
  GLASS_CARD,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  T_PAGE_TITLE,
  T_CAPTION,
  T_LABEL,
  BADGE_INFO,
} from "@/lib/ui-tokens";
import { RefreshCw, AlertCircle, ScrollText } from "lucide-react";

type AuditRow = {
  id: number;
  request_id: string;
  case_id: string;
  actor_name: string;
  actor_role: string;
  action_key: string;
  reason_code: string;
  created_at: string;
};

function actionLabel(key: string) {
  return String(key || "-").replace(/\./g, " › ").replace(/_/g, " ");
}

export default function ProcurementAuditPage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [requestId, setRequestId] = useState("");
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const data = await procurementJson<{ rows: AuditRow[] }>(
        `/api/admin/procurement/audit-logs?request_id=${encodeURIComponent(requestId)}&limit=200`,
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
  }, [pin, requestId, requestedBy]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const initialRequestId = sp.get("request_id") || "";
    if (initialRequestId) setRequestId((prev) => prev || initialRequestId);
  }, []);

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const resolvedAuth = refreshed || auth;
      const can = canAccessProcurementAdmin(
        String(resolvedAuth?.role || ""),
        String(resolvedAuth?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila",
      );
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
        Procurement audit log is only available to authorized admin roles.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>Audit Log</h2>
          <p className="mt-1 text-sm text-zinc-400">Immutable record of all procurement actions.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-400">
          <ScrollText className="h-3 w-3" />{rows.length} entries
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* Session / Filter */}
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
            <label className={`${T_LABEL} mb-1.5 block`}>Request ID</label>
            <input value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder="Filter by request ID" className={INPUT_CLASS} />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className={`${SECONDARY_BUTTON} w-full flex items-center justify-center gap-2`}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Search"}
            </button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && !rows.length && (
        <div className={`${GLASS_CARD} p-10 flex items-center justify-center gap-3 text-zinc-500`}>
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading audit logs…</span>
        </div>
      )}

      {!loading && !rows.length && (
        <div className={`${GLASS_CARD} p-10 flex items-center justify-center`}>
          <p className={T_CAPTION}>No audit logs. Enter a Request ID and click Search.</p>
        </div>
      )}

      {/* Audit timeline */}
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="flex gap-3 rounded-2xl border border-white/8 bg-white/4 p-4">
            <div className="mt-0.5 shrink-0">
              <div className="h-2 w-2 rounded-full bg-violet-500 ring-2 ring-violet-500/20" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={BADGE_INFO}>{actionLabel(row.action_key)}</span>
                <span className="text-sm font-medium text-white">{row.actor_name}</span>
                <span className={T_CAPTION}>{row.actor_role}</span>
              </div>
              <p className={T_CAPTION}>
                {row.request_id ? `req: ${row.request_id.slice(0, 8)}…` : ""}
                {row.case_id ? ` · case: ${row.case_id.slice(0, 8)}…` : ""}
                {row.reason_code ? ` · reason: ${row.reason_code}` : ""}
              </p>
              <p className={T_CAPTION}>{String(row.created_at || "").slice(0, 16).replace("T", " ")}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
