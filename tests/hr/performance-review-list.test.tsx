// tests/hr/performance-review-list.test.tsx
//
// HR reported "Save draft does not save" on 2026-09-11. The draft had saved
// every time: the endpoint returns {items: [...]} and the page read
// data.reviews, so Review History was empty over two saved drafts and
// Upcoming Reviews was empty over 214 scheduled ones.
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
const AUTH = { staffName: "Peter Villafuerte", role: "HR_MANAGER", permissions: [] as string[] };
vi.mock("@/lib/auth", () => ({
  getAuth: () => AUTH,
  getAuthHeaders: () => ({}),
  isAdmin: () => true,
  refreshAuthFromApi: async () => AUTH,
  hasRouteAccess: () => true,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import PerformancePage from "@/app/admin/hr/performance/page";

const DRAFT = {
  id: "rev-1", staff_name: "Angelica Regondola", city: "manila",
  review_type: "6mo_regularization", review_period: "", review_date: "2026-09-11",
  score_attendance: 4, score_work_quality: 4, score_teamwork: 4,
  score_customer_service: 4, score_rule_compliance: 4,
  salary_increase_recommended: false, salary_increase_amount: 0,
  strengths: "", areas_for_improvement: "", notes: "",
  reviewed_by: "Yusuke Uejima", status: "draft",
  total_score: 20, grade: "A", created_at: "2026-09-11T03:34:39Z",
};

function serve(reviewsBody: unknown, scheduleBody: unknown = { items: [] }) {
  mockFetch.mockImplementation((url: string) => {
    const u = String(url);
    const body =
      u.includes("/reviews/upcoming") ? scheduleBody
      : u.includes("/reviews/outcomes") ? { outcomes: {}, reasons: [] }
      : u.includes("/reviews/overdue") ? []
      : u.includes("/hr/reviews") ? reviewsBody
      : {};
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  });
}

beforeEach(() => vi.clearAllMocks());

describe("reading the list the API actually sends", () => {
  it("shows a saved draft returned under `items`", async () => {
    serve({ items: [DRAFT] });
    render(<PerformancePage />);
    fireEvent.click(await screen.findByText("Review History"));
    expect(await screen.findByText("Angelica Regondola")).toBeTruthy();
  });

  it("still accepts the older `reviews` key", async () => {
    serve({ reviews: [DRAFT] });
    render(<PerformancePage />);
    fireEvent.click(await screen.findByText("Review History"));
    expect(await screen.findByText("Angelica Regondola")).toBeTruthy();
  });

  it("still accepts a bare array", async () => {
    serve([DRAFT]);
    render(<PerformancePage />);
    fireEvent.click(await screen.findByText("Review History"));
    expect(await screen.findByText("Angelica Regondola")).toBeTruthy();
  });

  it("says 'no reviews' only when the list really is empty", async () => {
    serve({ items: [] });
    render(<PerformancePage />);
    fireEvent.click(await screen.findByText("Review History"));
    expect(await screen.findByText(/No reviews found/i)).toBeTruthy();
  });
});

describe("a failed load is not an empty list", () => {
  it("says the load failed instead of 'No reviews found'", async () => {
    mockFetch.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("/hr/reviews") && !u.includes("upcoming") && !u.includes("outcomes") && !u.includes("overdue")) {
        return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: [] }) });
    });
    render(<PerformancePage />);
    fireEvent.click(await screen.findByText("Review History"));
    await waitFor(() => expect(screen.getByText(/Could not load the reviews/i)).toBeTruthy());
    expect(screen.queryByText(/No reviews found/i)).toBeNull();
  });
});
