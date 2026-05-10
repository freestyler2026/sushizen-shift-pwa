// src/app/attendance/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Fingerprint,
  CheckCircle2,
  Clock,
  LogIn,
  LogOut,
  MapPin,
  MapPinOff,
  Navigation,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Plus,
  Square,
  MessageSquare,
} from "lucide-react";
import { getAuth, getAuthHeaders, canAccessAttendancePage } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import { GLASS_CARD } from "@/lib/ui-tokens";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AttendanceSession {
  id: string;
  city: string;
  branch_code: string;
  staff_name: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_gps_ok: boolean | null;
  check_out_gps_ok: boolean | null;
  check_in_distance_m: number | null;
  check_out_distance_m: number | null;
}

interface AttendanceVisit {
  id: string;
  session_id: string;
  branch_code: string;
  visit_start: string;
  visit_end: string | null;
  gps_ok: boolean | null;
  distance_m: number | null;
}

interface TodayData {
  today: string;
  passkey_count: number;
  session: AttendanceSession | null;
  visits: AttendanceVisit[];
}

// ─── WebAuthn helpers (native API) ───────────────────────────────────────────

function b64uDecode(b64u: string): Uint8Array {
  const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function b64uEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function credentialToJSON(cred: PublicKeyCredential): Record<string, unknown> {
  const resp = cred.response;
  if (resp instanceof AuthenticatorAssertionResponse) {
    return {
      id: cred.id,
      rawId: b64uEncode(cred.rawId),
      type: cred.type,
      response: {
        authenticatorData: b64uEncode(resp.authenticatorData),
        clientDataJSON: b64uEncode(resp.clientDataJSON),
        signature: b64uEncode(resp.signature),
        userHandle: resp.userHandle ? b64uEncode(resp.userHandle) : null,
      },
      clientExtensionResults: cred.getClientExtensionResults(),
    };
  }
  if (resp instanceof AuthenticatorAttestationResponse) {
    return {
      id: cred.id,
      rawId: b64uEncode(cred.rawId),
      type: cred.type,
      response: {
        attestationObject: b64uEncode(resp.attestationObject),
        clientDataJSON: b64uEncode(resp.clientDataJSON),
        transports: "getTransports" in resp && typeof resp.getTransports === "function"
          ? (resp as AuthenticatorAttestationResponse & { getTransports(): string[] }).getTransports()
          : [],
      },
      clientExtensionResults: cred.getClientExtensionResults(),
    };
  }
  return { id: cred.id, rawId: b64uEncode(cred.rawId), type: cred.type };
}

async function webauthnRegister(options: Record<string, unknown>): Promise<Record<string, unknown>> {
  const pubKey = options as PublicKeyCredentialCreationOptionsJSON;
  const createOptions: CredentialCreationOptions = {
    publicKey: {
      rp: pubKey.rp as PublicKeyCredentialRpEntity,
      user: {
        id: b64uDecode(pubKey.user.id as string).buffer as ArrayBuffer,
        name: pubKey.user.name as string,
        displayName: pubKey.user.displayName as string,
      },
      challenge: b64uDecode(pubKey.challenge as string).buffer as ArrayBuffer,
      pubKeyCredParams: pubKey.pubKeyCredParams as PublicKeyCredentialParameters[],
      timeout: (pubKey.timeout as number | undefined) ?? 60000,
      attestation: (pubKey.attestation as AttestationConveyancePreference | undefined) ?? "none",
      authenticatorSelection: pubKey.authenticatorSelection as AuthenticatorSelectionCriteria | undefined,
      excludeCredentials: ((pubKey.excludeCredentials ?? []) as Array<{ id: string; type: string; transports?: string[] }>).map((c) => ({
        id: b64uDecode(c.id).buffer as ArrayBuffer,
        type: c.type as PublicKeyCredentialType,
        transports: (c.transports ?? []) as AuthenticatorTransport[],
      })),
    },
  };
  const cred = await navigator.credentials.create(createOptions);
  if (!cred) throw new Error("Registration cancelled");
  return credentialToJSON(cred as PublicKeyCredential);
}

async function webauthnAuthenticate(options: Record<string, unknown>): Promise<Record<string, unknown>> {
  const pubKey = options as PublicKeyCredentialRequestOptionsJSON;
  const getOptions: CredentialRequestOptions = {
    publicKey: {
      challenge: b64uDecode(pubKey.challenge as string).buffer as ArrayBuffer,
      rpId: pubKey.rpId as string | undefined,
      timeout: (pubKey.timeout as number | undefined) ?? 60000,
      userVerification: (pubKey.userVerification as UserVerificationRequirement | undefined) ?? "required",
      allowCredentials: ((pubKey.allowCredentials ?? []) as Array<{ id: string; type: string; transports?: string[] }>).map((c) => ({
        id: b64uDecode(c.id).buffer as ArrayBuffer,
        type: c.type as PublicKeyCredentialType,
        transports: (c.transports ?? []) as AuthenticatorTransport[],
      })),
    },
  };
  const cred = await navigator.credentials.get(getOptions);
  if (!cred) throw new Error("Authentication cancelled");
  return credentialToJSON(cred as PublicKeyCredential);
}

type PublicKeyCredentialCreationOptionsJSON = {
  rp: { name: string; id?: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout?: number;
  attestation?: string;
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  excludeCredentials?: Array<{ id: string; type: string; transports?: string[] }>;
};
type PublicKeyCredentialRequestOptionsJSON = {
  challenge: string;
  rpId?: string;
  timeout?: number;
  userVerification?: string;
  allowCredentials?: Array<{ id: string; type: string; transports?: string[] }>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

// City → IANA timezone (no DST in either location)
function cityTz(city?: string | null): string {
  return (city ?? "manila").toLowerCase() === "dubai" ? "Asia/Dubai" : "Asia/Manila";
}

// Format ISO → local time string. tz defaults to Asia/Manila but accepts city-derived tz.
function fmtTime(iso: string | null, tz = "Asia/Manila"): string {
  if (!iso) return "--:--";
  try {
    return new Date(iso).toLocaleTimeString("en-PH", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
    });
  } catch {
    return "--:--";
  }
}

function minutesBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

function fmtDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function GpsIndicator({ ok, distM }: { ok: boolean | null; distM: number | null }) {
  if (ok === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-700/50 px-2 py-0.5 text-[10px] text-zinc-400">
        <MapPinOff size={10} /> No GPS
      </span>
    );
  }
  if (ok) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/40 px-2 py-0.5 text-[10px] text-emerald-400">
        <MapPin size={10} /> {distM != null ? `${distM}m` : "In Range"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-900/40 px-2 py-0.5 text-[10px] text-amber-400">
      <Navigation size={10} /> {distM != null ? `${distM}m (Out of Range)` : "Out of Range"}
    </span>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

// GPS positions are considered fresh for 5 minutes after acquisition.
// Defined outside the component so it is never re-created on every render.
const GPS_TTL_MS = 5 * 60 * 1000;

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AttendancePage() {
  const router = useRouter();
  const [auth, setAuth] = useState<ReturnType<typeof getAuth> | null>(null);
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [gpsPos, setGpsPos] = useState<GeolocationPosition | null>(null);
  const [gpsAcquiredAt, setGpsAcquiredAt] = useState<number | null>(null); // ms epoch
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null); // metres
  const [gpsError, setGpsError] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsPermissionDenied, setGpsPermissionDenied] = useState(false);
  const [gpsGuideTab, setGpsGuideTab] = useState<"ios" | "android">("ios");

  // Refs for GPS state — let doAction read the current GPS without a stale closure.
  // Without refs, doAction (which is memoised) would capture the initial null values.
  const gpsPosRef = useRef<GeolocationPosition | null>(null);
  const gpsAcquiredAtRef = useRef<number | null>(null);

  // GPS TTL: position valid for 5 minutes (GPS_TTL_MS is defined outside the component)
  const gpsValid = gpsPos !== null && gpsAcquiredAt !== null && Date.now() - gpsAcquiredAt < GPS_TTL_MS;
  const [visitBranch, setVisitBranch] = useState("");
  const [visitPickerOpen, setVisitPickerOpen] = useState(false);
  const [branchList, setBranchList] = useState<string[]>([]);
  // Triggers elapsed-time re-render every minute while on shift
  const [, setElapsedTick] = useState(0);
  // Regularization / correction request form
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionField, setCorrectionField] = useState<"check_in" | "check_out" | "both">("check_out");
  const [correctionCheckIn, setCorrectionCheckIn] = useState("");
  const [correctionCheckOut, setCorrectionCheckOut] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionDone, setCorrectionDone] = useState(false);

  // ─── Auth guard ───────────────────────────────────────────────────────────
  useEffect(() => {
    const a = getAuth();
    if (!a) { setLoading(false); router.replace("/login?next=%2Fattendance"); return; }
    if (!canAccessAttendancePage(a)) { setLoading(false); router.replace("/request"); return; }
    setAuth(a);
  }, [router]);

  // ─── Load today's status ──────────────────────────────────────────────────
  // silent=true: swallows errors (used after a successful action so the action
  // success message is not overwritten by a transient network hiccup)
  const fetchToday = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const a = getAuth();
    if (!a) return;
    try {
      const res = await fetch(`${API_BASE}/api/attendance/today`, {
        headers: getAuthHeaders(a),
        cache: "no-store",
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = text;
        try { const j = JSON.parse(text) as { detail?: string; message?: string }; msg = j.detail || j.message || text; } catch { /* non-JSON */ }
        throw new Error(msg);
      }
      setData(await res.json());
    } catch (e) {
      if (!silent) setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (auth) void fetchToday(); }, [auth, fetchToday]);

  // ─── GPS acquisition ──────────────────────────────────────────────────────
  // maximumAge: 0  → always request a fresh fix; never accept a cached browser position.
  // enableHighAccuracy: true → request best available fix (uses GPS chip on mobile).
  // timeout: 15000 → allow up to 15 s for a high-accuracy indoor fix.
  const acquireGps = useCallback((): Promise<GeolocationPosition | null> => {
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setGpsError("GPS is not available on this device.");
        resolve(null);
        return;
      }
      setGpsLoading(true);
      setGpsError("");
      setGpsPermissionDenied(false);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsPos(pos);
          setGpsAcquiredAt(Date.now());
          setGpsAccuracy(pos.coords.accuracy);
          setGpsPermissionDenied(false);
          setGpsLoading(false);
          resolve(pos);
        },
        (err) => {
          if (err.code === 1) {
            // GeolocationPositionError.PERMISSION_DENIED
            setGpsPermissionDenied(true);
            setGpsError("Location access is blocked. Please enable it in your device settings (see guide below).");
          } else if (err.code === 2) {
            // GeolocationPositionError.POSITION_UNAVAILABLE
            setGpsError("Your location could not be determined. Move to an area with better GPS signal and try again.");
          } else if (err.code === 3) {
            // GeolocationPositionError.TIMEOUT
            setGpsError("Location request timed out. Move outside or near a window, then try again.");
          } else {
            setGpsError(`Location error: ${err.message}`);
          }
          setGpsLoading(false);
          resolve(null);
        },
        { timeout: 15000, enableHighAccuracy: true, maximumAge: 0 },
      );
    });
  }, []);

  // ─── Branch list for visit picker ────────────────────────────────────────
  useEffect(() => {
    if (!auth) return;
    const city = (auth.city || "manila").toLowerCase();
    fetch(`${API_BASE}/api/admin/attendance/branch-gps?city=${encodeURIComponent(city)}`, {
      headers: getAuthHeaders(auth),
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j) => setBranchList((j.branches || []).map((b: { branch_code: string }) => b.branch_code)))
      .catch(() => {});
  }, [auth]);

  // ─── Auto-dismiss success/error messages after 5 s ───────────────────────
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(""), 5000);
    return () => clearTimeout(t);
  }, [success]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 8000);
    return () => clearTimeout(t);
  }, [error]);

  // ─── Keep GPS refs in sync with state ────────────────────────────────────
  // doAction is memoised and would otherwise capture stale null values via closure.
  useEffect(() => { gpsPosRef.current = gpsPos; }, [gpsPos]);
  useEffect(() => { gpsAcquiredAtRef.current = gpsAcquiredAt; }, [gpsAcquiredAt]);

  // ─── GPS TTL checker — re-renders every 30 s to clear stale gpsPos ──────
  useEffect(() => {
    if (!gpsAcquiredAt) return;
    const id = setInterval(() => {
      // Force re-render; gpsValid is recomputed on each render
      setElapsedTick((n) => n + 1);
    }, 30_000);
    return () => clearInterval(id);
  }, [gpsAcquiredAt]);

  // ─── Live elapsed-time refresh while on shift ─────────────────────────────
  // Re-renders every 60 s so the Elapsed counter isn't frozen between actions.
  useEffect(() => {
    const checkedIn = !!data?.session?.check_in_at;
    const checkedOut = !!data?.session?.check_out_at;
    if (!checkedIn || checkedOut) return;
    const id = setInterval(() => setElapsedTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [data?.session?.check_in_at, data?.session?.check_out_at]);

  // ─── WebAuthn action ──────────────────────────────────────────────────────
  const doAction = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      const a = getAuth();
      if (!a) return;
      setBusy(true); setError(""); setSuccess("");
      try {
        // Use the cached GPS fix if it is still within the 5-minute TTL.
        // Only call acquireGps() when the cached position has expired or was never obtained.
        // This eliminates the 0–15 s re-acquisition wait every time the user taps Clock In/Out.
        const cachedPos = gpsPosRef.current;
        const cachedAt = gpsAcquiredAtRef.current;
        const cacheStillValid =
          cachedPos !== null && cachedAt !== null && Date.now() - cachedAt < GPS_TTL_MS;
        const pos = cacheStillValid ? cachedPos : await acquireGps();
        const lat = pos?.coords.latitude ?? null;
        const lng = pos?.coords.longitude ?? null;

        // GPS is required for clock-in and clock-out
        if ((action === "checkin" || action === "checkout") && !pos) {
          throw new Error("GPS location is required. Please tap 'Get My Location' and ensure location access is allowed in your device settings.");
        }

        const optRes = await fetch(`${API_BASE}/api/attendance/action/options`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders(a) },
          body: JSON.stringify({ action, ...extra }),
        });
        if (!optRes.ok) {
          const e = await optRes.json().catch(() => ({ detail: "Error" }));
          throw new Error(e.detail || "Failed to get options");
        }
        const { state_token, options } = await optRes.json();
        const credential = await webauthnAuthenticate(options as Record<string, unknown>);

        const verRes = await fetch(`${API_BASE}/api/attendance/action/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders(a) },
          body: JSON.stringify({ state_token, credential, action, lat, lng, ...extra }),
        });
        if (!verRes.ok) {
          const e = await verRes.json().catch(() => ({ detail: "Error" }));
          throw new Error(e.detail || "Authentication failed");
        }
        const labels: Record<string, string> = {
          checkin: "Clocked in ✓",
          checkout: "Clocked out ✓",
          visit_start: "Visit started ✓",
          visit_end: "Visit ended ✓",
        };
        setSuccess(labels[action] ?? "Done ✓");
        if (action === "checkout") setVisitPickerOpen(false);
        await fetchToday({ silent: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        // DOMException has .name ("NotAllowedError", "AbortError"); check both name and message
        const eName = e instanceof DOMException ? e.name : "";
        const isUserCancelled =
          eName === "NotAllowedError" || eName === "AbortError" ||
          msg.includes("AbortError") || msg.includes("User cancelled") || msg.includes("NotAllowedError");
        if (!isUserCancelled) {
          setError(msg);
        }
      } finally {
        setBusy(false);
      }
    },
    [acquireGps, fetchToday],
  );

  // ─── Device registration ──────────────────────────────────────────────────
  const doRegister = useCallback(async () => {
    const a = getAuth();
    if (!a) return;
    setBusy(true); setError(""); setSuccess(""); setGpsError("");
    try {
      const optRes = await fetch(`${API_BASE}/api/auth/webauthn/register/options`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(a) },
        body: JSON.stringify({ friendly_name: "My Device" }),
      });
      if (!optRes.ok) {
        const e = await optRes.json().catch(() => ({ detail: "Error" }));
        throw new Error(e.detail || "Failed to get options");
      }
      const { state_token, options } = await optRes.json();
      const credential = await webauthnRegister(options as Record<string, unknown>);

      const verRes = await fetch(`${API_BASE}/api/auth/webauthn/register/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(a) },
        body: JSON.stringify({ state_token, credential, friendly_name: "My Device" }),
      });
      if (!verRes.ok) {
        const e = await verRes.json().catch(() => ({ detail: "Error" }));
        throw new Error(e.detail || "Registration failed");
      }
      setSuccess("Device registered! You can now clock in.");
      await fetchToday({ silent: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const eName = e instanceof DOMException ? e.name : "";
      const isUserCancelled =
        eName === "NotAllowedError" || eName === "AbortError" ||
        msg.includes("AbortError") || msg.includes("NotAllowedError");
      if (!isUserCancelled) setError(msg);
    } finally {
      setBusy(false);
    }
  }, [fetchToday]);

  // ─── Derived state ────────────────────────────────────────────────────────

  const session = data?.session ?? null;
  const visits = data?.visits ?? [];
  const passkeyCount = data?.passkey_count ?? 0;
  // Fallback uses city-aware local date so Manila/Dubai midnight never shows yesterday
  const tz = cityTz(auth?.city);
  const today = data?.today ?? new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const isCheckedIn = !!session?.check_in_at;
  const isCheckedOut = !!session?.check_out_at;
  const openVisits = visits.filter((v) => !v.visit_end);
  const closedVisits = visits.filter((v) => v.visit_end);
  // Branches already being visited (open visit) are excluded from picker to avoid duplicates
  const availableBranches = branchList.filter(
    (b) => !openVisits.some((v) => v.branch_code.toUpperCase() === b.toUpperCase()),
  );
  // Math.max(0, ...) guards against client/server clock skew producing negative elapsed time
  const workedMinutes = isCheckedIn
    ? Math.max(0, minutesBetween(session!.check_in_at!, isCheckedOut ? session!.check_out_at! : new Date().toISOString()))
    : 0;
  const wauSupported = typeof window !== "undefined" && !!window.PublicKeyCredential;

  // ─── Correction submit ────────────────────────────────────────────────────
  async function submitCorrection() {
    if (!auth || !data) return;
    if (!correctionReason.trim()) return;
    setCorrectionBusy(true);
    try {
      const body: Record<string, string> = {
        work_date: data.today,
        reason: correctionReason.trim(),
      };
      if (session?.id) body.session_id = session.id;
      if ((correctionField === "check_in" || correctionField === "both") && correctionCheckIn)
        body.requested_check_in = correctionCheckIn;
      if ((correctionField === "check_out" || correctionField === "both") && correctionCheckOut)
        body.requested_check_out = correctionCheckOut;

      const r = await fetch(`${API_BASE}/api/attendance/corrections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json() as { detail?: string };
        setError(j.detail || "Failed to submit correction");
        return;
      }
      setCorrectionDone(true);
      setCorrectionOpen(false);
      setCorrectionReason("");
    } catch {
      setError("Failed to submit correction — please try again");
    } finally {
      setCorrectionBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Fingerprint size={22} className="text-violet-400" />
        <h1 className="text-lg font-semibold text-white">Attendance</h1>
        <span className="ml-auto text-xs text-zinc-500">{today}</span>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-900/30 border border-red-700/40 px-3 py-2.5 text-sm text-red-300">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded-xl bg-emerald-900/30 border border-emerald-700/40 px-3 py-2.5 text-sm text-emerald-300">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* WebAuthn not supported */}
      {!wauSupported && (
        <div className={`${GLASS_CARD} rounded-2xl p-4 text-sm text-amber-300`}>
          This browser does not support passkeys. Please use Chrome or Safari.
        </div>
      )}

      {/* Device registration */}
      {wauSupported && passkeyCount === 0 && (
        <div className={`${GLASS_CARD} rounded-2xl p-5 space-y-3`}>
          <div className="flex items-center gap-2">
            <Fingerprint size={18} className="text-violet-400" />
            <p className="text-sm font-medium text-white">Register Your Device</p>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Use this device&apos;s face or fingerprint recognition to clock in and out. Register once to get started.
          </p>
          <button
            onClick={doRegister}
            disabled={busy}
            className="w-full rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white disabled:opacity-50 hover:bg-violet-500 transition-colors"
          >
            {busy ? "Registering..." : "Register This Device"}
          </button>
        </div>
      )}

      {/* Status card */}
      {wauSupported && passkeyCount > 0 && (
        <div className={`${GLASS_CARD} rounded-2xl p-5 space-y-4`}>
          {/* Status badge */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 uppercase tracking-wide">Today&apos;s Status</span>
            {isCheckedOut ? (
              <span className="rounded-full bg-zinc-700/60 px-2.5 py-0.5 text-[11px] font-medium text-zinc-300">Clocked Out</span>
            ) : isCheckedIn ? (
              <span className="rounded-full bg-emerald-900/50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">On Shift</span>
            ) : (
              <span className="rounded-full bg-zinc-700/60 px-2.5 py-0.5 text-[11px] font-medium text-zinc-400">Not Clocked In</span>
            )}
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-zinc-900/50 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500"><LogIn size={10} /> Clock In</div>
              <div className="text-xl font-bold text-white tabular-nums">{fmtTime(session?.check_in_at ?? null, tz)}</div>
              {session?.check_in_at && <GpsIndicator ok={session.check_in_gps_ok} distM={session.check_in_distance_m} />}
            </div>
            <div className="rounded-xl bg-zinc-900/50 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500"><LogOut size={10} /> Clock Out</div>
              <div className="text-xl font-bold text-white tabular-nums">{fmtTime(session?.check_out_at ?? null, tz)}</div>
              {session?.check_out_at && <GpsIndicator ok={session.check_out_gps_ok} distM={session.check_out_distance_m} />}
            </div>
          </div>

          {/* Duration */}
          {isCheckedIn && (
            <div className="flex items-center justify-between rounded-xl bg-zinc-900/50 px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Clock size={12} /> {isCheckedOut ? "Duration" : "Elapsed"}
              </div>
              <span className="text-sm font-semibold text-white tabular-nums">{fmtDuration(workedMinutes)}</span>
            </div>
          )}

          {/* GPS required — prominent call-to-action shown BEFORE the clock button */}
          {!isCheckedOut && !gpsValid && (
            <div className="rounded-2xl border-2 border-violet-500 bg-violet-950/60 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Navigation size={18} className="text-violet-300 shrink-0" />
                <p className="text-sm font-bold text-violet-200">
                  {gpsPos ? "Location expired — refresh required" : "Step 1: Get Your Location"}
                </p>
              </div>
              <p className="text-xs text-violet-300/80 leading-relaxed">
                {gpsPos
                  ? "Your GPS fix expired (5 min). Tap below to get a fresh position before clocking in/out."
                  : "You must be within 50m of your branch. Tap the button below first — Clock In will become available once your location is confirmed."}
              </p>
              <button
                onClick={() => { void acquireGps(); }}
                disabled={gpsLoading}
                className="w-full rounded-xl bg-violet-600 py-4 text-base font-bold text-white disabled:opacity-50 hover:bg-violet-500 active:bg-violet-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-violet-900/40"
              >
                <Navigation size={18} />
                {gpsLoading ? "Detecting Location..." : "Get My Location"}
              </button>
              {gpsLoading && (
                <p className="text-center text-xs text-violet-400 animate-pulse">Please wait — detecting your position...</p>
              )}
              {gpsError && !gpsLoading && (
                <p className="rounded-lg bg-amber-900/30 border border-amber-700/40 px-3 py-2 text-xs text-amber-300">
                  ⚠️ {gpsError}
                </p>
              )}

              {/* Device settings guide — shown when location permission is denied */}
              {gpsPermissionDenied && (
                <div className="rounded-xl bg-zinc-900/80 border border-zinc-700/50 p-3 space-y-3">
                  <p className="text-xs font-semibold text-zinc-200">
                    📱 How to Enable Location Access
                  </p>
                  {/* Device tab selector */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setGpsGuideTab("ios")}
                      className={`rounded-lg py-2 text-xs font-semibold transition-colors ${
                        gpsGuideTab === "ios"
                          ? "bg-violet-600 text-white"
                          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                      }`}
                    >
                      🍎 iPhone
                    </button>
                    <button
                      onClick={() => setGpsGuideTab("android")}
                      className={`rounded-lg py-2 text-xs font-semibold transition-colors ${
                        gpsGuideTab === "android"
                          ? "bg-violet-600 text-white"
                          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                      }`}
                    >
                      🤖 Android
                    </button>
                  </div>

                  {/* iPhone steps */}
                  {gpsGuideTab === "ios" && (
                    <ol className="space-y-2.5">
                      {[
                        { n: 1, text: "Open the iPhone Settings app (⚙️)." },
                        { n: 2, text: 'Tap "Privacy & Security".' },
                        { n: 3, text: 'Tap "Location Services" and make sure it is turned ON.' },
                        { n: 4, text: "Scroll down and find your browser (Safari or Chrome) in the list." },
                        { n: 5, text: 'Set it to "While Using the App" or "Always".' },
                        { n: 6, text: 'Return here and tap "Get My Location" again.' },
                      ].map(({ n, text }) => (
                        <li key={n} className="flex items-start gap-2.5">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-700/60 text-[10px] font-bold text-violet-200">
                            {n}
                          </span>
                          <span className="text-xs text-zinc-300 leading-relaxed">{text}</span>
                        </li>
                      ))}
                    </ol>
                  )}

                  {/* Android steps */}
                  {gpsGuideTab === "android" && (
                    <ol className="space-y-2.5">
                      {[
                        { n: 1, text: "Open the Settings app on your Android phone." },
                        { n: 2, text: 'Tap "Apps" (or "Applications").' },
                        { n: 3, text: "Find and tap your browser (Chrome, Samsung Internet, etc.)." },
                        { n: 4, text: 'Tap "Permissions" → then tap "Location".' },
                        { n: 5, text: 'Select "Allow only while using the app" or "Ask every time".' },
                        { n: 6, text: 'Return here and tap "Get My Location" again.' },
                      ].map(({ n, text }) => (
                        <li key={n} className="flex items-start gap-2.5">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-700/60 text-[10px] font-bold text-violet-200">
                            {n}
                          </span>
                          <span className="text-xs text-zinc-300 leading-relaxed">{text}</span>
                        </li>
                      ))}
                    </ol>
                  )}

                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    If the steps above don&apos;t match your device, search for &quot;enable location permission&quot; in your phone&apos;s settings or ask your manager for help.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* GPS acquired confirmation */}
          {gpsValid && !isCheckedOut && (
            <div className="space-y-0.5">
              <p className="text-xs text-emerald-400">
                📍 Location acquired — ready to clock in/out
              </p>
              {gpsAccuracy !== null && gpsAccuracy > 100 && (
                <p className="text-xs text-amber-400">
                  ⚠️ GPS accuracy is low ({Math.round(gpsAccuracy)}m margin). Move outside or near a window and tap &quot;Get My Location&quot; again for a better fix.
                </p>
              )}
            </div>
          )}

          {/* Main actions */}
          {!isCheckedIn && !isCheckedOut && (
            <button
              onClick={() => doAction("checkin")}
              disabled={busy || !gpsValid}
              className="w-full rounded-xl bg-violet-600 py-4 text-base font-bold text-white disabled:opacity-30 hover:bg-violet-500 transition-colors flex items-center justify-center gap-2"
            >
              <LogIn size={18} />
              {busy ? "Authenticating..." : "Clock In"}
            </button>
          )}
          {isCheckedIn && !isCheckedOut && (
            <button
              onClick={() => doAction("checkout")}
              disabled={busy || !gpsValid}
              className="w-full rounded-xl bg-rose-700 py-4 text-base font-bold text-white disabled:opacity-30 hover:bg-rose-600 transition-colors flex items-center justify-center gap-2"
            >
              <LogOut size={18} />
              {busy ? "Authenticating..." : "Clock Out"}
            </button>
          )}
          {isCheckedOut && (
            <div className="space-y-2">
              <div className="rounded-xl bg-zinc-800/50 px-3 py-3 text-center text-sm text-zinc-400">
                You&apos;ve clocked out for today. Great work!
              </div>

              {/* Correction / regularization request */}
              {correctionDone ? (
                <div className="rounded-xl bg-violet-900/30 border border-violet-500/20 px-3 py-3 text-center text-xs text-violet-300">
                  <CheckCircle2 size={14} className="inline mr-1 mb-0.5" />
                  Correction request submitted — your admin will review it.
                </div>
              ) : (
                <div>
                  <button
                    onClick={() => setCorrectionOpen(o => !o)}
                    className="flex w-full items-center justify-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors pt-1"
                  >
                    <MessageSquare size={12} />
                    {correctionOpen ? "Cancel correction request" : "Something wrong? Request a correction"}
                    {correctionOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  </button>
                  {correctionOpen && (
                    <div className="mt-2 rounded-xl bg-zinc-900/60 border border-zinc-700/40 p-3 space-y-3">
                      <p className="text-xs font-medium text-zinc-300">What needs correcting?</p>
                      <div className="flex gap-2">
                        {(["check_in", "check_out", "both"] as const).map(f => (
                          <button
                            key={f}
                            onClick={() => setCorrectionField(f)}
                            className={`flex-1 rounded-lg py-1.5 text-xs transition-colors border ${
                              correctionField === f
                                ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                                : "border-zinc-700/40 text-zinc-500 hover:text-zinc-300"
                            }`}
                          >
                            {f === "check_in" ? "Clock In" : f === "check_out" ? "Clock Out" : "Both"}
                          </button>
                        ))}
                      </div>
                      {(correctionField === "check_in" || correctionField === "both") && (
                        <div>
                          <label className="text-xs text-zinc-500 mb-1 block">Correct clock-in time</label>
                          <input
                            type="time"
                            value={correctionCheckIn}
                            onChange={e => setCorrectionCheckIn(e.target.value)}
                            className="w-full rounded-lg border border-zinc-700/40 bg-zinc-800 px-3 py-1.5 text-sm text-white focus:border-violet-500/50 focus:outline-none"
                          />
                        </div>
                      )}
                      {(correctionField === "check_out" || correctionField === "both") && (
                        <div>
                          <label className="text-xs text-zinc-500 mb-1 block">Correct clock-out time</label>
                          <input
                            type="time"
                            value={correctionCheckOut}
                            onChange={e => setCorrectionCheckOut(e.target.value)}
                            className="w-full rounded-lg border border-zinc-700/40 bg-zinc-800 px-3 py-1.5 text-sm text-white focus:border-violet-500/50 focus:outline-none"
                          />
                        </div>
                      )}
                      <div>
                        <label className="text-xs text-zinc-500 mb-1 block">Reason (required)</label>
                        <textarea
                          value={correctionReason}
                          onChange={e => setCorrectionReason(e.target.value)}
                          rows={2}
                          placeholder="e.g. Forgot to clock out, was still working until 6pm"
                          className="w-full resize-none rounded-lg border border-zinc-700/40 bg-zinc-800 px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:border-violet-500/50 focus:outline-none"
                        />
                      </div>
                      <button
                        onClick={() => { void submitCorrection(); }}
                        disabled={correctionBusy || !correctionReason.trim()}
                        className="w-full rounded-xl bg-violet-700 py-2.5 text-sm font-semibold text-white disabled:opacity-30 hover:bg-violet-600 transition-colors"
                      >
                        {correctionBusy ? "Submitting..." : "Submit Request"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Register this device — shown when passkeys exist but this device may not be enrolled */}
          <div className="border-t border-zinc-700/40 pt-3">
            <button
              onClick={doRegister}
              disabled={busy}
              className="flex w-full items-center justify-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-40 transition-colors"
            >
              <Fingerprint size={12} />
              Register this device (add / replace passkey)
            </button>
          </div>
        </div>
      )}

      {/* Visits — shown when checked in (read-only after checkout) */}
      {wauSupported && passkeyCount > 0 && isCheckedIn && (
        <div className={`${GLASS_CARD} rounded-2xl p-5 space-y-3`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">Branch Visits</span>
            {!isCheckedOut && (
              <button
                onClick={() => {
                  setVisitPickerOpen((o) => {
                    if (o) setVisitBranch(""); // clear selection when closing
                    return !o;
                  });
                }}
                className="flex items-center gap-1 rounded-lg bg-violet-700/30 px-2.5 py-1 text-xs text-violet-300 hover:bg-violet-700/50"
              >
                <Plus size={12} /> Start Visit
                {visitPickerOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            )}
          </div>

          {!isCheckedOut && visitPickerOpen && (
            <div className="rounded-xl bg-zinc-900/60 p-3 space-y-2">
              <p className="text-xs text-zinc-400">Select a branch to visit</p>
              {availableBranches.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  {branchList.length === 0
                    ? "No branches configured. Set up GPS in Admin first."
                    : "All configured branches already have an open visit."}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableBranches.map((b) => (
                    <button
                      key={b}
                      onClick={() => setVisitBranch(b)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        visitBranch === b ? "bg-violet-600 text-white" : "bg-zinc-700/60 text-zinc-300 hover:bg-zinc-600/60"
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              )}
              {visitBranch && (
                <button
                  onClick={async () => {
                    const branch = visitBranch;
                    setVisitBranch("");
                    setVisitPickerOpen(false);
                    await doAction("visit_start", { branch_code: branch });
                  }}
                  disabled={busy}
                  className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-violet-500"
                >
                  {busy ? "Starting..." : `Start visit to ${visitBranch}`}
                </button>
              )}
            </div>
          )}

          {openVisits.map((v) => (
            <div key={v.id} className="rounded-xl bg-emerald-900/20 border border-emerald-800/30 px-3 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-emerald-300">{v.branch_code}</span>
                <span className="rounded-full bg-emerald-800/40 px-2 py-0.5 text-[10px] text-emerald-400">Visiting</span>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Started {fmtTime(v.visit_start, tz)}</span>
                <GpsIndicator ok={v.gps_ok} distM={v.distance_m} />
              </div>
              {!isCheckedOut && (
                <button
                  onClick={() => { void doAction("visit_end", { visit_id: v.id }); }}
                  disabled={busy}
                  className="flex items-center gap-1 rounded-lg bg-rose-800/40 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-800/60 disabled:opacity-50"
                >
                  <Square size={10} /> End Visit
                </button>
              )}
            </div>
          ))}

          {closedVisits.map((v) => (
            <div key={v.id} className="rounded-xl bg-zinc-800/40 px-3 py-2.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-300">{v.branch_code}</span>
                <span className="text-xs text-zinc-500">{fmtTime(v.visit_start, tz)} → {fmtTime(v.visit_end, tz)}</span>
              </div>
              {v.visit_start && v.visit_end && (
                <p className="text-xs text-zinc-500">{fmtDuration(minutesBetween(v.visit_start, v.visit_end))}</p>
              )}
            </div>
          ))}

          {visits.length === 0 && !visitPickerOpen && (
            <p className="text-xs text-zinc-500">No visits recorded</p>
          )}
        </div>
      )}

    </div>
  );
}
