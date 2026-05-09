// src/app/swap-approve/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/Field";
import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";

// ── Light theme ────────────────────────────────────────────────────────────────
const PAGE_BG  = "min-h-screen bg-gray-50";
const CARD     = "rounded-2xl border border-gray-200 bg-white shadow-sm";
const SECTION  = "text-base font-semibold text-gray-900";
const CAPTION  = "text-xs text-gray-500";
const INPUT    = "w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";
const BTN_APPROVE = "rounded-xl bg-teal-600 px-6 py-2.5 font-semibold text-white transition hover:bg-teal-500 disabled:opacity-50";
const BTN_REJECT  = "rounded-xl border border-red-300 bg-white px-6 py-2.5 font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50";

// ✅ api.ts と同じ方針：ENVが空なら同一オリジン（相対URL）
const RAW_API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
const API_BASE = RAW_API_BASE ? RAW_API_BASE.replace(/\/+$/, "") : "";

function qs(params: Record<string, unknown>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    const s = String(v).trim();
    if (!s) return;
    sp.set(k, s);
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function postJson<T = unknown>(path: string, headers?: HeadersInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { method: "POST", headers });
  const text = await res.text();

  if (!res.ok) {
    try {
      const j = JSON.parse(text);
      throw new Error(j?.detail || j?.message || text || `HTTP ${res.status}`);
    } catch {
      throw new Error(text || `HTTP ${res.status}`);
    }
  }

  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    return ({ ok: true, raw: text } as unknown) as T;
  }
}

export default function SwapApprovePage() {
  const router = useRouter();
  const [reqId, setReqId]       = useState("");
  const [staffName, setStaffName] = useState("");
  const [pin, setPin]           = useState("");
  const [note, setNote]         = useState("ok");

  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<unknown>(null);
  const [error, setError]       = useState("");
  const [done, setDone]         = useState<"approved" | "rejected" | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const auth = getAuth();
      const refreshed = await refreshAuthFromApi(auth);
      if (cancelled) return;
      if (!refreshed?.staffName || !refreshed?.accessToken) {
        router.replace("/login?next=%2Fswap-approve");
        return;
      }
      setStaffName(refreshed.staffName);
    }
    void init();
    return () => { cancelled = true; };
  }, [router]);

  const canSubmit = useMemo(
    () => !!(reqId.trim() && staffName.trim() && pin.trim() && note.trim()),
    [reqId, staffName, pin, note]
  );

  const call = async (action: "APPROVED" | "REJECTED") => {
    if (!window.confirm(`Are you sure you want to ${action.toLowerCase()} this swap request?`)) return;
    setLoading(true);
    setError("");
    setResult(null);
    setDone(null);

    try {
      const q = qs({ req_id: reqId, staff_name: staffName, action, note, pin });
      const r = await postJson(`/api/shift_change/counterparty/respond${q}`, getAuthHeaders(getAuth()));
      setResult(r);
      setDone(action === "APPROVED" ? "approved" : "rejected");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={PAGE_BG}>
      <div className="mx-auto max-w-lg space-y-5 px-4 py-10">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Swap Approve</h1>
            <p className="mt-1 text-sm text-gray-500">
              Approve or reject a swap request as the designated counterparty.
            </p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 border border-teal-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            Counterparty approval
          </span>
        </div>

        {/* Form card */}
        <div className={`${CARD} p-5`}>
          <div className="mb-4">
            <div className={SECTION}>Approval Form</div>
            <div className={`${CAPTION} mt-0.5`}>
              Your name must match the counterparty assigned to the swap request.
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Request ID">
              <input
                className={INPUT}
                value={reqId}
                onChange={e => setReqId(e.target.value)}
                placeholder="e.g. 119ab8b2-..."
                autoComplete="off"
              />
            </Field>

            <Field label="Your name (must match counterparty)">
              <input
                className={INPUT}
                value={staffName}
                onChange={e => setStaffName(e.target.value)}
                placeholder="e.g. Muskan Tamang"
                autoComplete="name"
              />
            </Field>

            <Field label="PIN">
              <input
                className={INPUT}
                value={pin}
                onChange={e => setPin(e.target.value)}
                placeholder="PIN"
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </Field>

            <Field label="Note (required)">
              <input
                className={INPUT}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. I agree / I decline"
                autoComplete="off"
              />
            </Field>
          </div>

          {/* Warning banner */}
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <ArrowRightLeft className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
            <p className="text-xs text-amber-700">
              Review the request carefully before confirming. This action affects both staff schedules.
            </p>
          </div>

          {/* Action buttons */}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              disabled={loading || !canSubmit}
              onClick={() => call("APPROVED")}
              className={BTN_APPROVE}
              type="button"
            >
              {loading ? "Working…" : "Approve"}
            </button>

            <button
              disabled={loading || !canSubmit}
              onClick={() => call("REJECTED")}
              className={BTN_REJECT}
              type="button"
            >
              Reject
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <XCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Success */}
        {done && (
          <div className={`${CARD} p-5`}>
            <div className={`flex items-center gap-3 ${done === "approved" ? "text-teal-700" : "text-red-600"}`}>
              {done === "approved"
                ? <CheckCircle2 className="h-6 w-6" />
                : <XCircle className="h-6 w-6" />}
              <div>
                <div className="font-semibold">
                  {done === "approved" ? "Swap approved" : "Swap rejected"}
                </div>
                <div className="mt-0.5 text-xs text-gray-500">
                  The system has recorded your response. Both parties will be notified.
                </div>
              </div>
            </div>

            {result && (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600">
                  View API response
                </summary>
                <pre className="mt-2 overflow-auto rounded-lg bg-gray-100 p-3 text-xs text-gray-600">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}

        <div className="text-center text-xs text-gray-400">
          API: {API_BASE ? API_BASE : "(same origin)"}
        </div>
      </div>
    </div>
  );
}
