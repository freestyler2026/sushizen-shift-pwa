// tests/payroll/manila-gov-loans.test.tsx
//
// Peter, 2026-10-19: SSS and Pag-IBIG loans were typed by hand on every
// cut-off. They are now registered once (/admin/payroll/manila/loans).
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({
  getAuthHeaders: () => ({}),
  getUploadHeaders: () => ({}),
  tryRefreshAccessToken: async () => false,
  getAuth: () => ({ staffName: "Yukihiro Nishimura", role: "HQ", city: "manila" }),
}));
vi.mock("@/lib/date", () => ({ isoToday: () => "2026-10-19" }));

const LOAN = {
  id: 3, staff_name: "Renzy Siena", loan_type: "SSS", loan_no: "SL-1", monthly_amortization: 500,
  first_month: "2026-10", last_month: "2028-09", months_total: 24, total_amount: 12000,
  authority_to_deduct: false, balance_at_separation: null, status: "active", stop_reason: "", note: "",
  created_by: "x", sss_number: "34-1", pagibig_mid: null, last_working_date: null,
  paid_amount: 0, paid_months: 0, draft_amount: 250,
};
let calls: string[] = [];
beforeEach(() => {
  calls = [];
  global.fetch = vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    calls.push(`${init?.method || "GET"} ${u} ${init?.body || ""}`);
    const body = u.includes("/remittance")
      ? { month: "2026-09", periods: [], final: false, rows: [], totals: { total_sss_loans: 0, total_pagibig_loans: 0 }, due: { SSS: "2026-10-31", PAGIBIG: null } }
      : (init?.method || "GET") === "GET"
        ? { loans: [LOAN], staff: [{ staff_name: "Patrick Danel Santiago", sss_number: null, pagibig_mid: "1210" }] }
        : { id: 9 };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
  }) as unknown as typeof fetch;
});

import Page from "@/app/admin/payroll/manila/loans/page";

