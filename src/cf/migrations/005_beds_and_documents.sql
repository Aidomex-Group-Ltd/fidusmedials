-- Fidus staging: inpatient beds and uploaded medical documents.
--
-- Both modules were previously listed as "not implemented": the admin sidebar
-- linked to placeholder panels and the legacy pages called endpoints that did
-- not exist. These tables make the modules real.
--
-- Bed rows are facility inventory (not patient data), so a small, fixed ward
-- layout is seeded. Admissions reference a registered patient account; a bed
-- cannot be occupied by an unregistered name.
--
-- Uploaded documents keep only metadata in D1. The file body lives in R2 under
-- the DOCUMENTS binding; deleting a document is a soft delete so clinical
-- history is retained.
--
-- Idempotent: CREATE ... IF NOT EXISTS and INSERT OR IGNORE.

-- ---------------------------------------------------------------------------
-- 1. Beds (facility inventory)
--    status: available | occupied | maintenance
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beds (
  id TEXT PRIMARY KEY,
  ward_type TEXT NOT NULL,
  bed_number TEXT NOT NULL,
  floor TEXT,
  room_number TEXT,
  daily_rate INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'UGX',
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'occupied', 'maintenance')),
  current_patient_user_id TEXT REFERENCES users(id),
  attending_clinician_user_id TEXT REFERENCES users(id),
  admitted_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (ward_type, bed_number)
);

CREATE INDEX IF NOT EXISTS idx_beds_ward ON beds(ward_type, status);
CREATE INDEX IF NOT EXISTS idx_beds_patient ON beds(current_patient_user_id);

-- ---------------------------------------------------------------------------
-- 2. Admissions (one row per stay; discharge never overwrites the stay)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bed_admissions (
  id TEXT PRIMARY KEY,
  bed_id TEXT NOT NULL REFERENCES beds(id),
  patient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attending_clinician_user_id TEXT REFERENCES users(id),
  admitted_by TEXT REFERENCES users(id),
  admitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  discharged_at TEXT,
  discharge_notes TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_bed_admissions_bed ON bed_admissions(bed_id, admitted_at);
CREATE INDEX IF NOT EXISTS idx_bed_admissions_patient ON bed_admissions(patient_user_id, admitted_at);

-- ---------------------------------------------------------------------------
-- 3. Medical documents (metadata + R2 object key)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS medical_documents (
  id TEXT PRIMARY KEY,
  patient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uploaded_by TEXT REFERENCES users(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  notes TEXT,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_medical_documents_patient ON medical_documents(patient_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_medical_documents_created ON medical_documents(created_at);

-- ---------------------------------------------------------------------------
-- 4. Seed the ward layout (idempotent; safe to re-run)
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO beds (id, ward_type, bed_number, floor, room_number, daily_rate, currency, status)
VALUES
  ('bed_icu_01', 'ICU', 'ICU-01', '2nd floor', 'ICU-A', 250000, 'UGX', 'available'),
  ('bed_icu_02', 'ICU', 'ICU-02', '2nd floor', 'ICU-A', 250000, 'UGX', 'available'),
  ('bed_icu_03', 'ICU', 'ICU-03', '2nd floor', 'ICU-B', 250000, 'UGX', 'available'),
  ('bed_icu_04', 'ICU', 'ICU-04', '2nd floor', 'ICU-B', 250000, 'UGX', 'available'),
  ('bed_er_01', 'Emergency Room', 'ER-01', 'Ground floor', 'ER-1', 120000, 'UGX', 'available'),
  ('bed_er_02', 'Emergency Room', 'ER-02', 'Ground floor', 'ER-1', 120000, 'UGX', 'available'),
  ('bed_er_03', 'Emergency Room', 'ER-03', 'Ground floor', 'ER-2', 120000, 'UGX', 'available'),
  ('bed_er_04', 'Emergency Room', 'ER-04', 'Ground floor', 'ER-2', 120000, 'UGX', 'available'),
  ('bed_gw_01', 'General Ward', 'GW-01', '3rd floor', '301', 60000, 'UGX', 'available'),
  ('bed_gw_02', 'General Ward', 'GW-02', '3rd floor', '301', 60000, 'UGX', 'available'),
  ('bed_gw_03', 'General Ward', 'GW-03', '3rd floor', '302', 60000, 'UGX', 'available'),
  ('bed_gw_04', 'General Ward', 'GW-04', '3rd floor', '302', 60000, 'UGX', 'available'),
  ('bed_gw_05', 'General Ward', 'GW-05', '3rd floor', '303', 60000, 'UGX', 'available'),
  ('bed_gw_06', 'General Ward', 'GW-06', '3rd floor', '303', 60000, 'UGX', 'available'),
  ('bed_pd_01', 'Private Deluxe', 'PD-01', '4th floor', '401', 300000, 'UGX', 'available'),
  ('bed_pd_02', 'Private Deluxe', 'PD-02', '4th floor', '401', 300000, 'UGX', 'available'),
  ('bed_pd_03', 'Private Deluxe', 'PD-03', '4th floor', '402', 300000, 'UGX', 'available'),
  ('bed_pd_04', 'Private Deluxe', 'PD-04', '4th floor', '402', 300000, 'UGX', 'available');
