"use client";

import { useEffect, useMemo, useState } from "react";

import {
  DUBAI_AGGREGATORS,
  DUBAI_BRANCHES,
  DUBAI_BRANDS,
  ISSUE_CATEGORIES,
  type LowRatingCity,
  type LowRatingRow,
  MANILA_AGGREGATORS,
  MANILA_BRANCHES,
  RATING_LABELS,
} from "@/types/lowRating";
import {
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  T_SECTION,
} from "@/lib/ui-tokens";

function fieldDate(v: string | null | undefined): string {
  const s = String(v || "").trim();
  if (!s) return "";
  return s.slice(0, 10);
}

export function LowRatingFormModal({
  city,
  initial,
  onClose,
  onSave,
  busy,
}: {
  city: LowRatingCity;
  initial?: LowRatingRow | null;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const isEdit = Boolean(initial?.id);
  const [orderDate, setOrderDate] = useState(fieldDate(initial?.order_date));
  const [aggregator, setAggregator] = useState(String(initial?.aggregator || "").toLowerCase());
  const [branch, setBranch] = useState(String(initial?.branch || ""));
  const [brand, setBrand] = useState(String(initial?.brand || ""));
  const [orderId, setOrderId] = useState(String(initial?.order_id || ""));
  const [orderedItems, setOrderedItems] = useState(String(initial?.ordered_items || ""));
  const [amount, setAmount] = useState(
    initial?.amount != null && Number.isFinite(Number(initial.amount)) ? String(initial.amount) : "",
  );
  const [rating, setRating] = useState<number>(initial?.rating ? Number(initial.rating) : 1);
  const [customerReview, setCustomerReview] = useState(String(initial?.customer_review || ""));
  const [issueCategory, setIssueCategory] = useState(String(initial?.issue_category || ""));
  const [pic, setPic] = useState(String(initial?.pic || ""));
  const [dateUpdated, setDateUpdated] = useState(fieldDate(initial?.date_updated));
  const [error, setError] = useState("");

  useEffect(() => {
    setOrderDate(fieldDate(initial?.order_date));
    setAggregator(String(initial?.aggregator || "").toLowerCase());
    setBranch(String(initial?.branch || ""));
    setBrand(String(initial?.brand || ""));
    setOrderId(String(initial?.order_id || ""));
    setOrderedItems(String(initial?.ordered_items || ""));
    setAmount(
      initial?.amount != null && Number.isFinite(Number(initial.amount)) ? String(initial.amount) : "",
    );
    setRating(initial?.rating ? Number(initial.rating) : 1);
    setCustomerReview(String(initial?.customer_review || ""));
    setIssueCategory(String(initial?.issue_category || ""));
    setPic(String(initial?.pic || ""));
    setDateUpdated(fieldDate(initial?.date_updated));
    setError("");
  }, [initial]);

  const aggregators = city === "manila" ? MANILA_AGGREGATORS : DUBAI_AGGREGATORS;
  const branches = city === "manila" ? MANILA_BRANCHES : DUBAI_BRANCHES;
  const dubaiBrandOptions = useMemo((): string[] => {
    const opts: string[] = [...DUBAI_BRANDS];
    const b = brand.trim();
    if (b && !opts.includes(b)) opts.unshift(b);
    return opts;
  }, [brand]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!orderDate.trim()) {
      setError("Order date is required.");
      return;
    }
    if (!aggregator.trim()) {
      setError("Aggregator is required.");
      return;
    }
    if (!branch.trim()) {
      setError("Branch is required.");
      return;
    }
    if (city === "dubai" && !brand.trim()) {
      setError("Brand is required for Dubai.");
      return;
    }
    if (!orderedItems.trim()) {
      setError("Ordered items are required.");
      return;
    }
    if (rating < 1 || rating > 3) {
      setError("Rating must be 1–3.");
      return;
    }
    const payload: Record<string, unknown> = {
      order_date: orderDate.trim(),
      aggregator: aggregator.trim().toLowerCase(),
      branch: branch.trim(),
      brand: city === "dubai" ? brand.trim() : brand.trim(),
      order_id: orderId.trim(),
      ordered_items: orderedItems.trim(),
      amount: amount.trim() === "" ? null : Number(amount),
      rating,
      customer_review: customerReview.trim(),
      issue_category: issueCategory.trim(),
      pic: pic.trim(),
      date_updated: dateUpdated.trim() === "" ? null : dateUpdated.trim(),
    };
    try {
      await onSave(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal>
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div
        className={GLASS_CARD + " relative z-[81] max-h-[90vh] w-full max-w-lg overflow-y-auto p-5"}
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 className={T_SECTION}>{isEdit ? "Edit low rating" : "New low rating"}</h2>
        <p className={T_CAPTION + " mt-1"}>
          {city === "manila" ? "Manila" : "Dubai"} · ratings 1–3 only
        </p>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <label className="block">
            <div className={T_LABEL}>Order date *</div>
            <input
              type="date"
              required
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className={"mt-1 w-full " + INPUT_CLASS}
            />
          </label>

          <label className="block">
            <div className={T_LABEL}>Aggregator *</div>
            <select
              required
              value={aggregator}
              onChange={(e) => setAggregator(e.target.value)}
              className={"mt-1 w-full " + SELECT_CLASS}
            >
              <option value="">Select…</option>
              {aggregators.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className={T_LABEL}>Branch *</div>
            <select
              required
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className={"mt-1 w-full " + SELECT_CLASS}
            >
              <option value="">Select…</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>

          {city === "dubai" ? (
            <label className="block">
              <div className={T_LABEL}>Brand *</div>
              <select
                required
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className={"mt-1 w-full " + SELECT_CLASS}
              >
                <option value="">Select…</option>
                {dubaiBrandOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block">
              <div className={T_LABEL}>Brand</div>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className={"mt-1 w-full " + INPUT_CLASS}
                placeholder="Optional"
              />
            </label>
          )}

          <label className="block">
            <div className={T_LABEL}>Order ID</div>
            <input
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className={"mt-1 w-full " + INPUT_CLASS}
            />
          </label>

          <label className="block">
            <div className={T_LABEL}>Ordered items *</div>
            <textarea
              required
              rows={3}
              value={orderedItems}
              onChange={(e) => setOrderedItems(e.target.value)}
              className={"mt-1 w-full " + INPUT_CLASS}
            />
          </label>

          <label className="block">
            <div className={T_LABEL}>Amount</div>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={"mt-1 w-full " + INPUT_CLASS}
            />
          </label>

          <label className="block">
            <div className={T_LABEL}>Rating *</div>
            <select
              required
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              className={"mt-1 w-full " + SELECT_CLASS}
            >
              {([1, 2, 3] as const).map((r) => (
                <option key={r} value={r}>
                  {RATING_LABELS[r]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className={T_LABEL}>Customer review</div>
            <textarea
              rows={2}
              value={customerReview}
              onChange={(e) => setCustomerReview(e.target.value)}
              className={"mt-1 w-full " + INPUT_CLASS}
            />
          </label>

          <label className="block">
            <div className={T_LABEL}>Issue category</div>
            <select
              value={issueCategory}
              onChange={(e) => setIssueCategory(e.target.value)}
              className={"mt-1 w-full " + SELECT_CLASS}
            >
              <option value="">—</option>
              {ISSUE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className={T_LABEL}>PIC</div>
            <input type="text" value={pic} onChange={(e) => setPic(e.target.value)} className={"mt-1 w-full " + INPUT_CLASS} />
          </label>

          <label className="block">
            <div className={T_LABEL}>Date updated</div>
            <input
              type="date"
              value={dateUpdated}
              onChange={(e) => setDateUpdated(e.target.value)}
              className={"mt-1 w-full " + INPUT_CLASS}
            />
          </label>

          {error ? <p className={T_BODY + " text-red-400"}>{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={SECONDARY_BUTTON} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className={PRIMARY_BUTTON} disabled={busy}>
              {busy ? "Saving…" : isEdit ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
