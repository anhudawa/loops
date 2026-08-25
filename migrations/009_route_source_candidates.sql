-- Private acquisition catalogue for public route-source leads.
--
-- A source candidate is not a LOOPS route and is never proof that a named
-- person rode the exact geometry. This table intentionally stores no route
-- geometry and has no path into the public library. Promotion remains subject
-- to the existing first-party submission, evidence and independent-review
-- workflow.

BEGIN;

CREATE TABLE IF NOT EXISTS route_source_candidates (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL UNIQUE,
  rollout_phase SMALLINT NOT NULL CHECK (rollout_phase BETWEEN 1 AND 3),
  destination TEXT NOT NULL CHECK (destination IN ('Ireland', 'Girona', 'Mallorca')),
  source_name TEXT NOT NULL,
  source_page_url TEXT NOT NULL,
  source_track_url TEXT,
  source_external_id TEXT,
  route_name TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT,
  county TEXT,
  discipline TEXT NOT NULL DEFAULT 'road' CHECK (discipline IN ('road', 'gravel', 'mtb', 'unknown')),
  route_format TEXT NOT NULL DEFAULT 'unknown' CHECK (route_format IN ('loop', 'linear', 'out_and_back', 'unknown')),
  distance_km REAL CHECK (distance_km IS NULL OR distance_km > 0),
  elevation_gain_m REAL CHECK (elevation_gain_m IS NULL OR elevation_gain_m >= 0),
  source_evidence TEXT NOT NULL,
  source_claims_recorded BOOLEAN NOT NULL DEFAULT FALSE,
  source_author_name TEXT,
  source_recorded_at DATE,
  acquisition_target TEXT,
  next_action TEXT NOT NULL,
  candidate_status TEXT NOT NULL DEFAULT 'discovered'
    CHECK (candidate_status IN ('discovered', 'rider_nominated', 'submission_received', 'rejected', 'archived')),
  rider_status TEXT NOT NULL DEFAULT 'unconfirmed'
    CHECK (rider_status IN ('unconfirmed', 'nominated', 'confirmed')),
  rights_status TEXT NOT NULL DEFAULT 'not_requested'
    CHECK (rights_status IN ('not_requested', 'requested', 'granted', 'declined')),
  verification_status TEXT NOT NULL DEFAULT 'source_only'
    CHECK (verification_status IN ('source_only', 'rider_confirmed', 'evidence_received', 'independently_reviewed')),
  promoted_route_id TEXT REFERENCES routes(id) ON DELETE SET NULL,
  source_first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_checked_at TIMESTAMPTZ NOT NULL,
  import_run_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT route_source_candidates_promotion_gate CHECK (
    promoted_route_id IS NULL OR (
      candidate_status = 'submission_received'
      AND rider_status = 'confirmed'
      AND rights_status = 'granted'
      AND verification_status = 'independently_reviewed'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_route_source_candidates_destination_status
  ON route_source_candidates(destination, candidate_status, source_name);

CREATE INDEX IF NOT EXISTS idx_route_source_candidates_verification
  ON route_source_candidates(verification_status, rights_status, rider_status);

COMMIT;
