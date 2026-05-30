-- =================================================================
-- SUSHI ZEN DUBAI — Atlas Revenue Correction v2 (Brand Split)
-- Nov & Dec 2025: SushiZEN / RamenZEN / All Veggie Sushi
-- Source: UrbanPiper Atlas totals × P&L brand proportions
-- =================================================================

BEGIN;

DELETE FROM pos_revenue_location_daily
WHERE city = 'dubai'
  AND work_date BETWEEN '2025-11-01' AND '2025-12-31';

-- ── November 2025 — SushiZEN (85.2%) ──────────────────────────
INSERT INTO pos_revenue_location_daily (
    work_date, city, brand_name, branch_code, branch_name, aggregator_name,
    order_count_completed, order_count_received,
    gross_revenue, net_revenue, discounts, charges, taxes,
    lost_revenue, lost_order_count, source_file_name, source_drive_file_id
)
SELECT d::date, 'dubai', 'SushiZEN', 'ALL', 'ALL_LOCATIONS', 'ALL_PLATFORMS',
    547, 547,
    CASE WHEN d::date='2025-11-30' THEN 70703.89 ELSE 70703.70 END,
    CASE WHEN d::date='2025-11-30' THEN 43781.50 ELSE 43781.31 END,
    CASE WHEN d::date='2025-11-30' THEN 24158.61 ELSE 24158.55 END,
    CASE WHEN d::date='2025-11-30' THEN  2764.07 ELSE  2763.83 END,
    0.00, 0.00, 0, 'atlas_correction', 'atlas_manual_override'
FROM generate_series('2025-11-01'::date, '2025-11-30'::date, '1 day') d;

-- ── November 2025 — RamenZEN (14.4%) ──────────────────────────
INSERT INTO pos_revenue_location_daily (
    work_date, city, brand_name, branch_code, branch_name, aggregator_name,
    order_count_completed, order_count_received,
    gross_revenue, net_revenue, discounts, charges, taxes,
    lost_revenue, lost_order_count, source_file_name, source_drive_file_id
)
SELECT d::date, 'dubai', 'RamenZEN', 'ALL', 'ALL_LOCATIONS', 'ALL_PLATFORMS',
    93, 93,
    CASE WHEN d::date='2025-11-30' THEN 11975.23 ELSE 11974.98 END,
    CASE WHEN d::date='2025-11-30' THEN  7415.20 ELSE  7415.18 END,
    CASE WHEN d::date='2025-11-30' THEN  4091.71 ELSE  4091.70 END,
    CASE WHEN d::date='2025-11-30' THEN   468.32 ELSE   468.10 END,
    0.00, 0.00, 0, 'atlas_correction', 'atlas_manual_override'
FROM generate_series('2025-11-01'::date, '2025-11-30'::date, '1 day') d;

-- ── November 2025 — All Veggie Sushi (0.4%) ───────────────────
INSERT INTO pos_revenue_location_daily (
    work_date, city, brand_name, branch_code, branch_name, aggregator_name,
    order_count_completed, order_count_received,
    gross_revenue, net_revenue, discounts, charges, taxes,
    lost_revenue, lost_order_count, source_file_name, source_drive_file_id
)
SELECT d::date, 'dubai', 'All Veggie Sushi', 'ALL', 'ALL_LOCATIONS', 'ALL_PLATFORMS',
    3, 3,
    CASE WHEN d::date='2025-11-30' THEN 343.59 ELSE 343.33 END,
    CASE WHEN d::date='2025-11-30' THEN 212.69 ELSE 212.60 END,
    CASE WHEN d::date='2025-11-30' THEN 117.44 ELSE 117.31 END,
    CASE WHEN d::date='2025-11-30' THEN  13.46 ELSE  13.42 END,
    0.00, 0.00, 0, 'atlas_correction', 'atlas_manual_override'
FROM generate_series('2025-11-01'::date, '2025-11-30'::date, '1 day') d;

