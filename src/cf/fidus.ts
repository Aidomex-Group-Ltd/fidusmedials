// src/cf/fidus.ts
// Fidus Worker: serves the built React SPA and the /api/* backend.
import type { ExecutionContext } from '@cloudflare/workers-types';

// Types only; the runtime is provided by the Workers environment.
type Env = { DB: any; DOCUMENTS?: any; ASSETS?: any; JWT_SECRET: string; SESSION_SECRET: string };

// Auth module is bundled by Vite into the worker environment.
import * as auth from './auth';
import * as chatbot from './chatbot';
import * as emailSvc from './email';
import * as admin from './admin';
import * as notifications from './notifications';
import * as workflows from './workflows';
import * as patientRecords from './patient_records';
import * as staffDashboard from './staff_dashboard';
import * as beds from './beds';
import * as documents from './documents';

const ALLOWED_METHODS: Record<string, string[]> = {
  '/api/health': ['GET', 'OPTIONS'],
  '/api/auth/register': ['POST', 'OPTIONS'],
  '/api/auth/login': ['POST', 'OPTIONS'],
  '/api/auth/logout': ['POST', 'OPTIONS'],
  '/api/auth/me': ['GET', 'OPTIONS'],
  '/api/auth/logout-all': ['POST','OPTIONS'],
  '/api/auth/verify-email': ['POST', 'GET', 'OPTIONS'],
  '/api/auth/resend-verification': ['POST', 'OPTIONS'],
  '/api/auth/forgot-password': ['POST', 'OPTIONS'],
  '/api/auth/reset-password': ['POST', 'OPTIONS'],
  '/api/staff/invite': ['POST', 'OPTIONS'],
  '/api/staff/apply': ['POST', 'OPTIONS'],
  '/api/staff/applications': ['GET', 'OPTIONS'],
  '/api/staff/applications/approve': ['POST', 'OPTIONS'],
  '/api/staff/applications/reject': ['POST', 'OPTIONS'],
  '/api/staff/accept-invitation': ['POST', 'OPTIONS'],
  '/api/staff/invitations/verify': ['GET', 'OPTIONS'],
  '/api/staff/login': ['POST', 'OPTIONS'],
  '/api/staff/me': ['GET', 'OPTIONS'],
  '/api/users': ['GET', 'OPTIONS'],
  '/api/email/test': ['POST', 'OPTIONS'],
  '/api/chatbot/query': ['POST', 'OPTIONS'],
  '/api/admin/overview': ['GET','OPTIONS'],
  '/api/admin/staff': ['GET','OPTIONS'],
  '/api/admin/invitations': ['GET','OPTIONS'],
  '/api/admin/audit': ['GET','OPTIONS'],
  '/api/admin/users/status': ['POST','OPTIONS'],
  '/api/admin/users/role': ['POST','OPTIONS'],
  '/api/admin/users/reset-password': ['POST','OPTIONS'],
  '/api/admin/bootstrap/status': ['GET','OPTIONS'],
  '/api/admin/bootstrap/request': ['POST','OPTIONS'],
  '/api/admin/bootstrap/verify': ['POST','GET','OPTIONS'],
  '/api/admin/mfa/enroll': ['POST','OPTIONS'],
  '/api/admin/mfa/confirm': ['POST','OPTIONS'],
  '/api/admin/mfa/disable': ['POST','OPTIONS'],
  '/api/admin/security-summary': ['GET','OPTIONS'],
  '/api/admin/users/sessions/revoke': ['POST','OPTIONS'],
  '/api/admin/invitations/resend': ['POST','OPTIONS'],
  '/api/admin/invitations/cancel': ['POST','OPTIONS'],
  '/api/notifications': ['GET','OPTIONS'],
  '/api/notifications/read': ['POST','OPTIONS'],
  '/api/notifications/read-all': ['POST','OPTIONS'],
  '/api/admin/events/process': ['POST','OPTIONS'],
  '/api/admin/notifications/ops': ['GET','OPTIONS'],
  '/api/notifications/preferences': ['GET','POST','OPTIONS'],
  '/api/notifications/stream': ['GET','OPTIONS'],
  '/api/tasks': ['GET','OPTIONS'],
  '/api/tasks/status': ['POST','OPTIONS'],
  '/api/queues/department': ['GET','OPTIONS'],
  '/api/workflows/appointments': ['GET','POST','OPTIONS'],
  '/api/workflows/consultations': ['GET','POST','OPTIONS'],
  '/api/workflows/lab/requests': ['GET','POST','OPTIONS'],
  '/api/workflows/lab/results': ['POST','OPTIONS'],
  '/api/workflows/radiology/requests': ['GET','POST','OPTIONS'],
  '/api/workflows/radiology/reports': ['POST','OPTIONS'],
  '/api/workflows/pharmacy/prescriptions': ['GET','POST','OPTIONS'],
  '/api/workflows/billing/invoices': ['GET','POST','OPTIONS'],
  '/api/workflows/appointments/status': ['POST','OPTIONS'],
  '/api/workflows/lab/status': ['POST','OPTIONS'],
  '/api/workflows/radiology/status': ['POST','OPTIONS'],
  '/api/workflows/pharmacy/dispense': ['POST','OPTIONS'],
  '/api/workflows/billing/payments': ['GET','POST','OPTIONS'],
  '/api/workflows/billing/payments/verify': ['POST','OPTIONS'],
  '/api/staff/patients': ['GET','OPTIONS'],
  '/api/patient/overview': ['GET','OPTIONS'],
  '/api/patient/appointments': ['GET','POST','OPTIONS'],
  '/api/patient/appointments/cancel': ['POST','OPTIONS'],
  '/api/patient/prescriptions': ['GET','OPTIONS'],
  '/api/patient/reports': ['GET','OPTIONS'],
  '/api/patient/invoices': ['GET','OPTIONS'],
  '/api/patient/profile': ['GET','POST','PATCH','OPTIONS'],
  '/api/patient/activity': ['GET','OPTIONS'],
  '/api/patient/clinicians': ['GET','OPTIONS'],
  '/api/dashboard/stats': ['GET','OPTIONS'],
  '/api/beds': ['GET','OPTIONS'],
  '/api/beds/stats': ['GET','OPTIONS'],
  '/api/beds/allocate': ['POST','OPTIONS'],
  '/api/beds/discharge': ['POST','OPTIONS'],
  '/api/documents': ['GET','POST','OPTIONS'],
  '/api/documents/file': ['GET','OPTIONS'],
  '/api/documents/item': ['DELETE','OPTIONS'],
};

