"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AttendanceImportItem = {
  id: number;
  source_filename: string;
  file_hash?: string | null;
  status?: string | null;
  city_hint?: string | null;
  detected_date_from?: string | null;
  detected_date_to?: string | null;
  imported_row_count?: number | null;
  skipped_row_count?: number | null;
  duplicate_of_import_id?: number | null;
  created_at?: string | null;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

function formatDateRange(from?: string | null, to?: string | null): string {
  if (!from && !to) return "-";
  if (from && to) return `${from} → ${to}`;
  return from || to || "-";
}

export default function AttendanceHistoryPage() {
  const [items, setItems] = useState<AttendanceImportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState("");
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_BASE}/api/admin/attendance/imports`, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`Failed to load attendance import history (${res.status})`);
        }
        const data = await res.json();
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
            ? data.items
            : [];
        if (!cancelled) {
          setItems(list);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load history.");
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (city && (item.city_hint || "").toLowerCase() !== city.toLowerCase()) {
        return false;
      }
      if (status && (item.status || "").toLowerCase() !== status.toLowerCase()) {
        return false;
      }
      if (showDuplicatesOnly && !item.duplicate_of_import_id) {
        return false;
      }
      return true;
    });
  }, [items, city, status, showDuplicatesOnly]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const duplicates = filtered.filter((x) => x.duplicate_of_import_id).length;
    const importedRows = filtered.reduce(
      (acc, x) => acc + Number(x.imported_row_count || 0),
      0,
    );
    const skippedRows = filtered.reduce(
      (acc, x) => acc + Number(x.skipped_row_count || 0),
      0,
    );
    return { total, duplicates, importedRows, skippedRows };
  }, [filtered]);

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Attendance Import History</h1>
          <p className="text-sm text-gray-600">
            Bayzat attendance uploads, duplicate detection results, and import history.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/attendance"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Back to Attendance
          </Link>
          <Link
            href="/admin/attendance/import"
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            New Import
          </Link>
        </div>
      </div>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Imports</div>
          <div className="mt-2 text-2xl font-bold">{summary.total}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Duplicates</div>
          <div className="mt-2 text-2xl font-bold">{summary.duplicates}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Imported Rows</div>
          <div className="mt-2 text-2xl font-bold">{summary.importedRows}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Skipped Rows</div>
          <div className="mt-2 text-2xl font-bold">{summary.skippedRows}</div>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm">
            <div className="mb-1 text-gray-600">City</div>
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              <option value="">All</option>
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </label>

          <label className="text-sm">
            <div className="mb-1 text-gray-600">Status</div>
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All</option>
              <option value="IMPORTED">IMPORTED</option>
              <option value="DUPLICATE">DUPLICATE</option>
              <option value="FAILED">FAILED</option>
              <option value="ROLLED_BACK">ROLLED_BACK</option>
            </select>
          </label>

          <label className="flex items-end gap-2 rounded-lg border px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={showDuplicatesOnly}
              onChange={(e) => setShowDuplicatesOnly(e.target.checked)}
            />
            <span>Show duplicates only</span>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setCity("");
                setStatus("");
                setShowDuplicatesOnly(false);
              }}
              className="w-full rounded-lg border px-3 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-500">Loading history...</div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            No attendance import history found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-600">
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Created At</th>
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2">City</th>
                  <th className="px-3 py-2">Date Range</th>
                  <th className="px-3 py-2">Imported</th>
                  <th className="px-3 py-2">Skipped</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Duplicate Of</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-b align-top hover:bg-gray-50">
                    <td className="px-3 py-3 font-medium">{item.id}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {formatDateTime(item.created_at)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{item.source_filename || "-"}</div>
                      <div className="mt-1 max-w-[280px] truncate text-xs text-gray-500">
                        {item.file_hash || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-3 uppercase">{item.city_hint || "-"}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {formatDateRange(item.detected_date_from, item.detected_date_to)}
                    </td>
                    <td className="px-3 py-3">{item.imported_row_count ?? 0}</td>
                    <td className="px-3 py-3">{item.skipped_row_count ?? 0}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          item.status === "IMPORTED"
                            ? "bg-green-100 text-green-700"
                            : item.status === "DUPLICATE"
                              ? "bg-amber-100 text-amber-700"
                              : item.status === "ROLLED_BACK"
                                ? "bg-gray-200 text-gray-700"
                                : "bg-red-100 text-red-700"
                        }`}
                      >
                        {item.status || "-"}
                      </span>
                    </td>
                    <td className="px-3 py-3">{item.duplicate_of_import_id ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
