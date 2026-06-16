"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  Send,
  RefreshCw,
  Camera,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SELECT_CLASS,
  INPUT_CLASS,
  T_PAGE_TITLE,
  T_LABEL,
  T_CAPTION,
} from "@/lib/ui-tokens";

// ─── Constants ────────────────────────────────────────────────────────────────

type CityKey = "manila" | "dubai";

const BRANCHES_BY_CITY: Record<CityKey, { code: string; label: string }[]> = {
  manila: [
    { code: "PAR",  label: "Paranaque" },
    { code: "CUB",  label: "Cubao" },
    { code: "TAFT", label: "Taft" },
  ],
  dubai: [
    { code: "BB",  label: "Business Bay" },
    { code: "JLT", label: "JLT" },
    { code: "ARJ", label: "Arjan" },
    { code: "AM",  label: "Al Mina" },
    { code: "AB",  label: "Al Barsha" },
  ],
};

const AGGREGATORS_BY_CITY: Record<CityKey, { key: string; label: string }[]> = {
  manila: [
    { key: "grabfood",  label: "GrabFood" },
    { key: "foodpanda", label: "Foodpanda" },
    { key: "beep",      label: "Beep" },
  ],
  dubai: [
    { key: "careem",    label: "Careem" },
    { key: "noon",      label: "NOON" },
    { key: "talabat",   label: "Talabat" },
    { key: "deliveroo", label: "Deliveroo" },
  ],
};

const TZ_BY_CITY: Record<CityKey, string> = { manila: "Asia/Manila", dubai: "Asia/Dubai" };

