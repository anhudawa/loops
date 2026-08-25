-- Make the evidence behind every proposed route explicit and auditable.
-- A percentage on route_plan_proposals is a summary, never proof by itself.

BEGIN;

ALTER TABLE ride_edge_observations
  ADD CONSTRAINT ride_edge_observations_id_edge_unique UNIQUE (id, road_edge_id);

CREATE TABLE route_plan_proposal_edges (
  proposal_id TEXT NOT NULL REFERENCES route_plan_proposals(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL CHECK (sequence_no >= 0),
  road_edge_id TEXT NOT NULL REFERENCES road_edges(id) ON DELETE RESTRICT,
  evidence_state TEXT NOT NULL CHECK (
    evidence_state IN ('current_human', 'stale_human', 'provisional')
  ),
  supporting_observation_id TEXT,
  source_percent_along REAL CHECK (source_percent_along BETWEEN 0 AND 1),
  target_percent_along REAL CHECK (target_percent_along BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (proposal_id, sequence_no),
  FOREIGN KEY (supporting_observation_id, road_edge_id)
    REFERENCES ride_edge_observations(id, road_edge_id) ON DELETE RESTRICT,
  CHECK (
    (evidence_state IN ('current_human', 'stale_human') AND supporting_observation_id IS NOT NULL)
    OR (evidence_state = 'provisional' AND supporting_observation_id IS NULL)
  )
);

CREATE OR REPLACE FUNCTION enforce_route_plan_edge_evidence()
RETURNS TRIGGER AS $$
DECLARE
  proposal_area_id TEXT;
  proposal_trust_class TEXT;
  observation_date DATE;
BEGIN
  SELECT area_id, trust_class
    INTO proposal_area_id, proposal_trust_class
  FROM route_plan_proposals
  WHERE id = NEW.proposal_id;

  IF NEW.evidence_state = 'provisional' THEN
    IF proposal_trust_class = 'human_covered' THEN
      RAISE EXCEPTION 'human-covered proposals cannot contain provisional edges';
    END IF;
    RETURN NEW;
  END IF;

  SELECT reo.observed_at
    INTO observation_date
  FROM ride_edge_observations reo
  JOIN ride_attestations ra
    ON ra.id = reo.ride_attestation_id
   AND ra.route_id = reo.route_id
   AND ra.route_version_id = reo.route_version_id
   AND ra.review_status = 'approved'
  WHERE reo.id = NEW.supporting_observation_id
    AND reo.road_edge_id = NEW.road_edge_id
    AND reo.area_id = proposal_area_id;

  IF observation_date IS NULL THEN
    RAISE EXCEPTION 'human route-plan edges require an approved observation in the proposal area';
  END IF;

  IF NEW.evidence_state = 'current_human'
     AND observation_date < CURRENT_DATE - INTERVAL '365 days' THEN
    RAISE EXCEPTION 'current human route-plan evidence must be no more than 365 days old';
  END IF;

  IF NEW.evidence_state = 'stale_human'
     AND observation_date >= CURRENT_DATE - INTERVAL '365 days' THEN
    RAISE EXCEPTION 'recent human evidence must not be labelled stale';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER route_plan_edge_evidence
BEFORE INSERT OR UPDATE ON route_plan_proposal_edges
FOR EACH ROW EXECUTE FUNCTION enforce_route_plan_edge_evidence();

CREATE INDEX idx_route_plan_proposal_edges_edge
  ON route_plan_proposal_edges(road_edge_id, evidence_state);
CREATE INDEX idx_route_plan_proposal_edges_observation
  ON route_plan_proposal_edges(supporting_observation_id)
  WHERE supporting_observation_id IS NOT NULL;

COMMIT;
