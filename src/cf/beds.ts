// src/cf/beds.ts
// Inpatient ward and bed management.
//
// Beds are facility inventory seeded by migration 005. An occupied bed always
// points at a registered patient account, and every admission keeps its own
// row in bed_admissions so discharging a patient does not erase the stay.

import * as auth from './auth';
import { resolvePatient } from './workflows';
import { recordActivity } from './patient_records';

type Ctx = ExecutionContext;

const DB = (): any => (auth as any).getEnv?.()?.DB;
const uid = (p = 'bed_') => p + crypto.randomUUID().replace(/-/g, '');

const ADMIN_ROLES = ['System Administrator', 'Administrator', 'Facility Administrator'];
const BED_ROLES = [...ADMIN_ROLES, 'Receptionist', 'Doctor', 'Clinician', 'Nurse', 'Midwife'];

const ok = (data: any, status = 200) => ({ status, json: { success: true, data } });
const err = (message: string, status = 400) => ({ status, json: { success: false, message } });

async function requireStaff(ctx: Ctx, token: string | null, ip: string | undefined, roles = BED_ROLES) {
  const a = await auth.requireAuth(ctx, token, ip);
  if (!a.ok) return a;
  if (a.user.role === 'Patient') {
    return { ok: false, status: 403, json: { success: false, message: 'Staff access required.' } } as any;
  }
  if (!roles.includes(a.user.role) && !ADMIN_ROLES.includes(a.user.role)) {
    return { ok: false, status: 403, json: { success: false, message: 'Not authorized for ward management.' } } as any;
  }
  return a;
}

function actorOf(user: any) {
  return { id: user.sub, email: user.email, role: user.role };
}

function mapBed(row: any) {
  return {
    id: row.id,
    wardType: row.ward_type,
    bedNumber: row.bed_number,
    floor: row.floor,
    roomNumber: row.room_number,
    dailyRate: Number(row.daily_rate || 0),
    currency: row.currency || 'UGX',
    status: row.status,
    admittedAt: row.admitted_at,
    notes: row.notes,
    patient: row.current_patient_user_id
      ? {
          id: row.current_patient_user_id,
          name: row.patient_name || 'Patient',
          patientNumber: row.patient_number || null,
          phone: row.patient_phone || null,
        }
      : null,
    clinician: row.attending_clinician_user_id
      ? { id: row.attending_clinician_user_id, name: row.clinician_name || 'Clinician' }
      : null,
  };
}

export async function listBeds(ctx: Ctx, token: string | null, url: string | null, ip?: string) {
  const a = await requireStaff(ctx, token, ip);
  if (!a.ok) return a;
  const ward = (url ? new URL(url).searchParams.get('wardType') : '') || '';
  const db = DB();

  const rowsRes = await db
    .prepare(
      `SELECT b.*,
              u.name AS patient_name, u.phone AS patient_phone,
              p.patient_number,
              c.name AS clinician_name
         FROM beds b
         LEFT JOIN users u ON u.id = b.current_patient_user_id
         LEFT JOIN patient_profiles p ON p.user_id = b.current_patient_user_id
         LEFT JOIN users c ON c.id = b.attending_clinician_user_id
        WHERE (? = '' OR b.ward_type = ?)
        ORDER BY b.ward_type, b.bed_number`,
    )
    .bind(ward, ward)
    .all();

  return ok({ items: (rowsRes?.results || []).map(mapBed), wardType: ward || null });
}

