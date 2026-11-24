import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ArrowLeft, ArrowRight, Lock, Mail, Phone, UserRound } from 'lucide-react';

export const PatientLogin = ({ onNavigateRegister, onNavigateHome }) => {
  const { login, user } = useAuth();
  const toast = useToast();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const busy = submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identifier || !password) {
      return toast.warning('Please enter your email or phone and password');
    }

    try {
      setSubmitting(true);
      // Patient login: accepts email or phone as the identifier.
      await login(identifier, password);
      toast.success('Welcome back to Fidus!');
    } catch (err) {
      toast.error(err.message || 'Login failed. Check your credentials.');
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
              <UserRound size={18} />
            </span>
            Fidus Medical Center
          </span>
          <p className="cp-auth-tagline">Your health records, appointments and prescriptions — all in one place.</p>
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
          <h1 className="cp-auth-title" style={{ marginTop: '0.75rem' }}>Patient sign in</h1>
          <p className="cp-auth-sub">Access your personal health records, appointments and prescriptions.</p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="patient-login-identifier">
                Email or phone number
              </label>
              <div className="cp-input-icon">
                <Mail size={16} aria-hidden="true" />
                <input
                  id="patient-login-identifier"
                  type="text"
                  required
                  autoComplete="username"
                  placeholder="you@example.com or +256700000000"
                  className="form-input"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="patient-login-password">
                Password
              </label>
              <div className="cp-input-icon">
                <Lock size={16} aria-hidden="true" />
                <input
                  id="patient-login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Your password"
                  className="form-input cp-has-toggle"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

            <button type="submit" className="cp-btn cp-btn-primary cp-btn-lg cp-btn-block" disabled={busy}>
              {submitting ? (
                <>Signing in…</>
              ) : (
                <>Sign in <ArrowRight size={18} /></>
              )}
            </button>
          </form>

          <p className="cp-auth-switch">
            New patient?{' '}
            <button type="button" className="cp-link" onClick={onNavigateRegister}>
              Create a patient account
            </button>
          </p>

          <p className="cp-auth-switch" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
            Forgot your password?{' '}
            <button type="button" className="cp-link" onClick={() => window.location.href = '/patient/forgot-password'}>
              Reset it
            </button>
          </p>

          {user && user.role !== 'Patient' && (
            <div className="cp-auth-switch" style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--warning-50)', border: '1px solid var(--warning-200)', borderRadius: '10px', color: 'var(--warning-800)', fontSize: '0.9rem' }}>
              <strong>Not the right portal?</strong> You appear to be signed in as a staff member.{' '}
              <button type="button" className="cp-link" onClick={onNavigateHome}>
                Go to the staff login
              </button>
              .
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
