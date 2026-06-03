# DATABASE SCHEMA — Sushi ZEN Workforce OS

Database: Heroku Postgres (attached to `sushizen-shift-app`)
ORM: None — raw psycopg2 with `RealDictCursor`
All table creation via `ensure_*` functions in `app/db.py`

---

## Domain: Access Control

### `access_channels` (ensure_access_control_tables, line ~209)
Channel-based permission registry.
- `channel_key TEXT PK` — e.g., `admin.dashboard`, `week`, `attendance`
- `display_name TEXT`
- `description TEXT`
- `group_label TEXT` — e.g., `admin`, `staff`
- `is_active BOOLEAN`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `access_roles`
Custom role definitions.
- `role_key TEXT PK`
- `display_name TEXT`
- `description TEXT`
- `is_active BOOLEAN`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `auth_role_permissions`
Role-to-channel-permission mapping.
- `id UUID PK`
- `role_key TEXT` → references `access_roles`
- `permission_key TEXT` — e.g., `channel.admin.dashboard.view`
- `granted_by TEXT`
- `created_at TIMESTAMPTZ`

### `staff_role_assignments`
Staff-to-role assignments.
- `id UUID PK`
- `staff_name TEXT`
- `role_key TEXT` → references `access_roles`
- `is_primary BOOLEAN`
- `assigned_by TEXT`
- `created_at TIMESTAMPTZ`

---

## Domain: Staff and Auth

### `staff` (ensure_tables, line ~1209)
Primary staff master.
- `id SERIAL PK`
- `staff_name TEXT UNIQUE`
- `city TEXT` — `dubai` or `manila`
- `role TEXT` — `STAFF`, `ADMIN`, `HQ`, `DUBAI_MANAGEMENT`, `MANILA_MANAGEMENT`
- `pin TEXT` (hashed)
- `status TEXT` — `ACTIVE`, `INACTIVE`
- `store_code TEXT`
- `city_lock TEXT` — `''` (all cities), `dubai`, or `manila`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `staff_auth_tokens` (ensure_staff_auth_tables, line ~2845)
Access token storage.
- `id UUID PK`
- `staff_name TEXT`
- `token TEXT UNIQUE`
- `token_hash TEXT`
- `city TEXT`
- `role TEXT`
- `expires_at TIMESTAMPTZ`
- `issued_at TIMESTAMPTZ`
- `revoked_at TIMESTAMPTZ`
- `last_used_at TIMESTAMPTZ`

### `staff_step_up_tokens`
Step-up authentication tokens.
- `id UUID PK`
- `staff_name TEXT`
- `token TEXT UNIQUE`
- `level TEXT` — `aal1`, `aal2`, `phishing_resistant`
- `method TEXT`
- `verified_at TIMESTAMPTZ`
- `expires_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ`

### `staff_webauthn_credentials`
WebAuthn passkey credentials.
- `id UUID PK`
- `staff_name TEXT`
- `credential_id TEXT UNIQUE`
- `credential_public_key BYTEA`
- `sign_count INT`
- `device_type TEXT`
- `backed_up BOOLEAN`
- `created_at TIMESTAMPTZ`, `last_used_at TIMESTAMPTZ`

### `staff_master` (ensure_staff_master_tables, line ~2065)
Extended staff profile.
- `id UUID PK`
- `staff_name TEXT UNIQUE`
- `city TEXT`
- `display_name TEXT`
- `branch_code TEXT`
- `position TEXT`
- `employment_type TEXT`
- `start_date DATE`
- `is_gps_exempt BOOLEAN`
- `gps_exempt_reason TEXT`
- `status TEXT`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `staff_audit_logs` (ensure_staff_audit_tables, line ~15881)
Audit trail for staff changes.
- `id BIGSERIAL PK`
- `actor_name TEXT`
- `target_staff_name TEXT`
- `action_key TEXT`
- `before_json JSONB`
- `after_json JSONB`
- `reason TEXT`
- `created_at TIMESTAMPTZ`

### `staff_onboarding` (ensure_staff_onboarding_columns, line ~3021)
Tracks staff onboarding state (columns on `staff` table or separate table).
- Tracks setup codes, PIN setup status, etc.

---

## Domain: Shifts and Scheduling

### `shift_rows` (ensure_tables, line ~1209)
Core shift schedule rows.
- `id BIGSERIAL PK`
- `staff_name TEXT`
- `city TEXT`
- `shift_date DATE`
- `branch_code TEXT`
- `start_time TEXT`
- `end_time TEXT`
- `shift_type TEXT`
- `role TEXT`
- `status TEXT`
- `published BOOLEAN`
- `version INT`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `draft_rows` (ensure_shift_draft_tables, line ~13237)
AI-generated draft shifts pending approval.
- `id UUID PK`
- `draft_version TEXT`
- `staff_name TEXT`
- `city TEXT`
- `branch_code TEXT`
- `shift_date DATE`
- `start_time TEXT`
- `end_time TEXT`
- `shift_type TEXT`
- `role TEXT`
- `reliability_score FLOAT`
- `attendance_days INT`
- `status TEXT`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `shift_overrides` (ensure_shift_override_tables, line ~1849)
Shift override records.
- `id UUID PK`
- `staff_name TEXT`
- `shift_date DATE`
- `override_type TEXT`
- `created_at TIMESTAMPTZ`

### `demand_events` (ensure_demand_events_table, line ~39010)
Events that affect staffing demand (holidays, events, etc.).
- `id UUID PK`
- `city TEXT`
- `event_date DATE`
- `event_type TEXT`
- `multiplier FLOAT`
- `description TEXT`
- `created_by TEXT`
- `created_at TIMESTAMPTZ`

