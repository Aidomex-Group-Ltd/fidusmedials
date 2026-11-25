// src/cf/patient_records.ts
// Patient-facing clinical records: everything a patient is allowed to see about
// their own care, and nothing else.
//
// Security model
//   * Every handler resolves the caller through auth.requireAuth and then scopes
//     every SQL statement to `patient_user_id = caller.id`. There is no code
//     path that accepts a patient id from the client.
//   * Visibility is a function of record status, not of which endpoint is used:
//     laboratory results and imaging findings are withheld until a clinician has
//     released them (status='released').
//   * Patients may edit contact fields only. Clinical fields become
//     patient_change_requests for staff review.

import * as auth from './auth';
import * as notifications from './notifications';

type Ctx = ExecutionContext;

const DB = (): any => (auth as any).getEnv?.()?.DB;
const uid = (p = 'rec_') => p + crypto.randomUUID().replace(/-/g, '');

const ok = (data: any, message = 'OK') => ({ status: 200, json: { success: true, data, message } });
const err = (status: number, message: string) => ({ status, json: { success: false, message } });

type Result = { status: number; json: any };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** JSON columns are stored as text; never let a malformed value break a page. */
export function parseList(value: any): any[] {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function patientNumberFor(userId: string): string {
  // Deterministic, human-readable patient reference derived from the user id so
  // repeated calls (and concurrent requests) always agree.
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return 'PAT-' + String(h % 1000000).padStart(6, '0');
}

/**
 * Fetch (or lazily create) the caller's patient profile. The profile row is
 * optional so a patient registered before this table existed still gets a page.
 */
export async function ensurePatientProfile(user: { id: string; name?: string; email?: string; phone?: string }) {
  const db = DB();
  let profile = await db.prepare(`SELECT * FROM patient_profiles WHERE user_id = ?`).bind(user.id).first<any>();
  if (!profile) {
    const patientNumber = patientNumberFor(user.id);
    await db
      .prepare(
        `INSERT INTO patient_profiles (user_id, patient_number, preferred_name, created_at, updated_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(user_id) DO NOTHING`,
      )
      .bind(user.id, patientNumber, (user.name || '').split(' ')[0] || null)
      .run();
    profile = await db.prepare(`SELECT * FROM patient_profiles WHERE user_id = ?`).bind(user.id).first<any>();
  }
  return profile;
}

/** Append an entry to the patient's own activity feed. */
export async function recordActivity(
  patientUserId: string,
  type: string,
  title: string,
  body?: string | null,
  relatedType?: string | null,
  relatedId?: string | null,
  actorName?: string | null,
) {
  try {
    await DB()
      .prepare(
        `INSERT INTO patient_activity (id, patient_user_id, type, title, body, related_type, related_id, actor_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .bind(uid('act_'), patientUserId, type, title, body || null, relatedType || null, relatedId || null, actorName || null)
      .run();
  } catch {
    // The activity feed is derived data; never fail a clinical write because of it.
  }
}

/**
 * Publish a patient-visible event: in-app notification + activity entry.
 * Email is intentionally not used for clinical content (no PHI in mailboxes).
 */
export async function notifyPatient(
  ctx: Ctx,
  input: {
    type: string;
    patientUserId: string;
    title: string;
    message: string;
    relatedType?: string;
    relatedId?: string;
    actorName?: string;
    priority?: 'critical' | 'urgent' | 'high' | 'normal' | 'low';
  },
  ip?: string,
) {
  await recordActivity(
    input.patientUserId,
    input.type,
    input.title,
    input.message,
    input.relatedType,
    input.relatedId,
    input.actorName,
  );
  try {
    await notifications.emitEvent(
      ctx,
      {
        type: input.type,
        patientRef: null,
        relatedType: input.relatedType || null,
        relatedId: input.relatedId || null,
        priority: input.priority || 'normal',
        idempotencyKey: input.relatedId ? `${input.type}:${input.relatedId}` : null,
        payload: { message: input.message, patientUserId: input.patientUserId, title: input.title },
      },
      ip,
    );
  } catch {
    // Notification delivery must never roll back the underlying clinical record.
  }
}

async function requirePatient(ctx: Ctx, token: string | null, ip?: string) {
  const a = await auth.requireAuth(ctx, token, ip);
  if (!a.ok) return a;
  if (a.user.role !== 'Patient') {
    return { ok: false, status: 403, json: { success: false, message: 'Patient portal access requires a patient account.' } } as any;
  }
  const status = await DB().prepare(`SELECT status, access_revoked_at FROM users WHERE id = ?`).bind(a.user.sub).first<any>();
  if (!status || status.access_revoked_at) {
    return { ok: false, status: 403, json: { success: false, message: 'This account is no longer active.' } } as any;
  }
  return a;
}

function paginate(url: string | null) {
  const params = url ? new URL(url).searchParams : new URLSearchParams();
  const limit = Math.min(100, Math.max(1, Number(params.get('limit') || 20) || 20));
  const offset = Math.max(0, Number(params.get('offset') || 0) || 0);
  return { limit, offset };
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export async function getOverview(ctx: Ctx, token: string | null, ip?: string): Promise<Result> {
  const a = await requirePatient(ctx, token, ip);
  if (!a.ok) return a;
  const db = DB();
  const patientId = a.user.sub;

  const user = await db
    .prepare(`SELECT id, name, email, phone, date_of_birth, sex, blood_group, created_at FROM users WHERE id = ?`)
    .bind(patientId)
    .first<any>();
  const profile = await ensurePatientProfile({ id: patientId, name: user?.name });

  const [upcoming, counts, released, billing, activity] = await Promise.all([
    db
      .prepare(
        `SELECT * FROM appointments
          WHERE patient_user_id = ? AND status IN ('requested','confirmed','rescheduled','checked_in')
          ORDER BY COALESCE(scheduled_at, created_at) ASC LIMIT 5`,
      )
      .bind(patientId)
      .all(),
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM appointments WHERE patient_user_id = ?) AS appointments,
           (SELECT COUNT(*) FROM consultations WHERE patient_user_id = ?) AS consultations,
           (SELECT COUNT(*) FROM prescriptions WHERE patient_user_id = ? AND status NOT IN ('cancelled','expired','discontinued')) AS active_prescriptions,
           (SELECT COUNT(*) FROM lab_reports WHERE patient_user_id = ? AND status = 'released') AS lab_reports,
           (SELECT COUNT(*) FROM imaging_reports WHERE patient_user_id = ? AND status = 'released') AS imaging_reports`,
      )
      .bind(patientId, patientId, patientId, patientId, patientId)
      .first<any>(),
    db
      .prepare(
        `SELECT 'lab' AS kind, id, reference, test_name AS title, status, released_at AS available_at
           FROM lab_reports WHERE patient_user_id = ? AND status = 'released'
         UNION ALL
         SELECT 'imaging' AS kind, id, reference, exam_name AS title, status, released_at AS available_at
           FROM imaging_reports WHERE patient_user_id = ? AND status = 'released'
         ORDER BY available_at DESC LIMIT 5`,
      )
      .bind(patientId, patientId)
      .all(),
    db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN status IN ('issued','partially_paid','overdue') THEN MAX(total - amount_paid, 0) ELSE 0 END), 0) AS outstanding,
           SUM(CASE WHEN status IN ('issued','partially_paid','overdue') THEN 1 ELSE 0 END) AS open_invoices
         FROM invoices WHERE patient_user_id = ?`,
      )
      .bind(patientId)
      .first<any>(),
    db
      .prepare(`SELECT * FROM patient_activity WHERE patient_user_id = ? ORDER BY created_at DESC LIMIT 8`)
      .bind(patientId)
      .all(),
  ]);

  const completion = profileCompletion(profile, user);

  return ok({
    patient: {
      id: user?.id,
      name: user?.name,
      preferredName: profile?.preferred_name || (user?.name || '').split(' ')[0] || null,
      patientNumber: profile?.patient_number,
      email: user?.email,
      phone: user?.phone,
      dateOfBirth: user?.date_of_birth || null,
      sex: user?.sex || null,
      bloodGroup: user?.blood_group || null,
      facility: 'Fidus Medical Center',
      profileCompletion: completion,
    },
    metrics: {
      appointments: Number(counts?.appointments || 0),
      consultations: Number(counts?.consultations || 0),
      activePrescriptions: Number(counts?.active_prescriptions || 0),
      labReports: Number(counts?.lab_reports || 0),
      imagingReports: Number(counts?.imaging_reports || 0),
      outstandingBalance: Number(billing?.outstanding || 0),
      openInvoices: Number(billing?.open_invoices || 0),
      currency: 'UGX',
    },
    health: {
      allergies: parseList(profile?.allergies),
      conditions: parseList(profile?.conditions),
      carePlan: profile?.care_plan || null,
      hasClinicalHistory: !!(
        parseList(profile?.allergies).length ||
        parseList(profile?.conditions).length ||
        parseList(profile?.medical_history).length
      ),
    },
    upcomingAppointments: upcoming?.results || [],
    recentReports: released?.results || [],
    activity: activity?.results || [],
    pendingActions: [],
  });
}

function profileCompletion(profile: any, user: any) {
  const checks = [
    !!user?.name,
    !!user?.phone,
    !!user?.date_of_birth,
    !!profile?.address,
    !!profile?.emergency_contact_name,
    !!profile?.emergency_contact_phone,
  ];
  const done = checks.filter(Boolean).length;
  return { completed: done, total: checks.length, percent: Math.round((done / checks.length) * 100) };
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export async function listAppointments(ctx: Ctx, token: string | null, url: string | null, ip?: string): Promise<Result> {
  const a = await requirePatient(ctx, token, ip);
  if (!a.ok) return a;
  const db = DB();
  const { limit, offset } = paginate(url);
  const filter = url ? new URL(url).searchParams.get('filter') || 'all' : 'all';

  const where =
    filter === 'upcoming'
      ? `AND status IN ('requested','confirmed','rescheduled','checked_in')`
      : filter === 'past'
        ? `AND status IN ('completed','cancelled','no_show')`
        : '';

  const [rowsRes, totalRes] = await Promise.all([
    db
      .prepare(
        `SELECT * FROM appointments WHERE patient_user_id = ? ${where}
          ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT ? OFFSET ?`,
      )
      .bind(a.user.sub, limit, offset)
      .all(),
    db.prepare(`SELECT COUNT(*) AS c FROM appointments WHERE patient_user_id = ? ${where}`).bind(a.user.sub).first<any>(),
  ]);

  return ok({ items: rowsRes?.results || [], total: Number(totalRes?.c || 0), limit, offset, filter });
}

export async function requestAppointment(ctx: Ctx, token: string | null, body: any, ip?: string): Promise<Result> {
  const a = await requirePatient(ctx, token, ip);
  if (!a.ok) return a;

  const reason = String(body?.reason || '').trim();
  const department = String(body?.department || '').trim();
  if (!department) return err(400, 'Please choose a department for your appointment.');
  if (reason.length < 3) return err(400, 'Please describe the reason for your visit.');

  const scheduledAt = normalizeScheduledAt(body?.scheduledAt || body?.date, body?.time);
  if (scheduledAt === 'invalid') return err(400, 'Please choose a valid appointment date and time.');

  const db = DB();
  await ensurePatientProfile({ id: a.user.sub });
  const id = uid('apt_');
  const reference = 'APT-' + Date.now().toString(36).toUpperCase();

  await db
    .prepare(
      `INSERT INTO appointments
         (id, reference, patient_user_id, clinician_user_id, clinician_name, department, facility,
          appointment_type, reason, scheduled_at, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, datetime('now'), datetime('now'))`,
    )
    .bind(
      id,
      reference,
      a.user.sub,
      body?.clinicianUserId || null,
      body?.clinicianName || null,
      department,
      'Fidus Medical Center',
      String(body?.appointmentType || 'Consultation'),
      reason,
      scheduledAt,
      a.user.sub,
    )
    .run();

  await recordActivity(a.user.sub, 'appointment.requested', 'Appointment requested', `${department} — ${reason}`, 'appointment', id);
  try {
    await notifications.emitEvent(
      ctx,
      {
        type: 'appointment.booked',
        actor: { id: a.user.sub, role: 'Patient' },
        department: 'Reception',
        relatedType: 'appointment',
        relatedId: id,
        priority: 'normal',
        payload: {
          message: `New appointment request (${department}) awaiting confirmation.`,
          reference,
          patientUserId: a.user.sub,
        },
      },
      ip,
    );
  } catch {
    // staff notification is best effort
  }

  return ok(
    {
      id,
      reference,
      status: 'requested',
      department,
      scheduledAt,
      message: 'Your appointment request has been sent to reception for confirmation.',
    },
    'Appointment requested',
  );
}

export async function cancelAppointment(ctx: Ctx, token: string | null, body: any, ip?: string): Promise<Result> {
  const a = await requirePatient(ctx, token, ip);
  if (!a.ok) return a;
  const id = String(body?.id || '');
  if (!id) return err(400, 'Appointment id is required.');

  const db = DB();
  const appt = await db
    .prepare(`SELECT * FROM appointments WHERE id = ? AND patient_user_id = ?`)
    .bind(id, a.user.sub)
    .first<any>();
  if (!appt) return err(404, 'Appointment not found.');
  if (!['requested', 'confirmed', 'rescheduled'].includes(appt.status)) {
    return err(409, 'This appointment can no longer be cancelled online. Please contact the facility.');
  }

  const reason = String(body?.reason || '').slice(0, 500) || null;
  await db
    .prepare(
      `UPDATE appointments SET status = 'cancellation_requested', cancellation_reason = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .bind(reason, id)
    .run();

  await recordActivity(a.user.sub, 'appointment.cancellation_requested', 'Cancellation requested', reason, 'appointment', id);
  try {
    await notifications.emitEvent(
      ctx,
      {
        type: 'appointment.cancelled',
        actor: { id: a.user.sub, role: 'Patient' },
        department: 'Reception',
        relatedType: 'appointment',
        relatedId: id,
        priority: 'normal',
        payload: { message: `Patient requested cancellation of ${appt.reference}.`, reference: appt.reference, patientUserId: a.user.sub },
      },
      ip,
    );
  } catch {}

  return ok({ id, status: 'cancellation_requested' }, 'Cancellation request sent to reception.');
}

