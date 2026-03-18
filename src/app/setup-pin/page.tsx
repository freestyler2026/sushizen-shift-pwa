// src/app/setup-pin/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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

type SetupPinResp = {
  ok: boolean;
  staff_name: string;
  message: string;
};

export default function SetupPinPage() {
  const searchParams = useSearchParams();

  const [staffName, setStaffName] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<SetupPinResp | null>(null);

  useEffect(() => {
    const qsStaffName = (searchParams.get("staff_name") || "").trim();
    if (qsStaffName) {
      setStaffName(qsStaffName);
    }
  }, [searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(null);

    try {
      const res = await apiPost<SetupPinResp>("/api/auth/setup_pin", {
        staff_name: staffName.trim(),
        setup_code: setupCode.trim(),
        new_pin: newPin.trim(),
        confirm_pin: confirmPin.trim(),
      });
      setSuccess(res);
      setNewPin("");
      setConfirmPin("");
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to set PIN"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-8 shadow-2xl">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-neutral-800 bg-black">
              <img
                src={LOGO_SRC}
                alt="Sushi ZEN logo"
                className="h-full w-full object-contain"
              />
            </div>

            <h1 className="mt-5 text-3xl font-bold">Set Up PIN</h1>
            <p className="mt-2 text-sm text-neutral-400">
              For new staff onboarding
            </p>
          </div>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <div className="mb-1 text-xs text-neutral-400">Staff Name</div>
              <input
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none placeholder:text-neutral-600"
                placeholder="Enter your full name"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Setup Code</div>
              <input
                value={setupCode}
                onChange={(e) => setSetupCode(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none placeholder:text-neutral-600"
                placeholder="Enter setup code"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">New PIN</div>
              <input
                type="password"
                inputMode="numeric"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none placeholder:text-neutral-600"
                placeholder="4 to 8 digits"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Confirm PIN</div>
              <input
                type="password"
                inputMode="numeric"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none placeholder:text-neutral-600"
                placeholder="Re-enter PIN"
              />
            </div>

            <button
              type="submit"
              disabled={
                loading ||
                !staffName.trim() ||
                !setupCode.trim() ||
                !newPin.trim() ||
                !confirmPin.trim()
              }
              className="flex w-full items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
            >
              {loading ? "Setting PIN..." : "Set PIN"}
            </button>
          </form>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          {success?.ok ? (
            <div className="mt-4 rounded-2xl border border-emerald-900/50 bg-emerald-950/20 p-4">
              <div className="text-sm text-emerald-200">{success.message}</div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/login"
                  className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200"
                >
                  Go to Log In
                </Link>

                <Link
                  href={`/admin/staff/audit?event_type=setup_completed&target_staff_name=${encodeURIComponent(success.staff_name)}`}
                  className="rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-900"
                >
                  View Audit Log
                </Link>
              </div>

              <div className="mt-3 text-xs text-neutral-400">
                Next step: log in with the new PIN, or review the completed setup in Audit Logs.
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex flex-col items-center gap-3 text-sm text-neutral-400 sm:flex-row sm:justify-between">
            <Link href="/signup" className="hover:text-white">
              ← Back
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