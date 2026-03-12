import { sql } from "@vercel/postgres";

async function migrate() {
  console.log("Running v2 migrations...");

  // Add role column to users
  await sql`
    DO $$ BEGIN
      ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$
  `;
  console.log("  + users.role");

  // Add bio column
  await sql`
    DO $$ BEGIN
      ALTER TABLE users ADD COLUMN bio TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$
  `;
  console.log("  + users.bio");

  // Add avatar_url column
  await sql`
    DO $$ BEGIN
      ALTER TABLE users ADD COLUMN avatar_url TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$
  `;
  console.log("  + users.avatar_url");

  // Add location column
  await sql`
    DO $$ BEGIN
      ALTER TABLE users ADD COLUMN location TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$
  `;
  console.log("  + users.location");

  // Create magic_links table
  await sql`
    CREATE TABLE IF NOT EXISTS magic_links (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("  + magic_links table");

  // Create follows table
  await sql`
    CREATE TABLE IF NOT EXISTS follows (
      id TEXT PRIMARY KEY,
      follower_id TEXT NOT NULL REFERENCES users(id),
      following_id TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(follower_id, following_id),
      CHECK(follower_id != following_id)
    )
  `;
  console.log("  + follows table");

  // Indexes for follows
  await sql`CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id)`;
  console.log("  + follows indexes");

  // Add created_by to routes (track who uploaded)
  await sql`
    DO $$ BEGIN
      ALTER TABLE routes ADD COLUMN created_by TEXT REFERENCES users(id);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$
  `;
  console.log("  + routes.created_by");

  console.log("v2 migrations complete!");
}

migrate().catch(console.error);
