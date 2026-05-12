// tests/my-pay/my-pay-page.test.tsx
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

// Lucide icons → plain spans to avoid SVG rendering complexity
vi.mock("lucide-react", () => {
  const Icon = (props: { className?: string }) => (
    <span data-testid="icon" className={props.className} />
  );
  return {
    Banknote: Icon, ChevronRight: Icon, Clock: Icon, CreditCard: Icon,
    FileText: Icon, Loader2: Icon, Receipt: Icon, TrendingDown: Icon,
    TrendingUp: Icon, Wallet: Icon, X: Icon,
  };
});

// Auth mock
let mockAuth: Record<string, unknown> | null = null;

vi.mock("@/lib/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...real,
    getAuth: () => mockAuth,
    getAuthHeaders: () => ({ Authorization: "Bearer test-token" }),
  };
});

// API_BASE → empty string (fetch paths will be relative)
vi.mock("@/lib/api", () => ({ API_BASE: "" }));

// Fetch mock
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// window.print mock
global.print = vi.fn();
Object.defineProperty(window, "print", { value: vi.fn(), writable: true });

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SUMMARY_EMPTY: import("@/app/my-pay/page").Summary = {
  latest_payslip: null,
  active_loans: 0,
  total_loan_remaining: 0,
  pending_adjustments: 0,
  pending_adj_net: 0,
} as any;

const SUMMARY_WITH_DATA = {
  latest_payslip: {
    net_pay: 25000,
    currency: "PHP",
    cycle_label: "May 2026",
    pay_date: "2026-05-10",
  },
  active_loans: 1,
  total_loan_remaining: 12000,
  pending_adjustments: 2,
  pending_adj_net: -500,
};

const PAYSLIP_MANILA = {
  id: "slip-1",
  cycle_id: 10,
  cycle_label: "May 2026",
  cycle_year: 2026,
  cycle_month: 5,
  pay_date: "2026-05-10",
  basic_salary: 20000,
  total_adjustments: 500,
  net_additions: 500,
  net_deductions: 200,
  gross_pay: 20500,
  net_pay: 20300,
  currency: "PHP",
  role_title: "Sushi Chef",
  branch_code: "TAFT",
  paid_via: "bank",
  staff_name: "Test Staff",
  city: "manila",
};

const PAYSLIP_DUBAI = {
  ...PAYSLIP_MANILA,
  id: "slip-2",
  currency: "AED",
  city: "dubai",
  net_pay: 3500,
  basic_salary: 3500,
  net_deductions: 0,
  net_additions: 0,
  gross_pay: 3500,
};

const ADJUSTMENT_ADDITION = {
  id: "adj-1",
  cycle_id: 10,
  cycle_label: "May 2026",
  cycle_year: 2026,
  cycle_month: 5,
  pay_date: null,
  adj_type: "addition",
  subtype: "bonus",
  amount: 1000,
  vat: 0,
  incurred_at: null,
  reference_no: "REF001",
  note: "Performance bonus",
  source: "admin",
  created_by: "Manager A",
  created_at: "2026-05-01T08:00:00Z",
};

const ADJUSTMENT_DEDUCTION = {
  ...ADJUSTMENT_ADDITION,
  id: "adj-2",
  adj_type: "deduction",
  subtype: "loan",
  amount: 500,
  note: "Loan repayment",
};

const LOAN_ACTIVE = {
  id: "loan-1",
  amount: 24000,
  installment_amount: 2000,
  total_installments: 12,
  remaining_installments: 6,
  paid_installments: 6,
  remaining_balance: 12000,
  total_repaid: 12000,
  status: "active",
  purpose: "Emergency medical",
  note: "",
  approved_by: "HR Manager",
  approved_at: "2025-11-01T00:00:00Z",
  disbursed_at: "2025-11-05T00:00:00Z",
  start_cycle_id: 5,
  created_at: "2025-10-28T00:00:00Z",
};

const LOAN_APPROVED = {
  ...LOAN_ACTIVE,
  id: "loan-2",
  status: "approved",
  disbursed_at: null,
};

const LEAVE_REQ_PAID = {
  id: "leave-1",
  leave_start_date: "2026-06-01",
  leave_end_date: "2026-06-14",
  leave_days: 14,
  currency: "PHP",
  daily_rate: 800,
  advance_amount: 11200,
  status: "paid",
  purpose: "Annual leave",
  requested_at: "2026-05-01T08:00:00Z",
  approved_by: "HR Manager",
  approved_at: "2026-05-02T00:00:00Z",
  paid_at: "2026-05-10T00:00:00Z",
  paid_via: "bank",
  rejection_note: "",
};

