# API MAP — Sushi ZEN Workforce OS

## API Architecture

### Proxy Route
All `/api/admin/*` browser calls go through:
`src/app/api/admin/[...slug]/route.ts`

This catch-all forwards to Heroku backend:
- **Production**: `https://sushizen-shift-app-038d846023bc.herokuapp.com`
- **Development**: `http://127.0.0.1:8000`

### Auth Headers
Every authenticated request must include:
```
Authorization: Bearer {accessToken}
X-Step-Up-Token: {stepUpToken}   (when step-up required)
X-WebAuthn-Origin: {origin}      (for WebAuthn)
Content-Type: application/json
```

### Auth Mechanisms
1. **Bearer token**: Used for most read/list endpoints
2. **PIN-based**: Many write endpoints accept `approver_name + pin` in request body for action authorization
3. **Step-up token**: Sensitive operations require `X-Step-Up-Token` header

---

## Auth Endpoints

### POST `/api/auth/verify`
Login. Returns access token.
- Body: `{ staff_name, pin, city, include_mfa? }`
- Response: `{ access_token, staff_name, city, role, permissions[], city_lock, mfa? }`

### GET `/api/auth/session`
Validate current token and get session info.
- Headers: `Authorization: Bearer {token}`
- Query: `include_mfa=1` (optional)
- Response: `{ staff_name, city, role, permissions[], city_lock, step_up?, mfa? }`

### POST `/api/auth/refresh`
Refresh an expiring access token.
- Headers: `Authorization: Bearer {token}`
- Response: `{ access_token }`

### POST `/api/auth/step-up/pin`
Perform PIN step-up for sensitive actions.
- Body: `{ staff_name, pin, city }`
- Response: `{ step_up_token, level, verified_at }`

### POST `/api/auth/webauthn/register/options`
Get WebAuthn registration options.
- Headers: `Authorization: Bearer {token}`, `X-WebAuthn-Origin`
- Response: WebAuthn PublicKeyCredentialCreationOptions

### POST `/api/auth/webauthn/register/verify`
Complete WebAuthn registration.
- Headers: `Authorization: Bearer {token}`, `X-WebAuthn-Origin`
- Body: WebAuthn registration response JSON

### POST `/api/auth/webauthn/auth/options`
Get WebAuthn authentication options.
- Body: `{ staff_name, city }`
- Response: WebAuthn PublicKeyCredentialRequestOptions

### POST `/api/auth/webauthn/auth/verify`
Complete WebAuthn authentication (login or step-up).
- Body: WebAuthn assertion response JSON

### POST `/api/auth/setup_pin`
Initial PIN setup for new staff.
- Body: `{ staff_name, city, setup_code, pin }`

### POST `/api/auth/change_pin`
Change PIN.
- Body: `{ staff_name, city, old_pin, new_pin }`

---

## Shift Endpoints

### GET `/api/shifts/view`
Week shift view for a specific staff/date.
- Query: `staff_name, week_start, city`
- Auth: Bearer token

### GET `/api/shifts/week`
Full week schedule for a city/date range.
- Query: `city, week_start`
- Auth: Bearer token

### GET `/api/shifts/range`
Shifts in a date range.
- Query: `city, start_date, end_date`

### GET `/api/shifts/my_calendar_days`
Personal calendar shift days.
- Query: `staff_name, city, month`
- Auth: Bearer token

### GET `/api/shifts/my_month`
Personal monthly shift schedule.
- Query: `staff_name, city, month`
- Auth: Bearer token

---

## Draft Endpoints

### POST `/api/draft/generate_month`
Generate AI-based monthly draft.
- Body: `{ city, month_key, approver_name, pin, settings? }`
- Response: `{ draft_version, rows_generated, ... }`

### POST `/api/draft/generate_week`
Generate draft for one week.
- Body: `{ city, week_start, approver_name, pin, settings? }`

