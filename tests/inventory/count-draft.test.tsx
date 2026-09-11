// tests/inventory/count-draft.test.tsx
//
// A warehouse stocktake is dozens of numbers typed over several minutes, and
// AutoReload hard-reloads every open tab when a new build ships. On 2026-09-11
// a count was wiped that way, twice, while deploys were going out.
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { usePersistedDraft } from "@/lib/draftStore";
import { hasUnsavedEdits, setUnsaved } from "@/lib/unsavedGuard";

type Draft = Record<string, string>;
const isEmpty = (v: Draft) => !Object.values(v ?? {}).some((x) => (x ?? "").trim() !== "");

function Harness({ k, initial }: { k: string; initial: Draft }) {
  const [draft, setDraft] = React.useState<Draft>(initial);
  const { restored, discard } = usePersistedDraft<Draft>(k, draft, setDraft, isEmpty);
  return (
    <div>
      <span data-testid="draft">{JSON.stringify(draft)}</span>
      <span data-testid="restored">{String(restored)}</span>
      <button onClick={() => setDraft({ ...draft, apple: "7" })}>type</button>
      <button onClick={() => { setDraft({}); discard(); }}>save</button>
    </div>
  );
}

beforeEach(() => { window.localStorage.clear(); });

describe("an unsaved count survives a reload", () => {
  it("is written to storage as it is typed", () => {
    render(<Harness k="zen:wh:manila:2026-09-11" initial={{}} />);
    act(() => { screen.getByText("type").click(); });
    expect(window.localStorage.getItem("zen:wh:manila:2026-09-11")).toContain("7");
  });

  it("comes back on the next mount, and says so", () => {
    window.localStorage.setItem("zen:wh:manila:2026-09-11", JSON.stringify({ apple: "7" }));
    render(<Harness k="zen:wh:manila:2026-09-11" initial={{}} />);
    expect(screen.getByTestId("draft").textContent).toContain("7");
    // Restoring numbers silently would be worse than losing them: nobody could
    // tell where they came from.
    expect(screen.getByTestId("restored").textContent).toBe("true");
  });

  it("never overwrites something already typed", () => {
    window.localStorage.setItem("zen:wh:manila:2026-09-11", JSON.stringify({ apple: "7" }));
    render(<Harness k="zen:wh:manila:2026-09-11" initial={{ pear: "3" }} />);
    expect(screen.getByTestId("draft").textContent).toContain("pear");
    expect(screen.getByTestId("draft").textContent).not.toContain("apple");
    expect(screen.getByTestId("restored").textContent).toBe("false");
  });

  it("is forgotten once the count is saved", () => {
    window.localStorage.setItem("zen:wh:manila:2026-09-11", JSON.stringify({ apple: "7" }));
    render(<Harness k="zen:wh:manila:2026-09-11" initial={{}} />);
    act(() => { screen.getByText("save").click(); });
    expect(window.localStorage.getItem("zen:wh:manila:2026-09-11")).toBeNull();
  });

  it("does not leak across dates — a draft belongs to the day it was counted", () => {
    window.localStorage.setItem("zen:wh:manila:2026-09-10", JSON.stringify({ apple: "7" }));
    render(<Harness k="zen:wh:manila:2026-09-11" initial={{}} />);
    expect(screen.getByTestId("draft").textContent).toBe("{}");
  });

  it("works when storage throws, rather than taking the page down", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => render(<Harness k="zen:wh:manila:2026-09-11" initial={{}} />)).not.toThrow();
    spy.mockRestore();
  });
});

describe("AutoReload is told to wait", () => {
  it("registers the page as dirty while numbers are being entered", () => {
    expect(hasUnsavedEdits()).toBe(false);
    setUnsaved("wh-inventory-count", true);
    expect(hasUnsavedEdits()).toBe(true);
    setUnsaved("wh-inventory-count", false);
    expect(hasUnsavedEdits()).toBe(false);
  });
});
