"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AttendanceRow = {
  id: number;
  work_date?: string | null;
  city?: string | null;
  employee_name_raw?: string | null;
  canonical_staff_name?: string | null;
  effective_status_raw?: string | null;
  effective_check_in_at_local?: string | null;
  effective_check_out_at_local?: string | null;
  effective_hours_worked_minutes?: number | null;
  effective_check_in_office_raw?: string | null;
  effective_check_out_office_raw?: string | null;
};

type CorrectionHistory = {
  id: number;
  attendance_row_id: number;
  corrected_status_raw?: string | null;
  corrected_check_in_at_local?: string | null;
  corrected_check_out_at_local?: string | null;
  corrected_hours_worked_minutes?: number | null;
  reason?: string | null;
  note?: string | null;
  approved_by?: string | null;
  created_at?: string | null;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

function fmtMinutes(value?: number | null) {
  if (value == null) return "-";
  return `${value} min`;
}

export default function AttendanceCorrectionsPage() {
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [history, setHistory] = useState<CorrectionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [city, setCity] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedRowId, setSelectedRowId] = useState("");
  const [approverName, setApproverName] = useState("");
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [statusRaw, setStatusRaw] = useState("");
  const [checkInAt, setCheckInAt] = useState("");
  const [checkOutAt, setCheckOutAt] = useState("");
  const [workedMinutes, setWorkedMinutes] = useState("");
  const [checkInOffice, setCheckInOffice] = useState("");
  const [checkOutOffice, setCheckOutOffice] = useState("");
  const [limit, setLimit] = useState("100");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const rowQs = new URLSearchParams();
      if (city) rowQs.set("city", city);
      if (dateFrom) rowQs.set("date_from", dateFrom);
      if (dateTo) rowQs.set("date_to", dateTo);
      if (limit) rowQs.set("limit", limit);

      const [rowRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/attendance/rows?${rowQs.toString()}`, { cache: "no-store" }),
        fetch(`${API_BASE}/api/admin/attendance/corrections`, { cache: "no-store" }),
      ]);

      if (!rowRes.ok) throw new Error(`Failed to load attendance rows: ${rowRes.status}`);
      if (!historyRes.ok) throw new Error(`Failed to load corrections: ${historyRes.status}`);

      const rowData = await rowRes.json();
      const historyData = await historyRes.json();

      setRows(Array.isArray(rowData?.items) ? rowData.items : []);
      setHistory(Array.isArray(historyData?.items) ? historyData.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load correction data");
      setRows([]);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [city, dateFrom, dateTo, limit]);

  async function submitCorrection() {
    if (!selectedRowId) {
      setError("Select an attendance row first.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/attendance/corrections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendance_row_id: Number(selectedRowId),
          approver_name: approverName,
          pin,
          reason,
          note,
          corrected_status_raw: statusRaw || null,
          corrected_check_in_at_local: checkInAt || null,
          corrected_check_out_at_local: checkOutAt || null,
          corrected_hours_worked_minutes: workedMinutes ? Number(workedMinutes) : null,
          corrected_check_in_office_raw: checkInOffice || null,
          corrected_check_out_office_raw: checkOutOffice || null,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to save correction");
      }
      setMessage("Correction saved.");
      setReason("");
      setNote("");
      setStatusRaw("");
      setCheckInAt("");
      setCheckOutAt("");
      setWorkedMinutes("");
      setCheckInOffice("");
      setCheckOutOffice("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save correction");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/admin/attendance" className="rounded border px-3 py-2 text-sm hover:bg-gray-50">
          ← Back to Attendance
        </Link>
        <Link href="/admin/attendance/comparison" className="rounded border px-3 py-2 text-sm hover:bg-gray-50">
          Comparison
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Attendance Corrections</h1>
        <p className="mt-2 text-sm text-gray-600">
          誤打刻や補正を、元データを残したまま correction として登録します。
        </p>
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

      {message ? <div className="mb-4 rounded border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div> : null}
      {error ? <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="mb-6 overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-4 py-3 font-semibold">Attendance Rows</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3">Select</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">IN</th>
                <th className="px-4 py-3">OUT</th>
                <th className="px-4 py-3">Worked</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-4 py-4 text-gray-500" colSpan={8}>Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td className="px-4 py-4 text-gray-500" colSpan={8}>No attendance rows found.</td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-3">
                      <input
                        type="radio"
                        name="attendance_row_id"
                        value={row.id}
                        checked={selectedRowId === String(row.id)}
                        onChange={(e) => setSelectedRowId(e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3">{row.work_date || "-"}</td>
                    <td className="px-4 py-3">{row.employee_name_raw || "-"}</td>
                    <td className="px-4 py-3">{row.canonical_staff_name || "-"}</td>
                    <td className="px-4 py-3">{row.effective_status_raw || "-"}</td>
                    <td className="px-4 py-3">{row.effective_check_in_at_local || "-"}</td>
                    <td className="px-4 py-3">{row.effective_check_out_at_local || "-"}</td>
                    <td className="px-4 py-3">{fmtMinutes(row.effective_hours_worked_minutes)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Create Correction</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm">
            <div className="mb-1 font-medium">Approver Name</div>
            <input value={approverName} onChange={(e) => setApproverName(e.target.value)} className="w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">
            <div className="mb-1 font-medium">PIN</div>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} className="w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">
            <div className="mb-1 font-medium">Reason</div>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded border px-3 py-2" />
          </label>

          <label className="text-sm">
            <div className="mb-1 font-medium">Corrected Status</div>
            <input value={statusRaw} onChange={(e) => setStatusRaw(e.target.value)} className="w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">
            <div className="mb-1 font-medium">Corrected Check In</div>
            <input value={checkInAt} onChange={(e) => setCheckInAt(e.target.value)} className="w-full rounded border px-3 py-2" placeholder="YYYY-MM-DD HH:MM:SS" />
          </label>
          <label className="text-sm">
            <div className="mb-1 font-medium">Corrected Check Out</div>
            <input value={checkOutAt} onChange={(e) => setCheckOutAt(e.target.value)} className="w-full rounded border px-3 py-2" placeholder="YYYY-MM-DD HH:MM:SS" />
          </label>

          <label className="text-sm">
            <div className="mb-1 font-medium">Worked Minutes</div>
            <input value={workedMinutes} onChange={(e) => setWorkedMinutes(e.target.value)} className="w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">
            <div className="mb-1 font-medium">Check In Office</div>
            <input value={checkInOffice} onChange={(e) => setCheckInOffice(e.target.value)} className="w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">
            <div className="mb-1 font-medium">Check Out Office</div>
            <input value={checkOutOffice} onChange={(e) => setCheckOutOffice(e.target.value)} className="w-full rounded border px-3 py-2" />
          </label>

          <label className="text-sm md:col-span-3">
            <div className="mb-1 font-medium">Note</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[100px] w-full rounded border px-3 py-2" />
          </label>
        </div>

        <div className="mt-4">
          <button
            onClick={submitCorrection}
            disabled={saving}
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Correction"}
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-4 py-3 font-semibold">Correction History</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3">Row ID</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">IN</th>
                <th className="px-4 py-3">OUT</th>
                <th className="px-4 py-3">Worked</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Approved By</th>
                <th className="px-4 py-3">Created At</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-4 py-4 text-gray-500" colSpan={8}>Loading...</td></tr>
              ) : history.length === 0 ? (
                <tr><td className="px-4 py-4 text-gray-500" colSpan={8}>No correction history found.</td></tr>
              ) : (
                history.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-3">{row.attendance_row_id}</td>
                    <td className="px-4 py-3">{row.corrected_status_raw || "-"}</td>
                    <td className="px-4 py-3">{row.corrected_check_in_at_local || "-"}</td>
                    <td className="px-4 py-3">{row.corrected_check_out_at_local || "-"}</td>
                    <td className="px-4 py-3">{fmtMinutes(row.corrected_hours_worked_minutes)}</td>
                    <td className="px-4 py-3">{row.reason || "-"}</td>
                    <td className="px-4 py-3">{row.approved_by || "-"}</td>
                    <td className="px-4 py-3">{row.created_at || "-"}</td>
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
