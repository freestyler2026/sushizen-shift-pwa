"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A full-screen overlay that is actually full-screen.
 *
 * ⚠️ `position: fixed` is not relative to the viewport when any ancestor has a
 * `transform`, `filter`, `backdrop-filter`, `perspective` or `will-change` —
 * it is relative to that ancestor. `GLASS_CARD` carries `backdrop-blur-sm`, so
 * every card in this app is such an ancestor, and most cards also carry
 * `overflow-hidden`. A modal rendered inside one is therefore confined to the
 * card's box and clipped, with no scrollbar to reach the rest of it.
 *
 * Reported by the Manila back office on 2026-09-08 for the 5★ ratings form:
 * "unable to view the full box … not fully controllable using the cursor …
 * the up-and-down scrolling function is unavailable". The 5★ table had
 * **zero rows** at the time, which is what made it unusable rather than merely
 * awkward: an empty card is short, so the trapped modal had almost no height
 * to occupy. The low-ratings form has the identical bug and was usable only
 * because that card holds 2,454 rows and is tall. It fails the same way the
 * moment somebody filters it down to nothing.
 *
 * Rendering into `document.body` removes the whole class of problem: there is
 * no blurring or clipping ancestor left between the overlay and the page.
 *
 * Nothing is rendered until the component has mounted. The overlay is never
 * part of the server-rendered HTML (it only exists after a click), so this
 * costs nothing and keeps the first client render identical to the server's
 * (lesson 42).
 */
export function PortalOverlay({
  children,
  onClose,
  className = "fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4",
  labelledBy,
}: {
  children: ReactNode;
  /** Called on Escape and on a click outside the panel. */
  onClose?: () => void;
  className?: string;
  labelledBy?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Escape closes it. A trapped modal could not be closed by clicking past its
  // clipped edge either, so the keyboard route is worth having whatever the
  // layout does.
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The page behind must not scroll while a modal is open: on a phone the
  // scroll otherwise passes through and the form drifts away under the finger.
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <div className={className} role="dialog" aria-modal aria-labelledby={labelledBy}>
      {onClose && (
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label="Close"
          onClick={onClose}
        />
      )}
      {children}
    </div>,
    document.body,
  );
}
