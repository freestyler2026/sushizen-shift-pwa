// tests/private-report/private-report-page.test.tsx
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { routerMock } from "../setup";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("lucide-react", () => ({
  ShieldAlert: () => <span data-testid="shield-alert" />,
}));

// Auth mock — refreshAuthFromApi is the main gate for this page.
// Use plain arrow function (not vi.fn()) so vi.restoreAllMocks() in setup.ts
// doesn't reset it between tests.
let mockRefreshed: Record<string, unknown> | null = null;

vi.mock("@/lib/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...real,
    getAuth: () => mockRefreshed,
    // Plain function closing over mockRefreshed — immune to vi.restoreAllMocks()
    refreshAuthFromApi: () => Promise.resolve(mockRefreshed),
  };
});

// Fetch mock
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ── Helpers ───────────────────────────────────────────────────────────────────

function staffAuth(overrides: Record<string, unknown> = {}) {
  return {
    staffName: "Test Staff",
    city: "manila",
    role: "STAFF",
    accessToken: "tok-staff",
    ...overrides,
  };
}

function okJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response);
}

function errorResponse(status = 500, text = "Server error") {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.reject(new Error(text)),
    text: () => Promise.resolve(text),
  } as Response);
}

async function renderPage() {
  const { default: PrivateReportPage } = await import(
    "@/app/private-report/page"
  );
  return render(<PrivateReportPage />);
}

// Fill the minimum fields required for app-private-report submission
function fillAppReportForm(dateTime = "2026-05-12T10:00") {
  fireEvent.change(screen.getByLabelText(/Date \/ Time/i) ||
    screen.getByDisplayValue(/.*/), { target: { value: "" } });
  // Use the datetime input
  const dateInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
  fireEvent.change(dateInput, { target: { value: dateTime } });

  fireEvent.change(
    screen.getByPlaceholderText(/URL or short note/i)
      .parentElement!.previousElementSibling!.querySelector("input") ||
    (document.querySelector('input[placeholder="URL or short note"]') as HTMLElement),
    { target: { value: "" } }
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("/private-report — auth guard", () => {
  it("redirects to /login when refreshAuthFromApi returns null", async () => {
    mockRefreshed = null;
    await renderPage();
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith(
        "/login?next=%2Fprivate-report"
      )
    );
  });

  it("redirects to /login when no accessToken", async () => {
    mockRefreshed = { staffName: "Alice", city: "manila" }; // no accessToken
    await renderPage();
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith(
        "/login?next=%2Fprivate-report"
      )
    );
  });

  it("redirects to /login when no staffName", async () => {
    mockRefreshed = { city: "manila", accessToken: "tok" }; // no staffName
    await renderPage();
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith(
        "/login?next=%2Fprivate-report"
      )
    );
  });

  it("does NOT redirect when fully authenticated", async () => {
    mockRefreshed = staffAuth();
    await renderPage();
    await waitFor(() =>
      expect(routerMock.replace).not.toHaveBeenCalled()
    );
  });
});

describe("/private-report — page structure", () => {
  beforeEach(() => {
    mockRefreshed = staffAuth();
  });

  it("renders 'Private Report' heading", async () => {
    await renderPage();
    expect(screen.getByText("Private Report")).toBeInTheDocument();
  });

  it("renders subtitle text", async () => {
    await renderPage();
    expect(
      screen.getByText(/Submit private reports directly to HQ\/HR/i)
    ).toBeInTheDocument();
  });

  it("renders 'Confidential' badge", async () => {
    await renderPage();
    expect(screen.getByText("Confidential")).toBeInTheDocument();
  });

  it("renders anonymous posting notice", async () => {
    await renderPage();
    expect(screen.getByText(/Anonymous posting notice/i)).toBeInTheDocument();
  });

  it("renders Report Type select", async () => {
    await renderPage();
    expect(screen.getByDisplayValue("app-private-report")).toBeInTheDocument();
  });

  it("renders City select defaulting to auth city (manila)", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByDisplayValue("Manila")).toBeInTheDocument()
    );
  });

  it("renders City select defaulting to dubai when auth city is dubai", async () => {
    mockRefreshed = staffAuth({ city: "dubai" });
    await renderPage();
    await waitFor(() =>
      expect(screen.getByDisplayValue("Dubai")).toBeInTheDocument()
    );
  });

  it("renders Submit Private Report button", async () => {
    await renderPage();
    expect(screen.getByText("Submit Private Report")).toBeInTheDocument();
  });
});

