// Franchise owner portal — the owner's own session, separate from staff login.
// The token is checked by the backend on every request (account active, password
// unchanged, store on the account); this file only carries it.

const KEY = "sushizen_owner_session_v1";

export type OwnerStore = { code: string; name: string };
export type OwnerSession = { token: string; expiresAt: number; displayName: string; stores: OwnerStore[] };

export function getOwnerSession(): OwnerSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as OwnerSession;
    if (!s.token || Date.now() >= s.expiresAt) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function setOwnerSession(s: OwnerSession) {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: the session lasts the page */ }
}

export function clearOwnerSession() {
  try { sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}

export class OwnerAuthError extends Error {}

export async function ownerFetch<T = unknown>(path: string): Promise<T> {
  const s = getOwnerSession();
  if (!s) throw new OwnerAuthError("Please sign in.");
  const res = await fetch(path, { headers: { Authorization: `Bearer ${s.token}` }, cache: "no-store" });
  if (res.status === 401) {
    clearOwnerSession();
    throw new OwnerAuthError("Your session ended. Please sign in again.");
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try { detail = (await res.json()).detail || detail; } catch { /* keep the status */ }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function ownerDownload(path: string, filename: string) {
  const s = getOwnerSession();
  if (!s) throw new OwnerAuthError("Please sign in.");
  const res = await fetch(path, { headers: { Authorization: `Bearer ${s.token}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** An image the owner's session may see, as an object URL (an <img> cannot send the token). */
export async function ownerImageUrl(path: string): Promise<string> {
  const s = getOwnerSession();
  if (!s) throw new OwnerAuthError("Please sign in.");
  const res = await fetch(path, { headers: { Authorization: `Bearer ${s.token}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Photo not available (${res.status})`);
  return URL.createObjectURL(await res.blob());
}
