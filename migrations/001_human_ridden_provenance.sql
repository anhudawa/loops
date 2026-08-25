-- LOOPS commercial relaunch: human-ridden provenance foundation.
--
-- Apply before deploying code that reads publication_status or route_versions.
-- This migration deliberately quarantines the legacy catalogue: existing
-- routes become drafts and must be individually evidenced and reviewed.

BEGIN;

ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS publication_status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS human_ridden BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_ridden_at DATE,
  ADD COLUMN IF NOT EXISTS rights_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_version_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'routes_publication_status_check'
  ) THEN
    ALTER TABLE routes ADD CONSTRAINT routes_publication_status_check
      CHECK (publication_status IN (
        'draft', 'in_review', 'published', 'stale', 'quarantined', 'retired'
      ));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS route_versions (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  geometry_hash TEXT NOT NULL,
  coordinates TEXT NOT NULL,
  distance_km REAL NOT NULL,
  elevation_gain_m REAL NOT NULL,
  elevation_loss_m REAL NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(route_id, version_number),
  UNIQUE(route_id, geometry_hash)
);

CREATE TABLE IF NOT EXISTS ride_attestations (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  route_version_id TEXT NOT NULL REFERENCES route_versions(id) ON DELETE CASCADE,
  rider_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  rider_name TEXT NOT NULL,
  ridden_at DATE NOT NULL,
  evidence_type TEXT NOT NULL CHECK (
    evidence_type IN ('gpx', 'fit', 'tcx', 'ridewithgps', 'komoot', 'garmin', 'other')
  ),
  evidence_reference TEXT,
  file_format TEXT NOT NULL CHECK (file_format IN ('gpx', 'fit', 'tcx')),
  source_platform TEXT NOT NULL CHECK (
    source_platform IN ('garmin', 'ridewithgps', 'komoot', 'wahoo', 'strava_export', 'other')
  ),
  source_reference TEXT,
  evidence_file_hash TEXT NOT NULL,
  evidence_started_at TIMESTAMPTZ NOT NULL,
  evidence_ended_at TIMESTAMPTZ NOT NULL,
  evidence_point_count INTEGER NOT NULL CHECK (evidence_point_count > 0),
  evidence_timestamped_point_count INTEGER NOT NULL CHECK (
    evidence_timestamped_point_count > 0
    AND evidence_timestamped_point_count <= evidence_point_count
  ),
  rights_statement_version TEXT NOT NULL,
  rights_granted_at TIMESTAMPTZ NOT NULL,
  privacy_confirmed_at TIMESTAMPTZ NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    review_status IN ('pending', 'approved', 'rejected', 'revoked')
  ),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS route_reviews (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  route_version_id TEXT NOT NULL REFERENCES route_versions(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  evidence_checked BOOLEAN NOT NULL,
  rights_checked BOOLEAN NOT NULL,
  geometry_checked BOOLEAN NOT NULL,
  start_finish_checked BOOLEAN NOT NULL,
  road_suitability_checked BOOLEAN NOT NULL,
  description_checked BOOLEAN NOT NULL,
  review_notes TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'changes_requested', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS route_incidents (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  reported_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  condition_id TEXT REFERENCES conditions(id) ON DELETE SET NULL,
  severity TEXT NOT NULL CHECK (severity IN ('review', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  summary TEXT NOT NULL,
  resolution_notes TEXT,
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS route_publication_events (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  route_version_id TEXT REFERENCES route_versions(id) ON DELETE SET NULL,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS route_segment_assessments (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  route_version_id TEXT NOT NULL REFERENCES route_versions(id) ON DELETE CASCADE,
  ride_attestation_id TEXT NOT NULL REFERENCES ride_attestations(id) ON DELETE RESTRICT,
  assessor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assessor_name TEXT NOT NULL,
  assessed_at DATE NOT NULL,
  assessment_statement_version TEXT NOT NULL,
  confirmed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  confirmed_at TIMESTAMPTZ NOT NULL,
  start_index INTEGER NOT NULL CHECK (start_index >= 0),
  end_index INTEGER NOT NULL CHECK (end_index > start_index),
  direction TEXT NOT NULL CHECK (direction IN ('forward', 'reverse')),
  session_type TEXT NOT NULL CHECK (
    session_type IN ('endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2', 'anaerobic', 'sprint')
  ),
  min_effort_seconds INTEGER NOT NULL CHECK (min_effort_seconds >= 15),
  max_effort_seconds INTEGER NOT NULL CHECK (max_effort_seconds >= min_effort_seconds),
  length_km REAL NOT NULL CHECK (length_km > 0),
  avg_gradient_pct REAL NOT NULL,
  max_gradient_pct REAL NOT NULL,
  gradient_variance REAL NOT NULL CHECK (gradient_variance >= 0),
  surface_rating TEXT NOT NULL CHECK (surface_rating IN ('good', 'mixed', 'poor')),
  traffic_rating TEXT NOT NULL CHECK (traffic_rating IN ('low', 'moderate', 'high')),
  sightlines_rating TEXT NOT NULL CHECK (sightlines_rating IN ('clear', 'mixed', 'poor')),
  junction_count INTEGER NOT NULL CHECK (junction_count >= 0),
  entry_notes TEXT NOT NULL,
  recovery_notes TEXT NOT NULL,
  runout_notes TEXT NOT NULL,
  hazards_notes TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    review_status IN ('pending', 'approved', 'rejected', 'revoked')
  ),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routes_publication_status
  ON routes(publication_status);
CREATE INDEX IF NOT EXISTS idx_routes_public_launch
  ON routes(country, discipline, publication_status);
CREATE INDEX IF NOT EXISTS idx_route_versions_route_id
  ON route_versions(route_id);
CREATE INDEX IF NOT EXISTS idx_ride_attestations_route_id
  ON ride_attestations(route_id);
CREATE INDEX IF NOT EXISTS idx_ride_attestations_review_status
  ON ride_attestations(review_status);
CREATE INDEX IF NOT EXISTS idx_route_reviews_route_version_id
  ON route_reviews(route_version_id);
CREATE INDEX IF NOT EXISTS idx_route_incidents_open
  ON route_incidents(route_id, status);
CREATE INDEX IF NOT EXISTS idx_route_publication_events_route_id
  ON route_publication_events(route_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_route_segment_assessments_match
  ON route_segment_assessments(route_id, route_version_id, session_type, review_status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'routes_current_version_id_fkey'
  ) THEN
    ALTER TABLE routes ADD CONSTRAINT routes_current_version_id_fkey
      FOREIGN KEY (current_version_id) REFERENCES route_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Legacy verified flags and ratings are not ride evidence. The old catalogue
-- stays available to administrators for review, but nothing is public merely
-- because it previously carried a verified boolean.
UPDATE routes
SET publication_status = 'draft',
    human_ridden = FALSE,
    last_ridden_at = NULL,
    rights_confirmed_at = NULL,
    current_version_id = NULL;

COMMIT;
