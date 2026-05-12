// tests/swap-approve/swap-approve.test.tsx
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { routerMock } from "../setup";
import SwapApprovePage from "@/app/swap-approve/page";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Auth mock — plain fns so vi.restoreAllMocks() does NOT clear them
let mockAuth: Record<string, unknown> | null = null;
let mockRefreshedAuth: Record<string, unknown> | null = null;

vi.mock("@/lib/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...real,
    getAuth: () => mockAuth,
    getAuthHeaders: () => ({ Authorization: "Bearer test-token" }),
    refreshAuthFromApi: () => Promise.resolve(mockRefreshedAuth ?? mockAuth),
  };
});

// Global mocks
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;
global.confirm = vi.fn(() => true);

// ── Helpers ───────────────────────────────────────────────────────────────────

function setAuth(overrides: Record<string, unknown> = {}) {
  mockAuth = {
    staffName: "Test Staff",
    city: "manila",
    role: "STAFF",
    accessToken: "test-token",
    pin: "1234",
    permissions: [],
    ...overrides,
  };
  mockRefreshedAuth = mockAuth;
}

function makeResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(typeof body === "string" ? JSON.parse(body) : body),
  } as unknown as Response;
}

async function renderPage() {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<SwapApprovePage />);
  });
  return result;
}

