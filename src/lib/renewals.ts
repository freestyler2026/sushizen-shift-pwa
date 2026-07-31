export const DOC_TYPES = [
  "VISA",
  "EID",
  "PASSPORT",
  "LABOUR_CONTRACT",
  "INSURANCE",
  "OHC",
  "BFHC",
  "PIC",
  "LABOUR_CARD",
] as const;

export type DocType = typeof DOC_TYPES[number];

export const DOC_LABELS: Record<DocType, string> = {
  VISA: "Residency Visa",
  EID: "Emirates ID",
  PASSPORT: "Passport",
  LABOUR_CONTRACT: "Labour Contract",
  INSURANCE: "Health Insurance",
  OHC: "OHC Certificate",
  BFHC: "BFHC Certificate",
  PIC: "PIC Certificate",
  LABOUR_CARD: "Labour Card",
};

export const ALERT_DAYS: Record<DocType, number> = {
  VISA: 42,
  EID: 28,
  PASSPORT: 28,
  LABOUR_CONTRACT: 28,
  INSURANCE: 28,
  OHC: 28,
  BFHC: 28,
  PIC: 28,
  LABOUR_CARD: 28,
};

export const BRANCHES = ["Al Barsha", "JLT", "Arjan", "CK", "B Bay", "Al Hudaiba"] as const;

export type RenewalStatus = "PENDING" | "IN_PROGRESS" | "RENEWED" | "N/A";

export type RenewalDocument = {
  id: number;
  doc_type: DocType;
  issued_date: string | null;
  expiry_date: string | null;
  renewal_status: RenewalStatus;
  doc_reference: string;
  notes: string;
  last_renewed_at: string | null;
  alert_level: "EXPIRED" | "CRITICAL" | "WARNING" | null;
  days_until_expiry: number | null;
};

export type RenewalStaff = {
  id: number;
  emp_id: string;
  full_name: string;
  position: string;
  branch: string;
  nationality: string;
  active_status: string;
  phone_no: string;
  documents: RenewalDocument[];
  alert_count: number;
};

export type RenewalAlertItem = {
  document_id: number;
  staff_id: number;
  emp_id: string;
  full_name: string;
  position: string;
  branch: string;
  active_status: string;
  doc_type: DocType;
  issued_date: string | null;
  expiry_date: string;
  renewal_status: RenewalStatus;
  doc_reference: string;
  notes: string;
  last_renewed_at: string | null;
  alert_level: "EXPIRED" | "CRITICAL" | "WARNING";
  days_until_expiry: number;
};

export const RENEWALS_BADGE_STORAGE_KEY = "sushizen_renewals_badge_count";
export const RENEWALS_BADGE_EVENT = "renewals:badge";

export function readRenewalsBadgeCount(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(RENEWALS_BADGE_STORAGE_KEY);
  const count = Number(raw ?? 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

export function setRenewalsBadgeCount(count: number) {
  if (typeof window === "undefined") return;
  const next = Math.max(0, Number(count) || 0);
  window.localStorage.setItem(RENEWALS_BADGE_STORAGE_KEY, String(next));
  window.dispatchEvent(new CustomEvent(RENEWALS_BADGE_EVENT, { detail: { badgeCount: next } }));
}

export const RENEWALS_DISMISSED_STORAGE_KEY = "sushizen_renewals_badge_dismissed_count";

export function getRenewalsDismissedCount(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(RENEWALS_DISMISSED_STORAGE_KEY);
  const n = Number(raw ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function dismissRenewalsBadge(serverCount: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RENEWALS_DISMISSED_STORAGE_KEY, String(Math.max(0, serverCount)));
  setRenewalsBadgeCount(0);
}

export type CustomAlertCategory = "Tenant Contract" | "License" | "Equipment" | "Other";
export type CustomAlertStatus = "PENDING" | "IN_PROGRESS" | "DONE";

export type CustomAlert = {
  id: number;
  category: CustomAlertCategory | string;
  title: string;
  branch: string;
  expiry_date: string;
  scheduled_renewal_date: string | null;
  notes: string;
  status: CustomAlertStatus;
  created_by: string;
  created_at: string | null;
  days_until_expiry: number | null;
  alert_level: "EXPIRED" | "CRITICAL" | "WARNING" | null;
};
