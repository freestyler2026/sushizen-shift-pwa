"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { fmtNum } from "@/lib/formatters";
import {
  BADGE_ERROR,
  BADGE_SUCCESS,
  BADGE_WARNING,
  GLASS_CARD,
  INPUT_CLASS,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
} from "@/lib/ui-tokens";

type AttendanceLocation = {
  id: number;
  raw_location: string;
  normalized_location?: string | null;
  city?: string | null;
  canonical_branch_code?: string | null;
  notes?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  seen_count?: number | null;
};

const API_BASE = "";

function fmt(value?: string | null) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

export default function AttendanceLocationsPage() {
  const auth = getAuth();
  const [items, setItems] = useState<AttendanceLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [city, setCity] = useState("");
  const [unmappedOnly, setUnmappedOnly] = useState(false);
  const [approverName] = useState(auth?.staffName || "");
  const [pin] = useState(auth?.pin || "");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        if (!approverName.trim() || !pin.trim()) {
          throw new Error("Approver session missing. Please log in again.");
        }
        const qs = new URLSearchParams();
        qs.set("approver_name", approverName.trim());
        qs.set("pin", pin.trim());
        if (city) qs.set("city", city);
        if (unmappedOnly) qs.set("only_unmapped", "true");
        const res = await fetch(
          `${API_BASE}/api/admin/attendance/locations?${qs.toString()}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          throw new Error(`Failed to load locations: ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setItems(Array.isArray(data?.items) ? data.items : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load locations");
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [city, unmappedOnly, approverName, pin]);

  const filtered = useMemo(() => {
    return items.filter((item) =>
      unmappedOnly ? !item.canonical_branch_code : true,
    );
  }, [items, unmappedOnly]);

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Link href="/admin/attendance" className={SECONDARY_BUTTON}>
              ← Back to Attendance
            </Link>
            <Link href="/admin/attendance/import" className={SECONDARY_BUTTON}>
              Import
            </Link>
            <Link href="/admin/attendance/mapping" className={SECONDARY_BUTTON}>
              Mapping
            </Link>
          </div>

          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/20 to-purple-500/10">
              <MapPin className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-500">ATTENDANCE ADMIN</p>
              <h1 className={T_PAGE_TITLE}>Attendance Locations</h1>
              <p className={T_CAPTION}>Review raw location data automatically collected from Bayzat.</p>
            </div>
          </div>

          <section className={`${GLASS_CARD} mb-6 p-5`}>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm">
                <div className={`${T_LABEL} mb-1.5`}>City</div>
                <select value={city} onChange={(e) => setCity(e.target.value)} className={SELECT_CLASS}>
                  <option value="">All</option>
                  <option value="Dubai">Dubai</option>
                  <option value="Manila">Manila</option>
                </select>
              </label>

              <label className="flex items-end gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={unmappedOnly}
                  onChange={(e) => setUnmappedOnly(e.target.checked)}
                  className="h-4 w-4 accent-amber-500"
                />
                <span>Unmapped only</span>
              </label>

              <div className="flex items-end">
                <div className={INPUT_CLASS}>Total: {fmtNum(filtered.length)}</div>
              </div>
            </div>
          </section>

          {error ? <div className={`${BADGE_ERROR} mb-4 inline-flex`}>{error}</div> : null}

          <section className={`${GLASS_CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className={TABLE_HEADER}>Raw Location</th>
                    <th className={TABLE_HEADER}>City</th>
                    <th className={TABLE_HEADER}>Canonical Branch</th>
                    <th className={TABLE_HEADER}>Seen Count</th>
                    <th className={TABLE_HEADER}>First Seen</th>
                    <th className={TABLE_HEADER}>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className={`${TABLE_CELL} text-zinc-500`} colSpan={6}>
                        Loading...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td className={`${TABLE_CELL} text-zinc-500`} colSpan={6}>
                        No locations found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item) => (
                      <tr key={item.id} className={`${TABLE_ROW} align-top`}>
                        <td className={`${TABLE_CELL} font-medium`}>{item.raw_location}</td>
                        <td className={TABLE_CELL}>{item.city || "-"}</td>
                        <td className={TABLE_CELL}>
                          {item.canonical_branch_code ? (
                            <span className={BADGE_SUCCESS}>{item.canonical_branch_code}</span>
                          ) : (
                            <span className={BADGE_WARNING}>Unmapped</span>
                          )}
                        </td>
                        <td className={TABLE_CELL}>{fmtNum(item.seen_count ?? 0)}</td>
                        <td className={TABLE_CELL}>{fmt(item.first_seen_at)}</td>
                        <td className={TABLE_CELL}>{fmt(item.last_seen_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </motion.div>
      </div>
    </main>
  );
}
