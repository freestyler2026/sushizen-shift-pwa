"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getAuth, canAccessAdminNav, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  TAB_ACTIVE,
  TAB_INACTIVE,
  T_PAGE_TITLE,
  T_LABEL,
  T_CAPTION,
  INPUT_CLASS,
} from "@/lib/ui-tokens";
import { apiGet } from "@/lib/api";

const API_BASE = "";

const STORES = [
  { code: "PAR",  label: "Paranaque" },
  { code: "TAFT", label: "Taft" },
  { code: "CUB",  label: "Cubao" },
  { code: "CK",   label: "CK" },
];

type DmStatus = "unregistered" | "ok" | "blocked";

interface Recipient {
  id: number;
  store_code: string;
  staff_name: string;
  discord_user_id: string;
  is_active: boolean;
  created_at: string;
  discord_dm_status: DmStatus;
  discord_checked_at: string | null;
}

async function apiFetchAuthed(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try { msg = JSON.parse(text).detail ?? text; } catch { /* noop */ }
    throw new Error(msg);
  }
  return text ? JSON.parse(text) : {};
}

function DmStatusBadge({ status }: { status: DmStatus }) {
  if (status === "ok") {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
        DM OK
      </span>
    );
  }
  if (status === "blocked") {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-400">
        DM Blocked
      </span>
    );
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full border border-zinc-600 bg-zinc-800 text-zinc-400">
      Not tested
    </span>
  );
}

