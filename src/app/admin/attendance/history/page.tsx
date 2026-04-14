// src/app/admin/attendance/history/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Copy, Download, History, RefreshCw } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { normalizeCalendarDateInput } from "@/lib/dateInput";
import { fmtNum } from "@/lib/formatters";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
  GLASS_CARD,
  INPUT_CLASS,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  SMALL_BUTTON,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
} from "@/lib/ui-tokens";

const API_BASE = "";

async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  const text = await res.text();

  if (!res.ok) {
    try {
      const j = JSON.parse(text);
      throw new Error(j?.detail || text || `GET ${path} failed`);
    } catch {
      throw new Error(text || `GET ${path} failed`);
    }
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
}

type AttendanceImportHistoryRow = {
  id: string;
  batch_id: string;
  city: string;
  source_system: string;
  file_name: string;
  file_type: string;
  status:
    | "SUCCESS"
    | "FAILED"
    | "PARTIAL"
    | "DUPLICATE"
    | "PROCESSING"
    | "IMPORTED"
    | "ROLLED_BACK";
  imported_rows: number;
  skipped_rows: number;
  duplicate_rows: number;
  error_rows: number;
  created_by: string;
  created_by_role?: string;
  notes?: string;
  started_at?: string | null;
  finished_at?: string | null;
  created_at?: string | null;
  file_hash?: string | null;
  target_date?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  duplicate_of?: string | null;
};

type AttendanceImportHistoryResp = {
  ok: boolean;
  rows: AttendanceImportHistoryRow[];
};

function fmtDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

function statusBadgeClass(status: string) {
  const s = (status || "").toUpperCase();

  if (s === "SUCCESS" || s === "IMPORTED") return BADGE_SUCCESS;
  if (s === "FAILED") return BADGE_ERROR;
  if (s === "PARTIAL") return BADGE_WARNING;
  if (s === "PROCESSING") return BADGE_INFO;
  if (s === "DUPLICATE") return BADGE_WARNING;
  return "inline-flex items-center rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-[11px] font-semibold text-zinc-300";
}

function isSuccessStatus(status: string) {
  const s = (status || "").toUpperCase();
  return s === "SUCCESS" || s === "IMPORTED";
}

function cityBadgeClass(city: string) {
  const c = (city || "").toLowerCase();
  if (c === "dubai") return BADGE_INFO;
  if (c === "manila") return BADGE_SUCCESS;
  return "inline-flex items-center rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-[11px] font-semibold text-zinc-300";
}

