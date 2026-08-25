-- Broaden the private acquisition queue beyond the first three launch regions
-- and distinguish source checking from LOOPS route verification.

BEGIN;

ALTER TABLE route_source_candidates
  DROP CONSTRAINT IF EXISTS route_source_candidates_destination_check;

ALTER TABLE route_source_candidates
  DROP CONSTRAINT IF EXISTS route_source_candidates_rollout_phase_check;

ALTER TABLE route_source_candidates
  ADD CONSTRAINT route_source_candidates_destination_nonempty
    CHECK (char_length(trim(destination)) BETWEEN 2 AND 100),
  ADD CONSTRAINT route_source_candidates_rollout_phase_check
    CHECK (rollout_phase BETWEEN 1 AND 6);

ALTER TABLE route_source_candidates
  ADD COLUMN source_validation_status TEXT NOT NULL DEFAULT 'metadata_checked'
    CHECK (source_validation_status IN ('metadata_checked', 'locally_curated', 'publisher_claims_ridden')),
  ADD COLUMN source_validation_basis TEXT NOT NULL DEFAULT
    'Public source page and route metadata checked; no named-rider evidence or publication rights established.',
  ADD COLUMN source_validation_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_route_source_candidates_source_validation
  ON route_source_candidates(source_validation_status, destination, source_name);

COMMIT;
