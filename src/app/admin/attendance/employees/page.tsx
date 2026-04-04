"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { fmtNum } from "@/lib/formatters";
import {
  BADGE_ERROR,
  BADGE_SUCCESS,
  GLASS_CARD,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  SMALL_BUTTON,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
} from "@/lib/ui-tokens";

type EmployeeMatchItem = {
  employee_unique_key: string;
  employee_name_raw: string;
  employee_id_raw?: string | null;
  city?: string | null;
  suggested_staff_name?: string | null;
  mapped_staff_name?: string | null;
  observed_row_count?: number | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
};

type StaffOption = {
  staff_name: string;
  city?: string | null;
  branch_code?: string | null;
  role_code?: string | null;
};

const API_BASE = "";

function fmt(value?: string | null) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

export default function AttendanceEmployeesPage() {
  const auth = getAuth();
  const [items, setItems] = useState<EmployeeMatchItem[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [city, setCity] = useState("");
  const [unmatchedOnly, setUnmatchedOnly] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<Record<string, string>>({});
  const [approverName] = useState(auth?.staffName || "");
  const [pin] = useState(auth?.pin || "");

  const load = useCallback(async () => {
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

      const matchRes = await fetch(`${API_BASE}/api/admin/attendance/employee-matches?${qs.toString()}`, {
        cache: "no-store",
      });
      if (!matchRes.ok) throw new Error(`Failed to load employee matches: ${matchRes.status}`);
      const matchData = await matchRes.json();

      const cityTargets = city ? [city.toLowerCase()] : ["dubai", "manila"];
      const staffResults = await Promise.all(
        cityTargets.map(async (targetCity) => {
          const staffQs = new URLSearchParams({
            city: targetCity,
            status: "ACTIVE",
            limit: "5000",
          });
          const staffRes = await fetch(`${API_BASE}/api/admin/staff_master/names?${staffQs.toString()}`, {
            cache: "no-store",
          });
          if (!staffRes.ok) return { city: targetCity, names: [] as string[] };
          const staffData = await staffRes.json();
          return {
            city: targetCity,
            names: Array.isArray(staffData?.names) ? staffData.names : ([] as string[]),
          };
        }),
      );

      const allItems = Array.isArray(matchData?.items) ? matchData.items : [];
      const nextItems = unmatchedOnly
        ? allItems.filter((item: EmployeeMatchItem) => !(item.mapped_staff_name || "").trim())
        : allItems;
      const nextStaff: StaffOption[] = [];
      const seen = new Set<string>();
      for (const result of staffResults) {
        for (const name of result.names) {
          const staffName = String(name || "").trim();
          if (!staffName) continue;
          const key = `${staffName.toLowerCase()}__${result.city}`;
          if (seen.has(key)) continue;
          seen.add(key);
          nextStaff.push({
            staff_name: staffName,
            city: result.city,
          });
        }
      }

      setItems(nextItems);
      setStaffOptions(nextStaff);

      const nextSelected: Record<string, string> = {};
      for (const item of nextItems) {
        nextSelected[item.employee_unique_key] =
          item.mapped_staff_name || item.suggested_staff_name || "";
      }
      setSelectedStaff(nextSelected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employee matches");
      setItems([]);
      setStaffOptions([]);
    } finally {
      setLoading(false);
    }
  }, [approverName, pin, city, unmatchedOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredStaffOptions = useMemo(() => {
    return city
      ? staffOptions.filter((s) => !s.city || s.city.toLowerCase() === city.toLowerCase())
      : staffOptions;
  }, [staffOptions, city]);

  async function saveMatch(item: EmployeeMatchItem) {
    const canonical_staff_name = (selectedStaff[item.employee_unique_key] || "").trim();
    if (!canonical_staff_name) {
      setError("Canonical staff name is required.");
      return;
    }
    setSavingKey(item.employee_unique_key);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/attendance/employee-matches/upsert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_name_raw: item.employee_name_raw,
          city: (item.city || city || "").toLowerCase(),
          canonical_staff_name,
          approver_name: approverName.trim(),
          pin: pin.trim(),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to save employee mapping: ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save employee mapping");
    } finally {
      setSavingKey(null);
    }
  }

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
            <Link href="/admin/attendance/mapping" className={SECONDARY_BUTTON}>
              Location Mapping
            </Link>
          </div>

          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/20 to-indigo-500/10">
              <Users className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-400">ATTENDANCE ADMIN</p>
              <h1 className={T_PAGE_TITLE}>Attendance Employee Matching</h1>
              <p className={T_CAPTION}>Link Bayzat employees with the Staff Master.</p>
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
                  checked={unmatchedOnly}
                  onChange={(e) => setUnmatchedOnly(e.target.checked)}
                  className="h-4 w-4 accent-amber-500"
                />
                <span>Unmatched only</span>
              </label>

              <div className="flex items-end text-sm text-zinc-400">Total: {fmtNum(items.length)}</div>
            </div>
          </section>

          {error ? <div className={`${BADGE_ERROR} mb-4 inline-flex`}>{error}</div> : null}

          <section className={`${GLASS_CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className={TABLE_HEADER}>Employee</th>
                    <th className={TABLE_HEADER}>City</th>
                    <th className={TABLE_HEADER}>Suggested</th>
                    <th className={TABLE_HEADER}>Mapped Staff</th>
                    <th className={TABLE_HEADER}>Rows</th>
                    <th className={TABLE_HEADER}>Last Seen</th>
                    <th className={TABLE_HEADER}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td className={`${TABLE_CELL} text-zinc-500`} colSpan={7}>Loading...</td></tr>
                  ) : items.length === 0 ? (
                    <tr><td className={`${TABLE_CELL} text-zinc-500`} colSpan={7}>No employees found.</td></tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.employee_unique_key} className={`${TABLE_ROW} align-top`}>
                        <td className={TABLE_CELL}>
                          <div className="font-medium">{item.employee_name_raw}</div>
                          <div className="text-xs text-zinc-500">
                            ID: {item.employee_id_raw || "-"}
                          </div>
                        </td>
                        <td className={TABLE_CELL}>{item.city || "-"}</td>
                        <td className={TABLE_CELL}>
                          {item.suggested_staff_name ? (
                            <span className={BADGE_SUCCESS}>{item.suggested_staff_name}</span>
                          ) : (
                            <span className={BADGE_ERROR}>Unmatched</span>
                          )}
                        </td>
                        <td className={TABLE_CELL}>
                          <div className="mb-2">
                            <span className={item.mapped_staff_name ? BADGE_SUCCESS : BADGE_ERROR}>
                              {item.mapped_staff_name ? "Matched" : "Unmatched"}
                            </span>
                          </div>
                          <select
                            value={selectedStaff[item.employee_unique_key] || ""}
                            onChange={(e) =>
                              setSelectedStaff((prev) => ({
                                ...prev,
                                [item.employee_unique_key]: e.target.value,
                              }))
                            }
                            className={`${SELECT_CLASS} min-w-[240px]`}
                          >
                            <option value="">Select staff</option>
                            {filteredStaffOptions.map((staff) => (
                              <option key={`${staff.staff_name}-${staff.city || ""}`} value={staff.staff_name}>
                                {staff.staff_name}
                                {staff.branch_code ? ` (${staff.branch_code})` : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={TABLE_CELL}>{fmtNum(item.observed_row_count ?? 0)}</td>
                        <td className={TABLE_CELL}>{fmt(item.last_seen_at)}</td>
                        <td className={TABLE_CELL}>
                          <button
                            onClick={() => saveMatch(item)}
                            disabled={savingKey === item.employee_unique_key}
                            className={`${SMALL_BUTTON} flex items-center gap-2 disabled:opacity-60`}
                          >
                            {savingKey === item.employee_unique_key ? "Saving..." : "Save"}
                          </button>
                        </td>
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
