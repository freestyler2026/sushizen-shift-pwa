// src/app/admin/staff/onboarding/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ClipboardList, Clock } from "lucide-react";
import { canAccessRoleManagement, getAuth } from "@/lib/auth";
import { fmtNum } from "@/lib/formatters";
import {
  BADGE_ERROR,
  BADGE_SUCCESS,
  BADGE_WARNING,
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
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
  const canOpenRoleManagement = canAccessRoleManagement(auth);

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
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-teal-500/5">
            <ClipboardList className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className={T_PAGE_TITLE}>Onboarding Dashboard</h1>
            <p className={T_CAPTION}>HQ / ADMIN visibility for new staff creation and setup completion.</p>
          </div>
        </div>

        <div className={GLASS_CARD + " p-5"}>
          <div className="mb-2 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-400" />
            <h2 className={T_SECTION}>Pending Staff Setup</h2>
          </div>
          <p className={T_BODY}>Filter pending onboarding items, reissue setup codes, and review completion progress.</p>

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-5">
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
                placeholder="BB / PAR / ..."
              />
            </div>

            <div>
              <div className={T_LABEL + " mb-1.5"}>Limit</div>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className={INPUT_CLASS}
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

          <div className="mt-4">
            <button
              type="button"
              onClick={load}
              disabled={loading || !approverName.trim() || !pin.trim()}
              className={PRIMARY_BUTTON}
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
              <div className={GLASS_CARD + " p-4"}>
                <div className={T_CAPTION}>Total</div>
                <div className="mt-1 text-2xl font-bold">{fmtNum(summary.total)}</div>
              </div>
              <div className={GLASS_CARD + " p-4"}>
                <div className={T_CAPTION}>Pending Setup</div>
                <div className="mt-1 text-2xl font-bold text-amber-200">
                  {fmtNum(summary.pending_setup)}
                </div>
              </div>
              <div className={GLASS_CARD + " p-4"}>
                <div className={T_CAPTION}>Completed Setup</div>
                <div className="mt-1 text-2xl font-bold text-emerald-200">
                  {fmtNum(summary.completed_setup)}
                </div>
              </div>
              <div className={GLASS_CARD + " p-4"}>
                <div className={T_CAPTION}>Active</div>
                <div className="mt-1 text-2xl font-bold">{fmtNum(summary.active)}</div>
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

          <div className={GLASS_CARD + " overflow-hidden"}>
            <div className="grid grid-cols-1 border-b border-white/5 bg-white/3 px-4 py-3 text-xs font-semibold text-neutral-300 md:grid-cols-7">
              <div>Name</div>
              <div>Branch</div>
              <div>Role</div>
              <div>Status</div>
              <div>Progress</div>
              <div>Created By</div>
              <div>Last Activity</div>
            </div>

            {rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-neutral-500">
                No rows found.
              </div>
            ) : (
              rows.map((row) => {
                const progress = row.setup_completed ? 100 : row.setup_required ? 50 : 10;
                return (
                <div
                  key={`${row.city}-${row.display_name}`}
                  className="grid grid-cols-1 gap-3 border-b border-white/5 bg-white/5 px-4 py-4 text-sm md:grid-cols-7 md:items-start"
                >
                  <div>
                    <div className="font-medium">{row.display_name}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {canOpenRoleManagement ? (
                        <a
                          href={`/admin/staff/roles?staff_name=${encodeURIComponent(row.display_name)}`}
                          className={SECONDARY_BUTTON + " px-2.5 py-1 text-[11px]"}
                        >
                          Role
                        </a>
                      ) : null}

                      <a
                        href={`/admin/staff/audit?target_staff_name=${encodeURIComponent(row.display_name)}`}
                        className={SECONDARY_BUTTON + " px-2.5 py-1 text-[11px]"}
                      >
                        Audit
                      </a>
                    </div>
                  </div>

                  <div>{row.branch_code}</div>

                  <div>{row.role}</div>

                  <div>
                    <span className={row.setup_completed ? BADGE_SUCCESS : row.setup_required ? BADGE_WARNING : BADGE_ERROR}>
                      {row.setup_completed ? "Completed" : row.setup_required ? "Pending" : "Not started"}
                    </span>
                  </div>

                  <div>
                    <div className="h-2 w-full rounded-full bg-white/8">
                      <div className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-purple-400" style={{ width: `${progress}%` }} />
                    </div>
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
              )})
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
    </motion.div>
  );
}