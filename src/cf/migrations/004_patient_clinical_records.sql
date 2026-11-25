-- Fidus staging: first-class clinical records shared by the staff and patient portals.
--
-- Design rules enforced here:
--  * Every patient-facing record carries patient_user_id -> users(id). This is
--    the join the patient portal reads and the only identity the API scopes by.
--  * Status columns are the single source of truth for visibility. A lab result
--    is patient-visible only once status='released' (see patient_records.ts).
--  * Records are append-only in spirit: corrections create a new row that
--    references the one it supersedes instead of overwriting clinical history.
--
-- Idempotent: all statements are CREATE ... IF NOT EXISTS.

-- ---------------------------------------------------------------------------
-- 1. Patient profile (extends users with patient-specific fields)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  patient_number TEXT NOT NULL UNIQUE,
  preferred_name TEXT,
  address TEXT,
  city TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  allergies TEXT,              -- JSON array of strings
  conditions TEXT,             -- JSON array of {name, since, status}
  medical_history TEXT,        -- JSON array of {event, date, notes}
  surgical_history TEXT,       -- JSON array of {procedure, date, facility}
  care_plan TEXT,
  insurance_provider TEXT,
  insurance_number TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_patient_profiles_number ON patient_profiles(patient_number);

-- ---------------------------------------------------------------------------
-- 2. Appointments
--    status: requested | confirmed | rescheduled | checked_in | completed
--            | cancelled | no_show | cancellation_requested
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  patient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_ref TEXT,
  clinician_user_id TEXT REFERENCES users(id),
  clinician_name TEXT,
  department TEXT NOT NULL DEFAULT 'General',
  facility TEXT,
  appointment_type TEXT DEFAULT 'Consultation',
  reason TEXT,
  instructions TEXT,
  location TEXT,
  scheduled_at TEXT,             -- ISO-8601 timestamp with timezone offset
  status TEXT NOT NULL DEFAULT 'requested',
  cancellation_reason TEXT,
  rescheduled_from TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_user_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_clinician ON appointments(clinician_user_id, scheduled_at);

