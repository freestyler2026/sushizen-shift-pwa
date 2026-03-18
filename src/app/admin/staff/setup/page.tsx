// src/app/admin/staff/setup/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { BRANCHES, type BranchCode, type City as BranchCity } from "@/lib/branches";

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

async function apiPost<T = any>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();

  if (!res.ok) {
    try {
      const j = JSON.parse(text);
      throw new Error(j?.detail || text || `POST ${path} failed`);
    } catch {
      throw new Error(text || `POST ${path} failed`);
    }
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
}

type PendingRow = {
  display_name: string;
  home_branch: string;
  setup_required: boolean;
  setup_completed: boolean;
  setup_code_expires_at?: string | null;
};

type PendingResp = {
  ok: boolean;
  rows: PendingRow[];
};

type ResendResp = {
  ok: boolean;
  display_name: string;
  setup_code: string;
  expires_at: string;
};

function setupStatusBadgeClass(setupRequired: boolean, setupCompleted: boolean) {
  if (setupCompleted) {
    return "border-emerald-900/40 bg-emerald-950/10 text-emerald-200";
  }
  if (setupRequired) {
    return "border-amber-900/40 bg-amber-950/10 text-amber-200";
  }
  return "border-neutral-800 bg-neutral-950/40 text-neutral-200";
}

function setupStatusText(setupRequired: boolean, setupCompleted: boolean) {
  if (setupCompleted) return "Completed";
  if (setupRequired) return "Pending";
  return "N/A";
}

