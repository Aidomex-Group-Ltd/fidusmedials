import * as notifications from './notifications';
type Ctx = ExecutionContext;

export async function emitAppointmentBooked(ctx: Ctx, actor: any, data: any, ip?: string) {
  return notifications.emitEvent(ctx, {
    type: 'appointment.booked', actor, department: data.department || 'Reception', patientRef: data.patientRef, relatedType:'appointment', relatedId:data.id, priority:'normal',
    payload: { message:`Appointment booked for ${data.patientName||'patient'} on ${data.date||''} ${data.time||''}.`, reference:data.reference||data.id, patientUserId:data.patientUserId, assignedUserId:data.doctorUserId, department:data.department }
  }, ip);
}
export async function emitConsultationRegistered(ctx: Ctx, actor: any, data: any, ip?: string) {
  return notifications.emitEvent(ctx, { type:'consultation.registered', actor, department:'Medical Consultation', patientRef:data.patientRef, relatedType:'consultation', relatedId:data.id, priority:'high', payload:{ message:`Consultation registered for ${data.patientName||'patient'}.`, reference:data.reference||data.id, assignedUserId:data.clinicianUserId } }, ip);
}
export async function emitLabRequestCreated(ctx: Ctx, actor: any, data: any, ip?: string) {
  return notifications.emitEvent(ctx, { type:'lab.request.created', actor, department:'Laboratory', patientRef:data.patientRef, relatedType:'lab_request', relatedId:data.id, priority:'high', payload:{ message:`New laboratory request for ${data.patientName||'patient'}.`, reference:data.reference||data.id, assignedUserId:data.assignedUserId } }, ip);
}
export async function emitLabResultCompleted(ctx: Ctx, actor: any, data: any, ip?: string) {
  const critical = !!data.critical;
  return notifications.emitEvent(ctx, { type: critical?'lab.result.critical':'lab.result.completed', actor, department:'Laboratory', patientRef:data.patientRef, relatedType:'lab_result', relatedId:data.id, priority: critical?'critical':'high', payload:{ message: critical?'Critical laboratory result requires immediate review.':'Laboratory result available. Open secure clinical record to review.', reference:data.reference||data.id, assignedUserId:data.requestingClinicianUserId } }, ip);
}
export async function emitRadiologyRequestCreated(ctx: Ctx, actor: any, data: any, ip?: string) {
  return notifications.emitEvent(ctx, { type:'radiology.request.created', actor, department:'Radiology and Ultrasound', patientRef:data.patientRef, relatedType:'radiology_request', relatedId:data.id, priority:'high', payload:{ message:`New imaging request for ${data.patientName||'patient'}.`, reference:data.reference||data.id } }, ip);
}
export async function emitRadiologyReportCompleted(ctx: Ctx, actor: any, data: any, ip?: string) {
  return notifications.emitEvent(ctx, { type:'radiology.report.completed', actor, department:'Radiology and Ultrasound', patientRef:data.patientRef, relatedType:'radiology_report', relatedId:data.id, priority: data.urgent?'urgent':'high', payload:{ message:'Radiology report available. Open secure clinical record to review.', reference:data.reference||data.id, assignedUserId:data.requestingClinicianUserId } }, ip);
}
export async function emitPrescriptionCreated(ctx: Ctx, actor: any, data: any, ip?: string) {
  return notifications.emitEvent(ctx, { type:'pharmacy.prescription.created', actor, department:'Pharmacy', patientRef:data.patientRef, relatedType:'prescription', relatedId:data.id, priority:'high', payload:{ message:`New prescription for ${data.patientName||'patient'}.`, reference:data.reference||data.id } }, ip);
}
export async function emitInvoiceGenerated(ctx: Ctx, actor: any, data: any, ip?: string) {
  return notifications.emitEvent(ctx, { type:'billing.invoice.generated', actor, department:'Finance and Accounts', patientRef:data.patientRef, relatedType:'invoice', relatedId:data.id, priority:'normal', payload:{ message:`Invoice ${data.reference||data.id} generated.`, reference:data.reference||data.id, patientUserId:data.patientUserId } }, ip);
}
