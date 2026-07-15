"use client";

import { useState } from "react";
import { getAuthHeaders } from "@/lib/auth";

const FILES = [
  { file: "01_PL_Monthly.csv",           desc: "Monthly P&L facts by city (all available months)" },
  { file: "02_Staff_Master.csv",         desc: "All staff: city, branch, role, skill rank" },
  { file: "03_Attendance_Monthly.csv",   desc: "Monthly attendance rollup by city/branch — 18 months" },
  { file: "04_Procurement_History.csv",  desc: "Purchase orders — last 18 months" },
  { file: "05_Vendor_Summary.csv",       desc: "Vendor spend summary — last 18 months" },
  { file: "06_Daily_Inventory_Items.csv",desc: "Active daily inventory item master" },
  { file: "07_Store_Evaluations.csv",    desc: "Store inspection scores — last 12 months" },
  { file: "08_Menu_Items.csv",           desc: "Full menu with prices (AED & PHP)" },
  { file: "09_Store_KPI_Monthly.csv",    desc: "Monthly KPI rollup per branch — 18 months" },
];

export default function MallExpansionPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDownload() {
    setLoading(true);
    setError("");
    try {
      const headers = getAuthHeaders();
      const res = await fetch("/api/admin/mall-expansion/export", { headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server error ${res.status}: ${text}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      a.href = url;
      a.download = `sushizen_mall_expansion_${today}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mall Expansion — Data Pack</h1>
        <p className="mt-1 text-sm text-gray-500">
          Download a ZIP of CSV files (live production data) to upload as sources
          in NotebookLM for Manila shopping mall expansion analysis.
        </p>
      </div>

      {/* File list */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-300">File</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Contents</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {FILES.map((f) => (
              <tr key={f.file} className="bg-white dark:bg-gray-900">
                <td className="px-4 py-2 font-mono text-xs text-indigo-700 dark:text-indigo-400 whitespace-nowrap">
                  {f.file}
                </td>
                <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{f.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Download button */}
      <div className="flex flex-col gap-3">
        <button
          onClick={handleDownload}
          disabled={loading}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white
                     bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors w-fit"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Generating…
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Download Data Pack (.zip)
            </>
          )}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-xs text-gray-400">
          Contents: 9 CSV files of live production data inside a ZIP.
          Upload each CSV individually to NotebookLM as a separate source.
        </p>
      </div>

      {/* Instructions */}
      <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-4 text-sm space-y-2">
        <p className="font-semibold text-amber-800 dark:text-amber-300">How to use with NotebookLM</p>
        <ol className="list-decimal list-inside space-y-1 text-amber-900 dark:text-amber-200">
          <li>Download the ZIP and extract the 9 CSV files inside.</li>
          <li>Open <strong>NotebookLM</strong> → New notebook → Add source → Upload file.</li>
          <li>Upload each CSV file as a separate source (up to 9 sources).</li>
          <li>Use the prompt kit to generate your business plan sections.</li>
        </ol>
      </div>
    </div>
  );
}
