// src/cf/workflows.ts
// Staff-facing clinical workflows. Every function here is the write side of the
// patient portal: a record created or advanced by authorised staff becomes
// visible to exactly one patient, at the moment its status allows it.
//
// Guarantees
//   * A clinical record can only be created for a resolved, registered patient
//     (patient_user_id is NOT NULL), so nothing can be "orphaned" in staff-land.
//   * Every transition writes an audit trail via notifications' event log and,
//     where the patient should see it, a patient notification + activity entry.
//   * Patients can never call these functions: requireStaff rejects role Patient.

import * as auth from './auth';
import * as wf from './workflow_events';
import * as records from './patient_records';

type Ctx = ExecutionContext;

const DB = (): any => (auth as any).getEnv?.()?.DB;
const uid = (p = 'wf_') => p + crypto.randomUUID().replace(/-/g, '');
const ref = (p: string) => p + '-' + Date.now().toString(36).toUpperCase().slice(-6);

const ok = (data: any, status = 200) => ({ status, json: { success: true, data } });
const err = (message: string, status = 400) => ({ status, json: { success: false, message } });

const ADMIN_ROLES = ['System Administrator', 'Administrator', 'Facility Administrator'];

/** Authenticate and require a staff (non-patient) account, optionally role-limited. */
async function requireStaff(ctx: Ctx, token: string | null, ip: string | undefined, roles?: string[]) {
  const a = await auth.requireAuth(ctx, token, ip);
  if (!a.ok) return a;
  if (a.user.role === 'Patient') {
    return { ok: false, status: 403, json: { success: false, message: 'Staff access required.' } } as any;
  }
  if (roles && !roles.includes(a.user.role) && !ADMIN_ROLES.includes(a.user.role)) {
    return { ok: false, status: 403, json: { success: false, message: `This action requires one of: ${roles.join(', ')}` } } as any;
  }
  return a;
}

/**
 * Resolve the patient a staff action refers to. Accepts a user id, patient
 * number, or email — never a free-text name, because names are not identities.
 */
export async function resolvePatient(input: any) {
  const db = DB();
  const candidate = String(
    input?.patientUserId || input?.patientId || input?.patientRef || input?.patientEmail || input?.email || '',
  ).trim();
  if (!candidate) return null;
  const row = await db
    .prepare(
      `SELECT u.id, u.name, u.email, u.phone, p.patient_number
         FROM users u LEFT JOIN patient_profiles p ON p.user_id = u.id
        WHERE u.role = 'Patient' AND u.deleted_at IS NULL
          AND (u.id = ? OR u.email = ? OR p.patient_number = ?)
        LIMIT 1`,
    )
    .bind(candidate, candidate.toLowerCase(), candidate.toUpperCase())
    .first<any>();
  return row || null;
}

async function requirePatientRef(input: any) {
  const patient = await resolvePatient(input);
  if (!patient) {
    return {
      error: err('Select a registered patient. Records cannot be created against a name only — use the patient number or registered email.', 400),
    };
  }
  return { patient };
}

function actorName(actor: any) {
  return actor?.email || actor?.name || 'Care team';
}

// ---------------------------------------------------------------------------
// Directory (staff choose a patient to act on)
// ---------------------------------------------------------------------------

