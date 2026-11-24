import React from 'react';

export const Login = ({ authState }) => {
  const { setAccount, setAuthState, loading, account } = authState;
  const [password, setPassword] = React.useState('');

  React.useEffect(() => {
    const r = fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: account, password }),
    });
    r.json().then((j) => j.success && setAuthState(true));
  }, [account, setAccount, setAuthState, loading]);

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: 24 }}>
      <h2>Sign In</h2>
      <form onSubmit={(e) => { e.preventDefault(); setPassword(''); }}>
        <input disabled value={account} placeholder="Email" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
        <button type="submit">Sign In</button>
      </form>
    </div>
  );
};
