"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import type { LowRatingCity } from "@/types/lowRating";
import { INPUT_CLASS, PRIMARY_BUTTON, SELECT_CLASS } from "@/lib/ui-tokens";
import { Spinner } from "@/components/ui/Spinner";

import { getColumnsForCity, type ColDef, type DataColumnKey, type GridRowState } from "./gridTypes";

type SortDir = "asc" | "desc" | null;

type EditTarget = { localId: string; colKey: DataColumnKey } | null;

function ratingStyle(r: number): string {
  if (r <= 1) return "text-red-400 font-semibold";
  if (r === 2) return "text-orange-400 font-semibold";
  return "text-amber-300 font-semibold";
}

function cellDisplay(row: GridRowState, col: ColDef): string {
  const v = row[col.key];
  if (col.key === "rating") return String(v);
  if (col.key === "amount" && (v === null || v === undefined)) return "";
  if (v === null || v === undefined) return "";
  return String(v);
}

type CellEditorProps = {
  col: ColDef;
  initial: string;
  /** close = leave edit mode; next/prev = save and move without clearing edit target first */
  onFinish: (v: string, nav: "close" | "next" | "prev") => void;
  onCancel: () => void;
};

function CellEditor({ col, initial, onFinish, onCancel }: CellEditorProps) {
  const ref = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const skipBlurRef = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    if (ref.current instanceof HTMLInputElement && col.type !== "date") {
      ref.current.select();
    }
  }, [col.type]);

  const finish = (v: string, nav: "close" | "next" | "prev") => {
    skipBlurRef.current = true;
    onFinish(v, nav);
  };

  const keyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Enter" && col.type !== "select") {
      e.preventDefault();
      finish((e.target as HTMLInputElement).value, "close");
    } else if (e.key === "Tab") {
      e.preventDefault();
      const v =
        col.type === "select"
          ? (e.target as HTMLSelectElement).value
          : (e.target as HTMLInputElement).value;
      finish(v, e.shiftKey ? "prev" : "next");
    }
  };

  const blur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (skipBlurRef.current) {
      skipBlurRef.current = false;
      return;
    }
    onFinish(e.target.value, "close");
  };

  if (col.type === "select" && col.options) {
    return (
      <select
        ref={ref as React.RefObject<HTMLSelectElement>}
        defaultValue={initial}
        className={
          "h-8 w-full min-w-0 rounded border border-violet-500/60 bg-[#1e1e32] px-1 text-xs text-white " + SELECT_CLASS
        }
        onKeyDown={keyDown}
        onBlur={blur}
      >
        {col.options.map((opt) => (
          <option key={opt || "__empty"} value={opt}>
            {opt === "" ? "—" : opt}
          </option>
        ))}
      </select>
    );
  }

  if (col.type === "date") {
    return (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        type="date"
        defaultValue={initial}
        className={
          "h-8 w-full min-w-0 rounded border border-violet-500/60 bg-[#1e1e32] px-1 text-xs text-white " + INPUT_CLASS
        }
        onKeyDown={keyDown}
        onBlur={blur}
      />
    );
  }

  if (col.type === "number") {
    return (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        type="number"
        step="any"
        defaultValue={initial}
        className={
          "h-8 w-full min-w-0 rounded border border-violet-500/60 bg-[#1e1e32] px-1 text-xs text-white " + INPUT_CLASS
        }
        onKeyDown={keyDown}
        onBlur={blur}
      />
    );
  }

  return (
    <input
      ref={ref as React.RefObject<HTMLInputElement>}
      type="text"
      defaultValue={initial}
      className={
        "h-8 w-full min-w-0 rounded border border-violet-500/60 bg-[#1e1e32] px-1 text-xs text-white " + INPUT_CLASS
      }
      onKeyDown={keyDown}
      onBlur={blur}
    />
  );
}