function normalizeScheduledAt(date: any, time: any): string | null | 'invalid' {
  if (!date) return null;
  const d = String(date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'invalid';
  const t = /^\d{2}:\d{2}$/.test(String(time || '')) ? String(time) : '09:00';
  const iso = new Date(`${d}T${t}:00Z`);
  if (Number.isNaN(iso.getTime())) return 'invalid';
  return iso.toISOString();
}

// ---------------------------------------------------------------------------
// Prescriptions
// ---------------------------------------------------------------------------

export async function listPrescriptions(ctx: Ctx, token: string | null, url: string | null, ip?: string): Promise<Result> {
  const a = await requirePatient(ctx, token, ip);
  if (!a.ok) return a;
  const { limit, offset } = paginate(url);
  const db = DB();
  const rowsRes = await db
    .prepare(
      `SELECT id, reference, medication, strength, dosage, route, frequency, duration, quantity,
              instructions, status, clinician_name, facility, dispensed_at, refills_allowed, refills_used,
              created_at, updated_at
         FROM prescriptions WHERE patient_user_id = ?
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(a.user.sub, limit, offset)
    .all();
  const total = await db.prepare(`SELECT COUNT(*) AS c FROM prescriptions WHERE patient_user_id = ?`).bind(a.user.sub).first<any>();
  return ok({ items: rowsRes?.results || [], total: Number(total?.c || 0), limit, offset });
}

// ---------------------------------------------------------------------------
// Laboratory + imaging reports
// ---------------------------------------------------------------------------

export async function listReports(ctx: Ctx, token: string | null, ip?: string): Promise<Result> {
  const a = await requirePatient(ctx, token, ip);
  if (!a.ok) return a;
  const db = DB();

  const [labRes, imagingRes] = await Promise.all([
    db
      .prepare(
        `SELECT id, reference, test_name, panel, requesting_clinician, requested_at, collected_at, status,
                verified_at, released_at, results_json, comments, facility
           FROM lab_reports WHERE patient_user_id = ? ORDER BY COALESCE(released_at, requested_at) DESC LIMIT 100`,
      )
      .bind(a.user.sub)
      .all(),
    db
      .prepare(
        `SELECT id, reference, modality, exam_name, requesting_clinician, requested_at, scheduled_at,
                performed_at, status, radiologist, findings, impression, verified_at, released_at, facility
           FROM imaging_reports WHERE patient_user_id = ? ORDER BY COALESCE(released_at, requested_at) DESC LIMIT 100`,
      )
      .bind(a.user.sub)
      .all(),
  ]);

  const lab = (labRes?.results || []).map((r: any) => {
    const released = r.status === 'released';
    // results_json must never travel to the client before release, not even in
    // raw form alongside the withheld `results` array.
    const { results_json: _results_json, ...safe } = r;
    return {
      ...safe,
      released,
      final: released,
      pendingReason: released ? null : pendingReasonForLab(r.status),
      // Clinical values are withheld until release, including for verified rows.
      results: released ? parseList(r.results_json) : [],
      comments: released ? r.comments : null,
    };
  });

  const imaging = (imagingRes?.results || []).map((r: any) => {
    const released = r.status === 'released';
    return {
      ...r,
      released,
      final: released,
      pendingReason: released ? null : pendingReasonForImaging(r.status),
      findings: released ? r.findings : null,
      impression: released ? r.impression : null,
    };
  });

  return ok({ lab, imaging });
}

function pendingReasonForLab(status: string) {
  const map: Record<string, string> = {
    requested: 'Requested — awaiting sample collection.',
    awaiting_collection: 'Awaiting sample collection.',
    collected: 'Sample received — processing has not started yet.',
    received: 'Received by the laboratory — processing has not started yet.',
    processing: 'Being processed by the laboratory.',
    awaiting_verification: 'Awaiting verification by a laboratory scientist.',
    verified: 'Verified — awaiting release to your portal.',
    cancelled: 'This test was cancelled. Contact the facility if you need it repeated.',
  };
  return map[status] || 'Result not yet available.';
}

function pendingReasonForImaging(status: string) {
  const map: Record<string, string> = {
    requested: 'Requested — awaiting scheduling.',
    scheduled: 'Examination scheduled.',
    awaiting_exam: 'Awaiting your examination appointment.',
    in_progress: 'Examination in progress.',
    completed: 'Examination completed — the report is being written.',
    report_pending: 'Report being prepared by the radiologist.',
    report_completed: 'Report completed — awaiting verification and release.',
    verified: 'Verified — awaiting release to your portal.',
    cancelled: 'This examination was cancelled.',
  };
  return map[status] || 'Report not yet available.';
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export async function listInvoices(ctx: Ctx, token: string | null, ip?: string): Promise<Result> {
  const a = await requirePatient(ctx, token, ip);
  if (!a.ok) return a;
  const db = DB();

  const [invRes, payRes] = await Promise.all([
    db
      .prepare(
        `SELECT id, number, service, items_json, subtotal, discount, tax, total, amount_paid, currency,
                status, issued_at, due_at, facility
           FROM invoices WHERE patient_user_id = ? ORDER BY issued_at DESC LIMIT 100`,
      )
      .bind(a.user.sub)
      .all(),
    db
      .prepare(
        `SELECT id, invoice_id, amount, currency, method, status, verified_at, created_at
           FROM invoice_payments WHERE patient_user_id = ? ORDER BY created_at DESC LIMIT 200`,
      )
      .bind(a.user.sub)
      .all(),
  ]);

  const payments = payRes?.results || [];
  const items = (invRes?.results || []).map((inv: any) => {
    const { items_json, ...safe } = inv;
    return {
      ...safe,
      items: parseList(items_json),
      outstanding: Math.max(Number(inv.total || 0) - Number(inv.amount_paid || 0), 0),
      payments: payments.filter((p: any) => p.invoice_id === inv.id),
    };
  });

  const outstanding = items
    .filter((i: any) => ['issued', 'partially_paid', 'overdue'].includes(i.status))
    .reduce((sum: number, i: any) => sum + i.outstanding, 0);

  return ok({ items, outstanding, currency: items[0]?.currency || 'UGX', payments });
}

// ---------------------------------------------------------------------------
// Medical profile
// ---------------------------------------------------------------------------

const EDITABLE_PROFILE_FIELDS = new Set([
  'preferred_name',
  'address',
  'city',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_relationship',
  'insurance_provider',
  'insurance_number',
]);
const CLINICAL_FIELDS = new Set(['allergies', 'conditions', 'medical_history', 'surgical_history', 'care_plan']);

export async function getProfile(ctx: Ctx, token: string | null, ip?: string): Promise<Result> {
  const a = await requirePatient(ctx, token, ip);
  if (!a.ok) return a;
  const db = DB();
  const profile = await ensurePatientProfile({ id: a.user.sub });
  const user = await db
    .prepare(
      `SELECT id, name, email, phone, date_of_birth, sex, blood_group, created_at FROM users WHERE id = ?`,
    )
    .bind(a.user.sub)
    .first<any>();

  const [consultations, documents] = await Promise.all([
    db
      .prepare(
        `SELECT id, clinician_name, department, diagnosis, treatment_plan, follow_up_required, follow_up_notes, created_at
           FROM consultations WHERE patient_user_id = ? ORDER BY created_at DESC LIMIT 20`,
      )
      .bind(a.user.sub)
      .all(),
    db
      .prepare(
        `SELECT id, reference, test_name AS title, 'laboratory' AS kind, released_at
           FROM lab_reports WHERE patient_user_id = ? AND status = 'released'
         UNION ALL
         SELECT id, reference, exam_name AS title, 'imaging' AS kind, released_at
           FROM imaging_reports WHERE patient_user_id = ? AND status = 'released'
         ORDER BY released_at DESC LIMIT 20`,
      )
      .bind(a.user.sub, a.user.sub)
      .all(),
  ]);

  return ok({
    personal: {
      name: user?.name,
      patientNumber: profile?.patient_number,
      preferredName: profile?.preferred_name,
      dateOfBirth: user?.date_of_birth || null,
      sex: user?.sex || null,
      bloodGroup: user?.blood_group || null,
      email: user?.email,
      phone: user?.phone,
      address: profile?.address || null,
      city: profile?.city || null,
      registeredAt: user?.created_at || null,
    },
    emergencyContact: {
      name: profile?.emergency_contact_name || null,
      phone: profile?.emergency_contact_phone || null,
      relationship: profile?.emergency_contact_relationship || null,
    },
    insurance: {
      provider: profile?.insurance_provider || null,
      number: profile?.insurance_number || null,
    },
    clinical: {
      allergies: parseList(profile?.allergies),
      conditions: parseList(profile?.conditions),
      medicalHistory: parseList(profile?.medical_history),
      surgicalHistory: parseList(profile?.surgical_history),
      carePlan: profile?.care_plan || null,
      bloodGroup: user?.blood_group || null,
    },
    consultations: consultations?.results || [],
    documents: documents?.results || [],
    editableFields: Array.from(EDITABLE_PROFILE_FIELDS),
    completion: profileCompletion(profile, user),
  });
}

export async function updateProfile(ctx: Ctx, token: string | null, body: any, ip?: string): Promise<Result> {
  const a = await requirePatient(ctx, token, ip);
  if (!a.ok) return a;

  const db = DB();
  await ensurePatientProfile({ id: a.user.sub });

  const updates: string[] = [];
  const values: any[] = [];
  const clinicalRequests: Array<{ field: string; value: any }> = [];

  for (const [key, rawValue] of Object.entries(body || {})) {
    if (rawValue === undefined) continue;
    if (EDITABLE_PROFILE_FIELDS.has(key)) {
      updates.push(`${key} = ?`);
      values.push(rawValue === null ? null : String(rawValue).slice(0, 500));
    } else if (key === 'phone') {
      // Handled below: phone is stored on users, not patient_profiles.
      continue;
    } else if (CLINICAL_FIELDS.has(key)) {
      clinicalRequests.push({ field: key, value: rawValue });
    } else {
      return err(400, `The field "${key}" cannot be edited from the patient portal.`);
    }
  }

  if (body?.phone !== undefined) {
    const rawPhone = String(body.phone || '').trim();
    if (!rawPhone) return err(400, 'Please enter a valid phone number.');
    const normalized = (auth as any).normalizeUgandanPhone?.(rawPhone) ?? rawPhone;
    await db.prepare(`UPDATE users SET phone = ?, updated_at = datetime('now') WHERE id = ?`).bind(normalized, a.user.sub).run();
  }

  if (updates.length) {
    await db
      .prepare(`UPDATE patient_profiles SET ${updates.join(', ')}, updated_at = datetime('now') WHERE user_id = ?`)
      .bind(...values, a.user.sub)
      .run();
  }

  for (const req of clinicalRequests) {
    await db
      .prepare(
        `INSERT INTO patient_change_requests (id, patient_user_id, field, current_value, requested_value, reason, status, created_at)
         VALUES (?, ?, ?, NULL, ?, NULL, 'pending', datetime('now'))`,
      )
      .bind(uid('chg_'), a.user.sub, req.field, JSON.stringify(req.value))
      .run();
  }

  await recordActivity(
    a.user.sub,
    'profile.updated',
    clinicalRequests.length ? 'Profile change submitted for review' : 'Profile updated',
    clinicalRequests.length ? `Clinical fields awaiting staff review: ${clinicalRequests.map((c) => c.field).join(', ')}` : null,
  );

  return ok(
    { updated: updates.length + (body?.phone ? 1 : 0), clinicalRequests: clinicalRequests.map((c) => c.field) },
    clinicalRequests.length
      ? 'Contact details saved. Clinical changes were sent to your care team for review.'
      : 'Profile updated.',
  );
}

// ---------------------------------------------------------------------------
// Activity + clinicians directory
// ---------------------------------------------------------------------------

export async function listActivity(ctx: Ctx, token: string | null, url: string | null, ip?: string): Promise<Result> {
  const a = await requirePatient(ctx, token, ip);
  if (!a.ok) return a;
  const { limit, offset } = paginate(url);
  const rowsRes = await DB()
    .prepare(`SELECT * FROM patient_activity WHERE patient_user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(a.user.sub, limit, offset)
    .all();
  return ok({ items: rowsRes?.results || [], limit, offset });
}

export async function listClinicians(ctx: Ctx, token: string | null, ip?: string): Promise<Result> {
  const a = await requirePatient(ctx, token, ip);
  if (!a.ok) return a;
  const rowsRes = await DB()
    .prepare(
      `SELECT id, name, role, department FROM users
        WHERE deleted_at IS NULL AND status = 'active'
          AND role IN ('Doctor','Clinician','Midwife','Nurse')
        ORDER BY role, name LIMIT 200`,
    )
    .all();
  return ok({ items: rowsRes?.results || [] });
}
