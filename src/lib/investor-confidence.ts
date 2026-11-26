// How likely an investor's money is, and the totals for each (HQ, 2026-11-27).
//
// A / B / C, NONE for "not investing", and "" until somebody sets it. Each row
// adds up the lowest, planned and highest amounts in each currency; an
// investor with no range counts the planned amount for both ends, so the low
// and high totals never leave somebody out. Withdrawn investors are not
// counted, as in the Planned total above.

export type Confidence = "" | "A" | "B" | "C" | "NONE";

export const CONFIDENCES: { value: Confidence; label: string }[] = [
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "NONE", label: "No investment" },
  { value: "", label: "Not set" },
];

export const CONFIDENCE_LABEL: Record<string, string> =
  Object.fromEntries(CONFIDENCES.map((c) => [c.value, c.label]));

export const CONFIDENCE_STYLE: Record<string, string> = {
  A: "border-emerald-400/50 bg-emerald-500/15 text-emerald-200",
  B: "border-sky-400/50 bg-sky-500/15 text-sky-200",
  C: "border-amber-400/50 bg-amber-500/15 text-amber-200",
  NONE: "border-slate-600/50 bg-slate-700/30 text-slate-400",
  "": "border-white/10 text-slate-500",
};

export type ConfidenceCase = {
  confidence?: string | null;
  hold: string;
  currency: string;
  planned_amount: number;
  min_amount?: number | null;
  max_amount?: number | null;
};

export type Sums = { min: number; planned: number; max: number };
export type ConfidenceRow = { key: string; label: string; people: number; byCur: Record<string, Sums> };

function add(row: ConfidenceRow, c: ConfidenceCase) {
  const s = (row.byCur[c.currency] ||= { min: 0, planned: 0, max: 0 });
  s.planned += c.planned_amount;
  s.min += c.min_amount ?? c.planned_amount;
  s.max += c.max_amount ?? c.planned_amount;
  row.people += 1;
}

/** One row per confidence (A, B, C, No investment, Not set) and "A + B + C". */
export function confidenceTotals(cases: ConfidenceCase[]): ConfidenceRow[] {
  const rows: ConfidenceRow[] = CONFIDENCES.map((c) => ({ key: c.value, label: c.label, people: 0, byCur: {} }));
  const abc: ConfidenceRow = { key: "ABC", label: "A + B + C", people: 0, byCur: {} };
  for (const c of cases) {
    if (c.hold === "WITHDRAWN") continue;
    const key = (c.confidence || "") as Confidence;
    const row = rows.find((r) => r.key === key) ?? rows[rows.length - 1];
    add(row, c);
    if (key === "A" || key === "B" || key === "C") add(abc, c);
  }
  return [...rows.slice(0, 3), abc, ...rows.slice(3)];
}
