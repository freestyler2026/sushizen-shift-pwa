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
// Stable shared router mock — same object across all useRouter() calls.
// Reset in beforeEach so each test starts clean.
export const routerMock = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/payroll",
  useParams: () => ({}),
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
  routerMock.push.mockReset();
  routerMock.replace.mockReset();
  routerMock.back.mockReset();
});

afterEach(() => {
  localStorageMock.clear();
});
