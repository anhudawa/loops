-- LOOPS operational error groups.
--
-- Records contain only a one-way code-location fingerprint and a sanitised
-- error class/code. Raw messages, stack traces, request URLs, IP addresses,
-- cookies and request bodies are deliberately excluded.

BEGIN;

CREATE TABLE IF NOT EXISTS operational_errors (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL CHECK (source IN ('api', 'next_request', 'background')),
  error_name TEXT NOT NULL,
  error_code TEXT,
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reference_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  resolution_notes TEXT,
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  CHECK (
    (status = 'open' AND resolved_at IS NULL)
    OR (status IN ('resolved', 'ignored') AND resolved_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_operational_errors_queue
  ON operational_errors(status, last_seen_at DESC);

COMMIT;
