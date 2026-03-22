"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getAuth } from "@/lib/auth";

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

  const [approverName, setApproverName] = useState<string>(auth?.staffName || "");
  const [pin, setPin] = useState<string>(auth?.pin || "");
  const [cityHint, setCityHint] = useState<string>(auth?.city || "dubai");
  const [folderId, setFolderId] = useState<string>("");
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
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link
            href="/admin/attendance"
            className="rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            ← Back to Attendance
          </Link>

          <Link
            href="/admin/attendance/history"
            className="rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            Import History
          </Link>
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-bold">Attendance Drive Sync</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Sync the latest Bayzat attendance file from the configured Google Drive folder.
          </p>
        </div>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-2xl">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-neutral-300">Approver Name</span>
              <input
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white"
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                placeholder="HQ / ADMIN name"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-neutral-300">PIN</span>
              <input
                type="password"
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-neutral-300">City Hint</span>
              <select
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white"
                value={cityHint}
                onChange={(e) => setCityHint(e.target.value)}
              >
                <option value="dubai">Dubai</option>
                <option value="manila">Manila</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-neutral-300">Google Drive Folder ID</span>
              <input
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                placeholder="Drive folder ID"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-neutral-300">Specific Drive File ID (optional)</span>
              <input
                className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white"
                value={driveFileId}
                onChange={(e) => setDriveFileId(e.target.value)}
                placeholder="Leave blank to sync the latest file"
              />
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={syncLatest}
              disabled={!canSyncLatest || loadingLatest}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-50"
            >
              {loadingLatest ? "Syncing..." : "Sync Latest File"}
            </button>

            <button
              type="button"
              onClick={syncSelected}
              disabled={!canSyncSelected || loadingSelected}
              className="rounded-2xl border border-neutral-700 bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-900 disabled:opacity-50"
            >
              {loadingSelected ? "Syncing..." : "Sync Selected File"}
            </button>
          </div>
        </section>

        {error ? (
          <div className="mt-6 rounded-2xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {result ? (
          <section className="mt-6 rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-2xl">
            <div className="text-lg font-semibold">Sync Result</div>

            <div className="mt-4 space-y-2 text-sm text-neutral-300">
              <div>Message: {result.message || (result.duplicate ? "Duplicate file" : "Sync completed")}</div>
              <div>Duplicate: {result.duplicate ? "Yes" : "No"}</div>
              <div>Import Job ID: {result.import_job?.id || "-"}</div>
              <div>Drive File ID: {result.drive_file?.id || "-"}</div>
              <div>Drive File Name: {result.drive_file?.name || "-"}</div>
              <div>Modified Time: {result.drive_file?.modifiedTime || "-"}</div>
              {result.drive_file?.webViewLink ? (
                <div>
                  File Link:{" "}
                  <a
                    href={result.drive_file.webViewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-300 underline"
                  >
                    Open in Drive
                  </a>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}