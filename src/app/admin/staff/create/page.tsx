// src/app/admin/staff/create/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Copy, UserPlus } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { BRANCHES, type BranchCode, type City as BranchCity } from "@/lib/branches";
import AdminOnboardingLinks from "@/components/admin/AdminOnboardingLinks";
import {
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
} from "@/lib/ui-tokens";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
async function apiPost<T = any>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j?.detail || text;
    } catch {
      // text is not JSON — use raw text
    }
    throw new Error(detail || `POST ${path} failed`);
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
}

type VerifyResp = {
  ok: boolean;
  staff_name: string;
  role: "STAFF" | "MANAGER" | "MANAGEMENT" | "HQ" | "ADMIN" | "HR_MANAGER" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT";
};

type CreateStaffResp = {
  ok: boolean;
  display_name: string;
  setup_code: string;
  expires_at: string;
};

export default function CreateStaffPage() {
  const auth = getAuth();

  const [city, setCity] = useState<BranchCity>((auth?.city as BranchCity) || "dubai");
  const [displayName, setDisplayName] = useState("");
  const [homeBranch, setHomeBranch] = useState<BranchCode>(
    (city === "dubai" ? "BB" : "PAR") as BranchCode
  );
  const [role, setRole] = useState<"STAFF" | "MANAGER">("STAFF");
  const [status, setStatus] = useState("ACTIVE");

  const [approverName, setApproverName] = useState(auth?.staffName || "");
  const [pin, setPin] = useState(auth?.pin || "");
  const [myRole, setMyRole] = useState<
    "STAFF" | "MANAGER" | "MANAGEMENT" | "HQ" | "ADMIN" | "HR_MANAGER" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT" | ""
  >("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CreateStaffResp | null>(null);

  useEffect(() => {
    const first = BRANCHES[city][0]?.code;
    if (first) setHomeBranch(first as BranchCode);
  }, [city]);

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await apiPost<CreateStaffResp>("/api/store/staff/create", {
        city,
        display_name: displayName.trim(),
        home_branch: homeBranch,
        role,
        status,
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });
      setResult(res);
      setDisplayName("");
      setRole("STAFF");
      setStatus("ACTIVE");
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to create staff"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <AdminOnboardingLinks compact />

        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/20 to-purple-500/10">
            <UserPlus className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className={T_PAGE_TITLE}>Create Staff Record</h1>
            <p className={T_CAPTION}>For store managers. Register a new staff member and issue a setup code.</p>
          </div>
        </div>

        <div className={"mx-auto w-full max-w-3xl " + GLASS_CARD + " p-8"}>
          <div className="text-center">
            <div className="mt-3 text-xs text-neutral-500">
              Verified role: <span className="text-neutral-200">{myRole || "—"}</span>
            </div>
          </div>

          <form onSubmit={onSubmit} className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className={T_LABEL + " mb-1.5"}>City</div>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value as BranchCity)}
                className={SELECT_CLASS}
              >
                <option value="dubai">Dubai</option>
                <option value="manila">Manila</option>
              </select>
            </div>

            <div>
              <div className={T_LABEL + " mb-1.5"}>Branch</div>
              <select
                value={homeBranch}
                onChange={(e) => setHomeBranch(e.target.value as BranchCode)}
                className={SELECT_CLASS}
              >
                {BRANCHES[city].map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <div className={T_LABEL + " mb-1.5"}>Staff Name</div>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={INPUT_CLASS}
                placeholder="Enter staff full name"
              />
            </div>

            <div>
              <div className={T_LABEL + " mb-1.5"}>Role</div>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "STAFF" | "MANAGER")}
                className={SELECT_CLASS}
              >
                <option value="STAFF">STAFF</option>
                <option value="MANAGER">MANAGER</option>
              </select>
            </div>

            <div>
              <div className={T_LABEL + " mb-1.5"}>Status</div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>

            <div>
              <div className={T_LABEL + " mb-1.5"}>Manager Name</div>
              <input
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                className={INPUT_CLASS}
                placeholder="Your name"
              />
            </div>

            <div>
              <div className={T_LABEL + " mb-1.5"}>Manager PIN</div>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className={INPUT_CLASS}
                placeholder="Your PIN"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={loading || !displayName.trim() || !approverName.trim() || !pin.trim()}
                className={PRIMARY_BUTTON + " flex w-full items-center justify-center gap-2"}
              >
                <UserPlus className="h-4 w-4" />
                {loading ? "Creating..." : "Create Staff Record"}
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
                Staff created successfully
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className={GLASS_CARD + " p-3"}>
                  <div className={T_CAPTION}>Staff</div>
                  <div className="mt-1 text-sm text-neutral-100">{result.display_name}</div>
                </div>

                <div className={GLASS_CARD + " p-3"}>
                  <div className="text-[11px] text-amber-300/70">Setup Code</div>
                  <div className="mt-1 text-2xl font-bold tracking-[0.2em] text-amber-200">
                    {result.setup_code}
                  </div>
                </div>

                <div className={GLASS_CARD + " p-3"}>
                  <div className={T_CAPTION}>Expires At</div>
                  <div className="mt-1 text-sm text-neutral-100">{result.expires_at}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href={`/setup-pin?staff_name=${encodeURIComponent(result.display_name)}`}
                  className={PRIMARY_BUTTON + " text-sm"}
                >
                  Open Set Up PIN
                </Link>

                <Link
                  href="/signup"
                  className={SECONDARY_BUTTON + " text-sm"}
                >
                  Open Sign Up
                </Link>

                <Link
                  href="/admin/staff/onboarding"
                  className={SECONDARY_BUTTON + " text-sm"}
                >
                  Open Pending Setup
                </Link>

                <Link
                  href={`/admin/staff/audit?event_type=staff_created&target_staff_name=${encodeURIComponent(result.display_name)}`}
                  className={SECONDARY_BUTTON + " text-sm"}
                >
                  View Audit Logs
                </Link>

                <button
                  type="button"
                    onClick={() => navigator.clipboard.writeText(result.setup_code)}
                    className={SECONDARY_BUTTON + " flex items-center gap-2 text-sm"}
                >
                  <Copy className="h-4 w-4" />
                  Copy Setup Code
                </button>
              </div>

              <div className="mt-3 text-xs text-neutral-400">
                Next step: open <span className="text-neutral-200">Sign Up</span> or{" "}
                <span className="text-neutral-200">Set Up PIN</span> on the new staff member’s
                phone, or check <span className="text-neutral-200">Pending Setup</span>.
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex flex-col items-center gap-3 text-sm text-neutral-400 sm:flex-row sm:justify-between">
            <Link href="/admin/staff" className="hover:text-white">
              ← Back to Staff Master
            </Link>
            <Link href="/admin/staff/onboarding" className="hover:text-white">
              View Pending Setup
            </Link>
          </div>
        </div>
    </motion.div>
  );
}