const CHECK_TYPES = [
  { key: "OPENING",        label: "Opening Check",       icon: "🌅", desc: "Morning — all aggregators ON" },
  { key: "LUNCH_CLOSE",    label: "Lunch Close",         icon: "🌤", desc: "Pause lunch service" },
  { key: "BUSINESS_CLOSE", label: "Business Close",      icon: "🌙", desc: "End of day close" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowHHMM(tz = "Asia/Manila"): string {
  return new Date().toLocaleTimeString("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function todayInTz(tz = "Asia/Manila"): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SubmittedCheck = {
  id: string;
  check_type: string;
  submitted_by: string;
  submitted_at: string;
  status: string;
  bo_confirmed_by: string | null;
};

// ─── Photo upload button ──────────────────────────────────────────────────────

function PhotoUploadCell({
  label,
  photoKey,
  checkId,
  city,
  checkDate,
  onUploaded,
}: {
  label: string;
  photoKey: string;
  checkId: string;
  city: string;
  checkDate: string;
  onUploaded: (key: string, url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [err, setErr] = useState("");

  const handleFile = async (f: File) => {
    setUploading(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("city", city);
      fd.append("photo_type", photoKey);
      fd.append("check_date", checkDate);
      fd.append("file", f);
      // Must delete Content-Type so browser sets multipart/form-data boundary automatically
      const uploadHeaders = getAuthHeaders();
      delete (uploadHeaders as Record<string, string>)["Content-Type"];
      const r = await fetch(`/api/store/daily-check/${checkId}/photo`, {
        method: "POST",
        headers: uploadHeaders,
        body: fd,
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Upload failed");
      setUploaded(true);
      onUploaded(photoKey, d.photo_url || "");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      {uploaded ? (
        <span className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 size={12} /> Photo uploaded ✓
        </span>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-white/20 bg-white/3 px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/6 disabled:opacity-60"
        >
          {uploading ? <RefreshCw size={12} className="animate-spin" /> : <Camera size={12} />}
          {uploading ? "Uploading..." : `Photo — ${label}`}
        </button>
      )}
      {err && <p className="mt-0.5 text-xs text-red-400">{err}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DailyCheckPage() {
  const router = useRouter();
  const auth = getAuth();

  // Session — Daily Check exists for both Manila and Dubai stores.
  const canManage = ["ADMIN", "HQ", "MANILA_MANAGEMENT", "DUBAI_MANAGEMENT"].includes(String(auth?.role || ""));
  const [city, setCity] = useState<CityKey>(
    (String(auth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila")
  );
  const branches = BRANCHES_BY_CITY[city];
  const aggregators = AGGREGATORS_BY_CITY[city];
  const tz = TZ_BY_CITY[city];
  const [branch, setBranch] = useState(branches[0].code);
  const [staffName, setStaffName] = useState(auth?.staffName || "");

  // Check type selection
  const [checkType, setCheckType] = useState<string>("OPENING");

  // Aggregator statuses: {open: bool, mode: "auto"|"manual"}
  const [aggStatus, setAggStatus] = useState<Record<string, {open: boolean; mode: "auto" | "manual"}>>(
    Object.fromEntries(aggregators.map((a) => [a.key, {open: false, mode: "auto" as const}]))
  );
  const [dineInOpen, setDineInOpen] = useState<boolean | null>(null);
  const [notes, setNotes] = useState("");

  // After submission — for photo upload
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [uploadedPhotos, setUploadedPhotos] = useState<Record<string, string>>({});

  // Today's existing checks
  const [todayChecks, setTodayChecks] = useState<SubmittedCheck[]>([]);
  const [loadingToday, setLoadingToday] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const today = todayInTz(tz);

  // ── Auth guard ──
  useEffect(() => {
    if (!auth) { router.replace("/login?next=%2Fstore%2Fdaily-check"); }
  }, [auth, router]);

  // When the city changes, reset branch + aggregator statuses to that city's set.
  useEffect(() => {
    setBranch(BRANCHES_BY_CITY[city][0].code);
    setAggStatus(Object.fromEntries(AGGREGATORS_BY_CITY[city].map((a) => [a.key, { open: false, mode: "auto" as const }])));
  }, [city]);

  // ── Load today's checks ──
  const loadTodayChecks = () => {
    if (!branch) return;
    setLoadingToday(true);
    fetch(`/api/store/daily-check/today?city=${city}&branch_code=${branch}&check_date=${today}`, {
      headers: getAuthHeaders(), cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setTodayChecks(d.checks ?? []))
      .catch(() => {})
      .finally(() => setLoadingToday(false));
  };

  useEffect(() => { loadTodayChecks(); }, [branch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset after check type change ──
  useEffect(() => {
    setSubmittedId(null);
    setMsg(null);
    setAggStatus(Object.fromEntries(aggregators.map((a) => [a.key, {open: false, mode: "auto" as const}])));
    setDineInOpen(null);
    setNotes("");
    setUploadedPhotos({});
  }, [checkType]);

  // ── Check if this type was already submitted today ──
  const alreadySubmitted = todayChecks.filter((c) => c.check_type === checkType);
  const isOpening = checkType === "OPENING";

  const submit = async () => {
    if (!staffName.trim()) { setMsg({ ok: false, text: "Enter your name." }); return; }
    setSubmitting(true); setMsg(null);
    try {
      const r = await fetch("/api/store/daily-check/submit", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          city,
          branch_code: branch,
          check_type: checkType,
          check_date: today,
          submitted_by: staffName.trim(),
          aggregator_statuses: aggStatus,
          dine_in_open: dineInOpen,
          notes: notes.trim(),
        }),
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Submission failed.");
      setSubmittedId(d.check?.id ?? null);
      setMsg({ ok: true, text: isOpening ? "Opening check submitted! Add photos below." : "Check submitted successfully." });
      loadTodayChecks();
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const checkTypeMeta = CHECK_TYPES.find((t) => t.key === checkType)!;
  const branchLabel = branches.find((b) => b.code === branch)?.label ?? branch;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
      <div className="mx-auto max-w-lg space-y-5">

        {/* Header */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-1">STORE OPS</p>
          <h1 className={T_PAGE_TITLE}>Daily Check</h1>
          <p className="text-sm text-white/40 mt-1">Opening &amp; closing confirmation log</p>
        </div>

        {/* Branch / Staff */}
        <div className={`${GLASS_CARD} space-y-3`}>
          {canManage && (
            <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-0.5 self-start w-fit">
              {(["manila", "dubai"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCity(c)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition ${
                    city === c ? "bg-violet-500/20 text-violet-200" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Branch</label>
              <select className={SELECT_CLASS} value={branch} onChange={(e) => setBranch(e.target.value)}>
                {branches.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}
              </select>
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Your Name</label>
              <input className={INPUT_CLASS} value={staffName} onChange={(e) => setStaffName(e.target.value)}
                placeholder="Full name" />
            </div>
          </div>
        </div>

        {/* Check type selector */}
        <div className={GLASS_CARD}>
          <label className={`${T_LABEL} mb-2 block`}>Check Type</label>
          <div className="grid grid-cols-3 gap-2">
            {CHECK_TYPES.map((t) => (
              <button key={t.key} type="button"
                onClick={() => setCheckType(t.key)}
                className={`rounded-xl border px-3 py-3 text-center transition-all ${
                  checkType === t.key
                    ? "border-violet-500/40 bg-violet-500/20 text-violet-200"
                    : "border-white/10 bg-white/3 text-slate-400 hover:border-white/20"
                }`}>
                <div className="text-lg mb-1">{t.icon}</div>
                <div className="text-xs font-semibold leading-tight">{t.label}</div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-white/30">{checkTypeMeta.desc}</p>
        </div>

        {/* Already submitted notice */}
        {alreadySubmitted.length > 0 && !submittedId && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Already submitted today</p>
              <p className="text-xs text-amber-300/70 mt-0.5">
                {alreadySubmitted[0].submitted_by} at {new Date(alreadySubmitted[0].submitted_at).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" })}
                {(alreadySubmitted[0].status === "CONFIRMED_OK" || alreadySubmitted[0].status === "CONFIRMED")
                  ? <span className="ml-2 text-emerald-400">🟢 Confirmed OK</span>
                  : alreadySubmitted[0].status === "CONFIRMED_ISSUE"
                    ? <span className="ml-2 text-red-400">🔴 Issue noted</span>
                    : alreadySubmitted[0].status === "RESOLVED"
                      ? <span className="ml-2 text-sky-400">🔵 Resolved</span>
                      : alreadySubmitted[0].status === "ONGOING_ISSUE"
                        ? <span className="ml-2 text-violet-400">🟣 Ongoing issue</span>
                        : <span className="ml-2 text-amber-400/70">Awaiting confirmation</span>}
              </p>
            </div>
          </div>
        )}

        {/* Checklist form */}
        {!submittedId && (
          <div className={`${GLASS_CARD} space-y-4`}>
            <h2 className="text-sm font-semibold text-white">
              {checkTypeMeta.icon} {checkTypeMeta.label} — {branchLabel}
            </h2>

            {/* Aggregator status */}
            <div>
              <p className={`${T_CAPTION} mb-2`}>
                {isOpening ? "Aggregator devices are ON and showing as Open" : "Aggregator devices are closed / paused"}
              </p>
              <div className="space-y-2">
                {aggregators.map((agg) => (
                  <div key={agg.key}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all ${
                      aggStatus[agg.key]?.open
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-white/10 bg-white/3"
                    }`}>
                    {/* Open/closed checkbox */}
                    <label className="flex flex-1 cursor-pointer items-center gap-3">
                      <input type="checkbox" className="sr-only"
                        checked={!!aggStatus[agg.key]?.open}
                        onChange={(e) => setAggStatus((p) => ({
                          ...p,
                          [agg.key]: { ...p[agg.key], open: e.target.checked },
                        }))} />
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold ${
                        aggStatus[agg.key]?.open
                          ? "border-emerald-400 bg-emerald-500/30 text-emerald-300"
                          : "border-white/25 bg-white/5 text-transparent"
                      }`}>✓</span>
                      <span className={`text-sm font-medium ${aggStatus[agg.key]?.open ? "text-emerald-300" : "text-slate-400"}`}>
                        {agg.label}
                      </span>
                    </label>
                    {/* Auto / Manual toggle */}
                    <div className="flex gap-1">
                      {(["auto", "manual"] as const).map((mode) => (
                        <button key={mode} type="button"
                          onClick={() => setAggStatus((p) => ({
                            ...p,
                            [agg.key]: { ...p[agg.key], mode },
                          }))}
                          className={`rounded-lg px-2 py-1 text-xs font-medium transition-all ${
                            aggStatus[agg.key]?.mode === mode
                              ? "border border-violet-500/30 bg-violet-500/25 text-violet-300"
                              : "border border-white/10 bg-white/5 text-white/30 hover:bg-white/8"
                          }`}>
                          {mode === "auto" ? "Auto" : "Manual"}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Dine-in (Opening only) */}
            {isOpening && (
              <div>
                <p className={`${T_CAPTION} mb-2`}>Dine-in area</p>
                <div className="flex gap-2">
                  {[{ v: true, label: "Open" }, { v: false, label: "Closed today" }, { v: null, label: "N/A" }].map(({ v, label }) => (
                    <button key={String(v)} type="button"
                      onClick={() => setDineInOpen(v)}
                      className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all ${
                        dineInOpen === v
                          ? v === true
                            ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                            : v === false
                              ? "border-red-500/30 bg-red-500/10 text-red-300"
                              : "border-slate-500/40 bg-slate-500/20 text-slate-300"
                          : "border-white/10 bg-white/3 text-slate-500"
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Notes (optional)</label>
              <textarea className={`${INPUT_CLASS} min-h-[64px] resize-none`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any issues to report..." />
            </div>

            <button type="button" onClick={submit} disabled={submitting}
              className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2`}>
              {submitting ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
              {submitting ? "Submitting..." : `Submit ${checkTypeMeta.label}`}
            </button>
          </div>
        )}

        {/* Result / Photo upload */}
        {msg && (
          <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
            msg.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}>
            {msg.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}
            {msg.text}
          </div>
        )}

        {/* Photo upload section — Opening only, after submit */}
        {submittedId && isOpening && (
          <div className={`${GLASS_CARD} space-y-3`}>
            <h3 className="text-sm font-semibold text-white">📸 Upload Device Photos</h3>
            <p className="text-xs text-white/40">
              Take photos of each aggregator device showing it is open, and the dine-in area if applicable.
            </p>
            {aggregators.map((agg) => (
              <div key={agg.key} className="flex items-center gap-3">
                <span className={`text-xs font-medium w-24 ${aggStatus[agg.key]?.open ? "text-emerald-300" : "text-slate-500"}`}>
                  {agg.label}
                </span>
                <PhotoUploadCell
                  label={agg.label}
                  photoKey={agg.key}
                  checkId={submittedId}
                  city={city}
                  checkDate={today}
                  onUploaded={(key, url) => setUploadedPhotos((p) => ({ ...p, [key]: url }))}
                />
              </div>
            ))}
            {dineInOpen === true && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium w-24 text-emerald-300">Dine-in</span>
                <PhotoUploadCell
                  label="Dine-in area"
                  photoKey="dine_in"
                  checkId={submittedId}
                  city={city}
                  checkDate={today}
                  onUploaded={(key, url) => setUploadedPhotos((p) => ({ ...p, [key]: url }))}
                />
              </div>
            )}
            <p className="text-xs text-white/30 pt-1">
              {Object.keys(uploadedPhotos).length} / {aggregators.length + (dineInOpen === true ? 1 : 0)} photo(s) uploaded.
              Photos are optional but recommended.
            </p>
          </div>
        )}

        {/* Today's history */}
        <div className={GLASS_CARD}>
          <button type="button"
            onClick={() => setShowHistory((p) => !p)}
            className="w-full flex items-center justify-between text-sm font-medium text-white/70">
            <span className="flex items-center gap-2">
              <Clock size={14} />
              Today&apos;s Submissions — {branchLabel}
              {loadingToday
                ? <span className="text-xs text-white/30 ml-1">loading...</span>
                : <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-xs">{todayChecks.length}</span>}
            </span>
            {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showHistory && (
            <div className="mt-3 space-y-2">
              {todayChecks.length === 0 ? (
                <p className="text-xs text-white/30">No submissions today.</p>
              ) : (
                todayChecks.map((c) => {
                  const meta = CHECK_TYPES.find((t) => t.key === c.check_type);
                  return (
                    <div key={c.id} className={`rounded-lg border px-3 py-2 text-xs ${
                      c.status === "CONFIRMED_OK" || c.status === "CONFIRMED"
                        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300/80"
                        : c.status === "CONFIRMED_ISSUE" || c.status === "ONGOING_ISSUE"
                          ? "border-red-500/20 bg-red-500/5 text-red-300/80"
                          : c.status === "RESOLVED"
                            ? "border-sky-500/20 bg-sky-500/5 text-sky-300/80"
                            : "border-white/8 bg-white/3 text-white/50"
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{meta?.icon} {meta?.label ?? c.check_type}</span>
                        <span>
                          {c.status === "CONFIRMED_OK" || c.status === "CONFIRMED"
                            ? <span className="text-emerald-400">🟢 OK</span>
                            : c.status === "CONFIRMED_ISSUE"
                              ? <span className="text-red-400">🔴 Issue</span>
                              : c.status === "RESOLVED"
                                ? <span className="text-sky-400">🔵 Resolved</span>
                                : c.status === "ONGOING_ISSUE"
                                  ? <span className="text-violet-400">🟣 Ongoing</span>
                                  : <span className="text-amber-400/70">Awaiting</span>}
                        </span>
                      </div>
                      <div className="mt-0.5 text-white/30">
                        by {c.submitted_by} · {new Date(c.submitted_at).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" })}
                        {c.bo_confirmed_by && ` · confirmed by ${c.bo_confirmed_by}`}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
