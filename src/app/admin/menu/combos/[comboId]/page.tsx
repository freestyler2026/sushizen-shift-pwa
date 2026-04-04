"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessMenuAdmin, getAuth, refreshAuthFromApi, type City } from "@/lib/auth";
import { menuGet, menuPatch, menuPost } from "@/lib/menuClient";

type ProductOption = { id: string; name: string; sku: string; status: string };
type ComboProductRow = { id: string; product_id: string; product_name: string; sku: string; quantity: number; sort_order: number; product_status: string };
type ComboCostSummary = { costing_method: string; components_cost: number; fixed_cost: number; effective_cost: number; cost_percentage: number };
type ComboRow = {
  id: string; city: string; name: string; name_localized: string; sku: string; barcode: string; image_url: string; description: string;
  price: number; pricing_method: string; costing_method: string; fixed_cost: number; status: string; sort_order: number;
  products?: ComboProductRow[]; cost_summary?: ComboCostSummary;
};

export default function MenuComboDetailPage() {
  const params = useParams<{ comboId: string }>();
  const searchParams = useSearchParams();
  const comboId = String(params?.comboId || "");
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<City>((auth?.city || "manila") as City);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [combo, setCombo] = useState<ComboRow | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [sortOrder, setSortOrder] = useState("0");
  const [editingLinkId, setEditingLinkId] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      setAllowed(canAccessMenuAdmin(resolved));
      setCity((resolved?.city || auth?.city || "manila") as City);
      setReady(true);
    }
    void init();
    return () => { cancelled = true; };
  }, [auth]);

  const loadDetail = useCallback(async (nextCity = city) => {
    setLoading(true);
    setError("");
    try {
      const [comboRes, productsRes] = await Promise.all([
        menuGet<{ row: ComboRow }>(`/api/admin/menu/combos/${encodeURIComponent(comboId)}?city=${encodeURIComponent(nextCity)}`),
        menuGet<{ rows: ProductOption[] }>(`/api/admin/menu/products?city=${encodeURIComponent(nextCity)}&tab=ALL&limit=300`),
      ]);
      const nextCombo = comboRes.row || null;
      setCombo(nextCombo);
      const nextProducts = (productsRes.rows || []).filter((row) => row.status !== "DELETED");
      setProducts(nextProducts);
      setSelectedProductId((current) => current || nextProducts[0]?.id || "");
      if (nextCombo?.city) setCity(nextCombo.city as City);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [city, comboId]);

  useEffect(() => {
    if (!ready || !allowed || !comboId) return;
    void loadDetail();
  }, [allowed, comboId, loadDetail, ready]);

  async function saveBasicInfo() {
    if (!combo) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await menuPatch<{ row: ComboRow }>(`/api/admin/menu/combos/${encodeURIComponent(combo.id)}?city=${encodeURIComponent(city)}`, {
        city: combo.city,
        name: combo.name,
        name_localized: combo.name_localized,
        sku: combo.sku,
        barcode: combo.barcode,
        image_url: combo.image_url,
        description: combo.description,
        price: Number(combo.price || 0),
        pricing_method: combo.pricing_method,
        costing_method: combo.costing_method,
        fixed_cost: Number(combo.fixed_cost || 0),
        sort_order: Number(combo.sort_order || 0),
      });
      setCombo(res.row || combo);
      setSuccess("Combo detail updated.");
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveLink() {
    if (!selectedProductId) return setError("Please select product.");
    setLinkSaving(true);
    setError("");
    setSuccess("");
    try {
      if (editingLinkId) {
        await menuPatch(`/api/admin/menu/combos/${encodeURIComponent(comboId)}/products/${encodeURIComponent(editingLinkId)}?city=${encodeURIComponent(city)}`, {
          quantity: Number(quantity || 0),
          sort_order: Number(sortOrder || 0),
        });
        setSuccess("Combo product updated.");
      } else {
        await menuPost(`/api/admin/menu/combos/${encodeURIComponent(comboId)}/products?city=${encodeURIComponent(city)}`, {
          product_id: selectedProductId,
          quantity: Number(quantity || 0),
          sort_order: Number(sortOrder || 0),
        });
        setSuccess("Product added to combo.");
      }
      setEditingLinkId("");
      setQuantity("1");
      setSortOrder("0");
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLinkSaving(false);
    }
  }

  async function deleteLink(linkId: string) {
    if (!window.confirm("Remove this linked product from the combo?")) return;
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/combos/${encodeURIComponent(comboId)}/products/${encodeURIComponent(linkId)}/delete?city=${encodeURIComponent(city)}`, {});
      if (editingLinkId === linkId) {
        setEditingLinkId("");
        setQuantity("1");
        setSortOrder("0");
      }
      setSuccess("Product removed from combo.");
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function updateStatus(status: "ACTIVE" | "INACTIVE") {
    if (!combo) return;
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/combos/${encodeURIComponent(combo.id)}/status`, { city, status });
      setSuccess(`Combo marked ${status.toLowerCase()}.`);
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function deleteCombo() {
    if (!combo) return;
    if (!window.confirm("Delete this combo?")) return;
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/combos/${encodeURIComponent(combo.id)}/delete?city=${encodeURIComponent(city)}`, {});
      setSuccess("Combo deleted.");
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  if (!ready) return <div className="text-sm text-neutral-500">Loading combo...</div>;
  if (!allowed) return <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5 text-sm text-neutral-400">You do not have permission to open Menu Builder.</div>;
  if (!comboId) return <div className="text-sm text-rose-300">Combo id is missing.</div>;
  if (loading && !combo) return <div className="text-sm text-neutral-500">Loading combo detail...</div>;
  if (!combo) return <div className="text-sm text-rose-300">Combo was not found.</div>;
  const backHref = `/admin/menu/combos${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  return (
    <div className="space-y-4">
      <div>
        <Link href={backHref} className="text-xs text-amber-200 hover:text-amber-100">
          Back to Combos
        </Link>
      </div>
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr),360px]">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-neutral-100">Basic Info</div>
              <div className="mt-1 text-xs text-neutral-400">Manage the combo master record and keep the product bundle visible.</div>
            </div>
            <div className="rounded-full border border-neutral-700 px-3 py-1 text-[10px] text-neutral-300">{combo.status}</div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {[
              ["Name", "name"], ["Localized Name", "name_localized"], ["Barcode", "barcode"], ["Image URL", "image_url"],
            ].map(([label, key]) => (
              <label key={key} className="block text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">{label}</div>
                <input value={(combo as any)[key] || ""} onChange={(e) => setCombo((current) => current ? { ...current, [key]: e.target.value } : current)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
              </label>
            ))}
            <label className="block text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">SKU</div>
              <input value={combo.sku || ""} onChange={(e) => setCombo((current) => current ? { ...current, sku: e.target.value.toUpperCase() } : current)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">Price</div>
              <input value={String(combo.price ?? 0)} onChange={(e) => setCombo((current) => current ? { ...current, price: Number(e.target.value || 0) } : current)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">Fixed Cost</div>
              <input value={String(combo.fixed_cost ?? 0)} onChange={(e) => setCombo((current) => current ? { ...current, fixed_cost: Number(e.target.value || 0) } : current)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">Costing Method</div>
              <select value={combo.costing_method} onChange={(e) => setCombo((current) => current ? { ...current, costing_method: e.target.value } : current)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm">
                <option value="FROM_INGREDIENTS">From Products</option>
                <option value="FIXED_COST">Fixed Cost</option>
              </select>
            </label>
            <label className="block text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">Sort Order</div>
              <input value={String(combo.sort_order ?? 0)} onChange={(e) => setCombo((current) => current ? { ...current, sort_order: Number(e.target.value || 0) } : current)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="mt-3 block text-sm text-neutral-300">
            <div className="mb-1 text-xs text-neutral-500">Description</div>
            <textarea value={combo.description || ""} onChange={(e) => setCombo((current) => current ? { ...current, description: e.target.value } : current)} rows={3} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
          </label>
          {error ? <div className="mt-3 text-xs text-rose-300">{error}</div> : null}
          {success ? <div className="mt-3 text-xs text-emerald-300">{success}</div> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void saveBasicInfo()} disabled={saving} className="rounded-xl border border-amber-700 bg-amber-950/30 px-4 py-2 text-sm text-amber-100 disabled:opacity-50">{saving ? "Saving..." : "Save Changes"}</button>
            {combo.status === "ACTIVE" ? <button type="button" onClick={() => void updateStatus("INACTIVE")} className="rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-200">Inactivate</button> : <button type="button" onClick={() => void updateStatus("ACTIVE")} className="rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-200">Activate</button>}
            {combo.status !== "DELETED" ? <button type="button" onClick={() => void deleteCombo()} className="rounded-xl border border-rose-900/80 px-4 py-2 text-sm text-rose-200">Delete</button> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="text-sm font-semibold text-neutral-100">Cost Summary</div>
          <div className="mt-4 space-y-2 text-sm text-neutral-300">
            <div className="flex justify-between gap-3"><span className="text-neutral-500">Price</span><span>{Number(combo.price || 0).toFixed(2)}</span></div>
            <div className="flex justify-between gap-3"><span className="text-neutral-500">Products Cost</span><span>{Number(combo.cost_summary?.components_cost || 0).toFixed(2)}</span></div>
            <div className="flex justify-between gap-3"><span className="text-neutral-500">Fixed Cost</span><span>{Number(combo.cost_summary?.fixed_cost || 0).toFixed(2)}</span></div>
            <div className="flex justify-between gap-3"><span className="text-neutral-500">Effective Cost</span><span>{Number(combo.cost_summary?.effective_cost || 0).toFixed(2)}</span></div>
            <div className="flex justify-between gap-3"><span className="text-neutral-500">Cost %</span><span>{Number(combo.cost_summary?.cost_percentage || 0).toFixed(2)}%</span></div>
            <div className="flex justify-between gap-3"><span className="text-neutral-500">Linked Products</span><span>{combo.products?.length || 0}</span></div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px,1fr]">
          <div>
            <div className="text-sm font-semibold text-neutral-100">{editingLinkId ? "Edit Linked Product" : "Add Product"}</div>
            <div className="mt-1 text-xs text-neutral-400">Select a product, quantity, and sort order for this combo.</div>
            <div className="mt-4 space-y-3">
              <label className="block text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">Product</div>
                <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} disabled={Boolean(editingLinkId)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm disabled:opacity-60">
                  {products.map((row) => <option key={row.id} value={row.id}>{row.name} {row.sku ? `(${row.sku})` : ""}</option>)}
                </select>
              </label>
              <label className="block text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">Quantity</div>
                <input value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
              </label>
              <label className="block text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">Sort Order</div>
                <input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => void saveLink()} disabled={linkSaving} className="rounded-xl border border-amber-700 bg-amber-950/30 px-4 py-2 text-sm text-amber-100 disabled:opacity-50">{linkSaving ? "Saving..." : editingLinkId ? "Save Link" : "Add Product"}</button>
              {editingLinkId ? <button type="button" onClick={() => { setEditingLinkId(""); setQuantity("1"); setSortOrder("0"); }} className="rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-200">Cancel</button> : null}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-neutral-100">Linked Products</div>
              <div className="text-xs text-neutral-500">{combo.products?.length || 0} row(s)</div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs text-neutral-500">
                  <tr>
                    <th className="pb-2 pr-4">Product</th>
                    <th className="pb-2 pr-4">Quantity</th>
                    <th className="pb-2 pr-4">Sort</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(combo.products || []).length ? combo.products!.map((row) => (
                    <tr key={row.id} className="border-t border-neutral-800/80 align-top">
                      <td className="py-3 pr-4">
                        <div className="font-medium text-neutral-100">{row.product_name}</div>
                        <div className="mt-1 text-xs text-neutral-500">{row.sku || "-"}</div>
                      </td>
                      <td className="py-3 pr-4 text-neutral-300">{Number(row.quantity || 0)}</td>
                      <td className="py-3 pr-4 text-neutral-300">{Number(row.sort_order || 0)}</td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => { setEditingLinkId(row.id); setSelectedProductId(row.product_id); setQuantity(String(row.quantity ?? 1)); setSortOrder(String(row.sort_order ?? 0)); }} className="rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-200">Edit</button>
                          <button type="button" onClick={() => void deleteLink(row.id)} className="rounded-lg border border-rose-900/80 px-2 py-1 text-xs text-rose-200">Remove</button>
                        </div>
                      </td>
                    </tr>
                  )) : <tr><td className="py-4 text-neutral-500" colSpan={4}>No linked products yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
