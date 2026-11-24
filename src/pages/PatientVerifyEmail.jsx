import React, { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { authService } from '../services/api';
import { ArrowLeft, CheckCircle, AlertCircle, Mail, RefreshCw } from 'lucide-react';

export const PatientVerifyEmail = ({ onNavigateLogin, onNavigateHome }) => {
  const toast = useToast();
  const token = (() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || '';
  })();

  const [submitting, setSubmitting] = useState(false);
  const [verified, setVerified] = useState(false);
  const [failed, setFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setFailed(true);
      setErrorMessage('This verification link is missing.');
    }
  }, [token]);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!token) return;

    try {
      setSubmitting(true);
      const result = await authService.verifyEmail(token);
      if (result?.success) {
        setVerified(true);
        toast.success(result?.message || 'Your email has been verified.');
      } else {
        setFailed(true);
        setErrorMessage(result?.message || 'This verification link is invalid or expired.');
        toast.error(result?.message || 'Verification failed.');
      }
    } catch (err) {
      setFailed(true);
      setErrorMessage(err.message || 'Verification failed.');
      toast.error(err.message || 'Verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    // Resend uses the email from the URL if present, otherwise we ask the user.
    // For simplicity, link to the resend-verification flow from the forgot-password page.
    if (onNavigateHome) {
      window.location.href = '/patient/forgot-password';
    }
  };

  if (verified) {
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
            <p className="cp-auth-tagline">Your email has been verified.</p>
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
            <h2 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '0.5rem' }}>Email verified</h2>
            <p style={{ color: 'var(--slate-600)', fontSize: '0.95rem', lineHeight: '1.6', maxWidth: '320px', margin: '0 auto 1.5rem' }}>
              Your email address has been verified. You can now sign in to your patient account.
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
              <Mail size={18} />
            </span>
            Fidus Medical Center
          </span>
          <p className="cp-auth-tagline">Confirm your email to activate your account.</p>
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
          <h1 className="cp-auth-title" style={{ marginTop: '0.75rem' }}>Verify your email</h1>
          <p className="cp-auth-sub">
            Click the button below to confirm your email address. This link expires in 24 hours.
          </p>

          {failed && (
            <div style={{ padding: '0.75rem', background: 'var(--error-50)', border: '1px solid var(--error-200)', borderRadius: '10px', color: 'var(--error-800)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              <AlertCircle size={16} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
              {errorMessage || 'This verification link is invalid or expired.'}
            </div>
          )}

          <form onSubmit={handleVerify} noValidate>
            <button
              type="submit"
              className="cp-btn cp-btn-primary cp-btn-lg cp-btn-block"
              disabled={submitting || !!verified}
            >
              {submitting ? 'Verifying…' : 'Verify email address'}
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <button type="button" className="cp-link" onClick={handleResend}>
              <RefreshCw size={14} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />
              Resend verification email
            </button>
          </div>

          <p className="cp-auth-switch" style={{ marginTop: '1.5rem' }}>
            Already verified?{' '}
            <button type="button" className="cp-link" onClick={onNavigateLogin}>
              Sign in
            </button>
          </p>
        </div>
      </main>
    </div>
  );
};
