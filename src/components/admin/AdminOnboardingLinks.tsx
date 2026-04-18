// src/components/admin/AdminOnboardingLinks.tsx
import Link from "next/link";

type Props = {
  compact?: boolean;
};

export default function AdminOnboardingLinks({ compact = false }: Props) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
      <div className="text-sm font-semibold">Quick Links</div>
      <div className="mt-1 text-xs text-neutral-500">
        Move between onboarding, setup, audit, and analytics tools.
      </div>

      <div
        className={[
          "mt-4 grid grid-cols-1 gap-3",
          compact ? "sm:grid-cols-2 lg:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-6",
        ].join(" ")}
      >
        <Link
          href="/admin/staff/create"
          className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 transition hover:bg-neutral-900"
        >
          <div className="text-sm font-semibold">Create Staff Record</div>
          <div className="mt-1 text-xs text-neutral-400">
            Register a new staff member and issue setup code.
          </div>
        </Link>

        <Link
          href="/admin/staff/onboarding"
          className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 transition hover:bg-neutral-900"
        >
          <div className="text-sm font-semibold">Pending Staff Setup</div>
          <div className="mt-1 text-xs text-neutral-400">
            View pending setup staff and reissue codes.
          </div>
        </Link>

        <Link
          href="/setup-pin"
          className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 transition hover:bg-neutral-900"
        >
          <div className="text-sm font-semibold">Set Up PIN</div>
          <div className="mt-1 text-xs text-neutral-400">
            Open the first-time PIN setup page.
          </div>
        </Link>

        <Link
          href="/admin/staff/onboarding"
          className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 transition hover:bg-neutral-900"
        >
          <div className="text-sm font-semibold">Onboarding Dashboard</div>
          <div className="mt-1 text-xs text-neutral-400">
            Review created, pending, and completed onboarding.
          </div>
        </Link>

        <Link
          href="/admin/analytics"
          className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 transition hover:bg-neutral-900"
        >
          <div className="text-sm font-semibold">Analytics</div>
          <div className="mt-1 text-xs text-neutral-400">
            Review historical hours, weekday averages, workload, and absences.
          </div>
        </Link>

        {!compact ? (
          <Link
            href="/admin/staff/audit"
            className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 transition hover:bg-neutral-900"
          >
            <div className="text-sm font-semibold">Audit Logs</div>
            <div className="mt-1 text-xs text-neutral-400">
              Review setup, reissue, and role change history.
            </div>
          </Link>
        ) : null}
      </div>
    </div>
  );
}