import { useState } from 'react';
import { signIn, signUp } from '../hooks/useAuth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '80dvh' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>Gym Tracker</h1>
      <form onSubmit={handleSubmit} className="stack">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          required
          minLength={6}
        />
        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>{error}</p>}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? '...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
        >
          {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
