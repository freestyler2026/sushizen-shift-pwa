// tests/store/manager-checklist-401.test.tsx
//
// 2026-10-17: the Manager Checklist showed "HTTP 401" once the access token had
// expired. Every other page refreshes the session and retries; this one used a
// bare fetch. It now goes through apiGet/apiPost.
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const refresh = vi.fn(async () => true);
vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({
  getAuthHeaders: () => ({}),
  getAuth: () => ({ staffName: "Yukihiro Nishimura", role: "HQ", city: "dubai" }),
  tryRefreshAccessToken: () => refresh(),
}));

const DAY = {
  day: null, enabled: true, suggested: null,
  items: [{ seq: 1, section: "opening", timing: "Opening / 9:00",
    title: "Check the entire kitchen, all chillers, ingredients, and equipment.",
    allows_issue: true, note_prompt: "", fact: null, result: "", issue_outcome: "", note: "",
    answered_by: "", answered_at: null }],
};
let n = 0;
global.fetch = vi.fn(() => {
  n += 1;
  return Promise.resolve(n === 1
    ? new Response(JSON.stringify({ detail: "Authentication required" }), { status: 401 })
    : new Response(JSON.stringify(DAY), { status: 200, headers: { "Content-Type": "application/json" } }));
}) as unknown as typeof fetch;

import Page from "@/app/store/management/travel-path/page";

describe("Manager Checklist — expired session", () => {
  it("refreshes the session and loads instead of showing HTTP 401", async () => {
    render(<Page />);
    expect(await screen.findByText(/Check the entire kitchen/)).toBeTruthy();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByText(/HTTP 401/)).toBeNull();
  });
});
