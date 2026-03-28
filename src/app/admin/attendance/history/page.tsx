// src/app/admin/attendance/history/page.tsx
"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { normalizeCalendarDateInput } from "@/lib/dateInput";

const API_BASE = "";
const LOGO_SRC = "/logo.png";

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

  if (s === "SUCCESS" || s === "IMPORTED") {
    return "border-emerald-900/40 bg-emerald-950/10 text-emerald-200";
  }
  if (s === "FAILED") {
    return "border-rose-900/40 bg-rose-950/10 text-rose-200";
  }
  if (s === "PARTIAL") {
    return "border-amber-900/40 bg-amber-950/10 text-amber-200";
  }
  if (s === "DUPLICATE") {
    return "border-fuchsia-900/40 bg-fuchsia-950/10 text-fuchsia-200";
  }
  if (s === "PROCESSING") {
    return "border-sky-900/40 bg-sky-950/10 text-sky-200";
  }

  return "border-neutral-800 bg-neutral-950/40 text-neutral-200";
}

function isSuccessStatus(status: string) {
  const s = (status || "").toUpperCase();
  return s === "SUCCESS" || s === "IMPORTED";
}

function cityBadgeClass(city: string) {
  const c = (city || "").toLowerCase();

  if (c === "dubai") {
    return "border-sky-900/40 bg-sky-950/10 text-sky-200";
  }
  if (c === "manila") {
    return "border-emerald-900/40 bg-emerald-950/10 text-emerald-200";
  }

  return "border-neutral-800 bg-neutral-950/40 text-neutral-200";
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
    const duplicate = filteredRows.filter((r) => Number(r.duplicate_rows || 0) > 0 || r.status === "DUPLICATE").length;

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
    [filteredRows]
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
        `/api/admin/attendance/history?${qs.toString()}`
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
      loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-6 py-10">
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-8 shadow-2xl">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-neutral-800 bg-black">
              <Image
                src={LOGO_SRC}
                alt="Sushi ZEN logo"
                width={80}
                height={80}
                className="h-full w-full object-contain"
              />
            </div>

            <h1 className="mt-5 text-3xl font-bold">Attendance Import History</h1>
            <p className="mt-2 text-sm text-neutral-400">
              Review past Bayzat attendance uploads, duplicate checks, and import results.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-6">
            <div>
              <div className="mb-1 text-xs text-neutral-400">City</div>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
              >
                <option value="">All</option>
                <option value="dubai">Dubai</option>
                <option value="manila">Manila</option>
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Status</div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
              >
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
              <div className="mb-1 text-xs text-neutral-400">Date From</div>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => handleDateFromChange(e.target.value)}
                max={dateTo || undefined}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Date To</div>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => handleDateToChange(e.target.value)}
                min={dateFrom || undefined}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Search</div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="File / batch / user"
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
              />
            </div>

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={loadHistory}
                disabled={loading || !approverName.trim() || !pin.trim()}
                className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
              >
                {loading ? "Loading..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/40 px-4 py-3">
            <label className="flex items-center gap-2 text-xs text-neutral-300">
              <input
                type="checkbox"
                checked={showDuplicatesOnly}
                onChange={(e) => setShowDuplicatesOnly(e.target.checked)}
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
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900"
            >
              Reset Filters
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs text-neutral-400">Approver Name</div>
              <input
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">PIN</div>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
              />
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="text-xs text-neutral-500">Total Batches</div>
              <div className="mt-1 text-2xl font-bold">{summary.total}</div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="text-xs text-neutral-500">Success</div>
              <div className="mt-1 text-2xl font-bold">{summary.success}</div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="text-xs text-neutral-500">Failed</div>
              <div className="mt-1 text-2xl font-bold">{summary.failed}</div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="text-xs text-neutral-500">Duplicate Related</div>
              <div className="mt-1 text-2xl font-bold">{summary.duplicate}</div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Import Batches</div>
                <div className="mt-1 text-xs text-neutral-500">
                  Past daily uploads, duplicate checks, and audit trail.
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv("attendance_import_history.csv", exportRows)
                  }
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900"
                >
                  Export CSV
                </button>

                <Link
                  href="/admin/attendance/import"
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-neutral-900"
                >
                  Open Import
                </Link>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">Imported At</th>
                    <th className="px-3 py-2">City</th>
                    <th className="px-3 py-2">File</th>
                    <th className="px-3 py-2">Target Date</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Imported</th>
                    <th className="px-3 py-2">Skipped</th>
                    <th className="px-3 py-2">Duplicates</th>
                    <th className="px-3 py-2">Errors</th>
                    <th className="px-3 py-2">Imported By</th>
                    <th className="px-3 py-2">Duplicate Of</th>
                    <th className="px-3 py-2">Batch ID</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id || row.batch_id} className="border-b border-neutral-800/70 align-top">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {fmtDateTime(row.created_at || row.finished_at || row.started_at)}
                      </td>

                      <td className="px-3 py-2">
                        <span
                          className={[
                            "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                            cityBadgeClass(row.city),
                          ].join(" ")}
                        >
                          {row.city || "-"}
                        </span>
                      </td>

                      <td className="px-3 py-2">
                        <div className="font-medium">{row.file_name || "-"}</div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {row.file_type || "-"} / {row.source_system || "-"}
                        </div>
                        {row.file_hash ? (
                          <div className="mt-1 text-[11px] text-neutral-600 break-all">
                            hash: {row.file_hash}
                          </div>
                        ) : null}
                      </td>

                      <td className="px-3 py-2 whitespace-nowrap">{row.target_date || "-"}</td>

                      <td className="px-3 py-2">
                        <span
                          className={[
                            "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                            statusBadgeClass(row.status),
                          ].join(" ")}
                        >
                          {row.status}
                        </span>
                        {row.notes ? (
                          <div className="mt-2 text-xs text-neutral-500">{row.notes}</div>
                        ) : null}
                      </td>

                      <td className="px-3 py-2">{row.imported_rows ?? 0}</td>
                      <td className="px-3 py-2">{row.skipped_rows ?? 0}</td>
                      <td className="px-3 py-2">{row.duplicate_rows ?? 0}</td>
                      <td className="px-3 py-2">{row.error_rows ?? 0}</td>

                      <td className="px-3 py-2">
                        <div>{row.created_by || "-"}</div>
                        {row.created_by_role ? (
                          <div className="mt-1 text-xs text-neutral-500">{row.created_by_role}</div>
                        ) : null}
                      </td>

                      <td className="px-3 py-2">
                        <div className="max-w-[180px] break-all text-xs text-neutral-300">
                          {row.duplicate_of || "-"}
                        </div>
                      </td>

                      <td className="px-3 py-2">
                        <div className="max-w-[180px] break-all text-xs text-neutral-300">
                          {row.batch_id || "-"}
                        </div>
                        {row.batch_id ? (
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(row.batch_id)}
                            className="mt-2 rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-[11px] font-semibold text-white hover:bg-neutral-900"
                          >
                            Copy
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}

                  {!filteredRows.length ? (
                    <tr>
                      <td colSpan={12} className="px-3 py-8 text-center text-neutral-500">
                        No import history found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3 text-sm text-neutral-400 sm:flex-row sm:justify-between">
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
        </div>
      </div>
    </main>
  );
}