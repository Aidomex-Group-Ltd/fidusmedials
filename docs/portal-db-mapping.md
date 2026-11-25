# Fidus Medical Center — Patient/Staff Portal Audit & Data Mapping

Audit of the existing Patient Portal and Facility Staff Portal, the gaps found
between them, and the mapping from each staff workflow to the patient-facing
record it must produce.

---

## 1. What existed before this pass

| Area | State found |
|---|---|
| Patient auth | Real: register, login, verify email, reset password on D1 with PBKDF2 + JWT sessions. |
| Staff auth | Real: invitations, applications, activation links, RBAC, MFA, audit. |
| Patient portal UI | Pages existed for six sections, but every data call targeted endpoints that were not implemented (`/api/appointments`, `/api/prescriptions`, `/api/billing/invoices`, `/api/upload/files`, `/api/dashboard/stats`, `/api/doctors`). All returned 404, so the portal rendered empty shells with hardcoded fallbacks (`PAT-1001`, `O+`, `₹0`). |
| Staff clinical writes | `/api/workflows/*` wrote every record — appointment, prescription, lab, radiology, invoice — into one generic `workflow_items` table with a free-text `patient_ref` and no foreign key to a patient account. |
| Patient reads of staff records | None. There was no query path from a patient session to `workflow_items`, so no staff action could ever surface in a patient account. |
| Notifications | `notifications.ts` referenced seven tables that did not exist in any migration, so `emitEvent` threw on the first insert. |
| Patient profile | No patient-specific table; only `users` columns (name, phone, DOB, sex, blood group). No allergies, conditions, history, emergency contact or insurance. |
| Portal routing | `AuthContext` used `staffService` without importing it (staff login crashed), and `App.jsx` referenced `AdminBootstrap` / `ResetPassword` without imports. |

## 2. Root cause

The two portals were not connected by data. Staff wrote to an inbox table; the
patient portal read from endpoints that did not exist. Everything below fixes
that single structural problem rather than adding new surface area.

## 3. Current mapping (implemented)

| Staff action | Endpoint | Table | Patient portal destination |
|---|---|---|---|
| Register patient | `POST /api/auth/register` | `users` + `patient_profiles` | Medical profile, health overview |
| Book / confirm appointment | `POST /api/workflows/appointments` | `appointments` | Appointments + overview |
| Reschedule / cancel / complete | `POST /api/workflows/appointments/status` | `appointments` | Appointments (status + new time) |
| Record consultation | `POST /api/workflows/consultations` | `consultations` | Profile → consultation history, activity |
| Issue prescription | `POST /api/workflows/pharmacy/prescriptions` | `prescriptions` | Prescriptions |
| Dispense / update prescription | `POST /api/workflows/pharmacy/dispense` | `prescriptions` | Prescriptions (dispense status) |
| Request lab test | `POST /api/workflows/lab/requests` | `lab_reports` | Lab reports (pending, with reason) |
| Advance lab status | `POST /api/workflows/lab/status` | `lab_reports` | Lab reports (collection/processing state) |
| Verify + release lab result | `POST /api/workflows/lab/results` | `lab_reports` | Lab reports (values appear only now) |
| Request imaging | `POST /api/workflows/radiology/requests` | `imaging_reports` | Scans and imaging (pending) |
| Schedule / perform exam | `POST /api/workflows/radiology/status` | `imaging_reports` | Scans and imaging (status) |
| Verify + release imaging report | `POST /api/workflows/radiology/reports` | `imaging_reports` | Scans and imaging (findings + impression) |
| Issue invoice | `POST /api/workflows/billing/invoices` | `invoices` | Invoices |
| Record payment | `POST /api/workflows/billing/payments` | `invoice_payments` | Invoice payment history (unverified) |
| Verify payment | `POST /api/workflows/billing/payments/verify` | `invoices`, `invoice_payments` | Invoice balance + status |
| Patient self-booking | `POST /api/patient/appointments` | `appointments` (`requested`) | Appointments + staff queue |
| Patient cancellation request | `POST /api/patient/appointments/cancel` | `appointments` (`cancellation_requested`) | Appointments + staff queue |
| Admit inpatient | `POST /api/beds/allocate` | `beds`, `bed_admissions` | Health overview activity |
| Discharge inpatient | `POST /api/beds/discharge` | `beds`, `bed_admissions` | Health overview activity |
| Upload medical document | `POST /api/documents` | `medical_documents` + R2 `DOCUMENTS` | Profile → Uploaded documents |
| Download document | `GET /api/documents/:id/file` | `medical_documents` + R2 | Profile → Uploaded documents |
| Delete document (soft) | `DELETE /api/documents/:id` | `medical_documents` | Staff vault; uploader or administrator |

Patient read endpoints — all scoped server-side to the authenticated patient:

`GET /api/patient/overview`, `/appointments`, `/prescriptions`, `/reports`,
`/invoices`, `/profile`, `/activity`, `/clinicians`; `PATCH /api/patient/profile`.

## 4. Access-control model