export async function listPatientsDirectory(ctx: Ctx, token: string | null, url: string | null, ip?: string) {
  const a = await requireStaff(ctx, token, ip);
  if (!a.ok) return a;
  const q = (url ? new URL(url).searchParams.get('q') : '') || '';
  const like = `%${q.trim().toLowerCase()}%`;
  const rowsRes = await DB()
    .prepare(
      `SELECT u.id, u.name, u.email, u.phone, u.date_of_birth, u.sex, u.status, p.patient_number
         FROM users u LEFT JOIN patient_profiles p ON p.user_id = u.id
        WHERE u.role = 'Patient' AND u.deleted_at IS NULL
          AND (? = '' OR lower(u.name) LIKE ? OR lower(u.email) LIKE ? OR p.patient_number LIKE ?)
        ORDER BY u.name LIMIT 50`,
    )
    .bind(q, like, like, `%${q.trim().toUpperCase()}%`)
    .all();
  return ok({ items: rowsRes?.results || [] });
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export async function createAppointment(ctx: Ctx, token: string | null, body: any, ip?: string) {
  const a = await requireStaff(ctx, token, ip, ['Receptionist', 'Doctor', 'Clinician', 'Nurse', 'Midwife']);
  if (!a.ok) return a;
  const resolved = await requirePatientRef(body);
  if ('error' in resolved) return resolved.error;
  const { patient } = resolved;

  const department = String(body?.department || 'General').slice(0, 80);
  const status = ['requested', 'confirmed'].includes(body?.status) ? body.status : 'confirmed';
  const id = uid('apt_');
  const reference = ref('APT');
  const scheduledAt = normalizeWhen(body?.scheduledAt || body?.appointmentDate || body?.date, body?.time || body?.timeSlot);

  await DB()
    .prepare(
      `INSERT INTO appointments
         (id, reference, patient_user_id, patient_ref, clinician_user_id, clinician_name, department, facility,
          appointment_type, reason, instructions, location, scheduled_at, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
    .bind(
      id,
      reference,
      patient.id,
      patient.patient_number || null,
      body?.clinicianUserId || body?.doctorUserId || null,
      body?.clinicianName || null,
      department,
      body?.facility || 'Fidus Medical Center',
      String(body?.appointmentType || body?.type || 'Consultation'),
      String(body?.reason || body?.reasonForVisit || '').slice(0, 500) || null,
      String(body?.instructions || '').slice(0, 1000) || null,
      String(body?.location || '').slice(0, 200) || null,
      scheduledAt,
      status,
      a.user.sub,
    )
    .run();

  await records.notifyPatient(
    ctx,
    {
      type: status === 'confirmed' ? 'patient.appointment.confirmed' : 'patient.appointment.requested',
      patientUserId: patient.id,
      title: status === 'confirmed' ? 'Appointment confirmed' : 'Appointment requested',
      message: `${department} with ${body?.clinicianName || 'the care team'}${scheduledAt ? ` on ${scheduledAt.slice(0, 16).replace('T', ' ')}` : ''}.`,
      relatedType: 'appointment',
      relatedId: id,
      actorName: actorName(a.user),
    },
    ip,
  );

  try {
    await wf.emitAppointmentBooked(
      ctx,
      a.user,
      {
        id,
        reference,
        patientRef: patient.patient_number,
        patientName: patient.name,
        department,
        date: scheduledAt || '',
        time: body?.time || body?.timeSlot || '',
        patientUserId: patient.id,
        doctorUserId: body?.clinicianUserId || null,
      },
      ip,
    );
  } catch {}

  return ok({ id, reference, status, patient: { id: patient.id, name: patient.name } }, 201);
}

export async function updateAppointmentStatus(ctx: Ctx, token: string | null, body: any, ip?: string) {
  const a = await requireStaff(ctx, token, ip, ['Receptionist', 'Doctor', 'Clinician', 'Nurse', 'Midwife']);
  if (!a.ok) return a;

  const id = String(body?.id || '');
  const next = String(body?.status || '');
  const ALLOWED = ['confirmed', 'rescheduled', 'checked_in', 'completed', 'cancelled', 'no_show'];
  if (!id) return err('Appointment id is required.');
  if (!ALLOWED.includes(next)) return err(`Status must be one of: ${ALLOWED.join(', ')}.`);

  const db = DB();
  const appt = await db.prepare(`SELECT * FROM appointments WHERE id = ?`).bind(id).first<any>();
  if (!appt) return err('Appointment not found.', 404);

  const isReschedule = next === 'rescheduled';
  const scheduledAt = isReschedule
    ? normalizeWhen(body?.scheduledAt || body?.date, body?.time)
    : appt.scheduled_at;

  await db
    .prepare(
      `UPDATE appointments
          SET status = ?, scheduled_at = COALESCE(?, scheduled_at),
              rescheduled_from = CASE WHEN ? THEN COALESCE(rescheduled_from, scheduled_at) ELSE rescheduled_from END,
              cancellation_reason = COALESCE(?, cancellation_reason),
              instructions = COALESCE(?, instructions),
              updated_at = datetime('now')
        WHERE id = ?`,
    )
    .bind(next, scheduledAt || null, isReschedule ? 1 : 0, body?.reason || null, body?.instructions || null, id)
    .run();

  const typeMap: Record<string, string> = {
    confirmed: 'patient.appointment.confirmed',
    rescheduled: 'patient.appointment.rescheduled',
    cancelled: 'patient.appointment.cancelled',
    completed: 'patient.appointment.completed',
    checked_in: 'patient.appointment.checked_in',
    no_show: 'patient.appointment.cancelled',
  };
  const titleMap: Record<string, string> = {
    confirmed: 'Appointment confirmed',
    rescheduled: 'Appointment rescheduled',
    cancelled: 'Appointment cancelled',
    completed: 'Appointment completed',
    checked_in: 'Checked in',
    no_show: 'Appointment missed',
  };

  await records.notifyPatient(
    ctx,
    {
      type: typeMap[next],
      patientUserId: appt.patient_user_id,
      title: titleMap[next],
      message:
        next === 'rescheduled'
          ? `Your ${appt.department} appointment moved to ${String(scheduledAt || '').slice(0, 16).replace('T', ' ')}.`
          : `${appt.department} appointment${body?.reason ? `: ${body.reason}` : ''}.`,
      relatedType: 'appointment',
      relatedId: id,
      actorName: actorName(a.user),
    },
    ip,
  );

  return ok({ id, status: next, scheduledAt });
}

// ---------------------------------------------------------------------------
// Consultations
// ---------------------------------------------------------------------------

export async function createConsultation(ctx: Ctx, token: string | null, body: any, ip?: string) {
  const a = await requireStaff(ctx, token, ip, ['Doctor', 'Clinician', 'Nurse', 'Midwife']);
  if (!a.ok) return a;
  const resolved = await requirePatientRef(body);
  if ('error' in resolved) return resolved.error;
  const { patient } = resolved;

  const id = uid('con_');
  const db = DB();
  await db
    .prepare(
      `INSERT INTO consultations
         (id, patient_user_id, patient_ref, appointment_id, clinician_user_id, clinician_name, department, facility,
          diagnosis, clinical_notes, treatment_plan, follow_up_required, follow_up_notes, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', datetime('now'))`,
    )
    .bind(
      id,
      patient.id,
      patient.patient_number || null,
      body?.appointmentId || null,
      a.user.sub,
      body?.clinicianName || a.user.email,
      String(body?.department || 'Medical Consultation'),
      body?.facility || 'Fidus Medical Center',
      String(body?.diagnosis || '').slice(0, 500) || null,
      String(body?.clinicalNotes || body?.notes || '').slice(0, 4000) || null,
      String(body?.treatmentPlan || '').slice(0, 2000) || null,
      body?.followUpRequired ? 1 : 0,
      String(body?.followUpNotes || '').slice(0, 1000) || null,
    )
    .run();

  if (body?.appointmentId) {
    await db
      .prepare(`UPDATE appointments SET status = 'completed', updated_at = datetime('now') WHERE id = ?`)
      .bind(body.appointmentId)
      .run();
  }

  await records.notifyPatient(
    ctx,
    {
      type: 'patient.consultation.completed',
      patientUserId: patient.id,
      title: 'Consultation completed',
      message: 'Your consultation summary is available in your medical profile.',
      relatedType: 'consultation',
      relatedId: id,
      actorName: actorName(a.user),
    },
    ip,
  );

  try {
    await wf.emitConsultationRegistered(
      ctx,
      a.user,
      { id, reference: id, patientRef: patient.patient_number, patientName: patient.name, clinicianUserId: a.user.sub },
      ip,
    );
  } catch {}

  return ok({ id, status: 'completed' }, 201);
}

// ---------------------------------------------------------------------------
// Prescriptions
// ---------------------------------------------------------------------------

export async function createPrescription(ctx: Ctx, token: string | null, body: any, ip?: string) {
  const a = await requireStaff(ctx, token, ip, ['Doctor', 'Clinician', 'Pharmacy Staff']);
  if (!a.ok) return a;
  const resolved = await requirePatientRef(body);
  if ('error' in resolved) return resolved.error;
  const { patient } = resolved;

  const medication = String(body?.medication || body?.drug || '').trim();
  if (!medication) return err('Medication name is required.');

  const id = uid('rx_');
  const reference = ref('RX');
  await DB()
    .prepare(
      `INSERT INTO prescriptions
         (id, reference, patient_user_id, patient_ref, consultation_id, clinician_user_id, clinician_name, facility,
          department, medication, strength, dosage, route, frequency, duration, quantity, instructions,
          refills_allowed, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?, datetime('now'), datetime('now'))`,
    )
    .bind(
      id,
      reference,
      patient.id,
      patient.patient_number || null,
      body?.consultationId || null,
      a.user.sub,
      body?.clinicianName || a.user.email,
      body?.facility || 'Fidus Medical Center',
      String(body?.department || 'Pharmacy'),
      medication.slice(0, 200),
      String(body?.strength || '').slice(0, 60) || null,
      String(body?.dosage || '').slice(0, 120) || null,
      String(body?.route || '').slice(0, 60) || null,
      String(body?.frequency || '').slice(0, 120) || null,
      String(body?.duration || '').slice(0, 120) || null,
      String(body?.quantity || '').slice(0, 60) || null,
      String(body?.instructions || '').slice(0, 1000) || null,
      Number(body?.refillsAllowed || 0) || 0,
      a.user.sub,
    )
    .run();

  await records.notifyPatient(
    ctx,
    {
      type: 'patient.prescription.issued',
      patientUserId: patient.id,
      title: 'New prescription issued',
      message: `${medication}${body?.frequency ? ` — ${body.frequency}` : ''}. Open your prescriptions for full instructions.`,
      relatedType: 'prescription',
      relatedId: id,
      actorName: actorName(a.user),
    },
    ip,
  );

  try {
    await wf.emitPrescriptionCreated(ctx, a.user, { id, reference, patientRef: patient.patient_number, patientName: patient.name }, ip);
  } catch {}

  return ok({ id, reference, status: 'issued' }, 201);
}

export async function dispensePrescription(ctx: Ctx, token: string | null, body: any, ip?: string) {
  const a = await requireStaff(ctx, token, ip, ['Pharmacy Staff']);
  if (!a.ok) return a;
  const id = String(body?.id || '');
  const status = String(body?.status || 'dispensed');
  const ALLOWED = ['processing', 'partially_dispensed', 'dispensed', 'cancelled'];
  if (!id) return err('Prescription id is required.');
  if (!ALLOWED.includes(status)) return err(`Status must be one of: ${ALLOWED.join(', ')}.`);

  const db = DB();
  const rx = await db.prepare(`SELECT * FROM prescriptions WHERE id = ?`).bind(id).first<any>();
  if (!rx) return err('Prescription not found.', 404);

  await db
    .prepare(
      `UPDATE prescriptions
          SET status = ?, pharmacy_note = COALESCE(?, pharmacy_note),
              dispensed_at = CASE WHEN ? = 'dispensed' THEN datetime('now') ELSE dispensed_at END,
              dispensed_by = CASE WHEN ? = 'dispensed' THEN ? ELSE dispensed_by END,
              updated_at = datetime('now')
        WHERE id = ?`,
    )
    .bind(status, body?.note || null, status, status, a.user.sub, id)
    .run();

  await records.notifyPatient(
    ctx,
    {
      type: status === 'dispensed' ? 'patient.prescription.dispensed' : 'patient.prescription.status',
      patientUserId: rx.patient_user_id,
      title: status === 'dispensed' ? 'Prescription dispensed' : 'Prescription status updated',
      message: `${rx.medication} — ${status.replace(/_/g, ' ')}.`,
      relatedType: 'prescription',
      relatedId: id,
      actorName: actorName(a.user),
    },
    ip,
  );

  return ok({ id, status });
}

// ---------------------------------------------------------------------------
// Laboratory
// ---------------------------------------------------------------------------

export async function createLabRequest(ctx: Ctx, token: string | null, body: any, ip?: string) {
  const a = await requireStaff(ctx, token, ip, ['Doctor', 'Clinician', 'Nurse', 'Midwife', 'Laboratory Staff']);
  if (!a.ok) return a;
  const resolved = await requirePatientRef(body);
  if ('error' in resolved) return resolved.error;
  const { patient } = resolved;

  const tests: string[] = Array.isArray(body?.tests) && body.tests.length
    ? body.tests
    : [String(body?.testName || body?.test || '').trim()].filter(Boolean);
  if (!tests.length) return err('At least one laboratory test is required.');

  const db = DB();
  const created: any[] = [];
  for (const test of tests.slice(0, 20)) {
    const id = uid('lab_');
    const reference = ref('LAB');
    await db
      .prepare(
        `INSERT INTO lab_reports
           (id, reference, patient_user_id, patient_ref, test_name, panel, requesting_clinician, requested_by,
            requested_at, status, facility, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'requested', ?, datetime('now'), datetime('now'))`,
      )
      .bind(
        id,
        reference,
        patient.id,
        patient.patient_number || null,
        String(test).slice(0, 200),
        body?.panel || null,
        body?.requestingClinician || a.user.email,
        a.user.sub,
        body?.facility || 'Fidus Medical Center',
      )
      .run();
    created.push({ id, reference, test });
  }

  await records.notifyPatient(
    ctx,
    {
      type: 'patient.lab.requested',
      patientUserId: patient.id,
      title: 'Laboratory test requested',
      message: `${created.map((c) => c.test).join(', ')}. You will be notified when results are released.`,
      relatedType: 'lab_report',
      relatedId: created[0]?.id,
      actorName: actorName(a.user),
    },
    ip,
  );

  try {
    await wf.emitLabRequestCreated(
      ctx,
      a.user,
      { id: created[0].id, reference: created[0].reference, patientRef: patient.patient_number, patientName: patient.name },
      ip,
    );
  } catch {}

  return ok({ items: created }, 201);
}

export async function updateLabStatus(ctx: Ctx, token: string | null, body: any, ip?: string) {
  const a = await requireStaff(ctx, token, ip, ['Laboratory Staff', 'Doctor', 'Clinician']);
  if (!a.ok) return a;
  const id = String(body?.id || '');
  const status = String(body?.status || '');
  const ALLOWED = ['awaiting_collection', 'collected', 'received', 'processing', 'awaiting_verification', 'cancelled'];
  if (!id) return err('Laboratory report id is required.');
  if (!ALLOWED.includes(status)) return err(`Status must be one of: ${ALLOWED.join(', ')}.`);

  const db = DB();
  const report = await db.prepare(`SELECT * FROM lab_reports WHERE id = ?`).bind(id).first<any>();
  if (!report) return err('Laboratory report not found.', 404);

  const stamp =
    status === 'collected'
      ? `, collected_at = COALESCE(collected_at, datetime('now'))`
      : status === 'received'
        ? `, received_at = COALESCE(received_at, datetime('now'))`
        : '';

  await db
    .prepare(`UPDATE lab_reports SET status = ?, updated_at = datetime('now') ${stamp} WHERE id = ?`)
    .bind(status, id)
    .run();

  await records.notifyPatient(
    ctx,
    {
      type: 'patient.lab.status',
      patientUserId: report.patient_user_id,
      title: 'Laboratory update',
      message: `${report.test_name}: ${status.replace(/_/g, ' ')}.`,
      relatedType: 'lab_report',
      relatedId: id,
      actorName: actorName(a.user),
    },
    ip,
  );

  return ok({ id, status });
}

export async function completeLabResult(ctx: Ctx, token: string | null, body: any, ip?: string) {
  const a = await requireStaff(ctx, token, ip, ['Laboratory Staff']);
  if (!a.ok) return a;

  const db = DB();
  const results = Array.isArray(body?.results) ? body.results : Array.isArray(body?.values) ? body.values : [];
  const release = body?.release !== false; // releasing is the default: patients need results
  const id = String(body?.id || '');

  let report = id ? await db.prepare(`SELECT * FROM lab_reports WHERE id = ?`).bind(id).first<any>() : null;

  if (!report) {
    const resolved = await requirePatientRef(body);
    if ('error' in resolved) return resolved.error;
    const newId = id || uid('lab_');
    const reference = ref('LAB');
    await db
      .prepare(
        `INSERT INTO lab_reports
           (id, reference, patient_user_id, patient_ref, test_name, panel, requesting_clinician, requested_by,
            requested_at, status, facility, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'processing', ?, datetime('now'), datetime('now'))`,
      )
      .bind(
        newId,
        reference,
        resolved.patient.id,
        resolved.patient.patient_number || null,
        String(body?.testName || body?.test || 'Laboratory test').slice(0, 200),
        body?.panel || null,
        body?.requestingClinician || a.user.email,
        a.user.sub,
        body?.facility || 'Fidus Medical Center',
      )
      .run();
    report = await db.prepare(`SELECT * FROM lab_reports WHERE id = ?`).bind(newId).first<any>();
  }

  if (body?.critical) {
    return finishLab(ctx, a, report, {
      status: 'awaiting_verification',
      results: [],
      comments: 'Critical result — requires clinician acknowledgement before release.',
      ip,
      release: false,
    });
  }

  return finishLab(ctx, a, report, {
    status: release ? 'released' : 'verified',
    results,
    comments: body?.comments || null,
    ip,
    release,
  });
}

async function finishLab(
  ctx: Ctx,
  actor: any,
  report: any,
  opts: { status: string; results: any[]; comments: string | null; ip?: string; release: boolean },
) {
  const db = DB();
  await db
    .prepare(
      `UPDATE lab_reports
          SET status = ?, results_json = ?, comments = ?, verified_by = ?, verified_at = datetime('now'),
              released_at = CASE WHEN ? THEN datetime('now') ELSE released_at END,
              updated_at = datetime('now')
        WHERE id = ?`,
    )
    .bind(
      opts.status,
      opts.results.length ? JSON.stringify(opts.results) : report.results_json || null,
      opts.comments,
      actor.user.sub,
      opts.release ? 1 : 0,
      report.id,
    )
    .run();

  await records.notifyPatient(
    ctx,
    {
      type: opts.release ? 'patient.lab.released' : 'patient.lab.status',
      patientUserId: report.patient_user_id,
      title: opts.release ? 'Laboratory result available' : 'Laboratory result verified',
      message: opts.release
        ? `${report.test_name} results have been released. Open your reports to view them.`
        : `${report.test_name} has been verified and is awaiting release.`,
      relatedType: 'lab_report',
      relatedId: report.id,
      actorName: actorName(actor.user),
      priority: 'normal',
    },
    opts.ip,
  );

  try {
    await wf.emitLabResultCompleted(
      ctx,
      actor.user,
      {
        id: report.id,
        reference: report.reference,
        patientRef: report.patient_ref,
        patientName: report.patient_ref,
        critical: false,
      },
      opts.ip,
    );
  } catch {}

  return ok({ id: report.id, status: opts.status, released: opts.release }, 201);
}

// ---------------------------------------------------------------------------
// Radiology / imaging
// ---------------------------------------------------------------------------

export async function createRadiologyRequest(ctx: Ctx, token: string | null, body: any, ip?: string) {
  const a = await requireStaff(ctx, token, ip, ['Doctor', 'Clinician', 'Nurse', 'Midwife', 'Radiology Staff']);
  if (!a.ok) return a;
  const resolved = await requirePatientRef(body);
  if ('error' in resolved) return resolved.error;
  const { patient } = resolved;

  const examName = String(body?.examName || body?.exam || '').trim();
  if (!examName) return err('Examination name is required.');

  const id = uid('img_');
  const reference = ref('IMG');
  await DB()
    .prepare(
      `INSERT INTO imaging_reports
         (id, reference, patient_user_id, patient_ref, modality, exam_name, requesting_clinician, requested_by,
          requested_at, scheduled_at, status, facility, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, 'requested', ?, datetime('now'), datetime('now'))`,
    )
    .bind(
      id,
      reference,
      patient.id,
      patient.patient_number || null,
      body?.modality || null,
      examName.slice(0, 200),
      body?.requestingClinician || a.user.email,
      a.user.sub,
      normalizeWhen(body?.scheduledAt || body?.date, body?.time),
      body?.facility || 'Fidus Medical Center',
    )
    .run();

  await records.notifyPatient(
    ctx,
    {
      type: 'patient.imaging.requested',
      patientUserId: patient.id,
      title: 'Imaging examination requested',
      message: `${examName}${body?.modality ? ` (${body.modality})` : ''}. You will be notified when the report is released.`,
      relatedType: 'imaging_report',
      relatedId: id,
      actorName: actorName(a.user),
    },
    ip,
  );

  try {
    await wf.emitRadiologyRequestCreated(
      ctx,
      a.user,
      { id, reference, patientRef: patient.patient_number, patientName: patient.name },
      ip,
    );
  } catch {}

  return ok({ id, reference, status: 'requested' }, 201);
}

export async function updateImagingStatus(ctx: Ctx, token: string | null, body: any, ip?: string) {
  const a = await requireStaff(ctx, token, ip, ['Radiology Staff', 'Doctor', 'Clinician']);
  if (!a.ok) return a;
  const id = String(body?.id || '');
  const status = String(body?.status || '');
  const ALLOWED = ['scheduled', 'awaiting_exam', 'in_progress', 'completed', 'report_pending', 'cancelled'];
  if (!id) return err('Imaging report id is required.');
  if (!ALLOWED.includes(status)) return err(`Status must be one of: ${ALLOWED.join(', ')}.`);

  const db = DB();
  const report = await db.prepare(`SELECT * FROM imaging_reports WHERE id = ?`).bind(id).first<any>();
  if (!report) return err('Imaging report not found.', 404);

  const stamp =
    status === 'scheduled'
      ? `, scheduled_at = COALESCE(?, scheduled_at)`
      : status === 'completed' || status === 'in_progress'
        ? `, performed_at = COALESCE(performed_at, datetime('now'))`
        : '';

  const statement = db.prepare(`UPDATE imaging_reports SET status = ?, updated_at = datetime('now') ${stamp} WHERE id = ?`);
  if (status === 'scheduled') {
    await statement.bind(status, normalizeWhen(body?.scheduledAt || body?.date, body?.time), id).run();
  } else {
    await statement.bind(status, id).run();
  }

  await records.notifyPatient(
    ctx,
    {
      type: 'patient.imaging.status',
      patientUserId: report.patient_user_id,
      title: 'Imaging update',
      message: `${report.exam_name}: ${status.replace(/_/g, ' ')}.`,
      relatedType: 'imaging_report',
      relatedId: id,
      actorName: actorName(a.user),
    },
    ip,
  );

  return ok({ id, status });
}

export async function completeRadiologyReport(ctx: Ctx, token: string | null, body: any, ip?: string) {
  const a = await requireStaff(ctx, token, ip, ['Radiology Staff']);
  if (!a.ok) return a;

  const db = DB();
  const id = String(body?.id || '');
  const release = body?.release !== false;
  let report = id ? await db.prepare(`SELECT * FROM imaging_reports WHERE id = ?`).bind(id).first<any>() : null;

  if (!report) {
    const resolved = await requirePatientRef(body);
    if ('error' in resolved) return resolved.error;
    const newId = id || uid('img_');
    const reference = ref('IMG');
    await db
      .prepare(
        `INSERT INTO imaging_reports
           (id, reference, patient_user_id, patient_ref, modality, exam_name, requesting_clinician, requested_by,
            requested_at, performed_at, status, facility, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 'report_pending', ?, datetime('now'), datetime('now'))`,
      )
      .bind(
        newId,
        reference,
        resolved.patient.id,
        resolved.patient.patient_number || null,
        body?.modality || null,
        String(body?.examName || body?.exam || 'Imaging examination').slice(0, 200),
        body?.requestingClinician || a.user.email,
        a.user.sub,
        body?.facility || 'Fidus Medical Center',
      )
      .run();
    report = await db.prepare(`SELECT * FROM imaging_reports WHERE id = ?`).bind(newId).first<any>();
  }

  const status = release ? 'released' : 'verified';
  await db
    .prepare(
      `UPDATE imaging_reports
          SET status = ?, findings = ?, impression = ?, radiologist = ?, verified_by = ?,
              verified_at = datetime('now'),
              released_at = CASE WHEN ? THEN datetime('now') ELSE released_at END,
              performed_at = COALESCE(performed_at, datetime('now')),
              updated_at = datetime('now')
        WHERE id = ?`,
    )
    .bind(
      status,
      body?.findings || report.findings || null,
      body?.impression || report.impression || null,
      body?.radiologist || a.user.email,
      a.user.sub,
      release ? 1 : 0,
      report.id,
    )
    .run();

  await records.notifyPatient(
    ctx,
    {
      type: release ? 'patient.imaging.released' : 'patient.imaging.status',
      patientUserId: report.patient_user_id,
      title: release ? 'Imaging report available' : 'Imaging report verified',
      message: release
        ? `${report.exam_name} report has been released. Open your scans and reports to view it.`
        : `${report.exam_name} report is verified and awaiting release.`,
      relatedType: 'imaging_report',
      relatedId: report.id,
      actorName: actorName(a.user),
    },
    ip,
  );

  try {
    await wf.emitRadiologyReportCompleted(
      ctx,
      a.user,
      { id: report.id, reference: report.reference, patientRef: report.patient_ref, patientName: report.patient_ref },
      ip,
    );
  } catch {}

  return ok({ id: report.id, status, released: release }, 201);
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export async function createInvoice(ctx: Ctx, token: string | null, body: any, ip?: string) {
  const a = await requireStaff(ctx, token, ip, ['Admin & Finance', 'Billing / Finance Staff', 'Receptionist']);
  if (!a.ok) return a;
  const resolved = await requirePatientRef(body);
  if ('error' in resolved) return resolved.error;
  const { patient } = resolved;

  const rawItems = Array.isArray(body?.items) ? body.items : [];
  const items = rawItems
    .map((i: any) => ({
      description: String(i?.description || i?.service || 'Service').slice(0, 200),
      quantity: Number(i?.quantity || 1) || 1,
      unit_price: Number(i?.unit_price ?? i?.unitPrice ?? 0) || 0,
      amount: Number(i?.amount ?? (Number(i?.quantity || 1) || 1) * (Number(i?.unit_price ?? i?.unitPrice ?? 0) || 0)),
    }))
    .filter((i: any) => i.amount >= 0);

  const subtotal = items.reduce((s: number, i: any) => s + i.amount, 0) || Number(body?.total || 0);
  if (!items.length && !subtotal) return err('An invoice needs at least one line item with an amount.');
  const discount = Number(body?.discount || 0) || 0;
  const tax = Number(body?.tax || 0) || 0;
  const total = Math.max(subtotal - discount + tax, 0);

  const id = uid('inv_');
  const number = 'INV-' + Date.now().toString(36).toUpperCase();
  await DB()
    .prepare(
      `INSERT INTO invoices
         (id, number, patient_user_id, patient_ref, appointment_id, facility, service, items_json,
          subtotal, discount, tax, total, amount_paid, currency, status, issued_at, due_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'issued', datetime('now'), ?, ?, datetime('now'), datetime('now'))`,
    )
    .bind(
      id,
      number,
      patient.id,
      patient.patient_number || null,
      body?.appointmentId || null,
      body?.facility || 'Fidus Medical Center',
      String(body?.service || 'Medical services').slice(0, 200),
      JSON.stringify(items),
      subtotal,
      discount,
      tax,
      total,
      body?.currency || 'UGX',
      normalizeWhen(body?.dueAt, null),
      a.user.sub,
    )
    .run();

  await records.notifyPatient(
    ctx,
    {
      type: 'patient.invoice.issued',
      patientUserId: patient.id,
      title: 'New invoice',
      message: `${number} — ${body?.currency || 'UGX'} ${total.toLocaleString()}. Open invoices to view the itemised bill.`,
      relatedType: 'invoice',
      relatedId: id,
      actorName: actorName(a.user),
    },
    ip,
  );

  try {
    await wf.emitInvoiceGenerated(
      ctx,
      a.user,
      { id, reference: number, patientRef: patient.patient_number, patientName: patient.name, patientUserId: patient.id },
      ip,
    );
  } catch {}

  return ok({ id, number, total, currency: body?.currency || 'UGX', status: 'issued' }, 201);
}

export async function recordPayment(ctx: Ctx, token: string | null, body: any, ip?: string) {
  const a = await requireStaff(ctx, token, ip, ['Admin & Finance', 'Billing / Finance Staff']);
  if (!a.ok) return a;

  const invoiceId = String(body?.invoiceId || body?.id || '');
  const amount = Number(body?.amount || 0);
  if (!invoiceId) return err('Invoice id is required.');
  if (!(amount > 0)) return err('Payment amount must be greater than zero.');

  const db = DB();
  const invoice = await db.prepare(`SELECT * FROM invoices WHERE id = ?`).bind(invoiceId).first<any>();
  if (!invoice) return err('Invoice not found.', 404);

  const paymentId = uid('pay_');
  // Payments are recorded as unverified until the finance team confirms them.
  // Invoice balances only move on verification (see verifyPayment).
  await db
    .prepare(
      `INSERT INTO invoice_payments (id, invoice_id, patient_user_id, amount, currency, method, reference, status, recorded_by, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'recorded', ?, ?, datetime('now'))`,
    )
    .bind(
      paymentId,
      invoiceId,
      invoice.patient_user_id,
      amount,
      body?.currency || invoice.currency || 'UGX',
      String(body?.method || 'cash').slice(0, 60),
      String(body?.reference || '').slice(0, 120) || null,
      a.user.sub,
      String(body?.notes || '').slice(0, 500) || null,
    )
    .run();

  return ok({ id: paymentId, status: 'recorded', requiresVerification: true }, 201);
}

export async function listPayments(ctx: Ctx, token: string | null, _url: string | null, ip?: string) {
  const a = await requireStaff(ctx, token, ip, ['Admin & Finance', 'Billing / Finance Staff']);
  if (!a.ok) return a;
  const rowsRes = await DB()
    .prepare(
      `SELECT pay.*, inv.number AS invoice_number, inv.total AS invoice_total, inv.status AS invoice_status,
              u.name AS patient_name, p.patient_number
         FROM invoice_payments pay
         JOIN invoices inv ON inv.id = pay.invoice_id
         LEFT JOIN users u ON u.id = pay.patient_user_id
         LEFT JOIN patient_profiles p ON p.user_id = pay.patient_user_id
        ORDER BY pay.created_at DESC LIMIT 200`,
    )
    .all();
  return ok({ items: rowsRes?.results || [] });
}

export async function verifyPayment(ctx: Ctx, token: string | null, body: any, ip?: string) {
  const a = await requireStaff(ctx, token, ip, ['Admin & Finance', 'Billing / Finance Staff']);
  if (!a.ok) return a;

  const paymentId = String(body?.paymentId || body?.id || '');
  if (!paymentId) return err('Payment id is required.');

  const db = DB();
  const payment = await db.prepare(`SELECT * FROM invoice_payments WHERE id = ?`).bind(paymentId).first<any>();
  if (!payment) return err('Payment not found.', 404);

  if (body?.status === 'failed' || body?.status === 'refunded') {
    await db
      .prepare(`UPDATE invoice_payments SET status = ? WHERE id = ?`)
      .bind(body.status, paymentId)
      .run();
    return ok({ id: paymentId, status: body.status });
  }

  if (payment.status === 'verified') return ok({ id: paymentId, status: 'verified', duplicate: true });

  const invoice = await db.prepare(`SELECT * FROM invoices WHERE id = ?`).bind(payment.invoice_id).first<any>();
  if (!invoice) return err('Invoice not found.', 404);

  await db
    .prepare(`UPDATE invoice_payments SET status = 'verified', verified_at = datetime('now') WHERE id = ?`)
    .bind(paymentId)
    .run();

  const paid = Number(invoice.amount_paid || 0) + Number(payment.amount || 0);
  const total = Number(invoice.total || 0);
  const status = paid >= total - 0.001 ? 'paid' : paid > 0 ? 'partially_paid' : invoice.status;

  await db
    .prepare(`UPDATE invoices SET amount_paid = ?, status = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(paid, status, invoice.id)
    .run();

  await records.notifyPatient(
    ctx,
    {
      type: 'patient.payment.recorded',
      patientUserId: invoice.patient_user_id,
      title: 'Payment received',
      message: `${invoice.currency || 'UGX'} ${Number(payment.amount).toLocaleString()} recorded against ${invoice.number}.`,
      relatedType: 'invoice',
      relatedId: invoice.id,
      actorName: actorName(a.user),
    },
    ip,
  );

  return ok({ id: paymentId, status: 'verified', invoice: { id: invoice.id, amount_paid: paid, status } });
}

// ---------------------------------------------------------------------------
// Staff queues
// ---------------------------------------------------------------------------

export type WorkflowType =
  | 'appointment'
  | 'consultation'
  | 'prescription'
  | 'lab_request'
  | 'lab_result'
  | 'radiology_request'
  | 'radiology_report'
  | 'invoice';

const QUEUE_SCOPE: Record<string, { allRoles: string[]; ownerColumns: string[]; hasDepartment: boolean }> = {
  appointment: { allRoles: ['Receptionist'], ownerColumns: ['created_by', 'clinician_user_id'], hasDepartment: true },
  consultation: { allRoles: [], ownerColumns: ['clinician_user_id'], hasDepartment: true },
  prescription: { allRoles: ['Pharmacy Staff'], ownerColumns: ['created_by', 'clinician_user_id'], hasDepartment: true },
  lab_request: { allRoles: ['Laboratory Staff'], ownerColumns: ['requested_by'], hasDepartment: false },
  lab_result: { allRoles: ['Laboratory Staff'], ownerColumns: ['requested_by'], hasDepartment: false },
  radiology_request: { allRoles: ['Radiology Staff'], ownerColumns: ['requested_by'], hasDepartment: false },
  radiology_report: { allRoles: ['Radiology Staff'], ownerColumns: ['requested_by'], hasDepartment: false },
  invoice: { allRoles: ['Admin & Finance'], ownerColumns: ['created_by'], hasDepartment: false },
};

const TABLE_FOR_TYPE: Record<string, string> = {
  appointment: 'appointments',
  consultation: 'consultations',
  prescription: 'prescriptions',
  lab_request: 'lab_reports',
  lab_result: 'lab_reports',
  radiology_request: 'imaging_reports',
  radiology_report: 'imaging_reports',
  invoice: 'invoices',
};

/**
 * Role-scoped work queues. Previously this returned every row of a type to any
 * authenticated user (including patients); now it requires staff and limits
 * non-administrators to their own department or their own authored records.
 */
export async function listWorkflowItems(ctx: Ctx, token: string | null, type: string, ip?: string) {
  const a = await requireStaff(ctx, token, ip);
  if (!a.ok) return a;

  const table = TABLE_FOR_TYPE[type];
  if (!table) return err('Unknown workflow type.', 400);

  const actor: any = a.user;
  const isAdmin = ADMIN_ROLES.includes(actor.role);
  const department = actor.department || null;

  // Visibility per queue:
  //  * departmental queues (laboratory, radiology, pharmacy, finance) are
  //    facility-wide for the roles that work them — that is the job;
  //  * clinical queues (appointments, consultations) are limited to records the
  //    actor authored, is assigned to, or is a booker of.
  const scope = QUEUE_SCOPE[type] || { allRoles: [], ownerColumns: [] };
  const seesWholeQueue = isAdmin || scope.allRoles.includes(actor.role);

  const clauses: string[] = [];
  const binds: any[] = [];
  if (!seesWholeQueue) {
    const ownerClauses = scope.ownerColumns.map((column) => `t.${column} = ?`);
    if (department && scope.hasDepartment) ownerClauses.push('t.department = ?');
    if (!ownerClauses.length) {
      // The role has no legitimate queue here; return an empty result rather
      // than leaking the facility's records.
      return ok({ items: [], department, scoped: true });
    }
    clauses.push(`(${ownerClauses.join(' OR ')})`);
    scope.ownerColumns.forEach(() => binds.push(actor.sub));
    if (department && scope.hasDepartment) binds.push(department);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rowsRes = await DB()
    .prepare(
      `SELECT t.*, u.name AS patient_name, u.email AS patient_email, p.patient_number AS patient_number
         FROM ${table} t
         LEFT JOIN users u ON u.id = t.patient_user_id
         LEFT JOIN patient_profiles p ON p.user_id = t.patient_user_id
         ${where}
        ORDER BY t.created_at DESC LIMIT 200`,
    )
    .bind(...binds)
    .all();

  return ok({ items: rowsRes?.results || [], department, scoped: !isAdmin });
}

function normalizeWhen(date: any, time: any): string | null {
  if (!date) return null;
  const raw = String(date);
  // Accept an ISO timestamp as-is when it already carries a time component.
  if (raw.includes('T')) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10))) return null;
  const t = /^\d{2}:\d{2}$/.test(String(time || '')) ? String(time) : '09:00';
  const parsed = new Date(`${raw.slice(0, 10)}T${t}:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
