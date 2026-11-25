// src/cf/documents.ts
// Medical document vault: upload, list, download and soft-delete.
//
// Metadata lives in D1 (`medical_documents`); the file body lives in R2 under
// the DOCUMENTS binding. A patient can only ever see their own documents, and a
// staff upload must resolve to a registered patient account.

import * as auth from './auth';
import { resolvePatient } from './workflows';
import { recordActivity } from './patient_records';

type Ctx = ExecutionContext;

const DB = (): any => (auth as any).getEnv?.()?.DB;
const BUCKET = (): any => (auth as any).getEnv?.()?.DOCUMENTS;
const uid = (p = 'doc_') => p + crypto.randomUUID().replace(/-/g, '');

const ADMIN_ROLES = ['System Administrator', 'Administrator', 'Facility Administrator'];
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

const ok = (data: any, status = 200) => ({ status, json: { success: true, data } });
const err = (message: string, status = 400) => ({ status, json: { success: false, message } });

function actorOf(user: any) {
  return { id: user.sub, email: user.email, role: user.role };
}

function safeFileName(name: string): string {
  return (
    String(name || 'document')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'document'
  );
}

function mapDocument(row: any) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    notes: row.notes,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes || 0),
    createdAt: row.created_at,
    patient: {
      id: row.patient_user_id,
      name: row.patient_name || 'Patient',
      patientNumber: row.patient_number || null,
    },
    uploadedBy: row.uploader_name || null,
    fileUrl: `/api/documents/${row.id}/file`,
  };
}

