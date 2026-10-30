"use client";
import { useCallback, useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/auth";

// HQ: franchise owner accounts. An owner sees only the stores ticked here, and
// sets their own password from a one-time link -- HQ never knows it. Sending a
// new link is also the reset: the old password and sessions stop working.

type Owner = {
  id: number; login_id: string; display_name: string; stores: string[]; active: boolean;
  has_password: boolean; invite_pending: boolean; invite_expires_at: string | null; last_login_at: string | null;
};
type StoreOpt = { code: string; name: string };

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(await getAuthHeaders()), ...(init?.headers || {}) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`);
  return data;
}

export default function OwnerPortalAdminPage() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ login_id: "", display_name: "", stores: [] as string[] });
  const [links, setLinks] = useState<Record<number, { url: string; expires: string }>>({});

  const load = useCallback(async () => {
    try {
      const d = await api("/api/admin/owner-portal/owners");
      setOwners(d.owners);
      setStores(d.stores);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/admin/owner-portal/owners", { method: "POST", body: JSON.stringify(form) });
      setForm({ login_id: "", display_name: "", stores: [] });
      load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create."); }
  }

  async function invite(o: Owner) {
    if (o.has_password && !confirm(`Send ${o.display_name} a new link? Their current password stops working.`)) return;
    try {
      const d = await api(`/api/admin/owner-portal/owners/${o.id}/invite`, { method: "POST" });
      setLinks((l) => ({ ...l, [o.id]: { url: `${window.location.origin}${d.path}`, expires: d.expires_at } }));
      load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create the link."); }
  }

  async function toggle(o: Owner) {
    try {
      await api(`/api/admin/owner-portal/owners/${o.id}`, { method: "PATCH", body: JSON.stringify({ active: !o.active }) });
      load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update."); }
  }

  const storeName = (c: string) => stores.find((s) => s.code === c)?.name || c;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Owner Portal accounts</h1>
        <p className="text-sm text-slate-400">Franchise owners sign in at <span className="font-mono">/owner</span> and see only their own stores.</p>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

      <form onSubmit={create} className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-4">
        <input placeholder="Display name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required
          className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
        <input placeholder="Login ID" value={form.login_id} onChange={(e) => setForm({ ...form, login_id: e.target.value })} required minLength={3}
          className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
        <div className="flex items-center gap-3 text-sm text-slate-200">
          {stores.map((s) => (
            <label key={s.code} className="flex items-center gap-1.5">
              <input type="checkbox" checked={form.stores.includes(s.code)}
                onChange={(e) => setForm({ ...form, stores: e.target.checked ? [...form.stores, s.code] : form.stores.filter((x) => x !== s.code) })} />
              {s.name}
            </label>
          ))}
        </div>
        <button type="submit" className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950">Add owner</button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-wider text-slate-400">
            <tr><th className="px-3 py-2">Owner</th><th className="px-3 py-2">Login ID</th><th className="px-3 py-2">Stores</th>
              <th className="px-3 py-2">Status</th><th className="px-3 py-2">Last sign-in</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {owners.map((o) => (
              <tr key={o.id} className="border-t border-white/5 align-top">
                <td className="px-3 py-2 text-white">{o.display_name}</td>
                <td className="px-3 py-2 font-mono text-slate-300">{o.login_id}</td>
                <td className="px-3 py-2">{o.stores.map(storeName).join(", ")}</td>
                <td className="px-3 py-2">
                  {!o.active ? <span className="text-slate-500">Switched off</span>
                    : o.has_password ? <span className="text-emerald-300">Active</span>
                    : o.invite_pending ? <span className="text-amber-300">Waiting for password</span>
                    : <span className="text-slate-400">No link sent</span>}
                  {links[o.id] && (
                    <div className="mt-2 max-w-md space-y-1">
                      <p className="text-xs text-slate-400">Send this link to the owner (valid until {new Date(links[o.id].expires).toLocaleString()}):</p>
                      <div className="flex gap-2">
                        <input readOnly value={links[o.id].url} className="w-full rounded border border-white/10 bg-slate-900 px-2 py-1 font-mono text-xs text-white" />
                        <button type="button" onClick={() => navigator.clipboard.writeText(links[o.id].url)}
                          className="rounded border border-white/10 px-2 py-1 text-xs text-slate-200">Copy</button>
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-400">{o.last_login_at ? new Date(o.last_login_at).toLocaleString() : "—"}</td>
                <td className="space-x-2 whitespace-nowrap px-3 py-2 text-right">
                  <button onClick={() => invite(o)} disabled={!o.active}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5 disabled:opacity-40">
                    {o.has_password ? "Reset password link" : "Create password link"}
                  </button>
                  <button onClick={() => toggle(o)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5">
                    {o.active ? "Switch off" : "Switch on"}
                  </button>
                </td>
              </tr>
            ))}
            {owners.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No owner accounts yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
