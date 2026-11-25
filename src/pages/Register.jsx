import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { staffService } from '../services/api';
import { ArrowLeft, ArrowRight, Calendar, FileText, Heart, Lock, Mail, Phone, Shield, User } from 'lucide-react';

const GENDERS = ['Male', 'Female', 'Other'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Administrator roles are deliberately excluded: a System Administrator account
// cannot be self-registered. Only an existing System Administrator can provision
// or approve one; staff apply for their operational role and are assigned access.
const STAFF_ROLES = [
  'Receptionist', 'Doctor', 'Nurse', 'Midwife', 'Clinician',
  'Laboratory Staff', 'Pharmacy Staff', 'Radiology Staff', 'Admin & Finance',
];

const STAFF_DEPARTMENTS = [
  'Administration', 'Reception', 'Medical Consultation', 'Nursing', 'Maternity',
  'Laboratory', 'Pharmacy', 'Radiology and Ultrasound', 'Theatre and Surgery',
  'Inpatient Wards', 'Dental', 'Pediatrics', 'Obstetrics and Gynecology',
  'Family Planning', 'Finance and Accounts', 'Billing and Cashier',
  'Human Resources', 'Procurement and Stores', 'Records Management',
  'Rehabilitation', 'Mental Health', 'Home Healthcare', 'Telemedicine',
  'IT and Systems Administration', 'Quality Assurance', 'Cardiology',
  'Neurology', 'Dermatology', 'ENT', 'Ophthalmology', 'Orthopedics',
  'Gastroenterology', 'Pulmonology', 'Endocrinology', 'Nephrology',
  'Oncology', 'Emergency', 'ICU',
];

const initialPatient = {
  name: '', email: '', phone: '', dateOfBirth: '', sex: 'Female', bloodGroup: 'O+',
  password: '', passwordConfirmation: '', consent: false,
};

const initialInvite = { token: '', name: '', phone: '', password: '', confirm: '' };
const initialApply = {
  name: '', email: '', phone: '', role: '', department: '',
  professional_designation: '', professional_reg: '',
};

export const Register = ({ onNavigateLogin, onNavigateHome, defaultMode = 'patient' }) => {
  const { register: registerPatient, acceptInvitation, applyStaff } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState(defaultMode === 'staff' ? 'staff' : 'patient');
  const [staffFlow, setStaffFlow] = useState('apply'); // apply | invite
  const [patient, setPatient] = useState(initialPatient);
  const [invite, setInvite] = useState(initialInvite);
  const [apply, setApply] = useState(initialApply);
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [inviteInfo, setInviteInfo] = useState(null);
  const [inviteError, setInviteError] = useState('');

  // Invitation emails link to /staff/register?invite=<token>. Open the staff
  // invitation flow directly instead of dropping the recipient on the patient
  // registration form.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite') || params.get('token');
    if (!token) return;
    setMode('staff');
    setStaffFlow('invite');
    setInvite((prev) => ({ ...prev, token }));
  }, []);

  // Resolve the invitation before the recipient types anything so the bound
  // email, role, and expiry are visible. This never consumes the token.
  useEffect(() => {
    const token = invite.token.trim();
    if (!token) {
      setInviteInfo(null);
      setInviteError('');
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await staffService.verifyInvitation(token);
        if (cancelled) return;
        setInviteInfo(res?.data || null);
        setInviteError('');
        if (res?.data?.name) {
          setInvite((prev) => ({ ...prev, name: prev.name || res.data.name }));
        }
      } catch (err) {
        if (cancelled) return;
        setInviteInfo(null);
        setInviteError(err.message || 'This invitation link is not valid.');
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [invite.token]);

  const upPatient = (k) => (e) => setPatient((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const upInvite = (k) => (e) => setInvite((p) => ({ ...p, [k]: e.target.value }));
  const upApply = (k) => (e) => setApply((p) => ({ ...p, [k]: e.target.value }));

  const submitPatient = async (e) => {
    e.preventDefault();
    if (!patient.name || (!patient.email && !patient.phone)) return toast.warning('Please enter your name and either an email or phone number.');
    if (!patient.password || patient.password.length < 6) return toast.warning('Password must be at least 6 characters.');
    if (patient.password !== patient.passwordConfirmation) return toast.warning('Passwords do not match.');
    if (!patient.consent) return toast.warning('Please confirm you accept the portal terms and privacy policy.');
    try {
      setSubmitting(true);
      await registerPatient({
        name: patient.name.trim(),
        email: patient.email.trim().toLowerCase() || undefined,
        phone: patient.phone.trim() || undefined,
        dateOfBirth: patient.dateOfBirth || undefined,
        sex: patient.sex || undefined,
        bloodGroup: patient.bloodGroup || undefined,
        password: patient.password,
        passwordConfirmation: patient.passwordConfirmation,
      });
      toast.success('Account created! Signing you in…');
    } catch (err) {
      toast.error(err.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const submitInvite = async (e) => {
    e.preventDefault();
    if (!invite.token) return toast.warning('An invitation token is required.');
    if (inviteError) return toast.error(inviteError);
    if (inviteInfo && !inviteInfo.can_accept) {
      return toast.error('This invitation can no longer be accepted. Ask an administrator for a new one.');
    }
    if (!invite.name) return toast.warning('Please enter your name.');
    if (!invite.password || invite.password.length < 6) return toast.warning('Password must be at least 6 characters.');
    if (invite.password !== invite.confirm) return toast.warning('Passwords do not match.');
    try {
      setSubmitting(true);
      await acceptInvitation({
        invitation_token: invite.token.trim(),
        name: invite.name.trim(),
        password: invite.password,
        passwordConfirmation: invite.confirm,
        phone: invite.phone.trim() || undefined,
      });
      toast.success('Staff account created. Signing you in…');
    } catch (err) {
      toast.error(err.message || 'Failed to accept invitation');
    } finally {
      setSubmitting(false);
    }
  };

  const submitApply = async (e) => {
    e.preventDefault();
    if (!apply.name || !apply.email || !apply.role || !apply.department) return toast.warning('Please complete all required fields.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(apply.email)) return toast.warning('Please enter a valid email address.');
    try {
      setSubmitting(true);
      await applyStaff({
        name: apply.name.trim(),
        email: apply.email.trim().toLowerCase(),
        phone: apply.phone.trim() || undefined,
        role: apply.role,
        department: apply.department,
        professional_designation: apply.professional_designation.trim() || undefined,
        professional_reg: apply.professional_reg.trim() || undefined,
      });
      toast.success('Application submitted. An administrator will review it before your account is activated.');
      setApply(initialApply);
    } catch (err) {
      toast.error(err.message || 'Application failed');
    } finally {
      setSubmitting(false);
    }
  };

  const isPatient = mode === 'patient';

  return (
    <div className="cp-auth">
      <aside className="cp-auth-media">
        <img src={isPatient ? '/images/care-team.webp' : '/images/ward.webp'} alt={isPatient ? 'Doctor and nurse reviewing patient details together' : 'Modern inpatient ward with hospital beds'} />
        <div className="cp-auth-overlay" />
        <div className="cp-auth-media-copy">
          <span className="cp-logo cp-logo-light"><span className="cp-logo-mark"><Heart size={18} /></span>Fidus Medical Center</span>
          <p className="cp-auth-tagline">{isPatient ? 'Create your patient account and access connected healthcare services.' : 'Staff access is restricted to authorized personnel and requires verification and approval.'}</p>
        </div>
      </aside>

      <main className="cp-auth-panel">
        <div className="cp-auth-form-wrap cp-auth-form-wide">
          {onNavigateHome && <button type="button" className="cp-back-link" onClick={onNavigateHome}><ArrowLeft size={16} /> Back to home</button>}
          <span className="cp-eyebrow">Unified Registration</span>
          <h1 className="cp-auth-title" style={{ marginTop: '0.75rem' }}>Create your account</h1>
          <p className="cp-auth-sub">Register as a patient for healthcare services, or as staff through the approved onboarding process.</p>

          <div className="cp-segmented" role="tablist" aria-label="Registration type">
            <button type="button" role="tab" aria-selected={isPatient} className={`cp-segmented-btn ${isPatient ? 'is-active' : ''}`} onClick={() => setMode('patient')}><User size={16} /> Patient Registration</button>
            <button type="button" role="tab" aria-selected={!isPatient} className={`cp-segmented-btn ${!isPatient ? 'is-active' : ''}`} onClick={() => setMode('staff')}><Shield size={16} /> Staff Registration</button>
          </div>

          {isPatient ? (
            <form onSubmit={submitPatient} noValidate>
              <div className="form-group"><label className="form-label" htmlFor="reg-name">Full name *</label><div className="cp-input-icon"><User size={16} aria-hidden="true" /><input id="reg-name" className="form-input" required autoComplete="name" value={patient.name} onChange={upPatient('name')} placeholder="Jane Nakato" /></div></div>
              <div className="cp-form-grid cp-form-grid-2">
                <div className="form-group"><label className="form-label" htmlFor="reg-email">Email address</label><div className="cp-input-icon"><Mail size={16} aria-hidden="true" /><input id="reg-email" type="email" className="form-input" autoComplete="email" value={patient.email} onChange={upPatient('email')} placeholder="jane@example.com" /></div><p className="cp-field-hint">Optional if you provide a phone number.</p></div>
                <div className="form-group"><label className="form-label" htmlFor="reg-phone">Phone number</label><div className="cp-input-icon"><Phone size={16} aria-hidden="true" /><input id="reg-phone" type="tel" className="form-input" autoComplete="tel" value={patient.phone} onChange={upPatient('phone')} placeholder="+256700000000" /></div><p className="cp-field-hint">Ugandan numbers supported. Required if no email.</p></div>
              </div>
              <div className="cp-form-grid cp-form-grid-2">
                <div className="form-group"><label className="form-label" htmlFor="reg-dob">Date of birth</label><div className="cp-input-icon"><Calendar size={16} aria-hidden="true" /><input id="reg-dob" type="date" className="form-input" value={patient.dateOfBirth} onChange={upPatient('dateOfBirth')} /></div></div>
                <div className="form-group"><label className="form-label" htmlFor="reg-sex">Sex</label><select id="reg-sex" className="form-select" value={patient.sex} onChange={upPatient('sex')}>{GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}</select></div>
              </div>
              <div className="form-group"><label className="form-label" htmlFor="reg-blood">Blood group (optional)</label><select id="reg-blood" className="form-select" value={patient.bloodGroup} onChange={upPatient('bloodGroup')}>{BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}</select></div>
              <div className="form-group"><label className="form-label" htmlFor="reg-pw">Password * (min 6 characters)</label><div className="cp-input-icon"><Lock size={16} aria-hidden="true" /><input id="reg-pw" type={showPw ? 'text' : 'password'} className="form-input cp-has-toggle" required minLength="6" autoComplete="new-password" value={patient.password} onChange={upPatient('password')} placeholder="At least 6 characters" /><button type="button" className="cp-pw-toggle" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}>{showPw ? <ArrowRight size={16} /> : <Lock size={16} />}</button></div></div>
              <div className="form-group"><label className="form-label" htmlFor="reg-pw2">Confirm password *</label><div className="cp-input-icon"><Lock size={16} aria-hidden="true" /><input id="reg-pw2" type={showPw2 ? 'text' : 'password'} className="form-input cp-has-toggle" required minLength="6" autoComplete="new-password" value={patient.passwordConfirmation} onChange={upPatient('passwordConfirmation')} placeholder="Repeat your password" /><button type="button" className="cp-pw-toggle" onClick={() => setShowPw2((v) => !v)} aria-label={showPw2 ? 'Hide password' : 'Show password'}>{showPw2 ? <ArrowRight size={16} /> : <Lock size={16} />}</button></div></div>
              <label className="cp-consent"><input type="checkbox" checked={patient.consent} onChange={upPatient('consent')} /><span>I agree to the portal terms and privacy policy and consent to my information being used to provide my care.</span></label>
              <button type="submit" className="cp-btn cp-btn-primary cp-btn-lg cp-btn-block" disabled={submitting} style={{ marginTop: '1.25rem' }}>{submitting ? 'Creating account…' : <>Create Patient Account <ArrowRight size={18} /></>}</button>
            </form>
          ) : (
            <div>
              <div className="cp-staff-flow-note">
                <Shield size={16} />
                <p>Staff registration is restricted to authorized Fidus Medical Center personnel. Staff accounts must be verified and approved before access to staff systems is granted. An administrator assigns roles and permissions. Administrator accounts cannot be created from this page — an existing System Administrator provisions them.</p>
              </div>
              <div className="cp-segmented cp-segmented-sm" role="tablist" aria-label="Staff registration method">
                <button type="button" role="tab" aria-selected={staffFlow === 'apply'} className={`cp-segmented-btn ${staffFlow === 'apply' ? 'is-active' : ''}`} onClick={() => setStaffFlow('apply')}><FileText size={15} /> Staff Application</button>
                <button type="button" role="tab" aria-selected={staffFlow === 'invite'} className={`cp-segmented-btn ${staffFlow === 'invite' ? 'is-active' : ''}`} onClick={() => setStaffFlow('invite')}><Lock size={15} /> Accept Invitation</button>
              </div>

              {staffFlow === 'apply' ? (
                <form onSubmit={submitApply} noValidate>
                  <div className="form-group"><label className="form-label" htmlFor="apply-name">Full name *</label><div className="cp-input-icon"><User size={16} aria-hidden="true" /><input id="apply-name" className="form-input" required value={apply.name} onChange={upApply('name')} placeholder="Your full name" autoComplete="name" /></div></div>
                  <div className="cp-form-grid cp-form-grid-2">
                    <div className="form-group"><label className="form-label" htmlFor="apply-email">Email address *</label><div className="cp-input-icon"><Mail size={16} aria-hidden="true" /><input id="apply-email" type="email" className="form-input" required value={apply.email} onChange={upApply('email')} placeholder="you@example.com" autoComplete="email" /></div></div>
                    <div className="form-group"><label className="form-label" htmlFor="apply-phone">Phone number</label><div className="cp-input-icon"><Phone size={16} aria-hidden="true" /><input id="apply-phone" type="tel" className="form-input" value={apply.phone} onChange={upApply('phone')} placeholder="+256700000000" autoComplete="tel" /></div></div>
                  </div>
                  <div className="cp-form-grid cp-form-grid-2">
                    <div className="form-group"><label className="form-label" htmlFor="apply-role">Intended role *</label><select id="apply-role" className="form-select" required value={apply.role} onChange={upApply('role')}><option value="">Select a role…</option>{STAFF_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select><p className="cp-field-hint">A professional designation does not automatically grant system permissions. An administrator assigns roles.</p></div>
                    <div className="form-group"><label className="form-label" htmlFor="apply-dept">Intended department *</label><select id="apply-dept" className="form-select" required value={apply.department} onChange={upApply('department')}><option value="">Select a department…</option>{STAFF_DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
                  </div>
                  <div className="cp-form-grid cp-form-grid-2">
                    <div className="form-group"><label className="form-label" htmlFor="apply-desig">Professional designation</label><input id="apply-desig" className="form-input" value={apply.professional_designation} onChange={upApply('professional_designation')} placeholder="e.g. Medical Officer, Senior Nurse" autoComplete="organization-title" /></div>
                    <div className="form-group"><label className="form-label" htmlFor="apply-reg">Professional registration number</label><input id="apply-reg" className="form-input" value={apply.professional_reg} onChange={upApply('professional_reg')} placeholder="Where applicable" autoComplete="off" /></div>
                  </div>
                  <p className="cp-staff-flow-note cp-staff-flow-note-muted">After you submit, an administrator will review your application. If approved, you will be contacted to complete account activation and set up secure access.</p>
                  <button type="submit" className="cp-btn cp-btn-primary cp-btn-lg cp-btn-block" disabled={submitting}>{submitting ? 'Submitting application…' : <>Submit Staff Application <ArrowRight size={18} /></>}</button>
                </form>
              ) : (
                <form onSubmit={submitInvite} noValidate>
                  {inviteInfo && (
                    <div className={`cp-invite-card ${inviteInfo.can_accept ? 'is-valid' : 'is-blocked'}`}>
                      <div className="cp-invite-card-head">
                        {inviteInfo.can_accept ? <FileText size={16} /> : <Lock size={16} />}
                        <strong>{inviteInfo.can_accept ? 'Invitation verified' : 'Invitation unavailable'}</strong>
                      </div>
                      <div className="cp-invite-card-body">
                        <span><span>Email</span>{inviteInfo.email}</span>
                        <span><span>Role</span>{inviteInfo.role}</span>
                        <span><span>Department</span>{inviteInfo.department}</span>
                        <span><span>Expires</span>{new Date(inviteInfo.expires_at).toLocaleString()}</span>
                      </div>
                      <p className="cp-field-hint" style={{ margin: 0 }}>
                        {inviteInfo.can_accept
                          ? 'Your account will be created with this email and role. The role cannot be changed here.'
                          : `This invitation is ${inviteInfo.status}. Sign in if you already have an account, or ask the administrator to resend it.`}
                      </p>
                    </div>
                  )}
                  {inviteError && <div className="cp-invite-card is-blocked" role="alert"><div className="cp-invite-card-head"><Lock size={16} /><strong>Invitation link problem</strong></div><p className="cp-field-hint" style={{ margin: 0 }}>{inviteError}</p></div>}
                  <div className="form-group"><label className="form-label" htmlFor="inv-token">Invitation token *</label><div className="cp-input-icon"><Lock size={16} aria-hidden="true" /><input id="inv-token" className="form-input" required value={invite.token} onChange={upInvite('token')} placeholder="Paste the token from your invitation link" autoComplete="off" /></div><p className="cp-field-hint">This is the single-use token from the invitation link sent by an administrator. It expires after 7 days.</p></div>
                  <div className="form-group"><label className="form-label" htmlFor="inv-name">Full name *</label><div className="cp-input-icon"><User size={16} aria-hidden="true" /><input id="inv-name" className="form-input" required value={invite.name} onChange={upInvite('name')} placeholder="Your full name" autoComplete="name" /></div></div>
                  <div className="form-group"><label className="form-label" htmlFor="inv-phone">Phone number (optional)</label><div className="cp-input-icon"><Phone size={16} aria-hidden="true" /><input id="inv-phone" type="tel" className="form-input" value={invite.phone} onChange={upInvite('phone')} placeholder="+256700000000" autoComplete="tel" /></div></div>
                  <div className="form-group"><label className="form-label" htmlFor="inv-pw">Password * (min 6 characters)</label><div className="cp-input-icon"><Lock size={16} aria-hidden="true" /><input id="inv-pw" type={showPw ? 'text' : 'password'} className="form-input cp-has-toggle" required minLength="6" value={invite.password} onChange={upInvite('password')} placeholder="Choose a secure password" autoComplete="new-password" /><button type="button" className="cp-pw-toggle" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}>{showPw ? <ArrowRight size={16} /> : <Lock size={16} />}</button></div></div>
                  <div className="form-group"><label className="form-label" htmlFor="inv-pw2">Confirm password *</label><div className="cp-input-icon"><Lock size={16} aria-hidden="true" /><input id="inv-pw2" type={showPw2 ? 'text' : 'password'} className="form-input cp-has-toggle" required minLength="6" value={invite.confirm} onChange={upInvite('confirm')} placeholder="Repeat your password" autoComplete="new-password" /><button type="button" className="cp-pw-toggle" onClick={() => setShowPw2((v) => !v)} aria-label={showPw2 ? 'Hide password' : 'Show password'}>{showPw2 ? <ArrowRight size={16} /> : <Lock size={16} />}</button></div></div>
                  <button type="submit" className="cp-btn cp-btn-primary cp-btn-lg cp-btn-block" disabled={submitting || (inviteInfo && !inviteInfo.can_accept)}>{submitting ? 'Creating account…' : <>Accept Invitation <ArrowRight size={18} /></>}</button>
                </form>
              )}
            </div>
          )}

          <p className="cp-auth-switch">
            {isPatient ? (
              <>Already have an account? <button type="button" className="cp-link" onClick={onNavigateLogin}>Sign in</button></>
            ) : (
              <>Already have a staff account? <button type="button" className="cp-link" onClick={() => window.location.href = '/staff/login'}>Staff sign in</button></>
            )}
          </p>
          {!isPatient && <p className="cp-auth-switch" style={{ marginTop: '0.5rem' }}>Patient looking for care? <button type="button" className="cp-link" onClick={() => setMode('patient')}>Register as a patient</button></p>}
          {isPatient && <p className="cp-auth-switch" style={{ marginTop: '0.5rem' }}>Authorized staff member? <button type="button" className="cp-link" onClick={() => setMode('staff')}>Staff registration</button></p>}
        </div>
      </main>
    </div>
  );
};