### `operating_hours` (ensure_operating_hours_table, line ~39134)
Branch operating hours config for draft generation.
- `id UUID PK`
- `city TEXT`
- `branch_code TEXT`
- `day_of_week INT` (0=Mon, 6=Sun)
- `open_time TEXT`
- `close_time TEXT`
- `created_at TIMESTAMPTZ`

### `staffing_rules` (ensure_staffing_rules_table, line ~39231)
Staffing requirements rules for draft generation.
- `id UUID PK`
- `city TEXT`
- `branch_code TEXT`
- `time_slot TEXT`
- `min_staff INT`
- `max_staff INT`
- `role TEXT`
- `created_at TIMESTAMPTZ`

### `forecast_settings` (ensure_forecast_settings_table, line ~39341)
ForecastSettingsPanel multipliers stored per city.
- `id UUID PK`
- `city TEXT`
- `setting_key TEXT`
- `value_json JSONB`
- `updated_by TEXT`
- `updated_at TIMESTAMPTZ`

### `draft_apply_jobs` (ensure_draft_apply_jobs_tables, line ~15552)
Tracks draft-to-published-shifts apply operations.
- `id UUID PK`
- `draft_version TEXT`
- `city TEXT`
- `status TEXT` — `PENDING`, `RUNNING`, `DONE`, `FAILED`
- `apply_mode TEXT`
- `rows_applied INT`
- `created_by TEXT`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `export_jobs` (ensure_export_jobs_tables, line ~13777)
Month export job tracking.
- `id UUID PK`
- `city TEXT`
- `month_key TEXT`
- `status TEXT`
- `result_url TEXT`
- `created_by TEXT`
- `created_at TIMESTAMPTZ`

---

## Domain: Shift Requests and Changes

### `shift_requests` (ensure_shift_change_tables, line ~3521)
Shift change/swap/time-off requests.
- `id UUID PK`
- `requester_name TEXT`
- `city TEXT`
- `request_type TEXT` — `SWAP`, `TIME_OFF`, `EARLY_LEAVE`
- `shift_date DATE`
- `counterparty_name TEXT`
- `status TEXT` — `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`
- `manager_approved_by TEXT`
- `hq_approved_by TEXT`
- `reason TEXT`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

---

## Domain: Attendance

### `actual_attendance` (ensure_attendance_tables, line ~16446)
Bayzat-synced attendance records.
- `id UUID PK`
- `staff_name TEXT`
- `city TEXT`
- `attendance_date DATE`
- `check_in_time TIMESTAMPTZ`
- `check_out_time TIMESTAMPTZ`
- `total_hours FLOAT`
- `status TEXT`
- `location TEXT`
- `canonical_branch_code TEXT`
- `import_batch_id UUID`
- `source_file_name TEXT`
- `created_at TIMESTAMPTZ`
- Index: `(attendance_date DESC, staff_name)`

