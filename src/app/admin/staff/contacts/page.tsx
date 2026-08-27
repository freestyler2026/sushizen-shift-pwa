"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Phone, PhoneOff, RefreshCw } from "lucide-react";
import { getAuth, getAuthHeaders, canAccessAdminNav } from "@/lib/auth";
import {
  GLASS_CARD,
  SMALL_BUTTON,
  T_PAGE_TITLE,
  T_CAPTION,
  T_BODY,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  TABLE_ROW,
  TABLE_HEADER,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";

/**
 * The call list, and the holes in it.
 *
 * A call list that hides its own gaps is worse than one that shows them: you
 * find out it was incomplete at the moment you needed it. People without a
 * number are listed first.
 */

interface Contact {
  staff_name: string;
  role: string;
  phone: string;
  city: string;
}

export default function EmergencyContactsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Contact[]>([]);
  const [coverage, setCoverage] = useState<{ total?: number; with_number?: number; missing?: string[] }>({});
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace("/login?next=%2Fadmin%2Fstaff%2Fcontacts");
      return;
    }
    if (!canAccessAdminNav(auth) && auth.role !== "HQ") router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = city ? `?city=${encodeURIComponent(city)}` : "";
      const res = await fetch(`/api/admin/emergency-contacts${qs}`, {
        headers: getAuthHeaders(getAuth()),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setRows(d.rows || []);
      setCoverage(d.coverage || {});
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    load();
  }, [load]);

  const missing = (coverage.total ?? 0) - (coverage.with_number ?? 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Emergency contacts</h1>
          <p className={T_BODY + " mt-1 max-w-2xl"}>
            Who to call when a store has a fire, an injury or has to close. Each person
            enters their own number under <strong>My phone number</strong> — you cannot
            enter it for them, and that is deliberate: a number somebody else typed goes
            stale without anyone noticing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-36">
            <SelectDark
              value={city}
              onChange={setCity}
              options={[
                { value: "", label: "Everyone" },
                { value: "dubai", label: "Dubai" },
                { value: "manila", label: "Manila" },
              ]}
            />
          </div>
          <button onClick={load} disabled={loading} className={SMALL_BUTTON}>
            <RefreshCw className={`h-3.5 w-3.5 inline mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Reachable</div>
          <div className={KPI_VALUE + ((coverage.with_number ?? 0) ? " text-emerald-300" : "")}>
            {coverage.with_number ?? 0}
            <span className="text-base text-zinc-500"> / {coverage.total ?? 0}</span>
          </div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>No number yet</div>
          <div className={KPI_VALUE + (missing > 0 ? " text-red-300" : " text-emerald-300")}>
            {missing}
          </div>
        </div>
      </div>

      {missing > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          <PhoneOff className="mr-1.5 inline h-4 w-4" />
          {missing} {missing === 1 ? "person cannot" : "people cannot"} be reached by phone.
          Ask them to open <strong>My phone number</strong> and add it — it takes a few
          seconds and only they can do it.
        </div>
      )}

      <div className={GLASS_CARD + " overflow-hidden p-0"}>
        {loading ? (
          <div className="p-8 text-center text-zinc-500">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr>
                  <th className={TABLE_HEADER}>Name</th>
                  <th className={TABLE_HEADER}>Role</th>
                  <th className={TABLE_HEADER}>City</th>
                  <th className={TABLE_HEADER}>Number</th>
                  <th className={TABLE_HEADER}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.staff_name} className={TABLE_ROW}>
                    <td className="py-3 text-sm text-zinc-100">{r.staff_name}</td>
                    <td className="py-3 text-xs text-zinc-400">{r.role}</td>
                    <td className="py-3 text-xs uppercase text-zinc-500">{r.city || "—"}</td>
                    <td className="py-3">
                      {r.phone ? (
                        <a
                          href={`tel:${r.phone}`}
                          className="inline-flex items-center gap-1.5 text-sm tabular-nums text-violet-300 hover:text-violet-200"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {r.phone}
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-sm text-red-300">
                          <PhoneOff className="h-3.5 w-3.5" />
                          not on file
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {r.phone && (
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(r.phone);
                            setCopied(r.staff_name);
                            window.setTimeout(() => setCopied(""), 1500);
                          }}
                          className="text-zinc-500 hover:text-zinc-300"
                          title="Copy"
                        >
                          {copied === r.staff_name ? (
                            <span className="text-xs text-emerald-300">copied</span>
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={T_CAPTION + " leading-relaxed"}>
        The list comes from roles — HQ, Admin, HR Manager and the two management roles — so
        it follows people when their job changes, instead of being a list of names somebody
        has to remember to update.
      </div>
    </div>
  );
}