### POST `/api/draft/ai_analyze`
AI analysis of draft via Anthropic Claude.
- Body: `{ city, draft_version, analysis_type, context_json }`
- Response: Streaming or JSON with analysis text

### GET `/api/draft/rows`
Get draft rows.
- Query: `city, draft_version`

### POST `/api/draft/rows/upsert`
Create or update draft rows.
- Body: `{ approver_name, pin, rows: [...] }`

### POST `/api/draft/apply/prepare`
Prepare to apply draft (validation step).
- Body: `{ city, draft_version, approver_name, pin }`
- Response: `{ job_id, summary }`

### POST `/api/draft/apply/confirm`
Confirm and apply draft to published shifts.
- Body: `{ job_id, approver_name, pin }`

---

## Attendance Endpoints

### POST `/api/attendance/action/options`
Get attendance action options (time-in or time-out, GPS check).
- Body: `{ staff_name, city, latitude?, longitude? }`
- Auth: Bearer token

### POST `/api/attendance/action/verify`
Execute time-in or time-out with WebAuthn or GPS verification.
- Body: `{ staff_name, city, action, webauthn_credential?, location? }`
- Auth: Bearer token + `X-WebAuthn-Origin`

### GET `/api/attendance/today`
Today's attendance status for logged-in staff.
- Auth: Bearer token

### GET `/api/admin/attendance/daily-report`
Admin daily attendance report.
- Query: `city, report_date`
- Auth: Bearer token (admin-level)

### GET `/api/admin/attendance/comparison`
Compare Bayzat attendance with OS attendance sessions.
- Query: `city, from_date, to_date`
- Auth: Bearer token

### POST `/api/admin/attendance/drive/sync-all`
Sync all Bayzat Drive files (manual trigger).
- Body: `{ approver_name, pin }`
- Auth: Bearer token

### GET `/api/admin/attendance/drive/files`
List files visible to service account in Drive folder.
- Query: `folder_id?`
- Auth: Bearer token

---

## Procurement Endpoints

### Requests

#### GET `/api/admin/procurement/requests`
List procurement requests.
- Query: `city, status?, from_date?, to_date?, store_code?, limit?`
- Auth: Bearer token

#### POST `/api/admin/procurement/requests`
Create procurement request (admin side).
- Body: `{ city, store_code, requested_by, request_date, items: [...], urgent_flag, ... }`

#### POST `/api/admin/procurement/requests/submit`
Store submits procurement request.
- Body: `{ requested_by, pin, city, store_code, items: [...], ... }`

#### GET `/api/admin/procurement/requests/{request_id}`
Get single request detail.

#### POST `/api/admin/procurement/requests/{request_id}/evaluate`
Evaluate request against rules (creates approval case).
- Body: `{ approver_name, pin }`

#### POST `/api/admin/procurement/requests/{request_id}/mark-purchased`
Mark request as manually purchased.
- Body: `{ approver_name, pin, receipt_url? }`

#### GET `/api/admin/procurement/hub`
Procurement hub overview (pending actions summary).
- Query: `city`

#### GET `/api/admin/procurement/badge-summary`
Badge count summary for NavBar.
- Query: `city`
- Auth: Bearer token

### Cases

#### GET `/api/admin/procurement/cases`
List approval cases.
- Query: `city, status?, severity?, limit?`

#### GET `/api/admin/procurement/cases/{case_id}`
Get case detail with timeline.

#### POST `/api/admin/procurement/cases/{case_id}/claim`
Approver claims a case for review.
- Body: `{ approver_name, pin }`

#### POST `/api/admin/procurement/cases/{case_id}/approve`
Approve a case.
- Body: `{ approver_name, pin, comment? }`

#### POST `/api/admin/procurement/cases/{case_id}/reject`
Reject a case.
- Body: `{ approver_name, pin, comment }`

#### POST `/api/admin/procurement/cases/{case_id}/return`
Return case to requester for revision.
- Body: `{ approver_name, pin, comment }`

