import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ArrowLeft, ArrowRight, Lock, Mail } from 'lucide-react';

export const StaffLogin = ({ onNavigateHome }) => {
  const { staffLogin } = useAuth();
  const toast = useToast();

  const [email, setEmail] = useState(
    () => new URLSearchParams(window.location.search).get('email') || '',
  );
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [wrongPortal, setWrongPortal] = useState(false);

  const busy = submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      return toast.warning('Please enter your email and password');
    }

    try {
      setSubmitting(true);
      await staffLogin(email, password);
      toast.success('Welcome to the Fidus staff portal.');
    } catch (err) {
      // A patient account must use the patient form. Point them there rather
      // than leaving them with a bare 401 on the staff page.
      if (err.code === 'PATIENT_USE_PATIENT_LOGIN') {
        setWrongPortal(true);
        toast.info('That email belongs to a patient account. Continue to the patient sign-in page.');
        return;
      }
      toast.error(err.message || 'Staff sign-in failed. Check your credentials.');
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
              <Lock size={18} />
            </span>
            Fidus Medical Center
          </span>
          <p className="cp-auth-tagline">Secure access for Fidus Medical Center staff and authorized personnel.</p>
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
          <h1 className="cp-auth-title" style={{ marginTop: '0.75rem' }}>Staff sign in</h1>
          <p className="cp-auth-sub">
            Staff registration is restricted to authorized Fidus Medical Center personnel. A staff account must be verified and approved before access to staff systems is granted.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="staff-login-email">
                Email address
              </label>
              <div className="cp-input-icon">
                <Mail size={16} aria-hidden="true" />
                <input
                  id="staff-login-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@fidusmedicals.space"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="staff-login-password">
                Password
              </label>
              <div className="cp-input-icon">
                <Lock size={16} aria-hidden="true" />
                <input
                  id="staff-login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Your staff password"
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
                <>Staff Login <ArrowRight size={18} /></>
              )}
            </button>
          </form>

          {wrongPortal && (
            <div className="cp-auth-switch" style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--warning-50)', border: '1px solid var(--warning-200)', borderRadius: '10px', color: 'var(--warning-800)', fontSize: '0.9rem' }}>
              <strong>This is a patient account.</strong> Patient records are accessed from the patient portal.{' '}
              <button
                type="button"
                className="cp-link"
                onClick={() => {
                  window.location.href = `/login?email=${encodeURIComponent(email)}`;
                }}
              >
                Continue to Patient Sign in
              </button>
              .
            </div>
          )}

          <p className="cp-auth-switch">
            New to the staff portal?{' '}
            <button type="button" className="cp-link" onClick={() => window.location.href = '/staff/register'}>
              Register or accept an invitation
            </button>
          </p>

          <p className="cp-auth-switch">
            Apply for a staff account?{' '}
            <button type="button" className="cp-link" onClick={() => window.location.href = '/staff/apply'}>
              Submit a staff application
            </button>
          </p>

          <p className="cp-auth-switch" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
            Forgot your password?{' '}
            <button type="button" className="cp-link" onClick={() => window.location.href = '/staff/forgot-password'}>
              Reset it
            </button>
          </p>

          <p className="cp-auth-switch">
            Looking for your health records?{' '}
            <button type="button" className="cp-link" onClick={() => window.location.href = '/login'}>
              Patient sign in
            </button>
          </p>
        </div>
      </main>
    </div>
  );
};