describe("SSS & Pag-IBIG loans", () => {
  it("lists a registered loan with its months and what drafts hold", async () => {
    render(<Page />);
    expect(await screen.findByText("Renzy Siena")).toBeTruthy();
    expect(screen.getByText(/Oct 2026 – Sep 2028/)).toBeTruthy();
    expect(screen.getByText(/₱250.00 in drafts/)).toBeTruthy();
  });

  it("keeps the cursor in an edit field while typing", async () => {
    render(<Page />);
    fireEvent.click(await screen.findByText("Edit"));
    const box = screen.getByPlaceholderText("from the statement") as HTMLInputElement;
    box.focus();
    fireEvent.change(box, { target: { value: "1" } });
    fireEvent.change(box, { target: { value: "12" } });
    // A component declared inside the page remounts on every render and this
    // would be a different element without focus.
    expect(document.activeElement).toBe(box);
    expect(box.value).toBe("12");
  });

  it("registers a Pag-IBIG loan with the authority box and the months chosen", async () => {
    render(<Page />);
    fireEvent.click(await screen.findByText("+ Register a loan"));
    fireEvent.click(screen.getByLabelText("Staff"));
    fireEvent.click(await screen.findByText("Patrick Danel Santiago"));
    fireEvent.click(screen.getByText("Pag-IBIG Loan"));
    fireEvent.change(screen.getByPlaceholderText("from the loan statement"), { target: { value: "448.36" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText("Register"));
    await waitFor(() => expect(calls.some(c => c.startsWith("POST") && c.includes("/gov-loans "))).toBe(true));
    const post = calls.find(c => c.startsWith("POST") && c.includes("/gov-loans "))!;
    const body = JSON.parse(post.slice(post.indexOf("{")));
    expect(body).toMatchObject({
      staff_name: "Patrick Danel Santiago", loan_type: "PAGIBIG", monthly_amortization: 448.36,
      first_month: "2026-10", authority_to_deduct: true,
    });
    expect(await screen.findByText(/Pag-IBIG Loan registered/)).toBeTruthy();
  });

  it("a refused load does not say there are no loans", async () => {
    global.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ detail: "Payroll admin access required" }),
      { status: 403, headers: { "Content-Type": "application/json" } }))) as unknown as typeof fetch;
    render(<Page />);
    expect(await screen.findByText(/Payroll admin access required/)).toBeTruthy();
    expect(screen.queryByText(/No loans registered/)).toBeNull();
  });

  it("a masked viewer sees dashes, not a crash", async () => {
    const masked = { ...LOAN, monthly_amortization: null, total_amount: null, paid_amount: null, draft_amount: null };
    global.fetch = vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(
      String(url).includes("/remittance")
        ? { month: "2026-09", periods: [], final: false, rows: [], totals: { total_sss_loans: null, total_pagibig_loans: null }, due: { SSS: null, PAGIBIG: null } }
        : { loans: [masked], staff: [] }), { status: 200, headers: { "Content-Type": "application/json" } }))) as unknown as typeof fetch;
    render(<Page />);
    expect(await screen.findByText("Renzy Siena")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("asks before registering a second loan of the same type", async () => {
    let n = 0;
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const u = String(url);
      calls.push(`${init?.method || "GET"} ${u} ${init?.body || ""}`);
      if (init?.method === "POST" && n++ === 0)
        return Promise.resolve(new Response(JSON.stringify({ detail: "Overlap — Renzy Siena already has a SSS loan" }), { status: 409 }));
      const body = u.includes("/remittance")
        ? { month: "2026-09", periods: [], final: false, rows: [], totals: { total_sss_loans: 0, total_pagibig_loans: 0 }, due: { SSS: null, PAGIBIG: null } }
        : { loans: [LOAN], staff: [{ staff_name: "Renzy Siena", sss_number: "1", pagibig_mid: null }], id: 9 };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
    }) as unknown as typeof fetch;
    const conf = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Page />);
    fireEvent.click(await screen.findByText("+ Register a loan"));
    fireEvent.click(screen.getByLabelText("Staff"));
    fireEvent.click(await screen.findAllByText("Renzy Siena").then(a => a[a.length - 1]));
    fireEvent.change(screen.getByPlaceholderText("from the loan statement"), { target: { value: "300" } });
    fireEvent.click(screen.getByText("Register"));
    await waitFor(() => expect(calls.filter(c => c.startsWith("POST")).length).toBe(2));
    expect(conf).toHaveBeenCalled();
    expect(calls.filter(c => c.startsWith("POST"))[1]).toContain('"allow_overlap":true');
    conf.mockRestore();
  });

  it("a stopped loan with months left is still under 'Being deducted'", async () => {
    const stopped = { ...LOAN, status: "stopped", stop_reason: "Paid off early", last_month: "2026-12", months_total: 3 };
    global.fetch = vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(
      String(url).includes("/remittance")
        ? { month: "2026-09", periods: [], final: false, rows: [], totals: { total_sss_loans: 0, total_pagibig_loans: 0 }, due: { SSS: null, PAGIBIG: null } }
        : { loans: [stopped], staff: [] }), { status: 200, headers: { "Content-Type": "application/json" } }))) as unknown as typeof fetch;
    render(<Page />);
    expect(await screen.findByText("Being deducted")).toBeTruthy();
    expect(screen.getByText("(1)")).toBeTruthy();
    expect(screen.queryByText(/Finished or stopped/)).toBeNull();
  });

  it("asks why before stopping", async () => {
    render(<Page />);
    fireEvent.click(await screen.findByText("Stop"));
    const btns = screen.getAllByText("Stop");
    expect((btns[btns.length - 1] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("Paid off early"));
    fireEvent.click(btns[btns.length - 1]);
    await waitFor(() => expect(calls.some(c => c.includes("/gov-loans/3/stop"))).toBe(true));
    const stop = calls.find(c => c.includes("/gov-loans/3/stop"))!;
    expect(JSON.parse(stop.slice(stop.indexOf("{")))).toEqual({ reason: "Paid off early", last_month: "2026-10" });
  });
});