#### POST `/api/admin/procurement/cases/{case_id}/escalate`
Escalate case to higher level.
- Body: `{ approver_name, pin, escalate_to_role, reason }`

#### POST `/api/admin/procurement/cases/{case_id}/message`
Add a message/note to the case.
- Body: `{ actor_name, pin, body, message_type? }`

#### GET `/api/admin/procurement/cases/{case_id}/documents`
List documents uploaded to the case.

#### POST `/api/admin/procurement/cases/{case_id}/documents/upload`
Upload a document to the case.
- Multipart form: `file, stage_code, doc_type, uploaded_by, pin`

#### POST `/api/admin/procurement/cases/{case_id}/notifications/resend`
Resend notification to approver.
- Body: `{ approver_name, pin }`

### Purchase Orders

#### GET `/api/admin/procurement/pos`
List purchase orders.
- Query: `city, status?, from_date?, to_date?, limit?`

#### POST `/api/admin/procurement/pos/create`
Create a PO for an approved request.
- Body: `{ request_id, approver_name, pin, vendor_name, delivery_address, delivery_date, line_items: [...], ... }`

#### POST `/api/admin/procurement/pos/bulk-create-send`
Create and email POs in bulk.
- Body: `{ request_ids: [], approver_name, pin, ... }`

#### POST `/api/admin/procurement/pos/{po_id}/send-email`
Send PO email to vendor.
- Body: `{ approver_name, pin, recipient_email?, cc_emails? }`
- Returns: `{ email_log_id, status }`

#### GET `/api/admin/procurement/pos/{po_id}/delivery-status`
Get PO delivery/confirmation status.

#### GET `/api/procurement/po/open/{receipt_token}`
Tracking pixel endpoint (returns 1x1 GIF, logs open).
- No auth required (vendor-facing)

#### GET `/api/procurement/po/confirm/{receipt_token}`
Vendor confirmation page (HTML response).
- No auth required (vendor-facing)
- Sets `receipt_confirmed_at` on the email log

### CK (Central Kitchen) Endpoints

#### GET `/api/admin/procurement/ck-production/pending`
List pending CK orders (for CK staff).
- Query: `city?`
- Auth: Bearer token

#### POST `/api/admin/procurement/ck-production/dispatch/{po_id}`
Dispatch a CK order (mark as dispatched with actual quantities).
- Body: `{ dispatched_by, pin, dispatched_items: [{item_name, qty_dispatched, has_shortage}], delivery_note?, delivery_photo_url? }`
- Sets: `dispatched_at`, `dispatched_items_json`, `has_shortage`, `dispatched_by`

#### GET `/api/admin/procurement/ck-receiving/pending`
List CK orders pending receiving at store.
- Query: `store_code?, city?`
- Auth: Bearer token

#### POST `/api/admin/procurement/ck-receiving/confirm`
Store confirms receipt of CK dispatch.
- Body: `{ po_id, received_by, pin, items_received: [...] }`

#### GET `/api/admin/procurement/ck-dispatch/pending`
List orders pending CK dispatch (alternative endpoint).

#### POST `/api/admin/procurement/ck-dispatch/{po_id}`
Alternative dispatch endpoint.

### Delivery Addresses

#### GET `/api/admin/procurement/delivery-addresses`
List branch delivery addresses.
- Query: `city`
- Auth: Bearer token

#### POST `/api/admin/procurement/delivery-addresses/upsert`
Create or update a branch delivery address.
- Body: `{ approver_name, pin, city, store_code, display_name, address, active? }`

#### POST `/api/admin/procurement/delivery-addresses/delete`
Delete a delivery address.
- Body: `{ approver_name, pin, id }`

### Receiving

#### GET `/api/admin/procurement/receiving`
List receiving records.
- Query: `city, from_date?, to_date?`

#### POST `/api/admin/procurement/receiving`
Create receiving record.
- Body: `{ request_id, received_by, pin, vendor_name, store_code, qty_received, ... }`

