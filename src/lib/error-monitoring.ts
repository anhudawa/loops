import { sql } from "@vercel/postgres";
import { v4 as uuidv4 } from "uuid";
import {
  logSafeOperationalError,
  type OperationalErrorSource,
} from "@/lib/error-descriptor";

export interface OperationalErrorRow {
  id: string;
  fingerprint: string;
  source: OperationalErrorSource;
  error_name: string;
  error_code: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  last_reference_id: string;
  status: "open" | "resolved" | "ignored";
  resolution_notes: string | null;
  resolved_at: string | null;
}

export async function captureOperationalError(
  error: unknown,
  source: OperationalErrorSource
): Promise<string> {
  // Hosting logs retain a safe per-occurrence reference even if PostgreSQL is
  // the failed dependency and the grouped queue cannot be updated.
  const { referenceId, descriptor } = await logSafeOperationalError(error, source);

  try {
    await sql.query(
      `INSERT INTO operational_errors (
         id, fingerprint, source, error_name, error_code, last_reference_id
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (fingerprint) DO UPDATE SET
         source = EXCLUDED.source,
         error_name = EXCLUDED.error_name,
         error_code = EXCLUDED.error_code,
         occurrence_count = operational_errors.occurrence_count + 1,
         last_seen_at = NOW(),
         last_reference_id = EXCLUDED.last_reference_id,
         status = 'open',
         resolution_notes = NULL,
         resolved_by = NULL,
         resolved_at = NULL`,
      [
        uuidv4(),
        descriptor.fingerprint,
        source,
        descriptor.errorName,
        descriptor.errorCode,
        referenceId,
      ]
    );
  } catch {
    console.error(JSON.stringify({
      level: "error",
      event: "loops_error_queue_unavailable",
      reference_id: referenceId,
    }));
  }

  return referenceId;
}

export async function getOpenOperationalErrors(
  limit = 100
): Promise<OperationalErrorRow[]> {
  const { rows } = await sql.query(
    `SELECT id, fingerprint, source, error_name, error_code,
       occurrence_count, first_seen_at, last_seen_at, last_reference_id,
       status, resolution_notes, resolved_at
     FROM operational_errors
     WHERE status = 'open'
     ORDER BY last_seen_at DESC
     LIMIT $1::int`,
    [limit]
  );
  return rows as OperationalErrorRow[];
}

export async function resolveOperationalError(
  id: string,
  status: "resolved" | "ignored",
  reviewerId: string,
  notes: string
): Promise<OperationalErrorRow | undefined> {
  const { rows } = await sql.query(
    `UPDATE operational_errors
     SET status = $1,
         resolution_notes = $2,
         resolved_by = $3,
         resolved_at = NOW()
     WHERE id = $4 AND status = 'open'
     RETURNING id, fingerprint, source, error_name, error_code,
       occurrence_count, first_seen_at, last_seen_at, last_reference_id,
       status, resolution_notes, resolved_at`,
    [status, notes.trim(), reviewerId, id]
  );
  return rows[0] as OperationalErrorRow | undefined;
}
