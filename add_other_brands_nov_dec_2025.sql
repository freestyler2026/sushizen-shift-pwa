-- =================================================================
-- SUSHI ZEN DUBAI — Add RamenZEN + All Veggie Sushi for Nov & Dec 2025
-- Source: UrbanPiper Atlas "Other Brands" view
--   Nov: Gross=459,301 / Disc=125,720 / Charges=22,389 / Net=311,193
--   Dec: Gross=337,364 / Disc=100,363 / Charges=15,496 / Net=221,505
-- Brand split: RamenZEN 97.33% (Nov) / 97.60% (Dec), AVS = remainder
-- SushiZEN rows already in DB — this script only adds the other brands
-- =================================================================

BEGIN;

-- Safety: remove any existing non-SushiZEN rows for Nov/Dec 2025 Dubai
DELETE FROM pos_revenue_location_daily
WHERE city = 'dubai'
  AND work_date BETWEEN '2025-11-01' AND '2025-12-31'
  AND brand_name != 'SushiZEN';

-- ── November 2025 — RamenZEN (97.33%) ─────────────────────────────
-- Monthly: net=302,887.84  gross=447,043.12  disc=122,364.77  chg=21,791.48
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
    0.00, 0.00, 0, 'atlas_correction_other_brands', 'atlas_manual_override'
FROM generate_series('2025-11-01'::date, '2025-11-30'::date, '1 day') d;

-- ── November 2025 — All Veggie Sushi (2.67%) ──────────────────────
-- Monthly: net=8,305.16  gross=12,257.88  disc=3,355.23  chg=597.52
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
    0.00, 0.00, 0, 'atlas_correction_other_brands', 'atlas_manual_override'
FROM generate_series('2025-11-01'::date, '2025-11-30'::date, '1 day') d;

-- ── December 2025 — RamenZEN (97.60%) ─────────────────────────────
-- Monthly: net=216,188.88  gross=329,267.26  disc=97,954.29  chg=15,124.10
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
    0.00, 0.00, 0, 'atlas_correction_other_brands', 'atlas_manual_override'
FROM generate_series('2025-12-01'::date, '2025-12-31'::date, '1 day') d;

-- ── December 2025 — All Veggie Sushi (2.40%) ──────────────────────
-- Monthly: net=5,316.12  gross=8,096.74  disc=2,408.71  chg=371.90
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
    0.00, 0.00, 0, 'atlas_correction_other_brands', 'atlas_manual_override'
FROM generate_series('2025-12-01'::date, '2025-12-31'::date, '1 day') d;

-- ── Verify brand breakdown ─────────────────────────────────────────
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

-- Grand total per month (what the Analytics Summary will show)
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
