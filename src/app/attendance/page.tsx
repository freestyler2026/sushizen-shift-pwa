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

interface AttendanceBreak {
  id: string;
  session_id: string;
  break_in_at: string;
  break_out_at: string | null;
  duration_min: number | null;
  reminder_sent: boolean;
}

interface TodayData {
  today: string;
  passkey_count: number;
  gps_exempt?: boolean;
  multi_branch?: boolean;
  session: AttendanceSession | null;
  visits: AttendanceVisit[];
  breaks: AttendanceBreak[];
  open_session_yesterday: AttendanceSession | null;
  scheduled_shift: { start_hour: number; end_hour: number; role: string; branch_code: string } | null;
  lateness_min: number | null;
  shift_elapsed_min: number | null;
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
  const [mealAllowanceBanner, setMealAllowanceBanner] = useState<{ amount: number; isBonus?: boolean } | null>(null);
  const [probationStatus, setProbationStatus] = useState<{
    is_probation: boolean;
    graduated?: boolean;
    current_cycle?: { absent_count: number; late_count: number; total_late_minutes: number; cycle_end_date?: string; termination_flagged?: boolean };
    rolling_30d?: { absent_count: number; late_count: number; total_late_minutes: number };
  } | null>(null);
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
  // Missed clock-out correction (for open session from previous day)
  const [unclosedCorrOpen, setUnclosedCorrOpen] = useState(false);
  const [unclosedCorrCheckOut, setUnclosedCorrCheckOut] = useState("");
  const [unclosedCorrReason, setUnclosedCorrReason] = useState("");
  const [unclosedCorrBusy, setUnclosedCorrBusy] = useState(false);
  const [unclosedCorrDone, setUnclosedCorrDone] = useState(false);
  const [lateBannerDismissed, setLateBannerDismissed] = useState(false);
  const [showClockOutConfirm, setShowClockOutConfirm] = useState(false);
  const [wfhToday, setWfhToday] = useState(false);
  const [wfhBusy, setWfhBusy] = useState(false);
  const wfhTodayRef = useRef(false);
  const gpsExemptRef = useRef(false);
  const multiBranchRef = useRef(false);
  const [breaks, setBreaks] = useState<AttendanceBreak[]>([]);
  const [breakElapsedSec, setBreakElapsedSec] = useState(0);
  const breakTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const breakReminderRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const d = await res.json() as TodayData;
      setData(d);
      setBreaks(d.breaks ?? []);
    } catch (e) {
      if (!silent) setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWfhStatus = useCallback(async () => {
    const a = getAuth();
    if (!a) return;
    try {
      const res = await fetch(`${API_BASE}/api/attendance/wfh_status`, {
        headers: getAuthHeaders(a),
        cache: "no-store",
      });
      if (res.ok) {
        const j = await res.json() as { wfh_today?: boolean };
        const v = !!j.wfh_today;
        setWfhToday(v);
        wfhTodayRef.current = v;
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (auth) {
      void fetchToday();
      void fetchWfhStatus();
    }
  }, [auth, fetchToday, fetchWfhStatus]);

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
  useEffect(() => { wfhTodayRef.current = wfhToday; }, [wfhToday]);
  useEffect(() => { gpsExemptRef.current = data?.gps_exempt === true; }, [data]);
  useEffect(() => { multiBranchRef.current = data?.multi_branch === true; }, [data]);

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

        // GPS is required for clock-in and clock-out (unless WFH mode or GPS-exempt)
        if ((action === "checkin" || action === "checkout") && !pos && !wfhTodayRef.current && !gpsExemptRef.current) {
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
        const verJson = await verRes.json().catch(() => ({}));
        const labels: Record<string, string> = {
          checkin: "Clocked in ✓",
          checkout: "Clocked out ✓",
          visit_start: "Visit started ✓",
          visit_end: "Visit ended ✓",
          break_in: "Break started ✓",
          break_out: "Break ended ✓",
        };
        setSuccess(labels[action] ?? "Done ✓");
        if (action === "checkout") {
          setVisitPickerOpen(false);
          // Show Probation bonus banner (2,000 PHP)
          if (verJson?.probation_bonus_awarded === true) {
            setMealAllowanceBanner({ amount: 2000, isBonus: true });
            setTimeout(() => setMealAllowanceBanner(null), 10000);
          } else if (verJson?.meal_allowance_awarded === true) {
            // Show regular Meal Allowance banner
            setMealAllowanceBanner({ amount: Number(verJson.meal_allowance_amount || 50) });
            setTimeout(() => setMealAllowanceBanner(null), 8000);
          }
          // Update probation status
          if (verJson?.probation && verJson.probation.is_probation) {
            setProbationStatus(verJson.probation);
          }
        }
        if (action === "break_in") {
          const newBreak = (verJson as { break?: { break_in_at?: string } })?.break;
          if (newBreak?.break_in_at) {
            scheduleBreakReminder(newBreak.break_in_at);
          }
          // Request notification permission and subscribe to push
          if (typeof Notification !== "undefined" && Notification.permission === "default") {
            await Notification.requestPermission().catch(() => {});
          }
          void subscribeBreakPush();
        }
        if (action === "break_out") {
          if (breakReminderRef.current) { clearTimeout(breakReminderRef.current); breakReminderRef.current = null; }
        }
        await fetchToday({ silent: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        // DOMException has .name ("NotAllowedError", "AbortError"); check both name and message
        const eName = e instanceof DOMException ? e.name : "";
        const isUserCancelled =
          eName === "NotAllowedError" || eName === "AbortError" ||
          msg.includes("AbortError") || msg.includes("User cancelled") || msg.includes("NotAllowedError");
        // "Not implemented" / "NotImplementedError" means the passkey credential is not found on
        // this device (e.g. registered on a different phone, or device was reset).
        // Shown on some Android Chrome versions when allowCredentials has no local match.
        const isPasskeyMissing =
          eName === "NotImplementedError" || eName === "NotSupportedError" ||
          msg.toLowerCase().includes("not implemented") || msg.toLowerCase().includes("not supported");
        if (!isUserCancelled) {
          setError(
            isPasskeyMissing
              ? "Passkey not found on this device. Please tap \"Register this device\" below to set up your passkey, then try again."
              : msg
          );
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
        body: JSON.stringify({ friendly_name: "My Device", replace: true }),
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
      const isPasskeyMissing =
        eName === "NotImplementedError" || eName === "NotSupportedError" ||
        msg.toLowerCase().includes("not implemented") || msg.toLowerCase().includes("not supported");
      if (!isUserCancelled) {
        setError(
          isPasskeyMissing
            ? "This device or browser does not support passkeys. Please update Chrome to the latest version, ensure Google Play Services is up to date, and make sure a screen lock (PIN or fingerprint) is set up."
            : msg
        );
      }
    } finally {
      setBusy(false);
    }
  }, [fetchToday]);

  // ─── Derived state ────────────────────────────────────────────────────────

  const session = data?.session ?? null;
  const visits = data?.visits ?? [];
  const passkeyCount = data?.passkey_count ?? 0;
  const gpsExempt = data?.gps_exempt === true;
  const multiBranch = data?.multi_branch === true;
  // Fallback uses city-aware local date so Manila/Dubai midnight never shows yesterday
  const tz = cityTz(auth?.city);
  const today = data?.today ?? new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  // Dubai split schedules allow 2-hour breaks; Manila standard is 1 hour
  const breakLimitSec = auth?.city === "dubai" ? 120 * 60 : 60 * 60;
  const breakWarnSec = breakLimitSec - 10 * 60; // warn 10 min before limit
  const isCheckedIn = !!session?.check_in_at;
  const isCheckedOut = !!session?.check_out_at;
  const activeBreak = breaks.find((b) => b.break_in_at && !b.break_out_at) ?? null;
  const isOnBreak = !!activeBreak;

  // Re-schedule break reminder on page load if a break is already active
  useEffect(() => {
    if (activeBreak?.break_in_at) {
      scheduleBreakReminder(activeBreak.break_in_at);
    }
    return () => {
      if (breakReminderRef.current) { clearTimeout(breakReminderRef.current); breakReminderRef.current = null; }
    };
  }, [activeBreak?.break_in_at]);
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

  // ─── Break elapsed timer ──────────────────────────────────────────────────
  useEffect(() => {
    if (activeBreak) {
      const update = () => {
        const elapsed = Math.floor((Date.now() - new Date(activeBreak.break_in_at).getTime()) / 1000);
        setBreakElapsedSec(Math.max(0, elapsed));
      };
      update();
      breakTimerRef.current = setInterval(update, 1000);
    } else {
      if (breakTimerRef.current) { clearInterval(breakTimerRef.current); breakTimerRef.current = null; }
      setBreakElapsedSec(0);
    }
    return () => { if (breakTimerRef.current) { clearInterval(breakTimerRef.current); breakTimerRef.current = null; } };
  }, [activeBreak]);

  // ─── Break push subscription ──────────────────────────────────────────────
  async function subscribeBreakPush() {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      const reg = await navigator.serviceWorker.register("/sw-push.js");
      await navigator.serviceWorker.ready;
      const a = getAuth();
      if (!a) return;
      const keyRes = await fetch(`${API_BASE}/api/attendance/vapid-public-key`, {
        headers: getAuthHeaders(a),
      });
      if (!keyRes.ok) return;
      const { public_key: vapidKey } = await keyRes.json() as { public_key: string };
      if (!vapidKey) return;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      });
      const subJson = sub.toJSON();
      await fetch(`${API_BASE}/api/attendance/break-push-subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(a) },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          p256dh: subJson.keys?.p256dh ?? "",
          auth: subJson.keys?.auth ?? "",
        }),
      });
    } catch { /* best-effort */ }
  }

  // Client-side 50-min fallback reminder via SW message (works if tab is open)
  function scheduleBreakReminder(breakInAt: string) {
    if (breakReminderRef.current) { clearTimeout(breakReminderRef.current); breakReminderRef.current = null; }
    const elapsed = Date.now() - new Date(breakInAt).getTime();
    const remaining = breakWarnSec * 1000 - elapsed;
    if (remaining <= 0) return;
    breakReminderRef.current = setTimeout(async () => {
      try {
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
          if (reg?.active) {
            reg.active.postMessage({ type: "SHOW_BREAK_REMINDER" });
            return;
          }
        }
      } catch { /* fall through */ }
      // Fallback: browser Notification API
      if (Notification.permission === "granted") {
        new Notification("Break reminder", { body: "10 minutes left on your break — time to head back!" });
      }
    }, remaining);
  }

  // WFH declaration ─────────────────────────────────────────────────────
  async function declareWfh() {
    const a = getAuth();
    if (!a) return;
    setWfhBusy(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/attendance/wfh_declare`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(a) },
      });
      if (res.ok) {
        setWfhToday(true);
        wfhTodayRef.current = true;
        setSuccess("WFH mode activated — GPS not required today ✓");
      } else {
        const j = await res.json().catch(() => ({ detail: "Failed" })) as { detail?: string };
        setError(j.detail || "Failed to declare WFH");
      }
    } catch {
      setError("Failed to declare WFH — please try again");
    } finally {
      setWfhBusy(false);
    }
  }

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

  // ─── Missed clock-out correction submit ───────────────────────────────────
  async function submitUnclosedCorrection() {
    const unclosed = data?.open_session_yesterday;
    if (!auth || !unclosed) return;
    if (!unclosedCorrCheckOut || !unclosedCorrReason.trim()) return;
    setUnclosedCorrBusy(true);
    try {
      const body: Record<string, string> = {
        work_date: unclosed.work_date,
        session_id: unclosed.id,
        requested_check_out: unclosedCorrCheckOut,
        reason: unclosedCorrReason.trim(),
      };
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
      setUnclosedCorrDone(true);
      setUnclosedCorrOpen(false);
      setUnclosedCorrReason("");
    } catch {
      setError("Failed to submit correction — please try again");
    } finally {
      setUnclosedCorrBusy(false);
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
        <div>
          <h1 className="text-lg font-semibold text-white">Attendance</h1>
          {auth?.staffName && (
            <p className="text-xs text-zinc-400">{auth.staffName}</p>
          )}
        </div>
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
      {/* ── Missed clock-out banner ──────────────────────────────────────────── */}
      {data?.open_session_yesterday && !unclosedCorrDone && (() => {
        const s = data.open_session_yesterday!;
        const dateLabel = s.work_date;
        const clockInLabel = s.check_in_at
          ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: cityTz(auth?.city) }).format(new Date(s.check_in_at))
          : "—";
        return (
          <div className="rounded-2xl border border-orange-500/50 bg-orange-950/30 px-4 py-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="text-orange-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-orange-300">Missed Clock-Out Detected</p>
                <p className="text-xs text-orange-300/70 mt-0.5">
                  Your shift on <span className="font-medium text-orange-200">{dateLabel}</span> was
                  never closed (clocked in at {clockInLabel}, no clock-out recorded).
                </p>
              </div>
            </div>

            {unclosedCorrOpen ? (
              <div className="space-y-2.5 pt-1">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">What time did you finish work on {dateLabel}?</label>
                  <input
                    type="time"
                    value={unclosedCorrCheckOut}
                    onChange={e => setUnclosedCorrCheckOut(e.target.value)}
                    className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Reason / details</label>
                  <textarea
                    value={unclosedCorrReason}
                    onChange={e => setUnclosedCorrReason(e.target.value)}
                    rows={2}
                    placeholder="e.g. System error prevented clock-out, finished at 10pm"
                    className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2 text-sm text-white resize-none placeholder:text-zinc-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => void submitUnclosedCorrection()}
                    disabled={unclosedCorrBusy || !unclosedCorrCheckOut || !unclosedCorrReason.trim()}
                    className="flex-1 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-40 px-3 py-2 text-sm font-medium text-white"
                  >
                    {unclosedCorrBusy ? "Submitting…" : "Submit Correction Request"}
                  </button>
                  <button
                    onClick={() => setUnclosedCorrOpen(false)}
                    className="rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setUnclosedCorrOpen(true)}
                className="w-full rounded-lg border border-orange-500/60 bg-orange-900/30 hover:bg-orange-900/50 px-3 py-2 text-sm font-medium text-orange-300"
              >
                Submit Missed Clock-Out Request
              </button>
            )}
          </div>
        );
      })()}

      {unclosedCorrDone && (
        <div className="flex items-start gap-2 rounded-xl bg-emerald-900/30 border border-emerald-700/40 px-3 py-2.5 text-sm text-emerald-300">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          <span>Missed clock-out correction submitted — your manager will review it shortly.</span>
        </div>
      )}

      {/* ── Late / not-clocked-in banner ─────────────────────────────────────── */}
      {data?.scheduled_shift && !lateBannerDismissed && (() => {
        const shift = data.scheduled_shift!;
        const startH = shift.start_hour;
        const base = startH >= 24 ? startH - 24 : startH;
        const mins = Math.round((startH % 1) * 60);
        const period = base >= 12 ? "PM" : "AM";
        const disp = Math.floor(base) % 12 || 12;
        const startLabel = `${disp}:${String(mins).padStart(2, "0")} ${period}`;
        const GRACE = 5;
        const late = data.lateness_min ?? 0;
        const elapsed = data.shift_elapsed_min ?? 0;

        if (data.session?.check_in_at && late > GRACE) {
          return (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-950/25 px-4 py-3 flex items-start gap-2.5">
              <Clock size={15} className="text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-300">
                  You clocked in {late} min late
                </p>
                <p className="text-xs text-amber-300/60 mt-0.5">
                  Shift started at {startLabel}. Meal allowance may not apply today.
                </p>
              </div>
              <button
                onClick={() => setLateBannerDismissed(true)}
                className="text-amber-500/50 hover:text-amber-400 text-xl leading-none -mt-0.5 shrink-0"
              >
                ×
              </button>
            </div>
          );
        }

        if (!data.session?.check_in_at && elapsed > GRACE) {
          return (
            <div className="rounded-2xl border border-orange-500/40 bg-orange-950/20 px-4 py-3 flex items-start gap-2.5">
              <Clock size={15} className="text-orange-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-orange-300">
                  Shift started {elapsed} min ago
                </p>
                <p className="text-xs text-orange-300/60 mt-0.5">
                  Your shift started at {startLabel}. Please clock in now.
                </p>
              </div>
              <button
                onClick={() => setLateBannerDismissed(true)}
                className="text-orange-500/50 hover:text-orange-400 text-xl leading-none -mt-0.5 shrink-0"
              >
                ×
              </button>
            </div>
          );
        }

        return null;
      })()}

      {/* Meal Allowance / Probation bonus banner */}
      {mealAllowanceBanner && (
        <div className={`rounded-2xl border-2 px-5 py-4 text-center shadow-lg ${
          mealAllowanceBanner.isBonus
            ? "border-violet-400/60 bg-violet-950/40 animate-none"
            : "border-yellow-400/60 bg-yellow-950/40"
        }`}>
          <div className="text-2xl mb-1">{mealAllowanceBanner.isBonus ? "🏆" : "🎉"}</div>
          {mealAllowanceBanner.isBonus ? (
            <>
              <div className="text-lg font-bold text-violet-300">
                Perfect Attendance Achieved!
              </div>
              <div className="text-2xl font-bold text-white mt-1">
                +PHP {mealAllowanceBanner.amount.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-violet-300/70">
                Probation cycle complete — you have earned the special bonus! You now qualify for daily Meal Allowance.
              </div>
            </>
          ) : (
            <>
              <div className="text-lg font-bold text-yellow-300">
                +PHP {mealAllowanceBanner.amount.toFixed(2)} Meal Allowance!
              </div>
              <div className="mt-1 text-xs text-yellow-300/70">
                Perfect attendance today — great work! Your allowance has been recorded.
              </div>
            </>
          )}
        </div>
      )}

      {/* Probation status warning (new employees) */}
      {probationStatus?.is_probation && !probationStatus.graduated && (
        <div className={`rounded-2xl border px-4 py-4 ${
          probationStatus.current_cycle?.termination_flagged
            ? "border-red-500/60 bg-red-950/30"
            : "border-amber-500/40 bg-amber-950/25"
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base font-bold text-amber-300">
              {probationStatus.current_cycle?.termination_flagged ? "⛔ Employment at Risk" : "⚠ Probation Period"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-black/20 px-2 py-2">
              <div className={`text-xl font-bold ${(probationStatus.current_cycle?.absent_count ?? 0) >= 2 ? "text-red-400" : "text-white"}`}>
                {probationStatus.current_cycle?.absent_count ?? 0}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">Absences</div>
            </div>
            <div className="rounded-xl bg-black/20 px-2 py-2">
              <div className="text-xl font-bold text-white">
                {probationStatus.current_cycle?.late_count ?? 0}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">Late/Early</div>
            </div>
            <div className="rounded-xl bg-black/20 px-2 py-2">
              <div className="text-xl font-bold text-white">
                {Math.round((probationStatus.current_cycle?.total_late_minutes ?? 0) / 60 * 10) / 10}h
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">Late Hours</div>
            </div>
          </div>
          {probationStatus.current_cycle?.cycle_end_date && (
            <div className="mt-2 text-xs text-zinc-500 text-center">
              Current cycle ends: {String(probationStatus.current_cycle.cycle_end_date).slice(0, 10)}
            </div>
          )}
          {probationStatus.current_cycle?.termination_flagged && (
            <div className="mt-2 text-xs text-red-400 text-center font-semibold">
              Please contact your manager immediately.
            </div>
          )}
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

          {/* WFH badge — shown when WFH mode is active */}
          {wfhToday && !isCheckedOut && (
            <div className="flex items-center gap-2 rounded-xl bg-sky-900/40 border border-sky-700/40 px-3 py-2">
              <span className="text-lg">🏠</span>
              <div>
                <p className="text-xs font-semibold text-sky-300">Working From Home Today</p>
                <p className="text-[10px] text-sky-400/70">GPS not required — you can clock in/out from anywhere</p>
              </div>
            </div>
          )}

          {/* GPS required — prominent call-to-action shown BEFORE the clock button */}
          {!isCheckedOut && !gpsValid && !wfhToday && !gpsExempt && (
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
                    <div className="space-y-3">
                      <p className="text-[11px] font-semibold text-amber-300">▸ First — check your phone&apos;s Location switch:</p>
                      <ol className="space-y-2.5">
                        {[
                          { n: 1, text: 'Pull down from the top of your screen to open Quick Settings.' },
                          { n: 2, text: 'Find the "Location" tile (looks like a map pin 📍) and make sure it is ON (highlighted/blue).' },
                          { n: 3, text: 'If it was OFF, turn it ON, then return here and tap "Get My Location" again.' },
                        ].map(({ n, text }) => (
                          <li key={n} className="flex items-start gap-2.5">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-700/60 text-[10px] font-bold text-amber-200">
                              {n}
                            </span>
                            <span className="text-xs text-zinc-300 leading-relaxed">{text}</span>
                          </li>
                        ))}
                      </ol>
                      <p className="text-[11px] font-semibold text-violet-300 pt-1">▸ If Location is ON but still blocked — Chrome browser:</p>
                      <ol className="space-y-2.5">
                        {[
                          { n: 1, text: 'Open the Chrome app and tap the three-dot menu (⋮) at the top right.' },
                          { n: 2, text: 'Tap "Settings" → "Privacy and security" → "Site settings".' },
                          { n: 3, text: 'Tap "Location" and find sushizen-shift-pwa.vercel.app in the blocked list.' },
                          { n: 4, text: 'Tap on it and change to "Allow". When Chrome asks, choose "While using Chrome" (not "Only this time").' },
                          { n: 5, text: 'Return here and tap "Get My Location" again.' },
                        ].map(({ n, text }) => (
                          <li key={n} className="flex items-start gap-2.5">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-700/60 text-[10px] font-bold text-violet-200">
                              {n}
                            </span>
                            <span className="text-xs text-zinc-300 leading-relaxed">{text}</span>
                          </li>
                        ))}
                      </ol>
                      <p className="text-[11px] font-semibold text-violet-300 pt-1">▸ If you opened the app from a home screen icon:</p>
                      <ol className="space-y-2.5">
                        {[
                          { n: 1, text: 'Go to Android Settings → Apps → Workforce OS → Permissions.' },
                          { n: 2, text: 'If "Location" appears, tap it and select "Allow only while using the app".' },
                          { n: 3, text: 'If Location is not listed, follow the Chrome steps above instead.' },
                          { n: 4, text: 'Return here and tap "Get My Location" again.' },
                        ].map(({ n, text }) => (
                          <li key={n} className="flex items-start gap-2.5">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-700/60 text-[10px] font-bold text-violet-200">
                              {n}
                            </span>
                            <span className="text-xs text-zinc-300 leading-relaxed">{text}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    If the steps above don&apos;t match your device, search for &quot;enable location permission&quot; in your phone&apos;s settings or ask your manager for help.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* GPS acquired confirmation */}
          {gpsValid && !isCheckedOut && !wfhToday && (
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
            <div className="space-y-2">
              {/* WFH declaration button — shown only when GPS not available and not yet WFH */}
              {!wfhToday && !multiBranch && (
                <button
                  onClick={() => void declareWfh()}
                  disabled={wfhBusy}
                  className="w-full rounded-xl border border-sky-600/50 bg-sky-900/30 py-2.5 text-sm font-medium text-sky-300 disabled:opacity-50 hover:bg-sky-900/50 transition-colors flex items-center justify-center gap-2"
                >
                  🏠 {wfhBusy ? "Activating..." : "Today is WFH (Work From Home)"}
                </button>
              )}
              {/* Multi-branch: show branch picker instead of plain Clock In */}
              {multiBranch ? (
                <div className="rounded-2xl border border-violet-500/50 bg-violet-950/40 p-4 space-y-3">
                  <p className="text-xs font-semibold text-violet-300">Select your first branch to start work:</p>
                  {branchList.length === 0 ? (
                    <p className="text-xs text-zinc-500">No branches configured. Ask admin to set up GPS branches.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {branchList.map((b) => (
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
                        await doAction("visit_start", { branch_code: branch });
                      }}
                      disabled={busy}
                      className="w-full rounded-xl bg-violet-600 py-4 text-base font-bold text-white disabled:opacity-30 hover:bg-violet-500 transition-colors flex items-center justify-center gap-2"
                    >
                      <LogIn size={18} />
                      {busy ? "Authenticating..." : `Clock In at ${visitBranch}`}
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => void doAction("checkin")}
                  disabled={busy || (!gpsValid && !wfhToday && !gpsExempt)}
                  className="w-full rounded-xl bg-violet-600 py-4 text-base font-bold text-white disabled:opacity-30 hover:bg-violet-500 transition-colors flex items-center justify-center gap-2"
                >
                  <LogIn size={18} />
                  {busy ? "Authenticating..." : "Clock In"}
                </button>
              )}
            </div>
          )}
          {isCheckedIn && !isCheckedOut && (
            <div className="space-y-2">
              {/* Break status banner */}
              {isOnBreak && (
                <div className="rounded-xl bg-amber-950/50 border border-amber-500/40 px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-300">On Break</span>
                    {breakElapsedSec > 0 && (
                      <span className={`text-sm font-bold tabular-nums ${breakElapsedSec >= breakLimitSec + 5 * 60 ? "text-red-400" : breakElapsedSec >= breakWarnSec ? "text-amber-300" : "text-white"}`}>
                        {Math.floor(breakElapsedSec / 60)}:{String(breakElapsedSec % 60).padStart(2, "0")}
                      </span>
                    )}
                  </div>
                  {breakElapsedSec >= breakWarnSec && breakElapsedSec < breakLimitSec && (
                    <p className="text-[11px] text-amber-300">⚠ 10 minutes left on your break</p>
                  )}
                  {breakElapsedSec >= breakLimitSec && (
                    <p className="text-[11px] text-red-400">⛔ Break overrun — please return to work</p>
                  )}
                </div>
              )}

              {/* Break In / Break Out button */}
              {isOnBreak ? (
                <button
                  onClick={() => void doAction("break_out")}
                  disabled={busy}
                  className="w-full rounded-xl bg-amber-600 py-3.5 text-base font-bold text-white disabled:opacity-30 hover:bg-amber-500 transition-colors flex items-center justify-center gap-2"
                >
                  <Square size={16} fill="currentColor" />
                  {busy ? "Authenticating..." : "Break Out (Return to Work)"}
                </button>
              ) : (
                <button
                  onClick={() => void doAction("break_in")}
                  disabled={busy}
                  className="w-full rounded-xl bg-sky-700/80 py-3 text-sm font-semibold text-white disabled:opacity-30 hover:bg-sky-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Clock size={16} />
                  {busy ? "Authenticating..." : "Break In"}
                </button>
              )}

              {/* Clock Out — hidden while on break; multi-branch staff see "End Work Day" */}
              {!isOnBreak && (
                <button
                  onClick={() => setShowClockOutConfirm(true)}
                  disabled={busy || (!gpsValid && !wfhToday && !gpsExempt)}
                  className="w-full rounded-xl bg-rose-700 py-4 text-base font-bold text-white disabled:opacity-30 hover:bg-rose-600 transition-colors flex items-center justify-center gap-2"
                >
                  <LogOut size={18} />
                  {busy ? "Authenticating..." : multiBranch ? "End Work Day" : "Clock Out"}
                </button>
              )}
            </div>
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
                        disabled={
                          correctionBusy ||
                          !correctionReason.trim() ||
                          ((correctionField === "check_in" || correctionField === "both") && !correctionCheckIn) ||
                          ((correctionField === "check_out" || correctionField === "both") && !correctionCheckOut)
                        }
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

      {/* Visits — multi-branch staff get a prominent Clock In/Out per-branch UI */}
      {wauSupported && passkeyCount > 0 && isCheckedIn && multiBranch && (
        <div className={`${GLASS_CARD} rounded-2xl p-5 space-y-3`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Branch Clock In/Out</span>
            {isCheckedOut && <span className="text-xs text-zinc-500">Work day ended</span>}
          </div>

          {/* Currently clocked in at a branch */}
          {openVisits.map((v) => (
            <div key={v.id} className="rounded-2xl bg-emerald-900/30 border-2 border-emerald-600/50 px-4 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-emerald-400 font-medium uppercase tracking-wide">Currently at</p>
                  <p className="text-xl font-bold text-emerald-300">{v.branch_code}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-zinc-500">Clocked in</p>
                  <p className="text-sm text-zinc-300">{fmtTime(v.visit_start, tz)}</p>
                </div>
              </div>
              {!isCheckedOut && (
                <button
                  onClick={() => { void doAction("visit_end", { visit_id: v.id }); }}
                  disabled={busy}
                  className="w-full rounded-xl bg-rose-700/80 py-3 text-sm font-bold text-white disabled:opacity-30 hover:bg-rose-700 transition-colors flex items-center justify-center gap-2"
                >
                  <LogOut size={16} />
                  {busy ? "Authenticating..." : `Clock Out from ${v.branch_code}`}
                </button>
              )}
            </div>
          ))}

          {/* In transit — no open visit; show Clock In at next branch */}
          {!isCheckedOut && openVisits.length === 0 && (
            <div className="rounded-xl bg-zinc-900/60 border border-zinc-700/40 p-3 space-y-2">
              <p className="text-xs font-semibold text-violet-300">Clock In at next branch:</p>
              {availableBranches.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  {branchList.length === 0
                    ? "No branches configured. Ask admin to set up GPS branches."
                    : "Select a branch below."}
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
                  className="w-full rounded-xl bg-violet-600 py-3 text-sm font-bold text-white disabled:opacity-50 hover:bg-violet-500 flex items-center justify-center gap-2"
                >
                  <LogIn size={16} />
                  {busy ? "Authenticating..." : `Clock In at ${visitBranch}`}
                </button>
              )}
            </div>
          )}

          {/* Completed branch stops */}
          {closedVisits.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wide">Completed</p>
              {closedVisits.map((v) => (
                <div key={v.id} className="rounded-xl bg-zinc-800/40 px-3 py-2.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-zinc-300">{v.branch_code}</span>
                    <span className="text-xs text-zinc-500">{fmtTime(v.visit_start, tz)} → {fmtTime(v.visit_end, tz)}</span>
                  </div>
                  {v.visit_start && v.visit_end && (
                    <p className="text-xs text-zinc-500">{fmtDuration(minutesBetween(v.visit_start, v.visit_end))}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Visits — standard staff (non-multi-branch), shown when checked in */}
      {wauSupported && passkeyCount > 0 && isCheckedIn && !multiBranch && (
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

      {/* ── Clock Out confirmation modal ──────────────────────────────────────── */}
      {showClockOutConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setShowClockOutConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-700 p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <LogOut size={18} className="text-rose-400" />
              <h3 className="text-base font-semibold text-white">
                {multiBranch ? "Confirm End Work Day" : "Confirm Clock Out"}
              </h3>
            </div>

            {isCheckedIn && workedMinutes < 5 && (
              <div className="flex items-start gap-2 rounded-xl bg-amber-900/30 border border-amber-500/30 px-3 py-2.5">
                <AlertCircle size={15} className="text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-300">
                  You&apos;ve only been clocked in for{" "}
                  <span className="font-semibold">
                    {workedMinutes === 0 ? "less than 1 minute" : `${workedMinutes} minute${workedMinutes > 1 ? "s" : ""}`}
                  </span>. Did you mean to clock in instead?
                </p>
              </div>
            )}

            <div className="rounded-xl bg-zinc-800/60 px-4 py-3 space-y-1.5">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Clock In</span>
                <span className="text-white font-medium">{session?.check_in_at ? fmtTime(session.check_in_at, tz) : "—"}</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Clock Out</span>
                <span className="text-white font-medium">Now</span>
              </div>
              <div className="border-t border-zinc-700 pt-1.5 flex justify-between text-xs text-zinc-400">
                <span>Duration</span>
                <span className={`font-semibold ${isCheckedIn && workedMinutes < 5 ? "text-amber-400" : "text-white"}`}>
                  {workedMinutes === 0 ? "< 1m" : fmtDuration(workedMinutes)}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowClockOutConfirm(false)}
                className="flex-1 rounded-xl border border-zinc-600 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowClockOutConfirm(false); void doAction("checkout"); }}
                className="flex-1 rounded-xl bg-rose-700 py-3 text-sm font-bold text-white hover:bg-rose-600 transition-colors"
              >
                {multiBranch ? "End Work Day" : "Confirm Clock Out"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
