/** Clearance items: what a leaver hands back and what HR does with them, and
 *  who may sign each one where (owner, 2026-11-22). The rules live on the
 *  server (app/db_clearance.py); these are the shapes the screens read. */

export type ClearanceItem = {
  id: string;
  case_id: string;
  item_key: "UNIFORM" | "KNIFE" | "KEYS" | "DEVICE" | "EXIT_INTERVIEW" | "DOCUMENTS" | "EMPLOYEE_SIGN" | string;
  label: string;
  where: "kitchen" | "office";
  kind: "return" | "task" | "sign";
  status: "pending" | "done" | string;
  qty_issued: number | null;
  qty_returned: number | null;
  unit_value?: number | null;
  unreturned: number;
  deductible?: boolean;
  deduction?: number | null;
  deduction_note?: string;
  currency?: string;
  details?: Record<string, unknown>;
  notes: string;
  signed_by: string;
  signed_as: string;
  signed_at: string | null;
  sign_place: string;
  signed_name?: string;
  has_signature?: boolean;
};

export type ClearanceApproval = {
  flow: string[];
  next_step: string | null;
  next_label: string | null;
  next_names: string[];
  my_steps: string[];
};

export type ClearanceItemsResponse = {
  items: ClearanceItem[];
  missing: string[];
  complete: boolean;
  consent: { signed_at: string | null; witnessed_by: string; version: string } | null;
  property_deduction: number | null;
  currency: string;
  exit_reasons: string[];
  office_location_checked: boolean;
  approval?: ClearanceApproval;
};

export type KitchenCase = {
  id: string;
  employee_name: string;
  department: string;
  position: string;
  last_working_day: string | null;
  pending: number;
  items: ClearanceItem[];
};

/** The device's position, for the server to check against the kitchen / office
 *  geofences. Rejects with a message a person can act on. */
export function getPosition(timeoutMs = 12000): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("This device cannot share its location. Use a phone with location on."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) =>
        reject(
          new Error(
            e.code === 1
              ? "Location is blocked for this site. Allow location in the browser settings and try again."
              : "Could not get your location. Try again near a window or with Wi-Fi on.",
          ),
        ),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    );
  });
}

export const STEP_NAMES: Record<string, string> = { hr: "HR", payroll: "Payroll", hq: "HQ", release: "Release" };
