import React from 'react';

// Dev/QA-only shadow CMS surface. It calls the real same-origin /api/* backend
// instead of simulating success. Account creation requires a password; a random
// one is generated for convenience in dev only.

export const ClientApp = () => {
  const [email, setEmail] = React.useState('');
  const [status, setStatus] = React.useState('Please sign in.');
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      setStatus('Enter an email address.');
      return;
    }
    setLoading(true);
    setStatus('Creating account…');
    try {
      const password = 'DevPass-' + Math.random().toString(36).slice(2, 8);
      const reg = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: email.split('@')[0], email, password, passwordConfirmation: password }),
      });
      const j = await reg.json();
      if (!reg.ok || !j.success) {
        setStatus((j.message && typeof j.message === 'string' ? j.message : 'Registration failed') || 'Registration failed.');
        return;
      }
      setStatus('Account created. Signing in…');
      const tok = j.data?.token;
      if (!tok) {
        setStatus('Registration succeeded but no token was returned.');
        return;
      }
      localStorage.setItem('fidus_token', tok);
      setStatus('Signed in as ' + j.data?.email);
    } catch (err) {
      setStatus((err && typeof err === 'object' && err.message ? err.message : 'Network error.') || 'Network error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: 24 }}>
      <h2>Fidus CMS (dev shadow)</h2>
      <form onSubmit={handleSubmit}>
        <label>Email <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
        <button type="submit" disabled={loading}>{loading ? 'Working…' : 'Sign Up & In'}</button>
        <p style={{ marginTop: 12, color: '#475569' }}>{status}</p>
      </form>
    </div>
  );
};
