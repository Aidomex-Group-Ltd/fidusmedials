import * as auth from './auth';
import * as emailSvc from './email';

type Ctx = ExecutionContext;
const DB = (): any => (auth as any).getEnv?.()?.DB;
const uid = (p='evt_') => p + crypto.randomUUID().replace(/-/g, '');
const nid = () => 'ntf_' + crypto.randomUUID().replace(/-/g, '');
const tid = () => 'tsk_' + crypto.randomUUID().replace(/-/g, '');
const oid = () => 'obx_' + crypto.randomUUID().replace(/-/g, '');

export type EventInput = {
  type: string;
  actor?: any;
  facilityId?: string | null;
  department?: string | null;
  patientRef?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
  priority?: 'critical'|'urgent'|'high'|'normal'|'low';
  payload?: any;
  idempotencyKey?: string | null;
};

const EVENT_CATALOGUE: Record<string, { roles: string[]; title: string; category: string; email?: boolean }> = {
  'appointment.booked': { roles:['Receptionist','Doctor','Clinician','Administrator','Facility Administrator','System Administrator'], title:'Appointment booked', category:'appointments', email:true },
  'appointment.confirmed': { roles:['Receptionist','Doctor','Clinician'], title:'Appointment confirmed', category:'appointments', email:true },
  'appointment.cancelled': { roles:['Receptionist','Doctor','Clinician'], title:'Appointment cancelled', category:'appointments', email:true },
  'appointment.reminder': { roles:['Receptionist'], title:'Appointment reminder', category:'appointments', email:true },
  'consultation.registered': { roles:['Receptionist','Doctor','Clinician','Nurse','Administrator','Facility Administrator','System Administrator'], title:'New consultation registered', category:'consultations' },
  'consultation.assigned': { roles:['Doctor','Clinician'], title:'Consultation assigned', category:'consultations', email:true },
  'consultation.completed': { roles:['Doctor','Clinician','Nurse','Laboratory Staff','Laboratory Personnel','Radiology Staff','Pharmacy Staff'], title:'Consultation completed', category:'consultations' },
  'lab.request.created': { roles:['Laboratory Staff','Laboratory Personnel','Doctor','Clinician'], title:'New laboratory request', category:'laboratory' },
  'lab.sample.collected': { roles:['Laboratory Staff','Laboratory Personnel'], title:'Laboratory sample collected', category:'laboratory' },
  'lab.result.completed': { roles:['Doctor','Clinician','Laboratory Staff','Laboratory Personnel'], title:'Laboratory result available', category:'laboratory', email:true },
  'lab.result.critical': { roles:['Doctor','Clinician','Medical Director','System Administrator'], title:'Critical laboratory result', category:'laboratory', email:true },
  'radiology.request.created': { roles:['Radiology Staff','Doctor','Clinician'], title:'New imaging request', category:'radiology' },
  'radiology.exam.completed': { roles:['Radiology Staff','Doctor','Clinician'], title:'Imaging examination completed', category:'radiology' },
  'radiology.report.completed': { roles:['Doctor','Clinician','Radiology Staff'], title:'Radiology report available', category:'radiology', email:true },
  'pharmacy.prescription.created': { roles:['Pharmacy Staff','Pharmacist','Doctor','Clinician'], title:'New prescription', category:'pharmacy' },
  'pharmacy.dispensed': { roles:['Pharmacy Staff','Pharmacist','Doctor','Clinician'], title:'Prescription dispensed', category:'pharmacy' },
  'pharmacy.clarification.required': { roles:['Doctor','Clinician','Pharmacy Staff','Pharmacist'], title:'Prescription clarification required', category:'pharmacy' },
  'billing.invoice.generated': { roles:['Billing / Finance Staff','Admin & Finance'], title:'Invoice generated', category:'billing', email:true },
  'billing.payment.received': { roles:['Billing / Finance Staff','Admin & Finance'], title:'Payment received', category:'billing', email:true },
  'billing.payment.failed': { roles:['Billing / Finance Staff','Admin & Finance'], title:'Payment failed', category:'billing', email:true },
  // Patient-facing events. Roles are exactly ['Patient'] so resolveRecipients
  // only ever adds the patient identified by payload.patientUserId. Email is
  // disabled: clinical specifics stay behind an authenticated portal session.
  'patient.appointment.requested': { roles:['Patient'], title:'Appointment requested', category:'appointments' },
  'patient.appointment.confirmed': { roles:['Patient'], title:'Appointment confirmed', category:'appointments' },
  'patient.appointment.rescheduled': { roles:['Patient'], title:'Appointment rescheduled', category:'appointments' },
  'patient.appointment.cancelled': { roles:['Patient'], title:'Appointment cancelled', category:'appointments' },
  'patient.appointment.completed': { roles:['Patient'], title:'Appointment completed', category:'appointments' },
  'patient.appointment.checked_in': { roles:['Patient'], title:'Checked in', category:'appointments' },
  'patient.consultation.completed': { roles:['Patient'], title:'Consultation summary available', category:'consultations' },
  'patient.prescription.issued': { roles:['Patient'], title:'New prescription', category:'pharmacy' },
  'patient.prescription.status': { roles:['Patient'], title:'Prescription update', category:'pharmacy' },
  'patient.prescription.dispensed': { roles:['Patient'], title:'Prescription dispensed', category:'pharmacy' },
  'patient.lab.requested': { roles:['Patient'], title:'Laboratory test requested', category:'laboratory' },
  'patient.lab.status': { roles:['Patient'], title:'Laboratory update', category:'laboratory' },
  'patient.lab.released': { roles:['Patient'], title:'Laboratory result available', category:'laboratory' },
  'patient.imaging.requested': { roles:['Patient'], title:'Imaging requested', category:'radiology' },
  'patient.imaging.status': { roles:['Patient'], title:'Imaging update', category:'radiology' },
  'patient.imaging.released': { roles:['Patient'], title:'Imaging report available', category:'radiology' },
  'patient.invoice.issued': { roles:['Patient'], title:'New invoice', category:'billing' },
  'patient.payment.recorded': { roles:['Patient'], title:'Payment received', category:'billing' },
  'patient.profile.updated': { roles:['Patient'], title:'Profile updated', category:'profile' },
  'staff.invitation.sent': { roles:['System Administrator','Administrator','Facility Administrator'], title:'Staff invitation sent', category:'admin' },
  'staff.application.submitted': { roles:['System Administrator','Administrator','Facility Administrator'], title:'Staff application submitted', category:'admin' },
};

