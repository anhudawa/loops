/**
 * Keep the KPI definitions in one place so the production query and the
 * disposable PostgreSQL rehearsal exercise the exact same measurement rules.
 */
export function buildIrelandBetaMetricsQuery(publicRoutePredicate: string): string {
  return `WITH
       window_events AS (
         SELECT e.*
         FROM beta_product_events e
         JOIN users u ON u.id = e.user_id
         WHERE e.event_date >= CURRENT_DATE - INTERVAL '27 days'
           AND u.role = 'user'
       ),
       view_pairs AS (
         SELECT DISTINCT user_id, route_id
         FROM window_events
         WHERE event_type = 'route_view'
       ),
       action_pairs AS (
         SELECT DISTINCT user_id, route_id
         FROM window_events
         WHERE event_type IN ('route_saved', 'gpx_download', 'device_transfer')
       ),
       converted_pairs AS (
         SELECT v.user_id, v.route_id
         FROM view_pairs v
         JOIN action_pairs a USING (user_id, route_id)
       ),
       eligible_plans AS (
         SELECT rp.*
         FROM ride_plans rp
         JOIN users u ON u.id = rp.user_id
         WHERE u.role = 'user'
           AND rp.status <> 'cancelled'
           AND (
             rp.completed_at IS NOT NULL
             OR rp.planned_at <= NOW() - INTERVAL '14 days'
           )
       ),
       first_events AS (
         SELECT e.user_id, MIN(e.occurred_at) AS first_at
         FROM beta_product_events e
         JOIN users u ON u.id = e.user_id
         WHERE u.role = 'user'
         GROUP BY e.user_id
       ),
       retention_cohort AS (
         SELECT user_id, first_at
         FROM first_events
         WHERE first_at <= NOW() - INTERVAL '28 days'
         ORDER BY first_at
         LIMIT 100
       ),
       retained AS (
         SELECT DISTINCT c.user_id
         FROM retention_cohort c
         JOIN beta_product_events e ON e.user_id = c.user_id
         WHERE e.occurred_at >= c.first_at + INTERVAL '21 days'
           AND e.occurred_at < c.first_at + INTERVAL '29 days'
       )
     SELECT
       (SELECT COUNT(*) FROM routes r WHERE ${publicRoutePredicate}) AS public_routes,
       (SELECT COUNT(DISTINCT user_id) FROM window_events) AS active_riders_28d,
       (SELECT COUNT(*) FROM view_pairs) AS route_views_28d,
       (SELECT COUNT(*) FROM converted_pairs) AS action_conversions_28d,
       (SELECT COUNT(*) FROM eligible_plans) AS eligible_ride_plans,
       (
         SELECT COUNT(*) FROM eligible_plans
         WHERE completed_at IS NOT NULL
           AND completed_at <= planned_at + INTERVAL '14 days'
       ) AS confirmed_within_14_days,
       (SELECT COUNT(*) FROM retention_cohort) AS retention_cohort_size,
       (SELECT COUNT(*) FROM retained) AS retained_at_four_weeks`;
}

export function ratePercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}
