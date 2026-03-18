"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

function fmt(value?: string | null) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

export default function AttendanceEmployeesPage() {
  const [items, setItems] = useState<EmployeeMatchItem[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [city, setCity] = useState("");
  const [unmatchedOnly, setUnmatchedOnly] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (city) qs.set("city", city);
      if (unmatchedOnly) qs.set("unmatched_only", "true");

      const [matchRes, staffRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/attendance/employee-matches?${qs.toString()}`, {
          cache: "no-store",
        }),
        fetch(`${API_BASE}/api/store/staff/list${city ? `?city=${encodeURIComponent(city)}` : ""}`, {
          cache: "no-store",
        }),
      ]);

      if (!matchRes.ok) throw new Error(`Failed to load employee matches: ${matchRes.status}`);
      if (!staffRes.ok) throw new Error(`Failed to load staff list: ${staffRes.status}`);

      const matchData = await matchRes.json();
      const staffData = await staffRes.json();

      const nextItems = Array.isArray(matchData?.items) ? matchData.items : [];
      const nextStaff = Array.isArray(staffData?.items) ? staffData.items : [];

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
  };

  useEffect(() => {
    load();
  }, [city, unmatchedOnly]);

  const filteredStaffOptions = useMemo(() => {
    return city ? staffOptions.filter((s) => !s.city || s.city === city) : staffOptions;
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
      const res = await fetch(`${API_BASE}/api/admin/attendance/employees/map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_unique_key: item.employee_unique_key,
          employee_name_raw: item.employee_name_raw,
          employee_id_raw: item.employee_id_raw || null,
          city: item.city || city || null,
          canonical_staff_name,
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
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/admin/attendance" className="rounded border px-3 py-2 text-sm hover:bg-gray-50">
          ← Back to Attendance
        </Link>
        <Link href="/admin/attendance/mapping" className="rounded border px-3 py-2 text-sm hover:bg-gray-50">
          Location Mapping
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Attendance Employee Matching</h1>
        <p className="mt-2 text-sm text-gray-600">
          Bayzat employee を staff master に紐付けます。
        </p>
      </div>

      <section className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm">
            <div className="mb-1 font-medium">City</div>
            <select value={city} onChange={(e) => setCity(e.target.value)} className="w-full rounded border px-3 py-2">
              <option value="">All</option>
              <option value="Dubai">Dubai</option>
              <option value="Manila">Manila</option>
            </select>
          </label>

          <label className="flex items-end gap-2 text-sm">
            <input
              type="checkbox"
              checked={unmatchedOnly}
              onChange={(e) => setUnmatchedOnly(e.target.checked)}
            />
            <span>Unmatched only</span>
          </label>

          <div className="flex items-end text-sm text-gray-600">Total: {items.length}</div>
        </div>
      </section>

      {error ? (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Suggested</th>
                <th className="px-4 py-3">Mapped Staff</th>
                <th className="px-4 py-3">Rows</th>
                <th className="px-4 py-3">Last Seen</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-4 py-4 text-gray-500" colSpan={7}>Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr><td className="px-4 py-4 text-gray-500" colSpan={7}>No employees found.</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.employee_unique_key} className="border-t align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.employee_name_raw}</div>
                      <div className="text-xs text-gray-500">
                        ID: {item.employee_id_raw || "-"}
                      </div>
                    </td>
                    <td className="px-4 py-3">{item.city || "-"}</td>
                    <td className="px-4 py-3">{item.suggested_staff_name || "-"}</td>
                    <td className="px-4 py-3">
                      <select
                        value={selectedStaff[item.employee_unique_key] || ""}
                        onChange={(e) =>
                          setSelectedStaff((prev) => ({
                            ...prev,
                            [item.employee_unique_key]: e.target.value,
                          }))
                        }
                        className="min-w-[240px] rounded border px-3 py-2"
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
                    <td className="px-4 py-3">{item.observed_row_count ?? 0}</td>
                    <td className="px-4 py-3">{fmt(item.last_seen_at)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => saveMatch(item)}
                        disabled={savingKey === item.employee_unique_key}
                        className="rounded bg-black px-3 py-2 text-white disabled:opacity-60"
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
    </main>
  );
}
