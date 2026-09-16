"use client";

import { useEffect } from "react";

/**
 * The backdrop a dialog sits on, built so it can be typed into on a phone.
 *
 * Reported from Manila, on the interview outcome box: "everytime I press a
 * letter it exits the screen, everytime I press space it exits box and scrolls
 * down." Both symptoms are the same fault, and neither is about the keyboard.
 *
 * The pattern this replaces was:
 *
 *     <div class="fixed inset-0 flex items-center justify-center p-4">
 *       <div class="... max-h-[90vh] overflow-y-auto">
 *
 * Two things go wrong with it, and only on a small screen:
 *
 *   * The page behind is never locked. On the recruitment board it is 11,508
 *     pixels tall. Any scroll the dialog does not consume — a space bar with
 *     focus anywhere but the text box, a flick that starts on the backdrop —
 *     moves that instead, and the dialog appears to run away.
 *   * `align-items: center` on a fixed layer whose child is taller than it can
 *     be. The outcome box needs 921 pixels inside 729, and centring an
 *     overflowing child puts its top above the container, out of reach. When
 *     the on-screen keyboard then shortens the viewport and the browser tries
 *     to scroll the focused field into view, it has nowhere good to put it.
 *
 * So the backdrop itself scrolls, in ordinary block flow, and the dialog is
 * centred with a margin rather than by flex. `overscroll-contain` keeps a drag
 * past the end from turning into a page scroll or a pull-to-refresh. The same
 * fix was made to the payslip overlay earlier for the same report.
 *
 * The body lock lives here rather than in each dialog on purpose: it is the
 * part that keeps getting forgotten, and a dialog cannot mount this without
 * getting it.
 */
/**
 * Lock the page behind a dialog.
 *
 * Exported separately because some dialogs cannot use the scrim above without
 * changing how they look — the overtime action dialog is a bottom sheet on a
 * phone, which the scrim's block flow does not do. The lock is the half of the
 * fix that those dialogs still need, and it should not be written twice.
 */
export function useLockBodyScroll() {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
}

/**
 * The lock as a component, for dialogs written as inline JSX rather than as a
 * component of their own — a hook cannot be called conditionally, but mounting
 * this alongside the dialog markup can.
 */
export function BodyScrollLock() {
  useLockBodyScroll();
  return null;
}

export default function ModalScrim({
  children,
  className = "",
}: {
  children: React.ReactNode;
  /** Extra classes for the backdrop — a different tint, mostly. */
  className?: string;
}) {
  // Restore whatever was there rather than assuming "" — a page that sets its
  // own overflow should get its own value back, and dialogs can stack.
  useLockBodyScroll();

  return (
    <div
      className={`fixed inset-0 z-50 overflow-y-auto overscroll-contain p-4 ${className}`}
    >
      {children}
    </div>
  );
}
