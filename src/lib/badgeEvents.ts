/**
 * Badge event constants and dispatch helpers.
 * Dispatch these events from action pages so NavBar refreshes badges immediately
 * instead of waiting for the next polling interval.
 */

export const BADGE_EVENTS = {
  privateReports: "sushizen:private-reports:badge:refresh",
  adminIncidents: "sushizen:admin-incidents:badge:refresh",
  incidents:      "sushizen:incidents:badge:refresh",
  inbox:          "sushizen:inbox:badge:refresh",
  renewals:       "sushizen:renewals:badge:refresh",
  requests:       "sushizen:requests:badge:refresh",
  priceCheck:     "sushizen:price-check:badge:refresh",
  procurement:    "sushizen:procurement:badge:refresh",
} as const;

export type BadgeEventKey = keyof typeof BADGE_EVENTS;

/**
 * Dispatch a badge refresh event so NavBar immediately re-fetches that badge.
 * Call this from any page after an action that changes the badge count
 * (e.g., sending a reply, resolving an incident, marking items as read).
 */
export function dispatchBadgeRefresh(key: BadgeEventKey): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BADGE_EVENTS[key]));
}
