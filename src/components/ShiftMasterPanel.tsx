"use client";

import { useRef, useState } from "react";
import { Upload, X, CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import type { ShiftMasterData } from "@/lib/shiftMasterData";
import { saveShiftMaster, clearShiftMaster } from "@/lib/shiftMasterData";
import { parseShiftMasterXlsx } from "@/app/admin/draft/parseShiftMaster";

type Props = {
  masterData: ShiftMasterData | null;
  targetMonth: string; // "YYYY-MM"
  onLoaded: (data: ShiftMasterData) => void;
  onCleared: () => void;
};

export default function ShiftMasterPanel({
  masterData,
  targetMonth,
  onLoaded,
  onCleared,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    if (!file.name.endsWith(".xlsx")) {
      setError("Please upload an .xlsx file.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const buffer = await file.arrayBuffer();
      const data = await parseShiftMasterXlsx(buffer, file.name);
      saveShiftMaster(data);
      onLoaded(data);
    } catch (e: unknown) {
      setError(`Parse error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function handleClear() {
    clearShiftMaster();
    onCleared();
    setError("");
  }

  // Compute summary stats from loaded data
  const activeVLCount = masterData
    ? masterData.vlCalendar.filter(
        (v) =>
          v.status === "Approved" &&
          (v.vlStart.slice(0, 7) === targetMonth ||
            v.vlEnd.slice(0, 7) === targetMonth ||
            (v.vlStart < targetMonth + "-01" && v.vlEnd >= targetMonth + "-01")),
      ).length
    : 0;

  const transportConstraintCount = masterData
    ? masterData.transport.filter((t) => t.hardEndHour != null || t.pickupRequired).length
    : 0;

  const uploadedDate = masterData
    ? new Date(masterData.uploadedAt).toLocaleDateString("en", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold text-white">Staff Master Data</span>
          {masterData ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              Loaded
            </span>
          ) : (
            <span className="rounded-full bg-zinc-500/15 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
              Not loaded
            </span>
          )}
        </div>

        {/* Upload / Clear buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/20 disabled:opacity-50 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            {loading ? "Parsing…" : masterData ? "Re-upload" : "Upload Excel"}
          </button>
          {masterData && (
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-500 hover:bg-white/10 hover:text-red-400 transition-colors"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Loaded state summary */}
      {masterData && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Staff</div>
            <div className="mt-0.5 text-lg font-bold text-white">{masterData.staff.length}</div>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Transport Rules</div>
            <div className="mt-0.5 text-lg font-bold text-amber-400">{transportConstraintCount}</div>
          </div>
          <div className={`rounded-xl border px-3 py-2 ${activeVLCount > 0 ? "border-rose-500/20 bg-rose-500/5" : "border-white/8 bg-white/3"}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Active VL ({targetMonth})</div>
            <div className={`mt-0.5 text-lg font-bold ${activeVLCount > 0 ? "text-rose-400" : "text-white"}`}>{activeVLCount}</div>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Uploaded</div>
            <div className="mt-0.5 text-xs text-zinc-400">{uploadedDate}</div>
          </div>
        </div>
      )}

      {/* Active VL detail */}
      {masterData && activeVLCount > 0 && (
        <div className="mt-2 space-y-1">
          {masterData.vlCalendar
            .filter(
              (v) =>
                v.status === "Approved" &&
                (v.vlStart.slice(0, 7) === targetMonth ||
                  v.vlEnd.slice(0, 7) === targetMonth ||
                  (v.vlStart < targetMonth + "-01" && v.vlEnd >= targetMonth + "-01")),
            )
            .map((v, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border border-rose-500/15 bg-rose-500/5 px-3 py-1.5"
              >
                <AlertTriangle className="h-3 w-3 shrink-0 text-rose-400" />
                <span className="text-xs text-rose-300">
                  <span className="font-semibold">{v.staffName}</span>
                  <span className="text-rose-400/60 mx-1">({v.branch})</span>
                  VL: {v.vlStart} – {v.vlEnd}
                  {v.notes && <span className="ml-1 text-rose-400/50">· {v.notes}</span>}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* No file loaded — drop zone hint */}
      {!masterData && (
        <div
          className="mt-3 rounded-xl border border-dashed border-white/15 bg-white/2 px-4 py-3 text-center text-xs text-zinc-600"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          Upload <strong className="text-zinc-400">Sushi_ZEN_Master_v2.xlsx</strong> to enable rule validation, transport badges, VL detection, and AI context injection.
          <br />
          <span className="text-zinc-700">Drag & drop or click &quot;Upload Excel&quot; above</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-2 rounded-lg border border-rose-500/20 bg-rose-950/20 px-3 py-2 text-xs text-rose-400">
          {error}
        </div>
      )}
    </div>
  );
}
