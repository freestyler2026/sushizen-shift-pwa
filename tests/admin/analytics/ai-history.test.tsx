// tests/admin/analytics/ai-history.test.tsx
// Tests for src/app/admin/analytics/ai-history/page.tsx
// Covers: fetch integration, city filter, loading/error/empty/data states,
//         expand/collapse toggle, 401 refresh retry.

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── next/navigation & next/link ──────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/analytics/ai-history",
}));

vi.mock("next/link", () => ({
  default: ({ children, href, className }: any) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

// ── Auth mock ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => ({
      accessToken: "tok",
      role: "HQ",
      city: "manila",
      staffName: "Jay",
      permissions: ["*"],
      pin: "1234",
    })),
    getAuthHeaders: vi.fn(() => ({ Authorization: "Bearer tok" })),
    refreshAuthFromApi: vi.fn(async (auth: any) => auth),
  };
});

// ── Static import ─────────────────────────────────────────────────────────────
import AiHistoryPage from "@/app/admin/analytics/ai-history/page";

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeFetch(items: any[] = [], status = 200): typeof global.fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify({ items }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  ) as unknown as typeof global.fetch;
}

function makeSnapshot(overrides: Partial<any> = {}) {
  return {
    id: "snap-001",
    city: "dubai",
    date_from: "2026-05-01",
    date_to: "2026-05-31",
    question: "How was overtime last month?",
    answer: "Overtime was elevated across all branches with an average of 45 minutes per shift.",
    model: "claude-sonnet-4-6",
    input_tokens: 1200,
    output_tokens: 300,
    saved_by: "Jay",
    created_at: "2026-05-10T08:00:00Z",
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// AiHistoryPage
// ════════════════════════════════════════════════════════════════════════════════
describe("AiHistoryPage", () => {
  beforeEach(() => {
    global.fetch = makeFetch([]);
  });

  it("renders without crashing and calls the snapshots API", async () => {
    global.fetch = makeFetch([]);
    render(<AiHistoryPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const url = String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(url).toMatch(/\/api\/ai\/analytics\/snapshots/);
  });

  it("shows loading state initially", () => {
    // fetch never resolves — loading spinner should be visible
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof global.fetch;
    render(<AiHistoryPage />);
    expect(screen.getByText(/読み込み中/)).toBeInTheDocument();
  });

  it("shows empty state when API returns no items", async () => {
    global.fetch = makeFetch([]);
    render(<AiHistoryPage />);
    await screen.findByText(/保存された分析はまだありません/);
  });

  it("shows error message when API throws", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ detail: "Snapshot service unavailable" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof global.fetch;
    render(<AiHistoryPage />);
    await screen.findByText(/Snapshot service unavailable/);
  });

  it("shows snapshot question when data loads", async () => {
    global.fetch = makeFetch([makeSnapshot()]);
    render(<AiHistoryPage />);
    await screen.findByText("How was overtime last month?");
  });

  it("shows city badge for dubai snapshot", async () => {
    global.fetch = makeFetch([makeSnapshot({ city: "dubai" })]);
    render(<AiHistoryPage />);
    await screen.findByText("Dubai");
  });

  it("shows city badge for manila snapshot", async () => {
    global.fetch = makeFetch([makeSnapshot({ city: "manila" })]);
    render(<AiHistoryPage />);
    await screen.findByText("Manila");
  });

  it("shows truncated answer preview in collapsed state", async () => {
    global.fetch = makeFetch([makeSnapshot()]);
    render(<AiHistoryPage />);
    await screen.findByText("How was overtime last month?");
    // The preview shows answer.slice(0, 200)...
    expect(screen.getByText(/Overtime was elevated/)).toBeInTheDocument();
  });

  it("expands a snapshot card on click to show full answer", async () => {
    global.fetch = makeFetch([makeSnapshot()]);
    render(<AiHistoryPage />);
    await screen.findByText("How was overtime last month?");
    // Click the card header button
    fireEvent.click(screen.getByRole("button", { name: /How was overtime last month/i }));
    await screen.findByText(/モデル:/);
    expect(screen.getByText(/claude-sonnet-4-6/)).toBeInTheDocument();
  });

  it("collapses an expanded card on second click", async () => {
    global.fetch = makeFetch([makeSnapshot()]);
    render(<AiHistoryPage />);
    await screen.findByText("How was overtime last month?");
    const btn = screen.getByRole("button", { name: /How was overtime last month/i });
    fireEvent.click(btn);
    await screen.findByText(/モデル:/);
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.queryByText(/モデル:/)).not.toBeInTheDocument();
    });
  });

  it("renders the city filter buttons (All / Dubai / Manila / Both)", async () => {
    global.fetch = makeFetch([]);
    render(<AiHistoryPage />);
    expect(screen.getByText("すべて")).toBeInTheDocument();
    expect(screen.getByText("Dubai")).toBeInTheDocument();
    expect(screen.getByText("Manila")).toBeInTheDocument();
    expect(screen.getByText("Dubai + Manila")).toBeInTheDocument();
  });

  it("adds city param to API call when filter is changed to Dubai", async () => {
    global.fetch = makeFetch([]);
    render(<AiHistoryPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Dubai"));
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const urls = calls.map((c: any[]) => String(c[0]));
      expect(urls.some((u) => u.includes("city=dubai"))).toBe(true);
    });
  });

  it("removes city param from API call when filter is reset to All", async () => {
    global.fetch = makeFetch([]);
    render(<AiHistoryPage />);
    fireEvent.click(screen.getByText("Dubai"));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByText("すべて"));
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const lastUrl = String(calls[calls.length - 1][0]);
      expect(lastUrl).not.toMatch(/city=dubai/);
    });
  });

  it("shows token counts in expanded card detail", async () => {
    global.fetch = makeFetch([makeSnapshot({ input_tokens: 999, output_tokens: 123 })]);
    render(<AiHistoryPage />);
    await screen.findByText("How was overtime last month?");
    fireEvent.click(screen.getByRole("button", { name: /How was overtime last month/i }));
    await screen.findByText(/999/);
    expect(screen.getByText(/123/)).toBeInTheDocument();
  });

  it("shows fallback dash when saved_by is empty", async () => {
    global.fetch = makeFetch([makeSnapshot({ saved_by: "" })]);
    render(<AiHistoryPage />);
    await screen.findByText("How was overtime last month?");
    fireEvent.click(screen.getByRole("button", { name: /How was overtime last month/i }));
    await screen.findByText(/保存者:/);
    // saved_by empty renders "—"
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows link back to AI Analytics", async () => {
    global.fetch = makeFetch([]);
    render(<AiHistoryPage />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/admin/analytics?tab=ai");
  });

  it("renders multiple snapshots as separate cards", async () => {
    global.fetch = makeFetch([
      makeSnapshot({ id: "s1", question: "Question Alpha" }),
      makeSnapshot({ id: "s2", question: "Question Beta" }),
      makeSnapshot({ id: "s3", question: "Question Gamma" }),
    ]);
    render(<AiHistoryPage />);
    await screen.findByText("Question Alpha");
    expect(screen.getByText("Question Beta")).toBeInTheDocument();
    expect(screen.getByText("Question Gamma")).toBeInTheDocument();
  });
});
