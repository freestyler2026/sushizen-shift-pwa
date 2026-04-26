"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";

type CaseRow = {
  id: string;
  parent_case_no: string;
  request_no: string;
  requested_by: string;
  store_code: string;
  total_amount: number;
  severity: string;
  status: string;
  current_assignee_role: string;
  claimed_by: string;
  document_status: string;
  po_status: string;
  blocked_reason?: string;
  notification_status?: string;
  notification_failed_count?: number;
};

export default function ProcurementApprovalInboxPage() {
  const auth = getAuth();
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await procurementJson<{ rows: CaseRow[] }>(
        "/api/admin/procurement/cases?limit=200",
        { method: "GET" },
        requestedBy,
        pin,
      );
      const CLOSED_STATUSES = ["REJECTED", "APPROVED", "RETURNED"];
      setRows(
        Array.isArray(data?.rows)
          ? data.rows.filter((r) => !CLOSED_STATUSES.includes((r.status || "").toUpperCase()))
          : [],
      );
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [pin, requestedBy]);

  const claim = async (caseId: string) => {
    setBusyId(caseId);
    setError("");
    try {
      await procurementJson(
        `/api/admin/procurement/cases/${caseId}/claim`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            case_id: caseId,
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
      const can = canAccessProcurementAdmin(
        String((refreshed || auth)?.role || ""),
        String((refreshed || auth)?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila",
      );
      setAllowed(can);
      if (can) await load();
    }
    void init();
  }, [auth, load]);

  if (!allowed) {
    return <div className="text-sm text-red-300">Procurement page is available only to authorized Manila admin roles.</div>;
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
          <div
            key={row.id}
            className={`rounded-2xl border p-4 ${
              Number(row.notification_failed_count || 0) > 0
                ? "border-rose-700/80 bg-rose-950/20"
                : "border-neutral-800 bg-neutral-900/20"
            }`}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-base font-medium text-neutral-100">{row.parent_case_no || row.request_no}</div>
                <div className="mt-1 text-sm text-neutral-400">
                  {row.requested_by} | {row.store_code || "-"} | {row.severity} | {row.status}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  Assignee Role: {row.current_assignee_role || "-"} | Claimed By: {row.claimed_by || "-"} | Docs: {row.document_status || "-"} | PO: {row.po_status || "-"}
                </div>
                {Number(row.notification_failed_count || 0) > 0 ? (
                  <div className="mt-2 rounded-lg border border-rose-700/70 bg-rose-900/30 px-2 py-1 text-xs text-rose-200">
                    Notification Failed ({Number(row.notification_failed_count || 0)}) {row.blocked_reason ? `| ${row.blocked_reason}` : ""}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {Number(row.notification_failed_count || 0) > 0 ? (
                  <div className="rounded-xl border border-rose-700/70 bg-rose-900/30 px-3 py-2 text-xs text-rose-200">
                    Push Failed
                  </div>
                ) : null}
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-200">
                  {Number(row.total_amount || 0).toFixed(2)} PHP
                </div>
                <button
                  type="button"
                  onClick={() => void claim(row.id)}
                  disabled={busyId === row.id}
                  className="rounded-xl border border-sky-700/60 bg-sky-900/20 px-3 py-2 text-xs text-sky-200 hover:bg-sky-800/30 disabled:opacity-60"
                >
                  {busyId === row.id ? "Claiming..." : "Claim"}
                </button>
                <Link href={`/admin/procurement/cases/${row.id}`} className="rounded-xl border border-amber-700/60 bg-amber-900/20 px-3 py-2 text-xs text-amber-200 hover:bg-amber-800/30">
                  Open Case
                </Link>
              </div>
            </div>
          </div>
        ))}
        {!rows.length ? <div className="text-sm text-neutral-500">No approval cases.</div> : null}
      </div>
    </div>
  );
}
