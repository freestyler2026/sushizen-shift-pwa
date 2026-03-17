import Link from "next/link";

const LOGO_SRC = "/logo.png";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-4 py-6 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-3xl rounded-[28px] border border-neutral-800 bg-neutral-950 p-5 shadow-2xl sm:p-8">
          <div className="flex flex-col items-center text-center">
            <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500 sm:text-sm">
              Welcome to
            </p>

            <div className="mt-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-[24px] bg-black sm:mt-5 sm:h-32 sm:w-32">
              <img
                src={LOGO_SRC}
                alt="Sushi ZEN logo"
                className="h-full w-full object-contain p-2"
              />
            </div>

            <h1 className="mt-5 text-3xl font-bold leading-tight tracking-wide text-white sm:text-4xl">
              Sushi ZEN
            </h1>

            <p className="mt-2 text-sm text-neutral-400 sm:text-base">
              Staff access and onboarding portal
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2">
            <Link
              href="/login"
              className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-white px-4 py-3 text-base font-semibold text-black transition hover:bg-neutral-200"
            >
              Log In
            </Link>

            <Link
              href="/signup"
              className="flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-base font-semibold text-white transition hover:bg-neutral-800"
            >
              Sign Up
            </Link>
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 sm:mt-8 sm:p-5">
            <div className="text-base font-semibold sm:text-lg">Getting Started</div>
            <p className="mt-3 text-sm leading-7 text-neutral-400">
              New staff should begin with <span className="text-white">Sign Up</span> for first-time
              onboarding. Existing staff can use <span className="text-white">Log In</span> to access
              the shift system.
            </p>
          </div>

          <div className="mt-5 text-center text-[11px] text-neutral-500 sm:mt-6 sm:text-xs">
            For authorized Sushi ZEN staff only
          </div>
        </div>
      </div>
    </main>
  );
}