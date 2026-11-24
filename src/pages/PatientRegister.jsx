import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ArrowLeft, ArrowRight, Calendar, Mail, Phone, Lock, User, Heart } from 'lucide-react';

const GENDERS = ['Male', 'Female', 'Other'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const PatientRegister = ({ onNavigateLogin, onNavigateHome }) => {
  const { register: registerPatient } = useAuth();
  const toast = useToast();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    sex: 'Female',
    bloodGroup: 'O+',
    password: '',
    passwordConfirmation: '',
    consent: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => setFormData({ ...formData, [field]: e.target.value });
  const updateCheck = (field) => (e) => setFormData({ ...formData, [field]: e.target.checked });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || (!formData.email && !formData.phone)) {
      return toast.warning('Please enter your name and either an email or a phone number.');
    }
    if (!formData.email && !formData.phone) {
      return toast.warning('Please provide at least one way to contact you: email or phone.');
    }
    if (!formData.password || formData.password.length < 6) {
      return toast.warning('Password must be at least 6 characters.');
    }
    if (formData.password !== formData.passwordConfirmation) {
      return toast.warning('Passwords do not match.');
    }
    if (!formData.consent) {
      return toast.warning('Please confirm you accept the portal terms and privacy policy.');
    }

    try {
      setSubmitting(true);
      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase() || undefined,
        phone: formData.phone.trim() || undefined,
        dateOfBirth: formData.dateOfBirth || undefined,
        sex: formData.sex || undefined,
        bloodGroup: formData.bloodGroup || undefined,
        password: formData.password,
        passwordConfirmation: formData.passwordConfirmation,
      };
      await registerPatient(payload);
      toast.success('Account created! Signing you in…');
    } catch (err) {
      toast.error(err.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cp-auth">
      <aside className="cp-auth-media">
        <img src="/images/care-team.webp" alt="Doctor and nurse reviewing patient details together" />
        <div className="cp-auth-overlay" />
        <div className="cp-auth-media-copy">
          <span className="cp-logo cp-logo-light">
            <span className="cp-logo-mark">
              <Heart size={18} />
            </span>
            Fidus Medical Center
          </span>
          <p className="cp-auth-tagline">Create your patient account and take control of your health journey.</p>
        </div>
      </aside>

      <main className="cp-auth-panel">
        <div className="cp-auth-form-wrap">
          {onNavigateHome && (
            <button type="button" className="cp-back-link" onClick={onNavigateHome}>
              <ArrowLeft size={16} /> Back to home
            </button>
          )}

          <span className="cp-eyebrow">Patient Portal</span>
          <h1 className="cp-auth-title" style={{ marginTop: '0.75rem' }}>Create a patient account</h1>
          <p className="cp-auth-sub">Book appointments, view prescriptions and keep your records in one place.</p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="pat-reg-name">
                Full name *
              </label>
              <div className="cp-input-icon">
                <User size={16} aria-hidden="true" />
                <input
                  id="pat-reg-name"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Jane Nakato"
                  className="form-input"
                  value={formData.name}
                  onChange={update('name')}
                />
              </div>
            </div>

            <div className="cp-form-grid cp-form-grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="pat-reg-email">
                  Email address
                </label>
                <div className="cp-input-icon">
                  <Mail size={16} aria-hidden="true" />
                  <input
                    id="pat-reg-email"
                    type="email"
                    autoComplete="email"
                    placeholder="jane@example.com"
                    className="form-input"
                    value={formData.email}
                    onChange={update('email')}
                  />
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--slate-500)', marginTop: '0.3rem' }}>
                  Optional if you provide a phone number.
                </p>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="pat-reg-phone">
                  Phone number
                </label>
                <div className="cp-input-icon">
                  <Phone size={16} aria-hidden="true" />
                  <input
                    id="pat-reg-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+256700000000"
                    className="form-input"
                    value={formData.phone}
                    onChange={update('phone')}
                  />
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--slate-500)', marginTop: '0.3rem' }}>
                  Ugandan numbers supported. Required if no email.
                </p>
              </div>
            </div>

            <div className="cp-form-grid cp-form-grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="pat-reg-dob">
                  Date of birth
                </label>
                <div className="cp-input-icon">
                  <Calendar size={16} aria-hidden="true" />
                  <input
                    id="pat-reg-dob"
                    type="date"
                    className="form-input"
                    value={formData.dateOfBirth}
                    onChange={update('dateOfBirth')}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="pat-reg-sex">
                  Sex
                </label>
                <select
                  id="pat-reg-sex"
                  className="form-select"
                  value={formData.sex}
                  onChange={update('sex')}
                >
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="pat-reg-blood">
                Blood group (optional)
              </label>
              <select
                id="pat-reg-blood"
                className="form-select"
                value={formData.bloodGroup}
                onChange={update('bloodGroup')}
              >
                {BLOOD_GROUPS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="pat-reg-password">
                Password * (min 6 characters)
              </label>
              <div className="cp-input-icon">
                <Lock size={16} aria-hidden="true" />
                <input
                  id="pat-reg-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength="6"
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  className="form-input cp-has-toggle"
                  value={formData.password}
                  onChange={update('password')}
                />
                <button
                  type="button"
                  className="cp-pw-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <ArrowRight size={16} /> : <Lock size={16} />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="pat-reg-confirm">
                Confirm password *
              </label>
              <div className="cp-input-icon">
                <Lock size={16} aria-hidden="true" />
                <input
                  id="pat-reg-confirm"
                  type={showConfirm ? 'text' : 'password'}
                  required
                  minLength="6"
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  className="form-input cp-has-toggle"
                  value={formData.passwordConfirmation}
                  onChange={update('passwordConfirmation')}
                />
                <button
                  type="button"
                  className="cp-pw-toggle"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <ArrowRight size={16} /> : <Lock size={16} />}
                </button>
              </div>
            </div>

            <label className="cp-checkbox" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.consent}
                onChange={updateCheck('consent')}
                style={{ marginTop: '0.2rem', width: '1rem', height: '1rem', accentColor: 'var(--primary-600)' }}
              />
              <span style={{ fontSize: '0.88rem', color: 'var(--slate-600)', lineHeight: '1.5' }}>
                I agree to the portal terms and privacy policy and consent to my information being used to provide my care.
              </span>
            </label>

            <button type="submit" className="cp-btn cp-btn-primary cp-btn-lg cp-btn-block" disabled={submitting} style={{ marginTop: '1.25rem' }}>
              {submitting ? (
                <>Creating account…</>
              ) : (
                <>Create Patient Account <ArrowRight size={18} /></>
              )}
            </button>
          </form>

          <p className="cp-auth-switch">
            Already have an account?{' '}
            <button type="button" className="cp-link" onClick={onNavigateLogin}>
              Sign in
            </button>
          </p>
        </div>
      </main>
    </div>
  );
};