export async function getBedStats(ctx: Ctx, token: string | null, ip?: string) {
  const a = await requireStaff(ctx, token, ip);
  if (!a.ok) return a;
  const db = DB();
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status='available' THEN 1 ELSE 0 END) AS available,
              SUM(CASE WHEN status='occupied' THEN 1 ELSE 0 END) AS occupied,
              SUM(CASE WHEN status='maintenance' THEN 1 ELSE 0 END) AS maintenance
         FROM beds`,
    )
    .first<any>();
  const total = Number(row?.total || 0);
  const occupied = Number(row?.occupied || 0);
  return ok({
    totalBeds: total,
    availableBeds: Number(row?.available || 0),
    occupiedBeds: occupied,
    maintenanceBeds: Number(row?.maintenance || 0),
    occupancyRate: total ? Math.round((occupied / total) * 100) : 0,
  });
}

/**
 * Admit a registered patient to an available bed. The conditional UPDATE is the
 * concurrency guard: two staff cannot occupy the same bed from one click each.
 */
export async function allocateBed(ctx: Ctx, token: string | null, body: any, ip?: string) {
  const a = await requireStaff(ctx, token, ip, [...ADMIN_ROLES, 'Receptionist', 'Doctor', 'Clinician', 'Nurse', 'Midwife']);
  if (!a.ok) return a;

  const bedId = String(body?.bedId || body?.id || '').trim();
  if (!bedId) return err('Select a bed to admit the patient to.');

  const patient = await resolvePatient({
    patientUserId: body?.patientUserId,
    patientId: body?.patientId || body?.patientNumber,
    patientEmail: body?.patientEmail,
  });
  if (!patient) return err('Select a registered patient. A bed cannot be assigned to a name only.');

  const db = DB();
  const bed = await db.prepare(`SELECT * FROM beds WHERE id = ?`).bind(bedId).first<any>();
  if (!bed) return err('Bed not found.', 404);
  if (bed.status !== 'available') return err(`Bed ${bed.bed_number} is not available.`, 409);

  const existing = await db
    .prepare(`SELECT bed_number, ward_type FROM beds WHERE current_patient_user_id = ? AND status = 'occupied' LIMIT 1`)
    .bind(patient.id)
    .first<any>();
  if (existing) {
    return err(`This patient is already admitted to ${existing.bed_number} (${existing.ward_type}). Discharge that bed first.`, 409);
  }

  let clinicianId: string | null = String(body?.attendingClinicianUserId || body?.clinicianId || '').trim() || null;
  if (clinicianId) {
    const clinician = await db
      .prepare(`SELECT id FROM users WHERE id = ? AND role != 'Patient' AND deleted_at IS NULL`)
      .bind(clinicianId)
      .first<any>();
    if (!clinician) return err('Attending clinician not found.', 404);
  }

  const notes = String(body?.notes || '').slice(0, 1000) || null;
  const admissionId = uid('adm_');

  const update = await db
    .prepare(
      `UPDATE beds
          SET status = 'occupied',
              current_patient_user_id = ?,
              attending_clinician_user_id = ?,
              admitted_at = datetime('now'),
              notes = ?,
              updated_at = datetime('now')
        WHERE id = ? AND status = 'available'`,
    )
    .bind(patient.id, clinicianId, notes, bedId)
    .run();

  if (!update?.meta?.changes) return err('That bed was taken by another admission. Refresh and choose another bed.', 409);

  await db
    .prepare(
      `INSERT INTO bed_admissions
         (id, bed_id, patient_user_id, attending_clinician_user_id, admitted_by, admitted_at, notes)
       VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`,
    )
    .bind(admissionId, bedId, patient.id, clinicianId, a.user.sub, notes)
    .run();

  await recordActivity(
    patient.id,
    'patient.admission',
    `Admitted to ${bed.ward_type}`,
    `Bed ${bed.bed_number}${bed.room_number ? ` · Room ${bed.room_number}` : ''}.`,
    'bed_admission',
    admissionId,
    a.user.email || 'Care team',
  );

  await auth.audit(ctx, 'bed_allocated', actorOf(a.user), bedId, 'bed', {
    patientUserId: patient.id,
    admissionId,
  }, ip);

  const row = await db
    .prepare(
      `SELECT b.*, u.name AS patient_name, u.phone AS patient_phone, p.patient_number, c.name AS clinician_name
         FROM beds b
         LEFT JOIN users u ON u.id = b.current_patient_user_id
         LEFT JOIN patient_profiles p ON p.user_id = b.current_patient_user_id
         LEFT JOIN users c ON c.id = b.attending_clinician_user_id
        WHERE b.id = ?`,
    )
    .bind(bedId)
    .first<any>();

  return ok({ bed: mapBed(row), admissionId }, 201);
}

/** Release a bed and close the open admission row. */
export async function dischargeBed(ctx: Ctx, token: string | null, body: any, ip?: string) {
  const a = await requireStaff(ctx, token, ip, [...ADMIN_ROLES, 'Receptionist', 'Doctor', 'Clinician', 'Nurse', 'Midwife']);
  if (!a.ok) return a;

  const bedId = String(body?.bedId || body?.id || '').trim();
  if (!bedId) return err('Select a bed to discharge.');

  const db = DB();
  const bed = await db.prepare(`SELECT * FROM beds WHERE id = ?`).bind(bedId).first<any>();
  if (!bed) return err('Bed not found.', 404);
  if (bed.status !== 'occupied') return err('That bed is not currently occupied.', 409);

  const notes = String(body?.notes || body?.dischargeNotes || '').slice(0, 1000) || null;

  const update = await db
    .prepare(
      `UPDATE beds
          SET status = 'available',
              current_patient_user_id = NULL,
              attending_clinician_user_id = NULL,
              admitted_at = NULL,
              notes = NULL,
              updated_at = datetime('now')
        WHERE id = ? AND status = 'occupied'`,
    )
    .bind(bedId)
    .run();

  if (!update?.meta?.changes) return err('That bed was already released. Refresh to see the current state.', 409);

  await db
    .prepare(
      `UPDATE bed_admissions
          SET discharged_at = datetime('now'), discharge_notes = ?
        WHERE id = (
          SELECT id FROM bed_admissions
           WHERE bed_id = ? AND discharged_at IS NULL
           ORDER BY admitted_at DESC LIMIT 1
        )`,
    )
    .bind(notes, bedId)
    .run();

  if (bed.current_patient_user_id) {
    await recordActivity(
      bed.current_patient_user_id,
      'patient.discharge',
      `Discharged from ${bed.ward_type}`,
      `Bed ${bed.bed_number} released.${notes ? ` ${notes}` : ''}`,
      'bed',
      bedId,
      a.user.email || 'Care team',
    );
  }

  await auth.audit(ctx, 'bed_discharged', actorOf(a.user), bedId, 'bed', {
    patientUserId: bed.current_patient_user_id,
    notes,
  }, ip);

  return ok({ bedId, status: 'available' });
}
