import { useState, useEffect } from 'react';
import type { Screen } from './types';
import { isSupabaseConfigured } from './supabase';
import { useAuth } from './hooks/useAuth';
import { loadActiveWorkout, clearActiveWorkout, validatePersistedSession } from './lib/sessionPersistence';
import LoginScreen from './components/LoginScreen';
import ResetPasswordScreen from './components/ResetPasswordScreen';
import HomeScreen from './components/HomeScreen';
import SessionDetail from './components/SessionDetail';
import PickRoutineScreen from './components/PickRoutineScreen';
import ActiveWorkout from './components/ActiveWorkout';
import EditModeScreen from './components/EditModeScreen';
import TrendsView from './components/TrendsView';
import LogPastWorkoutScreen from './components/LogPastWorkoutScreen';

function SetupScreen() {
  return (
    <div className="app" style={{ padding: '2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Gym Tracker</h1>
      <p style={{ color: 'var(--color-muted)', marginBottom: '1.5rem' }}>
        Supabase is not configured yet.
      </p>
      <div style={{ textAlign: 'left', background: 'var(--color-surface)', padding: '1rem', borderRadius: '8px', fontSize: '0.9rem' }}>
        <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>To get started:</p>
        <ol style={{ paddingLeft: '1.2rem', lineHeight: 1.8 }}>
          <li>Create a project at supabase.com</li>
          <li>Run <code>sql/schema.sql</code> in the SQL Editor</li>
          <li>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your environment</li>
          <li>Rebuild and redeploy</li>
        </ol>
      </div>
    </div>
  );
}

const loadingScreen = <div className="app text-center text-muted mt-16">Loading...</div>;

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [resumeChecked, setResumeChecked] = useState(false);
  const { session, loading, recovery, clearRecovery } = useAuth();

  useEffect(() => {
    if (loading || !session || resumeChecked) return;
    const persisted = loadActiveWorkout();
    if (!persisted) {
      setResumeChecked(true);
      return;
    }
    validatePersistedSession(persisted.sessionId).then(valid => {
      if (valid) {
        setScreen({
          name: 'activeWorkout',
          sessionId: persisted.sessionId,
          routineId: persisted.routineId,
          routineName: persisted.routineName,
        });
      } else {
        clearActiveWorkout();
      }
      setResumeChecked(true);
    });
  }, [loading, session, resumeChecked]);

  if (!isSupabaseConfigured) return <SetupScreen />;
  if (loading) return loadingScreen;
  // A recovery-link session must set a new password before reaching the app,
  // so the link can't be used as a silent passwordless login.
  if (session && recovery) return <ResetPasswordScreen onComplete={clearRecovery} />;
  if (!session) return <LoginScreen />;
  if (!resumeChecked) return loadingScreen;

  return (
    <div className="app">
      {screen.name === 'home' && (
        <HomeScreen onNavigate={setScreen} />
      )}
      {screen.name === 'sessionDetail' && (
        <SessionDetail
          sessionId={screen.sessionId}
          onBack={() => setScreen({ name: 'home' })}
        />
      )}
      {screen.name === 'pickRoutine' && (
        <PickRoutineScreen onNavigate={setScreen} />
      )}
      {screen.name === 'activeWorkout' && (
        <ActiveWorkout
          sessionId={screen.sessionId}
          routineId={screen.routineId}
          routineName={screen.routineName}
          onFinish={() => setScreen({ name: 'home' })}
          onHome={() => setScreen({ name: 'home' })}
        />
      )}
      {screen.name === 'editMode' && (
        <EditModeScreen onBack={() => setScreen({ name: 'home' })} />
      )}
      {screen.name === 'trends' && (
        <TrendsView onBack={() => setScreen({ name: 'home' })} />
      )}
      {screen.name === 'logPastWorkout' && (
        <LogPastWorkoutScreen onNavigate={setScreen} initialDate={screen.date} />
      )}
      {screen.name === 'retroactiveWorkout' && (
        <ActiveWorkout
          sessionId={screen.sessionId}
          routineId={screen.routineId}
          routineName={screen.routineName}
          retroactive
          retroactiveDate={screen.date}
          onFinish={() => setScreen({ name: 'home' })}
          onHome={() => setScreen({ name: 'home' })}
        />
      )}
    </div>
  );
}
