import { vi } from "vitest";

/** Cycle fixture */
export const CYCLE_MANILA = {
  id: 1, city: "manila", year: 2026, month: 5, status: "open", closed_at: null,
};
export const CYCLE_DUBAI = {
  id: 2, city: "dubai", year: 2026, month: 5, status: "open", closed_at: null,
};

/** Build a mock fetch that returns preset responses per URL pattern */
export function buildFetchMock(
  routes: Array<{ match: string | RegExp; body: unknown; status?: number; method?: string }>
) {
  return vi.fn(async (url: string, opts?: RequestInit) => {
    const method = (opts?.method ?? "GET").toUpperCase();
    for (const route of routes) {
      const matchStr =
        typeof route.match === "string" ? url.includes(route.match) : route.match.test(url);
      const matchMethod = !route.method || route.method.toUpperCase() === method;
      if (matchStr && matchMethod) {
        return new Response(JSON.stringify(route.body), {
          status: route.status ?? 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    // Default 200 empty
    return new Response(JSON.stringify({}), { status: 200 });
  });
}

/** Build a failing fetch */
export function buildFailFetch(status = 500, detail = "Internal server error") {
  return vi.fn(async () =>
    new Response(JSON.stringify({ detail }), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}
