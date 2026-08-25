-- LOOPS route/version ownership integrity.
--
-- Every evidence, review, workout and measurement record must reference a
-- version that belongs to the same route. Independent single-column foreign
-- keys prove that both IDs exist, but not that they are the same route/version
-- pair; these composite constraints close that gap.

BEGIN;

ALTER TABLE route_versions
  ADD CONSTRAINT route_versions_id_route_id_unique UNIQUE (id, route_id);

ALTER TABLE ride_attestations
  ADD CONSTRAINT ride_attestations_version_route_fkey
  FOREIGN KEY (route_version_id, route_id)
  REFERENCES route_versions(id, route_id) ON DELETE CASCADE;

ALTER TABLE route_reviews
  ADD CONSTRAINT route_reviews_version_route_fkey
  FOREIGN KEY (route_version_id, route_id)
  REFERENCES route_versions(id, route_id) ON DELETE CASCADE;

ALTER TABLE route_publication_events
  ADD CONSTRAINT route_publication_events_version_route_fkey
  FOREIGN KEY (route_version_id, route_id)
  REFERENCES route_versions(id, route_id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE route_segment_assessments
  ADD CONSTRAINT route_segment_assessments_version_route_fkey
  FOREIGN KEY (route_version_id, route_id)
  REFERENCES route_versions(id, route_id) ON DELETE CASCADE;

ALTER TABLE beta_product_events
  ADD CONSTRAINT beta_product_events_version_route_fkey
  FOREIGN KEY (route_version_id, route_id)
  REFERENCES route_versions(id, route_id) ON DELETE CASCADE;

ALTER TABLE ride_plans
  ADD CONSTRAINT ride_plans_version_route_fkey
  FOREIGN KEY (route_version_id, route_id)
  REFERENCES route_versions(id, route_id) ON DELETE CASCADE;

ALTER TABLE routes
  ADD CONSTRAINT routes_current_version_ownership_fkey
  FOREIGN KEY (current_version_id, id)
  REFERENCES route_versions(id, route_id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ride_attestations
  ADD CONSTRAINT ride_attestations_id_route_version_unique
  UNIQUE (id, route_id, route_version_id);

ALTER TABLE route_segment_assessments
  ADD CONSTRAINT route_segment_assessments_attestation_ownership_fkey
  FOREIGN KEY (ride_attestation_id, route_id, route_version_id)
  REFERENCES ride_attestations(id, route_id, route_version_id)
  ON DELETE RESTRICT;

COMMIT;
