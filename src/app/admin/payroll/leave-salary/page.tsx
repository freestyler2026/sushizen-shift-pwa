"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle, ArrowLeft, Banknote, CalendarDays, CheckCircle2,
  ChevronRight, Clock, Loader2, Plus, RefreshCw, XCircle,
} from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON, DANGER_BUTTON,
  KPI_CARD, KPI_LABEL, KPI_VALUE,
  TAB_CONTAINER, TAB_ACTIVE, TAB_INACTIVE,
  INPUT_CLASS, SELECT_CLASS, TEXTAREA_CLASS,
  TABLE_HEADER, TABLE_ROW, TABLE_CELL,
  T_PAGE_TITLE, T_SECTION, T_LABEL, T_BODY, T_CAPTION,
  BADGE_SUCCESS, BADGE_WARNING, BADGE_ERROR, BADGE_INFO,
} from "@/lib/ui-tokens";

// ── Types ────────────────────────────────────────────────────────────────────

type LeaveSalaryRequest = {
  id: string; city: string; staff_name: string;
  leave_start_date: string; leave_end_date: string; leave_days: number;
  currency: string; daily_rate: number; advance_amount: number;
  status: string; purpose: string;
  requested_by: string; requested_at: string;
  approved_by: string; approved_at: string | null;
  rejected_by: string; rejected_at: string | null; rejection_note: string;
  paid_by: string; paid_at: string | null; paid_via: string; reference_no: string;
  cycle_id: number | null; note: string; created_at: string;
};
type Cycle = { id: number; city: string; year: number; month: number; status: string };

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) : "—";

async function extractApiError(r: Response, fallback: string) {
  try { const j = await r.json(); return j?.detail || j?.message || fallback; } catch { return fallback; }
}

const STATUS_BADGE: Record<string, string> = {
  pending:   BADGE_WARNING,
  approved:  BADGE_INFO,
  paid:      BADGE_SUCCESS,
  rejected:  BADGE_ERROR,
  cancelled: "inline-flex items-center gap-1.5 rounded-full bg-zinc-500/15 border border-zinc-500/25 px-2.5 py-0.5 text-xs font-medium text-zinc-400",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", approved: "Approved", paid: "Paid",
  rejected: "Rejected", cancelled: "Cancelled",
};

// ── CreateModal ───────────────────────────────────────────────────────────────