export default function StaffSetupPage() {
  const auth = getAuth();

  const [city] = useState<BranchCity>((auth?.city as BranchCity) || "dubai");
  const [branch, setBranch] = useState<BranchCode>(
    (auth?.city === "manila" ? "PAR" : "BB") as BranchCode
  );

  const [approverName, setApproverName] = useState(auth?.staffName || "");
  const [pin, setPin] = useState(auth?.pin || "");

  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [latestSetupCode, setLatestSetupCode] = useState("");

  const pendingCount = useMemo(
    () => rows.filter((r) => Boolean(r.setup_required) && !Boolean(r.setup_completed)).length,
    [rows]
  );

  async function loadPending() {
    setLoading(true);
    setError("");
    setMessage("");
    setLatestSetupCode("");

    try {
      const query = new URLSearchParams({
        city,
        home_branch: branch,
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });

      const res = await apiGet<PendingResp>(
        `/api/store/staff/setup/pending?${query.toString()}`
      );
      setRows(res.rows || []);
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to load pending setup"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (approverName.trim() && pin.trim()) {
      loadPending();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resendCode(displayName: string) {
    setLoading(true);
    setError("");
    setMessage("");
    setLatestSetupCode("");

    try {
      const res = await apiPost<ResendResp>("/api/store/staff/setup/resend_code", {
        city,
        display_name: displayName,
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });

      await loadPending();

      setLatestSetupCode(res.setup_code || "");
      setMessage(
        `Setup code reissued for ${res.display_name}: ${res.setup_code} (expires: ${res.expires_at})`
      );
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to resend code"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-10">
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-8 shadow-2xl">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-neutral-800 bg-black">
              <img
                src={LOGO_SRC}
                alt="Sushi ZEN logo"
                className="h-full w-full object-contain"
              />
            </div>

            <h1 className="mt-5 text-2xl font-bold">Pending Staff Setup</h1>
            <p className="mt-2 text-sm text-neutral-400">
              For store managers. View staff who still need first-time PIN setup.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="text-xs text-neutral-500">Branch</div>
              <div className="mt-1 text-lg font-semibold text-neutral-100">{branch}</div>
            </div>

            <div className="rounded-2xl border border-amber-900/40 bg-amber-950/10 p-4">
              <div className="text-xs text-neutral-500">Pending</div>
              <div className="mt-1 text-lg font-semibold text-amber-200">{pendingCount}</div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 sm:col-span-1 col-span-2">
              <div className="text-xs text-neutral-500">Manager</div>
              <div className="mt-1 truncate text-lg font-semibold text-neutral-100">
                {approverName || "-"}
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <div className="mb-1 text-xs text-neutral-400">City</div>
              <input
                value={city}
                disabled
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm opacity-70"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Branch</div>
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value as BranchCode)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
              >
                {BRANCHES[city].map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Manager Name</div>
              <input
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Manager PIN</div>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={loadPending}
              disabled={loading || !approverName.trim() || !pin.trim()}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
            >
              {loading ? "Refreshing..." : "Refresh Pending Setup"}
            </button>

            <Link
              href="/admin/staff/create"
              className="rounded-2xl border border-neutral-700 bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-900"
            >
              Create Staff Record
            </Link>

            <Link
              href="/admin/staff/audit?event_type=setup_code_reissued"
              className="rounded-2xl border border-neutral-700 bg-neutral-950/40 px-5 py-3 text-sm font-semibold text-neutral-200 transition hover:bg-neutral-900"
            >
              View Reissue Logs
            </Link>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="mt-4 rounded-2xl border border-emerald-900/50 bg-emerald-950/20 p-4">
              <div className="text-sm text-emerald-200">{message}</div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(message)}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-neutral-900"
                >
                  Copy Message
                </button>

                {latestSetupCode ? (
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(latestSetupCode)}
                    className="rounded-xl border border-amber-700/50 bg-amber-950/20 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-950/30"
                  >
                    Copy Setup Code
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-800">
            <div className="grid grid-cols-1 border-b border-neutral-800 bg-neutral-950/80 px-4 py-3 text-xs font-semibold text-neutral-300 md:grid-cols-4">
              <div>Staff Name</div>
              <div>Branch</div>
              <div>Status</div>
              <div>Action</div>
            </div>

            {rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-neutral-500">
                No pending setup staff.
              </div>
            ) : (
              rows.map((row) => (
                <div
                  key={row.display_name}
                  className="grid grid-cols-1 gap-3 border-b border-neutral-800 bg-neutral-900/30 px-4 py-4 text-sm md:grid-cols-4 md:items-center"
                >
                  <div>
                    <Link
                      href={`/admin/staff/audit?target_staff_name=${encodeURIComponent(row.display_name)}`}
                      className="font-medium hover:text-white"
                    >
                      {row.display_name}
                    </Link>
                  </div>

                  <div>{row.home_branch}</div>

                  <div className="text-neutral-400">
                    <span
                      className={[
                        "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                        setupStatusBadgeClass(
                          Boolean(row.setup_required),
                          Boolean(row.setup_completed)
                        ),
                      ].join(" ")}
                    >
                      {setupStatusText(
                        Boolean(row.setup_required),
                        Boolean(row.setup_completed)
                      )}
                    </span>

                    {row.setup_code_expires_at ? (
                      <div className="mt-2 text-xs text-neutral-500">
                        Expires: {row.setup_code_expires_at}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => resendCode(row.display_name)}
                      disabled={loading}
                      className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold hover:bg-neutral-900 disabled:opacity-60"
                    >
                      Reissue Code
                    </button>

                    <Link
                      href={`/setup-pin?staff_name=${encodeURIComponent(row.display_name)}`}
                      className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black transition hover:bg-neutral-200"
                    >
                      Open Setup
                    </Link>

                    <Link
                      href={`/admin/staff/audit?target_staff_name=${encodeURIComponent(row.display_name)}`}
                      className="rounded-xl border border-neutral-700 bg-neutral-950/40 px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-900"
                    >
                      Audit
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-8 flex flex-col items-center gap-3 text-sm text-neutral-400 sm:flex-row sm:justify-between">
            <Link href="/signup" className="hover:text-white">
              ← Back
            </Link>
            <div className="flex flex-wrap gap-3">
              <Link href="/admin/staff/create" className="hover:text-white">
                Create another staff record
              </Link>
              <Link href="/admin/staff/audit" className="hover:text-white">
                View Audit Logs
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}