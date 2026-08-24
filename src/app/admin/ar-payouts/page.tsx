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
  ar_status: "reconciled" | "pending" | "overdue";
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

const PLATFORM_LABEL: Record<string, string> = { grab: "Grab", foodpanda: "Foodpanda", careem: "Careem" };
const PLATFORM_COLOR: Record<string, string> = {
  grab: "text-green-400 bg-green-500/10 border-green-500/25",
  foodpanda: "text-pink-400 bg-pink-500/10 border-pink-500/25",
  careem: "text-teal-300 bg-teal-500/10 border-teal-500/25",
};

const STATUS_BADGE: Record<string, string> = {
  reconciled: BADGE_SUCCESS,
  pending: BADGE_WARNING,
  overdue: BADGE_ERROR,
};
const STATUS_LABEL: Record<string, string> = {
  reconciled: "🟢 Reconciled",
  pending: "🟡 Bank Pending",
  overdue: "🔴 Overdue",
};

// ─── Confirm Modal ────────────────────────────────────────────────────────────

function ConfirmModal({
  payout, onClose, onSave,
}: {
  payout: ArPayout;
  onClose: () => void;
  onSave: (bankAmount: number, note: string) => Promise<void>;
}) {
  const [bankAmount, setBankAmount] = useState(
    payout.bank_amount != null ? String(payout.bank_amount) : String(payout.expected_amount)
  );
  const [note, setNote] = useState(payout.confirmation_note || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const amt = parseFloat(bankAmount);
    if (isNaN(amt) || amt <= 0) { alert("Enter a valid bank amount."); return; }
    setSaving(true);
    try { await onSave(amt, note); } finally { setSaving(false); }
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
            Bank Amount Received (₱)
          </label>
          <input
            type="number"
            step="0.01"
            value={bankAmount}
            onChange={(e) => setBankAmount(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-violet-500/50 focus:outline-none"
          />
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

export default function ArPayoutsPage() {
  const [payouts, setPayouts] = useState<ArPayout[]>([]);
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [cityTab, setCityTab] = useState<"manila" | "dubai">("manila");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [storeFilter, setStoreFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [confirmTarget, setConfirmTarget] = useState<ArPayout | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [driveUrl, setDriveUrl] = useState<string | null>(null);
  // Noon manual entry
  const [noonPeriodStart, setNoonPeriodStart] = useState("");
  const [noonPeriodEnd, setNoonPeriodEnd] = useState("");
  const [noonAmount, setNoonAmount] = useState("");
  const [noonBrand, setNoonBrand] = useState<"sushi_zen" | "ramen_zen">("sushi_zen");
  const [noonSaving, setNoonSaving] = useState(false);
  const [noonResult, setNoonResult] = useState<string | null>(null);
  const [noonError, setNoonError] = useState<string | null>(null);
  const [deletingZeros, setDeletingZeros] = useState(false);
  const [deleteZeroResult, setDeleteZeroResult] = useState<string | null>(null);

  const auth = getAuth();
  const confirmerName = auth?.staffName || "Unknown";

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
    const res = await fetch(`/api/admin/ar-payouts?${params}`);
    if (res.ok) {
      const data = await res.json();
      setPayouts(data.payouts || []);
      setKpi(data.kpi || null);
    }
    setLoading(false);
  }, [cityTab, platformFilter, statusFilter, storeFilter, brandFilter]);

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

  const handleConfirm = async (bankAmount: number, note: string) => {
    if (!confirmTarget) return;
    await fetch(`/api/admin/ar-payouts/${confirmTarget.id}/confirm`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bank_amount: bankAmount, confirmed_by: confirmerName, note }),
    });
    setConfirmTarget(null);
    await fetchPayouts();
  };

  const handleUnconfirm = async (payout: ArPayout) => {
    if (!confirm(`Unconfirm this payout (${PLATFORM_LABEL[payout.platform]} ${payout.payout_id})?`)) return;
    await fetch(`/api/admin/ar-payouts/${payout.id}/unconfirm`, { method: "PATCH" });
    await fetchPayouts();
  };

  const handleNoonEntry = async () => {
    if (!noonPeriodStart || !noonPeriodEnd || !noonAmount) { setNoonError("All fields required."); return; }
    setNoonSaving(true); setNoonResult(null); setNoonError(null);
    try {
      const res = await fetch("/api/admin/ar-payouts/manual-noon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_start: noonPeriodStart, period_end: noonPeriodEnd, payout_aed: parseFloat(noonAmount), brand: noonBrand }),
      });
      const data = await res.json();
      if (!res.ok) { setNoonError(data.detail || "Failed"); return; }
      setNoonResult(data.inserted ? `Saved: AED ${noonAmount} for ${noonBrand === "sushi_zen" ? "Sushi ZEN" : "Ramen ZEN"} (${noonPeriodStart} – ${noonPeriodEnd})` : "Already exists — updated.");
      setNoonAmount(""); setNoonPeriodStart(""); setNoonPeriodEnd("");
      await fetchPayouts();
    } catch (e) { setNoonError(String(e)); }
    finally { setNoonSaving(false); }
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
                ? "Careem settlement tracking (AED) — confirm receipt against bank statement"
                : "Grab & Foodpanda settlement tracking — confirm receipt against bank statement"}
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

        {/* Upload Zone — Dubai (PDF + XLSX) + Noon manual entry */}
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
                  {uploading ? "Uploading…" : "Drop PDF, XLSX, or Noon CSV"}
                </p>
                <p className="text-xs text-white/30 space-y-0.5">
                  Careem: any <span className="font-mono">.pdf</span> payout report<br />
                  Keeta: <span className="font-mono">bill-[...].xlsx</span><br />
                  Talabat: any <span className="font-mono">.xlsx</span> payout report<br />
                  Noon: <span className="font-mono">statement_orders_*.csv</span>
                </p>
                <label className={`cursor-pointer ${PRIMARY_BUTTON} text-sm px-4 py-1.5 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                  {uploading ? "Uploading…" : "Select Files"}
                  <input type="file" accept=".pdf,.xlsx,.csv" multiple className="sr-only"
                    onChange={(e) => e.target.files && handleUpload(e.target.files, "dubai")} />
                </label>
              </div>
            </div>
          </div>

          {/* Noon manual entry */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wide mb-2">Noon — Manual Entry</p>
            <div className="rounded-xl border border-white/10 bg-white/3 px-5 py-5 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-white/40 block mb-1">Period Start</label>
                  <input type="date" value={noonPeriodStart} onChange={(e) => setNoonPeriodStart(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500/50" />
                </div>
                <div>
                  <label className="text-xs text-white/40 block mb-1">Period End</label>
                  <input type="date" value={noonPeriodEnd} onChange={(e) => setNoonPeriodEnd(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-white/40 block mb-1">Amount (AED)</label>
                  <input type="number" step="0.01" min="0" value={noonAmount} onChange={(e) => setNoonAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50" />
                </div>
                <div>
                  <label className="text-xs text-white/40 block mb-1">Brand</label>
                  <select value={noonBrand} onChange={(e) => setNoonBrand(e.target.value as "sushi_zen" | "ramen_zen")}
                    className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500/50">
                    <option value="sushi_zen">Sushi ZEN</option>
                    <option value="ramen_zen">Ramen ZEN</option>
                  </select>
                </div>
              </div>
              <button onClick={handleNoonEntry} disabled={noonSaving}
                className={`${PRIMARY_BUTTON} w-full text-sm py-1.5 ${noonSaving ? "opacity-50" : ""}`}>
                {noonSaving ? "Saving…" : "Save Noon Payout"}
              </button>
              {noonResult && <p className="text-xs text-emerald-400">✓ {noonResult}</p>}
              {noonError && <p className="text-xs text-red-400">✗ {noonError}</p>}
            </div>
          </div>
        </div>

        {uploadResult && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">✓ {uploadResult}</div>}
        {uploadError && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">✗ {uploadError}</div>}
        </>)}

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
            <div className={`${KPI_CARD} border-red-500/15`}>
              <div className="text-xs text-white/40 uppercase tracking-wide mb-1">Overdue</div>
              <div className="text-2xl font-bold text-red-400">{kpi.overdue_count}</div>
              <div className="text-sm text-white/50">{fmtAmount(kpi.overdue_amount, cityTab === "dubai" ? "AED" : "PHP")}</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {/* Platform — options differ by city */}
          {(cityTab === "dubai" ? ["all", "careem", "keeta", "talabat", "noon"] : ["all", "grab", "foodpanda"]).map((p) => (
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
          {["all", "reconciled", "pending", "overdue"].map((s) => (
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
                <option value="all">All Brands</option>
                <option value="Sushi ZEN">Sushi ZEN</option>
                <option value="Ramen Zen">Ramen Zen</option>
              </select>
            </>
          )}
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
