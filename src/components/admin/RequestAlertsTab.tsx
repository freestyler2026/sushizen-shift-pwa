"use client";

import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getAuth } from "@/lib/auth";
import { BADGE_ERROR, BADGE_SUCCESS } from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

const REQUEST_NOTIF_API = "/api/admin/request-notifications";

function apiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const method = (opts?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  if (method !== "GET" && method !== "HEAD") headers["Content-Type"] = "application/json";
  if (auth?.accessToken) headers["Authorization"] = `Bearer ${auth.accessToken}`;
  return fetch(path, { ...opts, headers: { ...headers, ...(opts?.headers as Record<string, string> ?? {}) } });
}

type RequestDmRecipient = {
  id: number;
  display_name: string;
  discord_user_id: string;
  city: string | null;
  is_active: boolean;
};

const CITY_OPTIONS = [
  { value: "all", label: "All cities" },
  { value: "dubai", label: "Dubai only" },
  { value: "manila", label: "Manila only" },
];

export default function RequestAlertsTab() {
  const [recipients, setRecipients] = useState<RequestDmRecipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDiscordId, setNewDiscordId] = useState("");
  const [newCity, setNewCity] = useState<"all" | "dubai" | "manila">("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadRecipients() {
    setLoading(true);
    try {
      const r = await apiFetch(`${REQUEST_NOTIF_API}/recipients`);
      if (r.ok) {
        const d = await r.json() as { ok: boolean; items: RequestDmRecipient[] };
        setRecipients(d.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadRecipients(); }, []);

  async function handleRemove(id: number) {
    if (!confirm("Remove this recipient?")) return;
    await apiFetch(`${REQUEST_NOTIF_API}/recipients/${id}`, { method: "DELETE" });
    await loadRecipients();
  }

  async function handleAdd() {
    if (!newName.trim() || !newDiscordId.trim()) { setError("Name and Discord ID are required."); return; }
    setSaving(true); setError("");
    const r = await apiFetch(`${REQUEST_NOTIF_API}/recipients`, {
      method: "POST",
      body: JSON.stringify({
        display_name: newName.trim(),
        discord_user_id: newDiscordId.trim(),
        city: newCity === "all" ? null : newCity,
      }),
    });
    if (r.ok) {
      setShowAddForm(false);
      setNewName(""); setNewDiscordId(""); setNewCity("all");
      await loadRecipients();
    } else {
      const d = await r.json().catch(() => ({})) as { detail?: string };
      setError(d.detail ?? "Failed to add.");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-400">
        When a staff member submits a shift request, a Discord DM is sent to all recipients below
        whose city matches the request. Add Rafael (Dubai only) and Peter (Manila only) to get started.
      </p>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white/70 uppercase tracking-widest">
          Discord DM Recipients
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={() => void loadRecipients()}
            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-zinc-400 hover:text-white transition-colors"
            title="Refresh">
            <RefreshCw size={13} />
          </button>
          <button onClick={() => setShowAddForm(v => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600/20 border border-violet-500/30 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-600/30 transition-colors">
            <Plus size={13} /> Add Recipient
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1">Display Name</label>
              <input value={newName} onChange={e => setNewName(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/50"
                placeholder="e.g. Rafael" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1">Discord User ID</label>
              <input value={newDiscordId} onChange={e => setNewDiscordId(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-violet-500/50"
                placeholder="e.g. 844419400240070656" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1">City filter</label>
              <SelectDark
                value={newCity}
                onChange={v => setNewCity(v as "all" | "dubai" | "manila")}
                options={CITY_OPTIONS}
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => void handleAdd()} disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={12} className="animate-spin" /> : null} Save
            </button>
            <button onClick={() => { setShowAddForm(false); setError(""); }}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500 py-4">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : recipients.length === 0 ? (
        <p className="text-sm text-zinc-500 py-4">No recipients configured.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-white/10 text-xs text-zinc-500 uppercase tracking-wider">
                <th className="pb-2 pr-4 text-left font-semibold">Name</th>
                <th className="pb-2 pr-4 text-left font-semibold">Discord ID</th>
                <th className="pb-2 pr-4 text-left font-semibold">City filter</th>
                <th className="pb-2 pr-4 text-left font-semibold">Status</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {recipients.map(r => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/3">
                  <td className="py-2.5 pr-4 text-white font-medium">{r.display_name}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-zinc-400">{r.discord_user_id}</td>
                  <td className="py-2.5 pr-4 text-zinc-300">
                    {r.city === "dubai" ? "Dubai only" : r.city === "manila" ? "Manila only" : "All cities"}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className={r.is_active ? BADGE_SUCCESS : BADGE_ERROR}>
                      {r.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    {r.is_active && (
                      <button onClick={() => void handleRemove(r.id)}
                        className="text-zinc-600 hover:text-red-400 transition-colors p-1" title="Remove">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border border-white/5 bg-white/3 px-4 py-3 text-xs text-zinc-500 space-y-1">
        <p><strong className="text-zinc-400">DM content includes:</strong> Request type, Staff name, City, Date, Reason category, Reason text</p>
        <p><strong className="text-zinc-400">City filter:</strong> &quot;Dubai only&quot; receives Dubai requests. &quot;Manila only&quot; receives Manila requests. &quot;All cities&quot; receives both.</p>
        <p><strong className="text-zinc-400">Triggered by:</strong> All request types (Day Off, Leave, Time Change, Swap, Overtime, etc.)</p>
      </div>
    </div>
  );
}
