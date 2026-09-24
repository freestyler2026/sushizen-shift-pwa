// tests/apply/required-marks.test.tsx
//
// HR reported that the public form refuses to send on fields it never marks
// as required. It was true: eight things stop the form and the screen marked
// three. Name, number, role, branch and experience carried nothing at all, and
// the Facebook field said "(optional)" while blocking whenever Messenger was
// ticked — the app 126 of our applicants actually use.
//
// The rule this locks in: anything that can block the send wears the mark at
// the moment it can block, in both languages.
import React from "react";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import ApplyPage from "@/app/apply/page";

/** The label text of every field carrying the required mark. */
function markedFields(): string[] {
  return [...document.querySelectorAll("label")]
    .filter((l) => l.textContent?.includes("*"))
    .map((l) => l.textContent!.replace(/\s*\*\s*$/, "").trim());
}

describe("public application form — the mark matches the rule", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as unknown as Response);
  });

  it("marks every field that stops the send", async () => {
    render(<ApplyPage />);
    await screen.findByText(/Work at Sushi ZEN/i);
    const marked = markedFields();
    for (const label of ["Full name", "Mobile number", "What work are you applying for?",
                         "Which branch do you prefer?", "Experience in food service",
                         "Where did you work last?", "What was your position there?",
                         "Your CV"]) {
      expect(marked.some((m) => m.startsWith(label.replace(/\?$/, "")))).toBe(true);
    }
  });

  it("does not mark the fields that really are optional", async () => {
    render(<ApplyPage />);
    await screen.findByText(/Work at Sushi ZEN/i);
    const marked = markedFields().join(" | ");
    for (const optional of ["How long were you there", "Which area do you live in",
                            "Who referred you", "Anything else", "When can you start"]) {
      expect(marked).not.toContain(optional);
    }
  });

  it("says what the mark means, so it is not decoration", async () => {
    render(<ApplyPage />);
    expect(await screen.findByText(/cannot send without this/i)).toBeTruthy();
  });

  it("stops calling Facebook optional the moment Messenger is chosen", async () => {
    render(<ApplyPage />);
    await screen.findByText(/Work at Sushi ZEN/i);
    // before: genuinely optional, and says so
    expect(screen.getByText(/Facebook profile link \(optional\)/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Messenger/i }));

    await waitFor(() => {
      // the word "optional" must be gone from that label...
      expect(screen.queryByText(/Facebook profile link \(optional\)/i)).toBeNull();
      // ...and the mark must be on it
      expect(markedFields().some((m) => m.startsWith("Facebook profile link"))).toBe(true);
    });
  });

  it("carries the mark in Tagalog too", async () => {
    render(<ApplyPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Tagalog/i }));
    await waitFor(() => expect(screen.getByText(/Kailangan ito bago makapagpadala/i)).toBeTruthy());
    const marked = markedFields();
    expect(marked.length).toBeGreaterThanOrEqual(8);
    fireEvent.click(screen.getByRole("button", { name: /Messenger/i }));
    await waitFor(() =>
      expect(screen.queryByText(/\(opsyonal\)/i && /Link ng Facebook profile \(opsyonal\)/i)).toBeNull(),
    );
  });
});

describe("public application form — counting the sends that were stopped", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, text: async () => "{}", json: async () => ({ ok: true }) } as unknown as Response);
  });

  const outcomes = () =>
    mockFetch.mock.calls
      .filter((c) => String(c[0]).includes("/api/apply/outcome"))
      .map((c) => JSON.parse(String((c[1] as RequestInit).body)));

  it("records which fields stopped the send, and nothing about the person", async () => {
    render(<ApplyPage />);
    const nameLabel = (await screen.findAllByText(/Full name/)).at(-1)!;
    const name = nameLabel.parentElement!.querySelector("input")!;
    fireEvent.change(name, { target: { value: "Maria Santos" } });
    fireEvent.click(screen.getByRole("button", { name: /Send application/i }));

    await waitFor(() => expect(outcomes().length).toBe(1));
    const sent = outcomes()[0];
    expect(sent.stage).toBe("blocked");
    expect(sent.fields).toContain("cv");
    expect(sent.fields).toContain("phone");
    // the whole point: the payload carries no personal data
    const raw = JSON.stringify(sent);
    expect(raw).not.toContain("Maria");
    expect(raw).not.toContain("Santos");
    expect(Object.keys(sent).sort()).toEqual(["fields", "form_id", "language", "stage"]);
  });

  it("keeps the same form id across two stopped attempts, so one person counts once", async () => {
    render(<ApplyPage />);
    await screen.findByText(/Work at Sushi ZEN/i);
    const send = screen.getByRole("button", { name: /Send application/i });
    fireEvent.click(send);
    await waitFor(() => expect(outcomes().length).toBe(1));
    fireEvent.click(send);
    await waitFor(() => expect(outcomes().length).toBe(2));
    expect(outcomes()[0].form_id).toBe(outcomes()[1].form_id);
    expect(outcomes()[0].form_id).toBeTruthy();
  });

  it("still tells the applicant what is missing when the counting is down", async () => {
    // What this does NOT prove: that the .catch on the beacon matters. A
    // rejection left loose here is not surfaced by this harness -- I tried
    // twice, with a window listener and a process listener, and removing the
    // catch passes either way. The catch stays because lesson 94 is what an
    // unhandled rejection costs; this test is only claiming the smaller thing.
    mockFetch.mockImplementation((url: string) => {
      if (String(url).includes("/api/apply/outcome")) return Promise.reject(new Error("down"));
      return Promise.resolve({ ok: true, text: async () => "{}" } as unknown as Response);
    });
    render(<ApplyPage />);
    await screen.findByText(/Work at Sushi ZEN/i);
    fireEvent.click(screen.getByRole("button", { name: /Send application/i }));
    expect(await screen.findByText(/highlighted fields|attach your CV/i)).toBeTruthy();
  });
});
