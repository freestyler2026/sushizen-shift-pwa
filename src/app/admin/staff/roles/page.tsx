// src/app/admin/staff/roles/page.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, ShieldCheck, Users } from "lucide-react";
import { getAuth } from "@/lib/auth";
import {
  BADGE_INFO,
  BADGE_SUCCESS,
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
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
  role: "STAFF" | "MANAGER" | "MANAGEMENT" | "HQ" | "ADMIN" | "HR_MANAGER" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT";
};

type ChangeRoleResp = {
  ok: boolean;
  staff_name: string;
  city: string;
  branch_code: string;
  role: "STAFF" | "MANAGER" | "MANAGEMENT" | "HQ" | "ADMIN" | "HR_MANAGER" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT";
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
    role: "STAFF" | "MANAGER" | "MANAGEMENT" | "HQ" | "ADMIN" | "HR_MANAGER" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT" | string;
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
    "STAFF" | "MANAGER" | "MANAGEMENT" | "HQ" | "ADMIN" | "HR_MANAGER" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT"
  >("STAFF");

  const [approverName, setApproverName] = useState(auth?.staffName || "");
  const [pin, setPin] = useState(auth?.pin || "");
  const [myRole, setMyRole] = useState<
    "STAFF" | "MANAGER" | "MANAGEMENT" | "HQ" | "ADMIN" | "HR_MANAGER" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT" | ""
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
  const isAdmin = myRole === "ADMIN";
  const canSubmitByRole =
    isHq || (isAdmin && (newRole === "STAFF" || newRole === "MANAGER"));

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-400/12 to-orange-400/6">
            <ShieldCheck className="h-5 w-5 text-amber-300" />
          </div>
          <div>
            <h1 className={T_PAGE_TITLE}>Role Management</h1>
            <p className={T_CAPTION}>HQ only. Change staff roles, including ADMIN assignment.</p>
          </div>
        </div>

        <div className={GLASS_CARD + " p-5"}>
          <div className="mb-2 flex items-center gap-2">
            <Users className="h-4 w-4 text-violet-400" />
            <h2 className={T_SECTION}>Verified Access</h2>
          </div>
          <p className={T_BODY}>Current approver permissions are checked from the current session and PIN verification.</p>
          <div className="mt-3">
            <span className={BADGE_INFO}>Verified role: {myRole || "—"}</span>
          </div>

          {!canSubmitByRole ? (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2.5">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-400" />
              <p className="text-sm text-amber-300">
              HQ can assign any role. ADMIN can assign up to MANAGER.
              </p>
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <div className={T_LABEL + " mb-1.5"}>Target Staff Name</div>
              <input
                value={targetStaffName}
                onChange={(e) => setTargetStaffName(e.target.value)}
                className={INPUT_CLASS}
                placeholder="Enter target staff full name"
              />
              <div className={T_CAPTION + " mt-2"}>
                When opened from Staff Master, this field is filled automatically.
              </div>

              {currentRole ? (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className={GLASS_CARD + " p-3"}>
                    <div className={T_CAPTION}>Current Role</div>
                    <div className="mt-1 text-sm font-semibold text-neutral-100">{currentRole}</div>
                  </div>

                  <div className={GLASS_CARD + " p-3"}>
                    <div className={T_CAPTION}>Branch</div>
                    <div className="mt-1 text-sm text-neutral-100">{currentBranch || "-"}</div>
                  </div>

                  <div className={GLASS_CARD + " p-3"}>
                    <div className={T_CAPTION}>Status</div>
                    <div className="mt-1 text-sm text-neutral-100">
                      <span className={currentStatus === "ACTIVE" ? BADGE_SUCCESS : BADGE_INFO}>{currentStatus || "-"}</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <div className={T_LABEL + " mb-1.5"}>New Role</div>
              <select
                value={newRole}
                onChange={(e) =>
                  setNewRole(
                    e.target.value as
                      | "STAFF"
                      | "MANAGER"
                      | "MANAGEMENT"
                      | "HQ"
                      | "ADMIN"
                      | "DUBAI_MANAGEMENT"
                      | "MANILA_MANAGEMENT"
                  )
                }
                className={SELECT_CLASS}
              >
                <option value="STAFF">STAFF</option>
                <option value="MANAGER">MANAGER</option>
                <option value="MANAGEMENT">MANAGEMENT</option>
                <option value="HQ">HQ</option>
                <option value="ADMIN">ADMIN</option>
                <option value="DUBAI_MANAGEMENT">DUBAI_MANAGEMENT</option>
                <option value="MANILA_MANAGEMENT">MANILA_MANAGEMENT</option>
              </select>
            </div>

            <div>
              <div className={T_LABEL + " mb-1.5"}>Approver Name</div>
              <input
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                className={INPUT_CLASS}
                placeholder="Your name"
              />
            </div>

            <div className="md:col-span-2">
              <div className={T_LABEL + " mb-1.5"}>HQ / ADMIN PIN</div>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className={INPUT_CLASS}
                placeholder="Your HQ or ADMIN PIN"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={
                  loading ||
                  !canSubmitByRole ||
                  !targetStaffName.trim() ||
                  !approverName.trim() ||
                  !pin.trim()
                }
                className={PRIMARY_BUTTON + " flex w-full items-center justify-center"}
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
                <div className={GLASS_CARD + " p-3"}>
                  <div className={T_CAPTION}>Staff</div>
                  <div className="mt-1 text-sm text-neutral-100">{result.staff_name}</div>
                </div>

                <div className={GLASS_CARD + " p-3"}>
                  <div className={T_CAPTION}>New Role</div>
                  <div className="mt-1 text-sm font-bold text-neutral-100">{result.role}</div>
                </div>

                <div className={GLASS_CARD + " p-3"}>
                  <div className={T_CAPTION}>Changed By</div>
                  <div className="mt-1 text-sm text-neutral-100">{result.changed_by}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href={`/admin/staff/audit?event_type=role_changed&target_staff_name=${encodeURIComponent(result.staff_name)}`}
                  className={SECONDARY_BUTTON + " text-sm"}
                >
                  View Audit Logs
                </Link>

                <Link
                  href="/admin/staff"
                  className={SECONDARY_BUTTON + " text-sm"}
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
    </motion.div>
  );
}

export default function StaffRolesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-950 text-white" />}>
      <StaffRolesPageInner />
    </Suspense>
  );
}