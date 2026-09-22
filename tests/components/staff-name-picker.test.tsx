// tests/components/staff-name-picker.test.tsx
//
// The picker exists so a name cannot be invented. The case that matters more
// than the happy path is the opposite one: a form already holding a name the
// roster no longer carries must not have it quietly replaced by nothing.
// Anthony Plaza is the live example — 31 Manila DTR rows under a spelling
// staff_master does not have.
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import StaffNamePicker from "@/components/StaffNamePicker";
import { optionLabels, optionValues, chooseValueByName } from "#tests/select-dark";

const ROSTER = ["Anthony Ricaplaza", "Karen Jane Borja"];

function serveRoster(names: string[] = ROSTER) {
  mockFetch.mockImplementation((url: string) => {
    lastUrl = String(url);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ names }) });
  });
}
let lastUrl = "";

async function ready() {
  await waitFor(() => {
    const el = screen.getByRole("combobox", { name: /staff/i });
    if ((el as HTMLButtonElement).disabled) throw new Error("still loading");
  });
}

beforeEach(() => { vi.clearAllMocks(); lastUrl = ""; serveRoster(); });

describe("StaffNamePicker", () => {
  it("offers the roster and nothing else", async () => {
    render(<StaffNamePicker city="manila" value="" onChange={() => {}} aria-label="Staff" />);
    await ready();
    expect(optionValues("Select a name…")).toEqual(ROSTER);
  });

  it("keeps a held name the roster does not carry, and says so", async () => {
    render(<StaffNamePicker city="manila" value="Anthony Plaza" onChange={() => {}} aria-label="Staff" />);
    await ready();
    const labels = optionLabels("Anthony Plaza");
    expect(labels[0]).toMatch(/Anthony Plaza — not on the Staff page/);
    expect(optionValues("Anthony Plaza")).toContain("Anthony Plaza");
  });

  it("does not duplicate a held name that is on the roster", async () => {
    render(<StaffNamePicker city="manila" value="Karen Jane Borja" onChange={() => {}} aria-label="Staff" />);
    await ready();
    expect(optionValues("Karen Jane Borja")).toEqual(ROSTER);
  });

  it("hands back the name that was clicked", async () => {
    const onChange = vi.fn();
    render(<StaffNamePicker city="manila" value="" onChange={onChange} aria-label="Staff" />);
    await ready();
    chooseValueByName(/staff/i, "Karen Jane Borja");
    expect(onChange).toHaveBeenCalledWith("Karen Jane Borja");
  });

  it("asks for the city's roster, active only, unless told otherwise", async () => {
    render(<StaffNamePicker city="dubai" value="" onChange={() => {}} aria-label="Staff" />);
    await ready();
    expect(lastUrl).toContain("/api/staff/names");
    expect(lastUrl).toContain("city=dubai");
  });

  it("includeSeparated asks the roster route with the status filter dropped", async () => {
    render(<StaffNamePicker city="manila" value="" onChange={() => {}} includeSeparated aria-label="Staff" />);
    await ready();
    expect(lastUrl).toContain("/api/admin/staff_master/names");
    expect(lastUrl).toContain("status=");
  });

  it("fetches nothing until a city is known", async () => {
    render(<StaffNamePicker city="" value="" onChange={() => {}} aria-label="Staff" />);
    await waitFor(() => expect(screen.getByRole("combobox", { name: /staff/i })).toBeTruthy());
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("offers a retry rather than falling back to a text box when the roster will not load", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
    render(<StaffNamePicker city="manila" value="" onChange={() => {}} aria-label="Staff" />);
    expect(await screen.findByText(/Could not load the staff list/i)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    serveRoster();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await ready();
    expect(optionValues("Select a name…")).toEqual(ROSTER);
  });
});
