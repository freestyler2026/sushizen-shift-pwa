-- =================================================================
-- SUSHI ZEN DUBAI — Atlas Revenue Correction
-- Nov & Dec 2025: Replace DB data with UrbanPiper Atlas verified totals
--
-- Source: UrbanPiper Atlas (RAMENZEN RESTA..., All Locations, All Platforms)
--   Nov 2025: Gross=2,490,661 | Charges=97,361 | Discounts=851,027 | Net=1,542,273 AED
--   Dec 2025: Gross=2,348,874 | Charges=82,513 | Discounts=794,362 | Net=1,471,999 AED
--
-- Run with:
--   heroku pg:psql -a sushizen-shift-app < fix_nov_dec_2025_atlas.sql
-- =================================================================

BEGIN;

-- ── Step 1: Delete existing Dubai Nov/Dec 2025 data ──────────────
DELETE FROM pos_revenue_location_daily
WHERE city = 'dubai'
  AND work_date >= '2025-11-01'
  AND work_date <= '2025-12-31';

-- Show how many rows were removed
DO $$
DECLARE v_deleted int;
BEGIN
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted % rows for Dubai Nov-Dec 2025', v_deleted;
END $$;

-- ── Step 2: Insert November 2025 (30 days) ───────────────────────
-- Totals: Net=1,542,273 | Gross=2,490,661 | Charges=97,361 | Discounts=851,027
-- Daily distribution (29 equal days + last day gets remainder)
INSERT INTO pos_revenue_location_daily (
    work_date, city, brand_name, branch_code, branch_name, aggregator_name,
    order_count_completed, order_count_received,
    gross_revenue, net_revenue, discounts, charges, taxes,
    lost_revenue, lost_order_count, source_file_name, source_drive_file_id
)
SELECT
    d::date,
    'dubai',
    'SushiZEN',
    'ALL',
    'ALL_LOCATIONS',
    'ALL_PLATFORMS',
    643,   -- ~643 orders/day (Atlas total ~19,290 / 30 days, 80 AED avg)
    643,
    CASE WHEN d::date = '2025-11-30' THEN 83022.13 ELSE 83022.03 END,
    51409.10,
    CASE WHEN d::date = '2025-11-30' THEN 28367.76 ELSE 28367.56 END,
    CASE WHEN d::date = '2025-11-30' THEN  3245.56 ELSE  3245.36 END,
    0.00,
    0.00, 0,
    'atlas_correction_2025_11',
    'atlas_manual_override'
FROM generate_series('2025-11-01'::date, '2025-11-30'::date, '1 day') d;

-- ── Step 3: Insert December 2025 (31 days) ───────────────────────
-- Totals: Net=1,471,999 | Gross=2,348,874 | Charges=82,513 | Discounts=794,362
INSERT INTO pos_revenue_location_daily (
    work_date, city, brand_name, branch_code, branch_name, aggregator_name,
    order_count_completed, order_count_received,
    gross_revenue, net_revenue, discounts, charges, taxes,
    lost_revenue, lost_order_count, source_file_name, source_drive_file_id
)
SELECT
    d::date,
    'dubai',
    'SushiZEN',
    'ALL',
    'ALL_LOCATIONS',
    'ALL_PLATFORMS',
    594,   -- ~594 orders/day (Atlas total ~18,400 / 31 days, 80 AED avg)
    594,
    CASE WHEN d::date = '2025-12-31' THEN 75770.40 ELSE 75770.12 END,
    CASE WHEN d::date = '2025-12-31' THEN 47484.10 ELSE 47483.83 END,
    CASE WHEN d::date = '2025-12-31' THEN 25624.60 ELSE 25624.58 END,
    CASE WHEN d::date = '2025-12-31' THEN  2662.00 ELSE  2661.70 END,
    0.00,
    0.00, 0,
    'atlas_correction_2025_12',
    'atlas_manual_override'
FROM generate_series('2025-12-01'::date, '2025-12-31'::date, '1 day') d;

-- ── Step 4: Verify results ────────────────────────────────────────
SELECT
    to_char(work_date, 'YYYY-MM') AS month,
    COUNT(*) AS days,
    SUM(net_revenue)::numeric(14,2) AS net_total,
    SUM(gross_revenue)::numeric(14,2) AS gross_total,
    SUM(discounts)::numeric(14,2) AS discounts_total,
    SUM(charges)::numeric(14,2) AS charges_total,
    ROUND(SUM(order_count_received) / COUNT(*)::numeric, 0) AS avg_orders_per_day
FROM pos_revenue_location_daily
WHERE city = 'dubai'
  AND work_date BETWEEN '2025-11-01' AND '2025-12-31'
GROUP BY 1
ORDER BY 1;

-- Expected:
-- 2025-11 | 30 days | net=1,542,273 | gross=2,490,661 | disc=851,027 | chg=97,361 | ~643 orders/day
-- 2025-12 | 31 days | net=1,471,999 | gross=2,348,874 | disc=794,362 | chg=82,513 | ~594 orders/day

COMMIT;
