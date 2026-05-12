"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  X,
} from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { BRANCHES, type City } from "@/lib/branches";
import { API_BASE } from "@/lib/api";
import { dispatchBadgeRefresh } from "@/lib/badgeEvents";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  SMALL_BUTTON,
  T_LABEL,
  T_SECTION,
  TEXTAREA_CLASS,
} from "@/lib/ui-tokens";

const INCIDENT_CATEGORIES = [
  "Product Issue",
  "Customer Issue",
  "Stock Shortage",
  "Delivery Issue",
  "Equipment Issue",
  "Weather Issue",
  "Facility Issue",
  "Injury",
  "Other",
] as const;

const SEVERITY_LEVELS = [
  { value: "low",      label: "Low",      emoji: "🟢", active: "border-emerald-500/60 bg-emerald-500/20 text-emerald-300", inactive: "border-white/10 bg-white/5 text-zinc-400 hover:border-emerald-500/30 hover:text-emerald-300" },
  { value: "medium",   label: "Medium",   emoji: "🟡", active: "border-amber-500/60 bg-amber-500/20 text-amber-300",       inactive: "border-white/10 bg-white/5 text-zinc-400 hover:border-amber-500/30 hover:text-amber-300" },
  { value: "high",     label: "High",     emoji: "🟠", active: "border-orange-500/60 bg-orange-500/20 text-orange-300",   inactive: "border-white/10 bg-white/5 text-zinc-400 hover:border-orange-500/30 hover:text-orange-300" },
  { value: "critical", label: "Critical", emoji: "🔴", active: "border-red-500/60 bg-red-500/20 text-red-300",             inactive: "border-white/10 bg-white/5 text-zinc-400 hover:border-red-500/30 hover:text-red-300" },
] as const;

const SEV_TEXT: Record<string, string> = {
  low: "text-emerald-400", medium: "text-amber-400", high: "text-orange-400", critical: "text-red-400",
};
const SEV_ICON_BG: Record<string, string> = {
  low: "border-emerald-500/40 bg-emerald-500/15",
  medium: "border-amber-500/40 bg-amber-500/15",
  high: "border-orange-500/40 bg-orange-500/15",
  critical: "border-red-500/40 bg-red-500/15",
};
const SEV_EMOJI: Record<string, string> = {
  low: "🟢", medium: "🟡", high: "🟠", critical: "🔴",
};

const STATUS_LABEL: Record<string, string> = {
  new: "New", acknowledged: "Acknowledged", in_progress: "In Progress", resolved: "Resolved",
};
const STATUS_BADGE: Record<string, string> = {
  new: BADGE_ERROR, acknowledged: BADGE_WARNING, in_progress: BADGE_INFO, resolved: BADGE_SUCCESS,
};

type Attachment = { id: string; file_name: string; web_view_link?: string; mime_type?: string; };
type Reply = { id: string; author_name: string; author_role: string; message: string; created_at: string; };
type IncidentReport = {
  id: string; city: string; branch: string; reporter_name: string;
  category: string; severity: string; description: string;
  incident_datetime: string; status: string; created_at: string;
  replies: Reply[]; attachments: Attachment[];
};

