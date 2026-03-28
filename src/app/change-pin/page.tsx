"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, setAuth } from "@/lib/auth";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (configured) return configured;
  return "";
}

type ChangePinResp = {
  ok: boolean;
  staff_name: string;
  message: string;
};

export default function ChangePinPage() {
  const router = useRouter();
  const [staffName, setStaffName] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const auth = getAuth();
    if (!auth?.staffName) {
      router.replace("/login?next=/change-pin");
      return;
    }
    setStaffName(auth.staffName);
    setCurrentPin(auth.pin || "");
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const name = staffName.trim();
      const cur = currentPin.trim();
      const nextPin = newPin.trim();
      const confirm = confirmPin.trim();

      if (!name) throw new Error("Staff name is required.");
      if (!cur) throw new Error("Current PIN is required.");
      if (!nextPin) throw new Error("New PIN is required.");
      if (nextPin !== confirm) throw new Error("PIN confirmation does not match.");
      if (!/^\d{4,8}$/.test(nextPin)) throw new Error("PIN must be 4 to 8 numeric digits.");
      if (nextPin === cur) throw new Error("New PIN must be different from current PIN.");

      const res = await fetch(`${getApiBase()}/api/auth/change_pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staff_name: name,
          current_pin: cur,
          new_pin: nextPin,
          confirm_pin: confirm,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        let detail = "";
        try {
          detail = JSON.parse(text)?.detail || "";
        } catch {
          detail = "";
        }
        throw new Error(detail || text || `Change PIN failed: ${res.status}`);
      }
      const data = (text ? JSON.parse(text) : {}) as ChangePinResp;
      const auth = getAuth();
      if (auth?.staffName) {
        setAuth({ ...auth, pin: nextPin });
      }
      setCurrentPin(nextPin);
      setNewPin("");
      setConfirmPin("");
      setSuccess(data.message || "PIN changed successfully.");
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to change PIN"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-xl px-4 py-8">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
          <h1 className="text-xl font-bold">Change PIN</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Update your login PIN. Keep it private.
          </p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="mb-2 block text-sm text-neutral-300">Staff Name</label>
              <input
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="Your exact name"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-neutral-300">Current PIN</label>
              <input
                type="password"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
                placeholder="Current PIN"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-neutral-300">New PIN</label>
              <input
                type="password"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="4 to 8 digits"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-neutral-300">Confirm New PIN</label>
              <input
                type="password"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="Confirm new PIN"
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-200">
                {success}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-neutral-200 disabled:opacity-50"
            >
              {loading ? "Updating..." : "Update PIN"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