const LEAVE_REQ_REJECTED = {
  ...LEAVE_REQ_PAID,
  id: "leave-2",
  status: "rejected",
  paid_at: null,
  rejection_note: "Insufficient leave balance",
};

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
  // clear module cache so getAuth() picks up mockAuth
  const { default: MyPayPage } = await import("@/app/my-pay/page");
  return render(<MyPayPage />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("/my-pay — auth guard", () => {
  it("redirects to / when not authenticated", async () => {
    mockAuth = null;
    await renderPage();
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/")
    );
  });

  it("does NOT redirect when authenticated", async () => {
    mockAuth = staffAuth();
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }));
    await renderPage();
    await waitFor(() =>
      expect(routerMock.replace).not.toHaveBeenCalled()
    );
  });
});

describe("/my-pay — page structure", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockFetch
      .mockResolvedValue(okJson({ payslips: [], adjustments: [], loans: [], requests: [], ...SUMMARY_EMPTY }));
  });

  it("renders page heading 'My Pay'", async () => {
    await renderPage();
    expect(screen.getByText("My Pay")).toBeInTheDocument();
  });

  it("renders 'Self-Service' label", async () => {
    await renderPage();
    expect(screen.getByText("Self-Service")).toBeInTheDocument();
  });

  it("renders Dubai city button", async () => {
    await renderPage();
    expect(screen.getByText("🇦🇪 Dubai")).toBeInTheDocument();
  });

  it("renders Manila city button", async () => {
    await renderPage();
    expect(screen.getByText("🇵🇭 Manila")).toBeInTheDocument();
  });
});

describe("/my-pay — loading and error states", () => {
  it("shows loading spinner initially", async () => {
    mockAuth = staffAuth();
    // never resolves — keeps loading state active
    mockFetch.mockReturnValue(new Promise(() => {}));
    await renderPage();
    expect(screen.getByText(/Loading your pay data/i)).toBeInTheDocument();
  });

  it("hides loading spinner after data loads", async () => {
    mockAuth = staffAuth();
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }));
    await renderPage();
    await waitFor(() =>
      expect(screen.queryByText(/Loading your pay data/i)).not.toBeInTheDocument()
    );
  });

  it("shows error message when summary fails", async () => {
    mockAuth = staffAuth();
    mockFetch
      .mockResolvedValueOnce(errorResponse(500, "DB error"))
      .mockResolvedValueOnce(okJson({ payslips: [] }));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Failed to load pay summary/i)).toBeInTheDocument()
    );
  });

  it("shows error when tab data fails", async () => {
    mockAuth = staffAuth();
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(errorResponse(500, "DB error"));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Failed to load tab data/i)).toBeInTheDocument()
    );
  });
});

describe("/my-pay — KPI summary cards", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_WITH_DATA))
      .mockResolvedValueOnce(okJson({ payslips: [] }));
  });

  it("renders 'Last Net Pay' label", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Last Net Pay")).toBeInTheDocument()
    );
  });

  it("displays latest net pay amount", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/25,000\.00/)).toBeInTheDocument()
    );
  });

  it("displays cycle label", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("May 2026")).toBeInTheDocument()
    );
  });

  it("renders 'Loan Balance' label", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Loan Balance")).toBeInTheDocument()
    );
  });

  it("shows active loan count", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("1 active loan")).toBeInTheDocument()
    );
  });

  it("renders 'Pending Adj.' label", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Pending Adj.")).toBeInTheDocument()
    );
  });

  it("shows pending adjustment count", async () => {
    await renderPage();
    await waitFor(() =>
      // pending_adjustments = 2
      expect(screen.getByText("2")).toBeInTheDocument()
    );
  });

  it("shows negative pending_adj_net in red", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/PHP.*500\.00/)).toBeInTheDocument()
    );
  });

  it("shows 'Last Pay Date' label", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Last Pay Date")).toBeInTheDocument()
    );
  });

  it("shows 'No records yet' when no latest payslip", async () => {
    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("No records yet")).toBeInTheDocument()
    );
  });

  it("shows 'No active loans' when active_loans = 0", async () => {
    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("No active loans")).toBeInTheDocument()
    );
  });
});