function json(body: any, status = 200, headers?: HeadersInit): Response {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json');
  h.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers: h });
}

function methodNotAllowed(path: string): Response {
  return json({ success: false, message: `Method not allowed: ${path}` }, 405);
}

function notFound(path: string, isApi: boolean): Response {
  return isApi
    ? json({ success: false, message: `Not found: ${path}` }, 404)
    : new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
}

function readBodyJson(req: Request): Promise<any> {
  return req.json().catch(() => null);
}

function clientIp(headers: Headers): string | undefined {
  const forwarded = headers.get('cf-connecting-ip') || headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : undefined;
}

function normalizeApiPath(pathname: string): string {
  // collapse trailing slashes for matching but keep root /api
  let p = pathname.replace(/\/+$/, '');
  if (p === '/api') p = '/api/health';
  return p;
}

function routeKey(pathname: string): string {
  // Map actual paths to the keys used in ALLOWED_METHODS
  if (pathname === '/api/staff/invite') return '/api/staff/invite';
  if (pathname === '/api/staff/apply') return '/api/staff/apply';
  if (pathname === '/api/staff/applications') return '/api/staff/applications';
  if (pathname.startsWith('/api/staff/applications/approve')) return '/api/staff/applications/approve';
  if (pathname.startsWith('/api/staff/applications/reject')) return '/api/staff/applications/reject';
  if (pathname === '/api/staff/accept-invitation') return '/api/staff/accept-invitation';
  if (pathname === '/api/staff/invitations/verify') return '/api/staff/invitations/verify';
  if (pathname === '/api/staff/login') return '/api/staff/login';
  if (pathname === '/api/staff/me') return '/api/staff/me';
  if (pathname === '/api/staff/patients') return '/api/staff/patients';
  if (pathname.startsWith('/api/users')) return '/api/users';
  if (pathname === '/api/beds' || pathname === '/api/beds/stats' || pathname === '/api/beds/allocate' || pathname === '/api/beds/discharge') {
    return pathname;
  }
  if (pathname === '/api/documents') return '/api/documents';
  if (pathname.startsWith('/api/documents/')) {
    const parts = pathname.split('/').filter(Boolean);
    return parts[3] === 'file' ? '/api/documents/file' : '/api/documents/item';
  }
  return pathname;
}

