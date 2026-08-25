import { sql } from "@vercel/postgres";
import { v4 as uuidv4 } from "uuid";

export type BetaApplicationType = "rider" | "contributor";
export type BetaApplicationStatus =
  | "submitted"
  | "waitlisted"
  | "approved"
  | "declined"
  | "withdrawn";
export type BetaAccessLevel = "rider" | "contributor";

export interface BetaApplication {
  id: string;
  user_id: string;
  user_name?: string | null;
  user_email?: string;
  application_type: BetaApplicationType;
  home_region: string;
  club_name: string | null;
  riding_frequency: "weekly" | "two_to_three" | "four_plus";
  routes_available: number | null;
  session_interests: string[];
  source_platforms: string[];
  notes: string | null;
  status: BetaApplicationStatus;
  contact_consent_at: string;
  privacy_version: string;
  admin_notes?: string | null;
  membership_access_level?: BetaAccessLevel | null;
  membership_status?: "active" | "paused" | "removed" | null;
  created_at: string;
  updated_at: string;
}

export interface BetaMembership {
  user_id: string;
  access_level: BetaAccessLevel;
  status: "active" | "paused" | "removed";
  approved_at: string;
}

export async function getBetaIntakeForUser(userId: string): Promise<{
  applications: BetaApplication[];
  membership: BetaMembership | null;
}> {
  const [applicationsResult, membershipResult] = await Promise.all([
    sql.query(
      `SELECT id, user_id, application_type, home_region, club_name,
        riding_frequency, routes_available, session_interests, source_platforms,
        notes, status, contact_consent_at, privacy_version,
        created_at, updated_at
       FROM beta_applications
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    ),
    sql.query(
      `SELECT user_id, access_level, status, approved_at
       FROM beta_memberships
       WHERE user_id = $1`,
      [userId]
    ),
  ]);

  return {
    applications: applicationsResult.rows as BetaApplication[],
    membership: (membershipResult.rows[0] as BetaMembership | undefined) ?? null,
  };
}

export async function hasActiveBetaAccess(
  userId: string,
  required: BetaAccessLevel = "rider"
): Promise<boolean> {
  const { rows } = await sql.query(
    `SELECT 1
     FROM beta_memberships
     WHERE user_id = $1
       AND status = 'active'
       AND (access_level = $2 OR access_level = 'contributor')
     LIMIT 1`,
    [userId, required]
  );
  return rows.length > 0;
}

export async function submitBetaApplication(input: {
  userId: string;
  applicationType: BetaApplicationType;
  homeRegion: string;
  clubName: string | null;
  ridingFrequency: "weekly" | "two_to_three" | "four_plus";
  routesAvailable: number | null;
  sessionInterests: string[];
  sourcePlatforms: string[];
  notes: string | null;
  privacyVersion: string;
}): Promise<BetaApplication | undefined> {
  const { rows } = await sql.query(
    `INSERT INTO beta_applications (
       id, user_id, application_type, home_region, club_name,
       riding_frequency, routes_available, session_interests, source_platforms,
       notes, contact_consent_at, privacy_version
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9::text[], $10, NOW(), $11)
     ON CONFLICT (user_id, application_type) DO UPDATE SET
       home_region = EXCLUDED.home_region,
       club_name = EXCLUDED.club_name,
       riding_frequency = EXCLUDED.riding_frequency,
       routes_available = EXCLUDED.routes_available,
       session_interests = EXCLUDED.session_interests,
       source_platforms = EXCLUDED.source_platforms,
       notes = EXCLUDED.notes,
       status = 'submitted',
       contact_consent_at = NOW(),
       privacy_version = EXCLUDED.privacy_version,
       reviewed_by = NULL,
       reviewed_at = NULL,
       admin_notes = NULL,
       updated_at = NOW()
     WHERE beta_applications.status IN ('submitted', 'waitlisted')
     RETURNING id, user_id, application_type, home_region, club_name,
       riding_frequency, routes_available, session_interests, source_platforms,
       notes, status, contact_consent_at, privacy_version, admin_notes,
       created_at, updated_at`,
    [
      uuidv4(),
      input.userId,
      input.applicationType,
      input.homeRegion,
      input.clubName,
      input.ridingFrequency,
      input.routesAvailable,
      input.sessionInterests,
      input.sourcePlatforms,
      input.notes,
      input.privacyVersion,
    ]
  );
  return rows[0] as BetaApplication | undefined;
}

export async function getBetaApplications(): Promise<BetaApplication[]> {
  const { rows } = await sql.query(
    `SELECT ba.id, ba.user_id, u.name AS user_name, u.email AS user_email,
       ba.application_type, ba.home_region, ba.club_name, ba.riding_frequency,
       ba.routes_available, ba.session_interests, ba.source_platforms, ba.notes,
       ba.status, ba.contact_consent_at, ba.privacy_version, ba.admin_notes,
       bm.access_level AS membership_access_level,
       bm.status AS membership_status,
       ba.created_at, ba.updated_at
     FROM beta_applications ba
     JOIN users u ON u.id = ba.user_id
     LEFT JOIN beta_memberships bm ON bm.user_id = ba.user_id
     WHERE ba.status <> 'withdrawn'
     ORDER BY
       CASE ba.status WHEN 'submitted' THEN 0 WHEN 'waitlisted' THEN 1 ELSE 2 END,
       ba.created_at ASC`
  );
  return rows as BetaApplication[];
}

export async function reviewBetaApplication(input: {
  applicationId: string;
  reviewerId: string;
  status: "approved" | "waitlisted" | "declined";
  adminNotes: string;
}): Promise<BetaApplication | undefined> {
  if (input.status === "approved") {
    const membershipEventId = uuidv4();
    const { rows } = await sql.query(
      `WITH reviewed AS (
         UPDATE beta_applications
         SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(),
             admin_notes = $3, updated_at = NOW()
         WHERE id = $1 AND status IN ('submitted', 'waitlisted')
         RETURNING *
       ), membership AS (
         INSERT INTO beta_memberships (
           user_id, access_level, status, approved_application_id, approved_by
         )
         SELECT user_id, application_type, 'active', id, $2 FROM reviewed
         ON CONFLICT (user_id) DO UPDATE SET
           access_level = CASE
             WHEN beta_memberships.access_level = 'contributor' THEN 'contributor'
             ELSE EXCLUDED.access_level
           END,
           status = 'active',
           approved_application_id = EXCLUDED.approved_application_id,
           approved_by = EXCLUDED.approved_by,
           approved_at = NOW(),
           updated_at = NOW()
         RETURNING user_id, access_level, status
       ), membership_event AS (
         INSERT INTO beta_membership_events (
           id, user_id, actor_id, application_id, access_level,
           from_status, to_status, reason
         )
         SELECT $4, membership.user_id, $2, reviewed.id,
           membership.access_level, NULL, membership.status, $3
         FROM membership JOIN reviewed USING (user_id)
         RETURNING user_id
       )
       SELECT reviewed.* FROM reviewed
       JOIN membership USING (user_id)
       JOIN membership_event USING (user_id)`,
      [input.applicationId, input.reviewerId, input.adminNotes, membershipEventId]
    );
    return rows[0] as BetaApplication | undefined;
  }

  const { rows } = await sql.query(
    `UPDATE beta_applications
     SET status = $2, reviewed_by = $3, reviewed_at = NOW(),
         admin_notes = $4, updated_at = NOW()
     WHERE id = $1 AND status IN ('submitted', 'waitlisted')
     RETURNING *`,
    [input.applicationId, input.status, input.reviewerId, input.adminNotes]
  );
  return rows[0] as BetaApplication | undefined;
}

export async function setBetaMembershipStatus(input: {
  userId: string;
  actorId: string;
  status: "active" | "paused" | "removed";
  reason: string;
}): Promise<BetaMembership | undefined> {
  const eventId = uuidv4();
  const { rows } = await sql.query(
    `WITH current_membership AS (
       SELECT user_id, access_level, status, approved_at
       FROM beta_memberships
       WHERE user_id = $1
       FOR UPDATE
     ), updated_membership AS (
       UPDATE beta_memberships bm
       SET status = $3, updated_at = NOW()
       FROM current_membership current
       WHERE bm.user_id = current.user_id
         AND current.status <> $3
       RETURNING bm.user_id, bm.access_level, bm.status, bm.approved_at
     ), membership_event AS (
       INSERT INTO beta_membership_events (
         id, user_id, actor_id, access_level, from_status, to_status, reason
       )
       SELECT $5, updated.user_id, $2, updated.access_level,
         current.status, updated.status, $4
       FROM updated_membership updated
       JOIN current_membership current USING (user_id)
       RETURNING user_id
     )
     SELECT updated.* FROM updated_membership updated
     JOIN membership_event USING (user_id)`,
    [input.userId, input.actorId, input.status, input.reason, eventId]
  );
  return rows[0] as BetaMembership | undefined;
}
