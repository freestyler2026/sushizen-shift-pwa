"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, getAuthHeaders, getUploadHeaders, refreshAuthFromApi } from "@/lib/auth";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SMALL_BUTTON,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
  TAB_ACTIVE,
  TAB_CONTAINER,
  TAB_INACTIVE,
  TEXTAREA_CLASS,
} from "@/lib/ui-tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

type SPRItem = {
  id: string;
  name: string;
  qty: number;
  unit: string;
  vendor: string;
  item_url: string;
  unit_price: string;
  notes: string;
  photo_url: string;
  photoUploading: boolean;
  photoError: string;
};

type SPRRequest = {
  id: number;
  request_no: string;
  status: string;
  location: string;
  needed_by_date: string;
  purpose: string;
  items: {
    name: string;
    qty: number;
    unit: string;
    vendor: string;
    item_url: string;
    unit_price: number | null;
    notes: string;
    photo_url: string;
  }[];
  total_budget: number | null;
  requested_by: string;
  requested_at: string;
  approval_notes: string;
  rejection_reason: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  purchased_at: string | null;
  receipt_url: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case "PENDING":   return <span className={BADGE_WARNING}>Pending</span>;
    case "APPROVED":  return <span className={BADGE_INFO}>Approved</span>;
    case "PURCHASED": return <span className={BADGE_SUCCESS}>Purchased</span>;
    case "REJECTED":  return <span className={BADGE_ERROR}>Rejected</span>;
    default:          return <span className={BADGE_INFO}>{status}</span>;
  }
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function newItem(): SPRItem {
  return {
    id: Math.random().toString(36).slice(2),
    name: "",
    qty: 1,
    unit: "pc",
    vendor: "",
    item_url: "",
    unit_price: "",
    notes: "",
    photo_url: "",
    photoUploading: false,
    photoError: "",
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StoreSpotPurchasePage() {
  const router = useRouter();
  const initialAuth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [auth, setAuthState] = useState(initialAuth);

  useEffect(() => {
    let cancelled = false;
    refreshAuthFromApi(getAuth()).then((refreshed) => {
      if (cancelled) return;
      const resolved = refreshed || getAuth() || initialAuth;
      if (!resolved?.staffName) {
        router.replace(`/login?next=${encodeURIComponent("/store/spot-purchase")}`);
        return;
      }
      setAuthState(resolved);
      setReady(true);
    }).catch(() => {
      if (cancelled) return;
      const fallback = getAuth() || initialAuth;
      if (!fallback?.staffName) {
        router.replace(`/login?next=${encodeURIComponent("/store/spot-purchase")}`);
        return;
      }
      setAuthState(fallback);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  if (!ready) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950/30 to-slate-950 flex items-center justify-center">
        <p className="text-zinc-400">Loading…</p>
      </main>
    );
  }

  return <SpotPurchaseApp auth={auth} />;
}

// ─── Main App ─────────────────────────────────────────────────────────────────

function SpotPurchaseApp({ auth }: { auth: ReturnType<typeof getAuth> }) {
  const [tab, setTab] = useState<"new" | "my">("new");
  const [myRequests, setMyRequests] = useState<SPRRequest[]>([]);
  const [loadingMy, setLoadingMy] = useState(false);

  const [items, setItems] = useState<SPRItem[]>([newItem()]);
  const [location, setLocation] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [purpose, setPurpose] = useState("");
  const [totalBudget, setTotalBudget] = useState("");
  const [requestedBy, setRequestedBy] = useState(auth?.staffName || "");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState<SPRRequest | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [myLoadError, setMyLoadError] = useState("");

  const photoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const today = new Date().toISOString().split("T")[0];

  async function loadMyRequests() {
    setLoadingMy(true);
    setMyLoadError("");
    try {
      const res = await fetch("/api/store/spot-purchase/requests/my", {
        headers: getAuthHeaders(auth),
      });
      if (res.ok) {
        const data = await res.json();
        setMyRequests(data.requests || []);
      } else {
        const err = await res.json().catch(() => ({ detail: "Failed to load requests" }));
        setMyLoadError(typeof err.detail === "string" ? err.detail : "Failed to load requests");
      }
    } catch {
      setMyLoadError("Network error — please try again.");
    } finally {
      setLoadingMy(false);
    }
  }

  useEffect(() => {
    if (tab === "my") {
      setExpandedId(null);
      loadMyRequests();
    }
  }, [tab]);

  // ─── Item helpers ───────────────────────────────────────────────────────────

  function updateItem(id: string, patch: Partial<SPRItem>) {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, ...patch } : it));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  async function uploadPhoto(itemId: string, file: File) {
    updateItem(itemId, { photoUploading: true, photoError: "" });
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/store/spot-purchase/upload-photo", {
        method: "POST",
        headers: getUploadHeaders(auth),
        body: form,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      updateItem(itemId, { photo_url: data.photo_url || "", photoUploading: false });
    } catch {
      updateItem(itemId, { photoUploading: false, photoError: "Photo upload failed. Please try again." });
    }
  }

  // ─── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");
    const validItems = items.filter((it) => it.name.trim());
    if (!validItems.length) {
      setSubmitError("Add at least one item with a name.");
      return;
    }
    if (!location.trim() || !purpose.trim() || !neededBy) {
      setSubmitError("Location, purpose, and needed-by date are required.");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        location: location.trim(),
        needed_by_date: neededBy,
        purpose: purpose.trim(),
        items: validItems.map((it) => ({
          name: it.name.trim(),
          qty: Number(it.qty) || 1,
          unit: it.unit.trim() || "pc",
          vendor: it.vendor.trim(),
          item_url: it.item_url.trim(),
          unit_price: it.unit_price !== "" ? Number(it.unit_price) : null,
          notes: it.notes.trim(),
          photo_url: it.photo_url,
        })),
        total_budget: totalBudget !== "" ? Number(totalBudget) : null,
        requested_by: requestedBy.trim() || auth?.staffName || "",
      };
      const res = await fetch("/api/store/spot-purchase/requests", {
        method: "POST",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Request failed" }));
        throw new Error(err.detail || "Request failed");
      }
      const data = await res.json();
      setSubmitted(data.request);
      setItems([newItem()]);
      setLocation("");
      setNeededBy("");
      setPurpose("");
      setTotalBudget("");
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950/30 to-slate-950 p-4 pb-20">
      <div className="mx-auto max-w-3xl space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 pt-2">
          <div>
            <h1 className={T_PAGE_TITLE}>Spot Purchase</h1>
            <p className={T_CAPTION + " mt-0.5"}>Kitchen equipment, appliances &amp; tools</p>
          </div>
        </div>

        {/* Tabs */}
        <div className={TAB_CONTAINER}>
          <button className={tab === "new" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => setTab("new")}>New Request</button>
          <button className={tab === "my" ? TAB_ACTIVE : TAB_INACTIVE} onClick={() => { setTab("my"); }}>My Requests</button>
        </div>

        {/* ── New Request Tab ─────────────────────────────────────────────── */}
        {tab === "new" && (
          <div className="space-y-4">
            {submitted && (
              <div className={`${GLASS_CARD} p-5 border-emerald-500/20`}>
                <p className="text-emerald-400 font-semibold">Request submitted! {submitted.request_no}</p>
                <p className={T_CAPTION + " mt-1"}>Back Office will review and notify you.</p>
                <button className={`${SMALL_BUTTON} mt-3`} onClick={() => setSubmitted(null)}>Submit another</button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Basic info */}
              <div className={`${GLASS_CARD} p-5 space-y-4`}>
                <p className={T_SECTION}>Request Details</p>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={`${T_LABEL} block mb-1.5`}>Requested By</label>
                    <input
                      className={INPUT_CLASS}
                      value={requestedBy}
                      onChange={(e) => setRequestedBy(e.target.value)}
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label className={`${T_LABEL} block mb-1.5`}>Location / Branch</label>
                    <input
                      className={INPUT_CLASS}
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. CK, BGC, Uptown"
                    />
                  </div>
                  <div>
                    <label className={`${T_LABEL} block mb-1.5`}>Needed By Date</label>
                    <input
                      type="date"
                      min={today}
                      className={INPUT_CLASS}
                      value={neededBy}
                      onChange={(e) => setNeededBy(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={`${T_LABEL} block mb-1.5`}>Total Budget (PHP)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={INPUT_CLASS}
                      value={totalBudget}
                      onChange={(e) => setTotalBudget(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div>
                  <label className={`${T_LABEL} block mb-1.5`}>Purpose / Justification</label>
                  <textarea
                    className={TEXTAREA_CLASS}
                    rows={2}
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="Why is this purchase needed?"
                  />
                </div>
              </div>

              {/* Items */}
              <div className={`${GLASS_CARD} p-5 space-y-4`}>
                <div className="flex items-center justify-between">
                  <p className={T_SECTION}>Items ({items.length})</p>
                  <button
                    type="button"
                    className={SMALL_BUTTON}
                    onClick={() => setItems((prev) => [...prev, newItem()])}
                  >
                    + Add Item
                  </button>
                </div>

                {items.map((item, idx) => (
                  <div key={item.id} className="rounded-xl border border-white/8 bg-white/3 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Item {idx + 1}</span>
                      {items.length > 1 && (
                        <button type="button" className="text-xs text-red-400 hover:text-red-300" onClick={() => removeItem(item.id)}>Remove</button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className={`${T_LABEL} block mb-1`}>Item Name *</label>
                        <input
                          className={INPUT_CLASS}
                          value={item.name}
                          onChange={(e) => updateItem(item.id, { name: e.target.value })}
                          placeholder="e.g. Commercial Rice Cooker"
                        />
                      </div>
                      <div>
                        <label className={`${T_LABEL} block mb-1`}>Qty</label>
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          className={INPUT_CLASS}
                          value={item.qty}
                          onChange={(e) => updateItem(item.id, { qty: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <label className={`${T_LABEL} block mb-1`}>Unit</label>
                        <input
                          className={INPUT_CLASS}
                          value={item.unit}
                          onChange={(e) => updateItem(item.id, { unit: e.target.value })}
                          placeholder="pc, set, box…"
                        />
                      </div>
                      <div>
                        <label className={`${T_LABEL} block mb-1`}>Vendor / Store</label>
                        <input
                          className={INPUT_CLASS}
                          value={item.vendor}
                          onChange={(e) => updateItem(item.id, { vendor: e.target.value })}
                          placeholder="e.g. Shopee, Lazada, Ace Hardware"
                        />
                      </div>
                      <div>
                        <label className={`${T_LABEL} block mb-1`}>Unit Price (PHP)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={INPUT_CLASS}
                          value={item.unit_price}
                          onChange={(e) => updateItem(item.id, { unit_price: e.target.value })}
                          placeholder="Optional"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={`${T_LABEL} block mb-1`}>Product / Listing URL</label>
                        <input
                          className={INPUT_CLASS}
                          value={item.item_url}
                          onChange={(e) => updateItem(item.id, { item_url: e.target.value })}
                          placeholder="https://shopee.ph/…"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={`${T_LABEL} block mb-1`}>Notes</label>
                        <input
                          className={INPUT_CLASS}
                          value={item.notes}
                          onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                          placeholder="Color, size, model, etc."
                        />
                      </div>
                    </div>

                    {/* Photo upload */}
                    <div>
                      <label className={`${T_LABEL} block mb-1`}>Reference Photo</label>
                      {item.photo_url ? (
                        <div className="flex items-center gap-3">
                          <a href={item.photo_url} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-400 underline">View photo</a>
                          <button type="button" className="text-xs text-zinc-500 hover:text-zinc-300" onClick={() => updateItem(item.id, { photo_url: "" })}>Remove</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className={SMALL_BUTTON}
                            disabled={item.photoUploading}
                            onClick={() => photoInputRefs.current[item.id]?.click()}
                          >
                            {item.photoUploading ? "Uploading…" : "Upload Photo"}
                          </button>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={(el) => { photoInputRefs.current[item.id] = el; }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) uploadPhoto(item.id, file);
                              e.target.value = "";
                            }}
                          />
                          <span className={T_CAPTION}>PNG, JPG — max 20 MB</span>
                        </div>
                      )}
                      {item.photoError && <p className="mt-1 text-xs text-red-400">{item.photoError}</p>}
                    </div>
                  </div>
                ))}
              </div>

              {submitError && <p className="text-sm text-red-400">{submitError}</p>}

              <button type="submit" className={`${PRIMARY_BUTTON} w-full`} disabled={submitting}>
                {submitting ? "Submitting…" : "Submit Spot Purchase Request"}
              </button>
            </form>
          </div>
        )}

        {/* ── My Requests Tab ──────────────────────────────────────────────── */}
        {tab === "my" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={T_CAPTION}>{myRequests.length} request{myRequests.length !== 1 ? "s" : ""}</span>
              <button className={SMALL_BUTTON} disabled={loadingMy} onClick={loadMyRequests}>
                {loadingMy ? "Loading…" : "Refresh"}
              </button>
            </div>
            {myLoadError && (
              <p className="text-sm text-red-400">{myLoadError}</p>
            )}
            {!loadingMy && !myLoadError && myRequests.length === 0 && (
              <div className={`${GLASS_CARD} p-6 text-center`}>
                <p className="text-zinc-400">No spot purchase requests yet.</p>
              </div>
            )}
            {myRequests.map((req) => (
              <div key={req.id} className={GLASS_CARD}>
                <div
                  className="flex items-start justify-between p-5 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{req.request_no}</span>
                      {statusBadge(req.status)}
                    </div>
                    <p className="text-sm text-zinc-300">{req.purpose}</p>
                    <p className={T_CAPTION}>
                      {req.location} · Needed by {fmtDate(req.needed_by_date)} · {req.items.length} item{req.items.length !== 1 ? "s" : ""}
                      {req.total_budget != null && ` · Budget ₱${req.total_budget.toLocaleString()}`}
                    </p>
                  </div>
                  <span className="text-zinc-500 text-sm ml-3">{expandedId === req.id ? "▲" : "▼"}</span>
                </div>

                {expandedId === req.id && (
                  <div className="border-t border-white/5 px-5 pb-5 pt-4 space-y-3">
                    {req.items.map((it, i) => (
                      <div key={i} className="rounded-lg border border-white/6 bg-white/3 p-3 space-y-1">
                        <p className="text-sm font-semibold text-white">{it.name}</p>
                        <p className={T_CAPTION}>
                          {it.qty} {it.unit}
                          {it.vendor && ` · ${it.vendor}`}
                          {it.unit_price != null && ` · ₱${it.unit_price.toLocaleString()}`}
                        </p>
                        {it.notes && <p className={T_CAPTION}>{it.notes}</p>}
                        {it.item_url && <a href={it.item_url} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-400 underline break-all">View listing</a>}
                        {it.photo_url && <a href={it.photo_url} target="_blank" rel="noopener noreferrer" className="block text-xs text-violet-400 underline">View reference photo</a>}
                      </div>
                    ))}

                    {req.status === "APPROVED" && req.approval_notes && (
                      <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 px-3 py-2">
                        <p className={T_LABEL + " mb-0.5"}>Approval Note</p>
                        <p className="text-sm text-violet-300">{req.approval_notes}</p>
                        <p className={T_CAPTION + " mt-0.5"}>{req.approved_by} · {fmtDate(req.approved_at)}</p>
                      </div>
                    )}
                    {req.status === "REJECTED" && (
                      <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                        <p className={T_LABEL + " mb-0.5"}>Rejection Reason</p>
                        <p className="text-sm text-red-300">{req.rejection_reason}</p>
                        <p className={T_CAPTION + " mt-0.5"}>{req.rejected_by} · {fmtDate(req.rejected_at)}</p>
                      </div>
                    )}
                    {req.status === "PURCHASED" && req.receipt_url && (
                      <a href={req.receipt_url} target="_blank" rel="noopener noreferrer" className={`${SMALL_BUTTON} inline-flex`}>View Receipt</a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
