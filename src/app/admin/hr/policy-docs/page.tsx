"use client";

import {
  AlertCircle, Archive, BookOpen, Calendar, CheckCircle2,
  ChevronDown, ChevronRight, Clock, Download, FileText,
  Loader2, Plus, RefreshCw, Trash2, Upload, Users, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAuth } from "@/lib/auth";
import {
  BADGE_ERROR, BADGE_SUCCESS, BADGE_WARNING, GLASS_CARD,
  KPI_CARD, PRIMARY_BUTTON, T_PAGE_TITLE, TAB_ACTIVE, TAB_INACTIVE,
} from "@/lib/ui-tokens";

const API = "/api/admin/hr/policy-docs";

function apiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const headers: Record<string, string> = {};
  const method = (opts?.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && !(opts?.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
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
  is_active: boolean;
  created_at: string;
  acknowledged_count: number;
};

type AckEntry = { staff_name: string; acknowledged_at: string };
type AckReport = {
  document_id: number;
  title: string;
  acknowledged: AckEntry[];
  acknowledged_count: number;
  acknowledgement_deadline: string | null;
};

const CATEGORIES = ["Policy", "Memo", "Announcement", "Guideline", "SOP"];
const CITIES = ["all", "manila", "dubai"];

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Upload Modal ───────────────────────────────────────────────────────────────
function UploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const auth = getAuth();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Policy");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("all");
  const [requiresAck, setRequiresAck] = useState(true);
  const [deadline, setDeadline] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!title.trim()) { setErr("Title is required"); return; }
    if (!file) { setErr("Please select a PDF file"); return; }
    if (file.size > 10 * 1024 * 1024) { setErr("File too large (max 10 MB)"); return; }
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("category", category);
      fd.append("description", description);
      fd.append("city", city);
      fd.append("requires_acknowledgement", String(requiresAck));
      fd.append("acknowledgement_deadline", deadline);
      fd.append("effective_date", effectiveDate);
      fd.append("published_by", auth?.staffName ?? "");
      fd.append("file", file);
      const r = await apiFetch(API, { method: "POST", body: fd });
      if (!r.ok) {
        const e = await r.json().catch(() => ({})) as { detail?: string };
        setErr(e.detail ?? "Upload failed");
        return;
      }
      onSuccess();
      onClose();
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`${GLASS_CARD} w-full max-w-lg p-6 space-y-4`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Upload size={18} className="text-violet-400" /> Upload Policy Document
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={18} /></button>
        </div>

        {err && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}

        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Leave Policy 2026"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Target City</label>
              <select value={city} onChange={e => setCity(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white">
                <option value="all">All Cities</option>
                <option value="manila">Manila</option>
                <option value="dubai">Dubai</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="Brief summary of this document…"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Effective Date</label>
              <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-violet-500/50 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block flex items-center gap-1">
                Acknowledgement Deadline
              </label>
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                disabled={!requiresAck}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-violet-500/50 focus:outline-none disabled:opacity-40" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={requiresAck} onChange={e => setRequiresAck(e.target.checked)}
              className="rounded" />
            <span className="text-sm text-zinc-300">Require staff acknowledgement (PIN confirmation)</span>
          </label>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">PDF File * (max 10 MB)</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-3 rounded-lg border border-dashed border-white/20 bg-white/3 px-4 py-3 cursor-pointer hover:border-violet-500/40 hover:bg-violet-500/5 transition-colors">
              <FileText size={18} className="text-zinc-500" />
              <span className="text-sm text-zinc-400">
                {file ? <span className="text-white">{file.name} ({fmtSize(file.size)})</span> : "Click to select PDF"}
              </span>
            </div>
            <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-zinc-400 hover:text-white transition-colors">Cancel</button>
          <button onClick={submit} disabled={busy} className={`flex-1 ${PRIMARY_BUTTON} flex items-center justify-center gap-2`}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {busy ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Ack Report Panel ───────────────────────────────────────────────────────────
function AckReportPanel({ doc, onClose }: { doc: PolicyDoc; onClose: () => void }) {
  const [report, setReport] = useState<AckReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`${API}/${doc.id}/acknowledgements`)
      .then(r => r.json())
      .then(d => setReport(d as AckReport))
      .finally(() => setLoading(false));
  }, [doc.id]);

  const ackedNames = new Set((report?.acknowledged ?? []).map(a => a.staff_name));
  const total = report?.acknowledged_count ?? 0;

  return (
    <div className={`${GLASS_CARD} p-5 space-y-4`}>
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Users size={16} className="text-violet-400" /> Acknowledgement Report
        </h3>
        <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={16} /></button>
      </div>
      <p className="text-sm text-zinc-300 font-medium truncate">{doc.title}</p>

      {loading && <div className="flex items-center gap-2 text-zinc-400 text-sm"><Loader2 size={14} className="animate-spin" /> Loading…</div>}

      {report && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <span className={BADGE_SUCCESS}><CheckCircle2 size={11} /> {total} Acknowledged</span>
            {doc.acknowledgement_deadline && (
              <span className={BADGE_WARNING}><Clock size={11} /> Deadline: {fmtDate(doc.acknowledgement_deadline)}</span>
            )}
          </div>

          {total === 0 ? (
            <p className="text-sm text-zinc-500 italic">No acknowledgements yet.</p>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-1">
              {report.acknowledged.map(a => (
                <div key={a.staff_name} className="flex items-center justify-between rounded-lg bg-white/4 px-3 py-2 text-sm">
                  <span className="text-white flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-emerald-400 flex-shrink-0" />
                    {a.staff_name}
                  </span>
                  <span className="text-zinc-500 text-xs">{fmtDate(a.acknowledged_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function PolicyDocsAdminPage() {
  const [docs, setDocs] = useState<PolicyDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [cityFilter, setCityFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [ackDoc, setAckDoc] = useState<PolicyDoc | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await apiFetch(`${API}?city=${cityFilter}&include_inactive=${showInactive}`);
      if (!r.ok) { setErr("Failed to load documents"); return; }
      const d = await r.json() as { documents: PolicyDoc[] };
      setDocs(d.documents ?? []);
    } catch { setErr("Network error"); }
    finally { setLoading(false); }
  }, [cityFilter, showInactive]);

  useEffect(() => { void load(); }, [load]);

  async function toggleActive(doc: PolicyDoc) {
    await apiFetch(`${API}/${doc.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: !doc.is_active }),
    });
    void load();
  }

  async function deleteDoc(doc: PolicyDoc) {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    await apiFetch(`${API}/${doc.id}`, { method: "DELETE" });
    void load();
  }

  function saveBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadFile(doc: PolicyDoc) {
    const r = await apiFetch(`${API}/${doc.id}/file`);
    if (!r.ok) return;
    saveBlob(await r.blob(), doc.file_name);
  }

  const filtered = docs.filter(d =>
    (!catFilter || d.category === catFilter)
  );

  const activeCount = docs.filter(d => d.is_active).length;
  const totalAcked = docs.reduce((s, d) => s + d.acknowledged_count, 0);
  const overdue = docs.filter(d => d.acknowledgement_deadline && new Date(d.acknowledgement_deadline) < new Date() && d.is_active).length;

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-slate-900 to-zinc-950 p-6 space-y-6">
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={() => void load()}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-1">HR Admin</p>
          <h1 className={T_PAGE_TITLE}>Policy Documents</h1>
          <p className="text-sm text-zinc-400 mt-1">Upload and manage company policies, memos, and announcements</p>
        </div>
        <button onClick={() => setShowUpload(true)} className={`${PRIMARY_BUTTON} flex items-center gap-2`}>
          <Plus size={16} /> Upload Document
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={KPI_CARD}>
          <div className="text-2xl font-bold text-white">{activeCount}</div>
          <div className="text-xs text-zinc-500 mt-0.5 uppercase tracking-wide">Active Docs</div>
        </div>
        <div className={KPI_CARD}>
          <div className="text-2xl font-bold text-emerald-400">{totalAcked}</div>
          <div className="text-xs text-zinc-500 mt-0.5 uppercase tracking-wide">Total Acks</div>
        </div>
        <div className={KPI_CARD}>
          <div className={`text-2xl font-bold ${overdue > 0 ? "text-red-400" : "text-zinc-400"}`}>{overdue}</div>
          <div className="text-xs text-zinc-500 mt-0.5 uppercase tracking-wide">Overdue</div>
        </div>
        <div className={KPI_CARD}>
          <div className="text-2xl font-bold text-zinc-400">{docs.length}</div>
          <div className="text-xs text-zinc-500 mt-0.5 uppercase tracking-wide">Total Docs</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select value={cityFilter} onChange={e => setCityFilter(e.target.value)}
          className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-sm text-white">
          <option value="all">All Cities</option>
          <option value="manila">Manila</option>
          <option value="dubai">Dubai</option>
        </select>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-sm text-white">
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
          Show Archived
        </label>
        <button onClick={() => void load()} className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300">
          <RefreshCw size={12} /> Refresh
        </button>
        <span className="text-xs text-zinc-600">{filtered.length} document{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      {loading && (
        <div className="flex items-center gap-2 text-zinc-400 text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      )}

      {/* Document list */}
      <div className="space-y-3">
        {filtered.length === 0 && !loading && (
          <div className={`${GLASS_CARD} p-10 text-center`}>
            <BookOpen size={32} className="text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-500">No documents yet. Upload your first policy document.</p>
          </div>
        )}

        {filtered.map(doc => {
          const isExpanded = expandedId === doc.id;
          const isOverdue = doc.acknowledgement_deadline && new Date(doc.acknowledgement_deadline) < new Date();
          return (
            <div key={doc.id} className={`${GLASS_CARD} overflow-hidden ${!doc.is_active ? "opacity-60" : ""}`}>
              {/* Main row */}
              <div
                className="flex items-start gap-4 p-4 cursor-pointer hover:bg-white/3 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : doc.id)}>
                <div className="mt-0.5">
                  {isExpanded ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
                </div>
                <FileText size={18} className="text-violet-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-semibold text-white">{doc.title}</span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${categoryColor(doc.category)}`}>
                      {doc.category}
                    </span>
                    {!doc.is_active && <span className={BADGE_WARNING}><Archive size={10} /> Archived</span>}
                    {doc.city !== "all" && (
                      <span className="text-[11px] text-zinc-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full capitalize">{doc.city}</span>
                    )}
                    {isOverdue && doc.requires_acknowledgement && (
                      <span className={BADGE_ERROR}><AlertCircle size={10} /> Deadline passed</span>
                    )}
                  </div>
                  {doc.description && <p className="text-xs text-zinc-400 line-clamp-1">{doc.description}</p>}
                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-zinc-500">
                    <span className="flex items-center gap-1"><FileText size={11} /> {doc.file_name} ({fmtSize(doc.file_size)})</span>
                    <span className="flex items-center gap-1"><Calendar size={11} /> {fmtDate(doc.created_at)}</span>
                    {doc.requires_acknowledgement && (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 size={11} /> {doc.acknowledged_count} ack{doc.acknowledged_count !== 1 ? "s" : ""}
                      </span>
                    )}
                    {doc.acknowledgement_deadline && (
                      <span className={`flex items-center gap-1 ${isOverdue ? "text-red-400" : ""}`}>
                        <Clock size={11} /> Due: {fmtDate(doc.acknowledgement_deadline)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded actions */}
              {isExpanded && (
                <div className="border-t border-white/8 bg-white/2 px-4 py-3 space-y-4">
                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => { void downloadFile(doc); }}
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:border-violet-400/30 hover:text-violet-200 transition-colors">
                      <Download size={12} /> Download PDF
                    </button>
                    {doc.requires_acknowledgement && (
                      <button onClick={() => setAckDoc(ackDoc?.id === doc.id ? null : doc)}
                        className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20 transition-colors">
                        <Users size={12} /> View Acknowledgements ({doc.acknowledged_count})
                      </button>
                    )}
                    <button onClick={() => toggleActive(doc)}
                      className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20 transition-colors">
                      <Archive size={12} /> {doc.is_active ? "Archive" : "Restore"}
                    </button>
                    <button onClick={() => deleteDoc(doc)}
                      className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20 transition-colors">
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>

                  {/* Ack report inline */}
                  {ackDoc?.id === doc.id && (
                    <AckReportPanel doc={doc} onClose={() => setAckDoc(null)} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}
