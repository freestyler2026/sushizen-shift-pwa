"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getAuth } from "@/lib/auth";

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

const API_BASE = "";

function fmt(value?: string | null) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

export default function AttendanceLocationsPage() {
  const auth = getAuth();
  const [items, setItems] = useState<AttendanceLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [city, setCity] = useState("");
  const [unmappedOnly, setUnmappedOnly] = useState(false);
  const [approverName] = useState(auth?.staffName || "");
  const [pin] = useState(auth?.pin || "");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        if (!approverName.trim() || !pin.trim()) {
          throw new Error("Approver session missing. Please log in again.");
        }
        const qs = new URLSearchParams();
        qs.set("approver_name", approverName.trim());
        qs.set("pin", pin.trim());
        if (city) qs.set("city", city);
        if (unmappedOnly) qs.set("only_unmapped", "true");
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
  }, [city, unmappedOnly, approverName, pin]);

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
        <p className="mt-2 text-sm text-neutral-400">
          Review raw location data automatically collected from Bayzat.
        </p>
      </div>

      <section className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm">
            <div className="mb-1 font-medium">City</div>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-white"
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

          <div className="flex items-end text-sm text-neutral-400">
            Total: {filtered.length}
          </div>
        </div>
      </section>

      {error ? (
        <div className="mb-4 rounded border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/20 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-950 text-left text-neutral-300">
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
                  <td className="px-4 py-4 text-neutral-500" colSpan={6}>
                    Loading...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-neutral-500" colSpan={6}>
                    No locations found.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="border-t border-neutral-800 align-top">
                    <td className="px-4 py-3 font-medium">{item.raw_location}</td>
                    <td className="px-4 py-3">{item.city || "-"}</td>
                    <td className="px-4 py-3">
                      {item.canonical_branch_code ? (
                        <span className="rounded bg-emerald-950/40 px-2 py-1 text-xs font-medium text-emerald-200">
                          {item.canonical_branch_code}
                        </span>
                      ) : (
                        <span className="rounded bg-amber-950/40 px-2 py-1 text-xs font-medium text-amber-200">
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
