import Image from "next/image";
import Link from "next/link";
import AdminAttendanceLinks from "@/components/admin/AdminAttendanceLinks";

const LOGO_SRC = "/logo.png";

export default function SignUpPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-10">
        <div className="mx-auto w-full max-w-5xl rounded-3xl border border-neutral-800 bg-neutral-900/60 p-8 shadow-2xl">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-neutral-800 bg-black">
              <Image
                src={LOGO_SRC}
                alt="Sushi ZEN logo"
                width={80}
                height={80}
                className="h-full w-full object-contain"
              />
            </div>

            <h1 className="mt-5 text-3xl font-bold">Sushi ZEN Sign Up</h1>
            <p className="mt-2 text-sm text-neutral-400">
              For new staff onboarding and admin operations
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-5">
              <div className="text-lg font-semibold">Create Staff Record</div>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                For store managers. Register a new staff member and issue the first setup code.
              </p>
              <div className="mt-5">
                <Link
                  href="/admin/staff/create"
                  className="flex w-full items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200"
                >
                  Open Create Staff Record
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-5">
              <div className="text-lg font-semibold">Pending Staff Setup</div>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                For store managers. View pending setup staff and reissue setup codes.
              </p>
              <div className="mt-5">
                <Link
                  href="/admin/staff/setup"
                  className="flex w-full items-center justify-center rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
                >
                  Open Pending Staff Setup
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-5">
              <div className="text-lg font-semibold">Set Up PIN</div>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                For new staff. Complete first-time account setup and create your login PIN.
              </p>
              <div className="mt-5">
                <Link
                  href="/setup-pin"
                  className="flex w-full items-center justify-center rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
                >
                  Open Set Up PIN
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-5">
              <div className="text-lg font-semibold">Onboarding Dashboard</div>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                For HQ / ADMIN. Review created, pending, and completed onboarding in one place.
              </p>
              <div className="mt-5">
                <Link
                  href="/admin/staff/onboarding"
                  className="flex w-full items-center justify-center rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
                >
                  Open Onboarding Dashboard
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-5">
              <div className="text-lg font-semibold">Analytics</div>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                For HQ / ADMIN. Review historical staff hours, weekday averages, workload, and absences.
              </p>
              <div className="mt-5">
                <Link
                  href="/admin/analytics"
                  className="flex w-full items-center justify-center rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
                >
                  Open Analytics
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-5">
              <div className="text-lg font-semibold">Audit Logs</div>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                For HQ / ADMIN. Review staff onboarding events and role change history.
              </p>
              <div className="mt-5">
                <Link
                  href="/admin/staff/audit"
                  className="flex w-full items-center justify-center rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
                >
                  Open Audit Logs
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-900/40 bg-amber-950/10 p-5">
              <div className="text-lg font-semibold">Role Management</div>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                For HQ only. Change staff roles, including ADMIN assignment.
              </p>
              <div className="mt-5">
                <Link
                  href="/admin/staff/roles"
                  className="flex w-full items-center justify-center rounded-2xl border border-amber-700/50 bg-neutral-900 px-4 py-3 text-sm font-semibold text-amber-200 transition hover:bg-neutral-800"
                >
                  Open Role Management
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-neutral-800 pt-8">
            <AdminAttendanceLinks />
          </div>

          <div className="mt-8 flex flex-col items-center gap-3 text-sm text-neutral-400 sm:flex-row sm:justify-between">
            <Link href="/" className="hover:text-white">
              ← Back to Home
            </Link>

            <Link href="/login" className="hover:text-white">
              Already have an account? Log In
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
