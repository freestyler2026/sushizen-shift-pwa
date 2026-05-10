"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FolderSearch, RefreshCw, Upload } from "lucide-react";
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

type DriveSyncResponse = {
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
  items?: any[];
};

type DriveFileItem = {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const DEFAULT_FOLDER_ID = "0AJRy_FdAYDp2Uk9PVA";

function normalizeAttendanceSyncError(raw: string) {
  const text = String(raw || "").trim();
  const lower = text.toLowerCase();
  if (!text) return "同期に失敗しました。時間をおいて再試行してください。";
  if (lower.includes("invalid pin")) return "PINが正しくありません。";
  if (lower.includes("permission") || lower.includes("forbidden")) return "同期権限がありません（HQ/ADMIN のPIN確認が必要です）。";
  if (lower.includes("attendance drive source not found")) return "同期元設定が見つかりません。";
  if (lower.includes("no attendance files found")) return "Driveフォルダに対象ファイルがありません。";
  if (lower.includes("already imported") || lower.includes("duplicate")) return "最新ファイルは既に取り込み済みです。";
  return text;
}

async function apiPost<T = any>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    try {
      const j = JSON.parse(text);
      throw new Error(j?.detail || text || `POST ${path} failed`);
    } catch {
      throw new Error(text || `POST ${path} failed`);
    }
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

  const [loadingLatest, setLoadingLatest] = useState(false);
  const [loadingSelected, setLoadingSelected] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DriveSyncResponse | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[] | null>(null);

  const canSyncLatest = useMemo(() => {
    return !!approverName.trim() && !!pin.trim() && !!folderId.trim();
  }, [approverName, pin, folderId]);

  const canSyncSelected = useMemo(() => {
    return !!approverName.trim() && !!pin.trim() && !!folderId.trim() && !!driveFileId.trim();
  }, [approverName, pin, folderId, driveFileId]);

  async function syncLatest() {
    if (!canSyncLatest) return;
    setLoadingLatest(true);
    setError("");
    setResult(null);

    try {
      const data = await apiPost<DriveSyncResponse>("/api/admin/attendance/drive/sync", {
        approver_name: approverName.trim(),
        pin: pin.trim(),
        folder_id: folderId.trim(),
        city_hint: cityHint.trim().toLowerCase(),
      });
      setResult(data);
    } catch (err: any) {
      setError(normalizeAttendanceSyncError(String(err?.message || err || "Drive sync failed")));
    } finally {
      setLoadingLatest(false);
    }
  }

  async function syncSelected() {
    if (!canSyncSelected) return;
    setLoadingSelected(true);
    setError("");
    setResult(null);

    try {
      const data = await apiPost<DriveSyncResponse>("/api/admin/attendance/drive/sync", {
        approver_name: approverName.trim(),
        pin: pin.trim(),
        folder_id: folderId.trim(),
        city_hint: cityHint.trim().toLowerCase(),
        drive_file_id: driveFileId.trim(),
      });
      setResult(data);
    } catch (err: any) {
      setError(normalizeAttendanceSyncError(String(err?.message || err || "Drive sync failed")));
    } finally {
      setLoadingSelected(false);
    }
  }

  async function listFiles() {
    if (!approverName.trim() || !pin.trim()) return;
    setLoadingFiles(true);
    setError("");
    setDriveFiles(null);
    try {
      const params = new URLSearchParams({
        approver_name: approverName.trim(),
        pin: pin.trim(),
        folder_id: folderId.trim(),
        limit: "20",
      });
      const res = await fetch(`${API_BASE}/api/admin/attendance/drive/files?${params}`);
      const text = await res.text();
      if (!res.ok) {
        const j = text ? JSON.parse(text) : {};
        throw new Error(j?.detail || text || "Failed to list Drive files");
      }
      const data = JSON.parse(text);
      setDriveFiles(data?.items || []);
    } catch (err: any) {
      setError(normalizeAttendanceSyncError(String(err?.message || err || "Failed to list Drive files")));
    } finally {
      setLoadingFiles(false);
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
              <p className={T_CAPTION}>Sync the latest Bayzat attendance file from the configured Google Drive folder.</p>
            </div>
          </div>

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
                <span className={T_LABEL}>City Hint (optional fallback)</span>
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
                  aria-label="Google Drive folder ID is fixed for attendance sync."
                  title="Google Drive folder ID is fixed for attendance sync."
                >
                  {folderId}
                </div>
                <p className={T_CAPTION}>Fixed Bayzat shared drive folder is used for latest sync.</p>
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className={T_LABEL}>Specific Drive File ID (optional)</span>
                <input
                  className={INPUT_CLASS}
                  value={driveFileId}
                  onChange={(e) => setDriveFileId(e.target.value)}
                  placeholder="Leave blank to sync the latest file"
                />
              </label>
            </div>

            <div className="mt-6">
              <div className={`${GLASS_CARD} border-2 border-dashed border-white/15 p-6 text-center`}>
                <Upload className="mx-auto mb-2 h-8 w-8 text-zinc-500" />
                <p className="text-sm text-zinc-400">This page syncs from Google Drive. Local file upload is not supported here.</p>
                <p className={`${T_CAPTION} mt-1`}>Use &quot;Sync Latest from Drive&quot; or specify a Drive file ID below.</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={listFiles}
                disabled={!approverName.trim() || !pin.trim() || loadingFiles}
                className={`${SECONDARY_BUTTON} flex items-center gap-2 disabled:opacity-50`}
              >
                <FolderSearch className="h-4 w-4" />
                {loadingFiles ? "Checking..." : "Check Drive Files"}
              </button>

              <button
                type="button"
                onClick={syncSelected}
                disabled={!canSyncSelected || loadingSelected}
                className={`${SECONDARY_BUTTON} flex items-center gap-2 disabled:opacity-50`}
              >
                <RefreshCw className="h-4 w-4" />
                {loadingSelected ? "Syncing..." : "Sync Specific File ID"}
              </button>

              <button
                type="button"
                onClick={syncLatest}
                disabled={!canSyncLatest || loadingLatest}
                className={`${PRIMARY_BUTTON} flex items-center gap-2 disabled:opacity-50`}
              >
                <Upload className="h-4 w-4" />
                {loadingLatest ? "Syncing..." : "Sync Latest from Drive"}
              </button>
            </div>
            {!canSyncSelected ? (
              <p className={`${T_CAPTION} mt-2`}>Sync Specific File ID requires approver name, PIN, and a Drive file ID.</p>
            ) : null}
          </section>

          {error ? (
            <div className={`mt-6 ${BADGE_ERROR} inline-flex`}>
              {error}
            </div>
          ) : null}

          {driveFiles !== null ? (
            <section className={`${GLASS_CARD} mt-6 p-4 shadow-2xl sm:p-6`}>
              <div className="mb-3 flex items-center gap-2">
                <FolderSearch className="h-4 w-4 text-sky-400" />
                <div>
                  <h2 className={T_SECTION}>Drive Files Visible to Service Account</h2>
                  <p className={T_CAPTION}>{driveFiles.length} file{driveFiles.length !== 1 ? "s" : ""} found in folder {DEFAULT_FOLDER_ID}.</p>
                </div>
              </div>
              {driveFiles.length === 0 ? (
                <p className="text-sm text-zinc-400">No attendance files found. The service account may not have access to this folder, or the folder is empty.</p>
              ) : (
                <div className="space-y-2">
                  {driveFiles.map((f) => (
                    <div key={f.id} className={`${GLASS_CARD} flex flex-wrap items-center justify-between gap-3 p-3`}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{f.name}</p>
                        <p className={`${T_CAPTION} mt-0.5 break-all`}>ID: {f.id}</p>
                        {f.modifiedTime ? <p className={`${T_CAPTION}`}>Modified: {f.modifiedTime}</p> : null}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setDriveFileId(f.id)}
                          className={`${SECONDARY_BUTTON} text-xs py-1 px-2`}
                        >
                          Use this ID
                        </button>
                        {f.webViewLink ? (
                          <a href={f.webViewLink} target="_blank" rel="noreferrer" className={`${SECONDARY_BUTTON} text-xs py-1 px-2`}>
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

          {result ? (
            <section className={`${GLASS_CARD} mt-6 p-4 shadow-2xl sm:p-6`}>
              <div className="mb-3 flex items-center gap-2 sm:mb-4">
                <Upload className="h-4 w-4 text-sky-400" />
                <div>
                  <h2 className={T_SECTION}>Sync Result</h2>
                  <p className={T_CAPTION}>Latest status returned by the attendance import endpoint.</p>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap gap-2 sm:mb-4">
                <span className={`${result.duplicate ? BADGE_INFO : BADGE_SUCCESS} text-xs`}>
                  {result.message || (result.duplicate ? "Duplicate file" : "Sync completed")}
                </span>
                <span className={`${result.duplicate ? BADGE_INFO : BADGE_SUCCESS} text-xs`}>
                  Duplicate: {result.duplicate ? "Yes" : "No"}
                </span>
              </div>

              <div className="grid gap-2 sm:gap-3 md:grid-cols-2">
                <div className={`${GLASS_CARD} p-3 sm:p-4`}>
                  <p className={T_LABEL}>Import Job ID</p>
                  <p className="mt-1 break-all text-xs leading-relaxed text-zinc-200 sm:text-sm">{result.import_job?.id || "-"}</p>
                </div>
                <div className={`${GLASS_CARD} p-3 sm:p-4`}>
                  <p className={T_LABEL}>Drive File ID</p>
                  <p className="mt-1 break-all text-xs leading-relaxed text-zinc-200 sm:text-sm">{result.drive_file?.id || "-"}</p>
                </div>
                <div className={`${GLASS_CARD} p-3 sm:p-4`}>
                  <p className={T_LABEL}>Drive File Name</p>
                  <p className="mt-1 break-all text-xs leading-relaxed text-zinc-200 sm:text-sm">{result.drive_file?.name || "-"}</p>
                </div>
                <div className={`${GLASS_CARD} p-3 sm:p-4`}>
                  <p className={T_LABEL}>Modified Time</p>
                  <p className="mt-1 break-all text-xs leading-relaxed text-zinc-200 sm:text-sm">{result.drive_file?.modifiedTime || "-"}</p>
                </div>
              </div>

              {result.drive_file?.webViewLink ? (
                <div className="mt-4">
                  <a href={result.drive_file.webViewLink} target="_blank" rel="noreferrer" className={SECONDARY_BUTTON}>
                    Open in Drive
                  </a>
                </div>
              ) : null}
            </section>
          ) : null}
        </motion.div>
      </div>
    </main>
  );
}