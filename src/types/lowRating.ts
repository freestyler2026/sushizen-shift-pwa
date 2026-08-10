export type LowRatingCity = "manila" | "dubai";

export interface LowRatingRow {
  id: number;
  city: LowRatingCity;
  aggregator: string;
  order_date: string | null;
  order_time: string | null;
  branch: string;
  brand: string;
  order_id: string;
  ordered_items: string;
  amount: number | null;
  rating: 1 | 2 | 3;
  customer_review: string;
  issue_category: string;
  pic: string;
  date_updated: string | null;
  created_at: string;
}

export interface HighRatingRow {
  id: number;
  city: LowRatingCity;
  aggregator: string;
  order_date: string | null;
  order_time: string | null;
  branch: string;
  brand: string;
  order_id: string;
  ordered_items: string;
  amount: number | null;
  rating: 5;
  customer_review: string;
  customer_name: string;
  pic: string;
  is_rating_boost: boolean;
  date_updated: string | null;
  created_at: string;
}

export const RATING_BOOST_ITEMS = ["Gari Ginger", "Soy Sauce", "Wasabi"] as const;

export function isRatingBoost(orderedItems: string): boolean {
  const boostSet = new Set(["gari ginger", "soy sauce", "wasabi"]);
  const items = orderedItems
    .split(/[\n,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return items.length > 0 && items.every((item) => boostSet.has(item));
}

export const MANILA_AGGREGATORS = ["foodpanda", "grab"] as const;
export const MANILA_BRANCHES = ["CK", "Taft", "Paranaque"] as const;

export const DUBAI_AGGREGATORS = ["careem", "keeta", "talabat"] as const;
export const DUBAI_BRANCHES = [
  "Business Bay",
  "JLT",
  "Al Hudaiba",
  "Al Barsha",
  "Arjan",
] as const;
export const DUBAI_BRANDS = ["Sushi Zen", "Ramen Zen"] as const;

export const ISSUE_CATEGORIES = [
  "Wrong Order",
  "Missing Item",
  "Quality Issue",
  "Packaging",
  "Delivery Time",
  "Other",
] as const;

export const RATING_LABELS: Record<number, string> = {
  1: "★ 1",
  2: "★★ 2",
  3: "★★★ 3",
};
