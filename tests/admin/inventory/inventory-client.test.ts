// tests/admin/inventory/inventory-client.test.ts
// Tests for src/lib/inventoryClient.ts
// Covers: parseJson error extraction, normalizeApiErrorMessage, 401 retry logic.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { inventoryGet, inventoryPost, inventoryPatch } from "@/lib/inventoryClient";
import { buildFetchMock, buildFailFetch } from "../../helpers/fetch-mock";

// ── Auth mock ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => ({
      accessToken: "test-token",
      role: "ADMIN",
      city: "manila",
      staffName: "Test",
      permissions: ["*"],
    })),
    getAuthHeaders: vi.fn(() => ({ Authorization: "Bearer test-token" })),
    refreshAuthFromApi: vi.fn(async (auth: any) => auth),
  };
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("inventoryGet()", () => {
  it("returns parsed JSON on success", async () => {
    global.fetch = buildFetchMock([
      { match: "/api/admin/inventory/items", body: { rows: [{ id: "1", name: "Tuna" }] } },
    ]);
    const result = await inventoryGet<{ rows: { id: string; name: string }[] }>(
      "/api/admin/inventory/items"
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Tuna");
  });

  it("throws with FastAPI detail message on 4xx error", async () => {
    global.fetch = buildFailFetch(422, "Validation failed: item_id required");
    await expect(inventoryGet("/api/admin/inventory/items")).rejects.toThrow(
      "Validation failed: item_id required"
    );
  });

  it("throws with FastAPI detail message on 404", async () => {
    global.fetch = buildFailFetch(404, "Count sheet not found");
    await expect(inventoryGet("/api/admin/inventory/counts/999")).rejects.toThrow(
      "Count sheet not found"
    );
  });

  it("throws with FastAPI detail message on 500", async () => {
    global.fetch = buildFailFetch(500, "Database connection error");
    await expect(inventoryGet("/api/admin/inventory/items")).rejects.toThrow(
      "Database connection error"
    );
  });

  it("shows timeout message when server returns HTML error page", async () => {
    global.fetch = vi.fn(async () =>
      new Response("<!DOCTYPE html><html><body>Application Error</body></html>", {
        status: 503,
        headers: { "Content-Type": "text/html" },
      })
    );
    await expect(inventoryGet("/api/admin/inventory/items")).rejects.toThrow(
      "Server timed out while loading inventory data. Please retry."
    );
  });

  it("shows timeout message when body contains H12", async () => {
    global.fetch = vi.fn(async () =>
      new Response("Error R14 (Memory quota exceeded) H12 timeout", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      })
    );
    await expect(inventoryGet("/api/admin/inventory/items")).rejects.toThrow(
      "Server timed out while loading inventory data. Please retry."
    );
  });

  it("returns empty object for 200 with empty body", async () => {
    global.fetch = vi.fn(async () =>
      new Response("", { status: 200, headers: { "Content-Type": "application/json" } })
    );
    const result = await inventoryGet("/api/admin/inventory/items");
    expect(result).toEqual({});
  });
});

describe("inventoryPost()", () => {
  it("sends POST request with JSON body", async () => {
    const mockFetch = buildFetchMock([
      { match: "/api/admin/inventory/counts", body: { id: "new-count-123" }, method: "POST" },
    ]);
    global.fetch = mockFetch;
    const result = await inventoryPost<{ id: string }>("/api/admin/inventory/counts", {
      city: "manila",
      branch_code: "MNL-01",
    });
    expect(result.id).toBe("new-count-123");

    const callArgs = mockFetch.mock.calls[0];
    const opts = callArgs[1] as RequestInit;
    expect(opts.method).toBe("POST");
    expect(opts.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(opts.body as string)).toMatchObject({ city: "manila", branch_code: "MNL-01" });
  });

  it("throws FastAPI detail on POST failure", async () => {
    global.fetch = buildFailFetch(400, "Branch code is required");
    await expect(
      inventoryPost("/api/admin/inventory/counts", { city: "manila" })
    ).rejects.toThrow("Branch code is required");
  });
});

describe("inventoryPatch()", () => {
  it("sends PATCH request with JSON body", async () => {
    const mockFetch = buildFetchMock([
      {
        match: "/api/admin/inventory/counts/",
        body: { ok: true },
        method: "PATCH",
      },
    ]);
    global.fetch = mockFetch;
    const result = await inventoryPatch<{ ok: boolean }>("/api/admin/inventory/counts/123", {
      status: "SUBMITTED",
    });
    expect(result.ok).toBe(true);

    const callArgs = mockFetch.mock.calls[0];
    const opts = callArgs[1] as RequestInit;
    expect(opts.method).toBe("PATCH");
    expect(JSON.parse(opts.body as string)).toMatchObject({ status: "SUBMITTED" });
  });

  it("throws FastAPI detail on PATCH failure", async () => {
    global.fetch = buildFailFetch(403, "Count is already closed");
    await expect(
      inventoryPatch("/api/admin/inventory/counts/123", { status: "SUBMITTED" })
    ).rejects.toThrow("Count is already closed");
  });
});

// ── 401 retry logic ───────────────────────────────────────────────────────────
describe("401 retry logic", () => {
  it("retries once on 401 response", async () => {
    let callCount = 0;
    global.fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ detail: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Second call succeeds
      return new Response(JSON.stringify({ rows: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await inventoryGet<{ rows: unknown[] }>("/api/admin/inventory/items");
    expect(result.rows).toEqual([]);
    expect(callCount).toBe(2); // 1 original + 1 retry
  });

  it("throws if both attempts return 401", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ detail: "Session expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(inventoryGet("/api/admin/inventory/items")).rejects.toThrow("Session expired");
  });
});
