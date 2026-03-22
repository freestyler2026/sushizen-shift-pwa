// src/app/admin/staff/roles/page.tsx
"use client";

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

type VerifyResp = {
  ok: boolean;
  staff_name: string;
  role: "STAFF" | "MANAGER" | "HQ" | "ADMIN" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT";
};

type ChangeRoleResp = {
  ok: boolean;
  staff_name: string;
  city: string;
  branch_code: string;
  role: "STAFF" | "MANAGER" | "HQ" | "ADMIN" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT";
  status: string;
  setup_required: boolean;
  setup_completed: boolean;
  changed_by: string;
};

type StaffOneResp = {
  ok: boolean;
  row: {
    display_name: string;
    city: string;
    home_branch: string;
    role: "STAFF" | "MANAGER" | "HQ" | "ADMIN" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT" | string;
    status: string;
    setup_required: boolean;
    setup_completed: boolean;
  };
};

function StaffRolesPageInner() {
  const auth = getAuth();
  const searchParams = useSearchParams();

  const [targetStaffName, setTargetStaffName] = useState("");
  const [newRole, setNewRole] = useState<
    "STAFF" | "MANAGER" | "HQ" | "ADMIN" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT"
  >("STAFF");

  const [approverName, setApproverName] = useState(auth?.staffName || "");
  const [pin, setPin] = useState(auth?.pin || "");
  const [myRole, setMyRole] = useState<
    "STAFF" | "MANAGER" | "HQ" | "ADMIN" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT" | ""
  >("");

  const [currentRole, setCurrentRole] = useState("");
  const [currentStatus, setCurrentStatus] = useState("");
  const [currentBranch, setCurrentBranch] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ChangeRoleResp | null>(null);

  useEffect(() => {
    const qsStaffName = (searchParams.get("staff_name") || "").trim();
    if (qsStaffName) {
      setTargetStaffName(qsStaffName);
    }
  }, [searchParams]);

  useEffect(() => {
    const run = async () => {
      const nm = approverName.trim();
      const p = pin.trim();
      if (!nm || !p) {
        setMyRole("");
        return;
      }

      try {
        const r = await apiPost<VerifyResp>(
          `/api/auth/verify?staff_name=${encodeURIComponent(nm)}&pin=${encodeURIComponent(p)}`
        );
        if (r?.ok) setMyRole(r.role || "");
        else setMyRole("");
      } catch {
        setMyRole("");
      }
    };

    run();
  }, [approverName, pin]);

  async function loadTargetStaff() {
    const staff = targetStaffName.trim();
    const approver = approverName.trim();
    const currentPin = pin.trim();

    if (!staff || !approver || !currentPin) {
      setCurrentRole("");
      setCurrentStatus("");
      setCurrentBranch("");
      return;
    }

    try {
      const q = new URLSearchParams({
        display_name: staff,
        approver_name: approver,
        pin: currentPin,
      });

      const res = await apiGet<StaffOneResp>(`/api/admin/staff/one?${q.toString()}`);
      setCurrentRole(res.row?.role || "");
      setCurrentStatus(res.row?.status || "");
      setCurrentBranch(res.row?.home_branch || "");
    } catch {
      setCurrentRole("");
      setCurrentStatus("");
      setCurrentBranch("");
    }
  }

  useEffect(() => {
    if (targetStaffName.trim() && approverName.trim() && pin.trim()) {
      loadTargetStaff();
    } else {
      setCurrentRole("");
      setCurrentStatus("");
      setCurrentBranch("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetStaffName, approverName, pin]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await apiPost<ChangeRoleResp>("/api/admin/staff/change_role", {
        target_staff_name: targetStaffName.trim(),
        new_role: newRole,
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });
      setResult(res);
      setCurrentRole(res.role || "");
      setCurrentStatus(res.status || "");
      setCurrentBranch(res.branch_code || currentBranch);
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to change role"));
    } finally {
      setLoading(false);
    }
  }

  const isHq = myRole === "HQ";

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-10">
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-8 shadow-2xl">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-neutral-800 bg-black">
              <img
                src={LOGO_SRC}
                alt="Sushi ZEN logo"
                className="h-full w-full object-contain"
              />
            </div>

            <h1 className="mt-5 text-2xl font-bold">Staff Role Management</h1>
            <p className="mt-2 text-sm text-neutral-400">
              HQ only. Change staff roles, including ADMIN assignment.
            </p>

            <div className="mt-3 text-xs text-neutral-500">
              Verified role: <span className="text-neutral-200">{myRole || "—"}</span>
            </div>
          </div>

          {!isHq ? (
            <div className="mt-6 rounded-2xl border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
              Only HQ can change staff roles. Enter your HQ credentials to continue.
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <div className="mb-1 text-xs text-neutral-400">Target Staff Name</div>
              <input
                value={targetStaffName}
                onChange={(e) => setTargetStaffName(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none"
                placeholder="Enter target staff full name"
              />
              <div className="mt-2 text-[11px] text-neutral-500">
                When opened from Staff Master, this field is filled automatically.
              </div>

              {currentRole ? (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-3">
                    <div className="text-[11px] text-neutral-500">Current Role</div>
                    <div className="mt-1 text-sm font-semibold text-neutral-100">{currentRole}</div>
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-3">
                    <div className="text-[11px] text-neutral-500">Branch</div>
                    <div className="mt-1 text-sm text-neutral-100">{currentBranch || "-"}</div>
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-3">
                    <div className="text-[11px] text-neutral-500">Status</div>
                    <div className="mt-1 text-sm text-neutral-100">{currentStatus || "-"}</div>
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">New Role</div>
              <select
                value={newRole}
                onChange={(e) =>
                  setNewRole(
                    e.target.value as
                      | "STAFF"
                      | "MANAGER"
                      | "HQ"
                      | "ADMIN"
                      | "DUBAI_MANAGEMENT"
                      | "MANILA_MANAGEMENT"
                  )
                }
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
              >
                <option value="STAFF">STAFF</option>
                <option value="MANAGER">MANAGER</option>
                <option value="HQ">HQ</option>
                <option value="ADMIN">ADMIN</option>
                <option value="DUBAI_MANAGEMENT">DUBAI_MANAGEMENT</option>
                <option value="MANILA_MANAGEMENT">MANILA_MANAGEMENT</option>
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Approver Name</div>
              <input
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none"
                placeholder="Your name"
              />
            </div>

            <div className="md:col-span-2">
              <div className="mb-1 text-xs text-neutral-400">HQ PIN</div>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none"
                placeholder="Your HQ PIN"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={
                  loading ||
                  !isHq ||
                  !targetStaffName.trim() ||
                  !approverName.trim() ||
                  !pin.trim()
                }
                className="flex w-full items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
              >
                {loading ? "Updating Role..." : "Change Role"}
              </button>
            </div>
          </form>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          {result?.ok ? (
            <div className="mt-4 rounded-2xl border border-emerald-900/50 bg-emerald-950/20 p-4">
              <div className="text-sm font-semibold text-emerald-200">
                Role updated successfully
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="text-[11px] text-neutral-500">Staff</div>
                  <div className="mt-1 text-sm text-neutral-100">{result.staff_name}</div>
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="text-[11px] text-neutral-500">New Role</div>
                  <div className="mt-1 text-sm font-bold text-neutral-100">{result.role}</div>
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="text-[11px] text-neutral-500">Changed By</div>
                  <div className="mt-1 text-sm text-neutral-100">{result.changed_by}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href={`/admin/staff/audit?event_type=role_changed&target_staff_name=${encodeURIComponent(result.staff_name)}`}
                  className="rounded-2xl border border-fuchsia-900/40 bg-fuchsia-950/10 px-4 py-3 text-sm font-semibold text-fuchsia-200 transition hover:bg-fuchsia-950/20"
                >
                  View Audit Logs
                </Link>

                <Link
                  href="/admin/staff"
                  className="rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-900"
                >
                  Open Staff Master
                </Link>
              </div>

              <div className="mt-3 text-xs text-neutral-400">
                Next step: review the role change in <span className="text-neutral-200">Audit Logs</span> or continue editing in <span className="text-neutral-200">Staff Master</span>.
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex flex-col items-center gap-3 text-sm text-neutral-400 sm:flex-row sm:justify-between">
            <Link href="/admin/staff" className="hover:text-white">
              ← Back to Staff Master
            </Link>
            <Link href="/login" className="hover:text-white">
              Go to Log In
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function StaffRolesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-950 text-white" />}>
      <StaffRolesPageInner />
    </Suspense>
  );
}