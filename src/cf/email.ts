// src/cf/email.ts
// Transactional email via Resend. Server-side only - never expose API key to client.

export interface EmailEnv {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  SUPPORT_EMAIL?: string;
  APP_URL?: string;
  FRONTEND_URL?: string;
  BACKEND_URL?: string;
}

const BRAND = {
  name: 'Fidus Medical Center',
  domain: 'fidusmedicals.space',
  support: 'consult@fidusmedicals.space',
  from: 'Fidus Medical Center <noreply@fidusmedicals.space>',
  address: 'Bugembegembe Wakiso',
  phone: '+256705353035',
  whatsapp: '+256751597517',
};

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function baseUrl(env: EmailEnv): string {
  const u = (env.FRONTEND_URL || env.APP_URL || 'https://fidusmedicals.space').replace(/\/+$/, '');
  return u;
}

function fromAddress(env: EmailEnv): string {
  return env.EMAIL_FROM || BRAND.from;
}

function supportEmail(env: EmailEnv): string {
  return env.SUPPORT_EMAIL || BRAND.support;
}

function layout(title: string, preheader: string, bodyHtml: string, env: EmailEnv): string {
  const support = esc(supportEmail(env));
  const url = esc(baseUrl(env));
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="x-apple-disable-message-reformatting"/>
<title>${esc(title)}</title>
<style>
  body{margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;}
  .wrap{max-width:640px;margin:0 auto;padding:24px 16px;}
  .card{background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;}
  .head{background:linear-gradient(135deg,#0e7490,#164e63);padding:28px 32px;color:#fff;}
  .brand{font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0;}
  .tag{font-size:13px;opacity:.9;margin-top:6px;}
  .body{padding:32px;font-size:15px;line-height:1.7;color:#334155;}
  .body h1{font-size:24px;line-height:1.3;margin:0 0 16px;color:#0f172a;}
  .body p{margin:0 0 14px;}
  .btn{display:inline-block;padding:14px 22px;background:#0891b2;color:#fff !important;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;}
  .btn-wrap{margin:24px 0;}
  .muted{font-size:13px;color:#64748b;line-height:1.6;}
  .panel{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:18px 0;font-size:14px;}
  .footer{padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#64748b;text-align:center;}
  .footer a{color:#0e7490;text-decoration:none;}
  @media (max-width:480px){.body,.head,.footer{padding-left:20px;padding-right:20px;}}
</style>
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
  <div class="wrap">
    <div class="card">
      <div class="head">
        <p class="brand">${esc(BRAND.name)}</p>
        <p class="tag">Healthcare, connected to you.</p>
      </div>
      <div class="body">${bodyHtml}</div>
      <div class="footer">
        <p><strong>${esc(BRAND.name)}</strong><br/>${esc(BRAND.address)}<br/>
        <a href="mailto:${support}">${support}</a> · ${esc(BRAND.phone)}</p>
        <p><a href="${url}">${url}</a></p>
        <p class="muted">This is a transactional message from Fidus Medical Center. If you did not expect this email, please contact ${support}.</p>
      </div>
    </div>
  </div>
</body></html>`;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
  status?: number;
  skipped?: boolean;
}

export async function sendEmail(env: EmailEnv, input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY missing; email not sent', { subject: input.subject, to: input.to });
    return { ok: false, skipped: true, error: 'Email delivery is not configured' };
  }
  const from = fromAddress(env);
  const to = Array.isArray(input.to) ? input.to : [input.to];
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo || supportEmail(env),
        tags: input.tags,
      }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[email] Resend error', { status: res.status, error: data });
      return { ok: false, status: res.status, error: data?.message || data?.name || 'Email delivery failed' };
    }
    return { ok: true, id: data?.id, status: res.status };
  } catch (err: any) {
    console.error('[email] Resend request failed', err?.message);
    return { ok: false, error: err?.message || 'Email delivery failed' };
  }
}

function actionButton(label: string, url: string): string {
  return `<div class="btn-wrap"><a class="btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a></div>
<p class="muted">If the button does not work, copy and paste this link into your browser:<br/><a href="${esc(url)}">${esc(url)}</a></p>`;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function patientWelcomeEmail(env: EmailEnv, name: string) {
  const url = `${baseUrl(env)}/login`;
  const html = layout('Welcome to Fidus Medical Center', 'Your patient account is ready.', `
    <h1>Welcome, ${esc(name || 'there')}!</h1>
    <p>Your Fidus Medical Center patient account has been created. You can now access appointments, virtual consultations, medical records, prescriptions, and healthcare services through your secure patient portal.</p>
    ${actionButton('Access Patient Portal', url)}
    <div class="panel"><strong>Need help?</strong><br/>Contact us at <a href="mailto:${esc(supportEmail(env))}">${esc(supportEmail(env))}</a> or call ${esc(BRAND.phone)}.</div>
  `, env);
  return { subject: 'Welcome to Fidus Medical Center', html, text: `Welcome to Fidus Medical Center, ${name}. Access your patient portal: ${url}` };
}

export function emailVerificationEmail(env: EmailEnv, name: string, verifyUrl: string, expiresIn = '24 hours') {
  const html = layout('Verify your email', 'Confirm your email to activate your Fidus account.', `
    <h1>Verify your email address</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <p>Please confirm your email address to secure your Fidus Medical Center account. This verification link expires in ${esc(expiresIn)}.</p>
    ${actionButton('Verify Email Address', verifyUrl)}
    <p class="muted">If you did not create this account, you can safely ignore this email.</p>
  `, env);
  return { subject: 'Verify your Fidus Medical Center email', html, text: `Verify your email: ${verifyUrl} (expires in ${expiresIn})` };
}

export function staffRegistrationEmail(env: EmailEnv, name: string) {
  const html = layout('Staff application received', 'Your staff application is pending review.', `
    <h1>Staff application received</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <p>We have received your staff registration/application for Fidus Medical Center. Your account is pending verification and administrative approval before staff system access is granted.</p>
    <div class="panel"><strong>What happens next?</strong><br/>An authorized administrator will review your application. You will receive an email once your account is approved or if more information is needed.</div>
    <p class="muted">For assistance, contact <a href="mailto:${esc(supportEmail(env))}">${esc(supportEmail(env))}</a>.</p>
  `, env);
  return { subject: 'Fidus staff application received', html, text: `Your Fidus staff application has been received and is pending review.` };
}

export function accountActivationEmail(env: EmailEnv, name: string, loginUrl: string) {
  const html = layout('Account activated', 'Your Fidus account is active.', `
    <h1>Your account is active</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <p>Your Fidus Medical Center account is now active. You can sign in securely using your registered credentials.</p>
    ${actionButton('Sign In', loginUrl)}
  `, env);
  return { subject: 'Your Fidus Medical Center account is active', html, text: `Your account is active. Sign in: ${loginUrl}` };
}

export function passwordResetEmail(env: EmailEnv, name: string, resetUrl: string, expiresIn = '1 hour') {
  const html = layout('Reset your password', 'Use this secure link to reset your password.', `
    <h1>Reset your password</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <p>We received a request to reset your Fidus Medical Center password. This secure link expires in ${esc(expiresIn)}.</p>
    ${actionButton('Reset Password', resetUrl)}
    <p class="muted">If you did not request a password reset, ignore this email. Your password will remain unchanged.</p>
  `, env);
  return { subject: 'Reset your Fidus Medical Center password', html, text: `Reset your password: ${resetUrl} (expires in ${expiresIn})` };
}

export function appointmentConfirmationEmail(env: EmailEnv, name: string, details: Record<string, string>) {
  const rows = Object.entries(details).filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:6px 0;color:#64748b;">${esc(k)}</td><td style="padding:6px 0;font-weight:600;color:#0f172a;">${esc(v)}</td></tr>`).join('');
  const html = layout('Appointment confirmation', 'Your appointment has been confirmed.', `
    <h1>Appointment confirmation</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <p>Your appointment with Fidus Medical Center has been confirmed.</p>
    <div class="panel"><table style="width:100%;border-collapse:collapse;">${rows}</table></div>
    <p class="muted">If you need to reschedule, contact <a href="mailto:${esc(supportEmail(env))}">${esc(supportEmail(env))}</a>.</p>
  `, env);
  return { subject: 'Fidus Medical Center appointment confirmation', html, text: `Appointment confirmed.` };
}

export function appointmentReminderEmail(env: EmailEnv, name: string, details: Record<string, string>) {
  const rows = Object.entries(details).filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:6px 0;color:#64748b;">${esc(k)}</td><td style="padding:6px 0;font-weight:600;color:#0f172a;">${esc(v)}</td></tr>`).join('');
  const html = layout('Appointment reminder', 'Reminder: your upcoming Fidus appointment.', `
    <h1>Appointment reminder</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <p>This is a reminder for your upcoming appointment.</p>
    <div class="panel"><table style="width:100%;border-collapse:collapse;">${rows}</table></div>
  `, env);
  return { subject: 'Reminder: your Fidus Medical Center appointment', html, text: `Appointment reminder.` };
}

export function virtualConsultationEmail(env: EmailEnv, name: string, details: Record<string, string>, joinUrl?: string) {
  const rows = Object.entries(details).filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:6px 0;color:#64748b;">${esc(k)}</td><td style="padding:6px 0;font-weight:600;color:#0f172a;">${esc(v)}</td></tr>`).join('');
  const cta = joinUrl ? actionButton('Join Virtual Consultation', joinUrl) : '';
  const html = layout('Virtual consultation', 'Your virtual consultation details.', `
    <h1>Virtual consultation details</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <p>Your virtual consultation with Fidus Medical Center is scheduled.</p>
    <div class="panel"><table style="width:100%;border-collapse:collapse;">${rows}</table></div>
    ${cta}
  `, env);
  return { subject: 'Fidus Medical Center virtual consultation', html, text: `Virtual consultation scheduled. ${joinUrl || ''}` };
}

export function paymentConfirmationEmail(env: EmailEnv, name: string, details: Record<string, string>) {
  const rows = Object.entries(details).filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:6px 0;color:#64748b;">${esc(k)}</td><td style="padding:6px 0;font-weight:600;color:#0f172a;">${esc(v)}</td></tr>`).join('');
  const html = layout('Payment confirmation', 'Your payment has been received.', `
    <h1>Payment confirmation</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <p>We have received your payment. Please keep this confirmation for your records.</p>
    <div class="panel"><table style="width:100%;border-collapse:collapse;">${rows}</table></div>
    <p class="muted">For billing questions, contact <a href="mailto:${esc(supportEmail(env))}">${esc(supportEmail(env))}</a>.</p>
  `, env);
  return { subject: 'Fidus Medical Center payment confirmation', html, text: `Payment confirmed.` };
}

export function supportNotificationEmail(env: EmailEnv, name: string, message: string) {
  const html = layout('Support notification', 'An update from Fidus Medical Center.', `
    <h1>Support update</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <div class="panel">${esc(message).replace(/\n/g, '<br/>')}</div>
    <p class="muted">If you need further assistance, reply to this email or contact ${esc(supportEmail(env))}.</p>
  `, env);
  return { subject: 'Fidus Medical Center support update', html, text: message };
}

// ---------------------------------------------------------------------------
// Staff lifecycle + administration
// ---------------------------------------------------------------------------

export function staffInvitationEmail(
  env: EmailEnv,
  name: string,
  role: string,
  department: string,
  acceptUrl: string,
  expiresAt: string,
  isResend = false,
) {
  const html = layout(
    isResend ? 'Your Fidus invitation (resent)' : 'Invitation to join Fidus Medical Center',
    `You have been invited to join Fidus as ${role}.`,
    `
    <h1>${isResend ? 'Your invitation has been resent' : 'You are invited to join Fidus Medical Center'}</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <p>An authorized administrator has invited you to join ${esc(BRAND.name)} in the staff portal.</p>
    <div class="panel">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#64748b;">Role</td><td style="padding:6px 0;font-weight:600;">${esc(role)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Department</td><td style="padding:6px 0;font-weight:600;">${esc(department)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Expires</td><td style="padding:6px 0;font-weight:600;">${esc(expiresAt)}</td></tr>
      </table>
    </div>
    ${actionButton('Accept Invitation', acceptUrl)}
    <p class="muted">This invitation is single-use and expires on ${esc(expiresAt)}. If you were not expecting it, contact ${esc(supportEmail(env))}.</p>
  `,
    env,
  );
  return {
    subject: isResend ? 'Your Fidus Medical Center invitation (resent)' : 'Invitation to join Fidus Medical Center',
    html,
    text: `You have been invited to join ${BRAND.name} as ${role} in ${department}. Accept: ${acceptUrl}. Expires: ${expiresAt}.`,
  };
}

export function staffInviteCancelledEmail(env: EmailEnv, email: string, role: string, department: string) {
  const html = layout('Invitation cancelled', 'Your Fidus staff invitation was cancelled.', `
    <h1>Your invitation was cancelled</h1>
    <p>Hello ${esc(email || 'there')},</p>
    <p>Your invitation to join ${esc(BRAND.name)} as <strong>${esc(role)}</strong> in <strong>${esc(department)}</strong> has been cancelled and can no longer be used.</p>
    <p class="muted">If you believe this was a mistake, contact ${esc(supportEmail(env))}.</p>
  `, env);
  return { subject: 'Your Fidus Medical Center invitation was cancelled', html, text: `Your invitation as ${role} in ${department} was cancelled.` };
}

export function staffApplicationReceivedEmail(env: EmailEnv, name: string, role: string, department: string) {
  const html = layout('Staff application received', 'Your staff application is pending review.', `
    <h1>Staff application received</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <p>We have received your application to join ${esc(BRAND.name)} as <strong>${esc(role)}</strong> in <strong>${esc(department)}</strong>.</p>
    <div class="panel"><strong>What happens next?</strong><br/>An authorized administrator will review your application and verify your professional details. You will receive an email once a decision is made.</div>
    <p class="muted">For assistance, contact ${esc(supportEmail(env))}.</p>
  `, env);
  return { subject: 'Fidus staff application received', html, text: `Your application as ${role} in ${department} is pending review.` };
}

export function staffActivationEmail(
  env: EmailEnv,
  name: string,
  role: string,
  department: string,
  activationUrl: string,
) {
  const html = layout('Staff account approved', 'Your Fidus staff account has been approved.', `
    <h1>Your staff access has been approved</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <p>Your application to join ${esc(BRAND.name)} has been approved as <strong>${esc(role)}</strong> in <strong>${esc(department)}</strong>.</p>
    <p>To finish setting up your account, choose a password using the secure link below. The link is single-use and expires in 7 days.</p>
    ${actionButton('Set Your Password', activationUrl)}
    <p class="muted">Access is limited to your assigned role and permissions. If you did not apply, contact ${esc(supportEmail(env))}.</p>
  `, env);
  return { subject: 'Your Fidus staff access has been approved', html, text: `Your staff access is approved. Set your password: ${activationUrl}` };
}

export function staffApplicationRejectedEmail(env: EmailEnv, name: string, reason?: string | null) {
  const reasonBlock = reason ? `<div class="panel"><strong>Reason provided</strong><br/>${esc(reason)}</div>` : '';
  const html = layout('Staff application update', 'An update on your Fidus staff application.', `
    <h1>Update on your staff application</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <p>Thank you for your interest in joining ${esc(BRAND.name)}. After review, we are unable to approve your staff application at this time.</p>
    ${reasonBlock}
    <p class="muted">If you believe this decision was made in error, contact ${esc(supportEmail(env))}.</p>
  `, env);
  return { subject: 'Update on your Fidus staff application', html, text: `Your staff application was not approved.${reason ? ' Reason: ' + reason : ''}` };
}

export function staffAccountActivatedEmail(env: EmailEnv, name: string, role: string, department: string) {
  const html = layout('Staff account activated', 'Your Fidus staff account is active.', `
    <h1>Your staff account is active</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <p>Your invitation to join ${esc(BRAND.name)} as <strong>${esc(role)}</strong> in <strong>${esc(department)}</strong> has been accepted and your account is now active.</p>
    ${actionButton('Sign In to Staff Portal', `${baseUrl(env)}/staff/login`)}
  `, env);
  return { subject: 'Your Fidus staff account is active', html, text: `Your staff account as ${role} is active.` };
}

export function staffAccessGrantedEmail(env: EmailEnv, name: string, loginUrl: string) {
  const html = layout('Access granted', 'Your Fidus staff access has been restored.', `
    <h1>Your staff access has been restored</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <p>Your access to the ${esc(BRAND.name)} staff portal has been reactivated. You can sign in again using your usual credentials.</p>
    ${actionButton('Sign In', loginUrl)}
    <p class="muted">If you did not expect this change, contact ${esc(supportEmail(env))} immediately.</p>
  `, env);
  return { subject: 'Your Fidus staff access has been restored', html, text: `Your staff access has been restored. Sign in: ${loginUrl}` };
}

export function staffAccessSuspendedEmail(env: EmailEnv, name: string, reason?: string | null) {
  const reasonBlock = reason ? `<div class="panel"><strong>Reason provided</strong><br/>${esc(reason)}</div>` : '';
  const html = layout('Staff access suspended', 'Your Fidus staff access has been suspended.', `
    <h1>Your staff access has been suspended</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <p>Access to your ${esc(BRAND.name)} staff account has been suspended. You will not be able to sign in while the suspension is in place, and existing sessions have been revoked.</p>
    ${reasonBlock}
    <p class="muted">Contact ${esc(supportEmail(env))} if you need this reviewed.</p>
  `, env);
  return { subject: 'Your Fidus staff access has been suspended', html, text: `Your staff access has been suspended.${reason ? ' Reason: ' + reason : ''}` };
}

export function staffAccessRevokedEmail(env: EmailEnv, name: string, reason?: string | null) {
  const reasonBlock = reason ? `<div class="panel"><strong>Reason provided</strong><br/>${esc(reason)}</div>` : '';
  const html = layout('Staff access revoked', 'Your Fidus staff access has been revoked.', `
    <h1>Your staff access has been revoked</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <p>Access to your ${esc(BRAND.name)} staff account has been permanently revoked. All active sessions have been terminated.</p>
    ${reasonBlock}
    <p class="muted">Contact ${esc(supportEmail(env))} if you believe this is an error.</p>
  `, env);
  return { subject: 'Your Fidus staff access has been revoked', html, text: `Your staff access has been revoked.${reason ? ' Reason: ' + reason : ''}` };
}

export function staffPasswordChangedEmail(env: EmailEnv, name: string) {
  const html = layout('Password changed', 'Your Fidus password was changed.', `
    <h1>Your password was changed</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <p>The password for your ${esc(BRAND.name)} account was changed, and all other active sessions were signed out.</p>
    <div class="panel"><strong>Was this not you?</strong><br/>Reset your password immediately and contact ${esc(supportEmail(env))}.</div>
  `, env);
  return { subject: 'Your Fidus Medical Center password was changed', html, text: 'Your Fidus password was changed and other sessions were signed out.' };
}

export function adminBootstrapVerificationEmail(env: EmailEnv, name: string, verifyUrl: string) {
  const html = layout('Administrator bootstrap verification', 'Confirm ownership to activate administrator access.', `
    <h1>Confirm administrator access</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <p>A System Administrator bootstrap was requested for this address. Confirm that you control this mailbox to complete the elevation. The link is single-use and expires in 1 hour.</p>
    ${actionButton('Verify and Activate Access', verifyUrl)}
    <div class="panel"><strong>Security notice</strong><br/>If you did not request this, do not click the link. Contact ${esc(supportEmail(env))} immediately and change your password.</div>
  `, env);
  return { subject: 'Fidus System Administrator verification', html, text: `Verify administrator access: ${verifyUrl} (expires in 1 hour)` };
}

export function adminNewLoginAlertEmail(env: EmailEnv, name: string, details: Record<string, string>) {
  const rows = Object.entries(details).filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:6px 0;color:#64748b;">${esc(k)}</td><td style="padding:6px 0;font-weight:600;color:#0f172a;">${esc(v)}</td></tr>`).join('');
  const html = layout('New administrator sign-in', 'A new sign-in to your administrator account.', `
    <h1>New administrator sign-in</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <p>Your ${esc(BRAND.name)} administrator account was signed in to. If this was you, no action is needed.</p>
    <div class="panel"><table style="width:100%;border-collapse:collapse;">${rows}</table></div>
    <div class="panel"><strong>Was this not you?</strong><br/>Change your password immediately and contact ${esc(supportEmail(env))}.</div>
  `, env);
  return { subject: 'New sign-in to your Fidus administrator account', html, text: 'A new sign-in to your administrator account was detected.' };
}

export function institutionalEnquiryEmail(env: EmailEnv, details: Record<string, string>) {
  const rows = Object.entries(details).filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:6px 0;color:#64748b;">${esc(k)}</td><td style="padding:6px 0;font-weight:600;color:#0f172a;">${esc(v)}</td></tr>`).join('');
  const html = layout('Institutional enquiry received', 'We received your institutional enquiry.', `
    <h1>Institutional enquiry received</h1>
    <p>Thank you for contacting Fidus Medical Center. We have received your enquiry and our team will respond shortly.</p>
    <div class="panel"><table style="width:100%;border-collapse:collapse;">${rows}</table></div>
    <p class="muted">For urgent matters, call ${esc(BRAND.phone)}.</p>
  `, env);
  return { subject: 'Fidus Medical Center enquiry received', html, text: `We received your enquiry.` };
}
