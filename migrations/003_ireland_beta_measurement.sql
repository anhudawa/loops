-- LOOPS Ireland beta: privacy-minimised product measurement.
--
-- Events are limited to signed-in, route-level product actions. This schema
-- deliberately has no IP address, user-agent, device fingerprint, precise
-- search location, free-form metadata or third-party analytics identifier.

BEGIN;

CREATE TABLE IF NOT EXISTS beta_product_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  route_version_id TEXT NOT NULL REFERENCES route_versions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'route_view',
      'route_saved',
      'gpx_download',
      'device_transfer',
      'route_planned',
      'ride_confirmed'
    )
  ),
  event_date DATE NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, route_id, event_type, event_date)
);

CREATE TABLE IF NOT EXISTS ride_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  route_version_id TEXT NOT NULL REFERENCES route_versions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (
    status IN ('planned', 'completed', 'cancelled')
  ),
  planned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  CHECK (
    (status = 'planned' AND completed_at IS NULL AND cancelled_at IS NULL)
    OR (
      status = 'completed'
      AND completed_at IS NOT NULL
      AND completed_at >= planned_at
      AND cancelled_at IS NULL
    )
    OR (
      status = 'cancelled'
      AND completed_at IS NULL
      AND cancelled_at IS NOT NULL
      AND cancelled_at >= planned_at
    )
  )
);

-- A rider can plan the same exact loop again after completing or cancelling a
-- previous plan, but cannot create duplicate open plans through repeat clicks.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ride_plans_one_open_per_route
  ON ride_plans(user_id, route_id)
  WHERE status = 'planned';

CREATE INDEX IF NOT EXISTS idx_beta_product_events_date
  ON beta_product_events(event_date, event_type);
CREATE INDEX IF NOT EXISTS idx_beta_product_events_user_date
  ON beta_product_events(user_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_ride_plans_measurement
  ON ride_plans(planned_at, status, completed_at);

COMMIT;