function bearerToken(req: Request): string | null {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim() || null;
}

async function handleApi(ctx: ExecutionContext, req: Request, pathname: string, method: string, ip: string | undefined) {
  const rk = routeKey(pathname);

  // CORS preflight
  if (method === 'OPTIONS') {
    const h = new Headers();
    h.set('Access-Control-Allow-Origin', '*');
    h.set('Access-Control-Allow-Methods', ALLOWED_METHODS[rk]?.join(', ') ?? 'GET, POST, OPTIONS');
    h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    h.set('Access-Control-Max-Age', '86400');
    return new Response(null, { status: 204, headers: h });
  }

  // Unknown route
  if (!ALLOWED_METHODS[rk]) {
    return notFound(pathname, true);
  }
  // Method check
  if (!ALLOWED_METHODS[rk].includes(method)) {
    return methodNotAllowed(pathname);
  }

  // Document IDs are path parameters, so they are resolved before the switch
  // (the switch keys are normalised route templates, not request paths).
  if (pathname.startsWith('/api/documents/')) {
    const parts = pathname.split('/').filter(Boolean);
    const id = parts[2] || '';
    if (!id || parts.length > 4) return notFound(pathname, true);
    if (parts[3] === 'file') {
      if (method !== 'GET') return methodNotAllowed(pathname);
      const download = new URL(req.url).searchParams.get('download') === '1';
      return documents.downloadDocument(ctx, bearerToken(req), id, download, ip);
    }
    if (parts.length !== 3 || method !== 'DELETE') return notFound(pathname, true);
    const r = await documents.deleteDocument(ctx, bearerToken(req), id, ip);
    return json(r.json, r.status);
  }

  switch (pathname) {
    case '/api/health': {
      const host = new URL(req.url).hostname;
      const isProduction = host === 'fidusmedicals.space' || host === 'www.fidusmedicals.space';
      return json({
        status: 'healthy',
        system: 'Fidus Medical Center HMS',
        time: new Date().toISOString(),
        version: isProduction ? 'production' : 'staging',
      });
    }

    case '/api/auth/register': {
      const body = await readBodyJson(req);
      const res = await auth.registerPatient(ctx, body, ip);
      return json(res.json, res.status);
    }

    case '/api/auth/login': {
      const body = await readBodyJson(req);
      const res = await auth.login(ctx, body, ip);
      return json(res.json, res.status);
    }

    case '/api/auth/logout': {
      const token = bearerToken(req);
      const me = token ? await auth.getMe(ctx, token, ip) : null;
      const actor = me && me.status === 200 ? (me.json as any)?.data : undefined;
      const res = await auth.logout(ctx, actor, ip, token);
      return json(res.json, res.status);
    }
    case '/api/auth/logout-all': {
      const res = await auth.logoutAll(ctx, bearerToken(req), ip);
      return json(res.json, res.status);
    }

    case '/api/auth/me': {
      const token = bearerToken(req);
      const res = await auth.getMe(ctx, token, ip);
      return json(res.json, res.status);
    }

    case '/api/auth/verify-email': {
      const body = method === 'POST' ? await readBodyJson(req) : {};
      const token = body?.token || new URL(req.url).searchParams.get('token') || '';
      const res = await auth.verifyEmail(ctx, String(token), ip);
      return json(res.json, res.status);
    }

    case '/api/auth/resend-verification': {
      const body = await readBodyJson(req);
      const res = await auth.resendVerification(ctx, body, ip);
      return json(res.json, res.status);
    }

    case '/api/auth/forgot-password': {
      const body = await readBodyJson(req);
      const res = await auth.forgotPassword(ctx, body, ip);
      return json(res.json, res.status);
    }

    case '/api/auth/reset-password': {
      const body = await readBodyJson(req);
      const res = await auth.resetPassword(ctx, body, ip);
      return json(res.json, res.status);
    }

    case '/api/staff/invite': {
      const token = bearerToken(req);
      const a = await auth.requireRole(ctx, token, ['System Administrator','Administrator','Facility Administrator'], ip);
      if (!a.ok) return json(a.json, a.status);
      const body = await readBodyJson(req);
      const res = await auth.createStaffInvitation(ctx, body, a.user, ip);
      return json(res.json, res.status);
    }

    case '/api/staff/apply': {
      const body = await readBodyJson(req);
      const res = await auth.applyStaff(ctx, body, ip);
      return json(res.json, res.status);
    }

    case '/api/staff/accept-invitation': {
      const body = await readBodyJson(req);
      const res = await auth.acceptInvitation(ctx, body, ip);
      return json(res.json, res.status);
    }

    case '/api/staff/invitations/verify': {
      const token = new URL(req.url).searchParams.get('token') || '';
      const res = await auth.getStaffInvitationInfo(ctx, { token }, ip);
      return json(res.json, res.status);
    }

    case '/api/staff/login': {
      const body = await readBodyJson(req);
      const res = await auth.staffLogin(ctx, body, ip);
      return json(res.json, res.status);
    }

    case '/api/staff/me': {
      const token = bearerToken(req);
      const res = await auth.getMe(ctx, token, ip);
      return json(res.json, res.status);
    }

    case '/api/staff/applications': {
      const token = bearerToken(req);
      const a = await auth.requireRole(ctx, token, ['System Administrator','Administrator','Facility Administrator'], ip);
      if (!a.ok) return json(a.json, a.status);
      const res = await auth.listStaffApplications(ctx, a.user, ip);
      return json(res.json, res.status);
    }

    case '/api/staff/applications/approve': {
      const token = bearerToken(req);
      const a = await auth.requireRole(ctx, token, ['System Administrator','Administrator','Facility Administrator'], ip);
      if (!a.ok) return json(a.json, a.status);
      const body = await readBodyJson(req);
      const res = await auth.approveStaffApplication(ctx, body, a.user, ip);
      return json(res.json, res.status);
    }

    case '/api/staff/applications/reject': {
      const token = bearerToken(req);
      const a = await auth.requireRole(ctx, token, ['System Administrator','Administrator','Facility Administrator'], ip);
      if (!a.ok) return json(a.json, a.status);
      const body = await readBodyJson(req);
      const res = await auth.rejectStaffApplication(ctx, body, a.user, ip);
      return json(res.json, res.status);
    }

    case '/api/users': {
      const token = bearerToken(req);
      const a = await auth.requireRole(ctx, token, ['System Administrator','Administrator','Facility Administrator'], ip);
      if (!a.ok) return json(a.json, a.status);
      const res = await auth.listUsers(ctx, a.user, ip);
      return json(res.json, res.status);
    }

    case '/api/email/test': {
      const token = bearerToken(req);
      const a = await auth.requireRole(ctx, token, ['System Administrator','Administrator','Facility Administrator'], ip);
      if (!a.ok) return json(a.json, a.status);
      const body = await readBodyJson(req);
      const to = String(body?.to || '').trim();
      if (!to) return json({ success: false, message: 'Recipient email is required' }, 400);
      const env = (globalThis as any).__FIDUS_ENV__ || {};
      const tpl = emailSvc.supportNotificationEmail(env, 'Administrator', 'This is a Fidus staging Resend test email.');
      const result = await emailSvc.sendEmail(env, { to, subject: body?.subject || tpl.subject, html: tpl.html, text: tpl.text });
      return json({ success: result.ok, data: { ...result, hasResendKey: !!env.RESEND_API_KEY, from: env.EMAIL_FROM || null }, message: result.ok ? 'Test email sent' : (result.error || 'Email failed') }, result.ok ? 200 : 500);
    }

    case '/api/chatbot/query': {
      const body = await readBodyJson(req);
      const res = await chatbot.chatbotQuery(ctx, body, ip);
      return json(res.json, res.status);
    }

    case '/api/admin/overview': { const r = await admin.overview(ctx, bearerToken(req), ip); return json(r.json, r.status); }
    case '/api/admin/staff': { const r = await admin.listStaff(ctx, bearerToken(req), ip, req.url); return json(r.json, r.status); }
    case '/api/admin/invitations': { const r = await admin.listInvitations(ctx, bearerToken(req), ip); return json(r.json, r.status); }
    case '/api/admin/audit': { const r = await admin.listAudit(ctx, bearerToken(req), ip, req.url); return json(r.json, r.status); }
    case '/api/admin/users/status': { const r = await admin.updateUserStatus(ctx, bearerToken(req), await readBodyJson(req), ip); return json(r.json, r.status); }
    case '/api/admin/users/role': { const r = await admin.assignRole(ctx, bearerToken(req), await readBodyJson(req), ip); return json(r.json, r.status); }
    case '/api/admin/users/reset-password': { const r = await admin.adminResetPassword(ctx, bearerToken(req), await readBodyJson(req), ip); return json(r.json, r.status); }
    case '/api/admin/bootstrap/status': { const r = await admin.bootstrapStatus(ctx); return json(r.json, r.status); }
    case '/api/admin/bootstrap/request': { const r = await admin.bootstrapRequest(ctx, await readBodyJson(req), ip); return json(r.json, r.status); }
    case '/api/admin/bootstrap/verify': { const body = method==='POST'?await readBodyJson(req):{token:new URL(req.url).searchParams.get('token')}; const r = await admin.bootstrapVerify(ctx, body, ip); return json(r.json, r.status); }
    case '/api/admin/mfa/enroll': { const r = await admin.enrollMfa(ctx, bearerToken(req), await readBodyJson(req), ip); return json(r.json, r.status); }
    case '/api/admin/mfa/confirm': { const r = await admin.confirmMfa(ctx, bearerToken(req), await readBodyJson(req), ip); return json(r.json, r.status); }
    case '/api/admin/mfa/disable': { const r = await admin.disableMfa(ctx, bearerToken(req), await readBodyJson(req), ip); return json(r.json, r.status); }
    case '/api/admin/security-summary': { const r = await admin.securitySummary(ctx, bearerToken(req), ip); return json(r.json, r.status); }
    case '/api/admin/users/sessions/revoke': { const r = await admin.revokeSessions(ctx, bearerToken(req), await readBodyJson(req), ip); return json(r.json, r.status); }
    case '/api/admin/invitations/resend': { const r = await admin.resendInvitation(ctx, bearerToken(req), await readBodyJson(req), ip); return json(r.json, r.status); }
    case '/api/admin/invitations/cancel': { const r = await admin.cancelInvitation(ctx, bearerToken(req), await readBodyJson(req), ip); return json(r.json, r.status); }

    case '/api/notifications': { const r = await notifications.listMyNotifications(ctx, bearerToken(req), ip); return json(r.json, r.status); }
    case '/api/notifications/read': { const r = await notifications.markNotificationRead(ctx, bearerToken(req), await readBodyJson(req), ip); return json(r.json, r.status); }
    case '/api/notifications/read-all': { const r = await notifications.markAllRead(ctx, bearerToken(req), ip); return json(r.json, r.status); }
    case '/api/admin/events/process': { try { const a = await auth.requireRole(ctx, bearerToken(req), ['System Administrator','Administrator'], ip); if (!a.ok) return json(a.json,a.status); const body=await readBodyJson(req); const r=await notifications.processEvent(ctx, String(body?.eventId||''), ip); return json({success:!!r?.ok,data:r}, r?.ok?200:400); } catch(e:any){ return json({success:false,message:e?.message,stack:String(e?.stack||'').slice(0,500)},500); } }
    case '/api/admin/notifications/ops': { const r = await notifications.adminOps(ctx, bearerToken(req), ip); return json(r.json, r.status); }
    case '/api/notifications/preferences': { if (method==='GET') { const r=await notifications.getPreferences(ctx,bearerToken(req),ip); return json(r.json,r.status);} const r=await notifications.updatePreferences(ctx,bearerToken(req),await readBodyJson(req),ip); return json(r.json,r.status); }
    case '/api/notifications/stream': { return notifications.streamNotifications(ctx, bearerToken(req), ip); }
    case '/api/tasks': { const r = await notifications.listMyTasks(ctx, bearerToken(req), ip); return json(r.json, r.status); }
    case '/api/tasks/status': { const r = await notifications.updateTaskStatus(ctx, bearerToken(req), await readBodyJson(req), ip); return json(r.json, r.status); }
    case '/api/queues/department': { const dept = new URL(req.url).searchParams.get('department') || ''; const r = await notifications.listDepartmentQueue(ctx, bearerToken(req), dept, ip); return json(r.json, r.status); }
    case '/api/workflows/appointments': { const r = method==='GET'?await workflows.listWorkflowItems(ctx,bearerToken(req),'appointment',ip):await workflows.createAppointment(ctx,bearerToken(req),await readBodyJson(req),ip); return json(r.json,r.status); }
    case '/api/workflows/consultations': { const r = method==='GET'?await workflows.listWorkflowItems(ctx,bearerToken(req),'consultation',ip):await workflows.createConsultation(ctx,bearerToken(req),await readBodyJson(req),ip); return json(r.json,r.status); }
    case '/api/workflows/lab/requests': { const r = method==='GET'?await workflows.listWorkflowItems(ctx,bearerToken(req),'lab_request',ip):await workflows.createLabRequest(ctx,bearerToken(req),await readBodyJson(req),ip); return json(r.json,r.status); }
    case '/api/workflows/lab/results': { const r = await workflows.completeLabResult(ctx,bearerToken(req),await readBodyJson(req),ip); return json(r.json,r.status); }
    case '/api/workflows/radiology/requests': { const r = method==='GET'?await workflows.listWorkflowItems(ctx,bearerToken(req),'radiology_request',ip):await workflows.createRadiologyRequest(ctx,bearerToken(req),await readBodyJson(req),ip); return json(r.json,r.status); }
    case '/api/workflows/radiology/reports': { const r = await workflows.completeRadiologyReport(ctx,bearerToken(req),await readBodyJson(req),ip); return json(r.json,r.status); }
    case '/api/workflows/pharmacy/prescriptions': { const r = method==='GET'?await workflows.listWorkflowItems(ctx,bearerToken(req),'prescription',ip):await workflows.createPrescription(ctx,bearerToken(req),await readBodyJson(req),ip); return json(r.json,r.status); }
    case '/api/workflows/billing/invoices': { const r = method==='GET'?await workflows.listWorkflowItems(ctx,bearerToken(req),'invoice',ip):await workflows.createInvoice(ctx,bearerToken(req),await readBodyJson(req),ip); return json(r.json,r.status); }
    case '/api/workflows/appointments/status': { const r = await workflows.updateAppointmentStatus(ctx,bearerToken(req),await readBodyJson(req),ip); return json(r.json,r.status); }
    case '/api/workflows/lab/status': { const r = await workflows.updateLabStatus(ctx,bearerToken(req),await readBodyJson(req),ip); return json(r.json,r.status); }
    case '/api/workflows/radiology/status': { const r = await workflows.updateImagingStatus(ctx,bearerToken(req),await readBodyJson(req),ip); return json(r.json,r.status); }
    case '/api/workflows/pharmacy/dispense': { const r = await workflows.dispensePrescription(ctx,bearerToken(req),await readBodyJson(req),ip); return json(r.json,r.status); }
    case '/api/workflows/billing/payments': { const r = method==='GET'?await workflows.listPayments(ctx,bearerToken(req),req.url,ip):await workflows.recordPayment(ctx,bearerToken(req),await readBodyJson(req),ip); return json(r.json,r.status); }
    case '/api/workflows/billing/payments/verify': { const r = await workflows.verifyPayment(ctx,bearerToken(req),await readBodyJson(req),ip); return json(r.json,r.status); }
    case '/api/staff/patients': { const r = await workflows.listPatientsDirectory(ctx,bearerToken(req),req.url,ip); return json(r.json,r.status); }

    case '/api/patient/overview': { const r = await patientRecords.getOverview(ctx,bearerToken(req),ip); return json(r.json,r.status); }
    case '/api/patient/appointments': { const r = method==='GET'?await patientRecords.listAppointments(ctx,bearerToken(req),req.url,ip):await patientRecords.requestAppointment(ctx,bearerToken(req),await readBodyJson(req),ip); return json(r.json,r.status); }
    case '/api/patient/appointments/cancel': { const r = await patientRecords.cancelAppointment(ctx,bearerToken(req),await readBodyJson(req),ip); return json(r.json,r.status); }
    case '/api/patient/prescriptions': { const r = await patientRecords.listPrescriptions(ctx,bearerToken(req),req.url,ip); return json(r.json,r.status); }
    case '/api/patient/reports': { const r = await patientRecords.listReports(ctx,bearerToken(req),ip); return json(r.json,r.status); }
    case '/api/patient/invoices': { const r = await patientRecords.listInvoices(ctx,bearerToken(req),ip); return json(r.json,r.status); }
    case '/api/patient/profile': { const r = method==='GET'?await patientRecords.getProfile(ctx,bearerToken(req),ip):await patientRecords.updateProfile(ctx,bearerToken(req),await readBodyJson(req),ip); return json(r.json,r.status); }
    case '/api/patient/activity': { const r = await patientRecords.listActivity(ctx,bearerToken(req),req.url,ip); return json(r.json,r.status); }
    case '/api/patient/clinicians': { const r = await patientRecords.listClinicians(ctx,bearerToken(req),ip); return json(r.json,r.status); }
    case '/api/dashboard/stats': { const r = await staffDashboard.getDashboardStats(ctx,bearerToken(req),ip); return json(r.json,r.status); }

    case '/api/beds': { const r = await beds.listBeds(ctx, bearerToken(req), req.url, ip); return json(r.json, r.status); }
    case '/api/beds/stats': { const r = await beds.getBedStats(ctx, bearerToken(req), ip); return json(r.json, r.status); }
    case '/api/beds/allocate': { const r = await beds.allocateBed(ctx, bearerToken(req), await readBodyJson(req), ip); return json(r.json, r.status); }
    case '/api/beds/discharge': { const r = await beds.dischargeBed(ctx, bearerToken(req), await readBodyJson(req), ip); return json(r.json, r.status); }

    case '/api/documents': {
      const r = method === 'GET'
        ? await documents.listDocuments(ctx, bearerToken(req), req.url, ip)
        : await documents.uploadDocument(ctx, req, bearerToken(req), ip);
      return json(r.json, r.status);
    }

    default: {
      return notFound(pathname, true);
    }
  }
}

