export type PaymentCity = "manila" | "dubai" | "both";
export type PaymentCategory =
  | "government"
  | "rent"
  | "utilities"
  | "insurance"
  | "licensing"
  | "salary"
  | "vendor"
  | "other";
export type PaymentMethod = "bank_transfer" | "cash" | "cheque" | "auto_debit" | "card";
export type PaymentRecurrence = "monthly" | "quarterly" | "semi_annual" | "annual" | "";

export interface Payment {
  id: number;
  city: PaymentCity;
  branch: string;
  category: PaymentCategory;
  payee_name: string;
  description: string;
  amount: number | null;
  currency: string;
  payment_method: PaymentMethod;
  due_date: string; // ISO date
  alert_date: string | null;
  is_recurring: boolean;
  recurrence: PaymentRecurrence;
  is_paid: boolean;
  paid_date: string | null;
  paid_amount: number | null;
  paid_reference: string;
  notes: string;
  parent_id: number | null;
  created_at: string;
  updated_at: string;
}

export const CATEGORY_LABELS: Record<PaymentCategory, string> = {
  government: "Government",
  rent: "Rent",
  utilities: "Utilities",
  insurance: "Insurance",
  licensing: "Licensing / Permits",
  salary: "Salary / Payroll",
  vendor: "Vendor",
  other: "Other",
};

export const RECURRENCE_LABELS: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semi_annual: "Semi-Annual",
  annual: "Annual",
  "": "One-time",
};

export const CURRENCY_OPTIONS = ["AED", "PHP", "USD"];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  cheque: "Cheque",
  auto_debit: "Auto Debit",
  card: "Card",
};