async function audit(ctx: Ctx, event: string, actor: any, targetId?: string, targetType?: string, details?: any, ip?: string) {
  const db = DB(); if (!db) return;
  try {
    await db.prepare(`INSERT INTO audit_log (id,event,actor_id,actor_email,actor_role,target_id,target_type,details,ip,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`).bind('fidus_'+crypto.randomUUID().replace(/-/g,''), event, actor?.id||actor?.sub||null, actor?.email||null, actor?.role||null, targetId||null, targetType||null, details?JSON.stringify(details):null, ip||null).run();
  } catch {}
}

function safeJson(v:any){ try{return typeof v==='string'?JSON.parse(v):v||{};}catch{return {};}}
function sanitizePayload(type: string, payload: any) {
  const p = payload || {};
  const base: any = { message: p.message, reference: p.reference, status: p.status, priority: p.priority, patientRef: p.patientRef, department: p.department };
  if (/lab\.result|radiology\.report|critical/.test(type)) base.message = p.message || 'New clinical update available. Open the secure clinical record to review.';
  return { ...base, ...p, diagnosis: undefined, fullResult: undefined, detailedNotes: undefined, rawReport: undefined };
}
function rolesForEvent(type: string) { return EVENT_CATALOGUE[type]?.roles || ['System Administrator','Administrator']; }
function titleForEvent(type: string) { return EVENT_CATALOGUE[type]?.title || 'System notification'; }
function bodyForEvent(type: string, p: any) {
  if (p?.message) return String(p.message);
  const t = titleForEvent(type);
  return `${t}. Open the secure workspace to review details.`;
}