describe("/private-report — report type switching", () => {
  beforeEach(() => {
    mockRefreshed = staffAuth();
  });

  it("defaults to app-private-report showing Screen/Feature field", async () => {
    await renderPage();
    expect(screen.getByText("Screen / Feature")).toBeInTheDocument();
  });

  it("app type shows Problem, Expected, Actual, Screenshot fields", async () => {
    await renderPage();
    expect(screen.getByText("Problem")).toBeInTheDocument();
    expect(screen.getByText("What you expected")).toBeInTheDocument();
    expect(screen.getByText("What actually happened")).toBeInTheDocument();
    expect(screen.getByText("Screenshot")).toBeInTheDocument();
  });

  it("switching to hq-private-report shows 'What happened' field", async () => {
    await renderPage();
    fireEvent.change(screen.getByDisplayValue("app-private-report"), {
      target: { value: "hq-private-report" },
    });
    await waitFor(() =>
      expect(screen.getByText("What happened")).toBeInTheDocument()
    );
  });

  it("switching to hq-private-report shows 'Why this is a problem' field", async () => {
    await renderPage();
    fireEvent.change(screen.getByDisplayValue("app-private-report"), {
      target: { value: "hq-private-report" },
    });
    await waitFor(() =>
      expect(screen.getByText("Why this is a problem")).toBeInTheDocument()
    );
  });

  it("switching to hq-private-report shows HQ description text", async () => {
    await renderPage();
    fireEvent.change(screen.getByDisplayValue("app-private-report"), {
      target: { value: "hq-private-report" },
    });
    await waitFor(() =>
      expect(screen.getByText(/issues you notice in day-to-day operations/i)).toBeInTheDocument()
    );
  });

  it("switching to hq-private-report shows Category select", async () => {
    await renderPage();
    fireEvent.change(screen.getByDisplayValue("app-private-report"), {
      target: { value: "hq-private-report" },
    });
    await waitFor(() =>
      expect(screen.getByDisplayValue("Suggestion")).toBeInTheDocument()
    );
  });

  it("switching to hq-private-report hides app-specific fields", async () => {
    await renderPage();
    fireEvent.change(screen.getByDisplayValue("app-private-report"), {
      target: { value: "hq-private-report" },
    });
    await waitFor(() =>
      expect(screen.queryByText("Screen / Feature")).not.toBeInTheDocument()
    );
  });

  it("switching back to app type restores app fields", async () => {
    await renderPage();
    fireEvent.change(screen.getByDisplayValue("app-private-report"), {
      target: { value: "hq-private-report" },
    });
    await waitFor(() => screen.getByText("What happened"));
    fireEvent.change(screen.getByDisplayValue("hq-private-report"), {
      target: { value: "app-private-report" },
    });
    await waitFor(() =>
      expect(screen.getByText("Screen / Feature")).toBeInTheDocument()
    );
  });
});

describe("/private-report — city and branch logic", () => {
  beforeEach(() => {
    mockRefreshed = staffAuth({ city: "manila" });
  });

  it("shows Manila branches when city is manila", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Paranaque/i)).toBeInTheDocument()
    );
  });

  it("shows Dubai branches when city is switched to dubai", async () => {
    await renderPage();
    await waitFor(() => screen.getByText(/Paranaque/i));
    fireEvent.change(screen.getByDisplayValue("Manila"), {
      target: { value: "dubai" },
    });
    await waitFor(() =>
      expect(screen.getByText(/Business Bay/i)).toBeInTheDocument()
    );
  });

  it("city change resets branch to empty", async () => {
    await renderPage();
    await waitFor(() => screen.getByText(/Paranaque/i));
    // Select a branch first
    fireEvent.change(screen.getByText("- Select branch -").closest("select")!, {
      target: { value: "PAR" },
    });
    // Now switch city
    fireEvent.change(screen.getByDisplayValue("Manila"), {
      target: { value: "dubai" },
    });
    await waitFor(() =>
      expect(
        (screen.getByText("- Select branch -").closest("select") as HTMLSelectElement).value
      ).toBe("")
    );
  });
});

