-- Fidus staging: core auth + staff flows on D1.
-- Run once via `npx wrangler d1 execute fidus-staging-db --file schema.sql`.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'Patient',
  department TEXT,
  date_of_birth TEXT,
  sex TEXT,
  blood_group TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS staff_invitations (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  invited_by TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  department TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staff_applications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT NOT NULL,
  department TEXT NOT NULL,
  professional_designation TEXT,
  professional_reg TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  actor_id TEXT,
  actor_email TEXT,
  actor_role TEXT,
  target_id TEXT,
  target_type TEXT,
  details TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON staff_invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON staff_invitations(email);
CREATE INDEX IF NOT EXISTS idx_applications_email ON staff_applications(email);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
