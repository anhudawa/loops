-- Invitation-only Ireland beta intake and membership controls.

BEGIN;

CREATE TABLE IF NOT EXISTS beta_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_type TEXT NOT NULL CHECK (application_type IN ('rider', 'contributor')),
  home_region TEXT NOT NULL CHECK (char_length(home_region) BETWEEN 2 AND 80),
  club_name TEXT CHECK (club_name IS NULL OR char_length(club_name) <= 120),
  riding_frequency TEXT NOT NULL CHECK (riding_frequency IN ('weekly', 'two_to_three', 'four_plus')),
  routes_available INTEGER CHECK (
    (application_type = 'rider' AND routes_available IS NULL)
    OR (application_type = 'contributor' AND routes_available BETWEEN 1 AND 10)
  ),
  session_interests TEXT[] NOT NULL DEFAULT '{}',
  source_platforms TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 1000),
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'waitlisted', 'approved', 'declined', 'withdrawn')),
  contact_consent_at TIMESTAMPTZ NOT NULL,
  privacy_version TEXT NOT NULL,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT CHECK (admin_notes IS NULL OR char_length(admin_notes) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, application_type),
  CHECK (session_interests <@ ARRAY['endurance', 'tempo', 'sweet_spot', 'threshold']::TEXT[]),
  CHECK (source_platforms <@ ARRAY['garmin', 'ridewithgps', 'komoot', 'wahoo', 'strava_export', 'other']::TEXT[])
);

CREATE TABLE IF NOT EXISTS beta_memberships (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL CHECK (access_level IN ('rider', 'contributor')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'removed')),
  approved_application_id TEXT REFERENCES beta_applications(id),
  approved_by TEXT NOT NULL REFERENCES users(id),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beta_applications_status_created
  ON beta_applications(status, created_at);
CREATE INDEX IF NOT EXISTS idx_beta_applications_user
  ON beta_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_beta_memberships_status_level
  ON beta_memberships(status, access_level);

COMMIT;
