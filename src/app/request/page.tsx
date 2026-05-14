// src/app/request/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle, Bell, BellRing, CalendarDays, CheckCircle2,
  ClipboardList, Clock, FileText, Loader2, RefreshCw,
  Send, XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/Field";
import DatePicker from "@/components/DatePicker";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES } from "@/lib/branches";
import {
  GLASS_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON, DANGER_BUTTON,
  INPUT_CLASS, SELECT_CLASS, TEXTAREA_CLASS,
  TAB_CONTAINER, TAB_ACTIVE, TAB_INACTIVE,
  BADGE_SUCCESS, BADGE_WARNING, BADGE_ERROR, BADGE_INFO, BADGE_ACCENT,
  T_PAGE_TITLE, T_SECTION, T_LABEL, T_CAPTION,
} from "@/lib/ui-tokens";

type Tab = "form" | "history" | "inbox";
type ReqType = "time_change" | "day_off" | "absence" | "swap" | "paid_leave" | "vacation" | "overtime_request" | "other";

const LEAVE_TYPES: { value: ReqType; label: string }[] = [
  { value: "time_change",      label: "Time Change" },
  { value: "day_off",          label: "Day Off" },
  { value: "absence",          label: "Absence" },
  { value: "paid_leave",       label: "Paid Leave" },
  { value: "vacation",         label: "Vacation" },
  { value: "overtime_request", label: "Overtime Request" },
  { value: "other",            label: "Other" },
  { value: "swap",             label: "Swap" },
];

type LeaveBalance = {
  id: number;
  leave_type: string;
  entitled_days: number;
  used_days: number;
  remaining_days: number;
};

type Notification = {
  id: string;
  sender_name: string;
  sender_city: string;
  notification_type: string;
  request_date: string;
  target_date: string;
  leave_type: string | null;
  leave_days: number | null;
  overtime_hours: number | null;
  reason: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
};

function todayIso() { return new Date().toISOString().slice(0, 10); }

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <span className={BADGE_SUCCESS}><CheckCircle2 size={11} />Approved</span>;
  if (status === "rejected") return <span className={BADGE_ERROR}><XCircle size={11} />Rejected</span>;
  return <span className={BADGE_WARNING}><Clock size={11} />Pending</span>;
}

function apiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const method = (opts?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  if (method !== "GET" && !(opts?.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (auth?.accessToken) headers["Authorization"] = `Bearer ${auth.accessToken}`;
  return fetch(path, { ...opts, headers: { ...headers, ...(opts?.headers as Record<string, string> ?? {}) } });
}

// ── Tab 2: History ─────────────────────────────────────────────────────────────

function HistoryTab({ staffName, city }: { staffName: string; city: string }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loadRef = useRef(0);

  const load = useCallback(async () => {
    if (!staffName || !city) return;
    const seq = ++loadRef.current;
    setLoading(true); setError("");
    try {
      const r = await apiFetch(`/api/request/notifications/history?staff_name=${encodeURIComponent(staffName)}&city=${encodeURIComponent(city)}&limit=50`);
      if (seq !== loadRef.current) return;
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json() as { items: Notification[] };
      setItems(d.items ?? []);
    } catch (e) {
      if (seq === loadRef.current) setError(String(e));
    } finally {
      if (seq === loadRef.current) setLoading(false);
    }
  }, [staffName, city]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className={T_SECTION}>My Request History</h2>
        <button onClick={load} className={SMALL_BUTTON + " flex items-center gap-1.5"}>
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-violet-400" />
        </div>
      ) : items.length === 0 ? (
        <div className={GLASS_CARD + " p-10 text-center"}>
          <ClipboardList size={36} className="mx-auto mb-3 text-zinc-600" />
          <p className="text-sm text-zinc-500">No requests submitted yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(n => (
            <div key={n.id} className={GLASS_CARD + " p-4"}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={BADGE_INFO + " capitalize"}>
                      {n.notification_type.replace(/_/g, " ")}
                    </span>
                    <StatusBadge status={n.status} />
                  </div>
                  <p className="mt-2 text-sm text-zinc-300">{n.reason}</p>
                  {n.leave_days != null && (
                    <p className={T_CAPTION + " mt-1"}>{n.leave_days} day(s) · {n.leave_type}</p>
                  )}
                  {n.overtime_hours != null && n.overtime_hours > 0 && (
                    <p className={T_CAPTION + " mt-1"}>{n.overtime_hours} OT hour(s)</p>
                  )}
                  {n.review_note && (
                    <p className={T_CAPTION + " mt-1 italic"}>Note: {n.review_note}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className={T_CAPTION}>{n.target_date}</p>
                  {n.reviewed_by && (
                    <p className={T_CAPTION + " mt-0.5"}>{n.reviewed_by}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Inbox ───────────────────────────────────────────────────────────────

function InboxTab({ city }: { city: string }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
  const loadRef = useRef(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const seq = ++loadRef.current;
    setLoading(true); setError("");
    try {
      const r = await apiFetch(`/api/request/notifications/inbox?city=${encodeURIComponent(city)}&status=pending&limit=100`);
      if (seq !== loadRef.current) return;
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json() as { items: Notification[] };
      setItems(d.items ?? []);
      setLastLoaded(new Date());
    } catch (e) {
      if (seq === loadRef.current) setError(String(e));
    } finally {
      if (seq === loadRef.current) setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    void load();
    pollingRef.current = setInterval(() => { void load(); }, 30_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [load]);

  async function review(id: string, action: "approved" | "rejected") {
    setReviewBusy(true);
    try {
      const auth = getAuth();
      const r = await apiFetch(`/api/request/notifications/${id}/review`, {
        method: "PATCH",
        body: JSON.stringify({
          status: action,
          review_note: reviewNote.trim(),
          reviewed_by: auth?.staffName ?? "manager",
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      setItems(prev => prev.filter(i => i.id !== id));
      setReviewingId(null);
      setReviewNote("");
    } catch (e) {
      setError(String(e));
    } finally {
      setReviewBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className={T_SECTION + " flex items-center gap-2"}>
            <BellRing size={18} className="text-amber-400" />
            Pending Inbox
            {items.length > 0 && (
              <span className={BADGE_WARNING}>{items.length}</span>
            )}
          </h2>
          {lastLoaded && (
            <p className={T_CAPTION + " mt-0.5"}>
              Updated {lastLoaded.toLocaleTimeString()} · auto-refresh every 30s
            </p>
          )}
        </div>
        <button onClick={load} className={SMALL_BUTTON + " flex items-center gap-1.5"}>
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-violet-400" />
        </div>
      ) : items.length === 0 ? (
        <div className={GLASS_CARD + " p-10 text-center"}>
          <Bell size={36} className="mx-auto mb-3 text-zinc-600" />
          <p className="text-sm text-zinc-500">No pending requests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(n => (
            <div key={n.id} className={GLASS_CARD + " p-4"}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white text-sm">{n.sender_name}</span>
                    <span className={BADGE_INFO + " capitalize"}>
                      {n.notification_type.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-zinc-300">{n.reason}</p>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-zinc-500">
                    <span>Date: {n.target_date}</span>
                    {n.leave_type && <span>Type: {n.leave_type}</span>}
                    {n.leave_days != null && <span>{n.leave_days} day(s)</span>}
                    {n.overtime_hours != null && <span>{n.overtime_hours} OT hr(s)</span>}
                    <span className="font-mono text-zinc-600">{String(n.id).slice(0, 8)}…</span>
                  </div>

                  {reviewingId === n.id ? (
                    <div className="mt-3 space-y-2">
                      <label className={T_LABEL}>Review note (optional)</label>
                      <textarea
                        className={TEXTAREA_CLASS}
                        rows={2}
                        value={reviewNote}
                        onChange={e => setReviewNote(e.target.value)}
                        placeholder="Add a note for the staff member…"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { void review(n.id, "approved"); }}
                          disabled={reviewBusy}
                          className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50 transition">
                          {reviewBusy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                          Approve
                        </button>
                        <button
                          onClick={() => { void review(n.id, "rejected"); }}
                          disabled={reviewBusy}
                          className={DANGER_BUTTON + " flex items-center gap-1.5 !px-3 !py-1.5 text-xs font-semibold"}>
                          <XCircle size={12} /> Reject
                        </button>
                        <button
                          onClick={() => { setReviewingId(null); setReviewNote(""); }}
                          className={SMALL_BUTTON}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setReviewingId(n.id)}
                      className={SMALL_BUTTON + " mt-2"}>
                      Review
                    </button>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className={T_CAPTION}>{new Date(n.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function RequestPage() {
  const router = useRouter();
  const [auth, setAuth] = useState(() => getAuth());
  const [activeTab, setActiveTab] = useState<Tab>("form");

  // Form state
  const [city, setCity] = useState<"dubai" | "manila">("manila");
  const [branch, setBranch] = useState("");
  const [staffName, setStaffName] = useState("");
  const [workDate, setWorkDate] = useState(todayIso());
  const [requestType, setRequestType] = useState<ReqType>("time_change");
  const [reason, setReason] = useState("");
  const [medicalDoc, setMedicalDoc] = useState(false);
  const [medicalDocumentFile, setMedicalDocumentFile] = useState<File | null>(null);
  const medicalFileInputRef = useRef<HTMLInputElement | null>(null);

  // Type-specific fields
  const [from, setFrom] = useState("9-16");
  const [to, setTo] = useState("10-18");
  const [withStaff, setWithStaff] = useState("");
  const [myTo, setMyTo] = useState("9-16");
  const [theirTo, setTheirTo] = useState("18-25");
  const [leaveDays, setLeaveDays] = useState("1");
  const [leaveSubType, setLeaveSubType] = useState("annual_leave");
  const [otHours, setOtHours] = useState("2");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);

  const MANAGER_ROLES = ["HQ", "ADMIN", "MANAGER", "DUBAI_MANAGEMENT", "MANILA_MANAGEMENT", "HR_MANAGER"];
  const canSubmitForOthers = MANAGER_ROLES.includes(auth?.role ?? "");
  const isInbox = canSubmitForOthers;

  // Auth refresh on focus
  useEffect(() => {
    const refresh = () => setAuth(getAuth());
    const onVisibility = () => { if (!document.hidden) refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!auth?.staffName || !auth?.accessToken) {
      router.replace("/login?next=%2Frequest");
      return;
    }
    if (auth.city) setCity(auth.city as "dubai" | "manila");
    if (auth.staffName) setStaffName(auth.staffName);
  }, [auth, router]);

  // Default branch
  useEffect(() => {
    const first = BRANCHES[city]?.[0]?.code ?? "";
    setBranch(first);
  }, [city]);

  // Fetch staff names
  useEffect(() => {
    const freshAuth = getAuth();
    if (!freshAuth?.accessToken) return;
    const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
    fetch(`${apiBase}/api/admin/staff_master/names?city=${encodeURIComponent(city)}&status=ACTIVE&limit=500`, {
      headers: { Authorization: `Bearer ${freshAuth.accessToken}` },
    })
      .then(r => r.json())
      .then((d: { names?: string[] }) => { if (Array.isArray(d.names)) setStaffNames(d.names); })
      .catch(() => setStaffNames([]));
  }, [city]);

  // Fetch leave balances
  useEffect(() => {
    const freshAuth = getAuth();
    if (!freshAuth?.accessToken || !staffName || !city) return;
    apiFetch(`/api/request/leave-balance?staff_name=${encodeURIComponent(staffName)}&city=${encodeURIComponent(city)}&year=${new Date().getFullYear()}`)
      .then(r => r.ok ? r.json() as Promise<{ balances: LeaveBalance[] }> : Promise.resolve({ balances: [] }))
      .then(d => setLeaveBalances(d.balances ?? []))
      .catch(() => setLeaveBalances([]));
  }, [staffName, city]);

  const branchOptions = BRANCHES[city] ?? [];

  const submit = async () => {
    setLoading(true); setError(""); setResult(null);
    try {
      let currentAuth = getAuth();
      if (!currentAuth?.accessToken) throw new Error("Please log in again.");
      if (!branch.trim()) throw new Error("Branch is required.");
      if (!workDate.trim()) throw new Error("Work date is required.");
      if (!reason.trim() || reason.trim().length < 5) throw new Error("Reason must be at least 5 characters.");
      if (requestType === "swap" && !withStaff.trim()) throw new Error("Counterparty staff name is required.");
      if (requestType === "swap" && (!myTo.trim() || !theirTo.trim())) throw new Error("Both swap time fields are required.");
      if (requestType === "time_change" && !to.trim()) throw new Error("Requested time is required.");
      if (medicalDoc && !medicalDocumentFile) throw new Error("Please attach your medical document file.");

      if (requestType === "overtime_request") {
        const r = await apiFetch("/api/request/notify", {
          method: "POST",
          body: JSON.stringify({
            sender_name: staffName,
            sender_city: city,
            notification_type: "overtime",
            target_date: workDate,
            overtime_hours: parseFloat(otHours) || 0,
            reason: reason.trim(),
          }),
        });
        if (!r.ok) throw new Error(await r.text());
        const d = await r.json() as Record<string, unknown>;
        setResult(d);
        setReason("");
        return;
      }

      const isLeaveType = ["paid_leave", "vacation", "absence", "day_off"].includes(requestType);
      if (isLeaveType) {
        await apiFetch("/api/request/notify", {
          method: "POST",
          body: JSON.stringify({
            sender_name: staffName,
            sender_city: city,
            notification_type: "leave",
            target_date: workDate,
            leave_type: leaveSubType,
            leave_days: parseFloat(leaveDays) || 1,
            reason: reason.trim(),
          }),
        }).catch(() => {});
      }

      let payload: Record<string, string> = {};
      if (requestType === "time_change") payload = { from, to };
      else if (requestType === "swap") payload = { with_staff: withStaff, my_to: myTo, their_to: theirTo };

      const form = new FormData();
      form.set("city", city);
      form.set("staff_name", staffName);
      form.set("work_date", workDate);
      form.set("request_type", requestType);
      form.set("reason", reason);
      form.set("branch", branch);
      form.set("medical_doc", String(medicalDoc));
      form.set("payload_json", JSON.stringify(payload));
      if (medicalDocumentFile) form.set("medical_document_file", medicalDocumentFile);

      const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
      let res = await fetch(`${apiBase}/api/shift_change/submit`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${currentAuth.accessToken}`,
          ...(currentAuth.stepUpToken ? { "X-Step-Up-Token": currentAuth.stepUpToken } : {}),
        },
        body: form,
      });
      if (res.status === 401) {
        const refreshed = await refreshAuthFromApi(currentAuth);
        if (refreshed?.accessToken && refreshed.accessToken !== currentAuth.accessToken) {
          currentAuth = refreshed;
          const form2 = new FormData();
          form.forEach((v, k) => form2.set(k, v));
          res = await fetch(`${apiBase}/api/shift_change/submit`, {
            method: "POST",
            headers: { Authorization: `Bearer ${currentAuth.accessToken}` },
            body: form2,
          });
        }
      }
      const text = await res.text();
      if (!res.ok) throw new Error(`Submit failed: ${res.status} ${text}`);
      setResult(JSON.parse(text) as Record<string, unknown>);
      setReason("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-3xl space-y-6 px-4 pb-12 pt-8">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className={T_PAGE_TITLE}>Request</h1>
            <p className="mt-1 text-sm text-zinc-400">Submit shift changes, leave, or overtime requests.</p>
          </div>
          {leaveBalances.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {leaveBalances.slice(0, 3).map(b => (
                <div key={b.id} className="rounded-xl border border-violet-500/20 bg-violet-500/10 px-3 py-1.5 text-xs">
                  <span className="text-violet-300 font-medium capitalize">{b.leave_type.replace(/_/g, " ")}</span>
                  <span className="ml-1.5 font-bold text-white">{b.remaining_days}</span>
                  <span className="text-zinc-500">/{b.entitled_days}d</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────────── */}
        <div className={TAB_CONTAINER}>
          <button
            className={activeTab === "form" ? TAB_ACTIVE : TAB_INACTIVE}
            onClick={() => setActiveTab("form")}>
            <FileText size={14} className="inline mr-1.5" />Form
          </button>
          <button
            className={activeTab === "history" ? TAB_ACTIVE : TAB_INACTIVE}
            onClick={() => setActiveTab("history")}>
            <ClipboardList size={14} className="inline mr-1.5" />My History
          </button>
          {isInbox && (
            <button
              className={activeTab === "inbox" ? TAB_ACTIVE : TAB_INACTIVE}
              onClick={() => setActiveTab("inbox")}>
              <BellRing size={14} className="inline mr-1.5" />Inbox
            </button>
          )}
        </div>

        {/* ── Tab content ─────────────────────────────────────────────── */}
        <div className={GLASS_CARD + " p-6"}>

          {/* ── Tab 1: Form ──────────────────────────────────────────── */}
          {activeTab === "form" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className={T_SECTION}>Request Form</h2>
                <span className={canSubmitForOthers ? BADGE_WARNING : BADGE_INFO}>
                  {canSubmitForOthers ? "Manager mode" : "Self submit"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="City">
                  <select className={SELECT_CLASS} value={city} onChange={e => setCity(e.target.value as "dubai" | "manila")}>
                    <option value="dubai">Dubai</option>
                    <option value="manila">Manila</option>
                  </select>
                </Field>
                <Field label="Branch">
                  <select className={SELECT_CLASS} value={branch} onChange={e => setBranch(e.target.value)}>
                    {branchOptions.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
                  </select>
                </Field>

                <Field label="Staff name" hint={canSubmitForOthers ? "Submit on behalf of staff" : "Locked to login"}>
                  {canSubmitForOthers && staffNames.length > 0 ? (
                    <select className={SELECT_CLASS} value={staffName} onChange={e => setStaffName(e.target.value)}>
                      <option value="">— Select —</option>
                      {staffNames.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  ) : (
                    <input className={INPUT_CLASS} value={staffName} readOnly={!canSubmitForOthers}
                      onChange={e => setStaffName(e.target.value)} />
                  )}
                </Field>
                <Field label="Work date">
                  <DatePicker value={workDate} onChange={setWorkDate} />
                </Field>

                <Field label="Request type">
                  <select className={SELECT_CLASS} value={requestType}
                    onChange={e => setRequestType(e.target.value as ReqType)}>
                    {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>

                {/* Type-specific extras */}
                {requestType === "time_change" && (
                  <>
                    <Field label="From (current)">
                      <input className={INPUT_CLASS} value={from} onChange={e => setFrom(e.target.value)} placeholder="e.g. 9-16" />
                    </Field>
                    <Field label="To (requested)">
                      <input className={INPUT_CLASS} value={to} onChange={e => setTo(e.target.value)} placeholder="e.g. 10-18" />
                    </Field>
                  </>
                )}

                {["paid_leave", "vacation", "absence", "day_off"].includes(requestType) && (
                  <>
                    <Field label="Leave sub-type">
                      <select className={SELECT_CLASS} value={leaveSubType} onChange={e => setLeaveSubType(e.target.value)}>
                        <option value="annual_leave">Annual Leave</option>
                        <option value="sick_leave">Sick Leave</option>
                        <option value="emergency_leave">Emergency Leave</option>
                        <option value="unpaid_leave">Unpaid Leave</option>
                        <option value="maternity_leave">Maternity Leave</option>
                        <option value="paternity_leave">Paternity Leave</option>
                        <option value="other">Other</option>
                      </select>
                    </Field>
                    <Field label="Days">
                      <input className={INPUT_CLASS} type="number" min="0.5" step="0.5" value={leaveDays}
                        onChange={e => setLeaveDays(e.target.value)} />
                    </Field>
                  </>
                )}

                {requestType === "overtime_request" && (
                  <Field label="Overtime hours">
                    <input className={INPUT_CLASS} type="number" min="0.5" step="0.5" value={otHours}
                      onChange={e => setOtHours(e.target.value)} placeholder="e.g. 2.5" />
                  </Field>
                )}

                {requestType === "swap" && (
                  <>
                    <Field label="Counterparty staff">
                      {staffNames.length > 0 ? (
                        <select className={SELECT_CLASS} value={withStaff} onChange={e => setWithStaff(e.target.value)}>
                          <option value="">— Select —</option>
                          {staffNames.filter(n => n !== staffName).map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      ) : (
                        <input className={INPUT_CLASS} value={withStaff} onChange={e => setWithStaff(e.target.value)} />
                      )}
                    </Field>
                    <div />
                    <Field label="My new time">
                      <input className={INPUT_CLASS} value={myTo} onChange={e => setMyTo(e.target.value)} />
                    </Field>
                    <Field label="Their new time">
                      <input className={INPUT_CLASS} value={theirTo} onChange={e => setTheirTo(e.target.value)} />
                    </Field>
                  </>
                )}

                <div className="col-span-2">
                  <label className={T_LABEL}>Reason</label>
                  <textarea className={TEXTAREA_CLASS + " mt-1"} rows={3} value={reason}
                    onChange={e => setReason(e.target.value)} placeholder="At least 5 characters…" />
                </div>

                {/* Medical doc */}
                {requestType !== "overtime_request" && (
                  <div className="col-span-2">
                    <label className={T_LABEL}>Medical document</label>
                    <div className="mt-1 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                      <input type="checkbox" checked={medicalDoc} onChange={e => setMedicalDoc(e.target.checked)}
                        className="h-4 w-4 accent-violet-500 rounded" />
                      <span className="text-sm text-zinc-300">I have a medical document</span>
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
                        ref={medicalFileInputRef}
                        onChange={e => setMedicalDocumentFile(e.target.files?.[0] ?? null)}
                        className="hidden" aria-hidden tabIndex={-1} />
                      {medicalDoc && (
                        <button type="button" onClick={() => medicalFileInputRef.current?.click()}
                          className={SMALL_BUTTON + " ml-auto"}>
                          {medicalDocumentFile ? medicalDocumentFile.name : "Choose file"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button onClick={() => { void submit(); }} disabled={loading}
                  className={PRIMARY_BUTTON + " flex items-center gap-2"}>
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {loading ? "Submitting…" : "Submit Request"}
                </button>
                <button type="button"
                  onClick={() => { setReason(""); setError(""); setResult(null); }}
                  className={SECONDARY_BUTTON}>
                  Clear
                </button>
              </div>

              {result && (
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 size={18} className="text-emerald-400" />
                    <span className="font-semibold text-emerald-400 text-sm">Request submitted</span>
                  </div>
                  {(result.request_id || result.ok) && (
                    <p className="text-xs text-emerald-400 font-mono">
                      {result.request_id ? `ID: ${String(result.request_id).slice(0, 8)}…` : "Notification sent."}
                    </p>
                  )}
                  {result.urgency_status && (
                    <p className="mt-1 text-xs text-emerald-400">
                      Urgency: <span className="font-semibold">{String(result.urgency_status)}</span>
                      {" · "}Days before: <span className="font-semibold">{String(result.days_before)}</span>
                    </p>
                  )}
                  <p className="mt-1 text-xs text-emerald-500">Your manager has been notified and will review shortly.</p>
                </div>
              )}
            </div>
          )}

          {/* ── Tab 2: History ───────────────────────────────────────── */}
          {activeTab === "history" && (
            <HistoryTab staffName={staffName} city={city} />
          )}

          {/* ── Tab 3: Inbox ─────────────────────────────────────────── */}
          {activeTab === "inbox" && isInbox && (
            <InboxTab city={city} />
          )}
        </div>
      </div>
    </div>
  );
}
