"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  Fingerprint,
  KeyRound,
  Lock,
  Loader2,
  MessageCircle,
  Plus,
  Receipt,
  Send,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
  GLASS_CARD,
  KPI_CARD,
  PRIMARY_BUTTON,
  T_PAGE_TITLE,
  TAB_ACTIVE,
  TAB_INACTIVE,
} from "@/lib/ui-tokens";
import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { API_BASE } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type City = "dubai" | "manila";

interface Payslip {
  id: string;
  cycle_id: number;
  cycle_label: string;
  cycle_year: number;
  cycle_month: number;
  pay_date: string | null;
  basic_salary: number;
  total_adjustments: number;
  net_additions: number;
  net_deductions: number;
  gross_pay: number;
  net_pay: number;
  currency: string;
  role_title: string;
  branch_code: string;
  paid_via: string;
  staff_name: string;
  city: string;
}

interface PayslipItem {
  adj_type: "addition" | "deduction";
  subtype: string;
  amount: number;
  vat: number;
  note: string;
  incurred_at: string | null;
  reference_no: string;
}

interface Adjustment {
  id: string;
  cycle_id: number;
  cycle_label: string | null;
  cycle_year: number | null;
  cycle_month: number | null;
  pay_date: string | null;
  adj_type: string;
  subtype: string;
  amount: number;
  vat: number;
  incurred_at: string | null;
  reference_no: string;
  note: string;
  source: string;
  created_by: string;
  created_at: string;
}

interface Loan {
  id: string;
  amount: number;
  installment_amount: number;
  total_installments: number;
  remaining_installments: number;
  paid_installments: number;
  remaining_balance: number;
  total_repaid: number;
  status: string;
  purpose: string;
  note: string;
  approved_by: string;
  approved_at: string | null;
  disbursed_at: string | null;
  start_cycle_id: number | null;
  created_at: string;
}

interface LeaveSalaryReq {
  id: string;
  leave_start_date: string;
  leave_end_date: string;
  leave_days: number;
  currency: string;
  daily_rate: number;
  advance_amount: number;
  status: string;
  purpose: string;
  requested_at: string;
  approved_by: string;
  approved_at: string | null;
  paid_at: string | null;
  paid_via: string;
  rejection_note: string;
}

interface Summary {
  employee_id?: string | null;
  latest_payslip: {
    net_pay: number;
    currency: string;
    cycle_label: string;
    pay_date: string | null;
  } | null;
  active_loans: number;
  total_loan_remaining: number;
  pending_adjustments: number;
  pending_adj_net: number;
}

interface Inquiry {
  id: number;
  city: string;
  staff_name: string;
  subject: string;
  status: "open" | "in_progress" | "resolved";
  created_at: string;
  updated_at: string;
  reply_count: number;
  last_reply_at: string | null;
}

interface InquiryReply {
  id: number;
  inquiry_id: number;
  sender_name: string;
  sender_role: string;
  body: string;
  is_from_staff: boolean;
  created_at: string;
}

