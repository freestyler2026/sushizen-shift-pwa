import "@testing-library/jest-dom";
import { vi, beforeEach, afterEach } from "vitest";

// ── localStorage mock (auth) ──────────────────────────────────────────────────
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
};
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// ── next/navigation mock ──────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/payroll",
}));

// ── Default ADMIN auth ────────────────────────────────────────────────────────
export function setAdminAuth(city: "dubai" | "manila" = "manila") {
  localStorageMock.setItem(
    "sushizen_shift_auth",
    JSON.stringify({
      staffName: "Test Admin",
      city,
      role: "ADMIN",
      accessToken: "test-token",
      permissions: ["*"],
    })
  );
}

beforeEach(() => {
  localStorageMock.clear();
  setAdminAuth("manila");
  vi.restoreAllMocks();
});

afterEach(() => {
  localStorageMock.clear();
});