export function LowRatingsGrid({
  city,
  rows,
  loading,
  updateCell,
  deleteRow,
  addRow,
}: {
  city: LowRatingCity;
  rows: GridRowState[];
  loading: boolean;
  updateCell: (localId: string, key: keyof GridRowState, value: unknown) => void;
  deleteRow: (localId: string) => void | Promise<void>;
  addRow: () => void;
}) {
  const cols = useMemo(() => getColumnsForCity(city), [city]);
  const [sortKey, setSortKey] = useState<DataColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [editing, setEditing] = useState<EditTarget>(null);
  const [editSeed, setEditSeed] = useState(0);

  const sortedRows = useMemo(() => {
    if (!sortKey || !sortDir) return rows;
    const mult = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * mult;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * mult;
    });
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: DataColumnKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    if (sortDir === "asc") setSortDir("desc");
    else if (sortDir === "desc") {
      setSortKey(null);
      setSortDir(null);
    }
  };

  const moveFocus = useCallback(
    (delta: number, anchor: { localId: string; colKey: DataColumnKey }) => {
      const colIdx = cols.findIndex((c) => c.key === anchor.colKey);
      const rowIdx = sortedRows.findIndex((r) => r._localId === anchor.localId);
      if (rowIdx < 0 || colIdx < 0) return;
      let nextCol = colIdx + delta;
      let nextRow = rowIdx;
      while (nextCol >= cols.length) {
        nextCol = 0;
        nextRow++;
      }
      while (nextCol < 0) {
        nextCol = cols.length - 1;
        nextRow--;
      }
      if (nextRow < 0 || nextRow >= sortedRows.length) {
        setEditing(null);
        return;
      }
      setEditing({ localId: sortedRows[nextRow]._localId, colKey: cols[nextCol].key });
      setEditSeed((s) => s + 1);
    },
    [cols, sortedRows],
  );

  const onHeaderClick = (key: DataColumnKey) => toggleSort(key);

  return (
    <div className="space-y-3">
      <div className="relative overflow-x-auto rounded-xl border border-[#333] bg-[#141428]">
        {loading ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30">
            <Spinner />
          </div>
        ) : null}
        <table className="min-w-max border-collapse text-left text-xs" style={{ tableLayout: "fixed" }}>
          <thead className="sticky top-0 z-10 bg-[#1a1a2e] shadow-sm">
            <tr>
              <th
                className="border border-[#333] px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
                style={{ width: 44 }}
              >
                #
              </th>
              {cols.map((c) => (
                <th
                  key={c.key}
                  className="cursor-pointer select-none border border-[#333] px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 hover:text-violet-300"
                  style={{ width: c.width }}
                  onClick={() => onHeaderClick(c.key)}
                >
                  {c.label}
                  {sortKey === c.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
              <th
                className="border border-[#333] px-2 py-2 text-center text-[10px] font-semibold uppercase text-zinc-500"
                style={{ width: 52 }}
              >
                {" "}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIndex) => (
              <tr
                key={row._localId}
                className={
                  (row._error ? "bg-[#3b0f0f]/80 " : "") +
                  (row._saving ? "opacity-60 " : "") +
                  "hover:bg-white/5"
                }
              >
                <td className="border border-[#333] px-1 py-0.5 text-center tabular-nums text-zinc-500">
                  {rowIndex + 1}
                </td>
                {cols.map((col) => {
                  const isEditing =
                    editing?.localId === row._localId && editing?.colKey === col.key;
                  const display = cellDisplay(row, col);

                  return (
                    <td
                      key={col.key}
                      className="border border-[#333] p-0 align-middle"
                      style={{
                        width: col.width,
                        background: isEditing ? "#2a2a4a" : undefined,
                        outline: isEditing ? "2px solid rgb(124 58 237 / 0.7)" : undefined,
                      }}
                    >
                      {isEditing ? (
                        <div className="p-0.5" key={editSeed}>
                          <CellEditor
                            col={col}
                            initial={
                              col.key === "rating"
                                ? String(row.rating)
                                : col.key === "amount"
                                  ? row.amount != null && Number.isFinite(row.amount)
                                    ? String(row.amount)
                                    : ""
                                  : display
                            }
                            onFinish={(v, nav) => {
                              if (col.key === "rating") updateCell(row._localId, col.key, Number(v));
                              else if (col.key === "amount") updateCell(row._localId, col.key, v);
                              else updateCell(row._localId, col.key, v);
                              if (nav === "next") moveFocus(1, { localId: row._localId, colKey: col.key });
                              else if (nav === "prev") moveFocus(-1, { localId: row._localId, colKey: col.key });
                              else setEditing(null);
                            }}
                            onCancel={() => setEditing(null)}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          data-lr-focus={`${row._localId}-${String(col.key)}`}
                          className={
                            "h-8 w-full px-2 py-1 text-left text-xs " +
                            (col.key === "rating" ? ratingStyle(Number(row.rating)) : "text-zinc-200")
                          }
                          onClick={() => {
                            setEditing({ localId: row._localId, colKey: col.key });
                            setEditSeed((s) => s + 1);
                          }}
                        >
                          {col.key === "rating" ? `★ ${row.rating}` : display || " "}
                        </button>
                      )}
                    </td>
                  );
                })}
                <td className="border border-[#333] p-1 text-center">
                  <button
                    type="button"
                    title="Delete row"
                    className="rounded p-1.5 text-red-400 hover:bg-white/10"
                    onClick={() => void deleteRow(row._localId)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button type="button" className={PRIMARY_BUTTON + " inline-flex items-center gap-2 text-sm"} onClick={addRow}>
        ＋ Add row
      </button>
    </div>
  );
}
