// A punch that never reached the server (owner, 2026-11-03).
//
// The browsers word it differently -- "Failed to fetch" (Chrome), "Load failed" (Safari),
// "NetworkError when attempting to fetch resource" (Firefox) -- and none of them says
// anything about the punch. Peter Villafuerte pressed Break Out at 13:39 on 3 Nov 2026,
// the request never left the phone, and he read the red "Failed to fetch" as done.
export function isNetworkFailure(e: unknown, msg: string): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const m = (msg || "").toLowerCase();
  return (e instanceof TypeError && (m.includes("fetch") || m.includes("load failed") || m.includes("network")))
    || m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed")
    || m.includes("network request failed");
}

export const ACTION_NOUN: Record<string, string> = {
  checkin: "clock-in", checkout: "clock-out", break_in: "break start", break_out: "break end",
  visit_start: "visit start", visit_end: "visit end",
};
