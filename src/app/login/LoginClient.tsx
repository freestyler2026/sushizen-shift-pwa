"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Field } from "@/components/Field";
import { getAuth, setAuth, type City, type StaffRole } from "@/lib/auth";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  return "";
}

const AUTH_REQUEST_TIMEOUT_MS = 60000;

function normalizeAuthRequestError(error: unknown) {
  const text = String((error as any)?.message || error || "").trim();
  const apiBase = getApiBase() || "this app";
  if ((error as any)?.name === "AbortError") {
    return `Login request timed out. Please confirm the local API is running at ${apiBase}.`;
  }
  if (text === "Failed to fetch" || /networkerror|load failed|fetch failed/i.test(text)) {
    return `Cannot reach the local API at ${apiBase}. Please restart the backend and try again.`;
  }
  return text || "Login failed.";
}

async function verifyAuth(staffName: string, pin: string): Promise<{ staffName: string; role: StaffRole }> {
  const qs = new URLSearchParams({ staff_name: staffName, pin }).toString();
  const url = `${getApiBase()}/api/auth/verify?${qs}`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
  let res: Response;
  let text = "";
  try {
    res = await fetch(url, { method: "POST", signal: controller.signal });
    text = await res.text();
  } finally {
    window.clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const j = JSON.parse(text);
      detail = typeof j?.detail === "string" ? j.detail : "";
    } catch {
      detail = "";
    }
    throw new Error(detail || text || `verify failed: ${res.status}`);
  }

  const j = text ? JSON.parse(text) : {};
  return {
    staffName: String(j?.staff_name || staffName).trim(),
    role: (j?.role as StaffRole) || "STAFF",
  };
}

export default function LoginClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const [city, setCity] = useState<City>("dubai");
  const [staffName, setStaffName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const a = getAuth();
    if (a) router.replace("/week");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    setError("");
    setLoading(true);

    try {
      const name = staffName.trim();
      const p = pin.trim();

      if (!name) throw new Error("Name is required.");
      if (!p) throw new Error("PIN is required.");
      if (p.length < 4) throw new Error("PIN must be at least 4 digits.");

      // ✅ role をAPIで確定
      const verified = await verifyAuth(name, p);

      // ✅ auth 保存（role + pin）
      setAuth({ staffName: verified.staffName, city, role: verified.role, pin: p });

      // middleware用 cookie（PINは入れない）
      document.cookie = "sushizen_authed=1; path=/; max-age=31536000";

      const next = sp.get("next");
      router.replace(next || "/week");
    } catch (e: any) {
      setError(normalizeAuthRequestError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-5">
        <div className="mb-2 text-lg font-semibold">Login</div>

        <div className="text-sm text-neutral-400">
          Enter your <span className="text-neutral-200 font-medium">exact name</span> (as in the shift sheet) and your PIN.
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="City">
            <select
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white"
              value={city}
              onChange={(e) => setCity(e.target.value as City)}
            >
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </Field>

          <Field label="Your name" hint="Exact spelling as in shift sheet">
            <input
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="e.g., Muskan Tamang"
              autoComplete="name"
            />
          </Field>

          <Field label="PIN" hint="4+ digits">
            <input
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </Field>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={submit}
            disabled={loading}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm hover:bg-neutral-900 disabled:opacity-50"
          >
            {loading ? "Checking..." : "Save & Continue"}
          </button>

          {error ? <div className="text-sm text-red-300">{error}</div> : null}
        </div>

        <div className="mt-4 text-xs text-neutral-500">
          PIN is stored on this device only (localStorage).
        </div>
      </div>
    </div>
  );
}