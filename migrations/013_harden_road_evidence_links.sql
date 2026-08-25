-- Close two evidence-link gaps discovered in the Clontarf foundation review:
-- assessments must concern an edge traversed by their supporting ride, and a
-- human-covered proposal must commit with current approved support per edge.

BEGIN;

CREATE OR REPLACE FUNCTION enforce_approved_edge_assessment_attestation()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM ride_attestations ra
    JOIN ride_edge_observations reo
      ON reo.ride_attestation_id = ra.id
     AND reo.route_id = ra.route_id
     AND reo.route_version_id = ra.route_version_id
     AND reo.road_edge_id = NEW.road_edge_id
    WHERE ra.id = NEW.ride_attestation_id
      AND ra.route_id = NEW.route_id
      AND ra.route_version_id = NEW.route_version_id
      AND ra.review_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'road assessments require an approved ride observation of the same directed edge';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_human_covered_proposal_support()
RETURNS TRIGGER AS $$
DECLARE
  proposal_id_to_check TEXT;
BEGIN
  IF TG_TABLE_NAME = 'route_plan_proposals' THEN
    proposal_id_to_check := COALESCE(NEW.id, OLD.id);
  ELSE
    proposal_id_to_check := COALESCE(NEW.proposal_id, OLD.proposal_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM route_plan_proposals
    WHERE id = proposal_id_to_check AND trust_class = 'human_covered'
  ) THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM route_plan_proposal_edges WHERE proposal_id = proposal_id_to_check
  ) OR EXISTS (
    SELECT 1
    FROM route_plan_proposal_edges rppe
    JOIN route_plan_proposals rpp ON rpp.id = rppe.proposal_id
    LEFT JOIN ride_edge_observations reo
      ON reo.id = rppe.supporting_observation_id
     AND reo.road_edge_id = rppe.road_edge_id
     AND reo.area_id = rpp.area_id
    LEFT JOIN ride_attestations ra
      ON ra.id = reo.ride_attestation_id
     AND ra.route_id = reo.route_id
     AND ra.route_version_id = reo.route_version_id
     AND ra.review_status = 'approved'
    WHERE rppe.proposal_id = proposal_id_to_check
      AND (
        rppe.evidence_state <> 'current_human'
        OR reo.id IS NULL
        OR reo.observed_at < CURRENT_DATE - INTERVAL '365 days'
        OR ra.id IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'human-covered proposals require current approved evidence for every directed edge';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER human_covered_proposal_support
AFTER INSERT OR UPDATE ON route_plan_proposals
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_human_covered_proposal_support();

CREATE CONSTRAINT TRIGGER human_covered_proposal_edge_support
AFTER INSERT OR UPDATE OR DELETE ON route_plan_proposal_edges
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_human_covered_proposal_support();

COMMIT;
