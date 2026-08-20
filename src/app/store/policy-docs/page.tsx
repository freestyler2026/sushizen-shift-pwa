"use client";

import {
  AlertCircle, BookOpen, CheckCircle2, Clock, Download,
  FileText, Loader2, Lock, X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getAuth } from "@/lib/auth";
import {
  BADGE_ERROR, BADGE_SUCCESS, BADGE_WARNING, GLASS_CARD,
  KPI_CARD, PRIMARY_BUTTON, T_PAGE_TITLE,
} from "@/lib/ui-tokens";

const API = "/api/store/policy-docs";

function apiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const headers: Record<string, string> = {};
  const method = (opts?.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") headers["Content-Type"] = "application/json";
  if (auth?.accessToken) headers["Authorization"] = `Bearer ${auth.accessToken}`;
  return fetch(path, { ...opts, headers: { ...headers, ...(opts?.headers as Record<string, string> ?? {}) } });
}

type PolicyDoc = {
  id: number;
  title: string;
  category: string;
  description: string;
  file_name: string;
  file_size: number;
  city: string;
  requires_acknowledgement: boolean;
  acknowledgement_deadline: string | null;
  effective_date: string | null;
  published_by: string;
  created_at: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
};

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function categoryColor(cat: string) {
  const map: Record<string, string> = {
    Policy: "text-violet-400 bg-violet-500/15 border-violet-500/25",
    Memo: "text-sky-400 bg-sky-500/15 border-sky-500/25",
    Announcement: "text-amber-400 bg-amber-500/15 border-amber-500/25",
    Guideline: "text-emerald-400 bg-emerald-500/15 border-emerald-500/25",
    SOP: "text-orange-400 bg-orange-500/15 border-orange-500/25",
  };
  return map[cat] ?? "text-zinc-400 bg-white/5 border-white/10";
}

