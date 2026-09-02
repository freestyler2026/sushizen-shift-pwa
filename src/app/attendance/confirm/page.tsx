"use client";

/**
 * Where the poster's QR code lands.
 *
 * The code is a plain link, so the phone's own camera opens it. Nothing to
 * install, no scanner inside the app to find, and it works the same on every
 * handset in both cities. The token in the query string is the branch; who is
 * confirming comes from the session, never from the URL.
 *
 * This page does one thing and says what happened. Someone standing in a
 * kitchen with wet hands should be able to look at it once and walk away.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, Loader2, MapPin } from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { GLASS_CARD, PRIMARY_BUTTON, T_PAGE_TITLE } from "@/lib/ui-tokens";

type State = "working" | "done" | "already" | "error" | "noauth";

export default function ConfirmInStorePage() {
  // useSearchParams needs a boundary or the build refuses to prerender.
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0b0f14] flex items-start justify-center px-4 py-10">
        <div className={GLASS_CARD + " w-full max-w-sm p-6 text-center"}>
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-violet-300" />
        </div>
      </div>
    }>
      <ConfirmInner />
    </Suspense>
  );
}

function ConfirmInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("t") || "";

  const [state, setState] = useState<State>("working");
  const [message, setMessage] = useState("");
  const [distance, setDistance] = useState<number | null>(null);
  const [gpsNote, setGpsNote] = useState("");

  const confirm = useCallback(async (lat: number | null, lng: number | null) => {
    const auth = getAuth();
    if (!auth) { setState("noauth"); return; }
    try {
      const res = await fetch("/api/store/attendance/confirm-in-store", {
        method: "POST",
        headers: getAuthHeaders(auth),
        body: JSON.stringify({ city: auth.city, method: "qr", token, lat, lng }),
      });
      // Read the body before checking ok: a 413 from the platform arrives as
      // text/plain and res.json() would throw away the real reason.
      const raw = await res.text();
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(raw); } catch { /* not JSON — keep the text */ }
      if (!res.ok) {
        setState("error");
        setMessage(String(body.detail || raw || "Could not confirm. Please try again."));
        return;
      }
      setDistance(typeof body.in_store_distance_m === "number" ? body.in_store_distance_m : null);
      setState(body.already ? "already" : "done");
    } catch {
      setState("error");
      setMessage("No connection. Stay on this page and try again in a moment.");
    }
  }, [token]);

  useEffect(() => {
    if (!token) { setState("error"); setMessage("This link has no code in it. Scan the poster again."); return; }
    if (!navigator.geolocation) { setGpsNote("This phone did not give a location."); void confirm(null, null); return; }
    // One shot, and never a reason to fail: a confirmation without a location
    // is still a confirmation. Withholding it because the GPS was slow would
    // punish the person for their handset.
    navigator.geolocation.getCurrentPosition(
      p => confirm(p.coords.latitude, p.coords.longitude),
      () => { setGpsNote("Location was off, so this scan is recorded without one."); void confirm(null, null); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  }, [token, confirm]);

  return (
    <div className="min-h-screen bg-[#0b0f14] px-4 py-10 flex items-start justify-center">
      <div className={GLASS_CARD + " w-full max-w-sm p-6 text-center"}>
        {state === "working" && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-violet-300" />
            <h1 className={T_PAGE_TITLE + " mt-4 text-lg"}>Confirming…</h1>
            <p className="mt-1 text-sm text-white/50">Keep this open for a second.</p>
          </>
        )}

        {(state === "done" || state === "already") && (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
            <h1 className={T_PAGE_TITLE + " mt-4 text-lg"}>
              {state === "already" ? "Already confirmed today" : "You're confirmed"}
            </h1>
            <p className="mt-1 text-sm text-white/60">
              {state === "already"
                ? "Nothing more to do — today is already recorded."
                : "Your time in is complete. Have a good shift."}
            </p>
            {distance !== null && (
              <p className="mt-3 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/45">
                <MapPin className="h-3 w-3" /> {distance}m from the branch
              </p>
            )}
            {gpsNote && <p className="mt-2 text-xs text-white/35">{gpsNote}</p>}
            <Link href="/attendance" className={PRIMARY_BUTTON + " mt-6 inline-block w-full"}>
              Back to Time In
            </Link>
          </>
        )}

        {state === "noauth" && (
          <>
            <AlertTriangle className="mx-auto h-12 w-12 text-amber-400" />
            <h1 className={T_PAGE_TITLE + " mt-4 text-lg"}>Log in first</h1>
            <p className="mt-1 text-sm text-white/60">
              The code is fine. We just need to know it&apos;s you — log in, then scan again.
            </p>
            <button
              type="button"
              onClick={() => router.push("/")}
              className={PRIMARY_BUTTON + " mt-6 w-full"}
            >
              Go to log in
            </button>
          </>
        )}

        {state === "error" && (
          <>
            <AlertTriangle className="mx-auto h-12 w-12 text-amber-400" />
            <h1 className={T_PAGE_TITLE + " mt-4 text-lg"}>Not confirmed</h1>
            <p className="mt-1 text-sm text-white/70">{message}</p>
            {/* Never a dead end: there is always the photo, and it is on the
                Time In screen where they already are. */}
            <Link href="/attendance" className={PRIMARY_BUTTON + " mt-6 inline-block w-full"}>
              Back to Time In
            </Link>
            <p className="mt-3 text-xs text-white/45">
              If the code will not scan, use <b>Take a photo instead</b> on the Time In screen.
              It reaches the same place.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
