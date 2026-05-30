-- =================================================================
-- SUSHI ZEN DUBAI — Final Correction: Nov & Dec 2025 (3 brands)
-- SushiZEN  : Atlas SushiZEN-only (screenshots 1 & 2 - larger numbers)
-- RamenZEN  : Atlas "other brands" × 97.33%/97.60% (P&L proportion)
-- All Veggie: Atlas "other brands" remainder
-- Expected totals: Nov net=1,853,466 / Dec net=1,693,504
-- =================================================================

BEGIN;

-- Full reset: delete ALL Dubai Nov/Dec 2025 rows
DELETE FROM pos_revenue_location_daily
WHERE city = 'dubai'
  AND work_date BETWEEN '2025-11-01' AND '2025-12-31';

-- ── November 2025 — SushiZEN (Atlas SushiZEN-only: Net=1,542,273) ──
INSERT INTO pos_revenue_location_daily (
    work_date, city, brand_name, branch_code, branch_name, aggregator_name,
    order_count_completed, order_count_received,
    gross_revenue, net_revenue, discounts, charges, taxes,
    lost_revenue, lost_order_count, source_file_name, source_drive_file_id
)
SELECT d::date, 'dubai', 'SushiZEN', 'ALL', 'ALL_LOCATIONS', 'ALL_PLATFORMS',
    547, 547,
    CASE WHEN d::date = '2025-11-30' THEN  83022.13 ELSE  83022.03 END,
    CASE WHEN d::date = '2025-11-30' THEN  51409.10 ELSE  51409.10 END,
    CASE WHEN d::date = '2025-11-30' THEN  28367.76 ELSE  28367.56 END,
    CASE WHEN d::date = '2025-11-30' THEN   3245.56 ELSE   3245.36 END,
    0.00, 0.00, 0, 'atlas_sushizen_only', 'atlas_manual_override'
FROM generate_series('2025-11-01'::date, '2025-11-30'::date, '1 day') d;

-- ── November 2025 — RamenZEN (97.33% of other-brands Atlas) ────────
INSERT INTO pos_revenue_location_daily (
    work_date, city, brand_name, branch_code, branch_name, aggregator_name,
    order_count_completed, order_count_received,
    gross_revenue, net_revenue, discounts, charges, taxes,
    lost_revenue, lost_order_count, source_file_name, source_drive_file_id
)
SELECT d::date, 'dubai', 'RamenZEN', 'ALL', 'ALL_LOCATIONS', 'ALL_PLATFORMS',
    126, 126,
    CASE WHEN d::date = '2025-11-30' THEN 14901.65 ELSE 14901.43 END,
    CASE WHEN d::date = '2025-11-30' THEN 10096.30 ELSE 10096.26 END,
    CASE WHEN d::date = '2025-11-30' THEN  4078.99 ELSE  4078.82 END,
    CASE WHEN d::date = '2025-11-30' THEN   726.46 ELSE   726.38 END,
    0.00, 0.00, 0, 'atlas_other_brands', 'atlas_manual_override'
FROM generate_series('2025-11-01'::date, '2025-11-30'::date, '1 day') d;

-- ── November 2025 — All Veggie Sushi (2.67% of other-brands Atlas) ─
INSERT INTO pos_revenue_location_daily (
    work_date, city, brand_name, branch_code, branch_name, aggregator_name,
    order_count_completed, order_count_received,
    gross_revenue, net_revenue, discounts, charges, taxes,
    lost_revenue, lost_order_count, source_file_name, source_drive_file_id
)
SELECT d::date, 'dubai', 'All Veggie Sushi', 'ALL', 'ALL_LOCATIONS', 'ALL_PLATFORMS',
    4, 4,
    CASE WHEN d::date = '2025-11-30' THEN 408.77 ELSE 408.59 END,
    CASE WHEN d::date = '2025-11-30' THEN 277.09 ELSE 276.83 END,
    CASE WHEN d::date = '2025-11-30' THEN 111.87 ELSE 111.84 END,
    CASE WHEN d::date = '2025-11-30' THEN  20.13 ELSE  19.91 END,
    0.00, 0.00, 0, 'atlas_other_brands', 'atlas_manual_override'
FROM generate_series('2025-11-01'::date, '2025-11-30'::date, '1 day') d;

