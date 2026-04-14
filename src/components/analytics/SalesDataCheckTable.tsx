"use client";

import { CheckCircle2, CircleDot, MinusCircle, RefreshCw, RotateCcw, TriangleAlert } from "lucide-react";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW,
  T_CAPTION,
  T_LABEL,
  T_SECTION,
} from "@/lib/ui-tokens";
import { Spinner } from "@/components/ui/Spinner";

export type DataCheckCell = {
  status?: string;
  present?: boolean;
  supported?: boolean;
  mode?: string;
  count?: number;
  import_count?: number;
  source_file_name?: string;
  source_drive_file_id?: string;
  coverage_from?: string;
  coverage_to?: string;
  source_systems?: string[];
};

export type DataCheckColumn<Row> = {
  key: string;
  label: string;
  getCell: (row: Row) => DataCheckCell;
};

type BaseRow = {
  work_date: string;
  overall_status?: string;
  missing_metrics?: string[];
  reimportable?: boolean;
};

function badgeClass(status: string) {
  if (status === "ok" || status === "range") return BADGE_SUCCESS;
  if (status === "monthly_only" || status === "partial") return BADGE_WARNING;
  if (status === "not_supported") return BADGE_INFO;
  return BADGE_ERROR;
}

function badgeIcon(status: string) {
  if (status === "ok" || status === "range") return <CheckCircle2 className="h-3 w-3" />;
  if (status === "monthly_only" || status === "partial") return <TriangleAlert className="h-3 w-3" />;
  if (status === "not_supported") return <MinusCircle className="h-3 w-3" />;
  return <CircleDot className="h-3 w-3" />;
}

function statusLabel(cell: DataCheckCell) {
  const status = String(cell.status || "missing");
  if (status === "monthly_only") return "Monthly only";
  if (status === "not_supported") return "N/A";
  if (status === "range") return "Covered";
  if (status === "ok") return "OK";
  if (status === "partial") return "Partial";
  return "Missing";
}

function detailLine(cell: DataCheckCell) {
  if (cell.coverage_from && cell.coverage_to) return `${cell.coverage_from} -> ${cell.coverage_to}`;
  if (cell.source_file_name) return cell.source_file_name;
  if (Array.isArray(cell.source_systems) && cell.source_systems.length) return cell.source_systems.join(", ");
  if (cell.mode && cell.mode !== "none" && cell.mode !== "daily") return cell.mode;
  return "";
}

export function SalesDataCheckTable<Row extends BaseRow>({
  title,
  caption,
  rows,
  columns,
  selectedDates,
  onToggleDate,
  onSelectMissing,
  onClearSelection,
  onRefresh,
  onReimport,
  refreshBusy,
  reimportBusy,
  message,
  error,
  selectMissingLabel = "Select missing days",
}: {
  title: string;
  caption: string;
  rows: Row[];
  columns: Array<DataCheckColumn<Row>>;
  selectedDates: string[];
  onToggleDate: (workDate: string) => void;
  onSelectMissing: () => void;
  onClearSelection: () => void;
  onRefresh: () => void;
  onReimport: () => void;
  refreshBusy?: boolean;
  reimportBusy?: boolean;
  message?: string;
  error?: string;
  selectMissingLabel?: string;
}) {
  const selectedSet = new Set(selectedDates);
  const summary = {
    ok: rows.filter((row) => String(row.overall_status || "") === "ok").length,
    partial: rows.filter((row) => String(row.overall_status || "") === "partial").length,
    missing: rows.filter((row) => String(row.overall_status || "") === "missing").length,
  };

  return (
    <div className={GLASS_CARD + " space-y-4 p-5"}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className={T_SECTION}>{title}</h2>
          <div className={T_CAPTION + " mt-1"}>{caption}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onRefresh} disabled={refreshBusy} className={SECONDARY_BUTTON + " flex items-center gap-2 text-sm"}>
            {refreshBusy ? <Spinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
          <button type="button" onClick={onSelectMissing} disabled={!rows.length || reimportBusy} className={SECONDARY_BUTTON + " text-sm"}>
            {selectMissingLabel}
          </button>
          <button type="button" onClick={onClearSelection} disabled={!selectedDates.length || reimportBusy} className={SECONDARY_BUTTON + " text-sm"}>
            Clear
          </button>
          <button type="button" onClick={onReimport} disabled={!selectedDates.length || reimportBusy} className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm"}>
            {reimportBusy ? <Spinner size="sm" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Re-import selected dates
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className={T_LABEL}>Healthy days</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-300">{summary.ok}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className={T_LABEL}>Partial days</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-amber-300">{summary.partial}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className={T_LABEL}>Missing days</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-rose-300">{summary.missing}</div>
        </div>
      </div>

      {message ? <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 px-3 py-2 text-sm text-violet-100 whitespace-pre-wrap">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 px-3 py-2 text-sm text-rose-200">{error}</div> : null}

      <div className="overflow-x-auto rounded-xl border border-white/8">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/3">
            <tr>
              <th className={TABLE_HEADER + " w-10 px-4 py-3"} />
              <th className={TABLE_HEADER + " px-4 py-3"}>Date</th>
              {columns.map((column) => (
                <th key={column.key} className={TABLE_HEADER + " px-4 py-3"}>
                  {column.label}
                </th>
              ))}
              <th className={TABLE_HEADER + " px-4 py-3"}>Overall</th>
              <th className={TABLE_HEADER + " px-4 py-3"}>Missing Metrics</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.work_date} className={TABLE_ROW}>
                <td className={TABLE_CELL + " px-4"}>
                  <input
                    type="checkbox"
                    checked={selectedSet.has(row.work_date)}
                    disabled={row.reimportable === false}
                    onChange={() => onToggleDate(row.work_date)}
                    className="h-4 w-4 rounded border-white/20 bg-white/5"
                  />
                </td>
                <td className={TABLE_CELL + " px-4 font-medium tabular-nums"}>{row.work_date}</td>
                {columns.map((column) => {
                  const cell = column.getCell(row);
                  const status = String(cell.status || "missing");
                  const detail = detailLine(cell);
                  const count = Number(cell.import_count ?? cell.count ?? 0);
                  return (
                    <td key={column.key} className={TABLE_CELL + " min-w-[160px] px-4 py-3 align-top"}>
                      <div className={badgeClass(status)}>
                        {badgeIcon(status)}
                        <span>{statusLabel(cell)}</span>
                      </div>
                      {detail ? <div className="mt-2 max-w-[220px] truncate text-xs text-zinc-400" title={detail}>{detail}</div> : null}
                      {count > 0 ? <div className="mt-1 text-[11px] tabular-nums text-zinc-500">{count} rows/files</div> : null}
                    </td>
                  );
                })}
                <td className={TABLE_CELL + " px-4 align-top"}>
                  <div className={badgeClass(String(row.overall_status || "missing"))}>
                    {badgeIcon(String(row.overall_status || "missing"))}
                    <span className="capitalize">{String(row.overall_status || "missing")}</span>
                  </div>
                </td>
                <td className={TABLE_CELL + " min-w-[200px] px-4 align-top"}>
                  {row.missing_metrics?.length ? (
                    <div className="text-xs text-rose-200">{row.missing_metrics.join(", ")}</div>
                  ) : (
                    <div className="text-xs text-zinc-500">None</div>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={columns.length + 4} className="px-4 py-12 text-center text-sm text-zinc-500">
                  No data check rows for this range.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
