"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getAuth } from "@/lib/auth";

/**
 * Says which screen was opened.
 *
 * Everything else about a person's day is observed on the server: the session
 * guard records the API calls a page makes, without the page having to know.
 * But an endpoint is not a screen -- five of them fire when one page loads, and
 * a screen somebody opened, read and left without it fetching anything leaves
 * no trace at all. That gap is the whole reason this component exists, so it
 * reports the one fact the server cannot derive: the route.
 *
 * Deliberately silent. It never renders, never blocks navigation, and a failure
 * is dropped -- a page must not break because a measurement did.
 */
export default function ActivityBeacon() {
  const pathname = usePathname();
  // Prerendered HTML has no localStorage, so the signed-in check has to wait
  // for mount or it reads "signed out" for everybody (lesson 42).
  const mounted = useRef(false);
  const lastSent = useRef<string>("");

  useEffect(() => { mounted.current = true; }, []);

  useEffect(() => {
    if (!pathname) return;
    // Route changes can fire twice for one navigation; one row per screen.
    if (lastSent.current === pathname) return;
    const auth = getAuth();
    if (!auth?.staffName) return;
    lastSent.current = pathname;
    void fetch("/api/admin/activity/screen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ screen: pathname }),
      keepalive: true,
    }).catch(() => { /* measurement must never affect the page */ });
  }, [pathname]);

  return null;
}