#### POST `/api/admin/procurement/receiving/{receiving_id}/confirm`
Confirm receiving record.
- Body: `{ approver_name, pin }`

#### POST `/api/admin/procurement/receiving/{receiving_id}/void`
Void a receiving record.
- Body: `{ approver_name, pin, reason }`

### Direct Purchase

#### GET `/api/admin/procurement/direct-purchases`
List direct purchases.
- Query: `city, status?, from_date?`

#### POST `/api/admin/procurement/direct-purchase`
Submit a direct purchase (store buyer).
- Body: `{ purchased_by, pin, city, store_code, vendor_name, items: [...], receipt_url?, ... }`

#### PATCH `/api/admin/procurement/direct-purchases/{request_id}`
Update a direct purchase.

#### POST `/api/admin/procurement/direct-purchases/{request_id}/verify`
Admin verifies a direct purchase.
- Body: `{ approver_name, pin }`

### Vendors

#### GET `/api/admin/procurement/vendors`
List vendor master records.
- Query: `city`

#### POST `/api/admin/procurement/vendors/upsert`
Create or update vendor.
- Body: `{ approver_name, pin, city, vendor_code, registered_name, email, cc_emails, ... }`

#### POST `/api/admin/procurement/vendors/delete`
Soft-delete vendor.
- Body: `{ approver_name, pin, id }`

### Catalog

#### GET `/api/admin/procurement/requests/curated-catalog`
Get curated catalog items for order form.
- Query: `city, store_code?`

#### GET `/api/admin/procurement/catalog/curated`
Admin catalog management view.
- Query: `city`

#### POST `/api/admin/procurement/catalog/curated/upsert`
Create or update catalog item.
- Body: `{ approver_name, pin, city, catalog_category, supplier_name, item_name, unit, unit_price, ... }`

#### POST `/api/admin/procurement/catalog/item/update-price`
Update price for a catalog item.
- Body: `{ approver_name, pin, id, unit_price }`

#### POST `/api/admin/procurement/catalog/supplier/rename`
Rename a supplier in catalog items.
- Body: `{ approver_name, pin, city, old_name, new_name }`

#### GET `/api/admin/procurement/catalog/suppliers`
List all unique suppliers in catalog.
- Query: `city`

### Order Grid

#### POST `/api/admin/procurement/order-grid/submit`
Submit bulk orders from the order grid.
- Body: `{ requested_by, pin, city, store_code, items: [...] }`

#### GET `/api/admin/procurement/order-grid/item-history`
Get price/order history for items.
- Query: `city, item_names[]`

### Delivery Schedule

#### GET `/api/admin/procurement/delivery-schedule`
Get delivery schedule configuration.
- Query: `city`

#### POST `/api/admin/procurement/delivery-schedule/upsert`
Update delivery schedule entry.

#### DELETE `/api/admin/procurement/delivery-schedule/{entry_id}`
Remove delivery schedule entry.

### Approval Matrix

#### GET `/api/admin/procurement/config/approval-matrix`
Get approval matrix levels.
- Query: `city`

#### POST `/api/admin/procurement/config/approval-matrix/upsert`
Update approval matrix.
- Body: `{ approver_name, pin, levels: [...] }`

### Exceptions

#### GET `/api/admin/procurement/exceptions`
List exception alerts.
- Query: `city, status?, severity?`

#### POST `/api/admin/procurement/exceptions/review`
Review/dismiss an exception.
- Body: `{ approver_name, pin, exception_id, action, review_note }`

### KPI

#### GET `/api/admin/procurement/kpi/dashboard`
Procurement KPI dashboard data.
- Query: `city, month_key?`

#### GET `/api/admin/procurement/kpi/staff`
Per-staff KPI scores.

#### GET `/api/admin/procurement/kpi/summary`
Aggregated KPI summary.

#### POST `/api/admin/procurement/kpi/recompute`
Trigger KPI recomputation.
- Body: `{ approver_name, pin, city, month_key }`

