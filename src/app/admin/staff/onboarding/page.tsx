// src/app/admin/staff/onboarding/page.tsx
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Link from "next/link";
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

type DashboardRow = {
  display_name: string;
  city: string;
  branch_code: string;
  role: string;
  status: string;
  setup_required: boolean;
  setup_completed: boolean;
  setup_code_expires_at?: string | null;
  created_by?: string | null;
  created_by_role?: string | null;
  pin_set_at?: string | null;
  last_login_at?: string | null;
  updated_at?: string | null;
};

type DashboardResp = {
  ok: boolean;
  rows: DashboardRow[];
  summary: {
    total: number;
    pending_setup: number;
    completed_setup: number;
    active: number;
  };
};

export default function StaffOnboardingDashboardPage() {
  const auth = getAuth();

  const [city, setCity] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [limit, setLimit] = useState(500);

  const [approverName, setApproverName] = useState(auth?.staffName || "");
  const [pin, setPin] = useState(auth?.pin || "");

  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [summary, setSummary] = useState<DashboardResp["summary"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({
        city,
        branch_code: branchCode,
        limit: String(limit),
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });

      const res = await apiGet<DashboardResp>(
        `/api/admin/staff/onboarding_dashboard?${q.toString()}`
      );
      setRows(res.rows || []);
      setSummary(res.summary || null);
    } catch (e: any) {
      setRows([]);
      setSummary(null);
      setError(String(e?.message || e || "Failed to load dashboard"));
    } finally {
      setLoading(false);
    }
  }

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

            <h1 className="mt-5 text-2xl font-bold">Staff Onboarding Dashboard</h1>
            <p className="mt-2 text-sm text-neutral-400">
              HQ / ADMIN visibility for new staff creation and setup completion.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-5">
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
                placeholder="BB / PAR / ..."
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Limit</div>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
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

          <div className="mt-4">
            <button
              type="button"
              onClick={load}
              disabled={loading || !approverName.trim() || !pin.trim()}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
            >
              {loading ? "Loading..." : "Refresh Dashboard"}
            </button>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          {summary ? (
            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Total</div>
                <div className="mt-1 text-2xl font-bold">{summary.total}</div>
              </div>
              <div className="rounded-2xl border border-amber-900/40 bg-amber-950/10 p-4">
                <div className="text-xs text-neutral-500">Pending Setup</div>
                <div className="mt-1 text-2xl font-bold text-amber-200">
                  {summary.pending_setup}
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/10 p-4">
                <div className="text-xs text-neutral-500">Completed Setup</div>
                <div className="mt-1 text-2xl font-bold text-emerald-200">
                  {summary.completed_setup}
                </div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Active</div>
                <div className="mt-1 text-2xl font-bold">{summary.active}</div>
              </div>
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/admin/staff/audit?event_type=staff_created"
              className="rounded-2xl border border-sky-900/40 bg-sky-950/10 p-4 transition hover:bg-sky-950/20"
            >
              <div className="text-xs text-neutral-400">Audit</div>
              <div className="mt-1 text-sm font-semibold text-sky-200">
                View Staff Created Logs
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Review who created new staff records.
              </div>
            </Link>

            <Link
              href="/admin/staff/audit?event_type=setup_code_reissued"
              className="rounded-2xl border border-amber-900/40 bg-amber-950/10 p-4 transition hover:bg-amber-950/20"
            >
              <div className="text-xs text-neutral-400">Audit</div>
              <div className="mt-1 text-sm font-semibold text-amber-200">
                View Code Reissued Logs
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Review setup code reissue history.
              </div>
            </Link>

            <Link
              href="/admin/staff/audit?event_type=setup_completed"
              className="rounded-2xl border border-emerald-900/40 bg-emerald-950/10 p-4 transition hover:bg-emerald-950/20"
            >
              <div className="text-xs text-neutral-400">Audit</div>
              <div className="mt-1 text-sm font-semibold text-emerald-200">
                View Setup Completed Logs
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Review completed first-time PIN setups.
              </div>
            </Link>

            <Link
              href="/admin/staff/audit?event_type=role_changed"
              className="rounded-2xl border border-fuchsia-900/40 bg-fuchsia-950/10 p-4 transition hover:bg-fuchsia-950/20"
            >
              <div className="text-xs text-neutral-400">Audit</div>
              <div className="mt-1 text-sm font-semibold text-fuchsia-200">
                View Role Changed Logs
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Review HQ role change history.
              </div>
            </Link>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-800">
            <div className="grid grid-cols-1 border-b border-neutral-800 bg-neutral-950/80 px-4 py-3 text-xs font-semibold text-neutral-300 md:grid-cols-6">
              <div>Name</div>
              <div>Branch</div>
              <div>Role</div>
              <div>Setup</div>
              <div>Created By</div>
              <div>Last Activity</div>
            </div>

            {rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-neutral-500">
                No rows found.
              </div>
            ) : (
              rows.map((row) => (
                <div
                  key={`${row.city}-${row.display_name}`}
                  className="grid grid-cols-1 gap-3 border-b border-neutral-800 bg-neutral-900/30 px-4 py-4 text-sm md:grid-cols-6 md:items-start"
                >
                  <div>
                    <div className="font-medium">{row.display_name}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a
                        href={`/admin/staff/roles?staff_name=${encodeURIComponent(row.display_name)}`}
                        className="rounded-lg border border-amber-900/40 bg-amber-950/10 px-2.5 py-1 text-[11px] text-amber-200 hover:bg-amber-950/20"
                      >
                        Role
                      </a>

                      <a
                        href={`/admin/staff/audit?target_staff_name=${encodeURIComponent(row.display_name)}`}
                        className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-2.5 py-1 text-[11px] text-neutral-300 hover:bg-neutral-900"
                      >
                        Audit
                      </a>
                    </div>
                  </div>

                  <div>{row.branch_code}</div>

                  <div>{row.role}</div>

                  <div className="text-neutral-400">
                    {row.setup_completed ? "Completed" : row.setup_required ? "Pending" : "N/A"}
                    {row.setup_code_expires_at ? (
                      <div className="mt-1 text-xs text-neutral-500">
                        Expires: {row.setup_code_expires_at}
                      </div>
                    ) : null}
                  </div>

                  <div className="text-neutral-400">
                    {row.created_by || "-"}
                    {row.created_by_role ? ` (${row.created_by_role})` : ""}
                  </div>

                  <div className="text-neutral-400">
                    {row.last_login_at || row.pin_set_at || row.updated_at || "-"}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/admin/staff" className="text-sm text-neutral-400 hover:text-white">
              ← Back to Staff Master
            </Link>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin/staff/audit"
                className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
              >
                View Audit Logs
              </Link>

              <Link
                href="/signup"
                className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
              >
                Go to Sign Up
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}