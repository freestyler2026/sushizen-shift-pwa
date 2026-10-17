/**
 * One retry for every same-origin /api/ call that comes back 401.
 *
 * apiGet / apiPost already refresh an expired session and try again. About a
 * hundred pages call fetch("/api/...") directly and did not, so once the
 * session lapsed they showed "HTTP 401" or {"detail":"Authentication
 * required"} while the menu (which uses apiGet) carried on working --
 * Manager Checklist and Request, 2026-10-17. Patching fetch once covers all of
 * them and anything written the same way later.
 *
 * Left alone: /api/auth/* (that is the refresh itself), other origins, a body
 * that is a stream (it cannot be sent twice), and impersonation -- refreshing
 * there would hand the admin's own session back mid-way (lesson 27).
 */
import { tryRefreshAccessToken } from "@/lib/auth";
import { getImpersonationInfo } from "@/lib/impersonation";

let installed = false;
let inflight: Promise<boolean> | null = null;
// A path that still says 401 straight after a successful refresh is refusing
// for some other reason (a wrong PIN, a route that does not forward the
// cookie). Leave it alone for a while instead of minting a token per call.
const stubborn = new Map<string, number>();
const STUBBORN_MS = 5 * 60 * 1000;

/** apiGet/apiPost skip their own retry when this one is in place. */
export function fetchRetriesOn401(): boolean { return installed; }

function refreshOnce(): Promise<boolean> {
  // Ten calls that fail together share one refresh.
  if (!inflight) {
    inflight = tryRefreshAccessToken()
      .catch(() => false)
      .finally(() => { setTimeout(() => { inflight = null; }, 0); });
  }
  return inflight;
}

export function shouldRetry(url: string, origin: string): boolean {
  let u: URL;
  try { u = new URL(url, origin); } catch { return false; }
  return u.origin === origin && u.pathname.startsWith("/api/") && !u.pathname.startsWith("/api/auth/");
}

export function installFetchRefresh(): void {
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!shouldRetry(url, window.location.origin)) return original(input, init);

    const again = input instanceof Request ? input.clone() : input;
    const res = await original(input, init);
    if (res.status !== 401) return res;
    const path = new URL(url, window.location.origin).pathname;
    if ((stubborn.get(path) ?? 0) > Date.now()) return res;
    if (typeof ReadableStream !== "undefined" && init?.body instanceof ReadableStream) return res;
    try { if (getImpersonationInfo()) return res; } catch { /* treat as not impersonating */ }

    const ok = await refreshOnce();
    if (ok) {
      const retried = await original(again, init);
      if (retried.status === 401) stubborn.set(path, Date.now() + STUBBORN_MS);
      return retried;
    }
    // Could not refresh: let SessionGuard decide whether this browser is still
    // signed in at all, and send it to the login screen if not.
    try { window.dispatchEvent(new Event("zen:session-lost")); } catch { /* old browsers */ }
    return res;
  };
}
