"use client";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPageSizeChange: (value: number) => void;
};

export default function MenuPaginationControls({ page, pageSize, total, hasPrev, hasNext, onPrev, onNext, onPageSizeChange }: Props) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-4 text-xs text-neutral-400">
      <div className="flex items-center gap-2">
        <span>Rows per page</span>
        <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value || 50))} className="rounded-lg border border-neutral-700 bg-neutral-950/50 px-2 py-1 text-xs text-neutral-200">
          {[25, 50, 100, 200].map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </div>
      <div>{start}-{end} of {total}</div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onPrev} disabled={!hasPrev} className="rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-200 disabled:opacity-40">Prev</button>
        <span>Page {page}</span>
        <button type="button" onClick={onNext} disabled={!hasNext} className="rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-200 disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}
