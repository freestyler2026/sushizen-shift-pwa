"use client";

import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
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

function SetupPinInner() {
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
              <Image
                src={LOGO_SRC}
                alt="Sushi ZEN logo"
                width={80}
                height={80}
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
              <label className="mb-2 block text-sm text-neutral-300">Staff Name</label>
              <input
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none"
                placeholder="Enter your exact staff name"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-neutral-300">Setup Code</label>
              <input
                value={setupCode}
                onChange={(e) => setSetupCode(e.target.value)}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none"
                placeholder="Enter setup code"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-neutral-300">New PIN</label>
              <input
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none"
                placeholder="Enter new PIN"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-neutral-300">Confirm PIN</label>
              <input
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none"
                placeholder="Confirm new PIN"
              />
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-900/40 bg-red-950/20 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">
                {success.message || "PIN set successfully."}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-50"
            >
              {loading ? "Submitting..." : "Set PIN"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/login" className="text-sm text-neutral-400 hover:text-white">
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function SetupPinPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-950 text-white" />}>
      <SetupPinInner />
    </Suspense>
  );
}