"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ComparisonItem = {
  work_date: string;
  city?: string | null;
  scheduled_branch_code?: string | null;
  attendance_branch_code?: string | null;
  staff_name?: string | null;
  employee_name_raw?: string | null;
  scheduled_minutes?: number | null;
  actual_minutes?: number | null;
  late_minutes?: number | null;
  early_leave_minutes?: number | null;
  overtime_minutes?: number | null;
  no_show?: boolean | null;
  missing_check_in?: boolean | null;
  missing_check_out?: boolean | null;
  branch_mismatch?: boolean | null;
  unscheduled_attendance?: boolean | null;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

function fmtMinutes(value?: number | null): string {
  if (value == null) return "-";
  return `${value} min`;
}

export default function AttendanceComparisonPage() {
  const [items, setItems] = useState<ComparisonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [city, setCity] = useState("");
  const [branch, setBranch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [limit, setLimit] = useState("200");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const qs = new URLSearchParams();
        if (city) qs.set("city", city);
        if (branch) qs.set("branch", branch);
        if (dateFrom) qs.set("date_from", dateFrom);
        if (dateTo) qs.set("date_to", dateTo);
        if (limit) qs.set("limit", limit);
        const res = await fetch(
          `${API_BASE}/api/admin/attendance/comparison?${qs.toString()}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          throw new Error(`Failed to load comparison: ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setItems(Array.isArray(data?.items) ? data.items : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load comparison");
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
  }, [city, branch, dateFrom, dateTo, limit]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/admin/attendance" className="rounded border px-3 py-2 text-sm hover:bg-gray-50">
          ← Back to Attendance
        </Link>
        <Link href="/admin/attendance/analytics" className="rounded border px-3 py-2 text-sm hover:bg-gray-50">
          Analytics
        </Link>
        <Link href="/admin/attendance/monthly-summary" className="rounded border px-3 py-2 text-sm hover:bg-gray-50">
          Monthly Summary
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Attendance Comparison</h1>
        <p className="mt-2 text-sm text-gray-600">
          Scheduled shift と actual attendance の差分を確認します。
        </p>
      </div>

      <section className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-5">
          <label className="text-sm">
            <div className="mb-1 font-medium">City</div>
            <select value={city} onChange={(e) => setCity(e.target.value)} className="w-full rounded border px-3 py-2">
              <option value="">All</option>
              <option value="Dubai">Dubai</option>
              <option value="Manila">Manila</option>
            </select>
          </label>

          <label className="text-sm">
            <div className="mb-1 font-medium">Branch</div>
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value.toUpperCase())}
              className="w-full rounded border px-3 py-2"
              placeholder="e.g. BB"
            />
          </label>

          <label className="text-sm">
            <div className="mb-1 font-medium">Date From</div>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full rounded border px-3 py-2" />
          </label>

          <label className="text-sm">
            <div className="mb-1 font-medium">Date To</div>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full rounded border px-3 py-2" />
          </label>

          <label className="text-sm">
            <div className="mb-1 font-medium">Limit</div>
            <input value={limit} onChange={(e) => setLimit(e.target.value)} className="w-full rounded border px-3 py-2" />
          </label>
        </div>
      </section>

      {error ? (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Scheduled Branch</th>
                <th className="px-4 py-3">Attendance Branch</th>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3">Actual</th>
                <th className="px-4 py-3">Late</th>
                <th className="px-4 py-3">Early Leave</th>
                <th className="px-4 py-3">OT</th>
                <th className="px-4 py-3">Flags</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-4 py-4 text-gray-500" colSpan={11}>Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr><td className="px-4 py-4 text-gray-500" colSpan={11}>No comparison rows found.</td></tr>
              ) : (
                items.map((item, idx) => {
                  const flags = [
                    item.no_show ? "No-show" : "",
                    item.missing_check_in ? "Missing IN" : "",
                    item.missing_check_out ? "Missing OUT" : "",
                    item.branch_mismatch ? "Branch mismatch" : "",
                    item.unscheduled_attendance ? "Unscheduled" : "",
                  ].filter(Boolean);
                  return (
                    <tr key={`${item.work_date}-${item.staff_name || item.employee_name_raw || "row"}-${idx}`} className="border-t align-top">
                      <td className="px-4 py-3">{item.work_date}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{item.staff_name || "-"}</div>
                        <div className="text-xs text-gray-500">{item.employee_name_raw || "-"}</div>
                      </td>
                      <td className="px-4 py-3">{item.city || "-"}</td>
                      <td className="px-4 py-3">{item.scheduled_branch_code || "-"}</td>
                      <td className="px-4 py-3">{item.attendance_branch_code || "-"}</td>
                      <td className="px-4 py-3">{fmtMinutes(item.scheduled_minutes)}</td>
                      <td className="px-4 py-3">{fmtMinutes(item.actual_minutes)}</td>
                      <td className="px-4 py-3">{fmtMinutes(item.late_minutes)}</td>
                      <td className="px-4 py-3">{fmtMinutes(item.early_leave_minutes)}</td>
                      <td className="px-4 py-3">{fmtMinutes(item.overtime_minutes)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {flags.length > 0 ? flags.map((flag) => (
                            <span key={flag} className="rounded bg-yellow-100 px-2 py-1 text-xs text-yellow-800">
                              {flag}
                            </span>
                          )) : <span className="text-gray-400">-</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
