"use client";

import { useEffect, useState, useCallback } from "react";
import {
  GLASS_CARD, PRIMARY_BUTTON, KPI_CARD, T_PAGE_TITLE,
  BADGE_SUCCESS, BADGE_WARNING, BADGE_ERROR,
} from "@/lib/ui-tokens";
import { getAuth, getAuthHeaders } from "@/lib/auth";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ArPayout {
  id: number;
  platform: "grab" | "foodpanda" | "careem" | string;
  store_code: string;
  payout_id: string;
  expected_amount: number;
  payout_date: string;
  orders_count: number | null;
  source_file: string | null;
  bank_confirmed: boolean;
  bank_amount: number | null;
  bank_confirmed_at: string | null;
  bank_confirmed_by: string | null;
  confirmation_note: string | null;
  imported_at: string;
  ar_status: "reconciled" | "pending" | "overdue" | "archived";
  // Dubai / Careem extended fields
  brand?: string | null;
  currency?: string | null;
  city?: string | null;
  period_start?: string | null;
  period_end?: string | null;
}

interface KpiSummary {
  reconciled_count: number;
  reconciled_amount: number;
  pending_count: number;
  pending_amount: number;
  overdue_count: number;
  overdue_amount: number;
  archived_count: number;
  archived_amount: number;
}

/** A stream that has gone quieter than its own history says it should.
 *  Nothing here is a wrong number -- it is the absence of rows, which is the
 *  one defect a table cannot show you by being correct. */
interface Gaps {
  as_of: string;
  platform_stale: {
    city: string; platform: string; last_date: string; days_since: number;
    typical_days: number; stores: number; likely_missing: number | null;
  }[];
  store_behind: {
    city: string; platform: string; store_code: string; last_date: string;
    platform_last: string; behind_days: number; typical_days: number;
    missing_cycles: number | null;
  }[];
  roster_changed: {
    city: string; platform: string; new_codes: string[]; old_codes: string[];
    last_date: string; days_since: number;
  }[];
  total: number;
}