-- ---------------------------------------------------------------------------
-- 3. Consultations (clinical encounter summaries)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consultations (
  id TEXT PRIMARY KEY,
  patient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_ref TEXT,
  appointment_id TEXT REFERENCES appointments(id),
  clinician_user_id TEXT REFERENCES users(id),
  clinician_name TEXT,
  department TEXT,
  facility TEXT,
  diagnosis TEXT,
  clinical_notes TEXT,
  treatment_plan TEXT,
  follow_up_required INTEGER NOT NULL DEFAULT 0,
  follow_up_notes TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_consultations_patient ON consultations(patient_user_id, created_at);

-- ---------------------------------------------------------------------------
-- 4. Prescriptions
--    status: issued | pending_pharmacy | processing | partially_dispensed
--            | dispensed | cancelled | expired | discontinued
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prescriptions (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  patient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_ref TEXT,
  consultation_id TEXT REFERENCES consultations(id),
  clinician_user_id TEXT REFERENCES users(id),
  clinician_name TEXT,
  facility TEXT,
  department TEXT,
  medication TEXT NOT NULL,
  strength TEXT,
  dosage TEXT,
  route TEXT,
  frequency TEXT,
  duration TEXT,
  quantity TEXT,
  instructions TEXT,
  refills_allowed INTEGER NOT NULL DEFAULT 0,
  refills_used INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'issued',
  dispensed_at TEXT,
  dispensed_by TEXT REFERENCES users(id),
  pharmacy_note TEXT,
  supersedes_id TEXT REFERENCES prescriptions(id),
  discontinued_reason TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(status);

-- ---------------------------------------------------------------------------
-- 5. Laboratory reports
--    status: requested | awaiting_collection | collected | received
--            | processing | awaiting_verification | verified | released
--            | cancelled
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lab_reports (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  patient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_ref TEXT,
  test_name TEXT NOT NULL,
  panel TEXT,
  requesting_clinician TEXT,
  requested_by TEXT REFERENCES users(id),
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  collected_at TEXT,
  received_at TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  verified_by TEXT REFERENCES users(id),
  verified_at TEXT,
  released_at TEXT,
  results_json TEXT,             -- [{name, value, unit, reference_range, flag}]
  comments TEXT,
  facility TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lab_reports_patient ON lab_reports(patient_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lab_reports_status ON lab_reports(status);

-- ---------------------------------------------------------------------------
-- 6. Radiology / imaging reports
--    status: requested | scheduled | awaiting_exam | in_progress | completed
--            | report_pending | report_completed | verified | released
--            | cancelled
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS imaging_reports (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  patient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_ref TEXT,
  modality TEXT,                 -- X-Ray | CT | MRI | Ultrasound | Mammography
  exam_name TEXT NOT NULL,
  requesting_clinician TEXT,
  requested_by TEXT REFERENCES users(id),
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  scheduled_at TEXT,
  performed_at TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  radiologist TEXT,
  findings TEXT,
  impression TEXT,
  verified_by TEXT REFERENCES users(id),
  verified_at TEXT,
  released_at TEXT,
  facility TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_imaging_patient ON imaging_reports(patient_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_imaging_status ON imaging_reports(status);

-- ---------------------------------------------------------------------------
-- 7. Invoices and payments
--    status: draft | issued | partially_paid | paid | overdue | cancelled | refunded
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  patient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_ref TEXT,
  appointment_id TEXT REFERENCES appointments(id),
  facility TEXT,
  service TEXT,
  items_json TEXT,               -- [{description, quantity, unit_price, amount}]
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'UGX',
  status TEXT NOT NULL DEFAULT 'issued',
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  due_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices(patient_user_id, issued_at);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  patient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'UGX',
  method TEXT,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'recorded', -- recorded | verified | failed | refunded
  recorded_by TEXT REFERENCES users(id),
  verified_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON invoice_payments(invoice_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_patient ON invoice_payments(patient_user_id, created_at);

-- ---------------------------------------------------------------------------
-- 8. Patient-facing activity feed
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_activity (
  id TEXT PRIMARY KEY,
  patient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  related_type TEXT,
  related_id TEXT,
  actor_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_patient_activity_patient ON patient_activity(patient_user_id, created_at);

-- ---------------------------------------------------------------------------
-- 9. Patient requests to change clinical information (staff decides)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_change_requests (
  id TEXT PRIMARY KEY,
  patient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  current_value TEXT,
  requested_value TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_change_requests_status ON patient_change_requests(status, created_at);

-- ---------------------------------------------------------------------------
-- 10. Notification subsystem (referenced by notifications.ts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1',
  facility_id TEXT,
  department TEXT,
  patient_ref TEXT,
  related_type TEXT,
  related_id TEXT,
  actor_id TEXT,
  actor_role TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  payload TEXT,
  idempotency_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_status ON system_events(status, created_at);
CREATE INDEX IF NOT EXISTS idx_events_type ON system_events(type);
CREATE INDEX IF NOT EXISTS idx_events_patient ON system_events(patient_ref);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES system_events(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 8,
  next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
  locked_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_outbox_status ON notification_outbox(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS notification_dead_letters (
  id TEXT PRIMARY KEY,
  outbox_id TEXT,
  event_id TEXT,
  payload TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'in_app',
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'unread',
  data TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, status, created_at);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  in_app INTEGER NOT NULL DEFAULT 1,
  email INTEGER NOT NULL DEFAULT 1,
  push INTEGER NOT NULL DEFAULT 0,
  sms INTEGER NOT NULL DEFAULT 0,
  categories_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_tasks (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  notification_id TEXT,
  assigned_user_id TEXT,
  department TEXT,
  patient_ref TEXT,
  category TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'new',
  acknowledged_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON notification_tasks(assigned_user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_department ON notification_tasks(department, status);
