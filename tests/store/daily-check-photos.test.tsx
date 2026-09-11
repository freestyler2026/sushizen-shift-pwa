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
