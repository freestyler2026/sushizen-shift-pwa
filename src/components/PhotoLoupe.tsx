"use client";

import { useEffect, useRef } from "react";

/**
 * A magnifying glass that follows the cursor over a photograph.
 *
 * Zoom and pan already reach 1200%, but reading an invoice is not one long
 * look at one place — it is checking a figure, then the line above it, then
 * the total at the bottom. Doing that by zooming means zoom in, drag, drag
 * back, zoom out, for every number. The glass leaves the whole page on screen
 * and enlarges only what is under the pointer.
 *
 * It magnifies the RENDERED composition rather than the source file, by
 * drawing the same image again and scaling it about the cursor. Whatever
 * zoom, pan or rotation the pane already has is carried into the glass with
 * it, and the browser resamples from the full-resolution file, so the
 * enlargement is sharp rather than a blow-up of what is already on screen.
 *
 * The pointer is tracked here, on the container, and written straight to the
 * DOM. Putting it in React state would re-render the whole panel — a form of
 * twenty fields and a line table — sixty times a second while the mouse moves.
 */
export default function PhotoLoupe({
  containerRef,
  active,
  size = 280,
  factor = 2.5,
  children,
}: {
  /** The element the photograph is drawn in. */
  containerRef: React.RefObject<HTMLElement | null>;
  active: boolean;
  size?: number;
  factor?: number;
  /** The same image element the pane is showing, with the same transform. */
  children: React.ReactNode;
}) {
  const glassRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = containerRef.current;
    const glass = glassRef.current;
    const inner = innerRef.current;
    if (!host || !glass || !inner) return;
    if (!active) {
      glass.style.display = "none";
      return;
    }

    const half = size / 2;
    let frame = 0;
    let last: { x: number; y: number; w: number; h: number } | null = null;

    const draw = () => {
      frame = 0;
      if (!last) return;
      const { x, y, w, h } = last;
      glass.style.display = "block";
      glass.style.left = `${x - half}px`;
      glass.style.top = `${y - half}px`;
      inner.style.width = `${w}px`;
      inner.style.height = `${h}px`;
      inner.style.left = `${half - x}px`;
      inner.style.top = `${half - y}px`;
      // Scaling about the cursor keeps that point still, and the offset above
      // has already put it at the centre of the glass.
      inner.style.transformOrigin = `${x}px ${y}px`;
      inner.style.transform = `scale(${factor})`;
    };

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      last = { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const onLeave = () => {
      last = null;
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      glass.style.display = "none";
    };

    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [containerRef, active, size, factor]);

  return (
    <div
      ref={glassRef}
      className="pointer-events-none absolute z-20 overflow-hidden rounded-full border-2 border-white/70 shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_8px_30px_rgba(0,0,0,0.6)]"
      // border-box so the 2px rim does not push the glass two pixels off the
      // point it is meant to be centred on — verified against a grid: at 1x
      // the glass is seamless with what is under it.
      style={{ width: size, height: size, display: "none", background: "#000",
               boxSizing: "border-box" }}
    >
      <div ref={innerRef} style={{ position: "absolute" }}>
        {children}
      </div>
      {/* A crosshair, so it is obvious which point is being magnified. */}
      <div className="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-white/30" />
      <div className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 bg-white/30" />
    </div>
  );
}
