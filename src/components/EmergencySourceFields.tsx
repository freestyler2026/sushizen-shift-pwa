"use client";

// Where an emergency request's goods came from (owner, 2026-11-02).
//
// None of October's 24 completed requests was tied to a PO or a CK note; most were
// "in_house" -- stock from another site, whose cost stayed with the site that gave it.
// For the franchise stores that is another owner's money, so completing a request now
// says where the goods came from and what they cost. The server checks the same rules
// (app/db.py epr_source_problem); this only keeps the form from sending what it refuses.

import SelectDark from "@/components/SelectDark";
import { INPUT_CLASS, T_LABEL } from "@/lib/ui-tokens";

export type EmergencySource = { type: string; name: string };

export const SOURCE_TYPES = [
  { value: "supplier", label: "Bought from a supplier" },
  { value: "ck", label: "From CK" },
  { value: "warehouse", label: "From the warehouse" },
  { value: "store", label: "From another store" },
];

// Not bought and not sent: the goods came with the regular delivery, or never came
// (October's #171, #184's salmon). HQ's late entry only -- completing at the store is
// for goods that did arrive. Costs nothing (owner, 2026-11-10).
export const NONE_SOURCE = { value: "none", label: "Not bought — came with the regular delivery or not sent" };

// The stores an emergency can be sent from. Manila's three; anything else can be typed.
const STORES = ["Taft", "Paranaque", "Cubao"];

export function sourceLabel(type: string, name: string): string {
  const t = [...SOURCE_TYPES, NONE_SOURCE].find((s) => s.value === type)?.label;
  if (!t) return "";
  return name ? `${t} — ${name}` : t;
}

/** "" when the source can be sent, else what is missing. */
export function sourceProblem(src: EmergencySource, requestStore: string, amount: string, allowNone = false): string {
  if (allowNone && src.type === NONE_SOURCE.value) {
    const n = parseFloat(amount);
    return amount.trim() !== "" && Number.isFinite(n) && Math.abs(n) > 0.004
      ? "Goods that were not bought or sent cost nothing: enter 0." : "";
  }
  if (!SOURCE_TYPES.some((s) => s.value === src.type)) return "Choose where the goods came from.";
  if (src.type === "supplier" && !src.name.trim()) return "Name the supplier.";
  if (src.type === "store" && !src.name.trim()) return "Choose the store the goods came from.";
  if (src.type === "store" && src.name.trim().toLowerCase() === requestStore.trim().toLowerCase())
    return "The goods cannot come from the store that asked for them.";
  const n = parseFloat(amount);
  if (amount.trim() === "" || !Number.isFinite(n)) return "Enter the amount of the goods.";
  if (n < 0) return "The amount cannot be negative.";
  return "";
}

export default function EmergencySourceFields({ value, onChange, requestStore, supplierHint = "", allowNone = false }: {
  value: EmergencySource;
  onChange: (v: EmergencySource) => void;
  requestStore: string;
  supplierHint?: string;
  allowNone?: boolean;
}) {
  const stores = STORES.filter((s) => s.toLowerCase() !== requestStore.trim().toLowerCase());
  return (
    <div className="space-y-2">
      <label className={T_LABEL}>Where did the goods come from?</label>
      <SelectDark
        aria-label="Where the goods came from"
        placeholder="Choose…"
        value={value.type}
        onChange={(t) => onChange({ type: t, name: t === "supplier" ? (value.type === "supplier" ? value.name : supplierHint) : t === "store" && value.type === "store" ? value.name : "" })}
        options={allowNone ? [...SOURCE_TYPES, NONE_SOURCE] : SOURCE_TYPES}
      />
      {value.type === "supplier" && (
        <input className={INPUT_CLASS} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="Supplier name (e.g. Marhon Fresh Seafoods)" aria-label="Supplier name" />
      )}
      {value.type === "store" && (
        <SelectDark aria-label="The store the goods came from" placeholder="Which store?" value={value.name}
          onChange={(n) => onChange({ ...value, name: n })} options={stores} />
      )}
    </div>
  );
}