describe("/private-report — form validation (app type)", () => {
  beforeEach(() => {
    mockRefreshed = staffAuth();
  });

  it("shows error when date/time is missing", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Submit Private Report"));
    await waitFor(() =>
      expect(screen.getByText(/Date \/ Time is required/i)).toBeInTheDocument()
    );
  });

  it("shows error when Screen/Feature is missing", async () => {
    await renderPage();
    const dateInput = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-05-12T10:00" } });
    fireEvent.click(screen.getByText("Submit Private Report"));
    await waitFor(() =>
      expect(
        screen.getByText(/Screen \/ Feature is required/i)
      ).toBeInTheDocument()
    );
  });

  it("shows error when Problem is missing", async () => {
    await renderPage();
    const dateInput = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-05-12T10:00" } });
    // Fill screenFeature
    const screenInput = document.querySelectorAll(
      'input[class*="INPUT_POLISH"], input:not([type])'
    );
    const sfInput = Array.from(
      document.querySelectorAll("input")
    ).find((el) => el.placeholder !== "URL or short note" && el.type !== "datetime-local");
    if (sfInput) fireEvent.change(sfInput, { target: { value: "Settings page" } });
    fireEvent.click(screen.getByText("Submit Private Report"));
    await waitFor(() =>
      expect(screen.getByText(/Problem is required/i)).toBeInTheDocument()
    );
  });
});

describe("/private-report — form validation (hq type)", () => {
  beforeEach(() => {
    mockRefreshed = staffAuth();
  });

  async function switchToHQ() {
    await renderPage();
    fireEvent.change(screen.getByDisplayValue("app-private-report"), {
      target: { value: "hq-private-report" },
    });
    await waitFor(() => screen.getByText("What happened"));
  }

  it("shows error when date/time missing for hq type", async () => {
    await switchToHQ();
    fireEvent.click(screen.getByText("Submit Private Report"));
    await waitFor(() =>
      expect(screen.getByText(/Date \/ Time is required/i)).toBeInTheDocument()
    );
  });

  it("shows error when 'What happened' is missing", async () => {
    await switchToHQ();
    const dateInput = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-05-12T10:00" } });
    fireEvent.click(screen.getByText("Submit Private Report"));
    await waitFor(() =>
      expect(screen.getByText(/What happened is required/i)).toBeInTheDocument()
    );
  });

  it("shows error when 'Why this is a problem' is missing", async () => {
    await switchToHQ();
    const dateInput = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-05-12T10:00" } });
    // Fill whatHappened
    const textareas = document.querySelectorAll("textarea");
    fireEvent.change(textareas[0], {
      target: { value: "There is a problem with management" },
    });
    fireEvent.click(screen.getByText("Submit Private Report"));
    await waitFor(() =>
      expect(
        screen.getByText(/Why this is a problem is required/i)
      ).toBeInTheDocument()
    );
  });
});

describe("/private-report — submit success", () => {
  beforeEach(() => {
    mockRefreshed = staffAuth();
  });

  async function fillAndSubmitHQReport() {
    await renderPage();
    fireEvent.change(screen.getByDisplayValue("app-private-report"), {
      target: { value: "hq-private-report" },
    });
    await waitFor(() => screen.getByText("What happened"));

    const dateInput = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-05-12T10:00" } });

    const textareas = document.querySelectorAll("textarea");
    fireEvent.change(textareas[0], {
      target: { value: "There is a serious issue" },
    });
    fireEvent.change(textareas[1], {
      target: { value: "It affects team morale" },
    });

    mockFetch.mockResolvedValueOnce(
      okJson({ ok: true, report_id: "rpt-abc-123", receipt_message: "Thank you for your report." })
    );
    fireEvent.click(screen.getByText("Submit Private Report"));
  }

  it("shows 'Report Submitted' success banner", async () => {
    await fillAndSubmitHQReport();
    await waitFor(() =>
      expect(screen.getByText("Report Submitted")).toBeInTheDocument()
    );
  });

  it("shows receipt_message from API", async () => {
    await fillAndSubmitHQReport();
    await waitFor(() =>
      expect(
        screen.getByText("Thank you for your report.")
      ).toBeInTheDocument()
    );
  });

  it("shows report_id from API", async () => {
    await fillAndSubmitHQReport();
    await waitFor(() =>
      expect(screen.getByText("rpt-abc-123")).toBeInTheDocument()
    );
  });

  it("hides the form after success", async () => {
    await fillAndSubmitHQReport();
    await waitFor(() => screen.getByText("Report Submitted"));
    expect(screen.queryByText("Submit Private Report")).not.toBeInTheDocument();
  });

  it("shows 'Submit Another Report' button", async () => {
    await fillAndSubmitHQReport();
    await waitFor(() =>
      expect(screen.getByText("Submit Another Report")).toBeInTheDocument()
    );
  });

  it("clicking 'Submit Another Report' restores the form", async () => {
    await fillAndSubmitHQReport();
    await waitFor(() => screen.getByText("Submit Another Report"));
    fireEvent.click(screen.getByText("Submit Another Report"));
    await waitFor(() =>
      expect(screen.getByText("Submit Private Report")).toBeInTheDocument()
    );
  });
});

