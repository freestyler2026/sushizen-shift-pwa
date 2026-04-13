import type { LowRatingCity } from "@/types/lowRating";

export type GridRowState = {
  _localId: string;
  id?: number;
  _saving?: boolean;
  _error?: boolean;
  order_date: string;
  aggregator: string;
  branch: string;
  brand: string;
  order_id: string;
  ordered_items: string;
  amount: number | null;
  rating: number;
  customer_review: string;
  issue_category: string;
  pic: string;
  date_updated: string;
};

/** Editable data columns only (no grid meta fields). */
export type DataColumnKey = Exclude<keyof GridRowState, "_localId" | "id" | "_saving" | "_error">;

export type ColDef = {
  key: DataColumnKey;
  label: string;
  width: number;
  type: "text" | "number" | "date" | "select";
  options?: string[];
};

export function getColumnsForCity(city: LowRatingCity): ColDef[] {
  const issueOpts = ["", "Wrong Order", "Missing Item", "Quality Issue", "Packaging", "Delivery Time", "Other"];
  const manila: ColDef[] = [
    { key: "order_date", label: "DATE", width: 128, type: "date" },
    { key: "aggregator", label: "AGG", width: 112, type: "select", options: ["foodpanda", "grab"] },
    { key: "branch", label: "BRANCH", width: 112, type: "select", options: ["CK", "Taft", "Paranaque"] },
    { key: "order_id", label: "ORDER ID", width: 140, type: "text" },
    { key: "ordered_items", label: "ITEMS", width: 260, type: "text" },
    { key: "amount", label: "AMOUNT", width: 88, type: "number" },
    { key: "rating", label: "RATING", width: 88, type: "select", options: ["1", "2", "3"] },
    { key: "customer_review", label: "REVIEW", width: 240, type: "text" },
    { key: "issue_category", label: "ISSUE", width: 140, type: "select", options: issueOpts },
    { key: "pic", label: "PIC", width: 88, type: "text" },
    { key: "date_updated", label: "UPDATED", width: 120, type: "date" },
  ];
  const dubai: ColDef[] = [
    { key: "order_date", label: "DATE", width: 128, type: "date" },
    { key: "aggregator", label: "AGG", width: 112, type: "select", options: ["careem", "keeta", "talabat"] },
    {
      key: "branch",
      label: "BRANCH",
      width: 132,
      type: "select",
      options: ["Business Bay", "JLT", "Al Hudaiba", "Al Barsha", "Arjan"],
    },
    { key: "brand", label: "BRAND", width: 112, type: "select", options: ["Sushi Zen", "Ramen Zen"] },
    { key: "order_id", label: "ORDER ID", width: 132, type: "text" },
    { key: "ordered_items", label: "ITEMS", width: 260, type: "text" },
    { key: "amount", label: "AMOUNT", width: 88, type: "number" },
    { key: "rating", label: "RATING", width: 88, type: "select", options: ["1", "2", "3"] },
    { key: "customer_review", label: "REVIEW", width: 240, type: "text" },
    { key: "issue_category", label: "ISSUE", width: 140, type: "select", options: issueOpts },
    { key: "pic", label: "PIC", width: 88, type: "text" },
    { key: "date_updated", label: "UPDATED", width: 120, type: "date" },
  ];
  return city === "manila" ? manila : dubai;
}

export function newEmptyRow(city: LowRatingCity, localId: string): GridRowState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    _localId: localId,
    order_date: today,
    aggregator: city === "manila" ? "foodpanda" : "careem",
    branch: city === "manila" ? "Taft" : "Business Bay",
    brand: city === "dubai" ? "Sushi Zen" : "",
    order_id: "",
    ordered_items: "",
    amount: null,
    rating: 1,
    customer_review: "",
    issue_category: "",
    pic: "",
    date_updated: "",
  };
}

export function rowReadyForApi(row: GridRowState, city: LowRatingCity): boolean {
  if (!row.order_date.trim()) return false;
  if (!row.aggregator.trim()) return false;
  if (!row.branch.trim()) return false;
  if (city === "dubai" && !row.brand.trim()) return false;
  if (!row.ordered_items.trim()) return false;
  const r = Number(row.rating);
  if (r < 1 || r > 3) return false;
  return true;
}

export function toSavePayload(row: GridRowState, city: LowRatingCity): Record<string, unknown> {
  const amt =
    row.amount === null || row.amount === undefined || (typeof row.amount === "number" && !Number.isFinite(row.amount))
      ? null
      : Number(row.amount);
  return {
    order_date: row.order_date.trim(),
    aggregator: row.aggregator.trim().toLowerCase(),
    branch: row.branch.trim(),
    brand: city === "dubai" ? row.brand.trim() : "",
    order_id: row.order_id.trim(),
    ordered_items: row.ordered_items.trim(),
    amount: amt,
    rating: Number(row.rating),
    customer_review: row.customer_review.trim(),
    issue_category: row.issue_category.trim(),
    pic: row.pic.trim(),
    date_updated: row.date_updated.trim() === "" ? null : row.date_updated.trim(),
  };
}