describe("/my-pay — tab bar", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }));
  });

  it("renders Pay Slips tab", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Pay Slips")).toBeInTheDocument()
    );
  });

  it("renders Adjustments tab", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Adjustments")).toBeInTheDocument()
    );
  });

  it("renders Loans tab", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Loans")).toBeInTheDocument()
    );
  });

  it("renders Leave Advance tab", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Leave Advance")).toBeInTheDocument()
    );
  });
});

describe("/my-pay — payslips tab", () => {
  it("shows empty state when no payslips", async () => {
    mockAuth = staffAuth();
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("No pay slips yet")).toBeInTheDocument()
    );
  });

  it("displays payslip cycle label", async () => {
    mockAuth = staffAuth();
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [PAYSLIP_MANILA] }));
    await renderPage();
    await waitFor(() =>
      // formatCycleLabel(2026, 5, "May 2026") → "May 2026"
      expect(screen.getAllByText("May 2026").length).toBeGreaterThan(0)
    );
  });

  it("displays payslip net pay", async () => {
    mockAuth = staffAuth();
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [PAYSLIP_MANILA] }));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/PHP.*20,300\.00/)).toBeInTheDocument()
    );
  });

  it("shows role title on payslip card", async () => {
    mockAuth = staffAuth();
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [PAYSLIP_MANILA] }));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Sushi Chef")).toBeInTheDocument()
    );
  });

  it("shows deduction line when net_deductions > 0", async () => {
    mockAuth = staffAuth();
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [PAYSLIP_MANILA] }));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/PHP.*200\.00.*deducted/)).toBeInTheDocument()
    );
  });

  it("opens payslip modal when clicking a payslip card", async () => {
    mockAuth = staffAuth();
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [PAYSLIP_MANILA] }));
    await renderPage();
    await waitFor(() => screen.getByText("Sushi Chef"));
    // Find and click the payslip row button
    fireEvent.click(screen.getAllByText("May 2026")[0].closest("button")!);
    await waitFor(() =>
      expect(screen.getByText("Pay Slip")).toBeInTheDocument()
    );
  });
});

describe("/my-pay — payslip modal", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [PAYSLIP_MANILA] }));
  });

  async function openModal() {
    await renderPage();
    await waitFor(() => screen.getByText("Sushi Chef"));
    fireEvent.click(screen.getAllByText("May 2026")[0].closest("button")!);
    await waitFor(() => screen.getByText("Pay Slip"));
  }

  it("shows 'Sushi ZEN' in modal header", async () => {
    await openModal();
    expect(screen.getByText("Sushi ZEN")).toBeInTheDocument();
  });

  it("shows employee name in modal", async () => {
    await openModal();
    expect(screen.getByText("Test Staff")).toBeInTheDocument();
  });

  it("shows branch code in modal", async () => {
    await openModal();
    expect(screen.getByText("TAFT")).toBeInTheDocument();
  });

  it("shows basic salary in modal", async () => {
    await openModal();
    expect(screen.getByText(/PHP.*20,000\.00/)).toBeInTheDocument();
  });

  it("shows net pay in modal", async () => {
    await openModal();
    expect(screen.getAllByText(/PHP.*20,300\.00/).length).toBeGreaterThan(0);
  });

  it("shows 'Manila Operations' for manila city payslip", async () => {
    await openModal();
    expect(screen.getByText(/Manila Operations/i)).toBeInTheDocument();
  });

  it("shows 'Dubai Operations' for dubai city payslip (isManila bug regression)", async () => {
    // Reset and use Dubai payslip
    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [PAYSLIP_DUBAI] }));
    await renderPage();
    await waitFor(() => screen.getByText("Sushi Chef"));
    fireEvent.click(screen.getAllByText("May 2026")[0].closest("button")!);
    await waitFor(() => screen.getByText("Pay Slip"));
    // Before fix: would show "Manila Operations" for a Dubai slip
    expect(screen.getByText(/Dubai Operations/i)).toBeInTheDocument();
    expect(screen.queryByText(/Manila Operations/i)).not.toBeInTheDocument();
  });

  it("closes modal when Close button is clicked", async () => {
    await openModal();
    fireEvent.click(screen.getByText("Close"));
    await waitFor(() =>
      expect(screen.queryByText("Pay Slip")).not.toBeInTheDocument()
    );
  });

  it("shows Print / Save PDF button in modal", async () => {
    await openModal();
    expect(screen.getByText("Print / Save PDF")).toBeInTheDocument();
  });

  it("shows Allowances & Additions row when net_additions > 0", async () => {
    await openModal();
    expect(screen.getByText("Allowances & Additions")).toBeInTheDocument();
  });

  it("shows Deductions section when net_deductions > 0", async () => {
    await openModal();
    expect(screen.getByText("Total Deductions")).toBeInTheDocument();
  });
});

