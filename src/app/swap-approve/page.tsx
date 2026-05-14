// src/app/swap-approve/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, CheckCircle2, ShieldCheck, XCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/Field";
import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  DANGER_BUTTON,
  INPUT_CLASS,
  T_SECTION,
  T_CAPTION,
  BADGE_SUCCESS,
} from "@/lib/ui-tokens";

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
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j?.detail || j?.message || text;
    } catch { /* not JSON */ }
    throw new Error(detail || `HTTP ${res.status}`);
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
  const [confirmAction, setConfirmAction] = useState<"APPROVED" | "REJECTED" | null>(null);

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
    [reqId, staffName, pin, note],
  );

  const call = async (action: "APPROVED" | "REJECTED") => {
    setConfirmAction(null);
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
    <div className="mx-auto max-w-lg space-y-5 px-4 py-10">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Swap Approve</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Approve or reject a swap request as the designated counterparty.
          </p>
        </div>
        <span className={`${BADGE_SUCCESS} flex items-center gap-1.5 px-3 py-1.5 text-xs`}>
          <ShieldCheck className="h-3.5 w-3.5" />
          Counterparty
        </span>
      </div>

      {/* Form card */}
      <div className={`${GLASS_CARD} p-5`}>
        <div className="mb-4">
          <div className={T_SECTION}>Approval Form</div>
          <div className={`${T_CAPTION} mt-0.5`}>
            Your name must match the counterparty assigned to the swap request.
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Request ID">
            <input
              className={INPUT_CLASS}
              value={reqId}
              onChange={(e) => setReqId(e.target.value)}
              placeholder="e.g. 119ab8b2-..."
              autoComplete="off"
            />
          </Field>

          <Field label="Your name (must match counterparty)">
            <input
              className={INPUT_CLASS}
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="e.g. Muskan Tamang"
              autoComplete="name"
            />
          </Field>

          <Field label="PIN">
            <input
              className={INPUT_CLASS}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </Field>

          <Field label="Note (required)">
            <input
              className={INPUT_CLASS}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. I agree / I decline"
              autoComplete="off"
            />
          </Field>
        </div>

        {/* Warning banner */}
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <ArrowRightLeft className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-xs text-amber-300">
            Review the request carefully before confirming. This action affects both staff schedules.
          </p>
        </div>

        {/* Action buttons */}
        {confirmAction ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              Confirm {confirmAction === "APPROVED" ? "approval" : "rejection"}?
            </div>
            <p className="mt-1 text-xs text-amber-200/80">
              This will {confirmAction === "APPROVED" ? "approve" : "reject"} swap request <span className="font-mono font-semibold">{reqId}</span>. This action cannot be undone.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void call(confirmAction)}
                className={`${confirmAction === "APPROVED" ? "rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50" : DANGER_BUTTON} flex items-center gap-2`}
              >
                {loading
                  ? <><RefreshCw className="h-4 w-4 animate-spin" /> Working…</>
                  : `Yes, ${confirmAction === "APPROVED" ? "Approve" : "Reject"}`}
              </button>
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="rounded-xl border border-white/10 bg-white/6 px-5 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              disabled={loading || !canSubmit}
              onClick={() => setConfirmAction("APPROVED")}
              className={`${PRIMARY_BUTTON} flex items-center gap-2`}
              type="button"
            >
              <CheckCircle2 className="h-4 w-4" />
              Approve
            </button>

            <button
              disabled={loading || !canSubmit}
              onClick={() => setConfirmAction("REJECTED")}
              className={`${DANGER_BUTTON} flex items-center gap-2`}
              type="button"
            >
              <XCircle className="h-4 w-4" />
              Reject
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            <XCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Success */}
      {done && (
        <div className={`${GLASS_CARD} p-5`}>
          <div className={`flex items-center gap-3 ${done === "approved" ? "text-emerald-400" : "text-red-400"}`}>
            {done === "approved"
              ? <CheckCircle2 className="h-6 w-6" />
              : <XCircle className="h-6 w-6" />}
            <div>
              <div className="font-semibold">
                {done === "approved" ? "Swap approved" : "Swap rejected"}
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">
                The system has recorded your response. Both parties will be notified.
              </div>
            </div>
          </div>

          {result && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
                View API response
              </summary>
              <pre className="mt-2 overflow-auto rounded-lg bg-white/8 p-3 text-xs text-zinc-300">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}

      <p className="text-center text-xs text-zinc-600">
        API: {API_BASE ? API_BASE : "(same origin)"}
      </p>
    </div>
  );
}
