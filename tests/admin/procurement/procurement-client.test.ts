// tests/admin/procurement/procurement-client.test.ts
// Tests for src/lib/procurementClient.ts
// Covers: procurementJson success, FastAPI detail extraction, 401 retry,
//         saveProcurementSession, defaultProcurementName/Pin helpers.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFetchMock, buildFailFetch } from "../../helpers/fetch-mock";

// ── Auth mock ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => ({
      accessToken: "test-token",
      role: "HQ",
      city: "manila",
      staffName: "Test User",
      permissions: ["*"],
      pin: "1234",
    })),
    refreshAuthFromApi: vi.fn(async (auth: any) => auth),
    setAuth: vi.fn(),
  };
});

// ── Tests: procurementJson ────────────────────────────────────────────────────
describe("procurementJson()", () => {
  let procurementJson: typeof import("@/lib/procurementClient").procurementJson;

  beforeEach(async () => {
    // Fresh import each test to reset module state
    vi.resetModules();
    vi.mock("@/lib/auth", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/auth")>();
      return {
        ...actual,
        getAuth: vi.fn(() => ({
          accessToken: "test-token",
          role: "HQ",
          city: "manila",
          staffName: "Test User",
          permissions: ["*"],
          pin: "1234",
        })),
        refreshAuthFromApi: vi.fn(async (auth: any) => auth),
        setAuth: vi.fn(),
      };
    });
    const mod = await import("@/lib/procurementClient");
    procurementJson = mod.procurementJson;
  });

  it("returns parsed JSON on 200 success", async () => {
    global.fetch = buildFetchMock([
      {
        match: "/api/admin/procurement/requests",
        body: { rows: [{ id: "r1", request_no: "PR-001" }] },
      },
    ]);

    const result = await procurementJson<{ rows: { id: string }[] }>(
      "/api/admin/procurement/requests",
      { method: "GET" },
      "Jay",
      "1234",
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe("r1");
  });

  it("throws FastAPI detail message on error (not raw JSON)", async () => {
    global.fetch = buildFailFetch(422, "Request date cannot be in the past");

    await expect(
      procurementJson("/api/admin/procurement/requests", { method: "POST" }, "Jay", "1234"),
    ).rejects.toThrow("Request date cannot be in the past");
  });

  it("does NOT throw raw JSON string — extracts detail field", async () => {
    // Auth session must succeed so the error comes from the procurement URL, not auth.
    global.fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/auth/session")) {
        return new Response(JSON.stringify({ valid: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ detail: "Vendor code already exists" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    });

    let errorMsg = "";
    try {
      await procurementJson("/api/admin/procurement/vendors", { method: "POST" }, "Jay", "1234");
    } catch (e: any) {
      errorMsg = e?.message || "";
    }
    // Should NOT be raw JSON like {"detail":"..."}
    expect(errorMsg).not.toMatch(/^\{/);
    expect(errorMsg).toBe("Vendor code already exists");
  });

  it("falls back to raw text if response is not JSON", async () => {
    // Auth session succeeds; the procurement URL returns non-JSON text.
    global.fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/auth/session")) {
        return new Response(JSON.stringify({ valid: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Service Unavailable", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      });
    });

    await expect(
      procurementJson("/api/admin/procurement/requests", { method: "GET" }, "Jay", "1234"),
    ).rejects.toThrow("Service Unavailable");
  });

  it("falls back to status message if body is empty", async () => {
    // Auth session succeeds; the procurement URL returns empty body 500.
    global.fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/auth/session")) {
        return new Response(JSON.stringify({ valid: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("", { status: 500, headers: { "Content-Type": "application/json" } });
    });

    await expect(
      procurementJson("/api/admin/procurement/requests", { method: "GET" }, "Jay", "1234"),
    ).rejects.toThrow("Request failed (500)");
  });

  it("returns empty object for 200 with empty body", async () => {
    global.fetch = vi.fn(async () =>
      new Response("", { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    const result = await procurementJson(
      "/api/admin/procurement/requests",
      { method: "GET" },
      "Jay",
      "1234",
    );
    expect(result).toEqual({});
  });

  it("throws error when no access token and remint fails", async () => {
    vi.resetModules();
    vi.mock("@/lib/auth", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/auth")>();
      return {
        ...actual,
        getAuth: vi.fn(() => null), // no auth at all
        refreshAuthFromApi: vi.fn(async () => null),
        setAuth: vi.fn(),
      };
    });
    const mod = await import("@/lib/procurementClient");
    procurementJson = mod.procurementJson;

    // session check returns 401 when no token
    global.fetch = vi.fn(async () =>
      new Response("", { status: 401, headers: {} }),
    );

    await expect(
      procurementJson("/api/admin/procurement/requests", { method: "GET" }, "", ""),
    ).rejects.toThrow("Please login again.");
  });
});

// ── Tests: session helpers ────────────────────────────────────────────────────
describe("saveProcurementSession / defaultProcurementName / defaultProcurementPin", () => {
  let saveProcurementSession: typeof import("@/lib/procurementClient").saveProcurementSession;
  let clearProcurementSession: typeof import("@/lib/procurementClient").clearProcurementSession;
  let defaultProcurementName: typeof import("@/lib/procurementClient").defaultProcurementName;
  let defaultProcurementPin: typeof import("@/lib/procurementClient").defaultProcurementPin;

  beforeEach(async () => {
    vi.resetModules();
    vi.mock("@/lib/auth", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/auth")>();
      return {
        ...actual,
        getAuth: vi.fn(() => ({
          accessToken: "tok",
          role: "HQ",
          city: "manila",
          staffName: "Auth User",
          permissions: ["*"],
          pin: "9999",
        })),
        refreshAuthFromApi: vi.fn(async (auth: any) => auth),
        setAuth: vi.fn(),
      };
    });
    const mod = await import("@/lib/procurementClient");
    saveProcurementSession = mod.saveProcurementSession;
    clearProcurementSession = mod.clearProcurementSession;
    defaultProcurementName = mod.defaultProcurementName;
    defaultProcurementPin = mod.defaultProcurementPin;
    // Clear session before each test
    clearProcurementSession();
  });

  it("defaultProcurementName falls back to auth staffName when no session", () => {
    expect(defaultProcurementName()).toBe("Auth User");
  });

  it("defaultProcurementPin falls back to auth pin when no session", () => {
    expect(defaultProcurementPin()).toBe("9999");
  });

  it("saveProcurementSession persists name and pin to sessionStorage", () => {
    saveProcurementSession("Jay Nishimura", "5678");
    expect(defaultProcurementName()).toBe("Jay Nishimura");
    expect(defaultProcurementPin()).toBe("5678");
  });

  it("clearProcurementSession removes saved session", () => {
    saveProcurementSession("Jay Nishimura", "5678");
    clearProcurementSession();
    // After clear, falls back to auth
    expect(defaultProcurementName()).toBe("Auth User");
    expect(defaultProcurementPin()).toBe("9999");
  });

  it("saveProcurementSession does not save empty name", () => {
    saveProcurementSession("Jay", "1234"); // first save
    saveProcurementSession("", "9876");    // empty name → not overwritten
    expect(defaultProcurementName()).toBe("Jay");
  });
});