* `patient_user_id TEXT NOT NULL REFERENCES users(id)` on every clinical table.
  A record cannot exist without a registered patient, so no staff action can be
  orphaned from a portal account.
* Patient endpoints resolve the caller with `requireAuth`, require role
  `Patient`, and add `WHERE patient_user_id = caller.id` to every statement. No
  handler accepts a patient id from the client.
* Clinical visibility is a status function, not an endpoint function:
  * laboratory values are returned only when `status='released'` (the raw
    `results_json` column is stripped otherwise, so a verified-but-unreleased
    result cannot leak through a side field);
  * imaging findings/impression are returned only when `status='released'`;
  * everything else returns a human-readable pending reason.
* Patient-facing notifications use event types whose only recipient role is
  `Patient`, resolved from `payload.patientUserId` — patients are never
  bulk-matched by role. Staff event types no longer include `Patient`.
* Patient profile edits are allow-listed to contact fields. Clinical fields
  (`allergies`, `conditions`, `medical_history`, `surgical_history`, `care_plan`)
  are written to `patient_change_requests` for staff review, and unknown or
  protected fields (e.g. `date_of_birth`) are rejected with 400.
* Staff queues are role/department scoped: non-administrators see only their
  department's items or records they authored (previously every staff member —
  and any authenticated user — could read the entire queue).

## 5. Status

### Implemented and verified (local D1 + Vite Worker dev server)
* Schemas `004_patient_clinical_records.sql` and
  `005_beds_and_documents.sql` applied locally; all clinical, bed and document
  tables present.
* Staff → patient sync for appointments (create, reschedule, cancel), prescriptions
  (issue, dispense), laboratory (request → release), imaging (request → release),
  invoices and payments (record → verify, idempotent).
* Patient-scoped reads for all six portal sections; per-patient isolation proven
  with two accounts; staff token rejected by patient endpoints (403);
  unauthenticated rejected (401).
* Patient self-booking and cancellation requests appear in the staff queue.
* Notification delivery: patient receives portal notifications; the other patient
  receives none.
* Profile editing: contact fields update, clinical fields queue for review,
  protected fields refused.
* Staff dashboard statistics (`GET /api/dashboard/stats`) are live and role-scoped
  for every department portal.
* Wards & beds: 18 seeded beds across ICU, Emergency, General and Private wards;
  list/stats, admission, duplicate-admission guard, discharge, and admission
  history in `bed_admissions`. Verified with a real staff session.
* Document vault: staff upload for a resolved patient, patient upload for self,
  list, authenticated download, soft delete, 10 MB limit and PDF/image type
  validation. Verified with a real staff session and two patient accounts —
  patient A could list/download their file; patient B got an empty list and 403.
* Notification bell consumes `/api/notifications/stream` via authenticated
  `fetch` streaming, with the existing 30s poll as fallback.

### Staff portals (implemented, API-verified)
* **Laboratory** (`LabPortal`): real queue with patient names, sample collection,
  receipt, processing, result entry (analytes + ranges + flags) and release.
  Releasing publishes the values to that patient and notifies them.
* **Radiology** (`RadiologyPortal`): request queue, scheduling, examination
  start/completion, report writing and release. Examination completion alone
  never exposes a report.
* **Pharmacy** (`PharmacyPortal`): dispensing queue with processing, partial and
  full dispensing; each change is reflected in the patient's prescription.
* **Finance** (`FinancePortal`): issue invoices (itemised), record payments,
  verify payments; balances only move on verification.
* **Clinical workspace** (doctor, clinician, nurse, midwife): today's schedule,
  appointment confirm/check-in/complete/cancel, consultation recording,
  prescription issuing, laboratory and imaging ordering, patient search.
* **Administration** (`AdminPortal`): system administration tabs, facility
  appointments/patients/prescriptions oversight, finance, wards/beds and the
  document vault. All tabs now render a real module; there is no simulated data.
* **Navbar**: hardcoded demo alerts replaced with the live notification feed;
  role-aware identity. Mobile: the sidebar is now an off-canvas drawer.
* Queue scoping is enforced server-side: departmental roles see their facility
  queue; clinicians see only records they authored or are assigned to; patients
  see none.

### Requires external configuration / further work
* `004` and `005` are applied to both staging and production D1.
* R2 buckets `fidus-documents` (staging) and `fidus-documents-prod`
  (production) exist and are bound as `DOCUMENTS`.
* Resend delivery was verified in production to a real Gmail recipient;
  `example.com` recipients remain rejected by Resend policy.
* The UI has been compiled and its APIs exercised, but no browser was available
  in this environment, so layout/interaction was not visually verified.
* The patient portal refreshes on window focus and provides an explicit Refresh
  action; the notification bell streams in real time. SSE is not used to refresh
  clinical sections, so a new report still appears on focus/Refresh.
* Wards/beds has no bed-creation or maintenance-state transition UI yet; the
  seeded inventory can be admitted and discharged, but adding a new bed is a
  migration/administrative task.