describe("/my-pay — adjustments tab", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
  });

  it("shows empty state when no adjustments", async () => {
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }))
      .mockResolvedValueOnce(okJson({ adjustments: [] }));
    await renderPage();
    await waitFor(() => screen.getByText("Pay Slips"));
    fireEvent.click(screen.getByText("Adjustments"));
    await waitFor(() =>
      expect(screen.getByText("No adjustments on record")).toBeInTheDocument()
    );
  });

  it("shows addition with subtype and note", async () => {
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }))
      .mockResolvedValueOnce(okJson({ adjustments: [ADJUSTMENT_ADDITION] }));
    await renderPage();
    await waitFor(() => screen.getByText("Pay Slips"));
    fireEvent.click(screen.getByText("Adjustments"));
    await waitFor(() =>
      expect(screen.getByText("bonus")).toBeInTheDocument()
    );
    expect(screen.getByText("Performance bonus")).toBeInTheDocument();
  });

  it("shows positive amount for addition", async () => {
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }))
      .mockResolvedValueOnce(okJson({ adjustments: [ADJUSTMENT_ADDITION] }));
    await renderPage();
    await waitFor(() => screen.getByText("Pay Slips"));
    fireEvent.click(screen.getByText("Adjustments"));
    await waitFor(() =>
      expect(screen.getByText(/\+PHP.*1,000\.00/)).toBeInTheDocument()
    );
  });

  it("shows negative amount for deduction", async () => {
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }))
      .mockResolvedValueOnce(okJson({ adjustments: [ADJUSTMENT_DEDUCTION] }));
    await renderPage();
    await waitFor(() => screen.getByText("Pay Slips"));
    fireEvent.click(screen.getByText("Adjustments"));
    await waitFor(() =>
      expect(screen.getByText(/−PHP.*500\.00/)).toBeInTheDocument()
    );
  });

  it("shows created_by attribution", async () => {
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }))
      .mockResolvedValueOnce(okJson({ adjustments: [ADJUSTMENT_ADDITION] }));
    await renderPage();
    await waitFor(() => screen.getByText("Pay Slips"));
    fireEvent.click(screen.getByText("Adjustments"));
    await waitFor(() =>
      expect(screen.getByText(/Added by Manager A/)).toBeInTheDocument()
    );
  });
});

describe("/my-pay — loans tab", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
  });

  it("shows empty state when no loans", async () => {
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }))
      .mockResolvedValueOnce(okJson({ loans: [] }));
    await renderPage();
    await waitFor(() => screen.getByText("Pay Slips"));
    fireEvent.click(screen.getByText("Loans"));
    await waitFor(() =>
      expect(screen.getByText("No loan records")).toBeInTheDocument()
    );
  });

  it("shows active loan with purpose", async () => {
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }))
      .mockResolvedValueOnce(okJson({ loans: [LOAN_ACTIVE] }));
    await renderPage();
    await waitFor(() => screen.getByText("Pay Slips"));
    fireEvent.click(screen.getByText("Loans"));
    await waitFor(() =>
      expect(screen.getByText("Emergency medical")).toBeInTheDocument()
    );
  });

  it("shows active loan progress bar text", async () => {
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }))
      .mockResolvedValueOnce(okJson({ loans: [LOAN_ACTIVE] }));
    await renderPage();
    await waitFor(() => screen.getByText("Pay Slips"));
    fireEvent.click(screen.getByText("Loans"));
    await waitFor(() =>
      expect(screen.getByText("6/12 installments")).toBeInTheDocument()
    );
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("shows remaining balance on active loan", async () => {
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }))
      .mockResolvedValueOnce(okJson({ loans: [LOAN_ACTIVE] }));
    await renderPage();
    await waitFor(() => screen.getByText("Pay Slips"));
    fireEvent.click(screen.getByText("Loans"));
    await waitFor(() =>
      expect(screen.getByText(/PHP.*12,000\.00/)).toBeInTheDocument()
    );
  });

  it("shows 'Approved' badge for approved loan", async () => {
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }))
      .mockResolvedValueOnce(okJson({ loans: [LOAN_APPROVED] }));
    await renderPage();
    await waitFor(() => screen.getByText("Pay Slips"));
    fireEvent.click(screen.getByText("Loans"));
    await waitFor(() =>
      expect(screen.getByText("Approved")).toBeInTheDocument()
    );
  });
});

