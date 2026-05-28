// src/app/admin/staff/onboarding/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ClipboardList, Clock, KeyRound, RotateCcw, Copy, Check, X } from "lucide-react";
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

// In production, use relative URLs so Next.js rewrites proxy to Heroku (avoids CORS).
// In dev, use the full local backend URL.
function getBase() {
  return process.env.NODE_ENV === "production" ? "" : (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000");
}

async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  const text = await res.text();

  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      if (j?.detail) detail = String(j.detail);
    } catch { /* ignore */ }
    throw new Error(detail || `GET ${path} failed`);
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function apiPost<T = any>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      if (j?.detail) detail = String(j.detail);
    } catch { /* ignore */ }
    throw new Error(detail || `POST ${path} failed`);
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

  // HQ Setup PIN modal
  const [setupModal, setSetupModal] = useState<{ staffName: string } | null>(null);
  const [setupPin, setSetupPin] = useState("");
  const [setupPinConfirm, setSetupPinConfirm] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [setupSuccess, setSetupSuccess] = useState("");
  const pinRef = useRef<HTMLInputElement>(null);

  // Reset PIN modal
  const [resetModal, setResetModal] = useState<{ staffName: string } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetResultCode, setResetResultCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function openResetModal(staffName: string) {
    setResetModal({ staffName });
    setResetError("");
    setResetResultCode(null);
    setCopied(false);
  }

  function closeResetModal() {
    setResetModal(null);
    setResetError("");
    setResetResultCode(null);
    setCopied(false);
  }

  async function submitResetPin() {
    if (!resetModal) return;
    setResetLoading(true);
    setResetError("");
    try {
      const res = await apiPost<{ ok: boolean; setup_code: string; expires_at?: string }>(
        "/api/admin/staff/setup/reset-pin",
        {
          staff_name: resetModal.staffName,
          approver_name: approverName.trim(),
          pin: pin.trim(),
        },
      );
      setResetResultCode(res.setup_code);
      // Reflect status change in the table
      setRows((prev) =>
        prev.map((r) =>
          r.display_name === resetModal.staffName
            ? { ...r, setup_completed: true, setup_required: false }
            : r,
        ),
      );
    } catch (e: any) {
      setResetError(String(e?.message || "Failed to reset PIN"));
    } finally {
      setResetLoading(false);
    }
  }

  function copyCode(code: string) {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function openSetupModal(staffName: string) {
    setSetupModal({ staffName });
    setSetupPin("");
    setSetupPinConfirm("");
    setSetupError("");
    setSetupSuccess("");
    setTimeout(() => pinRef.current?.focus(), 50);
  }

  function closeSetupModal() {
    setSetupModal(null);
    setSetupPin("");
    setSetupPinConfirm("");
    setSetupError("");
    setSetupSuccess("");
  }

  async function submitSetupPin() {
    if (!setupModal) return;
    setSetupError("");
    setSetupSuccess("");
    if (!setupPin || setupPin !== setupPinConfirm) {
      setSetupError("PINs do not match or are empty.");
      return;
    }
    if (!/^\d{4,8}$/.test(setupPin)) {
      setSetupError("PIN must be 4–8 numeric digits.");
      return;
    }
    setSetupLoading(true);
    try {
      await apiPost("/api/admin/staff/setup/complete-by-hq", {
        staff_name: setupModal.staffName,
        new_pin: setupPin,
        confirm_pin: setupPinConfirm,
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });
      setSetupSuccess(`✓ Setup complete for ${setupModal.staffName}`);
      // Update row locally
      setRows((prev) =>
        prev.map((r) =>
          r.display_name === setupModal.staffName
            ? { ...r, setup_completed: true, setup_required: false, setup_code_expires_at: null }
            : r,
        ),
      );
      setSummary((prev) =>
        prev
          ? { ...prev, pending_setup: Math.max(0, prev.pending_setup - 1), completed_setup: prev.completed_setup + 1 }
          : prev,
      );
      setTimeout(closeSetupModal, 1800);
    } catch (e: any) {
      setSetupError(String(e?.message || "Failed to complete setup"));
    } finally {
      setSetupLoading(false);
    }
  }

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
    <>
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
                    <div className="font-medium text-white">{row.display_name}</div>
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

                      {!row.setup_completed && row.setup_required ? (
                        <button
                          type="button"
                          onClick={() => openSetupModal(row.display_name)}
                          className="flex items-center gap-1 rounded-lg border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-300 transition hover:bg-violet-500/20"
                        >
                          <KeyRound className="h-3 w-3" />
                          Setup PIN
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => openResetModal(row.display_name)}
                        className="flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-300 transition hover:bg-rose-500/20"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Reset PIN
                      </button>
                    </div>
                  </div>

                  <div className="text-zinc-200">{row.branch_code}</div>

                  <div className="text-zinc-200">{row.role}</div>

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

    {/* Reset PIN Modal */}
    {resetModal ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-neutral-950 p-6 shadow-2xl">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-rose-400" />
              <h3 className="text-base font-semibold text-white">Reset PIN</h3>
            </div>
            <button type="button" onClick={closeResetModal} className="text-neutral-500 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          {!resetResultCode ? (
            <>
              <p className="mb-2 text-sm text-neutral-300">
                Reset PIN for <span className="font-semibold text-white">{resetModal.staffName}</span>?
              </p>
              <p className="mb-5 text-xs text-neutral-500">
                Their PIN will be reset to the default <span className="font-mono text-neutral-300">1111</span>. Share this with the staff member so they can log in immediately.
              </p>

              {resetError ? (
                <div className="mb-4 rounded-xl border border-rose-800/40 bg-rose-950/20 px-3 py-2 text-sm text-rose-300">
                  {resetError}
                </div>
              ) : null}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeResetModal}
                  className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 py-2.5 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitResetPin()}
                  disabled={resetLoading}
                  className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                >
                  {resetLoading ? "Resetting…" : "Confirm Reset"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mb-1 text-sm text-emerald-300">
                ✓ PIN reset for <span className="font-semibold text-white">{resetModal.staffName}</span>.
              </p>
              <p className="mb-4 text-xs text-neutral-500">Their PIN has been reset to the default below. Share it with the staff member so they can log in.</p>

              <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                <span className="flex-1 font-mono text-2xl font-bold tracking-widest text-amber-200">
                  {resetResultCode}
                </span>
                <button
                  type="button"
                  onClick={() => copyCode(resetResultCode)}
                  className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>

              <p className="mt-3 text-xs text-neutral-500">
                Staff can log in immediately with this PIN.
              </p>

              <button
                type="button"
                onClick={closeResetModal}
                className="mt-5 w-full rounded-xl border border-neutral-700 bg-neutral-900 py-2.5 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    ) : null}

    {/* HQ Setup PIN Modal */}

    {setupModal ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl border border-violet-500/30 bg-neutral-950 p-6 shadow-2xl">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-violet-400" />
              <h3 className="text-base font-semibold text-white">Set PIN for Staff</h3>
            </div>
            <button type="button" onClick={closeSetupModal} className="text-neutral-500 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          <p className="mb-4 text-sm text-neutral-400">
            Setting PIN for <span className="font-semibold text-white">{setupModal.staffName}</span>.
            The staff member will use this PIN to log in.
          </p>

          <div className="space-y-3">
            <div>
              <div className={T_LABEL + " mb-1.5"}>New PIN (4–8 digits)</div>
              <input
                ref={pinRef}
                type="password"
                inputMode="numeric"
                value={setupPin}
                onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                className={INPUT_CLASS}
                placeholder="Enter PIN"
                onKeyDown={(e) => e.key === "Enter" && submitSetupPin()}
              />
            </div>
            <div>
              <div className={T_LABEL + " mb-1.5"}>Confirm PIN</div>
              <input
                type="password"
                inputMode="numeric"
                value={setupPinConfirm}
                onChange={(e) => setSetupPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 8))}
                className={INPUT_CLASS}
                placeholder="Re-enter PIN"
                onKeyDown={(e) => e.key === "Enter" && submitSetupPin()}
              />
            </div>
          </div>

          {setupError ? (
            <div className="mt-3 rounded-xl border border-rose-800/40 bg-rose-950/20 px-3 py-2 text-sm text-rose-300">
              {setupError}
            </div>
          ) : null}

          {setupSuccess ? (
            <div className="mt-3 rounded-xl border border-emerald-800/40 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-300">
              {setupSuccess}
            </div>
          ) : null}

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={closeSetupModal}
              className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 py-2.5 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitSetupPin}
              disabled={setupLoading || !!setupSuccess}
              className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {setupLoading ? "Setting PIN…" : "Complete Setup"}
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}