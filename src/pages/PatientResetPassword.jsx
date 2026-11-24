import React, { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { authService } from '../services/api';
import { ArrowLeft, ArrowRight, Lock, CheckCircle } from 'lucide-react';

export const PatientResetPassword = ({ onNavigateLogin, onNavigateHome }) => {
  const toast = useToast();

  const token = (() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || '';
  })();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tokenInvalid, setTokenInvalid] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenInvalid(true);
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) return;
    if (password.length < 6) {
      return toast.warning('Password must be at least 6 characters.');
    }
    if (password !== confirm) {
      return toast.warning('Passwords do not match.');
    }

    try {
      setSubmitting(true);
      const result = await authService.resetPassword({ token, password, passwordConfirmation: confirm });
      setDone(true);
      toast.success(result?.message || 'Your password has been reset.');
    } catch (err) {
      setTokenInvalid(true);
      toast.error(err.message || 'Password reset failed. The link may be invalid or expired.');
    } finally {
      setSubmitting(false);
    }
  };

  if (tokenInvalid || !token) {
    return (
      <div className="cp-auth">
        <aside className="cp-auth-media">
          <img src="/images/care-team.webp" alt="Doctor and nurse reviewing patient details together" />
          <div className="cp-auth-overlay" />
          <div className="cp-auth-media-copy">
            <span className="cp-logo cp-logo-light">
              <span className="cp-logo-mark">
                <Lock size={18} />
              </span>
              Fidus Medical Center
            </span>
            <p className="cp-auth-tagline">This reset link is invalid or expired.</p>
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
            <h1 className="cp-auth-title" style={{ marginTop: '0.75rem' }}>Reset link expired</h1>
            <p className="cp-auth-sub">
              This password-reset link is no longer valid. Request a new one from the forgot-password page.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" className="cp-btn cp-btn-outline" onClick={() => (window.location.href = '/patient/forgot-password')}>
                Request a new reset link
              </button>
              {onNavigateLogin && (
                <button type="button" className="cp-btn cp-btn-primary" onClick={onNavigateLogin}>
                  Sign in instead <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (done) {
    return (
      <div className="cp-auth">
        <aside className="cp-auth-media">
          <img src="/images/care-team.webp" alt="Doctor and nurse reviewing patient details together" />
          <div className="cp-auth-overlay" />
          <div className="cp-auth-media-copy">
            <span className="cp-logo cp-logo-light">
              <span className="cp-logo-mark">
                <CheckCircle size={18} />
              </span>
              Fidus Medical Center
            </span>
            <p className="cp-auth-tagline">Your password has been reset.</p>
          </div>
        </aside>

        <main className="cp-auth-panel">
          <div className="cp-auth-form-wrap" style={{ textAlign: 'center', padding: '1rem 0' }}>
            {onNavigateHome && (
              <button type="button" className="cp-back-link" onClick={onNavigateHome}>
                <ArrowLeft size={16} /> Back to home
              </button>
            )}

            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', background: 'var(--success-100)', marginBottom: '1rem' }}>
              <CheckCircle size={28} style={{ color: 'var(--success-700)' }} />
            </div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '0.5rem' }}>Password reset</h2>
            <p style={{ color: 'var(--slate-600)', fontSize: '0.95rem', lineHeight: '1.6', maxWidth: '320px', margin: '0 auto 1.5rem' }}>
              Your password has been reset successfully. You can now sign in with your new password.
            </p>
            {onNavigateLogin && (
              <button type="button" className="cp-btn cp-btn-primary cp-btn-lg cp-btn-block" onClick={onNavigateLogin}>
                Sign in <ArrowRight size={16} />
              </button>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="cp-auth">
      <aside className="cp-auth-media">
        <img src="/images/care-team.webp" alt="Doctor and nurse reviewing patient details together" />
        <div className="cp-auth-overlay" />
        <div className="cp-auth-media-copy">
          <span className="cp-logo cp-logo-light">
            <span className="cp-logo-mark">
              <Lock size={18} />
            </span>
            Fidus Medical Center
          </span>
          <p className="cp-auth-tagline">Choose a new password for your patient account.</p>
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
          <h1 className="cp-auth-title" style={{ marginTop: '0.75rem' }}>Reset your password</h1>
          <p className="cp-auth-sub">
            Enter a new password for your account. This link expires in 1 hour.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="prp-password">
                New password *
              </label>
              <div className="cp-input-icon">
                <Lock size={16} aria-hidden="true" />
                <input
                  id="prp-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="prp-confirm">
                Confirm new password *
              </label>
              <div className="cp-input-icon">
                <Lock size={16} aria-hidden="true" />
                <input
                  id="prp-confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="Repeat your new password"
                  className="form-input"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
            </div>

            <button type="submit" className="cp-btn cp-btn-primary cp-btn-lg cp-btn-block" disabled={submitting}>
              {submitting ? 'Resetting…' : 'Reset password'}
            </button>
          </form>

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
