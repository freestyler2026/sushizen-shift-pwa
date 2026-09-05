import "@testing-library/jest-dom";
import { configure } from "@testing-library/dom";
import { vi, beforeEach, afterEach } from "vitest";

// waitFor's own budget, which vitest's testTimeout does not govern: the library
// defaults to one second. These assertions settle in 19-49ms on a laptop, so a
// second reads like room to spare -- until seventy test files share two cores on
// a CI runner and the same work takes thirty times longer. That is what the
// three "Tab navigation" failures were: a correct assertion, timed out. Nothing
// about a real failure changes, it just gets five seconds to not happen in,
// still well inside the 20s testTimeout.
configure({ asyncUtilTimeout: 5000 });

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
  // sessionStorage leaks between tests exactly as localStorage would. /my-pay
  // keeps its step-up token there so verification survives tab navigation, so
  // one test passing the identity gate left every later test in the file
  // already verified -- and the gate's own tests then found no gate.
  window.sessionStorage?.clear();
  setAdminAuth("manila");
  vi.restoreAllMocks();
  routerMock.push.mockReset();
  routerMock.replace.mockReset();
  routerMock.back.mockReset();
});

afterEach(() => {
  localStorageMock.clear();
  window.sessionStorage?.clear();
});