export async function uploadDocument(ctx: Ctx, req: Request, token: string | null, ip?: string) {
  const a = await auth.requireAuth(ctx, token, ip);
  if (!a.ok) return a;

  const bucket = BUCKET();
  if (!bucket) {
    return err('Document storage is not configured for this environment.', 503);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err('Upload a file using multipart/form-data.');
  }

  const file = form.get('file');
  if (!file || typeof file === 'string') return err('Select a file to upload.');

  const contentType = String((file as File).type || '').toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) {
    return err('Only PDF, JPEG, PNG, WebP and GIF documents are accepted.');
  }
  if ((file as File).size <= 0) return err('The selected file is empty.');
  if ((file as File).size > MAX_BYTES) return err('Documents must be 10 MB or smaller.');

  const isPatient = a.user.role === 'Patient';
  let patient: any = null;
  if (isPatient) {
    const row = await DB()
      .prepare(
        `SELECT u.id, u.name, u.email, p.patient_number
           FROM users u LEFT JOIN patient_profiles p ON p.user_id = u.id
          WHERE u.id = ? AND u.role = 'Patient' AND u.deleted_at IS NULL`,
      )
      .bind(a.user.sub)
      .first<any>();
    patient = row;
  } else {
    patient = await resolvePatient({
      patientUserId: form.get('patientUserId'),
      patientId: form.get('patientId'),
      patientEmail: form.get('patientEmail'),
    });
  }
  if (!patient) return err('Select a registered patient for this document.');

  const title = String(form.get('title') || (file as File).name || 'Medical document').trim().slice(0, 200);
  const category = String(form.get('category') || 'Other').trim().slice(0, 60);
  const notes = String(form.get('notes') || '').trim().slice(0, 1000) || null;
  const originalName = String((file as File).name || 'document');
  const documentId = uid('doc_');
  const storageKey = `patients/${patient.id}/${documentId}/${safeFileName(originalName)}`;
  const bytes = await (file as File).arrayBuffer();

  await bucket.put(storageKey, bytes, {
    httpMetadata: {
      contentType,
      contentDisposition: `inline; filename="${safeFileName(originalName)}"`,
    },
    customMetadata: {
      documentId,
      patientUserId: patient.id,
      uploadedBy: a.user.sub,
    },
  });

  await DB()
    .prepare(
      `INSERT INTO medical_documents
         (id, patient_user_id, uploaded_by, title, category, notes, file_name, content_type, size_bytes, storage_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(
      documentId,
      patient.id,
      a.user.sub,
      title,
      category,
      notes,
      originalName,
      contentType,
      (file as File).size,
      storageKey,
    )
    .run();

  await recordActivity(
    patient.id,
    'patient.document.uploaded',
    `Document added: ${title}`,
    `${category} · ${originalName}`,
    'medical_document',
    documentId,
    a.user.email || 'Care team',
  );

  await auth.audit(ctx, 'document_uploaded', actorOf(a.user), documentId, 'medical_document', {
    patientUserId: patient.id,
    size: (file as File).size,
    contentType,
  }, ip);

  return ok(
    {
      id: documentId,
      title,
      category,
      fileName: originalName,
      contentType,
      sizeBytes: (file as File).size,
      fileUrl: `/api/documents/${documentId}/file`,
    },
    201,
  );
}

export async function listDocuments(ctx: Ctx, token: string | null, url: string | null, ip?: string) {
  const a = await auth.requireAuth(ctx, token, ip);
  if (!a.ok) return a;
  const db = DB();

  const query = url ? new URL(url) : null;
  const category = query?.searchParams.get('category') || '';
  let patientUserId: string | null = null;
  if (a.user.role === 'Patient') {
    patientUserId = a.user.sub;
  } else {
    const candidate =
      query?.searchParams.get('patientUserId') ||
      query?.searchParams.get('patientId') ||
      query?.searchParams.get('patientEmail') ||
      '';
    if (candidate) {
      const patient = await resolvePatient({
        patientUserId: candidate,
        patientId: candidate,
        patientEmail: candidate,
      });
      if (!patient) return err('Patient not found.', 404);
      patientUserId = patient.id;
    }
  }

  const rowsRes = await db
    .prepare(
      `SELECT d.*, u.name AS patient_name, p.patient_number, up.name AS uploader_name
         FROM medical_documents d
         LEFT JOIN users u ON u.id = d.patient_user_id
         LEFT JOIN patient_profiles p ON p.user_id = d.patient_user_id
         LEFT JOIN users up ON up.id = d.uploaded_by
        WHERE d.deleted_at IS NULL
          AND (? IS NULL OR d.patient_user_id = ?)
          AND (? = '' OR d.category = ?)
        ORDER BY d.created_at DESC LIMIT 200`,
    )
    .bind(patientUserId, patientUserId, category, category)
    .all();

  return ok({ items: (rowsRes?.results || []).map(mapDocument) });
}

export async function downloadDocument(
  ctx: Ctx,
  token: string | null,
  documentId: string,
  download: boolean,
  ip?: string,
): Promise<Response> {
  const a = await auth.requireAuth(ctx, token, ip);
  if (!a.ok) {
    return new Response(JSON.stringify(a.json), { status: a.status, headers: { 'Content-Type': 'application/json' } });
  }
  const db = DB();
  const doc = await db
    .prepare(`SELECT * FROM medical_documents WHERE id = ? AND deleted_at IS NULL`)
    .bind(documentId)
    .first<any>();
  if (!doc) {
    return new Response(JSON.stringify({ success: false, message: 'Document not found.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (a.user.role === 'Patient' && doc.patient_user_id !== a.user.sub) {
    return new Response(JSON.stringify({ success: false, message: 'Not authorized for this document.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const bucket = BUCKET();
  if (!bucket) {
    return new Response(JSON.stringify({ success: false, message: 'Document storage is not configured.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const object = await bucket.get(doc.storage_key);
  if (!object) {
    return new Response(JSON.stringify({ success: false, message: 'The stored file is missing.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': doc.content_type || 'application/octet-stream',
      'Content-Length': String(doc.size_bytes || object.size || 0),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${safeFileName(doc.file_name)}"`,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  });
}

export async function deleteDocument(ctx: Ctx, token: string | null, documentId: string, ip?: string) {
  const a = await auth.requireAuth(ctx, token, ip);
  if (!a.ok) return a;
  const db = DB();
  const doc = await db
    .prepare(`SELECT * FROM medical_documents WHERE id = ? AND deleted_at IS NULL`)
    .bind(documentId)
    .first<any>();
  if (!doc) return err('Document not found.', 404);

  const canDelete =
    a.user.role === 'Patient'
      ? doc.patient_user_id === a.user.sub && doc.uploaded_by === a.user.sub
      : ADMIN_ROLES.includes(a.user.role) || doc.uploaded_by === a.user.sub;
  if (!canDelete) return err('Not authorized to delete this document.', 403);

  await db
    .prepare(`UPDATE medical_documents SET deleted_at = datetime('now') WHERE id = ?`)
    .bind(documentId)
    .run();

  await auth.audit(ctx, 'document_deleted', actorOf(a.user), documentId, 'medical_document', {
    patientUserId: doc.patient_user_id,
  }, ip);

  return ok({ id: documentId, deleted: true });
}
