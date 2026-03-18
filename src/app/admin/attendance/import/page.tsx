"use client";

import { FormEvent, useMemo, useState } from "react";

type ImportResponse = {
  ok?: boolean;
  duplicate?: boolean;
  message?: string;
  row_count?: number;
  skipped_count?: number;
  city_counts?: Record<string, number>;
  discovered_locations?: string[];
  sample_skipped_rows?: Array<{ row_no?: number; reason?: string; raw?: unknown[] }>;
  import_job?: Record<string, unknown>;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";

export default function AttendanceImportPage() {
  const [approverName, setApproverName] = useState("");
  const [pin, setPin] = useState("");
  const [cityHint, setCityHint] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResponse | null>(null);

  const canSubmit = useMemo(() => {
    return !!approverName.trim() && !!pin.trim() && !!file;
  }, [approverName, pin, file]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !file) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("approver_name", approverName.trim());
      fd.append("pin", pin.trim());
      fd.append("city_hint", cityHint.trim().toLowerCase());

      const res = await fetch(`${API_BASE}/api/admin/attendance/import`, {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as ImportResponse & { detail?: string };
      if (!res.ok) {
        throw new Error(data.detail || data.message || "Import failed");
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Attendance Import</h1>
        <p className="text-sm text-gray-600 mt-1">
          Bayzat の daily attendance Excel / CSV をアップロードして取り込みます。
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border p-5 bg-white">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">Approver Name</span>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              placeholder="HQ / ADMIN name"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">PIN</span>
            <input
              type="password"
              className="w-full rounded-xl border px-3 py-2"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">City Hint</span>
            <select
              className="w-full rounded-xl border px-3 py-2"
              value={cityHint}
              onChange={(e) => setCityHint(e.target.value)}
            >
              <option value="">Auto detect</option>
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Attendance File</span>
            <input
              type="file"
              className="w-full rounded-xl border px-3 py-2"
              accept=".xlsx,.xlsm,.csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {loading ? "Importing..." : "Import Attendance"}
          </button>
          {file ? <span className="text-sm text-gray-600">{file.name}</span> : null}
        </div>

        {error ? <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      </form>

      {result ? (
        <section className="space-y-4 rounded-2xl border p-5 bg-white">
          <div>
            <h2 className="text-lg font-semibold">Import Result</h2>
            <p className="text-sm text-gray-600 mt-1">{result.message || "Done"}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <StatCard label="Duplicate" value={result.duplicate ? "Yes" : "No"} />
            <StatCard label="Imported Rows" value={String(result.row_count || 0)} />
            <StatCard label="Skipped Rows" value={String(result.skipped_count || 0)} />
            <StatCard label="Cities" value={String(Object.keys(result.city_counts || {}).length)} />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="font-medium mb-2">City Counts</h3>
              <ul className="text-sm space-y-1">
                {Object.entries(result.city_counts || {}).map(([k, v]) => (
                  <li key={k} className="flex justify-between border-b py-1">
                    <span>{k}</span>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-medium mb-2">Discovered Locations</h3>
              <div className="flex flex-wrap gap-2">
                {(result.discovered_locations || []).slice(0, 60).map((loc) => (
                  <span key={loc} className="rounded-full border px-3 py-1 text-xs">
                    {loc}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {(result.sample_skipped_rows || []).length > 0 ? (
            <div>
              <h3 className="font-medium mb-2">Skipped Rows Preview</h3>
              <div className="overflow-x-auto rounded-xl border">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Reason</th>
                      <th className="px-3 py-2">Raw</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(result.sample_skipped_rows || []).map((row, idx) => (
                      <tr key={idx} className="border-t align-top">
                        <td className="px-3 py-2">{row.row_no ?? "-"}</td>
                        <td className="px-3 py-2">{row.reason || "-"}</td>
                        <td className="px-3 py-2 text-xs text-gray-600 whitespace-pre-wrap">
                          {JSON.stringify(row.raw || [], null, 2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border p-4 bg-gray-50">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
