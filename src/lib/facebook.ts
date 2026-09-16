/**
 * Turning what an applicant typed into a link that opens something.
 *
 * The apply form asks for "a link or the name on your profile", and people
 * answer both ways. The admin panel put the raw value straight into an href,
 * so anything that was not a full URL resolved against our own domain: a name
 * like "Jonas Membrillos" became /admin/hr/Jonas%20Membrillos and 404'd.
 *
 * Measured 2026-09-16 over the 120 applicants who filled the field in:
 *
 *     full URL                 33   worked
 *     a name, not a link       54   broken
 *     handle only              21   broken
 *     facebook.com/… no scheme 12   broken
 *
 * 87 of 120 never opened. Three quarters of the field, for as long as it has
 * existed.
 *
 * A display name cannot be turned into a profile URL — Facebook does not
 * expose that mapping, and guessing one produces a 404, which is the dead end
 * we are fixing. So a name becomes a **search**, which is what a person does
 * by hand anyway, and the screen says that is what it is.
 */

export type FacebookLink = {
  /** Where the anchor goes. Always absolute, always opens something. */
  href: string;
  /** What the applicant typed, shown as the link text. */
  label: string;
  /** True when we are searching rather than opening a profile. */
  isSearch: boolean;
};

/** `facebook.com/x`, `www.facebook.com/x`, `m.facebook.com/x`, any case. */
const BARE_HOST = /^(?:https?:\/\/)?(?:www\.|m\.|web\.)?(?:facebook|fb)\.com\/(.+)$/i;

/** A vanity handle: what Facebook itself allows after the slash. */
const HANDLE = /^@?[A-Za-z0-9.]{5,50}$/;

/** Words that look like a handle but identify nobody. */
const NOT_A_HANDLE = new Set(["facebook", "fb", "none", "n/a", "na", "wala"]);

export function facebookLink(raw: string | null | undefined): FacebookLink | null {
  const v = (raw || "").trim();
  if (!v || v === "-" || v === "—") return null;

  const search = (): FacebookLink => ({
    href: `https://www.facebook.com/search/top?q=${encodeURIComponent(v)}`,
    label: v,
    isSearch: true,
  });

  // Already a link somewhere. Keep whatever they pasted, including a query
  // string — profile URLs carry ids there (…/profile.php?id=100011…).
  if (/^https?:\/\//i.test(v)) {
    return { href: v, label: v, isSearch: false };
  }

  // facebook.com/… with the scheme missing. This is the case that reads as a
  // working link on screen and silently is not.
  const bare = v.match(BARE_HOST);
  if (bare) {
    const path = bare[1].trim();
    // "Facebook.com/jeorgina cainan" — a space in a path is not a path.
    if (/\s/.test(path)) return search();
    return { href: `https://www.facebook.com/${path}`, label: v, isSearch: false };
  }

  // A bare handle. Only when it is one: an email, a nickname with a space, or
  // a word like "facebook" would give a URL that 404s, and a dead profile link
  // is no better than the dead link this replaces.
  // Strip a leading @ first: an email must not be treated as a handle, but
  // "@nickimperial.mariano" is how people write one and it is not an email.
  const handle = v.replace(/^@/, "");
  if (!handle.includes("@") && HANDLE.test(v) && !NOT_A_HANDLE.has(handle.toLowerCase())) {
    return { href: `https://www.facebook.com/${handle}`, label: v, isSearch: false };
  }

  return search();
}