### `os_attendance_sessions` (ensure_os_attendance_tables, line ~40984)
WebAuthn/GPS-based attendance sessions (the app's own time-in/time-out).
- `id UUID PK`
- `staff_name TEXT`
- `city TEXT`
- `session_date DATE`
- `action TEXT` — `TIME_IN`, `TIME_OUT`
- `branch_code TEXT`
- `latitude FLOAT`, `longitude FLOAT`
- `accuracy_meters FLOAT`
- `ip_address TEXT`
- `user_agent TEXT`
- `passkey_credential_id TEXT`
- `step_up_level TEXT`
- `created_at TIMESTAMPTZ`

### `attendance_drive_sources` (ensure_attendance_drive_sync_tables, line ~19166)
Google Drive folder config for Bayzat sync.
- `id SERIAL PK`
- `folder_id TEXT` — `0AJRy_FdAYDp2Uk9PVA` (Shared Drive root)
- `city_hint TEXT` — empty (Dubai + Manila mixed)
- `is_enabled BOOLEAN`
- `last_synced_at TIMESTAMPTZ`
- `last_sync_status TEXT` — `OK`, `DUPLICATE_HASH`, etc.

### `attendance_import_batches`
Tracks each Drive file import batch.
- `id UUID PK`
- `source_name TEXT`
- `source_file_id TEXT`
- `source_file_name TEXT`
- `source_folder_id TEXT`
- `file_hash TEXT` — for deduplication
- `city_hint TEXT`
- `status TEXT`
- `rows_imported INT`
- `created_by TEXT`
- `created_at TIMESTAMPTZ`

### `attendance_location_mapping`
Maps raw Bayzat location strings to canonical branch codes.
- `id UUID PK`
- `raw_location TEXT UNIQUE`
- `city TEXT`
- `city_inferred TEXT`
- `canonical_branch_code TEXT`
- `updated_by TEXT`, `updated_at TIMESTAMPTZ`

### `attendance_employee_alias` (ensure_attendance_employee_alias_tables, line ~17644)
Maps Bayzat employee names to canonical staff names.
- `id UUID PK`
- `bayzat_name TEXT UNIQUE`
- `canonical_staff_name TEXT`
- `city TEXT`
- `approved_by TEXT`, `approved_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ`

### `attendance_corrections` (ensure_attendance_corrections_tables, line ~17674)
Manual attendance corrections.
- `id UUID PK`
- `staff_name TEXT`
- `attendance_date DATE`
- `correction_type TEXT`
- `original_value JSONB`
- `corrected_value JSONB`
- `reason TEXT`
- `approved_by TEXT`, `approved_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ`

### `attendance_monthly_closing` (ensure_attendance_monthly_closing_tables, line ~17713)
Monthly attendance close records.
- `id UUID PK`
- `city TEXT`
- `month_key TEXT`
- `closed_by TEXT`
- `closed_at TIMESTAMPTZ`
- `notes TEXT`

### `attendance_schedule_policy` (ensure_attendance_schedule_policy_tables, line ~17764)
Per-staff schedule type policies (shift worker vs. fixed hours, etc.).
- `id UUID PK`
- `city TEXT`
- `canonical_staff_name TEXT`
- `schedule_type TEXT`
- `reason TEXT`
- `effective_from DATE`
- `effective_to DATE`
- `is_active BOOLEAN`
- `created_by TEXT`, `created_at TIMESTAMPTZ`

### `branch_gps_zones`
GPS zones for branch-level attendance verification.
- `id UUID PK`
- `city TEXT`
- `branch_code TEXT UNIQUE per city`
- `latitude FLOAT`, `longitude FLOAT`
- `radius_meters FLOAT`
- `display_name TEXT`
- `updated_by TEXT`, `updated_at TIMESTAMPTZ`

---

## Domain: Procurement

### `proc_requests` (ensure_procurement_control_tables, line ~5224)
Procurement requests (from stores).
- `id UUID PK`
- `city TEXT` — `manila` or `dubai`
- `request_no TEXT UNIQUE`
- `requested_by TEXT`
- `store_code TEXT`
- `request_date DATE`
- `currency TEXT`
- `total_amount FLOAT`
- `urgent_flag BOOLEAN`
- `new_vendor_flag BOOLEAN`
- `status TEXT` — `DRAFT`, `IN_REVIEW`, `APPROVED`, `DELIVERED`, `CANCELLED`
- `current_approval_level INT`
- `required_roles_json JSONB`
- `final_decision_at TIMESTAMPTZ`
- `is_ck_order BOOLEAN` — True when vendor = "CK"
- `is_wh_order BOOLEAN` — True for warehouse orders
- `parent_case_no TEXT`
- `severity TEXT` — `GREEN`, `YELLOW`, `RED`
- `risk_score FLOAT`
- `blocked_reason TEXT`
- `stockout_risk_level TEXT`
- `document_status TEXT`
- `po_status TEXT`
- `approval_case_id UUID`
- `receiving_status TEXT`
- `invoice_status TEXT`
- `payment_status TEXT`
- `purchase_type TEXT` — `standard`, `emergency`
- `receipt_url TEXT`
- `data_verified_at TIMESTAMPTZ`, `data_verified_by TEXT`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`
- Index: `(city, request_date DESC, status)`

### `proc_request_items`
Line items within a procurement request.
- `id UUID PK`
- `request_id UUID` → `proc_requests`
- `item_name TEXT`
- `category TEXT`
- `spec TEXT`
- `qty FLOAT`
- `unit TEXT`
- `unit_price FLOAT`
- `line_total FLOAT`
- `vendor_name TEXT` — `"CK"` for Central Kitchen orders
- `needed_by_date DATE`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `proc_approval_cases` (ensure_procurement_phase1_tables, line ~7834)
Approval workflow cases (one per request after evaluation).
- `id UUID PK`
- `request_id UUID` → `proc_requests` (UNIQUE — one case per request)
- `parent_case_no TEXT UNIQUE`
- `status TEXT` — `CREATED`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `ESCALATED`
- `severity TEXT`
- `risk_score FLOAT`
- `required_roles_json JSONB`
- `current_level_no INT`
- `current_wave_no INT`
- `current_assignee_name TEXT`
- `current_assignee_role TEXT`
- `claimed_by TEXT`, `claimed_at TIMESTAMPTZ`
- `acknowledged_at TIMESTAMPTZ`
- `review_started_at TIMESTAMPTZ`
- `approved_at TIMESTAMPTZ`
- `rejected_at TIMESTAMPTZ`
- `escalated_to_role TEXT`, `escalated_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `proc_purchase_orders`
Purchase Orders issued to vendors.
- `id UUID PK`
- `request_id UUID` → `proc_requests`
- `case_id UUID` → `proc_approval_cases`
- `parent_case_no TEXT`
- `po_no TEXT UNIQUE`
- `vendor_name TEXT`
- `amount FLOAT`
- `line_items_json JSONB` — array of ordered line items
- `vat_treatment TEXT`
- `delivery_address TEXT`
- `delivery_date DATE`
- `payment_terms TEXT`
- `prepared_by TEXT`, `approved_by TEXT`
- `status TEXT` — `DRAFT`, `SENT`, `CONFIRMED`, `DELIVERED`
- `last_email_status TEXT`
- `last_recipient_email TEXT`
- `last_email_sent_at TIMESTAMPTZ`
- `receipt_confirmed_at TIMESTAMPTZ`
- `receipt_confirmed_by TEXT`
- `drive_file_id TEXT`, `drive_file_url TEXT`
- `dispatched_at TIMESTAMPTZ` — when CK dispatched the order
- `dispatched_by TEXT`
- `dispatched_items_json JSONB` — actual items dispatched (may differ from ordered)
- `has_shortage BOOLEAN` — True if dispatched qty < ordered qty
- `delivery_note TEXT`, `delivery_photo_url TEXT`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`
- Index: `(request_id)`, `(dispatched_at) WHERE NOT NULL`, `(has_shortage) WHERE TRUE`

### `proc_po_email_logs`
Email delivery log for PO emails to vendors.
- `id UUID PK`
- `po_id UUID` → `proc_purchase_orders`
- `request_id UUID`, `case_id UUID`
- `recipient_email TEXT`
- `cc_emails_json JSONB`
- `subject TEXT`, `body_text TEXT`
- `gmail_message_id TEXT`
- `status TEXT` — `PENDING`, `SENT`, `FAILED`
- `error_text TEXT`
- `receipt_token TEXT UNIQUE` — used in confirmation URL
- `receipt_confirmed_at TIMESTAMPTZ`
- `receipt_confirmed_ip TEXT`, `receipt_confirmed_user_agent TEXT`
- `opened_at TIMESTAMPTZ` — tracking pixel first open
- `open_count INT` — total opens
- `drive_file_id TEXT`, `drive_file_url TEXT`
- `sent_by TEXT`, `sent_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `proc_vendor_master`
Vendor master record (formerly `proc_vendors`).
- `id UUID PK`
- `vendor_code TEXT`
- `city TEXT`
- `registered_name TEXT`
- `trade_name TEXT`
- `tin TEXT`
- `bir_registered BOOLEAN`
- `registered_address TEXT`
- `bank_account_name TEXT`, `bank_account_no TEXT`, `bank_name TEXT`
- `payment_terms TEXT`
- `risk_level TEXT`
- `status TEXT`
- `notes TEXT`
- `email TEXT` — for PO emails
- `cc_emails TEXT` — comma-separated CC emails
- `catalog_aliases TEXT`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`
- UNIQUE: `(vendor_code, city)`

### `proc_curated_catalog_items`
Order catalog items (curated by admin, shown to store staff when ordering).
- `id UUID PK`
- `city TEXT`
- `catalog_category TEXT`
- `store_scope TEXT` — `ALL` or specific store code
- `supplier_name TEXT`
- `sku TEXT`
- `item_name TEXT`
- `unit TEXT`
- `unit_price FLOAT`
- `currency_code TEXT`
- `sort_order INT`
- `active BOOLEAN`
- `section TEXT`
- `order_type TEXT` — e.g., `CK`, `standard`
- `min_stock_qty TEXT`
- `package_spec TEXT`
- `fast_running BOOLEAN`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`
- UNIQUE: `(city, catalog_category, store_scope, supplier_name, sku, item_name)`

### `proc_branch_delivery_addresses` (NEW)
Branch delivery addresses for PO delivery field auto-fill.
- `id UUID PK DEFAULT gen_random_uuid()`
- `city TEXT NOT NULL`
- `store_code TEXT NOT NULL`
- `display_name TEXT`
- `address TEXT`
- `active BOOLEAN`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`
- UNIQUE: `(city, store_code)`
- Index: `(city, active)`

### `proc_approval_matrix_php`
Approval matrix levels with thresholds.
- `id UUID PK`
- `level_no INT UNIQUE`
- `min_amount FLOAT`
- `max_amount FLOAT`
- `required_roles_json JSONB`
- `conditions_json JSONB` — `{escalate_if_urgent, require_hq_if_new_vendor}`
- `is_active BOOLEAN`
- `updated_by TEXT`, `updated_at TIMESTAMPTZ`

### `proc_approval_actions`
Log of approval actions taken on requests.
- `id UUID PK`
- `request_id UUID` → `proc_requests`
- `approval_level INT`
- `actor_name TEXT`, `actor_role TEXT`
- `action TEXT` — `APPROVE`, `REJECT`, `ESCALATE`
- `comment TEXT`
- `acted_at TIMESTAMPTZ`

### `proc_approval_notifications`
Notifications sent to approvers.
- `id UUID PK`
- `case_id UUID` → `proc_approval_cases`
- `wave_no INT`
- `channel TEXT` — `WORKFORCE_PUSH`
- `recipient_name TEXT`, `recipient_address TEXT`, `recipient_role TEXT`
- `sent_at TIMESTAMPTZ`
- `delivered_at TIMESTAMPTZ`, `opened_at TIMESTAMPTZ`, `claimed_at TIMESTAMPTZ`
- `status TEXT`
- `provider_status TEXT`, `provider_ref TEXT`
- `error_text TEXT`
- `payload_json JSONB`, `response_json JSONB`
- `updated_at TIMESTAMPTZ`

### `proc_case_messages`
Messages/notes on approval cases.
- `id UUID PK`
- `case_id UUID` → `proc_approval_cases`
- `actor_name TEXT`, `actor_role TEXT`
- `message_type TEXT` — `NOTE`, `STATUS_CHANGE`, `ESCALATION`
- `body TEXT`, `attachment_url TEXT`
- `created_at TIMESTAMPTZ`

### `proc_document_chain`
Document uploads per procurement case stage.
- `id UUID PK`
- `request_id UUID`, `case_id UUID`
- `parent_case_no TEXT`
- `stage_code TEXT`
- `doc_type TEXT`
- `file_name TEXT`, `mime_type TEXT`
- `drive_folder_id TEXT`, `drive_file_id TEXT`, `web_view_link TEXT`
- `uploaded_by TEXT`
- `validation_status TEXT`, `validation_note TEXT`
- `is_required BOOLEAN`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `proc_receivings`
Delivery receiving records.
- `id UUID PK`
- `request_id UUID`, `case_id UUID`, `po_id UUID`
- `parent_case_no TEXT`
- `receiving_no TEXT UNIQUE`
- `vendor_name TEXT`, `store_code TEXT`
- `received_by TEXT`
- `delivery_date DATE`, `received_at TIMESTAMPTZ`
- `qty_expected FLOAT`, `qty_received FLOAT`
- `unit TEXT`, `unit_price FLOAT`, `amount_received FLOAT`
- `shortage_qty FLOAT`, `excess_qty FLOAT`
- `quality_status TEXT`, `variance_reason TEXT`
- `status TEXT`, `confirmed_by TEXT`, `confirmed_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `proc_claims`
Procurement claims (shortage, quality issues, etc.).
- `id UUID PK`
- `request_id UUID`, `case_id UUID`, `receiving_id UUID`
- `claim_no TEXT UNIQUE`
- `claim_type TEXT` — `SHORTAGE`, `QUALITY`, `PRICING`
- `amount_impact FLOAT`
- `responsible_party TEXT`, `owner_name TEXT`
- `status TEXT` — `OPEN`, `ASSIGNED`, `RESOLVED`, `ESCALATED`
- `severity TEXT`
- `description TEXT`, `resolution_note TEXT`
- `assigned_to TEXT`, `assigned_at TIMESTAMPTZ`
- `escalated_to_role TEXT`, `escalated_at TIMESTAMPTZ`
- `resolved_by TEXT`, `resolved_at TIMESTAMPTZ`
- `photo_url TEXT`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `proc_invoices`
Vendor invoices matched to procurement requests.
- `id UUID PK`
- `request_id UUID`, `case_id UUID`, `po_id UUID`
- `invoice_no TEXT`
- `vendor_name TEXT`
- `invoice_date DATE`, `due_date DATE`
- `invoice_amount FLOAT`, `currency TEXT`
- `match_status TEXT`, `variance_amount FLOAT`, `variance_reason TEXT`
- `status TEXT`
- `file_name TEXT`, `mime_type TEXT`
- `drive_folder_id TEXT`, `drive_file_id TEXT`, `drive_file_url TEXT`
- `uploaded_by TEXT`, `sender_name TEXT`
- `reviewed_by TEXT`, `reviewed_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `proc_payments`
Payment records for procurement.
- `id UUID PK`
- `request_id UUID`, `case_id UUID`, `invoice_id UUID`
- `payment_no TEXT UNIQUE`
- `payee_name TEXT`
- `scheduled_amount FLOAT`, `scheduled_date DATE`
- `status TEXT` — `QUEUED`, `HELD`, `RELEASED`, `EXECUTED`
- `hold_reason TEXT`, `hold_by TEXT`, `hold_at TIMESTAMPTZ`
- `released_by TEXT`, `released_at TIMESTAMPTZ`
- `executed_by TEXT`, `executed_at TIMESTAMPTZ`, `execution_ref TEXT`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `proc_exception_events`
Exception alerts from procurement rule engine.
- `id UUID PK`
- `request_id UUID`, `case_id UUID`
- `rule_code TEXT`
- `event_key TEXT UNIQUE (when non-empty)`
- `severity TEXT` — `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
- `score FLOAT`
- `detected_payload_json JSONB`
- `status TEXT` — `OPEN`, `REVIEWED`, `DISMISSED`
- `review_note TEXT`, `reviewed_by TEXT`, `reviewed_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ`

### `proc_audit_logs`
Full audit trail for all procurement actions.
- `id BIGSERIAL PK`
- `request_id UUID`, `case_id UUID`
- `actor_name TEXT`, `actor_role TEXT`
- `action_key TEXT`
- `module TEXT`
- `reason_code TEXT`
- `before_json JSONB`, `after_json JSONB`
- `ip TEXT`, `user_agent TEXT`
- `created_at TIMESTAMPTZ`

### `proc_kpi_monthly`
Procurement KPI scores per person per month.
- `id UUID PK`
- `month_key TEXT`, `owner_name TEXT` — UNIQUE together
- `on_time_rate FLOAT`
- `price_deviation_avg FLOAT`
- `exception_count INT`
- `urgent_ratio FLOAT`
- `approval_cycle_hours_avg FLOAT`
- `score_total FLOAT`
- `grade TEXT`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `proc_improvement_actions`
Improvement action plans linked to KPI issues.
- `id UUID PK`
- `month_key TEXT`, `owner_name TEXT`, `issue_title TEXT` — UNIQUE together
- `action_plan TEXT`
- `due_date DATE`
- `status TEXT`
- `result_note TEXT`
- `updated_by TEXT`, `updated_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ`

### `proc_vendor_quotes`
Vendor quotes per request item.
- `id UUID PK`
- `request_item_id UUID` → `proc_request_items`
- `vendor_name TEXT`
- `quoted_unit_price FLOAT`
- `quote_date DATE`
- `quote_doc_url TEXT`
- `is_selected BOOLEAN`
- `created_at TIMESTAMPTZ`

### `proc_price_baselines`
Price baseline for exception detection.
- `id UUID PK`
- `item_key TEXT UNIQUE`
- `baseline_unit_price FLOAT`
- `stddev_price FLOAT`
- `sample_count INT`
- `last_updated_at TIMESTAMPTZ`

### `proc_item_benchmark_master`
Item benchmark prices for exception scoring.
- `id UUID PK`
- `item_code TEXT UNIQUE`
- `item_name TEXT`
- `category TEXT`, `unit TEXT`
- `benchmark_unit_price FLOAT`
- `tolerance_pct FLOAT`
- `preferred_vendor_code TEXT`
- `high_risk_flag BOOLEAN`, `active BOOLEAN`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `proc_emergency_whitelist`
Emergency vendor/item whitelists (bypass rules).
- `id UUID PK`
- `scope_type TEXT`, `scope_key TEXT`
- `vendor_code TEXT`, `item_code TEXT`, `store_code TEXT`
- `reason TEXT`
- `approver_name TEXT`, `approver_role TEXT`
- `start_date DATE`, `end_date DATE`
- `sla_hours INT`
- `active BOOLEAN`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `proc_stockout_risk_snapshots`
Daily stockout risk assessment snapshots.
- `id UUID PK`
- `snapshot_date DATE`, `item_name TEXT`, `store_code TEXT` — UNIQUE together
- `vendor_name TEXT`
- `projected_days_to_stockout FLOAT`
- `lead_time_days FLOAT`
- `open_po_qty FLOAT`
- `consumption_rate FLOAT`
- `risk_level TEXT`
- `risk_score FLOAT`
- `recommended_action TEXT`
- `evidence_json JSONB`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `proc_risk_lab_settings`
Risk lab configuration.
- `id UUID PK`
- `config_key TEXT UNIQUE`
- `value_json JSONB`
- `updated_by TEXT`, `updated_at TIMESTAMPTZ`

### `proc_delivery_schedule` (ensure_procurement_delivery_tables / ensure_delivery_schedule_tables)
Delivery schedule configuration (days vendors deliver to branches).
- `id UUID PK`
- `city TEXT`
- `supplier_name TEXT`
- `branch_code TEXT`
- `day_of_week INT`
- `delivery_window TEXT`
- `notes TEXT`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

---

## Domain: Supplier Invoices (Invoice Intelligence)

### `invoice_line_items` (ensure_invoice_line_items_tables, line ~5405)
Supplier invoice line items from imported Excel files.
- `id SERIAL PK`
- `market TEXT` — `manila` or `dubai`
- `invoice_no TEXT`, `line_no INT` — UNIQUE together with market
- `invoice_date DATE`, `branch TEXT`
- `supplier_name TEXT`, `supplier_code TEXT`
- `item_description TEXT`, `item_code TEXT`
- `quantity NUMERIC`, `unit TEXT`
- `unit_price NUMERIC`, `amount NUMERIC`
- `tax_category TEXT`
- `vatable_sales NUMERIC`, `vat_amount NUMERIC`
- `excise_amount NUMERIC`, `total_incl_vat NUMERIC`
- `currency TEXT`, `po_number TEXT`, `notes TEXT`
- `content_hash TEXT`
- `created_at TIMESTAMP`, `updated_at TIMESTAMP`
- View: `item_price_history` (LAG-based price change view)

### `invoice_summary` (ensure_invoice_summary_tables, line ~5489)
Supplier invoice header summary.
- `id SERIAL PK`
- `market TEXT`, `invoice_no TEXT` — UNIQUE together
- `invoice_date DATE`, `due_date DATE`
- `supplier_name TEXT`, `supplier_code TEXT`
- `tin TEXT`, `excise_trn TEXT`
- `payment_terms TEXT`, `currency TEXT`
- `net_amount NUMERIC`, `vat_amount NUMERIC`
- `excise_amount NUMERIC`, `other_charges NUMERIC`
- `discount NUMERIC`, `grand_total NUMERIC`
- `po_number TEXT`, `delivery_date DATE`
- `prepared_by TEXT`, `approved_by TEXT`, `notes TEXT`
- `content_hash TEXT`
- `created_at TIMESTAMP`, `updated_at TIMESTAMP`

### `supplier_master` (ensure_supplier_master_tables, line ~5542)
Supplier/vendor master from invoice data.
- `id SERIAL PK`
- `market TEXT`, `supplier_code TEXT` — UNIQUE together
- `supplier_name TEXT`, `supplier_type TEXT`
- `contact_person TEXT`, `email TEXT`, `phone TEXT`, `address TEXT`
- `tin TEXT`, `trn TEXT`, `excise_trn TEXT`
- `payment_terms TEXT`, `currency TEXT`, `notes TEXT`
- `created_at TIMESTAMP`, `updated_at TIMESTAMP`

### `proc_supplier_invoice_sync_jobs` (ensure_procurement_invoice_sync_job_tables, line ~5584)
Job queue for invoice file sync operations.
- `id UUID PK`
- `market TEXT`
- `source_name TEXT`, `source_file_id TEXT`, `source_file_hash TEXT`
- `requested_by TEXT`
- `status TEXT` — `QUEUED`, `RUNNING`, `COMPLETED`, `COMPLETED_WITH_WARNINGS`, `FAILED`
- `result_json JSONB`, `error_message TEXT`
- `started_at TIMESTAMPTZ`, `finished_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

---

## Domain: Private Reports

### `private_reports` (ensure_private_report_tables, line ~3924)
Staff private reports submitted confidentially.
- `id UUID PK`
- `staff_name TEXT`
- `city TEXT`
- `report_type TEXT`
- `subject TEXT`, `body TEXT`
- `admin_reply TEXT`
- `admin_reply_by TEXT`, `admin_reply_at TIMESTAMPTZ`
- `status TEXT` — `OPEN`, `REPLIED`, `CLOSED`
- `is_read_by_staff BOOLEAN`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

---

## Domain: Absences

### `absences` (ensure_absence_tables, line ~3108)
Staff absence records.
- `id UUID PK`
- `staff_name TEXT`
- `city TEXT`
- `absence_date DATE`
- `absence_type TEXT`
- `reason TEXT`
- `approved_by TEXT`, `approved_at TIMESTAMPTZ`
- `status TEXT`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

---

## Domain: Backoffice Evaluation

### `backoffice_eval_scores` (ensure_backoffice_eval_tables, line ~4604)
Monthly store evaluation scores.
- `id UUID PK`
- `city TEXT`, `month_key TEXT`, `store_code TEXT`
- `score FLOAT`, `grade TEXT`
- `metric_scores_json JSONB`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `backoffice_eval_actions`
Action items from evaluations.
- `id UUID PK`
- `city TEXT`, `month_key TEXT`, `staff_name TEXT`
- `action_title TEXT`, `action_detail TEXT`
- `action_owner TEXT`
- `due_date DATE`
- `status TEXT`
- `updated_by TEXT`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

### `evaluation_rules` (ensure_evaluation_tables, line ~36109)
Configurable evaluation rules.
- `id UUID PK`
- `metric_key TEXT`, `category_key TEXT`
- `metric_label TEXT`
- `config_json JSONB`
- `is_active BOOLEAN`
- `updated_at TIMESTAMPTZ`

### `evaluation_settings`
Evaluation strictness settings.
- `id UUID PK`
- `strictness_level INT` (1-10)
- `updated_by TEXT`, `updated_at TIMESTAMPTZ`

---

## Domain: Incident Reports

### `incident_reports` (ensure_incident_report_tables, line ~38386)
Staff incident reports.
- `id UUID PK`
- `reporter_name TEXT`
- `city TEXT`, `branch_code TEXT`
- `incident_date DATE`
- `incident_type TEXT`
- `subject TEXT`, `description TEXT`
- `severity TEXT`
- `status TEXT` — `OPEN`, `IN_REVIEW`, `RESOLVED`, `CLOSED`
- `admin_reply TEXT`, `admin_reply_by TEXT`, `admin_reply_at TIMESTAMPTZ`
- `is_read_by_staff BOOLEAN`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

---

## Domain: Payroll (Dubai)

### `payroll_cycles` (ensure_payroll_tables, line ~35730 or ~41834)
Dubai payroll cycles (monthly).
- `id UUID PK`
- `city TEXT`
- `cycle_name TEXT`
- `start_date DATE`, `end_date DATE`
- `status TEXT` — `OPEN`, `CLOSED`
- `closed_by TEXT`, `closed_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ`

### `payroll_salary_configs`
Staff salary configurations for Dubai payroll.
- `id UUID PK`
- `staff_name TEXT UNIQUE`
- `base_salary FLOAT`
- `housing_allowance FLOAT`
- `transport_allowance FLOAT`
- `other_allowances JSONB`
- `currency TEXT`
- `updated_by TEXT`, `updated_at TIMESTAMPTZ`

### `payroll_adjustments`
One-time or recurring adjustments.
- `id UUID PK`
- `cycle_id UUID`
- `staff_name TEXT`
- `adjustment_type TEXT` — `BONUS`, `DEDUCTION`, `OVERTIME`
- `amount FLOAT`
- `description TEXT`
- `created_by TEXT`, `created_at TIMESTAMPTZ`

### `payroll_runs`
Payroll run records.
- `id UUID PK`
- `cycle_id UUID`
- `status TEXT` — `DRAFT`, `FINALIZED`
- `finalized_by TEXT`, `finalized_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ`

### `payroll_loans` (ensure_loan_tables, line ~42707)
Staff loan records.
- `id UUID PK`
- `staff_name TEXT`
- `city TEXT`
- `loan_amount FLOAT`
- `balance_remaining FLOAT`
- `monthly_deduction FLOAT`
- `status TEXT` — `PENDING`, `APPROVED`, `ACTIVE`, `SETTLED`, `CANCELLED`
- `approved_by TEXT`, `approved_at TIMESTAMPTZ`
- `disbursed_by TEXT`, `disbursed_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ`

### `payroll_loan_repayments`
Loan repayment schedule/history.
- `id UUID PK`
- `loan_id UUID`
- `cycle_id UUID`
- `amount FLOAT`
- `status TEXT`
- `created_at TIMESTAMPTZ`

### `payroll_leave_salary_requests` (ensure_leave_salary_tables, line ~43058)
Leave salary requests.
- `id UUID PK`
- `staff_name TEXT`
- `city TEXT`
- `leave_type TEXT`
- `days FLOAT`
- `daily_rate FLOAT`
- `total_amount FLOAT`
- `status TEXT` — `PENDING`, `APPROVED`, `PAID`, `REJECTED`, `CANCELLED`
- `approved_by TEXT`, `paid_by TEXT`
- `created_at TIMESTAMPTZ`

---

## Domain: Payroll (Manila)

### `manila_payroll_periods` (ensure_manila_payroll_tables, line ~43493)
Manila payroll periods (semi-monthly or monthly).
- `id UUID PK`
- `period_name TEXT`
- `start_date DATE`, `end_date DATE`
- `payment_date DATE`
- `status TEXT` — `OPEN`, `COMPUTED`, `APPROVED`, `PAID`, `PUBLISHED`
- `created_by TEXT`, `created_at TIMESTAMPTZ`

### `manila_payroll_runs`
Individual run per staff per period.
- `id UUID PK`
- `period_id UUID`
- `staff_name TEXT`
- `status TEXT`
- `gross_pay FLOAT`, `net_pay FLOAT`
- `sss_ee FLOAT`, `sss_er FLOAT`
- `philhealth_ee FLOAT`, `philhealth_er FLOAT`
- `pagibig_ee FLOAT`, `pagibig_er FLOAT`
- `bir_wtax FLOAT`
- `other_deductions FLOAT`
- `approved_by TEXT`, `paid_by TEXT`
- `created_at TIMESTAMPTZ`

### `manila_payroll_staff_profiles`
Manila staff payroll configuration.
- `id UUID PK`
- `staff_name TEXT UNIQUE`
- `daily_rate FLOAT`, `monthly_rate FLOAT`
- `employment_type TEXT` — `REGULAR`, `PROBATIONARY`, `CONTRACTUAL`
- `sil_days_per_year INT`
- `updated_by TEXT`, `updated_at TIMESTAMPTZ`

### `manila_payroll_adjustments`
Manual adjustments for Manila payroll runs.
- `id UUID PK`
- `run_id UUID`
- `adjustment_type TEXT`
- `amount FLOAT`, `description TEXT`
- `created_by TEXT`, `created_at TIMESTAMPTZ`

### `manila_payroll_gov_tables`
Government contribution tables (SSS, PhilHealth, Pag-IBIG, BIR).
- Stored as structured JSON per table_name

### `manila_payroll_holidays`
Philippine holidays for payroll computation.
- `id UUID PK`
- `holiday_date DATE`
- `holiday_name TEXT`
- `holiday_type TEXT` — `REGULAR`, `SPECIAL_NON_WORKING`, `SPECIAL_WORKING`
- `year INT`
- `created_at TIMESTAMPTZ`

### `manila_payroll_sil_balances`
Service Incentive Leave balances.
- `id UUID PK`
- `staff_name TEXT`
- `year INT`
- `sil_balance FLOAT`
- `sil_used FLOAT`
- `updated_at TIMESTAMPTZ`

---

## Domain: Inventory

### `inv_stock_ledger` (in `app/inventory_db.py`)
Inventory stock ledger entries.
- `id UUID PK`
- `city TEXT`, `branch_code TEXT`
- `item_code TEXT`, `item_name TEXT`
- `transaction_date DATE`
- `transaction_type TEXT` — `OPENING`, `PURCHASE`, `PRODUCTION`, `WASTE`, `ADJUSTMENT`, `CLOSING`
- `qty_change FLOAT`, `unit TEXT`
- `unit_cost FLOAT`, `total_cost FLOAT`
- `reference_id TEXT`
- `created_by TEXT`, `created_at TIMESTAMPTZ`

### `inv_production` (in `app/inventory_db.py`)
CK production records.
- `id UUID PK`
- `production_date DATE`
- `city TEXT`
- `item_code TEXT`, `item_name TEXT`
- `qty_produced FLOAT`, `unit TEXT`
- `produced_by TEXT`
- `status TEXT`
- `created_at TIMESTAMPTZ`

### `inv_count_sessions`
Inventory count sessions.
- `id UUID PK`
- `city TEXT`, `branch_code TEXT`
- `count_date DATE`
- `status TEXT`
- `counted_by TEXT`, `approved_by TEXT`
- `created_at TIMESTAMPTZ`

### `daily_inventory` (in `app/db_daily_inventory.py`)
Daily inventory check records.
- `id UUID PK`
- `check_date DATE`
- `city TEXT`, `branch_code TEXT`
- `item_name TEXT`
- `opening_qty FLOAT`, `closing_qty FLOAT`
- `sold_qty FLOAT`, `waste_qty FLOAT`
- `submitted_by TEXT`
- `created_at TIMESTAMPTZ`

---

## Domain: Finance / P&L

### `pl_data` (in `app/pl_data_db.py`)
P&L data entries.
- `id UUID PK`
- `market TEXT`
- `month_key TEXT`
- `category TEXT`, `bucket TEXT`, `line_item TEXT`
- `amount FLOAT`
- `source TEXT`
- `updated_by TEXT`, `updated_at TIMESTAMPTZ`

### `cost_items` (ensure_cost_tables, line ~22320)
Cost calculation items.
- `id UUID PK`
- `city TEXT`
- `item_name TEXT`, `category TEXT`
- `unit TEXT`, `unit_cost FLOAT`
- `currency TEXT`
- `updated_by TEXT`, `updated_at TIMESTAMPTZ`

---

## Domain: Travel Path

### `travel_path_checklists` (in `app/db_travel_path.py`)
Travel path inspection checklists.
- `id UUID PK`
- `city TEXT`, `branch_code TEXT`
- `check_date DATE`
- `checked_by TEXT`
- `items_json JSONB`
- `status TEXT`
- `created_at TIMESTAMPTZ`

---

## Domain: Disposal / Backup

### `disposal_reports` (ensure_disposal_tables, line ~40295)
Disposal event reports.
- `id UUID PK`
- `city TEXT`, `branch_code TEXT`
- `report_date DATE`
- `submitted_by TEXT`
- `total_cost FLOAT`
- `status TEXT`
- `created_at TIMESTAMPTZ`

### `disposal_lines`
Line items within disposal reports.
- `id UUID PK`
- `report_id UUID`
- `item_name TEXT`, `qty FLOAT`, `unit TEXT`, `unit_cost FLOAT`
- `reason TEXT`
- `created_at TIMESTAMPTZ`

### `backup_reports` (ensure_backup_tables, line ~40544)
Food backup (handover) reports.
- Similar structure to disposal_reports.

---

## Domain: AI Analytics

### `ai_analytics_snapshots` (ensure_ai_analytics_snapshot_tables, line ~36712)
AI analytics conversation snapshots.
- `id UUID PK`
- `staff_name TEXT`
- `city TEXT`
- `snapshot_title TEXT`
- `messages_json JSONB`
- `context_json JSONB`
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`

---

## Domain: QC Scoring

### `qc_scores` (ensure_qc_scoring_tables, line ~44090)
QC scoring records from evaluations.
- `id UUID PK`
- `city TEXT`, `store_code TEXT`
- `score_date DATE`
- `channel TEXT`
- `score FLOAT`, `grade TEXT`
- `details_json JSONB`
- `scored_by TEXT`
- `created_at TIMESTAMPTZ`

---

## Schema Migration Pattern

All schema changes are additive via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. The `ensure_*` functions use module-level boolean flags and threading locks to prevent double-execution. Failed schema migrations are logged but do not crash endpoints — the endpoint retries on next call.

Example:
```python
_MY_TABLE_READY = False
_MY_TABLE_LOCK = threading.Lock()

def ensure_my_table():
    global _MY_TABLE_READY
    if _MY_TABLE_READY:
        return
    with _MY_TABLE_LOCK:
        if _MY_TABLE_READY:
            return
        conn = get_conn()
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(CREATE_SQL)
            _MY_TABLE_READY = True
        finally:
            conn.close()
```
