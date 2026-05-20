"use client";

import { useEffect, useMemo, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import { canAccessInventoryAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { inventoryGet, inventoryPost } from "@/lib/inventoryClient";

type SyncFile = {
  source: string;
  file_id: string;
  file_name: string;
  brand_key: string;
  branch_slug: string;
  branch_name: string;
  work_date: string;
  menu_item_count: number;
  duplicate?: boolean;
};

type SyncResult = {
  ok: boolean;
  city: string;
  processed_count: number;
  processed_files: SyncFile[];
  message: string;
  duplicate?: boolean;
};

const DEFAULT_FOLDER_ID = "1wO_rDwjG0FkoXV-R7T1nKT7e378V2T1F";
const CHUNK_SIZE = 20;

export default function InventoryPosSyncPage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState((auth?.city || "dubai") as "manila" | "dubai");
  const [folderId] = useState(DEFAULT_FOLDER_ID);
  const [busy, setBusy] = useState(false);
  const [syncAllBusy, setSyncAllBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SyncResult | null>(null);
  // Sync All state
  const [syncAllRounds, setSyncAllRounds] = useState(0);
  const [syncAllNewFiles, setSyncAllNewFiles] = useState<SyncFile[]>([]);
  const [syncAllDone, setSyncAllDone] = useState(false);
  // Drive diagnostic state
  type DriveListResult = {
    ok: boolean;
    folder_id: string;
    child_folders: { id: string; name: string }[];
    total_csv_count: number;
    urbanpiper_count: number;
    other_csv_count: number;
    urbanpiper_files: { id: string; name: string; modifiedTime: string; size: string }[];
    other_csv_files: { id: string; name: string; modifiedTime: string; size: string }[];
  };
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveResult, setDriveResult] = useState<DriveListResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      setAllowed(canAccessInventoryAdmin(resolved));
      setCity((resolved?.city || auth?.city || "dubai") as "manila" | "dubai");
      setReady(true);
    }
    void init();
    return () => { cancelled = true; };
  }, [auth]);

  async function runSync() {
    setBusy(true);
    setError("");
    try {
      const res = await inventoryPost<SyncResult>("/api/admin/inventory/pos-sync", {
        city,
        folder_id: folderId.trim(),
        max_groups: CHUNK_SIZE,
      });
      setResult(res);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function listDriveFiles() {
    setDriveBusy(true);
    setError("");
    try {
      const res = await inventoryGet<DriveListResult>(
        `/api/admin/inventory/pos-sync/list-drive-files?city=${city}&folder_id=${encodeURIComponent(folderId)}&max_depth=4`
      );
      setDriveResult(res);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setDriveBusy(false);
    }
  }

  async function runSyncAll() {
    setSyncAllBusy(true);
    setSyncAllRounds(0);
    setSyncAllNewFiles([]);
    setSyncAllDone(false);
    setError("");

    const allNew: SyncFile[] = [];
    let rounds = 0;
    const MAX_ROUNDS = 50; // safety cap: 50 × 20 = 1000 files

    try {
      while (rounds < MAX_ROUNDS) {
        rounds++;
        setSyncAllRounds(rounds);

        const res = await inventoryPost<SyncResult>("/api/admin/inventory/pos-sync", {
          city,
          folder_id: folderId.trim(),
          max_groups: CHUNK_SIZE,
        });

        // Collect newly imported (non-duplicate) files
        const newInBatch = (res.processed_files || []).filter((f) => !f.duplicate);
        allNew.push(...newInBatch);
        setSyncAllNewFiles([...allNew]);

        // If all files in this batch were duplicates → nothing left to import
        if (res.duplicate || newInBatch.length === 0) {
          break;
        }

        // If fewer than CHUNK_SIZE processed → we've reached the end
        if ((res.processed_count || 0) < CHUNK_SIZE) {
          break;
        }
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSyncAllBusy(false);
      setSyncAllDone(true);
    }
  }

  if (!ready) return <div className="text-sm text-neutral-500">Loading POS sync...</div>;
  if (!allowed) return <div className="text-sm text-neutral-500">You do not have permission to open inventory.</div>;

  return (
    <div className="space-y-6">
      <InventoryTabs />

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-neutral-100">POS Sync</div>
            <div className="mt-1 text-sm text-neutral-400">
              Sync UrbanPiper orders-by-item CSV files into inventory staging.
            </div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-500">
            <span className="text-neutral-300">Sync All</span> — runs {CHUNK_SIZE} files at a time, loops until complete.
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={city}
            onChange={(e) => setCity(e.target.value as "manila" | "dubai")}
          >
            <option value="dubai">Dubai</option>
            <option value="manila">Manila</option>
          </select>
          <input
            value={folderId}
            readOnly
            aria-readonly="true"
            title="Google Drive folder ID is fixed for this sync."
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-400"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runSync}
            disabled={busy || syncAllBusy || driveBusy || !folderId.trim()}
            className="rounded-xl border border-neutral-700 bg-neutral-900/40 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-60"
          >
            {busy ? "Syncing..." : `Sync ${CHUNK_SIZE} Files`}
          </button>
          <button
            type="button"
            onClick={runSyncAll}
            disabled={busy || syncAllBusy || driveBusy || !folderId.trim()}
            className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-900/30 disabled:opacity-60"
          >
            {syncAllBusy ? `Syncing All… (round ${syncAllRounds})` : "Sync All"}
          </button>
          <button
            type="button"
            onClick={listDriveFiles}
            disabled={busy || syncAllBusy || driveBusy || !folderId.trim()}
            className="rounded-xl border border-sky-800 bg-sky-950/30 px-4 py-2 text-sm text-sky-200 hover:bg-sky-900/30 disabled:opacity-60"
          >
            {driveBusy ? "Scanning Drive…" : "List Drive Files"}
          </button>
        </div>

        {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
      </section>

      {/* Sync All result */}
      {(syncAllBusy || syncAllDone) && (
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-neutral-100">Sync All Progress</div>
            {syncAllDone && (
              <div className="text-xs text-emerald-400">
                Done — {syncAllNewFiles.length} new file(s) imported in {syncAllRounds} round(s)
              </div>
            )}
            {syncAllBusy && (
              <div className="text-xs text-amber-400 animate-pulse">
                Round {syncAllRounds} running…
              </div>
            )}
          </div>
          {syncAllNewFiles.length === 0 && syncAllDone ? (
            <div className="mt-3 text-sm text-neutral-500">All files already synced — nothing new to import.</div>
          ) : syncAllNewFiles.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-3 py-2">Brand</th>
                    <th className="px-3 py-2">Branch</th>
                    <th className="px-3 py-2">Work Date</th>
                    <th className="px-3 py-2">Items</th>
                    <th className="px-3 py-2">File</th>
                  </tr>
                </thead>
                <tbody>
                  {syncAllNewFiles.map((row) => (
                    <tr key={`${row.file_id}-${row.work_date}`} className="border-t border-neutral-800 text-neutral-200">
                      <td className="px-3 py-2">{row.brand_key}</td>
                      <td className="px-3 py-2">{row.branch_name || row.branch_slug}</td>
                      <td className="px-3 py-2">{row.work_date}</td>
                      <td className="px-3 py-2">{row.menu_item_count}</td>
                      <td className="px-3 py-2 text-xs text-neutral-400">{row.file_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      )}

      {/* Drive file list diagnostic */}
      {driveResult && (
        <section className="rounded-2xl border border-sky-900/40 bg-sky-950/10 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-sky-200">Drive Folder Contents</div>
            <div className="text-xs text-neutral-400">
              Total CSV: <span className="text-neutral-100">{driveResult.total_csv_count}</span> &nbsp;|&nbsp;
              UrbanPiper: <span className="text-neutral-100">{driveResult.urbanpiper_count}</span> &nbsp;|&nbsp;
              Other CSV: <span className="text-neutral-100">{driveResult.other_csv_count}</span>
            </div>
          </div>

          {driveResult.child_folders.length > 0 && (
            <div>
              <div className="text-xs font-medium text-neutral-400 mb-1">Subfolders ({driveResult.child_folders.length})</div>
              <div className="flex flex-wrap gap-2">
                {driveResult.child_folders.map((f) => (
                  <span key={f.id} className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-300">{f.name}</span>
                ))}
              </div>
            </div>
          )}

          {driveResult.urbanpiper_files.length > 0 && (
            <div>
              <div className="text-xs font-medium text-neutral-400 mb-1">UrbanPiper files (showing up to 200)</div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="min-w-full text-xs">
                  <thead className="text-neutral-500 sticky top-0 bg-neutral-950">
                    <tr>
                      <th className="px-2 py-1 text-left">Name</th>
                      <th className="px-2 py-1 text-left">Modified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driveResult.urbanpiper_files.map((f) => (
                      <tr key={f.id} className="border-t border-neutral-800 text-neutral-300">
                        <td className="px-2 py-1 font-mono">{f.name}</td>
                        <td className="px-2 py-1 text-neutral-500">{(f.modifiedTime || "").slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {driveResult.other_csv_files.length > 0 && (
            <div>
              <div className="text-xs font-medium text-amber-400 mb-1">Other CSV files not matching UrbanPiper pattern (showing up to 50)</div>
              <div className="overflow-x-auto max-h-40 overflow-y-auto">
                <table className="min-w-full text-xs">
                  <thead className="text-neutral-500 sticky top-0 bg-neutral-950">
                    <tr>
                      <th className="px-2 py-1 text-left">Name</th>
                      <th className="px-2 py-1 text-left">Modified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driveResult.other_csv_files.map((f) => (
                      <tr key={f.id} className="border-t border-neutral-800 text-amber-200/80">
                        <td className="px-2 py-1 font-mono">{f.name}</td>
                        <td className="px-2 py-1 text-neutral-500">{(f.modifiedTime || "").slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Single run result */}
      {result && !syncAllBusy && !syncAllDone && (
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="text-sm font-semibold text-neutral-100">Latest Result</div>
          <div className="mt-3 text-sm text-neutral-300">
            {result.message} • Processed <span className="text-neutral-100">{result.processed_count}</span> file group(s).
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Brand</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2">Work Date</th>
                  <th className="px-3 py-2">Items</th>
                  <th className="px-3 py-2">File</th>
                </tr>
              </thead>
              <tbody>
                {result.processed_files.map((row) => (
                  <tr key={`${row.file_id}-${row.work_date}`} className="border-t border-neutral-800 text-neutral-200">
                    <td className="px-3 py-2">{row.brand_key}</td>
                    <td className="px-3 py-2">{row.branch_name || row.branch_slug}</td>
                    <td className="px-3 py-2">{row.work_date}</td>
                    <td className="px-3 py-2">{row.menu_item_count}</td>
                    <td className="px-3 py-2 text-xs text-neutral-400">{row.file_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
