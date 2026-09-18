"use client";

/**
 * A magnifying glass that follows the cursor over a photograph.
 *
 * Zoom and pan already reach 1200%, but reading an invoice is not one long
 * look at one place — it is checking a figure, then the line above it, then
 * the total at the bottom. Doing that by zooming means zooming in, dragging,
 * dragging back and zooming out for every number. The loupe leaves the whole
 * page on screen and enlarges only what is under the pointer.
 *
 * It magnifies the RENDERED composition rather than the source file, by
 * drawing the same content again and scaling it about the cursor. So whatever
 * zoom, pan or rotation is already applied is carried into the glass without
 * any of it having to be worked out again here.
 */
export default function PhotoLoupe({
  point,
  size = 280,
  factor = 2.5,
  children,
}: {
  /** Where the pointer is inside the photo area, and how big that area is.
   *  null when the pointer is outside — the glass is not drawn. */
  point: { x: number; y: number; w: number; h: number } | null;
  size?: number;
  factor?: number;
  /** The same image element the pane is showing, with the same transform. */
  children: React.ReactNode;
}) {
  if (!point) return null;
  const half = size / 2;

  return (
    <div
      className="pointer-events-none absolute z-20 overflow-hidden rounded-full border-2 border-white/70 shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_8px_30px_rgba(0,0,0,0.6)]"
      style={{
        width: size,
        height: size,
        left: point.x - half,
        top: point.y - half,
        // The photo is dark-on-light; a light ground keeps the rim readable
        // while the file loads or over a blank part of the page.
        background: "#000",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: point.w,
          height: point.h,
          left: half - point.x,
          top: half - point.y,
          transform: `scale(${factor})`,
          // Scaling about the cursor keeps that point still, and the offset
          // above has already put it at the centre of the glass.
          transformOrigin: `${point.x}px ${point.y}px`,
        }}
      >
        {children}
      </div>
      {/* A crosshair, so it is obvious which point is being magnified. */}
      <div className="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-white/30" />
      <div className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 bg-white/30" />
    </div>
  );
}
