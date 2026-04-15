"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AIAnalyticsProTab from "@/components/admin/AIAnalyticsProTab";
import { canAccessAiAnalyticsProAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = window.setTimeout(() => resolve(fallback), ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        window.clearTimeout(timer);
        resolve(fallback);
      });
  });
}

export default function AiAnalyticsProPage() {
  const router = useRouter();
  const initialAuth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const localAuth = getAuth() || initialAuth;
      try {
        const refreshed = await withTimeout(refreshAuthFromApi(localAuth), 4000, localAuth);
        if (cancelled) return;

        const resolved = refreshed || getAuth() || localAuth || null;

        if (!resolved?.staffName) {
          setAllowed(false);
          setReady(true);
          router.replace(`/login?next=${encodeURIComponent("/admin/ai-analytics-pro")}`);
          return;
        }

        if (!resolved?.accessToken) {
          setAllowed(false);
          setReady(true);
          return;
        }

        const hasAccess = canAccessAiAnalyticsProAdmin(resolved);
        if (!hasAccess) {
          setAllowed(false);
          setReady(true);
          router.replace("/week");
          return;
        }

        setAllowed(true);
        setReady(true);
      } catch {
        if (cancelled) return;

        const fallback = getAuth() || initialAuth || null;
        const hasAccess = Boolean(fallback?.staffName && fallback?.accessToken && canAccessAiAnalyticsProAdmin(fallback));

        setAllowed(hasAccess);
        setReady(true);

        if (!fallback?.staffName) {
          router.replace(`/login?next=${encodeURIComponent("/admin/ai-analytics-pro")}`);
          return;
        }
        if (!hasAccess) {
          router.replace("/week");
        }
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [initialAuth, router]);

  if (!ready) {
    return <div className="p-4 text-sm text-neutral-400">Loading…</div>;
  }
  if (!allowed) {
    return null;
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-4 text-white">
      <AIAnalyticsProTab />
    </main>
  );
}