interface InquiryThread {
  found: boolean;
  inquiry: Inquiry & { body: string };
  replies: InquiryReply[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatCycleLabel(year: number | null | undefined, month: number | null | undefined, fallback: string) {
  if (year && month) {
    try {
      return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    } catch { /* fall through */ }
  }
  return fallback || "—";
}

function loanStatusBadge(status: string) {
  if (status === "active") return <span className={BADGE_INFO}>Active</span>;
  if (status === "completed") return <span className={BADGE_SUCCESS}>Completed</span>;
  if (status === "approved") return <span className={BADGE_WARNING}>Approved</span>;
  if (status === "rejected") return <span className={BADGE_ERROR}>Rejected</span>;
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/15 border border-zinc-500/25 px-2.5 py-0.5 text-xs font-medium text-zinc-400">{status}</span>;
}

function leaveSalaryBadge(status: string) {
  if (status === "paid") return <span className={BADGE_SUCCESS}>Paid</span>;
  if (status === "approved") return <span className={BADGE_INFO}>Approved</span>;
  if (status === "pending") return <span className={BADGE_WARNING}>Pending</span>;
  if (status === "rejected") return <span className={BADGE_ERROR}>Rejected</span>;
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/15 border border-zinc-500/25 px-2.5 py-0.5 text-xs font-medium text-zinc-400">{status}</span>;
}

// ─── WebAuthn helpers ─────────────────────────────────────────────────────────

function b64uDecode(b64u: string): Uint8Array {
  const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function b64uEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function credentialToJSON(cred: PublicKeyCredential): Record<string, unknown> {
  const resp = cred.response;
  if (resp instanceof AuthenticatorAssertionResponse) {
    return {
      id: cred.id,
      rawId: b64uEncode(cred.rawId),
      type: cred.type,
      response: {
        authenticatorData: b64uEncode(resp.authenticatorData),
        clientDataJSON: b64uEncode(resp.clientDataJSON),
        signature: b64uEncode(resp.signature),
        userHandle: resp.userHandle ? b64uEncode(resp.userHandle) : null,
      },
      clientExtensionResults: cred.getClientExtensionResults(),
    };
  }
  return { id: cred.id, rawId: b64uEncode(cred.rawId), type: cred.type };
}

type PublicKeyCredentialRequestOptionsJSON = {
  challenge: string;
  rpId?: string;
  timeout?: number;
  userVerification?: string;
  allowCredentials?: Array<{ id: string; type: string; transports?: string[] }>;
};

async function webauthnAuthenticate(options: Record<string, unknown>): Promise<Record<string, unknown>> {
  const pubKey = options as PublicKeyCredentialRequestOptionsJSON;
  const getOptions: CredentialRequestOptions = {
    publicKey: {
      challenge: b64uDecode(pubKey.challenge as string).buffer as ArrayBuffer,
      rpId: pubKey.rpId as string | undefined,
      timeout: (pubKey.timeout as number | undefined) ?? 60000,
      userVerification: (pubKey.userVerification as UserVerificationRequirement | undefined) ?? "required",
      allowCredentials: ((pubKey.allowCredentials ?? []) as Array<{ id: string; type: string; transports?: string[] }>).map((c) => ({
        id: b64uDecode(c.id).buffer as ArrayBuffer,
        type: c.type as PublicKeyCredentialType,
        transports: (c.transports ?? []) as AuthenticatorTransport[],
      })),
    },
  };
  const cred = await navigator.credentials.get(getOptions);
  if (!cred) throw new Error("Authentication cancelled");
  return credentialToJSON(cred as PublicKeyCredential);
}

// ─── Passkey Gate ─────────────────────────────────────────────────────────────

interface PasskeyGateProps {
  onVerified: (stepUpToken: string) => void;
}

function PasskeyGate({ onVerified }: PasskeyGateProps) {
  const [mode, setMode] = useState<"idle" | "loading" | "pin" | "registering">("idle");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [wauSupported] = useState(() =>
    typeof window !== "undefined" && !!window.PublicKeyCredential
  );

  const getHeaders = useCallback(async (): Promise<Record<string, string>> => {
    await refreshAuthFromApi(getAuth());
    const auth = getAuth();
    return getAuthHeaders(auth) as Record<string, string>;
  }, []);

  const verifyPasskey = useCallback(async () => {
    setError("");
    setMode("loading");
    try {
      const headers = await getHeaders();
      const optRes = await fetch(`${API_BASE}/api/auth/webauthn/auth/options`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: "{}",
      });
      if (!optRes.ok) {
        const j = await optRes.json().catch(() => ({}));
        const detail = (j as { detail?: string }).detail || "";
        if (optRes.status === 404 || detail.includes("No passkeys")) {
          setError("No passkey registered on this account. Use PIN verification instead, or register a passkey from the Attendance page.");
          setMode("idle");
          return;
        }
        throw new Error(detail || `HTTP ${optRes.status}`);
      }
      const { state_token, options } = await optRes.json();
      const credential = await webauthnAuthenticate(options as Record<string, unknown>);
      const verRes = await fetch(`${API_BASE}/api/auth/webauthn/auth/verify`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ state_token, credential }),
      });
      if (!verRes.ok) {
        const j = await verRes.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail || "Passkey verification failed");
      }
      const { step_up_token } = await verRes.json();
      onVerified(step_up_token);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("cancel") || msg.includes("NotAllowedError") || msg.includes("AbortError")) {
        setError("Verification was cancelled. Please try again.");
      } else if (msg.includes("Not implemented") || msg.includes("NotImplementedError")) {
        setError("Passkey not found on this device. Try PIN verification or register a passkey from the Attendance page.");
      } else {
        setError(msg || "Passkey verification failed. Please try again.");
      }
      setMode("idle");
    }
  }, [getHeaders, onVerified]);

  const verifyPin = useCallback(async () => {
    if (pin.length < 4) {
      setError("PIN must be at least 4 digits.");
      return;
    }
    setError("");
    setMode("loading");
    try {
      const headers = await getHeaders();
      const res = await fetch(`${API_BASE}/api/auth/step-up/pin`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail || "Invalid PIN");
      }
      const { step_up_token } = await res.json();
      onVerified(step_up_token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Invalid PIN");
      setMode("pin");
    }
  }, [pin, getHeaders, onVerified]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Lock Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
            <Lock className="h-10 w-10 text-violet-400" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white text-center mb-1">Verify Your Identity</h1>
        <p className="text-sm text-zinc-400 text-center mb-8">
          Your pay information is protected. Verify to continue.
        </p>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {mode === "loading" && (
          <div className="flex flex-col items-center gap-3 py-8 text-zinc-400">
            <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
            <p className="text-sm">Verifying…</p>
          </div>
        )}

        {mode !== "loading" && mode !== "pin" && (
          <div className="space-y-3">
            {wauSupported && (
              <button
                onClick={verifyPasskey}
                className="w-full flex items-center justify-center gap-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold py-4 transition"
              >
                <Fingerprint className="h-5 w-5" />
                Verify with Passkey
              </button>
            )}
            <button
              onClick={() => { setMode("pin"); setError(""); }}
              className="w-full flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 font-medium py-3.5 transition text-sm"
            >
              <KeyRound className="h-4 w-4" />
              Use PIN instead
            </button>

            {!wauSupported && (
              <p className="text-xs text-zinc-600 text-center">
                This browser does not support passkeys. Please use Chrome or Safari.
              </p>
            )}
          </div>
        )}

        {mode === "pin" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                Enter your PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                onKeyDown={(e) => e.key === "Enter" && verifyPin()}
                placeholder="••••"
                autoFocus
                className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3.5 text-white text-center text-2xl tracking-[0.5em] placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <button
              onClick={verifyPin}
              className="w-full rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3.5 transition flex items-center justify-center gap-2"
            >
              <ShieldCheck className="h-4 w-4" />
              Confirm
            </button>
            <button
              onClick={() => { setMode("idle"); setError(""); setPin(""); }}
              className="w-full text-sm text-zinc-500 hover:text-zinc-300 transition py-1"
            >
              Back
            </button>
          </div>
        )}

        <p className="mt-8 text-xs text-zinc-600 text-center">
          Your pay data is only visible after identity verification.
        </p>
      </div>
    </div>
  );
}


/**
 * The sum behind a payslip line, spelled out.
 *
 * A staff member asked where "AED 7.2100/h" came from and the payslip could not
 * tell them. The admin screen has shown quantity x rate all along; the person
 * whose pay it is could not see it, which is the wrong way round — they are the
 * one who needs to check it.
 */