export default function DiscordAlertsPage() {
  const router = useRouter();
  const auth = getAuth();

  useEffect(() => {
    const r = (auth?.role ?? "").toUpperCase();
    if (!canAccessAdminNav(auth) && r !== "HQ" && r !== "ADMIN") {
      router.replace("/week");
    }
  }, [auth, router]);

  const [selectedStore, setSelectedStore] = useState("PAR");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");
  const [adding, setAdding] = useState(false);

  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; ok: boolean; message: string } | null>(null);

  const approver = auth?.staffName ?? "";
  const pin = auth?.pin ?? "";

  const loadRecipients = useCallback(async (code: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet<{ recipients: Recipient[] }>(
        `/api/admin/discord-alert-recipients?store_code=${code}&approver_name=${encodeURIComponent(approver)}&pin=${encodeURIComponent(pin)}`
      );
      setRecipients(data.recipients ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [approver, pin]);

  useEffect(() => {
    loadRecipients(selectedStore);
    setTestResult(null);
  }, [selectedStore, loadRecipients]);

  async function handleAdd() {
    if (!newName.trim() || !newId.trim()) return;
    setAdding(true);
    setError("");
    try {
      await apiFetchAuthed("/api/admin/discord-alert-recipients", {
        method: "POST",
        body: JSON.stringify({
          store_code: selectedStore,
          staff_name: newName.trim(),
          discord_user_id: newId.trim(),
          approver_name: approver,
          pin,
        }),
      });
      setNewName("");
      setNewId("");
      await loadRecipients(selectedStore);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Remove this recipient?")) return;
    setError("");
    try {
      await apiFetchAuthed(
        `/api/admin/discord-alert-recipients/${id}?approver_name=${encodeURIComponent(approver)}&pin=${encodeURIComponent(pin)}`,
        { method: "DELETE" }
      );
      setRecipients((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function handleToggle(id: number, current: boolean) {
    setError("");
    try {
      await apiFetchAuthed(
        `/api/admin/discord-alert-recipients/${id}/toggle?is_active=${!current}&approver_name=${encodeURIComponent(approver)}&pin=${encodeURIComponent(pin)}`,
        { method: "PATCH" }
      );
      setRecipients((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_active: !current } : r))
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function handleTestDm(id: number) {
    setTestingId(id);
    setTestResult(null);
    try {
      const data = await apiFetchAuthed(
        `/api/admin/discord-alert-recipients/${id}/test-dm?approver_name=${encodeURIComponent(approver)}&pin=${encodeURIComponent(pin)}`,
        { method: "POST" }
      );
      setTestResult({ id, ok: data.ok, message: data.message });
      // Refresh to get updated dm_status badge
      await loadRecipients(selectedStore);
    } catch (e: unknown) {
      setTestResult({ id, ok: false, message: e instanceof Error ? e.message : "Test failed" });
    } finally {
      setTestingId(null);
    }
  }

  const storeLabel = STORES.find((s) => s.code === selectedStore)?.label ?? selectedStore;

  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-violet-950/20 to-zinc-950 p-4 md:p-8">
      <div className="mx-auto max-w-2xl space-y-6">

        {/* Header */}
        <div>
          <p className={T_LABEL}>Admin</p>
          <h1 className={T_PAGE_TITLE}>Discord Alert Recipients</h1>
          <p className={T_CAPTION + " mt-1"}>
            Manage who receives Discord DM alerts for each store&apos;s missing submissions.
          </p>
        </div>

        {/* Store tabs */}
        <div className="flex flex-wrap gap-2">
          {STORES.map((s) => (
            <button
              key={s.code}
              onClick={() => setSelectedStore(s.code)}
              className={selectedStore === s.code ? TAB_ACTIVE : TAB_INACTIVE}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Test DM result banner */}
        {testResult && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${
            testResult.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}>
            {testResult.ok ? "✅" : "❌"} {testResult.message}
          </div>
        )}

        {/* Recipients card */}
        <div className={GLASS_CARD + " p-5 space-y-4"}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">{storeLabel} — Recipients</p>
            {loading && <span className={T_CAPTION}>Loading…</span>}
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          {/* Recipient list */}
          {recipients.length === 0 && !loading ? (
            <p className={T_CAPTION}>No recipients registered for {storeLabel}.</p>
          ) : (
            <div className="space-y-2">
              {recipients.map((r) => (
                <div
                  key={r.id}
                  className={`rounded-xl border px-4 py-3 transition-all ${
                    r.is_active
                      ? "border-white/10 bg-white/4"
                      : "border-white/5 bg-white/2 opacity-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-medium ${r.is_active ? "text-white" : "text-zinc-500"}`}>
                          {r.staff_name}
                        </p>
                        <DmStatusBadge status={r.discord_dm_status ?? "unregistered"} />
                      </div>
                      <p className={T_CAPTION + " font-mono mt-0.5"}>{r.discord_user_id}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleTestDm(r.id)}
                        disabled={testingId === r.id}
                        className="text-xs px-3 py-1 rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-all disabled:opacity-50"
                      >
                        {testingId === r.id ? "Sending…" : "Test DM"}
                      </button>
                      <button
                        onClick={() => handleToggle(r.id, r.is_active)}
                        className={`text-xs px-3 py-1 rounded-lg border transition-all ${
                          r.is_active
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                            : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                        }`}
                      >
                        {r.is_active ? "Active" : "Paused"}
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="text-xs px-3 py-1 rounded-lg border border-red-500/20 bg-red-500/8 text-red-400 hover:bg-red-500/20 transition-all"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add recipient form */}
          <div className="border-t border-white/8 pt-4">
            <p className={T_LABEL + " mb-3"}>Add Recipient</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:gap-3">
              <div className="grid grid-cols-2 gap-2">
                <input
                  className={INPUT_CLASS}
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
                <input
                  className={INPUT_CLASS + " font-mono"}
                  placeholder="Discord User ID"
                  value={newId}
                  onChange={(e) => setNewId(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  maxLength={20}
                />
              </div>
              <button
                onClick={handleAdd}
                disabled={adding || !newName.trim() || !newId.trim()}
                className={PRIMARY_BUTTON}
              >
                {adding ? "Adding…" : "+ Add"}
              </button>
            </div>
            <p className={T_CAPTION + " mt-2"}>
              Discord User ID: right-click a user in Discord → &quot;Copy User ID&quot; (Developer Mode required).
            </p>
          </div>
        </div>

        {/* Info box */}
        <div className={GLASS_CARD + " p-4 space-y-3"}>
          <p className={T_LABEL}>Notification Schedule</p>
          <div className="space-y-1">
            <p className={T_CAPTION}>
              <span className="text-zinc-300 font-medium">Store Evaluation alert</span>
              {" "}— Daily 15:00 PHT. Fires for each store without a submitted evaluation.
            </p>
            <p className={T_CAPTION}>
              <span className="text-zinc-300 font-medium">CK Dispatch alert</span>
              {" "}— Daily 16:00 PHT. Fires when CK deliveries are still pending.
            </p>
            <p className={T_CAPTION}>
              <span className="text-zinc-300 font-medium">30-min reminder</span>
              {" "}— Auto-sent if data still missing 30 min after first alert.
            </p>
            <p className={T_CAPTION}>
              <span className="text-zinc-300 font-medium">60-min escalation</span>
              {" "}— Flagged as unresolved (NTE candidate) if no submission after 60 min.
            </p>
          </div>
          <div className="border-t border-white/8 pt-3">
            <p className={T_CAPTION}>
              <span className="text-zinc-300 font-medium">DM Status</span>{" "}
              shows whether the last test or scheduled DM was delivered.{" "}
              <span className="text-red-400">DM Blocked</span> means the user&apos;s DMs are
              disabled or they have not joined the server — this is a{" "}
              <span className="text-zinc-300">system delivery failure</span>, not a non-response.
            </p>
          </div>
        </div>

      </div>
    </main>
  );
}
