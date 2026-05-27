import { useState } from 'react';
import { updatePassword, signOut } from '../hooks/useAuth';

interface Props {
  onComplete: () => void;
}

export default function ResetPasswordScreen({ onComplete }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await updatePassword(password);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password.');
    } finally {
      setBusy(false);
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
      <h1 style={{ textAlign: 'center', marginBottom: '1rem' }}>Set a new password</h1>
      <p className="text-muted text-small text-center mb-16">
        You followed a password reset link. Choose a new password to continue.
      </p>
      <form onSubmit={handleSubmit} className="stack">
        <input
          type="password"
          placeholder="New password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={6}
          autoFocus
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
          minLength={6}
        />
        {error && (
          <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>{error}</p>
        )}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? '...' : 'Set Password'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => signOut()}
          disabled={busy}
        >
          Cancel and sign out
        </button>
      </form>
    </div>
  );
}