-- ── December 2025 — SushiZEN (Atlas SushiZEN-only: Net=1,471,999) ──
INSERT INTO pos_revenue_location_daily (
    work_date, city, brand_name, branch_code, branch_name, aggregator_name,
    order_count_completed, order_count_received,
    gross_revenue, net_revenue, discounts, charges, taxes,
    lost_revenue, lost_order_count, source_file_name, source_drive_file_id
)
SELECT d::date, 'dubai', 'SushiZEN', 'ALL', 'ALL_LOCATIONS', 'ALL_PLATFORMS',
    519, 519,
    CASE WHEN d::date = '2025-12-31' THEN  75770.40 ELSE  75770.12 END,
    CASE WHEN d::date = '2025-12-31' THEN  47484.10 ELSE  47483.83 END,
    CASE WHEN d::date = '2025-12-31' THEN  25624.60 ELSE  25624.58 END,
    CASE WHEN d::date = '2025-12-31' THEN   2662.00 ELSE   2661.70 END,
    0.00, 0.00, 0, 'atlas_sushizen_only', 'atlas_manual_override'
FROM generate_series('2025-12-01'::date, '2025-12-31'::date, '1 day') d;

-- ── December 2025 — RamenZEN (97.60% of other-brands Atlas) ────────
INSERT INTO pos_revenue_location_daily (
    work_date, city, brand_name, branch_code, branch_name, aggregator_name,
    order_count_completed, order_count_received,
    gross_revenue, net_revenue, discounts, charges, taxes,
    lost_revenue, lost_order_count, source_file_name, source_drive_file_id
)
SELECT d::date, 'dubai', 'RamenZEN', 'ALL', 'ALL_LOCATIONS', 'ALL_PLATFORMS',
    88, 88,
    CASE WHEN d::date = '2025-12-31' THEN 10621.66 ELSE 10621.52 END,
    CASE WHEN d::date = '2025-12-31' THEN  6973.98 ELSE  6973.83 END,
    CASE WHEN d::date = '2025-12-31' THEN  3159.99 ELSE  3159.81 END,
    CASE WHEN d::date = '2025-12-31' THEN   488.00 ELSE   487.87 END,
    0.00, 0.00, 0, 'atlas_other_brands', 'atlas_manual_override'
FROM generate_series('2025-12-01'::date, '2025-12-31'::date, '1 day') d;

-- ── December 2025 — All Veggie Sushi (2.40% of other-brands Atlas) ─
INSERT INTO pos_revenue_location_daily (
    work_date, city, brand_name, branch_code, branch_name, aggregator_name,
    order_count_completed, order_count_received,
    gross_revenue, net_revenue, discounts, charges, taxes,
    lost_revenue, lost_order_count, source_file_name, source_drive_file_id
)
SELECT d::date, 'dubai', 'All Veggie Sushi', 'ALL', 'ALL_LOCATIONS', 'ALL_PLATFORMS',
    2, 2,
    CASE WHEN d::date = '2025-12-31' THEN 261.34 ELSE 261.18 END,
    CASE WHEN d::date = '2025-12-31' THEN 171.72 ELSE 171.48 END,
    CASE WHEN d::date = '2025-12-31' THEN  77.71 ELSE  77.70 END,
    CASE WHEN d::date = '2025-12-31' THEN  12.20 ELSE  11.99 END,
    0.00, 0.00, 0, 'atlas_other_brands', 'atlas_manual_override'
FROM generate_series('2025-12-01'::date, '2025-12-31'::date, '1 day') d;

-- ── Verify per-brand ───────────────────────────────────────────────
SELECT
    to_char(work_date, 'YYYY-MM') AS month,
    brand_name,
    COUNT(*)                          AS days,
    SUM(net_revenue)::numeric(14,2)   AS net_total,
    SUM(gross_revenue)::numeric(14,2) AS gross_total
FROM pos_revenue_location_daily
WHERE city = 'dubai'
  AND work_date BETWEEN '2025-11-01' AND '2025-12-31'
GROUP BY 1, 2
ORDER BY 1, 2;

-- ── Grand total (what OS Summary shows) ───────────────────────────
SELECT
    to_char(work_date, 'YYYY-MM') AS month,
    SUM(net_revenue)::numeric(14,2)   AS total_net,
    SUM(gross_revenue)::numeric(14,2) AS total_gross
FROM pos_revenue_location_daily
WHERE city = 'dubai'
  AND work_date BETWEEN '2025-11-01' AND '2025-12-31'
GROUP BY 1
ORDER BY 1;

COMMIT;
