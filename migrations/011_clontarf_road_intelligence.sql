-- LOOPS Road Intelligence v1: evidence-backed directed road coverage and
-- team-only route proposals for the Clontarf planning lab.
--
-- This schema does not make road observations or generated plans public
-- routes. An exact route still enters the catalogue only through the existing
-- completed-ride, rights and independent-review workflow.

BEGIN;

CREATE TABLE road_intelligence_areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT NOT NULL,
  center_lat DOUBLE PRECISION NOT NULL CHECK (center_lat BETWEEN -90 AND 90),
  center_lng DOUBLE PRECISION NOT NULL CHECK (center_lng BETWEEN -180 AND 180),
  coverage_radius_km REAL NOT NULL CHECK (coverage_radius_km > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO road_intelligence_areas (
  id, name, country, region, center_lat, center_lng, coverage_radius_km
) VALUES (
  'clontarf', 'Clontarf Road Intelligence Lab', 'Ireland', 'Dublin',
  53.36081, -6.19685, 45
) ON CONFLICT (id) DO NOTHING;

CREATE TABLE road_intelligence_benchmarks (
  id TEXT PRIMARY KEY,
  area_id TEXT NOT NULL REFERENCES road_intelligence_areas(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 30 AND 720),
  structured_request JSONB NOT NULL CHECK (jsonb_typeof(structured_request) = 'object'),
  evidence_gate TEXT NOT NULL DEFAULT 'honest_no_match_until_covered' CHECK (
    evidence_gate IN ('honest_no_match_until_covered', 'team_only_provisional_allowed')
  ),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(area_id, label)
);

INSERT INTO road_intelligence_benchmarks (
  id, area_id, label, duration_minutes, structured_request
) VALUES
  ('clontarf-090-flat', 'clontarf', '90 min · flat endurance', 90, '{"discipline":"road","elevation":"flat","session":"endurance","scenic":false,"cafe":false}'::jsonb),
  ('clontarf-090-rolling', 'clontarf', '90 min · rolling scenic', 90, '{"discipline":"road","elevation":"rolling","session":"endurance","scenic":true,"cafe":false}'::jsonb),
  ('clontarf-120-coastal', 'clontarf', '2 hr · coastal scenic', 120, '{"discipline":"road","elevation":"flat","session":"endurance","scenic":true,"vibe":"coastal","cafe":false}'::jsonb),
  ('clontarf-120-cafe', 'clontarf', '2 hr · endurance with café', 120, '{"discipline":"road","elevation":"any","session":"endurance","scenic":true,"cafe":true}'::jsonb),
  ('clontarf-180-flat', 'clontarf', '3 hr · flatter endurance', 180, '{"discipline":"road","elevation":"flat","session":"endurance","scenic":true,"cafe":false}'::jsonb),
  ('clontarf-180-rolling', 'clontarf', '3 hr · rolling scenic', 180, '{"discipline":"road","elevation":"rolling","session":"endurance","scenic":true,"cafe":false}'::jsonb),
  ('clontarf-180-tempo', 'clontarf', '3 hr · tempo session', 180, '{"discipline":"road","elevation":"rolling","session":"tempo","workout":{"count":2,"effort_seconds":1200},"scenic":false,"cafe":false}'::jsonb),
  ('clontarf-240-endurance', 'clontarf', '4 hr · endurance', 240, '{"discipline":"road","elevation":"any","session":"endurance","scenic":true,"cafe":false}'::jsonb),
  ('clontarf-240-rolling', 'clontarf', '4 hr · rolling scenic', 240, '{"discipline":"road","elevation":"rolling","session":"endurance","scenic":true,"cafe":false}'::jsonb),
  ('clontarf-240-threshold', 'clontarf', '4 hr · 2 × 20 min threshold', 240, '{"discipline":"road","elevation":"rolling","session":"threshold","workout":{"count":2,"effort_seconds":1200},"scenic":false,"cafe":false}'::jsonb),
  ('clontarf-240-cafe', 'clontarf', '4 hr · scenic with café', 240, '{"discipline":"road","elevation":"any","session":"endurance","scenic":true,"cafe":true}'::jsonb),
  ('clontarf-240-wind', 'clontarf', '4 hr · tailwind home', 240, '{"discipline":"road","elevation":"any","session":"endurance","scenic":true,"cafe":false,"wind_strategy":"tailwind_home"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE road_edges (
  id TEXT PRIMARY KEY,
  edge_key TEXT NOT NULL UNIQUE,
  network_provider TEXT NOT NULL CHECK (
    network_provider IN ('valhalla', 'graphhopper', 'other_contracted')
  ),
  provider_edge_id TEXT NOT NULL,
  graph_version TEXT,
  osm_way_id TEXT,
  from_osm_node_id TEXT,
  to_osm_node_id TEXT,
  traversal_direction TEXT NOT NULL CHECK (traversal_direction IN ('forward', 'reverse')),
  names JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(names) = 'array'),
  geometry JSONB NOT NULL CHECK (
    jsonb_typeof(geometry) = 'array' AND jsonb_array_length(geometry) >= 2
  ),
  begin_lat DOUBLE PRECISION NOT NULL CHECK (begin_lat BETWEEN -90 AND 90),
  begin_lng DOUBLE PRECISION NOT NULL CHECK (begin_lng BETWEEN -180 AND 180),
  end_lat DOUBLE PRECISION NOT NULL CHECK (end_lat BETWEEN -90 AND 90),
  end_lng DOUBLE PRECISION NOT NULL CHECK (end_lng BETWEEN -180 AND 180),
  length_m REAL NOT NULL CHECK (length_m > 0),
  road_class TEXT,
  road_use TEXT,
  surface TEXT,
  traversability TEXT,
  cycle_lane TEXT,
  bicycle_network TEXT,
  speed_limit_kmh REAL CHECK (speed_limit_kmh IS NULL OR speed_limit_kmh >= 0),
  lane_count INTEGER CHECK (lane_count IS NULL OR lane_count >= 0),
  density REAL,
  weighted_grade REAL,
  max_upward_grade REAL,
  max_downward_grade REAL,
  mean_elevation_m REAL,
  unpaved BOOLEAN,
  tunnel BOOLEAN,
  bridge BOOLEAN,
  roundabout BOOLEAN,
  shoulder BOOLEAN,
  traffic_signal BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE road_edge_characteristics (
  road_edge_id TEXT PRIMARY KEY REFERENCES road_edges(id) ON DELETE CASCADE,
  feature_version TEXT NOT NULL,
  lower_stress_score REAL CHECK (lower_stress_score BETWEEN 0 AND 100),
  flow_score REAL CHECK (flow_score BETWEEN 0 AND 100),
  scenic_score REAL CHECK (scenic_score BETWEEN 0 AND 100),
  surface_confidence REAL CHECK (surface_confidence BETWEEN 0 AND 1),
  network_confidence REAL CHECK (network_confidence BETWEEN 0 AND 1),
  junction_count INTEGER CHECK (junction_count IS NULL OR junction_count >= 0),
  distance_to_water_m REAL CHECK (distance_to_water_m IS NULL OR distance_to_water_m >= 0),
  distance_to_coast_m REAL CHECK (distance_to_coast_m IS NULL OR distance_to_coast_m >= 0),
  woodland_share REAL CHECK (woodland_share BETWEEN 0 AND 1),
  viewpoint_count INTEGER CHECK (viewpoint_count IS NULL OR viewpoint_count >= 0),
  cafe_count INTEGER CHECK (cafe_count IS NULL OR cafe_count >= 0),
  source_summary JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_summary) = 'object'),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ride_edge_observations (
  id TEXT PRIMARY KEY,
  area_id TEXT NOT NULL REFERENCES road_intelligence_areas(id) ON DELETE RESTRICT,
  road_edge_id TEXT NOT NULL REFERENCES road_edges(id) ON DELETE RESTRICT,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  route_version_id TEXT NOT NULL,
  ride_attestation_id TEXT NOT NULL,
  sequence_no INTEGER NOT NULL CHECK (sequence_no >= 0),
  observed_at DATE NOT NULL,
  source_percent_along REAL CHECK (source_percent_along BETWEEN 0 AND 1),
  target_percent_along REAL CHECK (target_percent_along BETWEEN 0 AND 1),
  match_confidence REAL CHECK (match_confidence BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(area_id, ride_attestation_id, sequence_no),
  FOREIGN KEY (route_version_id, route_id)
    REFERENCES route_versions(id, route_id) ON DELETE CASCADE,
  FOREIGN KEY (ride_attestation_id, route_id, route_version_id)
    REFERENCES ride_attestations(id, route_id, route_version_id) ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION enforce_approved_ride_edge_observation()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM ride_attestations ra
    WHERE ra.id = NEW.ride_attestation_id
      AND ra.route_id = NEW.route_id
      AND ra.route_version_id = NEW.route_version_id
      AND ra.review_status = 'approved'
      AND ra.ridden_at = NEW.observed_at
  ) THEN
    RAISE EXCEPTION 'road observations require an approved matching ride attestation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER road_observation_approved_attestation
BEFORE INSERT OR UPDATE ON ride_edge_observations
FOR EACH ROW EXECUTE FUNCTION enforce_approved_ride_edge_observation();

CREATE TABLE road_edge_human_assessments (
  id TEXT PRIMARY KEY,
  road_edge_id TEXT NOT NULL REFERENCES road_edges(id) ON DELETE RESTRICT,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  route_version_id TEXT NOT NULL,
  ride_attestation_id TEXT NOT NULL,
  assessor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assessor_name TEXT NOT NULL,
  assessed_at DATE NOT NULL,
  surface_rating TEXT NOT NULL CHECK (surface_rating IN ('good', 'mixed', 'poor')),
  traffic_rating TEXT NOT NULL CHECK (traffic_rating IN ('low', 'moderate', 'high')),
  sightlines_rating TEXT NOT NULL CHECK (sightlines_rating IN ('clear', 'mixed', 'poor')),
  flow_rating TEXT NOT NULL CHECK (flow_rating IN ('excellent', 'good', 'interrupted', 'poor')),
  scenic_rating INTEGER NOT NULL CHECK (scenic_rating BETWEEN 1 AND 5),
  direction_notes TEXT NOT NULL,
  hazards_notes TEXT,
  valid_until DATE NOT NULL CHECK (valid_until > assessed_at),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    review_status IN ('pending', 'approved', 'rejected', 'revoked')
  ),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(road_edge_id, ride_attestation_id, assessor_name),
  FOREIGN KEY (route_version_id, route_id)
    REFERENCES route_versions(id, route_id) ON DELETE CASCADE,
  FOREIGN KEY (ride_attestation_id, route_id, route_version_id)
    REFERENCES ride_attestations(id, route_id, route_version_id) ON DELETE RESTRICT,
  CHECK (
    (review_status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (review_status <> 'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CHECK (assessor_user_id IS NULL OR reviewed_by IS NULL OR assessor_user_id <> reviewed_by)
);

CREATE OR REPLACE FUNCTION enforce_approved_edge_assessment_attestation()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM ride_attestations ra
    WHERE ra.id = NEW.ride_attestation_id
      AND ra.route_id = NEW.route_id
      AND ra.route_version_id = NEW.route_version_id
      AND ra.review_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'road assessments require an approved matching ride attestation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER road_assessment_approved_attestation
BEFORE INSERT OR UPDATE ON road_edge_human_assessments
FOR EACH ROW EXECUTE FUNCTION enforce_approved_edge_assessment_attestation();

-- A proposal is a private planning object, never a route publication record.
-- It deliberately has no publication status and cannot satisfy routes.publication_status.
CREATE TABLE route_plan_proposals (
  id TEXT PRIMARY KEY,
  area_id TEXT NOT NULL REFERENCES road_intelligence_areas(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'team_only' CHECK (visibility = 'team_only'),
  trust_class TEXT NOT NULL CHECK (trust_class IN ('human_covered', 'provisional')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'team_review', 'ready_to_ride', 'ridden', 'rejected', 'expired')
  ),
  origin_label TEXT NOT NULL,
  origin_lat DOUBLE PRECISION NOT NULL CHECK (origin_lat BETWEEN -90 AND 90),
  origin_lng DOUBLE PRECISION NOT NULL CHECK (origin_lng BETWEEN -180 AND 180),
  requested_duration_minutes INTEGER NOT NULL CHECK (requested_duration_minutes BETWEEN 30 AND 720),
  duration_tolerance_minutes INTEGER NOT NULL DEFAULT 15 CHECK (duration_tolerance_minutes BETWEEN 1 AND 120),
  structured_request JSONB NOT NULL CHECK (jsonb_typeof(structured_request) = 'object'),
  coordinates JSONB NOT NULL CHECK (
    jsonb_typeof(coordinates) = 'array' AND jsonb_array_length(coordinates) >= 2
  ),
  geometry_hash TEXT NOT NULL,
  distance_km REAL NOT NULL CHECK (distance_km > 0),
  elevation_gain_m REAL NOT NULL CHECK (elevation_gain_m >= 0),
  predicted_duration_minutes INTEGER NOT NULL CHECK (predicted_duration_minutes > 0),
  human_covered_distance_km REAL NOT NULL DEFAULT 0 CHECK (human_covered_distance_km >= 0),
  human_coverage_pct REAL NOT NULL DEFAULT 0 CHECK (human_coverage_pct BETWEEN 0 AND 100),
  directed_coverage_pct REAL NOT NULL DEFAULT 0 CHECK (directed_coverage_pct BETWEEN 0 AND 100),
  algorithm_version TEXT NOT NULL,
  public_eligible BOOLEAN NOT NULL DEFAULT FALSE CHECK (public_eligible = FALSE),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(area_id, geometry_hash),
  CHECK (human_covered_distance_km <= distance_km),
  CHECK (
    trust_class <> 'human_covered'
    OR (human_coverage_pct = 100 AND directed_coverage_pct = 100)
  ),
  CHECK (
    status NOT IN ('ready_to_ride', 'ridden', 'rejected')
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CHECK (expires_at > created_at)
);

CREATE TABLE route_plan_feedback (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES route_plan_proposals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_ride_attestation_id TEXT REFERENCES ride_attestations(id) ON DELETE SET NULL,
  actual_duration_minutes INTEGER CHECK (actual_duration_minutes IS NULL OR actual_duration_minutes > 0),
  would_ride_again BOOLEAN,
  followed_as_planned BOOLEAN,
  best_section_notes TEXT,
  worst_section_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(proposal_id, user_id)
);

CREATE OR REPLACE FUNCTION enforce_plan_feedback_attestation_owner()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.completed_ride_attestation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM ride_attestations ra
    WHERE ra.id = NEW.completed_ride_attestation_id
      AND ra.rider_user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'completed ride evidence must belong to the feedback rider';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER route_plan_feedback_attestation_owner
BEFORE INSERT OR UPDATE ON route_plan_feedback
FOR EACH ROW EXECUTE FUNCTION enforce_plan_feedback_attestation_owner();

CREATE INDEX idx_road_edges_provider ON road_edges(network_provider, provider_edge_id);
CREATE INDEX idx_road_edges_osm_way ON road_edges(osm_way_id);
CREATE INDEX idx_ride_edge_observations_area ON ride_edge_observations(area_id, observed_at DESC);
CREATE INDEX idx_ride_edge_observations_edge ON ride_edge_observations(road_edge_id, observed_at DESC);
CREATE INDEX idx_ride_edge_observations_version ON ride_edge_observations(route_id, route_version_id);
CREATE INDEX idx_road_edge_assessments_current ON road_edge_human_assessments(road_edge_id, review_status, valid_until);
CREATE INDEX idx_route_plan_proposals_area ON route_plan_proposals(area_id, status, created_at DESC);
CREATE INDEX idx_route_plan_feedback_proposal ON route_plan_feedback(proposal_id);

COMMIT;
