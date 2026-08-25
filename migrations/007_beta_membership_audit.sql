-- Auditable closed-beta access changes.

BEGIN;

CREATE TABLE IF NOT EXISTS beta_membership_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  application_id TEXT REFERENCES beta_applications(id) ON DELETE SET NULL,
  access_level TEXT NOT NULL CHECK (access_level IN ('rider', 'contributor')),
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('active', 'paused', 'removed')),
  to_status TEXT NOT NULL CHECK (to_status IN ('active', 'paused', 'removed')),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beta_membership_events_user_created
  ON beta_membership_events(user_id, created_at DESC);

COMMIT;