describe("/private-report — submit error", () => {
  beforeEach(() => {
    mockRefreshed = staffAuth();
  });

  it("shows 'Submission Failed' banner on API error", async () => {
    await renderPage();
    const dateInput = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-05-12T10:00" } });

    // Fill all required app-report fields
    const inputs = Array.from(document.querySelectorAll("input")).filter(
      (el) => el.type !== "datetime-local"
    );
    if (inputs[0]) fireEvent.change(inputs[0], { target: { value: "Login screen" } });

    const textareas = document.querySelectorAll("textarea");
    fireEvent.change(textareas[0], { target: { value: "Button does not work" } });
    fireEvent.change(textareas[1], { target: { value: "Button should submit form" } });
    fireEvent.change(textareas[2], { target: { value: "Nothing happens on click" } });

    mockFetch.mockResolvedValueOnce(errorResponse(500, "Internal server error"));
    fireEvent.click(screen.getByText("Submit Private Report"));

    await waitFor(() =>
      expect(screen.getByText("Submission Failed")).toBeInTheDocument()
    );
  });

  it("shows error message text", async () => {
    await renderPage();
    const dateInput = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-05-12T10:00" } });

    const inputs = Array.from(document.querySelectorAll("input")).filter(
      (el) => el.type !== "datetime-local"
    );
    if (inputs[0]) fireEvent.change(inputs[0], { target: { value: "Payroll page" } });

    const textareas = document.querySelectorAll("textarea");
    fireEvent.change(textareas[0], { target: { value: "Crashes on load" } });
    fireEvent.change(textareas[1], { target: { value: "Should open normally" } });
    fireEvent.change(textareas[2], { target: { value: "White screen appears" } });

    mockFetch.mockResolvedValueOnce(errorResponse(500, "Database connection error"));
    fireEvent.click(screen.getByText("Submit Private Report"));

    await waitFor(() =>
      expect(
        screen.getByText(/Database connection error/)
      ).toBeInTheDocument()
    );
  });
});

