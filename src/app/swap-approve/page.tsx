// src/app/swap-approve/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRightLeft, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/Field";
import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import {
  GLASS_CARD,
  INPUT_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_BODY,
  T_CAPTION,
  BADGE_SUCCESS,
} from "@/lib/ui-tokens";

const PAGE_BG = "min-h-screen text-white";
const BLUSH_GLASS = `${GLASS_CARD} bg-violet-950/30`;
const BLUSH_HIGHLIGHT = "rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/18 to-purple-500/10";
const BLUSH_PRIMARY =
  "rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-5 py-2.5 font-semibold text-white transition-all duration-200 shadow-lg shadow-violet-500/25 hover:scale-[1.02] hover:from-violet-400 hover:to-purple-400 hover:shadow-violet-500/40 active:scale-[0.98] disabled:opacity-60";
const BLUSH_SECONDARY =
  "rounded-xl border border-violet-400/15 bg-violet-950/30 px-5 py-2.5 text-white transition-all duration-200 hover:border-violet-500/25 hover:bg-violet-950/45 disabled:opacity-60";

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

async function postJson<T = any>(path: string, headers?: HeadersInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { method: "POST", headers });
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
  const router = useRouter();
  const [reqId, setReqId] = useState("");
  const [staffName, setStaffName] = useState("");
  const [pin, setPin] = useState("");
  const [note, setNote] = useState("ok");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  // auth から名前を補完（pinは保存してない運用が多いので基本は入れない）
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
    return () => {
      cancelled = true;
    };
  }, [router]);

  const canSubmit = useMemo(() => {
    return reqId.trim() && staffName.trim() && pin.trim() && note.trim();
  }, [reqId, staffName, pin, note]);

  const call = async (action: "APPROVED" | "REJECTED") => {
    if (!window.confirm(`Are you sure you want to ${action.toLowerCase()} this swap request?`)) return;
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

      const r = await postJson(`/api/shift_change/counterparty/respond${q}`, getAuthHeaders(getAuth()));
      setResult(r);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={PAGE_BG}>
      <motion.div
        className="mx-auto max-w-5xl space-y-6 px-4 py-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Swap Approve</h1>
          <p className={T_BODY}>Approve or reject a swap request as the designated counterparty.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={BADGE_SUCCESS}>
            <ShieldCheck className="h-3 w-3" />
            Counterparty approval
          </span>
        </div>
      </div>

      <div className={`${BLUSH_GLASS} p-4 sm:p-5`}>
        <div className="mb-4">
          <div className={T_SECTION}>Approval Form</div>
          <div className={T_CAPTION}>Your name must match the counterparty assigned to the swap request.</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Request ID (req_id)">
            <input
              className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
              value={reqId}
              onChange={(e) => setReqId(e.target.value)}
              placeholder="e.g. 119ab8b2-..."
              autoComplete="off"
            />
          </Field>

          <Field label="Your name (must match counterparty)">
            <input
              className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="e.g. Muskan Tamang"
              autoComplete="name"
            />
          </Field>

          <Field label="PIN">
            <input
              className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
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
              className={`${INPUT_CLASS} focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. I agree / I decline"
              autoComplete="off"
            />
          </Field>
        </div>

        <div className={`mt-5 p-4 ${BLUSH_HIGHLIGHT}`}>
          <div className="mb-3 flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-amber-300" />
            <div className={T_CAPTION}>Review the request carefully before confirming. This action affects both staff schedules.</div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            disabled={loading || !canSubmit}
            onClick={() => call("APPROVED")}
            className={`${BLUSH_PRIMARY} min-h-10 w-full sm:w-auto`}
            type="button"
          >
            Approve
          </button>

          <button
            disabled={loading || !canSubmit}
            onClick={() => call("REJECTED")}
            className={`${BLUSH_SECONDARY} min-h-10 w-full sm:w-auto`}
            type="button"
          >
            Reject
          </button>

          {loading ? <div className="text-sm text-neutral-400">Working...</div> : null}
          {error ? <div className="w-full text-sm text-red-300">{error}</div> : null}
        </div>
        </div>

        {result ? (
          <div className={`mt-4 p-4 ${BLUSH_GLASS}`}>
            <div className={T_SECTION}>Result</div>
            <pre className="mt-2 overflow-auto text-xs text-neutral-300">{JSON.stringify(result, null, 2)}</pre>
          </div>
        ) : null}

        <div className="mt-3 text-xs text-neutral-500">
          API base: {API_BASE ? API_BASE : "(same origin)"}
        </div>
      </div>
      </motion.div>
    </div>
  );
}