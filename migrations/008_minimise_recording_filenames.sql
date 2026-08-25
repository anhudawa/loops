-- Original upload filenames are not required route evidence and can contain
-- rider names, device identifiers or activity references. Keep only a neutral
-- format label. Source references remain private in ride_attestations.

BEGIN;

UPDATE routes
SET gpx_filename = CASE
  WHEN LOWER(gpx_filename) LIKE '%.fit' THEN 'ridden-route.fit'
  WHEN LOWER(gpx_filename) LIKE '%.tcx' THEN 'ridden-route.tcx'
  WHEN LOWER(gpx_filename) LIKE '%.gpx' THEN 'ridden-route.gpx'
  ELSE NULL
END
WHERE gpx_filename IS NOT NULL;

UPDATE ride_attestations
SET evidence_reference = CASE file_format
  WHEN 'fit' THEN 'ridden-route.fit'
  WHEN 'tcx' THEN 'ridden-route.tcx'
  WHEN 'gpx' THEN 'ridden-route.gpx'
  ELSE NULL
END
WHERE evidence_reference IS NOT NULL;

COMMIT;
