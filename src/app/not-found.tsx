"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function NotFound() {
  const router = useRouter();
  const [count, setCount] = useState(5);

  useEffect(() => {
    const iv = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          clearInterval(iv);
          router.replace("/admin");
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [router]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950/20 to-slate-950 flex items-center justify-center px-6">
      <div className="text-center space-y-4">
        <p className="text-6xl font-bold text-white/20">404</p>
        <p className="text-lg text-zinc-300">Page not found</p>
        <p className="text-sm text-zinc-500">
          Redirecting to Admin in {count}s…
        </p>
        <button
          onClick={() => router.replace("/admin")}
          className="mt-2 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 active:bg-violet-700 transition-colors"
        >
          Go to Admin now
        </button>
      </div>
    </main>
  );
}
