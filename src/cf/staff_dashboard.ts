// src/cf/staff_dashboard.ts
// Real, role-scoped operational statistics for the staff portals. Replaces the
// hardcoded figures the department dashboards used to show.

import * as auth from './auth';

type Ctx = ExecutionContext;

const DB = (): any => (auth as any).getEnv?.()?.DB;
const ADMIN_ROLES = ['System Administrator', 'Administrator', 'Facility Administrator'];

export async function getDashboardStats(ctx: Ctx, token: string | null, ip?: string) {
  const a = await auth.requireAuth(ctx, token, ip);
  if (!a.ok) return a;
  if (a.user.role === 'Patient') {
    return { status: 403, json: { success: false, message: 'Staff access required.' } };
  }

  const db = DB();
  const role = a.user.role;
  const department = (a.user as any).department || null;
  const isAdmin = ADMIN_ROLES.includes(role);

  const count = async (sql: string, ...binds: any[]) => {
    const row = await db.prepare(sql).bind(...binds).first<any>();
    return Number(row?.c || 0);
  };

  const [patients, upcomingAppointments, appointmentsToday, pendingLab, pendingImaging, pendingPrescriptions, openInvoices, outstanding, collected, releasedReports, consultationsToday] =
    await Promise.all([
      count(`SELECT COUNT(*) AS c FROM users WHERE role='Patient' AND deleted_at IS NULL`),
      count(
        `SELECT COUNT(*) AS c FROM appointments
          WHERE status IN ('requested','confirmed','rescheduled','checked_in')
            AND (scheduled_at IS NULL OR scheduled_at >= datetime('now'))`,
      ),
      count(
        `SELECT COUNT(*) AS c FROM appointments
          WHERE date(COALESCE(scheduled_at, created_at)) = date('now')`,
      ),
      count(
        `SELECT COUNT(*) AS c FROM lab_reports
          WHERE status IN ('requested','awaiting_collection','collected','received','processing','awaiting_verification')`,
      ),
      count(
        `SELECT COUNT(*) AS c FROM imaging_reports
          WHERE status IN ('requested','scheduled','awaiting_exam','in_progress','completed','report_pending')`,
      ),
      count(
        `SELECT COUNT(*) AS c FROM prescriptions
          WHERE status IN ('issued','pending_pharmacy','processing','partially_dispensed')`,
      ),
      count(`SELECT COUNT(*) AS c FROM invoices WHERE status IN ('issued','partially_paid','overdue')`),
      (async () => {
        const row = await db
          .prepare(
            `SELECT COALESCE(SUM(MAX(total - amount_paid, 0)), 0) AS total FROM invoices
              WHERE status IN ('issued','partially_paid','overdue')`,
          )
          .first<any>();
        return Number(row?.total || 0);
      })(),
      (async () => {
        const row = await db
          .prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM invoice_payments WHERE status='verified'`)
          .first<any>();
        return Number(row?.total || 0);
      })(),
      count(
        `SELECT COUNT(*) AS c FROM (
           SELECT id FROM lab_reports WHERE status='released' AND released_at >= datetime('now','-7 days')
           UNION ALL
           SELECT id FROM imaging_reports WHERE status='released' AND released_at >= datetime('now','-7 days')
         )`,
      ),
      count(
        `SELECT COUNT(*) AS c FROM consultations WHERE date(created_at) = date('now')`,
      ),
    ]);

  return {
    status: 200,
    json: {
      success: true,
      data: {
        role,
        department,
        scope: isAdmin ? 'facility' : 'department',
        counts: {
          patients,
          upcomingAppointments,
          appointmentsToday,
          pendingLab,
          pendingImaging,
          pendingPrescriptions,
          openInvoices,
          releasedReports,
          consultationsToday,
        },
        finance: { outstanding, collected, currency: 'UGX' },
        generatedAt: new Date().toISOString(),
      },
    },
  };
}
