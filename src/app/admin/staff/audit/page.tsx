// src/app/admin/staff/audit/page.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Download, ScrollText } from "lucide-react";
import { canAccessRoleManagement, getAuth } from "@/lib/auth";
import { fmtNum } from "@/lib/formatters";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_WARNING,
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SELECT_CLASS,
  SECONDARY_BUTTON,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW,
} from "@/lib/ui-tokens";
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  const text = await res.text();

  if (!res.ok) {
    try {
      const j = JSON.parse(text);
      throw new Error(j?.detail || text || `GET ${path} failed`);
    } catch {
      throw new Error(text || `GET ${path} failed`);
    }
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
}

type AuditRow = {
  id: number;
  event_type: string;
  target_staff_name: string;
  city: string;
  branch_code: string;
  actor_name: string;
  actor_role: string;
  payload: Record<string, any>;
  created_at?: string | null;
};

type AuditResp = {
  ok: boolean;
  rows: AuditRow[];
};

const EVENT_OPTIONS = [
  "",
  "staff_created",
  "setup_code_reissued",
  "setup_completed",
  "role_changed",
] as const;

function eventBadgeClass(eventType: string) {
  const e = (eventType || "").trim();

  if (e === "staff_created") {
    return BADGE_INFO;
  }
  if (e === "setup_code_reissued") {
    return BADGE_WARNING;
  }
  if (e === "setup_completed") {
    return "inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-0.5 text-xs font-medium text-emerald-400";
  }
  if (e === "role_changed") {
    return BADGE_ERROR;
  }

  return "border-neutral-800 bg-neutral-950/40 text-neutral-200";
}

function renderAuditPayload(eventType: string, payload: Record<string, any>) {
  const p = payload || {};

  if (eventType === "staff_created") {
    return (
      <div className="space-y-1 text-xs text-neutral-300">
        <div>role: <span className="text-neutral-100">{String(p.role ?? "-")}</span></div>
        <div>status: <span className="text-neutral-100">{String(p.status ?? "-")}</span></div>
        <div>setup_required: <span className="text-neutral-100">{String(p.setup_required ?? "-")}</span></div>
      </div>
    );
  }

  if (eventType === "setup_code_reissued") {
    return (
      <div className="space-y-1 text-xs text-neutral-300">
        <div>expires_at: <span className="text-neutral-100">{String(p.setup_code_expires_at ?? "-")}</span></div>
      </div>
    );
  }

  if (eventType === "setup_completed") {
    return (
      <div className="space-y-1 text-xs text-neutral-300">
        <div>setup_completed: <span className="text-neutral-100">{String(p.setup_completed ?? "-")}</span></div>
        <div>pin_set: <span className="text-neutral-100">{String(p.pin_set ?? "-")}</span></div>
      </div>
    );
  }

  if (eventType === "role_changed") {
    return (
      <div className="space-y-1 text-xs text-neutral-300">
        <div>new_role: <span className="text-neutral-100">{String(p.new_role ?? "-")}</span></div>
      </div>
    );
  }

  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 text-[11px] text-neutral-300">
      {JSON.stringify(payload || {}, null, 2)}
    </pre>
  );
}

