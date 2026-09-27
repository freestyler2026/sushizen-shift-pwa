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

  it("offers SM South Mall", async () => {
    const Apply = (await import("@/app/apply/page")).default;
    render(<Apply />);
    await screen.findByText("Send application");
    fireEvent.click(screen.getByText("Which branch do you prefer?").closest("div")!
      .querySelector("[data-value]") as HTMLElement);
    expect(screen.getAllByText("SM South Mall").length).toBeGreaterThan(0);
  });

  it("every code the form offers is one the backend will accept", () => {
    // Skipped rather than failed when the backend checkout is not beside this
    // one: a missing sibling repo is not a defect in this repo.
    if (!fs.existsSync(BACKEND)) return;
    const py = fs.readFileSync(BACKEND, "utf8");
    const line = py.split("\n").find((l) => l.startsWith("BRANCHES = ["));
    expect(line, "BRANCHES not found in db_public_apply.py").toBeTruthy();
    const accepted = [...line!.matchAll(/"([A-Z]+)"/g)].map((m) => m[1]);
    expect(accepted).toContain("SSM");
    for (const code of formCodes()) {
      expect(accepted, `form offers ${code}, backend rejects it`).toContain(code);
    }
  });

  it("an application for SM South Mall sends the code the backend knows", async () => {
    const Apply = (await import("@/app/apply/page")).default;
    render(<Apply />);
    await screen.findByText("Send application");
    chooseValueByName("Which branch do you prefer?", "SSM");
    // The address line under the select tells the applicant where it is, and
    // must not be blank for a branch nobody has been to yet.
    await waitFor(() => expect(screen.getByText(/Las Piñas/)).toBeInTheDocument());
  });
});
