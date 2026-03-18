"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Overview = {
  scheduled_minutes?: number;
  actual_minutes?: number;
  late_minutes?: number;
  early_leave_minutes?: number;
  overtime_minutes?: number;
  no_show_count?: number;
  missing_check_in_count?: number;
  missing_check_out_count?: number;
  branch_mismatch_count?: number;
  closing_status?: string | null;
};

type StaffSummary = {
  staff_name?: string | null;
  branch_code?: string | null;
  scheduled_minutes?: number | null;
  actual_minutes?: number | null;
  difference_minutes?: number | null;
  late_minutes?: number | null;
  early_leave_minutes?: number | null;
  overtime_minutes?: number | null;
  issue_count?: number | null;
};

type BranchSummary = {
  branch_code?: string | null;
  scheduled_minutes?: number | null;
  actual_minutes?: number | null;
  late_minutes?: number | null;
  overtime_minutes?: number | null;
  issue_count?: number | null;
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

export default function AttendanceMonthlySummaryPage() {
  const [overview, setOverview] = useState<Overview>({});
  const [staffSummary, setStaffSummary] = useState<StaffSummary[]>([]);
  const [branchSummary, setBranchSummary] = useState<BranchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [city, setCity] = useState("");
  const [branch, setBranch] = useState("");
  const [month, setMonth] = useState(currentMonthValue());

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
          `${API_BASE}/api/admin/attendance/monthly-summary?${qs.toString()}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`Failed to load monthly summary: ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setOverview(data?.overview || {});
          setStaffSummary(Array.isArray(data?.staff_summary) ? data.staff_summary : []);
          setBranchSummary(Array.isArray(data?.branch_summary) ? data.branch_summary : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load monthly summary");
          setOverview({});
          setStaffSummary([]);
          setBranchSummary([]);
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

  const csvUrl = `${API_BASE}/api/admin/attendance/payroll-export.csv?city=${encodeURIComponent(city)}&month=${encodeURIComponent(month)}&branch=${encodeURIComponent(branch)}`;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/admin/attendance" className="rounded border px-3 py-2 text-sm hover:bg-gray-50">
          ← Back to Attendance
        </Link>
        <Link href="/admin/attendance/comparison" className="rounded border px-3 py-2 text-sm hover:bg-gray-50">
          Comparison
        </Link>
        <Link href="/admin/attendance/analytics" className="rounded border px-3 py-2 text-sm hover:bg-gray-50">
          Analytics
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Attendance Monthly Summary</h1>
          <p className="mt-2 text-sm text-gray-600">
            月次の勤怠サマリーと payroll export 確認用の画面です。
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
        <div className="grid gap-4 md:grid-cols-3">
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
        </div>
      </section>

      {error ? <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="mb-6 grid gap-4 md:grid-cols-5">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-gray-500">Closing Status</div>
          <div className="mt-2 text-xl font-bold">{overview.closing_status || "OPEN"}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-gray-500">Scheduled</div>
          <div className="mt-2 text-xl font-bold">{fmtMinutes(overview.scheduled_minutes)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-gray-500">Actual</div>
          <div className="mt-2 text-xl font-bold">{fmtMinutes(overview.actual_minutes)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-gray-500">Late / Early / OT</div>
          <div className="mt-2 text-sm">
            <div>Late: {fmtMinutes(overview.late_minutes)}</div>
            <div>Early: {fmtMinutes(overview.early_leave_minutes)}</div>
            <div>OT: {fmtMinutes(overview.overtime_minutes)}</div>
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-gray-500">Issues</div>
          <div className="mt-2 text-sm">
            <div>No-show: {overview.no_show_count ?? 0}</div>
            <div>Missing IN: {overview.missing_check_in_count ?? 0}</div>
            <div>Missing OUT: {overview.missing_check_out_count ?? 0}</div>
            <div>Branch mismatch: {overview.branch_mismatch_count ?? 0}</div>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-4 py-3 font-semibold">Staff Monthly Summary</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3">Staff</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Scheduled</th>
                  <th className="px-4 py-3">Actual</th>
                  <th className="px-4 py-3">Diff</th>
                  <th className="px-4 py-3">Late</th>
                  <th className="px-4 py-3">Early</th>
                  <th className="px-4 py-3">OT</th>
                  <th className="px-4 py-3">Issues</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="px-4 py-4 text-gray-500" colSpan={9}>Loading...</td></tr>
                ) : staffSummary.length === 0 ? (
                  <tr><td className="px-4 py-4 text-gray-500" colSpan={9}>No staff summary data.</td></tr>
                ) : (
                  staffSummary.map((row, idx) => (
                    <tr key={`${row.staff_name || "staff"}-${idx}`} className="border-t">
                      <td className="px-4 py-3">{row.staff_name || "-"}</td>
                      <td className="px-4 py-3">{row.branch_code || "-"}</td>
                      <td className="px-4 py-3">{fmtMinutes(row.scheduled_minutes)}</td>
                      <td className="px-4 py-3">{fmtMinutes(row.actual_minutes)}</td>
                      <td className="px-4 py-3">{fmtMinutes(row.difference_minutes)}</td>
                      <td className="px-4 py-3">{fmtMinutes(row.late_minutes)}</td>
                      <td className="px-4 py-3">{fmtMinutes(row.early_leave_minutes)}</td>
                      <td className="px-4 py-3">{fmtMinutes(row.overtime_minutes)}</td>
                      <td className="px-4 py-3">{row.issue_count ?? 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-4 py-3 font-semibold">Branch Monthly Summary</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Scheduled</th>
                  <th className="px-4 py-3">Actual</th>
                  <th className="px-4 py-3">Late</th>
                  <th className="px-4 py-3">OT</th>
                  <th className="px-4 py-3">Issues</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="px-4 py-4 text-gray-500" colSpan={6}>Loading...</td></tr>
                ) : branchSummary.length === 0 ? (
                  <tr><td className="px-4 py-4 text-gray-500" colSpan={6}>No branch summary data.</td></tr>
                ) : (
                  branchSummary.map((row, idx) => (
                    <tr key={`${row.branch_code || "branch"}-${idx}`} className="border-t">
                      <td className="px-4 py-3">{row.branch_code || "-"}</td>
                      <td className="px-4 py-3">{fmtMinutes(row.scheduled_minutes)}</td>
                      <td className="px-4 py-3">{fmtMinutes(row.actual_minutes)}</td>
                      <td className="px-4 py-3">{fmtMinutes(row.late_minutes)}</td>
                      <td className="px-4 py-3">{fmtMinutes(row.overtime_minutes)}</td>
                      <td className="px-4 py-3">{row.issue_count ?? 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
