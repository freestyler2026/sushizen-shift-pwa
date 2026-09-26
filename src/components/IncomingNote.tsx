"use client";

/**
 * "+2 BOX due 26 Sep" — a quantity already ordered and not yet received.
 *
 * In a component rather than inline because two screens show it (the CK stock
 * view, where an order quantity is decided, and the Daily Inventory order
 * dialog) and the rule it carries must not be written twice: a quantity ordered
 * in one unit is never added to a sheet counted in another.
 *
 * 89% of these lines match an inventory item by name but only 65% share its
 * unit — SUGAR arrives by the SACK against a sheet in kg, Pork Belly by the KG
 * against a sheet in Block. A single summed figure would be wrong on a third of
 * the lines with no way to see which third, so the unit is always printed and a
 * mismatch is marked with the unit the sheet counts in. The reader converts,
 * which is what they are doing today anyway.
 */

export interface IncomingLine {
  qty: number;
  unit: string;
  expected_date: string;
  days_past: number;
  request_no: string;
  po_no: string;
  vendor_name: string;
  item_name: string;
  store_code: string;
  sheet_unit?: string;
  /** False means the order and the sheet count in different units — do not add. */
  unit_matches?: boolean;
}

export interface IncomingPayload {
  incoming: Record<string, IncomingLine[]>;
  not_on_sheet: IncomingLine[];
  stale_excluded: number;
  stale_days: number;
  line_count: number;
}

/** Lines for one item, keyed the same way the backend keyed them. */
export function incomingFor(payload: IncomingPayload | null, itemName: string): IncomingLine[] {
  return payload?.incoming?.[(itemName || "").trim().toLowerCase()] ?? [];
}

export function IncomingNote({ lines }: { lines: IncomingLine[] }) {
  if (!lines.length) return null;
  return (
    <span className="whitespace-nowrap text-xs text-sky-300">
      {lines.map((l, i) => (
        <span key={`${l.request_no}-${l.item_name}-${i}`}>
          {i > 0 && <span className="text-sky-600"> · </span>}
          +{l.qty} {l.unit}
          {l.unit_matches === false && (
            <span
              className="text-amber-400"
              title={`This sheet counts it in ${l.sheet_unit} — convert before comparing`}
            >
              {" "}⚠{l.sheet_unit}
            </span>
          )}
          <span className="text-sky-500/80">
            {" "}due {String(l.expected_date).slice(5)}
            {l.days_past > 0 ? ` (${l.days_past}d late)` : ""}
          </span>
        </span>
      ))}
    </span>
  );
}
