"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, FileSpreadsheet, FolderSearch, RefreshCw, Upload, XCircle } from "lucide-react";
import { getAuth } from "@/lib/auth";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
} from "@/lib/ui-tokens";

type XlsxUploadResult = {
  ok?: boolean;
  duplicate?: boolean;
  imported?: number;
  skipped?: number;
  import_batch_id?: string;
  skipped_details?: Array<{ name?: string; date?: string; reason?: string }>;
};

type SyncAllResponse = {
  ok?: boolean;
  files_checked?: number;
  files_imported?: number;
  files_skipped?: number;
  items?: Array<{
    file_id: string;
    file_name: string;
    duplicate?: boolean;
    imported_count?: number;
    message?: string;
    error?: string;
  }>;
};

type SingleSyncResponse = {
  ok?: boolean;
  duplicate?: boolean;
  message?: string;
  import_job?: Record<string, any>;
  drive_file?: {
    id?: string;
    name?: string;
    modifiedTime?: string;
    webViewLink?: string;
  };
};

type DriveFileItem = {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
};

// Always route through Next.js proxy (/api/admin/...) to avoid cross-origin issues
const API_BASE = "";
const DEFAULT_FOLDER_ID = "0AJRy_FdAYDp2Uk9PVA";

function normalizeError(raw: string) {
  const text = String(raw || "").trim();
  const lower = text.toLowerCase();
  if (!text) return "Sync failed. Please try again later.";
  if (lower.includes("invalid pin")) return "Incorrect PIN.";
  if (lower.includes("permission") || lower.includes("forbidden")) return "You do not have sync permission (HQ/ADMIN PIN required).";
  if (lower.includes("attendance drive source not found")) return "Sync source configuration not found.";
  if (lower.includes("no attendance files found")) return "No attendance files found in the Drive folder.";
  return text;
}

