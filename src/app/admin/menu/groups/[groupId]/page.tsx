"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessMenuAdmin, getAuth, refreshAuthFromApi, type City } from "@/lib/auth";
import { menuGet, menuPatch, menuPost } from "@/lib/menuClient";

type ProductOption = { id: string; name: string; sku: string; status: string };
type ComboOption = { id: string; name: string; sku: string; status: string };
type GroupProductRow = { id: string; product_id: string; product_name: string; sku: string; sort_order: number; status: string };
type GroupComboRow = { id: string; combo_id: string; combo_name: string; sku: string; sort_order: number; status: string };
type GroupContentSummary = { product_count: number; combo_count: number };
type GroupRow = {
  id: string; city: string; name: string; name_localized: string; reference: string; description: string; status: string; sort_order: number;
  products?: GroupProductRow[]; combos?: GroupComboRow[]; content_summary?: GroupContentSummary;
};

export default function MenuGroupDetailPage() {
  const params = useParams<{ groupId: string }>();
  const searchParams = useSearchParams();
  const groupId = String(params?.groupId || "");
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<City>((auth?.city || "manila") as City);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [group, setGroup] = useState<GroupRow | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [combos, setCombos] = useState<ComboOption[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedComboId, setSelectedComboId] = useState("");
  const [productSortOrder, setProductSortOrder] = useState("0");
  const [comboSortOrder, setComboSortOrder] = useState("0");
  const [productLinkStatus, setProductLinkStatus] = useState("ACTIVE");
  const [comboLinkStatus, setComboLinkStatus] = useState("ACTIVE");
  const [editingProductLinkId, setEditingProductLinkId] = useState("");
  const [editingComboLinkId, setEditingComboLinkId] = useState("");

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
      const [groupRes, productsRes, combosRes] = await Promise.all([
        menuGet<{ row: GroupRow }>(`/api/admin/menu/groups/${encodeURIComponent(groupId)}?city=${encodeURIComponent(nextCity)}`),
        menuGet<{ rows: ProductOption[] }>(`/api/admin/menu/products?city=${encodeURIComponent(nextCity)}&tab=ALL&limit=300`),
        menuGet<{ rows: ComboOption[] }>(`/api/admin/menu/combos?city=${encodeURIComponent(nextCity)}&tab=ALL&limit=300`),
      ]);
      const nextGroup = groupRes.row || null;
      setGroup(nextGroup);
      const nextProducts = (productsRes.rows || []).filter((row) => row.status !== "DELETED");
      const nextCombos = (combosRes.rows || []).filter((row) => row.status !== "DELETED");
      setProducts(nextProducts);
      setCombos(nextCombos);
      setSelectedProductId((current) => current || nextProducts[0]?.id || "");
      setSelectedComboId((current) => current || nextCombos[0]?.id || "");
      if (nextGroup?.city) setCity(nextGroup.city as City);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [city, groupId]);

  useEffect(() => {
    if (!ready || !allowed || !groupId) return;
    void loadDetail();
  }, [allowed, groupId, loadDetail, ready]);

  async function saveBasicInfo() {
    if (!group) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await menuPatch<{ row: GroupRow }>(`/api/admin/menu/groups/${encodeURIComponent(group.id)}?city=${encodeURIComponent(city)}`, group);
      setGroup(res.row || group);
      setSuccess("Group detail updated.");
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveProductLink() {
    if (!selectedProductId) return setError("Please select product.");
    setLinkSaving(true);
    setError("");
    setSuccess("");
    try {
      if (editingProductLinkId) {
        await menuPatch(`/api/admin/menu/groups/${encodeURIComponent(groupId)}/products/${encodeURIComponent(editingProductLinkId)}?city=${encodeURIComponent(city)}`, {
          sort_order: Number(productSortOrder || 0),
          status: productLinkStatus,
        });
        setSuccess("Group product updated.");
      } else {
        await menuPost(`/api/admin/menu/groups/${encodeURIComponent(groupId)}/products?city=${encodeURIComponent(city)}`, {
          product_id: selectedProductId,
          sort_order: Number(productSortOrder || 0),
          status: productLinkStatus,
        });
        setSuccess("Product added to group.");
      }
      setEditingProductLinkId("");
      setProductSortOrder("0");
      setProductLinkStatus("ACTIVE");
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLinkSaving(false);
    }
  }

  async function saveComboLink() {
    if (!selectedComboId) return setError("Please select combo.");
    setLinkSaving(true);
    setError("");
    setSuccess("");
    try {
      if (editingComboLinkId) {
        await menuPatch(`/api/admin/menu/groups/${encodeURIComponent(groupId)}/combos/${encodeURIComponent(editingComboLinkId)}?city=${encodeURIComponent(city)}`, {
          sort_order: Number(comboSortOrder || 0),
          status: comboLinkStatus,
        });
        setSuccess("Group combo updated.");
      } else {
        await menuPost(`/api/admin/menu/groups/${encodeURIComponent(groupId)}/combos?city=${encodeURIComponent(city)}`, {
          combo_id: selectedComboId,
          sort_order: Number(comboSortOrder || 0),
          status: comboLinkStatus,
        });
        setSuccess("Combo added to group.");
      }
      setEditingComboLinkId("");
      setComboSortOrder("0");
      setComboLinkStatus("ACTIVE");
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLinkSaving(false);
    }
  }

  async function deleteProductLink(linkId: string) {
    if (!window.confirm("Remove this product from the group?")) return;
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/groups/${encodeURIComponent(groupId)}/products/${encodeURIComponent(linkId)}/delete?city=${encodeURIComponent(city)}`, {});
      setSuccess("Product removed from group.");
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function deleteComboLink(linkId: string) {
    if (!window.confirm("Remove this combo from the group?")) return;
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/groups/${encodeURIComponent(groupId)}/combos/${encodeURIComponent(linkId)}/delete?city=${encodeURIComponent(city)}`, {});
      setSuccess("Combo removed from group.");
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function updateStatus(status: "ACTIVE" | "INACTIVE") {
    if (!group) return;
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/groups/${encodeURIComponent(group.id)}/status`, { city, status });
      setSuccess(`Group marked ${status.toLowerCase()}.`);
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function deleteGroup() {
    if (!group) return;
    if (!window.confirm("Delete this group?")) return;
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/groups/${encodeURIComponent(group.id)}/delete?city=${encodeURIComponent(city)}`, {});
      setSuccess("Group deleted.");
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  if (!ready) return <div className="text-sm text-neutral-500">Loading group...</div>;
  if (!allowed) return <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5 text-sm text-neutral-400">You do not have permission to open Menu Builder.</div>;
  if (!groupId) return <div className="text-sm text-rose-300">Group id is missing.</div>;
  if (loading && !group) return <div className="text-sm text-neutral-500">Loading group detail...</div>;
  if (!group) return <div className="text-sm text-rose-300">Group was not found.</div>;
  const backHref = `/admin/menu/groups${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  return (
    <div className="space-y-4">
      <div>
        <Link href={backHref} className="text-xs text-amber-200 hover:text-amber-100">
          Back to Groups
        </Link>
      </div>
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr),360px]">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-neutral-100">Basic Info</div>
              <div className="mt-1 text-xs text-neutral-400">Groups can include both individual products and reusable combos.</div>
            </div>
            <div className="rounded-full border border-neutral-700 px-3 py-1 text-[10px] text-neutral-300">{group.status}</div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {[
              ["Name", "name"], ["Reference", "reference"],
            ].map(([label, key]) => (
              <label key={key} className="block text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">{label}</div>
                <input value={(group as any)[key] || ""} onChange={(e) => setGroup((current) => current ? { ...current, [key]: e.target.value } : current)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
              </label>
            ))}
            <label className="block text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">Sort Order</div>
              <input value={String(group.sort_order ?? 0)} onChange={(e) => setGroup((current) => current ? { ...current, sort_order: Number(e.target.value || 0) } : current)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="mt-3 block text-sm text-neutral-300">
            <div className="mb-1 text-xs text-neutral-500">Description</div>
            <textarea value={group.description || ""} onChange={(e) => setGroup((current) => current ? { ...current, description: e.target.value } : current)} rows={3} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
          </label>
          {error ? <div className="mt-3 text-xs text-rose-300">{error}</div> : null}
          {success ? <div className="mt-3 text-xs text-emerald-300">{success}</div> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void saveBasicInfo()} disabled={saving} className="rounded-xl border border-amber-700 bg-amber-950/30 px-4 py-2 text-sm text-amber-100 disabled:opacity-50">{saving ? "Saving..." : "Save Changes"}</button>
            {group.status === "ACTIVE" ? <button type="button" onClick={() => void updateStatus("INACTIVE")} className="rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-200">Inactivate</button> : <button type="button" onClick={() => void updateStatus("ACTIVE")} className="rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-200">Activate</button>}
            {group.status !== "DELETED" ? <button type="button" onClick={() => void deleteGroup()} className="rounded-xl border border-rose-900/80 px-4 py-2 text-sm text-rose-200">Delete</button> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="text-sm font-semibold text-neutral-100">Content Summary</div>
          <div className="mt-4 space-y-2 text-sm text-neutral-300">
            <div className="flex justify-between gap-3"><span className="text-neutral-500">Products</span><span>{group.content_summary?.product_count ?? group.products?.length ?? 0}</span></div>
            <div className="flex justify-between gap-3"><span className="text-neutral-500">Combos</span><span>{group.content_summary?.combo_count ?? group.combos?.length ?? 0}</span></div>
            <div className="flex justify-between gap-3"><span className="text-neutral-500">Sort Order</span><span>{group.sort_order}</span></div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="text-sm font-semibold text-neutral-100">{editingProductLinkId ? "Edit Product Link" : "Add Product"}</div>
          <div className="mt-4 space-y-3">
            <label className="block text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">Product</div>
              <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} disabled={Boolean(editingProductLinkId)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm disabled:opacity-60">
                {products.map((row) => <option key={row.id} value={row.id}>{row.name} {row.sku ? `(${row.sku})` : ""}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">Sort Order</div>
                <input value={productSortOrder} onChange={(e) => setProductSortOrder(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
              </label>
              <label className="block text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">Status</div>
                <select value={productLinkStatus} onChange={(e) => setProductLinkStatus(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm">
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void saveProductLink()} disabled={linkSaving} className="rounded-xl border border-amber-700 bg-amber-950/30 px-4 py-2 text-sm text-amber-100 disabled:opacity-50">{linkSaving ? "Saving..." : editingProductLinkId ? "Save Product Link" : "Add Product"}</button>
              {editingProductLinkId ? <button type="button" onClick={() => { setEditingProductLinkId(""); setProductSortOrder("0"); setProductLinkStatus("ACTIVE"); }} className="rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-200">Cancel</button> : null}
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="pb-2 pr-4">Product</th>
                  <th className="pb-2 pr-4">Sort</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(group.products || []).length ? group.products!.map((row) => (
                  <tr key={row.id} className="border-t border-neutral-800/80 align-top">
                    <td className="py-3 pr-4"><div className="font-medium text-neutral-100">{row.product_name}</div><div className="mt-1 text-xs text-neutral-500">{row.sku || "-"}</div></td>
                    <td className="py-3 pr-4 text-neutral-300">{row.sort_order}</td>
                    <td className="py-3 pr-4"><span className="rounded-full border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300">{row.status}</span></td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => { setEditingProductLinkId(row.id); setSelectedProductId(row.product_id); setProductSortOrder(String(row.sort_order ?? 0)); setProductLinkStatus(row.status || "ACTIVE"); }} className="rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-200">Edit</button>
                        <button type="button" onClick={() => void deleteProductLink(row.id)} className="rounded-lg border border-rose-900/80 px-2 py-1 text-xs text-rose-200">Remove</button>
                      </div>
                    </td>
                  </tr>
                )) : <tr><td className="py-4 text-neutral-500" colSpan={4}>No linked products yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="text-sm font-semibold text-neutral-100">{editingComboLinkId ? "Edit Combo Link" : "Add Combo"}</div>
          <div className="mt-4 space-y-3">
            <label className="block text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">Combo</div>
              <select value={selectedComboId} onChange={(e) => setSelectedComboId(e.target.value)} disabled={Boolean(editingComboLinkId)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm disabled:opacity-60">
                {combos.map((row) => <option key={row.id} value={row.id}>{row.name} {row.sku ? `(${row.sku})` : ""}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">Sort Order</div>
                <input value={comboSortOrder} onChange={(e) => setComboSortOrder(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
              </label>
              <label className="block text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">Status</div>
                <select value={comboLinkStatus} onChange={(e) => setComboLinkStatus(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm">
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void saveComboLink()} disabled={linkSaving} className="rounded-xl border border-amber-700 bg-amber-950/30 px-4 py-2 text-sm text-amber-100 disabled:opacity-50">{linkSaving ? "Saving..." : editingComboLinkId ? "Save Combo Link" : "Add Combo"}</button>
              {editingComboLinkId ? <button type="button" onClick={() => { setEditingComboLinkId(""); setComboSortOrder("0"); setComboLinkStatus("ACTIVE"); }} className="rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-200">Cancel</button> : null}
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="pb-2 pr-4">Combo</th>
                  <th className="pb-2 pr-4">Sort</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(group.combos || []).length ? group.combos!.map((row) => (
                  <tr key={row.id} className="border-t border-neutral-800/80 align-top">
                    <td className="py-3 pr-4"><div className="font-medium text-neutral-100">{row.combo_name}</div><div className="mt-1 text-xs text-neutral-500">{row.sku || "-"}</div></td>
                    <td className="py-3 pr-4 text-neutral-300">{row.sort_order}</td>
                    <td className="py-3 pr-4"><span className="rounded-full border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300">{row.status}</span></td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => { setEditingComboLinkId(row.id); setSelectedComboId(row.combo_id); setComboSortOrder(String(row.sort_order ?? 0)); setComboLinkStatus(row.status || "ACTIVE"); }} className="rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-200">Edit</button>
                        <button type="button" onClick={() => void deleteComboLink(row.id)} className="rounded-lg border border-rose-900/80 px-2 py-1 text-xs text-rose-200">Remove</button>
                      </div>
                    </td>
                  </tr>
                )) : <tr><td className="py-4 text-neutral-500" colSpan={4}>No linked combos yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
