// tests/admin/discord-inbox/discord-inbox-page.test.tsx
// Comprehensive tests for src/app/admin/discord-inbox/page.tsx

import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── @/lib/auth ────────────────────────────────────────────────────────────────
const BASE_AUTH = {
  staffName: "Jay Nishimura",
  city: "dubai" as const,
  role: "ADMIN" as const,
  accessToken: "tok-test",
  permissions: ["*"],
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => BASE_AUTH),
    canAccessAdminNav: vi.fn(() => true),
    tryRefreshAccessToken: vi.fn(async () => true),
  };
});

// ── @/lib/api — export API_BASE as empty string ────────────────────────────
vi.mock("@/lib/api", () => ({
  API_BASE: "",
}));

// ── global fetch mock ─────────────────────────────────────────────────────────
const mockFetch = vi.fn();
Object.defineProperty(globalThis, "fetch", {
  writable: true,
  configurable: true,
  value: mockFetch,
});

import { getAuth, canAccessAdminNav } from "@/lib/auth";
import DiscordInboxPage from "@/app/admin/discord-inbox/page";
import { routerMock } from "../../setup";

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

function makeMention(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    message_id: "msg-001",
    channel_id: "chan-001",
    channel_name: "dubai-general",
    author_id: "user-001",
    author_name: "Test Staff",
    author_avatar: "",
    content: "Hey @Manager please check the report",
    mentioned_user_ids: ["871028335315124225"],
    discord_created_at: new Date(Date.now() - 5 * 60000).toISOString(),
    received_at: new Date(Date.now() - 5 * 60000).toISOString(),
    status: "new",
    ...overrides,
  };
}

function mentionsResp(
  items: ReturnType<typeof makeMention>[],
  newCount = items.filter((i) => i.status === "new").length
) {
  return { ok: true, items, new_count: newCount };
}

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
    text: async () => JSON.stringify(body),
    headers: new Headers({ "content-type": "application/json" }),
    clone: function () { return this as Response; },
  } as unknown as Response;
}

