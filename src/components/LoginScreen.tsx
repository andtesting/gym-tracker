import { useState } from 'react';
import { signIn, signUp, resetPassword } from '../hooks/useAuth';

type Mode = 'signin' | 'signup' | 'forgot';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('signin');
  const [resetSent, setResetSent] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setResetSent(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else if (mode === 'signup') {
        await signUp(email, password);
      } else {
        await resetPassword(email);
        setResetSent(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="app"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        minHeight: '80dvh',
      }}
    >
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

        {mode !== 'forgot' && (
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
          />
        )}

        {mode === 'signin' && (
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: '0.85rem', padding: 0, textAlign: 'right' }}
            onClick={() => switchMode('forgot')}
          >
            Forgot password?
          </button>
        )}

        {error && (
          <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>{error}</p>
        )}

        {resetSent && (
          <p style={{ color: 'green', fontSize: '0.875rem' }}>
            Check your email for a reset link.
          </p>
        )}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading
            ? '...'
            : mode === 'signin'
              ? 'Sign In'
              : mode === 'signup'
                ? 'Create Account'
                : 'Send Reset Link'}
        </button>

        {mode === 'forgot' ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => switchMode('signin')}
          >
            Back to sign in
          </button>
        ) : (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
          >
            {mode === 'signin'
              ? 'Need an account? Sign up'
              : 'Already have an account? Sign in'}
          </button>
        )}
      </form>
    </div>
  );
}
