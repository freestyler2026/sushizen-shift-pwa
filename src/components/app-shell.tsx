"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

const HIDE_NAV_PATHS = new Set(["/", "/login", "/signup", "/setup-pin"]);

export default function AppShell({ children }: Props) {
  const pathname = usePathname();
  const hideNav = HIDE_NAV_PATHS.has(pathname);

  if (hideNav) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="border-b border-neutral-800 bg-black">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/week"
              className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm font-semibold hover:bg-neutral-900"
            >
              Week
            </Link>

            <Link
              href="/calendar"
              className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm font-semibold hover:bg-neutral-900"
            >
              Calendar
            </Link>

            <Link
              href="/request"
              className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm font-semibold hover:bg-neutral-900"
            >
              Request
            </Link>

            <Link
              href="/swap-approve"
              className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm font-semibold hover:bg-neutral-900"
            >
              Swap Approve
            </Link>

            <Link
              href="/admin"
              className="rounded-2xl border border-amber-700 bg-amber-950/30 px-4 py-3 text-sm font-semibold text-amber-200 hover:bg-amber-950/50"
            >
              Admin Dashboard
            </Link>

            <Link
              href="/absences"
              className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm font-semibold hover:bg-neutral-900"
            >
              Absences
            </Link>

            <Link
              href="/staff"
              className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm font-semibold hover:bg-neutral-900"
            >
              Staff
            </Link>

            <Link
              href="/admin/draft"
              className="rounded-2xl border border-amber-700 bg-amber-950/30 px-4 py-3 text-sm font-semibold text-amber-200 hover:bg-amber-950/50"
            >
              Draft
            </Link>

            <Link
              href="/logout"
              className="ml-auto rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm font-semibold hover:bg-neutral-900"
            >
              Logout
            </Link>
          </div>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}