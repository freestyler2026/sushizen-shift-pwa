"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keep an in-progress form in the browser until it is saved.
 *
 * Why: AutoReload reloads every open tab when a new build ships, and on
 * 2026-09-11 a warehouse stocktake was lost that way -- the counter had
 * entered numbers against 58 items and the page reloaded under her while
 * deploys were going out. `useUnsavedGuard` makes AutoReload WAIT while
 * somebody is typing, which is the first half; this is the second, because a
 * deferred reload still happens eventually, and a closed laptop, a crashed
 * tab or a manual refresh were never covered at all.
 *
 * The key must carry everything that makes one draft a different draft -- the
 * page, the city, the date. A draft restored onto the wrong day would be worse
 * than a lost one: nobody would know the numbers came from somewhere else.
 *
 * Storage is per-browser and best-effort: a private window, cleared site data
 * or a blocked store all mean nothing comes back, so every read and write is
 * wrapped and the page must work with an empty draft.
 */
export function usePersistedDraft<T>(
  key: string,
  value: T,
  apply: (restored: T) => void,
  isEmpty: (v: T) => boolean,
): { restored: boolean; discard: () => void } {
  const [restored, setRestored] = useState(false);
  const loaded = useRef(false);

  // Restore once, and only into an empty form: overwriting something the user
  // has already typed would be the same data loss from the other direction.
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as T;
      if (isEmpty(parsed)) return;
      if (!isEmpty(value)) return;
      apply(parsed);
      setRestored(true);
    } catch {
      /* nothing to restore */
    }
    // Deliberately keyed on `key` alone: this runs once per draft, not on
    // every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Save on change. Cheap enough at this size, and the alternative -- saving on
  // a timer -- loses whatever was typed since the last tick.
  useEffect(() => {
    if (!loaded.current) return;
    try {
      if (isEmpty(value)) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: the in-memory form still works */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);

  const discard = () => {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
    setRestored(false);
  };

  return { restored, discard };
}
