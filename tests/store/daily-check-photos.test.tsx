// tests/store/daily-check-photos.test.tsx
//
// Manila asked for photos on the two lunch checks. The lunch menu is switched
// on and off by hand, so the only moment those items are visible on the device
// is while somebody is standing in front of it doing this check.
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("@/lib/auth", () => ({ getAuthHeaders: () => ({}), getAuth: () => ({ staffName: "Tester", role: "STAFF" }) }));
vi.mock("@/lib/image-compress", () => ({ prepareUpload: async (f: File) => f }));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import DailyCheckPage from "@/app/store/daily-check/page";

function serve(over: Record<string, unknown> = {}) {
  mockFetch.mockImplementation((url: string) => {
    const u = String(url);
    const body =
      u.includes("/aggregators") ? { aggregators: [{ key: "grabfood", label: "GrabFood" }, { key: "foodpanda", label: "Foodpanda" }, { key: "beep", label: "Beep" }] }
      : u.includes("/today") ? { checks: [] }
      : u.includes("/submit") ? { check: { id: "chk-1" } }
      : u.includes("/photo") ? { ok: true, photo_url: "https://drive/x" }
      : u.includes("branches") ? { branches: [{ code: "PAR", label: "Paranaque" }] }
      : {};
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ...body, ...over }) });
  });
}

async function submitAs(label: string) {
  render(<DailyCheckPage />);
  fireEvent.click(await screen.findByText(label));
  const name = screen.getByPlaceholderText(/name/i) as HTMLInputElement;
  fireEvent.change(name, { target: { value: "Erica" } });
  fireEvent.click(screen.getByText(new RegExp(`Submit ${label}`, "i")));
}

beforeEach(() => { vi.clearAllMocks(); serve(); });

describe("which checks offer a photo", () => {
  it("Lunch Open does, which is what was asked for", async () => {
    await submitAs("Lunch Open");
    expect(await screen.findByText(/Upload Device Photos/i)).toBeTruthy();
  });

  it("Lunch Close does too", async () => {
    await submitAs("Lunch Close");
    expect(await screen.findByText(/Upload Device Photos/i)).toBeTruthy();
  });

  it("Opening still does", async () => {
    await submitAs("Opening Check");
    expect(await screen.findByText(/Upload Device Photos/i)).toBeTruthy();
  });

  it("Business Close does not — it was not asked for", async () => {
    await submitAs("Business Close");
    await waitFor(() => expect(screen.getByText(/Check submitted successfully/i)).toBeTruthy());
    expect(screen.queryByText(/Upload Device Photos/i)).toBeNull();
  });
});

describe("the photo is asked for as evidence of the right thing", () => {
  it("Lunch Open asks for the lunch items to be visible", async () => {
    await submitAs("Lunch Open");
    expect(await screen.findByText(/lunch service is live, with the lunch items visible/i)).toBeTruthy();
  });

  it("Lunch Close asks for the opposite, not the same sentence", async () => {
    await submitAs("Lunch Close");
    expect(await screen.findByText(/lunch service is paused/i)).toBeTruthy();
    expect(screen.queryByText(/showing it is open/i)).toBeNull();
  });

  it("a check that takes photos says so on submit", async () => {
    await submitAs("Lunch Open");
    expect(await screen.findByText(/Check submitted\. Add photos below\./i)).toBeTruthy();
  });
});

describe("dine-in", () => {
  it("is not offered on a lunch check — it belongs to the opening one", async () => {
    await submitAs("Lunch Open");
    await screen.findByText(/Upload Device Photos/i);
    expect(screen.queryByText("Dine-in")).toBeNull();
  });
});

