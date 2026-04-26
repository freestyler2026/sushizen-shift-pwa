import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
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
  return {
    Accept: req.headers.get("accept") || "application/json",
    ...(req.headers.get("authorization") ? { Authorization: req.headers.get("authorization") as string } : {}),
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
    const [queueResult, exceptionsResult] = await Promise.all([
      fetchJson(req, `/api/admin/procurement/approvals/queue?city=${encodeURIComponent(city)}&limit=200`),
      fetchJson(req, `/api/admin/procurement/exceptions?city=${encodeURIComponent(city)}&limit=300`),
    ]);

    if (!queueResult.res.ok) {
      return NextResponse.json(queueResult.json || { ok: false, detail: "Failed to load approval queue." }, { status: queueResult.res.status });
    }

    if (!exceptionsResult.res.ok) {
      return NextResponse.json(exceptionsResult.json || { ok: false, detail: "Failed to load exceptions." }, { status: exceptionsResult.res.status });
    }

    const CLOSED_STATUSES = ["REJECTED", "APPROVED", "RETURNED"];
    const allApprovalRows = Array.isArray(queueResult.json?.rows) ? queueResult.json.rows : [];
    const approvalRows = allApprovalRows.filter(
      (r: any) => !CLOSED_STATUSES.includes(String(r?.status || "").toUpperCase()),
    );
    const exceptionRows = Array.isArray(exceptionsResult.json?.rows) ? exceptionsResult.json.rows : [];
    const issueCriticalCount = exceptionRows.filter((row) => {
      const severity = String(row?.severity || "").toUpperCase();
      return severity === "RED" || severity === "BLACK";
    }).length;

    const incomingRequestsCount = approvalRows.length;
    const issueCount = exceptionRows.length;
    const priceCheckPendingCount = 0;
    const priceCheckOverdueCount = 0;

    return NextResponse.json(
      {
        ok: true,
        city,
        incoming_requests_count: incomingRequestsCount,
        issue_count: issueCount,
        issue_critical_count: issueCriticalCount,
        price_check_pending_count: priceCheckPendingCount,
        price_check_overdue_count: priceCheckOverdueCount,
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
