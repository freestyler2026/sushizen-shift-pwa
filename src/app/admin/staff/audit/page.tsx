// src/app/admin/staff/audit/page.tsx
"use client";

import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getAuth } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
const LOGO_SRC = "/logo.png";

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
    return "border-sky-900/50 bg-sky-950/20 text-sky-200";
  }
  if (e === "setup_code_reissued") {
    return "border-amber-900/50 bg-amber-950/20 text-amber-200";
  }
  if (e === "setup_completed") {
    return "border-emerald-900/50 bg-emerald-950/20 text-emerald-200";
  }
  if (e === "role_changed") {
    return "border-fuchsia-900/50 bg-fuchsia-950/20 text-fuchsia-200";
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
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-10">
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-8 shadow-2xl">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-neutral-800 bg-black">
              <Image
                src={LOGO_SRC}
                alt="Sushi ZEN logo"
                width={80}
                height={80}
                className="h-full w-full object-contain"
              />
            </div>

            <h1 className="mt-5 text-2xl font-bold">Staff Audit Logs</h1>
            <p className="mt-2 text-sm text-neutral-400">
              HQ / ADMIN visibility for staff creation, setup, and role changes.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-6">
            <div>
              <div className="mb-1 text-xs text-neutral-400">City</div>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                placeholder="dubai / manila"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Branch</div>
              <input
                value={branchCode}
                onChange={(e) => setBranchCode(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                placeholder="BB / JLT / ..."
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Event Type</div>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
              >
                {EVENT_OPTIONS.map((x) => (
                  <option key={x || "ALL"} value={x}>
                    {x || "ALL"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Target Staff</div>
              <input
                value={targetStaffName}
                onChange={(e) => setTargetStaffName(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                placeholder="Search name"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Approver Name</div>
              <input
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">PIN</div>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs text-neutral-400">Limit</div>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={load}
                disabled={loading || !approverName.trim() || !pin.trim()}
                className="w-full rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
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
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="text-xs text-neutral-500">Total</div>
              <div className="mt-1 text-2xl font-bold">{stats.total}</div>
            </div>

            <div className="rounded-2xl border border-sky-900/40 bg-sky-950/10 p-4">
              <div className="text-xs text-neutral-500">Staff Created</div>
              <div className="mt-1 text-2xl font-bold text-sky-200">{stats.staffCreated}</div>
            </div>

            <div className="rounded-2xl border border-amber-900/40 bg-amber-950/10 p-4">
              <div className="text-xs text-neutral-500">Code Reissued</div>
              <div className="mt-1 text-2xl font-bold text-amber-200">{stats.setupReissued}</div>
            </div>

            <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/10 p-4">
              <div className="text-xs text-neutral-500">Setup Completed</div>
              <div className="mt-1 text-2xl font-bold text-emerald-200">{stats.setupCompleted}</div>
            </div>

            <div className="rounded-2xl border border-fuchsia-900/40 bg-fuchsia-950/10 p-4">
              <div className="text-xs text-neutral-500">Role Changed</div>
              <div className="mt-1 text-2xl font-bold text-fuchsia-200">{stats.roleChanged}</div>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-800">
            <div className="grid grid-cols-1 border-b border-neutral-800 bg-neutral-950/80 px-4 py-3 text-xs font-semibold text-neutral-300 md:grid-cols-6">
              <div>When</div>
              <div>Event</div>
              <div>Target Staff</div>
              <div>Branch</div>
              <div>Actor</div>
              <div>Details</div>
            </div>

            {rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-neutral-500">
                No audit logs found.
              </div>
            ) : (
              rows.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-1 gap-3 border-b border-neutral-800 bg-neutral-900/20 px-4 py-4 text-sm transition hover:bg-neutral-900/40 md:grid-cols-6 md:items-start"
                >
                  <div className="text-neutral-400">{row.created_at || "-"}</div>
                  <div>
                    <span
                      className={[
                        "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
                        eventBadgeClass(row.event_type),
                      ].join(" ")}
  >
                      {row.event_type}
                    </span>
                  </div>
                  <div>
                    <a
                      href={`/admin/staff/roles?staff_name=${encodeURIComponent(row.target_staff_name)}`}
                      className="font-medium text-amber-200 hover:text-amber-100 underline-offset-2 hover:underline"
  >
                      {row.target_staff_name}
                    </a>
                  </div>
                  <div className="text-neutral-400">
                    {row.city || "-"} {row.branch_code ? `• ${row.branch_code}` : ""}
                  </div>
                  <div className="text-neutral-400">
                    {row.actor_name || "-"}
                    {row.actor_role ? ` (${row.actor_role})` : ""}
                  </div>
                  <div className="text-neutral-400">
                    <div className="space-y-2">
                      {renderAuditPayload(row.event_type, row.payload || {})}

                      <div className="flex flex-wrap gap-2">
                        <a
                          href="/admin/staff"
                          className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-2.5 py-1 text-[11px] text-neutral-300 hover:bg-neutral-900"
                        >
                          Staff Master
                        </a>

                        <a
                          href={`/admin/staff/roles?staff_name=${encodeURIComponent(row.target_staff_name)}`}
                          className="rounded-lg border border-amber-900/40 bg-amber-950/10 px-2.5 py-1 text-[11px] text-amber-200 hover:bg-amber-950/20"
                        >
                          Role
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
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
      </div>
    </main>
  );
}

export default function StaffAuditPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-950 text-white" />}>
      <StaffAuditPageInner />
    </Suspense>
  );
}