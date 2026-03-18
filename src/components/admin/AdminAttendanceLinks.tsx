import Link from "next/link";

const LINKS = [
  { href: "/admin/attendance/import", label: "Attendance Import", description: "Bayzat Excel / CSV upload" },
  { href: "/admin/attendance/history", label: "Import History", description: "Past daily uploads and duplicate checks" },
  { href: "/admin/attendance/locations", label: "Locations", description: "Raw Bayzat locations collected automatically" },
  { href: "/admin/attendance/mapping", label: "Location Mapping", description: "Map raw locations to canonical branches" },
  { href: "/admin/attendance/employees", label: "Employee Matching", description: "Map Bayzat employees to staff master" },
  { href: "/admin/attendance/comparison", label: "Scheduled vs Actual", description: "Compare planned shifts against actual attendance" },
  { href: "/admin/attendance/analytics", label: "Attendance Analytics", description: "Late, overtime, no-show, branch quality" },
  { href: "/admin/attendance/monthly-summary", label: "Monthly Summary", description: "Monthly staff and branch attendance summary" },
  { href: "/admin/attendance/monthly-closing", label: "Monthly Closing", description: "Lock a month after review" },
  { href: "/admin/attendance/payroll", label: "Payroll Export", description: "Review and export payroll support CSV" },
  { href: "/admin/attendance/corrections", label: "Corrections", description: "Regularization and audit-friendly corrections" },
];

export default function AdminAttendanceLinks() {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Attendance Admin</h2>
        <p className="mt-1 text-sm text-gray-600">
          Bayzat import, mapping, comparison, analytics, payroll.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-2xl border bg-white p-4 transition hover:border-gray-400 hover:shadow-sm"
          >
            <div className="font-medium">{item.label}</div>
            <div className="mt-1 text-sm text-gray-600">{item.description}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
