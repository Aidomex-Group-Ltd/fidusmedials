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
  from: 'Fidus Medical Center <consult@fidusmedicals.space>',
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

export function staffApprovalEmail(env: EmailEnv, name: string, loginUrl: string, tempPassword?: string) {
  const tempBlock = tempPassword ? `<div class="panel"><strong>Temporary password</strong><br/>${esc(tempPassword)}<br/><span class="muted">Please sign in and change your password immediately.</span></div>` : '';
  const html = layout('Staff account approved', 'Your Fidus staff account has been approved.', `
    <h1>Your staff account is approved</h1>
    <p>Hello ${esc(name || 'there')},</p>
    <p>Your Fidus Medical Center staff account has been verified and approved. You may now sign in using your authorized staff credentials.</p>
    ${tempBlock}
    ${actionButton('Sign In to Staff Portal', loginUrl)}
    <p class="muted">Access is limited to your assigned role and permissions. If you need assistance, contact ${esc(supportEmail(env))}.</p>
  `, env);
  return { subject: 'Your Fidus staff account has been approved', html, text: `Your staff account is approved. Sign in: ${loginUrl}` };
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