async function resolveRecipients(event: any) {
  const db = DB(); if (!db) return [];
  const roles = rolesForEvent(event.type);
  // Patients are never bulk-matched: a patient-facing event is addressed to the
  // single patient in payload.patientUserId. Selecting role='Patient' here
  // would fan clinical notifications out to every patient in the database.
  const staffRoles = roles.filter((r) => r !== 'Patient');
  let recipients: any[] = [];
  if (staffRoles.length) {
    const ph = staffRoles.map(()=>'?').join(',');
    const rows = await db.prepare(`SELECT id,email,role,department FROM users WHERE deleted_at IS NULL AND status='active' AND role IN (${ph})`).bind(...staffRoles).all();
    recipients = rows?.results || [];
  }
  const payload = safeJson(event.payload);
  if (payload.assignedUserId) recipients = recipients.filter((u:any)=>u.id===payload.assignedUserId || ['System Administrator','Administrator','Facility Administrator'].includes(u.role));
  if (payload.department) recipients = recipients.filter((u:any)=>!u.department || u.department===payload.department || ['System Administrator','Administrator','Facility Administrator'].includes(u.role));
  if (payload.patientUserId && roles.includes('Patient')) {
    const p = await db.prepare(`SELECT id,email,role,department FROM users WHERE id=? AND deleted_at IS NULL`).bind(payload.patientUserId).first();
    if (p) recipients.push(p);
  }
  const seen = new Set<string>();
  return recipients.filter((r:any)=>{ if(seen.has(r.id)) return false; seen.add(r.id); return true; });
}

async function getPrefs(userId: string) {
  const db = DB();
  const row = await db.prepare(`SELECT * FROM notification_preferences WHERE user_id=?`).bind(userId).first<any>();
  return { in_app: row?.in_app ?? 1, email: row?.email ?? 1, push: row?.push ?? 0, sms: row?.sms ?? 0, categories: safeJson(row?.categories_json) };
}

export async function emitEvent(ctx: Ctx, input: EventInput, ip?: string) {
  const db = DB(); if (!db) return { ok:false, error:'Database unavailable' };
  if (input.idempotencyKey) {
    const existing = await db.prepare(`SELECT id FROM system_events WHERE idempotency_key=?`).bind(input.idempotencyKey).first<any>();
    if (existing) return { ok:true, deduped:true, eventId: existing.id };
  }
  const eventId = uid();
  const payload = sanitizePayload(input.type, input.payload);
  await db.prepare(`INSERT INTO system_events (id,type,version,facility_id,department,patient_ref,related_type,related_id,actor_id,actor_role,priority,payload,idempotency_key,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',datetime('now'))`)
    .bind(eventId, input.type, '1', input.facilityId||null, input.department||null, input.patientRef||null, input.relatedType||null, input.relatedId||null, input.actor?.id||input.actor?.sub||null, input.actor?.role||null, input.priority||'normal', JSON.stringify(payload), input.idempotencyKey||null).run();
  await db.prepare(`INSERT INTO notification_outbox (id,event_id,status,attempts,max_attempts,next_attempt_at,created_at,updated_at) VALUES (?,?, 'pending',0,8,datetime('now'),datetime('now'),datetime('now'))`).bind(oid(), eventId).run();
  // best-effort immediate processing
  try { await processOutbox(ctx, 10, ip); } catch {}
  return { ok:true, eventId };
}

export async function processOutbox(ctx: Ctx, limit=20, ip?: string) {
  const db = DB(); if (!db) return { ok:false, error:'db' };
  const rows = await db.prepare(`SELECT * FROM notification_outbox WHERE status IN ('pending','failed') AND next_attempt_at <= datetime('now') ORDER BY created_at ASC LIMIT ?`).bind(limit).all();
  const items = rows?.results || [];
  let processed = 0, failed = 0;
  for (const ob of items) {
    const claimed = await db.prepare(`UPDATE notification_outbox SET status='processing', locked_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND status IN ('pending','failed')`).bind(ob.id).run();
    if (!claimed?.meta?.changes) continue;
    try {
      const result = await processEvent(ctx, ob.event_id, ip);
      if (result?.ok) {
        await db.prepare(`UPDATE notification_outbox SET status='delivered', updated_at=datetime('now'), last_error=NULL WHERE id=?`).bind(ob.id).run();
        processed++;
      } else {
        throw new Error(result?.error || 'processing failed');
      }
    } catch (e:any) {
      failed++;
      const attempts = Number(ob.attempts||0) + 1;
      const max = Number(ob.max_attempts||8);
      const errMsg = String(e?.message||e).slice(0,500);
      if (attempts >= max) {
        await db.prepare(`UPDATE notification_outbox SET status='dead_letter', attempts=?, last_error=?, updated_at=datetime('now') WHERE id=?`).bind(attempts, errMsg, ob.id).run();
        await db.prepare(`INSERT INTO notification_dead_letters (id,outbox_id,event_id,payload,error,created_at) VALUES (?,?,?,?,?,datetime('now'))`).bind(uid('dlq_'), ob.id, ob.event_id, JSON.stringify({}), errMsg).run();
      } else {
        const backoffMin = Math.min(60, Math.pow(2, attempts));
        await db.prepare(`UPDATE notification_outbox SET status='failed', attempts=?, last_error=?, next_attempt_at=datetime('now', ?), updated_at=datetime('now') WHERE id=?`).bind(attempts, errMsg, `+${backoffMin} minutes`, ob.id).run();
      }
    }
  }
  return { ok:true, processed, failed, count: items.length };
}