-- ── December 2025 — SushiZEN (87.4%) ──────────────────────────
INSERT INTO pos_revenue_location_daily (
    work_date, city, brand_name, branch_code, branch_name, aggregator_name,
    order_count_completed, order_count_received,
    gross_revenue, net_revenue, discounts, charges, taxes,
    lost_revenue, lost_order_count, source_file_name, source_drive_file_id
)
SELECT d::date, 'dubai', 'SushiZEN', 'ALL', 'ALL_LOCATIONS', 'ALL_PLATFORMS',
    519, 519,
    CASE WHEN d::date='2025-12-31' THEN 66257.81 ELSE 66257.73 END,
    CASE WHEN d::date='2025-12-31' THEN 41522.68 ELSE 41522.58 END,
    CASE WHEN d::date='2025-12-31' THEN 22407.85 ELSE 22407.59 END,
    CASE WHEN d::date='2025-12-31' THEN  2327.58 ELSE  2327.55 END,
    0.00, 0.00, 0, 'atlas_correction', 'atlas_manual_override'
FROM generate_series('2025-12-01'::date, '2025-12-31'::date, '1 day') d;

-- ── December 2025 — RamenZEN (12.2%) ──────────────────────────
INSERT INTO pos_revenue_location_daily (
    work_date, city, brand_name, branch_code, branch_name, aggregator_name,
    order_count_completed, order_count_received,
    gross_revenue, net_revenue, discounts, charges, taxes,
    lost_revenue, lost_order_count, source_file_name, source_drive_file_id
)
SELECT d::date, 'dubai', 'RamenZEN', 'ALL', 'ALL_LOCATIONS', 'ALL_PLATFORMS',
    73, 73,
    CASE WHEN d::date='2025-12-31' THEN 9261.28 ELSE 9261.23 END,
    CASE WHEN d::date='2025-12-31' THEN 5804.00 ELSE 5803.85 END,
    CASE WHEN d::date='2025-12-31' THEN 3132.08 ELSE 3132.04 END,
    CASE WHEN d::date='2025-12-31' THEN  325.50 ELSE  325.33 END,
    0.00, 0.00, 0, 'atlas_correction', 'atlas_manual_override'
FROM generate_series('2025-12-01'::date, '2025-12-31'::date, '1 day') d;

-- ── December 2025 — All Veggie Sushi (0.3%) ───────────────────
INSERT INTO pos_revenue_location_daily (
    work_date, city, brand_name, branch_code, branch_name, aggregator_name,
    order_count_completed, order_count_received,
    gross_revenue, net_revenue, discounts, charges, taxes,
    lost_revenue, lost_order_count, source_file_name, source_drive_file_id
)
SELECT d::date, 'dubai', 'All Veggie Sushi', 'ALL', 'ALL_LOCATIONS', 'ALL_PLATFORMS',
    2, 2,
    CASE WHEN d::date='2025-12-31' THEN 251.31 ELSE 251.16 END,
    CASE WHEN d::date='2025-12-31' THEN 157.42 ELSE 157.40 END,
    CASE WHEN d::date='2025-12-31' THEN  84.97 ELSE  84.94 END,
    CASE WHEN d::date='2025-12-31' THEN   8.92 ELSE   8.82 END,
    0.00, 0.00, 0, 'atlas_correction', 'atlas_manual_override'
FROM generate_series('2025-12-01'::date, '2025-12-31'::date, '1 day') d;

-- ── Verify brand breakdown ─────────────────────────────────────
SELECT
    to_char(work_date,'YYYY-MM') AS month,
    brand_name,
    COUNT(*) AS days,
    SUM(net_revenue)::numeric(14,2) AS net_total
FROM pos_revenue_location_daily
WHERE city='dubai' AND work_date BETWEEN '2025-11-01' AND '2025-12-31'
GROUP BY 1, 2 ORDER BY 1, 2;

-- Grand total per month
SELECT to_char(work_date,'YYYY-MM') AS month,
       SUM(net_revenue)::numeric(14,2) AS total_net,
       SUM(gross_revenue)::numeric(14,2) AS total_gross
FROM pos_revenue_location_daily
WHERE city='dubai' AND work_date BETWEEN '2025-11-01' AND '2025-12-31'
GROUP BY 1 ORDER BY 1;

COMMIT;
