import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/proxy-auth";

export const dynamic = "force-dynamic";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") { const _devBase = process.env.NEXT_PUBLIC_API_BASE_URL; if (_devBase) return _devBase.replace(/\/+$/, ""); return "http://127.0.0.1:8000"; }
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "").replace(/\/+$/, "");
  if (configured) {
    if (configured.startsWith("http://")) {
      return configured.replace("http://", "https://");
    }
    return configured;
  }
  return "https://sushizen-shift-app-038d846023bc.herokuapp.com";
}

function buildForwardHeaders(req: NextRequest): HeadersInit {
  // Phase 3 keeps the token in the httpOnly sz_access cookie and sends an empty
  // Authorization header, so forwarding only the header left this proxy
  // unauthenticated and the procurement badge permanently blank. Prefer the
  // cookie, exactly like the catch-all admin proxy does.
  const cookieToken = sessionToken(req) || "";
  const clientAuth = req.headers.get("authorization") || "";
  const auth = cookieToken ? `Bearer ${cookieToken}` : clientAuth;
  const sessionId = req.cookies.get("sz_session")?.value || req.headers.get("x-session-id") || "";
  return {
    Accept: req.headers.get("accept") || "application/json",
    ...(auth ? { Authorization: auth } : {}),
    ...(sessionId ? { "X-Session-Id": sessionId } : {}),
    ...(req.headers.get("x-step-up-token") ? { "X-Step-Up-Token": req.headers.get("x-step-up-token") as string } : {}),
    ...(req.headers.get("x-webauthn-origin") ? { "X-WebAuthn-Origin": req.headers.get("x-webauthn-origin") as string } : {}),
    ...(req.headers.get("origin") ? { Origin: req.headers.get("origin") as string } : {}),
  };
}

async function fetchJson(req: NextRequest, path: string) {
  const res = await fetch(`${getApiBase()}${path}`, {
    method: "GET",
    headers: buildForwardHeaders(req),
    cache: "no-store",
  });

  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }

  return { res, json };
}

export async function GET(req: NextRequest) {
  const city = String(req.nextUrl.searchParams.get("city") || "dubai").toLowerCase() === "manila" ? "manila" : "dubai";

  try {
    // count_only, not 200 and 300 rows carried across to be counted here.
    //
    // Two things were wrong with counting rows. The cost: half a second of
    // backend work per refresh, from two components on every open tab, every
    // minute — which is what saturated the dyno during a deploy and timed
    // everything out. And the answer: the approval queue ignored the city, so
    // the count was the newest 200 cases of both cities (8, while Manila had
    // 181 waiting), and the exception call asked for every status, so it
    // counted 1,019 CLOSED ones and sat permanently red on 12 open.
    //
    // status=OPEN is the same filter the exceptions page uses, so the badge and
    // the page it links to now answer the same question.
    const [queueResult, exceptionsResult, driftResult] = await Promise.all([
      fetchJson(req, `/api/admin/procurement/approvals/queue?city=${encodeURIComponent(city)}&count_only=1`),
      fetchJson(req, `/api/admin/procurement/exceptions?city=${encodeURIComponent(city)}&status=OPEN&count_only=1`),
      // Catalogue prices that no longer match the invoices. `limit=1` because we
      // only need `total` — the badge must not carry the whole list across.
      fetchJson(req, `/api/admin/procurement/price-checks/catalog-drift?market=${encodeURIComponent(city)}&limit=1`)
        .catch(() => ({ res: { ok: false, status: 0 } as any, json: {} as any })),
    ]);

    if (!queueResult.res.ok) {
      return NextResponse.json(queueResult.json || { ok: false, detail: "Failed to load approval queue." }, { status: queueResult.res.status });
    }

    if (!exceptionsResult.res.ok) {
      return NextResponse.json(exceptionsResult.json || { ok: false, detail: "Failed to load exceptions." }, { status: exceptionsResult.res.status });
    }

    // A backend that has not caught up yet returns rows and no total. Falling
    // back to counting them keeps the badge working through the gap between the
    // two deploys rather than showing zero.
    const CLOSED_STATUSES = ["REJECTED", "APPROVED", "RETURNED"];
    const incomingRequestsCount =
      typeof queueResult.json?.total === "number"
        ? queueResult.json.total
        : (Array.isArray(queueResult.json?.rows) ? queueResult.json.rows : []).filter(
            (r: any) => !CLOSED_STATUSES.includes(String(r?.status || "").toUpperCase()),
          ).length;

    const exceptionRows = Array.isArray(exceptionsResult.json?.rows) ? exceptionsResult.json.rows : [];
    const issueCount =
      typeof exceptionsResult.json?.total === "number"
        ? exceptionsResult.json.total
        : exceptionRows.length;
    const issueCriticalCount =
      typeof exceptionsResult.json?.critical_total === "number"
        ? exceptionsResult.json.critical_total
        : exceptionRows.filter((row: any) => {
            const severity = String(row?.severity || "").toUpperCase();
            return severity === "RED" || severity === "BLACK";
          }).length;
    // A drift failure must not blank the rest of the badge — the approval and
    // exception counts are what people act on hourly.
    const priceCheckPendingCount = driftResult.res?.ok ? Number(driftResult.json?.total || 0) : 0;
    // Unit mismatches are a different job, not an escalation — leaving them in
    // `overdue` would keep the badge permanently red and stop meaning anything.
    const priceCheckOverdueCount = 0;
    const catalogUnitMismatchCount = driftResult.res?.ok ? Number(driftResult.json?.unit_total || 0) : 0;

    return NextResponse.json(
      {
        ok: true,
        city,
        incoming_requests_count: incomingRequestsCount,
        issue_count: issueCount,
        issue_critical_count: issueCriticalCount,
        price_check_pending_count: priceCheckPendingCount,
        price_check_overdue_count: priceCheckOverdueCount,
        catalog_unit_mismatch_count: catalogUnitMismatchCount,
        total_badge_count: incomingRequestsCount + issueCount + priceCheckPendingCount,
      },
      {
        status: 200,
        headers: { "cache-control": "no-store" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