interface Cutoffs {
  [city: string]: { cutoff_date: string; set_by: string; note: string; set_at: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtAmount = (n: number | null | undefined, currency?: string | null) => {
  if (n == null) return "—";
  if (currency === "AED") return `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmt = (n: number | null | undefined) => fmtAmount(n, "PHP");

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "2-digit" }) : "—";

// Keeta, Talabat, Noon and Smiles were all reconciling here with no entry in
// this map, so their filter buttons rendered as three blank chips and every
// badge in the table fell through to the raw lowercase key.
const PLATFORM_LABEL: Record<string, string> = {
  grab: "Grab", foodpanda: "Foodpanda", careem: "Careem",
  keeta: "Keeta", talabat: "Talabat", noon: "Noon", smiles: "Smiles",
};
const PLATFORM_COLOR: Record<string, string> = {
  grab: "text-green-400 bg-green-500/10 border-green-500/25",
  foodpanda: "text-pink-400 bg-pink-500/10 border-pink-500/25",
  careem: "text-teal-300 bg-teal-500/10 border-teal-500/25",
  keeta: "text-yellow-300 bg-yellow-500/10 border-yellow-500/25",
  talabat: "text-orange-300 bg-orange-500/10 border-orange-500/25",
  noon: "text-amber-300 bg-amber-500/10 border-amber-500/25",
  smiles: "text-sky-300 bg-sky-500/10 border-sky-500/25",
};

const STATUS_BADGE: Record<string, string> = {
  reconciled: BADGE_SUCCESS,
  pending: BADGE_WARNING,
  overdue: BADGE_ERROR,
  archived: "border-white/10 bg-white/5 text-white/40",
};
const STATUS_LABEL: Record<string, string> = {
  reconciled: "🟢 Reconciled",
  pending: "🟡 Bank Pending",
  overdue: "🔴 Not checked",
  archived: "⚪ Not checking",
};

// ─── Confirm Modal ────────────────────────────────────────────────────────────

function ConfirmModal({
  payout, onClose, onSave,
}: {
  payout: ArPayout;
  onClose: () => void;
  onSave: (bankAmount: number, note: string) => Promise<void>;
}) {
  // Starts empty. It used to arrive pre-filled with the expected amount, so
  // pressing Save recorded "the bank paid exactly what was expected" whether or
  // not anyone had opened a bank statement — which is why all 66 confirmations
  // on file match to the cent. A reconciliation that cannot disagree is not
  // reconciling anything.
  const [bankAmount, setBankAmount] = useState(
    payout.bank_amount != null ? String(payout.bank_amount) : ""
  );
  const [note, setNote] = useState(payout.confirmation_note || "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const parsed = parseFloat(bankAmount);
  const hasAmount = bankAmount.trim() !== "" && !isNaN(parsed);
  const diff = hasAmount ? parsed - Number(payout.expected_amount) : 0;
  const differs = hasAmount && Math.abs(diff) >= 0.01;

  const handleSave = async () => {
    // Zero and negative are allowed on purpose. Nothing arrived at all, and a
    // chargeback that took money back, are the two findings this page exists
    // to record -- and seven payouts already carry a negative expected amount.
    // Refusing them meant the only receipts you could write down were the ones
    // where nothing had gone wrong.
    if (!hasAmount) { setSaveError("Enter the amount the bank actually received."); return; }
    // A gap between expected and received is the finding this page exists for.
    // Recording it without a word leaves the next reader guessing.
    if (differs && !note.trim()) {
      setSaveError("The bank amount differs from expected. Add a note saying why before saving.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await onSave(parsed, note);
    } catch (e) {
      // The save used to be fire-and-forget: the modal closed and the list
      // refreshed whether or not anything had been written, so a refused
      // confirmation looked exactly like a successful one.
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`${GLASS_CARD} w-full max-w-md p-6 space-y-4`}>
        <h2 className="text-lg font-semibold text-white">Confirm Bank Receipt</h2>
        <div className="space-y-1 text-sm text-white/60">
          <div className="flex justify-between">
            <span>Platform</span>
            <span className="text-white">{PLATFORM_LABEL[payout.platform]}</span>
          </div>
          <div className="flex justify-between">
            <span>Payout ID</span>
            <span className="text-white font-mono text-xs">{payout.payout_id}</span>
          </div>
          <div className="flex justify-between">
            <span>Expected</span>
            <span className="text-white">{fmtAmount(payout.expected_amount, payout.currency)}</span>
          </div>
          <div className="flex justify-between">
            <span>Payout Date</span>
            <span className="text-white">{fmtDate(payout.payout_date)}</span>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs text-white/50 uppercase tracking-wide">
            Bank Amount Received ({payout.currency || "PHP"})
          </label>
          <input
            type="number"
            step="0.01"
            value={bankAmount}
            placeholder="Type what the bank statement shows"
            onChange={(e) => setBankAmount(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-violet-500/50 focus:outline-none"
          />
          {differs ? (
            <p className="text-xs text-amber-300">
              {diff > 0 ? "Over" : "Short"} by {fmtAmount(Math.abs(diff), payout.currency)} against expected —
              say why in the note below.
            </p>
          ) : hasAmount ? (
            <p className="text-xs text-emerald-400/80">Matches the expected amount.</p>
          ) : (
            <p className="text-xs text-white/35">
              Read it off the bank statement. Leaving it to match expected is how a
              short payment gets confirmed as received.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <label className="text-xs text-white/50 uppercase tracking-wide">Note (optional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Confirmed via Union Bank statement"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/30 focus:border-violet-500/50 focus:outline-none"
          />
        </div>
        {saveError && (
          <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {saveError}
          </p>
        )}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-white/10 py-2 text-sm text-white/60 hover:bg-white/5">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className={`flex-1 ${PRIMARY_BUTTON} py-2 text-sm`}>
            {saving ? "Saving…" : "Confirm Receipt"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Payouts run back to early 2024, so scanning by hand is the common case these
// shortcuts remove. Each returns [from, to].
const PERIOD_PRESETS: { label: string; range: () => [string, string] }[] = [
  {
    label: "This month",
    range: () => {
      const n = new Date();
      return [isoDay(new Date(n.getFullYear(), n.getMonth(), 1)), isoDay(n)];
    },
  },
  {
    label: "Last 3 months",
    range: () => {
      const n = new Date();
      return [isoDay(new Date(n.getFullYear(), n.getMonth() - 2, 1)), isoDay(n)];
    },
  },
  {
    label: "Last 12 months",
    range: () => {
      const n = new Date();
      return [isoDay(new Date(n.getFullYear(), n.getMonth() - 11, 1)), isoDay(n)];
    },
  },
];

export default function ArPayoutsPage() {
  const [payouts, setPayouts] = useState<ArPayout[]>([]);
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [cityTab, setCityTab] = useState<"manila" | "dubai">("manila");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [storeFilter, setStoreFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  // Empty means no bound, so the default view stays "everything".
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<ArPayout | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [driveUrl, setDriveUrl] = useState<string | null>(null);
  const [gaps, setGaps] = useState<Gaps | null>(null);
  const [cutoffs, setCutoffs] = useState<Cutoffs>({});
  const [cutoffDraft, setCutoffDraft] = useState("");
  const [cutoffSaving, setCutoffSaving] = useState(false);
  const [editingCutoff, setEditingCutoff] = useState(false);
  const [deletingZeros, setDeletingZeros] = useState(false);
  const [deleteZeroResult, setDeleteZeroResult] = useState<string | null>(null);

  const auth = getAuth();
  const confirmerName = auth?.staffName || "Unknown";

  const loadGaps = useCallback(async () => {
    try {
      const [g, c] = await Promise.all([
        fetch("/api/admin/ar-payouts/gaps", { cache: "no-store" }),
        fetch("/api/admin/ar-payouts/cutoff", { cache: "no-store" }),
      ]);
      if (g.ok) setGaps(await g.json());
      if (c.ok) setCutoffs((await c.json()).cutoffs || {});
    } catch {
      // A missing coverage check must not blank the page it sits on.
    }
  }, []);

  useEffect(() => { void loadGaps(); }, [loadGaps]);

  const saveCutoff = async (date: string | null) => {
    setCutoffSaving(true);
    try {
      const res = await fetch("/api/admin/ar-payouts/cutoff", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ city: cityTab, cutoff_date: date }),
      });
      if (res.ok) {
        setCutoffs((await res.json()).cutoffs || {});
        setEditingCutoff(false);
        fetchPayouts();
      }
    } finally {
      setCutoffSaving(false);
    }
  };

  useEffect(() => {
    fetch("/api/admin/ar-payouts/drive-url")
      .then((r) => r.json())
      .then((d) => { if (d.url) setDriveUrl(d.url); })
      .catch(() => {});
  }, []);

  const fetchPayouts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("city", cityTab);
    if (platformFilter !== "all") params.set("platform", platformFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (storeFilter !== "all") params.set("store_code", storeFilter);
    if (cityTab === "dubai" && brandFilter !== "all") params.set("brand", brandFilter);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const res = await fetch(`/api/admin/ar-payouts?${params}`);
    if (res.ok) {
      const data = await res.json();
      setPayouts(data.payouts || []);
      setKpi(data.kpi || null);
      setTruncated(Boolean(data.truncated));
    }
    setLoading(false);
  }, [cityTab, platformFilter, statusFilter, storeFilter, brandFilter, dateFrom, dateTo]);

  useEffect(() => { fetchPayouts(); }, [fetchPayouts]);

  // Reset tab-specific filters when switching cities
  const switchCity = (city: "manila" | "dubai") => {
    setCityTab(city);
    setPlatformFilter("all");
    setStoreFilter("all");
    setBrandFilter("all");
  };

  const handleDeleteTalabatZeros = async () => {
    if (!confirm("Delete all unconfirmed Talabat rows with AED 0.00 expected amount? This cannot be undone.")) return;
    setDeletingZeros(true);
    setDeleteZeroResult(null);
    try {
      const res = await fetch("/api/admin/ar-payouts/talabat-zeros", {
        method: "DELETE",
        headers: await getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteZeroResult(`Error: ${data.detail || res.statusText}`);
      } else {
        setDeleteZeroResult(`Deleted ${data.deleted} zero-amount Talabat rows.`);
        fetchPayouts();
      }
    } catch (err) {
      setDeleteZeroResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeletingZeros(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/ar-payouts/sync", { method: "POST" });
      const data = await res.json();
      setLastSync(new Date().toLocaleTimeString("en-PH"));
      if (!res.ok) {
        setSyncResult(`Sync failed: ${data.detail || res.statusText}`);
      } else if (data.new_files_found === 0) {
        setSyncResult("No new files found in Drive.");
      } else {
        const parts = data.files.map((f: { file: string; rows: number; platform: string }) =>
          `${f.file}: ${f.rows} records`
        ).join(", ");
        setSyncResult(`Imported ${data.total_inserted} records from ${data.new_files_found} file(s). ${parts}`);
      }
      if (data.errors?.length) {
        setSyncResult((prev) => `${prev || ""} Errors: ${data.errors.map((e: { file: string; error: string }) => e.file).join(", ")}`);
      }
      await fetchPayouts();
    } catch (err) {
      setLastSync(new Date().toLocaleTimeString("en-PH"));
      setSyncResult(`Sync error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  };

  // Nobody holds channel.admin.ar_payouts.manage -- HQ and ADMIN get in on the
  // role name alone. So the first person given AR Payouts through Role
  // Management gets a page full of Confirm buttons that answer 403, and until
  // this threw, the modal closed on that 403 exactly as it closes on success.
  // On a page that records money received, a save that quietly does nothing is
  // worse than one that refuses.
  const handleConfirm = async (bankAmount: number, note: string) => {
    if (!confirmTarget) return;
    const res = await fetch(`/api/admin/ar-payouts/${confirmTarget.id}/confirm`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bank_amount: bankAmount, confirmed_by: confirmerName, note }),
    });
    if (!res.ok) {
      const text = await res.text();
      let detail = text;
      try { detail = JSON.parse(text).detail || text; } catch { /* plain-text error */ }
      throw new Error(`Not saved — ${detail || res.statusText}`);
    }
    setConfirmTarget(null);
    await fetchPayouts();
  };

  const handleUnconfirm = async (payout: ArPayout) => {
    if (!confirm(`Unconfirm this payout (${PLATFORM_LABEL[payout.platform] || payout.platform} ${payout.payout_id})?`)) return;
    const res = await fetch(`/api/admin/ar-payouts/${payout.id}/unconfirm`, { method: "PATCH" });
    if (!res.ok) {
      const text = await res.text();
      let detail = text;
      try { detail = JSON.parse(text).detail || text; } catch { /* plain-text error */ }
      alert(`Not undone — ${detail || res.statusText}`);
      return;
    }
    await fetchPayouts();
  };


  const handleUpload = async (files: FileList | File[], city: "manila" | "dubai" = "manila") => {
    const exts = city === "dubai" ? [".pdf", ".xlsx", ".csv"] : [".csv"];
    const arr = Array.from(files).filter((f) => exts.some((ext) => f.name.toLowerCase().endsWith(ext)));
    if (!arr.length) { setUploadError(`Please select ${exts.join(" or ")} files.`); return; }
    setUploading(true);
    setUploadResult(null);
    setUploadError(null);
    try {
      const body = new FormData();
      arr.forEach((f) => body.append("files", f));
      const res = await fetch("/api/admin/ar-payouts/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(`Upload failed: ${data.detail || res.statusText}`);
      } else {
        type FileResult = { file: string; rows: number; drive_folder: string | null; skipped?: boolean };
        const fileResults = data.files as FileResult[];
        const newFiles = fileResults.filter((f) => !f.skipped && f.rows > 0);
        const skippedFiles = fileResults.filter((f) => f.skipped);
        const parts: string[] = [];
        if (newFiles.length) {
          parts.push(newFiles.map((f) => `${f.file}: ${f.rows} records${f.drive_folder ? ` → Drive/${f.drive_folder}` : ""}`).join(", "));
        }
        if (skippedFiles.length) {
          parts.push(`Already imported (skipped): ${skippedFiles.map((f) => f.file).join(", ")}`);
        }
        if (data.total_inserted === 0 && skippedFiles.length === fileResults.length) {
          setUploadResult("⚠ Already imported — no new records added.");
        } else {
          setUploadResult(`Imported ${data.total_inserted} record(s). ${parts.join(" | ")}`);
        }
      }
      const driveErrors = (data.errors as { file: string; error: string }[] | undefined)
        ?.filter((e) => e.error.includes("Drive upload failed")) ?? [];
      const otherErrors = (data.errors as { file: string; error: string }[] | undefined)
        ?.filter((e) => !e.error.includes("Drive upload failed")) ?? [];
      if (driveErrors.length) {
        setUploadError(`Drive save failed for: ${driveErrors.map((e) => e.file).join(", ")} — check Drive permissions (service account needs Contributor role).`);
      }
      if (otherErrors.length) {
        setUploadError((prev) => `${prev ? prev + " " : ""}Errors: ${otherErrors.map((e) => `${e.file} — ${e.error}`).join("; ")}`);
      }
      await fetchPayouts();
    } catch (err) {
      setUploadError(`Upload error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  };

  // Derive unique store codes for filter
  const storeCodes = Array.from(new Set(payouts.map((p) => p.store_code))).sort();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className={T_PAGE_TITLE}>AR Payouts</h1>
            <p className="mt-1 text-sm text-white/40">
              {cityTab === "dubai"
                ? "Careem, Keeta, Talabat, Noon & Smiles settlements (AED) — confirm receipt against bank statement"
                : "Grab & Foodpanda settlements (PHP) — confirm receipt against bank statement"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              {driveUrl && (
                <a
                  href={driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors"
                >
                  <svg className="h-4 w-4" viewBox="0 0 87.3 78" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA"/>
                    <path d="M43.65 25L29.9 0c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.5C.4 49.9 0 51.45 0 53h27.5z" fill="#00AC47"/>
                    <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z" fill="#EA4335"/>
                    <path d="M43.65 25L57.4 0H29.9z" fill="#00832D"/>
                    <path d="M59.8 53H87.3L73.55 28.5 59.8 53z" fill="#2684FC"/>
                    <path d="M43.65 25L57.4 0 73.55 28.5 59.8 53H27.5z" fill="#00AC47"/>
                    <path d="M43.65 25L27.5 53h32.3z" fill="#00831E"/>
                    <path d="M13.75 76.8l13.75-23.8H0l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3z" fill="#0066DA" opacity=".5"/>
                  </svg>
                  Drive Folder
                </a>
              )}
              <button
                onClick={handleDeleteTalabatZeros}
                disabled={deletingZeros}
                className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 transition disabled:opacity-40"
                title="Delete all unconfirmed Talabat rows where Expected = AED 0.00"
              >
                {deletingZeros ? "Deleting…" : "🗑 Talabat Zero Rows"}
              </button>
              <button
                onClick={handleSync}
                disabled={syncing}
                className={`${PRIMARY_BUTTON} flex items-center gap-2`}
              >
                {syncing ? (
                  <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Syncing…</>
                ) : (
                  <>↻ Sync from Drive</>
                )}
              </button>
            </div>
            {lastSync && (
              <span className="text-xs text-white/30">Last sync: {lastSync}</span>
            )}
          </div>
        </div>

        {deleteZeroResult && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${deleteZeroResult.startsWith("Error") ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-green-500/20 bg-green-500/10 text-green-300"}`}>
            {deleteZeroResult}
          </div>
        )}
        {syncResult && (
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-300">
            {syncResult}
          </div>
        )}

        {/* City Tabs */}
        <div className="flex gap-1 rounded-xl border border-white/8 bg-white/3 p-1 w-fit">
          {(["manila", "dubai"] as const).map((city) => (
            <button
              key={city}
              onClick={() => switchCity(city)}
              className={`rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
                cityTab === city
                  ? "bg-violet-600/70 text-white shadow"
                  : "text-white/50 hover:text-white/70"
              }`}
            >
              {city === "manila" ? "🇵🇭 Manila" : "🇦🇪 Dubai"}
            </button>
          ))}
        </div>

        {/* Upload Zone — Manila (CSV) */}
        {cityTab === "manila" && (<>
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleUpload(e.dataTransfer.files, "manila"); }}
          className={`relative rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${isDragging ? "border-violet-400/60 bg-violet-500/10" : "border-white/10 bg-white/2 hover:border-white/20"}`}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="text-3xl">📂</div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-white/70">
                {uploading ? "Uploading…" : "Drop CSV files here, or click to select"}
              </p>
              <p className="text-xs text-white/30">
                Grab: <span className="font-mono">Taft_Transfers_Store_*.csv</span> &nbsp;·&nbsp; Foodpanda: <span className="font-mono">Taft_Payouts_*.csv</span>
              </p>
            </div>
            <label className={`cursor-pointer ${PRIMARY_BUTTON} text-sm px-4 py-1.5 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
              {uploading ? "Uploading…" : "Select Files"}
              <input type="file" accept=".csv" multiple className="sr-only"
                onChange={(e) => e.target.files && handleUpload(e.target.files, "manila")} />
            </label>
          </div>
        </div>
        {uploadResult && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">✓ {uploadResult}</div>}
        {uploadError && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">✗ {uploadError}</div>}
        </>)}

        {/* Upload Zone — Dubai (Careem PDF / Keeta + Talabat XLSX). Noon is API-only. */}
        {cityTab === "dubai" && (<>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* File upload: Careem PDF / Keeta XLSX / Talabat XLSX */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wide mb-2">Careem / Keeta / Talabat</p>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleUpload(e.dataTransfer.files, "dubai"); }}
              className={`relative rounded-xl border-2 border-dashed px-6 py-6 text-center transition-colors ${isDragging ? "border-violet-400/60 bg-violet-500/10" : "border-white/10 bg-white/2 hover:border-white/20"}`}
            >
              <div className="flex flex-col items-center gap-2">
                <div className="text-3xl">📂</div>
                <p className="text-sm font-medium text-white/70">
                  {uploading ? "Uploading…" : "Drop PDF or XLSX"}
                </p>
                <p className="text-xs text-white/30 space-y-0.5">
                  Careem: any <span className="font-mono">.pdf</span> payout report<br />
                  Keeta: <span className="font-mono">bill-[...].xlsx</span><br />
                  Talabat: any <span className="font-mono">.xlsx</span> payout report
                </p>
                <label className={`cursor-pointer ${PRIMARY_BUTTON} text-sm px-4 py-1.5 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                  {uploading ? "Uploading…" : "Select Files"}
                  <input type="file" accept=".pdf,.xlsx" multiple className="sr-only"
                    onChange={(e) => e.target.files && handleUpload(e.target.files, "dubai")} />
                </label>
              </div>
            </div>
          </div>

          {/* Noon comes from the portal API now — see scripts/noon/get-payouts.js */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wide mb-2">Noon</p>
            <div className="rounded-xl border border-white/10 bg-white/3 px-5 py-5">
              <div className="flex items-start gap-3">
                <span className="text-lg leading-none">🔗</span>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-white/70">Pulled automatically from Noon</p>
                  <p className="text-xs leading-relaxed text-white/40">
                    Payouts now come straight from the Noon portal, split per outlet.
                    Uploading the statement CSV or entering an amount here would record the
                    same money a second time, so both were removed.
                  </p>
                  <p className="text-xs leading-relaxed text-white/40">
                    Noon sign-in lapses after about two days, so this runs weekly rather than
                    nightly: sign in, then start
                    <span className="text-white/60"> Noon Food Dubai — Biweekly Payout Extract</span>.
                  </p>
                  <code className="block rounded-lg bg-black/30 px-3 py-2 text-[11px] text-white/50">
                    node scripts/noon/setup-session.js --upload
                  </code>
                </div>
              </div>
            </div>
          </div>
        </div>

        {uploadResult && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">✓ {uploadResult}</div>}
        {uploadError && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">✗ {uploadError}</div>}
        </>)}

        {/* Records that never arrived.
            Every row this page holds is correct; the defect is that there are
            fewer of them than there should be, and a correct table cannot show
            you that. Grab had paid every single day for 517 consecutive
            payouts and then went six days silent with nothing anywhere saying
            so. Each stream is judged against its own history, so Grab counts
            as late after a day and Smiles after a month. */}
        {gaps && (() => {
          const stale = gaps.platform_stale.filter((g) => g.city === cityTab);
          const behind = gaps.store_behind.filter((g) => g.city === cityTab);
          const roster = gaps.roster_changed.filter((g) => g.city === cityTab);
          if (!stale.length && !behind.length && !roster.length) {
            return (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-4 py-2.5 text-sm text-emerald-300/80">
                <span>✓</span>
                <span>
                  Every platform is paying on its usual rhythm as of {fmtDate(gaps.as_of)}.
                </span>
              </div>
            );
          }
          return (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3.5">
              <div className="mb-2 text-sm font-semibold text-amber-200">
                Payout records have stopped arriving
              </div>
              <ul className="space-y-2 text-sm text-amber-100/85">
                {stale.map((g) => (
                  <li key={`s-${g.platform}`}>
                    <span className="font-semibold">
                      {PLATFORM_LABEL[g.platform] || g.platform} has paid nothing since {fmtDate(g.last_date)}
                    </span>{" "}
                    — {g.days_since} days, and it normally pays every{" "}
                    {g.typical_days === 1 ? "day" : `${g.typical_days} days`}. About{" "}
                    {g.likely_missing} payout{g.likely_missing === 1 ? "" : "s"} missing across{" "}
                    {g.stores} store{g.stores === 1 ? "" : "s"}.
                  </li>
                ))}
                {behind.map((g) => (
                  <li key={`b-${g.platform}-${g.store_code}`}>
                    <span className="font-semibold">
                      {PLATFORM_LABEL[g.platform] || g.platform} {g.store_code}
                    </span>{" "}
                    last paid {fmtDate(g.last_date)} while the rest of{" "}
                    {PLATFORM_LABEL[g.platform] || g.platform} was paid up to{" "}
                    {fmtDate(g.platform_last)} — {g.behind_days} days behind, about{" "}
                    {g.missing_cycles} payout{g.missing_cycles === 1 ? "" : "s"}.
                  </li>
                ))}
                {roster.map((g) => (
                  <li key={`r-${g.platform}`}>
                    <span className="font-semibold">
                      {PLATFORM_LABEL[g.platform] || g.platform} store codes were replaced
                    </span>{" "}
                    — recent payouts arrive as {g.new_codes.slice(0, 5).join(", ")}
                    {g.new_codes.length > 5 ? "…" : ""}, which have no history, while{" "}
                    {g.old_codes.join(", ")} stopped. Nothing at all since{" "}
                    {fmtDate(g.last_date)} ({g.days_since} days). Which outlets are covered
                    cannot be judged until the codes match.
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-[11px] leading-relaxed text-amber-200/50">
                This is almost always an expired portal session: nobody can export, so
                nothing lands in Drive. Sign back into the portal and export the missing
                period — the import runs by itself once the file is in Finance/Payouts,
                so there is no button to remember afterwards.
              </p>
            </div>
          );
        })()}

        {/* KPI Cards */}
        {kpi && (
          <div className="grid grid-cols-3 gap-4">
            <div className={`${KPI_CARD} border-emerald-500/15`}>
              <div className="text-xs text-white/40 uppercase tracking-wide mb-1">Reconciled</div>
              <div className="text-2xl font-bold text-emerald-400">{kpi.reconciled_count}</div>
              <div className="text-sm text-white/50">{fmtAmount(kpi.reconciled_amount, cityTab === "dubai" ? "AED" : "PHP")}</div>
            </div>
            <div className={`${KPI_CARD} border-amber-500/15`}>
              <div className="text-xs text-white/40 uppercase tracking-wide mb-1">Bank Pending</div>
              <div className="text-2xl font-bold text-amber-400">{kpi.pending_count}</div>
              <div className="text-sm text-white/50">{fmtAmount(kpi.pending_amount, cityTab === "dubai" ? "AED" : "PHP")}</div>
            </div>
            {/* "Overdue" said money was late. It is not what the number counts:
                a row lands here when nobody has ticked it off against the bank
                within seven days of the payout date. Manila's ₱15.5M covers
                every import back to February and the only person who has ever
                confirmed anything did 53 rows across five days in August — so
                the figure is the size of the checking backlog, not money the
                platforms owe. Read as "overdue" it says the aggregators are
                ₱15.5M behind, which nothing here establishes. */}
            <div className={`${KPI_CARD} border-red-500/15`}>
              <div className="text-xs text-white/40 uppercase tracking-wide mb-1">Not checked yet</div>
              <div className="text-2xl font-bold text-red-400">{kpi.overdue_count}</div>
              <div className="text-sm text-white/50">{fmtAmount(kpi.overdue_amount, cityTab === "dubai" ? "AED" : "PHP")}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-white/35">
                Payout was 7+ days ago and nobody has confirmed it against the bank.
                This is what is unchecked — not money the platform owes.
              </div>
              {/* The backlog ran to seven months, and a number nobody can ever
                  bring down is read as decoration rather than as work. Setting a
                  date stops counting what came before it. Nothing is deleted and
                  nothing is marked confirmed — those rows keep saying plainly
                  that they were never checked, and the count of them is printed
                  right here, because an exclusion you can see is a decision and
                  one you cannot see is a lie. */}
              {editingCutoff ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <input
                    type="date"
                    value={cutoffDraft}
                    onChange={(e) => setCutoffDraft(e.target.value)}
                    className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white"
                  />
                  <button
                    disabled={cutoffSaving || !cutoffDraft}
                    onClick={() => void saveCutoff(cutoffDraft)}
                    className="rounded-lg bg-violet-500/25 px-2 py-1 text-[11px] text-violet-200 hover:bg-violet-500/35 disabled:opacity-40"
                  >
                    {cutoffSaving ? "Saving…" : "Stop counting before this"}
                  </button>
                  {cutoffs[cityTab] && (
                    <button
                      disabled={cutoffSaving}
                      onClick={() => void saveCutoff(null)}
                      className="rounded-lg border border-white/15 px-2 py-1 text-[11px] text-white/50 hover:bg-white/5"
                    >
                      Count them all again
                    </button>
                  )}
                  <button
                    onClick={() => setEditingCutoff(false)}
                    className="px-1.5 py-1 text-[11px] text-white/35 hover:text-white/60"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setCutoffDraft(cutoffs[cityTab]?.cutoff_date || "");
                    setEditingCutoff(true);
                  }}
                  className="mt-2 text-left text-[11px] leading-relaxed text-white/30 underline decoration-dotted underline-offset-2 hover:text-white/60"
                >
                  {cutoffs[cityTab]
                    ? `Not counting the ${kpi.archived_count} payout${kpi.archived_count === 1 ? "" : "s"} before ${fmtDate(cutoffs[cityTab].cutoff_date)} — still listed, still unchecked. Change`
                    : "Counting every unchecked payout ever imported. Set a cutoff date"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {/* Platform — options differ by city */}
          {(cityTab === "dubai" ? ["all", "careem", "keeta", "talabat", "noon", "smiles"] : ["all", "grab", "foodpanda"]).map((p) => (
            <button
              key={p}
              onClick={() => setPlatformFilter(p)}
              className={`rounded-xl border px-4 py-1.5 text-sm font-medium transition-colors ${
                platformFilter === p
                  ? "border-violet-500/40 bg-violet-500/20 text-violet-300"
                  : "border-white/10 bg-white/5 text-white/50 hover:bg-white/8"
              }`}
            >
              {p === "all" ? "All Platforms" : PLATFORM_LABEL[p]}
            </button>
          ))}
          <div className="w-px bg-white/10" />
          {/* Status */}
          {["all", "reconciled", "pending", "overdue", ...(kpi?.archived_count ? ["archived"] : [])].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-xl border px-4 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === s
                  ? "border-violet-500/40 bg-violet-500/20 text-violet-300"
                  : "border-white/10 bg-white/5 text-white/50 hover:bg-white/8"
              }`}
            >
              {s === "all" ? "All Status" : STATUS_LABEL[s]}
            </button>
          ))}
          {/* Brand filter — Dubai only */}
          {cityTab === "dubai" && (
            <>
              <div className="w-px bg-white/10" />
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/70 focus:outline-none"
              >
                {/* Values must be the brand as stored, not as displayed: the filter is an
                    equality match, and "Ramen Zen" matched nothing while the rows said
                    ramen_zen. All Veggie Sushi was missing from the list entirely. */}
                <option value="all">All Brands</option>
                <option value="sushi_zen">Sushi ZEN</option>
                <option value="ramen_zen">Ramen ZEN</option>
                <option value="all_veggie">All Veggie Sushi</option>
              </select>
            </>
          )}
          {/* Period — filters on payout date, the column shown in the table */}
          <div className="w-px bg-white/10" />
          <div className="flex flex-wrap items-center gap-2">
            {PERIOD_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => { const r = preset.range(); setDateFrom(r[0]); setDateTo(r[1]); }}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/50 transition-colors hover:bg-white/8"
              >
                {preset.label}
              </button>
            ))}
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="Payouts from"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/70 focus:outline-none"
            />
            <span className="text-sm text-white/30">→</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="Payouts to"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/70 focus:outline-none"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/50 transition-colors hover:bg-white/8"
              >
                Clear
              </button>
            )}
          </div>

          {storeCodes.length > 1 && (
            <>
              <div className="w-px bg-white/10" />
              <select
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/70 focus:outline-none"
              >
                <option value="all">All Stores</option>
                {storeCodes.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </>
          )}
        </div>

        {truncated && (
          <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
            Showing the most recent {payouts.length} payouts only — older ones are not listed.
            Narrow the filters to see them.
          </div>
        )}

        {/* Table */}
        <div className={GLASS_CARD}>
          {loading ? (
            <div className="flex h-40 items-center justify-center text-white/40">Loading…</div>
          ) : payouts.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-white/40">
              <span className="text-4xl">🏦</span>
              <span className="text-sm">No payout records found.</span>
              <span className="text-xs">Click &ldquo;Sync from Drive&rdquo; after uploading CSV files to Google Drive.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-left text-xs text-white/40 uppercase tracking-wide">
                    <th className="px-4 py-3">Platform</th>
                    {cityTab === "dubai" && <th className="px-4 py-3">Brand</th>}
                    <th className="px-4 py-3">Store</th>
                    <th className="px-4 py-3">Period / Payout ID</th>
                    <th className="px-4 py-3 text-right">Expected</th>
                    <th className="px-4 py-3">Payout Date</th>
                    <th className="px-4 py-3">Orders</th>
                    <th className="px-4 py-3 text-right">Bank Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Confirmed</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {payouts.map((p) => (
                    <tr key={p.id} className="hover:bg-white/3 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${PLATFORM_COLOR[p.platform] || "text-white/60 bg-white/5 border-white/10"}`}>
                          {PLATFORM_LABEL[p.platform] || p.platform}
                        </span>
                      </td>
                      {cityTab === "dubai" && (
                        <td className="px-4 py-3 text-xs text-white/60">{p.brand || "—"}</td>
                      )}
                      <td className="px-4 py-3 font-mono text-xs text-white/70">{p.store_code}</td>
                      <td className="px-4 py-3 max-w-[160px]">
                        {p.period_start && p.period_end ? (
                          <div>
                            <div className="text-xs text-white/70 tabular-nums">
                              {fmtDate(p.period_start)} – {fmtDate(p.period_end)}
                            </div>
                            <div className="font-mono text-xs text-white/30 truncate" title={p.payout_id}>{p.payout_id}</div>
                          </div>
                        ) : (
                          <span className="font-mono text-xs text-white/60 truncate" title={p.payout_id}>{p.payout_id}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-white tabular-nums">{fmtAmount(p.expected_amount, p.currency)}</td>
                      <td className="px-4 py-3 text-white/70">{fmtDate(p.payout_date)}</td>
                      <td className="px-4 py-3 text-white/50 tabular-nums">{p.orders_count ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {p.bank_confirmed ? (
                          <span className="text-emerald-400">{fmtAmount(p.bank_amount, p.currency)}</span>
                        ) : (
                          <span className="text-white/20">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={STATUS_BADGE[p.ar_status]}>{STATUS_LABEL[p.ar_status]}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-white/40">
                        {p.bank_confirmed ? (
                          <div title={p.confirmation_note || ""}>
                            <div>{p.bank_confirmed_by}</div>
                            <div className="text-white/25">{fmtDate(p.bank_confirmed_at)}</div>
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {p.bank_confirmed ? (
                          <button
                            onClick={() => handleUnconfirm(p)}
                            className="rounded-lg border border-white/10 px-3 py-1 text-xs text-white/40 hover:border-red-500/30 hover:text-red-400 transition-colors"
                          >
                            Undo
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmTarget(p)}
                            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                          >
                            ✓ Confirm
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Drive setup hint */}
        <div className="rounded-xl border border-white/5 bg-white/3 px-4 py-3 text-xs text-white/30">
          {cityTab === "dubai" ? (
            <>
              <strong className="text-white/50">Dubai / Careem:</strong>{" "}
              Download Payment Summary PDFs from the Careem Partner Portal and upload to{" "}
              <em>Finance / Payouts / Dubai / Careem /</em> in Google Drive. Outlet ID is read from the PDF content automatically.
              Service account: <span className="font-mono">ar-finance-reader@ar-finance-reader.iam.gserviceaccount.com</span>
            </>
          ) : (
            <>
              <strong className="text-white/50">Drive upload folder:</strong>{" "}
              Upload Grab <em>Taft_Transfers_Store_*.csv</em> (or Paranaque_, QC_) and Foodpanda <em>Taft_Payouts_*.csv</em> (or Paranaque_, Cubao_) anywhere inside{" "}
              <em>Finance / Payouts</em>, then click &ldquo;Sync from Drive&rdquo;. Platform and store are detected automatically from filename.
              Service account: <span className="font-mono">ar-finance-reader@ar-finance-reader.iam.gserviceaccount.com</span>
            </>
          )}
        </div>
      </div>

      {/* Confirm Modal */}
      {confirmTarget && (
        <ConfirmModal
          payout={confirmTarget}
          onClose={() => setConfirmTarget(null)}
          onSave={handleConfirm}
        />
      )}
    </div>
  );
}
