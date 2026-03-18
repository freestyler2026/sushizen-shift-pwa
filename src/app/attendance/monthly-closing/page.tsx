import Link from "next/link";
import AdminAttendanceLinks from "@/components/admin/AdminAttendanceLinks";

export default function AttendanceAdminPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-8 shadow-2xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
                Attendance Admin
              </p>
              <h1 className="mt-2 text-3xl font-bold">Bayzat Attendance Management</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">
                Upload Bayzat attendance files, review import history, manage raw
                location and employee mapping, compare scheduled vs actual
                attendance, and operate monthly review, payroll, and corrections.
              </p>
            </div>

            <Link
              href="/admin/analytics"
              className="inline-flex items-center justify-center rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              Open Main Analytics
            </Link>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/10 p-5">
              <div className="text-lg font-semibold text-emerald-200">Current Scope</div>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-300">
                <li>• Daily Bayzat attendance report upload</li>
                <li>• Duplicate detection by file hash</li>
                <li>• Raw location auto-registration and mapping</li>
                <li>• Employee matching to staff master</li>
                <li>• Scheduled vs actual comparison</li>
                <li>• Attendance analytics and monthly review</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-sky-900/40 bg-sky-950/10 p-5">
              <div className="text-lg font-semibold text-sky-200">Operational Flow</div>
              <ol className="mt-3 space-y-2 text-sm leading-6 text-neutral-300">
                <li>1. Import Bayzat file</li>
                <li>2. Review import history and duplicates</li>
                <li>3. Map new locations and employees</li>
                <li>4. Review comparison and analytics</li>
                <li>5. Apply corrections if needed</li>
                <li>6. Review monthly summary, close month, export payroll CSV</li>
              </ol>
            </div>
          </div>

          <div className="mt-8">
            <AdminAttendanceLinks />
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-between">
            <Link href="/signup" className="text-sm text-neutral-400 transition hover:text-white">
              ← Back to Sign Up Hub
            </Link>
            <Link href="/" className="text-sm text-neutral-400 transition hover:text-white">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