describe("/private-report — resetForm bug regression", () => {
  beforeEach(() => {
    mockRefreshed = staffAuth();
  });

  it("clears whatHappened after Submit Another Report", async () => {
    await renderPage();

    // Switch to HQ and fill fields
    fireEvent.change(screen.getByDisplayValue("app-private-report"), {
      target: { value: "hq-private-report" },
    });
    await waitFor(() => screen.getByText("What happened"));

    const dateInput = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-05-12T10:00" } });

    const textareas = document.querySelectorAll("textarea");
    fireEvent.change(textareas[0], {
      target: { value: "Something bad happened here" },
    });
    fireEvent.change(textareas[1], {
      target: { value: "This is a serious problem" },
    });

    mockFetch.mockResolvedValueOnce(
      okJson({ ok: true, report_id: "rpt-999" })
    );
    fireEvent.click(screen.getByText("Submit Private Report"));
    await waitFor(() => screen.getByText("Submit Another Report"));

    // Click reset
    fireEvent.click(screen.getByText("Submit Another Report"));
    // reportType stays as hq-private-report after reset (by design)
    await waitFor(() => screen.getByText("What happened"));

    const freshTextareas = document.querySelectorAll("textarea");
    // Before fix: would still contain "Something bad happened here"
    expect((freshTextareas[0] as HTMLTextAreaElement).value).toBe("");
  });

  it("clears whyProblem after Submit Another Report (bug regression)", async () => {
    await renderPage();

    fireEvent.change(screen.getByDisplayValue("app-private-report"), {
      target: { value: "hq-private-report" },
    });
    await waitFor(() => screen.getByText("What happened"));

    const dateInput = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-05-12T10:00" } });

    const textareas = document.querySelectorAll("textarea");
    fireEvent.change(textareas[0], { target: { value: "An incident occurred" } });
    fireEvent.change(textareas[1], { target: { value: "Very serious problem" } });

    mockFetch.mockResolvedValueOnce(okJson({ ok: true, report_id: "rpt-888" }));
    fireEvent.click(screen.getByText("Submit Private Report"));
    await waitFor(() => screen.getByText("Submit Another Report"));

    fireEvent.click(screen.getByText("Submit Another Report"));
    // reportType stays as hq-private-report after reset (by design)
    await waitFor(() => screen.getByText("What happened"));

    const freshTextareas = document.querySelectorAll("textarea");
    // Before fix: would still contain "Very serious problem"
    expect((freshTextareas[1] as HTMLTextAreaElement).value).toBe("");
  });

  it("resets category to Suggestion after Submit Another Report", async () => {
    await renderPage();

    fireEvent.change(screen.getByDisplayValue("app-private-report"), {
      target: { value: "hq-private-report" },
    });
    await waitFor(() => screen.getByDisplayValue("Suggestion"));

    // Change category
    fireEvent.change(screen.getByDisplayValue("Suggestion"), {
      target: { value: "Management" },
    });
    expect(screen.getByDisplayValue("Management")).toBeInTheDocument();

    const dateInput = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-05-12T10:00" } });

    const textareas = document.querySelectorAll("textarea");
    fireEvent.change(textareas[0], { target: { value: "Management issue" } });
    fireEvent.change(textareas[1], { target: { value: "Affects productivity" } });

    mockFetch.mockResolvedValueOnce(okJson({ ok: true }));
    fireEvent.click(screen.getByText("Submit Private Report"));
    await waitFor(() => screen.getByText("Submit Another Report"));

    fireEvent.click(screen.getByText("Submit Another Report"));
    // reportType stays as hq-private-report — category select is visible directly
    await waitFor(() => screen.getByText("What happened"));

    // Before fix: would still show "Management"
    expect(screen.getByDisplayValue("Suggestion")).toBeInTheDocument();
  });

  it("resets anonymousRequest to Yes after Submit Another Report", async () => {
    await renderPage();

    fireEvent.change(screen.getByDisplayValue("app-private-report"), {
      target: { value: "hq-private-report" },
    });
    await waitFor(() => screen.getByDisplayValue("Yes"));

    // Change to No
    fireEvent.change(screen.getByDisplayValue("Yes"), {
      target: { value: "no" },
    });
    expect(screen.getByDisplayValue("No")).toBeInTheDocument();

    const dateInput = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-05-12T10:00" } });

    const textareas = document.querySelectorAll("textarea");
    fireEvent.change(textareas[0], { target: { value: "A complaint" } });
    fireEvent.change(textareas[1], { target: { value: "A reason" } });

    mockFetch.mockResolvedValueOnce(okJson({ ok: true }));
    fireEvent.click(screen.getByText("Submit Private Report"));
    await waitFor(() => screen.getByText("Submit Another Report"));

    fireEvent.click(screen.getByText("Submit Another Report"));
    // reportType stays as hq-private-report — anonymous select is visible directly
    await waitFor(() => screen.getByText("What happened"));

    // Before fix: would show "No" — after fix shows "Yes" (reset to true)
    expect(screen.getByDisplayValue("Yes")).toBeInTheDocument();
  });
});

describe("/private-report — HQ type category options", () => {
  beforeEach(() => {
    mockRefreshed = staffAuth();
  });

  it("has App, Operation, Management, Staff issue, Suggestion, Other options", async () => {
    await renderPage();
    fireEvent.change(screen.getByDisplayValue("app-private-report"), {
      target: { value: "hq-private-report" },
    });
    await waitFor(() => screen.getByDisplayValue("Suggestion"));
    const select = screen.getByDisplayValue("Suggestion") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain("App");
    expect(values).toContain("Operation");
    expect(values).toContain("Management");
    expect(values).toContain("Staff issue");
    expect(values).toContain("Suggestion");
    expect(values).toContain("Other");
  });
});
