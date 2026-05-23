// src/app/login/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Field } from "@/components/Field";
import { getAuth, setAuth, type City, type StaffRole } from "@/lib/auth";

type StaffNameDirectory = {
  ok: boolean;
  city: string;
  status: string;
  names: string[];
};

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

/**
 * Verify PIN via API and return role.
 * - If API_BASE is empty, it will call same-origin (/api/auth/verify).
 */
async function verifyAuth(staffName: string, pin: string, city: City): Promise<{
  staffName: string;
  role: StaffRole;
  city: City;
  accessToken: string;
  permissions: string[];
  mfa?: {
    passkey_count?: number;
    totp_enabled?: boolean;
    backup_codes_remaining?: number;
    methods?: string[];
    required_for_admin?: boolean;
  };
}> {
  const qs = new URLSearchParams({ staff_name: staffName, pin, city }).toString();
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
    // FastAPI: {"detail": "..."}
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
    city: (String(j?.city || city).toLowerCase() === "manila" ? "manila" : "dubai") as City,
    accessToken: String(j?.access_token || "").trim(),
    permissions: Array.isArray(j?.permissions) ? j.permissions.map((item: unknown) => String(item || "").trim()).filter(Boolean) : [],
    mfa: j?.mfa || undefined,
  };
}

async function fetchStaffNames(city: City): Promise<string[]> {
  const qs = new URLSearchParams({
    city,
    status: "ACTIVE",
    limit: "5000",
  }).toString();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
  let res: Response;
  let text = "";
  try {
    res = await fetch(`/api/admin/staff_master/names?${qs}`, { cache: "no-store", signal: controller.signal });
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
    throw new Error(detail || text || `staff names failed: ${res.status}`);
  }
  const data = (text ? JSON.parse(text) : {}) as StaffNameDirectory;
  return Array.isArray(data?.names) ? data.names.map((name) => String(name || "").trim()).filter(Boolean) : [];
}

function normalizeName(name: string) {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const [city, setCity] = useState<City>("dubai");
  const [staffName, setStaffName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [nameOptions, setNameOptions] = useState<string[]>([]);
  const [nameLoading, setNameLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const pinInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const a = getAuth();
    if (a) router.replace("/my-shift");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadNames() {
      setNameLoading(true);
      try {
        const names = await fetchStaffNames(city);
        if (!cancelled) setNameOptions(names);
      } catch (e: any) {
        if (!cancelled) {
          setNameOptions([]);
          setError((prev) => prev || normalizeAuthRequestError(e));
        }
      } finally {
        if (!cancelled) setNameLoading(false);
      }
    }
    void loadNames();
    return () => {
      cancelled = true;
    };
  }, [city]);

  const filteredNameOptions = useMemo(() => {
    const q = normalizeName(staffName);
    if (!q) return [];
    const starts = nameOptions.filter((name) => normalizeName(name).startsWith(q));
    const contains = nameOptions.filter((name) => !normalizeName(name).startsWith(q) && normalizeName(name).includes(q));
    return [...starts, ...contains].slice(0, 8);
  }, [nameOptions, staffName]);

  const submit = async () => {
    setError("");
    setLoading(true);

    try {
      const name = staffName.trim();
      const p = pin.trim();
      const matchedName = nameOptions.find((candidate) => normalizeName(candidate) === normalizeName(name));

      if (!name) throw new Error("Name is required.");
      if (nameOptions.length > 0 && !matchedName) throw new Error("Please choose your name from the list.");
      if (!p) throw new Error("PIN is required.");
      if (p.length < 4) throw new Error("PIN must be at least 4 digits.");

      // ✅ verify role from API
      const verified = await verifyAuth(matchedName || name, p, city);

      // ✅ store auth (localStorage)
      setAuth({
        staffName: verified.staffName,
        city: verified.city,
        role: verified.role,
        pin: p,
        accessToken: verified.accessToken,
        permissions: verified.permissions,
        mfa: verified.mfa
          ? {
              passkeyCount: Number(verified.mfa.passkey_count || 0),
              totpEnabled: Boolean(verified.mfa.totp_enabled),
              backupCodesRemaining: Number(verified.mfa.backup_codes_remaining || 0),
              methods: Array.isArray(verified.mfa.methods) ? verified.mfa.methods.map((item) => String(item || "")) : [],
              requiredForAdmin: Boolean(verified.mfa.required_for_admin),
            }
          : undefined,
      });

      // middleware helper cookie (PIN is NOT stored)
      document.cookie = "sushizen_authed=1; path=/; max-age=31536000";

      const next = sp.get("next");
      router.replace(next || "/my-shift");
    } catch (e: any) {
      setError(normalizeAuthRequestError(e));
      setPin("");
      requestAnimationFrame(() => pinInputRef.current?.focus());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-3.5 shadow-sm sm:p-6">
        <div className="mb-2 text-base font-semibold sm:text-lg">Login</div>

        <div className="max-w-lg text-sm leading-5 text-neutral-400">
          Select your name from the list, then enter your PIN.
        </div>

        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="City">
              <select
                className="min-h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value as City);
                  setStaffName("");
                  setShowSuggestions(false);
                  setError("");
                }}
              >
                <option value="dubai">Dubai</option>
                <option value="manila">Manila</option>
              </select>
            </Field>

            <Field label="Your name" hint={nameLoading ? "Loading names..." : "Type to search and select"}>
              <div className="relative">
                <input
                  className="min-h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
                  value={staffName}
                  onChange={(e) => {
                    setStaffName(e.target.value);
                    setShowSuggestions(true);
                    if (error) setError("");
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => {
                    window.setTimeout(() => setShowSuggestions(false), 120);
                  }}
                  placeholder="Type your name"
                  autoComplete="off"
                  spellCheck={false}
                />
                {showSuggestions && filteredNameOptions.length ? (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-neutral-800 bg-neutral-950 p-1 shadow-2xl">
                    {filteredNameOptions.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onPointerDown={(e) => {
                          // Prevent input blur from firing before click on mobile/touch
                          e.preventDefault();
                        }}
                        onClick={() => {
                          setStaffName(name);
                          setShowSuggestions(false);
                          setError("");
                          requestAnimationFrame(() => pinInputRef.current?.focus());
                        }}
                        className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-900 active:bg-neutral-800"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </Field>

            <Field label="PIN" hint="4+ digits">
              <input
                ref={pinInputRef}
                className="min-h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  if (error) setError("");
                }}
                placeholder="••••"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
              />
            </Field>
          </div>

          {error ? <div className="mt-3 text-sm text-red-400">{error}</div> : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-4 min-h-11 w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-violet-500 active:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Checking..." : "Login"}
          </button>
        </form>

        <div className="mt-4 text-xs text-neutral-500">
          PIN is verified by the API. Auth is stored on this device only (localStorage).
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-400">Loading...</div>}>
      <LoginInner />
    </Suspense>
  );
}