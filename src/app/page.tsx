import Image from "next/image";
import Link from "next/link";

const LOGO_SRC = "/logo.png";

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020617] px-4 py-8 text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-violet-900/20 blur-[120px]" />
        <div className="absolute left-1/4 top-1/3 h-[300px] w-[300px] rounded-full bg-indigo-900/15 blur-[80px]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-md">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl shadow-black/50 backdrop-blur-2xl sm:p-12">
          <div className="flex flex-col items-center text-center">
            <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">
              Welcome to
            </p>

            <div className="mt-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-black ring-1 ring-white/10 shadow-[0_0_40px_rgba(139,92,246,0.25)] sm:h-24 sm:w-24">
              <Image
                src={LOGO_SRC}
                alt="Sushi ZEN logo"
                width={128}
                height={128}
                className="h-full w-full object-contain p-2.5"
              />
            </div>

            <h1 className="mt-6 bg-gradient-to-b from-white via-white to-neutral-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
              Sushi ZEN
            </h1>

            <p className="mt-2 text-sm tracking-wide text-neutral-500">
              Staff access and onboarding portal
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:grid sm:grid-cols-2">
            <Link
              href="/login"
              className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-base font-semibold text-white shadow-lg shadow-violet-900/30 transition-all duration-200 hover:scale-[1.02] hover:from-violet-500 hover:to-indigo-500 hover:shadow-violet-700/40"
            >
              Log In
            </Link>

            <Link
              href="/signup"
              className="flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-white/15 bg-transparent px-4 py-3 text-base font-semibold text-neutral-300 transition-all duration-200 hover:scale-[1.02] hover:border-white/25 hover:bg-white/5"
            >
              Sign Up
            </Link>
          </div>

          <div className="mt-4">
            <Link
              href="/admin/staff/create"
              className="flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-neutral-300 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
            >
              Create Staff Record
            </Link>
          </div>

          <div className="mt-8 border-t border-white/8 pt-8">
            <div className="mb-3 text-xs uppercase tracking-[0.15em] text-neutral-500">
              Getting Started
            </div>
            <p className="text-sm leading-relaxed text-neutral-500">
              Store managers should create new staff records first. After record creation,
              new staff can continue to <span className="font-medium text-neutral-300">Sign Up</span>.
              Existing staff can use <span className="font-medium text-neutral-300">Log In</span> to
              access the shift system.
            </p>
          </div>

          <div className="mt-8 text-center text-[10px] uppercase tracking-widest text-neutral-600">
            For authorized Sushi ZEN staff only
          </div>
        </div>
      </div>
    </main>
  );
}