### Claims

#### GET `/api/admin/procurement/claims`
List claims.
- Query: `city, status?`

#### POST `/api/admin/procurement/claims`
Create a claim.
- Body: `{ actor_name, pin, request_id, claim_type, description, amount_impact?, photo_url? }`

#### POST `/api/admin/procurement/claims/{claim_id}/assign`
Assign claim to someone.

#### POST `/api/admin/procurement/claims/{claim_id}/resolve`
Resolve a claim.

#### POST `/api/admin/procurement/claims/{claim_id}/escalate`
Escalate a claim.

### Invoices

#### GET `/api/admin/procurement/invoices`
List invoices.

#### POST `/api/admin/procurement/invoices`
Create invoice record.

#### POST `/api/admin/procurement/invoices/{invoice_id}/match`
Match invoice to PO.

#### POST `/api/admin/procurement/invoices/{invoice_id}/upload`
Upload invoice document.
- Multipart: `file, uploaded_by, pin`

### Payments

#### GET `/api/admin/procurement/payments`
List payments.

#### POST `/api/admin/procurement/payments/queue`
Queue a payment.

#### POST `/api/admin/procurement/payments/{payment_id}/hold`
Put payment on hold.

#### POST `/api/admin/procurement/payments/{payment_id}/release`
Release payment from hold.

#### POST `/api/admin/procurement/payments/{payment_id}/execute`
Mark payment as executed.

### Supplier Invoice Intelligence

#### POST `/api/admin/procurement/analytics/supplier-invoices/sync`
Sync supplier invoices from Drive.

#### POST `/api/admin/procurement/analytics/supplier-invoices/import-excel`
Import supplier invoice Excel file.
- Multipart: `file, market, requested_by`

#### GET `/api/admin/procurement/analytics/supplier-invoices/overview`
Invoice intelligence overview.
- Query: `market, from_date?, to_date?`

#### GET `/api/admin/procurement/analytics/supplier-invoices/price-alerts`
Price variance alerts.

#### GET `/api/admin/procurement/analytics/supplier-invoices/integrity-alerts`
Data integrity alerts.

#### GET `/api/admin/procurement/analytics/supplier-invoices/spend-summary`
Spend summary by supplier/category.

#### GET `/api/admin/procurement/analytics/supplier-invoices/cross-market-benchmark`
Cross-market price benchmarking.

### Excel Import

#### POST `/api/admin/procurement/import/orders-excel`
Import order Excel file.
- Multipart: `file, city, requested_by, pin`

#### GET `/api/admin/procurement/import/orders-excel/batches`
List import batches.

#### POST `/api/admin/procurement/import/orders-excel/create-requests`
Convert import batch rows to procurement requests.

### Stockout Risk

#### GET `/api/admin/procurement/stockout/risks`
Get stockout risk assessment.
- Query: `city`

#### POST `/api/admin/procurement/stockout/recompute`
Trigger stockout risk recomputation.

### Whitelist

#### GET `/api/admin/procurement/whitelist`
List emergency vendor whitelist entries.

#### POST `/api/admin/procurement/whitelist/upsert`
Add/update whitelist entry.

### Audit Logs

#### GET `/api/admin/procurement/audit-logs`
List procurement audit logs.
- Query: `city, request_id?, from_date?`

### Item Search

#### GET `/api/procurement/items/search`
Search items by name.
- Query: `q, market, limit?`

#### GET `/api/procurement/suppliers/search`
Search suppliers.
- Query: `q, market, limit?`

---

## Analytics Endpoints

### GET `/api/admin/analytics/overtime/summary`
Overtime summary.
- Query: `city, from_date, to_date`

### GET `/api/admin/analytics/late/by_branch`
Late arrivals by branch.
- Query: `city, from_date, to_date`

### GET `/api/admin/analytics/absence/by_branch`
Absences by branch.

### GET `/api/admin/analytics/adherence/by_branch`
Schedule adherence by branch.

