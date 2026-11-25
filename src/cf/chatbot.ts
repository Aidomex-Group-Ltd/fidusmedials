// src/cf/chatbot.ts
// Rule-based patient support assistant. Deliberately contains no credentials or
// PHI and never gives clinical advice — it only routes people to the right
// service or contact channel.

import { appBaseUrl, audit, rateLimit, supportEmail } from './auth/lib';

const PHONE = '+256705353035';
const WHATSAPP = '+256751597517';
const LOCATION = 'Bugembegembe Wakiso';

export async function chatbotQuery(ctx: ExecutionContext, body: any, ip?: string) {
  const message = String(body?.message || '').trim();
  if (!message) return { status: 400, json: { success: false, message: 'Message is required' } };

  const rl = rateLimit(`chatbot:${ip || 'unknown'}`, 30, 5 * 60 * 1000);
  if (!rl.ok) {
    return { status: 429, json: { success: false, message: 'Too many requests. Please wait a moment and try again.' } };
  }

  const reply = buildReply(message.toLowerCase());
  await audit(ctx, 'chatbot_query', null, undefined, 'chatbot', { q: message.slice(0, 200) }, ip);
  return { status: 200, json: { success: true, reply, data: { reply } } };
}

function buildReply(q: string): string {
  const base = appBaseUrl();
  const support = supportEmail();
  const fallback = `I can help with Fidus Medical Center services, appointments, telemedicine, home healthcare, screening, outreach, registration, and patient portal navigation. For personal assistance, contact ${support} or call ${PHONE}.`;

  if (/(emergency|chest pain|bleeding|unconscious|can'?t breathe|stroke)/.test(q)) {
    return `If this may be an emergency, please call local emergency services or Fidus Medical Center immediately at ${PHONE}. I cannot provide emergency diagnosis or treatment.`;
  }
  if (/(book|appointment|schedule)/.test(q)) {
    return `To book an appointment, create or sign in to your patient account at ${base}/register, then use the appointment options in the patient portal. You can also call ${PHONE} for assistance.`;
  }
  if (/(virtual|telemedicine|video|voice consult)/.test(q)) {
    return 'Fidus offers virtual consultations through secure telemedicine where clinically appropriate. Book or request a virtual consultation through the patient portal, and our team will confirm availability.';
  }
  if (/(home|nursing|sample collection|home visit|home care)/.test(q)) {
    return 'Fidus provides home healthcare services including home nursing, home consultations, assessments, selected treatments, sample collection, and follow-up visits where supported. Contact us to confirm availability.';
  }
  if (/(school|institution|outreach|corporate|employee screening|workplace)/.test(q)) {
    return `Fidus provides school and institutional healthcare outreach, health assessments, education, student and staff screening, wellness programmes, and preventive campaigns. Contact ${support} with your institution details for a tailored programme.`;
  }
  if (/(screen|blood pressure|glucose|wellness)/.test(q)) {
    return 'Fidus offers preventive health screening including general assessments, blood pressure screening, blood glucose screening, basic wellness assessments, and group or institutional screening campaigns based on facility capability.';
  }
  if (/(register|sign up|account|login|password|reset)/.test(q)) {
    return `Patients can register at ${base}/register. Staff registration requires an invitation or an approved application. If you forgot your password, use the "Forgot Password" option on the login page; reset links are time-limited for security.`;
  }
  if (/(pay|payment|checkout|bill|receipt)/.test(q)) {
    return `Fidus checkout supports service payments with clear service summaries and references. Payment confirmations are issued after verification. For billing help, contact ${support}.`;
  }
  if (/(contact|phone|email|whatsapp|where|location)/.test(q)) {
    return `You can reach Fidus Medical Center at ${support}, phone ${PHONE}, WhatsApp ${WHATSAPP}, ${LOCATION}.`;
  }
  return fallback;
}
