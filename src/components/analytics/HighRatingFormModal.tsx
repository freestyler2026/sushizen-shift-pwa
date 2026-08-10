"use client";

import { useEffect, useMemo, useState } from "react";

import {
  DUBAI_AGGREGATORS,
  DUBAI_BRANCHES,
  DUBAI_BRANDS,
  type HighRatingRow,
  type LowRatingCity,
  MANILA_AGGREGATORS,
  MANILA_BRANCHES,
  RATING_BOOST_ITEMS,
  isRatingBoost,
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

export function HighRatingFormModal({
  city,
  initial,
  onClose,
  onSave,
  busy,
}: {
  city: LowRatingCity;
  initial?: HighRatingRow | null;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const isEdit = Boolean(initial?.id);
  const [orderDate, setOrderDate] = useState(fieldDate(initial?.order_date));
  const [orderTime, setOrderTime] = useState(String(initial?.order_time || "").slice(0, 5));
  const [aggregator, setAggregator] = useState(String(initial?.aggregator || "").toLowerCase());
  const [branch, setBranch] = useState(String(initial?.branch || ""));
  const [brand, setBrand] = useState(String(initial?.brand || ""));
  const [orderId, setOrderId] = useState(String(initial?.order_id || ""));
  const [orderedItems, setOrderedItems] = useState(String(initial?.ordered_items || ""));
  const [amount, setAmount] = useState(
    initial?.amount != null && Number.isFinite(Number(initial.amount)) ? String(initial.amount) : "",
  );
  const [customerReview, setCustomerReview] = useState(String(initial?.customer_review || ""));
  const [customerName, setCustomerName] = useState(String(initial?.customer_name || ""));
  const [pic, setPic] = useState(String(initial?.pic || ""));
  const [isBoostOverride, setIsBoostOverride] = useState<boolean | null>(null);
  const [dateUpdated, setDateUpdated] = useState(fieldDate(initial?.date_updated));
  const [error, setError] = useState("");

  const autoBoost = isRatingBoost(orderedItems);
  const effectiveBoost = isBoostOverride !== null ? isBoostOverride : autoBoost;

  useEffect(() => {
    setOrderDate(fieldDate(initial?.order_date));
    setOrderTime(String(initial?.order_time || "").slice(0, 5));
    setAggregator(String(initial?.aggregator || "").toLowerCase());
    setBranch(String(initial?.branch || ""));
    setBrand(String(initial?.brand || ""));
    setOrderId(String(initial?.order_id || ""));
    setOrderedItems(String(initial?.ordered_items || ""));
    setAmount(
      initial?.amount != null && Number.isFinite(Number(initial.amount)) ? String(initial.amount) : "",
    );
    setCustomerReview(String(initial?.customer_review || ""));
    setCustomerName(String(initial?.customer_name || ""));
    setPic(String(initial?.pic || ""));
    setIsBoostOverride(initial?.is_rating_boost != null ? Boolean(initial.is_rating_boost) : null);
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
    const payload: Record<string, unknown> = {
      order_date: orderDate.trim(),
      order_time: orderTime.trim() === "" ? null : orderTime.trim(),
      aggregator: aggregator.trim().toLowerCase(),
      branch: branch.trim(),
      brand: brand.trim(),
      order_id: orderId.trim(),
      ordered_items: orderedItems.trim(),
      amount: amount.trim() === "" ? null : Number(amount),
      rating: 5,
      customer_review: customerReview.trim(),
      customer_name: customerName.trim(),
      pic: pic.trim(),
      is_rating_boost: effectiveBoost,
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
        <h2 className={T_SECTION}>{isEdit ? "Edit high rating" : "New high rating"}</h2>
        <p className={T_CAPTION + " mt-1"}>
          {city === "manila" ? "Manila" : "Dubai"} · 5-star reviews only
        </p>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3">
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
              <div className={T_LABEL}>Order time (HH:MM)</div>
              <input
                type="time"
                value={orderTime}
                onChange={(e) => setOrderTime(e.target.value)}
                className={"mt-1 w-full " + INPUT_CLASS}
              />
            </label>
          </div>

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

          <div>
            <label className="block">
              <div className={T_LABEL}>Ordered items *</div>
              <textarea
                required
                rows={3}
                value={orderedItems}
                onChange={(e) => {
                  setOrderedItems(e.target.value);
                  setIsBoostOverride(null);
                }}
                className={"mt-1 w-full " + INPUT_CLASS}
              />
            </label>
            {autoBoost && (
              <p className="mt-1 text-xs text-amber-400">
                Auto-detected as rating boost ({RATING_BOOST_ITEMS.join(", ")} only)
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              id="is_boost"
              type="checkbox"
              checked={effectiveBoost}
              onChange={(e) => setIsBoostOverride(e.target.checked)}
              className="h-4 w-4 rounded border border-white/20 bg-white/10 accent-amber-400"
            />
            <label htmlFor="is_boost" className={T_LABEL + " cursor-pointer"}>
              Mark as rating boost order
            </label>
          </div>

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
            <div className={T_LABEL}>Customer name</div>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className={"mt-1 w-full " + INPUT_CLASS}
              placeholder="Optional"
            />
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