export async function processEvent(ctx: Ctx, eventId: string, ip?: string) {
  const db = DB(); if (!db) return { ok:false, error:'db' };
  const event = await db.prepare(`SELECT * FROM system_events WHERE id=?`).bind(eventId).first<any>();
  if (!event) return { ok:false, error:'event not found' };
  const recipients = await resolveRecipients({ ...event, payload: safeJson(event.payload) });
  let created = 0;
  for (const r of recipients) {
    try {
      const prefs = await getPrefs(r.id);
      const category = EVENT_CATALOGUE[event.type]?.category || 'system';
      const catPrefs = prefs.categories || {};
      if (catPrefs[category] === false) continue;
      if (prefs.in_app) {
        const notificationId = nid();
        const title = titleForEvent(event.type);
        const body = bodyForEvent(event.type, safeJson(event.payload));
        await db.prepare(`INSERT INTO notifications (id,event_id,user_id,channel,type,title,body,priority,status,created_at,data)
          VALUES (?,?,?,?,?,?,?,?,?,datetime('now'),?)`)
          .bind(notificationId, event.id, r.id, 'in_app', event.type, title, body, event.priority || 'normal', 'unread', JSON.stringify({ relatedType:event.related_type, relatedId:event.related_id, patientRef:event.patient_ref, category })).run();
        created++;
        if (['critical','urgent','high'].includes(event.priority || 'normal')) {
          await db.prepare(`INSERT INTO notification_tasks (id,event_id,notification_id,assigned_user_id,department,patient_ref,category,priority,status,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
            .bind(tid(), event.id, notificationId, r.id, r.department || event.department, event.patient_ref, event.type, event.priority || 'normal', 'new').run();
        }
      }
      if (prefs.email && EVENT_CATALOGUE[event.type]?.email && r.email && !String(r.email).includes('@noreply.fidus.staging')) {
        const env = (auth as any).getEnv?.() || {};
        const tpl = emailSvc.supportNotificationEmail(env, r.email, bodyForEvent(event.type, safeJson(event.payload)));
        await emailSvc.sendEmail(env, { to: r.email, subject: `[Fidus] ${titleForEvent(event.type)}`, html: tpl.html, text: tpl.text, tags:[{name:'type',value:'event-notification'}] });
      }
    } catch (e:any) {
      await audit(ctx, 'notification_create_failed', { id:event.actor_id, role:event.actor_role }, eventId, 'system_event', { error: String(e?.message||e).slice(0,300), userId:r.id }, ip);
    }
  }
  await db.prepare(`UPDATE system_events SET status=?, processed_at=datetime('now') WHERE id=?`).bind(created>0?'processed':'processed_empty', eventId).run();
  await audit(ctx, 'event_processed', { id:event.actor_id, role:event.actor_role }, eventId, 'system_event', { type:event.type, recipients: recipients.length, created }, ip);
  return { ok:true, recipients: recipients.length, created };
}

// ---------------------------------------------------------------------------
// Notification APIs
// ---------------------------------------------------------------------------

export async function listMyNotifications(ctx: Ctx, token: string | null, ip?: string) {
  const a = await auth.requireAuth(ctx, token, ip); if (!a.ok) return a;
  const db = DB();
  const rows = await db.prepare(`SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100`).bind(a.user.sub).all();
  const unread = await db.prepare(`SELECT COUNT(*) c FROM notifications WHERE user_id=? AND status='unread'`).bind(a.user.sub).first<any>();
  return { status:200, json:{ success:true, data:{ items: rows?.results||[], unread: unread?.c||0 } } };
}

export async function markNotificationRead(ctx: Ctx, token: string | null, body: any, ip?: string) {
  const a = await auth.requireAuth(ctx, token, ip); if (!a.ok) return a;
  const id = String(body?.id||'');
  if (!id) return { status:400, json:{ success:false, message:'id required' } };
  await DB().prepare(`UPDATE notifications SET status='read', read_at=datetime('now') WHERE id=? AND user_id=?`).bind(id, a.user.sub).run();
  return { status:200, json:{ success:true } };
}

export async function markAllRead(ctx: Ctx, token: string | null, ip?: string) {
  const a = await auth.requireAuth(ctx, token, ip); if (!a.ok) return a;
  await DB().prepare(`UPDATE notifications SET status='read', read_at=datetime('now') WHERE user_id=? AND status='unread'`).bind(a.user.sub).run();
  return { status:200, json:{ success:true } };
}

export async function getPreferences(ctx: Ctx, token: string | null, ip?: string) {
  const a = await auth.requireAuth(ctx, token, ip); if (!a.ok) return a;
  const prefs = await getPrefs(a.user.sub);
  return { status:200, json:{ success:true, data:prefs } };
}

export async function updatePreferences(ctx: Ctx, token: string | null, body: any, ip?: string) {
  const a = await auth.requireAuth(ctx, token, ip); if (!a.ok) return a;
  const db = DB();
  const inApp = body?.in_app === false ? 0 : 1;
  const email = body?.email === false ? 0 : 1;
  const push = body?.push ? 1 : 0;
  const sms = body?.sms ? 1 : 0;
  const categories = JSON.stringify(body?.categories || {});
  await db.prepare(`INSERT INTO notification_preferences (user_id,in_app,email,push,sms,categories_json,updated_at) VALUES (?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET in_app=excluded.in_app,email=excluded.email,push=excluded.push,sms=excluded.sms,categories_json=excluded.categories_json,updated_at=datetime('now')`)
    .bind(a.user.sub, inApp, email, push, sms, categories).run();
  return { status:200, json:{ success:true } };
}

// ---------------------------------------------------------------------------
// Tasks / acknowledgements / escalation
// ---------------------------------------------------------------------------

export async function listMyTasks(ctx: Ctx, token: string | null, ip?: string) {
  const a = await auth.requireAuth(ctx, token, ip); if (!a.ok) return a;
  const db = DB();
  const rows = await db.prepare(`SELECT * FROM notification_tasks WHERE assigned_user_id=? OR department=? ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'urgent' THEN 2 WHEN 'high' THEN 3 WHEN 'normal' THEN 4 ELSE 5 END, created_at DESC LIMIT 100`)
    .bind(a.user.sub, (a.user as any).department || '').all();
  return { status:200, json:{ success:true, data:{ items: rows?.results||[] } } };
}

export async function updateTaskStatus(ctx: Ctx, token: string | null, body: any, ip?: string) {
  const a = await auth.requireAuth(ctx, token, ip); if (!a.ok) return a;
  const id = String(body?.id||''); const status = String(body?.status||'');
  if (!id || !status) return { status:400, json:{ success:false, message:'id and status required' } };
  const allowed = ['acknowledged','in_progress','awaiting_information','completed','cancelled','escalated'];
  if (!allowed.includes(status)) return { status:400, json:{ success:false, message:'Invalid status' } };
  const db = DB();
  const task = await db.prepare(`SELECT * FROM notification_tasks WHERE id=?`).bind(id).first<any>();
  if (!task) return { status:404, json:{ success:false, message:'Task not found' } };
  if (task.assigned_user_id !== a.user.sub && !['System Administrator','Administrator','Facility Administrator'].includes(a.user.role)) return { status:403, json:{ success:false, message:'Not authorized' } };
  const patch = status === 'acknowledged' ? ", acknowledged_at=datetime('now')" : status === 'completed' ? ", completed_at=datetime('now')" : '';
  await db.prepare(`UPDATE notification_tasks SET status=?, updated_at=datetime('now') ${patch} WHERE id=?`).bind(status, id).run();
  await audit(ctx, 'task_status_updated', a.user, id, 'notification_task', { from: task.status, to: status }, ip);
  return { status:200, json:{ success:true } };
}

export async function escalateOverdueTasks(ctx: Ctx, ip?: string) {
  const db = DB(); if (!db) return { ok:false };
  const overdue = await db.prepare(`SELECT * FROM notification_tasks WHERE status IN ('new','acknowledged','in_progress') AND priority IN ('critical','urgent') AND created_at <= datetime('now','-15 minutes') LIMIT 50`).all();
  const items = overdue?.results || [];
  for (const t of items) {
    await db.prepare(`UPDATE notification_tasks SET status='escalated', updated_at=datetime('now') WHERE id=?`).bind(t.id).run();
    await emitEvent(ctx, { type:'task.escalated', priority:'urgent', department:t.department, patientRef:t.patient_ref, relatedType:'notification_task', relatedId:t.id, payload:{ message:`Task escalated: ${t.category} requires attention.` } }, ip);
  }
  return { ok:true, escalated: items.length };
}

// ---------------------------------------------------------------------------
// Department queues / admin ops
// ---------------------------------------------------------------------------

export async function listDepartmentQueue(ctx: Ctx, token: string | null, department: string, ip?: string) {
  const a = await auth.requireAuth(ctx, token, ip); if (!a.ok) return a;
  const role = a.user.role;
  const allowed = ['System Administrator','Administrator','Facility Administrator'].includes(role) || (a.user as any).department === department;
  if (!allowed) return { status:403, json:{ success:false, message:'Not authorized for this department queue' } };
  const db = DB();
  const tasks = await db.prepare(`SELECT * FROM notification_tasks WHERE department=? ORDER BY created_at DESC LIMIT 100`).bind(department).all();
  const events = await db.prepare(`SELECT * FROM system_events WHERE department=? ORDER BY created_at DESC LIMIT 100`).bind(department).all();
  return { status:200, json:{ success:true, data:{ tasks: tasks?.results||[], events: events?.results||[] } } };
}

export async function adminOps(ctx: Ctx, token: string | null, ip?: string) {
  const a = await auth.requireRole(ctx, token, ['System Administrator','Administrator','Facility Administrator'], ip); if (!a.ok) return a;
  const db = DB();
  const [pending, failed, dead, unread, escalated] = await Promise.all([
    db.prepare(`SELECT COUNT(*) c FROM notification_outbox WHERE status='pending'`).first<any>(),
    db.prepare(`SELECT COUNT(*) c FROM notification_outbox WHERE status='failed'`).first<any>(),
    db.prepare(`SELECT COUNT(*) c FROM notification_outbox WHERE status='dead_letter'`).first<any>(),
    db.prepare(`SELECT COUNT(*) c FROM notifications WHERE status='unread'`).first<any>(),
    db.prepare(`SELECT COUNT(*) c FROM notification_tasks WHERE status='escalated'`).first<any>(),
  ]);
  return { status:200, json:{ success:true, data:{ outbox:{pending:pending?.c||0,failed:failed?.c||0,dead:dead?.c||0}, unread:unread?.c||0, escalated:escalated?.c||0 } } };
}

export async function streamNotifications(ctx: Ctx, token: string | null, ip?: string) {
  const a = await auth.requireAuth(ctx, token, ip); if (!a.ok) return new Response(JSON.stringify(a.json), { status:a.status, headers:{'Content-Type':'application/json'} });
  const db = DB();
  const encoder = new TextEncoder();
  let last = Date.now();
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const rows = await db.prepare(`SELECT id,type,title,body,priority,status,created_at FROM notifications WHERE user_id=? AND created_at >= datetime(?,'unixepoch') ORDER BY created_at ASC LIMIT 20`).bind(a.user.sub, Math.floor(last/1000)-2).all();
        const items = rows?.results || [];
        if (items.length) last = Date.now();
        const payload = `event: notifications\ndata: ${JSON.stringify({ unread: items.filter((i:any)=>i.status==='unread').length, items })}\n\n`;
        controller.enqueue(encoder.encode(payload));
        await new Promise(r=>setTimeout(r, 5000));
      } catch (e:any) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({message:'stream_error'})}\n\n`));
        controller.close();
      }
    }
  });
  return new Response(stream, { headers: { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', 'Connection':'keep-alive' } });
}

export const EVENT_CATALOGUE_LIST = Object.entries(EVENT_CATALOGUE).map(([type,v])=>({ type, ...v }));
