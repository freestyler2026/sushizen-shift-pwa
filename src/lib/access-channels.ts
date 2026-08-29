// GENERATED — do not edit by hand.
// Source: sushizen_shift_app_clean/app/access_control.py (ACCESS_CHANNELS)
// Regenerate: python3 scripts/sync-access-channels.py
//
// Maps a route to the channel Role Management controls it with, so nav
// visibility and page guards can ask "does this person hold
// channel.<key>.view?" instead of matching against a hardcoded role list.

export interface ChannelRoute {
  channel: string;
  match: "exact" | "prefix";
  admin: boolean;
}

export const CHANNEL_ROUTES: ReadonlyArray<readonly [string, ChannelRoute]> = [
  ["/admin", { channel: "admin.dashboard", match: "exact", admin: true }],
  ["/admin/absences", { channel: "admin.absences", match: "exact", admin: true }],
  ["/admin/ai-analytics-pro", { channel: "admin.ai_analytics_pro", match: "exact", admin: true }],
  ["/admin/analytics", { channel: "admin.analytics", match: "exact", admin: true }],
  ["/admin/ar-payouts", { channel: "admin.ar_payouts", match: "prefix", admin: true }],
  ["/admin/assets", { channel: "admin.assets", match: "prefix", admin: true }],
  ["/admin/attendance", { channel: "admin.attendance", match: "prefix", admin: true }],
  ["/admin/backoffice-evaluation", { channel: "admin.backoffice_evaluation", match: "exact", admin: true }],
  ["/admin/backup", { channel: "admin.backup", match: "prefix", admin: true }],
  ["/admin/baseroll-prep", { channel: "admin.baseroll_prep", match: "prefix", admin: true }],
  ["/admin/bayzat-import", { channel: "admin.bayzat_import", match: "prefix", admin: true }],
  ["/admin/business-events", { channel: "admin.business_events", match: "prefix", admin: true }],
  ["/admin/cancellations", { channel: "admin.cancellations", match: "prefix", admin: true }],
  ["/admin/cash-management", { channel: "admin.cash_management", match: "prefix", admin: true }],
  ["/admin/ck-label-compliance", { channel: "admin.ck_label_compliance", match: "prefix", admin: true }],
  ["/admin/ck/par-levels", { channel: "admin.ck_par_levels", match: "prefix", admin: true }],
  ["/admin/coe", { channel: "admin.coe", match: "prefix", admin: true }],
  ["/admin/cold-chain", { channel: "admin.cold_chain", match: "prefix", admin: true }],
  ["/admin/cost-calculation", { channel: "admin.cost_calculation", match: "prefix", admin: true }],
  ["/admin/daily-check", { channel: "admin.daily_check", match: "prefix", admin: true }],
  ["/admin/daily-inventory", { channel: "admin.daily_inventory", match: "exact", admin: true }],
  ["/admin/daily-report", { channel: "admin.daily_report", match: "prefix", admin: true }],
  ["/admin/discord-alerts", { channel: "admin.discord_alerts", match: "prefix", admin: true }],
  ["/admin/discord-inbox", { channel: "admin.discord_inbox", match: "prefix", admin: true }],
  ["/admin/disposal", { channel: "admin.disposal", match: "prefix", admin: true }],
  ["/admin/draft", { channel: "admin.draft", match: "prefix", admin: true }],
  ["/admin/emergency-requests", { channel: "admin.emergency_requests", match: "prefix", admin: true }],
  ["/admin/employee-cases", { channel: "admin.employee_cases", match: "prefix", admin: true }],
  ["/admin/expense-requests", { channel: "admin.expense_requests", match: "prefix", admin: true }],
  ["/admin/finance", { channel: "admin.finance", match: "prefix", admin: true }],
  ["/admin/finance/documents", { channel: "admin.finance_documents", match: "prefix", admin: true }],
  ["/admin/finance/vendors", { channel: "admin.finance_vendors", match: "prefix", admin: true }],
  ["/admin/handbook", { channel: "admin.handbook", match: "prefix", admin: true }],
  ["/admin/hr/clearance", { channel: "admin.hr_clearance", match: "prefix", admin: true }],
  ["/admin/hr/onboarding", { channel: "admin.hr_onboarding", match: "prefix", admin: true }],
  ["/admin/hr/performance", { channel: "admin.hr_performance", match: "prefix", admin: true }],
  ["/admin/hr/policy-docs", { channel: "admin.hr_policy_docs", match: "prefix", admin: true }],
  ["/admin/hr/recruitment", { channel: "admin.hr_recruitment", match: "prefix", admin: true }],
  ["/admin/hr/separation", { channel: "admin.hr_separation", match: "prefix", admin: true }],
  ["/admin/incidents", { channel: "admin.incident_reports", match: "prefix", admin: true }],
  ["/admin/incidents/unowned", { channel: "admin.incidents_unowned", match: "exact", admin: true }],
  ["/admin/inventory", { channel: "admin.inventory", match: "prefix", admin: true }],
  ["/admin/management/area-review", { channel: "admin.management_area_review", match: "prefix", admin: true }],
  ["/admin/management/back-office", { channel: "admin.management_back_office", match: "prefix", admin: true }],
  ["/admin/management/par-levels", { channel: "admin.management_par_levels", match: "prefix", admin: true }],
  ["/admin/management/patterns", { channel: "admin.management_patterns", match: "prefix", admin: true }],
  ["/admin/management/people", { channel: "admin.management_people", match: "prefix", admin: true }],
  ["/admin/manual-shift", { channel: "admin.manual_shift", match: "prefix", admin: true }],
  ["/admin/market-analysis", { channel: "admin.market_analysis", match: "prefix", admin: true }],
  ["/admin/meal-allowance", { channel: "admin.meal_allowance", match: "prefix", admin: true }],
  ["/admin/menu", { channel: "admin.menu", match: "prefix", admin: true }],
  ["/admin/mgmt-accounting", { channel: "admin.mgmt_accounting", match: "prefix", admin: true }],
  ["/admin/nte", { channel: "admin.nte", match: "prefix", admin: true }],
  ["/admin/os-attendance", { channel: "admin.os_attendance", match: "prefix", admin: true }],
  ["/admin/overtime", { channel: "admin.overtime", match: "prefix", admin: true }],
  ["/admin/payments", { channel: "admin.payments", match: "prefix", admin: true }],
  ["/admin/payroll", { channel: "admin.payroll", match: "prefix", admin: true }],
  ["/admin/petty-cash", { channel: "admin.petty_cash", match: "prefix", admin: true }],
  ["/admin/price-check", { channel: "admin.price_check", match: "prefix", admin: true }],
  ["/admin/private-reports", { channel: "admin.private_reports", match: "exact", admin: true }],
  ["/admin/probation", { channel: "admin.probation", match: "prefix", admin: true }],
  ["/admin/procurement", { channel: "admin.procurement", match: "prefix", admin: true }],
  ["/admin/renewals", { channel: "admin.renewals", match: "prefix", admin: true }],
  ["/admin/security", { channel: "admin.security", match: "prefix", admin: true }],
  ["/admin/shift-audit", { channel: "admin.shift_audit", match: "prefix", admin: true }],
  ["/admin/spot-purchase", { channel: "admin.spot_purchase", match: "prefix", admin: true }],
  ["/admin/staff", { channel: "admin.staff", match: "prefix", admin: true }],
  ["/admin/staff-ranks", { channel: "admin.staff_ranks", match: "prefix", admin: true }],
  ["/admin/staff/contacts", { channel: "admin.emergency_contacts", match: "exact", admin: true }],
  ["/admin/store-evaluations", { channel: "admin.store_evaluations", match: "prefix", admin: true }],
  ["/admin/store-opening", { channel: "admin.store_opening", match: "prefix", admin: true }],
  ["/admin/store-par-levels", { channel: "admin.store_par_levels", match: "prefix", admin: true }],
  ["/admin/store-supplier-orders", { channel: "admin.store_supplier_orders", match: "prefix", admin: true }],
  ["/admin/supplier-confirmations", { channel: "admin.supplier_confirmations", match: "prefix", admin: true }],
  ["/admin/transport-expense", { channel: "admin.transport_expense", match: "prefix", admin: true }],
  ["/admin/travel-path", { channel: "admin.travel_path", match: "exact", admin: true }],
  ["/attendance", { channel: "attendance", match: "exact", admin: false }],
  ["/calendar", { channel: "calendar", match: "exact", admin: false }],
  ["/change-pin", { channel: "change_pin", match: "exact", admin: false }],
  ["/handbook", { channel: "handbook", match: "prefix", admin: false }],
  ["/inbox", { channel: "inbox", match: "exact", admin: false }],
  ["/incidents", { channel: "incident_report", match: "prefix", admin: false }],
  ["/my-assets", { channel: "my_assets", match: "prefix", admin: false }],
  ["/my-contact", { channel: "my_contact", match: "exact", admin: false }],
  ["/my-pay", { channel: "my_pay", match: "prefix", admin: false }],
  ["/my-shift", { channel: "my_shift", match: "exact", admin: false }],
  ["/private-report", { channel: "private_report", match: "exact", admin: false }],
  ["/request", { channel: "request", match: "exact", admin: false }],
  ["/staff-guide", { channel: "staff_guide", match: "prefix", admin: false }],
  ["/store/cash-report", { channel: "store_cash_report", match: "prefix", admin: false }],
  ["/store/cashier-log", { channel: "store_cashier_log", match: "prefix", admin: false }],
  ["/store/ck-delivery", { channel: "store_ck_delivery", match: "prefix", admin: false }],
  ["/store/ck-ingredient-receiving", { channel: "store_ck_ingredient_receiving", match: "prefix", admin: false }],
  ["/store/ck-inventory", { channel: "store_ck_inventory", match: "prefix", admin: false }],
  ["/store/ck-production", { channel: "store_ck_production", match: "prefix", admin: false }],
  ["/store/ck-production-plan", { channel: "store_ck_production_plan", match: "prefix", admin: false }],
  ["/store/cold-chain", { channel: "store_cold_chain", match: "prefix", admin: false }],
  ["/store/daily-check", { channel: "store_daily_check", match: "prefix", admin: false }],
  ["/store/emergency-request", { channel: "store_emergency_request", match: "prefix", admin: false }],
  ["/store/evaluation", { channel: "store_evaluation", match: "prefix", admin: false }],
  ["/store/expense-request", { channel: "store_expense_request", match: "prefix", admin: false }],
  ["/store/management/inbox", { channel: "store.management_inbox", match: "prefix", admin: false }],
  ["/store/management/rush-check", { channel: "store.management_rush_check", match: "prefix", admin: false }],
  ["/store/my-nte", { channel: "my_notices", match: "prefix", admin: false }],
  ["/store/overtime-request", { channel: "store_overtime_request", match: "prefix", admin: false }],
  ["/store/petty-cash", { channel: "store_petty_cash", match: "prefix", admin: false }],
  ["/store/policy-docs", { channel: "store_policy_docs", match: "prefix", admin: false }],
  ["/store/procurement", { channel: "store_procurement", match: "prefix", admin: false }],
  ["/store/purchase", { channel: "store_direct_purchase", match: "prefix", admin: false }],
  ["/store/receipt-log", { channel: "store_receipt_log", match: "prefix", admin: false }],
  ["/store/receiving", { channel: "store_ck_receiving", match: "prefix", admin: false }],
  ["/store/report", { channel: "store_report", match: "prefix", admin: false }],
  ["/store/spot-purchase", { channel: "store_spot_purchase", match: "prefix", admin: false }],
  ["/store/supplier-receiving", { channel: "store_supplier_receiving", match: "prefix", admin: false }],
  ["/store/transport-expense", { channel: "store_transport_expense", match: "prefix", admin: false }],
  ["/swap-approve", { channel: "swap_approve", match: "exact", admin: false }],
  ["/week", { channel: "week", match: "exact", admin: false }],
  ["/zen-music", { channel: "zen_music", match: "exact", admin: false }],
];

/** The channel governing a route, longest match first so /admin/hr/onboarding
 *  is not swallowed by a shorter /admin/hr prefix. */
export function channelForRoute(href: string): ChannelRoute | null {
  let best: ChannelRoute | null = null;
  let bestLen = -1;
  for (const [route, meta] of CHANNEL_ROUTES) {
    const hit = meta.match === "exact" ? href === route : href === route || href.startsWith(route + "/");
    if (hit && route.length > bestLen) {
      best = meta;
      bestLen = route.length;
    }
  }
  return best;
}