// ── PIN Acknowledgement Modal ──────────────────────────────────────────────────
function AckModal({
  doc,
  staffName,
  onClose,
  onSuccess,
}: {
  doc: PolicyDoc;
  staffName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [step, setStep] = useState<"confirm" | "pin">("confirm");

  async function submit() {
    if (pin.length < 4) { setErr("Please enter your PIN"); return; }
    setBusy(true); setErr("");
    try {
      const r = await apiFetch(`${API}/${doc.id}/acknowledge`, {
        method: "POST",
        body: JSON.stringify({ staff_name: staffName, pin }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({})) as { detail?: string };
        setErr(e.detail ?? "Acknowledgement failed. Please try again.");
        return;
      }
      onSuccess();
      onClose();
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className={`${GLASS_CARD} w-full max-w-md p-6 space-y-5`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Lock size={18} className="text-violet-400" />
            {step === "confirm" ? "Acknowledge Document" : "Confirm with PIN"}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={18} /></button>
        </div>

        {step === "confirm" && (
          <>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-white">{doc.title}</p>
              {doc.description && <p className="text-xs text-zinc-400">{doc.description}</p>}
              {doc.acknowledgement_deadline && (
                <p className="text-xs text-amber-400 flex items-center gap-1">
                  <Clock size={11} /> Deadline: {fmtDate(doc.acknowledgement_deadline)}
                </p>
              )}
            </div>
            <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
              <p className="text-sm text-zinc-200 leading-relaxed">
                By proceeding, I confirm that I have <strong className="text-white">received and understood</strong> the above company policy/memo. My PIN will be used to verify this acknowledgement.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={onClose}
                className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-zinc-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={() => setStep("pin")}
                className={`flex-1 ${PRIMARY_BUTTON} flex items-center justify-center gap-2`}>
                <CheckCircle2 size={15} /> I Understand — Continue
              </button>
            </div>
          </>
        )}

        {step === "pin" && (
          <>
            <div className="space-y-2 text-center">
              <div className="w-14 h-14 rounded-full bg-violet-500/15 border border-violet-500/25 flex items-center justify-center mx-auto">
                <Lock size={22} className="text-violet-400" />
              </div>
              <p className="text-sm text-zinc-300">Enter your PIN to confirm</p>
              <p className="text-xs text-zinc-500">{staffName}</p>
            </div>

            {err && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-center">
                {err}
              </p>
            )}

            <input
              type="password"
              inputMode="numeric"
              maxLength={10}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={e => e.key === "Enter" && void submit()}
              placeholder="Enter PIN"
              autoFocus
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] text-white placeholder:text-zinc-700 placeholder:text-base placeholder:tracking-normal focus:border-violet-500/50 focus:outline-none"
            />

            <div className="flex gap-3">
              <button onClick={() => { setStep("confirm"); setErr(""); setPin(""); }}
                className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-zinc-400 hover:text-white transition-colors">
                Back
              </button>
              <button onClick={submit} disabled={busy || pin.length < 4}
                className={`flex-1 ${PRIMARY_BUTTON} flex items-center justify-center gap-2`}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                {busy ? "Confirming…" : "Confirm Acknowledgement"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function StaffPolicyDocsPage() {
  const auth = getAuth();
  const staffName = auth?.staffName ?? "";
  const city = auth?.city ?? "all";

  const [docs, setDocs] = useState<PolicyDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [ackingDoc, setAckingDoc] = useState<PolicyDoc | null>(null);
  const [previewDoc, setPreviewDoc] = useState<PolicyDoc | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!staffName) return;
    setLoading(true); setErr("");
    try {
      const r = await apiFetch(`${API}?staff_name=${encodeURIComponent(staffName)}&city=${city}`);
      if (!r.ok) { setErr("Failed to load documents"); return; }
      const d = await r.json() as { documents: PolicyDoc[] };
      setDocs(d.documents ?? []);
    } catch { setErr("Network error"); }
    finally { setLoading(false); }
  }, [staffName, city]);

  useEffect(() => { void load(); }, [load]);

  // Cleanup object URL on close
  useEffect(() => {
    if (!previewDoc) {
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    }
  }, [previewDoc, previewUrl]);

  async function openPreview(doc: PolicyDoc) {
    setPreviewDoc(doc);
    try {
      const r = await apiFetch(`${API}/${doc.id}/file`);
      const blob = await r.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      setPreviewUrl(null);
    }
  }

  function downloadFile(doc: PolicyDoc) {
    apiFetch(`${API}/${doc.id}/file`).then(async r => {
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = doc.file_name; a.click();
      URL.revokeObjectURL(url);
    });
  }

  const total = docs.length;
  const acknowledged = docs.filter(d => d.acknowledged).length;
  const pending = docs.filter(d => d.requires_acknowledgement && !d.acknowledged).length;
  const overdue = docs.filter(d =>
    d.requires_acknowledgement && !d.acknowledged &&
    d.acknowledgement_deadline && new Date(d.acknowledgement_deadline) < new Date()
  ).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-slate-900 to-zinc-950 p-6 space-y-6">
      {/* PDF preview modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
          <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-white/10">
            <span className="text-sm font-semibold text-white truncate max-w-[60%]">{previewDoc.title}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => downloadFile(previewDoc)}
                className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white border border-white/10 rounded-lg px-3 py-1.5">
                <Download size={12} /> Download
              </button>
              <button onClick={() => setPreviewDoc(null)} className="text-zinc-400 hover:text-white p-1.5">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            {previewUrl ? (
              <iframe src={previewUrl} className="w-full h-full border-0" title={previewDoc.title} />
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-400">
                <Loader2 size={24} className="animate-spin" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* PIN Ack Modal */}
      {ackingDoc && (
        <AckModal
          doc={ackingDoc}
          staffName={staffName}
          onClose={() => setAckingDoc(null)}
          onSuccess={() => { void load(); }}
        />
      )}

      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-1">Company Policies</p>
        <h1 className={T_PAGE_TITLE}>Policy Documents</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Review and acknowledge company policies, memos, and announcements
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={KPI_CARD}>
          <div className="text-2xl font-bold text-white">{total}</div>
          <div className="text-xs text-zinc-500 mt-0.5 uppercase tracking-wide">Documents</div>
        </div>
        <div className={KPI_CARD}>
          <div className="text-2xl font-bold text-emerald-400">{acknowledged}</div>
          <div className="text-xs text-zinc-500 mt-0.5 uppercase tracking-wide">Acknowledged</div>
        </div>
        <div className={KPI_CARD}>
          <div className={`text-2xl font-bold ${pending > 0 ? "text-amber-400" : "text-zinc-400"}`}>{pending}</div>
          <div className="text-xs text-zinc-500 mt-0.5 uppercase tracking-wide">Pending</div>
        </div>
        <div className={KPI_CARD}>
          <div className={`text-2xl font-bold ${overdue > 0 ? "text-red-400" : "text-zinc-400"}`}>{overdue}</div>
          <div className="text-xs text-zinc-500 mt-0.5 uppercase tracking-wide">Overdue</div>
        </div>
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}
      {loading && (
        <div className="flex items-center gap-2 text-zinc-400 text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      )}

      {/* Document list */}
      <div className="space-y-3">
        {docs.length === 0 && !loading && (
          <div className={`${GLASS_CARD} p-10 text-center`}>
            <BookOpen size={32} className="text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-500">No policy documents available.</p>
          </div>
        )}

        {docs.map(doc => {
          const isOverdue = doc.requires_acknowledgement && !doc.acknowledged &&
            doc.acknowledgement_deadline && new Date(doc.acknowledgement_deadline) < new Date();

          return (
            <div key={doc.id} className={`${GLASS_CARD} p-4 ${isOverdue ? "border-red-500/30" : ""}`}>
              <div className="flex items-start gap-3">
                {/* Status icon */}
                <div className="mt-0.5 flex-shrink-0">
                  {doc.acknowledged ? (
                    <CheckCircle2 size={20} className="text-emerald-400" />
                  ) : doc.requires_acknowledgement ? (
                    <AlertCircle size={20} className={isOverdue ? "text-red-400" : "text-amber-400"} />
                  ) : (
                    <FileText size={20} className="text-zinc-500" />
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  {/* Title row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{doc.title}</span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${categoryColor(doc.category)}`}>
                      {doc.category}
                    </span>
                    {doc.acknowledged && (
                      <span className={BADGE_SUCCESS}><CheckCircle2 size={10} /> Acknowledged {fmtDate(doc.acknowledged_at)}</span>
                    )}
                    {isOverdue && (
                      <span className={BADGE_ERROR}><AlertCircle size={10} /> Overdue</span>
                    )}
                    {doc.requires_acknowledgement && !doc.acknowledged && !isOverdue && (
                      <span className={BADGE_WARNING}><Clock size={10} /> Acknowledgement required</span>
                    )}
                  </div>

                  {doc.description && (
                    <p className="text-sm text-zinc-400">{doc.description}</p>
                  )}

                  {/* Meta */}
                  <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <FileText size={11} /> {doc.file_name} ({fmtSize(doc.file_size)})
                    </span>
                    {doc.effective_date && (
                      <span className="flex items-center gap-1">
                        <Clock size={11} /> Effective: {fmtDate(doc.effective_date)}
                      </span>
                    )}
                    {doc.acknowledgement_deadline && (
                      <span className={`flex items-center gap-1 ${isOverdue ? "text-red-400" : ""}`}>
                        <Clock size={11} /> Due: {fmtDate(doc.acknowledgement_deadline)}
                      </span>
                    )}
                    <span>By: {doc.published_by}</span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => void openPreview(doc)}
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:border-violet-400/30 hover:text-violet-200 transition-colors">
                      <FileText size={12} /> View PDF
                    </button>
                    <button
                      onClick={() => downloadFile(doc)}
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:border-violet-400/30 hover:text-violet-200 transition-colors">
                      <Download size={12} /> Download
                    </button>
                    {doc.requires_acknowledgement && !doc.acknowledged && (
                      <button
                        onClick={() => setAckingDoc(doc)}
                        className={`${PRIMARY_BUTTON} flex items-center gap-1.5 !px-3 !py-1.5 !text-xs`}>
                        <Lock size={12} /> Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
