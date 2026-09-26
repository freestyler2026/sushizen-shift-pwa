// tests/store/morning-review-salmon.test.tsx
//
// Yusuke asked for the salmon yield alert to be answered in the Management
// Inbox, with an issue category and an action plan, both required before the
// item can be closed. The backend enforces that; these tests are the other
// half — that a manager standing in front of the screen can actually get
// there, because an API that refuses correctly and a screen nobody can finish
// are the same outcome (lesson 56).
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("@/lib/auth", () => ({
  getAuthHeaders: () => ({}),
  getAuth: () => ({ staffName: "Yusuke Uejima", role: "HQ", city: "manila" }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import ReviewPage from "@/app/store/management/review/page";

const OPTIONS = {
  assessments: [{ key: "none", label: "No actual issue", ends: true }],
  issue_types: [], root_causes: [], actions: [],
  prep_causes: [], prep_actions: [], prep_threshold: 30,
  salmon_issues: [
    { key: "no_photo", label: "No photo confirmed" },
    { key: "cutting", label: "Cutting issue (meat left on skin)" },
    { key: "weighing", label: "Weighing error" },
    { key: "input", label: "Input error" },
    { key: "quality", label: "Quality / condition issue" },
    { key: "other", label: "Other" },
  ],
  salmon_actions: [
    { key: "no_issue", label: "No issue — yield is correct" },
    { key: "correct", label: "Correct the data" },
    { key: "retrain", label: "Re-training required" },
    { key: "feedback", label: "Manager feedback given" },
    { key: "supplier", label: "Supplier / quality issue" },
    { key: "other", label: "Other" },
  ],
  salmon_missing_outcomes: [
    { key: "no_cutting", label: "No salmon cutting", ends: true },
    { key: "submission_missing", label: "Submission missing", ends: false },
  ],
  salmon_band: { min: 65, max: 70, par: 67.5, missing_days: 3 },
};

const SUMMARY = {
  orders: { delivery: 0, total: null },
  quality: { photos: 0, graded: 0, not_a_dish: 0, below_c: 0, issue_rate: null,
             grades: { s: 0, a: 0, b: 0, c: 0, d: 0, f: 0 } },
  prep: { measurable: false, reason: "no prep" },
  backup: { filed: true, reports: 1, shortage_alerts: 0 },
  rush: { completed: 0, missed: 0, required: 0 },
  disposal: { filed: true },
};

function reviewWith(items: unknown[]) {
  return {
    id: 1, city: "manila", branch: "CUB", review_date: "2026-09-25",
    status: "open", assigned_to: "Yusuke Uejima", summary: SUMMARY,
    manager_comment: "", completed_by: null, completed_at: null,
    completed_local: null, items, options: OPTIONS,
  };
}

const YIELD_ITEM = {
  id: 11, kind: "salmon_yield", source_id: "77", answer: null, answered_by: null,
  payload: { shift: "closing", reported_by: "Rowena", whole_g: 5000, main_g: 3120,
             main_pct: 62.4, scrap_pct: 9.8, skin_pct: 24.1, direction: "low",
             band_min: 65, band_max: 70, has_photo: false },
};

const MISSING_ITEM = {
  id: 12, kind: "salmon_missing", source_id: "gap:2026-09-20", answer: null, answered_by: null,
  payload: { last_date: "2026-09-20", last_by: "Rowena", days_since: 5,
             threshold_days: 3, chased_on: "" },
};

function serve(items: unknown[]) {
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
    const u = String(url);
    if (opts?.method === "POST") {
      posts.push({ url: u, body: JSON.parse(String(opts.body || "{}")) });
      return Promise.resolve({ ok: true, status: 200,
        text: () => Promise.resolve("{}"), json: () => Promise.resolve({ ok: true }) });
    }
    const body = u.startsWith("/api/store/ops-review?")
      ? { reviews: [{ id: 1, branch: "CUB", review_date: "2026-09-25", status: "open",
                      items: items.length, answered: 0 }], total: 1, done_for_you: [] }
      : u.startsWith("/api/store/ops-review/1")
      ? reviewWith(items)
      : u.includes("/api/staff/names") ? { names: [] } : {};
    return Promise.resolve({ ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify(body)), json: () => Promise.resolve(body) });
  });
  return posts;
}

describe("Morning Review — salmon yield", () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it("shows the yield, the band, and the whole cut", async () => {
    serve([YIELD_ITEM]);
    render(<ReviewPage />);
    expect(await screen.findByText(/62.4% low/)).toBeInTheDocument();
    expect(screen.getByText(/3120g of 5000g/)).toBeInTheDocument();
    expect(screen.getByText(/scrap 9.8% · skin 24.1%/)).toBeInTheDocument();
    // Four branches file twice in a day, on four different shifts.
    expect(screen.getByText(/closing · Rowena/)).toBeInTheDocument();
    expect(screen.getByText(/between 65% and 70%/)).toBeInTheDocument();
  });

  it("offers Yusuke's six categories and six action plans", async () => {
    serve([YIELD_ITEM]);
    render(<ReviewPage />);
    await screen.findByText(/62.4% low/);
    for (const label of ["No photo confirmed", "Cutting issue (meat left on skin)",
                         "Weighing error", "Input error", "Quality / condition issue"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    for (const label of ["No issue — yield is correct", "Correct the data",
                         "Re-training required", "Manager feedback given",
                         "Supplier / quality issue"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("sends both halves when the manager saves", async () => {
    const posts = serve([YIELD_ITEM]);
    render(<ReviewPage />);
    await screen.findByText(/62.4% low/);
    fireEvent.click(screen.getByText("Cutting issue (meat left on skin)"));
    fireEvent.click(screen.getByText("Re-training required"));
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0].url).toBe("/api/store/ops-review/item/11");
    expect(posts[0].body.issue_type).toEqual(["cutting"]);
    expect(posts[0].body.action_taken).toEqual(["retrain"]);
  });

  it("says there is no photo rather than showing an empty frame", async () => {
    serve([YIELD_ITEM]);
    render(<ReviewPage />);
    expect(await screen.findByText(/No photo on this record/)).toBeInTheDocument();
  });

  it("cannot complete the morning while the item is unanswered", async () => {
    serve([YIELD_ITEM]);
    render(<ReviewPage />);
    await screen.findByText(/62.4% low/);
    const complete = screen.getByText(/Complete morning review/i).closest("button")!;
    expect(complete).toBeDisabled();
  });
});

describe("Morning Review — nothing submitted", () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it("shows how long it has been and who filed last", async () => {
    serve([MISSING_ITEM]);
    render(<ReviewPage />);
    expect(await screen.findByText(/5 days/)).toBeInTheDocument();
    expect(screen.getByText(/Last yield 2026-09-20 by Rowena/)).toBeInTheDocument();
  });

  it("closes straight away on 'No salmon cutting'", async () => {
    const posts = serve([MISSING_ITEM]);
    render(<ReviewPage />);
    await screen.findByText(/5 days/);
    fireEvent.click(screen.getByText("No salmon cutting"));
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0].body.outcome).toBe("no_cutting");
  });

  it("will not save 'Submission missing' until the Discord follow-up is sent", async () => {
    const posts = serve([MISSING_ITEM]);
    render(<ReviewPage />);
    await screen.findByText(/5 days/);
    fireEvent.click(screen.getByText("Submission missing"));
    expect(screen.getByText(/Have you sent a follow-up message to the Kitchen team on Discord/))
      .toBeInTheDocument();
    expect(screen.getByText("Save").closest("button")!).toBeDisabled();

    fireEvent.click(screen.getByText("Not yet"));
    expect(screen.getByText(/Send it first/)).toBeInTheDocument();
    expect(screen.getByText("Save").closest("button")!).toBeDisabled();
    expect(posts.length).toBe(0);

    fireEvent.click(screen.getByText("Yes"));
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0].body.outcome).toBe("submission_missing");
    expect(posts[0].body.followed_up).toBe("yes");
  });

  it("a re-ask after a chase says so", async () => {
    serve([{ ...MISSING_ITEM, payload: { ...MISSING_ITEM.payload, chased_on: "2026-09-23", days_since: 12 } }]);
    render(<ReviewPage />);
    expect(await screen.findByText(/chased 2026-09-23 — still nothing/)).toBeInTheDocument();
  });
});
