"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FilePen } from "lucide-react";
import { normalizeCalendarDateInput } from "@/lib/dateInput";
import DateRangePicker from "@/components/DateRangePicker";
import { fmtNum } from "@/lib/formatters";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW,
  TEXTAREA_CLASS,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
} from "@/lib/ui-tokens";

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
  return fmtNum(value, "min");
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

  const handleDateFromChange = (raw: string) => {
    const next = normalizeCalendarDateInput(raw);
    if (!next) return;
    setDateFrom(next);
    if (dateTo && next > dateTo) setDateTo(next);
  };

  const handleDateToChange = (raw: string) => {
    const next = normalizeCalendarDateInput(raw);
    if (!next) return;
    setDateTo(next);
    if (dateFrom && next < dateFrom) setDateFrom(next);
  };

  const load = useCallback(async () => {
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
  }, [city, dateFrom, dateTo, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setSelectedRowId("");
    setReason("");
    setNote("");
    setStatusRaw("");
    setCheckInAt("");
    setCheckOutAt("");
    setWorkedMinutes("");
    setCheckInOffice("");
    setCheckOutOffice("");
  }

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
      resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save correction");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Link href="/admin/attendance" className={SECONDARY_BUTTON}>
              ← Back to Attendance
            </Link>
            <Link href="/admin/analytics" className={SECONDARY_BUTTON}>
              Analytics
            </Link>
          </div>

          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-500/20 bg-gradient-to-br from-orange-500/20 to-amber-500/10">
              <FilePen className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-orange-400">ATTENDANCE ADMIN</p>
              <h1 className={T_PAGE_TITLE}>Attendance Corrections</h1>
              <p className={T_CAPTION}>
                Incorrect punches and adjustments can be recorded as corrections while preserving the original data.
              </p>
            </div>
          </div>

          <section className={`${GLASS_CARD} mb-6 p-5`}>
            <div className="grid gap-4 md:grid-cols-4">
              <label className="space-y-2">
                <span className={T_LABEL}>City</span>
                <select value={city} onChange={(e) => setCity(e.target.value)} className={SELECT_CLASS}>
                  <option value="">All</option>
                  <option value="Dubai">Dubai</option>
                  <option value="Manila">Manila</option>
                </select>
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className={T_LABEL}>Date Range</span>
                <DateRangePicker
                  value={{ from: dateFrom, to: dateTo }}
                  onChange={(range) => {
                    handleDateFromChange(range.from);
                    handleDateToChange(range.to);
                  }}
                />
              </label>
              <label className="space-y-2">
                <span className={T_LABEL}>Limit</span>
                <input value={limit} onChange={(e) => setLimit(e.target.value)} className={INPUT_CLASS} />
              </label>
            </div>
          </section>

          {message ? <div className={`${BADGE_SUCCESS} mb-4 inline-flex`}>{message}</div> : null}
          {error ? <div className={`${BADGE_ERROR} mb-4 inline-flex`}>{error}</div> : null}

          <section className={`${GLASS_CARD} mb-6 overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 px-4 py-4">
              <div>
                <h2 className={T_SECTION}>Attendance Rows</h2>
                <p className={T_CAPTION}>Choose a source row before applying a correction.</p>
              </div>
              <span className={BADGE_INFO}>Rows: {fmtNum(rows.length)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className={TABLE_HEADER}>Select</th>
                    <th className={TABLE_HEADER}>Date</th>
                    <th className={TABLE_HEADER}>Employee</th>
                    <th className={TABLE_HEADER}>Staff</th>
                    <th className={TABLE_HEADER}>Status</th>
                    <th className={TABLE_HEADER}>IN</th>
                    <th className={TABLE_HEADER}>OUT</th>
                    <th className={TABLE_HEADER}>Worked</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className={`${TABLE_CELL} text-zinc-500`} colSpan={8}>
                        Loading...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td className={`${TABLE_CELL} text-zinc-500`} colSpan={8}>
                        No attendance rows found.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={row.id}
                        className={`${TABLE_ROW} ${selectedRowId === String(row.id) ? "bg-white/6" : ""}`}
                      >
                        <td className={TABLE_CELL}>
                          <input
                            type="radio"
                            name="attendance_row_id"
                            value={row.id}
                            checked={selectedRowId === String(row.id)}
                            onChange={(e) => setSelectedRowId(e.target.value)}
                            className="h-4 w-4 accent-amber-500"
                          />
                        </td>
                        <td className={TABLE_CELL}>{row.work_date || "-"}</td>
                        <td className={TABLE_CELL}>{row.employee_name_raw || "-"}</td>
                        <td className={TABLE_CELL}>{row.canonical_staff_name || "-"}</td>
                        <td className={TABLE_CELL}>{row.effective_status_raw || "-"}</td>
                        <td className={TABLE_CELL}>{row.effective_check_in_at_local || "-"}</td>
                        <td className={TABLE_CELL}>{row.effective_check_out_at_local || "-"}</td>
                        <td className={TABLE_CELL}>{fmtMinutes(row.effective_hours_worked_minutes)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mb-6 space-y-4">
            <div className={`${GLASS_CARD} p-5`}>
              <div className="mb-4">
                <h2 className={T_SECTION}>Create Correction</h2>
                <p className={T_CAPTION}>Select the correction type, add details, then submit for audit-safe storage.</p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className={`${GLASS_CARD} p-4`}>
                  <label className="space-y-2">
                    <span className={T_LABEL}>Approver Name</span>
                    <input value={approverName} onChange={(e) => setApproverName(e.target.value)} className={INPUT_CLASS} />
                  </label>
                </div>
                <div className={`${GLASS_CARD} p-4`}>
                  <label className="space-y-2">
                    <span className={T_LABEL}>PIN</span>
                    <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} className={INPUT_CLASS} />
                  </label>
                </div>
                <div className={`${GLASS_CARD} p-4`}>
                  <label className="space-y-2">
                    <span className={T_LABEL}>Correction Type</span>
                    <select value={reason} onChange={(e) => setReason(e.target.value)} className={SELECT_CLASS}>
                      <option value="">Select correction type</option>
                      <option value="STATUS_ADJUSTMENT">Status adjustment</option>
                      <option value="CHECK_IN_ADJUSTMENT">Check-in adjustment</option>
                      <option value="CHECK_OUT_ADJUSTMENT">Check-out adjustment</option>
                      <option value="WORKED_MINUTES_ADJUSTMENT">Worked minutes adjustment</option>
                      <option value="OFFICE_MAPPING_ADJUSTMENT">Office mapping adjustment</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </label>
                </div>

                <div className={`${GLASS_CARD} p-4`}>
                  <label className="space-y-2">
                    <span className={T_LABEL}>Corrected Status</span>
                    <input value={statusRaw} onChange={(e) => setStatusRaw(e.target.value)} className={INPUT_CLASS} />
                  </label>
                </div>
                <div className={`${GLASS_CARD} p-4`}>
                  <label className="space-y-2">
                    <span className={T_LABEL}>Corrected Check In</span>
                    <input
                      value={checkInAt}
                      onChange={(e) => setCheckInAt(e.target.value)}
                      className={INPUT_CLASS}
                      placeholder="YYYY-MM-DD HH:MM:SS"
                    />
                  </label>
                </div>
                <div className={`${GLASS_CARD} p-4`}>
                  <label className="space-y-2">
                    <span className={T_LABEL}>Corrected Check Out</span>
                    <input
                      value={checkOutAt}
                      onChange={(e) => setCheckOutAt(e.target.value)}
                      className={INPUT_CLASS}
                      placeholder="YYYY-MM-DD HH:MM:SS"
                    />
                  </label>
                </div>

                <div className={`${GLASS_CARD} p-4`}>
                  <label className="space-y-2">
                    <span className={T_LABEL}>Worked Minutes</span>
                    <input value={workedMinutes} onChange={(e) => setWorkedMinutes(e.target.value)} className={INPUT_CLASS} />
                  </label>
                </div>
                <div className={`${GLASS_CARD} p-4`}>
                  <label className="space-y-2">
                    <span className={T_LABEL}>Check In Office</span>
                    <input value={checkInOffice} onChange={(e) => setCheckInOffice(e.target.value)} className={INPUT_CLASS} />
                  </label>
                </div>
                <div className={`${GLASS_CARD} p-4`}>
                  <label className="space-y-2">
                    <span className={T_LABEL}>Check Out Office</span>
                    <input value={checkOutOffice} onChange={(e) => setCheckOutOffice(e.target.value)} className={INPUT_CLASS} />
                  </label>
                </div>
              </div>

              <div className={`${GLASS_CARD} mt-4 p-4`}>
                <label className="space-y-2">
                  <span className={T_LABEL}>Notes</span>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} className={`${TEXTAREA_CLASS} min-h-[120px]`} />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={submitCorrection}
                  disabled={saving}
                  className={`${PRIMARY_BUTTON} disabled:opacity-60`}
                >
                  {saving ? "Saving..." : "Save Correction"}
                </button>
                <button type="button" onClick={resetForm} className={SECONDARY_BUTTON}>
                  Cancel
                </button>
              </div>
            </div>
          </section>

          <section className={`${GLASS_CARD} overflow-hidden`}>
            <div className="px-4 py-4">
              <h2 className={T_SECTION}>Correction History</h2>
              <p className={T_CAPTION}>Recent attendance corrections and approval metadata.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className={TABLE_HEADER}>Row ID</th>
                    <th className={TABLE_HEADER}>Status</th>
                    <th className={TABLE_HEADER}>IN</th>
                    <th className={TABLE_HEADER}>OUT</th>
                    <th className={TABLE_HEADER}>Worked</th>
                    <th className={TABLE_HEADER}>Reason</th>
                    <th className={TABLE_HEADER}>Approved By</th>
                    <th className={TABLE_HEADER}>Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className={`${TABLE_CELL} text-zinc-500`} colSpan={8}>
                        Loading...
                      </td>
                    </tr>
                  ) : history.length === 0 ? (
                    <tr>
                      <td className={`${TABLE_CELL} text-zinc-500`} colSpan={8}>
                        No correction history found.
                      </td>
                    </tr>
                  ) : (
                    history.map((row) => (
                      <tr key={row.id} className={TABLE_ROW}>
                        <td className={TABLE_CELL}>{row.attendance_row_id}</td>
                        <td className={TABLE_CELL}>{row.corrected_status_raw || "-"}</td>
                        <td className={TABLE_CELL}>{row.corrected_check_in_at_local || "-"}</td>
                        <td className={TABLE_CELL}>{row.corrected_check_out_at_local || "-"}</td>
                        <td className={TABLE_CELL}>{fmtMinutes(row.corrected_hours_worked_minutes)}</td>
                        <td className={TABLE_CELL}>{row.reason || "-"}</td>
                        <td className={TABLE_CELL}>{row.approved_by || "-"}</td>
                        <td className={TABLE_CELL}>{row.created_at || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </motion.div>
      </div>
    </main>
  );
}
