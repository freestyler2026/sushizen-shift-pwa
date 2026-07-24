"use client";

import { useRef, useState } from "react";
import { Upload, CheckCircle, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { GLASS_CARD, PRIMARY_BUTTON, T_PAGE_TITLE } from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

interface PublishedWeek {
  branch_code: string;
  week_start: string;
  rows_copied: number;
  error?: string;
}

interface ImportResult {
  ok: boolean;
  city: string;
  upserted_rows: number;
  unmatched_count: number;
  unmatched_names: string[];
  published_weeks: PublishedWeek[];
}

const BRANCH_LABELS: Record<string, string> = {
  AB: "Al Barsha",
  BB: "Business Bay",
  ARJ: "Arjan",
  JLT: "JLT",
  AM: "Al Hudaiba",
  CK: "Central Kitchen",
};

export default function BayzatImportPage() {
  const auth = getAuth();
  const [city, setCity] = useState<"dubai" | "manila">("dubai");
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  if (!auth || !["ADMIN", "HQ"].includes(auth.role ?? "")) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-white/60">Access denied — HQ or Admin only.</p>
      </div>
    );
  }

  async function handleImport() {
    if (!file) { setError("Please select an Excel file."); return; }
    setImporting(true);
    setError("");
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("city", city);
      fd.append("file", file);
      const allHeaders = getAuthHeaders(auth) as Record<string, string>;
      const { "Content-Type": _ct, ...uploadHeaders } = allHeaders;
      void _ct;
      const res = await fetch("/api/admin/shifts/bayzat_excel_bulk_import", {
        method: "POST",
        body: fd,
        headers: uploadHeaders,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.detail === "string" ? data.detail : "Import failed.");
        return;
      }
      setResult(data as ImportResult);
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  const totalRows = result?.published_weeks.reduce((s, w) => s + w.rows_copied, 0) ?? 0;
  const errorWeeks = result?.published_weeks.filter((w) => w.error) ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className={T_PAGE_TITLE}>Bayzat Schedule Import</h1>
        <p className="text-sm text-white/60">
          Upload the Bayzat &quot;Shifts Schedule&quot; Excel export to import all Dubai staff shifts into the OS.
          All branches and all weeks in the file will be published automatically.
        </p>

        {/* Upload Panel */}
        <div className={`${GLASS_CARD} p-6 space-y-5`}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/50">City</label>
              <SelectDark
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
                value={city}
                onChange={v => setCity(v as "dubai" | "manila")}
                options={[
                  { value: "dubai", label: "Dubai" },
                  { value: "manila", label: "Manila" },
                ]}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/50">Excel File</label>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  setResult(null);
                  setError("");
                }}
              />
              <button
                onClick={() => inputRef.current?.click()}
                className="flex w-full items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
              >
                <FileSpreadsheet size={14} />
                {file ? file.name : "Choose file…"}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/20 px-4 py-3 text-sm text-red-300">
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={importing || !file}
            className={`${PRIMARY_BUTTON} flex items-center gap-2`}
          >
            <Upload size={15} />
            {importing ? "Importing…" : "Import & Publish All"}
          </button>
        </div>

        {/* Results */}
        {result && (
          <div className={`${GLASS_CARD} p-6 space-y-5`}>
            <div className="flex items-center gap-2 text-emerald-300">
              <CheckCircle size={18} />
              <span className="font-semibold">Import complete</span>
            </div>

            {/* Summary KPIs */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Shift rows stored", value: result.upserted_rows },
                { label: "Shift rows published", value: totalRows },
                { label: "Unmatched names", value: result.unmatched_count },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                  <div className="text-2xl font-bold text-white">{value}</div>
                  <div className="mt-0.5 text-xs text-white/50">{label}</div>
                </div>
              ))}
            </div>

            {/* Published weeks table */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">Published Weeks</h3>
              <div className="overflow-hidden rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5">
                      <th className="px-3 py-2 text-left text-white/60">Branch</th>
                      <th className="px-3 py-2 text-left text-white/60">Week of</th>
                      <th className="px-3 py-2 text-right text-white/60">Shifts</th>
                      <th className="px-3 py-2 text-left text-white/60">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.published_weeks.map((w, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-3 py-2 font-medium text-white">
                          {BRANCH_LABELS[w.branch_code] ?? w.branch_code}
                        </td>
                        <td className="px-3 py-2 text-white/70">{w.week_start}</td>
                        <td className="px-3 py-2 text-right text-white">{w.rows_copied}</td>
                        <td className="px-3 py-2">
                          {w.error ? (
                            <span className="text-xs text-red-400">{w.error}</span>
                          ) : (
                            <span className="text-xs text-emerald-400">Published</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Unmatched names */}
            {result.unmatched_names.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-400/80">
                  Unmatched Names ({result.unmatched_names.length}) — Shifts Imported with Bayzat Name
                </h3>
                <div className="flex flex-wrap gap-2">
                  {result.unmatched_names.map((n) => (
                    <span key={n} className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs text-amber-300">
                      {n}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-white/40">
                  These names were not found in Staff Master. Their shifts are stored as-is under the Bayzat name.
                  Add them to Staff Master or check for spelling differences.
                </p>
              </div>
            )}

            {errorWeeks.length > 0 && (
              <div className="rounded-xl bg-red-500/10 p-3 text-xs text-red-300">
                <strong>Publish errors:</strong>{" "}
                {errorWeeks.map((w) => `${w.branch_code} ${w.week_start}: ${w.error}`).join("; ")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
