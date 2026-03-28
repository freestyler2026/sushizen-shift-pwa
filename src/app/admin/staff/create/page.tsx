// src/app/admin/staff/create/page.tsx
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { BRANCHES, type BranchCode, type City as BranchCity } from "@/lib/branches";
import AdminOnboardingLinks from "@/components/admin/AdminOnboardingLinks";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
const LOGO_SRC = "/logo.png";

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
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-10 space-y-6">
        <AdminOnboardingLinks compact />

        <div className="mx-auto w-full max-w-3xl rounded-3xl border border-neutral-800 bg-neutral-900/60 p-8 shadow-2xl">
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

            <h1 className="mt-5 text-2xl font-bold">Create Staff Record</h1>
            <p className="mt-2 text-sm text-neutral-400">
              For store managers. Register a new staff member and issue a setup code.
            </p>

            <div className="mt-3 text-xs text-neutral-500">
              Verified role: <span className="text-neutral-200">{myRole || "—"}</span>
            </div>
          </div>

          <form onSubmit={onSubmit} className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs text-neutral-400">City</div>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value as BranchCity)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
              >
                <option value="dubai">Dubai</option>
                <option value="manila">Manila</option>
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Branch</div>
              <select
                value={homeBranch}
                onChange={(e) => setHomeBranch(e.target.value as BranchCode)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
              >
                {BRANCHES[city].map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <div className="mb-1 text-xs text-neutral-400">Staff Name</div>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none"
                placeholder="Enter staff full name"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Role</div>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "STAFF" | "MANAGER")}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
              >
                <option value="STAFF">STAFF</option>
                <option value="MANAGER">MANAGER</option>
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Status</div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Manager Name</div>
              <input
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none"
                placeholder="Your name"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Manager PIN</div>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none"
                placeholder="Your PIN"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={loading || !displayName.trim() || !approverName.trim() || !pin.trim()}
                className="flex w-full items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
              >
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
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="text-[11px] text-neutral-500">Staff</div>
                  <div className="mt-1 text-sm text-neutral-100">{result.display_name}</div>
                </div>

                <div className="rounded-2xl border border-amber-800/50 bg-amber-950/30 p-3">
                  <div className="text-[11px] text-amber-300/70">Setup Code</div>
                  <div className="mt-1 text-2xl font-bold tracking-[0.2em] text-amber-200">
                    {result.setup_code}
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="text-[11px] text-neutral-500">Expires At</div>
                  <div className="mt-1 text-sm text-neutral-100">{result.expires_at}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href={`/setup-pin?staff_name=${encodeURIComponent(result.display_name)}`}
                  className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200"
                >
                  Open Set Up PIN
                </Link>

                <Link
                  href="/signup"
                  className="rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-900"
                >
                  Open Sign Up
                </Link>

                <Link
                  href="/admin/staff/setup"
                  className="rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-900"
                >
                  Open Pending Setup
                </Link>

                <Link
                  href={`/admin/staff/audit?event_type=staff_created&target_staff_name=${encodeURIComponent(result.display_name)}`}
                  className="rounded-2xl border border-neutral-700 bg-neutral-950/40 px-4 py-3 text-sm font-semibold text-neutral-200 transition hover:bg-neutral-900"
                >
                  View Audit Logs
                </Link>

                <button
                  type="button"
                    onClick={() => navigator.clipboard.writeText(result.setup_code)}
                    className="rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-900"
                >
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
            <Link href="/admin/staff/setup" className="hover:text-white">
              View Pending Setup
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}