export default {
  async scheduled(_event: any, env: any, ctx: ExecutionContext) {
    (globalThis as any).__FIDUS_ENV__ = env;
    (globalThis as any).__FIDUS_SECRETS = { jwt_secret_hex: env?.JWT_SECRET ?? '', session_secret_hex: env?.SESSION_SECRET ?? '' };
    ctx.waitUntil(notifications.processOutbox(ctx, 25));
    ctx.waitUntil(notifications.escalateOverdueTasks(ctx));
  },
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    // Expose env + secrets to the auth module without logging secret values.
    // The auth module reads DB from __FIDUS_ENV__ and JWT/session secrets from
    // __FIDUS_SECRETS so it does not need the caller to thread env through.
    (globalThis as any).__FIDUS_ENV__ = env;
    (globalThis as any).__FIDUS_SECRETS = {
      jwt_secret_hex: (env as any)?.JWT_SECRET ?? '',
      session_secret_hex: (env as any)?.SESSION_SECRET ?? '',
    };

    const url = new URL(request.url);
    const method = request.method;
    const pathname = url.pathname;
    const ip = clientIp(request.headers);

    // API routes: never serve the SPA for /api/*
    if (pathname.startsWith('/api/')) {
      return handleApi(ctx, request, pathname, method, ip);
    }

    // Static files are served from the Workers Static Assets binding. Requests
    // that do not match a file (client-side routes such as /staff/login) fall
    // back to index.html so a hard refresh or a full-page link still boots the
    // SPA. Non-GET/HEAD and missing real assets keep returning 404.
    if (method !== 'GET' && method !== 'HEAD') {
      return notFound(pathname, false);
    }

    // Existing files were already served by the static asset router before
    // this Worker ran. Only unmatched client-side navigation reaches this point.
    const assets = (env as any)?.ASSETS;
    const accept = request.headers.get('Accept') || '';
    const looksLikeAsset = pathname.includes('.');
    const isNavigation =
      pathname === '/' ||
      (!looksLikeAsset && (accept.includes('text/html') || accept.includes('*/*')));

    if (isNavigation) {
      const index = await serveIndex(request, assets);
      if (index) return index;
    }

    return notFound(pathname, false);
  },
};

async function serveIndex(request: Request, assets: any): Promise<Response | null> {
  const url = new URL('/index.html', request.url);
  try {
    // Prefer the Static Assets binding. Some plugin-generated deployments do
    // not expose it to the Worker, so fall back to an absolute same-zone fetch:
    // static assets are served before the Worker, so this resolves to the shell.
    const res = assets
      ? await assets.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }))
      : await fetch(url.toString(), {
          headers: { Accept: 'text/html', 'User-Agent': 'fidus-spa-shell' },
        });
    if (!res.ok) return null;
    return new Response(await res.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
    return null;
  }
}
