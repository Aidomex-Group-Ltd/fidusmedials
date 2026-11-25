import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ArrowLeft, ArrowRight, FileText, Mail, Phone, User } from 'lucide-react';

// Mirrors the backend STAFF_ROLES / STAFF_DEPARTMENTS so the frontend only
// offers values the server will accept. Keep these in sync with auth.ts.
// Administrator roles are provisioned by an existing System Administrator and
// are intentionally not available to self-applicants.
const STAFF_ROLES = [
  'Receptionist',
  'Doctor',
  'Nurse',
  'Midwife',
  'Clinician',
  'Laboratory Staff',
  'Pharmacy Staff',
  'Radiology Staff',
  'Admin & Finance',
];

const STAFF_DEPARTMENTS = [
  'Administration',
  'Reception',
  'Medical Consultation',
  'Nursing',
  'Maternity',
  'Laboratory',
  'Pharmacy',
  'Radiology and Ultrasound',
  'Theatre and Surgery',
  'Inpatient Wards',
  'Dental',
  'Pediatrics',
  'Obstetrics and Gynecology',
  'Family Planning',
  'Finance and Accounts',
  'Billing and Cashier',
  'Human Resources',
  'Procurement and Stores',
  'Records Management',
  'Rehabilitation',
  'Mental Health',
  'Home Healthcare',
  'Telemedicine',
  'IT and Systems Administration',
  'Quality Assurance',
  'Cardiology',
  'Neurology',
  'Dermatology',
  'ENT',
  'Ophthalmology',
  'Orthopedics',
  'Gastroenterology',
  'Pulmonology',
  'Endocrinology',
  'Nephrology',
  'Oncology',
  'Emergency',
  'ICU',
];

export const StaffApply = ({ onNavigateHome }) => {
  const { applyStaff } = useAuth();
  const toast = useToast();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    department: '',
    professional_designation: '',
    professional_reg: '',
  });

  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => setFormData({ ...formData, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.role || !formData.department) {
      return toast.warning('Please complete all required fields.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      return toast.warning('Please enter a valid email address.');
    }

    try {
      setSubmitting(true);
      await applyStaff({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim() || undefined,
        role: formData.role,
        department: formData.department,
        professional_designation: formData.professional_designation.trim() || undefined,
        professional_reg: formData.professional_reg.trim() || undefined,
      });
      toast.success('Application submitted. An administrator will review it before your account is activated.');
    } catch (err) {
      toast.error(err.message || 'Application failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cp-auth">
      <aside className="cp-auth-media">
        <img src="/images/ward.webp" alt="Modern inpatient ward with hospital beds" />
        <div className="cp-auth-overlay" />
        <div className="cp-auth-media-copy">
          <span className="cp-logo cp-logo-light">
            <span className="cp-logo-mark">
              <FileText size={18} />
            </span>
            Fidus Medical Center
          </span>
          <p className="cp-auth-tagline">Apply to join the Fidus staff team. Applications are reviewed by an administrator before any account is created.</p>
        </div>
      </aside>

      <main className="cp-auth-panel">
        <div className="cp-auth-form-wrap">
          {onNavigateHome && (
            <button type="button" className="cp-back-link" onClick={onNavigateHome}>
              <ArrowLeft size={16} /> Back to home
            </button>
          )}

          <span className="cp-eyebrow">Staff Portal</span>
          <h1 className="cp-auth-title" style={{ marginTop: '0.75rem' }}>Staff application</h1>
          <p className="cp-auth-sub">
            A submitted application is not an active staff account. An authorized administrator must approve it before you can sign in.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="apply-name">
                Full name *
              </label>
              <div className="cp-input-icon">
                <User size={16} aria-hidden="true" />
                <input
                  id="apply-name"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Your full name"
                  className="form-input"
                  value={formData.name}
                  onChange={update('name')}
                />
              </div>
            </div>

            <div className="cp-form-grid cp-form-grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="apply-email">
                  Email address *
                </label>
                <div className="cp-input-icon">
                  <Mail size={16} aria-hidden="true" />
                  <input
                    id="apply-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="form-input"
                    value={formData.email}
                    onChange={update('email')}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="apply-phone">
                  Phone number
                </label>
                <div className="cp-input-icon">
                  <Phone size={16} aria-hidden="true" />
                  <input
                    id="apply-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+256700000000"
                    className="form-input"
                    value={formData.phone}
                    onChange={update('phone')}
                  />
                </div>
              </div>
            </div>

            <div className="cp-form-grid cp-form-grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="apply-role">
                  Intended role *
                </label>
                <select
                  id="apply-role"
                  required
                  className="form-select"
                  value={formData.role}
                  onChange={update('role')}
                >
                  <option value="">Select a role…</option>
                  {STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <p style={{ fontSize: '0.78rem', color: 'var(--slate-500)', marginTop: '0.3rem' }}>
                  A professional designation does not automatically grant system permissions. An administrator assigns roles.
                </p>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="apply-dept">
                  Intended department *
                </label>
                <select
                  id="apply-dept"
                  required
                  className="form-select"
                  value={formData.department}
                  onChange={update('department')}
                >
                  <option value="">Select a department…</option>
                  {STAFF_DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="cp-form-grid cp-form-grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="apply-desig">
                  Professional designation
                </label>
                <input
                  id="apply-desig"
                  type="text"
                  autoComplete="organization-title"
                  placeholder="e.g. Medical Officer, Senior Nurse"
                  className="form-input"
                  value={formData.professional_designation}
                  onChange={update('professional_designation')}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="apply-reg">
                  Professional registration number
                </label>
                <input
                  id="apply-reg"
                  type="text"
                  autoComplete="off"
                  placeholder="Where applicable"
                  className="form-input"
                  value={formData.professional_reg}
                  onChange={update('professional_reg')}
                />
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--slate-600)', background: 'var(--primary-50)', border: '1px solid var(--primary-100)', borderRadius: '8px', padding: '0.6rem 0.9rem', marginBottom: '1rem' }}>
              After you submit, an administrator will review your application. If approved, you will be contacted to complete account activation and set up secure access.
            </p>

            <button type="submit" className="cp-btn cp-btn-primary cp-btn-lg cp-btn-block" disabled={submitting}>
              {submitting ? (
                <>Submitting application…</>
              ) : (
                <>Submit Application <ArrowRight size={18} /></>
              )}
            </button>
          </form>

          <p className="cp-auth-switch" style={{ marginTop: '1rem' }}>
            Already invited by an administrator?{' '}
            <button type="button" className="cp-link" onClick={() => window.location.href = '/staff/register'}>
              Accept your invitation
            </button>
          </p>

          <p className="cp-auth-switch" style={{ marginTop: '0.5rem' }}>
            Have a staff account already?{' '}
            <button type="button" className="cp-link" onClick={() => window.location.href = '/staff/login'}>
              Sign in
            </button>
          </p>
        </div>
      </main>
    </div>
  );
};
