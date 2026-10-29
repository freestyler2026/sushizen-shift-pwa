// Which earnings boxes a final-settlement case shows, per city.
//
// The 13th month is PD 851 — Philippine law. The UAE has no equivalent, so the
// Dubai form carried a "Prorated 13th Month" box that printed 0.00 on every
// settlement and invited somebody to put a number in it. Owner's instruction,
// 2026-10-07: take it off the Dubai form.
//
// Kept here rather than inside the page so it can be checked without rendering
// the page, and because a named export from a page.tsx fails `next build`
// while passing tsc and lint.

export type EarningField = { k: string; label: string };

/**
 * `thirteenth` is the stored amount, not the value being typed: the row must
 * not appear and disappear under the cursor, and a case that already carries
 * an amount has to keep showing it — a figure inside the total belongs on the
 * screen, whatever the label policy says.
 */
export function earningFields(city: string, thirteenth: number | null | undefined): EarningField[] {
  const dubai = String(city || "").trim().toLowerCase() === "dubai";
  return [
    { k: "fp_basic_pay", label: "Basic Pay" },
    { k: "fp_prorated_13th", label: "Prorated 13th Month" },
    { k: "fp_leave_conversion", label: "Leave Conversion" },
    // Named for what Federal Decree-Law 33/2021 art. 51 calls it, so that
    // "put the gratuity in that box" is readable off the screen instead of
    // living only in a message to one person.
    { k: "fp_separation_pay", label: dubai ? "End of Service Gratuity" : "Separation Pay" },
    { k: "fp_allowance", label: "Allowance" },
  ].filter((f) => !(dubai && f.k === "fp_prorated_13th" && !thirteenth));
}

/** Dubai settlements have no 13th month to show the working for. */
export function showsThirteenthMonth(city: string): boolean {
  return String(city || "").trim().toLowerCase() !== "dubai";
}