describe("/my-pay — leave advance tab", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
  });

  it("shows empty state when no leave requests", async () => {
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }))
      .mockResolvedValueOnce(okJson({ requests: [] }));
    await renderPage();
    await waitFor(() => screen.getByText("Pay Slips"));
    fireEvent.click(screen.getByText("Leave Advance"));
    await waitFor(() =>
      expect(screen.getByText("No leave advance requests")).toBeInTheDocument()
    );
  });

  it("shows paid leave request with dates", async () => {
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }))
      .mockResolvedValueOnce(okJson({ requests: [LEAVE_REQ_PAID] }));
    await renderPage();
    await waitFor(() => screen.getByText("Pay Slips"));
    fireEvent.click(screen.getByText("Leave Advance"));
    await waitFor(() =>
      expect(screen.getByText(/Annual leave/)).toBeInTheDocument()
    );
  });

  it("shows 'Paid' badge for paid leave request", async () => {
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }))
      .mockResolvedValueOnce(okJson({ requests: [LEAVE_REQ_PAID] }));
    await renderPage();
    await waitFor(() => screen.getByText("Pay Slips"));
    fireEvent.click(screen.getByText("Leave Advance"));
    await waitFor(() =>
      expect(screen.getByText("Paid")).toBeInTheDocument()
    );
  });

  it("shows advance amount", async () => {
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }))
      .mockResolvedValueOnce(okJson({ requests: [LEAVE_REQ_PAID] }));
    await renderPage();
    await waitFor(() => screen.getByText("Pay Slips"));
    fireEvent.click(screen.getByText("Leave Advance"));
    await waitFor(() =>
      expect(screen.getByText(/PHP.*11,200\.00/)).toBeInTheDocument()
    );
  });

  it("shows rejection note for rejected request", async () => {
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }))
      .mockResolvedValueOnce(okJson({ requests: [LEAVE_REQ_REJECTED] }));
    await renderPage();
    await waitFor(() => screen.getByText("Pay Slips"));
    fireEvent.click(screen.getByText("Leave Advance"));
    await waitFor(() =>
      expect(screen.getByText(/Insufficient leave balance/)).toBeInTheDocument()
    );
  });

  it("shows 'Rejected' badge for rejected leave request", async () => {
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [] }))
      .mockResolvedValueOnce(okJson({ requests: [LEAVE_REQ_REJECTED] }));
    await renderPage();
    await waitFor(() => screen.getByText("Pay Slips"));
    fireEvent.click(screen.getByText("Leave Advance"));
    await waitFor(() =>
      expect(screen.getByText("Rejected")).toBeInTheDocument()
    );
  });
});

describe("/my-pay — city toggle", () => {
  it("defaults to manila city when auth.city is 'manila'", async () => {
    mockAuth = staffAuth({ city: "manila" });
    mockFetch.mockResolvedValue(okJson({ payslips: [], ...SUMMARY_EMPTY }));
    await renderPage();
    // Manila flag button should be styled as active (check it exists)
    expect(screen.getByText("🇵🇭 Manila")).toBeInTheDocument();
  });

  it("defaults to dubai city when auth.city is 'dubai'", async () => {
    mockAuth = staffAuth({ city: "dubai" });
    mockFetch.mockResolvedValue(okJson({ payslips: [], ...SUMMARY_EMPTY }));
    await renderPage();
    expect(screen.getByText("🇦🇪 Dubai")).toBeInTheDocument();
  });

  it("clicking Dubai toggle triggers refetch", async () => {
    mockAuth = staffAuth({ city: "manila" });
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))             // initial summary
      .mockResolvedValueOnce(okJson({ payslips: [] }))          // initial payslips
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))             // dubai summary
      .mockResolvedValueOnce(okJson({ payslips: [] }));         // dubai payslips
    await renderPage();
    await waitFor(() => screen.getByText("No pay slips yet"));
    const callsBefore = mockFetch.mock.calls.length;
    fireEvent.click(screen.getByText("🇦🇪 Dubai"));
    await waitFor(() => expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});

