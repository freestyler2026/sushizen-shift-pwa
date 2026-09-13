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

// ── Typing anywhere counts, registered or not ──────────────────────────────
// The registry above only protects a page that remembered to call
// useUnsavedGuard. Three data-entry screens in a row did not, and each time a
// person lost work they had typed: Number of Orders, then a 58-line warehouse
// stocktake, then the Paranaque closing report -- four times in one sitting,
// mid-deploy, until she gave up.
//
// Remembering is the part that keeps failing, so this does not ask anyone to
// remember. A document-level listener notices that somebody is typing into
// something, anywhere, and that alone holds the reload back.
//
// It is deliberately a clock and not a diff: knowing WHAT changed needs the
// page's help, knowing THAT someone is typing does not. Ten minutes from the
// last keystroke, which is the window the owner asked for. Nothing is stored,
// so a PIN or a password field is as safe here as it was before.
const TYPING_GRACE_MS = 10 * 60 * 1000;

let lastInputAt = 0;
let watching = false;

function noteInput(): void {
  const was = typingRecently();
  lastInputAt = Date.now();
  // Only the false -> true edge is news. Announcing every keystroke would put
  // a listener on the typing path of every form in the app for nothing.
  if (!was && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UNSAVED_EVENT));
  }
}

/** Start watching for typing. Safe to call more than once. */
export function watchTypingGlobally(): void {
  if (watching || typeof document === "undefined") return;
  watching = true;
  // Capture phase: a page that calls stopPropagation on its own inputs should
  // not be able to make itself invisible to this by accident.
  document.addEventListener("input", noteInput, true);
  document.addEventListener("change", noteInput, true);
}

/** True while someone was typing recently enough to still be mid-thought. */
export function typingRecently(): boolean {
  return lastInputAt > 0 && Date.now() - lastInputAt < TYPING_GRACE_MS;
}

/** Milliseconds until typingRecently() goes false, or 0 if it already is. */
export function typingGraceRemainingMs(): number {
  if (!lastInputAt) return 0;
  return Math.max(0, TYPING_GRACE_MS - (Date.now() - lastInputAt));
}

export function hasUnsavedEdits(): boolean {
  for (const v of registry.values()) {
    if (v) return true;
  }
  return typingRecently();
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