function csvEscape(value: unknown) {
  const s = String(value ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(",")),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AttendanceHistoryPage() {
  const auth = getAuth();

  const [city, setCity] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);

  const [approverName, setApproverName] = useState(auth?.staffName || "");
  const [pin, setPin] = useState(auth?.pin || "");

  const [rows, setRows] = useState<AttendanceImportHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  const filteredRows = useMemo(() => {
    if (!showDuplicatesOnly) return rows;
    return rows.filter(
      (r) =>
        Number(r.duplicate_rows || 0) > 0 ||
        (r.status || "").toUpperCase() === "DUPLICATE" ||
        !!(r.duplicate_of || "").trim(),
    );
  }, [rows, showDuplicatesOnly]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const success = filteredRows.filter((r) => isSuccessStatus(r.status)).length;
    const failed = filteredRows.filter((r) => r.status === "FAILED").length;
    const duplicate = filteredRows.filter(
      (r) => Number(r.duplicate_rows || 0) > 0 || r.status === "DUPLICATE",
    ).length;

    return { total, success, failed, duplicate };
  }, [filteredRows]);

  const exportRows = useMemo(
    () =>
      filteredRows.map((r) => ({
        imported_at: r.created_at || r.finished_at || r.started_at || "",
        batch_id: r.batch_id,
        city: r.city,
        source_system: r.source_system,
        file_name: r.file_name,
        file_type: r.file_type,
        target_date: r.target_date || "",
        date_from: r.date_from || "",
        date_to: r.date_to || "",
        duplicate_of: r.duplicate_of || "",
        status: r.status,
        imported_rows: r.imported_rows,
        skipped_rows: r.skipped_rows,
        duplicate_rows: r.duplicate_rows,
        error_rows: r.error_rows,
        created_by: r.created_by,
        created_by_role: r.created_by_role || "",
        file_hash: r.file_hash || "",
        notes: r.notes || "",
      })),
    [filteredRows],
  );

  async function loadHistory() {
    setLoading(true);
    setError("");

    try {
      const qs = new URLSearchParams({
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });

      if (city) qs.set("city", city);
      if (status) qs.set("status", status);
      if (dateFrom) qs.set("date_from", dateFrom);
      if (dateTo) qs.set("date_to", dateTo);
      if (q.trim()) qs.set("q", q.trim());
      if (showDuplicatesOnly) qs.set("duplicates_only", "true");

      const res = await apiGet<AttendanceImportHistoryResp>(
        `/api/admin/attendance/history?${qs.toString()}`,
      );

      setRows(res.rows || []);
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to load attendance import history"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (approverName.trim() && pin.trim()) {
      void loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Link href="/admin/attendance" className={SECONDARY_BUTTON}>
              ← Back to Attendance
            </Link>
            <Link href="/admin/attendance/import" className={SECONDARY_BUTTON}>
              Open Import
            </Link>
          </div>

          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/20 to-blue-500/10">
              <History className="h-5 w-5 text-sky-400" />
            </div>
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-sky-500">ATTENDANCE ADMIN</p>
              <h1 className={T_PAGE_TITLE}>Attendance Import History</h1>
              <p className={T_CAPTION}>
                Review past Bayzat attendance uploads, duplicate checks, and import results.
              </p>
            </div>
          </div>

          <div className={`${GLASS_CARD} mb-4 p-4`}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
              <div>
                <div className={`${T_LABEL} mb-1.5`}>City</div>
                <select value={city} onChange={(e) => setCity(e.target.value)} className={SELECT_CLASS}>
                  <option value="">All</option>
                  <option value="dubai">Dubai</option>
                  <option value="manila">Manila</option>
                </select>
              </div>

              <div>
                <div className={`${T_LABEL} mb-1.5`}>Status</div>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={SELECT_CLASS}>
                  <option value="">All</option>
                  <option value="SUCCESS">SUCCESS</option>
                  <option value="IMPORTED">IMPORTED</option>
                  <option value="FAILED">FAILED</option>
                  <option value="PARTIAL">PARTIAL</option>
                  <option value="DUPLICATE">DUPLICATE</option>
                  <option value="PROCESSING">PROCESSING</option>
                  <option value="ROLLED_BACK">ROLLED_BACK</option>
                </select>
              </div>

              <div>
                <div className={`${T_LABEL} mb-1.5`}>From</div>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => handleDateFromChange(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <div className={`${T_LABEL} mb-1.5`}>To</div>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => handleDateToChange(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <div className={`${T_LABEL} mb-1.5`}>Search</div>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="File / batch / user"
                  className={INPUT_CLASS}
                />
              </div>

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => void loadHistory()}
                  disabled={loading || !approverName.trim() || !pin.trim()}
                  className={`${PRIMARY_BUTTON} flex w-full items-center justify-center gap-2 disabled:opacity-60`}
                >
                  <RefreshCw className="h-4 w-4" />
                  {loading ? "Loading..." : "Refresh"}
                </button>
              </div>
            </div>
          </div>

          <div className={`${GLASS_CARD} mb-4 flex flex-wrap items-center justify-between gap-3 p-4`}>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={showDuplicatesOnly}
                onChange={(e) => setShowDuplicatesOnly(e.target.checked)}
                className="h-4 w-4 accent-amber-500"
              />
              Show duplicates only
            </label>
            <button
              type="button"
              onClick={() => {
                setCity("");
                setStatus("");
                setDateFrom("");
                setDateTo("");
                setQ("");
                setShowDuplicatesOnly(false);
              }}
              className={SECONDARY_BUTTON}
            >
              Reset Filters
            </button>
          </div>

          <div className={`${GLASS_CARD} mb-4 p-4`}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className={`${T_LABEL} mb-1.5`}>Approver Name</div>
                <input
                  value={approverName}
                  onChange={(e) => setApproverName(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <div className={`${T_LABEL} mb-1.5`}>PIN</div>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
            </div>
          </div>

          {error ? <div className={`${BADGE_ERROR} mb-4 inline-flex`}>{error}</div> : null}

          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className={KPI_CARD}>
              <p className={KPI_LABEL}>Total Batches</p>
              <p className={KPI_VALUE}>{fmtNum(summary.total)}</p>
            </div>
            <div className={KPI_CARD}>
              <p className={KPI_LABEL}>Success</p>
              <p className={KPI_VALUE}>{fmtNum(summary.success)}</p>
            </div>
            <div className={KPI_CARD}>
              <p className={KPI_LABEL}>Failed</p>
              <p className={KPI_VALUE}>{fmtNum(summary.failed)}</p>
            </div>
            <div className={KPI_CARD}>
              <p className={KPI_LABEL}>Duplicate Related</p>
              <p className={KPI_VALUE}>{fmtNum(summary.duplicate)}</p>
            </div>
          </div>

          <div className={`${GLASS_CARD} overflow-hidden p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className={T_SECTION}>Import Batches</h2>
                <div className={`mt-1 ${T_CAPTION}`}>Past daily uploads, duplicate checks, and audit trail.</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => downloadCsv("attendance_import_history.csv", exportRows)}
                  className={`${SECONDARY_BUTTON} flex items-center gap-2`}
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>

                <Link href="/admin/attendance/import" className={SECONDARY_BUTTON}>
                  Open Import
                </Link>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className={TABLE_HEADER}>Imported At</th>
                    <th className={TABLE_HEADER}>City</th>
                    <th className={TABLE_HEADER}>File</th>
                    <th className={TABLE_HEADER}>Target Date</th>
                    <th className={TABLE_HEADER}>Coverage</th>
                    <th className={TABLE_HEADER}>Status</th>
                    <th className={TABLE_HEADER}>Imported</th>
                    <th className={TABLE_HEADER}>Skipped</th>
                    <th className={TABLE_HEADER}>Duplicates</th>
                    <th className={TABLE_HEADER}>Errors</th>
                    <th className={TABLE_HEADER}>Imported By</th>
                    <th className={TABLE_HEADER}>Duplicate Of</th>
                    <th className={TABLE_HEADER}>Batch ID</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id || row.batch_id} className={`${TABLE_ROW} align-top`}>
                      <td className={`${TABLE_CELL} whitespace-nowrap`}>
                        {fmtDateTime(row.created_at || row.finished_at || row.started_at)}
                      </td>

                      <td className={TABLE_CELL}>
                        <span className={cityBadgeClass(row.city)}>{row.city || "-"}</span>
                      </td>

                      <td className={TABLE_CELL}>
                        <div className="font-medium">{row.file_name || "-"}</div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {row.file_type || "-"} / {row.source_system || "-"}
                        </div>
                        {row.file_hash ? (
                          <div className="mt-1 break-all text-[11px] text-zinc-600">hash: {row.file_hash}</div>
                        ) : null}
                      </td>

                      <td className={`${TABLE_CELL} whitespace-nowrap`}>{row.target_date || "-"}</td>

                      <td className={`${TABLE_CELL} whitespace-nowrap`}>
                        {row.date_from || row.date_to ? `${row.date_from || "-"} -> ${row.date_to || "-"}` : "-"}
                      </td>

                      <td className={TABLE_CELL}>
                        <span className={statusBadgeClass(row.status)}>{row.status}</span>
                        {row.notes ? <div className="mt-2 text-xs text-zinc-500">{row.notes}</div> : null}
                      </td>

                      <td className={TABLE_CELL}>{fmtNum(row.imported_rows ?? 0)}</td>
                      <td className={TABLE_CELL}>{fmtNum(row.skipped_rows ?? 0)}</td>
                      <td className={TABLE_CELL}>
                        {Number(row.duplicate_rows ?? 0) > 0 ? (
                          <span className={BADGE_WARNING}>{fmtNum(row.duplicate_rows ?? 0)}</span>
                        ) : (
                          fmtNum(row.duplicate_rows ?? 0)
                        )}
                      </td>
                      <td className={TABLE_CELL}>{fmtNum(row.error_rows ?? 0)}</td>

                      <td className={TABLE_CELL}>
                        <div>{row.created_by || "-"}</div>
                        {row.created_by_role ? (
                          <div className="mt-1 text-xs text-zinc-500">{row.created_by_role}</div>
                        ) : null}
                      </td>

                      <td className={TABLE_CELL}>
                        <div className="max-w-[180px] break-all text-xs text-zinc-300">{row.duplicate_of || "-"}</div>
                      </td>

                      <td className={TABLE_CELL}>
                        <div className="max-w-[180px] break-all text-xs text-zinc-300">{row.batch_id || "-"}</div>
                        {row.batch_id ? (
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(row.batch_id)}
                            className={`${SMALL_BUTTON} mt-2 flex items-center gap-2`}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copy
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}

                  {!filteredRows.length ? (
                    <tr>
                      <td colSpan={13} className={`${TABLE_CELL} py-8 text-center text-zinc-500`}>
                        No import history found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3 text-sm text-zinc-400 sm:flex-row sm:justify-between">
            <Link href="/signup" className="hover:text-white">
              ← Back to Sign Up
            </Link>

            <div className="flex flex-wrap gap-3">
              <Link href="/admin/attendance/import" className="hover:text-white">
                Attendance Import
              </Link>
              <Link href="/admin/analytics" className="hover:text-white">
                Analytics
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </main>
  );
}