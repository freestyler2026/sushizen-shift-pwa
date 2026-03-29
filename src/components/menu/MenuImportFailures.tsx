"use client";

type ImportFailure = {
  row_number?: number;
  reason?: string;
};

type Props = {
  failures: ImportFailure[];
};

export default function MenuImportFailures({ failures }: Props) {
  if (!failures.length) return null;
  return (
    <div className="mt-3 rounded-2xl border border-rose-900/70 bg-rose-950/15 p-3">
      <div className="text-xs font-semibold text-rose-200">Import failures</div>
      <div className="mt-2 max-h-56 overflow-auto">
        <table className="min-w-full text-xs">
          <thead className="text-left text-rose-200/70">
            <tr>
              <th className="pb-2 pr-4">Row</th>
              <th className="pb-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {failures.map((failure, index) => (
              <tr key={`${failure.row_number || "row"}-${index}`} className="border-t border-rose-900/50 align-top">
                <td className="py-2 pr-4 text-rose-100">{failure.row_number || "-"}</td>
                <td className="py-2 text-rose-100/90">{failure.reason || "Import failed."}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