function StaffAuditPageInner() {
  const auth = getAuth();
  const canOpenRoleManagement = canAccessRoleManagement(auth);
  const searchParams = useSearchParams();

  const [city, setCity] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [eventType, setEventType] = useState("");
  const [targetStaffName, setTargetStaffName] = useState("");
  const [limit, setLimit] = useState(200);

  const [approverName, setApproverName] = useState(auth?.staffName || "");
  const [pin, setPin] = useState(auth?.pin || "");

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const stats = {
    total: rows.length,
    staffCreated: rows.filter((r) => r.event_type === "staff_created").length,
    setupReissued: rows.filter((r) => r.event_type === "setup_code_reissued").length,
    setupCompleted: rows.filter((r) => r.event_type === "setup_completed").length,
    roleChanged: rows.filter((r) => r.event_type === "role_changed").length,
  };

  async function load() {
    setLoading(true);
    setError("");

    try {
      const q = new URLSearchParams({
        city,
        branch_code: branchCode,
        event_type: eventType,
        target_staff_name: targetStaffName,
        limit: String(limit),
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });

      const res = await apiGet<AuditResp>(`/api/admin/staff/audit_logs?${q.toString()}`);
      setRows(res.rows || []);
    } catch (e: any) {
      setRows([]);
      setError(String(e?.message || e || "Failed to load audit logs"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const qsEventType = (searchParams.get("event_type") || "").trim();
    const qsTargetStaff = (searchParams.get("target_staff_name") || "").trim();

    if (qsEventType) setEventType(qsEventType);
    if (qsTargetStaff) setTargetStaffName(qsTargetStaff);
  }, [searchParams]);

  useEffect(() => {
    if (approverName.trim() && pin.trim()) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-white/2">
            <ScrollText className="h-5 w-5 text-zinc-400" />
          </div>
          <div>
            <h1 className={T_PAGE_TITLE}>Audit Logs</h1>
            <p className={T_CAPTION}>HQ / ADMIN visibility for staff creation, setup, and role changes.</p>
          </div>
        </div>

        <div className={GLASS_CARD + " p-5"}>
          <p className={T_BODY + " mb-6"}>Filter staff audit events by scope, person, and event type.</p>

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-6">
            <div>
              <div className={T_LABEL + " mb-1.5"}>City</div>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={INPUT_CLASS}
                placeholder="dubai / manila"
              />
            </div>

            <div>
              <div className={T_LABEL + " mb-1.5"}>Branch</div>
              <input
                value={branchCode}
                onChange={(e) => setBranchCode(e.target.value)}
                className={INPUT_CLASS}
                placeholder="BB / JLT / ..."
              />
            </div>

            <div>
              <div className={T_LABEL + " mb-1.5"}>Event Type</div>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className={SELECT_CLASS}
              >
                {EVENT_OPTIONS.map((x) => (
                  <option key={x || "ALL"} value={x}>
                    {x || "ALL"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className={T_LABEL + " mb-1.5"}>Target Staff</div>
              <input
                value={targetStaffName}
                onChange={(e) => setTargetStaffName(e.target.value)}
                className={INPUT_CLASS}
                placeholder="Search name"
              />
            </div>

            <div>
              <div className={T_LABEL + " mb-1.5"}>Approver Name</div>
              <input
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <div className={T_LABEL + " mb-1.5"}>PIN</div>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className={T_LABEL + " mb-1.5"}>Limit</div>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className={INPUT_CLASS}
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={load}
                disabled={loading || !approverName.trim() || !pin.trim()}
                className={PRIMARY_BUTTON + " w-full"}
              >
                {loading ? "Loading..." : "Refresh Audit Logs"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className={GLASS_CARD + " p-4"}>
              <div className={T_CAPTION}>Total</div>
              <div className="mt-1 text-2xl font-bold">{fmtNum(stats.total)}</div>
            </div>

            <div className={GLASS_CARD + " p-4"}>
              <div className={T_CAPTION}>Staff Created</div>
              <div className="mt-1 text-2xl font-bold text-sky-200">{fmtNum(stats.staffCreated)}</div>
            </div>

            <div className={GLASS_CARD + " p-4"}>
              <div className={T_CAPTION}>Code Reissued</div>
              <div className="mt-1 text-2xl font-bold text-amber-200">{fmtNum(stats.setupReissued)}</div>
            </div>

            <div className={GLASS_CARD + " p-4"}>
              <div className={T_CAPTION}>Setup Completed</div>
              <div className="mt-1 text-2xl font-bold text-emerald-200">{fmtNum(stats.setupCompleted)}</div>
            </div>

            <div className={GLASS_CARD + " p-4"}>
              <div className={T_CAPTION}>Role Changed</div>
              <div className="mt-1 text-2xl font-bold text-fuchsia-200">{fmtNum(stats.roleChanged)}</div>
            </div>
          </div>

          <div className={GLASS_CARD + " overflow-hidden"}>
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <div className="flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-zinc-400" />
                <h2 className="text-lg font-semibold text-white">Audit Table</h2>
              </div>
              <button className={SECONDARY_BUTTON + " flex items-center gap-2 text-sm"}>
                <Download className="h-3.5 w-3.5" />
                Export
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead className="bg-white/3">
                  <tr>
                    {["When", "Event", "Target Staff", "Branch", "Actor", "Details"].map((col) => (
                      <th key={col} className={TABLE_HEADER + " px-4 py-3 text-left"}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm text-neutral-500">
                        No audit logs found.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className={TABLE_ROW}>
                        <td className={TABLE_CELL + " px-4 text-neutral-400"}>{row.created_at || "-"}</td>
                        <td className={TABLE_CELL + " px-4"}>
                          <span className={eventBadgeClass(row.event_type)}>{row.event_type}</span>
                        </td>
                        <td className={TABLE_CELL + " px-4"}>
                          {canOpenRoleManagement ? (
                            <a
                              href={`/admin/staff/roles?staff_name=${encodeURIComponent(row.target_staff_name)}`}
                              className="font-medium text-amber-200 underline-offset-2 hover:text-amber-100 hover:underline"
                            >
                              {row.target_staff_name}
                            </a>
                          ) : (
                            <span className="font-medium text-white">{row.target_staff_name}</span>
                          )}
                        </td>
                        <td className={TABLE_CELL + " px-4 text-neutral-400"}>
                          {row.city || "-"} {row.branch_code ? `• ${row.branch_code}` : ""}
                        </td>
                        <td className={TABLE_CELL + " px-4 text-neutral-400"}>
                          {row.actor_name || "-"}
                          {row.actor_role ? ` (${row.actor_role})` : ""}
                        </td>
                        <td className={TABLE_CELL + " px-4 text-neutral-400"}>
                          <div className="space-y-2">
                            {renderAuditPayload(row.event_type, row.payload || {})}

                            <div className="flex flex-wrap gap-2">
                              <a href="/admin/staff" className={SECONDARY_BUTTON + " px-2.5 py-1 text-[11px]"}>
                                Staff Master
                              </a>
                              {canOpenRoleManagement ? (
                                <a
                                  href={`/admin/staff/roles?staff_name=${encodeURIComponent(row.target_staff_name)}`}
                                  className={SECONDARY_BUTTON + " px-2.5 py-1 text-[11px]"}
                                >
                                  Role
                                </a>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3 text-sm text-neutral-400 sm:flex-row sm:justify-between">
            <Link href="/admin/staff/onboarding" className="hover:text-white">
              ← Back to Onboarding Dashboard
            </Link>
            <Link href="/admin/staff" className="hover:text-white">
              Go to Staff Master
            </Link>
          </div>
        </div>
    </motion.div>
  );
}

export default function StaffAuditPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-950 text-white" />}>
      <StaffAuditPageInner />
    </Suspense>
  );
}