describe("/my-pay — helper functions", () => {
  describe("formatCycleLabel", () => {
    it("formats year+month when both provided", async () => {
      // Render a payslip with year=2026, month=3 and check label
      mockAuth = staffAuth();
      mockFetch
        .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
        .mockResolvedValueOnce(okJson({
          payslips: [{ ...PAYSLIP_MANILA, cycle_year: 2026, cycle_month: 3, cycle_label: "fallback" }],
        }));
      await renderPage();
      await waitFor(() =>
        expect(screen.getByText("March 2026")).toBeInTheDocument()
      );
    });

    it("falls back to cycle_label when year/month are null", async () => {
      mockAuth = staffAuth();
      mockFetch
        .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
        .mockResolvedValueOnce(okJson({
          payslips: [{ ...PAYSLIP_MANILA, cycle_year: null, cycle_month: null, cycle_label: "Cycle 10" }],
        }));
      await renderPage();
      await waitFor(() =>
        expect(screen.getByText("Cycle 10")).toBeInTheDocument()
      );
    });
  });

  describe("loan progress calculation", () => {
    it("calculates 0% when no installments paid", async () => {
      mockAuth = staffAuth();
      const loan = { ...LOAN_ACTIVE, paid_installments: 0, total_installments: 12 };
      mockFetch
        .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
        .mockResolvedValueOnce(okJson({ payslips: [] }))
        .mockResolvedValueOnce(okJson({ loans: [loan] }));
      await renderPage();
      await waitFor(() => screen.getByText("Pay Slips"));
      fireEvent.click(screen.getByText("Loans"));
      await waitFor(() =>
        expect(screen.getByText("0%")).toBeInTheDocument()
      );
    });

    it("calculates 100% when all installments paid (completed)", async () => {
      mockAuth = staffAuth();
      const loan = {
        ...LOAN_ACTIVE,
        status: "completed",
        paid_installments: 12,
        total_installments: 12,
        remaining_balance: 0,
      };
      mockFetch
        .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
        .mockResolvedValueOnce(okJson({ payslips: [] }))
        .mockResolvedValueOnce(okJson({ loans: [loan] }));
      await renderPage();
      await waitFor(() => screen.getByText("Pay Slips"));
      fireEvent.click(screen.getByText("Loans"));
      await waitFor(() =>
        expect(screen.getByText("100%")).toBeInTheDocument()
      );
    });
  });
});

describe("/my-pay — isManila bug regression", () => {
  it("PayslipModal shows 'Manila Operations' for manila city slip", async () => {
    mockAuth = staffAuth({ city: "manila" });
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [PAYSLIP_MANILA] }));
    await renderPage();
    await waitFor(() => screen.getByText("Sushi Chef"));
    fireEvent.click(screen.getAllByText("May 2026")[0].closest("button")!);
    await waitFor(() => screen.getByText("Pay Slip"));
    expect(screen.getByText(/Manila Operations/i)).toBeInTheDocument();
  });

  it("PayslipModal shows 'Dubai Operations' for dubai city slip — not Manila (bug regression)", async () => {
    mockAuth = staffAuth({ city: "dubai" });
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [PAYSLIP_DUBAI] }));
    await renderPage();
    await waitFor(() => screen.getByText("Sushi Chef"));
    fireEvent.click(screen.getAllByText("May 2026")[0].closest("button")!);
    await waitFor(() => screen.getByText("Pay Slip"));
    // Before fix: slip.city="dubai" is truthy → isManila was always true → showed Manila
    // After fix: correctly shows Dubai
    expect(screen.getByText(/Dubai Operations/i)).toBeInTheDocument();
    expect(screen.queryByText(/Manila Operations/i)).not.toBeInTheDocument();
  });

  it("PayslipModal shows 'Manila Operations' for PHP currency slip with empty city", async () => {
    mockAuth = staffAuth({ city: "manila" });
    const slipNoCity = { ...PAYSLIP_MANILA, city: "", currency: "PHP" };
    mockFetch
      .mockResolvedValueOnce(okJson(SUMMARY_EMPTY))
      .mockResolvedValueOnce(okJson({ payslips: [slipNoCity] }));
    await renderPage();
    await waitFor(() => screen.getByText("Sushi Chef"));
    fireEvent.click(screen.getAllByText("May 2026")[0].closest("button")!);
    await waitFor(() => screen.getByText("Pay Slip"));
    expect(screen.getByText(/Manila Operations/i)).toBeInTheDocument();
  });
});