### GET `/api/admin/analytics/lean_shift/by_branch`
Lean shift analysis by branch.

### GET `/api/admin/analytics/city_summary`
City-level analytics summary.
- Query: `city, from_date, to_date`

### GET `/api/admin/analytics/branch_efficiency`
Branch efficiency metrics.

---

## Payroll Endpoints (Key ones)

### GET `/api/admin/payroll/cycles`
List payroll cycles.
- Query: `city`

### POST `/api/admin/payroll/cycles`
Create payroll cycle.
- Body: `{ approver_name, pin, city, cycle_name, start_date, end_date }`

### GET `/api/admin/payroll/table`
Payroll computation table for a cycle.
- Query: `cycle_id`

### POST `/api/admin/manila-payroll/periods/{period_id}/compute`
Compute Manila payroll for a period.
- Body: `{ approver_name, pin }`

### GET `/api/admin/payroll/my-pay/summary`
Staff's own pay summary.
- Auth: Bearer token (staff's own token)

---

## Renewals Endpoints

### GET `/api/renewals/alerts/badge`
Badge count for renewal alerts.
- Auth: Bearer token
- Response: `{ badge_count }`

---

## Incident Report Endpoints

### GET `/api/incidents/badge`
Staff incident badge (unread replies).
- Auth: Bearer token
- Response: `{ badge_count }`

### GET `/api/admin/incidents/badge`
Admin incident badge (unprocessed count).
- Query: `city`
- Auth: Bearer token
- Response: `{ badge_count }`

---

## Private Reports Endpoints

### GET `/api/admin/private_reports/badge`
Admin badge count for unreplied private reports.
- Auth: Bearer token
- Response: `{ badge_count }`

### GET `/api/private_reports/my_inbox`
Staff inbox (shift requests + private report replies).
- Query: `limit?`
- Auth: Bearer token
- Response: `{ items: [...], unread_count }`

---

## Staff Management Endpoints

### GET `/api/admin/staff_master`
Full staff master list.
- Query: `city`
- Auth: Bearer token

### POST `/api/admin/staff_master/upsert`
Create or update staff profile.
- Body: `{ approver_name, pin, staff_name, city, role, ... }`

### POST `/api/admin/staff/change_role`
Change staff role.
- Body: `{ approver_name, pin, target_staff_name, new_role, city }`

---

## Access Control Endpoints (HQ Only)

### GET `/api/admin/access/channels`
List all access channels.

### GET `/api/admin/access/roles`
List all roles.

### POST `/api/admin/access/roles`
Create a new role.
- Body: `{ approver_name, pin, role_key, display_name, description }`

### PUT `/api/admin/access/roles/{role_key}/permissions`
Set permissions for a role.
- Body: `{ approver_name, pin, permissions: [...] }`

### GET `/api/admin/access/staff/{staff_name}/roles`
Get roles assigned to a staff member.

### POST `/api/admin/access/staff/roles`
Assign role to staff.
- Body: `{ approver_name, pin, staff_name, role_key }`

---

## Version Endpoint (AutoReload)

### GET `/api/version`
Returns current build ID for AutoReload comparison.
- No auth required
- Response: `{ version: string }` (Vercel URL or build ID)
- File: `src/app/api/version/route.ts`

---

## Response Conventions

Most endpoints return JSON. Common patterns:
- Success: `{ ..data.. }` or `{ items: [...], total? }`
- Error: `{ detail: "error message" }` (FastAPI default)
- Badge: `{ badge_count: int }`
- Job: `{ job_id: string, status: string }`
- Action: `{ ok: true, message: string }`

## Request Conventions

- All dates: ISO format `YYYY-MM-DD`
- All datetimes: ISO 8601 with timezone
- City values: lowercase `dubai` or `manila`
- Staff names: display format (e.g., `"Jay Nishimura"`)
- Amounts: float (PHP or AED depending on city)
- UUIDs: string format (not binary)
