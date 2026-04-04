"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Upload } from "lucide-react";
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

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const DEFAULT_FOLDER_ID = "0AJRy_FdAYDp2Uk9PVA";

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
  const [error, setError] = useState("");
  const [result, setResult] = useState<DriveSyncResponse | null>(null);

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
      setError(String(err?.message || err || "Drive sync failed"));
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
      setError(String(err?.message || err || "Drive sync failed"));
    } finally {
      setLoadingSelected(false);
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
              <div className={`${GLASS_CARD} cursor-pointer border-2 border-dashed border-white/15 p-6 text-center transition-all duration-200 hover:border-amber-500/40`}>
                <Upload className="mx-auto mb-2 h-8 w-8 text-zinc-500" />
                <p className="text-sm text-zinc-400">Drop Bayzat Excel/CSV file or click to browse</p>
                <p className={`${T_CAPTION} mt-1`}>Supports .xlsx, .csv</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={syncSelected}
                disabled={!canSyncSelected || loadingSelected}
                className={`${SECONDARY_BUTTON} flex items-center gap-2 disabled:opacity-50`}
              >
                <RefreshCw className="h-4 w-4" />
                {loadingSelected ? "Syncing..." : "Drive Sync"}
              </button>

              <button
                type="button"
                onClick={syncLatest}
                disabled={!canSyncLatest || loadingLatest}
                className={`${PRIMARY_BUTTON} flex items-center gap-2 disabled:opacity-50`}
              >
                <Upload className="h-4 w-4" />
                {loadingLatest ? "Syncing..." : "Import Latest File"}
              </button>
            </div>
          </section>

          {error ? (
            <div className={`mt-6 ${BADGE_ERROR} inline-flex`}>
              {error}
            </div>
          ) : null}

          {result ? (
            <section className={`${GLASS_CARD} mt-6 p-6 shadow-2xl`}>
              <div className="mb-4 flex items-center gap-2">
                <Upload className="h-4 w-4 text-sky-400" />
                <div>
                  <h2 className={T_SECTION}>Sync Result</h2>
                  <p className={T_CAPTION}>Latest status returned by the attendance import endpoint.</p>
                </div>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <span className={result.duplicate ? BADGE_INFO : BADGE_SUCCESS}>
                  {result.message || (result.duplicate ? "Duplicate file" : "Sync completed")}
                </span>
                <span className={result.duplicate ? BADGE_INFO : BADGE_SUCCESS}>
                  Duplicate: {result.duplicate ? "Yes" : "No"}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className={`${GLASS_CARD} p-4`}>
                  <p className={T_LABEL}>Import Job ID</p>
                  <p className="mt-1 text-sm text-zinc-200">{result.import_job?.id || "-"}</p>
                </div>
                <div className={`${GLASS_CARD} p-4`}>
                  <p className={T_LABEL}>Drive File ID</p>
                  <p className="mt-1 break-all text-sm text-zinc-200">{result.drive_file?.id || "-"}</p>
                </div>
                <div className={`${GLASS_CARD} p-4`}>
                  <p className={T_LABEL}>Drive File Name</p>
                  <p className="mt-1 text-sm text-zinc-200">{result.drive_file?.name || "-"}</p>
                </div>
                <div className={`${GLASS_CARD} p-4`}>
                  <p className={T_LABEL}>Modified Time</p>
                  <p className="mt-1 text-sm text-zinc-200">{result.drive_file?.modifiedTime || "-"}</p>
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