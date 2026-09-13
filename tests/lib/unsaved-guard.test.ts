import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The reload-vs-typing guard.
 *
 * This has failed three times, each time the same way: a new data-entry screen
 * shipped without calling useUnsavedGuard, AutoReload saw no unsaved edits, and
 * somebody lost what they had typed. The fix under test is the half that needs
 * no registration, so the test is about the half that keeps being forgotten.
 */
async function freshGuard() {
  vi.resetModules();               // the module keeps `lastInputAt` at module scope
  return await import("@/lib/unsavedGuard");
}

function type(into: HTMLElement = document.createElement("input")) {
  document.body.appendChild(into);
  into.dispatchEvent(new Event("input", { bubbles: true }));
  return into;
}

describe("unsavedGuard — typing holds the reload back without registration", () => {
  beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = ""; });
  afterEach(() => { vi.useRealTimers(); });

  it("reports nothing unsaved on a page nobody has touched", async () => {
    const g = await freshGuard();
    g.watchTypingGlobally();
    expect(g.hasUnsavedEdits()).toBe(false);
  });

  it("holds the reload once somebody types, with no page-side registration", async () => {
    const g = await freshGuard();
    g.watchTypingGlobally();
    type();
    expect(g.hasUnsavedEdits()).toBe(true);
  });

  it("still holds it nine minutes after the last keystroke", async () => {
    const g = await freshGuard();
    g.watchTypingGlobally();
    type();
    vi.advanceTimersByTime(9 * 60 * 1000);
    expect(g.hasUnsavedEdits()).toBe(true);
  });

  it("lets the update through once typing has stopped for ten minutes", async () => {
    const g = await freshGuard();
    g.watchTypingGlobally();
    type();
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(g.hasUnsavedEdits()).toBe(false);
  });

  it("restarts the window on each keystroke, so a slow typist is not cut off", async () => {
    const g = await freshGuard();
    g.watchTypingGlobally();
    type();
    for (let i = 0; i < 6; i++) {           // half an hour of intermittent typing
      vi.advanceTimersByTime(5 * 60 * 1000);
      type();
      expect(g.hasUnsavedEdits()).toBe(true);
    }
  });

  it("counts a dropdown too, not only the keyboard", async () => {
    const g = await freshGuard();
    g.watchTypingGlobally();
    const sel = document.createElement("select");
    document.body.appendChild(sel);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    expect(g.hasUnsavedEdits()).toBe(true);
  });

  it("a registered page still reports dirty even when nobody is typing", async () => {
    const g = await freshGuard();
    g.watchTypingGlobally();
    g.setUnsaved("some-page", true);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(g.hasUnsavedEdits()).toBe(true);
    g.setUnsaved("some-page", false);
    expect(g.hasUnsavedEdits()).toBe(false);
  });

  it("sees typing even when the page stops the event from bubbling", async () => {
    const g = await freshGuard();
    g.watchTypingGlobally();
    const box = document.createElement("div");
    document.body.appendChild(box);
    box.addEventListener("input", (e) => e.stopPropagation());
    const input = document.createElement("input");
    box.appendChild(input);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(g.hasUnsavedEdits()).toBe(true);
  });

  it("announces the first keystroke so the reload is re-evaluated at once", async () => {
    const g = await freshGuard();
    g.watchTypingGlobally();
    const seen = vi.fn();
    window.addEventListener(g.UNSAVED_EVENT, seen);
    type();
    expect(seen).toHaveBeenCalledTimes(1);
    type();                                  // already inside the window
    expect(seen).toHaveBeenCalledTimes(1);   // not once per keystroke
    window.removeEventListener(g.UNSAVED_EVENT, seen);
  });
});
