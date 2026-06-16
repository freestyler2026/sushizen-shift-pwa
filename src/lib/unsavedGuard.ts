"use client";

import { useEffect } from "react";

// ── Global unsaved-edits registry ──────────────────────────────────────────
// A single module-level registry shared across the client bundle. Pages with
// in-progress edits flag themselves here; AutoReload reads it to DEFER a
// hard reload (new-deploy detection) while someone is mid-input, so their
// unsaved data isn't wiped out from under them.

const registry = new Map<string, boolean>();
export const UNSAVED_EVENT = "sz-unsaved-edits-changed";

export function setUnsaved(key: string, dirty: boolean): void {
  const prev = registry.get(key) ?? false;
  if (prev === dirty) return;
  if (dirty) registry.set(key, true);
  else registry.delete(key);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UNSAVED_EVENT));
  }
}

export function hasUnsavedEdits(): boolean {
  for (const v of registry.values()) {
    if (v) return true;
  }
  return false;
}

// Register a component's dirty state in the global guard AND warn the browser
// (beforeunload) on manual refresh / tab close / navigation while dirty.
export function useUnsavedGuard(key: string, dirty: boolean): void {
  useEffect(() => {
    setUnsaved(key, dirty);
  }, [key, dirty]);

  // Clear the flag when the component unmounts.
  useEffect(() => () => setUnsaved(key, false), [key]);

  // beforeunload covers user-initiated unloads (AutoReload's programmatic
  // reload is handled separately by deferring on hasUnsavedEdits()).
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}

// ── Draft persistence (sessionStorage) ─────────────────────────────────────
// Belt-and-suspenders: even if a reload does happen (manual refresh, crash,
// AutoReload after save), restore the in-progress input instead of losing it.

export function saveDraft(key: string, payload: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* storage unavailable / quota — non-critical */
  }
}

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* non-critical */
  }
}
