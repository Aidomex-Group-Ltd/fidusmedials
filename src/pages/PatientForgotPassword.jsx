import React, { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { authService } from '../services/api';
import { ArrowLeft, ArrowRight, Mail, Phone } from 'lucide-react';

export const PatientForgotPassword = ({ onNavigateLogin, onNavigateHome }) => {
  const toast = useToast();
  const [identifier, setIdentifier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identifier) return toast.warning('Please enter your email or phone number.');
    const isEmail = identifier.includes('@');
    if (isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) return toast.warning('Please enter a valid email address.');
    if (!isEmail) return toast.warning('Password reset links are sent by email. Please enter the email address on your account, or contact support for phone-based assistance.');
    try {
      setSubmitting(true);
      const res = await authService.forgotPassword(identifier.trim().toLowerCase());
      setSent(true);
      toast.success(res?.message || 'If an account matches that email, reset instructions have been sent.');
    } catch (err) {
      toast.error(err.message || 'Reset request failed');
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
              <Mail size={18} />
            </span>
            Fidus Medical Center
          </span>
          <p className="cp-auth-tagline">Reset your password and get back to your health records.</p>
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
          <h1 className="cp-auth-title" style={{ marginTop: '0.75rem' }}>Forgot your password?</h1>
          <p className="cp-auth-sub">
            Enter the email or phone number on your patient account. We will send you a secure way to reset your password.
          </p>

          {sent ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', background: 'var(--success-100)', marginBottom: '1rem' }}>
                <ArrowRight size={28} style={{ color: 'var(--success-700)' }} />
              </div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '0.5rem' }}>Check your contact</h2>
              <p style={{ color: 'var(--slate-600)', fontSize: '0.95rem', lineHeight: '1.6', maxWidth: '320px', margin: '0 auto 1.5rem' }}>
                If an account matches “{identifier}”, we have sent password-reset instructions to that email or phone.
              </p>
              <button type="button" className="cp-btn cp-btn-outline" onClick={() => setSent(false)}>
                Try a different contact
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="pat-fp-identifier">
                  Email or phone number on your account *
                </label>
                <div className="cp-input-icon">
                  <Mail size={16} aria-hidden="true" />
                  <input
                    id="pat-fp-identifier"
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

              <button type="submit" className="cp-btn cp-btn-primary cp-btn-lg cp-btn-block" disabled={submitting}>
                {submitting ? 'Sending…' : 'Send reset instructions'}
              </button>
            </form>
          )}

          <p className="cp-auth-switch" style={{ marginTop: '1.5rem' }}>
            Remember your password?{' '}
            <button type="button" className="cp-link" onClick={onNavigateLogin}>
              Sign in
            </button>
          </p>
        </div>
      </main>
    </div>
  );
};