function lineWorking(
  item: { quantity: number | null; unit_rate: number | null; amount: number },
  currency: string,
): string | null {
  if (item.quantity == null || item.unit_rate == null) return null;
  const q = Number(item.quantity);
  const r = Number(item.unit_rate);
  if (!Number.isFinite(q) || !Number.isFinite(r) || r === 0) return null;
  const sym = currency === "AED" ? "AED " : "₱";
  return `${q.toLocaleString(undefined, { maximumFractionDigits: 4 })} × ${sym}${r.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

// ─── Payslip Detail Modal ─────────────────────────────────────────────────────

interface ManilaPayslipItem {
  item_code: string;
  item_type: string;
  label: string;
  quantity: number | null;
  unit_rate: number | null;
  amount: number;
  note: string | null;
}

function PayslipModal({
  slip,
  stepUpToken,
  onClose,
}: {
  slip: Payslip;
  stepUpToken: string;
  onClose: () => void;
}) {
  const cycleDisplay = formatCycleLabel(slip.cycle_year, slip.cycle_month, slip.cycle_label);
  const isManila = slip.city?.toLowerCase() === "manila" || slip.currency === "PHP";
  const [items, setItems] = useState<PayslipItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(true);
  const [manilaItems, setManilaItems] = useState<ManilaPayslipItem[]>([]);
  const [manilaDetailLoading, setManilaDetailLoading] = useState(false);

  // Dubai payslip detail
  useEffect(() => {
    if (!slip.cycle_id || slip.city?.toLowerCase() === "manila") {
      setDetailLoading(false);
      return;
    }
    const auth = getAuth();
    const headers = {
      ...(getAuthHeaders(auth) as Record<string, string>),
      "X-Step-Up-Token": stepUpToken,
    };
    fetch(`${API_BASE}/api/admin/payroll/my-pay/payslip-detail?city=${slip.city}&cycle_id=${slip.cycle_id}`, { headers })
      .then((r) => r.json())
      .then((d) => setItems((d as { items?: PayslipItem[] }).items ?? []))
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  }, [slip.cycle_id, slip.city, stepUpToken]);

  // Manila payslip detail — fetches individual line items using run_id
  useEffect(() => {
    if (!isManila || !slip.id) return;
    setManilaDetailLoading(true);
    const auth = getAuth();
    const headers = {
      ...(getAuthHeaders(auth) as Record<string, string>),
      "X-Step-Up-Token": stepUpToken,
    };
    fetch(`${API_BASE}/api/admin/payroll/my-pay/manila-payslip-detail?run_id=${slip.id}`, { headers })
      .then((r) => r.json())
      .then((d) => setManilaItems((d as { items?: ManilaPayslipItem[] }).items ?? []))
      .catch(() => {})
      .finally(() => setManilaDetailLoading(false));
  }, [slip.id, isManila, stepUpToken]);

  const additions = items.filter((i) => i.adj_type === "addition");
  const deductions = items.filter((i) => i.adj_type === "deduction");

  // Manila breakdown derived from individual items
  const manilaBasicItem = manilaItems.find(i => i.item_code === "MONTHLY_BASIC");
  const manilaEarnings = manilaItems.filter(i =>
    i.item_type === "earning" &&
    i.item_code !== "MONTHLY_BASIC" &&
    i.item_code !== "13TH_MONTH_ACCRUAL"
  );
  const manilaDeductions = manilaItems.filter(i => i.item_type === "deduction");
  const manilaHasDetail = manilaItems.length > 0;
  const manilaBasicAmount = manilaBasicItem?.amount ?? slip.basic_salary;
  const manilaNetAdditions = manilaEarnings.reduce((s, i) => s + i.amount, 0);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden !important; }
          #payslip-print, #payslip-print * { visibility: visible !important; }
          #payslip-print {
            position: fixed !important;
            inset: 0 !important;
            padding: 40px !important;
            background: #ffffff !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
          .payslip-no-print { display: none !important; }
        }
      `}} />

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="w-full max-w-lg my-4">
          <div id="payslip-print" className="bg-white rounded-2xl overflow-hidden shadow-2xl">

            {/* ── Document Header ── */}
            <div className="bg-slate-900 px-6 py-5 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
                    <span className="text-white text-xs font-black tracking-tight">SZ</span>
                  </div>
                  <span className="text-white font-bold text-lg tracking-wide">Sushi ZEN</span>
                </div>
                <p className="text-slate-400 text-xs pl-10">
                  {isManila ? "Manila Operations · Philippines" : "Dubai Operations · UAE"}
                </p>
              </div>
              <div className="text-right ml-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">Pay Slip</p>
                <p className="text-white font-bold text-base mt-0.5">{cycleDisplay}</p>
                {slip.pay_date && (
                  <p className="text-slate-400 text-xs mt-0.5">Paid: {fmtDate(slip.pay_date)}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="payslip-no-print ml-4 mt-0.5 text-slate-400 hover:text-white transition shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* ── Employee Details ── */}
            <div className="bg-slate-50 px-6 py-4 grid grid-cols-2 gap-x-6 gap-y-3 border-b border-slate-200">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Employee</p>
                <p className="text-sm font-semibold text-slate-800">{slip.staff_name || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Position</p>
                <p className="text-sm font-medium text-slate-700">{slip.role_title || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Branch</p>
                <p className="text-sm font-medium text-slate-700">{slip.branch_code || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Payment Method</p>
                <p className="text-sm font-medium text-slate-700 capitalize">{slip.paid_via || "—"}</p>
              </div>
            </div>

            {/* ── Pay Calculation Breakdown ── */}
            <div className="px-6 py-5 bg-white">
              {/* Formula header */}
              <div className="mb-3 flex items-center gap-2">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  How Your Pay is Calculated
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              {/* Basic salary */}
              <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
                <div>
                  <span className="text-sm font-semibold text-slate-700">Basic Salary</span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isManila && manilaHasDetail ? "Half-month contracted salary" : "Monthly contracted salary"}
                  </p>
                </div>
                <span className="text-sm font-bold text-slate-900 tabular-nums">
                  {fmt(isManila && manilaHasDetail ? manilaBasicAmount : slip.basic_salary, slip.currency)}
                </span>
              </div>

              {/* Additions — Manila shows individual earning items; Dubai shows adjustment items */}
              {(isManila
                ? (manilaDetailLoading || manilaEarnings.length > 0)
                : (slip.net_additions > 0 || additions.length > 0)
              ) && (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 pt-3 mb-1">
                    + Additions & Allowances
                  </p>
                  {(isManila ? manilaDetailLoading : detailLoading) ? (
                    <div className="flex items-center gap-2 py-2 text-xs text-slate-400">
                      <Loader2 className="h-3 w-3 animate-spin" />Loading breakdown…
                    </div>
                  ) : isManila ? (
                    manilaEarnings.map((item, i) => (
                      <div key={i} className="flex justify-between items-center py-1.5 border-b border-slate-50">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-slate-600">{item.label}</span>
                          {lineWorking(item, slip.currency) && (
                            <p className="text-[11px] tabular-nums text-slate-500">
                              {lineWorking(item, slip.currency)}
                            </p>
                          )}
                          {item.note && (
                            <p className="text-[11px] break-words text-slate-400">{item.note}</p>
                          )}
                        </div>
                        <span className={`text-sm font-medium tabular-nums ml-4 ${item.amount > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                          {item.amount > 0 ? "+" : ""}{fmt(item.amount, slip.currency)}
                        </span>
                      </div>
                    ))
                  ) : additions.length > 0 ? (
                    additions.map((item, i) => (
                      <div key={i} className="flex justify-between items-start py-1.5 border-b border-slate-50">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-slate-600 capitalize">{item.subtype || "Allowance"}</span>
                          {item.incurred_at && (
                            <p className="text-[11px] text-slate-400">{fmtDate(item.incurred_at)}</p>
                          )}
                          {item.note && <p className="text-[11px] break-words text-slate-400">{item.note}</p>}
                        </div>
                        <span className="text-sm font-medium text-emerald-600 tabular-nums ml-4">
                          +{fmt(item.amount, slip.currency)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                      <span className="text-sm text-slate-600">Total Allowances & Additions</span>
                      <span className="text-sm font-medium text-emerald-600 tabular-nums">
                        +{fmt(slip.net_additions, slip.currency)}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Gross pay total */}
              <div className="flex justify-between items-center py-3 px-3 -mx-3 bg-slate-50 rounded-lg mt-2">
                <div>
                  <span className="text-sm font-bold text-slate-700">Gross Pay</span>
                  <p className="text-[11px] text-slate-400 mt-0.5">Basic + Additions</p>
                </div>
                <span className="text-sm font-bold text-slate-900 tabular-nums">{fmt(slip.gross_pay, slip.currency)}</span>
              </div>

              {/* Deductions — Manila shows individual deduction items; Dubai shows adjustment items */}
              {(isManila
                ? (manilaDetailLoading || manilaDeductions.length > 0)
                : (slip.net_deductions > 0 || deductions.length > 0)
              ) && (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-red-500 pt-3 mb-1">
                    − Deductions
                  </p>
                  {(isManila ? manilaDetailLoading : detailLoading) ? (
                    <div className="flex items-center gap-2 py-2 text-xs text-slate-400">
                      <Loader2 className="h-3 w-3 animate-spin" />Loading breakdown…
                    </div>
                  ) : isManila ? (
                    manilaDeductions.map((item, i) => (
                      <div key={i} className="flex justify-between items-center py-1.5 border-b border-slate-50">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-slate-600">{item.label}</span>
                          {lineWorking(item, slip.currency) && (
                            <p className="text-[11px] tabular-nums text-slate-500">
                              {lineWorking(item, slip.currency)}
                            </p>
                          )}
                          {item.note && (
                            <p className="text-[11px] break-words text-slate-400">{item.note}</p>
                          )}
                        </div>
                        <span className={`text-sm font-medium tabular-nums ml-4 ${item.amount !== 0 ? "text-red-500" : "text-slate-400"}`}>
                          {item.amount !== 0 ? "−" : ""}{fmt(Math.abs(item.amount), slip.currency)}
                        </span>
                      </div>
                    ))
                  ) : deductions.length > 0 ? (
                    deductions.map((item, i) => (
                      <div key={i} className="flex justify-between items-start py-1.5 border-b border-slate-50">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-slate-600 capitalize">{item.subtype || "Deduction"}</span>
                          {item.incurred_at && (
                            <p className="text-[11px] text-slate-400">{fmtDate(item.incurred_at)}</p>
                          )}
                          {item.note && <p className="text-[11px] break-words text-slate-400">{item.note}</p>}
                        </div>
                        <span className="text-sm font-medium text-red-500 tabular-nums ml-4">
                          −{fmt(item.amount, slip.currency)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                      <span className="text-sm text-slate-600">Total Deductions</span>
                      <span className="text-sm font-medium text-red-500 tabular-nums">
                        −{fmt(slip.net_deductions, slip.currency)}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Formula summary line */}
              {(isManila
                ? (manilaHasDetail && (manilaNetAdditions > 0 || slip.net_deductions > 0))
                : (slip.net_additions > 0 || slip.net_deductions > 0)
              ) && (
                <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-500 font-mono text-center">
                  {fmt(isManila && manilaHasDetail ? manilaBasicAmount : slip.basic_salary, slip.currency)}
                  {isManila && manilaHasDetail ? (
                    manilaNetAdditions > 0 && <> + {fmt(manilaNetAdditions, slip.currency)}</>
                  ) : (
                    slip.net_additions > 0 && <> + {fmt(slip.net_additions, slip.currency)}</>
                  )}
                  {slip.net_deductions > 0 && <> − {fmt(slip.net_deductions, slip.currency)}</>}
                  {" "}<span className="font-bold text-slate-700">= {fmt(slip.net_pay, slip.currency)}</span>
                </div>
              )}

              {/* Net pay highlight */}
              <div className="mt-4 rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 px-5 py-4 flex justify-between items-center">
                <div>
                  <span className="text-white font-bold text-sm uppercase tracking-wide">Net Pay</span>
                  <p className="text-violet-200 text-xs mt-0.5">Amount received</p>
                </div>
                <span className="text-white font-black text-2xl tabular-nums">{fmt(slip.net_pay, slip.currency)}</span>
              </div>
            </div>

            {/* ── Document Footer ── */}
            <div className="px-6 pb-5 bg-white">
              <p className="text-[11px] text-slate-400 text-center border-t border-slate-100 pt-4 leading-relaxed">
                This is a system-generated payslip and does not require a signature.<br />
                For queries, please contact your HR department.
              </p>
            </div>

            {/* ── Action Buttons ── */}
            <div className="payslip-no-print px-6 pb-6 flex gap-3 bg-white border-t border-slate-100 pt-4">
              <button
                onClick={() => window.print()}
                className="flex-1 rounded-xl border border-violet-200 bg-violet-50 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 flex items-center justify-center gap-2"
              >
                <FileText className="h-4 w-4" />
                Print / Save PDF
              </button>
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Loan Card ────────────────────────────────────────────────────────────────

function LoanCard({ loan, currency }: { loan: Loan; currency: string }) {
  const pct = loan.total_installments > 0
    ? Math.round((loan.paid_installments / loan.total_installments) * 100)
    : 0;

  return (
    <div className={`${GLASS_CARD} p-5`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-white">{fmt(loan.amount, currency)}</p>
          <p className="text-xs text-zinc-400 mt-0.5">{loan.purpose || "No purpose specified"}</p>
        </div>
        {loanStatusBadge(loan.status)}
      </div>

      {(loan.status === "active" || loan.status === "completed") && (
        <>
          <div className="mb-1 flex justify-between text-xs text-zinc-400">
            <span>{loan.paid_installments}/{loan.total_installments} installments</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-zinc-500">Remaining balance</p>
              <p className="font-semibold text-amber-400 mt-0.5">{fmt(loan.remaining_balance, currency)}</p>
            </div>
            <div className="text-right">
              <p className="text-zinc-500">Monthly installment</p>
              <p className="font-medium text-zinc-300 mt-0.5">{fmt(loan.installment_amount, currency)}</p>
            </div>
          </div>
        </>
      )}

      <div className="mt-3 border-t border-white/10 pt-3 flex justify-between text-xs text-zinc-600">
        <span>Applied: {fmtDate(loan.created_at)}</span>
        {loan.disbursed_at && <span>Disbursed: {fmtDate(loan.disbursed_at)}</span>}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "payslips" | "adjustments" | "loans" | "leave" | "inquiries";

export default function MyPayPage() {
  const router = useRouter();
  const [verified, setVerified] = useState(false);
  const [stepUpToken, setStepUpToken] = useState("");
  const [city, setCity] = useState<City>("dubai");
  const [tab, setTab] = useState<Tab>("payslips");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [leaveReqs, setLeaveReqs] = useState<LeaveSalaryReq[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [selectedInquiry, setSelectedInquiry] = useState<InquiryThread | null>(null);
  const [showNewInquiry, setShowNewInquiry] = useState(false);
  const [inquirySubject, setInquirySubject] = useState("");
  const [inquiryBody, setInquiryBody] = useState("");
  const [inquirySubmitting, setInquirySubmitting] = useState(false);
  const [inquiryReplyBody, setInquiryReplyBody] = useState("");
  const [inquiryReplySubmitting, setInquiryReplySubmitting] = useState(false);
  const [inquiryThreadLoading, setInquiryThreadLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedSlip, setSelectedSlip] = useState<Payslip | null>(null);

  const summaryLoadRef = useRef(0);
  const tabLoadRef = useRef(0);
  const tabMountedRef = useRef(false);

  // Auth guard — redirect if not logged in; set city from profile
  useEffect(() => {
    const auth = getAuth();
    if (!auth) { router.replace("/"); return; }
    setCity(auth.city?.toLowerCase() === "manila" ? "manila" : "dubai");

    // Restore step-up token from session storage (survives tab navigation, not tab close)
    const saved = sessionStorage.getItem("payroll_step_up");
    if (saved) {
      setStepUpToken(saved);
      setVerified(true);
    } else {
      setLoading(false);
    }
  }, [router]);

  const handleVerified = useCallback((token: string) => {
    sessionStorage.setItem("payroll_step_up", token);
    setStepUpToken(token);
    setVerified(true);
  }, []);

  const authHeaders = useCallback((): Record<string, string> => {
    const auth = getAuth();
    return {
      ...(getAuthHeaders(auth) as Record<string, string>),
      "X-Step-Up-Token": stepUpToken,
    };
  }, [stepUpToken]);

  const doFetch = useCallback(async (path: string) => {
    const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let detail = text;
      try {
        const j = JSON.parse(text);
        const d = (j as { detail?: string | Array<{ msg?: string }> })?.detail;
        if (typeof d === "string") detail = d;
        else if (Array.isArray(d)) detail = d.map((e) => e?.msg || JSON.stringify(e)).join("; ");
      } catch { /* keep detail = text */ }
      // Step-up expired — clear and show gate again
      if (detail === "step_up_required") {
        sessionStorage.removeItem("payroll_step_up");
        setVerified(false);
        setStepUpToken("");
        throw new Error("step_up_required");
      }
      throw new Error(detail || `HTTP ${res.status}`);
    }
    return res.json();
  }, [authHeaders]);

  // Load summary cards
  const loadSummary = useCallback(async (c: City) => {
    const id = ++summaryLoadRef.current;
    setLoading(true);
    setError("");
    try {
      const data = await doFetch(`/api/admin/payroll/my-pay/summary?city=${c}`);
      if (summaryLoadRef.current !== id) return;
      setSummary(data as Summary);
    } catch (e: unknown) {
      if (summaryLoadRef.current !== id) return;
      const msg = e instanceof Error ? e.message : "";
      if (msg !== "step_up_required") setError("Failed to load pay summary. Please try again.");
    } finally {
      if (summaryLoadRef.current === id) setLoading(false);
    }
  }, [doFetch]);

  // Load current tab
  const loadTab = useCallback(async (t: Tab, c: City) => {
    const id = ++tabLoadRef.current;
    setTabLoading(true);
    setError("");
    try {
      if (t === "payslips") {
        const data = await doFetch(`/api/admin/payroll/my-pay/payslips?city=${c}`);
        if (tabLoadRef.current !== id) return;
        setPayslips((data as { payslips?: Payslip[] }).payslips ?? []);
      } else if (t === "adjustments") {
        const data = await doFetch(`/api/admin/payroll/my-pay/adjustments?city=${c}`);
        if (tabLoadRef.current !== id) return;
        setAdjustments((data as { adjustments?: Adjustment[] }).adjustments ?? []);
      } else if (t === "loans") {
        const data = await doFetch(`/api/admin/payroll/my-pay/loans?city=${c}`);
        if (tabLoadRef.current !== id) return;
        setLoans((data as { loans?: Loan[] }).loans ?? []);
      } else if (t === "leave") {
        const data = await doFetch(`/api/admin/payroll/my-pay/leave-salary?city=${c}`);
        if (tabLoadRef.current !== id) return;
        setLeaveReqs((data as { requests?: LeaveSalaryReq[] }).requests ?? []);
      } else if (t === "inquiries") {
        const data = await doFetch(`/api/admin/payroll/my-pay/inquiries?city=${c}`);
        if (tabLoadRef.current !== id) return;
        setInquiries(Array.isArray(data) ? (data as Inquiry[]) : []);
      }
    } catch (e: unknown) {
      if (tabLoadRef.current !== id) return;
      const msg = e instanceof Error ? e.message : "";
      if (msg !== "step_up_required") setError("Failed to load tab data. Please try again.");
    } finally {
      if (tabLoadRef.current === id) setTabLoading(false);
    }
  }, [doFetch]);

  useEffect(() => {
    if (!verified || !stepUpToken) return;
    void loadSummary(city);
    void loadTab(tab, city);
  }, [verified, city]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!tabMountedRef.current) { tabMountedRef.current = true; return; }
    if (!verified || !stepUpToken) return;
    void loadTab(tab, city);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCityChange = (c: City) => {
    setCity(c);
    setSummary(null);
    setPayslips([]);
    setAdjustments([]);
    setLoans([]);
    setLeaveReqs([]);
    setInquiries([]);
  };

  // Helpers for inquiry CRUD
  const loadInquiryThread = useCallback(async (id: number) => {
    setInquiryThreadLoading(true);
    try {
      const data = await doFetch(`/api/admin/payroll/my-pay/inquiries/${id}`);
      setSelectedInquiry(data as InquiryThread);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg !== "step_up_required") setError("Failed to load inquiry thread.");
    } finally {
      setInquiryThreadLoading(false);
    }
  }, [doFetch]);

  const submitNewInquiry = useCallback(async () => {
    if (!inquirySubject.trim() || !inquiryBody.trim()) return;
    setInquirySubmitting(true);
    try {
      const auth = getAuth();
      const res = await fetch(`${API_BASE}/api/admin/payroll/my-pay/inquiries`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ city, subject: inquirySubject.trim(), body: inquiryBody.trim() }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        let d = t; try { d = (JSON.parse(t) as { detail?: string }).detail ?? t; } catch { /* ok */ }
        if (d === "step_up_required") { sessionStorage.removeItem("payroll_step_up"); setVerified(false); setStepUpToken(""); return; }
        throw new Error(d || `HTTP ${res.status}`);
      }
      void auth; // suppress unused-var
      setInquirySubject("");
      setInquiryBody("");
      setShowNewInquiry(false);
      const data = await doFetch(`/api/admin/payroll/my-pay/inquiries?city=${city}`);
      setInquiries(Array.isArray(data) ? (data as Inquiry[]) : []);
    } catch { /* error shown via tab error */ } finally {
      setInquirySubmitting(false);
    }
  }, [inquirySubject, inquiryBody, city, authHeaders, doFetch]);

  const submitInquiryReply = useCallback(async (inquiryId: number) => {
    if (!inquiryReplyBody.trim()) return;
    setInquiryReplySubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/payroll/my-pay/inquiries/${inquiryId}/reply`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ body: inquiryReplyBody.trim() }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        let d = t; try { d = (JSON.parse(t) as { detail?: string }).detail ?? t; } catch { /* ok */ }
        if (d === "step_up_required") { sessionStorage.removeItem("payroll_step_up"); setVerified(false); setStepUpToken(""); return; }
        throw new Error(d || `HTTP ${res.status}`);
      }
      setInquiryReplyBody("");
      await loadInquiryThread(inquiryId);
      const data = await doFetch(`/api/admin/payroll/my-pay/inquiries?city=${city}`);
      setInquiries(Array.isArray(data) ? (data as Inquiry[]) : []);
    } catch { /* ignore */ } finally {
      setInquiryReplySubmitting(false);
    }
  }, [inquiryReplyBody, authHeaders, loadInquiryThread, doFetch, city]);

  // Show gate if not verified
  if (!verified) {
    return <PasskeyGate onVerified={handleVerified} />;
  }

  const defaultCurrency = city === "dubai" ? "AED" : "PHP";

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "payslips", label: "Pay Slips", icon: <Receipt className="h-4 w-4" /> },
    { key: "adjustments", label: "Adjustments", icon: <TrendingUp className="h-4 w-4" /> },
    { key: "loans", label: "Loans", icon: <CreditCard className="h-4 w-4" /> },
    { key: "leave", label: "Leave Advance", icon: <Wallet className="h-4 w-4" /> },
    { key: "inquiries", label: "Inquiries", icon: <MessageCircle className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-6">

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-violet-400 mb-1">Self-Service</p>
            <h1 className={T_PAGE_TITLE}>My Pay</h1>
            {summary?.employee_id && (
              <p className="text-xs text-zinc-500 mt-1">
                Employee ID: <span className="font-mono text-zinc-300">{summary.employee_id}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Verified badge */}
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-400">Verified</span>
            </div>

            {/* City Toggle */}
            <div className="flex rounded-xl border border-white/10 bg-white/5 p-1 gap-1">
              {(["dubai", "manila"] as City[]).map((c) => (
                <button
                  key={c}
                  onClick={() => handleCityChange(c)}
                  className={city === c
                    ? "rounded-lg bg-violet-500/30 px-4 py-1.5 text-sm font-semibold text-violet-200 transition"
                    : "rounded-lg px-4 py-1.5 text-sm text-zinc-400 transition hover:text-zinc-200"}
                >
                  {c === "dubai" ? "🇦🇪 Dubai" : "🇵🇭 Manila"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-zinc-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading your pay data…
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* KPI Summary */}
        {!loading && summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className={KPI_CARD}>
              <div className="flex items-center gap-2 mb-2">
                <Banknote className="h-4 w-4 text-emerald-400" />
                <span className="text-xs text-zinc-400">Last Net Pay</span>
              </div>
              {summary.latest_payslip ? (
                <>
                  <p className="text-base font-bold text-emerald-400 leading-tight">
                    {fmt(summary.latest_payslip.net_pay, summary.latest_payslip.currency)}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">
                    {summary.latest_payslip.cycle_label}
                  </p>
                </>
              ) : (
                <p className="text-sm text-zinc-500">No records yet</p>
              )}
            </div>

            <div className={KPI_CARD}>
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="h-4 w-4 text-amber-400" />
                <span className="text-xs text-zinc-400">Loan Balance</span>
              </div>
              {summary.active_loans > 0 ? (
                <>
                  <p className="text-base font-bold text-amber-400 leading-tight">
                    {fmt(summary.total_loan_remaining, defaultCurrency)}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {summary.active_loans} active loan{summary.active_loans > 1 ? "s" : ""}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base font-bold text-zinc-500">—</p>
                  <p className="text-xs text-zinc-600 mt-0.5">No active loans</p>
                </>
              )}
            </div>

            <div className={KPI_CARD}>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-violet-400" />
                <span className="text-xs text-zinc-400">Pending Adj.</span>
              </div>
              <p className="text-base font-bold text-violet-300">{summary.pending_adjustments}</p>
              {summary.pending_adjustments > 0 && (
                <p className={`text-xs mt-0.5 font-medium ${summary.pending_adj_net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {summary.pending_adj_net >= 0 ? "+" : ""}
                  {fmt(summary.pending_adj_net, defaultCurrency)}
                </p>
              )}
            </div>

            <div className={KPI_CARD}>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-teal-400" />
                <span className="text-xs text-zinc-400">Last Pay Date</span>
              </div>
              <p className="text-sm font-semibold text-teal-300">
                {summary.latest_payslip?.pay_date ? fmtDate(summary.latest_payslip.pay_date) : "—"}
              </p>
            </div>
          </div>
        )}

        {/* Tab Bar */}
        {!loading && (
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 ${tab === t.key ? TAB_ACTIVE : TAB_INACTIVE}`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Tab Content */}
        {!loading && (
          <div className="relative min-h-[240px]">
            {tabLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
              </div>
            )}

            {/* ── Pay Slips ── */}
            {tab === "payslips" && !tabLoading && (
              <div className="space-y-3">
                {payslips.length === 0 ? (
                  <div className={`${GLASS_CARD} flex flex-col items-center justify-center py-16 text-center`}>
                    <Receipt className="h-10 w-10 text-zinc-600 mb-3" />
                    <p className="text-zinc-400 font-medium">No pay slips yet</p>
                    <p className="text-xs text-zinc-600 mt-1">Pay slips appear after your payroll cycle is closed</p>
                  </div>
                ) : (
                  payslips.map((slip) => (
                    <button
                      key={slip.id}
                      onClick={() => setSelectedSlip(slip)}
                      className={`${GLASS_CARD} w-full text-left p-4 hover:border-violet-500/30 transition group`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white text-sm">
                            {formatCycleLabel(slip.cycle_year, slip.cycle_month, slip.cycle_label)}
                          </p>
                          {slip.role_title && (
                            <p className="text-xs text-zinc-400 mt-0.5">{slip.role_title}</p>
                          )}
                          {slip.pay_date && (
                            <p className="text-xs text-zinc-500 mt-0.5">Paid: {fmtDate(slip.pay_date)}</p>
                          )}
                        </div>
                        <div className="text-right ml-4 shrink-0">
                          <p className="text-lg font-bold text-emerald-400">{fmt(slip.net_pay, slip.currency)}</p>
                          <p className="text-xs text-zinc-500">
                            {fmt(slip.basic_salary, slip.currency)} base
                            {slip.net_deductions > 0 && (
                              <span className="text-red-400"> · −{fmt(slip.net_deductions, slip.currency)}</span>
                            )}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-zinc-600 ml-3 group-hover:text-violet-400 transition shrink-0" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* ── Adjustments ── */}
            {tab === "adjustments" && !tabLoading && (
              <div className="space-y-3">
                {adjustments.length === 0 ? (
                  <div className={`${GLASS_CARD} flex flex-col items-center justify-center py-16 text-center`}>
                    <TrendingUp className="h-10 w-10 text-zinc-600 mb-3" />
                    <p className="text-zinc-400 font-medium">No adjustments on record</p>
                    <p className="text-xs text-zinc-600 mt-1">Bonuses, allowances, and deductions will appear here</p>
                  </div>
                ) : (
                  adjustments.map((adj) => {
                    const isPositive = adj.adj_type === "addition";
                    return (
                      <div key={adj.id} className={`${GLASS_CARD} p-4`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              {isPositive
                                ? <TrendingUp className="h-4 w-4 text-emerald-400 shrink-0" />
                                : <TrendingDown className="h-4 w-4 text-red-400 shrink-0" />}
                              <span className="text-sm font-medium text-white capitalize">
                                {adj.subtype || adj.adj_type}
                              </span>
                              {adj.cycle_label && (
                                <span className="text-xs text-zinc-500">· {adj.cycle_label}</span>
                              )}
                            </div>
                            <p className="text-xs text-zinc-400">{adj.note || "No note provided"}</p>
                            <p className="text-xs text-zinc-600 mt-1">
                              Added by {adj.created_by} · {fmtDate(adj.created_at)}
                            </p>
                          </div>
                          <p className={`text-base font-bold ml-4 shrink-0 ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                            {isPositive ? "+" : "−"}{fmt(adj.amount, defaultCurrency)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── Loans ── */}
            {tab === "loans" && !tabLoading && (
              <div className="space-y-3">
                {loans.length === 0 ? (
                  <div className={`${GLASS_CARD} flex flex-col items-center justify-center py-16 text-center`}>
                    <CreditCard className="h-10 w-10 text-zinc-600 mb-3" />
                    <p className="text-zinc-400 font-medium">No loan records</p>
                    <p className="text-xs text-zinc-600 mt-1">Your loans and repayment progress will appear here</p>
                  </div>
                ) : (
                  loans.map((loan) => <LoanCard key={loan.id} loan={loan} currency={defaultCurrency} />)
                )}
              </div>
            )}

            {/* ── Leave Advance ── */}
            {tab === "leave" && !tabLoading && (
              <div className="space-y-3">
                {leaveReqs.length === 0 ? (
                  <div className={`${GLASS_CARD} flex flex-col items-center justify-center py-16 text-center`}>
                    <Wallet className="h-10 w-10 text-zinc-600 mb-3" />
                    <p className="text-zinc-400 font-medium">No leave advance requests</p>
                    <p className="text-xs text-zinc-600 mt-1">Leave salary advance requests will appear here</p>
                  </div>
                ) : (
                  leaveReqs.map((req) => (
                    <div key={req.id} className={`${GLASS_CARD} p-4`}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {fmtDate(req.leave_start_date)} – {fmtDate(req.leave_end_date)}
                          </p>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            {req.leave_days} days · {req.purpose || "Leave advance"}
                          </p>
                        </div>
                        {leaveSalaryBadge(req.status)}
                      </div>

                      <div className="flex justify-between text-sm mt-3 pt-3 border-t border-white/10">
                        <div>
                          <p className="text-xs text-zinc-500">Daily Rate</p>
                          <p className="text-sm font-medium text-zinc-300">{fmt(req.daily_rate, req.currency)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-zinc-500">Advance Amount</p>
                          <p className="text-base font-bold text-teal-400">{fmt(req.advance_amount, req.currency)}</p>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap justify-between gap-1 text-xs text-zinc-600">
                        <span>Requested: {fmtDate(req.requested_at)}</span>
                        {req.paid_at
                          ? <span>Paid: {fmtDate(req.paid_at)} via {req.paid_via}</span>
                          : req.approved_at
                          ? <span>Approved: {fmtDate(req.approved_at)}</span>
                          : null}
                      </div>

                      {req.rejection_note && (
                        <div className="mt-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
                          Reason: {req.rejection_note}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Inquiries ── */}
            {tab === "inquiries" && !tabLoading && (
              <div className="space-y-3">
                {/* New Inquiry button */}
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowNewInquiry(true)}
                    className={`${PRIMARY_BUTTON} flex items-center gap-2 text-sm`}
                  >
                    <Plus className="h-4 w-4" />
                    New Inquiry
                  </button>
                </div>

                {inquiries.length === 0 ? (
                  <div className={`${GLASS_CARD} flex flex-col items-center justify-center py-16 text-center`}>
                    <MessageCircle className="h-10 w-10 text-zinc-600 mb-3" />
                    <p className="text-zinc-400 font-medium">No inquiries yet</p>
                    <p className="text-xs text-zinc-600 mt-1">Have a question about your pay? Send an inquiry to HQ.</p>
                  </div>
                ) : (
                  inquiries.map((inq) => (
                    <button
                      key={inq.id}
                      onClick={() => loadInquiryThread(inq.id)}
                      className={`${GLASS_CARD} w-full text-left p-4 hover:border-violet-500/30 transition group`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white text-sm truncate">{inq.subject}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{fmtDate(inq.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {inq.reply_count > 0 && (
                            <span className="text-xs text-zinc-500 flex items-center gap-1">
                              <MessageCircle className="h-3 w-3" />{inq.reply_count}
                            </span>
                          )}
                          {inq.status === "open" && <span className={BADGE_WARNING}>Open</span>}
                          {inq.status === "in_progress" && <span className={BADGE_INFO}>In Progress</span>}
                          {inq.status === "resolved" && <span className={BADGE_SUCCESS}>Resolved</span>}
                          <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-violet-400 transition" />
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payslip Modal */}
      {selectedSlip && (
        <PayslipModal
          slip={selectedSlip}
          stepUpToken={stepUpToken}
          onClose={() => setSelectedSlip(null)}
        />
      )}

      {/* New Inquiry Modal */}
      {showNewInquiry && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-violet-400" />
                New Pay Inquiry
              </h2>
              <button onClick={() => setShowNewInquiry(false)} className="rounded-full p-1.5 text-zinc-400 hover:bg-white/10 transition">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-500">Your inquiry will be reviewed by the payroll team and answered as soon as possible.</p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-400 mb-1 block">Subject</label>
                <input
                  value={inquirySubject}
                  onChange={(e) => setInquirySubject(e.target.value)}
                  placeholder="e.g. Question about my June deduction"
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 transition"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400 mb-1 block">Message</label>
                <textarea
                  value={inquiryBody}
                  onChange={(e) => setInquiryBody(e.target.value)}
                  rows={5}
                  placeholder="Describe your question or concern in detail…"
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 transition resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowNewInquiry(false)}
                className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-zinc-400 hover:bg-white/5 transition"
              >
                Cancel
              </button>
              <button
                onClick={submitNewInquiry}
                disabled={inquirySubmitting || !inquirySubject.trim() || !inquiryBody.trim()}
                className={`${PRIMARY_BUTTON} flex-1 flex items-center justify-center gap-2 text-sm disabled:opacity-50`}
              >
                {inquirySubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send Inquiry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inquiry Thread Modal */}
      {(selectedInquiry || inquiryThreadLoading) && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
            <button
              onClick={() => { setSelectedInquiry(null); setInquiryReplyBody(""); }}
              className="rounded-full p-1.5 text-zinc-400 hover:bg-white/10 transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white truncate">
                {selectedInquiry?.inquiry.subject ?? "Loading…"}
              </p>
              {selectedInquiry && (
                <p className="text-xs text-zinc-500">{fmtDate(selectedInquiry.inquiry.created_at)}</p>
              )}
            </div>
            {selectedInquiry && (
              <>
                {selectedInquiry.inquiry.status === "open" && <span className={BADGE_WARNING}>Open</span>}
                {selectedInquiry.inquiry.status === "in_progress" && <span className={BADGE_INFO}>In Progress</span>}
                {selectedInquiry.inquiry.status === "resolved" && <span className={BADGE_SUCCESS}>Resolved</span>}
              </>
            )}
          </div>

          {inquiryThreadLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : selectedInquiry ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Original inquiry */}
              <div className="flex flex-col items-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-violet-600/30 border border-violet-500/20 px-4 py-3">
                  <p className="text-sm text-white whitespace-pre-wrap">{selectedInquiry.inquiry.body}</p>
                </div>
                <p className="text-xs text-zinc-600 mt-1">You · {fmtDate(selectedInquiry.inquiry.created_at)}</p>
              </div>

              {/* Thread replies */}
              {selectedInquiry.replies.map((reply) => (
                <div key={reply.id} className={`flex flex-col ${reply.is_from_staff ? "items-end" : "items-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 border ${
                    reply.is_from_staff
                      ? "rounded-tr-sm bg-violet-600/30 border-violet-500/20"
                      : "rounded-tl-sm bg-white/5 border-white/10"
                  }`}>
                    {!reply.is_from_staff && (
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-400 mb-1">
                        HQ · {reply.sender_name}
                      </p>
                    )}
                    <p className="text-sm text-white whitespace-pre-wrap">{reply.body}</p>
                  </div>
                  <p className="text-xs text-zinc-600 mt-1">
                    {reply.is_from_staff ? "You" : reply.sender_name} · {fmtDate(reply.created_at)}
                  </p>
                </div>
              ))}

              {selectedInquiry.inquiry.status === "resolved" && (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  This inquiry has been resolved.
                </div>
              )}
            </div>
          ) : null}

          {/* Reply input (not shown if resolved) */}
          {selectedInquiry && selectedInquiry.inquiry.status !== "resolved" && (
            <div className="border-t border-white/10 px-4 py-3 flex gap-3 items-end">
              <textarea
                value={inquiryReplyBody}
                onChange={(e) => setInquiryReplyBody(e.target.value)}
                rows={2}
                placeholder="Type your follow-up message…"
                className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 transition resize-none"
              />
              <button
                onClick={() => submitInquiryReply(selectedInquiry.inquiry.id)}
                disabled={inquiryReplySubmitting || !inquiryReplyBody.trim()}
                className="rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 p-3 transition"
              >
                {inquiryReplySubmitting
                  ? <Loader2 className="h-4 w-4 animate-spin text-white" />
                  : <Send className="h-4 w-4 text-white" />}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
