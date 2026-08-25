-- Plaintext OAuth credentials from the legacy application are not migrated.
-- Users must reconnect after LOOPS_TOKEN_ENCRYPTION_KEY is configured so all
-- newly stored credentials use authenticated AES-256-GCM envelopes.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name = 'strava_access_token'
  ) THEN
    UPDATE users
    SET strava_id = NULL,
        strava_access_token = NULL,
        strava_refresh_token = NULL,
        strava_token_expires_at = NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'garmin_tokens'
  ) THEN
    DELETE FROM garmin_tokens;
  END IF;
END $$;

COMMIT;