/** Render page and wait until initial mention load completes (or empty state) */
async function renderAndLoad(
  items: ReturnType<typeof makeMention>[] = [makeMention()],
  newCount?: number
) {
  mockFetch.mockResolvedValue(
    mockJsonResponse(mentionsResp(items, newCount ?? items.filter((i) => i.status === "new").length))
  );
  render(<DiscordInboxPage />);
  if (items.length > 0) {
    await waitFor(() => {
      expect(screen.queryByText(items[0].author_name as string)).toBeInTheDocument();
    }, { timeout: 5000 });
  } else {
    await waitFor(() => {
      expect(screen.queryByText(/No .* mentions/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  }
}

/** Click the expand/collapse chevron on a MentionCard.
 *  The chevron button has exactly class "text-white/40 hover:text-white/70 transition-colors"
 *  which is unique — nothing else on the page uses this exact class string. */
function clickExpandButton() {
  const buttons = screen.getAllByRole("button");
  const expandBtn = buttons.find(
    (b) => b.className.trim() === "text-white/40 hover:text-white/70 transition-colors"
  );
  expect(expandBtn, "Could not find chevron expand button").toBeTruthy();
  fireEvent.click(expandBtn!);
}

// ══════════════════════════════════════════════════════════════════════════════

describe("DiscordInboxPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuth).mockReturnValue(BASE_AUTH);
    vi.mocked(canAccessAdminNav).mockReturnValue(true);
    mockFetch.mockResolvedValue(mockJsonResponse(mentionsResp([])));
  });

  afterEach(() => {
    cleanup();
  });

  // ── Auth guard ──────────────────────────────────────────────────────────────
  describe("Auth guard", () => {
    it("redirects to /week when auth is null", async () => {
      vi.mocked(getAuth).mockReturnValue(null);
      render(<DiscordInboxPage />);
      await waitFor(() => {
        expect(routerMock.replace).toHaveBeenCalledWith("/week");
      });
    });

    it("redirects to /week when role is USER and canAccessAdminNav is false", async () => {
      vi.mocked(getAuth).mockReturnValue({ ...BASE_AUTH, role: "USER" as any });
      vi.mocked(canAccessAdminNav).mockReturnValue(false);
      render(<DiscordInboxPage />);
      await waitFor(() => {
        expect(routerMock.replace).toHaveBeenCalledWith("/week");
      });
    });

    it("does NOT redirect when role is ADMIN", async () => {
      render(<DiscordInboxPage />);
      await waitFor(() => {
        expect(screen.queryByText(/No .* mentions/i)).toBeInTheDocument();
      }, { timeout: 3000 });
      expect(routerMock.replace).not.toHaveBeenCalledWith("/week");
    });

    it("does NOT redirect when role is HQ", async () => {
      vi.mocked(getAuth).mockReturnValue({ ...BASE_AUTH, role: "HQ" as any });
      vi.mocked(canAccessAdminNav).mockReturnValue(false);
      render(<DiscordInboxPage />);
      await waitFor(() => {
        expect(screen.queryByText(/No .* mentions/i)).toBeInTheDocument();
      }, { timeout: 3000 });
      expect(routerMock.replace).not.toHaveBeenCalledWith("/week");
    });

    it("does NOT redirect when canAccessAdminNav returns true", async () => {
      vi.mocked(getAuth).mockReturnValue({ ...BASE_AUTH, role: "STAFF" as any });
      vi.mocked(canAccessAdminNav).mockReturnValue(true);
      render(<DiscordInboxPage />);
      await waitFor(() => {
        expect(screen.queryByText(/No .* mentions/i)).toBeInTheDocument();
      }, { timeout: 3000 });
      expect(routerMock.replace).not.toHaveBeenCalledWith("/week");
    });
  });

  // ── Page structure ───────────────────────────────────────────────────────────
  describe("Page header", () => {
    it("renders page title 'Mentions'", () => {
      render(<DiscordInboxPage />);
      expect(screen.getByText("Mentions")).toBeInTheDocument();
    });

    it("renders 'Discord Inbox' label", () => {
      render(<DiscordInboxPage />);
      expect(screen.getByText("Discord Inbox")).toBeInTheDocument();
    });

    it("shows new count badge when API reports new mentions", async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(mentionsResp([makeMention()], 3)));
      render(<DiscordInboxPage />);
      await waitFor(() => {
        expect(screen.getByText(/3 new/i)).toBeInTheDocument();
      });
    });

    it("does NOT show new badge when new_count is 0", async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(mentionsResp([], 0)));
      render(<DiscordInboxPage />);
      await waitFor(() => {
        expect(screen.queryByText(/\d+ new/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  // ── Loading skeleton ─────────────────────────────────────────────────────────
  describe("Loading state", () => {
    it("shows animate-pulse skeletons while loading", () => {
      mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
      render(<DiscordInboxPage />);
      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ── Error state ──────────────────────────────────────────────────────────────
  describe("Error state", () => {
    it("shows error when fetch throws", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));
      render(<DiscordInboxPage />);
      await waitFor(() => {
        expect(screen.getByText(/Failed to load mentions/i)).toBeInTheDocument();
      });
    });

    it("shows Japanese 403 message on API 403", async () => {
      mockFetch.mockResolvedValue(mockJsonResponse({}, 403));
      render(<DiscordInboxPage />);
      await waitFor(() => {
        expect(screen.getByText(/アクセス権限がありません/)).toBeInTheDocument();
      });
    });

    it("redirects to /week on 401 from API", async () => {
      mockFetch.mockResolvedValue(mockJsonResponse({}, 401));
      render(<DiscordInboxPage />);
      await waitFor(() => {
        expect(routerMock.replace).toHaveBeenCalledWith("/week");
      });
    });
  });

  // ── Empty state ──────────────────────────────────────────────────────────────
  describe("Empty state", () => {
    it("shows 'No new mentions' when filter is new and list empty", async () => {
      await renderAndLoad([]);
      expect(screen.getByText(/No new mentions/i)).toBeInTheDocument();
    });

    it("shows 'No mentions' (no double-space bug) when filter is All", async () => {
      // Load empty page first
      mockFetch.mockResolvedValue(mockJsonResponse(mentionsResp([], 0)));
      render(<DiscordInboxPage />);
      await waitFor(() => screen.queryByText(/No new mentions/i), { timeout: 3000 });

      // Switch to All tab
      mockFetch.mockResolvedValue(mockJsonResponse(mentionsResp([], 0)));
      fireEvent.click(screen.getByRole("button", { name: /^All$/i }));

      await waitFor(() => {
        const el = screen.queryByText("No mentions");
        expect(el).toBeInTheDocument();
        // Verify exact text — no double space
        expect(el!.textContent).toBe("No mentions");
      }, { timeout: 5000 });
    });

    it("shows 'No replied mentions' when filter is Replied and list empty", async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(mentionsResp([], 0)));
      render(<DiscordInboxPage />);
      await waitFor(() => screen.queryByText(/No new mentions/i), { timeout: 3000 });

      mockFetch.mockResolvedValue(mockJsonResponse(mentionsResp([], 0)));
      fireEvent.click(screen.getByRole("button", { name: /^Replied$/i }));

      await waitFor(() => {
        expect(screen.getByText(/No replied mentions/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  // ── Mention card display ─────────────────────────────────────────────────────
  describe("Mention card display", () => {
    it("shows author name", async () => {
      await renderAndLoad([makeMention({ author_name: "Daisuke Tanaka" })]);
      expect(screen.getByText("Daisuke Tanaka")).toBeInTheDocument();
    });

    it("shows channel name", async () => {
      await renderAndLoad([makeMention({ channel_name: "dxb-ops" })]);
      expect(screen.getByText("dxb-ops")).toBeInTheDocument();
    });

    it("shows message content", async () => {
      await renderAndLoad([makeMention({ content: "Inventory is low!" })]);
      expect(screen.getByText("Inventory is low!")).toBeInTheDocument();
    });

    it("shows New badge for new mention", async () => {
      await renderAndLoad([makeMention({ status: "new" })]);
      // "New" appears in filter tab AND status badge — at least 2 instances
      expect(screen.getAllByText("New").length).toBeGreaterThanOrEqual(2);
    });

    it("shows Replied badge for replied mention", async () => {
      await renderAndLoad([makeMention({ status: "replied" })]);
      // "Replied" appears in filter tab AND status badge — at least 2 instances
      expect(screen.getAllByText("Replied").length).toBeGreaterThanOrEqual(2);
    });

    it("shows Dismissed badge for dismissed mention", async () => {
      await renderAndLoad([makeMention({ status: "dismissed" })]);
      expect(screen.getByText("Dismissed")).toBeInTheDocument();
    });

    it("resolves known management Discord IDs to display names", async () => {
      await renderAndLoad([makeMention({ mentioned_user_ids: ["871028335315124225"] })]);
      expect(screen.getByText(/→ Manager 1/)).toBeInTheDocument();
    });

    it("resolves unknown IDs to 'User XXXX' format", async () => {
      await renderAndLoad([makeMention({ mentioned_user_ids: ["000000000012345678"] })]);
      expect(screen.getByText(/→ User 5678/)).toBeInTheDocument();
    });

    it("renders multiple mentions", async () => {
      await renderAndLoad([
        makeMention({ id: 1, author_name: "Staff Alpha" }),
        makeMention({ id: 2, author_name: "Staff Beta" }),
        makeMention({ id: 3, author_name: "Staff Gamma" }),
      ]);
      expect(screen.getByText("Staff Alpha")).toBeInTheDocument();
      expect(screen.getByText("Staff Beta")).toBeInTheDocument();
      expect(screen.getByText("Staff Gamma")).toBeInTheDocument();
    });
  });

  // ── Expand / collapse ────────────────────────────────────────────────────────
  describe("Card expand / collapse", () => {
    it("textarea is hidden by default (card collapsed)", async () => {
      await renderAndLoad();
      expect(screen.queryByPlaceholderText(/Type your reply/i)).not.toBeInTheDocument();
    });

    it("clicking the chevron button expands the card and shows textarea", async () => {
      await renderAndLoad();
      clickExpandButton();
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Type your reply/i)).toBeInTheDocument();
      });
    });

    it("Reply and Dismiss buttons appear after expansion", async () => {
      await renderAndLoad();
      clickExpandButton();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Reply on Discord/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Dismiss/i })).toBeInTheDocument();
      });
    });

    it("Reply button is disabled when textarea is empty", async () => {
      await renderAndLoad();
      clickExpandButton();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Reply on Discord/i })).toBeDisabled();
      });
    });

    it("Reply button becomes enabled after typing", async () => {
      await renderAndLoad();
      clickExpandButton();
      const textarea = await screen.findByPlaceholderText(/Type your reply/i);
      fireEvent.change(textarea, { target: { value: "Acknowledged!" } });
      expect(screen.getByRole("button", { name: /Reply on Discord/i })).not.toBeDisabled();
    });

    it("shows prior reply content when mention is already replied", async () => {
      const replied = makeMention({
        status: "replied",
        reply_content: "Thanks, on it!",
        replied_by: "Jay Nishimura",
        replied_at: new Date(Date.now() - 10 * 60000).toISOString(),
      });
      await renderAndLoad([replied]);
      clickExpandButton();
      await waitFor(() => {
        // reply_content text is in the expanded area
        expect(screen.getByText("Thanks, on it!")).toBeInTheDocument();
      });
      expect(screen.getByText(/Replied by Jay Nishimura/)).toBeInTheDocument();
    });

    it("does NOT show reply textarea for replied mentions", async () => {
      await renderAndLoad([makeMention({ status: "replied" })]);
      clickExpandButton();
      await waitFor(() => {
        // The reply box for replied cards shows prior reply but no new textarea
        expect(screen.queryByPlaceholderText(/Type your reply/i)).not.toBeInTheDocument();
      });
    });
  });

  // ── Reply flow ───────────────────────────────────────────────────────────────
  describe("Reply flow", () => {
    async function setupReply(content = "On it!") {
      await renderAndLoad([makeMention({ id: 42, channel_id: "chan-999" })]);
      clickExpandButton();
      const textarea = await screen.findByPlaceholderText(/Type your reply/i);
      fireEvent.change(textarea, { target: { value: content } });
      return textarea;
    }

    it("calls reply API with correct content and channel_id", async () => {
      await setupReply("On it!");
      mockFetch
        .mockResolvedValueOnce(mockJsonResponse({ ok: true }))
        .mockResolvedValueOnce(mockJsonResponse(mentionsResp([])));

      fireEvent.click(screen.getByRole("button", { name: /Reply on Discord/i }));
      await waitFor(() => {
        const replyCall = mockFetch.mock.calls.find((c: any[]) =>
          String(c[0]).includes("/mentions/42/reply")
        );
        expect(replyCall).toBeTruthy();
        const body = JSON.parse(replyCall![1].body);
        expect(body.content).toBe("On it!");
        expect(body.channel_id).toBe("chan-999");
      }, { timeout: 5000 });
    });

    it("shows 'Sending…' text during in-flight reply", async () => {
      await setupReply();
      let resolveReply!: (v: Response) => void;
      mockFetch.mockReturnValueOnce(
        new Promise<Response>((res) => { resolveReply = res; })
      );
      fireEvent.click(screen.getByRole("button", { name: /Reply on Discord/i }));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Sending…/i })).toBeInTheDocument();
      });
      resolveReply(mockJsonResponse({ ok: true }));
    });

    it("clears textarea and collapses card after successful reply", async () => {
      await setupReply("Done!");
      mockFetch
        .mockResolvedValueOnce(mockJsonResponse({ ok: true }))
        .mockResolvedValueOnce(mockJsonResponse(mentionsResp([])));

      fireEvent.click(screen.getByRole("button", { name: /Reply on Discord/i }));
      await waitFor(() => {
        expect(screen.queryByPlaceholderText(/Type your reply/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it("shows inline error when reply API returns !ok (BUG FIX)", async () => {
      await setupReply("Hello");
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ ok: false, detail: "Discord bot is offline" })
      );
      fireEvent.click(screen.getByRole("button", { name: /Reply on Discord/i }));
      await waitFor(() => {
        expect(screen.getByText(/Discord bot is offline/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it("shows inline error on network failure during reply (BUG FIX)", async () => {
      await setupReply("test");
      mockFetch.mockRejectedValueOnce(new Error("Connection reset"));
      fireEvent.click(screen.getByRole("button", { name: /Reply on Discord/i }));
      await waitFor(() => {
        expect(screen.getByText(/Connection reset|Reply failed/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it("card stays open after reply failure (BUG FIX)", async () => {
      await setupReply("oops");
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ ok: false, detail: "Error" })
      );
      fireEvent.click(screen.getByRole("button", { name: /Reply on Discord/i }));
      await waitFor(() => {
        // Textarea still visible — card not collapsed on error
        expect(screen.getByPlaceholderText(/Type your reply/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  // ── Dismiss flow ─────────────────────────────────────────────────────────────
  describe("Dismiss flow", () => {
    async function openDismiss(id = 7) {
      await renderAndLoad([makeMention({ id })]);
      clickExpandButton();
      await screen.findByRole("button", { name: /Dismiss/i });
    }

    it("calls dismiss API with correct mention ID", async () => {
      await openDismiss(7);
      mockFetch
        .mockResolvedValueOnce(mockJsonResponse({}, 200))
        .mockResolvedValueOnce(mockJsonResponse(mentionsResp([])));

      fireEvent.click(screen.getByRole("button", { name: /Dismiss/i }));
      await waitFor(() => {
        const dismissCall = mockFetch.mock.calls.find((c: any[]) =>
          String(c[0]).includes("/mentions/7/dismiss")
        );
        expect(dismissCall).toBeTruthy();
        expect(dismissCall![1].method).toBe("POST");
      }, { timeout: 5000 });
    });

    it("shows error when dismiss API throws (BUG FIX)", async () => {
      await openDismiss(9);
      mockFetch.mockRejectedValueOnce(new Error("Network failure"));
      fireEvent.click(screen.getByRole("button", { name: /Dismiss/i }));
      await waitFor(() => {
        expect(screen.getByText(/Failed to dismiss mention/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it("shows API detail when dismiss returns non-ok response (BUG FIX)", async () => {
      await openDismiss(11);
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ detail: "Mention not found" }, 404)
      );
      fireEvent.click(screen.getByRole("button", { name: /Dismiss/i }));
      await waitFor(() => {
        expect(screen.getByText(/Mention not found/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  // ── Filter tabs ───────────────────────────────────────────────────────────────
  describe("Filter tabs", () => {
    it("renders New, Replied, All filter buttons", () => {
      render(<DiscordInboxPage />);
      expect(screen.getByRole("button", { name: /^New/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Replied$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^All$/i })).toBeInTheDocument();
    });

    it("switching to Replied tab fetches with status=replied", async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(mentionsResp([], 0)));
      render(<DiscordInboxPage />);
      await waitFor(() => screen.queryByText(/No new mentions/i), { timeout: 3000 });

      mockFetch.mockResolvedValue(mockJsonResponse(mentionsResp([], 0)));
      fireEvent.click(screen.getByRole("button", { name: /^Replied$/i }));

      await waitFor(() => {
        const lastUrl = String(mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0]);
        expect(lastUrl).toContain("status=replied");
      }, { timeout: 5000 });
    });

    it("switching to All tab fetches with status=all", async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(mentionsResp([], 0)));
      render(<DiscordInboxPage />);
      await waitFor(() => screen.queryByText(/No new mentions/i), { timeout: 3000 });

      mockFetch.mockResolvedValue(mockJsonResponse(mentionsResp([], 0)));
      fireEvent.click(screen.getByRole("button", { name: /^All$/i }));

      await waitFor(() => {
        const lastUrl = String(mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0]);
        expect(lastUrl).toContain("status=all");
      }, { timeout: 5000 });
    });

    it("shows new count badge inside New tab button", async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(mentionsResp([makeMention()], 5)));
      render(<DiscordInboxPage />);
      await waitFor(() => {
        expect(screen.getByText("5")).toBeInTheDocument();
      });
    });
  });

  // ── Refresh button ────────────────────────────────────────────────────────────
  describe("Refresh button", () => {
    it("clicking the Refresh icon re-fetches mentions", async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(mentionsResp([], 0)));
      render(<DiscordInboxPage />);
      await waitFor(() => screen.queryByText(/No new mentions/i), { timeout: 3000 });

      const callsBefore = mockFetch.mock.calls.length;
      mockFetch.mockResolvedValue(mockJsonResponse(mentionsResp([], 0)));

      // Refresh button is the icon-only button in the header
      const iconButtons = screen.getAllByRole("button").filter(
        (b) => b.querySelector("svg") && (b.textContent ?? "").trim() === ""
      );
      expect(iconButtons.length).toBeGreaterThan(0);
      fireEvent.click(iconButtons[0]);

      await waitFor(() => {
        expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
      }, { timeout: 3000 });
    });
  });

  // ── Push notification panel ───────────────────────────────────────────────────
  describe("Push notification panel", () => {
    it("shows 'Push notifications OFF' by default", () => {
      render(<DiscordInboxPage />);
      expect(screen.getByText(/Push notifications OFF/i)).toBeInTheDocument();
    });

    it("renders the Discord User ID input", () => {
      render(<DiscordInboxPage />);
      expect(
        screen.getByPlaceholderText(/Your Discord User ID/i)
      ).toBeInTheDocument();
    });

    it("shows Enable button", () => {
      render(<DiscordInboxPage />);
      expect(screen.getByRole("button", { name: /^Enable$/i })).toBeInTheDocument();
    });

    it("alerts when clicking Enable without entering a Discord ID", () => {
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
      render(<DiscordInboxPage />);
      fireEvent.click(screen.getByRole("button", { name: /^Enable$/i }));
      expect(alertSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Discord User ID/i)
      );
    });
  });

  // ── timeAgo formatter ─────────────────────────────────────────────────────────
  describe("timeAgo display", () => {
    it("shows 'just now' for very recent timestamp", async () => {
      await renderAndLoad([makeMention({ received_at: new Date().toISOString() })]);
      expect(screen.getByText("just now")).toBeInTheDocument();
    });

    it("shows minutes for recent timestamp", async () => {
      await renderAndLoad([
        makeMention({ received_at: new Date(Date.now() - 10 * 60000).toISOString() }),
      ]);
      expect(screen.getByText("10m ago")).toBeInTheDocument();
    });

    it("shows hours for older timestamp", async () => {
      await renderAndLoad([
        makeMention({ received_at: new Date(Date.now() - 3 * 3600000).toISOString() }),
      ]);
      expect(screen.getByText("3h ago")).toBeInTheDocument();
    });

    it("shows days for very old timestamp", async () => {
      await renderAndLoad([
        makeMention({ received_at: new Date(Date.now() - 2 * 86400000).toISOString() }),
      ]);
      expect(screen.getByText("2d ago")).toBeInTheDocument();
    });
  });
});
