import Link from "next/link";

const LINKS = [
  { id: "01-import", href: "/admin/attendance/import", label: "1) Import", description: "Bayzat Excel / CSV upload and Drive sync" },
  { id: "02-history", href: "/admin/attendance/history", label: "2) History", description: "Import results, duplicates, notes, target date, CSV" },
  { id: "03-locations", href: "/admin/attendance/locations", label: "3) Locations", description: "Collect and review raw Bayzat locations" },
  { id: "04-mapping", href: "/admin/attendance/mapping", label: "4) Location Mapping", description: "Map raw locations to canonical branches" },
  { id: "05-employees", href: "/admin/attendance/employees", label: "5) Employee Matching", description: "Map Bayzat employees to staff master" },
  { id: "06-verify", href: "/admin/analytics", label: "6) Verify (Analytics)", description: "Scheduled vs actual, late, no-show, missing IN/OUT" },
  { id: "07-monthly-summary", href: "/admin/analytics", label: "7) Monthly Summary", description: "Monthly staff and branch attendance summary" },
  { id: "08-monthly-closing", href: "/admin/attendance/monthly-closing", label: "8) Monthly Closing", description: "Lock a month after review" },
  { id: "09-payroll", href: "/admin/analytics", label: "9) Payroll Export", description: "Review and export payroll support CSV" },
  { id: "10-corrections", href: "/admin/corrections", label: "10) Corrections", description: "Regularization and audit-friendly corrections" },
];

export default function AdminAttendanceLinks() {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-white">Attendance Admin</h2>
        <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-300">
          Import / Normalize / Verify / Monthly Ops
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Link
          href="/admin/attendance/import"
          className="rounded-2xl border border-sky-800/60 bg-sky-950/20 p-4 transition hover:border-sky-500/70 hover:bg-sky-950/30"
        >
          <div className="text-sm font-semibold text-sky-200">Open Step 1: Import</div>
          <div className="mt-1 text-sm text-neutral-300">
            Daily Bayzat file upload / Drive sync
          </div>
        </Link>
        <Link
          href="/admin/attendance/history"
          className="rounded-2xl border border-emerald-800/60 bg-emerald-950/20 p-4 transition hover:border-emerald-500/70 hover:bg-emerald-950/30"
        >
          <div className="text-sm font-semibold text-emerald-200">Open Step 2: History</div>
          <div className="mt-1 text-sm text-neutral-300">
            Import logs, duplicates, notes, target date, CSV export
          </div>
        </Link>
        <Link
          href="/admin/analytics"
          className="rounded-2xl border border-amber-800/60 bg-amber-950/20 p-4 transition hover:border-amber-500/70 hover:bg-amber-950/30"
        >
          <div className="text-sm font-semibold text-amber-200">Open Step 6: Verify</div>
          <div className="mt-1 text-sm text-neutral-300">
            Scheduled vs actual verification and attendance KPIs
          </div>
        </Link>
      </div>
      <div>
        <p className="mt-1 text-sm text-neutral-400">
          Bayzat import, mapping, analytics, closing and payroll support.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {LINKS.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 transition hover:border-neutral-600 hover:bg-neutral-900"
          >
            <div className="font-medium text-white">{item.label}</div>
            <div className="mt-1 text-sm text-neutral-400">{item.description}</div>
            <div className="mt-2 text-[11px] text-neutral-500">{item.href}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
