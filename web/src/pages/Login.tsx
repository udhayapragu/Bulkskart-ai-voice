import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/useData';
import { Button, Notice } from '../components/ui';

export function LoginPage() {
  const { email, signIn } = useAuth();
  const navigate = useNavigate();
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (email) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(address, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setPassword('');
    }
  };

  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit} aria-labelledby="login-title">
        <div className="brand" style={{ padding: 0, marginBottom: 18 }}>
          <span className="brand-mark" aria-hidden="true">B</span>
          <span>Bulkskart AI Voice Sales</span>
        </div>
        <h1 id="login-title">Admin sign in</h1>
        <p className="muted" style={{ marginBottom: 18 }}>Restricted to Bulkskart administrators.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" required value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
    </div>
  );
}