// Fill in all required fields so canSubmit becomes true
async function fillForm(reqId = "req-001", staffName?: string, pin = "1234", note = "ok") {
  const reqIdInput = screen.getByPlaceholderText(/e\.g\. 119ab8b2/i);
  const pinInput = screen.getByPlaceholderText("PIN");
  const noteInput = screen.getByPlaceholderText(/i agree/i);

  fireEvent.change(reqIdInput, { target: { value: reqId } });
  fireEvent.change(pinInput, { target: { value: pin } });
  fireEvent.change(noteInput, { target: { value: note } });

  if (staffName) {
    // staffName input defaults to auth.staffName — override if needed
    const nameInputs = screen.getAllByRole("textbox");
    const nameInput = nameInputs.find((el) =>
      (el as HTMLInputElement).placeholder?.includes("Muskan"),
    );
    if (nameInput) {
      fireEvent.change(nameInput, { target: { value: staffName } });
    }
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SwapApprovePage", () => {
  beforeEach(() => {
    mockAuth = null;
    mockRefreshedAuth = null;
    mockFetch.mockReset();
    vi.mocked(global.confirm).mockReturnValue(true);
  });

  // ── Auth guard ──────────────────────────────────────────────────────────────

  describe("Auth guard", () => {
    it("redirects to /login when no auth", async () => {
      mockAuth = null;
      mockRefreshedAuth = null;
      await renderPage();
      await waitFor(() => {
        expect(routerMock.replace).toHaveBeenCalledWith(
          "/login?next=%2Fswap-approve",
        );
      });
    });

    it("redirects to /login when staffName is empty", async () => {
      mockAuth = { staffName: "", accessToken: "tok", city: "manila", role: "STAFF", permissions: [] };
      mockRefreshedAuth = mockAuth;
      await renderPage();
      await waitFor(() => {
        expect(routerMock.replace).toHaveBeenCalledWith(
          "/login?next=%2Fswap-approve",
        );
      });
    });

    it("redirects to /login when accessToken is missing", async () => {
      mockAuth = { staffName: "Alice", accessToken: "", city: "manila", role: "STAFF", permissions: [] };
      mockRefreshedAuth = mockAuth;
      await renderPage();
      await waitFor(() => {
        expect(routerMock.replace).toHaveBeenCalledWith(
          "/login?next=%2Fswap-approve",
        );
      });
    });

    it("renders page when auth is valid", async () => {
      setAuth();
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("Swap Approve")).toBeInTheDocument();
      });
    });

    it("does NOT redirect when valid auth is present", async () => {
      setAuth();
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("Swap Approve")).toBeInTheDocument();
      });
      expect(routerMock.replace).not.toHaveBeenCalled();
    });

    it("populates staffName from refreshed auth", async () => {
      setAuth({ staffName: "Yuki Admin" });
      await renderPage();
      await waitFor(() => {
        const inputs = screen.getAllByRole("textbox");
        const nameInput = inputs.find((el) =>
          (el as HTMLInputElement).value === "Yuki Admin",
        );
        expect(nameInput).toBeTruthy();
      });
    });
  });

  // ── Page structure ──────────────────────────────────────────────────────────

  describe("Page structure", () => {
    beforeEach(() => setAuth());

    it("renders the page title 'Swap Approve'", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("Swap Approve")).toBeInTheDocument();
      });
    });

    it("renders the subtitle description", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText(/approve or reject a swap request/i)).toBeInTheDocument();
      });
    });

    it("renders the 'Counterparty approval' badge", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText(/counterparty approval/i)).toBeInTheDocument();
      });
    });

    it("renders Approval Form header", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("Approval Form")).toBeInTheDocument();
      });
    });

    it("renders the warning banner about reviewing carefully", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText(/review the request carefully/i)).toBeInTheDocument();
      });
    });

    it("renders API origin footer", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText(/\(same origin\)/i)).toBeInTheDocument();
      });
    });
  });

  // ── Form fields ─────────────────────────────────────────────────────────────

  describe("Form fields", () => {
    beforeEach(() => setAuth());

    it("renders Request ID input", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/e\.g\. 119ab8b2/i)).toBeInTheDocument();
      });
    });

    it("renders Your name input with placeholder", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/muskan tamang/i)).toBeInTheDocument();
      });
    });

    it("renders PIN input as password type", async () => {
      await renderPage();
      await waitFor(() => {
        const pinInput = screen.getByPlaceholderText("PIN") as HTMLInputElement;
        expect(pinInput.type).toBe("password");
      });
    });

    it("renders Note input with default value 'ok'", async () => {
      await renderPage();
      await waitFor(() => {
        const noteInput = screen.getByPlaceholderText(/i agree/i) as HTMLInputElement;
        expect(noteInput.value).toBe("ok");
      });
    });

    it("Request ID input can be changed", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/e\.g\. 119ab8b2/i)).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. 119ab8b2/i), {
        target: { value: "abc-123" },
      });
      expect(
        (screen.getByPlaceholderText(/e\.g\. 119ab8b2/i) as HTMLInputElement).value,
      ).toBe("abc-123");
    });

    it("Note input can be changed", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/i agree/i)).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText(/i agree/i), {
        target: { value: "I agree to this swap" },
      });
      expect(
        (screen.getByPlaceholderText(/i agree/i) as HTMLInputElement).value,
      ).toBe("I agree to this swap");
    });

    it("renders Approve and Reject buttons", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
      });
    });
  });

  // ── canSubmit logic ─────────────────────────────────────────────────────────

  describe("canSubmit (buttons enabled/disabled)", () => {
    beforeEach(() => setAuth());

    it("Approve and Reject buttons are disabled initially (no reqId or PIN)", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
      });
    });

    it("buttons remain disabled when reqId is empty", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText("PIN")).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText("PIN"), { target: { value: "1234" } });
      expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    });

    it("buttons remain disabled when PIN is empty", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/e\.g\. 119ab8b2/i)).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. 119ab8b2/i), {
        target: { value: "req-001" },
      });
      // PIN is still empty
      expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    });

    it("buttons remain disabled when note is cleared", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/e\.g\. 119ab8b2/i)).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. 119ab8b2/i), {
        target: { value: "req-001" },
      });
      fireEvent.change(screen.getByPlaceholderText("PIN"), { target: { value: "1234" } });
      fireEvent.change(screen.getByPlaceholderText(/i agree/i), { target: { value: "" } });
      expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    });

    it("buttons become enabled when all required fields are filled", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/e\.g\. 119ab8b2/i)).toBeInTheDocument();
      });
      await fillForm();
      expect(screen.getByRole("button", { name: "Approve" })).not.toBeDisabled();
      expect(screen.getByRole("button", { name: "Reject" })).not.toBeDisabled();
    });
  });

  // ── Approve action ──────────────────────────────────────────────────────────

  describe("Approve action", () => {
    beforeEach(() => {
      setAuth({ staffName: "Test Staff" });
      mockFetch.mockResolvedValue(makeResponse({ ok: true, message: "Swap approved" }));
    });

    it("shows confirm dialog before calling API", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      expect(global.confirm).toHaveBeenCalledWith(
        "Are you sure you want to approved this swap request?",
      );
    });

    it("does NOT call fetch when confirm is cancelled", async () => {
      vi.mocked(global.confirm).mockReturnValue(false);
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("calls fetch with APPROVED action in query string", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm("my-req-id", undefined, "5678", "looks good");
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
        const url = String(mockFetch.mock.calls[0][0]);
        expect(url).toContain("action=APPROVED");
        expect(url).toContain("req_id=my-req-id");
        expect(url).toContain("note=looks+good");
      });
    });

    it("shows 'Swap approved' success card after approval", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => {
        expect(screen.getByText("Swap approved")).toBeInTheDocument();
      });
    });

    it("shows 'Both parties will be notified' after approval", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => {
        expect(
          screen.getByText(/both parties will be notified/i),
        ).toBeInTheDocument();
      });
    });

    it("shows 'View API response' details section after approval", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => {
        expect(screen.getByText(/view api response/i)).toBeInTheDocument();
      });
    });

    it("buttons show 'Working…' while loading", async () => {
      let resolveRequest!: (v: Response) => void;
      mockFetch.mockReturnValue(
        new Promise<Response>((r) => {
          resolveRequest = r;
        }),
      );
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      expect(screen.getByText("Working…")).toBeInTheDocument();
      // clean up
      await act(async () => {
        resolveRequest(makeResponse({ ok: true }));
      });
    });
  });

  // ── Reject action ───────────────────────────────────────────────────────────

  describe("Reject action", () => {
    beforeEach(() => {
      setAuth({ staffName: "Test Staff" });
      mockFetch.mockResolvedValue(makeResponse({ ok: true, message: "Swap rejected" }));
    });

    it("shows confirm dialog before calling API", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Reject" }));
      expect(global.confirm).toHaveBeenCalledWith(
        "Are you sure you want to rejected this swap request?",
      );
    });

    it("calls fetch with REJECTED action", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
      });
      await fillForm("req-002", undefined, "9999", "declined");
      fireEvent.click(screen.getByRole("button", { name: "Reject" }));
      await waitFor(() => {
        const url = String(mockFetch.mock.calls[0][0]);
        expect(url).toContain("action=REJECTED");
        expect(url).toContain("req_id=req-002");
      });
    });

    it("shows 'Swap rejected' success card after rejection", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Reject" }));
      await waitFor(() => {
        expect(screen.getByText("Swap rejected")).toBeInTheDocument();
      });
    });

    it("does NOT call fetch when confirm is cancelled for Reject", async () => {
      vi.mocked(global.confirm).mockReturnValue(false);
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Reject" }));
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  describe("Error handling", () => {
    beforeEach(() => setAuth());

    it("shows error message when API returns non-OK status", async () => {
      mockFetch.mockResolvedValue(makeResponse("Internal Server Error", 500));
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => {
        expect(screen.getByText("Internal Server Error")).toBeInTheDocument();
      });
    });

    it("extracts FastAPI detail field from JSON error — bug fix", async () => {
      // Bug: postJson's inner try-catch was catching its own thrown Error,
      //      so JSON {"detail":"Swap not found"} showed raw JSON instead of "Swap not found"
      mockFetch.mockResolvedValue(
        makeResponse(JSON.stringify({ detail: "Swap request not found" }), 404),
      );
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => {
        expect(screen.getByText("Swap request not found")).toBeInTheDocument();
      });
    });

    it("extracts 'message' field from JSON error body", async () => {
      mockFetch.mockResolvedValue(
        makeResponse(JSON.stringify({ message: "Unauthorized action" }), 403),
      );
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => {
        expect(screen.getByText("Unauthorized action")).toBeInTheDocument();
      });
    });

    it("falls back to raw text for non-JSON error body", async () => {
      mockFetch.mockResolvedValue(makeResponse("<html>502 Bad Gateway</html>", 502));
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => {
        expect(screen.getByText(/<html>502 Bad Gateway<\/html>/i)).toBeInTheDocument();
      });
    });

    it("falls back to HTTP status when body is empty", async () => {
      mockFetch.mockResolvedValue(makeResponse("", 503));
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => {
        expect(screen.getByText("HTTP 503")).toBeInTheDocument();
      });
    });

    it("shows error when fetch throws (network failure)", async () => {
      mockFetch.mockRejectedValue(new Error("Network unreachable"));
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => {
        expect(screen.getByText("Network unreachable")).toBeInTheDocument();
      });
    });

    it("clears previous error on new action attempt", async () => {
      mockFetch
        .mockResolvedValueOnce(makeResponse({ detail: "First error" }, 400))
        .mockResolvedValueOnce(makeResponse({ ok: true }, 200));
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => {
        expect(screen.getByText("First error")).toBeInTheDocument();
      });
      // Second attempt clears error
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => {
        expect(screen.queryByText("First error")).not.toBeInTheDocument();
      });
    });

    it("does not show success card when there is an error", async () => {
      mockFetch.mockResolvedValue(makeResponse({ detail: "Failed" }, 400));
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => {
        expect(screen.getByText("Failed")).toBeInTheDocument();
      });
      expect(screen.queryByText("Swap approved")).not.toBeInTheDocument();
      expect(screen.queryByText("Swap rejected")).not.toBeInTheDocument();
    });
  });

  // ── postJson success path ───────────────────────────────────────────────────

  describe("postJson success path", () => {
    beforeEach(() => setAuth());

    it("handles non-JSON 200 response body gracefully", async () => {
      // postJson falls back to { ok: true, raw: text } when body is not JSON
      mockFetch.mockResolvedValue(makeResponse("OK plain text", 200));
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => {
        expect(screen.getByText("Swap approved")).toBeInTheDocument();
      });
    });

    it("includes PIN in API call query string", async () => {
      mockFetch.mockResolvedValue(makeResponse({ ok: true }));
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm("req-xyz", undefined, "secret-pin");
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => {
        const url = String(mockFetch.mock.calls[0][0]);
        expect(url).toContain("pin=secret-pin");
      });
    });

    it("includes staff_name in API call query string", async () => {
      mockFetch.mockResolvedValue(makeResponse({ ok: true }));
      setAuth({ staffName: "Jay N" });
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm("req-001");
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => {
        const url = String(mockFetch.mock.calls[0][0]);
        expect(url).toContain("staff_name=Jay+N");
      });
    });

    it("calls the correct API endpoint", async () => {
      mockFetch.mockResolvedValue(makeResponse({ ok: true }));
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => {
        const url = String(mockFetch.mock.calls[0][0]);
        expect(url).toContain("/api/shift_change/counterparty/respond");
      });
    });

    it("uses POST method for API call", async () => {
      mockFetch.mockResolvedValue(makeResponse({ ok: true }));
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => {
        const options = mockFetch.mock.calls[0][1] as RequestInit;
        expect(options?.method).toBe("POST");
      });
    });
  });

  // ── Success state ───────────────────────────────────────────────────────────

  describe("Success state display", () => {
    beforeEach(() => setAuth());

    it("success card is not visible before any action", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("Swap Approve")).toBeInTheDocument();
      });
      expect(screen.queryByText("Swap approved")).not.toBeInTheDocument();
      expect(screen.queryByText("Swap rejected")).not.toBeInTheDocument();
    });

    it("success card shows notification text after approved", async () => {
      mockFetch.mockResolvedValue(makeResponse({ ok: true }));
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => {
        expect(screen.getByText("Swap approved")).toBeInTheDocument();
        expect(
          screen.getByText(/the system has recorded your response/i),
        ).toBeInTheDocument();
      });
    });

    it("success card shows notification text after rejected", async () => {
      mockFetch.mockResolvedValue(makeResponse({ ok: true }));
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
      });
      await fillForm();
      fireEvent.click(screen.getByRole("button", { name: "Reject" }));
      await waitFor(() => {
        expect(screen.getByText("Swap rejected")).toBeInTheDocument();
        expect(
          screen.getByText(/the system has recorded your response/i),
        ).toBeInTheDocument();
      });
    });
  });

  // ── qs() helper behavior ────────────────────────────────────────────────────

  describe("URL query string construction", () => {
    beforeEach(() => setAuth({ staffName: "J Test" }));

    it("omits undefined/null/empty params from query string", async () => {
      mockFetch.mockResolvedValue(makeResponse({ ok: true }));
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
      });
      // Fill with actual values
      await fillForm("req-abc", undefined, "pin-xyz", "test note");
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => {
        const url = String(mockFetch.mock.calls[0][0]);
        // Should contain all non-empty params
        expect(url).toContain("req_id=req-abc");
        expect(url).toContain("staff_name=J+Test");
        expect(url).toContain("action=APPROVED");
        expect(url).toContain("note=test+note");
        expect(url).toContain("pin=pin-xyz");
      });
    });
  });
});
