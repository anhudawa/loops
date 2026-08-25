# Application error monitoring runbook

Status: capture and admin queue implemented; external alert delivery pending  
Migration: `004_operational_error_monitoring.sql`

## What LOOPS records

Caught API errors receive a random reference ID. A one-way fingerprint groups
the sanitised error class, optional machine error code and normalised code
frame in the administrator error queue. Repeat occurrences increment the group
counter and reopen a previously resolved group.

Uncaught Next.js Node/Edge errors emit the same safe structured record to the
hosting logs. When PostgreSQL is itself unavailable, the log reference remains
available even though the database queue cannot be updated.

The error queue does **not** store:

- raw error messages or stack traces;
- request URLs, query strings or request bodies;
- names, email addresses, route searches or precise locations;
- IP addresses, user agents, device fingerprints, cookies or tokens.

## Administrator workflow

1. Open **Admin → Errors** and start with the newest or most frequent group.
2. Use the latest reference ID to locate the corresponding restricted hosting
   log record.
3. Reproduce in staging using non-personal test data.
4. Fix and verify the affected workflow.
5. Mark the group resolved with at least ten characters of notes, or ignored
   only when the reason is explicit and safe.
6. A recurrence automatically reopens the group.

## Production alert gate

Before Wave 3 or any paid traffic, connect the hosting provider's structured
logs to a contracted alerting/monitoring service and verify delivery for:

- any `loops_error_queue_unavailable` event;
- three occurrences of `loops_operational_error` in five minutes;
- a previously unseen fingerprint;
- an open error group remaining untriaged for one working day.

The alert test must be performed in staging without recording a real rider's
request. Save the alert screenshot/reference and the resolution record with the
release evidence. Code capture alone does not satisfy this production gate.
