// tests/apply/branch-options.test.tsx
//
// The branch list is written twice — once in the form and once in
// app/db_public_apply.py, which validates what the form sends. The comment
// above each says to keep them in step, and a comment is not a check: adding a
// branch to the form alone gives the applicant an option they can pick and
// cannot send, and the only thing they see is "branch" in the error list.
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { chooseValueByName } from "../select-dark";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("@/components/apply/VoiceScreening", () => ({ default: () => <div>screening</div> }));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const BACKEND = path.resolve(
  process.env.HOME || "",
  "Desktop/sushizen_shift_app_clean/app/db_public_apply.py",
);

/** The codes the form offers, read out of its own source. */
function formCodes(): string[] {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../src/app/apply/page.tsx"), "utf8",
  );
  const block = src.slice(src.indexOf("const BRANCHES = ["));
  return [...block.slice(0, block.indexOf("];")).matchAll(/code:\s*"([A-Z]+)"/g)].map((m) => m[1]);
}

describe("apply form — branch options", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation(() =>
      Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("{}"),
                        json: () => Promise.resolve({ ok: true, id: "x" }) } as Response));
  });

  it("no longer offers SM South Mall", async () => {
    // Taken off 2026-10-06 (owner), after 82 applications had chosen it. Pinned
    // because the entry carried a paragraph of its own about how its label was
    // sized, which is the kind of thing that gets restored by someone reading
    // the comment rather than the decision.
    const Apply = (await import("@/app/apply/page")).default;
    render(<Apply />);
    await screen.findByText("Send application");
    fireEvent.click(screen.getByText("Which branch do you prefer?").closest("div")!
      .querySelector("[data-value]") as HTMLElement);
    expect(screen.queryAllByText("SM South Mall")).toHaveLength(0);
    expect(formCodes()).not.toContain("SSM");
  });

  it("every code the form offers is one the backend will accept", () => {
    // Skipped rather than failed when the backend checkout is not beside this
    // one: a missing sibling repo is not a defect in this repo.
    if (!fs.existsSync(BACKEND)) return;
    const py = fs.readFileSync(BACKEND, "utf8");
    const line = py.split("\n").find((l) => l.startsWith("BRANCHES = ["));
    expect(line, "BRANCHES not found in db_public_apply.py").toBeTruthy();
    const accepted = [...line!.matchAll(/"([A-Z]+)"/g)].map((m) => m[1]);
    for (const code of formCodes()) {
      expect(accepted, `form offers ${code}, backend rejects it`).toContain(code);
    }
    // ...and the other direction, which is how SSM would have been left behind:
    // a code the backend still takes that nothing offers is a list the next
    // person reads as current.
    for (const code of accepted) {
      expect(formCodes(), `backend accepts ${code}, form does not offer it`).toContain(code);
    }
  });

  it("picking a branch still names where it is", async () => {
    // What the SM South Mall case was really about: an applicant choosing a
    // site they have never been to should be told which city it is in.
    const Apply = (await import("@/app/apply/page")).default;
    render(<Apply />);
    await screen.findByText("Send application");
    chooseValueByName("Which branch do you prefer?", "CK");
    await waitFor(() => expect(screen.getByText(/Quezon City/)).toBeInTheDocument());
  });
});
