"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AttendanceLocation = {
  id: number;
  raw_location: string;
  normalized_location?: string | null;
  city?: string | null;
  canonical_branch_code?: string | null;
  notes?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  seen_count?: number | null;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

function fmt(value?: string | null) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

export default function AttendanceLocationsPage() {
  const [items, setItems] = useState<AttendanceLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [city, setCity] = useState("");
  const [unmappedOnly, setUnmappedOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const qs = new URLSearchParams();
        if (city) qs.set("city", city);
        const res = await fetch(
          `${API_BASE}/api/admin/attendance/locations?${qs.toString()}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          throw new Error(`Failed to load locations: ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setItems(Array.isArray(data?.items) ? data.items : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load locations");
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [city]);

  const filtered = useMemo(() => {
    return items.filter((item) =>
      unmappedOnly ? !item.canonical_branch_code : true,
    );
  }, [items, unmappedOnly]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href="/admin/attendance"
          className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
        >
          ← Back to Attendance
        </Link>
        <Link
          href="/admin/attendance/import"
          className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
        >
          Import
        </Link>
        <Link
          href="/admin/attendance/mapping"
          className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
        >
          Mapping
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Attendance Locations</h1>
        <p className="mt-2 text-sm text-gray-600">
          Bayzat から自動蓄積された raw location を確認します。
        </p>
      </div>

      <section className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm">
            <div className="mb-1 font-medium">City</div>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded border px-3 py-2"
            >
              <option value="">All</option>
              <option value="Dubai">Dubai</option>
              <option value="Manila">Manila</option>
            </select>
          </label>

          <label className="flex items-end gap-2 text-sm">
            <input
              type="checkbox"
              checked={unmappedOnly}
              onChange={(e) => setUnmappedOnly(e.target.checked)}
            />
            <span>Unmapped only</span>
          </label>

          <div className="flex items-end text-sm text-gray-600">
            Total: {filtered.length}
          </div>
        </div>
      </section>

      {error ? (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3">Raw Location</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Canonical Branch</th>
                <th className="px-4 py-3">Seen Count</th>
                <th className="px-4 py-3">First Seen</th>
                <th className="px-4 py-3">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-4 text-gray-500" colSpan={6}>
                    Loading...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-gray-500" colSpan={6}>
                    No locations found.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="border-t align-top">
                    <td className="px-4 py-3 font-medium">{item.raw_location}</td>
                    <td className="px-4 py-3">{item.city || "-"}</td>
                    <td className="px-4 py-3">
                      {item.canonical_branch_code ? (
                        <span className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                          {item.canonical_branch_code}
                        </span>
                      ) : (
                        <span className="rounded bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                          Unmapped
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{item.seen_count ?? 0}</td>
                    <td className="px-4 py-3">{fmt(item.first_seen_at)}</td>
                    <td className="px-4 py-3">{fmt(item.last_seen_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
