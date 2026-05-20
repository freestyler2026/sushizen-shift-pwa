"use client";

import { useEffect, useMemo, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import { canAccessInventoryAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { inventoryPost } from "@/lib/inventoryClient";

type SyncFile = {
  source: string;
  file_id: string;
  file_name: string;
  brand_key: string;
  branch_slug: string;
  branch_name: string;
  work_date: string;
  menu_item_count: number;
};

type SyncResult = {
  ok: boolean;
  city: string;
  processed_count: number;
  processed_files: SyncFile[];
  message: string;
};

const DEFAULT_FOLDER_ID = "1wO_rDwjG0FkoXV-R7T1nKT7e378V2T1F";

export default function InventoryPosSyncPage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState((auth?.city || "dubai") as "manila" | "dubai");
  const [folderId] = useState(DEFAULT_FOLDER_ID);
  const [maxGroups, setMaxGroups] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SyncResult | null>(null);

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
    return () => {
      cancelled = true;
    };
  }, [auth]);

  async function runSync() {
    setBusy(true);
    setError("");
    try {
      const res = await inventoryPost<SyncResult>("/api/admin/inventory/pos-sync", {
        city,
        folder_id: folderId.trim(),
        max_groups: maxGroups,
      });
      setResult(res);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
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
            <div className="mt-1 text-sm text-neutral-400">Sync UrbanPiper orders-by-item CSV files into inventory staging.</div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-500">
            Set to <span className="text-neutral-300">500</span> to import all available files at once.
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
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
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={500}
              value={maxGroups}
              onChange={(e) => setMaxGroups(Math.max(1, Math.min(500, Number(e.target.value || 1))))}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setMaxGroups(500)}
              className="whitespace-nowrap rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-800"
            >
              All
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runSync}
            disabled={busy || !folderId.trim()}
            className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-900/30 disabled:opacity-60"
          >
            {busy ? "Syncing..." : "Run POS Sync"}
          </button>
        </div>

        {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="text-sm font-semibold text-neutral-100">Latest Result</div>
        {!result ? (
          <div className="mt-3 text-sm text-neutral-500">No sync run yet.</div>
        ) : (
          <>
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
          </>
        )}
      </section>
    </div>
  );
}