function CreateModal({
  city, onClose, onCreated,
}: {
  city: string;
  onClose: () => void; onCreated: (r: LeaveSalaryRequest) => void;
}) {
  const auth = getAuth();
  const [staffName, setStaffName]         = useState("");
  const [startDate, setStartDate]         = useState("");
  const [endDate, setEndDate]             = useState("");
  const [leaveDays, setLeaveDays]         = useState(0);
  const [dailyRate, setDailyRate]         = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [currency, setCurrency]           = useState("AED");
  const [purpose, setPurpose]             = useState("");
  const [note, setNote]                   = useState("");
  const [fetchingRate, setFetchingRate]   = useState(false);
  const [rateErr, setRateErr]             = useState("");
  const [saving, setSaving]               = useState(false);
  const [err, setErr]                     = useState("");

  // Auto-calculate leave days from date range
  useEffect(() => {
    if (startDate && endDate) {
      const s = new Date(startDate), e = new Date(endDate);
      if (e >= s) {
        const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
        setLeaveDays(days);
      } else {
        setLeaveDays(0);
      }
    }
  }, [startDate, endDate]);

  // Auto-calculate advance amount
  useEffect(() => {
    const rate = parseFloat(dailyRate);
    if (rate > 0 && leaveDays > 0) {
      setAdvanceAmount((Math.round(rate * leaveDays * 100) / 100).toFixed(2));
    }
  }, [dailyRate, leaveDays]);

  async function fetchRate() {
    if (!auth || !staffName.trim()) { setRateErr("Enter staff name first"); return; }
    setFetchingRate(true); setRateErr("");
    try {
      const r = await fetch(
        `${API_BASE}/api/admin/payroll/leave-salary/daily-rate?city=${city}&staff_name=${encodeURIComponent(staffName.trim())}`,
        { headers: getAuthHeaders(auth) },
      );
      if (!r.ok) { setRateErr(await extractApiError(r, "Failed to fetch rate")); return; }
      const j = await r.json();
      if (!j.found) { setRateErr("Salary config not found — enter rate manually"); return; }
      setDailyRate(String(j.daily_rate));
      setCurrency(j.currency || "AED");
      setRateErr(`Monthly total: ${j.currency} ${fmt(j.monthly_total)} → ${fmt(j.daily_rate)}/day`);
    } catch {
      setRateErr("Network error — please try again");
    } finally { setFetchingRate(false); }
  }

  async function save() {
    if (!auth) return;
    if (!staffName.trim() || !startDate || !endDate || !leaveDays || !dailyRate || !advanceAmount) {
      setErr("Fill all required fields"); return;
    }
    if (leaveDays <= 0) { setErr("End date must be after start date"); return; }
    setSaving(true); setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/admin/payroll/leave-salary`, {
        method: "POST",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: JSON.stringify({
          city,
          staff_name: staffName.trim(),
          leave_start_date: startDate,
          leave_end_date: endDate,
          leave_days: leaveDays,
          daily_rate: parseFloat(dailyRate),
          advance_amount: parseFloat(advanceAmount),
          currency, purpose, note,
        }),
      });
      if (!r.ok) { setErr(await extractApiError(r, "Failed to create")); return; }
      const j = await r.json();
      onCreated(j.request);
    } catch {
      setErr("Network error — please try again");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`${GLASS_CARD} w-full max-w-lg space-y-4`}>
        <p className={T_SECTION}>New Leave Salary Request</p>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <p className={T_LABEL}>Staff Name *</p>
            <div className="flex gap-2 mt-1">
              <input className={`${INPUT_CLASS} flex-1`} value={staffName}
                onChange={e => setStaffName(e.target.value)}
                placeholder="e.g. Tanaka Yuki" />
              <button onClick={fetchRate} disabled={fetchingRate}
                className={`${SECONDARY_BUTTON} whitespace-nowrap`}>
                {fetchingRate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Fetch Rate"}
              </button>
            </div>
            {rateErr && (
              <p className={`mt-1 text-xs ${rateErr.startsWith("Monthly") ? "text-emerald-400" : "text-red-400"}`}>
                {rateErr}
              </p>
            )}
          </div>

          <div>
            <p className={T_LABEL}>Leave Start *</p>
            <input type="date" className={`${INPUT_CLASS} mt-1`} value={startDate}
              onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <p className={T_LABEL}>Leave End *</p>
            <input type="date" className={`${INPUT_CLASS} mt-1`} value={endDate}
              onChange={e => setEndDate(e.target.value)} />
          </div>

          <div>
            <p className={T_LABEL}>Leave Days</p>
            <div className={`${INPUT_CLASS} mt-1 text-violet-300`}>{leaveDays || "—"}</div>
          </div>
          <div>
            <p className={T_LABEL}>Currency</p>
            <select className={`${SELECT_CLASS} mt-1`} value={currency} onChange={e => setCurrency(e.target.value)}>
              <option value="AED">AED</option>
              <option value="PHP">PHP</option>
            </select>
          </div>

          <div>
            <p className={T_LABEL}>Daily Rate *</p>
            <input type="number" className={`${INPUT_CLASS} mt-1`} value={dailyRate}
              onChange={e => setDailyRate(e.target.value)} placeholder="0.00" step="0.01" min="0" />
          </div>
          <div>
            <p className={T_LABEL}>Advance Amount *</p>
            <input type="number" className={`${INPUT_CLASS} mt-1`} value={advanceAmount}
              onChange={e => setAdvanceAmount(e.target.value)} placeholder="0.00" step="0.01" min="0" />
          </div>

          <div className="col-span-2">
            <p className={T_LABEL}>Purpose</p>
            <input className={`${INPUT_CLASS} mt-1`} value={purpose}
              onChange={e => setPurpose(e.target.value)} placeholder="Annual leave, Ramadan leave…" />
          </div>
          <div className="col-span-2">
            <p className={T_LABEL}>Note</p>
            <textarea className={`${TEXTAREA_CLASS} mt-1`} rows={2} value={note}
              onChange={e => setNote(e.target.value)} placeholder="Optional internal note" />
          </div>
        </div>

        {leaveDays > 0 && dailyRate && (
          <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 px-4 py-3">
            <p className={T_CAPTION}>
              <span className="text-violet-300 font-semibold">
                {currency} {fmt(parseFloat(advanceAmount) || 0)}
              </span>
              {" "}advance for{" "}
              <span className="text-violet-300 font-semibold">{leaveDays} days</span>
              {" "}@ {currency} {fmt(parseFloat(dailyRate) || 0)}/day
            </p>
          </div>
        )}

        {err && <p className="text-sm text-red-400">{err}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className={SECONDARY_BUTTON}>Cancel</button>
          <button onClick={save} disabled={saving} className={PRIMARY_BUTTON}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Request"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DetailPanel ───────────────────────────────────────────────────────────────

function DetailPanel({
  req, cycles, onClose, onUpdated,
}: {
  req: LeaveSalaryRequest; cycles: Cycle[];
  onClose: () => void; onUpdated: (r: LeaveSalaryRequest) => void;
}) {
  const auth = getAuth();
  const [busy, setBusy]           = useState(false);
  const [err, setErr]             = useState("");
  const [showReject, setShowReject] = useState(false);
  const [showPay, setShowPay]     = useState(false);
  const [rejNote, setRejNote]     = useState("");
  const [payVia, setPayVia]       = useState("cash");
  const [payDate, setPayDate]     = useState(new Date().toISOString().slice(0,10));
  const [payRef, setPayRef]       = useState("");
  const [payCycleId, setPayCycleId] = useState<string>("");
  const [payNote, setPayNote]     = useState("");

  // Returns true on success so callers can conditionally close their form
  async function action(endpoint: string, body?: object): Promise<boolean> {
    if (!auth) return false;
    setBusy(true); setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/admin/payroll/leave-salary/${req.id}/${endpoint}`, {
        method: "POST",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!r.ok) { setErr(await extractApiError(r, `${endpoint} failed`)); return false; }
      const j = await r.json();
      onUpdated(j.request);
      return true;
    } catch {
      setErr("Network error — please try again");
      return false;
    } finally { setBusy(false); }
  }

  function approve() { void action("approve"); }
  function cancel()  { void action("cancel"); }
  // Only close the form if the action succeeded
  async function reject() {
    if (await action("reject", { rejection_note: rejNote })) setShowReject(false);
  }
  async function pay() {
    if (!payDate) { setErr("Payment date is required"); return; }
    if (await action("pay", {
      paid_via: payVia, paid_at: payDate, reference_no: payRef,
      cycle_id: payCycleId ? parseInt(payCycleId) : null, note: payNote,
    })) setShowPay(false);
  }

  const statusBadge = STATUS_BADGE[req.status] ?? BADGE_INFO;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative z-50 h-full w-full max-w-md overflow-y-auto ${GLASS_CARD} rounded-none border-l`}>
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <p className={T_SECTION}>Leave Salary Detail</p>
          <button onClick={onClose} className={SMALL_BUTTON}><XCircle className="h-4 w-4" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Status + employee */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={statusBadge}>{STATUS_LABEL[req.status] ?? req.status}</span>
              <span className={T_CAPTION}>{fmtDate(req.created_at)}</span>
            </div>
            <p className="text-lg font-semibold text-white">{req.staff_name}</p>
            <p className={T_CAPTION}>{req.city === "dubai" ? "Dubai 🇦🇪" : "Manila 🇵🇭"}</p>
          </div>

          {/* Leave period */}
          <div className={`${GLASS_CARD} space-y-2 !p-4`}>
            <div className="flex items-center gap-2 text-violet-300">
              <CalendarDays className="h-4 w-4" />
              <span className="text-sm font-medium">Leave Period</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className={T_CAPTION}>Start</p>
                <p className="text-white font-medium">{fmtDate(req.leave_start_date)}</p>
              </div>
              <div>
                <p className={T_CAPTION}>End</p>
                <p className="text-white font-medium">{fmtDate(req.leave_end_date)}</p>
              </div>
              <div>
                <p className={T_CAPTION}>Days</p>
                <p className="text-violet-300 font-bold text-base">{req.leave_days}</p>
              </div>
            </div>
          </div>

          {/* Amount breakdown */}
          <div className={`${GLASS_CARD} space-y-2 !p-4`}>
            <div className="flex items-center gap-2 text-emerald-300">
              <Banknote className="h-4 w-4" />
              <span className="text-sm font-medium">Advance Calculation</span>
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className={T_CAPTION}>Daily Rate</span>
                <span className="text-white font-medium">{req.currency} {fmt(req.daily_rate)}</span>
              </div>
              <div className="flex justify-between">
                <span className={T_CAPTION}>Leave Days</span>
                <span className="text-white font-medium">{req.leave_days}</span>
              </div>
              <div className="border-t border-white/8 pt-1.5 flex justify-between">
                <span className={T_CAPTION}>Advance Total</span>
                <span className="text-emerald-300 font-bold text-base">
                  {req.currency} {fmt(req.advance_amount)}
                </span>
              </div>
            </div>
          </div>

          {/* Purpose / Note */}
          {(req.purpose || req.note) && (
            <div className="space-y-1">
              {req.purpose && (
                <div>
                  <p className={T_CAPTION}>Purpose</p>
                  <p className="text-sm text-white mt-0.5">{req.purpose}</p>
                </div>
              )}
              {req.note && (
                <div>
                  <p className={T_CAPTION}>Note</p>
                  <p className="text-sm text-white mt-0.5">{req.note}</p>
                </div>
              )}
            </div>
          )}

          {/* Timeline */}
          <div className="space-y-2">
            <p className={T_LABEL}>Timeline</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex gap-2">
                <Clock className="h-3.5 w-3.5 text-zinc-400 mt-0.5" />
                <span className="text-zinc-300">
                  Requested by <span className="text-white">{req.requested_by || "—"}</span>
                  {" "}{fmtDate(req.requested_at)}
                </span>
              </div>
              {req.approved_at && (
                <div className="flex gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 mt-0.5" />
                  <span className="text-zinc-300">
                    Approved by <span className="text-white">{req.approved_by}</span>
                    {" "}{fmtDate(req.approved_at)}
                  </span>
                </div>
              )}
              {req.paid_at && (
                <div className="flex gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5" />
                  <span className="text-zinc-300">
                    Paid by <span className="text-white">{req.paid_by}</span>
                    {" "}via {req.paid_via}
                    {req.reference_no && <span> (Ref: {req.reference_no})</span>}
                    {" "}{fmtDate(req.paid_at)}
                  </span>
                </div>
              )}
              {req.rejected_at && (
                <div className="flex gap-2">
                  <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5" />
                  <span className="text-zinc-300">
                    Rejected by <span className="text-white">{req.rejected_by}</span>
                    {req.rejection_note && <span>: {req.rejection_note}</span>}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          {(req.status === "pending" || req.status === "approved") && (
            <div className="space-y-3 pt-1">
              <p className={T_LABEL}>Actions</p>

              {req.status === "pending" && !showReject && !showPay && (
                <div className="flex gap-2 flex-wrap">
                  <button onClick={approve} disabled={busy}
                    className={`${PRIMARY_BUTTON} flex-1`}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
                  </button>
                  <button onClick={() => setShowReject(true)} className={`${DANGER_BUTTON} flex-1`}>Reject</button>
                  <button onClick={cancel} disabled={busy} className={`${SECONDARY_BUTTON} flex-1`}>Cancel</button>
                </div>
              )}

              {req.status === "approved" && !showPay && !showReject && (
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setShowPay(true)}
                    className={`${PRIMARY_BUTTON} flex-1`}>
                    Mark as Paid
                  </button>
                  <button onClick={() => setShowReject(true)} className={`${DANGER_BUTTON} flex-1`}>Reject</button>
                  <button onClick={cancel} disabled={busy} className={`${SECONDARY_BUTTON} flex-1`}>Cancel</button>
                </div>
              )}

              {/* Reject form */}
              {showReject && (
                <div className="space-y-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                  <p className="text-sm font-medium text-red-300">Rejection Note</p>
                  <textarea className={TEXTAREA_CLASS} rows={2} value={rejNote}
                    onChange={e => setRejNote(e.target.value)} placeholder="Reason (optional)" />
                  <div className="flex gap-2">
                    <button onClick={() => void reject()} disabled={busy} className={`${DANGER_BUTTON} flex-1`}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Reject"}
                    </button>
                    <button onClick={() => setShowReject(false)} className={`${SECONDARY_BUTTON} flex-1`}>
                      Back
                    </button>
                  </div>
                </div>
              )}

              {/* Pay form */}
              {showPay && (
                <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <p className="text-sm font-medium text-emerald-300">Mark as Paid</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className={T_CAPTION}>Method</p>
                      <select className={`${SELECT_CLASS} mt-1`} value={payVia} onChange={e => setPayVia(e.target.value)}>
                        <option value="cash">Cash</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="bayzat">Bayzat</option>
                        <option value="check">Check</option>
                      </select>
                    </div>
                    <div>
                      <p className={T_CAPTION}>Payment Date *</p>
                      <input type="date" className={`${INPUT_CLASS} mt-1`} value={payDate}
                        onChange={e => setPayDate(e.target.value)} />
                    </div>
                    <div>
                      <p className={T_CAPTION}>Reference No.</p>
                      <input className={`${INPUT_CLASS} mt-1`} value={payRef}
                        onChange={e => setPayRef(e.target.value)} placeholder="Optional" />
                    </div>
                    <div>
                      <p className={T_CAPTION}>Payroll Cycle</p>
                      <select className={`${SELECT_CLASS} mt-1`} value={payCycleId} onChange={e => setPayCycleId(e.target.value)}>
                        <option value="">— None —</option>
                        {cycles.map(c => (
                          <option key={c.id} value={c.id}>
                            {MONTHS[c.month - 1]} {c.year}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <p className={T_CAPTION}>Note</p>
                      <input className={`${INPUT_CLASS} mt-1`} value={payNote}
                        onChange={e => setPayNote(e.target.value)} placeholder="Optional" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => void pay()} disabled={busy}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-sm font-medium text-white transition disabled:opacity-50">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Payment"}
                    </button>
                    <button onClick={() => setShowPay(false)} className={`${SECONDARY_BUTTON} flex-1`}>Back</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {err && (
            <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300">{err}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LeaveSalaryPage() {
  const router = useRouter();
  const auth = getAuth();
  const [city, setCity] = useState(
    typeof auth === "object" && auth !== null && "city" in auth
      ? String((auth as { city?: string }).city || "").toLowerCase() === "dubai" ? "dubai" : "manila"
      : "manila",
  );
  const [requests, setRequests] = useState<LeaveSalaryRequest[]>([]);
  const [cycles, setCycles]     = useState<Cycle[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState("");
  const [createModal, setCreateModal] = useState(false);
  const [selected, setSelected] = useState<LeaveSalaryRequest | null>(null);
  const loadRef = useRef(0);

  // Auth guard
  useEffect(() => {
    if (!auth) { router.replace("/"); return; }
    const role = String((auth as { role?: string }).role || "").toUpperCase();
    if (!["HQ","ADMIN","MANILA_MANAGEMENT","MANAGEMENT","HR_MANAGER"].includes(role)) {
      router.replace("/week");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load cycles for city
  useEffect(() => {
    if (!auth) return;
    void (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/admin/payroll/cycles?city=${city}`, {
          headers: getAuthHeaders(auth),
        });
        if (r.ok) { const j = await r.json(); setCycles(j.cycles || []); }
      } catch { /* cycles failure is non-critical */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  const loadRequests = useCallback(async () => {
    if (!auth) return;
    const token = ++loadRef.current;
    setLoading(true); setErr("");
    try {
      const r = await fetch(
        `${API_BASE}/api/admin/payroll/leave-salary?city=${city}&status=${statusFilter}`,
        { headers: getAuthHeaders(auth) },
      );
      if (token !== loadRef.current) return;
      if (r.ok) { const j = await r.json(); setRequests(j.requests || []); }
      else setErr(await extractApiError(r, "Failed to load"));
    } catch {
      if (token === loadRef.current) setErr("Network error — please try again");
    } finally { if (token === loadRef.current) setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, statusFilter]);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  function updateRequest(updated: LeaveSalaryRequest) {
    setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
    setSelected(updated);
  }

  const pendingCount  = requests.filter(r => r.status === "pending").length;
  const approvedCount = requests.filter(r => r.status === "approved").length;
  const totalPaid     = requests.filter(r => r.status === "paid").reduce((s, r) => s + r.advance_amount, 0);
  const currency      = city === "dubai" ? "AED" : "PHP";

  const filtered = statusFilter === "all" ? requests : requests.filter(r => r.status === statusFilter);
  // Reflect the currently-filtered view so Total KPI matches the visible rows
  const totalRequested = filtered.reduce((s, r) => s + r.advance_amount, 0);

  return (
    <div className="min-h-screen bg-[#0a0b0f] px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={T_PAGE_TITLE}>Leave Salary</p>
            <p className={`${T_BODY} mt-1`}>有給前払い申請・承認・支払い管理</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(["dubai","manila"] as const).map(c => (
              <button key={c} onClick={() => { setCity(c); setRequests([]); }}
                className={city === c ? TAB_ACTIVE : TAB_INACTIVE}>
                {c === "dubai" ? "Dubai 🇦🇪" : "Manila 🇵🇭"}
              </button>
            ))}
            <button onClick={() => router.back()} className={SECONDARY_BUTTON}>
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button onClick={() => void loadRequests()} disabled={loading} className={SECONDARY_BUTTON}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={() => setCreateModal(true)} className={PRIMARY_BUTTON}>
              <Plus className="h-4 w-4" />New Request
            </button>
          </div>
        </div>

        {err && (
          <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <p className="text-sm text-red-300">{err}</p>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>Total ({filtered.length})</p>
            <p className={KPI_VALUE}>{currency} {fmt(totalRequested)}</p>
          </div>
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>Pending</p>
            <p className={`${KPI_VALUE} text-amber-300`}>{pendingCount}</p>
          </div>
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>Approved</p>
            <p className={`${KPI_VALUE} text-blue-300`}>{approvedCount}</p>
          </div>
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>Paid Out</p>
            <p className={`${KPI_VALUE} text-emerald-300`}>{currency} {fmt(totalPaid)}</p>
          </div>
        </div>

        {/* Status tabs */}
        <div className={TAB_CONTAINER}>
          {[
            { k: "all",      label: "All" },
            { k: "pending",  label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ""}` },
            { k: "approved", label: `Approved${approvedCount > 0 ? ` (${approvedCount})` : ""}` },
            { k: "paid",     label: "Paid" },
            { k: "rejected", label: "Rejected" },
            { k: "cancelled",label: "Cancelled" },
          ].map(({ k, label }) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={statusFilter === k ? TAB_ACTIVE : TAB_INACTIVE}>
              {label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className={`${GLASS_CARD} !p-0 overflow-hidden`}>
          {loading && filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-zinc-500">
              <CalendarDays className="h-8 w-8" />
              <p className="text-sm">No leave salary requests</p>
              <button onClick={() => setCreateModal(true)}
                className={`${PRIMARY_BUTTON} mt-1`}>
                <Plus className="h-4 w-4" />Create First Request
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={TABLE_HEADER}>Employee</th>
                    <th className={TABLE_HEADER}>Leave Period</th>
                    <th className={TABLE_HEADER}>Days</th>
                    <th className={TABLE_HEADER}>Daily Rate</th>
                    <th className={TABLE_HEADER}>Advance</th>
                    <th className={TABLE_HEADER}>Status</th>
                    <th className={TABLE_HEADER}>Requested</th>
                    <th className={TABLE_HEADER}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(req => (
                    <tr key={req.id} className={TABLE_ROW}
                      onClick={() => setSelected(req)} style={{ cursor: "pointer" }}>
                      <td className={TABLE_CELL}>
                        <p className="font-medium text-white">{req.staff_name}</p>
                        {req.purpose && <p className={T_CAPTION}>{req.purpose}</p>}
                      </td>
                      <td className={TABLE_CELL}>
                        <p className="text-zinc-300 text-xs">
                          {fmtDate(req.leave_start_date)}
                        </p>
                        <p className="text-zinc-500 text-xs">→ {fmtDate(req.leave_end_date)}</p>
                      </td>
                      <td className={TABLE_CELL}>
                        <span className="font-semibold text-violet-300">{req.leave_days}</span>
                      </td>
                      <td className={TABLE_CELL}>
                        <span className="text-zinc-300">{req.currency} {fmt(req.daily_rate)}</span>
                      </td>
                      <td className={TABLE_CELL}>
                        <span className="font-semibold text-emerald-300">
                          {req.currency} {fmt(req.advance_amount)}
                        </span>
                      </td>
                      <td className={TABLE_CELL}>
                        <span className={STATUS_BADGE[req.status] ?? BADGE_INFO}>
                          {STATUS_LABEL[req.status] ?? req.status}
                        </span>
                      </td>
                      <td className={TABLE_CELL}>
                        <p className="text-xs text-zinc-400">{fmtDate(req.created_at)}</p>
                        <p className="text-xs text-zinc-500">{req.requested_by || "—"}</p>
                      </td>
                      <td className={TABLE_CELL}>
                        <ChevronRight className="h-4 w-4 text-zinc-500" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {createModal && (
        <CreateModal
          city={city}
          onClose={() => setCreateModal(false)}
          onCreated={r => { setRequests(prev => [r, ...prev]); setCreateModal(false); setSelected(r); }}
        />
      )}

      {selected && (
        <DetailPanel
          req={selected}
          cycles={cycles}
          onClose={() => setSelected(null)}
          onUpdated={updateRequest}
        />
      )}
    </div>
  );
}