function fmtDt(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function IncidentsPage() {
  const router = useRouter();
  const auth = getAuth();
  const city = (auth?.city || "dubai") as City;
  const staffName = auth?.staffName || "";

  useEffect(() => {
    if (!auth?.staffName || !auth?.accessToken) {
      router.replace("/login?next=%2Fincidents");
    }
  }, [auth, router]);

  const [showForm, setShowForm]           = useState(false);
  const [formCity, setFormCity]           = useState<City>(city);
  const [branch, setBranch]               = useState("");
  const [reporter, setReporter]           = useState(staffName);
  const [category, setCategory]           = useState<string>("");
  const [severity, setSeverity]           = useState("medium");
  const [description, setDescription]     = useState("");
  const [incidentDatetime, setIncidentDatetime] = useState("");
  const [imageFile, setImageFile]         = useState<File | null>(null);
  const [submitting, setSubmitting]       = useState(false);
  const [submitError, setSubmitError]     = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [items, setItems]         = useState<IncidentReport[]>([]);
  const [loading, setLoading]     = useState(false);
  const [listError, setListError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const branches = BRANCHES[formCity] ?? [];

  const fetchList = useCallback(async () => {
    const a = getAuth();
    if (!a) return;
    setLoading(true); setListError("");
    try {
      const res = await fetch(`${API_BASE}/api/incidents`, { cache: "no-store", headers: getAuthHeaders(a) });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setItems(data.items || []);
    } catch (e: unknown) {
      setListError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchList(); }, [fetchList]);

  const handleExpand = async (id: string) => {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    if (next) {
      try {
        const a = getAuth();
        if (!a) return;
        await fetch(`${API_BASE}/api/incidents/notifications/read`, {
          method: "POST", headers: getAuthHeaders(a),
          body: JSON.stringify({ report_id: id }),
        });
        dispatchBadgeRefresh("incidents");
      } catch {}
    }
  };

  const handleSubmit = async () => {
    setSubmitError(""); setSubmitSuccess("");
    if (!category)           { setSubmitError("Please select a category"); return; }
    if (!branch)             { setSubmitError("Please select a branch"); return; }
    if (!description.trim()) { setSubmitError("Please enter a description"); return; }

    setSubmitting(true);
    try {
      const a = getAuth();
      if (!a) throw new Error("Not authenticated");
      const res = await fetch(`${API_BASE}/api/incidents`, {
        method: "POST", headers: getAuthHeaders(a),
        body: JSON.stringify({
          city: formCity, branch,
          reporter_name: reporter || a.staffName,
          category, severity,
          description: description.trim(),
          incident_datetime: incidentDatetime,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const reportId: string = data.report_id || "";

      let imageUploadOk = true;
      if (imageFile && reportId) {
        const fd = new FormData();
        fd.append("file", imageFile);
        fd.append("uploader_name", reporter || a.staffName);
        fd.append("authorization", `Bearer ${a.accessToken || ""}`);
        const attRes = await fetch(`${API_BASE}/api/incidents/${reportId}/attachments`, { method: "POST", body: fd });
        if (!attRes.ok) imageUploadOk = false;
      }

      setSubmitSuccess(
        imageUploadOk
          ? "Report submitted successfully."
          : "Report submitted. Image upload failed — please re-attach and retry."
      );
      setShowForm(false);
      setCategory(""); setBranch(""); setSeverity("medium");
      setDescription(""); setIncidentDatetime(""); setImageFile(null);
      void fetchList();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Submission failed");
    } finally { setSubmitting(false); }
  };

  const total    = items.length;
  const open     = items.filter((i) => i.status !== "resolved").length;
  const resolved = items.filter((i) => i.status === "resolved").length;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">

      {/* ── Page header ───────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent p-6">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-500/8 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/30">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">Incident Reports</h1>
                <p className="mt-0.5 text-xs text-zinc-400">Report and track workplace incidents</p>
              </div>
            </div>
            {items.length > 0 && (
              <div className="mt-4 flex items-center gap-5">
                <div><p className="text-xl font-bold tabular-nums text-white">{total}</p><p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Total</p></div>
                <div className="h-8 w-px bg-white/8" />
                <div><p className="text-xl font-bold tabular-nums text-amber-400">{open}</p><p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Open</p></div>
                <div className="h-8 w-px bg-white/8" />
                <div><p className="text-xl font-bold tabular-nums text-emerald-400">{resolved}</p><p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Resolved</p></div>
              </div>
            )}
          </div>
          <button
            className={`${PRIMARY_BUTTON} shrink-0`}
            onClick={() => { setShowForm((v) => !v); setSubmitError(""); setSubmitSuccess(""); }}
          >
            {showForm ? <><X className="mr-1.5 inline h-4 w-4" />Cancel</> : <><Plus className="mr-1.5 inline h-4 w-4" />New Report</>}
          </button>
        </div>
      </div>

      {submitSuccess && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />{submitSuccess}
        </div>
      )}

      {/* ── Submit form ───────────────────────────────────────────── */}
      {showForm && (
        <div className={`${GLASS_CARD} overflow-hidden`}>
          <div className="border-b border-white/8 px-6 py-4">
            <h2 className="text-base font-semibold text-white">New Incident Report</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Fields marked * are required.</p>
          </div>

          <div className="space-y-5 p-6">
            {/* Location */}
            <div>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Location</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className={T_LABEL}>City</label>
                  <select className={SELECT_CLASS} value={formCity}
                    onChange={(e) => { setFormCity(e.target.value as City); setBranch(""); }}>
                    <option value="dubai">Dubai 🇦🇪</option>
                    <option value="manila">Manila 🇵🇭</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={T_LABEL}>Branch *</label>
                  <select className={SELECT_CLASS} value={branch} onChange={(e) => setBranch(e.target.value)}>
                    <option value="">— Select —</option>
                    {branches.map((b) => <option key={b.code} value={b.name}>{b.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="h-px bg-white/5" />

            {/* Reporter & Date */}
            <div>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Details</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className={T_LABEL}>Reporter</label>
                  <input className={INPUT_CLASS} value={reporter}
                    onChange={(e) => setReporter(e.target.value)} placeholder="Staff name" />
                </div>
                <div className="space-y-1.5">
                  <label className={T_LABEL}>Incident Date & Time</label>
                  <input type="datetime-local" className={INPUT_CLASS} value={incidentDatetime}
                    onChange={(e) => setIncidentDatetime(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="h-px bg-white/5" />

            {/* Category chips */}
            <div className="space-y-2">
              <label className={T_LABEL}>Category *</label>
              <div className="flex flex-wrap gap-2">
                {INCIDENT_CATEGORIES.map((c) => (
                  <button key={c} type="button" onClick={() => setCategory(c)}
                    className={[
                      "rounded-lg border px-3 py-1.5 text-sm font-medium transition-all duration-150",
                      category === c
                        ? "border-violet-500/50 bg-violet-500/20 text-violet-200"
                        : "border-white/10 bg-white/5 text-zinc-400 hover:border-violet-400/30 hover:text-zinc-200",
                    ].join(" ")}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-white/5" />

            {/* Severity */}
            <div className="space-y-2">
              <label className={T_LABEL}>Severity</label>
              <div className="grid grid-cols-4 gap-2">
                {SEVERITY_LEVELS.map((s) => (
                  <button key={s.value} type="button" onClick={() => setSeverity(s.value)}
                    className={[
                      "rounded-xl border px-3 py-2.5 text-center text-sm font-medium transition-all duration-150",
                      severity === s.value ? s.active : s.inactive,
                    ].join(" ")}>
                    <span className="block text-lg">{s.emoji}</span>
                    <span className="mt-0.5 block text-xs">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-white/5" />

            {/* Description */}
            <div className="space-y-1.5">
              <label className={T_LABEL}>Description *</label>
              <textarea className={`${TEXTAREA_CLASS} min-h-[110px]`}
                placeholder="Describe the incident in detail…"
                value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            {/* Image upload */}
            <div className="space-y-1.5">
              <label className={T_LABEL}>
                Attach Image{" "}
                <span className="normal-case font-normal text-zinc-600">(optional)</span>
              </label>
              <div
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/4 px-4 py-3.5 transition-all duration-150 hover:border-violet-500/40 hover:bg-violet-500/5"
                onClick={() => fileRef.current?.click()}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/8">
                  <ImageIcon className="h-4 w-4 text-zinc-400" />
                </div>
                <span className="flex-1 text-sm text-zinc-400">
                  {imageFile ? imageFile.name : "Click to upload an image"}
                </span>
                {imageFile && (
                  <button
                    className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-red-500/15 hover:text-red-400"
                    onClick={(e) => { e.stopPropagation(); setImageFile(null); }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
            </div>

            {submitError && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />{submitError}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-white/8 px-6 py-4">
            <button className={SECONDARY_BUTTON} onClick={() => setShowForm(false)}>Cancel</button>
            <button className={PRIMARY_BUTTON} onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <Send className="mr-2 inline h-4 w-4" />}
              Submit Report
            </button>
          </div>
        </div>
      )}

      {/* ── Report list ───────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className={T_SECTION}>Submitted Reports</h2>
          {!loading && items.length > 0 && (
            <span className="text-xs text-zinc-500">{items.length} {items.length === 1 ? "report" : "reports"}</span>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12 text-zinc-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading reports…
          </div>
        )}
        {listError && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />{listError}
          </div>
        )}
        {!loading && !listError && items.length === 0 && (
          <div className={`${GLASS_CARD} flex flex-col items-center py-14`}>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800">
              <AlertTriangle className="h-6 w-6 text-zinc-600" />
            </div>
            <p className="mt-3 text-sm font-medium text-zinc-400">No reports yet</p>
            <p className="mt-1 text-xs text-zinc-600">Submit your first incident report using the button above</p>
          </div>
        )}

        {items.map((item) => {
          const expanded = expandedId === item.id;
          return (
            <div key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-xl shadow-black/20 backdrop-blur-sm">
              <button className="flex w-full items-start gap-4 px-5 py-4 text-left"
                onClick={() => handleExpand(item.id)}>
                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-base ${SEV_ICON_BG[item.severity] ?? SEV_ICON_BG.medium}`}>
                  {SEV_EMOJI[item.severity] ?? "🟡"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{item.category}</span>
                    <span className={STATUS_BADGE[item.status] ?? BADGE_INFO}>
                      {STATUS_LABEL[item.status] ?? item.status}
                    </span>
                    {(item.replies?.length ?? 0) > 0 && (
                      <span className={BADGE_INFO}>
                        <MessageSquare className="h-3 w-3" />{item.replies.length} {item.replies.length === 1 ? "reply" : "replies"}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                    <span className="font-medium text-zinc-400">{item.branch}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDt(item.created_at)}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm text-zinc-400">{item.description}</p>
                </div>
                <span className="mt-1 shrink-0 text-zinc-600">
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              </button>

              {expanded && (
                <div className="space-y-4 border-t border-white/8 px-5 pb-5 pt-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {item.incident_datetime && (
                      <div className="rounded-xl border border-white/8 bg-white/3 px-3.5 py-2.5">
                        <p className={T_LABEL}>Incident Date & Time</p>
                        <p className="mt-1 text-sm text-zinc-200">{fmtDt(item.incident_datetime)}</p>
                      </div>
                    )}
                    <div className="rounded-xl border border-white/8 bg-white/3 px-3.5 py-2.5">
                      <p className={T_LABEL}>Severity</p>
                      <p className={`mt-1 text-sm font-medium ${SEV_TEXT[item.severity] ?? "text-amber-400"}`}>
                        {SEV_EMOJI[item.severity]} {item.severity.charAt(0).toUpperCase() + item.severity.slice(1)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/8 bg-white/3 px-3.5 py-2.5">
                    <p className={T_LABEL}>Description</p>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{item.description}</p>
                  </div>

                  {(item.attachments?.length ?? 0) > 0 && (
                    <div>
                      <p className={`${T_LABEL} mb-2`}>Attachments</p>
                      <div className="flex flex-wrap gap-3">
                        {item.attachments.map((att) => {
                          const isImage = (att.mime_type || "").startsWith("image/");
                          return isImage && att.web_view_link ? (
                            <a key={att.id} href={att.web_view_link} target="_blank" rel="noopener noreferrer"
                              className="group relative overflow-hidden rounded-xl border border-white/10 transition-all hover:border-violet-500/40 hover:shadow-lg hover:shadow-violet-500/10">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={att.web_view_link.replace("/view", "/preview")} alt={att.file_name}
                                className="h-28 w-40 object-cover transition-transform duration-300 group-hover:scale-105"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              <div className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 py-2 text-[10px] text-zinc-300">{att.file_name}</div>
                            </a>
                          ) : (
                            <a key={att.id} href={att.web_view_link || "#"} target="_blank" rel="noopener noreferrer"
                              className={`${SMALL_BUTTON} flex items-center gap-1.5`}>
                              <ImageIcon className="h-3.5 w-3.5" />{att.file_name}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(item.replies?.length ?? 0) > 0 && (
                    <div>
                      <p className={`${T_LABEL} mb-2`}>HQ Replies</p>
                      <div className="space-y-2">
                        {item.replies.map((reply) => (
                          <div key={reply.id} className="rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-500/10 to-transparent px-4 py-3">
                            <div className="mb-1.5 flex items-center gap-2">
                              <span className="text-xs font-semibold text-violet-300">{reply.author_name}</span>
                              <span className="rounded-full border border-violet-500/25 bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-400">{reply.author_role}</span>
                              <span className="ml-auto flex items-center gap-1 text-[11px] text-zinc-600">
                                <Clock className="h-3 w-3" />{fmtDt(reply.created_at)}
                              </span>
                            </div>
                            <p className="text-sm text-zinc-200">{reply.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
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
