/**
 * Shared helpers for the Store Operation Management Channel.
 *
 * Both the BO dashboard and the manager inbox render the same template text,
 * so the placeholder substitution lives here rather than in either page —
 * the two drifting apart is how a manager ends up reading a different
 * instruction than the one BO thought it sent.
 */

export type Severity = "red" | "yellow" | "green";
export type TaskStatus = "open" | "sent" | "responded" | "closed" | "escalated";

export interface ResponseOption {
  key: string;
  label_en: string;
  type: "done" | "cannot" | "neutral";
  /** This option is meaningless without free text — e.g. which staff member forgot. */
  require_note?: boolean;
  note_placeholder?: string;
}

export interface ActionTemplate {
  exception_type: string;
  title_en: string;
  message_en: string;
  response_options: ResponseOption[];
  /** Second stage: what the store actually did. Empty when the cause is the whole answer. */
  action_options: ResponseOption[];
  response_label: string | null;
  action_label: string | null;
}

export type TaskContext = Record<string, string | number | boolean | null>;

/**
 * Substitute {placeholders} in a template message from a task's context.
 *
 * A placeholder with no value is dropped rather than left showing its braces:
 * "{item} is below 50%" with nothing to put there reads better as
 * "This item is below 50%" than as literal punctuation the reader has to
 * mentally skip.
 */
export function fillTemplate(message: string, context?: TaskContext | null): string {
  if (!message) return "";
  const ctx = context || {};
  return message.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const v = ctx[key];
    if (v === undefined || v === null || v === "") return FALLBACKS[key] ?? whole;
    return String(v);
  });
}

/** Readable stand-ins for the placeholders we know about. */
const FALLBACKS: Record<string, string> = {
  item: "This item",
  staff_name: "A staff member",
  order_id: "A product",
};

/** "Box12 Set — 30 / 80 pcs (37.5% of par)" for the shortfall types. */
export function shortfallSummary(context?: TaskContext | null): string | null {
  if (!context) return null;
  const { item, qty, par_qty, unit, pct } = context;
  if (item === undefined || qty === undefined || par_qty === undefined) return null;
  return `${item} — ${qty} / ${par_qty} ${unit ?? ""} (${pct}% of par)`.replace(/\s+/g, " ");
}

export const EXCEPTION_LABELS: Record<string, string> = {
  pm_backup_missing: "PM Backup Report Missing",
  disposal_missing: "Disposal Report Missing",
  product_score_c: "Product Score C or Below",
  attendance_unverified: "Attendance Unverified",
  backup_below_50: "Backup Below 50% of Par",
  backup_below_70: "Backup Below 70% of Par",
  rush_check_missing: "Rush Hour Check Missing",
  travel_path_hygiene: "Travel Path Hygiene Issue",
};

export function fmtExceptionType(type: string): string {
  return (
    EXCEPTION_LABELS[type] ||
    type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
