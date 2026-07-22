# Sushi ZEN Workforce OS — Payroll System Overview

> Generated from codebase: July 2026  
> Covers: Manila (PHP) and Dubai (AED) payroll flows

---

## 1. System Architecture

The Payroll module is split into two distinct engines based on city:

| Dimension | Manila (PHP) | Dubai (AED) |
|---|---|---|
| Pay frequency | Semi-monthly (twice/month) | Monthly |
| Calculation engine | Full attendance-based (MonthlyPayDelta) | Simple salary aggregation |
| Statutory deductions | SSS, PhilHealth, Pag-IBIG, BIR (TRAIN) | None |
| OT / Night Diff | Auto-computed from DTR clock-in/out | Manual adjustment entry |
| Attendance source | `manila_attendance_daily` (DTR import) | OS Attendance (no deep integration) |
| Minimum wage check | Yes — PHP 695/day (NCR 2025) | No |
| Staff profiles | Extended (SSS#, TIN, PhilHealth ID, Pag-IBIG MID) | Basic (Bayzat ID) |
| Holiday rules | PH holiday calendar + day-type pay multipliers | Not computed |

---

## 2. Dubai / General Payroll

### Pay Cycle
- **Frequency:** Monthly
- Admin manually opens and closes cycles via `/admin/payroll`
- No fixed cutoff date — admin-controlled

### Pay Formula

```
gross_pay = basic_salary + accommodation + transportation + other_allowances
net_pay   = gross_pay + net_additions − net_deductions
```

### Salary Config Fields (per employee)
- `basic_salary`, `accommodation`, `transportation`, `other_allowances`
- `currency` (AED), `paid_via` (cash | bank), `bank_name`
- `branch_code`, `role_title`

### Adjustment Subtypes
**Additions:** Overtime, Prime Time Payment, Attendance Bonus, Commission  
**Deductions:** Tardiness, Absence, Early Leave, Damage, Loan Repayment, Loan Installment, Insurance, Uniform

### Payroll Run Flow
1. Admin opens monthly cycle (auto-creates if needed)
2. Add/edit adjustments per employee for the cycle
3. Review live-computed payroll table (gross/net per person)
4. Snapshot → Finalize run
5. Log payments (paid_at, paid_via, reference_no)
6. Publish payslips to staff **My Pay** portal
7. Close cycle

### Payslip Publishing
- Setting `published_at` on `payroll_run_records` makes the payslip visible to the employee at `/my-pay`
- Unpublish is available before the next cycle is opened

---

## 3. Manila Payroll

### Pay Periods (Semi-Monthly)
| Period | Date Range |
|---|---|
| 1st Half | 26th of previous month → 10th of current month |
| 2nd Half | 11th → 25th of current month |

- Statutory deductions (SSS, PhilHealth, Pag-IBIG, BIR) are applied **only on the 2nd half** run
- The 2nd half run references the 1st half's gross via `first_half_period_id` to compute the full monthly gross before computing government contributions

### Manila Pay Calculation — MonthlyPayDelta Engine

**Phase 1 — Base half-month pay**
```
period_basic  = monthly_rate / 2
daily_rate    = monthly_rate / salary_divisor   (default divisor = 26)
hourly_rate   = daily_rate / 8
```

**Phase 2 — Attendance deltas (per day in the period)**

| Day Type | Worked? | Pay Treatment |
|---|---|---|
| Ordinary Day | Yes | No delta (included in monthly base); increment days_worked |
| Ordinary Day | No (unpaid absent) | Deduct `daily_rate` |
| Ordinary Day | No (paid leave) | No deduction; SIL_EARNED item added if eligible |
| Regular Holiday | Yes + eligible | Add +100% premium (`hourly_rate × regular_hours`) |
| Regular Holiday + Rest Day | Yes | Add +160% premium |
| Regular Holiday | No + eligible | No deduction (included in monthly) |
| Regular Holiday | No + ineligible (prev workday absent) | Deduct `daily_rate` |
| Special Non-Working Holiday | Yes | Add +30% premium |
| Special Holiday + Rest Day | Yes | Add +50% premium |
| Special Non-Working Holiday | No | Deduct `daily_rate` (No Work, No Pay) |
| Rest Day | Yes | Add 130% full day (not in 26-day base) |
| Rest Day | No | No deduction |

**Overtime:**
```
OT pay = hourly_rate × base_day_multiplier × ot_multiplier × overtime_hours
```
- Raw hours = actual_time_out − actual_time_in − 60min meal break
- If raw hours > 8 → excess = overtime_hours
- Night OT (22:00–06:00): additional +10% Night Shift Differential

**Late / Undertime:**
```
deduction = hourly_rate × minutes / 60  (per day)
```

**Phase 3 — Manual adjustments**
- MANUAL_ADDITION and MANUAL_DEDUCTION from `manila_payroll_adjustments`
- Applied before statutory deductions

**Phase 4 — Statutory deductions (2nd half only)**

Uses `monthly_gross = first_half_gross + current_half_gross`.

| Contribution | Calculation | Note |
|---|---|---|
| SSS | Bracket lookup from `ph_sss_contribution_table` by monthly_gross | EE share deducted; ER share is reference only |
| PhilHealth | `monthly_gross × 2.5%` (simplified per GM directive) | Both EE and ER = same amount |
| Pag-IBIG | PHP 200.00 flat (per GM directive) | Both EE and ER = PHP 200 |
| BIR (WHT) | TRAIN Law brackets — see below | Monthly withholding tax |

**BIR Withholding Tax computation:**
```
taxable_monthly  = monthly_gross − (SSS_EE + PhilHealth_EE + PagIBIG_EE)
annual_taxable   = taxable_monthly × 12
annual_tax       = base_tax + excess_rate × (annual_taxable − excess_over)
monthly_wht      = annual_tax / 12
```

**BIR TRAIN Law Brackets (2023 / RR8-2018):**
| Annual Taxable Income | Tax |
|---|---|
| ₱0 – ₱250,000 | 0% |
| ₱250,001 – ₱400,000 | 15% of excess over ₱250,000 |
| ₱400,001 – ₱800,000 | ₱22,500 + 20% of excess over ₱400,000 |
| ₱800,001 – ₱2,000,000 | ₱102,500 + 25% of excess over ₱800,000 |
| ₱2,000,001 – ₱8,000,000 | ₱402,500 + 30% of excess over ₱2,000,000 |
| Over ₱8,000,000 | ₱2,202,500 + 35% of excess over ₱8,000,000 |

**Phase 5 — Final items**
- **SIL Accrual:** If `staff_sil_balances.is_eligible = TRUE` and paid_leave_flag days exist → `SIL_EARNED` earning item
- **13th Month Accrual:** `monthly_basic / 12` — recorded as reference item (not paid each period; not taxable)
- **Minimum Wage Check:** If `daily_rate < PHP 695` → admin alert displayed

**Final:**
```
net_pay = gross_pay − total_deductions
```

### Manila Payroll Run Flow
1. Create period (label, half, date range)
2. Import DTR via `/admin/payroll/manila/dtr-upload` (from Bayzat or OS data)
3. Compute payroll for all staff → engine runs all 5 phases
4. Review per-employee payslip; correct DTR if needed (triggers recompute)
5. Add manual adjustments if needed (recompute)
6. Approve run → Publish payslip to My Pay
7. Mark as Paid (bank transfer / GCash / cash)

---

## 4. Loans

### Lifecycle
```
pending → approved → active → completed
                  ↘ rejected
                  ↘ cancelled
```

### Loan Application to Cycle
- `POST /api/admin/payroll/loans/apply-to-cycle`
- Creates a `payroll_adjustments` row (type: `deduction`, subtype: `Loan Repayment`)
- Creates a `loan_repayments` installment record linked to that cycle
- Flows into `net_deductions` on the payroll table automatically

### Key Fields
- `amount`, `installment_amount`, `total_installments`, `remaining_installments`
- `start_cycle_id` — set when disbursed; controls when repayments begin
- `purpose`, `disbursed_at`, `disbursed_by`

---

## 5. Leave Salary Advance

- Independent of the payroll engine (no auto-deduction from cycle)
- Daily rate = `(basic + accommodation + transport + other) / 30` from salary config
- Status flow: `pending → approved → paid` (or `rejected / cancelled`)
- Reconciliation with payroll is manual

---

## 6. Staff Self-Service — My Pay Portal (`/my-pay`)

Staff can view:
- **Pay Slips** tab: All published payslips (printable)
- **Adjustments** tab: History of additions/deductions
- **Loans** tab: Loan progress bar, remaining balance, installment schedule
- **Leave Advance** tab: Request history and status

KPI cards shown:
- Last Net Pay, Loan Balance, Pending Adjustments, Last Pay Date

Only payslips with `published_at IS NOT NULL` are visible to staff.

---

## 7. Philippine Government Tables (Admin-Managed)

All tables are maintained at `/admin/payroll/manila/gov-tables` and can be updated via Excel/CSV upload.

| Table | Purpose |
|---|---|
| `ph_sss_contribution_table` | SSS bracket lookup by monthly salary credit |
| `ph_philhealth_table` | PhilHealth premium rate (currently simplified to 2.5%) |
| `ph_pagibig_contribution_rules` | Pag-IBIG contribution (currently flat PHP 200) |
| `ph_bir_brackets` | BIR TRAIN Law annual income tax brackets |
| `ph_pay_rate_rules` | Day-type pay multipliers (ordinary, holiday, rest day, OT, NSD) |
| `ph_holiday_calendar` | PH official holidays with type (regular / special non-working) |

---

## 8. Payslip Line Item Codes (Manila)

| Code | Type | Description |
|---|---|---|
| `BASIC_HALF` | earning | Half-month basic (monthly_rate / 2) |
| `ORDINARY_DAY_ADJUSTMENT` | earning/deduction | Delta for worked/absent ordinary days vs. base |
| `REGULAR_HOLIDAY_PREMIUM` | earning | Regular holiday premium pay |
| `SPECIAL_HOLIDAY_PREMIUM` | earning | Special non-working holiday premium pay |
| `REST_DAY_PREMIUM` | earning | Rest day work premium |
| `OVERTIME` | earning | OT pay (regular, holiday, rest day) |
| `NIGHT_SHIFT_DIFF` | earning | 10% NSD for hours between 22:00–06:00 |
| `LATE_DEDUCTION` | deduction | Late minutes deduction |
| `UNDERTIME_DEDUCTION` | deduction | Undertime deduction |
| `ABSENT_DEDUCTION` | deduction | Unpaid absence deduction |
| `SIL_EARNED` | earning | Service Incentive Leave usage |
| `SSS_EE` | deduction | SSS employee share |
| `PHILHEALTH_EE` | deduction | PhilHealth employee share |
| `PAGIBIG_EE` | deduction | Pag-IBIG employee share |
| `BIR_WHT` | deduction | BIR withholding tax |
| `SSS_ER` | employer_cost | SSS employer share (reference) |
| `PHILHEALTH_ER` | employer_cost | PhilHealth employer share (reference) |
| `PAGIBIG_ER` | employer_cost | Pag-IBIG employer share (reference) |
| `13TH_MONTH_ACCRUAL` | employer_cost | 13th month monthly accrual (reference) |
| `MANUAL_ADDITION` | earning | Admin manual addition |
| `MANUAL_DEDUCTION` | deduction | Admin manual deduction |

---

## 9. Key Settings

| Setting | Value | Notes |
|---|---|---|
| `salary_divisor` | 26 | Days used to derive daily rate from monthly rate |
| `meal_break_minutes` | 60 | Unpaid meal break deducted from total hours |
| `meal_break_paid` | false | Meal break is not paid |
| `minimum_wage_ncr` | 695 | PHP per day (NCR 2025 rate) |
| PhilHealth rate | 2.5% per side | Simplified per GM directive (not table-driven) |
| Pag-IBIG EE/ER | PHP 200 flat | Simplified per GM directive |

---

## 10. Frontend Pages Reference

| Route | Purpose |
|---|---|
| `/admin/payroll` | Dubai/General: cycles, salary configs, payroll table, publish controls |
| `/admin/payroll/adjustments` | Add/edit/delete additions & deductions per cycle |
| `/admin/payroll/loans` | Loan lifecycle management (all cities) |
| `/admin/payroll/leave-salary` | Leave salary advance requests |
| `/admin/payroll/transactions` | Payroll run snapshot, payment records, printable payslips |
| `/admin/payroll/manila` | Manila period list (semi-monthly) |
| `/admin/payroll/manila/[periodId]` | Period detail: compute, review, DTR correction, approve, publish |
| `/admin/payroll/manila/dtr-upload` | Import DTR from Bayzat / OS attendance data |
| `/admin/payroll/manila/gov-tables` | PH government tables (SSS, PhilHealth, Pag-IBIG, BIR, pay rules) |
| `/admin/payroll/manila/staff-profiles` | Manila staff payroll profiles (IDs, rates, bank info) |
| `/my-pay` | Staff self-service: payslips, adjustments, loans, leave advance |

---

## 11. Backend File Reference

| File | Content |
|---|---|
| `app/manila_payroll_engine.py` | Full 5-phase Manila pay computation engine |
| `app/main.py` | All API routes (`/api/admin/payroll/*`, `/api/admin/manila-payroll/*`) |
| `app/db.py` | All DB table definitions and query functions |
| `app/services/payroll_sync.py` | Bayzat Google Drive payroll data sync |