async function apiFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, options);
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      const d = j?.detail;
      if (typeof d === "string") detail = d;
      else if (Array.isArray(d)) detail = d.map((e: any) => e?.msg || JSON.stringify(e)).join("; ");
    } catch { /* keep detail = text */ }
    throw new Error(detail || `Request failed`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export default function AttendanceImportPage() {
  const auth = getAuth();
  const folderId = DEFAULT_FOLDER_ID;

  const [approverName, setApproverName] = useState<string>(auth?.staffName || "");
  const [pin, setPin] = useState<string>(auth?.pin || "");
  const [cityHint, setCityHint] = useState<string>("");
  const [driveFileId, setDriveFileId] = useState<string>("");

  const [loadingAll, setLoadingAll] = useState(false);
  const [loadingSelected, setLoadingSelected] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [error, setError] = useState("");
  const [syncAllResult, setSyncAllResult] = useState<SyncAllResponse | null>(null);
  const [singleResult, setSingleResult] = useState<SingleSyncResponse | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[] | null>(null);

  // Excel (Bayzat Attendance Breakdown View) upload
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [xlsxLoading, setXlsxLoading] = useState(false);
  const [xlsxError, setXlsxError] = useState("");
  const [xlsxResult, setXlsxResult] = useState<XlsxUploadResult | null>(null);

  const canSync = useMemo(() => !!approverName.trim() && !!pin.trim(), [approverName, pin]);
  const canSyncSelected = useMemo(() => canSync && !!driveFileId.trim(), [canSync, driveFileId]);

  async function syncAll() {
    if (!canSync) return;
    setLoadingAll(true);
    setError("");
    setSyncAllResult(null);
    setSingleResult(null);
    try {
      const data = await apiFetch<SyncAllResponse>("/api/admin/attendance/drive/sync-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approver_name: approverName.trim(),
          pin: pin.trim(),
          folder_id: folderId,
          city_hint: cityHint.trim().toLowerCase(),
        }),
      });
      setSyncAllResult(data);
    } catch (err: any) {
      setError(normalizeError(String(err?.message || err || "")));
    } finally {
      setLoadingAll(false);
    }
  }

  async function syncSelected() {
    if (!canSyncSelected) return;
    setLoadingSelected(true);
    setError("");
    setSyncAllResult(null);
    setSingleResult(null);
    try {
      const data = await apiFetch<SingleSyncResponse>("/api/admin/attendance/drive/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approver_name: approverName.trim(),
          pin: pin.trim(),
          folder_id: folderId,
          city_hint: cityHint.trim().toLowerCase(),
          drive_file_id: driveFileId.trim(),
        }),
      });
      setSingleResult(data);
    } catch (err: any) {
      setError(normalizeError(String(err?.message || err || "")));
    } finally {
      setLoadingSelected(false);
    }
  }

  async function listFiles() {
    if (!canSync) return;
    setLoadingFiles(true);
    setError("");
    setDriveFiles(null);
    try {
      const params = new URLSearchParams({
        approver_name: approverName.trim(),
        pin: pin.trim(),
        folder_id: folderId,
        limit: "20",
      });
      const data = await apiFetch<{ items: DriveFileItem[] }>(
        `/api/admin/attendance/drive/files?${params}`
      );
      setDriveFiles(data?.items || []);
    } catch (err: any) {
      setError(normalizeError(String(err?.message || err || "")));
    } finally {
      setLoadingFiles(false);
    }
  }

  async function uploadXlsx() {
    if (!xlsxFile) return;
    setXlsxLoading(true);
    setXlsxError("");
    setXlsxResult(null);
    try {
      const authData = getAuth();
      const token = authData?.accessToken;
      const formData = new FormData();
      formData.append("file", xlsxFile);
      const res = await fetch("/api/admin/attendance/import-bayzat-attendance-breakdown", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const text = await res.text();
      if (!res.ok) {
        let detail = text;
        try { const j = JSON.parse(text); if (j?.detail) detail = String(j.detail); } catch { /* keep */ }
        throw new Error(detail || "Upload failed");
      }
      setXlsxResult(JSON.parse(text));
    } catch (err: any) {
      setXlsxError(String(err?.message || err || "Upload failed"));
    } finally {
      setXlsxLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Link href="/admin/attendance" className={SECONDARY_BUTTON}>
              ← Back to Attendance
            </Link>
            <Link href="/admin/attendance/history" className={SECONDARY_BUTTON}>
              Import History
            </Link>
          </div>

          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/20 to-blue-500/10">
              <Upload className="h-5 w-5 text-sky-400" />
            </div>
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-sky-500">ATTENDANCE ADMIN</p>
              <h1 className={T_PAGE_TITLE}>Attendance Drive Sync</h1>
              <p className={T_CAPTION}>Sync Bayzat attendance files from Google Drive. All unimported files will be imported.</p>
            </div>
          </div>

          {/* Credentials + options */}
          <section className={`${GLASS_CARD} p-6 shadow-2xl`}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className={T_LABEL}>Approver Name</span>
                <input
                  className={INPUT_CLASS}
                  value={approverName}
                  onChange={(e) => setApproverName(e.target.value)}
                  placeholder="HQ / ADMIN name"
                />
              </label>

              <label className="space-y-2">
                <span className={T_LABEL}>PIN</span>
                <input
                  type="password"
                  className={INPUT_CLASS}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="PIN"
                />
              </label>

              <label className="space-y-2">
                <span className={T_LABEL}>City Hint (optional)</span>
                <select
                  className={SELECT_CLASS}
                  value={cityHint}
                  onChange={(e) => setCityHint(e.target.value)}
                >
                  <option value="">Auto detect from file</option>
                  <option value="dubai">Dubai</option>
                  <option value="manila">Manila</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className={T_LABEL}>Google Drive Folder ID</span>
                <div
                  className={`${INPUT_CLASS} flex items-center text-zinc-400`}
                  title="Fixed Bayzat shared drive folder"
                >
                  {folderId}
                </div>
                <p className={T_CAPTION}>Fixed Bayzat shared Drive folder</p>
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className={T_LABEL}>Specific Drive File ID (optional)</span>
                <input
                  className={INPUT_CLASS}
                  value={driveFileId}
                  onChange={(e) => setDriveFileId(e.target.value)}
                  placeholder="Enter file ID to sync a specific file"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {/* Check files */}
              <button
                type="button"
                onClick={listFiles}
                disabled={!canSync || loadingFiles}
                className={`${SECONDARY_BUTTON} flex items-center gap-2 disabled:opacity-50`}
              >
                <FolderSearch className="h-4 w-4" />
                {loadingFiles ? "Loading..." : "Drive File List"}
              </button>

              {/* Sync specific file */}
              <button
                type="button"
                onClick={syncSelected}
                disabled={!canSyncSelected || loadingSelected}
                className={`${SECONDARY_BUTTON} flex items-center gap-2 disabled:opacity-50`}
              >
                <RefreshCw className="h-4 w-4" />
                {loadingSelected ? "Syncing..." : "Sync Selected File"}
              </button>

              {/* Sync ALL unimported files */}
              <button
                type="button"
                onClick={syncAll}
                disabled={!canSync || loadingAll}
                className={`${PRIMARY_BUTTON} flex items-center gap-2 disabled:opacity-50`}
              >
                <Upload className="h-4 w-4" />
                {loadingAll ? "Syncing..." : "Sync All"}
              </button>
            </div>
            <p className={`${T_CAPTION} mt-2`}>
              &quot;Sync All&quot; scans all files in the Drive folder and imports any that have not been imported yet.
            </p>
          </section>

          {/* Error */}
          {error ? (
            <div className={`mt-6 ${BADGE_ERROR} inline-flex`}>
              {error}
            </div>
          ) : null}

          {/* Drive file list */}
          {driveFiles !== null ? (
            <section className={`${GLASS_CARD} mt-6 p-4 shadow-2xl sm:p-6`}>
              <div className="mb-3 flex items-center gap-2">
                <FolderSearch className="h-4 w-4 text-sky-400" />
                <div>
                  <h2 className={T_SECTION}>Drive File List</h2>
                  <p className={T_CAPTION}>{driveFiles.length} file(s) found (Folder: {DEFAULT_FOLDER_ID})</p>
                </div>
              </div>
              {driveFiles.length === 0 ? (
                <p className="text-sm text-zinc-400">No files found. Please verify that the service account has access to this folder.</p>
              ) : (
                <div className="space-y-2">
                  {driveFiles.map((f) => (
                    <div key={f.id} className={`${GLASS_CARD} flex flex-wrap items-center justify-between gap-3 p-3`}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{f.name}</p>
                        <p className={`${T_CAPTION} mt-0.5 break-all`}>ID: {f.id}</p>
                        {f.modifiedTime ? <p className={T_CAPTION}>Modified: {f.modifiedTime}</p> : null}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => setDriveFileId(f.id)}
                          className={`${SECONDARY_BUTTON} px-2 py-1 text-xs`}
                        >
                          Use this ID
                        </button>
                        {f.webViewLink ? (
                          <a href={f.webViewLink} target="_blank" rel="noreferrer" className={`${SECONDARY_BUTTON} px-2 py-1 text-xs`}>
                            Open
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {/* Sync All result */}
          {syncAllResult ? (
            <section className={`${GLASS_CARD} mt-6 p-4 shadow-2xl sm:p-6`}>
              <div className="mb-4 flex items-center gap-2">
                <Upload className="h-4 w-4 text-sky-400" />
                <div>
                  <h2 className={T_SECTION}>Sync All Result</h2>
                  <p className={T_CAPTION}>
                    Checked: {syncAllResult.files_checked ?? 0} /
                    Imported: {syncAllResult.files_imported ?? 0} /
                    Skipped (already imported): {syncAllResult.files_skipped ?? 0}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {(syncAllResult.items || []).map((item) => (
                  <div key={item.file_id} className={`${GLASS_CARD} flex flex-wrap items-start gap-3 p-3`}>
                    <div className="mt-0.5 shrink-0">
                      {item.error ? (
                        <XCircle className="h-4 w-4 text-red-400" />
                      ) : item.duplicate ? (
                        <CheckCircle className="h-4 w-4 text-zinc-500" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-emerald-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{item.file_name}</p>
                      <p className={T_CAPTION}>
                        {item.error
                          ? `Error: ${item.error}`
                          : item.duplicate
                          ? "Already imported (skipped)"
                          : `Import complete — ${item.imported_count ?? 0} rows`}
                      </p>
                    </div>
                    {item.duplicate ? (
                      <span className={`${BADGE_INFO} shrink-0 text-xs`}>Skip</span>
                    ) : item.error ? (
                      <span className={`${BADGE_ERROR} shrink-0 text-xs`}>Error</span>
                    ) : (
                      <span className={`${BADGE_SUCCESS} shrink-0 text-xs`}>Imported</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Single file sync result */}
          {singleResult ? (
            <section className={`${GLASS_CARD} mt-6 p-4 shadow-2xl sm:p-6`}>
              <div className="mb-3 flex items-center gap-2 sm:mb-4">
                <Upload className="h-4 w-4 text-sky-400" />
                <div>
                  <h2 className={T_SECTION}>Single File Sync Result</h2>
                </div>
              </div>
              <div className="mb-3 flex flex-wrap gap-2 sm:mb-4">
                <span className={`${singleResult.duplicate ? BADGE_INFO : BADGE_SUCCESS} text-xs`}>
                  {singleResult.message || (singleResult.duplicate ? "Already imported (skipped)" : "Import complete")}
                </span>
              </div>
              <div className="grid gap-2 sm:gap-3 md:grid-cols-2">
                <div className={`${GLASS_CARD} p-3 sm:p-4`}>
                  <p className={T_LABEL}>Drive File Name</p>
                  <p className="mt-1 break-all text-xs leading-relaxed text-zinc-200 sm:text-sm">{singleResult.drive_file?.name || "-"}</p>
                </div>
                <div className={`${GLASS_CARD} p-3 sm:p-4`}>
                  <p className={T_LABEL}>Import Job ID</p>
                  <p className="mt-1 break-all text-xs leading-relaxed text-zinc-200 sm:text-sm">{singleResult.import_job?.id || "-"}</p>
                </div>
              </div>
              {singleResult.drive_file?.webViewLink ? (
                <div className="mt-4">
                  <a href={singleResult.drive_file.webViewLink} target="_blank" rel="noreferrer" className={SECONDARY_BUTTON}>
                    Open in Drive
                  </a>
                </div>
              ) : null}
            </section>
          ) : null}
          {/* ─── Bayzat Attendance Breakdown View Excel Upload ─── */}
          <section className={`${GLASS_CARD} mt-8 p-6 shadow-2xl`}>
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/20 to-green-500/10">
                <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <h2 className={T_SECTION}>Bayzat Attendance Breakdown (.xlsx) Upload</h2>
                <p className={T_CAPTION}>
                  Upload the &quot;Attendance Breakdown View&quot; Excel export from Bayzat directly.
                  City (Dubai / Manila) is inferred automatically from the Department column.
                  Overnight shifts and column-shift anomalies are handled automatically.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <label className="flex-1 space-y-2" style={{ minWidth: 220 }}>
                <span className={T_LABEL}>Excel File (.xlsx)</span>
                <input
                  type="file"
                  accept=".xlsx"
                  className={`${INPUT_CLASS} cursor-pointer file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-sky-600 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white hover:file:bg-sky-500`}
                  onChange={(e) => {
                    setXlsxFile(e.target.files?.[0] ?? null);
                    setXlsxResult(null);
                    setXlsxError("");
                  }}
                />
                {xlsxFile && (
                  <p className={T_CAPTION}>Selected: {xlsxFile.name} ({(xlsxFile.size / 1024).toFixed(0)} KB)</p>
                )}
              </label>

              <button
                type="button"
                onClick={uploadXlsx}
                disabled={!xlsxFile || xlsxLoading}
                className={`${PRIMARY_BUTTON} flex items-center gap-2 disabled:opacity-50`}
              >
                <Upload className="h-4 w-4" />
                {xlsxLoading ? "Importing…" : "Import Excel"}
              </button>
            </div>

            {xlsxError && (
              <div className={`mt-4 ${BADGE_ERROR} inline-flex`}>{xlsxError}</div>
            )}

            {xlsxResult && (
              <div className="mt-5 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {xlsxResult.duplicate ? (
                    <span className={`${BADGE_INFO} text-xs`}>Already imported (duplicate file — skipped)</span>
                  ) : (
                    <span className={`${BADGE_SUCCESS} text-xs`}>
                      ✓ Imported {xlsxResult.imported ?? 0} rows
                      {(xlsxResult.skipped ?? 0) > 0 ? ` · ${xlsxResult.skipped} skipped` : ""}
                    </span>
                  )}
                </div>

                {xlsxResult.import_batch_id && (
                  <p className={T_CAPTION}>Batch ID: {xlsxResult.import_batch_id}</p>
                )}

                {(xlsxResult.skipped_details?.length ?? 0) > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">
                      Show skipped rows ({xlsxResult.skipped_details!.length})
                    </summary>
                    <div className="mt-2 space-y-1">
                      {xlsxResult.skipped_details!.map((s, i) => (
                        <div key={i} className={`${GLASS_CARD} px-3 py-2`}>
                          <p className="text-xs text-zinc-300">
                            {s.name || "—"} {s.date ? `(${s.date})` : ""} — {s.reason}
                          </p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </section>

        </motion.div>
      </div>
    </main>
  );
}
