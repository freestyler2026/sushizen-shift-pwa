// src/app/swap-approve/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Field } from "@/components/Field";
import { getAuth } from "@/lib/auth";

// ✅ api.ts と同じ方針：ENVが空なら同一オリジン（相対URL）
const RAW_API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
const API_BASE = RAW_API_BASE ? RAW_API_BASE.replace(/\/+$/, "") : "";

// --------------------
// helpers
// --------------------
function qs(params: Record<string, any>) {
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

async function postJson<T = any>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { method: "POST" });
  const text = await res.text();

  if (!res.ok) {
    // FastAPIの {detail: "..."} も拾う
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
    // JSONで返らない場合でも落とさない
    return ({ ok: true, raw: text } as unknown) as T;
  }
}

// --------------------
// component
// --------------------
export default function SwapApprovePage() {
  const [reqId, setReqId] = useState("");
  const [staffName, setStaffName] = useState("");
  const [pin, setPin] = useState("");
  const [note, setNote] = useState("ok");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  // auth から名前を補完（pinは保存してない運用が多いので基本は入れない）
  useEffect(() => {
    const a = getAuth();
    if (a?.staffName) setStaffName(a.staffName);
    if (a?.pin) setPin(a.pin); // 保存している場合のみ
  }, []);

  const canSubmit = useMemo(() => {
    return reqId.trim() && staffName.trim() && pin.trim() && note.trim();
  }, [reqId, staffName, pin, note]);

  const call = async (action: "APPROVED" | "REJECTED") => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const q = qs({
        req_id: reqId,
        staff_name: staffName,
        action,
        note,
        pin,
      });

      const r = await postJson(`/api/shift_change/counterparty/respond${q}`);
      setResult(r);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-3.5 sm:p-5">
        <div className="text-[15px] font-semibold sm:text-base">Swap Approve</div>
        <div className="mt-1 text-sm text-neutral-500">
          Enter the request id and approve/reject as the designated counterparty.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Request ID (req_id)">
            <input
              className="min-h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={reqId}
              onChange={(e) => setReqId(e.target.value)}
              placeholder="e.g. 119ab8b2-..."
              autoComplete="off"
            />
          </Field>

          <Field label="Your name (must match counterparty)">
            <input
              className="min-h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="e.g. Muskan Tamang"
              autoComplete="name"
            />
          </Field>

          <Field label="PIN">
            <input
              className="min-h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
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
              className="min-h-10 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. I agree / I decline"
              autoComplete="off"
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            disabled={loading || !canSubmit}
            onClick={() => call("APPROVED")}
            className="min-h-10 w-full rounded-xl border border-emerald-900 bg-emerald-900/30 px-4 py-2 text-sm font-medium hover:bg-emerald-900/50 disabled:opacity-50 sm:w-auto"
            type="button"
          >
            Approve
          </button>

          <button
            disabled={loading || !canSubmit}
            onClick={() => call("REJECTED")}
            className="min-h-10 w-full rounded-xl border border-rose-900 bg-rose-900/30 px-4 py-2 text-sm font-medium hover:bg-rose-900/50 disabled:opacity-50 sm:w-auto"
            type="button"
          >
            Reject
          </button>

          {loading ? <div className="text-sm text-neutral-400">Working...</div> : null}
          {error ? <div className="w-full text-sm text-red-300">{error}</div> : null}
        </div>

        {result ? (
          <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="text-sm font-semibold">Result</div>
            <pre className="mt-2 overflow-auto text-xs text-neutral-300">{JSON.stringify(result, null, 2)}</pre>
          </div>
        ) : null}

        <div className="mt-3 text-xs text-neutral-500">
          API base: {API_BASE ? API_BASE : "(same origin)"}
        </div>
      </div>
    </div>
  );
}