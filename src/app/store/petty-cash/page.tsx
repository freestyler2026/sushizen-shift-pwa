"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  RefreshCw,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import SelectDark from "@/components/SelectDark";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SELECT_CLASS,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
} from "@/lib/ui-tokens";

// ─── Constants ────────────────────────────────────────────────────────────────

const BRANCHES = [
  { code: "PAR",  label: "Paranaque" },
  { code: "CUB",  label: "Cubao" },
  { code: "TAFT", label: "Taft" },
];

const CATEGORIES = [
  "Cleaning Supplies",
  "Office Supplies",
  "Food & Beverages",
  "Maintenance & Repairs",
  "Transportation",
  "Utilities",
  "Other",
];

const CATEGORY_ICONS: Record<string, string> = {
  "Cleaning Supplies":   "🧹",
  "Office Supplies":     "📎",
  "Food & Beverages":    "🍱",
  "Maintenance & Repairs": "🔧",
  "Transportation":      "🚌",
  "Utilities":           "💡",
  "Other":               "📋",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type PettyCashRequest = {
  id: string;
  branch_code: string;
  requested_by: string;
  request_date: string;
  category: string;
  amount: number;
  purpose: string;
  photo_url: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  closed_by: string | null;
  closed_at: string | null;
  admin_notes: string | null;
  created_at: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  return `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric",
  });
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  PENDING:  { label: "Pending Approval", color: "border-amber-500/30 bg-amber-500/10 text-amber-300",   icon: "⏳" },
  APPROVED: { label: "Approved",          color: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", icon: "✓" },
  REJECTED: { label: "Rejected",          color: "border-red-500/30 bg-red-500/10 text-red-300",         icon: "✗" },
  CLOSED:   { label: "Closed",            color: "border-sky-500/30 bg-sky-500/10 text-sky-300",          icon: "⊙" },
};

// ─── Request Card ─────────────────────────────────────────────────────────────

function RequestCard({
  req: initialReq,
  onPhotoUploaded,
}: {
  req: PettyCashRequest;
  onPhotoUploaded: (updated: PettyCashRequest) => void;
}) {
  const [req, setReq]       = useState(initialReq);
  const [open, setOpen]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const meta = STATUS_META[req.status] ?? STATUS_META["PENDING"];

  const uploadPhoto = async (file: File) => {
    setUploading(true); setUploadMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const headers = getAuthHeaders();
      delete (headers as Record<string, string>)["Content-Type"];
      const r = await fetch(`/api/store/petty-cash/${req.id}/photo`, {
        method: "POST", headers, body: form,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Upload failed");
      const updated = { ...req, photo_url: d.photo_url };
      setReq(updated);
      onPhotoUploaded(updated);
      setUploadMsg({ ok: true, text: "Receipt photo attached ✓" });
    } catch (e: unknown) {
      setUploadMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={`rounded-2xl border bg-white/3 ${req.status === "PENDING" ? "border-amber-500/20" : req.status === "APPROVED" ? "border-emerald-500/15" : "border-white/8"}`}>
      {/* Header */}
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-white">
              {CATEGORY_ICONS[req.category] ?? "📋"} {req.category}
            </p>
            <p className={`${T_CAPTION} mt-0.5`}>
              {fmtDate(req.request_date)} · {BRANCHES.find((b) => b.code === req.branch_code)?.label ?? req.branch_code}
            </p>
            {req.purpose && (
              <p className="text-xs text-white/40 mt-0.5 truncate max-w-[200px]">{req.purpose}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.color}`}>
              {meta.icon} {meta.label}
            </span>
            <span className="text-sm font-bold text-white">{fmtCurrency(req.amount)}</span>
            {req.photo_url
              ? <span className="text-[10px] text-sky-400">📎 Receipt</span>
              : req.status === "APPROVED"
                ? <span className="text-[10px] text-amber-400">No receipt yet</span>
                : null
            }
            {open ? <ChevronUp size={13} className="text-white/40" /> : <ChevronDown size={13} className="text-white/40" />}
          </div>
        </div>
      </button>

      {/* Detail */}
      {open && (
        <div className="border-t border-white/6 px-4 pb-4 pt-3 space-y-3">
          {req.rejection_reason && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
              ✗ Rejected: {req.rejection_reason}
            </p>
          )}
          {req.admin_notes && (
            <p className="rounded-lg bg-white/4 px-3 py-2 text-xs text-white/50">
              📝 {req.admin_notes}
            </p>
          )}

          {/* Receipt photo */}
          {req.photo_url && (
            <a href={req.photo_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-sky-500/25 bg-sky-500/8 px-3 py-2 text-xs text-sky-400 hover:bg-sky-500/15">
              📎 View Receipt Photo
            </a>
          )}

          {/* Photo upload if no photo yet and not rejected/closed */}
          {!req.photo_url && req.status !== "REJECTED" && req.status !== "CLOSED" && (
            <div>
              <p className={`${T_LABEL} mb-1`}>Attach Receipt Photo</p>
              <input ref={fileRef} type="file" accept="image/*" capture="environment"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} />
              <button type="button" onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/60 hover:text-white disabled:opacity-50">
                {uploading
                  ? <RefreshCw size={12} className="animate-spin" />
                  : <UploadCloud size={12} />}
                {uploading ? "Uploading…" : "Choose Photo"}
              </button>
              {uploadMsg && (
                <p className={`mt-1.5 text-xs ${uploadMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
                  {uploadMsg.text}
                </p>
              )}
            </div>
          )}

          {/* Status info */}
          {req.approved_by && (
            <p className={T_CAPTION}>✓ Approved by {req.approved_by} · {fmtTime(req.approved_at)}</p>
          )}
          {req.rejected_by && (
            <p className={T_CAPTION}>✗ Rejected by {req.rejected_by} · {fmtTime(req.rejected_at)}</p>
          )}
          {req.closed_by && (
            <p className={T_CAPTION}>⊙ Closed by {req.closed_by} · {fmtTime(req.closed_at)}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PettyCashPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getAuth()) router.replace("/login");
  }, [router]);

  const auth = getAuth();

  // Form state
  const [branch, setBranch]       = useState(BRANCHES[0].code);
  const [staffName, setStaffName] = useState(auth?.staffName || "");
  const [category, setCategory]   = useState(CATEGORIES[0]);
  const [amount, setAmount]       = useState("");
  const [purpose, setPurpose]     = useState("");
  const [file, setFile]           = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg]   = useState<{ ok: boolean; text: string } | null>(null);

  // My requests
  const [myRequests, setMyRequests]     = useState<PettyCashRequest[]>([]);
  const [loadingList, setLoadingList]   = useState(false);
  const [listError, setListError]       = useState<string | null>(null);

  // Use a ref so loadMyRequests stays stable (no excessive re-fetches while typing)
  const staffNameRef = useRef(staffName);
  staffNameRef.current = staffName;

  const loadMyRequests = useCallback(async () => {
    const name = staffNameRef.current.trim();
    if (!name) return;
    setLoadingList(true);
    setListError(null);
    try {
      const r = await fetch(
        `/api/store/petty-cash/my-requests?city=manila&requested_by=${encodeURIComponent(name)}`,
        { headers: getAuthHeaders(), cache: "no-store" }
      );
      const d = await r.json();
      if (r.ok) {
        setMyRequests(d.requests ?? []);
      } else {
        setListError(d.detail || "Failed to load requests");
      }
    } catch {
      setListError("Network error. Please refresh.");
    } finally {
      setLoadingList(false);
    }
  }, []); // stable — reads staffName via ref

  useEffect(() => { loadMyRequests(); }, [loadMyRequests]);

  const submitRequest = async () => {
    if (!staffName.trim()) { setSubmitMsg({ ok: false, text: "Enter your name" }); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setSubmitMsg({ ok: false, text: "Enter a valid amount" }); return; }
    if (amt > 10000) { setSubmitMsg({ ok: false, text: "Maximum is ₱10,000" }); return; }

    setSubmitting(true); setSubmitMsg(null);
    try {
      const form = new FormData();
      form.append("city",         "manila");
      form.append("branch_code",  branch);
      form.append("requested_by", staffName.trim());
      form.append("category",     category);
      form.append("amount",       String(amt));
      form.append("purpose",      purpose);
      if (file) form.append("file", file);

      const headers = getAuthHeaders();
      delete (headers as Record<string, string>)["Content-Type"];

      const r = await fetch("/api/store/petty-cash/request", {
        method: "POST", headers, body: form, cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Request failed");
      const text = d.warning
        ? `Request submitted, but photo upload failed: ${d.warning}`
        : "Request submitted! Waiting for approval.";
      setSubmitMsg({ ok: !d.warning, text });
      setAmount(""); setPurpose(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      loadMyRequests();
    } catch (e: unknown) {
      setSubmitMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const updateRequest = (updated: PettyCashRequest) => {
    setMyRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const pendingCount  = myRequests.filter((r) => r.status === "PENDING").length;
  const approvedCount = myRequests.filter((r) => r.status === "APPROVED").length;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
      <div className="mx-auto max-w-lg space-y-5">

        {/* Header */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-1">STORE · MANILA</p>
          <h1 className={T_PAGE_TITLE}>Petty Cash</h1>
          <p className="text-sm text-white/40 mt-1">Submit expense requests with receipts</p>
        </div>

        {/* New Request Form */}
        <div className={GLASS_CARD + " space-y-4"}>
          <p className="text-xs font-semibold uppercase tracking-widest text-white/40">New Request</p>

          {/* Name + Branch */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Your Name</label>
              <input type="text" className={SELECT_CLASS} placeholder="Full name"
                value={staffName} onChange={(e) => setStaffName(e.target.value)} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Branch</label>
              <SelectDark
                className={SELECT_CLASS}
                value={branch}
                onChange={setBranch}
                options={BRANCHES.map((b) => ({ value: b.code, label: b.label }))}
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button key={cat} type="button" onClick={() => setCategory(cat)}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                    category === cat
                      ? "border-violet-500/40 bg-violet-500/20 text-violet-300"
                      : "border-white/10 bg-white/4 text-white/50 hover:text-white"
                  }`}>
                  {CATEGORY_ICONS[cat]} {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Amount + Purpose */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Amount (PHP)</label>
              <input type="number" min="1" max="10000" step="1"
                className={SELECT_CLASS} placeholder="0.00"
                value={amount} onChange={(e) => setAmount(e.target.value)} />
              <p className={`${T_CAPTION} mt-1`}>Max ₱10,000</p>
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Purpose / Details</label>
              <input type="text" className={SELECT_CLASS} placeholder="What was purchased?"
                value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            </div>
          </div>

          {/* Receipt photo */}
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Receipt Photo (optional)</label>
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept="image/*" capture="environment"
                className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/60 hover:text-white">
                <UploadCloud size={13} /> {file ? file.name : "Choose photo"}
              </button>
              {file && (
                <button type="button"
                  onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                  className="text-xs text-red-400 hover:text-red-300">✕ Remove</button>
              )}
            </div>
            <p className={`${T_CAPTION} mt-1`}>You can also attach it later after approval</p>
          </div>

          {submitMsg && (
            <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
              submitMsg.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}>
              {submitMsg.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              {submitMsg.text}
            </div>
          )}

          <button onClick={submitRequest} disabled={submitting}
            className={`${PRIMARY_BUTTON} w-full`}>
            {submitting ? <RefreshCw size={14} className="animate-spin mx-auto" /> : "Submit Request"}
          </button>
        </div>

        {/* My Requests */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
              My Requests
              {pendingCount > 0 && (
                <span className="ml-2 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                  {pendingCount}
                </span>
              )}
              {approvedCount > 0 && (
                <span className="ml-1 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold text-white">
                  {approvedCount}
                </span>
              )}
            </p>
            <button onClick={loadMyRequests} disabled={loadingList}
              className="flex items-center gap-1 text-xs text-white/40 hover:text-white">
              <RefreshCw size={11} className={loadingList ? "animate-spin" : ""} /> Refresh
            </button>
          </div>

          {loadingList && (
            <div className="flex justify-center py-6">
              <RefreshCw size={18} className="animate-spin text-white/30" />
            </div>
          )}
          {listError && !loadingList && (
            <p className="text-center text-sm text-red-400 py-4">{listError}</p>
          )}
          {!loadingList && !listError && myRequests.length === 0 && (
            <p className="text-center text-sm text-white/30 py-6">No requests yet.</p>
          )}
          <div className="space-y-3">
            {myRequests.map((r) => (
              <RequestCard key={r.id} req={r} onPhotoUploaded={updateRequest} />
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}
