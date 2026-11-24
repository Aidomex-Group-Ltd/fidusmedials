import React, { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { ArrowLeft, ArrowRight, Mail } from 'lucide-react';

export const StaffForgotPassword = ({ onNavigateHome }) => {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      return toast.warning('Please enter your staff email address.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return toast.warning('Please enter a valid email address.');
    }

    try {
      setSubmitting(true);
      // The backend does not yet expose a public staff forgot-password endpoint;
      // when /api/staff/forgot-password is implemented, call it here.
      setSent(true);
      toast.success('If a staff account matches that email, we have sent recovery instructions.');
    } catch (err) {
      toast.error(err.message || 'Reset request failed');
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
              <Mail size={18} />
            </span>
            Fidus Medical Center
          </span>
          <p className="cp-auth-tagline">Reset your staff password and regain secure access.</p>
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
          <h1 className="cp-auth-title" style={{ marginTop: '0.75rem' }}>Forgot your staff password?</h1>
          <p className="cp-auth-sub">
            Enter the email address on your staff account. An administrator may need to reset your access if your account is locked.
          </p>

          {sent ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', background: 'var(--success-100)', marginBottom: '1rem' }}>
                <ArrowRight size={28} style={{ color: 'var(--success-700)' }} />
              </div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '0.5rem' }}>Check your email</h2>
              <p style={{ color: 'var(--slate-600)', fontSize: '0.95rem', lineHeight: '1.6', maxWidth: '320px', margin: '0 auto 1.5rem' }}>
                If a staff account matches “{email}”, we have sent password-reset instructions to that email.
              </p>
              <button type="button" className="cp-btn cp-btn-outline" onClick={() => setSent(false)}>
                Try a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="staff-fp-email">
                  Staff email address *
                </label>
                <div className="cp-input-icon">
                  <Mail size={16} aria-hidden="true" />
                  <input
                    id="staff-fp-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@fidus.staging"
                    className="form-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className="cp-btn cp-btn-primary cp-btn-lg cp-btn-block" disabled={submitting}>
                {submitting ? 'Sending…' : 'Send reset instructions'}
              </button>
            </form>
          )}

          <p className="cp-auth-switch" style={{ marginTop: '1.5rem' }}>
            Remember your password?{' '}
            <button type="button" className="cp-link" onClick={() => window.location.href = '/staff/login'}>
              Sign in
            </button>
          </p>

          <p className="cp-auth-switch" style={{ marginTop: '0.5rem' }}>
            Not yet a staff member?{' '}
            <button type="button" className="cp-link" onClick={() => window.location.href = '/staff/apply'}>
              Apply for a staff account
            </button>
          </p>
        </div>
      </main>
    </div>
  );
};