describe("every aggregator gets a slot", () => {
  it("all three Manila platforms are offered on a lunch check", async () => {
    await submitAs("Lunch Open");
    await screen.findByText(/Upload Device Photos/i);
    for (const name of ["GrabFood", "Foodpanda", "Beep"]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
  });
});

describe("submitting again corrects the record", () => {
  function withExisting(revision = 1) {
    mockFetch.mockImplementation((url: string) => {
      const u = String(url);
      const body =
        u.includes("/aggregators") ? { aggregators: [{ key: "grabfood", label: "GrabFood" }] }
        : u.includes("/today") ? { checks: [{ id: "chk-0", check_type: "LUNCH_OPEN", submitted_by: "Erica",
            submitted_at: "2026-09-11T02:59:00+00:00", status: "SUBMITTED", photo_urls: [] }] }
        : u.includes("/submit") ? { check: { id: "chk-0", revision: revision + 1 } }
        : u.includes("branches") ? { branches: [{ code: "PAR", label: "Paranaque" }] }
        : {};
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    });
  }

  it("says so on the notice instead of only saying 'already submitted'", async () => {
    withExisting();
    render(<DailyCheckPage />);
    fireEvent.click(await screen.findByText("Lunch Open"));
    expect(await screen.findByText(/corrects this record — it does not add a second one/i)).toBeTruthy();
  });

  it("the button names the action it performs", async () => {
    withExisting();
    render(<DailyCheckPage />);
    fireEvent.click(await screen.findByText("Lunch Open"));
    expect(await screen.findByText(/Update Lunch Open/i)).toBeTruthy();
    expect(screen.queryByText(/Submit Lunch Open/i)).toBeNull();
  });

  it("the confirmation says updated, not submitted, on a correction", async () => {
    withExisting();
    render(<DailyCheckPage />);
    fireEvent.click(await screen.findByText("Lunch Open"));
    const name = await screen.findByPlaceholderText(/name/i);
    fireEvent.change(name, { target: { value: "Erica" } });
    fireEvent.click(screen.getByText(/Update Lunch Open/i));
    expect(await screen.findByText(/Check updated\. Add photos below\./i)).toBeTruthy();
  });

  it("a first submission still says submitted", async () => {
    serve();
    await submitAs("Lunch Open");
    expect(await screen.findByText(/Check submitted\. Add photos below\./i)).toBeTruthy();
  });
});

describe("adding a photo later is not a correction", () => {
  it("offers a way back to the existing record without re-submitting", async () => {
    mockFetch.mockImplementation((url: string) => {
      const u = String(url);
      const body =
        u.includes("/aggregators") ? { aggregators: [{ key: "grabfood", label: "GrabFood" }] }
        : u.includes("/today") ? { checks: [{ id: "chk-0", check_type: "LUNCH_OPEN", submitted_by: "Erica",
            submitted_at: "2026-09-11T02:59:00+00:00", status: "CONFIRMED_OK", photo_urls: [] }] }
        : u.includes("branches") ? { branches: [{ code: "PAR", label: "Paranaque" }] }
        : {};
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    });
    render(<DailyCheckPage />);
    fireEvent.click(await screen.findByText("Lunch Open"));
    const btn = await screen.findByText("Add photos to this record");
    fireEvent.click(btn);
    // The upload box opens on the record that already exists — no second
    // submission, so the back office's confirmation is not thrown away.
    expect(await screen.findByText(/Upload Device Photos/i)).toBeTruthy();
    const submits = mockFetch.mock.calls.filter((c) => String(c[0]).includes("/submit"));
    expect(submits.length).toBe(0);
  });

  it("is not offered for a check type that takes no photos", async () => {
    mockFetch.mockImplementation((url: string) => {
      const u = String(url);
      const body =
        u.includes("/aggregators") ? { aggregators: [{ key: "grabfood", label: "GrabFood" }] }
        : u.includes("/today") ? { checks: [{ id: "chk-9", check_type: "BUSINESS_CLOSE", submitted_by: "Erica",
            submitted_at: "2026-09-11T02:59:00+00:00", status: "SUBMITTED", photo_urls: [] }] }
        : u.includes("branches") ? { branches: [{ code: "PAR", label: "Paranaque" }] }
        : {};
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    });
    render(<DailyCheckPage />);
    fireEvent.click(await screen.findByText("Business Close"));
    await screen.findByText(/Already submitted today/i);
    expect(screen.queryByText("Add photos to this record")).toBeNull();
  });
});
