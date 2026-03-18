"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type PayrollRow = {
  month?: string | null;
  city?: string | null;
  branch_code?: string | null;
  staff_name?: string | null;
  scheduled_minutes?: number | null;
  actual_minutes?: number | null;
  difference_minutes?: number | null;
  break_minutes?: number | null;
  extra_hours_worked_minutes?: number | null;
  extra_hours_scheduled_minutes?: number | null;
  late_minutes?: number | null;
  early_leave_minutes?: number | null;
  overtime_minutes?: number | null;
  no_show_count?: number | null;
  missing_check_in_count?: number | null;
  missing_check_out_count?: number | null;
  branch_mismatch_count?: number | null;
  workday_rows?: number | null;
  status_breakdown?: Record<string, number> | null;
  closing_status?: string | null;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

function fmtMinutes(value?: number | null): string {
  if (value == null) return "-";
  return `${value} min`;
}

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AttendancePayrollPage() {
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [city, setCity] = useState("");
  const [branch, setBranch] = useState("");
  const [month, setMonth] = useState(currentMonthValue());
  const [allowOpen, setAllowOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const qs = new URLSearchParams();
        if (city) qs.set("city", city);
        if (branch) qs.set("branch", branch);
        if (month) qs.set("month", month);
        const res = await fetch(
          `${API_BASE}/api/admin/attendance/payroll-summary?${qs.toString()}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`Failed to load payroll summary: ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setRows(Array.isArray(data?.items) ? data.items : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load payroll summary");
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [city, branch, month]);

  const csvUrl = useMemo(() => {
    const qs = new URLSearchParams();
    if (city) qs.set("city", city);
    if (branch) qs.set("branch", branch);
    if (month) qs.set("month", month);
    if (allowOpen) qs.set("allow_open", "true");
    return `${API_BASE}/api/admin/attendance/payroll-export.csv?${qs.toString()}`;
  }, [city, branch, month, allowOpen]);

  const closingStatus = rows[0]?.closing_status || "OPEN";

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/admin/attendance" className="rounded border px-3 py-2 text-sm hover:bg-gray-50">
          ← Back to Attendance
        </Link>
        <Link href="/admin/attendance/monthly-summary" className="rounded border px-3 py-2 text-sm hover:bg-gray-50">
          Monthly Summary
        </Link>
        <Link href="/admin/attendance/monthly-closing" className="rounded border px-3 py-2 text-sm hover:bg-gray-50">
          Monthly Closing
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Attendance Payroll Review</h1>
          <p className="mt-2 text-sm text-gray-600">
            月次給与確認用の勤怠サマリーです。
          </p>
        </div>
        <a
          href={csvUrl}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Download Payroll CSV
        </a>
      </div>

      <section className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-4">
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
            <input value={branch} onChange={(e) => setBranch(e.target.value.toUpperCase())} className="w-full rounded border px-3 py-2" />
          </label>

          <label className="text-sm">
            <div className="mb-1 font-medium">Month</div>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full rounded border px-3 py-2" />
          </label>

          <label className="flex items-end gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowOpen}
              onChange={(e) => setAllowOpen(e.target.checked)}
            />
            <span>Allow provisional export</span>
          </label>
        </div>
      </section>

      <section className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm">
          <span className="font-medium">Closing Status:</span> {closingStatus}
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
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3">Actual</th>
                <th className="px-4 py-3">Diff</th>
                <th className="px-4 py-3">Break</th>
                <th className="px-4 py-3">Extra Worked</th>
                <th className="px-4 py-3">Late</th>
                <th className="px-4 py-3">Early</th>
                <th className="px-4 py-3">OT</th>
                <th className="px-4 py-3">Flags</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-4 py-4 text-gray-500" colSpan={11}>Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td className="px-4 py-4 text-gray-500" colSpan={11}>No payroll rows found.</td></tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={`${row.staff_name || "staff"}-${idx}`} className="border-t">
                    <td className="px-4 py-3">{row.staff_name || "-"}</td>
                    <td className="px-4 py-3">{row.branch_code || "-"}</td>
                    <td className="px-4 py-3">{fmtMinutes(row.scheduled_minutes)}</td>
                    <td className="px-4 py-3">{fmtMinutes(row.actual_minutes)}</td>
                    <td className="px-4 py-3">{fmtMinutes(row.difference_minutes)}</td>
                    <td className="px-4 py-3">{fmtMinutes(row.break_minutes)}</td>
                    <td className="px-4 py-3">{fmtMinutes(row.extra_hours_worked_minutes)}</td>
                    <td className="px-4 py-3">{fmtMinutes(row.late_minutes)}</td>
                    <td className="px-4 py-3">{fmtMinutes(row.early_leave_minutes)}</td>
                    <td className="px-4 py-3">{fmtMinutes(row.overtime_minutes)}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-700">
                        NS {row.no_show_count ?? 0} / IN {row.missing_check_in_count ?? 0} / OUT {row.missing_check_out_count ?? 0}
                      </div>
                    </td>
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
